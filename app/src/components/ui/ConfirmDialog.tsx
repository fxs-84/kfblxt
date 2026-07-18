import { useEffect, useState } from "react";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** 危险操作:按钮变红 */
  danger?: boolean;
  /** 要求输入确认文字才能点确定 */
  requireText?: string;
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
}

/**
 * 通用二次确认对话框。
 * 用于删除、不可逆操作前最后一道防线。
 */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "确认",
  cancelLabel = "取消",
  danger = false,
  requireText,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setTyped("");
      setBusy(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const canConfirm = !requireText || typed === requireText;

  const handleConfirm = async () => {
    if (!canConfirm || busy) return;
    setBusy(true);
    try {
      await onConfirm();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="modal-card"
        onClick={(e) => e.stopPropagation()}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-message"
      >
        <header className="modal-card__head">
          <h2 id="confirm-dialog-title" className="modal-card__title">{title}</h2>
          <button type="button" className="modal-card__close" onClick={onClose} aria-label="关闭">×</button>
        </header>
        <div className="modal-card__body">
          <p id="confirm-dialog-message" style={{ margin: 0, lineHeight: 1.6 }}>{message}</p>
          {requireText && (
            <div className="field">
              <label htmlFor="confirm-typed">输入 <code>{requireText}</code> 以确认</label>
              <input
                id="confirm-typed"
                type="text"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                autoFocus
                autoComplete="off"
              />
            </div>
          )}
        </div>
        <footer className="modal-card__foot">
          <button type="button" className="btn btn--ghost" onClick={onClose} disabled={busy}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`btn ${danger ? "btn--danger" : "btn--primary"}`}
            onClick={handleConfirm}
            disabled={!canConfirm || busy}
          >
            {busy ? "处理中…" : confirmLabel}
          </button>
        </footer>
      </div>
    </div>
  );
}
