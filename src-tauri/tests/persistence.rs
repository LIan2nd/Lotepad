use base64::{engine::general_purpose::STANDARD, Engine};
use lotepad_desktop::{
    archive::{self, Validated},
    dump,
    model::*,
    repository::*,
};
use rusqlite::{params, Connection};
use serde_json::{json, Value};
use std::{fs, io::Cursor};
use tempfile::tempdir;
fn fixture() -> ArchiveData {
    let mut png = Cursor::new(Vec::new());
    image::DynamicImage::new_rgb8(4, 3)
        .write_to(&mut png, image::ImageFormat::Png)
        .unwrap();
    let sticker=b"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"20\" height=\"20\"><path d=\"M1 1L19 19\" stroke=\"#aabbcc\"/></svg>";
    serde_json::from_value(json!({
  "app":"lotepad","version":1,"createdAt":100,
  "notebooks":[{"id":"book","title":"Catatan 'quoted' — 日本語 🪻","color":"#aabbcc","icon":"✦","favorite":true,"createdAt":1,"updatedAt":2,"deletedAt":null,"customCover":{"sparkle":true}}],
  "pages":[{"id":"page","notebookId":"book","title":"A scrapbook","mode":"paper","paper":"vintage","size":"A4","paperColor":"#fffdf8","order":7,"createdAt":1,"updatedAt":2,"lastOpenedAt":1,"deletedAt":null}],
  "contents":[{"pageId":"page","initialized":true,"appState":{"zoom":{"value":0.7},"scrollX":12},"elements":[
   {"id":"photo","type":"image","x":1,"y":2,"width":30,"height":20,"version":4,"fileId":"photo-file","groupIds":["group"],"customData":{"lotepadCreative":true}},
   {"id":"sticker","type":"image","x":4,"y":5,"width":20,"height":20,"version":1,"fileId":"sticker-file","groupIds":["group"]},
   {"id":"paper","type":"rectangle","x":0,"y":0,"width":100,"height":100,"version":2,"boundElements":[{"id":"text","type":"text"}]},
   {"id":"text","type":"text","x":10,"y":10,"width":60,"height":30,"version":3,"text":"Editable caption","containerId":"paper","groupIds":["card"]},
   {"id":"pen","type":"freedraw","x":1,"y":2,"width":20,"height":30,"version":1,"points":[[0,0],[10,20]],"pressures":[0.3,0.7]}
  ],"files":{
   "photo-file":{"id":"photo-file","dataURL":format!("data:image/png;base64,{}",STANDARD.encode(png.into_inner())),"mimeType":"image/png","created":1,"lastRetrieved":10},
   "sticker-file":{"id":"sticker-file","dataURL":format!("data:image/svg+xml;base64,{}",STANDARD.encode(sticker)),"mimeType":"image/svg+xml","created":2}
  }}],
  "settings":default_settings(),"creative":{"version":1,"favorites":["soft-star"],"recent":["paper-torn"],"paletteId":"custom-a","customPalettes":[{"id":"custom-a","name":"My colors","colors":["#112233","#aabbcc","#fffdf8","#bbccdd","#223344"],"ink":"#112233","paper":"#fffdf8","accent":"#aabbcc"}]},
  "metadata":[{"key":"lastRoute","value":"notebook=book&page=page"},{"key":"future-meta","value":"Unicode Ω\n'quote'\u{0000}tail"}],
  "preferences":[{"key":"settings","value":default_settings()},{"key":"future-setting","value":{"preserve":true}}]
 })).unwrap()
}
fn validated(data: ArchiveData) -> Validated {
    let inventory = archive::validate_data(&data, true).unwrap();
    let fingerprint = hash(&serde_json::to_vec(&data).unwrap());
    Validated {
        data,
        fingerprint,
        inventory,
    }
}
fn request(repo: &mut Repository, value: Value) -> Result<Value> {
    repo.call(serde_json::from_value(value).unwrap())
}
fn archive_bytes(repo: &mut Repository) -> Vec<u8> {
    let mut out = Cursor::new(Vec::new());
    archive::write_archive(&mut repo.conn, &mut out).unwrap();
    out.into_inner()
}

