import React from 'react';
import { Building2, ChevronLeft, ChevronRight, IdCard, ShieldCheck, Target, User } from 'lucide-react';
import { MAX_MISS, parseExamSettings } from '../../lib/examSettings';
import ExamToast from './ExamToast';

export default function ExamLobby({
    lobbyStep,
    attemptMode,
    setAttemptMode,
    allExams,
    selectedExam,
    onSelectExam,
    currentUser,
    onRequestLogin,
    userName,
    setUserName,
    department,
    setDepartment,
    employeeId,
    setEmployeeId,
    onNext,
    onBack,
    onStart,
    toast
}) {
    return (
        <div className="flex-1 w-full flex items-center justify-center bg-gray-900 p-4 sm:p-8">
            <div className="max-w-xl w-full bg-gray-800 rounded-3xl p-6 sm:p-10 shadow-3xl border border-gray-700">
                <div className="text-center mb-8">
                    <div className="w-16 h-16 bg-indigo-600/20 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-indigo-500/30">
                        <Target className="w-8 h-8 text-indigo-500" />
                    </div>
                    <h1 className="text-2xl font-black text-white tracking-tight mb-2">考核大厅</h1>
                    <p className="text-gray-400 text-sm">选卷 → 登记身份 → 确认规则 → 开考</p>
                    <div className="flex justify-center gap-2 mt-6">
                        {[1, 2, 3].map((s) => (
                            <div key={s} className={`h-1.5 w-12 rounded-full transition ${lobbyStep >= s ? 'bg-indigo-500' : 'bg-gray-700'}`} />
                        ))}
                    </div>
                    <p className="text-xs text-gray-500 mt-2">
                        {lobbyStep === 1 && '步骤 1 / 3 · 选择试卷'}
                        {lobbyStep === 2 && '步骤 2 / 3 · 身份登记'}
                        {lobbyStep === 3 && '步骤 3 / 3 · 规则说明'}
                    </p>
                </div>

                {lobbyStep === 1 && (
                    <div className="space-y-5">
                        <div>
                            <label className="block text-sm font-bold text-gray-400 mb-2">模式</label>
                            <div className="grid grid-cols-2 gap-2">
                                <button
                                    type="button"
                                    onClick={() => setAttemptMode('exam')}
                                    className={`py-3 rounded-xl text-sm font-bold border ${attemptMode === 'exam' ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-gray-900 border-gray-700 text-gray-400'}`}
                                >
                                    正式考核
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setAttemptMode('practice')}
                                    className={`py-3 rounded-xl text-sm font-bold border ${attemptMode === 'practice' ? 'bg-sky-600 border-sky-500 text-white' : 'bg-gray-900 border-gray-700 text-gray-400'}`}
                                >
                                    练习模式
                                </button>
                            </div>
                            <p className="text-[11px] text-gray-500 mt-2">
                                {attemptMode === 'practice' ? '练习可查看提示，成绩记为 practice，不进正式龙虎榜。' : '考核隐藏部分提示；成绩进正式榜。'}
                            </p>
                        </div>
                        <div>
                            <label className="block text-sm font-bold text-gray-400 mb-2">选择考核试卷</label>
                            <select
                                className="w-full bg-gray-900 border border-gray-700 rounded-xl px-4 py-4 text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                                value={selectedExam?.examName || selectedExam?.name || ''}
                                onChange={(e) => {
                                    const exam = allExams.find((ex) => (ex.examName || ex.name) === e.target.value);
                                    onSelectExam(exam || null);
                                }}
                            >
                                {allExams.length === 0 && <option value="">暂无已发布的试卷</option>}
                                {allExams.map((ex) => (
                                    <option key={ex.name || ex.examName} value={ex.examName || ex.name}>
                                        {ex.examName || ex.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                        {selectedExam && (
                            <div className="bg-gray-900/50 rounded-2xl p-5 border border-gray-700/50">
                                <h3 className="text-indigo-400 font-bold mb-2 flex justify-between text-sm">
                                    卷面详情
                                    <span className="text-gray-500 text-xs font-normal">
                                        {selectedExam.slides?.length || 0} 题 · 总分 {parseExamSettings(selectedExam).total_score}
                                        {parseExamSettings(selectedExam).time_limit_sec > 0 && ` · 限时 ${parseExamSettings(selectedExam).time_limit_sec}s`}
                                    </span>
                                </h3>
                                <p className="text-sm text-gray-300 leading-relaxed">
                                    {selectedExam.description || '暂无详细任务指引。'}
                                </p>
                            </div>
                        )}
                        <button
                            type="button"
                            disabled={!selectedExam}
                            onClick={onNext}
                            className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700 text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-2"
                        >
                            下一步：身份登记 <ChevronRight className="w-5 h-5" />
                        </button>
                    </div>
                )}

                {lobbyStep === 2 && (
                    <div className="space-y-4">
                        {currentUser ? (
                            <div className="bg-emerald-900/30 border border-emerald-700/50 rounded-xl p-4 text-sm text-emerald-200">
                                已登录：<b>{currentUser.realName || currentUser.username}</b>
                                {currentUser.departmentName ? ` · ${currentUser.departmentName}` : ''}
                                <span className="block text-xs text-emerald-400/80 mt-1">成绩将绑定账号 user_id</span>
                            </div>
                        ) : (
                            <div className="flex items-center justify-between bg-gray-900/60 border border-gray-700 rounded-xl p-3">
                                <span className="text-xs text-gray-400">建议登录后开考，便于对账与榜单去重</span>
                                {onRequestLogin && (
                                    <button type="button" onClick={onRequestLogin} className="text-xs font-bold text-indigo-400 hover:text-indigo-300 px-2 py-1">
                                        去登录
                                    </button>
                                )}
                            </div>
                        )}
                        <div>
                            <label className="flex items-center text-sm font-bold text-gray-400 mb-2">
                                <User className="w-4 h-4 mr-1" /> 姓名 <span className="text-red-400 ml-1">*</span>
                            </label>
                            <input
                                value={userName}
                                onChange={(e) => setUserName(e.target.value)}
                                placeholder="请输入真实姓名"
                                className="w-full bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 text-white outline-none focus:ring-2 focus:ring-indigo-500"
                                autoFocus
                                readOnly={!!currentUser}
                            />
                        </div>
                        <div>
                            <label className="flex items-center text-sm font-bold text-gray-400 mb-2">
                                <Building2 className="w-4 h-4 mr-1" /> 部门（可选）
                            </label>
                            <input
                                value={department}
                                onChange={(e) => setDepartment(e.target.value)}
                                placeholder="如：生产一车间"
                                className="w-full bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 text-white outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                        </div>
                        <div>
                            <label className="flex items-center text-sm font-bold text-gray-400 mb-2">
                                <IdCard className="w-4 h-4 mr-1" /> 工号（可选）
                            </label>
                            <input
                                value={employeeId}
                                onChange={(e) => setEmployeeId(e.target.value)}
                                placeholder="工号 / 手机号"
                                className="w-full bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 text-white outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                        </div>
                        <div className="flex gap-3 pt-2">
                            <button type="button" onClick={() => onBack(1)} className="px-4 py-3 rounded-xl bg-gray-700 text-white font-bold flex items-center gap-1">
                                <ChevronLeft className="w-4 h-4" /> 上一步
                            </button>
                            <button type="button" onClick={onNext} className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2">
                                下一步：规则确认 <ChevronRight className="w-5 h-5" />
                            </button>
                        </div>
                    </div>
                )}

                {lobbyStep === 3 && selectedExam && (
                    <div className="space-y-5">
                        <div className="bg-gray-900/60 rounded-2xl p-5 border border-gray-700 space-y-3 text-sm text-gray-300">
                            <div className="flex justify-between">
                                <span className="text-gray-500">考生</span>
                                <span className="font-bold text-white">{userName}{department ? ` · ${department}` : ''}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-gray-500">试卷</span>
                                <span className="font-bold text-white">{selectedExam.examName || selectedExam.name}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-gray-500">场景题量</span>
                                <span>{selectedExam.slides?.length || 0} 题</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-gray-500">卷面总分</span>
                                <span>{parseExamSettings(selectedExam).total_score} 分</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-gray-500">计分规则</span>
                                <span>{parseExamSettings(selectedExam).scoring_rule === 'average' ? '均分赋分' : '权重比例赋分'}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-gray-500">单题误点容错</span>
                                <span className="text-red-400 font-bold">{MAX_MISS} 次</span>
                            </div>
                            {parseExamSettings(selectedExam).time_limit_sec > 0 && (
                                <div className="flex justify-between">
                                    <span className="text-gray-500">整卷限时</span>
                                    <span className="text-sky-300 font-bold">{parseExamSettings(selectedExam).time_limit_sec} 秒</span>
                                </div>
                            )}
                            <p className="text-xs text-gray-500 pt-2 border-t border-gray-700 leading-relaxed">
                                在现场图上点击隐患位置得分；误点达到上限后揭晓答案。请仔细观察 PPE、临边、用电等红线。
                            </p>
                        </div>
                        <div className="flex gap-3">
                            <button type="button" onClick={() => onBack(2)} className="px-4 py-3 rounded-xl bg-gray-700 text-white font-bold flex items-center gap-1">
                                <ChevronLeft className="w-4 h-4" /> 上一步
                            </button>
                            <button
                                type="button"
                                onClick={() => onStart(selectedExam)}
                                className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white font-black py-4 rounded-2xl flex items-center justify-center gap-2"
                            >
                                <ShieldCheck className="w-5 h-5" /> 确认并开始考核
                            </button>
                        </div>
                    </div>
                )}
            </div>
            <ExamToast toast={toast} />
        </div>
    );
}
