import { useState } from "react";
import { Check, Plus } from "lucide-react";
import { Modal, errorMessage } from "../../components/ui";
import { palettes } from "./palettes";
import type { CreativePreferences, Palette } from "./types";
export function PaletteStudio({
  preferences,
  onUse,
  onCreate,
  onColor,
}: {
  preferences: CreativePreferences;
  onUse: (palette: Palette) => Promise<void>;
  onCreate: (palette: Palette) => Promise<void>;
  onColor: (color: string) => void;
}) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [colors, setColors] = useState([
    "#c9b5e4",
    "#e7c4d5",
    "#fff9ef",
    "#b7c9ad",
    "#4f3b62",
  ]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="palette-studio">
      {error && !creating && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <p className="creative-help">
        Palettes style future inserts. Tap a swatch to choose a color.
      </p>
      {[...palettes, ...preferences.customPalettes].map((p) => (
        <article
          className={`palette-card ${preferences.paletteId === p.id ? "selected" : ""}`}
          key={p.id}
        >
          <div>
            <strong>{p.name}</strong>
            <button
              className="palette-use"
              aria-label={`Use ${p.name}`}
              aria-pressed={preferences.paletteId === p.id}
              onClick={() => {
                setError("");
                void onUse(p).catch((e) => setError(errorMessage(e)));
              }}
            >
              {preferences.paletteId === p.id ? (
                <>
                  <Check size={13} />
                  Active
                </>
              ) : (
                "Use palette"
              )}
            </button>
          </div>
          <div className="palette-swatches">
            {p.colors.map((c, i) => (
              <button
                key={i}
                style={{ background: c }}
                title={c}
                aria-label={`Use color ${c}`}
                onClick={() => onColor(c)}
              />
            ))}
          </div>
          <span className="palette-hexes">
            {p.colors.map((c, i) => (
              <span key={i}>{c}</span>
            ))}
          </span>
        </article>
      ))}
      <button
        className="button secondary add-palette"
        onClick={() => setCreating(true)}
      >
        <Plus size={16} />
        New palette
      </button>
      {creating && (
        <Modal
          open
          onClose={() => !busy && setCreating(false)}
          title="New palette"
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setBusy(true);
              void onCreate({
                id: `custom-${crypto.randomUUID()}`,
                name: name.trim(),
                colors,
                accent: colors[0],
                paper: colors[2],
                ink: colors[4],
              })
                .then(() => setCreating(false))
                .catch((e) => setError(errorMessage(e)))
                .finally(() => setBusy(false));
            }}
          >
            <label className="field">
              Palette name
              <input
                autoFocus
                required
                maxLength={80}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="A color story"
              />
            </label>
            <div className="custom-palette-colors">
              {colors.map((c, i) => (
                <label key={i}>
                  <span>
                    {["Accent", "Secondary", "Paper", "Highlight", "Ink"][i]}
                  </span>
                  <input
                    type="color"
                    value={c}
                    aria-label={`Palette ${["accent", "secondary", "paper", "highlight", "ink"][i]}`}
                    onChange={(e) =>
                      setColors((v) =>
                        v.map((value, j) => (i === j ? e.target.value : value)),
                      )
                    }
                  />
                  <small>{c}</small>
                </label>
              ))}
            </div>
            {error && <p className="form-error">{error}</p>}
            <div className="modal-actions">
              <button
                type="button"
                className="button secondary"
                onClick={() => setCreating(false)}
              >
                Cancel
              </button>
              <button
                className="button primary"
                disabled={busy || !name.trim()}
              >
                Save palette
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
