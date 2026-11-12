# H3.3 — Law-table engine: pure SSO/WHT v2 (`hr/payroll-rules-v2.ts`) reading `HrLawTable` by effective date (`hr/law.ts`) · platform-only law writes · read-only law view (08) · brief for oracle writer → builder

> Status: **DRAFT — defaults in force unless the controller overrules** (Q1–Q15 below). Lane 1, started early as an independent WO. **Not Mig** (H1.3 ships `HrLawTable`, `HrLawKind/Status`, `engineVersion`, `HrPayrollItem.ytdJson/lawRowIds`). MONEY WO: hunter required.
> Base `session/hr` 1d17382f8 · branch `wip/hr-h3.3` · oracle `scripts/qc-hr-h3.3.mts` (46 checks) · vectors `scripts/fixtures/hr-h3.3-vectors.json` · notes `ledger/wo-notes/hr-H3.3-oracle.md` · red `hr-H3.3-red.txt`.
> DB: this lane's QC branch only — `bash scripts/iso.sh bash scripts/qc-hr.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 pnpm exec tsx scripts/qc-hr-h3.3.mts` (acceptance re-run on QC4 by the controller).
> Read first: COMMON §A, §C.3, §C.4, §F, §G · plan row H3.3 + §1 ("law values are data") + §9 D15 · HQ8, HQ9, HQ23 · `hr-brief-H1.3.md` R3 + `wo-notes/hr-H1.3-review.md` F1 · review §8 row 8 · mockup `08-settings-ai.body.html:100-160`.

## 0. Premise
H3.3 = **pure functions + one reader + one platform writer + one read-only page**. It does not touch `payroll.ts` (H3.4 wires `engineVersion = 2`), does not recompute any run, and does not change v1 behaviour: `payroll-rules.ts` stays byte-identical and every v1 run keeps its numbers. No tax or SSO value is introduced by code: v2 reads only `HrLawTable` rows; every vector cites the H1.3 seed row it uses.

## 1. Facts as built (base 1d17382f8)
- F1 `payroll-rules.ts` (sha 75a66c0c…, FREEZE): SSO 5 %, base clamp 1,650–15,000 baht, round to whole baht half-up, employer = employee; annual tax bands 0/5/10/15/20/25/30/35 % at 150k/300k/500k/750k/1M/2M/5M, rounded once to satang; WHT = annualise base × 12, expense 50 % cap 100k, personal 60k, spouse 60k, child 30k, SSO ≤ 9k, ÷ 12 `Math.round`, ≥ 0.
- F2 `payroll.ts:403-416` computeItem: SSO and WHT on **base salary only**; adds/deducts change gross only; `net = gross − sso − wht` can be < 0 (approval blocked, `:1029`).
- F3 `HrLawTable` (`payroll.prisma:176`): global (no tenant), `kind`, `effectiveFrom @db.Date`, `json` (integers only), `status DRAFT|ACTIVE|RETIRED`, `sourceKey @unique`, `approvedById/Name/At`, `supersedesId`; raw: one ACTIVE per (kind, effectiveFrom); ACTIVE needs approvedAt + (id or name).
- F4 Seed `scripts/hr-seed-law-draft.mts`: 4 rows `v1:SSO|TAX_BRACKET|DEDUCTION|OT`, effectiveFrom 1970-01-01, **DRAFT**, values = v1 constants, digest `0ed9de8c…`, verified against frozen v1 on ≥ 2,000 inputs. No MIN_WAGE row (HQ25), OT 1.5 only (HQ10). On lane DB l1: 4 rows present, all DRAFT, 0 ACTIVE rows in the table.
- F5 H1.3 review F1: `tenantDb` passes every operation on global models unchanged ⇒ a tenant context can create/activate a law row. Fitness F16.9 forbids `hrLawTable` writes under `src/lib/modules/**`, `src/app/**`, `src/lib/ai/**` ("until H3.3"); `src/lib/platform/**` is the allowed place.
- F6 Platform auth: `PlatformUser {role SUPER_ADMIN|SUPPORT|FINANCE}`, `requirePlatformRole(pu, roles)` trusts the object passed; audit = `PlatformAuditLog`.
- F7 Mockup 08: "ระบบเลือกแถวที่มีผล ณ วันจ่ายเงินเดือน" · "ภงด.1 รายเดือน = ภาษีทั้งปีจากประมาณการเงินได้ ÷ 12 · ปรับทุกเดือนตามเงินได้จริง" · shows shop-side "เพิ่มช่วงมีผลใหม่"/"ร้านยืนยัน" and a per-employee tax column.

