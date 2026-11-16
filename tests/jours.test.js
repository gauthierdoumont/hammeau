// tests/jours.test.js — Hameau — jour logique, rattrapage, séries, joker, moral, incendies, pause — Créé par Gauthier Doumont
// Cas obligatoires (CLAUDE.md §6) : 0, 1 et 10 jours manqués, heure d'été / d'hiver, lundi franchi, pause, incendie unique.
const test = require('node:test');
const assert = require('node:assert/strict');

globalThis.window = globalThis;
require('../www/config.js');
const S = require('../www/stockage.js');
const T = require('../www/taches.js');
const M = require('../www/moteur.js');
const E = require('../www/economie.js');
const Tm = require('../www/temps.js');
const D = require('../www/jours.js');
const C = globalThis.CONFIG;

// Instant à Bruxelles (heure d'hiver, UTC+1) : « 2026-11-16 14:00 »
const a = (jour, heure = '14:00') => new Date(`${jour}T${heure}:00+01:00`);
let n = 0;
function etatDe(dernierJourTraite, ...taches) {
  const e = S.etatInitial(C);
  e.etat.dernierJourTraite = dernierJourTraite;
  taches.forEach((s, i) => T.ajouterTache(e, T.creerTache({ categorieId: 'lecture', ...s }, e, C, 't' + i, '2026-10-01T08:00:00.000Z').tache));
  return e;
}
const faire = (e, id, jour) => M.saisir(e, id, null, { id: 's' + (++n), horodatage: jour + 'T12:00:00.000Z', jour }, C);

test('0 jour manqué : rien ne change', () => {
  const e = etatDe('2026-11-15', { nom: 'Lire', type: 'quotidienne' });
  const r = D.rattraper(e, a('2026-11-16'), C);
  assert.equal(r.jours, 0);
  assert.deepEqual(r.etat.joueur, e.joueur);
});

test('1 jour manqué (quotidienne non faite) : moral −5, série remise à 0 (sans joker)', () => {
  const e = etatDe('2026-11-14', { nom: 'Lire', type: 'quotidienne' });
  e.joueur.serie = { jours: 6, joker: 0 };
  const r = D.rattraper(e, a('2026-11-16'), C);      // traite le 15 (dimanche)
  assert.equal(r.jours, 1);
  assert.equal(r.etat.joueur.moral, C.moral.depart - 5);
  assert.equal(r.etat.joueur.serie.jours, 0);
  assert.equal(r.etat.etat.dernierJourTraite, '2026-11-15');
  assert.equal(e.joueur.moral, C.moral.depart, 'l\'état reçu n\'est pas modifié');
});

test('jour validé : ≥ 1 quotidienne faite ET ≥ 30 XP → série +1 ; une petite tâche seule ne suffit pas', () => {
  const e = etatDe('2026-11-14', { nom: 'Lire', type: 'quotidienne' }, { nom: 'Mini', type: 'quotidienne', taille: 'petite' });
  faire(e, 't0', '2026-11-15');                       // 25 XP… + rien d'autre : 25 < 30
  let r = D.rattraper(e, a('2026-11-16'), C);
  assert.equal(r.etat.joueur.serie.jours, 0);
  const e2 = etatDe('2026-11-14', { nom: 'Lire', type: 'quotidienne' }, { nom: 'Mini', type: 'quotidienne', taille: 'petite' });
  faire(e2, 't0', '2026-11-15'); faire(e2, 't1', '2026-11-15');   // 35 XP
  r = D.rattraper(e2, a('2026-11-16'), C);
  assert.equal(r.etat.joueur.serie.jours, 1);
  assert.equal(r.etat.joueur.moral, C.moral.depart + 2);          // +1 par tâche, aucune pénalité
});

test('jour sans quotidienne prévue : neutre (ni gain ni perte)', () => {
  const e = etatDe('2026-11-14', { nom: 'Muscu', type: 'quotidienne', jours: [1, 3, 5] });  // pas le dimanche 15
  e.joueur.serie = { jours: 4, joker: 0 };
  const r = D.rattraper(e, a('2026-11-16'), C);
  assert.equal(r.etat.joueur.serie.jours, 4);
  assert.equal(r.etat.joueur.moral, C.moral.depart);
});

