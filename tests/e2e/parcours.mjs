// Hameau — parcours dans un vrai navigateur (Playwright) — Créé par Gauthier Doumont
// Lancer : npm run e2e  (captures dans tests/captures/, ignorées par git)
import { chromium } from 'playwright';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png',
  '.json': 'application/json', '.ogg': 'audio/ogg', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };
const PORT = Number(process.env.PORT_E2E) || 4173;   // autre port pour lancer deux parcours en même temps
const serveur = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  fs.readFile(path.join('www', p), (e, d) => {
    if (e) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream' }); res.end(d);
  });
}).listen(PORT);
const URL_APPLI = `http://localhost:${PORT}/`;
const CLE = 'hameau_v1';
const SCHEMA = 3;   // version actuelle de la structure des données (www/stockage.js)
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
  page.on('request', r => { if (!r.url().startsWith(URL_APPLI.slice(0, -1))) externes.push(r.url()); });
  await page.goto(URL_APPLI);
  // Hors ligne : toute adresse extérieure est refusée (setOffline bloquerait aussi le serveur local, alors que
  // sur le téléphone les fichiers sont DANS l'appli). Les tentatives sont quand même comptées dans « externes ».
  await ctx.route(url => !String(url).startsWith(URL_APPLI.slice(0, -1)), route => route.abort());
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
  verifier(initial?.schemaVersion === SCHEMA && initial.categories.length === 33, '1er lancement : état créé');

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
function S_ok(e) { return e.schemaVersion === SCHEMA && new Set(e.taches.map(t => t.id)).size === e.taches.length; }

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

  // « Annuler » juste après le tick de la minute (aucun jour à traiter) : l'annulation marche toujours
  await ajouter('Arroser les plantes');
  const plantes = await idDe('Arroser les plantes');
  const xpPlantes = (await etatStocke()).joueur.xpTotal;
  await page.click(`[data-cocher="${plantes}"]`);
  await page.waitForTimeout(200);
  const refAvantTick = await page.evaluate(() => { window.__ref = etat; verifierNouveauJour(); return etat === window.__ref; });
  verifier(refAvantTick, 'tick sans jour à traiter : état inchangé (même objet)');
  await page.click('#toast-action');
  await pause(page);
  verifier((await page.textContent('#toast-texte')).includes('Annulé'), 'Annuler après le tick : annulé, pas « trop tard »');
  e = await etatStocke();
  verifier(e.joueur.xpTotal === xpPlantes && !e.taches.find(t => t.id === plantes).archivee, 'Annuler après le tick : tout revient comme avant');

  // « Annuler » après une actualisation silencieuse de l'agenda (seul le cache change) : annulé, cache récent gardé
  await page.click(`[data-cocher="${plantes}"]`);
  await page.waitForTimeout(200);
  await page.evaluate(() => Appli.modifier(x => { x.reglages.calendrierCache = { chargeLe: new Date().toISOString(), evenements: [] }; }));
  await page.click('#toast-action');
  await pause(page);
  verifier((await page.textContent('#toast-texte')).includes('Annulé'), 'Annuler après l\'agenda actualisé : annulé, pas « trop tard »');
  e = await etatStocke();
  verifier(e.joueur.xpTotal === xpPlantes && e.reglages.calendrierCache?.evenements, 'Annuler après l\'agenda : coche annulée, cache récent gardé');
  // Vraie modification entre-temps → « Trop tard » (puis on remet l'état comme avant pour la suite)
  await page.evaluate(() => { window.__sauve = etat; });
  await page.click(`[data-cocher="${plantes}"]`);
  await page.waitForTimeout(200);
  await page.evaluate(() => Appli.modifier(x => { x.reglages.vibrations = !x.reglages.vibrations; }));
  await page.click('#toast-action');
  await pause(page);
  verifier((await page.textContent('#toast-texte')).includes('Trop tard'), 'vraie modification entre-temps : « Trop tard »');
  await page.evaluate(() => remplacerEtat(window.__sauve, { verifier: false }));

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
  await page.evaluate(() => Appli.modifier(e => { for (const r of Object.keys(e.joueur.ressources)) e.joueur.ressources[r] = 300; e.joueur.niveau = CONFIG.mairie.niveauJoueurRequis[1]; }));
  // Montants attendus calculés depuis config.js (un rééquilibrage ne casse pas le parcours)
  const prix = await page.evaluate(() => ({ m1: Economie.cout('mairie', 1, CONFIG).bois, m2: Economie.cout('mairie', 2, CONFIG).bois, ext: Economie.coutExtension(0, CONFIG).bois }));
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
  verifier(e.joueur.ressources.bois === 300 - prix.m1 && e.joueur.ressources.savoir === 300 - prix.m1, `coût payé (${prix.m1} de chaque)`);
  const stocke = JSON.parse(await lire(page));
  verifier(stocke.schemaVersion === SCHEMA && stocke.village.batiments.length === 1, 'village sauvegardé');
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
  verifier(e.village.batiments[0].niveau === 2 && e.joueur.ressources.bois === 300 - prix.m1 - prix.m2, `Mairie niveau 2 (${prix.m2} de chaque payé)`);
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
  verifier(e.village.extensions === 1 && e.joueur.ressources.bois === 600 - prix.ext, `hameau agrandi (${prix.ext} bois)`);
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

