// TINT Impactmonitor: server zonder externe afhankelijkheden (Node 22.13+).
// Opslag in SQLite (node:sqlite), REST-API, live updates via Server-Sent Events,
// inloggen met één gedeeld wachtwoord (APP_PASSWORD).
'use strict';
process.removeAllListeners('warning'); // onderdrukt de ExperimentalWarning van node:sqlite
process.on('warning', w => { if (w.name !== 'ExperimentalWarning') console.warn(w); });

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, 'data'));
const PASSWORD = process.env.APP_PASSWORD || '';
const SECURE_COOKIE = process.env.COOKIE_SECURE === 'true';
const SESSION_DAYS = Number(process.env.SESSION_DAYS) || 30;
const PUBLIC = path.join(__dirname, 'public');
const COLLS = new Set(['bedrijven', 'trajecten', 'inventarisaties', 'technologieen']);
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const MAX_BODY = 2 * 1024 * 1024;

fs.mkdirSync(DATA_DIR, { recursive: true });

/* ---------- Database ---------- */
const db = new DatabaseSync(path.join(DATA_DIR, 'impactmonitor.db'));
db.exec(`PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS docs(
  coll TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, updated TEXT NOT NULL,
  PRIMARY KEY(coll,id));`);
const qAll = db.prepare('SELECT id,data FROM docs WHERE coll=?');
const qPut = db.prepare(`INSERT INTO docs(coll,id,data,updated) VALUES(?,?,?,?)
  ON CONFLICT(coll,id) DO UPDATE SET data=excluded.data, updated=excluded.updated`);
const qDel = db.prepare('DELETE FROM docs WHERE coll=? AND id=?');

/* ---------- Sessies ---------- */
// Geheime sleutel blijft bewaard in de datamap, zodat sessies een herstart overleven.
const secretFile = path.join(DATA_DIR, '.session-secret');
let SECRET = process.env.SESSION_SECRET;
if (!SECRET) {
  try { SECRET = fs.readFileSync(secretFile, 'utf8').trim(); } catch { /* nieuw */ }
  if (!SECRET) { SECRET = crypto.randomBytes(32).toString('hex'); fs.writeFileSync(secretFile, SECRET, { mode: 0o600 }); }
}
// Wachtwoordhash gaat mee in de handtekening: wachtwoord wijzigen = iedereen uitgelogd.
const pwTag = crypto.createHash('sha256').update(PASSWORD).digest('hex').slice(0, 16);
const sign = v => crypto.createHmac('sha256', SECRET).update(v + '|' + pwTag).digest('base64url');
function makeToken() { const exp = Date.now() + SESSION_DAYS * 864e5; return exp + '.' + sign(String(exp)); }
function validToken(t) {
  if (!t) return false;
  const [exp, sig] = t.split('.');
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  const a = Buffer.from(sig), b = Buffer.from(sign(exp));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function cookies(req) {
  const out = {};
  (req.headers.cookie || '').split(';').forEach(p => { const i = p.indexOf('='); if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim()); });
  return out;
}
const authed = req => !PASSWORD || validToken(cookies(req).tint_sessie);
function setCookie(res, value, maxAge) {
  res.setHeader('Set-Cookie', `tint_sessie=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${SECURE_COOKIE ? '; Secure' : ''}`);
}
function pwOk(given) {
  const a = crypto.createHash('sha256').update(String(given)).digest();
  const b = crypto.createHash('sha256').update(PASSWORD).digest();
  return crypto.timingSafeEqual(a, b);
}
// Eenvoudige rem op raden: max 10 pogingen per 15 minuten per IP.
const attempts = new Map();
function throttled(ip) {
  const now = Date.now(), r = attempts.get(ip) || { n: 0, t: now };
  if (now - r.t > 15 * 60e3) { r.n = 0; r.t = now; }
  r.n++; attempts.set(ip, r);
  return r.n > 10;
}

/* ---------- Live updates ---------- */
const clients = new Set();
function broadcast(msg) {
  const line = `data: ${JSON.stringify(msg)}\n\n`;
  for (const c of clients) c.write(line);
}
setInterval(() => { for (const c of clients) c.write(': ping\n\n'); }, 25e3).unref();

/* ---------- Hulp ---------- */
const SEC_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
  'X-Frame-Options': 'SAMEORIGIN',
};
function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', ...SEC_HEADERS });
  res.end(type.startsWith('application/json') ? JSON.stringify(body) : body);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > MAX_BODY) { reject(Object.assign(new Error('te groot'), { status: 413 })); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };
function serveStatic(res, rel) {
  const file = path.join(PUBLIC, path.normalize(rel).replace(/^([/\\]|\.\.)+/, ''));
  if (!file.startsWith(PUBLIC)) return send(res, 404, { error: 'niet gevonden' });
  fs.readFile(file, (err, buf) => {
    if (err) return send(res, 404, 'Niet gevonden', 'text/plain; charset=utf-8');
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache', ...SEC_HEADERS });
    res.end(buf);
  });
}
// Schrijfacties alleen vanaf de eigen site (CSRF-bescherming naast SameSite-cookie).
function sameOrigin(req) {
  const o = req.headers.origin;
  if (!o) return true;
  try { return new URL(o).host === req.headers.host; } catch { return false; }
}

