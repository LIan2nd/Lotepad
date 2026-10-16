# Lotepad desktop migration

The original web checkpoint is `8ca9932`, preserved on `web-legacy`. Desktop changes
were developed on `tauri-sqlite` and merged into `main`; both desktop and web builds
remain available on `main`.
The original `inknest` IndexedDB database is neither renamed nor opened by the
desktop backend. Do not copy Chromium's internal database files between profiles.

## Architecture

The existing React/Excalidraw UI calls a typed persistence interface. A desktop
build requires Tauri IPC and uses a single Rust/rusqlite repository. There is no
IndexedDB or localStorage fallback after a native failure. The explicitly separate
web build retains Dexie for the browser application and export bridge.

Rust database work runs on blocking worker threads, away from the WebView's event
loop. rusqlite was selected for one consistent repository implementation with
direct online-backup support and typed SQLite values for streamed SQL export.
No frontend SQL runner, SQL plugin, HTTP backend, or local Node server is used in
the packaged application. Zustand continues to hold UI state only.

See `STORAGE_AUDIT.md` for the source schema and complete storage inventory.

## Native database

Stable application identifier: `com.lotepad.desktop`.

The filename is `lotepad.db` in Tauri's application-data directory, normally
`%APPDATA%\com.lotepad.desktop\lotepad.db` on Windows. **Settings → Data & Storage**
shows the actual resolved path and provides **Open Data Folder**. The database is
never written beside the executable or under Program Files. Changing the app
identifier would create a different storage location; keep it stable for updates.

Schema version 1 has notebooks, pages, page_scenes, assets,
page_asset_references, app_settings, metadata, import_history, and
schema_migrations. The initial migration is in `src-tauri/migrations`.

Metadata JSON preserves domain properties and scrapbook customData rather than
normalizing individual strokes. Foreign keys, indexes, and constraints protect
relationships. Scenes retain native element IDs, ordering, text bindings, groups,
versions, and deleted undo elements. Per-page file IDs map to content-addressed
SHA-256 BLOBs. This prevents collisions between images sharing an Excalidraw file
ID on different imported pages. All file metadata is preserved. Only the opened
page's scene/media is reconstructed; dashboard queries read metadata only.

Every connection enables foreign keys and a five-second busy timeout. The writer
uses WAL and synchronous FULL: committed writes are synced for durability at a
higher write cost than NORMAL. SQLite still depends on the OS/storage device
honoring flush requests. A single serialized writer and separate consistent
backup readers avoid exclusive locks during ordinary editing/export.

## Autosave and recovery

The editor keeps drawing state in Excalidraw. Autosave debounces at 600 ms with a
five-second maximum wait during continuous editing. Pending data is retained on
failure; the interface distinguishes Unsaved, Saving, Saved, and Save failed.
Saved is shown only after the transaction commits.

Page IDs and optimistic SQLite revisions prevent stale scenes from overwriting
newer content. Existing image bytes are not sent over IPC again unless they
change. Navigation and normal native close flush pending work. A failed close
flush keeps the window open. Abrupt power/process failure can lose the current
uncommitted interval; no close callback can remove that physical limitation.
If saving fails, export editable Excalidraw JSON to preserve the in-memory scene.

Before replacing desktop content, Lotepad makes a WAL-safe recovery snapshot under
the app-data `recovery` directory. Five snapshots are retained. This is a recovery
foundation, not a full page-history UI. Failed imports roll back; successful import
history is recorded in the same transaction as verified records.

## Move existing browser notes

1. Keep the browser version and its existing origin/profile/port intact.
2. In that browser's Lotepad, open **Settings → Export for Lotepad Desktop**.
   This branch's separate web build includes the action; a complete ZIP backup
   from the original browser release (`web-legacy`) is also supported.
3. Save the ZIP somewhere outside browser storage. Export only reads source data.
4. In Lotepad Desktop, open **Settings → Data & Storage → Import notes or restore
   backup**. Select that ZIP through the native file picker.
5. Review the notebook/page/scene/asset counts and validation result. **Import &
   verify** merges with existing notes. Colliding notebook/page IDs are remapped
   deterministically and all notebook/page relationships are updated. Native
   element IDs and bindings remain unchanged.
6. Wait for the verified completion screen. Inspect representative notes, images,
   editable captions, and a scrapbook composition. Export a new desktop backup.
7. Keep the original browser data and source archive as an independent rollback
   copy. The app does not erase them after migration.

A fresh desktop database adopts the source settings; a merge into existing notes
retains current desktop settings and preserves conflicting imported preferences
under namespaced keys. Favorites/recent items and custom palettes are merged.
Unrecognized metadata/preference records are retained, not silently discarded.
The exact same archive is detected by SHA-256 and cannot duplicate all notes on a
repeated merge. Explicit replacement remains a separate confirmed operation.

