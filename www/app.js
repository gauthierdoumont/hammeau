/* app.js — Hameau — logique de l'interface — Créé par Gauthier Doumont */
'use strict';

/* ===== CONFIG ===== */
const C = window.CONFIG;
const S = window.Stockage;
const T = window.Taches;
const CLE = S.CLE;
const NOMS_TYPES = { quotidienne: '🔁 Quotidiennes', imprevu: '⚡ Imprévus', bonus: '⭐ Bonus' };
const JOURS_COURTS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const JOURS_NOMS = ['lun', 'mar', 'mer', 'jeu', 'ven', 'sam', 'dim'];

/* ===== NATIF : Android via Capacitor, sinon navigateur (pour les tests) ===== */
const NATIF = window.Capacitor?.isNativePlatform?.() === true;
const PL = NATIF ? (window.Capacitor.Plugins || {}) : {};

/* ===== ÉTAT ===== */
let etat = null;                    // données du joueur (une fois chargées)
const historique = ['aujourdhui'];  // pile des écrans : le bouton retour Android la remonte
let saisie = null;                  // tâche en cours d'ajout (feuille d'ajout)
let origineCategorie = null;        // 'ajout' si la nouvelle catégorie est créée depuis la feuille d'ajout
let familleCategorie = null;        // famille choisie pour la nouvelle catégorie
let derniereAjoutee = null;         // id de la tâche à mettre en valeur

/* ===== HORLOGE =====
 * Dans le navigateur, localStorage « debug_maintenant » permet de simuler une date (tests).
 */
function maintenant() {
  if (!NATIF) { try { const d = localStorage.getItem('debug_maintenant'); if (d) return new Date(d); } catch {} }
  return new Date();
}
function jourCivil(instant) {        // AAAA-MM-JJ à Bruxelles
  return new Intl.DateTimeFormat('en-CA', { timeZone: C.jour.fuseau, year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(instant);
}
function horodatageFichier(instant) { // triable, sans « : » (interdit dans certains noms de fichiers)
  return instant.toISOString().slice(0, 19).replace(/:/g, '-');
}

/* ===== STOCKAGE =====
 * localStorage = copie de travail ; Preferences (Android) = copie de secours native.
 */
async function restaurer() {
  try {
    if (localStorage.getItem(CLE) !== null || !PL.Preferences) return;
    const { value } = await PL.Preferences.get({ key: CLE });
    if (value) localStorage.setItem(CLE, value);
  } catch (e) { console.error(e); }
}
function lireBrut() {
  try { return localStorage.getItem(CLE); } catch { return null; }
}
function sauver(e) {
  const txt = JSON.stringify(e);
  try { localStorage.setItem(CLE, txt); }
  catch (x) { message('Sauvegarde impossible', 'Le téléphone refuse d\'enregistrer (' + x.message + '). Fais un export par sécurité.'); return false; }
  PL.Preferences?.set({ key: CLE, value: txt }).catch(console.error);
  return true;
}

// Seule porte d'écriture : une erreur dans l'action ou la vérification → rien n'est sauvé
function modifier(action) {
  const copie = structuredClone(etat);
  try {
    action(copie);
    S.verifier(copie);
  } catch (x) {
    console.error(x);
    toast('Action annulée, rien n\'a été perdu.');
    return false;
  }
  etat = copie;
  sauver(etat);
  rendre();
  return true;
}

/* ===== SAUVEGARDES AUTOMATIQUES =====
 * Filet contre les bugs (pas contre une désinstallation : pour ça, il y a l'export).
 */
const PREFIXE_LS = CLE + '_sauvegarde_';

async function listerSauvegardes() {
  if (PL.Filesystem) {
    try {
      const { files } = await PL.Filesystem.readdir({ path: 'sauvegardes', directory: 'DATA' });
      return files.map(f => (typeof f === 'string' ? f : f.name).replace(/\.json$/, ''));
    } catch { return []; }   // dossier pas encore créé
  }
  const noms = [];
  try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.startsWith(PREFIXE_LS)) noms.push(k.slice(PREFIXE_LS.length)); } } catch {}
  return noms;
}
async function ecrireSauvegarde(nom, brut) {
  if (PL.Filesystem) {
    await PL.Filesystem.writeFile({ path: `sauvegardes/${nom}.json`, data: brut, directory: 'DATA', encoding: 'utf8', recursive: true });
  } else {
    localStorage.setItem(PREFIXE_LS + nom, brut);
  }
}
async function supprimerSauvegarde(nom) {
  if (PL.Filesystem) await PL.Filesystem.deleteFile({ path: `sauvegardes/${nom}.json`, directory: 'DATA' });
  else localStorage.removeItem(PREFIXE_LS + nom);
}
async function nettoyer(prefixe, garder) {
  for (const nom of S.aSupprimer(await listerSauvegardes(), prefixe, garder)) {
    await supprimerSauvegarde(nom).catch(console.error);
  }
}
// Copie avant une opération risquée (import, migration…). Ne bloque jamais l'appli.
async function sauvegardeAvant(raison, brut) {
  if (!brut) return;
  try {
    await ecrireSauvegarde(`avant-${horodatageFichier(maintenant())}-${raison}`, brut);
    await nettoyer('avant-', C.donnees.sauvegardesAvant);
  } catch (x) { console.error('Sauvegarde automatique impossible', x); }
}
// Une copie par semaine (nommée d'après le lundi), on garde les plus récentes
async function sauvegardeHebdo() {
  try {
    const nom = S.nomHebdo(jourCivil(maintenant()));
    if ((await listerSauvegardes()).includes(nom)) return;
    await ecrireSauvegarde(nom, lireBrut());
    await nettoyer('hebdo-', C.donnees.sauvegardesHebdo);
  } catch (x) { console.error('Sauvegarde hebdomadaire impossible', x); }
}

