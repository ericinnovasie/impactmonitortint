// Opslag in Upstash Redis via de REST-API (voor Vercel). Geen extra pakketten nodig.
// Elke collectie is een hash: tint:{collectie} -> {id: JSON}.
'use strict';
const crypto = require('node:crypto');

module.exports = function redisStore(url, token) {
  url = url.replace(/\/$/, '');
  async function call(path, body) {
    const r = await fetch(url + path, { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error('Redis: ' + (j.error || r.status));
    return j;
  }
  const cmd = async (...args) => { const j = await call('', args); if (j.error) throw new Error('Redis: ' + j.error); return j.result; };
  const pipe = async cmds => { const j = await call('/pipeline', cmds); const bad = j.find(x => x.error); if (bad) throw new Error('Redis: ' + bad.error); return j.map(x => x.result); };
  const K = c => 'tint:' + c;

  return {
    naam: 'redis',
    async all(coll) {
      const flat = (await cmd('HGETALL', K(coll))) || [];
      const out = {};
      for (let i = 0; i < flat.length; i += 2) out[flat[i]] = JSON.parse(flat[i + 1]);
      return out;
    },
    async put(coll, id, doc) { await pipe([['HSET', K(coll), id, JSON.stringify(doc)], ['INCR', 'tint:versie']]); },
    async del(coll, id) { await pipe([['HDEL', K(coll), id], ['INCR', 'tint:versie']]); },
    async putMany(items) {
      for (let i = 0; i < items.length; i += 200) await pipe(items.slice(i, i + 200).map(([c, id, doc]) => ['HSET', K(c), id, JSON.stringify(doc)]));
      await cmd('INCR', 'tint:versie');
    },
    async once(key) { return (await cmd('SET', 'tint:once:' + key, new Date().toISOString(), 'NX')) === 'OK'; },
    async versie() { return String((await cmd('GET', 'tint:versie')) || '0'); },
    async secret() {
      await cmd('SET', 'tint:secret', crypto.randomBytes(32).toString('hex'), 'NX');
      return cmd('GET', 'tint:secret');
    },
    async attempt(ip) {
      const [n] = await pipe([['INCR', 'tint:login:' + ip], ['EXPIRE', 'tint:login:' + ip, '900', 'NX']]);
      return n;
    },
    async resetAttempts(ip) { await cmd('DEL', 'tint:login:' + ip); },
  };
};
