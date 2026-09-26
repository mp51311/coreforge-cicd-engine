# Quality & security gates

Each gate is tested offline against the Code node of the published workflow (`tests/`). "Does not catch" is part of the
specification, not a footnote.

## Deploy health check (fail-closed)

- Build and start are one `&&` chain; a failed build never starts a container (a `;` once masked build errors as pull errors).
- After `docker run -d`: wait 2 s, then up to 5 attempts. Healthy = container running **and** `RestartCount` 0 **and**
  `GET /` answers with HTTP 100–399. Redirects are healthy, 404 is not (a missing start page is a broken app).
- Unhealthy → last 30 log lines to the chat, restart policy reset to `no`, exit 97 → reject answer, no repository.
- Why `RestartCount`: with `--restart unless-stopped`, an app that crashes a second after start can answer between two
  crashes. A test app built to do exactly that passed the naive check.
- Does not catch: broken API routes, JavaScript errors in the browser.

## Secret scan (fail-closed, before the GitHub push)

- 12 patterns in 11 categories: cloud and provider keys, GitHub tokens, private-key headers, Slack, Google API keys,
  JWTs, database URLs with embedded credentials, generic `api_key = "…"` assignments.
- Placeholder detection (`your-token`, `changeme`, `<…>`, `example` …) and relaxed rules for `.env.example`/README.
- An unreadable file counts as a finding (`scan_read_error`): the push is blocked, never assumed clean.
- Proven with a positive control inside a real filesystem binary; before that fix the scan read only the storage marker
  and reported every file as clean.

## PII pre-filter + Compliance agent (fail-loud, never blocks)

- 17 deterministic patterns in three tiers: direct identifiers, quasi-identifiers, special categories.
- Calibrated on a frozen corpus of generated apps: whitelisting personal contexts (e.g. "patient health") instead of
  blacklisting technical words reduced false alarms from 11 files to 0.
- Only when an indicator is found does the LLM agent assess it against a fixed five-criteria table.
- Does not catch: structure-only personal data without a telling field name; snake_case compounds like `patient_health_records`.

## Legal scan (fail-loud, informative)

- Finds resources the app loads from third parties (fonts, CDNs, unknown external hosts) in loading contexts only
  (`src`, `<link href>`, `@import`, `fetch(` …); ignores private addresses and plain links.
- Adds a hint about IP transfer; for Google Fonts a recommendation to host fonts locally.

## Frontend mock scan (fail-loud, informative)

Two kinds of mocks were found in the developer output before the prompt change (23 of 24 runs):

- **Fetch override:** `window.fetch` is replaced and answers locally, always or only when the backend fails.
- **Data fabricated in the error path:** the page calls the backend, but invents data in `catch` or right after it.
  The app looks functional even when the backend is broken, and a health check on `/` cannot notice.

The scan detects both, follows calls through small fetch helpers (`apiCall(url)`), and reports routes from the spec that
the page never calls. Nine deliberate traps stay silent (offline badges, a variable called `mockDatabase` holding real data,
dice animations and sound effects using `Math.random`).

- Does not catch: a faked success status without random values or mock-like names; business logic duplicated in the
  browser with the API used only as a "sync".

## platform_facts (shared rule set)

Eight rules passed verbatim to the developer agents and the QA, with a verbatim copy in the Product Owner prompt:
same origin (no CORS middleware), `index.html` served via `FileResponse`, relative API calls and no mocking, safe DOM
updates, no polling unless the spec asks, `async def`/`def`, fixed container port, and "platform_facts override any
conflicting specification item". `checkDrift()` in `src/platform_facts.js` fails if the two copies differ in any way.
