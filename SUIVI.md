# Suivi — Hameau

## Où on en est
- Version : 0.6.0 · Étape suivante : **13** (bâtiments endommagés, réparation, extensions, décorations) ou retour à la V1 (5a, 5b, 6, 7, 8). La **1b** (clé + 1er APK) est gardée pour la toute fin · Dernière session : 2026-11-16

## Dernière session
- Fait : étape 11 (règles dans `economie.js`, données v2 avec le village, construire / améliorer / déplacer, placement libre, fiche) ; étape 12 (animations, villageois, fumée, nuages, eau, ciel selon l'heure, nuit, sons) ; esthétique de l'appli (tableau de bord, prochain chantier, cartes, écran Perso). Relecture de code : 10 points corrigés (bonus calculé dans le moteur, types de bâtiments vérifiés, particules détruites, redessin partiel…).
- Testé : `npm test` (63 tests), `npm run e2e` (parcours complet + construction : Mairie, coût, fiche, amélioration, bonus, retour). Captures du village regardées par Claude seulement (surprise).
- Non testé / à vérifier sur le téléphone : tout (1er APK à la 1b) — en plus : fluidité avec villageois et fumée, sons, toucher précis d'un bâtiment, placement au doigt.

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
| 2026-11-16 | Progression = somme des quantités / cible ; gain d'une saisie = gain mérité − déjà reçu (≥ 0) | Robuste aux arrondis et aux modifications de taille / cible |
| 2026-11-16 | Changer le type ou ajouter / retirer l'objectif d'une tâche → sa progression repart de zéro (`tache.depuis`), gains gardés | Sinon tâche bloquée « déjà faite » |
| 2026-11-16 | 1b (clé + 1er APK) faite en tout dernier ; on avance sur le village avant | Demande de Gauthier |
| 2026-11-16 | Menu embelli par un 2e agent (Réglages + barre d'onglets) | Demande de Gauthier (« les deux ») |
| 2026-11-16 | Pack du village : un seul pack CC0 cohérent (voir `LICENCES.md`), préparé en atlas par `outils/preparer-village.js` | Surprise : ni nom ni capture montrés avant le 1er lancement |
| 2026-11-16 | Niveaux des bâtiments = étages en plus (1/2/2/3/4) + balcon dès le niveau 3 ; tours : étages de tour + rempart | Le pack n'a pas de niveaux tout faits |
| 2026-11-16 | `etat.village` pas encore créé : la migration (schéma v2) arrive à l'étape 11, quand on construit pour de vrai | Pas de changement de structure inutile |
| 2026-11-16 | Placement libre des bâtiments (fantôme + « Placer ici »), déplaçables ensuite | Choix de Gauthier |
| 2026-11-16 | Le bonus des bâtiments est calculé dans le moteur (`M.bonusFamille`), jamais par l'appelant | Aucune future façon de cocher ne peut l'oublier |
| 2026-11-16 | Ambiance du village selon l'heure (aube 6-8 h, jour 8-18 h, soir 18-21 h, nuit) | « Très beau » demandé par Gauthier |
| 2026-11-16 | Sons courts CC0 (pose, marteau, fanfare, pièces, clic, validation), désactivables | Étape 12 ; coche d'une tâche = son de pièces |
| 2026-11-15 | `joueur.xp` = XP dans le niveau en cours, `joueur.xpTotal` = cumul (champ ajouté) | Un changement de courbe ne fera jamais baisser un niveau |

## À faire plus tard (noté, hors étape)
- Étape 5a : simulation de l'économie (`outils/simulation.js`, skill `moteur-recompenses`) — impossible avant le moteur de gains.
- Étape 8 : Réglages → « Sauvegardes automatiques » (liste + Restaurer) et rappel doux d'export après 14 jours (valeur déjà dans `config.js`).
- Étape 13 : bâtiment endommagé (teinte grise, fumée sombre, ⚠️, Réparer), extensions de terrain, décorations (ressources / gemmes).
- Étape 5b : écran de fête de niveau + ouverture de coffre (les sons et vibrations de base sont déjà là).
- Point de contrôle : poser les 5 questions du skill `reprise-session` §7 après 2-3 jours d'usage.
- Réglages → Mes catégories : renommer / changer l'emoji d'une catégorie perso.

<sub>Créé par Gauthier Doumont</sub>
