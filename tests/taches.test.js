// tests/taches.test.js — Hameau — catégories et création de tâches — Créé par Gauthier Doumont
const test = require('node:test');
const assert = require('node:assert/strict');

globalThis.window = globalThis;
require('../www/config.js');
const S = require('../www/stockage.js');
const T = require('../www/taches.js');
const C = globalThis.CONFIG;
const QUAND = '2026-11-15T10:00:00.000Z';
const neuf = () => S.etatInitial(C);

test('ajout express : nom seul → imprévu, taille moyenne, catégorie par défaut', () => {
  const e = neuf();
  const r = T.creerTache({ nom: '  Appeler   le garage ', categorieId: T.categorieParDefaut(e, C) }, e, C, 'id1', QUAND);
  assert.equal(r.ok, true);
  assert.deepEqual(r.tache, {
    id: 'id1', nom: 'Appeler le garage', categorieId: 'routine', type: 'imprevu', taille: 'moyenne',
    incendieApplique: false, creeLe: QUAND, archivee: false, important: false
  });
});

test('catégorie par défaut = dernière utilisée', () => {
  const e = neuf();
  T.ajouterTache(e, T.creerTache({ nom: 'Lire', categorieId: 'lecture' }, e, C, 'a', QUAND).tache);
  assert.equal(e.reglages.derniereCategorie, 'lecture');
  assert.equal(T.categorieParDefaut(e, C), 'lecture');
  assert.equal(T.categorie(e, 'lecture').nbUtilisations, 1);
  e.reglages.derniereCategorie = 'inexistante';
  assert.equal(T.categorieParDefaut(e, C), 'routine');
});

test('refus : nom vide, catégorie inconnue, objectif invalide, aucun jour', () => {
  const e = neuf();
  assert.match(T.creerTache({ nom: '   ', categorieId: 'lecture' }, e, C, 'x', QUAND).erreur, /nom/);
  assert.match(T.creerTache({ nom: 'A', categorieId: 'zzz' }, e, C, 'x', QUAND).erreur, /catégorie/);
  assert.match(T.creerTache({ nom: 'A', categorieId: 'lecture', objectif: { cible: '0', unite: 'pages' } }, e, C, 'x', QUAND).erreur, /plus grand que 0/);
  assert.match(T.creerTache({ nom: 'A', categorieId: 'lecture', objectif: { cible: '20', unite: ' ' } }, e, C, 'x', QUAND).erreur, /unité/);
  assert.match(T.creerTache({ nom: 'A', categorieId: 'lecture', type: 'quotidienne', jours: [] }, e, C, 'x', QUAND).erreur, /jour/);
  assert.match(T.creerTache({ nom: 'x'.repeat(81), categorieId: 'lecture' }, e, C, 'x', QUAND).erreur, /trop long/);
});

test('quotidienne : tous les jours par défaut, jours triés et dédoublonnés', () => {
  const e = neuf();
  assert.deepEqual(T.creerTache({ nom: 'Muscu', categorieId: 'muscu', type: 'quotidienne' }, e, C, 'q', QUAND).tache.jours, [1, 2, 3, 4, 5, 6, 7]);
  const t = T.creerTache({ nom: 'Muscu', categorieId: 'muscu', type: 'quotidienne', jours: [5, 1, 3, 1, 9] }, e, C, 'q', QUAND).tache;
  assert.deepEqual(t.jours, [1, 3, 5]);
  assert.equal('echeance' in t, false);
});

test('objectif chiffré : virgule acceptée, taille moyenne par défaut mais modifiable', () => {
  const e = neuf();
  const t = T.creerTache({ nom: 'Lire', categorieId: 'lecture', objectif: { cible: '12,5', unite: 'pages' } }, e, C, 'o', QUAND).tache;
  assert.deepEqual(t.objectif, { cible: 12.5, unite: 'pages' });
  assert.equal(t.taille, 'moyenne');
  assert.equal(T.creerTache({ nom: 'Lire', categorieId: 'lecture', taille: 'grosse', objectif: { cible: 50, unite: 'pages' } }, e, C, 'o', QUAND).tache.taille, 'grosse');
});

test('imprévu : échéance facultative et case « important »', () => {
  const e = neuf();
  const t = T.creerTache({ nom: 'Papiers', categorieId: 'papiers', echeance: '2026-11-20', important: true }, e, C, 'i', QUAND).tache;
  assert.equal(t.echeance, '2026-11-20');
  assert.equal(t.important, true);
  assert.match(T.creerTache({ nom: 'P', categorieId: 'papiers', echeance: '20/11' }, e, C, 'i', QUAND).erreur, /invalide/);
});

test('la tâche créée passe la vérification des données', () => {
  const e = neuf();
  for (const [i, s] of [{ nom: 'A', categorieId: 'cours', type: 'bonus', taille: 'petite' },
    { nom: 'B', categorieId: 'course', type: 'quotidienne', objectif: { cible: 30, unite: 'minutes' } }].entries()) {
    T.ajouterTache(e, T.creerTache(s, e, C, 'id' + i, QUAND).tache);
  }
  assert.equal(S.verifier(e), true);
});