test('10 jours manqués : moral plancher 0, joker utilisé puis série à 0, lundis franchis', () => {
  const e = etatDe('2026-11-05', { nom: 'A', type: 'quotidienne' }, { nom: 'B', type: 'quotidienne' });
  e.joueur.serie = { jours: 9, joker: 1 };
  const r = D.rattraper(e, a('2026-11-16'), C);       // du 6 au 15 inclus
  assert.equal(r.jours, 10);
  assert.equal(r.etat.joueur.moral, 0);               // 80 − 2 × 5 × 10, plancher 0
  assert.equal(r.etat.joueur.serie.jours, 0);
  assert.equal(r.evenements.filter(v => v.type === 'joker').length, 2);   // 1 joker la 1re semaine, 1 après le lundi 9
  assert.equal(r.etat.joueur.serie.joker, 0);
});

test('lundi franchi : le joker revient à 1', () => {
  const e = etatDe('2026-11-15', { nom: 'Muscu', type: 'quotidienne', jours: [2] });   // rien de prévu le lundi
  e.joueur.serie = { jours: 3, joker: 0 };
  const r = D.rattraper(e, a('2026-11-17'), C);       // traite le lundi 16
  assert.equal(r.etat.joueur.serie.joker, 1);
});

test('« hier » reste ouvert jusqu\'à midi (saisie de la veille possible), puis il est traité', () => {
  const e = etatDe('2026-11-14', { nom: 'Lire', type: 'quotidienne' });
  assert.equal(D.hierOuvert(a('2026-11-16', '09:30'), C), true);
  let r = D.rattraper(e, a('2026-11-16', '09:30'), C);
  assert.equal(r.jours, 0);                            // le 15 attend midi
  faire(r.etat, 't0', '2026-11-15');                   // « je l'ai fait hier »
  r = D.rattraper(r.etat, a('2026-11-16', '12:01'), C);
  assert.equal(r.jours, 1);
  assert.equal(r.etat.joueur.moral, C.moral.depart + 1);   // pas de pénalité : c'était fait
  // À 2 h du matin, on est encore « la veille » : hier = l'avant-veille civile, déjà close
  assert.equal(D.hierOuvert(a('2026-11-17', '02:00'), C), false);
});

test('heure d\'été : la nuit du changement d\'heure ne saute ni ne double aucun jour', () => {
  const e = etatDe('2026-03-27', { nom: 'Lire', type: 'quotidienne' });
  const r = D.rattraper(e, new Date('2026-03-30T12:00:00+02:00'), C);   // traite 28 et 29 (nuit du passage à l'heure d'été)
  assert.equal(r.jours, 2);
  assert.equal(r.etat.etat.dernierJourTraite, '2026-03-29');
  assert.equal(D.aujourdhui(new Date('2026-03-29T03:30:00+02:00'), C), '2026-03-28');   // 3 h 30 heure d'été : encore le 28
});

test('heure d\'hiver : idem dans la nuit du retour à l\'heure d\'hiver', () => {
  const e = etatDe('2026-10-23', { nom: 'Lire', type: 'quotidienne' });
  const r = D.rattraper(e, new Date('2026-10-26T12:00:00+01:00'), C);
  assert.equal(r.jours, 2);                            // 24 et 25
  assert.equal(r.etat.etat.dernierJourTraite, '2026-10-25');
});

test('pause : jours couverts sans pénalité, série gelée', () => {
  const e = etatDe('2026-11-10', { nom: 'Lire', type: 'quotidienne' });
  e.joueur.serie = { jours: 5, joker: 0 };
  e.joueur.pause = { actif: true, depuis: '2026-11-11', jusqua: null };
  const r = D.rattraper(e, a('2026-11-16'), C);
  assert.equal(r.etat.joueur.moral, C.moral.depart);
  assert.equal(r.etat.joueur.serie.jours, 5);
});

test('pause rétroactive : les pénalités depuis la date choisie sont annulées', () => {
  const e = etatDe('2026-11-12', { nom: 'Lire', type: 'quotidienne' });
  e.joueur.serie = { jours: 7, joker: 0 };
  const r1 = D.rattraper(e, a('2026-11-16'), C);       // 13, 14, 15 : −15 de moral, série à 0
  assert.equal(r1.etat.joueur.moral, C.moral.depart - 15);
  assert.equal(r1.etat.joueur.serie.jours, 0);
  const r2 = D.activerPause(r1.etat, '2026-11-13', a('2026-11-16'), C);
  assert.equal(r2.ok, true);
  assert.equal(r2.etat.joueur.moral, C.moral.depart);
  assert.equal(r2.etat.joueur.serie.jours, 7);
  // Ce qui a été gagné entre-temps est gardé : moral perdu rendu, pas écrasé
  const r1b = structuredClone(r1.etat); r1b.joueur.moral += 3;
  assert.equal(D.activerPause(r1b, '2026-11-13', a('2026-11-16'), C).etat.joueur.moral, C.moral.depart + 3);
  assert.equal(r2.etat.etat.dernierJourTraite, '2026-11-15');
  assert.equal(D.activerPause(r1.etat, '2026-11-01', a('2026-11-16'), C).ok, false);   // plus de 7 jours en arrière
  // Fin de pause : aujourd'hui compte de nouveau normalement
  const fin = D.finirPause(r2.etat, a('2026-11-16'), C);
  assert.equal(fin.joueur.pause.jusqua, '2026-11-15');
  const r3 = D.rattraper(fin, a('2026-11-18'), C);    // le 16 et le 17 : pénalités normales
  assert.equal(r3.etat.joueur.moral, C.moral.depart - 10);
  assert.equal(r3.etat.joueur.pause.actif, false);
});

