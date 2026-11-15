// tests/village.test.js — Hameau — géométrie et catalogue du village — Créé par Gauthier Doumont
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

globalThis.window = globalThis;
require('../www/config.js');
const CV = require('../www/assets/village/catalogue.js');
const G = require('../www/village-geo.js');
const T = CV.tuile;

test('isométrie : versGrille(versEcran(gx, gy)) = (gx, gy), même un peu à côté du centre', () => {
  for (let gx = -3; gx < 15; gx++) for (let gy = -3; gy < 15; gy++) {
    const p = G.versEcran(gx, gy, T);
    assert.deepEqual(G.versGrille(p.x, p.y, T), { gx, gy });
    assert.deepEqual(G.versGrille(p.x + T.largeur / 6, p.y - T.hauteur / 6, T), { gx, gy });
  }
});

test('profondeur : devant passe après derrière, plus haut passe après plus bas', () => {
  assert.ok(G.profondeur(3, 3) > G.profondeur(3, 2, 5));
  assert.ok(G.profondeur(2, 2, 2) > G.profondeur(2, 2, 1));
});

test('carte : toutes les lignes ont la même largeur, lettres connues', () => {
  const L = CV.carte[0].length;
  for (const ligne of CV.carte) {
    assert.equal(ligne.length, L);
    for (const c of ligne) assert.ok('.=~#'.includes(c) || CV.decors[c], `lettre inconnue « ${c} »`);
  }
});

test('terrain : chemins orientés, croisement, pont, cases constructibles', () => {
  const t = G.lireCarte(CV.carte, CV.decors);
  const a = (gx, gy) => t.cases.find(c => c.gx === gx && c.gy === gy);
  assert.equal(a(4, 5).sol, 'grass_pathCrossing_N');
  assert.equal(a(4, 2).sol, 'grass_path_E');       // chemin le long de gy
  assert.equal(a(2, 5).sol, 'grass_path_N');       // chemin le long de gx
  assert.equal(a(9, 2).sol, 'grass_river_E');
  assert.equal(a(9, 5).sol, 'grass_riverBridge_N');
  assert.equal(a(0, 0).decor, 'tree_pine_N');
  assert.ok(t.cases.filter(c => c.constructible).length >= 60, 'assez de place pour construire');
});

test('chaque image citée existe dans l\'atlas', () => {
  const atlas = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'www', 'assets', 'village', 'village.json'), 'utf8'));
  const t = G.lireCarte(CV.carte, CV.decors);
  const utilisees = new Set(t.cases.flatMap(c => [c.sol, c.decor].filter(Boolean)));
  for (const def of Object.values(CV.batiments)) for (const n of def.niveaux) for (const [img] of n) utilisees.add(img);
  for (const img of utilisees) assert.ok(atlas.frames[img], `image absente de l'atlas : ${img}`);
});

test('bâtiments : 8 types, 5 niveaux chacun, plus haut ou plus garni à chaque niveau', () => {
  assert.deepEqual(Object.keys(CV.batiments).sort(), ['arene', 'atelier', 'banque', 'bibliotheque', 'jardin', 'mairie', 'scierie', 'taverne']);
  for (const [type, def] of Object.entries(CV.batiments)) {
    assert.equal(def.niveaux.length, 5, type);
    for (let n = 1; n < 5; n++) {
      const avant = def.niveaux[n - 1], apres = def.niveaux[n];
      assert.ok(apres.length >= avant.length, `${type} niveau ${n + 1} au moins aussi garni`);
      assert.notDeepEqual(apres, avant, `${type} niveau ${n + 1} différent du niveau ${n}`);
    }
  }
});

test('pièces d\'un bâtiment : posées sur sa case, niveau borné', () => {
  const p = G.pieces({ type: 'taverne', niveau: 2, x: 3, y: 4 }, CV);
  assert.deepEqual(p.map(x => [x.image, x.gx, x.gy, x.h]), [['building_doorWindows_N', 3, 4, 1], ['building_windows_N', 3, 4, 2], ['roof_gableBrown_N', 3, 4, 3]]);
  assert.equal(G.pieces({ type: 'taverne', niveau: 99, x: 0, y: 0 }, CV).length, CV.batiments.taverne.niveaux[4].length);
  assert.deepEqual(G.pieces({ type: 'inconnu', niveau: 1, x: 0, y: 0 }, CV), []);
});

test('cases occupées : décors du terrain + empreinte des bâtiments (jardin 2×2)', () => {
  const t = G.lireCarte(CV.carte, CV.decors);
  const occ = G.occupees(t, [{ type: 'jardin', niveau: 1, x: 6, y: 7 }, { type: 'mairie', niveau: 1, x: 6, y: 3 }], CV);
  for (const k of ['6,7', '7,7', '6,8', '7,8', '6,3', '0,0', '4,5', '9,1']) assert.ok(occ.has(k), k);
  assert.ok(!occ.has('2,2'));
});

test('anneaux de terrain : la carte grandit tout autour, rivière et chemins prolongés', () => {
  const base = G.lireCarte(CV.carte, CV.decors, 0);
  const t = G.lireCarte(CV.carte, CV.decors, 2);
  assert.equal(t.cases.length, (base.largeur + 4) * (base.hauteur + 4));
  assert.deepEqual(t.min, { gx: -2, gy: -2 });
  const a = (gx, gy) => t.cases.find(c => c.gx === gx && c.gy === gy);
  assert.equal(a(9, -2).sol, 'grass_river_E');            // la rivière continue vers le haut
  assert.equal(a(9, 13).sol, 'grass_river_E');            // … et vers le bas
  assert.equal(a(-1, 5).sol, 'grass_path_N');             // le chemin continue à gauche
  assert.equal(a(4, -1).sol, 'grass_path_E');
  // L'île de départ ne change pas ; les nouvelles cases sont stables (mêmes arbres à chaque fois)
  for (const c of base.cases) assert.deepEqual({ ...a(c.gx, c.gy), anneau: 0 }, { ...c, anneau: 0 });
  assert.deepEqual(G.lireCarte(CV.carte, CV.decors, 2), t);
  assert.ok(t.cases.filter(c => c.anneau > 0 && c.constructible).length > 40, 'de la place en plus pour construire');
});

test('décorations : image connue, cases occupées', () => {
  for (const type of Object.keys(globalThis.CONFIG?.decorations || {})) assert.ok(CV.decorationsImages[type], type);
  const t = G.lireCarte(CV.carte, CV.decors);
  const occ = G.occupees(t, [], CV, [{ id: 'd', type: 'arbre', x: 2, y: 2 }]);
  assert.ok(occ.has('2,2'));
  assert.deepEqual(G.piecesDecoration({ type: 'tour', x: 1, y: 1 }, CV), [{ image: 'castle_tower_N', gx: 1, gy: 1, h: 1 }]);
});
