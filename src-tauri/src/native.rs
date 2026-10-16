use crate::{
    archive::{self, Summary},
    dump,
    model::*,
    repository::{check_integrity, hash, Repository},
};
use rusqlite::{Connection, OpenFlags};
use serde::Serialize;
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    io::{BufWriter, Write},
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
    time::Duration,
};
use tauri::{AppHandle, Manager, State};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;
#[derive(Clone)]
struct Pending {
    path: PathBuf,
    fingerprint: String,
}
#[derive(Clone)]
pub struct NativeState {
    database: Arc<Mutex<Result<Repository>>>,
    pending: Arc<Mutex<HashMap<String, Pending>>>,
    directory: PathBuf,
}
fn with_repo<T>(state: &NativeState, run: impl FnOnce(&mut Repository) -> Result<T>) -> Result<T> {
    let mut guard = state.database.lock().map_err(err)?;
    let repo = guard.as_mut().map_err(|e| e.clone())?;
    run(repo)
}
fn reader(state: &NativeState) -> Result<Connection> {
    let path = with_repo(state, |repo| Ok(repo.path.clone()))?;
    let conn = Connection::open_with_flags(
        path,
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )
    .map_err(err)?;
    conn.busy_timeout(Duration::from_secs(5)).map_err(err)?;
    conn.pragma_update(None, "foreign_keys", "ON")
        .map_err(err)?;
    Ok(conn)
}
#[tauri::command]
async fn repository_call(state: State<'_, NativeState>, request: Request) -> Result<Value> {
    let state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let mut guard = state.database.lock().map_err(err)?;
        if matches!(&request, Request::Initialize) && guard.is_err() {
            *guard = std::fs::create_dir_all(&state.directory)
                .map_err(err)
                .and_then(|_| Repository::open(state.directory.join("lotepad.db")));
        }
        guard.as_mut().map_err(|e| e.clone())?.call(request)
    })
    .await
    .map_err(err)?
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Saved {
    cancelled: bool,
    path: Option<String>,
    bytes: u64,
}
fn cancelled() -> Saved {
    Saved {
        cancelled: true,
        path: None,
        bytes: 0,
    }
}
fn protect_target(state: &NativeState, path: &Path) -> Result<()> {
    let parent = path
        .parent()
        .ok_or("Choose a local output directory.")?
        .canonicalize()
        .map_err(err)?;
    let target = parent.join(path.file_name().ok_or("Choose a file name.")?);
    let active = state.directory.canonicalize().map_err(err)?;
    let lower = target.to_string_lossy().to_lowercase();
    if ["lotepad.db", "lotepad.db-wal", "lotepad.db-shm"]
        .iter()
        .any(|name| lower == active.join(name).to_string_lossy().to_lowercase())
    {
        return fail("Choose a backup path outside the active database files.");
    }
    Ok(())
}
fn finalize(temp: tempfile::NamedTempFile, path: &Path) -> Result<Saved> {
    temp.as_file().sync_all().map_err(err)?;
    let bytes = temp.as_file().metadata().map_err(err)?.len();
    temp.persist(path).map_err(err)?;
    Ok(Saved {
        cancelled: false,
        path: Some(path.display().to_string()),
        bytes,
    })
}
#[tauri::command]
async fn export_native(
    app: AppHandle,
    state: State<'_, NativeState>,
    kind: String,
) -> Result<Saved> {
    let state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let (extension, label) = match kind.as_str() {
            "sql" => ("sql", "SQLite SQL dump"),
            "db" => ("db", "SQLite database snapshot"),
            "zip" => ("zip", "Lotepad portable backup"),
            _ => return fail("Unsupported backup type."),
        };
        let name = format!(
            "lotepad-backup-{}.{}",
            chrono::Utc::now().format("%Y-%m-%d_%H-%M-%S"),
            extension
        );
        let Some(selected) = app
            .dialog()
            .file()
            .add_filter(label, &[extension])
            .set_file_name(&name)
            .blocking_save_file()
        else {
            return Ok(cancelled());
        };
        let path = selected.into_path().map_err(err)?;
        protect_target(&state, &path)?;
        if path
            .extension()
            .and_then(|s| s.to_str())
            .is_none_or(|s| !s.eq_ignore_ascii_case(extension))
        {
            return Err(format!("Use the .{extension} extension for this backup."));
        }
        let mut conn = reader(&state)?;
        let mut temp = tempfile::Builder::new()
            .prefix(".lotepad-backup-")
            .tempfile_in(path.parent().ok_or("Missing output folder")?)
            .map_err(err)?;
        match kind.as_str() {
            "sql" => {
                let mut output = BufWriter::new(temp.as_file_mut());
                dump::write_sql_dump(&mut conn, &mut output)?;
                output.flush().map_err(err)?;
            }
            "db" => dump::write_snapshot(&conn, temp.path())?,
            "zip" => archive::write_archive(&mut conn, temp.as_file_mut())?,
            _ => unreachable!(),
        }
        finalize(temp, &path)
    })
    .await
    .map_err(err)?
}
#[tauri::command]
async fn save_document(
    app: AppHandle,
    state: State<'_, NativeState>,
    name: String,
    bytes: Vec<u8>,
) -> Result<Saved> {
    let state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        if bytes.len() > 150 * 1024 * 1024 {
            return fail("This document exceeds the 150 MB export limit.");
        }
        let name = Path::new(&name)
            .file_name()
            .ok_or("Invalid export name")?
            .to_string_lossy()
            .to_string();
        let extension = Path::new(&name)
            .extension()
            .and_then(|s| s.to_str())
            .ok_or("An export extension is required")?;
        if !["png", "svg", "excalidraw", "zip"].contains(&extension) {
            return fail("Unsupported document export type.");
        }
        let Some(file) = app
            .dialog()
            .file()
            .add_filter("Lotepad export", &[extension])
            .set_file_name(&name)
            .blocking_save_file()
        else {
            return Ok(cancelled());
        };
        let path = file.into_path().map_err(err)?;
        protect_target(&state, &path)?;
        let mut temp = tempfile::Builder::new()
            .prefix(".lotepad-export-")
            .tempfile_in(path.parent().ok_or("Missing output folder")?)
            .map_err(err)?;
        temp.write_all(&bytes).map_err(err)?;
        finalize(temp, &path)
    })
    .await
    .map_err(err)?
}
fn recovery(state: &NativeState) -> Result<PathBuf> {
    let directory = state.directory.join("recovery");
    std::fs::create_dir_all(&directory).map_err(err)?;
    let path = directory.join(format!(
        "before-restore-{}-{}.db",
        chrono::Utc::now().format("%Y%m%d-%H%M%S"),
        uuid::Uuid::new_v4()
    ));
    dump::write_snapshot(&reader(state)?, &path)?;
    let mut files = std::fs::read_dir(&directory)
        .map_err(err)?
        .filter_map(|e| e.ok())
        .map(|e| e.path())
        .filter(|p| {
            p.is_file()
                && p.file_name()
                    .is_some_and(|s| s.to_string_lossy().starts_with("before-restore-"))
                && p.extension().is_some_and(|s| s == "db")
        })
        .collect::<Vec<_>>();
    files.sort();
    while files.len() > 5 {
        let old = files.remove(0);
        if old.parent() == Some(directory.as_path()) {
            std::fs::remove_file(old).map_err(err)?;
        }
    }
    Ok(path)
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ImportPreview {
    token: String,
    summary: Summary,
    file_name: String,
}
#[tauri::command]
async fn preview_import(
    app: AppHandle,
    state: State<'_, NativeState>,
) -> Result<Option<ImportPreview>> {
    let state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let Some(file) = app
            .dialog()
            .file()
            .add_filter("Lotepad backup", &["zip"])
            .blocking_pick_file()
        else {
            return Ok(None);
        };
        let path = file.into_path().map_err(err)?;
        let validated = archive::read_archive(&path)?;
        let summary = archive::preview(&reader(&state)?, &validated)?;
        let token = uuid::Uuid::new_v4().to_string();
        let mut pending = state.pending.lock().map_err(err)?;
        pending.clear();
        pending.insert(
            token.clone(),
            Pending {
                path: path.clone(),
                fingerprint: validated.fingerprint,
            },
        );
        Ok(Some(ImportPreview {
            token,
            summary,
            file_name: path
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .into(),
        }))
    })
    .await
    .map_err(err)?
}
#[tauri::command]
async fn apply_import(
    state: State<'_, NativeState>,
    token: String,
    replace: bool,
) -> Result<Summary> {
    let state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let pending = state
            .pending
            .lock()
            .map_err(err)?
            .get(&token)
            .cloned()
            .ok_or("Choose and validate the archive again.")?;
        let archive = archive::read_archive(&pending.path)?;
        if archive.fingerprint != pending.fingerprint {
            return fail("The archive changed after preview. Validate it again.");
        }
        if replace {
            recovery(&state)?;
        }
        let result = with_repo(&state, |repo| {
            archive::import_archive(repo, &archive, replace)
        })?;
        state.pending.lock().map_err(err)?.remove(&token);
        Ok(result)
    })
    .await
    .map_err(err)?
}
#[tauri::command]
async fn import_data(
    state: State<'_, NativeState>,
    data: ArchiveData,
    mode: String,
) -> Result<Summary> {
    let state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        if !["merge", "replace"].contains(&mode.as_str()) {
            return fail("Unsupported import mode.");
        }
        let inventory = archive::validate_data(&data, true)?;
        let fingerprint = hash(&serde_json::to_vec(&data).map_err(err)?);
        let archive = archive::Validated {
            data,
            fingerprint,
            inventory,
        };
        if mode == "replace" {
            recovery(&state)?;
        }
        with_repo(&state, |repo| {
            archive::import_archive(repo, &archive, mode == "replace")
        })
    })
    .await
    .map_err(err)?
}
#[tauri::command]
async fn storage_info(state: State<'_, NativeState>) -> Result<Value> {
    let state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move||{
 let conn=reader(&state)?;let path=state.directory.join("lotepad.db");let bytes=std::fs::metadata(&path).map_err(err)?.len()+std::fs::metadata(state.directory.join("lotepad.db-wal")).map(|m|m.len()).unwrap_or(0);
 let assets:i64=conn.query_row("SELECT count(*) FROM assets",[],|r|r.get(0)).map_err(err)?;
 Ok(json!({"databasePath":path.display().to_string(),"schemaVersion":1,"bytes":bytes,"assets":assets,"recoveryDirectory":state.directory.join("recovery").display().to_string()}))
 }).await.map_err(err)?
}
#[tauri::command]
async fn verify_database(state: State<'_, NativeState>) -> Result<Value> {
    let state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let mut conn = reader(&state)?;
        let tx = conn.transaction().map_err(err)?;
        check_integrity(&tx)?;
        let data = crate::repository::read_snapshot(&tx)?;
        archive::validate_data(&data, true)?;
        Ok(json!({"integrity":"ok","foreignKeys":"ok","counts":archive::counts(&data)}))
    })
    .await
    .map_err(err)?
}
#[tauri::command]
fn open_data_folder(app: AppHandle, state: State<'_, NativeState>) -> Result<()> {
    app.opener()
        .open_path(state.directory.display().to_string(), None::<&str>)
        .map_err(err)
}
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let directory = app.path().app_data_dir()?;
            #[cfg(debug_assertions)]
            let directory = std::env::var_os("LOTEPAD_TEST_DATA_DIR")
                .map(PathBuf::from)
                .unwrap_or(directory);
            let database = std::fs::create_dir_all(&directory)
                .map_err(err)
                .and_then(|_| Repository::open(directory.join("lotepad.db")));
            app.manage(NativeState {
                database: Arc::new(Mutex::new(database)),
                pending: Arc::new(Mutex::new(HashMap::new())),
                directory,
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            repository_call,
            export_native,
            save_document,
            preview_import,
            apply_import,
            import_data,
            storage_info,
            verify_database,
            open_data_folder
        ])
        .run(tauri::generate_context!())
        .expect("Lotepad desktop runtime failed");
}
