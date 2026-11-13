# H3.8 builder notes — payslip 07c + PDF · yearly history · salary certificate

Branch `wip/hr-h3.8` (lane 1, QC DB wo-hr-qc-l1 = ep-nameless-sea) from `d59adfe16` (brief + RED oracle). Base for statics `268b81f17` (merge-base with `origin/session/hr`).
Controller rulings Q1–Q13 = recommended defaults (all accepted). Green log: `ledger/wo-notes/hr-H3.8-green.txt`.

## What was built (file:line)
- Migration `prisma/migrations/20270110000000_hr_payslip_salary_cert/migration.sql` — 1 table, CHECK status/purpose/ISSUED completeness/void reason length, UNIQUE (systemId, docNo), partial UNIQUE open request, FK HrEmployee RESTRICT. Applied on the lane DB (`migrate deploy`), `prisma generate` run. Model appended at EOF of `prisma/schema/payroll.prisma`; back-relation `hr.prisma:236`; `core/scope.ts` `HrSalaryCertificate: sys()`; `scripts/hr-qc-env.mts:94` + delete order `:135` (before hrEmployee).
- Pure `src/lib/modules/hr/payslip-rules.ts`: texts th/en `:10/:32` (neutral, slipNote/certNote end with "โปรดตรวจกับนักบัญชีของร้าน") · `slipView :109` (merge by code, count/qty from stored `minutes` only, zero lines dropped except SSO/WHT, v1 V1_OTHER balancing + flag, SLIP_DATA on any mismatch, identity earnings − deductions = net asserted) · `slipState :170` (H3.6 predicate) · `taxYearOf :182` (BKK year) · `yearTotals :194` · `slipIncome :214` (= H3.6 `itemFigures`) · `bankMaskedOf :220` · `salaryCertDocNo :232` · `salaryCertContent :247`.
- Service `src/lib/modules/hr/payslip.ts`: DB gate `memberOf :93` (Membership row, accepted, role must equal passed role, HR system of tenant) → `slipGate :106` (OWNER | hr.payroll.read, DB **and** passed) · `certGate :114` (= H3.5 `bankGateOf`, DB and passed) · `homeInScope :123` (home unit only, both DB and passed scope; unassigned home = all-branch only; borrowings ignored — Q2) · `loadSlip :136` (run `FOR SHARE` in one tx with item + employee — R15) · `slipForViewer :197` · `downloadPayslipPdf :206` · `slipHistory :254` · certificate list/issue/reject/void/download `:283–:449` · self functions `:469–:541` (resolveSelf only).
  - Issue lock order `:329`: advisory `hrsc:<sys>:<employee>` → request row `FOR UPDATE` (NOT_DECIDABLE) → latest ISSUED slip (runs `FOR SHARE OF r`) → BASE line (CERT_NO_SLIP/CERT_NO_BASE) → HrFilingProfile employerName+signerName (PROFILE) → `reserveSeq` last `:371` → own row write. OWN check `:349` (non-OWNER for own linked row). Refusals return before `reserveSeq` (no number consumed); void never frees a number.
- PDF `src/lib/modules/hr/payslip-pdf.tsx` — same react-pdf + Sarabun + `wrapPdf` path as `filings/cert-pdf.tsx` (reuses its `pdfSaraAm`); 1-page slip, 1-page certificate (Thai only, no national ID).
- Routes (helper `src/lib/modules/hr/payslip-route.ts`): `app/me/hr/pay/[runId]/pdf/route.ts`, `app/me/hr/salary-cert/[certId]/route.ts`, `app/sys/[id]/payroll/[runId]/slip/[employeeId]/pdf/route.ts`, `app/sys/[id]/hr/payroll/salary-cert/[certId]/route.ts` — 405 (Allow GET) for HEAD/other before any read, rsc/prefetch 204, 404/409 fixed texts per locale, `application/pdf` attachment no-store nosniff.
- Actions `src/lib/modules/hr/payslip-actions.ts` ("use server", requireTenant + requireMembership, redirect back with short code only).
- UI `src/lib/modules/hr/payslip-ui.tsx` (server only): `SlipCard :80` (07c) · `slipCardFromHotfix :172` · `MySlipYears :240` · `MySalaryCertCard :294` · `SalaryCertSection :356`. Pages: new `app/me/hr/pay/[runId]/page.tsx`; marked hunks in `app/me/hr/pay/page.tsx`, gate slip page, `hr/payroll/page.tsx`, `self-ui.tsx` (cert slot → link to the card; ended = old text).
- Hotfix hunk `privacy.ts:145-146` (self branch requires ISSUED; signature and null contract unchanged). `self.ts:514-526` myDocuments: ISSUED only, href `/app/me/hr/pay/<runId>`, keys unchanged.
- Inbox (Q3) marked hunks: `inbox-shared.ts` type `CERT`, detail `{purpose, requestedAt}`, counts `CERT`; `inbox.ts:48,72,114-118,127,305-309,321,379-383` (visible when `certGateOf`, list via `listSalaryCertificates`, decide → issue/reject). `InboxBatch.tsx` additive CERT detail branch.
- Messages th = en: `hr.slip` (incl. `mon1..12`), `hr.slipLine` (20 codes), `hr.salaryCert`, `hr.self.certOpen`, `hr.inbox.type.CERT`, `hr.inbox.f.cert*`. Inventory: 31 rows `wo:"H3.8"`. `visual-hr.mts` `"3.8"` block (4 specs as in notes §5).

