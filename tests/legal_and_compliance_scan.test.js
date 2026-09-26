// Legal_Scan (third-party resources, informative) and Compliance_Scan (deterministic PII pre-filter that decides
// whether the Compliance LLM agent runs), both run from the published workflow.
const { nodeCode, runCodeNode, suite } = require('./lib/harness');

(async () => {
  const t = suite('Legal_Scan and Compliance_Scan (node code from the published workflow)');
  const legal = nodeCode('Legal_Scan');
  const run = async (html) => (await runCodeNode(legal, { files: [{ name: 'main.py', content: 'app = 1' }, { name: 'index.html', content: html }] })).out;

  let out = await run('<script src="https://cdn.tailwindcss.com"></script>');
  t.check('Legal: exactly one output item', out.length === 1);
  t.check('Legal: Tailwind Play-CDN flagged with provider and file', out[0].json.legal_status === 'flagged' && out[0].json.third_party_resources.some(r => /Tailwind/.test(r.provider) && r.files.includes('index.html')));
  out = await run('<link href="https://fonts.googleapis.com/css2?family=Inter" rel="stylesheet">');
  t.check('Legal: Google Fonts flagged and the "host fonts locally" recommendation is added', out[0].json.third_party_resources.some(r => r.provider === 'Google Fonts') && /lokal hosten/.test(out[0].json.legal_message));
  out = await run('<a href="https://example.org/docs">Docs</a><script>fetch("/api/data")</script>');
  t.check('Legal: plain links and relative API calls are not third-party loads', out[0].json.legal_status === 'not_applicable');
  out = await run('<script src="http://localhost:8000/x.js"></script><script src="http://10.0.0.5/y.js"></script>');
  t.check('Legal: localhost and private addresses are ignored', out[0].json.legal_status === 'not_applicable');
  out = await run('<script>\n// docs: https://cdn.jsdelivr.net/npm/some-lib\nconsole.log(1);\n</script>');
  t.check('Legal: a URL that is only mentioned (comment/text, no loading context) is ignored', out[0].json.legal_status === 'not_applicable');
  out = await run('<!-- <script src="https://cdn.jsdelivr.net/npm/x"></script> -->');
  t.check('Legal: a commented-out <script src> is still reported (conservative by design)', out[0].json.legal_status === 'flagged');
  out = (await runCodeNode(legal, { files: [{ name: 'index.html', content: null }] })).out;
  t.check('Legal: read error is reported, never swallowed (fail-loud)', out[0].json.legal_status === 'scan_failed' && out[0].json.read_errors.includes('index.html'));

  const comp = nodeCode('Compliance_Scan');
  const scan = async (content) => (await runCodeNode(comp, { files: [{ name: 'main.py', content }] })).out[0].json;
  let r = await scan('class Contact(BaseModel):\n    first_name: str\n    email: str\n    phone: str');
  t.check('Compliance: contact form fields -> direct identifiers, LLM review triggered', r.pii_scan_triggered && ['name_field', 'email_field', 'phone_field'].every(n => r.pii_indicators.some(i => i.name === n)));
  r = await scan('@app.get("/health")\nasync def health():\n    return {"status": "ok"}');
  t.check('Compliance: a /health endpoint is not health data (calibrated whitelist)', !r.pii_scan_triggered);
  r = await scan('window.location.reload(); const url = window.location.href;');
  t.check('Compliance: window.location is not location data', !r.pii_scan_triggered);
  r = await scan('# stores patient health records for the clinic dashboard');
  t.check('Compliance: personal health context -> sensitive (Art. 9) indicator', r.pii_indicators.some(i => i.name === 'health_field' && i.tier === 'sensitive'));
  r = await scan('patient_health_records = []');
  t.check('Compliance: known gap, snake_case "patient_health_records" is NOT matched (word boundary; documented limitation)', !r.pii_indicators.some(i => i.name === 'health_field'));
  r = (await runCodeNode(comp, { files: [{ name: 'main.py', content: null }] })).out[0].json;
  t.check('Compliance: read error becomes a visible indicator (fail-loud, never blocks)', r.pii_indicators.some(i => i.name === 'scan_read_error') && r.pii_scan_triggered);
  t.done();
})();
