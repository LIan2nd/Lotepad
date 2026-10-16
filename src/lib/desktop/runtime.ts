import { invoke, isTauri } from "@tauri-apps/api/core";
export const isDesktop = import.meta.env.MODE === "desktop";
export const hasNativeBridge = () => isTauri();
export async function native<T>(
  command: string,
  args?: Record<string, unknown>,
): Promise<T> {
  if (!isDesktop || !isTauri())
    throw new Error(
      "The desktop SQLite bridge is unavailable. Open Lotepad Desktop; no browser fallback was created.",
    );
  try {
    return await invoke<T>(command, args);
  } catch (error) {
    throw new Error(typeof error === "string" ? error : String(error));
  }
}
