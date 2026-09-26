// Deploy command with health check (Build_Command_Builder node from the published workflow).
// Build and start are one fail-closed '&&' chain; after 'docker run -d' the app must answer on / with a status
// below 400 while the container runs with RestartCount 0, otherwise exit 97 (-> reject response, no repo push).
// Shell checks need bash (Git Bash on Windows); they are skipped if bash is not available.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { nodeCode, runCodeNode, suite } = require('./lib/harness');

let bash = true;
try { execFileSync('bash', ['-c', 'exit 0'], { stdio: 'ignore' }); } catch (e) { bash = false; }

(async () => {
  const t = suite('Deploy health check (Build_Command_Builder)');
  const { out } = await runCodeNode(nodeCode('Build_Command_Builder'), { refs: { Format_Dev_Payload: [{ project_slug: 'demo-app-abc123' }], Port_Counter: [{ stdout: '20100' }] } });
  const cmd = out[0].json.build_command;
  t.check('one command string, slug and port filled in', typeof cmd === 'string' && cmd.includes('demo-app-abc123') && cmd.includes('20100:8000'));
  t.check('build is fail-closed: "docker build … && … docker run" (no ";" between dependent steps)', /docker build -t demo-app-abc123 \. && /.test(cmd) && !/docker build[^&]*;\s*docker run/.test(cmd));
  t.check('container starts with --restart unless-stopped', /docker run -d --restart unless-stopped --name demo-app-abc123 -p 20100:8000/.test(cmd));
  t.check('healthy = running AND RestartCount 0 AND HTTP status 100-399', cmd.includes('"RestartCount": 0,') && cmd.includes('-ge 100') && cmd.includes('-lt 400'));
  t.check('unhealthy -> logs to stderr, restart policy reset to "no", exit 97', /HEALTHCHECK_FAILED/.test(cmd) && /docker logs --tail 30/.test(cmd) && /docker update --restart no/.test(cmd) && /exit 97/.test(cmd));
  t.check('no n8n expression braces inside the command', !cmd.includes('{{'));
  if (!bash) { console.log('  skip shell checks (bash not found)'); t.done(); return; }
  const tmp = path.join(os.tmpdir(), 'cf_build_cmd_' + process.pid + '.sh');
  fs.writeFileSync(tmp, cmd);
  let syntaxOk = true; try { execFileSync('bash', ['-n', tmp], { stdio: 'pipe' }); } catch (e) { syntaxOk = false; }
  fs.unlinkSync(tmp);
  t.check('bash -n: command is valid shell', syntaxOk);
  // evaluate the exact health condition from the command with sample values
  const cond = (cmd.match(/if \[ -n "\$hc_run" \] && \[ "\$hc_code" -ge 100 \] && \[ "\$hc_code" -lt 400 \]/) || [])[0];
  t.check('health condition found in the command', !!cond);
  const healthy = (code, running) => { try { execFileSync('bash', ['-c', `hc_run=${running ? 'x' : ''}; hc_code=${code}; ${cond}; then exit 0; else exit 1; fi`]); return true; } catch (e) { return false; } };
  t.check('200 and 307 (redirect) are healthy', healthy(200, true) && healthy(307, true));
  t.check('404, 500 and 000 (no answer) are unhealthy', !healthy(404, true) && !healthy(500, true) && !healthy('000', true));
  t.check('HTTP 200 but container not running (or restarted) is unhealthy', !healthy(200, false));
  t.done();
})();
