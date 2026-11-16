// tests/notifications.test.js — Hameau — contenu et heures des rappels (étape 14) — Créé par Gauthier Doumont
process.env.TZ = 'Europe/Brussels';
const test = require('node:test');
const assert = require('node:assert/strict');

globalThis.window = globalThis;
require('../www/config.js');
const S = require('../www/stockage.js');
const T = require('../www/taches.js');
const M = require('../www/moteur.js');
const Tm = require('../www/temps.js');
const N = require('../www/notifications.js');
const C = globalThis.CONFIG;

// Lundi 16 novembre 2026, 10 h à Bruxelles (UTC+1)
const LUNDI_10H = new Date('2026-11-16T09:00:00Z');
function etatAvec(taches = []) {
  const e = S.etatInitial(C);
  taches.forEach((s, i) => T.ajouterTache(e, T.creerTache({ categorieId: 'lecture', ...s }, e, C, 't' + i, '2026-11-10T08:00:00.000Z').tache));
  return e;
}

test('heure locale de Bruxelles → instant, y compris les jours de changement d\'heure', () => {
  assert.equal(Tm.instantLocal('2026-11-16', '08:00', 'Europe/Brussels').toISOString(), '2026-11-16T07:00:00.000Z');  // hiver
  assert.equal(Tm.instantLocal('2026-07-01', '20:00', 'Europe/Brussels').toISOString(), '2026-07-01T18:00:00.000Z');  // été
  assert.equal(Tm.instantLocal('2026-03-29', '08:00', 'Europe/Brussels').toISOString(), '2026-03-29T06:00:00.000Z');  // jour du passage à l'été
  assert.equal(Tm.instantLocal('2026-10-25', '20:00', 'Europe/Brussels').toISOString(), '2026-10-25T19:00:00.000Z');  // jour du passage à l'hiver
});

test('matin et soir : IDs fixes, jamais dans le passé, une semaine d\'avance', () => {
  const e = etatAvec([{ nom: 'Lire', type: 'quotidienne' }]);
  const l = N.construire(e, LUNDI_10H, C);
  const matins = l.filter(n => n.type === 'matin'), soirs = l.filter(n => n.type === 'soir');
  assert.deepEqual(matins.map(n => n.id), [2, 3, 4, 5, 6, 7]);            // 8 h aujourd'hui est déjà passé
  assert.deepEqual(soirs.map(n => n.id), [11, 12, 13, 14, 15, 16, 17]);
  assert.equal(soirs[0].at, '2026-11-16T19:00:00.000Z');                    // 20 h à Bruxelles
  assert.equal(matins[0].at, '2026-11-17T07:00:00.000Z');
  assert.ok(l.every(n => Date.parse(n.at) > LUNDI_10H.getTime() + 60000));
  assert.equal(new Set(l.map(n => n.id)).size, l.length);
});

test('matin du lendemain : programme précis ; après : texte générique positif', () => {
  const e = etatAvec([{ nom: 'Lire', type: 'quotidienne' }, { nom: 'Rendre le rapport', categorieId: 'stage', echeance: '2026-11-17' }]);
  const l = N.construire(e, LUNDI_10H, C);
  const demain = l.find(n => n.id === 2);
  assert.match(demain.body, /1 quotidienne/);
  assert.match(demain.body, /Rendre le rapport/);
  assert.equal(l.find(n => n.id === 5).title, '☀️ Ton hameau t\'attend');
});

test('soir : seulement s\'il reste des quotidiennes, formulé en gain', () => {
  const e = etatAvec([{ nom: 'Lire', type: 'quotidienne' }, { nom: 'Courir', type: 'quotidienne', categorieId: 'course' }]);
  e.joueur.serie.jours = 5;
  let soir = N.construire(e, LUNDI_10H, C).find(n => n.id === 11);
  assert.equal(soir.body, 'Plus que 2 quotidiennes et ta série passe à 6 jours 🔥');
  for (const t of e.taches) M.saisir(e, t.id, null, { id: 'j' + t.id, horodatage: LUNDI_10H.toISOString(), jour: '2026-11-16' }, C);
  soir = N.construire(e, LUNDI_10H, C).find(n => n.id === 11);
  assert.equal(soir, undefined);                                           // tout est fait : pas de rappel ce soir
  assert.ok(N.construire(etatAvec(), LUNDI_10H, C).every(n => n.type !== 'soir'));   // aucune quotidienne
});

