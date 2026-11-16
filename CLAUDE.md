# Hameau — appli Android de motivation : tâches réelles → village isométrique

> Version **condensée** pour reprendre vite. Spécification complète (règles détaillées de chaque étape, V3 et V4) :
> **`docs/CLAUDE-complet.md`** — la lire pour l'étape en cours. Ne jamais supprimer ni raccourcir ces deux fichiers.
> `appId` **`be.gauthierdoumont.hameau`** : ne change JAMAIS (sinon Android voit une autre appli → données perdues).

## 0. Règles (à chaque session)
- Ce dépôt est une appli native (Capacitor). Ne jamais le transformer en page web. Suivre `.claude/skills/appli-native`.
- **Android uniquement** (pas d'Electron, pas de job Windows). Pas de synchro entre appareils.
- Dépôt **public** (Obtainium) : aucune donnée perso, adresse, clé ou secret. Données de test fictives ; exports réels dans `perso/` (ignoré).
- Début de session : skill **`reprise-session`** → lire ce fichier puis `SUIVI.md` (état, décisions, propositions en attente).
- Plan court (5 lignes) → validation de Gauthier → code → `npm test` + `npm run e2e` → cocher la case (§4) → commit en français.
- Toutes les valeurs de jeu dans **`www/config.js`**, jamais en dur. Rééquilibrer = proposer des chiffres (simulation) à Gauthier, il valide.
- Public : récompense immédiate, jamais lent ni culpabilisant (mots bannis : raté, échec, seulement, oublié, paresse…).
- Fichiers complets ; « Créé par Gauthier Doumont » discrètement dans chaque fichier ; expliquer le pourquoi en 1-2 phrases.
- Commits poussés sur la branche de travail **et sur `main`** (accord de Gauthier). Contrôle du dépôt public avant chaque commit (skill `reprise-session` §5).
- **Surprise du village** toujours en vigueur : aucune capture ni nom du pack graphique montré à Gauthier avant son 1er lancement sur le téléphone (noms seulement dans `LICENCES.md` et Crédits).

## 1. Où on en est (v0.7.0)
Fait : 1a, 2, 3, 4, 5a, 5b, 6, 7 (V1 sauf 1b et 8) et 9-13 (V2 complète). 87 tests unitaires + parcours Playwright (11 sections) au vert.
- **À faire, dans l'ordre** : **8** (Réglages, À propos, vérif des mises à jour, check-list, release v1.0.0) → V3 (**14** notifications, **15a/15b** agenda iCal) → V4 (16-19) → **1b tout à la fin** (demande de Gauthier).
- **En attente de Gauthier** : rééquilibrage chiffré proposé dans `SUIVI.md` (le village complet prend > 200 jours avec les valeurs actuelles ; proposition ≈ 125 jours).
- **1b** (le moment venu) : créer la clé (`keytool`, cf. skill appli-native), lui donner texte base64 + mot de passe (2 endroits sûrs), il crée les 4 secrets GitHub (`ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`), puis build et installation sur le Honor (Obtainium). D'ici là le workflow échoue volontairement à « Clé de signature ».

## 2. Le jeu en bref (détails : `docs/CLAUDE-complet.md` §1-11)
- 7 familles → ressource + stat : 🧠 Esprit 📜 · 💪 Corps 🪨 · 🛠️ Création 💎 · 🤝 Social 🍞 · 🧹 Discipline 🪵 · 💼 Pro 🪙 · 🌿 Repos (XP + moral). 💠 gemmes = coffres seulement.
- Tâche : nom + Enregistrer (catégorie = dernière utilisée, imprévu, moyenne) ; options : catégorie, type (quotidienne / imprévu / bonus), taille ou objectif chiffré.
- Gain = base (10/25/50) × type (1 / 1,2 / 1,25) × série (+5 %/j, max +50 %) × bâtiment (+5 %/niv) × Repos (XP ×0,5) × anti-farm (×0,5 au-delà de 15) → arrondi une fois. Coffre 10 %. Niveaux `round(100 × n^1.5)`.
- Jour logique (Bruxelles, bascule 4 h) ; rattrapage au lancement (pause, moral −5, série + joker du lundi, incendie unique) ; « hier » ouvert jusqu'à midi ; pause rétroactive 7 jours.
- Village : Mairie d'abord (débloque les niveaux), 7 bâtiments (+5 %/niveau), placement libre, réparation 30 %, 3 anneaux de terrain (×1,5), décorations (ressources / gemmes).

## 3. Où est quoi
| Fichier | Rôle |
|---|---|
| `www/config.js` | **Toutes** les valeurs de jeu (gains, coûts, seuils, décorations, zoom) |
| `www/stockage.js` | Modèle de données (schéma **v2**), migrations, vérification, export (jamais `icsUrl`) / import |
| `www/taches.js` · `www/moteur.js` | Tâches (créer, modifier, catégories) · gains, multiplicateurs, coffres, niveaux, prochaine action |
| `www/temps.js` · `www/jours.js` | Jour logique (heure d'été/hiver) · rattrapage, séries, joker, moral, incendies, pause, veille |
| `www/economie.js` | Village : coûts, déblocages, construire, améliorer, réparer, agrandir, décorations |
| `www/village-geo.js` · `www/village.js` · `www/village-ui.js` | Isométrie et terrain · scène Phaser (vue seulement, animations, ambiance selon l'heure) · boutons et fenêtres du village |
| `www/assets/village/` | Atlas du pack (CC0) + `catalogue.js` (géométrie, carte, 8 bâtiments × 5 niveaux, images des décorations) |
| `www/app.js` · `www/index.html` · `www/style.css` | Interface (une seule porte d'écriture : `modifier()`), écrans, charte **A · Taverne** (jetons dans `:root`) |
| `www/sons.js` · `www/assets/sons/` | Sons courts CC0 (Web Audio), désactivables |
| `outils/simulation.js` | Simulation de l'économie (`SIM_CONFIG='{…}'` pour tester sans toucher `config.js`) |
| `outils/preparer-village.js` | Refait l'atlas depuis le pack d'origine |
| `tests/*.test.js` · `tests/e2e/parcours.mjs` | `npm test` (node:test) · `npm run e2e` (Playwright ; `debug_maintenant`, `debug_hasard` = horloge et hasard simulés) |
| `SUIVI.md` · `CHANGELOG.md` · `LICENCES.md` | Passation, décisions, propositions · versions · crédits et licences |

Tester dans le navigateur : `ln -sfn "$(npm root -g)/playwright" node_modules/playwright` puis `npm run e2e`.
Après un changement de `www/` : `npm run sync` (version + copie vers Android). Nouveau plugin : `npm i` + `npx cap sync android`.

## 4. Feuille de route (cocher ici ET dans `docs/CLAUDE-complet.md`)
### V1 — Tâches + récompenses
- [x] 1a. Squelette appli native + workflow Android
- [ ] 1b. Clé de signature + 4 secrets + 1er build + installation sur le Honor — **à faire en tout dernier**
- [x] 2. Modèle de données, config.js, stockage, export/import
- [x] 3. Familles, catégories, ajout express, options, catégories perso
- [x] 4. Écran Aujourd'hui, cocher, progression partielle, gains, animation « +25 »
- 🔁 Point de contrôle : 2-3 jours d'usage réel, puis les 5 questions du skill `reprise-session` §7 (après la 1b)
- [x] 5a. Moteur complet (multiplicateurs, anti-farm, stats, niveaux, coffres)
- [x] 5b. Retour visuel (vibrations, sons, fête, coffre)
- [x] 6. Jour logique, rattrapage, séries, joker, moral, incendies, pause, veille + tests
- [x] 7. Prochaine action + écran Perso
- [ ] 8. Réglages (sons, vibrations, sauvegardes auto + Restaurer, rappel d'export 14 j), À propos, vérification des mises à jour, check-list du skill, release v1.0.0
### V2 — Le village
- [x] 9 · [x] 10 · [x] 11 · [x] 12 · [x] 13
### V3 — Calendrier + notifications (spécification : `docs/CLAUDE-complet.md` §8)
- [ ] 14. Notifications locales matin / soir / échéances + permission + reprogrammation
- [ ] 15a. Lecture iCal (CapacitorHttp explicite + ical.js local + cache + `tests/exemple.ics`) — adresse iCal jamais dans le dépôt
- [ ] 15b. Cours du jour dans Aujourd'hui + « J'y étais » → Savoir
### V4 — Le fun à long terme
- [ ] 16. Événements aléatoires · [ ] 17. Examens = boss · [ ] 18. Bilan hebdomadaire · [ ] 19. Import de l'app muscu

<sub>Créé par Gauthier Doumont</sub>
