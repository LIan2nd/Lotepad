import type { Persistence } from "../../lib/database/contracts";
import { repository } from "../../lib/database/repository";
import { defaultCreativePreferences, type CreativePreferences } from "./types";
import { validateCreativePreferences } from "./palettes";
const key = "creative-library-v1";
export async function readCreativePreferences(
  repo: Persistence = repository,
): Promise<CreativePreferences> {
  const row = await repo.getMeta(key);
  return row
    ? validateCreativePreferences(JSON.parse(row) as unknown)
    : structuredClone(defaultCreativePreferences);
}
export async function saveCreativePreferences(
  value: CreativePreferences,
  repo: Persistence = repository,
) {
  await repo.setMeta(key, JSON.stringify(validateCreativePreferences(value)));
}
/** Atomic read/modify/write so quick taps never lose a favorite or recent item. */
export async function updateCreativePreferences(
  change: (current: CreativePreferences) => CreativePreferences,
  repo: Persistence = repository,
) {
  const value = await repo.updateMeta(key, (stored) =>
    JSON.stringify(
      validateCreativePreferences(
        change(
          stored
            ? validateCreativePreferences(JSON.parse(stored) as unknown)
            : structuredClone(defaultCreativePreferences),
        ),
      ),
    ),
  );
  return validateCreativePreferences(JSON.parse(value) as unknown);
}
