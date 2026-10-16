import { native } from "./runtime";
import type {
  Persistence,
  NewPageOptions,
  InitialContent,
} from "../database/contracts";
import type {
  Notebook,
  NotePage,
  PageContent,
  AppSettings,
  BackupData,
} from "../../types";
export class NativeRepository implements Persistence {
  private revisions = new Map<string, number>();
  private metaQueue: Promise<unknown> = Promise.resolve();
  private fileCache = new Map<string, { dataURL: string; metadata: string }>();
  private call<T>(
    type: string,
    args: Record<string, unknown> = {},
  ): Promise<T> {
    return native("repository_call", { request: { type, ...args } });
  }
  async initialize() {
    await this.call("initialize");
  }
  listNotebooks() {
    return this.call<Notebook[]>("listNotebooks");
  }
  listPages(notebookId?: string) {
    return this.call<NotePage[]>("listPages", {
      notebookId: notebookId ?? null,
    });
  }
  getNotebook(id: string) {
    return this.call<Notebook | undefined>("getNotebook", { id });
  }
  getPage(id: string) {
    return this.call<NotePage | undefined>("getPage", { id });
  }
  settings() {
    return this.call<AppSettings>("settings");
  }
  async updateSettings(value: AppSettings) {
    await this.call("updateSettings", { value });
  }
  getMeta(key: string) {
    return this.call<string | undefined>("getMeta", { key });
  }
  async setMeta(key: string, value: string) {
    await this.call("setMeta", { key, value });
  }
  updateMeta(
    key: string,
    change: (value: string | undefined) => string,
  ): Promise<string> {
    const run = this.metaQueue
      .catch(() => {})
      .then(async () => {
        const expected = await this.getMeta(key);
        const value = change(expected);
        await this.call("compareMeta", {
          key,
          expected: expected ?? null,
          value,
        });
        return value;
      });
    this.metaQueue = run;
    return run;
  }
  createNotebook(title: string, color = "#d8cdeb", icon = "✿") {
    return this.call<Notebook>("createNotebook", { title, color, icon });
  }
  async updateNotebook(
    id: string,
    updates: Parameters<Persistence["updateNotebook"]>[1],
  ) {
    await this.call("updateNotebook", { id, updates });
  }
  async trashNotebook(id: string) {
    await this.call("trashNotebook", { id });
  }
  async restoreNotebook(id: string) {
    await this.call("restoreNotebook", { id });
  }
  async deleteNotebook(id: string) {
    await this.call("deleteNotebook", { id });
  }
  async createPage(
    notebookId: string,
    options: NewPageOptions = {},
    initial?: InitialContent,
  ) {
    const settings = await this.settings(),
      now = Date.now();
    const page: NotePage = {
      id: crypto.randomUUID(),
      notebookId,
      title: options.title?.trim() || "Untitled page",
      mode: options.mode ?? settings.defaultMode,
      paper: options.paper ?? settings.defaultPaper,
      size: options.size ?? "A4",
      paperColor: options.paperColor ?? settings.paperColor,
      order: 0,
      createdAt: now,
      updatedAt: now,
      lastOpenedAt: 0,
      deletedAt: null,
    };
    const content: PageContent = {
      pageId: page.id,
      elements: [],
      files: {},
      appState: {
        zoom: {
          value: settings.defaultZoom as NonNullable<
            PageContent["appState"]["zoom"]
          >["value"],
        },
      },
      initialized: false,
    };
    return this.call<NotePage>("createPage", {
      page,
      content: initial ? initial(page, content) : content,
    });
  }
  async updatePage(
    id: string,
    updates: Parameters<Persistence["updatePage"]>[1],
  ) {
    await this.call("updatePage", { id, updates });
  }
  async opened(id: string) {
    await this.call("opened", { id });
  }
  async loadContent(id: string) {
    const content = await this.call<PageContent>("loadContent", { id });
    this.revisions.set(id, content.revision ?? 0);
    this.fileCache.clear();
    for (const [fileId, file] of Object.entries(content.files))
      this.fileCache.set(`${id}:${fileId}`, {
        dataURL: file.dataURL,
        metadata: JSON.stringify({ ...file, dataURL: undefined }),
      });
    return content;
  }
  async saveContent(content: PageContent) {
    const changed = Object.fromEntries(
      Object.entries(content.files).filter(([id, file]) => {
        const previous = this.fileCache.get(`${content.pageId}:${id}`);
        return (
          previous?.dataURL !== file.dataURL ||
          previous.metadata !== JSON.stringify({ ...file, dataURL: undefined })
        );
      }),
    );
    const revision = await this.call<number>("saveContent", {
      content: { ...content, files: changed },
      fileIds: Object.keys(content.files),
      expectedRevision:
        this.revisions.get(content.pageId) ?? content.revision ?? 0,
    });
    this.revisions.set(content.pageId, revision);
    for (const [id, file] of Object.entries(content.files))
      this.fileCache.set(`${content.pageId}:${id}`, {
        dataURL: file.dataURL,
        metadata: JSON.stringify({ ...file, dataURL: undefined }),
      });
  }
  duplicatePage(id: string, targetNotebook?: string) {
    return this.call<NotePage>("duplicatePage", {
      id,
      targetNotebook: targetNotebook ?? null,
    });
  }
  duplicateNotebook(id: string) {
    return this.call<Notebook>("duplicateNotebook", { id });
  }
  async reorder(id: string, direction: -1 | 1) {
    await this.call("reorder", { id, direction });
  }
  readSnapshot() {
    return this.call<BackupData>("readSnapshot");
  }
}
