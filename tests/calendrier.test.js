// tests/calendrier.test.js — Hameau — lecture de l'agenda iCal (tests/exemple.ics, FICTIF) — Créé par Gauthier Doumont
process.env.TZ = 'Europe/Brussels';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

globalThis.window = globalThis;
require('../www/config.js');
const ICAL = require('../www/lib/ical.min.js');
const S = require('../www/stockage.js');
const Cal = require('../www/calendrier.js');
const C = globalThis.CONFIG;
const ICS = fs.readFileSync(path.join(__dirname, 'exemple.ics'), 'utf8');
const TOUT = [new Date('2026-01-01T00:00:00Z'), new Date('2027-01-01T00:00:00Z')];

test('le fichier d\'exemple est bien en fins de ligne CRLF, avec une ligne repliée', () => {
  assert.ok(ICS.includes('\r\n'));
  assert.ok(!/[^\r]\n/.test(ICS));
  assert.ok(ICS.includes('(gr\r\n oupe B)'));
});

test('cours hebdo : 5 occurrences (EXDATE retirée, RECURRENCE-ID déplacée), heure d\'été → hiver', () => {
  const cours = Cal.lireEvenements(ICS, ...TOUT, ICAL).filter(e => e.uid === 'cours-compta@exemple.invalid');
  assert.deepEqual(cours.map(e => e.debut), [
    '2026-10-19T06:30:00.000Z',      // 08:30 en heure d'été
    '2026-10-26T07:30:00.000Z',      // 08:30 en heure d'hiver (passage le 25/10)
    '2026-11-09T12:30:00.000Z',      // occurrence déplacée à 13:30
    '2026-11-16T07:30:00.000Z',
    '2026-11-23T07:30:00.000Z'
  ]);
  assert.equal(cours[0].titre, 'Cours de comptabilité approfondie et de fiscalité des sociétés (groupe B)');   // ligne repliée
  assert.equal(cours[0].lieu, 'Local 204');
  assert.equal(cours[2].titre, 'Cours de comptabilité approfondie (déplacé)');
  assert.equal(cours[2].fin, '2026-11-09T14:30:00.000Z');
});

test('UTC (Z), journée entière (VALUE=DATE), événement annulé ignoré', () => {
  const tout = Cal.lireEvenements(ICS, ...TOUT, ICAL);
  const interro = tout.find(e => e.uid === 'interro-conso@exemple.invalid');
  assert.equal(interro.debut, '2026-11-20T09:00:00.000Z');
  const conge = tout.find(e => e.uid === 'conge-armistice@exemple.invalid');
  assert.equal(conge.journee, true);
  assert.equal(conge.debut, '2026-11-11');
  assert.equal(Cal.jourDe(conge, C), '2026-11-11');
  assert.ok(!tout.some(e => e.uid === 'annule@exemple.invalid'));
  assert.equal(tout.length, 8);                                       // 5 cours + interro + congé + attestation
  for (let i = 1; i < tout.length; i++) assert.ok(Cal.instant(tout[i - 1]) <= Cal.instant(tout[i]), 'trié');
});

test('examens : mots entiers, sans accents ni majuscules', () => {
  assert.equal(Cal.estExamen('Interrogation Consolidation'), true);
  assert.equal(Cal.estExamen('EXAMEN de fiscalité'), true);
  assert.equal(Cal.estExamen('Exams blancs'), true);
  assert.equal(Cal.estExamen('Interro surprise'), true);
  assert.equal(Cal.estExamen('Test de néerlandais'), true);
  assert.equal(Cal.estExamen('Attestation de stage à faire signer'), false);
  assert.equal(Cal.estExamen('Contestation'), false);
  assert.equal(Cal.estExamen('Cours de comptabilité'), false);
  assert.equal(Cal.estExamen('Cours interrompu'), false);            // « interro… » ne suffit pas
  assert.equal(Cal.estExamen('Interrompre la série'), false);
  assert.equal(Cal.estExamen('Interro'), true);
  assert.equal(Cal.estExamen('Interros de math'), true);
  assert.equal(Cal.estExamen('interrogation écrite'), true);
  assert.equal(Cal.estExamen('Interrogations orales'), true);
});

/* Petits agendas FICTIFS en mémoire (CRLF, comme Google) */
const agenda = (...evenements) => ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Hameau//tests FICTIFS//FR',
  ...evenements.flatMap(lignes => ['BEGIN:VEVENT', 'DTSTAMP:20100101T000000Z', ...lignes, 'END:VEVENT']), 'END:VCALENDAR'].join('\r\n');

test('répétition très ancienne (tous les jours depuis 2010) : les occurrences de la fenêtre sont bien là', () => {
  const ics = agenda(
    ['UID:quotidien@exemple.invalid', 'DTSTART:20100104T070000Z', 'DTEND:20100104T073000Z', 'RRULE:FREQ=DAILY', 'SUMMARY:Méditation'],
    ['UID:hebdo@exemple.invalid', 'DTSTART:20100104T080000Z', 'DTEND:20100104T090000Z', 'RRULE:FREQ=WEEKLY;BYDAY=MO',
      'EXDATE:20261123T080000Z', 'SUMMARY:Réunion du lundi'],
    ['UID:hebdo@exemple.invalid', 'RECURRENCE-ID:20261130T080000Z', 'DTSTART:20261130T100000Z', 'DTEND:20261130T110000Z', 'SUMMARY:Réunion déplacée']);
  const cache = Cal.construireCache(ics, new Date('2026-11-16T09:00:00Z'), C, ICAL);
  const quotidien = cache.evenements.filter(e => e.uid === 'quotidien@exemple.invalid');
  assert.equal(quotidien.length, C.calendrier.joursAvant + C.calendrier.joursApres + 1);   // un par jour de la fenêtre
  assert.equal(quotidien[0].debut, '2026-11-15T07:00:00.000Z');
  const lundis = cache.evenements.filter(e => e.uid === 'hebdo@exemple.invalid').map(e => e.debut).slice(0, 4);
  assert.deepEqual(lundis, ['2026-11-16T08:00:00.000Z', '2026-11-30T10:00:00.000Z', '2026-12-07T08:00:00.000Z', '2026-12-14T08:00:00.000Z']);   // EXDATE et RECURRENCE-ID gardés
});

