import React from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';

export default function ExamToast({ toast }) {
    if (!toast?.show) return null;
    return (
        <div className={`fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-[100] px-8 py-4 rounded-2xl shadow-3xl flex flex-col items-center space-y-3 min-w-[280px] border-2 backdrop-blur-md
            ${toast.type === 'success' ? 'bg-emerald-500/90 text-white border-emerald-400' : 'bg-red-500/90 text-white border-red-400'}`}>
            {toast.type === 'success' ? <CheckCircle2 className="w-10 h-10" /> : <AlertTriangle className="w-10 h-10" />}
            <span className="text-base font-black tracking-wide text-center">{toast.message}</span>
        </div>
    );
}
