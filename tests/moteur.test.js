// tests/moteur.test.js — Hameau — gains, progression, niveaux, jour logique — Créé par Gauthier Doumont
const test = require('node:test');
const assert = require('node:assert/strict');

globalThis.window = globalThis;
require('../www/config.js');
const S = require('../www/stockage.js');
const T = require('../www/taches.js');
const M = require('../www/moteur.js');
const J = require('../www/temps.js');
const C = globalThis.CONFIG;

let n = 0;
const ctx = (jour = '2026-11-16') => ({ id: 's' + (++n), horodatage: jour + 'T10:00:00.000Z', jour });
function etatAvec(...saisies) {
  const e = S.etatInitial(C);
  saisies.forEach((s, i) => T.ajouterTache(e, T.creerTache({ categorieId: 'lecture', ...s }, e, C, 't' + i, '2026-11-01T00:00:00.000Z').tache));
  return e;
}

test('cocher une tâche moyenne : +25 XP et +25 Savoir, imprévu archivé', () => {
  const e = etatAvec({ nom: 'Lire' });
  const r = M.saisir(e, 't0', null, ctx(), C);
  assert.equal(r.gain, 25);
  assert.equal(r.ressource, 'savoir');
  assert.equal(e.joueur.xpTotal, 25);
  assert.equal(e.joueur.ressources.savoir, 25);
  assert.equal(e.joueur.gagneTotal.esprit, 25);
  assert.equal(e.joueur.stats.intelligence, 2);
  assert.equal(e.taches[0].archivee, true);
  assert.equal(e.journal.length, 1);
  assert.equal(S.verifier(e), true);
});

test('tailles : petite 10, grosse 50 ; ressource de la famille', () => {
  const e = etatAvec({ nom: 'A', taille: 'petite', categorieId: 'menage' }, { nom: 'B', taille: 'grosse', categorieId: 'papiers' });
  assert.equal(M.saisir(e, 't0', null, ctx(), C).gain, 10);
  assert.equal(M.saisir(e, 't1', null, ctx(), C).gain, 50);
  assert.equal(e.joueur.ressources.bois, 10);
  assert.equal(e.joueur.ressources.or, 50);
});

test('Repos : de l\'XP, pas de ressource', () => {
  const e = etatAvec({ nom: 'Balade', categorieId: 'balade' });
  const r = M.saisir(e, 't0', null, ctx(), C);
  assert.equal(r.ressource, null);
  assert.equal(e.joueur.xpTotal, 25);
  assert.ok(Object.values(e.joueur.ressources).every(v => v === 0));
});

test('progression partielle : 10 sur 20 = 50 %, la somme des saisies = le gain complet', () => {
  const e = etatAvec({ nom: 'Lire', objectif: { cible: 20, unite: 'pages' } });
  const r1 = M.saisir(e, 't0', 10, ctx(), C);
  assert.equal(r1.progression, 0.5);
  assert.equal(r1.gain, 13);                 // round(12,5)
  assert.equal(e.taches[0].archivee, false);
  const r2 = M.saisir(e, 't0', 3, ctx(), C);
  const r3 = M.saisir(e, 't0', 50, ctx(), C);  // dépasse : plafonné à 100 %
  assert.equal(r3.progression, 1);
  assert.equal(r1.gain + r2.gain + r3.gain, 25);
  assert.equal(e.taches[0].archivee, true);
  assert.equal(M.saisir(e, 't0', 1, ctx(), C).ok, false);
});

test('cocher un objectif entamé = terminer le reste', () => {
  const e = etatAvec({ nom: 'Lire', objectif: { cible: 20, unite: 'pages' }, type: 'bonus' });
  M.saisir(e, 't0', 5, ctx(), C);
  const r = M.saisir(e, 't0', null, ctx(), C);
  assert.equal(r.progression, 1);
  assert.equal(e.joueur.xpTotal, Math.round(25));
  assert.equal(e.journal[1].valeur, 15);
});