test('journée entière sur plusieurs jours : affichée chaque jour (fin exclue) ; heure fixe : le jour du début', () => {
  const ics = agenda(
    ['UID:vacances@exemple.invalid', 'DTSTART;VALUE=DATE:20261221', 'DTEND;VALUE=DATE:20261224', 'SUMMARY:Congé d\'hiver'],
    ['UID:soiree@exemple.invalid', 'DTSTART:20261221T220000Z', 'DTEND:20261222T010000Z', 'SUMMARY:Soirée tardive']);
  const cache = Cal.construireCache(ics, new Date('2026-12-20T09:00:00Z'), C, ICAL);
  const titres = (jour) => Cal.duJour(cache, jour, C).map(e => e.titre);
  assert.deepEqual(titres('2026-12-20'), []);
  assert.deepEqual(Cal.journeesDuJour(cache, '2026-12-21', C).map(e => e.titre), ['Congé d\'hiver']);
  // La soirée va du 21 à 23 h au 22 à 2 h (Bruxelles) : affichée le 21 seulement (« J'y étais » une seule fois)
  assert.deepEqual(Cal.coursDuJour(cache, '2026-12-21', C).map(e => e.titre), ['Soirée tardive']);
  assert.deepEqual(Cal.coursDuJour(cache, '2026-12-22', C).map(e => e.titre), []);
  assert.deepEqual(titres('2026-12-23'), ['Congé d\'hiver']);
  assert.deepEqual(titres('2026-12-24'), []);                            // DTEND exclu
  assert.deepEqual(Cal.journeesDuJour(cache, '2026-12-22', C).map(e => e.titre), ['Congé d\'hiver']);
});

test('RECURRENCE-ID sans événement d\'origine dans le fichier : lu comme un événement simple', () => {
  const ics = agenda(['UID:orphelin@exemple.invalid', 'RECURRENCE-ID:20261116T080000Z', 'DTSTART:20261117T080000Z',
    'DTEND:20261117T090000Z', 'SUMMARY:Cours déplacé seul']);
  const evs = Cal.lireEvenements(ics, ...TOUT, ICAL);
  assert.equal(evs.length, 1);
  assert.equal(evs[0].titre, 'Cours déplacé seul');
  assert.equal(evs[0].debut, '2026-11-17T08:00:00.000Z');
});

test('cache : fenêtre J−1 à J+120 (Bruxelles), actualisation après N minutes', () => {
  const lundi = new Date('2026-11-16T09:00:00Z');
  const cache = Cal.construireCache(ICS, lundi, C, ICAL);
  assert.equal(cache.chargeLe, lundi.toISOString());
  const jours = cache.evenements.map(e => Cal.jourDe(e, C));
  assert.ok(jours.every(j => j >= '2026-11-15'), 'rien avant J−1 : ' + jours);
  assert.deepEqual(Cal.duJour(cache, '2026-11-16', C).map(e => e.uid), ['cours-compta@exemple.invalid']);
  assert.equal(Cal.duJour(cache, '2026-11-20', C)[0].titre, 'Interrogation Consolidation');
  assert.equal(Cal.aActualiser(cache, new Date(lundi.getTime() + (C.calendrier.actualiserMinutes - 1) * 60000), C), false);
  assert.equal(Cal.aActualiser(cache, new Date(lundi.getTime() + C.calendrier.actualiserMinutes * 60000), C), true);
  assert.equal(Cal.aActualiser(null, lundi, C), true);
});

test('adresse : webcal → https, rien d\'autre que https accepté', () => {
  assert.equal(Cal.nettoyerAdresse('  webcal://agenda.exemple.invalid/abc/basic.ics '), 'https://agenda.exemple.invalid/abc/basic.ics');
  assert.equal(Cal.nettoyerAdresse('https://agenda.exemple.invalid/x.ics'), 'https://agenda.exemple.invalid/x.ics');
  assert.equal(Cal.nettoyerAdresse('http://agenda.exemple.invalid/x.ics'), null);
  assert.equal(Cal.nettoyerAdresse('pas une adresse'), null);
  assert.equal(Cal.estAgenda(ICS), true);
  assert.equal(Cal.estAgenda('<html>'), false);
});

test('l\'adresse secrète de l\'agenda ne part JAMAIS dans l\'export (le cache, lui, oui)', () => {
  const e = S.etatInitial(C);
  e.reglages.icsUrl = 'https://agenda.exemple.invalid/private-secret/basic.ics';
  e.reglages.calendrierCache = Cal.construireCache(ICS, new Date('2026-11-16T09:00:00Z'), C, ICAL);
  const txt = JSON.stringify(S.pourExport(e, '2026-11-16T10:00:00.000Z', '1.2.0'));
  assert.ok(!txt.includes('private-secret') && !txt.includes('icsUrl'));
  assert.ok(txt.includes('Interrogation Consolidation'));
  assert.equal(S.verifier(e, C), true);
});

/* ===== Étape 15b : cours du jour, « J'y étais », examens marqués à la main ===== */
const M = require('../www/moteur.js');
const coursLundi = () => {
  const cache = Cal.construireCache(ICS, new Date('2026-11-16T09:00:00Z'), C, ICAL);
  return Cal.coursDuJour(cache, '2026-11-16', C)[0];
};

