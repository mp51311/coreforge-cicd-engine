// platform_facts: one list of platform rules, used in two places of the published workflow –
// the array in Format_Dev_Payload (developer + QA agents) and a verbatim copy in the Product Owner prompt.
// checkDrift() must see both places identical to src/platform_facts.js, and must catch every kind of drift.
const PF = require('../src/platform_facts');
const { workflow, nodeCode, suite } = require('./lib/harness');

(async () => {
  const t = suite('platform_facts drift protection (published workflow)');
  const fdp = nodeCode('Format_Dev_Payload');
  const po = workflow.nodes.find(n => n.name === 'Product Owner').parameters.options.systemMessage;
  t.check('8 facts, the last one is the precedence rule', PF.PLATFORM_FACTS.length === 8 && PF.PLATFORM_FACTS[7] === 'platform_facts override any conflicting specification item.');
  const drift = await PF.checkDrift(fdp, po);
  t.check('published workflow: no drift between Format_Dev_Payload, Product Owner prompt and module', drift.length === 0, drift.join('; '));
  t.check('Product Owner prompt contains the PLATFORM CONSTRAINTS section exactly once', po.split('# PLATFORM CONSTRAINTS').length === 2);
  t.check('Product Owner prompt is plain text (no n8n expression)', !po.startsWith('=') && !po.includes('{{'));

  const f2 = PF.PLATFORM_FACTS[1];
  const negatives = [
    ['fact changed in the code', fdp.replace(JSON.stringify(f2), JSON.stringify(f2.replace('below 400', 'below 500'))), po],
    ['fact changed in the prompt', fdp, po.replace('- ' + f2, '- ' + f2.replace('below 400', 'below 500'))],
    ['extra fact only in the code', fdp.replace(JSON.stringify(PF.FACT_OVERRIDE) + ',', JSON.stringify(PF.FACT_OVERRIDE) + ',\n  "Extra fact.",'), po],
    ['fact missing in the prompt', fdp, po.replace('- ' + PF.FACT_OVERRIDE + '\n', '')],
    ['order swapped in the prompt', fdp, po.replace('- ' + PF.PLATFORM_FACTS[4] + '\n- ' + PF.PLATFORM_FACTS[5], '- ' + PF.PLATFORM_FACTS[5] + '\n- ' + PF.PLATFORM_FACTS[4])],
    ['intro sentence missing in the prompt', fdp, po.replace(PF.PO_FACTS_INTRO, 'Facts:')],
  ];
  for (const [label, code, prompt] of negatives) {
    if (code === fdp && prompt === po) { t.check('negative prepared: ' + label, false, 'mutation did not apply'); continue; }
    t.check('drift detected: ' + label, (await PF.checkDrift(code, prompt)).length > 0);
  }
  t.done();
})();