test('quotidienne : une seule fois par jour logique, à nouveau le lendemain, jamais archivée', () => {
  const e = etatAvec({ nom: 'Muscu', type: 'quotidienne', categorieId: 'muscu' });
  assert.equal(M.saisir(e, 't0', null, ctx('2026-11-16'), C).gain, 25);
  assert.equal(M.saisir(e, 't0', null, ctx('2026-11-16'), C).ok, false);
  assert.equal(M.progression(e.taches[0], e.journal, '2026-11-17'), 0);
  assert.equal(M.saisir(e, 't0', null, ctx('2026-11-17'), C).gain, 25);
  assert.equal(e.taches[0].archivee, false);
  assert.equal(e.joueur.ressources.pierre, 50);
});

test('objectif d\'un imprévu : la progression continue d\'un jour à l\'autre', () => {
  const e = etatAvec({ nom: 'Livre', objectif: { cible: 100, unite: 'pages' } });
  M.saisir(e, 't0', 40, ctx('2026-11-16'), C);
  assert.equal(M.progression(e.taches[0], e.journal, '2026-11-18'), 0.4);
  assert.equal(M.gainRestant(e.taches[0], M.bilan(e.taches[0], e.journal, '2026-11-18'), C), 15);
});

test('saisie refusée : 0, négatif, texte, tâche inconnue — rien n\'est écrit', () => {
  const e = etatAvec({ nom: 'Lire', objectif: { cible: 20, unite: 'pages' } });
  for (const q of [0, -3, 'abc']) assert.equal(M.saisir(e, 't0', q, ctx(), C).ok, false);
  assert.equal(M.saisir(e, 'zzz', null, ctx(), C).ok, false);
  assert.equal(e.journal.length, 0);
  assert.equal(e.joueur.xpTotal, 0);
});

test('niveaux : 100 XP pour passer au niveau 2, un gros gain peut faire passer 2 niveaux', () => {
  assert.equal(M.xpPourNiveau(1, C), 100);
  assert.equal(M.xpPourNiveau(2, C), 283);
  assert.deepEqual(M.ajouterXp(90, 1, 25, C), { xp: 15, niveau: 2, niveauxGagnes: 1 });
  assert.deepEqual(M.ajouterXp(0, 1, 400, C), { xp: 17, niveau: 3, niveauxGagnes: 2 });
  const e = etatAvec(...Array.from({ length: 5 }, (_, i) => ({ nom: 'G' + i, taille: 'grosse' })));
  for (let i = 0; i < 5; i++) M.saisir(e, 't' + i, null, ctx(), C);
  assert.equal(e.joueur.xpTotal, 250);
  assert.equal(e.joueur.niveau, 2);
  assert.equal(e.joueur.xp, 150);
});

test('listes du jour : quotidiennes prévues ce jour-là, faites en bas', () => {
  const e = etatAvec(
    { nom: 'Semaine', type: 'quotidienne', jours: [1, 2, 3, 4, 5] },
    { nom: 'Week-end', type: 'quotidienne', jours: [6, 7] },
    { nom: 'Tous', type: 'quotidienne' },
    { nom: 'Bonus', type: 'bonus' });
  const lundi = '2026-11-16';
  M.saisir(e, 't0', null, ctx(lundi), C);
  const l = M.listesDuJour(e, lundi, J.jourIso(lundi));
  assert.deepEqual(l.quotidienne.map(t => t.nom), ['Tous', 'Semaine']);
  assert.equal(l.autresJours, 1);
  assert.deepEqual(l.bonus.map(t => t.nom), ['Bonus']);
});