test('veille d\'échéance à l\'heure du soir ; aucun mot culpabilisant', () => {
  const e = etatAvec([{ nom: 'Rendre le rapport', categorieId: 'stage', echeance: '2026-11-18' }, { nom: 'Fait', echeance: '2026-11-19' }]);
  e.taches[1].archivee = true;
  const ech = N.construire(e, LUNDI_10H, C).filter(n => n.type === 'echeance');
  assert.equal(ech.length, 1);
  assert.equal(ech[0].id, 1000);
  assert.equal(ech[0].at, '2026-11-17T19:00:00.000Z');
  assert.equal(ech[0].title, '📌 Demain : Rendre le rapport');
  const tout = N.construire(etatAvec([{ nom: 'Lire', type: 'quotidienne' }, { nom: 'X', echeance: '2026-11-18' }]), LUNDI_10H, C);
  assert.ok(tout.every(n => !/\b(raté|échec|seulement|oublié|paresse|tu dois)\b/i.test(n.title + ' ' + n.body)));
});

test('réglages : rappel coupé (heure vide) → rien ; tout coupé → aucune notification', () => {
  const e = etatAvec([{ nom: 'Lire', type: 'quotidienne' }, { nom: 'X', echeance: '2026-11-18' }]);
  e.reglages.notifSoir = '';
  let l = N.construire(e, LUNDI_10H, C);
  assert.ok(l.every(n => n.type !== 'soir'));
  assert.equal(l.find(n => n.type === 'echeance').at, '2026-11-17T07:00:00.000Z');   // veille à l'heure du matin
  e.reglages.notifMatin = '';
  assert.deepEqual(N.construire(e, LUNDI_10H, C), []);
  e.reglages.notifMatin = '07:30';
  assert.equal(N.construire(e, LUNDI_10H, C)[0].at, '2026-11-17T06:30:00.000Z');
});

test('pause : aucun rappel pendant la pause (et toute la semaine si elle est sans fin)', () => {
  const e = etatAvec([{ nom: 'Lire', type: 'quotidienne' }, { nom: 'X', echeance: '2026-11-18' }]);
  e.joueur.pause = { actif: true, depuis: '2026-11-15', jusqua: null };
  assert.deepEqual(N.construire(e, LUNDI_10H, C), []);
  e.joueur.pause = { actif: true, depuis: '2026-11-15', jusqua: '2026-11-18' };
  const l = N.construire(e, LUNDI_10H, C);
  assert.ok(l.length > 0 && l.every(n => n.jour > '2026-11-18'));
});

test('à 2 h du matin, « aujourd\'hui » est encore la veille (jour logique)', () => {
  const e = etatAvec([{ nom: 'Lire', type: 'quotidienne' }]);
  const l = N.construire(e, new Date('2026-11-17T01:00:00Z'), C);           // mardi 2 h → jour logique lundi
  assert.equal(l.find(n => n.id === 2).at, '2026-11-17T07:00:00.000Z');   // matin de mardi = « demain » (id 2)
  assert.equal(l.find(n => n.id === 11), undefined);                        // le soir du lundi est passé
});

test('proposer d\'activer les rappels : 1re fois oui, puis une seule relance après quelques jours', () => {
  const t0 = new Date('2026-11-16T10:00:00Z');
  const plus = (j) => new Date(t0.getTime() + j * 86400000);
  assert.equal(N.proposerPermission(null, t0, C), true);
  const une = { fois: 1, dernier: t0.toISOString() };
  assert.equal(N.proposerPermission(une, plus(C.notifications.relanceJours - 1), C), false);
  assert.equal(N.proposerPermission(une, plus(C.notifications.relanceJours), C), true);
  assert.equal(N.proposerPermission({ fois: C.notifications.propositionsMax, dernier: t0.toISOString() }, plus(100), C), false);
});