test('rien à traiter (tick de la minute) : même objet rendu, rien de changé, pas de copie', () => {
  const e = etatDe('2026-11-15', { nom: 'Lire', type: 'quotidienne' });
  e.etat.evenements = [{ jour: '2026-11-14', type: 'joker', avant: { serie: 2, joker: 1 } }];
  const r = D.rattraper(e, a('2026-11-16'), C);
  assert.equal(r.change, false);
  assert.equal(r.jours, 0);
  assert.equal(r.etat, e, 'même objet : « Annuler » reste possible dans l\'appli');
  // Le matin, « hier » est encore ouvert : toujours rien à faire
  assert.equal(D.rattraper(e, a('2026-11-17', '09:00'), C).change, false);
  // Après midi, le 16 est traité : nouvel état
  const r2 = D.rattraper(e, a('2026-11-17'), C);
  assert.equal(r2.change, true);
  assert.notEqual(r2.etat, e);
  assert.equal(r2.etat.etat.dernierJourTraite, '2026-11-16');
  // Pause finie mais pas encore rangée, ou vieil événement à oublier : il y a quelque chose à faire
  const p = etatDe('2026-11-15');
  p.joueur.pause = { actif: true, depuis: '2026-11-10', jusqua: '2026-11-15' };
  assert.equal(D.rattraper(p, a('2026-11-16'), C).change, true);
  const v = etatDe('2026-11-15');
  v.etat.evenements = [{ jour: '2026-11-01', type: 'joker', avant: { serie: 1, joker: 1 } }];
  const rv = D.rattraper(v, a('2026-11-16'), C);
  assert.equal(rv.change, true);
  assert.equal(rv.etat.etat.evenements.length, 0);
});

test('reprendre puis relancer une pause le même matin : la veille reste couverte', () => {
  const e = etatDe('2026-11-12', { nom: 'Lire', type: 'quotidienne' });
  e.joueur.pause = { actif: true, depuis: '2026-11-13', jusqua: null };
  const matin = a('2026-11-17', '09:00');                // « hier » (le 16) pas encore traité
  const r1 = D.rattraper(e, matin, C);
  assert.equal(r1.etat.etat.dernierJourTraite, '2026-11-15');
  const fin = D.finirPause(r1.etat, matin, C);           // reprise : pause jusqu'au 16
  assert.equal(fin.joueur.pause.jusqua, '2026-11-16');
  const re = D.activerPause(fin, '2026-11-17', a('2026-11-17', '09:30'), C);   // nouvelle pause aujourd'hui
  assert.equal(re.ok, true);
  assert.equal(re.etat.joueur.pause.depuis, '2026-11-13', 'l\'ancienne pause est prolongée, pas écrasée');
  const midi = D.rattraper(re.etat, a('2026-11-17'), C); // le 16 est traité : couvert
  assert.equal(midi.etat.joueur.moral, C.moral.depart);
  // Ancienne pause entièrement traitée : la nouvelle commence bien à la date choisie
  const fin2 = D.finirPause(r1.etat, a('2026-11-16'), C);   // jusqu'au 15, déjà traité
  assert.equal(D.activerPause(fin2, '2026-11-16', a('2026-11-16'), C).etat.joueur.pause.depuis, '2026-11-16');
});

test('événements gardés : autant de jours que la pause rétroactive permet (config.js)', () => {
  const C10 = { ...C, pause: { ...C.pause, retroJoursMax: 10 } };
  const e = etatDe('2026-11-05', { nom: 'Lire', type: 'quotidienne' });
  const r = D.rattraper(e, a('2026-11-16'), C10);        // du 6 au 15 : 10 jours de moral −5
  assert.equal(r.etat.etat.evenements.filter(v => v.type === 'moral').length, 10);
  const p = D.activerPause(r.etat, '2026-11-06', a('2026-11-16'), C10);
  assert.equal(p.ok, true);
  assert.equal(p.etat.joueur.moral, C.moral.depart, 'tout est rendu, même 10 jours en arrière');
  // Avec la config de l'appli (7 jours) : seuls les 8 derniers jours restent annulables
  const r7 = D.rattraper(e, a('2026-11-16'), C);
  assert.equal(r7.etat.etat.evenements.filter(v => v.type === 'moral').length, C.pause.retroJoursMax + 1);
});

