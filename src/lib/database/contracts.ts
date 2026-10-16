import type {
  AppSettings,
  BackupData,
  Notebook,
  NotePage,
  PageContent,
} from "../../types";
export type NewPageOptions = Partial<
  Pick<NotePage, "title" | "mode" | "paper" | "size" | "paperColor">
>;
export type InitialContent = (
  page: NotePage,
  content: PageContent,
) => PageContent;
export interface Persistence {
  initialize(): Promise<void>;
  listNotebooks(): Promise<Notebook[]>;
  listPages(notebookId?: string): Promise<NotePage[]>;
  getNotebook(id: string): Promise<Notebook | undefined>;
  getPage(id: string): Promise<NotePage | undefined>;
  settings(): Promise<AppSettings>;
  updateSettings(value: AppSettings): Promise<void>;
  getMeta(key: string): Promise<string | undefined>;
  setMeta(key: string, value: string): Promise<void>;
  updateMeta(
    key: string,
    change: (value: string | undefined) => string,
  ): Promise<string>;
  createNotebook(
    title: string,
    color?: string,
    icon?: string,
  ): Promise<Notebook>;
  updateNotebook(
    id: string,
    updates: Partial<Pick<Notebook, "title" | "color" | "icon" | "favorite">>,
  ): Promise<void>;
  trashNotebook(id: string): Promise<void>;
  restoreNotebook(id: string): Promise<void>;
  deleteNotebook(id: string): Promise<void>;
  createPage(
    notebookId: string,
    options?: NewPageOptions,
    initial?: InitialContent,
  ): Promise<NotePage>;
  updatePage(
    id: string,
    updates: Partial<Pick<NotePage, "title" | "deletedAt" | "order">>,
  ): Promise<void>;
  opened(id: string): Promise<void>;
  loadContent(id: string): Promise<PageContent>;
  saveContent(content: PageContent): Promise<void>;
  duplicatePage(id: string, targetNotebook?: string): Promise<NotePage>;
  duplicateNotebook(id: string): Promise<Notebook>;
  reorder(id: string, direction: -1 | 1): Promise<void>;
  readSnapshot(): Promise<BackupData>;
}
