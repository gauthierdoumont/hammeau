/* jours.js — Hameau — rattrapage des jours écoulés, séries, joker, moral, incendies, pause, veille — Créé par Gauthier Doumont
 * Fonctions PURES : l'instant et le hasard sont passés en paramètre ; l'état reçu n'est JAMAIS modifié (copie).
 * Testées dans node : tests/jours.test.js (0, 1, 10 jours, heure d'été/hiver, lundi, pause, incendie unique…).
 *
 * Règles (CLAUDE.md §6), pour chaque jour logique entre dernierJourTraite (exclu) et la limite (incluse), dans l'ordre :
 *  0. lundi franchi → joker remis à C.serie.jokersParSemaine
 *  1. jour couvert par une pause → rien
 *  2. quotidiennes prévues et non faites → moral −5 chacune (min 0)
 *  3. série : jour sans quotidienne prévue = neutre ; sinon validé si ≥ 1 quotidienne faite ET ≥ xpMinJour XP ;
 *     non validé → joker s'il en reste, sinon série = 0
 *  4. imprévu « important » à l'échéance dépassée → incendie, UNE seule fois par tâche :
 *     un bâtiment au hasard est endommagé ; sans bâtiment, perte de 20 % de la ressource (max 50)
 * Limite : « hier » n'est traité qu'après midi (on peut encore dire « je l'ai fait hier » le matin).
 * Chaque pénalité est un événement réversible {jour, type, avant, …} : une pause rétroactive les annule.
 */
