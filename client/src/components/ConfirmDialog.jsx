import React from 'react';

export default function ConfirmDialog({ open, title, message, confirmText = '确认', cancelText = '取消', danger, onConfirm, onCancel }) {
    if (!open) return null;
    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
            <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-6 space-y-4">
                <h3 className="text-lg font-black text-gray-900">{title}</h3>
                <p className="text-sm text-gray-600 whitespace-pre-line leading-relaxed">{message}</p>
                <div className="flex gap-3 justify-end">
                    <button type="button" onClick={onCancel} className="px-4 py-2 rounded-xl text-sm font-bold text-gray-600 bg-gray-100 hover:bg-gray-200">
                        {cancelText}
                    </button>
                    <button
                        type="button"
                        onClick={onConfirm}
                        className={`px-4 py-2 rounded-xl text-sm font-bold text-white ${danger ? 'bg-red-600 hover:bg-red-500' : 'bg-indigo-600 hover:bg-indigo-500'}`}
                    >
                        {confirmText}
                    </button>
                </div>
            </div>
        </div>
    );
}