test('cours du jour : à heure fixe seulement ; la journée entière (congé) est à part', () => {
  const cache = Cal.construireCache(ICS, new Date('2026-11-10T09:00:00Z'), C, ICAL);
  assert.equal(Cal.coursDuJour(cache, '2026-11-11', C).length, 0);
  assert.equal(Cal.journeesDuJour(cache, '2026-11-11', C)[0].titre, 'Armistice (congé)');
  assert.equal(Cal.commence(coursLundi(), new Date('2026-11-16T07:29:00Z')), false);
  assert.equal(Cal.commence(coursLundi(), new Date('2026-11-16T07:30:00Z')), true);
});

test('examen : le marquage à la main passe avant le titre', () => {
  const interro = { uid: 'i', debut: '2026-11-20T09:00:00.000Z', titre: 'Interrogation Consolidation' };
  const cours = { uid: 'c', debut: '2026-11-16T07:30:00.000Z', titre: 'Cours de comptabilité' };
  assert.equal(Cal.estExamenMarque(interro, {}), true);
  assert.equal(Cal.estExamenMarque(interro, { [Cal.cle(interro)]: false }), false);
  assert.equal(Cal.estExamenMarque(cours, { [Cal.cle(cours)]: true }), true);
  assert.equal(Cal.estExamenMarque(cours, undefined), false);
});

test('« J\'y étais » : une fois par occurrence, après le début, gains 📜 Savoir de la catégorie Cours', () => {
  const e = S.etatInitial(C);
  const ev = coursLundi();
  const p = { cle: Cal.cle(ev), titre: ev.titre, debut: ev.debut };
  const ctx = (h, id = 'p1') => ({ id, horodatage: h, jour: '2026-11-16' });
  assert.match(M.jYEtais(e, p, ctx('2026-11-16T07:00:00.000Z'), C).erreur, /pas encore commencé/);
  const r = M.jYEtais(e, p, ctx('2026-11-16T08:00:00.000Z'), C);
  assert.equal(r.ok, true);
  assert.equal(r.ressource, 'savoir');
  assert.equal(r.gain, C.tailles[C.cours.taille] * C.types[C.cours.type]);
  assert.equal(e.joueur.ressources.savoir, r.gain);
  assert.equal(e.joueur.xpTotal, r.gain);
  assert.equal(e.joueur.gagneTotal.esprit, r.gain);
  assert.equal(e.journal[0].tacheId, null);
  assert.equal(e.journal[0].cours, p.cle);
  assert.equal(M.dejaPresent(e.journal, p.cle), true);
  assert.match(M.jYEtais(e, p, ctx('2026-11-16T09:00:00.000Z', 'p2'), C).erreur, /Déjà noté/);
  assert.equal(e.journal.length, 1);
  assert.equal(S.verifier(e, C), true);
  // La présence compte comme une tâche faite pour la journée (XP du jour, série) mais pas pour les tâches
  assert.equal(M.terminesDuJour(e.journal, '2026-11-16'), 1);
});

test('« J\'y étais » : série et bâtiment (Bibliothèque) augmentent le gain, comme pour une tâche', () => {
  const e = S.etatInitial(C);
  e.joueur.serie.jours = 4;
  const base = C.tailles[C.cours.taille] * C.types[C.cours.type];
  const r = M.jYEtais(e, { cle: 'x|1', titre: 'Cours', debut: '2026-11-16T07:30:00.000Z' }, { id: 'a', horodatage: '2026-11-16T08:00:00.000Z', jour: '2026-11-16' }, C);
  assert.equal(r.gain, Math.round(base * (1 + 4 * C.serie.parJour)));
});

/* ===== Vérification 3 : jour logique (C4), jour calculé une fois dans le cache (C3), répétitions anciennes (C8) ===== */
const Tm = require('../www/temps.js');
const BOSS = require('../www/boss.js');
const FUSEAU = ['BEGIN:VTIMEZONE', 'TZID:Europe/Brussels', 'BEGIN:DAYLIGHT', 'TZOFFSETFROM:+0100', 'TZOFFSETTO:+0200', 'TZNAME:CEST',
  'DTSTART:19700329T020000', 'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU', 'END:DAYLIGHT', 'BEGIN:STANDARD', 'TZOFFSETFROM:+0200',
  'TZOFFSETTO:+0100', 'TZNAME:CET', 'DTSTART:19701025T030000', 'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU', 'END:STANDARD', 'END:VTIMEZONE'];
const agendaTz = (...evenements) => agenda(...evenements).replace('BEGIN:VEVENT', FUSEAU.join('\r\n') + '\r\nBEGIN:VEVENT');

test('jour LOGIQUE : un cours à 01:30 le 17 appartient au 16 (cours du jour, « J\'y étais », boss, aperçu)', () => {
  const ics = agendaTz(
    ['UID:nuit@exemple.invalid', 'DTSTART;TZID=Europe/Brussels:20261117T013000', 'DTEND;TZID=Europe/Brussels:20261117T023000', 'SUMMARY:Observation des étoiles'],
    ['UID:exam-nuit@exemple.invalid', 'DTSTART;TZID=Europe/Brussels:20261121T013000', 'DTEND;TZID=Europe/Brussels:20261121T030000', 'SUMMARY:Examen de nuit'],
    ['UID:journee@exemple.invalid', 'DTSTART;VALUE=DATE:20261117', 'DTEND;VALUE=DATE:20261118', 'SUMMARY:Journée sportive']);
  const cache = Cal.construireCache(ics, new Date('2026-11-16T09:00:00Z'), C, ICAL);
  assert.deepEqual(Cal.coursDuJour(cache, '2026-11-16', C).map(e => e.titre), ['Observation des étoiles']);
  assert.deepEqual(Cal.coursDuJour(cache, '2026-11-17', C).map(e => e.titre), []);
  assert.deepEqual(Cal.journeesDuJour(cache, '2026-11-17', C).map(e => e.titre), ['Journée sportive']);   // journée entière : inchangée
  // « J'y étais » à 01:45 : jour logique du 16 → la présence est créditée au 16
  const instant = new Date('2026-11-17T00:45:00Z');
  const jour = Tm.jourLogique(instant, C);
  assert.equal(jour, '2026-11-16');
  const ev = Cal.coursDuJour(cache, jour, C)[0];
  assert.equal(Cal.commence(ev, instant), true);
  const e = S.etatInitial(C);
  assert.equal(M.jYEtais(e, { cle: Cal.cle(ev), titre: ev.titre, debut: ev.debut }, { id: 'n1', horodatage: instant.toISOString(), jour }, C).ok, true);
  assert.equal(e.journal[0].jour, '2026-11-16');
  // Boss : l'examen de 01:30 le 21 a lieu le jour (logique) du 20
  e.reglages.calendrierCache = cache;
  assert.equal(BOSS.liste(e, C).find(b => b.titre === 'Examen de nuit').jourExamen, '2026-11-20');
});

