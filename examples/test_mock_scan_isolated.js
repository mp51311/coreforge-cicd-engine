// EXAMPLE (isolated test: throw-away n8n workflow, real runtime and filesystem binaries, control stations, both arrival orders. NEEDS AN n8n INSTANCE, NOT PART OF npm test) from the CoreForge project, published for reading. Comments are in German (project language).
// Paths were adapted to this repository; instance-specific values come from environment variables.
// Punkt G, Schritt 1 – isolierter Test in der echten n8n-Laufzeit (Dateisystem-Binärmodus der Instanz), ohne LLM.
// Wegwerf-Workflow TEST_Mock_Scan_Isolated_DELETE_ME:
//   Webhook → Format_Dev_Payload (Stub: consumes_routes) → Build_Files (prepareBinaryData, wie Prepare_Disk_Files)
//     ├─ Format_GitHub_Outcome (Stub) → Format_Compliance_Outcome (Stub, liefert response) → Sync_Legal_Gate (Eingang 0)
//     ├─ Mock_Scan (NEU, getesteter Code) → Legal_Scan (1:1 live) → Sync_Legal_Gate (Eingang 1, 1:1 live)
//     └─ Kontrollstation: Legal_Scan_DIRECT (1:1 live, direkt wie heute) → END_DIRECT
//   Sync_Legal_Gate → Format_Final_Response (NEU) und Format_Final_Response_OLD (heutiger Code, Kontrollstation)
// Marcs Bedingungen (26.09.):
//   1. positive Kontrolle für Legal_Scan hinter Mock_Scan (Google-Fonts-Link) + Kontrollstation Legal_Scan direkt, gleiches Ergebnis
//   2. Mock_Scan reicht immer unverändert durch, auch bei eigenem Fehler (kaputte Eingabe erzwungen), Chat-Antwort entsteht
//   3. Format_Final_Response liest mock_scan abgesichert
//   + beide Ankunftsreihenfolgen an Sync_Legal_Gate (Canvas-Position des Stub-Zweigs oben bzw. unten)
// Aufruf: node test_mock_scan_isolated.js <Live-GET/Backup vor dem Patch>
const fs = require('fs');
const path = require('path');
const P = require('./mock_scan_patch.js');
// Credentials come from the environment (N8N_BASE_URL, N8N_API_KEY); never from files in the repo.
const env = { N8N_BASE_URL: process.env.N8N_BASE_URL, N8N_API_KEY: process.env.N8N_API_KEY };
if (!env.N8N_BASE_URL || !env.N8N_API_KEY) { console.error('set N8N_BASE_URL and N8N_API_KEY'); process.exit(1); }
const H = { 'X-N8N-API-KEY': env.N8N_API_KEY, 'Content-Type': 'application/json' };
const API = `${env.N8N_BASE_URL}/api/v1`;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const get = async (p) => (await fetch(API + p, { headers: H })).json();
let pass = 0, fail = 0;
const check = (name, cond, detail) => { if (cond) { pass++; console.log('  OK  ', name); } else { fail++; console.log('  FAIL', name, detail || ''); } };

const POS = fs.readFileSync(path.join(__dirname, '..', 'tests', 'fixtures', 'mock', 'g1_override_unconditional.html'), 'utf8');
const FONTS = '<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap" rel="stylesheet">';
const POS_FONTS = POS.replace('</head>', FONTS + '\n</head>');
const CLEAN = fs.readFileSync(path.join(__dirname, '..', 'tests', 'fixtures', 'mock', 'clean_calculator.html'), 'utf8');
const MAIN = 'from pathlib import Path\nfrom fastapi import FastAPI\nfrom fastapi.responses import FileResponse\napp = FastAPI()\n';
const REQ = 'fastapi>=0.110.0\nuvicorn>=0.28.0\n';
const SCEN = {
  pos_fonts: { files: [['main.py', MAIN], ['requirements.txt', REQ], ['index.html', POS_FONTS]], consumes: ['/api/flip'] },
  clean: { files: [['main.py', MAIN], ['requirements.txt', REQ], ['index.html', CLEAN]], consumes: ['/api/calculate'] },
  uncalled: { files: [['main.py', MAIN], ['requirements.txt', REQ], ['index.html', CLEAN]], consumes: ['/api/calculate', '/api/missing'] },
  broken: { files: [['main.py', MAIN], ['requirements.txt', REQ], ['index.html', null]], consumes: ['/api/calculate'] }, // index.html mit Verweis auf nicht existierende Binärdatei
  noindex: { files: [['main.py', MAIN], ['requirements.txt', REQ]], consumes: [] },
};

