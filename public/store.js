// Opslaglaag voor de TINT Impactmonitor.
// Biedt dezelfde interface als de claude.ai-'db' (collection().doc().set/delete,
// onSnapshot), maar praat met de eigen server: REST voor lezen/schrijven,
// Server-Sent Events voor live updates van andere gebruikers.
(function () {
  'use strict';
  const cache = {};        // coll -> {id: data}
  const listeners = {};    // coll -> [{next, error}]
  const loadedColls = new Set();
  let es = null, everOpen = false;

  function toLogin() { location.href = '/login'; }

  async function api(method, url, body) {
    const r = await fetch(url, {
      method, credentials: 'same-origin',
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
    if (r.status === 401) { toLogin(); throw Object.assign(new Error('niet ingelogd'), { code: 'unauthenticated' }); }
    if (r.status === 413) throw Object.assign(new Error('te groot'), { code: 'quota_exceeded' });
    if (!r.ok) throw Object.assign(new Error('fout ' + r.status), { code: 'http_' + r.status });
    return r.json();
  }

  function snapshot(coll) {
    const docs = Object.entries(cache[coll] || {}).map(([id, d]) => ({ id, exists: true, data: () => JSON.parse(JSON.stringify(d)) }));
    return { docs, metadata: { fromCache: false } };
  }
  function emit(coll) { (listeners[coll] || []).forEach(l => { try { l.next(snapshot(coll)); } catch (e) { console.error(e); } }); }
  function fail(coll, err) { (listeners[coll] || []).forEach(l => l.error && l.error(err)); }

  async function load(coll) {
    try {
      const { docs } = await api('GET', '/api/' + coll);
      cache[coll] = docs; loadedColls.add(coll); emit(coll);
    } catch (e) { if (e.code !== 'unauthenticated') fail(coll, e); }
  }

  function connect() {
    if (es) return;
    es = new EventSource('/api/events');
    es.onopen = () => {
      setConn('Gedeelde opslag: verbonden');
      // Na een onderbreking alles opnieuw ophalen, zodat gemiste wijzigingen binnenkomen.
      if (everOpen) Object.keys(listeners).forEach(load);
      everOpen = true;
    };
    es.onerror = () => {
      setConn('Verbinding onderbroken, opnieuw verbinden…');
      // Mogelijk verlopen sessie: controleer kort.
      fetch('/api/config', { credentials: 'same-origin' }).then(r => { if (r.status === 401) toLogin(); }).catch(() => {});
    };
    es.onmessage = ev => {
      let m; try { m = JSON.parse(ev.data); } catch { return; }
      if (m.reload) { Object.keys(listeners).forEach(load); return; }
      if (!m.coll || !cache[m.coll]) return;
      if (m.data === null) delete cache[m.coll][m.id]; else cache[m.coll][m.id] = m.data;
      emit(m.coll);
    };
  }
  function setConn(t) { const el = document.getElementById('conn'); if (el) el.textContent = t; }

  function newId() {
    const a = new Uint8Array(20); crypto.getRandomValues(a);
    return Array.from(a, b => 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'[b % 62]).join('').slice(0, 20);
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
        connect();
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

  window.TintStore = { db: { collection }, downloads, logout };
})();
