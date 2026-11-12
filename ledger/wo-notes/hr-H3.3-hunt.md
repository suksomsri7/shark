# H3.3 — money hunt (adversarial) · wip/hr-h3.3 @ dc98d4f37 · 11 Nov 2026 · hunter: Claude (Opus)

> 6 probes · `scripts/_hunt-h33-{1..6}.mts` (untracked, deleted) · pure probes via `iso.sh env -u DATABASE_URL -u DIRECT_URL`, DB probes via `iso.sh qc-hr.sh with-gate-lock.sh` (lane QC DB) · no tracked file touched.
> **Verdict: MERGE** — no CRITICAL/MAJOR/MEDIUM. 3 MINOR findings (fix optional, can ride H3.4) + 2 notes. Residue 0 · ACTIVE law rows 0 before and after.

## P1 — differential fuzz v2 vs frozen v1 (pure) · HELD (1 MINOR, see F3)
Grid: 3,913 wages (every SSO floor/ceiling, band edge, edge ×12/÷12/÷6/×2 ±3 satang, 4,000 log-uniform to 1e13, MAX_SAFE / MAX_SAFE/12 / /100 / /3500 / /42000, 2^31, 2^32 ±2) + 13 odd values (−1, −0, 0.5, NaN, ±Inf, "100", null, undefined, MAX+1, 1e300) × children {−1,0,1,2,3,99,100,1.5,NaN,"2",null,undefined} × spouse {true,false,undefined,1,0,"yes","true"} × ssoEligible ⇒ **1,326,988 calls** (ssoV2, annualTaxV2, whtAnnualisedV2, whtYtdV2 month 1).
Observed: `P1 inputs=1326988 wages=3913` · `tax:DIVERGE_HUGE ×2 (n=9007199254740989, v1 float)` · `wha:DIVERGE_SPOUSE_TRUTHY ×96225 e.g. w=17999997 sso=75000 sp=1 v1=2897916 v2=3022916` · `wha:REFUSED_V1_COMPUTES ×448 (all w ≥ MAX_SAFE/12 → BAD_SATANG)` · `ytd:UNSAFE_FIELD ×224 (projectedIncomeSatang=9007199254740996)`.
Zero divergences below 1e12 satang for boolean/undefined spouse; zero `THROW_NO_CODE`, zero undeclared codes, zero negative or fractional outputs; month-1 YTD = annualised for every real input. Non-integer / >99 children ⇒ `BAD_DEDUCTION` (declared B-3).

## P2 — invariants over 2,000 random law rows (pure, exact BigInt reference) · HELD (1 MINOR, see F2)
Random rows within the schema (1–9 bands, any rates 0–10,000 bp incl. non-progressive, edges 1..1e10 apart; SSO rate/min/max random; deduction values random). Per row: ~60 nets (every edge ±2 + log-uniform to 9e15) vs exact BigInt half-up; monotonicity; key-order shuffle of law json; 40 SSO wages vs exact; 20 × 12-month equal-income chains (with shuffled input keys, +1..1000 satang monotonicity per month). **699,347 evaluations.**
Observed: `P2 inputs=699347 laws=2000 firstWrongTaxNet=46637513837080` · `tax:WRONG_HUGE ×1666` — nothing else: 0 `WRONG_REAL`, 0 non-monotone, 0 key-order effects, 0 SSO mismatches, **0 years where Σ12 ≠ annual tax** (settle exact), 0 negative WHT.

