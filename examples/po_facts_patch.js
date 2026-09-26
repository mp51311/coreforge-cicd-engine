// EXAMPLE (patch module: exact-replacement patch with preconditions, platform facts shared with the PO prompt) from the CoreForge project, published for reading. Comments are in German (project language).
// Paths were adapted to this repository; instance-specific values come from environment variables.
// Punkt I (Marcs Freigabe 26.09., Variante V1): Plattform-Fakten auch an den Product Owner.
//  - Format_Dev_Payload: 8. Fakt "platform_facts override any conflicting specification item." + Quellen-Kommentar
//  - Product Owner (Systemprompt): neuer Abschnitt "# PLATFORM CONSTRAINTS" vor "# OPERATIONAL PROTOCOL"
//    (alle PLATFORM_FACTS wörtlich + PO-Regeln), Discovery-Kriterium 4 und Zwei-Optionen-Regel auf die Plattform begrenzt
// Zwei Felder, keine neuen Nodes, keine Connections. Quelle aller Texte: platform_facts.js.
// Reine String-Transformationen mit harten Vorbedingungen (exakte Ersetzung genau einer Fundstelle, sonst Fehler).
const PF = require('../src/platform_facts.js');

function replaceExactlyOnce(code, oldStr, newStr, label) {
  const first = code.indexOf(oldStr);
  if (first === -1) throw new Error(`${label}: erwarteter Altcode nicht gefunden`);
  if (code.indexOf(oldStr, first + 1) !== -1) throw new Error(`${label}: Altcode mehrfach vorhanden`);
  return code.slice(0, first) + newStr + code.slice(first + oldStr.length);
}
const chain = (label, pairs) => (c) => pairs.reduce((acc, [o, n], i) => replaceExactlyOnce(acc, o, n, `${label} (#${i + 1})`), c);

// ---------- Format_Dev_Payload ----------
const patchFormatDevPayload = chain('Format_Dev_Payload', [[PF.FDP_BLOCK_OLD, PF.FDP_BLOCK_NEW]]);

// ---------- Product Owner ----------
const OLD_CRITERION_4 = "  4. Technical interfaces & hosting (self-hosted Proxmox LXC/Docker, DB choice, APIs)\n";
const NEW_CRITERION_4 = "  4. Technical interfaces (API routes; data in-memory or SQLite file). Stack and hosting are fixed, see PLATFORM CONSTRAINTS: never ask about them.\n";
const OLD_OPTIONS_RULE = "- RULE: For technical decisions, always offer 2 concrete options with a recommendation to reduce cognitive load.\n";
const NEW_OPTIONS_RULE = "- RULE: For technical decisions, always offer 2 concrete options with a recommendation to reduce cognitive load. Both options must fit the PLATFORM CONSTRAINTS.\n";
const OLD_PROTOCOL_ANCHOR = "\n \n# OPERATIONAL PROTOCOL (State Machine)\n";
const NEW_PROTOCOL_ANCHOR = "\n \n" + PF.PO_PLATFORM_SECTION + " \n# OPERATIONAL PROTOCOL (State Machine)\n";
const patchProductOwner = chain('Product Owner', [
  [OLD_PROTOCOL_ANCHOR, NEW_PROTOCOL_ANCHOR],
  [OLD_CRITERION_4, NEW_CRITERION_4],
  [OLD_OPTIONS_RULE, NEW_OPTIONS_RULE],
]);

const codeGet = (n) => n.parameters.jsCode;
const codeSet = (n, v) => { n.parameters.jsCode = v; };
const poGet = (n) => n.parameters.options.systemMessage;
const poSet = (n, v) => { n.parameters.options.systemMessage = v; };

const TARGETS = [
  ['Format_Dev_Payload', codeGet, codeSet, patchFormatDevPayload],
  ['Product Owner', poGet, poSet, patchProductOwner],
];

function patchedValues(wf) {
  const out = {};
  for (const [name, get, , patch] of TARGETS) {
    const node = wf.nodes.find(x => x.name === name);
    if (!node) throw new Error('Node fehlt: ' + name);
    out[name] = patch(get(node));
  }
  return out;
}

module.exports = { TARGETS, patchedValues, OLD_CRITERION_4, NEW_CRITERION_4, OLD_OPTIONS_RULE, NEW_OPTIONS_RULE, OLD_PROTOCOL_ANCHOR, NEW_PROTOCOL_ANCHOR };
