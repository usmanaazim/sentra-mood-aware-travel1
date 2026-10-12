/**
 * Zero-dependency dev launcher: starts the Express API and the Vite dev server
 * together with prefixed output. Ctrl+C stops both.
 *   node scripts/dev.mjs      (or: npm run dev)
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const children = [];

function run(name, cwd, args, color) {
  const child = spawn(npm, args, { cwd, shell: process.platform === 'win32', env: process.env });
  const tag = `\x1b[${color}m[${name}]\x1b[0m `;
  const pipe = (stream) => stream.on('data', (d) => process.stdout.write(d.toString().split('\n').filter(Boolean).map((l) => tag + l).join('\n') + '\n'));
  pipe(child.stdout); pipe(child.stderr);
  child.on('exit', (code) => { console.log(`${tag}exited with code ${code}`); shutdown(); });
  children.push(child);
  return child;
}

let closing = false;
function shutdown() {
  if (closing) return;
  closing = true;
  for (const c of children) { try { c.kill('SIGTERM'); } catch {} }
  setTimeout(() => process.exit(0), 300);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

run('server', path.join(root, 'server'), ['run', 'dev'], '36');
run('client', path.join(root, 'client'), ['run', 'dev'], '35');
