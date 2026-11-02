import { spawn } from 'node:child_process';

const children = [
  spawn(process.execPath, ['server/auth-server.mjs'], { stdio: 'inherit', env: process.env }),
  spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '4178', '--strictPort'], { stdio: 'inherit', env: process.env }),
];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) if (!child.killed) child.kill('SIGTERM');
  process.exitCode = code;
}
for (const child of children) child.on('exit', (code) => { if (!stopping) stop(code || 0); });
process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));
