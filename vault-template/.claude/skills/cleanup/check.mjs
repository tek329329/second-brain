// Read-only hygiene report for the Life OS vault. Run from the vault root:
//   node .claude/skills/cleanup/check.mjs [YYYY-MM-DD]
// The optional date is "today" for past-due checks (defaults to the local date).
import fs from 'node:fs';
import path from 'node:path';

const today = process.argv[2] || new Date().toLocaleDateString('en-CA');
const FIELDS = ['id', 'title', 'area', 'kind', 'status', 'created', 'updated', 'source', 'links', 'due', 'archived'];
const AREAS = ['personal', 'business', 'work', 'school', 'relationships', 'health', 'finance', 'knowledge', 'projects'];
const STATUSES = ['confirmed', 'unconfirmed', 'inference', 'completed'];
const out = {};
const add = (k, v) => (out[k] ||= []).push(v);

const walk = (d, ext) =>
  fs.existsSync(d)
    ? fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => {
        const p = d + '/' + e.name;
        return e.isDirectory() ? walk(p, ext) : p.endsWith(ext) ? [p] : [];
      })
    : [];

// Records
const records = [];
for (const f of fs.readdirSync('records').filter((f) => f.endsWith('.md'))) {
  const t = fs.readFileSync('records/' + f, 'utf8');
  const m = t.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  let j;
  try {
    j = JSON.parse(m[1]);
  } catch {
    add('invalid frontmatter', f);
    continue;
  }
  j.file = f;
  j.body = t.slice(m[0].length);
  records.push(j);
  const missing = FIELDS.filter((k) => !(k in j));
  if (missing.length) add('missing fields', `${f}: ${missing.join(', ')}`);
  if (j.id + '.md' !== f) add('id does not match filename', f);
  if (!AREAS.includes(j.area)) add('invalid area', `${f}: ${j.area}`);
  if (!STATUSES.includes(j.status)) add('invalid status', `${f}: ${j.status}`);
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-/.test(j.id)) add('UUID id (prefer a slug)', f);
}
const ids = new Set(records.map((r) => r.id));
const inbound = new Set();
for (const r of records)
  for (const l of r.links || []) {
    if (!ids.has(l)) add('broken record link', `${r.id} -> ${l}`);
    inbound.add(l);
  }
for (const r of records) {
  if (r.archived) continue;
  if (['task', 'plan', 'goal', 'experiment'].includes(r.kind) && r.due && r.due.slice(0, 10) < today && r.status !== 'completed') add('past-due record, not completed', `${r.id} due ${r.due.slice(0, 10)}`);
}

// Record format, per the capture skill.
const STATE_KINDS = ['profile', 'product', 'routine', 'plan', 'constraint', 'goal', 'note', 'project'];
const SECTIONS = {
  ...Object.fromEntries(STATE_KINDS.map((k) => [k, ['Current', 'Open']])),
  decision: ['Decision', 'Why'],
  log: ['What happened', 'Open'],
  interview: ['Answers'],
  experiment: ['Setup'],
};
for (const r of records) {
  if (r.archived) continue;
  const problems = (SECTIONS[r.kind] || [])
    .filter((h) => !new RegExp(`^## ${h}\\s*$`, 'm').test(r.body))
    .map((h) => `no "## ${h}"`);
  if (STATE_KINDS.includes(r.kind) && !r.review_by) problems.push('no review_by');
  if (!String(r.source || '').trim()) problems.push('no source');
  if (!problems.length) continue;
  add('record format (see capture skill)', `${r.id}: ${problems.join(', ')}`);
}

