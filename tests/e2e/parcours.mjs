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
  // Horloge simulée : lundi 16 novembre 2026, 10 h (Bruxelles) → résultats identiques quel que soit le jour du test
  await ctx.addInitScript(() => { localStorage.setItem('debug_maintenant', '2026-11-16T10:00:00+01:00'); localStorage.setItem('debug_hasard', 'jamais'); });
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
  // Hors ligne : toute adresse extérieure est refusée (setOffline bloquerait aussi le serveur local, alors que
  // sur le téléphone les fichiers sont DANS l'appli). Les tentatives sont quand même comptées dans « externes ».
  await ctx.route(url => !String(url).startsWith('http://localhost:4173'), route => route.abort());
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
  verifier(initial?.schemaVersion === 2 && initial.categories.length === 33, '1er lancement : état créé');

  await page.click('.onglet[data-aller="reglages"]');
  const [telechargement] = await Promise.all([page.waitForEvent('download'), page.click('#btn-exporter')]);
  const exporte = JSON.parse(fs.readFileSync(await telechargement.path(), 'utf8'));
  verifier(/^hameau_\d{4}-\d{2}-\d{2}\.json$/.test(telechargement.suggestedFilename()), 'nom du fichier exporté');
  verifier(exporte.meta?.appli === CLE && !('icsUrl' in exporte.reglages), 'export : meta présente, sans adresse iCal');
  verifier((await page.textContent('#info-dernier-export')).startsWith('Dernier export'), 'date du dernier export affichée');

  await page.reload(); await pause(page);
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
  verifier((await page.textContent('#listes')).includes('0 / 20 pages · lun, mar, mer, jeu, ven'), 'détails de la quotidienne');

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
function S_ok(e) { return e.schemaVersion === 2 && new Set(e.taches.map(t => t.id)).size === e.taches.length; }

