import React, { useEffect, useState } from 'react';
import { ScrollText } from 'lucide-react';

export default function AuditDashboard() {
    const [rows, setRows] = useState([]);
    const [error, setError] = useState('');

    const load = async () => {
        try {
            const res = await fetch('/api/admin/audit?limit=300');
            if (!res.ok) throw new Error('无权查看或加载失败');
            setRows(await res.json());
            setError('');
        } catch (e) {
            setError(e.message);
        }
    };

    useEffect(() => { load(); }, []);

    return (
        <div className="h-full flex flex-col bg-white">
            <div className="p-4 border-b bg-gray-50 flex justify-between items-center">
                <h2 className="text-lg font-bold flex items-center text-gray-800">
                    <ScrollText className="w-5 h-5 mr-2 text-indigo-500" /> 操作审计
                </h2>
                <button type="button" onClick={load} className="text-sm text-indigo-600 font-bold">刷新</button>
            </div>
            {error && <p className="p-4 text-sm text-red-500">{error}</p>}
            <div className="flex-1 overflow-auto p-4">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="text-left text-gray-500 border-b">
                            <th className="pb-2 pr-2">时间</th>
                            <th className="pb-2 pr-2">操作者</th>
                            <th className="pb-2 pr-2">动作</th>
                            <th className="pb-2 pr-2">对象</th>
                            <th className="pb-2">详情</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((r) => (
                            <tr key={r.id} className="border-b border-gray-50">
                                <td className="py-2 pr-2 text-xs text-gray-500 whitespace-nowrap">
                                    {r.created_at ? new Date(r.created_at).toLocaleString() : '—'}
                                </td>
                                <td className="py-2 pr-2">{r.username || '—'}</td>
                                <td className="py-2 pr-2 font-mono text-xs">{r.action}</td>
                                <td className="py-2 pr-2 text-xs break-all">{r.target || '—'}</td>
                                <td className="py-2 text-xs text-gray-500 break-all max-w-md">{r.detail || ''}</td>
                            </tr>
                        ))}
                        {!rows.length && !error && (
                            <tr><td colSpan={5} className="py-12 text-center text-gray-400">暂无审计记录</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
