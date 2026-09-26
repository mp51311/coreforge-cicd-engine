// EXAMPLE (patch module: new Code node generated from src/mock_scan.js, rewiring, guarded response change) from the CoreForge project, published for reading. Comments are in German (project language).
// Paths were adapted to this repository; instance-specific values come from environment variables.
// Punkt G, Schritt 1 (Marcs Freigabe 26.09., Variante A, Verdrahtung Option 1):
//   Sync_GitHub_Gate → Mock_Scan → Legal_Scan → Sync_Legal_Gate (statt Sync_GitHub_Gate → Legal_Scan)
//  - Mock_Scan (neuer Code-Node): liest die deployte index.html per getBinaryDataBuffer, scannt mit mock_scan.js,
//    reicht ALLE Eingangs-Items unverändert weiter (json + binary), das Ergebnis steht als Feld mock_scan am ersten Item.
//    Jeder eigene Fehler wird abgefangen und als sichtbarer Hinweis ausgegeben (fail-loud), die Items gehen trotzdem weiter.
//  - Legal_Scan: unverändert (Code, Position, Einstellungen), bekommt dieselben Items wie bisher.
//  - Format_Final_Response: hängt mock_scan.message an, abgesichert (fehlt Node/Feld -> kein Hinweis, kein Fehler).
// Reine Transformationen mit harten Vorbedingungen.
const fs = require('fs');
const path = require('path');

// Node-Code aus dem Modul: Funktionsdefinitionen (ohne module.exports) + Wrapper
function moduleBody() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'mock_scan.js'), 'utf8');
  const i = src.lastIndexOf('module.exports');
  if (i === -1) throw new Error('mock_scan.js: module.exports fehlt');
  return src.slice(0, i).trimEnd() + '\n';
}
const WRAPPER = String.raw`
// ---- n8n-Wrapper (Punkt G) ----
// Informativ, blockiert nie: Alle Eingangs-Items gehen unverändert an Legal_Scan weiter, auch wenn der Scan scheitert.
// Inhalt nur per helpers.getBinaryDataBuffer lesen (Dateisystem-Modus: .data enthält nur den Marker "filesystem-v2").
const items = $input.all();
// Fehlertext robust bilden: in der n8n-Laufzeit kommt nicht jeder Fehler als Error mit Text-message an (isolierter Test 26.09.)
function errText(e) {
  if (e === null || e === undefined) return 'unbekannter Fehler';
  if (typeof e === 'string') return e;
  const m = e.message;
  if (typeof m === 'string' && m) return m;
  if (m && typeof m === 'object') { try { return JSON.stringify(m).slice(0, 200); } catch (x) { /* weiter */ } }
  // n8n-Laufzeit bei fehlender Binärdatei: { level, shouldReport, tags, extra: { filePath } } ohne message (isoliert belegt 26.09.)
  if (e.extra && typeof e.extra.filePath === 'string') return 'Binärdatei nicht gefunden (' + e.extra.filePath + ')';
  for (const k of ['description', 'reason', 'code', 'name']) if (typeof e[k] === 'string' && e[k]) return e[k];
  try { const j = JSON.stringify(e); if (j && j !== '{}') return j.slice(0, 200); } catch (x) { /* weiter */ }
  const s = String(e);
  return s === '[object Object]' ? 'Fehlerobjekt ohne Text' : s;
}
let mock_scan;
try {
  let consumes = [];
  try {
    const raw = $('Format_Dev_Payload').first().json.raw_spec || {};
    consumes = (raw.ui_ux_spec && Array.isArray(raw.ui_ux_spec.consumes_routes)) ? raw.ui_ux_spec.consumes_routes : [];
  } catch (e) { consumes = []; }
  const idx = items.findIndex(it => it && it.json && it.json.file_name === 'index.html');
  if (idx === -1) throw new Error('index.html nicht unter den Dateien');
  if (!items[idx].binary || !items[idx].binary.data) throw new Error('index.html ohne Binärdaten');
  const html = (await this.helpers.getBinaryDataBuffer(idx, 'data')).toString('utf-8');
  if (!/</.test(html) || html.trim() === 'filesystem-v2') throw new Error('Inhalt nicht lesbar (' + html.length + ' Bytes)');
  const r = scanHtml(html, consumes);
  mock_scan = {
    mock_status: r.flagged ? 'flagged' : 'clean',
    message: formatMessage(r),
    findings: r.findings.map(f => ({ kind: f.kind, mode: f.mode || null, routes: f.routes || null, evidence: String(f.evidence || '').slice(0, 300) })),
    wrappers: r.wrappers, checked_routes: r.checked_routes, bytes_read: html.length,
  };
} catch (e) {
  const text = errText(e);
  let keys = [];
  try { keys = e && typeof e === 'object' ? Object.keys(e).slice(0, 10) : []; } catch (x) { keys = []; }
  mock_scan = {
    mock_status: 'scan_failed', findings: [], error: text,
    error_type: Object.prototype.toString.call(e), error_keys: keys,
    message: '⚠️ **Frontend-Hinweis:** Der Mock-Scan konnte index.html nicht prüfen (' + text + ') – Ergebnis unbekannt.',
  };
}
if (items.length === 0) return items;
return items.map((it, i) => (i === 0 ? Object.assign({}, it, { json: Object.assign({}, it.json, { mock_scan }) }) : it));
`;
const MOCK_SCAN_CODE = moduleBody() + WRAPPER;

