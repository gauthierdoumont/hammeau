---
name: "temps-et-rappels"
description: "Tout ce qui dépend du temps dans ses applis : jour logique, heure d'été/hiver, séries et rattrapage testés sous node, notifications locales Android, lecture d'un agenda iCal (Google)."
---

# Temps, séries, notifications et agenda

## Quand l'utiliser
- Hameau : étapes 6 (jour logique, rattrapage), 14 (notifications), 15a/15b (iCal), 17 (examens).
- Toute appli avec jours, séries, rappels ou calendrier.
- **Le CLAUDE.md du projet prime** sur ce skill.

Pourquoi un skill dédié : les bugs de dates sont invisibles en test rapide et apparaissent une nuit de changement d'heure ou après une semaine d'absence. Tout ici est donc testable dans node.

## 1. Une seule horloge
`www/temps.js` (export double navigateur + node, comme `moteur.js`). Aucune autre partie du code n'appelle `new Date()` pour décider d'un jour.
```js
function maintenant() {
  if (!NATIF) { const d = localStorage.getItem('debug_maintenant'); if (d) return new Date(d); }
  return new Date();
}
```
Pourquoi : dans le navigateur, on peut simuler « dimanche 29 mars à 3 h 30 » ; sur le téléphone, impossible de dérégler l'horloge par erreur.

