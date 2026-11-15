/* catalogue.js — Hameau — description du village : géométrie, terrain, bâtiments — Créé par Gauthier Doumont
 * Données seulement (aucune logique de jeu) : changer de pack graphique = changer ce fichier, pas les données du joueur.
 * Grille isométrique : gx vers le bas-droite, gy vers le bas-gauche. Hauteur h : 0 = sol, 1 = posé sur le sol, 2 = 1er étage…
 */
(function (racine) {
  'use strict';

  /* ===== GÉOMÉTRIE (images réduites de moitié par outils/preparer-village.js) ===== */
  const tuile = { largeur: 116, hauteur: 55, etage: 46 };   // pas de la grille + hauteur d'un étage (en pixels)

  /* ===== TERRAIN =====
   * Une lettre par case (ligne = gy, colonne = gx) :
   *  . herbe constructible   = chemin   ~ rivière   # pont
   *  T arbre   M bosquet   P sapin   G grand sapin   R rochers   B potager   W puits
   */
  const carte = [
    'PG..=..T.~PG',
    'GT..=....~.P',
    '....=....~..',
    '....=....~R.',
    'T...=....~..',
    '=========#==',
    '....=W...~BB',
    '....=....~BB',
    'M...=....~..',
    '.R..=....~.T',
    'P...=...T~MP',
    'GPT.=....~PG',
  ];
  const decors = { T: 'tree_single_N', M: 'tree_multiple_N', P: 'tree_pine_N', G: 'tree_pineLarge_N', R: 'rocks_grass_N', B: 'furrow_crop_N', W: 'well_N' };

  /* ===== BÂTIMENTS =====
   * Chaque niveau (1 à 5) = liste de pièces [image, h, dx?, dy?] posées sur la case du bâtiment (dx, dy : case voisine).
   * Les niveaux se voient : étages en plus, balcon, tour plus haute.
   */
  const ETAGES = [1, 2, 2, 3, 4];                 // nombre d'étages habitables selon le niveau
  function maison({ rdc, etage, toit, balcon }) {
    return ETAGES.map((n, i) => {
      const p = [[rdc, 1]];
      for (let e = 2; e <= n; e++) p.push([etage, e]);
      p.push([toit, n + 1]);
      if (balcon && i >= 2) p.push([balcon, 2]);     // niveau 3 et plus : balcon au 1er étage
      return p;
    });
  }
  function tour({ base, haut }) {
    const centres = [0, 1, 1, 2, 3];
    return centres.map((n, i) => {
      const p = [[base, 1]];
      for (let e = 0; e < n; e++) p.push(['castle_towerCenter_N', 2 + e]);
      p.push([haut, 2 + n]);
      if (i === 2 || i === 4) p.push(['castle_wall_N', 1, 1, 0]);   // niveau 3 et 5 : un rempart à côté
      return p;
    });
  }

  const batiments = {
    mairie:       { nom: 'Mairie',       emoji: '🏛️', famille: null,         empreinte: [1, 1],
      niveaux: tour({ base: 'castle_towerPurpleBase_N', haut: 'castle_towerPurpleTop_N' }) },
    bibliotheque: { nom: 'Bibliothèque', emoji: '📚', famille: 'esprit',     empreinte: [1, 1],
      niveaux: maison({ rdc: 'building_doorWindowsBeige_N', etage: 'building_windowsBeige_N', toit: 'roof_churchPurple_N', balcon: 'balcony_stone_N' }) },
    arene:        { nom: 'Arène',        emoji: '⚔️', famille: 'corps',      empreinte: [1, 1],
      niveaux: tour({ base: 'castle_towerGreenBase_N', haut: 'castle_towerGreenTop_N' }) },
    atelier:      { nom: 'Atelier',      emoji: '🔨', famille: 'creation',   empreinte: [1, 1], fumee: true,
      niveaux: maison({ rdc: 'building_door_E', etage: 'building_window_E', toit: 'roof_slantBrown_N', balcon: 'balcony_wood_E' }) },
    taverne:      { nom: 'Taverne',      emoji: '🍺', famille: 'social',     empreinte: [1, 1], fumee: true,
      niveaux: maison({ rdc: 'building_doorWindows_N', etage: 'building_windows_N', toit: 'roof_gableBrown_N', balcon: 'balcony_wood_N' }) },
    scierie:      { nom: 'Scierie',      emoji: '🪚', famille: 'discipline', empreinte: [1, 1], fumee: true,
      niveaux: maison({ rdc: 'building_door_N', etage: 'building_windows_E', toit: 'roof_gableGreen_E', balcon: 'balcony_wood_E' }) },
    banque:       { nom: 'Banque',       emoji: '🏦', famille: 'pro',        empreinte: [1, 1],
      niveaux: maison({ rdc: 'building_doorBeige_E', etage: 'building_windowBeige_E', toit: 'roof_roundedBeige_N', balcon: 'balcony_stone_E' }) },
    jardin:       { nom: 'Jardin',       emoji: '🌳', famille: 'repos',      empreinte: [2, 2],
      niveaux: [
        [['tree_single_N', 1]],
        [['tree_single_N', 1], ['furrow_crop_N', 1, 1, 0]],
        [['tree_multiple_N', 1], ['furrow_crop_N', 1, 1, 0], ['well_N', 1, 0, 1]],
        [['tree_multiple_N', 1], ['furrow_crop_N', 1, 1, 0], ['well_N', 1, 0, 1], ['tree_pine_N', 1, 1, 1]],
        [['tree_pineLarge_N', 1], ['furrow_crop_N', 1, 1, 0], ['well_N', 1, 0, 1], ['tree_multiple_N', 1, 1, 1]],
      ] },
  };

  racine.CATALOGUE_VILLAGE = {
    atlas: { cle: 'village', image: 'assets/village/village.png', json: 'assets/village/village.json' },
    tuile, carte, decors, batiments,
    // Image de chaque décoration achetable (les prix sont dans config.js)
    decorationsImages: {
      arbre: 'tree_single_N', sapin: 'tree_pine_N', bosquet: 'tree_multiple_N', rochers: 'rocks_grass_N',
      potager: 'furrow_crop_N', cloture: 'fence_wood_N', puits: 'well_N',
      grandSapin: 'tree_pineLarge_N', rempart: 'castle_wall_N', porte: 'castle_gate_N', tour: 'castle_tower_N',
    },
    fond: '#1f3346',             // ciel du soir, accordé à la charte Taverne
  };
  if (typeof module !== 'undefined') module.exports = racine.CATALOGUE_VILLAGE;
})(typeof window !== 'undefined' ? window : globalThis);
