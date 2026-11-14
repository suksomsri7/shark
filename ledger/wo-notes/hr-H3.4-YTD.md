# WO H3.4-YTD — opening year-to-date per employee (ยอดยกมาต้นปี ก่อนใช้ระบบ)

> RUN "HR V2" · lane 3 · worktree `/root/projects/shark-hr-l3` · branch `wip/hr-h3.4-ytd` cut from `session/hr` aa380f6b0 (+ merge of local `session/hr` 93a0b76ee = HR-SET-1) · builder: Claude Opus 5.5
> Contract: brief `ledger/hr-briefs/hr-brief-H3.4-YTD.md` (+ CONTROLLER RULINGS 1+2) · oracle `scripts/qc-hr-h3.4-ytd.mts` + `-lib` (7123ea8a3) · readings `hr-H3.4-YTD-oracle.md` (accepted as contract)
> DB: lane DB via `scripts/qc-hr.sh` only · migration applied with `prisma migrate deploy` through `qc-hr.sh`

## 0. Checkpoint
- done: migration · schema · pure · service · actions · payroll.ts / filings / reports hunks · UI card + review link · messages · inventory · merge session/hr 1725eb106 (H3.8) · **Q12 part done** (payslip.ts/payslip-ui.tsx hunks + qc-hr-h3.4-ytd S3.19 + qc-hr-h3.8 S3.7 ORACLE-EDIT) · regression set (see green file) · clean typecheck
- open: ORACLE-EDIT request OE-1 (S3.12 `cleared` ≥ 3 depends on the S4.2 race outcome — see §6) — the only red check

## 1. Files
| file | new/edited | what |
|---|---|---|
| `prisma/migrations/20270110000001_hr_opening_ytd/migration.sql` | new | table + CHECKs (year 2000–2400 · EXTRACT(YEAR FROM asOfDay) = taxYear · months 0–12 · amounts ≥ 0 · wht ≤ income · rev ≥ 1 · superseded pair) · UNIQUE (sys, emp, year, rev) · partial UNIQUE live · FK RESTRICT · additive |
| `prisma/schema/payroll.prisma` · `hr.prisma` | hunk | model `HrPayrollOpeningYtd` · back-relation `openingYtd` |
| `src/lib/core/scope.ts` · `scripts/hr-qc-env.mts` | hunk | `sys()` registration · HR_TABLES + delete order (before hrEmployee) |
| `src/lib/modules/hr/payroll-opening-rules.ts` | new | pure: `OPENING_TEXT` `parseOpening` `withOpening` `openingMissing` `openingFilingItem` `ssoHigh` `isDay` `yearOk` (type-only import of FilingItem) |
| `src/lib/modules/hr/payroll-opening.ts` | new | `listOpeningYtd` `saveOpeningYtd` `saveOpeningYtdBulk` `clearOpeningYtd` (+ internal `openingsInTx` `lockYtdInTx`) |
| `src/lib/modules/hr/payroll-opening-actions.ts` | new | "use server": save one · zero · bulk · ฿ → satang by string parse (no float) · keyGate (assertCan hr.payroll.pay, as filings/actions) |
| `src/lib/modules/hr/payroll-opening-ui.tsx` | new | card `#hr-ytd-card` (server component) |
| `src/lib/modules/hr/payroll.ts` | hunks | import · v1 create + v1 rebuild OPENING_OVERLAP · Run2Code + `OPENING_OVERLAP` · `ytdOpeningsInTx` (hr:ytd lock + read) · buildRunV2InTx prior = withOpening(ytdPriorV2) + overlap + `snapshotJson.ytdOpening` · preview review `YTD_OPENING` |
| `src/lib/modules/hr/filings/service.ts` | hunks | import pure · `withOpeningsInTx` · PND1A path · `yearFigures` · issueOne hr50 → hr:ytd |
| `src/lib/modules/hr/reports.ts` · `reports-rules.ts` | hunks | tax-year adds opening (income · wht · ssoEmployee · months) + `ytdNote` (th/en) |
| `src/lib/modules/hr/payroll-run-ui.tsx` · payroll `page.tsx` | hunks | RUN2_MSG `y.*` (OPENING_TEXT) · review link `#hr-ytd-card` (`hr-run2-ytd-link`) · card on the page |
| `src/messages/{th,en}/common.json` · `scripts/hr-ui-inventory.json` | additive | `hr.ytd.*` (th = en keys) · `hr.run2.rv_YTD_OPENING` `ytdLink` · 8 inventory rows wo H3.4-YTD |
| `src/lib/modules/hr/payslip.ts` · `payslip-ui.tsx` (H3.8 files) | hunks | Q12: `YearDto.opening?` (key only when an opening exists) · `openingsOfInTx` + `withOpenings`: year income/tax/SSO += live opening (= 50 ทวิ), count/gross/net/slips unchanged · slipHistory (payroll reader + branch scope, H3.8 gate) and mySlips (self) · YearCard line `hr-slip-opening-<year>` · message `hr.slip.yearOpening` th/en · inventory row |
| `scripts/qc-hr-h3.8.mts` | ORACLE-EDIT | S3.7 + `noOpening` (no opening key in a fixture without openings) — marked `ORACLE-EDIT (H3.4-YTD · controller ruling)` |
| `scripts/qc-hr-h3.4-ytd.mts` | ORACLE-EDIT | S3.19 (Q12): slip history 2031 = live 50 ทวิ incl. opening · one opening line · count/slips 4 · payroll reader ✓ · manager/member/other tenant refused · never on a single slip · no key without opening · gone after clear |
| `scripts/qc-hr-h0.1.mts` | ORACLE-EDIT | S4.2 schema sha re-take (pre-authorised) 697825669… → 2c5cb6c9… on the merged payroll.prisma |
Not touched: `privacy.ts` / `self.ts` (qc-hr-h3.8 S1.13 pins unchanged) · `hr/index.ts` (nothing outside hr needs openings) · all frozen files (oracle S1.5 green).