/* ===== EXPORT / IMPORT ===== */
// Android : feuille de partage (Drive, NAS, e-mail…) ; navigateur : téléchargement. Renvoie true si c'est parti.
async function partagerFichier(nom, texte, type) {
  if (PL.Filesystem && PL.Share) {
    const { uri } = await PL.Filesystem.writeFile({ path: nom, data: texte, directory: 'CACHE', encoding: 'utf8' });
    try { await PL.Share.share({ title: nom, url: uri }); return true; }
    catch (x) { if (/cancel/i.test(x?.message || '')) return false; throw x; }
  }
  const a = Object.assign(document.createElement('a'),
    { href: URL.createObjectURL(new Blob([texte], { type })), download: nom });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  return true;
}

async function exporter() {
  const instant = maintenant();
  const donnees = S.pourExport(etat, instant.toISOString(), window.APP_VERSION);
  try {
    const parti = await partagerFichier(S.nomExport(jourCivil(instant)), JSON.stringify(donnees, null, 2), 'application/json');
    if (!parti) return;
    modifier(e => { e.reglages.dernierExport = instant.toISOString(); });
    toast('Export prêt 📤 Garde-le en lieu sûr.');
  } catch (x) {
    console.error(x);
    message('Export impossible', 'Le fichier n\'a pas pu être créé (' + (x.message || x) + ').');
  }
}

function choisirFichierImport() {
  const input = document.getElementById('fichier-import');
  input.value = '';
  input.click();
}

async function importerFichier(fichier) {
  const texte = await fichier.text();
  const r = S.analyserImport(texte, etat, C);
  if (!r.ok) return message('Import impossible', r.message);
  const quand = r.apercu.exporteLe ? 'Export du ' + dateCourte(r.apercu.exporteLe) : 'Export';
  const ok = await dialogue('Remplacer tes données ?',
    `<p><b>${quand}</b><br>${descriptionResume(r.apercu)}</p>` +
    (r.actuel ? `<p class="discret">Sur ce téléphone en ce moment :<br>${descriptionResume(r.actuel)}</p>` : '') +
    '<p class="discret">Une copie de sécurité de tes données actuelles est faite avant.</p>',
    [{ texte: 'Annuler', valeur: false }, { texte: 'Remplacer', valeur: true, principal: true }]);
  if (!ok) return;
  await sauvegardeAvant('import', lireBrut());
  etat = r.etat;
  sauver(etat);
  document.body.classList.remove('bloque');
  historique.length = 1;
  afficher('aujourdhui');
  rendre();
  toast('Import terminé ✅');
}

