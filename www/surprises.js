/* surprises.js — Hameau — surprises du jour : marchand ambulant, tempête (défi), fête — Créé par Gauthier Doumont
 * Règle d'or (skill moteur-recompenses) : le hasard ne donne QUE des bonus. Une tempête est un défi avec
 * récompense : si on ne le relève pas, il ne se passe rien. Le marchand propose, on peut dire non.
 * Fonctions PURES, hasard INJECTÉ (rng) → tests reproductibles (tests/surprises.test.js).
 * État : etat.etat.surprise = {jour, type: null | 'marchand' | 'tempete' | 'fete', …, fini?} (un tirage par jour).
 */
(function (racine) {
  'use strict';
  const Sur = {};
  const Jours = racine.Jours || (typeof require !== 'undefined' ? require('./jours.js') : null);
  const M = racine.Moteur || (typeof require !== 'undefined' ? require('./moteur.js') : null);

  const communes = (C) => C.ressources.map(r => r.id).filter(id => id !== 'gemmes');

  // Choix pondéré parmi les types possibles (rng() dans [0, 1[)
  function choisir(types, poids, rng) {
    const total = types.reduce((a, t) => a + (poids[t] || 0), 0);
    let x = rng() * total;
    for (const t of types) { x -= poids[t] || 0; if (x < 0) return t; }
    return types[types.length - 1];
  }

  // Marchand : ta ressource la plus abondante contre la plus rare (seulement si tu as de quoi échanger)
  function offreMarchand(etat, C) {
    const r = etat.joueur.ressources, lot = C.surprises.marchand.lot;
    const ids = communes(C);
    const donne = ids.reduce((a, b) => (r[b] > r[a] ? b : a));
    const recoit = ids.reduce((a, b) => (r[b] < r[a] ? b : a));
    if (donne === recoit || r[donne] < lot) return null;
    return { donne, recoit, quantiteDonnee: lot, quantiteRecue: Math.round(lot * C.surprises.marchand.taux) };
  }

  /* Tirage de la surprise du jour (une seule fois par jour logique ; rien pendant une pause).
   * Modifie `etat` (dans modifier()) ; renvoie la surprise, ou null si déjà tirée aujourd'hui.
   */
  Sur.aTirer = (etat, jour) => etat.etat?.surprise?.jour !== jour;
  Sur.tirer = function (etat, jour, C, rng) {
    if (!Sur.aTirer(etat, jour)) return null;
    const S = C.surprises;
    let surprise = { jour, type: null };
    if (!Jours.enPause(etat.joueur, jour) && rng() < S.chance) {
      const offre = offreMarchand(etat, C);
      const types = Object.keys(S.poids).filter(t => t !== 'marchand' || offre);
      const type = choisir(types, S.poids, rng);
      if (type === 'marchand') surprise = { jour, type, ...offre };
      else if (type === 'tempete') surprise = { jour, type, cible: S.tempete.taches, recompense: { ...S.tempete.recompense } };
      else if (type === 'fete') {
        const familles = C.familles.filter(f => f.ressource).map(f => f.id);   // (Repos nourrit le moral, pas de ressource)
        surprise = { jour, type, famille: familles[Math.min(familles.length - 1, Math.floor(rng() * familles.length))], bonus: S.fete.bonus };
      }
    }
    etat.etat.surprise = surprise;
    return surprise;
  };

  // La surprise d'aujourd'hui (null si aucune ou si elle date d'un autre jour)
  Sur.duJour = (etat, jour) => {
    const s = etat.etat?.surprise;
    return s && s.jour === jour && s.type ? s : null;
  };

  // Fête : bonus de la famille (calculé par le moteur, M.bonusFete)
  Sur.bonusFete = (etat, jour, familleId) => M.bonusFete(etat, jour, familleId);

  /* Marchand : accepter l'échange (refusé sans rien changer s'il manque la ressource) */
  Sur.echanger = function (etat, jour) {
    const s = Sur.duJour(etat, jour);
    if (s?.type !== 'marchand' || s.fini) return { ok: false, erreur: 'Le marchand est reparti.' };
    if (etat.joueur.ressources[s.donne] < s.quantiteDonnee) return { ok: false, erreur: 'Il te manque un peu de ressources pour cet échange.' };
    etat.joueur.ressources[s.donne] -= s.quantiteDonnee;
    etat.joueur.ressources[s.recoit] += s.quantiteRecue;
    s.fini = 'echange';
    return { ok: true, surprise: s };
  };
  Sur.decliner = function (etat, jour) {
    const s = Sur.duJour(etat, jour);
    if (s && !s.fini) s.fini = 'decline';
  };

  /* Tempête : le défi est relevé par le moteur à chaque saisie (M.releverDefi, résultat r.defi) */
  Sur.avancement = (etat, jour) => M.terminesDuJour(etat.journal, jour);

  if (typeof module !== 'undefined') module.exports = Sur; else racine.Surprises = Sur;
})(typeof window !== 'undefined' ? window : globalThis);
