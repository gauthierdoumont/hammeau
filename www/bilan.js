/* bilan.js — Hameau — bilan de la semaine (XP par jour, familles, points forts) — Créé par Gauthier Doumont
 * Fonction PURE semaine(etat, lundi, C) : tout est recalculé depuis le journal (tests/bilan.test.js).
 * Ton : on montre ce qui a été fait ; une semaine plus calme est dite sans reproche.
 */
(function (racine) {
  'use strict';
  const Bi = {};
  const J = racine.Temps || (typeof require !== 'undefined' ? require('./temps.js') : null);

  // Lundi de la semaine d'un jour (AAAA-MM-JJ)
  Bi.lundi = (jour) => J.ajouterJours(jour, 1 - J.jourIso(jour));

  // Famille d'une saisie (tâche → catégorie → famille ; présence à un cours → catégorie Cours)
  function familleDe(etat, s, C) {
    const catId = s.cours ? C.cours.categorieId : etat.taches.find(t => t.id === s.tacheId)?.categorieId;
    return etat.categories.find(c => c.id === catId)?.familleId ?? null;
  }

  /* → {lundi, dimanche, jours[7]{jour, xp, taches}, xp, taches, joursActifs, familles[{id, xp}] (triées, > 0),
   *    meilleurJour {jour, xp} | null, xpPrecedente, evolution (part, null si la semaine d'avant est vide)} */
  Bi.semaine = function (etat, lundi, C) {
    const jours = Array.from({ length: 7 }, (_, i) => ({ jour: J.ajouterJours(lundi, i), xp: 0, taches: 0 }));
    const index = new Map(jours.map((j, i) => [j.jour, i]));
    const familles = new Map();
    const lundiAvant = J.ajouterJours(lundi, -7);
    let xpPrecedente = 0;
    for (const s of etat.journal) {
      const xp = s.gains?.xp || 0;
      if (s.jour >= lundiAvant && s.jour < lundi) { xpPrecedente += xp; continue; }
      const i = index.get(s.jour);
      if (i === undefined) continue;
      jours[i].xp += xp;
      if (s.progression >= 1) jours[i].taches++;
      const f = familleDe(etat, s, C);
      if (f && xp) familles.set(f, (familles.get(f) || 0) + xp);
    }
    const xp = jours.reduce((a, j) => a + j.xp, 0);
    const meilleur = jours.reduce((a, j) => (j.xp > (a?.xp ?? 0) ? j : a), null);
    return {
      lundi, dimanche: J.ajouterJours(lundi, 6), jours, xp,
      taches: jours.reduce((a, j) => a + j.taches, 0),
      joursActifs: jours.filter(j => j.xp > 0).length,
      familles: [...familles].map(([id, x]) => ({ id, xp: x })).sort((a, b) => b.xp - a.xp),
      meilleurJour: meilleur ? { jour: meilleur.jour, xp: meilleur.xp } : null,
      xpPrecedente, evolution: xpPrecedente > 0 ? (xp - xpPrecedente) / xpPrecedente : null
    };
  };

  // Phrase d'accroche, toujours positive (jamais de comparaison négative mise en avant).
  // Que des saisies partielles (aucune tâche finie) : on parle de l'XP gagnée, jamais de « 0 tâche ».
  Bi.accroche = function (b, C) {
    if (!b.xp) return 'Semaine au calme : ton hameau t\'attend tranquillement 🌿';
    if (b.evolution !== null && b.evolution >= C.bilan.evolutionMin) return `+${Math.round(b.evolution * 100)} % d'XP par rapport à la semaine d'avant 🚀`;
    if (b.joursActifs >= C.bilan.joursActifsBravo) return `${b.joursActifs} jours actifs sur 7 : quelle régularité 🔥`;
    if (!b.taches) return `+${b.xp} XP cette semaine : chaque pas compte ✨`;
    return `${b.taches} tâche${b.taches > 1 ? 's' : ''} terminée${b.taches > 1 ? 's' : ''} : chaque pas compte ✨`;
  };

  if (typeof module !== 'undefined') module.exports = Bi; else racine.Bilan = Bi;
})(typeof window !== 'undefined' ? window : globalThis);
