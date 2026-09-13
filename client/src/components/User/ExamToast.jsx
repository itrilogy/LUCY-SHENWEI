import React from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';

export default function ExamToast({ toast }) {
    if (!toast?.show) return null;
    const ok = toast.type === 'success';
    return (
        <div
            role="status"
            className={`fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[1000] px-6 py-4 rounded-[10px] shadow-md flex flex-col items-center space-y-2 min-w-[240px] border text-white
            ${ok ? 'bg-[var(--state-up)] border-[var(--state-up)]' : 'bg-[var(--alert-red)] border-[var(--alert-red)]'}`}
        >
            {ok ? <CheckCircle2 className="w-8 h-8" /> : <AlertTriangle className="w-8 h-8" />}
            <span className="text-sm font-medium tracking-wide text-center">{toast.message}</span>
        </div>
    );
}
