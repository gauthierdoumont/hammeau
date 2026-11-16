/* stockage.js — Hameau — modèle de données, migrations, vérification, export/import — Créé par Gauthier Doumont
 * Fonctions PURES (pas de localStorage, pas de DOM, pas d'horloge) : testables dans node (tests/donnees.test.js).
 * L'écriture réelle (localStorage + copie native) est dans app.js.
 */
(function (racine) {
  'use strict';
  const S = {};

  S.CLE = 'hameau_v1';   // clé de stockage : ne change jamais
  S.SCHEMA = 3;          // version de la structure des données (2 = village, 3 = agenda : examens marqués à la main)

  /* ===== MODÈLE (schemaVersion 3) =====
   * categories[] {id, nom, emoji, familleId, perso, nbUtilisations}
   * taches[]     {id, nom, categorieId, type, taille, objectif?{cible, unite}, jours?[1-7], echeance?, important?,
   *               incendieApplique, creeLe, termineeLe?, archivee}
   * journal[]    {id, tacheId, horodatage, jour, valeur, progression, gains{xp, ressource, quantite}}
   *              « J'y étais » (v3) : tacheId null + cours (uid|début de l'occurrence) + titre
   * agenda       {examens {cle: true = examen | false = pas un examen}} (v3 ; sans entrée → selon le titre),
   *              recompenses {cle: AAAA-MM-JJ} (facultatif : récompense du boss reçue ce jour-là)
   * joueur       xp = XP gagnée dans le niveau en cours (xpTotal = cumul, ne baisse jamais)
   * etat         {dernierJourTraite, evenements[], surprise?{jour, type, …}} (surprise : champ facultatif, complété)
   * village      {batiments[{id, type, niveau 1-5, x, y (case de grille), endommage, construitLe}], extensions, decorations[]}
   * reglages     icsUrl n'est JAMAIS exportée
   */
  S.etatInitial = function (C) {
    const parFamille = (v) => Object.fromEntries(C.familles.map(f => [f.id, v]));
    return {
      schemaVersion: S.SCHEMA,
      categories: C.categoriesDepart.map(c => ({
        id: c.id, nom: c.nom, emoji: c.emoji, familleId: c.familleId, perso: false, nbUtilisations: 0
      })),
      taches: [],
      journal: [],
      joueur: {
        xp: 0,
        xpTotal: 0,
        niveau: 1,
        stats: { intelligence: 0, force: 0, creativite: 0, charisme: 0, discipline: 0, organisation: 0 },
        ressources: Object.fromEntries(C.ressources.map(r => [r.id, 0])),
        gagneTotal: parFamille(0),
        moral: C.moral.depart,
        serie: { jours: 0, joker: C.serie.jokersParSemaine },
        pause: { actif: false, depuis: null, jusqua: null }
      },
      etat: { dernierJourTraite: null, evenements: [], surprise: null },   // evenements : pénalités récentes, annulables par une pause ; surprise du jour (bonus)
      village: { batiments: [], extensions: 0, decorations: [] },
      agenda: { examens: {}, recompenses: {} },   // recompenses (facultatif, complété) : boss dont la récompense est reçue
      reglages: {
        notifMatin: '08:00',
        notifSoir: '20:00',
        icsUrl: '',
        calendrierCache: null,
        derniereCategorie: null,
        dernierExport: null,
        sons: true,
        vibrations: true
      }
    };
  };

  /* ===== MIGRATIONS =====
   * Une entrée par nouvelle version : MIGRATIONS[2] = e => {...}. Jamais modifiées une fois publiées.
   */
  S.MIGRATIONS = {
    // v2 : le village arrive (vide). Rien d'autre ne change.
    2: e => { e.village ??= { batiments: [], extensions: 0, decorations: [] }; return e; },
    // v3 : l'agenda (examens marqués à la main). Les présences « J'y étais » sont des saisies du journal.
    3: e => { e.agenda ??= { examens: {} }; return e; },
  };

  S.migrer = function (e) {
    let v = e.schemaVersion ?? 1;
    let r = clone(e);
    while (v < S.SCHEMA) {
      r = S.MIGRATIONS[v + 1](clone(r));
      r.schemaVersion = ++v;
    }
    return r;
  };

  /* Remplit seulement ce qui manque (nouveaux champs), ne remplace jamais, garde les champs inconnus */
  S.completer = function (e, C) {
    return fusionProfonde(S.etatInitial(C), e);
  };

  function fusionProfonde(defaut, donnees) {
    if (!estObjet(defaut) || !estObjet(donnees)) return donnees === undefined ? clone(defaut) : donnees;
    const r = { ...donnees };
    for (const k of Object.keys(defaut)) {
      r[k] = k in donnees ? fusionProfonde(defaut[k], donnees[k]) : clone(defaut[k]);
    }
    return r;
  }

  /* ===== VÉRIFICATION =====
   * Lève une erreur si l'état est incohérent : rien n'est alors sauvegardé.
   */
  // C (facultatif) : permet de vérifier les types de bâtiments et le niveau max lus dans config.js
  S.verifier = function (e, C) {
    const err = (m) => { throw new Error('Données incohérentes : ' + m); };
    if (!estObjet(e)) err('pas un objet');
    if (!Number.isInteger(e.schemaVersion) || e.schemaVersion < 1) err('schemaVersion');
    chercherNombresInvalides(e, 'etat', err);
    for (const k of ['categories', 'taches', 'journal']) if (!Array.isArray(e[k])) err(k + ' n\'est pas une liste');
    const j = e.joueur;
    if (!estObjet(j)) err('joueur');
    if (!(j.niveau >= 1)) err('niveau < 1');
    if (!(j.xp >= 0) || !(j.xpTotal >= 0)) err('xp négative');
    const moralMin = C ? C.moral.min : 0, moralMax = C ? C.moral.max : 100;   // bornes de config.js (0-100 sans C)
    if (!(j.moral >= moralMin && j.moral <= moralMax)) err(`moral hors de ${moralMin}-${moralMax}`);
    for (const [r, v] of Object.entries(j.ressources || {})) if (!(v >= 0)) err('ressource négative : ' + r);
    if (e.village !== undefined) {
      if (!estObjet(e.village) || !Array.isArray(e.village.batiments)) err('village');
      const types = new Set();
      for (const b of e.village.batiments) {
        if (!estObjet(b) || typeof b.id !== 'string' || !b.id) err('village : id manquant');
        if (typeof b.type !== 'string' || !b.type || (C && !(b.type in C.batiments.familles))) err('village : type inconnu ' + b.type);
        const max = C ? C.batiments.niveauMax : 99;
        if (!(Number.isInteger(b.niveau) && b.niveau >= 1 && b.niveau <= max)) err('village : niveau ' + b.niveau);
        if (!Number.isInteger(b.x) || !Number.isInteger(b.y)) err('village : case invalide');
        if (types.has(b.type)) err('village : deux ' + b.type);
        types.add(b.type);
      }
      if (!Array.isArray(e.village.decorations)) err('village : décorations');
      const ids = new Set();
      for (const d of e.village.decorations) {
        if (!estObjet(d) || typeof d.id !== 'string' || !d.id || ids.has(d.id)) err('village : décoration sans id ou en double');
        ids.add(d.id);
        if (C && !(d.type in C.decorations)) err('village : décoration inconnue ' + d.type);
        if (!Number.isInteger(d.x) || !Number.isInteger(d.y)) err('village : case de décoration invalide');
      }
      if (!Number.isInteger(e.village.extensions) || e.village.extensions < 0 || (C && e.village.extensions > C.extensions.max)) err('village : extensions');
    }
    if (e.agenda !== undefined) {
      if (!estObjet(e.agenda) || !estObjet(e.agenda.examens)) err('agenda');
      else for (const v of Object.values(e.agenda.examens)) if (typeof v !== 'boolean') err('agenda : marquage d\'examen invalide');
      if (e.agenda.recompenses !== undefined && !estObjet(e.agenda.recompenses)) err('agenda : récompenses');
    }
    const presences = new Set();
    for (const s of e.journal) {
      if (!estObjet(s) || s.cours === undefined) continue;
      if (typeof s.cours !== 'string' || !s.cours || s.tacheId !== null) err('journal : présence à un cours invalide');
      if (presences.has(s.cours)) err('journal : présence notée deux fois');
      presences.add(s.cours);
    }
    for (const k of ['categories', 'taches', 'journal']) {
      const vus = new Set();
      for (const x of e[k]) {
        if (!estObjet(x) || typeof x.id !== 'string' || !x.id) err(k + ' : id manquant');
        if (vus.has(x.id)) err(k + ' : id en double ' + x.id);
        vus.add(x.id);
      }
    }
    return true;
  };

  // NaN et Infinity deviendraient « null » dans le JSON → corruption silencieuse
  function chercherNombresInvalides(v, chemin, err) {
    if (typeof v === 'number' && !Number.isFinite(v)) err('nombre invalide dans ' + chemin);
    if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) chercherNombresInvalides(x, chemin + '.' + k, err);
  }

  /* ===== CHARGEMENT =====
   * Décide quoi faire du texte stocké. Ne fait AUCUNE écriture : app.js n'écrit que si type = 'neuf' ou 'ok'.
   * → {type: 'neuf' | 'illisible' | 'trop-recent' | 'ok', etat?, aMigrer?, erreur?}
   */
  S.decider = function (brut, C) {
    if (brut === null || brut === undefined) return { type: 'neuf', etat: S.etatInitial(C) };
    let e;
    try { e = JSON.parse(brut); } catch (x) { return { type: 'illisible', erreur: x.message }; }
    if (!estObjet(e)) return { type: 'illisible', erreur: 'contenu inattendu' };
    const v = e.schemaVersion ?? 1;
    if (v > S.SCHEMA) return { type: 'trop-recent' };
    try {
      const etat = S.completer(S.migrer(e), C);
      S.verifier(etat, C);
      return { type: 'ok', etat, aMigrer: v < S.SCHEMA };
    } catch (x) {
      return { type: 'illisible', erreur: x.message };
    }
  };

  /* ===== EXPORT ===== */
  S.pourExport = function (etat, exporteLe, appVersion) {
    const { icsUrl, ...reglages } = etat.reglages || {};   // JAMAIS l'adresse iCal (l'export part sur Drive / mail)
    const { meta, ...reste } = etat;
    return { ...reste, reglages, meta: { appli: S.CLE, appVersion: appVersion || null, exporteLe } };
  };

  S.nomExport = (jour) => `hameau_${jour}.json`;

  /* ===== CE QUI RESTE CELUI DU TÉLÉPHONE (import comme restauration) =====
   * - l'adresse iCal (jamais dans un export) ;
   * - les jours déjà traités ici ne sont PAS rejoués : importer ou restaurer une copie d'il y a 10 jours
   *   ne doit jamais faire payer 10 jours de « jours manqués » ;
   * - ni les incendies : une échéance déjà passée sur le téléphone ne rebrûle pas (le rattrapage regarde
   *   toutes les échéances ≤ au jour traité, pas seulement celles du jour).
   */
  function garderDuTelephone(etat, etatActuel) {
    etat.reglages.icsUrl = etatActuel?.reglages?.icsUrl || '';
    const traiteIci = etatActuel?.etat?.dernierJourTraite;
    if (traiteIci && (!etat.etat.dernierJourTraite || etat.etat.dernierJourTraite < traiteIci)) {
      etat.etat.dernierJourTraite = traiteIci;
      for (const t of etat.taches) {
        if (t.type === 'imprevu' && t.important && t.echeance && t.echeance <= traiteIci) t.incendieApplique = true;
      }
    }
    const brules = new Set((etatActuel?.taches || []).filter(t => t.incendieApplique).map(t => t.id));
    for (const t of etat.taches) if (brules.has(t.id)) t.incendieApplique = true;
  }

  /* Texte illisible envoyé « pour analyse » : on retire l'adresse secrète de l'agenda avant de le partager.
   * JSON valide → on supprime reglages.icsUrl ; abîmé (ou au cas où) → la valeur de chaque "icsUrl" est vidée,
   * même coupée en plein milieu (fin du texte).
   */
  S.sansAdresseAgenda = function (texte) {
    let txt = String(texte ?? '');
    try {
      const e = JSON.parse(txt);
      if (estObjet(e?.reglages) && 'icsUrl' in e.reglages) { delete e.reglages.icsUrl; txt = JSON.stringify(e); }
    } catch { /* abîmé : expression régulière ci-dessous */ }
    return txt.replace(/("icsUrl"\s*:\s*)"(?:[^"\\]|\\.)*(?:"|$)/g, '$1""');
  };

  /* ===== IMPORT =====
   * → {ok: true, etat, apercu, actuel} ou {ok: false, message}
   * L'adresse iCal et les jours déjà traités sur l'appareil sont conservés (garderDuTelephone).
   */
  S.analyserImport = function (texte, etatActuel, C) {
    const non = (message) => ({ ok: false, message });
    let e;
    try { e = JSON.parse(texte); } catch { return non('Ce fichier ne vient pas de Hameau.'); }
    if (!estObjet(e)) return non('Ce fichier ne vient pas de Hameau.');
    const signe = e.meta?.appli === S.CLE || (estObjet(e.joueur) && Array.isArray(e.taches));
    if (!signe) return non('Ce fichier ne vient pas de Hameau.');
    if ((e.schemaVersion ?? 1) > S.SCHEMA) return non('Cet export vient d\'une version plus récente : mets d\'abord l\'appli à jour.');
    let etat;
    try {
      const { meta, ...donnees } = e;
      etat = S.completer(S.migrer(donnees), C);
      garderDuTelephone(etat, etatActuel);
      S.verifier(etat, C);
    } catch (x) {
      return non('Ce fichier est abîmé, rien n\'a été changé. (' + x.message + ')');
    }
    return { ok: true, etat, apercu: { ...S.resume(etat), exporteLe: e.meta?.exporteLe || null }, actuel: S.resume(etatActuel) };
  };

  S.resume = function (e) {
    if (!e) return null;
    return {
      niveau: e.joueur?.niveau ?? 1,
      xpTotal: e.joueur?.xpTotal ?? 0,
      taches: (e.taches || []).filter(t => !t.archivee).length,
      saisies: (e.journal || []).length
    };
  };

  /* ===== SAUVEGARDES AUTOMATIQUES =====
   * Nom de la copie hebdomadaire = lundi de la semaine du jour donné (AAAA-MM-JJ).
   */
  S.nomHebdo = function (jour) {
    const [a, m, j] = jour.split('-').map(Number);
    const d = new Date(Date.UTC(a, m - 1, j));
    const decalage = (d.getUTCDay() + 6) % 7;            // 0 = lundi
    d.setUTCDate(d.getUTCDate() - decalage);
    return 'hebdo-' + d.toISOString().slice(0, 10);
  };

  // Noms à supprimer pour ne garder que les `garder` plus récents d'un préfixe (noms triables par date)
  S.aSupprimer = function (noms, prefixe, garder) {
    const liste = noms.filter(n => n.startsWith(prefixe)).sort();
    return liste.slice(0, Math.max(0, liste.length - garder));
  };

  /* Décrit une copie automatique d'après son nom (les noms sont triables par date) :
   *   hebdo-AAAA-MM-JJ                       → copie de la semaine (lundi)
   *   avant-AAAA-MM-JJTHH-MM-SS-<raison>     → copie avant import, migration, restauration… (heure UTC)
   * → {nom, type: 'hebdo' | 'avant', tri, quand (ISO), raison} ; null si le nom est inconnu (ignoré)
   */
  S.decrireSauvegarde = function (nom) {
    let m = /^hebdo-(\d{4}-\d{2}-\d{2})$/.exec(nom);
    if (m) return { nom, type: 'hebdo', tri: m[1] + 'T00-00-00', jour: m[1], quand: null, raison: null };
    m = /^avant-(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(.+)$/.exec(nom);
    if (m) return { nom, type: 'avant', tri: `${m[1]}T${m[2]}-${m[3]}-${m[4]}`, jour: m[1], quand: `${m[1]}T${m[2]}:${m[3]}:${m[4]}.000Z`, raison: m[5] };
    return null;
  };
  // Les plus récentes d'abord
  S.listeSauvegardes = function (noms) {
    return noms.map(S.decrireSauvegarde).filter(Boolean).sort((a, b) => (a.tri < b.tri ? 1 : a.tri > b.tri ? -1 : 0));
  };
  S.RAISONS = { import: 'avant un import', restauration: 'avant une restauration', illisible: 'données illisibles gardées' };
  S.libelleRaison = (raison) => S.RAISONS[raison] || (/^migration/.test(raison) ? 'avant une mise à jour des données' : 'copie de sécurité');

  /* Restaurer une copie automatique → {ok: true, etat, apercu, actuel} ou {ok: false, message}
   * Même règle que l'import : adresse iCal et jours déjà traités du téléphone gardés (garderDuTelephone).
   */
  S.preparerRestauration = function (texte, etatActuel, C) {
    const d = S.decider(texte, C);
    if (d.type === 'trop-recent') return { ok: false, message: 'Cette copie vient d\'une version plus récente de l\'appli.' };
    if (d.type !== 'ok') return { ok: false, message: 'Cette copie est abîmée, rien n\'a été changé.' };
    const etat = d.etat;
    garderDuTelephone(etat, etatActuel);
    try { S.verifier(etat, C); } catch (x) { return { ok: false, message: 'Cette copie est abîmée, rien n\'a été changé.' }; }
    return { ok: true, etat, apercu: S.resume(etat), actuel: S.resume(etatActuel) };
  };

  /* Rappel doux d'export : après C.donnees.rappelExportJours jours sans export.
   * Jamais exporté → on compte depuis la 1re saisie (rien à sauver = pas de rappel).
   */
  S.rappelExport = function (etat, instantIso, C) {
    const debut = etat.reglages?.dernierExport || etat.journal?.[0]?.horodatage;
    if (!debut) return false;
    const jours = (Date.parse(instantIso) - Date.parse(debut)) / 86400000;
    return Number.isFinite(jours) && jours >= C.donnees.rappelExportJours;
  };

  /* ===== UTILITAIRES ===== */
  S.nouvelId = function () {
    return globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36) + Math.random().toString(36).slice(2);
  };

  function estObjet(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
  function clone(v) { return v === undefined ? v : JSON.parse(JSON.stringify(v)); }

  if (typeof module !== 'undefined') module.exports = S; else racine.Stockage = S;
})(typeof window !== 'undefined' ? window : globalThis);
