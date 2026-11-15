# Suivi — Hameau

## Où on en est
- Version : 0.2.0 · Étape suivante : **1b** (clé de signature + 1er build, à faire quand Gauthier est sur son PC), puis 3 · Dernière session : 2026-11-15

## Dernière session
- Fait : étape 1a (squelette Android + workflow) puis étape 2 (modèle de données, `config.js`, stockage sûr, export/import, sauvegardes auto). 1b reportée : Gauthier n'était pas sur son PC.
- Testé : `npm test` (15 tests données), `npm run e2e` (Playwright : navigation 360/412/1100 px hors ligne, export, rechargement, import, fichier étranger, données illisibles, version plus récente).
- Non testé / à vérifier sur le téléphone : tout (1er APK à l'étape 1b) — en particulier l'export via la feuille de partage Android et le choix d'un fichier .json à l'import.

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
| 2026-11-15 | `joueur.xp` = XP dans le niveau en cours, `joueur.xpTotal` = cumul (champ ajouté) | Un changement de courbe ne fera jamais baisser un niveau |

## À faire plus tard (noté, hors étape)
- Étape 5a : simulation de l'économie (`outils/simulation.js`, skill `moteur-recompenses`) — impossible avant le moteur de gains.
- Étape 8 : Réglages → « Sauvegardes automatiques » (liste + Restaurer) et rappel doux d'export après 14 jours (valeur déjà dans `config.js`).
- Étape 3-4 : choisir la charte graphique (skill `charte-appli`) quand les vrais écrans arrivent.

<sub>Créé par Gauthier Doumont</sub>