## 2. Migration runbook
Migrate first, then deploy code. Pre-check (outside the migration): `SELECT to_regclass('"HrPayrollOpeningYtd"');` ⇒ NULL. No backfill. No data ⇒ no behaviour change (engine/filings/reports read an empty table; snapshot key `ytdOpening` only appears as `"MISSING"` warnings — not in the digest). Rollback = disable code (empty table, old code unaware).

## 3. How each brief section was met
- R1 migration as above. Append-only: edit = updateMany(supersededAt) guarded + insert `max(rev)+1`; clear = supersede. Partial unique is the last guard (S3.10 raw insert refused).
- R2 pure file: no db/clock/random/await; `todayBkk` is passed in. `parseOpening` order YEAR → FIELDS (types/range) → FIELDS (date format) → AS_OF (year / future) → FIELDS (months ≤ month(asOf)) → WHT_OVER. `withOpening` adds only when asOf year = onDay year ∧ asOf < onDay. `openingMissing` = Q15 with "1 Jan" = 1 Jan of the payDay year (ruling 2).
- R3 service: rows `{employeeId name code startDay state opening locked}` · opening `{asOfDay months incomeSatang whtSatang ssoSatang rev}` · refusals `{ok:false, code, reason}` from OPENING_TEXT. OVERLAP = non-REVERSED run (any engine/status) of the tax year with BKK payDay ≤ asOf that has an item of the employee. CERT_ISSUED = live 50 ทวิ. Warning `SSO_HIGH` = sso > months × legal max monthly contribution at asOf (law row; none ⇒ no warning). Bulk ≤ 300 rows, no duplicate employee, one tx, all-or-nothing. List `state`: SET = live row; else `openingMissing` against the employee's first non-reversed run of the year, or (no run) the current BKK month (past year ⇒ December · future year ⇒ NOT_NEEDED).
- R4 locks: save/clear/bulk = `hr50:<sys>:<emp>:<year>` seed 36 ascending → `hr:ytd:<sys>:<year>` seed 0 · v1 create = P → hr:ytd · v1 rebuild = P → run row → hr:ytd · v2 create/rebuild/approve = P (→ run row) → hr:ytd (inside buildRunV2InTx, after the adjustment FOR UPDATE) · 50 ทวิ issueOne = hr50 → hr:ytd. hr:ytd is always the last advisory lock ⇒ no cycle. v1 approve does not take hr:ytd (it neither adds employees nor moves payDay — decision D-1).
- R5 (a) prior inside `input` ⇒ inside `inputDigest`; (b) `snapshotJson.ytdOpening` = `{id, rev}` | `"MISSING"`; key omitted when neither (= null) so runs without openings keep byte-identical snapshots apart from the warning marker; not in flags/ytdJson/digest; (c) v1 + v2 create (and rebuilds) refuse `OPENING_OVERLAP` (v1: PayrollInputError with OPENING_TEXT text); (d) preview (payroll viewers) appends `{day:null, code:"YTD_OPENING"}` — DRAFT: marker MISSING ∧ no live row now; after approve: from the marker. Never blocks.
- R6 filings: `withOpeningsInTx` appends `openingFilingItem` per live opening and the persons of opening-only people; used by `yearFigures` (50 ทวิ issue/bulk, list `stale`, candidates) and the PND1A path only. Monthly ภ.ง.ด.1 / สปส.1-10 untouched (S3.12 bytes identical).
- R7 reports: tax-year only (+ fixed note `ytdNote`, only when an opening is included).
- R8 gate = `canUseFilings` (H3.6 memberOf + bankGateOf on DB row and on the passed viewer; role must match). Unknown/foreign employee ⇒ the same NO bytes. Non-OWNER on a row linked to self ⇒ OWN.
- R9 DTO keys exact; no ID/bank; manager preview path untouched; no outbox; not in AI files.
- R10 audits in the same tx (`tx.auditLog.create`): `.save {employeeId, taxYear, rev, by}` · `.clear {employeeId, taxYear, rev}` · `.refused {code}` (OVERLAP / CERT_ISSUED, after rollback). No baht.
- R11 no JV.
- §4 UI: server component, one form (per-row save / zero via `formAction`, bulk save), year select (GET `?yty=`), result via `?ymsg=` allowlist, `role="alert"` testid `hr-ytd-alert`, buttons min-h 44 px, tokens only. Zero = months 0 / amounts 0 / asOf 1 Jan of the year.