/* 11. Étape 7 : Prochaine action (ordre, Pas maintenant, C'est fait) + écran Perso */
{
  const { ctx, page, erreurs } = await nouvellePage(412);
  await page.evaluate(() => Appli.modifier(e => {
    const aj = (s, id) => Taches.ajouterTache(e, Taches.creerTache({ categorieId: 'lecture', ...s }, e, CONFIG, id, '2026-11-0' + id.length + 'T08:00:00.000Z').tache);
    aj({ nom: 'Rendre le rapport', categorieId: 'stage', echeance: '2026-11-18' }, 'r');
    aj({ nom: 'Étirements', categorieId: 'muscu', type: 'quotidienne', taille: 'petite' }, 'qq');
    aj({ nom: 'Nanoblock', categorieId: 'nanoblocks', type: 'bonus' }, 'bbb');
  }));
  await page.click('#btn-prochaine');
  verifier((await page.textContent('#prochaine-tache')).includes('Rendre le rapport'), "1re proposition : l'échéance");
  await page.click('#btn-pas-maintenant');
  verifier((await page.textContent('#prochaine-tache')).includes('Étirements'), 'puis la petite quotidienne');
  await page.screenshot({ path: 'tests/captures/etape7-prochaine.png' });
  await page.click('#btn-c-est-fait');
  await page.waitForTimeout(400);
  verifier(await page.evaluate(() => Appli.etat().journal.some(s => s.tacheId === 'qq')), "« C'est fait » coche la tâche");
  verifier(await page.isHidden('#prochaine-carte'), 'carte refermée');
  await page.waitForTimeout(800);
  await page.click('.onglet[data-aller="perso"]');
  await pause(page);
  verifier((await page.textContent('#perso-historique')).includes("Aujourd'hui") && (await page.textContent('#perso-historique')).includes('1 ✅'), 'historique du jour');
  verifier(/\d/.test(await page.textContent('#perso-serie')) && (await page.textContent('#perso-moral')) === '81', 'série et moral affichés');
  await page.screenshot({ path: 'tests/captures/etape7-perso.png', fullPage: true });
  verifier(!(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)), 'Perso : pas de défilement horizontal');
  verifier(!erreurs.length, 'erreurs console (étape 7) : ' + erreurs);
  await ctx.close();
}

/* 12. Étape 8 : sons / vibrations, sauvegardes automatiques + Restaurer, rappel d'export, vérifier les mises à jour */
{
  const { ctx, page, erreurs, externes } = await nouvellePage(412);
  // Sons et vibrations : interrupteurs liés aux réglages
  await page.click('.onglet[data-aller="reglages"]');
  verifier(await page.isChecked('#reglage-sons') && await page.isChecked('#reglage-vibrations'), 'sons et vibrations activés au départ');
  await page.click('label[for="reglage-sons"]');
  await page.click('label[for="reglage-vibrations"]');
  let e = await page.evaluate(() => Appli.etat());
  verifier(e.reglages.sons === false && e.reglages.vibrations === false, 'sons et vibrations coupés : ' + JSON.stringify(e.reglages));
  await page.reload(); await pause(page);
  await page.click('.onglet[data-aller="reglages"]');
  verifier(!(await page.isChecked('#reglage-sons')) && !(await page.isChecked('#reglage-vibrations')), 'réglages gardés après redémarrage');
  await page.screenshot({ path: 'tests/captures/etape8-reglages.png', fullPage: true });

  // Sauvegardes : la copie de la semaine existe déjà (faite au démarrage) ; on note une tâche puis on restaure
  await page.click('.ligne[data-aller="sauvegardes"]');
  await page.waitForSelector('[data-restaurer]');
  verifier((await page.textContent('#liste-sauvegardes')).includes('Semaine du 16 novembre 2026'), 'copie hebdomadaire listée');
  await page.evaluate(() => Appli.modifier(x => { x.joueur.niveau = 4; }));
  await page.click('[data-restaurer^="hebdo-"]');
  await page.waitForSelector('#dialogue[open]');
  verifier((await page.textContent('#dialogue')).includes('Niveau 1') && (await page.textContent('#dialogue')).includes('Niveau 4'), 'aperçu copie / actuel');
  await page.click('#dialogue-boutons .principal');
  await page.waitForTimeout(400);
  e = await page.evaluate(() => Appli.etat());
  verifier(e.joueur.niveau === 1, 'copie restaurée (niveau 1)');
  verifier(await page.locator('[data-restaurer^="avant-"]').count() === 1, 'copie de sécurité « avant restauration » créée');
  verifier((await page.textContent('#liste-sauvegardes')).includes('avant une restauration'), 'raison affichée');
  // … et on peut revenir en arrière
  await page.click('[data-restaurer^="avant-"]');
  await page.click('#dialogue-boutons .principal');
  await page.waitForTimeout(400);
  verifier(await page.evaluate(() => Appli.etat().joueur.niveau) === 4, 'retour à l\'état d\'avant la restauration');
  await page.screenshot({ path: 'tests/captures/etape8-sauvegardes.png', fullPage: true });

  // Rappel d'export : 1re saisie il y a 20 jours, jamais exporté → carte sur Aujourd'hui ; ✕ la cache ; un tap = export
  await page.evaluate(() => Appli.modifier(x => { x.journal.push({ id: 'vieux', tacheId: 'aucune', horodatage: '2026-10-27T09:00:00.000Z', jour: '2026-10-27', valeur: null, progression: 1, gains: { xp: 0, ressource: null, quantite: 0 } }); }));
  await page.click('.onglet[data-aller="aujourdhui"]');
  verifier(await page.isVisible('#rappel-export'), 'carte « Petite sauvegarde de ton village ? »');
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'tests/captures/etape8-rappel.png' });
  await page.click('#btn-rappel-plus-tard');
  verifier(await page.isHidden('#rappel-export'), '✕ : carte cachée');
  await page.reload(); await pause(page);
  verifier(await page.isVisible('#rappel-export'), 'carte revenue à la réouverture');
  const [telechargement] = await Promise.all([page.waitForEvent('download'), page.click('#btn-rappel-export')]);
  verifier(/^hameau_\d{4}-\d{2}-\d{2}\.json$/.test(telechargement.suggestedFilename()), 'un tap = export');
  await pause(page);
  verifier(await page.isHidden('#rappel-export'), 'carte disparue après l\'export');

  // Mises à jour : réponse de GitHub simulée (aucun vrai appel réseau dans les tests)
  let reponseGithub = { status: 200, body: JSON.stringify({ tag_name: 'v9.0.0-build.99', html_url: 'https://github.com/gauthierdoumont/hammeau/releases/tag/v9.0.0-build.99' }) };
  await ctx.route('https://api.github.com/**', route => route.fulfill({ ...reponseGithub, contentType: 'application/json' }));
  await page.click('.onglet[data-aller="reglages"]');
  await page.click('#btn-mises-a-jour');
  await page.waitForSelector('#dialogue[open]');
  verifier((await page.textContent('#dialogue-titre')).includes('9.0.0'), 'nouvelle version proposée');
  await page.click('#dialogue-boutons .bouton:not(.principal)');
  reponseGithub = { status: 200, body: JSON.stringify({ tag_name: 'v0.0.1-build.1', html_url: 'https://github.com/x' }) };
  await page.click('#btn-mises-a-jour');
  await page.waitForTimeout(300);
  verifier((await page.textContent('#toast-texte')).includes('dernière version'), 'déjà à jour');
  await ctx.unroute('https://api.github.com/**');            // retour au « hors ligne » : message neutre
  await page.click('#btn-mises-a-jour');
  await page.waitForSelector('#dialogue[open]');
  verifier((await page.textContent('#dialogue-titre')) === 'Pas de connexion', 'hors ligne : message clair');
  await page.click('#dialogue-boutons .principal');
  const texteReglages = await page.textContent('#ecran-reglages') + await page.textContent('#ecran-sauvegardes');
  verifier(!/\b(raté|échec|seulement|oublié|paresse|tu dois)\b/i.test(texteReglages), 'aucun mot culpabilisant');
  verifier(!(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)), 'Réglages : pas de défilement horizontal');
  verifier(externes.every(u => u.startsWith('https://api.github.com/')), 'seule adresse extérieure : GitHub, au toucher du bouton : ' + externes);
  verifier(!erreurs.filter(x => !/ERR_FAILED|Failed to load resource/.test(x)).length, 'erreurs console (étape 8) : ' + erreurs);
  await ctx.close();
}

