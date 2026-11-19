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
      res.statusCode = 500; res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      return res.end(e.message);
    }
  }
  return handler(req, res);
};
