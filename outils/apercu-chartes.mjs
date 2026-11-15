// Hameau — génère docs/apercu-chartes.png : les 4 chartes côte à côte sur un écran d'accueil factice
// Créé par Gauthier Doumont — skill charte-appli. Données FICTIVES.
// Lancer : node outils/apercu-chartes.mjs <dossier contenant @fontsource>
import { chromium } from 'playwright';
import fs from 'node:fs'; import path from 'node:path';

const racinePolices = path.join(process.argv[2] || 'node_modules', '@fontsource');
const police = (nom, graisse) => fs.readFileSync(path.join(racinePolices, nom, 'files', `${nom}-latin-${graisse}-normal.woff2`)).toString('base64');

const CHARTES = [
  { lettre: 'A', nom: 'Taverne', ambiance: 'Médiéval chaleureux, bois et or', fond: '#1B1714', surface: '#2A231E', surface2: '#362D26',
    texte: '#F3E9DC', doux: '#B8A994', accent: '#E8A33D', titre: 'Cinzel', fichier: 'cinzel', graisse: 700, style: 'taverne' },
  { lettre: 'B', nom: 'Clairière', ambiance: 'Nature calme, vert nuit', fond: '#121A16', surface: '#1C2621', surface2: '#25322B',
    texte: '#E6F0EA', doux: '#9DB3A7', accent: '#7BD389', titre: 'Fredoka', fichier: 'fredoka', graisse: 600, style: 'clairiere' },
  { lettre: 'C', nom: 'Arcade', ambiance: 'Jeu mobile coloré, boutons épais', fond: '#141428', surface: '#22223D', surface2: '#2C2C4D',
    texte: '#F2F2FF', doux: '#A9A9CC', accent: '#FFC233', titre: 'Baloo 2', fichier: 'baloo-2', graisse: 800, style: 'arcade' },
  { lettre: 'D', nom: 'Minimal nuit', ambiance: 'Sobre, outil pro', fond: '#0F1115', surface: '#181B22', surface2: '#21252E',
    texte: '#E8EAF0', doux: '#9AA1B2', accent: '#8B9CFF', titre: 'Inter', fichier: 'inter', graisse: 700, style: 'minimal' }
];
const FAMILLES = { esprit: '#5DA9E9', corps: '#E9765D', creation: '#B07CE8', social: '#F2C14E', discipline: '#6CC57C', pro: '#8FA3B8', repos: '#7FD6C2' };
const TACHES = [
  { nom: 'Lire 20 pages', emoji: '📖', fam: 'esprit', gain: '+25 📜', progres: 0.5, info: '10 / 20 pages' },
  { nom: 'Muscu — séance du jour', emoji: '🏋️', fam: 'corps', gain: '+25 🪨' },
  { nom: 'Ranger la chambre', emoji: '📦', fam: 'discipline', gain: '+12 🪵', fait: true },
  { nom: 'Envoyer le formulaire', emoji: '📄', fam: 'pro', gain: '+60 🪙', info: 'Pour vendredi' }
];

