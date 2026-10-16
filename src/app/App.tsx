import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { BookOpen, Loader2, RefreshCw } from "lucide-react";
import { isDesktop, hasNativeBridge } from "../lib/desktop/runtime";
import { repository } from "../lib/database/repository";
import { Dashboard } from "../features/dashboard/Dashboard";
import { Settings } from "../features/settings/Settings";
import { Toast, errorMessage } from "../components/ui";
import { useApp } from "../stores/app";
import { defaultSettings, type AppSettings } from "../types";
const Editor = lazy(() =>
  import("../features/editor/Editor").then((m) => ({ default: m.Editor })),
);
function readRoute() {
  const params = new URLSearchParams(location.hash.slice(1));
  return {
    book: params.get("notebook") ?? undefined,
    page: params.get("page") ?? undefined,
  };
}
export function App() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [route, setRoute] = useState(readRoute);
  const [systemDark, setSystemDark] = useState(
    matchMedia("(prefers-color-scheme: dark)").matches,
  );
  const flush = useRef<(() => Promise<void>) | null>(null);
  const notify = useApp((s) => s.notify);
  useEffect(() => {
    if (!isDesktop || !hasNativeBridge()) return;
    let active = true,
      stop: (() => void) | undefined,
      closing = false;
    void import("@tauri-apps/api/window")
      .then(async ({ getCurrentWindow }) => {
        const window = getCurrentWindow();
        const dispose = await window.onCloseRequested(async (event) => {
          event.preventDefault();
          if (closing) return;
          closing = true;
          try {
            await flush.current?.();
            await window.destroy();
          } catch (error) {
            notify(`Close cancelled: ${String(error)}`, true);
            closing = false;
          }
        });
        if (active) stop = dispose;
        else dispose();
      })
      .catch((error) =>
        notify(
          `Native close protection could not start: ${String(error)}`,
          true,
        ),
      );
    return () => {
      active = false;
      stop?.();
    };
  }, [notify]);
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW();
  useEffect(() => {
    void repository
      .initialize()
      .then(() => repository.settings())
      .then(async (s) => {
        setSettings(s);
        if (!location.hash) {
          const last = await repository.getMeta("lastRoute");
          if (last) {
            history.replaceState(null, "", `#${last}`);
            setRoute(readRoute());
          }
        }
        setReady(true);
      })
      .catch((e) => setError(errorMessage(e)));
    const media = matchMedia("(prefers-color-scheme: dark)");
    const listener = () => setSystemDark(media.matches);
    media.addEventListener("change", listener);
    return () => {
      media.removeEventListener("change", listener);
    };
  }, []);
  const theme =
    settings.theme === "system"
      ? systemDark
        ? "dark"
        : "light"
      : settings.theme;
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  const registerFlush = useCallback((value: (() => Promise<void>) | null) => {
    flush.current = value;
  }, []);
  const navigate = useCallback(
    async (book?: string, page?: string) => {
      try {
        await flush.current?.();
        const params = new URLSearchParams();
        if (book) params.set("notebook", book);
        if (page) params.set("page", page);
        const hash = params.toString();
        await repository.setMeta("lastRoute", hash);
        history.pushState(null, "", hash ? `#${hash}` : location.pathname);
        setRoute({ book, page });
      } catch (e) {
        notify(`Could not leave this page: ${errorMessage(e)}`, true);
      }
    },
    [notify],
  );
  useEffect(() => {
    const change = () => {
      void (async () => {
        try {
          await flush.current?.();
          setRoute(readRoute());
        } catch (e) {
          notify(errorMessage(e), true);
        }
      })();
    };
    window.addEventListener("popstate", change);
    return () => window.removeEventListener("popstate", change);
  }, [notify]);
  const toggleTheme = () => {
    const next = {
      ...settings,
      theme: (theme === "light" ? "dark" : "light") as AppSettings["theme"],
    };
    void repository
      .updateSettings(next)
      .then(() => setSettings(next))
      .catch((e) => notify(errorMessage(e), true));
  };
  if (error)
    return (
      <div className="fatal-state">
        <BookOpen />
        <h1>
          {isDesktop
            ? "Lotepad could not open its database"
            : "Your notebook needs browser storage"}
        </h1>
        <p>{error}</p>
        <p>
          {isDesktop
            ? "Your data has not been replaced. Check the error above, then retry."
            : "Allow storage for this site, then reload to try again."}
        </p>
        <button className="button primary" onClick={() => location.reload()}>
          Try again
        </button>
      </div>
    );
  if (!ready)
    return (
      <div className="app-loading">
        <BookOpen size={34} />
        <h1>
          Lotepad<span>.</span>
        </h1>
        <Loader2 className="spin" size={20} />
      </div>
    );
  return (
    <>
      <Suspense
        fallback={
          <div className="canvas-loading">
            <Loader2 className="spin" />
            Opening notebook…
          </div>
        }
      >
        {route.book ? (
          <Editor
            key={route.book}
            notebookId={route.book}
            pageId={route.page}
            onNavigate={navigate}
            onRegisterFlush={registerFlush}
            theme={theme}
            onTheme={toggleTheme}
            onSettings={() => setSettingsOpen(true)}
          />
        ) : (
          <Dashboard
            onOpen={navigate}
            onSettings={() => setSettingsOpen(true)}
          />
        )}
      </Suspense>
      {settingsOpen && (
        <Settings
          onClose={() => setSettingsOpen(false)}
          onSettingsChange={setSettings}
          onBeforeBackup={async () => {
            await flush.current?.();
          }}
          onBeforeRestore={async () => {
            await flush.current?.();
            await navigate();
          }}
        />
      )}
      <Toast />
      {needRefresh ? (
        <div className="pwa-notice">
          <RefreshCw size={17} />
          <span>Update available.</span>
          <button
            className="text-button"
            onClick={() =>
              void (async () => {
                try {
                  await flush.current?.();
                  await updateServiceWorker(true);
                } catch (e) {
                  notify(errorMessage(e), true);
                }
              })()
            }
          >
            Save & update
          </button>
        </div>
      ) : null}
    </>
  );
}
