import * as Dialog from "@radix-ui/react-dialog";
import * as Dropdown from "@radix-ui/react-dropdown-menu";
import { X, MoreHorizontal, Check, AlertCircle } from "lucide-react";
import { useState, type ReactNode, type FormEvent } from "react";
import { useApp } from "../stores/app";
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={(value) => !value && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="modal-overlay" />
        <Dialog.Content
          className={`modal ${wide ? "modal-wide" : ""}`}
          aria-describedby={description ? "dialog-description" : undefined}
        >
          <div className="modal-heading">
            <div>
              <Dialog.Title>{title}</Dialog.Title>
              {description && (
                <Dialog.Description id="dialog-description">
                  {description}
                </Dialog.Description>
              )}
            </div>
            <Dialog.Close className="icon-button" aria-label="Close dialog">
              <X size={19} />
            </Dialog.Close>
          </div>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
export function Menu({
  items,
  label = "More options",
}: {
  items: {
    label: string;
    icon?: ReactNode;
    action: () => void;
    danger?: boolean;
    disabled?: boolean;
  }[];
  label?: string;
}) {
  return (
    <Dropdown.Root>
      <Dropdown.Trigger
        className="icon-button menu-trigger"
        aria-label={label}
        title={label}
      >
        <MoreHorizontal size={20} />
      </Dropdown.Trigger>
      <Dropdown.Portal>
        <Dropdown.Content className="dropdown" sideOffset={6} align="end">
          {items.map((item, i) => (
            <Dropdown.Item
              key={i}
              className={item.danger ? "danger" : ""}
              disabled={item.disabled}
              onSelect={item.action}
            >
              {item.icon}
              {item.label}
            </Dropdown.Item>
          ))}
        </Dropdown.Content>
      </Dropdown.Portal>
    </Dropdown.Root>
  );
}
export function Confirm({
  title,
  description,
  onConfirm,
  onClose,
  label = "Delete",
}: {
  title: string;
  description: string;
  onConfirm: () => Promise<void>;
  onClose: () => void;
  label?: string;
}) {
  const [busy, setBusy] = useState(false);
  const notify = useApp((s) => s.notify);
  return (
    <Modal
      open
      onClose={() => !busy && onClose()}
      title={title}
      description={description}
    >
      <div className="modal-actions">
        <button className="button secondary" disabled={busy} onClick={onClose}>
          Cancel
        </button>
        <button
          className="button destructive"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void onConfirm()
              .then(onClose)
              .catch((e) => {
                notify(errorMessage(e), true);
                setBusy(false);
              });
          }}
        >
          {busy ? "Working…" : label}
        </button>
      </div>
    </Modal>
  );
}
export function NameDialog({
  title,
  initial,
  onSave,
  onClose,
}: {
  title: string;
  initial: string;
  onSave: (value: string) => Promise<void>;
  onClose: () => void;
}) {
  const [value, setValue] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    void onSave(value.trim())
      .then(onClose)
      .catch((e) => {
        setError(errorMessage(e));
        setBusy(false);
      });
  }
  return (
    <Modal open onClose={onClose} title={title}>
      <form onSubmit={submit}>
        <label className="field">
          Name
          <input
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            maxLength={120}
            required
          />
        </label>
        {error && <p className="form-error">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="button secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="button primary" disabled={busy || !value.trim()}>
            Save changes
          </button>
        </div>
      </form>
    </Modal>
  );
}
export function Toast() {
  const toast = useApp((s) => s.toast);
  return (
    <div className="toast-region" role="status" aria-live="polite">
      {toast && (
        <div
          key={toast.id}
          className={`toast ${toast.error ? "toast-error" : ""}`}
        >
          {toast.error ? <AlertCircle size={18} /> : <Check size={18} />}
          <span>{toast.message}</span>
        </div>
      )}
    </div>
  );
}
export function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Something went wrong. Please try again.";
}
export async function perform(
  action: () => Promise<unknown>,
  success?: string,
) {
  try {
    await action();
    if (success) useApp.getState().notify(success);
  } catch (e) {
    useApp.getState().notify(errorMessage(e), true);
  }
}
