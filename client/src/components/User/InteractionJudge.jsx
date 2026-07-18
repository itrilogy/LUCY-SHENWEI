import React, { useState, useEffect, useRef } from 'react';
import { Target, AlertTriangle, ShieldCheck, CheckCircle2, User, Building2, IdCard, ChevronRight, ChevronLeft, RotateCcw, Home } from 'lucide-react';
import { hitTestAnnotation } from '../../lib/hitTest';
import { getGrade } from '../../lib/grade';
import { buildPointScoreMap, clampScore } from '../../lib/scoring';

const MAX_MISS = 3;

function parseExamSettings(examObj) {
    const total =
        examObj?.totalScore ??
        examObj?.total_score ??
        examObj?.settings?.totalScore ??
        examObj?.settings?.total_score ??
        100;
    const rule =
        examObj?.scoringRule ??
        examObj?.scoring_rule ??
        examObj?.settings?.scoringRule ??
        examObj?.settings?.scoring_rule ??
        'weighted';
    const timeLimit =
        examObj?.timeLimitSec ??
        examObj?.time_limit_sec ??
        examObj?.settings?.timeLimitSec ??
        examObj?.settings?.time_limit_sec ??
        0;
    return {
        total_score: Number(total) || 100,
        scoring_rule: rule || 'weighted',
        time_limit_sec: Number(timeLimit) || 0
    };
}

