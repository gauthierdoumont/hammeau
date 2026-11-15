// Hameau — parcours dans un vrai navigateur (Playwright) — Créé par Gauthier Doumont
// Lancer : npm run e2e  (captures dans tests/captures/, ignorées par git)
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
const URL_APPLI = 'http://localhost:4173/';
const CLE = 'hameau_v1';
const FIXTURE = 'tests/fixtures/etat-v1.json';

const nav = await chromium.launch();
const echecs = [];
const verifier = (cond, msg) => { if (!cond) echecs.push(msg); };
const pause = (page) => page.waitForTimeout(300);

async function nouvellePage(largeur = 412, stockageDepart = null) {
  const ctx = await nav.newContext({ viewport: { width: largeur, height: 800 }, deviceScaleFactor: 1, colorScheme: 'dark', acceptDownloads: true });
  if (stockageDepart !== null) {
    // Seulement au tout premier chargement (pas aux rechargements)
    await ctx.addInitScript(([cle, val]) => {
      if (!sessionStorage.getItem('init')) { localStorage.setItem(cle, val); sessionStorage.setItem('init', '1'); }
    }, [CLE, stockageDepart]);
  }
  const page = await ctx.newPage();
  const erreurs = [], externes = [];
  page.on('pageerror', e => erreurs.push(e.message));
  page.on('console', m => m.type() === 'error' && !/illisibles/.test(m.text()) && erreurs.push(m.text()));
  page.on('request', r => { if (!r.url().startsWith('http://localhost:4173')) externes.push(r.url()); });
  await page.goto(URL_APPLI);
  await ctx.setOffline(true);
  await pause(page);
  return { ctx, page, erreurs, externes };
}
const lire = (page, cle = CLE) => page.evaluate(k => localStorage.getItem(k), cle);

/* 1. Navigation, affichage, hors ligne, 3 largeurs */
for (const largeur of [360, 412, 1100]) {
  const { ctx, page, erreurs, externes } = await nouvellePage(largeur);
  await page.screenshot({ path: `tests/captures/accueil-${largeur}.png` });
  verifier(await page.textContent('#titre') === "Aujourd'hui", 'titre accueil');
  for (const [onglet, titre] of [['village', 'Village'], ['perso', 'Perso'], ['reglages', 'Réglages']]) {
    await page.click(`.onglet[data-aller="${onglet}"]`);
    verifier(await page.textContent('#titre') === titre, `onglet ${onglet}`);
  }
  await pause(page);
  await page.screenshot({ path: `tests/captures/reglages-${largeur}.png` });
  await page.click('.ligne[data-aller="apropos"]');
  verifier(/^\d+\.\d+\.\d+$/.test(await page.textContent('#info-version')), 'version affichée');
  verifier(/Ko$/.test(await page.textContent('#info-taille')), 'taille des données affichée');
  verifier((await page.textContent('#ecran-apropos')).includes('Créé par Gauthier Doumont'), 'signature');
  verifier(await page.locator('.onglet.actif').getAttribute('data-aller') === 'reglages', 'onglet Réglages allumé sur À propos');
  await pause(page);
  await page.screenshot({ path: `tests/captures/apropos-${largeur}.png` });
  verifier(!(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)), `défilement horizontal à ${largeur}px`);
  verifier(!erreurs.length, `erreurs console à ${largeur}px : ${erreurs}`);
  verifier(!externes.length, `ressources externes : ${externes}`);
  await ctx.close();
}

