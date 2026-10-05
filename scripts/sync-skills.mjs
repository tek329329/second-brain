// Mirror the canonical skills in vault/.claude/skills to the three places
// Claude Code and Codex look for them. The mirrors are generated; edit only
// the canonical folder, then run `npm run skills`.
import fs from 'node:fs/promises';
import path from 'node:path';
import { ROOT, VAULT } from '../server/store.mjs';

const source = path.join(VAULT, '.claude', 'skills');
const targets = [
  { dir: path.join(VAULT, '.agents', 'skills'), codex: true },
  { dir: path.join(ROOT, '.claude', 'skills'), codex: false },
  { dir: path.join(ROOT, '.agents', 'skills'), codex: true },
];

async function rewrite(dir, codex) {
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) await rewrite(file, codex);
    else if (codex && entry.name.endsWith('.md')) {
      const text = await fs.readFile(file, 'utf8');
      await fs.writeFile(
        file,
        text.replaceAll('.claude/skills/', '.agents/skills/'),
      );
    }
  }
}

const names = (await fs.readdir(source, { withFileTypes: true }))
  .filter((e) => e.isDirectory())
  .map((e) => e.name);
for (const { dir, codex } of targets) {
  await fs.rm(dir, { recursive: true, force: true });
  await fs.cp(source, dir, { recursive: true });
  await rewrite(dir, codex);
}
console.log(
  `Synced ${names.length} skills (${names.join(', ')}) to ${targets.length} mirrors.`,
);