test('cache : le jour logique est calculé une fois (champ `jour`) ; un vieux cache sans `jour` marche encore', () => {
  const cache = Cal.construireCache(ICS, new Date('2026-11-16T09:00:00Z'), C, ICAL);
  assert.ok(cache.evenements.every(e => /^\d{4}-\d{2}-\d{2}$/.test(e.jour)));
  assert.equal(cache.evenements.find(e => e.uid === 'interro-conso@exemple.invalid').jour, '2026-11-20');
  const vieux = { ...cache, evenements: cache.evenements.map(({ jour, ...reste }) => reste) };
  for (const j of ['2026-11-16', '2026-11-20', '2026-11-23']) {
    assert.deepEqual(Cal.duJour(vieux, j, C).map(Cal.cle), Cal.duJour(cache, j, C).map(Cal.cle));
  }
});

// Référence : itération COMPLÈTE de ical.js depuis DTSTART, sans raccourci ni garde-fou (pour comparer)
function reference(ics, debut, fin) {
  const comp = new ICAL.Component(ICAL.parse(ics));
  comp.getAllSubcomponents('vtimezone').forEach(tz => ICAL.TimezoneService.register(tz));
  const ev = new ICAL.Event(comp.getFirstSubcomponent('vevent'));
  const res = [];
  for (let t, it = ev.iterator(); (t = it.next());) {
    const d = ev.getOccurrenceDetails(t);
    if (d.startDate.toJSDate() > fin) break;
    if (d.endDate.toJSDate() >= debut) res.push(d.startDate.isDate ? d.startDate.toString() : d.startDate.toJSDate().toISOString());
  }
  return res.sort();      // trié comme Cal.lireEvenements (au changement d'heure, ical.js peut sortir deux dates dans le désordre)
}

test('répétition fréquente et ancienne : « toutes les heures depuis 2015 » donne bien ses occurrences, vite', () => {
  const ics = agendaTz(['UID:horaire@exemple.invalid', 'DTSTART;TZID=Europe/Brussels:20150105T100000',
    'DTEND;TZID=Europe/Brussels:20150105T101500', 'RRULE:FREQ=HOURLY', 'SUMMARY:Boire un verre d\'eau']);
  const t0 = performance.now();
  const evs = Cal.construireCache(ics, new Date('2026-11-16T09:00:00Z'), C, ICAL).evenements;
  const duree = performance.now() - t0;
  assert.ok(duree < 5000, `trop lent : ${Math.round(duree)} ms`);
  assert.equal(evs[0].debut, '2026-11-14T23:00:00.000Z');                 // minuit du 15 (J−1), Bruxelles
  assert.equal(evs.at(-1).debut, '2027-03-16T23:00:00.000Z');            // minuit à la fin de J+120
  for (let i = 1; i < evs.length; i++) assert.equal(Date.parse(evs[i].debut) - Date.parse(evs[i - 1].debut), 3600000);
});

test('départ rapide = mêmes dates que l\'itération complète (BYDAY, INTERVAL, heure d\'été, journée entière)', () => {
  const instant = new Date('2027-03-01T09:00:00Z');                       // la fenêtre passe l'heure d'été (28/03/2027)
  const { debut, fin } = Cal.fenetre(instant, C);
  for (const [regle, depart] of [
    ['FREQ=DAILY', 'TZID=Europe/Brussels:20200106T083000'],
    ['FREQ=WEEKLY;INTERVAL=2;BYDAY=TU,TH', 'TZID=Europe/Brussels:20200107T083000'],
    ['FREQ=WEEKLY;INTERVAL=3', 'TZID=Europe/Brussels:20190109T170000'],   // un mercredi, toutes les 3 semaines
    ['FREQ=HOURLY;INTERVAL=5;BYHOUR=8,13,18', 'TZID=Europe/Brussels:20240101T080000'],
    ['FREQ=MINUTELY;INTERVAL=45', 'TZID=Europe/Brussels:20260601T000000'],
    ['FREQ=DAILY;INTERVAL=3', 'VALUE=DATE:20180101'],
    ['FREQ=WEEKLY;BYDAY=MO;UNTIL=20270405T000000Z', 'TZID=Europe/Brussels:20160104T090000']
  ]) {
    const fin1 = depart.startsWith('VALUE=DATE') ? 'DTEND;VALUE=DATE:20180102' : 'DURATION:PT30M';
    const ics = agendaTz(['UID:r@exemple.invalid', 'DTSTART;' + depart, fin1, 'RRULE:' + regle, 'SUMMARY:Répétition']);
    const obtenu = Cal.lireEvenements(ics, debut, fin, ICAL).map(e => e.debut);
    assert.ok(obtenu.length > 0, regle);
    assert.deepEqual(obtenu, reference(ics, debut, fin), regle);
  }
});

