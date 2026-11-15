/* village-geo.js — Hameau — géométrie du village (isométrie, terrain, ordre d'affichage) — Créé par Gauthier Doumont
 * Fonctions PURES : testées dans node (tests/village.test.js). Phaser n'est utilisé que dans village.js.
 * Règle d'or : le village est stocké en cases de grille (gx, gy), jamais en pixels.
 */
(function (racine) {
  'use strict';
  const G = {};

  /* ===== ISOMÉTRIE ===== */
  // Centre de la case (gx, gy) à l'écran ; h = hauteur en étages (un étage = tuile.etage pixels plus haut)
  G.versEcran = (gx, gy, T, h = 0) => ({ x: (gx - gy) * T.largeur / 2, y: (gx + gy) * T.hauteur / 2 - h * T.etage });
  // Case sous un point de l'écran (au niveau du sol)
  G.versGrille = (x, y, T) => {
    const a = x / (T.largeur / 2), b = y / (T.hauteur / 2);
    return { gx: Math.round((a + b) / 2) || 0, gy: Math.round((b - a) / 2) || 0 };   // || 0 : évite « -0 »
  };

  // Ordre d'affichage du peintre : ce qui est devant (gx + gy plus grand) et plus haut passe par-dessus
  G.profondeur = (gx, gy, h = 0, ordre = 0) => (gx + gy) * 1000 + h * 10 + ordre;

  /* ===== TERRAIN ===== */
  const CHEMIN = '=', RIVIERE = '~', PONT = '#';
  const estChemin = c => c === CHEMIN || c === PONT;

  // Lit la carte (lignes = gy, colonnes = gx) → cases {gx, gy, sol, decor, constructible}
  G.lireCarte = function (carte, decors) {
    const H = carte.length, L = carte[0].length;
    const lettre = (gx, gy) => (gy >= 0 && gy < H && gx >= 0 && gx < L) ? carte[gy][gx] : ' ';
    const cases = [];
    for (let gy = 0; gy < H; gy++) {
      for (let gx = 0; gx < L; gx++) {
        const c = lettre(gx, gy);
        let sol = 'grass_center_N', decor = null, constructible = false;
        if (c === CHEMIN) {
          const surGx = estChemin(lettre(gx - 1, gy)) || estChemin(lettre(gx + 1, gy));
          const surGy = estChemin(lettre(gx, gy - 1)) || estChemin(lettre(gx, gy + 1));
          sol = surGx && surGy ? 'grass_pathCrossing_N' : surGy ? 'grass_path_E' : 'grass_path_N';
        } else if (c === RIVIERE) {
          const surGy = lettre(gx, gy - 1) === RIVIERE || lettre(gx, gy + 1) === RIVIERE || lettre(gx, gy - 1) === PONT || lettre(gx, gy + 1) === PONT;
          sol = surGy ? 'grass_river_E' : 'grass_river_N';
        } else if (c === PONT) {
          sol = 'grass_riverBridge_N';
        } else if (decors[c]) {
          decor = decors[c];
        } else {
          constructible = true;
        }
        cases.push({ gx, gy, sol, decor, constructible });
      }
    }
    return { largeur: L, hauteur: H, cases };
  };

  /* ===== BÂTIMENTS ===== */
  // Pièces à dessiner pour un bâtiment : [{image, gx, gy, h}]
  G.pieces = function (bat, catalogue) {
    const def = catalogue.batiments[bat.type];
    if (!def) return [];
    const niveau = Math.min(Math.max(1, bat.niveau || 1), def.niveaux.length);
    return def.niveaux[niveau - 1].map(([image, h, dx = 0, dy = 0]) => ({ image, gx: bat.x + dx, gy: bat.y + dy, h }));
  };

  // Cases occupées (« gx,gy ») par les bâtiments et les décors du terrain
  G.occupees = function (terrain, batiments, catalogue) {
    const occ = new Set();
    for (const c of terrain.cases) if (!c.constructible) occ.add(`${c.gx},${c.gy}`);
    for (const b of batiments) {
      const [w, h] = catalogue.batiments[b.type]?.empreinte || [1, 1];
      for (let dx = 0; dx < w; dx++) for (let dy = 0; dy < h; dy++) occ.add(`${b.x + dx},${b.y + dy}`);
    }
    return occ;
  };

  // Rectangle (en pixels du monde) qui contient toute la carte, pour borner la caméra
  G.etendue = function (terrain, T, hauteurMax = 6) {
    const coins = [[0, 0], [terrain.largeur - 1, 0], [0, terrain.hauteur - 1], [terrain.largeur - 1, terrain.hauteur - 1]]
      .map(([gx, gy]) => G.versEcran(gx, gy, T));
    const xs = coins.map(p => p.x), ys = coins.map(p => p.y);
    return {
      x: Math.min(...xs) - T.largeur, y: Math.min(...ys) - T.hauteur - hauteurMax * T.etage,
      largeur: Math.max(...xs) - Math.min(...xs) + 2 * T.largeur,
      hauteur: Math.max(...ys) - Math.min(...ys) + 3 * T.hauteur + hauteurMax * T.etage
    };
  };

  if (typeof module !== 'undefined') module.exports = G; else racine.VillageGeo = G;
})(typeof window !== 'undefined' ? window : globalThis);
