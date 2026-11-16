/* temps.js — Hameau — jours (jour logique, calendrier) — Créé par Gauthier Doumont
 * Fonctions PURES : l'instant est toujours passé en paramètre. Jours = chaînes « AAAA-MM-JJ ».
 * Pourquoi : les bugs de dates n'apparaissent qu'une nuit de changement d'heure → tout est testé dans node.
 */
(function (racine) {
  'use strict';
  const J = {};
  const formats = {};

  function format(fuseau) {
    return formats[fuseau] ??= new Intl.DateTimeFormat('en-CA', {
      timeZone: fuseau, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23'
    });
  }

  // Date et heure à l'heure locale du fuseau (Bruxelles), sans jamais soustraire de millisecondes
  J.partiesLocales = function (instant, fuseau) {
    const p = Object.fromEntries(format(fuseau).formatToParts(instant).map(x => [x.type, x.value]));
    return { jour: `${p.year}-${p.month}-${p.day}`, heure: +p.hour % 24 };
  };

  // Calcul de CALENDRIER en UTC (UTC n'a pas d'heure d'été : « +1 jour » est toujours exact)
  J.ajouterJours = function (jour, n) {
    const [a, m, j] = jour.split('-').map(Number);
    return new Date(Date.UTC(a, m - 1, j + n)).toISOString().slice(0, 10);
  };

  // 1 = lundi … 7 = dimanche
  J.jourIso = function (jour) {
    const [a, m, j] = jour.split('-').map(Number);
    return (new Date(Date.UTC(a, m - 1, j)).getUTCDay() + 6) % 7 + 1;
  };

  // La journée se termine à 4 h du matin (config) : à 2 h, on est encore « hier »
  J.jourLogique = function (instant, C) {
    const { jour, heure } = J.partiesLocales(instant, C.jour.fuseau);
    return heure < C.jour.heureBascule ? J.ajouterJours(jour, -1) : jour;
  };

  /* Instant correspondant à « jour à HH:MM, heure de Bruxelles » (rappels : 8 h, 20 h…).
   * Décalage du fuseau lu par Intl à cet instant-là (2 passes : juste aussi les jours de changement d'heure).
   */
  const formatsMinute = {};
  function decalage(instant, fuseau) {            // heure locale − heure UTC, en ms
    const f = formatsMinute[fuseau] ??= new Intl.DateTimeFormat('en-CA', {
      timeZone: fuseau, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    });
    const p = Object.fromEntries(f.formatToParts(instant).map(x => [x.type, x.value]));
    return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute) - Math.floor(instant.getTime() / 60000) * 60000;
  }
  J.instantLocal = function (jour, hhmm, fuseau) {
    const [a, m, j] = jour.split('-').map(Number);
    const [h, mi] = hhmm.split(':').map(Number);
    const cible = Date.UTC(a, m - 1, j, h, mi);
    let t = cible;
    for (let i = 0; i < 2; i++) t = cible - decalage(new Date(t), fuseau);
    return new Date(t);
  };

  if (typeof module !== 'undefined') module.exports = J; else racine.Temps = J;
})(typeof window !== 'undefined' ? window : globalThis);
