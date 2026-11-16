# Hameau — prochaines choses à faire (appli Android de motivation : tâches réelles → village)

> Fichier de reprise pour la **prochaine session Claude Code**. Spécification complète de chaque étape (V3, V4…) :
> **`docs/CLAUDE-complet.md`** — la lire avant chaque étape. Ne jamais supprimer ni raccourcir ces deux fichiers.
> `appId` **`be.gauthierdoumont.hameau`** : ne change JAMAIS (sinon Android voit une autre appli → données perdues).

## 0. Règles de travail
- Ce dépôt est une appli native (Capacitor). Ne jamais le transformer en page web. Suivre `.claude/skills/appli-native`.
- **Android uniquement** (pas d'Electron). Dépôt **public** : aucune donnée perso, adresse, clé ou secret ; données de test fictives.
- Début de session : skill **`reprise-session`** (lire ce fichier, `SUIVI.md`, `npm ci` si besoin, `npm test`).
- **Gauthier a demandé d'enchaîner toutes les étapes du §2, dans l'ordre.** Pour chacune : annoncer un plan court (5 lignes), coder,
  `npm test` + `npm run e2e` verts, cocher la case (§4 ici ET dans `docs/CLAUDE-complet.md`), mettre à jour `SUIVI.md` et `CHANGELOG.md`,
  commit en français. Ne s'arrêter pour une question que sur un **choix produit** (2 max, avec une option recommandée).
- Pousser sur la branche de travail **et sur `main`** (accord de Gauthier). Contrôle du dépôt public avant chaque commit (`reprise-session` §5).
- Toutes les valeurs de jeu dans **`www/config.js`**. Public : récompense immédiate, jamais lent ni culpabilisant
  (mots bannis : raté, échec, seulement, oublié, paresse, « tu dois »).
- Fichiers complets ; « Créé par Gauthier Doumont » discrètement dans chaque fichier ; expliquer le pourquoi en 1-2 phrases, sans jargon.
- Les préférences de Gauthier : poser les questions nécessaires AVANT de répondre ; ne créer un document que s'il le demande.
- **Surprise du village** : aucune capture ni nom du pack graphique montré à Gauthier avant son 1er lancement sur le téléphone (étape 1b).

## 1. État de départ (v0.7.0)
- Faits : 1a, 2, 3, 4, 5a, 5b, 6, 7 (V1 sauf 1b et 8) et 9 à 13 (V2 complète). 87 tests unitaires + parcours Playwright (11 sections).
- Rien n'a encore tourné sur le téléphone : le workflow GitHub échoue volontairement à « Clé de signature » tant que la 1b n'est pas faite.
- Données : schéma **v2** (village inclus). Tout changement de structure → migration v3 + fixture `tests/fixtures/etat-v3.json` + copie de sécurité (skill `donnees-sures`).

## 2. À faire, dans cet ordre

### 2.0 Rééquilibrage du village — VALIDÉ par Gauthier, à appliquer en premier
- `www/config.js` : `batiments.coutFamille` **30**, `coutBois` **5**, `coutPierre` **5** ; `mairie.cout` **20** ; `mairie.niveauJoueurRequis` **[1, 3, 6, 9, 12]**.
- Relancer `node outils/simulation.js` : attendu ≈ régulier 125 jours, intense ≈ 62, léger > 200 (progrès réguliers). Coller le tableau dans le commit.
- Mettre à jour les tests qui figent les anciens coûts : `tests/economie.test.js` (coûts 50/20/20, Mairie 40, niveau requis 5,
  réparation 15/6/6, prochain chantier) et `tests/e2e/parcours.mjs` section 8 (montants payés). **Mieux : calculer les attendus avec
  `Economie.cout(...)` / `CONFIG`** pour qu'un futur rééquilibrage ne casse plus les tests.
- Version patch + CHANGELOG « Équilibrage ». Retirer la proposition « en attente » de `SUIVI.md`.

### 2.1 Étape 8 — Réglages, À propos, mises à jour, v1.0.0
- Réglages (même style que les lignes existantes, `#ecran-reglages`) : interrupteurs **Sons** et **Vibrations** (`reglages.sons`, `reglages.vibrations` existent déjà).
- **Sauvegardes automatiques** : liste (hebdo + « avant-… ») avec date et « Restaurer » (confirmation + copie de sécurité de l'état actuel avant).
  Fonctions déjà prêtes dans `www/app.js` : `listerSauvegardes`, `ecrireSauvegarde`, `sauvegardeAvant`. Restaurer = texte → `S.decider` → remplacer.
- **Rappel d'export** doux après `CONFIG.donnees.rappelExportJours` (14) sans export : petite carte sur Aujourd'hui « Petite sauvegarde de ton village ? » → un tap = export.
- **Vérifier les mises à jour** (seule fonction en ligne) : `fetch('https://api.github.com/repos/gauthierdoumont/hammeau/releases/latest')`,
  comparer `tag_name` (sans `v` ni `-build.N`) à `APP_VERSION`, proposer d'ouvrir `html_url` avec `@capacitor/browser`
  (`npm i @capacitor/browser && npx cap sync android`). Hors ligne → message clair et neutre.
- Passer toute la **check-list** du skill `appli-native` ; `package.json` → **1.0.0** ; CHANGELOG. (La Release GitHub ne sortira qu'avec la 1b.)

### 2.2 Étape 14 — Notifications locales (spécification : `docs/CLAUDE-complet.md` §8 + skill `temps-et-rappels` §5)
- `@capacitor/local-notifications` ; écran d'explication **avant** la demande de permission (Android 13+) ; refus → un seul rappel, jamais d'insistance.
- Petite icône `ic_stat_hameau` (PNG blanc) + `capacitor.config.json` `plugins.LocalNotifications`.
- Fonction pure `construireNotifications(etat, instant, CONFIG)` testée dans node : matin (8 h, réglable) programme du jour ;
  soir (20 h, réglable) seulement s'il reste des quotidiennes, formulé en gain ; veille d'échéance ; rien en pause. IDs fixes.
- **Reprogrammer à chaque ouverture et à chaque tâche cochée** ; jamais dans le passé. Réglages : heures, on/off, « Tester dans 10 s ».
- Dire à Gauthier de désactiver l'optimisation de batterie pour Hameau (MagicOS : « Lancement des applications » → gestion manuelle).

### 2.3 Étape 15a — Lecture de l'agenda iCal (skill `temps-et-rappels` §6)
- **ical.js** local (`npm i -D ical.js`, copier le build UMD dans `www/lib/ical.min.js`, MPL-2.0 dans `LICENCES.md`).
- Téléchargement par **`CapacitorHttp.get()` explicite** (ne PAS activer CapacitorHttp globalement : ça casserait le chargeur de Phaser).
- Adresse secrète saisie dans Réglages (`reglages.icsUrl`) : **jamais** dans le code, le dépôt, les logs ni l'export (test d'export à garder).
- Cache `reglages.calendrierCache` (événements J−1 à J+120 + date) : affiché tout de suite, actualisé à l'ouverture + bouton « Actualiser ».
- `tests/exemple.ics` fictif (CRLF, VTIMEZONE, RRULE, EXDATE, RECURRENCE-ID, ligne repliée, UTC `Z`, `VALUE=DATE`) + tests node (résultats attendus dans le skill).
- Dans le navigateur, l'appel est bloqué (CORS) : tester avec le fichier d'exemple.

### 2.4 Étape 15b — Cours du jour dans Aujourd'hui
- Section « 🎓 Cours du jour » en haut d'Aujourd'hui ; « J'y étais » (une fois par occurrence, après l'heure de début) → gains 📜 Savoir (catégorie Cours).
- Examens : titre contenant examen / exam / interro / test (mots entiers, sans accents ni majuscules) + marquage manuel prioritaire.

### 2.5 V4 — Le fun à long terme (spécification : `docs/CLAUDE-complet.md` §12)
- **16. Événements aléatoires** (marchand ambulant, tempête…) : règle du skill `moteur-recompenses` → **le hasard ne donne que des bonus**
  (une « tempête » = défi avec récompense, jamais une perte). Hasard injecté et testé.
- **17. Examens = boss** : repérés par mot-clé (15b), compte à rebours, chaque révision 📚 = dégâts ; récompense le jour J.
- **18. Bilan hebdomadaire** avec graphiques (SVG local, pas de bibliothèque en ligne ; skill `dataviz` si disponible), ton positif.
- **19. Import de l'historique de l'app muscu** → XP automatique : **demander à Gauthier un export d'exemple** (format inconnu), données fictives dans les tests.

### 2.6 Étape 1b — EN TOUT DERNIER (clé de signature + 1er APK + installation sur le Honor)
- Gauthier n'a pas de clé : la créer (`keytool`, skill `appli-native` §Clé de signature), lui donner le **texte base64 + le mot de passe**
  à ranger à 2 endroits sûrs (NAS + gestionnaire de mots de passe). Jamais dans le dépôt (`*.keystore`, `*.b64` sont ignorés).
- Il crée lui-même les 4 secrets (Settings → Secrets and variables → Actions) : `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`,
  `ANDROID_KEY_ALIAS` (`gauthier`), `ANDROID_KEY_PASSWORD` — le guider pas à pas, un secret à la fois.
- Pousser sur `main`, suivre le build (onglet Actions) ; erreur Gradle → lire la PREMIÈRE erreur, 3 essais max puis expliquer.
- Installation : Releases → `.apk` → autoriser → Installer ; puis **Obtainium** pour les mises à jour. Vérifier : barre d'état, clavier, sons, village (fps, pincement).
- Ensuite : 🔁 **point de contrôle** (2-3 jours d'usage réel, les 5 questions du skill `reprise-session` §7) et rééquilibrage sur ses vraies données
  (export dans `perso/`, `outils/simulation.js`).

## 3. Repères techniques
| Fichier | Rôle |
|---|---|
| `www/config.js` | Toutes les valeurs de jeu |
| `www/stockage.js` | Modèle (schéma v2), migrations, vérification (`S.verifier(e, C)`), export / import |
| `www/taches.js` · `www/moteur.js` | Tâches · gains (multiplicateurs, bonus village calculé DANS le moteur), coffres, niveaux, prochaine action |
| `www/temps.js` · `www/jours.js` | Jour logique (Bruxelles, 4 h) · rattrapage, séries, joker, moral, incendies, pause, veille |
| `www/economie.js` | Village : coûts, Mairie, construire, améliorer, réparer, agrandir, décorations |
| `www/village-geo.js` · `village.js` · `village-ui.js` | Isométrie et terrain · scène Phaser (vue seulement) · boutons et fenêtres du village |
| `www/app.js` · `index.html` · `style.css` | Interface (seule porte d'écriture : `modifier()` ; API `window.Appli`), charte **A · Taverne** (jetons `:root`) |
| `www/sons.js` | Sons CC0 (Web Audio) |
| `outils/simulation.js` · `outils/preparer-village.js` | Simulation de l'économie (`SIM_CONFIG='{…}'`) · atlas du village |
| `tests/*.test.js` · `tests/e2e/parcours.mjs` | `npm test` · `npm run e2e` |

- Playwright est installé globalement : `ln -sfn "$(npm root -g)/playwright" node_modules/playwright` (à refaire après chaque `npm i`).
- Tests navigateur : `localStorage.debug_maintenant` (horloge) et `debug_hasard` = `jamais` | `toujours` (coffres) — ignorés dans l'appli installée.
- Après un changement de `www/` : `npm run sync`. Nouveau plugin : `npm i <plugin>` + `npx cap sync android` + committer `android/`.
- Réseau de l'environnement cloud : npm et GitHub (fichiers bruts, Releases) OK ; kenney.nl, opengameart, itch.io bloqués.
- Captures du village : pour Claude seulement (dossier temporaire), jamais envoyées à Gauthier avant la 1b.

## 4. Feuille de route (cocher ici ET dans `docs/CLAUDE-complet.md`)
- [x] 2.0 Rééquilibrage validé (config.js + tests + simulation)
- [x] 1a · [x] 2 · [x] 3 · [x] 4 · [x] 5a · [x] 5b · [x] 6 · [x] 7 · [x] 9 · [x] 10 · [x] 11 · [x] 12 · [x] 13
- [x] 8. Réglages, À propos, vérification des mises à jour, check-list, v1.0.0
- [x] 14. Notifications locales
- [x] 15a. Lecture iCal
- [ ] 15b. Cours du jour + « J'y étais » + examens
- [ ] 16. Événements aléatoires · [ ] 17. Examens = boss · [ ] 18. Bilan hebdomadaire · [ ] 19. Import muscu
- [ ] 1b. Clé de signature + 4 secrets + 1er build + installation sur le Honor — **en tout dernier**
- [ ] 🔁 Point de contrôle après 2-3 jours d'usage réel

<sub>Créé par Gauthier Doumont</sub>
