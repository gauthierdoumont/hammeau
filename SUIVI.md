# Suivi — Hameau

## Où on en est
- Version : 1.8.0 · Données : **schéma v3** · Prochaine session : **1b** (clé de signature + 1er APK), puis point de contrôle · Dernière session : 2026-11-17

## Dernière session
- 2026-11-17 — Demande de Gauthier : **tâches de la semaine** (v1.8.0). Nouveau type `semaine` (« 5 étapes de Nanoblocks
  cette semaine », n'importe quel jour du lundi au dimanche) : `T.creerTache` (objectif entier 1-14), `M.saisir` → `saisirSemaine`
  (gain par étape, bonus à la saisie qui boucle, moitié au-delà), `M.compte` par semaine (`M.lundiDe`), série (`jours.js` étape 3),
  `M.estTerminaison` (anti-farm, tempête, bilan, historique), section « 📅 Cette semaine », feuille « Combien de fois ? »,
  lundi matin : étape notable pour dimanche, rappel du dimanche matin. Pas de migration (nouvelle valeur de type + champ
  `semaine` facultatif dans les saisies). Testé : `npm test` (190, dont `tests/semaine.test.js`), `npm run e2e` (section 20).
  Non testé : simulation de l'économie avec des tâches de la semaine (les profils n'en ont pas).
- Fait : 2.0 rééquilibrage (v0.7.1, tests de coûts calculés depuis `CONFIG`) puis étape 8 (v1.0.0) : Sons / Vibrations,
  Sauvegardes automatiques + Restaurer, rappel d'export (carte sur Aujourd'hui), Vérifier les mises à jour (`@capacitor/browser`).
- Étape 14 (v1.1.0) : rappels locaux (`www/notifications.js`, fonction pure testée), explication avant la permission,
  reprogrammation à chaque sauvegarde (anti-rebond 1,5 s) et à l'ouverture, petite icône `ic_stat_hameau` (`scripts/icone-notif.js`).
- Étape 15a (v1.2.0) : agenda iCal (`www/calendrier.js` pur + `www/lib/ical.min.js`), écran Réglages → Agenda,
  cache J−1 à J+120, `CapacitorHttp.get()` explicite ; navigateur : `localStorage.debug_ics` = texte d'un agenda (tests).
- Étape 15b (v1.3.0) : « Cours du jour » + « J'y étais » (`M.jYEtais`, saisie du journal `tacheId: null` + `cours`),
  examens marqués à la main (`agenda.examens`) → **migration v3** + `tests/fixtures/etat-v3.json`.
- Étape 16 (v1.4.0) : surprises du jour (`www/surprises.js`, hasard injecté) ; fête et défi de tempête calculés DANS le moteur
  (`M.bonusFete`, `M.releverDefi`) ; `etat.etat.surprise` = champ facultatif complété (pas de migration).
- Étape 17 (v1.5.0) : examens = boss (`www/boss.js`) ; dégâts recalculés depuis le journal (rien de stocké),
  récompense notée dans `agenda.recompenses` (champ facultatif complété, pas de migration).
- Étape 18 (v1.6.0) : bilan de la semaine (`www/bilan.js` pur, graphiques SVG faits main, une seule teinte + étiquettes :
  la palette des familles échoue au validateur `dataviz` sur fond sombre, donc la couleur ne porte jamais l'information seule).
- Étape 19 (v1.7.0) : import de l'appli Muscu (`www/muscu.js`, format `muscu-gd` lu dans le dépôt `muscuappperso`, export FICTIF
  `tests/fixtures/muscu-export.json`) ; `M.saisieExterne` partagée avec « J'y étais » ; saisie du journal `tacheId: null` + `muscu`.
- Vérification par sous-agents, boucle 4 : 10 corrections en v1.7.2 (échéance pendant une pause marquée traitée dès le jour
  en pause, agenda : départ rapide aussi avec RECURRENCE-ID / EXDATE / COUNT sans BYxxx + plafond de temps partout + exceptions
  reliées par uid, famille des séances muscu dans le bilan, examens gardés 21 jours, import muscu plus robuste).
