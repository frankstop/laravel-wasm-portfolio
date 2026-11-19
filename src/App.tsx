import React, { useEffect, useId, useRef, useState } from 'react';
import {
  Activity,
  ArrowUpRight,
  Code2,
  Cpu,
  Database,
  Download,
  ExternalLink,
  FileCode2,
  FlaskConical,
  FolderGit2,
  Globe,
  Kanban,
  MessageSquarePlus,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Sparkles,
  Terminal,
  ThumbsUp,
  Trash2,
  Wrench,
  Zap,
} from 'lucide-react';
import {
  laravelKernel,
  type TableDump,
  type TelemetryTrace,
} from './laravel/wasmKernel';
import { LARAVEL_FS_FILES } from './laravel/vfsFiles';

interface ProjectItem {
  id: number;
  display_order: number;
  name: string;
  slug: string;
  language: string;
  description: string;
  architecture_highlight: string;
  github_url: string;
  live_url: string | null;
  upvotes: number;
  topics: string[];
  pushed_at: string;
}

interface RoadmapTaskItem {
  id: number;
  project_id: number;
  repo_tag: string;
  title: string;
  status: 'backlog' | 'in_progress' | 'shipped';
  category: string;
  priority_score: number;
  created_at: string;
}

interface EndorsementItem {
  id: number;
  author_name: string;
  author_role: string;
  message: string;
  skill_badge: string;
  created_at: string;
}

const EDITABLE_CONTROLLERS = [
  {
    label: 'ProjectController.php',
    path: '/app/Http/Controllers/ProjectController.php',
    testRoute: { method: 'GET' as const, uri: '/api/projects' },
  },
  {
    label: 'RoadmapController.php',
    path: '/app/Http/Controllers/RoadmapController.php',
    testRoute: { method: 'GET' as const, uri: '/api/roadmap' },
  },
  {
    label: 'EndorsementController.php',
    path: '/app/Http/Controllers/EndorsementController.php',
    testRoute: { method: 'GET' as const, uri: '/api/endorsements' },
  },
];

const TINKER_PRESETS = [
  {
    label: 'Featured Repos -> Summary Map',
    code: `Project::orderBy('display_order')->get()->map(fn($p) => [
    'id' => $p['id'],
    'repo' => $p['name'],
    'language' => $p['language'],
    'upvotes' => $p['upvotes'],
])`,
  },
  {
    label: 'Collection Pipeline: Group by Language',
    code: `collect(Project::all()->toArray())->groupBy('language')`,
  },
  {
    label: 'Query Roadmap In-Progress Tasks',
    code: `RoadmapTask::where('status', 'in_progress')->orderByDesc('priority_score')->get()`,
  },
  {
    label: 'Run Raw SQLite Aggregation',
    code: `DB::select("SELECT language, COUNT(*) as repo_count, SUM(upvotes) as total_upvotes FROM projects GROUP BY language ORDER BY total_upvotes DESC")`,
  },
];