/* ===== RÉCUPÉRATION (données illisibles) ===== */
let brutIllisible = null;

async function essayerCopieSecours() {
  try {
    const { value } = PL.Preferences ? await PL.Preferences.get({ key: CLE }) : { value: null };
    const d = value && value !== brutIllisible ? S.decider(value, C) : null;
    if (!d || d.type !== 'ok') return message('Pas de copie utilisable', 'La copie de secours est absente ou abîmée elle aussi. Essaie d\'importer ton dernier export.');
    await sauvegardeAvant('illisible', brutIllisible);   // on garde aussi le texte illisible, au cas où
    etat = d.etat;
    sauver(etat);
    document.body.classList.remove('bloque');
    afficher('aujourdhui');
    rendre();
    toast('Données récupérées ✅');
  } catch (x) {
    console.error(x);
    message('Récupération impossible', String(x.message || x));
  }
}

/* ===== AJOUT DE TÂCHE (feuille d'ajout express) ===== */
function ouvrirAjout() {
  saisie = {
    categorieId: T.categorieParDefaut(etat, C),
    type: C.taches.defauts.type,
    taille: C.taches.defauts.taille,
    jours: [...T.TOUS_LES_JOURS],
    objectif: false
  };
  const f = document.getElementById('form-ajout');
  f.reset();
  document.getElementById('options').hidden = true;
  document.getElementById('btn-options').setAttribute('aria-expanded', 'false');
  document.getElementById('btn-options').textContent = 'Plus d\'options ▾';
  document.getElementById('ajout-erreur').textContent = '';
  rendreAjout();
  const dlg = document.getElementById('feuille-ajout');
  dlg.showModal();
  dlg.scrollTop = 0;
  setTimeout(() => document.getElementById('ajout-nom').focus(), 60);
}

function basculerOptions(forcer) {
  const zone = document.getElementById('options');
  const ouvrir = forcer ?? zone.hidden;
  zone.hidden = !ouvrir;
  const btn = document.getElementById('btn-options');
  btn.setAttribute('aria-expanded', String(ouvrir));
  btn.textContent = ouvrir ? 'Moins d\'options ▴' : 'Plus d\'options ▾';
}

function rendreAjout() {
  const cat = T.categorie(etat, saisie.categorieId);
  const pastille = document.getElementById('ajout-categorie-choisie');
  pastille.textContent = cat ? `${cat.emoji} ${cat.nom}` : 'Choisir une catégorie';
  pastille.style.setProperty('--famille', cat ? `var(--${cat.familleId})` : '');

  // Grille : favoris puis familles, et la tuile « Nouvelle »
  const grille = document.getElementById('grille-categories');
  const { favoris, parFamille } = T.grilleCategories(etat, C);
  const blocs = [];
  if (favoris.length) blocs.push(blocGrille('⭐ Favoris', favoris));
  for (const { famille, categories } of parFamille) blocs.push(blocGrille(`${famille.emoji} ${famille.nom}`, categories));
  const nouvelle = el('button', { type: 'button', class: 'tuile nouvelle-cat', 'data-action': 'nouvelle-categorie' });
  nouvelle.append(el('span', {}, '＋'), 'Nouvelle');
  const derniere = el('div', { class: 'grille' }, nouvelle);
  grille.replaceChildren(...blocs, el('p', { class: 'grille-titre' }, '✨ Perso'), derniere);

  for (const b of document.querySelectorAll('#choix-type button')) b.setAttribute('aria-checked', String(b.dataset.type === saisie.type));
  for (const b of document.querySelectorAll('#choix-taille button')) b.setAttribute('aria-checked', String(b.dataset.taille === saisie.taille));
  for (const z of document.querySelectorAll('.sous-options')) z.classList.toggle('visible', z.dataset.pour === saisie.type);
  document.getElementById('choix-jours').replaceChildren(...JOURS_COURTS.map((j, i) => el('button', {
    type: 'button', 'data-jour': i + 1, 'aria-pressed': String(saisie.jours.includes(i + 1)), 'aria-label': JOURS_NOMS[i]
  }, j)));
  document.getElementById('zone-objectif').hidden = !saisie.objectif;
}