/* 13. Étape 14 : rappels. Le plugin Android est simulé (faux « Capacitor ») : explication avant la permission,
 * programmation recalculée à chaque changement, interrupteurs, test. Horloge réelle (le faux natif ignore debug_maintenant). */
{
  // 1. Un état réel avec une quotidienne et une échéance (créé dans un navigateur normal)
  const ctx0 = await nav.newContext({ viewport: { width: 412, height: 800 } });
  const p0 = await ctx0.newPage();
  await p0.goto(URL_APPLI); await pause(p0);
  await p0.evaluate(() => Appli.modifier(e => {
    Taches.ajouterTache(e, Taches.creerTache({ nom: 'Lire', categorieId: 'lecture', type: 'quotidienne' }, e, CONFIG, 'q1', new Date(Date.now() - 86400000).toISOString()).tache);
  }));
  const etatDepart = await lire(p0);
  await ctx0.close();

  // 2. Même état, avec le plugin de notifications simulé
  const ctx = await nav.newContext({ viewport: { width: 360, height: 800 }, colorScheme: 'dark', locale: 'fr-BE' });
  await ctx.addInitScript(([cle, val]) => {
    if (!sessionStorage.getItem('init')) { localStorage.setItem(cle, val); sessionStorage.setItem('init', '1'); }
    Math.random = () => 0.999;   // le faux « natif » ignore debug_hasard : pas de coffre ni de surprise au hasard (test stable)
    const r = window.__rappels = { permission: 'prompt', programmes: [], demandes: 0 };
    window.Capacitor = { isNativePlatform: () => true, Plugins: { LocalNotifications: {
      checkPermissions: async () => ({ display: r.permission }),
      requestPermissions: async () => { r.demandes++; r.permission = 'granted'; return { display: 'granted' }; },
      getPending: async () => ({ notifications: r.programmes.map(n => ({ id: n.id })) }),
      cancel: async ({ notifications }) => { const ids = notifications.map(n => n.id); r.programmes = r.programmes.filter(n => !ids.includes(n.id)); },
      schedule: async ({ notifications }) => { r.programmes.push(...notifications); },
      addListener: () => ({ remove() {} })
    } } };
  }, [CLE, etatDepart]);
  const page = await ctx.newPage();
  const erreurs = [];
  page.on('pageerror', e => erreurs.push(e.message));
  page.on('console', m => m.type() === 'error' && erreurs.push(m.text()));
  await page.goto(URL_APPLI);
  // Explication AVANT la demande d'Android (un éventuel message de retour passe d'abord)
  await page.waitForSelector('#dialogue[open]');
  if (!(await page.textContent('#dialogue-titre')).includes('rappels')) { await page.click('#dialogue-boutons .principal'); await page.waitForSelector('#dialogue[open]'); }
  verifier((await page.textContent('#dialogue-titre')).includes('Des petits rappels'), 'explication avant la permission');
  verifier(await page.evaluate(() => __rappels.demandes) === 0, 'aucune demande Android avant le « oui »');
  await page.click('#dialogue-boutons .principal');
  await page.waitForTimeout(2200);
  let r = await page.evaluate(() => ({ ...__rappels, programmes: __rappels.programmes.map(n => ({ id: n.id, at: n.schedule.at.getTime(), icone: n.smallIcon, exacte: n.isExactNotification, texte: n.title + ' ' + n.body })) }));
  verifier(r.demandes === 1 && r.programmes.length >= 6, 'rappels programmés après le oui : ' + r.programmes.length);
  verifier(r.programmes.every(n => n.at > Date.now() && n.icone === 'ic_stat_hameau'), 'jamais dans le passé, petite icône');
  verifier(new Set(r.programmes.map(n => n.id)).size === r.programmes.length, 'IDs uniques (reprogrammation sans doublon)');
  verifier(r.programmes.every(n => n.exacte === false), 'rappels inexacts (pas d\'écran « Alarmes et rappels » sur Android 14+)');
  verifier(r.programmes.every(n => !/\b(raté|échec|seulement|oublié|paresse|tu dois)\b/i.test(n.texte)), 'textes positifs');
  // Cocher la quotidienne → le rappel de ce soir disparaît (recalculé)
  await page.evaluate(() => { const t = Appli.etat().taches[0]; document.querySelector(`[data-cocher="${t.id}"]`)?.click(); });
  await page.waitForTimeout(2200);
  r = await page.evaluate(() => __rappels.programmes.map(n => ({ id: n.id, jour: n.schedule.at.toDateString() })));
  verifier(!r.some(n => n.id === 100), 'quotidienne cochée : pas de rappel ce soir');
  // Réglages : couper le soir, changer l'heure du matin, tester
  await page.click('.onglet[data-aller="reglages"]');
  verifier(await page.isChecked('#notif-matin-actif') && await page.isChecked('#notif-soir-actif'), 'rappels matin et soir actifs');
  await page.click('#notif-soir-actif');
  await page.fill('#notif-matin', '07:15');
  await page.dispatchEvent('#notif-matin', 'change');
  await page.waitForTimeout(2200);
  const e = await page.evaluate(() => Appli.etat().reglages);
  verifier(e.notifSoir === '' && e.notifMatin === '07:15', 'réglages des rappels : ' + JSON.stringify([e.notifMatin, e.notifSoir]));
  r = await page.evaluate(() => __rappels.programmes.map(n => ({ id: n.id, h: n.schedule.at.toLocaleTimeString('fr-BE', { timeZone: 'Europe/Brussels', hour: '2-digit', minute: '2-digit' }) })));
  verifier(r.every(n => n.id < 100 && n.h === '07:15'), 'seulement le matin, à 07:15 : ' + JSON.stringify(r.slice(0, 3)));
  verifier(await page.isDisabled('#notif-soir'), 'heure du soir grisée quand le rappel est coupé');
  await page.click('#btn-tester-notif');
  await page.waitForTimeout(300);
  verifier(await page.evaluate(() => __rappels.programmes.some(n => n.id === 9999 && n.isExactNotification === false)), 'rappel de test programmé (inexact)');
  await page.screenshot({ path: 'tests/captures/etape14-rappels.png', fullPage: true });
  verifier(!(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)), 'rappels à 360 px : pas de défilement horizontal');
  // Relancer l'appli : plus de proposition (déjà acceptée)
  await page.reload(); await page.waitForTimeout(1000);
  verifier(!(await page.isVisible('#dialogue[open]')) || !(await page.textContent('#dialogue-titre')).includes('rappels'), 'pas de nouvelle proposition après le oui');
  verifier(!erreurs.length, 'erreurs console (rappels) : ' + erreurs);
  await ctx.close();
}

