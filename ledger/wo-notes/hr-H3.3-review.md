# H3.3 review: law-table engine (independent, read-only)

> Reviewer: Claude (Opus) · 11 Nov 2026 · worktree `/root/projects/shark-hr` · `wip/hr-h3.3` @ dc98d4f37 · base 1d17382f8
> Scope: `git diff 1d17382f8..dc98d4f37 -- src` plus brief, COMMON, builder notes, oracle notes and the fixture. No DB, no typecheck. The only code I ran was one pure tsx probe (no DATABASE_URL) that imports `payroll-rules-v2.ts` and frozen `payroll-rules.ts`. `scripts/_hunt-*` ignored.

## Verdict: **MERGE**
Nothing calls v2, and no law row is ACTIVE on any DB. The arithmetic reproduces by hand on every vector I tried (31 of 31). v1 (`payroll-rules.ts`, `payroll.ts`) is byte-identical. The db.ts guard fails closed. The two MEDIUM findings below sit on paths with no caller yet: M-1 (platform retire) must be fixed before D-1 or before any activation; M-2 (projection basis) must reach the accountant before H3.4 wires v2. No CRITICAL or MAJOR findings.

## Findings
**M-1 MEDIUM: `retireLawRow` can retire an ACTIVE row with no replacement, and runs then fall back silently to an older ACTIVE row** (`src/lib/platform/hr-law.ts:129-141`).
`pickLawRow` takes the latest ACTIVE `effectiveFrom ≤ day`. Example: SSO@1970 (ceiling 15,000) and SSO@2026-01-01 (ceiling 17,500, NA-01) are both ACTIVE. A SUPER_ADMIN retires the 2026 row to fix a typo, intending to create a new draft afterwards. Until the new row is activated, every 2026 pay day picks the 1970 row and nothing refuses. Payslip for a 20,000-baht wage: SSO 75,000 satang instead of 87,500, employee and employer each short 12,500 satang. The same thing happens with tax bands or deductions.
The brief's invariant "superseding cannot leave zero or two ACTIVE rows" holds only for the supersede path. A bare retire can leave zero rows (that is the safe case: LAW_MISSING) or it can uncover an older row (unsafe).
Smallest fix: `retireLawRow` accepts only DRAFT rows. An ACTIVE row leaves ACTIVE only through same-date supersede inside `activateLawRow`. If retiring an ACTIVE row really is needed, add an explicit `{fallbackAcknowledged:true}` flag, refuse when an older ACTIVE row of the same kind exists, and write the fallback row's id into the audit detail.

**M-2 MEDIUM (accountant item, not a code bug): the projection's "regular month" is the base salary only, so variable-pay employees get almost all their WHT in the last months.** (`payroll-rules-v2.ts:300,305`, Q4/B-1)
Probe: commission-only employee (base 0, commission 50,000 every month, single, SSO-eligible).

| month | 1 to 6 | 7 | 8 | 9 | 10 | 11 | 12 |
|---|---|---|---|---|---|---|---|
| WHT (satang) | 0 | 28,613 | 77,945 | 139,612 | 275,723 | 522,389 | **1,015,718** |

