import { test, expect, type Page } from "@playwright/test";
import sharp from "sharp";
import { readFile } from "node:fs/promises";
import type { NotePage, PageContent } from "../src/types";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
async function currentDocument(page: Page): Promise<PageContent> {
  return page.evaluate(async () => {
    const request = indexedDB.open("inknest");
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      const tx = database.transaction(["pages", "contents"]);
      const get = <T>(r: IDBRequest<T>) =>
        new Promise<T>((resolve, reject) => {
          r.onsuccess = () => resolve(r.result);
          r.onerror = () => reject(r.error);
        });
      const [pages, contents] = await Promise.all([
        get(tx.objectStore("pages").getAll()),
        get(tx.objectStore("contents").getAll()),
      ]);
      const route = new URLSearchParams(location.hash.slice(1));
      const title =
        document.querySelector<HTMLInputElement>(".page-title-input")?.value;
      const current = (pages as NotePage[]).find((p) =>
        route.get("page")
          ? p.id === route.get("page")
          : p.notebookId === route.get("notebook") &&
            p.title === title &&
            !p.deletedAt,
      );
      if (!current) throw new Error("Active page not found");
      return (contents as PageContent[]).find((c) => c.pageId === current.id)!;
    } finally {
      database.close();
    }
  });
}
const live = (content: PageContent) =>
  content.elements.filter(
    (e) =>
      !e.isDeleted &&
      !e.customData?.lotepadPaper &&
      !e.customData?.inknestPaper,
  );
const meaningfulContent = (content: PageContent) =>
  content.elements.map((e) => ({
    id: e.id,
    type: e.type,
    x: e.x,
    y: e.y,
    width: e.width,
    height: e.height,
    angle: e.angle,
    isDeleted: e.isDeleted,
    backgroundColor: e.backgroundColor,
    strokeColor: e.strokeColor,
    groupIds: e.groupIds,
    boundElements: e.boundElements ?? [],
    ...(e.type === "text"
      ? { text: e.text, containerId: e.containerId }
      : e.type === "image"
        ? { fileId: e.fileId }
        : e.type === "line" || e.type === "arrow"
          ? { points: e.points }
          : {}),
  }));
async function saved(page: Page) {
  await expect(
    page.getByText("All changes saved", { exact: true }),
  ).toBeVisible();
}
async function openNotebook(page: Page) {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Open My Journal", exact: true })
    .click();
  await expect(page.locator(".excalidraw canvas").first()).toBeVisible();
  await saved(page);
}
async function position(
  page: Page,
  element: ExcalidrawElement,
  x = 0.5,
  y = 0.5,
) {
  const document = await currentDocument(page);
  const bounds = await page.locator(".excalidraw canvas").first().boundingBox();
  if (!bounds) throw new Error("Canvas missing");
  const state = document.appState;
  const zoom = state.zoom?.value ?? 1;
  return {
    x: bounds.x + (element.x + element.width * x + (state.scrollX ?? 0)) * zoom,
    y:
      bounds.y + (element.y + element.height * y + (state.scrollY ?? 0)) * zoom,
  };
}
async function editText(page: Page, element: ExcalidrawElement, value: string) {
  const point = await position(page, element, 0.3, 0.4);
  await page.mouse.dblclick(point.x, point.y);
  const editor = page.locator(".excalidraw-wysiwyg");
  if (!(await editor.isVisible())) await page.keyboard.press("Enter");
  await expect(editor).toBeVisible();
  await editor.fill(value);
  await page.keyboard.press("Escape");
  await expect
    .poll(async () =>
      live(await currentDocument(page)).some(
        (e) => e.type === "text" && e.originalText === value,
      ),
    )
    .toBe(true);
}

