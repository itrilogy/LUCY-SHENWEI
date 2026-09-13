import React, { useEffect, useState } from 'react';
import { ScrollText } from 'lucide-react';
import { EmptyState, ErrorState, LoadingState } from '../Ui/EmptyState';

export default function AuditDashboard() {
    const [rows, setRows] = useState([]);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(true);

    const load = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/admin/audit?limit=300');
            if (!res.ok) throw new Error('无权查看或加载失败');
            setRows(await res.json());
            setError('');
        } catch (e) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); }, []);

    return (
        <div className="h-full flex flex-col bg-raised">
            <div className="p-4 border-b border-line bg-sunken flex justify-between items-center">
                <h2 className="text-[17px] font-semibold flex items-center text-fg">
                    <ScrollText className="w-5 h-5 mr-2 text-accent" /> 操作审计
                </h2>
                <button type="button" onClick={load} className="btn btn-secondary btn-sm">刷新</button>
            </div>
            {error && (
                <ErrorState title="审计服务暂时不可达" hint={error} onRetry={load} />
            )}
            <div className="flex-1 overflow-auto p-4">
                {loading && !rows.length && !error ? (
                    <LoadingState label="正在拉取审计记录…" />
                ) : !error && (
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="text-left text-muted border-b border-line">
                                <th className="pb-2 pr-2 font-mono text-[11px] uppercase tracking-wide">时间</th>
                                <th className="pb-2 pr-2 font-mono text-[11px] uppercase tracking-wide">操作者</th>
                                <th className="pb-2 pr-2 font-mono text-[11px] uppercase tracking-wide">动作</th>
                                <th className="pb-2 pr-2 font-mono text-[11px] uppercase tracking-wide">对象</th>
                                <th className="pb-2 font-mono text-[11px] uppercase tracking-wide">详情</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((r) => (
                                <tr key={r.id} className="border-b border-subtle">
                                    <td className="py-2 pr-2 text-xs text-muted whitespace-nowrap font-mono">
                                        {r.created_at ? new Date(r.created_at).toLocaleString() : '—'}
                                    </td>
                                    <td className="py-2 pr-2">{r.username || '—'}</td>
                                    <td className="py-2 pr-2 font-mono text-xs">{r.action}</td>
                                    <td className="py-2 pr-2 text-xs break-all">{r.target || '—'}</td>
                                    <td className="py-2 text-xs text-muted break-all max-w-md">{r.detail || ''}</td>
                                </tr>
                            ))}
                            {!rows.length && !error && (
                                <tr>
                                    <td colSpan={5}>
                                        <EmptyState title="暂无审计记录" hint="下一步：在管理端执行标注、组卷或人员变更后刷新。" />
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}
