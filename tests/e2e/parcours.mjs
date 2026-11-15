// Hameau — parcours dans un vrai navigateur (Playwright) — Créé par Gauthier Doumont
// Lancer : node tests/e2e/parcours.mjs  (captures dans tests/captures/, ignorées par git)
import { chromium } from 'playwright';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png',
  '.json': 'application/json', '.ogg': 'audio/ogg', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };
const serveur = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  fs.readFile(path.join('www', p), (e, d) => {
    if (e) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream' }); res.end(d);
  });
}).listen(4173);
const nav = await chromium.launch();
const echecs = [];
const verifier = (cond, msg) => { if (!cond) echecs.push(msg); };
for (const largeur of [360, 412, 1100]) {
  const ctx = await nav.newContext({ viewport: { width: largeur, height: 800 }, deviceScaleFactor: 1, colorScheme: 'dark' });
  const page = await ctx.newPage();
  const erreurs = [], externes = [];
  page.on('pageerror', e => erreurs.push(e.message));
  page.on('console', m => m.type() === 'error' && erreurs.push(m.text()));
  page.on('request', r => { if (!r.url().startsWith('http://localhost:4173')) externes.push(r.url()); });
  await page.goto('http://localhost:4173/');
  await ctx.setOffline(true);
  await page.waitForTimeout(300); await page.screenshot({ path: `tests/captures/accueil-${largeur}.png` });
  verifier(await page.textContent('#titre') === "Aujourd'hui", 'titre accueil');
  for (const [onglet, titre] of [['village', 'Village'], ['perso', 'Perso'], ['reglages', 'Réglages']]) {
    await page.click(`.onglet[data-aller="${onglet}"]`);
    verifier(await page.textContent('#titre') === titre, `onglet ${onglet}`);
  }
  await page.click('.ligne[data-aller="apropos"]');
  verifier(await page.textContent('#info-version') === '0.1.0' || /\d+\.\d+\.\d+/.test(await page.textContent('#info-version')), 'version affichée');
  verifier((await page.textContent('#ecran-apropos')).includes('Créé par Gauthier Doumont'), 'signature');
  verifier(await page.locator('.onglet.actif').getAttribute('data-aller') === 'reglages', 'onglet Réglages allumé sur À propos');
  await page.waitForTimeout(300); await page.screenshot({ path: `tests/captures/apropos-${largeur}.png` });
  const debord = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  verifier(!debord, `défilement horizontal à ${largeur}px`);
  verifier(!erreurs.length, `erreurs console à ${largeur}px : ${erreurs}`);
  verifier(!externes.length, `ressources externes : ${externes}`);
  await ctx.close();
}
await nav.close(); serveur.close();
console.log(echecs.length ? '✗ ' + echecs.join('\n✗ ') : '✓ parcours OK (360, 412, 1100 px, hors ligne)');
process.exit(echecs.length ? 1 : 0);
