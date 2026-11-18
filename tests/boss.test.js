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
const J = require('../www/temps.js');
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

test('après l\'examen : le boss reste C.boss.joursApres jours si la récompense attend, puis disparaît', () => {
  const e = etat();
  assert.equal(B.actifs(e, '2026-11-27', C)[0].titre, 'Interrogation Consolidation');
  assert.ok(!B.actifs(e, '2026-11-28', C).some(b => b.titre === 'Interrogation Consolidation'));
  B.recuperer(e, B.liste(e, C)[0].cle, new Date('2026-11-21T10:00:00Z'), '2026-11-21', C);
  assert.ok(!B.actifs(e, '2026-11-21', C).some(b => b.titre === 'Interrogation Consolidation'));
});

/* ===== Vérification 3 (C1) : l'agenda garde les examens passés → boss, récompense et dégâts gardés après une actualisation ===== */
const ICAL = require('../www/lib/ical.min.js');
const Cal = require('../www/calendrier.js');
const icsExamens = (avecInterro = true) => ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Hameau//tests FICTIFS//FR',
  ...(avecInterro ? ['BEGIN:VEVENT', 'UID:interro@exemple.invalid', 'DTSTAMP:20261001T000000Z', 'DTSTART:20261120T090000Z',
    'DTEND:20261120T110000Z', 'SUMMARY:Interrogation Consolidation', 'END:VEVENT'] : []),
  'BEGIN:VEVENT', 'UID:exam@exemple.invalid', 'DTSTAMP:20261001T000000Z', 'DTSTART:20261125T080000Z', 'DTEND:20261125T110000Z',
  'SUMMARY:Examen de fiscalité', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
function actualiser(e, iso, ics = icsExamens()) {
  e.reglages.calendrierCache = Cal.construireCache(ics, new Date(iso), C, ICAL, { ancien: e.reglages.calendrierCache, examens: e.agenda.examens });
}

test('examen passé : après une actualisation 2 jours plus tard, le boss est toujours là, récompense prenable jusqu\'à J+joursApres', () => {
  const e = etat();
  actualiser(e, '2026-11-16T09:00:00Z');
  reviser(e, '2026-11-18');                                             // dans la fenêtre des deux boss → le plus proche
  const degats = () => Object.fromEntries(B.etats(e, C).map(b => [b.titre, b.degats]));
  const avant = degats();
  assert.ok(avant['Interrogation Consolidation'] > 0);
  assert.equal(avant['Examen de fiscalité'], 0);
  actualiser(e, '2026-11-22T09:00:00Z');                                // J+2 : hors de la fenêtre J−1
  assert.deepEqual(degats(), avant, 'dégâts non réattribués à l\'examen suivant');
  const interro = B.actifs(e, '2026-11-22', C).find(b => b.titre === 'Interrogation Consolidation');
  assert.ok(interro && B.recompenseOuverte(interro, new Date('2026-11-22T09:00:00Z'), '2026-11-22'));
  const jourMax = J.ajouterJours('2026-11-20', C.boss.joursApres);
  actualiser(e, jourMax + 'T09:00:00Z');
  assert.ok(B.actifs(e, jourMax, C).some(b => b.titre === 'Interrogation Consolidation'), 'encore là à J+joursApres');
  assert.ok(!B.actifs(e, J.ajouterJours(jourMax, 1), C).some(b => b.titre === 'Interrogation Consolidation'));
  const r = B.recuperer(e, interro.cle, new Date(jourMax + 'T09:00:00Z'), jourMax, C);
  assert.equal(r.ok, true);
  assert.equal(S.verifier(e, C), true);
});

test('examen passé disparu du fichier : repris de l\'ancien cache ; « pas un examen » ou trop ancien : plus gardé', () => {
  const e = etat();
  actualiser(e, '2026-11-16T09:00:00Z');
  actualiser(e, '2026-11-22T09:00:00Z', icsExamens(false));             // Google ne renvoie plus l'interro passée
  assert.ok(B.liste(e, C).some(b => b.titre === 'Interrogation Consolidation'));
  const cle = B.liste(e, C).find(b => b.titre === 'Interrogation Consolidation').cle;
  e.agenda.examens[cle] = false;                                        // marqué « pas un examen »
  assert.ok(!B.liste(e, C).some(b => b.titre === 'Interrogation Consolidation'), 'faux boss retiré tout de suite');
  actualiser(e, '2026-11-23T09:00:00Z');
  assert.ok(!e.reglages.calendrierCache.evenements.some(ev => ev.uid === 'interro@exemple.invalid'), 'plus gardé dans le cache');
  delete e.agenda.examens[cle];
  const tard = J.ajouterJours('2026-11-20', Cal.joursExamensGardes(C) + 1);
  actualiser(e, '2026-11-22T09:00:00Z');
  actualiser(e, tard + 'T09:00:00Z');
  assert.ok(!e.reglages.calendrierCache.evenements.some(ev => ev.uid === 'interro@exemple.invalid'), 'trop ancien : retiré');
  // Les cours passés, eux, ne sont jamais gardés hors de la fenêtre
  assert.ok(e.reglages.calendrierCache.evenements.every(ev => ev.jour >= J.ajouterJours(tard, -C.calendrier.joursAvant) || Cal.estExamenMarque(ev, e.agenda.examens)));
});

