import React, { useEffect, useMemo, useState } from 'react';
import {
    Brain, Target, Users, Building2, Lightbulb,
    RefreshCw, AlertTriangle, TrendingUp, Play, RotateCcw, Filter
} from 'lucide-react';

/* ========== 轻量 SVG 图表 ========== */
function BarChart({ items, maxHint, color = '#4f46e5', height = 180, unit = '' }) {
    const data = (items || []).filter(i => i && (i.label != null));
    if (!data.length) {
        return <div className="h-40 flex items-center justify-center text-xs text-gray-400 border border-dashed rounded-xl">暂无图表数据</div>;
    }
    const maxV = Math.max(maxHint || 0, ...data.map(d => Number(d.value) || 0), 1);
    const barH = Math.max(12, Math.floor((height - 40) / data.length) - 6);
    const w = 320;
    const labelW = 100;
    const chartW = w - labelW - 40;

    return (
        <svg viewBox={`0 0 ${w} ${data.length * (barH + 6) + 10}`} className="w-full max-w-md">
            {data.map((d, i) => {
                const v = Number(d.value) || 0;
                const bw = (v / maxV) * chartW;
                const y = i * (barH + 6) + 4;
                return (
                    <g key={i}>
                        <text x={0} y={y + barH * 0.7} fontSize="10" fill="#6b7280">
                            {(d.label || '').length > 10 ? `${d.label.slice(0, 10)}…` : d.label}
                        </text>
                        <rect x={labelW} y={y} width={Math.max(bw, 2)} height={barH} rx="4" fill={color} opacity={0.85} />
                        <text x={labelW + Math.max(bw, 2) + 4} y={y + barH * 0.7} fontSize="10" fill="#374151" fontWeight="600">
                            {v}{unit}
                        </text>
                    </g>
                );
            })}
        </svg>
    );
}

function ColumnChart({ items, color = '#0ea5e9', height = 160 }) {
    const data = items || [];
    if (!data.length) {
        return <div className="h-40 flex items-center justify-center text-xs text-gray-400 border border-dashed rounded-xl">暂无图表数据</div>;
    }
    const maxV = Math.max(...data.map(d => Number(d.value) || 0), 1);
    const w = 320;
    const pad = 24;
    const gap = 12;
    const colW = (w - pad * 2 - gap * (data.length - 1)) / data.length;
    const chartH = height - 36;

    return (
        <svg viewBox={`0 0 ${w} ${height}`} className="w-full max-w-md">
            {data.map((d, i) => {
                const v = Number(d.value) || 0;
                const h = (v / maxV) * chartH;
                const x = pad + i * (colW + gap);
                const y = 8 + chartH - h;
                return (
                    <g key={i}>
                        <rect x={x} y={y} width={colW} height={Math.max(h, 2)} rx="4" fill={color} opacity={0.9} />
                        <text x={x + colW / 2} y={y - 4} textAnchor="middle" fontSize="10" fill="#374151" fontWeight="700">{v}</text>
                        <text x={x + colW / 2} y={height - 8} textAnchor="middle" fontSize="10" fill="#6b7280">{d.label}</text>
                    </g>
                );
            })}
        </svg>
    );
}

function MetricCard({ label, value, sub, tone = 'indigo' }) {
    const tones = {
        indigo: 'from-indigo-500 to-indigo-600',
        emerald: 'from-emerald-500 to-emerald-600',
        sky: 'from-sky-500 to-sky-600',
        amber: 'from-amber-500 to-amber-600'
    };
    return (
        <div className={`rounded-2xl p-4 text-white bg-gradient-to-br ${tones[tone]} shadow-lg`}>
            <div className="text-xs opacity-80 font-medium">{label}</div>
            <div className="text-3xl font-black mt-1">{value}</div>
            {sub && <div className="text-[11px] opacity-80 mt-1">{sub}</div>}
        </div>
    );
}

