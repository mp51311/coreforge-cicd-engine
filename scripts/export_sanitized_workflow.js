// Portfolio-Repo, Schritt 0 (ENTWURF, NICHT AUSGEFÜHRT): erzeugt aus einem Workflow-GET eine veröffentlichbare JSON-Datei.
// Grundsatz: Positivliste. Übernommen werden nur name, nodes, connections, settings; alles andere entfällt.
// Wo n8n ein Feld für den Import braucht, steht ein Platzhalter statt einer Löschung (Import bleibt strukturell möglich).
// Nach der Bereinigung prüft das Skript selbst, dass keine Original-Kennung und kein verbotenes Muster übrig ist (fail-closed).
//
// Aufruf (erst in Schritt 1): node export_sanitized_workflow.js <GET.json> <ausgabe.json>
//   <GET.json> = frischer GET von /api/v1/workflows/<id>, lokal gespeichert (das Skript selbst greift nicht aufs Netz zu)
const fs = require('fs');

const PLACEHOLDER = {
  docker_host: '<DOCKER_HOST>',
  n8n_host: '<N8N_HOST>',
  github_owner: '<GITHUB_OWNER>',
  credential_id: 'REPLACE_WITH_YOUR_CREDENTIAL_ID',
};
// Neutrale Credential-Namen je Typ (die Originalnamen enthalten Hostbezeichnungen, z. B. "(docker-srv)")
const CREDENTIAL_NAMES = { googlePalmApi: 'Google Gemini API', sshPrivateKey: 'SSH key (docker host)', githubApi: 'GitHub API' };
// Feste Platzhalter-UUIDs statt der echten webhookIds (n8n braucht das Feld für Trigger-/Webhook-Nodes)
const WEBHOOK_PLACEHOLDERS = ['00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000003'];
// Muster, die in der Ausgabe nie vorkommen dürfen (zusätzlich zu allen Original-IDs aus dem Input)
const FORBIDDEN = [/192\.168\.\d{1,3}\.\d{1,3}/, /\b10\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/, /mp51311/i, /@gmail\./i, /Powell/i, /ed25519/i, /docker-srv/i, /nginx-staging/i,
  /AKIA[0-9A-Z]{16}/, /gh[pousr]_[A-Za-z0-9]{20,}/, /sk-(ant-|proj-)?[A-Za-z0-9_-]{16,}/, /-----BEGIN [A-Z ]*PRIVATE KEY-----/, /xox[baprs]-/, /AIza[0-9A-Za-z_-]{30,}/];