(function (racine) {
  'use strict';
  const enNode = typeof module !== 'undefined';
  const Tm = enNode ? require('./temps.js') : racine.Temps;
  const M = enNode ? require('./moteur.js') : racine.Moteur;
  const E = enNode ? require('./economie.js') : racine.Economie;
  const D = {};
  const GARDER_JOURS = 8;   // les événements de plus de 8 jours ne peuvent plus être annulés (pause : 7 jours max)

  const clone = (v) => JSON.parse(JSON.stringify(v));

  /* ===== QUEL JOUR ? ===== */
  D.aujourdhui = (instant, C) => Tm.jourLogique(instant, C);
  // Le matin, « hier » reste ouvert : on peut encore y ajouter une tâche faite (jusqu'à midi)
  D.hierOuvert = function (instant, C) {
    const auj = Tm.jourLogique(instant, C);
    const { jour: civil, heure } = Tm.partiesLocales(instant, C.jour.fuseau);
    return civil === auj && heure < C.jour.heureClotureVeille;
  };
  D.limite = (instant, C) => Tm.ajouterJours(Tm.jourLogique(instant, C), D.hierOuvert(instant, C) ? -2 : -1);

  // Jour logique d'un horodatage (ISO) — sert à savoir depuis quand une tâche existe
  const jourDe = (iso, C) => (iso ? Tm.jourLogique(new Date(iso), C) : '0000-00-00');

  D.enPause = function (joueur, jour) {
    const p = joueur.pause;
    return !!(p && p.actif && p.depuis && jour >= p.depuis && (!p.jusqua || jour <= p.jusqua));
  };

  // Quotidiennes prévues un jour donné (existantes ce jour-là, non supprimées)
  D.quotidiennesPrevues = function (etat, jour, C) {
    const iso = Tm.jourIso(jour);
    return etat.taches.filter(t => t.type === 'quotidienne' && !t.archivee && (t.jours || []).includes(iso) && jourDe(t.creeLe, C) <= jour);
  };

  /* ===== UN JOUR ===== */
  function traiterJour(e, jour, C, rng, evenements) {
    const j = e.joueur;
    if (Tm.jourIso(jour) === 1) j.serie.joker = C.serie.jokersParSemaine;            // 0. lundi franchi
    if (D.enPause(j, jour)) return;                                                   // 1. pause

    const prevues = D.quotidiennesPrevues(e, jour, C);
    const faites = prevues.filter(t => M.progression(t, e.journal, jour) >= 1);
    const nonFaites = prevues.length - faites.length;
    if (nonFaites > 0) {                                                              // 2. moral (douce)
      const avant = j.moral;
      j.moral = Math.max(C.moral.min, j.moral + nonFaites * C.moral.quotidienneNonFaite);
      if (j.moral !== avant) evenements.push({ jour, type: 'moral', avant: { moral: avant }, perte: avant - j.moral, nonFaites });
    }
    if (prevues.length > 0) {                                                         // 3. série
      const xpJour = e.journal.filter(s => s.jour === jour).reduce((a, s) => a + (s.gains?.xp || 0), 0);
      const valide = faites.length >= 1 && xpJour >= C.serie.xpMinJour;
      const avant = { serie: j.serie.jours, joker: j.serie.joker };
      if (valide) j.serie.jours++;
      else if (j.serie.joker > 0) { j.serie.joker--; evenements.push({ jour, type: 'joker', avant }); }
      else if (j.serie.jours > 0) { j.serie.jours = 0; evenements.push({ jour, type: 'serie', avant }); }
    }
    // 4. incendie (dure, mais réparable), une seule fois par tâche
    for (const t of e.taches) {
      if (t.type !== 'imprevu' || !t.important || t.archivee || t.incendieApplique || !t.echeance || t.echeance > jour) continue;
      t.incendieApplique = true;
      const ev = { jour, type: 'incendie', tacheId: t.id, nom: t.nom };
      const bat = E.endommager(e, rng);
      if (bat) ev.batiment = bat.id;
      else {
        const famille = e.categories.find(c => c.id === t.categorieId)?.familleId;
        const r = C.familles.find(f => f.id === famille)?.ressource;
        if (r) {
          const perte = Math.min(C.incendie.max, Math.floor(j.ressources[r] * C.incendie.part));
          j.ressources[r] -= perte;
          ev.ressource = r; ev.perte = perte;
        }
      }
      evenements.push(ev);
    }
  }

  /* ===== RATTRAPAGE ===== */
  // → { etat (copie), evenements (nouveaux), jours (nombre de jours traités) }
  D.rattraper = function (etat, instant, C, rng = Math.random) {
    const e = clone(etat);
    e.etat.evenements ||= [];
    const auj = Tm.jourLogique(instant, C);
    const limite = D.limite(instant, C);
    const nouveaux = [];
    if (!e.etat.dernierJourTraite) {                     // 1er lancement : rien à rattraper
      e.etat.dernierJourTraite = Tm.ajouterJours(auj, -1);
      return { etat: e, evenements: nouveaux, jours: 0 };
    }
    let n = 0;
    for (let jour = Tm.ajouterJours(e.etat.dernierJourTraite, 1); jour <= limite; jour = Tm.ajouterJours(jour, 1)) {
      traiterJour(e, jour, C, rng, nouveaux);
      n++;
    }
    if (limite > e.etat.dernierJourTraite) e.etat.dernierJourTraite = limite;
    // Pause terminée et tous ses jours traités : on la range
    const p = e.joueur.pause;
    if (p?.actif && p.jusqua && e.etat.dernierJourTraite >= p.jusqua) e.joueur.pause = { actif: false, depuis: null, jusqua: null };
    // On garde les événements récents (annulables par une pause rétroactive)
    const plusVieux = Tm.ajouterJours(auj, -GARDER_JOURS);
    e.etat.evenements = [...e.etat.evenements, ...nouveaux].filter(v => v.jour >= plusVieux);
    return { etat: e, evenements: nouveaux, jours: n };
  };

  /* ===== PAUSE (malade, blocus, vacances) — activable jusqu'à 7 jours en arrière ===== */
  D.premierJourPause = (instant, C) => Tm.ajouterJours(Tm.jourLogique(instant, C), -C.pause.retroJoursMax);

  // Annule les pénalités depuis le jour « depuis », met en pause, puis refait le rattrapage (jours en pause = rien)
  D.activerPause = function (etat, depuis, instant, C, rng = Math.random) {
    if (depuis < D.premierJourPause(instant, C)) return { ok: false, erreur: `La pause peut commencer au plus tôt il y a ${C.pause.retroJoursMax} jours.` };
    const e = clone(etat);
    e.etat.evenements ||= [];
    const annules = e.etat.evenements.filter(v => v.jour >= depuis).sort((a, b) => b.jour.localeCompare(a.jour));
    for (const v of annules) {
      const j = e.joueur;
      // On rend ce qui a été perdu (sans effacer ce qui a été gagné depuis)
      if (v.type === 'moral') j.moral = Math.min(C.moral.max, j.moral + (v.perte ?? (v.avant.moral - j.moral)));
      if (v.type === 'joker' || v.type === 'serie') { j.serie.jours = v.avant.serie; j.serie.joker = v.avant.joker; }
      if (v.type === 'incendie') {
        const t = e.taches.find(x => x.id === v.tacheId);
        if (t) t.incendieApplique = false;
        if (v.batiment) { const b = e.village.batiments.find(x => x.id === v.batiment); if (b) b.endommage = false; }
        if (v.ressource) j.ressources[v.ressource] += v.perte;
      }
    }
    e.etat.evenements = e.etat.evenements.filter(v => v.jour < depuis);
    // Les jours depuis « depuis » seront retraités… en pause : ils ne coûtent plus rien
    const veille = Tm.ajouterJours(depuis, -1);
    if (e.etat.dernierJourTraite && e.etat.dernierJourTraite > veille) e.etat.dernierJourTraite = veille;
    e.joueur.pause = { actif: true, depuis, jusqua: null };
    const r = D.rattraper(e, instant, C, rng);
    return { ok: true, etat: r.etat, annules: annules.length };
  };
  // Fin de pause : les jours jusqu'à hier restent couverts, la vie normale reprend aujourd'hui
  D.finirPause = function (etat, instant, C) {
    const e = clone(etat);
    const p = e.joueur.pause;
    if (!p?.actif) return e;
    const hier = Tm.ajouterJours(Tm.jourLogique(instant, C), -1);
    if (p.depuis > hier) e.joueur.pause = { actif: false, depuis: null, jusqua: null };   // commencée aujourd'hui : rien à couvrir
    else p.jusqua = hier;
    return e;
  };

  /* ===== MESSAGE DE RETOUR (neutre et encourageant, jamais culpabilisant) ===== */
  D.messageRetour = function (r, etat, C, nomBatiment) {
    if (!r.jours) return null;
    const lignes = [];
    const incendies = r.evenements.filter(v => v.type === 'incendie');
    const serieRepart = r.evenements.some(v => v.type === 'serie');
    const joker = r.evenements.some(v => v.type === 'joker');
    if (joker) lignes.push('🃏 Ton joker de la semaine a protégé ta série.');
    if (serieRepart) lignes.push('🔥 Ta série repart de zéro : une tâche et c\'est reparti !');
    for (const v of incendies) {
      if (v.batiment) lignes.push(`🔥 « ${v.nom} » est passé : un feu a abîmé ${nomBatiment(v.batiment)}. Touche-le dans le village pour le réparer.`);
      else if (v.perte) lignes.push(`🔥 « ${v.nom} » est passé : ${v.perte} ${C.ressources.find(x => x.id === v.ressource)?.emoji ?? ''} sont partis en fumée.`);
    }
    if (!lignes.length && r.jours < 2) return null;     // une nuit normale : rien à dire
    return {
      titre: r.jours >= 2 ? 'Content de te revoir ! 👋' : 'Nouvelle journée ☀️',
      lignes: lignes.length ? lignes : ['Ton village t\'attendait. Une petite tâche pour bien reprendre ?'],
    };
  };

  if (enNode) module.exports = D; else racine.Jours = D;
})(typeof window !== 'undefined' ? window : globalThis);
