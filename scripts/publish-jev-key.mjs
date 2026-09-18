import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

// Keep the secret out of command arguments, terminal output, and shell history.
const local = new URL('../.dev.vars', import.meta.url);
const line = readFileSync(local, 'utf8').split('\n').find((line) => line.startsWith('TYPESAFE_API_KEY='));
if (!line) throw new Error('Run npm run key first to save the key locally.');
const key = JSON.parse(line.slice('TYPESAFE_API_KEY='.length));
if (typeof key !== 'string' || !key.trim() || /\s/.test(key)) throw new Error('Invalid local key format.');
const result = spawnSync('npx', ['wrangler', 'secret', 'put', 'TYPESAFE_API_KEY'], {
  cwd: new URL('..', import.meta.url),
  input: key + '\n',
  stdio: ['pipe', 'inherit', 'inherit'],
});
process.exit(result.status ?? 1);
