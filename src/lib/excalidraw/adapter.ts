import { convertToExcalidrawElements } from "@excalidraw/excalidraw";
import type { AppState, BinaryFileData } from "@excalidraw/excalidraw/types";
import type { NotePage, PageContent } from "../../types";
export const paperDimensions = {
  A4: [794, 1123],
  "A4 landscape": [1123, 794],
  A5: [559, 794],
  Letter: [816, 1056],
} as const;
/** One locked SVG paper element: zooms with the scene and exports with the note. */
export function initializePaper(
  page: NotePage,
  content: PageContent,
): PageContent {
  if (content.initialized) return content;
  if (page.mode === "infinite")
    return {
      ...content,
      initialized: true,
      appState: { ...content.appState, viewBackgroundColor: "#fffdf8" },
    };
  const [w, h] = paperDimensions[page.size];
  const dark =
    parseInt(page.paperColor.slice(1, 3), 16) * 0.299 +
      parseInt(page.paperColor.slice(3, 5), 16) * 0.587 +
      parseInt(page.paperColor.slice(5, 7), 16) * 0.114 <
    110;
  let pattern = "";
  if (page.paper === "ruled")
    pattern =
      '<pattern id="p" width="32" height="32" patternUnits="userSpaceOnUse"><path d="M0 31.5H32" stroke="#b9c8db" stroke-width="0.8"/></pattern>';
  if (page.paper === "grid")
    pattern =
      '<pattern id="p" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M24 0H0V24" fill="none" stroke="#b9c8db" stroke-width="0.8"/></pattern>';
  if (page.paper === "dotted")
    pattern =
      '<pattern id="p" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="12" cy="12" r="1" fill="#bbc1c8"/></pattern>';
  if (dark)
    pattern = pattern
      .replaceAll("#b9c8db", "#706b83")
      .replaceAll("#bbc1c8", "#827b94");
  const texture =
    page.paper === "vintage"
      ? `<defs><filter id="grain"><feTurbulence type="fractalNoise" baseFrequency=".65" numOctaves="2" seed="8" stitchTiles="stitch"/></filter></defs><rect width="${w}" height="${h}" opacity=".035" filter="url(#grain)"/><path d="M24 24H${w - 24}V${h - 24}H24Z" fill="none" stroke="${dark ? "#81768a" : "#a58a63"}" stroke-opacity=".18"/>`
      : "";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><defs>${pattern}</defs><rect x="0.5" y="0.5" width="${w - 1}" height="${h - 1}" rx="2" fill="${page.paperColor}" stroke="${dark ? "#524957" : "#d9d6d0"}"/>${pattern ? `<rect x="40" y="64" width="${w - 80}" height="${h - 112}" fill="url(#p)"/>` : ""}${texture}</svg>`;
  const id = crypto.randomUUID();
  const dataURL =
    `data:image/svg+xml;base64,${btoa(svg)}` as BinaryFileData["dataURL"];
  const elements = convertToExcalidrawElements([
    {
      type: "image",
      id: `paper-${page.id}`,
      x: 0,
      y: 0,
      width: w,
      height: h,
      fileId: id as BinaryFileData["id"],
      status: "saved",
      locked: true,
      customData: { lotepadPaper: true },
    },
  ]);
  return {
    ...content,
    elements: [...elements, ...content.elements],
    files: {
      ...content.files,
      [id]: {
        id: id as BinaryFileData["id"],
        dataURL,
        mimeType: "image/svg+xml",
        created: Date.now(),
      },
    },
    appState: {
      ...content.appState,
      viewBackgroundColor: "#eeece7",
      scrollX: 50,
      scrollY: 40,
      ...(dark ? { currentItemStrokeColor: "#e8dff0" } : {}),
    },
    initialized: true,
  };
}
export function persistentState(state: Partial<AppState>): Partial<AppState> {
  // Never persist runtime maps, selection, collaborators, or transient editing state.
  return {
    viewBackgroundColor: state.viewBackgroundColor,
    zoom: state.zoom,
    scrollX: state.scrollX,
    scrollY: state.scrollY,
    currentItemStrokeColor: state.currentItemStrokeColor,
    currentItemBackgroundColor: state.currentItemBackgroundColor,
    currentItemFillStyle: state.currentItemFillStyle,
    currentItemStrokeWidth: state.currentItemStrokeWidth,
    currentItemStrokeStyle: state.currentItemStrokeStyle,
    currentItemRoughness: state.currentItemRoughness,
    currentItemOpacity: state.currentItemOpacity,
    currentItemFontFamily: state.currentItemFontFamily,
    currentItemFontSize: state.currentItemFontSize,
    gridSize: state.gridSize,
    gridStep: state.gridStep,
  };
}