## Portable archive format

New portable format version 2 contains `manifest.json` and `data.json`. The
manifest identifies Lotepad, source application/storage versions, export time,
entity counts, SHA-256 of the JSON payload, and an inventory of every embedded
asset with its decoded byte length, MIME type, and SHA-256. The payload retains
version-1 domain data plus complete metadata/preferences and native import history.
Files remain embedded as base64 for compatibility with Excalidraw serialization;
ZIP compression handles that representation. This is intentionally different from
the native SQLite BLOB storage representation.

Legacy Lotepad and InkNest ZIP manifests (schema 1) are accepted with the same
structural/media/reference validation. They cannot supply hashes that were never
recorded; the importer computes asset hashes and verifies reconstruction itself.

Limits: 150 MB compressed, 512 MB declared decompressed content, 10,000 ZIP
entries, 50,000 pages, 200,000 elements per scene, 72 MB per decoded asset, and
50 megapixels per raster image. ZIP paths, duplicate entries/IDs, missing scenes,
missing image/container/binding references, corrupt images, unsupported versions,
and active/external SVG resources are rejected. Archives are never extracted to
arbitrary filesystem paths. A file changed after preview must be validated again.

## Backups

**Portable Backup (.zip)** is the application-level cross-version backup, including
scenes/media/settings/library metadata. The import wizard supports merge or
explicit replacement. Replacement first creates a recovery snapshot.

**SQLite Snapshot (.db)** uses SQLite's online-backup API, includes committed WAL
changes, and passes integrity checks before being finalized. Copying only a live
`lotepad.db` file can omit WAL content; use this export instead. Snapshot export is
provided; the app does not offer raw `.db` replacement. Prefer the portable ZIP for
normal in-app restoration. Keep snapshots for isolated recovery with SQLite tools.

**SQL Dump (.sql)** is an executable SQLite script, not a renamed binary database.
It includes application/schema metadata, table definitions and constraints, every
row (including image/sticker BLOBs as hexadecimal literals), indexes, views,
triggers, and sqlite_sequence where applicable. Quotes, Unicode, embedded NUL
text, NULL, integers, and floating point values are represented losslessly.
Generated columns are recreated by their schema rather than inserted directly.
Unsupported virtual tables fail explicitly instead of producing an incomplete dump.

A single read transaction pins the source WAL snapshot. Output streams through a
buffered writer on a Rust worker. Native Save dialogs choose the destination;
temporary output in that same directory is flushed/synced and atomically finalized
only after success. Cancellation is not reported as success. Write/disk-full errors
leave the active database unchanged; incomplete temporary output is removed on
ordinary error cleanup. Sudden process termination may leave an unfinalized
`.lotepad-*` temporary file, which is not a valid completed backup.

All three backups contain unencrypted notes and media. SQL restore is intentionally
absent: do not execute arbitrary imported SQL against the live database. To verify
a dump independently, execute it into a separate, empty SQLite database and run
`PRAGMA integrity_check` and `PRAGMA foreign_key_check`. Automated Rust tests do
this and compare every table and asset bytes.

## Development and packaging

