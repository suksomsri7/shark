# HR V2 — open debt register (as of session/hr 292bc5b7e · 14 Nov 2026 · ticket H3.10)

Sources: `ledger/HR-RESUME.md` (dated lines), `ledger/wo-notes/hr-*.md`, `ledger/HANDOVER-2026-11-13-HR-H2.md` §6.
Columns: id · what · risk · where · suggested fix ticket. **Gate**: `PRE-PROD` = close (or explicitly accept in writing) before the production runbook H5.3 · `NTH` = nice-to-have.
Gate is taken from the note when the note names H5.3 / "before go-live"; otherwise it is this writer's proposal (marked `(proposed)`) for the controller to rule on.
Closed items are not listed (e.g. D-F4, D-R3w/a/c/m, D-H32-unlocked-read, D-H44-leave-race verified via H2.7, X-HR.1, H3.4-YTD-OPEN = merged 292bc5b7e).

## 1. Gates that are not code debts (they block v2 in prod by design)

| id | what | gate |
|---|---|---|
| G-LAW | No `HrLawTable` row ACTIVE anywhere; activation needs accountant sign-off (HQ23) + SUPER_ADMIN script (no prod script exists — H3.3 D-5) | PRE-PROD for v2 (v1 unaffected) |
| G-NA11 | `V2_VARIABLE_PAY = false` (`hr/payroll.ts:2214`): shops with DAILY/HOURLY/commission-only staff cannot switch to v2 until NA-11 + `payType` header column + hourly-holiday setting + minimum-wage table | PRE-PROD for those shops |
| G-QCALL | `qc:all` stopped at 276/465 (13 Nov); 190 suites + svc (60) / sec (38) families not run — owed by H3.10 | PRE-PROD |
| G-SVCSEC | qc-svc-b.1 · qc-sec-s1.3b/s1.9/s1.17/s1.21 must run on their own QC DBs (refuse QC4) | PRE-PROD |
| G-VIS | Visual batch for specs 3.4 3.5 3.6 3.7 3.8 3.9 never shot; 11 H2 pages judged from summaries only | PRE-PROD (proposed) |

## 2. Phase H3 debts