## 2. Contract (oracle header is the exact text)
- R1 **Vectors cite seeded rows.** Fixture `law` = `LAW_V1_ROWS` json (checked, S1.6); every vector names `v1:<KIND>@1970-01-01`. Expected values are literals from an independent exact-fraction reference outside the repo; 65 v1-domain literals were also checked equal to frozen v1 at write time.
- R2 **v1 parity.** With law json = seeded v1 rows: `ssoV2` = `ssoContribution` (wage ≥ 1 satang), `annualTaxV2` = `annualTaxSatang`, `whtAnnualisedV2` = `monthlyWhtSatang`, and `whtYtdV2` in month 1 with no prior and current = regular = v1 (property grids, ≈ 4,400 inputs).
- R3 **Purity.** `payroll-rules-v2.ts`: only `import type`; no db, clock, random, process, fetch, async. Inputs never mutated. `ENGINE_VERSION_V2 = 2`. `law.ts` is the only reader of `HrLawTable` (`findMany`, `orderBy` effectiveFrom then id); no writes there.
- R4 **Platform-only writes.** `src/lib/platform/hr-law.ts`: `createLawDraft`, `activateLawRow(pu, id, {approvedByName})`, `retireLawRow` (+ optional `listLawRows`). The platform user is re-read from `PlatformUser` inside the call; SUPER_ADMIN only (Q9). Activation = guarded DRAFT→ACTIVE `updateMany` (count = 1), sets approvedById/Name/At, json never edited (a change = new row + `supersedesId`, old row RETIRED), `PlatformAuditLog` `hr.law.activate|retire|create`. `core/db.ts`: one marked hunk makes `tenantDb(ctx).hrLawTable` writes throw (create/createMany/update/updateMany/upsert/delete/deleteMany); reads unchanged (Q10). Not importable from `src/app/app/**`, `src/lib/modules/**`, `src/lib/ai/**`.
- R5 **Money.** Integer satang in and out; refusals are thrown `Error` with `.code`: `LAW_SHAPE` (row json not the seeded shape, unknown rounding token, float), `BAD_SATANG`, `BAD_MONTH`, `BAD_KIND`. Rounding exactly where v1 rounds (SSO whole baht half-up; annual tax once; monthly WHT half-up) plus the expense line (Q4). WHT ≥ 0. Item: `net = gross − ssoEmployee − wht` exactly; `blocked = "NET_NEGATIVE"` iff net < 0; `totalsV2` = Σ items.
- R6 **Effective dating** (`law.ts`): `pickLawRow(rows, kind, day)` = the ACTIVE row with the greatest `effectiveFrom ≤ day`; DRAFT/RETIRED ignored; none ⇒ `LAW_MISSING`; two ACTIVE on that date ⇒ `LAW_AMBIGUOUS`; bad day ⇒ `LAW_BAD_DAY`; result independent of input order. `pickLawSet` refuses with the list of missing kinds — **never falls back to v1 constants**. `loadLawSet(day, db?)` (db = prisma or a tx). `lawDayOf(payDate)` = Bangkok calendar day.
- R7 **v1 frozen.** `payroll-rules.ts` sha unconditional; `payroll.ts` unchanged in H3.3 (n/a once H3.3 is in base).
- R8 **Law view** (mockup 08, read-only): `src/app/app/sys/[id]/hr/settings/law/page.tsx` → `loadLawView(day)` → groups per kind with `effectiveFrom, status, inForce, values, approvedByName, approvedAt`; `pendingSignOff` when SSO/TAX/DEDUCTION has no ACTIVE row in force; DRAFT rows labelled "รอนักบัญชียืนยัน"; no form, no action, no platform import; never `approvedById`, `sourceKey`, `supersedesId`. Testids `hr-law-table`, `hr-law-row-<kind>` + inventory rows; `hr.law.*` th = en; tab link from HR settings.

