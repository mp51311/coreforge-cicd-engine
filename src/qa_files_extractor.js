// Robuster Datei-Extraktor für LLM-JSON-Ausgaben ({"files":[{"path":..., "content":...}, ...]}).
// Vorgesehen für: Prepare_Disk_Files (QA_Gatekeeper-Output) UND Aggregate_Files (Dev_Backend-/Dev_Frontend-Output).
// Der Block zwischen "=== EXTRACTOR START/END ===" wird 1:1 in beide Code-Nodes eingebettet (n8n-Code-Nodes können keinen Code teilen);
// Test und Patch-Skript lesen denselben Block aus dieser Datei (wie bei compliance_pattern_patch.js / test_legal_scan.js).
//
// Stufen:  1) striktes JSON.parse (mit sanitizeCtrl)  ->  2) tolerante Einzeldatei-Extraktion (deterministisch, kein LLM)  ->  3) Plausibilitätsprüfung.
// Es werden KEINE Code-Fences global entfernt: das JSON wird per Klammern ausgeschnitten (erstes "{" bis letztes "}"), äußere Fences liegen
// damit von selbst außerhalb; ``` innerhalb von Dateiinhalten (z. B. README-Codeblöcke) bleiben erhalten.

// === EXTRACTOR START ===
function sanitizeCtrl(t){let r="";let inStr=false;let esc=false;for(let i=0;i<t.length;i++){const c=t[i];const cc=t.charCodeAt(i);if(inStr){if(esc){r+=c;esc=false;}else if(cc===92){r+=c;esc=true;}else if(cc===34){r+=c;inStr=false;}else if(cc===10){r+="\\n";}else if(cc===13){r+="\\r";}else if(cc===9){r+="\\t";}else{r+=c;}}else{if(cc===34){inStr=true;}r+=c;}}return r;}

const VALID_ESC = { '"': '"', '\\': '\\', '/': '/', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t' };
// Toleranter JSON-String-Decoder: gültige Escapes wie JSON; ungültige Escape-Sequenzen (z. B. \d, \', \$) bleiben als Backslash+Zeichen erhalten.
function lenientUnescape(s) {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c !== '\\') { out += c; continue; }
    const n = s[i + 1];
    if (n === undefined) { out += '\\'; break; }
    if (n === 'u' && /^[0-9a-fA-F]{4}$/.test(s.slice(i + 2, i + 6))) { out += String.fromCharCode(parseInt(s.slice(i + 2, i + 6), 16)); i += 5; continue; }
    if (Object.prototype.hasOwnProperty.call(VALID_ESC, n)) { out += VALID_ESC[n]; i += 1; continue; }
    out += '\\' + n; i += 1;
  }
  return out;
}

function isUnsafePath(p) {
  const norm = String(p).replace(/\\/g, '/').replace(/^\/+/, '');
  return norm === '' || norm.split('/').some(seg => seg === '..') || /^[A-Za-z]:/.test(norm) || norm.indexOf('\u0000') !== -1;
}

