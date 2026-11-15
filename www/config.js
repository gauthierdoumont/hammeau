/* config.js — Hameau — toutes les valeurs de jeu, à rééquilibrer ICI uniquement — Créé par Gauthier Doumont
 * Règle : aucune valeur de gain, coût ou seuil écrite ailleurs dans le code.
 * Chaque ligne dit ce qui change si on augmente la valeur.
 */
window.CONFIG = {
  /* ===== Familles (fixes) : famille → ressource gagnée → stat ===== */
  familles: [
    { id: 'esprit',     nom: 'Esprit',       emoji: '🧠', ressource: 'savoir',     stat: 'intelligence' },
    { id: 'corps',      nom: 'Corps',        emoji: '💪', ressource: 'pierre',     stat: 'force' },
    { id: 'creation',   nom: 'Création',     emoji: '🛠️', ressource: 'cristaux',   stat: 'creativite' },
    { id: 'social',     nom: 'Social',       emoji: '🤝', ressource: 'nourriture', stat: 'charisme' },
    { id: 'discipline', nom: 'Discipline',   emoji: '🧹', ressource: 'bois',       stat: 'discipline' },
    { id: 'pro',        nom: 'Pro & admin',  emoji: '💼', ressource: 'or',         stat: 'organisation' },
    { id: 'repos',      nom: 'Repos',        emoji: '🌿', ressource: null,         stat: null } // Repos → moral
  ],

  /* Ressources affichées (ordre des compteurs) ; gemmes = monnaie rare (coffres uniquement) */
  ressources: [
    { id: 'savoir',     nom: 'Savoir',     emoji: '📜' },
    { id: 'pierre',     nom: 'Pierre',     emoji: '🪨' },
    { id: 'cristaux',   nom: 'Cristaux',   emoji: '💎' },
    { id: 'nourriture', nom: 'Nourriture', emoji: '🍞' },
    { id: 'bois',       nom: 'Bois',       emoji: '🪵' },
    { id: 'or',         nom: 'Or',         emoji: '🪙' },
    { id: 'gemmes',     nom: 'Gemmes',     emoji: '💠' }
  ],

  /* Catégories de départ (les ids ne changent jamais : les tâches y font référence) */
  categoriesDepart: [
    { id: 'cours',        nom: 'Cours',            emoji: '🎓', familleId: 'esprit' },
    { id: 'syntheses',    nom: 'Synthèses',        emoji: '📝', familleId: 'esprit' },
    { id: 'revision',     nom: 'Révision',         emoji: '📚', familleId: 'esprit' },
    { id: 'lecture',      nom: 'Lecture',          emoji: '📖', familleId: 'esprit' },
    { id: 'journal',      nom: 'Journal du matin', emoji: '📰', familleId: 'esprit' },
    { id: 'langues',      nom: 'Langues',          emoji: '🗣️', familleId: 'esprit' },
    { id: 'muscu',        nom: 'Muscu',            emoji: '🏋️', familleId: 'corps' },
    { id: 'course',       nom: 'Course',           emoji: '🏃', familleId: 'corps' },
    { id: 'basket',       nom: 'Basket',           emoji: '🏀', familleId: 'corps' },
    { id: 'sommeil',      nom: 'Sommeil',          emoji: '😴', familleId: 'corps' },
    { id: 'alimentation', nom: 'Alimentation',     emoji: '🥗', familleId: 'corps' },
    { id: 'nanoblocks',   nom: 'Nanoblocks',       emoji: '🧱', familleId: 'creation' },
    { id: 'booknook',     nom: 'Booknook',         emoji: '🏠', familleId: 'creation' },
    { id: 'code',         nom: 'Projets code',     emoji: '💻', familleId: 'creation' },
    { id: 'mods',         nom: 'Mods / jeux',      emoji: '⛏️', familleId: 'creation' },
    { id: 'creatif',      nom: 'Créatif divers',   emoji: '🎨', familleId: 'creation' },
    { id: 'amis',         nom: 'Amis',             emoji: '👫', familleId: 'social' },
    { id: 'couple',       nom: 'Couple',           emoji: '❤️', familleId: 'social' },
    { id: 'famille',      nom: 'Famille',          emoji: '👨‍👩‍👦', familleId: 'social' },
    { id: 'sorties',      nom: 'Sorties',          emoji: '🎉', familleId: 'social' },
    { id: 'menage',       nom: 'Ménage',           emoji: '🧽', familleId: 'discipline' },
    { id: 'courses',      nom: 'Courses',          emoji: '🛒', familleId: 'discipline' },
    { id: 'rangement',    nom: 'Rangement',        emoji: '📦', familleId: 'discipline' },
    { id: 'routine',      nom: 'Routine',          emoji: '🔁', familleId: 'discipline' },
    { id: 'stage',        nom: 'Stage',            emoji: '🏢', familleId: 'pro' },
    { id: 'job',          nom: 'Job',              emoji: '💶', familleId: 'pro' },
    { id: 'papiers',      nom: 'Papiers',          emoji: '📄', familleId: 'pro' },
    { id: 'budget',       nom: 'Budget',           emoji: '📊', familleId: 'pro' },
    { id: 'voiture',      nom: 'Voiture',          emoji: '🚗', familleId: 'pro' },
    { id: 'pause',        nom: 'Pause',            emoji: '☕', familleId: 'repos' },
    { id: 'jeu',          nom: 'Jeu',              emoji: '🎮', familleId: 'repos' },
    { id: 'balade',       nom: 'Balade',           emoji: '🌳', familleId: 'repos' },
    { id: 'detente',      nom: 'Détente',          emoji: '🧘', familleId: 'repos' }
  ],

  /* ===== Ajout de tâches ===== */
  taches: {
    defauts: { type: 'imprevu', taille: 'moyenne', categorie: 'routine' }, // ajout express : nom + Enregistrer
    nomMax: 80,
    uniteMax: 20
  },
  categories: {
    nbFavoris: 6,          // ↑ = plus de catégories favorites en haut de la grille
    nomMax: 30,
    emojisSuggeres: ['🎸', '🎹', '🧩', '📷', '✍️', '🐶', '🌱', '🍳', '🚴', '🏊', '💊', '🧾', '💡', '🎯', '🙏', '⭐']
  },

  /* ===== Gains (V1) ===== */
  tailles: { petite: 10, moyenne: 25, grosse: 50 },     // ↑ = plus d'XP et de ressources par tâche
  tailleObjectifParDefaut: 'moyenne',                   // taille utilisée pour un objectif chiffré
  types: { quotidienne: 1, imprevu: 1.2, bonus: 1.25 }, // ↑ = ce type rapporte plus
  serie: {
    parJour: 0.05,        // ↑ = chaque jour de série augmente plus les gains
    max: 0.5,             // ↑ = plafond du bonus de série plus haut
    xpMinJour: 30,        // ↑ = plus dur de valider un jour de série
    jokersParSemaine: 1   // ↑ = plus de jours « sauvés » par semaine
  },
  repos: { facteurXp: 0.5, moral: 5 },                  // facteurXp ↑ = se reposer rapporte plus d'XP
  antiFarm: { seuil: 15, facteur: 0.5 },                // seuil ↑ = plus de tâches pleines par jour avant réduction
  stat: { diviseur: 10 },                               // ↑ = les stats montent plus lentement
  niveau: { base: 100, exposant: 1.5 },                 // ↑ = niveaux plus longs à gagner
  coffre: { chance: 0.1, nbRessources: 2, min: 10, max: 30, gemmesMin: 1, gemmesMax: 3 }, // chance ↑ = coffres plus fréquents

  /* ===== Moral, jours, pénalités ===== */
  moral: { depart: 80, min: 0, max: 100, parTache: 1, quotidienneNonFaite: -5, seuilTriste: 40 },
  jour: { fuseau: 'Europe/Brussels', heureBascule: 4, heureClotureVeille: 12 }, // bascule ↑ = la journée finit plus tard la nuit
  pause: { retroJoursMax: 7 },                          // ↑ = pause activable plus loin dans le passé
  incendie: { part: 0.2, max: 50 },                     // V1 : part de la ressource perdue (plafonnée à max)

  /* ===== Village : caméra (zoom en taille d'écran ; 1 = images à leur taille réelle) ===== */
  village: { zoomMin: 0.3, zoomMax: 1.4, zoomDepart: 0.6 },   // zoomMax ↑ = on peut voir les bâtiments de plus près

  /* ===== Village et économie (V2, utilisés à l'étape 11) ===== */
  batiments: {
    // Bâtiment → famille qu'il amplifie (la Mairie n'en a pas : elle débloque les niveaux des autres)
    familles: { mairie: null, bibliotheque: 'esprit', arene: 'corps', atelier: 'creation', taverne: 'social',
      scierie: 'discipline', banque: 'pro', jardin: 'repos' },
    ordre: ['mairie', 'bibliotheque', 'arene', 'atelier', 'taverne', 'scierie', 'banque', 'jardin'],   // ordre d'affichage
    niveauMax: 5,
    bonusParNiveau: 0.05,  // ↑ = un bâtiment amplifie plus les gains de sa famille
    coutFamille: 50,       // coût au niveau n = coutFamille × n² de la ressource de la famille
    coutBois: 20,          // + coutBois × n² bois
    coutPierre: 20,        // + coutPierre × n² pierre
    jardinPayeEn: 'nourriture'
  },
  mairie: { cout: 40, niveauJoueurRequis: [1, 5, 10, 16, 23] }, // cout × n² de chaque ressource
  reparation: { part: 0.3 },                            // part du coût du niveau actuel
  extensions: { facteur: 1.5 },                         // chaque extension coûte ×1,5 la précédente

  /* ===== Données ===== */
  donnees: {
    rappelExportJours: 14,   // rappel doux d'export après ce nombre de jours
    sauvegardesHebdo: 4,     // copies automatiques hebdomadaires gardées
    sauvegardesAvant: 5      // copies automatiques « avant import / migration » gardées
  }
};
