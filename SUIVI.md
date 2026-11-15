# Suivi — Hameau

## Où on en est
- Version : 0.4.0 · Étape suivante : **1b** (clé de signature + 1er build, quand Gauthier est sur son PC), puis 🔁 **point de contrôle** (2-3 jours d'usage), puis 5a · Dernière session : 2026-11-16

## Dernière session
- Fait : étapes 1a, 2, 3 et 4 (cocher, progression partielle, gains de base, animation « +25 », Annuler, modifier / supprimer une tâche). 1b reportée : Gauthier n'était pas sur son PC.
- Testé : `npm test` (38 tests : données, tâches, moteur, jour logique), `npm run e2e` (Playwright, horloge simulée lundi 16/11 : navigation hors ligne, export/import, récupération, ajout, options, catégories, cocher, saisie partielle, Annuler, modifier, supprimer, niveau).
- Non testé / à vérifier sur le téléphone : tout (1er APK à l'étape 1b) — en particulier : export via la feuille de partage, choix d'un .json à l'import, fenêtre d'ajout quand le clavier s'ouvre (adjustResize), sélecteur de date, vibration à la coche, fluidité de l'animation « +25 ».

## Bugs connus
- (aucun)

## Retours de Gauthier à traiter
- (aucun)

## Décisions (ne pas reposer la question)
| Date | Décision | Pourquoi |
|---|---|---|
| 2026-11-15 | Android uniquement, pas d'Electron | Demandé dans CLAUDE.md |
| 2026-11-15 | Pas de clé de signature existante → Claude la crée à l'étape 1b | Réponse de Gauthier |
| 2026-11-15 | Claude pousse directement sur `main` (pas de pull request) | Réponse de Gauthier |
| 2026-11-15 | Icône choisie par Claude : maison au toit rouge, colline verte, ciel nuit | Réponse de Gauthier |
| 2026-11-15 | Versions 0.x pendant la V1, 1.0.0 à l'étape 8 | La feuille de route prévoit la release v1.0.0 à l'étape 8 |
| 2026-11-15 | Étape 2 faite avant 1b | Gauthier pas sur son PC, il l'a demandé |
| 2026-11-15 | Familles et catégories de départ dans `config.js`, pas dans les données | Elles sont fixes ; seules les catégories (perso + compteurs) sont stockées |
| 2026-11-15 | Charte graphique **A · Taverne** (Cinzel pour les titres) | Choix de Gauthier sur `docs/apercu-chartes.png` |
| 2026-11-15 | Ajout express sans catégorie choisie → 🔁 Routine (puis la dernière utilisée) | Valeur dans `config.js` → `taches.defauts` |
| 2026-11-16 | Modifier / supprimer une tâche : toucher la carte. Suppression « douce » (archivée), XP gardée | Demandé par Gauthier |
| 2026-11-16 | Étape 4 = gains de BASE seulement ; Repos rapporte de l'XP sans ressource (moral à l'étape 6) | Multiplicateurs à l'étape 5a |
| 2026-11-16 | Objectif d'un imprévu / bonus : progression cumulée sur plusieurs jours ; quotidienne : par jour logique | Un gros objectif (livre de 300 pages) peut s'étaler |
| 2026-11-16 | Toast « Annuler » 5 s après chaque coche / suppression | Erreur de doigt pardonnée (skill moteur-recompenses) |
| 2026-11-15 | `joueur.xp` = XP dans le niveau en cours, `joueur.xpTotal` = cumul (champ ajouté) | Un changement de courbe ne fera jamais baisser un niveau |

## À faire plus tard (noté, hors étape)
- Étape 5a : simulation de l'économie (`outils/simulation.js`, skill `moteur-recompenses`) — impossible avant le moteur de gains.
- Étape 8 : Réglages → « Sauvegardes automatiques » (liste + Restaurer) et rappel doux d'export après 14 jours (valeur déjà dans `config.js`).
- Point de contrôle : poser les 5 questions du skill `reprise-session` §7 après 2-3 jours d'usage.
- Réglages → Mes catégories : renommer / changer l'emoji d'une catégorie perso.

<sub>Créé par Gauthier Doumont</sub>
