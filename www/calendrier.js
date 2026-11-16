/* calendrier.js — Hameau — lecture de l'agenda iCal (Google Agenda) — Créé par Gauthier Doumont
 * Fonctions PURES (testées dans node avec tests/exemple.ics) : on leur passe le texte et ICAL (ical.js, local).
 * Le téléchargement (CapacitorHttp, appli installée seulement) est dans app.js.
 * L'adresse secrète de l'agenda n'apparaît JAMAIS ici, ni dans les logs, ni dans l'export.
 */
(function (racine) {
  'use strict';
  const Cal = {};
  const J = racine.Temps || (typeof require !== 'undefined' ? require('./temps.js') : null);

  // « webcal:// » (lien d'abonnement) → https:// ; null si ce n'est pas une adresse https
  Cal.nettoyerAdresse = function (texte) {
    const a = String(texte ?? '').trim().replace(/^webcal:\/\//i, 'https://');
    return /^https:\/\/[^\s/]+\.[^\s/]+\/\S+$/i.test(a) ? a : null;
  };
  Cal.estAgenda = (txt) => typeof txt === 'string' && txt.includes('BEGIN:VCALENDAR');

  /* Texte iCal → événements entre debut et fin (instants), triés.
   * Gère : fuseaux (VTIMEZONE), répétitions (RRULE), exceptions (EXDATE, RECURRENCE-ID), annulés, journées entières.
   * → [{uid, titre, lieu, journee, debut, fin}] ; debut/fin = ISO (heure) ou AAAA-MM-JJ (journée entière)
   * garder(ev) (facultatif) : filtre appliqué AVANT le garde-fou des 5 000 (les événements écartés ne comptent pas).
   * debutSerie(uid, titre) (facultatif) : début (≥ debut) à partir duquel lire une répétition ; ses exceptions
   * (RECURRENCE-ID) sont lues depuis debut. Sert au cache : seuls les examens sont lus avant la fenêtre.
   */
  /* Garde-fous d'une répétition : occurrences DANS la fenêtre, et nombre de TOURS de l'itérateur (sur tous les chemins).
   * Un nombre de tours (et pas un temps) : même résultat sur le téléphone, sur GitHub et dans les tests, quelle que
   * soit la vitesse de la machine. Réglable (Cal.MAX_TOURS) pour un test dédié.
   */
  const MAX_DANS_FENETRE = 5000;
  Cal.MAX_TOURS = 20000;   // cas réels testés : 12 400 tours au plus ; au-delà (règle absurde) ≈ 0,3 s puis arrêt, partout pareil
  const SECONDES = { SECONDLY: 1, MINUTELY: 60, HOURLY: 3600, DAILY: 86400, WEEKLY: 604800 };
  const JOUR_MS = 86400000;
  /* Départ rapide d'une répétition fréquente et ancienne (« toutes les heures depuis 2015 ») : on avance DTSTART d'un
   * nombre ENTIER k de périodes (INTERVAL × jour, semaine…) pour arriver juste avant `avantMs`. Les occurrences suivantes
   * sont les mêmes (même jour de la semaine, même alignement de l'intervalle). Le nouveau départ lui-même est ignoré.
   * COUNT se compte depuis le vrai DTSTART : sans BYxxx, 1 période = 1 occurrence, donc il en reste COUNT − k
   * (voir iterateur) ; avec BYxxx + COUNT, pas de départ rapide (itération complète, plafonnée).
   * Plusieurs règles : on avance d'un multiple commun de leurs périodes (sans COUNT). RDATE : dates absolues, gardées
   * par l'itérateur (sans COUNT seulement, car une RDATE compte dans COUNT).
   * MONTHLY / YEARLY sans COUNT (« dernier jour ouvré du mois » depuis 2000 : coûteux pour ical.js) : on avance d'un
   * multiple de 48 mois × INTERVAL → même mois de l'année ET même place dans le cycle bissextile (le 29 février existe
   * encore) ; les règles BYDAY / BYSETPOS ne dépendent que du mois, pas du jour de la semaine de DTSTART.
   * → { t: ICAL.Time (nouveau départ), k } ou null (partir de DTSTART)
   */
  const pgcd = (a, b) => (b ? pgcd(b, a % b) : a);
  const ppcm = (a, b) => a / pgcd(a, b) * b;
  const MOIS = { MONTHLY: 1, YEARLY: 12 };
  function departMensuel(ev, regles, avantMs) {
    if (regles.length !== 1 || regles[0].count) return null;
    const pasMois = ppcm(48, MOIS[regles[0].freq] * (regles[0].interval || 1));
    const d = ev.startDate, a = new Date(avantMs);
    const ecart = (a.getUTCFullYear() - d.year) * 12 + (a.getUTCMonth() + 1 - d.month);
    const k = Math.floor(ecart / pasMois) - 1;                        // une période de marge
    if (k <= 0) return null;
    const t = d.clone();
    const mois = (t.month - 1) + k * pasMois;
    t.year += Math.floor(mois / 12);
    t.month = (mois % 12) + 1;
    return { t, k };
  }
  function departRapide(ev, avantMs) {
    const regles = ev.component.getAllProperties('rrule').map(p => p.getFirstValue());
    if (!regles.length) return null;
    if (regles.some(r => r.count) && (regles.length > 1 || ev.component.hasProperty('rdate'))) return null;
    if (regles.some(r => MOIS[r.freq])) return departMensuel(ev, regles, avantMs);
    let periode = 1;
    for (const r of regles) {
      const pas = SECONDES[r.freq];
      if (!pas || (r.count && Object.keys(r.parts || {}).length)) return null;
      const p = pas * (r.interval || 1);
      periode = ppcm(periode, p);
    }
    const k = Math.floor((avantMs - ev.startDate.toJSDate().getTime()) / 1000 / periode) - 1;   // une période de marge
    if (k <= 0) return null;
    const t = ev.startDate.clone();
    if (periode % 86400 === 0) t.adjust(k * periode / 86400, 0, 0, 0);   // en jours : même heure locale
    else t.adjust(0, 0, 0, k * periode);
    return { t, k };
  }
  // Itérateur d'ical.js depuis DTSTART ou un départ rapide ; avec COUNT, les k périodes sautées sont déjà comptées
  function iterateur(ev, depart) {
    const it = ev.iterator(depart ? depart.t : undefined);
    if (depart && ev.component.getFirstPropertyValue('rrule').count) {
      const regle = it.ruleIterators?.[0];
      if (!regle || typeof regle.occurrence_number !== 'number') return null;
      regle.occurrence_number += depart.k;
    }
    return it;
  }

  /* Occurrences d'UNE répétition dans [debut, fin] → ajouter(...) ; s'arrête au garde-fou des 5 000 ou à Cal.MAX_TOURS.
   * Les RECURRENCE-ID sont des dates absolues : celles dont la date d'origine est parcourue par l'itération sont vues
   * en chemin ; les autres (origine avant le départ rapide ou après la fin, nouvelle date dans la fenêtre) sont
   * cherchées à part, près de leur date d'origine. Celle-ci doit être une vraie occurrence (pas retirée par EXDATE,
   * ni au-delà de COUNT / UNTIL) : même résultat que l'itération complète.
   */
  function repetition(ev, debut, fin, ajouter, ICAL, debutSerie = debut) {
    const debutMs = debut.getTime(), finMs = fin.getTime();
    const serieMs = Math.max(debutMs, debutSerie.getTime());   // occurrences sans exception : à partir d'ici
    let tours = 0;
    const aTemps = () => ++tours <= Cal.MAX_TOURS;
    const utc = ICAL.Timezone.utcTimezone;
    const cles = Object.keys(ev.exceptions);
    const clesUtc = cles.some(k => k.endsWith('Z'));
    // Même recherche que getOccurrenceDetails d'ical.js (heure locale, puis UTC)
    const exceptionDe = (t) => {
      if (!cles.length) return null;
      const id = t.toString();
      if (Object.hasOwn(ev.exceptions, id)) return ev.exceptions[id];
      const idUtc = clesUtc ? t.convertToZone(utc).toString() : null;
      return idUtc && Object.hasOwn(ev.exceptions, idUtc) ? ev.exceptions[idUtc] : null;
    };
    // RANGE=THISANDFUTURE décale toute la suite : la marge avant la fenêtre couvre ce décalage
    const decalage = Math.max(0, ...ev.rangeExceptions.map(([, id]) => {
      const x = ev.exceptions[id];
      return Math.abs(x.startDate.toJSDate().getTime() - x.recurrenceId.toJSDate().getTime());
    }));
    const duree = ev.duration;                      // calculée une fois (ical.js la recalcule à chaque lecture)
    const marge = (duree ? duree.toSeconds() * 1000 : 0) + JOUR_MS + decalage;
    const sauter = !ev.rangeExceptions.length;      // une occurrence avant la fenêtre peut être passée sans ses détails
    let n = 0;
    // Occurrence sans exception : début = t, fin = t + durée (comme getOccurrenceDetails, sans ses conversions de fuseau)
    const prendre = (t, x, ms) => {
      if (x || !sauter) { const d = ev.getOccurrenceDetails(t); if (ajouter(d.startDate, d.endDate, d.item)) n++; return; }
      const f = t.clone();
      f.addDuration(duree);
      if (ajouter(t, f, ev, ms)) n++;
    };
    // Parcourt les occurrences de « depuis » à « jusqua » (ms) ; rappel(t, ms) → true pour s'arrêter.
    // paresseux : le rappel calcule lui-même l'instant (ms = undefined) et s'arrête après « jusqua »
    const parcourir = (depuis, jusqua, rappel, paresseux = false) => {
      let depart = departRapide(ev, depuis);
      let it = iterateur(ev, depart);
      if (!it) { depart = null; it = ev.iterator(); }        // autre version d'ical.js : itération complète
      for (let t, premier = true; (t = it.next()); premier = false) {
        if (!aTemps()) return { fini: false, depart };
        if (premier && depart) continue;                    // le nouveau départ lui-même (avant la fenêtre)
        const ms = paresseux ? undefined : t.toJSDate().getTime();
        if (ms > jusqua || rappel(t, ms)) break;
      }
      return { fini: true, depart };
    };

    // 1. Du départ (rapide si possible) jusqu'à la fin de la fenêtre
    const vues = new Set();                          // exceptions rencontrées en chemin
    let dernierMs = -Infinity;
    // Repère rapide « bien avant la fenêtre » sur la date affichée (sans calcul de fuseau, ±14 h au pire : 2 jours de marge)
    const seuil = new Date(serieMs - marge - 2 * JOUR_MS);
    const cleSeuil = seuil.getUTCFullYear() * 372 + seuil.getUTCMonth() * 31 + seuil.getUTCDate();
    const r = parcourir(serieMs - marge, finMs, (t, ms) => {
      const x = exceptionDe(t);
      if (x) vues.add(x);
      else if (sauter && t.year * 372 + (t.month - 1) * 31 + t.day < cleSeuil) return false;   // avant la fenêtre
      ms ??= t.toJSDate().getTime();
      if (ms > finMs) return true;
      dernierMs = ms;
      if (!x && sauter && ms + marge < serieMs) return false;   // avant la fenêtre, sans exception
      prendre(t, x, ms);
      return n >= MAX_DANS_FENETRE;
    }, true);
    if (!r.fini) return;
    // 2. Exceptions déplacées DANS la fenêtre dont la date d'origine n'a pas été parcourue
    const departMs = r.depart ? r.depart.t.toJSDate().getTime() : -Infinity;
    for (const x of new Set(Object.values(ev.exceptions))) {
      if (n >= MAX_DANS_FENETRE) return;
      if (vues.has(x) || !x.startDate) continue;
      const xDebut = x.startDate.toJSDate().getTime(), xFin = (x.endDate || x.startDate).toJSDate().getTime();
      if (xFin < debutMs || xDebut > finMs) continue;
      // Autour de la date d'origine (±2 jours : RECURRENCE-ID peut être dans un autre fuseau que DTSTART)
      const oMs = x.recurrenceId.toJSDate().getTime();
      const de = oMs - 2 * JOUR_MS, a = oMs + 2 * JOUR_MS;
      if (de > departMs && a <= dernierMs) continue;          // déjà parcouru : ce n'est pas une vraie occurrence
      if (!parcourir(de, a, (t) => { if (exceptionDe(t) !== x) return false; prendre(t, x); return true; }).fini) return;
    }
  }

  Cal.lireEvenements = function (txt, debut, fin, ICAL, garder = null, debutSerie = null) {
    const comp = new ICAL.Component(ICAL.parse(txt));
    comp.getAllSubcomponents('vtimezone').forEach(tz => ICAL.TimezoneService.register(tz));
    const vevents = comp.getAllSubcomponents('vevent');
    const exceptions = vevents.filter(v => v.hasProperty('recurrence-id'));
    // Uids des événements d'origine : une exception (RECURRENCE-ID) orpheline est lue comme un événement simple
    const origines = new Set(vevents.filter(v => !v.hasProperty('recurrence-id')).map(v => v.getFirstPropertyValue('uid')));
    const res = [];
    const texte = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();
    // Titre, lieu, annulé : lus une fois par événement (une répétition fréquente a des milliers d'occurrences)
    const infos = new Map();
    const infosDe = (item) => {
      if (!infos.has(item)) infos.set(item, { annule: item.component?.getFirstPropertyValue('status') === 'CANCELLED',
        titre: texte(item.summary) || 'Sans titre', lieu: texte(item.location) });
      return infos.get(item);
    };
    // msDebut (facultatif) : instant de début déjà calculé
    const ajouter = (dDebut, dFin, item, msDebut) => {
      const i = infosDe(item);
      if (i.annule) return false;
      const instantDebut = msDebut === undefined ? dDebut.toJSDate() : new Date(msDebut);
      const instantFin = dFin ? dFin.toJSDate() : instantDebut;
      if (instantFin < debut || instantDebut > fin) return false;
      const ev = {
        uid: item.uid, titre: i.titre, lieu: i.lieu, journee: dDebut.isDate,
        debut: dDebut.isDate ? dDebut.toString() : instantDebut.toISOString(),
        fin: dFin ? (dFin.isDate ? dFin.toString() : instantFin.toISOString()) : null
      };
      if (garder && !garder(ev)) return false;
      res.push(ev);
      return true;
    };
    for (const v of vevents) {
      if (v.getFirstPropertyValue('status') === 'CANCELLED') continue;
      const uid = v.getFirstPropertyValue('uid');
      const estException = v.hasProperty('recurrence-id');
      if (estException && origines.has(uid)) continue;   // lue avec son origine
      // Exceptions du MÊME uid seulement (sans cette liste, ical.js relie celles de TOUS les événements du fichier)
      const ev = new ICAL.Event(v, { exceptions: estException ? [] : exceptions.filter(x => x.getFirstPropertyValue('uid') === uid) });
      if (!ev.isRecurring()) { ajouter(ev.startDate, ev.endDate, ev); continue; }
      const depuis = debutSerie?.(uid, texte(ev.summary)) || debut;
      try { repetition(ev, debut, fin, ajouter, ICAL, depuis); } catch { /* règle illisible : le reste de l'agenda est gardé */ }
    }
    return res.sort(Cal.ordre);
  };

  // Instant de début (une journée entière commence à minuit UTC : seulement pour trier)
  Cal.instant = (ev) => Date.parse(ev.journee ? ev.debut + 'T00:00:00Z' : ev.debut);
  Cal.ordre = (a, b) => (Cal.instant(a) - Cal.instant(b)) || (a.titre < b.titre ? -1 : 1);
  // Instant de fin (ms) ; journée entière : minuit (Bruxelles) du jour de fin, exclu
  Cal.finInstant = (ev, C) => (ev.journee
    ? J.instantLocal(ev.fin && ev.fin > ev.debut ? ev.fin : J.ajouterJours(ev.debut, 1), '00:00', C.jour.fuseau).getTime()
    : Date.parse(ev.fin || ev.debut));
  // Identifiant d'une occurrence (« J'y étais » une seule fois, marquage d'examen)
  Cal.cle = (ev) => `${ev.uid}|${ev.debut}`;

  // Fenêtre gardée en cache : de J − joursAvant à J + joursApres (jours logiques, Bruxelles)
  Cal.fenetre = function (instant, C) {
    const jour = J.jourLogique(instant, C);
    return {
      debut: J.instantLocal(J.ajouterJours(jour, -C.calendrier.joursAvant), '00:00', C.jour.fuseau),
      fin: J.instantLocal(J.ajouterJours(jour, C.calendrier.joursApres + 1), '00:00', C.jour.fuseau)
    };
  };

  /* Examens passés gardés dans le cache (en plus de la fenêtre) : la récompense du boss reste prenable
   * (C.boss.joursApres) et ses dégâts ne passent jamais à un boss encore affiché : un boss reste visible jusqu'à
   * joursApres après son examen, et une révision compte pour lui jusqu'à joursAvant avant → on garde la somme.
   * → nombre de jours avant aujourd'hui
   */
  Cal.joursExamensGardes = (C) => C.boss.joursAvant + C.boss.joursApres;

  /* Ce qu'on stocke dans reglages.calendrierCache (pas le fichier brut) :
   * - les événements de la fenêtre, chacun avec son `jour` logique (calculé une fois ici, pas à chaque affichage) ;
   * - les examens (selon `examens`, le marquage à la main) des joursExamensGardes derniers jours, lus dans le
   *   fichier ou repris de l'ancien cache (`ancien`) s'ils n'y sont plus.
   */
  Cal.construireCache = function (txt, instant, C, ICAL, { ancien = null, examens = {} } = {}) {
    const { debut, fin } = Cal.fenetre(instant, C);
    const jour = J.jourLogique(instant, C);
    const premierJour = J.ajouterJours(jour, -C.calendrier.joursAvant);
    const depuisExamens = J.ajouterJours(jour, -Cal.joursExamensGardes(C));
    const debutLecture = J.instantLocal(depuisExamens, '00:00', C.jour.fuseau);
    const dansFenetre = (ev) => Cal.finInstant(ev, C) >= debut.getTime();
    const examenGarde = (ev) => ev.jour >= depuisExamens && ev.jour < premierJour && Cal.estExamenMarque(ev, examens);
    // Le jour logique est noté ici, une seule fois (puis lu par jourDe à chaque affichage). Mémorisé par quart d'heure :
    // tous les fuseaux décalent d'un multiple de 15 min, et une répétition fréquente en a des milliers.
    const parQuart = new Map();
    const jourLogique = (ev) => {
      if (ev.journee) return ev.debut;
      const q = Math.floor(Date.parse(ev.debut) / 900000);
      if (!parQuart.has(q)) parQuart.set(q, J.jourLogique(new Date(q * 900000), C));
      return parQuart.get(q);
    };
    const garder = (ev) => { ev.jour = jourLogique(ev); return dansFenetre(ev) || examenGarde(ev); };
    // Avant la fenêtre, on ne cherche que des examens : une répétition qui n'en est pas un (titre, marquage) part de la fenêtre
    const marques = new Set(Object.keys(examens || {}).filter(k => examens[k] === true).map(k => k.slice(0, k.lastIndexOf('|'))));
    const debutSerie = (uid, titre) => (Cal.estExamen(titre) || marques.has(uid) ? null : debut);
    const lus = Cal.lireEvenements(txt, debutLecture < debut ? debutLecture : debut, fin, ICAL, garder, debutSerie);
    const cles = new Set(lus.map(Cal.cle));
    const repris = (ancien?.evenements || []).map(ev => (ev.jour ? ev : { ...ev, jour: Cal.jourDe(ev, C) }))
      .filter(ev => examenGarde(ev) && !cles.has(Cal.cle(ev)));
    return { chargeLe: instant.toISOString(), evenements: lus.concat(repris).sort(Cal.ordre) };
  };
  Cal.aActualiser = function (cache, instant, C) {
    if (!cache?.chargeLe) return true;
    return instant.getTime() - Date.parse(cache.chargeLe) >= C.calendrier.actualiserMinutes * 60000;
  };

  /* Jour LOGIQUE (AAAA-MM-JJ) où commence un événement : un cours à 01:30 le 17 appartient au 16 (bascule à 4 h,
   * comme une tâche cochée à cette heure-là) ; journée entière : sa date. Déjà calculé dans le cache (`jour`) ;
   * calcul de repli pour un cache plus ancien.
   */
  Cal.jourDe = (ev, C) => ev.jour || (ev.journee ? ev.debut : J.jourLogique(new Date(ev.debut), C));
  /* Un événement est « du jour » :
   * - journée entière : chaque jour de debut à fin EXCLUE (un congé du lundi au vendredi s'affiche 5 jours) ;
   * - à heure fixe : le jour de son début seulement (un cours ne passe pas la nuit ; « J'y étais » une seule fois).
   */
  Cal.estDuJour = (ev, jour, C) => (ev.journee && ev.fin && ev.fin > ev.debut
    ? ev.debut <= jour && jour < ev.fin
    : Cal.jourDe(ev, C) === jour);
  Cal.duJour = (cache, jour, C) => (cache?.evenements || []).filter(ev => Cal.estDuJour(ev, jour, C));

  // Examen : mots entiers, sans accents ni majuscules (« Attestation » n'en est pas un, « Interrogation » oui)
  const sansAccents = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  // « interro » / « interrogation » oui, « interrompu » non
  Cal.estExamen = (titre) => /\b(examens?|exams?|interros?|interrogations?|tests?)\b/.test(sansAccents(titre));

  // Le marquage manuel (agenda.examens[cle] = true / false) passe avant le titre
  Cal.estExamenMarque = function (ev, examens) {
    const m = examens?.[Cal.cle(ev)];
    return typeof m === 'boolean' ? m : Cal.estExamen(ev.titre);
  };

  // « Cours du jour » : événements à heure fixe du jour logique (les journées entières sont à part), triés
  Cal.coursDuJour = (cache, jour, C) => Cal.duJour(cache, jour, C).filter(ev => !ev.journee);
  Cal.journeesDuJour = (cache, jour, C) => Cal.duJour(cache, jour, C).filter(ev => ev.journee);
  Cal.commence = (ev, instant) => instant.getTime() >= Date.parse(ev.debut);

  if (typeof module !== 'undefined') module.exports = Cal; else racine.Calendrier = Cal;
})(typeof window !== 'undefined' ? window : globalThis);
