// tests/economie.test.js — Hameau — village : coûts, déblocages, construire, améliorer, bonus — Créé par Gauthier Doumont
const test = require('node:test');
const assert = require('node:assert/strict');

globalThis.window = globalThis;
require('../www/config.js');
const S = require('../www/stockage.js');
const T = require('../www/taches.js');
const M = require('../www/moteur.js');
const E = require('../www/economie.js');
const C = globalThis.CONFIG;
const ctx = (id) => ({ id, quand: '2026-11-16T10:00:00.000Z' });
function riche(n = 10000) {
  const e = S.etatInitial(C);
  for (const r of Object.keys(e.joueur.ressources)) e.joueur.ressources[r] = n;
  return e;
}

// Attendus calculés depuis CONFIG : un futur rééquilibrage de config.js ne casse pas ces tests
const B = C.batiments;
const somme = (...paires) => { const o = {}; for (const [r, q] of paires) o[r] = (o[r] || 0) + q; return o; };
const coutBat = (fam, n) => somme([fam, B.coutFamille * n * n], ['bois', B.coutBois * n * n], ['pierre', B.coutPierre * n * n]);
const coutMairie = (n) => Object.fromEntries(['savoir', 'pierre', 'cristaux', 'nourriture', 'bois', 'or'].map(r => [r, C.mairie.cout * n * n]));
const requis = (n) => C.mairie.niveauJoueurRequis[n - 1];

test('coûts : bâtiment au niveau n = coutFamille·n² famille + coutBois·n² bois + coutPierre·n² pierre', () => {
  assert.deepEqual(E.cout('bibliotheque', 1, C), coutBat('savoir', 1));
  assert.deepEqual(E.cout('bibliotheque', 3, C), coutBat('savoir', 3));
  assert.deepEqual(E.cout('arene', 2, C), coutBat('pierre', 2));              // Corps = pierre : les deux s'additionnent
  assert.deepEqual(E.cout('scierie', 1, C), coutBat('bois', 1));              // Discipline = bois
  assert.deepEqual(E.cout('jardin', 1, C), coutBat(B.jardinPayeEn, 1));      // Repos → payé en nourriture
  assert.equal(Object.keys(E.cout('arene', 2, C)).length, 2);
});

test('coûts : Mairie au niveau n = mairie.cout·n² de chaque ressource (pas les gemmes)', () => {
  assert.deepEqual(E.cout('mairie', 2, C), coutMairie(2));
});

test('déblocage : rien avant la Mairie ; la Mairie demande le niveau de chef', () => {
  const e = riche();
  assert.equal(E.possibilite(e, 'taverne', C).bloque, 'mairie');
  assert.equal(E.possibilite(e, 'mairie', C).bloque, null);
  assert.equal(E.construire(e, 'taverne', 1, 1, ctx('t'), C).ok, false);
  assert.equal(E.construire(e, 'mairie', 6, 3, ctx('m'), C).ok, true);
  assert.equal(E.possibilite(e, 'taverne', C).bloque, null);
  e.joueur.niveau = requis(2) - 1;
  assert.equal(E.possibilite(e, 'mairie', C).bloque, 'niveauJoueur');   // niveau 2 de Mairie : niveau de chef requis
  assert.equal(E.possibilite(e, 'mairie', C).requis, requis(2));
  e.joueur.niveau = requis(2);
  assert.equal(E.ameliorer(e, 'm', C).ok, true);
  assert.equal(E.batiment(e, 'mairie').niveau, 2);
});

test('niveau des bâtiments plafonné par la Mairie', () => {
  const e = riche();
  E.construire(e, 'mairie', 6, 3, ctx('m'), C);
  E.construire(e, 'taverne', 1, 1, ctx('t'), C);
  const p = E.possibilite(e, 'taverne', C);
  assert.equal(p.action, 'ameliorer');
  assert.equal(p.bloque, 'mairie');
  assert.match(E.ameliorer(e, 't', C).erreur, /Mairie au niveau 2/);
});

test('construire paie le coût exact ; pas assez de ressources → rien ne change', () => {
  const e = riche(0);
  Object.assign(e.joueur.ressources, coutMairie(1));
  e.joueur.ressources.bois -= 1;
  const p = E.possibilite(e, 'mairie', C);
  assert.deepEqual(p.manque, { bois: 1 });
  assert.equal(E.faisable(p), false);
  assert.equal(E.construire(e, 'mairie', 6, 3, ctx('m'), C).ok, false);
  assert.equal(e.village.batiments.length, 0);
  e.joueur.ressources.bois += 1;
  assert.equal(E.construire(e, 'mairie', 6, 3, ctx('m'), C).ok, true);
  assert.ok(Object.entries(e.joueur.ressources).every(([r, v]) => r === 'gemmes' || v === 0));
  assert.equal(S.verifier(e), true);
});