function blocGrille(titre, categories) {
  const frag = document.createDocumentFragment();
  frag.append(el('p', { class: 'grille-titre' }, titre));
  frag.append(el('div', { class: 'grille' }, ...categories.map(c => {
    const b = el('button', { type: 'button', class: 'tuile' + (c.id === saisie.categorieId ? ' choisie' : ''), 'data-categorie': c.id });
    b.style.setProperty('--famille', `var(--${c.familleId})`);
    b.append(el('span', {}, c.emoji), c.nom);
    return b;
  })));
  return frag;
}

function enregistrerTache() {
  const val = (id) => document.getElementById(id).value;
  const r = T.creerTache({
    nom: val('ajout-nom'),
    categorieId: saisie.categorieId,
    type: saisie.type,
    taille: saisie.taille,
    jours: saisie.jours,
    echeance: val('ajout-echeance') || undefined,
    important: document.getElementById('ajout-important').checked,
    objectif: saisie.objectif ? { cible: val('ajout-cible'), unite: val('ajout-unite') } : undefined
  }, etat, C, S.nouvelId(), maintenant().toISOString());
  if (!r.ok) {
    document.getElementById('ajout-erreur').textContent = r.erreur;
    // L'erreur concerne peut-être une option repliée : on déplie
    if (!/nom de la tâche|Nom trop long/.test(r.erreur)) basculerOptions(true);
    return;
  }
  derniereAjoutee = r.tache.id;
  if (!modifier(e => T.ajouterTache(e, r.tache))) return;
  document.getElementById('feuille-ajout').close();
  if (historique[historique.length - 1] !== 'aujourdhui') aller('aujourdhui');
  PL.Haptics?.impact({ style: 'LIGHT' }).catch(() => {});
  toast('Tâche ajoutée ✅');
}

/* ===== NOUVELLE CATÉGORIE PERSO ===== */
function ouvrirNouvelleCategorie(origine) {
  origineCategorie = origine;
  const catActuelle = origine === 'ajout' ? T.categorie(etat, saisie.categorieId) : null;
  familleCategorie = catActuelle?.familleId ?? null;
  document.getElementById('form-categorie').reset();
  document.getElementById('categorie-erreur').textContent = '';
  document.getElementById('emojis-suggeres').replaceChildren(...C.categories.emojisSuggeres.map(e =>
    el('button', { type: 'button', 'data-emoji': e, 'aria-label': 'Emoji ' + e }, e)));
  rendreFamilles();
  document.getElementById('feuille-categorie').showModal();
  setTimeout(() => document.getElementById('categorie-nom').focus(), 60);
}

function rendreFamilles() {
  document.getElementById('choix-famille').replaceChildren(...C.familles.map(f => {
    const b = el('button', { type: 'button', 'data-famille': f.id, role: 'radio', 'aria-checked': String(f.id === familleCategorie) }, `${f.emoji} ${f.nom}`);
    b.style.setProperty('--famille', `var(--${f.id})`);
    return b;
  }));
}

function creerCategorie() {
  const r = T.creerCategorie({
    nom: document.getElementById('categorie-nom').value,
    emoji: document.getElementById('categorie-emoji').value,
    familleId: familleCategorie
  }, etat, C, S.nouvelId());
  if (!r.ok) { document.getElementById('categorie-erreur').textContent = r.erreur; return; }
  if (!modifier(e => { e.categories.push(r.categorie); })) return;
  document.getElementById('feuille-categorie').close();
  if (origineCategorie === 'ajout') { saisie.categorieId = r.categorie.id; rendreAjout(); }
  toast(`Catégorie ${r.categorie.emoji} ${r.categorie.nom} créée`);
}

/* ===== DÉMARRAGE =====
 * Piège n°1 : un texte illisible ne doit JAMAIS être remplacé par un état vide.
 */
