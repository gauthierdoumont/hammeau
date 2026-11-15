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
  assert.equal(r.gain, 53);                                  // 50 × 1,05 = 52,5 → 53
  assert.equal(e.joueur.ressources.savoir - avant, 53);
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