test('un seul bâtiment de chaque type ; niveau 5 = maximum', () => {
  const e = riche(1e6);
  e.joueur.niveau = 30;
  E.construire(e, 'mairie', 6, 3, ctx('m'), C);
  assert.match(E.construire(e, 'mairie', 2, 2, ctx('m2'), C).erreur, /existe déjà/);
  for (let i = 0; i < 4; i++) assert.equal(E.ameliorer(e, 'm', C).ok, true);
  assert.equal(E.possibilite(e, 'mairie', C).action, 'max');
  assert.equal(E.ameliorer(e, 'm', C).ok, false);
});

test('bonus : +5 % par niveau pour sa famille ; rien si endommagé ou moral bas', () => {
  const e = riche();
  E.construire(e, 'mairie', 6, 3, ctx('m'), C);
  assert.equal(E.bonus(e, 'esprit', C), 0);
  E.construire(e, 'bibliotheque', 2, 2, ctx('b'), C);
  assert.equal(E.bonus(e, 'esprit', C), 0.05);
  assert.equal(E.bonus(e, 'corps', C), 0);
  e.village.batiments[1].endommage = true;
  assert.equal(E.bonus(e, 'esprit', C), 0);
  e.village.batiments[1].endommage = false;
  e.joueur.moral = 39;
  assert.equal(E.bonus(e, 'esprit', C), 0);
});

test('le bonus augmente vraiment les gains d\'une tâche', () => {
  const e = riche();
  E.construire(e, 'mairie', 6, 3, ctx('m'), C);
  E.construire(e, 'bibliotheque', 2, 2, ctx('b'), C);
  T.ajouterTache(e, T.creerTache({ nom: 'Lire', categorieId: 'lecture', taille: 'grosse' }, e, C, 't1', 'x').tache);
  const avant = e.joueur.ressources.savoir;
  const r = M.saisir(e, 't1', null, { id: 's1', horodatage: 'x', jour: '2026-11-16' }, C);   // le moteur trouve le bonus tout seul
  assert.equal(r.gain, 63);                                  // 50 × 1,2 (imprévu) × 1,05 = 63
  assert.equal(e.joueur.ressources.savoir - avant, 63);
});

test('prochain chantier : la Mairie au début, puis le plus proche d\'être payé', () => {
  const e = riche(0);
  e.joueur.ressources.savoir = Math.floor(C.mairie.cout / 2);
  const p = E.prochainChantier(e, C);
  assert.equal(p.type, 'mairie');
  assert.ok(p.progression > 0 && p.progression < 1);
  Object.assign(e.joueur.ressources, coutMairie(1));
  E.construire(e, 'mairie', 6, 3, ctx('m'), C);
  Object.assign(e.joueur.ressources, coutBat('bois', 1));
  assert.equal(E.prochainChantier(e, C).type, 'scierie');    // tout est payé pour la Scierie
});

test('vérification : type de bâtiment inconnu ou niveau au-delà du max de config.js → refusé', () => {
  const e = riche();
  E.construire(e, 'mairie', 6, 3, ctx('m'), C);
  e.village.batiments[0].type = 'moulin';
  assert.throws(() => S.verifier(e, C), /type inconnu/);
  e.village.batiments[0].type = 'mairie';
  e.village.batiments[0].niveau = C.batiments.niveauMax + 1;
  assert.throws(() => S.verifier(e, C), /niveau/);
  e.village.batiments[0].niveau = C.batiments.niveauMax;
  assert.equal(S.verifier(e, C), true);
});

/* ===== Étape 13 : réparation, extensions, décorations ===== */
test('endommager : un bâtiment au hasard (hasard injecté), bonus en pause, puis réparation à 30 %', () => {
  const e = riche();
  E.construire(e, 'mairie', 6, 3, ctx('m'), C);
  E.construire(e, 'bibliotheque', 2, 2, ctx('b'), C);
  const touche = E.endommager(e, () => 0.99);               // 2e bâtiment intact
  assert.equal(touche.id, 'b');
  assert.equal(E.bonus(e, 'esprit', C), 0);
  assert.equal(E.possibilite(e, 'bibliotheque', C).bloque, 'endommage');
  const rep = Object.fromEntries(Object.entries(coutBat('savoir', 1)).map(([r, q]) => [r, Math.ceil(q * C.reparation.part)]));
  assert.deepEqual(E.coutReparation('bibliotheque', 1, C), rep);
  const avant = e.joueur.ressources.savoir;
  assert.equal(E.reparer(e, 'b', C).ok, true);
  assert.equal(avant - e.joueur.ressources.savoir, rep.savoir);
  assert.equal(E.bonus(e, 'esprit', C), 0.05);
  assert.equal(E.reparer(e, 'b', C).ok, false);             // déjà réparé
  E.endommager(e, () => 0); E.endommager(e, () => 0);
  assert.equal(E.endommager(e, () => 0), null);             // plus rien d'intact
});

