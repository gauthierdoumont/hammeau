---
name: "appli-native"
description: "Dans Claude Code, dès qu'il demande une appli (nouvelle ou conversion d'une appli HTML) : vraie appli installable, APK Android + .exe Windows via Capacitor/Electron et GitHub Actions, jamais une page web."
---

# Appli native — APK Android + .exe Windows, jamais une page web

## Objectif
Quand Gauthier demande une **application** dans un dépôt GitHub (nouveau dossier, dépôt vide, ou appli HTML existante à convertir), livrer une **vraie appli installée** :
- Android (Honor 600 Pro, tablette Lenovo) → fichier **.apk**
- Windows (PC) → installateur **.exe**
- Icône sur l'écran d'accueil / menu Démarrer, s'ouvre sans navigateur ni lien, **100 % hors ligne**
- Compilée **par GitHub** (GitHub Actions), téléchargeable dans l'onglet **Releases** : il n'a ni Android Studio ni SDK à installer
- Il débute sur GitHub (sait déposer des fichiers, pas développer) → toute manipulation de sa part = pas à pas

Prioritaire sur `app-html-perso` : celui-ci ne sert plus que s'il demande explicitement une page web / GitHub Pages.

## Choix techniques (fixes)
| Besoin | Outil | Pourquoi |
|---|---|---|
| Interface | HTML/CSS/JS sans framework dans `www/` | Code rapide à produire, applis existantes réutilisables, testable dans un navigateur |
| Android | **Capacitor** | Emballe `www/` dans un vrai APK + accès natif (stockage, partage, bouton retour) |
| Windows | **Electron + electron-builder** | Même `www/`, installateur .exe, pas de navigateur |
| Compilation | **GitHub Actions** | Rien à installer chez lui ; chaque push sur `main` = nouvelle version |
| Mises à jour Android | **Obtainium** (F-Droid / GitHub) | Suit les Releases du dépôt et installe les nouvelles versions sans chercher de lien |

Versions : toujours `@latest`, ne pas recopier de numéros de mémoire. Capacitor 8 = Node 22+, JDK 21, minSdk 24 ; vérifier la doc si une version plus récente est sortie. Actions GitHub : prendre la dernière version majeure (celles ci-dessous sont un minimum).

Interdits :
- `server.url` dans `capacitor.config.json` → l'appli rechargerait un site en ligne = retour à la page web
- CDN, Google Fonts, API obligatoire → tout en local (sinon ça casse hors ligne)
- Service worker / manifest PWA dans `www/` (inutiles, risque de cache périmé)
- Changer l'`appId` après la 1re installation (Android y verrait une autre appli → données perdues)
- Compiler l'APK en local : pas de SDK Android ici, c'est GitHub qui compile

## Avant de coder (ne demander que ce qui manque)
- Nom affiché + à quoi sert l'appli en 1 phrase + version minimale (skill `cadrage-projet` si dispo)
- Données à stocker (liste des champs)
- Windows aussi ? (par défaut oui)
- Icône : symbole + couleur (sinon choisir)
- Clé de signature déjà créée ? (section dédiée)

## Structure du dépôt
```
mon-appli/
├─ www/                    interface : index.html, app.js, style.css, data/, version.js
├─ electron/main.js        fenêtre Windows
├─ android/                projet Android généré par Capacitor (committé)
├─ assets/logo.png         icône source 1024×1024
├─ scripts/version.js      écrit la version dans www/version.js
├─ .github/workflows/build.yml
├─ .claude/skills/appli-native/SKILL.md   copie de ce skill
├─ capacitor.config.json · package.json · package-lock.json
└─ CLAUDE.md · README.md · CHANGELOG.md · .gitignore
```

## Mise en place (nouveau projet)
1. `node -v` (22+). Sur son PC sans Node : proposer `winget install OpenJS.NodeJS.LTS` (demander avant).
2. Créer un `www/index.html` minimal (Capacitor exige que le dossier existe), puis :
```bash
npm init -y
npm i @capacitor/core @capacitor/android @capacitor/app @capacitor/preferences @capacitor/filesystem @capacitor/share
npm i -D @capacitor/cli @capacitor/assets electron electron-builder
npx cap init "Nom Affiché" be.gauthierdoumont.nomappli --web-dir www
npx cap add android
```
   - `appId` : `be.gauthierdoumont.<nom>` (minuscules, lettres et chiffres)
   - Liens externes dans l'appli → ajouter `@capacitor/browser`
   - Téléchargement d'Electron bloqué en local → `ELECTRON_SKIP_BINARY_DOWNLOAD=1 npm i` (le binaire ne sert qu'à GitHub)
