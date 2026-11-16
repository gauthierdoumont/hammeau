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
  assert.equal(r.anciennes, 1);
  assert.equal(r.futures, 1);                          // pas encore passée : comptée à part (texte neutre)
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

/* ===== Vérification 4 (D3, D4, D7 à D10) ===== */
const Bi = require('../www/bilan.js');
const fichier = (sessions) => JSON.stringify({ app: 'muscu-gd', format: 1, data: { sessions } });
const seance = (sid, iso, extra = {}) => ({ id: sid, kind: 'muscu', title: 'Séance', start: Date.parse(iso), durMin: 30, ...extra });
const importer = (e, sessions, instant = LUNDI_10H) => Mu.importer(e, Mu.planifier(e, Mu.analyser(fichier(sessions)).seances, instant, C), id, C);

test('séances importées : catégorie notée dans le journal → bilan et historique les mettent dans la famille Corps', () => {
  const e = S.etatInitial(C);
  importer(e, [seance('a', '2026-11-16T07:00:00Z'), { id: 'c', kind: 'course', start: Date.parse('2026-11-15T07:00:00Z'), km: 7 }]);
  assert.deepEqual(e.journal.map(s => s.categorieId).sort(), ['course', 'muscu']);
  assert.equal(S.verifier(e, C), true);
  const xp = e.journal.reduce((a, s) => a + s.gains.xp, 0);
  assert.deepEqual(Bi.semaine(e, '2026-11-16', C).familles, [{ id: 'corps', xp: e.journal.find(s => s.muscu === 'a').gains.xp }]);
  assert.deepEqual(Bi.semaine(e, '2026-11-09', C).familles, [{ id: 'corps', xp: xp - e.journal.find(s => s.muscu === 'a').gains.xp }]);
  // Saisies d'avant (sans categorieId) : repli muscu → Muscu, cours → Cours
  assert.equal(Bi.categorieDe(e, { muscu: 'x', tacheId: null }, C), C.muscu.categories.muscu);
  assert.equal(Bi.categorieDe(e, { cours: 'x', tacheId: null }, C), C.cours.categorieId);
  const ancien = structuredClone(e);
  ancien.journal.forEach(s => delete s.categorieId);
  assert.deepEqual(Bi.semaine(ancien, '2026-11-16', C).familles.map(f => f.id), ['corps']);
});

test('même id deux fois dans un fichier : compté une seule fois, et les données restent valides', () => {
  const e = S.etatInitial(C);
  const plan = Mu.planifier(e, Mu.analyser(fichier([seance('x', '2026-11-15T10:00:00Z'), seance('x', '2026-11-15T10:00:00Z')])).seances, LUNDI_10H, C);
  assert.deepEqual(plan.map(p => p.statut), ['nouvelle', 'deja']);
  const r = Mu.importer(e, plan, id, C);
  assert.equal(r.importees, 1);
  assert.equal(r.deja, 1);
  assert.equal(S.verifier(e, C), true);
});

test('séance future : comptée à part (futures), pas avec les anciennes', () => {
  const e = S.etatInitial(C);
  const r = importer(e, [seance('f', '2026-11-16T12:00:00Z'), seance('v', '2026-10-01T10:00:00Z')]);
  assert.deepEqual([r.importees, r.futures, r.anciennes], [0, 1, 1]);
});

test('date illisible (start énorme) : séance ignorée, aucune erreur', () => {
  for (const start of [9e15, 1e17, -1e17, 1e300]) {
    const lu = Mu.analyser(fichier([{ id: 'z', kind: 'muscu', start, durMin: 30 }, seance('ok', '2026-11-15T10:00:00Z')]));
    assert.deepEqual(lu.seances.map(s => s.id), ['ok'], String(start));
    assert.doesNotThrow(() => importer(S.etatInitial(C), [{ id: 'z', kind: 'muscu', start, durMin: 30 }]));
  }
});

test('type de séance « constructor » / « toString » : catégorie Muscu, pas une fonction', () => {
  for (const kind of ['constructor', 'toString', '__proto__', 'inconnu']) {
    const e = S.etatInitial(C);
    const plan = Mu.planifier(e, Mu.analyser(fichier([seance('k', '2026-11-15T10:00:00Z', { kind })])).seances, LUNDI_10H, C);
    assert.equal(plan[0].categorieId, C.muscu.categories.muscu, kind);
    const r = Mu.importer(e, plan, id, C);
    assert.ok(r.xp > 0 && r.ressources.pierre === r.xp, kind);
    assert.equal(S.verifier(e, C), true);
  }
});

test('tempête du jour relevée pendant l\'import : récompense remontée dans le résultat', () => {
  const e = S.etatInitial(C);
  e.etat.surprise = { jour: '2026-11-16', type: 'tempete', cible: 2, recompense: { bois: 30, pierre: 30 } };
  const r = importer(e, [seance('t1', '2026-11-16T06:00:00Z'), seance('t2', '2026-11-16T07:00:00Z')]);
  assert.deepEqual(r.defi, { bois: 30, pierre: 30 });
  assert.equal(e.etat.surprise.fini, 'releve');
  assert.equal(importer(S.etatInitial(C), [seance('t3', '2026-11-16T06:00:00Z')]).defi, null);
});
