import { useMemo, useState } from "react";
import { RefreshCw, Sparkles, ArrowRight } from "lucide-react";
import { Modal, Confirm, errorMessage } from "../../components/ui";
import { ScenePreview } from "./ScenePreview";
import { Select } from "../../components/Select";
import {
  buildTemplate,
  generateInspiration,
  inspirationModes,
  scrapbookTemplates,
} from "./templates";
import type { CreativeScene, InspirationMode, TemplateId } from "./types";
export function CompositionDialog({
  templateId,
  hasContent,
  onApply,
  onClose,
}: {
  templateId: TemplateId | "inspire";
  hasContent: boolean;
  onApply: (scene: CreativeScene, replace: boolean) => Promise<void>;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<InspirationMode>("chaos");
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 100000));
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [replace, setReplace] = useState(false);
  const generated = useMemo(
    () =>
      templateId === "inspire"
        ? generateInspiration(mode, seed)
        : {
            scene: buildTemplate(templateId),
            title: scrapbookTemplates.find((t) => t.id === templateId)!.name,
            palette: null,
          },
    [mode, seed, templateId],
  );
  async function apply() {
    setBusy(true);
    setError("");
    try {
      await onApply(generated.scene, replace);
      onClose();
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
      setConfirm(false);
    }
  }
  return (
    <>
      <Modal
        open
        onClose={() => !busy && onClose()}
        title={templateId === "inspire" ? "Inspire Me" : generated.title}
        description={
          templateId === "inspire"
            ? "A composition to make your own."
            : "Every text block stays editable."
        }
        wide
      >
        <div className="composition-dialog">
          {templateId === "inspire" && (
            <div className="inspiration-modes">
              {inspirationModes.map((m) => (
                <button
                  key={m.id}
                  className={mode === m.id ? "selected" : ""}
                  onClick={() => setMode(m.id)}
                >
                  {m.name}
                </button>
              ))}
            </div>
          )}
          <ScenePreview scene={generated.scene} />
          <div className="composition-meta">
            {generated.palette && (
              <>
                <span>{generated.palette.name}</span>
                <div>
                  {generated.palette.colors.map((c) => (
                    <i key={c} style={{ background: c }} />
                  ))}
                </div>
              </>
            )}
          </div>
          {hasContent && (
            <label className="field composition-placement">
              Placement
              <Select
                label="Placement"
                value={replace ? "replace" : "beside"}
                onValueChange={(value) => setReplace(value === "replace")}
                options={[
                  { value: "beside", label: "Add beside existing content" },
                  { value: "replace", label: "Replace page content…" },
                ]}
              />
              <small>The paper size and page mode stay the same.</small>
            </label>
          )}
          {error && <p className="form-error">{error}</p>}
          <div className="modal-actions">
            {templateId === "inspire" && (
              <button
                className="button secondary regenerate-button"
                disabled={busy}
                onClick={() => setSeed((s) => s + 1)}
              >
                <RefreshCw size={16} />
                Regenerate
              </button>
            )}
            <button
              className="button secondary"
              disabled={busy}
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              className="button primary"
              disabled={busy}
              onClick={() =>
                replace && hasContent ? setConfirm(true) : void apply()
              }
            >
              {templateId === "inspire" ? (
                <Sparkles size={16} />
              ) : (
                <ArrowRight size={16} />
              )}
              {busy
                ? "Applying…"
                : templateId === "inspire"
                  ? "Apply composition"
                  : "Apply template"}
            </button>
          </div>
        </div>
      </Modal>
      {confirm && (
        <Confirm
          title="Replace page content?"
          description="The current drawing will be replaced by this composition. The paper background is preserved. You can undo the replacement in the editor."
          label="Replace content"
          onConfirm={apply}
          onClose={() => setConfirm(false)}
        />
      )}
    </>
  );
}
