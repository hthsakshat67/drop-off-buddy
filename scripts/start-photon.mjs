import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const jar = resolve(root, '.local-photon/photon-1.3.0.jar');
const database = resolve(root, '.local-photon/photon_data');
const javaCandidates = [
  process.env.JAVA_HOME ? resolve(process.env.JAVA_HOME, 'bin/java') : '',
  '/opt/homebrew/opt/openjdk@21/bin/java',
  '/usr/bin/java',
].filter(Boolean);
const java = javaCandidates.find(existsSync);

if (!existsSync(jar) || !existsSync(database)) {
  console.error('Local U.S. Photon files are missing. See README.md → Local U.S. address index.');
  process.exit(1);
}
if (!java) {
  console.error('Java 21 or newer is required to run the local Photon index.');
  process.exit(1);
}

const photon = spawn(java, [
  '-Xms512m', '-Xmx2g', '-jar', jar, 'serve',
  '-listen-ip', '127.0.0.1', '-listen-port', '2322',
  '-cors-origin', 'http://localhost:4178',
], { cwd: resolve(root, '.local-photon'), stdio: 'inherit' });

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => photon.kill(signal));
}
photon.on('error', (error) => {
  console.error(`Could not start Photon: ${error.message}`);
  process.exitCode = 1;
});
photon.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exitCode = code ?? 1;
});
