---
name: "reprise-session"
description: "Début et fin de chaque session Claude Code sur ses projets : reprendre où on en était (SUIVI.md), tester l'appli, contrôler le dépôt public, commit et message final clair."
---

# Reprise de session — projets Claude Code

## Pourquoi
Chaque session repart de zéro. Sans passation, Claude redemande des choses déjà décidées, refait des erreurs déjà corrigées ou casse une étape précédente. Ce skill sert pour tous ses dépôts (Hameau, Audit Detective, traque GPS, mod…).
**Le CLAUDE.md du projet prime.** Ne jamais l'écraser ni le raccourcir : on y coche seulement les cases de la feuille de route.

## 1. Début de session (5 min max, sans rien demander)
1. Lire **en entier** `CLAUDE.md`, puis `SUIVI.md` s'il existe.
2. `git status` · `git log --oneline -10` · branche actuelle (travail sur une branche ? → voir §5).
3. `npm ci` si `node_modules/` absent, puis `npm test` s'il existe. Rouge → réparer AVANT toute nouvelle étape.
4. Repérer la 1re case non cochée de la feuille de route + les skills cités pour cette étape → les charger.
5. **Session 1 du projet** : copier dans `.claude/skills/<nom>/SKILL.md` chaque skill cité par le CLAUDE.md (pas seulement `appli-native`) → ils marchent aussi dans Claude Code sur son PC. Créer `SUIVI.md` (modèle §6) et ajouter `perso/` et `tests/captures/` au `.gitignore`.
6. Traiter d'abord la section « Retours de Gauthier » de `SUIVI.md` (bugs signalés), puis l'étape suivante.

## 2. Le plan court et les questions
- Plan de 5 lignes max (format du CLAUDE.md) : ce qui sera fait · ce qui sera visible pour lui · durée estimée · risques.
- Étape estimée > 45 min → la couper (ex. 5a / 5b), le noter dans `SUIVI.md`.
- **Gauthier décide de ce qu'il voit, Claude décide de la technique.** Choix techniques : les prendre et les expliquer en 1 ligne. Questions seulement sur le ressenti ou le produit, 2 maximum, chacune avec une option recommandée et « sans réponse, je prends X » (outil de questions à choix si disponible).
- Ne jamais reposer une question déjà tranchée dans `SUIVI.md` → Décisions.

## 3. Pendant
- Une seule étape. Une amélioration hors étape → la noter dans `SUIVI.md`, ne pas la faire.
- Fichiers complets, pas de fragments. Ne pas toucher aux fichiers sans rapport.
- Bloqué après 3 tentatives sur le même problème → s'arrêter, expliquer simplement, proposer 2 options.

## 4. Tester avant de dire « c'est fait »
### Toujours
- `npm test` vert · `node --check` sur chaque `.js` de `www/`.
### Parcours dans un vrai navigateur (Playwright)
Disponible ? `npx playwright --version`. Sinon `npm i -D playwright && npx playwright install chromium`. Téléchargement bloqué → tests node uniquement + vérification par Gauthier (§5), et le dire.

