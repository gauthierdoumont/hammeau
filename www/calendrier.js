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
   */
  // Garde-fous d'une répétition : occurrences DANS la fenêtre, et temps passé à avancer jusqu'à la fenêtre
  const MAX_DANS_FENETRE = 5000, PLAFOND_MS = 250;
  const SECONDES = { SECONDLY: 1, MINUTELY: 60, HOURLY: 3600, DAILY: 86400, WEEKLY: 604800 };
  /* Départ rapide d'une répétition fréquente et ancienne (« toutes les heures depuis 2015 ») : on avance DTSTART d'un
   * nombre ENTIER de périodes (INTERVAL × jour, semaine…) pour arriver juste avant la fenêtre. Les occurrences suivantes
   * sont les mêmes (même jour de la semaine, même alignement de l'intervalle). Le 1er résultat (le nouveau départ
   * lui-même) tombe avant la fenêtre, donc il est ignoré. Pas avec COUNT (il se compte depuis le vrai DTSTART),
   * ni avec plusieurs règles, ni pour MONTHLY / YEARLY (peu d'occurrences : l'itération complète est rapide).
   * → ICAL.Time (nouveau départ) ou null (partir de DTSTART)
   */
  function departRapide(ev, debut, marge) {
    const regles = ev.component.getAllProperties('rrule');
    if (regles.length !== 1 || ev.component.hasProperty('rdate')) return null;
    const r = regles[0].getFirstValue();
    const pas = SECONDES[r.freq];
    if (!pas || r.count) return null;
    const periode = pas * (r.interval || 1);
    const ecart = (debut.getTime() - marge - ev.startDate.toJSDate().getTime()) / 1000;
    const k = Math.floor(ecart / periode) - 1;          // une période de marge (changement d'heure)
    if (k <= 0) return null;
    const t = ev.startDate.clone();
    if (periode % 86400 === 0) t.adjust(k * periode / 86400, 0, 0, 0);   // en jours : même heure locale
    else t.adjust(0, 0, 0, k * periode);
    return t;
  }
  Cal.lireEvenements = function (txt, debut, fin, ICAL, garder = null) {
    const comp = new ICAL.Component(ICAL.parse(txt));
    comp.getAllSubcomponents('vtimezone').forEach(tz => ICAL.TimezoneService.register(tz));
    const vevents = comp.getAllSubcomponents('vevent');
    const exceptions = vevents.filter(v => v.hasProperty('recurrence-id'));
    // Uids des événements d'origine : une exception (RECURRENCE-ID) orpheline est lue comme un événement simple
    const origines = new Set(vevents.filter(v => !v.hasProperty('recurrence-id')).map(v => v.getFirstPropertyValue('uid')));
    const res = [];
    const texte = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();
    const ajouter = (dDebut, dFin, item) => {
      if (item.component?.getFirstPropertyValue('status') === 'CANCELLED') return;
      const instantDebut = dDebut.toJSDate(), instantFin = (dFin || dDebut).toJSDate();
      if (instantFin < debut || instantDebut > fin) return false;
      const ev = {
        uid: item.uid, titre: texte(item.summary) || 'Sans titre', lieu: texte(item.location), journee: dDebut.isDate,
        debut: dDebut.isDate ? dDebut.toString() : instantDebut.toISOString(),
        fin: dFin ? (dFin.isDate ? dFin.toString() : instantFin.toISOString()) : null
      };
      if (garder && !garder(ev)) return false;
      res.push(ev);
      return true;
    };
    for (const v of vevents) {
      if (v.getFirstPropertyValue('status') === 'CANCELLED') continue;
      if (v.hasProperty('recurrence-id') && origines.has(v.getFirstPropertyValue('uid'))) continue;   // lue avec son origine
      const ev = new ICAL.Event(v);
      if (!v.hasProperty('recurrence-id')) {
        exceptions.filter(x => x.getFirstPropertyValue('uid') === ev.uid).forEach(x => ev.relateException(new ICAL.Event(x)));
      }
      if (!ev.isRecurring()) { ajouter(ev.startDate, ev.endDate, ev); continue; }
      // Répétition : départ rapide près de la fenêtre quand c'est sûr (sans exception), sinon depuis DTSTART.
      // Avant la fenêtre, sans exception à appliquer, on avance sans détails ; seul le temps passé est plafonné
      // (les occurrences d'avant la fenêtre ne comptent pas dans le garde-fou des 5 000).
      const simple = !Object.keys(ev.exceptions).length;
      const marge = (ev.duration ? ev.duration.toSeconds() * 1000 : 0) + 86400000;
      const it = ev.iterator((simple && departRapide(ev, debut, marge)) || undefined);
      const limite = Date.now() + PLAFOND_MS;
      for (let t, n = 0, tours = 0; n < MAX_DANS_FENETRE && (t = it.next()); tours++) {
        if (simple && t.toJSDate().getTime() + marge < debut.getTime()) {
          if (tours % 1000 === 999 && Date.now() > limite) break;   // règle impossible à parcourir à temps
          continue;
        }
        const d = ev.getOccurrenceDetails(t);
        if (d.startDate.toJSDate() > fin) break;
        if (ajouter(d.startDate, d.endDate, d.item)) n++;
      }
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
   * (C.boss.joursApres) et ses dégâts ne passent pas à l'examen suivant tant que celui-ci peut encore apparaître
   * (C.boss.joursAvant). → nombre de jours avant aujourd'hui
   */
  Cal.joursExamensGardes = (C) => Math.max(C.boss.joursApres, C.boss.joursAvant);

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
    // Le jour logique est noté ici, une seule fois (puis lu par jourDe à chaque affichage)
    const garder = (ev) => { ev.jour = Cal.jourDe(ev, C); return dansFenetre(ev) || examenGarde(ev); };
    const lus = Cal.lireEvenements(txt, debutLecture < debut ? debutLecture : debut, fin, ICAL, garder);
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