test('répétitions : quotidienne depuis 2010 avec EXDATE dans la fenêtre, COUNT compté depuis DTSTART', () => {
  const ics = agenda(
    ['UID:q@exemple.invalid', 'DTSTART:20100104T070000Z', 'DTEND:20100104T073000Z', 'RRULE:FREQ=DAILY',
      'EXDATE:20261120T070000Z,20261225T070000Z', 'SUMMARY:Méditation'],
    ['UID:c@exemple.invalid', 'DTSTART:20261101T100000Z', 'DTEND:20261101T110000Z', 'RRULE:FREQ=DAILY;COUNT=20', 'SUMMARY:Défi 20 jours'],
    ['UID:h@exemple.invalid', 'DTSTART:20261116T000000Z', 'DURATION:PT10M', 'RRULE:FREQ=HOURLY;COUNT=30', 'SUMMARY:Toutes les heures (30 fois)']);
  const evs = Cal.construireCache(ics, new Date('2026-11-16T09:00:00Z'), C, ICAL).evenements;
  const q = evs.filter(e => e.uid === 'q@exemple.invalid').map(e => e.debut);
  assert.equal(q.length, C.calendrier.joursAvant + C.calendrier.joursApres + 1 - 2);    // 2 jours retirés (EXDATE)
  assert.ok(!q.includes('2026-11-20T07:00:00.000Z') && q.includes('2026-11-21T07:00:00.000Z'));
  const c = evs.filter(e => e.uid === 'c@exemple.invalid').map(e => e.debut);
  assert.deepEqual([c[0], c.at(-1), c.length], ['2026-11-15T10:00:00.000Z', '2026-11-20T10:00:00.000Z', 6]);   // 1er au 20 nov.
  const h = evs.filter(e => e.uid === 'h@exemple.invalid');
  assert.equal(h.length, 30);
  assert.equal(h.at(-1).debut, '2026-11-17T05:00:00.000Z');
});

/* ===== Vérification 4 (D2, D6) : départ rapide AUSSI avec exceptions (RECURRENCE-ID, EXDATE) et COUNT sans BYxxx ===== */
// Référence : itération COMPLÈTE d'ical.js depuis DTSTART (aucun départ rapide), exceptions du même uid, jusqu'après la
// fenêtre ET toutes les dates d'origine ; détails calculés près de la fenêtre ou quand une exception porte sur la date.
function referenceComplete(ics, debut, fin) {
  const comp = new ICAL.Component(ICAL.parse(ics));
  comp.getAllSubcomponents('vtimezone').forEach(tz => ICAL.TimezoneService.register(tz));
  const vs = comp.getAllSubcomponents('vevent');
  const res = [];
  const pousser = (s, f, item) => {
    if (item.component.getFirstPropertyValue('status') === 'CANCELLED' || (f || s).toJSDate() < debut || s.toJSDate() > fin) return;
    res.push({ debut: s.isDate ? s.toString() : s.toJSDate().toISOString(), titre: String(item.summary), journee: s.isDate });
  };
  for (const v of vs.filter(x => !x.hasProperty('recurrence-id'))) {
    const uid = v.getFirstPropertyValue('uid');
    const ev = new ICAL.Event(v, { exceptions: vs.filter(x => x.hasProperty('recurrence-id') && x.getFirstPropertyValue('uid') === uid) });
    if (!ev.isRecurring()) { pousser(ev.startDate, ev.endDate, ev); continue; }
    const borne = Math.max(fin.getTime(), ...Object.values(ev.exceptions).map(x => x.recurrenceId.toJSDate().getTime())) + 3 * 86400000;
    const pres = debut.getTime() - 3 * 86400000;
    for (let t, it = ev.iterator(); (t = it.next());) {
      const ms = t.toJSDate().getTime();
      if (ms > borne) break;
      if (ms < pres && !(t.toString() in ev.exceptions)) continue;
      const d = ev.getOccurrenceDetails(t);
      pousser(d.startDate, d.endDate, d.item);
    }
  }
  return res.sort(Cal.ordre).map(e => e.debut + ' ' + e.titre);
}
const LUNDI = new Date('2026-11-16T09:00:00Z');
const lire = (ics, instant = LUNDI) => { const { debut, fin } = Cal.fenetre(instant, C); return Cal.lireEvenements(ics, debut, fin, ICAL).map(e => e.debut + ' ' + e.titre); };
const pareil = (ics, instant = LUNDI) => { const { debut, fin } = Cal.fenetre(instant, C); assert.deepEqual(lire(ics, instant), referenceComplete(ics, debut, fin)); };
const chrono = (f) => { const t0 = performance.now(); const r = f(); return { r, ms: performance.now() - t0 }; };

test('toutes les heures depuis 2015 + cours déplacés (origine avant / dans / après la fenêtre) + EXDATE : comme l\'itération complète, vite', () => {
  const ics = agendaTz(
    ['UID:h@exemple.invalid', 'DTSTART;TZID=Europe/Brussels:20150105T100000', 'DURATION:PT15M', 'RRULE:FREQ=HOURLY', 'SUMMARY:Eau',
      'EXDATE;TZID=Europe/Brussels:20261118T080000,20261201T130000'],
    ['UID:h@exemple.invalid', 'RECURRENCE-ID;TZID=Europe/Brussels:20261111T100000', 'DTSTART;TZID=Europe/Brussels:20261118T104000', 'DURATION:PT15M', 'SUMMARY:Venu d\'avant'],
    ['UID:h@exemple.invalid', 'RECURRENCE-ID;TZID=Europe/Brussels:20261119T100000', 'DTSTART;TZID=Europe/Brussels:20261119T103000', 'DURATION:PT15M', 'SUMMARY:Décalé'],
    ['UID:h@exemple.invalid', 'RECURRENCE-ID;TZID=Europe/Brussels:20270601T100000', 'DTSTART;TZID=Europe/Brussels:20261120T102000', 'DURATION:PT15M', 'SUMMARY:Venu d\'après'],
    ['UID:h@exemple.invalid', 'RECURRENCE-ID;TZID=Europe/Brussels:20261121T100000', 'DTSTART;TZID=Europe/Brussels:20271121T100000', 'DURATION:PT15M', 'SUMMARY:Parti loin']);
  const { r: cache, ms } = chrono(() => Cal.construireCache(ics, LUNDI, C, ICAL));
  assert.ok(ms < 5000, `trop lent : ${Math.round(ms)} ms`);
  const titres = cache.evenements.map(e => e.titre);
  for (const t of ['Venu d\'avant', 'Décalé', 'Venu d\'après']) assert.ok(titres.includes(t), t);
  assert.ok(!titres.includes('Parti loin'));
  assert.ok(!cache.evenements.some(e => e.debut === '2026-11-18T07:00:00.000Z'), 'EXDATE');
  pareil(ics);
  pareil(ics, new Date('2026-10-26T09:00:00Z'));                          // fenêtre qui commence le jour du passage à l'heure d'hiver
});

