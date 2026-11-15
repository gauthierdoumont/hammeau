// Hameau — écrit la version de package.json dans www/version.js — Créé par Gauthier Doumont
const fs = require('fs');
const path = require('path');
const v = require('../package.json').version;
fs.writeFileSync(path.join(__dirname, '..', 'www', 'version.js'),
  `// Généré par scripts/version.js — Créé par Gauthier Doumont\nwindow.APP_VERSION = "${v}";\n`);
console.log('www/version.js →', v);
