# H3.6 — builder notes (government filings · branch wip/hr-h3.6)

Base: 18c92a7f4 (+ gate-lock cherry-pick) merged with the controller head **51793cdb0** (H3.4 payroll run v2, H2.12, H3.5 bank files) — merge was clean (no conflicts in qc-hr-h0.1, messages, inventory or visual-hr). Lane DB `wo-hr-qc-l1`: `prisma migrate deploy` (H3.4's 20270106000000/1 + this WO's 20270108000000), `prisma generate`, seed-hr-qc 34/34 ×3.

## What was built
| part | files |
|---|---|
| migration | `prisma/migrations/20270108000000_hr_filings/migration.sql` — 4 CREATE TABLE, 21 CHECKs, UNIQUE (systemId, docNo), partial UNIQUE live certificate (systemId, employeeId, taxYear) WHERE voidedAt IS NULL, 2 FK → HrEmployee ON DELETE RESTRICT. No ALTER of existing tables. |
| schema | `payroll.prisma` one marked block (4 models) · `hr.prisma` HrEmployee + 2 back-relation lines (`filingPerson`, `taxCertificates`, marked) · `core/scope.ts` sys() ×4 · `hr-qc-env.mts` ×4 + delete order |
| pure | `hr/filings/{texts,figures,rd,sso,cert,build}.ts` (build = re-export barrel) · `cert-pdf.tsx` |
| server | `hr/filings/service.ts` · `actions.ts` ("use server") · `download-route.ts` · 3 routes (`payroll/filing/[fileId]`, `payroll/tax-cert/[certId]`, `me/hr/tax-cert/[certId]`) |
| UI | `hr/filings/ui.tsx` — FilingSection (payroll page), FilingSettingsCard (settings page), MyTaxCertCard (/app/me/hr/pay) · messages `hr.filing.*` (th = en, flat keys) · 38 inventory rows (wo H3.6) |

Figures: `itemFigures` reads only `snapshot.{whtIncomeSatang, whtOneOffSatang, ssoWageSatang}` (v2) / `snapshot.{baseSalarySatang, ssoEligible}` (v1) + item columns `whtSatang addSatang ssoBaseSatang ssoEmployeeSatang ssoEmployerSatang`; nothing recomputed; no lines/lawRowIds/ytdJson read; payroll.ts untouched; nothing writes HrPayAdjustment/run/item/outbox.

