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
        <div className="flex-1 w-full flex items-center justify-center bg-page p-4 sm:p-8">
            <div className="max-w-xl w-full luxi-card p-6 sm:p-10 bg-raised">
                <div className="text-center mb-8">
                    <div className="w-16 h-16 bg-accent/15 rounded-[12px] flex items-center justify-center mx-auto mb-4 border border-line">
                        <Target className="w-8 h-8 text-accent" />
                    </div>
                    <h1 className="text-[22px] font-semibold text-fg tracking-tight mb-2">考核大厅</h1>
                    <p className="text-muted text-sm">选卷 → 登记身份 → 确认规则 → 开考</p>
                    <div className="flex justify-center gap-2 mt-6">
                        {[1, 2, 3].map((s) => (
                            <div key={s} className={`h-1.5 w-12 rounded-full transition ${lobbyStep >= s ? 'bg-primary' : 'bg-sunken'}`} />
                        ))}
                    </div>
                    <p className="text-xs text-muted mt-2">
                        {lobbyStep === 1 && '步骤 1 / 3 · 选择试卷'}
                        {lobbyStep === 2 && '步骤 2 / 3 · 身份登记'}
                        {lobbyStep === 3 && '步骤 3 / 3 · 规则说明'}
                    </p>
                </div>

                {lobbyStep === 1 && (
                    <div className="space-y-5">
                        <div>
                            <label className="block text-sm font-medium text-secondary mb-2">模式</label>
                            <div className="grid grid-cols-2 gap-2">
                                <button
                                    type="button"
                                    onClick={() => setAttemptMode('exam')}
                                    className={`py-2 rounded-[6px] text-sm font-medium border ${attemptMode === 'exam' ? 'bg-primary border-primary text-white' : 'bg-sunken border-line text-muted'}`}
                                >
                                    正式考核
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setAttemptMode('practice')}
                                    className={`py-2 rounded-[6px] text-sm font-medium border ${attemptMode === 'practice' ? 'bg-info text-white border-info' : 'bg-sunken border-line text-muted'}`}
                                >
                                    练习模式
                                </button>
                            </div>
                            <p className="text-[11px] text-muted mt-2">
                                {attemptMode === 'practice' ? '练习可查看提示，成绩记为 practice，不进正式龙虎榜。' : '考核隐藏部分提示；成绩进正式榜。'}
                            </p>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-secondary mb-2">选择考核试卷</label>
                            <select
                                className="field h-11"
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
                            {allExams.length === 0 && (
                                <p className="text-xs text-muted mt-2">下一步：请管理员在组卷中心发布试卷。</p>
                            )}
                        </div>
                        {selectedExam && (
                            <div className="bg-sunken rounded-[10px] p-5 border border-line">
                                <h3 className="text-accent font-semibold mb-2 flex justify-between text-sm">
                                    卷面详情
                                    <span className="text-muted text-xs font-normal num">
                                        {selectedExam.slides?.length || 0} 题 · 总分 {parseExamSettings(selectedExam).total_score}
                                        {parseExamSettings(selectedExam).time_limit_sec > 0 && ` · 限时 ${parseExamSettings(selectedExam).time_limit_sec}s`}
                                    </span>
                                </h3>
                                <p className="text-sm text-secondary leading-relaxed">
                                    {selectedExam.description || '暂无详细任务指引。'}
                                </p>
                            </div>
                        )}
                        <button
                            type="button"
                            disabled={!selectedExam}
                            onClick={onNext}
                            className="btn btn-primary btn-lg w-full"
                        >
                            下一步：身份登记 <ChevronRight className="w-5 h-5" />
                        </button>
                    </div>
                )}

                {lobbyStep === 2 && (
                    <div className="space-y-4">
                        {currentUser ? (
                            <div className="border border-line rounded-[10px] p-4 text-sm text-secondary bg-sunken">
                                已登录：<b className="text-fg">{currentUser.realName || currentUser.username}</b>
                                {currentUser.departmentName ? ` · ${currentUser.departmentName}` : ''}
                                <span className="block text-xs text-muted mt-1">成绩将绑定账号 user_id</span>
                            </div>
                        ) : (
                            <div className="flex items-center justify-between bg-sunken border border-line rounded-[10px] p-3">
                                <span className="text-xs text-muted">建议登录后开考，便于对账与榜单去重</span>
                                {onRequestLogin && (
                                    <button type="button" onClick={onRequestLogin} className="btn btn-ghost btn-sm">
                                        去登录
                                    </button>
                                )}
                            </div>
                        )}
                        <div>
                            <label className="flex items-center text-sm font-medium text-secondary mb-2">
                                <User className="w-4 h-4 mr-1" /> 姓名 <span className="text-[var(--text-danger)] ml-1">*</span>
                            </label>
                            <input
                                value={userName}
                                onChange={(e) => setUserName(e.target.value)}
                                placeholder="请输入真实姓名"
                                className="field"
                                autoFocus
                                readOnly={!!currentUser}
                            />
                        </div>
                        <div>
                            <label className="flex items-center text-sm font-medium text-secondary mb-2">
                                <Building2 className="w-4 h-4 mr-1" /> 部门（可选）
                            </label>
                            <input
                                value={department}
                                onChange={(e) => setDepartment(e.target.value)}
                                placeholder="如：生产一车间"
                                className="field"
                            />
                        </div>
                        <div>
                            <label className="flex items-center text-sm font-medium text-secondary mb-2">
                                <IdCard className="w-4 h-4 mr-1" /> 工号（可选）
                            </label>
                            <input
                                value={employeeId}
                                onChange={(e) => setEmployeeId(e.target.value)}
                                placeholder="工号 / 手机号"
                                className="field"
                            />
                        </div>
                        <div className="flex gap-2 pt-2">
                            <button type="button" onClick={() => onBack(1)} className="btn btn-secondary">
                                <ChevronLeft className="w-4 h-4" /> 上一步
                            </button>
                            <button type="button" onClick={onNext} className="btn btn-primary flex-1">
                                下一步：规则确认 <ChevronRight className="w-5 h-5" />
                            </button>
                        </div>
                    </div>
                )}

                {lobbyStep === 3 && selectedExam && (
                    <div className="space-y-5">
                        <div className="bg-sunken rounded-[10px] p-5 border border-line space-y-3 text-sm text-secondary">
                            <div className="flex justify-between">
                                <span className="text-muted">考生</span>
                                <span className="font-medium text-fg">{userName}{department ? ` · ${department}` : ''}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-muted">试卷</span>
                                <span className="font-medium text-fg">{selectedExam.examName || selectedExam.name}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-muted">场景题量</span>
                                <span className="num">{selectedExam.slides?.length || 0} 题</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-muted">卷面总分</span>
                                <span className="num">{parseExamSettings(selectedExam).total_score} 分</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-muted">计分规则</span>
                                <span>{parseExamSettings(selectedExam).scoring_rule === 'average' ? '均分赋分' : '权重比例赋分'}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-muted">单题误点容错</span>
                                <span className="text-[var(--text-danger)] font-medium">{MAX_MISS} 次</span>
                            </div>
                            {parseExamSettings(selectedExam).time_limit_sec > 0 && (
                                <div className="flex justify-between">
                                    <span className="text-muted">整卷限时</span>
                                    <span className="text-info font-medium num">{parseExamSettings(selectedExam).time_limit_sec} 秒</span>
                                </div>
                            )}
                            <p className="text-xs text-muted pt-2 border-t border-line leading-relaxed">
                                在现场图上点击隐患位置得分；误点达到上限后揭晓答案。请仔细观察 PPE、临边、用电等红线。
                            </p>
                        </div>
                        <div className="flex gap-2">
                            <button type="button" onClick={() => onBack(2)} className="btn btn-secondary">
                                <ChevronLeft className="w-4 h-4" /> 上一步
                            </button>
                            <button
                                type="button"
                                onClick={() => onStart(selectedExam)}
                                className="btn btn-primary btn-lg flex-1"
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
