import React, { useState, useEffect, useRef } from 'react';
import { AlertTriangle, CheckCircle2, ShieldCheck } from 'lucide-react';
import { getGrade } from '../../lib/grade';
import { api } from '../../lib/api';
import { MAX_MISS, parseExamSettings } from '../../lib/examSettings';
import ExamLobby from './ExamLobby';
import ExamResult from './ExamResult';
import ExamToast from './ExamToast';

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
    const [attemptId, setAttemptId] = useState(null);
    const [attemptMode, setAttemptMode] = useState('exam'); // exam | practice
    const [sessionLog, setSessionLog] = useState([]);
    const sessionLogRef = useRef([]);
    const [timeLeft, setTimeLeft] = useState(null);
    const [missedItems, setMissedItems] = useState([]);

    const [images, setImages] = useState([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [clausesDict, setClausesDict] = useState({});

    const [metaData, setMetaData] = useState(null);
    const [hazardTotal, setHazardTotal] = useState(0);
    const [showClauseDrawer, setShowClauseDrawer] = useState(false);
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
        setUserName(currentUser.realName || currentUser.username || '');
        setDepartment(currentUser.departmentName || '');
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
                    setTimeout(() => submitAttempt(), 50);
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

            const rawExams = await api.get('/api/exams');
            const exams = (Array.isArray(rawExams) ? rawExams : []).filter(e => e.status === 'published');
            setAllExams(exams);
            if (exams.length > 0 && !selectedExam) {
                setSelectedExam(exams[0]);
                if (onExamChange) onExamChange(exams[0].examName || exams[0].name);
            }
        } catch (e) {
            console.error(e);
            showToast('加载考卷失败，请确认后端已启动', 'error');
        }
    };

    const applySlideFromServer = (slide) => {
        if (!slide) return;
        const items = slide.items || [];
        setMetaData(items);
        if (slide.hazardHint != null) setHazardTotal(slide.hazardHint);
        else if (slide.revealed) setHazardTotal(items.length);
        setFoundItems(items.filter((it) => it.found).map((it) => it.id));
        setMissCount(slide.missCount || 0);
        setShowHints(!!slide.revealed);
        const map = {};
        items.forEach((it) => { if (it.points != null) map[it.id] = it.points; });
        setPointScoreMap((prev) => ({ ...prev, ...map }));
        pointScoreMapRef.current = { ...pointScoreMapRef.current, ...map };
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

        try {
            const attempt = await api.post('/api/exam-sessions', {
                examId: examObj.name || examObj.examName,
                mode: attemptMode,
                userName: userName.trim(),
                department: department.trim() || undefined,
                employeeId: employeeId.trim() || undefined
            });
            const settings = parseExamSettings(examObj);
            setExamSettings(settings);
            setExamId(attempt.examId || examObj.examName || examObj.name);
            setAttemptId(attempt.id);
            setImages(testPaper);
            setCurrentIndex(0);
            setTotalScore(attempt.score || 0);
            totalScoreRef.current = attempt.score || 0;
            scoredIdsRef.current = new Set();
            pointScoreMapRef.current = {};
            paperTotalRef.current = attempt.paperTotal || settings.total_score || 100;
            sessionLogRef.current = [];
            setSessionLog([]);
            setMissedItems([]);
            setScoringReady(true);
            setFinalResult(null);
            startedAtRef.current = attempt.startedAt || Date.now();
            if (attempt.timeLeft != null) setTimeLeft(attempt.timeLeft);
            else setTimeLeft(null);
            applySlideFromServer(attempt.slides?.[0]);
            setPhase('testing');
            if (onExamStart) onExamStart(examObj.examName || examObj.name);
        } catch (e) {
            showToast(e.message || '开考失败', 'error');
        }
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
            setShowHints(false);
            setEffectPoint(null);
            if (attemptId) {
                try {
                    const att = await api.get(`/api/exam-sessions/${attemptId}`);
                    applySlideFromServer(att.slides?.[nextIdx]);
                    setTotalScore(att.score || 0);
                    if (att.timeLeft != null) setTimeLeft(att.timeLeft);
                } catch (e) {
                    showToast(e.message || '加载下一题失败', 'error');
                }
            }
            return;
        }
        await submitAttempt();
    };

    const submitAttempt = async () => {
        if (submitting || !attemptId) return;
        setSubmitting(true);
        try {
            const body = await api.post(`/api/exam-sessions/${attemptId}/submit`, {});
            const paperTotal = body.paperTotal || paperTotalRef.current || 100;
            const score = body.score;
            const grade = body.grade
                ? { ...getGrade(score, paperTotal), label: body.grade.label, key: body.grade.key }
                : getGrade(score, paperTotal);
            setMissedItems(body.missed || []);
            setFinalResult({
                score,
                grade,
                paperTotal,
                duration: body.duration,
                mode: body.mode || attemptMode,
                missed: body.missed || [],
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

    const handleCanvasClick = async (e) => {
        if (showHints) return;
        if (!scoringReady || !attemptId) return;
        if (!imageRef.current) return;

        const rect = imageRef.current.getBoundingClientRect();
        const uX = (e.clientX - rect.left) / rect.width;
        const uY = (e.clientY - rect.top) / rect.height;

        try {
            const body = await api.post(`/api/exam-sessions/${attemptId}/click`, {
                slideId: activeImage?.name,
                x: uX,
                y: uY
            });
            if (body.expired) {
                triggerMomentaryEffect(uX, uY, 'miss');
                showToast('考试时间已到，正在交卷', 'error');
                await submitAttempt();
                return;
            }
            if (body.score != null) {
                setTotalScore(body.score);
                totalScoreRef.current = body.score;
            }
            if (body.timeLeft != null) setTimeLeft(body.timeLeft);
            if (body.slide) applySlideFromServer(body.slide);
            triggerMomentaryEffect(uX, uY, body.result === 'hit' ? 'hit' : 'miss');
        } catch (err) {
            showToast(err.message || '判定失败', 'error');
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
    const isAllFound = hazardTotal > 0 && foundItems.length >= hazardTotal;
    const ruleLabel = examSettings.scoring_rule === 'average' ? '均分赋分' : '权重比例赋分';

    if (phase === 'result' && finalResult) {
        return (
            <ExamResult
                finalResult={finalResult}
                userName={userName}
                department={department}
                examId={examId}
                selectedExam={selectedExam}
                clausesDict={clausesDict}
                missedItems={missedItems}
                toast={toast}
                onRetry={() => selectedExam && executeStart(selectedExam)}
                onLobby={() => resetToLobby(true)}
            />
        );
    }

    if (phase !== 'testing') {
        return (
            <ExamLobby
                lobbyStep={lobbyStep}
                attemptMode={attemptMode}
                setAttemptMode={setAttemptMode}
                allExams={allExams}
                selectedExam={selectedExam}
                onSelectExam={(exam) => {
                    setSelectedExam(exam);
                    if (exam && onExamChange) onExamChange(exam.examName || exam.name);
                }}
                currentUser={currentUser}
                onRequestLogin={onRequestLogin}
                userName={userName}
                setUserName={setUserName}
                department={department}
                setDepartment={setDepartment}
                employeeId={employeeId}
                setEmployeeId={setEmployeeId}
                onNext={goNextLobby}
                onBack={(step) => setLobbyStep(step)}
                onStart={executeStart}
                toast={toast}
            />
        );
    }


    // 考试中无图
    if (!activeImage) {
        return <div className="p-10 text-center text-gray-500">检测不到题目…请返回大厅重新选择。</div>;
    }

    return (
        <div className="flex-1 w-full flex bg-gray-900 relative">
            <div className="flex-1 relative flex items-center justify-center bg-black/90 p-4 border-r border-gray-700">
                <div className="absolute top-4 left-4 bg-white/10 backdrop-blur-md px-4 py-2 rounded-lg flex space-x-4 border border-white/20 z-10">
                    <div className="text-white">
                        <span className="text-sm text-gray-400">本题隐患:</span>
                        <span className="ml-2 font-bold text-lg text-emerald-400">
                            {attemptMode === 'practice' || showHints
                                ? `${foundItems.length} / ${hazardTotal || metaData?.length || 0}`
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

            <button
                type="button"
                onClick={() => setShowClauseDrawer(true)}
                className="md:hidden absolute bottom-4 right-4 z-30 bg-indigo-600 text-white text-sm font-bold px-4 py-3 rounded-xl shadow-lg"
            >
                条款 / 下一题
            </button>
            <div className={`w-full md:w-[350px] bg-gray-800 text-gray-200 p-6 flex-col md:flex
                ${showClauseDrawer ? 'fixed inset-0 z-40 flex' : 'hidden md:flex'}`}>
                <button type="button" className="md:hidden self-end text-sm mb-2" onClick={() => setShowClauseDrawer(false)}>关闭</button>
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
                            找出本题全部隐患后可进入下一关。
                        </div>
                    )}
                </div>
            </div>
            <ExamToast toast={toast} />
        </div>
    );
}
