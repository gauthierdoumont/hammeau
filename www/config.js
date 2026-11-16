/* config.js — Hameau — toutes les valeurs de jeu, à rééquilibrer ICI uniquement — Créé par Gauthier Doumont
 * Règle : aucune valeur de gain, coût ou seuil écrite ailleurs dans le code.
 * Chaque ligne dit ce qui change si on augmente la valeur.
 */
window.CONFIG = {
  /* ===== Familles (fixes) : famille → ressource gagnée → stat ===== */
  familles: [
    { id: 'esprit',     nom: 'Esprit',       emoji: '🧠', ressource: 'savoir',     stat: 'intelligence', nomStat: 'Intelligence' },
    { id: 'corps',      nom: 'Corps',        emoji: '💪', ressource: 'pierre',     stat: 'force',        nomStat: 'Force' },
    { id: 'creation',   nom: 'Création',     emoji: '🛠️', ressource: 'cristaux',   stat: 'creativite',   nomStat: 'Créativité' },
    { id: 'social',     nom: 'Social',       emoji: '🤝', ressource: 'nourriture', stat: 'charisme',     nomStat: 'Charisme' },
    { id: 'discipline', nom: 'Discipline',   emoji: '🧹', ressource: 'bois',       stat: 'discipline',   nomStat: 'Discipline' },
    { id: 'pro',        nom: 'Pro & admin',  emoji: '💼', ressource: 'or',         stat: 'organisation', nomStat: 'Organisation' },
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
  moral: { depart: 80, min: 0, max: 100, parTache: 1, quotidienneNonFaite: -5, seuilTriste: 40, seuilContent: 70 }, // seuilContent : humeur 😊 dès ce moral
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
    coutFamille: 30,       // coût au niveau n = coutFamille × n² de la ressource de la famille
    coutBois: 5,           // + coutBois × n² bois
    coutPierre: 5,         // + coutPierre × n² pierre
    jardinPayeEn: 'nourriture'
  },
  mairie: { cout: 20, niveauJoueurRequis: [1, 3, 6, 9, 12] }, // cout × n² de chaque ressource
  reparation: { part: 0.3 },                            // part du coût du niveau actuel
  // Agrandir le hameau : un anneau de terrain en plus tout autour ; chaque anneau coûte ×1,5 le précédent
  extensions: { facteur: 1.5, max: 3, coutBase: { bois: 120, pierre: 120, or: 60 } },
  // Décorations : communes (ressources) ou rares (gemmes, qui ne viennent que des coffres)
  decorations: {
    arbre:      { nom: 'Arbre',           emoji: '🌳', cout: { bois: 15 } },
    sapin:      { nom: 'Sapin',           emoji: '🌲', cout: { bois: 15 } },
    bosquet:    { nom: 'Bosquet',         emoji: '🌿', cout: { bois: 25 } },
    rochers:    { nom: 'Rochers',         emoji: '🪨', cout: { pierre: 15 } },
    potager:    { nom: 'Potager',         emoji: '🥕', cout: { nourriture: 20 } },
    cloture:    { nom: 'Clôture',         emoji: '🪵', cout: { bois: 10 } },
    puits:      { nom: 'Puits',           emoji: '🪣', cout: { pierre: 40, bois: 20 } },
    grandSapin: { nom: 'Grand sapin',     emoji: '🎄', cout: { gemmes: 2 }, rare: true },
    rempart:    { nom: 'Rempart',         emoji: '🧱', cout: { gemmes: 3 }, rare: true },
    porte:      { nom: 'Porte fortifiée', emoji: '🏰', cout: { gemmes: 4 }, rare: true },
    tour:       { nom: 'Tour de guet',    emoji: '🗼', cout: { gemmes: 5 }, rare: true }
  },

  /* ===== Données ===== */
  /* ===== Surprises du jour (V4) : le hasard ne donne QUE des bonus ===== */
  surprises: {
    chance: 0.3,                                   // chance d'une surprise par jour ; ↑ = plus souvent
    poids: { marchand: 1, tempete: 1, fete: 1 },   // ↑ = ce type sort plus souvent
    marchand: { lot: 30, taux: 1.5 },              // donne `lot` de ta ressource la plus abondante, reçois lot × taux de la plus rare
    tempete: { taches: 3, recompense: { bois: 30, pierre: 30 } },   // défi du jour : N tâches terminées → récompense
    fete: { bonus: 0.2 }                           // une famille au hasard : +20 % de gains aujourd'hui
  },

  /* ===== Examens = boss (V4) : chaque révision 📚 lui fait des dégâts ===== */
  boss: {
    joursAvant: 14,                  // le boss apparaît N jours avant l'examen ; ↑ = plus de temps pour réviser
    pv: 200,                         // points de vie ; dégâts d'une révision = son XP (25 pour une moyenne) ; ↑ = boss plus coriace
    categories: ['revision'],        // catégories qui font des dégâts
    recompense: { savoir: 80, gemmes: 2 },   // le jour J, boss vaincu ; sinon une part (jamais rien)
    partMin: 0.25                    // part minimale de la récompense, même sans révision (on a passé l'examen !)
  },

  /* ===== Cours de l'agenda : « J'y étais » (V3) ===== */
  cours: { categorieId: 'cours', taille: 'moyenne', type: 'quotidienne' },   // gain d'une présence ; taille ↑ = plus de 📜

  /* ===== Import de l'appli muscu (V4) : chaque séance = une tâche faite (famille Corps) ===== */
  muscu: {
    joursMax: 14,                                      // séances plus anciennes ignorées (l'équilibre du village) ; ↑ = plus d'historique compté
    categories: { muscu: 'muscu', express: 'muscu', elastique: 'muscu', course: 'course' },   // type de séance → catégorie
    tailleMinutes: { moyenne: 20, grosse: 45 },        // durée d'une séance → petite / moyenne / grosse
    tailleKm: { moyenne: 3, grosse: 6 },               // course : distance → petite / moyenne / grosse
    type: 'quotidienne'                                // multiplicateur de type (1)
  },

  /* ===== Rappels (notifications locales, V3) ===== */
  notifications: {
    matinDefaut: '08:00',      // heure proposée quand on rallume le rappel du matin
    soirDefaut: '20:00',       // heure proposée quand on rallume le rappel du soir
    joursAvance: 7,            // rappels programmés d'avance (si l'appli n'est pas rouverte) ; ↑ = plus de rappels génériques
    echeancesMax: 20,          // rappels « veille d'échéance » programmés au maximum
    testSecondes: 10,          // « Tester une notification »
    relanceJours: 3,           // après un « Plus tard », une seule nouvelle proposition après ce nombre de jours
    propositionsMax: 2         // propositions d'activer les rappels au total (jamais d'insistance)
  },

  /* ===== Agenda iCal (V3) ===== */
  calendrier: {
    joursAvant: 1,             // événements gardés en mémoire avant aujourd'hui
    joursApres: 120,           // … et après (≈ un quadrimestre)
    actualiserMinutes: 60,     // à l'ouverture, on recharge si le cache a plus que ça ; ↓ = plus de données mobiles
    delaiSecondes: 15,         // attente maximale du téléchargement
    apercuJours: 7             // Réglages → Agenda : événements montrés en aperçu
  },

  donnees: {
    rappelExportJours: 14,   // rappel doux d'export après ce nombre de jours
    sauvegardesHebdo: 4,     // copies automatiques hebdomadaires gardées
    sauvegardesAvant: 5      // copies automatiques « avant import / migration » gardées
  }
};
