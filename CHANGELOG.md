# Journal des versions — Hameau

## 0.4.1 — 2026-11-16 (correctifs)
- Un objectif atteint par petites saisies (ex. 10 × 1 minute) arrive bien à 100 % (avant : bloqué à 99,99 %).
- « Tout le reste » termine toujours la tâche.
- Une quotidienne changée en imprévu (ou l'inverse) redevient faisable ; ce qu'elle a rapporté reste acquis.
- Changer la cible ou la taille d'une tâche entamée : les quantités faites sont gardées, le total gagné correspond à la nouvelle taille.
- À 4 h du matin ou au retour sur l'appli, les quotidiennes se réactivent sans devoir la redémarrer.
- Compteurs de ressources : plus de chiffre qui recule quand on coche deux tâches très vite.
- Écran Aujourd'hui plus rapide quand l'historique devient long.

## 0.4.0 — 2026-11-16
- Cocher une tâche rapporte de l'XP et la ressource de sa famille (petite 10 · moyenne 25 · grosse 50) : le gain s'envole vers son compteur, petite vibration.
- Objectif chiffré : bouton + pour saisir « 10 pages » → 50 % des gains ; plusieurs saisies s'additionnent, plafond 100 %.
- Quotidiennes : seulement celles prévues ce jour-là, une fois par jour (la journée finit à 4 h du matin).
- Barre de ressources et barre d'XP avec niveau ; « Annuler » pendant 5 secondes après chaque action.
- Toucher une tâche pour la modifier ou la supprimer (ce qu'elle a rapporté reste acquis).

## 0.3.0 — 2026-11-15
- Nouvelle charte graphique « Taverne » : bois sombre et or, titres en Cinzel (police intégrée, hors ligne).
- Bouton + : ajout express d'une tâche (nom + Enregistrer), catégorie par défaut = la dernière utilisée.
- « Plus d'options » : catégorie (favoris en haut), type (quotidienne avec ses jours, imprévu avec échéance et « important », bonus), taille ou objectif chiffré.
- Catégories perso (nom + emoji + famille), depuis l'ajout ou Réglages → Mes catégories.
- Écran Aujourd'hui : tâches rangées par type (imprévus par échéance).
- Le clavier Android ne cache plus la fenêtre d'ajout.

## 0.2.0 — 2026-11-15
- Modèle de données (version 1) et toutes les valeurs de jeu réunies dans `config.js`.
- Stockage sûr : des données illisibles ne sont jamais écrasées (écran de récupération).
- Réglages → Exporter / Importer mes données (aperçu et confirmation avant de remplacer, l'adresse d'agenda n'est jamais exportée).
- Copies de sécurité automatiques : avant chaque import, et une par semaine (les 4 dernières).
- À propos : taille des données.

## 0.1.0 — 2026-11-15
- Squelette de l'appli Android : écrans Aujourd'hui, Village, Perso, Réglages, À propos.
- Icône et écran de démarrage.
- Compilation automatique de l'APK sur GitHub.

<sub>Créé par Gauthier Doumont</sub>
