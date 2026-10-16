use crate::{model::*, repository::check_integrity};
use rusqlite::{backup::Backup, types::ValueRef, Connection};
use std::{io::Write, path::Path, time::Duration};
fn identifier(value: &str) -> String {
    format!("\"{}\"", value.replace('"', "\"\""))
}
fn write_hex(output: &mut impl Write, bytes: &[u8]) -> Result<()> {
    for chunk in bytes.chunks(32768) {
        output
            .write_all(hex::encode_upper(chunk).as_bytes())
            .map_err(err)?;
    }
    Ok(())
}
fn write_value(output: &mut impl Write, value: ValueRef<'_>) -> Result<()> {
    match value {
        ValueRef::Null => output.write_all(b"NULL").map_err(err)?,
        ValueRef::Integer(value) => write!(output, "{value}").map_err(err)?,
        ValueRef::Real(value) => {
            if value.is_infinite() {
                output
                    .write_all(if value.is_sign_positive() {
                        b"9e999"
                    } else {
                        b"-9e999"
                    })
                    .map_err(err)?;
            } else if value.is_nan() {
                return fail("SQLite returned a non-restorable NaN value.");
            } else {
                let mut text = value.to_string();
                if !text.contains('.') && !text.contains('e') && !text.contains('E') {
                    text.push_str(".0");
                }
                output.write_all(text.as_bytes()).map_err(err)?;
            }
        }
        ValueRef::Text(bytes) => {
            if let Ok(text) = std::str::from_utf8(bytes) {
                if !text.contains('\0') {
                    output.write_all(b"'").map_err(err)?;
                    // Stream escaping so very large text fields are not copied into a second string.
                    for (i, part) in text.split('\'').enumerate() {
                        if i > 0 {
                            output.write_all(b"''").map_err(err)?;
                        }
                        output.write_all(part.as_bytes()).map_err(err)?;
                    }
                    output.write_all(b"'").map_err(err)?;
                    return Ok(());
                }
            }
            output.write_all(b"CAST(X'").map_err(err)?;
            write_hex(output, bytes)?;
            output.write_all(b"' AS TEXT)").map_err(err)?;
        }
        ValueRef::Blob(bytes) => {
            output.write_all(b"X'").map_err(err)?;
            write_hex(output, bytes)?;
            output.write_all(b"'").map_err(err)?;
        }
    }
    Ok(())
}
/// A single deferred read transaction pins a WAL snapshot while editing can continue.
pub fn write_sql_dump(conn: &mut Connection, mut output: impl Write) -> Result<()> {
    let tx = conn.transaction().map_err(err)?;
    check_integrity(&tx)?;
    let version: i64 = tx
        .pragma_query_value(None, "user_version", |r| r.get(0))
        .map_err(err)?;
    let application: i64 = tx
        .pragma_query_value(None, "application_id", |r| r.get(0))
        .map_err(err)?;
    let schema: Vec<(String, String, String)> = {
        let mut s=tx.prepare("SELECT type,name,sql FROM sqlite_schema WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY CASE type WHEN 'table' THEN 0 WHEN 'index' THEN 1 WHEN 'view' THEN 2 ELSE 3 END,name").map_err(err)?;
        let rows = s
            .query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))
            .map_err(err)?;
        rows.collect::<std::result::Result<_, _>>().map_err(err)?
    };
    for (kind, name, sql) in &schema {
        if !["table", "index", "view", "trigger"].contains(&kind.as_str())
            || sql.to_uppercase().contains("CREATE VIRTUAL TABLE")
        {
            return Err(format!("SQL export does not support schema object {name}. No incomplete backup has been finalized."));
        }
    }
    writeln!(output,"-- Lotepad SQLite Backup\n-- Application: Lotepad\n-- Format: SQLite SQL Dump\n-- Exported at: {}\n-- Schema version: {version}\n-- Contains unencrypted notes and media.\nPRAGMA foreign_keys=OFF;\nBEGIN TRANSACTION;\nPRAGMA user_version={version};\nPRAGMA application_id={application};",chrono::Utc::now().to_rfc3339()).map_err(err)?;
    for (kind, _, sql) in &schema {
        if kind == "table" {
            writeln!(output, "{sql};").map_err(err)?;
        }
    }
    let mut tables: Vec<String> = schema
        .iter()
        .filter(|(kind, _, _)| kind == "table")
        .map(|(_, name, _)| name.clone())
        .collect();
    let has_sequence: bool = tx
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM sqlite_schema WHERE name='sqlite_sequence')",
            [],
            |r| r.get(0),
        )
        .map_err(err)?;
    if has_sequence {
        tables.push("sqlite_sequence".into());
    }
    for table in tables {
        if table == "sqlite_sequence" {
            output
                .write_all(b"DELETE FROM sqlite_sequence;\n")
                .map_err(err)?;
        }
        let columns: Vec<(String, i64)> = {
            let mut s = tx
                .prepare(&format!("PRAGMA table_xinfo({})", identifier(&table)))
                .map_err(err)?;
            let rows = s
                .query_map([], |r| Ok((r.get::<_, String>(1)?, r.get::<_, i64>(6)?)))
                .map_err(err)?;
            rows.collect::<std::result::Result<_, _>>().map_err(err)?
        };
        let writable: Vec<String> = columns
            .into_iter()
            .filter(|(_, hidden)| *hidden == 0)
            .map(|(name, _)| identifier(&name))
            .collect();
        if writable.is_empty() {
            return Err(format!(
                "Cannot export table {table}: it has no writable columns."
            ));
        }
        // All application tables have explicit primary keys; preserve rowid for keyless ordinary tables too.
        let primary: i64 = {
            let mut s = tx
                .prepare(&format!("PRAGMA table_info({})", identifier(&table)))
                .map_err(err)?;
            let values = s.query_map([], |r| r.get::<_, i64>(5)).map_err(err)?;
            values
                .collect::<std::result::Result<Vec<_>, _>>()
                .map_err(err)?
                .into_iter()
                .sum()
        };
        let rowid = primary == 0
            && table != "sqlite_sequence"
            && !writable.iter().any(|v| {
                ["\"rowid\"", "\"_rowid_\"", "\"oid\""].contains(&v.to_lowercase().as_str())
            });
        let mut columns = writable;
        if rowid {
            columns.insert(0, "rowid".into());
        }
        let names = columns.join(",");
        let mut statement = tx
            .prepare(&format!("SELECT {names} FROM {}", identifier(&table)))
            .map_err(err)?;
        let mut rows = statement.query([]).map_err(err)?;
        while let Some(row) = rows.next().map_err(err)? {
            write!(
                output,
                "INSERT INTO {} ({names}) VALUES(",
                identifier(&table)
            )
            .map_err(err)?;
            for i in 0..columns.len() {
                if i > 0 {
                    output.write_all(b",").map_err(err)?;
                }
                write_value(&mut output, row.get_ref(i).map_err(err)?)?;
            }
            output.write_all(b");\n").map_err(err)?;
        }
    }
    for (kind, _, sql) in &schema {
        if kind != "table" {
            writeln!(output, "{sql};").map_err(err)?;
        }
    }
    output.write_all(b"COMMIT;\nPRAGMA foreign_keys=ON;\nPRAGMA foreign_key_check;\nPRAGMA integrity_check;\n").map_err(err)?;
    output.flush().map_err(err)?;
    tx.commit().map_err(err)?;
    Ok(())
}
pub fn write_snapshot(source: &Connection, path: &Path) -> Result<()> {
    let mut destination = Connection::open(path).map_err(err)?;
    {
        let backup = Backup::new(source, &mut destination).map_err(err)?;
        backup
            .run_to_completion(128, Duration::from_millis(10), None)
            .map_err(err)?;
    }
    check_integrity(&destination)?;
    destination.close().map_err(|(_, e)| err(e))?;
    Ok(())
}
