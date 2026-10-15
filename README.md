# lotepad

A calm, local-first creative notebook for Windows touchscreen laptops, tablets, and desktops. Organize notebooks, take paper-style notes, and explore an infinite canvas. No accounts, backend, paid APIs, analytics, or uploads.

## Run locally

Requires Node.js 22.12+ (Node 24 recommended) and npm. In PowerShell, use `npm.cmd` if execution policy blocks `npm.ps1`.

```sh
npm install
npm run dev
```

Open the local URL printed by Vite. Installation copies the drawing fonts into `public/fonts`, generates PWA icons, and collects dependency license notices. Internet is needed for dependency installation; saved notes do not require it.

```sh
npm run typecheck
npm run lint
npm test
npm run build
npm run preview
```

The production app is available at `http://localhost:4173`. Serve the `dist` folder with any static HTTPS server, or localhost. This project is configured for hosting at the origin root. Keep the same origin/port when accessing your existing notebook database.

## What works

- Create, rename, recolor, favorite, duplicate, search, sort, and trash notebooks. Restore or permanently delete trashed notebooks with confirmation.
- Separate named pages, duplication, ordering, and deletion. Example notebooks are created only once.
- Blank, ruled, grid, and dotted paper in A4 portrait/landscape, A5, or Letter; an infinite whiteboard option.
- Excalidraw's native pen, shapes, arrows, text, image upload/drop/paste, selection, style controls, undo/redo, pan, zoom, and shortcuts.
- Local image persistence, debounced autosave, real save/error status, retry, page-switch flushing, and last-session restoration.
- Export actual drawing content as PNG, SVG, or editable `.excalidraw` JSON including local image assets.
- Complete ZIP backup and validated merge/replace restore; persistent appearance and editor settings; responsive navigation and distraction-free mode.

## Drawing and touch

Click a notebook, choose a page, and select a tool in the drawing toolbar. Keyboard shortcuts include `P` for pen, `R` for rectangle, `A` for arrow, `T` for text, `H` for hand, `V` for selection, and native `Ctrl+Z` / `Ctrl+Shift+Z` for undo/redo. Hold Space to pan. Use `/` to focus the dashboard search. Canvas shortcuts apply when the canvas has focus; they do not replace app text input behavior. The native help menu lists the complete shortcut set.

Use the pen tool to draw with a finger, mouse, or compatible stylus. The editor owns pointer and gesture handling; the host canvas uses `touch-action: none` to avoid scrolling the browser while drawing. Pressure and palm rejection depend on hardware, OS, browser, and Excalidraw support. Physical stylus behavior needs validation on your device.

## Storage and backups

The versioned `inknest` IndexedDB database (a legacy identifier retained to preserve existing notes) stores notebook/page metadata separately from page documents. Each document contains scene elements, a small allowlist of editor state, and binary image data as data URLs. Images never depend on an external URL. A per-mounted-page save queue serializes writes, retries retained failures, and commits documents and metadata in one transaction. Drawing changes update the editor rather than the app-level Zustand store. The save label changes to saved only after IndexedDB confirms the write.

Wait for **All changes saved** before closing the browser. Navigation flushes pending work. A hidden tab also attempts a flush. Browsers cannot guarantee an asynchronous IndexedDB write during an abrupt process shutdown; pending changes trigger the browser's leave-page protection where supported. Simultaneous editing of the same page in multiple tabs uses last-write-wins; avoid doing this.

In **Settings → Export backup**, download a ZIP containing `manifest.json`. The manifest has application/schema versions, every notebook and page (including trashed records), scenes, embedded image assets, and settings. It is self-contained. Keep it outside browser storage.

Use **Settings → Import backup** to select that ZIP. Backups exported under the previous InkNest name are also supported. **Merge notebooks** creates new notebook/page IDs and retains all existing content. **Replace all data** requires explicit confirmation and atomically replaces notebooks, pages, scenes, and settings. Invalid schemas, duplicate IDs, missing relationships, missing referenced images, and unsupported versions are rejected before replacement. Archives larger than 150 MB are rejected; large archives may require significant RAM. Editable page exports can be reopened in a compatible Excalidraw application; complete notebook restoration uses lotepad ZIP backups.