test("dashboard templates measure text with the bundled fonts on the first editor load", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Browse templates", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Choose Creative Journal", exact: true })
    .click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Create page", exact: true }).click();
  await expect(page.locator(".excalidraw canvas").first()).toBeVisible();
  await saved(page);
  const content = await currentDocument(page);
  const widths = await page.evaluate((elements) => {
    const context = document.createElement("canvas").getContext("2d")!;
    return elements
      .filter((e) => e.type === "text" && !e.containerId)
      .map((e) => {
        if (e.type !== "text") throw new Error("Text expected");
        context.font = `${e.fontSize}px ${e.fontFamily === 5 ? "Excalifont" : "Nunito"}`;
        return {
          stored: e.width,
          measured: Math.max(
            ...e.text
              .split("\n")
              .map((line) => context.measureText(line).width),
          ),
        };
      });
  }, live(content));
  expect(widths.length).toBeGreaterThan(5);
  for (const width of widths)
    expect(Math.abs(width.stored - width.measured)).toBeLessThan(1);
});
test("sticker resize, rotation, duplication, recolor, favorites, palettes, layers, and offline persistence", async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await openNotebook(page);
  const originalPage = (await currentDocument(page)).pageId;
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await page
    .getByRole("button", { name: "Favorite Soft Star", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Insert Soft Star", exact: true })
    .click();
  await expect
    .poll(async () => live(await currentDocument(page)).length)
    .toBe(1);
  let star = live(await currentDocument(page))[0];
  const originalWidth = star.width;
  const corner = await position(page, star, 1, 1);
  await page.mouse.move(corner.x + 3, corner.y + 3);
  await page.mouse.down();
  await page.mouse.move(corner.x + 35, corner.y + 35, { steps: 8 });
  await page.mouse.up();
  await expect
    .poll(async () => live(await currentDocument(page))[0].width)
    .not.toBe(originalWidth);
  await page
    .getByRole("button", { name: "Rotate selection 5 degrees", exact: true })
    .click();
  await expect
    .poll(async () => live(await currentDocument(page))[0].angle)
    .not.toBe(0);
  await page
    .getByRole("button", { name: "Duplicate selection", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        live(await currentDocument(page)).filter((e) => e.type === "image")
          .length,
    )
    .toBe(2);
  await page.getByLabel("Insert color", { exact: true }).evaluate((element) => {
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set;
    setter?.call(element, "#e7c4d5");
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await page
    .getByRole("button", { name: "Recolor selection", exact: true })
    .click();
  await expect
    .poll(async () =>
      live(await currentDocument(page)).some(
        (e) => e.customData?.creativeColor === "#e7c4d5",
      ),
    )
    .toBe(true);
  await page.getByRole("button", { name: "Paper pieces", exact: true }).click();
  await page
    .getByRole("button", { name: "Insert Torn paper", exact: true })
    .click();
  await expect
    .poll(async () =>
      live(await currentDocument(page)).some(
        (e) => e.customData?.creativeAssetId === "paper-torn",
      ),
    )
    .toBe(true);
  await page
    .getByRole("button", { name: "Arrange options", exact: true })
    .click();
  await page
    .getByRole("menuitem", { name: "Send to back", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        live(await currentDocument(page))[0].customData?.creativeAssetId,
    )
    .toBe("paper-torn");
  const beforePalette = live(await currentDocument(page)).map((e) => ({
    id: e.id,
    color: e.customData?.creativeColor,
  }));
  await page
    .getByRole("button", { name: "Color palettes", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Use Matcha Notes", exact: true })
    .click();
  expect(
    live(await currentDocument(page)).map((e) => ({
      id: e.id,
      color: e.customData?.creativeColor,
    })),
  ).toEqual(beforePalette);
  await page.getByRole("button", { name: "New palette", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Palette name" })
    .fill("My scrapbook palette");
  await page.getByRole("button", { name: "Save palette", exact: true }).click();
  await expect(
    page.getByText("My scrapbook palette", { exact: true }).first(),
  ).toBeVisible();
  await saved(page);
  await page.reload();
  await expect(page.locator(".excalidraw canvas").first()).toBeVisible();
  expect((await currentDocument(page)).pageId).toBe(originalPage);
  expect(live(await currentDocument(page))).toHaveLength(3);
  for (const element of live(await currentDocument(page)))
    if (element.type === "image")
      expect((await currentDocument(page)).files[element.fileId!]).toBeTruthy();
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await page.getByRole("button", { name: "Saved", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Insert Soft Star", exact: true }),
  ).toBeVisible();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect(page.locator(".excalidraw canvas").first()).toBeVisible();
  await saved(page);
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator(".excalidraw canvas").first()).toBeVisible();
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await page
    .getByRole("button", { name: "Insert Soft Heart", exact: true })
    .click();
  await expect
    .poll(async () => live(await currentDocument(page)).length)
    .toBe(4);
  await saved(page);
  await page.reload();
  await expect(page.locator(".excalidraw canvas").first()).toBeVisible();
  expect(live(await currentDocument(page))).toHaveLength(4);
  await context.setOffline(false);
  star = live(await currentDocument(page)).find(
    (e) => e.customData?.creativeAssetId === "soft-star",
  )!;
  expect(star).toBeTruthy();
  expect(errors).toEqual([]);
});
test.describe("touch scrapbook tools", () => {
  test.use({ hasTouch: true, viewport: { width: 1024, height: 768 } });
  test("tap insertion and filling a template photo frame preserve groups and editable captions", async ({
    page,
  }) => {
    await openNotebook(page);
    await page.getByRole("button", { name: "New page", exact: true }).tap();
    await page
      .getByRole("button", { name: "Scrapbook layouts", exact: true })
      .tap();
    await page
      .getByRole("button", { name: "Choose Creative Journal", exact: true })
      .tap();
    await page.getByRole("button", { name: "Create page", exact: true }).tap();
    await expect(
      page.getByRole("textbox", { name: "Page title", exact: true }),
    ).toHaveValue("Creative Journal");
    await expect(page.locator(".excalidraw canvas").first()).toBeVisible();
    await page.getByRole("button", { name: "Create", exact: true }).tap();
    await page
      .getByRole("button", { name: "Insert Soft Star", exact: true })
      .tap();
    await expect
      .poll(async () =>
        live(await currentDocument(page)).some(
          (e) => e.customData?.creativeAssetId === "soft-star",
        ),
      )
      .toBe(true);
    await page.getByRole("button", { name: "Photo frames", exact: true }).tap();
    let slot = live(await currentDocument(page)).find(
      (e) => e.customData?.photoSlot,
    )!;
    const point = await position(page, slot);
    await page.touchscreen.tap(point.x, point.y);
    await page
      .getByRole("button", { name: "Rotate selection 5 degrees", exact: true })
      .tap();
    await expect
      .poll(
        async () =>
          live(await currentDocument(page)).find((e) => e.id === slot.id)!
            .angle,
      )
      .not.toBe(0);
    slot = live(await currentDocument(page)).find((e) => e.id === slot.id)!;
    const fill = page.getByRole("button", {
      name: "Fill selected photo frame",
      exact: true,
    });
    await expect(fill).toBeEnabled();
    const photo = await sharp({
      create: { width: 180, height: 240, channels: 3, background: "#d9b38f" },
    })
      .png()
      .toBuffer();
    const picker = page.waitForEvent("filechooser");
    await fill.tap();
    await (
      await picker
    ).setFiles({
      name: "journal-photo.png",
      mimeType: "image/png",
      buffer: photo,
    });
    await expect
      .poll(async () =>
        live(await currentDocument(page)).some(
          (e) => e.customData?.creativeKind === "photo",
        ),
      )
      .toBe(true);
    const content = await currentDocument(page);
    const image = live(content).find(
      (e) => e.customData?.creativeKind === "photo",
    )!;
    expect(image.groupIds).toEqual(slot.groupIds);
    expect(image.angle).toBeCloseTo(slot.angle);
    expect(live(content).filter((e) => e.customData?.photoSlot)).toHaveLength(
      1,
    );
    expect(
      live(content).some(
        (e) => e.type === "text" && e.originalText === "the lovely ordinary",
      ),
    ).toBe(true);
    expect(await page.evaluate(() => scrollY)).toBe(0);
    await saved(page);
    await page.reload();
    await expect(page.locator(".excalidraw canvas").first()).toBeVisible();
    expect(
      live(await currentDocument(page)).some((e) => e.id === image.id),
    ).toBe(true);
    await page.screenshot({ path: "test-results/touch-scrapbook.png" });
  });
});
test("sticky text and Polaroid photos stay editable through reload, export, and complete backup restoration", async ({
  page,
}) => {
  await openNotebook(page);
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await page.getByRole("button", { name: "Sticky notes", exact: true }).click();
  await page
    .getByRole("button", { name: "Insert Square", exact: true })
    .click();
  await expect
    .poll(async () =>
      live(await currentDocument(page)).some((e) => e.type === "text"),
    )
    .toBe(true);
  const text = live(await currentDocument(page)).find(
    (e) => e.type === "text",
  )!;
  await page
    .getByRole("button", { name: "Recolor selection", exact: true })
    .click();
  await saved(page);
  const cardDocument = await currentDocument(page);
  const label = live(cardDocument).find((e) => e.id === text.id)!;
  const card = live(cardDocument).find(
    (e) => e.id === (label.type === "text" ? label.containerId : null),
  )!;
  expect(label.strokeColor).not.toBe(card.backgroundColor);
  await editText(page, text, "A card that stays editable");
  const photo = await sharp({
    create: { width: 300, height: 200, channels: 3, background: "#8ba59b" },
  })
    .png()
    .toBuffer();
  await page.getByRole("button", { name: "Photo frames", exact: true }).click();
  const picker = page.waitForEvent("filechooser");
  await page
    .getByRole("button", { name: "Add photo: Classic Polaroid", exact: true })
    .click();
  await (
    await picker
  ).setFiles({ name: "test-photo.png", mimeType: "image/png", buffer: photo });
  await expect
    .poll(async () =>
      live(await currentDocument(page)).some(
        (e) => e.customData?.creativeKind === "photo",
      ),
    )
    .toBe(true);
  const caption = live(await currentDocument(page)).find(
    (e) => e.type === "text" && e.text === "a moment worth keeping",
  )!;
  await editText(page, caption, "October memories");
  await page.getByRole("button", { name: "Stickers", exact: true }).click();
  await page
    .getByRole("button", { name: "Insert Soft Star", exact: true })
    .click();
  await page.getByRole("button", { name: "Paper pieces", exact: true }).click();
  await page
    .getByRole("button", { name: "Insert Torn paper", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Rotate selection 5 degrees", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Arrange options", exact: true })
    .click();
  await page
    .getByRole("menuitem", { name: "Send to back", exact: true })
    .click();
  const canvas = await page.locator(".excalidraw canvas").first().boundingBox();
  if (!canvas) throw new Error("Canvas missing");
  await page.mouse.click(canvas.x + 500, canvas.y + 200);
  await page.keyboard.press("p");
  await page.mouse.move(canvas.x + 500, canvas.y + 200);
  await page.mouse.down();
  await page.mouse.move(canvas.x + 550, canvas.y + 230, { steps: 8 });
  await page.mouse.up();
  await expect
    .poll(async () =>
      live(await currentDocument(page)).some((e) => e.type === "freedraw"),
    )
    .toBe(true);
  await saved(page);
  await page.reload();
  await expect(page.locator(".excalidraw canvas").first()).toBeVisible();
  let content = await currentDocument(page);
  expect(
    live(content).some(
      (e) => e.type === "text" && e.text === "October memories",
    ),
  ).toBe(true);
  const restoredText = live(content).find(
    (e) => e.type === "text" && e.originalText === "A card that stays editable",
  )!;
  expect(restoredText).toBeTruthy();
  for (const format of ["png", "svg", "json"]) {
    const ready = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Export page", exact: true })
      .click();
    await page
      .getByRole("menuitem", {
        name:
          format === "png"
            ? "PNG image"
            : format === "svg"
              ? "SVG image"
              : "Editable Excalidraw",
        exact: true,
      })
      .click();
    const file = await ready;
    expect(file.suggestedFilename()).toMatch(
      format === "json" ? /\.excalidraw$/ : new RegExp(`\\.${format}$`),
    );
    const exported = await file.path();
    if (!exported) throw new Error("Export missing");
    const bytes = await readFile(exported);
    if (format === "png") {
      const metadata = await sharp(bytes).metadata();
      expect(metadata.format).toBe("png");
      expect(metadata.width).toBeGreaterThan(100);
    } else if (format === "svg") {
      const svg = bytes.toString("utf8");
      expect(svg).toContain("October memories");
      expect(svg).toContain("data:image/png;base64,");
      expect(svg).toContain("data:image/svg+xml;base64,");
    } else {
      const scene = JSON.parse(bytes.toString("utf8")) as PageContent;
      for (const element of live(scene))
        if (element.type === "image")
          expect(scene.files[element.fileId!]).toBeTruthy();
      expect(live(scene).some((e) => e.type === "freedraw")).toBe(true);
    }
  }
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const backupReady = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export backup", exact: true })
    .click();
  const backup = await backupReady;
  const path = await backup.path();
  if (!path) throw new Error("Backup missing");
  await page.locator('input[type=file][accept=".zip"]').setInputFiles(path);
  await page
    .getByRole("button", { name: "Replace all data…", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Replace all data", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page
    .getByRole("button", { name: "Open My Journal", exact: true })
    .click();
  await expect(page.locator(".excalidraw canvas").first()).toBeVisible();
  content = await currentDocument(page);
  expect(
    live(content).some((e) => e.customData?.creativeAssetId === "paper-torn"),
  ).toBe(true);
  expect(
    live(content).some((e) => e.customData?.creativeAssetId === "soft-star"),
  ).toBe(true);
  expect(live(content).some((e) => e.type === "freedraw")).toBe(true);
  expect(
    live(content).some(
      (e) => e.type === "text" && e.text === "October memories",
    ),
  ).toBe(true);
  const image = live(content).find(
    (e) => e.customData?.creativeKind === "photo",
  );
  expect(image?.type).toBe("image");
  if (image?.type === "image")
    expect(content.files[image.fileId!].dataURL).toMatch(
      /^data:image\/png;base64,/,
    );
});
test("all four templates create real scenes; Inspire Me cancel is non-destructive and apply is undoable", async ({
  page,
}) => {
  await openNotebook(page);
  const original = await currentDocument(page);
  const types = [
    "Organized Chaos",
    "Dreamy Study Notes",
    "Creative Journal",
    "Editorial Collage",
  ];
  for (const name of types) {
    await page.getByRole("button", { name: "New page", exact: true }).click();
    await page
      .getByRole("button", { name: "Scrapbook layouts", exact: true })
      .click();
    await page
      .getByRole("button", { name: `Choose ${name}`, exact: true })
      .click();
    await page
      .getByRole("button", { name: "Create page", exact: true })
      .click();
    await expect(
      page.getByRole("textbox", { name: "Page title", exact: true }),
    ).toHaveValue(name);
    await expect(page.locator(".excalidraw canvas").first()).toBeVisible();
    await page.evaluate(() => document.fonts.ready.then(() => true));
    await saved(page);
    await expect
      .poll(async () => live(await currentDocument(page)).length)
      .toBeGreaterThan(12);
    const content = await currentDocument(page);
    expect(live(content).some((e) => e.type === "text")).toBe(true);
    for (const element of live(content))
      if (element.type === "image")
        expect(content.files[element.fileId!]).toBeTruthy();
    if (name === "Organized Chaos") {
      const title = live(content).find(
        (e) => e.type === "text" && e.originalText.includes("beautifully"),
      )!;
      await editText(page, title, "My organized universe");
      const star = live(await currentDocument(page)).find(
        (e) => e.customData?.creativeAssetId === "soft-star",
      )!;
      const point = await position(page, star);
      await page.mouse.move(point.x, point.y);
      await page.mouse.down();
      await page.mouse.move(point.x - 24, point.y + 18, { steps: 6 });
      await page.mouse.up();
      await page.keyboard.press("p");
      await page.mouse.move(point.x - 100, point.y + 45);
      await page.mouse.down();
      await page.mouse.move(point.x - 40, point.y + 70, { steps: 8 });
      await page.mouse.up();
      await expect
        .poll(async () =>
          live(await currentDocument(page)).some((e) => e.type === "freedraw"),
        )
        .toBe(true);
      await saved(page);
      const edited = await currentDocument(page);
      expect(live(edited).find((e) => e.id === star.id)!.x).not.toBe(star.x);
      await page.reload();
      await expect(page.locator(".excalidraw canvas").first()).toBeVisible();
      const reloaded = live(await currentDocument(page));
      expect(
        reloaded.some(
          (e) =>
            e.type === "text" && e.originalText === "My organized universe",
        ),
      ).toBe(true);
      expect(reloaded.some((e) => e.type === "freedraw")).toBe(true);
    }
  }
  const before = await currentDocument(page);
  await page.getByRole("button", { name: "Inspire Me", exact: true }).click();
  await expect(
    page.getByRole("img", { name: "Composition preview" }),
  ).toBeVisible();
  const first = await page
    .getByRole("img", { name: "Composition preview" })
    .getAttribute("src");
  await page.getByRole("button", { name: "Regenerate", exact: true }).click();
  await expect
    .poll(() =>
      page
        .getByRole("img", { name: "Composition preview" })
        .getAttribute("src"),
    )
    .not.toBe(first);
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(meaningfulContent(await currentDocument(page))).toEqual(
    meaningfulContent(before),
  );
  await page.getByRole("button", { name: "Inspire Me", exact: true }).click();
  await page
    .getByRole("button", { name: "Apply composition", exact: true })
    .click();
  await expect
    .poll(async () => live(await currentDocument(page)).length)
    .toBeGreaterThan(live(before).length);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect
    .poll(async () => live(await currentDocument(page)).length)
    .toBe(live(before).length);
  await page.getByRole("button", { name: "Inspire Me", exact: true }).click();
  await page.getByRole("combobox", { name: "Placement", exact: true }).click();
  await page
    .getByRole("option", { name: "Replace page content…", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Apply composition", exact: true })
    .click();
  const confirmation = page.getByRole("dialog", {
    name: "Replace page content?",
    exact: true,
  });
  await expect(confirmation).toBeVisible();
  expect(live(await currentDocument(page)).map((e) => e.id)).toEqual(
    live(before).map((e) => e.id),
  );
  await confirmation
    .getByRole("button", { name: "Cancel", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Apply composition", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Replace page content?", exact: true })
    .getByRole("button", { name: "Replace content", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect
    .poll(async () =>
      live(await currentDocument(page)).some(
        (e) => e.id === live(before)[0].id,
      ),
    )
    .toBe(false);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect
    .poll(async () => live(await currentDocument(page)).map((e) => e.id))
    .toEqual(live(before).map((e) => e.id));
  // Switch back to the original pre-expansion page; it remains intact.
  await page
    .getByRole("button", { name: "A fresh start", exact: false })
    .first()
    .click();
  await expect
    .poll(async () => (await currentDocument(page)).pageId)
    .toBe(original.pageId);
  expect(live(await currentDocument(page))).toHaveLength(0);
});