test('toutes les 15 min depuis 2020 avec 1 cours déplacé : plus d\'écran bloqué (garde-fou des 5 000 gardé)', () => {
  const ics = agendaTz(['UID:q@exemple.invalid', 'DTSTART;TZID=Europe/Brussels:20200105T100000', 'DURATION:PT5M', 'RRULE:FREQ=MINUTELY;INTERVAL=15', 'SUMMARY:Pause'],
    ['UID:q@exemple.invalid', 'RECURRENCE-ID;TZID=Europe/Brussels:20261116T100000', 'DTSTART;TZID=Europe/Brussels:20261116T100500', 'DURATION:PT5M', 'SUMMARY:Pause déplacée']);
  const { r: cache, ms } = chrono(() => Cal.construireCache(ics, LUNDI, C, ICAL));
  assert.ok(ms < 5000, `trop lent : ${Math.round(ms)} ms`);
  assert.equal(cache.evenements.length, 5000);
  assert.ok(cache.evenements.some(e => e.titre === 'Pause déplacée' && e.debut === '2026-11-16T09:05:00.000Z'));
});

test('COUNT très grand sans BYxxx (toutes les heures depuis 2015, COUNT=200000) : les occurrences sont là ; COUNT qui finit dans la fenêtre : juste', () => {
  const grand = agendaTz(['UID:c@exemple.invalid', 'DTSTART;TZID=Europe/Brussels:20150105T100000', 'DURATION:PT15M', 'RRULE:FREQ=HOURLY;COUNT=200000', 'SUMMARY:Compté']);
  const { r: evs, ms } = chrono(() => Cal.construireCache(grand, LUNDI, C, ICAL).evenements);
  assert.ok(ms < 5000, `trop lent : ${Math.round(ms)} ms`);
  assert.equal(evs[0].debut, '2026-11-14T23:00:00.000Z');
  assert.equal(evs.at(-1).debut, '2027-03-16T23:00:00.000Z');
  pareil(grand);
  // 104 400 heures depuis le 05/01/2015 10:00 → dernière occurrence début décembre 2026, dans la fenêtre
  const fini = agendaTz(['UID:c@exemple.invalid', 'DTSTART;TZID=Europe/Brussels:20150105T100000', 'DURATION:PT15M', 'RRULE:FREQ=HOURLY;COUNT=104400',
    'EXDATE;TZID=Europe/Brussels:20261120T100000', 'SUMMARY:Compté']);
  pareil(fini);
  const derniere = Date.parse('2015-01-05T09:00:00Z') + 104399 * 3600000;
  assert.equal(Date.parse(lire(fini).at(-1).split(' ')[0]), derniere);
});

test('quotidien depuis 2010 : déplacements autour de la fenêtre, sur une EXDATE, hors règle ; uid différents à la même heure', () => {
  const ics = agendaTz(
    ['UID:d@exemple.invalid', 'DTSTART;TZID=Europe/Brussels:20100104T080000', 'DURATION:PT30M', 'RRULE:FREQ=DAILY', 'SUMMARY:Cours',
      'EXDATE;TZID=Europe/Brussels:20261112T080000,20261119T080000'],
    ['UID:d@exemple.invalid', 'RECURRENCE-ID;TZID=Europe/Brussels:20261110T080000', 'DTSTART;TZID=Europe/Brussels:20261117T140000', 'DURATION:PT30M', 'SUMMARY:Rattrapage'],
    ['UID:d@exemple.invalid', 'RECURRENCE-ID;TZID=Europe/Brussels:20261112T080000', 'DTSTART;TZID=Europe/Brussels:20261118T140000', 'DURATION:PT30M', 'SUMMARY:Sur EXDATE'],
    ['UID:d@exemple.invalid', 'RECURRENCE-ID;TZID=Europe/Brussels:20261110T080700', 'DTSTART;TZID=Europe/Brussels:20261118T150000', 'DURATION:PT30M', 'SUMMARY:Hors règle'],
    ['UID:d@exemple.invalid', 'RECURRENCE-ID;TZID=Europe/Brussels:20270501T080000', 'DTSTART;TZID=Europe/Brussels:20261123T140000', 'DURATION:PT30M', 'SUMMARY:Avancé'],
    ['UID:d@exemple.invalid', 'RECURRENCE-ID;TZID=Europe/Brussels:20261125T080000', 'DTSTART;TZID=Europe/Brussels:20261125T080000', 'DURATION:PT30M', 'SUMMARY:Annulé', 'STATUS:CANCELLED'],
    ['UID:autre@exemple.invalid', 'DTSTART;TZID=Europe/Brussels:20100104T080000', 'DURATION:PT30M', 'RRULE:FREQ=DAILY', 'SUMMARY:Autre cours']);
  const evs = lire(ics);
  for (const t of ['Rattrapage', 'Avancé']) assert.ok(evs.some(e => e.endsWith(' ' + t)), t);
  for (const t of ['Sur EXDATE', 'Hors règle', 'Annulé']) assert.ok(!evs.some(e => e.endsWith(' ' + t)), t);
  // Le déplacement du cours « d » ne touche pas l'autre cours à la même heure
  assert.equal(evs.filter(e => e.endsWith(' Autre cours')).length, C.calendrier.joursAvant + C.calendrier.joursApres + 1);
  pareil(ics);
  pareil(ics, new Date('2026-03-30T09:00:00Z'));
});

