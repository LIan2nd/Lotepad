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
import { repository } from "../../lib/database/repository";
import { Autosave, type SaveStatus } from "../../lib/database/autosave";
import { initializePaper, persistentState } from "../../lib/excalidraw/adapter";
import { download } from "../../lib/backup";
import { errorMessage, perform } from "../../components/ui";
import { useApp } from "../../stores/app";
import type { NotePage, PageContent } from "../../types";
export interface CanvasActions {
  flush: () => Promise<void>;
  export: (format: "png" | "svg" | "json") => Promise<void>;
}
export function Canvas({
  page,
  content,
  theme,
  onStatus,
  onActions,
}: {
  page: NotePage;
  content: PageContent;
  theme: "light" | "dark";
  onStatus: (s: SaveStatus) => void;
  onActions: (actions: CanvasActions | null) => void;
}) {
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);
  const notify = useApp((s) => s.notify);
  const initial = useMemo(
    () => initializePaper(page, content),
    [page, content],
  );
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
      export: async (format) => {
        await autosave.flush();
        const elements = api.getSceneElements();
        const files = api.getFiles();
        const appState = {
          ...persistentState(api.getAppState()),
          exportWithDarkMode: false,
          exportBackground: true,
        };
        const name = page.title.replace(/[<>:"/\\|?*]/g, "_");
        if (format === "json") {
          download(
            new Blob([serializeAsJSON(elements, appState, files, "local")], {
              type: "application/json",
            }),
            `${name}.excalidraw`,
          );
          return;
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
          download(
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
          download(blob, `${name}.png`);
        }
      },
    });
    return () => onActions(null);
  }, [api, autosave, onActions, page.title]);
  const onChange: ExcalidrawProps["onChange"] = (elements, state, files) => {
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
    </div>
  );
}
