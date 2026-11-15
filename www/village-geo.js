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

  // Lit la carte (lignes = gy, colonnes = gx) → cases {gx, gy, sol, decor, constructible, anneau}
  // anneaux = extensions achetées : chaque anneau ajoute une bordure de terrain tout autour de l'île de départ.
  // La rivière et les chemins se prolongent ; quelques arbres et rochers poussent (toujours au même endroit).
  G.lireCarte = function (carte, decors, anneaux = 0) {
    const H = carte.length, L = carte[0].length;
    const base = (gx, gy) => (gy >= 0 && gy < H && gx >= 0 && gx < L) ? carte[gy][gx] : null;
    // Où la rivière et les chemins sortent de l'île de départ (pour les prolonger)
    const colonnes = (ch) => [...Array(L).keys()].filter(x => carte[0][x] === ch || carte[H - 1][x] === ch);
    const lignes = (ch) => [...Array(H).keys()].filter(y => carte[y][0] === ch || carte[y][L - 1] === ch);
    const colRiviere = new Set(colonnes(RIVIERE)), colChemin = new Set(colonnes(CHEMIN)), ligChemin = new Set(lignes(CHEMIN));
    const DECORS_AU_HASARD = ['T', 'P', 'M', 'G', 'T', 'P', 'R'];
    const anneau = (gx, gy) => Math.max(0, -gx, -gy, gx - (L - 1), gy - (H - 1));
    const lettre = (gx, gy) => {
      const b = base(gx, gy);
      if (b !== null) return b;
      if (anneau(gx, gy) > anneaux) return ' ';
      const riv = colRiviere.has(gx), che = colChemin.has(gx) || ligChemin.has(gy);
      if (riv && ligChemin.has(gy)) return PONT;
      if (riv) return RIVIERE;
      if (che) return CHEMIN;
      const h = Math.abs((gx * 73856093) ^ (gy * 19349663)) % 100;      // pseudo-hasard stable
      return h < 24 ? DECORS_AU_HASARD[h % DECORS_AU_HASARD.length] : '.';
    };
    const cases = [];
    const debut = 0 - anneaux;                     // (0 - 0 = 0, alors que -0 resterait « moins zéro »)
    for (let gy = debut; gy < H + anneaux; gy++) {
      for (let gx = debut; gx < L + anneaux; gx++) {
        const c = lettre(gx, gy);
        let sol = 'grass_center_N', decor = null, constructible = false;
        if (c === CHEMIN) {
          const surGx = estChemin(lettre(gx - 1, gy)) || estChemin(lettre(gx + 1, gy));
          const surGy = estChemin(lettre(gx, gy - 1)) || estChemin(lettre(gx, gy + 1));
          sol = surGx && surGy ? 'grass_pathCrossing_N' : surGy ? 'grass_path_E' : 'grass_path_N';
        } else if (c === RIVIERE) {
          const surGy = [lettre(gx, gy - 1), lettre(gx, gy + 1)].some(x => x === RIVIERE || x === PONT);
          sol = surGy ? 'grass_river_E' : 'grass_river_N';
        } else if (c === PONT) {
          sol = 'grass_riverBridge_N';
        } else if (decors[c]) {
          decor = decors[c];
        } else {
          constructible = true;
        }
        cases.push({ gx, gy, sol, decor, constructible, anneau: anneau(gx, gy) });
      }
    }
    return { largeur: L + 2 * anneaux, hauteur: H + 2 * anneaux, min: { gx: debut, gy: debut },
      max: { gx: L - 1 + anneaux, gy: H - 1 + anneaux }, anneaux, cases };
  };

  /* ===== BÂTIMENTS ===== */
  // Pièces à dessiner pour un bâtiment : [{image, gx, gy, h}]
  G.pieces = function (bat, catalogue) {
    const def = catalogue.batiments[bat.type];
    if (!def) return [];
    const niveau = Math.min(Math.max(1, bat.niveau || 1), def.niveaux.length);
    return def.niveaux[niveau - 1].map(([image, h, dx = 0, dy = 0]) => ({ image, gx: bat.x + dx, gy: bat.y + dy, h }));
  };

  // Pièces d'une décoration : une seule image posée sur l'herbe
  G.piecesDecoration = function (deco, catalogue) {
    const image = catalogue.decorationsImages?.[deco.type];
    return image ? [{ image, gx: deco.x, gy: deco.y, h: 1 }] : [];
  };

  // Cases occupées (« gx,gy ») par les bâtiments, les décorations et les décors du terrain
  G.occupees = function (terrain, batiments, catalogue, decorations = []) {
    const occ = new Set();
    for (const c of terrain.cases) if (!c.constructible) occ.add(`${c.gx},${c.gy}`);
    for (const d of decorations) occ.add(`${d.x},${d.y}`);
    for (const b of batiments) {
      const [w, h] = catalogue.batiments[b.type]?.empreinte || [1, 1];
      for (let dx = 0; dx < w; dx++) for (let dy = 0; dy < h; dy++) occ.add(`${b.x + dx},${b.y + dy}`);
    }
    return occ;
  };

  // Rectangle (en pixels du monde) qui contient toute la carte, pour borner la caméra
  G.etendue = function (terrain, T, hauteurMax = 6) {
    const a = terrain.min || { gx: 0, gy: 0 }, b = terrain.max || { gx: terrain.largeur - 1, gy: terrain.hauteur - 1 };
    const coins = [[a.gx, a.gy], [b.gx, a.gy], [a.gx, b.gy], [b.gx, b.gy]]
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
