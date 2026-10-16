use crate::model::*;
use base64::{engine::general_purpose::STANDARD, Engine};
use rusqlite::{params, Connection, OptionalExtension, TransactionBehavior};
use serde::Serialize;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{
    collections::HashSet,
    path::{Path, PathBuf},
    time::Duration,
};

pub struct Repository {
    pub conn: Connection,
    pub path: PathBuf,
}
pub fn json_value(value: impl Serialize) -> Result<Value> {
    serde_json::to_value(value).map_err(err)
}
fn text(value: impl Serialize) -> Result<String> {
    serde_json::to_string(&value).map_err(err)
}
pub fn hash(bytes: &[u8]) -> String {
    hex::encode(Sha256::digest(bytes))
}
pub fn configure(conn: &Connection) -> Result<()> {
    conn.busy_timeout(Duration::from_secs(5)).map_err(err)?;
    conn.pragma_update(None, "foreign_keys", "ON")
        .map_err(err)?;
    conn.pragma_update(None, "journal_mode", "WAL")
        .map_err(err)?;
    conn.pragma_update(None, "synchronous", "FULL")
        .map_err(err)?;
    Ok(())
}
pub fn check_integrity(conn: &Connection) -> Result<()> {
    let result: String = conn
        .query_row("PRAGMA integrity_check", [], |r| r.get(0))
        .map_err(err)?;
    if result != "ok" {
        return Err(format!("SQLite integrity check failed: {result}"));
    }
    let mut statement = conn.prepare("PRAGMA foreign_key_check").map_err(err)?;
    if statement
        .query([])
        .map_err(err)?
        .next()
        .map_err(err)?
        .is_some()
    {
        return fail("SQLite foreign-key check failed.");
    }
    Ok(())
}
impl Repository {
    pub fn open(path: impl AsRef<Path>) -> Result<Self> {
        let path = path.as_ref().to_owned();
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(err)?;
        }
        let mut conn = Connection::open(&path).map_err(err)?;
        configure(&conn)?;
        let version: i64 = conn
            .pragma_query_value(None, "user_version", |row| row.get(0))
            .map_err(err)?;
        if version > 1 {
            return fail("This database was created by a newer Lotepad. Update the application; the database has not been replaced.");
        }
        if version == 0 {
            let tables:i64=conn.query_row("SELECT count(*) FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%'",[],|r|r.get(0)).map_err(err)?;
            if tables != 0 {
                return fail("The database has an unrecognized schema. It has not been reset.");
            }
            let tx = conn
                .transaction_with_behavior(TransactionBehavior::Immediate)
                .map_err(err)?;
            tx.execute_batch(include_str!("../migrations/001_initial.sql"))
                .map_err(err)?;
            tx.commit().map_err(err)?;
        }
        let identifier: i64 = conn
            .pragma_query_value(None, "application_id", |r| r.get(0))
            .map_err(err)?;
        if identifier != 1280267333 {
            return fail("This file is not a Lotepad database.");
        }
        conn.execute("INSERT OR IGNORE INTO app_settings(key,value_json,updated_at) VALUES('settings',?1,?2)",params![text(default_settings())?,now()]).map_err(err)?;
        let quick: String = conn
            .query_row("PRAGMA quick_check", [], |r| r.get(0))
            .map_err(err)?;
        if quick != "ok" {
            return Err(format!("SQLite quick check failed: {quick}"));
        }
        Ok(Self { conn, path })
    }
    pub fn call(&mut self, request: Request) -> Result<Value> {
        match request {
            Request::Initialize => Ok(Value::Null),
            Request::ListNotebooks => json_value(list_books(&self.conn)?),
            Request::ListPages { notebook_id } => {
                json_value(list_pages(&self.conn, notebook_id.as_deref())?)
            }
            Request::GetNotebook { id } => json_value(get_book(&self.conn, &id)?),
            Request::GetPage { id } => json_value(get_page(&self.conn, &id)?),
            Request::Settings => {
                get_setting(&self.conn, "settings")?.ok_or("Settings are missing.".into())
            }
            Request::UpdateSettings { value } => {
                validate_settings(&value)?;
                put_setting(&self.conn, "settings", &value)?;
                Ok(Value::Null)
            }
            Request::GetMeta { key } => json_value(get_meta(&self.conn, &key)?),
            Request::SetMeta { key, value } => {
                put_meta(&self.conn, &key, &value)?;
                Ok(Value::Null)
            }
            Request::CompareMeta {
                key,
                expected,
                value,
            } => {
                let tx = self
                    .conn
                    .transaction_with_behavior(TransactionBehavior::Immediate)
                    .map_err(err)?;
                if get_meta(&tx, &key)? != expected {
                    return fail("Library settings changed in another window. Retry your change.");
                }
                put_meta(&tx, &key, &value)?;
                tx.commit().map_err(err)?;
                Ok(Value::Null)
            }
            Request::CreateNotebook { title, color, icon } => {
                let time = now();
                let book = Notebook {
                    id: uuid::Uuid::new_v4().to_string(),
                    title: if title.trim().is_empty() {
                        "Untitled notebook".into()
                    } else {
                        title.trim().into()
                    },
                    color,
                    icon,
                    favorite: false,
                    created_at: time,
                    updated_at: time,
                    deleted_at: None,
                    extra: Default::default(),
                };
                validate_book(&book)?;
                insert_book(&self.conn, &book)?;
                json_value(book)
            }
            Request::UpdateNotebook { id, updates } => {
                let mut book = get_book(&self.conn, &id)?.ok_or("Notebook not found.")?;
                if let Some(value) = updates.get("title") {
                    book.title = value.as_str().ok_or("Invalid title")?.trim().into();
                }
                if let Some(value) = updates.get("color") {
                    book.color = value.as_str().ok_or("Invalid color")?.into();
                }
                if let Some(value) = updates.get("icon") {
                    book.icon = value.as_str().ok_or("Invalid icon")?.into();
                }
                if let Some(value) = updates.get("favorite") {
                    book.favorite = value.as_bool().ok_or("Invalid favorite")?;
                }
                book.updated_at = now();
                validate_book(&book)?;
                update_book(&self.conn, &book)?;
                Ok(Value::Null)
            }
            Request::TrashNotebook { id } => {
                let mut book = get_book(&self.conn, &id)?.ok_or("Notebook not found.")?;
                book.deleted_at = Some(now());
                book.updated_at = now();
                update_book(&self.conn, &book)?;
                Ok(Value::Null)
            }
            Request::RestoreNotebook { id } => {
                let mut book = get_book(&self.conn, &id)?.ok_or("Notebook not found.")?;
                book.deleted_at = None;
                book.updated_at = now();
                update_book(&self.conn, &book)?;
                Ok(Value::Null)
            }
            Request::DeleteNotebook { id } => {
                let tx = self
                    .conn
                    .transaction_with_behavior(TransactionBehavior::Immediate)
                    .map_err(err)?;
                tx.execute("DELETE FROM notebooks WHERE id=?1", [id])
                    .map_err(err)?;
                collect_assets(&tx)?;
                tx.commit().map_err(err)?;
                Ok(Value::Null)
            }
            Request::CreatePage { mut page, content } => {
                validate_page(&page)?;
                if content.page_id != page.id {
                    return fail("Page and scene identifiers do not match.");
                }
                let tx = self
                    .conn
                    .transaction_with_behavior(TransactionBehavior::Immediate)
                    .map_err(err)?;
                page.sort_order = next_order(&tx, &page.notebook_id)?;
                insert_page(&tx, &page)?;
                write_content(&tx, &content, Some(0), None)?;
                touch_book(&tx, &page.notebook_id)?;
                tx.commit().map_err(err)?;
                json_value(page)
            }
            Request::UpdatePage { id, updates } => {
                let mut page = get_page(&self.conn, &id)?.ok_or("Page not found.")?;
                if let Some(value) = updates.get("title") {
                    page.title = value.as_str().ok_or("Invalid title")?.trim().into();
                }
                if let Some(value) = updates.get("deletedAt") {
                    page.deleted_at = if value.is_null() {
                        None
                    } else {
                        Some(value.as_i64().ok_or("Invalid deletion date")?)
                    };
                }
                if let Some(value) = updates.get("order") {
                    page.sort_order = value.as_i64().ok_or("Invalid order")?;
                }
                page.updated_at = now();
                validate_page(&page)?;
                update_page(&self.conn, &page)?;
                Ok(Value::Null)
            }
            Request::Opened { id } => {
                let mut page = get_page(&self.conn, &id)?.ok_or("Page not found.")?;
                page.last_opened_at = now();
                update_page(&self.conn, &page)?;
                Ok(Value::Null)
            }
            Request::LoadContent { id } => json_value(load_content(&self.conn, &id)?),
            Request::SaveContent {
                content,
                expected_revision,
                file_ids,
            } => {
                let tx = self
                    .conn
                    .transaction_with_behavior(TransactionBehavior::Immediate)
                    .map_err(err)?;
                let revision =
                    write_content(&tx, &content, Some(expected_revision), file_ids.as_deref())?;
                let mut page = get_page(&tx, &content.page_id)?.ok_or("Page no longer exists.")?;
                page.updated_at = now();
                update_page(&tx, &page)?;
                touch_book(&tx, &page.notebook_id)?;
                collect_assets(&tx)?;
                tx.commit().map_err(err)?;
                json_value(revision)
            }
            Request::DuplicatePage {
                id,
                target_notebook,
            } => {
                let tx = self
                    .conn
                    .transaction_with_behavior(TransactionBehavior::Immediate)
                    .map_err(err)?;
                let page = duplicate_page(&tx, &id, target_notebook.as_deref())?;
                tx.commit().map_err(err)?;
                json_value(page)
            }
            Request::DuplicateNotebook { id } => {
                let tx = self
                    .conn
                    .transaction_with_behavior(TransactionBehavior::Immediate)
                    .map_err(err)?;
                let mut book = get_book(&tx, &id)?.ok_or("Notebook not found.")?;
                book.id = uuid::Uuid::new_v4().to_string();
                book.title.push_str(" (copy)");
                book.favorite = false;
                book.deleted_at = None;
                book.created_at = now();
                book.updated_at = now();
                insert_book(&tx, &book)?;
                for page in list_pages(&tx, Some(&id))?
                    .into_iter()
                    .filter(|p| p.deleted_at.is_none())
                {
                    duplicate_page(&tx, &page.id, Some(&book.id))?;
                }
                tx.commit().map_err(err)?;
                json_value(book)
            }
            Request::Reorder { id, direction } => {
                if ![-1, 1].contains(&direction) {
                    return fail("Invalid reorder direction.");
                }
                let tx = self
                    .conn
                    .transaction_with_behavior(TransactionBehavior::Immediate)
                    .map_err(err)?;
                let mut page = get_page(&tx, &id)?.ok_or("Page not found.")?;
                let pages: Vec<Page> = list_pages(&tx, Some(&page.notebook_id))?
                    .into_iter()
                    .filter(|p| p.deleted_at.is_none())
                    .collect();
                let i = pages
                    .iter()
                    .position(|p| p.id == id)
                    .ok_or("Page not found.")? as i64;
                if let Some(other) = pages.get((i + direction as i64) as usize) {
                    let mut other = other.clone();
                    std::mem::swap(&mut page.sort_order, &mut other.sort_order);
                    update_page(&tx, &page)?;
                    update_page(&tx, &other)?;
                }
                tx.commit().map_err(err)?;
                Ok(Value::Null)
            }
            Request::ReadSnapshot => {
                let tx = self.conn.transaction().map_err(err)?;
                let data = read_snapshot(&tx)?;
                tx.commit().map_err(err)?;
                json_value(data)
            }
        }
    }
}
pub fn validate_color(color: &str) -> bool {
    color.len() == 7 && color.starts_with('#') && color[1..].bytes().all(|b| b.is_ascii_hexdigit())
}
pub fn validate_book(book: &Notebook) -> Result<()> {
    if book.id.is_empty() || book.title.trim().is_empty() || !validate_color(&book.color) {
        return fail("Invalid notebook metadata.");
    }
    Ok(())
}
pub fn validate_page(page: &Page) -> Result<()> {
    if page.id.is_empty()
        || page.notebook_id.is_empty()
        || page.title.trim().is_empty()
        || !["paper", "infinite"].contains(&page.mode.as_str())
        || !["blank", "ruled", "grid", "dotted", "vintage"].contains(&page.paper.as_str())
        || !["A4", "A4 landscape", "A5", "Letter"].contains(&page.size.as_str())
        || !validate_color(&page.paper_color)
    {
        return fail("Invalid page metadata.");
    }
    Ok(())
}
pub fn validate_settings(v: &Value) -> Result<()> {
    if !["light", "dark", "system"].contains(&v["theme"].as_str().unwrap_or(""))
        || !["paper", "infinite"].contains(&v["defaultMode"].as_str().unwrap_or(""))
        || !["blank", "ruled", "grid", "dotted", "vintage"]
            .contains(&v["defaultPaper"].as_str().unwrap_or(""))
        || !validate_color(v["paperColor"].as_str().unwrap_or(""))
        || !v["defaultZoom"]
            .as_f64()
            .is_some_and(|n| (0.1..=3.0).contains(&n))
    {
        return fail("Invalid application settings.");
    }
    Ok(())
}
pub fn get_book(conn: &Connection, id: &str) -> Result<Option<Notebook>> {
    let value: Option<String> = conn
        .query_row("SELECT data_json FROM notebooks WHERE id=?1", [id], |r| {
            r.get(0)
        })
        .optional()
        .map_err(err)?;
    value
        .map(|v| serde_json::from_str(&v).map_err(err))
        .transpose()
}
pub fn get_page(conn: &Connection, id: &str) -> Result<Option<Page>> {
    let value: Option<String> = conn
        .query_row("SELECT data_json FROM pages WHERE id=?1", [id], |r| {
            r.get(0)
        })
        .optional()
        .map_err(err)?;
    value
        .map(|v| serde_json::from_str(&v).map_err(err))
        .transpose()
}
pub fn list_books(conn: &Connection) -> Result<Vec<Notebook>> {
    let mut s = conn
        .prepare("SELECT data_json FROM notebooks ORDER BY updated_at DESC,id")
        .map_err(err)?;
    let rows = s.query_map([], |r| r.get::<_, String>(0)).map_err(err)?;
    rows.map(|row| serde_json::from_str(&row.map_err(err)?).map_err(err))
        .collect()
}
pub fn list_pages(conn: &Connection, book: Option<&str>) -> Result<Vec<Page>> {
    let (sql, parameters) = match book {
        Some(id) => (
            "SELECT data_json FROM pages WHERE notebook_id=?1 ORDER BY sort_order,id",
            vec![id],
        ),
        None => ("SELECT data_json FROM pages ORDER BY sort_order,id", vec![]),
    };
    let mut s = conn.prepare(sql).map_err(err)?;
    let rows = s
        .query_map(rusqlite::params_from_iter(parameters), |r| {
            r.get::<_, String>(0)
        })
        .map_err(err)?;
    rows.map(|row| serde_json::from_str(&row.map_err(err)?).map_err(err))
        .collect()
}
pub fn insert_book(conn: &Connection, b: &Notebook) -> Result<()> {
    conn.execute(
        "INSERT INTO notebooks(id,data_json,updated_at,deleted_at)VALUES(?1,?2,?3,?4)",
        params![b.id, text(b)?, b.updated_at, b.deleted_at],
    )
    .map_err(err)?;
    Ok(())
}
pub fn update_book(conn: &Connection, b: &Notebook) -> Result<()> {
    conn.execute(
        "UPDATE notebooks SET data_json=?2,updated_at=?3,deleted_at=?4 WHERE id=?1",
        params![b.id, text(b)?, b.updated_at, b.deleted_at],
    )
    .map_err(err)?;
    Ok(())
}
fn touch_book(conn: &Connection, id: &str) -> Result<()> {
    let mut b = get_book(conn, id)?.ok_or("Notebook not found.")?;
    b.updated_at = now();
    update_book(conn, &b)
}
pub fn insert_page(conn: &Connection, p: &Page) -> Result<()> {
    conn.execute("INSERT INTO pages(id,notebook_id,data_json,sort_order,updated_at,deleted_at)VALUES(?1,?2,?3,?4,?5,?6)",params![p.id,p.notebook_id,text(p)?,p.sort_order,p.updated_at,p.deleted_at]).map_err(err)?;
    Ok(())
}
pub fn update_page(conn: &Connection, p: &Page) -> Result<()> {
    conn.execute(
        "UPDATE pages SET data_json=?2,sort_order=?3,updated_at=?4,deleted_at=?5 WHERE id=?1",
        params![p.id, text(p)?, p.sort_order, p.updated_at, p.deleted_at],
    )
    .map_err(err)?;
    Ok(())
}
fn next_order(conn: &Connection, book: &str) -> Result<i64> {
    conn.query_row(
        "SELECT COALESCE(MAX(sort_order),-1)+1 FROM pages WHERE notebook_id=?1",
        [book],
        |r| r.get(0),
    )
    .map_err(err)
}
pub fn get_meta(conn: &Connection, key: &str) -> Result<Option<String>> {
    conn.query_row("SELECT value FROM metadata WHERE key=?1", [key], |r| {
        r.get(0)
    })
    .optional()
    .map_err(err)
}
pub fn put_meta(conn: &Connection, key: &str, value: &str) -> Result<()> {
    if key.len() > 512 || value.len() > 16 * 1024 * 1024 {
        return fail("Metadata exceeds the supported size.");
    }
    conn.execute("INSERT INTO metadata(key,value)VALUES(?1,?2)ON CONFLICT(key)DO UPDATE SET value=excluded.value",params![key,value]).map_err(err)?;
    Ok(())
}
pub fn get_setting(conn: &Connection, key: &str) -> Result<Option<Value>> {
    let value: Option<String> = conn
        .query_row(
            "SELECT value_json FROM app_settings WHERE key=?1",
            [key],
            |r| r.get(0),
        )
        .optional()
        .map_err(err)?;
    value
        .map(|v| serde_json::from_str(&v).map_err(err))
        .transpose()
}
pub fn put_setting(conn: &Connection, key: &str, value: &Value) -> Result<()> {
    conn.execute("INSERT INTO app_settings(key,value_json,updated_at)VALUES(?1,?2,?3)ON CONFLICT(key)DO UPDATE SET value_json=excluded.value_json,updated_at=excluded.updated_at",params![key,text(value)?,now()]).map_err(err)?;
    Ok(())
}
pub fn decode_file(file: &File) -> Result<Vec<u8>> {
    if ![
        "image/png",
        "image/jpeg",
        "image/webp",
        "image/gif",
        "image/svg+xml",
    ]
    .contains(&file.mime_type.as_str())
    {
        return fail("Unsupported embedded image type.");
    }
    let prefix = format!("data:{};base64,", file.mime_type);
    let encoded = file
        .data_url
        .strip_prefix(&prefix)
        .ok_or("An asset is not an embedded image.")?;
    if encoded.len() > 96 * 1024 * 1024 {
        return fail("An embedded image exceeds 72 MB.");
    }
    STANDARD.decode(encoded).map_err(err)
}
pub fn validate_scene(content: &Content, ids: &HashSet<String>) -> Result<()> {
    if !content.app_state.is_object() || content.elements.len() > 200000 {
        return fail("Invalid or excessive scene data.");
    }
    let mut elements = HashSet::new();
    for e in &content.elements {
        let id = e["id"].as_str().ok_or("Element ID is missing.")?;
        if !elements.insert(id)
            || e["type"].as_str().is_none()
            || !["x", "y", "width", "height", "version"]
                .iter()
                .all(|k| e[k].as_f64().is_some_and(f64::is_finite))
        {
            return fail("Invalid or duplicate drawing element.");
        }
        if e["type"] == "image"
            && e["isDeleted"] != true
            && !e["fileId"].as_str().is_some_and(|id| ids.contains(id))
        {
            return fail("A scene is missing an image reference.");
        }
    }
    for e in &content.elements {
        if e["isDeleted"] == true {
            continue;
        }
        if let Some(id) = e["containerId"].as_str() {
            if !elements.contains(id) {
                return fail("A text container reference is missing.");
            }
        }
        for key in ["startBinding", "endBinding"] {
            if let Some(id) = e[key]["elementId"].as_str() {
                if !elements.contains(id) {
                    return fail("An arrow binding reference is missing.");
                }
            }
        }
    }
    Ok(())
}
pub fn write_content(
    conn: &Connection,
    content: &Content,
    expected: Option<i64>,
    file_ids: Option<&[String]>,
) -> Result<i64> {
    let revision: i64 = conn
        .query_row(
            "SELECT revision FROM pages WHERE id=?1",
            [&content.page_id],
            |r| r.get(0),
        )
        .map_err(err)?;
    if expected.is_some_and(|v| v != revision) {
        return fail("Save conflict: this page changed after it was opened. Your pending drawing is kept in memory; export it before reopening the page.");
    }
    let ids: HashSet<String> = file_ids
        .map(|v| v.iter().cloned().collect())
        .unwrap_or_else(|| content.files.keys().cloned().collect());
    validate_scene(content, &ids)?;
    let existing: Vec<String> = {
        let mut s = conn
            .prepare("SELECT file_id FROM page_asset_references WHERE page_id=?1")
            .map_err(err)?;
        let rows = s.query_map([&content.page_id], |r| r.get(0)).map_err(err)?;
        rows.collect::<std::result::Result<_, _>>().map_err(err)?
    };
    for id in existing {
        if !ids.contains(&id) {
            conn.execute(
                "DELETE FROM page_asset_references WHERE page_id=?1 AND file_id=?2",
                params![content.page_id, id],
            )
            .map_err(err)?;
        }
    }
    for (id, file) in &content.files {
        if id != &file.id || !ids.contains(id) {
            return fail("Asset identifier mismatch.");
        }
        let bytes = decode_file(file)?;
        let digest = hash(&bytes);
        conn.execute("INSERT OR IGNORE INTO assets(content_hash,media_type,binary_data,byte_size,created_at)VALUES(?1,?2,?3,?4,?5)",params![digest,file.mime_type,bytes,bytes.len() as i64,file.created]).map_err(err)?;
        let mut metadata = serde_json::to_value(file).map_err(err)?;
        metadata
            .as_object_mut()
            .ok_or("Invalid asset")?
            .remove("dataURL");
        conn.execute("INSERT INTO page_asset_references(page_id,file_id,asset_hash,metadata_json)VALUES(?1,?2,?3,?4)ON CONFLICT(page_id,file_id)DO UPDATE SET asset_hash=excluded.asset_hash,metadata_json=excluded.metadata_json",params![content.page_id,id,digest,text(metadata)?]).map_err(err)?;
    }
    let count: i64 = conn
        .query_row(
            "SELECT count(*) FROM page_asset_references WHERE page_id=?1",
            [&content.page_id],
            |r| r.get(0),
        )
        .map_err(err)?;
    if count != ids.len() as i64 {
        return fail("Some scene assets are unavailable. Save was rolled back.");
    }
    let mut scene = json_value(content)?;
    scene
        .as_object_mut()
        .ok_or("Invalid scene")?
        .remove("files");
    scene.as_object_mut().unwrap().remove("revision");
    conn.execute("INSERT INTO page_scenes(page_id,scene_json,updated_at)VALUES(?1,?2,?3)ON CONFLICT(page_id)DO UPDATE SET scene_json=excluded.scene_json,updated_at=excluded.updated_at",params![content.page_id,text(scene)?,now()]).map_err(err)?;
    conn.execute(
        "UPDATE pages SET revision=revision+1 WHERE id=?1",
        [&content.page_id],
    )
    .map_err(err)?;
    Ok(revision + 1)
}
pub fn load_content(conn: &Connection, id: &str) -> Result<Content> {
    let (scene,revision):(String,i64)=conn.query_row("SELECT scene_json,revision FROM page_scenes JOIN pages ON pages.id=page_scenes.page_id WHERE page_id=?1",[id],|r|Ok((r.get(0)?,r.get(1)?))).map_err(err)?;
    let mut value: Value = serde_json::from_str(&scene).map_err(err)?;
    let mut files = serde_json::Map::new();
    let mut s=conn.prepare("SELECT file_id,metadata_json,binary_data FROM page_asset_references JOIN assets ON content_hash=asset_hash WHERE page_id=?1").map_err(err)?;
    let rows = s
        .query_map([id], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, Vec<u8>>(2)?,
            ))
        })
        .map_err(err)?;
    for row in rows {
        let (id, metadata, bytes) = row.map_err(err)?;
        let mut file: Value = serde_json::from_str(&metadata).map_err(err)?;
        file["dataURL"] = json!(format!(
            "data:{};base64,{}",
            file["mimeType"]
                .as_str()
                .ok_or("Asset MIME type is missing.")?,
            STANDARD.encode(bytes)
        ));
        files.insert(id, file);
    }
    value["files"] = Value::Object(files);
    value["revision"] = json!(revision);
    serde_json::from_value(value).map_err(err)
}
fn duplicate_page(conn: &Connection, id: &str, target: Option<&str>) -> Result<Page> {
    let mut page = get_page(conn, id)?.ok_or("Page not found.")?;
    let mut content = load_content(conn, id)?;
    page.id = uuid::Uuid::new_v4().to_string();
    if let Some(book) = target {
        page.notebook_id = book.into();
    } else {
        page.title.push_str(" (copy)");
    }
    page.created_at = now();
    page.updated_at = now();
    page.last_opened_at = 0;
    page.deleted_at = None;
    page.sort_order = next_order(conn, &page.notebook_id)?;
    content.page_id = page.id.clone();
    content.revision = None;
    insert_page(conn, &page)?;
    write_content(conn, &content, Some(0), None)?;
    touch_book(conn, &page.notebook_id)?;
    Ok(page)
}
pub fn collect_assets(conn: &Connection) -> Result<()> {
    conn.execute("DELETE FROM assets WHERE NOT EXISTS(SELECT 1 FROM page_asset_references WHERE asset_hash=content_hash)",[]).map_err(err)?;
    Ok(())
}
pub fn read_snapshot(conn: &Connection) -> Result<ArchiveData> {
    let notebooks = list_books(conn)?;
    let pages = list_pages(conn, None)?;
    let contents = pages
        .iter()
        .map(|p| load_content(conn, &p.id))
        .collect::<Result<Vec<_>>>()?;
    let mut statement = conn
        .prepare("SELECT key,value FROM metadata ORDER BY key")
        .map_err(err)?;
    let metadata = statement
        .query_map([], |r| {
            Ok(Meta {
                key: r.get(0)?,
                value: r.get(1)?,
            })
        })
        .map_err(err)?
        .collect::<std::result::Result<Vec<_>, _>>()
        .map_err(err)?;
    let mut s = conn
        .prepare("SELECT key,value_json FROM app_settings ORDER BY key")
        .map_err(err)?;
    let preferences = s
        .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))
        .map_err(err)?
        .map(|r| {
            let (key, value) = r.map_err(err)?;
            Ok(Preference {
                key,
                value: serde_json::from_str(&value).map_err(err)?,
            })
        })
        .collect::<Result<Vec<_>>>()?;
    let creative = get_meta(conn, "creative-library-v1")?
        .map(|v| serde_json::from_str(&v).map_err(err))
        .transpose()?;
    let import_history = {
        let mut s=conn.prepare("SELECT archive_fingerprint,source_format,status,imported_at,summary_json FROM import_history ORDER BY archive_fingerprint").map_err(err)?;
        let rows = s
            .query_map([], |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, String>(2)?,
                    r.get::<_, i64>(3)?,
                    r.get::<_, String>(4)?,
                ))
            })
            .map_err(err)?;
        rows.map(|row| {
            let (archive_fingerprint, source_format, status, imported_at, value) =
                row.map_err(err)?;
            Ok(ImportHistory {
                archive_fingerprint,
                source_format,
                status,
                imported_at,
                summary: serde_json::from_str(&value).map_err(err)?,
            })
        })
        .collect::<Result<Vec<_>>>()?
    };
    Ok(ArchiveData {
        app: "lotepad".into(),
        version: 1,
        created_at: now(),
        notebooks,
        pages,
        contents,
        settings: get_setting(conn, "settings")?.ok_or("Settings missing")?,
        creative,
        metadata,
        preferences,
        import_history,
    })
}
