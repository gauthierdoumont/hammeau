---
name: "village-phaser-iso"
description: "Scène isométrique Phaser 3 dans une appli Capacitor : grille, profondeur, caméra, zoom au doigt, construction, animations, assets libres et licences. Pour tout village, carte ou jeu 2D animé."
---

# Village isométrique avec Phaser 3 (appli Capacitor)

## Quand l'utiliser
- Hameau : étapes 9 à 13. Tout autre jeu 2D animé dans une de ses applis natives.
- **Le CLAUDE.md du projet prime** (règle de la surprise, coûts, bonus).
- Phaser 3 : `npm i -D phaser@3`, copier `node_modules/phaser/dist/phaser.min.js` dans `www/lib/`. Jamais de CDN. Pas de Phaser 4 sans accord (API différente).

## 1. Règle d'or : la scène n'est qu'une vue
- L'état du village vit dans l'état de l'appli (`village` dans `hameau_v1`), en **coordonnées de grille**, jamais en pixels.
- Construire / améliorer / réparer = fonctions du moteur (coûts lus dans `config.js`) → sauvegarde → la scène se redessine (`scene.events.emit('etat-change')`).
- Pourquoi : la logique reste testable dans node, et changer de pack graphique ne touche pas aux données.
- Interface (ressources, boutons Construire / Améliorer) en **DOM** par-dessus le canvas, avec le style du reste de l'appli. Phaser ne dessine que le monde.

## 2. Intégration dans l'appli à onglets
- Charger `phaser.min.js` seulement à la 1re ouverture de l'onglet Village (balise `<script>` injectée) → l'appli démarre vite, l'écran Aujourd'hui reste instantané.
- Créer le jeu une seule fois, quand le conteneur est visible (un conteneur en `display:none` fait 0 px).
```js
jeu = new Phaser.Game({
  type: Phaser.AUTO, parent: 'village', backgroundColor: '#1d2b1f', banner: false,
  scale: { mode: Phaser.Scale.RESIZE, width: '100%', height: '100%' },
  render: { antialias: true, pixelArt: false },   // pixelArt: true si le pack est en pixel art (zoom entier alors)
  scene: [Chargement, Village],
});
```
- Quitter l'onglet → `jeu.loop.sleep()` ; revenir → `jeu.loop.wake()` puis `jeu.scale.refresh()`. Même chose quand l'appli passe en arrière-plan (`PL.App.addListener('appStateChange', ({ isActive }) => …)`). Pourquoi : batterie.
- Netteté : vérifier sur le Honor. Si c'est flou, tester un rendu à la taille × `min(devicePixelRatio, 2)` réduit en CSS, et mesurer les fps avant de garder.
- Ne JAMAIS activer CapacitorHttp globalement (casserait le chargeur de Phaser).

## 3. Isométrie
Taille de tuile donnée par le pack (souvent 2:1, ex. 128 × 64).
```js
const TW = 128, TH = 64;                               // depuis le catalogue du pack
const versEcran = (gx, gy) => ({ x: (gx - gy) * TW / 2, y: (gx + gy) * TH / 2 });
const versGrille = (x, y) => ({
  gx: Math.floor((x / (TW / 2) + y / (TH / 2)) / 2),
  gy: Math.floor((y / (TH / 2) - x / (TW / 2)) / 2),
});
```
(clic sur l'écran : convertir d'abord avec `pointer.worldX / worldY`, qui tiennent compte de la caméra.)
- **Profondeur** : `sprite.setDepth(yEcranDuCoinAvantBas)` pour bâtiments, décors et villageois (villageois : mis à jour dans `update`). Bâtiment de plusieurs cases : prendre le coin avant de son empreinte.
- **Ancrage** : `setOrigin(0.5, 1)` en bas au centre de l'empreinte + décalage par sprite.
- Les réglages par sprite vont dans un catalogue de données, pas dans le code :
```js
// www/assets/village/catalogue.js — Créé par Gauthier Doumont
window.CATALOGUE = {
  tuile: { largeur: 128, hauteur: 64 },
  bibliotheque: { empreinte: [2, 2], images: ['bib_1.png', 'bib_2.png'], decalageY: 12 },
  // …
};
```
- Sol : dessiné une seule fois dans une RenderTexture (1 seul dessin par image au lieu de centaines de tuiles).

## 4. Caméra et gestes
- Un doigt = déplacer ; tap (mouvement < 10 px) = sélectionner ; deux doigts = zoom ; molette = zoom (test PC).
```js
this.input.addPointer(1);                              // 2 doigts
const cam = this.cameras.main;
this.input.on('pointermove', p => {
  const a = this.input.pointer1, b = this.input.pointer2;
  if (a.isDown && b.isDown) {
    const d = Phaser.Math.Distance.Between(a.x, a.y, b.x, b.y);
    if (this.distPrec) cam.setZoom(Phaser.Math.Clamp(cam.zoom * d / this.distPrec, ZOOM_MIN, ZOOM_MAX));
    this.distPrec = d; this.pincement = true; return;
  }
  if (p.isDown && !this.pincement) {
    cam.scrollX -= (p.x - p.prevPosition.x) / cam.zoom;
    cam.scrollY -= (p.y - p.prevPosition.y) / cam.zoom;
  }
});
this.input.on('pointerup', () => {
  if (!this.input.pointer1.isDown && !this.input.pointer2.isDown) { this.distPrec = 0; this.pincement = false; }
});
```
- `cam.setBounds(...)` sur l'étendue de la carte + marge ; ZOOM_MIN / ZOOM_MAX dans `config.js`.
- Le pincement reste bloqué jusqu'à ce que les deux doigts soient levés (sinon la carte « saute »).