- Vérification par sous-agents, boucle 3 : 10 corrections en v1.7.1 (examens passés gardés dans le cache de l'agenda,
  « Est-ce un examen ? » depuis l'aperçu et les boss, jour logique des événements, téléchargements de l'agenda périmés jetés).
- Agenda, correction de fond (choix de Gauthier après 3 boucles en échec sur les répétitions B8 → C8 → D2/D6 → E1-E3) :
  plafond en NOMBRE DE TOURS (`Cal.MAX_TOURS` = 20 000) au lieu d'un temps → même résultat partout ; départ rapide
  MONTHLY / YEARLY (sauts de 48 mois × INTERVAL) ; RDATE sans COUNT. Tests comparés à l'itération complète (179 tests).
- Vérification boucle 6 (finale) : « problème des répétitions réglé : OUI » (969 comparaisons, même résultat en normal,
  horloge truquée et machine chargée ; workflow et signature prêts pour la 1b). Point F1 corrigé en v1.7.4 : règle impossible
  (`Cal.regleImpossible`, ex. 30 février en DAILY / HOURLY) → plus de boucle sans fin dans ical.js.
- Vérification par sous-agents, boucle 2 : 14 corrections fusionnées en v1.6.1 (rappels inexacts `isExactNotification: false` = plus
  d'écran « Alarmes » sur Android 14+, adresse iCal retirée du texte d'analyse, agenda plus robuste, incendie non rejoué).
- Vérification par sous-agents (vérificateur → correcteur) : 10 corrections fusionnées en v1.2.1 (Annuler après le tick de 60 s,
  import sans rejouer les jours, pause relancée le même matin, `remplacerEtat()` seule porte de remplacement complet, valeurs → config).
- Simulation 2.0 (200 j, 20 graines, médianes) : tout au niveau 5 → régulier 125 j, intense 62 j, léger > 200 j.
- Check-list `appli-native` : navigateur 360/412/1100 px OK, hors ligne OK, export/import OK, appId inchangé, pas de server.url,
  aucun secret. Reste : workflow ✅ + Release (impossible avant la 1b, clé de signature).
