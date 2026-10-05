import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID, createHash } from 'node:crypto';
export const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
export const VAULT = path.resolve(
  process.env.BRAIN_VAULT || path.join(ROOT, 'vault'),
);
export const LOCAL = path.resolve(
  process.env.BRAIN_LOCAL || path.join(ROOT, '.local'),
);
const exec = promisify(execFile);
export const areas = [
  'personal',
  'business',
  'work',
  'school',
  'relationships',
  'health',
  'finance',
  'knowledge',
  'projects',
];
export const kinds = [
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
let queue = Promise.resolve();
export function serialize(fn) {
  const next = queue.then(fn, fn);
  queue = next.catch(() => {});
  return next;
}
export async function git(args, cwd = VAULT) {
  return (
    await exec('git', args, {
      cwd,
      windowsHide: true,
      maxBuffer: 8 * 1024 * 1024,
    })
  ).stdout.trim();
}
const hash = (s) => createHash('sha256').update(s).digest('hex');
export function encode(record) {
  const { body, revision: _revision, ...meta } = record;
  return (
    '---\n' + JSON.stringify(meta, null, 2) + '\n---\n\n' + (body || '') + '\n'
  );
}
export function decode(text, filename) {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!match) throw new Error('Missing JSON frontmatter: ' + filename);
  const record = JSON.parse(match[1]);
  if (record.id !== path.basename(filename, '.md'))
    throw new Error('Record ID does not match filename');
  return {
    ...record,
    body: text.slice(match[0].length).trim(),
    revision: hash(text),
  };
}
function filename(id) {
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id)) throw new Error('Invalid record ID');
  return path.join(VAULT, 'records', id + '.md');
}
export async function records() {
  const files = await fs.readdir(path.join(VAULT, 'records'));
  return (
    await Promise.all(
      files
        .filter((f) => f.endsWith('.md'))
        .map(async (f) =>
          decode(await fs.readFile(path.join(VAULT, 'records', f), 'utf8'), f),
        ),
    )
  ).sort((a, b) => b.updated.localeCompare(a.updated));
}
export async function read(id) {
  const f = filename(id);
  return decode(await fs.readFile(f, 'utf8'), f);
}
async function atomic(file, data) {
  const tmp = file + '.' + randomUUID() + '.tmp';
  await fs.writeFile(tmp, data, { mode: 0o600 });
  await fs.rename(tmp, file);
}
export async function commit(message, files = ['records', 'INDEX.md']) {
  await git(['add', '--', ...files]);
  if (await git(['diff', '--cached', '--name-only']))
    await git([
      '-c',
      'user.name=Life OS',
      '-c',
      'user.email=life-os@localhost',
      'commit',
      '-m',
      message,
    ]);
  return git(['rev-parse', 'HEAD']);
}
const clean = (s) => s.replace(/[[\]\r\n]/g, ' ');
const line = (r) =>
  '- [' +
  clean(r.title) +
  '](records/' +
  r.id +
  '.md) · ' +
  r.kind +
  ' · updated ' +
  r.updated +
  ' · ' +
  r.status;
const addDays = (day, n) =>
  new Date(Date.parse(day) + n * 86400000).toISOString().slice(0, 10);