test('modifier une tâche : id, date et historique gardés ; supprimer garde l\'XP', () => {
  const e = etatAvec({ nom: 'Lir', objectif: { cible: 20, unite: 'pages' } });
  M.saisir(e, 't0', 5, ctx(), C);
  const r = T.modifierTache(e.taches[0], { nom: 'Lire', categorieId: 'revision', type: 'imprevu', taille: 'grosse', objectif: { cible: 30, unite: 'pages' } }, e, C);
  assert.equal(r.ok, true);
  T.remplacerTache(e, r.tache);
  assert.equal(e.taches[0].id, 't0');
  assert.equal(e.taches[0].nom, 'Lire');
  assert.equal(e.taches[0].creeLe, '2026-11-01T00:00:00.000Z');
  assert.equal(T.categorie(e, 'revision').nbUtilisations, 1);
  assert.equal(e.journal.length, 1);
  assert.match(T.modifierTache(e.taches[0], { nom: '', categorieId: 'revision' }, e, C).erreur, /nom/);
  const xp = e.joueur.xpTotal;
  T.supprimerTache(e, 't0', '2026-11-16T12:00:00.000Z');
  assert.equal(e.taches[0].archivee, true);
  assert.equal(e.joueur.xpTotal, xp);
  assert.equal(M.listesDuJour(e, '2026-11-16', 1).imprevu.length, 0);
  assert.equal(S.verifier(e), true);
});

test('BUG corrigé : 10 saisies de 1 sur un objectif de 10 = 100 % (pas 99,9999 %)', () => {
  const e = etatAvec({ nom: 'Méditer', objectif: { cible: 10, unite: 'minutes' } });
  let r;
  for (let i = 0; i < 10; i++) r = M.saisir(e, 't0', 1, ctx(), C);
  assert.equal(r.progression, 1);
  assert.equal(r.terminee, true);
  assert.equal(e.taches[0].archivee, true);
  const e2 = etatAvec({ nom: 'Eau', objectif: { cible: 1, unite: 'litre' } });
  for (let i = 0; i < 10; i++) r = M.saisir(e2, 't0', 0.1, ctx(), C);
  assert.equal(r.terminee, true);
  assert.equal(e2.joueur.xpTotal, 25);
});

test('BUG corrigé : « tout le reste » termine vraiment, même après une saisie à virgule', () => {
  const e = etatAvec({ nom: 'Lire', objectif: { cible: 1, unite: 'heure' } });
  M.saisir(e, 't0', 0.006, ctx(), C);
  const r = M.saisir(e, 't0', null, ctx(), C);
  assert.equal(r.terminee, true);
  assert.equal(e.joueur.xpTotal, 25);
});

test('BUG corrigé : une quotidienne cochée hier puis changée en imprévu redevient faisable', () => {
  const e = etatAvec({ nom: 'Muscu', type: 'quotidienne', categorieId: 'muscu' });
  M.saisir(e, 't0', null, ctx('2026-11-15'), C);
  const r = T.modifierTache(e.taches[0], { nom: 'Muscu', categorieId: 'muscu', type: 'imprevu' }, e, C, '2026-11-16T09:00:00.000Z');
  T.remplacerTache(e, r.tache);
  const b = M.bilan(e.taches[0], e.journal, '2026-11-16');
  assert.equal(b.progression, 0);
  assert.equal(M.estFaite(e.taches[0], b), false);
  assert.equal(M.saisir(e, 't0', null, ctx('2026-11-16'), C).gain, 25);
  assert.equal(e.taches[0].archivee, true);
});

test('BUG corrigé : changer la cible après une saisie partielle garde les pages faites', () => {
  const e = etatAvec({ nom: 'Lire', objectif: { cible: 20, unite: 'pages' } });
  M.saisir(e, 't0', 10, ctx(), C);                                   // 10/20 → +13
  T.remplacerTache(e, T.modifierTache(e.taches[0], { nom: 'Lire', categorieId: 'lecture', objectif: { cible: 10, unite: 'pages' } }, e, C, 'x').tache);
  const b = M.bilan(e.taches[0], e.journal, '2026-11-16');
  assert.equal(b.progression, 1);                                    // 10/10
  assert.equal(M.estFaite(e.taches[0], b), false);                   // pas encore archivée : on peut la cocher
  const r = M.saisir(e, 't0', null, ctx(), C);
  assert.equal(r.gain, 12);                                          // le reste du gain complet
  assert.equal(e.joueur.xpTotal, 25);
});

