import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { assets, assetPreview } from "./registry";
import { palettes, readableInk, validateCreativePreferences } from "./palettes";
import { defaultCreativePreferences } from "./types";
import { InkDatabase } from "../../lib/database/db";
import { Repository } from "../../lib/database/repository";
import {
  readCreativePreferences,
  saveCreativePreferences,
  updateCreativePreferences,
} from "./preferences";
import {
  exportBackup,
  importBackup,
  readBackup,
  validateBackup,
} from "../../lib/backup";
let database: InkDatabase;
let repo: Repository;
beforeEach(() => {
  database = new InkDatabase(`creative-test-${crypto.randomUUID()}`);
  repo = new Repository(database);
});
afterEach(async () => {
  await database.delete();
});
describe("creative catalog", () => {
  it("keeps native card labels readable on both dark and light fills", () => {
    expect(readableInk("#35323d", "#42374f")).toBe("#fffaf1");
    expect(readableInk("#fff9ef", "#4f3b62")).toBe("#4f3b62");
    expect(readableInk("#fff9ef", "#fffaf1")).toBe("#292532");
  });
  it("ships at least 30 original stickers and every required asset category, with collision-free IDs", () => {
    expect(
      assets.filter((a) => a.category === "stickers").length,
    ).toBeGreaterThanOrEqual(30);
    expect(new Set(assets.map((a) => a.id)).size).toBe(assets.length);
    for (const category of [
      "stickers",
      "tapes",
      "papers",
      "notes",
      "frames",
      "doodles",
      "labels",
      "decorations",
      "text",
    ])
      expect(assets.some((a) => a.category === category)).toBe(true);
  });
  it("renders previews for every asset and palette without remote image references", () => {
    for (const palette of palettes)
      for (const asset of assets) {
        const url = assetPreview(asset, palette);
        expect(url.startsWith("data:image/svg+xml;base64,")).toBe(true);
        const svg = Buffer.from(url.split(",")[1], "base64").toString("utf8");
        expect(svg).toContain("<svg");
        expect(svg).toContain("</svg>");
        expect(svg).not.toMatch(/(?:href|src)=["']https?:/);
      }
  });
  it("rejects malformed palettes and duplicate palette identifiers", () => {
    expect(() =>
      validateCreativePreferences({
        ...defaultCreativePreferences,
        customPalettes: [{ ...palettes[0], colors: ["red"] }],
      }),
    ).toThrow();
    expect(() =>
      validateCreativePreferences({
        ...defaultCreativePreferences,
        customPalettes: [palettes[0], palettes[0]],
      }),
    ).toThrow();
  });
});
describe("creative preferences and legacy compatibility", () => {
  it("adds creative preferences without modifying existing notes, scenes, settings, or DB version", async () => {
    await repo.initialize();
    const notebooks = await database.notebooks.toArray(),
      pages = await database.pages.toArray(),
      contents = await database.contents.toArray(),
      settings = await repo.settings();
    expect(await readCreativePreferences(repo)).toEqual(
      defaultCreativePreferences,
    );
    await saveCreativePreferences(
      {
        ...defaultCreativePreferences,
        favorites: ["soft-star"],
        customPalettes: [{ ...palettes[0], id: "custom-a" }],
      },
      repo,
    );
    expect(await database.notebooks.toArray()).toEqual(notebooks);
    expect(await database.pages.toArray()).toEqual(pages);
    expect(await database.contents.toArray()).toEqual(contents);
    expect(await repo.settings()).toEqual(settings);
    expect(database.verno).toBe(1);
    database.close();
    await database.open();
    expect((await readCreativePreferences(repo)).favorites).toEqual([
      "soft-star",
    ]);
  });
  it("keeps concurrent favorite and recent updates", async () => {
    await Promise.all([
      updateCreativePreferences(
        (p) => ({ ...p, favorites: [...p.favorites, "soft-star"] }),
        repo,
      ),
      updateCreativePreferences(
        (p) => ({ ...p, recent: ["daisy", ...p.recent] }),
        repo,
      ),
    ]);
    const stored = await readCreativePreferences(repo);
    expect(stored.favorites).toContain("soft-star");
    expect(stored.recent).toContain("daisy");
  });
  it("round trips custom palettes, favorites, images and native card bindings; merges avoid palette collisions", async () => {
    await repo.initialize();
    const page = (await database.pages.toArray())[0];
    const content = await repo.loadContent(page.id);
    await repo.saveContent({
      ...content,
      elements: [
        {
          id: "card",
          type: "rectangle",
          x: 20,
          y: 30,
          width: 210,
          height: 190,
          version: 1,
          boundElements: [{ id: "label", type: "text" }],
          groupIds: ["note-group"],
        },
        {
          id: "label",
          type: "text",
          text: "Still editable",
          containerId: "card",
          x: 30,
          y: 45,
          width: 190,
          height: 100,
          version: 1,
          groupIds: ["note-group"],
        },
      ] as never,
      files: {
        "sticker-file": {
          id: "sticker-file" as never,
          mimeType: "image/svg+xml",
          created: 1,
          dataURL: assetPreview(assets[0], palettes[0]) as never,
        },
      },
      initialized: true,
    });
    await saveCreativePreferences(
      {
        ...defaultCreativePreferences,
        favorites: ["soft-star"],
        customPalettes: [{ ...palettes[0], id: "custom-test" }],
        paletteId: "custom-test",
      },
      repo,
    );
    const backup = await readBackup(await exportBackup(repo));
    await importBackup(backup, "replace", repo);
    expect((await readCreativePreferences(repo)).paletteId).toBe("custom-test");
    expect((await repo.loadContent(page.id)).elements[1]).toMatchObject({
      type: "text",
      containerId: "card",
      text: "Still editable",
    });
    expect(
      (await repo.loadContent(page.id)).files["sticker-file"],
    ).toBeTruthy();
    const conflicting = structuredClone(backup);
    conflicting.creative!.customPalettes[0].name = "Different palette";
    await importBackup(conflicting, "merge", repo);
    expect((await readCreativePreferences(repo)).customPalettes).toHaveLength(
      2,
    );
  });
  it("accepts pre-expansion backups and rejects invalid creative data before replacing anything", async () => {
    await repo.initialize();
    const data = await readBackup(await exportBackup(repo));
    delete data.creative;
    expect(validateBackup({ ...data, app: "InkNest" }).app).toBe("lotepad");
    await importBackup(data, "replace", repo);
    expect(await database.notebooks.count()).toBe(3);
    expect(await readCreativePreferences(repo)).toEqual(
      defaultCreativePreferences,
    );
    await expect(
      importBackup(
        {
          ...data,
          creative: {
            ...defaultCreativePreferences,
            customPalettes: [{ bad: "data" }],
          } as never,
        },
        "replace",
        repo,
      ),
    ).rejects.toThrow();
    expect(await database.notebooks.count()).toBe(3);
  });
});
