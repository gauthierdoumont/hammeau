/* app.js — Hameau — logique de l'interface — Créé par Gauthier Doumont */
'use strict';

/* ===== CONFIG ===== */
const C = window.CONFIG;
const S = window.Stockage;
const T = window.Taches;
const M = window.Moteur;
const Economie = window.Economie;
const Jours = window.Jours;
const J = window.Temps;
const MAJ = window.MisesAJour;
const N = window.Notifications;
const Cal = window.Calendrier;
const Sur = window.Surprises;
const Boss = window.Boss;
const Bilan = window.Bilan;
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
// Hasard (coffres). Dans le navigateur seulement, localStorage « debug_hasard » = jamais | toujours (tests reproductibles)
function hasard() {
  if (!NATIF) {
    try {
      const d = localStorage.getItem('debug_hasard');
      if (d === 'jamais') return () => 0.999;
      if (d === 'toujours') return () => 0;
    } catch {}
  }
  return Math.random;
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
  replanifierBientot();
  return true;
}

// Porte d'écriture des modifications : une erreur dans l'action ou la vérification → rien n'est sauvé
// (pour remplacer tout l'état d'un coup : remplacerEtat, juste en dessous ; nulle part ailleurs on n'écrit « etat = »)
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
// Seconde (et dernière) porte d'écriture : remplacer TOUT l'état d'un coup (rattrapage des jours, « Annuler »,
// import, restauration, récupération, démarrage). Même règle que modifier() : vérifié d'abord ; si la vérification
// lève une erreur, rien n'est changé ni sauvé (l'appelant choisit le message). verifier: false uniquement pour un état
// déjà vérifié (ex. l'état d'avant une coche). Toute autre écriture passe par modifier().
function remplacerEtat(nouvel, { verifier = true, redessiner = true } = {}) {
  if (verifier) S.verifier(nouvel, C);
  etat = nouvel;
  sauver(etat);
  if (redessiner) rendre();
}
// Erreur à montrer telle quelle (ex. « Déjà fait aujourd'hui ✅ »)
function refus(texte) { const x = new Error(texte); x.pourUtilisateur = texte; return x; }

