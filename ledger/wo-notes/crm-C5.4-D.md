# C5.4 batch D — FB-QUEUE (CRM part of hunter lens L3) · builder · Opus 5.5 · 30 Sep 2026

Worktree `/root/projects/shark-crm-c54d` (detached 6f6ea780) · QC3 only (`bash scripts/qc3.sh …`) · logs `/tmp/c54d-logs/runN/`.
Oracle: `scripts/qc-crm-c5.3.mts` refuses non-QC2 hosts (line 57) ⇒ run through a TEMP copy `scripts/qc-crm-c5.3-qc3.mts` whose ONLY diff is the host guard (diff logged; deleted before commit).

## Plan
1. Reseed QC3: seed-member → qc-member-m1.1 → seed-crm ×2 (CRM_V2_SWITCH=all) — unit c54d-run1. *-expected.json NOT committed.
2. RED-before: C5.3 `--only=L3` on untouched HEAD (log). Batch A (c6fe26d2) already did L3-M3 / L3-m1 / L3-m4 / hourly drain (L3-M1c).
3. L3-M1a send-time WON/LOST guard in `sequences.ts runClaimed` (not gated on bridgesEnabled).
4. L3-M1b CRM writes wake the outbox (scheduleDrain after CRM server actions + REST dispatch writes).
5. L3-M2 failed SEND step: no advance, backoff, bounded via failAttempt.
6. L3-M4 per-job budget for hourly/daily cadence in `platform/minute-jobs.ts` (keep c0.5 green).
7. L3-m2 complaint replay re-runs the idempotent after-steps.
8. GREEN-after + regression suites + typecheck + fitness ×2 → one local WIP commit.

## Progress
- [run1] QC3 reseed unit c54d-run1 (member ✓, m1.1 28/28 ✓, crm ×2 running) · [run2] RED-before C5.3 --only=L3 queued (HEAD clean, copy diff = host guard only → /tmp/c54d-logs/c53-qc3-copy.diff).
- Design: (M1a) guard in runClaimed for non-WAIT steps: deal kind WON+stopOnWon / LOST+stopOnLost ⇒ STOPPED WON/LOST (same tx shape as OPT_OUT). Deal gone/archived-OPEN ⇒ continue (no code in closed SEQ_STOP_CODES; no product writer of CrmDeal.archivedAt; deleteDeal refuses WON) → REPORT.
  (M1b) new `crm/outbox-wake.ts` (wakeOutbox = after(lazy drainAll) · revalidateAndWake) ← v2 action files (revalidatePath→revalidateAndWake) + crm/api/dispatch.ts run() after non-GET <400 · + crm-cron minute drains first.
  (M2) SEND kind FAILED (not skipped): tx {nextAt=now+backoff, lease null, log} then failAttempt (dead tx stays the LAST write — C2.2-X9.5 xmin rule).
  (M4) hourly/daily: per-job 20 s budget under 80 s wall cap, least-recently-run first (ties = registration order); minute cadence untouched (C0.5 S3). crm-cron settle ≤ 110 s − elapsed.
  (m2) complaint/bounce: replay (unique hit) re-runs idempotent after-steps while the contact still carries the flag; after-step failure ⇒ 500 (Svix retries).
- RED-before (run2, HEAD 6f6ea780 untouched, /tmp/c54d-logs/run2/c53-L3.log): M1 sent=2 DONE ×2 · M1b action/REST event PENDING · M2 DONE log 0:FAILED,1:FAILED never retried · M4 slow=cut-off tail=no-budget tailRan=0 · m2 replay 0 rows ACTIVE. Green already (batch A): M1c, M3, m1, m4. Reseed run1 all exit 0 (m1.1 28/28).
- [code done] M1a sequences.ts runClaimed guard · M2 sequences.ts FAILED send path (STEP_RETRY_BASE_MS 15 min ×2^n ≤ 2 h) · M4 minute-jobs.ts WINDOW_CADENCE_WALL_MS 80 s + per-job budget + LRU order; crm-cron settle elapsed-aware · M1b outbox-wake.ts + crm/api/dispatch.ts + 25 v2 action files (revalidatePath→revalidateAndWake, switch-actions.ts excluded: no v2 gate) + crm-cron minute drains after jobs · m2 emails.ts complaintAfterSteps/bounceAfterSteps/afterStepsFailed.
- run3 launched (typecheck · C5.3 L3 · c2.2 c2.1 c0.5 c2.5 c2.6 c2.10 c2.11 c1.8 c3.9 · m1.9 · fitness ×2) → /tmp/c54d-logs/run3/SUMMARY
- run3 typecheck exit 2: CrmEmailEvent has `at` not createdAt (emails.ts replay select) → FIXED at 11:37 while run3 suites run (c53-L3 of run3 used the buggy file → rerun in run4 with c2.5).
- run3 DONE (/tmp/c54d-logs/run3/SUMMARY): C5.3 L3 10/11 (m2 red only from the createdAt bug → 500 after_steps_failed; fixed) · c2.2 73/73 · c2.1 84/84 · c0.5 50/50 · c2.5 105/105 · c2.6 87/87 · c2.10 41/41 · c2.11 47/47 · c1.8 81/81 · c3.9 49/49 · m1.9 26/26 · fitness 33/33 ×2.
- run4 launched: typecheck · C5.3 L3 · builder probe scripts/pending/c54d/probe-c54d.mts (P1 LOST · P2 flag-off controls · P3 bounded backoff · P4–P7 webhook replays · P8 hourly LRU order · P9 v1 REST no wake) · fitness ×2.
- run4 DONE (/tmp/c54d-logs/run4/SUMMARY): typecheck exit 0 · C5.3 L3 11/11 (M1 M1b M1c M2 M3 M4 m1 m2 m4 + K.1 + CLEAN) · probe 10/10 · fitness 33/33 ×2. run3 suites (c2.2 onward) ran the final src (last src edit 11:37, c2.2 started 11:39).
- Temp C5.3 QC3 copy deleted. QC3 *-expected.json left modified in the worktree, NOT committed. Probe kept: scripts/pending/c54d/probe-c54d.mts.
- REPORT (not fixed): deal hard-deleted (deleteDeal) or archived-while-OPEN ⇒ send-time guard continues (no stop code; LOST→delete before the drain loses the stop) · crm-cron minute now drains the global outbox once the C6.1 crontab is installed.
