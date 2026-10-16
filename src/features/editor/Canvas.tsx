import { useEffect, useMemo, useRef, useState } from "react";
import {
  Excalidraw,
  MainMenu,
  WelcomeScreen,
  exportToBlob,
  exportToSvg,
  serializeAsJSON,
  getSceneVersion,
} from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import type {
  ExcalidrawImperativeAPI,
  ExcalidrawProps,
} from "@excalidraw/excalidraw/types";
import { Scan } from "lucide-react";
import { CreativeLibrary } from "../creative/CreativeLibrary";
import { CompositionDialog } from "../creative/CompositionDialog";
import { SelectionTools } from "../creative/SelectionTools";
import { buildAsset, isPaper } from "../creative/composer";
import {
  arrange,
  insertScene,
  readPhoto,
  recolorSelection,
  selectedElements,
  findPhotoSlot,
  fillPhotoSlot,
} from "../creative/editorAdapter";
import { getPalette } from "../creative/palettes";
import {
  readCreativePreferences,
  updateCreativePreferences,
} from "../creative/preferences";
import {
  defaultCreativePreferences,
  type CreativeAsset,
  type CreativeCategory,
  type CreativeMode,
  type CreativePreferences,
  type TemplateId,
} from "../creative/types";
import { templateForPaper } from "../creative/templates";
import { paperDimensions } from "../../lib/excalidraw/adapter";
import { repository } from "../../lib/database/repository";
import { Autosave, type SaveStatus } from "../../lib/database/autosave";
import { initializePaper, persistentState } from "../../lib/excalidraw/adapter";
import { download } from "../../lib/backup";
import { errorMessage, perform } from "../../components/ui";
import { useApp } from "../../stores/app";
import type { NotePage, PageContent } from "../../types";
export interface CanvasActions {
  flush: () => Promise<void>;
  export: (format: "png" | "svg" | "json") => Promise<boolean>;
  openLibrary: (category?: CreativeCategory) => void;
  inspire: () => void;
}
export function Canvas({
  page,
  content,
  theme,
  onStatus,
  onActions,
  mode,
  onModeChange,
}: {
  page: NotePage;
  content: PageContent;
  theme: "light" | "dark";
  onStatus: (s: SaveStatus) => void;
  onActions: (actions: CanvasActions | null) => void;
  mode: CreativeMode;
  onModeChange: (mode: CreativeMode) => void;
}) {
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);
  const notify = useApp((s) => s.notify);
  const [initial] = useState(() => initializePaper(page, content));
  const [category, setCategory] = useState<CreativeCategory>("stickers");
  const [preferences, setPreferences] = useState<CreativePreferences>(
    defaultCreativePreferences,
  );
  const [color, setColor] = useState("#c9b5e4");
  const [composition, setComposition] = useState<TemplateId | "inspire" | null>(
    null,
  );
  const [selectionCount, setSelectionCount] = useState(0);
  const [canFillFrame, setCanFillFrame] = useState(false);
  const selectionSignature = useRef("");
  const insertOffset = useRef(0);
  const upload = useRef<HTMLInputElement>(null);
  const pendingFrame = useRef<CreativeAsset | null>(null);
  const pendingSlot = useRef<string | null>(null);
  const palette = getPalette(preferences);
  useEffect(() => {
    let active = true;
    void readCreativePreferences()
      .then((p) => {
        if (active) {
          setPreferences(p);
          setColor(getPalette(p).accent);
        }
      })
      .catch((e) => notify(errorMessage(e), true));
    return () => {
      active = false;
    };
  }, [notify]);
  async function changePreferences(
    change: (current: CreativePreferences) => CreativePreferences,
  ) {
    const next = await updateCreativePreferences(change);
    setPreferences(next);
  }
  function insertAsset(asset: CreativeAsset) {
    if (!api) return;
    if (asset.kind === "frame") {
      pendingFrame.current = asset;
      pendingSlot.current = null;
      upload.current?.click();
      return;
    }
    void perform(async () => {
      const scene = buildAsset(
        asset,
        palette,
        asset.category === "papers" ? undefined : color,
      );
      insertScene(api!, scene, "center", (insertOffset.current++ % 5) * 15);
      await changePreferences((p) => ({
        ...p,
        recent: [asset.id, ...p.recent.filter((id) => id !== asset.id)].slice(
          0,
          30,
        ),
      }));
    }, `${asset.name} added`);
  }
  const autosave = useMemo(
    () => new Autosave((c) => repository.saveContent(c), onStatus),
    [onStatus],
  );
  const signature = useRef("");
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    const visible = () => {
      if (document.visibilityState === "hidden")
        void autosave.flush().catch((e) => notify(errorMessage(e), true));
    };
    const unload = (e: BeforeUnloadEvent) => {
      if (autosave.dirty) {
        void autosave.flush().catch(() => {});
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", unload);
    document.addEventListener("visibilitychange", visible);
    return () => {
      mounted.current = false;
      window.removeEventListener("beforeunload", unload);
      document.removeEventListener("visibilitychange", visible);
      void autosave.flush().catch((e) => notify(errorMessage(e), true));
      autosave.dispose();
    };
  }, [autosave, notify]);
  useEffect(() => {
    if (!api) return;
    onActions({
      flush: () => autosave.flush(),
      openLibrary: (next = "stickers") => {
        setCategory(next);
        onModeChange("create");
      },
      inspire: () => setComposition("inspire"),
      export: async (format) => {
        try {
          await autosave.flush();
        } catch (error) {
          if (format !== "json") throw error;
          notify(
            "Exporting the pending scene. Database saving still needs attention.",
            true,
          );
        }
        const elements = api.getSceneElements();
        const files = api.getFiles();
        const appState = {
          ...persistentState(api.getAppState()),
          exportWithDarkMode: false,
          exportBackground: true,
        };
        const name = page.title.replace(/[<>:"/\\|?*]/g, "_");
        if (format === "json") {
          return download(
            new Blob([serializeAsJSON(elements, appState, files, "local")], {
              type: "application/json",
            }),
            `${name}.excalidraw`,
          );
        }
        if (!elements.length)
          throw new Error("Add something to your page before exporting.");
        if (format === "svg") {
          const svg = await exportToSvg({
            elements,
            files,
            appState,
            exportPadding: 20,
          });
          return download(
            new Blob([svg.outerHTML], { type: "image/svg+xml" }),
            `${name}.svg`,
          );
        } else {
          const blob = await exportToBlob({
            elements,
            files,
            appState,
            maxWidthOrHeight: 4096,
            exportPadding: 20,
          });
          if (!blob) throw new Error("Image export failed.");
          return download(blob, `${name}.png`);
        }
      },
    });
    return () => onActions(null);
  }, [api, autosave, onActions, page.title, onModeChange, notify]);
  const onChange: ExcalidrawProps["onChange"] = (elements, state, files) => {
    const selection = Object.keys(state.selectedElementIds)
      .filter((id) => state.selectedElementIds[id])
      .join(",");
    if (selection !== selectionSignature.current) {
      selectionSignature.current = selection;
      setSelectionCount(api ? selectedElements(api).length : 0);
      setCanFillFrame(api ? !!findPhotoSlot(api) : false);
    }
    const next = `${getSceneVersion(elements)}:${Object.keys(files).length}:${state.zoom.value}:${state.scrollX}:${state.scrollY}:${state.currentItemStrokeColor}:${state.currentItemStrokeWidth}:${state.currentItemOpacity}`;
    if (next === signature.current) return;
    signature.current = next;
    autosave.schedule({
      pageId: page.id,
      elements,
      appState: persistentState(state),
      files,
      initialized: true,
    });
  };
  return (
    <div className={`studio-workspace studio-${mode}`}>
      <div className="canvas-stage">
        <div className="canvas-container" data-testid="canvas-container">
          <Excalidraw
            initialData={{
              elements: initial.elements,
              appState: {
                ...initial.appState,
                ...persistentState(initial.appState),
              },
              files: initial.files,
              scrollToContent: !content.initialized,
            }}
            excalidrawAPI={setApi}
            onChange={onChange}
            theme={theme}
            name={page.title}
            handleKeyboardGlobally={false}
            autoFocus
            validateEmbeddable={false}
            UIOptions={{
              canvasActions: {
                loadScene: false,
                saveToActiveFile: false,
                export: false,
                saveAsImage: false,
                clearCanvas: false,
                toggleTheme: false,
              },
            }}
          >
            <MainMenu>
              <MainMenu.DefaultItems.SearchMenu />
              <MainMenu.DefaultItems.Help />
            </MainMenu>
            <WelcomeScreen>
              <WelcomeScreen.Center>
                <WelcomeScreen.Center.Heading>
                  Blank canvas
                </WelcomeScreen.Center.Heading>
              </WelcomeScreen.Center>
            </WelcomeScreen>
          </Excalidraw>
          <div className="canvas-convenience">
            <span>
              {page.mode === "paper"
                ? `${page.size} · ${page.paper} paper`
                : "Whiteboard"}
            </span>
            <div>
              <button
                className="icon-button"
                title="Fit content"
                aria-label="Fit content"
                onClick={() =>
                  void perform(async () => {
                    api?.scrollToContent(undefined, {
                      fitToViewport: true,
                      viewportZoomFactor: 0.85,
                    });
                  })
                }
              >
                <Scan size={17} />
              </button>
            </div>
          </div>
          {mode === "create" && (
            <SelectionTools
              count={selectionCount}
              onArrange={(action) =>
                void perform(async () => {
                  if (api) arrange(api, action);
                })
              }
              onRecolor={() =>
                void perform(async () => {
                  if (api) recolorSelection(api, palette, color);
                })
              }
            />
          )}
        </div>
      </div>
      {mode === "create" && (
        <CreativeLibrary
          category={category}
          onCategory={setCategory}
          palette={palette}
          color={color}
          onColor={(value) => {
            setColor(value);
            api?.updateScene({ appState: { currentItemStrokeColor: value } });
          }}
          preferences={preferences}
          onFavorite={(id) =>
            void perform(() =>
              changePreferences((p) => ({
                ...p,
                favorites: p.favorites.includes(id)
                  ? p.favorites.filter((v) => v !== id)
                  : [...p.favorites, id],
              })),
            )
          }
          onInsert={insertAsset}
          onUsePalette={async (p) => {
            await changePreferences((current) => ({
              ...current,
              paletteId: p.id,
            }));
            setColor(p.accent);
          }}
          onCreatePalette={async (p) => {
            await changePreferences((current) => ({
              ...current,
              paletteId: p.id,
              customPalettes: [...current.customPalettes, p],
            }));
            setColor(p.accent);
          }}
          onTemplate={setComposition}
          onClose={() => onModeChange("write")}
          canFillFrame={canFillFrame}
          onFillFrame={() => {
            if (!api) return;
            const slot = findPhotoSlot(api);
            if (!slot) return;
            pendingSlot.current = slot.id;
            pendingFrame.current = null;
            upload.current?.click();
          }}
        />
      )}
      <input
        ref={upload}
        data-testid="frame-upload"
        type="file"
        accept="image/png,image/jpeg,image/webp"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          const asset = pendingFrame.current;
          const slotId = pendingSlot.current;
          if (!file || (!asset && !slotId) || !api) return;
          void perform(async () => {
            const photo = await readPhoto(file);
            if (!mounted.current)
              throw new Error("The page changed before this photo was ready.");
            if (slotId) fillPhotoSlot(api, photo, slotId);
            else if (asset)
              insertScene(api, buildAsset(asset, palette, undefined, photo));
            if (!asset) return;
            await changePreferences((p) => ({
              ...p,
              recent: [
                asset.id,
                ...p.recent.filter((id) => id !== asset.id),
              ].slice(0, 30),
            }));
          }, "Photo added");
        }}
      />
      {composition && (
        <CompositionDialog
          templateId={composition}
          hasContent={!!api?.getSceneElements().some((e) => !isPaper(e))}
          onClose={() => setComposition(null)}
          onApply={async (scene, replace) => {
            if (!api) throw new Error("Editor is still loading.");
            const hasContent = api.getSceneElements().some((e) => !isPaper(e));
            const dimensions = paperDimensions[page.size];
            const fitted =
              page.mode === "paper"
                ? templateForPaper(scene, dimensions[0], dimensions[1])
                : scene;
            insertScene(
              api,
              fitted,
              replace ? "replace" : hasContent ? "beside" : "replace",
            );
            await autosave.flush();
            notify("Composition added");
          }}
        />
      )}
    </div>
  );
}