async function demarrer() {
  await restaurer();
  const brut = lireBrut();
  const d = S.decider(brut, C);
  document.body.classList.remove('demarrage');

  if (d.type === 'illisible') {
    console.error('Données illisibles :', d.erreur);
    brutIllisible = brut;
    document.body.classList.add('bloque');
    return afficher('recuperation');
  }
  if (d.type === 'trop-recent') {
    document.body.classList.add('bloque');
    return afficher('trop-recent');
  }
  if (d.aMigrer) await sauvegardeAvant('migration-v' + S.SCHEMA, brut);
  etat = d.etat;
  sauver(etat);
  afficher('aujourdhui');
  rendre();
  sauvegardeHebdo();
}

/* ===== RENDU ===== */
function afficher(nom) {
  const ecran = document.getElementById('ecran-' + nom);
  if (!ecran) return;
  document.querySelectorAll('.ecran').forEach(e => e.classList.toggle('actif', e === ecran));
  document.getElementById('titre').textContent = ecran.dataset.titre;
  document.body.classList.toggle('sur-aujourdhui', nom === 'aujourdhui');
  // L'onglet allumé est celui de l'écran, ou de son parent (À propos → Réglages)
  const onglet = ecran.dataset.parent || nom;
  document.querySelectorAll('.onglet').forEach(b => b.classList.toggle('actif', b.dataset.aller === onglet));
  if (nom === 'apropos') remplirApropos();
  window.scrollTo(0, 0);
}

function rendre() {
  if (!etat) return;
  rendreListes();
  rendreCategories();
  const dernier = etat.reglages.dernierExport;
  document.getElementById('info-dernier-export').textContent = dernier ? 'Dernier export : ' + dateCourte(dernier) : 'Jamais exporté pour l\'instant';
}

function rendreListes() {
  const listes = T.listes(etat);
  const total = listes.quotidienne.length + listes.imprevu.length + listes.bonus.length;
  document.getElementById('aujourdhui-vide').hidden = total > 0;
  const blocs = [];
  for (const type of T.TYPES) {
    if (!listes[type].length) continue;
    blocs.push(el('h3', { class: 'intertitre' }, NOMS_TYPES[type]));
    for (const t of listes[type]) blocs.push(carteTache(t));
  }
  document.getElementById('listes').replaceChildren(...blocs);
  derniereAjoutee = null;
}

function carteTache(t) {
  const cat = T.categorie(etat, t.categorieId);
  const details = [];
  if (t.objectif) details.push(`Objectif : ${nombre(t.objectif.cible)} ${t.objectif.unite}`);
  if (t.type === 'quotidienne') details.push(t.jours.length === 7 ? 'Tous les jours' : t.jours.map(j => JOURS_NOMS[j - 1]).join(', '));
  if (t.echeance) details.push('Pour le ' + dateEcheance(t.echeance));
  if (t.important) details.push('❗ Important');
  const carte = el('div', { class: 'tache' + (t.id === derniereAjoutee ? ' nouvelle' : ''), 'data-tache': t.id });
  carte.style.setProperty('--famille', cat ? `var(--${cat.familleId})` : '');
  carte.append(
    el('span', { class: 'tache-emoji', 'aria-hidden': 'true' }, cat?.emoji ?? '•'),
    el('span', { class: 'tache-corps' }, el('span', { class: 'tache-nom' }, t.nom), details.length ? el('small', {}, details.join(' · ')) : '')
  );
  return carte;
}

function rendreCategories() {
  const perso = etat.categories.filter(c => c.perso);
  const depart = etat.categories.length - perso.length;
  document.getElementById('info-nb-perso').textContent = `${depart} de départ · ${perso.length} perso`;
  const liste = document.getElementById('liste-categories');
  if (!perso.length) {
    liste.replaceChildren(el('p', { class: 'discret aide' }, 'Crée tes propres catégories (guitare, jardinage…). Elles s\'ajoutent aux catégories de départ.'));
    return;
  }
  liste.replaceChildren(el('h3', { class: 'intertitre' }, 'Mes catégories perso'), ...perso.map(c => {
    const f = T.famille(c.familleId, C);
    const ligne = el('div', { class: 'cat-ligne' }, el('span', { 'aria-hidden': 'true' }, c.emoji), el('span', {}, c.nom), el('small', {}, `${f.emoji} ${f.nom}`));
    ligne.style.setProperty('--famille', `var(--${c.familleId})`);
    return ligne;
  }));
}

