import { test, expect } from "@playwright/test";
import JSZip from "jszip";
import sharp from "sharp";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";

test("desktop migration export preserves every browser table and embeds verified media", async ({
  page,
}, info) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Notebooks", exact: true }),
  ).toBeVisible();
  const png = await sharp({
    create: { width: 12, height: 8, channels: 4, background: "#bb99dd" },
  })
    .png()
    .toBuffer();
  await page.evaluate(async (image) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("inknest");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const tx = db.transaction(
      ["notebooks", "pages", "contents", "preferences", "meta"],
      "readwrite",
    );
    tx.objectStore("notebooks").put({
      id: "migration-book",
      title: "Browser → Desktop 日本語",
      color: "#aabbcc",
      icon: "✦",
      favorite: true,
      createdAt: 100,
      updatedAt: 200,
      deletedAt: null,
      customCover: { preserve: true },
    });
    tx.objectStore("pages").put({
      id: "migration-page",
      notebookId: "migration-book",
      title: "Scrapbook",
      mode: "paper",
      paper: "vintage",
      size: "A4",
      paperColor: "#fffdf8",
      order: 7,
      createdAt: 100,
      updatedAt: 200,
      lastOpenedAt: 150,
      deletedAt: null,
    });
    tx.objectStore("contents").put({
      pageId: "migration-page",
      initialized: true,
      appState: { zoom: { value: 0.7 } },
      elements: [
        {
          id: "migration-image",
          type: "image",
          x: 10,
          y: 10,
          width: 120,
          height: 80,
          version: 1,
          versionNonce: 1,
          seed: 1,
          isDeleted: false,
          angle: 0,
          strokeColor: "#000000",
          backgroundColor: "transparent",
          fillStyle: "solid",
          strokeWidth: 1,
          strokeStyle: "solid",
          roughness: 0,
          opacity: 100,
          groupIds: ["migration-group"],
          frameId: null,
          roundness: null,
          boundElements: null,
          updated: 200,
          link: null,
          locked: false,
          fileId: "migration-photo",
          status: "saved",
          scale: [1, 1],
          crop: null,
        },
      ],
      files: {
        "migration-photo": {
          id: "migration-photo",
          mimeType: "image/png",
          created: 100,
          dataURL: `data:image/png;base64,${image}`,
        },
      },
    });
    tx.objectStore("preferences").put({
      key: "future-preference",
      value: { nested: ["preserved", 42] },
    });
    tx.objectStore("meta").put({
      key: "future-meta",
      value: "Unicode Ω and 'quotes'\n",
    });
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, png.toString("base64"));
  const snapshot = () =>
    page.evaluate(async () => {
      const db = await new Promise<IDBDatabase>((resolve) => {
        const request = indexedDB.open("inknest");
        request.onsuccess = () => resolve(request.result);
      });
      const names = ["notebooks", "pages", "contents", "preferences", "meta"];
      const tx = db.transaction(names, "readonly");
      const data = await Promise.all(
        names.map(
          (name) =>
            new Promise<unknown[]>((resolve) => {
              const request = tx.objectStore(name).getAll();
              request.onsuccess = () => resolve(request.result);
            }),
        ),
      );
      db.close();
      return Object.fromEntries(names.map((name, i) => [name, data[i]]));
    });
  const before = await snapshot();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const pending = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export for Lotepad Desktop", exact: true })
    .click();
  const download = await pending;
  const output = info.outputPath("browser-migration.zip");
  await download.saveAs(output);
  const zip = await JSZip.loadAsync(await readFile(output));
  const manifest = JSON.parse(await zip.file("manifest.json")!.async("string"));
  const bytes = await zip.file("data.json")!.async("nodebuffer");
  const data = JSON.parse(bytes.toString());
  expect(manifest.formatVersion).toBe(2);
  expect(manifest.dataSha256).toBe(
    createHash("sha256").update(bytes).digest("hex"),
  );
  expect(manifest.counts).toEqual({
    notebooks: before.notebooks.length,
    pages: before.pages.length,
    scenes: before.contents.length,
    assets: 1,
  });
  expect(manifest.assets[0].sha256).toBe(
    createHash("sha256").update(png).digest("hex"),
  );
  expect(data.preferences).toEqual(before.preferences);
  expect(data.metadata).toEqual(before.meta);
  expect(data.contents).toEqual(before.contents);
  expect(await snapshot()).toEqual(before);
});