## 3. Intended v1 → v2 differences (worked, satang)
- D1 **Rounding true-up (YTD, Q4).** Single, base 30,000, SSO 750: annual tax 205,000. v1: 17,083 × 12 = **204,996**. v2 (YR1): 17,083 ×4, 17,084, 17,083, 17,084, 17,083, 17,084, 17,083, 17,084, 17,083 = **205,000**. December alone after 11 × 17,083 = 17,087 (YTD-02).
- D2 **40(1) items in WHT (HQ9).** Same person, OT 10,000 in June. v1: 17,083 every month (OT ignored, Σ 204,996). v2 (YR2): Jan–May as D1, June–Dec 24,226 · 24,226 · 24,226 · 24,227 · 24,226 · 24,227 · 24,226; Σ **255,000** = tax on net 201,000.
- D3 **December bonus 60,000** (YR3): v1 December 17,083; v2 December **317,083** (bonus tax 300,000 withheld in its month); bonus not SSO wage.
- D4 **SSO wage includes OT/commission (HQ8).** Base 10,000 + OT 2,000: v1 SSO 50,000 (base only); v2 60,000 (wage 12,000 × 5 %).
- D5 **Joiner in July**, single, 30,000: v1 annualises ×12 ⇒ 17,083 per month (102,498 withheld for the year); v2 projects 6 months (180,000) ⇒ net 25,500 ⇒ **0**.
- D6 **No law row ⇒ refusal.** v1 always computes with constants; v2 returns `LAW_MISSING` (H3.4 must block the run with `LAW_MSG`).

## 4. Oracle (46 checks: 31 RED-by-design · 5 GREEN controls · 10 NEEDS-ACCOUNTANT skips)
S1 statics (6: frozen sha, purity, sole reader, platform-only, read-only page, seed digest) · S2 SSO (3) · S3 tax (3) · S4 WHT annualised (2) · S5 WHT YTD (5) · S6 effective dating (4) · S7 classify/item/identities/prior/purity (6) · S8 DB (5: v1 rows present; loadLawSet on rolled-back ACTIVE fixtures dated 2190; tenantDb write guard; platform lifecycle with fixture PlatformUsers; law view DTO) · NA.1–10 · X12.1 fitness · Z1 residue. Literal vectors: 169 (59 v1-domain + 110 v2) + ≈ 4,400 generated parity inputs. Red run on base: unforced SKIP exit 0; forced 15/46, every RED for "module absent" except S8.3 (tenantDb **wrote** all 7 operations = F1 reproduced), residue 0.

## 5. Builder
Files: `src/lib/modules/hr/payroll-rules-v2.ts` (new) · `src/lib/modules/hr/law.ts` (new) · `src/lib/platform/hr-law.ts` (new) · `src/lib/core/db.ts` (one hunk `// HR H3.3 ▸ … ◂`) · `src/app/app/sys/[id]/hr/settings/law/page.tsx` (+ optional `hr/law-ui.tsx`) · HR settings tab link · `src/messages/{th,en}.json` (`hr.law.*`, marked) · `scripts/hr-ui-inventory.json` · `scripts/fitness-hr.mts` (F16.9 comment: name `platform/hr-law.ts`, keep the rule). Nothing else; never `payroll.ts`/`payroll-rules.ts`. Oracle ×3 on the lane DB (unforced + forced ×2), picker suites, typecheck once.

## 6. DoD
Oracle 46/46 incl. NA skips with reason · `qc-payroll` FREEZE · `qc-hr-h1.3` · fitness both modes · typecheck 0 · reviewer + hunter (money) · controller re-run on QC4 · **no row activated on any shared DB** (Q3).

## 7. Debts (not in H3.3)
D-1 backoffice page for law rows (create/activate/retire) — functions only now · D-2 H3.4 writes `lawRowIds`/`ytdJson` and blocks on `LAW_MISSING` · D-3 accountant sign-off of every vector before go-live (H3.10) · D-4 OT 2×/3× + MIN_WAGE rows (HQ10/HQ25).

