import { useEffect, useState } from "react";
import { ArrowUpRight, Check, Plus } from "lucide-react";
import { Modal, errorMessage } from "../../components/ui";
import { repository } from "../../lib/database/repository";
import {
  defaultSettings,
  type NotePage,
  type PaperSize,
  type PaperType,
  type PageMode,
} from "../../types";
export function PageDialog({
  notebookId,
  onClose,
  onCreated,
}: {
  notebookId: string;
  onClose: () => void;
  onCreated: (page: NotePage) => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [paper, setPaper] = useState<PaperType>("dotted");
  const [mode, setMode] = useState<PageMode>("paper");
  const [size, setSize] = useState<PaperSize>("A4");
  const [color, setColor] = useState(defaultSettings.paperColor);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    void repository
      .settings()
      .then((s) => {
        setPaper(s.defaultPaper);
        setMode(s.defaultMode);
        setColor(s.paperColor);
      })
      .catch((e) => setError(errorMessage(e)));
  }, []);
  return (
    <Modal
      open
      onClose={onClose}
      title="New page"
      description="Choose a template."
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setBusy(true);
          void repository
            .createPage(notebookId, {
              title,
              mode,
              paper,
              size,
              paperColor: color,
            })
            .then(onCreated)
            .then(onClose)
            .catch((e) => {
              setBusy(false);
              setError(errorMessage(e));
            });
        }}
      >
        <label className="field">
          Page title
          <input
            autoFocus
            placeholder="Untitled page"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={120}
          />
        </label>
        <div className="template-grid">
          {(["blank", "ruled", "grid", "dotted", "infinite"] as const).map(
            (type) => (
              <button
                type="button"
                key={type}
                className={`template ${(mode === "infinite" ? type === "infinite" : paper === type) ? "selected" : ""}`}
                onClick={() => {
                  setMode(type === "infinite" ? "infinite" : "paper");
                  if (type !== "infinite") setPaper(type);
                }}
              >
                <span className={`paper-swatch ${type}`}>
                  {type === "infinite" && <ArrowUpRight />}
                </span>
                <span>
                  {type === "infinite"
                    ? "Whiteboard"
                    : type === "blank"
                      ? "Blank paper"
                      : `${type[0].toUpperCase()}${type.slice(1)} paper`}
                </span>
                {(mode === "infinite"
                  ? type === "infinite"
                  : paper === type) && (
                  <Check className="template-check" size={14} />
                )}
              </button>
            ),
          )}
        </div>
        {mode === "paper" && (
          <div className="field-row">
            <label className="field">
              Paper size
              <select
                value={size}
                onChange={(e) => setSize(e.target.value as PaperSize)}
              >
                {["A4", "A4 landscape", "A5", "Letter"].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
            <label className="field">
              Paper color
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
              />
            </label>
          </div>
        )}
        {error && <p className="form-error">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="button secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="button primary" disabled={busy}>
            <Plus size={17} />
            {busy ? "Creating…" : "Create page"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
