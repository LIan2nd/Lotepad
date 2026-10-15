import Dexie, { type EntityTable } from "dexie";
import type { Notebook, NotePage, PageContent, AppSettings } from "../../types";
export class InkDatabase extends Dexie {
  notebooks!: EntityTable<Notebook, "id">;
  pages!: EntityTable<NotePage, "id">;
  contents!: EntityTable<PageContent, "pageId">;
  preferences!: EntityTable<{ key: string; value: AppSettings }, "key">;
  meta!: EntityTable<{ key: string; value: string }, "key">;
  // Keep the original database name so rebranding never hides existing notes.
  constructor(name = "inknest") {
    super(name);
    this.version(1).stores({
      notebooks: "id,updatedAt,deletedAt",
      pages: "id,notebookId,order,updatedAt,lastOpenedAt,deletedAt",
      contents: "pageId",
      preferences: "key",
      meta: "key",
    });
  }
}
export const db = new InkDatabase();
