import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'life-os-test-'));
process.env.BRAIN_VAULT = path.join(temp, 'vault');
process.env.BRAIN_LOCAL = path.join(temp, 'local');
process.env.BRAIN_BACKUPS = path.join(temp, 'backups');
const s = await import('../server/store.mjs');
await s.initialize();
const record = {
  title: 'Exam planning',
  body: 'Exam Thursday. Reserve Wednesday evening.',
  area: 'school',
  kind: 'task',
  status: 'confirmed',
  source: 'Test fixture',
  due: '2026-09-10',
  links: ['system-purpose'],
};
test('capture preserves provenance and creates a readable Markdown record', async () => {
  const r = await s.save({ ...record, id: 'exam' });
  assert.equal((await s.read(r.id)).body, record.body);
  assert.equal(r.source, 'Test fixture');
  assert.match(
    await fs.readFile(path.join(s.VAULT, 'INDEX.md'), 'utf8'),
    /Exam planning/,
  );
  assert.equal((await s.history(r.id)).length, 1);
});
test('stale writes are rejected, without replacing a newer edit', async () => {
  const a = await s.read('exam');
  const b = await s.save({ ...a, body: 'New deadline: Friday' }, a.revision);
  await assert.rejects(
    s.save({ ...a, body: 'An older browser tab' }, a.revision),
    { status: 409 },
  );
  assert.equal((await s.read('exam')).body, b.body);
});
test('concurrent writes yield one success and one conflict', async () => {
  const a = await s.read('exam');
  const results = await Promise.allSettled([
    s.save({ ...a, body: 'Writer A' }, a.revision),
    s.save({ ...a, body: 'Writer B' }, a.revision),
  ]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(results.filter((r) => r.status === 'rejected').length, 1);
});
test('restore is additive and keeps the later revision recoverable', async () => {
  const prior = await s.history('exam'),
    current = await s.read('exam');
  const restored = await s.restore('exam', prior.at(-1).sha, current.revision);
  assert.equal(restored.body, record.body);
  assert.equal((await s.history('exam')).length, prior.length + 1);
  assert.equal((await s.version('exam', prior[0].sha)).body, current.body);
});
test('rejects traversal IDs and invalid metadata', async () => {
  await assert.rejects(s.read('../AGENTS'));
  await assert.rejects(s.save({ ...record, id: '../escape' }));
  await assert.rejects(s.save({ ...record, area: 'unknown' }));
  await assert.rejects(s.save({ ...record, title: '' }));
});
test('direct file edits are detected by optimistic revisions', async () => {
  const r = await s.read('exam');
  await fs.appendFile(
    path.join(s.VAULT, 'records/exam.md'),
    '\nEdited from Codex.\n',
  );
  await assert.rejects(s.save({ ...r, body: 'Stale' }, r.revision), {
    status: 409,
  });
});
test('audit reports broken relationships and genuinely missing areas', async () => {
  await s.save({ ...record, id: 'bad-link', links: ['missing-record'] });
  const a = await s.audit();
  assert.ok(a.broken.some((r) => r.to === 'missing-record'));
  assert.ok(a.missing.includes('health'));
  assert.ok(!a.missing.includes('school'));
});
test('portable bundle restores the complete knowledge and history', async () => {
  const b = await s.backup(),
    clone = path.join(temp, 'restored');
  assert.ok(b.bytes > 0);
  await s.git(['clone', path.join(temp, 'backups', b.name), clone], temp);
  assert.equal(
    await s.git(['rev-parse', 'HEAD'], clone),
    await s.git(['rev-parse', 'HEAD']),
  );
  assert.equal(
    await fs.readFile(path.join(clone, 'records/exam.md'), 'utf8'),
    await fs.readFile(path.join(s.VAULT, 'records/exam.md'), 'utf8'),
  );
});
test('API rejects cross-origin and missing-token mutations', async () => {
  const { apiMiddleware } = await import('../server/api.mjs');
  const http = await import('node:http');
  const server = http.createServer((req, res) =>
    apiMiddleware(req, res, () => {
      res.statusCode = 404;
      res.end();
    }),
  );
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = 'http://127.0.0.1:' + server.address().port;
  try {
    const foreign = await fetch(url + '/api/state', {
      headers: { Origin: 'https://evil.example' },
    });
    assert.equal(foreign.status, 403);
    const missing = await fetch(url + '/api/record', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ record }),
    });
    assert.equal(missing.status, 403);
    const token = (await (await fetch(url + '/api/session')).json()).csrf;
    const saved = await fetch(url + '/api/record', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Brain-Token': token },
      body: JSON.stringify({ record: { ...record, id: 'api-test' } }),
    });
    assert.equal(saved.status, 200);
    assert.equal((await saved.json()).id, 'api-test');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
test.after(async () => {
  await fs.rm(temp, { recursive: true, force: true });
});