3. `package.json` — compléter :
```json
{
  "name": "nomappli",
  "version": "1.0.0",
  "author": "Gauthier Doumont",
  "main": "electron/main.js",
  "scripts": {
    "version-js": "node scripts/version.js",
    "icones": "npx @capacitor/assets generate --android --iconBackgroundColor \"#ffffff\" --splashBackgroundColor \"#ffffff\""
  },
  "build": {
    "appId": "be.gauthierdoumont.nomappli",
    "productName": "Nom Affiché",
    "copyright": "© Gauthier Doumont",
    "directories": { "output": "dist" },
    "files": ["www/**/*", "electron/**/*"],
    "win": { "target": "nsis", "icon": "assets/logo.png" },
    "nsis": { "oneClick": true, "artifactName": "${name}-windows-${version}.exe" }
  }
}
```
4. `scripts/version.js` :
```js
// Écrit la version de package.json dans www/version.js — Créé par Gauthier Doumont
const v = require('../package.json').version;
require('fs').writeFileSync(__dirname + '/../www/version.js', `window.APP_VERSION = "${v}";\n`);
```
5. `electron/main.js` :
```js
// Fenêtre Windows de l'appli — Créé par Gauthier Doumont
const { app, BrowserWindow, Menu, shell } = require('electron');
const path = require('path');

if (!app.requestSingleInstanceLock()) app.quit();

function creerFenetre() {
  const win = new BrowserWindow({ width: 1100, height: 800, show: false,
    webPreferences: { contextIsolation: true, sandbox: true } });
  Menu.setApplicationMenu(null);
  win.loadFile(path.join(__dirname, '..', 'www', 'index.html'));
  win.once('ready-to-show', () => win.show());
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
}
app.whenReady().then(creerFenetre);
app.on('second-instance', () => BrowserWindow.getAllWindows()[0]?.focus());
app.on('window-all-closed', () => app.quit());
```
6. `android/app/build.gradle` (Groovy ; si `.kts`, même logique en syntaxe Kotlin), dans `android { }` — `signingConfigs` AVANT `buildTypes` :
```groovy
defaultConfig {
    // … garder le reste
    versionCode((int) (System.currentTimeMillis() / 60000L))  // toujours croissant → la mise à jour s'installe par-dessus
    versionName System.getenv("APP_VERSION") ?: "1.0.0"
}
signingConfigs {
    release {
        if (System.getenv("KEYSTORE_PATH")) {
            storeFile file(System.getenv("KEYSTORE_PATH"))
            storePassword System.getenv("KEYSTORE_PASSWORD")
            keyAlias System.getenv("KEY_ALIAS")
            keyPassword System.getenv("KEY_PASSWORD")
        }
    }
}
buildTypes {
    release {
        signingConfig signingConfigs.release
        // … garder le reste
    }
}
```
   `android/gradle.properties` : `org.gradle.jvmargs=-Xmx4g -Dfile.encoding=UTF-8`
