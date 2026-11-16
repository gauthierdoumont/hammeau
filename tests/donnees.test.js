// tests/donnees.test.js — Hameau — ne jamais perdre de données — Créé par Gauthier Doumont
// Lancer : npm test   (node:test, aucune dépendance). Données de test FICTIVES (dépôt public).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

globalThis.window = globalThis;
require('../www/config.js');
const S = require('../www/stockage.js');
const C = globalThis.CONFIG;

const fixtureV1 = () => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'etat-v1.json'), 'utf8'));
const fixtureV2 = () => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'etat-v2.json'), 'utf8'));
const sansMeta = ({ meta, ...reste }) => reste;

test('état initial : valide, 33 catégories, moral de départ, aucune ressource', () => {
  const e = S.etatInitial(C);
  assert.equal(S.verifier(e), true);
  assert.equal(e.schemaVersion, S.SCHEMA);
  assert.equal(e.categories.length, C.categoriesDepart.length);
  assert.equal(e.joueur.moral, C.moral.depart);
  assert.equal(e.joueur.niveau, 1);
  assert.ok(Object.values(e.joueur.ressources).every(v => v === 0));
  assert.deepEqual(Object.keys(e.joueur.gagneTotal), C.familles.map(f => f.id));
});

test('config : chaque catégorie de départ a une famille connue et un id unique', () => {
  const familles = new Set(C.familles.map(f => f.id));
  const ids = new Set();
  for (const c of C.categoriesDepart) {
    assert.ok(familles.has(c.familleId), c.id);
    assert.ok(!ids.has(c.id), 'doublon ' + c.id);
    ids.add(c.id);
  }
  for (const f of C.familles) if (f.ressource) assert.ok(C.ressources.some(r => r.id === f.ressource), f.id);
});

test('fixture v1 → dernière version : aucune donnée perdue', () => {
  const avant = fixtureV1();
  const apres = S.completer(S.migrer(avant), C);
  S.verifier(apres);
  assert.deepEqual(apres.taches, avant.taches);
  assert.deepEqual(apres.journal, avant.journal);
  assert.deepEqual(apres.categories, avant.categories);
  assert.deepEqual(apres.joueur.ressources, avant.joueur.ressources);
  assert.equal(apres.joueur.xpTotal, avant.joueur.xpTotal);
  assert.equal(apres.schemaVersion, S.SCHEMA);
  assert.deepEqual(apres.village, { batiments: [], extensions: 0, decorations: [] });   // v2 : village vide ajouté
});

test('migrer un état déjà à jour = inchangé, et ne modifie pas l\'objet reçu', () => {
  const e = fixtureV2();
  const copie = structuredClone(e);
  assert.deepEqual(S.migrer(e), copie);
  assert.deepEqual(e, copie);
});

test('completer : remplit un champ manquant sans rien remplacer, garde les champs inconnus', () => {
  const e = fixtureV1();
  delete e.reglages.vibrations;
  delete e.joueur.pause;
  e.champFutur = { a: 1 };
  e.joueur.inconnu = 'x';
  const r = S.completer(e, C);
  assert.equal(r.reglages.vibrations, true);
  assert.deepEqual(r.joueur.pause, { actif: false, depuis: null, jusqua: null });
  assert.deepEqual(r.champFutur, { a: 1 });
  assert.equal(r.joueur.inconnu, 'x');
  assert.equal(r.joueur.moral, 82);
  assert.equal(r.reglages.derniereCategorie, 'lecture');
});

test('decider : texte illisible → aucun état neuf proposé (rien ne sera écrit)', () => {
  const d = S.decider('{"schemaVersion":1,"joueur":', C);
  assert.equal(d.type, 'illisible');
  assert.equal(d.etat, undefined);
  assert.equal(S.decider('"juste une chaîne"', C).type, 'illisible');
});

test('decider : rien de stocké → état neuf ; version plus récente → refus ; v1 → migration ; v2 → ok', () => {
  assert.equal(S.decider(null, C).type, 'neuf');
  assert.equal(S.decider(JSON.stringify({ ...fixtureV1(), schemaVersion: S.SCHEMA + 1 }), C).type, 'trop-recent');
  const d1 = S.decider(JSON.stringify(fixtureV1()), C);
  assert.equal(d1.type, 'ok');
  assert.equal(d1.aMigrer, true);                    // → app.js fait une copie de sécurité avant de sauver
  const d2 = S.decider(JSON.stringify(fixtureV2()), C);
  assert.equal(d2.aMigrer, false);
  assert.equal(d2.etat.village.batiments.length, 2);
});

