# HANDOVER — HR V2 RUN · phase H3 (payroll / money) · 14 Nov 2026

> Ticket H3.10 (phase close, document part). Base `session/hr` 292bc5b7e (H3.1–H3.9 + H3.4-YTD + HR-SET-1 merged; also H4.1 H4.2 H4.4 H4.6).
> Companion docs: `ledger/HR-ACCOUNTANT-SIGNOFF.md` (76 items) · `ledger/HR-OWNER-LIST.md` · `ledger/HR-DEBTS.md` · `docs/modules/18-hr.md` §5.
> Every line cites a source; "(unverified)" = not confirmed from a note or the code.
> **NOT done by this document ticket** (still owed by H3.10): qc:all remainder (190 suites + svc/sec families), mockup parity 06/07c/08 visual batch, accountant sign-off itself, hunter check of D-H37-setbook-two-tx.

## 0. Status

| item | value | source |
|---|---|---|
| count | 35/44 after H4.2 (H3.4-YTD and HR-SET-1 are fix tickets, not counted) | RESUME 14 Nov 03:15Z |
| v2 payroll in prod | **dormant**: no law row ACTIVE on any DB; a shop switches only when OWNER flips the engine AND signed-off rows exist | `hr-brief-H3.4.md` §6 · RESUME 12 Nov 01:5xZ |
| last full gate | pm-full on QC4 after each merge: 48–52 green, clean typecheck 0 | RESUME 13 Nov 23:15Z – 14 Nov 03:15Z |

## 1. What H3 delivered (per ticket)

**H3.1 Work entries** — one `HrWorkDay` row per employee-day (RAW minutes; late+early+absent ≤ planned − leave − work; break once after 5 h); input hash covers every judge input ⇒ OUTDATED; blocking flags (STALE/orphan/MISSING_OUT/PENDING_LEAVE/…); APPROVED snapshots frozen. Prices nothing for OT (`OT_VIA_ADJUSTMENT`).
Files `hr/work-entries.ts` · `work-entries-rules.ts` · reader `workEntryDaysInTx` in `judge.ts`. Migration `20270103000000_hr_work_days`. Setting `normalMinutesPerDay` 60–720 (480). Oracle `qc-hr-h3.1` (58). Must not regress: never price otWorkdayMin/otHolidayMin; loop on `next` (~20 s chunks). (RESUME 12 Nov 17:0xZ · `wo-notes/hr-H3.1.md`)

**H3.2 Late/absent pay rules** — opt-in (default OFF) pro-rata PENDING `HrPayAdjustment(DEDUCTION)` per employee·period·rule; ÷30÷N; frozen month settles on snapshot; in-force intervals `hrAttendancePayInForce`; stale approved deductions never bind; refund of over-deduction = ALLOWANCE.
Files `hr/attendance-pay{,-rules,-actions,-ui}.ts(x)`, writer block at EOF of `payroll.ts`. Migration `20270105000000_hr_attendance_pay` (one table, CHECKs). Oracle `qc-hr-h3.2` (64). Must not regress: only `payroll.ts` writes HrPayAdjustment; work-period locks before run-period lock. (RESUME 12 Nov 23:10Z)

**H3.3 Law-table engine** — pure SSO/WHT v2 (`payroll-rules-v2.ts`), dated rows via `law.ts` (`loadLawSet(lawDayOf(payDay))`, ACTIVE only, missing ⇒ `LAW_MISSING`, never constants); platform-only writes (SUPER_ADMIN; fitness F16.9); read-only law page `/hr/settings/law`.
No migration (model from H1.3 `20261206000000_hr_money_law_model`). Oracle `qc-hr-h3.3` (51; 10 NEEDS-ACCOUNTANT). Must not regress: `law.ts` is the only file naming HrLawTable (h3.3 S1.3). (`wo-notes/hr-H3.3.md`)

**H3.4 Payroll run v2** — `engineVersion=2` per shop (OWNER switch, needs ACTIVE law); pay lines with source; ÷30 proration; s.76 caps 10 %/20 % + consent (s.77); carry-forward rows (CARRY_FORWARD), leaver receivable; maker-checker via `stepsJson.makers`; INPUTS_CHANGED / YTD_DRAFT / LAW_MISSING / VARIABLE_PAY refusals; `stepsJson.finalized` final transaction; v1 runs stay v1.
Files `hr/payroll.ts` (marked `HR H3.4`), `payroll-run-rules.ts` (pure, 72 vectors), `payroll-run-ui.tsx`. Migrations `20270106000000_hr_payroll_v2_kinds` (`ALTER TYPE … ADD VALUE` REFUND, CARRY_FORWARD — own file) + `20270106000001_hr_payroll_v2` (stepsJson, inputDigest, consentAt/ById). Oracle `qc-hr-h3.4` (85) + `-lib`. Must not regress: `V2_VARIABLE_PAY = false` until NA-11; v2 previews never show ฿ to managers; reverse later runs first (CARRY_BOUND). (`wo-notes/hr-H3.4*.md`)