/* 14. Étape 15a : agenda iCal (fichier d'exemple FICTIF injecté par « debug_ics » : le navigateur bloque l'accès réel) */
{
  const { ctx, page, erreurs, externes } = await nouvellePage(412);
  const SECRET = 'https://agenda.exemple.invalid/adresse-secrete-fictive/basic.ics';
  const consoleTout = [];
  page.on('console', m => consoleTout.push(m.text()));
  await page.evaluate(ics => localStorage.setItem('debug_ics', ics), fs.readFileSync('tests/exemple.ics', 'utf8'));
  await page.click('.onglet[data-aller="reglages"]');
  verifier((await page.textContent('#info-agenda')) === 'Pas encore relié', 'agenda pas encore relié');
  await page.click('.ligne[data-aller="agenda"]');
  verifier(await page.isHidden('#agenda-relie'), 'rien à actualiser avant de relier');
  await page.fill('#agenda-adresse', 'mon agenda');
  await page.click('#btn-agenda-enregistrer');
  verifier((await page.textContent('#agenda-erreur')).includes('https://'), 'adresse invalide : explication');
  await page.fill('#agenda-adresse', SECRET.replace('https://', 'webcal://'));
  await page.click('#btn-agenda-enregistrer');
  await page.waitForTimeout(400);
  let e = await page.evaluate(() => Appli.etat().reglages);
  verifier(e.icsUrl === SECRET, 'adresse enregistrée (webcal → https)');
  verifier(e.calendrierCache?.evenements.length >= 4 && e.calendrierCache.chargeLe, 'événements gardés en cache : ' + e.calendrierCache?.evenements.length);
  verifier((await page.inputValue('#agenda-adresse')) === '', 'adresse jamais réaffichée');
  const apercu = await page.textContent('#agenda-apercu');
  verifier(apercu.includes("Aujourd'hui") && apercu.includes('08:30') && apercu.includes('Cours de comptabilité'), 'cours du jour dans l\'aperçu');
  verifier(apercu.includes('Interrogation Consolidation') && apercu.includes('🎯 examen') && !apercu.includes('Réunion annulée'), 'examen repéré, annulé ignoré');
  verifier((await page.textContent('#agenda-etat')).startsWith('Mis à jour à'), 'état : mis à jour');
  await page.screenshot({ path: 'tests/captures/etape15a-agenda.png', fullPage: true });
  // Marquer depuis l'aperçu : le cours de ce matin devient un examen (donc un boss), puis retour au titre
  await page.locator('#agenda-apercu [data-examen-cle]', { hasText: 'Cours de comptabilité' }).first().click();
  await page.click('#dialogue-boutons .principal');
  await page.waitForTimeout(300);
  verifier((await page.locator('#agenda-apercu .agenda-ev', { hasText: 'Cours de comptabilité' }).first().textContent()).includes('🎯 examen'), 'aperçu : marqué examen');
  verifier(Object.values((await page.evaluate(() => Appli.etat())).agenda.examens).includes(true), 'aperçu : marquage enregistré');
  verifier((await page.textContent('#liste-boss')).includes('Cours de comptabilité'), 'aperçu : l\'événement marqué devient un boss');
  await page.locator('#agenda-apercu [data-examen-cle]', { hasText: 'Cours de comptabilité' }).first().click();
  await page.click('#dialogue-boutons .bouton:first-child');
  await page.waitForTimeout(300);
  verifier(!Object.keys((await page.evaluate(() => Appli.etat())).agenda.examens).length && !(await page.textContent('#liste-boss')).includes('Cours de comptabilité'), 'aperçu : retour au titre');
  // Export : jamais l'adresse
  await page.click('.onglet[data-aller="reglages"]');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#btn-exporter')]);
  const exporte = fs.readFileSync(await dl.path(), 'utf8');
  verifier(!exporte.includes('adresse-secrete-fictive') && exporte.includes('Interrogation Consolidation'), 'export : cache oui, adresse jamais');
  // Hors ligne : la version gardée reste, avec un message neutre
  await page.evaluate(() => localStorage.removeItem('debug_ics'));
  await page.click('.ligne[data-aller="agenda"]');
  await page.click('#btn-agenda-actualiser');
  await page.waitForTimeout(300);
  verifier((await page.textContent('#agenda-etat')).startsWith('Hors ligne — version gardée'), 'hors ligne : version gardée');
  verifier((await page.textContent('#agenda-apercu')).includes('Cours de comptabilité'), 'hors ligne : cours toujours affichés');
  // Retirer
  await page.click('#btn-agenda-retirer');
  await page.click('#dialogue-boutons .principal');
  await page.waitForTimeout(300);
  e = await page.evaluate(() => Appli.etat().reglages);
  verifier(e.icsUrl === '' && e.calendrierCache === null, 'agenda retiré');
  verifier(!consoleTout.some(t => t.includes('adresse-secrete-fictive')) && !(await lire(page)).includes('debug') , 'adresse absente des journaux');
  verifier(!(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)), 'Agenda : pas de défilement horizontal');
  verifier(!externes.length, 'ressources externes (agenda) : ' + externes);
  verifier(!erreurs.filter(x => !/^Agenda :/.test(x)).length, 'erreurs console (agenda) : ' + erreurs);
  await ctx.close();
}

