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
