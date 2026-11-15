/* app.js — Hameau — logique de l'interface — Créé par Gauthier Doumont */
'use strict';

/* ===== CONFIG ===== */
const C = window.CONFIG;
const S = window.Stockage;
const T = window.Taches;
const M = window.Moteur;
const Economie = window.Economie;
const J = window.Temps;
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
let tacheEditee = null;             // id de la tâche en cours de modification (null = ajout)
let tacheSaisie = null;             // id de la tâche dont on saisit la progression
let jourAffiche = null;             // jour logique affiché sur l'écran Aujourd'hui (pour détecter 4 h du matin)

/* ===== HORLOGE =====
 * Dans le navigateur, localStorage « debug_maintenant » permet de simuler une date (tests).
 */
function maintenant() {
  if (!NATIF) { try { const d = localStorage.getItem('debug_maintenant'); if (d) return new Date(d); } catch {} }
  return new Date();
}
function jourCivil(instant) {        // AAAA-MM-JJ à Bruxelles (même calcul testé que le jour logique)
  return J.partiesLocales(instant, C.jour.fuseau).jour;
}
function jourActuel() {              // jour logique (la journée finit à 4 h du matin)
  return J.jourLogique(maintenant(), C);
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
    S.verifier(copie, C);
  } catch (x) {
    console.error(x);
    toast(x.pourUtilisateur || 'Action annulée, rien n\'a été perdu.');
    return false;
  }
  etat = copie;
  sauver(etat);
  rendre();
  return true;
}
// Erreur à montrer telle quelle (ex. « Déjà fait aujourd'hui ✅ »)
function refus(texte) { const x = new Error(texte); x.pourUtilisateur = texte; return x; }

