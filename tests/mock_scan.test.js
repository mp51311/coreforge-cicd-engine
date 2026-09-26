// Frontend mock scan: module src/mock_scan.js against curated fixtures (positives, traps, clean apps),
// plus the Mock_Scan node from the published workflow (module embedded unchanged, pass-through, fail-loud)
// and Format_Final_Response (hint appended only when present).
const fs = require('fs');
const path = require('path');
const S = require('../src/mock_scan');
const { nodeCode, runCodeNode, suite, AsyncFunction } = require('./lib/harness');
const FIX = path.join(__dirname, 'fixtures', 'mock');
const cases = JSON.parse(fs.readFileSync(path.join(FIX, 'cases.json'), 'utf8'));

(async () => {
  const t = suite('Mock scan (module + Mock_Scan node)');
  for (const c of cases) {
    const html = fs.readFileSync(path.join(FIX, c.file), 'utf8');
    const r = S.scanHtml(html, c.consumes_routes || undefined);
    const kinds = r.findings.map(f => f.kind);
    if (c.label === 'mock') {
      t.check(`${c.file}: mock detected (${c.note})`, r.mock && c.expect.every(k => kinds.includes(k)) && (!c.mode || r.findings.some(f => f.mode === c.mode)), JSON.stringify(kinds));
    } else if (c.expect.length) {
      t.check(`${c.file}: ${c.expect.join(',')} reported, no mock (${c.note})`, !r.mock && c.expect.every(k => kinds.includes(k)), JSON.stringify(r.findings));
    } else {
      t.check(`${c.file}: nothing reported (${c.note})`, !r.flagged, JSON.stringify(r.findings.map(f => f.kind + ': ' + (f.evidence || '').slice(0, 80))));
    }
  }
  t.check('wrapper detection names the fetch helper (apiCall)', S.scanHtml(fs.readFileSync(path.join(FIX, 'g2_fabricated_via_wrapper.html'), 'utf8')).wrappers.includes('apiCall'));
  t.check('route with {param} counts as called for `/api/items/${id}`', !S.scanHtml('fetch(`/api/items/${id}`)', ['DELETE /api/items/{id}']).flagged);
  t.check('empty / missing input: no crash, nothing reported', !S.scanHtml('').flagged && !S.scanHtml(undefined).flagged);

  // the published node must contain the module unchanged (single source of truth)
  const code = nodeCode('Mock_Scan');
  const mod = fs.readFileSync(path.join(__dirname, '..', 'src', 'mock_scan.js'), 'utf8');
  t.check('Mock_Scan node embeds src/mock_scan.js unchanged', code.startsWith(mod.slice(0, mod.lastIndexOf('module.exports')).trimEnd()));

  const POS = fs.readFileSync(path.join(FIX, 'g1_override_unconditional.html'), 'utf8');
  const files = [{ name: 'main.py', content: 'app = 1' }, { name: 'index.html', content: POS }, { name: 'requirements.txt', content: 'fastapi' }];
  let { items, out } = await runCodeNode(code, { files, refs: { Format_Dev_Payload: [{ raw_spec: { ui_ux_spec: { consumes_routes: ['/api/flip'] } } }] } });
  t.check('node: positive control flagged (override, unconditional) with chat hint', out[0].json.mock_scan.mock_status === 'flagged' && /Frontend-Hinweis/.test(out[0].json.mock_scan.message));
  t.check('node: all items passed through unchanged (same binary objects, order), result only on item 0', out.length === items.length && out.every((it, i) => it.binary === items[i].binary) && out.slice(1).every(it => it.json.mock_scan === undefined));
  ({ items, out } = await runCodeNode(code, { files: [{ name: 'main.py', content: 'x' }, { name: 'index.html', content: null }] }));
  t.check('node: unreadable file -> scan_failed with readable reason, items still passed on (fail-loud)', out[0].json.mock_scan.mock_status === 'scan_failed' && /Binärdatei nicht gefunden/.test(out[0].json.mock_scan.message) && out.length === 2);
  ({ out } = await runCodeNode(code, { files: [{ name: 'main.py', content: 'x' }] }));
  t.check('node: no index.html -> scan_failed, not a crash', out[0].json.mock_scan.mock_status === 'scan_failed');
  ({ out } = await runCodeNode(code, { files: [] }));
  t.check('node: no items -> returns [] (downstream behaviour unchanged)', Array.isArray(out) && out.length === 0);

  // Format_Final_Response: the mock hint is optional and guarded
  const ffr = nodeCode('Format_Final_Response');
  const runF = (nodes) => { const $ = (n) => { if (!(n in nodes)) throw new Error('not executed'); return { first: () => nodes[n] }; }; return new Function('$', '$json', ffr)($, { response: 'BASE' })[0].json.response; };
  const base = { Format_GitHub_Outcome: { json: { github_status: 'pushed' } }, Format_Compliance_Outcome: { json: { compliance_status: 'clean' } }, Legal_Scan: { json: { legal_message: 'LEGAL' } } };
  t.check('final response: mock hint appended after the legal hint', runF({ ...base, Mock_Scan: { json: { mock_scan: { message: 'MOCK' } } } }) === 'BASE\n\nLEGAL\n\nMOCK');
  t.check('final response: Mock_Scan missing / field missing / empty message -> unchanged answer', ['BASE\n\nLEGAL'].every(e => runF(base) === e && runF({ ...base, Mock_Scan: { json: {} } }) === e && runF({ ...base, Mock_Scan: { json: { mock_scan: { message: '' } } } }) === e));
  t.check('final response code compiles', (() => { try { new AsyncFunction('$', '$json', ffr); return true; } catch (e) { return false; } })());
  t.done();
})();
