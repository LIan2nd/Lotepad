import { useEffect, useRef, useState } from "react";
import {
  Download,
  Upload,
  HardDrive,
  Moon,
  Sun,
  Monitor,
  BookOpen,
  ExternalLink,
} from "lucide-react";
import { Modal, Confirm, errorMessage, perform } from "../../components/ui";
import { repository } from "../../lib/database/repository";
import {
  download,
  exportBackup,
  importBackup,
  readBackup,
} from "../../lib/backup";
import {
  defaultSettings,
  type AppSettings,
  type BackupData,
  type PaperType,
  type PageMode,
} from "../../types";
import { useApp } from "../../stores/app";
import { Select } from "../../components/Select";
export function Settings({
  onClose,
  onSettingsChange,
  onBeforeRestore,
}: {
  onClose: () => void;
  onSettingsChange: (settings: AppSettings) => void;
  onBeforeRestore: () => Promise<void>;
}) {
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [usage, setUsage] = useState("Checking storage…");
  const [importData, setImportData] = useState<BackupData | null>(null);
  const [replace, setReplace] = useState(false);
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const notify = useApp((s) => s.notify);
  useEffect(() => {
    void repository
      .settings()
      .then(setSettings)
      .catch((e) => notify(errorMessage(e), true));
    if (navigator.storage?.estimate)
      void navigator.storage
        .estimate()
        .then((s) =>
          setUsage(`${((s.usage ?? 0) / 1024 / 1024).toFixed(1)} MB used`),
        )
        .catch(() => setUsage("Storage estimate unavailable"));
    else setUsage("Storage estimate unavailable");
  }, [notify]);
  async function update(updates: Partial<AppSettings>) {
    const next = { ...settings, ...updates };
    try {
      await repository.updateSettings(next);
      setSettings(next);
      onSettingsChange(next);
    } catch (e) {
      notify(errorMessage(e), true);
    }
  }
  async function restore(mode: "merge" | "replace") {
    if (!importData) return;
    setBusy(true);
    try {
      await onBeforeRestore();
      await importBackup(importData, mode);
      const next = await repository.settings();
      setSettings(next);
      onSettingsChange(next);
      notify(`${importData.notebooks.length} notebooks restored`);
      setImportData(null);
    } catch (e) {
      notify(errorMessage(e), true);
    } finally {
      setBusy(false);
      setReplace(false);
    }
  }
  return (
    <>
      <Modal open onClose={onClose} title="Settings" wide>
        <div className="settings-content">
          <section>
            <h3>Appearance</h3>
            <div className="theme-options">
              {(
                [
                  { id: "light", label: "Light", icon: Sun },
                  { id: "dark", label: "Dark", icon: Moon },
                  { id: "system", label: "System", icon: Monitor },
                ] as const
              ).map((t) => (
                <button
                  key={t.id}
                  className={settings.theme === t.id ? "selected" : ""}
                  onClick={() => void update({ theme: t.id })}
                >
                  <t.icon size={20} />
                  {t.label}
                </button>
              ))}
            </div>
          </section>
          <section>
            <h3>Editor preferences</h3>
            <div className="field-row">
              <label className="field">
                Default page mode
                <Select
                  label="Default page mode"
                  value={settings.defaultMode}
                  onValueChange={(value) =>
                    void update({ defaultMode: value as PageMode })
                  }
                  options={[
                    { value: "paper", label: "Paper notes" },
                    { value: "infinite", label: "Infinite whiteboard" },
                  ]}
                />
              </label>
              <label className="field">
                Default paper
                <Select
                  label="Default paper"
                  value={settings.defaultPaper}
                  onValueChange={(value) =>
                    void update({ defaultPaper: value as PaperType })
                  }
                  options={["blank", "ruled", "grid", "dotted", "vintage"].map(
                    (t) => ({
                      value: t,
                      label: t[0].toUpperCase() + t.slice(1),
                    }),
                  )}
                />
              </label>
            </div>
            <div className="field-row">
              <label className="field">
                Paper color
                <input
                  type="color"
                  value={settings.paperColor}
                  onChange={(e) => void update({ paperColor: e.target.value })}
                />
              </label>
              <label className="field">
                Starting zoom
                <Select
                  label="Starting zoom"
                  value={String(settings.defaultZoom)}
                  onValueChange={(value) =>
                    void update({ defaultZoom: Number(value) })
                  }
                  options={[0.5, 0.7, 1, 1.5].map((v) => ({
                    value: String(v),
                    label: `${v * 100}%`,
                  }))}
                />
              </label>
            </div>
          </section>
          <section>
            <h3>Data & backups</h3>
            <p>
              Complete ZIP backups include notebooks, pages, drawings, and
              images.
            </p>
            <div className="backup-buttons">
              <button
                className="button secondary"
                disabled={busy}
                onClick={() => {
                  setBusy(true);
                  void perform(
                    async () =>
                      download(
                        await exportBackup(),
                        `lotepad-backup-${new Date().toISOString().slice(0, 10)}.zip`,
                      ),
                    "Backup exported",
                  ).finally(() => setBusy(false));
                }}
              >
                <Download size={17} />
                Export backup
              </button>
              <button
                className="button secondary"
                disabled={busy}
                onClick={() => file.current?.click()}
              >
                <Upload size={17} />
                Import backup
              </button>
            </div>
            <input
              ref={file}
              type="file"
              accept=".zip"
              hidden
              onChange={(e) => {
                const selected = e.target.files?.[0];
                e.target.value = "";
                if (selected) {
                  setBusy(true);
                  void readBackup(selected)
                    .then(setImportData)
                    .catch((e) => notify(errorMessage(e), true))
                    .finally(() => setBusy(false));
                }
              }}
            />
            <div className="storage-info">
              <HardDrive size={17} />
              {usage}
              <button
                className="text-button"
                onClick={() =>
                  void perform(async () => {
                    const granted = await navigator.storage?.persist?.();
                    notify(
                      granted
                        ? "Persistent storage enabled."
                        : "Your browser manages storage persistence automatically.",
                    );
                  })
                }
              >
                Protect storage
              </button>
            </div>
            <p className="storage-note">
              Your notes live in this browser. Clearing site data removes them.
              Keep a backup somewhere safe.
            </p>
          </section>
          <section className="about">
            <div className="about-logo">
              <BookOpen size={23} />
            </div>
            <div>
              <h3>
                Lotepad <span>v1.1.0</span>
              </h3>
              <p>Your Creative Little Universe</p>
            </div>
            <p className="licenses">
              <a
                href="/THIRD_PARTY_NOTICES.txt"
                target="_blank"
                rel="noreferrer"
              >
                Open-source acknowledgments <ExternalLink size={12} />
              </a>
            </p>
          </section>
        </div>
      </Modal>
      {importData && (
        <Modal
          open
          onClose={() => !busy && setImportData(null)}
          title="Import backup"
          description={`This backup contains ${importData.notebooks.length} notebooks and ${importData.pages.length} pages.`}
        >
          <p className="dialog-copy">
            Merge adds a separate copy of every imported notebook. Your existing
            notes stay safe.
          </p>
          <div className="modal-actions import-actions">
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => setReplace(true)}
            >
              Replace all data…
            </button>
            <button
              className="button primary"
              disabled={busy}
              onClick={() => void restore("merge")}
            >
              {busy ? "Restoring…" : "Merge notebooks"}
            </button>
          </div>
        </Modal>
      )}
      {replace && (
        <Confirm
          title="Replace every notebook?"
          description="All current notebooks, including Trash, will be replaced by this backup. Export your current notes first if you need to keep them."
          label="Replace all data"
          onConfirm={() => restore("replace")}
          onClose={() => setReplace(false)}
        />
      )}
    </>
  );
}