**H3.4-YTD Opening balances** — per-employee opening YTD (income/WHT/SSO before the first run of the year) feeding projection, 1ก, 50 ทวิ, reports, slip history; warning `YTD_OPENING` / `YTD_REBUILD`; zero opening = audited explicit act.
Files `hr/payroll-opening{,-rules,-read,-actions,-ui}.ts(x)`. Migration `20270110000001_hr_opening_ytd` (pre-check `SELECT to_regclass('"HrPayrollOpeningYtd"')` ⇒ NULL). Oracle `qc-hr-h3.4-ytd` (44) + `-lib`. Must not regress: one reader `payroll-opening-read.ts`; key `hr:ytd:` only there; opening rev in the digest. (`wo-notes/hr-H3.4-YTD.md`)

**H3.5 Bank files** — KBank PCT + KTB iPay best-effort (OFF by default, "ยังไม่ทดสอบกับธนาคารจริง"), generic CSV/XLSX + saved mapping; no bytes stored (manifest + sha, 7-day expiry, rebuild on download).
Files `hr/bank-files/*`, route `hr/payroll/bank-file/[fileId]`. Migration `20270107000000_hr_bank_files`. Oracle `qc-hr-h3.5` (53). Must not regress: gate = DB membership AND passed viewer, `hr.payroll.read ∧ hr.payroll.pay ∧ all branches` (no wildcard); refusals identical bytes; HEAD refused. (`wo-notes/hr-H3.5.md`)

**H3.6 Filings** — ภ.ง.ด.1 monthly / 1ก annual (RD Format 2.0), สปส.1-10, 50 ทวิ PDF (series `HR50-<year>-NNNN` via `reserveSeq`); reads stored figures only; non-finalized v2 runs excluded.
Files `hr/filings/*`, 3 routes (gate file, gate cert, self cert). Migration `20270108000000_hr_filings` (4 tables, `rdFormFlag DEFAULT 2`; lane-1 DB still 1). Oracle `qc-hr-h3.6` (62, `hr-H3.6-green.txt`). Must not regress: no national/tax ID in DTO/audit; labels "ยังไม่ทดสอบกับ e-Filing/e-Service จริง". (`wo-notes/hr-H3.6.md`)

**H3.7 Accounting v2** — accrual JV at finalize (`hr-payroll#<runId>#accrual`, dated inside the wage month), pay JV at mark-paid (`#pay`), symmetric reversal via `reverseEntry`; explicit HR→book link (owner), `autoPost` missing = ON; default codes 6000/6010/2120/2150/2130/1140/4900; give-back of claims (`giveBackClaim`).
Files `account/gl.ts`, `account/connections.ts`, `hr/payroll-journal-rules.ts`, marked `HR H3.7` hunks. **No migration** (ledgers created by `ensurePayrollLedgersInTx` at link time). Oracle `qc-hr-h3.7` (68) + `qc-account-cpa`. Must not regress: never post to SUSPENSE or a shop-owned code (unmapped ⇒ refuse); PAID ⇔ exactly one pay entry. (`wo-notes/hr-H3.7*.md`)

**H3.8 Payslip + salary certificate** — slip 07c in-app + PDF, yearly history (with "ยอดยกมา"), salary certificate request → inbox (CERT) → issue (`HRSC` series), void, download.
Files `hr/payslip{,-rules,-pdf,-route,-actions,-ui}.ts(x)`, 4 routes. Migration `20270110000000_hr_payslip_salary_cert`. Oracle `qc-hr-h3.8` (78). Must not regress: self data only via `resolveSelf`; branch scope = home unit (borrowing ignored) for PDF/history; reversed run = slip withdrawn. (`wo-notes/hr-H3.8.md`)

**H3.9 Reports + employee register** — time, leave, OT, payroll, tax/SSO, wages, register (s.112–115) as page + CSV/XLSX; single decision point `reportAccessOf`; totals from visible rows only; national ID masked unless `hrReports.registerFullId` ON (owner) in the register export.
Files `hr/reports{,-rules,-route,-actions,-ui}.ts(x)`. Migration `20270109000000_hr_employee_register_fields`. Oracle `qc-hr-h3.9` (60). Must not regress: gate from DB membership, not the passed viewer; never bank fields/houseRegAddress/ssoNumber/reasons. (`wo-notes/hr-H3.9.md`)

