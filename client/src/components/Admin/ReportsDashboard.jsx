import React, { useEffect, useState } from 'react';
import { BarChart3, Download, AlertTriangle, Filter } from 'lucide-react';

export default function ReportsDashboard() {
    const [examIds, setExamIds] = useState([]);
    const [examId, setExamId] = useState('');
    const [mode, setMode] = useState('exam');
    const [department, setDepartment] = useState('');
    const [userName, setUserName] = useState('');
    const [rows, setRows] = useState([]);
    const [weak, setWeak] = useState([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        fetch('/api/admin/reports/exam-ids').then(r => r.json()).then(setExamIds).catch(() => {});
    }, []);

    const load = async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams({ mode, limit: '200' });
            if (examId) params.set('examId', examId);
            if (department) params.set('department', department);
            if (userName) params.set('userName', userName);
            const [recs, w] = await Promise.all([
                fetch(`/api/admin/reports/records?${params}`).then(r => r.json()),
                fetch(`/api/admin/reports/weak-items?${examId ? `examId=${encodeURIComponent(examId)}&` : ''}limit=15`).then(r => r.json())
            ]);
            setRows(Array.isArray(recs) ? recs : []);
            setWeak(Array.isArray(w) ? w : []);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); }, []);

    const exportCsv = () => {
        const params = new URLSearchParams({ mode });
        if (examId) params.set('examId', examId);
        window.open(`/api/admin/reports/export.csv?${params}`, '_blank');
    };

    const passRate = () => {
        if (!rows.length) return '—';
        const pass = rows.filter(r => {
            const total = r.paperTotal || 100;
            return (r.score / total) * 100 >= 60;
        }).length;
        return `${Math.round((pass / rows.length) * 100)}% (${pass}/${rows.length})`;
    };

    return (
        <div className="h-full flex flex-col bg-white">
            <div className="p-4 border-b bg-gray-50 flex items-center justify-between flex-wrap gap-2">
                <h2 className="text-lg font-bold flex items-center text-gray-800">
                    <BarChart3 className="w-5 h-5 mr-2 text-indigo-500" /> 成绩报表
                </h2>
                <div className="flex items-center gap-2 text-xs text-gray-500">
                    <span>通过率(≥60%)：<b className="text-indigo-600">{passRate()}</b></span>
                    <button onClick={exportCsv} className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 text-white rounded-lg font-bold">
                        <Download className="w-3.5 h-3.5" /> 导出 CSV
                    </button>
                </div>
            </div>

            <div className="p-3 border-b flex flex-wrap gap-2 items-end bg-white">
                <label className="text-xs text-gray-500">
                    试卷（含已删除）
                    <select value={examId} onChange={e => setExamId(e.target.value)} className="block mt-1 border rounded-lg px-2 py-1.5 text-sm min-w-[200px]">
                        <option value="">全部卷宗</option>
                        {examIds.map(e => (
                            <option key={e.id} value={e.id}>
                                {e.examName}{e.deleted ? ' [已删卷]' : ''} ({e.recordCount})
                            </option>
                        ))}
                    </select>
                </label>
                <label className="text-xs text-gray-500">
                    模式
                    <select value={mode} onChange={e => setMode(e.target.value)} className="block mt-1 border rounded-lg px-2 py-1.5 text-sm">
                        <option value="exam">正式考核</option>
                        <option value="practice">练习</option>
                        <option value="all">全部</option>
                    </select>
                </label>
                <label className="text-xs text-gray-500">
                    部门
                    <input value={department} onChange={e => setDepartment(e.target.value)} className="block mt-1 border rounded-lg px-2 py-1.5 text-sm" placeholder="模糊" />
                </label>
                <label className="text-xs text-gray-500">
                    姓名
                    <input value={userName} onChange={e => setUserName(e.target.value)} className="block mt-1 border rounded-lg px-2 py-1.5 text-sm" placeholder="模糊" />
                </label>
                <button onClick={load} className="flex items-center gap-1 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold">
                    <Filter className="w-4 h-4" /> 查询
                </button>
            </div>

            <div className="flex-1 flex min-h-0">
                <div className="flex-1 overflow-auto p-4">
                    {loading ? <div className="text-gray-400 text-sm">加载中…</div> : (
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-left text-gray-500 border-b sticky top-0 bg-white">
                                    <th className="pb-2 pr-2">时间</th>
                                    <th className="pb-2 pr-2">姓名</th>
                                    <th className="pb-2 pr-2">部门</th>
                                    <th className="pb-2 pr-2">试卷</th>
                                    <th className="pb-2 pr-2">分数</th>
                                    <th className="pb-2 pr-2">模式</th>
                                    <th className="pb-2">用时</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map(r => (
                                    <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50">
                                        <td className="py-2 pr-2 text-xs text-gray-500 whitespace-nowrap">
                                            {r.completedAt ? new Date(r.completedAt).toLocaleString() : '—'}
                                        </td>
                                        <td className="py-2 pr-2 font-medium">{r.userName}</td>
                                        <td className="py-2 pr-2 text-gray-600">{r.department || '—'}</td>
                                        <td className="py-2 pr-2">
                                            <span className="text-xs">{r.examName || r.examId}</span>
                                            {r.examDeleted && (
                                                <span className="ml-1 text-[10px] bg-amber-100 text-amber-700 px-1 rounded">卷已删</span>
                                            )}
                                        </td>
                                        <td className="py-2 pr-2 font-bold text-emerald-600">
                                            {r.score}{r.paperTotal != null ? ` / ${r.paperTotal}` : ''}
                                        </td>
                                        <td className="py-2 pr-2">
                                            <span className={`text-[10px] px-1.5 py-0.5 rounded ${r.mode === 'practice' ? 'bg-sky-100 text-sky-700' : 'bg-indigo-100 text-indigo-700'}`}>
                                                {r.mode === 'practice' ? '练习' : '考核'}
                                            </span>
                                        </td>
                                        <td className="py-2 text-xs text-gray-500">
                                            {r.duration != null ? `${Math.round(r.duration / 1000)}s` : '—'}
                                        </td>
                                    </tr>
                                ))}
                                {!rows.length && (
                                    <tr><td colSpan={7} className="py-12 text-center text-gray-400">无记录（删除试卷后成绩仍在此可查）</td></tr>
                                )}
                            </tbody>
                        </table>
                    )}
                </div>

                <div className="w-64 border-l p-4 overflow-y-auto bg-gray-50">
                    <h3 className="text-sm font-bold text-gray-700 mb-3 flex items-center">
                        <AlertTriangle className="w-4 h-4 mr-1 text-amber-500" /> 知识薄弱 Top
                    </h3>
                    <p className="text-[10px] text-gray-400 mb-3">仅统计遗漏 unfound（不含容错误点 miss）。完整分析见「学情分析」。</p>
                    {weak.length === 0 ? (
                        <p className="text-xs text-gray-400">暂无知识遗漏数据。完成正式考核后出现。</p>
                    ) : weak.map((w, i) => (
                        <div key={w.key} className="mb-2 p-2 bg-white rounded-lg border text-xs">
                            <div className="flex justify-between font-bold text-gray-700">
                                <span>#{i + 1}</span>
                                <span className="text-red-500">{w.count} 次遗漏</span>
                            </div>
                            <div className="text-gray-600 mt-1 break-all">{w.label || w.clauseId || w.key}</div>
                            {w.unfoundRate != null && (
                                <div className="text-[10px] text-amber-600 mt-0.5">遗漏率 {(w.unfoundRate * 100).toFixed(0)}%</div>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
