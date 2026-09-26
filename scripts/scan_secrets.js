// Pre-push check 1/3: runs the project's own secret catalog (the Secret_Scan node code from the published
// workflow, i.e. exactly what guards the generated apps) over every file of this repository.
// Usage: node scripts/scan_secrets.js   (exit code 1 on any finding)
const fs = require('fs');
const path = require('path');
const { nodeCode, runCodeNode, ROOT } = require('../tests/lib/harness');

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === '.git' || e.name === 'node_modules') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}

(async () => {
  const files = walk(ROOT).map(p => ({ name: path.relative(ROOT, p).replace(/\\/g, '/'), content: fs.readFileSync(p, 'utf8') }));
  const { out } = await runCodeNode(nodeCode('Secret_Scan'), { files });
  const hits = out.filter(i => !i.json.secret_scan.clean).map(i => `${i.json.file_name}: ${i.json.secret_scan.matches.join(', ')}`);
  console.log(`secret catalog: ${files.length} files scanned, ${hits.length} with findings`);
  for (const h of hits) console.log('  ' + h);
  process.exit(hits.length ? 1 : 0);
})();
