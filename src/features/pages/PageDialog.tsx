import { useEffect, useState } from "react";
import { ArrowUpRight, Check, Plus } from "lucide-react";
import { Modal, errorMessage } from "../../components/ui";
import { Select } from "../../components/Select";
import { repository } from "../../lib/database/repository";
import { TemplateChoices } from "../creative/TemplateChoices";
import type { TemplateId } from "../creative/types";
import { scrapbookTemplates } from "../creative/templateCatalog";
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
  initialTemplate,
}: {
  notebookId: string;
  onClose: () => void;
  onCreated: (page: NotePage) => Promise<void>;
  initialTemplate?: TemplateId;
}) {
  const [title, setTitle] = useState("");
  const [paper, setPaper] = useState<PaperType>("dotted");
  const [mode, setMode] = useState<PageMode>("paper");
  const [size, setSize] = useState<PaperSize>("A4");
  const [color, setColor] = useState(defaultSettings.paperColor);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [template, setTemplate] = useState<TemplateId | null>(
    initialTemplate ?? null,
  );
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
      description="Start simple, or choose a scrapbook layout."
      wide
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setBusy(true);
          void (async () => {
            // Page metadata, scene, and embedded assets commit together.
            const { buildTemplate, templateForPaper } =
              await import("../creative/templates");
            const { initializePaper, paperDimensions } =
              await import("../../lib/excalidraw/adapter");
            if (template) {
              const { prepareCreativeFonts } =
                await import("../creative/fonts");
              await prepareCreativeFonts();
            }
            await repository.database
              .transaction("rw", repository.database.tables, async () => {
                const page = await repository.createPage(notebookId, {
                  title:
                    title ||
                    (template
                      ? scrapbookTemplates.find((t) => t.id === template)?.name
                      : ""),
                  mode,
                  paper,
                  size,
                  paperColor: color,
                });
                if (template) {
                  const initial = initializePaper(
                    page,
                    await repository.loadContent(page.id),
                  );
                  const dimensions = paperDimensions[page.size];
                  const scene = templateForPaper(
                    buildTemplate(template),
                    dimensions[0],
                    dimensions[1],
                  );
                  await repository.saveContent({
                    ...initial,
                    elements: [...initial.elements, ...scene.elements],
                    files: { ...initial.files, ...scene.files },
                    initialized: true,
                  });
                }
                return page;
              })
              .then(onCreated);
          })()
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
        <div className="page-template-tabs">
          <button
            type="button"
            className={!template ? "active" : ""}
            onClick={() => setTemplate(null)}
          >
            Paper & canvas
          </button>
          <button
            type="button"
            className={template ? "active" : ""}
            onClick={() => setTemplate(template ?? "organized-chaos")}
          >
            Scrapbook layouts
          </button>
        </div>
        {template ? (
          <TemplateChoices
            selected={template}
            onSelect={(id) => {
              setTemplate(id);
              if (!title)
                setTitle(scrapbookTemplates.find((t) => t.id === id)!.name);
            }}
          />
        ) : (
          <>
            <div className="template-grid">
              {(
                [
                  "blank",
                  "ruled",
                  "grid",
                  "dotted",
                  "vintage",
                  "infinite",
                ] as const
              ).map((type) => (
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
              ))}
            </div>
          </>
        )}
        {template && (
          <label className="field">
            Canvas mode
            <Select
              label="Canvas mode"
              value={mode}
              onValueChange={(value) => setMode(value as PageMode)}
              options={[
                { value: "paper", label: "Paper notes" },
                { value: "infinite", label: "Infinite whiteboard" },
              ]}
            />
          </label>
        )}
        {mode === "paper" && (
          <div className="field-row">
            <label className="field">
              Paper size
              <Select
                label="Paper size"
                value={size}
                onValueChange={(value) => setSize(value as PaperSize)}
                options={["A4", "A4 landscape", "A5", "Letter"].map((s) => ({
                  value: s,
                  label: s,
                }))}
              />
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
        {mode === "paper" && (
          <div className="paper-color-presets" aria-label="Paper colors">
            {[
              { name: "Clean white", color: "#ffffff" },
              { name: "Warm cream", color: "#fffdf8" },
              { name: "Soft lavender", color: "#f1eaf8" },
              { name: "Sage paper", color: "#e8eee3" },
              { name: "Vintage parchment", color: "#f5ecd9" },
              { name: "Dark paper", color: "#292630" },
            ].map((p) => (
              <button
                type="button"
                key={p.color}
                style={{ background: p.color }}
                title={p.name}
                aria-label={p.name}
                aria-pressed={color === p.color}
                className={color === p.color ? "selected" : ""}
                onClick={() => setColor(p.color)}
              />
            ))}
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