/* 6. Étape 4 : cocher, progression partielle, gains, animation, Annuler, modifier, supprimer, niveau */
{
  const { ctx, page, erreurs } = await nouvellePage(412);
  const etatStocke = async () => JSON.parse(await lire(page));
  const ajouter = async (nom, options) => {
    await page.click('#fab');
    await page.fill('#ajout-nom', nom);
    if (options) await options();
    await page.click('#btn-enregistrer');
    await pause(page);
  };
  const idDe = async (nom) => (await etatStocke()).taches.find(t => t.nom === nom).id;

  // Tâche simple : cocher → +25 XP et +25 bois, gain affiché avant
  await ajouter('Faire la vaisselle');
  verifier((await page.textContent(`.tache[data-tache="${await idDe('Faire la vaisselle')}"] .gain`)).includes('+30 🪵'), 'gain prévu affiché (imprévu ×1,2)');
  await page.click(`[data-cocher="${await idDe('Faire la vaisselle')}"]`);
  await page.waitForTimeout(200);
  verifier(await page.locator('.vol').count() === 1, 'le gain s\'envole');
  await page.screenshot({ path: 'tests/captures/etape4-vol.png' });
  await page.waitForTimeout(1000);
  let e = await etatStocke();
  verifier(e.joueur.xpTotal === 30 && e.joueur.ressources.bois === 30, 'gains enregistrés : ' + JSON.stringify(e.joueur.ressources));
  verifier(e.taches[0].archivee && e.journal.length === 1 && e.journal[0].jour === '2026-11-16', 'imprévu archivé, journal avec jour logique');
  verifier((await page.textContent('.pastille-res[data-ressource="bois"] b')) === '30', 'compteur bois à 30');
  verifier(await page.isVisible('#toast-action'), 'bouton Annuler proposé');
  await page.click('#toast-action');
  await pause(page);
  e = await etatStocke();
  verifier(e.joueur.xpTotal === 0 && e.journal.length === 0 && !e.taches[0].archivee, 'Annuler : tout revient comme avant');

  // Objectif chiffré quotidien : 10 sur 20 → 50 %, puis « Tout le reste »
  await ajouter('Lire', async () => {
    await page.click('#btn-options');
    await page.click('.tuile[data-categorie="lecture"]');
    await page.click('#choix-type [data-type="quotidienne"]');
    await page.check('#ajout-objectif');
    await page.fill('#ajout-cible', '20');
    await page.fill('#ajout-unite', 'pages');
  });
  const lireId = await idDe('Lire');
  await page.click(`[data-saisir="${lireId}"]`);
  await page.waitForSelector('#feuille-saisie[open]');
  verifier((await page.textContent('#saisie-question')) === 'Combien de pages ?', 'question de saisie');
  await page.screenshot({ path: 'tests/captures/etape4-saisie.png' });
  await page.fill('#saisie-valeur', '10');
  await page.press('#saisie-valeur', 'Enter');
  await page.waitForTimeout(1000);
  e = await etatStocke();
  verifier(e.joueur.ressources.savoir === 13 && e.journal.at(-1).progression === 0.5, 'saisie partielle : +13 savoir, 50 %');
  verifier((await page.textContent(`.tache[data-tache="${lireId}"]`)).includes('10 / 20 pages'), 'carte : 10 / 20 pages');
  await page.click(`[data-saisir="${lireId}"]`);
  await page.click('#saisie-raccourcis button:last-child');
  await page.waitForTimeout(1000);
  e = await etatStocke();
  verifier(e.joueur.ressources.savoir === 25, 'objectif complété : 25 savoir au total');
  verifier(await page.locator(`.tache.fait[data-tache="${lireId}"]`).count() === 1, 'quotidienne marquée faite');
  verifier(await page.locator(`[data-cocher="${lireId}"][disabled]`).count() === 1, 'quotidienne faite : case désactivée');

  // Modifier puis supprimer (avec Annuler)
  await ajouter('Apeler le garage');
  const garage = await idDe('Apeler le garage');
  await page.click(`[data-modifier="${garage}"]`);
  verifier((await page.textContent('#ajout-titre')) === 'Modifier la tâche' && (await page.inputValue('#ajout-nom')) === 'Apeler le garage', 'feuille de modification pré-remplie');
  await page.fill('#ajout-nom', 'Appeler le garage');
  await page.click('#btn-enregistrer');
  await pause(page);
  e = await etatStocke();
  verifier(e.taches.find(t => t.id === garage).nom === 'Appeler le garage', 'tâche renommée');
  const xpAvant = e.joueur.xpTotal;
  await page.click(`[data-modifier="${garage}"]`);
  await page.click('#btn-supprimer');
  await page.waitForSelector('#dialogue[open]');
  await page.click('#dialogue-boutons .principal');
  await pause(page);
  e = await etatStocke();
  verifier(e.taches.find(t => t.id === garage).archivee && e.joueur.xpTotal === xpAvant, 'suppression douce, XP gardée');
  verifier(await page.locator(`[data-tache="${garage}"]`).count() === 0, 'tâche supprimée retirée de la liste');
  await page.click('#toast-action');
  await pause(page);
  verifier(await page.locator(`[data-tache="${garage}"]`).count() === 1, 'Annuler la suppression');

  // Montée de niveau
  await page.evaluate(() => { etat.joueur.xp = 95; });
  await page.click(`[data-cocher="${garage}"]`);
  await page.waitForTimeout(300);
  verifier((await page.textContent('#toast-texte')).includes('Niveau 2'), 'message de niveau');
  verifier((await page.textContent('#xp-niveau')) === 'Niv. 2', 'barre : niveau 2');
  // Étape 5b : écran de fête, fermé par « Continuer »
  await page.waitForSelector('#celebration:not([hidden]) .medaillon.geant');
  verifier((await page.textContent('#celebration')).includes('Niveau supérieur'), 'écran de fête du niveau');
  await page.click('[data-celebration-fermer]');
  await page.waitForTimeout(400);
  verifier(await page.isHidden('#celebration'), 'fête fermée');
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'tests/captures/etape4-final.png', fullPage: true });
  verifier(!(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)), 'étape 4 : pas de défilement horizontal');

  // Double toucher rapide sur deux tâches de la même ressource : le compteur ne recule jamais
  await ajouter('Lessive');
  await ajouter('Repassage');
  const lessive = await idDe('Lessive'), repassage = await idDe('Repassage');
  const ressource = await page.evaluate((id) => Moteur.ressourceDe(Taches.categorie(etat, etat.taches.find(t => t.id === id).categorieId), CONFIG), lessive);
  await page.evaluate((r) => {
    const b = document.querySelector(`.pastille-res[data-ressource="${r}"] b`);
    window.__vues = [];
    new MutationObserver(() => window.__vues.push(Number(b.textContent.replace(/\s/g, '')))).observe(b, { childList: true, characterData: true, subtree: true });
  }, ressource);
  await page.click(`[data-cocher="${lessive}"]`);
  await page.waitForTimeout(150);
  await page.click(`[data-cocher="${repassage}"]`);
  await page.waitForTimeout(1500);
  const vues = await page.evaluate(() => window.__vues);
  verifier(vues.length > 0 && vues.every((v, i) => i === 0 || v >= vues[i - 1]), 'compteur jamais à reculons : ' + vues.join(','));
  const final = (await etatStocke()).joueur.ressources[ressource];
  verifier(vues.at(-1) === final, `compteur final = ${final}`);

  // Nouvelle journée alors que l'appli reste ouverte : les quotidiennes se réactivent
  verifier(await page.locator(`[data-cocher="${lireId}"][disabled]`).count() === 1, 'avant 4 h : Lire encore faite');
  await page.evaluate(() => { localStorage.setItem('debug_maintenant', '2026-11-17T09:00:00+01:00'); verifierNouveauJour(); });
  await pause(page);
  verifier(await page.locator(`[data-cocher="${lireId}"]:not([disabled])`).count() === 1, 'lendemain : Lire à refaire');
  verifier(!erreurs.length, 'erreurs console (étape 4) : ' + erreurs);
  await ctx.close();
}