7. Icône : dessiner un SVG simple → PNG 1024×1024 dans `assets/logo.png` (sharp via npm), puis `npm run icones` et `npx cap sync android`. À refaire seulement quand l'icône change.
8. Copier le dossier de ce skill dans `.claude/skills/appli-native/` (pour qu'il marche sur Claude Code web comme sur le PC). Écrire :
   - `CLAUDE.md` : « Ce dépôt est une appli native (Capacitor + Electron). Ne jamais le transformer en page web. Suivre .claude/skills/appli-native. »
   - `README.md` : Installer · Mettre à jour · Pour développer · dernière ligne discrète « Créé par Gauthier Doumont »
   - `CHANGELOG.md`, `.gitignore` : `node_modules/` `dist/` `*.keystore` `*.jks` `*.b64`
9. Clé de signature + secrets (section suivante).
10. Coder `www/`, tester, `npm run version-js`, `npx cap sync android`, commit, push.

## Clé de signature (une seule pour toutes ses applis)
Pourquoi : Android n'installe une mise à jour que si elle porte la même signature. Clé perdue = désinstaller = données perdues (sauf export).
- Demander : « As-tu déjà ta clé de signature (texte base64 + mot de passe) ? »
- **Oui** → il te les donne, ou il ajoute lui-même les 4 secrets.
- **Non** (1re fois) :
```bash
MDP=$(openssl rand -base64 18)
keytool -genkeypair -keystore gauthier.keystore -storetype PKCS12 -alias gauthier \
  -keyalg RSA -keysize 2048 -validity 10000 -storepass "$MDP" -keypass "$MDP" \
  -dname "CN=Gauthier Doumont, C=BE"
base64 -w0 gauthier.keystore > gauthier.keystore.b64
```
  Sans `keytool` : `openssl req -x509 -newkey rsa:2048 -nodes -keyout k.pem -out c.pem -days 10000 -subj "/CN=Gauthier Doumont/C=BE"` puis `openssl pkcs12 -export -in c.pem -inkey k.pem -name gauthier -out gauthier.keystore -passout pass:"$MDP"` et supprimer les .pem.
  → Lui remettre **le texte base64 + le mot de passe** (c'est tout ce qu'il faut pour les prochains dépôts), à ranger dans **2 endroits sûrs** (NAS + gestionnaire de mots de passe). Jamais dans un dépôt.
- 4 secrets du dépôt (Settings → Secrets and variables → Actions → New repository secret), ou avec `gh` :
```bash
gh secret set ANDROID_KEYSTORE_BASE64 < gauthier.keystore.b64
gh secret set ANDROID_KEYSTORE_PASSWORD --body "$MDP"
gh secret set ANDROID_KEY_ALIAS --body gauthier
gh secret set ANDROID_KEY_PASSWORD --body "$MDP"
```
  Si `gh` n'a pas le droit : pas à pas, un secret à la fois (nom exact + valeur à coller).

## Workflow `.github/workflows/build.yml`
```yaml
# Compile l'appli Android (.apk) et Windows (.exe), puis publie une Release — Créé par Gauthier Doumont
name: Construire l'appli
on:
  push:
    branches: [main]
    paths-ignore: ['**.md']
  workflow_dispatch:
permissions:
  contents: write
defaults:
  run:
    shell: bash
jobs:
  android:
    runs-on: ubuntu-latest
    outputs:
      version: ${{ steps.v.outputs.version }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - uses: actions/setup-java@v4
        with: { distribution: temurin, java-version: '21' }
      - uses: android-actions/setup-android@v3
      - id: v
        run: echo "version=$(node -p "require('./package.json').version")" >> "$GITHUB_OUTPUT"
      - run: npm ci
      - run: npm run version-js && npx cap sync android
      - name: Clé de signature
        env:
          KS: ${{ secrets.ANDROID_KEYSTORE_BASE64 }}
        run: |
          if [ -z "$KS" ]; then echo "::error::Secrets de signature absents (ANDROID_KEYSTORE_BASE64…) — voir README"; exit 1; fi
          echo "$KS" | base64 -d > "$RUNNER_TEMP/release.keystore"
          echo "KEYSTORE_PATH=$RUNNER_TEMP/release.keystore" >> "$GITHUB_ENV"
      - name: Compiler l'APK
        working-directory: android
        env:
          KEYSTORE_PASSWORD: ${{ secrets.ANDROID_KEYSTORE_PASSWORD }}
          KEY_ALIAS: ${{ secrets.ANDROID_KEY_ALIAS }}
          KEY_PASSWORD: ${{ secrets.ANDROID_KEY_PASSWORD }}
          APP_VERSION: ${{ steps.v.outputs.version }}
        run: chmod +x gradlew && ./gradlew assembleRelease --stacktrace
      - run: |
          mkdir sortie
          cp android/app/build/outputs/apk/release/app-release.apk "sortie/$(node -p "require('./package.json').name")-android-${{ steps.v.outputs.version }}.apk"
      - uses: actions/upload-artifact@v4
        with: { name: android, path: sortie/*.apk }

  windows:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - run: npm run version-js && npx electron-builder --win --publish never
      - uses: actions/upload-artifact@v4
        with: { name: windows, path: dist/*.exe }

  release:
    needs: [android, windows]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/download-artifact@v4
        with: { path: sortie, merge-multiple: true }
      - uses: softprops/action-gh-release@v2
        with:
          tag_name: v${{ needs.android.outputs.version }}-build.${{ github.run_number }}
          name: Version ${{ needs.android.outputs.version }} (build ${{ github.run_number }})
          body: "Android : télécharge le .apk · Windows : télécharge le .exe — Créé par Gauthier Doumont"
          files: sortie/*
          make_latest: true
```
Appli Android seule : supprimer le job `windows` et le retirer de `needs`.

## Code de l'interface (www/)
- Mobile d'abord : viewport `width=device-width, initial-scale=1, viewport-fit=cover`, zones tactiles ≥ 44 px, actions principales en bas, mode sombre auto + bascule. Sur la fenêtre Windows : contenu centré (max-width ~900 px) ou 2 colonnes.
- Bords : `padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)`. Au 1er test sur le Honor, vérifier que rien n'est caché sous la barre d'état ou de navigation ; sinon voir la doc Capacitor (edge-to-edge) de la version installée.
- Sections commentées : CONFIG · ÉTAT · STOCKAGE · RENDU · ÉVÉNEMENTS · UTILITAIRES. `<script src="version.js">` avant `app.js`. En-tête de chaque fichier : nom de l'appli + « Créé par Gauthier Doumont » ; `<meta name="author" content="Gauthier Doumont">`.
- Données volumineuses en `.js` (`window.DATA = [...]`), pas en `.json` chargé par fetch (fetch de fichier local échoue sous Windows/Electron).
- Le code doit aussi tourner dans un navigateur normal (plugins absents → repli) pour être testable sans téléphone.

Module natif à reprendre tel quel :
```js
/* ===== NATIF : Android via Capacitor, sinon Windows / navigateur ===== */
const NATIF = window.Capacitor?.isNativePlatform?.() === true;
const PL = NATIF ? (window.Capacitor.Plugins || {}) : {};
const CLE = 'nomappli_v1';

// Au démarrage, AVANT le premier rendu : await restaurer();
async function restaurer() {
  try {
    if (localStorage.getItem(CLE) || !PL.Preferences) return;
    const { value } = await PL.Preferences.get({ key: CLE });
    if (value) localStorage.setItem(CLE, value);
  } catch (e) { console.error(e); }
}
function charger() {
  try { return JSON.parse(localStorage.getItem(CLE)) ?? null; } catch { return null; }
}
function sauver(etat) {                      // etat contient schemaVersion
  const txt = JSON.stringify(etat);
  try { localStorage.setItem(CLE, txt); } catch (e) { alert('Sauvegarde impossible : ' + e.message); }
  PL.Preferences?.set({ key: CLE, value: txt }).catch(console.error); // copie de sécurité native
}
async function exporter(etat) {
  const nom = `${CLE}_${new Date().toISOString().slice(0, 10)}.json`;
  const txt = JSON.stringify(etat, null, 2);
  if (PL.Filesystem && PL.Share) {           // Android : feuille de partage (Drive, NAS, e-mail…)
    const { uri } = await PL.Filesystem.writeFile({ path: nom, data: txt, directory: 'CACHE', encoding: 'utf8' });
    await PL.Share.share({ title: nom, url: uri });
  } else {                                   // Windows / navigateur : « Enregistrer sous »
    const a = Object.assign(document.createElement('a'),
      { href: URL.createObjectURL(new Blob([txt], { type: 'application/json' })), download: nom });
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
}
function ouvrirLien(url) { PL.Browser ? PL.Browser.open({ url }) : window.open(url, '_blank'); }
// Bouton retour Android : écran précédent au lieu de quitter (retourEcranPrecedent() renvoie false à l'accueil)
PL.App?.addListener('backButton', () => { if (!retourEcranPrecedent()) PL.App.exitApp(); });
```
- Import : `<input type="file" accept=".json,application/json">` (marche partout), confirmation avant d'écraser ; `schemaVersion` + migration si la structure change ; rappel d'export après 14 jours sans export.
- Écran **À propos** : nom, `APP_VERSION`, plateforme (Android / Windows si `navigator.userAgent` contient « Electron » / navigateur), « Stockage natif : oui/non » (`!!PL.Preferences`, sert de diagnostic), petite ligne « Créé par Gauthier Doumont ».
- Paramètres : bouton **Vérifier les mises à jour** (seule fonction en ligne, message clair si pas de réseau) : `fetch('https://api.github.com/repos/<compte>/<depot>/releases/latest')`, comparer `tag_name` (sans `v` ni `-build…`) à `APP_VERSION`, proposer `ouvrirLien(html_url)`. `<compte>/<depot>` : lire `git remote get-url origin`.

## Après le push
- Claude Code web travaille souvent sur une branche : la Release ne part que depuis `main` → proposer de merger, ou lui expliquer : Pull requests → Merge pull request → Confirm merge.
- Suivre le build : `gh run watch` puis `gh run view --log-failed` si `gh` est dispo ; sinon lui demander l'onglet **Actions** (✅ vert = OK, ❌ rouge = copier le message d'erreur).
- Erreur Gradle : lire la PREMIÈRE erreur, pas la dernière. 3 tentatives de correction max, puis expliquer le blocage simplement.

