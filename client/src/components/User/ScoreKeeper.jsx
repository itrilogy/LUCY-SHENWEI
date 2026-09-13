import React, { useState, useEffect } from 'react';
import { Trophy, Medal } from 'lucide-react';
import { EmptyState, LoadingState } from '../Ui/EmptyState';

export default function ScoreKeeper({ activeExamId, refreshKey = 0 }) {
    const [records, setRecords] = useState([]);
    const [loading, setLoading] = useState(true);
    // best：同人同卷只保留最高分（默认）；all：展示全部交卷记录
    const [mode, setMode] = useState('best');

    const fetchRecords = async () => {
        try {
            setLoading(true);
            const params = new URLSearchParams({ mode });
            if (activeExamId) params.set('examId', activeExamId);
            const res = await fetch(`/api/session/records/latest?${params}`);
            if (res.ok) {
                const data = await res.json();
                setRecords(data || []);
            }
        } catch (e) {
            console.error('获取成绩列表失败', e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchRecords();
        const timer = setInterval(fetchRecords, 10000);
        return () => clearInterval(timer);
    }, [activeExamId, refreshKey, mode]);

    return (
        <div className="bg-card h-full rounded-[10px] flex flex-col overflow-hidden text-fg">
            <div className="p-5 border-b border-line bg-sunken/50 flex flex-col">
                <div className="flex justify-between items-center mb-2">
                    <h2 className="text-[17px] font-semibold flex items-center text-fg">
                        <Trophy className="w-5 h-5 mr-2 text-gold" />
                        龙虎榜
                    </h2>
                    <div className="px-2 py-0.5 bg-gray-800 rounded text-[10px] font-semibold text-gray-400">
                        {mode === 'best' ? '每人最高分' : '全部记录'}
                    </div>
                </div>
                <div className="flex items-center gap-3 text-xs">
                    <button
                        onClick={() => setMode('best')}
                        className={`font-semibold transition-colors ${mode === 'best' ? 'text-amber-400' : 'text-gray-500 hover:text-white'}`}
                    >
                        排行榜
                    </button>
                    <span className="text-gray-700">|</span>
                    <button
                        onClick={() => setMode('all')}
                        className={`font-semibold transition-colors ${mode === 'all' ? 'text-amber-400' : 'text-gray-500 hover:text-white'}`}
                    >
                        全部交卷
                    </button>
                    <button
                        onClick={fetchRecords}
                        className="ml-auto font-semibold text-gray-500 hover:text-white transition-colors"
                    >
                        刷新
                    </button>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 flex flex-col space-y-4">
                {loading && records.length === 0 ? (
                    <LoadingState label="读取成绩…" />
                ) : records.length === 0 ? (
                    <EmptyState title="虚位以待" hint="下一步：完成一次正式考核后成绩会出现在这里。" />
                ) : (
                    records.map((r, i) => {
                        let rankColor = 'text-gray-400 font-bold';
                        let bgItem = 'bg-gray-800';
                        if (i === 0) { rankColor = 'text-gold font-semibold text-xl'; bgItem = 'bg-[var(--luxi-gold)]/10 border-[var(--luxi-gold)]/40 border'; }
                        else if (i === 1) { rankColor = 'text-secondary font-semibold text-lg'; bgItem = 'bg-sunken border-line border'; }
                        else if (i === 2) { rankColor = 'text-accent font-semibold text-lg'; bgItem = 'bg-sunken border-line border'; }

                        return (
                            <div key={`${r.userName}-${r.completedAt}-${i}`} className={`w-full p-4 rounded-[10px] flex items-center justify-between ${bgItem}`}>
                                <div className="flex items-center space-x-3 w-[70%]">
                                    <div className={`w-8 flex-shrink-0 text-center ${rankColor}`}>
                                        {i === 0 ? <Medal className="w-6 h-6 mx-auto" /> : `#${i + 1}`}
                                    </div>
                                    <div className="min-w-0 pr-2 flex-1">
                                        <div className="font-bold text-gray-100 truncate">{r.userName || '匿名'}</div>
                                        <div className="text-[10px] text-gray-500 mt-0.5 truncate" title={r.examName || r.examId}>
                                            {r.department ? `${r.department} · ` : ''}
                                            {String(r.examName || r.examId || '').substring(0, 20)}
                                        </div>
                                    </div>
                                </div>
                                <div className="text-right flex-shrink-0 w-[30%]">
                                    <div className="text-2xl font-semibold text-[var(--text-ok)] num">{r.score}</div>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
}
