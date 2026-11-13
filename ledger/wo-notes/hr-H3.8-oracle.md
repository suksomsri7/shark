# H3.8 oracle notes — payslip · yearly history · salary certificate

Brief `ledger/hr-briefs/hr-brief-H3.8.md`. Oracle `scripts/qc-hr-h3.8.mts` (59 checks) + `scripts/qc-hr-h3.8-lib.mts` (vectors, generators, lock helper). Written 13 Nov 2026 on `wip/hr-h3.8` from `session/hr` 268b81f17. No model name, no `.env` read; lane DB via `scripts/qc-hr.sh` only.

## §0 Facts (268b81f17) — part of the brief
F1 Slip today = `app/sys/[id]/payroll/[runId]/slip/[employeeId]/page.tsx` via hotfix `privacy.loadPayslipForViewer(ctx, viewer, runId, employeeId)` (passed viewer; self = `linkedUserId`; self sees APPROVED/PAID). It prints adjustment **notes** (free text) and has no testids (H0.4 debt → H3.8). `payslipData` in `payroll.ts` (frozen).
F2 v2 item (H3.4): `snapshotJson.lines[]` `{code, ref, day, minutes, amountSatang}`; **Σ lines = grossSatang**; `net = gross − ssoEmployee − wht`. PRORATION `minutes` = days. v1 item: `snapshot {baseSalarySatang, addSatang, deductSatang, adjustments[{kind, amountSatang, note}]}`, gross = max(0, base + add − deduct).
F3 Issued v2 run = APPROVED/PAID **and** `stepsJson.finalized = true` (H3.6 `counts`; same predicate here). Tax year = Bangkok year of `payDate` (H3.6). 40(1) income per item = `filings/figures.itemFigures` (v2 `whtIncomeSatang`, v1 base + add).
F4 H3.6: `filings/cert-pdf.tsx` (react-pdf 4.3 + Sarabun from `public/fonts/sarabun`, `wrapPdf` from `account/public-doc-pdf`) — not byte-deterministic; `filings/download-route.ts` (204 rsc/prefetch, 405 non-GET, fixed text refusals); gate `memberOf` (DB membership AND passed role); `reserveSeq` + `formatDocNo`; HrFilingProfile holds `employerName/employerAddress/signerName`.
F5 H2.10: `self.resolveSelf → employeeOfUser`; `myDocuments` keys pinned by qc-hr-h2.10 (`certificate: null` slot, slip `href`); SelfPay testids `hr-self-payslips`, `hr-self-cert-slot` pinned.
F6 qc-hf-hr-privacy calls `loadPayslipForViewer` with **viewers that have no membership row** (P-1/P-2/P-8) ⇒ its signature and passed-viewer gate must stay; DB-derived gate goes into the NEW service (brief R7).
F7 `hr/reports.ts` (H3.9) is not in this base; nothing here depends on it.

## §1 Assumptions
A1 Stored v2 lines satisfy Σ lines = grossSatang (H3.4 `computeRunItemV2`: gross = e0 + add − deduct, lines carry the same signed amounts). The slip refuses (`SLIP_DATA`) instead of repairing when this or net = gross − SSO − WHT fails.
A2 "Issued" = H3.6 predicate (`stepsJson.finalized = true` for v2; `journalEntryId` alone is **not** enough) so slips, history and 50 ทวิ always select the same runs.
A3 Tax year = Bangkok calendar year of `payDate` (paid basis, H3.6) — a December period paid 5 Jan 2032 belongs to 2032 (fixture RA8).
A4 Line quantities come only from stored `minutes` (PRORATION stores days). No rate, multiplier, cap or "below threshold" text is derived.
A5 The fixture inserts runs/items directly (rows shaped exactly as H3.4 / the v1 engine store them); H3.8 only reads them. HrFilingProfile/HrFilingPerson rows are inserted directly for the H3.6 reconcile; everything is deleted at the end (Z1).
A6 Dates: runs 2031–2032, certificate issue `now = 2032-01-10T03:00Z` (BKK 10 Jan 2032) passed as `opts.now`; no check uses today's date.
A7 The certificate counter reuses `AccountDocType.WHT_CERT` under the HR system with periodKey `HRSC:<year>` (unique on (systemId, docType, periodKey) — disjoint from H3.6 `HR50:<year>`).
A8 S4.1 waits on a condition (another backend waiting on a Lock while running a statement on "HrPayrollRun", seen in pg_stat_activity, bounded 15 s), never on a timer race.