## P3 — YTD sequences through computeItemV2 + ytdPriorV2 (pure) · HELD
30,000 employee-years, **294,179 items**: 10 % zero base, 30 % joiners (month 2–12), 15 % not SSO-eligible, spouse/children random, 0–3 adjustments per run of all 6 kinds (10 % spikes to 5,000,000 baht), 10 % months with a second run on the same pay day, statuses random over APPROVED/PAID/PAID/REVERSED/DRAFT (December's last run APPROVED). Prior always rebuilt from history with ytdPriorV2.
Check: Σ counted WHT = max(tax on actual counted income & SSO [independent formula], Σ counted before the last December run); per item net = gross − sso − wht, `blocked` iff net < 0, every number a safe integer, nothing negative but net.
Observed: `P3 items=294179 years=30000` · only `info:overWithheldBeforeDec ×6 (T=0 pre=70083)` = declared NA-09 (reversed/spiky years, December 0, no refund). No year:OVER/UNDER, no REVERSED/DRAFT double count, no throw.

## P4 — effective-date selection + malformed rows (pure law.ts) · HELD
`lawDayOf` at 16:59:59.999Z / 17:00:00Z of every month-end 2026–2030 (120 boundaries) · bad payDates ⇒ `LAW_BAD_DAY` · `pickLawRow` vs brute-force reference on 20,000 random row sets (0–6 rows, mixed ACTIVE/DRAFT/RETIRED, Date and string effectiveFrom, same-date ties) × 3 kinds × 3 shuffles = 180,000 picks · 8 bad day strings · 23 malformed ACTIVE rows into computeItemV2 · missing kinds.
Observed: `picker random sets 60000×3 shuffles mismatches=0` · every boundary correct · every malformed row ⇒ `LAW_SHAPE` (string/float rate, extra key, array, null, min>max, rate>100 %, negative, employer≠employee, no open band, descending/duplicate/0 edge, unsafe edge, empty bands, unknown rounding, missing key) · missing row ⇒ `LAW_MISSING`, never constants · DRAFT-only ⇒ `LAW_MISSING`.
Note N2: `lawDayOf("2026-12-31T23:30:00")` (zone-less string) = `2027-01-01` because JS parses it in the server TZ. Unreachable today (payDate is a Date from the DB); H3.4 should pass Date only.

## P5 — write protection + platform races (lane DB, dates 2190) · HELD except F1
Tenant client (`tenantDb({tenantId: qc-hr-h33hunt-*})`): create, createMany, createManyAndReturn, update, updateMany, updateManyAndReturn, upsert, delete, deleteMany, `$transaction([batch])`, interactive `$transaction(tx ⇒ tx.hrLawTable.update)`.
Observed: `all 11 = LAW_READ_ONLY · fixture status=DRAFT note unchanged · new tenant rows=0` · `FINANCE create=NOT_ALLOWED · forged-role object=NOT_ALLOWED`.
Races: `6 drafts/1 slot: OK×1 SLOT_TAKEN×5 · ACTIVE in slot=1` · `same draft ×4: OK×1 NOT_DRAFT×3 · activate audits=1` · `supersede ×2 same date: OK, SLOT_TAKEN · base=RETIRED, one ACTIVE, one DRAFT`.
Note N1: `executeRaw via tenantDb affected 1 row(s)` (rolled back) — `tenantDb(ctx).$executeRaw*` is not intercepted at runtime (kernel property for every model, not new); for HrLawTable only fitness F16.9 (static regex) stops it.
**F1 — MINOR · platform role TOCTOU.** Observed: `demote mid-activation: role committed=FINANCE before lock release · activation result=OK (ACTIVE by a FINANCE user) · row=ACTIVE`. `superAdminId` reads `PlatformUser.role` with a plain SELECT before `lockSlot`; a demotion committed while the activation waits on the slot lock (or anywhere in the tx) is not seen. Window = the lock wait (≤ 15 s tx timeout). Fix (1 line): read the role `FOR SHARE` (demotion then waits for the activation to commit), e.g. `tx.$queryRaw\`SELECT id, role::text FROM "PlatformUser" WHERE id = ${id} FOR SHARE\``, or re-call `superAdminId` after `lockSlot`.
```ts
// regression check (lane DB; dates ≥ 2190; clean up rows/audits/users in finally)
const dm = (await plat.createLawDraft(sa, { kind: "SSO", effectiveFrom: "2190-05-05", json: L.SSO, note: TAG })).id;
let release!: () => void; const gate = new Promise<void>((r) => (release = r));
const holder = P.$transaction(async (tx) => { await tx.$queryRaw`SELECT count(pg_advisory_xact_lock(hashtextextended(${"hrlaw:SSO:2190-05-05"}::text, 0)))::int AS n`; await gate; }, { timeout: 30000 });
await sleep(1500);
const pending = plat.activateLawRow(sa, dm, { approvedByName: "QC" });
await sleep(2500);
await P.platformUser.update({ where: { id: sa.id }, data: { role: "FINANCE" } }); // with FOR SHARE this blocks until `pending` ends
release(); await holder;
const r = await pending; // expect { ok:false, code:"NOT_ALLOWED" } and row still DRAFT  (today: ok:true, ACTIVE)
```

## P6 — DB invariants behind the reader (rolled-back tx, 2190) + v1 untouched · HELD
Observed: `v1 files changed vs base: none` (payroll.ts, payroll-rules.ts, payroll-actions.ts) · `two ACTIVE same slot: P2002` (LAW_AMBIGUOUS unreachable from DB) · `ACTIVE without approver: check constraint HrLawTable_active_signoff` · `ACTIVE with float json: ACCEPTED` by the DB, but `loadLawSet` → `computeItemV2` on a malformed ACTIVE row ⇒ `LAW_SHAPE` (fails closed; platform writer refuses floats before insert) · `loadLawSet(2190-07-31) → LAW_MISSING SSO,TAX_BRACKET` · `loadLawView leaked-fields=none` · `RESIDUE law=0 · ACTIVE law rows = 0`. Only HrLawTable readers in src: law.ts, platform/hr-law.ts, payroll-rules-v2.ts (types), db.ts/scope.ts (guard/registry), roster-rules.ts (comment) — no engineVersion-1 path reads it, so v1 numbers cannot move.

## Findings
**F2 — MINOR · no overflow guard above 2^53.** `annualTaxV2` adds `(top − prev) × rateBp` in a Number; with the seeded v1 rows the first wrong result is at net **26,302,679,918,950** satang (≈ 263 billion baht/yr): v2 `9205889471632`, exact `9205889471633`. `whtYtdV2` returns `projectedIncomeSatang = 9007199254740996` (not a safe integer, no BAD_SATANG) for monthly `750599937895083`. Unreachable for real payroll; contract says "integer satang out". Smallest fix: in `annualTaxV2` `if (!Number.isSafeInteger(2 * num + 10_000)) fail("BAD_SATANG", "amount too large")` after the loop, and in `whtYtdV2`/`ssoV2` refuse when `projectedIncomeSatang`, `projectedSsoSatang` or `baseSatang * rateBp * 2` is not a safe integer.
```ts
const big = 26_302_679_918_950;
expectCode(() => V2.annualTaxV2(big, L.TAX_BRACKET), "BAD_SATANG"); // today returns 9205889471632 (exact …633)
expectCode(() => V2.whtYtdV2({ monthIndex: 1, currentIncomeSatang: 750599937895083, regularMonthlySatang: 750599937895083,
  priorIncomeSatang: 0, priorWhtSatang: 0, currentSsoSatang: 75000, regularSsoSatang: 75000, priorSsoSatang: 0 }, L.TAX_BRACKET, L.DEDUCTION), "BAD_SATANG");
eq(V2.annualTaxV2(2_000_000_000_000, L.TAX_BRACKET), 699_951_500_000); // still exact below the guard (hand: 6,999,515,000 baht)
```
**F3 — MINOR · spouse flag: undeclared silent divergence.** v1 (`monthlyWhtSatang` truthy test; `payroll.computeItem` `!!d.spouse`) grants the spouse allowance for any truthy value; v2 `deductionsOf` uses `=== true` and silently drops it for `1`, `"yes"`, `"true"`. Input `{monthlyIncomeSatang: 17999997, ssoEmployeeYearSatang: 900000, deductions: {spouse: 1}}`: v1 2,897,916 · v2 3,022,916 (+125,000 satang/month withheld). Today's only writer (`setSalaryProfile` via `payroll-actions.ts:79`) stores a boolean, so not reachable through the UI; H3.4 will read raw `personalDeductionJson`. Smallest fix: treat it like children — `if (d.spouse !== undefined && d.spouse !== null && typeof d.spouse !== "boolean") fail("BAD_DEDUCTION", "spouse must be boolean")`, and declare it next to B-3.
```ts
const law = L; const inp = (spouse: unknown) => ({ monthlyIncomeSatang: 17999997, ssoEmployeeYearSatang: 900000, deductions: { spouse } as any });
eq(V2.whtAnnualisedV2(inp(true), law.TAX_BRACKET, law.DEDUCTION), 2897916);   // = v1
for (const s of [1, "yes", "true", "on"]) expectCode(() => V2.whtAnnualisedV2(inp(s), law.TAX_BRACKET, law.DEDUCTION), "BAD_DEDUCTION"); // today: 3022916 silently
eq(V2.whtAnnualisedV2(inp(undefined), law.TAX_BRACKET, law.DEDUCTION), V1.monthlyWhtSatang({ monthlySalarySatang: 17999997, ssoEmployeeYearSatang: 900000 }));
```

## Not tested
Law page through a real browser/session (cross-tenant gate read from code only: `appSystem.findFirst({id, tenantId: active})` + `canManageHrSettings`; data is global, no tenant data) · Prisma ops added in future versions (guard is an allowlist, so fail-closed by construction) · H3.4 wiring (two runs per month / bonus-only runs feeding `regularMonthlySatang`) — out of scope.

## Cleanup
P5: `cleanup: law rows deleted=12 audits=17 users=2 · RESIDUE law=0 platformUsers=0 · ACTIVE law rows now = 0` · P6: rolled back, `RESIDUE law=0 · ACTIVE = 0` · probe files deleted, `git status --short` clean apart from this note.