test('marquer à la main : un événement devient un boss (« C\'est un examen »)', () => {
  const e = etat();
  const cours = B.liste(e, C).length;
  e.agenda.examens['cours@exemple.invalid|2026-11-16T07:30:00.000Z'] = true;
  assert.equal(B.liste(e, C).length, cours + 1);
});

/* ===== Vérification 4 (D5) : un examen passé reste gardé tant qu'un boss qu'il a « protégé » est encore affiché ===== */
test('examens X (20/11) puis Y (03/12) : le 05/12, Y garde ses dégâts (ceux de X ne lui passent jamais)', () => {
  const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Hameau//tests FICTIFS//FR',
    'BEGIN:VEVENT', 'UID:x@exemple.invalid', 'DTSTAMP:20261001T000000Z', 'DTSTART:20261120T080000Z', 'DTEND:20261120T100000Z', 'SUMMARY:Examen X', 'END:VEVENT',
    'BEGIN:VEVENT', 'UID:y@exemple.invalid', 'DTSTAMP:20261001T000000Z', 'DTSTART:20261203T080000Z', 'DTEND:20261203T100000Z', 'SUMMARY:Examen Y', 'END:VEVENT',
    'END:VCALENDAR'].join('\r\n');
  const e = etat();
  e.reglages.calendrierCache = null;
  actualiser(e, '2026-11-19T09:00:00Z', ics);
  reviser(e, '2026-11-19');
  reviser(e, '2026-11-20');                                             // révisions pour X (le plus proche)
  const degatsY = () => B.etats(e, C).find(b => b.titre === 'Examen Y')?.degats;
  assert.equal(degatsY(), 0);
  const vus = [];
  for (const jour of ['2026-11-25', '2026-12-03', '2026-12-04', '2026-12-05', J.ajouterJours('2026-12-03', C.boss.joursApres)]) {
    actualiser(e, jour + 'T09:00:00Z', ics);
    if (!B.actifs(e, jour, C).some(b => b.titre === 'Examen Y')) continue;
    vus.push(jour);
    assert.equal(degatsY(), 0, jour);
  }
  assert.ok(vus.includes('2026-12-05'), 'Y encore affiché le 05/12');
  assert.equal(Cal.joursExamensGardes(C), C.boss.joursAvant + C.boss.joursApres);
});

test('révision qui vise un examen : elle le frappe lui, même si un autre est plus proche ; surplus et examen disparu', () => {
  const e = etat();
  const EXAM = 'exam@exemple.invalid|2026-11-23T08:00:00.000Z';
  const viser = (id, examen, jour, taille = 'grosse') => {
    const r = T.creerTache({ nom: 'Réviser ' + id, categorieId: 'revision', taille, examen }, e, C, id, '2026-11-01T08:00:00.000Z');
    T.ajouterTache(e, r.tache);
    return M.saisir(e, id, null, { id: 's' + id, horodatage: jour + 'T10:00:00.000Z', jour }, C);
  };
  assert.equal(T.creerTache({ nom: 'x', categorieId: 'lecture', examen: EXAM }, e, C, 'z', '2026-11-01').tache.examen, undefined, 'seulement pour une révision');
  const r = viser('fisc', EXAM, '2026-11-17');
  let b = B.etats(e, C);
  assert.equal(b.find(x => x.titre === 'Examen de fiscalité').degats, r.gain);
  assert.equal(b.find(x => x.titre === 'Interrogation Consolidation').degats, 0, 'l\'interro plus proche n\'est pas touchée');
  // Sans choix : toujours le plus proche
  const r2 = viser('auto', undefined, '2026-11-17');
  b = B.etats(e, C);
  assert.equal(b.find(x => x.titre === 'Interrogation Consolidation').degats, r2.gain);
  // Examen visé déjà vaincu : le surplus passe au plus proche encore debout
  const avant = B.etats(e, C).find(x => x.titre === 'Interrogation Consolidation').degats;
  for (let i = 0; i < 6; i++) viser('f' + i, EXAM, '2026-11-18');
  b = B.etats(e, C);
  assert.equal(b.find(x => x.titre === 'Examen de fiscalité').vaincu, true);
  assert.ok(b.find(x => x.titre === 'Interrogation Consolidation').degats > avant);
  // Examen visé qui n'est plus dans l'agenda : comme sans choix
  const e2 = etat();
  T.ajouterTache(e2, T.creerTache({ nom: 'R', categorieId: 'revision', examen: 'parti@x|2026-01-01' }, e2, C, 'p', '2026-11-01').tache);
  const r3 = M.saisir(e2, 'p', null, { id: 'sp', horodatage: '2026-11-17T10:00:00.000Z', jour: '2026-11-17' }, C);
  assert.equal(B.etats(e2, C).find(x => x.titre === 'Interrogation Consolidation').degats, r3.gain);
  // Liste du choix : examens à venir seulement
  assert.deepEqual(B.examensAVenir(e, '2026-11-21', C).map(x => x.titre), ['Examen de fiscalité']);
});

// Créé par Gauthier Doumont
