// tests/muscu.test.js — Hameau — import des séances de l'appli Muscu (export FICTIF) — Créé par Gauthier Doumont
process.env.TZ = 'Europe/Brussels';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

globalThis.window = globalThis;
require('../www/config.js');
const S = require('../www/stockage.js');
const Mu = require('../www/muscu.js');
const C = globalThis.CONFIG;
const EXPORT = fs.readFileSync(path.join(__dirname, 'fixtures', 'muscu-export.json'), 'utf8');
const LUNDI_10H = new Date('2026-11-16T09:00:00Z');
let n = 0;
const id = () => 'imp' + (++n);

test('lecture de l\'export : séances gardées, fichiers étrangers ou trop récents refusés', () => {
  const r = Mu.analyser(EXPORT);
  assert.equal(r.ok, true);
  assert.equal(r.seances.length, 6);
  assert.deepEqual(Object.keys(r.seances[0]).sort(), ['debut', 'durMin', 'id', 'kind', 'km', 'series', 'titre']);   // rien d'autre n'est copié
  assert.match(Mu.analyser('pas du json').message, /appli Muscu/);
  assert.match(Mu.analyser('{"app":"autre","data":{"sessions":[]}}').message, /appli Muscu/);
  assert.match(Mu.analyser(JSON.stringify({ ...JSON.parse(EXPORT), format: 99 })).message, /plus récente/);
});

test('plan : jour logique (02:30 → la veille), 14 jours max, future ignorée, taille selon durée ou distance', () => {
  const e = S.etatInitial(C);
  const plan = Mu.planifier(e, Mu.analyser(EXPORT).seances, LUNDI_10H, C);
  const par = Object.fromEntries(plan.map(p => [p.seance.id, p]));
  assert.equal(par['seance-c'].jour, '2026-11-15');                  // 2 h 30 du matin : encore dimanche
  assert.equal(par['seance-ancienne'].statut, 'ancienne');
  assert.equal(par['seance-future'].statut, 'future');
  assert.deepEqual(plan.filter(p => p.statut === 'nouvelle').map(p => p.seance.id), ['course-d', 'seance-a', 'seance-b', 'seance-c']);
  assert.equal(par['seance-a'].taille, 'grosse');                    // 52 min
  assert.equal(par['seance-b'].taille, 'moyenne');                   // 25 min
  assert.equal(par['seance-c'].taille, 'petite');                    // 12 min
  assert.equal(par['course-d'].taille, 'grosse');                    // 6,2 km
  assert.equal(par['course-d'].categorieId, 'course');
  assert.equal(par['seance-b'].categorieId, 'muscu');
});

test('import : XP et 🪨 Pierre comme des tâches faites, une seule fois par séance', () => {
  const e = S.etatInitial(C);
  const seances = Mu.analyser(EXPORT).seances;
  const r = Mu.importer(e, Mu.planifier(e, seances, LUNDI_10H, C), id, C);
  const attendu = [50, 50, 25, 10].reduce((a, x) => a + x * C.types[C.muscu.type], 0);   // grosse, grosse, moyenne, petite
  assert.equal(r.importees, 4);
  assert.equal(r.anciennes, 2);
  assert.equal(r.xp, attendu);
  assert.deepEqual(r.ressources, { pierre: attendu });
  assert.equal(e.joueur.ressources.pierre, attendu);
  assert.equal(e.joueur.gagneTotal.corps, attendu);
  assert.equal(e.journal.filter(s => s.muscu).length, 4);
  assert.ok(e.journal.every(s => s.tacheId === null && !s.coffre));
  assert.equal(S.verifier(e, C), true);
  // Ré-importer le même fichier : rien de plus
  const r2 = Mu.importer(e, Mu.planifier(e, seances, LUNDI_10H, C), id, C);
  assert.equal(r2.importees, 0);
  assert.equal(r2.deja, 4);
  assert.equal(e.joueur.ressources.pierre, attendu);
});

test('vérification : séance comptée deux fois → refusé', () => {
  const e = S.etatInitial(C);
  Mu.importer(e, Mu.planifier(e, Mu.analyser(EXPORT).seances, LUNDI_10H, C), id, C);
  e.journal.push({ ...e.journal.find(s => s.muscu), id: 'copie' });
  assert.throws(() => S.verifier(e, C), /séance de muscu notée deux fois/);
});
