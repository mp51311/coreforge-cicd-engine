// Runs every tests/*.test.js in its own Node process. No network, no n8n, no dependencies.
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const files = fs.readdirSync(__dirname).filter(f => f.endsWith('.test.js')).sort();
let failed = 0, pass = 0, total = 0;
for (const f of files) {
  const r = spawnSync(process.execPath, [path.join(__dirname, f)], { encoding: 'utf8' });
  process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
  const m = r.stdout.match(/(\d+)\/(\d+) passed/g) || [];
  for (const s of m) { const [a, b] = s.split(' ')[0].split('/').map(Number); pass += a; total += b; }
  if (r.status !== 0) failed++;
}
console.log(`\n${files.length} test files, ${pass}/${total} checks passed${failed ? `, ${failed} file(s) FAILED` : ''}`);
process.exit(failed ? 1 : 0);
