import { useState } from "react";
import { Modal, errorMessage } from "../../components/ui";
import { TemplateChoices } from "./TemplateChoices";
import { Select } from "../../components/Select";
import { PageDialog } from "../pages/PageDialog";
import { repository } from "../../lib/database/repository";
import type { Notebook } from "../../types";
import type { TemplateId } from "./types";
export default function StartCreativeDialog({
  notebooks,
  onClose,
  onOpen,
}: {
  notebooks: Notebook[];
  onClose: () => void;
  onOpen: (bookId: string, pageId?: string) => Promise<void>;
}) {
  const [template, setTemplate] = useState<TemplateId>("organized-chaos");
  const [book, setBook] = useState(notebooks[0]?.id ?? "new");
  const [pageDialog, setPageDialog] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (pageDialog)
    return (
      <PageDialog
        notebookId={pageDialog}
        initialTemplate={template}
        onClose={onClose}
        onCreated={async (page) => {
          await onOpen(page.notebookId, page.id);
        }}
      />
    );
  return (
    <Modal
      open
      onClose={onClose}
      title="Start a scrapbook page"
      description="Four layouts. Plenty of room to make them your own."
      wide
    >
      <TemplateChoices selected={template} onSelect={setTemplate} />
      <label className="field">
        Add to notebook
        <Select
          label="Add to notebook"
          value={book}
          onValueChange={setBook}
          options={[
            ...notebooks.map((b) => ({ value: b.id, label: b.title })),
            { value: "new", label: "Create a scrapbook notebook" },
          ]}
        />
      </label>
      {error && <p className="form-error">{error}</p>}
      <div className="modal-actions">
        <button className="button secondary" onClick={onClose}>
          Cancel
        </button>
        <button
          className="button primary"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void (async () => {
              const id =
                book === "new"
                  ? (
                      await repository.createNotebook(
                        "Scrapbook",
                        "#d8cdeb",
                        "✦",
                      )
                    ).id
                  : book;
              setPageDialog(id);
            })().catch((e) => {
              setError(errorMessage(e));
              setBusy(false);
            });
          }}
        >
          Continue
        </button>
      </div>
    </Modal>
  );
}