// opts.forceTolerant: nur für Tests (Stufe 2 auch bei gültigem JSON erzwingen)
function extractFiles(rawText, opts) {
  const o = opts || {};
  const res = { files: [], method: 'none', plausible: false, problems: [], warnings: [], truncated: false, truncatedPath: null, expected: 0 };
  const text = String(rawText === undefined || rawText === null ? '' : rawText);
  const first = text.indexOf('{');
  if (first === -1) { res.problems.push('kein JSON-Objekt im Text gefunden'); return res; }
  const last = text.lastIndexOf('}');
  const cand = last > first ? text.slice(first, last + 1) : text.slice(first);
  const tail = text.slice(first);
  const structural = (tail.match(/\{\s*"path"\s*:\s*"[^"]*"\s*,\s*"content"\s*:\s*"/g) || []).length;

  // Stufe 1: striktes JSON
  if (!o.forceTolerant) {
    try {
      const parsed = JSON.parse(sanitizeCtrl(cand));
      const arr = parsed && Array.isArray(parsed.files) ? parsed.files : null;
      if (arr) {
        res.files = arr.map(f => ({ path: String((f && (f.path || f.filename)) || ''), content: typeof (f && f.content) === 'string' ? f.content : '' }));
        res.method = 'json';
        res.expected = arr.length;
      } else { res.warnings.push('gültiges JSON, aber kein files-Array – wechsle zur toleranten Extraktion'); }
    } catch (e) { /* weiter mit Stufe 2 */ }
  }

  // Stufe 2: tolerante Einzeldatei-Extraktion
  if (res.method === 'none') {
    // Eintragsende = ein UNESCAPTES " (gerade Anzahl Backslashes davor), gefolgt von "}" und danach entweder ", {"path":" (nächster Eintrag) oder "]" (Array-Ende).
    // Rohe/falsch escapte " im Inhalt (z. B. `\""`, verbatim eingebettete Codeblöcke) und escaptes JSON im Inhalt (`\"}]`) beenden den Eintrag damit nicht.
    const startRe = /\{\s*"path"\s*:\s*"([^"]+)"\s*,\s*"content"\s*:\s*"/g;
    const endRe = /^\s*\}(?=\s*(?:,\s*\{\s*"path"\s*:|\]))/;
    const files = [];
    let sm, lastEnd = -1, incompletePath = null;
    while ((sm = startRe.exec(tail)) !== null) {
      const contentStart = startRe.lastIndex;
      let i = contentStart, endIdx = -1, contentEnd = -1;
      for (;;) {
        const q = tail.indexOf('"', i);
        if (q === -1) break;
        let bs = 0; for (let k = q - 1; k >= 0 && tail[k] === '\\'; k--) bs++;
        if (bs % 2 === 0) {
          const em = endRe.exec(tail.slice(q + 1, q + 1 + 400));
          if (em) { endIdx = q + 1 + em[0].length; contentEnd = q; break; }
        }
        i = q + 1;
      }
      if (endIdx === -1) { incompletePath = sm[1]; break; }
      files.push({ path: lenientUnescape(sm[1]), content: lenientUnescape(tail.slice(contentStart, contentEnd)) });
      lastEnd = endIdx; startRe.lastIndex = endIdx;
    }
    res.files = files; res.method = files.length ? 'tolerant' : 'none'; res.expected = structural;
    const remainder = lastEnd === -1 ? tail : tail.slice(lastEnd);
    if (incompletePath === null && lastEnd !== -1 && /^\s*\]/.test(remainder)) {
      // Array ordnungsgemäß geschlossen -> Struktur vollständig
    } else if (structural > 0) {
      res.truncated = true; res.truncatedPath = incompletePath;
    }
  }

  // Stufe 3: Plausibilität (problems = hart -> Retry/fail-closed; warnings = nur Hinweis)
  if (res.files.length === 0) res.problems.push('keine Dateien extrahierbar');
  if (res.method === 'tolerant' && res.expected !== res.files.length) res.problems.push('Anzahl: ' + res.files.length + ' extrahiert, ' + res.expected + ' erwartet');
  if (res.truncated) res.problems.push('Ausgabe unvollständig/abgeschnitten' + (res.truncatedPath ? ' (Datei ' + res.truncatedPath + ' nicht abgeschlossen)' : ''));
  for (const f of res.files) {
    if (isUnsafePath(f.path)) res.problems.push('unsicherer oder leerer Pfad: ' + JSON.stringify(f.path));
    if (!f.content || !f.content.trim()) res.problems.push('leerer Inhalt: ' + f.path);
    if (/\.html?$/i.test(f.path) && !/<\/html>/i.test(f.content)) res.warnings.push('HTML ohne </html>: ' + f.path);
  }
  res.plausible = res.problems.length === 0;
  return res;
}
// === EXTRACTOR END ===

module.exports = (function () {
  const src = require('fs').readFileSync(__filename, 'utf8');
  const block = src.split('// === EXTRACTOR START ===')[1].split('// === EXTRACTOR END ===')[0];
  return { extractFiles: new Function(block + '; return extractFiles;')(), sanitizeCtrl: new Function(block + '; return sanitizeCtrl;')(), block };
})();