test('plusieurs règles, BYDAY / INTERVAL / UNTIL / COUNT avec BYxxx, journée entière, heure flottante, UTC : comme l\'itération complète', () => {
  for (const lignes of [
    ['DTSTART;TZID=Europe/Brussels:20100104T080000', 'DURATION:PT30M', 'RRULE:FREQ=DAILY', 'RRULE:FREQ=DAILY;BYHOUR=18'],
    ['DTSTART;TZID=Europe/Brussels:20120103T083000', 'DURATION:PT2H', 'RRULE:FREQ=WEEKLY;BYDAY=TU,TH'],
    ['DTSTART;TZID=Europe/Brussels:20130106T083000', 'DURATION:PT2H', 'RRULE:FREQ=WEEKLY;INTERVAL=2;WKST=SU;BYDAY=SU,MO'],
    ['DTSTART;TZID=Europe/Brussels:20150105T100000', 'DURATION:PT15M', 'RRULE:FREQ=HOURLY;INTERVAL=7;UNTIL=20261201T000000Z'],
    ['DTSTART;TZID=Europe/Brussels:20120102T080000', 'DURATION:PT1H', 'RRULE:FREQ=WEEKLY;BYDAY=MO,WE;COUNT=1500'],
    ['DTSTART;VALUE=DATE:20000101', 'DTEND;VALUE=DATE:20000102', 'RRULE:FREQ=DAILY;INTERVAL=4'],
    ['DTSTART:20100105T100000', 'DURATION:PT5M', 'RRULE:FREQ=DAILY'],
    ['DTSTART:20150105T100000Z', 'DURATION:PT5M', 'RRULE:FREQ=HOURLY;INTERVAL=5']
  ]) {
    const ics = agendaTz(['UID:r@exemple.invalid', ...lignes, 'SUMMARY:Répétition']);
    for (const instant of [LUNDI, new Date('2026-03-29T12:00:00Z'), new Date('2026-10-25T12:00:00Z')]) {
      const { debut, fin } = Cal.fenetre(instant, C);
      assert.deepEqual(lire(ics, instant), referenceComplete(ics, debut, fin), lignes.join(' ') + ' @ ' + instant.toISOString());
    }
  }
});

/* ===== Correction de fond (après 3 boucles) : plafond en nombre de tours, départ rapide mensuel / annuel, RDATE ===== */
const FENETRES = [LUNDI, new Date('2026-03-29T12:00:00Z'), new Date('2026-10-25T12:00:00Z'), new Date('2027-01-01T12:00:00Z'), new Date('2030-02-28T12:00:00Z')];

test('mensuel / annuel anciens (dernier jour ouvré, 31 du mois, 29 février, INTERVAL, BYDAY) : comme l\'itération complète', () => {
  for (const lignes of [
    ['DTSTART;TZID=Europe/Brussels:20000131T090000', 'DURATION:PT1H', 'RRULE:FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1'],
    ['DTSTART;TZID=Europe/Brussels:20000115T090000', 'DURATION:PT1H', 'RRULE:FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1'],
    ['DTSTART;TZID=Europe/Brussels:20000131T180000', 'DURATION:PT1H', 'RRULE:FREQ=MONTHLY'],                     // 31 : mois courts sautés
    ['DTSTART;TZID=Europe/Brussels:19990310T180000', 'DURATION:PT1H', 'RRULE:FREQ=MONTHLY;INTERVAL=5'],
    ['DTSTART;TZID=Europe/Brussels:20010103T080000', 'DURATION:PT1H', 'RRULE:FREQ=MONTHLY;BYDAY=1WE,3WE'],
    ['DTSTART;VALUE=DATE:20000229', 'RRULE:FREQ=YEARLY'],                                                      // 29 février
    ['DTSTART;VALUE=DATE:19951123', 'RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=4TH'],
    ['DTSTART;TZID=Europe/Brussels:19800101T120000', 'DURATION:PT1H', 'RRULE:FREQ=YEARLY;INTERVAL=3;BYMONTH=3,10;BYMONTHDAY=29'],
    ['DTSTART;TZID=Europe/Brussels:20000101T020000', 'DURATION:PT1H', 'RRULE:FREQ=MONTHLY;BYDAY=-1SU'],          // 02:00 la nuit du changement d'heure
    ['DTSTART:20000105T100000Z', 'DURATION:PT1H', 'RRULE:FREQ=MONTHLY;UNTIL=20261231T000000Z']
  ]) {
    const ics = agendaTz(['UID:m@exemple.invalid', ...lignes, 'SUMMARY:Mensuel']);
    for (const instant of FENETRES) {
      const { debut, fin } = Cal.fenetre(instant, C);
      assert.deepEqual(lire(ics, instant), referenceComplete(ics, debut, fin), lignes.join(' ') + ' @ ' + instant.toISOString());
    }
  }
});

