// Minimale Redis-client (RESP2) over TCP/TLS, zonder extra pakketten.
// Voor databases die alleen een REDIS_URL leveren (bijv. "Redis" in de Vercel Marketplace).
// Biedt dezelfde twee functies als de Upstash-REST-transport: cmd(...args) en pipe([[...], ...]).
'use strict';
const net = require('node:net');
const tls = require('node:tls');

module.exports = function redisTcp(redisUrl) {
  const u = new URL(redisUrl);
  const secure = u.protocol === 'rediss:';
  const host = u.hostname, port = Number(u.port) || 6379;
  const user = decodeURIComponent(u.username || ''), pass = decodeURIComponent(u.password || '');
  const dbIndex = (u.pathname || '').replace('/', '');

  let sock = null, ready = null, buf = Buffer.alloc(0);
  const waiting = []; // {resolve, reject}

  const encode = args => {
    let out = `*${args.length}\r\n`;
    for (const a of args) { const s = Buffer.from(String(a)); out += `$${s.length}\r\n${s.toString('binary')}\r\n`; }
    return Buffer.from(out, 'binary');
  };

  // Probeert één antwoord uit de buffer te lezen; geeft [waarde, rest] of null als het nog niet compleet is.
  function parse(b, i = 0) {
    if (b.length <= i) return null;
    const end = b.indexOf('\r\n', i);
    if (end < 0) return null;
    const type = String.fromCharCode(b[i]), line = b.toString('utf8', i + 1, end);
    const next = end + 2;
    if (type === '+') return [line, next];
    if (type === '-') return [Object.assign(new Error('Redis: ' + line), { redis: true }), next];
    if (type === ':') return [Number(line), next];
    if (type === '$') {
      const len = Number(line);
      if (len < 0) return [null, next];
      if (b.length < next + len + 2) return null;
      return [b.toString('utf8', next, next + len), next + len + 2];
    }
    if (type === '*') {
      const n = Number(line);
      if (n < 0) return [null, next];
      const arr = []; let pos = next;
      for (let k = 0; k < n; k++) { const r = parse(b, pos); if (!r) return null; arr.push(r[0]); pos = r[1]; }
      return [arr, pos];
    }
    throw new Error('Redis: onbekend antwoord');
  }

  function onData(chunk) {
    buf = Buffer.concat([buf, chunk]);
    for (;;) {
      const r = parse(buf);
      if (!r) break;
      buf = buf.subarray(r[1]);
      const w = waiting.shift();
      if (w) w.resolve(r[0]);
    }
  }
  function fail(err) {
    sock = null; ready = null; buf = Buffer.alloc(0);
    while (waiting.length) waiting.shift().reject(err);
  }

  function send(cmds) {
    const results = cmds.map(() => new Promise((resolve, reject) => waiting.push({ resolve, reject })));
    sock.write(Buffer.concat(cmds.map(encode)));
    return Promise.all(results);
  }

  function connect() {
    if (ready) return ready;
    ready = new Promise((resolve, reject) => {
      const opts = { host, port, servername: host };
      const s = secure ? tls.connect(opts) : net.connect(opts);
      s.setNoDelay(true);
      s.setTimeout(8000, () => s.destroy(new Error('Redis: time-out')));
      s.on('data', onData);
      s.on('error', e => { fail(e); reject(e); });
      s.on('close', () => fail(new Error('Redis: verbinding gesloten')));
      s.once(secure ? 'secureConnect' : 'connect', async () => {
        sock = s;
        try {
          const init = [];
          if (pass) init.push(user && user !== 'default' ? ['AUTH', user, pass] : ['AUTH', pass]);
          if (dbIndex) init.push(['SELECT', dbIndex]);
          if (init.length) { const r = await send(init); const e = r.find(x => x instanceof Error); if (e) throw e; }
          resolve();
        } catch (e) { s.destroy(); reject(e); }
      });
    });
    return ready;
  }

  async function pipe(cmds) {
    await connect();
    const r = await send(cmds);
    const e = r.find(x => x instanceof Error);
    if (e) throw e;
    return r;
  }
  return { cmd: async (...args) => (await pipe([args]))[0], pipe };
};
