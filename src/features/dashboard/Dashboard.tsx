import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { BrandMark } from "../../components/BrandMark";
import { templateThumbnail } from "../creative/templateCatalog";
import { useQuery } from "../../lib/database/useQuery";
import {
  ArrowDownAZ,
  ArrowUpRight,
  BookOpen,
  Clock3,
  Copy,
  FileText,
  FolderHeart,
  Grid2X2,
  LayoutList,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Search,
  Settings,
  Star,
  Trash2,
  Undo2,
  Pencil,
  X,
  Sparkles,
} from "lucide-react";
import { repository } from "../../lib/database/repository";
import { useApp } from "../../stores/app";
import { Select } from "../../components/Select";
import { Confirm, Menu, perform } from "../../components/ui";
import { NotebookDialog } from "../notebooks/NotebookDialog";
import type { Notebook, NotePage } from "../../types";
const emptyBooks: Notebook[] = [];
const StartCreativeDialog = lazy(
  () => import("../creative/StartCreativeDialog"),
);
export function Dashboard({
  onOpen,
  onSettings,
}: {
  onOpen: (bookId: string, pageId?: string) => Promise<void>;
  onSettings: () => void;
}) {
  const { view, setView, collapsed, toggleSidebar } = useApp();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("modified");
  const [list, setList] = useState(false);
  const [dialog, setDialog] = useState<Notebook | "new" | null>(null);
  const [deleting, setDeleting] = useState<Notebook | null>(null);
  const [creativeStart, setCreativeStart] = useState(false);
  const books = useQuery(() => repository.listNotebooks(), []) ?? emptyBooks;
  const pages = useQuery(() => repository.listPages(), []) ?? [];
  const pageCount = (bookId: string) =>
    pages.filter((p) => p.notebookId === bookId && !p.deletedAt).length;
  const search = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        e.key === "/" &&
        !(
          e.target instanceof HTMLElement &&
          e.target.closest(
            'input,textarea,select,[contenteditable],[role="combobox"],[role="listbox"]',
          )
        )
      ) {
        e.preventDefault();
        search.current?.focus();
      }
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, []);
  const active = books.filter((b) => !b.deletedAt);
  const visible = useMemo(
    () =>
      books
        .filter(
          (b) =>
            (view === "trash" ? !!b.deletedAt : !b.deletedAt) &&
            (view !== "favorites" || b.favorite) &&
            b.title.toLowerCase().includes(query.toLowerCase()),
        )
        .sort((a, b) =>
          sort === "name"
            ? a.title.localeCompare(b.title)
            : b.updatedAt - a.updatedAt,
        ),
    [books, view, query, sort],
  );
  const recent = pages
    .filter(
      (p) =>
        !p.deletedAt &&
        p.lastOpenedAt &&
        active.some((b) => b.id === p.notebookId),
    )
    .sort((a, b) => b.lastOpenedAt - a.lastOpenedAt);
  const nav = [
    {
      id: "all" as const,
      label: "All notebooks",
      icon: BookOpen,
      count: active.length,
    },
    {
      id: "favorites" as const,
      label: "Favorites",
      icon: Star,
      count: active.filter((b) => b.favorite).length,
    },
    { id: "recent" as const, label: "Recent notes", icon: Clock3 },
    { id: "trash" as const, label: "Trash", icon: Trash2 },
  ];
  function recentCard(page: NotePage) {
    const book = active.find((b) => b.id === page.notebookId)!;
    return (
      <button
        key={page.id}
        className="recent-card"
        onClick={() => void onOpen(book.id, page.id)}
      >
        <div
          className={`mini-page paper-swatch ${page.mode === "infinite" ? "blank" : page.paper}`}
        >
          <FileText size={21} />
        </div>
        <div>
          <strong>{page.title}</strong>
          <span>
            <i style={{ background: book.color }} />
            {book.title}
          </span>
          <small>{relativeDate(page.lastOpenedAt)}</small>
        </div>
        <ArrowUpRight size={17} />
      </button>
    );
  }
  return (
    <div className={`dashboard ${collapsed ? "nav-collapsed" : ""}`}>
      <aside className="navigation">
        <div className="nav-heading">
          <a
            className="brand"
            href="#"
            onClick={(e) => {
              e.preventDefault();
              setView("all");
            }}
          >
            <span className="brand-mark">
              <BrandMark />
            </span>
            {!collapsed && (
              <span>
                Lotepad<span className="brand-dot">.</span>
              </span>
            )}
          </a>
          <button
            className="sidebar-collapse icon-button"
            onClick={toggleSidebar}
            title={collapsed ? "Expand navigation" : "Collapse navigation"}
            aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
          >
            {collapsed ? (
              <PanelLeftOpen size={18} />
            ) : (
              <PanelLeftClose size={18} />
            )}
          </button>
        </div>
        <nav aria-label="Notebook navigation">
          {nav.map((item) => (
            <button
              key={item.id}
              className={`nav-item ${view === item.id ? "active" : ""}`}
              onClick={() => setView(item.id)}
              title={item.label}
              aria-current={view === item.id ? "page" : undefined}
            >
              <item.icon size={19} />
              <span>{item.label}</span>
              {item.count !== undefined && item.count > 0 && (
                <small>{item.count}</small>
              )}
            </button>
          ))}
        </nav>
        <div className="nav-bottom">
          <button className="nav-item" onClick={onSettings} title="Settings">
            <Settings size={19} />
            <span>Settings</span>
          </button>
        </div>
      </aside>
      <main className="dashboard-main">
        <div className="dashboard-content">
          <section className="welcome">
            <div>
              <h1>
                {view === "favorites"
                  ? "Favorites"
                  : view === "trash"
                    ? "Trash"
                    : view === "recent"
                      ? "Recent notes"
                      : "Notebooks"}
              </h1>
              <p className="library-summary">
                {view === "recent"
                  ? `${recent.length} recently opened`
                  : `${visible.length} ${visible.length === 1 ? "notebook" : "notebooks"}`}
              </p>
            </div>
            <button
              className="button primary create-notebook"
              onClick={() => setDialog("new")}
            >
              <Plus size={18} />
              New notebook
            </button>
          </section>
          <div className="library-tools">
            <label className="search">
              <Search size={18} />
              <input
                ref={search}
                placeholder={
                  view === "recent"
                    ? "Search recent notes…"
                    : "Find a notebook…"
                }
                aria-label="Search notebooks"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              {query ? (
                <button
                  className="icon-button"
                  aria-label="Clear search"
                  onClick={() => setQuery("")}
                >
                  <X size={15} />
                </button>
              ) : (
                <kbd>/</kbd>
              )}
            </label>
            <div className="library-tools-right">
              <Select
                label="Sort notebooks"
                compact
                icon={<ArrowDownAZ size={16} />}
                value={sort}
                onValueChange={setSort}
                options={[
                  { value: "modified", label: "Last edited" },
                  { value: "name", label: "Name A–Z" },
                ]}
              />
              <div className="view-toggle">
                <button
                  aria-label="Grid view"
                  aria-pressed={!list}
                  className={!list ? "active" : ""}
                  onClick={() => setList(false)}
                >
                  <Grid2X2 size={17} />
                </button>
                <button
                  aria-label="List view"
                  aria-pressed={list}
                  className={list ? "active" : ""}
                  onClick={() => setList(true)}
                >
                  <LayoutList size={18} />
                </button>
              </div>
            </div>
          </div>
          {view === "all" && recent.length > 0 && !query && (
            <section className="recent-section">
              <div className="section-heading">
                <h2>Recent notes</h2>
                <button
                  className="text-button"
                  onClick={() => setView("recent")}
                >
                  View all <ArrowUpRight size={14} />
                </button>
              </div>
              <div className="recent-grid">
                {recent.slice(0, 3).map(recentCard)}
              </div>
            </section>
          )}
          {view === "recent" ? (
            <section>
              <div className="section-heading">
                <h2>
                  Recently opened <span>{recent.length} NOTES</span>
                </h2>
              </div>
              <div className="recent-grid">
                {recent
                  .filter((p) =>
                    `${p.title} ${active.find((b) => b.id === p.notebookId)?.title}`
                      .toLowerCase()
                      .includes(query.toLowerCase()),
                  )
                  .map(recentCard)}
              </div>
              {!recent.length && (
                <div className="empty-state">
                  <Clock3 />
                  <h3>No recent notes</h3>
                  <p>Open a notebook and your recent pages will appear here.</p>
                  <button
                    className="button secondary"
                    onClick={() => setView("all")}
                  >
                    Browse notebooks
                  </button>
                </div>
              )}
            </section>
          ) : (
            <section className="collection">
              <div className="section-heading">
                <h2>
                  {view === "favorites"
                    ? "Starred notebooks"
                    : view === "trash"
                      ? "Deleted notebooks"
                      : "Collection"}
                </h2>
              </div>
              <div className={`notebook-grid ${list ? "list-view" : ""}`}>
                {visible.map((book) => (
                  <article className="notebook-card" key={book.id}>
                    <div className="cover-wrap">
                      <button
                        className="notebook-cover"
                        style={{ "--cover": book.color } as React.CSSProperties}
                        aria-label={`Open ${book.title}`}
                        onClick={() => !book.deletedAt && void onOpen(book.id)}
                        disabled={!!book.deletedAt}
                      >
                        <span className="cover-spine" />
                        <span className="cover-symbol">{book.icon}</span>
                        <span className="cover-title">{book.title}</span>
                        <span className="cover-rule" />
                        <span className="cover-brand">Lotepad</span>
                        <span className="book-elastic" />
                      </button>
                      <button
                        className={`favorite-button ${book.favorite ? "is-favorite" : ""}`}
                        aria-label={
                          book.favorite
                            ? `Unfavorite ${book.title}`
                            : `Favorite ${book.title}`
                        }
                        title={
                          book.favorite
                            ? "Remove from favorites"
                            : "Add to favorites"
                        }
                        onClick={() =>
                          void perform(() =>
                            repository.updateNotebook(book.id, {
                              favorite: !book.favorite,
                            }),
                          )
                        }
                      >
                        <Star
                          size={16}
                          fill={book.favorite ? "currentColor" : "none"}
                        />
                      </button>
                    </div>
                    <div className="notebook-caption">
                      <button
                        className="notebook-title"
                        onClick={() => !book.deletedAt && void onOpen(book.id)}
                        disabled={!!book.deletedAt}
                      >
                        {book.title}
                      </button>
                      <Menu
                        label={`Options for ${book.title}`}
                        items={
                          book.deletedAt
                            ? [
                                {
                                  label: "Restore notebook",
                                  icon: <Undo2 size={16} />,
                                  action: () =>
                                    void perform(
                                      () => repository.restoreNotebook(book.id),
                                      "Notebook restored",
                                    ),
                                },
                                {
                                  label: "Delete permanently",
                                  icon: <Trash2 size={16} />,
                                  danger: true,
                                  action: () => setDeleting(book),
                                },
                              ]
                            : [
                                {
                                  label: "Edit notebook",
                                  icon: <Pencil size={16} />,
                                  action: () => setDialog(book),
                                },
                                {
                                  label: "Duplicate notebook",
                                  icon: <Copy size={16} />,
                                  action: () =>
                                    void perform(
                                      () =>
                                        repository.duplicateNotebook(book.id),
                                      "Notebook duplicated",
                                    ),
                                },
                                {
                                  label: book.favorite
                                    ? "Remove favorite"
                                    : "Add to favorites",
                                  icon: <Star size={16} />,
                                  action: () =>
                                    void perform(() =>
                                      repository.updateNotebook(book.id, {
                                        favorite: !book.favorite,
                                      }),
                                    ),
                                },
                                {
                                  label: "Move to trash",
                                  icon: <Trash2 size={16} />,
                                  danger: true,
                                  action: () => setDeleting(book),
                                },
                              ]
                        }
                      />
                      <span className="notebook-meta">
                        {pageCount(book.id)}{" "}
                        {pageCount(book.id) === 1 ? "page" : "pages"}{" "}
                        <span>&middot;</span> {relativeDate(book.updatedAt)}
                      </span>
                    </div>
                  </article>
                ))}
                {view === "all" && !query && (
                  <button
                    className="new-notebook-card"
                    aria-label="Create a notebook"
                    onClick={() => setDialog("new")}
                  >
                    <span className="new-book-plus">
                      <Plus size={26} strokeWidth={1.5} />
                    </span>
                    <strong>New notebook</strong>
                  </button>
                )}
              </div>
              {visible.length === 0 && (view !== "all" || query) && (
                <div className="empty-state">
                  {view === "favorites" ? (
                    <FolderHeart />
                  ) : view === "trash" ? (
                    <Trash2 />
                  ) : (
                    <Search />
                  )}
                  <h3>
                    {query
                      ? "No notebooks found"
                      : view === "favorites"
                        ? "No favorites yet"
                        : "Trash is empty"}
                  </h3>
                  <p>
                    {query
                      ? "Try a different name."
                      : view === "favorites"
                        ? "Tap the star on a notebook to keep it close."
                        : "Your trashed notebooks will appear here."}
                  </p>
                </div>
              )}
            </section>
          )}
          {view === "all" && !query && (
            <section className="dashboard-creative">
              <div className="dashboard-template-stack" aria-hidden="true">
                <img src={templateThumbnail("creative-journal")} alt="" />
                <img src={templateThumbnail("organized-chaos")} alt="" />
              </div>
              <div>
                <span className="creative-eyebrow">
                  A DIFFERENT KIND OF PAGE
                </span>
                <h2>Make room for a little creativity.</h2>
                <p>Paper layers, photo frames, and editable layouts.</p>
              </div>
              <button
                className="button secondary"
                onClick={() => setCreativeStart(true)}
              >
                <Sparkles size={16} />
                Browse templates
              </button>
            </section>
          )}
        </div>
      </main>
      {creativeStart && (
        <Suspense fallback={null}>
          <StartCreativeDialog
            notebooks={active}
            onClose={() => setCreativeStart(false)}
            onOpen={onOpen}
          />
        </Suspense>
      )}
      {dialog && (
        <NotebookDialog
          book={dialog === "new" ? undefined : dialog}
          onClose={() => setDialog(null)}
        />
      )}
      {deleting && (
        <Confirm
          title={deleting.deletedAt ? "Delete notebook?" : "Move to trash?"}
          description={
            deleting.deletedAt
              ? `“${deleting.title}” and all its pages will be permanently deleted. This cannot be undone.`
              : `“${deleting.title}” will move to Trash. You can restore it anytime.`
          }
          label={deleting.deletedAt ? "Delete permanently" : "Move to trash"}
          onConfirm={() =>
            deleting.deletedAt
              ? repository.deleteNotebook(deleting.id)
              : repository.trashNotebook(deleting.id)
          }
          onClose={() => setDeleting(null)}
        />
      )}
    </div>
  );
}
export function relativeDate(time: number) {
  const days = Math.floor((Date.now() - time) / 86400000);
  return days === 0
    ? "Edited today"
    : days === 1
      ? "Edited yesterday"
      : `Edited ${new Date(time).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
}