Prerequisites: Node 22.12+ (24 recommended), Rust stable with the MSVC target,
Microsoft C++ Build Tools with Desktop development with C++/Windows SDK, and
WebView2. Rust and Build Tools installation were authorized for this workstation.
See the official [Tauri Windows prerequisites](https://v2.tauri.app/start/prerequisites/).

```powershell
npm.cmd install
npm.cmd run tauri dev
npm.cmd run tauri build
```

The Tauri development frontend uses port 1420 with strict port selection. Existing
web servers on 5173/5174 are not reused. The wrapper scripts discover the standard
Rust user bin directory, so a terminal opened before Rust installation can still
run the npm commands. Production embeds `dist-desktop`; it does not register a
service worker or require a running server. Bundled fonts/stickers work offline.

Desktop development keeps Excalidraw in Vite's dependency optimizer so its
CommonJS dependencies load correctly when a notebook opens. The local-font
adapter also runs inside the optimizer; excluding the SDK from optimization
causes a blank editor in dev even when the production build works.
`npm.cmd run test:dev` tests the actual desktop Vite module graph and font CSP
without reading or writing the user's native database. It reuses port 1420 when
the desktop dev server is already running.

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test
npm.cmd run test:rust
npm.cmd run build:web
npm.cmd run test:e2e
```

Web build output remains `dist`; desktop output is `dist-desktop`. To keep using
the browser version, use `dev:web` and `build:web` on `main`. The original browser
release remains on `web-legacy`. Keep its original origin for existing data.

The installer target is per-user NSIS. Windows must have WebView2; the installer
can download Microsoft's bootstrapper when the runtime is missing. Ordinary app
operation is offline. This release has no signing certificate or automatic updater.
Updating with the same application identifier retains the data directory and runs
versioned migrations. Never delete the data folder to update the app.

## Verification status

See the final delivery and README for actual completed build/test results and
installer paths. Source tests include legacy web regression, portable exports,
maximum-wait autosave, native IPC revision/media behavior, SQLite reopen/CRUD,
collision/duplicate imports, interrupted rollback, corrupt archive rejection,
SQL execution into a fresh database, generated columns/triggers/sequence state,
BLOB hashes, WAL snapshots, and injected disk-full export errors.

Executed on Windows 11 Pro build 26100, Node 24.21, Rust 1.99.1/MSVC, and
WebView2 155.0.4283.45 on 2026-10-16:

| Check | Result |
| --- | --- |
| TypeScript and ESLint | Passed |
| Vitest | 23 passed |
| Rust persistence/archive/SQL tests | 12 passed |
| Production web Playwright tests | 12 passed |
| Desktop and web production frontend builds | Passed |
| Windows release build and NSIS packaging | Passed; installer approximately 18.49 MiB |
| Native WebView2 workflow | Passed: drawing, sticker, template, restart, offline reload, file dialogs, three backups, cancelled export, browser migration, duplicate detection, portable replacement and recovery snapshot |
| Independent SQL restoration | Passed using Node's SQLite engine; all nine tables and eight unique asset hashes matched the native `.db` snapshot |

The native workflow uses an isolated debug data directory under `artifacts/`.
Its verified report is `artifacts/native-1792118122072/report.json` for this run.
The production executable was also launched without a development server,
reloaded offline, and closed normally. It used the real application-data path,
ignored the debug-only directory override, passed database integrity checks, and
created no IndexedDB database or service worker. Its report is
`artifacts/release-1792118693317/report.json`. This first release launch with a
fresh WebView profile took 8.69 s; it is a measured first-run result, not a promised
startup time. The normal application database was left empty for your notes.
An immediate repeat using the same WebView profile measured 1.73 s; its report is
`artifacts/release-1792118769250/report.json`.
It imported the archive downloaded by the real browser export test, compared the
PNG and scene, restored the desktop ZIP, and checked the pre-replacement recovery
snapshot. No actual browser notes were migrated. Asset inventory counts refer
to page/file references; the SQLite assets table deduplicates identical bytes.

To reproduce the native workflow on an interactive English-language Windows
desktop (native file-dialog automation uses the File name accelerator):

```powershell
npm.cmd run build:web
npx.cmd playwright test tests/migration.spec.ts
npm.cmd run tauri build -- --debug --no-bundle
npm.cmd run test:native
```

Measured debug benchmarks are synthetic observations, not production guarantees.
A recorded Rust run measured 10,000 drawing elements plus a 4,195,716-byte PNG:
import/validation 5.18 s, notebook/page metadata query 0.24 ms, scene reconstruction
278 ms, and an asset-delta save 648 ms. The debug native window reached its initial
UI in 1.49 s with a fresh WebView profile. These runs shared the machine with
compilation; they are not OS cold-cache measurements. Large imports remain a
worker operation and full archive validation can consume substantial memory.

Generated Windows outputs:

- `src-tauri/target/release/lotepad.exe`
- `src-tauri/target/release/bundle/nsis/Lotepad_1.2.0_x64-setup.exe`

Installer SHA-256 for this build:
`F063D178A4378FF072081D2F61BEF6C3444B2274E29ADD5331E3ED4F95105355`.
The installer was generated; an install/upgrade/uninstall cycle on a clean second
Windows machine and physical pen/touch testing remain pending.

`node scripts/native-release-smoke.mjs` repeats the production startup/offline
check without creating or importing notes. It uses the real app-data directory;
on first launch, the app creates its normal empty database. The broader debug
workflow above is the isolated test for destructive restore scenarios.

Rust dependency license texts are included in `public/RUST_THIRD_PARTY_NOTICES.txt`.
After changing Cargo dependencies and fetching the Windows target, regenerate
them with `node scripts/rust-notices.mjs` before packaging.

The desktop Vite adapter removes Excalidraw 0.18.1's automatic CDN font fallback;
all bundled font sources and public font APIs remain intact. It deliberately
fails the build if that SDK implementation changes, requiring review on upgrade.

Physical Windows touch/stylus hardware validation remains a user-device check.
Imported SVGs containing script/style elements or external references are
rejected explicitly. Keep the source archive and use a sanitized SVG or raster
asset; the importer does not silently discard an unsupported file.
Browser automation is not a substitute for testing pressure, palm rejection, or
pinch behavior on the target laptop. Full page history, SQL restore, direct `.db`
restore, encryption, PDF/OCR, arbitrary photo masks, and a custom serif canvas font
remain outside this migration.
