/* moteur.js — Hameau — gains, progression et niveaux — Créé par Gauthier Doumont
 * Fonctions PURES (pas d'horloge, pas de hasard, pas de DOM) : testées dans node (tests/moteur.test.js).
 * Gain (CLAUDE.md §5) = base (taille) × type × série × bâtiment × Repos (XP ×0,5) × anti-farm → arrondi une seule fois.
 * Coffres : hasard INJECTÉ (ctx.rng) → les tests et la simulation sont reproductibles.
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
  // facteur = produit des multiplicateurs (voir M.multiplicateurs) ; 1 = gain de base
  M.brut = function (tache, C, facteur = 1) {
    return (C.tailles[tache.taille] ?? C.tailles.moyenne) * facteur;
  };

  /* ===== MULTIPLICATEURS (étape 5a) =====
   * → {type, serie, batiment, repos, antiFarm, total} pour une tâche, un jour donné, dans l'état actuel.
   * Anti-farm : au-delà de C.antiFarm.seuil tâches TERMINÉES dans le même jour logique, gains × facteur.
   */
  // Une saisie « termine » une tâche quand elle la passe à 100 %. Tâche de la semaine : seulement la saisie qui boucle
  // la semaine (les étapes en plus, déjà à 100 %, ne comptent pas une 2e fois : anti-farm, tempête, bilan).
  M.estTerminaison = (s) => s.progression >= 1 && (!s.semaine || !!s.semaine.boucle);
  M.terminesDuJour = (journal, jour) => journal.filter(s => s.jour === jour && M.estTerminaison(s)).length;
  M.multiplicateurs = function (tache, etat, C, jour, familleId) {
    const type = C.types[tache.type] ?? 1;
    const serie = 1 + Math.min(C.serie.max, (etat.joueur?.serie?.jours || 0) * C.serie.parJour);
    const batiment = 1 + M.bonusFamille(etat, familleId, C);
    const repos = familleId === 'repos' ? C.repos.facteurXp : 1;
    const antiFarm = M.terminesDuJour(etat.journal, jour) >= C.antiFarm.seuil ? C.antiFarm.facteur : 1;
    const fete = 1 + M.bonusFete(etat, jour, familleId);
    return { type, serie, batiment, repos, antiFarm, fete, total: type * serie * batiment * repos * antiFarm * fete };
  };

  /* ===== SURPRISES DU JOUR (étape 16, voir surprises.js) =====
   * Lues ICI, comme le bonus des bâtiments : aucune façon de cocher ne peut oublier la fête ni le défi.
   */
  const surpriseDuJour = (etat, jour) => {
    const s = etat.etat?.surprise;
    return s && s.jour === jour && s.type ? s : null;
  };
  M.bonusFete = (etat, jour, familleId) => {
    const s = surpriseDuJour(etat, jour);
    return s?.type === 'fete' && familleId && s.famille === familleId ? s.bonus : 0;
  };
  // Tempête : défi relevé dès `cible` tâches terminées ce jour-là → récompense, une seule fois. → récompense ou null
  M.releverDefi = function (etat, jour) {
    const s = surpriseDuJour(etat, jour);
    if (s?.type !== 'tempete' || s.fini || M.terminesDuJour(etat.journal, jour) < s.cible) return null;
    for (const [r, q] of Object.entries(s.recompense)) etat.joueur.ressources[r] = (etat.joueur.ressources[r] || 0) + q;
    s.fini = 'releve';
    return s.recompense;
  };

  /* ===== COFFRE (10 % de chance quand une tâche passe à 100 %) ===== */
  const entier = (rng, min, max) => min + Math.floor(rng() * (max - min + 1));
  M.tirerCoffre = function (rng, C) {
    if (!rng || rng() >= C.coffre.chance) return null;
    const communes = C.ressources.map(r => r.id).filter(id => id !== 'gemmes');
    const ressources = {};
    for (let i = 0; i < C.coffre.nbRessources; i++) {
      const libres = communes.filter(r => !(r in ressources));
      const r = libres[Math.min(libres.length - 1, Math.floor(rng() * libres.length))];
      ressources[r] = entier(rng, C.coffre.min, C.coffre.max);
    }
    return { ressources, gemmes: entier(rng, C.coffre.gemmesMin, C.coffre.gemmesMax) };
  };

  /* ===== BONUS DU VILLAGE =====
   * +bonusParNiveau × niveau pour la famille du bâtiment, sauf s'il est endommagé ou si le moral est bas.
   * Calculé ICI (et pas par chaque appelant) : aucune future façon de cocher ne peut l'oublier.
   */
  M.bonusFamille = function (etat, familleId, C) {
    if (!familleId || !C.batiments?.familles) return 0;
    if ((etat.joueur?.moral ?? 100) < C.moral.seuilTriste) return 0;
    const bat = (etat.village?.batiments || []).find(b => C.batiments.familles[b.type] === familleId);
    if (!bat || bat.endommage) return 0;
    return bat.niveau * C.batiments.bonusParNiveau;
  };

  // Ressource gagnée par une catégorie (null pour la famille Repos, qui nourrit le moral)
  M.ressourceDe = function (categorie, C) {
    return C.familles.find(f => f.id === categorie?.familleId)?.ressource ?? null;
  };

  /* ===== SEMAINE (lundi → dimanche) ===== */
  // Lundi de la semaine d'un jour « AAAA-MM-JJ » (calcul en UTC : pas d'heure d'été)
  M.lundiDe = function (jour) {
    const [a, m, j] = jour.split('-').map(Number);
    const d = new Date(Date.UTC(a, m - 1, j));
    d.setUTCDate(d.getUTCDate() - (d.getUTCDay() + 6) % 7);
    return d.toISOString().slice(0, 10);
  };
  M.memeSemaine = (a, b) => !!a && !!b && M.lundiDe(a) === M.lundiDe(b);

  /* ===== PROGRESSION =====
   * Quotidienne et bonus : seulement les saisies du jour logique (une fois par jour ; le bonus n'est jamais dû).
   * Semaine : les saisies de la même semaine (lundi → dimanche) que le jour demandé, depuis `depuis` si la tâche a changé.
   * Imprévu / bonus : toutes les saisies depuis la création, ou depuis `depuis` si la tâche a changé de nature.
   */
  M.compte = function (tache, saisie, jour) {
    if (saisie.tacheId !== tache.id) return false;
    if (tache.type === 'quotidienne') return saisie.jour === jour;
    // Bonus : faisable une fois par jour, revient le lendemain (choix de Gauthier, 2026-11-18), jamais de pénalité
    if (tache.type === 'bonus') return saisie.jour === jour && (!tache.depuis || saisie.horodatage >= tache.depuis);
    if (tache.type === 'semaine') return M.memeSemaine(saisie.jour, jour) && (!tache.depuis || saisie.horodatage >= tache.depuis);
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

  // Une quotidienne est « faite » pour la journée, une tâche de la semaine pour la semaine ; un imprévu / bonus terminé est archivé
  M.estFaite = (tache, bilan) => (M.parPeriode(tache) ? bilan.progression >= 1 : !!tache.archivee);
  // Tâches qui reviennent (jour ou semaine) : jamais archivées une fois faites
  M.parPeriode = (tache) => tache.type === 'quotidienne' || tache.type === 'bonus' || tache.type === 'semaine';

  // Ce qu'il reste à gagner sur la tâche (affiché sur la carte : « +25 📜 »).
  // Semaine : gain de la PROCHAINE étape (moitié au-delà de l'objectif), bonus de fin de semaine non compté.
  M.gainRestant = function (tache, bilan, C, facteur = 1) {
    if (tache.type === 'semaine') return Math.round(M.brut(tache, C, facteur) * (bilan.progression >= 1 ? C.semaine.facteurEnPlus : 1));
    return Math.max(0, Math.round(M.brut(tache, C, facteur)) - bilan.deja);
  };

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
   * ou null = « terminer » (cocher, ou « tout le reste »). ctx = {id, horodatage, jour, rng?, veille?}.
   * Tous les multiplicateurs (dont le bonus du bâtiment) sont calculés ici : aucun appelant ne peut les oublier.
   * ctx.rng (Math.random dans l'appli) sert au coffre ; sans rng, pas de coffre (tests déterministes).
   * → {ok: true, gain, ressource, progression, terminee, niveauxGagnes} ou {ok: false, erreur}
   */
  M.saisir = function (etat, tacheId, quantite, ctx, C) {
    const tache = etat.taches.find(t => t.id === tacheId);
    if (!tache || tache.archivee) return { ok: false, erreur: 'Tâche introuvable.' };
    const categorie = etat.categories.find(c => c.id === tache.categorieId);
    if (tache.type === 'semaine') return saisirSemaine(etat, tache, categorie, quantite, ctx, C);
    const b = M.bilan(tache, etat.journal, ctx.jour);
    // Le texte suit le jour coché (ctx.veille = coche « fait hier ») : sinon on lirait « aujourd'hui » pour hier
    if ((tache.type === 'quotidienne' || tache.type === 'bonus') && b.progression >= 1) return { ok: false, erreur: ctx.veille ? 'Déjà noté pour hier ✅' : 'Déjà fait aujourd\'hui ✅' };

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

    const familleId = categorie?.familleId;
    const mult = M.multiplicateurs(tache, etat, C, ctx.jour, familleId);
    const gain = Math.max(0, Math.round(M.brut(tache, C, mult.total) * apres) - b.deja);
    const ressource = M.ressourceDe(categorie, C);
    const terminee = apres >= 1;
    const coffre = terminee && b.progression < 1 ? M.tirerCoffre(ctx.rng, C) : null;
    const entree = {
      id: ctx.id, tacheId, horodatage: ctx.horodatage, jour: ctx.jour, valeur,
      progression: apres, gains: { xp: gain, ressource, quantite: ressource ? gain : 0 }
    };
    if (coffre) entree.coffre = coffre;
    etat.journal.push(entree);
    const niv = crediter(etat, gain, ressource, categorie ? familleId : null, coffre, terminee && b.progression < 1, C);

    if (terminee && !M.parPeriode(tache)) { tache.archivee = true; tache.termineeLe = ctx.horodatage; }
    const defi = M.releverDefi(etat, ctx.jour);
    return { ok: true, gain, ressource, progression: apres, terminee, niveauxGagnes: niv.niveauxGagnes, multiplicateurs: mult, coffre, defi };
  };

  /* ===== SAISIE D'UNE TÂCHE DE LA SEMAINE =====
   * quantite = null → une étape ; sinon nombre ENTIER d'étapes (1 à C.semaine.cibleMax). Jamais refusée parce que
   * l'objectif est atteint : on peut le dépasser. Gain calculé à CHAQUE saisie (pas « total − déjà ») :
   *   étapes dans l'objectif × gain d'une tâche de cette taille (tous multiplicateurs du jour)
   * + étapes en plus × C.semaine.facteurEnPlus
   * + bonus (C.semaine.bonusEtapes étapes offertes) à la saisie qui boucle la semaine, avec la chance de coffre et le moral.
   * Journal : semaine = {boucle, bonus, enPlus} (sert à M.estTerminaison et à l'historique).
   */
  function saisirSemaine(etat, tache, categorie, quantite, ctx, C) {
    const n = quantite === null || quantite === undefined ? 1 : Number(quantite);
    if (!Number.isInteger(n) || n < 1) return { ok: false, erreur: 'Entre un nombre entier plus grand que 0.' };
    if (n > C.semaine.cibleMax) return { ok: false, erreur: `${C.semaine.cibleMax} au maximum d'un coup.` };
    const cible = tache.objectif?.cible || 1;
    const b = M.bilan(tache, etat.journal, ctx.jour);
    const dansObjectif = Math.min(n, Math.max(0, cible - b.somme));
    const enPlus = n - dansObjectif;
    const boucle = b.progression < 1 && b.somme + n >= cible - 1e-9;
    const familleId = categorie?.familleId;
    const mult = M.multiplicateurs(tache, etat, C, ctx.jour, familleId);
    const parEtape = M.brut(tache, C, mult.total);
    const bonus = boucle ? Math.round(parEtape * C.semaine.bonusEtapes) : 0;
    const gain = Math.max(0, Math.round(parEtape * (dansObjectif + enPlus * C.semaine.facteurEnPlus)) + bonus);
    const somme = arrondi(b.somme + n);
    const apres = finaliser(tache, somme, 0).progression;
    const ressource = M.ressourceDe(categorie, C);
    const coffre = boucle ? M.tirerCoffre(ctx.rng, C) : null;
    const entree = {
      id: ctx.id, tacheId: tache.id, horodatage: ctx.horodatage, jour: ctx.jour, valeur: n,
      progression: apres, gains: { xp: gain, ressource, quantite: ressource ? gain : 0 },
      semaine: { boucle, bonus, enPlus }
    };
    if (coffre) entree.coffre = coffre;
    etat.journal.push(entree);
    const niv = crediter(etat, gain, ressource, categorie ? familleId : null, coffre, boucle, C);
    const defi = M.releverDefi(etat, ctx.jour);
    return {
      ok: true, gain, ressource, progression: apres, terminee: boucle, niveauxGagnes: niv.niveauxGagnes, multiplicateurs: mult, coffre, defi,
      semaine: { somme, cible, unite: tache.objectif?.unite, boucle, bonus, enPlus }
    };
  }

  // Ajoute un gain au joueur (XP, niveau, ressource, stats, coffre, moral). Partagé par saisir et jYEtais.
  function crediter(etat, gain, ressource, familleId, coffre, vientDeFinir, C) {
    const j = etat.joueur;
    const niv = M.ajouterXp(j.xp, j.niveau, gain, C);
    j.xp = niv.xp; j.niveau = niv.niveau; j.xpTotal += gain;
    if (ressource) j.ressources[ressource] += gain;
    if (familleId) j.gagneTotal[familleId] = (j.gagneTotal[familleId] || 0) + gain;
    j.stats = { ...j.stats, ...M.stats(j.gagneTotal, C) };
    // Coffre : ressources + gemmes (bonus de hasard : n'entre pas dans les stats, qui mesurent l'effort réel)
    if (coffre) {
      for (const [r, q] of Object.entries(coffre.ressources)) j.ressources[r] += q;
      j.ressources.gemmes += coffre.gemmes;
    }
    // Moral : +1 par tâche terminée, +5 pour une tâche Repos (plafond 100)
    if (vientDeFinir) {
      const plus = familleId === 'repos' ? C.repos.moral : C.moral.parTache;
      j.moral = Math.min(C.moral.max, j.moral + plus);
    }
    return niv;
  }

  /* ===== « J'Y ÉTAIS » (étape 15b) : présence à un cours de l'agenda =====
   * Une seule fois par occurrence (cle = uid|début), et seulement après l'heure de début (ctx.horodatage).
   * Gain = celui d'une tâche de la catégorie Cours (C.cours : taille et type), avec série, bâtiment et anti-farm.
   * ev = {cle, titre, debut (ISO)} ; ctx = {id, horodatage, jour, rng?}
   * Saisie du journal : tacheId null + cours (cle) + titre → compte pour la journée (XP, série) comme une tâche.
   */
  M.dejaPresent = (journal, cle) => journal.some(s => s.cours === cle);
  M.gainCours = function (etat, jour, C) {
    const categorie = etat.categories.find(c => c.id === C.cours.categorieId);
    const virtuelle = { type: C.cours.type, taille: C.cours.taille };
    return { categorie, mult: M.multiplicateurs(virtuelle, etat, C, jour, categorie?.familleId), virtuelle };
  };
  M.jYEtais = function (etat, ev, ctx, C) {
    if (!ev?.cle) return { ok: false, erreur: 'Cours introuvable.' };
    if (M.dejaPresent(etat.journal, ev.cle)) return { ok: false, erreur: 'Déjà noté ✅' };
    if (Date.parse(ctx.horodatage) < Date.parse(ev.debut)) return { ok: false, erreur: 'Ce cours n\'a pas encore commencé ⏳' };
    return M.saisieExterne(etat, { champ: 'cours', cle: ev.cle, titre: ev.titre, categorieId: C.cours.categorieId, taille: C.cours.taille, type: C.cours.type }, ctx, C);
  };

  /* ===== SAISIE EXTERNE : un effort fait hors des tâches (cours suivi, séance de muscu importée) =====
   * src = {champ: 'cours' | 'muscu', cle (unique), titre, categorieId, taille, type}. Gain d'une tâche de cette
   * catégorie (série, bâtiment, fête, anti-farm), crédité comme une tâche finie. Journal : tacheId null + [champ]: cle + categorieId.
   * Coffre seulement si ctx.rng est donné (pas de coffre en rafale lors d'un import).
   */
  M.saisieExterne = function (etat, src, ctx, C) {
    const categorie = etat.categories.find(c => c.id === src.categorieId);
    const virtuelle = { type: src.type, taille: src.taille };
    const mult = M.multiplicateurs(virtuelle, etat, C, ctx.jour, categorie?.familleId);
    const gain = Math.max(0, Math.round(M.brut(virtuelle, C, mult.total)));
    const ressource = M.ressourceDe(categorie, C);
    const coffre = M.tirerCoffre(ctx.rng, C);
    const entree = {
      id: ctx.id, tacheId: null, [src.champ]: src.cle, categorieId: src.categorieId,   // catégorie notée : bilan et historique (pas de tâche à lire)
      titre: String(src.titre || '').slice(0, 120), horodatage: ctx.horodatage, jour: ctx.jour,
      valeur: 1, progression: 1, gains: { xp: gain, ressource, quantite: ressource ? gain : 0 }
    };
    if (coffre) entree.coffre = coffre;
    etat.journal.push(entree);
    const niv = crediter(etat, gain, ressource, categorie?.familleId ?? null, coffre, true, C);
    const defi = M.releverDefi(etat, ctx.jour);
    return { ok: true, gain, ressource, progression: 1, terminee: true, niveauxGagnes: niv.niveauxGagnes, multiplicateurs: mult, coffre, defi };
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
      semaine: actives.filter(t => t.type === 'semaine').sort((a, b) => fait(a) - fait(b) || parCreation(a, b)),
      autresJours: quotidiennes.length - prevues.length,
      imprevu: actives.filter(t => t.type === 'imprevu').sort(M.ordreImprevus),
      bonus: actives.filter(t => t.type === 'bonus').sort((a, b) => fait(a) - fait(b) || parCreation(a, b)),
      bilans
    };
  };

  /* ===== PROCHAINE ACTION (étape 7, CLAUDE.md §7) =====
   * UNE seule tâche, dans cet ordre : imprévu avec échéance (la plus proche) → quotidienne prévue non faite
   * (la plus petite) → tâche de la semaine pas encore bouclée (la plus en retard : il reste le plus d'étapes)
   * → imprévu sans échéance (le plus ancien) → bonus (le plus ancien).
   * ignorees = Set d'ids écartés par « Pas maintenant » ; tout écarté → on recommence au début.
   */
  const ORDRE_TAILLE = { petite: 0, moyenne: 1, grosse: 2 };
  M.candidatsProchaineAction = function (etat, jour, jourIso) {
    const actives = etat.taches.filter(t => !t.archivee);
    const pasFaite = t => M.progression(t, etat.journal, jour) < 1;
    const avecEcheance = actives.filter(t => t.type === 'imprevu' && t.echeance)
      .sort((a, b) => a.echeance.localeCompare(b.echeance) || parCreation(a, b));
    const quotidiennes = actives.filter(t => t.type === 'quotidienne' && (t.jours || []).includes(jourIso) && pasFaite(t))
      .sort((a, b) => (ORDRE_TAILLE[a.taille] ?? 1) - (ORDRE_TAILLE[b.taille] ?? 1) || parCreation(a, b));
    const resteSemaine = t => M.reste(t, M.bilan(t, etat.journal, jour));
    const semaine = actives.filter(t => t.type === 'semaine' && pasFaite(t))
      .sort((a, b) => resteSemaine(b) - resteSemaine(a) || parCreation(a, b));
    const sansEcheance = actives.filter(t => t.type === 'imprevu' && !t.echeance).sort(parCreation);
    const bonus = actives.filter(t => t.type === 'bonus' && pasFaite(t)).sort(parCreation);
    return [...avecEcheance, ...quotidiennes, ...semaine, ...sansEcheance, ...bonus];
  };
  M.prochaineAction = function (etat, jour, jourIso, ignorees = new Set()) {
    const candidats = M.candidatsProchaineAction(etat, jour, jourIso);
    return candidats.find(t => !ignorees.has(t.id)) || null;
  };

  function arrondi(x) { return Math.round(x * 1e6) / 1e6; }

  if (typeof module !== 'undefined') module.exports = M; else racine.Moteur = M;
})(typeof window !== 'undefined' ? window : globalThis);
