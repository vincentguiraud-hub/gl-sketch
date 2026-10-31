// Lance toutes les séries de tests de G&L Sketch (npm test). Code de sortie 1 en cas d'échec.
const { execFileSync } = require('child_process'); const path = require('path');
let failed = 0;
for (const f of ['run1.cjs', 'run2.cjs', 'run3.cjs']) {
  console.log('\n=== ' + f + ' ===');
  try { execFileSync(process.execPath, [path.join(__dirname, f)], { stdio: 'inherit', timeout: 240000 }); }
  catch (e) { failed++; console.log('>>> ÉCHEC dans ' + f); }
}
console.log(failed ? `\n❌ ${failed} série(s) en échec` : '\n✅ Tous les tests passent');
process.exit(failed ? 1 : 0);
