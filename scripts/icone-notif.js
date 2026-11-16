// Hameau — petite icône des notifications Android (silhouette blanche sur fond transparent) — Créé par Gauthier Doumont
// Pourquoi : sans elle, Android affiche un carré blanc dans la barre d'état. Lancer : node scripts/icone-notif.js
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

// Maison + tour, en aplat (Android n'utilise que la transparence de cette icône)
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
  <path fill="#fff" d="M2.5 21V11.2L6 6.5l3.5 4.7V21zM10.5 21v-7.6L15.5 8.5l6 5V21h-4.25v-3a1.75 1.75 0 0 0-3.5 0v3z"/>
  <path fill="#fff" d="M5.4 6.5V2.8l2.6 1-2.6 1z"/>
</svg>`;
const tailles = { mdpi: 24, hdpi: 36, xhdpi: 48, xxhdpi: 72, xxxhdpi: 96 };
const res = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'res');

(async () => {
  for (const [densite, px] of Object.entries(tailles)) {
    const dossier = path.join(res, `drawable-${densite}`);
    fs.mkdirSync(dossier, { recursive: true });
    await sharp(Buffer.from(svg), { density: 72 * px / 24 * 4 }).resize(px, px).png().toFile(path.join(dossier, 'ic_stat_hameau.png'));
    console.log(`drawable-${densite}/ic_stat_hameau.png (${px} px)`);
  }
})();
