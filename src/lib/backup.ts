import JSZip from "jszip";
import { repository, type Repository } from "./database/repository";
import { defaultSettings, type BackupData, type AppSettings } from "../types";
import {
  readCreativePreferences,
  saveCreativePreferences,
} from "../features/creative/preferences";
import { validateCreativePreferences } from "../features/creative/palettes";
import { defaultCreativePreferences } from "../features/creative/types";
export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
export function validateBackup(value: unknown): BackupData {
  assert(
    record(value) &&
      (value.app === "lotepad" || value.app === "InkNest") &&
      value.version === 1,
    "This is not a supported lotepad backup (version 1).",
  );
  assert(
    Array.isArray(value.notebooks) &&
      Array.isArray(value.pages) &&
      Array.isArray(value.contents),
    "The backup is missing its notebook data.",
  );
  const bookIds = new Set<string>(),
    pageIds = new Set<string>(),
    contentIds = new Set<string>();
  for (const book of value.notebooks) {
    assert(
      record(book) &&
        typeof book.id === "string" &&
        typeof book.title === "string" &&
        typeof book.color === "string" &&
        /^#[0-9a-f]{6}$/i.test(book.color) &&
        typeof book.icon === "string" &&
        typeof book.favorite === "boolean" &&
        typeof book.createdAt === "number" &&
        typeof book.updatedAt === "number" &&
        (book.deletedAt === null || typeof book.deletedAt === "number"),
      "Invalid notebook metadata.",
    );
    assert(!bookIds.has(book.id), "Duplicate notebook IDs in backup.");
    bookIds.add(book.id);
  }
  for (const page of value.pages) {
    assert(
      record(page) &&
        typeof page.id === "string" &&
        typeof page.notebookId === "string" &&
        bookIds.has(page.notebookId) &&
        typeof page.title === "string" &&
        ["paper", "infinite"].includes(String(page.mode)) &&
        ["blank", "ruled", "grid", "dotted", "vintage"].includes(
          String(page.paper),
        ) &&
        ["A4", "A4 landscape", "A5", "Letter"].includes(String(page.size)) &&
        typeof page.paperColor === "string" &&
        /^#[0-9a-f]{6}$/i.test(page.paperColor) &&
        ["order", "createdAt", "updatedAt", "lastOpenedAt"].every(
          (key) => typeof page[key] === "number" && Number.isFinite(page[key]),
        ) &&
        (page.deletedAt === null || typeof page.deletedAt === "number"),
      "Invalid page metadata or missing notebook.",
    );
    assert(!pageIds.has(page.id), "Duplicate page IDs in backup.");
    pageIds.add(page.id);
  }
  for (const content of value.contents) {
    assert(
      record(content) &&
        typeof content.pageId === "string" &&
        pageIds.has(content.pageId) &&
        Array.isArray(content.elements) &&
        record(content.appState) &&
        record(content.files) &&
        typeof content.initialized === "boolean",
      "Invalid page document.",
    );
    assert(!contentIds.has(content.pageId), "Duplicate documents in backup.");
    contentIds.add(content.pageId);
    const elementIds = new Set<string>();
    for (const [id, file] of Object.entries(content.files)) {
      assert(
        record(file) &&
          file.id === id &&
          typeof file.dataURL === "string" &&
          /^data:image\/(png|jpeg|webp|gif|svg\+xml);base64,/.test(
            file.dataURL,
          ) &&
          typeof file.mimeType === "string" &&
          typeof file.created === "number",
        "Invalid image asset in backup.",
      );
    }
    for (const element of content.elements) {
      assert(
        record(element) &&
          typeof element.id === "string" &&
          typeof element.type === "string" &&
          typeof element.x === "number" &&
          typeof element.y === "number" &&
          typeof element.width === "number" &&
          typeof element.height === "number" &&
          typeof element.version === "number",
        "Invalid drawing element.",
      );
      assert(!elementIds.has(element.id), "Duplicate drawing element IDs.");
      elementIds.add(element.id);
      if (element.type === "image" && !element.isDeleted) {
        assert(
          typeof element.fileId === "string" && content.files[element.fileId],
          "A drawing is missing an image asset.",
        );
      }
    }
  }
  assert(
    pageIds.size === contentIds.size,
    "Some pages are missing their documents.",
  );
  assert(
    record(value.settings) &&
      ["light", "dark", "system"].includes(String(value.settings.theme)) &&
      ["paper", "infinite"].includes(String(value.settings.defaultMode)) &&
      ["blank", "ruled", "grid", "dotted", "vintage"].includes(
        String(value.settings.defaultPaper),
      ) &&
      typeof value.settings.paperColor === "string" &&
      /^#[0-9a-f]{6}$/i.test(value.settings.paperColor) &&
      typeof value.settings.defaultZoom === "number" &&
      value.settings.defaultZoom >= 0.1 &&
      value.settings.defaultZoom <= 3,
    "Invalid backup settings.",
  );
  // Normalize legacy backups to the current brand without changing their data.
  if (value.creative !== undefined) validateCreativePreferences(value.creative);
  return { ...value, app: "lotepad" } as unknown as BackupData;
}
export async function exportBackup(repo: Repository = repository) {
  const database = repo.database;
  const data = await database.transaction(
    "r",
    database.tables,
    async (): Promise<BackupData> => ({
      app: "lotepad",
      version: 1,
      createdAt: Date.now(),
      notebooks: await database.notebooks.toArray(),
      pages: await database.pages.toArray(),
      contents: await database.contents.toArray(),
      settings: await repo.settings(),
      creative: await readCreativePreferences(repo),
    }),
  );
  const zip = new JSZip();
  zip.file("manifest.json", JSON.stringify(data));
  return zip.generateAsync({ type: "blob", compression: "DEFLATE" });
}
export async function readBackup(
  file: Blob | ArrayBuffer,
): Promise<BackupData> {
  const input = file instanceof Blob ? await file.arrayBuffer() : file;
  if (input.byteLength > 150 * 1024 * 1024)
    throw new Error("Please use a backup smaller than 150 MB.");
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(input);
  } catch {
    throw new Error("This file is not a valid ZIP backup.");
  }
  const manifest = zip.file("manifest.json");
  if (!manifest) throw new Error("This archive has no lotepad manifest.");
  return validateBackup(JSON.parse(await manifest.async("string")) as unknown);
}
export async function importBackup(
  input: BackupData,
  mode: "merge" | "replace",
  repo: Repository = repository,
) {
  const data = structuredClone(validateBackup(input));
  const database = repo.database;
  await database.transaction("rw", database.tables, async () => {
    if (mode === "replace") {
      await database.notebooks.clear();
      await database.pages.clear();
      await database.contents.clear();
      await repo.updateSettings(data.settings);
    } else {
      // Always remap imported IDs: merging can never overwrite an existing note.
      const books = new Map(
        data.notebooks.map((b) => [b.id, crypto.randomUUID()]),
      );
      const pages = new Map(data.pages.map((p) => [p.id, crypto.randomUUID()]));
      data.notebooks = data.notebooks.map((b) => ({
        ...b,
        id: books.get(b.id)!,
      }));
      data.pages = data.pages.map((p) => ({
        ...p,
        id: pages.get(p.id)!,
        notebookId: books.get(p.notebookId)!,
      }));
      data.contents = data.contents.map((c) => ({
        ...c,
        pageId: pages.get(c.pageId)!,
      }));
    }
    await database.notebooks.bulkAdd(data.notebooks);
    await database.pages.bulkAdd(data.pages);
    await database.contents.bulkAdd(data.contents);
    await database.meta.put({ key: "initialized", value: "1" });
    if (mode === "replace")
      await saveCreativePreferences(
        data.creative ?? structuredClone(defaultCreativePreferences),
        repo,
      );
    else if (data.creative) {
      const current = await readCreativePreferences(repo);
      const imported = data.creative;
      const custom = imported.customPalettes.map((p) => {
        const existing = current.customPalettes.find((c) => c.id === p.id);
        if (existing && JSON.stringify(existing) !== JSON.stringify(p)) {
          const id = `custom-${crypto.randomUUID()}`;
          return { ...p, id };
        }
        return p;
      });
      await saveCreativePreferences(
        {
          ...current,
          favorites: [
            ...new Set([...current.favorites, ...imported.favorites]),
          ],
          recent: [...new Set([...current.recent, ...imported.recent])].slice(
            0,
            30,
          ),
          customPalettes: [
            ...current.customPalettes,
            ...custom.filter(
              (p) => !current.customPalettes.some((c) => c.id === p.id),
            ),
          ],
        },
        repo,
      );
    }
    if (!(await database.preferences.get("settings")))
      await repo.updateSettings({
        ...defaultSettings,
        ...data.settings,
      } as AppSettings);
  });
}
