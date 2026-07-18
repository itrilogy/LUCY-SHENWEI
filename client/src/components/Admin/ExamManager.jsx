import React, { useState, useEffect } from 'react';
import { ScrollText, Play, Trash2, Globe, Archive } from 'lucide-react';

export default function ExamManager({ onEnterExam }) {
    const [exams, setExams] = useState([]);
    const [loading, setLoading] = useState(true);

    const fetchExams = async () => {
        try {
            setLoading(true);
            const res = await fetch('/api/exams'); // 需要在后端新增这个路由，返回所有试卷
            if (res.ok) {
                const data = await res.json();
                setExams(data || []);
            }
        } catch (e) {
            console.error('获取试卷列表失败', e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchExams();
    }, []);

    // D-02: 删除试卷绝不删除 records；成绩仍可在报表/龙虎榜按 exam_id 查询
    const handleDelete = async (examName) => {
        if (!window.confirm(
            `确认删除试卷【${examName}】吗？\n\n` +
            `• 试卷与题目关联将被移除\n` +
            `• 龙虎榜/历史成绩完整保留（后端 records 不删）\n` +
            `• 可在「成绩报表」中查看该卷成绩（标记为卷已删）`
        )) return;
        try {
            const res = await fetch(`/api/exams/${encodeURIComponent(examName)}`, { method: 'DELETE' });
            if (res.ok) {
                const data = await res.json().catch(() => ({}));
                alert(data.message || '试卷已删除，历史成绩已保留');
                fetchExams();
            }
        } catch (e) {
            console.error('删除试卷失败', e);
        }
    };

    const toggleStatus = async (examName, currentStatus) => {
        const newStatus = currentStatus === 'published' ? 'draft' : 'published';
        try {
            const res = await fetch(`/api/exams/${examName}/status`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: newStatus })
            });
            if (res.ok) fetchExams();
        } catch (e) { console.error('状态切换失败', e); }
    };

    return (
        <div className="bg-white flex flex-col h-full border-l border-gray-200">
            <div className="p-4 border-b bg-gray-50 flex items-center justify-between">
                <h2 className="text-lg font-bold flex items-center text-gray-800">
                    <ScrollText className="w-5 h-5 mr-2 text-indigo-500" /> 考卷集
                </h2>
                <button onClick={fetchExams} className="text-sm text-indigo-500 hover:text-indigo-700">刷新</button>
            </div>

            <div className="flex-1 p-4 overflow-y-auto space-y-3">
                {loading ? (
                    <div className="text-center text-gray-400 py-10">加载中...</div>
                ) : exams.length === 0 ? (
                    <div className="text-center text-gray-400 py-10">暂无组卷记录。请先在左侧新建并保存/发布考卷。</div>
                ) : (
                    exams.map((exam, i) => {
                        const isPublished = exam.status === 'published';
                        return (
                            <div key={exam.name || i} className={`border p-3 rounded-lg shadow-sm hover:shadow transition flex flex-col bg-white ${isPublished ? 'border-emerald-200 relative overflow-hidden' : 'border-gray-200'}`}>
                                {isPublished && <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500" title="已发布状态" />}
                                <div className="flex justify-between items-start mb-2">
                                    <div className="pl-2">
                                        <h3 className="font-bold text-gray-800 flex items-center">
                                            {exam.examName || exam.name}
                                            {isPublished ?
                                                <span className="ml-2 text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded">已发布</span> :
                                                <span className="ml-2 text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">未发布</span>
                                            }
                                        </h3>
                                        <p className="text-xs text-gray-500 mt-1 line-clamp-2" title={exam.description}>{exam.description || '无试卷说明'}</p>
                                    </div>
                                    <div className="flex space-x-1 flex-shrink-0">
                                        {isPublished ? (
                                            <button onClick={() => toggleStatus(exam.examName || exam.name, exam.status)} className="p-1.5 text-gray-400 hover:text-amber-500 transition rounded hover:bg-amber-50" title="取消发布为草稿">
                                                <Archive className="w-4 h-4" />
                                            </button>
                                        ) : (
                                            <button onClick={() => toggleStatus(exam.examName || exam.name, exam.status)} className="p-1.5 text-gray-400 hover:text-emerald-500 transition rounded hover:bg-emerald-50" title="立即发布至大厅">
                                                <Globe className="w-4 h-4" />
                                            </button>
                                        )}
                                        {isPublished && (
                                            <button onClick={() => onEnterExam && onEnterExam(exam.examName || exam.name)} className="p-1.5 text-gray-400 hover:text-emerald-500 transition rounded hover:bg-emerald-50" title="进入实勘考核">
                                                <Play className="w-4 h-4" />
                                            </button>
                                        )}
                                        <button onClick={() => handleDelete(exam.examName || exam.name)} className="p-1.5 text-gray-400 hover:text-red-500 transition rounded hover:bg-red-50" title="删除">
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                                <div className="pl-2 flex justify-between items-center text-[10px] text-gray-400 mt-1 border-t border-gray-50 pt-1">
                                    <span>包含 {exam.slides?.length || 0} 图源</span>
                                    <span>{new Date(exam.mtime || exam.createdAt).toLocaleString()}</span>
                                </div>
                            </div>
                        )
                    })
                )}
            </div>
        </div>
    );
}
