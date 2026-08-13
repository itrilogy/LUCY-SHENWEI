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
import AuditDashboard from './components/Admin/AuditDashboard';
import {
  Fingerprint, ClipboardList, Zap, Database, BookOpen,
  LogOut, Users, LayoutDashboard, BarChart3, UserCog, Brain, Trophy, ScrollText
} from 'lucide-react';
import { loginAdminAccount, loginAdminPin, restoreAdminSession } from './lib/adminAuth';
import { getLoggedInUser, loginUser, logoutUser, isStaffUser } from './lib/userAuth';
import { SafeSpotMark, SafeSpotWordmark } from './components/Brand/SafeSpotMark';
import AppDeclaration from './components/Brand/AppDeclaration';
import ModalShell from './components/Brand/ModalShell';
import LabProducer from './components/Brand/LabProducer';

const ADMIN_TABS = ['annotation', 'exams', 'knowledge', 'personnel', 'reports', 'analytics', 'inspector', 'audit'];

function parseHash() {
  const raw = (window.location.hash || '#/play').replace(/^#\/?/, '');
  const [path, qs] = raw.split('?');
  const params = new URLSearchParams(qs || window.location.search || '');
  const parts = path.split('/').filter(Boolean);
  const mode = parts[0] === 'admin' ? 'admin' : 'play';
  const tab = ADMIN_TABS.includes(parts[1]) ? parts[1] : 'annotation';
  const kiosk = params.get('kiosk') === '1';
  return { mode, tab, kiosk };
}

function App() {
  const [mode, setMode] = useState(() => parseHash().mode);
  const [adminUnlocked, setAdminUnlocked] = useState(() => isStaffUser(getLoggedInUser()));
  const [adminTab, setAdminTab] = useState(() => parseHash().tab);
  const [kiosk, setKiosk] = useState(() => parseHash().kiosk);
  const [showBoard, setShowBoard] = useState(false);
  const [adminForm, setAdminForm] = useState({ username: '', password: '', pin: '' });
  const [adminUsePin, setAdminUsePin] = useState(false);
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
  const [editExamId, setEditExamId] = useState(null);
  const [scoreRefreshKey, setScoreRefreshKey] = useState(0);
  const [showCopyright, setShowCopyright] = useState(false);
  const [health, setHealth] = useState(null);

  useEffect(() => {
    const onHash = () => {
      const h = parseHash();
      setMode(h.mode);
      setAdminTab(h.tab);
      setKiosk(h.kiosk);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    fetch('/api/health')
      .then(r => r.json())
      .then(setHealth)
      .catch(() => setHealth({ status: 'error' }));
    restoreAdminSession()
      .then((user) => {
        if (user) {
          setCurrentUser(user);
          setAdminUnlocked(true);
        } else {
          setAdminUnlocked(false);
        }
      })
      .catch(() => setAdminUnlocked(false));
  }, []);

  const navigate = useCallback((nextMode, tab) => {
    if (nextMode === 'admin') {
      const t = ADMIN_TABS.includes(tab) ? tab : (adminTab || 'annotation');
      window.location.hash = `#/admin/${t}`;
      setAdminTab(t);
      setMode('admin');
    } else {
      window.location.hash = kiosk ? '#/play?kiosk=1' : '#/play';
      setMode('play');
    }
  }, [adminTab, kiosk]);

  const goAdminTab = (tab) => {
    setAdminTab(tab);
    window.location.hash = `#/admin/${tab}`;
  };

  const jumpToTest = (examId) => {
    setAutoStartExamId(examId);
    navigate('play');
  };

  const handleAdminLogin = async (e) => {
    e.preventDefault();
    setPinLoading(true);
    setPinError('');
    try {
      const user = adminUsePin
        ? await loginAdminPin(adminForm.pin)
        : await loginAdminAccount(adminForm.username.trim(), adminForm.password);
      setCurrentUser(user);
      setAdminUnlocked(true);
      setAdminForm({ username: '', password: '', pin: '' });
    } catch (err) {
      setPinError(err.message || '登录失败');
    } finally {
      setPinLoading(false);
    }
  };

  const handleAdminLogout = async () => {
    await logoutUser();
    setCurrentUser(null);
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

  const handleUserLogout = async () => {
    await logoutUser();
    setCurrentUser(null);
    setAdminUnlocked(false);
  };

  const backendOk = health?.status === 'ok' || health?.status === 'degraded';

  // —— 管理端 PIN 闸 ——
  if (mode === 'admin' && !adminUnlocked) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6 font-sans">
        <form onSubmit={handleAdminLogin} className="w-full max-w-md bg-white rounded-3xl shadow-2xl p-8 space-y-5">
          <div className="text-center">
            <div className="flex justify-center mb-3">
              <SafeSpotMark size={56} />
            </div>
            <h1 className="text-xl font-black text-gray-900">SafeSpot 管理端</h1>
            <p className="text-sm text-gray-500 mt-1">请输入管理口令后继续</p>
          </div>
          {!adminUsePin ? (
            <>
              <input
                value={adminForm.username}
                onChange={e => setAdminForm({ ...adminForm, username: e.target.value })}
                placeholder="管理员 / 培训师账号"
                className="w-full border border-gray-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500"
                autoFocus
              />
              <input
                type="password"
                value={adminForm.password}
                onChange={e => setAdminForm({ ...adminForm, password: e.target.value })}
                placeholder="密码"
                className="w-full border border-gray-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </>
          ) : (
            <input
              type="password"
              value={adminForm.pin}
              onChange={e => setAdminForm({ ...adminForm, pin: e.target.value })}
              placeholder="管理口令（开发引导）"
              className="w-full border border-gray-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500"
              autoFocus
            />
          )}
          {pinError && <p className="text-sm text-red-500">{pinError}</p>}
          <button
            type="submit"
            disabled={pinLoading || (!adminUsePin ? !adminForm.username || !adminForm.password : !adminForm.pin)}
            className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-300 text-white font-bold py-3 rounded-xl"
          >
            {pinLoading ? '验证中…' : '进入管理端'}
          </button>
          <button
            type="button"
            onClick={() => { setAdminUsePin(!adminUsePin); setPinError(''); }}
            className="w-full text-sm text-gray-500 hover:text-indigo-600"
          >
            {adminUsePin ? '使用账号密码登录' : '改用开发口令'}
          </button>
          <button type="button" onClick={() => navigate('play')} className="w-full text-sm text-gray-500 hover:text-indigo-600">
            返回学员考核大厅
          </button>
          <p className="text-[10px] text-center text-gray-400">开发账号 admin / admin123 · 生产请改密</p>
          <LabProducer compact />
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
              <button
                type="button"
                className="flex-shrink-0 flex items-center cursor-pointer hover:opacity-80 transition bg-transparent p-0 border-0"
                onClick={() => setShowCopyright(true)}
                title="应用声明"
              >
                <SafeSpotWordmark size={34} />
              </button>

              {mode === 'play' ? (
                <div className="hidden sm:ml-8 sm:flex sm:items-center sm:space-x-2">
                  <span className="flex items-center px-4 py-2 rounded-xl text-sm font-bold bg-indigo-600 text-white shadow-lg shadow-indigo-200">
                    <Zap className="w-4 h-4 mr-2" /> 考核大厅
                  </span>
                </div>
              ) : (
                <div className="hidden sm:ml-6 sm:flex sm:space-x-2 overflow-x-auto">
                  <AdminNavBtn active={adminTab === 'annotation'} onClick={() => goAdminTab('annotation')} icon={Fingerprint} label="图库标注" />
                  <AdminNavBtn active={adminTab === 'exams'} onClick={() => goAdminTab('exams')} icon={ClipboardList} label="组卷中心" />
                  <AdminNavBtn active={adminTab === 'knowledge'} onClick={() => goAdminTab('knowledge')} icon={BookOpen} label="知识与风险" />
                  <AdminNavBtn active={adminTab === 'personnel'} onClick={() => goAdminTab('personnel')} icon={UserCog} label="人员组织" />
                  <AdminNavBtn active={adminTab === 'reports'} onClick={() => goAdminTab('reports')} icon={BarChart3} label="成绩报表" />
                  <AdminNavBtn active={adminTab === 'analytics'} onClick={() => goAdminTab('analytics')} icon={Brain} label="学情分析" />
                  <AdminNavBtn active={adminTab === 'inspector'} onClick={() => goAdminTab('inspector')} icon={Database} label="数据巡检" />
                  <AdminNavBtn active={adminTab === 'audit'} onClick={() => goAdminTab('audit')} icon={ScrollText} label="操作审计" />
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

              {mode === 'play' && !kiosk ? (
                <button
                  onClick={() => navigate('admin')}
                  className="flex items-center px-3 py-2 rounded-xl text-xs sm:text-sm font-bold text-gray-600 hover:bg-gray-100 border border-gray-200"
                >
                  <LayoutDashboard className="w-4 h-4 mr-1.5" /> 管理端
                </button>
              ) : mode === 'admin' ? (
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
              ) : null}
            </div>
          </div>

          {/* 移动端管理 Tab */}
          {mode === 'admin' && (
            <div className="sm:hidden flex gap-1 pb-2 overflow-x-auto">
              <AdminNavBtn active={adminTab === 'annotation'} onClick={() => goAdminTab('annotation')} icon={Fingerprint} label="标注" compact />
              <AdminNavBtn active={adminTab === 'exams'} onClick={() => goAdminTab('exams')} icon={ClipboardList} label="组卷" compact />
              <AdminNavBtn active={adminTab === 'knowledge'} onClick={() => goAdminTab('knowledge')} icon={BookOpen} label="知识" compact />
              <AdminNavBtn active={adminTab === 'personnel'} onClick={() => goAdminTab('personnel')} icon={UserCog} label="人员" compact />
              <AdminNavBtn active={adminTab === 'reports'} onClick={() => goAdminTab('reports')} icon={BarChart3} label="报表" compact />
              <AdminNavBtn active={adminTab === 'analytics'} onClick={() => goAdminTab('analytics')} icon={Brain} label="学情" compact />
              <AdminNavBtn active={adminTab === 'inspector'} onClick={() => goAdminTab('inspector')} icon={Database} label="巡检" compact />
              <AdminNavBtn active={adminTab === 'audit'} onClick={() => goAdminTab('audit')} icon={ScrollText} label="审计" compact />
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
            <button
              type="button"
              onClick={() => setShowBoard(true)}
              className="lg:hidden fixed bottom-5 right-5 z-40 w-14 h-14 rounded-full bg-amber-500 text-white shadow-xl flex items-center justify-center"
              title="龙虎榜"
            >
              <Trophy className="w-6 h-6" />
            </button>
            {showBoard && (
              <div className="lg:hidden fixed inset-0 z-50 bg-black/50" onClick={() => setShowBoard(false)}>
                <div className="absolute right-0 top-0 h-full w-[min(100%,380px)] bg-gray-900 shadow-2xl" onClick={e => e.stopPropagation()}>
                  <div className="p-3 flex justify-end">
                    <button type="button" className="text-white text-sm" onClick={() => setShowBoard(false)}>关闭</button>
                  </div>
                  <div className="h-[calc(100%-48px)]">
                    <ScoreKeeper activeExamId={activeExamId} refreshKey={scoreRefreshKey} />
                  </div>
                </div>
              </div>
            )}
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
              <TestAssembler editExamId={editExamId} onEditConsumed={() => setEditExamId(null)} />
            </div>
            <div className="w-[350px] bg-gray-50 flex-shrink-0">
              <ExamManager onEnterExam={jumpToTest} onEditExam={setEditExamId} />
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

        {mode === 'admin' && adminTab === 'audit' && (
          <div className="w-full flex-1 shadow-2xl rounded-xl overflow-hidden border border-gray-200 bg-white min-h-0">
            <AuditDashboard />
          </div>
        )}
      </main>

      <ModalShell
        open={showUserLogin}
        onClose={() => { setShowUserLogin(false); setUserLoginError(''); }}
        as="form"
        onSubmit={handleUserLogin}
        labelledBy="user-login-title"
      >
        <div className="text-center mb-2">
          <div className="flex justify-center mb-3">
            <SafeSpotMark size={48} />
          </div>
          <h2 id="user-login-title" className="text-xl font-black text-gray-900">学员登录</h2>
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
        <LabProducer compact />
      </ModalShell>

      <AppDeclaration
        open={showCopyright}
        onClose={() => setShowCopyright(false)}
        version={health?.version}
      />
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