## 4. COMMON §F self-check
- [x] F1 no new page/route (card on the existing payroll page) · `?ymsg=` from an allowlist (OK_CODES/ERR_CODES)
- [x] F2 inside `$transaction` only the tx client (grep: no `tenantDb(`/`prisma.` in tx bodies of payroll-opening.ts; payroll.ts/filings hunks use the caller's tx) — oracle S1.6 green
- [x] F3 scope: gate = all branches (`[]` = ทุกสาขา accepted; explicit unit list refused with the same NO, no ids) — S3.15
- [x] F4 refusals Thai, fixed, identical bytes for all non-viewers on all 4 entry points; no ids/stack text
- [x] F5 tx options: maxWait 20 s / timeout 30 s (service); actions are plain server actions (no route maxDuration); bulk audits written per row inside the one tx
- [x] F6 runbook "migrate first, then deploy"; pre-check SQL in notes (§2), not in the migration
- [x] F7 own-row guard before the tx; no second connection under a lock (law read uses the tx)
- [x] F8 no rate-limited action (n/a)
- [x] F9 no new outbox event (n/a)
- [x] F10 changed files ⊆ brief §5 list (+ notes); shared hot files: messages only (additive)

## 5. Decisions
- D-1 v1 approve does not take hr:ytd (R4 lists approve v1+v2): approval neither changes payDay nor membership, so the OVERLAP invariant (save sees every live run under hr:ytd) holds without it. v2 approve takes it (buildRunV2InTx).
- D-2 payroll.ts and filings/service.ts read openings inline (own tiny query + lock) instead of importing `payroll-opening.ts`: that import would close a load cycle payroll → payroll-opening → filings/service → self → payroll.
- D-3 `snapshotJson.ytdOpening` omitted when null (brief allows null) — keeps snapshots of shops without openings byte-identical except the MISSING marker.
- D-4 bulk refusals carry `employeeId` of the failing row (not for NO) so the UI can point at it; single save/clear refusals carry only `{ok, code, reason}`.
- D-5 clear with a live 50 ทวิ ⇒ CERT_ISSUED (same rule as edit — the cert must match the data).

## 6. ORACLE-EDIT requests
- OE-1 (S3.12, not pre-authorised — controller ruling needed): `cleared: clr.length >= 3 && …` assumes E.eB2 has a live opening, but E.eB2's opening comes from the S4.2 race, whose contract accepts both outcomes (cert includes it XOR save ⇒ CERT_ISSUED). Advisory waiters are FIFO and `issue()` is started first with one round trip less before hr50, so the issue wins and the save is CERT_ISSUED ⇒ only 2 live openings (eB, eL) ⇒ S3.12 red although every assertion about 1ก/monthly bytes holds (run output: `p1a [B 36000100] [o 12000000] [L 15000000]`, pnd9/sso9 identical, clr = 2 ok). Proposed hunk: `cleared: clr.length >= 2 && clr.every((x) => x?.ok === true)` (or count = number of live rows found), marked `// ORACLE-EDIT (H3.4-YTD · builder OE-1)`.

## 7. Debts · accountant list
- D1 previous employer · D2 CSV import · D3 Q12 H3.8 slip-history line (pending H3.8 merge — this ticket) · D4 rehire across rows · D5 v1 stays ×12 · D6 DAILY/HOURLY (NA-11) · D7 leaver true-up (NA-12)
- AC-a previous-employer income (50 ทวิ of another employer) — may/must the projection include it? (ruling Q1)
- AC-b rehire = new HrEmployee row; old-row pay is never entered as an opening (double count with the old 50 ทวิ) (ruling Q14)
- AC-c one combined annual line (pre-system + SHARK) on 1ก/50 ทวิ right? · pre-go-live leaver: on this year's 1ก, who issues the 50 ทวิ? · entered SSO above 9,000 ฿ simply capped? (brief A2–A4)
