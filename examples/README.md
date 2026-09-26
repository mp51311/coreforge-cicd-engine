# Examples (read-only reference, not part of `npm test`)

These files show the working pattern used for every change to the live pipeline. They were copied from the project with
paths adapted to this repository; comments are in German (the project language). **They need a running n8n instance**
and are not executed by `npm test`.

| File | Pattern |
|---|---|
| `po_facts_patch.js` | Patch module: exact string replacement with hard preconditions (old code must occur exactly once), second application aborts. Shared rules come from `src/platform_facts.js`. |
| `mock_scan_patch.js` | Patch module that adds a new Code node generated from `src/mock_scan.js`, rewires one branch and changes the final answer in a guarded way. `MOCK_SCAN_CODE` is byte-identical to the `Mock_Scan` node in `workflow/`. |
| `mock_scan_live_patch.js` | Live patch: fresh GET → preconditions (expected live state, values == tested reference) → dry run; only with `--apply`: backup → `PUT` → fresh `GET` and verification that nothing else changed. Expects `N8N_BASE_URL`, `N8N_API_KEY`, `WORKFLOW_ID`, `EXPECTED_UPDATED_AT` and reference files under `examples/reference/` (not shipped). |
| `test_mock_scan_isolated.js` | Isolated test: builds throw-away workflows (`TEST_…_DELETE_ME`) with the real n8n runtime and filesystem binaries, runs five scenarios in both arrival orders at a merge gate, compares against control stations (old code), then deletes the workflows. Expects `N8N_BASE_URL`, `N8N_API_KEY` and a workflow GET as argument. |

Never run the live patch against a workflow you have not backed up.
