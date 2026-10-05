// Search records by title, frontmatter, and body in one pass.
// Usage: npm run find -- <term> [term...]
// Ranks live records before archived ones, then by how many terms match, then
// by hit count; prints one line per record
// plus the first matching body line, so an agent can pick what to open.
import { fileURLToPath } from 'node:url';
import { records } from '../server/store.mjs';

const count = (text, term) => text.split(term).length - 1;

export function find(list, terms) {
  const t = terms.map((s) => s.toLowerCase()).filter(Boolean);
  return list
    .map((r) => {
      const { body, revision: _revision, ...meta } = r;
      const head = JSON.stringify(meta).toLowerCase();
      const text = (body || '').toLowerCase();
      const matched = t.filter((x) => head.includes(x) || text.includes(x));
      const hits = t.reduce(
        (n, x) => n + count(head, x) * 3 + count(text, x),
        0,
      );
      const line = (body || '')
        .split('\n')
        .find((l) => t.some((x) => l.toLowerCase().includes(x)));
      return { r, matched: matched.length, hits, line: line?.trim() };
    })
    .filter((m) => m.matched)
    .sort(
      (a, b) =>
        !!a.r.archived - !!b.r.archived ||
        b.matched - a.matched ||
        b.hits - a.hits,
    );
}

export function format({ r, line }) {
  const out =
    'records/' +
    r.id +
    '.md · ' +
    r.title +
    ' · ' +
    r.kind +
    ' · ' +
    r.status +
    ' · ' +
    String(r.updated).slice(0, 10) +
    (r.archived ? ' · archived' : '');
  return line ? out + '\n    ' + line.slice(0, 160) : out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const terms = process.argv.slice(2);
  if (!terms.length) {
    console.error('Usage: npm run find -- <term> [term...]');
    process.exit(1);
  }
  const results = find(await records(), terms);
  console.log(results.slice(0, 15).map(format).join('\n') || 'No matches.');
  if (results.length > 15) console.log('… ' + (results.length - 15) + ' more');
}
