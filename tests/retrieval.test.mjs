import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'life-os-retrieval-'));
process.env.BRAIN_VAULT = path.join(temp, 'vault');
process.env.BRAIN_LOCAL = path.join(temp, 'local');
process.env.BRAIN_BACKUPS = path.join(temp, 'backups');
const s = await import('../server/store.mjs');
const { find } = await import('../scripts/find.mjs');
const { select, pack } = await import('../scripts/brief.mjs');
await s.initialize();
const base = {
  area: 'school',
  kind: 'note',
  status: 'confirmed',
  source: 'Test fixture',
  links: [],
};
const rec = (id, extra) => ({
  ...base,
  id,
  title: id,
  body: '',
  created: '2026-09-01T00:00:00.000Z',
  updated: '2026-09-30T00:00:00.000Z',
  due: '',
  archived: false,
  ...extra,
});
const exams = rec('fall-exams', {
  body: [
    '| Course | Exams | Dates |',
    '|---|---|---|',
    '| BIO101 (0301) | Midterm | Fri 2026-10-16. Final 2026-12-11. |',
    '| CHEM110 (0201) | Midterm | 2026-10-22 to 2026-10-25 |',
  ].join('\n'),
  due: '2026-10-16',
});

test('attention lists exam dates within 30 days, once per course and date', () => {
  const { due } = s.attention([exams], '2026-10-01');
  assert.deepEqual(
    due.map((d) => d.date + ' ' + d.title),
    [
      '2026-10-16 BIO101 (exams record)',
      '2026-10-22 CHEM110 (exams record)',
      '2026-10-25 CHEM110 (exams record)',
    ],
  );
});

test('attention keeps recent past due, skips completed, archived, and far dates', () => {
  const { due } = s.attention(
    [
      rec('late', { due: '2026-09-28' }),
      rec('old', { due: '2026-09-01' }),
      rec('done', { due: '2026-10-05', status: 'completed' }),
      rec('gone', { due: '2026-10-05', archived: true }),
      rec('far', { due: '2026-12-01' }),
      rec('soon', { due: '2026-10-05T12:00:00.000Z' }),
    ],
    '2026-10-01',
  );
  assert.deepEqual(
    due.map((d) => d.id),
    ['late', 'soon'],
  );
});

test('attention flags unconfirmed and inference records untouched for 14 days', () => {
  const { stale } = s.attention(
    [
      rec('a', { status: 'unconfirmed', updated: '2026-09-10T00:00:00.000Z' }),
      rec('b', { status: 'inference', updated: '2026-09-17T00:00:00.000Z' }),
      rec('c', { status: 'unconfirmed', updated: '2026-09-20T00:00:00.000Z' }),
      rec('d', { status: 'confirmed', updated: '2026-01-01T00:00:00.000Z' }),
    ],
    '2026-10-01',
  );
  assert.deepEqual(
    stale.map((x) => x.id),
    ['a', 'b'],
  );
});

test('find ranks live records first, then by matched terms and hits', () => {
  const list = [
    rec('archived-acme', { title: 'acme widget meta', archived: true }),
    rec('one-term', { body: 'acme acme acme acme' }),
    rec('two-terms', { body: 'acme and Widget' }),
    rec('miss', { body: 'gardening' }),
  ];
  assert.deepEqual(
    find(list, ['acme', 'widget']).map((m) => m.r.id),
    ['two-terms', 'one-term', 'archived-acme'],
  );
  assert.equal(find(list, ['WIDGET'])[0].line, 'acme and Widget');
});

