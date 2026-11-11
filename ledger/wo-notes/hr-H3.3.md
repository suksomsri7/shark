# WO H3.3 — law-table engine (pure SSO/WHT v2 · law.ts reader · platform-only writes · read-only law page)

> worktree `/root/projects/shark-hr` · branch `wip/hr-h3.3` cut from `session/hr` + oracle 522864c18 · 11 Nov 2026 · builder: Claude (Opus)
> Oracle `scripts/qc-hr-h3.3.mts` (46 checks) · vectors `scripts/fixtures/hr-h3.3-vectors.json` — **neither edited** · red `hr-H3.3-red.txt` · green `hr-H3.3-green.txt`
> DB: lane QC DB via `scripts/qc-hr.sh` (never qc4.sh) · base check `git merge-base --is-ancestor afcb9bc3 HEAD` ok · no migration
> Controller rulings: Q1–Q15 ACCEPTED as written (DRAFT lifted).

## 0. Checkpoint
- done: v2 engine, law.ts, db.ts guard hunk, platform writer, law page + link + sidebar + messages + inventory, F16.9 comment · 4 feat commits · merge `origin/session/hr` = already up to date (0 incoming commits, no conflicts, no migration) · verification run (see §5).
- next: controller — ORACLE-EDIT S1.5 (§6) + ORACLE-EDIT 2 H1.3-S6.1 (§5) · reviewer + hunter · full regression (picker says FULL: `core/db.ts` touched) · screenshots (§8).
- Step 0 (base, forced): `passed 15/46 (QC_FORCE)` · `BASE-EXPECTATION 46/46 as registered` · residue 0.

## 1. Files touched
| file | new/edited | what |
|---|---|---|
| `src/lib/modules/hr/payroll-rules-v2.ts` | new | pure v2: `ENGINE_VERSION_V2=2` · `ssoV2` · `annualTaxV2` · `whtAnnualisedV2` · `whtYtdV2` · `classifyIncomeV2` · `computeItemV2` (returns `lawRowIds`, `ytdJson`) · `totalsV2` · `ytdPriorV2` · json shape parsers + `assertLawJson`. No imports at all (local `HrLawKind` type). Integer-only arithmetic (`roundDivHalfUp`). |
| `src/lib/modules/hr/law.ts` | new | `pickLawRow` · `pickLawSet` · `lawDayOf` (via `thaiDateKey`) · `loadLawSet(day, db?)` · `loadLawView(day, db?)` · `LAW_MSG` · `isLawDay`. Only reader of HrLawTable (`findMany`, orderBy effectiveFrom, id). |
| `src/lib/platform/hr-law.ts` | new | `createLawDraft` · `activateLawRow` · `retireLawRow` · `listLawRows` |
| `src/lib/core/db.ts` | 1 marked hunk (5 lines) | `tenantDb` throws `LAW_READ_ONLY` for any HrLawTable op outside a read allowlist (findMany/findFirst[OrThrow]/findUnique[OrThrow]/count/aggregate/groupBy) — new Prisma ops fail closed |
| `src/app/app/sys/[id]/hr/settings/law/page.tsx` | new | read-only page |
| `src/lib/modules/hr/law-ui.tsx` | new | server components rendering each kind (no "use client", no form) |
| `src/app/app/sys/[id]/hr/settings/page.tsx` | edited (marked) | link card `hr-settings-law-link` → `/hr/settings/law` |
| `src/app/app/layout.tsx` | edited (1 marked line) | HR sidebar entry "ตารางกฎหมาย" — **not in the brief list**; required by §F.1 / `qc-nav-functions` (every route under sys/[id]/hr must be in the accordion) |
| `src/messages/{th,en}/common.json` | edited | `hr.law.*` (th = en keys). JSON has no comments ⇒ "marked" = the `hr.law` subtree only |
| `scripts/hr-ui-inventory.json` | edited | 7 rows (wo H3.3) |
| `scripts/fitness-hr.mts` | comment only | F16.9 names `platform/hr-law.ts`; rule unchanged |
Not touched: `payroll-rules.ts` (sha check unconditional), `payroll.ts`, `service.ts`, `roster.ts`, prisma/.

