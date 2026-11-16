# Hameau — appli de motivation : tâches réelles → village à construire

> Nom de travail : « Hameau » (le nom affiché peut changer plus tard ; l'`appId` `be.gauthierdoumont.hameau`, lui, ne change JAMAIS après la 1re installation).

## 0. Règles de travail (à lire à chaque session)

### Session 1 uniquement
- Si `.claude/skills/appli-native/` est absent du dépôt : lancer le skill `appli-native` (liste des skills disponibles) et copier son `SKILL.md` dans `.claude/skills/appli-native/SKILL.md`. S'il est introuvable : **s'arrêter** et demander le fichier à Gauthier.
- **Ne jamais écraser ni raccourcir ce CLAUDE.md.** Quand le skill demande d'écrire un CLAUDE.md, vérifier seulement que la phrase « Ce dépôt est une appli native (Capacitor). Ne jamais le transformer en page web. » figure ci-dessous (elle y est).
- Demander à Gauthier s'il a **déjà sa clé de signature** (une seule clé pour toutes ses applis, cf. skill). Sinon, la créer selon le skill.

### Toujours
- Ce dépôt est une appli native (Capacitor). Ne jamais le transformer en page web. Suivre `.claude/skills/appli-native` (structure, stockage, signature, workflow, check-list).
- **Android uniquement** : pas d'Electron (pas de dossier `electron/`, pas de dépendances electron/electron-builder, pas de job `windows` dans le workflow). Pas de synchro entre appareils.
- Le dépôt est **public** (nécessaire pour Obtainium et la vérification des mises à jour) → aucune donnée personnelle, adresse ou secret dans le dépôt.
- **Une étape par session** : plan court (5 lignes max) → validation de Gauthier → code → test → cocher la case → commit.
- Suivre la **feuille de route (section 12)** dans l'ordre.
- Toutes les valeurs de jeu (gains, coûts, seuils) dans **`www/config.js`** (`window.CONFIG = {...}`), jamais en dur dans le code : on doit pouvoir rééquilibrer sans chercher.
- Livrer des fichiers complets, jamais des fragments à recoller.
- Public visé : un utilisateur qui a besoin d'une **récompense immédiate**, qui décroche si l'appli est lente ou culpabilisante. Ajouter une tâche = **nom + Enregistrer**. Aucun message moralisateur.
- Expliquer le **pourquoi** des choix en 1-2 phrases, en français, sans jargon inutile.
- Discrètement, dans chaque fichier : « Créé par Gauthier Doumont » (en-têtes, meta author, À propos, README, Release).

## 1. Le concept en une phrase

Chaque action de la vraie vie (même partielle) rapporte de l'**XP**, des **ressources** et des **points de stats** ; les ressources servent à construire et améliorer un **village isométrique** inspiré de Forge of Empires / Clash of Clans.

## 2. Écrans

| Écran | Contenu |
|---|---|
| **Aujourd'hui** (accueil) | Cours du jour (V3) · Quotidiennes · Imprévus (triés par échéance) · Bonus · barre d'XP + niveau · ressources · bouton **« Prochaine action »** · bouton **+** flottant en bas |
| **Village** (V2) | Scène isométrique Phaser : construire, améliorer, réparer, agrandir, villageois animés |
| **Perso** | Le chef du village : niveau, 6 stats, série, moral, historique simple |
| **Réglages** | Notifications, adresse iCal (V3), mode pause, export/import, catégories perso, À propos, crédits |

Navigation : barre d'onglets en bas. Bouton retour Android = écran précédent.

## 3. Familles, catégories et ressources

| Famille | Catégories de départ (emoji + nom) | Ressource | Stat |
|---|---|---|---|
| 🧠 Esprit | 🎓 Cours · 📝 Synthèses · 📚 Révision · 📖 Lecture · 📰 Journal du matin · 🗣️ Langues | 📜 Savoir | Intelligence |
| 💪 Corps | 🏋️ Muscu · 🏃 Course · 🏀 Basket · 😴 Sommeil · 🥗 Alimentation | 🪨 Pierre | Force |
| 🛠️ Création | 🧱 Nanoblocks · 🏠 Booknook · 💻 Projets code · ⛏️ Mods / jeux · 🎨 Créatif divers | 💎 Cristaux | Créativité |
| 🤝 Social | 👫 Amis · ❤️ Couple · 👨‍👩‍👦 Famille · 🎉 Sorties | 🍞 Nourriture | Charisme |
| 🧹 Discipline | 🧽 Ménage · 🛒 Courses · 📦 Rangement · 🔁 Routine | 🪵 Bois | Discipline |
| 💼 Pro & admin | 🏢 Stage · 💶 Job · 📄 Papiers · 📊 Budget · 🚗 Voiture | 🪙 Or | Organisation |
| 🌿 Repos | ☕ Pause · 🎮 Jeu · 🌳 Balade · 🧘 Détente | ❤️ Moral (pas de stat) | — |

- Catégories perso : nom + emoji + famille. Les plus utilisées remontent en **favoris**.
- Monnaie rare : 💠 **Gemmes** (uniquement via coffres) → décorations rares.

## 4. Tâches

**Ajout express** : taper le nom → **Enregistrer**. Valeurs par défaut : catégorie = dernière utilisée, type = imprévu, taille = moyenne. Un bouton « Plus d'options » déplie :
- **Catégorie** (grille d'icônes, favoris en haut)
- **Type** : `quotidienne` (jours de la semaine, tous par défaut) · `imprévu` (échéance facultative + case « important ») · `bonus`
- **Taille** : petite / moyenne / grosse, OU **objectif chiffré** (cible + unité : 20 pages, 30 minutes…)

Règles :
- Progression partielle : saisir « 10 » sur un objectif de 20 → 50 % des gains. Plusieurs saisies par jour s'additionnent, plafond 100 %.
- Une quotidienne ne rapporte qu'une fois par jour logique. Un imprévu ou bonus terminé est archivé.
- **Saisie pour la veille** possible jusqu'à midi (« Je l'ai fait hier »).

## 5. Moteur de récompenses (valeurs de départ dans `config.js`, à ajuster après test)

- **Base selon la taille** : petite 10 · moyenne 25 · grosse 50 (objectif chiffré = moyenne par défaut, modifiable).
- **Multiplicateur de type** : quotidienne ×1 · imprévu ×1,2 · bonus ×1,25.
- **Série** : +5 % par jour de série, plafonné à +50 %.
- **Repos** : XP ×0,5 (le moral reste plein, cf. §6). Se reposer est récompensé, mais n'est pas la stratégie la plus rentable.
- **Anti-farm** : au-delà de **15 tâches terminées** dans le même jour logique, gains ×0,5.
- **Gains** = base × type × série × progression (× bonus des bâtiments en V2) → arrondi. Donne la même valeur en **XP** et en **ressource de la famille**.
- **Stat de la famille** = `floor(gagneTotal[famille] / 10)`, calculée sur le **cumul total gagné** (jamais diminué par les dépenses ou les incendies).
- **Niveau** : XP pour passer du niveau n à n+1 = `round(100 × n^1.5)`.
- **Coffre aléatoire** : 10 % de chance à chaque tâche terminée à 100 % → 2 ressources aléatoires (10 à 30 chacune) + 1 à 3 gemmes. Ouverture animée.
- **Retour immédiat** à chaque saisie : « +25 📜 » qui s'envole vers le compteur, vibration courte (`@capacitor/haptics`), son court. Montée de niveau = écran de fête.

## 6. Jours, séries et pénalités (douces / dures, toujours réparables)

### Jour logique
- `jourLogique(date)` = date **locale** (Europe/Brussels), moins 1 jour si l'heure locale est < 4 h. Calculer sur les champs de date locale, **jamais** en soustrayant des millisecondes (changements d'heure été/hiver).
- Chaque entrée du journal stocke l'`horodatage` ET le `jour` logique.