## 2. Jour logique (jours = chaînes `AAAA-MM-JJ`)
Code vérifié (y compris nuits de changement d'heure) :
```js
const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Brussels',
  year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' });
function partiesLocales(instant) {
  const p = Object.fromEntries(fmt.formatToParts(instant).map(x => [x.type, x.value]));
  return { jour: `${p.year}-${p.month}-${p.day}`, heure: +p.hour };
}
function ajouterJours(jour, n) {             // calcul de CALENDRIER, pas d'instant
  const [a, m, j] = jour.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, j + n)).toISOString().slice(0, 10);
}
function jourIso(jour) {                      // 1 = lundi … 7 = dimanche
  const [a, m, j] = jour.split('-').map(Number);
  return (new Date(Date.UTC(a, m - 1, j)).getUTCDay() + 6) % 7 + 1;
}
function jourLogique(instant, bascule = CONFIG.jour.heureBascule) {   // 4
  const { jour, heure } = partiesLocales(instant);
  return heure < bascule ? ajouterJours(jour, -1) : jour;
}
```
- Pourquoi UTC dans `ajouterJours` : UTC n'a pas d'heure d'été, donc « +1 jour » est toujours exact. On manipule des dates, jamais des millisecondes.
- Les chaînes se comparent directement (`'2026-03-28' < '2026-03-29'`).
- Jours des quotidiennes stockés en 1-7 (lundi = 1), comme la semaine belge.

## 3. Rattrapage : fonction pure, réversible, idempotente
`rattraper(etat, instant, CONFIG) → { etat, evenements }` — ne modifie pas l'objet reçu.
- **Clôture de « hier »** : la saisie pour la veille est permise tant que hier n'est pas clôturé. Hier est clôturé dès que midi du jour logique actuel est passé :
```js
const { jour: civil, heure } = partiesLocales(instant);
const aujourdhui = jourLogique(instant);
const hierCloture = civil !== aujourdhui || heure >= 12;   // après minuit = forcément après midi
const limite = hierCloture ? ajouterJours(aujourdhui, -1) : ajouterJours(aujourdhui, -2);
```
  Avantage : une saisie rétroactive ne tombe jamais sur un jour déjà traité → pas de recalcul.
- Traiter chaque jour de `dernierJourTraite + 1` à `limite`, dans l'ordre du CLAUDE.md, puis `dernierJourTraite = limite`.
- 1er lancement : `dernierJourTraite = hier` (rien à rattraper).
- **Chaque pénalité = un événement réversible** stocké `{ jour, type, avant: {moral, serie, joker}, details }` (garder 8 jours). Pause rétroactive depuis le jour D : annuler les événements ≥ D (valeurs `avant`, ressources rendues, bâtiment réparé), remettre `dernierJourTraite = D − 1`, relancer `rattraper`.
- Les événements renvoyés alimentent l'écran neutre de retour (ton : skill `moteur-recompenses`).

## 4. Tests (`tests/jours.test.js`, node:test, aucune dépendance)
```js
// tests/jours.test.js — Hameau — Créé par Gauthier Doumont
const test = require('node:test');
const assert = require('node:assert/strict');
globalThis.window = globalThis;
require('../www/config.js');
const T = require('../www/temps.js');

test('bascule à 4 h (heure d\'hiver)', () => {
  assert.equal(T.jourLogique(new Date('2026-11-15T02:59:00Z')), '2026-11-14'); // 03:59
  assert.equal(T.jourLogique(new Date('2026-11-15T03:00:00Z')), '2026-11-15'); // 04:00
});
```
`package.json` : `"test": "node --test \"tests/**/*.test.js\""`. Dans le workflow GitHub, ajouter `- run: npm test` juste après `npm ci` → un APK cassé ne part jamais.

Instants de référence (vérifiés, Europe/Brussels) :
| Instant UTC | Heure locale | Jour logique |
|---|---|---|
| 2026-03-29T01:59Z | 03:59 (été) | 2026-03-28 |
| 2026-03-29T02:00Z | 04:00 (été) | 2026-03-29 |
| 2026-10-25T00:30Z | 02:30 (été) | 2026-10-24 |
| 2026-10-25T01:30Z | 02:30 (hiver, heure répétée) | 2026-10-24 |
| 2026-10-25T03:00Z | 04:00 (hiver) | 2026-10-25 |
| 2027-01-01T02:00Z | 03:00 | 2026-12-31 |

Cas obligatoires (CLAUDE.md + pièges) :
- [ ] 0, 1 et 10 jours manqués ; 60 jours d'absence (rapide, message neutre)
- [ ] nuits de changement d'heure (tableau ci-dessus) ; passage d'année
- [ ] lundi franchi → joker remis à 1, même si plusieurs lundis franchis
- [ ] jour sans quotidienne prévue = neutre ; jour < 30 XP = non validé
- [ ] pause (normale et rétroactive après pénalités) ; incendie appliqué une seule fois
- [ ] saisie de la veille à 11:59 acceptée, à 12:00 refusée
- [ ] **idempotence** : `rattraper` deux fois de suite = même état

## 5. Notifications locales (V3)
- `npm i @capacitor/local-notifications && npx cap sync android`.
- **Permission** : écran d'explication d'abord, puis `PL.LocalNotifications.requestPermissions()`. Refus → expliquer où l'activer, un seul rappel maximum, jamais d'insistance.
- **Petite icône** obligatoire, sinon carré blanc : PNG blanc sur fond transparent dans `android/app/src/main/res/drawable/ic_stat_hameau.png`, puis dans `capacitor.config.json` : `"plugins": { "LocalNotifications": { "smallIcon": "ic_stat_hameau", "iconColor": "#E8A33D" } }`.
- **Contenu calculé par une fonction pure** `construireNotifications(etat, instant, CONFIG)` (testable dans node, avec `process.env.TZ = 'Europe/Brussels'` en tête du fichier de test).
- **IDs fixes** : 1-7 matin (J0 à J6), 11-17 soir, 1000+ échéances.
- **Reprogrammer** à chaque ouverture et à chaque tâche cochée :
```js
async function replanifier(etat) {
  if (!PL.LocalNotifications) return;
  const { notifications: enAttente } = await PL.LocalNotifications.getPending();
  if (enAttente.length) await PL.LocalNotifications.cancel({ notifications: enAttente });
  const liste = construireNotifications(etat, maintenant(), CONFIG)
    .filter(n => n.schedule.at > new Date(Date.now() + 60000));   // jamais dans le passé
  if (liste.length) await PL.LocalNotifications.schedule({ notifications: liste });
}
// n = { id, title, body, schedule: { at: new Date(a, m - 1, j, 8, 0), allowWhileIdle: true } }
```
- Aujourd'hui et demain : contenu précis. J+2 à J+6 : texte générique positif (au cas où l'appli n'est pas rouverte).
- Soir : seulement s'il reste des quotidiennes, formulé en gain (« 2 quotidiennes et ta série passe à 6 🔥 »). Mode pause : aucune notification.
- Tap sur la notification : `addListener('localNotificationActionPerformed', …)` → écran Aujourd'hui.
- Pas de demande d'« alarme exacte » : quelques minutes de décalage sont acceptées.
- À dire à Gauthier : désactiver l'optimisation de batterie pour l'appli (MagicOS). Chemin variable selon la version : chercher « Lancement des applications » dans les Paramètres → gestion manuelle, tout activer.
- Bouton « Tester une notification dans 10 s » dans Réglages.

## 6. Agenda iCal (V3)
**ical.js** : `npm i -D ical.js`, copier `node_modules/ical.js/dist/ical.es5.min.cjs` vers `www/lib/ical.min.js` (build UMD : `<script>` classique, expose `window.ICAL`, et marche aussi avec `require` dans node). Licence MPL-2.0 dans `LICENCES.md`.

Téléchargement (jamais l'adresse dans le code, le dépôt, les logs ou l'export) :
```js
async function telechargerIcs(url) {
  url = url.trim().replace(/^webcal:\/\//i, 'https://');
  const http = window.Capacitor?.Plugins?.CapacitorHttp;
  if (!NATIF || !http) throw new Error("Agenda : seulement dans l'appli installée");
  const r = await http.get({ url, responseType: 'text', connectTimeout: 15000, readTimeout: 15000 });
  const txt = String(r.data ?? '');
  if (r.status !== 200 || !txt.includes('BEGIN:VCALENDAR')) throw new Error('Adresse invalide ou agenda inaccessible');
  return txt;
}
```
Lecture (vérifiée avec ical.js 2.x) :
```js
function lireEvenements(txt, fin) {
  const comp = new ICAL.Component(ICAL.parse(txt));
  comp.getAllSubcomponents('vtimezone').forEach(tz => ICAL.TimezoneService.register(tz));
  const vevents = comp.getAllSubcomponents('vevent');
  const exceptions = vevents.filter(v => v.hasProperty('recurrence-id'));
  const res = [];
  const ajouter = (debut, finEv, item) => res.push({
    uid: item.uid, titre: item.summary, lieu: item.location || '', journee: debut.isDate,
    debut: debut.isDate ? debut.toString() : debut.toJSDate().toISOString(),   // journée entière : date telle quelle
    fin: finEv ? (finEv.isDate ? finEv.toString() : finEv.toJSDate().toISOString()) : null });
  for (const v of vevents) {
    if (v.hasProperty('recurrence-id') || v.getFirstPropertyValue('status') === 'CANCELLED') continue;
    const ev = new ICAL.Event(v);
    exceptions.filter(x => x.getFirstPropertyValue('uid') === ev.uid)
      .forEach(x => ev.relateException(new ICAL.Event(x)));
    if (!ev.isRecurring()) { ajouter(ev.startDate, ev.endDate, ev); continue; }
    const it = ev.iterator();
    for (let t, n = 0; (t = it.next()) && n < 2000; n++) {     // garde-fou anti-boucle
      const d = ev.getOccurrenceDetails(t);
      if (d.startDate.toJSDate() > fin) break;
      ajouter(d.startDate, d.endDate, d.item);
    }
  }
  return res;
}
```
- Cache (`reglages.calendrierCache`) : les événements de J−1 à J+120 (pas le fichier brut) + date de chargement. Afficher le cache tout de suite, actualiser en arrière-plan, mention discrète « Mis à jour à 10:42 » ou « Hors ligne — version du 12/11 ».
- « J'y étais » : une fois par occurrence (clé `uid + debut`), après l'heure de début.
- **Examens** (mots entiers, sans accents ni majuscules → « Attestation » n'est pas un examen, « Interrogation » oui) :
```js
const sansAccents = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const estExamen = titre => /\b(examens?|exams?|interro\w*|tests?)\b/.test(sansAccents(titre));
```
  Marquage manuel prioritaire, stocké par `uid + debut`.

### `tests/exemple.ics` (fins de ligne CRLF)
Contient : VTIMEZONE Europe/Brussels · cours hebdo `RRULE:FREQ=WEEKLY;COUNT=6` dès le lundi 19/10/2026 08:30 (`TZID`) qui traverse le passage à l'heure d'hiver · `EXDATE` le 02/11 · une occurrence déplacée par `RECURRENCE-ID` le 09/11 à 13:30 · un `SUMMARY` replié sur 2 lignes · « Interrogation Consolidation » le 20/11 en UTC (`Z`) · un congé `VALUE=DATE` le 11/11.
Résultat attendu : 5 cours (19/10 06:30Z, 26/10 07:30Z, 09/11 12:30Z, 16/11 07:30Z, 23/11 07:30Z), l'interro détectée comme examen, le congé en journée entière `2026-11-11`.

## Check-list
- [ ] Aucun `new Date()` de décision hors `temps.js` ; aucun calcul de jour en millisecondes
- [ ] `npm test` vert, lancé aussi par le workflow
- [ ] Rattrapage idempotent et pénalités réversibles
- [ ] Notifications reprogrammées à l'ouverture et à chaque coche, jamais dans le passé, petite icône OK
- [ ] Adresse iCal absente du code, du dépôt, des logs et de l'export (test d'export)
- [ ] Agenda lisible hors ligne via le cache

*Skill créé par Gauthier Doumont*