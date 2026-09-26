# Engineering log (curated)

Seventeen changes to the live pipeline, each in the order *problem → evidence → change → measured effect*.
Dates are 2026. Infrastructure details are left out on purpose.

1. **Secret scan before the GitHub push (Sep 13–19).** Generated code was pushed unchecked. Added a pattern catalog with
   placeholder detection and a block path; proven with a positive control. It only became *effective* with item 8.
2. **Central configuration (Sep 18).** Host addresses and the GitHub owner were hard-coded in several nodes. One `Config`
   node now holds them; secrets stay in credentials.
3. **Race condition in the chat answer (Sep 18).** With several parallel branches, whichever finished last became the
   answer. Merge gates (`chooseBranch`) now define one final node; both arrival orders were forced in isolation.
4. **SSH key clean-up (Sep 18).** Removed a wrong and an obsolete key; a further trust key was removed later after review.
5. **Feedback / bugfix loop (Sep 18).** A QA rejection now produces targeted patch instructions; only the affected side is
   regenerated, at most twice. Confirmed live with a real async bug.
6. **Compliance agent (Sep 18).** A deterministic PII pre-filter decides whether an LLM assessment runs; never blocking.
7. **Legal scan (Sep 19).** Third-party resources loaded by the app are reported with a note on IP transfer.
8. **Binary read bug (Sep 19).** In filesystem mode an item carries only a marker; three scans had been reading the marker
   and reporting "clean" for everything. Switched to the official helper; tests now create real filesystem binaries and
   keep a control station with the old access. Lesson: *"nothing found" is not proof that anything was read.*
9. **Robust parsing of model output (Sep 19).** Global fence stripping broke README code blocks and some outputs failed
   `JSON.parse`. A shared extractor (strict → tolerant per file → plausibility) rescued all four historical failures; a
   bounded QA retry covers unreadable verdicts.
10. **Output limit (Sep 23).** Two developer outputs were cut off by the token limit, most likely because hidden thinking
    tokens count against it. Doubled the limit; a rebuilt failure case completed.
11. **Deploy health check (Sep 23).** An app was reported as live with a link while its container crashed 0.4 s after start.
    Build and run became one fail-closed chain with a health check on `/`; the broken app from that run is now a test fixture.
12. **Operations clean-up (Sep 24).** Restart policy `unless-stopped` for all app containers; the health check additionally
    requires `RestartCount` 0 because a late-crashing test app passed without it.
13. **Developer prompts + spec hand-over (Sep 24).** Analysis of 24 runs: frontend mocks, embedded HTML, CORS wildcards and
    unsafe `innerHTML` explained 4 of 8 QA rejections and 18 of 19 silent QA edits; the developers never saw part of the spec.
    New rules + full spec hand-over. Regression 10/10: those patterns 0/10, QA code edits 19/23 → 2/10.
14. **QA only judges (Sep 24).** The QA still added CORS in 2/10 runs. Now the deployed code is always the developer version;
    the QA returns a verdict with patches. Regression 10/10: deployed = developer code byte-identical 10/10, QA output −91 %.
15. **Platform rules for the Product Owner (Sep 26).** 25 of 45 specs contradicted the platform (CORS, static-file mounts)
    and 15 of 33 discovery answers offered Node.js. The PO prompt now contains the same rules plus "say it openly and
    offer the platform solution"; a drift check keeps the copies identical. Isolated test with a control station and a
    request that explicitly asks for Node.js + CORS; regression 10/10 with 0 contradictions and 0 off-platform options.
16. **Frontend mock scan (Sep 26).** Two mock kinds identified (fetch override, fabricated data in error paths); prompts had
    already brought them to 0 of 31 runs, the scan is the safety net. New informative node, isolated test with 82 checks,
    live control run clean. Lesson: n8n throws a message-less error object for missing binaries; error texts are built
    defensively.
17. **Legacy clean-up (Sep 26).** The scan found mocks in 13 of 29 older apps (plus 3 found by hand review). They were
    archived and removed; 12 apps remain, none with a detected mock.

Two rules came out of this log and apply to every change: *verify live results in the raw execution record and the running
app, never only in the chat answer*, and *fix the success criteria before the regression runs*.