## §2 Vectors (hand arithmetic, satang; ฿ in brackets)
Identity for every slip: earnings − deductions = net; deductions include SSO (employee) and WHT.

| id | stored item | earnings | deductions | net |
|---|---|---|---|---|
| V1 plain monthly (v2) | BASE 1,600,000 · SSO base 1,500,000 → ee 75,000 · WHT 0 · gross 1,600,000 | BASE 1,600,000 = 1,600,000 [16,000] | SSO 75,000 + WHT 0 = 75,000 | 1,600,000 − 75,000 = **1,525,000** [15,250] |
| V2 mockup 07c (v2) | BASE 1,600,000 · OT 60,000 · COMMISSION 70,000 + 50,000 · LATE_RULE −5,000 ×3 · ee 75,000 · WHT 0 · gross 1,600,000 + 60,000 + 120,000 − 15,000 = 1,765,000 | 1,600,000 + 60,000 + 120,000 (count 2) = 1,780,000 [17,800] | LATE 15,000 (count 3) + 75,000 + 0 = 90,000 [900] | 1,780,000 − 90,000 = **1,690,000** [16,900] = 1,765,000 − 75,000 ✓ |
| V3 mid-month starter (v2) | BASE 3,000,000 · starts on the 16th of a 31-day month: days 16..31 = 16; 3,000,000 × 16 / 30 = 1,600,000 ⇒ PRORATION −1,400,000 (minutes 16) · ee 75,000 · gross 1,600,000 | 3,000,000 − 1,400,000 (qty 16) = 1,600,000 | 75,000 | **1,525,000** |
| V4 refund + advance (v2) | BASE 2,000,000 · REFUND 50,000 · ADVANCE −300,000 · ee 75,000 · gross 2,000,000 + 50,000 − 300,000 = 1,750,000 · 40(1) income 2,000,000 | 2,000,000 + 50,000 = 2,050,000 | 300,000 + 75,000 + 0 = 375,000 | 2,050,000 − 375,000 = **1,675,000** = 1,750,000 − 75,000 ✓ |
| V5 SSO cap + WHT (v2) | BASE 5,000,000 · stored SSO base 1,750,000 → ee 87,500 · WHT 270,833 · gross 5,000,000 | 5,000,000 | 87,500 + 270,833 = 358,333 | **4,641,667** [46,416.67] |
| V6 bonus (v2) | BASE 3,000,000 · BONUS 1,000,000 · ee 87,500 · WHT 125,000 (one-off 75,000) · gross 4,000,000 | 4,000,000 | 87,500 + 125,000 = 212,500 | **3,787,500** |
| V7 legacy v1 | base 1,500,000 · adjustments OT 60,000 ("ทำงานวันเสาร์") · DEDUCTION 20,000 ("แก้วแตก") · gross 1,540,000 · ee 75,000 · WHT 0 · income (v1) 1,500,000 + 60,000 = 1,560,000 | 1,500,000 + 60,000 = 1,560,000 | 20,000 + 75,000 = 95,000 | **1,465,000** (notes never shown) |
| V8 legacy v1 no detail | base 1,000,000 · adjustments [] · addSatang 50,000 · gross 1,050,000 · ee 50,000 | 1,000,000 + V1_OTHER 50,000 = 1,050,000 | 50,000 | **1,000,000** + flag V1_OTHER |
| V9 daily payer | DAY_WAGE 250,000 ×2 (no BASE) | — | — | used for `certNoBase` |
| V10 plain 18,000 | BASE 1,800,000 · ee 75,000 · gross 1,800,000 | 1,800,000 | 75,000 | **1,725,000** |

Broken items B1–B10 (S2.9): V2 with one line +1 (Σ ≠ gross) · V1 net +1 · WHT −1 · lines = "x" · unknown code · SSO 750.5 · v1 base "15000" · v1 adjustment −1 · engine 3 · null ⇒ all `SLIP_DATA`.