/* 14b. Agenda : « Retirer » ou « Changer d'adresse » PENDANT un téléchargement → le résultat périmé n'est jamais écrit */
{
  const { ctx, page, erreurs, externes } = await nouvellePage(412);
  const A = 'https://agenda.exemple.invalid/adresse-a/basic.ics', B = 'https://agenda.exemple.invalid/adresse-b/basic.ics';
  // Téléchargements retenus jusqu'à ce que le test les libère ; l'adresse B donne un agenda reconnaissable (« Cours B »)
  await page.evaluate(ics => {
    window.attente = [];
    window.telechargerAgenda = (adresse) => new Promise(ok => window.attente.push(() => ok(adresse.includes('adresse-b') ? ics.replace(/Cours de comptabilité/g, 'Cours B') : ics)));
  }, fs.readFileSync('tests/exemple.ics', 'utf8'));
  const liberer = async (i = 0) => { await page.evaluate(n => window.attente.splice(n, 1)[0](), i); await page.waitForTimeout(250); };
  const relier = async (adresse) => { await page.fill('#agenda-adresse', adresse); await page.click('#btn-agenda-enregistrer'); await page.waitForTimeout(100); };
  const retirer = async () => { await page.click('#btn-agenda-retirer'); await page.click('#dialogue-boutons .principal'); await page.waitForTimeout(200); };
  const reglages = () => page.evaluate(() => Appli.etat().reglages);
  const titres = (r) => (r.calendrierCache?.evenements || []).map(e => e.titre).join(' | ');
  await page.click('.onglet[data-aller="reglages"]');
  await page.click('.ligne[data-aller="agenda"]');
  await relier(A); await liberer();
  verifier((await reglages()).icsUrl === A, 'adresse A reliée');
  // 1. Retirer pendant « Changer d'adresse » (B)
  await relier(B); await retirer(); await liberer();
  let r = await reglages();
  verifier(r.icsUrl === '' && r.calendrierCache === null, 'Retirer pendant Relier : rien de relié : ' + r.icsUrl);
  verifier((await page.textContent('#toast-texte')) === 'Agenda retiré', 'Retirer pendant Relier : pas de toast « relié »');
  // 2. Retirer pendant « Actualiser »
  await relier(A); await liberer();
  await page.click('#btn-agenda-actualiser'); await page.waitForTimeout(100);
  await retirer(); await liberer();
  r = await reglages();
  verifier(r.icsUrl === '' && r.calendrierCache === null, 'Retirer pendant Actualiser : rien d\'écrit');
  verifier((await page.textContent('#toast-texte')) === 'Agenda retiré', 'Retirer pendant Actualiser : pas de toast « à jour »');
  // 3. Changer d'adresse pendant « Actualiser » : B arrive d'abord, puis l'ancien téléchargement (A) est jeté
  await relier(A); await liberer();
  await page.click('#btn-agenda-actualiser'); await page.waitForTimeout(100);
  await relier(B);
  await liberer(1);
  r = await reglages();
  verifier(r.icsUrl === B && titres(r).includes('Cours B'), 'adresse B reliée pendant l\'actualisation de A');
  await liberer(0);
  r = await reglages();
  verifier(r.icsUrl === B && titres(r).includes('Cours B') && !titres(r).includes('Cours de comptabilité'), 'Changer d\'adresse pendant Actualiser : agenda B gardé : ' + titres(r));
  verifier((await page.textContent('#toast-texte')).includes('relié'), 'pas de toast « à jour » pour l\'ancienne adresse');
  verifier(!externes.length, 'ressources externes (agenda, courses) : ' + externes);
  verifier(!erreurs.length, 'erreurs console (agenda, courses) : ' + erreurs);
  await ctx.close();
}

