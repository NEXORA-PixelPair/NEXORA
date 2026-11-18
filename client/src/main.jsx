import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Activity, ArrowRight, ArrowUpRight, Eye, EyeOff, Mail, BookOpen, Bot, Check, ChevronRight, ChevronDown, CircleHelp,
  Code2, Database, FileCheck2, FileText, FolderKanban, Github, Lightbulb, Rocket,
  LayoutDashboard, LockKeyhole, LogOut, Menu, Moon, Sun, Plus, RefreshCw, Search, Send,
  Settings, ShieldCheck, Sparkles, Target, Users, X, AlertTriangle
} from 'lucide-react';
import './styles.css';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
const WELCOME_CHAT = { role: 'assistant', text: 'Welcome to NEXORA Intelligence. Ask about your project memory, repository reports, unresolved work or a handover.' };

function App() {
  const [introVisible, setIntroVisible] = useState(true);
  const finishIntro = useCallback(() => setIntroVisible(false), []);
  const [token, setToken] = useState(() => localStorage.getItem('nexora_token') || '');
  const [user, setUser] = useState(null);
  const [mode, setMode] = useState('account');
  const [workspace, setWorkspace] = useState(null);
  const [page, setPage] = useState('Overview');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [authTab, setAuthTab] = useState('login');
  const [authForm, setAuthForm] = useState({ name: '', email: '', password: '' });
  const [projectForm, setProjectForm] = useState({ name: '', description: '' });
  const [repositoryList, setRepositoryList] = useState([]);
  const [repoSearch, setRepoSearch] = useState('');
  const [githubStatus, setGithubStatus] = useState({ connected: false, login: null });
  const [selectedReport, setSelectedReport] = useState(null);
  const [question, setQuestion] = useState('');
  const [chat, setChat] = useState([WELCOME_CHAT]);
  const [sources, setSources] = useState([]);
  const [sourceForm, setSourceForm] = useState({ name: '', content: '' });
  const [mobileNav, setMobileNav] = useState(false);
  const [theme, setTheme] = useState(() => localStorage.getItem('nexora_theme') || 'dark');
  const [profileOpen, setProfileOpen] = useState(false);
  const profileMenuRef = useRef(null);

  const headers = () => ({ 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) });
  async function api(path, options = {}) {
    const response = await fetch(`${API}${path}`, { ...options, headers: { ...headers(), ...(options.headers || {}) } });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.message || `Request failed (${response.status})`);
    return body;
  }
  function resetAccountScopedState() {
    // Remove in-memory state that belongs to the previously authenticated account.
    setWorkspace(null); setUser(null); setMode('account'); setPage('Overview');
    setRepositoryList([]); setRepoSearch(''); setGithubStatus({ connected: false, login: null });
    setSelectedReport(null); setQuestion(''); setChat([WELCOME_CHAT]); setSources([]);
    setSourceForm({ name: '', content: '' }); setProjectForm({ name: '', description: '' });
    setAuthForm({ name: '', email: '', password: '' }); setAuthTab('login'); setBusy(false);
    setProfileOpen(false); setMobileNav(false);
  }
  function establishSession(result) {
    resetAccountScopedState();
    localStorage.setItem('nexora_token', result.token);
    setToken(result.token); setUser(result.user); setMode(result.user.mode || 'account');
    setPage('Overview'); setNotice('Your NEXORA workspace is ready.');
  }
  async function loadWorkspace(activeToken = token) {
    if (!activeToken) return;
    const stillCurrent = () => localStorage.getItem('nexora_token') === activeToken;
    const response = await fetch(`${API}/workspace`, { headers: { Authorization: `Bearer ${activeToken}` } });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Unable to load workspace.');
    // Ignore late responses from a previous session after an account switch.
    if (!stillCurrent()) return;
    setWorkspace(data); setUser(data.user); setMode(data.mode || 'account');
    if (data.mode === 'account') {
      const gh = await fetch(`${API}/github/status`, { headers: { Authorization: `Bearer ${activeToken}` } }).then(r => r.ok ? r.json() : { connected: false }).catch(() => ({ connected: false }));
      if (!stillCurrent()) return;
      setGithubStatus(gh);
    } else setGithubStatus({ connected: false, login: null });
    const src = await fetch(`${API}/sources`, { headers: { Authorization: `Bearer ${activeToken}` } }).then(r => r.ok ? r.json() : []).catch(() => []);
    if (!stillCurrent()) return;
    setSources(src);
  }
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const loginCode = params.get('code');
    if (window.location.pathname === '/auth/complete' && loginCode) {
      window.history.replaceState({}, '', '/');
      fetch(`${API}/auth/exchange`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: loginCode }) })
        .then(async response => { const result = await response.json(); if (!response.ok) throw new Error(result.message || 'Google sign-in failed.'); return result; })
        .then(result => establishSession(result))
        .catch(error => setNotice(error.message));
    }
    const authError = params.get('authError'); const ghError = params.get('githubError');
    if (authError || ghError) setNotice(authError || ghError);
    if (params.get('github') === 'connected') {
      setNotice('GitHub connected. Loading your repositories...'); setPage('Repositories'); window.history.replaceState({}, '', '/');
      const sessionToken = localStorage.getItem('nexora_token');
      if (sessionToken) fetch(`${API}/github/repos`, { headers: { Authorization: `Bearer ${sessionToken}` } })
        .then(async response => { const result = await response.json(); if (!response.ok) throw new Error(result.message || 'Could not load repositories.'); return result; })
        .then(result => { setRepositoryList(result.repositories || []); setGithubStatus({ connected: true, login: null }); setNotice(`${result.count || 0} repositories loaded from GitHub.`); })
        .catch(error => setNotice(error.message));
    }
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('nexora_theme', theme);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'light' ? '#F2F5F2' : '#001317');
  }, [theme]);
  useEffect(() => {
    if (!profileOpen) return;
    const closeOnOutside = event => { if (!profileMenuRef.current?.contains(event.target)) setProfileOpen(false); };
    const closeOnEscape = event => { if (event.key === 'Escape') setProfileOpen(false); };
    document.addEventListener('mousedown', closeOnOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => { document.removeEventListener('mousedown', closeOnOutside); document.removeEventListener('keydown', closeOnEscape); };
  }, [profileOpen]);
  useEffect(() => {
    if (!token) { resetAccountScopedState(); return; }
    loadWorkspace(token).catch(error => {
      if (localStorage.getItem('nexora_token') !== token) return;
      setNotice(error.message); localStorage.removeItem('nexora_token'); setToken(''); resetAccountScopedState();
    });
  }, [token]);
  useEffect(() => { if (!notice) return; const t = setTimeout(() => setNotice(''), 5200); return () => clearTimeout(t); }, [notice]);

  async function submitEmailAuth(event) {
    event.preventDefault(); setBusy(true);
    try {
      const endpoint = authTab === 'register' ? '/auth/register' : '/auth/login';
      const result = await api(endpoint, { method: 'POST', body: JSON.stringify(authForm) }); establishSession(result);
    } catch (error) { setNotice(error.message); } finally { setBusy(false); }
  }
  async function startMock() {
    setBusy(true);
    try { const result = await api('/auth/mock', { method: 'POST', body: '{}' }); establishSession(result); }
    catch (error) { setNotice(error.message); } finally { setBusy(false); }
  }
  function signOut() { localStorage.removeItem('nexora_token'); setToken(''); resetAccountScopedState(); setNotice('You have been signed out.'); }
  async function refresh() { try { await loadWorkspace(); } catch (error) { setNotice(error.message); } }
  async function createProject(event) {
    event.preventDefault(); setBusy(true);
    try { await api('/projects', { method: 'POST', body: JSON.stringify(projectForm) }); setProjectForm({ name: '', description: '' }); await refresh(); setPage('Projects'); setNotice('Project created.'); }
    catch (error) { setNotice(error.message); } finally { setBusy(false); }
  }
  async function startGithubConnect() {
    setBusy(true);
    try { const result = await api('/github/connect/start', { method: 'POST', body: '{}' }); window.location.href = result.authorizationUrl; }
    catch (error) { setNotice(error.message); setBusy(false); }
  }
  async function loadRepositories() {
    const requestToken = token; setBusy(true);
    try { const result = await api('/github/repos'); if (localStorage.getItem('nexora_token') !== requestToken) return; setRepositoryList(result.repositories || []); setNotice(`${result.count ?? result.repositories?.length ?? 0} accessible repositories loaded.`); }
    catch (error) { setNotice(error.message); } finally { setBusy(false); }
  }
  async function generateReport(fullName) {
    const requestToken = token; setBusy(true); setNotice(`Creating a pass-on report for ${fullName}...`);
    try { const report = await api('/github/report', { method: 'POST', body: JSON.stringify({ fullName }) }); if (localStorage.getItem('nexora_token') !== requestToken) return; setSelectedReport(report); await refresh(); if (localStorage.getItem('nexora_token') !== requestToken) return; setPage('Pass-on reports'); setNotice('Pass-on report generated and saved to your account.'); }
    catch (error) { setNotice(error.message); } finally { setBusy(false); }
  }
  async function openReport(report) {
    const requestToken = token;
    try { const full = await api(`/reports/${report._id}`); if (localStorage.getItem('nexora_token') !== requestToken) return; setSelectedReport(full); setPage('Pass-on reports'); }
    catch (error) { setNotice(error.message); }
  }
  async function approveReport() {
    if (!selectedReport?._id) return;
    const requestToken = token;
    try { const updated = await api(`/reports/${selectedReport._id}/approve`, { method: 'PATCH', body: '{}' }); if (localStorage.getItem('nexora_token') !== requestToken) return; setSelectedReport(updated); await refresh(); if (localStorage.getItem('nexora_token') !== requestToken) return; setNotice('Pass-on report approved for sharing.'); }
    catch (error) { setNotice(error.message); }
  }
  async function submitQuestion(event) {
    event.preventDefault(); const q = question.trim(); if (!q) return;
    const requestToken = token;
    setQuestion(''); setChat(prev => [...prev, { role: 'user', text: q }]);
    try {
      const response = await fetch(`${API}/ai/ask`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${requestToken}` }, body: JSON.stringify({ question: q }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.message || 'AI request failed.');
      if (localStorage.getItem('nexora_token') !== requestToken) return;
      setChat(prev => [...prev, { role: 'assistant', text: result.answer, sources: result.sources || [], provider: result.provider }]);
    } catch (error) {
      if (localStorage.getItem('nexora_token') === requestToken) setChat(prev => [...prev, { role: 'assistant', text: error.message }]);
    }
  }
  async function addSource(event) {
    event.preventDefault(); setBusy(true);
    try { await api('/sources', { method: 'POST', body: JSON.stringify(sourceForm) }); setSourceForm({ name: '', content: '' }); await refresh(); setPage('Knowledge memory'); setNotice('Knowledge source added to this account.'); }
    catch (error) { setNotice(error.message); } finally { setBusy(false); }
  }

  const intro = introVisible ? <PixelPairIntro onComplete={finishIntro}/> : null;
  if (!token) return <><LoginScreen authTab={authTab} setAuthTab={setAuthTab} form={authForm} setForm={setAuthForm} onSubmit={submitEmailAuth} onGoogle={() => { window.location.href = `${API}/auth/google`; }} onMock={startMock} busy={busy} notice={notice} />{intro}</>;
  if (!workspace) return <><div className="loading-screen"><img className="loading-brand-mark" src="/brand/nexora-mark.png" alt="NEXORA"/><p>Preparing your knowledge workspace...</p></div>{intro}</>;

  const isMock = mode === 'mock';
  const projects = workspace.projects || []; const reports = workspace.reports || []; const risks = workspace.risks || [];
  const navigation = [
    { label: 'Overview', icon: LayoutDashboard, group: 'Workspace' },
    { label: 'Projects', icon: FolderKanban, group: 'Workspace' },
    ...(!isMock ? [{ label: 'Repositories', icon: Github, group: 'Workspace' }] : []),
    { label: 'Pass-on reports', icon: FileCheck2, group: 'Workspace' },
    { label: 'Knowledge memory', icon: BookOpen, group: 'Intelligence' },
    { label: 'Knowledge radar', icon: Target, group: 'Intelligence' },
    { label: 'AI assistant', icon: Bot, group: 'Intelligence' },
    { label: 'Settings', icon: Settings, group: 'Manage' }
  ];
  const filteredRepos = repositoryList.filter(repo => `${repo.fullName} ${repo.description || ''} ${repo.language || ''}`.toLowerCase().includes(repoSearch.toLowerCase()));

  return <><div className="app-frame">
    <aside className={`sidebar ${mobileNav ? 'sidebar-open' : ''}`}>
      <div className="brand-row"><div className="sidebar-brand-lockup"><img src="/brand/nexora-mark.png" alt=""/><strong>NEXORA</strong></div><button className="icon-button sidebar-close" onClick={() => setMobileNav(false)}><X size={18}/></button></div>
      <div className="workspace-tag"><span className="workspace-avatar">{(user?.name || 'N').slice(0,1).toUpperCase()}</span><div><b>{isMock ? 'Demo workspace' : user?.name}</b><small>{isMock ? 'Mock database' : 'Private account space'}</small></div></div>
      {['Workspace','Intelligence','Manage'].map(group => <div className="nav-group" key={group}><div className="nav-caption">{group}</div>{navigation.filter(item => item.group === group).map(item => <button className={`nav-link ${page === item.label ? 'active' : ''}`} key={item.label} onClick={() => { setPage(item.label); setMobileNav(false); }}><item.icon size={19}/><span>{item.label}</span>{item.label === 'Pass-on reports' && reports.length > 0 && <i className="nav-number">{reports.length}</i>}</button>)}</div>)}
      <div className="sidebar-bottom"><div className="continuity-note"><div className="note-icon"><Sparkles size={18}/></div><h3>Knowledge should outlive a role.</h3><p>Keep decisions, context and next steps connected to evidence.</p><button onClick={() => setPage('AI assistant')}>Talk to NEXORA <ArrowUpRight size={15}/></button></div><div className="account-strip"><div className="account-avatar">{(user?.name || 'N').slice(0,1).toUpperCase()}</div><div className="account-copy"><b>{user?.name || 'NEXORA User'}</b><small>{isMock ? 'Demo session' : user?.email}</small></div><span className="account-scope-dot" title="Account-scoped workspace"/></div></div>
    </aside>
    <main className="main-area">
      <header className="topbar"><button className="icon-button mobile-trigger" onClick={() => setMobileNav(true)}><Menu/></button><div className="breadcrumbs"><span>Workspace</span><ChevronRight size={15}/><b>{page}</b></div><div className="topbar-right"><span className={`mode-pill ${isMock ? 'mock-pill' : ''}`}><i/>{isMock ? 'MOCK DATABASE' : 'PRIVATE WORKSPACE'}</span><button className="icon-button refresh-button" onClick={refresh} title="Refresh workspace"><RefreshCw size={17}/></button><div className="profile-menu-wrap" ref={profileMenuRef}><button className="profile-trigger" aria-label="Open profile menu" aria-expanded={profileOpen} onClick={() => setProfileOpen(open => !open)}><span className="top-user">{(user?.name || 'N').slice(0,1).toUpperCase()}</span><ChevronDown size={15}/></button>{profileOpen && <div className="profile-menu" role="menu"><div className="profile-menu-identity"><b>{user?.name || 'NEXORA User'}</b><small>{user?.email || 'Demo workspace'}</small><span>{isMock ? 'Mock database' : 'Private account'}</span></div><div className="profile-menu-divider"/><div className="profile-menu-label">Appearance</div><div className="theme-options"><button className={theme === 'dark' ? 'theme-option selected' : 'theme-option'} onClick={() => setTheme('dark')}><Moon size={15}/> Dark</button><button className={theme === 'light' ? 'theme-option selected' : 'theme-option'} onClick={() => setTheme('light')}><Sun size={15}/> Light</button></div><div className="profile-menu-divider"/><button className="profile-logout" role="menuitem" onClick={signOut}><LogOut size={16}/> Log out</button></div>}</div></div></header>
      <div className="page-container">
        {page === 'Overview' && <OverviewPage user={user} isMock={isMock} projects={projects} reports={reports} risks={risks} onPage={setPage} githubStatus={githubStatus}/>}
        {page === 'Projects' && <ProjectsPage projects={projects} onCreate={createProject} form={projectForm} setForm={setProjectForm} busy={busy}/>}
        {page === 'Repositories' && !isMock && <RepositoriesPage connected={githubStatus.connected} login={githubStatus.login} repos={repositoryList} filtered={filteredRepos} search={repoSearch} setSearch={setRepoSearch} onConnect={startGithubConnect} onLoad={loadRepositories} onReport={generateReport} busy={busy}/>}
        {page === 'Pass-on reports' && <ReportsPage reports={reports} selected={selectedReport} onOpen={openReport} onClear={() => setSelectedReport(null)} onApprove={approveReport}/>}
        {page === 'Knowledge memory' && <MemoryPage sources={sources} form={sourceForm} setForm={setSourceForm} onAdd={addSource} busy={busy} isMock={isMock}/>}
        {page === 'Knowledge radar' && <RadarPage risks={risks} projects={projects} onScan={async()=>{try{const r=await api('/risks/scan',{method:'POST',body:'{}'}); await refresh();setNotice(`Scan complete. ${r.created} new signal(s) found.`)}catch(e){setNotice(e.message)}}}/>}
        {page === 'AI assistant' && <AssistantPage chat={chat} question={question} setQuestion={setQuestion} onSubmit={submitQuestion} isMock={isMock} configured={workspace.ai?.configured}/>}
        {page === 'Settings' && <SettingsPage user={user} isMock={isMock} githubStatus={githubStatus} ai={workspace.ai} storage={workspace.storage} onConnect={startGithubConnect} onDisconnect={async()=>{try{await api('/github/disconnect',{method:'POST',body:'{}'});setGithubStatus({connected:false});setRepositoryList([]);setNotice('GitHub disconnected.')}catch(e){setNotice(e.message)}}}/>}
      </div>
    </main>
    {notice && <div className="toast"><span className="toast-mark"><Check size={14}/></span>{notice}<button onClick={() => setNotice('')}><X size={15}/></button></div>}
  </div>{intro}</>;
}

function PixelPairIntro({ onComplete }) {
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    const reducedMotion = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)').matches : false;
    const leaveTimer = window.setTimeout(() => setLeaving(true), reducedMotion ? 450 : 5000);
    const completeTimer = window.setTimeout(onComplete, reducedMotion ? 900 : 5750);
    return () => { window.clearTimeout(leaveTimer); window.clearTimeout(completeTimer); };
  }, [onComplete]);

  const ribbonText = 'DESIGN  —  DEVELOP  —  DEPLOY  —  ';
  const renderLetters = (word, className = '') => word.split('').map((letter, index) => (
    <span className="pixel-intro-letter" style={{ '--letter-index': index }} key={`${className}-${index}`}>{letter}</span>
  ));
  const ribbon = (className, key) => (
    <div className={`pixel-ribbon ${className}`} aria-hidden="true" key={key}>
      <div className="pixel-ribbon-track">{Array.from({ length: 5 }, (_, i) => <span key={i}>{ribbonText}</span>)}</div>
    </div>
  );

  return <div className={`pixel-intro ${leaving ? 'pixel-intro-leaving' : ''}`} role="status" aria-label="Pixel Pair">
    <div className="pixel-intro-frame">
      <header className="pixel-intro-topline">
        <div className="pixel-intro-brand">
          <img src="/brand/nexora-mark.png" alt=""/>
          <strong>NEXORA</strong>
        </div>
        <span className="pixel-intro-divider" aria-hidden="true"/>
        <span className="pixel-intro-topnote">INDEPENDENT BUILDERS <i/> CREATIVE TECHNOLOGY</span>
        <span className="pixel-intro-index">EST. 2026&nbsp; / &nbsp;INDIA</span>
        <button className="pixel-intro-skip" type="button" onClick={() => { setLeaving(true); window.setTimeout(onComplete, 420); }}>SKIP INTRO <ArrowRight size={14}/></button>
      </header>

      {ribbon('pixel-ribbon-top', 'top')}
      {ribbon('pixel-ribbon-upper', 'upper')}
      {ribbon('pixel-ribbon-middle', 'middle')}
      {ribbon('pixel-ribbon-gold', 'gold')}

      <main className="pixel-intro-center">
        <p className="pixel-intro-eyebrow"><span/> TWO MINDS. ONE CREATIVE ENGINE.</p>
        <h1 className="pixel-intro-wordmark" aria-label="Pixel Pair">
          <span className="pixel-intro-word pixel-word-pixel">{renderLetters('PIXEL', 'pixel')}</span>
          <span className="pixel-intro-word pixel-word-pair">{renderLetters('PAIR', 'pair')}<span className="pixel-intro-period">.</span></span>
        </h1>
        <p className="pixel-intro-tagline">IDEAS IN MOTION. BUILT TO BE REAL.</p>
      </main>

      <div className="pixel-intro-orbit pixel-intro-orbit-one" aria-hidden="true"/>
      <div className="pixel-intro-orbit pixel-intro-orbit-two" aria-hidden="true"/>
      <div className="pixel-intro-cross pixel-intro-cross-left" aria-hidden="true">+</div>
      <div className="pixel-intro-cross pixel-intro-cross-right" aria-hidden="true">+</div>

      <section className="pixel-intro-phases" aria-label="Design, develop, deploy">
        <div className="pixel-phase pixel-phase-design"><Lightbulb aria-hidden="true"/><span className="pixel-phase-divider"/><strong>DESIGN</strong></div>
        <div className="pixel-phase pixel-phase-develop"><Code2 aria-hidden="true"/><span className="pixel-phase-divider"/><strong>DEVELOP</strong></div>
        <div className="pixel-phase pixel-phase-deploy"><Rocket aria-hidden="true"/><span className="pixel-phase-divider"/><strong>DEPLOY</strong></div>
      </section>

      <footer className="pixel-intro-footer">
        <span>CREATIVE DEVELOPMENT STUDIO</span>
        <span className="pixel-intro-slashes" aria-hidden="true">///</span>
        <span>01 — 01</span>
      </footer>
      <div className="pixel-intro-progress"><span/></div>
    </div>
  </div>;
}

function LoginScreen({ authTab, setAuthTab, form, setForm, onSubmit, onGoogle, onMock, busy, notice }) {
  return <main className="login-screen login-experience">
    <header className="login-topbar">
      <a className="login-top-brand" href="#top" aria-label="NEXORA home">
        <img src="/brand/nexora-mark.png" alt=""/>
        <img className="login-top-wordmark" src="/brand/nexora-wordmark.png" alt="NEXORA"/>
      </a>
      <nav className="login-nav" aria-label="Main navigation">
        <a href="#explore">Explore</a><a href="#projects">Projects</a><a href="#community">Community</a><a href="#about">About</a>
      </nav>
      <button className="login-signup-link" onClick={() => setAuthTab('register')}><Sparkles size={15}/> Sign Up</button>
    </header>

    <div className="login-landscape" aria-hidden="true">
      <div className="landscape-moon"/><div className="landscape-ruins ruins-left"/><div className="landscape-ruins ruins-right"/>
      <div className="landscape-ground"/><div className="landscape-orbit orbit-one"/><div className="landscape-orbit orbit-two"/>
      <span className="landscape-star star-one"/><span className="landscape-star star-two"/><span className="landscape-star star-three"/>
    </div>

    <section className="login-showcase" id="explore">
      <div className="showcase-kicker"><span/> PROJECTS, REIMAGINED</div>
      <h1>NEXORA</h1>
      <h2>Where <em>ideas evolve.</em></h2>
      <p className="showcase-lead">Discover. Revive. Create.</p>
      <p className="showcase-description">Bring forgotten projects back to life and turn the next idea into something real.</p>
      <ul className="showcase-points">
        <li><Code2/><span>Explore lost projects</span></li>
        <li><RefreshCw/><span>Bring ideas back to life</span></li>
        <li><Rocket/><span>Build what’s next</span></li>
      </ul>
    </section>

    <section className="login-panel-wrap" id="login" aria-label={authTab === 'register' ? 'Create account' : 'Sign in'}>
      <div className="login-card">
        <div className="login-card-mark"><img src="/brand/nexora-mark.png" alt="NEXORA logo"/><span className="mark-orbit orbit-a"/><span className="mark-orbit orbit-b"/></div>
        <div className="login-intro">
          <div className="eyebrow">YOUR NEXT CHAPTER STARTS HERE</div>
          <h2>{authTab === 'register' ? <>Join NEXORA, <em>Creator</em></> : <>Welcome Back, <em>Creator</em></>}</h2>
          <p>{authTab === 'register' ? 'Create an account and bring your ideas with you.' : 'Enter your credentials to continue'}</p>
        </div>
        <div className="auth-tabs" role="tablist" aria-label="Account access">
          <button type="button" role="tab" aria-selected={authTab === 'login'} className={authTab === 'login' ? 'selected' : ''} onClick={() => setAuthTab('login')}>Sign in</button>
          <button type="button" role="tab" aria-selected={authTab === 'register'} className={authTab === 'register' ? 'selected' : ''} onClick={() => setAuthTab('register')}>Create account</button>
        </div>
        <form className="auth-form" onSubmit={onSubmit}>
          {authTab === 'register' && <label>Full name<input required autoComplete="name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Your name"/></label>}
          <label><span>Email address</span><span className="auth-input-wrap"><Mail size={19}/><input type="email" autoComplete="email" required value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="Enter your email address"/></span></label>
          <label><span>Password</span><span className="auth-input-wrap"><LockKeyhole size={19}/><input type={showPassword ? "text" : "password"} minLength="8" autoComplete={authTab === 'register' ? 'new-password' : 'current-password'} required value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} placeholder="Enter your password"/><button type="button" className="password-visibility" onClick={() => setShowPassword(value => !value)} aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? <EyeOff size={18}/> : <Eye size={18}/>}</button></span></label>
          <button className="coral-button full login-submit" disabled={busy}>{busy ? 'Please wait...' : authTab === 'register' ? 'CREATE ACCOUNT' : 'ENTER NEXORA'}<ArrowUpRight size={18}/></button>
        </form>
        <div className="login-social-divider"><span/>OR<span/></div>
        <button className="google-button login-google" onClick={onGoogle}><GoogleMark/><span>Continue with Google</span></button>
        {notice && <div className="login-alert"><AlertTriangle size={15}/>{notice}</div>}
        <button className="mock-button login-demo" onClick={onMock} disabled={busy}><Database size={16}/> Explore the demo workspace</button>
        <div className="login-privacy"><LockKeyhole size={13}/> Your project memory stays private to your account.</div>
      </div>
    </section>

    <aside className="login-insights" aria-label="NEXORA project highlights">
      <article className="insight-card insight-code"><div className="insight-code-top"><span/> PROJECT RESTORED <small>•••</small></div><code><b>&gt;</b> revive_project()<br/><b>&gt;</b> success!<br/><span>A new chapter begins...</span></code></article>
      <article className="insight-card insight-community"><div className="insight-icon"><Users size={21}/></div><div><small>BUILD TOGETHER</small><p>Bring your next idea to a community of creators.</p></div><span className="community-nodes"><i/><i/><i/><i/></span></article>
      <article className="insight-card insight-project"><div className="insight-icon"><FolderKanban size={20}/></div><div><small>PROJECT REVIVAL</small><p>Turn forgotten projects into something greater.</p></div><div className="project-art"><span/><i/><b/></div></article>
    </aside>

    <footer className="login-bottomline"><div><span className="bottom-live-dot"/> NEXORA <span className="bottom-version">v2.0</span><i/> Knowledge that moves forward</div><div className="bottom-note">BUILT FOR THE NEXT CHAPTER</div></footer>
  </main>;
}
function GoogleMark(){return <svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" transform="scale(.83) translate(5 5)"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.91c-.58 2.96-2.26 5.47-4.74 7.16l7.65 5.94c4.46-4.12 7.16-10.2 7.16-17.57z" transform="scale(.83) translate(5 5)"/><path fill="#FBBC05" d="M10.53 28.59a14.4 14.4 0 0 1-.76-4.59c0-1.59.27-3.13.76-4.59l-7.98-6.19A23.9 23.9 0 0 0 0 24c0 3.89.94 7.57 2.56 10.78l7.97-6.19z" transform="scale(.83) translate(5 5)"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.9-5.88l-7.65-5.94c-2.13 1.43-4.86 2.28-8.25 2.28-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" transform="scale(.83) translate(5 5)"/></svg>}
function PageHeading({ kicker, title, description, action }) { return <div className="page-heading"><div><div className="eyebrow">{kicker}</div><h1>{title}</h1><p>{description}</p></div>{action}</div>; }
function StatCard({ icon: Icon, label, value, detail, accent = false }) { return <div className={`stat-card ${accent ? 'accent-card' : ''}`}><div className="stat-icon"><Icon size={20}/></div><span>{label}</span><strong>{value}</strong><small>{detail}</small></div>; }
function EmptyState({ icon: Icon = CircleHelp, title, description, action }) { return <div className="empty-state"><div className="empty-icon"><Icon size={24}/></div><h3>{title}</h3><p>{description}</p>{action}</div>; }
function OverviewPage({ user, isMock, projects, reports, risks, onPage, githubStatus }) {
  return <><section className="welcome-block"><div className="eyebrow"><span className="live-dot"/> YOUR KNOWLEDGE, IN ONE PLACE</div><h1>{isMock ? 'Explore the workspace.' : `Good to have you back, ${user?.name?.split(' ')[0] || 'there'}.`}</h1><p>Start with one project. NEXORA will help preserve the context that keeps it moving.</p></section><section className="overview-banner"><div className="banner-copy"><span className="banner-kicker">THE INTELLIGENCE THAT REMAINS</span><h2>When people move on,<br/><em>knowledge moves forward.</em></h2><p>Turn repository activity and scattered project context into an actionable pass-on report.</p><button className="coral-button" onClick={() => onPage(isMock ? 'Projects' : 'Repositories')}>{isMock ? 'Explore sample projects' : 'Explore repositories'}<ArrowRight size={17}/></button></div><div className="banner-graphic"><div className="graphic-ring ring-1"/><div className="graphic-ring ring-2"/><div className="graphic-core"><img src="/brand/nexora-mark.png" alt="NEXORA"/></div><div className="graphic-chip chip-1"><Code2/></div><div className="graphic-chip chip-2"><Users/></div><div className="graphic-chip chip-3"><FileText/></div></div></section><section className="stats-row"><StatCard icon={FolderKanban} label="PROJECTS" value={projects.length} detail="In this account"/><StatCard icon={FileCheck2} label="PASS-ON REPORTS" value={reports.length} detail="Saved to your workspace"/><StatCard icon={Target} label="KNOWLEDGE SIGNALS" value={risks.length} detail="Items to review" accent/></section><section className="overview-lower"><div className="section-title-row"><div><div className="eyebrow">YOUR WORKSPACES</div><h2>Pick up where it matters.</h2></div><button className="text-link" onClick={() => onPage('Projects')}>All projects <ArrowRight size={16}/></button></div><div className="project-preview-grid">{projects.slice(0,2).map((project, index) => <div className="project-preview" key={project._id}><div className="project-preview-top"><span className="teal-icon"><Code2 size={19}/></span><span className="project-status">{project.status || 'ACTIVE'}</span></div><h3>{project.name}</h3><p>{project.description || 'Project knowledge workspace.'}</p><button onClick={() => onPage('Knowledge memory')}>Open workspace <ArrowUpRight size={16}/></button></div>)}{projects.length === 0 && <EmptyState icon={FolderKanban} title="No projects yet" description="Create a project to start organising knowledge."/>}</div></section><section className="next-step-strip"><div><div className="eyebrow">NEXT STEP</div><h3>{isMock ? 'The demo keeps GitHub turned off.' : githubStatus.connected ? 'Your GitHub account is connected.' : 'Connect GitHub to discover your repositories.'}</h3><p>{isMock ? 'Use the sample workspace to explore the layout and knowledge workflow.' : githubStatus.connected ? 'Open your repository list and generate a pass-on report for any repository.' : 'Repository access is authorised by you and stored against this account.'}</p></div><button className="coral-button" onClick={() => onPage(isMock ? 'Projects' : 'Repositories')}>{isMock ? 'View demo projects' : 'Continue'}<ArrowRight size={17}/></button></section></>;
}
function ProjectsPage({ projects, onCreate, form, setForm, busy }) {
  return <><PageHeading kicker="PROJECT SPACES" title="Projects, with their context." description="A focused home for each project's sources, decisions, risks and transition history."/><div className="form-panel"><div className="form-panel-heading"><div className="teal-icon"><Plus size={19}/></div><div><h3>Create a project space</h3><p>Give the knowledge a clear place to live.</p></div></div><form className="project-create-form" onSubmit={onCreate}><input required placeholder="Project name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}/><input placeholder="Short description (optional)" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}/><button className="coral-button" disabled={busy}>Create project <ArrowRight size={16}/></button></form></div><div className="section-title-row spaced"><div><div className="eyebrow">ACCOUNT PROJECTS</div><h2>{projects.length} project spaces</h2></div></div><div className="project-list">{projects.map(p => <article className="project-list-card" key={p._id}><div className="teal-icon large-icon"><FolderKanban size={23}/></div><div className="project-list-copy"><h3>{p.name}</h3><p>{p.description || 'No description added yet.'}</p><span>{p.status || 'active'} · Created {new Date(p.createdAt).toLocaleDateString()}</span></div><div className="project-actions"><button className="outline-button" onClick={() => navigator.clipboard?.writeText(p.name)}>Copy name</button></div></article>)}{!projects.length && <EmptyState icon={FolderKanban} title="Your first project starts here" description="Create a project space above. You can connect it to repository reports and add supporting knowledge."/>}</div></>;
}
function RepositoriesPage({ connected, login, repos, filtered, search, setSearch, onConnect, onLoad, onReport, busy }) {
  return <><PageHeading kicker="GITHUB SOURCE CONNECTION" title="Your work, across repositories." description="Connect your GitHub profile to discover repositories you own or can access, then create a developer-ready pass-on report." action={connected ? <button className="outline-button" onClick={onLoad} disabled={busy}><RefreshCw size={16}/> Refresh repositories</button> : null}/>{!connected ? <div className="github-connect-panel"><div className="github-panel-icon"><Github size={36}/></div><div className="github-connect-copy"><div className="eyebrow">AUTHORISE YOUR ACCOUNT</div><h2>Bring your repositories into NEXORA.</h2><p>Connect through GitHub OAuth. NEXORA will use your authorised GitHub access to list accessible repositories and read the selected repository's project history for report generation.</p><button className="coral-button" onClick={onConnect} disabled={busy}>Connect GitHub profile <ArrowRight size={17}/></button></div><div className="github-permission-note"><ShieldCheck size={20}/><span>Private repositories are visible only when your GitHub authorisation grants access. The connection is tied to this NEXORA account.</span></div></div> : <><div className="connected-banner"><div className="connected-icon"><Check size={18}/></div><div><b>GitHub connected{login ? ` as @${login}` : ''}</b><span>Repository access is active for this NEXORA account.</span></div><button className="text-link" onClick={onLoad}>Load repositories <ArrowRight size={15}/></button></div><div className="repository-toolbar"><div><div className="eyebrow">CONNECTED REPOSITORIES</div><h2>{repos.length ? `${repos.length} repositories found` : 'Your repository library'}</h2></div><div className="repo-search"><Search size={17}/><input placeholder="Search repositories..." value={search} onChange={e => setSearch(e.target.value)}/></div></div>{repos.length === 0 ? <EmptyState icon={Github} title="Ready to discover your repositories?" description="Load all repositories available to your GitHub account." action={<button className="coral-button" onClick={onLoad} disabled={busy}>Load repositories <ArrowRight size={16}/></button>}/> : <div className="repo-grid">{filtered.map(repo => <article className="repo-card" key={repo.id}><div className="repo-card-top"><span className="repo-icon"><Github size={20}/></span><span className={`visibility ${repo.private ? 'private' : ''}`}>{repo.private ? 'PRIVATE' : 'PUBLIC'}</span></div><h3>{repo.name}</h3><a href={repo.htmlUrl} target="_blank" rel="noreferrer" className="repo-full-name">{repo.fullName} <ArrowUpRight size={13}/></a><p>{repo.description || 'No repository description provided.'}</p><div className="repo-meta"><span>{repo.language || 'Language not set'}</span><span>★ {repo.stars}</span><span>Updated {new Date(repo.updatedAt).toLocaleDateString()}</span></div><button className="coral-button report-button" onClick={() => onReport(repo.fullName)} disabled={busy}>Create pass-on report <ArrowRight size={16}/></button></article>)}</div>}</>}</>;
}
function ReportsPage({ reports, selected, onOpen, onClear, onApprove }) {
  if (selected) return <><PageHeading kicker="DEVELOPER TRANSITION DOCUMENT" title="Pass-on report" description={selected.repoFullName || selected.title} action={<div className="report-actions"><span className={`review-state ${selected.status === 'approved' ? 'approved' : ''}`}>{selected.status === 'approved' ? 'APPROVED' : 'PENDING REVIEW'}</span>{selected.status !== 'approved' && <button className="coral-button" onClick={onApprove}><Check size={16}/> Approve report</button>}<button className="outline-button" onClick={onClear}>Back to reports</button></div>}/><ReportContent report={selected.report || {}} createdAt={selected.createdAt}/></>;
  return <><PageHeading kicker="EVIDENCE-BACKED HANDOVERS" title="Knowledge, ready to pass on." description="Reports generated from repository evidence, saved to your account and ready for review."/><div className="report-list">{reports.map(report => <button className="report-list-card" key={report._id} onClick={() => onOpen(report)}><span className="report-file-icon"><FileCheck2 size={23}/></span><span className="report-list-copy"><b>{report.repoFullName || report.title}</b><small>{report.summary || 'Pass-on report'} · {new Date(report.createdAt).toLocaleString()}</small></span><ArrowUpRight size={18}/></button>)}{!reports.length && <EmptyState icon={FileCheck2} title="No pass-on reports yet" description="Connect GitHub, open a repository and ask NEXORA to create its first report."/>}</div></>;
}
function ReportContent({ report, createdAt }) {
  const groups = [
    ['Project purpose', report.projectPurpose], ['Architecture & technology', report.architectureAndTechnology], ['Dependencies & runtime', report.dependenciesAndRuntime], ['Setup', report.setup], ['Recent activity', report.recentActivity], ['Open work', report.openWork], ['Pull requests', report.pullRequests], ['Ownership & contributors', report.ownershipAndContributors], ['Knowledge dependencies', report.knowledgeDependencies], ['Decisions & conventions', report.decisionsAndConventions], ['Risks & knowledge gaps', report.risksAndKnowledgeGaps], ['Recommended next steps', report.recommendedNextSteps]
  ];
  return <div className="report-document"><div className="report-document-head"><div className="eyebrow">GENERATED {createdAt ? new Date(createdAt).toLocaleString() : ''}</div><h2>{report.repository?.fullName || report.repository?.full_name || 'Repository handover'}</h2><p>{report.executiveSummary}</p><span className="report-provider">Analysis: {report.aiProvider || 'NEXORA'} · Confidence: {report.confidenceLevel || 'not assessed'}</span></div>{groups.map(([title, value]) => value && <section className="report-section" key={title}><h3>{title}</h3>{Array.isArray(value) ? <ul>{value.map((item, i) => <li key={i}>{typeof item === 'string' ? item : JSON.stringify(item)}</li>)}</ul> : <p>{value}</p>}</section>)}{report.riskSignals?.length > 0 && <section className="report-section"><h3>Actionable knowledge-risk signals</h3><div className="report-risk-grid">{report.riskSignals.map((risk, i) => <article className="report-risk-card" key={i}><div className="report-risk-top"><b>{risk.title}</b><span className={`risk-level ${risk.severity || 'medium'}`}/><small>{String(risk.severity || 'medium').toUpperCase()} · {(risk.category || 'other').replaceAll('_',' ')}</small></div><p>{risk.description}</p><p><strong>Recommended action:</strong> {risk.recommendedAction}</p>{risk.evidenceIds?.length > 0 && <small>Evidence: {risk.evidenceIds.join(', ')}</small>}</article>)}</div></section>}{report.coverageNotes?.length > 0 && <section className="report-section"><h3>Evidence coverage</h3><ul>{report.coverageNotes.map((item, i) => <li key={i}>{item}</li>)}</ul></section>}{report.sourceEvidence?.length > 0 && <section className="report-section"><h3>Source evidence</h3><div className="evidence-list">{report.sourceEvidence.map((item, i) => <div key={i}><b>{item.source}</b><p>{item.detail}</p>{item.url && <a className="evidence-link" href={item.url} target="_blank" rel="noreferrer">Open source <ArrowUpRight size={12}/></a>}</div>)}</div></section>}{report.aiGenerationError && <div className="report-limitation"><AlertTriangle size={17}/><p>{report.aiGenerationError}</p></div>}{report.reviewGuidance && <p className="form-note instruction-note">{report.reviewGuidance}</p>}{report.limitation && <div className="report-limitation"><AlertTriangle size={17}/><p>{report.limitation}</p></div>}</div>;
}
function MemoryPage({ sources, form, setForm, onAdd, busy, isMock }) {
  return <><PageHeading kicker="PROJECT MEMORY ENGINE" title="Keep the context connected." description="Add the decisions, working notes and operational details that should remain available beyond a team transition."/><div className="memory-layout"><form className="memory-form" onSubmit={onAdd}><div className="eyebrow">ADD A KNOWLEDGE SOURCE</div><h2>Capture what matters.</h2><label>Source title<input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Deployment decisions"/></label><label>Project context<textarea required rows="8" value={form.content} onChange={e => setForm({ ...form, content: e.target.value })} placeholder="Record a technical decision, dependency, unresolved question or important project context..."/></label><button className="coral-button" disabled={busy}>Save to project memory <ArrowRight size={16}/></button><p className="form-note instruction-note"><LockKeyhole size={13}/> Source content is scoped to this workspace account.</p></form><div className="memory-library"><div className="section-title-row"><div><div className="eyebrow">SOURCE LIBRARY</div><h2>{sources.length} saved sources</h2></div></div>{sources.map(source => <article className="source-card" key={source._id}><span className="teal-icon"><FileText size={18}/></span><div><b>{source.name}</b><p>{source.summary || source.content?.slice(0,180)}</p><small>{new Date(source.createdAt).toLocaleDateString()}</small></div></article>)}{!sources.length && <EmptyState icon={BookOpen} title="Your memory is ready for its first source" description={isMock ? 'Add sample notes here to explore how knowledge is collected.' : 'Start with setup instructions, a technical decision or a meeting summary.'}/>}</div></div></>;
}
function RadarPage({ risks, projects, onScan }) {
  return <><PageHeading kicker="KNOWLEDGE LOSS RADAR" title="See the gaps before they grow." description="Spot projects with missing source material and keep unresolved context visible." action={<button className="coral-button" onClick={onScan}><Target size={17}/> Run knowledge scan</button>}/><div className="radar-intro"><div className="radar-number">{risks.length.toString().padStart(2,'0')}</div><div><h2>Open knowledge signals</h2><p>{risks.length ? 'These items deserve a review before a project changes hands.' : 'No open signals in this workspace. Run a scan after adding project sources.'}</p></div></div><div className="risk-list">{risks.map(risk => <article className="risk-card" key={risk._id}><span className={`risk-level ${risk.severity}`}/><div><h3>{risk.title}</h3><p>{risk.description}</p><small>{risk.severity || 'Review'} · {risk.projectId ? 'Project signal' : 'Workspace signal'}</small></div></article>)}{!risks.length && <EmptyState icon={ShieldCheck} title="No active knowledge gaps" description={`${projects.length} project(s) currently have no open signals in this workspace.`}/>}</div></>;
}
function AssistantPage({ chat, question, setQuestion, onSubmit, isMock, configured }) {
  return <><PageHeading kicker="SOURCE-LINKED AI ASSISTANT" title="Ask what your team knows." description="Ask about project decisions, repository activity, open work and what an incoming developer should understand."/><div className="assistant-shell"><div className="assistant-topline"><span className="assistant-orb"><Bot size={21}/></span><div><b>NEXORA Intelligence</b><small>{configured ? 'Groq API available · evidence-first responses' : 'Evidence retrieval active · configure GROQ_API_KEY on Render for AI synthesis'}</small></div><span className="evidence-tag"><ShieldCheck size={14}/> Evidence-first</span></div><div className="chat-transcript">{chat.map((item, index) => <div className={`chat-line ${item.role}`} key={index}><span className="chat-badge">{item.role === 'assistant' ? <Sparkles size={15}/> : 'Y'}</span><div className="chat-bubble"><p style={{ whiteSpace: 'pre-wrap' }}>{item.text}</p>{item.sources?.length > 0 && <div className="chat-sources">Sources: {[...new Set(item.sources)].join(' · ')}</div>}</div></div>)}</div><form className="chat-composer" onSubmit={onSubmit}><input value={question} onChange={e => setQuestion(e.target.value)} placeholder="Ask about your project memory..."/><button className="coral-button"><Send size={17}/> Send</button></form><div className="assistant-foot"><LockKeyhole size={13}/> {isMock ? 'Demo responses use sample workspace records.' : 'Only this account’s sources and saved reports are included in retrieval.'}</div></div></>;
}
function SettingsPage({ user, isMock, githubStatus, ai, storage, onConnect, onDisconnect }) {
  return <><PageHeading kicker="ACCOUNT & WORKSPACE" title="Your settings, your workspace." description="Review connected providers, data persistence and account access."/><div className="settings-stack"><section className="settings-card"><div className="settings-card-icon"><Users size={21}/></div><div className="settings-card-body"><div className="eyebrow">ACCOUNT</div><h2>{user?.name}</h2><p>{user?.email} · {isMock ? 'Mock workspace' : 'Account-specific workspace'}</p><span className="setting-status"><Check size={14}/> Data is scoped to this {isMock ? 'demo workspace' : 'account'}</span></div></section><section className="settings-card"><div className="settings-card-icon"><Database size={21}/></div><div className="settings-card-body"><div className="eyebrow">DATABASE</div><h2>{storage === 'mongodb' ? 'MongoDB connected' : storage === 'mock-json' ? 'Isolated mock JSON database' : 'Local persistent JSON store'}</h2><p>{storage === 'mongodb' ? 'Account records are stored in the configured MongoDB database.' : storage === 'mock-json' ? 'Sample workspace records are stored separately in server/data/nexora-mock-db.json and never mix with real account data.' : 'Account data is persisted in server/data/nexora-db.json. Set MONGO_URI in server/.env to use MongoDB.'}</p><span className="setting-status"><Check size={14}/> Persistence active</span></div></section><section className="settings-card"><div className="settings-card-icon"><Sparkles size={21}/></div><div className="settings-card-body"><div className="eyebrow">AI PROVIDER</div><h2>{ai?.configured ? 'Groq API configured' : 'Evidence retrieval fallback'}</h2><p>{ai?.configured ? `Model: ${ai.model}. Structured AI responses are enabled.` : 'Add GROQ_API_KEY to Render to enable Groq-powered structured analysis and answers.'}</p><span className="setting-status">{ai?.configured ? 'Groq ready' : 'Fallback available'}</span></div></section>{!isMock && <section className="settings-card"><div className="settings-card-icon"><Github size={21}/></div><div className="settings-card-body"><div className="eyebrow">GITHUB SOURCE CONNECTION</div><h2>{githubStatus.connected ? `Connected${githubStatus.login ? ` as @${githubStatus.login}` : ''}` : 'GitHub is not connected'}</h2><p>Connect GitHub to list accessible repositories and generate repository-specific pass-on reports.</p>{githubStatus.connected ? <button className="outline-button danger-outline" onClick={onDisconnect}>Disconnect GitHub</button> : <button className="coral-button" onClick={onConnect}>Connect GitHub <ArrowRight size={16}/></button>}</div></section>}</div></>;
}

createRoot(document.getElementById('root')).render(<App/>);