function aller(nom) {
  if (historique[historique.length - 1] === nom) return;
  // Un onglet repart de zéro (pas de longue pile), un sous-écran s'empile
  const estOnglet = !!document.querySelector(`.onglet[data-aller="${nom}"]`);
  if (estOnglet) historique.length = 1;
  if (nom !== 'aujourdhui') historique.push(nom);
  afficher(nom);
}

// Renvoie false quand il n'y a plus rien à fermer (le bouton retour quitte alors l'appli)
function retourEcranPrecedent() {
  const ouverts = document.querySelectorAll('dialog[open]');
  if (ouverts.length) { ouverts[ouverts.length - 1].close(); return true; }
  if (document.body.classList.contains('bloque') || historique.length <= 1) return false;
  historique.pop();
  afficher(historique[historique.length - 1]);
  return true;
}

function remplirApropos() {
  document.getElementById('info-version').textContent = window.APP_VERSION || '—';
  document.getElementById('info-plateforme').textContent = NATIF ? 'Android' : 'Navigateur (test)';
  document.getElementById('info-stockage').textContent = PL.Preferences ? 'oui' : 'non';
  const ko = ((lireBrut() || '').length / 1024);
  document.getElementById('info-taille').textContent = (ko < 10 ? ko.toFixed(1) : Math.round(ko)) + ' Ko';
}

/* Dialogue : renvoie la valeur du bouton choisi (false si fermé par « retour ») */
function dialogue(titre, html, boutons) {
  const dlg = document.getElementById('dialogue');
  document.getElementById('dialogue-titre').textContent = titre;
  document.getElementById('dialogue-texte').innerHTML = html;
  const zone = document.getElementById('dialogue-boutons');
  zone.replaceChildren(...boutons.map((b, i) => {
    const bouton = el('button', { class: 'bouton' + (b.principal ? ' principal' : '') }, b.texte);
    bouton.onclick = () => dlg.close(String(i));
    return bouton;
  }));
  return new Promise((ok) => {
    dlg.addEventListener('close', () => ok(dlg.returnValue === '' ? false : boutons[+dlg.returnValue].valeur), { once: true });
    dlg.returnValue = '';
    dlg.showModal();
  });
}
function message(titre, texte) {
  return dialogue(titre, `<p>${echapper(texte)}</p>`, [{ texte: 'OK', valeur: true, principal: true }]);
}

let minuteurToast;
function toast(texte) {
  const t = document.getElementById('toast');
  t.textContent = texte;
  t.classList.add('visible');
  clearTimeout(minuteurToast);
  minuteurToast = setTimeout(() => t.classList.remove('visible'), 2600);
}

/* ===== ÉVÉNEMENTS ===== */
document.addEventListener('click', (e) => {
  const cible = e.target.closest('[data-aller], [data-action], [data-fermer]');
  if (!cible) return;
  if (cible.dataset.aller) return aller(cible.dataset.aller);
  if ('fermer' in cible.dataset) return cible.closest('dialog')?.close();
  const action = cible.dataset.action;
  if (action === 'ajouter' && etat) ouvrirAjout();
  if (action === 'nouvelle-categorie' && etat) ouvrirNouvelleCategorie(cible.closest('#feuille-ajout') ? 'ajout' : 'reglages');
});