Finalized rule: a v2 run counts only when `stepsJson.finalized = true` (read in SQL — H3.4 exports no helper). PND: left out + warning `NOT_FINAL` (fields = periods, file-level, first). SSO: refusal `NOT_FINAL` (text notFinal). 50 Tawi: non-final runs are left out of the figures (the oracle's S3.10 expects e1 issued at 9,500,000 while R6 is unfinalized) — the certificate list shows `stale` once the run later finalizes.

## Lock order (issue 50 Tawi, one tx per certificate)
1. `pg_advisory_xact_lock(hashtextextended('hr50:<system>:<employee>:<year>', 36))` — per employee/year queue; losers wait, then see the winner's live row ⇒ `certExists` without consuming a number.
2. `HrPayrollRun … FOR SHARE` (runs of the tax year) + reads (items, employee, filing person, profile, live certificate).
3. `reserveSeq(tx, {systemId: HR system, docType: WHT_CERT, prefix, periodKey: "HR50:<CE year>", startNo: 1})` = **last lock** (single-statement INSERT … ON CONFLICT … RETURNING of the account engine).
4. read-only count of live lower docSeq (formSeq) · INSERT of the tx's own HrTaxCertificate row. P2002 (live unique) ⇒ re-read ⇒ `certExists`.
A failed issue rolls the counter back with the tx ⇒ numbers stay contiguous (S5.1/S5.2). Void never frees a number. Counter is under the HR system ⇒ identical with or without an ACCOUNT book (S3.13).
File generate/download: one tx, runs FOR SHARE, manifest insert / downloads+1 last (download mismatch throws inside the tx so the count rolls back).

## H3.5 debts closed (marked `HR H3.6` hunks)
- `bank-files/encode.ts#hasBaseChar` (new, shared by filings `rd.ts#hasBase`): a name with no base character after dropping whitespace, controls/bidi/zero-width and combining marks is "no name". Bank files: KBANK_PCT/KTB and CSV/XLSX ⇒ `ENCODING` naming the payee (existing text; no new reason key ⇒ H3.5 texts fixture untouched). Filings: `firstName`/`lastName`/`title` ⇒ INCOMPLETE field (PND + SSO), profile names ⇒ PROFILE.
- `bank-files/generic.ts#formulaLike`: ＝ ＋ － ＠ (U+FF1D U+FF0B U+FF0D U+FF20) after leading whitespace (incl. U+3000) count like ASCII. New checks S8.1/S8.2 (RED on the base: marks-only name produced a file; ＝/＠ cells passed).

## Golden / notes disagreement (not bent silently — controller please rule)
- **SSO notIncluded `contributionSatang`**: notes §2 say "contribution = ee + er", vector `sso.G3A.notIncluded` has p8 `contributionSatang: 45000` = **ee only** (item ee 45,000 · er 45,000 ⇒ ee+er would be 90,000). Implemented per the vector (S2.12 green); consistent with the preview row (tax = ee). Header/`taxSatang` stay Σee+Σer (= vector totals 244,400 / 295,000). If the ruling is ee+er, change one expression in `sso.ts` (`out(…)`) and the vector.
No other golden disagreed: G1/G2/G2X/G2W/G2M*/G3*/DB1–DB3A byte-exact, RD samples round-trip.

## ORACLE-EDITs (all marked in place)
1. `qc-hr-h3.6` S1.2 empSame: the strip regex left each removed relation line's own `\n`, so it could never pass once relations exist ⇒ strip with the newline.
2. `qc-hr-h3.6` S1.6: bank-files may differ only in files where every hunk carries "HR H3.6" (controller-ordered debt closure); frozen oracle scripts (`scripts/qc-*`) only in hunks carrying a marked `ORACLE-EDIT (H3.6` line (here: qc-hr-h3.5); all other frozen paths byte-unchanged.
3. `qc-hr-h3.6` S1.8: `testidsOf` needs ≥1 char after the prefix ⇒ the bare id `hr-mytaxcert` was undetectable ⇒ also scan prefix `hr-my`.
4. `qc-hr-h3.6` new S8.1 / S8.2 (debts) + `runDebts()`.
5. `qc-hr-h3.5` S1.2 empSame: ignore only the two H3.6 back-relation lines.
6. `qc-hr-h2.10` S1.5: me/hr files may also import exactly `hr/filings/ui` and `hr/filings/download-route` (brief R14/R15 put the self card and route there; both go through resolveSelf).
7. `qc-hr-h0.1` SCHEMA_SHA re-take 3c20e3c0… → 9d453db5… (4 models appended at EOF — additive).
8. `fitness.mts` F2.2: brief R2/S1.3/S1.4 prescribe deep imports `account/totals` + `account/doc-numbering` (account/** frozen, facade has neither) ⇒ allowlist per file (`hr/filings/cert.ts`, `service.ts`; `cert-pdf.tsx` → `account/public-doc-pdf#wrapPdf`). Any other deep account import stays illegal.

## Not followed / deviations
- Totals columns of HrFilingFile are `DECIMAL(20,0)` (not Int): a 1ก total exceeds 2^31 satang (21.4 M baht) for ordinary shops; BigInt would break `JSON.stringify` in the oracle and DTOs. DTOs return numbers.
- The list DTO `fileName` masks the 13-digit employer tax ID as `•••4` (S3.15 forbids IDs in DTO JSON); the download header and the generate result keep the full RD/SSO file name.
- PDF: does **not** use `pdfSafeThai` (ํ+า). With it the subset's ToUnicode maps the nikhahit glyph to U+0E4D, so copy/search gives "จากัด"; with raw ำ react-pdf drops one trailing char per ำ per line (measured). Fix: raw ำ + one trailing space per ำ per line, and the first text of each font weight has a standalone า (title bold, "ตามมาตรา" regular) so า maps to U+0E32. Verified by S2.16/S3.11 and a rendered PNG.
- 50 Tawi requires payee nationalId, first/last name and district/province/postcode (address is printed); payer taxId, branch, name, address, signer, prefix (PROFILE).
- No visual-hr spec added for the new section (debt below).

## Open risks
- SSO 135 bytes, UTF-8 width, wage column, PDF/e-mail validity remain [U] (labels shown, never blocking).
- `DASH` for "/" is [U] (default per ruling Q9).
- Self card is rendered after SelfPay on /app/me/hr/pay (H2.10 page owns layout).
- h3.4 S1.7/S1.10 are red on any branch whose merge-base already contains H3.4 (they need diffs vs base; files untouched by H3.6 — `git diff 51793cdb0 -- payroll.ts payroll-rules-v2.ts ot*.ts payroll-actions.ts index.ts` is empty). Not caused here.
- nav-functions S5 red = known HOTEL/BOOKING routes from the main sync (no HR route missing).

## Debts
- visual-hr spec + mockup-06 parity screenshot for the filing step.
- certificate "stale" is informational only (no auto-reissue).
- bank refusal for a marks-only name reuses the ENCODING text (a dedicated reason would need an H3.5 texts-fixture ORACLE-EDIT).