// IDs replaced by a live record's `supersedes`; these count as archived.
export function superseded(all) {
  return new Set(
    all.filter((r) => !r.archived).flatMap((r) => r.supersedes || []),
  );
}
// What needs a look: dates in the next 30 days (record `due` fields, past week
// included, and dates in the table rows of `*-exams` records); records past
// their `review_by` date (or, without one, unconfirmed or inference records
// untouched for 14 days); and live records still linking to a superseded one.
export function attention(all, today = new Date().toLocaleDateString('en-CA')) {
  const gone = superseded(all);
  const live = all.filter((r) => !r.archived && !gone.has(r.id));
  const horizon = addDays(today, 30);
  const due = [];
  for (const r of live) {
    if (r.id.endsWith('-exams')) {
      for (const row of r.body.split('\n')) {
        const cells = row.split('|').map((c) => c.trim());
        if (cells.length < 3 || !/^[A-Z]+\d+/.test(cells[1])) continue;
        const course = cells[1].split(' ')[0];
        for (const d of new Set(row.match(/\d{4}-\d{2}-\d{2}/g)))
          if (d >= today && d <= horizon)
            due.push({ date: d, id: r.id, title: course + ' (exams record)' });
      }
    } else if (r.due && r.status !== 'completed') {
      const d = r.due.slice(0, 10);
      if (d >= addDays(today, -7) && d <= horizon)
        due.push({ date: d, id: r.id, title: r.title });
    }
  }
  const stale = [];
  for (const r of live) {
    if (r.review_by) {
      if (r.review_by <= today)
        stale.push({
          date: r.review_by,
          id: r.id,
          title: r.title,
          why: 'review',
        });
    } else if (
      ['unconfirmed', 'inference'].includes(r.status) &&
      r.updated.slice(0, 10) <= addDays(today, -14)
    )
      stale.push({
        date: r.updated.slice(0, 10),
        id: r.id,
        title: r.title,
        why: r.status,
      });
  }
  const supersededLinks = live.flatMap((r) =>
    r.links
      // A [[link]] in the body is a deliberate citation of history; only bare
      // relationship links to a superseded record are flagged.
      .filter(
        (l) =>
          gone.has(l) &&
          !(r.supersedes || []).includes(l) &&
          !r.body.includes('[[' + l + ']]'),
      )
      .map((l) => ({ from: r.id, to: l })),
  );
  due.sort((a, b) => a.date.localeCompare(b.date));
  stale.sort((a, b) => a.date.localeCompare(b.date));
  return { today, due, stale, supersededLinks };
}
function attentionSection({ today, due, stale, supersededLinks }) {
  const item = (x) =>
    '- ' +
    x.date +
    ' · [' +
    clean(x.title) +
    '](records/' +
    x.id +
    '.md)' +
    (x.why ? ' · ' + x.why : '');
  if (!due.length && !stale.length && !supersededLinks.length) return '';
  return (
    '## Attention (as of ' +
    today +
    ')\n\n' +
    (due.length
      ? 'Dates in the next 30 days:\n\n' + due.map(item).join('\n') + '\n\n'
      : '') +
    (stale.length
      ? 'Due for review (past `review_by`, or unconfirmed 14+ days):\n\n' +
        stale.map(item).join('\n') +
        '\n\n'
      : '') +
    (supersededLinks.length
      ? 'Links to superseded records (point them at the replacement):\n\n' +
        supersededLinks.map((x) => '- ' + x.from + ' → ' + x.to).join('\n') +
        '\n\n'
      : '')
  );
}
// Area pages in wiki/areas declare `records: acme-*, globex-llc` in their
// frontmatter; index() rewrites the block between these markers with the live
// matching records, so the lists cannot go stale.
const START = '<!-- generated:records -->';
const END = '<!-- /generated:records -->';
export function routerBlock(selector, all) {
  const pats = selector
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  const hit = (id) =>
    pats.some((p) =>
      p.endsWith('*') ? id.startsWith(p.slice(0, -1)) : id === p,
    );
  const gone = superseded(all);
  const mine = all.filter((r) => hit(r.id));
  const live = mine.filter((r) => !r.archived && !gone.has(r.id));
  const old = mine.filter((r) => r.archived || gone.has(r.id));
  return (
    START +
    '\n<!-- Generated by `npm run index` from `records:` in the frontmatter. Do not edit by hand. -->\n\n' +
    live
      .map(
        (r) =>
          '- [[' +
          r.id +
          ']] ' +
          clean(r.title) +
          ' · ' +
          r.kind +
          ' · ' +
          r.status +
          ' · updated ' +
          r.updated.slice(0, 10) +
          (r.review_by ? ' · review by ' + r.review_by : ''),
      )
      .join('\n') +
    (old.length
      ? '\n\nArchived or superseded: ' +
        old.map((r) => '[[' + r.id + ']]').join(', ')
      : '') +
    '\n' +
    END
  );
}
async function routers(all) {
  const dir = path.join(VAULT, 'wiki', 'areas');
  let files = [];
  try {
    files = (await fs.readdir(dir)).filter((f) => f.endsWith('.md'));
  } catch {
    return;
  }
  for (const f of files) {
    const file = path.join(dir, f);
    const text = await fs.readFile(file, 'utf8');
    const sel = text.match(
      /^---\r?\n[\s\S]*?^records:\s*(.+?)\s*$[\s\S]*?^---/m,
    );
    const a = text.indexOf(START),
      b = text.indexOf(END);
    if (!sel || a < 0 || b < a) continue;
    const next =
      text.slice(0, a) + routerBlock(sel[1], all) + text.slice(b + END.length);
    if (next !== text) await atomic(file, next);
  }
}
export async function index() {
  const all = await records();
  const gone = superseded(all);
  await atomic(
    path.join(VAULT, 'INDEX.md'),
    '# Knowledge index\n\nSearch titles here, then read only relevant records.\n\n' +
      attentionSection(attention(all)) +
      areas
        .map(
          (area) =>
            '## ' +
            area +
            '\n\n' +
            all
              .filter((r) => r.area === area && !r.archived && !gone.has(r.id))
              .map(line)
              .join('\n'),
        )
        .join('\n\n') +
      '\n',
  );
  await routers(all);
}
function validate(input) {
  if (
    !input ||
    typeof input.title !== 'string' ||
    !input.title.trim() ||
    input.title.length > 200
  )
    throw new Error('A title of 1–200 characters is required');
  if (!areas.includes(input.area) || !kinds.includes(input.kind))
    throw new Error('Choose a valid life area and record type');
  if (typeof input.body !== 'string' || input.body.length > 500000)
    throw new Error('Record body must be text under 500,000 characters');
  if (input.due && !/^\d{4}-\d{2}-\d{2}(T.*)?$/.test(input.due))
    throw new Error('Invalid date');
  if (input.review_by && !/^\d{4}-\d{2}-\d{2}$/.test(input.review_by))
    throw new Error('Invalid review date');
  if (
    !['confirmed', 'unconfirmed', 'inference', 'completed'].includes(
      input.status || 'unconfirmed',
    )
  )
    throw new Error('Invalid status');
  if (
    input.links &&
    (!Array.isArray(input.links) ||
      input.links.some(
        (x) => typeof x !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(x),
      ))
  )
    throw new Error('Invalid relationship IDs');
  if (
    input.supersedes &&
    (!Array.isArray(input.supersedes) ||
      input.supersedes.some(
        (x) => typeof x !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(x),
      ))
  )
    throw new Error('Invalid superseded IDs');
}
async function saveInner(input, expected) {
  validate(input);
  let old;
  if (input.id) {
    try {
      old = await read(input.id);
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
    }
  }
  if (old && expected !== old.revision) {
    const e = new Error(
      'This record changed elsewhere. Reload it before saving.',
    );
    e.status = 409;
    throw e;
  }
  const now = new Date().toISOString();
  const record = {
    id: old?.id || input.id || randomUUID(),
    title: input.title.trim(),
    area: input.area,
    kind: input.kind,
    status: input.status || 'unconfirmed',
    created: old?.created || now,
    updated: now,
    source: String(input.source || 'User entry').slice(0, 1000),
    links: [...new Set(input.links || [])],
    due: input.due || '',
    archived: Boolean(input.archived),
    body: input.body,
  };
  // Optional fields: written only when set, kept when an editor omits them.
  const reviewBy = input.review_by ?? old?.review_by;
  const supersedes = input.supersedes ?? old?.supersedes;
  if (reviewBy) record.review_by = reviewBy;
  if (supersedes?.length) record.supersedes = [...new Set(supersedes)];
  await atomic(filename(record.id), encode(record));
  await index();
  await commit((old ? 'Update: ' : 'Capture: ') + record.title);
  return read(record.id);
}
export function save(input, expected) {
  return serialize(() => saveInner(input, expected));
}
export async function history(id) {
  const args = ['log', '-40', '--format=%H%x09%aI%x09%s'];
  if (id) args.push('--', 'records/' + path.basename(filename(id)));
  return (await git(args))
    .split('\n')
    .filter(Boolean)
    .map((x) => {
      const [sha, date, ...title] = x.split('\t');
      return { sha, date, title: title.join('\t') };
    });
}
export async function version(id, sha) {
  if (!/^[a-f0-9]{40}$/.test(sha)) throw new Error('Invalid version');
  return decode(
    await git(['show', sha + ':records/' + path.basename(filename(id))]),
    filename(id),
  );
}
export function restore(id, sha, expected) {
  return serialize(async () => {
    const prior = await version(id, sha);
    return saveInner(
      { ...prior, source: 'Restored from ' + sha + '; ' + prior.source },
      expected,
    );
  });
}
// Prices and doses written in two or more state records or wiki pages. Each is
// a current fact that should live in one state record and be linked from the
// rest, so a changed value cannot leave stale copies behind. Dated kinds
// (decisions, logs, audits, interviews...) record values as of their date and
// are excluded, as are source summaries and the wiki log.
const VALUE = /\$\d[\d,]*(?:\.\d+)?|\b\d+(?:\.\d+)? ?mg\b/g;
export const DATED = new Set([
  'decision',
  'log',
  'interview',
  'audit',
  'event',
  'meeting',
  'experiment',
  'source',
]);
async function restated(live) {
  const texts = live
    .filter((r) => !DATED.has(r.kind))
    .map((r) => ['records/' + r.id + '.md', r.body]);
  for (const sub of ['areas', 'entities', 'concepts', 'analyses']) {
    const dir = path.join(VAULT, 'wiki', sub);
    let files = [];
    try {
      files = await fs.readdir(dir);
    } catch {}
    for (const f of files.filter((f) => f.endsWith('.md')))
      texts.push([
        'wiki/' + sub + '/' + f,
        await fs.readFile(path.join(dir, f), 'utf8'),
      ]);
  }
  for (const f of ['overview.md'])
    try {
      texts.push([
        'wiki/' + f,
        await fs.readFile(path.join(VAULT, 'wiki', f), 'utf8'),
      ]);
    } catch {}
  const where = new Map();
  for (const [file, text] of texts)
    for (const v of new Set(
      (text.match(VALUE) || []).map((v) => v.replace(/\s/g, '')),
    ))
      where.set(v, [...(where.get(v) || []), file]);
  return [...where]
    .filter(([, files]) => files.length >= 2)
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 20)
    .map(([value, files]) => ({ value, files }));
}
export async function audit() {
  const all = (await records()).filter(
      (r) => !r.archived && r.kind !== 'audit',
    ),
    known = new Set(all.map((r) => r.id));
  const stale = all.filter(
      (r) => Date.now() - Date.parse(r.updated) > 30 * 86400000,
    ),
    missing = areas.filter(
      (a) => !all.some((r) => r.area === a && r.status === 'confirmed'),
    );
  return {
    total: all.length,
    confirmed: all.filter((r) => r.status === 'confirmed').length,
    stale: stale.map((r) => ({ id: r.id, title: r.title })),
    missing,
    broken: all.flatMap((r) =>
      r.links
        .filter((id) => !known.has(id))
        .map((id) => ({ from: r.id, to: id })),
    ),
    overdue: all
      .filter(
        (r) =>
          r.kind === 'task' &&
          r.status !== 'completed' &&
          r.due &&
          r.due.slice(0, 10) < new Date().toISOString().slice(0, 10),
      )
      .map((r) => ({ id: r.id, title: r.title })),
    review: attention(all).stale,
    supersededLinks: attention(all).supersededLinks,
    restated: await restated(all),
    contextScore: Math.round(
      ((areas.length - missing.length) / areas.length) * 100,
    ),
  };
}
export async function initialize() {
  await fs.mkdir(path.join(VAULT, 'records'), { recursive: true });
  await fs.mkdir(LOCAL, { recursive: true });
  let fresh = false;
  try {
    await fs.access(path.join(VAULT, '.git'));
  } catch {
    await git(['init', '-b', 'main']);
    fresh = true;
  }
  // New installations start from the empty vault skeleton: manuals, skills,
  // wiki layout, and folders. Existing files are never overwritten.
  if (fresh)
    await fs.cp(path.join(ROOT, 'vault-template'), VAULT, {
      recursive: true,
      force: false,
    });
  if (!(await records()).length)
    await save({
      id: 'system-purpose',
      title: 'What I want from my second brain',
      area: 'personal',
      kind: 'goal',
      status: 'confirmed',
      source: 'Life OS starter record',
      links: [],
      review_by: addDays(new Date().toISOString().slice(0, 10), 30),
      body: '## Current\n- A knowledge base covering my life, businesses, work, and school that helps me evaluate options, plan, and do work.\n- Automatic relevant retrieval, proper version control, portability between computers, and local operation with private backup.\n\n## Open\n- Name, business details, school, accounts, and personal priorities have not been provided yet. Run the onboard skill.',
    });
  await index();
  // Only the run that created the repository bootstraps a commit. Committing
  // on every start would sweep whatever the user left uncommitted into a
  // commit labelled as the initial import.
  if (fresh) await commit('Initialize portable knowledge base', ['.']);
}
export async function backup() {
  return serialize(async () => {
    await index();
    await commit('Checkpoint knowledge base');
    const name =
      'knowledge-' + new Date().toISOString().replaceAll(':', '-') + '.bundle';
    const folder = process.env.BRAIN_BACKUPS || path.join(ROOT, 'backups');
    await fs.mkdir(folder, { recursive: true });
    const target = path.join(folder, name);
    await git(['bundle', 'create', target, '--all']);
    await git(['bundle', 'verify', target]);
    return { name, bytes: (await fs.stat(target)).size };
  });
}