// Feuille d'ajout : choix dans la grille, type, taille, jours, objectif
document.getElementById('feuille-ajout').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) return e.currentTarget.close();   // toucher le fond grisé = fermer
  const b = e.target.closest('button');
  if (!b || !saisie) return;
  if (b.dataset.categorie) { saisie.categorieId = b.dataset.categorie; rendreAjout(); }
  else if (b.dataset.type) { saisie.type = b.dataset.type; rendreAjout(); }
  else if (b.dataset.taille) { saisie.taille = b.dataset.taille; rendreAjout(); }
  else if (b.dataset.jour) {
    const j = +b.dataset.jour;
    saisie.jours = saisie.jours.includes(j) ? saisie.jours.filter(x => x !== j) : [...saisie.jours, j];
    rendreAjout();
  } else if (b.id === 'btn-options') basculerOptions();
  else if (b.id === 'ajout-categorie-choisie') {
    basculerOptions(true);
    document.getElementById('grille-categories').querySelector('.choisie')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
});
document.getElementById('ajout-objectif').addEventListener('change', (e) => {
  saisie.objectif = e.target.checked;
  if (saisie.objectif && saisie.taille === C.taches.defauts.taille) saisie.taille = C.tailleObjectifParDefaut;
  rendreAjout();
  if (saisie.objectif) document.getElementById('ajout-cible').focus();
});
document.getElementById('form-ajout').addEventListener('submit', (e) => { e.preventDefault(); enregistrerTache(); });
document.getElementById('ajout-nom').addEventListener('input', () => { document.getElementById('ajout-erreur').textContent = ''; });

// Feuille « nouvelle catégorie »
document.getElementById('feuille-categorie').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) return e.currentTarget.close();
  const b = e.target.closest('button');
  if (b?.dataset.emoji) document.getElementById('categorie-emoji').value = b.dataset.emoji;
  if (b?.dataset.famille) { familleCategorie = b.dataset.famille; rendreFamilles(); }
});
document.getElementById('form-categorie').addEventListener('submit', (e) => { e.preventDefault(); creerCategorie(); });

// Données
document.getElementById('btn-exporter').addEventListener('click', exporter);
document.getElementById('btn-importer').addEventListener('click', choisirFichierImport);
document.getElementById('btn-importer-recup').addEventListener('click', choisirFichierImport);
document.getElementById('btn-secours').addEventListener('click', essayerCopieSecours);
document.getElementById('btn-envoyer-brut').addEventListener('click', () =>
  partagerFichier(`hameau_illisible_${jourCivil(maintenant())}.txt`, brutIllisible || '', 'text/plain').catch(console.error));
document.getElementById('fichier-import').addEventListener('change', (e) => {
  const f = e.target.files?.[0];
  if (f) importerFichier(f).catch(x => { console.error(x); message('Import impossible', String(x.message || x)); });
});

// Bouton retour Android : ferme la fenêtre ouverte ou revient à l'écran précédent, sinon quitte
PL.App?.addListener('backButton', () => { if (!retourEcranPrecedent()) PL.App.exitApp(); });

/* ===== UTILITAIRES ===== */
// Crée un élément ; le texte passe toujours par textContent (les noms saisis ne sont jamais interprétés comme du HTML)
function el(balise, attributs = {}, ...enfants) {
  const n = document.createElement(balise);
  for (const [k, v] of Object.entries(attributs)) n.setAttribute(k, v);
  n.append(...enfants.filter(x => x !== '' && x != null));
  return n;
}
function dateCourte(iso) {
  return new Date(iso).toLocaleDateString('fr-BE', { timeZone: C.jour.fuseau, day: 'numeric', month: 'long', year: 'numeric' });
}
function dateEcheance(jour) {           // « 20 nov. » (jour AAAA-MM-JJ, sans fuseau : c'est une date de calendrier)
  const [a, m, j] = jour.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, j)).toLocaleDateString('fr-BE', { timeZone: 'UTC', day: 'numeric', month: 'short' });
}
function nombre(n) { return Number(n).toLocaleString('fr-BE'); }
function descriptionResume(r) {
  const s = (n, mot) => `${n} ${mot}${n > 1 ? 's' : ''}`;
  return `Niveau ${r.niveau} · ${s(r.taches, 'tâche')} · ${s(r.saisies, 'saisie')}`;
}
function echapper(t) {
  return String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ===== LANCEMENT ===== */
demarrer().catch((x) => {
  console.error(x);
  document.body.classList.remove('demarrage');
  message('Petit souci au démarrage', String(x.message || x));
});
