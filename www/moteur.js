/* moteur.js — Hameau — gains, progression et niveaux — Créé par Gauthier Doumont
 * Fonctions PURES (pas d'horloge, pas de hasard, pas de DOM) : testées dans node (tests/moteur.test.js).
 * Étape 4 : gain de BASE (taille). Les multiplicateurs (type, série, repos, anti-farm) et les coffres arrivent à l'étape 5a.
 */
(function (racine) {
  'use strict';
  const M = {};

  /* ===== GAIN BRUT D'UNE TÂCHE (non arrondi) ===== */
  M.brut = function (tache, C) {
    return C.tailles[tache.taille] ?? C.tailles.moyenne;
  };

  // Ressource gagnée par une catégorie (null pour la famille Repos, qui nourrit le moral)
  M.ressourceDe = function (categorie, C) {
    return C.familles.find(f => f.id === categorie?.familleId)?.ressource ?? null;
  };

  /* ===== PROGRESSION =====
   * Quotidienne : progression du jour logique seulement (elle ne rapporte qu'une fois par jour).
   * Imprévu / bonus : progression cumulée depuis la création (un objectif peut s'étaler sur plusieurs jours).
   * Chaque entrée du journal garde la progression APRÈS la saisie → on prend la dernière.
   */
  M.progression = function (tache, journal, jour) {
    let p = 0;
    for (const s of journal) {
      if (s.tacheId !== tache.id) continue;
      if (tache.type === 'quotidienne' && s.jour !== jour) continue;
      p = s.progression;
    }
    return Math.min(1, p);
  };

  // Gain d'une saisie = gain(après) − gain(avant) : la somme des saisies retombe exactement sur le gain complet
  M.gainsSaisie = function (brut, avant, apres) {
    const total = p => Math.round(brut * p);
    return total(apres) - total(avant);
  };

  // Ce qu'il reste à gagner sur la tâche (affiché sur la carte : « +25 📜 »)
  M.gainRestant = function (tache, journal, jour, C) {
    return M.gainsSaisie(M.brut(tache, C), M.progression(tache, journal, jour), 1);
  };

  /* ===== NIVEAUX ===== */
  M.xpPourNiveau = (n, C) => Math.round(C.niveau.base * n ** C.niveau.exposant);
  M.ajouterXp = function (xpDansNiveau, niveau, gain, C) {
    let xp = xpDansNiveau + gain, n = niveau;
    while (xp >= M.xpPourNiveau(n, C)) { xp -= M.xpPourNiveau(n, C); n++; }
    return { xp, niveau: n, niveauxGagnes: n - niveau };
  };

  // Stats = cumul total gagné / diviseur (recalculées, jamais incrémentées à la main)
  M.stats = function (gagneTotal, C) {
    const s = {};
    for (const f of C.familles) if (f.stat) s[f.stat] = Math.floor((gagneTotal[f.id] || 0) / C.stat.diviseur);
    return s;
  };

  /* ===== SAISIE =====
   * Modifie `etat` (à appeler dans modifier()). quantite = nombre saisi pour un objectif chiffré,
   * ou null = « terminer » (cocher). ctx = {id, horodatage, jour}.
   * → {ok: true, gain, ressource, progression, terminee, niveauxGagnes} ou {ok: false, erreur}
   */
  M.saisir = function (etat, tacheId, quantite, ctx, C) {
    const tache = etat.taches.find(t => t.id === tacheId);
    if (!tache || tache.archivee) return { ok: false, erreur: 'Tâche introuvable.' };
    const categorie = etat.categories.find(c => c.id === tache.categorieId);
    const avant = M.progression(tache, etat.journal, ctx.jour);
    if (avant >= 1) return { ok: false, erreur: 'Déjà fait aujourd\'hui ✅' };

    let apres, valeur;
    if (quantite === null || quantite === undefined) {
      apres = 1;
      valeur = tache.objectif ? +(tache.objectif.cible * (1 - avant)).toFixed(4) : 1;
    } else {
      valeur = Number(quantite);
      if (!(valeur > 0) || !Number.isFinite(valeur)) return { ok: false, erreur: 'Entre un nombre plus grand que 0.' };
      if (!tache.objectif) return { ok: false, erreur: 'Cette tâche n\'a pas d\'objectif chiffré.' };
      apres = Math.min(1, avant + valeur / tache.objectif.cible);
    }

    const gain = M.gainsSaisie(M.brut(tache, C), avant, apres);
    const ressource = M.ressourceDe(categorie, C);
    etat.journal.push({
      id: ctx.id, tacheId, horodatage: ctx.horodatage, jour: ctx.jour, valeur,
      progression: apres, gains: { xp: gain, ressource, quantite: ressource ? gain : 0 }
    });

    const j = etat.joueur;
    const niv = M.ajouterXp(j.xp, j.niveau, gain, C);
    j.xp = niv.xp; j.niveau = niv.niveau; j.xpTotal += gain;
    if (ressource) j.ressources[ressource] += gain;
    if (categorie) j.gagneTotal[categorie.familleId] = (j.gagneTotal[categorie.familleId] || 0) + gain;
    j.stats = { ...j.stats, ...M.stats(j.gagneTotal, C) };

    const terminee = apres >= 1;
    if (terminee && tache.type !== 'quotidienne') { tache.archivee = true; tache.termineeLe = ctx.horodatage; }
    return { ok: true, gain, ressource, progression: apres, terminee, niveauxGagnes: niv.niveauxGagnes };
  };

  /* ===== LISTES DU JOUR =====
   * Quotidiennes prévues ce jour-là (faites ou non), imprévus par échéance, bonus. Tâches archivées exclues.
   */
  M.listesDuJour = function (etat, jour, jourIso) {
    const actives = etat.taches.filter(t => !t.archivee);
    const parCreation = (a, b) => (a.creeLe || '').localeCompare(b.creeLe || '');
    const quotidiennes = actives.filter(t => t.type === 'quotidienne');
    const prevues = quotidiennes.filter(t => (t.jours || []).includes(jourIso));
    const fait = t => M.progression(t, etat.journal, jour) >= 1;
    return {
      quotidienne: prevues.sort((a, b) => fait(a) - fait(b) || parCreation(a, b)),
      autresJours: quotidiennes.length - prevues.length,
      imprevu: actives.filter(t => t.type === 'imprevu').sort((a, b) => {
        if (a.echeance && b.echeance) return a.echeance.localeCompare(b.echeance) || parCreation(a, b);
        if (a.echeance || b.echeance) return a.echeance ? -1 : 1;
        return parCreation(a, b);
      }),
      bonus: actives.filter(t => t.type === 'bonus').sort(parCreation)
    };
  };

  if (typeof module !== 'undefined') module.exports = M; else racine.Moteur = M;
})(typeof window !== 'undefined' ? window : globalThis);