## 5. Mode construction
- Fantôme semi-transparent qui suit le doigt, cases teintées vert / rouge (`setTint`), validation par un bouton DOM « Placer ici » (plus fiable qu'un lâcher au doigt).
- Occupation : `Set` de `"gx,gy"` reconstruit depuis l'état à chaque redessin.
- Coût affiché AVANT de valider, ressource manquante en couleur + « il manque 40 🪵 ». Jamais de bouton grisé sans explication.

## 6. Assets libres
**Critères** : UN pack cohérent · isométrique · bâtiments pour les 8 types (idéalement plusieurs niveaux) · villageois animés · sol et décors · PNG transparents.
**Licence** : le dépôt est public, donc les fichiers sont redistribués → CC0 (idéal) ou CC-BY (crédits). Refuser « usage personnel uniquement » et « pas de redistribution ». « Gratuit » ≠ libre : lire le fichier de licence DANS l'archive.
**Où chercher** : OpenGameArt (filtre licence), itch.io (gratuits, puis lire la licence), créateurs connus pour publier en CC0.

**Surprise (CLAUDE.md §9)** : dans le chat et le plan, annoncer seulement « licence X, gratuit ». Aucun nom, image, capture ou lien de pack montré avant le 1er lancement du village. Messages de commit génériques (« Ajout du pack graphique »). Les noms n'apparaissent que dans `LICENCES.md` et l'écran Crédits, livrés à l'étape où le village se lance.
Si le téléchargement est bloqué : donner le lien en demandant de déposer le .zip dans `assets/brut/` sans l'ouvrir. Après extraction, ne garder que les fichiers utilisés dans `www/assets/village/` et retirer le zip du dépôt.

**Préparation** : `sharp` (devDependency) pour redimensionner à 2× la taille affichée au maximum, images ≤ 2048 px, total visé < 15 Mo. Plus de ~40 images → atlas ; sinon PNG séparés.
**Jamais de mélange de styles** : s'il manque un bâtiment, le composer avec des éléments du même pack.
**Niveaux absents du pack** : badge de niveau, drapeau, socle, halo au niveau 5, échelle `1 + 0,04 × (niveau − 1)`.
`LICENCES.md` : tableau dossier / auteur / licence / lien source / modifications.

## 7. Animations (étape 12) — c'est ça qui fait « jeu pro »
- **Pose** : `this.tweens.add({ targets: s, scaleY: { from: 0.6, to: 1 }, scaleX: { from: 1.2, to: 1 }, ease: 'Back.easeOut', duration: 350 })` + poussière + son.
- **Chantier** : échafaudage ~1,2 s puis révélation. Animation seulement : jamais d'attente réelle (récompense immédiate).
- **Fumée** (API particules Phaser ≥ 3.60) : `this.add.particles(x, y, 'fumee', { speedY: { min: -20, max: -10 }, lifespan: 2000, alpha: { start: 0.6, end: 0 }, scale: { start: 0.3, end: 1 }, frequency: 400 })`. Texture « fumee » générée (cercle doux via `make.graphics` + `generateTexture`) si le pack n'en a pas.
- **Villageois** : 1 par bâtiment, case libre voisine en case libre (tween 600-900 ms par case, pause 1-4 s), `flipX` selon la direction. Moral < 40 : plus lents + petite icône triste.
- **Endommagé** : teinte grise + fumée sombre + ⚠️. Réparation : flash blanc + étincelles + son.
- **Retour au village** : petite animation sur les bâtiments dont la famille a gagné des ressources depuis la dernière visite (lien visible vraie vie → village).
- `prefers-reduced-motion` : garder les poses, couper particules et balades.

## 8. Performance
- Objectif 60 fps, minimum 30 sur le Honor ; afficher `jeu.loop.actualFps` en mode développement.
- < 100 particules vivantes ; émetteurs seulement sur les bâtiments visibles.
- Aucune création d'objet dans `update` ; jeu endormi hors de l'onglet.

## 9. Tests
- Node : aller-retour `versGrille(versEcran(gx, gy))` = (gx, gy) ; règles d'occupation ; coûts et bonus.
- Navigateur (Playwright si dispo) : viewport 412 × 915, console sans erreur, glisser à la souris, capture d'écran pour Claude seulement (pas montrée à Gauthier avant le 1er lancement).
- Sur le téléphone, à faire vérifier par Gauthier : fluidité, zoom à deux doigts, tap précis sur un petit bâtiment, sons, batterie après 10 min.

## Check-list
- [ ] État en coordonnées de grille dans `hameau_v1`, scène = vue
- [ ] Phaser chargé à la demande, endormi hors de l'onglet et en arrière-plan
- [ ] Glisser, pincer, tap OK sur téléphone ; caméra bornée
- [ ] Un seul pack, licence compatible dépôt public, `LICENCES.md` + Crédits à jour
- [ ] Surprise respectée jusqu'au 1er lancement
- [ ] Animations désactivables (reduced-motion), ≥ 30 fps

*Skill créé par Gauthier Doumont*