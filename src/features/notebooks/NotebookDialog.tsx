import { useState, type FormEvent } from "react";
import { BookOpen, Check } from "lucide-react";
import { Modal, errorMessage } from "../../components/ui";
import { covers, type Notebook } from "../../types";
import { repository } from "../../lib/database/repository";
export function NotebookDialog({
  book,
  onClose,
  onCreated,
}: {
  book?: Notebook;
  onClose: () => void;
  onCreated?: (id: string) => void;
}) {
  const [title, setTitle] = useState(book?.title ?? "");
  const [color, setColor] = useState(book?.color ?? covers[0]);
  const [icon, setIcon] = useState(book?.icon ?? "✿");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (book)
        await repository.updateNotebook(book.id, {
          title: title.trim(),
          color,
          icon,
        });
      else {
        const created = await repository.createNotebook(title, color, icon);
        await repository.createPage(created.id, { title: "My first page" });
        onCreated?.(created.id);
      }
      onClose();
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }
  return (
    <Modal
      open
      onClose={onClose}
      title={book ? "Edit notebook" : "New notebook"}
    >
      <form onSubmit={(e) => void submit(e)}>
        <div
          className="notebook-form-preview"
          style={{ backgroundColor: color }}
        >
          <span>{icon}</span>
          <strong>{title || "Untitled notebook"}</strong>
          <small>LOTEPAD NOTEBOOK</small>
        </div>
        <label className="field">
          Notebook name
          <input
            autoFocus
            placeholder="A place for…"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={120}
            required
          />
        </label>
        <div className="field">
          <span>Cover color</span>
          <div className="swatches">
            {covers.map((c) => (
              <button
                key={c}
                type="button"
                className={`swatch ${c === color ? "selected" : ""}`}
                style={{ background: c }}
                onClick={() => setColor(c)}
                aria-label={`Cover ${c}`}
                aria-pressed={c === color}
              >
                {c === color && <Check size={17} />}
              </button>
            ))}
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              aria-label="Custom cover color"
            />
          </div>
        </div>
        <div className="field">
          <span>Symbol</span>
          <div className="icon-options">
            {["✿", "✧", "☀", "♡", "☾", "↗", "⌘", "❋"].map((i) => (
              <button
                type="button"
                key={i}
                onClick={() => setIcon(i)}
                className={icon === i ? "selected" : ""}
                aria-label={`Notebook symbol ${i}`}
                aria-pressed={icon === i}
              >
                {i}
              </button>
            ))}
          </div>
        </div>
        {error && <p className="form-error">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="button secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="button primary" disabled={busy || !title.trim()}>
            <BookOpen size={17} />
            {busy ? "Saving…" : book ? "Save notebook" : "Create notebook"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