- Testé : `npm test` (180), `npm run e2e` (20 sections, plugin de notifications simulé, agenda d'exemple), `node outils/simulation.js`.
- Non testé / à vérifier sur le téléphone : tout (1er APK à la 1b), dont l'ouverture de la page GitHub par `@capacitor/browser`,
  l'arrivée des rappels à l'heure (optimisation de batterie MagicOS à désactiver pour Hameau) et la petite icône,
  la lecture du vrai Google Agenda (impossible à tester ici : le navigateur bloque).

## Bugs connus
- (aucun)

## Retours de Gauthier à traiter
- (aucun) — « pouvoir fixer pour la semaine » : fait en v1.8.0.

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
| 2026-11-16 | Rééquilibrage validé (bâtiments 30/5/5 × n², Mairie 20 × n², niveaux de chef 1/3/6/9/12) | Village complet ≈ 125 jours au lieu de > 200 |
| 2026-11-16 | CLAUDE.md = « prochaines choses à faire » pour la session suivante : tout le reste dans l'ordre (2.0, 8, 14, 15a, 15b, 16-19, 1b en dernier) | Demande de Gauthier |
| 2026-11-16 | Ordre des étapes demandé : 13 → 5a → 5b → 6 → 7, puis CLAUDE.md condensé | Demande de Gauthier |
| 2026-11-16 | Coffre : ressources + gemmes hors stats (les stats mesurent l'effort réel) ; hasard injecté (`ctx.rng`) | Tests et simulation reproductibles |
| 2026-11-16 | Incendie V2 : un bâtiment au hasard est endommagé ; sans village, −20 % de la ressource (max 50) | CLAUDE.md §6 |
| 2026-11-16 | Pause rétroactive : les pénalités depuis la date choisie sont annulées (moral rendu par différence) | Ne pas effacer ce qui a été gagné depuis |
| 2026-11-16 | Décorations : retirer = pas de remboursement (dit avant) | Simple et clair |
| 2026-11-16 | Restaurer une copie : jours déjà traités sur le téléphone non rejoués, adresse iCal du téléphone gardée | Restaurer ne doit jamais faire payer des « jours manqués » |
| 2026-11-16 | Rappel d'export : compté depuis la 1re saisie si jamais exporté ; ✕ = caché jusqu'à la prochaine ouverture | Doux, jamais d'insistance, aucun champ de données en plus |
| 2026-11-16 | Rappel coupé = heure vide dans `reglages.notifMatin` / `notifSoir` ; veille d'échéance à l'heure du soir (sinon du matin) | Pas de nouveau champ stocké (pas de migration) |
| 2026-11-16 | Proposition d'activer les rappels : à l'ouverture s'il y a une tâche, 2 fois max (3 jours d'écart), suivi hors des données | Jamais d'insistance |
| 2026-11-16 | Agenda : l'adresse n'est jamais réaffichée (champ vide « Adresse enregistrée ✅ ») ; le cache des événements, lui, est dans l'export | Secret protégé ; l'export reste complet hors ligne |
| 2026-11-16 | Cache de l'agenda : en plus de J−1 à J+120, les examens des 21 derniers jours (`boss.joursAvant` + `boss.joursApres`, v1.7.2), lus ou repris de l'ancien cache ; champ `jour` (jour logique) dans chaque événement | Récompense du boss prenable après l'examen, dégâts jamais réattribués ; contenu du cache, pas de migration |
| 2026-11-16 | « J'y étais » = gain d'une tâche Cours (moyenne, multiplicateur quotidienne) ; saisie du journal sans tâche | Compte pour la journée et la série comme une tâche |
| 2026-11-16 | Cours du jour = tous les événements à heure fixe du jour ; journées entières en simple ligne 📌 | Tout est centralisé dans Google Agenda |
| 2026-11-16 | Surprises : marchand (échange ×1,5 facultatif), tempête = défi 3 tâches → +30 bois +30 pierre, fête +20 % ; 30 %/jour, rien en pause | Le hasard ne donne que des bonus |
| 2026-11-16 | Boss : apparaît 14 j avant, 200 PV, dégâts = XP des révisions 📚 (le plus proche d'abord, surplus au suivant) ; récompense le jour J, au moins 25 % | On ne « perd » jamais contre un boss |
| 2026-11-16 | Échéance d'un imprévu important tombée pendant une pause → jamais d'incendie (tâche marquée traitée) | Choix de Gauthier (P5) : « aucune pénalité pendant une pause » |
| 2026-11-16 | Étape 19 : la source est son appli HTML muscu (format d'export à lire dans son dépôt) | Réponse de Gauthier |
| 2026-11-16 | Import muscu : séances des 14 derniers jours (`muscu.joursMax`), muscu / express / élastique → Muscu, course → Course ; taille selon minutes ou km ; pas de coffre | Ne pas fausser l'équilibre du village avec des mois d'historique |
| 2026-11-16 | Agenda : plafond d'une répétition en nombre de tours (20 000), pas en temps | Choix de Gauthier : résultat identique sur toutes les machines, tests stables pour GitHub |
| 2026-11-17 | Tâche de la semaine : chaque étape rapporte + bonus (1 étape offerte) à 5/5 ; pas bouclée → rien ; dépasser → moitié ; compte pour la série ; taille = par étape ; 4e bouton « 📅 Semaine » ; rappel le dimanche matin | Choix de Gauthier (6 questions) |
| 2026-11-15 | `joueur.xp` = XP dans le niveau en cours, `joueur.xpTotal` = cumul (champ ajouté) | Un changement de courbe ne fera jamais baisser un niveau |

## À faire plus tard (noté, hors étape)
- Agenda : une seule valeur invalide (ex. BYYEARDAY=367) rend tout le fichier illisible (message neutre, ancienne version gardée) ; lire les événements un par un si ça arrive.
- Mensuel avec COUNT (« dernier jour ouvré, 400 fois ») : pas de départ rapide (≈ 0,4 s dans node), à optimiser si besoin.
- Étape 5a : simulation de l'économie (`outils/simulation.js`, skill `moteur-recompenses`) — impossible avant le moteur de gains.
- Point de contrôle : poser les 5 questions du skill `reprise-session` §7 après 2-3 jours d'usage.
- Réglages → Mes catégories : renommer / changer l'emoji d'une catégorie perso.

<sub>Créé par Gauthier Doumont</sub>
