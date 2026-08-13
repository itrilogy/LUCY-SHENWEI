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
        <div className="flex-1 w-full flex items-center justify-center bg-gray-900 p-4 sm:p-8">
            <div className="max-w-lg w-full bg-gray-800 rounded-3xl p-6 sm:p-10 border border-gray-700 shadow-2xl text-center">
                <div className={`text-6xl font-black mb-2 ${g.color}`}>{g.label}</div>
                <p className="text-gray-400 text-sm mb-2">
                    {finalResult.mode === 'practice' ? '练习结果（不计入正式榜）' : '考核等第'}
                </p>
                <div className="text-5xl font-black text-white mb-2">
                    {finalResult.score}
                    <span className="text-lg text-gray-500 font-medium"> / {finalResult.paperTotal}</span>
                </div>
                <p className="text-gray-400 mb-2">{userName}{department ? ` · ${department}` : ''}</p>
                <p className="text-xs text-gray-500 mb-2">
                    卷宗：{examId}
                    {finalResult.duration != null && ` · 用时 ${Math.round(finalResult.duration / 1000)} 秒`}
                </p>
                {(finalResult.pri != null || finalResult.invalidClicks != null) && (
                    <p className="text-xs text-sky-400/90 mb-4">
                        识别熟练度 PRI {finalResult.pri ?? '—'}
                        {finalResult.invalidClicks != null && ` · 无效点击 ${finalResult.invalidClicks} 次`}
                    </p>
                )}
                {missed.length > 0 && (
                    <div className="text-left bg-gray-900/60 rounded-xl p-4 mb-6 max-h-40 overflow-y-auto border border-gray-700">
                        <p className="text-xs font-bold text-amber-400 mb-2">错题本 / 未掌握条款</p>
                        {missed.map((it) => (
                            <div key={it.id} className="text-xs text-gray-300 mb-1.5 border-b border-gray-800 pb-1">
                                {clausesDict[it.clauseId]?.desc || it.description || it.clauseId}
                            </div>
                        ))}
                    </div>
                )}
                <div className="flex flex-col sm:flex-row gap-3">
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
                            className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 rounded-xl"
                        >
                            打印合格证
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={onRetry}
                        className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2"
                    >
                        <RotateCcw className="w-4 h-4" /> 再考一次
                    </button>
                    <button
                        type="button"
                        onClick={onLobby}
                        className="flex-1 bg-gray-700 hover:bg-gray-600 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2"
                    >
                        <Home className="w-4 h-4" /> 返回大厅
                    </button>
                </div>
            </div>
            <ExamToast toast={toast} />
        </div>
    );
}
