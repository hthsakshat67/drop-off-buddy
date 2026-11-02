import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, scrypt as scryptCallback, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { mkdir, readFile, stat } from 'node:fs/promises';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scrypt = promisify(scryptCallback);
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const SESSION_MS = 14 * 24 * 60 * 60 * 1000;
const MAX_BODY = 120_000;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon' };
const attempts = new Map();

function database(file) {
  const db = new DatabaseSync(file);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, email TEXT NOT NULL UNIQUE, salt TEXT NOT NULL, password_hash TEXT NOT NULL, created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS carpools (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, name TEXT NOT NULL, payload TEXT NOT NULL, created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS user_settings (user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, settings TEXT NOT NULL, updated_at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);
    CREATE INDEX IF NOT EXISTS carpools_user ON carpools(user_id, created_at DESC);`);
  return db;
}

function cookieMap(header = '') {
  return Object.fromEntries(header.split(';').map((part) => part.trim().split(/=(.*)/s)).filter(([key, value]) => key && value !== undefined).map(([key, value]) => [key, decodeURIComponent(value)]));
}
function hashToken(token) { return createHash('sha256').update(token).digest('hex'); }
function send(res, status, data, headers = {}) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...headers });
  res.end(JSON.stringify(data));
}
async function bodyJson(req) {
  const chunks = []; let bytes = 0;
  for await (const chunk of req) { bytes += chunk.length; if (bytes > MAX_BODY) throw Object.assign(new Error('Request is too large.'), { status: 413 }); chunks.push(chunk); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw Object.assign(new Error('Send valid JSON.'), { status: 400 }); }
}
function passwordPolicy(value) { return typeof value === 'string' && value.length >= 12 && value.length <= 128; }
function rateLimit(req, res) {
  const now = Date.now(); const key = req.socket.remoteAddress || 'unknown';
  const item = attempts.get(key);
  if (item && now - item.start < 15 * 60_000 && item.count >= 12) { send(res, 429, { error: 'Too many sign-in attempts. Try again in 15 minutes.' }, { 'retry-after': '900' }); return false; }
  if (!item || now - item.start >= 15 * 60_000) attempts.set(key, { start: now, count: 1 }); else item.count++;
  if (attempts.size > 2000) for (const [k, v] of attempts) if (now - v.start > 15 * 60_000) attempts.delete(k);
  return true;
}

export function createAuthServer({ dbPath = process.env.DROP_OFF_DB || path.join(root, '.data', 'drop-off-buddy.sqlite'), staticFiles = process.env.NODE_ENV === 'production' } = {}) {
  if (dbPath !== ':memory:') mkdirSync(path.dirname(path.resolve(dbPath)), { recursive: true });
  const db = database(dbPath);
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    if (req.method === 'GET' && url.pathname === '/api/health') {
      try { db.prepare('SELECT 1 AS ready').get(); return send(res, 200, { status: 'ok', database: 'ready' }); }
      catch { return send(res, 503, { error: 'The account database is unavailable.' }); }
    }
    if (url.pathname.startsWith('/api/')) {
      if (!['GET', 'POST', 'PUT', 'DELETE'].includes(req.method)) return send(res, 405, { error: 'Method not allowed.' }, { allow: 'GET, POST, PUT, DELETE' });
      if (req.method !== 'GET') {
        const origin = req.headers.origin;
        if (origin) {
          try {
            const parsedOrigin = new URL(origin);
            const loopback = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
            const localDevOrigin = loopback && parsedOrigin.protocol === 'http:' && ['localhost:4178', '127.0.0.1:4178'].includes(parsedOrigin.host);
            const proxiedHost = loopback ? (req.headers['x-forwarded-host'] || req.headers.host) : req.headers.host;
            if (!localDevOrigin && parsedOrigin.host !== proxiedHost) return send(res, 403, { error: 'Cross-origin request denied.' });
          } catch { return send(res, 403, { error: 'Invalid origin.' }); }
        }
        if (!String(req.headers['content-type'] || '').includes('application/json')) return send(res, 415, { error: 'JSON content type required.' });
      }
      try {
        const now = Date.now(); db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(now);
        if (req.method === 'POST' && ['/api/auth/signup', '/api/auth/login'].includes(url.pathname)) {
          if (!rateLimit(req, res)) return;
          const input = await bodyJson(req); const email = String(input.email || '').trim().toLowerCase(); const password = input.password;
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return send(res, 400, { error: 'Enter a valid email address.' });
          if (url.pathname.endsWith('signup') && !passwordPolicy(password)) return send(res, 400, { error: 'Use a password between 12 and 128 characters.' });
          if (typeof password !== 'string' || password.length > 128) return send(res, 401, { error: 'Email or password is incorrect.' });
          let user;
          if (url.pathname.endsWith('signup')) {
            const salt = randomBytes(16).toString('hex'); const digest = await scrypt(password, salt, 64);
            try { const inserted = db.prepare('INSERT INTO users(email,salt,password_hash,created_at) VALUES(?,?,?,?)').run(email, salt, digest.toString('hex'), now); user = db.prepare('SELECT id,email FROM users WHERE id=?').get(inserted.lastInsertRowid); }
            catch (error) { if (String(error.message).includes('UNIQUE')) return send(res, 409, { error: 'An account already exists for that email. Sign in instead.' }); throw error; }
          } else {
            const row = db.prepare('SELECT * FROM users WHERE email=?').get(email);
            const salt = row?.salt || '00000000000000000000000000000000'; const digest = await scrypt(password, salt, 64);
            const expected = Buffer.from(row?.password_hash || '00'.repeat(64), 'hex');
            if (!row || expected.length !== digest.length || !timingSafeEqual(digest, expected)) return send(res, 401, { error: 'Email or password is incorrect.' });
            user = { id: row.id, email: row.email };
          }
          const token = randomBytes(32).toString('base64url'); db.prepare('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').run(hashToken(token), user.id, now + SESSION_MS);
          const secure = req.headers['x-forwarded-proto'] === 'https' || req.socket.encrypted ? '; Secure' : '';
          return send(res, 200, { user }, { 'set-cookie': `dob_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_MS / 1000}${secure}` });
        }
        const token = cookieMap(req.headers.cookie).dob_session;
        const user = token && db.prepare('SELECT users.id,users.email FROM sessions JOIN users ON users.id=sessions.user_id WHERE sessions.token_hash=? AND sessions.expires_at>?').get(hashToken(token), now);
        if (url.pathname === '/api/auth/me' && req.method === 'GET') return user ? send(res, 200, { user }) : send(res, 401, { error: 'Sign in to access your account.' });
        if (url.pathname === '/api/auth/logout' && req.method === 'POST') {
          if (token) db.prepare('DELETE FROM sessions WHERE token_hash=?').run(hashToken(token));
          return send(res, 200, { ok: true }, { 'set-cookie': 'dob_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0' });
        }
        if (!user) return send(res, 401, { error: 'Sign in to access saved carpools.' });
        if (url.pathname === '/api/settings' && req.method === 'GET') {
          const row = db.prepare('SELECT settings FROM user_settings WHERE user_id=?').get(user.id);
          return send(res, 200, { settings: row ? JSON.parse(row.settings) : { excludedCategories: ['childSchools'], excludedTerms: [] } });
        }
        if (url.pathname === '/api/settings' && req.method === 'PUT') {
          const input = await bodyJson(req); const settings = input.settings;
          const categoryAllowList = new Set(['childSchools', 'soccerFields', 'parks', 'libraries', 'colleges', 'highSchools']);
          if (!settings || !Array.isArray(settings.excludedCategories) || !settings.excludedCategories.every((item) => categoryAllowList.has(item)) || !Array.isArray(settings.excludedTerms) || settings.excludedTerms.length > 20 || !settings.excludedTerms.every((item) => typeof item === 'string' && item.length <= 40)) return send(res, 400, { error: 'Those meetup filters are invalid. Review them and try again.' });
          const normalized = { excludedCategories: [...new Set(['childSchools', ...settings.excludedCategories])], excludedTerms: [...new Set(settings.excludedTerms.map((term) => term.trim().toLowerCase()).filter(Boolean))] };
          db.prepare('INSERT INTO user_settings(user_id,settings,updated_at) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET settings=excluded.settings,updated_at=excluded.updated_at').run(user.id, JSON.stringify(normalized), now);
          return send(res, 200, { settings: normalized });
        }
        if (url.pathname === '/api/carpools' && req.method === 'GET') return send(res, 200, { carpools: db.prepare('SELECT id,name,created_at FROM carpools WHERE user_id=? ORDER BY created_at DESC').all(user.id) });
        if (url.pathname === '/api/carpools' && req.method === 'POST') {
          const input = await bodyJson(req); const payload = input.payload;
          if (!payload || !Array.isArray(payload.riders) || payload.riders.length < 2 || payload.riders.length > 10 || !payload.result || JSON.stringify(payload).length > 100_000) return send(res, 400, { error: 'This carpool is incomplete or too large to save.' });
          const name = String(input.name || 'Carpool meetup').trim().slice(0, 80) || 'Carpool meetup';
          const result = db.prepare('INSERT INTO carpools(user_id,name,payload,created_at) VALUES(?,?,?,?)').run(user.id, name, JSON.stringify(payload), now);
          return send(res, 201, { id: Number(result.lastInsertRowid), name });
        }
        const tripRoute = url.pathname.match(/^\/api\/carpools\/(\d+)$/);
        if (tripRoute && req.method === 'GET') {
          const trip = db.prepare('SELECT id,name,payload,created_at FROM carpools WHERE id=? AND user_id=?').get(Number(tripRoute[1]), user.id);
          return trip ? send(res, 200, { ...trip, payload: JSON.parse(trip.payload) }) : send(res, 404, { error: 'Saved carpool not found.' });
        }
        if (tripRoute && req.method === 'DELETE') {
          const removed = db.prepare('DELETE FROM carpools WHERE id=? AND user_id=?').run(Number(tripRoute[1]), user.id);
          return removed.changes ? send(res, 200, { ok: true }) : send(res, 404, { error: 'Saved carpool not found.' });
        }
        return send(res, 404, { error: 'API route not found.' });
      } catch (error) {
        if (!error.status) process.stderr.write(`API error ${req.method} ${url.pathname}: ${error.stack || error.message}\n`);
        return send(res, error.status || 500, { error: error.status ? error.message : 'The account service hit an internal error. Please try again; contact support if it continues.' });
      }
    }
    if (staticFiles && req.method === 'GET') {
      let target = path.resolve(root, 'dist', `.${decodeURIComponent(url.pathname)}`);
      if (!target.startsWith(path.resolve(root, 'dist') + path.sep)) return send(res, 400, { error: 'Invalid path.' });
      try { if (!(await stat(target)).isFile()) throw new Error(); } catch { target = path.join(root, 'dist', 'index.html'); }
      try { const file = await readFile(target); res.writeHead(200, { 'content-type': MIME[path.extname(target)] || 'application/octet-stream', 'x-content-type-options': 'nosniff' }); res.end(file); } catch { res.writeHead(503); res.end('Build the app with npm run build first.'); }
      return;
    }
    send(res, 404, { error: 'Not found.' });
  });
  server.on('close', () => db.close());
  return server;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = createAuthServer(); const port = Number(process.env.PORT || 4179);
  server.listen(port, '127.0.0.1', () => process.stdout.write(`Drop-Off Buddy backend listening on http://localhost:${port}\n`));
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
}
