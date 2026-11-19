// Maakt een consistente kopie van de SQLite-database: node scripts/backup.js [doelmap]
// (Op Vercel: gebruik de knop "Back-up (JSON)" in de app.)
'use strict';
const path = require('node:path');
const fs = require('node:fs');
const dataDir = path.resolve(process.env.DATA_DIR || path.join(__dirname, '..', 'data'));
const out = path.resolve(process.argv[2] || path.join(dataDir, 'backups'));
fs.mkdirSync(out, { recursive: true });
const file = path.join(out, `impactmonitor-${new Date().toISOString().replace(/[:.]/g, '-')}.db`);
const store = require('../lib/store-sqlite')(dataDir);
store.backup(file); store.close();
console.log('Back-up gemaakt:', file);
