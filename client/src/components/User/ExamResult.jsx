import React from 'react';
import { Home, RotateCcw } from 'lucide-react';
import { printCertificate } from '../../lib/certificate';
import ExamToast from './ExamToast';

export default function ExamResult({
    finalResult,
    userName,
    department,
    examId,
    selectedExam,
    clausesDict,
    missedItems,
    toast,
    onRetry,
    onLobby
}) {
    const g = finalResult.grade;
    const missed = finalResult.missed || missedItems || [];
    const passed = finalResult.mode !== 'practice' && (finalResult.score / (finalResult.paperTotal || 100)) >= 0.6;

    return (
        <div className="flex-1 w-full flex items-center justify-center bg-page p-4 sm:p-8">
            <div className="max-w-lg w-full luxi-card p-6 sm:p-10 bg-raised text-center">
                <div className={`text-6xl font-semibold mb-2 ${g.color}`}>{g.label}</div>
                <p className="text-muted text-sm mb-2">
                    {finalResult.mode === 'practice' ? '练习结果（不计入正式榜）' : '考核等第'}
                </p>
                <div className="text-5xl font-semibold text-fg mb-2 num">
                    {finalResult.score}
                    <span className="text-lg text-muted font-medium"> / {finalResult.paperTotal}</span>
                </div>
                <p className="text-secondary mb-2">{userName}{department ? ` · ${department}` : ''}</p>
                <p className="text-xs text-muted mb-2 font-mono">
                    卷宗：{examId}
                    {finalResult.duration != null && ` · 用时 ${Math.round(finalResult.duration / 1000)} 秒`}
                </p>
                {(finalResult.pri != null || finalResult.invalidClicks != null) && (
                    <p className="text-xs text-muted mb-4">
                        识别熟练度 PRI {finalResult.pri ?? '—'}
                        {finalResult.invalidClicks != null && ` · 无效点击 ${finalResult.invalidClicks} 次`}
                        <span className="block mt-1">PRI 为过程指标，不是法定达标承诺；口径见学情分析脚注。</span>
                    </p>
                )}
                {missed.length > 0 && (
                    <div className="text-left bg-sunken rounded-[10px] p-4 mb-6 max-h-40 overflow-y-auto border border-line">
                        <p className="text-xs font-semibold text-[var(--text-warn)] mb-2">错题本 / 未掌握条款</p>
                        {missed.map((it) => (
                            <div key={it.id} className="text-xs text-secondary mb-1.5 border-b border-subtle pb-1">
                                {clausesDict[it.clauseId]?.desc || it.description || it.clauseId}
                            </div>
                        ))}
                    </div>
                )}
                <div className="flex flex-col sm:flex-row gap-2">
                    {passed && (
                        <button
                            type="button"
                            onClick={() => printCertificate({
                                userName,
                                department,
                                examName: selectedExam?.examName || examId,
                                score: finalResult.score,
                                paperTotal: finalResult.paperTotal,
                                grade: g.label,
                                date: Date.now()
                            })}
                            className="btn btn-primary flex-1"
                        >
                            打印合格证
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={onRetry}
                        className={passed ? 'btn btn-secondary flex-1' : 'btn btn-primary flex-1'}
                    >
                        <RotateCcw className="w-4 h-4" /> 再考一次
                    </button>
                    <button
                        type="button"
                        onClick={onLobby}
                        className="btn btn-ghost flex-1"
                    >
                        <Home className="w-4 h-4" /> 返回大厅
                    </button>
                </div>
            </div>
            <ExamToast toast={toast} />
        </div>
    );
}
