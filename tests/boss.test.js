// tests/boss.test.js — Hameau — examens = boss : révisions = dégâts, récompense le jour J — Créé par Gauthier Doumont
process.env.TZ = 'Europe/Brussels';
const test = require('node:test');
const assert = require('node:assert/strict');

globalThis.window = globalThis;
require('../www/config.js');
const S = require('../www/stockage.js');
const T = require('../www/taches.js');
const M = require('../www/moteur.js');
const B = require('../www/boss.js');
const C = globalThis.CONFIG;

// Agenda FICTIF : interro le vendredi 20/11 à 10 h, examen le lundi 23/11 à 9 h, un cours (pas un boss)
const EVS = [
  { uid: 'cours@exemple.invalid', titre: 'Cours de comptabilité', lieu: '', journee: false, debut: '2026-11-16T07:30:00.000Z', fin: null },
  { uid: 'interro@exemple.invalid', titre: 'Interrogation Consolidation', lieu: '', journee: false, debut: '2026-11-20T09:00:00.000Z', fin: null },
  { uid: 'exam@exemple.invalid', titre: 'Examen de fiscalité', lieu: '', journee: false, debut: '2026-11-23T08:00:00.000Z', fin: null }
];
function etat() {
  const e = S.etatInitial(C);
  e.reglages.icsUrl = 'https://agenda.exemple.invalid/x.ics';
  e.reglages.calendrierCache = { chargeLe: '2026-11-16T08:00:00.000Z', evenements: structuredClone(EVS) };
  return e;
}
let n = 0;
function reviser(e, jour, taille = 'grosse') {
  const id = 'r' + (++n);
  T.ajouterTache(e, T.creerTache({ nom: 'Réviser ' + id, categorieId: 'revision', taille }, e, C, id, '2026-11-01T08:00:00.000Z').tache);
  return M.saisir(e, id, null, { id: 's' + id, horodatage: jour + 'T10:00:00.000Z', jour }, C);
}

test('boss = examens de l\'agenda (titre ou marquage manuel), le plus proche d\'abord', () => {
  const e = etat();
  assert.deepEqual(B.liste(e, C).map(b => b.titre), ['Interrogation Consolidation', 'Examen de fiscalité']);
  e.agenda.examens['cours@exemple.invalid|2026-11-16T07:30:00.000Z'] = true;
  e.agenda.examens['exam@exemple.invalid|2026-11-23T08:00:00.000Z'] = false;
  assert.deepEqual(B.liste(e, C).map(b => b.titre), ['Cours de comptabilité', 'Interrogation Consolidation']);
});

test('apparition N jours avant, compte à rebours, encore là le jour J', () => {
  const e = etat();
  const a = B.actifs(e, '2026-11-16', C);
  assert.deepEqual(a.map(b => [b.titre, b.dans]), [['Interrogation Consolidation', 4], ['Examen de fiscalité', 7]]);
  assert.equal(a[0].apparition, '2026-11-06');
  assert.equal(B.actifs(e, '2026-11-20', C)[0].dans, 0);
  assert.equal(B.actifs(e, '2026-11-01', C).length, 0);           // trop tôt
});

test('chaque révision 📚 fait des dégâts au boss le plus proche, le surplus passe au suivant', () => {
  const e = etat();
  const r = reviser(e, '2026-11-16');                              // 50 × 1,2 = 60 XP
  let [interro, exam] = B.etats(e, C);
  assert.equal(interro.degats, r.gain);
  assert.equal(exam.degats, 0);
  while (B.etats(e, C)[0].pv > 0) reviser(e, '2026-11-17');
  [interro, exam] = B.etats(e, C);
  assert.equal(interro.vaincu, true);
  assert.equal(interro.pv, 0);
  assert.ok(exam.degats > 0 || interro.degats === interro.pvMax, 'surplus éventuel reporté');
  // Une tâche d'une autre catégorie ne frappe pas
  const f = etat();
  T.ajouterTache(f, T.creerTache({ nom: 'Courir', categorieId: 'course' }, f, C, 'c1', '2026-11-01T08:00:00.000Z').tache);
  M.saisir(f, 'c1', null, { id: 'x', horodatage: '2026-11-16T10:00:00.000Z', jour: '2026-11-16' }, C);
  assert.equal(B.etats(f, C)[0].degats, 0);
  // Une révision après l'examen ne frappe plus ce boss
  const g = etat();
  reviser(g, '2026-11-21');
  assert.equal(B.etats(g, C)[0].degats, 0);
  assert.ok(B.etats(g, C)[1].degats > 0);
});

test('récompense le jour J, une seule fois : complète si vaincu, une part sinon (jamais rien)', () => {
  const e = etat();
  const jourJ = '2026-11-20', avant = new Date('2026-11-20T08:00:00Z'), apres = new Date('2026-11-20T09:30:00Z');
  const cle = B.liste(e, C)[0].cle;
  assert.match(B.recuperer(e, cle, avant, jourJ, C).erreur, /jour de l'examen/);
  const r = B.recuperer(e, cle, apres, jourJ, C);
  assert.equal(r.ok, true);
  assert.equal(r.vaincu, false);
  assert.deepEqual(r.recompense, Object.fromEntries(Object.entries(C.boss.recompense).map(([k, q]) => [k, Math.max(1, Math.round(q * C.boss.partMin))])));
  assert.equal(e.joueur.ressources.gemmes, r.recompense.gemmes);
  assert.match(B.recuperer(e, cle, apres, jourJ, C).erreur, /déjà reçue/);
  assert.equal(S.verifier(e, C), true);
  // Vaincu → récompense complète
  const f = etat();
  while (B.etats(f, C)[0].pv > 0) reviser(f, '2026-11-18');
  assert.deepEqual(B.recuperer(f, cle, apres, jourJ, C).recompense, C.boss.recompense);
});

test('après l\'examen : le boss reste 7 jours si la récompense attend, puis disparaît', () => {
  const e = etat();
  assert.equal(B.actifs(e, '2026-11-27', C)[0].titre, 'Interrogation Consolidation');
  assert.ok(!B.actifs(e, '2026-11-28', C).some(b => b.titre === 'Interrogation Consolidation'));
  B.recuperer(e, B.liste(e, C)[0].cle, new Date('2026-11-21T10:00:00Z'), '2026-11-21', C);
  assert.ok(!B.actifs(e, '2026-11-21', C).some(b => b.titre === 'Interrogation Consolidation'));
});