test('BUG corrigé : changer la taille en cours de route → total = gain de la nouvelle taille, jamais négatif', () => {
  const e = etatAvec({ nom: 'Lire', objectif: { cible: 20, unite: 'pages' } });
  M.saisir(e, 't0', 10, ctx(), C);                                   // +13 (moyenne)
  T.remplacerTache(e, T.modifierTache(e.taches[0], { nom: 'Lire', categorieId: 'lecture', taille: 'grosse', objectif: { cible: 20, unite: 'pages' } }, e, C, 'x').tache);
  assert.equal(M.saisir(e, 't0', null, ctx(), C).gain, 37);
  assert.equal(e.joueur.xpTotal, 50);
  const e2 = etatAvec({ nom: 'Lire', taille: 'grosse', objectif: { cible: 20, unite: 'pages' } });
  M.saisir(e2, 't0', 10, ctx(), C);                                  // +25 (grosse)
  T.remplacerTache(e2, T.modifierTache(e2.taches[0], { nom: 'Lire', categorieId: 'lecture', taille: 'petite', objectif: { cible: 20, unite: 'pages' } }, e2, C, 'x').tache);
  assert.equal(M.saisir(e2, 't0', null, ctx(), C).gain, 0);          // rien n'est repris
  assert.equal(e2.joueur.xpTotal, 25);
});

test('bilans en un passage = bilan tâche par tâche', () => {
  const e = etatAvec({ nom: 'A', objectif: { cible: 20, unite: 'p' } }, { nom: 'B', type: 'quotidienne' }, { nom: 'C' });
  M.saisir(e, 't0', 7, ctx(), C);
  M.saisir(e, 't1', null, ctx('2026-11-15'), C);
  const tous = M.bilans(e, '2026-11-16');
  for (const t of e.taches) assert.deepEqual(tous.get(t.id), M.bilan(t, e.journal, '2026-11-16'));
});

test('jour logique : bascule à 4 h, heure d\'été et d\'hiver', () => {
  assert.equal(J.jourLogique(new Date('2026-11-15T02:59:00Z'), C), '2026-11-14'); // 03:59 à Bruxelles (hiver, UTC+1)
  assert.equal(J.jourLogique(new Date('2026-11-15T03:00:00Z'), C), '2026-11-15'); // 04:00
  assert.equal(J.jourLogique(new Date('2026-07-10T01:59:00Z'), C), '2026-07-09'); // 03:59 (été, UTC+2)
  assert.equal(J.jourLogique(new Date('2026-07-10T02:00:00Z'), C), '2026-07-10'); // 04:00
  assert.equal(J.jourLogique(new Date('2026-03-29T01:30:00Z'), C), '2026-03-28'); // nuit du passage à l'heure d'été : 03:30
  assert.equal(J.jourLogique(new Date('2026-03-29T02:00:00Z'), C), '2026-03-29'); // 04:00 heure d'été
  assert.equal(J.jourLogique(new Date('2026-10-25T02:30:00Z'), C), '2026-10-24'); // nuit du passage à l'heure d'hiver : 03:30
  assert.equal(J.jourLogique(new Date('2026-11-15T23:30:00Z'), C), '2026-11-15'); // 00:30 le 16 → encore le 15 (avant 4 h)
});

test('calendrier : +1 jour, changement de mois, jour de la semaine', () => {
  assert.equal(J.ajouterJours('2026-12-31', 1), '2027-01-01');
  assert.equal(J.ajouterJours('2026-03-29', -1), '2026-03-28');
  assert.equal(J.jourIso('2026-11-16'), 1);
  assert.equal(J.jourIso('2026-11-15'), 7);
});
