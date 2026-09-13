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
  Fingerprint, ClipboardList, Database, BookOpen,
  LogOut, Users, LayoutDashboard, BarChart3, UserCog, Brain, Trophy, ScrollText
} from 'lucide-react';
import { loginAdminAccount, loginAdminPin, restoreAdminSession } from './lib/adminAuth';
import { getLoggedInUser, loginUser, logoutUser, isStaffUser } from './lib/userAuth';
import { SafeSpotMark, SafeSpotWordmark } from './components/Brand/SafeSpotMark';
import AppDeclaration from './components/Brand/AppDeclaration';
import ModalShell from './components/Brand/ModalShell';
import LabProducer from './components/Brand/LabProducer';
import LegalGate, { hasAcceptedLegalGate } from './components/Brand/LegalGate';

const ADMIN_TABS = ['annotation', 'exams', 'knowledge', 'personnel', 'reports', 'analytics', 'inspector', 'audit'];

const ADMIN_NAV = [
  { id: 'annotation', label: '图库标注', short: '标注', icon: Fingerprint },
  { id: 'exams', label: '组卷中心', short: '组卷', icon: ClipboardList },
  { id: 'knowledge', label: '知识与风险', short: '知识', icon: BookOpen },
  { id: 'personnel', label: '人员组织', short: '人员', icon: UserCog },
  { id: 'reports', label: '成绩报表', short: '报表', icon: BarChart3 },
  { id: 'analytics', label: '学情分析', short: '学情', icon: Brain },
  { id: 'inspector', label: '数据巡检', short: '巡检', icon: Database },
  { id: 'audit', label: '操作审计', short: '审计', icon: ScrollText },
];

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
  const [gateOk, setGateOk] = useState(() => hasAcceptedLegalGate());

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
    const root = document.documentElement;
    root.setAttribute('data-product', 'shenwei');
    root.setAttribute('data-density', 'comfortable');
    const theme = !gateOk || mode === 'admin' ? 'light' : 'dark';
    root.setAttribute('data-theme', theme);
  }, [mode, gateOk]);

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

  if (!gateOk) {
    return <LegalGate onAccept={() => setGateOk(true)} />;
  }

  if (mode === 'admin' && !adminUnlocked) {
    return (
      <div className="min-h-screen bg-page flex items-center justify-center p-6">
        <form onSubmit={handleAdminLogin} className="luxi-card shadow-md w-full max-w-md p-8 space-y-5">
          <div className="text-center">
            <div className="flex justify-center mb-3">
              <SafeSpotMark size={56} />
            </div>
            <h1 className="text-[22px] font-semibold text-fg">审微 · ShenWei 管理端</h1>
            <p className="text-sm text-accent mt-1 tracking-wide">察于至微，防于未萌</p>
          </div>
          {!adminUsePin ? (
            <>
              <input
                value={adminForm.username}
                onChange={e => setAdminForm({ ...adminForm, username: e.target.value })}
                placeholder="管理员 / 培训师账号"
                className="field"
                autoFocus
              />
              <input
                type="password"
                value={adminForm.password}
                onChange={e => setAdminForm({ ...adminForm, password: e.target.value })}
                placeholder="密码"
                className="field"
              />
            </>
          ) : (
            <input
              type="password"
              value={adminForm.pin}
              onChange={e => setAdminForm({ ...adminForm, pin: e.target.value })}
              placeholder="管理口令（开发引导）"
              className="field"
              autoFocus
            />
          )}
          {pinError && <p className="text-sm text-[var(--text-danger)]">{pinError}</p>}
          <button
            type="submit"
            disabled={pinLoading || (!adminUsePin ? !adminForm.username || !adminForm.password : !adminForm.pin)}
            className="btn btn-primary btn-lg w-full"
          >
            {pinLoading ? '验证中…' : '进入管理端'}
          </button>
          <button
            type="button"
            onClick={() => { setAdminUsePin(!adminUsePin); setPinError(''); }}
            className="btn btn-ghost w-full"
          >
            {adminUsePin ? '使用账号密码登录' : '改用开发口令'}
          </button>
          <button type="button" onClick={() => navigate('play')} className="btn btn-ghost w-full">
            返回学员考核大厅
          </button>
          <p className="text-[10px] text-center text-muted">开发账号 admin / admin123 · 生产请改密</p>
          <LabProducer compact />
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-page text-fg flex flex-col">
      <header className="h-header sticky top-0 z-[100] bg-[color-mix(in_oklab,var(--bg-card)_86%,transparent)] border-b border-line backdrop-blur-[16px] saturate-[140%]">
        <div className="h-full px-4 sm:px-6 flex justify-between items-center gap-3">
          <div className="flex items-center min-w-0 gap-3">
            <button
              type="button"
              className="flex-shrink-0 flex items-center cursor-pointer hover:opacity-80 transition bg-transparent p-0 border-0"
              onClick={() => setShowCopyright(true)}
              title="应用声明"
            >
              <SafeSpotWordmark size={32} />
              <span className="hidden lg:inline ml-3 text-[11px] font-semibold tracking-[0.12em] text-accent">
                察于至微，防于未萌
              </span>
            </button>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            {health && (
              <span
                className={`hidden md:inline-flex items-center text-[10px] font-mono px-2 py-1 rounded-full border ${
                  backendOk
                    ? 'border-line text-[var(--text-ok)] bg-sunken'
                    : 'border-[var(--alert-red)]/30 text-[var(--text-danger)] bg-sunken'
                }`}
                title={JSON.stringify(health)}
              >
                <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${backendOk ? 'bg-[var(--state-up)]' : 'bg-[var(--state-down)]'}`} />
                {backendOk ? '后端就绪' : '后端异常'}
              </span>
            )}

            {mode === 'play' && (
              currentUser ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-secondary max-w-[140px] truncate" title={currentUser.username}>
                    {currentUser.realName || currentUser.username}
                    {currentUser.departmentName ? ` · ${currentUser.departmentName}` : ''}
                  </span>
                  <button
                    onClick={handleUserLogout}
                    className="btn btn-ghost btn-sm"
                  >
                    退出登录
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowUserLogin(true)}
                  className="btn btn-secondary btn-sm"
                >
                  <Users className="w-4 h-4" /> <span className="hidden sm:inline">学员登录</span>
                </button>
              )
            )}

            {mode === 'play' && !kiosk ? (
              <button
                onClick={() => navigate('admin')}
                className="btn btn-ghost btn-sm"
                title="管理端"
              >
                <LayoutDashboard className="w-4 h-4" /> <span className="hidden sm:inline">管理端</span>
              </button>
            ) : mode === 'admin' ? (
              <>
                <button
                  onClick={() => navigate('play')}
                  className="btn btn-secondary btn-sm"
                >
                  <Users className="w-4 h-4" /> 学员端
                </button>
                <button
                  onClick={handleAdminLogout}
                  className="btn btn-ghost btn-sm"
                  title="退出管理会话"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </>
            ) : null}
          </div>
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        {mode === 'admin' && (
          <aside className="hidden sm:flex w-sidebar flex-col border-r border-line bg-card flex-shrink-0">
            <nav className="flex-1 overflow-y-auto p-2 space-y-0.5">
              {ADMIN_NAV.map((item) => (
                <AdminNavBtn
                  key={item.id}
                  active={adminTab === item.id}
                  onClick={() => goAdminTab(item.id)}
                  icon={item.icon}
                  label={item.label}
                />
              ))}
            </nav>
          </aside>
        )}

        <div className="flex-1 min-w-0 min-h-0 flex flex-col">
          {mode === 'admin' && (
            <div className="sm:hidden flex gap-1 px-2 py-2 overflow-x-auto border-b border-line bg-card">
              {ADMIN_NAV.map((item) => (
                <AdminNavBtn
                  key={item.id}
                  active={adminTab === item.id}
                  onClick={() => goAdminTab(item.id)}
                  icon={item.icon}
                  label={item.short}
                  compact
                />
              ))}
            </div>
          )}

          <main className="flex-1 min-h-0 p-3 sm:p-4 flex flex-col overflow-hidden">
            {mode === 'play' && (
              <div className="w-full flex-1 flex gap-3 min-h-0">
                <div className="flex-1 overflow-hidden border border-line rounded-[10px] bg-[var(--bg-sunken)] flex flex-col min-w-0">
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
                <div className="w-[350px] overflow-hidden border border-line rounded-[10px] bg-card flex-shrink-0 hidden lg:block">
                  <ScoreKeeper activeExamId={activeExamId} refreshKey={scoreRefreshKey} />
                </div>
                <button
                  type="button"
                  onClick={() => setShowBoard(true)}
                  className="lg:hidden fixed bottom-5 right-5 z-40 w-14 h-14 rounded-full bg-[var(--luxi-gold)] text-[#1A2428] shadow-md flex items-center justify-center"
                  title="龙虎榜"
                >
                  <Trophy className="w-6 h-6" />
                </button>
                {showBoard && (
                  <div className="lg:hidden fixed inset-0 z-50 bg-black/50" onClick={() => setShowBoard(false)}>
                    <div className="absolute right-0 top-0 h-full w-[min(100%,380px)] bg-card shadow-lg" onClick={e => e.stopPropagation()}>
                      <div className="p-3 flex justify-end">
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowBoard(false)}>关闭</button>
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
              <div className="w-full flex-1 luxi-card overflow-hidden min-h-0 bg-raised">
                <AnnotationEngine />
              </div>
            )}

            {mode === 'admin' && adminTab === 'exams' && (
              <div className="w-full flex-1 flex luxi-card overflow-hidden min-h-0 bg-raised">
                <div className="flex-1 border-r border-line min-w-0">
                  <TestAssembler editExamId={editExamId} onEditConsumed={() => setEditExamId(null)} />
                </div>
                <div className="w-[350px] bg-sunken flex-shrink-0">
                  <ExamManager onEnterExam={jumpToTest} onEditExam={setEditExamId} />
                </div>
              </div>
            )}

            {mode === 'admin' && adminTab === 'knowledge' && (
              <div className="w-full flex-1 luxi-card overflow-hidden min-h-0 bg-raised">
                <KnowledgeManager />
              </div>
            )}

            {mode === 'admin' && adminTab === 'personnel' && (
              <div className="w-full flex-1 luxi-card overflow-hidden min-h-0 bg-raised">
                <PersonnelManager />
              </div>
            )}

            {mode === 'admin' && adminTab === 'reports' && (
              <div className="w-full flex-1 luxi-card overflow-hidden min-h-0 bg-raised">
                <ReportsDashboard />
              </div>
            )}

            {mode === 'admin' && adminTab === 'analytics' && (
              <div className="w-full flex-1 luxi-card overflow-hidden min-h-0 bg-raised">
                <AnalyticsDashboard />
              </div>
            )}

            {mode === 'admin' && adminTab === 'inspector' && (
              <div className="w-full flex-1 luxi-card overflow-hidden min-h-0 bg-raised">
                <DBInspector />
              </div>
            )}

            {mode === 'admin' && adminTab === 'audit' && (
              <div className="w-full flex-1 luxi-card overflow-hidden min-h-0 bg-raised">
                <AuditDashboard />
              </div>
            )}
          </main>
        </div>
      </div>

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
          <h2 id="user-login-title" className="text-[22px] font-semibold text-fg">学员登录</h2>
          <p className="text-xs text-muted mt-1">使用「人员组织」中创建的账号密码</p>
        </div>
        <input
          required
          value={userLoginForm.username}
          onChange={e => setUserLoginForm({ ...userLoginForm, username: e.target.value })}
          placeholder="用户名"
          className="field"
          autoFocus
        />
        <input
          required
          type="password"
          value={userLoginForm.password}
          onChange={e => setUserLoginForm({ ...userLoginForm, password: e.target.value })}
          placeholder="密码"
          className="field"
        />
        {userLoginError && <p className="text-sm text-[var(--text-danger)]">{userLoginError}</p>}
        <button
          type="submit"
          disabled={userLoginLoading}
          className="btn btn-primary btn-lg w-full"
        >
          {userLoginLoading ? '登录中…' : '登录'}
        </button>
        <p className="text-[10px] text-center text-muted">
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
      type="button"
      onClick={onClick}
      className={`flex items-center w-full ${compact ? 'px-3 py-1.5 w-auto' : 'px-3 py-2'} rounded-[6px] text-[13px] font-medium transition-colors whitespace-nowrap ${
        active
          ? 'bg-primary text-white'
          : 'text-secondary hover:bg-sunken hover:text-fg'
      }`}
    >
      <Icon className="w-4 h-4 mr-2 flex-shrink-0" /> {label}
    </button>
  );
}

export default App;