/* 15. Étape 15b : Cours du jour sur Aujourd'hui, « J'y étais » (une fois), examen marqué à la main (agenda FICTIF) */
{
  const { ctx, page, erreurs, externes } = await nouvellePage(412);
  await page.evaluate(ics => localStorage.setItem('debug_ics', ics), fs.readFileSync('tests/exemple.ics', 'utf8'));
  verifier(await page.isHidden('#cours-jour'), 'pas d\'agenda : pas de section Cours');
  await page.click('.onglet[data-aller="reglages"]');
  await page.click('.ligne[data-aller="agenda"]');
  await page.fill('#agenda-adresse', 'https://agenda.exemple.invalid/adresse-fictive/basic.ics');
  await page.click('#btn-agenda-enregistrer');
  await page.waitForTimeout(300);
  await page.click('.onglet[data-aller="aujourdhui"]');
  await pause(page);
  verifier(await page.isVisible('#cours-jour'), 'section « Cours du jour » visible');
  const texte = await page.textContent('#liste-cours');
  verifier(texte.includes('08:30') && texte.includes('Cours de comptabilité') && texte.includes('Local 204'), 'cours du lundi affiché : ' + texte);
  // Il est 10 h : le cours de 8 h 30 a commencé → « J'y étais »
  const savoirAvant = await page.evaluate(() => Appli.etat().joueur.ressources.savoir);
  await page.click('[data-jy-etais]');
  await page.waitForTimeout(500);
  let e = await page.evaluate(() => Appli.etat());
  verifier(e.joueur.ressources.savoir - savoirAvant === 25 && e.journal.some(s => s.cours && s.tacheId === null), 'présence : +25 📜 : ' + (e.joueur.ressources.savoir - savoirAvant));
  verifier((await page.textContent('#liste-cours')).includes('✅ Noté') && await page.locator('[data-jy-etais]').count() === 0, 'une seule fois par occurrence');
  await page.screenshot({ path: 'tests/captures/etape15b-cours.png' });
  await page.reload(); await pause(page);
  verifier((await page.textContent('#liste-cours')).includes('✅ Noté'), 'présence gardée après redémarrage');
  // Marquer à la main : examen, puis retour au titre
  await page.click('[data-examen-cle]');
  await page.click('#dialogue-boutons .principal');
  await page.waitForTimeout(300);
  verifier(await page.locator('.cours.examen').count() === 1 && (await page.textContent('#liste-cours')).includes('🎯 examen'), 'marqué examen à la main');
  e = await page.evaluate(() => Appli.etat());
  verifier(Object.values(e.agenda.examens).includes(true), 'marquage enregistré');
  await page.click('[data-examen-cle]');
  await page.click('#dialogue-boutons .bouton:first-child');
  await page.waitForTimeout(300);
  verifier(await page.locator('.cours.examen').count() === 0 && !Object.keys((await page.evaluate(() => Appli.etat())).agenda.examens).length, 'retour au titre');
  verifier((await page.textContent('#perso-historique').catch(() => '')) !== null, 'perso accessible');
  verifier(!(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)), 'Cours du jour : pas de défilement horizontal');
  verifier(!externes.length, 'ressources externes (cours) : ' + externes);
  verifier(!erreurs.length, 'erreurs console (cours) : ' + erreurs);
  await ctx.close();
}

/* 16. Étape 16 : surprises du jour (marchand, tempête = défi, fête) — toujours un bonus */
{
  const { ctx, page, erreurs, externes } = await nouvellePage(412);
  verifier(await page.isHidden('#surprise'), 'hasard « jamais » : pas de surprise');
  verifier(await page.evaluate(() => Appli.etat().etat.surprise?.jour === '2026-11-16'), 'tirage du jour fait (une fois)');
  // Tirage réel avec le hasard forcé : pas de ressources → pas de marchand → tempête
  await page.evaluate(() => { localStorage.setItem('debug_hasard', 'toujours'); Appli.modifier(e => { e.etat.surprise = null; }); tirerSurprise(); });
  verifier(await page.evaluate(() => Appli.etat().etat.surprise.type) === 'tempete', 'tirage réel : tempête');
  await page.evaluate(() => localStorage.setItem('debug_hasard', 'jamais'));
  // Tempête : 3 tâches terminées → récompense
  await page.evaluate(() => Appli.modifier(e => {
    for (const id of ['t1', 't2', 't3']) Taches.ajouterTache(e, Taches.creerTache({ nom: 'Défi ' + id, categorieId: 'menage' }, e, CONFIG, id, '2026-11-15T08:00:00.000Z').tache);
  }));
  verifier((await page.textContent('#surprise')).includes('0 / 3'), 'tempête : 0 / 3');
  const boisAvant = await page.evaluate(() => Appli.etat().joueur.ressources.bois);
  for (const id of ['t1', 't2', 't3']) { await page.click(`[data-cocher="${id}"]`); await page.waitForTimeout(250); }
  let e = await page.evaluate(() => Appli.etat());
  verifier(e.etat.surprise.fini === 'releve', 'tempête : défi relevé');
  verifier((await page.textContent('#toast-texte')).includes('Tempête passée'), 'message de victoire : ' + await page.textContent('#toast-texte'));
  verifier((await page.textContent('#surprise')).includes('Le hameau a tenu bon'), 'carte : le hameau a tenu bon');
  verifier(e.joueur.ressources.bois > boisAvant + 30, 'récompense de bois reçue');
  // Marchand : échange avantageux
  await page.evaluate(() => Appli.modifier(x => { x.joueur.ressources.bois = 100; x.joueur.ressources.savoir = 0; x.etat.surprise = { jour: '2026-11-16', type: 'marchand', donne: 'bois', recoit: 'savoir', quantiteDonnee: 30, quantiteRecue: 45 }; }));
  verifier((await page.textContent('#surprise-detail')).includes('45 📜') && await page.isVisible('#btn-surprise-oui'), 'offre du marchand');
  await page.screenshot({ path: 'tests/captures/etape16-marchand.png' });
  await page.click('#btn-surprise-oui');
  await page.waitForTimeout(250);
  e = await page.evaluate(() => Appli.etat());
  verifier(e.joueur.ressources.bois === 70 && e.joueur.ressources.savoir === 45, 'échange fait : ' + e.joueur.ressources.bois + ' / ' + e.joueur.ressources.savoir);
  verifier((await page.textContent('#surprise')).includes('Bonne affaire') && await page.isHidden('#surprise-boutons'), 'marchand reparti');
  // « Non merci » : carte cachée, rien ne change
  await page.evaluate(() => Appli.modifier(x => { x.etat.surprise = { jour: '2026-11-16', type: 'marchand', donne: 'bois', recoit: 'or', quantiteDonnee: 30, quantiteRecue: 45 }; }));
  await page.click('#btn-surprise-non');
  await page.waitForTimeout(200);
  verifier(await page.isHidden('#surprise') && (await page.evaluate(() => Appli.etat().joueur.ressources.bois)) === 70, 'non merci : rien ne change');
  // Fête : +20 % pour la famille
  await page.evaluate(() => Appli.modifier(x => { x.etat.surprise = { jour: '2026-11-16', type: 'fete', famille: 'discipline', bonus: 0.2 }; }));
  verifier((await page.textContent('#surprise-detail')).includes('+20 %') && (await page.textContent('#surprise-detail')).includes('Discipline'), 'jour de fête annoncé');
  const texteSurprise = await page.textContent('#surprise');
  verifier(!/\b(raté|échec|seulement|oublié|paresse|tu dois|perdu|perte)\b/i.test(texteSurprise), 'aucun mot négatif');
  verifier(!(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)), 'surprise : pas de défilement horizontal');
  verifier(!externes.length, 'ressources externes (surprises) : ' + externes);
  verifier(!erreurs.length, 'erreurs console (surprises) : ' + erreurs);
  await ctx.close();
}