// « Annuler » : revient à l'état d'avant, seulement si rien n'a changé entre-temps
// (le rattrapage des jours ne remplace l'état que s'il a vraiment changé : un simple tick ne bloque pas « Annuler »)
// Exception : l'agenda actualisé en silence entre-temps ne bloque pas ; son cache récent est gardé.
const sansCacheAgenda = (e) => ({ ...e, reglages: { ...e.reglages, calendrierCache: null } });
function memeSaufCacheAgenda(a, b) {
  return a === b || JSON.stringify(sansCacheAgenda(a)) === JSON.stringify(sansCacheAgenda(b));
}
function proposerAnnulation(texte, avant) {
  const apres = etat;
  toast(texte, {
    texte: 'Annuler', delai: 5000, action: () => {
      if (!memeSaufCacheAgenda(etat, apres)) return toast('Trop tard pour annuler.');
      const cache = etat.reglages.calendrierCache;
      // « avant » et le cache actuel ont déjà été vérifiés chacun de leur côté
      remplacerEtat(cache === avant.reglages.calendrierCache ? avant : { ...avant, reglages: { ...avant.reglages, calendrierCache: cache } }, { verifier: false });
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

async function lireSauvegarde(nom) {
  if (PL.Filesystem) {
    const { data } = await PL.Filesystem.readFile({ path: `sauvegardes/${nom}.json`, directory: 'DATA', encoding: 'utf8' });
    return data;
  }
  return localStorage.getItem(PREFIXE_LS + nom);
}

// Écran « Sauvegardes automatiques » : les plus récentes d'abord, chacune avec « Restaurer »
async function rendreSauvegardes() {
  const zone = document.getElementById('liste-sauvegardes');
  const liste = S.listeSauvegardes(await listerSauvegardes());
  if (!liste.length) {
    zone.replaceChildren(el('p', { class: 'sauvegardes-vide' }, 'Pas encore de copie : la première se fait toute seule cette semaine.'));
    return;
  }
  zone.replaceChildren(...liste.map(sv => el('div', { class: 'ligne sauvegarde' },
    el('span', { class: 'ligne-icone', 'data-teinte': sv.type === 'hebdo' ? 'repos' : 'esprit', 'aria-hidden': 'true' }, sv.type === 'hebdo' ? '📅' : '🛟'),
    el('span', { class: 'ligne-texte' }, el('b', {}, titreSauvegarde(sv)), el('small', {}, sv.type === 'hebdo' ? 'Copie de la semaine' : S.libelleRaison(sv.raison))),
    el('button', { type: 'button', class: 'bouton', 'data-restaurer': sv.nom }, 'Restaurer'))));
}
function titreSauvegarde(sv) {
  if (sv.type === 'hebdo') return 'Semaine du ' + dateEcheanceLongue(sv.jour);
  const d = new Date(sv.quand);
  return dateCourte(sv.quand) + ', ' + d.toLocaleTimeString('fr-BE', { timeZone: C.jour.fuseau, hour: '2-digit', minute: '2-digit' });
}

async function restaurerSauvegarde(nom) {
  try {
    const texte = await lireSauvegarde(nom);
    const r = S.preparerRestauration(texte, etat, C);
    if (!r.ok) return message('Restauration impossible', r.message);
    const ok = await dialogue('Revenir à cette copie ?',
      `<p><b>${echapper(titreSauvegarde(S.decrireSauvegarde(nom)))}</b><br>${descriptionResume(r.apercu)}</p>` +
      `<p class="discret">Sur ce téléphone en ce moment :<br>${descriptionResume(r.actuel)}</p>` +
      '<p class="discret">Une copie de sécurité de tes données actuelles est faite avant : tu pourras revenir en arrière.</p>',
      [{ texte: 'Annuler', valeur: false }, { texte: 'Restaurer', valeur: true, principal: true }]);
    if (!ok) return;
    await sauvegardeAvant('restauration', lireBrut());
    remplacerEtat(r.etat);
    rendreSauvegardes();
    toast('Copie restaurée ✅');
  } catch (x) {
    console.error(x);
    message('Restauration impossible', 'La copie n\'a pas pu être lue (' + (x.message || x) + '). Rien n\'a été changé.');
  }
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

/* ===== MISES À JOUR (seule fonction en ligne, seulement quand on touche le bouton) ===== */
function ouvrirLien(url) { PL.Browser ? PL.Browser.open({ url }) : window.open(url, '_blank', 'noopener'); }

async function verifierMisesAJour() {
  const info = document.getElementById('info-mises-a-jour');
  info.textContent = 'Vérification…';
  const fin = (texte) => { info.textContent = texte; };
  if (navigator.onLine === false) {
    fin('Seule fonction qui utilise Internet');
    return message('Pas de connexion', 'Le téléphone n\'est pas connecté à Internet pour l\'instant. Réessaie quand tu auras du réseau : tout le reste de Hameau marche sans.');
  }
  let reponse;
  try {
    const arret = new AbortController();
    const minuteur = setTimeout(() => arret.abort(), 10000);
    reponse = await fetch(MAJ.ADRESSE, { headers: { Accept: 'application/vnd.github+json' }, signal: arret.signal, cache: 'no-store' });
    clearTimeout(minuteur);
  } catch {
    fin('Seule fonction qui utilise Internet');
    return message('Pas de connexion', 'Impossible de joindre GitHub pour l\'instant. Réessaie plus tard : tout le reste de Hameau marche sans Internet.');
  }
  if (reponse.status === 404) {
    fin('Version ' + window.APP_VERSION);
    return message('Rien de nouveau', 'Aucune version n\'est encore publiée. Tu as la version ' + window.APP_VERSION + '.');
  }
  const r = reponse.ok ? MAJ.analyser(await reponse.json().catch(() => null), window.APP_VERSION) : null;
  if (!r) {
    fin('Seule fonction qui utilise Internet');
    return message('Réessaie plus tard', 'GitHub n\'a pas répondu comme prévu. Rien n\'a changé dans ton appli.');
  }
  if (!r.nouvelle) {
    fin('À jour · version ' + window.APP_VERSION);
    return toast('Tu as la dernière version ✅');
  }
  fin('Version ' + r.version + ' disponible');
  const ouvrir = await dialogue('Nouvelle version ' + r.version + ' 🎉',
    `<p>Tu as la version ${echapper(window.APP_VERSION)}.</p><p class="discret">Avec Obtainium, la mise à jour s'installe en un tap. Sinon, télécharge le fichier .apk sur la page de la version : tes données restent.</p>`,
    [{ texte: 'Plus tard', valeur: false }, { texte: 'Ouvrir la page', valeur: true, principal: true }]);
  if (ouvrir && r.url) ouvrirLien(r.url);
}

/* ===== RAPPELS (notifications locales) =====
 * Tout est recalculé (notifications.js) et reprogrammé à chaque sauvegarde (tâche cochée, réglage…) et à l'ouverture.
 */
const CLE_PROPOSITION = CLE + '_proposition_rappels';   // sur ce téléphone seulement (pas dans l'export)
let minuteurRappels;
function replanifierBientot() {
  clearTimeout(minuteurRappels);
  minuteurRappels = setTimeout(() => replanifier().catch(console.error), 1500);
}
async function permissionRappels() {
  if (!PL.LocalNotifications) return 'absent';
  try { return (await PL.LocalNotifications.checkPermissions()).display; } catch { return 'absent'; }
}
// Les appels passent l'un après l'autre (file) : deux replanifications qui se croisent pourraient sinon
// laisser une notification périmée (l'une annule pendant que l'autre programme).
let fileRappels = Promise.resolve();
function replanifier() {
  fileRappels = fileRappels.catch(() => {}).then(replanifierMaintenant);
  return fileRappels;
}
// Chaque rappel est « inexact » (à quelques minutes près, isExactNotification: false) : sinon, sans le droit
// « alarmes exactes » (refusé par défaut sur Android 14+), chaque programmation ouvrirait l'écran « Alarmes et rappels ».
async function replanifierMaintenant() {
  if (!etat || !PL.LocalNotifications || (await permissionRappels()) !== 'granted') return;
  const { notifications: enAttente } = await PL.LocalNotifications.getPending();
  const anciennes = enAttente.filter(n => n.id !== N.ID_TEST).map(n => ({ id: n.id }));
  if (anciennes.length) await PL.LocalNotifications.cancel({ notifications: anciennes });
  const liste = N.construire(etat, maintenant(), C).map(n => ({
    id: n.id, title: n.title, body: n.body, smallIcon: 'ic_stat_hameau', isExactNotification: false,
    schedule: { at: new Date(n.at), allowWhileIdle: true }
  }));
  if (liste.length) await PL.LocalNotifications.schedule({ notifications: liste });
}
// Écran d'explication AVANT la demande d'Android. auto = proposé par l'appli (au plus 2 fois), sinon demandé par un bouton.
async function proposerRappels(auto) {
  const etatPermission = await permissionRappels();
  if (etatPermission === 'absent') return false;
  if (etatPermission === 'granted') return true;
  if (etatPermission === 'denied') {
    if (!auto) message('Rappels coupés par le téléphone', 'Pour les recevoir : Paramètres du téléphone → Applications → Hameau → Notifications → autoriser.');
    return false;
  }
  if (auto) {
    let suivi = null;
    try { suivi = JSON.parse(localStorage.getItem(CLE_PROPOSITION)); } catch {}
    if (!N.proposerPermission(suivi, maintenant(), C)) return false;
    try { localStorage.setItem(CLE_PROPOSITION, JSON.stringify({ fois: (suivi?.fois || 0) + 1, dernier: maintenant().toISOString() })); } catch {}
  }
  const oui = await dialogue('Des petits rappels ? 🔔',
    '<p>Hameau peut te faire signe <b>le matin</b> avec ton programme du jour, <b>le soir</b> s\'il reste des quotidiennes, et <b>la veille</b> d\'une échéance.</p>' +
    '<p class="discret">Jamais de reproche, rien pendant une pause. Heures réglables (ou tout couper) dans Réglages.</p>',
    [{ texte: 'Plus tard', valeur: false }, { texte: 'Oui, avec plaisir', valeur: true, principal: true }]);
  if (!oui) return false;
  const r = await PL.LocalNotifications.requestPermissions().catch(() => ({ display: 'denied' }));
  if (r.display !== 'granted') {
    if (!auto) message('Pas de souci', 'Tu pourras les activer plus tard : Paramètres du téléphone → Applications → Hameau → Notifications.');
    return false;
  }
  try { localStorage.setItem(CLE_PROPOSITION, JSON.stringify({ fois: C.notifications.propositionsMax, dernier: maintenant().toISOString() })); } catch {}
  toast('Rappels activés 🔔');
  replanifier().catch(console.error);
  return true;
}
async function testerRappel() {
  if (!PL.LocalNotifications) return toast('Les rappels marchent dans l\'appli installée sur le téléphone.');
  if (!(await proposerRappels(false))) return;
  await PL.LocalNotifications.schedule({ notifications: [{
    id: N.ID_TEST, title: '🔔 Test de rappel', body: 'Les rappels de Hameau marchent ✅', smallIcon: 'ic_stat_hameau', isExactNotification: false,
    schedule: { at: new Date(Date.now() + C.notifications.testSecondes * 1000), allowWhileIdle: true }
  }] });
  toast(`Rappel de test dans ${C.notifications.testSecondes} secondes ⏳`);
}
function changerRappel(cle, defaut) {
  const champ = document.getElementById(cle === 'notifMatin' ? 'notif-matin' : 'notif-soir');
  const interrupteur = document.getElementById(cle === 'notifMatin' ? 'notif-matin-actif' : 'notif-soir-actif');
  // Avant la bascule du jour (4 h), le rappel tomberait sur le mauvais jour : on garde l'heure d'avant
  if (interrupteur.checked && champ.value && !N.heureValide(champ.value, C)) {
    champ.value = N.heureValide(etat.reglages[cle], C) ? etat.reglages[cle] : defaut;
    toast(`Les rappels se règlent entre ${N.heureMin(C)} et ${N.heureMax} 🕓`);
  }
  const heure = N.heureValide(champ.value, C) ? champ.value : defaut;
  modifier(x => { x.reglages[cle] = interrupteur.checked ? heure : ''; });
  if (interrupteur.checked) proposerRappels(false).catch(console.error);
}

/* ===== AGENDA (iCal) =====
 * Téléchargement par CapacitorHttp.get() EXPLICITE (pas activé globalement : ça casserait le chargeur de Phaser).
 * L'adresse secrète n'est jamais affichée, journalisée ni exportée. Les erreurs n'affichent jamais l'adresse.
 */
let agendaEnCours = false;
let agendaHorsLigne = false;            // dernier essai sans réponse : on montre la version gardée, avec sa date
async function telechargerAgenda(adresse) {
  if (!NATIF) {   // navigateur (tests) : CORS bloque ; « debug_ics » = texte d'un agenda d'exemple
    try { const d = localStorage.getItem('debug_ics'); if (d) return d; } catch {}
    throw refus('L\'agenda se lit dans l\'appli installée sur le téléphone.');
  }
  const http = PL.CapacitorHttp;
  if (!http) throw refus('Lecture de l\'agenda indisponible sur cet appareil.');
  const ms = C.calendrier.delaiSecondes * 1000;
  let r;
  try { r = await http.get({ url: adresse, responseType: 'text', connectTimeout: ms, readTimeout: ms }); }
  catch { throw refus('Pas de connexion pour l\'instant : la dernière version gardée reste affichée.'); }
  const txt = String(r?.data ?? '');
  if (r.status !== 200 || !Cal.estAgenda(txt)) throw refus('Cet agenda ne s\'ouvre pas : vérifie que c\'est bien l\'adresse secrète au format iCal.');
  return txt;
}
function lireAgenda(txt) {
  try { return Cal.construireCache(txt, maintenant(), C, window.ICAL); }
  catch { throw refus('Cet agenda est illisible : vérifie l\'adresse (format iCal).'); }
}
async function actualiserAgenda(silencieux) {
  const adresse = etat?.reglages.icsUrl;
  if (!adresse || agendaEnCours) return;
  agendaEnCours = true;
  rendreAgenda();
  try {
    const cache = lireAgenda(await telechargerAgenda(adresse));
    agendaHorsLigne = false;
    // Agenda retiré ou changé pendant le téléchargement : ce cache est celui de l'ancienne adresse, on le jette
    if (etat?.reglages.icsUrl !== adresse) return;
    modifier(x => { x.reglages.calendrierCache = cache; });
    if (!silencieux) toast(`Agenda à jour 📅 ${cache.evenements.length} événements`);
  } catch (x) {
    console.error('Agenda :', x?.name || 'erreur');          // jamais le message brut (il pourrait contenir l'adresse)
    agendaHorsLigne = true;
    if (!silencieux) toast(x.pourUtilisateur || 'Agenda indisponible pour l\'instant.');
  } finally {
    agendaEnCours = false;
    rendreAgenda();
  }
}
async function relierAgenda() {
  const champ = document.getElementById('agenda-adresse');
  const erreur = document.getElementById('agenda-erreur');
  const adresse = Cal.nettoyerAdresse(champ.value);
  if (!adresse) { erreur.textContent = 'Colle l\'adresse complète : elle commence par https:// (ou webcal://).'; return; }
  erreur.textContent = '';
  const bouton = document.getElementById('btn-agenda-enregistrer');
  bouton.disabled = true; bouton.textContent = 'Lecture…';
  try {
    const cache = lireAgenda(await telechargerAgenda(adresse));
    agendaHorsLigne = false;
    if (!modifier(x => { x.reglages.icsUrl = adresse; x.reglages.calendrierCache = cache; })) return;
    champ.value = '';
    toast(`Agenda relié 📅 ${cache.evenements.length} événements`);
  } catch (x) {
    console.error('Agenda :', x?.name || 'erreur');
    erreur.textContent = x.pourUtilisateur || 'Cet agenda ne s\'ouvre pas pour l\'instant.';
  } finally {
    bouton.disabled = false;
    rendreAgenda();
  }
}
async function retirerAgenda() {
  const ok = await dialogue('Retirer l\'agenda ?', '<p>L\'adresse et les événements gardés sont effacés de ce téléphone. Ton Google Agenda, lui, ne change pas.</p>',
    [{ texte: 'Annuler', valeur: false }, { texte: 'Retirer', valeur: true, principal: true }]);
  if (!ok) return;
  agendaHorsLigne = false;
  modifier(x => { x.reglages.icsUrl = ''; x.reglages.calendrierCache = null; });
  toast('Agenda retiré');
}
function heureCourte(iso) {
  return new Date(iso).toLocaleTimeString('fr-BE', { timeZone: C.jour.fuseau, hour: '2-digit', minute: '2-digit' });
}
function etatAgenda() {
  const r = etat.reglages, cache = r.calendrierCache;
  if (!r.icsUrl) return 'Pas encore relié';
  if (agendaEnCours) return 'Actualisation…';
  if (!cache?.chargeLe) return 'Relié';
  const charge = new Date(cache.chargeLe);
  const memeJour = jourCivil(charge) === jourCivil(maintenant());
  const quand = memeJour ? 'à ' + heureCourte(cache.chargeLe) : 'le ' + charge.toLocaleDateString('fr-BE', { timeZone: C.jour.fuseau, day: 'numeric', month: 'numeric' });
  return (agendaHorsLigne ? 'Hors ligne — version gardée ' : 'Mis à jour ') + quand;
}
function rendreAgenda() {
  if (!etat) return;
  const relie = !!etat.reglages.icsUrl;
  document.getElementById('info-agenda').textContent = etatAgenda();
  document.getElementById('agenda-relie').hidden = !relie;
  document.getElementById('agenda-etat').textContent = etatAgenda();
  const bouton = document.getElementById('btn-agenda-enregistrer');
  if (!bouton.disabled) bouton.textContent = relie ? 'Changer d\'adresse' : 'Relier mon agenda';
  document.getElementById('agenda-adresse').placeholder = relie ? 'Adresse enregistrée ✅ (colle-en une autre pour changer)' : 'https://calendar.google.com/…/basic.ics';
  if (!relie) return;
  // Aperçu : les prochains jours, groupés par jour
  const aujourdhui = jourActuel();
  const blocs = [];
  for (let i = 0; i < C.calendrier.apercuJours; i++) {
    const jour = J.ajouterJours(aujourdhui, i);
    const evs = Cal.duJour(etat.reglages.calendrierCache, jour, C);
    if (!evs.length) continue;
    blocs.push(el('div', { class: 'agenda-jour' }, i === 0 ? 'Aujourd\'hui' : i === 1 ? 'Demain' : dateEcheanceLongue(jour).replace(/ \d{4}$/, '')));
    for (const ev of evs) blocs.push(el('div', { class: 'agenda-ev' },
      el('span', { class: 'agenda-heure' }, ev.journee ? 'journée' : heureCourte(ev.debut)),
      el('span', { class: 'agenda-titre' }, ev.titre, Cal.estExamenMarque(ev, etat.agenda?.examens) ? el('span', { class: 'etiquette-examen' }, ' 🎯 examen') : '', ev.lieu ? el('small', {}, ev.lieu) : '')));
  }
  document.getElementById('agenda-apercu').replaceChildren(...(blocs.length ? blocs : [el('p', { class: 'sauvegardes-vide' }, 'Rien dans ton agenda ces prochains jours. Profite ! 🌿')]));
}

/* ===== RÉGLAGES : sons, vibrations, rappels, rappel d'export ===== */
let rappelExportCache = false;    // « ✕ » : caché jusqu'à la prochaine ouverture de l'appli (jamais d'insistance)
function rendreReglages() {
  document.getElementById('reglage-sons').checked = etat.reglages.sons !== false;
  document.getElementById('reglage-vibrations').checked = etat.reglages.vibrations !== false;
  for (const [cle, id, defaut] of [['notifMatin', 'notif-matin', C.notifications.matinDefaut], ['notifSoir', 'notif-soir', C.notifications.soirDefaut]]) {
    const actif = N.heureValide(etat.reglages[cle], C);
    const champ = document.getElementById(id);
    champ.min = N.heureMin(C); champ.max = N.heureMax;    // tirés de config.js (la bascule du jour)
    if (document.activeElement !== champ) champ.value = actif ? etat.reglages[cle] : defaut;
    champ.disabled = !actif;
    document.getElementById(id + '-actif').checked = actif;
  }
  rendreAgenda();
  document.getElementById('rappel-export').hidden = rappelExportCache || !S.rappelExport(etat, maintenant().toISOString(), C);
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
  remplacerEtat(r.etat, { redessiner: false });
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
    remplacerEtat(d.etat, { redessiner: false });
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
  vibrer('LIGHT');
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
    r = M.saisir(e, tacheId, quantite, { id: S.nouvelId(), horodatage: maintenant().toISOString(), jour: jourActuel(), rng: hasard() }, C);
    if (!r.ok) throw refus(r.erreur);
  });
  if (!ok) return false;
  retourGain(depart, r, avant, r.terminee ? 'Bien joué ✅' : `${Math.round(r.progression * 100)} % fait ✨`);
  return true;
}
// Retour immédiat après un gain (tâche cochée, « J'y étais ») : le gain s'envole vers son compteur, vibration, son, Annuler
function retourGain(depart, r, avant, texteFini) {
  animerGain(depart, r, avant);
  // Gradation : coche (léger) < tâche finie (pièces) < coffre (moyen) < niveau (fête)
  vibrer(r.terminee ? 'MEDIUM' : 'LIGHT');
  window.Sons?.jouer(r.terminee ? 'pieces' : 'valide');
  let texte = texteFini;
  const coup = coupAuBoss(avant, etat);
  if (coup) texte = `⚔️ ${nombre(coup.degats)} dégâts à « ${coup.titre} » !` + (coup.vaincu ? ' Vaincu 🏆' : '');
  if (r.defi) texte = 'Tempête passée, le hameau a tenu bon ! ' + listeRessources(r.defi) + ' 🌈';
  if (r.coffre) texte = 'Un coffre ! 🎁';
  if (r.niveauxGagnes) texte = `Niveau ${etat.joueur.niveau} atteint ! 🎉`;
  proposerAnnulation(texte, avant);
  // Les grands moments arrivent juste après le « +25 » qui s'envole
  if (r.coffre) celebrer({ type: 'coffre', coffre: r.coffre });
  if (r.niveauxGagnes) celebrer({ type: 'niveau', niveau: etat.joueur.niveau, gagnes: r.niveauxGagnes });
}

/* ===== SURPRISE DU JOUR (étape 16) : marchand, tempête (défi), fête — toujours un bonus ===== */
const nomRes = (id) => C.ressources.find(r => r.id === id);
function listeRessources(o) { return Object.entries(o).map(([r, q]) => `+${nombre(q)} ${nomRes(r)?.emoji || ''}`).join(' '); }
// Un tirage par jour logique (au démarrage et quand la journée change) ; hasard injecté (debug_hasard dans le navigateur)
function tirerSurprise() {
  if (!etat || document.body.classList.contains('bloque')) return;
  const jour = jourActuel();
  if (Sur.aTirer(etat, jour)) modifier(e => { Sur.tirer(e, jour, C, hasard()); });
}
function rendreSurprise() {
  const s = Sur.duJour(etat, jourActuel());
  const zone = document.getElementById('surprise');
  zone.hidden = !s || s.fini === 'decline';
  if (zone.hidden) return;
  let icone = '', titre = '', detail = '', jauge = null, boutons = false;
  if (s.type === 'marchand') {
    icone = '🧳';
    if (s.fini === 'echange') { titre = 'Bonne affaire !'; detail = `Le marchand t'a laissé ${nombre(s.quantiteRecue)} ${nomRes(s.recoit).emoji}. À la prochaine !`; }
    else {
      titre = 'Un marchand ambulant passe au hameau';
      detail = `Il t'offre ${nombre(s.quantiteRecue)} ${nomRes(s.recoit).emoji} ${nomRes(s.recoit).nom.toLowerCase()} contre ${nombre(s.quantiteDonnee)} ${nomRes(s.donne).emoji} ${nomRes(s.donne).nom.toLowerCase()}.`;
      boutons = true;
    }
  } else if (s.type === 'tempete') {
    const fait = Math.min(s.cible, Sur.avancement(etat, s.jour));
    if (s.fini) { icone = '🌈'; titre = 'Le hameau a tenu bon !'; detail = 'Récompense reçue : ' + listeRessources(s.recompense); }
    else {
      icone = '⛈️'; titre = 'Une tempête approche !';
      detail = `Termine ${s.cible} tâches aujourd'hui pour mettre le hameau à l'abri : ${listeRessources(s.recompense)} (${fait} / ${s.cible})`;
      jauge = fait / s.cible;
    }
  } else if (s.type === 'fete') {
    const f = C.familles.find(x => x.id === s.famille);
    icone = '🎉'; titre = 'Jour de fête au hameau !';
    detail = `Les tâches ${f.emoji} ${f.nom} rapportent +${Math.round(s.bonus * 100)} % aujourd'hui.`;
  }
  document.getElementById('surprise-icone').textContent = icone;
  document.getElementById('surprise-titre').textContent = titre;
  document.getElementById('surprise-detail').textContent = detail;
  document.getElementById('surprise-jauge-zone').hidden = jauge === null;
  if (jauge !== null) document.getElementById('surprise-jauge').style.width = `${Math.round(jauge * 100)}%`;
  document.getElementById('surprise-boutons').hidden = !boutons;
}
function echangerMarchand() {
  const jour = jourActuel();
  const ok = modifier(e => { const r = Sur.echanger(e, jour); if (!r.ok) throw refus(r.erreur); });
  if (!ok) return;
  window.Sons?.jouer('pieces');
  vibrer('MEDIUM');
  toast('Échange fait 🤝');
}

/* ===== BILAN DE LA SEMAINE (étape 18) =====
 * Graphiques en SVG fait main (aucune bibliothèque en ligne). Une seule teinte (or) : la couleur ne porte
 * jamais seule l'information, chaque barre est étiquetée ; un tableau donne les mêmes chiffres.
 */
let decalageBilan = 0;                    // 0 = cette semaine, -1 = semaine dernière
let carteBilanCachee = false;             // ✕ sur la carte du lundi : jusqu'à la prochaine ouverture
const NS_SVG = 'http://www.w3.org/2000/svg';
function svg(balise, attributs = {}, ...enfants) {
  const n = document.createElementNS(NS_SVG, balise);
  for (const [k, v] of Object.entries(attributs)) n.setAttribute(k, v);
  n.append(...enfants.filter(x => x !== '' && x != null));
  return n;
}
const JOURS_LONGS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
function bilanAffiche() {
  return Bilan.semaine(etat, J.ajouterJours(Bilan.lundi(jourActuel()), 7 * decalageBilan), C);
}
function rendreBilan() {
  const b = bilanAffiche();
  document.querySelectorAll('#bilan-semaine [data-semaine]').forEach(x => x.setAttribute('aria-checked', String(+x.dataset.semaine === decalageBilan)));
  const court = (j) => dateEcheanceLongue(j).replace(/ \d{4}$/, '');
  document.getElementById('bilan-dates').textContent = `Du ${court(b.lundi)} au ${court(b.dimanche)}`;
  document.getElementById('bilan-accroche').textContent = Bilan.accroche(b);
  document.getElementById('bilan-tuiles').replaceChildren(...[[nombre(b.xp), 'XP gagnée'], [nombre(b.taches), b.taches > 1 ? 'tâches finies' : 'tâche finie'], [`${b.joursActifs}/7`, 'jours actifs']]
    .map(([v, l]) => el('div', { class: 'bilan-tuile' }, el('b', {}, v), el('small', {}, l))));
  rendreGrapheJours(b);
  // Familles : barres horizontales triées, nom et valeur écrits sur chaque ligne
  const max = Math.max(1, ...b.familles.map(f => f.xp));
  document.getElementById('bilan-familles').replaceChildren(...(b.familles.length ? b.familles.map(f => {
    const fam = C.familles.find(x => x.id === f.id);
    const barre = el('i', {});
    barre.style.width = `${Math.max(2, Math.round((f.xp / max) * 100))}%`;
    return el('div', { class: 'bilan-famille' }, el('span', {}, `${fam.emoji} ${fam.nom}`), el('span', {}, barre), el('b', {}, nombre(f.xp)));
  }) : [el('p', { class: 'bilan-vide' }, 'Rien encore cette semaine : la première tâche ouvrira le bal ✨')]));
  // Tableau (mêmes chiffres, pour tout le monde)
  document.getElementById('bilan-table').replaceChildren(
    el('thead', {}, el('tr', {}, el('th', {}, 'Jour'), el('th', {}, 'XP'), el('th', {}, 'Tâches'))),
    el('tbody', {}, ...b.jours.map((j, i) => el('tr', {}, el('td', {}, `${JOURS_LONGS[i]} ${+j.jour.slice(8)}`), el('td', {}, nombre(j.xp)), el('td', {}, nombre(j.taches))))));
}
function rendreGrapheJours(b) {
  const L = 336, H = 170, bas = 140, haut = 22, pas = L / 7, largeur = pas - 10;   // 2 px d'écart minimum entre barres
  const max = Math.max(1, ...b.jours.map(j => j.xp));
  const meilleur = b.meilleurJour?.jour;
  const info = document.getElementById('bilan-info');
  info.textContent = b.xp ? 'Touche un jour pour le détail.' : '';
  const g = svg('svg', { viewBox: `0 0 ${L} ${H}`, role: 'img', 'aria-label': 'XP gagnée chaque jour de la semaine' });
  g.append(svg('line', { class: 'axe', x1: 0, x2: L, y1: bas + .5, y2: bas + .5 }));
  b.jours.forEach((j, i) => {
    const x = i * pas + (pas - largeur) / 2;
    const h = j.xp ? Math.max(4, Math.round(((bas - haut) * j.xp) / max)) : 0;
    const r = Math.min(4, largeur / 2, h);
    // Barre à bouts arrondis en haut seulement (posée sur l'axe)
    const d = h ? `M${x},${bas} V${bas - h + r} Q${x},${bas - h} ${x + r},${bas - h} H${x + largeur - r} Q${x + largeur},${bas - h} ${x + largeur},${bas - h + r} V${bas} Z` : '';
    const groupe = svg('g', { 'data-jour': j.jour, tabindex: '0', role: 'button', 'aria-label': `${JOURS_LONGS[i]} : ${j.xp} XP, ${j.taches} tâches` },
      svg('rect', { class: 'colonne', x: i * pas, y: 0, width: pas, height: H }),
      d ? svg('path', { class: 'barre', d }) : '',
      svg('text', { x: x + largeur / 2, y: bas + 18, 'text-anchor': 'middle' }, JOURS_COURTS[i]),
      j.jour === meilleur && j.xp ? svg('text', { class: 'valeur', x: x + largeur / 2, y: bas - h - 6, 'text-anchor': 'middle' }, nombre(j.xp)) : '');
    const montrer = () => {
      g.querySelectorAll('.choisie').forEach(n => n.classList.remove('choisie'));
      groupe.classList.add('choisie');
      info.textContent = `${JOURS_LONGS[i][0].toUpperCase() + JOURS_LONGS[i].slice(1)} ${+j.jour.slice(8)} : ${nombre(j.xp)} XP · ${j.taches} tâche${j.taches > 1 ? 's' : ''}`;
    };
    groupe.addEventListener('click', montrer);
    groupe.addEventListener('mouseenter', montrer);
    groupe.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); montrer(); } });
    g.append(groupe);
  });
  document.getElementById('bilan-jours').replaceChildren(g);
}
// Le lundi : carte « Ton bilan est prêt » si la semaine passée a vu au moins une tâche
function rendreCarteBilan() {
  const jour = jourActuel();
  const passee = J.jourIso(jour) === 1 && !carteBilanCachee ? Bilan.semaine(etat, J.ajouterJours(jour, -7), C) : null;
  document.getElementById('carte-bilan').hidden = !passee?.xp;
  if (passee?.xp) document.getElementById('carte-bilan-texte').textContent = `${nombre(passee.xp)} XP la semaine dernière. Un coup d'œil ?`;
}