**DB fixture** (system A; payDate 12:00 BKK; finalized = `stepsJson {"finalized":true}`):
RA1 2031-01 paid 30 Jan PAID v1: e1 (base 3,000,000 · ee 75,000 · WHT 50,000 · net 2,875,000) · e4 V7.
RA2 2031-02 paid 27 Feb APPROVED v2 fin: e1 V2 · e4/e5/e6/e10/e11 V1.
RA3 2031-03 paid 31 Mar PAID v2 fin: e1 V4 · e2 V3 · e9 V9.
RA4 REVERSED (e1, e4) · RA5 DRAFT (e1) · RA6 2031-06 APPROVED **not** finalized (e1, e4).
RA7 2031-07 paid 31 Jul PAID v2 fin: e1 V6 · e3 V5. RA8 period 2031-12 paid **5 Jan 2032** PAID v2 fin: e1 V10. System B: b1 V1 (no filing profile).
Units: e1–e4, e7–e11 home u1; e5 home u2; e6 home u2 borrowed into u1 (open). e4 ↔ user self · e10 ↔ user pay (gate holder) · e11 ↔ self2 · e7 ENDED ↔ ended.

**e1 tax year 2031** (RA1 + RA2 + RA3 + RA7; RA4/RA5/RA6 excluded, RA8 is 2032):
income 3,000,000 + 1,765,000 + 2,000,000 + 4,000,000 = **10,765,000** · tax 50,000 + 0 + 0 + 125,000 = **175,000** · SSO 75,000 + 75,000 + 75,000 + 87,500 = **312,500** · gross 3,000,000 + 1,765,000 + 1,750,000 + 4,000,000 = **10,515,000** · net 2,875,000 + 1,690,000 + 1,675,000 + 3,787,500 = **10,027,500** (= 10,515,000 − 312,500 − 175,000 ✓).
**Cross-check run 13 Nov:** the real H3.6 `issueTaxCertificate` (ANNUAL 2031, e1) on the lane DB produced totalSatang 10,765,000 · totalTaxSatang 175,000 · funds.ssoSatang 312,500 — equal to the hand values (S3.7 slip side RED only because H3.8 is not built).
e1 2032: 1 slip, net 1,725,000. After S4.1 reverses RA7: 2031 = 3 slips, net 10,027,500 − 3,787,500 = 6,240,000.
**e4 (self) 2031**: RA1 V7 + RA2 V1 → count 2 · gross 1,540,000 + 1,600,000 = 3,140,000 · income 1,560,000 + 1,600,000 = 3,160,000 · tax 0 · SSO 150,000 · net 1,465,000 + 1,525,000 = 2,990,000. RA4 (reversed) and RA6 (unfinalized) not listed.

**Certificates** (now 10 Jan 2032, counter `HRSC:2032`): 0001 e1 by owner (salary = BASE 1,800,000 of RA8, the latest issued slip, period 2031-12) · 0002 e4 via inbox (BASE 1,600,000 of RA2) · refusals (e8 no slip, e9 no BASE, system B no profile, pay→e10 own, read-only/manager NO, rejected request) consume nothing (lastNo stays 2) · e1 voided, reissued 0003 · 0004 e3 in S5.1 (BASE 5,000,000 of RA7) · after RA7 is reversed e3 has no issued slip ⇒ certNoSlip · race: 1 of 4 parallel issues ⇒ 0005, lastNo 5.
C1 content (S2.13): `{v:1, docNo:"HRSC-2032-0001", issueDate:"2032-01-10", purpose, employer{name,address}, employee{name,position,startDate,endDate,active}, salary{basis:"MONTHLY_BASE", amountSatang:1800000, words: bahtText(1800000), periodKey:"2031-12", runId}, signerName, disclaimer: SLIP_TEXT.certNote}`; docNo = formatDocNo("HRSC-{ปี}-{0000}", 10 Jan 2032, seq) ⇒ HRSC-2032-0001 / -0012.

