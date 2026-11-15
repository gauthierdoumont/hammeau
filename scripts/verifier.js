// Hameau — vérifications rapides avant chaque commit (npm test) — Créé par Gauthier Doumont
// Pourquoi : attraper tout de suite une erreur de syntaxe ou un réglage qui casserait l'appli native.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const racine = path.join(__dirname, '..');
let erreurs = 0;
const ko = (msg) => { console.error('✗ ' + msg); erreurs++; };
const ok = (msg) => console.log('✓ ' + msg);

// 1. Syntaxe de chaque fichier .js (www, scripts, tests)
function fichiersJs(dossier) {
  if (!fs.existsSync(dossier)) return [];
  return fs.readdirSync(dossier, { withFileTypes: true }).flatMap((f) => {
    const p = path.join(dossier, f.name);
    if (f.isDirectory()) return f.name === 'lib' ? [] : fichiersJs(p);
    return f.name.endsWith('.js') ? [p] : [];
  });
}
for (const f of ['www', 'scripts', 'tests'].flatMap((d) => fichiersJs(path.join(racine, d)))) {
  try { execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' }); }
  catch (e) { ko(`syntaxe : ${path.relative(racine, f)}\n${e.stderr}`); }
}
ok('syntaxe des fichiers .js');

// 2. Configuration Capacitor : appId figé, jamais de site distant
const cfg = JSON.parse(fs.readFileSync(path.join(racine, 'capacitor.config.json'), 'utf8'));
if (cfg.appId !== 'be.gauthierdoumont.hameau') ko('appId modifié : ' + cfg.appId);
if (cfg.server?.url) ko('server.url interdit (l\'appli redeviendrait une page web)');
ok('capacitor.config.json');

// 3. Aucune ressource en ligne dans www/ (l'appli doit marcher hors ligne)
const enLigne = /(src|href)\s*=\s*["']https?:|@import\s+url\(\s*["']?https?:|url\(\s*["']?https?:/i;
for (const f of fs.readdirSync(path.join(racine, 'www'))) {
  if (!/\.(html|css)$/.test(f)) continue;
  if (enLigne.test(fs.readFileSync(path.join(racine, 'www', f), 'utf8'))) ko(`ressource en ligne dans www/${f}`);
}
ok('aucune ressource en ligne');

// 4. Aucun fichier de clé dans le dépôt
const suivis = execFileSync('git', ['ls-files'], { cwd: racine, encoding: 'utf8' }).split('\n');
const sensibles = suivis.filter((f) => /\.(keystore|jks|b64|pem)$|^perso\/|(^|\/)\.env/.test(f));
if (sensibles.length) ko('fichiers sensibles suivis par git : ' + sensibles.join(', '));
ok('aucun fichier de clé suivi');

if (erreurs) { console.error(`\n${erreurs} problème(s)`); process.exit(1); }
console.log('\nTout est bon.');