test('agrandir : coût ×1,5 à chaque anneau, 3 au maximum', () => {
  const e = riche();
  assert.deepEqual(E.coutExtension(0, C), { bois: 120, pierre: 120, or: 60 });
  assert.deepEqual(E.coutExtension(1, C), { bois: 180, pierre: 180, or: 90 });
  assert.deepEqual(E.coutExtension(2, C), { bois: 270, pierre: 270, or: 135 });
  for (let i = 1; i <= 3; i++) assert.equal(E.agrandir(e, C).extensions, i);
  assert.equal(E.possibiliteExtension(e, C).max, true);
  assert.equal(E.agrandir(e, C).ok, false);
  assert.equal(S.verifier(e, C), true);
});

test('décorations : achat en ressources ou en gemmes, déplacer, retirer', () => {
  const e = riche(0);
  e.joueur.ressources.bois = 20;
  assert.equal(E.acheterDecoration(e, 'tour', 1, 1, ctx('t'), C).ok, false);   // pas de gemmes
  assert.equal(E.acheterDecoration(e, 'arbre', 1, 1, ctx('a'), C).ok, true);
  assert.equal(e.joueur.ressources.bois, 5);
  e.joueur.ressources.gemmes = 5;
  assert.equal(E.acheterDecoration(e, 'tour', 2, 1, ctx('t'), C).ok, true);
  assert.equal(e.joueur.ressources.gemmes, 0);
  assert.equal(E.deplacerDecoration(e, 'a', 3, 3).decoration.x, 3);
  assert.equal(E.retirerDecoration(e, 't').ok, true);
  assert.equal(e.village.decorations.length, 1);
  assert.equal(S.verifier(e, C), true);
  e.village.decorations.push({ id: 'z', type: 'licorne', x: 0, y: 0 });
  assert.throws(() => S.verifier(e, C), /décoration inconnue/);
});

test('marché : 3 contre 1 par lots, ressources communes seulement, jamais à découvert', () => {
  const e = S.etatInitial(C);
  e.joueur.ressources.savoir = 100;
  e.joueur.ressources.gemmes = 50;
  const prix = C.marche.taux * C.marche.lot;
  assert.equal(E.lotsPossibles(e, 'savoir', C), Math.floor(100 / prix));
  const r = E.echanger(e, 'savoir', 'nourriture', 2, C);
  assert.ok(r.ok, r.erreur);
  assert.deepEqual(r.donne, { savoir: 2 * prix });
  assert.deepEqual(r.recoit, { nourriture: 2 * C.marche.lot });
  assert.equal(e.joueur.ressources.savoir, 100 - 2 * prix);
  assert.equal(e.joueur.ressources.nourriture, 2 * C.marche.lot);
  assert.equal(E.echanger(e, 'savoir', 'nourriture', 99, C).ok, false);     // pas assez
  assert.equal(E.echanger(e, 'savoir', 'savoir', 1, C).ok, false);
  assert.equal(E.echanger(e, 'gemmes', 'or', 1, C).ok, false);             // gemmes : coffres seulement
  assert.equal(E.echanger(e, 'savoir', 'or', 0, C).ok, false);
  assert.equal(E.echanger(e, 'savoir', 'or', 1.5, C).ok, false);
  assert.ok(Object.values(e.joueur.ressources).every(v => v >= 0));
});

test('marché : plan pour finir un chantier (le cas du test de jouabilité : 14 🍞, 1 600 📜)', () => {
  const e = S.etatInitial(C);
  Object.assign(e.joueur.ressources, { savoir: 1600, pierre: 1200, cristaux: 800, nourriture: 14, bois: 120, or: 130 });
  const cout = E.cout('mairie', 1, C);
  const plan = E.planMarche(e, cout, C);
  assert.ok(plan && plan.length === 1);
  assert.equal(plan[0].recoit, 'nourriture');
  assert.equal(plan[0].donne, 'savoir');                                    // le plus abondant
  assert.equal(plan[0].lots, Math.ceil((cout.nourriture - 14) / C.marche.lot));
  for (const x of plan) E.echanger(e, x.donne, x.recoit, x.lots, C);
  assert.equal(Object.keys(E.manque(e, cout)).length, 0, 'la Mairie devient constructible');
  // Rien à combler, ou pas assez de quoi échanger : pas de plan
  assert.equal(E.planMarche(e, cout, C), null);
  const pauvre = S.etatInitial(C);
  assert.equal(E.planMarche(pauvre, cout, C), null);
});

// Créé par Gauthier Doumont
