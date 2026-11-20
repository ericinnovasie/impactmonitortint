// Opslaglaag voor de TINT Impactmonitor.
// Biedt dezelfde interface als de claude.ai-'db' (collection().doc().set/delete,
// onSnapshot), maar praat met de eigen server via REST. Wijzigingen van andere
// gebruikers komen binnen doordat de pagina elke paar seconden het versienummer
// van de gegevens controleert en bij een wijziging opnieuw ophaalt.
(function () {
  'use strict';
  const POLL_MS = 5000;
  const cache = {};        // coll -> {id: data}
  const listeners = {};    // coll -> [{next, error}]
  const loadedColls = new Set();
  let versie = null, timer = null, polling = false, failures = 0;

  function toLogin() { location.href = '/login'; }

  async function api(method, url, body) {
    const r = await fetch(url, {
      method, credentials: 'same-origin',
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
    if (r.status === 401) { toLogin(); throw Object.assign(new Error('niet ingelogd'), { code: 'unauthenticated' }); }
    if (r.status === 413) throw Object.assign(new Error('te groot'), { code: 'quota_exceeded' });
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      throw Object.assign(new Error('fout ' + r.status), { code: 'http_' + r.status, serverMelding: j.error || '' });
    }
    return r.json();
  }

  function snapshot(coll) {
    const docs = Object.entries(cache[coll] || {}).map(([id, d]) => ({ id, exists: true, data: () => JSON.parse(JSON.stringify(d)) }));
    return { docs, metadata: { fromCache: false } };
  }
  function emit(coll) { (listeners[coll] || []).forEach(l => { try { l.next(snapshot(coll)); } catch (e) { console.error(e); } }); }
  function fail(coll, err) { (listeners[coll] || []).forEach(l => l.error && l.error(err)); }
  function setConn(t) { const el = document.getElementById('conn'); if (el) el.textContent = t; }

  async function load(coll) {
    try {
      const j = await api('GET', '/api/' + coll);
      cache[coll] = j.docs; loadedColls.add(coll);
      // Kwam deze collectie met een ander versienummer binnen dan de rest, dan is er
      // tussendoor iets gewijzigd: bij de volgende controle alles opnieuw ophalen.
      if (versie === null) versie = j.versie;
      else if (j.versie !== versie) versie = '(opnieuw ophalen)';
      emit(coll);
    } catch (e) { if (e.code !== 'unauthenticated') fail(coll, e); }
  }

  async function poll() {
    if (polling || document.hidden) return;
    polling = true;
    try {
      const { versie: v } = await api('GET', '/api/versie');
      if (failures) setConn('Gedeelde opslag: verbonden');
      failures = 0;
      if (versie !== null && v !== versie) {
        versie = v;
        await Promise.all(Object.keys(listeners).map(load));
      } else versie = v;
    } catch (e) {
      if (e.code !== 'unauthenticated' && ++failures >= 2) setConn(e.serverMelding ? 'Probleem met de opslag (zie melding)' : 'Verbinding onderbroken, opnieuw proberen…');
    }
    polling = false;
  }
  function startPolling() {
    if (timer) return;
    timer = setInterval(poll, POLL_MS);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) poll(); });
  }

  function newId() {
    const a = new Uint8Array(20); crypto.getRandomValues(a);
    return Array.from(a, b => 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'[b % 62]).join('');
  }

  function collection(coll) {
    return {
      doc(id) {
        id = id || newId();
        return {
          id,
          async set(data) {
            await api('PUT', `/api/${coll}/${encodeURIComponent(id)}`, data);
            (cache[coll] || (cache[coll] = {}))[id] = data;
          },
          async delete() {
            await api('DELETE', `/api/${coll}/${encodeURIComponent(id)}`);
            if (cache[coll]) delete cache[coll][id];
          },
        };
      },
      onSnapshot(next, error) {
        (listeners[coll] || (listeners[coll] = [])).push({ next, error });
        startPolling();
        if (loadedColls.has(coll)) next(snapshot(coll)); else load(coll);
        return () => { listeners[coll] = (listeners[coll] || []).filter(l => l.next !== next); };
      },
    };
  }

  // Downloads: gewoon een bestand in de browser laten opslaan.
  const downloads = {
    async save({ filename, data }) {
      const type = /\.csv$/i.test(filename) ? 'text/csv;charset=utf-8' : /\.html?$/i.test(filename) ? 'text/html;charset=utf-8' : 'application/octet-stream';
      const url = URL.createObjectURL(new Blob([data], { type }));
      const a = document.createElement('a'); a.href = url; a.download = filename;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    },
  };

  async function logout() {
    try { await fetch('/logout', { method: 'POST', credentials: 'same-origin' }); } catch { /* toch doorgaan */ }
    toLogin();
  }

  window.TintStore = { db: { collection }, downloads, logout, refresh: () => Promise.all(Object.keys(listeners).map(load)) };
})();
