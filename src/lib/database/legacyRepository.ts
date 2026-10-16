import { db, type InkDatabase } from "./db";
import {
  covers,
  defaultSettings,
  type AppSettings,
  type Notebook,
  type NotePage,
  type PageContent,
  type PageMode,
  type PaperSize,
  type PaperType,
} from "../../types";
import type { InitialContent } from "./contracts";
export class Repository {
  constructor(public database: InkDatabase = db) {}
  async initialize() {
    await this.database.transaction("rw", this.database.tables, async () => {
      if (await this.database.meta.get("initialized")) return;
      await this.database.preferences.put({
        key: "settings",
        value: defaultSettings,
      });
      for (const [i, title] of [
        "My Journal",
        "Learning Notes",
        "Creative Ideas",
      ].entries()) {
        const book = await this.createNotebook(
          title,
          covers[i],
          ["✿", "✧", "☀"][i],
        );
        await this.createPage(book.id, {
          title: [
            "A fresh start",
            "Things I’m learning",
            "A little room to dream",
          ][i],
          paper: ["ruled", "grid", "dotted"][i] as PaperType,
        });
      }
      await this.database.meta.put({ key: "initialized", value: "1" });
    });
  }
  async listNotebooks() {
    return this.database.notebooks.toArray();
  }
  async listPages(notebookId?: string) {
    return notebookId
      ? this.database.pages
          .where("notebookId")
          .equals(notebookId)
          .sortBy("order")
      : this.database.pages.toArray();
  }
  async getNotebook(id: string) {
    return this.database.notebooks.get(id);
  }
  async getPage(id: string) {
    return this.database.pages.get(id);
  }
  async getMeta(key: string) {
    return (await this.database.meta.get(key))?.value;
  }
  async setMeta(key: string, value: string) {
    await this.database.meta.put({ key, value });
  }
  async updateMeta(key: string, change: (value: string | undefined) => string) {
    return this.database.transaction("rw", this.database.meta, async () => {
      const value = change(await this.getMeta(key));
      await this.setMeta(key, value);
      return value;
    });
  }
  async readSnapshot() {
    return this.database.transaction("r", this.database.tables, async () => ({
      app: "lotepad" as const,
      version: 1 as const,
      createdAt: Date.now(),
      notebooks: await this.listNotebooks(),
      pages: await this.listPages(),
      contents: await this.database.contents.toArray(),
      settings: await this.settings(),
      metadata: await this.database.meta.toArray(),
      preferences: await this.database.preferences.toArray(),
    }));
  }
  async settings(): Promise<AppSettings> {
    return (
      (await this.database.preferences.get("settings"))?.value ?? {
        ...defaultSettings,
      }
    );
  }
  async updateSettings(value: AppSettings) {
    await this.database.preferences.put({ key: "settings", value });
  }
  async createNotebook(title: string, color = covers[0], icon = "✿") {
    const now = Date.now();
    const book: Notebook = {
      id: crypto.randomUUID(),
      title: title.trim() || "Untitled notebook",
      color,
      icon,
      favorite: false,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
    await this.database.notebooks.add(book);
    return book;
  }
  async updateNotebook(
    id: string,
    updates: Partial<Pick<Notebook, "title" | "color" | "icon" | "favorite">>,
  ) {
    if (updates.title !== undefined && !updates.title.trim())
      throw new Error("Please give your notebook a name.");
    await this.database.notebooks.update(id, {
      ...updates,
      updatedAt: Date.now(),
    });
  }
  async trashNotebook(id: string) {
    await this.database.notebooks.update(id, { deletedAt: Date.now() });
  }
  async restoreNotebook(id: string) {
    await this.database.notebooks.update(id, {
      deletedAt: null,
      updatedAt: Date.now(),
    });
  }
  async deleteNotebook(id: string) {
    await this.database.transaction(
      "rw",
      this.database.notebooks,
      this.database.pages,
      this.database.contents,
      async () => {
        const pages = await this.database.pages
          .where("notebookId")
          .equals(id)
          .toArray();
        await this.database.contents.bulkDelete(pages.map((p) => p.id));
        await this.database.pages.bulkDelete(pages.map((p) => p.id));
        await this.database.notebooks.delete(id);
      },
    );
  }
  async createPage(
    notebookId: string,
    options: Partial<
      Pick<NotePage, "title" | "mode" | "paper" | "size" | "paperColor">
    > = {},
    initial?: InitialContent,
  ) {
    const settings = await this.settings();
    const now = Date.now();
    return this.database.transaction(
      "rw",
      this.database.notebooks,
      this.database.pages,
      this.database.contents,
      async () => {
        if (!(await this.database.notebooks.get(notebookId)))
          throw new Error("Notebook not found.");
        const siblings = await this.database.pages
          .where("notebookId")
          .equals(notebookId)
          .toArray();
        const page: NotePage = {
          id: crypto.randomUUID(),
          notebookId,
          title: options.title?.trim() || "Untitled page",
          mode: options.mode ?? settings.defaultMode,
          paper: options.paper ?? settings.defaultPaper,
          size: options.size ?? "A4",
          paperColor: options.paperColor ?? settings.paperColor,
          order: Math.max(-1, ...siblings.map((p) => p.order)) + 1,
          createdAt: now,
          updatedAt: now,
          lastOpenedAt: 0,
          deletedAt: null,
        };
        await this.database.pages.add(page);
        const content: PageContent = {
          pageId: page.id,
          elements: [],
          appState: {
            zoom: {
              value: settings.defaultZoom as NonNullable<
                PageContent["appState"]["zoom"]
              >["value"],
            },
          },
          files: {},
          initialized: false,
        };
        await this.database.contents.add(
          initial ? initial(page, content) : content,
        );
        await this.database.notebooks.update(notebookId, { updatedAt: now });
        return page;
      },
    );
  }
  async updatePage(
    id: string,
    updates: Partial<Pick<NotePage, "title" | "deletedAt" | "order">>,
  ) {
    if (updates.title !== undefined && !updates.title.trim())
      throw new Error("Please give your page a name.");
    await this.database.pages.update(id, { ...updates, updatedAt: Date.now() });
  }
  async opened(id: string) {
    await this.database.pages.update(id, { lastOpenedAt: Date.now() });
  }
  async loadContent(id: string) {
    const content = await this.database.contents.get(id);
    if (!content) throw new Error("This page could not be loaded.");
    return content;
  }
  async saveContent(content: PageContent) {
    await this.database.transaction(
      "rw",
      this.database.contents,
      this.database.pages,
      this.database.notebooks,
      async () => {
        const page = await this.database.pages.get(content.pageId);
        if (!page) throw new Error("Page no longer exists.");
        await this.database.contents.put(content);
        const now = Date.now();
        await this.database.pages.update(page.id, { updatedAt: now });
        await this.database.notebooks.update(page.notebookId, {
          updatedAt: now,
        });
      },
    );
  }
  async duplicatePage(id: string, targetNotebook?: string) {
    return this.database.transaction("rw", this.database.tables, async () => {
      const original = await this.database.pages.get(id);
      if (!original) throw new Error("Page not found.");
      const content = await this.loadContent(id);
      const page = await this.createPage(
        targetNotebook ?? original.notebookId,
        {
          ...original,
          title: targetNotebook ? original.title : `${original.title} (copy)`,
        },
      );
      await this.database.contents.put({
        ...structuredClone(content),
        pageId: page.id,
      });
      return page;
    });
  }
  async duplicateNotebook(id: string) {
    return this.database.transaction("rw", this.database.tables, async () => {
      const book = await this.database.notebooks.get(id);
      if (!book) throw new Error("Notebook not found.");
      const copy = await this.createNotebook(
        `${book.title} (copy)`,
        book.color,
        book.icon,
      );
      for (const page of (
        await this.database.pages.where("notebookId").equals(id).sortBy("order")
      ).filter((p) => !p.deletedAt))
        await this.duplicatePage(page.id, copy.id);
      return copy;
    });
  }
  async reorder(id: string, direction: -1 | 1) {
    await this.database.transaction("rw", this.database.pages, async () => {
      const page = await this.database.pages.get(id);
      if (!page) return;
      const pages = (
        await this.database.pages
          .where("notebookId")
          .equals(page.notebookId)
          .sortBy("order")
      ).filter((p) => !p.deletedAt);
      const index = pages.findIndex((p) => p.id === id);
      const other = pages[index + direction];
      if (!other) return;
      await this.database.pages.update(id, { order: other.order });
      await this.database.pages.update(other.id, { order: page.order });
    });
  }
}
export const repository = new Repository();
export type NewPageOptions = {
  title: string;
  mode: PageMode;
  paper: PaperType;
  size: PaperSize;
  paperColor: string;
};
