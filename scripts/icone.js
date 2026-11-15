// Hameau — dessine l'icône et l'écran de démarrage (SVG → PNG) — Créé par Gauthier Doumont
// Lancer avec : npm run icones (seulement quand l'icône change)
const sharp = require('sharp');
const path = require('path');
const A = (f) => path.join(__dirname, '..', 'assets', f);

const FOND = `
  <defs>
    <linearGradient id="ciel" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#1b2448"/><stop offset="1" stop-color="#141a2e"/>
    </linearGradient>
  </defs>
  <rect width="1024" height="1024" fill="url(#ciel)"/>
  <g fill="#fff6d5">
    <circle cx="190" cy="210" r="7"/><circle cx="300" cy="140" r="5"/><circle cx="820" cy="190" r="6"/>
    <circle cx="720" cy="120" r="4"/><circle cx="880" cy="330" r="5"/><circle cx="140" cy="380" r="4"/>
  </g>
  <circle cx="790" cy="300" r="56" fill="#ffe7a3"/>
  <circle cx="768" cy="282" r="56" fill="#1a2245"/>`;

// La maison est dessinée dans la « zone sûre » centrale (66 %) pour l'icône adaptative Android
const MAISON = `
  <ellipse cx="512" cy="860" rx="520" ry="230" fill="#3f8f4e"/>
  <ellipse cx="512" cy="880" rx="420" ry="170" fill="#4fae5d"/>
  <rect x="610" y="330" width="56" height="110" rx="6" fill="#7b4a2e"/>
  <g fill="#cfd6e6" opacity="0.8"><circle cx="645" cy="300" r="22"/><circle cx="672" cy="262" r="16"/></g>
  <rect x="352" y="500" width="320" height="230" rx="10" fill="#f3e3c3"/>
  <path d="M320 520 L512 345 L704 520 Z" fill="#d9483b"/>
  <path d="M320 520 L512 345 L512 380 L352 525 Z" fill="#b8362b"/>
  <rect x="470" y="600" width="84" height="130" rx="40" fill="#7b4a2e"/>
  <rect x="385" y="560" width="62" height="62" rx="8" fill="#ffd166"/>
  <rect x="578" y="560" width="62" height="62" rx="8" fill="#ffd166"/>
  <path d="M416 560 V622 M385 591 H447 M609 560 V622 M578 591 H640" stroke="#c9922a" stroke-width="6"/>`;

const svg = (contenu, taille = 1024) =>
  Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${taille}" height="${taille}" viewBox="0 0 1024 1024">${contenu}</svg>`);

(async () => {
  await sharp(svg(FOND + MAISON)).png().toFile(A('icon-only.png'));
  await sharp(svg(FOND)).png().toFile(A('icon-background.png'));
  // Premier plan réduit à 70 % et centré, pour que le masque rond d'Android ne coupe rien
  const pp = await sharp(svg(MAISON.replace(/<ellipse[^>]*\/>/g, '') +
    '<ellipse cx="512" cy="735" rx="230" ry="26" fill="#4fae5d"/>')).png().toBuffer();
  await sharp(pp).png().toFile(A('icon-foreground.png'));
  // Écran de démarrage : fond nuit + petite maison au centre
  const petit = await sharp(svg(FOND + MAISON, 700)).png().toBuffer();
  for (const f of ['splash.png', 'splash-dark.png']) {
    await sharp({ create: { width: 2732, height: 2732, channels: 4, background: '#141a2e' } })
      .composite([{ input: petit, gravity: 'center' }]).png().toFile(A(f));
  }
  console.log('Icônes écrites dans assets/');
})();
