---
name: "charte-appli"
description: "Identité visuelle de ses applis natives : catalogue de 4 chartes mobiles en mode sombre (couleurs vérifiées, polices locales, composants), il choisit, puis tout l'écran suit. Dès le 1er écran."
---

# Charte d'appli — une identité visuelle choisie une fois, suivie partout

## Quand l'utiliser
- Dès la 1re étape qui dessine un vrai écran (Hameau : étape 3), puis à chaque nouvel écran ou composant.
- Toutes ses applis natives (chacune peut prendre une charte différente).
- Pas pour le village Phaser lui-même (pack graphique, surprise) ; oui pour l'interface DOM par-dessus.
- **Le CLAUDE.md du projet prime.**

Pourquoi : sans charte fixée, chaque session dessine « un peu différemment » et l'appli finit en patchwork. Même logique que ses chartes PowerPoint : je propose, il choisit, tout suit.

## 1. Choisir (une seule fois par appli)
1. Générer `docs/apercu-chartes.png` : les 4 chartes côte à côte sur le même écran d'accueil factice (Playwright, 412 px de large chacun). Données fictives.
2. Le pousser et lui dire : « Ouvre `docs/apercu-chartes.png` sur GitHub et réponds A, B, C ou D ».
3. Sans réponse : charte recommandée pour l'appli (Hameau → **C Arcade**, la plus proche de Clash of Clans ; sinon A).
4. Noter le choix dans `SUIVI.md` → Décisions. Ne plus jamais reposer la question.

## 2. Catalogue (mode sombre, contrastes vérifiés ≥ 4,5:1 sur `surface`)
| | A · Taverne | B · Clairière | C · Arcade | D · Minimal nuit |
|---|---|---|---|---|
| Ambiance | Médiéval chaleureux, bois et or | Nature calme, vert nuit | Jeu mobile coloré, boutons épais | Sobre, outil pro |
| `--fond` | #1B1714 | #121A16 | #141428 | #0F1115 |
| `--surface` | #2A231E | #1C2621 | #22223D | #181B22 |
| `--texte` | #F3E9DC | #E6F0EA | #F2F2FF | #E8EAF0 |
| `--texte-doux` | #B8A994 | #9DB3A7 | #A9A9CC | #9AA1B2 |
| `--accent` | #E8A33D | #7BD389 | #FFC233 | #8B9CFF |
| Titres | Cinzel 700 | Fredoka 600 | Baloo 2 800 | Inter 700 |
| Boutons | Arrondis 10 px, liseré or | Pilules | Épais : ombre basse 4 px pleine, s'enfoncent au toucher | Plats, rayon 8 px |

Texte sur `--accent` : utiliser `--fond` (lisible sur les 4).

**Couleurs des familles** (communes aux 4, lisibles sur toutes les surfaces) :
| 🧠 Esprit | 💪 Corps | 🛠️ Création | 🤝 Social | 🧹 Discipline | 💼 Pro & admin | 🌿 Repos |
|---|---|---|---|---|---|---|
| #5DA9E9 | #E9765D | #B07CE8 | #F2C14E | #6CC57C | #8FA3B8 | #7FD6C2 |

Jamais la couleur seule pour porter un sens : toujours l'emoji ou le nom à côté.
Vérifier toute nouvelle couleur :
```js
const lum = h => { const c = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255)
  .map(v => v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const contraste = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
// texte ≥ 4,5 · grands chiffres et icônes ≥ 3
```

## 3. Polices (locales, jamais Google Fonts)
- Titres et gros chiffres : la police de la charte. `npm i -D @fontsource/<police>` (cinzel, fredoka, baloo-2, inter — toutes OFL-1.1), copier `node_modules/@fontsource/<police>/files/<police>-latin-<graisse>-normal.woff2` dans `www/fonts/`, `@font-face` avec `font-display: swap`. Licence OFL dans `LICENCES.md`.
- Texte courant : `system-ui, sans-serif` (rapide, net, accents OK).
- Tailles en `rem` (suit le réglage de taille du téléphone) : 0,875 · 1 · 1,25 · 1,75. Rien sous 0,875 rem.
- Les emojis s'affichent avec le jeu d'emojis du téléphone (différent sur PC) : normal, ne pas les remplacer par des images.

## 4. Jetons CSS (seul endroit où vivent les couleurs)
```css
/* style.css — charte C Arcade — Créé par Gauthier Doumont */
:root {
  --fond: #141428; --surface: #22223D; --surface-2: #2C2C4D;
  --texte: #F2F2FF; --texte-doux: #A9A9CC; --accent: #FFC233;
  --esprit: #5DA9E9; --corps: #E9765D; --creation: #B07CE8; --social: #F2C14E;
  --discipline: #6CC57C; --pro: #8FA3B8; --repos: #7FD6C2;
  --rayon: 14px; --espace: 8px;         /* multiples : 4 · 8 · 12 · 16 · 24 · 32 */
  --toucher: 48px; --duree: 180ms; --police-titre: 'Baloo 2', system-ui, sans-serif;
}
```
Vérification avant commit : aucune couleur en dur hors `:root` (`grep -nE '#[0-9a-fA-F]{3,8}\b' www/*.css www/*.js` → seulement `:root`, `config.js` et `catalogue.js`).
Mode clair : facultatif, plus tard, via `[data-theme="clair"]` qui redéfinit les mêmes jetons.

## 5. Composants (à réutiliser, jamais redessiner)
| Composant | Règles |
|---|---|
| Barre d'onglets | En bas, 4 onglets max, icône + libellé, 56 px + `env(safe-area-inset-bottom)`, onglet actif en `--accent` |
| Bouton + flottant | 56 px, coin bas droit au-dessus de la barre, ouvre l'ajout express |
| Ajout express | Feuille qui monte du bas, champ auto-focus, `enterkeyhint="done"`, Entrée = Enregistrer, « Plus d'options » replié |
| Carte de tâche | Case à cocher 48 px à gauche · nom · emoji de catégorie · **gain prévu « +25 📜 » à droite** (voir la récompense donne envie) · liseré couleur de famille |
| Objectif chiffré | Barre fine + bouton « + » qui ouvre un pavé numérique |
| Ressources | Pastilles en haut (emoji + nombre), défilement horizontal si besoin |
| Barre d'XP | Sous les ressources, niveau à gauche, « encore N XP » à droite |
| Toast | En bas au-dessus de la barre, 3-5 s, bouton « Annuler » si l'action est réversible |
| Écran vide | Phrase encourageante + bouton d'action (« Ajoute ta 1re tâche »), jamais « Aucune donnée » |

Interactions :
- Tout état pressé visible (`:active { transform: scale(.97) }`, ou enfoncement pour C), transitions `var(--duree)`.
- Rien qui dépend du survol ou d'un appui long seul ; pas de geste caché sans bouton équivalent.
- Confirmation uniquement pour ce qui détruit (supprimer, importer).
- `prefers-reduced-motion` respecté.

## Check-list (à chaque écran)
- [ ] Seulement des jetons de la charte, aucune couleur en dur
- [ ] Zones tactiles ≥ 48 px, rien sous la barre d'état ni la barre de navigation
- [ ] Lisible à 360 px et avec une grande taille de police système
- [ ] Polices locales, licences dans `LICENCES.md`
- [ ] Capture regardée (skill `reprise-session`) : alignements, espacements réguliers

*Skill créé par Gauthier Doumont*