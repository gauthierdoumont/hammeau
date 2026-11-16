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

test('coûts : bâtiment au niveau n = 50n² famille + 20n² bois + 20n² pierre', () => {
  assert.deepEqual(E.cout('bibliotheque', 1, C), { savoir: 50, bois: 20, pierre: 20 });
  assert.deepEqual(E.cout('bibliotheque', 3, C), { savoir: 450, bois: 180, pierre: 180 });
  assert.deepEqual(E.cout('arene', 2, C), { pierre: 280, bois: 80 });              // Corps = pierre : 200 + 80
  assert.deepEqual(E.cout('scierie', 1, C), { bois: 70, pierre: 20 });             // Discipline = bois
  assert.deepEqual(E.cout('jardin', 1, C), { nourriture: 50, bois: 20, pierre: 20 }); // Repos → payé en nourriture
});

test('coûts : Mairie au niveau n = 40n² de chaque ressource (pas les gemmes)', () => {
  assert.deepEqual(E.cout('mairie', 2, C), { savoir: 160, pierre: 160, cristaux: 160, nourriture: 160, bois: 160, or: 160 });
});

test('déblocage : rien avant la Mairie ; la Mairie demande le niveau de chef', () => {
  const e = riche();
  assert.equal(E.possibilite(e, 'taverne', C).bloque, 'mairie');
  assert.equal(E.possibilite(e, 'mairie', C).bloque, null);
  assert.equal(E.construire(e, 'taverne', 1, 1, ctx('t'), C).ok, false);
  assert.equal(E.construire(e, 'mairie', 6, 3, ctx('m'), C).ok, true);
  assert.equal(E.possibilite(e, 'taverne', C).bloque, null);
  assert.equal(E.possibilite(e, 'mairie', C).bloque, 'niveauJoueur');   // niveau 2 de Mairie : chef niveau 5
  assert.equal(E.possibilite(e, 'mairie', C).requis, 5);
  e.joueur.niveau = 5;
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
  Object.assign(e.joueur.ressources, { savoir: 40, pierre: 40, cristaux: 40, nourriture: 40, bois: 39, or: 40 });
  const p = E.possibilite(e, 'mairie', C);
  assert.deepEqual(p.manque, { bois: 1 });
  assert.equal(E.faisable(p), false);
  assert.equal(E.construire(e, 'mairie', 6, 3, ctx('m'), C).ok, false);
  assert.equal(e.village.batiments.length, 0);
  e.joueur.ressources.bois = 40;
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
  e.joueur.ressources.savoir = 20;
  const p = E.prochainChantier(e, C);
  assert.equal(p.type, 'mairie');
  assert.ok(p.progression > 0 && p.progression < 1);
  Object.assign(e.joueur.ressources, { savoir: 40, pierre: 40, cristaux: 40, nourriture: 40, bois: 40, or: 40 });
  E.construire(e, 'mairie', 6, 3, ctx('m'), C);
  e.joueur.ressources.bois = 70; e.joueur.ressources.pierre = 20;
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
  assert.deepEqual(E.coutReparation('bibliotheque', 1, C), { savoir: 15, bois: 6, pierre: 6 });
  const avant = e.joueur.ressources.savoir;
  assert.equal(E.reparer(e, 'b', C).ok, true);
  assert.equal(avant - e.joueur.ressources.savoir, 15);
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
