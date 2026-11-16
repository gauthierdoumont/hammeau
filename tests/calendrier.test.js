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