/* ---------- Routes ---------- */
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;
  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  try {
    if (p === '/healthz') return send(res, 200, { ok: true });

    if (p === '/login') {
      if (req.method === 'GET') return authed(req) ? (res.writeHead(302, { Location: '/' }), res.end()) : serveStatic(res, 'login.html');
      if (req.method === 'POST') {
        if (!sameOrigin(req)) return send(res, 403, { error: 'onbekende herkomst' });
        if (throttled(ip)) return send(res, 429, { error: 'Te veel pogingen. Probeer het over een kwartier opnieuw.' });
        let pw = '';
        try { pw = JSON.parse(await readBody(req)).wachtwoord || ''; } catch { /* leeg */ }
        if (!PASSWORD || !pwOk(pw)) return send(res, 401, { error: 'Wachtwoord klopt niet.' });
        attempts.delete(ip);
        setCookie(res, makeToken(), SESSION_DAYS * 86400);
        return send(res, 200, { ok: true });
      }
    }
    if (p === '/logout' && req.method === 'POST') {
      setCookie(res, '', 0);
      return send(res, 200, { ok: true });
    }

    if (!authed(req)) {
      if (p.startsWith('/api/')) return send(res, 401, { error: 'niet ingelogd' });
      if (p === '/' || p.endsWith('.html')) { res.writeHead(302, { Location: '/login' }); return res.end(); }
      if (!['/login.css', '/favicon.svg'].includes(p)) return send(res, 401, 'Niet ingelogd', 'text/plain; charset=utf-8');
    }

    if (p === '/api/config') return send(res, 200, { auth: !!PASSWORD });

    if (p === '/api/events') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
      res.write('retry: 3000\n\n');
      clients.add(res);
      req.on('close', () => clients.delete(res));
      return;
    }

    if (p === '/api/export' && req.method === 'GET') {
      const out = {};
      for (const c of COLLS) { out[c] = {}; for (const r of qAll.all(c)) out[c][r.id] = JSON.parse(r.data); }
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': `attachment; filename="tint-impactmonitor-${new Date().toISOString().slice(0, 10)}.json"`, 'Cache-Control': 'no-store' });
      return res.end(JSON.stringify(out, null, 2));
    }

    if (p === '/api/import' && req.method === 'POST') {
      if (!sameOrigin(req)) return send(res, 403, { error: 'onbekende herkomst' });
      const data = JSON.parse(await readBody(req));
      const now = new Date().toISOString(); let n = 0;
      db.exec('BEGIN');
      try {
        for (const c of COLLS) for (const [id, doc] of Object.entries(data[c] || {})) {
          if (!ID_RE.test(id) || !doc || typeof doc !== 'object') continue;
          qPut.run(c, id, JSON.stringify(doc), now); n++;
        }
        db.exec('COMMIT');
      } catch (e) { db.exec('ROLLBACK'); throw e; }
      broadcast({ reload: true });
      return send(res, 200, { ok: true, geimporteerd: n });
    }

    const m = p.match(/^\/api\/([a-z]+)(?:\/([^/]+))?$/);
    if (m) {
      const [, coll, id] = m;
      if (!COLLS.has(coll)) return send(res, 404, { error: 'onbekende collectie' });
      if (!id && req.method === 'GET') {
        const docs = {};
        for (const r of qAll.all(coll)) docs[r.id] = JSON.parse(r.data);
        return send(res, 200, { docs });
      }
      if (id && !ID_RE.test(id)) return send(res, 400, { error: 'ongeldige id' });
      if (id && req.method === 'PUT') {
        if (!sameOrigin(req)) return send(res, 403, { error: 'onbekende herkomst' });
        const doc = JSON.parse(await readBody(req));
        if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return send(res, 400, { error: 'ongeldig document' });
        qPut.run(coll, id, JSON.stringify(doc), new Date().toISOString());
        broadcast({ coll, id, data: doc });
        return send(res, 200, { ok: true });
      }
      if (id && req.method === 'DELETE') {
        if (!sameOrigin(req)) return send(res, 403, { error: 'onbekende herkomst' });
        qDel.run(coll, id);
        broadcast({ coll, id, data: null });
        return send(res, 200, { ok: true });
      }
      return send(res, 405, { error: 'methode niet toegestaan' });
    }

    if (req.method !== 'GET') return send(res, 405, { error: 'methode niet toegestaan' });
    return serveStatic(res, p === '/' ? 'index.html' : p);
  } catch (e) {
    if (e instanceof SyntaxError) return send(res, 400, { error: 'ongeldige JSON' });
    console.error(e);
    return send(res, e.status || 500, { error: 'serverfout' });
  }
});

server.listen(PORT, () => {
  console.log(`TINT Impactmonitor draait op http://localhost:${PORT}`);
  console.log(`Data: ${DATA_DIR}`);
  if (!PASSWORD) console.warn('LET OP: APP_PASSWORD is niet ingesteld. Iedereen met de link kan gegevens zien en wijzigen.');
});
function stop() { server.close(); for (const c of clients) c.end(); db.close(); process.exit(0); }
process.on('SIGTERM', stop); process.on('SIGINT', stop);
