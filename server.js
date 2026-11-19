// TINT Impactmonitor: eigen server voor lokaal gebruik en Docker.
// Op Vercel wordt api/index.js gebruikt in plaats van dit bestand.
'use strict';
const http = require('node:http');
const pickStore = require('./lib/store');
const createApp = require('./lib/app');

const PORT = Number(process.env.PORT) || 3000;
const store = pickStore();
const server = http.createServer(createApp(store));

server.listen(PORT, () => {
  console.log(`TINT Impactmonitor draait op http://localhost:${PORT} (opslag: ${store.naam})`);
  if (!process.env.APP_PASSWORD) console.warn('LET OP: APP_PASSWORD is niet ingesteld. Iedereen met de link kan gegevens zien en wijzigen.');
});
function stop() { server.close(); if (store.close) store.close(); process.exit(0); }
process.on('SIGTERM', stop); process.on('SIGINT', stop);
