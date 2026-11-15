/* taches.js — Hameau — familles, catégories et création des tâches — Créé par Gauthier Doumont
 * Fonctions PURES (pas de DOM, pas d'horloge, pas de hasard : l'id et la date sont passés en paramètre).
 * Testées dans node : tests/taches.test.js
 */
(function (racine) {
  'use strict';
  const T = {};

  T.TYPES = ['quotidienne', 'imprevu', 'bonus'];
  T.TOUS_LES_JOURS = [1, 2, 3, 4, 5, 6, 7];   // 1 = lundi … 7 = dimanche

  /* ===== FAMILLES ET CATÉGORIES ===== */
  T.famille = (familleId, C) => C.familles.find(f => f.id === familleId) || null;
  T.categorie = (etat, id) => etat.categories.find(c => c.id === id) || null;

  // Catégorie proposée par défaut : la dernière utilisée si elle existe encore, sinon celle de config.js
  T.categorieParDefaut = function (etat, C) {
    const derniere = etat.reglages?.derniereCategorie;
    if (derniere && T.categorie(etat, derniere)) return derniere;
    return T.categorie(etat, C.taches.defauts.categorie) ? C.taches.defauts.categorie : etat.categories[0]?.id;
  };

  // Grille de choix : favoris (les plus utilisées) en haut, puis toutes les catégories par famille
  T.grilleCategories = function (etat, C) {
    const favoris = etat.categories
      .filter(c => c.nbUtilisations > 0)
      .sort((a, b) => b.nbUtilisations - a.nbUtilisations || a.nom.localeCompare(b.nom, 'fr'))
      .slice(0, C.categories.nbFavoris);
    const parFamille = C.familles.map(f => ({
      famille: f,
      categories: etat.categories.filter(c => c.familleId === f.id)
    }));
    return { favoris, parFamille };
  };

  /* ===== CRÉATION D'UNE CATÉGORIE PERSO ===== */
  // saisie = {nom, emoji, familleId} → {ok: true, categorie} ou {ok: false, erreur}
  T.creerCategorie = function (saisie, etat, C, id) {
    const non = (erreur) => ({ ok: false, erreur });
    const nom = nettoyer(saisie.nom);
    if (!nom) return non('Donne un nom à ta catégorie.');
    if (nom.length > C.categories.nomMax) return non(`Nom trop long (${C.categories.nomMax} caractères max).`);
    const emoji = premierSymbole(nettoyer(saisie.emoji));
    if (!emoji) return non('Choisis un emoji.');
    if (!T.famille(saisie.familleId, C)) return non('Choisis une famille.');
    const existe = etat.categories.some(c => comparable(c.nom) === comparable(nom));
    if (existe) return non('Cette catégorie existe déjà.');
    return { ok: true, categorie: { id: 'perso-' + id, nom, emoji, familleId: saisie.familleId, perso: true, nbUtilisations: 0 } };
  };

  /* ===== CRÉATION D'UNE TÂCHE =====
   * saisie = {nom, categorieId, type, taille, objectif?{cible, unite}, jours?[], echeance?, important?}
   * → {ok: true, tache} ou {ok: false, erreur}
   */
  T.creerTache = function (saisie, etat, C, id, creeLe) {
    const non = (erreur) => ({ ok: false, erreur });
    const nom = nettoyer(saisie.nom);
    if (!nom) return non('Écris le nom de la tâche.');
    if (nom.length > C.taches.nomMax) return non(`Nom trop long (${C.taches.nomMax} caractères max).`);
    if (!T.categorie(etat, saisie.categorieId)) return non('Choisis une catégorie.');
    const type = saisie.type || C.taches.defauts.type;
    if (!T.TYPES.includes(type)) return non('Type inconnu.');
    const taille = saisie.taille || (saisie.objectif ? C.tailleObjectifParDefaut : C.taches.defauts.taille);
    if (!(taille in C.tailles)) return non('Taille inconnue.');

    const tache = { id, nom, categorieId: saisie.categorieId, type, taille, incendieApplique: false, creeLe, archivee: false };

    if (saisie.objectif) {
      const cible = Number(String(saisie.objectif.cible ?? '').replace(',', '.'));
      const unite = nettoyer(saisie.objectif.unite);
      if (!(cible > 0) || !Number.isFinite(cible)) return non('L\'objectif doit être un nombre plus grand que 0.');
      if (!unite) return non('Précise l\'unité (pages, minutes…).');
      if (unite.length > C.taches.uniteMax) return non('Unité trop longue.');
      tache.objectif = { cible, unite };
    }
    if (type === 'quotidienne') {
      const jours = [...new Set(saisie.jours ?? T.TOUS_LES_JOURS)].filter(j => T.TOUS_LES_JOURS.includes(j)).sort();
      if (!jours.length) return non('Choisis au moins un jour.');
      tache.jours = jours;
    }
    if (type === 'imprevu') {
      if (saisie.echeance) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(saisie.echeance)) return non('Date d\'échéance invalide.');
        tache.echeance = saisie.echeance;
      }
      tache.important = !!saisie.important;
    }
    return { ok: true, tache };
  };

  // Ajoute la tâche à l'état (à appeler dans modifier()) : compteur de la catégorie + dernière catégorie
  T.ajouterTache = function (etat, tache) {
    etat.taches.push(tache);
    const cat = T.categorie(etat, tache.categorieId);
    if (cat) cat.nbUtilisations++;
    etat.reglages.derniereCategorie = tache.categorieId;
  };

  /* ===== MODIFIER / SUPPRIMER ===== */
  // Mêmes règles que la création ; on garde l'id, la date de création et l'historique (journal intact).
  // Si la NATURE de la tâche change (type, ou objectif chiffré ajouté / retiré), sa progression repart de zéro
  // à partir de `quand` : sinon une quotidienne cochée hier deviendrait un imprévu « déjà fait » impossible à terminer.
  // Ce qui a déjà été gagné reste acquis.
  T.modifierTache = function (ancienne, saisie, etat, C, quand) {
    const r = T.creerTache(saisie, etat, C, ancienne.id, ancienne.creeLe);
    if (!r.ok) return r;
    const tache = { ...r.tache, incendieApplique: ancienne.incendieApplique, archivee: ancienne.archivee };
    if (ancienne.termineeLe) tache.termineeLe = ancienne.termineeLe;
    const natureChange = ancienne.type !== tache.type || !!ancienne.objectif !== !!tache.objectif;
    if (natureChange && quand) tache.depuis = quand;
    else if (ancienne.depuis) tache.depuis = ancienne.depuis;
    return { ok: true, tache };
  };
  T.remplacerTache = function (etat, tache) {
    const i = etat.taches.findIndex(t => t.id === tache.id);
    if (i < 0) throw new Error('Tâche introuvable');
    if (etat.taches[i].categorieId !== tache.categorieId) {
      const cat = T.categorie(etat, tache.categorieId);
      if (cat) cat.nbUtilisations++;
    }
    etat.taches[i] = tache;
  };
  // Suppression « douce » : la tâche disparaît des listes, mais l'XP et les ressources déjà gagnées restent
  T.supprimerTache = function (etat, id, quand) {
    const t = etat.taches.find(x => x.id === id);
    if (!t) throw new Error('Tâche introuvable');
    t.archivee = true;
    t.supprimeeLe = quand;
  };

  // (Les listes de l'écran Aujourd'hui sont construites par Moteur.listesDuJour : une seule règle de tri.)

  /* ===== UTILITAIRES ===== */
  function nettoyer(t) { return String(t ?? '').replace(/\s+/g, ' ').trim(); }
  function comparable(t) { return nettoyer(t).toLocaleLowerCase('fr').normalize('NFD').replace(/[̀-ͯ]/g, ''); }
  // Premier symbole visible (un emoji composé comme 👨‍👩‍👦 compte pour un seul)
  function premierSymbole(t) {
    if (!t) return '';
    if (typeof Intl !== 'undefined' && Intl.Segmenter) {
      const premier = new Intl.Segmenter('fr', { granularity: 'grapheme' }).segment(t)[Symbol.iterator]().next().value;
      return premier ? premier.segment : '';
    }
    return Array.from(t)[0] || '';
  }
  T.premierSymbole = premierSymbole;

  if (typeof module !== 'undefined') module.exports = T; else racine.Taches = T;
})(typeof window !== 'undefined' ? window : globalThis);
