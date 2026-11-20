// Kiest de opslag: Redis als er een gekoppeld is (Vercel), anders SQLite (eigen server).
// Herkent de instellingen die Vercel aanmaakt bij het koppelen van een database, ook met een
// zelfgekozen voorvoegsel (bijv. STORAGE_KV_REST_API_URL of TINT_REDIS_URL).
'use strict';
const path = require('node:path');

function zoek(re) {
  const naam = Object.keys(process.env).filter(k => re.test(k) && process.env[k]).sort((a, b) => a.length - b.length)[0];
  return naam ? process.env[naam] : '';
}

function redisConfig() {
  const url = zoek(/(^|_)(KV_REST_API|UPSTASH_REDIS_REST)_URL$/);
  const token = zoek(/(^|_)(KV_REST_API|UPSTASH_REDIS_REST)_TOKEN$/);
  if (url && token) return { url, token };
  const redisUrl = zoek(/(^|_)(REDIS_URL|KV_URL)$/);
  if (/^rediss?:\/\//.test(redisUrl)) return { redisUrl };
  return null;
}

module.exports = function pickStore() {
  const cfg = redisConfig();
  if (cfg) return require('./store-redis')(cfg);
  if (process.env.VERCEL) {
    const namen = Object.keys(process.env).filter(k => /REDIS|KV_|UPSTASH|DATABASE|POSTGRES|STORAGE/i.test(k));
    throw Object.assign(new Error('Geen database gekoppeld aan dit Vercel-project. Koppel Upstash (Redis) of Redis via Storage en doe daarna een Redeploy.'
      + (namen.length ? ' Gevonden instellingen: ' + namen.join(', ') + '.' : ' Er zijn geen database-instellingen gevonden.')), { opslag: true });
  }
  return require('./store-sqlite')(path.resolve(process.env.DATA_DIR || path.join(__dirname, '..', 'data')));
};
