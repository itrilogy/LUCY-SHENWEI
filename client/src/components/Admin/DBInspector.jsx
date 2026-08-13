import React, { useState, useEffect } from 'react';
import { Database, Search, Trash2, AlertCircle, CheckCircle2 } from 'lucide-react';
import ConfirmDialog from '../ConfirmDialog';

export default function DBInspector() {
    const [selectedTable, setSelectedTable] = useState('assets');
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [cleanupStatus, setCleanupStatus] = useState(null);
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [hygieneConfirm, setHygieneConfirm] = useState(null);
    const [backups, setBackups] = useState([]);
    const [opsMsg, setOpsMsg] = useState('');

    const tables = [
        'assets', 'annotations', 'exams', 'exam_items', 'records',
        'knowledge_scenes', 'knowledge_categories', 'knowledge_items',
        'risk_dictionary', '_legacy_knowledge',
        'organizations', 'departments', 'users', 'user_profiles',
        'attempt_stats', 'knowledge_error_facts', 'exam_attempts', 'audit_log'
    ];

    const fetchData = async () => {
        try {
            setLoading(true);
            setData([]); // 在抓取新数据前先清空旧数据，防止 UI 错位
            const res = await fetch(`/api/admin/db/query/${selectedTable}`);
            if (res.ok) {
                const json = await res.json();
                setData(json);
            } else {
                console.error('API 返回错误状态:', res.status);
            }
        } catch (e) {
            console.error('Fetch error:', e);
        } finally {
            setLoading(false);
        }
    };

    const refreshBackups = () => {
        fetch('/api/admin/backup').then((r) => r.ok ? r.json() : []).then(setBackups).catch(() => {});
    };

    useEffect(() => { refreshBackups(); }, []);

    const handleCleanup = async () => {
        setConfirmOpen(true);
    };

    const doCleanup = async () => {
        setConfirmOpen(false);
        try {
            const res = await fetch('/api/admin/cleanup', { method: 'POST' });
            const result = await res.json();
            setCleanupStatus(result.message);
            setTimeout(() => setCleanupStatus(null), 5000);
        } catch (e) {
            setCleanupStatus('清理失败');
        }
    };

    useEffect(() => {
        fetchData();
    }, [selectedTable]);

    return (
        <div className="flex flex-col h-full bg-gray-50">
            {/* Header */}
            <div className="bg-white border-b px-6 py-4 flex items-center justify-between shadow-sm">
                <div className="flex items-center space-x-4">
                    <div className="bg-indigo-600 p-2 rounded-lg">
                        <Database className="w-5 h-5 text-white" />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold text-gray-900">数据库结构化巡检</h1>
                        <p className="text-xs text-gray-500">验证 SQLite 表数据并清理旧有 JSON 碎片</p>
                    </div>
                </div>

                <div className="flex items-center space-x-4">
                    <select
                        value={selectedTable}
                        onChange={(e) => setSelectedTable(e.target.value)}
                        className="bg-gray-100 border-none rounded-lg px-4 py-2 text-sm font-medium text-gray-700 focus:ring-2 focus:ring-indigo-500 outline-none"
                    >
                        {tables.map(t => <option key={t} value={t}>数据表: {t}</option>)}
                    </select>
                    <button
                        onClick={handleCleanup}
                        className="flex items-center px-4 py-2 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg text-sm font-bold transition-colors border border-red-200"
                    >
                        <Trash2 className="w-4 h-4 mr-2" />
                        清理冗余 JSON
                    </button>
                </div>
            </div>

            <div className="px-6 pt-4 flex flex-wrap gap-3 items-center text-sm">
                <button
                    type="button"
                    onClick={async () => {
                        const r = await fetch('/api/admin/backup', { method: 'POST' });
                        const d = await r.json();
                        setOpsMsg(r.ok ? `已生成 ${d.fileName}` : (d.error || '备份失败'));
                        refreshBackups();
                    }}
                    className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg font-bold"
                >
                    备份库+图片
                </button>
                <button
                    type="button"
                    onClick={async () => {
                        const prev = await fetch('/api/admin/hygiene').then((r) => r.json());
                        const nA = prev.duplicateAssets?.length || 0;
                        const nR = prev.orphanRecords?.length || 0;
                        if (!nA && !nR && !prev.orphanAttemptStats && !prev.orphanFacts) {
                            setOpsMsg('没有需要清理的重复图或失效成绩/学情');
                            return;
                        }
                        setHygieneConfirm({ nA, nR, stats: prev.orphanAttemptStats, facts: prev.orphanFacts });
                    }}
                    className="px-3 py-1.5 bg-amber-600 text-white rounded-lg font-bold"
                >
                    清理重复图与失效学情
                </button>
                <label className="px-3 py-1.5 border rounded-lg font-bold cursor-pointer">
                    导入题库 zip
                    <input type="file" accept=".zip" className="hidden" onChange={async (e) => {
                        const f = e.target.files?.[0];
                        if (!f) return;
                        const fd = new FormData();
                        fd.append('file', f);
                        const r = await fetch('/api/admin/bank/import', { method: 'POST', body: fd });
                        const d = await r.json();
                        setOpsMsg(r.ok ? `导入成功：卷 ${d.exams} / 图 ${d.assets}` : (d.error || '导入失败'));
                        e.target.value = '';
                    }} />
                </label>
                {backups.slice(0, 3).map((b) => (
                    <a key={b.fileName} className="text-xs text-indigo-600 underline" href={`/api/admin/backup/download/${encodeURIComponent(b.fileName)}`}>{b.fileName}</a>
                ))}
                {opsMsg && <span className="text-xs text-gray-500">{opsMsg}</span>}
            </div>

            {/* Status Message */}
            {cleanupStatus && (
                <div className="mx-6 mt-4 p-4 bg-green-50 border border-green-200 rounded-xl flex items-center text-green-700 animate-pulse">
                    <CheckCircle2 className="w-5 h-5 mr-3" />
                    <span className="font-medium">{cleanupStatus}</span>
                </div>
            )}

            {/* Data Table */}
            <div className="flex-1 overflow-auto p-6">
                <div className="bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden">
                    {loading ? (
                        <div className="p-20 text-center text-gray-400">数据加载中...</div>
                    ) : data.length === 0 ? (
                        <div className="p-20 text-center text-gray-400 flex flex-col items-center">
                            <AlertCircle className="w-12 h-12 mb-4 opacity-20" />
                            该表中暂无任何记录
                        </div>
                    ) : (
                        <table className="w-full text-left border-collapse">
                            <thead className="bg-gray-50 border-b border-gray-200">
                                <tr>
                                    {Object.keys(data[0]).map(key => (
                                        <th key={key} className="px-6 py-4 text-xs font-black text-gray-500 uppercase tracking-wider">{key}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {data.map((row, i) => (
                                    <tr key={i} className="hover:bg-indigo-50/30 transition-colors">
                                        {Object.values(row).map((val, j) => (
                                            <td key={j} className="px-6 py-4 text-sm text-gray-600 font-mono truncate max-w-[250px]" title={String(val)}>
                                                {typeof val === 'object' ? JSON.stringify(val) : String(val)}
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
                <p className="mt-4 text-center text-xs text-gray-400">
                    仅显示前 100 条记录记录。如有更多需求请通过后端日志查询。
                </p>
            </div>
            <ConfirmDialog
                open={confirmOpen}
                title="清理冗余 JSON"
                message="此操作将永久删除服务器上冗余的 JSON 数据文件，请确保 SQLite 数据库内容已通过验证。"
                danger
                onCancel={() => setConfirmOpen(false)}
                onConfirm={doCleanup}
            />
            <ConfirmDialog
                open={!!hygieneConfirm}
                title="清理重复图与失效学情"
                message={hygieneConfirm
                    ? `将删除：重复未标注图 ${hygieneConfirm.nA} 张、已删试卷遗留成绩 ${hygieneConfirm.nR} 条，并清无主学情物化。此操作不可撤销。`
                    : ''}
                danger
                onCancel={() => setHygieneConfirm(null)}
                onConfirm={async () => {
                    setHygieneConfirm(null);
                    const r = await fetch('/api/admin/hygiene', { method: 'POST' });
                    const d = await r.json();
                    setOpsMsg(r.ok
                        ? `已清理重复图 ${d.assets?.count || 0}、失效成绩 ${d.scores?.records || 0}`
                        : (d.error || '清理失败'));
                    fetchData();
                }}
            />
        </div>
    );
}
