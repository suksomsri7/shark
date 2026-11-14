# HR-PREPROD-1 — builder notes (15 Nov 2026)

Tree `/root/projects/shark-hr-l4` (lane 4) · branch `wip/hr-preprod-1` from e0de57dd8 (base `session/hr` a4e2fb4ae) · brief `ledger/hr-briefs/hr-brief-PREPROD-1.md` (both rulings sections) · oracle `scripts/qc-hr-preprod-1.mts` + lib (57 checks, not edited) · green table `hr-PREPROD-1-green.txt`.
No migration · `payroll-rules.ts` byte-identical · no settings writer added.

## 1. What changed where
| req | file | change |
|---|---|---|
| R1 | — | nothing (oracle GREEN pins) |
| R2 | `payroll.ts` | `strandedAdjustments` + `refundsBehindOf`: REFUND rows with `sourceRef refund:…`, PENDING/APPROVED, unbound, period without a live run, period ≤ `giveBackWindowInTx().lastCovered` ⇒ listed with `reason: "REFUND_BEHIND"` (old rows keep their 8 keys). `moveStrandedAdjustment`: such a row (re-checked under P lock) moves to the first run-less period after max(p, lastCovered) (`giveBackPeriodOf` rule); target after `endPeriod` ⇒ fixed text `REFUND_BEHIND_ENDED`, nothing written. |
| R2 | `payroll-ui.tsx` | one fixed line under "รายการค้าง" when a REFUND_BEHIND row is shown; PRIV-2 filter line unchanged. |
| R3 | `leave.ts` | `reserveLeaveInTx` skips the balance refusal for day-based SICK leave of a quota policy · `leaveApprovalCheckInTx` → `sickSplitInTx` (paid = min(days, L3-available) floored to ½ day; unpaid = rest; `from` = first counted day (`leaveDaysInTx` day set, new `meta.counted`) not fully paid; `half`) · `leaveLedgerInTx` USE = −paid (0.0 allowed) + note `unpaid:<d.d>;from:<day>[;half]` (fully paid ⇒ note null) · second gate `leaveUnpaidPartRefusalInTx` (unpaid days' months with an APPROVED/PAID run ⇒ `CORRECTION_TEXT.paid`) on chain apply (→ CANCELLED + PAID) · reader `leaveSplitsIn(db, ids)` / exported `leaveSplitOf(ctx, ids)` → `{ paidDays, unpaidDays, unpaidFrom }`. |
| R3 | `service.ts` | `decideLeave`: second gate after the check (refused ⇒ `HrLeaveDecisionError`, PENDING, no USE) · owner auto-approve: `sickSplitInTx` + second gate (refused ⇒ tx rolled back, no row). MONEY-2 gate untouched and still first. |
| R3 | `work-entries.ts` · `work-entries-rules.ts` | `WorkLeave.unpaidTenths?` (per day: 0 before `from`, 5/10 on `from`, 10 after) — paid policy minutes split into paid/unpaid ⇒ `unpaidLeaveMin` ⇒ UNPAID_LEAVE (run rules unchanged). Day hash carries the per-day value **only for split leaves** (all other hashes byte-same). v1 unchanged (Q4). |
| R3 | `privacy.ts` · `ui.tsx` · `self.ts` · `self-ui.tsx` · messages | list items gain `paidDays`/`unpaidDays` only for split leaves (`LeaveItemSplitDto` in privacy.ts; privacy-shared.ts untouched); history line and "ของฉัน" show the unpaid days (`hr.self.unpaidDaysN` th+en). |
| R4 | `scope.ts` | one constant `PAY_SCOPE_NO_ACCESS_TEXT`. |
| R4 | `payroll-actions.ts` | `payTarget(…, pay = true)` for decide / cancel / move: limited viewer + (missing row \| home not in pay scope) ⇒ `HrBranchError(PAY_SCOPE_NO_ACCESS_TEXT)` (same bytes as a missing id); all-branch path unchanged. |
| R4 | `payroll.ts` | `payScopeBlocked(ctx, scope, employeeId)` (only `inPayScope`) used by `decideAdjustmentAs` (→ `PAY_SCOPE_NO_ACCESS_TEXT`), `setAdjustmentConsent` and `giveBackClaim` (→ their existing not-found text). |
| R4 | `stock-charge.ts` | `chargeGate`: `inPayScope` on the employee's home ⇒ `T.noAccess` (= its missing-row answer). |
| R5 | `settings.ts` · `leave.ts` | `updateLeavePolicy`: `paid` changes and `leavePolicyPaidLockedInTx` (an APPROVED leave of the policy touches a month with an APPROVED/PAID run) ⇒ `SETTINGS_TEXT.paidLocked`, nothing written (before the update, under the existing row lock). |
| R6 | `ledger/HANDOVER-H3.md` §3 | row `13a (HF-SSO-M2)` directly under row 13 (a table row, so the table stays one table). |

Design limits (for the reviewer): sick split only for day-based leave (hourly SICK leave keeps the balance refusal); paid part floored to ½-day steps so the unpaid boundary is a whole/half day.

## 2. §F self-check
1 n/a (no new page/route) · 2 ✔ tx bodies use the tx client only (new helpers take the caller's tx; `refundsBehindOf` is a read outside any tx) · 3 ✔ limited `[]`/list scope via `hrScopeOf`/`isAllBranches`/`inPayScope` only · 4 ✔ fixed Thai texts, no ids/names/periods · 5 ✔ no new tx options · 6 n/a no migration · 7 ✔ no second connection under a lock · 8 n/a · 9 n/a no new event · 10 ✔ files ⊆ brief list (+ messages, ledger, oracle edits below).

## 3. ORACLE-EDITs (explicit allowlist style, every hunk marked `ORACLE-EDIT (HR PREPROD-1 · controller)`)
- `qc-hr-h1.3.mts` S6.1 `PAY_MARKED` + `"HR PREPROD-1": 3` (3 × sourceRef: refund-behind reader where · move select · move REFUND check).
- `qc-hr-h3.2.mts` S1.8: `PP1_S18` explicit file set; a listed file passes when every hunk carries `HR PREPROD-1`.
- `qc-hr-h3.4-lib.mts` S1.6: `PP1_S16` + `pp1Only` (same rule).
- `qc-hr-h3.6.mts` S1.6: `PP1_S16` + `pp1Only` (in base only).
- `qc-hr-h3.9.mts` S1.5: `PP1_S15` + `pp1Only` (in base only).
- `qc-hr-h4.3-lib.mts` S1.6: `PP1_ALLOW` (leave · privacy · self · payroll · payroll-actions · payroll-ui · the edited oracles) + `PP1_OWN` (the two own oracle files by name — the lib carries no source mark).
- `qc-hr-priv-2.mts` S4/S5 (no in-base guard): `PP1_SRC` / `PP1_OR` / `PP1_OWN` + `pp1Ok` — listed src files and edited oracles with every hunk marked, own oracle files by name.
- money-2: no edit (n/a in base).

## 4. Open items / debts
- Q4 (ruled): engine v1 never deducts unpaid leave — debt row stays.
- API `hr/api/**` is frozen; it passes the leave DTO through, so split leaves also carry `paidDays`/`unpaidDays` there.
- **Not green — needs a ruling:** `qc-hr-h3.8` S1.13 pins the sha256 of `privacy.ts` and `self.ts` ("later tickets re-take consciously"). h3.8 is not on the pre-authorised list, so it is not edited. Proposed re-take (the R3 leave-DTO split fields + "ของฉัน" unpaid days, all marked HR PREPROD-1): privacy.ts `ea0017fa…` → `6b8e3f05207e687f9e2acf7302e821fddf72cf0d004c68f3db2693eeb0d4d47e` · self.ts `d63dd889…` → `6a54690e198fdb1bf6b24cf2e31b9faa00ad2087caff03cd81feea3afe987fec`. (Alternative: drop the self.ts/self-ui.tsx display — the oracle does not need it; privacy.ts is needed by R3.3.)
