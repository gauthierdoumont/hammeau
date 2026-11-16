// tests/mises-a-jour.test.js — Hameau — vérifier les mises à jour (comparaison de versions) — Créé par Gauthier Doumont
const test = require('node:test');
const assert = require('node:assert/strict');
const MAJ = require('../www/mises-a-jour.js');

test('version tirée du tag de la Release (sans « v » ni « -build.N »)', () => {
  assert.equal(MAJ.versionDuTag('v1.0.0-build.12'), '1.0.0');
  assert.equal(MAJ.versionDuTag('v1.10.3'), '1.10.3');
  assert.equal(MAJ.versionDuTag('2.0.1'), '2.0.1');
  assert.equal(MAJ.versionDuTag('nightly'), null);
  assert.equal(MAJ.versionDuTag(undefined), null);
});

test('comparaison nombre par nombre (1.10.0 > 1.9.0)', () => {
  assert.equal(MAJ.comparer('1.10.0', '1.9.0'), 1);
  assert.equal(MAJ.comparer('1.0.0', '1.0.0'), 0);
  assert.equal(MAJ.comparer('0.9.9', '1.0.0'), -1);
});

test('réponse de GitHub → nouvelle version ou pas ; lien seulement vers github.com', () => {
  const rep = { tag_name: 'v1.0.1-build.30', html_url: 'https://github.com/gauthierdoumont/hammeau/releases/tag/v1.0.1-build.30' };
  assert.deepEqual(MAJ.analyser(rep, '1.0.0'), { nouvelle: true, version: '1.0.1', url: rep.html_url });
  assert.equal(MAJ.analyser(rep, '1.0.1').nouvelle, false);
  assert.equal(MAJ.analyser(rep, '1.1.0').nouvelle, false);           // version de test plus récente que la Release
  assert.equal(MAJ.analyser({ ...rep, html_url: 'https://exemple.invalid/piege' }, '1.0.0').url, null);
  assert.equal(MAJ.analyser({ message: 'Not Found' }, '1.0.0'), null);
  assert.equal(MAJ.analyser(null, '1.0.0'), null);
});
