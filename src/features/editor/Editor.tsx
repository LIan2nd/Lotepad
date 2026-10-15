import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  ArrowLeft,
  ArrowDown,
  ArrowUp,
  BookOpen,
  Check,
  ChevronDown,
  Copy,
  Download,
  FileText,
  Focus,
  Loader2,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Plus,
  Sun,
  Trash2,
  AlertCircle,
  Settings,
} from "lucide-react";
import { db } from "../../lib/database/db";
import { repository } from "../../lib/database/repository";
import {
  Confirm,
  Menu,
  NameDialog,
  errorMessage,
  perform,
} from "../../components/ui";
import { PageDialog } from "../pages/PageDialog";
import type { Notebook, NotePage, PageContent } from "../../types";
import type { SaveStatus } from "../../lib/database/autosave";
import type { CanvasActions } from "./Canvas";
import { useApp } from "../../stores/app";
const Canvas = lazy(() =>
  import("./Canvas").then((m) => ({ default: m.Canvas })),
);
export function Editor({
  notebookId,
  pageId,
  onNavigate,
  onRegisterFlush,
  theme,
  onTheme,
  onSettings,
}: {
  notebookId: string;
  pageId?: string;
  onNavigate: (book?: string, page?: string) => Promise<void>;
  onRegisterFlush: (flush: (() => Promise<void>) | null) => void;
  theme: "light" | "dark";
  onTheme: () => void;
  onSettings: () => void;
}) {
  const book = useLiveQuery(
    async () => (await db.notebooks.get(notebookId)) ?? null,
    [notebookId],
  );
  const pages = useLiveQuery(
    () => db.pages.where("notebookId").equals(notebookId).sortBy("order"),
    [notebookId],
  );
  const [loaded, setLoaded] = useState<{
    page: NotePage;
    content: PageContent;
  } | null>(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState<SaveStatus>("saved");
  const [sidebar, setSidebar] = useState(
    () => matchMedia("(min-width: 751px)").matches,
  );
  const [focus, setFocus] = useState(false);
  const [newPage, setNewPage] = useState(false);
  const [renaming, setRenaming] = useState<NotePage | null>(null);
  const [deleting, setDeleting] = useState<NotePage | null>(null);
  const actions = useRef<CanvasActions | null>(null);
  const notify = useApp((s) => s.notify);
  const activePages = pages?.filter((p) => !p.deletedAt);
  const selectedId = pageId ?? activePages?.[0]?.id;
  useEffect(() => {
    let cancelled = false;
    if (!selectedId) {
      setLoaded(null);
      return;
    }
    setError("");
    setLoaded(null);
    void Promise.all([
      db.pages.get(selectedId),
      repository.loadContent(selectedId),
    ])
      .then(async ([page, content]) => {
        if (!page || page.deletedAt || page.notebookId !== notebookId)
          throw new Error("This page is no longer available.");
        if (!cancelled) {
          setLoaded({ page, content });
          setStatus("saved");
          await repository.opened(page.id);
        }
      })
      .catch((e) => {
        if (!cancelled) setError(errorMessage(e));
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId, notebookId]);
  const registerActions = useCallback((value: CanvasActions | null) => {
    actions.current = value;
  }, []);
  const flush = useCallback(async () => {
    await actions.current?.flush();
  }, []);
  useEffect(() => {
    onRegisterFlush(flush);
    return () => onRegisterFlush(null);
  }, [flush, onRegisterFlush]);
  async function switchPage(id: string) {
    try {
      await flush();
      await onNavigate(notebookId, id);
    } catch (e) {
      notify(errorMessage(e), true);
    }
  }
  async function removePage(page: NotePage) {
    await flush();
    await repository.updatePage(page.id, { deletedAt: Date.now() });
    if (page.id === selectedId) {
      const other = activePages?.find((p) => p.id !== page.id);
      await onNavigate(notebookId, other?.id);
    }
  }
  async function renameTitle(value: string) {
    if (!loaded || !value.trim() || value === loaded.page.title) return;
    await repository.updatePage(loaded.page.id, { title: value.trim() });
    setLoaded((s) =>
      s ? { ...s, page: { ...s.page, title: value.trim() } } : s,
    );
  }
  if (book === null || book?.deletedAt)
    return (
      <div className="fatal-state">
        <BookOpen />
        <h2>
          {book?.deletedAt
            ? "This notebook is in Trash."
            : "This notebook is no longer available."}
        </h2>
        <button className="button primary" onClick={() => void onNavigate()}>
          Back to notebooks
        </button>
      </div>
    );
  return (
    <div className={`editor ${focus ? "focus-mode" : ""}`}>
      <header className="editor-header">
        <button
          className="icon-button back-button"
          aria-label="Back to notebooks"
          title="Back to notebooks"
          onClick={() => void onNavigate()}
        >
          <ArrowLeft size={20} />
        </button>
        <div className="editor-book">
          <span
            className="editor-book-icon"
            style={{ background: book?.color }}
          >
            {book?.icon ?? <BookOpen size={18} />}
          </span>
          <span>{book?.title ?? "Opening notebook…"}</span>
          <ChevronDown size={13} />
        </div>
        <span className="editor-header-divider" />
        {loaded && (
          <input
            key={loaded.page.id + loaded.page.title}
            className="page-title-input"
            aria-label="Page title"
            defaultValue={loaded.page.title}
            maxLength={120}
            onBlur={(e) => void perform(() => renameTitle(e.target.value))}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
            }}
          />
        )}
        <div className={`save-status ${status}`} role="status">
          {status === "saving" ? (
            <Loader2 size={14} className="spin" />
          ) : status === "error" ? (
            <AlertCircle size={14} />
          ) : (
            <Check size={14} />
          )}
          <span>
            {status === "saving"
              ? "Saving…"
              : status === "error"
                ? "Save failed"
                : "All changes saved"}
          </span>
          {status === "error" && (
            <button className="text-button" onClick={() => void perform(flush)}>
              Retry
            </button>
          )}
        </div>
        <div className="editor-header-actions">
          <div className="export-control">
            <Download size={16} />
            <select
              aria-label="Export page"
              value=""
              disabled={!loaded}
              onChange={(e) => {
                const format = e.target.value as "png" | "svg" | "json";
                void perform(async () => {
                  if (!actions.current)
                    throw new Error("The editor is still loading.");
                  await actions.current.export(format);
                }, "Your export is ready");
              }}
            >
              <option value="" disabled>
                Export
              </option>
              <option value="png">PNG image</option>
              <option value="svg">SVG image</option>
              <option value="json">Editable Excalidraw</option>
            </select>
            <ChevronDown size={12} />
          </div>
          <button
            className="icon-button"
            title="Toggle theme"
            aria-label="Toggle theme"
            onClick={onTheme}
          >
            {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
          </button>
          <button
            className={`icon-button ${focus ? "active" : ""}`}
            title="Distraction-free mode"
            aria-label="Distraction-free mode"
            aria-pressed={focus}
            onClick={() => setFocus(!focus)}
          >
            <Focus size={19} />
          </button>
          <button
            className="icon-button"
            aria-label="Settings"
            title="Settings"
            onClick={() =>
              void perform(async () => {
                await flush();
                onSettings();
              })
            }
          >
            <Settings size={18} />
          </button>
        </div>
      </header>
      <div className="editor-body">
        {sidebar && !focus && (
          <aside className="page-sidebar">
            <div className="page-sidebar-heading">
              <span>NOTEBOOK PAGES</span>
              <button
                className="icon-button"
                aria-label="Collapse page sidebar"
                title="Collapse page sidebar"
                onClick={() => setSidebar(false)}
              >
                <PanelLeftClose size={17} />
              </button>
            </div>
            <button
              className="button new-page-button"
              onClick={() => setNewPage(true)}
            >
              <Plus size={17} />
              New page
            </button>
            <div className="pages-list">
              {activePages?.map((page, i) => (
                <div
                  className={`page-row ${selectedId === page.id ? "active" : ""}`}
                  key={page.id}
                >
                  <button
                    className="page-select"
                    onClick={() => void switchPage(page.id)}
                  >
                    <span
                      className={`page-preview paper-swatch ${page.mode === "infinite" ? "blank" : page.paper}`}
                    >
                      <FileText size={17} />
                    </span>
                    <span>
                      <strong>{page.title}</strong>
                      <small>
                        {String(i + 1).padStart(2, "0")} <span>·</span>{" "}
                        {page.mode === "infinite"
                          ? "Whiteboard"
                          : `${page.size} ${page.paper}`}
                      </small>
                    </span>
                  </button>
                  <Menu
                    label={`Options for page ${page.title}`}
                    items={[
                      {
                        label: "Rename page",
                        icon: <Pencil size={15} />,
                        action: () => setRenaming(page),
                      },
                      {
                        label: "Duplicate page",
                        icon: <Copy size={15} />,
                        action: () =>
                          void perform(async () => {
                            await flush();
                            const copy = await repository.duplicatePage(
                              page.id,
                            );
                            await switchPage(copy.id);
                          }),
                      },
                      {
                        label: "Move up",
                        icon: <ArrowUp size={15} />,
                        disabled: i === 0,
                        action: () =>
                          void perform(() => repository.reorder(page.id, -1)),
                      },
                      {
                        label: "Move down",
                        icon: <ArrowDown size={15} />,
                        disabled: i === activePages.length - 1,
                        action: () =>
                          void perform(() => repository.reorder(page.id, 1)),
                      },
                      {
                        label: "Delete page",
                        icon: <Trash2 size={15} />,
                        danger: true,
                        action: () => setDeleting(page),
                      },
                    ]}
                  />
                </div>
              ))}
            </div>
          </aside>
        )}
        <main className="editor-workspace">
          {(!sidebar || focus) && (
            <button
              className="icon-button show-page-sidebar"
              aria-label="Show page sidebar"
              title="Show page sidebar"
              onClick={() => {
                setSidebar(true);
                setFocus(false);
              }}
            >
              <PanelLeftOpen size={18} />
            </button>
          )}
          {error ? (
            <div className="empty-state">
              <AlertCircle />
              <h3>We couldn’t open this page</h3>
              <p>{error}</p>
              <button
                className="button secondary"
                onClick={() => setNewPage(true)}
              >
                Create a page
              </button>
            </div>
          ) : loaded ? (
            <Suspense
              fallback={
                <div className="canvas-loading">
                  <Loader2 className="spin" />
                  <span>Opening canvas…</span>
                </div>
              }
            >
              <Canvas
                key={loaded.page.id}
                page={loaded.page}
                content={loaded.content}
                theme={theme}
                onStatus={setStatus}
                onActions={registerActions}
              />
            </Suspense>
          ) : activePages?.length === 0 ? (
            <div className="empty-state">
              <FileText />
              <h3>No pages yet</h3>
              <p>Add a page to start writing or drawing.</p>
              <button
                className="button primary"
                onClick={() => setNewPage(true)}
              >
                <Plus size={17} />
                Create a page
              </button>
            </div>
          ) : (
            <div className="canvas-loading">
              <Loader2 className="spin" />
              <span>Opening page…</span>
            </div>
          )}
        </main>
      </div>
      {newPage && (
        <PageDialog
          notebookId={notebookId}
          onClose={() => setNewPage(false)}
          onCreated={async (page) => {
            await switchPage(page.id);
          }}
        />
      )}
      {renaming && (
        <NameDialog
          title="Rename page"
          initial={renaming.title}
          onSave={async (value) => {
            await repository.updatePage(renaming.id, { title: value });
            if (loaded?.page.id === renaming.id)
              setLoaded((s) =>
                s ? { ...s, page: { ...s.page, title: value } } : s,
              );
          }}
          onClose={() => setRenaming(null)}
        />
      )}
      {deleting && (
        <Confirm
          title="Delete this page?"
          description={`“${deleting.title}” will be removed from this notebook. It remains included in complete backups until the notebook is permanently deleted.`}
          onConfirm={() => removePage(deleting)}
          onClose={() => setDeleting(null)}
        />
      )}
    </div>
  );
}
export type { Notebook };
