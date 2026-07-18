import React, { useState, useEffect, useCallback } from 'react';
import AnnotationEngine from './components/Admin/AnnotationEngine';
import TestAssembler from './components/Admin/TestAssembler';
import InteractionJudge from './components/User/InteractionJudge';
import ScoreKeeper from './components/User/ScoreKeeper';
import ExamManager from './components/Admin/ExamManager';
import DBInspector from './components/Admin/DBInspector';
import KnowledgeManager from './components/Admin/KnowledgeManager';
import PersonnelManager from './components/Admin/PersonnelManager';
import ReportsDashboard from './components/Admin/ReportsDashboard';
import AnalyticsDashboard from './components/Admin/AnalyticsDashboard';
import {
  Fingerprint, ClipboardList, Zap, Database, ShieldCheck, BookOpen,
  LogOut, Lock, Users, LayoutDashboard, BarChart3, UserCog, Brain
} from 'lucide-react';
import { isAdminAuthed, loginAdmin, clearAdminAuth } from './lib/adminAuth';
import { getLoggedInUser, loginUser, clearLoggedInUser } from './lib/userAuth';

function readHashMode() {
  const h = (window.location.hash || '#/play').replace(/^#\/?/, '');
  if (h.startsWith('admin')) return 'admin';
  return 'play';
}

function App() {
  const [mode, setMode] = useState(readHashMode); // play | admin
  const [adminUnlocked, setAdminUnlocked] = useState(() => isAdminAuthed());
  const [adminTab, setAdminTab] = useState('annotation');
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');
  const [pinLoading, setPinLoading] = useState(false);

  // 学员用户登录（与管理 PIN 分离）
  const [currentUser, setCurrentUser] = useState(() => getLoggedInUser());
  const [showUserLogin, setShowUserLogin] = useState(false);
  const [userLoginForm, setUserLoginForm] = useState({ username: '', password: '' });
  const [userLoginError, setUserLoginError] = useState('');
  const [userLoginLoading, setUserLoginLoading] = useState(false);

  const [activeExamId, setActiveExamId] = useState(null);
  const [autoStartExamId, setAutoStartExamId] = useState(null);
  const [scoreRefreshKey, setScoreRefreshKey] = useState(0);
  const [showCopyright, setShowCopyright] = useState(false);
  const [health, setHealth] = useState(null);

  useEffect(() => {
    const onHash = () => setMode(readHashMode());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    fetch('/api/health')
      .then(r => r.json())
      .then(setHealth)
      .catch(() => setHealth({ status: 'error' }));
  }, []);

  const navigate = useCallback((nextMode) => {
    window.location.hash = nextMode === 'admin' ? '#/admin' : '#/play';
    setMode(nextMode);
  }, []);

  const jumpToTest = (examId) => {
    setAutoStartExamId(examId);
    navigate('play');
  };

  const handleAdminLogin = async (e) => {
    e.preventDefault();
    setPinLoading(true);
    setPinError('');
    try {
      await loginAdmin(pinInput);
      setAdminUnlocked(true);
      setPinInput('');
    } catch (err) {
      setPinError(err.message || '口令错误');
    } finally {
      setPinLoading(false);
    }
  };

  const handleAdminLogout = () => {
    clearAdminAuth();
    setAdminUnlocked(false);
    navigate('play');
  };

  const handleUserLogin = async (e) => {
    e.preventDefault();
    setUserLoginLoading(true);
    setUserLoginError('');
    try {
      const user = await loginUser(userLoginForm.username.trim(), userLoginForm.password);
      setCurrentUser(user);
      setShowUserLogin(false);
      setUserLoginForm({ username: '', password: '' });
    } catch (err) {
      setUserLoginError(err.message || '登录失败');
    } finally {
      setUserLoginLoading(false);
    }
  };

  const handleUserLogout = () => {
    clearLoggedInUser();
    setCurrentUser(null);
  };

  const backendOk = health?.status === 'ok' || health?.status === 'degraded';

  // —— 管理端 PIN 闸 ——
  if (mode === 'admin' && !adminUnlocked) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6 font-sans">
        <form onSubmit={handleAdminLogin} className="w-full max-w-md bg-white rounded-3xl shadow-2xl p-8 space-y-5">
          <div className="text-center">
            <div className="w-14 h-14 bg-indigo-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
              <Lock className="w-7 h-7 text-indigo-600" />
            </div>
            <h1 className="text-xl font-black text-gray-900">SafeSpot 管理端</h1>
            <p className="text-sm text-gray-500 mt-1">请输入管理口令后继续</p>
          </div>
          <input
            type="password"
            value={pinInput}
            onChange={e => setPinInput(e.target.value)}
            placeholder="管理口令"
            className="w-full border border-gray-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500"
            autoFocus
          />
          {pinError && <p className="text-sm text-red-500">{pinError}</p>}
          <button
            type="submit"
            disabled={pinLoading || !pinInput}
            className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-300 text-white font-bold py-3 rounded-xl"
          >
            {pinLoading ? '验证中…' : '进入管理端'}
          </button>
          <button type="button" onClick={() => navigate('play')} className="w-full text-sm text-gray-500 hover:text-indigo-600">
            返回学员考核大厅
          </button>
          <p className="text-[10px] text-center text-gray-400">默认口令见 README（可用环境变量 ADMIN_PIN 修改）</p>
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans text-gray-800">
      <header className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-50">
        <div className="w-full mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <div className="flex items-center min-w-0">
              <div
                className="flex-shrink-0 flex items-center cursor-pointer hover:opacity-80 transition"
                onClick={() => setShowCopyright(true)}
                title="点击查看版权信息"
              >
                <ShieldCheck className="w-8 h-8 mr-2 text-indigo-600" />
                <span className="text-2xl font-black text-indigo-600 tracking-tighter">
                  SafeSpot<span className="text-gray-900">.</span>
                </span>
              </div>

              {mode === 'play' ? (
                <div className="hidden sm:ml-8 sm:flex sm:items-center sm:space-x-2">
                  <span className="flex items-center px-4 py-2 rounded-xl text-sm font-bold bg-indigo-600 text-white shadow-lg shadow-indigo-200">
                    <Zap className="w-4 h-4 mr-2" /> 考核大厅
                  </span>
                </div>
              ) : (
                <div className="hidden sm:ml-6 sm:flex sm:space-x-2 overflow-x-auto">
                  <AdminNavBtn active={adminTab === 'annotation'} onClick={() => setAdminTab('annotation')} icon={Fingerprint} label="图库标注" />
                  <AdminNavBtn active={adminTab === 'exams'} onClick={() => setAdminTab('exams')} icon={ClipboardList} label="组卷中心" />
                  <AdminNavBtn active={adminTab === 'knowledge'} onClick={() => setAdminTab('knowledge')} icon={BookOpen} label="知识与风险" />
                  <AdminNavBtn active={adminTab === 'personnel'} onClick={() => setAdminTab('personnel')} icon={UserCog} label="人员组织" />
                  <AdminNavBtn active={adminTab === 'reports'} onClick={() => setAdminTab('reports')} icon={BarChart3} label="成绩报表" />
                  <AdminNavBtn active={adminTab === 'analytics'} onClick={() => setAdminTab('analytics')} icon={Brain} label="学情分析" />
                  <AdminNavBtn active={adminTab === 'inspector'} onClick={() => setAdminTab('inspector')} icon={Database} label="数据巡检" />
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 sm:gap-3">
              {health && (
                <span
                  className={`hidden md:inline-flex items-center text-[10px] font-mono px-2 py-1 rounded-full border ${
                    backendOk ? 'border-emerald-200 text-emerald-700 bg-emerald-50' : 'border-red-200 text-red-600 bg-red-50'
                  }`}
                  title={JSON.stringify(health)}
                >
                  <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${backendOk ? 'bg-emerald-500' : 'bg-red-500'}`} />
                  {backendOk ? '后端就绪' : '后端异常'}
                </span>
              )}

              {mode === 'play' && (
                currentUser ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-600 max-w-[140px] truncate" title={currentUser.username}>
                      {currentUser.realName || currentUser.username}
                      {currentUser.departmentName ? ` · ${currentUser.departmentName}` : ''}
                    </span>
                    <button
                      onClick={handleUserLogout}
                      className="text-xs font-bold text-gray-500 hover:text-red-500 px-2 py-1"
                    >
                      退出登录
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowUserLogin(true)}
                    className="flex items-center px-3 py-2 rounded-xl text-xs sm:text-sm font-bold text-indigo-600 hover:bg-indigo-50 border border-indigo-100"
                  >
                    <Users className="w-4 h-4 mr-1.5" /> 学员登录
                  </button>
                )
              )}

              {mode === 'play' ? (
                <button
                  onClick={() => navigate('admin')}
                  className="flex items-center px-3 py-2 rounded-xl text-xs sm:text-sm font-bold text-gray-600 hover:bg-gray-100 border border-gray-200"
                >
                  <LayoutDashboard className="w-4 h-4 mr-1.5" /> 管理端
                </button>
              ) : (
                <>
                  <button
                    onClick={() => navigate('play')}
                    className="flex items-center px-3 py-2 rounded-xl text-xs sm:text-sm font-bold text-indigo-600 hover:bg-indigo-50 border border-indigo-100"
                  >
                    <Users className="w-4 h-4 mr-1.5" /> 学员端
                  </button>
                  <button
                    onClick={handleAdminLogout}
                    className="flex items-center px-3 py-2 rounded-xl text-xs sm:text-sm font-bold text-gray-500 hover:bg-gray-100"
                    title="退出管理会话"
                  >
                    <LogOut className="w-4 h-4" />
                  </button>
                </>
              )}
            </div>
          </div>

          {/* 移动端管理 Tab */}
          {mode === 'admin' && (
            <div className="sm:hidden flex gap-1 pb-2 overflow-x-auto">
              <AdminNavBtn active={adminTab === 'annotation'} onClick={() => setAdminTab('annotation')} icon={Fingerprint} label="标注" compact />
              <AdminNavBtn active={adminTab === 'exams'} onClick={() => setAdminTab('exams')} icon={ClipboardList} label="组卷" compact />
              <AdminNavBtn active={adminTab === 'knowledge'} onClick={() => setAdminTab('knowledge')} icon={BookOpen} label="知识" compact />
              <AdminNavBtn active={adminTab === 'personnel'} onClick={() => setAdminTab('personnel')} icon={UserCog} label="人员" compact />
              <AdminNavBtn active={adminTab === 'reports'} onClick={() => setAdminTab('reports')} icon={BarChart3} label="报表" compact />
              <AdminNavBtn active={adminTab === 'analytics'} onClick={() => setAdminTab('analytics')} icon={Brain} label="学情" compact />
              <AdminNavBtn active={adminTab === 'inspector'} onClick={() => setAdminTab('inspector')} icon={Database} label="巡检" compact />
            </div>
          )}
        </div>
      </header>

      <main className="flex-1 w-full mx-auto p-4 sm:p-6 flex flex-col h-[calc(100vh-4rem)]">
        {mode === 'play' && (
          <div className="w-full flex-1 flex gap-4 min-h-0">
            <div className="flex-1 shadow-2xl rounded-xl overflow-hidden border border-gray-800 bg-gray-950 flex flex-col min-w-0">
              <InteractionJudge
                onExamStart={setActiveExamId}
                onExamChange={setActiveExamId}
                autoStartExamId={autoStartExamId}
                onAutoStartConsumed={() => setAutoStartExamId(null)}
                onScoreSubmitted={() => setScoreRefreshKey(k => k + 1)}
                currentUser={currentUser}
                onRequestLogin={() => setShowUserLogin(true)}
              />
            </div>
            <div className="w-[350px] shadow-2xl rounded-xl overflow-hidden border border-gray-800 bg-gray-900 flex-shrink-0 hidden lg:block">
              <ScoreKeeper activeExamId={activeExamId} refreshKey={scoreRefreshKey} />
            </div>
          </div>
        )}

        {mode === 'admin' && adminTab === 'annotation' && (
          <div className="w-full flex-1 bg-white shadow-xl rounded-xl overflow-hidden border border-gray-200 min-h-0">
            <AnnotationEngine />
          </div>
        )}

        {mode === 'admin' && adminTab === 'exams' && (
          <div className="w-full flex-1 flex bg-white shadow-xl rounded-xl overflow-hidden border border-gray-200 min-h-0">
            <div className="flex-1 border-r border-gray-200 min-w-0">
              <TestAssembler />
            </div>
            <div className="w-[350px] bg-gray-50 flex-shrink-0">
              <ExamManager onEnterExam={jumpToTest} />
            </div>
          </div>
        )}

        {mode === 'admin' && adminTab === 'knowledge' && (
          <div className="w-full flex-1 shadow-2xl rounded-xl overflow-hidden border border-gray-200 bg-white min-h-0">
            <KnowledgeManager />
          </div>
        )}

        {mode === 'admin' && adminTab === 'personnel' && (
          <div className="w-full flex-1 shadow-2xl rounded-xl overflow-hidden border border-gray-200 bg-white min-h-0">
            <PersonnelManager />
          </div>
        )}

        {mode === 'admin' && adminTab === 'reports' && (
          <div className="w-full flex-1 shadow-2xl rounded-xl overflow-hidden border border-gray-200 bg-white min-h-0">
            <ReportsDashboard />
          </div>
        )}

        {mode === 'admin' && adminTab === 'analytics' && (
          <div className="w-full flex-1 shadow-2xl rounded-xl overflow-hidden border border-gray-200 bg-white min-h-0">
            <AnalyticsDashboard />
          </div>
        )}

        {mode === 'admin' && adminTab === 'inspector' && (
          <div className="w-full flex-1 shadow-2xl rounded-xl overflow-hidden border border-gray-200 bg-white min-h-0">
            <DBInspector />
          </div>
        )}
      </main>

      {/* 学员登录弹窗 */}
      {showUserLogin && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <form onSubmit={handleUserLogin} className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-8 space-y-4 relative">
            <button
              type="button"
              onClick={() => { setShowUserLogin(false); setUserLoginError(''); }}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-700"
            >
              ✕
            </button>
            <div className="text-center mb-2">
              <div className="w-12 h-12 bg-indigo-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
                <Users className="w-6 h-6 text-indigo-600" />
              </div>
              <h2 className="text-xl font-black text-gray-900">学员登录</h2>
              <p className="text-xs text-gray-500 mt-1">使用「人员组织」中创建的账号密码</p>
            </div>
            <input
              required
              value={userLoginForm.username}
              onChange={e => setUserLoginForm({ ...userLoginForm, username: e.target.value })}
              placeholder="用户名"
              className="w-full border border-gray-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500"
              autoFocus
            />
            <input
              required
              type="password"
              value={userLoginForm.password}
              onChange={e => setUserLoginForm({ ...userLoginForm, password: e.target.value })}
              placeholder="密码"
              className="w-full border border-gray-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500"
            />
            {userLoginError && <p className="text-sm text-red-500">{userLoginError}</p>}
            <button
              type="submit"
              disabled={userLoginLoading}
              className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-300 text-white font-bold py-3 rounded-xl"
            >
              {userLoginLoading ? '登录中…' : '登录'}
            </button>
            <p className="text-[10px] text-center text-gray-400">
              演示账号 admin / admin123 · 也可在身份步骤访客手填
            </p>
          </form>
        </div>
      )}

      {showCopyright && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-md">
          <div className="bg-white rounded-3xl shadow-2xl overflow-hidden max-w-md w-full mx-4 flex flex-col">
            <div className="bg-gradient-to-br from-indigo-600 to-indigo-800 p-8 text-center relative border-b-4 border-indigo-400">
              <button
                onClick={() => setShowCopyright(false)}
                className="absolute top-4 right-4 text-white/70 hover:text-white bg-black/10 hover:bg-black/20 rounded-full w-8 h-8 flex items-center justify-center"
              >
                ✕
              </button>
              <div className="w-20 h-20 bg-white/10 backdrop-blur-sm flex items-center justify-center rounded-2xl mx-auto mb-4 border border-white/20">
                <ShieldCheck className="w-12 h-12 text-white" />
              </div>
              <h3 className="text-3xl font-black text-white tracking-tight mb-2">SafeSpot</h3>
              <p className="text-indigo-100 text-sm font-medium">基于「找不同」机制的交互式安全合规平台</p>
              <p className="text-indigo-200/80 text-xs mt-2">工程名 SafeEYE · 产品品牌 SafeSpot</p>
            </div>
            <div className="p-8 pb-6 text-sm text-gray-600 space-y-4">
              <div className="bg-indigo-50/50 p-4 rounded-xl border border-indigo-100/50">
                <h4 className="font-bold text-gray-900 mb-2 flex items-center">
                  <Zap className="w-4 h-4 mr-2 text-indigo-500" /> 视觉交互培训
                </h4>
                <p className="leading-relaxed">通过实景重构、知识关联与找茬考核，让安全风险识别成为可训练的直觉记忆。</p>
              </div>
              <div className="bg-amber-50 p-4 rounded-xl border border-amber-100 flex items-start">
                <Database className="w-5 h-5 mr-3 text-amber-500 flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-bold text-amber-900 mb-1">本地优先</h4>
                  <p className="text-amber-800/80 leading-relaxed">SQLite 本地存储，图片与成绩不出厂，适合敏感场景离线部署。</p>
                </div>
              </div>
            </div>
            <div className="px-8 pb-8 text-center text-xs text-gray-400 border-t border-gray-100 pt-6">
              <p>Copyright © {new Date().getFullYear()} SafeSpot Engineering.</p>
              <p className="font-bold text-gray-700 text-sm tracking-widest mt-2">鹿溪联合创新实验室</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AdminNavBtn({ active, onClick, icon: Icon, label, compact }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center ${compact ? 'px-3 py-1.5' : 'px-4 py-2'} rounded-xl text-sm font-bold transition-all whitespace-nowrap ${
        active ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200' : 'text-gray-500 hover:bg-gray-100'
      }`}
    >
      <Icon className="w-4 h-4 mr-1.5" /> {label}
    </button>
  );
}

export default App;
