import type { PageContent } from "../../types";
export type SaveStatus = "saved" | "unsaved" | "saving" | "error";
/** One queue per mounted page. Pending data is retained if a write fails. */
export class Autosave {
  private pending: PageContent | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private queue: Promise<void> = Promise.resolve();
  private writing = false;
  private maximumTimer: ReturnType<typeof setTimeout> | undefined;
  constructor(
    private write: (content: PageContent) => Promise<void>,
    private status: (status: SaveStatus) => void,
    private delay = 600,
    private maximumWait = 5000,
  ) {}
  schedule(content: PageContent) {
    this.pending = content;
    this.status(this.writing ? "saving" : "unsaved");
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      void this.flush().catch(() => {});
    }, this.delay);
    this.maximumTimer ??= setTimeout(() => {
      void this.flush().catch(() => {});
    }, this.maximumWait);
  }
  flush(): Promise<void> {
    clearTimeout(this.timer);
    clearTimeout(this.maximumTimer);
    this.maximumTimer = undefined;
    const run = async () => {
      while (this.pending) {
        const snapshot = this.pending;
        this.pending = null;
        this.writing = true;
        this.status("saving");
        try {
          await this.write(snapshot);
        } catch (error) {
          if (!this.pending) this.pending = snapshot;
          this.status("error");
          throw error;
        } finally {
          this.writing = false;
        }
      }
      this.status("saved");
    };
    this.queue = this.queue.catch(() => {}).then(run);
    return this.queue;
  }
  get dirty() {
    return this.pending !== null || this.writing;
  }
  dispose() {
    clearTimeout(this.timer);
    clearTimeout(this.maximumTimer);
  }
}
