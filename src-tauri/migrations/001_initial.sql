CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL);
CREATE TABLE notebooks(
 id TEXT PRIMARY KEY NOT NULL,
 data_json TEXT NOT NULL CHECK(json_valid(data_json)),
 updated_at INTEGER NOT NULL,
 deleted_at INTEGER
);
CREATE INDEX notebooks_updated ON notebooks(updated_at);
CREATE TABLE pages(
 id TEXT PRIMARY KEY NOT NULL,
 notebook_id TEXT NOT NULL REFERENCES notebooks(id) ON DELETE CASCADE,
 data_json TEXT NOT NULL CHECK(json_valid(data_json)),
 sort_order INTEGER NOT NULL,
 updated_at INTEGER NOT NULL,
 deleted_at INTEGER,
 revision INTEGER NOT NULL DEFAULT 0 CHECK(revision>=0)
);
CREATE INDEX pages_notebook_order ON pages(notebook_id,sort_order);
CREATE INDEX pages_recent ON pages(updated_at);
CREATE TABLE page_scenes(
 page_id TEXT PRIMARY KEY NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
 scene_json TEXT NOT NULL CHECK(json_valid(scene_json)),
 scene_format_version INTEGER NOT NULL DEFAULT 1,
 updated_at INTEGER NOT NULL
);
CREATE TABLE assets(
 content_hash TEXT PRIMARY KEY NOT NULL,
 media_type TEXT NOT NULL,
 binary_data BLOB NOT NULL,
 byte_size INTEGER NOT NULL CHECK(byte_size=length(binary_data)),
 created_at INTEGER NOT NULL
);
CREATE TABLE page_asset_references(
 page_id TEXT NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
 file_id TEXT NOT NULL,
 asset_hash TEXT NOT NULL REFERENCES assets(content_hash),
 metadata_json TEXT NOT NULL CHECK(json_valid(metadata_json)),
 PRIMARY KEY(page_id,file_id)
);
CREATE INDEX asset_reference_hash ON page_asset_references(asset_hash);
CREATE TABLE app_settings(
 key TEXT PRIMARY KEY NOT NULL,
 value_json TEXT NOT NULL CHECK(json_valid(value_json)),
 updated_at INTEGER NOT NULL
);
CREATE TABLE metadata(key TEXT PRIMARY KEY NOT NULL,value TEXT NOT NULL);
CREATE TABLE import_history(
 archive_fingerprint TEXT PRIMARY KEY NOT NULL,
 source_format TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status='verified'),
 imported_at INTEGER NOT NULL,
 summary_json TEXT NOT NULL CHECK(json_valid(summary_json))
);
INSERT INTO schema_migrations VALUES(1,CAST(strftime('%s','now') AS INTEGER)*1000);
PRAGMA user_version=1;
PRAGMA application_id=1280267333;
