import { Check, ArrowUpRight } from "lucide-react";
import { scrapbookTemplates, templateThumbnail } from "./templateCatalog";
import type { TemplateId } from "./types";
export function TemplateChoices({
  selected,
  onSelect,
  preview = false,
}: {
  selected?: TemplateId | null;
  onSelect: (id: TemplateId) => void;
  preview?: boolean;
}) {
  return (
    <div className="scrapbook-template-grid">
      {scrapbookTemplates.map((t) => (
        <button
          type="button"
          key={t.id}
          className={`scrapbook-template ${selected === t.id ? "selected" : ""}`}
          onClick={() => onSelect(t.id)}
          aria-label={`${preview ? "Preview" : "Choose"} ${t.name}`}
          aria-pressed={selected === t.id}
        >
          <span className="template-art">
            <img src={templateThumbnail(t.id)} alt="" />
            {selected === t.id ? (
              <Check size={16} />
            ) : preview ? (
              <ArrowUpRight size={16} />
            ) : null}
          </span>
          <strong>{t.name}</strong>
          <span>{t.description}</span>
        </button>
      ))}
    </div>
  );
}
