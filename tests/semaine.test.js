// tests/semaine.test.js — Hameau — tâches « de la semaine » (ex. 5 étapes de Nanoblocks entre lundi et dimanche) — Créé par Gauthier Doumont
// Choix de Gauthier (2026-11-17) : chaque étape rapporte tout de suite (taille = par étape) + bonus quand la semaine est bouclée ;
// pas bouclée → rien de perdu ; dépasser l'objectif rapporte encore, à moitié ; une étape compte pour la série ;
// rappel doux le dimanche matin. Attendus calculés depuis CONFIG : un rééquilibrage ne casse pas ces tests.
process.env.TZ = 'Europe/Brussels';
const test = require('node:test');
const assert = require('node:assert/strict');

globalThis.window = globalThis;
require('../www/config.js');
const S = require('../www/stockage.js');
const T = require('../www/taches.js');
const M = require('../www/moteur.js');
const D = require('../www/jours.js');
const N = require('../www/notifications.js');
const Bi = require('../www/bilan.js');
const C = globalThis.CONFIG;

// Semaine du lundi 16 au dimanche 22 novembre 2026
const LUN = '2026-11-16', MAR = '2026-11-17', JEU = '2026-11-19', DIM = '2026-11-22', LUN2 = '2026-11-23';
const ETAPE = C.tailles.moyenne * C.types.semaine;          // gain d'une étape « Moyenne » sans série ni bâtiment
let n = 0;
const ctx = (jour) => ({ id: 's' + (++n), horodatage: jour + 'T10:00:00.000Z', jour });
function etatAvec(...saisies) {
  const e = S.etatInitial(C);
  saisies.forEach((s, i) => {
    const r = T.creerTache({ categorieId: 'nanoblocks', type: 'semaine', objectif: { cible: 5, unite: 'étapes' }, ...s }, e, C, 't' + i, '2026-11-01T00:00:00.000Z');
    assert.ok(r.ok, r.erreur);
    T.ajouterTache(e, r.tache);
  });
  return e;
}

test('création : objectif entier de 1 à cibleMax, unité par défaut, taille gardée', () => {
  const e = S.etatInitial(C);
  const base = { nom: 'Nanoblocks', categorieId: 'nanoblocks', type: 'semaine' };
  const ok = T.creerTache({ ...base, objectif: { cible: '5', unite: '' } }, e, C, 'a', LUN);
  assert.ok(ok.ok);
  assert.deepEqual(ok.tache.objectif, { cible: 5, unite: C.semaine.uniteDefaut });
  assert.equal(ok.tache.taille, C.taches.defauts.taille);
  assert.equal(ok.tache.jours, undefined);
  for (const cible of ['', '0', '2,5', String(C.semaine.cibleMax + 1), 'abc']) {
    assert.equal(T.creerTache({ ...base, objectif: { cible, unite: 'étapes' } }, e, C, 'b', LUN).ok, false, cible);
  }
  assert.equal(T.creerTache({ ...base, objectif: { cible: C.semaine.cibleMax } }, e, C, 'c', LUN).ok, true);
});

test('chaque étape rapporte tout de suite, n\'importe quel jour ; la semaine se boucle avec un bonus', () => {
  const e = etatAvec({ nom: 'Nanoblocks' });
  const r1 = M.saisir(e, 't0', null, ctx(LUN), C);              // lundi : 1 étape
  assert.equal(r1.gain, ETAPE);
  assert.equal(r1.ressource, 'cristaux');
  assert.equal(r1.terminee, false);
  assert.deepEqual([r1.semaine.somme, r1.semaine.cible], [1, 5]);
  const r2 = M.saisir(e, 't0', 2, ctx(JEU), C);                 // jeudi : 2 étapes d'un coup
  assert.equal(r2.gain, 2 * ETAPE);
  const moral = e.joueur.moral;
  const r3 = M.saisir(e, 't0', 2, ctx(DIM), C);                 // dimanche : 2 étapes → 5/5, bouclée
  const bonus = Math.round(ETAPE * C.semaine.bonusEtapes);
  assert.equal(r3.terminee, true);
  assert.equal(r3.semaine.boucle, true);
  assert.equal(r3.semaine.bonus, bonus);
  assert.equal(r3.gain, 2 * ETAPE + bonus);
  assert.equal(e.joueur.ressources.cristaux, 5 * ETAPE + bonus);
  assert.equal(e.joueur.moral, Math.min(C.moral.max, moral + C.moral.parTache));
  assert.equal(e.taches[0].archivee, false, 'reste là pour la semaine suivante');
  assert.equal(M.estFaite(e.taches[0], M.bilan(e.taches[0], e.journal, DIM)), true);
  assert.equal(S.verifier(e, C), true);
});