/* ===== EXAMENS = BOSS (étape 17) =====
 * Dégâts recalculés depuis le journal (boss.js) : rien à stocker, toujours juste après un Annuler.
 */
function coupAuBoss(avant, apres) {
  if (!avant || !apres?.reglages.calendrierCache) return null;
  const a = new Map(Boss.etats(avant, C).map(b => [b.cle, b.degats]));
  const touche = Boss.etats(apres, C).find(b => b.degats > (a.get(b.cle) || 0));
  return touche ? { titre: touche.titre, degats: touche.degats - (a.get(touche.cle) || 0), vaincu: touche.vaincu } : null;
}
function rendreBoss() {
  const zone = document.getElementById('boss-zone');
  const jour = jourActuel(), instant = maintenant();
  const liste = etat.reglages.icsUrl ? Boss.actifs(etat, jour, C).filter(b => !b.recue).slice(0, 3) : [];
  zone.hidden = !liste.length;
  if (zone.hidden) return;
  const emojiRev = T.categorie(etat, C.boss.categories[0])?.emoji || '📚';
  document.getElementById('liste-boss').replaceChildren(...liste.map(b => {
    const quand = b.dans > 1 ? `dans ${b.dans} jours` : b.dans === 1 ? 'demain' : b.dans === 0 ? 'Jour J !' : 'passé 👏';
    const ouverte = Boss.recompenseOuverte(b, instant, jour);
    const detail = b.vaincu ? 'Vaincu ! Le jour J peut venir 🏆'
      : ouverte ? 'Bravo pour l\'examen : chaque révision a compté.'
      : `Chaque révision ${emojiRev} lui fait des dégâts.`;
    return el('div', { class: 'boss' + (b.vaincu ? ' vaincu' : '') },
      el('div', { class: 'boss-tete' }, el('b', {}, b.titre), el('span', { class: 'boss-quand' }, quand)),
      el('span', { class: 'boss-pv', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(b.pvMax), 'aria-valuenow': String(b.pv) },
        Object.assign(el('i', {}), { style: `width: ${Math.round((b.pv / b.pvMax) * 100)}%` })),
      el('span', { class: 'boss-detail' }, `${nombre(b.pv)} / ${nombre(b.pvMax)} PV · ${detail}`),
      ouverte ? el('button', { type: 'button', class: 'bouton principal', 'data-recompense-boss': b.cle }, 'Récupérer ta récompense ' + listeRessources(Boss.recompense(b, C))) : '');
  }));
}
function recompenseBoss(cle) {
  const jour = jourActuel(), instant = maintenant();
  let r;
  const ok = modifier(e => { r = Boss.recuperer(e, cle, instant, jour, C); if (!r.ok) throw refus(r.erreur); });
  if (!ok) return;
  window.Sons?.jouer('fanfare');
  vibrer('HEAVY');
  toast((r.vaincu ? 'Boss vaincu ! ' : 'Bien joué pour l\'examen ! ') + listeRessources(r.recompense) + ' 🏆');
}

