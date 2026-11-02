import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createAuthServer } from './auth-server.mjs';
import { shouldExcludeMeetup } from '../src/venue-filters.js';

const directory = await mkdtemp(path.join(tmpdir(), 'drop-off-auth-'));
const meetupFilterTest = { excludedCategories: ['childSchools', 'soccerFields', 'parks'], excludedTerms: ['playground', 'stadium'] };
assert.equal(shouldExcludeMeetup(meetupFilterTest, 'soccerFields', 'Riverside Football Pitch'), true, 'category blacklist excludes soccer pitches');
assert.equal(shouldExcludeMeetup(meetupFilterTest, 'libraries', 'Community Library'), false, 'unblocked venues remain eligible');
assert.equal(shouldExcludeMeetup(meetupFilterTest, 'parks', 'Riverside Green'), true, 'park category blacklist is applied');
assert.equal(shouldExcludeMeetup(meetupFilterTest, 'libraries', 'Town Playground Library'), true, 'custom words are matched against venue labels');
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
  const settingResponse = await request(base, '/api/settings', { method: 'PUT', cookie, data: { settings: { excludedCategories: ['childSchools', 'soccerFields', 'parks'], excludedTerms: ['stadium'] } } });
  assert.equal(settingResponse.status, 200); assert.deepEqual((await settingResponse.json()).settings, { excludedCategories: ['childSchools', 'soccerFields', 'parks'], excludedTerms: ['stadium'] });
  const other = await request(base, '/api/auth/signup', { method: 'POST', data: { email: 'other@example.com', password: 'another-secure-password' } });
  const otherCookie = other.headers.get('set-cookie').split(';')[0];
  assert.equal((await request(base, `/api/carpools/${id}`, { cookie: otherCookie })).status, 404, 'accounts cannot read another user’s trip');
  assert.deepEqual((await (await request(base, '/api/settings', { cookie: otherCookie })).json()).settings, { excludedCategories: ['childSchools'], excludedTerms: [] }, 'meetup filters are private to each account');
  await stop(); base = await boot(path.join(directory, 'test.sqlite'));
  const loaded = await request(base, `/api/carpools/${id}`, { cookie });
  assert.equal(loaded.status, 200); assert.deepEqual((await loaded.json()).payload, payload, 'data survives backend restart');
  assert.deepEqual((await (await request(base, '/api/settings', { cookie })).json()).settings, { excludedCategories: ['childSchools', 'soccerFields', 'parks'], excludedTerms: ['stadium'] }, 'account filters survive restart');
  const crossOrigin = await fetch(`${base}/api/auth/logout`, { method: 'POST', headers: { origin: 'https://attacker.example', 'content-type': 'application/json' }, body: '{}' });
  assert.equal(crossOrigin.status, 403, 'cross-origin writes are rejected');
  const localProxy = await fetch(`${base}/api/auth/logout`, { method: 'POST', headers: { origin: 'http://localhost:4178', 'x-forwarded-host': `127.0.0.1:${server.address().port}`, 'content-type': 'application/json' }, body: '{}' });
  assert.equal(localProxy.status, 200, 'the trusted localhost app origin reaches the auth route without a cross-origin rejection');
  const proxySignup = await fetch(`${base}/api/auth/signup`, { method: 'POST', headers: { origin: 'http://localhost:4178', 'x-forwarded-host': `127.0.0.1:${server.address().port}`, 'content-type': 'application/json' }, body: JSON.stringify({ email: 'proxy@example.com', password: 'localhost-proxy-test-password' }) });
  assert.equal(proxySignup.status, 200, 'signup succeeds with the real local Vite origin');
  assert.equal((await request(base, '/api/auth/logout', { method: 'POST', cookie, data: {} })).status, 200);
  assert.equal((await request(base, '/api/carpools', { cookie })).status, 401, 'logout revokes the session');
  const loggedIn = await request(base, '/api/auth/login', { method: 'POST', data: { email: 'rider@example.com', password: 'a-secure-test-password' } });
  assert.equal(loggedIn.status, 200, 'a registered user can sign in again');
  const loginCookie = loggedIn.headers.get('set-cookie').split(';')[0];
  assert.equal((await request(base, '/api/auth/me', { cookie: loginCookie })).status, 200, 'login returns a valid persisted account session');
  assert.equal((await request(base, '/api/auth/login', { method: 'POST', data: { email: 'rider@example.com', password: 'incorrect-test-password' } })).status, 401, 'wrong credentials return a precise authentication error');
  process.stdout.write('Auth integration passed: signup, password policy, saved-data persistence, account privacy, origin checks, and logout.\n');
} finally { await stop(); await rm(directory, { recursive: true, force: true }); }
