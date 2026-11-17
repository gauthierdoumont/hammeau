// Hameau — simulation de l'économie (même moteur + même config que l'appli) — Créé par Gauthier Doumont
// Usage : node outils/simulation.js [profil|tous] [jours] [graines]
// Pourquoi : vérifier l'objectif du CLAUDE.md (≈ 4 mois d'usage régulier pour tout monter au niveau 5)
// avant de toucher config.js, et chiffrer un rééquilibrage.
globalThis.window = globalThis;
require('../www/config.js');
const S = require('../www/stockage.js');
const T = require('../www/taches.js');
const M = require('../www/moteur.js');
const E = require('../www/economie.js');
const C = globalThis.CONFIG;
// Essayer un rééquilibrage SANS toucher config.js : SIM_CONFIG='{"mairie":{"niveauJoueurRequis":[1,3,6,10,14]}}'
if (process.env.SIM_CONFIG) {
  const fusion = (a, b) => { for (const [k, v] of Object.entries(b)) a[k] = v && typeof v === 'object' && !Array.isArray(v) ? fusion(a[k] || {}, v) : v; return a; };
  fusion(C, JSON.parse(process.env.SIM_CONFIG));
}

const PROFILS = {
  leger:    { taches: 4,  actifs: 0.70 },
  regulier: { taches: 7,  actifs: 0.85 },
  intense:  { taches: 12, actifs: 0.95 },
};
const [profilArg = 'tous', joursArg = '200', grainesArg = '20'] = process.argv.slice(2);
// Tâches de la semaine (v1.8.0) : SIM_SEMAINE=0.2 → 20 % des tâches faites sont une étape d'une tâche de la semaine
// (5 fois par semaine, moyenne, une par famille). Même effort qu'avant : seule la façon de compter change (bonus, dépassement à moitié).
const PART_SEMAINE = Number(process.env.SIM_SEMAINE) || 0;
const JOURS = +joursArg, GRAINES = +grainesArg;