| id | what | risk | where | fix ticket | gate |
|---|---|---|---|---|---|
| D-H32-punch-cap | `TAKE = 20_000` rows in the work-entry source query; noted "H3.4 phase B fixes" — constant still present | silent truncation for very large shops | `hr/work-entries.ts:69` | H5.2 money hunter verify | PRE-PROD (proposed) |
| D-H32-ui-payroll | attendance-pay sync button only on attendance month view | payroll-only viewer cannot sync | `hr/attendance-pay-ui.tsx` | H3.4 says hosted on payroll page — verify in visual batch | NTH |
| H3.2-cast | `ApproveFailCode` type narrower than returned ATTENDANCE_* codes | wrong text on refusal | `hr/payroll.ts` | H5.1 | NTH |
| H3.2-reverse-untested | reversal of a run with bound attendance rows untested | money | qc-hr-h3.4 | H5.2 | PRE-PROD (proposed) |
| H3.1-rebuild | rows rebuilt after a REVERSED run are overwritten in place | audit evidence lost (H3.4 now snapshots workDays) | `hr/work-entries.ts` | H5.2 | NTH |
| H3.1-breakMin | plannedMin uses stored row times with LIVE roster `breakMin` | stale plan until rebuild (flagged OUTDATED) | `hr/work-entries.ts` | H5.1 | NTH |
| H3.1-pendingleave-ui | pending-leave blocker shows only a count on the panel | user cannot find the day | work-entries UI | H5.1 | NTH |
| H3.3 D-1 | no back-office UI to create/activate/retire law rows | ops by script only | `hr/law.ts` | H5.3 | PRE-PROD (script at least) |
| H3.3 D-5 | no prod activation script; runbook is manual | human error at activation | `wo-notes/hr-H3.3.md` §10 | H5.3 | PRE-PROD |
| H3.3 D-10 | `globalReadDb()` helper instead of placeholder-tenant tenantDb | none today | `hr/law.ts` | core WO | NTH |
| H3.3-rawsql | raw SQL through a tenant client blocked only by fitness F16.9, not at runtime | platform-level | `core/db.ts` | platform | NTH |
| D-H34-damage-cause | no "wilful / gross negligence" cause field on damage deductions | unlawful deduction risk | H4.6 claims UI | H5.1 | PRE-PROD (proposed, legal) |
| D-H46-refund-kind | REFUND kind exists; auto-flow from `refundOwedSatang` deferred | manual refund outside payroll | `hr/stock-charge.ts` | H4.6 follow-up | NTH |
| H3.4-instalments | HQ7 instalments not built | owner feature | payroll | owner HQ7 | NTH |
| H3.4-payType-header | H3.2 header has no `payType` (all MONTHLY by construction) | needed when NA-11 flips | `HrAttendanceDeduction` | with NA-11 | NTH until NA-11 |
| H3.4-visual | UI of payroll v2 not shot (spec 3.4) | layout defects unseen | `hr/payroll-run-ui.tsx` | visual batch | PRE-PROD (see G-VIS) |
| H3.5-preset-edit | no preset edit form (create/delete only) | UX | `hr/bank-files/ui.tsx` | H5.1 | NTH |
| H3.5-bank-fields | no per-employee bank/branch code fields; bank codes beyond 4 verified missing; SCB/BBL/PCL generators; MD5 rule | some banks unusable | `hr/bank-files/*` | after HQ14 samples | NTH |
| H3.5-fullwidth | full-width ＝ not caught as formula start; payee name blank when name is marks-only (reuses ENCODING text) | CSV injection edge / wrong text | `bank-files/generic.ts` | H5.2 | PRE-PROD (proposed, security) |
| HQ14 | bank formats untested with a real bank | wrong transfer file | H3.5 | owner sample → H5.x | PRE-PROD before a shop enables a bank format |
| D-H36-account-pure | pure re-export module in account/** instead of fitness F2.2 per-file allowance | maintainability | `fitness.mts` F2.2 | accounting WO | NTH |
| D-H36-test-hook | test hook `opts.__afterIssue` stays in production code | low | `hr/filings/service.ts` | H5.1 | NTH |
| H3.6-sso-utf8 | UTF-8 SSO name cut splits decomposed Latin accents | rejected row | `hr/filings/sso.ts` | H5.1 | NTH |
| H3.6-bahttext | `bahtText(1)` wording from frozen account module | wording | account | accounting | NTH |
| H3.6-pnd-safeint | no safe-integer assertion on PND totals | float artefact at absurd totals | `hr/filings/rd.ts` | H5.2 | NTH |
| H3.6-cert-stale | 50 ทวิ "stale" is informational, no auto-reissue | outdated certificate in hand | filings | H5.1 | NTH |
| H3.6-untested | PND1/1ก/SSO 1-10 files untested with real e-Filing / e-Service | rejected filing | H3.6 | accountant trial upload | PRE-PROD before shops file |
| D-H37-legacy-run-manual-reverse | pre-H3.7 payroll journals can be reversed by hand from accounting (no marker) | books ≠ payroll | `account/journal-v2.ts` | accounting WO | PRE-PROD (proposed, money) |
| D-H37-refund-in-runless-period | give-back ∥ approve of a later period can leave a refund in a period with no run; not in stranded list | refund never paid | `hr/payroll.ts giveBackClaim` | H5.2 | PRE-PROD (proposed, money) |
| D-H37-setbook-two-tx | `setPayrollBook` links the book and clears the pay account in two transactions — "hunter to check at H3.10 whether mark-paid re-checks" | pay to stale account | `hr/payroll.ts` | **H3.10 hunter (not done in this doc ticket)** | PRE-PROD |
| H3.7-refund-claim-link | old refund requests carry no claim id ⇒ book to 4900 + flag | misclassified refunds | `requestRefundAdjustment` | H5.1 | NTH |
| H3.7-ui-perf | payroll-ui up to 30 `giveBackPeriodOf` lookups per render | slow page | `hr/payroll-ui.tsx` | H5.1 | NTH |
| H3.7-rest-mapping | REST mapping route cannot map PAYROLL_* keys (by design; doc says so) | none | `account` REST | — | NTH |
| D-H38-slip-lock-timeout | slip/PDF/history tx has no `lock_timeout`; can wait ~30 s behind reverse-run then error | error page | `hr/payslip.ts` | H5.1 | NTH |
| D-H38-resolveSelf-former-member | `resolveSelf` serves a linked former employee after Membership deleted; not reachable over HTTP | privacy if a non-session entry appears | `hr/self.ts` | re-check at H4.8 / H5.2 privacy | PRE-PROD (proposed, privacy) |
| D-H38-prefix-lookalike | 50 ทวิ prefix may be set to "HRSC" (look-alike numbers) | cosmetic | filings settings | H5.1 | NTH |
| D-H38-pdf-sara-am | ZWNJ between tone mark and ำ in PDFs; slight overlap | visual | `hr/payslip-pdf.tsx` | visual pass | NTH |
| DEBT-H38-1 | gate slip page: no bank line/employee code; H1.1 borrowing scope in-app (PDF uses home-unit rule) | scope differs page vs PDF | slip gate page | H5.2 privacy | PRE-PROD (proposed, privacy) |
| DEBT-H38-4/5 | two slip lists on `/app/me/hr/pay`; inbox CERT not batch-summarised | UX | self pay page · inbox | H5.1 | NTH |
| D-H39-leave-limit-shopwide | leave LIMIT counts active employees shop-wide before branch filter | branch viewer refused on big shop | `hr/reports.ts` | H5.1 | NTH |
| D-H39-rehire-same-record | rehire on same row keeps old endDate in register | wrong register | `hr/reports.ts` | rehire flow WO | NTH |
| H3.9 D-1…D-7 | name not split · no wage-rate history · orphan register rows on hard delete (s.115 2-year) · no self export of time record (s.114) · daily/hourly v2 rate · historical branch · holiday-OT ฿ in wages record | legal record keeping | `wo-notes/hr-H3.9-design.md` §6 | H5.1 / NA-11 | NTH (D-3 PRE-PROD proposed: deletion of records under retention) |
| H3.4-YTD-F4 | opening income INT ceiling 21,474,836.47 ฿ | very high earners | `HrPayrollOpeningYtd` | Decimal migration if accountant asks | NTH |
| H3.4-YTD-filed | filed ภ.ง.ด.1ก not guarded against later opening change | amended filing manual | payroll-opening | H5.1 | NTH |
| H3.4-YTD-rehire | rehire row accepts an opening while original row's 50 ทวิ is live | double count | payroll-opening | rehire flow WO | NTH |
| H3.4-YTD D1/D2 | previous employer income · CSV import of openings | owner effort | payroll-opening | after accountant Y-01 | NTH |
| SET-N1 | non-HR whole-object settings writers (point, member ×4, kanban) have no `type` filter in their WHERE | cross-module overwrite if a caller slips | `point/service.ts:555` etc. | hardening WO outside HR | NTH |
| SET-N3 | long attendance-pay sync holds `hr:attpay:policy`; every HR settings save queues behind it (15 s/30 s) | timeouts on settings saves | `settings-lock.ts` callers | H5.2 perf | NTH |

## 3. Earlier phases still open (H0–H2, H4 merged tickets)

H0–H2 open list is in `HANDOVER-2026-11-13-HR-H2.md` §6 (not repeated line by line). Items with a pre-prod gate:

| id | what | where | fix ticket | gate |
|---|---|---|---|---|
| D-H24-maxdur | no `maxDuration` on HR transactions (serverless timeouts) | HR actions/routes | H5.3 (note) | PRE-PROD |
| D-H24-pinonly | PIN-only kiosk only allowed with ≥ 6-digit PINs | kiosk | not assigned | NTH |
| H2.6-trust | correction decide service trusts actor/tenant from action layer | `hr/correction.ts` | H5.2 privacy | PRE-PROD (proposed) |
| H2.7-chain / H2.6-hunt | approval-chain races; hourly+full-day leave not hunted | leave/correction | H5.2 | PRE-PROD (proposed) |
| H2.10-hunt | server actions end-to-end (cookies) not hunted | `/app/me/hr` | H5.2 | PRE-PROD (proposed) |
| H2.9-untested | no ACTIVE law row tested on a DB (OT) · overnight day-off split | `hr/ot.ts` | H5.2 after G-LAW | PRE-PROD for v2 |
| H2.9-reversal | reversing a PAID run after an OT revoke pays then deducts (net 0) | payroll | accountant awareness | NTH |
| D-H29-rate-inline / D-H29-reason-ui | below-floor rate throws to error page · 0-settle reason not shown | OT UI | H5.1 | NTH |
| H2.2-touch | long-press drag untested on a real device | roster board | H5.1 | NTH |
| VIS-1-a/c | tabs leading to 404 render; tab strip overflow 1440; 6 minors | HR tabs | H5.1 | NTH |
| D-H212-partial-pay-leave / per-event-quota / preset-race · H2.12-F3 | child-care 50 % leave, maternity per pregnancy, preset race, paid cap separate from quota (LPA No. 9) | `hr/leave-presets*` | after v2 engine | PRE-PROD (proposed, legal: sick day 31+ refused instead of unpaid) |
| H0.5 F4b/D3/F7/F8 | null actor on `setEmployeeActive` · "ต้องตั้ง PIN ใหม่" text · per-device limiter → POS P1.15 · `listEmployees` explicit select | `hr/pin.ts` / service | status not re-verified in this ticket (ยังไม่ยืนยัน — check `wo-notes/hr-H0.5.md`) | NTH |
| D-H41-week-rule | published week, employee rostered off ⇒ booking falls back to shop hours | `hr/availability.ts` | ORACLE-EDIT S3.3/S5.2 + fixture | NTH |
| X-HR.1b | booking closes whole day for half-day/hourly leave (SVC side) | SVC | SVC owner | NTH |
| H4.4-narrow | `employee: true` selects carry offboardNote server-side | lifecycle | H5.2 privacy | NTH |
| H4.6-orphan | orphan stock movement after crash; item lock holds 2 connections; tenant purge must delete HrStockCharge before employees; concurrent charges can drive stock negative | `hr/stock-charge.ts` · `scripts/pending/sweep-m11-orphans.mts` | H5.3 (purge order) | PRE-PROD (purge order) |
| D-H42-vat-exclusive / D-H42-hub-queries / smallGroup key | labour % on VAT-inclusive sales · hub query count · misnamed key | `hr/labor.ts` | owner list O-26 · H5.1 | NTH |
| H4.2-FIX1 | open month MTD, partial per figure, day-1 cost null, nested-unit cap, Thai date label — folded into H4.3 (not merged on 292bc5b7e) | `hr/labor.ts` | H4.3 | NTH |

## 4. Known red suites that are NOT HR defects

| suite / checks | why red | owner |
|---|---|---|
| POS lane-pin statics p2.11 ST1/ST4 · p2.12 ST1 · p3.5 ST1/ST2 · p3.6 ST2/ST3 (also P3.7-ST1/ST3 · P3.9-ST4 after SYNC) | stale pins of the finished POS RUN, tripped by older HR/account diffs; same ids red before H4.2; all POS DB checks green | POS owner (re-pin) — `HR-RESUME.md` 11 Nov 18:25Z, 14 Nov 03:15Z |
| qc-nav-functions S5 | main's BOOKING `/booking/calendar`, `/booking/day` + 14 HOTEL routes missing from nav list; no HR route missing | main / BOOKING / HOTEL — `HR-RESUME.md` 11 Nov 18:25Z, 12 Nov 21:00Z |
| qc-hr-h0.5 S6.x on lane DBs | suite is QC4-only (guard) — green 71/71 on QC4 | by design |
| qc:all acc-v2 (31) · account-api (9) · crm (19) · hf (4) · kanban k1.15 · hardening HD-5.2 | seed time-rot, QC2/QC4-only guards, stale generated docs, Permissions-Policy red on main — triage classes (a)(b)(e) | `wo-notes/hr-H2-close-qcall.txt` |
| `pnpm drift` on QC4: `DormUtilityRate` unique index | QC4 shared with other RUNs; HR tables have no drift | dorm/HOTEL RUN — `HR-RESUME.md` 14 Nov 03:15Z |

## Counts

Section 2: 48 rows · Section 3: 18 rows · gates §1: 5 · known-red rows §4: 5. PRE-PROD (incl. proposed): §1 5 · §2 15 · §3 7 = **27**.

## Contradictions found

1. D-H32-punch-cap: ledger (12 Nov 23:10Z) says "H3.4 phase B fixes", but `TAKE = 20_000` is still in `hr/work-entries.ts:69` and no H3.4 note says it was changed — status ยังไม่ยืนยัน.
2. D-H46-refund-kind: HANDOVER-H2 implies it closes in H3.4; H3.4 design §3 #41 says PARTIAL (kind only, auto-flow deferred).
3. D-H32-refund-kind: H3.2 notes ask for a non-taxable kind for lateness refunds; controller ruling L6 overrode it (stays taxable ALLOWANCE) — closed by ruling, not by code.
