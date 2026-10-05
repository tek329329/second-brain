// One-pass context pack for an area: the live records an area page routes to
// (its `records:` selector), or every live record with that `area` field.
// Usage: npm run brief -- <area page, e.g. health|school|...> [chars per record]
// State records print first and in full up to the limit; logs print last and short.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { VAULT, records, superseded } from '../server/store.mjs';

const LOGS = new Set(['log', 'interview']);

export function select(all, selector, area) {
  const pats = (selector || '')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  const hit = (r) =>
    pats.length
      ? pats.some((p) =>
          p.endsWith('*') ? r.id.startsWith(p.slice(0, -1)) : r.id === p,
        )
      : r.area === area;
  const gone = superseded(all);
  return all
    .filter((r) => hit(r) && !r.archived && !gone.has(r.id))
    .sort(
      (a, b) =>
        LOGS.has(a.kind) - LOGS.has(b.kind) ||
        b.updated.localeCompare(a.updated),
    );
}

export function pack(list, limit = 1500) {
  return list
    .map((r) => {
      const max = LOGS.has(r.kind) ? Math.min(limit, 400) : limit;
      const body = r.body.replace(/\n{3,}/g, '\n\n').trim();
      return (
        '### records/' +
        r.id +
        '.md · ' +
        r.kind +
        ' · ' +
        r.status +
        ' · updated ' +
        r.updated.slice(0, 10) +
        (r.review_by ? ' · review by ' + r.review_by : '') +
        '\n' +
        r.title +
        '\n\n' +
        (body.length > max
          ? body.slice(0, max).replace(/\s+\S*$/, '') +
            ' … [truncated; open the record]'
          : body)
      );
    })
    .join('\n\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [name, chars] = process.argv.slice(2);
  if (!name) {
    console.error('Usage: npm run brief -- <area page or area> [chars]');
    process.exit(1);
  }
  let selector = '';
  try {
    const page = await fs.readFile(
      path.join(VAULT, 'wiki', 'areas', name + '.md'),
      'utf8',
    );
    selector = (page.match(/^records:\s*(.+?)\s*$/m) || [])[1] || '';
  } catch {}
  const list = select(await records(), selector, name);
  if (!list.length) {
    console.error('No live records for "' + name + '".');
    process.exit(1);
  }
  console.log(pack(list, Number(chars) || undefined));
}
