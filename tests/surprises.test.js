// tests/surprises.test.js — Hameau — surprises du jour : le hasard ne donne que des bonus — Créé par Gauthier Doumont
const test = require('node:test');
const assert = require('node:assert/strict');

globalThis.window = globalThis;
require('../www/config.js');
const S = require('../www/stockage.js');
const T = require('../www/taches.js');
const M = require('../www/moteur.js');
const Sur = require('../www/surprises.js');
const C = globalThis.CONFIG;
const JOUR = '2026-11-16';
const suite = (...v) => { let i = 0; return () => v[Math.min(i++, v.length - 1)]; };   // hasard injecté
const cumul = (e) => Object.values(e.joueur.ressources).reduce((a, b) => a + b, 0);

function etat(ressources = {}) {
  const e = S.etatInitial(C);
  Object.assign(e.joueur.ressources, ressources);
  ['a', 'b', 'c', 'd'].forEach(id => T.ajouterTache(e, T.creerTache({ nom: 'Tâche ' + id, categorieId: 'lecture' }, e, C, id, '2026-11-10T08:00:00.000Z').tache));
  return e;
}
const saisir = (e, id, jour = JOUR) => M.saisir(e, id, null, { id: 's' + id + jour, horodatage: jour + 'T10:00:00.000Z', jour }, C);

test('un seul tirage par jour ; pas de surprise si le hasard est au-dessus de la chance', () => {
  const e = etat();
  assert.deepEqual(Sur.tirer(e, JOUR, C, suite(0.99)), { jour: JOUR, type: null });
  assert.equal(Sur.tirer(e, JOUR, C, suite(0)), null);            // déjà tiré aujourd'hui
  assert.equal(Sur.duJour(e, JOUR), null);
  assert.equal(Sur.aTirer(e, '2026-11-17'), true);
  assert.equal(S.verifier(e, C), true);
});

test('rien pendant une pause', () => {
  const e = etat({ bois: 100 });
  e.joueur.pause = { actif: true, depuis: '2026-11-15', jusqua: null };
  assert.equal(Sur.tirer(e, JOUR, C, suite(0)).type, null);
});

test('marchand : ta ressource la plus abondante contre la plus rare, échange avantageux et facultatif', () => {
  const e = etat({ bois: 100, savoir: 40 });
  const s = Sur.tirer(e, JOUR, C, suite(0, 0));                    // chance OK, 1er type = marchand
  assert.equal(s.type, 'marchand');
  assert.equal(s.donne, 'bois');
  assert.equal(s.quantiteDonnee, C.surprises.marchand.lot);
  assert.ok(s.quantiteRecue > s.quantiteDonnee, 'toujours avantageux');
  assert.notEqual(s.recoit, 'gemmes');
  const avant = cumul(e);
  assert.equal(Sur.echanger(e, JOUR).ok, true);
  assert.equal(e.joueur.ressources.bois, 100 - s.quantiteDonnee);
  assert.ok(cumul(e) > avant);
  assert.equal(Sur.echanger(e, JOUR).ok, false);                  // une seule fois
  assert.equal(S.verifier(e, C), true);
});

test('marchand : pas proposé sans assez de ressources ; dire non ne coûte rien', () => {
  const pauvre = etat({ bois: 5 });
  assert.notEqual(Sur.tirer(pauvre, JOUR, C, suite(0, 0)).type, 'marchand');
  const e = etat({ bois: 100 });
  Sur.tirer(e, JOUR, C, suite(0, 0));
  const avant = structuredClone(e.joueur.ressources);
  Sur.decliner(e, JOUR);
  assert.deepEqual(e.joueur.ressources, avant);
  assert.equal(Sur.echanger(e, JOUR).ok, false);
});

test('tempête = défi : N tâches terminées → récompense une seule fois ; rien de perdu sinon', () => {
  const e = etat();
  const s = Sur.tirer(e, JOUR, C, suite(0, 0));                   // pas de marchand possible (0 ressource) → tempête
  assert.equal(s.type, 'tempete');
  const ids = ['a', 'b', 'c', 'd'];
  let r;
  for (let i = 0; i < C.surprises.tempete.taches; i++) r = saisir(e, ids[i]);
  assert.deepEqual(r.defi, C.surprises.tempete.recompense);
  assert.equal(Sur.duJour(e, JOUR).fini, 'releve');
  const bois = e.joueur.ressources.bois;
  assert.equal(saisir(e, 'd').defi, null);                         // pas deux fois
  assert.equal(e.joueur.ressources.bois, bois + 0);
  // Défi pas relevé : le lendemain, rien n'est retiré
  const f = etat();
  Sur.tirer(f, JOUR, C, suite(0, 0));
  saisir(f, 'a');
  const avant = structuredClone(f.joueur.ressources);
  Sur.tirer(f, '2026-11-17', C, suite(0.99));
  assert.deepEqual(f.joueur.ressources, avant);
});

test('fête : +20 % pour une famille aujourd\'hui seulement, calculé dans le moteur', () => {
  const e = etat();
  e.etat.surprise = { jour: JOUR, type: 'fete', famille: 'esprit', bonus: C.surprises.fete.bonus };
  const tache = e.taches[0];
  assert.equal(M.multiplicateurs(tache, e, C, JOUR, 'esprit').fete, 1 + C.surprises.fete.bonus);
  assert.equal(M.multiplicateurs(tache, e, C, JOUR, 'corps').fete, 1);
  assert.equal(M.multiplicateurs(tache, e, C, '2026-11-17', 'esprit').fete, 1);
  const base = Math.round(C.tailles.moyenne * C.types.imprevu);
  assert.equal(saisir(e, 'a').gain, Math.round(base * (1 + C.surprises.fete.bonus)));
});

test('fête : famille tirée parmi celles qui rapportent une ressource ; jamais de perte, sur 500 jours', () => {
  const e = etat({ bois: 200, savoir: 50 });
  let graine = 7;
  const rng = () => ((graine = (graine * 16807) % 2147483647) / 2147483647);
  let jour = JOUR;
  for (let i = 0; i < 500; i++) {
    const avant = cumul(e);
    const s = Sur.tirer(e, jour, C, rng);
    if (s.type === 'fete') assert.ok(C.familles.find(f => f.id === s.famille)?.ressource);
    assert.ok(cumul(e) >= avant, 'un tirage ne retire jamais rien');
    jour = require('../www/temps.js').ajouterJours(jour, 1);
  }
  assert.equal(S.verifier(e, C), true);
});
