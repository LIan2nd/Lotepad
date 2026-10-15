# Lotepad — Your Creative Little Universe

A creative notebook and scrapbook studio for Windows touchscreen laptops, tablets, and desktops. Keep handwritten notes, layer papers and photos, and compose editable layouts on paper or an infinite canvas.

## Creative Scrapbook Studio · 1.1

The original notebook, page, drawing, image, autosave, backup, and PWA workflows remain available. Switch between **Write**, **Create**, and **Focus** in the editor toolbar. All modes use the same Excalidraw scene; changing mode only changes the interface.

**Creative Library** contains 38 original SVG stickers across stars, nature, stationery, doodles, productivity, and tech; eight washi tapes; ten paper pieces; eight editable note cards; six photo frame presets; native doodles and connected concept cards; editable labels; decorations; and nine typography presets. Browse categories, search, star favorites, or revisit recently inserted items. Tap an item to insert it at the visible canvas center, then use the native selection handles to move, resize, or rotate. Click-to-insert is the reliable touch fallback; custom HTML drag/drop is not required.

In **Photo frames**, choose a style and upload a PNG, JPEG, or WebP. Photos are contained within the frame without masking or clipping, and captions remain native editable text. To fill an empty template frame, select that frame on the canvas, open Photo frames, and choose **Fill selected photo frame**. Imports are limited to 15 MB and 50 megapixels; images larger than 4096 pixels on a side are resized proportionally. The original native image upload/paste/drop controls remain available.

The arrangement toolbar provides duplication, 5-degree rotation, grouping, explicit recoloring, and stacking controls. Its menu also offers ungrouping, image flipping, locking, and unlocking creative items. Paper backgrounds stay protected. Excalidraw's native context menu and keyboard shortcuts are also available. Recolor uses the current library color and applies only to the selected native shapes/text or registered decorative SVG assets; photos retain their colors.

Six curated palettes and custom five-color palettes style **future inserts**. Changing the active palette does not recolor existing content. Favorite/recent assets and custom palettes persist across reloads and are included in complete backups.

Four scrapbook layouts are available from New page, the editor's Templates button, and the dashboard's Browse templates shortcut: **Organized Chaos**, **Dreamy Study Notes**, **Creative Journal**, and **Editorial Collage**. They create real text, shapes, arrows, papers, frames, and image assets. Preview cards are illustrative; the editor's template and Inspire Me dialogs render previews from the actual generated scene. Every inserted text field stays editable.

**Inspire Me** uses seeded, bounded layout rules with six creative modes. Regenerate creates a different preview; Cancel does not modify the document. On an occupied page, compositions default to a separate area beside the current content. Replacing content requires choosing that operation and confirming it. Replacement preserves the paper and participates in native undo history. Content added beside a paper page may lie outside its sheet boundary; the page mode and dimensions are preserved.

Paper creation also offers vintage grain and coordinated white, cream, lavender, sage, parchment, and dark color presets. Dark paper starts with a light drawing color.

## Compatibility strategy

This release does **not** rename the `inknest` database, increment its schema version, clear records, or change the PWA start URL. New library preferences use a versioned record in the existing `meta` table. Existing notebook/page records and scene/image serialization retain their formats. Optional paper-type values are validated while previous values remain supported.

Backup schema version 1 now includes an optional `creative` preferences field. Pre-expansion Lotepad and legacy InkNest archives are accepted; absent creative preferences receive defaults on replacement. Import validates custom palette structure before any destructive transaction. Merge remaps notebook/page IDs, retains existing notes, combines library favorites, and assigns fresh IDs to conflicting custom palettes. Native sticky-note bindings and group membership remain in scene data, and SVG/raster assets remain embedded. No scene is flattened for storage.

The `src/features/creative` directory contains the asset registry, palette catalog, metadata repository, native-scene composer, Excalidraw insertion/arrangement adapter, template/inspiration generators, preview dialogs, and library UI. The original autosave queue remains responsible for all content writes. Creative preferences use independent atomic read/modify/write transactions so they do not trigger database writes on pen movement.

Typography uses supported Excalidraw fonts (Nunito and Excalifont for creative presets). The public canvas exporter loads these bundled fonts before scene composition, keeping initial text measurements consistent with rendering. A custom serif canvas font is not registered: the soft-title preset uses a dependable bundled handwriting font. Decorative stickers/papers/tape are recolorable SVG image elements, while note cards, labels, diagrams, and text remain native geometry/text. Rounded frames are decorative borders, not arbitrary photo masks. There is no separate full layer-tree panel or added PDF exporter.

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

Vitest uses real Dexie repository calls against fake-indexeddb. Tests cover initialization, notebook/page creation and rename, document isolation, duplication, reorder, trash/restore/deletion, serialization, settings persistence, backup round trips including assets, validation failures, and save failures/retry. Creative tests cover asset registry completeness, palette validation, concurrent library preferences, unchanged legacy records/schema, and legacy/current backup compatibility with editable cards and embedded assets.

```sh
npx playwright install chromium
npm run build
npm run test:e2e
```

Playwright runs against the production preview. It exercises notebook creation, drawing, text/shapes/arrows, native PNG paste, scene/image persistence, page switching, exports, offline reload/editor startup, and tablet settings. Studio workflows cover sticker transformations, stacking, recoloring, favorite/custom-palette persistence, editable sticky text and photo captions, all four templates, safe composition application/undo, photo-frame filling by touch, and offline library insertion/reload. Screenshots and failure traces go in `test-results`. These are browser checks, not certification of physical pen hardware.

## Known limitations and next steps

- One paper-framed scene per page. Paper is a locked SVG image with scene coordinates. It scales and exports correctly, but does not clip content or enforce physical pagination. Advanced users can unlock locked elements using native controls. Exports include content outside the paper.
- Excalidraw erases whole elements/strokes; this is not pixel-level erasing. A dedicated highlighter, advanced brushes, and universal palm rejection are not provided.
- Page previews indicate the paper type; rendered drawing thumbnails are a future improvement. Deleted pages are hidden and retained in backups until permanent notebook deletion; there is no separate page-trash screen.
- PDF export/import, OCR, handwriting recognition, rich text blocks, audio notes, search inside handwriting, and synchronization are future features. PNG/SVG and editable scene export are available now.
- Excalidraw has substantial drawing/font assets; Vite reports large chunks. They are lazy-loaded and precached for offline use. Large scenes/images and backups consume browser storage and memory.

Suggested next milestone: validate the studio on the target Windows pen/touch hardware, then add rendered page thumbnails, a page-trash restore screen, and additional curated asset packs.

## License

lotepad source is MIT-licensed; see `LICENSE`. Bundled dependency license texts are generated in `public/THIRD_PARTY_NOTICES.txt`. Font license files are preserved beside the local Excalidraw fonts. Third-party packages retain their own licenses.