test('village : deux bâtiments du même type, niveau 6 ou case invalide → refusé', () => {
  const casser = (f) => { const e = fixtureV2(); f(e); return () => S.verifier(e, C); };
  assert.throws(casser(e => { e.village.batiments[1].type = 'mairie'; }), /deux mairie/);
  assert.throws(casser(e => { e.village.batiments[0].niveau = 6; }), /niveau/);
  assert.throws(casser(e => { e.village.batiments[0].x = 1.5; }), /case/);
});

test('decider : données incohérentes → écran de récupération, pas d\'écrasement', () => {
  const e = fixtureV1();
  e.joueur.ressources.or = -5;
  assert.equal(S.decider(JSON.stringify(e), C).type, 'illisible');
});

test('verifier rejette NaN, Infinity, ressource négative, id en double, niveau 0', () => {
  const casser = (f) => { const e = fixtureV1(); f(e); return () => S.verifier(e); };
  assert.throws(casser(e => { e.joueur.xp = NaN; }), /nombre invalide/);
  assert.throws(casser(e => { e.journal[0].gains.xp = Infinity; }), /nombre invalide/);
  assert.throws(casser(e => { e.joueur.ressources.savoir = -1; }), /négative/);
  assert.throws(casser(e => { e.taches[1].id = 't1'; }), /double/);
  assert.throws(casser(e => { e.joueur.niveau = 0; }), /niveau/);
  assert.throws(casser(e => { e.joueur.moral = 120; }), /moral/);
});

test('export : jamais l\'adresse iCal, avec meta', () => {
  const ex = S.pourExport(fixtureV1(), '2026-11-15T10:00:00.000Z', '0.2.0');
  assert.equal('icsUrl' in ex.reglages, false);
  assert.ok(!JSON.stringify(ex).includes('agenda-fictif'));
  assert.deepEqual(ex.meta, { appli: S.CLE, appVersion: '0.2.0', exporteLe: '2026-11-15T10:00:00.000Z' });
});

test('export → import = même état (hors meta), adresse iCal de l\'appareil conservée', () => {
  const original = fixtureV2();
  const texte = JSON.stringify(S.pourExport(original, '2026-11-15T10:00:00.000Z', '0.2.0'));
  const surAppareil = S.etatInitial(C);
  surAppareil.reglages.icsUrl = 'https://exemple.invalid/autre.ics';
  const r = S.analyserImport(texte, surAppareil, C);
  assert.equal(r.ok, true);
  const attendu = S.completer(original, C);              // (les champs ajoutés depuis sont complétés)
  assert.deepEqual(sansMeta(r.etat), { ...attendu, reglages: { ...attendu.reglages, icsUrl: 'https://exemple.invalid/autre.ics' } });
  assert.deepEqual(r.apercu, { niveau: 1, xpTotal: 26, taches: 2, saisies: 2, exporteLe: '2026-11-15T10:00:00.000Z' });
  assert.deepEqual(r.actuel, { niveau: 1, xpTotal: 0, taches: 0, saisies: 0 });
});

test('import refusé : version plus récente, fichier étranger, JSON abîmé, données incohérentes', () => {
  const actuel = S.etatInitial(C);
  const plusRecent = JSON.stringify({ ...fixtureV1(), schemaVersion: S.SCHEMA + 1 });
  assert.match(S.analyserImport(plusRecent, actuel, C).message, /plus récente/);
  assert.match(S.analyserImport('{"nom":"autre appli","liste":[]}', actuel, C).message, /ne vient pas de Hameau/);
  assert.match(S.analyserImport('pas du json', actuel, C).message, /ne vient pas de Hameau/);
  const abime = fixtureV1(); abime.joueur.ressources.or = -3;
  assert.match(S.analyserImport(JSON.stringify(abime), actuel, C).message, /abîmé/);
});

test('import depuis l\'écran de récupération (aucun état actuel)', () => {
  const r = S.analyserImport(JSON.stringify(S.pourExport(fixtureV1(), '2026-11-15T10:00:00.000Z')), null, C);
  assert.equal(r.ok, true);
  assert.equal(r.actuel, null);
  assert.equal(r.etat.reglages.icsUrl, '');
});