test('dépasser l\'objectif : chaque étape en plus rapporte encore, à moitié, sans 2e bonus', () => {
  const e = etatAvec({ nom: 'Nanoblocks', objectif: { cible: 2 } });
  M.saisir(e, 't0', 2, ctx(LUN), C);
  const r = M.saisir(e, 't0', null, ctx(MAR), C);
  assert.equal(r.gain, Math.round(ETAPE * C.semaine.facteurEnPlus));
  assert.equal(r.semaine.boucle, false);
  assert.equal(r.semaine.somme, 3);
  // À cheval : 1 étape pour boucler + 1 en plus, d'un coup
  const e2 = etatAvec({ nom: 'N', objectif: { cible: 2 } });
  M.saisir(e2, 't0', null, ctx(LUN), C);
  const r2 = M.saisir(e2, 't0', 2, ctx(MAR), C);
  assert.equal(r2.gain, Math.round(ETAPE * (1 + C.semaine.facteurEnPlus)) + Math.round(ETAPE * C.semaine.bonusEtapes));
  // Carte : la prochaine étape affiche le demi-gain une fois bouclée
  assert.equal(M.gainRestant(e2.taches[0], M.bilan(e2.taches[0], e2.journal, MAR), C), Math.round(ETAPE * C.semaine.facteurEnPlus));
});

test('lundi : le compteur repart à 0, rien de perdu (ni moral ni ressources)', () => {
  const e = etatAvec({ nom: 'Nanoblocks' });
  M.saisir(e, 't0', 3, ctx(MAR), C);
  e.etat.dernierJourTraite = '2026-11-15';
  const avant = { moral: e.joueur.moral, ressources: { ...e.joueur.ressources } };
  const r = D.rattraper(e, new Date('2026-11-23T13:00:00Z'), C);    // lundi 23, 14 h : toute la semaine traitée
  assert.equal(r.etat.joueur.moral, avant.moral);
  assert.deepEqual(r.etat.joueur.ressources, avant.ressources);
  assert.equal(r.evenements.filter(v => v.type === 'moral').length, 0);
  const t = r.etat.taches[0];
  assert.equal(M.bilan(t, r.etat.journal, LUN2).somme, 0);
  assert.equal(M.bilan(t, r.etat.journal, DIM).somme, 3);
  assert.equal(M.saisir(r.etat, 't0', null, ctx(LUN2), C).semaine.somme, 1);
});

test('série : une étape de la semaine compte comme une quotidienne faite ; jamais de perte sans quotidienne prévue', () => {
  // Jour sans quotidienne prévue + étape de la semaine (≥ xpMinJour) → série +1
  const e = etatAvec({ nom: 'Nanoblocks' });
  e.etat.dernierJourTraite = '2026-11-15';
  e.joueur.serie = { jours: 4, joker: 0 };
  M.saisir(e, 't0', 2, ctx(LUN), C);                          // 2 × 25 ≥ 30
  let r = D.rattraper(e, new Date('2026-11-17T13:00:00Z'), C);  // traite le lundi
  assert.equal(r.etat.joueur.serie.jours, 5);
  // Étape trop petite pour xpMinJour, sans quotidienne prévue → neutre (ni +1, ni joker, ni remise à 0)
  const e2 = etatAvec({ nom: 'Mini', taille: 'petite' });
  e2.etat.dernierJourTraite = '2026-11-15';
  e2.joueur.serie = { jours: 4, joker: 1 };
  M.saisir(e2, 't0', null, ctx(LUN), C);
  r = D.rattraper(e2, new Date('2026-11-17T13:00:00Z'), C);
  assert.deepEqual(r.etat.joueur.serie, { jours: 4, joker: 1 });
  // Quotidienne prévue pas faite, mais une étape de la semaine faite (≥ xpMinJour) → série validée
  const e3 = etatAvec({ nom: 'Nanoblocks' });
  T.ajouterTache(e3, T.creerTache({ nom: 'Lire', categorieId: 'lecture', type: 'quotidienne' }, e3, C, 'q', '2026-11-01T00:00:00.000Z').tache);
  e3.etat.dernierJourTraite = '2026-11-15';
  e3.joueur.serie = { jours: 2, joker: 0 };
  M.saisir(e3, 't0', 2, ctx(LUN), C);
  r = D.rattraper(e3, new Date('2026-11-17T13:00:00Z'), C);
  assert.equal(r.etat.joueur.serie.jours, 3);
});

test('anti-farm, tempête et bilan : seule l\'étape qui boucle la semaine compte comme « tâche finie »', () => {
  const e = etatAvec({ nom: 'Nanoblocks', objectif: { cible: 1 } });
  M.saisir(e, 't0', null, ctx(LUN), C);                       // boucle
  for (let i = 0; i < 4; i++) M.saisir(e, 't0', null, ctx(LUN), C);   // en plus
  assert.equal(M.terminesDuJour(e.journal, LUN), 1);
  assert.equal(Bi.semaine(e, LUN, C).taches, 1);
});