const colonne = (c) => `
<div class="col ${c.style}" style="--fond:${c.fond};--surface:${c.surface};--surface-2:${c.surface2};--texte:${c.texte};--doux:${c.doux};--accent:${c.accent};--titre:'${c.titre}'">
  <div class="etiquette"><b>${c.lettre} · ${c.nom}</b><span>${c.ambiance}</span></div>
  <div class="ecran">
    <h1>Aujourd'hui</h1>
    <div class="ressources">${['📜 135', '🪨 80', '💎 42', '🍞 64', '🪵 97', '🪙 120'].map(r => `<span>${r}</span>`).join('')}</div>
    <div class="xp"><div class="xp-ligne"><b>Niv. 4</b><span>encore 85 XP</span></div><div class="barre"><i style="width:68%"></i></div></div>
    <button class="bouton principal">⚡ Prochaine action</button>
    <h2>Quotidiennes</h2>
    ${TACHES.slice(0, 3).map(carte).join('')}
    <h2>Imprévus</h2>
    ${carte(TACHES[3])}
    <div class="fab">+</div>
    <nav>${[['☀️', "Aujourd'hui", 1], ['🏘️', 'Village'], ['🧙', 'Perso'], ['⚙️', 'Réglages']].map(([e, n, a]) => `<span class="${a ? 'actif' : ''}"><i>${e}</i>${n}</span>`).join('')}</nav>
  </div>
</div>`;
function carte(t) {
  return `<div class="tache ${t.fait ? 'fait' : ''}" style="--famille:${FAMILLES[t.fam]}">
    <span class="case">${t.fait ? '✓' : ''}</span>
    <span class="corps-tache"><span class="nom">${t.emoji} ${t.nom}</span>${t.info ? `<small>${t.info}</small>` : ''}
      ${t.progres ? `<span class="mini"><i style="width:${t.progres * 100}%"></i></span>` : ''}</span>
    <span class="gain">${t.gain}</span></div>`;
}

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
${CHARTES.map(c => `@font-face{font-family:'${c.titre}';src:url(data:font/woff2;base64,${police(c.fichier, c.graisse)}) format('woff2');font-weight:${c.graisse}}`).join('\n')}
body{margin:0;background:#0a0b10;font-family:system-ui,sans-serif;display:flex;gap:24px;padding:24px}
.col{width:412px;flex:none}
.etiquette{color:#fff;margin-bottom:12px;font-size:20px}.etiquette b{display:block;font-size:28px}.etiquette span{color:#aab}
.ecran{position:relative;height:880px;overflow:hidden;background:var(--fond);color:var(--texte);border-radius:28px;padding:20px 16px 0;box-sizing:border-box}
h1{font-family:var(--titre);font-weight:800;font-size:1.75rem;margin:4px 0 12px}
h2{font-family:var(--titre);font-size:1rem;color:var(--doux);margin:18px 2px 8px;font-weight:700}
.ressources{display:flex;gap:6px;flex-wrap:wrap}.ressources span{background:var(--surface);border-radius:999px;padding:4px 10px;font-weight:600;font-size:.9rem}
.xp{margin:12px 0}.xp-ligne{display:flex;justify-content:space-between;font-size:.9rem;margin-bottom:4px}.xp-ligne span{color:var(--doux)}
.barre{height:10px;background:var(--surface);border-radius:99px;overflow:hidden}.barre i{display:block;height:100%;background:var(--accent);border-radius:99px}
.bouton{width:100%;min-height:50px;border:0;font:inherit;font-weight:700;font-size:1.05rem;cursor:pointer}
.principal{background:var(--accent);color:var(--fond)}
.tache{display:flex;align-items:center;gap:12px;background:var(--surface);border-radius:14px;padding:10px 12px;margin-bottom:8px;border-left:5px solid var(--famille);min-height:56px;box-sizing:border-box}
.case{width:30px;height:30px;border-radius:9px;border:2px solid var(--doux);flex:none;display:grid;place-items:center;font-weight:900;color:var(--fond)}
.fait .case{background:var(--accent);border-color:var(--accent)}.fait .nom{opacity:.6;text-decoration:line-through}
.corps-tache{flex:1;min-width:0}.nom{display:block;font-weight:600}.tache small{color:var(--doux);font-size:.85rem}
.mini{display:block;height:5px;background:var(--surface-2);border-radius:9px;margin-top:6px}.mini i{display:block;height:100%;background:var(--famille);border-radius:9px}
.gain{font-weight:800;color:var(--accent);white-space:nowrap}
.fab{position:absolute;right:16px;bottom:84px;width:56px;height:56px;border-radius:50%;background:var(--accent);color:var(--fond);display:grid;place-items:center;font-size:2rem;font-weight:700}
nav{position:absolute;left:0;right:0;bottom:0;height:64px;background:var(--surface);display:grid;grid-template-columns:repeat(4,1fr)}
nav span{display:flex;flex-direction:column;align-items:center;justify-content:center;font-size:.75rem;color:var(--doux)}nav i{font-style:normal;font-size:1.3rem}
nav .actif{color:var(--accent);font-weight:700}
/* Particularités de chaque charte */
.taverne .bouton{border-radius:10px;box-shadow:inset 0 0 0 2px #f6cf86}.taverne .tache{border-radius:10px}.taverne h1{font-weight:700}
.clairiere .bouton,.clairiere .fab{border-radius:999px}.clairiere .tache{border-radius:18px}
.arcade .bouton{border-radius:16px;box-shadow:0 4px 0 #b3851a}.arcade .fab{box-shadow:0 4px 0 #b3851a}.arcade .tache{border-radius:16px;box-shadow:0 3px 0 rgba(0,0,0,.35)}
.arcade .case{border-radius:10px;border-width:3px}
.minimal .bouton{border-radius:8px}.minimal .tache{border-radius:8px}.minimal .fab{border-radius:16px}
</style></head><body>${CHARTES.map(colonne).join('')}</body></html>`;

const nav = await chromium.launch();
const page = await nav.newPage({ viewport: { width: 4 * 412 + 5 * 24, height: 1000 }, deviceScaleFactor: 2 });
await page.setContent(html);
await page.evaluate(() => document.fonts.ready);
fs.mkdirSync('docs', { recursive: true });
await page.screenshot({ path: 'docs/apercu-chartes.png', fullPage: true });
await nav.close();
console.log('docs/apercu-chartes.png écrit');
