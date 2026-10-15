import { test, expect } from "@playwright/test";
import sharp from "sharp";
test("notebook management, drawing persistence, images, page isolation, exports, and offline shell", async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Notebooks", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "New notebook", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Notebook name" })
    .fill("Browser test notebook");
  await page
    .getByRole("button", { name: "Create notebook", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Open Browser test notebook", exact: true })
    .click();
  await expect(page.locator(".excalidraw canvas").first()).toBeVisible();
  await page
    .getByRole("textbox", { name: "Page title", exact: true })
    .fill("First drawing");
  await page
    .getByRole("textbox", { name: "Page title", exact: true })
    .press("Enter");
  const canvas = page.locator(".excalidraw canvas").first();
  const bounds = await canvas.boundingBox();
  if (!bounds) throw new Error("No canvas bounds");
  await page.mouse.click(bounds.x + 370, bounds.y + 260);
  await page.keyboard.press("p");
  await page.mouse.move(bounds.x + 370, bounds.y + 260);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 440, bounds.y + 300, { steps: 15 });
  await page.mouse.move(bounds.x + 510, bounds.y + 260, { steps: 15 });
  await page.mouse.up();
  await page.keyboard.press("r");
  await page.mouse.move(bounds.x + 380, bounds.y + 350);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 510, bounds.y + 440, { steps: 8 });
  await page.mouse.up();
  await page.keyboard.press("Escape");
  await page.keyboard.press("t");
  await page.mouse.click(bounds.x + 390, bounds.y + 480);
  await page.keyboard.type("A persistent thought");
  await page.keyboard.press("Escape");
  await page.keyboard.press("a");
  await page.mouse.move(bounds.x + 540, bounds.y + 350);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 630, bounds.y + 440, { steps: 8 });
  await page.mouse.up();
  await page.keyboard.press("Escape");
  // A real PNG passes through the editor's native paste pipeline.
  const image = (
    await sharp({
      create: { width: 80, height: 60, channels: 4, background: "#d2b7ed" },
    })
      .png()
      .toBuffer()
  ).toString("base64");
  await page.locator(".excalidraw").evaluate(async (el, png) => {
    const bytes = Uint8Array.from(atob(png), (c) => c.charCodeAt(0));
    const transfer = new DataTransfer();
    transfer.items.add(
      new File([bytes], "red-pixel.png", { type: "image/png" }),
    );
    el.dispatchEvent(
      new ClipboardEvent("paste", {
        clipboardData: transfer,
        bubbles: true,
        cancelable: true,
      }),
    );
  }, image);
  await expect(
    page.getByText("All changes saved", { exact: true }),
  ).toBeVisible();
  const readDocument = () =>
    page.evaluate(async () => {
      const request = indexedDB.open("inknest");
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const tx = database.transaction("contents");
      const all = tx.objectStore("contents").getAll();
      const data = await new Promise<unknown[]>((resolve, reject) => {
        all.onsuccess = () => resolve(all.result);
        all.onerror = () => reject(all.error);
      });
      database.close();
      return data as {
        pageId: string;
        elements: {
          type: string;
          text?: string;
          isDeleted?: boolean;
          x: number;
          y: number;
          width: number;
          height: number;
        }[];
        files: Record<string, unknown>;
      }[];
    });
  await expect
    .poll(async () => {
      const docs = await readDocument();
      return docs.some((d) =>
        d.elements.some(
          (e) => e.type === "text" && e.text === "A persistent thought",
        ),
      );
    })
    .toBe(true);
  const docs = await readDocument();
  const first = docs.find((d) =>
    d.elements.some(
      (e) => e.type === "text" && e.text === "A persistent thought",
    ),
  )!;
  expect(first.elements.some((e) => e.type === "freedraw")).toBe(true);
  expect(first.elements.some((e) => e.type === "rectangle")).toBe(true);
  expect(first.elements.some((e) => e.type === "arrow")).toBe(true);
  expect(Object.keys(first.files).length).toBeGreaterThan(1);
  const originalRectangle = first.elements.find((e) => e.type === "rectangle")!;
  const rectangle = async () =>
    (await readDocument())
      .find((d) => d.pageId === first.pageId)!
      .elements.find((e) => e.type === "rectangle")!;
  // Moving the rectangle exercises selection and real engine history.
  await page.keyboard.press("v");
  await page.mouse.move(bounds.x + 382, bounds.y + 390);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 410, bounds.y + 405, { steps: 8 });
  await page.mouse.up();
  await expect
    .poll(async () => (await rectangle()).x)
    .not.toBe(originalRectangle.x);
  const moved = await rectangle();
  await page.mouse.move(bounds.x + 540, bounds.y + 457);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 580, bounds.y + 487, { steps: 8 });
  await page.mouse.up();
  await expect
    .poll(async () => (await rectangle()).width)
    .not.toBe(moved.width);
  const resized = await rectangle();
  await page.keyboard.press("Control+z");
  await expect.poll(async () => (await rectangle()).width).toBe(moved.width);
  await page.keyboard.press("Control+Shift+z");
  await expect.poll(async () => (await rectangle()).width).toBe(resized.width);
  await expect(
    page.getByText("All changes saved", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Fit content", exact: true }).click();
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await page.getByRole("button", { name: "Reset zoom", exact: true }).click();
  await page.getByRole("button", { name: "New page", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Page title", exact: true })
    .last()
    .fill("Second page");
  await page.getByRole("button", { name: "Whiteboard", exact: false }).click();
  await page.getByRole("button", { name: "Create page", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Page title", exact: true }),
  ).toHaveValue("Second page");
  await expect(page.locator(".excalidraw canvas").first()).toBeVisible();
  await page.keyboard.press("Escape");
  await page.mouse.click(bounds.x + 400, bounds.y + 270);
  await page.keyboard.press("r");
  await page.mouse.move(bounds.x + 420, bounds.y + 300);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 530, bounds.y + 400, { steps: 8 });
  await page.mouse.up();
  await expect(
    page.getByText("All changes saved", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "First drawing", exact: false })
    .first()
    .click();
  await expect(
    page.getByRole("textbox", { name: "Page title", exact: true }),
  ).toHaveValue("First drawing");
  await page.reload();
  await expect(page.locator(".excalidraw canvas").first()).toBeVisible();
  const restored = (await readDocument()).find(
    (d) => d.pageId === first.pageId,
  )!;
  expect(restored.elements.map((e) => e.type)).toEqual(
    first.elements.map((e) => e.type),
  );
  expect(Object.keys(restored.files)).toEqual(Object.keys(first.files));
  const download = page.waitForEvent("download");
  await page.getByRole("combobox", { name: "Export page" }).selectOption("png");
  expect((await download).suggestedFilename()).toBe("First drawing.png");
  await page
    .getByRole("button", { name: "Back to notebooks", exact: true })
    .click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const backup = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export backup", exact: true })
    .click();
  expect((await backup).suggestedFilename()).toMatch(/lotepad-backup.*\.zip/);
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.screenshot({ path: "test-results/dashboard.png", fullPage: true });
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Notebooks", exact: true }),
  ).toBeVisible();
  await context.setOffline(true);
  await page.reload();
  await expect(
    page.getByRole("button", {
      name: "Open Browser test notebook",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Open Browser test notebook", exact: true })
    .click();
  await expect(page.locator(".excalidraw canvas").first()).toBeVisible();
  await page.screenshot({ path: "test-results/editor.png" });
  await context.setOffline(false);
  expect(errors).toEqual([]);
});

test("backup downloads restore through the interface without overwriting during merge", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New notebook", exact: true }).click();
  await page.getByRole("textbox", { name: "Notebook name" }).fill("Restore me");
  await page
    .getByRole("button", { name: "Create notebook", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Open Restore me", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const ready = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export backup", exact: true })
    .click();
  const archive = await ready;
  const archivePath = await archive.path();
  if (!archivePath) throw new Error("Backup did not download");
  await page.locator("input[type=file]").setInputFiles(archivePath);
  await page
    .getByRole("button", { name: "Merge notebooks", exact: true })
    .click();
  await expect(
    page.getByText("4 notebooks restored", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close dialog" }).click();
  await expect(
    page.getByRole("button", { name: "Open Restore me", exact: true }),
  ).toHaveCount(2);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.locator("input[type=file]").setInputFiles(archivePath);
  await page
    .getByRole("button", { name: "Replace all data…", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Replace all data", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await page.getByRole("button", { name: "Close dialog" }).click();
  await expect(
    page.getByRole("button", { name: "Open Restore me", exact: true }),
  ).toHaveCount(1);
});

test.describe("touch input", () => {
  test.use({ hasTouch: true, viewport: { width: 1366, height: 768 } });
  test("finger pen strokes persist without scrolling the application", async ({
    page,
    context,
  }) => {
    await page.goto("/");
    await page
      .getByRole("button", { name: "Open My Journal", exact: true })
      .click();
    await expect(page.locator(".excalidraw canvas").first()).toBeVisible();
    await page.locator(".excalidraw").click({ position: { x: 400, y: 200 } });
    await page.keyboard.press("p");
    await expect(
      page.getByRole("radio", { name: "Draw", exact: true }),
    ).toBeChecked();
    const session = await context.newCDPSession(page);
    const point = { x: 700, y: 300, radiusX: 3, radiusY: 3, force: 0.6, id: 1 };
    await session.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [point],
    });
    for (let i = 1; i <= 15; i++)
      await session.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [
          { ...point, x: 700 + i * 6, y: 300 + Math.sin(i / 4) * 30 },
        ],
      });
    await session.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await expect(
      page.getByText("All changes saved", { exact: true }),
    ).toBeVisible();
    expect(await page.evaluate(() => scrollY)).toBe(0);
    await expect
      .poll(() =>
        page.evaluate(async () => {
          const r = indexedDB.open("inknest");
          const db = await new Promise<IDBDatabase>((resolve) => {
            r.onsuccess = () => resolve(r.result);
          });
          const all = db
            .transaction("contents")
            .objectStore("contents")
            .getAll();
          const contents = await new Promise<
            { elements: { type: string }[] }[]
          >((resolve) => {
            all.onsuccess = () => resolve(all.result);
          });
          db.close();
          return contents.some((c) =>
            c.elements.some((e) => e.type === "freedraw"),
          );
        }),
      )
      .toBe(true);
    await page.screenshot({ path: "test-results/touch-1366.png" });
  });
});
test("responsive library and persistent appearance settings", async ({
  page,
}) => {
  await page.setViewportSize({ width: 820, height: 900 });
  await page.goto("/");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Dark", exact: true }).click();
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: "test-results/tablet-dark.png" });
});