/* 2. 1er lancement → état créé ; export ; rechargement ; import */
{
  const { ctx, page, erreurs } = await nouvellePage();
  const initial = JSON.parse(await lire(page));
  verifier(initial?.schemaVersion === 1 && initial.categories.length === 33, '1er lancement : état créé');

  await page.click('.onglet[data-aller="reglages"]');
  const [telechargement] = await Promise.all([page.waitForEvent('download'), page.click('#btn-exporter')]);
  const exporte = JSON.parse(fs.readFileSync(await telechargement.path(), 'utf8'));
  verifier(/^hameau_\d{4}-\d{2}-\d{2}\.json$/.test(telechargement.suggestedFilename()), 'nom du fichier exporté');
  verifier(exporte.meta?.appli === CLE && !('icsUrl' in exporte.reglages), 'export : meta présente, sans adresse iCal');
  verifier((await page.textContent('#info-dernier-export')).startsWith('Dernier export'), 'date du dernier export affichée');

  await ctx.setOffline(false); await page.reload(); await ctx.setOffline(true); await pause(page);
  verifier(JSON.parse(await lire(page)).reglages.dernierExport, 'rechargement : données gardées');

  // Import de la fixture fictive (avec une adresse iCal à ne PAS reprendre)
  await page.click('.onglet[data-aller="reglages"]');
  await page.setInputFiles('#fichier-import', FIXTURE);
  await page.waitForSelector('dialog[open]');
  const texteDialogue = await page.textContent('#dialogue');
  verifier(/Niveau 1 · 2 tâches · 2 saisies/.test(texteDialogue), 'aperçu de l\'import : ' + texteDialogue);
  await pause(page);
  await page.screenshot({ path: 'tests/captures/import-apercu.png' });
  await page.click('#dialogue-boutons .principal');
  await pause(page);
  const apres = JSON.parse(await lire(page));
  const fixture = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
  verifier(JSON.stringify(apres.taches) === JSON.stringify(fixture.taches) && apres.joueur.xpTotal === 26, 'import : données remplacées');
  verifier(apres.reglages.icsUrl === '', 'import : adresse iCal du fichier ignorée');
  const copies = await page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('hameau_v1_sauvegarde_')));
  verifier(copies.some(k => k.includes('avant-')) && copies.some(k => k.includes('hebdo-')), 'sauvegardes automatiques : ' + copies);

  // Fichier étranger → refusé, rien ne change
  fs.writeFileSync('tests/captures/etranger.json', '{"liste":[1,2,3]}');
  await page.setInputFiles('#fichier-import', 'tests/captures/etranger.json');
  await page.waitForSelector('dialog[open]');
  verifier((await page.textContent('#dialogue')).includes('ne vient pas de Hameau'), 'fichier étranger refusé');
  await page.click('#dialogue-boutons .bouton');
  verifier(JSON.parse(await lire(page)).joueur.xpTotal === 26, 'fichier étranger : rien n\'a changé');
  verifier(!erreurs.length, 'erreurs console (export/import) : ' + erreurs);
  await ctx.close();
}

/* 3. Données illisibles → écran de récupération, RIEN n'est écrasé */
{
  const casse = '{"schemaVersion":1,"joueur":{"niveau":7';
  const { ctx, page } = await nouvellePage(412, casse);
  verifier(await page.isVisible('#ecran-recuperation'), 'écran de récupération affiché');
  verifier(!(await page.isVisible('.onglets')), 'navigation masquée pendant la récupération');
  verifier(await lire(page) === casse, 'données illisibles NON écrasées');
  await page.screenshot({ path: 'tests/captures/recuperation.png' });
  // Récupération par import
  await page.setInputFiles('#fichier-import', FIXTURE);
  await page.waitForSelector('dialog[open]');
  await page.click('#dialogue-boutons .principal');
  await pause(page);
  verifier(await page.isVisible('#ecran-aujourdhui') && await page.isVisible('.onglets'), 'après import : retour à l\'accueil');
  const copies = await page.evaluate(() => Object.entries(localStorage).filter(([k]) => k.includes('_sauvegarde_avant-')).map(([, v]) => v));
  verifier(copies.includes(casse), 'texte illisible gardé en copie');
  await ctx.close();
}

/* 4. Données d'une version plus récente → message, rien n'est écrasé */
{
  const futur = JSON.stringify({ schemaVersion: 99, joueur: {}, taches: [] });
  const { ctx, page } = await nouvellePage(412, futur);
  verifier(await page.isVisible('#ecran-trop-recent'), 'écran « mise à jour » affiché');
  verifier(await lire(page) === futur, 'données plus récentes NON écrasées');
  await ctx.close();
}

