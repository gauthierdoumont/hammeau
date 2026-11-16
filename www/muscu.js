/* muscu.js — Hameau — import des séances de l'appli Muscu (export JSON « muscu-gd ») → XP automatique — Créé par Gauthier Doumont
 * Fonctions PURES (tests/muscu.test.js, export FICTIF tests/fixtures/muscu-export.json).
 * Format lu (appli Muscu, EXPORT_FORMAT 1) : {app: 'muscu-gd', format: 1, exportedAt, data: {sessions: [
 *   {id, kind: 'muscu' | 'express' | 'elastique' | 'course', title, start (ms), end, durMin, setsDone, km?, sec?}]}}
 * Chaque séance compte UNE fois (journal : tacheId null + muscu: id), à son jour logique, si elle a moins de C.muscu.joursMax jours.
 */
(function (racine) {
  'use strict';
  const Mu = {};
  const J = racine.Temps || (typeof require !== 'undefined' ? require('./temps.js') : null);
  const M = racine.Moteur || (typeof require !== 'undefined' ? require('./moteur.js') : null);
  const FORMAT_MAX = 1;

  // Texte du fichier → {ok: true, seances} | {ok: false, message}. Ne garde que ce qui sert (aucune donnée de santé copiée).
  Mu.analyser = function (texte) {
    const non = (message) => ({ ok: false, message });
    let j;
    try { j = JSON.parse(texte); } catch { return non('Ce fichier ne vient pas de l\'appli Muscu.'); }
    if (!j || j.app !== 'muscu-gd' || !j.data || !Array.isArray(j.data.sessions)) return non('Ce fichier ne vient pas de l\'appli Muscu.');
    if (+j.format > FORMAT_MAX) return non('Cet export vient d\'une version plus récente de l\'appli Muscu : mets d\'abord Hameau à jour.');
    const seances = j.data.sessions
      // Date lisible obligatoire (un start énorme ferait planter le calcul du jour)
      .filter(s => s && typeof s.id === 'string' && s.id && Number.isFinite(+s.start) && !isNaN(new Date(+s.start).getTime()))
      .map(s => ({
        id: s.id, kind: String(s.kind || 'muscu'), titre: String(s.title || (s.kind === 'course' ? 'Course' : 'Séance de muscu')).slice(0, 80),
        debut: +s.start, durMin: Number.isFinite(+s.durMin) ? +s.durMin : Math.round(((+s.end || +s.start) - +s.start) / 60000),
        km: Number.isFinite(+s.km) ? +s.km : null, series: +s.setsDone || 0
      }));
    return { ok: true, seances, exporteLe: j.exportedAt || null };
  };

  // Taille d'une séance (comme une tâche) : durée pour la muscu, distance pour la course
  Mu.taille = function (seance, C) {
    const m = C.muscu;
    if (seance.kind === 'course' && seance.km !== null) return seance.km >= m.tailleKm.grosse ? 'grosse' : seance.km >= m.tailleKm.moyenne ? 'moyenne' : 'petite';
    return seance.durMin >= m.tailleMinutes.grosse ? 'grosse' : seance.durMin >= m.tailleMinutes.moyenne ? 'moyenne' : 'petite';
  };

  /* Ce que l'import va faire, séance par séance (sans rien modifier) :
   * statut 'nouvelle' | 'deja' (déjà comptée) | 'ancienne' (> joursMax) | 'future' (date après maintenant) */
  Mu.planifier = function (etat, seances, instant, C) {
    const deja = new Set(etat.journal.filter(s => s.muscu).map(s => s.muscu));
    const aujourdhui = J.jourLogique(instant, C);
    const limite = J.ajouterJours(aujourdhui, -C.muscu.joursMax);
    const cats = C.muscu.categories;
    return seances
      .map(seance => {
        const jour = J.jourLogique(new Date(seance.debut), C);
        const statut = deja.has(seance.id) ? 'deja' : seance.debut > instant.getTime() ? 'future' : jour < limite ? 'ancienne' : 'nouvelle';
        deja.add(seance.id);                           // même id deux fois dans le fichier : la 2e est « déjà comptée »
        // hasOwn : un type « constructor » ou « toString » n'est pas une catégorie
        return { seance, jour, statut, categorieId: Object.hasOwn(cats, seance.kind) ? cats[seance.kind] : cats.muscu, taille: Mu.taille(seance, C) };
      })
      .sort((a, b) => a.seance.debut - b.seance.debut);
  };

  /* Importer les nouvelles séances (dans modifier())
   * → {importees, xp, ressources {id: q}, niveauxGagnes, deja, anciennes, futures, defi (récompense d'une tempête relevée) | null} */
  Mu.importer = function (etat, plan, nouvelId, C) {
    const r = { importees: 0, xp: 0, ressources: {}, niveauxGagnes: 0, deja: 0, anciennes: 0, futures: 0, defi: null };
    for (const p of plan) {
      if (p.statut === 'deja') { r.deja++; continue; }
      if (p.statut === 'future') { r.futures++; continue; }
      if (p.statut !== 'nouvelle') { r.anciennes++; continue; }
      const g = M.saisieExterne(etat, { champ: 'muscu', cle: p.seance.id, titre: p.seance.titre, categorieId: p.categorieId, taille: p.taille, type: C.muscu.type },
        { id: nouvelId(), horodatage: new Date(p.seance.debut).toISOString(), jour: p.jour }, C);
      r.importees++;
      r.xp += g.gain;
      r.niveauxGagnes += g.niveauxGagnes;
      if (g.ressource) r.ressources[g.ressource] = (r.ressources[g.ressource] || 0) + g.gain;
      if (g.defi) r.defi = g.defi;                    // tempête du jour relevée grâce à l'import
    }
    return r;
  };

  if (typeof module !== 'undefined') module.exports = Mu; else racine.Muscu = Mu;
})(typeof window !== 'undefined' ? window : globalThis);