/* 7. Village : Phaser chargé seulement à l'ouverture de l'onglet, scène à la bonne taille, endormie hors de l'onglet.
 * (Pas de capture enregistrée : le village est une surprise jusqu'au 1er lancement sur le téléphone.) */
{
  const { ctx, page, erreurs, externes } = await nouvellePage(412);
  const phaserCharge = () => page.evaluate(() => !!window.Phaser);
  verifier(!(await phaserCharge()), 'Phaser pas chargé au démarrage (appli rapide)');
  await page.click('.onglet[data-aller="village"]');
  await page.waitForFunction(() => window.Village?.estPret(), null, { timeout: 15000 });
  verifier(await phaserCharge(), 'Phaser chargé à l\'ouverture du village');
  const boite = await page.locator('#village canvas').boundingBox();
  verifier(boite && boite.width === 412 && boite.height > 500, 'scène pleine largeur et haute : ' + JSON.stringify(boite));
  verifier(await page.isVisible('#village-bulle'), 'bulle d\'accueil à la 1re visite');
  await page.click('#village-bulle-ok');
  await page.evaluate(() => Village.demo());
  await page.mouse.move(206, 400); await page.mouse.down(); await page.mouse.move(80, 300, { steps: 6 }); await page.mouse.up();
  await page.mouse.wheel(0, -300);
  await page.waitForTimeout(300);
  await page.click('.onglet[data-aller="aujourdhui"]');
  verifier(!(await page.evaluate(() => Village.tourne())), 'village endormi hors de son onglet');
  verifier(!(await page.isVisible('#village')), 'scène masquée sur Aujourd\'hui');
  await page.click('.onglet[data-aller="village"]');
  await page.waitForTimeout(200);
  verifier(await page.evaluate(() => Village.tourne()), 'village réveillé au retour');
  verifier(!(await page.isVisible('#village-bulle')), 'bulle d\'accueil plus montrée ensuite');
  verifier(!erreurs.length, 'erreurs console (village) : ' + erreurs);
  verifier(!externes.length, 'ressources externes (village) : ' + externes);
  await ctx.close();
}