function buildWorkflow(live, order, hook) {
  const copy = (n, pos, rename) => { const x = JSON.parse(JSON.stringify(live.nodes.find(y => y.name === n))); delete x.id; x.position = pos; if (rename) x.name = rename; return x; };
  const code = (name, jsCode, pos) => ({ name, type: 'n8n-nodes-base.code', typeVersion: 2, position: pos, parameters: { jsCode } });
  // Reihenfolge: A = Stub-Zweig oben (kommt zuerst an Eingang 0), B = Stub-Zweig unten (Legal_Scan zuerst an Eingang 1)
  const yStub = order === 'A' ? 100 : 700, yMock = order === 'A' ? 400 : 200;
  const liveFfr = live.nodes.find(n => n.name === 'Format_Final_Response').parameters.jsCode;
  const nodes = [
    { name: 'Webhook', type: 'n8n-nodes-base.webhook', typeVersion: 2, position: [0, 300], parameters: { httpMethod: 'POST', path: hook, responseMode: 'onReceived', options: {} }, webhookId: 'cccccccc-dddd-4eee-ffff-mockscan000' + (order === 'A' ? '1' : '2') },
    code('Format_Dev_Payload', "return [{ json: { raw_spec: { ui_ux_spec: { consumes_routes: $('Webhook').first().json.body.consumes } } } }];", [200, 300]),
    code('Build_Files', [
      "const b = $('Webhook').first().json.body;",
      "const out = [];",
      "for (const [name, content] of b.files) {",
      "  if (content === null) {",
      "    // kaputte Eingabe: Binär-Verweis auf eine nicht existierende Datei (erzwingt Lesefehler)",
      "    out.push({ json: { file_name: name, source: 'dev' }, binary: { data: { data: 'filesystem-v2', id: 'filesystem-v2:workflows/none/executions/none/binary_data/does-not-exist', mimeType: 'text/html', fileName: name, fileExtension: 'html', fileSize: '1 kB' } } });",
      "  } else {",
      "    out.push({ json: { file_name: name, source: 'dev' }, binary: { data: await this.helpers.prepareBinaryData(Buffer.from(content, 'utf-8'), name) } });",
      "  }",
      "}",
      "return out;",
    ].join('\n'), [400, 300]),
    code('Format_GitHub_Outcome', "return [{ json: { github_status: 'pushed', github_message: '' } }];", [620, yStub]),
    code('Format_Compliance_Outcome', "return [{ json: { compliance_status: 'clean', compliance_message: '', response: 'BASE', output: 'BASE' } }];", [840, yStub]),
    { ...P.MOCK_NODE, id: undefined, position: [620, yMock] },
    copy('Legal_Scan', [840, yMock]),
    copy('Sync_Legal_Gate', [1060, 300]),
    code('Format_Final_Response', P.patchFormatFinalResponse(liveFfr), [1280, 200]),
    code('Format_Final_Response_OLD', liveFfr, [1280, 400]),
    copy('Legal_Scan', [620, 900], 'Legal_Scan_DIRECT'),
    code('END_DIRECT', "return [{ json: { end: 'DIRECT' } }];", [840, 900]),
  ].map(n => { const x = { ...n }; if (x.id === undefined) delete x.id; return x; });
  const c = (n, i = 0) => ({ node: n, type: 'main', index: i });
  return {
    name: `TEST_Mock_Scan_Isolated_${order}_DELETE_ME`, nodes, settings: { executionOrder: 'v1', binaryMode: 'separate' },
    connections: {
      Webhook: { main: [[c('Format_Dev_Payload')]] },
      Format_Dev_Payload: { main: [[c('Build_Files')]] },
      Build_Files: { main: [[c('Format_GitHub_Outcome'), c('Mock_Scan'), c('Legal_Scan_DIRECT')]] },
      Format_GitHub_Outcome: { main: [[c('Format_Compliance_Outcome')]] },
      Format_Compliance_Outcome: { main: [[c('Sync_Legal_Gate', 0)]] },
      Mock_Scan: { main: [[c('Legal_Scan')]] },
      Legal_Scan: { main: [[c('Sync_Legal_Gate', 1)]] },
      Sync_Legal_Gate: { main: [[c('Format_Final_Response'), c('Format_Final_Response_OLD')]] },
      Legal_Scan_DIRECT: { main: [[c('END_DIRECT')]] },
    },
  };
}
const outJ = (rd, n, k = 0) => rd[n] && rd[n][0] && rd[n][0].data && rd[n][0].data.main[0] ? rd[n][0].data.main[0].map(x => x.json) : null;
const outItems = (rd, n) => rd[n] && rd[n][0] && rd[n][0].data && rd[n][0].data.main[0] ? rd[n][0].data.main[0] : null;

