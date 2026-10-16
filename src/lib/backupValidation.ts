import type { BackupData } from "../types";
import { validateCreativePreferences } from "../features/creative/palettes";
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
  for (const field of ["metadata", "preferences"]) {
    if (value[field] !== undefined) {
      const entries = value[field];
      assert(Array.isArray(entries), `Invalid ${field} records.`);
      const keys = new Set<string>();
      for (const entry of entries) {
        assert(
          record(entry) &&
            typeof entry.key === "string" &&
            !keys.has(entry.key) &&
            "value" in entry,
          `Invalid or duplicate ${field} record.`,
        );
        keys.add(entry.key);
        if (field === "metadata")
          assert(typeof entry.value === "string", "Invalid metadata value.");
      }
    }
  }
  return { ...value, app: "lotepad" } as unknown as BackupData;
}
