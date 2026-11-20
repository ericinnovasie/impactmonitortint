// Vercel-functie: alle /api-, /login- en /logout-verzoeken komen hier binnen.
// De pagina's zelf (public/) serveert Vercel als statische bestanden.
'use strict';
const pickStore = require('../lib/store');
const createApp = require('../lib/app');

let handler = null;
module.exports = async (req, res) => {
  if (!handler) {
    try { handler = createApp(pickStore()); }
    catch (e) {
      console.error(e.message);
      // De inlogpagina blijft bereikbaar, zodat de melding daar zichtbaar wordt bij het inloggen.
      if (req.method === 'GET' && /^\/login\/?$/.test(new URL(req.url, 'http://x').pathname)) {
        res.statusCode = 200; res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.end(require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'public', 'login.html')));
      }
      res.statusCode = 500; res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.end(JSON.stringify({ error: e.message }));
    }
  }
  return handler(req, res);
};