function mulberry32(a) { return function () {
  let t = a += 0x6D2B79F5; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61);
  return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const choisir = (rng, poids) => { let x = rng() * poids.reduce((a, [, p]) => a + p, 0); for (const [v, p] of poids) { if ((x -= p) < 0) return v; } return poids[0][0]; };
// Jalons du chef = niveaux demandés par la Mairie (au-delà du 1er) : suivent config.js à chaque rééquilibrage
const NIVEAUX_CHEF = [...new Set(C.mairie.niveauJoueurRequis.filter(n => n > 1))].sort((a, b) => a - b);
// Jalons de la Mairie (1, milieu, max) et « tout au max » : tirés de config.js (nombre de bâtiments, niveau max)
const NIV_MAX = C.batiments.niveauMax;
const NIVEAUX_MAIRIE = [...new Set([1, Math.ceil(NIV_MAX / 2), NIV_MAX])];
const jourDe = (i) => new Date(Date.UTC(2026, 0, 5 + i)).toISOString().slice(0, 10);   // 5 janvier 2026 = un lundi

function simuler(profil, graine) {
  const rng = mulberry32(graine);
  const e = S.etatInitial(C);
  const catParFamille = Object.fromEntries(C.familles.map(f => [f.id, e.categories.find(c => c.familleId === f.id).id]));
  const jalons = { niveau: {}, mairie: {}, tout5: null };
  const goulot = {};
  let joursAntiFarm = 0, id = 0, x = 0;
  // Une tâche de la semaine (5 fois) par famille qui rapporte une ressource : toutes les ressources restent nourries
  // (deux tâches dans deux familles seulement ralentissaient le village : 154 j au lieu de 125, faute de pierre et de bois)
  const semaines = PART_SEMAINE ? C.familles.filter(f => f.ressource).map((f, i) => {
    const t = T.creerTache({ nom: 'Semaine ' + i, categorieId: catParFamille[f.id], type: 'semaine', objectif: { cible: 5 } }, e, C, 'sem' + i, jourDe(0)).tache;
    e.taches.push(t);
    return t;
  }) : [];
  for (let i = 0; i < JOURS; i++) {
    const jour = jourDe(i);
    let xpJour = 0;
    if (rng() < profil.actifs) {
      for (let k = 0; k < profil.taches; k++) {
        if (semaines.length && rng() < PART_SEMAINE) {
          const t = semaines[Math.floor(rng() * semaines.length)];
          xpJour += M.saisir(e, t.id, null, { id: 's' + (++id), horodatage: jour, jour, rng }, C).gain;
          continue;
        }
        const famille = C.familles[Math.floor(rng() * C.familles.length)].id;
        const s = { nom: 't', categorieId: catParFamille[famille],
          type: choisir(rng, [['quotidienne', 50], ['imprevu', 35], ['bonus', 15]]),
          taille: choisir(rng, [['petite', 30], ['moyenne', 50], ['grosse', 20]]) };
        const t = T.creerTache(s, e, C, 't' + (++id), jour).tache;
        e.taches.push(t);
        const r = M.saisir(e, t.id, null, { id: 's' + id, horodatage: jour, jour, rng }, C);
        xpJour += r.gain;
        e.taches.splice(e.taches.indexOf(t), 1);   // la liste reste courte (le journal garde tout)
      }
      if (M.terminesDuJour(e.journal, jour) > C.antiFarm.seuil) joursAntiFarm++;
    }
    // Série simplifiée (l'étape 6 a la règle complète) : jour validé si ≥ xpMinJour
    const lundi = new Date(jour + 'T00:00:00Z').getUTCDay() === 1;
    if (lundi) e.joueur.serie.joker = C.serie.jokersParSemaine;
    if (xpJour >= C.serie.xpMinJour) e.joueur.serie.jours++;
    else if (e.joueur.serie.joker > 0) e.joueur.serie.joker--;
    else e.joueur.serie.jours = 0;
    // Achats gloutons : la Mairie dès que possible, sinon le bâtiment le plus bas abordable
    for (;;) {
      const possibles = C.batiments.ordre.map(type => ({ type, p: E.possibilite(e, type, C) }))
        .filter(({ p }) => !p.bloque);
      for (const { p } of possibles) for (const r of Object.keys(p.manque)) goulot[r] = (goulot[r] || 0) + 1;
      const faisables = possibles.filter(({ p }) => E.faisable(p));
      if (!faisables.length) break;
      const niveau = (type) => E.batiment(e, type)?.niveau || 0;
      const choix = faisables.find(f => f.type === 'mairie') || faisables.sort((a, b) => niveau(a.type) - niveau(b.type))[0];
      const bat = E.batiment(e, choix.type);
      if (bat) E.ameliorer(e, bat.id, C); else E.construire(e, choix.type, x++, 0, { id: 'b' + x, quand: jour }, C);
      if (choix.type === 'mairie') jalons.mairie[E.batiment(e, 'mairie').niveau] ??= i + 1;
    }
    for (const n of NIVEAUX_CHEF) if (e.joueur.niveau >= n) jalons.niveau[n] ??= i + 1;
    const bats = e.village.batiments;
    if (jalons.tout5 === null && bats.length === C.batiments.ordre.length && bats.every(b => b.niveau >= NIV_MAX)) jalons.tout5 = i + 1;
  }
  const goulotPrincipal = Object.entries(goulot).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—';
  return { jalons, goulot: goulotPrincipal, antiFarm: joursAntiFarm / JOURS, niveauFinal: e.joueur.niveau,
    batiments: e.village.batiments.reduce((s, b) => s + b.niveau, 0) };
}

const mediane = (xs) => { const v = xs.filter(x => x != null).sort((a, b) => a - b); return v.length ? v[Math.floor(v.length / 2)] : null; };
const aff = (x) => (x == null ? `> ${JOURS}` : String(x));
const lignes = [];
for (const [nom, profil] of Object.entries(PROFILS)) {
  if (profilArg !== 'tous' && profilArg !== nom) continue;
  const runs = Array.from({ length: GRAINES }, (_, g) => simuler(profil, 1000 + g));
  const m = (f) => aff(mediane(runs.map(f)));
  const goulots = {}; runs.forEach(r => { goulots[r.goulot] = (goulots[r.goulot] || 0) + 1; });
  lignes.push(`| ${nom} | ${NIVEAUX_CHEF.map(n => m(r => r.jalons.niveau[n])).join(' | ')} | ` +
    `${NIVEAUX_MAIRIE.map(n => m(r => r.jalons.mairie[n])).join(' / ')} | ${m(r => r.jalons.tout5)} | ` +
    `${Object.entries(goulots).sort((a, b) => b[1] - a[1])[0][0]} | ${Math.round(mediane(runs.map(r => r.antiFarm)) * 100)} % |`);
}
console.log(`Simulation sur ${JOURS} jours, ${GRAINES} graines, médianes (en jours)${PART_SEMAINE ? `, ${Math.round(PART_SEMAINE * 100)} % d'étapes de la semaine` : ''} :\n`);
console.log(`| Profil | ${NIVEAUX_CHEF.map((n, i) => (i ? 'niv. ' : 'Chef niv. ') + n).join(' | ')} | Mairie ${NIVEAUX_MAIRIE.join(' / ')} | Tout niveau ${NIV_MAX} | Ressource goulot | Jours anti-farm |`);
console.log('|' + '---|'.repeat(NIVEAUX_CHEF.length + 5));
console.log(lignes.join('\n'));
