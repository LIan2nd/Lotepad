use crate::{model::*, repository::*};
use rusqlite::{params, Connection, OptionalExtension, TransactionBehavior};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    collections::{HashMap, HashSet},
    io::{Cursor, Read, Seek, Write},
    path::Path,
};
use zip::{write::SimpleFileOptions, ZipArchive, ZipWriter};
const MAX_ARCHIVE: u64 = 150 * 1024 * 1024;
const MAX_EXPANDED: u64 = 512 * 1024 * 1024;
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Inventory {
    pub page_id: String,
    pub file_id: String,
    pub sha256: String,
    pub byte_size: usize,
    pub mime_type: String,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Counts {
    pub notebooks: usize,
    pub pages: usize,
    pub scenes: usize,
    pub assets: usize,
}
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Manifest {
    pub format: String,
    pub format_version: u32,
    pub source_application_version: String,
    pub source_storage_schema_version: u32,
    pub exported_at: String,
    pub data_sha256: String,
    pub counts: Counts,
    pub assets: Vec<Inventory>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Summary {
    pub counts: Counts,
    pub fingerprint: String,
    pub already_imported: bool,
    pub integrity: String,
    pub remapped_notebooks: usize,
    pub remapped_pages: usize,
}
pub struct Validated {
    pub data: ArchiveData,
    pub fingerprint: String,
    pub inventory: Vec<Inventory>,
}
fn remap_route(
    route: &str,
    books: &HashMap<String, String>,
    pages: &HashMap<String, String>,
) -> String {
    fn decode(value: &str) -> Option<String> {
        let bytes = value.as_bytes();
        let mut output = Vec::new();
        let mut i = 0;
        while i < bytes.len() {
            if bytes[i] == b'%' {
                output.push(*hex::decode(bytes.get(i + 1..i + 3)?).ok()?.first()?);
                i += 3;
            } else {
                output.push(if bytes[i] == b'+' { b' ' } else { bytes[i] });
                i += 1;
            }
        }
        String::from_utf8(output).ok()
    }
    route
        .split('&')
        .map(|part| {
            let Some((key, value)) = part.split_once('=') else {
                return part.to_owned();
            };
            let mapping = match key {
                "notebook" => books,
                "page" => pages,
                _ => return part.to_owned(),
            };
            decode(value)
                .and_then(|id| mapping.get(&id))
                .map(|id| format!("{key}={id}"))
                .unwrap_or_else(|| part.to_owned())
        })
        .collect::<Vec<_>>()
        .join("&")
}
pub fn counts(data: &ArchiveData) -> Counts {
    Counts {
        notebooks: data.notebooks.len(),
        pages: data.pages.len(),
        scenes: data.contents.len(),
        assets: data.contents.iter().map(|c| c.files.len()).sum(),
    }
}
pub fn validate_creative(value: &Value) -> Result<()> {
    if value["version"] != 1
        || !value["favorites"]
            .as_array()
            .is_some_and(|v| v.iter().all(Value::is_string))
        || !value["recent"]
            .as_array()
            .is_some_and(|v| v.iter().all(Value::is_string))
        || !value["paletteId"].is_string()
    {
        return fail("Invalid Creative Library preferences.");
    }
    let palettes = value["customPalettes"]
        .as_array()
        .ok_or("Invalid custom palettes.")?;
    let mut ids = HashSet::new();
    for p in palettes {
        if !p["id"].as_str().is_some_and(|id| ids.insert(id))
            || !p["name"].as_str().is_some_and(|s| s.len() <= 320)
            || !["ink", "paper", "accent"]
                .iter()
                .all(|k| validate_color(p[k].as_str().unwrap_or("")))
            || !p["colors"].as_array().is_some_and(|c| {
                (5..=8).contains(&c.len())
                    && c.iter().all(|v| validate_color(v.as_str().unwrap_or("")))
            })
        {
            return fail("Invalid custom palette colors or duplicate identifiers.");
        }
    }
    Ok(())
}
fn validate_media(file: &File, bytes: &[u8]) -> Result<()> {
    if file.mime_type == "image/svg+xml" {
        let source = std::str::from_utf8(bytes).map_err(err)?;
        if source.to_lowercase().contains("<!doctype") {
            return fail("SVG document types are not supported.");
        }
        let document =
            roxmltree::Document::parse(source).map_err(|e| format!("Invalid SVG asset: {e}"))?;
        if document.root_element().tag_name().name() != "svg" {
            return fail("Invalid SVG root.");
        }
        for node in document.descendants().filter(|n| n.is_element()) {
            if [
                "script",
                "foreignobject",
                "iframe",
                "object",
                "embed",
                "style",
            ]
            .contains(&node.tag_name().name().to_lowercase().as_str())
            {
                return fail("An SVG contains unsupported active content. Export a sanitized SVG or raster image.");
            }
            for attr in node.attributes() {
                let name = attr.name().to_lowercase();
                let value = attr.value().trim().to_lowercase();
                let unsafe_url = value
                    .split("url(")
                    .skip(1)
                    .any(|part| !part.trim_start().starts_with('#'));
                if name.starts_with("on")
                    || ((name == "href" || name == "src") && !value.starts_with('#'))
                    || unsafe_url
                {
                    return fail("An SVG references external or active content.");
                }
            }
        }
    } else {
        let format = match file.mime_type.as_str() {
            "image/png" => image::ImageFormat::Png,
            "image/jpeg" => image::ImageFormat::Jpeg,
            "image/webp" => image::ImageFormat::WebP,
            "image/gif" => image::ImageFormat::Gif,
            _ => return fail("Unsupported image type."),
        };
        let mut reader = image::ImageReader::new(Cursor::new(bytes));
        reader.set_format(format);
        let (w, h) = reader
            .into_dimensions()
            .map_err(|e| format!("Invalid image asset: {e}"))?;
        if w == 0 || h == 0 || (w as u64) * (h as u64) > 50_000_000 {
            return fail("An image exceeds 50 megapixels.");
        }
        image::load_from_memory_with_format(bytes, format)
            .map_err(|e| format!("Corrupted image pixels: {e}"))?;
    }
    Ok(())
}
pub fn validate_data(data: &ArchiveData, strict_media: bool) -> Result<Vec<Inventory>> {
    if !["lotepad", "InkNest"].contains(&data.app.as_str()) || data.version != 1 {
        return fail("Unsupported Lotepad data format.");
    }
    if data.pages.len() > 50000 || data.notebooks.len() > 20000 {
        return fail("Archive contains too many records.");
    }
    validate_settings(&data.settings)?;
    if let Some(prefs) = &data.creative {
        validate_creative(prefs)?;
    }
    let mut books = HashSet::new();
    for b in &data.notebooks {
        validate_book(b)?;
        if !books.insert(b.id.clone()) {
            return fail("Duplicate notebook IDs in archive.");
        }
    }
    let mut pages = HashSet::new();
    for p in &data.pages {
        validate_page(p)?;
        if !books.contains(&p.notebook_id) || !pages.insert(p.id.clone()) {
            return fail("Duplicate page IDs or missing notebook.");
        }
    }
    let mut scenes = HashSet::new();
    let mut inventory = Vec::new();
    for scene in &data.contents {
        if !pages.contains(&scene.page_id) || !scenes.insert(scene.page_id.clone()) {
            return fail("Duplicate scenes or a scene without its page.");
        }
        validate_scene(scene, &scene.files.keys().cloned().collect())?;
        for (id, file) in &scene.files {
            if &file.id != id {
                return fail("Asset identifier mismatch.");
            }
            let bytes = decode_file(file)?;
            if strict_media {
                validate_media(file, &bytes)?;
            }
            inventory.push(Inventory {
                page_id: scene.page_id.clone(),
                file_id: id.clone(),
                sha256: hash(&bytes),
                byte_size: bytes.len(),
                mime_type: file.mime_type.clone(),
            });
        }
    }
    if scenes != pages {
        return fail("Some pages are missing their scenes.");
    }
    let mut keys = HashSet::new();
    for meta in &data.metadata {
        if !keys.insert(&meta.key) {
            return fail("Duplicate metadata keys.");
        }
        if meta.key == "creative-library-v1" {
            validate_creative(&serde_json::from_str(&meta.value).map_err(err)?)?;
        }
    }
    keys.clear();
    for p in &data.preferences {
        if !keys.insert(&p.key) {
            return fail("Duplicate preference keys.");
        }
        if p.key == "settings" {
            validate_settings(&p.value)?;
        }
    }
    Ok(inventory)
}
pub fn read_archive(path: &Path) -> Result<Validated> {
    let file = std::fs::File::open(path).map_err(err)?;
    if file.metadata().map_err(err)?.len() > MAX_ARCHIVE {
        return fail("Archive exceeds 150 MB.");
    }
    read_archive_bytes(file)
}
pub fn read_archive_bytes<R: Read + Seek>(mut input: R) -> Result<Validated> {
    let mut original = Vec::new();
    input
        .by_ref()
        .take(MAX_ARCHIVE + 1)
        .read_to_end(&mut original)
        .map_err(err)?;
    if original.len() as u64 > MAX_ARCHIVE {
        return fail("Archive exceeds 150 MB.");
    }
    let fingerprint = hash(&original);
    let mut zip =
        ZipArchive::new(Cursor::new(original)).map_err(|e| format!("Invalid ZIP archive: {e}"))?;
    if zip.len() > 10000 {
        return fail("Too many archive entries.");
    }
    let mut total = 0u64;
    let mut names = HashSet::new();
    for i in 0..zip.len() {
        let file = zip.by_index(i).map_err(err)?;
        let name = file.name();
        if file.enclosed_name().is_none()
            || name.contains('\\')
            || name.contains(':')
            || name.split('/').any(|p| p == "..")
            || !names.insert(name.to_owned())
        {
            return fail("Unsafe or duplicate ZIP entry.");
        }
        total = total
            .checked_add(file.size())
            .ok_or("Archive size overflow")?;
        if total > MAX_EXPANDED {
            return fail("Decompressed archive exceeds 512 MB.");
        }
        if !["manifest.json", "data.json"].contains(&name) {
            return fail("This archive contains unsupported files. No files have been extracted.");
        }
    }
    let mut manifest = String::new();
    zip.by_name("manifest.json")
        .map_err(|_| "Archive manifest is missing.")?
        .take(MAX_EXPANDED + 1)
        .read_to_string(&mut manifest)
        .map_err(err)?;
    let manifest_value: Value = serde_json::from_str(&manifest).map_err(err)?;
    let (data, expected) = if manifest_value["format"] == "lotepad-portable" {
        let manifest: Manifest = serde_json::from_value(manifest_value).map_err(err)?;
        if manifest.format_version != 2 || manifest.source_storage_schema_version > 1 {
            return fail("Unsupported portable archive version.");
        }
        let mut bytes = Vec::new();
        zip.by_name("data.json")
            .map_err(|_| "Archive data is missing.")?
            .take(MAX_EXPANDED + 1)
            .read_to_end(&mut bytes)
            .map_err(err)?;
        if hash(&bytes) != manifest.data_sha256 {
            return fail("Archive data checksum mismatch.");
        }
        let data: ArchiveData = serde_json::from_slice(&bytes).map_err(err)?;
        if manifest.counts != counts(&data) {
            return fail("Archive counts do not match its content.");
        }
        (data, Some(manifest.assets))
    } else {
        (
            serde_json::from_value::<ArchiveData>(manifest_value).map_err(err)?,
            None,
        )
    };
    let inventory = validate_data(&data, true)?;
    if let Some(expected) = expected {
        let values: HashMap<_, _> = expected
            .iter()
            .map(|a| {
                (
                    (a.page_id.as_str(), a.file_id.as_str()),
                    (a.sha256.as_str(), a.byte_size, a.mime_type.as_str()),
                )
            })
            .collect();
        if values.len() != expected.len()
            || values.len() != inventory.len()
            || inventory.iter().any(|a| {
                values.get(&(a.page_id.as_str(), a.file_id.as_str()))
                    != Some(&(a.sha256.as_str(), a.byte_size, a.mime_type.as_str()))
            })
        {
            return fail("Asset inventory checksum mismatch.");
        }
    }
    Ok(Validated {
        data,
        fingerprint,
        inventory,
    })
}
pub fn write_archive<W: Write + Seek>(conn: &mut Connection, output: W) -> Result<()> {
    let tx = conn.transaction().map_err(err)?;
    let data = read_snapshot(&tx)?;
    let inventory = validate_data(&data, true)?;
    let bytes = serde_json::to_vec(&data).map_err(err)?;
    let manifest = Manifest {
        format: "lotepad-portable".into(),
        format_version: 2,
        source_application_version: env!("CARGO_PKG_VERSION").into(),
        source_storage_schema_version: 1,
        exported_at: chrono::Utc::now().to_rfc3339(),
        data_sha256: hash(&bytes),
        counts: counts(&data),
        assets: inventory,
    };
    let mut zip = ZipWriter::new(output);
    let options = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
    zip.start_file("manifest.json", options).map_err(err)?;
    serde_json::to_writer(&mut zip, &manifest).map_err(err)?;
    zip.start_file("data.json", options).map_err(err)?;
    zip.write_all(&bytes).map_err(err)?;
    zip.finish().map_err(err)?;
    tx.commit().map_err(err)?;
    Ok(())
}
pub fn preview(conn: &Connection, archive: &Validated) -> Result<Summary> {
    let imported = conn
        .query_row(
            "SELECT 1 FROM import_history WHERE archive_fingerprint=?1",
            [&archive.fingerprint],
            |_| Ok(()),
        )
        .optional()
        .map_err(err)?
        .is_some();
    Ok(Summary {
        counts: counts(&archive.data),
        fingerprint: archive.fingerprint.clone(),
        already_imported: imported,
        integrity: "Validated archive, scene references, media, and SHA-256 checksums".into(),
        remapped_notebooks: 0,
        remapped_pages: 0,
    })
}
pub fn import_archive(
    repo: &mut Repository,
    archive: &Validated,
    replace: bool,
) -> Result<Summary> {
    import_with_hook(repo, archive, replace, || Ok(()))
}
pub fn import_with_hook(
    repo: &mut Repository,
    archive: &Validated,
    replace: bool,
    after_insert: impl FnOnce() -> Result<()>,
) -> Result<Summary> {
    validate_data(&archive.data, true)?;
    let mut summary = preview(&repo.conn, archive)?;
    if summary.already_imported && !replace {
        return Ok(summary);
    }
    let tx = repo
        .conn
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(err)?;
    if replace {
        tx.execute_batch("DELETE FROM notebooks; DELETE FROM assets; DELETE FROM app_settings; DELETE FROM metadata; DELETE FROM import_history;").map_err(err)?;
    }
    let fresh = list_books(&tx)?.is_empty();
    let mut data = archive.data.clone();
    let mut books = HashSet::new();
    for book in list_books(&tx)? {
        books.insert(book.id);
    }
    let mut pages = HashSet::new();
    for page in list_pages(&tx, None)? {
        pages.insert(page.id);
    }
    let mut book_map = HashMap::new();
    let mut page_map = HashMap::new();
    fn remap(
        original: &str,
        kind: &str,
        fingerprint: &str,
        existing: &mut HashSet<String>,
    ) -> String {
        if existing.insert(original.to_owned()) {
            return original.into();
        }
        let mut attempt = 0;
        loop {
            let id = uuid::Uuid::new_v5(
                &uuid::Uuid::NAMESPACE_URL,
                format!("lotepad:{fingerprint}:{kind}:{original}:{attempt}").as_bytes(),
            )
            .to_string();
            if existing.insert(id.clone()) {
                return id;
            }
            attempt += 1;
        }
    }
    for book in &mut data.notebooks {
        let old = book.id.clone();
        book.id = remap(&old, "notebook", &archive.fingerprint, &mut books);
        if old != book.id {
            summary.remapped_notebooks += 1;
        }
        book_map.insert(old, book.id.clone());
        insert_book(&tx, book)?;
    }
    for page in &mut data.pages {
        let old = page.id.clone();
        page.id = remap(&old, "page", &archive.fingerprint, &mut pages);
        page.notebook_id = book_map
            .get(&page.notebook_id)
            .ok_or("Missing notebook mapping")?
            .clone();
        if old != page.id {
            summary.remapped_pages += 1;
        }
        page_map.insert(old, page.id.clone());
        insert_page(&tx, page)?;
    }
    for content in &mut data.contents {
        content.page_id = page_map
            .get(&content.page_id)
            .ok_or("Missing scene mapping")?
            .clone();
        content.revision = None;
        write_content(&tx, content, Some(0), None)?;
        let mut restored = load_content(&tx, &content.page_id)?;
        restored.revision = None;
        if &restored != content {
            return fail("Scene reconstruction differs from imported data. Import rolled back.");
        }
    }
    after_insert()?;
    for pref in &data.preferences {
        let key = if !replace && !fresh && get_setting(&tx, &pref.key)?.is_some() {
            format!("import:{}:{}", &archive.fingerprint[..16], pref.key)
        } else {
            pref.key.clone()
        };
        put_setting(&tx, &key, &pref.value)?;
    }
    if replace || fresh || get_setting(&tx, "settings")?.is_none() {
        put_setting(&tx, "settings", &data.settings)?;
    }
    for meta in &data.metadata {
        if meta.key == "creative-library-v1" {
            continue;
        }
        let key = if !replace && get_meta(&tx, &meta.key)?.is_some() {
            format!("import:{}:{}", &archive.fingerprint[..16], meta.key)
        } else {
            meta.key.clone()
        };
        let mut value = meta.value.clone();
        if meta.key == "lastRoute" {
            value = remap_route(&value, &book_map, &page_map);
        }
        put_meta(&tx, &key, &value)?;
    }
    let incoming = data.creative.clone().or_else(|| {
        data.metadata
            .iter()
            .find(|m| m.key == "creative-library-v1")
            .and_then(|m| serde_json::from_str(&m.value).ok())
    });
    if let Some(mut creative) = incoming {
        if !replace {
            if let Some(existing) = get_meta(&tx, "creative-library-v1")? {
                let mut current: Value = serde_json::from_str(&existing).map_err(err)?;
                validate_creative(&current)?;
                for key in ["favorites", "recent"] {
                    let mut seen = HashSet::new();
                    let values = current[key]
                        .as_array()
                        .unwrap()
                        .iter()
                        .chain(creative[key].as_array().unwrap())
                        .filter(|v| seen.insert(v.as_str().unwrap().to_owned()))
                        .cloned()
                        .take(if key == "recent" { 30 } else { usize::MAX })
                        .collect();
                    current[key] = Value::Array(values);
                }
                for mut palette in creative["customPalettes"].as_array().unwrap().clone() {
                    if let Some(old) = current["customPalettes"]
                        .as_array()
                        .unwrap()
                        .iter()
                        .find(|p| p["id"] == palette["id"])
                    {
                        if old == &palette {
                            continue;
                        }
                        palette["id"] = json!(format!(
                            "custom-{}",
                            uuid::Uuid::new_v5(
                                &uuid::Uuid::NAMESPACE_URL,
                                format!("{}:{}", archive.fingerprint, palette["id"]).as_bytes()
                            )
                        ));
                    }
                    current["customPalettes"]
                        .as_array_mut()
                        .unwrap()
                        .push(palette);
                }
                creative = current;
            }
        }
        validate_creative(&creative)?;
        put_meta(
            &tx,
            "creative-library-v1",
            &serde_json::to_string(&creative).map_err(err)?,
        )?;
    }
    put_meta(&tx, "initialized", "1")?;
    check_integrity(&tx)?;
    for page in &data.pages {
        let actual = get_page(&tx, &page.id)?.ok_or("Imported page is missing")?;
        if &actual != page {
            return fail("Imported page metadata differs from source.");
        }
    }
    for book in &data.notebooks {
        if get_book(&tx, &book.id)?.as_ref() != Some(book) {
            return fail("Imported notebook metadata differs from source.");
        }
    }
    summary.integrity =
        "Verified scenes, asset bytes, metadata, SQLite integrity, and foreign keys".into();
    summary.already_imported = false;
    for history in &data.import_history {
        if history.status != "verified"
            || history.archive_fingerprint.len() != 64
            || !history
                .archive_fingerprint
                .bytes()
                .all(|b| b.is_ascii_hexdigit())
        {
            return fail("Invalid import history record.");
        }
        tx.execute("INSERT OR IGNORE INTO import_history(archive_fingerprint,source_format,status,imported_at,summary_json)VALUES(?1,?2,?3,?4,?5)",params![history.archive_fingerprint,history.source_format,history.status,history.imported_at,serde_json::to_string(&history.summary).map_err(err)?]).map_err(err)?;
    }
    tx.execute("INSERT INTO import_history(archive_fingerprint,source_format,status,imported_at,summary_json)VALUES(?1,'lotepad-portable','verified',?2,?3)ON CONFLICT(archive_fingerprint)DO UPDATE SET imported_at=excluded.imported_at,summary_json=excluded.summary_json",params![archive.fingerprint,now(),serde_json::to_string(&summary).map_err(err)?]).map_err(err)?;
    tx.commit().map_err(err)?;
    Ok(summary)
}
