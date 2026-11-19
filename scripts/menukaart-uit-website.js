// Zet de technologiebibliotheek van tint-achterhoek.nl om naar de startvulling van de menukaart.
//
//   node scripts/menukaart-uit-website.js [bron]
//
// bron: een URL (standaard https://tint-achterhoek.nl/technologie/) of een opgeslagen HTML-bestand.
// Schrijft lib/seed-menukaart.json. De app voegt die eenmalig toe bij de eerste start.
// Categorie, knelpunten en verwachte effecten zijn hieronder per technologie ingedeeld door TINT
// (de website gebruikt een andere indeling); nieuwe technologieën krijgen een indeling op basis van
// het aspect op de website en moeten daarna even worden nagelopen.
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const BASE = 'https://tint-achterhoek.nl/technologie/';

// slug -> [categorie, knelpunten, dimensies]
const F = 'Fysieke ondersteuning', R = 'Robotica en automatisering', W = 'Digitale werkinstructies',
  C = 'Cognitieve ondersteuning', E = 'Werkplek en ergonomie', T = 'Communicatie en taal', L = 'Toeleiding naar werk';
const INDELING = {
  'arm-ondersteunend-exoskelet': [F, ['fysiek'], ['welz', 'inzet', 'kval']],
  'beamerprojectie-van-werkinstructies': [W, ['cognitief', 'organisatorisch'], ['zelf', 'prod', 'kval']],
  'been-ondersteunend-exoskelet': [F, ['fysiek'], ['welz', 'inzet']],
  'begeleiding-planning-groenvoorziening-anchiano': [C, ['cognitief', 'organisatorisch'], ['zelf', 'inzet', 'welz']],
  'bewustzijn-lichamelijke-belastbaarheid-bewustbelast': [E, ['fysiek'], ['welz', 'inzet']],
  'cobot-collaborative-robot': [R, ['fysiek', 'organisatorisch'], ['prod', 'welz', 'inzet', 'kval']],
  'communicatie-via-beelden': [T, ['cognitief'], ['zelf', 'inzet', 'welz']],
  'digitale-gesprekspartner-ai-avatar': [T, ['cognitief'], ['welz', 'inzet']],
  'digitale-ondersteuning-leren-basisvaardigheden': [L, ['cognitief'], ['inzet', 'zelf']],
  'emoties-en-planning-sociale-robot': [C, ['cognitief'], ['welz', 'zelf']],
  'hand-exoskelet': [F, ['fysiek'], ['inzet', 'zelf', 'welz']],
  'handsfree-bediening-tablet-smartphone': [E, ['fysiek'], ['inzet', 'zelf']],
  'hulp-bij-reizen-met-ov-goov': [C, ['cognitief', 'organisatorisch'], ['zelf', 'inzet']],
  'hulp-bij-spreken-spraak-naar-tekst-talkie': [T, ['fysiek'], ['inzet', 'zelf', 'welz']],
  'hulpmiddelen-op-maat-3d-printer': [E, ['fysiek'], ['inzet', 'zelf', 'prod']],
  'kwaliteiten-in-kaart-brengen-game-based-assessment': [L, ['organisatorisch'], ['inzet']],
  'loopbaanorientatie-virtual-reality': [L, ['organisatorisch'], ['inzet']],
  'ondersteuning-bij-spasticiteit-mollii-suit': [F, ['fysiek'], ['inzet', 'welz']],
  'ontspannen-virtual-reality-vrelax': [C, ['cognitief'], ['welz']],
  'romp-ondersteunend-exoskelet': [F, ['fysiek'], ['welz', 'inzet', 'kval']],
  'sollicitatietraining-virtual-reality': [L, ['cognitief'], ['inzet']],
  'spraak-naar-tekst-telefoongesprekken-rogervoice': [T, ['fysiek'], ['inzet', 'zelf']],
  'spraak-naar-tekst-vergaderingen-speaksee': [T, ['fysiek'], ['inzet', 'zelf', 'welz']],
  'spraakherkenning-schrijfondersteuning-dragon': [T, ['fysiek', 'cognitief'], ['zelf', 'prod', 'welz']],
  'stressmanagement-app-autisme-sam': [C, ['cognitief'], ['welz', 'zelf']],
  'stressmanagement-app-burnout-stresscoach': [C, ['cognitief'], ['welz', 'inzet']],
  'stressmanagement-hartfrequentie-knowyourself': [C, ['cognitief'], ['welz', 'inzet']],
  'tekst-laten-voorlezen-voorleespen': [T, ['cognitief'], ['zelf', 'inzet']],
  'tekst-naar-spraak-speechify-readspeaker': [T, ['cognitief'], ['zelf', 'inzet']],
  'trainen-vr-omgeving-vorkheftruckchauffeur-playsight': [W, ['cognitief', 'organisatorisch'], ['zelf', 'kval', 'inzet']],
  'vaktaal-leren-vaktaalapp': [T, ['cognitief'], ['zelf', 'inzet', 'kval']],
  'verbeteren-zicht-esight': [F, ['fysiek'], ['inzet', 'zelf']],
  'vereenvoudiging-digitale-tekst-capito-leessimpel': [T, ['cognitief'], ['zelf', 'inzet']],
  'vermoeidheid-verminderen-kanker-untire': [C, ['fysiek'], ['welz', 'inzet']],
  'versterken-stem-stemaandoening-whispp': [T, ['fysiek'], ['inzet', 'welz']],
  'vertaaltechnologie-spraak-timekettle': [T, ['cognitief'], ['inzet', 'kval']],
  'visuele-informatie-bril-naar-spraak-orcam': [T, ['fysiek'], ['zelf', 'inzet']],
  'visuele-informatie-smartphone-naar-spraak-seeing-ai': [T, ['fysiek'], ['zelf', 'inzet']],
  'vr-bril': [C, ['cognitief'], ['welz']],
  'werkinstructies-met-controle-operator-support-systeem': [W, ['cognitief', 'organisatorisch'], ['kval', 'zelf', 'prod']],
  'werkinstructies-op-slimme-bril': [W, ['cognitief', 'organisatorisch'], ['prod', 'zelf', 'kval']],
  'werkinstructies-op-tablet-of-smartphone': [W, ['cognitief', 'organisatorisch'], ['kval', 'zelf', 'prod']],
};
const STANDAARD = { 'Lichamelijk functioneren': [F, ['fysiek'], ['inzet', 'welz']], 'Persoonlijk functioneren': [C, ['cognitief'], ['zelf', 'welz']], 'Sociaal functioneren': [T, ['cognitief'], ['inzet', 'zelf']] };