// « Annuler » : revient à l'état d'avant, seulement si rien n'a changé entre-temps
function proposerAnnulation(texte, avant) {
  const apres = etat;
  toast(texte, {
    texte: 'Annuler', delai: 5000, action: () => {
      if (etat !== apres) return toast('Trop tard pour annuler.');
      etat = avant;
      sauver(etat);
      rendre();
      toast('Annulé ↩️');
    }
  });
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

/* ===== AJOUT / MODIFICATION DE TÂCHE (même feuille) ===== */
function ouvrirAjout(tache = null) {
  tacheEditee = tache?.id ?? null;
  saisie = {
    categorieId: tache?.categorieId ?? T.categorieParDefaut(etat, C),
    type: tache?.type ?? C.taches.defauts.type,
    taille: tache?.taille ?? C.taches.defauts.taille,
    jours: [...(tache?.jours ?? T.TOUS_LES_JOURS)],
    objectif: !!tache?.objectif
  };
  const f = document.getElementById('form-ajout');
  f.reset();
  const champ = (id, v) => { document.getElementById(id).value = v ?? ''; };
  if (tache) {
    champ('ajout-nom', tache.nom);
    champ('ajout-echeance', tache.echeance);
    document.getElementById('ajout-important').checked = !!tache.important;
    document.getElementById('ajout-objectif').checked = !!tache.objectif;
    champ('ajout-cible', tache.objectif?.cible);
    champ('ajout-unite', tache.objectif?.unite);
  }
  document.getElementById('ajout-titre').textContent = tache ? 'Modifier la tâche' : 'Nouvelle tâche';
  document.getElementById('btn-supprimer').hidden = !tache;
  basculerOptions(!!tache);   // en modification, tout est déplié
  document.getElementById('ajout-erreur').textContent = '';
  rendreAjout();
  const dlg = document.getElementById('feuille-ajout');
  dlg.showModal();
  dlg.scrollTop = 0;
  if (!tache) setTimeout(() => document.getElementById('ajout-nom').focus(), 60);
}

async function supprimerTacheEditee() {
  const t = etat.taches.find(x => x.id === tacheEditee);
  if (!t) return;
  const ok = await dialogue('Supprimer cette tâche ?',
    `<p><b>${echapper(t.nom)}</b></p><p class="discret">Tout ce qu'elle t'a déjà rapporté (XP, ressources) reste à toi.</p>`,
    [{ texte: 'Garder', valeur: false }, { texte: 'Supprimer', valeur: true, principal: true }]);
  if (!ok) return;
  const avant = etat;
  if (!modifier(e => T.supprimerTache(e, t.id, maintenant().toISOString()))) return;
  document.getElementById('feuille-ajout').close();
  proposerAnnulation('Tâche supprimée', avant);
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
  const donnees = {
    nom: val('ajout-nom'),
    categorieId: saisie.categorieId,
    type: saisie.type,
    taille: saisie.taille,
    jours: saisie.jours,
    echeance: val('ajout-echeance') || undefined,
    important: document.getElementById('ajout-important').checked,
    objectif: saisie.objectif ? { cible: val('ajout-cible'), unite: val('ajout-unite') } : undefined
  };
  const ancienne = tacheEditee ? etat.taches.find(t => t.id === tacheEditee) : null;
  const r = ancienne ? T.modifierTache(ancienne, donnees, etat, C, maintenant().toISOString())
    : T.creerTache(donnees, etat, C, S.nouvelId(), maintenant().toISOString());
  if (!r.ok) {
    document.getElementById('ajout-erreur').textContent = r.erreur;
    // L'erreur concerne peut-être une option repliée : on déplie
    if (!/nom de la tâche|Nom trop long/.test(r.erreur)) basculerOptions(true);
    return;
  }
  derniereAjoutee = r.tache.id;
  if (ancienne) {
    if (!modifier(e => T.remplacerTache(e, r.tache))) return;
    document.getElementById('feuille-ajout').close();
    toast('Tâche modifiée ✏️');
    return;
  }
  if (!modifier(e => T.ajouterTache(e, r.tache))) return;
  document.getElementById('feuille-ajout').close();
  if (historique[historique.length - 1] !== 'aujourdhui') aller('aujourdhui');
  PL.Haptics?.impact({ style: 'LIGHT' }).catch(() => {});
  toast('Tâche ajoutée ✅');
}

/* ===== COCHER / SAISIR UNE PROGRESSION ===== */
// quantite = null → terminer la tâche ; nombre → progression d'un objectif chiffré
function cocher(tacheId, quantite = null) {
  const carte = document.querySelector(`.tache[data-tache="${tacheId}"]`);
  const depart = (carte?.querySelector('.case') || carte)?.getBoundingClientRect();
  const avant = etat;
  let r;
  const ok = modifier(e => {
    r = M.saisir(e, tacheId, quantite, { id: S.nouvelId(), horodatage: maintenant().toISOString(), jour: jourActuel() }, C);
    if (!r.ok) throw refus(r.erreur);
  });
  if (!ok) return false;
  // Retour immédiat : le gain s'envole vers son compteur, petite vibration
  animerGain(depart, r, avant);
  vibrer('LIGHT');
  window.Sons?.jouer(r.terminee ? 'pieces' : 'valide');
  let texte = r.terminee ? 'Bien joué ✅' : `${Math.round(r.progression * 100)} % fait ✨`;
  if (r.niveauxGagnes) texte = `Niveau ${etat.joueur.niveau} atteint ! 🎉`;
  proposerAnnulation(texte, avant);
  return true;
}

function ouvrirSaisie(tacheId) {
  const t = etat.taches.find(x => x.id === tacheId);
  if (!t?.objectif) return;
  tacheSaisie = tacheId;
  const b = M.bilan(t, etat.journal, jourActuel());
  const reste = M.reste(t, b);
  document.getElementById('form-saisie').reset();
  document.getElementById('saisie-titre').textContent = t.nom;
  document.getElementById('saisie-info').textContent = `${nombre(Math.min(b.somme, t.objectif.cible))} / ${nombre(t.objectif.cible)} ${t.objectif.unite}`;
  document.getElementById('saisie-question').textContent = `Combien de ${t.objectif.unite} ?`;
  document.getElementById('saisie-erreur').textContent = '';
  // « Tout le reste » termine la tâche (pas d'arrondi qui laisserait 99,6 %)
  const raccourcis = [1, 5, 10].filter(v => v < reste).map(v =>
    el('button', { type: 'button', 'data-valeur': v }, `+${nombre(v)}`));
  raccourcis.push(el('button', { type: 'button', 'data-valeur': 'tout' }, `Tout le reste (${nombre(reste)})`));
  document.getElementById('saisie-raccourcis').replaceChildren(...raccourcis);
  document.getElementById('feuille-saisie').showModal();
  setTimeout(() => document.getElementById('saisie-valeur').focus(), 60);
}

function validerSaisie(valeur) {
  if (valeur === 'tout') {
    document.getElementById('feuille-saisie').close();
    return cocher(tacheSaisie, null);
  }
  const v = Number(String(valeur).replace(',', '.').trim());
  if (!(v > 0) || !Number.isFinite(v)) {
    document.getElementById('saisie-erreur').textContent = 'Entre un nombre plus grand que 0.';
    return;
  }
  document.getElementById('feuille-saisie').close();
  cocher(tacheSaisie, v);
}

/* ===== ANIMATIONS DE RÉCOMPENSE ===== */
const MOUVEMENT_REDUIT = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function animerGain(depart, r, avant) {
  if (!r.gain) return;
  const res = r.ressource ? C.ressources.find(x => x.id === r.ressource) : null;
  const cible = res ? document.querySelector(`.pastille-res[data-ressource="${res.id}"]`) : document.getElementById('barre-xp');
  const etiquette = el('div', { class: 'vol', 'aria-hidden': 'true' }, `+${r.gain} ${res ? res.emoji : 'XP'}`);
  document.body.append(etiquette);
  const de = depart || { left: innerWidth / 2, top: innerHeight / 2, width: 0, height: 0 };
  const vers = cible?.getBoundingClientRect() || de;
  const x0 = de.left + de.width / 2 - 20, y0 = de.top + de.height / 2 - 14;
  const x1 = vers.left + vers.width / 2 - 20, y1 = vers.top + vers.height / 2 - 14;
  // Le compteur garde l'ancienne valeur jusqu'à l'arrivée, puis défile jusqu'à la valeur actuelle.
  // Plusieurs gains en vol vers le même compteur : il ne recule jamais (on part de ce qui est affiché).
  if (res && cible) {
    if (!enVol[res.id]) afficherCompteur(cible, avant.joueur.ressources[res.id]);
    enVol[res.id] = (enVol[res.id] || 0) + 1;
  }
  const arrivee = () => {
    etiquette.remove();
    if (!cible) return;
    cible.classList.remove('pulse'); void cible.offsetWidth; cible.classList.add('pulse');
    if (res) {
      enVol[res.id] = Math.max(0, enVol[res.id] - 1);
      defiler(cible, Number(cible.dataset.affiche), etat.joueur.ressources[res.id]);
    }
  };
  if (MOUVEMENT_REDUIT || !etiquette.animate) {
    etiquette.style.transform = `translate(${x0}px, ${y0 - 20}px)`;
    setTimeout(arrivee, 600);
    return;
  }
  etiquette.animate([
    { transform: `translate(${x0}px, ${y0}px) scale(.8)`, opacity: 0 },
    { transform: `translate(${x0}px, ${y0 - 30}px) scale(1.15)`, opacity: 1, offset: .25 },
    { transform: `translate(${x1}px, ${y1}px) scale(.9)`, opacity: .9 }
  ], { duration: 700, easing: 'cubic-bezier(.2,.8,.2,1)' }).onfinish = arrivee;
}

const enVol = {};                    // ressource → nombre de gains encore en vol vers son compteur
function afficherCompteur(pastille, valeur) {
  pastille.dataset.affiche = valeur;
  pastille.querySelector('b').textContent = nombre(valeur);
}
function defiler(pastille, de, a) {
  // Un seul défilement à la fois par compteur : le nouveau remplace l'ancien (sinon les deux se chevauchent et le chiffre saute)
  const jeton = pastille._jeton = (pastille._jeton || 0) + 1;
  if (MOUVEMENT_REDUIT || de === a || !Number.isFinite(de)) { afficherCompteur(pastille, a); return; }
  const debut = performance.now();
  const pas = (t) => {
    if (pastille._jeton !== jeton) return;
    const k = Math.min(1, (t - debut) / 400);
    afficherCompteur(pastille, Math.round(de + (a - de) * k));
    if (k < 1) requestAnimationFrame(pas);
  };
  requestAnimationFrame(pas);
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
  if (nom === 'perso' && etat) rendrePerso();
  rendreSousTitre(nom);
  window.scrollTo(0, 0);
  // Le village ne tourne que quand on le regarde (batterie)
  if (nom === 'village' && etat) window.Village?.ouvrir(etat);
  else { window.VillageUI?.quitter(); window.Village?.fermer(); }
}

function rendre() {
  if (!etat) return;
  rendreListes();
  rendreCategories();
  window.VillageUI?.rendre(etat);
  if (document.getElementById('ecran-perso').classList.contains('actif')) rendrePerso();
  rendreSousTitre(historique[historique.length - 1]);
  window.Village?.actualiser(etat);
  const dernier = etat.reglages.dernierExport;
  document.getElementById('info-dernier-export').textContent = dernier ? 'Dernier export : ' + dateCourte(dernier) : 'Jamais exporté pour l\'instant';
}

function rendreTableau() {
  const j = etat.joueur;
  // Les pastilles sont créées une fois puis mises à jour sur place (sinon une animation en cours viserait un élément disparu)
  const zone = document.getElementById('ressources');
  const visibles = C.ressources.filter(r => r.id !== 'gemmes' || j.ressources.gemmes > 0);   // les gemmes apparaissent au 1er coffre
  if (zone.children.length !== visibles.length) {
    zone.replaceChildren(...visibles.map(r => el('span', { class: 'pastille-res', 'data-ressource': r.id, title: r.nom },
      el('span', { 'aria-hidden': 'true' }, r.emoji), el('b', {}))));
  }
  for (const p of zone.children) {
    if (!enVol[p.dataset.ressource]) afficherCompteur(p, j.ressources[p.dataset.ressource] || 0);
  }
  const besoin = M.xpPourNiveau(j.niveau, C);
  document.getElementById('xp-medaillon').textContent = j.niveau;
  document.getElementById('xp-niveau').textContent = `Niv. ${j.niveau}`;
  document.getElementById('xp-reste').textContent = `encore ${nombre(besoin - j.xp)} XP avant le niveau ${j.niveau + 1}`;
  document.getElementById('xp-jauge').style.width = `${Math.min(100, (j.xp / besoin) * 100)}%`;
  rendreChantier();
}

// Carte « Prochain chantier » : le lien entre les tâches du jour et le village
function rendreChantier() {
  const carte = document.getElementById('carte-chantier');
  const ch = Economie.prochainChantier(etat, C);
  const def = ch && window.CATALOGUE_VILLAGE?.batiments[ch.type];
  carte.hidden = !def;
  if (!def) return;
  const p = ch.possibilite;
  const pret = !Object.keys(p.manque).length;
  carte.classList.toggle('pret', pret);
  document.getElementById('chantier-icone').textContent = def.emoji;
  document.getElementById('chantier-nom').textContent = p.action === 'ameliorer' ? `${def.nom} · niveau ${p.niveauCible}` : def.nom;
  document.getElementById('chantier-jauge').style.width = `${Math.round(ch.progression * 100)}%`;
  const manques = Object.entries(p.manque).sort((a, b) => b[1] - a[1]);
  document.getElementById('chantier-detail').textContent = pret
    ? 'Tout est prêt : va construire ! 🔨'
    : 'Il manque ' + manques.slice(0, 3).map(([r, q]) => `${nombre(q)} ${C.ressources.find(x => x.id === r).emoji}`).join(' · ') + (manques.length > 3 ? ' …' : '');
}

// Écran Perso : le chef, ses talents (stats) et son hameau
function rendrePerso() {
  const j = etat.joueur, besoin = M.xpPourNiveau(j.niveau, C);
  document.getElementById('perso-niveau').textContent = j.niveau;
  document.getElementById('perso-xp').textContent = `Niveau ${j.niveau} · ${nombre(j.xp)} / ${nombre(besoin)} XP · ${nombre(j.xpTotal)} XP en tout`;
  document.getElementById('perso-jauge').style.width = `${Math.min(100, (j.xp / besoin) * 100)}%`;
  const stats = M.stats(j.gagneTotal, C);
  document.getElementById('perso-stats').replaceChildren(...C.familles.filter(f => f.stat).map(f => {
    const total = j.gagneTotal[f.id] || 0;
    const vers = (total % C.stat.diviseur) / C.stat.diviseur;    // progression vers le point suivant
    const bonus = Economie.bonus(etat, f.id, C);
    const ligne = el('div', { class: 'stat' },
      el('span', { class: 'stat-icone', 'aria-hidden': 'true' }, f.emoji),
      el('span', { class: 'stat-texte' },
        el('span', { class: 'stat-titre' }, el('b', {}, f.nomStat), bonus ? el('small', { class: 'stat-bonus' }, `+${Math.round(bonus * 100)} %`) : ''),
        el('span', { class: 'stat-jauge' }, el('i', {}))),
      el('b', { class: 'stat-valeur' }, String(stats[f.stat])));
    ligne.style.setProperty('--famille', `var(--${f.id})`);
    ligne.querySelector('.stat-jauge i').style.width = `${Math.round(vers * 100)}%`;
    return ligne;
  }));
  const bats = etat.village?.batiments || [];
  const CV = window.CATALOGUE_VILLAGE;
  document.getElementById('perso-village').replaceChildren(bats.length
    ? el('div', { class: 'perso-bats' }, ...bats.filter(b => CV.batiments[b.type]).map(b => el('span', { class: 'perso-bat' }, `${CV.batiments[b.type].emoji} ${CV.batiments[b.type].nom}`, el('small', {}, ` niv. ${b.niveau}`))))
    : el('p', { class: 'discret' }, 'Ton hameau attend sa Mairie : chaque tâche t\'en rapproche.'));
}

// Sous-titre de l'en-tête sur Aujourd'hui : la date et un petit mot selon l'heure
function rendreSousTitre(nom) {
  const st = document.getElementById('sous-titre');
  if (nom !== 'aujourdhui' || !etat) { st.textContent = ''; return; }
  const m = maintenant();
  const h = J.partiesLocales(m, C.jour.fuseau).heure;
  const date = m.toLocaleDateString('fr-BE', { timeZone: C.jour.fuseau, weekday: 'long', day: 'numeric', month: 'long' });
  const mot = h < 4 ? 'Douce nuit 🌙' : h < 12 ? 'Belle matinée ☀️' : h < 18 ? 'Bel après-midi 🌤️' : 'Bonne soirée 🌇';
  st.textContent = `${date.charAt(0).toUpperCase() + date.slice(1)} · ${mot}`;
}

function rendreListes() {
  rendreTableau();
  const jour = jourActuel();
  const listes = M.listesDuJour(etat, jour, J.jourIso(jour));
  const total = listes.quotidienne.length + listes.imprevu.length + listes.bonus.length;
  // Liste vide : message adapté (1re fois, tout fait aujourd'hui, ou rien de prévu) — jamais culpabilisant
  document.getElementById('aujourdhui-vide').hidden = total > 0;
  if (!total) {
    const faitAujourdhui = etat.journal.some(s => s.jour === jour);
    const [emoji, titre, texte] = !etat.journal.length && !etat.taches.length
      ? ['🏡', 'Ton village attend ta première tâche', 'Chaque chose faite dans la vraie vie, même à moitié, le fera grandir.']
      : faitAujourdhui
        ? ['🏆', 'Tout est fait pour aujourd\'hui 🎉', 'Profite ! Un petit bonus en plus si l\'envie te prend.']
        : ['🌤️', 'Rien de prévu pour l\'instant', 'Ajoute ce que tu veux faire aujourd\'hui, même tout petit.'];
    document.getElementById('vide-emoji').textContent = emoji;
    document.getElementById('vide-titre').textContent = titre;
    document.getElementById('vide-texte').textContent = texte;
  }
  const blocs = [];
  for (const type of T.TYPES) {
    if (!listes[type].length) continue;
    const faites = listes[type].filter(t => M.estFaite(t, listes.bilans.get(t.id))).length;
    blocs.push(el('h3', { class: 'intertitre' }, NOMS_TYPES[type],
      type === 'quotidienne' ? el('span', { class: 'compte' + (faites === listes[type].length ? ' complet' : '') }, `${faites}/${listes[type].length}`) : ''));
    for (const t of listes[type]) blocs.push(carteTache(t, listes.bilans.get(t.id)));
  }
  jourAffiche = jour;
  if (listes.autresJours) {
    const s = listes.autresJours > 1;
    blocs.push(el('p', { class: 'discret autres-jours' }, `🗓️ ${listes.autresJours} quotidienne${s ? 's' : ''} prévue${s ? 's' : ''} d'autres jours`));
  }
  document.getElementById('listes').replaceChildren(...blocs);
  derniereAjoutee = null;
}

function carteTache(t, bilan) {
  const cat = T.categorie(etat, t.categorieId);
  const progression = bilan.progression;
  const fait = M.estFaite(t, bilan);
  const details = [];
  if (t.objectif) details.push(`${nombre(Math.min(bilan.somme, t.objectif.cible))} / ${nombre(t.objectif.cible)} ${t.objectif.unite}`);
  if (t.type === 'quotidienne' && t.jours.length < 7) details.push(t.jours.map(j => JOURS_NOMS[j - 1]).join(', '));
  if (t.echeance) details.push('Pour le ' + dateEcheance(t.echeance));
  if (t.important) details.push('❗ Important');

  const carte = el('div', { class: 'tache' + (fait ? ' fait' : '') + (t.id === derniereAjoutee ? ' nouvelle' : ''), 'data-tache': t.id });
  carte.style.setProperty('--famille', cat ? `var(--${cat.familleId})` : '');
  const texte = el('span', { class: 'tache-texte' }, el('span', { class: 'tache-nom' }, t.nom), details.length ? el('small', {}, details.join(' · ')) : '');
  if (t.objectif) {
    const barre = el('span', { class: 'mini' }, el('i', {}));
    barre.firstChild.style.width = `${progression * 100}%`;
    texte.append(barre);
  }
  carte.append(
    el('button', { class: 'case', 'data-cocher': t.id, 'aria-label': (fait ? 'Fait : ' : 'Terminer : ') + t.nom, ...(fait ? { disabled: '' } : {}) }),
    el('button', { class: 'tache-corps', 'data-modifier': t.id, 'aria-label': 'Modifier : ' + t.nom },
      el('span', { class: 'tache-emoji', 'aria-hidden': 'true' }, cat?.emoji ?? '•'), texte)
  );
  if (!fait) {
    const reste = M.gainRestant(t, bilan, C, M.bonusFamille(etat, cat?.familleId, C));
    const res = M.ressourceDe(cat, C);
    carte.append(el('span', { class: 'gain', 'aria-label': `rapporte ${reste}` }, `+${reste} ${res ? C.ressources.find(r => r.id === res).emoji : 'XP'}`));
    if (t.objectif) carte.append(el('button', { class: 'plus', 'data-saisir': t.id, 'aria-label': `Ajouter des ${t.objectif.unite}` }, '+'));
  }
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
  if (window.VillageUI?.retour()) return true;      // placement en cours dans le village → annulé
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

// Petit message en bas ; option {texte, action, delai} = bouton (ex. « Annuler »)
let minuteurToast;
function toast(texte, option = null) {
  const t = document.getElementById('toast');
  const bouton = document.getElementById('toast-action');
  document.getElementById('toast-texte').textContent = texte;
  bouton.hidden = !option;
  bouton.textContent = option?.texte ?? '';
  bouton.onclick = option ? () => { t.classList.remove('visible', 'avec-action'); option.action(); } : null;
  t.classList.toggle('avec-action', !!option);
  t.classList.add('visible');
  clearTimeout(minuteurToast);
  minuteurToast = setTimeout(() => t.classList.remove('visible', 'avec-action'), option?.delai ?? 2600);
}

/* ===== ÉVÉNEMENTS ===== */
document.addEventListener('click', (e) => {
  const cible = e.target.closest('[data-aller], [data-action], [data-fermer], [data-cocher], [data-saisir], [data-modifier]');
  if (!cible) return;
  if (cible.dataset.aller) return aller(cible.dataset.aller);
  if (cible.dataset.cocher) return cocher(cible.dataset.cocher);
  if (cible.dataset.saisir) return ouvrirSaisie(cible.dataset.saisir);
  if (cible.dataset.modifier) return ouvrirAjout(etat.taches.find(t => t.id === cible.dataset.modifier));
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
document.getElementById('btn-supprimer').addEventListener('click', supprimerTacheEditee);

// Feuille de saisie d'un objectif chiffré
document.getElementById('feuille-saisie').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) return e.currentTarget.close();
  const b = e.target.closest('[data-valeur]');
  if (b) validerSaisie(b.dataset.valeur);
});
document.getElementById('form-saisie').addEventListener('submit', (e) => { e.preventDefault(); validerSaisie(document.getElementById('saisie-valeur').value); });
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

// Nouvelle journée (4 h du matin) ou retour sur l'appli restée ouverte en arrière-plan :
// on redessine pour que les quotidiennes d'hier ne restent pas « faites »
function verifierNouveauJour() {
  if (!etat) return;
  if (jourActuel() !== jourAffiche) rendre();
}
PL.App?.addListener('resume', () => { verifierNouveauJour(); sauvegardeHebdo(); });
document.addEventListener('visibilitychange', () => { if (!document.hidden) verifierNouveauJour(); });
setInterval(verifierNouveauJour, 60 * 1000);

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

/* ===== FENÊTRE SUR L'APPLI (pour le village : village-ui.js, village.js) ===== */
function vibrer(style) {
  if (etat?.reglages?.vibrations === false) return;
  PL.Haptics?.impact({ style }).catch(() => {});
}
window.Appli = {
  etat: () => etat, modifier, refus, toast, dialogue, message, maintenant, vibrer, el, nombre,
  nouvelId: () => S.nouvelId(),
};
window.Sons?.brancher(() => etat?.reglages?.sons !== false);

/* ===== LANCEMENT ===== */
demarrer().catch((x) => {
  console.error(x);
  document.body.classList.remove('demarrage');
  message('Petit souci au démarrage', String(x.message || x));
});
