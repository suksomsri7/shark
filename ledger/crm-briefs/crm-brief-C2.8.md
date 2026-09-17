# C2.8 — Lead scoring
Read `crm-brief-COMMON.md` first. Contract: CRM-RUN §2 "C2.8". Spec: blueprint §5.7, §11.5, mockup 05 (score).

## Deliverables
`scoring.ts`: 8 seeded system rules + CRUD · `onEvent` consumer for every event a rule references (conditions; `maxPerDay` per rule per contact enforced with ONE conditional statement — not count-then-insert; `CrmScoreLog`; `score` via `increment`; band recalculation; `crm.score.changed` / `crm.score.threshold` when a band boundary is crossed — emitted once per crossing) · `decay` daily (expire logs in claimed batches, score never < 0) · `explain` (last 3 reasons) · `recompute(contactId | all, {dryRun})` (all = danger) · wire ADJUST_SCORE action (C2.1) and form `scoreOnSubmit` (C2.6) · UI rules page + reasons on card/360.

## Acceptance (oracle `qc-crm-c2.8`)
CRM-RUN S1–S7 (20).
X3 50 parallel "email opened" events with `maxPerDay=3` → exactly 3 logs and +3×points; score equals Σ non-expired logs · X4 same event twice/parallel → one log (key: ruleId+eventKey) · X5 decay overlapping runs → each log expired once · X9 recompute-all requires confirm + reason, audited · X1 logs of a contact the actor cannot see are not readable.