**HR-SET-1 Settings lock** — every `AppSystem.settings` writer in `hr/**` uses `settings-lock.ts`; `writeHrSettingsKeys` throws unless `hr:clockpolicy:<sys>` is held in the same tx. No migration. Oracle `qc-hr-set-1` (25). (`wo-notes/hr-SET-1.md`)

## 2. Lock and ordering conventions

| rule | detail | source |
|---|---|---|
| settings | `lockHrSettings(tx, ctx, ownLocks)`: advisory `hr:clockpolicy:<sys>` → own keys in order → `AppSystem` row `FOR UPDATE` → re-read; write only own keys with `writeHrSettingsKeys`; new writers must run `qc-hr-set-1` | `wo-notes/hr-SET-1.md` |
| period locks | every holder takes period locks ascending, work-period chain first, then run period | `wo-notes/hr-H3.2.md` §7 |
| corrections | superset period locks ascending → hr-corr → hr:clock → hr:judge → roster | RESUME 12 Nov 10:5xZ |
| 50 ทวิ / YTD | issue + opening save/clear take `hr50:<sys>:<emp>:<year>` (one tx per certificate); YTD own key `hr:ytd:` only in `payroll-opening-read.ts` | `hr-brief-H3.4-YTD.md` rulings 2 |
| salary cert | `hrsc:<sys>:<emp>` → request row FOR UPDATE → runs FOR SHARE → duplicate cert FOR UPDATE → profile → `reserveSeq` last | `wo-notes/hr-H3.8.md` fix r3 |
| bank file | generate/download take `FOR SHARE` on `HrPayrollRun`, never a period advisory lock | `wo-notes/hr-H3.5.md` |
| advance | `hr:advance:<tenant>:<emp>`; `decideAdjustment` takes it too | RESUME 12 Nov 18:1xZ |
| JSON merges | `hr-ui-inventory.json`, `messages/{th,en}/common.json` — structural 3-way (`ledger/hr-ctl/json3way.py`) | RESUME 12 Nov 01:5xZ |
| oracle bases | default base = merge-base with session/hr + in-base guards; marked `ORACLE-EDIT (<ticket>)` hunks only | RESUME 12 Nov 10:5xZ, 13 Nov 19:50Z |

## 3. Production runbook — ORDER for H3 (part of H5.3)

Global rule: migrations are additive; **migrate first, then deploy code** (Vercel applies migrations at build — master plan §8). Earlier phases first: H0.5 pepper → H0.6 → H0.7 → H1.1 (+ `hr-backfill-units.mts`) → H1.2 → H1.3 (+ law seed dry-run → owner GO → `--apply`) → H2 migrations (RESUME 22 Oct 22:10Z · `HANDOVER-2026-11-13-HR-H2.md` §2).

| step | what | gate / check |
|---|---|---|
| 1 | `20270103000000_hr_work_days` (H3.1) | no backfill; rollback = code off |
| 2 | `20270104000000_hr_stock_charge` (H4.6, same window) | tenant purge must delete HrStockCharge before employees |
| 3 | `20270105000000_hr_attendance_pay` (H3.2) | additive table only; policy OFF by default ⇒ no behaviour change |
| 4 | `20270106000000_hr_payroll_v2_kinds` then `…000001_hr_payroll_v2` (H3.4) | enum ADD VALUE in its own file; every shop stays engine 1 |
| 5 | `20270107000000_hr_bank_files` (H3.5) | formats OFF by default |
| 6 | `20270108000000_hr_filings` (H3.6) | prod gets `rdFormFlag DEFAULT 2` |
| 7 | `20270109000000_hr_employee_register_fields` (H3.9) | `registerFullId` default OFF |
| 8 | `20270110000000_hr_payslip_salary_cert` (H3.8) | — |
| 9 | `20270110000001_hr_opening_ytd` (H3.4-YTD) | pre-check `to_regclass('"HrPayrollOpeningYtd"')` IS NULL; no backfill |
| 10 | deploy code (H3.7 has no migration: book links made earlier read as autoPost ON — owner O-07) | owner told before deploy |
| 11 | R8 key backfill decision: STAFF memberships with `hr.payadjust.approve` w/o `hr.payadjust.reject`, or `hr.payroll.approve` w/o `hr.payroll.reverse` — query `membership.permissions`, add only where the owner wants (no data migration written) | owner O-05 · `wo-notes/hr-H3.4.md` Rulings (5) |
| 12 | `pnpm drift` + read-only `scripts/verify-prod-hr.mts` (planned, H5.3 — does not exist yet) | master plan H5.3 |
| 13 | only after accountant sign-off: SUPER_ADMIN one-off script `createLawDraft(…supersedesId)` → `activateLawRow(…{approvedByName})` per kind (SSO, TAX_BRACKET, DEDUCTION), with owner GO; never edit json in place | `wo-notes/hr-H3.3.md` §10 |
| 14 | per shop, OWNER flips the engine to 2 (refused while law missing or VARIABLE_PAY staff exist) | `hr-brief-H3.4.md` Q1 |

