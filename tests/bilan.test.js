// tests/bilan.test.js — Hameau — bilan de la semaine — Créé par Gauthier Doumont
const test = require('node:test');
const assert = require('node:assert/strict');

globalThis.window = globalThis;
require('../www/config.js');
const S = require('../www/stockage.js');
const T = require('../www/taches.js');
const M = require('../www/moteur.js');
const Bi = require('../www/bilan.js');
const C = globalThis.CONFIG;

let n = 0;
function faire(e, jour, categorieId = 'lecture', taille = 'moyenne') {
  const id = 't' + (++n);
  T.ajouterTache(e, T.creerTache({ nom: 'Tâche ' + id, categorieId, taille }, e, C, id, '2026-11-01T08:00:00.000Z').tache);
  return M.saisir(e, id, null, { id: 's' + id, horodatage: jour + 'T10:00:00.000Z', jour }, C).gain;
}

test('lundi de la semaine', () => {
  assert.equal(Bi.lundi('2026-11-16'), '2026-11-16');
  assert.equal(Bi.lundi('2026-11-22'), '2026-11-16');
  assert.equal(Bi.lundi('2026-11-18'), '2026-11-16');
});

test('XP par jour, tâches, jours actifs, familles triées, meilleur jour, présence à un cours comptée', () => {
  const e = S.etatInitial(C);
  const a = faire(e, '2026-11-16');                              // Esprit
  const b = faire(e, '2026-11-18', 'muscu', 'grosse');           // Corps
  const c = faire(e, '2026-11-18', 'lecture', 'petite');
  M.jYEtais(e, { cle: 'cours|1', titre: 'Cours', debut: '2026-11-19T07:30:00.000Z' }, { id: 'p', horodatage: '2026-11-19T09:00:00.000Z', jour: '2026-11-19' }, C);
  faire(e, '2026-11-24');                                        // semaine suivante : pas comptée
  const s = Bi.semaine(e, '2026-11-16', C);
  assert.equal(s.dimanche, '2026-11-22');
  assert.deepEqual(s.jours.map(j => j.xp), [a, 0, b + c, 25, 0, 0, 0]);
  assert.equal(s.taches, 4);
  assert.equal(s.joursActifs, 3);
  assert.deepEqual(s.meilleurJour, { jour: '2026-11-18', xp: b + c });
  assert.deepEqual(s.familles.map(f => f.id), b > a + c + 25 ? ['corps', 'esprit'] : ['esprit', 'corps']);
  assert.equal(s.familles.reduce((x, f) => x + f.xp, 0), s.xp);
});

test('évolution par rapport à la semaine d\'avant ; accroche toujours positive', () => {
  const e = S.etatInitial(C);
  assert.equal(Bi.semaine(e, '2026-11-16', C).evolution, null);
  assert.match(Bi.accroche(Bi.semaine(e, '2026-11-16', C), C), /calme/);
  faire(e, '2026-11-10');
  faire(e, '2026-11-16'); faire(e, '2026-11-17', 'lecture', 'grosse');
  const s = Bi.semaine(e, '2026-11-16', C);
  assert.ok(s.evolution > 0);
  assert.match(Bi.accroche(s, C), /^\+\d+ %/);
  const moins = Bi.semaine(e, '2026-11-23', C);                   // semaine vide après une bonne : rien de négatif
  for (const x of [s, moins, Bi.semaine(e, '2026-11-09', C)]) assert.ok(!/\b(raté|échec|seulement|oublié|paresse|tu dois|moins)\b/i.test(Bi.accroche(x, C)));
});

test('accroche : seulement des saisies partielles (aucune tâche finie) → l\'XP gagnée, jamais « 0 tâche »', () => {
  const e = S.etatInitial(C);
  const id = 'partielle';
  T.ajouterTache(e, T.creerTache({ nom: 'Lire 20 pages', categorieId: 'lecture', type: 'imprevu', objectif: { cible: 20, unite: 'pages' } }, e, C, id, '2026-11-01T08:00:00.000Z').tache);
  M.saisir(e, id, 5, { id: 'p1', horodatage: '2026-11-17T10:00:00.000Z', jour: '2026-11-17' }, C);
  const s = Bi.semaine(e, '2026-11-16', C);
  assert.equal(s.taches, 0);
  assert.ok(s.xp > 0);
  assert.equal(Bi.accroche(s, C), `+${s.xp} XP cette semaine : chaque pas compte ✨`);
  // Seuils tirés de config.js
  assert.match(Bi.accroche({ ...s, joursActifs: C.bilan.joursActifsBravo }, C), /jours actifs sur 7/);
  assert.match(Bi.accroche({ ...s, evolution: C.bilan.evolutionMin }, C), /^\+\d+ %/);
  assert.doesNotMatch(Bi.accroche({ ...s, evolution: C.bilan.evolutionMin / 2 }, C), /%/);
});