/* ===== COURS DU JOUR (étape 15b) =====
 * Événements à heure fixe du jour logique, lus dans le cache de l'agenda (marche hors ligne).
 * « J'y étais » dès l'heure de début, une fois par occurrence → gains de la catégorie Cours (📜 Savoir).
 */
const coursAffiches = new Map();         // cle → événement (pour les boutons)
function rendreCours() {
  const zone = document.getElementById('cours-jour');
  const cache = etat.reglages.calendrierCache;
  const jour = jourActuel();
  const cours = Cal.coursDuJour(cache, jour, C);
  const journees = Cal.journeesDuJour(cache, jour, C);
  zone.hidden = !etat.reglages.icsUrl || !(cours.length || journees.length);
  if (zone.hidden) return;
  const instant = maintenant();
  const { categorie, mult, virtuelle } = M.gainCours(etat, jour, C);
  const gain = Math.round(M.brut(virtuelle, C, mult.total));
  const emoji = C.ressources.find(r => r.id === M.ressourceDe(categorie, C))?.emoji || '';
  coursAffiches.clear();
  const lignes = journees.map(ev => el('p', { class: 'cours-journee' }, '📌 ' + ev.titre));
  for (const ev of cours) {
    const cle = Cal.cle(ev);
    coursAffiches.set(cle, ev);
    const examen = Cal.estExamenMarque(ev, etat.agenda?.examens);
    const present = M.dejaPresent(etat.journal, cle);
    const action = present ? el('span', { class: 'cours-fait' }, '✅ Noté')
      : Cal.commence(ev, instant) ? el('button', { type: 'button', class: 'bouton principal', 'data-jy-etais': cle }, `J'y étais +${gain} ${emoji}`)
      : el('span', { class: 'cours-attente' }, 'dès ' + heureCourte(ev.debut));
    const details = [ev.lieu, examen ? '🎯 examen' : ''].filter(Boolean).join(' · ');
    lignes.push(el('div', { class: 'cours' + (examen ? ' examen' : '') + (present ? ' fait' : '') },
      el('div', { class: 'cours-heure' }, el('b', {}, heureCourte(ev.debut)), ev.fin ? el('small', {}, heureCourte(ev.fin)) : ''),
      el('button', { type: 'button', class: 'cours-texte', 'data-examen-cle': cle, title: 'Examen ou pas ?' }, ev.titre, details ? el('small', {}, details) : ''),
      el('div', { class: 'cours-action' }, action)));
  }
  document.getElementById('liste-cours').replaceChildren(...lignes);
}
function jYEtais(cle) {
  const ev = coursAffiches.get(cle);
  if (!ev) return;
  const depart = [...document.querySelectorAll('[data-jy-etais]')].find(b => b.dataset.jyEtais === cle)?.getBoundingClientRect();
  const avant = etat;
  let r;
  const ok = modifier(e => {
    r = M.jYEtais(e, { cle, titre: ev.titre, debut: ev.debut }, { id: S.nouvelId(), horodatage: maintenant().toISOString(), jour: jourActuel(), rng: hasard() }, C);
    if (!r.ok) throw refus(r.erreur);
  });
  if (ok) retourGain(depart, r, avant, 'Présence notée 🎓');
}
// Toucher le titre : marquer à la main (examen ou pas), prioritaire sur le titre
async function marquerExamen(cle) {
  const ev = coursAffiches.get(cle);
  if (!ev) return;
  const choix = await dialogue(ev.titre, '<p>Est-ce un examen ? 🎯</p><p class="discret">Hameau le devine avec le titre (examen, exam, interro, test) ; ton choix passe avant.</p>',
    [{ texte: 'Selon le titre', valeur: 'auto' }, { texte: 'Pas un examen', valeur: 'non' }, { texte: 'C\'est un examen', valeur: 'oui', principal: true }]);
  if (!choix) return;
  modifier(x => {
    if (choix === 'auto') delete x.agenda.examens[cle];
    else x.agenda.examens[cle] = choix === 'oui';
  });
}

