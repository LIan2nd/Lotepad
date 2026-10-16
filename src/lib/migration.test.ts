import "fake-indexeddb/auto";
import { describe, it, expect, afterEach, vi } from "vitest";
import JSZip from "jszip";
import { InkDatabase } from "./database/db";
import { Repository } from "./database/legacyRepository";
import { exportMigration, readBackup } from "./backup";
import { Autosave } from "./database/autosave";
const databases: InkDatabase[] = [];
afterEach(async () => {
  vi.useRealTimers();
  for (const database of databases.splice(0)) await database.delete();
});
describe("portable desktop migration bridge", () => {
  it("exports every original table without changing browser data and detects tampered checksums", async () => {
    const db = new InkDatabase(`migration-${crypto.randomUUID()}`);
    databases.push(db);
    const repo = new Repository(db);
    await repo.initialize();
    await repo.setMeta("lastRoute", "notebook=example");
    await repo.setMeta("unknown-record", "Keep this exactly");
    const before = await repo.readSnapshot(),
      archive = await exportMigration(repo),
      data = await readBackup(archive),
      after = await repo.readSnapshot();
    expect(data.metadata).toEqual(before.metadata);
    expect(data.preferences).toEqual(before.preferences);
    expect({ ...after, createdAt: before.createdAt }).toEqual(before);
    const zip = await JSZip.loadAsync(await archive.arrayBuffer());
    zip.file("data.json", JSON.stringify({ ...data, notebooks: [] }));
    await expect(
      readBackup(await zip.generateAsync({ type: "arraybuffer" })),
    ).rejects.toThrow("checksum");
  });
  it("saves during continuous drawing after the maximum wait instead of postponing indefinitely", async () => {
    vi.useFakeTimers();
    const saved: string[] = [];
    const queue = new Autosave(
      async (content) => {
        saved.push(content.pageId);
      },
      () => {},
      600,
      2000,
    );
    for (let i = 0; i < 9; i++) {
      queue.schedule({
        pageId: "continuous-page",
        elements: [],
        appState: {},
        files: {},
        initialized: true,
      });
      await vi.advanceTimersByTimeAsync(250);
    }
    expect(saved).toContain("continuous-page");
    await queue.flush();
    queue.dispose();
  });
});
