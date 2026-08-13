import React, { useState, useEffect } from 'react';
import { ScrollText, Play, Trash2, Globe, Archive, Pencil, CalendarClock } from 'lucide-react';
import ConfirmDialog from '../ConfirmDialog';

export default function ExamManager({ onEnterExam, onEditExam }) {
    const [exams, setExams] = useState([]);
    const [loading, setLoading] = useState(true);
    const [confirm, setConfirm] = useState({ open: false });
    const [assignExam, setAssignExam] = useState(null);
    const [depts, setDepts] = useState([]);
    const [assignForm, setAssignForm] = useState({ departmentIds: [], dueAt: '', required: true });
    const [assignments, setAssignments] = useState([]);

    const fetchExams = async () => {
        try {
            setLoading(true);
            const res = await fetch('/api/exams');
            if (res.ok) setExams(await res.json() || []);
        } catch (e) {
            console.error('获取试卷列表失败', e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchExams(); }, []);

    const handleDelete = (exam) => {
        const id = exam.name || exam.examName;
        setConfirm({
            open: true,
            title: '删除试卷',
            message: `确认删除「${exam.examName || id}」？\n试卷与题目关联将移除，历史成绩保留。`,
            danger: true,
            onConfirm: async () => {
                setConfirm({ open: false });
                const res = await fetch(`/api/exams/${encodeURIComponent(id)}`, { method: 'DELETE' });
                if (res.ok) fetchExams();
            }
        });
    };

    const toggleStatus = async (exam) => {
        const id = exam.name || exam.examName;
        const newStatus = exam.status === 'published' ? 'draft' : 'published';
        const res = await fetch(`/api/exams/${encodeURIComponent(id)}/status`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: newStatus })
        });
        if (res.ok) fetchExams();
    };

    const openAssign = async (exam) => {
        const id = exam.name || exam.examName;
        const [d, a] = await Promise.all([
            fetch('/api/org/departments').then((r) => r.json()),
            fetch(`/api/admin/assignments?examId=${encodeURIComponent(id)}`).then((r) => r.json())
        ]);
        setDepts(Array.isArray(d) ? d : []);
        setAssignments(Array.isArray(a) ? a : []);
        setAssignForm({ departmentIds: [], dueAt: '', required: true });
        setAssignExam(exam);
    };

    const saveAssign = async () => {
        const exam = assignExam;
        const id = exam.name || exam.examName;
        const res = await fetch('/api/admin/assignments', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                examId: id,
                dueAt: assignForm.dueAt ? new Date(assignForm.dueAt).getTime() : null,
                required: assignForm.required,
                departmentIds: assignForm.departmentIds
            })
        });
        if (res.ok) {
            const a = await fetch(`/api/admin/assignments?examId=${encodeURIComponent(id)}`).then((r) => r.json());
            setAssignments(Array.isArray(a) ? a : []);
            setAssignForm({ departmentIds: [], dueAt: '', required: true });
        }
    };

    const removeAssign = async (asgId) => {
        await fetch(`/api/admin/assignments/${encodeURIComponent(asgId)}`, { method: 'DELETE' });
        if (assignExam) {
            const id = assignExam.name || assignExam.examName;
            const a = await fetch(`/api/admin/assignments?examId=${encodeURIComponent(id)}`).then((r) => r.json());
            setAssignments(Array.isArray(a) ? a : []);
        }
    };

    const toggleDept = (deptId) => {
        setAssignForm((f) => {
            const has = f.departmentIds.includes(deptId);
            return { ...f, departmentIds: has ? f.departmentIds.filter((x) => x !== deptId) : [...f.departmentIds, deptId] };
        });
    };

    return (
        <div className="bg-white flex flex-col h-full border-l border-gray-200">
            <div className="p-4 border-b bg-gray-50 flex items-center justify-between">
                <h2 className="text-lg font-bold flex items-center text-gray-800">
                    <ScrollText className="w-5 h-5 mr-2 text-indigo-500" /> 考卷集
                </h2>
                <div className="flex gap-2">
                    <button
                        type="button"
                        onClick={async () => {
                            const r = await fetch('/api/admin/bank/seed-starter', { method: 'POST' });
                            const d = await r.json();
                            if (d.examId || d.skipped) fetchExams();
                        }}
                        className="text-xs font-bold text-emerald-600"
                    >
                        开箱示范卷
                    </button>
                    <button onClick={fetchExams} className="text-sm text-indigo-500 hover:text-indigo-700">刷新</button>
                </div>
            </div>

            <div className="flex-1 p-4 overflow-y-auto space-y-3">
                {loading ? (
                    <div className="text-center text-gray-400 py-10">加载中...</div>
                ) : exams.length === 0 ? (
                    <div className="text-center text-gray-400 py-10">暂无组卷记录。请先在左侧新建并保存/发布考卷。</div>
                ) : (
                    exams.map((exam, i) => {
                        const isPublished = exam.status === 'published';
                        const id = exam.name || exam.examName;
                        return (
                            <div key={id || i} className={`border p-3 rounded-lg shadow-sm hover:shadow transition flex flex-col bg-white ${isPublished ? 'border-emerald-200 relative overflow-hidden' : 'border-gray-200'}`}>
                                {isPublished && <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500" title="已发布状态" />}
                                <div className="flex justify-between items-start mb-2">
                                    <div className="pl-2 min-w-0">
                                        <h3 className="font-bold text-gray-800 flex items-center flex-wrap">
                                            {exam.examName || exam.name}
                                            {isPublished ?
                                                <span className="ml-2 text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded">已发布</span> :
                                                <span className="ml-2 text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">未发布</span>
                                            }
                                        </h3>
                                        <p className="text-xs text-gray-500 mt-1 line-clamp-2" title={exam.description}>{exam.description || '无试卷说明'}</p>
                                    </div>
                                    <div className="flex space-x-1 flex-shrink-0">
                                        <button onClick={() => onEditExam && onEditExam(id)} className="p-1.5 text-gray-400 hover:text-indigo-600 rounded hover:bg-indigo-50" title="回载编辑">
                                            <Pencil className="w-4 h-4" />
                                        </button>
                                        <button onClick={() => openAssign(exam)} className="p-1.5 text-gray-400 hover:text-sky-600 rounded hover:bg-sky-50" title="布置考核">
                                            <CalendarClock className="w-4 h-4" />
                                        </button>
                                        {isPublished ? (
                                            <button onClick={() => toggleStatus(exam)} className="p-1.5 text-gray-400 hover:text-amber-500 transition rounded hover:bg-amber-50" title="取消发布为草稿">
                                                <Archive className="w-4 h-4" />
                                            </button>
                                        ) : (
                                            <button onClick={() => toggleStatus(exam)} className="p-1.5 text-gray-400 hover:text-emerald-500 transition rounded hover:bg-emerald-50" title="立即发布至大厅">
                                                <Globe className="w-4 h-4" />
                                            </button>
                                        )}
                                        {isPublished && (
                                            <button onClick={() => onEnterExam && onEnterExam(id)} className="p-1.5 text-gray-400 hover:text-emerald-500 transition rounded hover:bg-emerald-50" title="进入实勘考核">
                                                <Play className="w-4 h-4" />
                                            </button>
                                        )}
                                        <button onClick={() => handleDelete(exam)} className="p-1.5 text-gray-400 hover:text-red-500 transition rounded hover:bg-red-50" title="删除">
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                                <div className="pl-2 flex justify-between items-center text-[10px] text-gray-400 mt-1 border-t border-gray-50 pt-1">
                                    <span>包含 {exam.slides?.length || 0} 图源</span>
                                    <span>{new Date(exam.mtime || exam.createdAt).toLocaleString()}</span>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>

            {assignExam && (
                <div className="fixed inset-0 z-[180] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
                        <h3 className="text-lg font-black">布置「{assignExam.examName}」</h3>
                        <p className="text-xs text-gray-500">选择部门后，该部门（含子部门）在册人员计入未考名单。不布置则报表按全部在册学员统计。</p>
                        <div className="border rounded-xl p-3 max-h-40 overflow-y-auto space-y-1">
                            {depts.map((d) => (
                                <label key={d.id} className="flex items-center gap-2 text-sm">
                                    <input type="checkbox" checked={assignForm.departmentIds.includes(d.id)} onChange={() => toggleDept(d.id)} />
                                    {d.name}
                                </label>
                            ))}
                            {!depts.length && <p className="text-xs text-gray-400">暂无部门，请先在人员组织中创建。</p>}
                        </div>
                        <label className="text-xs text-gray-500 block">
                            截止日期
                            <input type="datetime-local" value={assignForm.dueAt} onChange={(e) => setAssignForm({ ...assignForm, dueAt: e.target.value })} className="mt-1 block w-full border rounded-lg px-2 py-1.5 text-sm" />
                        </label>
                        <label className="flex items-center gap-2 text-sm">
                            <input type="checkbox" checked={assignForm.required} onChange={(e) => setAssignForm({ ...assignForm, required: e.target.checked })} />
                            必考
                        </label>
                        <button type="button" onClick={saveAssign} className="w-full bg-indigo-600 text-white font-bold py-2 rounded-xl">保存布置</button>
                        {assignments.length > 0 && (
                            <div className="text-xs space-y-1">
                                <p className="font-bold text-gray-600">已有布置</p>
                                {assignments.map((a) => (
                                    <div key={a.id} className="flex justify-between bg-gray-50 rounded px-2 py-1">
                                        <span>{a.required ? '必考' : '选考'} · {a.targets?.length || 0} 个对象{a.due_at ? ` · 截止 ${new Date(a.due_at).toLocaleString()}` : ''}</span>
                                        <button type="button" className="text-red-500" onClick={() => removeAssign(a.id)}>删除</button>
                                    </div>
                                ))}
                            </div>
                        )}
                        <button type="button" onClick={() => setAssignExam(null)} className="w-full text-sm text-gray-500">关闭</button>
                    </div>
                </div>
            )}

            <ConfirmDialog
                open={confirm.open}
                title={confirm.title}
                message={confirm.message}
                danger={confirm.danger}
                onConfirm={confirm.onConfirm}
                onCancel={() => setConfirm({ open: false })}
            />
        </div>
    );
}
