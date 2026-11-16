/* notifications.js — Hameau — contenu des rappels (matin, soir, veille d'échéance) — Créé par Gauthier Doumont
 * Fonction PURE construire(etat, instant, C) → liste à programmer. Testée dans node (tests/notifications.test.js).
 * La programmation réelle (plugin @capacitor/local-notifications) est dans app.js : tout est recalculé
 * à chaque ouverture et à chaque changement (tâche cochée…), sinon le message du soir serait périmé.
 *
 * IDs fixes : 1+i matin · 100+i soir (i = jour 0 à joursAvance − 1) · 1000+ veilles d'échéance · 9999 test.
 * Heures acceptées : de la bascule du jour logique (4 h) à 23:59, sinon le rappel tomberait sur le mauvais jour.
 * Ton : toujours un gain à prendre, jamais un reproche. Rien pendant une pause.
 */
(function (racine) {
  'use strict';
  const N = {};
  const J = racine.Temps || (typeof require !== 'undefined' ? require('./temps.js') : null);
  const Jours = racine.Jours || (typeof require !== 'undefined' ? require('./jours.js') : null);
  const M = racine.Moteur || (typeof require !== 'undefined' ? require('./moteur.js') : null);

  N.ID_TEST = 9999;
  const pluriel = (n, mot) => `${n} ${mot}${n > 1 ? 's' : ''}`;
  N.ID_SOIR = 100;
  N.heureMin = (C) => String(C.jour.heureBascule).padStart(2, '0') + ':00';
  N.heureMax = '23:59';
  // « HH:MM » entre la bascule (incluse) et minuit : avant 4 h, on serait encore dans le jour logique de la veille
  N.heureValide = (h, C) => typeof h === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(h) && h >= N.heureMin(C);

  // Imprévus encore à faire (pas archivés), avec échéance
  function echeances(etat) {
    return etat.taches.filter(t => !t.archivee && t.type === 'imprevu' && t.echeance);
  }
  function restantes(etat, jour, C) {
    return Jours.quotidiennesPrevues(etat, jour, C).filter(t => M.progression(t, etat.journal, jour) < 1);
  }

  // Matin : programme du jour (précis pour aujourd'hui et demain, générique ensuite)
  function texteMatin(etat, jour, precis, C) {
    if (!precis) return { title: '☀️ Ton hameau t\'attend', body: 'Chaque tâche cochée aujourd\'hui fait grandir ton village.' };
    const q = Jours.quotidiennesPrevues(etat, jour, C).length;
    const ech = echeances(etat).filter(t => t.echeance === jour);
    const morceaux = [];
    if (q) morceaux.push(pluriel(q, 'quotidienne'));
    if (ech.length) morceaux.push(ech.length === 1 ? `📌 « ${ech[0].nom} » pour aujourd'hui` : `📌 ${ech.length} échéances aujourd'hui`);
    if (!morceaux.length) return { title: '☀️ Journée libre', body: 'Un petit bonus pour ton hameau ? Tout compte 🌱' };
    return { title: '☀️ Ton programme du jour', body: morceaux.join(' · ') + ' — à toi de jouer !' };
  }

  // La série ne grandit que si la journée atteint C.serie.xpMinJour : XP déjà gagnée ce jour + gain estimé des quotidiennes restantes
  function serieAssuree(etat, jour, taches, C) {
    const deja = etat.journal.filter(s => s.jour === jour).reduce((a, s) => a + (s.gains?.xp || 0), 0);
    const reste = taches.reduce((a, t) => {
      const famille = etat.categories.find(c => c.id === t.categorieId)?.familleId;
      return a + M.gainRestant(t, M.bilan(t, etat.journal, jour), C, M.multiplicateurs(t, etat, C, jour, famille).total);
    }, 0);
    return deja + reste >= C.serie.xpMinJour;
  }

  // Soir : seulement s'il reste des quotidiennes, formulé en gain. Le nombre de jours n'est promis que pour ce soir
  // (les jours suivants, la série dépend de ce qui sera fait d'ici là) et seulement s'il est atteignable.
  function texteSoir(etat, jour, precis, C) {
    const taches = precis ? restantes(etat, jour, C) : Jours.quotidiennesPrevues(etat, jour, C);
    const n = taches.length;
    if (!n) return null;
    const serie = etat.joueur.serie?.jours || 0;
    const gain = !serieAssuree(etat, jour, taches, C) ? 'et ton hameau grandit 🌱'
      : serie <= 0 ? 'et ta série démarre 🔥'
      : precis ? `et ta série passe à ${serie + 1} jours 🔥` : 'et ta série continue 🔥';
    if (!precis) return { title: '🌙 Encore un peu de temps', body: `Tes quotidiennes du jour ${gain}` };
    return { title: '🌙 Belle fin de journée', body: `Plus que ${pluriel(n, 'quotidienne')} ${gain}` };
  }

  N.construire = function (etat, instant, C) {
    const r = etat.reglages || {};
    const matin = N.heureValide(r.notifMatin, C) ? r.notifMatin : null;
    const soir = N.heureValide(r.notifSoir, C) ? r.notifSoir : null;
    const fuseau = C.jour.fuseau;
    const aujourdhui = J.jourLogique(instant, C);
    const apres = instant.getTime() + 60 * 1000;          // jamais dans le passé (ni dans la minute)
    const liste = [];
    const ajouter = (id, jour, heure, texte, type) => {
      if (!texte) return;
      const at = J.instantLocal(jour, heure, fuseau);
      if (at.getTime() <= apres) return;
      liste.push({ id, type, jour, at: at.toISOString(), title: texte.title, body: texte.body });
    };
    for (let i = 0; i < C.notifications.joursAvance; i++) {
      const jour = J.ajouterJours(aujourdhui, i);
      if (Jours.enPause(etat.joueur, jour)) continue;
      const precis = i <= 1;
      if (matin) ajouter(1 + i, jour, matin, texteMatin(etat, jour, precis, C), 'matin');
      if (soir) ajouter(N.ID_SOIR + i, jour, soir, texteSoir(etat, jour, i === 0, C), 'soir');
    }
    // Veille d'échéance : à l'heure du soir (sinon du matin), la veille
    const heureVeille = soir || matin;
    if (heureVeille) {
      const fin = J.ajouterJours(aujourdhui, C.notifications.joursAvance);
      echeances(etat)
        .filter(t => t.echeance > aujourdhui && t.echeance <= fin)
        .sort((a, b) => (a.echeance < b.echeance ? -1 : a.echeance > b.echeance ? 1 : 0))
        .slice(0, C.notifications.echeancesMax)
        .forEach((t, k) => {
          const veille = J.ajouterJours(t.echeance, -1);
          if (Jours.enPause(etat.joueur, veille)) return;
          ajouter(1000 + k, veille, heureVeille, { title: `📌 Demain : ${t.nom}`, body: 'Un petit pas aujourd\'hui et ce sera plié 💪' }, 'echeance');
        });
    }
    return liste.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : a.id - b.id));
  };

  /* Proposer d'activer les rappels (Android 13+ demande la permission) : explication d'abord,
   * puis au plus `propositionsMax` propositions, espacées de `relanceJours` jours. Jamais d'insistance.
   * suivi = {fois, dernier (ISO)} gardé sur le téléphone (pas dans les données exportées).
   */
  N.proposerPermission = function (suivi, instant, C) {
    const fois = suivi?.fois || 0;
    if (fois >= C.notifications.propositionsMax) return false;
    if (!fois) return true;
    const jours = (instant.getTime() - Date.parse(suivi.dernier)) / 86400000;
    return Number.isFinite(jours) && jours >= C.notifications.relanceJours;
  };

  if (typeof module !== 'undefined') module.exports = N; else racine.Notifications = N;
})(typeof window !== 'undefined' ? window : globalThis);