## 2. v1 vs v2 differences (worked, satang; law json = seeded v1 rows)
| # | difference | v1 | v2 | proof |
|---|---|---|---|---|
| D1 | rounding true-up (YTD) | single, base 3,000,000: 17,083 × 12 = **204,996** | months 1–4 17,083; m5 (205,000−68,332)/8 = 17,083.5 → 17,084; …; Σ = **205,000** (= annual tax on net 19,100,000 = (19,100,000−15,000,000)×5 %) | S5.2 YR1 · S5.3 |
| D2 | OT counts in 40(1) income | OT 1,000,000 in June: WHT stays 17,083 (Σ 204,996) | June: projected 15,000,000 + 4,000,000 + 3,000,000×6 = 37,000,000; net 37,000,000 − 10,000,000 − 6,000,000 − 900,000 = 20,100,000; tax 255,000; (255,000 − 85,416)/7 = 24,226.29 → **24,226**; Σ year 255,000 | YTD-03 · ITM-02 · YR2 |
| D3 | December bonus 6,000,000 | Dec 17,083 | Dec projected 42,000,000 → net 25,100,000 → tax 505,000 − prior 187,917 = **317,083**; SSO unchanged 75,000 (bonus not SSO wage) | YR3 |
| D4 | SSO wage includes OT/commission/allowance | base 1,000,000 + OT 200,000: SSO on base 1,000,000 → 50,000 | wage 1,200,000 × 500 bp = 60,000 → **60,000** | brief D4 (hand); CLS-02 classify |
| D5 | joiner in July (prior 0) | 30,000 baht/month annualised ×12 → 17,083/month | m7: projected 2,500,000×6 = 15,000,000; expense 7,500,000; personal 6,000,000 + spouse 6,000,000 + child 3,000,000 + SSO 450,000 ⇒ net 0 ⇒ **0** | YTD-05 · YR4 |
| D6 | no ACTIVE law row | always computes with constants | `pickLawSet`/`loadLawSet` ⇒ `{ok:false, code:"LAW_MISSING", kinds:[…]}`; `computeItemV2` without a row ⇒ throws `LAW_MISSING` | S6.3 · S8.2 |
| D7 | not SSO-eligible item reports `ssoWageSatang` | n/a (v1 has no field) | 0 (ITM-04) | S7.3 |
| D8 | net < 0 | allowed, approval blocked later | same, flagged `blocked:"NET_NEGATIVE"` (base 1,000,000, ADVANCE 1,000,000: gross 0 − SSO 50,000 − WHT 0 = −50,000) | ITM-03 |
Parity: S2.2 (SSO ≥ 2,700 wages), S3.2 (tax grid), S4.2 (960), S5.4 (month-1 YTD = v1, 160) all equal frozen v1.

## 3. FOR THE ACCOUNTANT (HQ23) — brief §9, unchanged, plus builder findings
NA-01 SSO ceiling 17,500/min base from 1 Jan 2026 + back-pay · NA-02 ALLOWANCE SSO/40(1)/exempt · NA-03 mid-year bonus spread vs bonus month · NA-04 previous employer income (50 ทวิ) · NA-05 unseeded allowances · NA-06 SSO special cases (v2 refuses `employerEqualsEmployee:false` with LAW_SHAPE until answered) · NA-07 late/absent deduction vs SSO wage / 40(1) · NA-08 zero-wage month (v2 keeps min base like v1) · NA-09 over-withheld year (v2 = 0, no in-run refund) · NA-10 sign-off of seeded values, rounding tokens, 169 vectors, Q4 formula.
Builder additions:
- B-1 Projection uses **base salary** as the regular month for both income and SSO (Q4 "regular = base salary"); a fixed monthly ALLOWANCE paid every month is therefore taxed as a one-off in its month, not spread — confirm with NA-02/NA-03.
- B-2 Expense line rounded half-up to satang before the 100,000-baht cap (immaterial under seeded values: below 200,000 baht income the net is under the exempt band).
- B-3 Negative child count clamps to 0 (v1 behaviour, vector WHA-23); a non-integer or > 99 count is refused `BAD_DEDUCTION` (new code, v1 would multiply it).
- B-4 Superseding a row with the **same** effective date retires the old row in the activation tx; a row with a **later** date leaves the old row ACTIVE for its own period (history stays computable).