export function App() {
  const [booting, setBooting] = useState(true);
  const [runtimeInfo, setRuntimeInfo] = useState({ phpVersion: '8.3', sqliteVersion: '3.45' });
  const [activeTab, setActiveTab] = useState<'projects' | 'kanban' | 'controller_studio' | 'tinker' | 'sqlite'>('projects');
  const [xrayOpen, setXrayOpen] = useState(true);
  const [xraySubTab, setXraySubTab] = useState<'sql' | 'controller' | 'payload'>('sql');

  // Telemetry traces
  const [traces, setTraces] = useState<TelemetryTrace[]>([]);
  const [selectedTraceId, setSelectedTraceId] = useState<string | null>(null);

  // Portfolio Data States (Driven 100% by PHP-WASM Laravel Controllers)
  const [developer, setDeveloper] = useState<any>(null);
  const [metrics, setMetrics] = useState<any>(null);
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [langFilter, setLangFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [upvotingId, setUpvotingId] = useState<number | null>(null);

  // Kanban & Guestbook State
  const [tasks, setTasks] = useState<RoadmapTaskItem[]>([]);
  const [endorsements, setEndorsements] = useState<EndorsementItem[]>([]);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskRepo, setNewTaskRepo] = useState('HiggsBoson');
  const [newTaskCategory, setNewTaskCategory] = useState('Architecture');
  const [taskErrors, setTaskErrors] = useState<Record<string, string[]>>({});

  const [guestName, setGuestName] = useState('');
  const [guestRole, setGuestRole] = useState('');
  const [guestMessage, setGuestMessage] = useState('');
  const [guestBadge, setGuestBadge] = useState('Full-Stack Architecture');
  const [guestErrors, setGuestErrors] = useState<Record<string, string[]>>({});
  const [guestSuccess, setGuestSuccess] = useState<string | null>(null);

  // Live Controller Hot-Editing State
  const [activeControllerPath, setActiveControllerPath] = useState(EDITABLE_CONTROLLERS[0].path);
  const [controllerCode, setControllerCode] = useState(LARAVEL_FS_FILES[EDITABLE_CONTROLLERS[0].path]);
  const [hotSaveStatus, setHotSaveStatus] = useState<{ type: 'idle' | 'ok' | 'error'; msg: string }>({
    type: 'idle',
    msg: '',
  });

  // Tinker & Artisan State
  const [tinkerInput, setTinkerInput] = useState(TINKER_PRESETS[0].code);
  const [tinkerHistory, setTinkerHistory] = useState<
    { id: string; kind: 'TINKER' | 'ARTISAN'; cmd: string; output: string; duration_ms: number; ok: boolean }[]
  >([]);
  const [tinkerRunning, setTinkerRunning] = useState(false);

  // SQLite Table Browser State
  const [tables, setTables] = useState<TableDump[]>([]);
  const [selectedTable, setSelectedTable] = useState<string>('projects');

  // Native <dialog> modal for Factory Reset confirmation (per modern-web-guidance `dialog` rule)
  const resetDialogRef = useRef<HTMLDialogElement | null>(null);
  const resetDialogTitleId = useId();
  const tableCaptionId = useId();

  useEffect(() => {
    const unsub = laravelKernel.onTrace((trace) => {
      setTraces((prev) => [trace, ...prev.slice(0, 29)]);
      setSelectedTraceId(trace.id);
    });
    return unsub;
  }, []);

  const refreshAllFromLaravel = async (language = langFilter, search = searchQuery) => {
    const qs = new URLSearchParams();
    if (language && language !== 'all') qs.set('language', language);
    if (search.trim()) qs.set('search', search.trim());
    const projectUri = `/api/projects${qs.toString() ? `?${qs.toString()}` : ''}`;

    const [projRes, roadRes, endRes, dbDump] = await Promise.all([
      laravelKernel.dispatch('GET', projectUri),
      laravelKernel.dispatch('GET', '/api/roadmap'),
      laravelKernel.dispatch('GET', '/api/endorsements'),
      laravelKernel.inspectDatabase(),
    ]);

    if (projRes.status === 200 && projRes.data) {
      setDeveloper(projRes.data.developer);
      setMetrics(projRes.data.metrics);
      setProjects(Array.isArray(projRes.data.projects) ? projRes.data.projects : []);
    }
    if (roadRes.status === 200 && roadRes.data?.tasks) {
      setTasks(roadRes.data.tasks);
    }
    if (endRes.status === 200 && endRes.data?.endorsements) {
      setEndorsements(endRes.data.endorsements);
    }
    setTables(dbDump);
  };

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const info = await laravelKernel.boot();
        if (!mounted) return;
        setRuntimeInfo(info);
        await refreshAllFromLaravel('all', '');
        const initialCtrl = await laravelKernel.getFileContents(EDITABLE_CONTROLLERS[0].path);
        if (mounted) {
          setControllerCode(initialCtrl);
          setBooting(false);
        }
      } catch (err) {
        console.error('Failed booting PHP-WASM:', err);
        if (mounted) setBooting(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const handleFilterChange = async (newLang: string, newSearch: string) => {
    setLangFilter(newLang);
    setSearchQuery(newSearch);
    const qs = new URLSearchParams();
    if (newLang !== 'all') qs.set('language', newLang);
    if (newSearch.trim()) qs.set('search', newSearch.trim());
    const uri = `/api/projects${qs.toString() ? `?${qs.toString()}` : ''}`;
    const res = await laravelKernel.dispatch('GET', uri);
    if (res.status === 200 && res.data) {
      setProjects(Array.isArray(res.data.projects) ? res.data.projects : []);
      setMetrics(res.data.metrics);
    }
  };

  const handleUpvoteProject = async (id: number) => {
    setUpvotingId(id);
    try {
      await laravelKernel.dispatch('POST', `/api/projects/${id}/upvote`);
      await refreshAllFromLaravel(langFilter, searchQuery);
    } finally {
      setUpvotingId(null);
    }
  };

  const handleMoveTask = async (taskId: number, nextStatus: 'backlog' | 'in_progress' | 'shipped') => {
    await laravelKernel.dispatch('PATCH', `/api/roadmap/${taskId}`, { status: nextStatus });
    const [roadRes, dbDump] = await Promise.all([
      laravelKernel.dispatch('GET', '/api/roadmap'),
      laravelKernel.inspectDatabase(),
    ]);
    if (roadRes.data?.tasks) setTasks(roadRes.data.tasks);
    setTables(dbDump);
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    setTaskErrors({});
    const res = await laravelKernel.dispatch('POST', '/api/roadmap', {
      title: newTaskTitle,
      repo_tag: newTaskRepo,
      category: newTaskCategory,
      status: 'backlog',
      priority_score: 88,
    });
    if (res.status === 422) {
      setTaskErrors(res.data?.errors || {});
      return;
    }
    setNewTaskTitle('');
    await refreshAllFromLaravel(langFilter, searchQuery);
  };

  const handleCreateEndorsement = async (e: React.FormEvent, triggerInvalidDemo = false) => {
    e.preventDefault();
    setGuestErrors({});
    setGuestSuccess(null);

    const payload = triggerInvalidDemo
      ? { author_name: '', author_role: 'A', message: 'Too short', skill_badge: '' }
      : {
          author_name: guestName,
          author_role: guestRole,
          message: guestMessage,
          skill_badge: guestBadge,
        };

    const res = await laravelKernel.dispatch('POST', '/api/endorsements', payload);
    if (res.status === 422) {
      setGuestErrors(res.data?.errors || {});
      return;
    }
    setGuestName('');
    setGuestRole('');
    setGuestMessage('');
    setGuestSuccess('Saved to in-browser SQLite via EndorsementController@store (201 Created).');
    await refreshAllFromLaravel(langFilter, searchQuery);
  };

  const handleDeleteEndorsement = async (id: number) => {
    await laravelKernel.dispatch('DELETE', `/api/endorsements/${id}`);
    await refreshAllFromLaravel(langFilter, searchQuery);
  };

  const handleSelectControllerFile = async (vfsPath: string) => {
    setActiveControllerPath(vfsPath);
    setHotSaveStatus({ type: 'idle', msg: '' });
    const content = await laravelKernel.getFileContents(vfsPath);
    setControllerCode(content);
  };

  const handleHotDeployController = async () => {
    setHotSaveStatus({ type: 'idle', msg: 'Compiling & linting PHP AST in WASM...' });
    const res = await laravelKernel.saveControllerSource(activeControllerPath, controllerCode);
    if (!res.ok) {
      setHotSaveStatus({ type: 'error', msg: res.error || 'Syntax error in PHP controller' });
      return;
    }
    const target = EDITABLE_CONTROLLERS.find((c) => c.path === activeControllerPath);
    if (target) {
      await laravelKernel.dispatch(target.testRoute.method, target.testRoute.uri);
    }
    await refreshAllFromLaravel(langFilter, searchQuery);
    setHotSaveStatus({
      type: 'ok',
      msg: `Hot-swapped ${activeControllerPath} in WASM VFS and dispatched ${target?.testRoute.method} ${target?.testRoute.uri}!`,
    });
  };

  const handleResetController = async () => {
    const original = await laravelKernel.resetControllerToDefault(activeControllerPath);
    setControllerCode(original);
    await refreshAllFromLaravel(langFilter, searchQuery);
    setHotSaveStatus({ type: 'ok', msg: 'Restored original controller source.' });
  };

  const handleRunTinker = async () => {
    if (!tinkerInput.trim()) return;
    setTinkerRunning(true);
    try {
      const res = await laravelKernel.runTinker(tinkerInput);
      setTinkerHistory((prev) => [
        {
          id: `${Date.now()}`,
          kind: 'TINKER',
          cmd: tinkerInput,
          output: res.output,
          duration_ms: res.duration_ms,
          ok: res.ok,
        },
        ...prev,
      ]);
      const dbDump = await laravelKernel.inspectDatabase();
      setTables(dbDump);
    } finally {
      setTinkerRunning(false);
    }
  };

  const handleRunArtisan = async (cmd: string) => {
    setTinkerRunning(true);
    try {
      const res = await laravelKernel.runArtisan(cmd);
      setTinkerHistory((prev) => [
        {
          id: `${Date.now()}`,
          kind: 'ARTISAN',
          cmd: `php artisan ${cmd}`,
          output: res.output,
          duration_ms: res.duration_ms,
          ok: res.exit_code === 0,
        },
        ...prev,
      ]);
      await refreshAllFromLaravel(langFilter, searchQuery);
    } finally {
      setTinkerRunning(false);
    }
  };

  const handleDownloadSqlite = async () => {
    const bytes = await laravelKernel.exportSqliteBytes();
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    const blob = new Blob([copy.buffer], { type: 'application/x-sqlite3' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'frank-valdez-portfolio.sqlite';
    a.click();
    URL.revokeObjectURL(url);
  };

  const openResetModal = () => {
    resetDialogRef.current?.showModal();
  };

  const handleResetDialogClose = async () => {
    const dialog = resetDialogRef.current;
    if (!dialog) return;
    const choice = dialog.returnValue;
    dialog.returnValue = ''; // Mandatory reset per modern-web-guidance `dialog` rule
    if (choice === 'confirm-reset') {
      await laravelKernel.resetAllFactoryState();
      const freshCode = await laravelKernel.getFileContents(activeControllerPath);
      setControllerCode(freshCode);
      await refreshAllFromLaravel('all', '');
    }
  };

  const activeTrace = traces.find((t) => t.id === selectedTraceId) || traces[0] || null;
  const currentTableDump = tables.find((t) => t.name === selectedTable) || tables[0] || null;

  return (
    <div className="app-shell">
      {/* Top Swiss Status & Telemetry Bar */}
      <header className="topbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
            <span className={`status-dot ${booting ? 'booting' : ''}`} />
            <span style={{ fontWeight: 700, fontSize: '0.95rem', letterSpacing: '-0.02em' }}>
              FRANK VALDEZ
            </span>
          </div>
          <span className="badge badge-mono" title="Real PHP 8.3 & Laravel Kernel compiled to WebAssembly">
            <Cpu size={12} />
            {booting
              ? 'Booting PHP-WASM Kernel...'
              : `PHP ${runtimeInfo.phpVersion} WASM • SQLite ${runtimeInfo.sqliteVersion} • Zero-Backend Pages`}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn"
            onClick={handleDownloadSqlite}
            disabled={booting}
            title="Export the live in-browser SQLite database file"
          >
            <Download size={14} />
            <span>Export .sqlite</span>
          </button>

          <button
            type="button"
            className="btn"
            onClick={openResetModal}
            disabled={booting}
            title="Run php artisan migrate:fresh --seed"
          >
            <RotateCcw size={14} />
            <span>Factory Reset DB</span>
          </button>

          <button
            type="button"
            className={`btn btn-xray ${xrayOpen ? 'active' : ''}`}
            onClick={() => setXrayOpen((v) => !v)}
          >
            <Activity size={14} />
            <span>X-Ray Mode: {xrayOpen ? 'ON' : 'OFF'}</span>
            <span
              style={{
                padding: '0.05rem 0.38rem',
                borderRadius: '99px',
                fontSize: '0.68rem',
                background: xrayOpen ? 'rgba(255,255,255,0.22)' : 'rgba(37,99,235,0.12)',
              }}
            >
              {traces.length}
            </span>
          </button>
        </div>
      </header>

      {/* Primary Accessible Tablist (Modern Web Guidance `tabs` compliance) */}
      <div
        className="swiss-tablist"
        role="tablist"
        aria-label="Portfolio Full-Stack Modules"
        {...({ focusgroup: 'tablist nomemory' } as any)}
      >
        <button
          type="button"
          role="tab"
          id="tab-projects"
          className="swiss-tab"
          aria-selected={activeTab === 'projects'}
          {...(activeTab === 'projects' ? ({ focusgroupstart: '' } as any) : {})}
          onClick={() => setActiveTab('projects')}
        >
          <FolderGit2 size={15} />
          <span>Featured Repositories (Eloquent)</span>
        </button>

        <button
          type="button"
          role="tab"
          id="tab-kanban"
          className="swiss-tab"
          aria-selected={activeTab === 'kanban'}
          {...(activeTab === 'kanban' ? ({ focusgroupstart: '' } as any) : {})}
          onClick={() => setActiveTab('kanban')}
        >
          <Kanban size={15} />
          <span>Kanban & Validator Guestbook</span>
        </button>

        <button
          type="button"
          role="tab"
          id="tab-controller"
          className="swiss-tab"
          aria-selected={activeTab === 'controller_studio'}
          {...(activeTab === 'controller_studio' ? ({ focusgroupstart: '' } as any) : {})}
          onClick={() => setActiveTab('controller_studio')}
        >
          <FileCode2 size={15} />
          <span>Live Controller Hot-Editor</span>
        </button>

        <button
          type="button"
          role="tab"
          id="tab-tinker"
          className="swiss-tab"
          aria-selected={activeTab === 'tinker'}
          {...(activeTab === 'tinker' ? ({ focusgroupstart: '' } as any) : {})}
          onClick={() => setActiveTab('tinker')}
        >
          <Terminal size={15} />
          <span>Artisan & Tinker REPL</span>
        </button>

        <button
          type="button"
          role="tab"
          id="tab-sqlite"
          className="swiss-tab"
          aria-selected={activeTab === 'sqlite'}
          {...(activeTab === 'sqlite' ? ({ focusgroupstart: '' } as any) : {})}
          onClick={() => setActiveTab('sqlite')}
        >
          <Database size={15} />
          <span>SQLite Database Explorer</span>
        </button>
      </div>

      {/* Main Split-Screen Workspace */}
      <div className={`workspace-grid ${xrayOpen ? 'xray-open' : ''}`}>
        <main className="main-pane">
          {/* Toy Data Sandbox Notice Banner */}
          <div
            role="status"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '0.75rem',
              flexWrap: 'wrap',
              padding: '0.7rem 1rem',
              marginBottom: '1.1rem',
              borderRadius: 'var(--radius-md)',
              background: '#fffbeb',
              border: '1px solid #fde68a',
              color: '#92400e',
              fontSize: '0.82rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
              <FlaskConical size={16} style={{ flexShrink: 0, color: '#d97706' }} />
              <span>
                <strong>Sandbox Toy Data Notice:</strong> All database metrics, upvotes, Kanban roadmap cards, and
                guestbook endorsements are <strong>toy data</strong> seeded locally into your browser's ephemeral
                SQLite-WASM instance for interactive demonstration.
              </span>
            </div>
            <span
              className="mono"
              style={{
                fontSize: '0.71rem',
                fontWeight: 600,
                padding: '0.15rem 0.5rem',
                borderRadius: '999px',
                background: '#fef3c7',
                border: '1px solid #fcd34d',
                color: '#92400e',
              }}
            >
              DatabaseSeeder.php • Local Sandbox
            </span>
          </div>

          {/* Developer Hero Header */}
          <section
            className="card"
            style={{
              padding: '1.5rem',
              marginBottom: '1.5rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '1.15rem',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                gap: '1rem',
                flexWrap: 'wrap',
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                  <h1 style={{ fontSize: '1.55rem', fontWeight: 700, letterSpacing: '-0.025em' }}>
                    {developer?.name || 'Frank Valdez'}
                  </h1>
                  <span className="badge badge-mono">{developer?.handle || '@frankstop'}</span>
                  <span
                    className="badge"
                    style={{
                      background: 'var(--brand-soft)',
                      color: 'var(--brand)',
                      borderColor: 'var(--brand-border)',
                    }}
                  >
                    {developer?.location || 'NYC'} • Bilingüe Español/English
                  </span>
                </div>
                <p style={{ color: 'var(--ink-secondary)', marginTop: '0.35rem', maxWidth: '720px' }}>
                  Software Engineer focused on reliable products, systems architecture, data pipelines, and interactive
                  3D/web applications. Every interaction on this static site executes real{' '}
                  <strong>PHP {runtimeInfo.phpVersion} + Laravel Eloquent + SQLite</strong> inside your browser tab via
                  WebAssembly.
                </p>
              </div>

              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <a
                  href="https://frankiejvaldez.com"
                  target="_blank"
                  rel="noreferrer"
                  className="btn"
                >
                  <Globe size={14} />
                  <span>frankiejvaldez.com</span>
                  <ArrowUpRight size={13} />
                </a>
                <a
                  href="https://github.com/frankstop"
                  target="_blank"
                  rel="noreferrer"
                  className="btn btn-primary"
                >
                  <FolderGit2 size={14} />
                  <span>github.com/frankstop</span>
                  <ArrowUpRight size={13} />
                </a>
              </div>
            </div>

            {/* Live Eloquent Telemetry Metrics Row */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(155px, 1fr))',
                gap: '0.75rem',
                paddingTop: '0.85rem',
                borderTop: '1px solid var(--border)',
              }}
            >
              <div>
                <div style={{ fontSize: '0.72rem', color: 'var(--ink-muted)', textTransform: 'uppercase' }}>
                  Featured Repositories
                </div>
                <div className="mono" style={{ fontSize: '1.25rem', fontWeight: 700 }}>
                  {metrics?.featured_repos_count ?? 5}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '0.72rem', color: 'var(--ink-muted)', textTransform: 'uppercase' }}>
                  Sandbox Upvotes (Toy)
                </div>
                <div className="mono" style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--brand)' }}>
                  {metrics?.total_upvotes ?? 119}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '0.72rem', color: 'var(--ink-muted)', textTransform: 'uppercase' }}>
                  Active Kanban Tasks (Toy)
                </div>
                <div className="mono" style={{ fontSize: '1.25rem', fontWeight: 700 }}>
                  {metrics?.roadmap_tasks_count ?? 7}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '0.72rem', color: 'var(--ink-muted)', textTransform: 'uppercase' }}>
                  Guestbook Notes (Toy)
                </div>
                <div className="mono" style={{ fontSize: '1.25rem', fontWeight: 700 }}>
                  {metrics?.endorsements_count ?? 3}
                </div>
              </div>
            </div>
          </section>

          {/* TAB 1: FEATURED REPOSITORIES */}
          <div
            role="tabpanel"
            aria-labelledby="tab-projects"
            hidden={activeTab !== 'projects' ? true : undefined}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {/* Filter Bar */}
              <div
                className="card"
                style={{
                  padding: '0.9rem 1.1rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '1rem',
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--ink-secondary)' }}>
                    Eloquent `where('language', ...)`:
                  </span>
                  {['all', 'Python / Jupyter', 'TypeScript', 'Python'].map((lang) => (
                    <button
                      key={lang}
                      type="button"
                      className={`btn ${langFilter === lang ? 'btn-primary' : ''}`}
                      style={{ padding: '0.3rem 0.65rem', fontSize: '0.76rem' }}
                      onClick={() => handleFilterChange(lang, searchQuery)}
                    >
                      {lang === 'all' ? 'All Languages' : lang}
                    </button>
                  ))}
                </div>

                <div style={{ position: 'relative', minWidth: '240px', flex: '0 1 280px' }}>
                  <Search
                    size={14}
                    style={{
                      position: 'absolute',
                      left: '0.65rem',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      color: 'var(--ink-muted)',
                    }}
                  />
                  <input
                    type="search"
                    className="input"
                    style={{ paddingLeft: '2rem' }}
                    placeholder="Filter via Collection->filter()..."
                    value={searchQuery}
                    onChange={(e) => handleFilterChange(langFilter, e.target.value)}
                  />
                </div>
              </div>

              {/* Project Cards List */}
              <div style={{ display: 'grid', gap: '1rem' }}>
                {projects.map((proj) => (
                  <article
                    key={proj.id}
                    className="card"
                    style={{
                      padding: '1.35rem',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.9rem',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                        gap: '1rem',
                        flexWrap: 'wrap',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
                        <h2 style={{ fontSize: '1.15rem', fontWeight: 700 }}>{proj.name}</h2>
                        <span className="badge badge-mono">{proj.language}</span>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          className="btn"
                          style={{
                            padding: '0.3rem 0.65rem',
                            borderColor: 'var(--brand-border)',
                            background: 'var(--brand-soft)',
                            color: 'var(--brand)',
                            fontWeight: 600,
                          }}
                          disabled={upvotingId === proj.id}
                          onClick={() => handleUpvoteProject(proj.id)}
                          title="Dispatches POST /api/projects/{id}/upvote to Laravel in WASM"
                        >
                          <ThumbsUp size={13} />
                          <span className="mono">{proj.upvotes}</span>
                          <span>Upvote in SQLite</span>
                        </button>
                      </div>
                    </div>

                    <p style={{ color: 'var(--ink-secondary)', fontSize: '0.9rem' }}>{proj.description}</p>

                    <div
                      style={{
                        padding: '0.65rem 0.85rem',
                        borderRadius: '6px',
                        background: 'var(--surface-subtle)',
                        borderLeft: '3px solid var(--ink)',
                        fontSize: '0.82rem',
                      }}
                    >
                      <strong>Architecture Highlight:</strong> {proj.architecture_highlight}
                    </div>

                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: '0.75rem',
                        flexWrap: 'wrap',
                        paddingTop: '0.35rem',
                      }}
                    >
                      <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                        {(proj.topics || []).map((t) => (
                          <span key={t} className="badge badge-mono">
                            #{t}
                          </span>
                        ))}
                      </div>

                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <a
                          href={proj.github_url}
                          target="_blank"
                          rel="noreferrer"
                          className="btn"
                          style={{ padding: '0.32rem 0.65rem', fontSize: '0.78rem' }}
                        >
                          <Code2 size={13} />
                          <span>Source Code</span>
                          <ExternalLink size={12} />
                        </a>
                        {proj.live_url && (
                          <a
                            href={proj.live_url}
                            target="_blank"
                            rel="noreferrer"
                            className="btn btn-primary"
                            style={{ padding: '0.32rem 0.65rem', fontSize: '0.78rem' }}
                          >
                            <Globe size={13} />
                            <span>Live Deployment</span>
                            <ArrowUpRight size={12} />
                          </a>
                        )}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </div>

          {/* TAB 2: KANBAN ROADMAP & VALIDATION-BACKED GUESTBOOK */}
          <div
            role="tabpanel"
            aria-labelledby="tab-kanban"
            hidden={activeTab !== 'kanban' ? true : undefined}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
              {/* Kanban Board */}
              <section className="card" style={{ padding: '1.35rem' }}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '1rem',
                    flexWrap: 'wrap',
                    gap: '0.75rem',
                  }}
                >
                  <div>
                    <h2 style={{ fontSize: '1.1rem', fontWeight: 700 }}>
                      Interactive Engineering Roadmap (`RoadmapController`)
                    </h2>
                    <p style={{ fontSize: '0.82rem', color: 'var(--ink-secondary)' }}>
                      Move tasks across columns or create new cards. Every change runs an Eloquent `UPDATE` or `INSERT`
                      in SQLite-WASM.
                    </p>
                  </div>
                </div>

                {/* Add Task Form */}
                <form
                  onSubmit={handleCreateTask}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
                    gap: '0.6rem',
                    marginBottom: '1.25rem',
                    padding: '0.85rem',
                    background: 'var(--surface-subtle)',
                    borderRadius: '8px',
                  }}
                >
                  <input
                    type="text"
                    className="input"
                    placeholder="New engineering task title (min 4 chars)..."
                    value={newTaskTitle}
                    onChange={(e) => setNewTaskTitle(e.target.value)}
                    style={{ gridColumn: 'span 2' }}
                  />
                  <select
                    className="select"
                    value={newTaskRepo}
                    onChange={(e) => setNewTaskRepo(e.target.value)}
                  >
                    <option value="HiggsBoson">HiggsBoson</option>
                    <option value="QuiteMiles">QuiteMiles</option>
                    <option value="f-ast">f-ast</option>
                    <option value="KingKullenResearch">KingKullenResearch</option>
                    <option value="HoleIO">HoleIO</option>
                  </select>
                  <select
                    className="select"
                    value={newTaskCategory}
                    onChange={(e) => setNewTaskCategory(e.target.value)}
                  >
                    <option value="Architecture">Architecture</option>
                    <option value="AST Compiler">AST Compiler</option>
                    <option value="WebGL / 3D">WebGL / 3D</option>
                    <option value="ML Pipeline">ML Pipeline</option>
                  </select>
                  <button type="submit" className="btn btn-primary">
                    <Plus size={14} />
                    <span>Add Task (`POST /api/roadmap`)</span>
                  </button>
                </form>

                {Object.keys(taskErrors).length > 0 && (
                  <div
                    style={{
                      padding: '0.65rem 0.85rem',
                      marginBottom: '1rem',
                      borderRadius: '6px',
                      background: 'var(--danger-soft)',
                      color: 'var(--danger)',
                      fontSize: '0.8rem',
                    }}
                  >
                    <strong>Laravel 422 Validation Error:</strong>{' '}
                    {Object.values(taskErrors).flat().join(' ')}
                  </div>
                )}

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                    gap: '1rem',
                  }}
                >
                  {(
                    [
                      { key: 'backlog', title: 'Backlog' },
                      { key: 'in_progress', title: 'In Progress' },
                      { key: 'shipped', title: 'Shipped to Prod' },
                    ] as const
                  ).map((col) => {
                    const colTasks = tasks.filter((t) => t.status === col.key);
                    return (
                      <div
                        key={col.key}
                        style={{
                          background: 'var(--surface-subtle)',
                          borderRadius: '8px',
                          padding: '0.85rem',
                          border: '1px solid var(--border)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '0.65rem',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontWeight: 600, fontSize: '0.82rem' }}>{col.title}</span>
                          <span className="badge badge-mono">{colTasks.length}</span>
                        </div>

                        {colTasks.map((task) => (
                          <div
                            key={task.id}
                            className="card"
                            style={{ padding: '0.8rem', display: 'flex', flexDirection: 'column', gap: '0.55rem' }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.4rem' }}>
                              <span className="badge badge-mono" style={{ fontWeight: 600 }}>
                                {task.repo_tag}
                              </span>
                              <span className="badge">{task.category}</span>
                            </div>
                            <div style={{ fontSize: '0.84rem', fontWeight: 500 }}>{task.title}</div>
                            <div style={{ display: 'flex', gap: '0.35rem', paddingTop: '0.2rem', flexWrap: 'wrap' }}>
                              {col.key !== 'backlog' && (
                                <button
                                  type="button"
                                  className="btn"
                                  style={{ padding: '0.2rem 0.45rem', fontSize: '0.72rem' }}
                                  onClick={() => handleMoveTask(task.id, 'backlog')}
                                >
                                  ← Backlog
                                </button>
                              )}
                              {col.key !== 'in_progress' && (
                                <button
                                  type="button"
                                  className="btn"
                                  style={{ padding: '0.2rem 0.45rem', fontSize: '0.72rem' }}
                                  onClick={() => handleMoveTask(task.id, 'in_progress')}
                                >
                                  In Progress
                                </button>
                              )}
                              {col.key !== 'shipped' && (
                                <button
                                  type="button"
                                  className="btn"
                                  style={{ padding: '0.2rem 0.45rem', fontSize: '0.72rem' }}
                                  onClick={() => handleMoveTask(task.id, 'shipped')}
                                >
                                  Ship →
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              </section>

              {/* Validation-backed Guestbook / Endorsements */}
              <section className="card" style={{ padding: '1.35rem' }}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '1rem',
                    flexWrap: 'wrap',
                    gap: '0.75rem',
                  }}
                >
                  <div>
                    <h2 style={{ fontSize: '1.1rem', fontWeight: 700 }}>
                      Peer Endorsements & Guestbook (`EndorsementController`)
                    </h2>
                    <p style={{ fontSize: '0.82rem', color: 'var(--ink-secondary)' }}>
                      Protected by `Illuminate\Support\Facades\Validator`. Try testing a `422 Unprocessable Entity`
                      response and inspect it in the X-Ray Drawer!
                    </p>
                  </div>

                  <button
                    type="button"
                    className="btn"
                    onClick={(e) => handleCreateEndorsement(e, true)}
                    style={{ color: 'var(--danger)', borderColor: '#fecaca', background: 'var(--danger-soft)' }}
                  >
                    <Zap size={13} />
                    <span>Trigger 422 Validator Failure Demo</span>
                  </button>
                </div>

                <form
                  onSubmit={(e) => handleCreateEndorsement(e, false)}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                    gap: '0.75rem',
                    marginBottom: '1.25rem',
                    padding: '1rem',
                    background: 'var(--surface-subtle)',
                    borderRadius: '8px',
                  }}
                >
                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                      Your Name *
                    </label>
                    <input
                      type="text"
                      className="input"
                      placeholder="e.g. Sarah Jenkins"
                      value={guestName}
                      onChange={(e) => setGuestName(e.target.value)}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                      Role / Company *
                    </label>
                    <input
                      type="text"
                      className="input"
                      placeholder="e.g. Staff Engineer @ Acme"
                      value={guestRole}
                      onChange={(e) => setGuestRole(e.target.value)}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                      Endorsed Capability *
                    </label>
                    <select
                      className="select"
                      value={guestBadge}
                      onChange={(e) => setGuestBadge(e.target.value)}
                    >
                      <option value="Full-Stack Architecture">Full-Stack Architecture</option>
                      <option value="Systems & Algorithms">Systems & Algorithms</option>
                      <option value="Data Engineering">Data Engineering</option>
                      <option value="Bilingual Leadership">Bilingual Leadership</option>
                    </select>
                  </div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                      Endorsement Message (10–280 chars) *
                    </label>
                    <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
                      <input
                        type="text"
                        className="input"
                        style={{ flex: 1, minWidth: '240px' }}
                        placeholder="Write a note to persist into the in-browser SQLite table..."
                        value={guestMessage}
                        onChange={(e) => setGuestMessage(e.target.value)}
                      />
                      <button type="submit" className="btn btn-primary">
                        <MessageSquarePlus size={14} />
                        <span>Sign Guestbook (`POST /api/endorsements`)</span>
                      </button>
                    </div>
                  </div>
                </form>

                {Object.keys(guestErrors).length > 0 && (
                  <div
                    style={{
                      padding: '0.75rem 1rem',
                      marginBottom: '1rem',
                      borderRadius: '6px',
                      background: 'var(--danger-soft)',
                      border: '1px solid #fecaca',
                      color: 'var(--danger)',
                      fontSize: '0.8rem',
                    }}
                  >
                    <div style={{ fontWeight: 700, marginBottom: '0.25rem' }}>
                      HTTP 422 Unprocessable Entity — Laravel Validator Errors:
                    </div>
                    <ul style={{ paddingLeft: '1.2rem' }}>
                      {Object.entries(guestErrors).map(([field, msgs]) => (
                        <li key={field}>
                          <code className="mono">{field}</code>: {msgs.join(', ')}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {guestSuccess && (
                  <div
                    style={{
                      padding: '0.65rem 0.9rem',
                      marginBottom: '1rem',
                      borderRadius: '6px',
                      background: 'var(--success-soft)',
                      color: 'var(--success)',
                      fontSize: '0.8rem',
                      fontWeight: 500,
                    }}
                  >
                    {guestSuccess}
                  </div>
                )}

                <div style={{ display: 'grid', gap: '0.75rem' }}>
                  {endorsements.map((item) => (
                    <div
                      key={item.id}
                      className="card"
                      style={{
                        padding: '1rem',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                        gap: '1rem',
                      }}
                    >
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: 700 }}>{item.author_name}</span>
                          <span style={{ color: 'var(--ink-secondary)', fontSize: '0.8rem' }}>
                            • {item.author_role}
                          </span>
                          <span className="badge badge-mono">{item.skill_badge}</span>
                        </div>
                        <p style={{ marginTop: '0.35rem', color: 'var(--ink-secondary)', fontSize: '0.88rem' }}>
                          "{item.message}"
                        </p>
                      </div>

                      <button
                        type="button"
                        className="btn"
                        style={{ padding: '0.3rem 0.5rem', color: 'var(--ink-muted)' }}
                        onClick={() => handleDeleteEndorsement(item.id)}
                        title="DELETE /api/endorsements/{id}"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </div>

          {/* TAB 3: LIVE PHP CONTROLLER HOT-EDITING STUDIO */}
          <div
            role="tabpanel"
            aria-labelledby="tab-controller"
            hidden={activeTab !== 'controller_studio' ? true : undefined}
          >
            <section className="card" style={{ padding: '1.35rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  gap: '1rem',
                  flexWrap: 'wrap',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <h2 style={{ fontSize: '1.15rem', fontWeight: 700 }}>
                      Live PHP 8.3 Controller Hot-Editing Studio
                    </h2>
                    <span className="badge badge-mono">/app/Http/Controllers/*</span>
                  </div>
                  <p style={{ fontSize: '0.83rem', color: 'var(--ink-secondary)', marginTop: '0.2rem' }}>
                    Edit the actual PHP controller files mounted in the WebAssembly virtual filesystem. Click{' '}
                    <strong>Hot-Deploy & Execute</strong> to lint the PHP AST, overwrite the VFS file, and immediately
                    re-run the API route.
                  </p>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <button type="button" className="btn" onClick={handleResetController}>
                    <RotateCcw size={14} />
                    <span>Revert File</span>
                  </button>
                  <button type="button" className="btn btn-primary" onClick={handleHotDeployController}>
                    <Sparkles size={14} />
                    <span>Hot-Deploy & Execute in WASM</span>
                  </button>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
                {EDITABLE_CONTROLLERS.map((ctrl) => (
                  <button
                    key={ctrl.path}
                    type="button"
                    className={`btn mono ${activeControllerPath === ctrl.path ? 'btn-primary' : ''}`}
                    style={{ fontSize: '0.76rem' }}
                    onClick={() => handleSelectControllerFile(ctrl.path)}
                  >
                    <FileCode2 size={13} />
                    <span>{ctrl.label}</span>
                  </button>
                ))}
              </div>

              {hotSaveStatus.msg && (
                <div
                  style={{
                    padding: '0.65rem 0.9rem',
                    borderRadius: '6px',
                    fontSize: '0.8rem',
                    fontFamily: 'var(--font-mono)',
                    background:
                      hotSaveStatus.type === 'error'
                        ? 'var(--danger-soft)'
                        : hotSaveStatus.type === 'ok'
                        ? 'var(--success-soft)'
                        : 'var(--surface-subtle)',
                    color:
                      hotSaveStatus.type === 'error'
                        ? 'var(--danger)'
                        : hotSaveStatus.type === 'ok'
                        ? 'var(--success)'
                        : 'var(--ink)',
                  }}
                >
                  {hotSaveStatus.msg}
                </div>
              )}

              <textarea
                aria-label="PHP Controller Source Code Editor"
                className="code-block"
                style={{
                  width: '100%',
                  minHeight: '430px',
                  border: '1px solid var(--border-strong)',
                  resize: 'vertical',
                  outline: 'none',
                }}
                value={controllerCode}
                onChange={(e) => setControllerCode(e.target.value)}
                spellCheck={false}
              />
            </section>
          </div>

          {/* TAB 4: BUILT-IN LARAVEL TINKER & ARTISAN TERMINAL */}
          <div
            role="tabpanel"
            aria-labelledby="tab-tinker"
            hidden={activeTab !== 'tinker' ? true : undefined}
          >
            <section className="card" style={{ padding: '1.35rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '0.75rem',
                }}
              >
                <div>
                  <h2 style={{ fontSize: '1.15rem', fontWeight: 700 }}>
                    Interactive Laravel Tinker & Artisan Console (`php-wasm`)
                  </h2>
                  <p style={{ fontSize: '0.82rem', color: 'var(--ink-secondary)' }}>
                    Run live Eloquent queries, Collection pipelines, or Artisan CLI commands directly against the
                    in-browser SQLite database.
                  </p>
                </div>

                {/* One-click Artisan Commands */}
                <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                  {['route:list', 'about', 'schema:dump', 'migrate:fresh --seed'].map((cmd) => (
                    <button
                      key={cmd}
                      type="button"
                      className="btn mono"
                      style={{ fontSize: '0.74rem', padding: '0.32rem 0.6rem' }}
                      disabled={tinkerRunning}
                      onClick={() => handleRunArtisan(cmd)}
                    >
                      <Wrench size={12} />
                      <span>artisan {cmd}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Tinker Preset Buttons */}
              <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ fontSize: '0.76rem', fontWeight: 600, color: 'var(--ink-secondary)' }}>
                  Tinker Presets:
                </span>
                {TINKER_PRESETS.map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    className="btn"
                    style={{ fontSize: '0.75rem', padding: '0.25rem 0.55rem' }}
                    onClick={() => setTinkerInput(preset.code)}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                <textarea
                  aria-label="Laravel Tinker PHP Expression"
                  className="code-block"
                  style={{
                    width: '100%',
                    minHeight: '125px',
                    border: '1px solid var(--border-strong)',
                    resize: 'vertical',
                  }}
                  value={tinkerInput}
                  onChange={(e) => setTinkerInput(e.target.value)}
                  spellCheck={false}
                />
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={tinkerRunning}
                    onClick={handleRunTinker}
                  >
                    <Play size={14} />
                    <span>{tinkerRunning ? 'Executing in PHP-WASM...' : 'Evaluate in Tinker (PHP 8.3)'}</span>
                  </button>
                </div>
              </div>

              {/* REPL Output History */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.5rem' }}>
                {tinkerHistory.length === 0 ? (
                  <div
                    style={{
                      padding: '1.25rem',
                      textAlign: 'center',
                      color: 'var(--ink-muted)',
                      background: 'var(--surface-subtle)',
                      borderRadius: '8px',
                      fontSize: '0.83rem',
                    }}
                  >
                    Click <strong>Evaluate in Tinker</strong> or any <strong>artisan</strong> command above to inspect
                    live output.
                  </div>
                ) : (
                  tinkerHistory.map((entry) => (
                    <div key={entry.id} className="card" style={{ overflow: 'hidden' }}>
                      <div
                        style={{
                          padding: '0.45rem 0.85rem',
                          background: 'var(--surface-subtle)',
                          borderBottom: '1px solid var(--border)',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          fontSize: '0.75rem',
                        }}
                      >
                        <span className="mono" style={{ fontWeight: 600 }}>
                          {entry.kind === 'ARTISAN' ? '$ ' : '>>> '}
                          {entry.cmd.split('\n')[0]}
                        </span>
                        <span className="badge badge-mono">{entry.duration_ms} ms in WASM</span>
                      </div>
                      <pre className="code-block" style={{ borderRadius: 0, margin: 0, maxHeight: '280px' }}>
                        {entry.output}
                      </pre>
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>

          {/* TAB 5: LIVE SQLITE DATABASE EXPLORER (Modern Web Guidance `responsive-table` compliance) */}
          <div
            role="tabpanel"
            aria-labelledby="tab-sqlite"
            hidden={activeTab !== 'sqlite' ? true : undefined}
          >
            <section className="card" style={{ padding: '1.35rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '0.75rem',
                }}
              >
                <div>
                  <h2 style={{ fontSize: '1.15rem', fontWeight: 700 }}>
                    In-Browser SQLite Database Explorer (`/app/database/database.sqlite`)
                  </h2>
                  <p style={{ fontSize: '0.82rem', color: 'var(--ink-secondary)' }}>
                    Inspect the live relational tables inside WebAssembly memory (persisted automatically to
                    IndexedDB).
                  </p>
                </div>

                <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
                  {tables.map((t) => (
                    <button
                      key={t.name}
                      type="button"
                      className={`btn mono ${selectedTable === t.name ? 'btn-primary' : ''}`}
                      onClick={() => setSelectedTable(t.name)}
                    >
                      <Database size={13} />
                      <span>{t.name}</span>
                      <span className="badge badge-mono">{t.count}</span>
                    </button>
                  ))}
                  <button
                    type="button"
                    className="btn"
                    onClick={async () => setTables(await laravelKernel.inspectDatabase())}
                  >
                    <RefreshCw size={13} />
                    <span>Refresh</span>
                  </button>
                </div>
              </div>

              {currentTableDump && (
                <>
                  <div
                    tabIndex={0}
                    role="region"
                    aria-labelledby={tableCaptionId}
                    className="table-wrapper"
                  >
                    <table>
                      <caption id={tableCaptionId}>
                        SQLite Table: {currentTableDump.name} ({currentTableDump.count} rows)
                      </caption>
                      <thead>
                        <tr>
                          {currentTableDump.columns.map((col) => (
                            <th key={col} scope="col">
                              {col}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {currentTableDump.rows.map((row, rIdx) => (
                          <tr key={row.id ?? rIdx}>
                            {currentTableDump.columns.map((col, cIdx) => {
                              const val =
                                typeof row[col] === 'object' ? JSON.stringify(row[col]) : String(row[col] ?? '');
                              return cIdx === 0 ? (
                                <th key={col} scope="row">
                                  #{val}
                                </th>
                              ) : (
                                <td key={col} data-label={col} title={val}>
                                  {val}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div>
                    <div
                      style={{
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        color: 'var(--ink-secondary)',
                        marginBottom: '0.35rem',
                      }}
                    >
                      CREATE TABLE DDL (`sqlite_master`):
                    </div>
                    <pre className="code-block">{currentTableDump.sql}</pre>
                  </div>
                </>
              )}
            </section>
          </div>
        </main>

        {/* SPLIT-SCREEN X-RAY TELEMETRY INSPECTOR DRAWER */}
        {xrayOpen && (
          <aside className="xray-drawer" aria-label="Laravel WASM X-Ray Telemetry Inspector">
            <div
              style={{
                padding: '0.85rem 1rem',
                borderBottom: '1px solid var(--border)',
                background: 'var(--surface-subtle)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                <Activity size={15} style={{ color: 'var(--xray)' }} />
                <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>X-RAY TELEMETRY BRIDGE</span>
              </div>
              <span className="badge badge-mono" style={{ color: 'var(--xray)', borderColor: 'var(--xray-border)' }}>
                ReflectionMethod + DB::listen
              </span>
            </div>

            {/* Recent Request Waterfall Selector */}
            <div
              style={{
                maxHeight: '175px',
                overflowY: 'auto',
                borderBottom: '1px solid var(--border)',
              }}
            >
              {traces.map((t) => {
                const isSelected = activeTrace?.id === t.id;
                const statusColor =
                  t.status >= 400 ? 'var(--danger)' : t.status === 201 ? 'var(--brand)' : 'var(--success)';
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setSelectedTraceId(t.id)}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      padding: '0.55rem 0.9rem',
                      border: 'none',
                      borderBottom: '1px solid var(--border)',
                      background: isSelected ? 'var(--xray-soft)' : 'var(--surface)',
                      cursor: 'pointer',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: '0.5rem',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', minWidth: 0 }}>
                      <span
                        className="mono"
                        style={{
                          fontSize: '0.68rem',
                          fontWeight: 700,
                          padding: '0.1rem 0.35rem',
                          borderRadius: '4px',
                          background: 'var(--surface-subtle)',
                          color: 'var(--ink)',
                        }}
                      >
                        {t.method}
                      </span>
                      <span
                        className="mono"
                        style={{
                          fontSize: '0.75rem',
                          fontWeight: isSelected ? 600 : 400,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {t.uri}
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexShrink: 0 }}>
                      <span className="mono" style={{ fontSize: '0.7rem', fontWeight: 700, color: statusColor }}>
                        {t.status}
                      </span>
                      <span className="mono" style={{ fontSize: '0.68rem', color: 'var(--ink-muted)' }}>
                        {t.duration_ms}ms
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Active Trace Detail */}
            {activeTrace && (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <div
                  style={{
                    padding: '0.65rem 0.95rem',
                    borderBottom: '1px solid var(--border)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '0.4rem',
                    fontSize: '0.75rem',
                  }}
                >
                  <span className="mono" style={{ fontWeight: 600 }}>
                    {activeTrace.controller}@{activeTrace.action}
                  </span>
                  <span className="mono" style={{ color: 'var(--ink-muted)' }}>
                    {activeTrace.queries.length} SQL queries • {activeTrace.memory_kb} KB RAM
                  </span>
                </div>

                {/* Sub-tabs inside X-Ray Drawer */}
                <div
                  style={{
                    display: 'flex',
                    borderBottom: '1px solid var(--border)',
                    background: 'var(--surface-subtle)',
                    padding: '0 0.5rem',
                  }}
                >
                  {(
                    [
                      { id: 'sql', label: `Eloquent SQL (${activeTrace.queries.length})` },
                      { id: 'controller', label: 'PHP Controller Reflection' },
                      { id: 'payload', label: 'JSON Response' },
                    ] as const
                  ).map((st) => (
                    <button
                      key={st.id}
                      type="button"
                      onClick={() => setXraySubTab(st.id)}
                      style={{
                        padding: '0.5rem 0.65rem',
                        fontSize: '0.74rem',
                        fontWeight: xraySubTab === st.id ? 600 : 500,
                        color: xraySubTab === st.id ? 'var(--xray)' : 'var(--ink-secondary)',
                        background: 'transparent',
                        border: 'none',
                        borderBottom: xraySubTab === st.id ? '2px solid var(--xray)' : '2px solid transparent',
                        cursor: 'pointer',
                      }}
                    >
                      {st.label}
                    </button>
                  ))}
                </div>

                <div style={{ flex: 1, overflowY: 'auto', padding: '0.85rem' }}>
                  {xraySubTab === 'sql' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                      {activeTrace.queries.length === 0 ? (
                        <div style={{ color: 'var(--ink-muted)', fontSize: '0.8rem' }}>
                          No SQL queries executed during this dispatch.
                        </div>
                      ) : (
                        activeTrace.queries.map((q, idx) => (
                          <div
                            key={idx}
                            style={{
                              border: '1px solid var(--border)',
                              borderRadius: '6px',
                              overflow: 'hidden',
                            }}
                          >
                            <div
                              style={{
                                padding: '0.35rem 0.65rem',
                                background: 'var(--surface-subtle)',
                                borderBottom: '1px solid var(--border)',
                                display: 'flex',
                                justifyContent: 'space-between',
                                fontSize: '0.7rem',
                              }}
                            >
                              <span className="mono" style={{ fontWeight: 600 }}>
                                Query #{idx + 1} (PDO SQLite)
                              </span>
                              <span className="mono" style={{ color: 'var(--brand)', fontWeight: 600 }}>
                                {q.time_ms} ms
                              </span>
                            </div>
                            <pre className="code-block" style={{ borderRadius: 0, fontSize: '0.73rem' }}>
                              {q.query}
                              {q.bindings.length > 0
                                ? `\n-- Bindings: ${JSON.stringify(q.bindings)}`
                                : ''}
                            </pre>
                          </div>
                        ))
                      )}
                    </div>
                  )}

                  {xraySubTab === 'controller' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          fontSize: '0.74rem',
                        }}
                      >
                        <span className="mono" style={{ color: 'var(--ink-secondary)' }}>
                          {activeTrace.controller_file}
                        </span>
                        <button
                          type="button"
                          className="btn"
                          style={{ padding: '0.2rem 0.5rem', fontSize: '0.7rem' }}
                          onClick={() => {
                            if (LARAVEL_FS_FILES[activeTrace.controller_file]) {
                              handleSelectControllerFile(activeTrace.controller_file);
                              setActiveTab('controller_studio');
                            }
                          }}
                        >
                          Edit Live in Studio →
                        </button>
                      </div>
                      <pre className="code-block" style={{ fontSize: '0.72rem' }}>
                        {activeTrace.method_source}
                      </pre>
                    </div>
                  )}

                  {xraySubTab === 'payload' && (
                    <pre className="code-block" style={{ fontSize: '0.72rem' }}>
                      {JSON.stringify(activeTrace.response_preview, null, 2)}
                    </pre>
                  )}
                </div>
              </div>
            )}
          </aside>
        )}
      </div>

      {/* Native Modal Dialog for Factory Reset Confirmation (Modern Web Guidance `dialog` Rule 1) */}
      <dialog
        ref={resetDialogRef}
        aria-labelledby={resetDialogTitleId}
        onClose={handleResetDialogClose}
      >
        <div style={{ padding: '1.35rem', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          <h2 id={resetDialogTitleId} style={{ fontSize: '1.05rem', fontWeight: 700 }}>
            Reset In-Browser SQLite Database & Controllers?
          </h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--ink-secondary)' }}>
            This will execute <code className="mono">php artisan migrate:fresh --seed</code> inside the WebAssembly
            runtime, dropping and recreating the <code className="mono">projects</code>,{' '}
            <code className="mono">roadmap_tasks</code>, and <code className="mono">endorsements</code> tables and
            restoring default PHP controller code.
          </p>
          <form
            method="dialog"
            style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.55rem', marginTop: '0.35rem' }}
          >
            <button type="submit" value="cancel" className="btn" autoFocus>
              Cancel
            </button>
            <button
              type="submit"
              value="confirm-reset"
              className="btn btn-primary"
              style={{ background: 'var(--danger)', borderColor: 'var(--danger)' }}
            >
              Run migrate:fresh --seed
            </button>
          </form>
        </div>
      </dialog>
    </div>
  );
}

export default App;
