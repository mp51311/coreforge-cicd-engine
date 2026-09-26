# Architecture

The whole engine is one n8n workflow (57 nodes, `workflow/coreforge-cicd-engine.sanitized.json`). n8n runs parallel
branches one after another (`executionOrder: v1`, order by canvas position), so every place where branches meet again is
an explicit merge gate. The chat trigger answers with the output of the last node that ran, which is why every additional
branch is chained into the feed of an existing consumer instead of being left open.

```mermaid
flowchart TD
  T([Chat trigger]) --> PO[Product Owner<br/>+ memory]
  PO --> IF{GO?}
  IF -- no --> T
  IF -- yes --> FDP[Format_Dev_Payload<br/>spec, project slug, platform_facts]
  FDP --> BE[Dev_Backend] & FE[Dev_Frontend]
  BE & FE --> M[Merge] --> AGG[Aggregate_Files<br/>file extractor · revision counter]
  AGG --> QA[QA_Gatekeeper<br/>judges only]
  QA --> IF1{APPROVED?}
  IF1 -- no --> CRL{retries left?}
  CRL -- yes --> BUG[Feedback_Bugfix_Agent] --> FCP[Format_Correction_Payload] --> BE & FE
  CRL -- no --> REJ([Reject answer])
  IF1 -- yes --> CE{QA output readable?}
  CE -- no, retry < 2 --> QA
  CE -- no --> PF([Parse-failure answer])
  CE -- yes --> PDF[Prepare_Disk_Files<br/>developer code + QA README/.env.example]
  PDF --> UP[SSH upload] & PC[Port counter]
  UP & PC --> BCB[Build_Command_Builder] --> BR[Build_And_Run<br/>docker build && run && health check]
  BR --> OK{exit 0?}
  OK -- no --> REJ
  OK -- yes --> CFG[Config] --> SUC[Success text] & REPO[Create GitHub repo]
  REPO --> GATE[Sync gate<br/>waits for files]
  GATE --> SS[Secret_Scan] --> PUSH[Push or block] --> GO[GitHub outcome]
  GATE --> CS[Compliance_Scan] --> CA[Compliance agent, only on indicators] --> CO[Compliance outcome]
  GATE --> MS[Mock_Scan<br/>passes files through] --> LS[Legal_Scan]
  SUC & GO --> G1[merge] --> G2[merge]
  CO --> G2 --> G3[merge]
  LS --> G3 --> FIN([Final answer: link + warnings])
```

## Key design decisions

- **The QA judges, it does not rewrite.** Deployed code is always the last developer version. The QA returns APPROVED or
  REJECTED with a concrete patch; only README and `.env.example` come from the QA. This made the QA's effect measurable and
  cut its output by 91 %.
- **One source for platform rules.** `platform_facts` (same origin, `FileResponse` for `/`, no mocks, safe DOM updates,
  no polling unless asked, fixed port …) is built once and passed to developers and QA; the Product Owner prompt contains
  a verbatim copy. A drift check (`src/platform_facts.js`) keeps both places identical.
- **Deterministic before LLM.** The compliance LLM only runs when a deterministic pre-filter finds indicators; secrets,
  third-party loads and mocks are checked by code, not by a model.
- **Fail-closed where it protects, fail-loud where it informs.** Health check and secret scan block; compliance, legal and
  mock scan never block but make read errors visible.
- **Binary files are read the official way.** n8n keeps binaries on disk; the item only carries a marker, so every scan
  reads through `helpers.getBinaryDataBuffer` (reading the marker instead once made all scans silently "clean").
- **Central configuration.** Host addresses and the GitHub owner live in one `Config` node; secrets live in n8n credentials.

## Runtime

| Component | Where |
|---|---|
| n8n | LXC container on Proxmox VE |
| Generated apps | one Docker container per app on a separate VM, dynamic port, restart policy `unless-stopped` |
| Code | one private GitHub repository per app |
| Models | Gemini Flash via n8n LangChain nodes |
