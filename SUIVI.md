# Suivi — Hameau

## Où on en est
- Version : 0.1.0 · Étape suivante : 1b (clé de signature + 1er build) · Dernière session : 2026-11-15

## Dernière session
- Fait : étape 1a — projet Capacitor Android seul, 4 onglets vides + À propos, bouton retour, icône maison/nuit, workflow GitHub.
- Testé : `npm test`, parcours dans Chromium (Playwright) à 360 et 412 px, hors ligne.
- Non testé / à vérifier sur le téléphone : tout (le 1er APK sort à l'étape 1b).

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

## Idées pour plus tard (hors étape)
- Choisir la charte graphique (skill `charte-appli`) au moment où les vrais écrans arrivent (étape 3-4).

<sub>Créé par Gauthier Doumont</sub>