The annual total of 2,060,000 is correct, but the December payslip withholds 10,157.18 baht out of 50,000. A flat estimate would withhold 1,716.67 per month.
This hits DAILY/HOURLY `payType` profiles too (H1.1), whenever `baseSalarySatang` is not the real monthly pay. For these people `regularSso = ssoV2(0)` also projects the 83-baht minimum for every remaining month, although their actual SSO is 750.
This is not a regression (v1 withholds 0 all year and leaves 20,600 baht for the employee's ภ.ง.ด.90). It is still a concrete payslip shape the accountant must accept. If they don't, H3.4 needs a "regular" input separate from `baseSatang`.

**MINOR**
- m-1 `deductionsOf` (`payroll-rules-v2.ts:129`) reads `spouse === true`, while v1 (`payroll.ts:413`) uses `!!d.spouse`. A truthy non-boolean (`"true"`, `1`) becomes "no spouse" silently: single 30,000 with spouse would go from WHT 0 to 17,083 per month. Today's writer (`setSalaryProfile`) stores whatever `input.deductions.spouse` it is given. Fix: refuse a non-boolean spouse with `BAD_DEDUCTION`, or H3.4 passes `!!d.spouse`.
- m-2 There is no upper bound in `satang()`. `roundDivHalfUp(income × expenseRateBp)` computes `2·num`, which passes 2^53 once projected income exceeds about 9.0e11 satang (9 bn baht/yr), and then rounds wrong without any error. Unreachable in practice. Fix: cap the inputs (e.g. ≤ 1e11) with `BAD_SATANG`.
- m-3 `law.ts:94` reads through `tenantDb({tenantId:"__shark_law_global__"})`. This is sound today, because the global axis means passthrough plus the new write guard, so it is stricter than raw `prisma`. But it is a ratchet workaround: if `tenantDb` ever adds per-tenant session state (RLS `set_config`), the placeholder id will matter. Suggest a named helper such as `globalReadDb()` in core with a fitness allow-entry, so the pattern isn't copied.
- m-4 For H3.4: `ytdPriorV2` counts only APPROVED/PAID runs. `payDateWindow` allows a pay date up to 365 days from the period, so several periods can share a pay day (back-pay), which makes Q14 reachable. If those runs are computed while siblings are still DRAFT, each one withholds as if it were alone. That under-withholds until the December true-up. H3.4 should recompute at approval, or refuse while a same-day or earlier run of the year is DRAFT. H3.4 must also recompute DRAFT runs whose `lawRowIds` differ from `loadLawSet` at approval time, which covers a law row activated after the draft was computed.
- m-5 A partial year gets no true-up, in two ways. (a) A leaver's last payslip still projects the remaining months: single 30,000 leaving after June has 102,499 satang withheld against an actual tax of 0. (b) A tax year with no December pay day: the Dec period is paid 2 Jan (31 Dec is a bank holiday), so 187,917 is withheld against an actual 58,750 (over by 129,167). v1 behaves the same, and the employee recovers it through ภ.ง.ด.91. This is for the accountant (NA-09 adjacent); a "final payslip ⇒ k = 0" flag in H3.4 would fix (a).

## Item 1: hand recomputations (law = v1 seed rows; baht in working, satang in result)
| vector | working | expected | fixture |
|---|---|---|---|
| SSO-05 165,001 | 1,650.01×5% = 82.5005 → 83 bt | 8,300 | ✓ |
| SSO-06 166,999 | 83.4995 → 83 | 8,300 | ✓ |
| SSO-07 167,000 (half point) | 83.50 → 84 | 8,400 | ✓ |
| SSO-12 1,234,567 | 617.2835 → 617 | 61,700 | ✓ |
| SSO-15 1,500,001 | clamp 15,000 → 750 | 75,000 | ✓ |
| TAX-06 15,000,009 | 0.09 bt×5% = 0.45 sat → 0 | 0 | ✓ |
| TAX-07 15,000,010 | 0.5 sat → 1 | 1 | ✓ |
| TAX-08 21,500,000 | 65,000×5% = 3,250 bt | 325,000 | ✓ |
| TAX-14 123,456,789 | 7,500+20,000+37,500+50,000+234,567.89×25% = 173,641.9725 bt | 17,364,197 | ✓ |
| TAX-16 500,000,000 | 115,000+250,000+900,000 = 1,265,000 bt | 126,500,000 | ✓ |
| WHA-09 30,000 | 360k−100k−60k−9k = 191k → 2,050 bt ÷12 = 17,083.33 | 17,083 | ✓ |
| WHA-21 SSO 0 | net 200k → 2,500 ÷12 = 20,833.33 | 20,833 | ✓ |
| WHA-12 41,666.67 sp+2ch | 500,000.04−289,000 = 211,000.04 → 3,050.002 bt = 305,000 ÷12 = 25,416.67 | 25,417 | ✓ |
| WHA-24 166,666.67 sp+4ch | 2,000,000.04−349,000 = 1,651,000.04 → 115,000+162,750.01 = 27,775,001 ÷12 = 2,314,583.42 | 2,314,583 | ✓ |
| YTD-02 Dec | proj 360k, SSO 9k, net 191k, tax 205,000 − 187,913 = 17,087 ÷1 | 17,087 | ✓ |
| YTD-03 Jun+OT | 150k+40k+30k×6 = 370k; net 201k; tax 255,000; (255,000−85,416)/7 = 24,226.29 | 24,226 | ✓ |
| YTD-04 over-withheld | 205,000−300,000 < 0 → 0 | 0 | ✓ |
| YTD-05 joiner Jul | 25k×6 = 150k; 150k−75k−60k−60k−30k−4.5k < 0 | 0 | ✓ |
| YTD-06 no SSO | 600k−100k−60k = 440k → 7,500+14,000 = 21,500 bt ÷12 | 179,167 | ✓ |
| YTD-07 Mar | 300k+170k+150k×9 = 1.82M; net 1,591,000 → 262,750 bt ÷10 | 2,627,500 | ✓ |
| YR1 m5 | (205,000−68,332)/8 = 17,083.5 → half-up | 17,084 | ✓ |
| YR1 m6 | (205,000−85,416)/7 = 17,083.43 | 17,083 | ✓ |
| YR1 m12 (Σ) | prior 187,917 → 17,083; Σ year = 205,000 | 17,083 | ✓ |
| YR3 Dec bonus | 330k+90k = 420k; net 251k → 5,050 bt; 505,000−187,917 | 317,083 | ✓ |
| YR5 m1 | 1.8M−229k = 1,571,000 → 257,750 bt ÷12 = 2,147,916.67 | 2,147,917 | ✓ |
| YR5 m6 | (26,775,000−10,889,585)/7 = 2,269,345 exactly | 2,269,345 | ✓ |
| YR5 m12 | 27,775,000 − 24,880,655 | 2,894,345 | ✓ |
| YR6 m6 | (2,150,000−895,835)/7 = 179,166.43 | 179,166 | ✓ |
| ITM-03 | gross 0, SSO 500 bt, WHT 0 → net −50,000 | NET_NEGATIVE | ✓ |
| ITM-06 | gross 167,000 bt; 16,700,000−75,000−2,627,500 | 13,997,500 | ✓ |
| YP-01 | r1+r2+r3b+r5x+r6b (excl. r0 2025, r3 REVERSED, r4/r6 DRAFT, r7 later) = 15,021,000 / 85,436 / 375,000 | same | ✓ |

31 of 31 reproduced; I found nothing unreproducible. PD-01/02 (16:59:59.999Z → 06-30, 17:00Z → 07-01) also follow by hand from UTC+7.

## Item 2: v1 parity
Probe: `annualTaxV2` = `annualTaxSatang` on 60k nets with step 9,973 (crosses .5 points): 0 mismatches. `ssoV2` = `ssoContribution` on 286k wages: 0 mismatches.
Undeclared divergences found:
- spouse truthiness (m-1).
- negative `ssoEmployeeYearSatang`: v1 clamps it to 0, v2 refuses `BAD_SATANG`. Not reachable from `computeItem`.

Declared and confirmed:
- negative wage: v1 gives 8,300, v2 refuses (Q13 domain).
- children 1.5: v1 gives 134,167, v2 refuses (B-3).
- children −1: v2 clamps it to 0, like v1 (WHA-23).
- zero wage keeps the minimum base 8,300 (v2 item net −8,300, blocked, NA-08).
- at the ceiling and the floor v2 equals v1.
- v1's expense `×0.5` is exact because annual income is ×12 (even); v2's half-up rounding is immaterial below 200k.

## Item 3: YTD
- Order of operations: projections in integer satang → expense rounded once → net clamped ≥ 0 → tax rounded once → `due = tax − priorWht` → `due ≤ 0 ⇒ 0`, otherwise `round((due)/(k+1))`.
- Over-withholding: clamps to 0 with no refund and no negative carry (the cumulative prior absorbs it, NA-09). Over-withholding within the year cannot happen when the projection is stable, because each step takes ≤ the remaining tax.
- Income falling to zero: still projects the base salary (m-5, M-2).
- Pay day 31 Dec: `lawDayOf` gives 12-31 for any instant before 17:00Z on 31 Dec, and `createPayrollRun` validates the pay date by Bangkok day.
- Same-day runs: counted only when APPROVED/PAID and not the run itself (YP-04). REVERSED and DRAFT runs never count (YP-01).

## Items 4 to 8: verified, held
- Purity: `payroll-rules-v2.ts` has zero imports, no Date/clock/env/async, and does not mutate its inputs. Every money step is integer (`roundDivHalfUp` with floor of integer ratios, bp integers). The only float use is display formatting in `law-ui.tsx`. `net = gross − sso − wht` exactly; `totalsV2` sums the items; a negative net is flagged and never hidden.
- `law.ts`: ACTIVE-only, greatest `effectiveFrom ≤ day`, tie ⇒ LAW_AMBIGUOUS, missing ⇒ LAW_MISSING with the list of kinds. There is no v1 constant anywhere in law.ts or v2. `isLawDay` rejects 2026-02-30. `thaiDateKey` uses the explicit TZ, so it does not depend on the server timezone.
- db.ts hunk: a read allowlist placed before `scopeOf` and checked by model name `HrLawTable` only. All other models are unaffected. New Prisma ops (`createManyAndReturn`, `updateManyAndReturn`) are refused as well. HrLawTable has no relations, so a nested write is impossible. Raw SQL is outside the guard's scope, as for every model (fitness F16.9).
- Platform writer: SUPER_ADMIN is re-read in the same tx. Activation is an advisory slot lock + count + guarded `updateMany` (count = 1), backed by the raw unique index (P2002 ⇒ SLOT_TAKEN). A same-date supersede retires the old row in the same tx; a different date leaves the old row ACTIVE. Two ACTIVE rows on one day are unreachable; zero rows are reachable only via M-1.
- Not wired: v2 and `law.ts` are imported only by the law page, `law-ui`, `platform/hr-law` and the oracles. `payroll-rules.ts` and `payroll.ts` (including the CRM block) show no diff.
- Law page: `canManageHrSettings` ⇒ 404 otherwise. Server components only, with no form, action or platform import. It does not render `approvedById`, `sourceKey` or `supersedesId`. Malformed json falls back to the raw view (`safe()`) instead of crashing. th/en `hr.law` has 49 keys each with no difference. The sidebar line and the settings link are marked.

## Additions to the accountant list (NA)
- NA-11 Basis of the "regular month" for variable-pay, commission-only and DAILY/HOURLY staff (M-2): accept a back-loaded December, or use a declared estimate.
- NA-12 Final payslip of a leaver: true-up (k = 0) or keep projecting (m-5a)?
- NA-13 A tax year with 11 or 13 pay days (Dec period paid in January, back-pay periods sharing one pay day): is month-index-by-pay-day acceptable (m-5b, m-4)?
- NA-14 Regular SSO in the projection uses the base wage (minimum 83 baht when base is 0), not the expected wage.
- NA-15 The WHT deduction for SSO uses the employee contribution as projected, not as actually paid, when SSO wage varies month to month.

## Not verified
- The DB checks (S8.x, tenantDb guard under an interactive `$transaction`, P2002 race): I relied on the builder's green run and the hunter.
- Typecheck and screenshots were not run.
- Behaviour of the oracle with `ORACLE-EDIT` S1.5: read but not run.

## r2 re-check (`git diff dc98d4f37..f7d64c0c6 -- src` · 12 Nov 2026) — **MERGE**
All five rulings are implemented correctly and completely. No MEDIUM or higher findings. One MINOR note.
1. **M-1 retire** (`hr-law.ts:140-154`): an ACTIVE row is refused with `ACTIVE_NOT_RETIRABLE` before any write. The `updateMany` is guarded by `status: DRAFT`, so a row activated concurrently gives count 0 ⇒ `NOT_RETIRABLE`, with nothing written and no audit row. ACTIVE rows can now leave only through same-date supersede, so the silent-fallback hole is closed (oracle S9.1; S8.4 now retires a DRAFT).
2. **F1 role**: `looksSuperAdmin` pre-check → `lockSlot` → `superAdminId` reading `PlatformUser … FOR SHARE` in the same tx. A demotion committed while the activator waits on the lock is seen ⇒ `NOT_ALLOWED`. A demotion after the read blocks on the share lock until commit. Ordering: two activators serialize on the advisory lock, and FOR SHARE locks are compatible with each other; the demoter takes only the row lock. So there is no deadlock cycle. create and retire use the FOR SHARE read directly.
3. **Supersede invariant**: the activate path is unchanged apart from where the role is read: lock → count of other ACTIVE rows in the slot (excluding the same-date predecessor) → guarded retire (count = 1) → guarded DRAFT→ACTIVE (count = 1), all in one tx, with the raw partial unique index as backstop. That leaves exactly one ACTIVE row per (kind, day). Zero rows is now reachable only for a day that never had one (⇒ `LAW_MISSING`, a safe refusal).
4. **F2 safe integers**: `exact`/`mul`/`sum` return their argument unchanged when it is a safe integer and throw otherwise, so they are pure post-checks that cannot alter a value. The one algorithmic change is `roundDivHalfUp`: quotient plus remainder instead of `floor((2n+d)/2d)`. For 0 ≤ n < 2^53 − d both forms are exact half-up and identical.
   - Re-run (pure tsx, no DB): every literal in sso 17 · tax 18 · whtAnnualised 24 · whtYtd 8 · items 6 · years 66 months · ytdPrior 4 gives **0 mismatches**. Parity with frozen v1 also gives 0 mismatches: tax on 60k nets, SSO on 286k wages, and annualised WHT on 45k (wage × spouse × children) inputs.
   - classify, pick and payDay have no changed arithmetic (only `sum` wrappers), so I reasoned about them rather than re-running them. The controller's 51/51 forced ×2 covers them.
   - **Largest safe wage**: the binding step is `income × expenseRateBp` (5,000) ≤ 2^53 − 1 ⇒ projected annual 40(1) income ≤ 1,801,439,850,948 satang. Month 1 with no prior (12 × monthly): the largest monthly base that passes `computeItemV2` is 150,119,987,579 satang = **1,501,199,875.79 baht/month** (found by binary search). Tax bands bind only at net ≈ 2.57e12, and SSO is capped. So no legitimate payroll amount is refused. A future DEDUCTION row with expenseRateBp 10,000 would halve the bound to ≈ 750 M baht/month, still far out of range.
   - m-6 MINOR (doc only): the comment "q × den ≤ num + den stays exact" is untrue for num within `den` of 2^53. That range cannot be reached through the item path, where tax num ≤ 3,500 × 1.8e12 ≈ 6.3e15. Through a direct `annualTaxV2` call it is a window about 10⁴ wide near 9.007e15, where a 1-satang mis-round is conceivable. No fix needed; reword the comment if the file is touched again.
5. **F3 spouse**: `undefined` ⇒ no spouse. `true`/`false` are accepted. Anything else, including `null`, `1` and `"true"`, ⇒ `BAD_DEDUCTION` (probe: null refused; absent = 17,083, equal to v1). This closes my m-1 by failing closed. H3.4 must normalize legacy `personalDeductionJson` before calling v2 (today's writer always stores a boolean, `payroll.ts:74`).
6. **lawDayOf** accepts only a `Date` (strings and invalid Dates ⇒ `LAW_BAD_DAY`). There are no `src` callers yet. The oracle wraps the PD vectors in `new Date(...)` (S6.4) and tests the refusals (S9.5).
7. **No regression**: the diff touches only `law.ts`, `payroll-rules-v2.ts` and `platform/hr-law.ts`. `core/db.ts`, the page, `payroll-rules.ts` and `payroll.ts` are unchanged. v2 is still not wired. Builder green (`hr-H3.3-green.txt`): qc-hr-h3.3 51/51 unforced and forced ×2 with ACTIVE rows 0 after cleanup; qc-payroll 19/19; qc-hr-h1.3 63/63; fitness 53/53 and 9/9.
Not verified by me: the DB checks S8.x and S9.1/S9.2 (the FOR SHARE race against a real Postgres), the controller's current run, and typecheck.
