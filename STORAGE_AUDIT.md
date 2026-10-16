# Storage audit before desktop migration

Checkpoint: `main` / `8ca9932`. Desktop work is isolated on `tauri-sqlite`.

Delivery update: the desktop migration was subsequently merged into `main` at
the user's request. The original `8ca9932` browser checkpoint is preserved on
`web-legacy`; the audit and initial plan below describe the pre-migration state.

The existing frontend uses React 19, Vite 7, TypeScript, Excalidraw 0.18.1,
Dexie 4, Zustand for UI state, JSZip, Radix, and a precached PWA.

## Existing authoritative browser storage

Database `inknest`, Dexie schema version 1:

| Table | Key | Content |
| --- | --- | --- |
| notebooks | id | Title, color, icon, favorite, created/updated/deleted timestamps |
| pages | id | Notebook relationship, title, paper/mode/size/color, order, timestamps, trash state |
| contents | pageId | Native Excalidraw elements, allowed editor state, embedded image files, initialized flag |
| preferences | key | Application settings under `settings` |
| meta | key | Initialization marker, last route, versioned Creative Library favorites/recent/custom palettes |

Images and generated SVG decorations are base64 data URLs in each scene's files
map. Element `fileId` references that map. IDs, group membership, bindings,
deleted elements used by undo, and customData must remain unchanged. Built-in
asset definitions are code and bundled SVG; there is no separate custom sticker,
user template, or collection table to invent during migration.

No application content is stored in localStorage, sessionStorage, or OPFS.
Cache Storage contains service-worker application assets/fonts, not user notes.
Browser origin/profile owns the IndexedDB; Tauri cannot read the external
browser's database. Existing ZIP version 1 contains a manifest with notebooks,
pages, scenes/files, settings, and optional creative preferences; it omits other
meta records. The migration archive will explicitly include those records.

The original Autosave queue debounces at 600 ms, serializes saves, retains failed
pending state, and flushes before navigation. It lacks a maximum debounce wait,
native close handling, and database revision checks. These will be added without
moving high-frequency drawing state into React or sending IPC on every pointer move.

UI currently reads Dexie directly through useLiveQuery in Dashboard/Editor and
through direct metadata calls in App, PageDialog, backup, and creative preferences.
These access paths must all go through a repository interface on desktop.

## Implementation plan

1. Keep the browser backend in an explicit web build; keep `main` unchanged.
2. Introduce typed repository methods and subscriptions; remove raw Dexie calls
   from application components. Desktop build must reject a missing native bridge.
3. Integrate Tauri 2. Use one Rust repository backed by rusqlite, with blocking
   work dispatched off the UI thread. This choice gives direct, tested SQLite
   online-backup and typed value APIs for lossless, streamed SQL dumps without a
   separately installed CLI. No frontend SQL executor or second database plugin.
4. Store `lotepad.db` under the stable native app-data identifier. Use foreign
   keys, WAL, synchronous FULL, busy timeout, schema migrations, atomic writes,
   optimistic page revisions, content-addressed BLOBs, and lazy per-page loading.
5. Add bounded, checksummed ZIP migration/backup, native merge/preview/verification,
   import fingerprints, native save/open dialogs, and recovery snapshots before
   replacement. Never read or mutate the original browser database from desktop.
6. Implement consistent SQLite snapshot and streaming executable SQL dump export.
   SQL restore is deliberately excluded from the application UI.
7. Verify with synthetic databases/archives, browser tests, Rust tests, a real
   Windows compile, packaging, and native smoke tests where prerequisites allow.

Native prerequisites at audit time: Node 24 was available; Rust/MSVC Build Tools
were missing. The user authorized installation. Rust stable and Visual Studio
2022 Build Tools with the Windows SDK are now installed. No actual user data
migration is performed automatically.