test('catégorie perso : créée avec famille, emoji unique, doublon refusé (accents/majuscules ignorés)', () => {
  const e = neuf();
  const r = T.creerCategorie({ nom: 'Guitare', emoji: '🎸 ', familleId: 'creation' }, e, C, 'abc');
  assert.deepEqual(r.categorie, { id: 'perso-abc', nom: 'Guitare', emoji: '🎸', familleId: 'creation', perso: true, nbUtilisations: 0 });
  assert.equal(T.creerCategorie({ nom: 'Famille', emoji: '👨‍👩‍👦👨‍👩‍👦', familleId: 'social' }, e, C, 'f').erreur, 'Cette catégorie existe déjà.');
  assert.equal(T.creerCategorie({ nom: 'REVISION', emoji: '📚', familleId: 'esprit' }, e, C, 'r').erreur, 'Cette catégorie existe déjà.');
  assert.match(T.creerCategorie({ nom: 'X', emoji: '', familleId: 'esprit' }, e, C, 'r').erreur, /emoji/);
  assert.match(T.creerCategorie({ nom: 'X', emoji: '⭐', familleId: 'zzz' }, e, C, 'r').erreur, /famille/);
  assert.equal(T.premierSymbole('👨‍👩‍👦abc'), '👨‍👩‍👦');
});

test('grille : favoris = les plus utilisées (max config), puis 7 familles', () => {
  const e = neuf();
  const utiliser = (id, n) => { T.categorie(e, id).nbUtilisations = n; };
  utiliser('muscu', 5); utiliser('lecture', 9); utiliser('menage', 1);
  const g = T.grilleCategories(e, C);
  assert.deepEqual(g.favoris.map(c => c.id), ['lecture', 'muscu', 'menage']);
  assert.equal(g.parFamille.length, 7);
  assert.equal(g.parFamille.reduce((n, f) => n + f.categories.length, 0), e.categories.length);
  for (let i = 0; i < 10; i++) e.categories[i].nbUtilisations = 20 + i;
  assert.equal(T.grilleCategories(e, C).favoris.length, C.categories.nbFavoris);
});

test('listes : archivées exclues, imprévus par échéance puis sans échéance', () => {
  const M = require('../www/moteur.js');
  const e = neuf();
  const ajouter = (s, id, quand = QUAND) => T.ajouterTache(e, T.creerTache({ categorieId: 'papiers', ...s }, e, C, id, quand).tache);
  ajouter({ nom: 'sans échéance' }, 'a', '2026-11-01T00:00:00.000Z');
  ajouter({ nom: 'tard', echeance: '2026-12-01' }, 'b');
  ajouter({ nom: 'tôt', echeance: '2026-11-18' }, 'c');
  ajouter({ nom: 'quoti', type: 'quotidienne' }, 'd');
  ajouter({ nom: 'bonus', type: 'bonus' }, 'e');
  ajouter({ nom: 'finie', type: 'bonus' }, 'f');
  e.taches.find(t => t.id === 'f').archivee = true;
  const l = M.listesDuJour(e, '2026-11-16', 1);
  assert.deepEqual(l.imprevu.map(t => t.id), ['c', 'b', 'a']);
  assert.deepEqual(l.quotidienne.map(t => t.id), ['d']);
  assert.deepEqual(l.bonus.map(t => t.id), ['e']);
});

test('modifier une catégorie perso : nom et emoji changent, famille, id et compteur gardés ; doublon refusé', () => {
  const e = S.etatInitial(C);
  const cat = T.creerCategorie({ nom: 'Guitare', emoji: '🎸', familleId: 'creation' }, e, C, 'g').categorie;
  e.categories.push(cat);
  cat.nbUtilisations = 4;
  const r = T.modifierCategorie('perso-g', { nom: 'Guitare électrique', emoji: '🎶', familleId: 'corps' }, e, C);
  assert.ok(r.ok, r.erreur);
  assert.deepEqual(r.categorie, { id: 'perso-g', nom: 'Guitare électrique', emoji: '🎶', familleId: 'creation', perso: true, nbUtilisations: 4 });
  T.remplacerCategorie(e, r.categorie);
  assert.equal(T.categorie(e, 'perso-g').nom, 'Guitare électrique');
  // Garder le même nom (seul l'emoji change) : pas un doublon d'elle-même
  assert.ok(T.modifierCategorie('perso-g', { nom: 'guitare ÉLECTRIQUE', emoji: '🎸' }, e, C).ok);
  // Nom d'une autre catégorie, nom vide, catégorie de départ : refusés
  assert.equal(T.modifierCategorie('perso-g', { nom: 'Lecture', emoji: '🎸' }, e, C).ok, false);
  assert.equal(T.modifierCategorie('perso-g', { nom: '  ', emoji: '🎸' }, e, C).ok, false);
  assert.equal(T.modifierCategorie('lecture', { nom: 'Lire', emoji: '📖' }, e, C).ok, false);
});

// Créé par Gauthier Doumont
