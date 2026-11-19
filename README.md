# TINT Impactmonitor

Webtool voor TINT Achterhoek (Technohub Inclusieve Technologie) om de impact van inclusieve technologie bij deelnemende werkgevers te meten en te rapporteren. Zelfstandige webapp: Node.js-server met SQLite-opslag, live updates tussen gebruikers en inloggen met wachtwoord. Geen externe npm-pakketten, geen build-stap. De interface is vanilla JavaScript in `public/index.html`.

Oorspronkelijke versie (claude.ai-artifact): https://claude.ai/artifact/C7GGUanpztkimt7GCLSqsk

## Starten

Vereist Node.js 22.13 of nieuwer.

```bash
APP_PASSWORD='kies-een-sterk-wachtwoord' npm start
```

Open http://localhost:3000. Zonder `APP_PASSWORD` draait de app zonder inlog (alleen voor lokaal testen).

Met Docker:

```bash
echo "APP_PASSWORD=kies-een-sterk-wachtwoord" > .env
docker compose up -d --build
```

### Instellingen (omgevingsvariabelen)

| Variabele | Standaard | Betekenis |
|---|---|---|
| `APP_PASSWORD` | leeg | Gedeeld wachtwoord voor alle gebruikers. Wijzigen logt iedereen uit. |
| `PORT` | 3000 | Poort van de server |
| `DATA_DIR` | `./data` | Map met de database (`impactmonitor.db`) en de sessiesleutel |
| `COOKIE_SECURE` | false | Zet op `true` zodra de app via https draait |
| `SESSION_DAYS` | 30 | Hoe lang iemand ingelogd blijft |
| `SESSION_SECRET` | automatisch | Optioneel; anders aangemaakt in `DATA_DIR/.session-secret` |

### Online zetten

Elke host die Node of Docker draait en een blijvende schijf heeft werkt, bijvoorbeeld een VPS, Fly.io, Railway of Render (met persistent volume op `/data`). Zet er altijd https voor (bijv. Caddy, nginx of de host zelf) en stel dan `COOKIE_SECURE=true` in. Draait de app achter nginx, zet dan buffering uit voor `/api/events` (live updates).

### Back-ups

- In de app: Overzicht → "Back-up (JSON)" downloadt alle gegevens.
- Op de server: `npm run backup` maakt een kopie van de database in `data/backups/` (ook veilig terwijl de app draait). Plan dit dagelijks via cron.
- Terugzetten of overzetten van gegevens: `POST /api/import` met de JSON-back-up (ingelogd). Bestaande documenten met dezelfde id worden overschreven.

## Architectuur

```
server.js          HTTP-server: inlog, REST-API, live updates (SSE), statische bestanden
public/index.html  De volledige interface (meetinstrument, editors, rapporten)
public/store.js    Opslaglaag in de browser met dezelfde interface als de claude.ai-db
public/login.html  Inlogscherm
scripts/backup.js  Databaseback-up
```

API (alles vereist een geldige sessie):

| Methode | Pad | Doel |
|---|---|---|
| GET | `/api/{collectie}` | Alle documenten van een collectie |
| PUT | `/api/{collectie}/{id}` | Document opslaan (volledig vervangen) |
| DELETE | `/api/{collectie}/{id}` | Document verwijderen |
| GET | `/api/events` | Live wijzigingen (Server-Sent Events) |
| GET | `/api/export` | Alle gegevens als JSON |
| POST | `/api/import` | JSON-back-up inlezen |

Bij gelijktijdig bewerken van hetzelfde document wint de laatste opslag, net als in de artifact-versie.

## Doel en KPI's

1. **Impactmeting** per bedrijf en per toepassing, in vier fasen: nulmeting, impacthypothese, implementatie en borging, tweede meting en impactanalyse. Resultaat: impactrapport per bedrijf, leerpunten voor opschaling, input voor beleid.
2. **Inventarisatie** van de huidige inzet van en kennis over inclusieve technologie bij Achterhoekse werkgevers (ook bedrijven zonder voucher).
3. **Menukaart**: welke inclusieve technologie er is en wie die in de Achterhoek gebruikt.

Opdrachtgever/context: regionaal beraad Achterhoek wil KPI's die gericht zijn op het effect van technologie op de werkvloer voor inwoners, ondernemers en de Achterhoekse economie. Kennispartners (HAN, Saxion, Graafschap College) werken de impact-as nog verder uit.

## Meetinstrument

Vijf dimensies (startset, nog af te stemmen met kennispartners), gedefinieerd in de constante `DIMS` bovenin het script:

| Dimensie | Uitspraken (schaal 1-5) | Kwantitatieve indicatoren |
|---|---|---|
| Inzetbaarheid | i1, i2 | q_kunnen, q_doelgroep, q_verzuim |
| Zelfstandigheid | z1, z2 | q_begeleiding, q_inwerk |
| Productiviteit | p1, p2 | q_output, q_doorloop |
| Kwaliteit & veiligheid | k1, k2 | q_fouten, q_incident |
| Welzijn | w1, w2, w3 | – |

