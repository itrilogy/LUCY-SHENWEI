import React, { useEffect } from 'react';
import { X } from 'lucide-react';

const OVERLAY = 'fixed inset-0 z-[100] flex items-center justify-center bg-[color-mix(in_oklab,var(--bg-page)_20%,black)]/55 backdrop-blur-sm p-4';
const CARD = 'luxi-card shadow-lg w-full max-h-[92vh] overflow-y-auto relative bg-raised';

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
            className="btn btn-ghost absolute top-3 right-3 z-10 w-8 h-8 p-0"
            aria-label="关闭"
          >
            <X className="w-4 h-4" />
          </button>
        )}
        {children}
      </Tag>
    </div>
  );
}

export { OVERLAY, CARD };