test('incendie : une seule fois par tâche ; bâtiment endommagé, ou perte de 20 % (max 50) sans village', () => {
  // Sans bâtiment : perte de ressource
  const e = etatDe('2026-11-14', { nom: 'Dossier', categorieId: 'papiers', echeance: '2026-11-14', important: true });
  e.joueur.ressources.or = 300;
  let r = D.rattraper(e, a('2026-11-16'), C);
  assert.equal(r.evenements.filter(v => v.type === 'incendie').length, 1);
  assert.equal(r.etat.joueur.ressources.or, 250);     // 20 % de 300 = 60 → plafonné à 50
  r = D.rattraper(r.etat, a('2026-11-20'), C);
  assert.equal(r.evenements.filter(v => v.type === 'incendie').length, 0, 'jamais deux fois');
  // Avec un village : un bâtiment endommagé
  const e2 = etatDe('2026-11-14', { nom: 'Dossier', categorieId: 'papiers', echeance: '2026-11-15', important: true });
  for (const k of Object.keys(e2.joueur.ressources)) e2.joueur.ressources[k] = 500;
  E.construire(e2, 'mairie', 6, 3, { id: 'm', quand: 'x' }, C);
  const r2 = D.rattraper(e2, a('2026-11-16'), C, () => 0);
  assert.equal(r2.etat.village.batiments[0].endommage, true);
  assert.equal(r2.etat.joueur.ressources.papiers, undefined);
  // Pas d'incendie si la tâche est faite, ou si elle n'est pas « importante »
  const e3 = etatDe('2026-11-14', { nom: 'Fait', echeance: '2026-11-14', important: true }, { nom: 'Pas important', echeance: '2026-11-14' });
  faire(e3, 't0', '2026-11-14');
  assert.equal(D.rattraper(e3, a('2026-11-16'), C).evenements.filter(v => v.type === 'incendie').length, 0);
});

test('incendie : une échéance tombée pendant une pause n\'en provoque jamais (même après une autre pause)', () => {
  const e = etatDe('2026-11-09', { nom: 'Dossier', categorieId: 'papiers', echeance: '2026-11-12', important: true },
    { nom: 'Après la pause', categorieId: 'papiers', echeance: '2026-11-14', important: true });
  e.joueur.ressources.or = 300;
  e.joueur.pause = { actif: true, depuis: '2026-11-10', jusqua: '2026-11-13' };
  let r = D.rattraper(e, a('2026-11-16'), C);
  const incendies = r.evenements.filter(v => v.type === 'incendie');
  assert.deepEqual(incendies.map(v => v.nom), ['Après la pause']);    // l'échéance hors pause compte toujours
  assert.equal(r.etat.taches[0].incendieApplique, true);               // traitée sans incendie
  // Une nouvelle pause remplace l'ancienne : l'échéance du 12 ne brûle toujours pas
  r.etat.joueur.pause = { actif: true, depuis: '2026-11-20', jusqua: '2026-11-21' };
  r = D.rattraper(r.etat, a('2026-11-25'), C);
  assert.equal(r.evenements.filter(v => v.type === 'incendie').length, 0);
});

test('1er lancement : on démarre à hier, rien à rattraper ; message de retour seulement si utile', () => {
  const e = S.etatInitial(C);
  const r = D.rattraper(e, a('2026-11-16'), C);
  assert.equal(r.etat.etat.dernierJourTraite, '2026-11-15');
  assert.equal(D.messageRetour(r, r.etat, C, () => ''), null);
  const e2 = etatDe('2026-11-10', { nom: 'Lire', type: 'quotidienne' });
  e2.joueur.serie = { jours: 3, joker: 0 };
  const r2 = D.rattraper(e2, a('2026-11-16'), C);
  const msg = D.messageRetour(r2, r2.etat, C, () => '');
  assert.match(msg.titre, /Content de te revoir/);
  assert.ok(msg.lignes.some(l => /repart de zéro/.test(l)));
  for (const l of msg.lignes) assert.doesNotMatch(l, /raté|échec|seulement|oublié|paresse/i, 'aucun mot culpabilisant');
});