test('index writes the attention section', async () => {
  const soon = new Date(Date.now() + 3 * 86400000).toLocaleDateString('en-CA');
  await s.save({
    ...base,
    id: 'soon-task',
    title: 'Soon task',
    body: 'x',
    due: soon,
  });
  const index = await fs.readFile(path.join(s.VAULT, 'INDEX.md'), 'utf8');
  assert.match(index, /## Attention \(as of /);
  assert.match(index, new RegExp(soon + ' · \\[Soon task\\]'));
});

test('review_by drives review flags and overrides the unconfirmed fallback', () => {
  const { stale } = s.attention(
    [
      rec('past', { review_by: '2026-09-30' }),
      rec('future', {
        review_by: '2026-10-30',
        status: 'unconfirmed',
        updated: '2026-08-01T00:00:00.000Z',
      }),
      rec('today', { review_by: '2026-10-01' }),
    ],
    '2026-10-01',
  );
  assert.deepEqual(
    stale.map((x) => x.id + ':' + x.why),
    ['past:review', 'today:review'],
  );
});

test('superseded records drop out, and only bare links to them are flagged', () => {
  const all = [
    rec('old-plan', { due: '2026-10-05' }),
    rec('new-plan', {
      kind: 'decision',
      supersedes: ['old-plan'],
      links: ['old-plan'],
    }),
    rec('bare', { links: ['old-plan'] }),
    rec('cites', {
      links: ['old-plan'],
      body: 'Kill rules came from [[old-plan]].',
    }),
  ];
  const a = s.attention(all, '2026-10-01');
  assert.equal(a.due.length, 0);
  assert.deepEqual(a.supersededLinks, [{ from: 'bare', to: 'old-plan' }]);
  assert.deepEqual([...s.superseded(all)], ['old-plan']);
});

test('routerBlock lists live matches and folds archived or superseded ones', () => {
  const block = s.routerBlock('acme-*, globex-llc', [
    rec('acme-store', { title: 'Store', review_by: '2026-10-15' }),
    rec('acme-old', { archived: true }),
    rec('globex-llc', { title: 'LLC' }),
    rec('globex-other'),
  ]);
  assert.match(
    block,
    /\[\[acme-store\]\] Store · note · confirmed · updated 2026-09-30 · review by 2026-10-15/,
  );
  assert.match(block, /\[\[globex-llc\]\] LLC/);
  assert.doesNotMatch(block, /globex-other/);
  assert.match(block, /Archived or superseded: \[\[acme-old\]\]/);
});

test('index rewrites only the generated block of an area page', async () => {
  const dir = path.join(s.VAULT, 'wiki', 'areas');
  await fs.mkdir(dir, { recursive: true });
  const page =
    '---\ntype: area\nrecords: soon-*\n---\n\n# Soon\n\nHand-written.\n\n<!-- generated:records -->\nold\n<!-- /generated:records -->\n\nTail.\n';
  await fs.writeFile(path.join(dir, 'soon.md'), page);
  await s.index();
  const out = await fs.readFile(path.join(dir, 'soon.md'), 'utf8');
  assert.match(out, /Hand-written\./);
  assert.match(out, /\[\[soon-task\]\] Soon task/);
  assert.doesNotMatch(out, /\nold\n/);
  assert.match(out, /Tail\.\n$/);
});

test('saving keeps review_by and supersedes when an editor omits them', async () => {
  const first = await s.save({
    ...base,
    id: 'kept',
    title: 'Kept',
    body: 'x',
    review_by: '2026-11-01',
    supersedes: ['soon-task'],
  });
  const again = await s.save(
    { ...base, id: 'kept', title: 'Kept 2', body: 'y' },
    first.revision,
  );
  assert.equal(again.review_by, '2026-11-01');
  assert.deepEqual(again.supersedes, ['soon-task']);
  await assert.rejects(
    s.save({ ...base, title: 'Bad', body: 'z', review_by: 'soon' }),
    /review date/,
  );
});

test('brief puts state records first and shortens logs', () => {
  const list = select(
    [
      rec('acme-log', { kind: 'log', body: 'L'.repeat(1000) }),
      rec('acme-store', { body: 'state' }),
      rec('other', { body: 'x' }),
    ],
    'acme-*',
  );
  assert.deepEqual(
    list.map((r) => r.id),
    ['acme-store', 'acme-log'],
  );
  const text = pack(list, 1500);
  assert.match(text, /### records\/acme-store\.md · note/);
  assert.match(text, /truncated; open the record/);
});

test('audit lists values restated across state records, ignoring dated ones', async () => {
  const mk = (id, kind, body) =>
    s.save({ ...base, id, title: id, kind, status: 'confirmed', body });
  await mk('price-owner', 'product', 'Solo is $95.');
  await mk('price-copy', 'profile', 'Sold at $95 since September.');
  await mk('price-decision', 'decision', 'Decided on $95 and $77.');
  await mk('price-log', 'log', 'Logged $77.');
  const { restated } = await s.audit();
  const hit = restated.find((x) => x.value === '$95');
  assert.deepEqual(hit.files.sort(), [
    'records/price-copy.md',
    'records/price-owner.md',
  ]);
  assert.ok(!restated.some((x) => x.value === '$77'));
});