/* 5. Étape 3 : ajout express, Plus d'options, catégorie perso */
{
  const { ctx, page, erreurs } = await nouvellePage(360);
  const etatStocke = async () => JSON.parse(await lire(page));
  verifier(await page.isVisible('#aujourdhui-vide'), 'écran vide encourageant au 1er lancement');
  await page.screenshot({ path: 'tests/captures/etape3-vide.png' });

  // Ajout express : nom + Entrée
  await page.click('#fab');
  await page.waitForSelector('#feuille-ajout[open]');
  verifier(await page.evaluate(() => document.activeElement?.id) === 'ajout-nom', 'le champ nom a le focus');
  verifier((await page.textContent('#ajout-categorie-choisie')).includes('Routine'), 'catégorie par défaut : Routine');
  await pause(page); await page.screenshot({ path: 'tests/captures/etape3-ajout.png' });
  await page.fill('#ajout-nom', 'Appeler le garage');
  await page.press('#ajout-nom', 'Enter');
  await pause(page);
  verifier(!(await page.isVisible('#feuille-ajout')), 'feuille fermée après Enregistrer');
  verifier(!(await page.isVisible('#aujourdhui-vide')), 'écran vide masqué');
  let e = await etatStocke();
  verifier(e.taches.length === 1 && e.taches[0].type === 'imprevu' && e.taches[0].taille === 'moyenne', 'tâche express : imprévu moyenne');
  verifier((await page.textContent('#listes')).includes('Appeler le garage'), 'tâche affichée');

  // Nom vide → message, la feuille reste ouverte
  await page.click('#fab');
  await page.click('#btn-enregistrer');
  verifier((await page.textContent('#ajout-erreur')).includes('nom'), 'nom vide : message');
  verifier(await page.isVisible('#feuille-ajout'), 'nom vide : feuille toujours ouverte');

  // Plus d'options : Lecture, quotidienne du lundi au vendredi, objectif 20 pages
  await page.fill('#ajout-nom', 'Lire');
  await page.click('#btn-options');
  await page.click('.tuile[data-categorie="lecture"]');
  await page.click('#choix-type [data-type="quotidienne"]');
  await page.click('#choix-jours [data-jour="6"]');
  await page.click('#choix-jours [data-jour="7"]');
  await page.check('#ajout-objectif');
  await page.fill('#ajout-cible', '20');
  await page.fill('#ajout-unite', 'pages');
  await pause(page);
  await page.screenshot({ path: 'tests/captures/etape3-options.png', fullPage: true });
  verifier(!(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)), 'options : pas de défilement horizontal à 360 px');
  await page.click('#btn-enregistrer');
  await pause(page);
  e = await etatStocke();
  const lire20 = e.taches.find(t => t.nom === 'Lire');
  verifier(lire20?.type === 'quotidienne' && lire20.jours.join() === '1,2,3,4,5' && lire20.objectif?.cible === 20, 'tâche avec options : ' + JSON.stringify(lire20));
  verifier(e.reglages.derniereCategorie === 'lecture', 'dernière catégorie mémorisée');
  verifier((await page.textContent('#listes')).includes('Objectif : 20 pages · lun, mar, mer, jeu, ven'), 'détails de la quotidienne');

  // Catégorie perso depuis la feuille d'ajout, puis utilisée tout de suite
  await page.click('#fab');
  verifier((await page.textContent('#ajout-categorie-choisie')).includes('Lecture'), 'catégorie par défaut = dernière utilisée');
  await page.click('#btn-options');
  verifier((await page.textContent('#grille-categories')).includes('⭐ Favoris'), 'favoris affichés');
  await page.click('.tuile[data-action="nouvelle-categorie"]');
  await page.waitForSelector('#feuille-categorie[open]');
  await page.click('#emojis-suggeres [data-emoji="🎸"]');
  await page.fill('#categorie-nom', 'Guitare');
  await page.click('#choix-famille [data-famille="creation"]');
  await page.screenshot({ path: 'tests/captures/etape3-categorie.png' });
  await page.click('#form-categorie .principal');
  await pause(page);
  verifier(!(await page.isVisible('#feuille-categorie')) && await page.isVisible('#feuille-ajout'), 'retour à la feuille d\'ajout');
  verifier((await page.textContent('#ajout-categorie-choisie')).includes('🎸 Guitare'), 'nouvelle catégorie sélectionnée');
  await page.fill('#ajout-nom', 'Gammes');
  await page.click('#btn-enregistrer');
  await pause(page);
  e = await etatStocke();
  const guitare = e.categories.find(c => c.nom === 'Guitare');
  verifier(guitare?.perso && guitare.familleId === 'creation' && guitare.nbUtilisations === 1, 'catégorie perso enregistrée');

  // Doublon refusé
  await page.click('.onglet[data-aller="reglages"]');
  await page.click('.ligne[data-aller="categories"]');
  verifier((await page.textContent('#liste-categories')).includes('Guitare'), 'Réglages : catégorie perso listée');
  await page.click('[data-action="nouvelle-categorie"]');
  await page.fill('#categorie-emoji', '📚');
  await page.fill('#categorie-nom', 'révision');
  await page.click('#choix-famille [data-famille="esprit"]');
  await page.click('#form-categorie .principal');
  verifier((await page.textContent('#categorie-erreur')).includes('existe déjà'), 'doublon refusé');

  // Bouton retour : ferme la feuille, puis remonte les écrans
  await page.evaluate(() => retourEcranPrecedent());
  verifier(!(await page.isVisible('#feuille-categorie')), 'retour : feuille fermée');
  await page.evaluate(() => retourEcranPrecedent());
  verifier(await page.textContent('#titre') === 'Réglages', 'retour : Catégories → Réglages');
  verifier(!(await page.isVisible('#fab')), 'bouton + seulement sur Aujourd\'hui');

  await page.click('.onglet[data-aller="aujourdhui"]');
  await pause(page);
  await page.screenshot({ path: 'tests/captures/etape3-listes.png', fullPage: true });
  verifier(S_ok(e), 'état final valide');
  verifier(!erreurs.length, 'erreurs console (étape 3) : ' + erreurs);
  await ctx.close();
}
function S_ok(e) { return e.schemaVersion === 1 && new Set(e.taches.map(t => t.id)).size === e.taches.length; }

await nav.close(); serveur.close();
console.log(echecs.length ? '✗ ' + echecs.join('\n✗ ') : '✓ parcours OK : navigation (360/412/1100 px, hors ligne), export, rechargement, import, récupération, ajout de tâches, catégories perso');
process.exit(echecs.length ? 1 : 0);
