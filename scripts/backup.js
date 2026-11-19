// Maakt een consistente kopie van de database: node scripts/backup.js [doelmap]
'use strict';
process.removeAllListeners('warning');
const path = require('node:path');
const fs = require('node:fs');
const { DatabaseSync } = require('node:sqlite');
const dataDir = path.resolve(process.env.DATA_DIR || path.join(__dirname, '..', 'data'));
const out = path.resolve(process.argv[2] || path.join(dataDir, 'backups'));
fs.mkdirSync(out, { recursive: true });
const file = path.join(out, `impactmonitor-${new Date().toISOString().replace(/[:.]/g, '-')}.db`);
const db = new DatabaseSync(path.join(dataDir, 'impactmonitor.db'));
db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
db.close();
console.log('Back-up gemaakt:', file);