(async () => {
  const live = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  const results = {};
  for (const order of ['A', 'B']) {
    const hook = 'test-mock-scan-isolated-' + order.toLowerCase();
    const wf = buildWorkflow(live, order, hook);
    fs.writeFileSync(path.join(__dirname, `test_mock_scan_isolated_workflow_${order}.json`), JSON.stringify(wf));
    const created = await (await fetch(`${API}/workflows`, { method: 'POST', headers: H, body: JSON.stringify(wf) })).json();
    if (!created.id) throw new Error('Anlegen fehlgeschlagen: ' + JSON.stringify(created).slice(0, 400));
    const id = created.id; console.log(`\n== Reihenfolge ${order} (Stub-Zweig ${order === 'A' ? 'oben: Eingang 0 zuerst' : 'unten: Legal_Scan zuerst'}), Workflow ${id}`);
    try {
      const got = await get(`/workflows/${id}`);
      check(`${order}: Mock_Scan-Code im Test-Workflow == getesteter Code`, got.nodes.find(n => n.name === 'Mock_Scan').parameters.jsCode === P.MOCK_SCAN_CODE);
      check(`${order}: Legal_Scan / Sync_Legal_Gate 1:1 live`, ['Legal_Scan', 'Sync_Legal_Gate'].every(n => JSON.stringify(got.nodes.find(x => x.name === n).parameters) === JSON.stringify(live.nodes.find(x => x.name === n).parameters)));
      const act = await fetch(`${API}/workflows/${id}/activate`, { method: 'POST', headers: H });
      if (!act.ok) throw new Error('Aktivieren: ' + (await act.text()).slice(0, 300));
      for (const [scen, s] of Object.entries(SCEN)) {
        const before = await get(`/executions?workflowId=${id}&limit=1`);
        const lastId = before.data && before.data[0] ? Number(before.data[0].id) : 0;
        await fetch(`${env.N8N_BASE_URL}/webhook/${hook}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scenario: scen, files: s.files, consumes: s.consumes }) });
        let ex = null;
        for (let i = 0; i < 40 && !ex; i++) { await sleep(1000); const l = await get(`/executions?workflowId=${id}&limit=1`); const e = l.data && l.data[0]; if (e && Number(e.id) > lastId && ['success', 'error', 'crashed'].includes(e.status)) ex = e; }
        if (!ex) { check(`${order}/${scen}: Execution beendet`, false, 'Timeout'); continue; }
        const full = await get(`/executions/${ex.id}?includeData=true`);
        const rd = full.data.resultData.runData;
        const tag = `${order}/${scen} (${ex.id})`;
        check(`${tag}: Execution success`, full.status === 'success', full.status + ' ' + JSON.stringify(full.data.resultData.error || '').slice(0, 200));
        const built = outItems(rd, 'Build_Files'), mocked = outItems(rd, 'Mock_Scan');
        if (s.files.some(f => f[1] !== null)) check(`${tag}: Binaries im Dateisystem-Modus`, built.filter(it => it.json.file_name !== 'index.html' || s.files.find(f => f[0] === 'index.html')[1] !== null).every(it => String(it.binary.data.id || '').startsWith('filesystem-v2:') && it.binary.data.data === 'filesystem-v2'));
        check(`${tag}: Mock_Scan reicht alle Items unverändert durch (Anzahl, Reihenfolge, binary-IDs, json bis auf mock_scan)`, mocked && mocked.length === built.length && mocked.every((it, i) => it.binary && built[i].binary && it.binary.data.id === built[i].binary.data.id && JSON.stringify({ ...it.json, mock_scan: undefined }) === JSON.stringify({ ...built[i].json, mock_scan: undefined })));
        const ms = mocked && mocked[0] && mocked[0].json.mock_scan;
        const legal = outJ(rd, 'Legal_Scan'), direct = outJ(rd, 'Legal_Scan_DIRECT');
        check(`${tag}: Legal_Scan hinter Mock_Scan == Kontrollstation Legal_Scan direkt`, legal && direct && JSON.stringify(legal) === JSON.stringify(direct), JSON.stringify(legal).slice(0, 160) + ' vs ' + JSON.stringify(direct).slice(0, 160));
        const ffr = outJ(rd, 'Format_Final_Response'), old = outJ(rd, 'Format_Final_Response_OLD');
        check(`${tag}: Chat-Antwort entsteht (Format_Final_Response lief)`, ffr && typeof ffr[0].response === 'string' && ffr[0].response.startsWith('BASE'));
        const tStub = rd.Format_Compliance_Outcome[0].startTime, tLegal = rd.Legal_Scan[0].startTime;
        check(`${tag}: Ankunftsreihenfolge wie erzwungen (${order === 'A' ? 'Stub vor Legal' : 'Legal vor Stub'})`, order === 'A' ? tStub <= tLegal : tLegal <= tStub, `stub ${tStub} legal ${tLegal}`);
        if (scen === 'pos_fonts') {
          check(`${tag}: positive Kontrolle Legal: Google Fonts gefunden (liest die durchgereichten Binaries)`, legal[0].legal_status === 'flagged' && legal[0].third_party_resources.some(r => r.provider === 'Google Fonts'));
          check(`${tag}: Mock-Scan: flagged, fetch_override unbedingt`, ms.mock_status === 'flagged' && ms.findings.some(f => f.kind === 'fetch_override' && f.mode === 'unbedingt') && ms.bytes_read > 1000);
          check(`${tag}: Chat enthält Rechts- und Frontend-Hinweis, alt nur Rechts-Hinweis`, /Rechts-Hinweis/.test(ffr[0].response) && /Frontend-Hinweis/.test(ffr[0].response) && /Rechts-Hinweis/.test(old[0].response) && !/Frontend-Hinweis/.test(old[0].response));
        }
        if (scen === 'clean') {
          check(`${tag}: clean, keine Meldung, Chat == alter Code`, ms.mock_status === 'clean' && ms.message === '' && ffr[0].response === old[0].response);
        }
        if (scen === 'uncalled') {
          check(`${tag}: ungenutzte Route /api/missing gemeldet`, ms.mock_status === 'flagged' && ms.findings.some(f => f.kind === 'uncalled_routes' && f.routes.join() === '/api/missing') && /`\/api\/missing`/.test(ffr[0].response));
        }
        if (scen === 'broken') {
          check(`${tag}: kaputte Eingabe: scan_failed, sichtbarer Hinweis im Chat, Legal-Zweig lief`, ms.mock_status === 'scan_failed' && /konnte index\.html nicht prüfen/.test(ffr[0].response) && legal !== null);
          check(`${tag}: Legal_Scan meldet den Lesefehler ebenfalls (fail-loud, wie direkt)`, (legal[0].read_errors || []).includes('index.html'));
          check(`${tag}: Fehlergrund lesbar: "Binärdatei nicht gefunden (…does-not-exist)"`, /Binärdatei nicht gefunden \(.*does-not-exist\)/.test(ffr[0].response) && !/\[object Object\]/.test(ffr[0].response), `error=${ms.error} type=${ms.error_type} keys=${JSON.stringify(ms.error_keys)}`);
        }
        if (scen === 'noindex') {
          check(`${tag}: keine index.html: scan_failed-Hinweis, Chat entsteht`, ms.mock_status === 'scan_failed' && /index\.html nicht unter den Dateien/.test(ms.error) && /Frontend-Hinweis/.test(ffr[0].response));
        }
        results[`${order}/${scen}`] = { exec: ex.id, status: full.status, mock_scan: ms, legal_status: legal && legal[0].legal_status, response: ffr && ffr[0].response };
      }
    } finally {
      await fetch(`${API}/workflows/${id}/deactivate`, { method: 'POST', headers: H });
      const del = await fetch(`${API}/workflows/${id}`, { method: 'DELETE', headers: H });
      console.log(`Test-Workflow ${id} ${del.ok ? 'gelöscht' : 'NICHT gelöscht'}`);
    }
  }
  fs.writeFileSync(path.join(__dirname, 'mock_scan_isolated_results.json'), JSON.stringify(results, null, 1));
  console.log(`\n${pass}/${pass + fail} OK`);
  if (fail) process.exit(1);
})().catch(e => { console.error(e); process.exit(1); });
