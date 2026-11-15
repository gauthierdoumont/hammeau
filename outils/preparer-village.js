// Hameau — prépare les images du village : sélection, réduction, atlas — Créé par Gauthier Doumont
// Usage : node outils/preparer-village.js <dossier source contenant sketch-town/Tiles et sketch-town-expansion/Tiles>
// Résultat : www/assets/village/village.png + village.json (atlas Phaser) + LICENCE-pack.txt
// Pourquoi un atlas : une seule image à charger au lieu d'une centaine → l'onglet Village s'ouvre plus vite.
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const source = process.argv[2];
if (!source) { console.error('Indique le dossier source.'); process.exit(1); }
const SORTIE = path.join(__dirname, '..', 'www', 'assets', 'village');
const ECHELLE = 0.5;                 // 256×352 → 128×176 : assez net à 2× la taille affichée
const L = 256 * ECHELLE, H = 352 * ECHELLE;

// Pièces utilisées (nom de fichier sans extension). Seules celles-ci partent dans l'appli.
const BASE = 'sketch-town/Tiles/', EXT = 'sketch-town-expansion/Tiles/';
const dir4 = (nom) => ['N', 'E', 'S', 'W'].map(d => `${nom}_${d}`);
const PIECES = [
  // Terrain
  ...['grass_center_N', 'dirt_center_N', 'dirt_low_N', 'water_center_N', 'rocks_grass_N', 'rocks_dirt_N',
    ...dir4('grass_path'), ...dir4('grass_pathBend'), 'grass_pathCrossing_N', ...dir4('grass_pathEnd'), ...dir4('grass_pathSplit'),
    ...dir4('grass_river'), ...dir4('grass_riverBend'), ...dir4('grass_riverBridge'), ...dir4('grass_riverEnd'),
    'tree_single_N', 'tree_multiple_N', 'structure_low_N', 'structure_high_N'].map(n => BASE + n),
  ...['tree_pine_N', 'tree_pineLarge_N', 'well_N', 'well_E', ...dir4('fence_wood'), ...dir4('fence_woodCorner'),
    'furrow_cropWheat_N', 'furrow_cropWheat_E', 'furrow_crop_N', 'grass_block_N'].map(n => EXT + n),
  // Bâtiments : murs (portes et fenêtres visibles sur les faces avant = N et E)
  ...['building_door_N', 'building_door_E', 'building_doorWindows_N', 'building_doorWindows_E',
    'building_windows_N', 'building_windows_E', 'building_window_N', 'building_window_E',
    'building_doorBeige_N', 'building_doorBeige_E', 'building_doorWindowsBeige_N', 'building_doorWindowsBeige_E',
    'building_windowsBeige_N', 'building_windowsBeige_E', 'building_windowBeige_N', 'building_windowBeige_E'].map(n => BASE + n),
  ...['building_stack_N', 'building_stack_E', 'building_stackBeige_N', 'building_stackBeige_E',
    'balcony_wood_N', 'balcony_wood_E', 'balcony_stone_N', 'balcony_stone_E'].map(n => EXT + n),
  // Toits
  ...['Beige', 'Brown', 'Green', 'Purple'].flatMap(c => [`roof_gable${c}_N`, `roof_gable${c}_E`, `roof_point${c}_N`,
    `roof_church${c}_N`, `roof_church${c}_E`, `roof_round${c}_N`, `roof_round${c}_E`, `roof_rounded${c}_N`, `roof_slant${c}_N`, `roof_slant${c}_E`]).map(n => BASE + n),
  // Château (Arène, Mairie)
  ...['castle_tower_N', 'castle_towerBeige_N', 'castle_towerBrown_N', 'castle_towerGreen_N', 'castle_towerPurple_N',
    'castle_wall_N', 'castle_wall_E', 'castle_gate_N', 'castle_gate_E', 'castle_gateOpen_N', 'castle_gateOpen_E', 'castle_center_N', 'castle_window_N', 'castle_window_E'].map(n => BASE + n),
  ...['castle_towerCenter_N', ...['Beige', 'Brown', 'Green', 'Purple'].flatMap(c => [`castle_tower${c}Base_N`, `castle_tower${c}Top_N`])].map(n => EXT + n),
];

(async () => {
  const manquantes = PIECES.filter(p => !fs.existsSync(path.join(source, p + '.png')));
  if (manquantes.length) { console.error('Introuvables :', manquantes.join(', ')); process.exit(1); }
  fs.mkdirSync(SORTIE, { recursive: true });
  const colonnes = Math.floor(2048 / L);
  const lignes = Math.ceil(PIECES.length / colonnes);
  const frames = {};
  const images = await Promise.all(PIECES.map(async (p, i) => {
    const nom = path.basename(p);
    const x = (i % colonnes) * L, y = Math.floor(i / colonnes) * H;
    frames[nom] = { frame: { x, y, w: L, h: H }, rotated: false, trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w: L, h: H }, sourceSize: { w: L, h: H } };
    const img = await sharp(path.join(source, p + '.png')).resize(L, H).png().toBuffer();
    return { input: img, left: x, top: y };
  }));
  await sharp({ create: { width: colonnes * L, height: lignes * H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(images).png({ compressionLevel: 9, palette: true, quality: 95 }).toFile(path.join(SORTIE, 'village.png'));
  fs.writeFileSync(path.join(SORTIE, 'village.json'), JSON.stringify({
    frames, meta: { image: 'village.png', size: { w: colonnes * L, h: lignes * H }, scale: '1',
      app: 'Hameau — outils/preparer-village.js — Créé par Gauthier Doumont' }
  }));
  fs.copyFileSync(path.join(source, 'sketch-town', 'License.txt'), path.join(SORTIE, 'LICENCE-pack.txt'));
  const ko = Math.round(fs.statSync(path.join(SORTIE, 'village.png')).size / 1024);
  console.log(`${PIECES.length} pièces → village.png (${colonnes * L}×${lignes * H}, ${ko} Ko) + village.json`);
})();
