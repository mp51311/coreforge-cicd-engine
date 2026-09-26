// Punkt G (Marcs Freigabe 26.09., Variante A): deterministischer Frontend-Mock-Scan für index.html.
// Informativ, blockiert nie. Gemeinsames Modul für Offline-Test, isolierten Test und Live-Patch (der Node-Code wird
// daraus erzeugt, siehe mock_scan_patch.js). Keine Abhängigkeiten, reine Funktionen.
//
// Befundklassen:
//  fetch_override       fetch/XMLHttpRequest wird im Browser ersetzt (window/globalThis/self.fetch = …, defineProperty,
//                       XMLHttpRequest.prototype.open/send); Unterart unbedingt/fallback
//  fabricated_fallback  In einer Funktion, die Daten über fetch holt – direkt oder über eine eigene fetch-Hilfsfunktion
//                       (Wrapper, z. B. apiCall(url) { … fetch(url) … }) –, entstehen Daten lokal: Math.random (außerhalb
//                       von Animations-Callbacks und Audio-Code) oder mock/simulat/fallback/demo-Bezeichner im catch-Block
//  uncalled_routes      Routen aus ui_ux_spec.consumes_routes, die in der Seite nirgends vorkommen (Pfad bis zum ersten
//                       {param}); nur wenn eine Spec vorliegt
// Grenzen (bewusst, siehe status.md 26.09.): vorgetäuschter Erfolgs-Status ohne Zufall/Mock-Namen und lokal duplizierte
// Geschäftslogik werden nicht erkannt.

