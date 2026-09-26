// EXAMPLE (live patch: backup -> preconditions -> dry run -> PUT only with --apply -> GET verification) from the CoreForge project, published for reading. Comments are in German (project language).
// Paths were adapted to this repository; instance-specific values come from environment variables.
// Punkt G, Schritt 1 – Live-Patch: neuer Node Mock_Scan (Sync_GitHub_Gate → Mock_Scan → Legal_Scan → Sync_Legal_Gate)
// + Format_Final_Response (abgesicherter Mock-Hinweis). Werte byte-gleich zu den offline (test_mock_scan_patch_offline.js)
// und isoliert (test_mock_scan_isolated.js) geprüften (testdata/mock_scan_patched_fields.json).
// Aufruf: node mock_scan_live_patch.js [--apply]   (ohne --apply nur Vorbedingungsprüfung / Trockenlauf)
const fs = require('fs');
const path = require('path');
const P = require('./mock_scan_patch.js');
// Credentials come from the environment (N8N_BASE_URL, N8N_API_KEY); never from files in the repo.
const env = { N8N_BASE_URL: process.env.N8N_BASE_URL, N8N_API_KEY: process.env.N8N_API_KEY };
if (!env.N8N_BASE_URL || !env.N8N_API_KEY) { console.error('set N8N_BASE_URL and N8N_API_KEY'); process.exit(1); }
const H = { 'X-N8N-API-KEY': env.N8N_API_KEY, 'Content-Type': 'application/json' };
const URL = `${env.N8N_BASE_URL}/api/v1/workflows/${process.env.WORKFLOW_ID}`;
const BACKUP = path.join(__dirname, 'backups', 'live_workflow_2026-09-26_vor_mock_scan.json');
const EXPECTED_UPDATED_AT = process.env.EXPECTED_UPDATED_AT; // Stand, gegen den der Patch geprüft wurde
function fail(msg) { console.error('ABBRUCH: ' + msg); process.exit(1); }
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

(async () => {
  const live = await (await fetch(URL, { headers: H })).json();
  if (live.updatedAt !== EXPECTED_UPDATED_AT) fail(`Live-Stand ${live.updatedAt} != erwartet ${EXPECTED_UPDATED_AT}`);
  if (live.nodes.length !== 56) fail(`Node-Anzahl ${live.nodes.length} != 56`);
  if (live.active !== true) fail('Workflow nicht aktiv');
  const pw = P.applyPatch(live); // wirft bei unerwartetem Ausgangszustand
  const mock = pw.nodes.find(n => n.name === 'Mock_Scan');
  const ffr = pw.nodes.find(n => n.name === 'Format_Final_Response');
  new AsyncFunction('$', '$input', mock.parameters.jsCode);
  new AsyncFunction('$', '$json', ffr.parameters.jsCode);
  const ref = JSON.parse(fs.readFileSync(path.join(__dirname, 'reference', 'mock_scan_patched_fields.json'), 'utf8'));
  if (mock.parameters.jsCode !== ref.mock_scan_code) fail('Mock_Scan-Code != getesteter Referenzwert');
  if (ffr.parameters.jsCode !== ref.format_final_response) fail('Format_Final_Response != getesteter Referenzwert');
  const iso = JSON.parse(fs.readFileSync(path.join(__dirname, 'reference', 'test_mock_scan_isolated_workflow_A.json'), 'utf8'));
  if (iso.nodes.find(n => n.name === 'Mock_Scan').parameters.jsCode !== mock.parameters.jsCode) fail('Mock_Scan-Code != Code im isolierten Test');
  if (iso.nodes.find(n => n.name === 'Format_Final_Response').parameters.jsCode !== ffr.parameters.jsCode) fail('Format_Final_Response != Code im isolierten Test');
  console.log(`Vorbedingungen OK (Live-Stand ${live.updatedAt}, 56 Nodes, aktiv, Ausgangszustand exakt, Syntax, Werte == offline und isoliert getestet)`);
  console.log(`  neu: Mock_Scan (${mock.parameters.jsCode.length} Zeichen, Position ${JSON.stringify(mock.position)})`);
  console.log(`  Format_Final_Response: ${live.nodes.find(n => n.name === 'Format_Final_Response').parameters.jsCode.length} -> ${ffr.parameters.jsCode.length} Zeichen`);
  console.log(`  Sync_GitHub_Gate → ${pw.connections.Sync_GitHub_Gate.main[0].map(c => c.node).join(', ')}; Mock_Scan → Legal_Scan; Legal_Scan → Sync_Legal_Gate[1] (unverändert)`);
  if (!process.argv.includes('--apply')) { console.log('Trockenlauf – nichts geschrieben.'); return; }

  fs.writeFileSync(BACKUP, JSON.stringify(live));
  console.log('Backup:', BACKUP);
  const res = await fetch(URL, { method: 'PUT', headers: H, body: JSON.stringify({ name: live.name, nodes: pw.nodes, connections: pw.connections, settings: live.settings }) });
  const txt = await res.text();
  if (!res.ok) fail(`PUT HTTP ${res.status}: ${txt.slice(0, 500)}`);
  console.log('PUT OK', JSON.parse(txt).updatedAt);
  const after = await (await fetch(URL, { headers: H })).json();
  const diffs = [];
  if (after.active !== true) diffs.push('active');
  if (after.nodes.length !== 57) diffs.push('Node-Anzahl ' + after.nodes.length);
  if (JSON.stringify(after.settings) !== JSON.stringify(live.settings)) diffs.push('Settings');
  for (const b of live.nodes) {
    const a = after.nodes.find(x => x.name === b.name);
    if (!a) { diffs.push('fehlt: ' + b.name); continue; }
    const expected = pw.nodes.find(x => x.name === b.name);
    for (const k of new Set([...Object.keys(a), ...Object.keys(expected)])) if (JSON.stringify(a[k]) !== JSON.stringify(expected[k])) diffs.push(`${b.name}.${k}`);
  }
  const am = after.nodes.find(x => x.name === 'Mock_Scan');
  if (!am) diffs.push('Mock_Scan fehlt');
  else for (const k of ['name', 'type', 'typeVersion', 'position', 'parameters']) if (JSON.stringify(am[k]) !== JSON.stringify(mock[k])) diffs.push('Mock_Scan.' + k);
  const keys = new Set([...Object.keys(after.connections), ...Object.keys(pw.connections)]);
  for (const k of keys) if (JSON.stringify(after.connections[k]) !== JSON.stringify(pw.connections[k])) diffs.push('Connection ' + k);
  if (diffs.length) fail('Abweichungen nach PUT: ' + diffs.join(', '));
  console.log('Verifikation OK: 57 Nodes, nur Format_Final_Response geändert + Mock_Scan neu (byte-gleich), Connections exakt wie geplant, Legal_Scan unverändert, active=true.');
})();