## §3 RED table (forced run 13 Nov, lane DB, 59/59 as registered: 54 RED · 5 GREEN; unforced run = SKIPPED, `payslip-rules.ts` absent)
| check | why red now (all "not built", no crash, no typo) |
|---|---|
| S1.1 | no migration `20270110000000_hr_payslip*` |
| S1.2 | no model HrSalaryCertificate / back-relation / scope sys() / qc-env entry |
| S1.3 S1.4 S1.5 | `payslip-rules.ts` / payslip*.ts / `payslip-pdf.tsx` absent (package.json part already equal) |
| S1.7 | none of the 13 files has an `HR H3.8` hunk |
| S1.8 S1.9 S1.10 S1.11 | 4 routes, self page, `payslip.ts`, `payslip-ui.tsx`, `payslip-actions.ts` absent |
| S1.12 | no testids, inventory rows, `hr.slip*`/`hr.salaryCert` messages, visual SPECS "3.8" |
| S5.3 | no `payslip-ui.tsx` |
| S2.1–S2.14 | `slipView`/`slipState`/`taxYearOf`/`yearTotals`/`salaryCertContent`/PDF renderers absent (`∅slipView`, TypeError on null module caught) |
| S3.1–S3.6, S3.8–S3.14, S3.16–S3.19 | `payslip.ts` functions absent (`∅slipForViewer`, `∅mySlips`, `∅issueSalaryCertificate`, …); table HrSalaryCertificate absent (writes tolerated, logged ⚠) |
| S3.7 | H3.6 side ok (10,765,000/175,000/312,500); slip history side undefined |
| S3.15 | listInbox ok; `decideInbox` refuses type CERT ("รายการที่เลือกไม่ถูกต้อง…") — type not added |
| S3.20 | history/PDF/issue functions absent |
| S3.21 | myDocuments lists RA6 (unfinalized) and links to `/app/sys/<sys>/payroll/<run>/slip/<emp>` |
| S4.1 | `downloadPayslipPdf` absent ⇒ nothing waits |
| S4.2 | request/issue functions absent |
| S5.1 S5.2 | `payslip-route.ts` helpers absent |
| S6.2 | `loadPayslipForViewer` returns RA6 (APPROVED v2 unfinalized) to the employee |
| S6.3 | no H3.8 audit rows yet (`rows=0`) |
| S6.4 | no PDFs |
| baseGreen | S1.6 frozen files · S3.0 fixture · S6.1 hotfix loader semantics · X12.1 fitness without env · Z1 residue none |

## §4 Gross vs 40(1) income
The slip shows earnings before deductions (07c "รวมรับ"), H3.4 gross (after claims/advances/late) on the run screen, and the yearly history shows both gross and 40(1) income. They differ by design: REFUND is not 40(1) income; LATE/ABSENT reduce income; ADVANCE/DEDUCTION reduce gross but not income (V4: gross 1,750,000 vs income 2,000,000). The 50 ทวิ reconciles with **income/tax/SSO**, never with gross.

## §5 UI regions, testids, messages, inventory, visual (part of the brief) — 390 first; 1024/1440 centred column
Self page `/app/me/hr/pay/[runId]` = 07c: header (back · "สลิป <เดือน พ.ศ.>" · chip `hr-slip-status`) · dark card `hr-slip-net` (รับสุทธิ ฿) + `hr-slip-bank` ("โอนเข้า <bankMasked> · <payDate>" when PAID) · `hr-slip-earnings` rows `hr-slip-line-<code>` + `hr-slip-earnings-total` · `hr-slip-deductions` + `hr-slip-deductions-total` (deductions red with −) · two ghost buttons `hr-slip-pdf` (`<a download>`) and `hr-slip-cert` (→ certificate card) · `hr-slip-history` rows `hr-slip-hist-<runId>` (ย้อนหลัง) · `hr-slip-note` (slipNote) · tab bar "เงินเดือน" active (H2.10 shell). Line detail = stored qty only ("6 ชม.", "3 รายการ", "16 วัน") — **no rate × multiplier, no "5% เพดาน", no "ไม่ถึงเกณฑ์"** (see §6).
Pay page `/app/me/hr/pay`: `hr-slip-years` → `hr-slip-year-<YYYY>` (count + totals) · certificate card `hr-salarycert-mine` (`hr-salarycert-purpose`, `hr-salarycert-submit`, rows `hr-salarycert-mine-<id>`, `hr-salarycert-dl-<id>`, `hr-salarycert-cancel-<id>`). `hr-self-cert-slot` keeps its testid (holds the card link).
Gate slip page (existing path) renders the same `SlipCard` + `hr-slip-state` banner (DRAFT/NOT_FINAL/WITHDRAWN) + PDF link; keeps `loadPayslipForViewer` as its only data source (qc-hf-hr-privacy S-1). Payroll page section `hr-salarycert` (gate): requests `hr-salarycert-req-<id>` with `hr-salarycert-issue-<id>` / `hr-salarycert-reject-<id>`, `hr-salarycert-new` (employee select + purpose), rows `hr-salarycert-row-<id>`, `hr-salarycert-gdl-<id>`, `hr-salarycert-void-<id>`. ≥ 44 px, tokens only, th + en.
Messages: `hr.slip.*` (title net earnings deductions totalEarnings totalDeductions pdf cert history note …), `hr.slipLine.<20 codes>`, `hr.salaryCert.*` (title request purpose submit issue reject void download pGENERAL…pOTHER) — th = en keys.
Inventory (`scripts/hr-ui-inventory.json`, `wo:"H3.8"`, `oracle:"qc-hr-h3.8"`): one row per testid of the 31 above (pages `/app/me/hr/pay/[runId]`, `/app/me/hr/pay`, `/app/sys/[id]/payroll/[runId]/slip/[employeeId]`, `/app/sys/[id]/hr/payroll`; roles: self pages `staff,payrollSelf`; gate `owner,payroll`; hiddenFor manager/manager-branch/kiosk/member).
Visual (`scripts/visual-hr.mts`, marked hunk): `"3.8": [ {key:"slip-self", path:(i)=>\`/app/me/hr/pay/${i.paidRun}\`, users:["staff","member"], expect:{staff:200, member:404}}, {key:"pay-history", path:()=>"/app/me/hr/pay", users:["staff"], expect:{staff:200}}, {key:"slip-gate", path:(i)=>\`/app/sys/${i.hr}/payroll/${i.paidRun}/slip/${i.namfon}\`, users:["owner","payroll","manager"], expect:{owner:200, payroll:200, manager:404}}, {key:"salarycert-gate", path:(i)=>\`/app/sys/${i.hr}/hr/payroll#hr-salarycert\`, users:["owner"]} ]`. Parity 07c at 390 is the acceptance picture (controller shoots; seed unchanged).