QC-only note: main's `20261227000000_svc_h` sorts before applied HR folders and was applied out of order on QC DBs; prod unaffected (RESUME 12 Nov 21:00Z).

## 4. Permissions and privacy rules H3 added or relies on

| surface | who | source |
|---|---|---|
| engine switch, caps, book link, pay account, filing profile, register full-ID | OWNER only | `wo-notes/hr-H3.4.md` · `hr-brief-H3.7.md` R7 · `hr-brief-H3.6.md` R8 · `hr-brief-H3.9.md` R10b |
| bank files, filings, 50 ทวิ, opening YTD, salary certificates | OWNER, or `hr.payroll.read` ∧ `hr.payroll.pay` ∧ all branches (MANAGER role never) — checked on DB membership AND passed viewer | `hr-brief-H3.6.md` R9 · `hr-brief-H3.4-YTD.md` R8 |
| payslips (gate) | OWNER or `hr.payroll.read`, home-unit scope | `wo-notes/hr-H3.8.md` |
| attendance-pay sync | OWNER, or `hr.payroll.read` + `hr.payadjust.request` | `hr-brief-H3.2.md` R4 |
| reports | time/OT: roster reader or payroll viewer · leave: leave gate or payroll viewer · money/register: payroll viewer · ฿ only with payroll | `hr-brief-H3.9.md` R4 |
| run v2 reject/reverse | new split keys `hr.payadjust.reject`, `hr.payroll.reverse` (R8) | `wo-notes/hr-H3.4.md` Interpretation 8 |
| invariant | every refusal carries no data and is byte-identical for all refused viewers; download routes refuse HEAD | RESUME 13 Nov 19:30Z rules |

## 5. How to verify (no secrets; values come from gitignored env files)

```
# seed first in any fresh tree (writes scripts/hr-expected.json, gitignored)
bash scripts/iso.sh bash scripts/qc-hr.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 pnpm exec tsx scripts/seed-hr-qc.mts
# one oracle on the lane DB (qc-hr.sh reads .env.qc-hr, refuses non-lane hosts)
bash scripts/iso.sh bash scripts/qc-hr.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 pnpm exec tsx scripts/qc-hr-h3.4.mts
# H3 money set: qc-hr-h3.1 h3.2 h3.3 h3.4 h3.4-ytd h3.5 h3.6 h3.7 h3.8 h3.9 qc-hr-set-1
#   + qc-hr-h1.1 qc-audit-trail qc-hf-hr-privacy qc-payroll qc-payroll-reverse qc-hr-payadjust qc-account-cpa
#   + statics always: qc-hr-h3.3 qc-hr-h1.2 · fitness + fitness-hr (both modes)
# controller gate after a merge (QC4)
systemd-run --unit=hr-pm-<wo> --quiet env WO=<wo> [MIGRATE=1] /usr/bin/bash ledger/hr-ctl/pm-full.sh
# typecheck: delete .next/types and tsconfig.tsbuildinfo first; NODE_OPTIONS=--max-old-space-size=12288 ISO_MEM=14000M; < 2 min = suspect
```
Sources: `HANDOVER-2026-11-13-HR-H2.md` §11 · RESUME 12 Nov 16:1xZ (clean typecheck rule), 13 Nov 19:30Z (h1.1 + audit-trail on every payroll ticket) · `ledger/hr-ctl/pm-full.sh` header. Never run a DB suite with `DATABASE_URL` unset (falls back to QC4) — RESUME 14 Nov 01:22Z.

## 6. Open for the next controller

- H3.10 remainder: qc:all (resume per `wo-notes/hr-H2-close-qcall.txt`) + svc/sec suites on their own DBs · visual batch 3.4–3.9 · accountant sign-off recorded in `HR-ACCOUNTANT-SIGNOFF.md` · hunter on D-H37-setbook-two-tx.
- Then H4.3 (incl. H4.2-FIX1), H4.5, H4.8 (lanes running per RESUME 14 Nov 03:15Z), H5.1–H5.3.
- Debts and pre-prod gates: `ledger/HR-DEBTS.md`.

## Contradictions found

1. `rdFormFlag` default: brief H3.6 = 1, migration after fix r1 = 2; lane-1 DB column still 1.
2. Ledger 12 Nov says D-H32-punch-cap "H3.4 phase B fixes"; `TAKE = 20_000` still in `hr/work-entries.ts:69` (see HR-DEBTS).