## Decisions
- D1 Numbering (Q8): `reserveSeq` with `(systemId=HR, docType=WHT_CERT, periodKey="HRSC:<CE year of issue, BKK>")`. Counter rows are unique on `(systemId, docType, periodKey)`; H3.6 uses `periodKey "HR50:<taxYear>"` (literal, not configurable), account WHT uses `WTI:<y>-<m>` on the account system ⇒ **no counter collision possible**. Only cosmetic overlap: if an owner sets the 50 ทวิ `certPrefix` to "HRSC", both series print `HRSC-YYYY-NNNN` (different tables/documents, separate counters) — see Q-open 1.
- D2 Tax year for history = BKK year of `payDate` (H3.6). Income = `itemFigures` ⇒ reconciles with 50 ทวิ (S3.7 green). Gross shown separately.
- D3 Gate slip page keeps `loadPayslipForViewer` as its only slip-data source (brief §5 / qc-hf S-1): numbers via pure `slipView`. Consequence: that page has no bank line and no employee code (payroll.ts `payslipData` is frozen and selects id/name/position only), and its branch scope is the H1.1 rule (borrowings widen) — the PDF route/service apply Q2 (home unit only). See debts.
- D4 Bank line labelled "account on file" (M3); SSO line shows the stored base ("ฐาน 15,000"), no rate/cap (M2); quantities = stored `minutes` (PRORATION = days, other minute lines shown as hours, otherwise row count) (M1); "รวมรับ" = earnings before deductions (M4).
- D5 PDF Thai: tone mark + ำ (e.g. "น้ำ") is shaped by Sarabun into a glyph with no ToUnicode entry (extracts as U+FFFD). `pdfToneAm` (payslip-pdf.tsx:72) inserts ZWNJ between tone mark and ำ so names stay searchable/copyable; visual cost: tone mark sits on the nikhahit (slight overlap). Checked by rendering both variants at 400 dpi.
- D6 Self list for SLIP_DATA: any corrupt issued item makes `mySlips`/`slipHistory` refuse `SLIP_DATA` (never repaired, never silently skipped).
- D7 Pay page `/app/me/hr/pay` keeps the H2.10 `hr-self-payslips` list (pinned) and adds `hr-slip-years` + the certificate card below it.
- D8 Audit: downloads (`hr.payslip.download` GATE/SELF, `hr.salarycert.download`) + request/cancel/issue/reject/void only; in-app views not audited; no outbox.