test('RDATE avec une répétition fréquente et ancienne (toutes les heures depuis 2015, toutes les 30 min) : comme l\'itération complète', () => {
  for (const lignes of [
    ['DTSTART;TZID=Europe/Brussels:20150105T100000', 'DURATION:PT15M', 'RRULE:FREQ=HOURLY', 'RDATE;TZID=Europe/Brussels:20261117T103000,20150106T103000'],
    ['DTSTART;TZID=Europe/Brussels:20200105T100000', 'DURATION:PT5M', 'RRULE:FREQ=MINUTELY;INTERVAL=90', 'RDATE;TZID=Europe/Brussels:20261120T101500'],
    ['DTSTART;TZID=Europe/Brussels:20100104T080000', 'DURATION:PT30M', 'RRULE:FREQ=DAILY', 'RDATE;TZID=Europe/Brussels:20261118T200000', 'EXDATE;TZID=Europe/Brussels:20261119T080000'],
    ['DTSTART;TZID=Europe/Brussels:20000131T090000', 'DURATION:PT1H', 'RRULE:FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1', 'RDATE;TZID=Europe/Brussels:20261205T090000']
  ]) {
    const ics = agendaTz(['UID:rd@exemple.invalid', ...lignes, 'SUMMARY:Avec RDATE']);
    for (const instant of [LUNDI, new Date('2026-03-29T12:00:00Z')]) {
      const { debut, fin } = Cal.fenetre(instant, C);
      const obtenu = lire(ics, instant);
      assert.ok(obtenu.length > 0, 'des occurrences : ' + lignes.join(' '));
      assert.deepEqual(obtenu, referenceComplete(ics, debut, fin), lignes.join(' ') + ' @ ' + instant.toISOString());
    }
  }
});

test('le résultat ne dépend PAS de la vitesse de la machine : plafond en nombre de tours (machine ralentie simulée)', () => {
  const ics = agendaTz(['UID:d@exemple.invalid', 'DTSTART;TZID=Europe/Brussels:20000131T090000', 'DURATION:PT1H',
    'RRULE:FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1', 'SUMMARY:Dernier jour ouvré']);
  const avant = Cal.construireCache(ics, LUNDI, C, ICAL).evenements;
  const vraiNow = Date.now;
  let faux = vraiNow();
  Date.now = () => (faux += 50);                           // chaque lecture de l'heure « dure » 50 ms : machine très lente
  try {
    assert.deepEqual(Cal.construireCache(ics, LUNDI, C, ICAL).evenements, avant);
  } finally { Date.now = vraiNow; }
  assert.equal(avant.length, 4);                           // derniers jours ouvrés de novembre 2026 à février 2027 (fenêtre jusqu'à mi-mars)
  // Le plafond de tours, lui, est le même partout : une règle qui le dépasse donne toujours le même résultat
  const enorme = agendaTz(['UID:e@exemple.invalid', 'DTSTART;TZID=Europe/Brussels:20150105T100000', 'DURATION:PT5M',
    'RRULE:FREQ=MINUTELY;BYMINUTE=0,30;COUNT=500000', 'SUMMARY:Énorme']);
  const r1 = Cal.construireCache(enorme, LUNDI, C, ICAL).evenements.length;
  Date.now = () => (faux += 50);
  try { assert.equal(Cal.construireCache(enorme, LUNDI, C, ICAL).evenements.length, r1); } finally { Date.now = vraiNow; }
});

test('règle IMPOSSIBLE (« le 30 février » tous les jours ou toutes les heures) : jamais d\'appli figée, le reste de l\'agenda est lu', () => {
  // Dans un processus à part, avec un délai maximal : si ical.js tournait sans fin, le test échoue au lieu de bloquer GitHub
  const { spawnSync } = require('node:child_process');
  const script = `
    globalThis.window = globalThis;
    require(${JSON.stringify(path.join(__dirname, '..', 'www', 'config.js'))});
    const ICAL = require(${JSON.stringify(path.join(__dirname, '..', 'www', 'lib', 'ical.min.js'))});
    const Cal = require(${JSON.stringify(path.join(__dirname, '..', 'www', 'calendrier.js'))});
    const sortie = [];
    for (const regle of ['FREQ=DAILY;BYMONTH=2;BYMONTHDAY=30', 'FREQ=HOURLY;BYMONTH=2;BYMONTHDAY=30', 'FREQ=DAILY;BYMONTH=4,6;BYMONTHDAY=31,-31']) {
      const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0',
        'BEGIN:VEVENT', 'UID:i@exemple.invalid', 'DTSTAMP:20260101T000000Z', 'DTSTART:20261117T080000Z', 'DURATION:PT1H', 'RRULE:' + regle, 'SUMMARY:Impossible', 'END:VEVENT',
        'BEGIN:VEVENT', 'UID:ok@exemple.invalid', 'DTSTAMP:20260101T000000Z', 'DTSTART:20261118T100000Z', 'DURATION:PT1H', 'SUMMARY:Normal', 'END:VEVENT', 'END:VCALENDAR'].join('\\r\\n');
      sortie.push(Cal.construireCache(ics, new Date('2026-11-16T09:00:00Z'), globalThis.CONFIG, ICAL).evenements.map(e => e.titre).join(','));
    }
    console.log(JSON.stringify(sortie));`;
  const r = spawnSync(process.execPath, ['-e', script], { timeout: 20000, encoding: 'utf8' });
  assert.equal(r.signal, null, 'figé : délai dépassé');
  assert.equal(r.status, 0, r.stderr);
  // Seul le DTSTART de la règle impossible reste (comme ical.js pour MONTHLY / YEARLY), et l'autre événement est bien lu
  assert.deepEqual(JSON.parse(r.stdout), ['Impossible,Normal', 'Impossible,Normal', 'Impossible,Normal']);
  // Une règle possible (29 février, 30 mars) n'est pas touchée
  const V = (regle) => new ICAL.Component(ICAL.parse(agendaTz(['UID:p@exemple.invalid', 'DTSTART:20250101T100000Z', 'RRULE:' + regle, 'SUMMARY:P']))).getFirstSubcomponent('vevent');
  assert.equal(Cal.regleImpossible(V('FREQ=DAILY;BYMONTH=2;BYMONTHDAY=29')), false);
  assert.equal(Cal.regleImpossible(V('FREQ=DAILY;BYMONTH=2,3;BYMONTHDAY=30')), false);
  assert.equal(Cal.regleImpossible(V('FREQ=WEEKLY;BYDAY=MO')), false);
  assert.equal(Cal.regleImpossible(V('FREQ=DAILY;BYMONTH=2;BYMONTHDAY=30')), true);
});