test('refus clairs : nombre non entier, trop grand ; modification de l\'objectif en cours de semaine', () => {
  const e = etatAvec({ nom: 'Nanoblocks' });
  assert.equal(M.saisir(e, 't0', 1.5, ctx(LUN), C).ok, false);
  assert.equal(M.saisir(e, 't0', 0, ctx(LUN), C).ok, false);
  assert.equal(M.saisir(e, 't0', C.semaine.cibleMax + 1, ctx(LUN), C).ok, false);
  M.saisir(e, 't0', 3, ctx(LUN), C);
  // Objectif baissé à 3 : la semaine est bouclée (sans bonus rétroactif), l'étape suivante est « en plus »
  const r = T.modifierTache(e.taches[0], { nom: 'Nanoblocks', categorieId: 'nanoblocks', type: 'semaine', objectif: { cible: 3 } }, e, C, LUN + 'T11:00:00.000Z');
  T.remplacerTache(e, r.tache);
  assert.equal(M.progression(e.taches[0], e.journal, MAR), 1);
  assert.equal(M.saisir(e, 't0', null, ctx(MAR), C).semaine.boucle, false);
  // Passer d'une quotidienne à une tâche de la semaine : la progression repart de zéro
  const q = S.etatInitial(C);
  T.ajouterTache(q, T.creerTache({ nom: 'Lire', categorieId: 'lecture', type: 'quotidienne' }, q, C, 'q', '2026-11-01T00:00:00.000Z').tache);
  M.saisir(q, 'q', null, ctx(LUN), C);
  const m = T.modifierTache(q.taches[0], { nom: 'Lire', categorieId: 'lecture', type: 'semaine', objectif: { cible: 3 } }, q, C, LUN + 'T12:00:00.000Z');
  T.remplacerTache(q, m.tache);
  assert.equal(M.bilan(q.taches[0], q.journal, LUN).somme, 0);
});

test('Aujourd\'hui et prochaine action : section « semaine », la moins avancée proposée après les quotidiennes', () => {
  const e = etatAvec({ nom: 'Nanoblocks' }, { nom: 'Course', categorieId: 'course', objectif: { cible: 3, unite: 'sorties' } });
  T.ajouterTache(e, T.creerTache({ nom: 'Lire', categorieId: 'lecture', type: 'quotidienne' }, e, C, 'q', '2026-11-01T00:00:00.000Z').tache);
  T.ajouterTache(e, T.creerTache({ nom: 'Idée', categorieId: 'code', type: 'bonus' }, e, C, 'b', '2026-11-01T00:00:00.000Z').tache);
  M.saisir(e, 't1', 2, ctx(LUN), C);                          // Course : 2/3 → reste 1 ; Nanoblocks : reste 5
  const l = M.listesDuJour(e, MAR, 2);
  assert.deepEqual(l.semaine.map(t => t.id), ['t0', 't1']);
  assert.deepEqual(M.candidatsProchaineAction(e, MAR, 2).map(t => t.id), ['q', 't0', 't1', 'b']);
  M.saisir(e, 't1', null, ctx(MAR), C);                       // Course bouclée → plus proposée, en bas de la liste
  assert.deepEqual(M.candidatsProchaineAction(e, MAR, 2).map(t => t.id), ['q', 't0', 'b']);
  assert.deepEqual(M.listesDuJour(e, MAR, 2).semaine.map(t => t.id), ['t0', 't1']);
});

test('rappel du dimanche matin : ce qui reste pour boucler la semaine, rien si tout est bouclé', () => {
  const e = etatAvec({ nom: 'Nanoblocks' });
  e.reglages.notifMatin = '08:00';
  e.reglages.notifSoir = null;
  M.saisir(e, 't0', 3, ctx(LUN), C);
  const samedi = new Date('2026-11-21T09:00:00Z');            // samedi 10 h : dimanche = demain (précis)
  let dim = N.construire(e, samedi, C).find(x => x.jour === DIM && x.type === 'matin');
  assert.match(dim.body, /« Nanoblocks » : encore 2 étapes pour boucler ta semaine/);
  // Lundi : dimanche est loin (générique) mais garde la ligne de la semaine
  dim = N.construire(e, new Date('2026-11-16T12:00:00Z'), C).find(x => x.jour === DIM && x.type === 'matin');
  assert.match(dim.body, /encore 2 étapes/);
  M.saisir(e, 't0', 2, ctx(LUN), C);
  dim = N.construire(e, samedi, C).find(x => x.jour === DIM && x.type === 'matin');
  assert.doesNotMatch(dim.body, /boucler/);
  // Aucun autre jour que le dimanche
  const e2 = etatAvec({ nom: 'Nanoblocks' });
  e2.reglages.notifMatin = '08:00';
  assert.ok(N.construire(e2, new Date('2026-11-16T05:00:00Z'), C).filter(x => x.type === 'matin' && x.jour !== DIM).every(x => !/boucler/.test(x.body)));
});

test('données : une tâche de la semaine passe la vérification, l\'export et l\'import (pas de migration)', () => {
  const e = etatAvec({ nom: 'Nanoblocks' });
  M.saisir(e, 't0', 2, ctx(LUN), C);
  assert.equal(S.verifier(e, C), true);
  const d = S.decider(JSON.stringify(e), C);
  assert.equal(d.type, 'ok');
  assert.equal(d.etat.taches[0].type, 'semaine');
  assert.deepEqual(d.etat.journal[0].semaine, { boucle: false, bonus: 0, enPlus: 0 });
});

// Créé par Gauthier Doumont