/* 17. Étape 17 : examens = boss (agenda FICTIF : interro le vendredi 20/11) */
{
  const { ctx, page, erreurs, externes } = await nouvellePage(412);
  await page.evaluate(ics => localStorage.setItem('debug_ics', ics), fs.readFileSync('tests/exemple.ics', 'utf8'));
  verifier(await page.isHidden('#boss-zone'), 'sans agenda : pas de boss');
  await page.click('.onglet[data-aller="reglages"]');
  await page.click('.ligne[data-aller="agenda"]');
  await page.fill('#agenda-adresse', 'https://agenda.exemple.invalid/adresse-fictive/basic.ics');
  await page.click('#btn-agenda-enregistrer');
  await page.waitForTimeout(300);
  await page.click('.onglet[data-aller="aujourdhui"]');
  await pause(page);
  let texte = await page.textContent('#liste-boss');
  verifier(texte.includes('Interrogation Consolidation') && texte.includes('dans 4 jours') && texte.includes('200 / 200 PV'), 'boss affiché : ' + texte);
  // Toucher le titre du boss → « Pas un examen » : il disparaît ; on le remet depuis l'aperçu de l'agenda
  await page.click('#liste-boss [data-examen-cle]');
  verifier((await page.textContent('#dialogue')).includes('Est-ce un examen'), 'titre du boss : « Est-ce un examen ? »');
  await page.click('#dialogue-boutons .bouton:nth-child(2)');
  await page.waitForTimeout(300);
  verifier(await page.isHidden('#boss-zone'), 'faux boss retiré depuis sa carte');
  await page.click('.onglet[data-aller="reglages"]');
  await page.click('.ligne[data-aller="agenda"]');
  await page.locator('#agenda-apercu [data-examen-cle]', { hasText: 'Interrogation Consolidation' }).click();
  await page.click('#dialogue-boutons .bouton:first-child');
  await page.waitForTimeout(300);
  await page.click('.onglet[data-aller="aujourdhui"]');
  await pause(page);
  verifier((await page.textContent('#liste-boss')).includes('Interrogation Consolidation'), 'boss revenu (selon le titre)');
  // Une révision 📚 fait des dégâts
  await page.evaluate(() => Appli.modifier(e => { Taches.ajouterTache(e, Taches.creerTache({ nom: 'Réviser la conso', categorieId: 'revision' }, e, CONFIG, 'rev1', '2026-11-15T08:00:00.000Z').tache); }));
  await page.click('[data-cocher="rev1"]');
  await page.waitForTimeout(300);
  verifier((await page.textContent('#toast-texte')).includes('dégâts à « Interrogation Consolidation »'), 'message de dégâts : ' + await page.textContent('#toast-texte'));
  texte = await page.textContent('#liste-boss');
  verifier(/1\d\d \/ 200 PV/.test(texte), 'PV en baisse : ' + texte);
  await page.screenshot({ path: 'tests/captures/etape17-boss.png' });
  // Annuler rend les PV (rien n'est stocké pour les dégâts)
  await page.click('#toast-action');
  await page.waitForTimeout(200);
  verifier((await page.textContent('#liste-boss')).includes('200 / 200 PV'), 'Annuler : PV rendus');
  // Le jour J, après le début : récompense (une part, puisque le boss n'est pas vaincu)
  await page.evaluate(() => { localStorage.setItem('debug_maintenant', '2026-11-20T11:00:00+01:00'); rendre(); });
  verifier((await page.textContent('#liste-boss')).includes('Jour J'), 'jour J');
  const gemmes = await page.evaluate(() => Appli.etat().joueur.ressources.gemmes);
  await page.click('[data-recompense-boss]');
  await page.waitForTimeout(300);
  const e = await page.evaluate(() => Appli.etat());
  verifier(e.joueur.ressources.gemmes > gemmes && Object.keys(e.agenda.recompenses).length === 1, 'récompense reçue');
  verifier((await page.textContent('#toast-texte')).includes('Bien joué pour l\'examen'), 'message positif');
  verifier(await page.isHidden('#boss-zone'), 'boss rangé après la récompense');
  verifier(!(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)), 'boss : pas de défilement horizontal');
  verifier(!externes.length, 'ressources externes (boss) : ' + externes);
  verifier(!erreurs.length, 'erreurs console (boss) : ' + erreurs);
  await ctx.close();
}

