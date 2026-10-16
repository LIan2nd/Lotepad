import JSZip from "jszip";
import { repository, type Repository } from "./database/legacyRepository";
import { defaultSettings, type BackupData, type AppSettings } from "../types";
import {
  readCreativePreferences,
  saveCreativePreferences,
} from "../features/creative/preferences";
import { defaultCreativePreferences } from "../features/creative/types";
export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
import { validateBackup } from "./backupValidation";
export { validateBackup } from "./backupValidation";
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
    for (const meta of data.metadata ?? []) {
      if (meta.key === "creative-library-v1") continue;
      const key =
        mode === "merge" && (await database.meta.get(meta.key))
          ? `import-${crypto.randomUUID()}:${meta.key}`
          : meta.key;
      await database.meta.put({ key, value: meta.value });
    }
    for (const pref of data.preferences ?? []) {
      if (pref.key === "settings") continue;
      // The legacy schema types only the current settings shape, but preserve unknown preference records exactly.
      const key =
        mode === "merge" && (await database.preferences.get(pref.key))
          ? `import-${crypto.randomUUID()}:${pref.key}`
          : pref.key;
      await database.preferences.put({ key, value: pref.value as AppSettings });
    }
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
