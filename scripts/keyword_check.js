// Pre-push check 3/3 (next to scan_secrets.js and gitleaks): searches every file for words that must not be
// published (private network ranges, account and host names, key file names, credential-like prefixes).
// Every allowed occurrence is listed below with a reason; anything else fails.
// Usage: node scripts/keyword_check.js   (exit code 1 on any unexplained hit)
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

const TERMS = ['192.168.', 'mp51311', '@gmail', 'Powell', 'ed25519', 'AKIA', 'sk-', 'ghp_', 'webhook', 'credential', 'docker-srv', 'nginx-staging', 'mpcore', 'B5yh'];

// [file (repo-relative, regex), term, reason]
const ALLOW = [
  [/^LICENSE$/, 'Powell', 'copyright holder'],
  [/^README\.md$/, 'Powell', 'author'],
  [/^package\.json$/, 'Powell', 'author field'],
  [/^README\.md$/, 'mpcore', 'link to the author website'],
  [/^README\.md$/, 'webhook', 'describes the chat trigger / placeholders'],
  [/^README\.md$/, 'credential', 'setup instructions (credentials are not included)'],
  [/^docs\/.*\.md$/, 'credential', 'documentation of credential handling'],
  [/^docs\/.*\.md$/, 'webhook', 'documentation of the chat trigger'],
  [/^docs\/.*\.md$/, 'AKIA', 'documents the secret catalog / test key assembly'],
  [/^docs\/.*\.md$/, 'sk-', 'documents the secret catalog / test key assembly'],
  [/^docs\/.*\.md$/, 'ghp_', 'documents the secret catalog'],
  [/^workflow\/.*\.json$/, 'AKIA', 'regex source inside the Secret_Scan node'],
  [/^workflow\/.*\.json$/, 'sk-', 'regex sources inside the Secret_Scan node (openai/anthropic key patterns)'],
  [/^workflow\/.*\.json$/, 'webhook', 'webhookId placeholders and chat trigger type'],
  [/^workflow\/.*\.json$/, 'credential', 'credential placeholders and n8n field names'],
  [/^workflow\/.*\.json$/, '192.168.', 'regex for private addresses in Legal_Scan (ignore list)'],
  [/^tests\/secret_scan\.test\.js$/, 'sk-', 'test inputs, assembled at runtime'],
  [/^tests\/secret_scan\.test\.js$/, 'AKIA', 'test input, assembled at runtime'],
  [/^tests\/fixtures\/llm\/extractor_cases\.json$/, 'credential', 'FastAPI CORS parameter allow_credentials in real model output'],
  [/^tests\/secret_scan\.test\.js$/, 'credential', 'test descriptions and the pattern name db_connection_string_with_credentials'],
  [/^scripts\/export_sanitized_workflow\.js$/, '.*', 'the sanitizer itself lists the forbidden values as patterns and placeholders'],
  [/^scripts\/keyword_check\.js$/, '.*', 'this file defines the word list'],
  [/^scripts\/scan_secrets\.js$/, '.*', 'describes the secret catalog'],
  [/^examples\/.*\.js$/, 'webhook', 'n8n webhook trigger in the isolated test / chat URL building'],
  [/^examples\/.*\.js$/, 'credential', 'n8n field names'],
  [/^\.gitignore$/, '.*', 'ignore patterns'],
];

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === '.git' || e.name === 'node_modules') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}
const hits = [], allowed = {};
for (const p of walk(ROOT)) {
  const rel = path.relative(ROOT, p).replace(/\\/g, '/');
  const text = fs.readFileSync(p, 'utf8');
  for (const term of TERMS) {
    let i = -1, n = 0;
    const lower = text.toLowerCase(), t = term.toLowerCase();
    while ((i = lower.indexOf(t, i + 1)) !== -1) n++;
    if (!n) continue;
    const rule = ALLOW.find(([f, tm]) => f.test(rel) && (tm === '.*' || tm.toLowerCase() === t));
    if (rule) { const k = `${rel} | ${term} | ${rule[2]}`; allowed[k] = (allowed[k] || 0) + n; }
    else hits.push(`${rel}: "${term}" x${n}`);
  }
}
console.log('allowed occurrences (reason):');
for (const [k, n] of Object.entries(allowed)) console.log(`  ${k} (x${n})`);
console.log(hits.length ? 'NOT ALLOWED:' : 'no unexplained hits');
for (const h of hits) console.log('  ' + h);
process.exit(hits.length ? 1 : 0);
