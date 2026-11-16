/* boss.js — Hameau — les examens deviennent des boss : révisions = dégâts, récompense le jour J — Créé par Gauthier Doumont
 * Fonctions PURES (tests/boss.test.js). Rien n'est stocké pour les dégâts : ils sont recalculés depuis le journal
 * (saisies des catégories de révision), donc toujours justes, même après un Annuler, un import ou une restauration.
 * Seule la récompense reçue est notée : agenda.recompenses[cle] = jour.
 * Ton : on ne « perd » jamais contre un boss. Le jour J, la récompense est toujours là (au moins une part).
 */
(function (racine) {
  'use strict';
  const B = {};
  const J = racine.Temps || (typeof require !== 'undefined' ? require('./temps.js') : null);
  const Cal = racine.Calendrier || (typeof require !== 'undefined' ? require('./calendrier.js') : null);

  /* Boss de l'agenda : examens (titre ou marquage manuel) entre aujourd'hui et la fin de leur fenêtre.
   * → [{cle, titre, debut, jourExamen, apparition, pvMax}] triés par date (le plus proche d'abord)
   */
  B.liste = function (etat, C) {
    const evs = etat.reglages?.calendrierCache?.evenements || [];
    return evs.filter(ev => Cal.estExamenMarque(ev, etat.agenda?.examens))
      .map(ev => {
        const jourExamen = Cal.jourDe(ev, C);
        return { cle: Cal.cle(ev), titre: ev.titre, debut: ev.debut, journee: ev.journee, jourExamen,
          apparition: J.ajouterJours(jourExamen, -C.boss.joursAvant), pvMax: C.boss.pv };
      })
      .sort((a, b) => (a.jourExamen < b.jourExamen ? -1 : a.jourExamen > b.jourExamen ? 1 : a.debut < b.debut ? -1 : 1));
  };

  // Saisies qui font des dégâts : tâches des catégories de révision (gain XP = dégâts)
  function coups(etat, C) {
    const cats = new Set(C.boss.categories);
    const parTache = new Map(etat.taches.map(t => [t.id, t.categorieId]));
    return etat.journal
      .filter(s => s.tacheId && cats.has(parTache.get(s.tacheId)) && (s.gains?.xp || 0) > 0)
      .sort((a, b) => (a.horodatage < b.horodatage ? -1 : a.horodatage > b.horodatage ? 1 : 0));
  }

  /* État de tous les boss : chaque révision frappe le boss le plus proche encore debout dont la fenêtre
   * contient ce jour (apparition ≤ jour ≤ jour de l'examen) ; le surplus passe au suivant.
   * → [{…boss, degats, pv, vaincu}]
   */
  B.etats = function (etat, C) {
    const boss = B.liste(etat, C).map(b => ({ ...b, degats: 0 }));
    for (const s of coups(etat, C)) {
      let reste = s.gains.xp;
      for (const b of boss) {
        if (reste <= 0) break;
        if (s.jour < b.apparition || s.jour > b.jourExamen || b.degats >= b.pvMax) continue;
        const coup = Math.min(reste, b.pvMax - b.degats);
        b.degats += coup;
        reste -= coup;
      }
    }
    return boss.map(b => ({ ...b, pv: b.pvMax - b.degats, vaincu: b.degats >= b.pvMax }));
  };

  /* Boss à montrer aujourd'hui : apparus, pas encore passés (jusqu'au jour J inclus), ou passés depuis peu
   * avec une récompense à prendre (jusqu'à C.boss.joursApres jours après ; le cache de l'agenda les garde).
   * Compte à rebours en jours.
   */
  B.actifs = function (etat, jour, C) {
    const recues = etat.agenda?.recompenses || {};
    return B.etats(etat, C)
      .filter(b => b.apparition <= jour && (b.jourExamen >= jour || (!recues[b.cle] && J.ajouterJours(b.jourExamen, C.boss.joursApres) >= jour)))
      .map(b => ({ ...b, dans: joursEntre(jour, b.jourExamen), recue: !!recues[b.cle] }));
  };
  function joursEntre(a, b) {
    const [x, y] = [a, b].map(j => { const [an, m, d] = j.split('-').map(Number); return Date.UTC(an, m - 1, d); });
    return Math.round((y - x) / 86400000);
  }

  // Récompense : complète si vaincu, sinon une part (au moins partMin) — on a passé l'examen, ça compte
  B.recompense = function (b, C) {
    const part = b.vaincu ? 1 : Math.max(C.boss.partMin, b.degats / b.pvMax);
    return Object.fromEntries(Object.entries(C.boss.recompense).map(([r, q]) => [r, Math.max(1, Math.round(q * part))]));
  };
  // On peut la prendre dès que l'examen a commencé (journée entière : dès le jour J)
  B.recompenseOuverte = (b, instant, jour) => (b.journee ? jour >= b.jourExamen : instant.getTime() >= Date.parse(b.debut));

  /* Prendre la récompense (une seule fois) — modifie etat (dans modifier()) → {ok, recompense, vaincu} | {ok: false, erreur} */
  B.recuperer = function (etat, cle, instant, jour, C) {
    const b = B.actifs(etat, jour, C).find(x => x.cle === cle);
    if (!b) return { ok: false, erreur: 'Cet examen n\'est plus dans ton agenda.' };
    if (b.recue) return { ok: false, erreur: 'Récompense déjà reçue 🏆' };
    if (!B.recompenseOuverte(b, instant, jour)) return { ok: false, erreur: 'La récompense t\'attend le jour de l\'examen ⏳' };
    const recompense = B.recompense(b, C);
    for (const [r, q] of Object.entries(recompense)) etat.joueur.ressources[r] = (etat.joueur.ressources[r] || 0) + q;
    etat.agenda.recompenses ??= {};
    etat.agenda.recompenses[cle] = jour;
    return { ok: true, recompense, vaincu: b.vaincu };
  };

  if (typeof module !== 'undefined') module.exports = B; else racine.Boss = B;
})(typeof window !== 'undefined' ? window : globalThis);