const OLD_FFR_LEGAL = "const legalOutcome = $('Legal_Scan').first().json;\n";
const NEW_FFR_LEGAL = "const legalOutcome = $('Legal_Scan').first().json;\n" +
  "// Punkt G (26.09.): Mock-Scan-Hinweis, abgesichert – fehlt Node/Item/Feld, gibt es keinen Hinweis und keinen Fehler\n" +
  "let mockScan = null;\n" +
  "try { const m = $('Mock_Scan').first(); mockScan = (m && m.json && m.json.mock_scan) || null; } catch (e) { mockScan = null; }\n";
const OLD_FFR_TAIL = "if (legalOutcome.legal_message) {\n  finalMessage = `${finalMessage}\\n\\n${legalOutcome.legal_message}`;\n}\n";
const NEW_FFR_TAIL = OLD_FFR_TAIL + "if (mockScan && typeof mockScan.message === 'string' && mockScan.message) {\n  finalMessage = `${finalMessage}\\n\\n${mockScan.message}`;\n}\n";

function replaceExactlyOnce(code, oldStr, newStr, label) {
  const first = code.indexOf(oldStr);
  if (first === -1) throw new Error(`${label}: erwarteter Altcode nicht gefunden`);
  if (code.indexOf(oldStr, first + 1) !== -1) throw new Error(`${label}: Altcode mehrfach vorhanden`);
  return code.slice(0, first) + newStr + code.slice(first + oldStr.length);
}
function patchFormatFinalResponse(code) {
  return replaceExactlyOnce(replaceExactlyOnce(code, OLD_FFR_LEGAL, NEW_FFR_LEGAL, 'Format_Final_Response (#1)'), OLD_FFR_TAIL, NEW_FFR_TAIL, 'Format_Final_Response (#2)');
}

const MOCK_NODE_ID = '7d0c6f2e-5a51-4b0e-9d1a-6f0a2b3c4d5e';
const MOCK_NODE = { parameters: { jsCode: MOCK_SCAN_CODE }, id: MOCK_NODE_ID, name: 'Mock_Scan', type: 'n8n-nodes-base.code', typeVersion: 2, position: [432, 2400] };

// Gesamter Patch auf eine Workflow-Kopie; wirft bei unerwartetem Ausgangszustand
function applyPatch(wf) {
  const out = JSON.parse(JSON.stringify(wf));
  if (out.nodes.some(n => n.name === 'Mock_Scan')) throw new Error('Mock_Scan existiert bereits');
  const ffr = out.nodes.find(n => n.name === 'Format_Final_Response');
  if (!ffr) throw new Error('Format_Final_Response fehlt');
  ffr.parameters.jsCode = patchFormatFinalResponse(ffr.parameters.jsCode);
  out.nodes.push(JSON.parse(JSON.stringify(MOCK_NODE)));
  const g = out.connections.Sync_GitHub_Gate && out.connections.Sync_GitHub_Gate.main;
  if (!g || g.length !== 1) throw new Error('Sync_GitHub_Gate: unerwartete Ausgänge');
  const targets = g[0].map(c => c.node);
  if (JSON.stringify(targets) !== JSON.stringify(['Secret_Scan', 'Compliance_Scan', 'Legal_Scan'])) throw new Error('Sync_GitHub_Gate: unerwartete Ziele ' + targets.join(','));
  g[0] = g[0].map(c => (c.node === 'Legal_Scan' ? { node: 'Mock_Scan', type: 'main', index: 0 } : c));
  if (out.connections.Mock_Scan) throw new Error('Connections für Mock_Scan existieren bereits');
  out.connections.Mock_Scan = { main: [[{ node: 'Legal_Scan', type: 'main', index: 0 }]] };
  if (JSON.stringify(out.connections.Legal_Scan) !== JSON.stringify({ main: [[{ node: 'Sync_Legal_Gate', type: 'main', index: 1 }]] })) throw new Error('Legal_Scan: unerwartete Ausgänge');
  return out;
}

module.exports = { MOCK_SCAN_CODE, MOCK_NODE, patchFormatFinalResponse, applyPatch, OLD_FFR_LEGAL, NEW_FFR_LEGAL, OLD_FFR_TAIL, NEW_FFR_TAIL };