## 8. Open questions (default in force)
- Q1 Effective date = **Bangkok calendar day of `HrPayrollRun.payDate`** (mockup 08); tax year and month index come from the same day.
- Q2 Selection = ACTIVE only, greatest `effectiveFrom ≤ day`; same-date tie ⇒ refuse `LAW_AMBIGUOUS` (deterministic; DB unique makes it unreachable); missing ⇒ refuse, never constants.
- Q3 **The oracle writer did not activate the seeded rows.** Controller asked for "law seed ACTIVE on the lane DB"; activation = sign-off (HQ23, CHECK needs an approver) and the seed script writes DRAFT only. Default: rows stay DRAFT everywhere; oracles use rolled-back or swept fixture rows (dates ≥ 2190) with approvedByName "QC FIXTURE — not a sign-off". Overrule = controller names a QC-only activation.
- Q4 WHT method = **YTD cumulative**: k = 12 − month; projected income = prior + current + regular × k; projected SSO likewise; expense = min(round(income × 50 %), 100k) (rounding immaterial under seeded values: below 200k income the net is under the 150k exempt band); annual tax on projected net; WHT = max(0, round((annual tax − prior WHT) ÷ (k + 1))). December = full true-up. Regular = base salary.
- Q5 Classification: 40(1) income = base + OT + COMMISSION + BONUS + ALLOWANCE; SSO wage = base + OT + COMMISSION + ALLOWANCE (bonus excluded, HQ8); DEDUCTION/ADVANCE reduce gross only (v1); gross clamps at 0 (v1); unknown kind ⇒ `BAD_KIND`. ALLOWANCE and late/absent deductions are accountant items (NA-02, NA-07).
- Q6 YTD prior = items of APPROVED/PAID runs, same Bangkok year, pay day ≤ this pay day, current run excluded (another run on the same day counts; DRAFT/REVERSED never).
- Q7 Pure functions throw `.code`; platform functions return `{ok:false, code}` (thrown also accepted by the oracle).
- Q8 Law view readers = anyone who can open HR settings (public law data, no employee data). Mockup parity exceptions: no shop-side "เพิ่มช่วงมีผลใหม่"/"ร้านยืนยัน" (platform-only, ruling F1) and no "ในร้านตอนนี้" per-employee column (salary-derived, privacy).
- Q9 Platform writers = SUPER_ADMIN only (FINANCE/SUPPORT refused).
- Q10 Guard lives in `core/db.ts` (not in the plan's file list; required by the F1 ruling) as one marked hunk.
- Q11 `computeItemV2` (pure composition) is in H3.3; H3.4 only wires it.
- Q12 OT/MIN_WAGE rows are shown, not read by v2 SSO/WHT (OT multipliers = H3.2).
- Q13 Zero-wage month: parity domain starts at 1 satang; v2 keeps v1 (min base) until NA-08 is answered.
- Q14 Same pay day, two runs: allowed; prior includes the other approved run (Q6).
- Q15 Snapshot fields (`lawRowIds` sorted ids, `ytdJson` = prior + projection) are returned by v2; H3.4 stores them.

## 9. FOR THE ACCOUNTANT (HQ23) — vectors registered, skipped until answered
NA-01 SSO ceiling 17,500 / min base from 1 Jan 2026 (HQ8, D15) and back-pay · NA-02 ALLOWANCE: SSO wage? taxable 40(1) or exempt reimbursement? · NA-03 mid-year one-off bonus: spread (Q4) or withhold in the bonus month? · NA-04 joiner's income from a previous employer (50 ทวิ) in the projection? · NA-05 allowances not seeded (parents, disability, insurance, PVD, RMF/SSF/ThaiESG, mortgage, donations, spouse with income) · NA-06 SSO special cases (hired at ≥ 60, foreign workers, exempt classes, employer rate ≠ employee rate) · NA-07 late/absent deduction reduces SSO wage / 40(1) income? · NA-08 zero-wage month: 0 or min base? · NA-09 over-withheld year: 0 + ภ.ง.ด.91 refund (default) or employer refunds in December? · NA-10 sign-off of every seeded value, the rounding tokens and all 169 vectors, plus the Q4 formula itself.
**r2 additions (12 Nov 2026 · review `wo-notes/hr-H3.3-review.md`, controller ruling 6 — no code change):**
NA-11 basis of the "regular month" for variable-pay, commission-only and DAILY/HOURLY staff (review M-2): accept a back-loaded December (example: commission-only 50,000 baht/month, single ⇒ WHT 0 in Jan–Jun, then 28,613 · 77,945 · 139,612 · 275,723 · 522,389 · **1,015,718** satang; year total 2,060,000 correct) or use a declared estimate · NA-12 a leaver's final payslip: true-up (k = 0) or keep projecting? · NA-13 a tax year with 11 or 13 pay days (December period paid in January; back-pay periods sharing one pay day): is month-index-by-pay-day acceptable? · NA-14 regular SSO in the projection = SSO of the base wage (minimum 83 baht when base is 0), not the expected wage · NA-15 the SSO allowance in WHT uses projected employee SSO, not SSO actually paid, when the SSO wage varies.
🔴 **H3.4 must not wire v2 for commission-only / daily / hourly staff until NA-11 is ruled.**