/* ===== PROCHAINE ACTION (étape 7) ===== */
const ignoreesProchaine = new Set();      // « Pas maintenant » : en mémoire seulement (pas sauvegardé)
let prochaineId = null;
function rendreProchaine() {
  const jour = jourActuel();
  const candidats = M.candidatsProchaineAction(etat, jour, J.jourIso(jour));
  document.getElementById('prochaine').hidden = !candidats.length;
  if (!candidats.length) fermerProchaine();
  else if (prochaineId && !candidats.some(t => t.id === prochaineId)) montrerProchaine();   // faite entre-temps → suivante
}
function montrerProchaine() {
  const jour = jourActuel();
  let t = M.prochaineAction(etat, jour, J.jourIso(jour), ignoreesProchaine);
  if (!t && ignoreesProchaine.size) { ignoreesProchaine.clear(); t = M.prochaineAction(etat, jour, J.jourIso(jour)); }   // tour complet → on recommence
  if (!t) { fermerProchaine(); return; }
  prochaineId = t.id;
  const cat = T.categorie(etat, t.categorieId);
  const res = M.ressourceDe(cat, C);
  const bilan = M.bilan(t, etat.journal, jour);
  const gain = M.gainRestant(t, bilan, C, M.multiplicateurs(t, etat, C, jour, cat?.familleId).total);
  const details = [];
  if (t.echeance) details.push('Pour le ' + dateEcheance(t.echeance));
  if (t.objectif) details.push(`${nombre(Math.min(bilan.somme, t.objectif.cible))} / ${nombre(t.objectif.cible)} ${t.objectif.unite}`);
  const carte = el('div', { class: 'prochaine-contenu' },
    el('span', { class: 'prochaine-emoji', 'aria-hidden': 'true' }, cat?.emoji ?? '•'),
    el('span', { class: 'tache-texte' }, el('b', {}, t.nom), details.length ? el('small', {}, details.join(' · ')) : ''),
    el('span', { class: 'gain' }, `+${gain} ${res ? C.ressources.find(r => r.id === res).emoji : 'XP'}`));
  carte.style.setProperty('--famille', cat ? `var(--${cat.familleId})` : '');
  document.getElementById('prochaine-tache').replaceChildren(carte);
  document.getElementById('prochaine-carte').hidden = false;
  document.getElementById('btn-prochaine').hidden = true;
  document.getElementById('btn-c-est-fait').textContent = t.objectif ? '➕ J\'avance' : '✅ C\'est fait';
}
function fermerProchaine() {
  prochaineId = null;
  document.getElementById('prochaine-carte').hidden = true;
  document.getElementById('btn-prochaine').hidden = false;
}

