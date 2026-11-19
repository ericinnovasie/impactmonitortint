// TINT Impactmonitor: request-handler, gedeeld door de eigen server (server.js)
// en de Vercel-functie (api/index.js). Geen externe pakketten.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const PASSWORD = process.env.APP_PASSWORD || '';
const SESSION_DAYS = Number(process.env.SESSION_DAYS) || 30;
const PUBLIC = path.join(__dirname, '..', 'public');
const COLLS = ['bedrijven', 'trajecten', 'inventarisaties', 'technologieen'];
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const MAX_BODY = 2 * 1024 * 1024;
const SEC_HEADERS = { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin', 'X-Frame-Options': 'SAMEORIGIN' };
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };

module.exports = function createApp(store) {
  /* ---------- Sessies ---------- */
  let secretP = null;
  const getSecret = () => secretP || (secretP = (process.env.SESSION_SECRET ? Promise.resolve(process.env.SESSION_SECRET) : store.secret()).catch(e => { secretP = null; throw e; }));
  // Wachtwoordhash gaat mee in de handtekening: wachtwoord wijzigen = iedereen uitgelogd.
  const pwTag = crypto.createHash('sha256').update(PASSWORD).digest('hex').slice(0, 16);
  const sign = async v => crypto.createHmac('sha256', await getSecret()).update(v + '|' + pwTag).digest('base64url');
  async function makeToken() { const exp = String(Date.now() + SESSION_DAYS * 864e5); return exp + '.' + await sign(exp); }
  async function validToken(t) {
    if (!t) return false;
    const [exp, sig] = t.split('.');
    if (!exp || !sig || Number(exp) < Date.now()) return false;
    const a = Buffer.from(sig), b = Buffer.from(await sign(exp));
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }
  function cookies(req) {
    const out = {};
    (req.headers.cookie || '').split(';').forEach(p => { const i = p.indexOf('='); if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim()); });
    return out;
  }
  const authed = async req => !PASSWORD || validToken(cookies(req).tint_sessie);
  const isHttps = req => process.env.COOKIE_SECURE === 'true' || req.headers['x-forwarded-proto'] === 'https';
  function setCookie(req, res, value, maxAge) {
    res.setHeader('Set-Cookie', `tint_sessie=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${isHttps(req) ? '; Secure' : ''}`);
  }
  function pwOk(given) {
    const a = crypto.createHash('sha256').update(String(given)).digest();
    const b = crypto.createHash('sha256').update(PASSWORD).digest();
    return crypto.timingSafeEqual(a, b);
  }

  /* ---------- Hulp ---------- */
  function send(res, status, body, type = 'application/json; charset=utf-8') {
    res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', ...SEC_HEADERS });
    res.end(type.startsWith('application/json') ? JSON.stringify(body) : body);
  }
  function redirect(res, to) { res.writeHead(302, { Location: to }); res.end(); }
  function readBody(req) {
    // Vercel heeft de body soms al ingelezen als req.body.
    if (req.body !== undefined && req.body !== null) {
      const b = req.body;
      return Promise.resolve(typeof b === 'string' ? b : Buffer.isBuffer(b) ? b.toString('utf8') : JSON.stringify(b));
    }
    return new Promise((resolve, reject) => {
      let size = 0; const chunks = [];
      req.on('data', c => { size += c.length; if (size > MAX_BODY) { reject(Object.assign(new Error('te groot'), { status: 413 })); req.destroy(); } else chunks.push(c); });
      req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      req.on('error', reject);
    });
  }
  function serveStatic(res, rel) {
    const file = path.join(PUBLIC, path.normalize('/' + rel).replace(/^([/\\])+/, ''));
    if (!file.startsWith(PUBLIC + path.sep)) return send(res, 404, 'Niet gevonden', 'text/plain; charset=utf-8');
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
    try { return new URL(o).host === (req.headers['x-forwarded-host'] || req.headers.host); } catch { return false; }
  }
  const clientIp = req => String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim() || 'onbekend';

  /* ---------- Routes ---------- */
  return async function handle(req, res) {
    const p = new URL(req.url, 'http://x').pathname;
    try {
      if (p === '/healthz') return send(res, 200, { ok: true, opslag: store.naam });

      if (p === '/login' || p === '/login.html') {
        if (req.method === 'GET') return (await authed(req)) ? redirect(res, '/') : serveStatic(res, 'login.html');
        if (req.method === 'POST') {
          if (!sameOrigin(req)) return send(res, 403, { error: 'onbekende herkomst' });
          const ip = clientIp(req);
          if ((await store.attempt(ip)) > 10) return send(res, 429, { error: 'Te veel pogingen. Probeer het over een kwartier opnieuw.' });
          let pw = '';
          try { pw = JSON.parse(await readBody(req)).wachtwoord || ''; } catch { /* leeg */ }
          if (!PASSWORD || !pwOk(pw)) return send(res, 401, { error: 'Wachtwoord klopt niet.' });
          await store.resetAttempts(ip);
          setCookie(req, res, await makeToken(), SESSION_DAYS * 86400);
          return send(res, 200, { ok: true });
        }
      }
      if (p === '/logout' && req.method === 'POST') { setCookie(req, res, '', 0); return send(res, 200, { ok: true }); }

      const ok = await authed(req);
      if (p === '/api/config') return send(res, 200, { auth: !!PASSWORD, ingelogd: ok });

      if (!ok) {
        if (p.startsWith('/api/')) return send(res, 401, { error: 'niet ingelogd' });
        if (p === '/' || p.endsWith('.html')) return redirect(res, '/login');
        if (!['/favicon.svg'].includes(p)) return send(res, 401, 'Niet ingelogd', 'text/plain; charset=utf-8');
      }

      if (p === '/api/versie') return send(res, 200, { versie: await store.versie() });

      if (p === '/api/export' && req.method === 'GET') {
        const out = {};
        for (const c of COLLS) out[c] = await store.all(c);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': `attachment; filename="tint-impactmonitor-${new Date().toISOString().slice(0, 10)}.json"`, 'Cache-Control': 'no-store' });
        return res.end(JSON.stringify(out, null, 2));
      }

      if (p === '/api/import' && req.method === 'POST') {
        if (!sameOrigin(req)) return send(res, 403, { error: 'onbekende herkomst' });
        const data = JSON.parse(await readBody(req));
        const items = [];
        for (const c of COLLS) for (const [id, doc] of Object.entries((data && data[c]) || {})) {
          if (ID_RE.test(id) && doc && typeof doc === 'object' && !Array.isArray(doc)) items.push([c, id, doc]);
        }
        await store.putMany(items);
        return send(res, 200, { ok: true, geimporteerd: items.length });
      }

      const m = p.match(/^\/api\/([a-z]+)(?:\/([^/]+))?$/);
      if (m) {
        const [, coll, id] = m;
        if (!COLLS.includes(coll)) return send(res, 404, { error: 'onbekende collectie' });
        if (!id && req.method === 'GET') return send(res, 200, { docs: await store.all(coll), versie: await store.versie() });
        if (id && !ID_RE.test(id)) return send(res, 400, { error: 'ongeldige id' });
        if (id && req.method === 'PUT') {
          if (!sameOrigin(req)) return send(res, 403, { error: 'onbekende herkomst' });
          const doc = JSON.parse(await readBody(req));
          if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return send(res, 400, { error: 'ongeldig document' });
          await store.put(coll, id, doc);
          return send(res, 200, { ok: true });
        }
        if (id && req.method === 'DELETE') {
          if (!sameOrigin(req)) return send(res, 403, { error: 'onbekende herkomst' });
          await store.del(coll, id);
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
  };
};