function stripComments(s) {
  return s.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\'"`])\/\/[^\n]*/g, '$1');
}
function blockEnd(code, openIdx) {
  let d = 1, i = openIdx + 1;
  for (; i < code.length && d; i++) { if (code[i] === '{') d++; else if (code[i] === '}') d--; }
  return i;
}
// Funktionen mit (falls vorhanden) Namen
function functions(code) {
  const out = [];
  const re = /(?:(?:async\s+)?function\s*(\w*)\s*\([^)]*\)\s*\{)|(?:(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?(?:function\s*\w*\s*\([^)]*\)|\([^)]*\)\s*=>|\w+\s*=>)\s*\{)|(?:(?:async\s*)?\([^)]*\)\s*=>\s*\{)|(?:(?:async\s+)?\w+\s*=>\s*\{)/g;
  let m;
  while ((m = re.exec(code))) {
    const open = m.index + m[0].length - 1;
    const end = blockEnd(code, open);
    out.push({ name: m[1] || m[2] || '', start: m.index, text: code.slice(m.index, end) });
  }
  return out;
}
function withoutAnimation(body) {
  let s = body;
  const re = /\b(setInterval|setTimeout|requestAnimationFrame)\s*\(\s*(?:async\s*)?(?:\([^)]*\)|\w+)?\s*(?:=>)?\s*(?:function\s*\w*\s*\([^)]*\)\s*)?\{/g;
  let m, guard = 0;
  while ((m = re.exec(s)) && guard++ < 200) { const open = m.index + m[0].length - 1; const end = blockEnd(s, open); s = s.slice(0, m.index) + s.slice(end); re.lastIndex = m.index; }
  return s.split('\n').filter(l => !/AudioContext|Oscillator|frequency|\.gain\b|gain\./.test(l)).join('\n');
}
const OVERRIDE_RE = /\b(?:window|globalThis|self)\s*\.\s*fetch\s*=(?!=)|(?:^|[;{}\s])fetch\s*=(?!=)\s*(?:async\b|function\b|\(|[A-Za-z_$])|Object\.defineProperty\(\s*(?:window|globalThis|self)\s*,\s*['"]fetch['"]|XMLHttpRequest\.prototype\.(?:open|send)\s*=|(?:window|globalThis)\.XMLHttpRequest\s*=/;
const FETCH_CALL_RE = /\bfetch\s*\(/;
const CATCH_FAKE_ID_RE = /\b\w*(?:mock|simulat|fallback|demo)\w*\s*(?:\(|\[|=(?!=)|\.)/i;
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function overrideMode(code, idx) {
  const body = code.slice(idx, idx + 1500);
  const firstSynthetic = body.search(/new\s+Response\s*\(|Promise\.resolve\s*\(\s*\{|new\s+Promise\s*\(|json\s*:\s*(async\s*)?\(\)\s*=>/);
  const firstReal = body.search(/await\s+(orig\w*|original\w*|_fetch|realFetch)\s*(\.apply)?\(/);
  if (firstSynthetic === -1) return 'fallback?';
  return firstReal !== -1 && firstReal < firstSynthetic ? 'fallback' : 'unbedingt';
}
function routePaths(routes) {
  return (Array.isArray(routes) ? routes : []).map(r => String(typeof r === 'string' ? r : (r && r.path) || '')
    .replace(/^(GET|POST|PUT|PATCH|DELETE)\s+/i, '').split('{')[0].replace(/\/+$/, '')).filter(p => p && p !== '');
}

// html: Inhalt der index.html; consumesRoutes: optional ui_ux_spec.consumes_routes
function scanHtml(html, consumesRoutes) {
  const code = stripComments(String(html || ''));
  const findings = [];
  const om = OVERRIDE_RE.exec(code);
  if (om) findings.push({ kind: 'fetch_override', mode: overrideMode(code, om.index), evidence: code.slice(om.index, om.index + 160).replace(/\s+/g, ' ') });

  const fns = functions(code);
  // Wrapper = benannte Funktion mit fetch-Aufruf; Datenfunktionen = fetch direkt oder Aufruf eines Wrappers
  const wrappers = [...new Set(fns.filter(f => f.name && FETCH_CALL_RE.test(f.text)).map(f => f.name))];
  const callsData = (t) => FETCH_CALL_RE.test(t) || wrappers.some(w => new RegExp('\\b' + esc(w) + '\\s*\\(').test(t.slice(t.indexOf('{'))));
  for (const f of fns.filter(f => callsData(f.text))) {
    const body = withoutAnimation(f.text);
    const rnd = /Math\.random/.exec(body);
    let ev = rnd ? body.slice(Math.max(0, rnd.index - 80), rnd.index + 90) : null;
    if (!ev) {
      const re = /catch\s*(?:\([^)]*\))?\s*\{/g; let m;
      while ((m = re.exec(body)) && !ev) {
        const blk = body.slice(m.index, blockEnd(body, m.index + m[0].length - 1));
        if (CATCH_FAKE_ID_RE.test(blk.replace(/(['"`])(?:\\.|(?!\1).)*\1/g, '""'))) ev = blk.slice(0, 220);
      }
    }
    if (ev) { findings.push({ kind: 'fabricated_fallback', evidence: ev.replace(/\s+/g, ' ') }); break; }
  }

  const paths = routePaths(consumesRoutes);
  const uncalled = paths.filter(p => !code.includes(p));
  if (uncalled.length) findings.push({ kind: 'uncalled_routes', routes: uncalled, evidence: `Spec-Routen ohne Aufruf in index.html: ${uncalled.join(', ')}` });

  return { mock: findings.some(f => f.kind !== 'uncalled_routes'), flagged: findings.length > 0, findings, wrappers, checked_routes: paths.length };
}

// Chat-Text (deutsch, informativ) aus dem Ergebnis; leer, wenn nichts gefunden
function formatMessage(result) {
  if (!result || !result.flagged) return '';
  const lines = [];
  for (const f of result.findings) {
    if (f.kind === 'fetch_override') lines.push(`- Die Seite ersetzt \`fetch\` im Browser (${f.mode === 'unbedingt' ? 'Antworten kommen immer lokal, das Backend wird nicht gefragt' : 'lokale Antworten, wenn das Backend nicht antwortet'}).`);
    if (f.kind === 'fabricated_fallback') lines.push('- Die Seite erzeugt bei einem Backend-Fehler eigene Daten, statt den Fehler anzuzeigen.');
    if (f.kind === 'uncalled_routes') lines.push(`- Diese Routen aus der Spezifikation ruft die Seite nie auf: ${f.routes.map(r => '`' + r + '`').join(', ')}.`);
  }
  return `ℹ️ **Frontend-Hinweis (informativ, kein Blocker):** Der Mock-Scan hat in \`index.html\` Auffälligkeiten gefunden:\n${lines.join('\n')}\nDie App kann dadurch funktionsfähig wirken, obwohl das Backend nicht beteiligt ist.`;
}

module.exports = { scanHtml, formatMessage, stripComments, routePaths };
