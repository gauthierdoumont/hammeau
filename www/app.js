/* app.js — Hameau — logique de l'interface — Créé par Gauthier Doumont */
'use strict';

/* ===== CONFIG ===== */
const C = window.CONFIG;
const S = window.Stockage;
const CLE = S.CLE;

/* ===== NATIF : Android via Capacitor, sinon navigateur (pour les tests) ===== */
const NATIF = window.Capacitor?.isNativePlatform?.() === true;
const PL = NATIF ? (window.Capacitor.Plugins || {}) : {};

/* ===== ÉTAT ===== */
let etat = null;                    // données du joueur (une fois chargées)
const historique = ['aujourdhui'];  // pile des écrans : le bouton retour Android la remonte

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
  // L'onglet allumé est celui de l'écran, ou de son parent (À propos → Réglages)
  const onglet = ecran.dataset.parent || nom;
  document.querySelectorAll('.onglet').forEach(b => b.classList.toggle('actif', b.dataset.aller === onglet));
  if (nom === 'apropos') remplirApropos();
  window.scrollTo(0, 0);
}

function rendre() {
  if (!etat) return;
  const dernier = etat.reglages.dernierExport;
  document.getElementById('info-dernier-export').textContent = dernier ? 'Dernier export : ' + dateCourte(dernier) : 'Jamais exporté pour l\'instant';
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
  const dlg = document.getElementById('dialogue');
  if (dlg.open) { dlg.close(''); return true; }
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
    const el = document.createElement('button');
    el.className = 'bouton' + (b.principal ? ' principal' : '');
    el.textContent = b.texte;
    el.onclick = () => dlg.close(String(i));
    return el;
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
  const el = document.getElementById('toast');
  el.textContent = texte;
  el.classList.add('visible');
  clearTimeout(minuteurToast);
  minuteurToast = setTimeout(() => el.classList.remove('visible'), 2600);
}

/* ===== ÉVÉNEMENTS ===== */
document.addEventListener('click', (e) => {
  const cible = e.target.closest('[data-aller]');
  if (cible) aller(cible.dataset.aller);
});
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
function dateCourte(iso) {
  return new Date(iso).toLocaleDateString('fr-BE', { timeZone: C.jour.fuseau, day: 'numeric', month: 'long', year: 'numeric' });
}
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
