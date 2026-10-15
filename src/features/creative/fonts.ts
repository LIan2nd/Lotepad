import {
  convertToExcalidrawElements,
  exportToCanvas,
} from "@excalidraw/excalidraw";

let ready: Promise<void> | undefined;

/** Use the public exporter to load the SDK's bundled fonts before text measurement. */
export function prepareCreativeFonts(): Promise<void> {
  ready ??= (async () => {
    const elements = convertToExcalidrawElements([
      { type: "text", text: "Ag", x: 0, y: 0, fontFamily: 5 },
      { type: "text", text: "Ag", x: 0, y: 40, fontFamily: 6 },
    ]);
    await exportToCanvas({
      elements,
      files: {},
      appState: { exportBackground: false },
    });
  })().catch((error: unknown) => {
    ready = undefined;
    throw error;
  });
  return ready;
}