## Installer / mettre à jour (à lui expliquer en fin de projet)
**Android, 1re fois**
1. Sur le Honor : ouvrir `https://github.com/<compte>/<depot>/releases/latest` → télécharger le `.apk`
2. Ouvrir le fichier → Android demande d'autoriser l'installation depuis le navigateur → autoriser → Installer
3. Si Play Protect avertit : Plus de détails → Installer quand même

**Mises à jour sans lien** : installer **Obtainium** une seule fois → Ajouter une appli → coller l'adresse du dépôt → il prévient et installe chaque nouvelle version. Données conservées (même clé, même appId).

**Windows** : télécharger le `.exe` sur la même page → l'ouvrir → si « Windows a protégé votre ordinateur » : Informations complémentaires → Exécuter quand même (appli non signée par Microsoft, normal). Mise à jour : lancer le nouveau `.exe`, les données restent.

## Conversion d'une appli HTML existante
1. Inventaire : fichiers, clé localStorage, CDN, service worker / manifest, fetch de fichiers locaux, `<a download>`.
2. **Données d'abord** : le stockage du navigateur ne passe PAS dans l'appli. Si la version web n'a pas de bouton Exporter → l'ajouter, la publier, et lui faire exporter ses données avant tout.
3. `git mv` des fichiers web vers `www/` (garde l'historique), puis mise en place (étapes 1 à 9).
4. Garder la même clé localStorage ; remplacer les accès directs par `charger()` / `sauver()` + `await restaurer()` au démarrage.
5. Retirer service worker et manifest, CDN → fichiers locaux, `<a download>` → `exporter()`.
6. Ajouter bouton retour Android, écran À propos, vérification des mises à jour.
7. Après installation : il importe son export dans l'appli → vérifier ensemble que tout est là.
8. GitHub Pages : laisser en ligne jusqu'à validation, puis proposer de le couper (Settings → Pages → None). La version web n'est plus mise à jour.

## Check-list avant de dire « c'est prêt »
- [ ] `www/` testé dans un navigateur (Playwright si dispo, sinon `node --check` sur chaque .js) : console sans erreur, 360-412 px et grand écran
- [ ] Hors ligne : tout marche (Playwright `setOffline(true)`), aucune ressource en ligne
- [ ] Ajout / modification / suppression OK, données gardées après redémarrage
- [ ] Export puis import = mêmes données
- [ ] `version` de package.json incrémentée + CHANGELOG à jour
- [ ] Workflow ✅ et Release avec le `.apk` (+ le `.exe`)
- [ ] appId inchangé, aucun `server.url`, aucun secret ni `.keystore` committé
- [ ] « Créé par Gauthier Doumont » : À propos, meta author, en-têtes de fichiers, package.json, README, Release

## À chaque modification ultérieure
- Incrémenter `version` (1.0.0 → 1.0.1 correctif, 1.1.0 nouveauté) + CHANGELOG → `npm run version-js` → `npx cap sync android` → push sur `main`.
- Nouveau plugin Capacitor : `npm i <plugin>` + `npx cap sync android` + committer `android/`.
- Livrer les fichiers complets, jamais des fragments à recoller à la main.

*Skill créé par Gauthier Doumont*