export default function InteractionJudge({
    onExamStart,
    onExamChange,
    autoStartExamId,
    onAutoStartConsumed,
    onScoreSubmitted,
    currentUser = null,
    onRequestLogin
}) {
    const [allExams, setAllExams] = useState([]);
    const [phase, setPhase] = useState('lobby'); // lobby | testing | result
    const [lobbyStep, setLobbyStep] = useState(1); // 1 选卷 2 身份 3 规则
    const [selectedExam, setSelectedExam] = useState(null);

    const [userName, setUserName] = useState('');
    const [department, setDepartment] = useState('');
    const [employeeId, setEmployeeId] = useState('');
    const [userId, setUserId] = useState(null);
    const [departmentId, setDepartmentId] = useState(null);
    const [roster, setRoster] = useState([]);
    const [attemptMode, setAttemptMode] = useState('exam'); // exam | practice
    const [sessionLog, setSessionLog] = useState([]);
    const sessionLogRef = useRef([]);
    const [timeLeft, setTimeLeft] = useState(null);
    const [missedItems, setMissedItems] = useState([]);

    const [images, setImages] = useState([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [clausesDict, setClausesDict] = useState({});

    const [metaData, setMetaData] = useState(null);
    const [foundItems, setFoundItems] = useState([]);
    const [missCount, setMissCount] = useState(0);
    const [showHints, setShowHints] = useState(false);

    const [effectPoint, setEffectPoint] = useState(null);
    const imageRef = useRef(null);

    const [examId, setExamId] = useState(null);
    const [totalScore, setTotalScore] = useState(0);
    const totalScoreRef = useRef(0);
    const startedAtRef = useRef(null);
    /** 已得分的隐患点 ID（整卷会话级，防重复计分） */
    const scoredIdsRef = useRef(new Set());
    /** 分值表用 ref，避免闭包陈旧 + 禁止在 setState 里写副作用 */
    const pointScoreMapRef = useRef({});
    const paperTotalRef = useRef(100);

    const [toast, setToast] = useState({ show: false, message: '', type: 'success' });
    const showToast = (message, type = 'success') => {
        setToast({ show: true, message, type });
        setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 4000);
    };

    const [examSettings, setExamSettings] = useState({ total_score: 100, scoring_rule: 'weighted' });
    const [pointScoreMap, setPointScoreMap] = useState({});
    const [finalResult, setFinalResult] = useState(null);
    const [submitting, setSubmitting] = useState(false);
    const [scoringReady, setScoringReady] = useState(false);

    useEffect(() => {
        fetchInitData();
    }, []);

    // 登录用户自动填入身份
    useEffect(() => {
        if (!currentUser) return;
        setUserId(currentUser.id || null);
        setUserName(currentUser.realName || currentUser.username || '');
        setDepartment(currentUser.departmentName || '');
        setDepartmentId(currentUser.departmentId || null);
        setEmployeeId(currentUser.employeeNo || '');
    }, [currentUser]);

    // 整卷倒计时（考核模式 + 限时 > 0）
    useEffect(() => {
        if (phase !== 'testing' || !timeLeft || timeLeft <= 0) return;
        const t = setInterval(() => {
            setTimeLeft(prev => {
                if (prev == null) return prev;
                if (prev <= 1) {
                    clearInterval(t);
                    setShowHints(true);
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
        return () => clearInterval(t);
    }, [phase, timeLeft != null && timeLeft > 0]);

    useEffect(() => {
        if (autoStartExamId && allExams.length > 0) {
            const match = allExams.find(e => (e.examName || e.name) === autoStartExamId);
            if (match) {
                setSelectedExam(match);
                if (onExamChange) onExamChange(match.examName || match.name);
                setLobbyStep(2);
                setPhase('lobby');
                if (onAutoStartConsumed) onAutoStartConsumed();
            }
        }
    }, [autoStartExamId, allExams]);

    const pushLog = (entry) => {
        const row = {
            v: 2,
            t: Date.now(),
            type: entry.type || 'click',
            ...entry
        };
        sessionLogRef.current = [...sessionLogRef.current, row];
        setSessionLog(sessionLogRef.current);
    };

    const fetchInitData = async () => {
        try {
            const kRes = await fetch('/api/knowledge');
            const kData = await kRes.json();
            const dict = {};
            kData.knowledgeTree?.forEach(sceneObj => {
                sceneObj.types?.forEach(typeObj => {
                    typeObj.items?.forEach(item => {
                        dict[item.id] = { name: typeObj.typeName, content: item.clause, desc: item.desc };
                    });
                });
            });
            setClausesDict(dict);

            const [pRes, rosterRes] = await Promise.all([
                fetch('/api/exams'),
                fetch('/api/org/roster')
            ]);
            if (pRes.ok) {
                const rawExams = await pRes.json();
                const exams = rawExams.filter(e => e.status === 'published');
                setAllExams(exams);
                if (exams.length > 0 && !selectedExam) {
                    setSelectedExam(exams[0]);
                    if (onExamChange) onExamChange(exams[0].examName || exams[0].name);
                }
            }
            if (rosterRes.ok) {
                setRoster(await rosterRes.json());
            }
        } catch (e) {
            console.error(e);
            showToast('加载考卷失败，请确认后端已启动', 'error');
        }
    };

    const pickRosterUser = (uid) => {
        if (!uid) {
            setUserId(null);
            setDepartmentId(null);
            return;
        }
        const u = roster.find(x => x.userId === uid);
        if (!u) return;
        setUserId(u.userId);
        setUserName(u.realName || u.username);
        setDepartment(u.departmentName || '');
        setDepartmentId(u.departmentId || null);
        setEmployeeId(u.employeeNo || '');
    };

    const calculateExamStats = async (slides, settings) => {
        let allPoints = [];
        for (const slide of slides) {
            try {
                const res = await fetch(`/api/assets/meta/${slide}`);
                const data = await res.json();
                allPoints.push(...(data.meta?.items || []));
            } catch (e) {
                console.error('获取题目元数据失败', e);
            }
        }

        const scoreMap = buildPointScoreMap(allPoints, settings);
        const paperTotal = settings.total_score || 100;
        const mapSum = Object.values(scoreMap).reduce((a, b) => a + b, 0);
        // 防御：分值表总和必须等于卷面总分
        if (allPoints.length > 0 && mapSum !== paperTotal) {
            console.warn('[SafeSpot] 分值表总和异常', { mapSum, paperTotal, scoreMap });
        }

        pointScoreMapRef.current = scoreMap;
        paperTotalRef.current = paperTotal;
        setPointScoreMap(scoreMap);
        setScoringReady(true);
        return scoreMap;
    };

    const loadQuestion = async (img) => {
        if (!img) return;
        const res = await fetch(`/api/assets/meta/${img.name}`);
        const data = await res.json();
        setMetaData(data.meta?.items || []);
        setFoundItems([]);
        setMissCount(0);
        setShowHints(false);
        setEffectPoint(null);
    };

    const executeStart = async (examObj) => {
        if (!userName.trim()) {
            showToast('请先填写姓名', 'error');
            setLobbyStep(2);
            return;
        }
        const testPaper = (examObj.slides || []).map(name => ({
            name,
            url: `/assets/raw/${name}`
        }));
        if (testPaper.length === 0) {
            showToast('该试卷没有题目', 'error');
            return;
        }

        const settings = parseExamSettings(examObj);
        setExamSettings(settings);
        setExamId(examObj.examName || examObj.name);
        setImages(testPaper);
        setCurrentIndex(0);
        setTotalScore(0);
        totalScoreRef.current = 0;
        scoredIdsRef.current = new Set();
        pointScoreMapRef.current = {};
        paperTotalRef.current = settings.total_score || 100;
        sessionLogRef.current = [];
        setSessionLog([]);
        setMissedItems([]);
        setScoringReady(false);
        setFinalResult(null);
        startedAtRef.current = Date.now();
        if (attemptMode === 'exam' && settings.time_limit_sec > 0) {
            setTimeLeft(settings.time_limit_sec);
        } else {
            setTimeLeft(null);
        }

        await calculateExamStats(examObj.slides, settings);
        await loadQuestion(testPaper[0]);
        setPhase('testing');
        if (onExamStart) onExamStart(examObj.examName || examObj.name);
    };

    const goNextLobby = () => {
        if (lobbyStep === 1) {
            if (!selectedExam) {
                showToast('请选择考核试卷', 'error');
                return;
            }
            setLobbyStep(2);
        } else if (lobbyStep === 2) {
            if (!userName.trim()) {
                showToast('姓名为必填项', 'error');
                return;
            }
            setLobbyStep(3);
        }
    };

    const handleNext = async () => {
        if (currentIndex < images.length - 1) {
            const nextIdx = currentIndex + 1;
            setCurrentIndex(nextIdx);
            loadQuestion(images[nextIdx]);
            return;
        }

        if (submitting) return;
        setSubmitting(true);
        const paperTotal = paperTotalRef.current || examSettings.total_score || 100;
        // 交卷前按「已得分点」从分值表重算，杜绝过程中累加误差
        let recomputed = 0;
        scoredIdsRef.current.forEach((id) => {
            recomputed += pointScoreMapRef.current[id] || 0;
        });
        const score = clampScore(recomputed, paperTotal);
        totalScoreRef.current = score;
        setTotalScore(score);
        const duration = startedAtRef.current ? Date.now() - startedAtRef.current : null;
        const grade = getGrade(score, paperTotal);

        // 未命中点写入 session_log，供错题本/薄弱点
        const unfound = [];
        for (const img of images) {
            try {
                const res = await fetch(`/api/assets/meta/${img.name}`);
                const data = await res.json();
                for (const it of (data.meta?.items || [])) {
                    if (!scoredIdsRef.current.has(it.id)) {
                        unfound.push(it);
                        pushLog({
                            type: 'submit',
                            result: 'unfound',
                            itemId: it.id,
                            clauseId: it.clauseId,
                            label: it.description || it.clauseId,
                            slideId: img.name
                        });
                    }
                }
            } catch (_) { /* ignore */ }
        }
        setMissedItems(unfound);

        try {
            const res = await fetch('/api/session/record', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userName: userName.trim(),
                    department: department.trim() || undefined,
                    employeeId: employeeId.trim() || undefined,
                    userId: userId || undefined,
                    departmentId: departmentId || undefined,
                    examId: examId || 'Fallback-Training',
                    examName: selectedExam?.examName || examId,
                    score,
                    paperTotal,
                    duration,
                    mode: attemptMode,
                    sessionLog: sessionLogRef.current,
                    hazardsTotal: Object.keys(pointScoreMapRef.current).length,
                    slideCount: images.length,
                    completedAt: Date.now()
                })
            });
            const body = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(body.error || '上传失败');
            }
            setFinalResult({
                score,
                grade,
                paperTotal,
                duration,
                mode: attemptMode,
                missed: unfound,
                pri: body.pri,
                invalidClicks: body.invalidClicks
            });
            setPhase('result');
            if (onScoreSubmitted) onScoreSubmitted({ examId, score });
        } catch (e) {
            showToast(e.message || '成绩上传异常', 'error');
        } finally {
            setSubmitting(false);
        }
    };

    const handleCanvasClick = (e) => {
        if (showHints) return;
        if (!scoringReady) return;
        if (!imageRef.current || !metaData) return;

        const rect = imageRef.current.getBoundingClientRect();
        const uX = (e.clientX - rect.left) / rect.width;
        const uY = (e.clientY - rect.top) / rect.height;

        let hitItem = null;
        for (const item of metaData) {
            if (hitTestAnnotation(uX, uY, item)) {
                hitItem = item;
                break;
            }
        }

        if (hitItem) {
            // 已计分：只播动画，绝不二次加分（含 React StrictMode / 连点）
            if (scoredIdsRef.current.has(hitItem.id)) {
                triggerMomentaryEffect(uX, uY, 'hit');
                return;
            }

            scoredIdsRef.current.add(hitItem.id);
            const scoreToAdd = pointScoreMapRef.current[hitItem.id] || 0;
            const paperTotal = paperTotalRef.current || 100;
            totalScoreRef.current = clampScore(totalScoreRef.current + scoreToAdd, paperTotal);
            setTotalScore(totalScoreRef.current);
            pushLog({
                type: 'click',
                result: 'hit',
                x: uX, y: uY,
                itemId: hitItem.id,
                clauseId: hitItem.clauseId,
                label: hitItem.description || hitItem.clauseId,
                scoreDelta: scoreToAdd,
                slideId: activeImage?.name
            });

            setFoundItems(prev => {
                if (prev.includes(hitItem.id)) return prev;
                const newFound = [...prev, hitItem.id];
                if (newFound.length >= metaData.length) {
                    setTimeout(() => setShowHints(true), 800);
                }
                return newFound;
            });
            triggerMomentaryEffect(uX, uY, 'hit');
        } else {
            const nextMiss = missCount + 1;
            pushLog({
                type: 'click',
                result: 'miss',
                kind: 'invalid_click',
                x: uX, y: uY,
                missIndex: nextMiss,
                slideId: activeImage?.name
            });
            setMissCount(prev => {
                const next = prev + 1;
                if (next >= MAX_MISS) setShowHints(true);
                return next;
            });
            triggerMomentaryEffect(uX, uY, 'miss');
        }
    };

    const triggerMomentaryEffect = (x, y, type) => {
        setEffectPoint({ x, y, type });
        setTimeout(() => setEffectPoint(null), 800);
    };

    const resetToLobby = (keepIdentity = true) => {
        setPhase('lobby');
        setLobbyStep(1);
        setImages([]);
        setCurrentIndex(0);
        setTotalScore(0);
        totalScoreRef.current = 0;
        setFinalResult(null);
        setMetaData(null);
        if (!keepIdentity) {
            setUserName('');
            setDepartment('');
            setEmployeeId('');
        }
    };

    const activeImage = images[currentIndex];
    const isAllFound = foundItems.length === metaData?.length && metaData?.length > 0;
    const ruleLabel = examSettings.scoring_rule === 'average' ? '均分赋分' : '权重比例赋分';

    // —— 结果页 ——
    if (phase === 'result' && finalResult) {
        const g = finalResult.grade;
        return (
            <div className="flex-1 w-full flex items-center justify-center bg-gray-900 p-8">
                <div className="max-w-lg w-full bg-gray-800 rounded-3xl p-10 border border-gray-700 shadow-2xl text-center">
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
                    {(finalResult.missed?.length > 0 || missedItems.length > 0) && (
                        <div className="text-left bg-gray-900/60 rounded-xl p-4 mb-6 max-h-40 overflow-y-auto border border-gray-700">
                            <p className="text-xs font-bold text-amber-400 mb-2">错题本 / 未掌握条款</p>
                            {(finalResult.missed || missedItems).map(it => (
                                <div key={it.id} className="text-xs text-gray-300 mb-1.5 border-b border-gray-800 pb-1">
                                    {clausesDict[it.clauseId]?.desc || it.description || it.clauseId}
                                </div>
                            ))}
                        </div>
                    )}
                    <div className="flex gap-3">
                        <button
                            onClick={() => {
                                if (selectedExam) executeStart(selectedExam);
                            }}
                            className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2"
                        >
                            <RotateCcw className="w-4 h-4" /> 再考一次
                        </button>
                        <button
                            onClick={() => resetToLobby(true)}
                            className="flex-1 bg-gray-700 hover:bg-gray-600 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2"
                        >
                            <Home className="w-4 h-4" /> 返回大厅
                        </button>
                    </div>
                </div>
                {toast.show && (
                    <ToastView toast={toast} />
                )}
            </div>
        );
    }

    // —— 候考大厅三步 ——
    if (phase !== 'testing') {
        return (
            <div className="flex-1 w-full flex items-center justify-center bg-gray-900 p-8">
                <div className="max-w-xl w-full bg-gray-800 rounded-3xl p-10 shadow-3xl border border-gray-700">
                    <div className="text-center mb-8">
                        <div className="w-16 h-16 bg-indigo-600/20 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-indigo-500/30">
                            <Target className="w-8 h-8 text-indigo-500" />
                        </div>
                        <h1 className="text-2xl font-black text-white tracking-tight mb-2">考核大厅</h1>
                        <p className="text-gray-400 text-sm">选卷 → 登记身份 → 确认规则 → 开考</p>
                        <div className="flex justify-center gap-2 mt-6">
                            {[1, 2, 3].map(s => (
                                <div
                                    key={s}
                                    className={`h-1.5 w-12 rounded-full transition ${lobbyStep >= s ? 'bg-indigo-500' : 'bg-gray-700'}`}
                                />
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
                                        const exam = allExams.find(ex => (ex.examName || ex.name) === e.target.value);
                                        setSelectedExam(exam || null);
                                        if (exam && onExamChange) onExamChange(exam.examName || exam.name);
                                    }}
                                >
                                    {allExams.length === 0 && <option value="">暂无已发布的试卷</option>}
                                    {allExams.map(ex => (
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
                                disabled={!selectedExam}
                                onClick={goNextLobby}
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
                                        <button
                                            type="button"
                                            onClick={onRequestLogin}
                                            className="text-xs font-bold text-indigo-400 hover:text-indigo-300 px-2 py-1"
                                        >
                                            去登录
                                        </button>
                                    )}
                                </div>
                            )}
                            {roster.length > 0 && !currentUser && (
                                <div>
                                    <label className="flex items-center text-sm font-bold text-gray-400 mb-2">
                                        从名册选择
                                    </label>
                                    <select
                                        className="w-full bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 text-white outline-none focus:ring-2 focus:ring-indigo-500"
                                        value={userId || ''}
                                        onChange={e => pickRosterUser(e.target.value)}
                                    >
                                        <option value="">— 访客手填 —</option>
                                        {roster.map(u => (
                                            <option key={u.userId} value={u.userId}>
                                                {u.realName}{u.departmentName ? ` · ${u.departmentName}` : ''}{u.employeeNo ? ` · ${u.employeeNo}` : ''}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            )}
                            <div>
                                <label className="flex items-center text-sm font-bold text-gray-400 mb-2">
                                    <User className="w-4 h-4 mr-1" /> 姓名 <span className="text-red-400 ml-1">*</span>
                                </label>
                                <input
                                    value={userName}
                                    onChange={e => { setUserName(e.target.value); if (!currentUser) setUserId(null); }}
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
                                    onChange={e => setDepartment(e.target.value)}
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
                                    onChange={e => setEmployeeId(e.target.value)}
                                    placeholder="工号 / 手机号"
                                    className="w-full bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 text-white outline-none focus:ring-2 focus:ring-indigo-500"
                                />
                            </div>
                            <div className="flex gap-3 pt-2">
                                <button
                                    onClick={() => setLobbyStep(1)}
                                    className="px-4 py-3 rounded-xl bg-gray-700 text-white font-bold flex items-center gap-1"
                                >
                                    <ChevronLeft className="w-4 h-4" /> 上一步
                                </button>
                                <button
                                    onClick={goNextLobby}
                                    className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2"
                                >
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
                                <p className="text-xs text-gray-500 pt-2 border-t border-gray-700 leading-relaxed">
                                    在现场图上点击隐患位置得分；误点达到上限后揭晓答案。请仔细观察 PPE、临边、用电等红线。
                                </p>
                            </div>
                            <div className="flex gap-3">
                                <button
                                    onClick={() => setLobbyStep(2)}
                                    className="px-4 py-3 rounded-xl bg-gray-700 text-white font-bold flex items-center gap-1"
                                >
                                    <ChevronLeft className="w-4 h-4" /> 上一步
                                </button>
                                <button
                                    onClick={() => executeStart(selectedExam)}
                                    className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white font-black py-4 rounded-2xl flex items-center justify-center gap-2"
                                >
                                    <ShieldCheck className="w-5 h-5" /> 确认并开始考核
                                </button>
                            </div>
                        </div>
                    )}
                </div>
                {toast.show && <ToastView toast={toast} />}
            </div>
        );
    }

    // 考试中无图
    if (!activeImage) {
        return <div className="p-10 text-center text-gray-500">检测不到题目…请返回大厅重新选择。</div>;
    }

    return (
        <div className="flex-1 w-full flex bg-gray-900">
            <div className="flex-1 relative flex items-center justify-center bg-black/90 p-4 border-r border-gray-700">
                <div className="absolute top-4 left-4 bg-white/10 backdrop-blur-md px-4 py-2 rounded-lg flex space-x-4 border border-white/20 z-10">
                    <div className="text-white">
                        <span className="text-sm text-gray-400">本题隐患:</span>
                        <span className="ml-2 font-bold text-lg text-emerald-400">
                            {attemptMode === 'practice' || showHints
                                ? `${foundItems.length} / ${metaData?.length || 0}`
                                : `${foundItems.length} 已发现`}
                        </span>
                    </div>
                    <div className="border-l border-white/20" />
                    <div className="text-white">
                        <span className="text-sm text-gray-400">误点:</span>
                        <span className="ml-2 font-bold text-lg text-red-400">{missCount} / {MAX_MISS}</span>
                    </div>
                    <div className="border-l border-white/20" />
                    <div className="text-white">
                        <span className="text-sm text-gray-400">得分:</span>
                        <span className="ml-2 font-bold text-lg text-amber-300">
                            {Math.round(totalScore)}
                            <span className="text-xs text-gray-400 font-normal"> / {paperTotalRef.current || 100}</span>
                        </span>
                    </div>
                    {timeLeft != null && (
                        <>
                            <div className="border-l border-white/20" />
                            <div className="text-white">
                                <span className="text-sm text-gray-400">剩余:</span>
                                <span className={`ml-2 font-bold text-lg ${timeLeft <= 30 ? 'text-red-400' : 'text-sky-300'}`}>
                                    {Math.floor(timeLeft / 60)}:{String(timeLeft % 60).padStart(2, '0')}
                                </span>
                            </div>
                        </>
                    )}
                    <div className="border-l border-white/20" />
                    <div className={`text-xs font-bold px-2 py-1 rounded self-center ${attemptMode === 'practice' ? 'bg-sky-600/40 text-sky-200' : 'bg-indigo-600/40 text-indigo-200'}`}>
                        {attemptMode === 'practice' ? '练习' : '考核'}
                    </div>
                </div>

                <div className="relative flex items-center justify-center w-full h-full p-4 overflow-hidden">
                    <div className="relative inline-block shadow-2xl" style={{ maxWidth: '100%', maxHeight: '100%' }}>
                        <img
                            ref={imageRef}
                            src={activeImage.url}
                            alt="现场原片"
                            className={`block select-none cursor-crosshair transition pointer-events-auto ${showHints ? 'opacity-50' : ''}`}
                            style={{ maxWidth: '100%', maxHeight: 'calc(100vh - 200px)', width: 'auto', height: 'auto' }}
                            draggable="false"
                            onClick={handleCanvasClick}
                        />

                        {metaData?.map(item => {
                            const isFound = foundItems.includes(item.id);
                            if (!isFound && !showHints) return null;
                            return (
                                <div
                                    key={item.id}
                                    className={`absolute border-[3px] transition-all duration-500 pointer-events-none
                                      ${isFound ? 'border-emerald-500 bg-emerald-500/30 shadow-[0_0_15px_rgba(16,185,129,0.5)]' : 'border-red-500 border-dashed bg-red-500/20'}
                                      ${item.shape === 'circle' ? 'rounded-[50%]' : 'rounded-sm'}`}
                                    style={{
                                        left: `${item.rect.x * 100}%`, top: `${item.rect.y * 100}%`,
                                        width: `${item.rect.w * 100}%`, height: `${item.rect.h * 100}%`
                                    }}
                                >
                                    <div className={`absolute -top-7 left-0 px-2 py-1 text-xs text-white font-bold whitespace-nowrap rounded z-10 shadow ${isFound ? 'bg-emerald-600' : 'bg-red-600'}`}>
                                        {isFound ? '命中' : '遗漏'} · {pointScoreMap[item.id] ?? item.scoreWeight} 分
                                    </div>
                                </div>
                            );
                        })}

                        {effectPoint && (
                            <div
                                className={`absolute w-12 h-12 -ml-6 -mt-6 rounded-full border-4 pointer-events-none animate-ping
                                   ${effectPoint.type === 'hit' ? 'border-emerald-400' : 'border-red-500'}`}
                                style={{ left: `${effectPoint.x * 100}%`, top: `${effectPoint.y * 100}%` }}
                            />
                        )}
                    </div>
                </div>
            </div>

            <div className="w-[350px] bg-gray-800 text-gray-200 p-6 flex flex-col">
                <div className="mb-4 pb-4 border-b border-gray-700">
                    <h2 className="text-xl font-bold flex items-center">
                        <Target className="w-5 h-5 mr-2 text-blue-400" />
                        第 {currentIndex + 1} 题
                        <span className="text-sm font-normal text-gray-500 ml-2">/ 共 {images.length} 题</span>
                    </h2>
                    <p className="text-xs text-gray-500 mt-1">{userName} · {ruleLabel}</p>
                </div>

                <div className="flex-1 overflow-y-auto space-y-4">
                    {foundItems.length === 0 && !showHints && (
                        <div className="text-center text-gray-500 py-10">
                            <ShieldCheck className="w-12 h-12 mx-auto mb-3 opacity-20" />
                            <p>请点击左侧现场图片<br />排查隐患位置…</p>
                        </div>
                    )}

                    {metaData?.map((item, idx) => {
                        const isFound = foundItems.includes(item.id);
                        if (!isFound && !showHints) return null;
                        const clauseDetail = clausesDict[item.clauseId];
                        return (
                            <div key={item.id} className={`p-3 rounded-lg border ${isFound ? 'border-emerald-500/50 bg-emerald-900/20' : 'border-red-500/50 bg-red-900/20'}`}>
                                <div className="flex justify-between items-start mb-2">
                                    <span className={`text-xs font-bold px-2 py-1 rounded ${isFound ? 'bg-emerald-800 text-emerald-100' : 'bg-red-800 text-red-100'}`}>
                                        {isFound ? `命中隐患 ${idx + 1}` : `遗漏 ${idx + 1}`}
                                    </span>
                                    <span className="text-xs text-gray-400">{pointScoreMap[item.id] ?? item.scoreWeight} 分</span>
                                </div>
                                <h4 className="text-sm font-semibold text-blue-300 mb-1">
                                    {clauseDetail?.desc || clauseDetail?.name || item.description || item.clauseId}
                                </h4>
                                <p className="text-xs text-gray-400 leading-relaxed">
                                    {clauseDetail?.content || '缺失法条同步'}
                                </p>
                            </div>
                        );
                    })}
                </div>

                <div className="mt-4 pt-4 border-t border-gray-700">
                    {showHints ? (
                        <div className="space-y-3">
                            {isAllFound ? (
                                <div className="bg-emerald-900/30 text-emerald-400 p-3 rounded text-sm text-center font-bold flex items-center justify-center">
                                    <CheckCircle2 className="w-5 h-5 mr-2" /> 通关！全部排查完毕
                                </div>
                            ) : (
                                <div className="bg-red-900/30 text-red-400 p-3 rounded text-sm text-center font-bold flex items-center justify-center">
                                    <AlertTriangle className="w-5 h-5 mr-2" /> 容错用尽，请研读遗漏项
                                </div>
                            )}
                            <button
                                disabled={submitting}
                                onClick={handleNext}
                                className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 text-white font-bold py-3 rounded-lg shadow-lg transition"
                            >
                                {submitting
                                    ? '提交中…'
                                    : currentIndex < images.length - 1
                                        ? '进行下一场景'
                                        : '终结并提交考卷'}
                            </button>
                        </div>
                    ) : (
                        <div className="text-xs text-center text-gray-500 bg-gray-900 p-3 rounded border border-gray-700">
                            找出本题全部 {metaData?.length || 0} 处隐患后可进入下一关。
                        </div>
                    )}
                </div>
            </div>
            {toast.show && <ToastView toast={toast} />}
        </div>
    );
}

function ToastView({ toast }) {
    return (
        <div className={`fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-[100] px-8 py-4 rounded-2xl shadow-3xl flex flex-col items-center space-y-3 min-w-[280px] border-2 backdrop-blur-md
            ${toast.type === 'success' ? 'bg-emerald-500/90 text-white border-emerald-400' : 'bg-red-500/90 text-white border-red-400'}`}>
            {toast.type === 'success' ? <CheckCircle2 className="w-10 h-10" /> : <AlertTriangle className="w-10 h-10" />}
            <span className="text-base font-black tracking-wide text-center">{toast.message}</span>
        </div>
    );
}
