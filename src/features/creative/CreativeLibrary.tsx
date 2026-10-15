import { useMemo, useState } from "react";
import {
  Search,
  Star,
  Clock3,
  Shapes,
  Flower2,
  Sticker,
  StickyNote,
  Frame,
  PencilLine,
  Tag,
  Sparkles,
  Palette as PaletteIcon,
  LayoutTemplate,
  Type,
  X,
  ChevronRight,
} from "lucide-react";
import { assets, assetPreview } from "./registry";
import { PaletteStudio } from "./PaletteStudio";
import { TemplateChoices } from "./TemplateChoices";
import type {
  CreativeAsset,
  CreativeCategory,
  CreativePreferences,
  Palette,
  TemplateId,
} from "./types";
const categories = [
  { id: "stickers", name: "Stickers", icon: Sticker },
  { id: "tapes", name: "Washi tapes", icon: Shapes },
  { id: "papers", name: "Paper pieces", icon: Flower2 },
  { id: "notes", name: "Sticky notes", icon: StickyNote },
  { id: "frames", name: "Photo frames", icon: Frame },
  { id: "doodles", name: "Doodles", icon: PencilLine },
  { id: "labels", name: "Labels & tags", icon: Tag },
  { id: "decorations", name: "Decorations", icon: Sparkles },
  { id: "text", name: "Typography", icon: Type },
  { id: "palettes", name: "Color palettes", icon: PaletteIcon },
  { id: "templates", name: "Templates", icon: LayoutTemplate },
] as const;
export function CreativeLibrary({
  category,
  onCategory,
  palette,
  color,
  onColor,
  preferences,
  onFavorite,
  onInsert,
  onUsePalette,
  onCreatePalette,
  onTemplate,
  onClose,
  canFillFrame,
  onFillFrame,
}: {
  category: CreativeCategory;
  onCategory: (category: CreativeCategory) => void;
  palette: Palette;
  color: string;
  onColor: (color: string) => void;
  preferences: CreativePreferences;
  onFavorite: (id: string) => void;
  onInsert: (asset: CreativeAsset) => void;
  onUsePalette: (palette: Palette) => Promise<void>;
  onCreatePalette: (palette: Palette) => Promise<void>;
  onTemplate: (id: TemplateId) => void;
  onClose: () => void;
  canFillFrame: boolean;
  onFillFrame: () => void;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "favorites" | "recent">("all");
  const [tag, setTag] = useState("All");
  const title = categories.find((c) => c.id === category)?.name;
  const visible = useMemo(() => {
    let list = assets.filter((a) =>
      filter === "favorites"
        ? preferences.favorites.includes(a.id)
        : filter === "recent"
          ? preferences.recent.includes(a.id)
          : query
            ? true
            : a.category === category,
    );
    if (query)
      list = list.filter((a) =>
        `${a.name} ${a.tags.join(" ")}`
          .toLowerCase()
          .includes(query.toLowerCase()),
      );
    if (tag !== "All" && filter === "all" && !query && category === "stickers")
      list = list.filter((a) => a.tags.includes(tag));
    if (filter === "recent")
      list.sort(
        (a, b) =>
          preferences.recent.indexOf(a.id) - preferences.recent.indexOf(b.id),
      );
    return list;
  }, [category, filter, preferences.favorites, preferences.recent, query, tag]);
  function chooseCategory(value: CreativeCategory) {
    onCategory(value);
    setQuery("");
    setFilter("all");
    setTag("All");
  }
  return (
    <aside className="creative-library" aria-label="Creative Library">
      <div className="creative-library-heading">
        <div>
          <span className="creative-eyebrow">THE STUDIO</span>
          <h2>
            Creative Library<span>✦</span>
          </h2>
        </div>
        <button
          className="icon-button"
          onClick={onClose}
          title="Close Creative Library"
          aria-label="Close Creative Library"
        >
          <X size={18} />
        </button>
      </div>
      <div className="creative-library-layout">
        <nav
          className="creative-category-rail"
          aria-label="Creative categories"
        >
          {categories.map((c) => (
            <button
              key={c.id}
              title={c.name}
              aria-label={c.name}
              aria-pressed={category === c.id && filter === "all"}
              className={category === c.id && filter === "all" ? "active" : ""}
              onClick={() => chooseCategory(c.id)}
            >
              <c.icon size={19} />
            </button>
          ))}
        </nav>
        <div className="creative-library-main">
          <label className="creative-search">
            <Search size={15} />
            <input
              placeholder="Find a little something…"
              aria-label="Search creative assets"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {query && (
              <button
                aria-label="Clear asset search"
                onClick={() => setQuery("")}
              >
                <X size={14} />
              </button>
            )}
          </label>
          <div className="creative-filter-tabs">
            <button
              className={filter === "all" ? "active" : ""}
              onClick={() => setFilter("all")}
            >
              Browse
            </button>
            <button
              className={filter === "favorites" ? "active" : ""}
              onClick={() => setFilter("favorites")}
            >
              <Star size={12} />
              Saved
            </button>
            <button
              className={filter === "recent" ? "active" : ""}
              onClick={() => setFilter("recent")}
            >
              <Clock3 size={12} />
              Recent
            </button>
          </div>
          <div className="creative-scroll">
            <div className="creative-section-title">
              <h3>
                {filter === "favorites"
                  ? "Favorites"
                  : filter === "recent"
                    ? "Recently used"
                    : query
                      ? "Search results"
                      : title}
              </h3>
              {filter === "all" &&
                !["palettes", "templates"].includes(category) && (
                  <label className="insert-color" title="Color for new inserts">
                    <input
                      type="color"
                      value={color}
                      onChange={(e) => onColor(e.target.value)}
                      aria-label="Insert color"
                    />
                    <span>Color</span>
                  </label>
                )}
            </div>
            {category === "palettes" && filter === "all" && !query ? (
              <PaletteStudio
                preferences={preferences}
                onUse={onUsePalette}
                onCreate={onCreatePalette}
                onColor={onColor}
              />
            ) : category === "templates" && filter === "all" && !query ? (
              <>
                <p className="creative-help">
                  A starting point, with room to make it your own.
                </p>
                <TemplateChoices onSelect={onTemplate} preview />
              </>
            ) : (
              <>
                {category === "stickers" && filter === "all" && !query && (
                  <div className="sticker-tags">
                    {[
                      "All",
                      "Stars",
                      "Nature",
                      "Stationery",
                      "Doodles",
                      "Productivity",
                      "Tech",
                    ].map((t) => (
                      <button
                        key={t}
                        className={tag === t ? "active" : ""}
                        onClick={() => setTag(t)}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                )}
                {category === "frames" && filter === "all" && !query && (
                  <>
                    <p className="creative-help">
                      Choose a frame, then add a photo. Captions stay editable.
                    </p>
                    <button
                      className="button secondary fill-frame-button"
                      disabled={!canFillFrame}
                      onClick={onFillFrame}
                    >
                      Fill selected photo frame
                    </button>
                  </>
                )}
                {category === "text" && filter === "all" && !query && (
                  <p className="creative-help">
                    Editable text, using the editor’s bundled fonts.
                  </p>
                )}
                {category === "notes" && filter === "all" && !query && (
                  <p className="creative-help">
                    Select a card and press Enter to edit its text. The card and
                    text move together.
                  </p>
                )}
                <div className="creative-asset-grid">
                  {visible.map((asset) => (
                    <article
                      key={asset.id}
                      className={`creative-asset ${asset.kind === "svg" ? "asset-svg" : ""}`}
                    >
                      <button
                        className="asset-insert"
                        aria-label={
                          asset.kind === "frame"
                            ? `Add photo: ${asset.name}`
                            : `Insert ${asset.name}`
                        }
                        title={
                          asset.kind === "frame"
                            ? "Choose a photo"
                            : "Tap to insert"
                        }
                        onClick={() => onInsert(asset)}
                      >
                        <span className="asset-art">
                          <img
                            src={assetPreview(
                              asset,
                              palette,
                              asset.category === "papers" ? undefined : color,
                            )}
                            alt=""
                            loading="lazy"
                          />
                        </span>
                        <span>{asset.name}</span>
                      </button>
                      <button
                        className={`asset-favorite ${preferences.favorites.includes(asset.id) ? "active" : ""}`}
                        aria-label={`${preferences.favorites.includes(asset.id) ? "Unfavorite" : "Favorite"} ${asset.name}`}
                        onClick={() => onFavorite(asset.id)}
                      >
                        <Star
                          size={13}
                          fill={
                            preferences.favorites.includes(asset.id)
                              ? "currentColor"
                              : "none"
                          }
                        />
                      </button>
                    </article>
                  ))}
                </div>
                {!visible.length && (
                  <div className="creative-empty">
                    <Shapes size={27} />
                    <strong>
                      {filter === "favorites"
                        ? "Save the little things you love"
                        : filter === "recent"
                          ? "Nothing here yet"
                          : "Nothing found"}
                    </strong>
                    <p>
                      {filter === "favorites"
                        ? "Star an item to find it here."
                        : filter === "recent"
                          ? "Inserted items will appear here."
                          : "Try another word or category."}
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
          <button
            className="active-palette-strip"
            onClick={() => chooseCategory("palettes")}
            title="Change palette"
          >
            <span className="palette-strip-dots">
              {palette.colors.slice(0, 4).map((c, i) => (
                <i key={i} style={{ background: c }} />
              ))}
            </span>
            <span>
              {palette.name}
              <small>For new inserts</small>
            </span>
            <ChevronRight size={14} />
          </button>
        </div>
      </div>
    </aside>
  );
}