/* 8. Construire : Mairie d'abord, coût payé, fiche, amélioration (pas de capture : surprise) */
{
  const { ctx, page, erreurs, externes } = await nouvellePage(412);
  await page.evaluate(() => Appli.modifier(e => { for (const r of Object.keys(e.joueur.ressources)) e.joueur.ressources[r] = 300; e.joueur.niveau = 6; }));
  await page.click('.onglet[data-aller="village"]');
  await page.waitForFunction(() => window.Village?.estPret(), null, { timeout: 15000 });
  await page.click('#village-bulle-ok');
  await page.click('#btn-construire');
  await page.waitForSelector('#feuille-construire[open]');
  verifier(await page.locator('#liste-construire .bat-carte').count() === 8, '8 bâtiments proposés');
  verifier((await page.textContent('#liste-construire')).includes('Construis d\'abord la Mairie'), 'autres bâtiments verrouillés avec explication');
  await page.click('[data-construire="mairie"]');
  verifier(await page.isVisible('#village-placement'), 'mode placement');
  verifier(await page.isEnabled('#btn-placer'), 'case de départ libre');
  await page.click('#btn-placer');
  await page.waitForTimeout(400);
  let e = await page.evaluate(() => Appli.etat());
  verifier(e.village.batiments.length === 1 && e.village.batiments[0].type === 'mairie', 'Mairie construite');
  verifier(e.joueur.ressources.bois === 260 && e.joueur.ressources.savoir === 260, 'coût payé (40 de chaque)');
  const stocke = JSON.parse(await lire(page));
  verifier(stocke.schemaVersion === 2 && stocke.village.batiments.length === 1, 'village sauvegardé');
  // Placement refusé sur une case occupée (le puits)
  await page.click('#btn-construire');
  await page.click('[data-construire="taverne"]');
  await page.evaluate(() => Village.quitterPlacement());
  await page.click('#btn-placement-annuler');
  // Fiche de la Mairie (ouverte comme si on l'avait touchée) puis amélioration
  await page.click('#btn-construire');
  await page.click('[data-voir]');
  await page.waitForSelector('#feuille-batiment[open]');
  verifier((await page.textContent('#fiche-nom')) === 'Mairie', 'fiche de la Mairie');
  await page.click('#btn-ameliorer');
  await page.waitForTimeout(400);
  e = await page.evaluate(() => Appli.etat());
  verifier(e.village.batiments[0].niveau === 2 && e.joueur.ressources.bois === 100, 'Mairie niveau 2 (160 de chaque payé)');
  // Bonus : la Bibliothèque fait gagner plus de Savoir
  await page.click('#btn-construire');
  await page.click('[data-construire="bibliotheque"]');
  await page.click('#btn-placer');
  await page.waitForTimeout(300);
  const bonus = await page.evaluate(() => Economie.bonus(Appli.etat(), 'esprit', CONFIG));
  verifier(bonus === 0.05, 'bonus Esprit +5 % : ' + bonus);
  // Étape 13 : décoration, agrandissement, incendie simulé puis réparation
  await page.evaluate(() => Appli.modifier(e => { e.joueur.ressources.gemmes = 5; for (const r of ['bois', 'pierre', 'or', 'savoir']) e.joueur.ressources[r] = 600; }));
  await page.click('#btn-construire');
  await page.click('[data-onglet="decorations"]');
  verifier(await page.locator('[data-decoration]').count() === Object.keys(await page.evaluate(() => CONFIG.decorations)).length, 'toutes les décorations proposées');
  await page.click('[data-decoration="tour"]');
  await page.click('#btn-placer');
  await page.waitForTimeout(300);
  e = await page.evaluate(() => Appli.etat());
  verifier(e.village.decorations.length === 1 && e.joueur.ressources.gemmes === 0, 'tour de guet achetée avec 5 gemmes');
  await page.click('#btn-construire');
  await page.click('[data-onglet="terrain"]');
  await page.click('#btn-agrandir');
  await page.waitForTimeout(600);
  e = await page.evaluate(() => Appli.etat());
  verifier(e.village.extensions === 1 && e.joueur.ressources.bois === 480, 'hameau agrandi (120 bois)');
  verifier(await page.evaluate(() => Village.terrain().anneaux) === 1, 'la scène a ajouté un anneau');
  await page.evaluate(() => Appli.modifier(x => { Economie.endommager(x, () => 0.99); }));
  const bib = await page.evaluate(() => Appli.etat().village.batiments.find(b => b.type === 'bibliotheque'));
  verifier(bib.endommage, 'incendie simulé : bibliothèque endommagée');
  await page.click('#btn-construire');
  await page.click('[data-onglet="batiments"]');
  await page.click(`[data-voir="${bib.id}"]`);
  await page.waitForSelector('#btn-reparer');
  await page.click('#btn-reparer');
  await page.waitForTimeout(300);
  verifier(!(await page.evaluate(() => Appli.etat().village.batiments.find(b => b.type === 'bibliotheque').endommage)), 'bibliothèque réparée');

  // Bouton retour pendant un placement = annuler
  await page.click('#btn-construire');
  await page.click('[data-construire="taverne"]');
  await page.evaluate(() => retourEcranPrecedent());
  verifier(!(await page.isVisible('#village-placement')), 'retour : placement annulé');
  verifier(!erreurs.length, 'erreurs console (construction) : ' + erreurs);
  verifier(!externes.length, 'ressources externes (construction) : ' + externes);
  await ctx.close();
}

