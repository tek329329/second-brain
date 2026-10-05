import { useEffect, useRef, useState } from 'react';
import {
  Activity,
  ArrowDownToLine,
  ArrowRight,
  BookOpen,
  BrainCircuit,
  CalendarDays,
  Check,
  ChevronRight,
  Command,
  FileText,
  GitBranch,
  History,
  LayoutDashboard,
  Link2,
  LoaderCircle,
  MessageSquare,
  Plus,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Upload,
  Workflow,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import Graph, { colors } from './graph';

type RecordItem = {
  id: string;
  title: string;
  body: string;
  area: string;
  kind: string;
  status: string;
  source: string;
  due: string;
  links: string[];
  created: string;
  updated: string;
  revision: string;
  archived: boolean;
};
type Connection = {
  id: string;
  name: string;
  category: string;
  fields: string[];
  help: string;
  status: string;
  configured: boolean;
  lastSync: string | null;
  error: string | null;
  count: number;
};
type Revision = { sha: string; date: string; title: string };
type State = {
  records: RecordItem[];
  connections: Connection[];
  history: Revision[];
  audit: {
    total: number;
    confirmed: number;
    contextScore: number;
    missing: string[];
    stale: { id: string; title: string }[];
    broken: { from: string; to: string }[];
    overdue: { id: string; title: string }[];
  };
  git: { branch: string; dirty: boolean; hasRemote: boolean; head: string };
  assistant: { running: boolean };
  vault: string;
};
const areas = Object.keys(colors),
  kinds = [
    'note',
    'profile',
    'goal',
    'project',
    'task',
    'event',
    'meeting',
    'decision',
    'interview',
    'source',
    'audit',
    'plan',
    // Used by vault records; dated kinds (log, experiment) are written once.
    'routine',
    'constraint',
    'product',
    'log',
    'experiment',
  ];
const nav = [
  ['Today', LayoutDashboard],
  ['My brain', BrainCircuit],
  ['Knowledge', BookOpen],
  ['Plans & tasks', Check],
  ['Calendar', CalendarDays],
  ['Communications', MessageSquare],
  ['Meetings', FileText],
  ['Connections', Link2],
  ['Capabilities', Sparkles],
  ['Cadence', Workflow],
  ['Health & history', Activity],
] as const;
type AssistantJob = {
  id: string;
  status: string;
  error?: string;
  answer?: string;
};
let token = '';
async function api<T = unknown>(route: string, data?: unknown): Promise<T> {
  if (!token) {
    const r = await fetch('/api/session');
    token = ((await r.json()) as { csrf: string }).csrf;
  }
  const r = await fetch('/api/' + route, {
    method: data === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Brain-Token': token },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  const result: unknown = await r.json();
  if (!r.ok)
    throw new Error((result as { error?: string }).error || 'Request failed');
  return result as T;
}
const date = (value: string) =>
  new Date(value).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
function Choice({
  label,
  value,
  values,
  onChange,
}: {
  label: string;
  value: string;
  values: string[];
  onChange: (v: string) => void;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <Select value={value} onValueChange={(v) => v && onChange(v)}>
        <SelectTrigger className="choice" aria-label={label}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {values.map((v) => (
            <SelectItem key={v} value={v}>
              {v}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  );
}
function Empty({
  title,
  text,
  action,
  label = 'Add context',
}: {
  title: string;
  text: string;
  action?: () => void;
  label?: string;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <BookOpen size={22} />
      </div>
      <strong>{title}</strong>
      <p>{text}</p>
      {action && (
        <Button variant="outline" onClick={action}>
          {label}
          <ArrowRight size={14} />
        </Button>
      )}
    </div>
  );
}
const questions = [
  [
    'personal',
    'Who are you, and what matters most to you?',
    'Your preferred name, background, values, and what you want this system to help you accomplish.',
  ],
  [
    'business',
    'Tell me about your businesses.',
    'Names, what each sells, customers, team, your responsibilities, and current challenges.',
  ],
  [
    'work',
    'What does your working week look like?',
    'Your role, people you work with, recurring responsibilities, and commitments.',
  ],
  [
    'school',
    'What are you studying?',
    'School, courses, current assignments, exams, and academic goals.',
  ],
  [
    'personal',
    'What are your priorities right now?',
    'Your three most important goals, deadlines, constraints, and what you want to protect time for.',
  ],
  [
    'relationships',
    'Who and what should your plans make room for?',
    'Relationships, regular personal commitments, routines, and interests you want considered.',
  ],
  [
    'personal',
    'How should I work with you?',
    'Writing examples, preferred tone, decision style, and the work you want me to take on.',
  ],
];

export default function Home() {
  const [state, setState] = useState<State | null>(null),
    [view, setView] = useState('Today'),
    [query, setQuery] = useState(''),
    [area, setArea] = useState('all'),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false);
  const [editor, setEditor] = useState<Partial<RecordItem> | null>(null),
    [selected, setSelected] = useState<RecordItem | null>(null),
    [revisions, setRevisions] = useState<Revision[]>([]),
    [oldVersion, setOldVersion] = useState<RecordItem | null>(null),
    [restoreSha, setRestoreSha] = useState('');
  const [onboard, setOnboard] = useState(false),
    [step, setStep] = useState(0),
    [answer, setAnswer] = useState(''),
    [connection, setConnection] = useState<Connection | null>(null),
    [credentials, setCredentials] = useState<Record<string, string>>({});
  const [assistant, setAssistant] = useState(false),
    [prompt, setPrompt] = useState(''),
    [mode, setMode] = useState('Advise & draft'),
    [job, setJob] = useState<AssistantJob | null>(null),
    [cadence, setCadence] = useState('daily');
  const fileInput = useRef<HTMLInputElement>(null);
  const refresh = async () => {
    try {
      setState(await api<State>('state'));
    } catch (e) {
      setError((e as Error).message);
    }
  };
  useEffect(() => {
    const initial = setTimeout(() => {
      void refresh();
    }, 0);
    const t = setInterval(() => {
      void refresh();
    }, 15000);
    return () => {
      clearTimeout(initial);
      clearInterval(t);
    };
  }, []);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(''), 7000);
    return () => clearTimeout(t);
  }, [notice]);
  useEffect(() => {
    if (!job?.id || job.status !== 'running') return;
    const t = setInterval(async () => {
      try {
        const j = await api<AssistantJob>('job?id=' + job.id);
        setJob(j);
        if (j.status !== 'running') void refresh();
      } catch (e) {
        setError((e as Error).message);
      }
    }, 2000);
    return () => clearInterval(t);
  }, [job?.id, job?.status]);
  async function perform(fn: () => Promise<void>) {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const all = state?.records.filter((r) => !r.archived) || [];
  const activeTasks = all.filter(
    (r) => r.kind === 'task' && r.status !== 'completed',
  );
  const events = all
    .filter((r) => r.kind === 'event' && r.due)
    .sort((a, b) => a.due.localeCompare(b.due));
  const filtered = all.filter(
    (r) =>
      (area === 'all' || r.area === area) &&
      (!query ||
        (r.title + ' ' + r.body + ' ' + r.source)
          .toLowerCase()
          .includes(query.toLowerCase())),
  );
  function create(kind = 'note', a = 'personal') {
    setEditor({
      title: '',
      body: '',
      kind,
      area: a,
      status: 'confirmed',
      source: 'User entry',
      due: '',
      links: [],
    });
  }
  async function openRecord(r: RecordItem) {
    setSelected(r);
    setOldVersion(null);
    setRestoreSha('');
    try {
      setRevisions(await api<Revision[]>('history?id=' + r.id));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const selectId = (id: string) => {
    const r = all.find((r) => r.id === id);
    if (r) void openRecord(r);
  };
  async function saveEditor() {
    if (!editor) return;
    await perform(async () => {
      await api<RecordItem>('record', {
        record: editor,
        revision: editor.revision,
      });
      setEditor(null);
      setSelected(null);
      await refresh();
      setNotice('Saved with version history.');
    });
  }
  function ask(text: string) {
    setPrompt(text);
    setAssistant(true);
  }
  function startOnboarding() {
    const next = questions.findIndex(
      (q) => !all.some((r) => r.kind === 'interview' && r.title === q[1]),
    );
    setStep(next < 0 ? 0 : next);
    setAnswer('');
    setOnboard(true);
  }
  const list = (items: RecordItem[]) =>
    items.map((r) => (
      <button className="record-row" key={r.id} onClick={() => openRecord(r)}>
        <span className="record-icon" style={{ color: colors[r.area] }}>
          <FileText size={18} />
        </span>
        <span className="record-text">
          <strong>{r.title}</strong>
          <small>
            {r.area} · {r.kind} · {r.source.slice(0, 65)}
          </small>
        </span>
        <span className={'status ' + r.status}>{r.status}</span>
        <time>{date(r.updated)}</time>
        <ChevronRight size={15} />
      </button>
    ));
  const today = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  return (
    <SidebarProvider
      className="os-shell"
      style={{ '--sidebar-width': '215px' } as React.CSSProperties}
    >
      <Sidebar className="os-sidebar">
        <SidebarHeader>
          <div className="brand">
            <div className="brand-mark">
              <BrainCircuit size={23} />
            </div>
            <span>
              Life OS<small>SECOND BRAIN</small>
            </span>
          </div>
        </SidebarHeader>
        <SidebarContent>
          <div className="nav-label">WORKSPACE</div>
          <nav>
            {nav.map(([name, Icon]) => (
              <button
                className={'nav-item ' + (view === name ? 'active' : '')}
                key={name}
                onClick={() => {
                  setView(name);
                  setQuery('');
                }}
              >
                <Icon size={17} />
                <span>{name}</span>
                {name === 'Plans & tasks' && activeTasks.length > 0 && (
                  <small>{activeTasks.length}</small>
                )}
              </button>
            ))}
          </nav>
          <div className="nav-label">YOUR LIFE</div>
          {areas.slice(0, 5).map((a) => (
            <button
              className="area-item"
              key={a}
              onClick={() => {
                setArea(a);
                setView('Knowledge');
              }}
            >
              <i style={{ background: colors[a] }} />
              {a}
            </button>
          ))}
        </SidebarContent>
        <SidebarFooter>
          <button
            className="local-badge"
            onClick={() => setView('Health & history')}
          >
            <ShieldCheck size={17} />
            <span>
              Private on this computer
              <small>
                {state?.git.hasRemote
                  ? 'Remote configured'
                  : 'Private backup not connected'}
              </small>
            </span>
          </button>
          <div className="sidebar-bottom">
            <GitBranch size={13} />
            {state?.git.branch || 'main'}
            <span>{state?.git.head || 'loading'}</span>
          </div>
        </SidebarFooter>
      </Sidebar>
      <div className="workspace">
        <header className="topbar">
          <SidebarTrigger />
          <span className="crumb">
            Workspace <ChevronRight size={12} /> <b>{view}</b>
          </span>
          <div className="global-search">
            <Search size={16} />
            <Input
              aria-label="Search your knowledge"
              placeholder="Search your life…"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setView('Knowledge');
              }}
            />
            <Command size={13} />
          </div>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Refresh knowledge"
            onClick={refresh}
          >
            <RefreshCw size={16} />
          </Button>
          <Button className="capture-button" onClick={() => create()}>
            <Plus size={16} />
            Capture
          </Button>
        </header>
        {error && (
          <div className="banner error" role="alert">
            {error}
            <button aria-label="Dismiss error" onClick={() => setError('')}>
              <X size={16} />
            </button>
          </div>
        )}
        {notice && (
          <div className="banner success" aria-live="polite">
            <Check size={16} />
            {notice}
          </div>
        )}
        {!state ? (
          <div className="loading">
            <LoaderCircle className="spin" />
            Opening your knowledge base…
          </div>
        ) : (
          <>
            <div className="page-heading">
              <div>
                <div className="eyebrow">
                  {view === 'Today'
                    ? 'YOUR PERSONAL OPERATING SYSTEM'
                    : 'SECOND BRAIN / ' + view.toUpperCase()}
                </div>
                <h1>
                  {view === 'Today'
                    ? today
                    : view === 'My brain'
                      ? 'Every part of your life. Connected.'
                      : view}
                </h1>
              </div>
              <div className="heading-actions">
                <span className="live-indicator">
                  <i />
                  Local knowledge
                </span>
                <Button
                  variant="outline"
                  onClick={() =>
                    ask(
                      'What should I focus on today? Consider my goals, school, work, and business commitments. Cite your sources and identify any missing context.',
                    )
                  }
                >
                  <Sparkles size={15} />
                  Ask my brain
                </Button>
              </div>
            </div>
            {view === 'Today' && (
              <div className="dashboard-grid">
                <div className="dashboard-main">
                  <div className="metrics">
                    <div>
                      <span>KNOWLEDGE RECORDS</span>
                      <strong>{all.length.toLocaleString()}</strong>
                      <small>
                        Across {new Set(all.map((r) => r.area)).size} life areas
                      </small>
                    </div>
                    <div>
                      <span>OPEN COMMITMENTS</span>
                      <strong>{activeTasks.length}</strong>
                      <small>{state.audit.overdue.length} overdue</small>
                    </div>
                    <div>
                      <span>CONNECTED SOURCES</span>
                      <strong>
                        {
                          state.connections.filter(
                            (c) => c.status === 'connected',
                          ).length
                        }
                        <em>
                          {' '}
                          /{' '}
                          {
                            state.connections.filter((c) => c.fields.length)
                              .length
                          }
                        </em>
                      </strong>
                      <button onClick={() => setView('Connections')}>
                        Manage connections <ArrowRight size={12} />
                      </button>
                    </div>
                  </div>
                  {all.filter((r) => r.kind === 'interview').length < 7 && (
                    <div className="onboarding-strip">
                      <span className="strip-icon">
                        <Sparkles size={19} />
                      </span>
                      <div>
                        <strong>Give your brain some context</strong>
                        <p>
                          Start with your life, businesses, work, and school.
                        </p>
                      </div>
                      <Button
                        onClick={() => {
                          startOnboarding();
                        }}
                      >
                        Begin onboarding
                        <ArrowRight size={14} />
                      </Button>
                    </div>
                  )}
                  <section className="panel brain-panel">
                    <div className="panel-heading">
                      <div>
                        <BrainCircuit size={17} />
                        <h2>Your brain</h2>
                        <span className="subtle">
                          A living map of your knowledge
                        </span>
                      </div>
                      <button onClick={() => setView('My brain')}>
                        Explore brain <ArrowRight size={14} />
                      </button>
                    </div>
                    <Graph records={all} onSelect={selectId} />
                  </section>
                  <div className="two-panels">
                    <section className="panel">
                      <div className="panel-heading">
                        <div>
                          <Check size={17} />
                          <h2>Next actions</h2>
                        </div>
                        <button onClick={() => create('task')}>
                          Add task <Plus size={14} />
                        </button>
                      </div>
                      {activeTasks.length ? (
                        list(activeTasks.slice(0, 4))
                      ) : (
                        <Empty
                          title="Room to focus"
                          text="Capture a commitment or build a plan from your priorities."
                          action={() =>
                            ask(
                              'Help me identify my next actions. First ask about any missing goals and deadlines.',
                            )
                          }
                          label="Plan with me"
                        />
                      )}
                    </section>
                    <section className="panel">
                      <div className="panel-heading">
                        <div>
                          <History size={17} />
                          <h2>Recently remembered</h2>
                        </div>
                        <button onClick={() => setView('Knowledge')}>
                          View all <ArrowRight size={14} />
                        </button>
                      </div>
                      {list(all.slice(0, 4))}
                    </section>
                  </div>
                </div>
                <aside className="right-rail">
                  <section className="panel agenda">
                    <div className="panel-heading">
                      <div>
                        <CalendarDays size={17} />
                        <h2>Upcoming</h2>
                      </div>
                      <button
                        aria-label="Add event"
                        onClick={() => create('event')}
                      >
                        <Plus size={16} />
                      </button>
                    </div>
                    <div className="week-strip">
                      {Array.from({ length: 7 }, (_, i) => {
                        const d = new Date();
                        d.setDate(d.getDate() + i);
                        return (
                          <div className={i === 0 ? 'today' : ''} key={i}>
                            <small>
                              {d.toLocaleDateString(undefined, {
                                weekday: 'narrow',
                              })}
                            </small>
                            <strong>{d.getDate()}</strong>
                          </div>
                        );
                      })}
                    </div>
                    {events
                      .filter(
                        (e) =>
                          e.due.slice(0, 10) >=
                          new Date().toISOString().slice(0, 10),
                      )
                      .slice(0, 5)
                      .map((e) => (
                        <button
                          className="agenda-item"
                          key={e.id}
                          onClick={() => openRecord(e)}
                        >
                          <time>{e.due.slice(0, 10)}</time>
                          <strong>{e.title}</strong>
                          <small>{e.area}</small>
                        </button>
                      ))}
                    {!events.length && (
                      <div className="rail-empty">
                        <CalendarDays size={25} />
                        <strong>Your calendar belongs here</strong>
                        <p>Connect a calendar or import an .ics file.</p>
                        <button onClick={() => setView('Connections')}>
                          Connect calendar <ArrowRight size={13} />
                        </button>
                      </div>
                    )}
                  </section>
                  <section className="panel health-card">
                    <div className="panel-heading">
                      <div>
                        <Activity size={17} />
                        <h2>Knowledge health</h2>
                      </div>
                    </div>
                    <div className="health-value">
                      <strong>
                        {state.audit.contextScore}
                        <em>%</em>
                      </strong>
                      <span>
                        Life areas with
                        <br />
                        confirmed context
                      </span>
                    </div>
                    <div className="health-bar">
                      <i style={{ width: state.audit.contextScore + '%' }} />
                    </div>
                    <p>
                      {state.audit.missing.length} areas still need your
                      context.
                    </p>
                    <button onClick={() => setView('Health & history')}>
                      See what is missing <ArrowRight size={14} />
                    </button>
                  </section>
                  <section className="panel pulse">
                    <div className="panel-heading">
                      <div>
                        <Activity size={17} />
                        <h2>Community pulse</h2>
                      </div>
                    </div>
                    <p>
                      Connect YouTube or import community updates to bring your
                      audience into view.
                    </p>
                    <Button
                      variant="outline"
                      onClick={() => setView('Connections')}
                    >
                      Choose sources
                      <ArrowRight size={14} />
                    </Button>
                  </section>
                </aside>
              </div>
            )}
            {view === 'My brain' && (
              <section className="panel full-brain">
                <div className="panel-heading">
                  <div>
                    <h2>Your knowledge graph</h2>
                    <span className="subtle">
                      Drag to rotate · scroll to zoom · select a record
                    </span>
                  </div>
                  <Button variant="outline" onClick={() => create()}>
                    Add a connection to your life
                    <Plus size={14} />
                  </Button>
                </div>
                <Graph records={filtered} onSelect={selectId} expanded />
              </section>
            )}
            {[
              'Knowledge',
              'Plans & tasks',
              'Meetings',
              'Communications',
            ].includes(view) && (
              <section className="panel records-panel">
                <div className="panel-heading">
                  <div>
                    <h2>{view === 'Knowledge' ? 'Knowledge library' : view}</h2>
                    <span className="subtle">
                      Source-linked · versioned · searchable
                    </span>
                  </div>
                  <Button
                    onClick={() =>
                      create(
                        view === 'Plans & tasks'
                          ? 'task'
                          : view === 'Meetings'
                            ? 'meeting'
                            : 'note',
                      )
                    }
                  >
                    <Plus size={15} />
                    New {view === 'Plans & tasks' ? 'task' : 'record'}
                  </Button>
                </div>
                <div className="filter-row">
                  <Choice
                    label="Life area"
                    value={area}
                    values={['all', ...areas]}
                    onChange={setArea}
                  />
                  <div className="search-inline">
                    <Search size={16} />
                    <Input
                      aria-label="Filter records"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Search titles, content, and sources"
                    />
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => fileInput.current?.click()}
                  >
                    <Upload size={15} />
                    Import file
                  </Button>
                </div>
                {(() => {
                  const items = filtered.filter(
                    (r) =>
                      view === 'Knowledge' ||
                      (view === 'Plans & tasks' &&
                        ['task', 'plan', 'project', 'goal'].includes(r.kind)) ||
                      (view === 'Meetings' && r.kind === 'meeting') ||
                      (view === 'Communications' &&
                        ['slack', 'google', 'microsoft'].some((p) =>
                          r.source.startsWith(p + ':'),
                        )),
                  );
                  return items.length ? (
                    list(items)
                  ) : (
                    <Empty
                      title={
                        query
                          ? 'No matching records'
                          : 'This part of your brain is ready'
                      }
                      text={
                        query
                          ? 'Try another search or life area.'
                          : 'Capture what matters, import a file, or connect your existing sources.'
                      }
                      action={() => create()}
                    />
                  );
                })()}
              </section>
            )}
            {view === 'Calendar' && (
              <section className="panel">
                <div className="panel-heading">
                  <div>
                    <CalendarDays size={18} />
                    <h2>Events & deadlines</h2>
                  </div>
                  <Button onClick={() => create('event')}>
                    <Plus size={15} />
                    New event
                  </Button>
                </div>
                {list(
                  [...events, ...activeTasks.filter((t) => t.due)].sort(
                    (a, b) => a.due.localeCompare(b.due),
                  ),
                )}
                {!events.length && !activeTasks.some((t) => t.due) && (
                  <Empty
                    title="Bring your schedule into view"
                    text="Add events and tasks, connect your calendar, or import an iCalendar file."
                    action={() => fileInput.current?.click()}
                    label="Import calendar"
                  />
                )}
              </section>
            )}
            {view === 'Connections' && (
              <>
                <p className="page-note">
                  Connections bring changing information into your brain. A
                  source is marked connected only after a successful read.
                </p>
                <div className="connection-grid">
                  {state.connections.map((c) => (
                    <section className="panel connection-card" key={c.id}>
                      <div className="connection-top">
                        <span className={'provider-icon ' + c.id}>
                          {c.name.slice(0, 1)}
                        </span>
                        <span className={'status ' + c.status}>
                          {c.status.replaceAll('-', ' ')}
                        </span>
                      </div>
                      <h2>{c.name}</h2>
                      <p>{c.category}</p>
                      <small>
                        {c.lastSync
                          ? 'Last import ' +
                            new Date(c.lastSync).toLocaleString() +
                            ' · ' +
                            c.count +
                            ' items'
                          : c.id === 'files'
                            ? 'Markdown, text, JSON, and iCalendar'
                            : 'No account data imported'}
                      </small>
                      {c.error && <p className="connection-error">{c.error}</p>}
                      <div className="card-actions">
                        <Button
                          variant="outline"
                          onClick={() => {
                            if (c.id === 'files') fileInput.current?.click();
                            else {
                              setConnection(c);
                              setCredentials({});
                            }
                          }}
                        >
                          {c.fields.length ? 'Configure' : 'Import options'}
                        </Button>
                        {c.fields.length > 0 && (
                          <Button
                            disabled={!c.configured || busy}
                            onClick={() =>
                              perform(async () => {
                                const result = await api<{ count: number }>(
                                  'sync',
                                  { id: c.id },
                                );
                                setNotice(
                                  'Imported ' +
                                    result.count +
                                    ' items from ' +
                                    c.name,
                                );
                                await refresh();
                              })
                            }
                          >
                            <RefreshCw size={14} />
                            Sync
                          </Button>
                        )}
                      </div>
                    </section>
                  ))}
                </div>
              </>
            )}
            {view === 'Capabilities' && (
              <div className="capability-grid">
                {[
                  [
                    'Onboard',
                    'Build your profile through seven focused conversations.',
                    'Start onboarding',
                  ],
                  [
                    'Grill me',
                    'Explore a topic in depth and save what we learn.',
                    'Interview me about my current priorities. Ask one question at a time, save each answer, and identify missing context.',
                  ],
                  [
                    'Link knowledge',
                    'Connect records, people, projects, and decisions.',
                    'Use the brain-link skill to review my knowledge and propose supported relationships.',
                  ],
                  [
                    'Audit',
                    'Find stale facts, missing context, and broken links.',
                    'Use the brain-audit skill to evaluate my second brain across context, connections, capabilities, and cadence.',
                  ],
                  [
                    'Level up',
                    'Turn gaps and bottlenecks into useful next steps.',
                    'Use the brain-level-up skill to identify the highest-value improvement to my system.',
                  ],
                  [
                    'Plan my week',
                    'Balance school, work, business, and personal commitments.',
                    'Use the brain-plan skill to plan my week, using current goals, calendar, and deadlines.',
                  ],
                  [
                    'Do work',
                    'Create drafts and local deliverables with my context.',
                    'Help me complete a piece of work. Ask what outcome I need, then retrieve the relevant context.',
                  ],
                  [
                    'Build a wiki',
                    'Synthesize source material into linked reference pages.',
                    'Use the brain-wiki skill to organize my source material into a linked wiki with citations.',
                  ],
                ].map(([title, description, p]) => (
                  <section className="panel capability-card" key={title}>
                    <Sparkles size={23} />
                    <h2>{title}</h2>
                    <p>{description}</p>
                    <Button
                      variant="outline"
                      onClick={() =>
                        title === 'Onboard' ? startOnboarding() : ask(p)
                      }
                    >
                      Run workflow
                      <ArrowRight size={14} />
                    </Button>
                  </section>
                ))}
              </div>
            )}
            {view === 'Cadence' && (
              <section className="panel cadence-panel">
                <div className="panel-heading">
                  <div>
                    <Workflow size={18} />
                    <h2>Recurring routines</h2>
                    <span className="status unconfirmed">Manual routines</span>
                  </div>
                </div>
                <p>
                  Choose a routine and copy its request into this Codex task to
                  schedule it. These routines need an active scheduler; saving a
                  description does not turn one on.
                </p>
                <Tabs
                  value={cadence}
                  onValueChange={(v) => setCadence(String(v))}
                >
                  <TabsList>
                    <TabsTrigger value="daily">Daily briefing</TabsTrigger>
                    <TabsTrigger value="weekly">Weekly review</TabsTrigger>
                    <TabsTrigger value="audit">Knowledge audit</TabsTrigger>
                  </TabsList>
                  {['daily', 'weekly', 'audit'].map((c) => (
                    <TabsContent key={c} value={c}>
                      <div className="routine">
                        <h2>
                          {c === 'daily'
                            ? 'Start the day with a clear plan'
                            : c === 'weekly'
                              ? 'Make space for what matters'
                              : 'Keep your knowledge current'}
                        </h2>
                        <p>
                          {c === 'daily'
                            ? 'Review upcoming events, overdue commitments, and your top priorities.'
                            : c === 'weekly'
                              ? 'Review outcomes, open loops, and next week’s workload across all life areas.'
                              : 'Find stale records, broken relationships, incomplete profiles, and failed connections.'}
                        </p>
                        <Button
                          onClick={() =>
                            perform(async () => {
                              await navigator.clipboard.writeText(
                                'Create a ' +
                                  (c === 'daily'
                                    ? 'daily 8 AM'
                                    : c === 'weekly'
                                      ? 'Sunday 5 PM'
                                      : 'Monday 9 AM') +
                                  ' automation in my local timezone for my second brain at ' +
                                  state.vault +
                                  '. Read AGENTS.md and INDEX.md. ' +
                                  (c === 'daily'
                                    ? 'Prepare a morning briefing from current commitments and calendar.'
                                    : c === 'weekly'
                                      ? 'Review my week and prepare next week’s plan.'
                                      : 'Audit knowledge freshness, links, and missing context.') +
                                  ' Save the report in the knowledge base. Notify only on a meaningful change, a new actionable report, a failure, or required user input.',
                              );
                              setNotice(
                                'Scheduling request copied. Paste it into Codex to activate the routine.',
                              );
                            })
                          }
                        >
                          Copy scheduling request
                          <ArrowRight size={14} />
                        </Button>
                      </div>
                    </TabsContent>
                  ))}
                </Tabs>
              </section>
            )}
            {view === 'Health & history' && (
              <div className="history-layout">
                <section className="panel">
                  <div className="panel-heading">
                    <div>
                      <Activity size={18} />
                      <h2>Knowledge health</h2>
                    </div>
                    <Button
                      disabled={busy}
                      onClick={() =>
                        perform(async () => {
                          await api('audit', {});
                          await refresh();
                          setNotice('Audit saved to your knowledge history.');
                        })
                      }
                    >
                      Run audit
                    </Button>
                  </div>
                  <div className="audit-body">
                    <h3>Missing confirmed context</h3>
                    <div className="chips">
                      {state.audit.missing.map((a) => (
                        <button key={a} onClick={() => create('profile', a)}>
                          <i style={{ background: colors[a] }} />
                          {a}
                          <Plus size={13} />
                        </button>
                      ))}
                    </div>
                    <h3>Records to review</h3>
                    <p>
                      {state.audit.stale.length} records older than 30 days ·{' '}
                      {state.audit.broken.length} unresolved relationships ·{' '}
                      {state.audit.overdue.length} overdue tasks
                    </p>
                    {state.audit.stale.map((r) => (
                      <button
                        className="text-link"
                        key={r.id}
                        onClick={() => selectId(r.id)}
                      >
                        {r.title}
                      </button>
                    ))}
                    <h3>Portability & backup</h3>
                    <p>
                      Your knowledge lives in readable Markdown files. Every
                      dashboard save has Git history. Create a verified Git
                      bundle to carry the complete knowledge history to another
                      computer.
                    </p>
                    <div className="card-actions">
                      <Button
                        disabled={busy}
                        onClick={() =>
                          perform(async () => {
                            const b = await api<{ name: string }>('backup', {});
                            setNotice(
                              'Verified backup saved in backups/' + b.name,
                            );
                          })
                        }
                      >
                        <GitBranch size={15} />
                        Create Git backup
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() =>
                          perform(async () => {
                            const data = await api('export');
                            const url = URL.createObjectURL(
                              new Blob([JSON.stringify(data, null, 2)], {
                                type: 'application/json',
                              }),
                            );
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = 'life-os-knowledge.json';
                            a.click();
                            URL.revokeObjectURL(url);
                          })
                        }
                      >
                        <ArrowDownToLine size={15} />
                        Export records
                      </Button>
                      <Button
                        variant="outline"
                        disabled={busy}
                        onClick={() =>
                          perform(async () => {
                            await api('checkpoint', {});
                            await refresh();
                            setNotice('Knowledge checkpoint saved.');
                          })
                        }
                      >
                        Checkpoint
                      </Button>
                    </div>
                    <p className="backup-status">
                      {state.git.hasRemote
                        ? 'A Git remote is configured. See README for safe pull/push steps.'
                        : 'Off-device backup is not connected. Local history protects revisions, but stays on this computer.'}
                    </p>
                  </div>
                </section>
                <section className="panel">
                  <div className="panel-heading">
                    <div>
                      <History size={18} />
                      <h2>Version history</h2>
                    </div>
                    <span className="subtle">
                      {state.history.length} recent revisions
                    </span>
                  </div>
                  <div className="timeline">
                    {state.history.map((h) => (
                      <div key={h.sha}>
                        <i />
                        <strong>{h.title}</strong>
                        <small>
                          {new Date(h.date).toLocaleString()} ·{' '}
                          {h.sha.slice(0, 7)}
                        </small>
                      </div>
                    ))}
                  </div>
                </section>
              </div>
            )}
          </>
        )}
        <footer className="workspace-footer">
          <span>
            <ShieldCheck size={13} />
            Your files. Your history. Your context.
          </span>
          <button
            onClick={() =>
              ask(
                'Help me think through something using what you know about me.',
              )
            }
          >
            <Sparkles size={14} />
            Think with my brain
            <ArrowRight size={13} />
          </button>
        </footer>
      </div>
      <input
        ref={fileInput}
        type="file"
        className="sr-only"
        accept=".md,.txt,.json,.ics"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file)
            void perform(async () => {
              const result = await api<{ count: number }>('import', {
                name: file.name,
                text: await file.text(),
                area: area === 'all' ? 'knowledge' : area,
              });
              await refresh();
              setNotice(result.count + ' records imported with history.');
            });
          e.target.value = '';
        }}
      />
      <Dialog
        open={editor !== null}
        onOpenChange={(open) => !open && setEditor(null)}
      >
        <DialogContent className="record-dialog">
          <DialogHeader>
            <DialogTitle>
              {editor?.id
                ? 'Edit knowledge'
                : 'Capture something worth remembering'}
            </DialogTitle>
            <DialogDescription>
              Saved as a local file with a recoverable version history.
            </DialogDescription>
          </DialogHeader>
          {editor && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void saveEditor();
              }}
            >
              <label className="field" htmlFor="record-title">
                <span>Title</span>
                <Input
                  id="record-title"
                  value={editor.title || ''}
                  onChange={(e) =>
                    setEditor({ ...editor, title: e.target.value })
                  }
                  required
                  maxLength={200}
                />
              </label>
              <div className="form-grid">
                <Choice
                  label="Life area"
                  value={editor.area || 'personal'}
                  values={areas}
                  onChange={(area) => setEditor({ ...editor, area })}
                />
                <Choice
                  label="Record type"
                  value={editor.kind || 'note'}
                  values={kinds}
                  onChange={(kind) => setEditor({ ...editor, kind })}
                />
                <Choice
                  label="Status"
                  value={editor.status || 'confirmed'}
                  values={[
                    'confirmed',
                    'unconfirmed',
                    'inference',
                    'completed',
                  ]}
                  onChange={(status) => setEditor({ ...editor, status })}
                />
                <label className="field" htmlFor="record-date">
                  <span>Date or deadline</span>
                  <Input
                    id="record-date"
                    type="date"
                    value={editor.due?.slice(0, 10) || ''}
                    onChange={(e) =>
                      setEditor({ ...editor, due: e.target.value })
                    }
                  />
                </label>
              </div>
              <label className="field" htmlFor="record-body">
                <span>What should your brain know?</span>
                <Textarea
                  id="record-body"
                  className="body-editor"
                  value={editor.body || ''}
                  onChange={(e) =>
                    setEditor({ ...editor, body: e.target.value })
                  }
                  placeholder="Facts, context, decisions, or an update…"
                  required
                />
              </label>
              <label className="field" htmlFor="record-source">
                <span>Source</span>
                <Input
                  id="record-source"
                  value={editor.source || ''}
                  onChange={(e) =>
                    setEditor({ ...editor, source: e.target.value })
                  }
                />
              </label>
              <details className="relationships">
                <summary>
                  Link related knowledge ({editor.links?.length || 0})
                </summary>
                {all
                  .filter((r) => r.id !== editor.id)
                  .map((r) => (
                    <label key={r.id}>
                      <Checkbox
                        checked={editor.links?.includes(r.id) || false}
                        onCheckedChange={(checked) =>
                          setEditor({
                            ...editor,
                            links: checked
                              ? [...(editor.links || []), r.id]
                              : (editor.links || []).filter(
                                  (id) => id !== r.id,
                                ),
                          })
                        }
                      />
                      {r.title}
                    </label>
                  ))}
              </details>
              <div className="dialog-actions">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => fileInput.current?.click()}
                >
                  <Upload size={14} />
                  Import file
                </Button>
                <Button type="submit" disabled={busy}>
                  {busy ? (
                    <LoaderCircle className="spin" size={15} />
                  ) : (
                    <Check size={15} />
                  )}
                  Save to my brain
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={selected !== null}
        onOpenChange={(open) => !open && setSelected(null)}
      >
        <DialogContent className="record-dialog detail-dialog">
          <DialogHeader>
            <DialogTitle>{selected?.title}</DialogTitle>
            <DialogDescription>
              {selected?.area} · {selected?.kind} · {selected?.status}
            </DialogDescription>
          </DialogHeader>
          {selected && (
            <Tabs defaultValue="content">
              <TabsList>
                <TabsTrigger value="content">Knowledge</TabsTrigger>
                <TabsTrigger value="history">
                  History ({revisions.length})
                </TabsTrigger>
                <TabsTrigger value="links">Relationships</TabsTrigger>
              </TabsList>
              <TabsContent value="content">
                <div className="source-line">
                  Source: {selected.source}
                  <br />
                  Updated {new Date(selected.updated).toLocaleString()}
                </div>
                <div className="document-body">{selected.body}</div>
                <div className="dialog-actions">
                  <Button
                    variant="outline"
                    onClick={() => {
                      ask(
                        'Using records/' +
                          selected.id +
                          '.md and related context, help me decide what to do next.',
                      );
                      setSelected(null);
                    }}
                  >
                    Think about this
                    <Sparkles size={14} />
                  </Button>
                  <Button
                    onClick={() => {
                      setEditor(selected);
                      setSelected(null);
                    }}
                  >
                    Edit record
                  </Button>
                </div>
              </TabsContent>
              <TabsContent value="history">
                <div className="revision-list">
                  {revisions.map((h) => (
                    <button
                      className={restoreSha === h.sha ? 'chosen' : ''}
                      key={h.sha}
                      onClick={() =>
                        perform(async () => {
                          setOldVersion(
                            await api<RecordItem>(
                              'version?id=' + selected.id + '&sha=' + h.sha,
                            ),
                          );
                          setRestoreSha(h.sha);
                        })
                      }
                    >
                      <History size={15} />
                      <span>
                        {h.title}
                        <small>{new Date(h.date).toLocaleString()}</small>
                      </span>
                    </button>
                  ))}
                </div>
                {oldVersion && (
                  <>
                    <div className="document-body">{oldVersion.body}</div>
                    <Button
                      disabled={busy}
                      onClick={() =>
                        perform(async () => {
                          const r = await api<RecordItem>('restore', {
                            id: selected.id,
                            sha: restoreSha,
                            revision: selected.revision,
                          });
                          setSelected(r);
                          setOldVersion(null);
                          setRevisions(
                            await api<Revision[]>('history?id=' + r.id),
                          );
                          await refresh();
                          setNotice(
                            'Restored as a new revision. Previous history is preserved.',
                          );
                        })
                      }
                    >
                      Restore this version
                    </Button>
                  </>
                )}
              </TabsContent>
              <TabsContent value="links">
                {list(
                  all.filter(
                    (r) =>
                      selected.links.includes(r.id) ||
                      r.links.includes(selected.id),
                  ),
                )}
                {!all.some(
                  (r) =>
                    selected.links.includes(r.id) ||
                    r.links.includes(selected.id),
                ) && (
                  <Empty
                    title="No explicit relationships yet"
                    text="Edit this record to link related knowledge, or run the Link knowledge workflow."
                  />
                )}
              </TabsContent>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={onboard} onOpenChange={setOnboard}>
        <DialogContent className="record-dialog onboarding-dialog">
          <DialogHeader>
            <DialogTitle>Let’s build your context</DialogTitle>
            <DialogDescription>
              Question {step + 1} of {questions.length}. Each answer is saved
              before you move on.
            </DialogDescription>
          </DialogHeader>
          <div className="onboard-steps">
            {questions.map((_, i) => (
              <i key={i} className={i <= step ? 'done' : ''} />
            ))}
          </div>
          <h2>{questions[step][1]}</h2>
          <p>{questions[step][2]}</p>
          <Textarea
            className="body-editor"
            aria-label="Your onboarding answer"
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder="Tell me in your own words…"
          />
          <div className="dialog-actions">
            <Button variant="outline" onClick={() => setOnboard(false)}>
              Continue later
            </Button>
            <Button
              disabled={!answer.trim() || busy}
              onClick={() =>
                perform(async () => {
                  await api<RecordItem>('record', {
                    record: {
                      title: questions[step][1],
                      body: answer,
                      area: questions[step][0],
                      kind: 'interview',
                      status: 'confirmed',
                      source: 'User onboarding · ' + new Date().toISOString(),
                      links: ['system-purpose'],
                    },
                  });
                  setAnswer('');
                  await refresh();
                  if (step === questions.length - 1) {
                    setOnboard(false);
                    setStep(0);
                    setNotice(
                      'Your first seven answers are saved. Use Grill me to explore any topic further.',
                    );
                  } else setStep(step + 1);
                })
              }
            >
              {step === 6 ? 'Finish onboarding' : 'Save & continue'}
              <ArrowRight size={14} />
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog
        open={connection !== null}
        onOpenChange={(open) => !open && setConnection(null)}
      >
        <DialogContent className="record-dialog connection-dialog">
          <DialogHeader>
            <DialogTitle>{connection?.name}</DialogTitle>
            <DialogDescription>{connection?.category}</DialogDescription>
          </DialogHeader>
          <p>{connection?.help}</p>
          {connection?.fields.length ? (
            <>
              <p className="source-line">
                Credentials stay in this computer’s ignored .local folder. They
                are never included in Git history or knowledge exports.
              </p>
              {connection.fields.map((f) => (
                <label className="field" key={f}>
                  <span>{f.replaceAll('_', ' ').toLowerCase()}</span>
                  <Input
                    autoComplete="off"
                    type={/TOKEN|KEY/.test(f) ? 'password' : 'text'}
                    value={credentials[f] || ''}
                    onChange={(e) =>
                      setCredentials({ ...credentials, [f]: e.target.value })
                    }
                    placeholder={
                      connection.configured
                        ? 'Leave blank to keep existing value'
                        : ''
                    }
                  />
                </label>
              ))}
              <Button
                disabled={busy}
                onClick={() =>
                  perform(async () => {
                    await api('connect', {
                      id: connection.id,
                      values: credentials,
                    });
                    setCredentials({});
                    setConnection(null);
                    await refresh();
                    setNotice(
                      'Settings saved. Select Sync to verify access and import data.',
                    );
                  })
                }
              >
                Save connection settings
              </Button>
            </>
          ) : (
            <Button
              onClick={() => {
                setConnection(null);
                fileInput.current?.click();
              }}
            >
              Import an export file
              <Upload size={15} />
            </Button>
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={assistant} onOpenChange={setAssistant}>
        <DialogContent className="record-dialog assistant-dialog">
          <DialogHeader>
            <DialogTitle>
              <Sparkles size={19} />
              Think and work with your brain
            </DialogTitle>
            <DialogDescription>
              Uses Codex on this computer and your existing sign-in. Relevant
              knowledge is retrieved for each request.
            </DialogDescription>
          </DialogHeader>
          <Choice
            label="What should the assistant do?"
            value={mode}
            values={['Advise & draft', 'Create local deliverables']}
            onChange={setMode}
          />
          <Textarea
            className="body-editor"
            aria-label="Ask your second brain"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="What happened, or what would you like to get done?"
          />
          <p className="source-line">
            {mode === 'Advise & draft'
              ? 'Reads your knowledge and saves the answer as an AI inference.'
              : 'May create or edit local files in the knowledge repository. External actions remain drafts for your review.'}{' '}
            Uses your Codex allowance.
          </p>
          <Button
            disabled={!prompt.trim() || job?.status === 'running' || busy}
            onClick={() =>
              perform(async () => {
                const j = await api<{ id: string }>('assistant', {
                  prompt,
                  mode:
                    mode === 'Create local deliverables' ? 'work' : 'advice',
                });
                setJob({ ...j, status: 'running' });
              })
            }
          >
            {job?.status === 'running' ? (
              <>
                <LoaderCircle className="spin" size={16} />
                Working with your context…
              </>
            ) : (
              <>
                Run with Codex
                <Send size={15} />
              </>
            )}
          </Button>
          {job?.error && (
            <div className="job-error">
              <strong>Task could not complete</strong>
              <pre>{job.error}</pre>
              <p>
                You can also open the knowledge folder in Codex and run this
                request there.
              </p>
            </div>
          )}
          {job?.answer && (
            <div className="document-body assistant-answer">{job.answer}</div>
          )}
        </DialogContent>
      </Dialog>
    </SidebarProvider>
  );
}
