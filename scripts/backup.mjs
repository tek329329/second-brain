import fs from 'node:fs/promises';
import path from 'node:path';
import { initialize, backup, git, ROOT } from '../server/store.mjs';
await initialize();
const knowledge = await backup();
console.log('Verified knowledge backup: backups/' + knowledge.name);
try {
  await git(['rev-parse', 'HEAD'], ROOT);
} catch {
  console.log(
    'Application has no commits yet. Commit the application before making a full portable backup.',
  );
  process.exit(1);
}
if (await git(['status', '--porcelain'], ROOT))
  throw new Error(
    'Application has uncommitted changes. Commit these before backing up.',
  );
const name =
  'application-' + new Date().toISOString().replaceAll(':', '-') + '.bundle';
const out = path.join(ROOT, 'backups', name);
await fs.mkdir(path.dirname(out), { recursive: true });
await git(['bundle', 'create', out, '--all'], ROOT);
await git(['bundle', 'verify', out], ROOT);
console.log('Verified application backup: backups/' + name);