function sanitize(get) {
  // 1. Original-Kennungen einsammeln (für die Abschlussprüfung)
  const originals = new Set([get.id, get.versionId, get.activeVersionId, get.sourceWorkflowId].filter(Boolean));
  for (const s of get.shared || []) { originals.add(s.projectId); if (s.project) { originals.add(s.project.id); originals.add(s.project.name); } }
  for (const n of get.nodes) {
    if (n.webhookId) originals.add(n.webhookId);
    for (const c of Object.values(n.credentials || {})) { if (c.id) originals.add(c.id); if (c.name) originals.add(c.name); }
  }

  // 2. Positivliste auf oberster Ebene
  const out = { name: 'CoreForge CI/CD Engine', nodes: [], connections: JSON.parse(JSON.stringify(get.connections)), settings: { executionOrder: get.settings.executionOrder, binaryMode: get.settings.binaryMode }, active: false };
  if (get.pinData && Object.keys(get.pinData).length) throw new Error('pinData nicht leer – bitte prüfen (enthält ggf. Nutzerdaten)');

  // 3. Nodes: nur bekannte Felder, Credentials und webhookIds ersetzen
  const NODE_KEYS = ['parameters', 'type', 'typeVersion', 'position', 'id', 'name', 'webhookId', 'credentials', 'retryOnFail', 'waitBetweenTries', 'executeOnce', 'onError', 'alwaysOutputData', 'disabled', 'notes'];
  let wh = 0;
  for (const n of get.nodes) {
    const unknown = Object.keys(n).filter(k => !NODE_KEYS.includes(k));
    if (unknown.length) throw new Error(`Node ${n.name}: unbekannte Felder ${unknown.join(',')} – Positivliste erweitern oder prüfen`);
    const m = {};
    for (const k of NODE_KEYS) if (k in n) m[k] = JSON.parse(JSON.stringify(n[k]));
    if (m.webhookId) { if (wh >= WEBHOOK_PLACEHOLDERS.length) throw new Error('zu viele webhookIds'); m.webhookId = WEBHOOK_PLACEHOLDERS[wh++]; }
    if (m.credentials) for (const [type, c] of Object.entries(m.credentials)) m.credentials[type] = { id: PLACEHOLDER.credential_id, name: CREDENTIAL_NAMES[type] || type };
    out.nodes.push(m);
  }

  // 4. Config-Node: zentrale Werte durch Platzhalter ersetzen (einzige Stelle mit IPs/Owner, geprüft 26.09.)
  const cfg = out.nodes.find(x => x.name === 'Config');
  if (!cfg) throw new Error('Config-Node fehlt');
  let code = cfg.parameters.jsCode;
  code = code.replace(/(docker_srv_ip:\s*)"[^"]*"/, `$1"${PLACEHOLDER.docker_host}"`).replace(/(n8n_host_ip:\s*)"[^"]*"/, `$1"${PLACEHOLDER.n8n_host}"`).replace(/(github_owner:\s*)"[^"]*"/, `$1"${PLACEHOLDER.github_owner}"`);
  // veralteten Planungskommentar (Stand vor der Verdrahtung, Verweis auf interne Notizen) durch den heutigen Stand ersetzen
  const OLD_CFG_COMMENT = '// Zentrale Werte fuer Punkt 2 (Tiefenanalyse Config-Zentralisierung). NOCH NICHT eingehaengt.\n' +
    '// docker_srv_ip ersetzt spaeter den Hardcode in Format_Success_Response (appUrl), NICHT Build_Command_Builder (dort steht keine IP).\n' +
    '// github_owner ersetzt spaeter owner.value in GitHub_Push_Files.\n' +
    '// n8n_host_ip ist aktuell in keinem Node hartkodiert -- nur zu Dokumentationszwecken mitgefuehrt (Infrastruktur laut CLAUDE.md).\n';
  const NEW_CFG_COMMENT = '// Zentrale Werte: docker_srv_ip nutzt Format_Success_Response (Live-Link), github_owner nutzt GitHub_Push_Files.\n' +
    '// n8n_host_ip wird von keinem Node gelesen (nur Dokumentation).\n';
  if (!code.startsWith(OLD_CFG_COMMENT)) throw new Error('Config-Node: Kommentar weicht vom erwarteten Stand ab – Sanitizer prüfen');
  code = NEW_CFG_COMMENT + code.slice(OLD_CFG_COMMENT.length);
  cfg.parameters.jsCode = code;

  // 5. Abschlussprüfung (fail-closed): keine Original-Kennung, kein verbotenes Muster
  const text = JSON.stringify(out);
  const leftOriginals = [...originals].filter(o => typeof o === 'string' && o.length >= 6 && text.includes(o));
  if (leftOriginals.length) throw new Error(`Original-Kennungen noch enthalten: ${leftOriginals.length} (Werte bewusst nicht ausgegeben)`);
  const leftPatterns = FORBIDDEN.filter(re => re.test(text)).map(re => String(re));
  if (leftPatterns.length) throw new Error('verbotene Muster noch enthalten: ' + leftPatterns.join(', '));
  if (!text.includes(PLACEHOLDER.docker_host) || !text.includes(PLACEHOLDER.github_owner)) throw new Error('Config-Platzhalter nicht gesetzt');
  // Struktur: jede Connection zeigt auf einen existierenden Node
  const names = new Set(out.nodes.map(x => x.name));
  for (const [src, v] of Object.entries(out.connections)) {
    if (!names.has(src)) throw new Error('Connection-Quelle fehlt: ' + src);
    for (const outs of Object.values(v)) for (const arr of outs) for (const c of arr || []) if (!names.has(c.node)) throw new Error('Connection-Ziel fehlt: ' + c.node);
  }
  return { out, stats: { nodes: out.nodes.length, credentials_replaced: out.nodes.filter(x => x.credentials).length, webhookIds_replaced: wh, originals_checked: originals.size } };
}

if (require.main === module) {
  const [, , inFile, outFile] = process.argv;
  if (!inFile || !outFile) { console.error('Aufruf: node export_sanitized_workflow.js <GET.json> <ausgabe.json>'); process.exit(1); }
  const { out, stats } = sanitize(JSON.parse(fs.readFileSync(inFile, 'utf8')));
  fs.writeFileSync(outFile, JSON.stringify(out, null, 2) + '\n');
  console.log('bereinigt:', JSON.stringify(stats), '->', outFile);
}
module.exports = { sanitize, FORBIDDEN, PLACEHOLDER };