## ORACLE-EDITs (all extend/tighten only)
1. `scripts/qc-hr-h3.8.mts` S1.12 — `testidsOf(src, prefix)` needs ≥ 1 char after the prefix, so bare `hr-slip` / `hr-salarycert` could never be detected (unpassable by construction). Bare ids now taken only from exact `data-testid="hr-slip|hr-salarycert"` attributes.
2. `scripts/qc-hr-h2.11.mts` (controller Q3 ruling) — `TYPE_MODULES` + `payslip`; `ALLOWED_FROM_TYPES` + `certGateOf listSalaryCertificates issueSalaryCertificate rejectSalaryCertRequest`; `COUNT_KEYS` + `CERT`; item vocabulary (S3.1) and per-type count list (S4.1) + `CERT`.
3. `scripts/fitness.mts` F2.2 — `ACCOUNT_DEEP_ALLOWED` + `hr/payslip-rules.ts` (totals, doc-numbering), `hr/payslip.ts` (doc-numbering), `hr/payslip-pdf.tsx` (public-doc-pdf) — the exact deep imports the brief/oracle prescribe (same pattern as H3.6's edit; account/** frozen so no facade re-export).
4. `scripts/qc-hr-h0.1.mts` S4.2 — schema sha re-take (controller rule): `322c86ae…` → `697825669c31…` (model HrSalaryCertificate appended at EOF).
5. `scripts/qc-hr-h3.4-lib.mts` S1.6 — privacy.ts/self.ts may differ from base only when every hunk carries "HR H3.8" (brief §5 mandates those hunks); every other frozen file stays byte-unchanged.
6. `scripts/qc-hr-h3.5.mts` S1.2 — `empSame` strip also ignores the `HrSalaryCertificate[]` back-relation line (same pattern as the H3.6 edit; only that line).

## Debts
- DEBT-H38-1 Gate slip page (D3): no bank line / employee code, H1.1 borrowing scope on the in-app page (PDF/history enforce Q2). Fix = let payroll viewers read `slipForViewer` on that page (needs controller ruling vs. "only data source").
- DEBT-H38-2 ZWNJ in PDFs for tone+ำ (D5) — visual overlap; a font-level fix (ToUnicode for the composed glyph) is out of scope (no new dependency).
- DEBT-H38-3 Visual parity 07c at 390 not shot by the builder (controller shoots; seed unchanged — seed has no certificate rows, so `salarycert-gate` shows empty lists).
- DEBT-H38-4 `hr-self-payslips` (H2.10) and `hr-slip-years` both list slips on `/app/me/hr/pay` (D7) — merge later when the H2.10 pin can move.
- DEBT-H38-5 Inbox CERT items are not batch-summarised (`inboxSummary` returns null ⇒ "open in inbox"); summary text for CERT left for an inbox UI ticket (inbox-shared kept additive).

## Reds left (see green log)
- qc-hr-h3.5 S1.2 and qc-hr-h3.6 S1.2 with the default base (merge-base 268b81f17, which already contains H3.6): `empSame` strips the H3.6 back-relation lines from the current file but the base still has them ⇒ red at base too (checked: stripped(base) ≠ base). Earlier rounds ran these suites with the pre-merge base; with `QC_H35_BASE=17f1adf81` h3.5 = 53/53.
- **qc-hr-h3.6 S1.2 + S1.6 (60/62, also with `QC_H36_BASE=17f1adf81`) — caused by H3.8, NOT editable by me**: S1.2 sees the brief-mandated `HrSalaryCertificate[]` back-relation in HrEmployee; S1.6 freezes privacy.ts/self.ts, where the brief mandates the H3.8 hunks. `scripts/qc-hr-h3.6.mts` is itself in the H3.8 oracle's frozen list (qc-hr-h3.8 S1.6), so an ORACLE-EDIT there turns H3.8 S1.6 red. Needs a controller ruling (proposed: same two edits as 5/6 in qc-hr-h3.6.mts + qc-hr-h3.8 S1.6 tolerating `ORACLE-EDIT (H3.8` hunks in that one file).

## Facade decision (qc-hr-h2.10 S1.5, frozen oracle)
h2.10 S1.5 allows /app/me/hr/** to import only the self facade/actions/ui (+ the two H3.6 entries). Instead of editing that frozen oracle, `self.ts:33-38` (marked hunk) re-exports the H3.8 self entry points (`mySlip mySlips myPayslipPdfGet mySalaryCertGet MySalaryCertCard MySlipYears SlipCard SlipDataNotice mySlipHistory mySlipPdfHref`); the new page/routes and the pay page import from `@/lib/modules/hr/self`. All of them still resolve the employee through `resolveSelf`.

## Open questions
1. Should the 50 ทวิ `certPrefix` setting refuse "HRSC" (cosmetic number overlap, D1)? Needs a filings change (frozen) — controller call.
2. DEBT-H38-1: may the gate slip page call `slipForViewer` for payroll viewers (bank line + Q2 scope in-app)?