/* ===== JOURS : rattrapage, retour d'absence, veille, pause (étape 6) ===== */
// Applique le rattrapage à l'état ; renvoie le message de retour à afficher (ou null).
// Rien de neuf (cas de presque chaque minute) → l'état n'est pas remplacé : « Annuler » reste possible.
function rattraperJours({ redessiner = true } = {}) {
  try {
    const r = Jours.rattraper(etat, maintenant(), C, hasard());
    if (!r.change) return null;
    remplacerEtat(r.etat, { redessiner });
    const nomBatiment = (id) => {
      const b = etat.village?.batiments.find(x => x.id === id);
      const def = b && window.CATALOGUE_VILLAGE?.batiments[b.type];
      return def ? `${def.emoji} ${def.nom}` : 'un bâtiment';
    };
    return Jours.messageRetour(r, etat, C, nomBatiment);
  } catch (x) { console.error('Rattrapage impossible', x); return null; }
}
function afficherRetour(m) {
  return dialogue(m.titre, m.lignes.map(l => `<p>${echapper(l)}</p>`).join(''), [{ texte: 'C\'est parti', valeur: true, principal: true }]);
}

// Le matin, les quotidiennes d'hier pas encore cochées (on peut encore les noter jusqu'à midi)
function rendreHier() {
  const zone = document.getElementById('hier');
  const m = maintenant();
  if (!Jours.hierOuvert(m, C) || Jours.enPause(etat.joueur, J.ajouterJours(jourActuel(), -1))) { zone.hidden = true; return; }
  const hier = J.ajouterJours(jourActuel(), -1);
  const restantes = Jours.quotidiennesPrevues(etat, hier, C).filter(t => M.progression(t, etat.journal, hier) < 1);
  zone.hidden = !restantes.length;
  document.getElementById('liste-hier').replaceChildren(...restantes.map(t => {
    const cat = T.categorie(etat, t.categorieId);
    const ligne = el('div', { class: 'tache hier-tache' },
      el('button', { class: 'case', 'data-hier': t.id, 'aria-label': 'Fait hier : ' + t.nom }),
      el('span', { class: 'tache-corps' }, el('span', { class: 'tache-emoji', 'aria-hidden': 'true' }, cat?.emoji ?? '•'),
        el('span', { class: 'tache-texte' }, el('span', { class: 'tache-nom' }, t.nom), el('small', {}, 'Fait hier ? Touche la case'))));
    ligne.style.setProperty('--famille', cat ? `var(--${cat.familleId})` : '');
    return ligne;
  }));
}
function cocherHier(tacheId) {
  const hier = J.ajouterJours(jourActuel(), -1);
  if (!Jours.hierOuvert(maintenant(), C)) return toast('Hier est déjà bouclé : place à aujourd\'hui ✨');
  const avant = etat;
  let r;
  const ok = modifier(e => {
    r = M.saisir(e, tacheId, null, { id: S.nouvelId(), horodatage: maintenant().toISOString(), jour: hier, rng: hasard(), veille: true }, C);
    if (!r.ok) throw refus(r.erreur);
  });
  if (!ok) return;
  vibrer('LIGHT');
  window.Sons?.jouer('pieces');
  proposerAnnulation(`Noté pour hier ✅ +${r.gain} XP`, avant);
  if (r.coffre) celebrer({ type: 'coffre', coffre: r.coffre });
  if (r.niveauxGagnes) celebrer({ type: 'niveau', niveau: etat.joueur.niveau, gagnes: r.niveauxGagnes });
}

// Pause : depuis aujourd'hui ou jusqu'à 7 jours en arrière ; reprise à tout moment
function rendrePause() {
  const p = etat.joueur.pause;
  const active = !!p?.actif && !p.jusqua;
  document.getElementById('bandeau-pause').hidden = !active;
  if (active) document.getElementById('pause-depuis').textContent = dateEcheance(p.depuis);
  document.getElementById('info-pause').textContent = active ? `En pause depuis le ${dateEcheance(p.depuis)} · touche pour reprendre`
    : 'Malade, blocus, vacances : aucune pénalité, série gelée';
}
async function gererPause() {
  const p = etat.joueur.pause;
  if (p?.actif && !p.jusqua) return reprendre();
  const auj = jourActuel();
  const options = Array.from({ length: C.pause.retroJoursMax + 1 }, (_, i) => {
    const j = J.ajouterJours(auj, -i);
    return `<option value="${j}">${i === 0 ? 'Aujourd\'hui' : i === 1 ? 'Hier' : 'Le ' + dateEcheance(j)}</option>`;
  }).join('');
  const ok = await dialogue('⏸️ Mettre en pause',
    '<p>Malade, blocus, vacances : pendant la pause, aucune pénalité et ta série est gelée.</p>' +
    `<label class="etiquette-champ">Depuis quand ?<select class="champ" id="pause-debut">${options}</select></label>` +
    '<p class="discret">Tu peux choisir un jour passé : ce qui a été perdu depuis est rendu.</p>',
    [{ texte: 'Annuler', valeur: false }, { texte: 'Mettre en pause', valeur: true, principal: true }]);
  if (!ok) return;
  const depuis = document.getElementById('pause-debut').value;
  let r;
  if (modifier(e => {
    r = Jours.activerPause(e, depuis, maintenant(), C, hasard());
    if (!r.ok) throw refus(r.erreur);
    Object.assign(e, r.etat);
  })) toast(r.annules ? 'Pause activée ⏸️ Ce qui avait été perdu est rendu.' : 'Pause activée ⏸️ Prends soin de toi.');
}
function reprendre() {
  if (modifier(e => { Object.assign(e, Jours.finirPause(e, maintenant(), C)); })) toast('Bon retour ! ▶️ On reprend en douceur.');
}

/* ===== CÉLÉBRATIONS : coffre et montée de niveau (étape 5b) =====
 * Une à la fois (file d'attente) ; un toucher n'importe où accélère puis ferme ; jamais bloquant.
 */