/* 18. Étape 18 : bilan de la semaine (graphiques SVG locaux) + carte du lundi */
{
  const { ctx, page, erreurs, externes } = await nouvellePage(360);
  verifier(await page.isHidden('#carte-bilan'), 'lundi sans rien la semaine d\'avant : pas de carte');
  // Semaine dernière (9-15/11) : 3 tâches sur 2 jours ; cette semaine : 1 tâche
  await page.evaluate(() => Appli.modifier(e => {
    const faire = (id, jour, categorieId, taille) => {
      Taches.ajouterTache(e, Taches.creerTache({ nom: 'Bilan ' + id, categorieId, taille }, e, CONFIG, id, '2026-11-01T08:00:00.000Z').tache);
      Moteur.saisir(e, id, null, { id: 's' + id, horodatage: jour + 'T10:00:00.000Z', jour }, CONFIG);
    };
    faire('b1', '2026-11-10', 'lecture', 'grosse'); faire('b2', '2026-11-12', 'muscu', 'moyenne'); faire('b3', '2026-11-12', 'menage', 'petite');
    faire('b4', '2026-11-16', 'lecture', 'moyenne');
  }));
  verifier(await page.isVisible('#carte-bilan') && (await page.textContent('#carte-bilan')).includes('XP la semaine dernière'), 'lundi : carte « bilan prêt »');
  await page.click('#btn-carte-bilan');
  await pause(page);
  verifier((await page.textContent('#titre')) === 'Bilan', 'écran Bilan');
  verifier((await page.textContent('#bilan-dates')).includes('9 novembre') && (await page.textContent('#bilan-dates')).includes('15 novembre'), 'semaine dernière : ' + await page.textContent('#bilan-dates'));
  verifier((await page.textContent('#bilan-tuiles')).includes('3') && (await page.textContent('#bilan-tuiles')).includes('2/7'), 'tuiles : 3 tâches, 2 jours actifs');
  verifier(await page.locator('#bilan-jours svg .barre').count() === 2, '2 barres (2 jours actifs)');
  verifier(await page.locator('.bilan-famille').count() === 3 && (await page.textContent('#bilan-familles')).includes('Esprit'), '3 familles étiquetées');
  await page.click('#bilan-jours [data-jour="2026-11-12"]');
  verifier((await page.textContent('#bilan-info')).startsWith('Jeudi 12') && (await page.textContent('#bilan-info')).includes('2 tâches'), 'toucher un jour : détail : ' + await page.textContent('#bilan-info'));
  await page.screenshot({ path: 'tests/captures/etape18-bilan.png', fullPage: true });
  await page.click('[data-semaine="0"]');
  verifier((await page.textContent('#bilan-tuiles')).includes('1/7'), 'cette semaine : 1 jour actif');
  await page.click('.bilan-tableau summary');
  verifier(await page.locator('#bilan-table tbody tr').count() === 7, 'tableau : 7 jours');
  verifier(!/\b(raté|échec|seulement|oublié|paresse|tu dois)\b/i.test(await page.textContent('#ecran-bilan')), 'aucun mot culpabilisant');
  verifier(!(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)), 'Bilan à 360 px : pas de défilement horizontal');
  await page.evaluate(() => retourEcranPrecedent());
  verifier((await page.textContent('#titre')) === "Aujourd'hui", 'retour : Aujourd\'hui');
  await page.click('#btn-carte-bilan-fermer');
  verifier(await page.isHidden('#carte-bilan'), '✕ : carte cachée');
  verifier(!externes.length, 'ressources externes (bilan) : ' + externes);
  verifier(!erreurs.length, 'erreurs console (bilan) : ' + erreurs);
  await ctx.close();
}

/* 19. Étape 19 : import des séances de l'appli Muscu (export FICTIF) */
{
  const { ctx, page, erreurs, externes } = await nouvellePage(412);
  await page.click('.onglet[data-aller="reglages"]');
  const [choix] = await Promise.all([page.waitForEvent('filechooser'), page.click('#btn-importer-muscu')]);
  await choix.setFiles('tests/fixtures/muscu-export.json');
  await page.waitForSelector('#dialogue[open]');
  verifier((await page.textContent('#dialogue-titre')).includes('4 séances à compter'), 'aperçu : 4 séances : ' + await page.textContent('#dialogue-titre'));
  verifier((await page.textContent('#dialogue-texte')).includes('🪨') && (await page.textContent('#dialogue-texte')).includes('14 jours'), 'aperçu : gains et séances anciennes expliquées');
  await page.click('#dialogue-boutons .principal');
  await page.waitForTimeout(500);
  let e = await page.evaluate(() => Appli.etat());
  verifier(e.journal.filter(s => s.muscu).length === 4 && e.joueur.ressources.pierre > 0, 'séances comptées, 🪨 gagnée');
  verifier((await page.textContent('#toast-texte')).includes('4 séances comptées'), 'message de réussite');
  verifier(await page.evaluate(() => Object.keys(localStorage).some(k => k.includes('import-muscu'))), 'copie de sécurité avant l\'import');
  // Annuler, puis ré-importer : rien de compté deux fois
  await page.click('#toast-action');
  await page.waitForTimeout(200);
  verifier((await page.evaluate(() => Appli.etat().journal.filter(s => s.muscu).length)) === 0, 'Annuler : import retiré');
  await page.evaluate(() => { document.getElementById('fichier-muscu').value = ''; });   // comme le bouton le fait
  await page.setInputFiles('#fichier-muscu', 'tests/fixtures/muscu-export.json');   // (le bouton peut être sous un message : on passe par le champ)
  await page.waitForSelector('#dialogue[open]');
  await page.click('#dialogue-boutons .principal');
  await page.waitForTimeout(400);
  await page.evaluate(() => { document.getElementById('fichier-muscu').value = ''; });   // comme le bouton le fait
  await page.setInputFiles('#fichier-muscu', 'tests/fixtures/muscu-export.json');   // (le bouton peut être sous un message : on passe par le champ)
  await page.waitForSelector('#dialogue[open]');
  verifier((await page.textContent('#dialogue-titre')).includes('Rien de nouveau'), 'ré-import : rien de nouveau');
  await page.click('#dialogue-boutons .principal');
  e = await page.evaluate(() => Appli.etat());
  verifier(e.journal.filter(s => s.muscu).length === 4, 'toujours 4 séances, jamais deux fois');
  // Mauvais fichier : refus clair
  await page.evaluate(() => { document.getElementById('fichier-muscu').value = ''; });   // comme le bouton le fait
  await page.setInputFiles('#fichier-muscu', 'tests/exemple.ics');   // (le bouton peut être sous un message : on passe par le champ)
  await page.waitForSelector('#dialogue[open]');
  verifier((await page.textContent('#dialogue-texte')).includes('appli Muscu'), 'fichier étranger refusé');
  await page.click('#dialogue-boutons .principal');
  verifier(!externes.length, 'ressources externes (muscu) : ' + externes);
  verifier(!erreurs.length, 'erreurs console (muscu) : ' + erreurs);
  await ctx.close();
}

await nav.close(); serveur.close();
console.log(echecs.length ? '✗ ' + echecs.join('\n✗ ') : '✓ parcours OK : navigation (360/412/1100 px, hors ligne), export, rechargement, import, récupération, ajout de tâches, catégories perso, cocher, village, construction, décorations, agrandir, réparer, coffre, fête, jours, prochaine action, perso, réglages, sauvegardes, rappel d\'export, mises à jour, rappels, agenda, cours du jour, surprises, boss, bilan, import muscu');
process.exit(echecs.length ? 1 : 0);
