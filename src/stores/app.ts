import { create } from "zustand";
type View = "all" | "favorites" | "recent" | "trash";
interface AppStore {
  view: View;
  collapsed: boolean;
  setView: (view: View) => void;
  toggleSidebar: () => void;
  toast: { id: number; message: string; error: boolean } | null;
  notify: (message: string, error?: boolean) => void;
}
export const useApp = create<AppStore>((set) => ({
  view: "all",
  collapsed: false,
  setView: (view) => set({ view }),
  toggleSidebar: () => set((s) => ({ collapsed: !s.collapsed })),
  toast: null,
  notify: (message, error = false) => {
    const id = Date.now();
    set({ toast: { id, message, error } });
    setTimeout(
      () => set((state) => (state.toast?.id === id ? { toast: null } : {})),
      4500,
    );
  },
}));