/* 9. Étape 5b : coffre (hasard forcé), puis bouton retour qui ferme la célébration */
{
  const { ctx, page, erreurs } = await nouvellePage(412);
  await page.evaluate(() => localStorage.setItem('debug_hasard', 'toujours'));
  await page.click('#fab');
  await page.fill('#ajout-nom', 'Sortir les poubelles');
  await page.click('#btn-enregistrer');
  await pause(page);
  const id = await page.evaluate(() => Appli.etat().taches[0].id);
  await page.click(`[data-cocher="${id}"]`);
  await page.waitForSelector('#celebration:not([hidden]) .coffre-svg');
  await page.waitForTimeout(1300);
  const e = await page.evaluate(() => Appli.etat());
  verifier(e.joueur.ressources.gemmes >= 1 && e.journal[0].coffre, 'coffre : gemmes reçues');
  verifier(await page.locator('.recompenses span').count() === 3, 'coffre : 3 récompenses affichées');
  await page.evaluate(() => retourEcranPrecedent());
  await page.waitForTimeout(400);
  verifier(await page.isHidden('#celebration'), 'retour : célébration fermée');
  verifier(!erreurs.length, 'erreurs console (coffre) : ' + erreurs);
  await ctx.close();
}

/* 10. Étape 6 : retour après 3 jours, « hier jusqu'à midi », pause rétroactive */
{
  const { ctx, page, erreurs } = await nouvellePage(412);
  await page.evaluate(() => Appli.modifier(e => {
    Taches.ajouterTache(e, Taches.creerTache({ nom: 'Lecture du soir', categorieId: 'lecture', type: 'quotidienne' }, e, CONFIG, 'q1', '2026-11-01T08:00:00.000Z').tache);
    e.etat.dernierJourTraite = '2026-11-12';
    e.joueur.serie = { jours: 4, joker: 0 };
  }));
  await page.reload();
  await page.waitForSelector('#dialogue[open]');
  const texte = await page.textContent('#dialogue');
  verifier(/Content de te revoir/.test(texte) && /repart de zéro/.test(texte), 'message de retour neutre : ' + texte);
  verifier(!/raté|échec|oublié/i.test(texte), 'aucun mot culpabilisant');
  await page.click('#dialogue-boutons .principal');
  let e = await page.evaluate(() => Appli.etat());
  verifier(e.etat.dernierJourTraite === '2026-11-14' && e.joueur.moral === 70, 'rattrapage des 13 et 14 (le 15 attend midi) : ' + e.joueur.moral);
  verifier(await page.isVisible('#hier') && (await page.textContent('#liste-hier')).includes('Lecture du soir'), 'encart « hier » le matin');
  await page.click('[data-hier="q1"]');
  await pause(page);
  e = await page.evaluate(() => Appli.etat());
  verifier(e.journal.some(x => x.jour === '2026-11-15' && x.tacheId === 'q1'), 'saisie pour la veille (jour logique 15)');
  verifier(!(await page.isVisible('#hier')), 'encart « hier » vidé');
  // Pause rétroactive depuis le 13 : le moral perdu est rendu, la série aussi
  await page.click('.onglet[data-aller="reglages"]');
  await page.click('#btn-pause');
  await page.waitForSelector('#dialogue[open] #pause-debut');
  await page.selectOption('#pause-debut', '2026-11-13');
  await page.click('#dialogue-boutons .principal');
  await pause(page);
  e = await page.evaluate(() => Appli.etat());
  verifier(e.joueur.pause.actif && e.joueur.moral === 81 && e.joueur.serie.jours === 4, `pause : moral ${e.joueur.moral}, série ${e.joueur.serie.jours}`);
  await page.click('.onglet[data-aller="aujourdhui"]');
  verifier(await page.isVisible('#bandeau-pause'), 'bandeau « en pause »');
  await page.click('#btn-reprendre');
  await pause(page);
  verifier(!(await page.isVisible('#bandeau-pause')), 'reprise');
  verifier(!erreurs.length, 'erreurs console (jours) : ' + erreurs);
  await ctx.close();
}

await nav.close(); serveur.close();
console.log(echecs.length ? '✗ ' + echecs.join('\n✗ ') : '✓ parcours OK : navigation (360/412/1100 px, hors ligne), export, rechargement, import, récupération, ajout de tâches, catégories perso, cocher, village, construction, décorations, agrandir, réparer, coffre, fête, jours');
process.exit(echecs.length ? 1 : 0);