test('sauvegardes hebdo : nom = lundi de la semaine ; on garde les plus récentes', () => {
  assert.equal(S.nomHebdo('2026-11-15'), 'hebdo-2026-11-09'); // dimanche
  assert.equal(S.nomHebdo('2026-11-16'), 'hebdo-2026-11-16'); // lundi
  assert.equal(S.nomHebdo('2027-01-01'), 'hebdo-2026-12-28'); // changement d'année
  assert.equal(S.nomHebdo('2026-03-29'), 'hebdo-2026-03-23'); // nuit du passage à l'heure d'été
  const noms = ['hebdo-2026-10-19', 'hebdo-2026-11-02', 'hebdo-2026-10-26', 'hebdo-2026-11-09', 'hebdo-2026-10-12', 'avant-x'];
  assert.deepEqual(S.aSupprimer(noms, 'hebdo-', 4), ['hebdo-2026-10-12']);
  assert.deepEqual(S.aSupprimer(noms, 'avant-', 5), []);
});

test('nouvelId : ids différents', () => {
  const ids = new Set(Array.from({ length: 200 }, () => S.nouvelId()));
  assert.equal(ids.size, 200);
});

/* ===== Étape 8 : sauvegardes automatiques, restauration, rappel d'export ===== */
test('sauvegardes : noms décrits et triés (plus récentes d\'abord), noms inconnus ignorés', () => {
  const l = S.listeSauvegardes(['hebdo-2026-11-09', 'avant-2026-11-16T09-30-00-import', 'hebdo-2026-11-16', 'n-importe-quoi',
    'avant-2026-11-16T08-00-00-migration-v2']);
  assert.deepEqual(l.map(x => x.nom), ['avant-2026-11-16T09-30-00-import', 'avant-2026-11-16T08-00-00-migration-v2',
    'hebdo-2026-11-16', 'hebdo-2026-11-09']);
  assert.equal(l[0].quand, '2026-11-16T09:30:00.000Z');
  assert.equal(l[0].raison, 'import');
  assert.equal(S.libelleRaison('migration-v2'), 'avant une mise à jour des données');
  assert.equal(S.libelleRaison('restauration'), 'avant une restauration');
  assert.equal(S.decrireSauvegarde('hebdo-2026-11-16').type, 'hebdo');
});

test('restaurer : garde l\'adresse iCal du téléphone et ne rejoue pas les jours déjà traités', () => {
  const ancienne = S.etatInitial(C);
  ancienne.joueur.niveau = 3;
  ancienne.etat.dernierJourTraite = '2026-11-09';
  ancienne.reglages.icsUrl = 'https://exemple.invalid/ancien.ics';
  const actuel = S.etatInitial(C);
  actuel.etat.dernierJourTraite = '2026-11-15';
  actuel.reglages.icsUrl = 'https://exemple.invalid/actuel.ics';
  const r = S.preparerRestauration(JSON.stringify(ancienne), actuel, C);
  assert.equal(r.ok, true);
  assert.equal(r.etat.joueur.niveau, 3);
  assert.equal(r.etat.reglages.icsUrl, 'https://exemple.invalid/actuel.ics');
  assert.equal(r.etat.etat.dernierJourTraite, '2026-11-15');
  assert.equal(r.apercu.niveau, 3);
  assert.equal(S.verifier(r.etat, C), true);
});

test('restaurer : copie abîmée, vide ou trop récente → refus clair, rien ne change', () => {
  const actuel = S.etatInitial(C);
  const avant = JSON.stringify(actuel);
  assert.equal(S.preparerRestauration('{abîmé', actuel, C).ok, false);
  assert.equal(S.preparerRestauration(null, actuel, C).ok, false);
  assert.match(S.preparerRestauration(JSON.stringify({ ...actuel, schemaVersion: 99 }), actuel, C).message, /plus récente/);
  assert.equal(JSON.stringify(actuel), avant);
});

test('rappel d\'export : après N jours sans export (N dans config.js), jamais si rien à sauver', () => {
  const e = S.etatInitial(C);
  const N = C.donnees.rappelExportJours;
  const plus = (iso, jours) => new Date(Date.parse(iso) + jours * 86400000).toISOString();
  assert.equal(S.rappelExport(e, '2026-11-16T10:00:00.000Z', C), false);              // rien saisi
  e.journal.push({ id: 'j1', tacheId: 't', horodatage: '2026-11-01T10:00:00.000Z', jour: '2026-11-01', valeur: null, progression: 1, gains: {} });
  assert.equal(S.rappelExport(e, plus('2026-11-01T10:00:00.000Z', N - 1), C), false);
  assert.equal(S.rappelExport(e, plus('2026-11-01T10:00:00.000Z', N), C), true);
  e.reglages.dernierExport = plus('2026-11-01T10:00:00.000Z', N);
  assert.equal(S.rappelExport(e, plus('2026-11-01T10:00:00.000Z', N + 1), C), false);   // export récent
});
