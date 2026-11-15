---
name: "moteur-recompenses"
description: "Moteur XP/ressources, retour immédiat, ton non culpabilisant et simulation d'équilibrage pour ses applis-jeux de motivation (Hameau, Audit Detective…). Pour tout calcul de gains ou d'économie."
---

# Moteur de récompenses et équilibrage

## Quand l'utiliser
- Hameau : étapes 2, 4, 5a, 5b, 7, 11, 13 et le rééquilibrage après 2 semaines.
- Tout autre jeu perso avec XP, ressources, niveaux ou économie (Audit Detective, Boosters 2000…).
- **Le CLAUDE.md du projet prime** : il dit QUOI (règles, valeurs), ce skill dit COMMENT. En cas d'ambiguïté du CLAUDE.md : la signaler dans le plan court de l'étape, avec l'interprétation proposée.

## 1. Principes non négociables
Public : besoin d'une récompense immédiate, décroche si c'est lent ou culpabilisant.

| Principe | Concrètement |
|---|---|
| Retour < 100 ms | L'animation part AVANT la sauvegarde (sauver ensuite, sans bloquer l'écran) |
| Toute saisie rapporte | Même 1 page sur 20 → « +1 📜 » visible |
| Progrès toujours visible | Barre d'XP + « encore 40 XP avant le niveau 6 » |
| Hasard = bonus seulement | Coffres oui, malus aléatoires jamais |
| Pertes rares, annoncées, réparables | Bouton « Réparer » directement dans le message |
| Pas de compteur négatif mis en avant | Jamais « 3 jours ratés » |
| Erreur de doigt pardonnée | Proposer (dans le plan, pas imposer) un toast « Annuler » 5 s après chaque saisie |

### Ton des messages
| À éviter | À écrire |
|---|---|
| « Tu as raté 3 quotidiennes » | « Nouvelle journée, nouvelles récompenses. » |
| « Série perdue ! » | « Série relancée — une tâche et c'est reparti 🔥 » |
| « Seulement 10/20 » | « +50 % ! 10 pages de plus 📖 » |
| « Rien fait depuis 5 jours » | « Content de te revoir ! Ton village t'attendait. » |

Mots bannis : raté, échec, seulement, dois / devrais, oublié, paresse, « encore » au sens de reproche.
Retour après absence : UN seul écran, positif, résumé neutre des événements (ex. incendie) + bouton d'action.

## 2. Architecture : un moteur pur, testable dans node
```
www/config.js   toutes les valeurs de jeu (window.CONFIG = {...})
www/moteur.js   fonctions PURES : pas de Date, Math.random, localStorage ni DOM
www/app.js      appelle le moteur, sauvegarde, anime
tests/*.test.js node:test, sans dépendance
outils/         scripts node (simulation, analyse d'export) — hors www/
```
Pourquoi : une fonction pure se teste en 1 ligne et la simulation réutilise exactement le même code que l'appli.

Export double (navigateur + node) :
```js
/* moteur.js — Hameau — Créé par Gauthier Doumont */
(function (racine) {
  const M = {};
  // … fonctions …
  if (typeof module !== 'undefined') module.exports = M; else racine.Moteur = M;
})(typeof window !== 'undefined' ? window : globalThis);
```
Dans node : `globalThis.window = globalThis; require('../www/config.js'); const M = require('../www/moteur.js');`

- Le **jour** (chaîne `AAAA-MM-JJ`) est passé en paramètre par app.js (calcul : skill `temps-et-rappels`).
- Le **hasard** est injecté : `rng` = `Math.random` dans l'appli, générateur à graine dans les tests et la simulation :
```js
function mulberry32(a) { return function () {
  let t = a += 0x6D2B79F5;
  t = Math.imul(t ^ t >>> 15, t | 1);
  t ^= t + Math.imul(t ^ t >>> 7, t | 61);
  return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
```

