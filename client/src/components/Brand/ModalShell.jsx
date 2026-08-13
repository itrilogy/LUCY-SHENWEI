import React, { useEffect } from 'react';

const OVERLAY = 'fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4';
const CARD = 'bg-white rounded-3xl shadow-2xl w-full max-h-[92vh] overflow-y-auto relative';

/** Shared chrome for login / declaration / other dialogs. */
export default function ModalShell({
  open = true,
  onClose,
  maxWidth = 'max-w-md',
  labelledBy,
  children,
  as = 'div',
  onSubmit,
}) {
  useEffect(() => {
    if (!open || !onClose) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const Tag = as;
  return (
    <div className={OVERLAY} onClick={onClose || undefined}>
      <Tag
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className={`${CARD} ${maxWidth} ${as === 'form' ? 'p-8 space-y-4' : ''}`}
        onClick={(e) => e.stopPropagation()}
        onSubmit={onSubmit}
      >
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 right-4 z-10 w-8 h-8 rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100"
            aria-label="关闭"
          >
            ✕
          </button>
        )}
        {children}
      </Tag>
    </div>
  );
}

export { OVERLAY, CARD };