- Scores zijn een groepsbeeld van werkgever en medewerkers, vastgelegd door de TINT-adviseur tijdens het gesprek.
- Per kwantitatieve indicator staat of lager beter is (vierde element in de array).
- Twee soorten nulmeting: `modus: "nieuw"` (vooraf) of `modus: "terugblik"` (technologie al in gebruik, situatie van vóór achteraf vastgesteld). Het rapport vermeldt dat expliciet.
- Economische impact: tijdsbesparing (uur/week) × loonkosten per uur × werkweken (standaard 46) + overige besparing; terugverdientijd = investering / jaarlijkse besparing.

## Datamodel

Opgeslagen als JSON-documenten in SQLite (tabel `docs`: coll, id, data, updated), gedeeld tussen alle ingelogde gebruikers. Vier collecties:

- `bedrijven/{id}`: naam, plaats, sector, omvang, contact, voucher, voucherbedrag, toestemming (mag op menukaart genoemd worden), notities, voorbeeld (bool)
- `trajecten/{id}`: bedrijfId, techId, techOmschrijving, taak, modus, kennisinstelling,
  `nul` en `na` {datum, aanwezig, medewerkers, scores{}, kwant{}, proces/knelpunten (nul), veranderd (na)},
  `hyp` {betrokkenen, dims{dimKey:{verwachting, toel}}, kpis[]},
  `impl` {datumStart, investering, voucher, training, proces, gebruikers, gebruik, adoptie, gebruiksdata, knelpunten, verslag},
  `analyse` {tijdUren, uurkosten, weken, overigEuro, econToel, sociaal, leerpunten, beleid}
- `inventarisaties/{id}`: bedrijfId, datum, wijze, door, respondent, gebruikt_ja, gebruikt[], bekendheid, knelpunten[], afstand, interesse[], belemmeringen[], vervolg, toestemming, opmerkingen
- `technologieen/{id}`: naam, categorie, omschrijving, knelpunten[], dimensies[], leveranciers, prijs, bron

Fase van een traject wordt afgeleid (functie `fase()`), niet opgeslagen.

## Huisstijl

Volgt de huisstijl van TINT Achterhoek (https://www.tint-achterhoek.nl/huisstijl/). Alle kleuren staan als CSS-variabelen in het `:root`-blok bovenaan `index.html`.

| Naam | HEX | Gebruik volgens huisstijl | Gebruik in de tool |
|---|---|---|---|
| Paars | #604ce2 | Hoofdkleur: knoppen, links, accenten | `--accent`: knoppen, balken, bovenrand |
| Donkerpaars | #4f3bc7 | Tekst op lichte vlakken | `--accent-text`: koppen, links, cijfers |
| Groen | #25e579 | Accentkleur | Actieve tab, afgeronde fasen, focusrand |
| Lavendel | #f3f0ff | Lichte vlakken en achtergronden | `--bg`: paginakleur |
| Amber | #fdb93b | Meldingen, spaarzaam gebruiken | Meldingen en terugblik-markering |
| Inkt | #1f1d2b | Tekst en donkere vlakken | `--ink`, achtergrond donkere modus |

- Lettertype: Manrope (Google Fonts), koppen 800, broodtekst 400.
- Regel uit de huisstijl: paars is de hoofdkleur, groen het accent, de rest ondersteunt.
- Het logo is nog niet opgenomen; de kop toont nu de naam als tekst. Download de SVG (kleur) van de huisstijlpagina en plaats die als inline SVG of als eigen bestand in de kop. Niet vervormen of verkleuren, ruimte eromheen laten. Gebruik de witte variant alleen op donkere vlakken.
- Groen (#25e579) heeft te weinig contrast als tekstkleur op wit; gebruik het alleen als vlak of rand met inkt-tekst erop.

## Belangrijk voor verdere ontwikkeling

- `public/store.js` biedt dezelfde interface als de oorspronkelijke claude.ai-opslag (`collection().doc().set/delete`, `onSnapshot`). Wil je later naar een andere backend (Supabase, Firebase), dan hoeft alleen dat bestand te veranderen.
- Gegevens uit de oude artifact-versie overzetten: exporteer de collecties als JSON in de vorm `{"bedrijven":{id:{...}}, "trajecten":{...}, ...}` en lees die in via `POST /api/import`.
- Schrijfstijl in de interface: Nederlands, geen lange gedachtestreepjes, geen vakjargon richting werkgevers.

## Open punten

- Uitspraken en indicatoren per dimensie laten valideren door HAN/Saxion.
- QuickScan beoordelen als instrument voor de nulmeting en eventueel integreren.
- Menukaart aanvullen met leveranciers en prijsindicaties uit de TINT-praktijk.
- Medewerkersvragenlijst via een link (nu alleen groepsbeeld via de adviseur).
- Persoonlijke accounts in plaats van één gedeeld wachtwoord, als er meer partijen gaan invoeren.
