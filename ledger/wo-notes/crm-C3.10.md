# C3.10 — closing regression `pnpm qc:all` on QC1 (controller note, 7 Oct 2026)

Lane agent (Opus) ran steps 1–3 and launched step 4, then died on the session quota limit (429, 14:53 UTC). The controller (Fable) wrote this note from `/tmp/c310-logs/` + per-suite logs in `/tmp/claude-0/qc-all/`; the systemd unit kept running on its own.

## Setup (all on QC1 `.env.qc` host `ep-plain-art…`, never prod)
- Tree: main tree `/root/projects/shark-crm` (session/crm) HEAD `725f0e0a`; server `:3215` rebuilt from the same HEAD (`READY 12:10 725f0e0a ai=mock webhook-private=on`).
- Step 1 reseed QC1 from the main tree (`/tmp/c310-logs/reseed.log`) — the acc-v2 seed **fails at the real clock** (seed asserts overdue totals that drift with today's date: `พ้นกำหนด ได้ 13640000 ต้องการ 12840000`, `scripts/seed-acc-v2-qc.mts:135`). Lane workaround `run-accv2-reseed-c310b.sh`: re-ran only the acc-v2 seed with its JS clock shifted to 2026-09-30 09:00 +07 (`shift-clock.cjs`), then the 3 oracle generators at the real clock, DRAIN, backup of `qc1-expected` (exit 0, 12:00 UTC).
- Step 4: `run-qcall-c310b.sh` → `pnpm qc:all` (380 suites, serial) inside unit `crm-qc-all-c310b`, env `CRM_V2_SWITCH=all QC_BASE=http://127.0.0.1:3215 SHARK_AI_MOCK=1`. Attempt 1 self-deadlocked (double gate lock) and was killed after 1 min; attempt b started 12:11:23 UTC.

## Progress at 15:35 UTC
152/380 done · 34 ❌ · still inside `crm-buttons` (full 5 users × 2 viewports runner, est. 7.5–8.5 h, since ~12:37 → expected to finish ~20:00–21:00 UTC). Suites after it: crm-c0.2 … (remaining CRM suites, hr, inventory, kanban, member, pos, …).

## Reds so far — triage (controller)
All 34 reds are `acc-v2-*` (27) and `account-api-*` (7). **No CRM suite red so far.** One root cause + one known time bomb:

1. **acc-v2 seed time bomb inside `acc-v2-contact-merge` (root cause of 33 reds).** The suite ends with "♻️ คืนสภาพชุดข้อมูล QC (seed ใหม่ + เขียนเฉลยใหม่)" → re-runs `scripts/seed-acc-v2-qc.mts` at the **real** clock → the seed throws the same overdue-total assert (`qc-acc-v2-contact-merge.log:87–101`) after it has already re-created tenant `SIAM DIVE QC` (QC1 `Tenant.createdAt` 12:21:06 UTC, new ids) and before it rewrites `scripts/acc-v2-expected.json` (still the 12:00 shifted-clock seed, ids `cmungjw…`). Every later acc-v2 / account-api suite compares the new DB against the stale expected → `acc-v2-seed-check` A1–A5 null/{} , `acc-v2-home` "เฉลยไม่ตรงกับ DB ก้อนนี้", `acc-v2-contacts` 0/63, `account-api-read-*` "ไม่พบระบบที่จะผูกคีย์ในร้านนี้", `account-api-settings` S1.x (page cannot resolve the system). Same shape as the known member-seed trap (memory `reference_shark_qc_member_seed_wipes_crm`), accounting flavour.
2. **`acc-v2-coa` T15** (red at 12:20:50, *before* contact-merge) = known "ข้อสอบเน่าตามเวลา" (CRM-RESUME line 38, 26 Sep check).

Owner of the fix: session/accounting (`scripts/seed-acc-v2-qc.mts` must pin its own clock / compute overdue from `QC.today`, and `qc-acc-v2-contact-merge` must not restore via the real-clock seed). Not a CRM regression; CRM did not touch these files (C6.0 merge brought accounting hotfixes only via main).

## Progress at 19:38 UTC — 276/380 · crm-buttons done (18 256 s) · CRM reds triaged (controller)
`crm-*` 44 suites: 41 ✅ (incl. crm-forms 669/0, crm-v1, crm-buttons "passed" at suite level) · 3 ❌ real-content + 3 ❌ env-guard. `hf-*` 7: 6 ✅ (apiv1-scope 143, hr-privacy 194, inventory-atomic 143, inventory-authz 118, pos-page-authz 56, reports-authz 79) · hf-o23 = QC4-only guard. New non-CRM red: `kanban-k2.3` 15/17 (S3.2 dnd-kit-from-member + S3.6 shots absent — both pre-existing, CRM-RESUME line 38).

| suite | finding | triage | class |
|---|---|---|---|
| crm-c5.3, crm-c51fix-equiv, crm-perf | "QC2 only (ep-cool-shadow)" guard, 0 checks run | by design on QC1; their QC2 results stand (C6.0 gate) | env-guard ✅ |
| hf-o23 | "QC4 only (ep-frosty-lab)" guard | by design; owner's POS session runs it | env-guard ✅ |
| crm-c1.2b S8.2 (92/93) | OpsEvent WARN already at object 24 (80 %) — oracle expects none ≤ 29 | `limits.ts` AUDIT-CLASS X8 / C3.9 §11.9: warn once past 80 % (24/30). Oracle predates it. | **stale oracle → fix c1.2b** |
| crm-c3.7 X1.3 | API tasks 113 vs raw SQL 120 for thana | QC1 count: thana has exactly 7 open NOTE rows in the window; `mobile.todayTasks` uses `activityStatusWhere` (C5.4-E L6-m1 "ไม่นับโน้ต") — oracle SQL still counts NOTE | **stale oracle → fix c3.7 (exclude NOTE)** |
| crm-c3.7 S1.1 / S1.6 / S2.2 / S2.4 / S2.6 | 390-px summaries + S2 fixtures dated 2026-10-01, newest UI 2026-10-07 09:34 (linkpolicy) | evidence stale by design of the freshness pass; S1.1's "email-thread 404" is read from the 1 Oct summary, not a live result | **re-run `visual-crm.mts` 3.7 pass + S2 fixtures on this build** |
| crm-c2.1 S6.2 | child `qc-member-m3.3` unexpected M3.3-S4.1/S4.2 (holdout 50 % hash set) | member-side; wait for the direct `member-m3.3` run later in this qc:all before classifying | pending (member) |
| crm-buttons (suite ✅, verdict.py **FAIL** 7455/7771) | dead 8 · wrongExpect 8 · hiddenLeak 28 · consoleErrors 8 · VACUOUS 272 (standalone run has no run6 base to pair with) | see rows below | mixed |
| ↳ hiddenLeak 28 = customer lock-out HTTP 200 on 14 staff pages | `qc-crm-buttons.mts:2915` runs all 5 roles in ONE default browser context; `mintSession("customer")` only ADDS the portal cookie, the previous staff role's `shark_session` stays in the jar → staff page served as thana. run6 passed lock-out because `run-chunks` ran customer in its own process. Portal lock-out itself unproven either way here. | **runner bug (cookie isolation) → fix + re-run `--user customer` standalone** |
| ↳ wrongExpect crm-auto-rule-toggle (manager) | server refuses: "กฎนี้ทำงานกับ…ทุกรายการ แต่บัญชีนี้มองเห็นเฉพาะบางส่วน" | new guard from C5.5-fix1 `42acc952` (RV-6: automation verdict = manual doors); registry row still expects a mutation for manager | **registry debt → expect inline-error for manager (or hiddenFor)** |
| ↳ wrongExpect deal-card-* drag (owner/manager/thana; nok passed) | no write request during drag | shot shows the board; cause unclear (drop target / stage layout) — re-run `--page /deals` standalone before touching code | re-check |
| ↳ dead crm-auto-action-field (owner/manager) | select value does not change after fill | opener SET_FIELD; option list in fixture? re-run standalone | re-check |
| ↳ dead crm-commission-rule-row-* / approve-selected (manager) | rows not found for manager | registry says roles [owner] only yet reported for manager → `needs` probe / role mapping; re-run standalone | re-check |
| ↳ consoleErrors 8 | `/api/files/<id>` 404 on contact page (attachment blob missing on QC1 after reseed) | environment; UI shows the "ไม่พบไฟล์" block (fix13) | env ✅ |

## Verdict rule for closing C3.10
- CRM suites (crm-*, crm-buttons) must be green or triaged to a CRM cause.
- acc-v2/account-api reds attributable to cause 1/2 above are **environment debt**, recorded for session/accounting, not counted against CRM.
- Any other red → triage per suite log in `/tmp/c310-logs/suites/` (copied there by the runner at the end).

## Resume (after the unit finishes)
1. `tail -2 /tmp/c310-logs/status.txt` → `step4 qc:all finished rc=…`; reds: `grep '❌' /tmp/c310-logs/qc-all.log`.
2. For each red not in the acc-v2/account-api set above: read `/tmp/c310-logs/suites/qc-<name>.log`.
3. `crm-buttons`: verdict via `python3 scripts/pending/c42b/verdict.py` on its run dir (see `crm-C4.2.md`); expected 184/184-class result as run7.
4. Record the final table below, update CRM-RESUME §0.23 + MASTER-PLAN (C3.10 ✅ → 51/53 only if no untriaged CRM red), copy `/tmp/c310-logs` evidence into the repo (`ledger/evidence/c310/` text logs only) before the VPS tmp is cleaned.

## Final table
(pending — filled when the unit finishes)

## Lane work (builder) — resumed 22:05 UTC after container restart (wip/crm-c310)
Worktree `/root/projects/shark-crm-c310`, QC1 (`.env.qc` host `ep-plain-art`) only, runs via `/tmp/c310-logs/lane/run-suite.sh <log> <script>` (= QC1 host guard + `with-gate-lock.sh pnpm exec tsx …`, env `QC_ENV_FILE=.env.qc CRM_V2_SWITCH=all QC_BASE=http://127.0.0.1:3215 SHARK_AI_MOCK=1`). Server :3215 untouched (health 200). `scripts/crm-expected.json` = QC1 seed answer key copied from the main tree, kept LOCAL only (never committed).

1. **c1.2b S8.2 — stale oracle FIXED.** Oracle now asserts: 0 WARN while ≤ 23 objects · exactly 1 `crm.limits` WARN at object 24 (80 % of 30, flag `crm.limits:<systemId>:objectsWarn:<month>:30` = `limits.ts warnOnce`) · ≥ 1 WARN after 35 · every WARN message Thai · `crm.limits` WARN count stays 1 after 35 (dedupe). `run-suite.sh c1.2b-rerun scripts/qc-crm-c1.2b.mts` · 22:08:34 UTC · **93/93** ✅ (`/tmp/c310-logs/lane/c1.2b-rerun.log`).