### Rattrapage des jours écoulés
Au lancement, pour chaque jour logique entre `dernierJourTraite` (exclu) et aujourd'hui (exclu), dans l'ordre :
1. Si ce jour est couvert par une pause → rien.
2. **Quotidiennes prévues ce jour-là et non faites** (douce) : moral −5 par tâche (min 0).
3. **Série** : un jour **sans aucune quotidienne prévue est neutre** (ni gain ni perte). Sinon, le jour est validé si au moins une quotidienne a été terminée ET si les gains du jour ≥ 30 XP (évite de tenir la série avec une tâche bidon). Jour non validé → utilise le **joker** s'il en reste, sinon série = 0.
4. **Joker** : 1 par semaine, remis à 1 à chaque lundi franchi pendant le rattrapage.
5. **Imprévu « important » dont l'échéance est dépassée** (dure) : événement « Incendie », **une seule fois par tâche** (`incendieApplique = true`). En V1 : perte de 20 % de la ressource de sa famille (max 50). Dès la V2 : un bâtiment aléatoire devient **endommagé** (bonus désactivé) jusqu'à réparation.
Puis `dernierJourTraite = hier`. La saisie pour la veille (jusqu'à midi) est prise en compte avant ce calcul : ne traiter « hier » qu'après midi, ou recalculer si une saisie rétroactive arrive.

**Tests unitaires obligatoires** pour `jourLogique` et le rattrapage (`tests/jours.test.js`, exécutable avec `node`) : 0, 1 et 10 jours manqués, passage à l'heure d'été/hiver, lundi franchi, pause, incendie unique.

### Moral et pause
- **Moral** (0-100, départ 80) : +1 par tâche terminée, +5 par tâche Repos. Sous 40 : villageois tristes et bonus des bâtiments désactivés (V2). Jamais d'effet sur les gains de base.
- **Mode pause** (malade, blocus, vacances) : aucune pénalité, série gelée. Activable **rétroactivement** jusqu'à 7 jours en arrière.
- **Jamais** : perte d'XP, de niveau, de bâtiment ou de catégorie. Au retour après une absence : message neutre et encourageant.

## 7. « Prochaine action »

Propose **une seule** tâche, dans cet ordre : imprévu avec échéance (la plus proche) → quotidienne non faite (la plus petite) → imprévu sans échéance (le plus ancien) → bonus. Bouton « Pas maintenant » → propose la suivante.

## 8. Technique

- Interface : HTML/CSS/JS sans framework dans `www/` (cf. skill). Mobile d'abord, mode sombre.
- Village : **Phaser 3** copié en local (`www/lib/phaser.min.js`), jamais de CDN.
- Stockage : module natif du skill, clé `hameau_v1`, `schemaVersion` + migrations.
- **Export/import JSON dès la V1. L'export n'inclut JAMAIS `reglages.icsUrl`** (l'export peut partir sur Drive ou par mail).
- Plugins : `@capacitor/preferences`, `filesystem`, `share`, `app`, `haptics` (V1) ; `local-notifications` (V3) ; `browser` si liens externes.

### Modèle de données (schemaVersion 1)
- `familles` (fixes) · `categories[] {id, nom, emoji, familleId, perso, nbUtilisations}`
- `taches[] {id, nom, categorieId, type, taille, objectif?{cible, unite}, jours?[], echeance?, important?, incendieApplique, creeLe, termineeLe?, archivee}`
- `journal[] {id, tacheId, horodatage, jour, valeur, progression, gains{xp, ressource, quantite}}`
- `joueur {xp, niveau, stats{intelligence, force, creativite, charisme, discipline, organisation}, ressources{savoir, pierre, cristaux, nourriture, bois, or, gemmes}, gagneTotal{par famille}, moral, serie{jours, joker}, pause{actif, depuis, jusqua?}}`
- `etat {dernierJourTraite}`
- `village {batiments[{id, type, niveau, x, y, endommage}], extensions, decorations[]}` (V2)
- `reglages {notifMatin, notifSoir, icsUrl, calendrierCache, derniereCategorie, dernierExport, sons, vibrations}`

### Notifications (V3)
- Demander la permission (obligatoire depuis Android 13), expliquer pourquoi avant la demande.
- Matin (8 h, réglable) : programme du jour. Soir (20 h, réglable) : quotidiennes restantes. Veille d'échéance.
- **Reprogrammer toutes les notifications à chaque ouverture et à chaque tâche cochée** (sinon le message du soir est périmé).
- Les alarmes Android peuvent être décalées de quelques minutes : acceptable.
- Rappeler à Gauthier de désactiver l'optimisation de batterie pour l'appli (MagicOS coupe sinon les notifications).

### Calendrier (V3)
- Gauthier centralise tout dans **Google Agenda** ; l'appli lit son **adresse secrète iCal**, saisie dans Réglages, **jamais écrite dans le code ni le dépôt**.
- Appel via `CapacitorHttp.get()` **explicite** (ne PAS activer CapacitorHttp globalement : ça modifierait tous les `fetch`, y compris le chargeur de Phaser).
- Dans un navigateur, l'appel est bloqué (CORS) → tester avec `tests/exemple.ics`.
- Parser : utiliser **ical.js** copié en local (licence MPL-2.0, à citer dans `LICENCES.md`), qui gère lignes repliées, UTC (`Z`), `TZID`, `VALUE=DATE`, `RRULE`, `EXDATE`, `RECURRENCE-ID`.
- Garder le dernier calendrier chargé (`calendrierCache`) pour l'usage hors ligne. Actualisation à l'ouverture + bouton « Actualiser ».
- **Examens** : un événement dont le titre contient « examen », « exam », « interro » ou « test » (sans tenir compte des majuscules/accents) est un examen ; Gauthier peut aussi marquer/démarquer un événement à la main.

## 9. Graphismes et sons (le village doit être BEAU)

- Style visé : isométrique coloré et lisible, inspiré de Forge of Empires / Clash of Clans. Attente réaliste : des packs libres de qualité, pas des illustrations de studio pro ; l'écart se comble avec l'animation.
- **Surprise** : Claude choisit le pack et ne montre **ni image, ni capture, ni nom de pack** avant le 1er lancement du village. Au plan de l'étape 9, n'annoncer que **la licence et le prix (gratuit)**. Si le téléchargement est impossible depuis Claude Code : donner un lien en demandant de télécharger sans ouvrir et de déposer le .zip dans `assets/brut/`.
- Budget : **gratuit**. Un pack payant (≤ 15 €) seulement si Gauthier le demande — dans ce cas il le verra en l'achetant, la surprise est sacrifiée.
- Un seul pack principal cohérent (pas de mélange de styles). Licence CC0 de préférence, CC-BY accepté avec crédits.
- Fichiers dans `www/assets/village/`, licences dans `LICENCES.md`, artistes cités dans l'écran **Crédits**.
- Si le pack n'a pas plusieurs niveaux par bâtiment : marquer le niveau par des éléments ajoutés (drapeaux, socle, halo, badge) et une légère mise à l'échelle.
- Le rendu « jeu pro » vient de l'**animation** : rebond à la pose, chantier avec échafaudage, fumée des cheminées, villageois qui marchent, particules à la récolte, sons courts (packs audio CC0).

## 10. Village (V2)

- Bâtiments : 📚 Bibliothèque (Esprit) · ⚔️ Arène (Corps) · 🔨 Atelier (Création) · 🍺 Taverne (Social) · 🪚 Scierie (Discipline) · 🏦 Banque (Pro & admin) · 🌳 Jardin (Repos) · 🏛️ Mairie.
- Chaque bâtiment, niveaux 1 à 5 : **+5 % de gains par niveau** pour sa famille (désactivé si endommagé ou moral < 40).
- Pas de production passive : le village **amplifie** la vraie vie, il ne la remplace pas.
- Villageois : 1 par bâtiment, se promènent ; humeur liée au moral.

## 11. Économie (valeurs de départ dans `config.js`)

Objectif d'équilibrage : **environ 4 mois** d'usage régulier pour tout monter au niveau 5, puis des dépenses qui continuent.
- **Coût d'un bâtiment au niveau n** : `50 × n²` de la ressource de sa famille + `20 × n²` bois + `20 × n²` pierre. Jardin : moral non dépensable → payé en nourriture.
- **Mairie au niveau n** : `40 × n²` de chaque ressource. Niveau joueur requis : 1 / 5 / 10 / 16 / 23.
- Niveau max des autres bâtiments = niveau de la Mairie.
- **Réparation** d'un bâtiment endommagé : 30 % du coût de son niveau actuel.
- **Dépenses continues** (pour éviter l'ennui une fois tout au max) : extensions de terrain (coût ×1,5 à chaque extension), décorations payables en ressources (communes) ou en gemmes (rares).
- Après 2 semaines d'usage réel, comparer gains moyens par jour et coûts, et proposer un rééquilibrage chiffré à Gauthier.

## 12. Feuille de route (étapes de 45 min max, chacune testable)

### V1 — Tâches + récompenses (utilisable au quotidien)
- [x] 1a. Squelette appli native (sans Electron) + workflow Android (~40 min)
- [ ] 1b. Clé de signature + 4 secrets + 1er build + installation sur le Honor (~40 min)
- [x] 2. Modèle de données, `config.js`, stockage, export/import JSON (~40 min)
- [x] 3. Familles et catégories + ajout express de tâche + « Plus d'options » + catégories perso (~45 min)
- [x] 4. Écran Aujourd'hui : listes par type, cocher, progression partielle, **XP + ressource de base + animation « +25 »** (~45 min)
- 🔁 **Point de contrôle** : Gauthier l'utilise 2-3 jours, puis on ajuste.
- [x] 5a. Moteur complet : multiplicateurs, anti-farm, stats cumulées, niveaux, coffres (~45 min)
- [x] 5b. Retour visuel : vibrations, sons, écran de fête, ouverture de coffre (~40 min)
- [x] 6. Jour logique, rattrapage, séries, joker, moral, incendies, pause rétroactive, saisie de la veille + tests unitaires (~45 min)
- [ ] 7. Prochaine action + écran Perso (~40 min)
- [ ] 8. Réglages, À propos, vérification des mises à jour, check-list du skill, release v1.0.0 (~40 min)

### V2 — Le village
- [x] 9. Choix et intégration du pack graphique (surprise) + crédits (~45 min)
- [x] 10. Scène Phaser isométrique : grille, caméra, zoom au doigt (~45 min)
- [x] 11. Construire / améliorer / coûts / bonus des bâtiments / Mairie (~45 min)
- [x] 12. Animations, villageois, effets, sons (~45 min)
- [x] 13. Bâtiments endommagés + réparation, extensions, décorations (~45 min)

### V3 — Calendrier + notifications
- [ ] 14. Notifications locales matin/soir/échéances + permission + reprogrammation (~40 min)
- [ ] 15a. Lecture iCal (CapacitorHttp + ical.js + cache + `tests/exemple.ics`) (~45 min)
- [ ] 15b. Affichage des cours dans Aujourd'hui + « J'y étais » → Savoir (~40 min)

### V4 — Le fun à long terme
- [ ] 16. Événements aléatoires (marchand ambulant, tempête…) (~45 min)
- [ ] 17. Examens = boss (repérés par mot-clé, compte à rebours, révisions = dégâts) (~45 min)
- [ ] 18. Bilan hebdomadaire avec graphiques de progression (~45 min)
- [ ] 19. Import de l'historique de l'app muscu → XP automatique (~45 min)

### Plus tard (idées, pas dans le plan)
- Widget Android sur l'écran d'accueil · version Windows · succès / trophées · saisons.

<sub>Créé par Gauthier Doumont</sub>
