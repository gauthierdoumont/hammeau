/* mises-a-jour.js — Hameau — comparer la version installée à la dernière Release GitHub — Créé par Gauthier Doumont
 * Fonctions PURES (testées dans node : tests/mises-a-jour.test.js). L'appel réseau est dans app.js
 * (c'est la seule fonction en ligne de l'appli, et seulement quand on touche le bouton).
 */
(function (racine) {
  'use strict';
  const MAJ = {};

  MAJ.ADRESSE = 'https://api.github.com/repos/gauthierdoumont/hammeau/releases/latest';

  // « v1.2.3-build.45 » → « 1.2.3 » ; null si ce n'est pas une version
  MAJ.versionDuTag = function (tag) {
    const m = /^v?(\d+)\.(\d+)\.(\d+)/.exec(String(tag ?? '').trim());
    return m ? `${+m[1]}.${+m[2]}.${+m[3]}` : null;
  };

  // -1 si a < b, 0 si égales, 1 si a > b (comparaison nombre par nombre : 1.10.0 > 1.9.0)
  MAJ.comparer = function (a, b) {
    const pa = String(a).split('.').map(Number), pb = String(b).split('.').map(Number);
    for (let i = 0; i < 3; i++) {
      const x = pa[i] || 0, y = pb[i] || 0;
      if (x !== y) return x < y ? -1 : 1;
    }
    return 0;
  };

  // Réponse de l'API GitHub → {nouvelle, version, url} ; null si la réponse est inutilisable
  MAJ.analyser = function (json, versionInstallee) {
    const version = MAJ.versionDuTag(json?.tag_name);
    const actuelle = MAJ.versionDuTag(versionInstallee);
    if (!version || !actuelle) return null;
    const url = typeof json.html_url === 'string' && json.html_url.startsWith('https://github.com/') ? json.html_url : null;
    return { nouvelle: MAJ.comparer(version, actuelle) > 0, version, url };
  };

  if (typeof module !== 'undefined') module.exports = MAJ; else racine.MisesAJour = MAJ;
})(typeof window !== 'undefined' ? window : globalThis);
