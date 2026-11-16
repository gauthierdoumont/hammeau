---
name: "donnees-sures"
description: "Ne jamais perdre les données de ses applis : chargement robuste, migrations de schéma, sauvegardes auto, import/export validés et tests. Dès qu'on stocke, change la structure ou importe."
---

# Données sûres — ne jamais perdre une série ou un village

## Quand l'utiliser
- Hameau : étape 2 (mise en place), puis à CHAQUE changement de structure (V2 village, V3 calendrier…), et pour tout import ou export.
- Toutes ses applis natives. Complète le module de stockage d'`appli-native` (on garde sa clé, `restaurer`, `sauver`, `exporter`).
- **Le CLAUDE.md du projet prime.**

Pourquoi : sur le téléphone, les données n'existent qu'en un seul exemplaire. Perdre 3 mois de progression tue la motivation, c'est pire qu'un bug d'affichage.

## 1. Le piège n°1 : l'état vide qui écrase tout
Si le JSON est illisible, `charger()` renvoie `null` → l'appli crée un état neuf → `sauver()` écrase les vraies données (et la copie native). Il faut distinguer « rien » de « illisible » :
```js
async function demarrer() {
  await restaurer();
  const brut = localStorage.getItem(CLE);
  let etat;
  if (brut === null) etat = etatInitial();                       // vraie 1re utilisation
  else {
    try { etat = JSON.parse(brut); }
    catch (e) { return ecranRecuperation(brut); }                // JAMAIS d'état vide par-dessus
  }
  if ((etat.schemaVersion ?? 1) > SCHEMA) return ecranVersionTropRecente();
  if ((etat.schemaVersion ?? 1) < SCHEMA) { await sauvegardeAuto(brut, 'avant-v' + SCHEMA); etat = migrer(etat); }
  etat = completer(etat);
  verifier(etat);
  sauver(etat);
  // … rendu
}
```
Écran de récupération : essayer la copie native (Preferences) si elle diffère et se lit ; proposer « Envoyer le texte brut » (partage, pour analyse) et « Importer un export ». Rien n'est effacé tant que Gauthier n'a pas choisi.

## 2. Une seule porte d'écriture
```js
function modifier(action) {
  const copie = structuredClone(etat);
  action(copie);              // une exception ici → rien n'est sauvé
  verifier(copie);            // lève une erreur si l'état est incohérent
  etat = copie; sauver(etat); rendre();
}
```
`verifier` : `schemaVersion` présent · aucun `NaN` ni `Infinity` dans les nombres (parcours récursif : `JSON.stringify` les transforme en `null` → corruption silencieuse) · ressources ≥ 0 · niveau ≥ 1 · ids uniques.
En cas d'erreur : message neutre (« Action annulée, rien n'a été perdu ») + détail dans la console.
Ids : `crypto.randomUUID?.() ?? Date.now().toString(36) + Math.random().toString(36).slice(2)`.

## 3. Faire évoluer la structure
| Changement | Que faire |
|---|---|
| Nouveau champ facultatif avec valeur par défaut | `completer()` suffit, pas de nouvelle version |
| Champ renommé, déplacé, sens changé, nouvelle section (ex. `village`) | `SCHEMA + 1` + migration |
| Supprimer un champ | Le laisser une version de plus, puis migration qui le retire |

```js
const SCHEMA = 2;
const MIGRATIONS = {
  2: e => { e.village ??= { batiments: [], extensions: 0, decorations: [] }; return e; },
};
function migrer(e) {
  let v = e.schemaVersion ?? 1;
  while (v < SCHEMA) { e = MIGRATIONS[v + 1](structuredClone(e)); e.schemaVersion = ++v; }
  return e;
}
function completer(e) {        // remplit seulement ce qui manque, ne remplace jamais
  return fusionProfonde(etatInitial(), e);
}
```
- Migrations pures, dans `www/stockage.js` (export double navigateur + node, comme `moteur.js`), jamais modifiées une fois publiées.
- Garder les champs inconnus (un export plus récent ne perd rien).

## 4. Sauvegardes automatiques (filet contre les bugs)
- Avant chaque migration et avant chaque import : copie du texte brut.
- Une fois par semaine : copie tournante (garder les 4 dernières).
```js
async function sauvegardeAuto(brut, nom) {
  if (PL.Filesystem) await PL.Filesystem.writeFile({ path: `sauvegardes/${nom}.json`, data: brut,
    directory: 'DATA', encoding: 'utf8', recursive: true });
  else try { localStorage.setItem(`${CLE}_${nom}`, brut); } catch {}
}
```
- Réglages → « Sauvegardes automatiques » : liste avec date + « Restaurer » (confirmation).
- À lui dire clairement : ces copies protègent contre un bug, PAS contre une désinstallation ou un téléphone perdu. Pour ça, il y a l'export.

## 5. Export et import
**Export** :
```js
function pourExport(etat) {
  const { icsUrl, ...reglages } = etat.reglages ?? {};          // JAMAIS l'adresse iCal
  return { ...etat, reglages, meta: { appli: CLE, appVersion: window.APP_VERSION, exporteLe: new Date().toISOString() } };
}
```
Puis `reglages.dernierExport = maintenant`. Rappel après 14 jours, ton positif (« Petite sauvegarde de ton village ? »), un tap pour exporter, jamais insistant.

**Import** :
1. Lire le fichier → JSON valide ? `meta.appli` ou clés attendues présentes ? Sinon : « Ce fichier ne vient pas de Hameau ».
2. `schemaVersion` plus récent que l'appli → refuser (« Mets d'abord l'appli à jour »).
3. **Aperçu** avant de remplacer : « Export du 12/11 · niveau 7 · 340 tâches · village 5 bâtiments » vs l'état actuel.
4. Confirmation → sauvegarde auto de l'état actuel → `migrer` → `completer` → `verifier` → garder l'`icsUrl` déjà saisie sur l'appareil → sauver.

## 6. Taille
- Afficher la taille des données dans À propos (`brut.length`, en Ko).
- localStorage tient quelques Mo. Au-delà de 2 Mo, proposer à Gauthier (pas avant, pas sans son accord) de résumer le journal de plus de 12 mois en totaux par jour. Les stats reposent sur `gagneTotal`, donc rien ne bouge.

## 7. Tests obligatoires (`tests/donnees.test.js`)
- [ ] Chaque migration : fixture v1 → dernière version, aucune donnée perdue (tâches, journal, ressources identiques)
- [ ] `migrer` sur un état déjà à jour = inchangé
- [ ] JSON illisible → aucune écriture (simuler localStorage avec un objet)
- [ ] `verifier` rejette `NaN`, ressource négative, id en double
- [ ] Export sans `icsUrl` ; export → import = même état (hors `meta`)
- [ ] Import d'une version plus récente refusé ; import d'un fichier étranger refusé
- [ ] Champ inconnu conservé après chargement
Fixtures dans `tests/fixtures/` : **fictives uniquement** (dépôt public), une par version de schéma, jamais modifiées ensuite.

## 8. Release avec changement de structure
- [ ] Migration + tests verts
- [ ] CHANGELOG : « Nouvelle structure de données (v2), sauvegarde automatique avant mise à jour »
- [ ] Message à Gauthier : « Avant d'installer : Réglages → Exporter (par sécurité). »
- [ ] Après installation : il vérifie niveau, série et ressources, puis le confirme

*Skill créé par Gauthier Doumont*

<sub>Créé par Gauthier Doumont</sub>
