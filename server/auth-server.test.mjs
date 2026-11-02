import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createAuthServer } from './auth-server.mjs';

const directory = await mkdtemp(path.join(tmpdir(), 'drop-off-auth-'));
let server;
async function boot(dbPath) {
  server = createAuthServer({ dbPath, staticFiles: false });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${server.address().port}`;
}
async function stop() { if (server?.listening) await new Promise((resolve) => server.close(resolve)); server = null; }
async function request(base, route, { method = 'GET', cookie, data } = {}) {
  return fetch(`${base}${route}`, { method, headers: { ...(cookie ? { cookie } : {}), ...(method !== 'GET' ? { origin: base, 'content-type': 'application/json' } : {}) }, ...(data === undefined ? {} : { body: JSON.stringify(data) }) });
}
try {
  let base = await boot(path.join(directory, 'test.sqlite'));
  assert.equal((await request(base, '/api/carpools')).status, 401, 'saved carpools require authentication');
  const weak = await request(base, '/api/auth/signup', { method: 'POST', data: { email: 'weak@example.com', password: 'short' } });
  assert.equal(weak.status, 400, 'signup enforces a strong password');
  const created = await request(base, '/api/auth/signup', { method: 'POST', data: { email: 'Rider@example.com', password: 'a-secure-test-password' } });
  assert.equal(created.status, 200); const cookie = created.headers.get('set-cookie').split(';')[0];
  assert.match(created.headers.get('set-cookie'), /HttpOnly/);
  const payload = { riders: [{ address: '1 Main St, Testville', coords: [40, -74] }, { address: '2 Oak St, Testville', coords: [40.1, -74.1] }], result: { center: [40.05, -74.05], spot: { name: 'Town Park', coords: [40.05, -74.05] } } };
  const saved = await request(base, '/api/carpools', { method: 'POST', cookie, data: { name: 'Practice meetup', payload } });
  assert.equal(saved.status, 201); const { id } = await saved.json();
  const other = await request(base, '/api/auth/signup', { method: 'POST', data: { email: 'other@example.com', password: 'another-secure-password' } });
  const otherCookie = other.headers.get('set-cookie').split(';')[0];
  assert.equal((await request(base, `/api/carpools/${id}`, { cookie: otherCookie })).status, 404, 'accounts cannot read another user’s trip');
  await stop(); base = await boot(path.join(directory, 'test.sqlite'));
  const loaded = await request(base, `/api/carpools/${id}`, { cookie });
  assert.equal(loaded.status, 200); assert.deepEqual((await loaded.json()).payload, payload, 'data survives backend restart');
  const crossOrigin = await fetch(`${base}/api/auth/logout`, { method: 'POST', headers: { origin: 'https://attacker.example', 'content-type': 'application/json' }, body: '{}' });
  assert.equal(crossOrigin.status, 403, 'cross-origin writes are rejected');
  assert.equal((await request(base, '/api/auth/logout', { method: 'POST', cookie, data: {} })).status, 200);
  assert.equal((await request(base, '/api/carpools', { cookie })).status, 401, 'logout revokes the session');
  process.stdout.write('Auth integration passed: signup, password policy, saved-data persistence, account privacy, origin checks, and logout.\n');
} finally { await stop(); await rm(directory, { recursive: true, force: true }); }
