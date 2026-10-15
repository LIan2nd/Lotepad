import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { AppState, BinaryFiles } from "@excalidraw/excalidraw/types";
export type PaperType = "blank" | "ruled" | "grid" | "dotted";
export type PaperSize = "A4" | "A4 landscape" | "A5" | "Letter";
export type PageMode = "paper" | "infinite";
export interface Notebook {
  id: string;
  title: string;
  color: string;
  icon: string;
  favorite: boolean;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
}
export interface NotePage {
  id: string;
  notebookId: string;
  title: string;
  mode: PageMode;
  paper: PaperType;
  size: PaperSize;
  paperColor: string;
  order: number;
  createdAt: number;
  updatedAt: number;
  lastOpenedAt: number;
  deletedAt: number | null;
}
export interface PageContent {
  pageId: string;
  elements: readonly ExcalidrawElement[];
  appState: Partial<AppState>;
  files: BinaryFiles;
  initialized: boolean;
}
export interface AppSettings {
  theme: "light" | "dark" | "system";
  defaultMode: PageMode;
  defaultPaper: PaperType;
  paperColor: string;
  defaultZoom: number;
}
export interface BackupData {
  app: "lotepad";
  version: 1;
  createdAt: number;
  notebooks: Notebook[];
  pages: NotePage[];
  contents: PageContent[];
  settings: AppSettings;
}
export const defaultSettings: AppSettings = {
  theme: "system",
  defaultMode: "paper",
  defaultPaper: "dotted",
  paperColor: "#fffdf8",
  defaultZoom: 0.7,
};
export const covers = [
  "#d8cdeb",
  "#c5d8cc",
  "#e9c8b8",
  "#c6d9e8",
  "#e6d9b8",
  "#d3cfe0",
];