## 4. Access — who gains / loses what
- Gains: anyone who can open HR settings (OWNER, holders of `hr.employee.create`, incl. branch-scoped managers) can view `/app/sys/[id]/hr/settings/law` — national law values only, no employee/salary data, no row ids/sourceKey/approvedById/supersedesId. SUPER_ADMIN platform users gain server functions to create/activate/retire law rows (no UI yet, D-1). Any platform user can `listLawRows`.
- Loses: every `tenantDb(ctx)` caller loses the ability to write `HrLawTable` (was possible — H1.3 F1; S8.3 now 7/7 refused, reads unchanged). FINANCE/SUPPORT and forged platform objects are refused (role re-read from `PlatformUser` inside the tx).
- Staff / plain members / payroll viewers without settings rights: 404 (same gate as the settings page). No change for any payroll run.

## 5. Verification (summary line · exit) — all through `iso.sh qc-hr.sh with-gate-lock.sh env QC_H06_BASE=d350c26c…`
| suite | result | exit |
|---|---|---|
| qc-hr-h3.3 unforced | passed 45/46 (S1.5 only · NA 10/10 skipped · Z1 residue none) | 1 |
| qc-hr-h3.3 forced ×2 | passed 45/46 ×2 (same) | 1 / 1 |
| qc-hr-h3.3 throw-away copy with S1.5 path fix | passed 46/46 | 0 |
| qc-payroll (FREEZE) | ผ่าน 19/19 | 0 |
| qc-hr-h1.3 | passed 62/63 — S6.1 RED: `law.ts+4, payroll-rules-v2.ts+4` new reads of HrLawTable/lawRowIds/ytdJson vs base 1d17382f (by design: H3.3 is the first reader). Law seed digest checks green. ORACLE-EDIT 2 | 1 |
| qc-hr-h0.6 | passed 55/55 | 0 |
| qc-hr-payadjust | ผ่าน 27/27 | 0 |
| qc-payroll-reverse | PASS 14/14 | 0 |
| qc-crm-c3.3 | 90/90 | 0 |
| qc-account-cpa | 107/107 | 0 |
| qc-hf-hr-privacy | 194/194 | 0 |
| qc-nav-functions | 10/11 — S5 red only for BOOKING (/booking/calendar, /booking/day; known, not H3.3); HR complete | 1 |
| fitness no-env / env | 53/53 · 53/53 | 0 / 0 |
| fitness-hr no-env / env | 9/9 · 9/9 (F16.3, F16.8, F16.9 green) | 0 / 0 |
| typecheck (once, gate lock, heap 12288) | 0 errors | 0 |
Picker (`pick-suites.sh … 522864c18 HEAD`): `# FULL (mode=lean · 10 changed files)` — core/db.ts ⇒ full set is the controller's run.
Pre-commit fitness passed on all commits (no --no-verify).

ORACLE-EDIT 2 (`scripts/qc-hr-h1.3.mts:781-791`, S6.1): exclude the sanctioned H3.3 reader/engine from the "no new reader" control, e.g. `.filter((p) => !["src/lib/modules/hr/law.ts", "src/lib/modules/hr/payroll-rules-v2.ts"].includes(p))` on `files`, or run it with `QC_H13_BASE=<H3.3 head>` once H3.3 is in base. Reason: brief R3/R6/Q15 require law.ts to read HrLawTable and v2 to return `lawRowIds`/`ytdJson`; no other file gained a read.

