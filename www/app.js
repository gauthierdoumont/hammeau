/* Hameau — logique de l'interface — Créé par Gauthier Doumont */
'use strict';

/* ===== NATIF : Android via Capacitor, sinon navigateur (pour les tests) ===== */
const NATIF = window.Capacitor?.isNativePlatform?.() === true;
const PL = NATIF ? (window.Capacitor.Plugins || {}) : {};

/* ===== ÉTAT ===== */
// Pile des écrans visités : le bouton retour Android remonte cette pile
const historique = ['aujourdhui'];

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

function aller(nom) {
  if (historique[historique.length - 1] === nom) return;
  // Un onglet repart de zéro (pas de longue pile), un sous-écran s'empile
  const estOnglet = !!document.querySelector(`.onglet[data-aller="${nom}"]`);
  if (estOnglet) historique.length = 1;
  if (nom !== 'aujourdhui') historique.push(nom);
  afficher(nom);
}

// Renvoie false quand on est déjà sur l'accueil (le bouton retour quitte alors l'appli)
function retourEcranPrecedent() {
  if (historique.length <= 1) return false;
  historique.pop();
  afficher(historique[historique.length - 1]);
  return true;
}

function remplirApropos() {
  document.getElementById('info-version').textContent = window.APP_VERSION || '—';
  document.getElementById('info-plateforme').textContent = NATIF ? 'Android' : 'Navigateur (test)';
  document.getElementById('info-stockage').textContent = PL.Preferences ? 'oui' : 'non';
}

/* ===== ÉVÉNEMENTS ===== */
document.addEventListener('click', (e) => {
  const cible = e.target.closest('[data-aller]');
  if (cible) aller(cible.dataset.aller);
});

// Bouton retour Android : écran précédent au lieu de quitter
PL.App?.addListener('backButton', () => { if (!retourEcranPrecedent()) PL.App.exitApp(); });

/* ===== DÉMARRAGE ===== */
afficher('aujourdhui');
