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
   */
  Cal.lireEvenements = function (txt, debut, fin, ICAL) {
    const comp = new ICAL.Component(ICAL.parse(txt));
    comp.getAllSubcomponents('vtimezone').forEach(tz => ICAL.TimezoneService.register(tz));
    const vevents = comp.getAllSubcomponents('vevent');
    const exceptions = vevents.filter(v => v.hasProperty('recurrence-id'));
    const res = [];
    const texte = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();
    const ajouter = (dDebut, dFin, item) => {
      if (item.component?.getFirstPropertyValue('status') === 'CANCELLED') return;
      const instantDebut = dDebut.toJSDate(), instantFin = (dFin || dDebut).toJSDate();
      if (instantFin < debut || instantDebut > fin) return;
      res.push({
        uid: item.uid, titre: texte(item.summary) || 'Sans titre', lieu: texte(item.location), journee: dDebut.isDate,
        debut: dDebut.isDate ? dDebut.toString() : instantDebut.toISOString(),
        fin: dFin ? (dFin.isDate ? dFin.toString() : instantFin.toISOString()) : null
      });
    };
    for (const v of vevents) {
      if (v.hasProperty('recurrence-id') || v.getFirstPropertyValue('status') === 'CANCELLED') continue;
      const ev = new ICAL.Event(v);
      exceptions.filter(x => x.getFirstPropertyValue('uid') === ev.uid).forEach(x => ev.relateException(new ICAL.Event(x)));
      if (!ev.isRecurring()) { ajouter(ev.startDate, ev.endDate, ev); continue; }
      const it = ev.iterator();
      for (let t, n = 0; (t = it.next()) && n < 5000; n++) {       // garde-fou : une répétition sans fin
        const d = ev.getOccurrenceDetails(t);
        if (d.startDate.toJSDate() > fin) break;
        ajouter(d.startDate, d.endDate, d.item);
      }
    }
    return res.sort((a, b) => (Cal.instant(a) - Cal.instant(b)) || (a.titre < b.titre ? -1 : 1));
  };

  // Instant de début (une journée entière commence à minuit UTC : seulement pour trier)
  Cal.instant = (ev) => Date.parse(ev.journee ? ev.debut + 'T00:00:00Z' : ev.debut);
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

  // Ce qu'on stocke dans reglages.calendrierCache (pas le fichier brut)
  Cal.construireCache = function (txt, instant, C, ICAL) {
    const { debut, fin } = Cal.fenetre(instant, C);
    return { chargeLe: instant.toISOString(), evenements: Cal.lireEvenements(txt, debut, fin, ICAL) };
  };
  Cal.aActualiser = function (cache, instant, C) {
    if (!cache?.chargeLe) return true;
    return instant.getTime() - Date.parse(cache.chargeLe) >= C.calendrier.actualiserMinutes * 60000;
  };

  // Jour (AAAA-MM-JJ, Bruxelles) où tombe un événement
  Cal.jourDe = (ev, C) => (ev.journee ? ev.debut : J.partiesLocales(new Date(ev.debut), C.jour.fuseau).jour);
  Cal.duJour = (cache, jour, C) => (cache?.evenements || []).filter(ev => Cal.jourDe(ev, C) === jour);

  // Examen : mots entiers, sans accents ni majuscules (« Attestation » n'en est pas un, « Interrogation » oui)
  const sansAccents = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  Cal.estExamen = (titre) => /\b(examens?|exams?|interro\w*|tests?)\b/.test(sansAccents(titre));

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
