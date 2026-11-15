/* moteur.js — Hameau — gains, progression et niveaux — Créé par Gauthier Doumont
 * Fonctions PURES (pas d'horloge, pas de hasard, pas de DOM) : testées dans node (tests/moteur.test.js).
 * Étape 4 : gain de BASE (taille). Les multiplicateurs (type, série, repos, anti-farm) et les coffres arrivent à l'étape 5a.
 *
 * Principe (robuste aux arrondis et aux modifications de tâche) :
 * - progression = somme des quantités saisies / cible (on additionne des quantités, pas des pourcentages) ;
 * - gain d'une saisie = gain total mérité maintenant − ce que la tâche a déjà rapporté (jamais négatif).
 *   → la somme des saisies retombe toujours sur le gain complet, même si la taille ou la cible a changé entre-temps.
 */
(function (racine) {
  'use strict';
  const M = {};
  const PRESQUE_UN = 1 - 1e-9;   // 10 × 0,1 = 0,9999999999999999 en informatique : on considère que c'est 100 %

  /* ===== GAIN BRUT D'UNE TÂCHE (non arrondi) ===== */
  M.brut = function (tache, C) {
    return C.tailles[tache.taille] ?? C.tailles.moyenne;
  };

  // Ressource gagnée par une catégorie (null pour la famille Repos, qui nourrit le moral)
  M.ressourceDe = function (categorie, C) {
    return C.familles.find(f => f.id === categorie?.familleId)?.ressource ?? null;
  };

  /* ===== PROGRESSION =====
   * Quotidienne : seulement les saisies du jour logique (elle ne rapporte qu'une fois par jour).
   * Imprévu / bonus : toutes les saisies depuis la création, ou depuis `depuis` si la tâche a changé de nature.
   */
  M.compte = function (tache, saisie, jour) {
    if (saisie.tacheId !== tache.id) return false;
    if (tache.type === 'quotidienne') return saisie.jour === jour;
    return !tache.depuis || saisie.horodatage >= tache.depuis;
  };

  function finaliser(tache, somme, deja) {
    const cible = tache.objectif ? tache.objectif.cible : 1;
    const p = somme / cible;
    return { somme, deja, progression: p >= PRESQUE_UN ? 1 : Math.max(0, p) };
  }

  // Bilan d'UNE tâche : {somme (quantité faite), deja (gain déjà reçu), progression 0…1}
  M.bilan = function (tache, journal, jour) {
    let somme = 0, deja = 0;
    for (const s of journal) {
      if (!M.compte(tache, s, jour)) continue;
      somme += s.valeur || 0;
      deja += s.gains?.xp || 0;
    }
    return finaliser(tache, somme, deja);
  };

  // Bilans de TOUTES les tâches en un seul passage sur le journal (rapide même avec des milliers de saisies)
  M.bilans = function (etat, jour) {
    const acc = new Map(etat.taches.map(t => [t.id, { tache: t, somme: 0, deja: 0 }]));
    for (const s of etat.journal) {
      const a = acc.get(s.tacheId);
      if (!a || !M.compte(a.tache, s, jour)) continue;
      a.somme += s.valeur || 0;
      a.deja += s.gains?.xp || 0;
    }
    const r = new Map();
    for (const [id, a] of acc) r.set(id, finaliser(a.tache, a.somme, a.deja));
    return r;
  };

  M.progression = (tache, journal, jour) => M.bilan(tache, journal, jour).progression;

  // Une quotidienne est « faite » pour la journée ; un imprévu / bonus terminé est archivé
  M.estFaite = (tache, bilan) => tache.type === 'quotidienne' ? bilan.progression >= 1 : !!tache.archivee;

  // Ce qu'il reste à gagner sur la tâche (affiché sur la carte : « +25 📜 »)
  M.gainRestant = (tache, bilan, C) => Math.max(0, Math.round(M.brut(tache, C)) - bilan.deja);

  // Quantité qu'il reste à faire pour un objectif chiffré
  M.reste = (tache, bilan) => tache.objectif ? arrondi(Math.max(0, tache.objectif.cible - bilan.somme)) : 0;

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
   * ou null = « terminer » (cocher, ou « tout le reste »). ctx = {id, horodatage, jour}.
   * → {ok: true, gain, ressource, progression, terminee, niveauxGagnes} ou {ok: false, erreur}
   */
  M.saisir = function (etat, tacheId, quantite, ctx, C) {
    const tache = etat.taches.find(t => t.id === tacheId);
    if (!tache || tache.archivee) return { ok: false, erreur: 'Tâche introuvable.' };
    const categorie = etat.categories.find(c => c.id === tache.categorieId);
    const b = M.bilan(tache, etat.journal, ctx.jour);
    if (tache.type === 'quotidienne' && b.progression >= 1) return { ok: false, erreur: 'Déjà fait aujourd\'hui ✅' };

    const cible = tache.objectif ? tache.objectif.cible : 1;
    let valeur, apres;
    if (quantite === null || quantite === undefined) {
      valeur = arrondi(Math.max(0, cible - b.somme));
      apres = 1;
    } else {
      valeur = Number(quantite);
      if (!(valeur > 0) || !Number.isFinite(valeur)) return { ok: false, erreur: 'Entre un nombre plus grand que 0.' };
      if (!tache.objectif) return { ok: false, erreur: 'Cette tâche n\'a pas d\'objectif chiffré.' };
      apres = finaliser(tache, b.somme + valeur, 0).progression;
    }

    const gain = Math.max(0, Math.round(M.brut(tache, C) * apres) - b.deja);
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
   * Quotidiennes prévues ce jour-là (faites en bas), imprévus par échéance puis sans échéance, bonus.
   * Tâches archivées exclues. Renvoie aussi les bilans (calculés une seule fois pour tout l'écran).
   */
  M.ordreImprevus = function (a, b) {
    if (a.echeance && b.echeance) return a.echeance.localeCompare(b.echeance) || parCreation(a, b);
    if (a.echeance || b.echeance) return a.echeance ? -1 : 1;
    return parCreation(a, b);
  };
  function parCreation(a, b) { return (a.creeLe || '').localeCompare(b.creeLe || ''); }

  M.listesDuJour = function (etat, jour, jourIso) {
    const bilans = M.bilans(etat, jour);
    const actives = etat.taches.filter(t => !t.archivee);
    const quotidiennes = actives.filter(t => t.type === 'quotidienne');
    const prevues = quotidiennes.filter(t => (t.jours || []).includes(jourIso));
    const fait = t => (bilans.get(t.id).progression >= 1 ? 1 : 0);
    return {
      quotidienne: prevues.sort((a, b) => fait(a) - fait(b) || parCreation(a, b)),
      autresJours: quotidiennes.length - prevues.length,
      imprevu: actives.filter(t => t.type === 'imprevu').sort(M.ordreImprevus),
      bonus: actives.filter(t => t.type === 'bonus').sort(parCreation),
      bilans
    };
  };

  function arrondi(x) { return Math.round(x * 1e6) / 1e6; }

  if (typeof module !== 'undefined') module.exports = M; else racine.Moteur = M;
})(typeof window !== 'undefined' ? window : globalThis);