const fileCelebrations = [];
let celebrationEnCours = null, celebrationPrevue = false;
function celebrer(c) {
  fileCelebrations.push(c);
  // Une seule mise en route à la fois (sinon la 2e célébration écraserait la 1re)
  if (celebrationEnCours || celebrationPrevue) return;
  celebrationPrevue = true;
  setTimeout(() => { celebrationPrevue = false; suivanteCelebration(); }, MOUVEMENT_REDUIT ? 0 : 650);
}
function suivanteCelebration() {
  celebrationEnCours = fileCelebrations.shift() || null;
  const zone = document.getElementById('celebration');
  if (!celebrationEnCours) { zone.hidden = true; zone.replaceChildren(); return; }
  zone.hidden = false;
  zone.className = 'celebration celebration-' + celebrationEnCours.type;   // (pas « coffre » tout court : classe du dessin)
  if (celebrationEnCours.type === 'coffre') ouvrirCoffre(zone, celebrationEnCours.coffre);
  else feteNiveau(zone, celebrationEnCours);
}
function fermerCelebration() {
  if (!celebrationEnCours) return false;
  // 1er toucher pendant l'animation : tout afficher d'un coup ; 2e toucher : fermer
  const zone = document.getElementById('celebration');
  if (!zone.classList.contains('fini')) { zone.classList.add('fini'); return true; }
  celebrationEnCours = null;
  zone.classList.add('sortie');
  setTimeout(suivanteCelebration, MOUVEMENT_REDUIT ? 0 : 220);
  return true;
}

// Coffre en bois cerclé d'or (SVG dessiné ici) : il tremble, s'ouvre, puis les récompenses sortent une à une
const SVG_COFFRE = `<svg class="coffre-svg" viewBox="0 0 120 100" aria-hidden="true">
  <g class="coffre-corps"><rect x="12" y="46" width="96" height="46" rx="6" class="bois"/>
    <rect x="12" y="46" width="96" height="10" class="bois-fonce"/><rect x="26" y="46" width="10" height="46" class="or"/>
    <rect x="84" y="46" width="10" height="46" class="or"/><rect x="52" y="54" width="16" height="20" rx="3" class="or"/>
    <circle cx="60" cy="63" r="3" class="serrure"/></g>
  <g class="coffre-couvercle"><path d="M12 48 Q12 18 60 16 Q108 18 108 48 Z" class="bois"/>
    <path d="M26 46 Q26 22 31 20 L36 20 Q32 24 36 46 Z" class="or"/><path d="M84 46 Q88 24 84 20 L89 20 Q94 22 94 46 Z" class="or"/></g>
</svg>`;
function ouvrirCoffre(zone, coffre) {
  const recompenses = [...Object.entries(coffre.ressources).map(([r, q]) => `+${q} ${C.ressources.find(x => x.id === r).emoji}`),
    `+${coffre.gemmes} 💠`];
  zone.innerHTML = `<div class="celebration-fond"></div><div class="celebration-contenu">
    <p class="celebration-titre">Un coffre !</p>
    <div class="coffre"><div class="rayons" aria-hidden="true"></div>${SVG_COFFRE}</div>
    <div class="recompenses">${recompenses.map((t, i) => `<span style="--i:${i}">${echapper(t)}</span>`).join('')}</div>
    <button type="button" class="bouton principal" data-celebration-fermer>Super !</button></div>`;
  vibrer('MEDIUM');
  window.Sons?.jouer('marteau');
  setTimeout(() => { if (celebrationEnCours?.coffre === coffre) { window.Sons?.jouer('fanfare'); zone.classList.add('ouvert'); } }, MOUVEMENT_REDUIT ? 0 : 520);
}

// Fête de niveau : grand blason, confettis légers (≤ 120), « Continuer »
function feteNiveau(zone, c) {
  const plusieurs = c.gagnes > 1 ? `<p class="celebration-sous">+${c.gagnes} niveaux d'un coup !</p>` : '';
  zone.innerHTML = `<div class="celebration-fond"></div><div class="confettis" aria-hidden="true"></div>
    <div class="celebration-contenu"><p class="celebration-titre">Niveau supérieur !</p>
    <div class="medaillon geant"><span>${c.niveau}</span></div>${plusieurs}
    <p class="celebration-sous">Ton hameau est fier de son chef.</p>
    <button type="button" class="bouton principal" data-celebration-fermer>Continuer</button></div>`;
  if (etat?.reglages?.vibrations !== false) PL.Haptics?.notification?.({ type: 'SUCCESS' })?.catch?.(() => {});
  window.Sons?.jouer('fanfare');
  if (MOUVEMENT_REDUIT) return;
  const couleurs = ['var(--accent)', 'var(--lisere)', 'var(--esprit)', 'var(--corps)', 'var(--creation)', 'var(--social)', 'var(--discipline)', 'var(--repos)'];
  zone.querySelector('.confettis').append(...Array.from({ length: 110 }, (_, i) => {
    const p = document.createElement('i');
    p.style.cssText = `--x:${Math.random() * 100}vw;--d:${(Math.random() * 0.6).toFixed(2)}s;--t:${(1.6 + Math.random() * 1.2).toFixed(2)}s;` +
      `--r:${Math.round(Math.random() * 720 - 360)}deg;--c:${couleurs[i % couleurs.length]};--dx:${Math.round(Math.random() * 120 - 60)}px`;
    return p;
  }));
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
    console.error('Données illisibles :', String(d.erreur).replace(/(https?|webcal):\/\/\S*/gi, '…'));   // le message peut citer le texte (adresse de l'agenda)
    brutIllisible = brut;
    document.body.classList.add('bloque');
    return afficher('recuperation');
  }
  if (d.type === 'trop-recent') {
    document.body.classList.add('bloque');
    return afficher('trop-recent');
  }
  if (d.aMigrer) await sauvegardeAvant('migration-v' + S.SCHEMA, brut);
  remplacerEtat(d.etat, { verifier: false, redessiner: false });   // déjà vérifié par S.decider ; sauvé (migration, 1er lancement)
  const retour = rattraperJours({ redessiner: false });            // jours écoulés depuis la dernière ouverture (avant le 1er affichage)
  afficher('aujourdhui');
  rendre();
  tirerSurprise();                      // surprise du jour (bonus), une fois par jour logique
  sauvegardeHebdo();
  if (retour) await afficherRetour(retour);
  // Rappels : proposés seulement quand il y a déjà une tâche (sinon rien d'utile à rappeler)
  if (etat.taches.some(t => !t.archivee)) await proposerRappels(true).catch(console.error);
  replanifierBientot();
  if (etat.reglages.icsUrl && Cal.aActualiser(etat.reglages.calendrierCache, maintenant(), C)) actualiserAgenda(true);
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
  if (nom === 'bilan' && etat) rendreBilan();
  if (nom === 'sauvegardes') rendreSauvegardes().catch(console.error);
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
  rendreCours();
  rendreCarteBilan();
  rendreBoss();
  rendreSurprise();
  rendreHier();
  rendrePause();
  rendreProchaine();
  rendreReglages();
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

