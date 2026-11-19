// Opslag in een SQLite-bestand (lokaal en Docker). Vereist Node 22.13+.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

module.exports = function sqliteStore(dataDir) {
  process.removeAllListeners('warning'); // ExperimentalWarning van node:sqlite onderdrukken
  process.on('warning', w => { if (w.name !== 'ExperimentalWarning') console.warn(w); });
  const { DatabaseSync } = require('node:sqlite');
  fs.mkdirSync(dataDir, { recursive: true });
  const db = new DatabaseSync(path.join(dataDir, 'impactmonitor.db'));
  db.exec(`PRAGMA journal_mode=WAL;
  CREATE TABLE IF NOT EXISTS docs(coll TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, updated TEXT NOT NULL, PRIMARY KEY(coll,id));
  CREATE TABLE IF NOT EXISTS meta(k TEXT PRIMARY KEY, v TEXT NOT NULL);`);
  const qAll = db.prepare('SELECT id,data FROM docs WHERE coll=?');
  const qPut = db.prepare(`INSERT INTO docs(coll,id,data,updated) VALUES(?,?,?,?)
    ON CONFLICT(coll,id) DO UPDATE SET data=excluded.data, updated=excluded.updated`);
  const qDel = db.prepare('DELETE FROM docs WHERE coll=? AND id=?');
  const qGetMeta = db.prepare('SELECT v FROM meta WHERE k=?');
  const qSetMeta = db.prepare('INSERT INTO meta(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v');
  const bump = () => qSetMeta.run('versie', String(Date.now()) + crypto.randomBytes(3).toString('hex'));
  const attempts = new Map();

  return {
    naam: 'sqlite',
    async all(coll) { const out = {}; for (const r of qAll.all(coll)) out[r.id] = JSON.parse(r.data); return out; },
    async put(coll, id, doc) { qPut.run(coll, id, JSON.stringify(doc), new Date().toISOString()); bump(); },
    async del(coll, id) { qDel.run(coll, id); bump(); },
    async putMany(items) {
      const now = new Date().toISOString();
      db.exec('BEGIN');
      try { for (const [c, id, doc] of items) qPut.run(c, id, JSON.stringify(doc), now); db.exec('COMMIT'); }
      catch (e) { db.exec('ROLLBACK'); throw e; }
      bump();
    },
    async versie() { return (qGetMeta.get('versie') || { v: '0' }).v; },
    async secret() {
      let s = (qGetMeta.get('secret') || {}).v;
      if (!s) { s = crypto.randomBytes(32).toString('hex'); qSetMeta.run('secret', s); }
      return s;
    },
    async attempt(ip) {
      const now = Date.now(), r = attempts.get(ip) || { n: 0, t: now };
      if (now - r.t > 15 * 60e3) { r.n = 0; r.t = now; }
      r.n++; attempts.set(ip, r); return r.n;
    },
    async resetAttempts(ip) { attempts.delete(ip); },
    backup(file) { db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`); },
    close() { db.close(); },
  };
};
