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
