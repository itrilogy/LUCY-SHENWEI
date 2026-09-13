import React, { useEffect } from 'react';

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmText = '确认',
  cancelText = '取消',
  danger,
  onConfirm,
  onCancel,
}) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onCancel?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-[color-mix(in_oklab,var(--bg-page)_20%,black)]/55 backdrop-blur-sm p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        className="luxi-card shadow-lg max-w-md w-full p-6 space-y-4 bg-raised"
      >
        <h3 id="confirm-title" className="text-[17px] font-semibold text-fg">{title}</h3>
        <p className="text-sm text-secondary whitespace-pre-line leading-relaxed">{message}</p>
        {danger && (
          <p className="text-xs text-muted">此操作需二次确认。系统保留备份，删除记录可从备份恢复。</p>
        )}
        <div className="flex gap-2 justify-end">
          <button type="button" onClick={onCancel} className="btn btn-secondary">
            {cancelText}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={danger ? 'btn btn-danger' : 'btn btn-primary'}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
