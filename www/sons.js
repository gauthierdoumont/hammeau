/* sons.js — Hameau — petits sons de récompense (Web Audio) — Créé par Gauthier Doumont
 * Pourquoi Web Audio : <audio> a trop de latence sur Android ; ici le son part immédiatement.
 * Les navigateurs exigent un 1er toucher avant de jouer un son : on prépare tout au 1er toucher.
 * Hauteur variée de ±5 % à chaque fois pour éviter la lassitude. Désactivable (reglages.sons).
 */
(function () {
  'use strict';
  const FICHIERS = { pose: 'pose', marteau: 'marteau', fanfare: 'fanfare', pieces: 'pieces', clic: 'clic', valide: 'valide' };
  const VOLUMES = { pose: 0.8, marteau: 0.5, fanfare: 0.6, pieces: 0.55, clic: 0.35, valide: 0.5 };
  let ctx = null, tampons = {}, chargement = null;
  let actif = () => true;

  function preparer() {
    if (ctx || !(window.AudioContext || window.webkitAudioContext)) return;
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    chargement = Promise.all(Object.entries(FICHIERS).map(async ([nom, f]) => {
      try {
        const r = await fetch(`assets/sons/${f}.ogg`);
        tampons[nom] = await ctx.decodeAudioData(await r.arrayBuffer());
      } catch (x) { console.warn('Son indisponible :', nom, x.message); }
    }));
  }
  // 1er toucher : on crée le contexte audio et on charge les sons (quelques Ko)
  const auPremierToucher = () => { preparer(); ctx?.resume?.(); };
  document.addEventListener('pointerdown', auPremierToucher, { capture: true, passive: true });

  window.Sons = {
    // fn renvoie true si les sons sont activés (branché sur reglages.sons par app.js)
    brancher(fn) { actif = fn; },
    jouer(nom, { delai = 0 } = {}) {
      if (!actif() || !ctx) return;
      const jouer = () => {
        const t = tampons[nom];
        if (!t) return;
        const src = ctx.createBufferSource(), gain = ctx.createGain();
        src.buffer = t;
        src.playbackRate.value = 0.95 + Math.random() * 0.1;
        gain.gain.value = VOLUMES[nom] ?? 0.5;
        src.connect(gain).connect(ctx.destination);
        src.start(ctx.currentTime + delai);
      };
      if (tampons[nom]) jouer(); else chargement?.then(jouer);
    },
  };
})();
