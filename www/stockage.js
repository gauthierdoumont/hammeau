/* stockage.js — Hameau — modèle de données, migrations, vérification, export/import — Créé par Gauthier Doumont
 * Fonctions PURES (pas de localStorage, pas de DOM, pas d'horloge) : testables dans node (tests/donnees.test.js).
 * L'écriture réelle (localStorage + copie native) est dans app.js.
 */
(function (racine) {
  'use strict';
  const S = {};

  S.CLE = 'hameau_v1';   // clé de stockage : ne change jamais
  S.SCHEMA = 1;          // version de la structure des données

  /* ===== MODÈLE (schemaVersion 1) =====
   * categories[] {id, nom, emoji, familleId, perso, nbUtilisations}
   * taches[]     {id, nom, categorieId, type, taille, objectif?{cible, unite}, jours?[1-7], echeance?, important?,
   *               incendieApplique, creeLe, termineeLe?, archivee}
   * journal[]    {id, tacheId, horodatage, jour, valeur, progression, gains{xp, ressource, quantite}}
   * joueur       xp = XP gagnée dans le niveau en cours (xpTotal = cumul, ne baisse jamais)
   * etat         {dernierJourTraite}
   * village      (V2 — ajouté par migration le moment venu)
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
      etat: { dernierJourTraite: null },
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
  S.MIGRATIONS = {};

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
  S.verifier = function (e) {
    const err = (m) => { throw new Error('Données incohérentes : ' + m); };
    if (!estObjet(e)) err('pas un objet');
    if (!Number.isInteger(e.schemaVersion) || e.schemaVersion < 1) err('schemaVersion');
    chercherNombresInvalides(e, 'etat', err);
    for (const k of ['categories', 'taches', 'journal']) if (!Array.isArray(e[k])) err(k + ' n\'est pas une liste');
    const j = e.joueur;
    if (!estObjet(j)) err('joueur');
    if (!(j.niveau >= 1)) err('niveau < 1');
    if (!(j.xp >= 0) || !(j.xpTotal >= 0)) err('xp négative');
    if (!(j.moral >= 0 && j.moral <= 100)) err('moral hors de 0-100');
    for (const [r, v] of Object.entries(j.ressources || {})) if (!(v >= 0)) err('ressource négative : ' + r);
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
      S.verifier(etat);
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

  /* ===== IMPORT =====
   * → {ok: true, etat, apercu, actuel} ou {ok: false, message}
   * L'adresse iCal déjà saisie sur l'appareil est conservée.
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
      etat.reglages.icsUrl = etatActuel?.reglages?.icsUrl || '';
      S.verifier(etat);
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

  /* ===== UTILITAIRES ===== */
  S.nouvelId = function () {
    return globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36) + Math.random().toString(36).slice(2);
  };

  function estObjet(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
  function clone(v) { return v === undefined ? v : JSON.parse(JSON.stringify(v)); }

  if (typeof module !== 'undefined') module.exports = S; else racine.Stockage = S;
})(typeof window !== 'undefined' ? window : globalThis);
