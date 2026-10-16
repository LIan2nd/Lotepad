import JSZip from "jszip";
import { repository, storageChanged } from "./database/repository";
import type { Persistence } from "./database/contracts";
import type { BackupData } from "../types";
import { validateBackup } from "./backupValidation";
import { defaultCreativePreferences } from "../features/creative/types";
import { validateCreativePreferences } from "../features/creative/palettes";
import { isDesktop, native } from "./desktop/runtime";
export { validateBackup } from "./backupValidation";
function snapshotCreative(data: BackupData) {
  const value = data.metadata?.find(
    (entry) => entry.key === "creative-library-v1",
  )?.value;
  return validateCreativePreferences(
    data.creative ??
      (value ? JSON.parse(value) : structuredClone(defaultCreativePreferences)),
  );
}
export async function download(blob: Blob, name: string) {
  if (isDesktop) {
    const result = await native<{ cancelled: boolean }>("save_document", {
      name,
      bytes: Array.from(new Uint8Array(await blob.arrayBuffer())),
    });
    return !result.cancelled;
  }
  const url = URL.createObjectURL(blob),
    link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return true;
}
export async function exportBackup(repo: Persistence = repository) {
  const data = await repo.readSnapshot();
  data.creative = snapshotCreative(data);
  const zip = new JSZip();
  zip.file("manifest.json", JSON.stringify(data));
  return zip.generateAsync({ type: "blob", compression: "DEFLATE" });
}
export async function sha256(bytes: Uint8Array<ArrayBuffer>) {
  return Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
}
export async function exportMigration(repo: Persistence = repository) {
  const data = await repo.readSnapshot();
  data.creative = snapshotCreative(data);
  validateBackup(data);
  const bytes = new TextEncoder().encode(JSON.stringify(data));
  const assets = [];
  for (const content of data.contents)
    for (const [fileId, file] of Object.entries(content.files)) {
      const raw = Uint8Array.from(atob(file.dataURL.split(",")[1]), (c) =>
        c.charCodeAt(0),
      );
      assets.push({
        pageId: content.pageId,
        fileId,
        sha256: await sha256(raw),
        byteSize: raw.length,
        mimeType: file.mimeType,
      });
    }
  const manifest = {
    format: "lotepad-portable",
    formatVersion: 2,
    sourceApplicationVersion: "1.2.0",
    sourceStorageSchemaVersion: 1,
    exportedAt: new Date().toISOString(),
    dataSha256: await sha256(bytes),
    counts: {
      notebooks: data.notebooks.length,
      pages: data.pages.length,
      scenes: data.contents.length,
      assets: assets.length,
    },
    assets,
  };
  const zip = new JSZip();
  zip.file("manifest.json", JSON.stringify(manifest));
  zip.file("data.json", bytes);
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
  const names = Object.keys(zip.files);
  if (
    names.length > 10000 ||
    names.some(
      (n) =>
        n.includes("..") ||
        n.startsWith("/") ||
        n.includes("\\") ||
        n.includes(":"),
    )
  )
    throw new Error("Unsafe archive paths.");
  const entry = zip.file("manifest.json");
  if (!entry) throw new Error("This archive has no lotepad manifest.");
  const total = Object.values(zip.files).reduce(
    (sum, entry) =>
      sum +
      ((entry as unknown as { _data?: { uncompressedSize?: number } })._data
        ?.uncompressedSize ?? 0),
    0,
  );
  if (total > 512 * 1024 * 1024)
    throw new Error("The decompressed archive exceeds 512 MB.");
  const manifest = JSON.parse(await entry.async("string"));
  if (manifest.format === "lotepad-portable") {
    if (manifest.formatVersion !== 2)
      throw new Error("Unsupported portable archive version.");
    const payload = zip.file("data.json");
    if (!payload) throw new Error("Archive data is missing.");
    const bytes = await payload.async("uint8array");
    if ((await sha256(new Uint8Array(bytes))) !== manifest.dataSha256)
      throw new Error("Archive checksum mismatch.");
    const data = validateBackup(JSON.parse(new TextDecoder().decode(bytes)));
    const inventory = new Map<string, string>();
    for (const asset of manifest.assets ?? [])
      inventory.set(`${asset.pageId}:${asset.fileId}`, asset.sha256);
    let count = 0;
    for (const content of data.contents)
      for (const [id, asset] of Object.entries(content.files)) {
        const bytes = Uint8Array.from(atob(asset.dataURL.split(",")[1]), (c) =>
          c.charCodeAt(0),
        );
        if ((await sha256(bytes)) !== inventory.get(`${content.pageId}:${id}`))
          throw new Error("Asset checksum mismatch.");
        count++;
      }
    if (
      manifest.counts?.assets !== count ||
      manifest.counts?.pages !== data.pages.length ||
      manifest.counts?.notebooks !== data.notebooks.length ||
      manifest.counts?.scenes !== data.contents.length ||
      inventory.size !== count
    )
      throw new Error("Archive counts do not match its content.");
    return data;
  }
  return validateBackup(manifest);
}
export async function importBackup(
  input: BackupData,
  mode: "merge" | "replace",
  repo: Persistence = repository,
) {
  const data = validateBackup(input);
  if (isDesktop) {
    await native("import_data", { data, mode });
  } else {
    const [{ importBackup: restore }, { Repository }] = await Promise.all([
      import("./legacyBackup"),
      import("./database/legacyRepository"),
    ]);
    if (!(repo instanceof Repository))
      throw new Error("This import requires the explicit web repository.");
    await restore(data, mode, repo);
  }
  storageChanged();
}
