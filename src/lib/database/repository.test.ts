import "fake-indexeddb/auto";
import { beforeEach, afterEach, describe, expect, it } from "vitest";
import { InkDatabase } from "./db";
import { Repository } from "./repository";
import { defaultSettings } from "../../types";
import {
  exportBackup,
  importBackup,
  readBackup,
  validateBackup,
} from "../backup";
import { Autosave } from "./autosave";
let database: InkDatabase;
let repo: Repository;
beforeEach(() => {
  database = new InkDatabase(`test-${crypto.randomUUID()}`);
  repo = new Repository(database);
});
afterEach(async () => {
  await database.delete();
});
describe("local notebooks", () => {
  it("seeds just once, even after every sample notebook is deleted", async () => {
    await repo.initialize();
    expect(await database.notebooks.count()).toBe(3);
    for (const b of await database.notebooks.toArray())
      await repo.deleteNotebook(b.id);
    await repo.initialize();
    expect(await database.notebooks.count()).toBe(0);
  });
  it("creates and renames notebooks and pages, with isolated documents", async () => {
    const book = await repo.createNotebook("Journal");
    const a = await repo.createPage(book.id, { title: "First" });
    const b = await repo.createPage(book.id, {
      title: "Second",
      mode: "infinite",
    });
    await repo.updateNotebook(book.id, {
      title: "My journal",
      color: "#aabbcc",
    });
    await repo.updatePage(a.id, { title: "One" });
    await repo.saveContent({
      ...(await repo.loadContent(a.id)),
      initialized: true,
      appState: { viewBackgroundColor: "#ffeedd" },
    });
    expect((await database.notebooks.get(book.id))?.title).toBe("My journal");
    expect((await database.pages.get(a.id))?.title).toBe("One");
    expect((await repo.loadContent(a.id)).appState.viewBackgroundColor).toBe(
      "#ffeedd",
    );
    expect(
      (await repo.loadContent(b.id)).appState.viewBackgroundColor,
    ).toBeUndefined();
    expect(b.order).toBe(1);
  });
  it("duplicates pages and notebooks without reusing document references", async () => {
    const book = await repo.createNotebook("Ideas");
    const page = await repo.createPage(book.id);
    await repo.saveContent({
      ...(await repo.loadContent(page.id)),
      initialized: true,
    });
    const copy = await repo.duplicatePage(page.id);
    expect(copy.id).not.toBe(page.id);
    expect((await repo.loadContent(copy.id)).initialized).toBe(true);
    const bookCopy = await repo.duplicateNotebook(book.id);
    expect(
      await database.pages.where("notebookId").equals(bookCopy.id).count(),
    ).toBe(2);
  });
  it("reorders pages, trashes and restores notebooks, and atomically deletes all content", async () => {
    const book = await repo.createNotebook("Study");
    const a = await repo.createPage(book.id);
    const b = await repo.createPage(book.id);
    await repo.reorder(b.id, -1);
    expect((await database.pages.get(b.id))?.order).toBe(0);
    expect((await database.pages.get(a.id))?.order).toBe(1);
    await repo.trashNotebook(book.id);
    expect((await database.notebooks.get(book.id))?.deletedAt).toBeTruthy();
    await repo.restoreNotebook(book.id);
    expect((await database.notebooks.get(book.id))?.deletedAt).toBeNull();
    await repo.deleteNotebook(book.id);
    expect(await database.contents.count()).toBe(0);
    expect(await database.pages.count()).toBe(0);
  });
  it("persists settings through closing and reopening IndexedDB", async () => {
    const settings = {
      ...defaultSettings,
      theme: "dark" as const,
      defaultPaper: "grid" as const,
    };
    await repo.updateSettings(settings);
    database.close();
    await database.open();
    expect(await repo.settings()).toEqual(settings);
  });
});
describe("complete backups", () => {
  it("round trips scene data and image assets into a clean database; merge never overwrites", async () => {
    await repo.initialize();
    const page = (await database.pages.toArray())[0];
    const imageId = "local-image";
    const content = await repo.loadContent(page.id);
    await repo.saveContent({
      ...content,
      files: {
        [imageId]: {
          id: imageId as never,
          dataURL: "data:image/png;base64,aGVsbG8=" as never,
          mimeType: "image/png",
          created: 1,
        },
      },
      initialized: true,
    });
    const original = await database.notebooks.toArray();
    const backup = await exportBackup(repo);
    const data = await readBackup(backup);
    expect(data.app).toBe("lotepad");
    expect(validateBackup({ ...data, app: "InkNest" })).toEqual(data);
    for (const book of original) await repo.deleteNotebook(book.id);
    await importBackup(data, "replace", repo);
    expect(await database.notebooks.toArray()).toEqual(original);
    expect((await repo.loadContent(page.id)).files[imageId].dataURL).toBe(
      "data:image/png;base64,aGVsbG8=",
    );
    await importBackup(data, "merge", repo);
    expect(await database.notebooks.count()).toBe(6);
    expect(await database.pages.count()).toBe(6);
  });
  it("rejects unsupported archives, duplicate IDs, and missing image files", async () => {
    await repo.initialize();
    const data = await readBackup(await exportBackup(repo));
    expect(() => validateBackup({ ...data, version: 9 })).toThrow("supported");
    expect(() =>
      validateBackup({
        ...data,
        notebooks: [...data.notebooks, data.notebooks[0]],
      }),
    ).toThrow("Duplicate");
    const broken = structuredClone(data);
    broken.contents[0].elements = [
      {
        id: "broken",
        type: "image",
        x: 0,
        y: 0,
        width: 20,
        height: 20,
        version: 1,
        fileId: "missing",
      } as never,
    ];
    expect(() => validateBackup(broken)).toThrow("missing an image");
    await expect(
      readBackup(new TextEncoder().encode("not a zip").buffer),
    ).rejects.toThrow("valid ZIP");
  });
  it("leaves existing data intact when a restore fails validation", async () => {
    await repo.initialize();
    const count = await database.notebooks.count();
    const data = await readBackup(await exportBackup(repo));
    await expect(
      importBackup({ ...data, pages: [] }, "replace", repo),
    ).rejects.toThrow();
    expect(await database.notebooks.count()).toBe(count);
  });
});
describe("autosave queue", () => {
  it("serializes writes and keeps page IDs isolated", async () => {
    const saved: string[] = [];
    const book = await repo.createNotebook("test");
    const a = await repo.createPage(book.id);
    const b = await repo.createPage(book.id);
    const queue = new Autosave(
      async (content) => {
        await repo.saveContent(content);
        saved.push(content.pageId);
      },
      () => {},
      10000,
    );
    queue.schedule(await repo.loadContent(a.id));
    const first = queue.flush();
    queue.schedule(await repo.loadContent(b.id));
    await Promise.all([first, queue.flush()]);
    expect(saved.at(-1)).toBe(b.id);
    expect((await repo.loadContent(a.id)).pageId).toBe(a.id);
    queue.dispose();
  });
  it("retains failed saves for an explicit retry", async () => {
    const book = await repo.createNotebook("test");
    const page = await repo.createPage(book.id);
    let fail = true;
    const statuses: string[] = [];
    const queue = new Autosave(
      async () => {
        if (fail) throw new Error("disk full");
      },
      (s) => statuses.push(s),
      10000,
    );
    queue.schedule(await repo.loadContent(page.id));
    await expect(queue.flush()).rejects.toThrow("disk full");
    expect(queue.dirty).toBe(true);
    expect(statuses.at(-1)).toBe("error");
    fail = false;
    await queue.flush();
    expect(queue.dirty).toBe(false);
    expect(statuses.at(-1)).toBe("saved");
    queue.dispose();
  });
});