#[test]
fn migration_preserves_scenes_assets_metadata_order_and_timestamps_after_reopen() {
    let dir = tempdir().unwrap();
    let path = dir.path().join("lotepad.db");
    let mut repo = Repository::open(&path).unwrap();
    let original = validated(fixture());
    let summary = archive::import_archive(&mut repo, &original, false).unwrap();
    assert_eq!(summary.counts.pages, 1);
    assert_eq!(summary.counts.assets, 2);
    drop(repo);
    let repo = Repository::open(&path).unwrap();
    check_integrity(&repo.conn).unwrap();
    let restored = read_snapshot(&repo.conn).unwrap();
    assert_eq!(restored.notebooks, original.data.notebooks);
    assert_eq!(restored.pages, original.data.pages);
    let mut scene = restored.contents[0].clone();
    scene.revision = None;
    assert_eq!(scene, original.data.contents[0]);
    assert_eq!(restored.creative, original.data.creative);
    assert_eq!(
        get_meta(&repo.conn, "future-meta").unwrap().unwrap(),
        "Unicode Ω\n'quote'\0tail"
    );
    for (id, file) in &scene.files {
        assert_eq!(
            hash(&decode_file(file).unwrap()),
            hash(&decode_file(&original.data.contents[0].files[id]).unwrap())
        );
    }
}
#[test]
fn duplicate_import_is_detected_and_collisions_are_remapped_without_overwrite() {
    let dir = tempdir().unwrap();
    let mut repo = Repository::open(dir.path().join("db")).unwrap();
    let first = validated(fixture());
    archive::import_archive(&mut repo, &first, false).unwrap();
    assert!(
        archive::import_archive(&mut repo, &first, false)
            .unwrap()
            .already_imported
    );
    assert_eq!(list_books(&repo.conn).unwrap().len(), 1);
    let mut second = fixture();
    second.notebooks[0].title = "A different notebook".into();
    let second = validated(second);
    let result = archive::import_archive(&mut repo, &second, false).unwrap();
    assert_eq!(result.remapped_notebooks, 1);
    assert_eq!(result.remapped_pages, 1);
    assert_eq!(
        get_book(&repo.conn, "book").unwrap().unwrap().title,
        first.data.notebooks[0].title
    );
    assert_eq!(list_pages(&repo.conn, None).unwrap().len(), 2);
    let imported_book = list_books(&repo.conn)
        .unwrap()
        .into_iter()
        .find(|book| book.title == "A different notebook")
        .unwrap();
    let imported_page = list_pages(&repo.conn, Some(&imported_book.id))
        .unwrap()
        .remove(0);
    let route_key = format!("import:{}:lastRoute", &second.fingerprint[..16]);
    assert_eq!(
        get_meta(&repo.conn, &route_key).unwrap().unwrap(),
        format!("notebook={}&page={}", imported_book.id, imported_page.id)
    );
    check_integrity(&repo.conn).unwrap();
}
#[test]
fn interrupted_import_rolls_back_every_table_and_history() {
    let dir = tempdir().unwrap();
    let mut repo = Repository::open(dir.path().join("db")).unwrap();
    let first = validated(fixture());
    archive::import_archive(&mut repo, &first, false).unwrap();
    let before = serde_json::to_value(read_snapshot(&repo.conn).unwrap()).unwrap();
    let mut second = fixture();
    second.pages[0].title = "Changed".into();
    let second = validated(second);
    let error = archive::import_with_hook(&mut repo, &second, true, || {
        Err("Simulated interruption".into())
    })
    .unwrap_err();
    assert!(error.contains("interruption"));
    let mut after = serde_json::to_value(read_snapshot(&repo.conn).unwrap()).unwrap();
    after["createdAt"] = before["createdAt"].clone();
    assert_eq!(after, before);
    assert!(
        !archive::preview(&repo.conn, &second)
            .unwrap()
            .already_imported
    );
    drop(repo);
    let repo = Repository::open(dir.path().join("db")).unwrap();
    check_integrity(&repo.conn).unwrap();
    assert_eq!(
        get_page(&repo.conn, "page").unwrap().unwrap().title,
        "A scrapbook"
    );
}
#[test]
fn stale_revisions_cannot_overwrite_a_scene_and_partial_asset_saves_reconstruct_images() {
    let dir = tempdir().unwrap();
    let path = dir.path().join("db");
    let mut first = Repository::open(&path).unwrap();
    archive::import_archive(&mut first, &validated(fixture()), false).unwrap();
    let mut second = Repository::open(&path).unwrap();
    let old = load_content(&first.conn, "page").unwrap();
    let mut edited = old.clone();
    edited.elements[3]["text"] = json!("Newest drawing");
    let ids: Vec<_> = edited.files.keys().cloned().collect();
    edited.files.clear();
    let result=request(&mut first,json!({"type":"saveContent","content":edited,"fileIds":ids,"expectedRevision":old.revision})).unwrap();
    assert_eq!(result, json!(old.revision.unwrap() + 1));
    let error = request(
        &mut second,
        json!({"type":"saveContent","content":old,"expectedRevision":old.revision}),
    )
    .unwrap_err();
    assert!(error.contains("Save conflict"));
    let restored = load_content(&second.conn, "page").unwrap();
    assert_eq!(restored.elements[3]["text"], "Newest drawing");
    assert_eq!(restored.files.len(), 2);
}
#[test]
fn page_notebook_crud_duplicate_reorder_trash_and_delete_are_transactional() {
    let dir = tempdir().unwrap();
    let mut repo = Repository::open(dir.path().join("db")).unwrap();
    archive::import_archive(&mut repo, &validated(fixture()), false).unwrap();
    let copy = request(
        &mut repo,
        json!({"type":"duplicatePage","id":"page","targetNotebook":null}),
    )
    .unwrap();
    let id = copy["id"].as_str().unwrap();
    request(&mut repo, json!({"type":"reorder","id":id,"direction":-1})).unwrap();
    assert_eq!(get_page(&repo.conn, id).unwrap().unwrap().sort_order, 7);
    request(
        &mut repo,
        json!({"type":"updatePage","id":id,"updates":{"title":"Copy edited"}}),
    )
    .unwrap();
    assert_eq!(
        get_page(&repo.conn, id).unwrap().unwrap().title,
        "Copy edited"
    );
    let copied = request(&mut repo, json!({"type":"duplicateNotebook","id":"book"})).unwrap();
    assert_eq!(
        list_pages(&repo.conn, copied["id"].as_str()).unwrap().len(),
        2
    );
    request(&mut repo, json!({"type":"trashNotebook","id":"book"})).unwrap();
    request(&mut repo, json!({"type":"trashNotebook","id":"book"})).unwrap();
    assert!(get_book(&repo.conn, "book")
        .unwrap()
        .unwrap()
        .deleted_at
        .is_some());
    request(&mut repo, json!({"type":"restoreNotebook","id":"book"})).unwrap();
    assert!(get_book(&repo.conn, "book")
        .unwrap()
        .unwrap()
        .deleted_at
        .is_none());
    request(&mut repo, json!({"type":"deleteNotebook","id":"book"})).unwrap();
    assert!(get_page(&repo.conn, "page").unwrap().is_none());
    check_integrity(&repo.conn).unwrap();
}
#[test]
fn portable_archive_roundtrip_checksums_and_rejects_corrupt_zip_paths_and_missing_assets() {
    let dir = tempdir().unwrap();
    let mut repo = Repository::open(dir.path().join("db")).unwrap();
    archive::import_archive(&mut repo, &validated(fixture()), false).unwrap();
    let bytes = archive_bytes(&mut repo);
    let imported = archive::read_archive_bytes(Cursor::new(bytes)).unwrap();
    assert_eq!(imported.inventory.len(), 2);
    let mut broken = fixture();
    broken.contents[0].files.remove("photo-file");
    assert!(archive::validate_data(&broken, true).is_err());
    let mut broken = fixture();
    broken.contents[0]
        .files
        .get_mut("photo-file")
        .unwrap()
        .data_url = "data:image/png;base64,aGVsbG8=".into();
    assert!(archive::validate_data(&broken, true).is_err());
    let mut broken = fixture();
    broken.contents[0].files.get_mut("sticker-file").unwrap().data_url=format!("data:image/svg+xml;base64,{}",STANDARD.encode(br##"<svg xmlns="http://www.w3.org/2000/svg"><path fill="url(#safe) url(https://example.invalid/active)"/></svg>"##));
    assert!(archive::validate_data(&broken, true).is_err());
    let mut zip = zip::ZipWriter::new(Cursor::new(Vec::new()));
    zip.start_file("../escape", zip::write::SimpleFileOptions::default())
        .unwrap();
    std::io::Write::write_all(&mut zip, b"bad").unwrap();
    let bytes = zip.finish().unwrap().into_inner();
    assert!(archive::read_archive_bytes(Cursor::new(bytes)).is_err());
    let mut zip = zip::ZipWriter::new(Cursor::new(Vec::new()));
    zip.start_file("manifest.json", zip::write::SimpleFileOptions::default())
        .unwrap();
    std::io::Write::write_all(
        &mut zip,
        b"{\"format\":\"lotepad-portable\",\"formatVersion\":99}",
    )
    .unwrap();
    assert!(archive::read_archive_bytes(Cursor::new(zip.finish().unwrap().into_inner())).is_err());
}
fn compare_tables(source: &Connection, restored: &Connection) {
    let names: Vec<String> = {
        let mut s=source.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").unwrap();
        s.query_map([], |r| r.get(0))
            .unwrap()
            .collect::<std::result::Result<_, _>>()
            .unwrap()
    };
    for name in names {
        let sql = format!(
            "SELECT * FROM \"{}\" ORDER BY rowid",
            name.replace('"', "\"\"")
        );
        let values = |conn: &Connection| {
            let mut s = conn.prepare(&sql).unwrap();
            let cols = s.column_count();
            let mut rows = s.query([]).unwrap();
            let mut out = Vec::new();
            while let Some(row) = rows.next().unwrap() {
                out.push(
                    (0..cols)
                        .map(|i| row.get::<_, rusqlite::types::Value>(i).unwrap())
                        .collect::<Vec<_>>(),
                );
            }
            out
        };
        assert_eq!(values(source), values(restored), "Table {name} differs");
    }
}
#[test]
fn sql_dump_executes_and_restores_all_schema_rows_unicode_nul_blob_hashes_and_sequence_state() {
    let dir = tempdir().unwrap();
    let mut repo = Repository::open(dir.path().join("db")).unwrap();
    archive::import_archive(&mut repo, &validated(fixture()), false).unwrap();
    repo.conn.execute_batch("CREATE TABLE extra(id INTEGER PRIMARY KEY AUTOINCREMENT, content TEXT, optional TEXT, number REAL, generated TEXT GENERATED ALWAYS AS (content || '-generated') STORED); INSERT INTO extra(content,number) VALUES('quoted',1.0); DELETE FROM extra; INSERT INTO extra(content,number) VALUES('unicode',1.5); CREATE INDEX extra_index ON extra(content); CREATE VIEW extra_view AS SELECT id,content FROM extra; CREATE TRIGGER extra_trigger AFTER UPDATE ON extra BEGIN UPDATE metadata SET value='triggered' WHERE key='future-meta'; END;").unwrap();
    let before = read_snapshot(&repo.conn).unwrap();
    let mut bytes = Vec::new();
    dump::write_sql_dump(&mut repo.conn, &mut bytes).unwrap();
    let script = String::from_utf8(bytes).unwrap();
    assert!(script.starts_with("-- Lotepad SQLite Backup"));
    assert!(script.contains("X'89504E47"));
    assert!(script.contains("CAST(X'"));
    assert!(script.contains("CREATE TRIGGER"));
    let restored = Connection::open(dir.path().join("restored.db")).unwrap();
    restored.execute_batch(&script).unwrap();
    check_integrity(&restored).unwrap();
    compare_tables(&repo.conn, &restored);
    let mut data = read_snapshot(&restored).unwrap();
    data.created_at = before.created_at;
    assert_eq!(
        serde_json::to_value(data).unwrap(),
        serde_json::to_value(before).unwrap()
    );
    let sequence_original: i64 = repo
        .conn
        .query_row(
            "SELECT seq FROM sqlite_sequence WHERE name='extra'",
            [],
            |r| r.get(0),
        )
        .unwrap();
    let sequence_restored: i64 = restored
        .query_row(
            "SELECT seq FROM sqlite_sequence WHERE name='extra'",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(sequence_original, sequence_restored);
}
#[test]
fn snapshot_includes_wal_writes_and_export_failure_does_not_change_source() {
    let dir = tempdir().unwrap();
    let mut repo = Repository::open(dir.path().join("db")).unwrap();
    archive::import_archive(&mut repo, &validated(fixture()), false).unwrap();
    repo.conn
        .execute(
            "INSERT INTO metadata VALUES('wal-only',?1)",
            params!["uncheckpointed"],
        )
        .unwrap();
    assert!(fs::metadata(dir.path().join("db-wal")).unwrap().len() > 0);
    dump::write_snapshot(&repo.conn, &dir.path().join("snapshot.db")).unwrap();
    let snapshot = Connection::open(dir.path().join("snapshot.db")).unwrap();
    check_integrity(&snapshot).unwrap();
    compare_tables(&repo.conn, &snapshot);
    struct FullDisk;
    impl std::io::Write for FullDisk {
        fn write(&mut self, _: &[u8]) -> std::io::Result<usize> {
            Err(std::io::Error::other("disk full"))
        }
        fn flush(&mut self) -> std::io::Result<()> {
            Ok(())
        }
    }
    assert!(dump::write_sql_dump(&mut repo.conn, FullDisk)
        .unwrap_err()
        .contains("disk full"));
    assert_eq!(
        get_meta(&repo.conn, "wal-only").unwrap().unwrap(),
        "uncheckpointed"
    );
    check_integrity(&repo.conn).unwrap();
}
#[test]
fn sql_dump_rejects_unsupported_virtual_tables_instead_of_silently_omitting_data() {
    let mut conn = Connection::open_in_memory().unwrap();
    conn.execute_batch("CREATE VIRTUAL TABLE search USING fts5(content);")
        .unwrap();
    assert!(dump::write_sql_dump(&mut conn, Vec::new())
        .unwrap_err()
        .contains("does not support"));
}
#[test]
fn benchmark_reports_measured_storage_timings() {
    let dir = tempdir().unwrap();
    let start = std::time::Instant::now();
    let mut repo = Repository::open(dir.path().join("db")).unwrap();
    let startup = start.elapsed();
    let data = validated(fixture());
    let start = std::time::Instant::now();
    archive::import_archive(&mut repo, &data, false).unwrap();
    let import = start.elapsed();
    let start = std::time::Instant::now();
    list_books(&repo.conn).unwrap();
    list_pages(&repo.conn, None).unwrap();
    let metadata = start.elapsed();
    let start = std::time::Instant::now();
    let scene = load_content(&repo.conn, "page").unwrap();
    let restore = start.elapsed();
    let start = std::time::Instant::now();
    request(
        &mut repo,
        json!({"type":"saveContent","content":scene,"expectedRevision":scene.revision}),
    )
    .unwrap();
    let save = start.elapsed();
    println!("Measured synthetic fixture: open={startup:?}, import={import:?}, metadata={metadata:?}, restore={restore:?}, save={save:?}");
}

#[test]
fn sql_dump_pins_one_snapshot_while_another_connection_commits() {
    let dir = tempdir().unwrap();
    let path = dir.path().join("db");
    let mut repo = Repository::open(&path).unwrap();
    archive::import_archive(&mut repo, &validated(fixture()), false).unwrap();
    repo.conn
        .execute_batch(
            "INSERT INTO metadata VALUES('snapshot-a','before'),('snapshot-b','before');",
        )
        .unwrap();
    struct ConcurrentWriter {
        bytes: Vec<u8>,
        writer: Option<Connection>,
    }
    impl std::io::Write for ConcurrentWriter {
        fn write(&mut self, bytes: &[u8]) -> std::io::Result<usize> {
            if let Some(conn) = self.writer.take() {
                conn.execute_batch("BEGIN IMMEDIATE; UPDATE metadata SET value='after' WHERE key IN ('snapshot-a','snapshot-b'); COMMIT;").unwrap();
            }
            self.bytes.extend_from_slice(bytes);
            Ok(bytes.len())
        }
        fn flush(&mut self) -> std::io::Result<()> {
            Ok(())
        }
    }
    let mut output = ConcurrentWriter {
        bytes: Vec::new(),
        writer: Some(Connection::open(&path).unwrap()),
    };
    dump::write_sql_dump(&mut repo.conn, &mut output).unwrap();
    let restored = Connection::open_in_memory().unwrap();
    restored
        .execute_batch(std::str::from_utf8(&output.bytes).unwrap())
        .unwrap();
    for key in ["snapshot-a", "snapshot-b"] {
        assert_eq!(get_meta(&restored, key).unwrap().as_deref(), Some("before"));
        assert_eq!(get_meta(&repo.conn, key).unwrap().as_deref(), Some("after"));
    }
    check_integrity(&restored).unwrap();
}

#[test]
fn benchmark_large_scrapbook_preserves_ten_thousand_elements_and_large_photo() {
    let dir = tempdir().unwrap();
    let mut repo = Repository::open(dir.path().join("db")).unwrap();
    let mut data = fixture();
    let mut pixels = vec![0u8; 1024 * 1024 * 4];
    let mut state = 42u32;
    for pixel in pixels.chunks_exact_mut(4) {
        for channel in &mut pixel[..3] {
            state ^= state << 13;
            state ^= state >> 17;
            state ^= state << 5;
            *channel = state as u8;
        }
        pixel[3] = 255;
    }
    let photo = image::RgbaImage::from_raw(1024, 1024, pixels).unwrap();
    let mut bytes = Cursor::new(Vec::new());
    image::DynamicImage::ImageRgba8(photo)
        .write_to(&mut bytes, image::ImageFormat::Png)
        .unwrap();
    let bytes = bytes.into_inner();
    data.contents[0]
        .files
        .get_mut("photo-file")
        .unwrap()
        .data_url = format!("data:image/png;base64,{}", STANDARD.encode(&bytes));
    for i in 5..10000 {
        data.contents[0].elements.push(json!({"id":format!("stroke-{i}"),"type":"freedraw","x":i%1000,"y":i/1000,"width":30,"height":40,"version":1,"points":[[0,0],[10,20],[30,40]],"pressures":[0.2,0.6,0.8],"groupIds":["decorations"]}));
    }
    let start = std::time::Instant::now();
    archive::import_archive(&mut repo, &validated(data), false).unwrap();
    let import = start.elapsed();
    let start = std::time::Instant::now();
    list_books(&repo.conn).unwrap();
    list_pages(&repo.conn, Some("book")).unwrap();
    let metadata = start.elapsed();
    let start = std::time::Instant::now();
    let scene = load_content(&repo.conn, "page").unwrap();
    let restore = start.elapsed();
    assert_eq!(scene.elements.len(), 10000);
    assert_eq!(
        hash(&decode_file(&scene.files["photo-file"]).unwrap()),
        hash(&bytes)
    );
    let ids: Vec<_> = scene.files.keys().cloned().collect();
    let mut delta = scene;
    delta.files.clear();
    let start = std::time::Instant::now();
    request(&mut repo,json!({"type":"saveContent","content":delta,"fileIds":ids,"expectedRevision":delta.revision})).unwrap();
    let save = start.elapsed();
    println!("Measured 10,000 elements + {} byte PNG: import={import:?}, metadata={metadata:?}, restore={restore:?}, delta_save={save:?}",bytes.len());
    check_integrity(&repo.conn).unwrap();
}