// Wiki
const wiki = walk('wiki', '.md');
const text = Object.fromEntries(wiki.map((p) => [p, fs.readFileSync(p, 'utf8')]));
const wikiIds = new Set();
const wikiInbound = new Set();
for (const [p, t] of Object.entries(text)) {
  for (const m of t.matchAll(/\[\[([^\]]+)\]\]/g)) {
    wikiIds.add(m[1]);
    if (!ids.has(m[1])) add('wiki: broken [[id]]', `${p}: ${m[1]}`);
  }
  const src = t.match(/^sources: \[([^\]]*)\]/m);
  if (src && !p.endsWith('conventions.md'))
    for (const s of src[1].split(',').map((s) => s.trim()).filter(Boolean)) {
      wikiIds.add(s);
      if (!ids.has(s) && !fs.existsSync(s)) add('wiki: broken source', `${p}: ${s}`);
    }
  for (const m of t.matchAll(/\]\(([^)#\s]+)\)/g)) {
    if (/^[a-z]+:/i.test(m[1])) continue;
    const r = path.posix.normalize(path.posix.join(path.posix.dirname(p), m[1]));
    if (!fs.existsSync(r)) add('wiki: broken relative link', `${p}: ${m[1]}`);
    else wikiInbound.add(r);
  }
  // Sources and the log are point-in-time; only synthesis pages should track their records.
  const upd = /\/(sources\/|log\.md|conventions\.md)/.test(p) ? null : t.match(/^updated: (\S+)/m)?.[1];
  const newer = [...t.matchAll(/\[\[([^\]]+)\]\]/g)]
    .map((m) => records.find((r) => r.id === m[1]))
    .filter((r) => r && upd && r.updated.slice(0, 10) > upd);
  if (newer.length) add('wiki: page older than a record it cites (check for stale claims)', `${p} (updated ${upd}): ${[...new Set(newer.map((r) => r.id))].join(', ')}`);
}
for (const p of wiki) if (!p.endsWith('/index.md') && !wikiInbound.has(p)) add('wiki: orphan page', p);

// Personal-context records with no connection at all
const manual = fs.readFileSync('AGENTS.md', 'utf8');
for (const r of records)
  if (!r.archived && !(r.links || []).length && !inbound.has(r.id) && !wikiIds.has(r.id) && !manual.includes(r.id))
    add('record with no links, no wiki page, no route', r.id);

// Deliverables and references nothing points to
const corpus = [manual, fs.readFileSync('connections.md', 'utf8'), ...Object.values(text), ...records.map((r) => fs.readFileSync('records/' + r.file, 'utf8'))].join('\n');
for (const d of ['deliverables', 'references'])
  for (const e of fs.readdirSync(d)) if (!e.startsWith('.') && !corpus.includes(`${d}/${e}`) && !corpus.includes(e)) add(`${d}: nothing links here`, `${d}/${e}`);

// Manual parity, top-level folders, skills list
if (fs.existsSync('CLAUDE.md') && fs.readFileSync('CLAUDE.md', 'utf8').replace(/\r\n/g, '\n') !== manual.replace(/\r\n/g, '\n'))
  add('manuals', 'AGENTS.md and CLAUDE.md differ');
for (const e of fs.readdirSync('.', { withFileTypes: true }))
  if (e.isDirectory() && !e.name.startsWith('.') && !manual.includes('`' + e.name + '/')) add('manuals: top-level folder with no route', e.name + '/');
// The skill catalog lives in references/operations.md.
const catalog = fs.readFileSync('references/operations.md', 'utf8');
for (const s of fs.readdirSync('.claude/skills')) if (!catalog.includes('`' + s + '`')) add('manuals: skill not listed', s);
if (fs.existsSync('.agents/skills'))
  for (const s of fs.readdirSync('.claude/skills')) if (!fs.existsSync('.agents/skills/' + s)) add('skills: missing Codex mirror (run npm run skills)', s);

console.log(`Vault cleanup check, ${today}. ${records.length} records, ${wiki.length} wiki pages.`);
if (!Object.keys(out).length) console.log('No findings.');
for (const [k, v] of Object.entries(out)) console.log(`\n## ${k} (${v.length})\n` + v.map((x) => '- ' + x).join('\n'));