// Huisregel interface: geen lange gedachtestreepjes.
const schoon = s => String(s || '')
  .replace(/<\/(p|li)>/g, ' ').replace(/<[^>]+>/g, '')
  .replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/(\d)\s*[–—]\s*(\d)/g, '$1-$2').replace(/\s+[–—]\s+/g, ', ').replace(/[–—]/g, '-')
  .replace(/\s+/g, ' ').trim();

function techsUitHtml(html) {
  const chunks = [...html.matchAll(/self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)/g)].map(m => JSON.parse('"' + m[1] + '"'));
  const full = chunks.join('');
  const i = full.indexOf('{"techs":');
  if (i < 0) throw new Error('Geen technologieën gevonden in de pagina; is de opbouw van de website veranderd?');
  // Zoek het einde van het JSON-object door haakjes te tellen.
  let d = 0, inStr = false, esc = false, j = i;
  for (; j < full.length; j++) {
    const c = full[j];
    if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true; else if (c === '{' || c === '[') d++; else if (c === '}' || c === ']') { d--; if (d === 0) break; }
  }
  return JSON.parse(full.slice(i, j + 1)).techs;
}

function eur(n) { return '€ ' + Number(n).toLocaleString('nl-NL', { maximumFractionDigits: 0 }); }

function omzetten(t) {
  const slug = t.slug.toLowerCase();
  const sec = Object.fromEntries((t.sections || []).map(s => [s.id, schoon(s.html)]));
  const [categorie, knelpunten, dimensies] = INDELING[slug] || STANDAARD[t.aspect] || ['Overig', [], []];
  const leveranciers = (t.suppliers || []).map(s => schoon(s.name)).join(', ');
  const prijs = t.costMin != null && t.costMax != null ? `${eur(t.costMin)} tot ${eur(t.costMax)}`
    : t.costMin != null ? `vanaf ${eur(t.costMin)}` : t.costMax != null ? `tot ${eur(t.costMax)}` : '';
  const bron = [
    `TINT technologiebibliotheek: ${BASE}${t.slug}/`,
    (t.suppliers || []).length ? 'Leveranciers: ' + t.suppliers.map(s => schoon(s.name) + (s.url ? ` (${s.url})` : '')).join(', ') : '',
    [t.maturity ? `Volwassenheid: ${schoon(t.maturity)}.` : '', t.implementationTime ? `Tijd om in te voeren: ${schoon(t.implementationTime)}.` : ''].filter(Boolean).join(' '),
    (t.benefits || []).length ? 'Voordelen: ' + t.benefits.map(b => schoon(b).replace(/\.$/, '')).join('; ') + '.' : '',
    sec['onderbouwing'] ? 'Onderbouwing: ' + sec['onderbouwing'] : '',
  ].filter(Boolean).join('\n');
  return {
    id: ('tint-' + slug).replace(/[^a-z0-9_-]/g, '-').slice(0, 64),
    doc: {
      naam: schoon(t.title),
      categorie, knelpunten, dimensies,
      omschrijving: sec['wat-doet-het'] || sec['wat-is-het'] || schoon(t.subtitle),
      leveranciers, prijs, bron,
      // Volledige tekst van de website, voor later gebruik (niet zichtbaar in de editor).
      tint: {
        slug: t.slug, ondertitel: schoon(t.subtitle), aspect: t.aspect, themas: t.themes || [],
        watIsHet: sec['wat-is-het'] || '', watDoetHet: sec['wat-doet-het'] || '', geschiktWerk: sec['geschikt-werk'] || '',
        doelgroep: sec['doelgroep'] || '', implementatie: sec['implementatie'] || '', contraIndicaties: sec['contra-indicaties'] || '',
        onderbouwing: sec['onderbouwing'] || '', praktijk: sec['praktijk'] || '', voordelen: (t.benefits || []).map(schoon),
        volwassenheid: t.maturity || '', invoertijd: schoon(t.implementationTime), bijgewerktOpWebsite: t.updatedAt || '',
      },
      bronTint: true,
      aangemaakt: new Date().toISOString(),
    },
  };
}

(async () => {
  const bron = process.argv[2] || BASE;
  const html = /^https?:/.test(bron) ? await (await fetch(bron)).text() : fs.readFileSync(bron, 'utf8');
  const techs = techsUitHtml(html);
  const items = techs.map(omzetten);
  const nieuw = items.filter(x => !INDELING[x.doc.tint.slug.toLowerCase()]);
  const out = { bron: BASE, opgehaald: new Date().toISOString().slice(0, 10), technologieen: Object.fromEntries(items.map(x => [x.id, x.doc])) };
  const file = path.join(__dirname, '..', 'lib', 'seed-menukaart.json');
  fs.writeFileSync(file, JSON.stringify(out, null, 1) + '\n');
  console.log(`${items.length} technologieën geschreven naar ${path.relative(process.cwd(), file)}`);
  if (nieuw.length) console.log('Nog niet ingedeeld (standaardindeling gebruikt, graag nalopen):\n- ' + nieuw.map(x => x.doc.naam).join('\n- '));
})().catch(e => { console.error(e.message); process.exit(1); });
