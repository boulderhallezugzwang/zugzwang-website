// Uebernimmt apps-script/_gemeinsam/dienste-kern.js in beide Script-Projekte.
// Aufruf:  node tests/sync-dienste-kern.js          (schreibt)
//          node tests/sync-dienste-kern.js --check  (prueft nur, Exit 1 bei Abweichung)
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const kern = fs.readFileSync(path.join(root, 'apps-script/_gemeinsam/dienste-kern.js'), 'utf8').trim();
const ziele = ['apps-script/mitgliederliste/Mitgliederliste.gs', 'apps-script/hallendienst/Code.gs'];
const re = /\/\/ >>> DIENSTE-KERN[\s\S]*?\/\/ <<< DIENSTE-KERN/;
const check = process.argv.includes('--check');
let abweichung = false;
for (const z of ziele) {
  const p = path.join(root, z);
  let s = fs.readFileSync(p, 'utf8');
  const m = s.match(re);
  if (m && m[0] === kern) { console.log('gleich   ' + z); continue; }
  abweichung = true;
  if (check) { console.log('WEICHT AB ' + z); continue; }
  s = m ? s.replace(re, () => kern) : s.replace(/\s*$/, '\n\n' + kern + '\n');
  fs.writeFileSync(p, s);
  console.log('aktualisiert ' + z);
}
process.exit(check && abweichung ? 1 : 0);
