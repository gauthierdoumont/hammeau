/* economie.js — Hameau — village : coûts, déblocages, construire, améliorer — Créé par Gauthier Doumont
 * Fonctions PURES (pas de DOM, pas d'horloge, pas de hasard) : testées dans node (tests/economie.test.js).
 * Toutes les valeurs viennent de config.js (coûts, niveaux requis, bonus) : rééquilibrer = modifier config.js.
 * Règles (CLAUDE.md §10-11) :
 *  - un bâtiment de chaque type ; niveaux 1 à 5 ;
 *  - Mairie niveau n : C.mairie.cout × n² de chaque ressource, niveau de joueur requis ;
 *  - autres bâtiments : niveau max = niveau de la Mairie (donc la Mairie d'abord) ;
 *  - coût au niveau n : coutFamille × n² de sa ressource + coutBois × n² bois + coutPierre × n² pierre
 *    (Jardin : famille Repos sans ressource → payé en nourriture) ;
 *  - bonus : +5 % de gains par niveau pour sa famille (sauf endommagé ou moral bas).
 */
(function (racine) {
  'use strict';
  const E = {};

  const RESSOURCES_COMMUNES = C => C.ressources.map(r => r.id).filter(id => id !== 'gemmes');
  E.famille = (type, C) => C.batiments.familles[type] ?? null;
  E.batiment = (etat, type) => (etat.village?.batiments || []).find(b => b.type === type) || null;

  // Ressource « de famille » d'un bâtiment (Jardin → nourriture)
  E.ressourceDe = function (type, C) {
    const f = E.famille(type, C);
    if (!f) return null;
    return C.familles.find(x => x.id === f)?.ressource ?? C.batiments.jardinPayeEn;
  };

  /* ===== COÛTS ===== */
  E.cout = function (type, niveau, C) {
    const n2 = niveau * niveau, cout = {};
    const ajouter = (r, q) => { cout[r] = (cout[r] || 0) + q; };
    if (type === 'mairie') {
      for (const r of RESSOURCES_COMMUNES(C)) ajouter(r, C.mairie.cout * n2);
    } else {
      ajouter(E.ressourceDe(type, C), C.batiments.coutFamille * n2);
      ajouter('bois', C.batiments.coutBois * n2);
      ajouter('pierre', C.batiments.coutPierre * n2);
    }
    return cout;
  };

  // Ce qui manque pour payer (vide = assez de tout)
  E.manque = function (etat, cout) {
    const m = {};
    for (const [r, q] of Object.entries(cout)) {
      const a = etat.joueur.ressources[r] || 0;
      if (a < q) m[r] = q - a;
    }
    return m;
  };

  /* ===== QUE PEUT-ON FAIRE AVEC CE BÂTIMENT ? =====
   * → {action: 'construire' | 'ameliorer' | 'max', niveauCible, cout, manque, bloque: null | 'mairie' | 'niveauJoueur' | 'max', requis}
   * bloque = raison pour laquelle on ne peut pas (à expliquer à l'écran, jamais un bouton grisé muet).
   */
  E.possibilite = function (etat, type, C) {
    const bat = E.batiment(etat, type);
    const niveau = bat ? bat.niveau : 0;
    const max = C.batiments.niveauMax;
    if (niveau >= max) return { action: 'max', niveauCible: null, cout: {}, manque: {}, bloque: 'max' };
    const cible = niveau + 1;
    const cout = E.cout(type, cible, C);
    const r = { action: bat ? 'ameliorer' : 'construire', niveauCible: cible, cout, manque: E.manque(etat, cout), bloque: null };
    if (bat?.endommage) { r.bloque = 'endommage'; return r; }
    if (type === 'mairie') {
      const requis = C.mairie.niveauJoueurRequis[cible - 1] ?? Infinity;
      if (etat.joueur.niveau < requis) { r.bloque = 'niveauJoueur'; r.requis = requis; }
    } else {
      const mairie = E.batiment(etat, 'mairie')?.niveau || 0;
      if (cible > mairie) { r.bloque = 'mairie'; r.requis = cible; }
    }
    return r;
  };
  E.faisable = p => !p.bloque && !Object.keys(p.manque).length;

  /* ===== ACTIONS (à appeler dans modifier() : une erreur → rien n'est sauvé) ===== */
  function payer(etat, cout) {
    for (const [r, q] of Object.entries(cout)) etat.joueur.ressources[r] -= q;
  }
  function refuser(p) {
    if (p.bloque === 'max') return 'Ce bâtiment est déjà au niveau maximum.';
    if (p.bloque === 'mairie') return `Monte d'abord la Mairie au niveau ${p.requis}.`;
    if (p.bloque === 'niveauJoueur') return `La Mairie demande le niveau ${p.requis} de chef.`;
    if (p.bloque === 'endommage') return 'Répare d\'abord ce bâtiment.';
    if (Object.keys(p.manque).length) return 'Il manque encore quelques ressources.';
    return null;
  }

  // ctx = {id, quand} ; la case (x, y) doit avoir été vérifiée libre par l'appelant (dépend du terrain)
  E.construire = function (etat, type, x, y, ctx, C) {
    if (!(type in C.batiments.familles)) return { ok: false, erreur: 'Bâtiment inconnu.' };
    const p = E.possibilite(etat, type, C);
    if (p.action !== 'construire') return { ok: false, erreur: 'Ce bâtiment existe déjà : touche-le pour l\'améliorer.' };
    const non = refuser(p);
    if (non) return { ok: false, erreur: non };
    payer(etat, p.cout);
    const bat = { id: ctx.id, type, niveau: 1, x, y, endommage: false, construitLe: ctx.quand };
    etat.village.batiments.push(bat);
    return { ok: true, batiment: bat, cout: p.cout };
  };

  E.ameliorer = function (etat, id, C) {
    const bat = (etat.village?.batiments || []).find(b => b.id === id);
    if (!bat) return { ok: false, erreur: 'Bâtiment introuvable.' };
    const p = E.possibilite(etat, bat.type, C);
    const non = refuser(p);
    if (non) return { ok: false, erreur: non };
    payer(etat, p.cout);
    bat.niveau = p.niveauCible;
    return { ok: true, batiment: bat, cout: p.cout };
  };

  /* ===== RÉPARATION (étape 13) =====
   * Un incendie (étape 6) peut endommager un bâtiment : son bonus est en pause jusqu'à la réparation.
   * Coût : C.reparation.part du coût de son niveau actuel (arrondi au-dessus).
   */
  E.coutReparation = function (type, niveau, C) {
    const cout = {};
    for (const [r, q] of Object.entries(E.cout(type, niveau, C))) cout[r] = Math.ceil(q * C.reparation.part);
    return cout;
  };
  E.reparer = function (etat, id, C) {
    const bat = (etat.village?.batiments || []).find(b => b.id === id);
    if (!bat) return { ok: false, erreur: 'Bâtiment introuvable.' };
    if (!bat.endommage) return { ok: false, erreur: 'Ce bâtiment est en parfait état.' };
    const cout = E.coutReparation(bat.type, bat.niveau, C);
    if (Object.keys(E.manque(etat, cout)).length) return { ok: false, erreur: 'Il manque encore quelques ressources pour réparer.' };
    payer(etat, cout);
    bat.endommage = false;
    return { ok: true, batiment: bat, cout };
  };
  // Endommage un bâtiment au hasard (hasard injecté : rng() entre 0 et 1). → le bâtiment touché, ou null
  E.endommager = function (etat, rng) {
    const intacts = (etat.village?.batiments || []).filter(b => !b.endommage);
    if (!intacts.length) return null;
    const bat = intacts[Math.min(intacts.length - 1, Math.floor(rng() * intacts.length))];
    bat.endommage = true;
    return bat;
  };

  /* ===== AGRANDIR LE HAMEAU (étape 13) ===== */
  E.coutExtension = function (n, C) {          // coût de l'extension numéro n+1 (n = déjà faites)
    const cout = {};
    for (const [r, q] of Object.entries(C.extensions.coutBase)) cout[r] = Math.round(q * C.extensions.facteur ** n);
    return cout;
  };
  E.possibiliteExtension = function (etat, C) {
    const n = etat.village?.extensions || 0;
    if (n >= C.extensions.max) return { max: true, n, cout: {}, manque: {} };
    const cout = E.coutExtension(n, C);
    return { max: false, n, cout, manque: E.manque(etat, cout) };
  };
  E.agrandir = function (etat, C) {
    const p = E.possibiliteExtension(etat, C);
    if (p.max) return { ok: false, erreur: 'Le hameau a atteint sa taille maximale.' };
    if (Object.keys(p.manque).length) return { ok: false, erreur: 'Il manque encore quelques ressources.' };
    payer(etat, p.cout);
    etat.village.extensions = p.n + 1;
    return { ok: true, extensions: p.n + 1, cout: p.cout };
  };

  /* ===== DÉCORATIONS (étape 13) ===== */
  E.acheterDecoration = function (etat, type, x, y, ctx, C) {
    const def = C.decorations[type];
    if (!def) return { ok: false, erreur: 'Décoration inconnue.' };
    const manque = E.manque(etat, def.cout);
    if (Object.keys(manque).length) return { ok: false, erreur: 'Il manque encore quelques ressources.' };
    payer(etat, def.cout);
    const deco = { id: ctx.id, type, x, y };
    etat.village.decorations.push(deco);
    return { ok: true, decoration: deco, cout: def.cout };
  };
  E.deplacerDecoration = function (etat, id, x, y) {
    const d = (etat.village?.decorations || []).find(v => v.id === id);
    if (!d) return { ok: false, erreur: 'Décoration introuvable.' };
    d.x = x; d.y = y;
    return { ok: true, decoration: d };
  };
  // Retirer une décoration : elle disparaît (on le dit avant, pas de remboursement)
  E.retirerDecoration = function (etat, id) {
    const i = (etat.village?.decorations || []).findIndex(v => v.id === id);
    if (i < 0) return { ok: false, erreur: 'Décoration introuvable.' };
    etat.village.decorations.splice(i, 1);
    return { ok: true };
  };

  E.deplacer = function (etat, id, x, y) {
    const bat = (etat.village?.batiments || []).find(b => b.id === id);
    if (!bat) return { ok: false, erreur: 'Bâtiment introuvable.' };
    bat.x = x; bat.y = y;
    return { ok: true, batiment: bat };
  };

  /* ===== BONUS =====
   * +bonusParNiveau × niveau pour la famille du bâtiment, sauf s'il est endommagé ou si le moral est bas.
   */
  // Une seule règle, dans le moteur des gains (moteur.js) : ici on la réutilise
  const Moteur = typeof module !== 'undefined' ? require('./moteur.js') : racine.Moteur;
  E.bonus = (etat, familleId, C) => Moteur.bonusFamille(etat, familleId, C);

  /* ===== PROCHAIN CHANTIER (carte « village » de l'écran Aujourd'hui) =====
   * Le chantier le plus proche d'être payé parmi ceux qui ne sont pas bloqués.
   * → {type, possibilite, progression 0…1} ou null
   */
  E.prochainChantier = function (etat, C) {
    let meilleur = null;
    for (const type of C.batiments.ordre) {
      const p = E.possibilite(etat, type, C);
      if (p.bloque) continue;
      const total = Object.values(p.cout).reduce((a, b) => a + b, 0);
      const manque = Object.values(p.manque).reduce((a, b) => a + b, 0);
      const progression = total ? (total - manque) / total : 1;
      if (!meilleur || progression > meilleur.progression) meilleur = { type, possibilite: p, progression };
    }
    return meilleur;
  };

  if (typeof module !== 'undefined') module.exports = E; else racine.Economie = E;
})(typeof window !== 'undefined' ? window : globalThis);