### Structure conseillée de config.js
```js
/* config.js — valeurs de jeu, à rééquilibrer ici uniquement — Créé par Gauthier Doumont */
window.CONFIG = {
  tailles: { petite: 10, moyenne: 25, grosse: 50 },
  types: { quotidienne: 1, imprevu: 1.2, bonus: 1.25 },
  serie: { parJour: 0.05, max: 0.5, xpMinJour: 30 },
  repos: { facteurXp: 0.5, moral: 5 },
  antiFarm: { seuil: 15, facteur: 0.5 },
  stat: { diviseur: 10 },
  niveau: { base: 100, exposant: 1.5 },
  coffre: { chance: 0.1, nbRessources: 2, min: 10, max: 30, gemmesMin: 1, gemmesMax: 3 },
  moral: { depart: 80, parTache: 1, quotidienneNonFaite: -5, seuilTriste: 40 },
  // batiments, mairie, reparation, extensions… (étape 11)
};
```
Chaque clé commentée en 1 ligne (« ce que ça change si on augmente »).

## 3. Calcul des gains — pièges à éviter
- **Arrondir une seule fois, à la fin.** `brut = base × type × série × bâtiments × antiFarm` (non arrondi).
- **Progression partielle** : gains d'une saisie = gains(progression après) − gains(progression avant). La somme des saisies retombe exactement sur le gain complet, sans dérive d'arrondi.
```js
M.gainsSaisie = function (brut, avant, valeur, cible) {
  const apres = Math.min(1, avant + valeur / cible);
  const total = p => Math.round(brut * p);
  return { apres, quantite: total(apres) - total(avant) };
};
```
- **Figer l'historique** : les gains sont stockés dans le journal au moment de la saisie. Un rééquilibrage ne recalcule JAMAIS le passé.
- **Stats** = `floor(gagneTotal[famille] / diviseur)` : à recalculer, jamais incrémenter à la main (sinon désynchronisation).
- **Anti-farm** : compter les tâches passées à 100 % dans le jour logique AVANT cette saisie ; si ≥ seuil → facteur. Préciser dans le plan si les saisies partielles comptent.
- **Coffre** : tirage uniquement quand la tâche PASSE à 100 % (avant < 1 et après = 1), une fois par tâche et par jour.
- **Niveaux** : boucle (un gros gain peut faire passer 2 niveaux → une seule fête « +2 niveaux »). Un changement de courbe ne fait jamais baisser un niveau.
```js
M.xpPourNiveau = (n, C) => Math.round(C.niveau.base * n ** C.niveau.exposant);
M.ajouterXp = function (xpDansNiveau, niveau, gain, C) {
  let xp = xpDansNiveau + gain, n = niveau;
  while (xp >= M.xpPourNiveau(n, C)) { xp -= M.xpPourNiveau(n, C); n++; }
  return { xp, niveau: n, niveauxGagnes: n - niveau };
};
```

## 4. Le « jus » (étapes 4 et 5b)
Gradation : coche (petit) < tâche à 100 % (moyen) < coffre (grand) < niveau (énorme). Tout au maximum = plus rien n'impressionne.
- **« +25 📜 » qui s'envole** : élément `position: fixed` animé avec `el.animate()` de la case cochée vers le compteur (`getBoundingClientRect`), 600-700 ms, `easing: 'cubic-bezier(.2,.8,.2,1)'` ; puis le compteur gonfle (scale 1,2) et défile jusqu'à la nouvelle valeur (requestAnimationFrame, 400 ms).
- `prefers-reduced-motion` → simple fondu.
- **Vibrations** : `PL.Haptics?.impact({ style: 'LIGHT' })` à la coche, `'MEDIUM'` au coffre, `notification({ type: 'SUCCESS' })` au niveau. Respecter `reglages.vibrations`.
- **Sons** : Web Audio (AudioContext + decodeAudioData, préchargés au démarrage, `ctx.resume()` au 1er toucher) — HTMLAudio a trop de latence sur Android. Sons < 0,5 s, hauteur variée de ±5 % (`playbackRate`) pour éviter la lassitude. Respecter `reglages.sons`. Fichiers CC0 dans `www/assets/sons/`, cités dans `LICENCES.md`.
- **Coffre** : tremble (400 ms) → s'ouvre → récompenses une par une (décalage 150 ms). Un tap = tout afficher.
- **Fête de niveau** : plein écran, confettis légers (≤ 150 particules, 2 s), bouton « Continuer ». Jamais plus de 3 s sans pouvoir passer.