Browser storage belongs to the current origin and browser profile. Clearing site data or removing the browser profile can delete notes. Private browsing may discard storage on exit. Settings shows storage usage and offers the browser's persistent-storage request; browsers decide whether to grant it. Backups remain the reliable way to keep an independent copy.

## PWA installation and offline use

Run a production build and preview, or deploy `dist` to HTTPS. Load the app online once and let the service worker finish caching its assets before going offline. In Edge or Chrome, use the address-bar install icon or browser menu's app installation command. The service worker precaches the app shell, lazy editor chunks, icons, and local fonts, so previously saved notes can open offline. The first cache includes the drawing engine and fonts and is larger than a text-only application. Dev mode does not register a service worker.

Updates show a **Save & update** notice. It flushes the current page before activating the waiting service worker. No note content is sent during installation or updates.

## Architecture

React + strict TypeScript + Vite, Tailwind CSS with custom design tokens, Radix dialogs/menus, Lucide, Excalidraw 0.18.1, Dexie, Zustand, JSZip, and vite-plugin-pwa. Heavy editor screens load lazily. Routing uses a hash so static hosting needs no server-side route support.

- `src/features`: library, notebook/page dialogs, editor, and settings.
- `src/lib/database`: versioned schema, repository, and autosave queue.
- `src/lib/excalidraw`: paper and persistent-state adapter.
- `src/lib/backup.ts`: validated transactional backup/restore.
- `src/stores`: UI-only application state.

Official API references used: [installation and local fonts](https://docs.excalidraw.com/docs/@excalidraw/excalidraw/installation), [initial scene data](https://docs.excalidraw.com/docs/@excalidraw/excalidraw/api/props/initialdata), [imperative API](https://docs.excalidraw.com/docs/@excalidraw/excalidraw/api/props/excalidraw-api), and [export utilities](https://docs.excalidraw.com/docs/@excalidraw/excalidraw/api/utils/export).

## Tests

Vitest uses real Dexie repository calls against fake-indexeddb. Tests cover initialization, notebook/page creation and rename, document isolation, duplication, reorder, trash/restore/deletion, serialization, settings persistence, backup round trips including assets, validation failures, and save failures/retry.

```sh
npx playwright install chromium
npm run build
npm run test:e2e
```

Playwright runs against the production preview. It exercises notebook creation, drawing, text/shapes/arrows, native PNG paste, scene/image persistence, page switching, exports, offline reload/editor startup, and tablet settings. Screenshots and failure traces go in `test-results`. These are browser checks, not certification of physical pen hardware.

## Known limitations and next steps

- One paper-framed scene per page. Paper is a locked SVG image with scene coordinates. It scales and exports correctly, but does not clip content or enforce physical pagination. Advanced users can unlock locked elements using native controls. Exports include content outside the paper.
- Excalidraw erases whole elements/strokes; this is not pixel-level erasing. A dedicated highlighter, advanced brushes, and universal palm rejection are not provided.
- Page previews indicate the paper type; rendered drawing thumbnails are a future improvement. Deleted pages are hidden and retained in backups until permanent notebook deletion; there is no separate page-trash screen.
- PDF export/import, OCR, handwriting recognition, rich text blocks, stickers, audio notes, search inside handwriting, and synchronization are future features. PNG/SVG and editable scene export are available now.
- Excalidraw has substantial drawing/font assets; Vite reports large chunks. They are lazy-loaded and precached for offline use. Large scenes/images and backups consume browser storage and memory.

Suggested next milestone: test on the target Windows pen/touch hardware, then add rendered page thumbnails and an accessible page-trash restore screen.

## License

lotepad source is MIT-licensed; see `LICENSE`. Bundled dependency license texts are generated in `public/THIRD_PARTY_NOTICES.txt`. Font license files are preserved beside the local Excalidraw fonts. Third-party packages retain their own licenses.
