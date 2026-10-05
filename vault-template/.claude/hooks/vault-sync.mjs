// Claude Code hook that carries out the vault sync rule (AGENTS.md, Constraints). Wired from .claude/settings.json in the
// vault and in the application folder.
//   start  SessionStart: commit pending changes, pull, regenerate after a merge.
//   post   PostToolUse (Edit|Write|MultiEdit): rebuild the index after a record edit.
//   stop   Stop: rebuild the index if records changed, commit, push.
// Never force-pushes, resets, or discards. Failures are reported to Claude so it
// stops and asks the user, as the rule requires.
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const VAULT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
);
const APP = path.resolve(VAULT, '..');
const mode = process.argv[2];

const git = (...args) =>
  execFileSync('git', ['-C', VAULT, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
const node = (script) =>
  execFileSync(process.execPath, [path.join(APP, 'scripts', script)], {
    cwd: APP,
    stdio: 'ignore',
  });
// Untrimmed: porcelain lines start with a status column that may be a space.
const changed = () =>
  execFileSync('git', ['-C', VAULT, 'status', '--porcelain'], {
    encoding: 'utf8',
  })
    .split('\n')
    .filter(Boolean);
const recordsChanged = (lines) =>
  lines.some((l) => l.slice(3).startsWith('records/'));
const errText = (e) =>
  String(e.stderr || e.message)
    .split('\n')
    .filter((l) => l.trim() && !l.startsWith('hint:'))
    .slice(-2)
    .join(' ')
    .trim();

function commitAll(message) {
  if (!changed().length) return false;
  git('add', '-A');
  git('commit', '-q', '-m', message);
  return true;
}

function summary(lines) {
  const files = lines.map((l) => l.slice(3).replace(/^"|"$/g, ''));
  const shown = files.slice(0, 3).join(', ');
  return (
    'Auto-sync: ' +
    shown +
    (files.length > 3 ? ` and ${files.length - 3} more` : '')
  );
}

async function stdin() {
  let s = '';
  for await (const chunk of process.stdin) s += chunk;
  try {
    return JSON.parse(s || '{}');
  } catch {
    return {};
  }
}

function start() {
  const pending = changed();
  if (pending.length)
    commitAll('Auto-sync at session start: ' + summary(pending).slice(11));
  const before = git('rev-parse', 'HEAD');
  try {
    git('pull', '--no-rebase', '--no-edit', '-q');
  } catch (e) {
    const conflicted = git('diff', '--name-only', '--diff-filter=U');
    if (conflicted) {
      // Generated files are regenerated, never hand-merged.
      const generated = ['INDEX.md'];
      const real = conflicted
        .split('\n')
        .filter((f) => !generated.includes(f) && !f.startsWith('.agents/'));
      if (!real.length) {
        git('checkout', '--theirs', '--', ...conflicted.split('\n'));
        node('index.mjs');
        node('sync-skills.mjs');
        git('add', '-A');
        git('commit', '-q', '--no-edit');
        return;
      }
      return context(
        `Vault pull hit merge conflicts in: ${real.join(', ')}. Stop and ask the user before resolving.`,
      );
    }
    return context(
      `Vault pull failed (${errText(e)}). Work from the local copy and tell the user.`,
    );
  }
  if (
    git('rev-parse', 'HEAD') !== before &&
    git('rev-list', '--merges', `${before}..HEAD`)
  ) {
    node('index.mjs');
    node('sync-skills.mjs');
    commitAll('Regenerate index and skill mirrors after merge');
  }
}

function context(text) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'SessionStart',
        additionalContext: text,
      },
    }),
  );
}

async function post() {
  const input = await stdin();
  const file = input.tool_input?.file_path;
  if (!file) return;
  const rel = path.relative(path.join(VAULT, 'records'), path.resolve(file));
  if (!rel.startsWith('..') && !path.isAbsolute(rel)) node('index.mjs');
}

async function stop() {
  const input = await stdin();
  if (input.stop_hook_active) return;
  if (recordsChanged(changed())) node('index.mjs');
  const pending = changed();
  if (pending.length) commitAll(summary(pending));
  let ahead = 0;
  try {
    ahead = Number(git('rev-list', '--count', '@{u}..HEAD'));
  } catch {
    return; // no upstream configured
  }
  if (!ahead) return;
  try {
    git('push', '-q');
  } catch (e) {
    process.stderr.write(
      `Vault push was rejected (${errText(e)}). The commits are saved locally. Do not force-push; tell the user and ask how to proceed.`,
    );
    process.exit(2);
  }
}

try {
  if (mode === 'start') start();
  else if (mode === 'post') await post();
  else if (mode === 'stop') await stop();
} catch (e) {
  process.stderr.write('vault-sync ' + mode + ': ' + errText(e));
  process.exit(mode === 'stop' ? 2 : 1);
}
