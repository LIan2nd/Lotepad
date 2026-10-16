import type { Persistence } from "./contracts";
import { isDesktop } from "../desktop/runtime";
export type { Persistence } from "./contracts";
const backend: Persistence = isDesktop
  ? new (await import("../desktop/repository")).NativeRepository()
  : new (await import("./legacyRepository")).Repository();
const listeners = new Set<() => void>();
export function storageChanged() {
  listeners.forEach((notify) => notify());
}
export function subscribeStorage(notify: () => void) {
  listeners.add(notify);
  return () => {
    listeners.delete(notify);
  };
}
const mutations = new Set([
  "createNotebook",
  "updateNotebook",
  "trashNotebook",
  "restoreNotebook",
  "deleteNotebook",
  "createPage",
  "updatePage",
  "duplicatePage",
  "duplicateNotebook",
  "reorder",
]);
export const repository: Persistence = new Proxy(backend, {
  get(target, key) {
    const value = Reflect.get(target, key);
    if (typeof value !== "function") return value;
    return async (...args: unknown[]) => {
      const result = await value.apply(target, args);
      if (mutations.has(String(key))) storageChanged();
      return result;
    };
  },
});