## 5. Simulation de l'économie
À lancer à l'étape 2 (valeurs de départ), à l'étape 11 (coûts) et avant tout changement de `config.js`.

`outils/simulation.js` — `node outils/simulation.js [profil] [jours] [graine]` — même moteur + même config.

| Profil | Tâches / jour actif | Jours actifs | Répartition |
|---|---|---|---|
| léger | 4 | 70 % | paramétrable par famille |
| régulier | 7 | 85 % | idem |
| intense | 12 | 95 % | idem |
| perso | tiré de son export réel | | |

Boucle : pour chaque jour → tâches tirées (famille, type, taille) → gains, série, coffres → achat glouton (la Mairie si elle bloque, sinon le bâtiment le plus bas abordable) → noter les jalons.
20 graines par profil, afficher la **médiane** en tableau markdown :
- jour des niveaux joueur 5 / 10 / 16 / 23 et de chaque niveau de Mairie
- jour « tout au niveau 5 »
- ressource **goulot** (celle qui a bloqué le plus d'achats) et stock qui dort
- % de jours touchés par l'anti-farm

Critères de réussite (sauf objectif différent dans le CLAUDE.md) :
- [ ] régulier : tout niveau 5 en 100-140 jours (≈ 4 mois)
- [ ] léger : au moins 1 amélioration par semaine (progrès visible)
- [ ] intense : pas avant ~70 jours (sinon ennui)
- [ ] aucune ressource qui dort à plus de 3× le prochain coût
- [ ] anti-farm < 5 % des jours du profil régulier
- [ ] le niveau joueur requis par la Mairie arrive en même temps que les ressources, pas des mois après

## 6. Rééquilibrage après 2 semaines
1. Gauthier exporte son JSON (Réglages → Exporter) et le dépose dans `perso/` — dossier dans `.gitignore` (dépôt public, données perso).
2. `node outils/analyse-export.js perso/export.json` → par famille : gains moyens / jour, tâches / jour, jours actifs, série moyenne, coffres, moral moyen.
3. Relancer la simulation avec le profil « perso ».
4. Proposer **3 changements maximum**, en tableau avant / après / effet prévu (jours pour tout niveau 5) / pourquoi. Il valide.
5. Modifier uniquement `config.js`, version patch, CHANGELOG « Équilibrage ».

Préférer rendre les choses moins chères plutôt que réduire les gains (une récompense qui baisse se ressent comme une punition). Ne jamais retirer ce qu'il possède déjà.

## 7. « Prochaine action »
Fonction pure `prochaineAction(taches, journalDuJour, jour, ignorees)` → une seule tâche. « Pas maintenant » ajoute la tâche à `ignorees` (en mémoire, non sauvegardé) ; liste épuisée → on recommence au début.
Tests : ordre de priorité, tâche déjà faite exclue, quotidienne non prévue ce jour-là exclue.

## Check-list
- [ ] Aucune valeur de jeu en dur hors `config.js` (relire les nombres de `moteur.js`)
- [ ] `moteur.js` pur et `npm test` vert
- [ ] Test : somme des saisies partielles = gain d'une saisie complète
- [ ] Messages relus avec la liste des mots bannis
- [ ] Animations OK en reduced-motion ; sons et vibrations désactivables
- [ ] Simulation relancée si `config.js` a changé, résultat résumé dans le commit

*Skill créé par Gauthier Doumont*