## 6. ORACLE-EDIT request
- **S1.5** (`scripts/qc-hr-h3.3.mts:202-203`): reads `src/messages/th.json` / `en.json`, which do not exist — the repo's messages are `src/messages/{th,en}/common.json` (as `qc-hr-h2.2.mts:47-48` uses). Hunk: `jsonOf("src/messages/th.json")` → `jsonOf("src/messages/th/common.json")`, same for en. With that edit applied to a throw-away copy (deleted, not committed) the run is `passed 46/46 (QC_FORCE)` exit 0. Without it S1.5 stays RED on `msgs,pending` only (page/loader/readOnly/testids/inventory/tab all pass).
- No vector disagreed after analysis: two first-run mismatches were my bugs (WHA-23 negative children must clamp like v1; ITM-04 SSO wage 0 when not eligible) and were fixed in code.

## 7. Decisions for the controller
1. `layout.tsx` sidebar line (outside brief list) — required by qc-nav-functions.
2. F16.3: the page's real gate is `canManageHrSettings` (same as the settings page); it also calls `hrScopeOf`/`isAllBranches` (hr/scope) to show "shared by every branch" text — that is what makes F16.3 count it, same as the settings page.
3. `law.ts` default db = `tenantDb({tenantId:"__shark_law_global__"})` (HrLawTable is global ⇒ no filter added; writes blocked) because F5.1 raw-prisma ratchet is full (50/50). Callers (H3.4) pass their tx.
4. Extra codes beyond the contract: `BAD_DEDUCTION`, `BAD_DAY` (v2) · `LAW_READ_ONLY` (db guard) · platform: NOT_ALLOWED, BAD_KIND, LAW_BAD_DAY, LAW_SHAPE, BAD_NOTE, BAD_SUPERSEDES, NOT_FOUND, NOT_DRAFT, NO_APPROVER, SLOT_TAKEN, NOT_RETIRABLE.
5. Law view shows RETIRED rows too (labelled เลิกใช้) and rows of every kind incl. an empty MIN_WAGE group.

## 8. Screenshot run (CONTROLLER-RUN · 1440×900 / 1024×768 / 390×844)
URL `/app/sys/<HQC HR system id>/hr/settings/law` · users: `owner` (all branches), `manager` (hr.employee.create, all branches), `manager-branch` (branch-scoped; text "sharedBranch") ⇒ page; `staff`, `payroll`, `member` ⇒ 404. State on lane DB/QC4: 4 v1 rows DRAFT, 0 ACTIVE ⇒ `hr-law-pending` banner visible, every row chip "ร่าง · รอนักบัญชียืนยัน", effective date "ค่าตั้งต้นของระบบ". Also `/hr/settings` for the new `hr-settings-law-link` card. Mockup parity exceptions per Q8: no "เพิ่มช่วงมีผลใหม่"/"ร้านยืนยัน", no "ในร้านตอนนี้" column.

## 9. Debts
D-1 backoffice UI for create/activate/retire (functions only) · D-2 H3.4 wires `computeItemV2`, stores `lawRowIds`/`ytdJson`, blocks the run on `LAW_MISSING` with `LAW_MSG` · D-3 accountant sign-off (H3.10) · D-4 OT 2×/3× + MIN_WAGE rows · D-5 no prod script for activation (runbook below is manual).

## 10. Prod runbook
1. Deploy code (no migration). Nothing activates a law row; every run keeps engineVersion 1 (v2 is not wired until H3.4). The 4 seeded v1 rows stay DRAFT; the law page shows "รอนักบัญชียืนยัน".
2. After the accountant signs off (HQ23, NA-10): a SUPER_ADMIN (platform owner) runs, from a one-off server-side script against prod with owner GO, `createLawDraft(pu, {kind, effectiveFrom:"<real start date>", json, supersedesId:<v1 row id>})` for SSO, TAX_BRACKET, DEDUCTION, then `activateLawRow(pu, id, {approvedByName:"<accountant name>"})`. Each step writes `PlatformAuditLog hr.law.*`. `pu` is re-read from PlatformUser — a non-SUPER_ADMIN is refused.
3. Never edit json in place; a change = new draft + supersedesId → activate (same-date predecessor is retired in the same tx).
