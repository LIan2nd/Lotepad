import { useEffect, useState } from "react";
import {
  Database,
  Download,
  Upload,
  FolderOpen,
  ShieldCheck,
  Loader2,
  Check,
  ArrowRight,
} from "lucide-react";
import { Modal, Confirm, errorMessage } from "../../components/ui";
import { native } from "../../lib/desktop/runtime";
import { repository, storageChanged } from "../../lib/database/repository";
import type { AppSettings } from "../../types";
interface StorageInfo {
  databasePath: string;
  bytes: number;
  assets: number;
  schemaVersion: number;
  recoveryDirectory: string;
}
interface Summary {
  counts: { notebooks: number; pages: number; scenes: number; assets: number };
  fingerprint: string;
  alreadyImported: boolean;
  integrity: string;
  remappedNotebooks: number;
  remappedPages: number;
}
interface Preview {
  token: string;
  fileName: string;
  summary: Summary;
}
export function DesktopStorage({
  onBeforeBackup,
  onBeforeRestore,
  onSettingsChange,
}: {
  onBeforeBackup: () => Promise<void>;
  onBeforeRestore: () => Promise<void>;
  onSettingsChange: (value: AppSettings) => void;
}) {
  const [info, setInfo] = useState<StorageInfo>(),
    [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [wizard, setWizard] = useState(false);
  async function refresh() {
    setInfo(await native<StorageInfo>("storage_info"));
  }
  useEffect(() => {
    void native<StorageInfo>("storage_info")
      .then(setInfo)
      .catch((e) => setError(errorMessage(e)));
  }, []);
  async function backup(kind: string) {
    setBusy(kind);
    setError("");
    setMessage("");
    try {
      await onBeforeBackup();
      const result = await native<{ cancelled: boolean; path: string }>(
        "export_native",
        { kind },
      );
      if (!result.cancelled) setMessage(`Backup saved to ${result.path}`);
      await refresh();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy("");
    }
  }
  return (
    <section className="desktop-storage">
      <h3>Data &amp; Storage</h3>
      <div className="database-location">
        <Database size={19} />
        <div>
          <strong>SQLite database</strong>
          <code>{info?.databasePath ?? "Loading database location…"}</code>
          {info && (
            <small>
              {(info.bytes / 1024 / 1024).toFixed(1)} MB · {info.assets} stored
              assets · Schema {info.schemaVersion}
            </small>
          )}
        </div>
      </div>
      <div className="native-storage-actions">
        <button
          className="button secondary"
          onClick={() => {
            void native("open_data_folder").catch((e) =>
              setError(errorMessage(e)),
            );
          }}
        >
          <FolderOpen size={16} />
          Open Data Folder
        </button>
        <button
          className="button secondary"
          disabled={!!busy}
          onClick={() => {
            setBusy("verify");
            setError("");
            void onBeforeBackup()
              .then(() => native("verify_database"))
              .then(() =>
                setMessage(
                  "Database, scene references, media, and foreign keys verified.",
                ),
              )
              .catch((e) => setError(errorMessage(e)))
              .finally(() => setBusy(""));
          }}
        >
          <ShieldCheck size={16} />
          Verify database
        </button>
      </div>
      <h4>Database Backup</h4>
      <div className="native-backup-options">
        {[
          {
            id: "sql",
            name: "SQL Dump",
            extension: ".sql",
            description: "Complete SQLite schema and data, including images.",
          },
          {
            id: "db",
            name: "SQLite Snapshot",
            extension: ".db",
            description: "Consistent database snapshot, including WAL changes.",
          },
          {
            id: "zip",
            name: "Portable Backup",
            extension: ".zip",
            description:
              "Editable notes, scenes, media, settings, and palettes.",
          },
        ].map((item) => (
          <article key={item.id}>
            <div>
              <strong>
                {item.name}
                <span>{item.extension}</span>
              </strong>
              <p>{item.description}</p>
            </div>
            <button
              className="button secondary"
              disabled={!!busy}
              onClick={() => void backup(item.id)}
            >
              {busy === item.id ? (
                <Loader2 className="spin" size={16} />
              ) : (
                <Download size={16} />
              )}{" "}
              {busy === item.id
                ? "Exporting…"
                : item.id === "sql"
                  ? "Export SQL Backup"
                  : item.id === "db"
                    ? "Export Snapshot"
                    : "Export Portable Backup"}
            </button>
          </article>
        ))}
      </div>
      <p className="storage-note">
        Backups contain your notes and images without encryption. Choose a
        location you trust. SQL export is read-only; SQL restore is not run
        against the active database.
      </p>
      <button
        className="button secondary"
        disabled={!!busy}
        onClick={() => setWizard(true)}
      >
        <Upload size={16} />
        Import notes or restore backup
      </button>
      {busy && (
        <p className="native-operation-status" role="status">
          {busy === "verify"
            ? "Checking database…"
            : "Writing backup… Please keep Lotepad open."}
        </p>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="native-success" role="status">
          {message}
        </p>
      )}
      {wizard && (
        <MigrationWizard
          onClose={() => setWizard(false)}
          onBeforeRestore={onBeforeRestore}
          onComplete={async () => {
            const settings = await repository.settings();
            onSettingsChange(settings);
            storageChanged();
            await refresh();
          }}
        />
      )}
    </section>
  );
}
function MigrationWizard({
  onClose,
  onBeforeRestore,
  onComplete,
}: {
  onClose: () => void;
  onBeforeRestore: () => Promise<void>;
  onComplete: () => Promise<void>;
}) {
  const [preview, setPreview] = useState<Preview>(),
    [result, setResult] = useState<Summary>(),
    [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [confirm, setConfirm] = useState(false);
  async function choose() {
    setBusy("Validating archive, scenes, media, and checksums…");
    setError("");
    try {
      const result = await native<Preview | null>("preview_import");
      if (result) setPreview(result);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy("");
    }
  }
  async function apply(replace: boolean) {
    if (!preview) return;
    setBusy("Importing and verifying in one transaction…");
    setError("");
    try {
      await onBeforeRestore();
      const summary = await native<Summary>("apply_import", {
        token: preview.token,
        replace,
      });
      await onComplete();
      setResult(summary);
      setConfirm(false);
    } catch (e) {
      setError(errorMessage(e));
      setConfirm(false);
    } finally {
      setBusy("");
    }
  }
  return (
    <>
      <Modal
        open
        onClose={() => !busy && onClose()}
        title={result ? "Import verified" : "Bring your notes to Lotepad"}
        description="Transfer notes through a portable archive. The original browser data is left untouched."
        wide
      >
        <div className="migration-steps">
          {["Choose", "Validate", "Import", "Verify"].map((step, i) => (
            <span
              key={step}
              className={result || (preview && i < 2) ? "complete" : ""}
            >
              {result || (preview && i < 2) ? <Check size={13} /> : i + 1}
              {step}
            </span>
          ))}
        </div>
        {!preview && !result && (
          <div className="migration-welcome">
            <Upload size={28} />
            <p>
              In the web version, open Settings and choose{" "}
              <strong>Export for Lotepad Desktop</strong>. Existing Lotepad and
              InkNest ZIP backups are also supported.
            </p>
            <p>Select the ZIP here to check its contents before importing.</p>
          </div>
        )}
        {preview && !result && (
          <>
            <div className="migration-file">{preview.fileName}</div>
            <div className="migration-counts">
              {Object.entries(preview.summary.counts).map(([label, count]) => (
                <div key={label}>
                  <strong>{count}</strong>
                  <span>{label}</span>
                </div>
              ))}
            </div>
            <p className="dialog-copy">
              {preview.summary.integrity}. Merge retains existing notebooks and
              remaps colliding IDs. A repeated archive will not create duplicate
              notes.
            </p>
            {preview.summary.alreadyImported && (
              <p className="native-success">
                This exact archive has already been imported. Merge will not add
                another copy.
              </p>
            )}
          </>
        )}
        {result && (
          <>
            <div className="migration-verified">
              <ShieldCheck size={36} />
              <h3>Notes imported and verified</h3>
              <p>{result.integrity}</p>
            </div>
            <div className="migration-counts">
              {Object.entries(result.counts).map(([label, count]) => (
                <div key={label}>
                  <strong>{count}</strong>
                  <span>{label}</span>
                </div>
              ))}
            </div>
            <p className="dialog-copy">
              {result.remappedNotebooks} notebook IDs and {result.remappedPages}{" "}
              page IDs remapped. The source archive and browser database have
              not been modified.
            </p>
          </>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        {busy && (
          <p className="native-operation-status" role="status">
            <Loader2 className="spin" size={16} />
            {busy}
          </p>
        )}
        <div className="modal-actions">
          <button
            className="button secondary"
            disabled={!!busy}
            onClick={onClose}
          >
            {result ? "Done" : "Cancel"}
          </button>
          {!result && (
            <button
              className="button secondary"
              disabled={!!busy}
              onClick={() => void choose()}
            >
              {preview ? "Choose another archive" : "Select archive"}
            </button>
          )}
          {preview && !result && (
            <>
              <button
                className="button secondary"
                disabled={!!busy}
                onClick={() => setConfirm(true)}
              >
                Replace desktop data…
              </button>
              <button
                className="button primary"
                disabled={!!busy || preview.summary.alreadyImported}
                onClick={() => void apply(false)}
              >
                <ArrowRight size={16} />
                Import &amp; verify
              </button>
            </>
          )}
        </div>
      </Modal>
      {confirm && (
        <Confirm
          title="Replace desktop data?"
          description="A recovery snapshot of the current SQLite database will be saved before replacement. Imported scenes and assets must pass verification before the transaction commits. Browser notes are not affected."
          label="Create safety backup & replace"
          onConfirm={() => apply(true)}
          onClose={() => !busy && setConfirm(false)}
        />
      )}
    </>
  );
}
