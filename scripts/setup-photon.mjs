import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const folder = resolve(root, '.local-photon');
const archive = resolve(folder, 'photon-db-usa-1.0-latest.tar.bz2');
const checksum = resolve(folder, 'photon-db-usa-1.0-latest.tar.bz2.md5');
const jar = resolve(folder, 'photon-1.3.0.jar');
const database = resolve(folder, 'photon_data');
const databaseUrl = 'https://download1.graphhopper.com/public/north-america/usa/photon-db-usa-1.0-latest.tar.bz2';
const jarUrl = 'https://github.com/komoot/photon/releases/download/1.3.0/photon-1.3.0.jar';

function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}

mkdirSync(folder, { recursive: true });
if (!existsSync(jar)) {
  console.log('Downloading the official Photon server (Java 21+ required)…');
  run('curl', ['--fail', '--location', '--retry', '3', '--output', jar, jarUrl]);
}
if (!existsSync(database)) {
  console.log('Downloading Photon’s U.S.-wide OpenStreetMap index (~10.5 GB compressed)…');
  run('curl', ['--fail', '--location', '--retry', '3', '--continue-at', '-', '--output', archive, databaseUrl]);
  run('curl', ['--fail', '--location', '--retry', '3', '--output', checksum, `${databaseUrl}.md5`]);
  const expected = readFileSync(checksum, 'utf8').trim().split(/\s+/)[0].toLowerCase();
  const actualResult = spawnSync('md5', ['-q', archive], { encoding: 'utf8' });
  if (actualResult.status !== 0 || actualResult.stdout.trim().toLowerCase() !== expected) {
    console.error('Photon database checksum verification failed. The archive was kept for inspection; it was not unpacked.');
    process.exit(1);
  }
  console.log('Unpacking the U.S. index. This needs substantial free disk space…');
  run('tar', ['-xjf', archive, '-C', folder]);
}
if (!existsSync(database)) {
  console.error('The archive unpacked, but photon_data was not found in the expected location.');
  process.exit(1);
}
console.log('U.S. Photon index is ready. Start it with: npm run photon');
