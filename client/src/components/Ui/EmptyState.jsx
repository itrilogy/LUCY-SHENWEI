import React from 'react';

export function EmptyState({ title, hint, action, onAction, actionClass = 'btn btn-primary' }) {
  return (
    <div className="empty-panel">
      <strong>{title}</strong>
      {hint && <span>{hint}</span>}
      {action && onAction && (
        <button type="button" className={actionClass} style={{ marginTop: 8 }} onClick={onAction}>
          {action}
        </button>
      )}
    </div>
  );
}

export function LoadingState({ label = '加载中…' }) {
  return (
    <div className="empty-panel" role="status">
      <span>{label}</span>
    </div>
  );
}

export function ErrorState({ title = '暂时不可达', hint, onRetry }) {
  return (
    <EmptyState
      title={title}
      hint={hint || '可重试，或查看上次操作是否已保存。'}
      action={onRetry ? '重试' : undefined}
      onAction={onRetry}
      actionClass="btn btn-secondary"
    />
  );
}

export function ChartFootnote({ children }) {
  return <p className="chart-note">{children}</p>;
}
