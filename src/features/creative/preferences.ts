import type { Repository } from "../../lib/database/repository";
import { repository } from "../../lib/database/repository";
import { defaultCreativePreferences, type CreativePreferences } from "./types";
import { validateCreativePreferences } from "./palettes";
const key = "creative-library-v1";
export async function readCreativePreferences(
  repo: Repository = repository,
): Promise<CreativePreferences> {
  const row = await repo.database.meta.get(key);
  return row
    ? validateCreativePreferences(JSON.parse(row.value) as unknown)
    : structuredClone(defaultCreativePreferences);
}
export async function saveCreativePreferences(
  value: CreativePreferences,
  repo: Repository = repository,
) {
  await repo.database.meta.put({
    key,
    value: JSON.stringify(validateCreativePreferences(value)),
  });
}
/** Atomic read/modify/write so quick taps never lose a favorite or recent item. */
export async function updateCreativePreferences(
  change: (current: CreativePreferences) => CreativePreferences,
  repo: Repository = repository,
) {
  return repo.database.transaction("rw", repo.database.meta, async () => {
    const next = change(await readCreativePreferences(repo));
    await saveCreativePreferences(next, repo);
    return next;
  });
}
