// Secret_Scan node (fail-closed gate before the GitHub push), run from the published workflow.
// Key-like test strings are assembled at runtime so that no contiguous credential-shaped string exists in
// the source tree (secret scanners / push protection). The scanned values are unchanged.
const { nodeCode, runCodeNode, suite } = require('./lib/harness');
const j = (...parts) => parts.join('');

const CASES = [
  { d: 'clean main.py', f: 'main.py', t: 'from fastapi import FastAPI\napp = FastAPI()\n\n@app.get("/api/health")\ndef health():\n    return {"status": "ok"}\n', e: [] },
  { d: '.env.example with placeholder connection string', f: '.env.example', t: 'DATABASE_URL=postgres://user:password@localhost:5432/db\nSECRET_KEY=changeme\n', e: [] },
  { d: 'placeholder connection string, short form', f: 'settings.py', t: 'FALLBACK_DB = "postgres://user:pass@host"', e: [] },
  { d: 'Postgres connection string with a realistic password', f: 'db.py', t: j('DATABASE_URL = "postgres://appuser:', 'Tr9!qX2vL8zKcM4d', '@db-prod-01.internal:5432/appdb"'), e: ['db_connection_string_with_credentials'] },
  { d: 'MongoDB+srv connection string with credentials', f: 'db.py', t: j('MONGO_URI = "mongodb+srv://svc_billing:', 'Hs7$mPz1QeD9vB2x', '@cluster0.abcde.mongodb.net/billing"'), e: ['db_connection_string_with_credentials'] },
  { d: 'Stripe live key', f: 'billing.py', t: j('STRIPE_KEY = "sk', '_live_', '4eC39HqLyjWDarjtT1zdp7dc"'), e: ['stripe_key'] },
  { d: 'Stripe test key', f: 'billing.py', t: j('STRIPE_KEY = "sk', '_test_', '4eC39HqLyjWDarjtT1zdp7dc"'), e: ['stripe_key'] },
  { d: 'OpenAI project key', f: 'ai.py', t: j('OPENAI_KEY = "sk', '-proj-', 'Ab12Cd34Ef56Gh78Ij90Kl12Mn34Op56"'), e: ['openai_key'] },
  { d: 'OpenAI legacy key', f: 'ai.py', t: j('OPENAI_KEY = "sk', '-', 'Ab12Cd34Ef56Gh78Ij90Kl12Mn34Op56"'), e: ['openai_key'] },
  { d: 'Anthropic key', f: 'ai.py', t: j('ANTHROPIC_KEY = "sk', '-ant-', 'api03-Q7wE9rT1yU3iO5pA7sD9fG1hJ3kL5zC7vB9nM1qW3eR5tY7uI9oP1aS3dF5gH7jK9l"'), e: ['anthropic_key'] },
  { d: 'JWT (three segments)', f: 'auth.py', t: j('AUTH_JWT = "', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9', '.', 'eyJzdWIiOiIxMjM0NTY3ODkwIn0', '.', 'SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c"'), e: ['jwt'] },
  { d: 'false-positive check: "sk-" in a comment', f: 'notes.py', t: '# sk-thoughts: refine error handling later\ndef foo():\n    return 42\n', e: [] },
  { d: 'OPENAI_API_KEY variable: generic assignment + provider pattern (layered detection)', f: 'ai.py', t: j('OPENAI_API_KEY = "sk', '-proj-', 'Ab12Cd34Ef56Gh78Ij90Kl12Mn34Op56"'), e: ['generic_secret_assignment', 'openai_key'] },
  { d: '.env.example with placeholder token value', f: '.env.example', t: 'PVE_HOST=host.example\nPVE_TOKEN_VALUE=your-token-here\n', e: [] },
  { d: 'AWS access key id', f: 'config.py', t: j('AWS_KEY = "AK', 'IA', 'ABCDEFGHIJKLMNOP"'), e: ['aws_access_key_id'] },
  { d: 'private key header', f: 'id_rsa', t: j('-----BEGIN RSA ', 'PRIVATE KEY-----\nMIIEpAIBAAKCAQEA...\n-----END RSA ', 'PRIVATE KEY-----'), e: ['private_key_header'] },
  { d: 'password with "changeme" placeholder', f: 'settings.py', t: 'password = "changeme123456789"', e: [] },
];

(async () => {
  const t = suite('Secret_Scan (node code from the published workflow)');
  const code = nodeCode('Secret_Scan');
  for (const c of CASES) {
    const { out } = await runCodeNode(code, { files: [{ name: c.f, content: c.t }] });
    const got = [...out[0].json.secret_scan.matches].sort();
    t.check(c.d, JSON.stringify(got) === JSON.stringify([...c.e].sort()), `expected ${JSON.stringify(c.e)} got ${JSON.stringify(got)}`);
  }
  // fail-closed: an unreadable file must block the push, never count as clean
  const { out } = await runCodeNode(code, { files: [{ name: 'main.py', content: 'x = 1' }, { name: 'index.html', content: null }] });
  t.check('unreadable file -> scan_read_error, pipeline not clean (fail-closed)', out[1].json.secret_scan.matches.includes('scan_read_error') && out.every(i => i.json.secret_scan_pipeline_clean === false));
  t.check('items and binaries are passed through', out.length === 2 && out[0].binary && out[0].binary.data.id.endsWith('main.py'));
  t.done();
})();
