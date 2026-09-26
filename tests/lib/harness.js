// Minimal test harness: loads the published (sanitized) workflow and runs the JavaScript of its Code nodes
// outside n8n. Binary files are simulated the way n8n stores them in filesystem mode: item.binary.data only
// carries a marker, the content is read through this.helpers.getBinaryDataBuffer(itemIndex, 'data').
// No network, no n8n, no dependencies.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const WORKFLOW_FILE = path.join(ROOT, 'workflow', 'coreforge-cicd-engine.sanitized.json');
const workflow = JSON.parse(fs.readFileSync(WORKFLOW_FILE, 'utf8'));
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

function nodeCode(name) {
  const n = workflow.nodes.find(x => x.name === name);
  if (!n) throw new Error('node not found in workflow: ' + name);
  return n.parameters.jsCode;
}

// files: [{ name, content | null (unreadable) | undefined (no binary) }]
// refs:  { NodeName: [json, ...] } for $('NodeName').first()/.all()
async function runCodeNode(code, { files = [], refs = {}, json = {} } = {}) {
  const items = files.map(f => ({
    json: { file_name: f.name },
    binary: f.content === undefined ? undefined : { data: { data: 'filesystem-v2', id: 'filesystem-v2:test/' + f.name, fileName: f.name } },
  }));
  const helpers = {
    getBinaryDataBuffer: async (i, prop) => {
      if (prop !== 'data') throw new Error('unexpected binary property ' + prop);
      const f = files[i];
      // shape of the error n8n really throws for a missing binary file (observed in an isolated test)
      if (f.content === null) throw { level: 'info', shouldReport: false, tags: {}, extra: { filePath: 'test/' + f.name } };
      return Buffer.from(f.content, 'utf-8');
    },
    prepareBinaryData: async (buf, fileName) => ({ data: 'filesystem-v2', id: 'filesystem-v2:test/' + fileName, fileName, _content: buf.toString('utf-8') }),
  };
  const $ = (name) => {
    if (!(name in refs)) throw new Error(`Referenced node "${name}" has not been executed`);
    const arr = refs[name].map(j => ({ json: j }));
    return { first: () => arr[0], all: () => arr, last: () => arr[arr.length - 1] };
  };
  const fn = new AsyncFunction('$', '$input', '$json', 'Buffer', code);
  const out = await fn.call({ helpers }, $, { all: () => items, first: () => items[0] }, json, Buffer);
  return { items, out };
}

// tiny assertion helper with a per-file summary
function suite(title) {
  let pass = 0, fail = 0;
  console.log('\n# ' + title);
  return {
    check(name, ok, detail) {
      if (ok) { pass++; console.log('  ok   ' + name); } else { fail++; console.log('  FAIL ' + name + (detail ? ' -- ' + detail : '')); }
    },
    done() { console.log(`  ${pass}/${pass + fail} passed`); if (fail) process.exitCode = 1; return { pass, fail }; },
  };
}

module.exports = { ROOT, workflow, nodeCode, runCodeNode, suite, AsyncFunction };
