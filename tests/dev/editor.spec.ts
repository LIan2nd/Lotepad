import { test, expect } from "@playwright/test";

test("desktop dev loads the lazy editor and bundled fonts without CommonJS or CSP errors", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto("/");
  // A plain browser has no native IPC bridge. Import the same lazy module graph
  // that a newly created notebook opens, without reading the user's SQLite DB.
  const result = await page.evaluate(async () => {
    // Match the native font policy before loading the SDK's FontFace objects.
    const policy = document.createElement("meta");
    policy.httpEquiv = "Content-Security-Policy";
    policy.content = "font-src 'self' data:";
    document.head.appendChild(policy);
    const editorPath = "/src/features/editor/Editor.tsx";
    const canvasPath = "/src/features/editor/Canvas.tsx";
    const fontsPath = "/src/features/creative/fonts.ts";
    const editor = (await import(
      editorPath
    )) as typeof import("../../src/features/editor/Editor");
    const canvas = (await import(
      canvasPath
    )) as typeof import("../../src/features/editor/Canvas");
    const fonts = (await import(
      fontsPath
    )) as typeof import("../../src/features/creative/fonts");
    await fonts.prepareCreativeFonts();
    await document.fonts.ready;
    return {
      editor: typeof editor.Editor,
      canvas: typeof canvas.Canvas,
      fonts: [...document.fonts]
        .filter((font) => font.status === "loaded")
        .map((font) => font.family),
    };
  });
  expect(result.editor).toBe("function");
  expect(result.canvas).toBe("function");
  expect(result.fonts).toEqual(
    expect.arrayContaining(["Nunito", "Excalifont"]),
  );
  expect(errors).toEqual([]);
});