## §6 Mockup 07c lines that cannot be built from stored data
M1 "6 ชม. × ฿66.67 × 1.5" and "3 ครั้ง × ฿50" need rates that are not stored ⇒ shown as stored quantity/count only. M2 "5% เพดาน ฿15,000" / "ไม่ถึงเกณฑ์" state law values as fact ⇒ replaced by "ฐาน <ssoBase>" and a plain 0 (skill: [U] wording). M3 "โอนเข้า KBank •••4321" uses the **current** bank field, not a snapshot ⇒ label it as the account on file. M4 07c "รวมรับ 17,800" is not H3.4's `grossSatang` (17,650): the slip shows earnings before deductions; the run screen keeps gross.

## §7 Frozen files and inherited pins (part of the brief)
**Frozen** (byte-identical vs base): `payroll-rules.ts` (sha), `payroll.ts` (markPaid/computeItem pins h0.1 S4.3, h0.6 S8.4, h1.3 S5.6 — and only payroll.ts writes HrPayAdjustment), `payroll-actions.ts`, `payroll-ui.tsx`, `payroll-run-rules.ts`, `payroll-run-ui.tsx`, `payroll-rules-v2.ts`, `payroll-digest.ts`, `law.ts`, `service.ts`, `hr/scope.ts`, `privacy-shared.ts`, `filings/**`, `bank-files/**`, `account/**`, `approval/**`, `outbox-consumers.ts`, `core/rbac.ts`, `seed-hr-qc.mts`, `fitness-hr.mts`, `qc-hr-lib.mts`, other oracles, `with-gate-lock.sh`, `package.json`, lockfile. HR tab list unchanged (qc-hr-h2.5 S9.5). Every `assertHrCan` in touched action files passes a unitId or the all-branch marker (qc-hr-h1.1 S5.10). No column named lat/lng/accuracyM/photoKey/deviceId/attachmentKey (h1.2 S6.4).
Inherited pins to keep green: qc-hr-h2.11 S13.2 (payroll.ts additions-only — H3.8 adds none) · h0.1 S4.2 schema sha (re-take after the migration) · h0.1 S4.3 / h0.6 S8.4 / h1.3 S5.6 markPaid + computeItem hashes · h1.3 S6.1 per-tag counts (no ytdJson/lawRowIds/filingJson read) · h1.1 S5.10 · h1.2 S6.4 · h2.5 S9.5 tab list · h2.10 myDocuments keys + self testids · qc-hf-hr-privacy S-1 (slip page reads only through loadPayslipForViewer, no client imports).
ORACLE-EDIT expected (controller): qc-hr-h2.11 type/count pins for inbox type CERT (Q3 default).
