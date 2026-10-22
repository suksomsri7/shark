# H0.5 reviewer round 1 — head f2c811be (8 Oct 2026 ~17:30Z) — verdict ACCEPT WITH NOTES
Controller ruling: fix F2 F3 F4a F5 F6 in builder round 2 (prompt scratchpad/h05-builder-r2.md); F1 = gate (full typecheck must be green on the head/merged tree); F4b, D3, F7, F8 → debts; F9/F10 noted.

1 MAJOR (gate) full `pnpm typecheck` never completed on f2c811be (builder ×2 timeout; scoped tsc only).
2 MINOR `verifyPin` pin.ts:190-193 `take:3` on OR[pinHash,pinCode] without ordering ⇒ ≥3 legacy plain rows sharing a PIN can push out the hashed holder (rollout-transient). Fix: hash-first findFirst, then plain lookup take:2.
3 MINOR `verifyPin` pin.ts:180-184 HR-system list lacks `active:true` and `take:50`.
4 MINOR R4: retry at pin.ts:288 clears pinHash/pinSetAt but not pinCode (fix); `setEmployeeActive` audit has null actor (debt); D3 restore returns nothing ⇒ "ต้องตั้ง PIN ใหม่" not shown (debt, PinField shows "no PIN").
5 MINOR backfill hashes non-`^\d{4,6}$` legacy values ⇒ "has PIN" that can never verify. Fix: clear + list as `invalid`.
6 MINOR runbook: (a) migration before code; (b) one-way after backfill (rollback ⇒ kiosks "no PIN"); (c) pepper never on a command line; (d) pepper non-empty ≥32 or env.ts fails at boot; (e) Preview/Production share the pepper if they share a DB.
7 NOTE security (P1.15): tenant-wide 120/60 s on 4-digit PINs ⇒ blind guess hits someone in ~4 min with 20 holders; tenant bucket = lockout vector. Contracted numbers; P1.15 adds per-device/user limits + lockout; consider 6 digits for approvers (P3.5).
8 NOTE: createEmployee audit null actor · createEmployeeAction ignores pinSet:false (form has no PIN field) · listEmployees returns full rows (pinHash reaches server components; F16.5 matches names only) → explicit select later.
9 NOTE timing reds cannot hide a defect in this diff: S3.2 uniqueness decided by the index only; h0.3 S4.8 +1 sequential UPDATE, no deadlock, final ok 1 row at ~3.0 s; S2.4 limiter code unchanged; S4.3 confirm "10 ok IN · 1 row" (controller run: INININININ ×2, 1 row ✓); h0.1/h0.2 payroll races untouched. One quiet-machine rerun requested.
10 NOTE merge: merge-tree 103fde95×f2c811be clean; migration order fine; partial index not in Prisma schema (migrate dev would propose DROP — crm_v2_c precedent); notes/green log contain no PIN/hash/pepper; brief's 13 PIN holders is really 12 (HQC wins).