`tests/e2e/parcours.mjs` (serveur local sans dépendance, car `fetch` ne marche pas en `file://`) :
```js
// tests/e2e/parcours.mjs — Créé par Gauthier Doumont
import { chromium } from 'playwright';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png',
  '.json': 'application/json', '.ogg': 'audio/ogg', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };
const serveur = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  fs.readFile(path.join('www', p), (e, d) => {
    if (e) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream' }); res.end(d);
  });
}).listen(4173);
const nav = await chromium.launch();
const page = await nav.newPage({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2 });
const erreurs = [], externes = [];
page.on('pageerror', e => erreurs.push(e.message));
page.on('console', m => m.type() === 'error' && erreurs.push(m.text()));
page.on('request', r => { if (!r.url().startsWith('http://localhost:4173')) externes.push(r.url()); });
// État de départ et horloge simulée (skill temps-et-rappels) :
// await page.addInitScript(([e, d]) => { localStorage.setItem('hameau_v1', e); localStorage.setItem('debug_maintenant', d); }, [etatJson, '2026-11-25T09:00:00']);
await page.goto('http://localhost:4173/');
// … scénarios …
await page.screenshot({ path: 'tests/captures/accueil.png', fullPage: true });
console.log({ erreurs, externes });
await nav.close(); serveur.close();
```
Scénarios selon l'étape :
- [ ] Ajouter (nom + Enregistrer), cocher, progression partielle, supprimer
- [ ] Recharger la page → données toujours là
- [ ] Export puis import = même état
- [ ] Horloge + 1 jour et + 10 jours → rattrapage et message neutre
- [ ] Largeur 360 px : pas de défilement horizontal (`scrollWidth <= innerWidth`)
- [ ] `erreurs` et `externes` vides (hors ligne garanti)
- [ ] **Regarder les captures** (outil Read sur le PNG) : texte coupé, chevauchement, bouton caché sous la barre
Données de test : `tests/fixtures/*.json`, **toujours fictives** (dépôt public). Ses vrais exports vont dans `perso/` (ignoré par git). Village Hameau : captures pour Claude seulement, jamais montrées avant le 1er lancement (surprise).

## 5. Fin de session
1. Cocher la case de l'étape dans `CLAUDE.md` (et rien d'autre).
2. Mettre à jour `SUIVI.md`, la version dans `package.json` et `CHANGELOG.md` (règles d'`appli-native`).
3. **Contrôle du dépôt public** avant le commit :
```bash
git add -A
git diff --cached --name-only | grep -E '\.(keystore|jks|b64|pem)$|^perso/|(^|/)\.env' && echo "STOP : fichier sensible"
git diff --cached | grep -nE 'calendar\.google\.com/calendar/ical|private-[0-9a-f]{16,}|BEGIN [A-Z ]*PRIVATE KEY' && echo "STOP : secret"
```
   Un STOP → retirer le fichier ou la ligne, ne jamais committer.
4. Commit en français : `Étape 4 : écran Aujourd'hui, coches et gains`.
5. Push. Si la session travaille sur une branche, la Release ne part que depuis `main` → merger ou expliquer la fusion (section « Après le push » d'`appli-native`). Suivre le build jusqu'au ✅.
6. **Message final à Gauthier** (court, lisible sur téléphone) :
```
✅ Fait : <2-3 lignes, en mots de tous les jours>
📱 À tester sur ton téléphone (Obtainium → mettre à jour) :
- [ ] <action concrète 1>
- [ ] <action concrète 2>
🐞 Un souci ? Dis-moi : ce que tu as fait · ce que tu attendais · ce qui s'est passé · une capture.
➡️ Prochaine étape : <nom> (~40 min)
```

## 6. Modèle de `SUIVI.md`
```markdown
# Suivi — <Appli>

## Où on en est
- Version : 1.0.3 · Étape suivante : 5a · Dernière session : 2026-11-20

## Dernière session
- Fait : …
- Testé : … (comment)
- Non testé / à vérifier sur le téléphone : …

## Bugs connus
- [ ] …

## Retours de Gauthier à traiter
- [ ] …

## Décisions (ne pas reposer la question)
| Date | Décision | Pourquoi |
|---|---|---|

## Idées pour plus tard (hors étape)
- …

<sub>Créé par Gauthier Doumont</sub>
```
Garder le fichier sous ~150 lignes : résumer les vieilles sessions en une ligne.

## 7. Point de contrôle (ex. Hameau après l'étape 4)
Lui poser ces 5 questions, une réponse courte suffit :
1. Qu'est-ce qui t'a donné envie de rouvrir l'appli ?
2. Qu'est-ce qui t'a agacé ou ralenti ?
3. Une tâche que tu n'as pas pu ajouter comme tu voulais ?
4. Les gains te semblent trop faibles, bien, trop forts ?
5. Un moment où l'appli t'a fait culpabiliser ?
→ Transformer les réponses en cases dans « Retours de Gauthier », puis proposer max 3 ajustements avant de continuer la feuille de route.

*Skill créé par Gauthier Doumont*