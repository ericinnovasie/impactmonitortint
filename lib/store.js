// Kiest de opslag: Upstash Redis als de omgevingsvariabelen daarvoor er zijn (Vercel), anders SQLite.
'use strict';
const path = require('node:path');
module.exports = function pickStore() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) return require('./store-redis')(url, token);
  if (process.env.VERCEL) throw new Error('Geen database gekoppeld. Voeg Upstash Redis toe aan dit Vercel-project (Storage).');
  return require('./store-sqlite')(path.resolve(process.env.DATA_DIR || path.join(__dirname, '..', 'data')));
};