function InsightLevel({ level }) {
    const map = {
        warn: 'bg-amber-100 text-amber-800 border-amber-200',
        tip: 'bg-sky-100 text-sky-800 border-sky-200',
        info: 'bg-gray-100 text-gray-700 border-gray-200'
    };
    return (
        <span className={`text-[10px] px-1.5 py-0.5 rounded border font-bold ${map[level] || map.info}`}>
            {level}
        </span>
    );
}

function buildDeptTreeOptions(depts, parentId = null, depth = 0, acc = []) {
    const nodes = depts
        .filter(d => (d.parent_id || null) === parentId)
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || String(a.name).localeCompare(String(b.name), 'zh'));
    for (const d of nodes) {
        const pad = depth === 0 ? '' : `${'　'.repeat(depth)}└ `;
        acc.push({ id: d.id, label: `${pad}${d.name}`, name: d.name, depth });
        buildDeptTreeOptions(depts, d.id, depth + 1, acc);
    }
    return acc;
}

const MODE_LABEL = {
    all: '全库分析',
    exam: '试卷分析',
    department: '部门分析',
    exam_department: '试卷 × 部门'
};

export default function AnalyticsDashboard() {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [exams, setExams] = useState([]);
    const [departments, setDepartments] = useState([]);

    // 筛选草稿（点「开始分析」才生效）
    const [draftExamId, setDraftExamId] = useState('');
    const [draftDeptId, setDraftDeptId] = useState('');
    const [includeChildren, setIncludeChildren] = useState(true);
    const [rangeDays, setRangeDays] = useState(0);
    const [dirty, setDirty] = useState(false);

    const [applied, setApplied] = useState({ examId: '', departmentId: '', includeChildren: true, rangeDays: 0 });
    const [tab, setTab] = useState('overview');

    const deptOptions = useMemo(() => buildDeptTreeOptions(departments), [departments]);

    useEffect(() => {
        fetch('/api/admin/analytics/filters')
            .then(r => r.json())
            .then(f => {
                setExams(f.exams || []);
                setDepartments(f.departments || []);
            })
            .catch(() => {});
        // 首屏全库分析
        runAnalysis({ examId: '', departmentId: '', includeChildren: true, rangeDays: 0 });
    }, []);

    const runAnalysis = async (override) => {
        const next = override || {
            examId: draftExamId,
            departmentId: draftDeptId,
            includeChildren,
            rangeDays
        };
        setLoading(true);
        setError('');
        try {
            const qs = new URLSearchParams({ mode: 'exam' });
            if (next.examId) qs.set('examId', next.examId);
            if (next.departmentId) qs.set('departmentId', next.departmentId);
            qs.set('includeChildren', next.includeChildren ? '1' : '0');
            if (next.rangeDays > 0) qs.set('from', String(Date.now() - next.rangeDays * 86400000));
            const res = await fetch(`/api/admin/analytics/overview?${qs}`);
            if (!res.ok) throw new Error('加载学情失败');
            const ov = await res.json();
            setData(ov);
            setApplied(next);
            setDirty(false);
        } catch (e) {
            setError(e.message || '加载失败');
        } finally {
            setLoading(false);
        }
    };

    const onDraftChange = (fn) => {
        fn();
        setDirty(true);
    };

    const resetFilters = () => {
        setDraftExamId('');
        setDraftDeptId('');
        setIncludeChildren(true);
        setRangeDays(0);
        setDirty(true);
        runAnalysis({ examId: '', departmentId: '', includeChildren: true, rangeDays: 0 });
    };

    const s = data?.summary || {};
    const insights = data?.insights || [];
    const L1 = data?.knowledge?.L1 || [];
    const L2 = data?.knowledge?.L2 || [];
    const L3 = data?.knowledge?.L3 || [];
    const users = data?.org?.users || [];
    const orgDepts = data?.org?.departments || [];
    const childDepts = data?.org?.childDepartments || [];
    const prof = data?.proficiency || {};
    const charts = data?.charts || {};
    const filter = data?.filter || {};
    const baseline = data?.baseline || {};

    const analysisMode = filter.analysisMode || 'all';

    return (
        <div className="h-full flex bg-white min-h-0">
            {/* ===== 左侧筛选面板 ===== */}
            <aside className="w-72 border-r flex flex-col bg-gray-50 flex-shrink-0">
                <div className="p-4 border-b bg-white">
                    <h2 className="text-lg font-bold flex items-center text-gray-800">
                        <Brain className="w-5 h-5 mr-2 text-indigo-500" /> 学情分析
                    </h2>
                    <p className="text-[11px] text-gray-500 mt-1">试卷 · 部门树 · 组合切片</p>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    <div>
                        <label className="text-xs font-bold text-gray-600 flex items-center mb-1.5">
                            <Filter className="w-3.5 h-3.5 mr-1" /> 试卷列表
                        </label>
                        <select
                            value={draftExamId}
                            onChange={e => onDraftChange(() => setDraftExamId(e.target.value))}
                            className="w-full border rounded-xl px-3 py-2 text-sm bg-white"
                        >
                            <option value="">全部试卷</option>
                            {exams.map(e => (
                                <option key={e.id} value={e.id}>
                                    {e.examName}{e.deleted ? ' [已删]' : ''} ({e.recordCount})
                                </option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="text-xs font-bold text-gray-600 flex items-center mb-1.5">
                            <Building2 className="w-3.5 h-3.5 mr-1" /> 部门列表（层级）
                        </label>
                        <select
                            value={draftDeptId}
                            onChange={e => onDraftChange(() => setDraftDeptId(e.target.value))}
                            className="w-full border rounded-xl px-3 py-2 text-sm bg-white font-mono"
                        >
                            <option value="">全部部门</option>
                            {deptOptions.map(d => (
                                <option key={d.id} value={d.id}>{d.label}</option>
                            ))}
                        </select>
                        <label className="mt-2 flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={includeChildren}
                                onChange={e => onDraftChange(() => setIncludeChildren(e.target.checked))}
                                className="rounded border-gray-300"
                            />
                            包含下级部门
                        </label>
                    </div>

                    <div>
                        <label className="text-xs font-bold text-gray-600 mb-1.5 block">时间窗</label>
                        <select
                            value={rangeDays}
                            onChange={e => onDraftChange(() => setRangeDays(Number(e.target.value)))}
                            className="w-full border rounded-xl px-3 py-2 text-sm bg-white"
                        >
                            <option value={0}>全部时间</option>
                            <option value={7}>近 7 天</option>
                            <option value={30}>近 30 天</option>
                            <option value={90}>近 90 天</option>
                        </select>
                    </div>

                    <div className="bg-white border rounded-xl p-3 text-xs text-gray-600 space-y-1">
                        <div className="font-bold text-gray-800 mb-1">当前切片预览</div>
                        <div>试卷：{draftExamId ? (exams.find(e => e.id === draftExamId)?.examName || draftExamId) : '全部'}</div>
                        <div>部门：{draftDeptId ? (departments.find(d => d.id === draftDeptId)?.name || draftDeptId) : '全部'}
                            {draftDeptId && includeChildren ? '（含下级）' : draftDeptId ? '（仅本级）' : ''}
                        </div>
                        <div className="text-indigo-600 font-bold pt-1">
                            模式：{MODE_LABEL[
                                draftExamId && draftDeptId ? 'exam_department'
                                    : draftExamId ? 'exam'
                                        : draftDeptId ? 'department' : 'all'
                            ]}
                        </div>
                    </div>

                    {dirty && (
                        <div className="text-[11px] text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-2 py-1.5">
                            筛选已变更，请点击「开始分析」
                        </div>
                    )}
                </div>

                <div className="p-4 border-t bg-white space-y-2">
                    <button
                        type="button"
                        disabled={loading}
                        onClick={() => runAnalysis()}
                        className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-300 text-white font-bold py-3 rounded-xl shadow"
                    >
                        <Play className="w-4 h-4" />
                        {loading ? '分析中…' : '开始分析'}
                    </button>
                    <button
                        type="button"
                        onClick={resetFilters}
                        className="w-full flex items-center justify-center gap-2 border border-gray-200 text-gray-600 font-bold py-2 rounded-xl text-sm hover:bg-gray-50"
                    >
                        <RotateCcw className="w-3.5 h-3.5" /> 重置筛选
                    </button>
                </div>
            </aside>

            {/* ===== 右侧结果 ===== */}
            <main className="flex-1 flex flex-col min-w-0 min-h-0">
                <div className="px-4 py-3 border-b flex flex-wrap items-center justify-between gap-2 bg-white">
                    <div className="text-sm text-gray-600">
                        {filter.analysisMode && (
                            <span className="inline-flex items-center gap-2">
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700">
                                    {MODE_LABEL[analysisMode] || analysisMode}
                                </span>
                                {filter.examName && <span>卷：{filter.examName}{filter.examDeleted ? ' [已删]' : ''}</span>}
                                {filter.departmentName && (
                                    <span>
                                        · 部门：{filter.departmentName}
                                        {filter.includeChildren && filter.expandedDeptCount > 1
                                            ? ` (+${filter.expandedDeptCount - 1} 下级)`
                                            : ''}
                                    </span>
                                )}
                            </span>
                        )}
                    </div>
                    <button type="button" onClick={() => runAnalysis(applied)} className="text-xs text-indigo-600 font-bold flex items-center gap-1">
                        <RefreshCw className="w-3.5 h-3.5" /> 刷新结果
                    </button>
                </div>

                <div className="px-4 pt-2 flex gap-1 border-b overflow-x-auto">
                    {[
                        { id: 'overview', label: '总览结论', icon: Lightbulb },
                        { id: 'charts', label: '图表看板', icon: TrendingUp },
                        { id: 'knowledge', label: '知识 L1/2/3', icon: Target },
                        { id: 'org', label: '组织对比', icon: Building2 },
                        { id: 'proficiency', label: '识别熟练度', icon: Users }
                    ].map(t => (
                        <button
                            key={t.id}
                            type="button"
                            onClick={() => setTab(t.id)}
                            className={`flex items-center gap-1 px-3 py-2 text-sm font-bold border-b-2 -mb-px whitespace-nowrap ${
                                tab === t.id ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500'
                            }`}
                        >
                            <t.icon className="w-4 h-4" /> {t.label}
                        </button>
                    ))}
                </div>

                <div className="flex-1 overflow-y-auto p-4">
                    {loading && <div className="text-gray-400 text-sm py-16 text-center">分析计算中…</div>}
                    {error && <div className="text-red-500 text-sm bg-red-50 p-3 rounded-xl mb-4">{error}</div>}

                    {!loading && data && (
                        <>
                            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
                                <MetricCard label="考核次数" value={s.attempts ?? 0} sub="正式 exam" tone="indigo" />
                                <MetricCard
                                    label="通过率"
                                    value={s.attempts ? `${(s.passRate * 100).toFixed(1)}%` : '—'}
                                    sub="得分率 ≥ 60%"
                                    tone="emerald"
                                />
                                <MetricCard
                                    label="平均得分率"
                                    value={s.attempts ? `${(s.avgScoreRate * 100).toFixed(1)}%` : '—'}
                                    sub={baseline.all && analysisMode !== 'all' && baseline.all.attempts
                                        ? `全库 ${(baseline.all.avgScoreRate * 100).toFixed(1)}%`
                                        : undefined}
                                    tone="sky"
                                />
                                <MetricCard
                                    label="平均 PRI"
                                    value={s.attempts ? s.avgPRI : '—'}
                                    sub={`人均无效点击 ${s.avgInvalidClicks ?? 0}`}
                                    tone="amber"
                                />
                            </div>

                            {/* 对照条 */}
                            {analysisMode !== 'all' && baseline.all?.attempts > 0 && s.attempts > 0 && (
                                <div className="mb-6 grid md:grid-cols-2 gap-3 text-xs">
                                    <CompareBar
                                        label="得分率 vs 全库"
                                        current={(s.avgScoreRate || 0) * 100}
                                        base={(baseline.all.avgScoreRate || 0) * 100}
                                        unit="%"
                                    />
                                    <CompareBar
                                        label="PRI vs 全库"
                                        current={s.avgPRI || 0}
                                        base={baseline.all.avgPRI || 0}
                                        unit=""
                                    />
                                </div>
                            )}

                            {tab === 'overview' && (
                                <div className="space-y-4">
                                    <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-4">
                                        <h3 className="font-bold text-indigo-900 flex items-center mb-2">
                                            <Lightbulb className="w-4 h-4 mr-1" /> 分析结论
                                        </h3>
                                        <p className="text-xs text-indigo-700/80 mb-3">
                                            知识薄弱仅 unfound；miss 归入 PRI。部门筛选默认含下级。
                                        </p>
                                        <div className="space-y-2">
                                            {insights.map((ins, i) => (
                                                <div key={i} className="bg-white rounded-xl border p-3 flex gap-2 items-start">
                                                    <InsightLevel level={ins.level} />
                                                    <p className="text-sm text-gray-700 flex-1">{ins.text}</p>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                    {L3.filter(x => x.unfound > 0).slice(0, 5).length > 0 && (
                                        <div>
                                            <h3 className="font-bold text-gray-800 mb-2 flex items-center">
                                                <AlertTriangle className="w-4 h-4 mr-1 text-amber-500" /> 知识薄弱 Top5
                                            </h3>
                                            <div className="grid gap-2">
                                                {L3.filter(x => x.unfound > 0).slice(0, 5).map((k, i) => (
                                                    <div key={k.id} className="flex items-center justify-between border rounded-xl px-3 py-2 text-sm">
                                                        <span className="font-medium">#{i + 1} {k.name}</span>
                                                        <span className="text-red-600 font-bold text-xs">
                                                            遗漏 {(k.unfoundRate * 100).toFixed(0)}% · n={k.exposure}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {tab === 'charts' && (
                                <div className="grid md:grid-cols-2 gap-6">
                                    <ChartCard title="PRI 熟练度分布">
                                        <ColumnChart items={charts.priBuckets} color="#f59e0b" />
                                    </ChartCard>
                                    <ChartCard title="得分率分桶">
                                        <ColumnChart items={charts.scoreBuckets} color="#10b981" />
                                    </ChartCard>
                                    <ChartCard title="L1 场景遗漏率 (%)">
                                        <BarChart items={charts.l1Unfound} color="#ef4444" unit="%" />
                                    </ChartCard>
                                    <ChartCard title="L3 严重度 Top">
                                        <BarChart items={charts.l3Severity} color="#8b5cf6" />
                                    </ChartCard>
                                    {(charts.childDeptPRI || []).length > 0 && (
                                        <ChartCard title={filter.departmentName ? '下级部门 PRI' : '各部门 PRI'} className="md:col-span-2">
                                            <BarChart items={charts.childDeptPRI} color="#0ea5e9" />
                                        </ChartCard>
                                    )}
                                </div>
                            )}

                            {tab === 'knowledge' && (
                                <div className="space-y-6">
                                    <section>
                                        <h3 className="font-bold mb-2">L1 场景</h3>
                                        <KnowledgeTable rows={L1} />
                                    </section>
                                    <section>
                                        <h3 className="font-bold mb-2">L2 大类</h3>
                                        <KnowledgeTable rows={L2} />
                                    </section>
                                    <section>
                                        <h3 className="font-bold mb-2">L3 细则</h3>
                                        <KnowledgeTable rows={L3} showPath />
                                    </section>
                                </div>
                            )}

                            {tab === 'org' && (
                                <div className="space-y-6">
                                    {childDepts.length > 0 && (
                                        <div>
                                            <h3 className="font-bold mb-2">直接下级部门拆解</h3>
                                            <table className="w-full text-sm mb-4">
                                                <thead>
                                                    <tr className="text-left text-gray-500 border-b">
                                                        <th className="pb-2">子部门</th>
                                                        <th className="pb-2">次数</th>
                                                        <th className="pb-2">PRI</th>
                                                        <th className="pb-2">得分率</th>
                                                        <th className="pb-2">通过率</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {childDepts.map(d => (
                                                        <tr key={d.departmentId} className="border-b border-gray-50">
                                                            <td className="py-2 font-medium">{d.departmentName}</td>
                                                            <td className="py-2">{d.attempts}</td>
                                                            <td className="py-2 font-bold text-amber-600">{d.avgPRI}</td>
                                                            <td className="py-2">{(d.avgScoreRate * 100).toFixed(1)}%</td>
                                                            <td className="py-2">{(d.passRate * 100).toFixed(1)}%</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                    <div className="grid lg:grid-cols-2 gap-6">
                                        <div>
                                            <h3 className="font-bold mb-2">部门汇总</h3>
                                            <table className="w-full text-sm">
                                                <thead>
                                                    <tr className="text-left text-gray-500 border-b">
                                                        <th className="pb-2">部门</th>
                                                        <th className="pb-2">人数</th>
                                                        <th className="pb-2">PRI</th>
                                                        <th className="pb-2">得分率</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {orgDepts.map(d => (
                                                        <tr key={d.departmentId || d.departmentName} className="border-b border-gray-50">
                                                            <td className="py-2 font-medium">{d.departmentName}</td>
                                                            <td className="py-2">{d.users}</td>
                                                            <td className="py-2 font-bold text-amber-600">{d.avgPRI}</td>
                                                            <td className="py-2">{(d.avgScoreRate * 100).toFixed(1)}%</td>
                                                        </tr>
                                                    ))}
                                                    {!orgDepts.length && (
                                                        <tr><td colSpan={4} className="py-8 text-center text-gray-400">暂无</td></tr>
                                                    )}
                                                </tbody>
                                            </table>
                                        </div>
                                        <div>
                                            <h3 className="font-bold mb-2">用户</h3>
                                            <table className="w-full text-sm">
                                                <thead>
                                                    <tr className="text-left text-gray-500 border-b">
                                                        <th className="pb-2">姓名</th>
                                                        <th className="pb-2">部门</th>
                                                        <th className="pb-2">PRI</th>
                                                        <th className="pb-2">得分率</th>
                                                        <th className="pb-2">象限</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {users.map(u => (
                                                        <tr key={u.userId || u.userName} className="border-b border-gray-50">
                                                            <td className="py-2 font-medium">{u.userName}</td>
                                                            <td className="py-2 text-xs text-gray-500">{u.departmentName || '—'}</td>
                                                            <td className="py-2 font-bold text-amber-600">{u.avgPRI}</td>
                                                            <td className="py-2">{(u.avgScoreRate * 100).toFixed(1)}%</td>
                                                            <td className="py-2">
                                                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100">{u.quadrant?.label}</span>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                    {!users.length && (
                                                        <tr><td colSpan={5} className="py-8 text-center text-gray-400">暂无</td></tr>
                                                    )}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {tab === 'proficiency' && (
                                <div className="space-y-6">
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                        {Object.entries(prof.distribution || {}).map(([k, v]) => (
                                            <div key={k} className="border rounded-xl p-4 text-center">
                                                <div className="text-2xl font-black text-indigo-600">{v}</div>
                                                <div className="text-xs text-gray-500 mt-1">{k}</div>
                                            </div>
                                        ))}
                                    </div>
                                    <p className="text-xs text-gray-500 bg-sky-50 border border-sky-100 rounded-xl p-3">
                                        {prof.note}
                                        {' '}PRI = 0.4·找全 + 0.25·(1−容错浪费) + 0.15·速度 + 0.2·(1−无效点击率)
                                    </p>
                                    <ColumnChart items={charts.priBuckets} color="#f59e0b" />
                                    <div>
                                        <h3 className="font-bold mb-2">高无效点击场次（≥3）</h3>
                                        <table className="w-full text-sm">
                                            <thead>
                                                <tr className="text-left text-gray-500 border-b">
                                                    <th className="pb-2">考生</th>
                                                    <th className="pb-2">试卷</th>
                                                    <th className="pb-2">miss</th>
                                                    <th className="pb-2">PRI</th>
                                                    <th className="pb-2">得分率</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {(prof.highMissAttempts || []).map(r => (
                                                    <tr key={r.recordId} className="border-b border-gray-50">
                                                        <td className="py-2">{r.userName}</td>
                                                        <td className="py-2 text-xs">{r.examName}</td>
                                                        <td className="py-2 font-bold text-red-500">{r.invalidClicks}</td>
                                                        <td className="py-2">{r.pri}</td>
                                                        <td className="py-2">{((r.scoreRate || 0) * 100).toFixed(0)}%</td>
                                                    </tr>
                                                ))}
                                                {!(prof.highMissAttempts || []).length && (
                                                    <tr><td colSpan={5} className="py-8 text-center text-gray-400">暂无</td></tr>
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}
                        </>
                    )}

                    {!loading && !data && !error && (
                        <div className="text-center py-20 text-gray-400 text-sm">
                            请在左侧选择试卷/部门，点击「开始分析」
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
}

function ChartCard({ title, children, className = '' }) {
    return (
        <div className={`border rounded-2xl p-4 bg-white ${className}`}>
            <h4 className="text-sm font-bold text-gray-800 mb-3">{title}</h4>
            {children}
        </div>
    );
}

function CompareBar({ label, current, base, unit }) {
    const delta = current - base;
    const max = Math.max(Math.abs(current), Math.abs(base), 1);
    return (
        <div className="border rounded-xl p-3 bg-gray-50">
            <div className="flex justify-between mb-2 font-bold text-gray-700">
                <span>{label}</span>
                <span className={delta >= 0 ? 'text-emerald-600' : 'text-red-500'}>
                    {delta >= 0 ? '+' : ''}{delta.toFixed(1)}{unit}
                </span>
            </div>
            <div className="space-y-1">
                <div className="flex items-center gap-2">
                    <span className="w-10 text-gray-400">本切片</span>
                    <div className="flex-1 h-2 bg-gray-200 rounded">
                        <div className="h-2 bg-indigo-500 rounded" style={{ width: `${(current / max) * 100}%` }} />
                    </div>
                    <span className="w-14 text-right font-mono">{current.toFixed(1)}{unit}</span>
                </div>
                <div className="flex items-center gap-2">
                    <span className="w-10 text-gray-400">全库</span>
                    <div className="flex-1 h-2 bg-gray-200 rounded">
                        <div className="h-2 bg-gray-400 rounded" style={{ width: `${(base / max) * 100}%` }} />
                    </div>
                    <span className="w-14 text-right font-mono">{base.toFixed(1)}{unit}</span>
                </div>
            </div>
        </div>
    );
}

function KnowledgeTable({ rows, showPath }) {
    if (!rows?.length) {
        return <p className="text-sm text-gray-400 py-6">暂无知识错误事实</p>;
    }
    return (
        <table className="w-full text-sm">
            <thead>
                <tr className="text-left text-gray-500 border-b">
                    <th className="pb-2">名称</th>
                    {showPath && <th className="pb-2">路径</th>}
                    <th className="pb-2">暴露</th>
                    <th className="pb-2">命中</th>
                    <th className="pb-2">遗漏</th>
                    <th className="pb-2">遗漏率</th>
                    <th className="pb-2">掌握度</th>
                    <th className="pb-2">严重度</th>
                </tr>
            </thead>
            <tbody>
                {rows.map(r => (
                    <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="py-2 font-medium max-w-[180px] truncate" title={r.name}>{r.name}</td>
                        {showPath && (
                            <td className="py-2 text-xs text-gray-400">
                                {[r.sceneName, r.categoryName].filter(Boolean).join(' / ')}
                            </td>
                        )}
                        <td className="py-2">{r.exposure}</td>
                        <td className="py-2 text-emerald-600">{r.hits}</td>
                        <td className="py-2 text-red-500">{r.unfound}</td>
                        <td className="py-2">{r.unfoundRate != null ? `${(r.unfoundRate * 100).toFixed(0)}%` : '—'}</td>
                        <td className="py-2">{r.mastery != null ? `${(r.mastery * 100).toFixed(0)}%` : '—'}</td>
                        <td className="py-2 font-bold text-amber-600">{r.severityScore}</td>
                    </tr>
                ))}
            </tbody>
        </table>
    );
}