// Écran Perso : le chef, sa série, son moral, ses talents (stats), son hameau, ses 7 derniers jours
function rendrePerso() {
  const j = etat.joueur, besoin = M.xpPourNiveau(j.niveau, C);
  document.getElementById('perso-serie').textContent = j.serie.jours;
  document.getElementById('perso-joker').textContent = j.serie.joker > 0 ? '🃏 joker dispo cette semaine' : '🃏 joker utilisé (revient lundi)';
  document.getElementById('perso-moral').textContent = j.moral;
  document.getElementById('perso-humeur').textContent = j.moral >= C.moral.seuilContent ? '😊' : j.moral >= C.moral.seuilTriste ? '🙂' : '😌';
  document.getElementById('perso-moral-jauge').style.width = `${j.moral}%`;
  rendreHistorique();
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

// Historique simple : les 7 derniers jours logiques (jamais de reproche : un jour vide est un « jour calme »)
function rendreHistorique() {
  const auj = jourActuel();
  const parJour = new Map();
  for (const s of etat.journal) {
    if (!parJour.has(s.jour)) parJour.set(s.jour, []);
    parJour.get(s.jour).push(s);
  }
  document.getElementById('perso-historique').replaceChildren(...Array.from({ length: 7 }, (_, i) => {
    const jour = J.ajouterJours(auj, -i);
    const saisies = parJour.get(jour) || [];
    const xp = saisies.reduce((a, s) => a + (s.gains?.xp || 0), 0);
    const finies = saisies.filter(s => s.progression >= 1).length;
    const emojis = [...new Set(saisies.map(s => s.cours ? '🎓' : T.categorie(etat, etat.taches.find(t => t.id === s.tacheId)?.categorieId)?.emoji).filter(Boolean))].slice(0, 6);
    const nom = i === 0 ? 'Aujourd\'hui' : i === 1 ? 'Hier' : dateJourCourt(jour);
    const pause = Jours.enPause(etat.joueur, jour);
    return el('div', { class: 'histo-jour' + (saisies.length ? '' : ' calme') },
      el('span', { class: 'histo-nom' }, nom),
      el('span', { class: 'histo-emojis', 'aria-hidden': 'true' }, saisies.length ? emojis.join(' ') : pause ? '⏸️' : '🌙'),
      el('span', { class: 'histo-chiffres' }, saisies.length ? `${finies} ✅ · +${nombre(xp)} XP` : pause ? 'En pause' : 'Jour calme'));
  }));
}
function dateJourCourt(jour) {
  const [a, m, j] = jour.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, j)).toLocaleDateString('fr-BE', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' });
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
    const reste = M.gainRestant(t, bilan, C, M.multiplicateurs(t, etat, C, jourActuel(), cat?.familleId).total);
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
  if (celebrationEnCours) { fermerCelebration(); fermerCelebration(); return true; }
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
  const cible = e.target.closest('[data-aller], [data-action], [data-fermer], [data-cocher], [data-hier], [data-saisir], [data-modifier]');
  if (!cible) return;
  if (cible.dataset.aller) return aller(cible.dataset.aller);
  if (cible.dataset.cocher) return cocher(cible.dataset.cocher);
  if (cible.dataset.hier) return cocherHier(cible.dataset.hier);
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
document.getElementById('btn-pause').addEventListener('click', gererPause);
document.getElementById('btn-prochaine').addEventListener('click', () => { window.Sons?.jouer('clic'); montrerProchaine(); });
document.getElementById('btn-pas-maintenant').addEventListener('click', () => { if (prochaineId) ignoreesProchaine.add(prochaineId); montrerProchaine(); });
document.getElementById('btn-c-est-fait').addEventListener('click', () => {
  const t = etat.taches.find(x => x.id === prochaineId);
  if (!t) return fermerProchaine();
  if (t.objectif) return ouvrirSaisie(t.id);
  if (cocher(t.id)) fermerProchaine();
});
document.getElementById('btn-reprendre').addEventListener('click', reprendre);

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
  partagerFichier(`hameau_illisible_${jourCivil(maintenant())}.txt`, S.sansAdresseAgenda(brutIllisible || ''), 'text/plain').catch(console.error));   // jamais l'adresse secrète de l'agenda
document.getElementById('fichier-import').addEventListener('change', (e) => {
  const f = e.target.files?.[0];
  if (f) importerFichier(f).catch(x => { console.error(x); message('Import impossible', String(x.message || x)); });
});

// Réglages : sons, vibrations, sauvegardes, mises à jour, rappel d'export
document.getElementById('reglage-sons').addEventListener('change', (e) => {
  modifier(x => { x.reglages.sons = e.target.checked; });
  if (e.target.checked) window.Sons?.jouer('clic');
});
document.getElementById('reglage-vibrations').addEventListener('change', (e) => {
  modifier(x => { x.reglages.vibrations = e.target.checked; });
  if (e.target.checked) vibrer('LIGHT');
});
document.getElementById('liste-sauvegardes').addEventListener('click', (e) => {
  const b = e.target.closest('[data-restaurer]');
  if (b) restaurerSauvegarde(b.dataset.restaurer);
});
document.getElementById('btn-mises-a-jour').addEventListener('click', () => verifierMisesAJour().catch(x => { console.error(x); message('Réessaie plus tard', String(x.message || x)); }));
document.getElementById('btn-rappel-export').addEventListener('click', exporter);
document.getElementById('btn-rappel-plus-tard').addEventListener('click', () => { rappelExportCache = true; rendreReglages(); });

// Bilan de la semaine
document.getElementById('bilan-semaine').addEventListener('click', (e) => {
  const b = e.target.closest('[data-semaine]');
  if (b) { decalageBilan = +b.dataset.semaine; rendreBilan(); }
});
document.getElementById('btn-carte-bilan').addEventListener('click', () => { decalageBilan = -1; aller('bilan'); });
document.getElementById('btn-carte-bilan-fermer').addEventListener('click', () => { carteBilanCachee = true; rendreCarteBilan(); });

// Examens = boss : récompense le jour J
document.getElementById('liste-boss').addEventListener('click', (e) => {
  const b = e.target.closest('[data-recompense-boss]');
  if (b) recompenseBoss(b.dataset.recompenseBoss);
});

// Surprise du jour : marchand
document.getElementById('btn-surprise-oui').addEventListener('click', echangerMarchand);
document.getElementById('btn-surprise-non').addEventListener('click', () => {
  const jour = jourActuel();
  if (modifier(e => Sur.decliner(e, jour))) toast('Le marchand reprend la route 👋');
});

// Cours du jour : « J'y étais », marquage d'examen
document.getElementById('liste-cours').addEventListener('click', (e) => {
  const b = e.target.closest('[data-jy-etais], [data-examen-cle]');
  if (!b) return;
  if (b.dataset.jyEtais) jYEtais(b.dataset.jyEtais);
  else marquerExamen(b.dataset.examenCle);
});
// Un cours qui commence fait apparaître « J'y étais » sans attendre un autre changement
setInterval(() => { if (etat && !document.body.classList.contains('bloque')) { rendreCours(); rendreBoss(); } }, 60 * 1000);

// Agenda
document.getElementById('form-agenda').addEventListener('submit', (e) => { e.preventDefault(); relierAgenda(); });
document.getElementById('agenda-adresse').addEventListener('input', () => { document.getElementById('agenda-erreur').textContent = ''; });
document.getElementById('btn-agenda-actualiser').addEventListener('click', () => actualiserAgenda(false));
document.getElementById('btn-agenda-retirer').addEventListener('click', retirerAgenda);

// Rappels : heures, interrupteurs, test ; toucher une notification → écran Aujourd'hui
document.getElementById('notif-matin-actif').addEventListener('change', () => changerRappel('notifMatin', C.notifications.matinDefaut));
document.getElementById('notif-soir-actif').addEventListener('change', () => changerRappel('notifSoir', C.notifications.soirDefaut));
document.getElementById('notif-matin').addEventListener('change', () => changerRappel('notifMatin', C.notifications.matinDefaut));
document.getElementById('notif-soir').addEventListener('change', () => changerRappel('notifSoir', C.notifications.soirDefaut));
document.getElementById('btn-tester-notif').addEventListener('click', () => testerRappel().catch(x => { console.error(x); message('Test impossible', String(x.message || x)); }));
PL.LocalNotifications?.addListener('localNotificationActionPerformed', () => {
  if (!etat || document.body.classList.contains('bloque')) return;
  document.querySelectorAll('dialog[open]').forEach(d => d.close());
  historique.length = 1;
  afficher('aujourdhui');
});

// Bouton retour Android : ferme la fenêtre ouverte ou revient à l'écran précédent, sinon quitte
PL.App?.addListener('backButton', () => { if (!retourEcranPrecedent()) PL.App.exitApp(); });

// Nouvelle journée (4 h du matin) ou retour sur l'appli restée ouverte en arrière-plan :
// on redessine pour que les quotidiennes d'hier ne restent pas « faites »
function verifierNouveauJour() {
  if (!etat || document.body.classList.contains('bloque')) return;
  const avant = etat;
  const retour = rattraperJours({ redessiner: false });   // ne sauve que si quelque chose a changé
  tirerSurprise();                                         // nouvelle journée → nouvelle surprise possible (ne change rien sinon)
  if (etat !== avant || jourActuel() !== jourAffiche) rendre();
  if (retour) afficherRetour(retour);
}
PL.App?.addListener('resume', () => {
  verifierNouveauJour(); sauvegardeHebdo(); replanifierBientot();
  if (etat && Cal.aActualiser(etat.reglages.calendrierCache, maintenant(), C)) actualiserAgenda(true);
});
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
function dateEcheanceLongue(jour) {     // « 16 novembre 2026 »
  const [a, m, j] = jour.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, j)).toLocaleDateString('fr-BE', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' });
}
function nombre(n) { return Number(n).toLocaleString('fr-BE'); }
function descriptionResume(r) {
  const s = (n, mot) => `${n} ${mot}${n > 1 ? 's' : ''}`;
  return `Niveau ${r.niveau} · ${s(r.taches, 'tâche')} · ${s(r.saisies, 'saisie')}`;
}
function echapper(t) {
  return String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Toucher une célébration : accélérer puis fermer
document.getElementById('celebration').addEventListener('click', (e) => {
  if (e.target.closest('[data-celebration-fermer]')) { fermerCelebration(); fermerCelebration(); return; }
  fermerCelebration();
});

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
