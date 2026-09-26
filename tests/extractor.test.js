// File extractor for LLM output (strict JSON -> tolerant per-file recovery -> plausibility check), used by
// Aggregate_Files, Check_Extraction and Prepare_Disk_Files. Fixtures are real model outputs: four historical
// cases that broke the old JSON.parse path, two outputs cut off by MAX_TOKENS, two valid ones.
const fs = require('fs');
const path = require('path');
const { extractFiles } = require('../src/qa_files_extractor');
const { nodeCode, suite } = require('./lib/harness');
const cases = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'llm', 'extractor_cases.json'), 'utf8'));

function strictOld(raw) { // the former parser: global fence stripping + JSON.parse
  const c = String(raw).replace(/```json/gi, '').replace(/```/gi, '').trim();
  const a = c.indexOf('{'), b = c.lastIndexOf('}');
  if (a === -1 || b === -1) return null;
  try { const p = JSON.parse(c.slice(a, b + 1)); return Array.isArray(p.files) ? p.files : null; } catch (e) { return null; }
}
function scriptErrors(html) {
  const errs = []; const re = /<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/gi; let m;
  while ((m = re.exec(html)) !== null) { if (/type\s*=\s*["']?module/i.test(m[1])) continue; try { new Function(m[2]); } catch (e) { errs.push(e.message); } }
  return errs;
}

(async () => {
  const t = suite('File extractor (real LLM outputs)');
  for (const c of cases) {
    const r = extractFiles(c.raw);
    if (c.kind === 'broken_json_rescued') {
      t.check(`${c.id}: old parser fails on this output (it really is a failure case)`, strictOld(c.raw) === null);
      const html = (r.files.find(f => f.path === 'index.html') || {}).content || '';
      const readme = (r.files.find(f => f.path === 'README.md') || {}).content || '';
      t.check(`${c.id}: rescued tolerantly, plausible, 5 files`, r.plausible && r.method === 'tolerant' && r.files.length === 5, JSON.stringify({ m: r.method, n: r.files.length, p: r.problems }));
      t.check(`${c.id}: index.html complete and inline scripts parse`, /<\/html>\s*$/i.test(html) && scriptErrors(html).length === 0, JSON.stringify(scriptErrors(html)));
      t.check(`${c.id}: README keeps its code fences`, /^#/.test(readme.trim()) && /```/.test(readme));
    } else if (c.kind === 'truncated') {
      t.check(`${c.id}: cut-off output (${c.finishReason}) is never treated as complete`, !r.plausible && r.truncated === true, JSON.stringify({ p: r.plausible, tr: r.truncated }));
    } else {
      const tol = extractFiles(c.raw, { forceTolerant: true });
      t.check(`${c.id}: valid JSON -> strict path, plausible`, r.method === 'json' && r.plausible);
      t.check(`${c.id}: forced tolerant path yields exactly the same files`, tol.method === 'tolerant' && JSON.stringify(tol.files) === JSON.stringify(r.files));
    }
  }
  // the three nodes embed the same extractor code as src/qa_files_extractor.js
  const mod = fs.readFileSync(path.join(__dirname, '..', 'src', 'qa_files_extractor.js'), 'utf8');
  const block = mod.slice(mod.indexOf('function sanitizeCtrl'), mod.indexOf('// === EXTRACTOR END ===')).trimEnd();
  for (const n of ['Aggregate_Files', 'Check_Extraction', 'Prepare_Disk_Files']) t.check(`${n} embeds the extractor from src/ unchanged`, block.length > 1000 && nodeCode(n).includes(block));
  t.done();
})();
