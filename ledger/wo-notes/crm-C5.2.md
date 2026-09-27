# C5.2 — six hunters (read-only · Opus · 27 Sep 2026) — ✅ ACCEPTED by controller
| lens | report | BLOCKER | MAJOR | MINOR | reproduced |
|---|---|---|---|---|---|
| L1 authz & scope | crm-C5.2-L1.md | 0 | 3 | 6 | portal endedAt (QC2) |
| L2 money & numbers | crm-C5.2-L2.md | 0 | 3 | 4 | 5 probes (QC2) |
| L3 queues/cron/races | crm-C5.2-L3.md | 0 | 4 | 4 | 4 probes (QC2) |
| L4 public surface | crm-C5.2-L4.md | 0 | 3 | 6 | inbound spoof · SSRF (QC2 in-process) |
| L5 PDPA & leakage | crm-C5.2-L5.md | 0 | 4 | 9 | erase residue (QC2) |
| L6 business & UI/UX | crm-C5.2-L6.md | 0 | 5 | 11 | 4 probes (QC2) + 4 shots |
| **total** | | **0** | **22** | **40** | all throwaway tenants deleted |
Acceptance basis (brief C5.2): six read-only lenses run with the §11.5 prompt, ≤3 in parallel, every finding with file:line + scenario + CONFIRMED/PLAUSIBLE + "checked and sound" lists. Verification/pinning = C5.3 (qc-crm-c5.3.mts, c53). Owner questions raised: Q14 won-value basis (P10) · Q15 /l open redirect policy (P11).
Prod exposure flagged for C5.3 to confirm: L3 M3 core outbox lease (duplicate webhooks) · L4 M2 core webhook SSRF guard.
