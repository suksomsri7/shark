# H3.4 — builder notes (phase A · lane 3 · branch wip/hr-h3.4)

Base bcf352f88 (session/hr) + brief r3 commits 9bed5989d…7fa22097b. Phase A = everything that does not need H3.2 (`attendance-pay.ts`), per controller instruction 12 Nov.

## Done in phase A
- **Migrations** `20270106000000_hr_payroll_v2_kinds` (2× `ALTER TYPE … ADD VALUE` only: `HrPayItemKind.REFUND`, `HrPaySource.CARRY_FORWARD`) and `20270106000001_hr_payroll_v2` (nullable `HrPayrollRun.stepsJson JSONB`, `inputDigest TEXT`; `HrPayAdjustment.consentAt TIMESTAMP(3)`, `consentById TEXT`). Schema: 4 marked additions in `payroll.prisma`. Applied on lane DB `wo-hr-qc-l3` (`prisma migrate deploy` — no complaint about `20261227000000_svc_h`).
- **Pure** `hr/payroll-run-rules.ts` — `computeRunItemV2(input, lawSet)` + `RUN_V2_DEFAULTS` + `SSO_WAGE_DEFAULT`; imports only `./payroll-rules-v2`, `./ot-rules`. Formulae exactly design §1 (line order: BASE · PRORATION · per day [wage · HOLIDAY_PAY · HOLIDAY_WORK · UNPAID_LEAVE] · UNPAID_CAP · additions by id · LATE/ABSENT by id · advances (carry-in first) · claims (carry-in first)). BigInt products, one rounding per line. Extra outputs for phase B: `e0Satang`, `eSatang`, `ssoWageComponents`, `finalPeriod`, `ytdJson` (H3.3 shape of the regular projection).
- **`payroll-rules-v2.ts`** — 2 marked `HR H3.4` hunks: `parseSsoJson` accepts optional `wageComponents` (7 tokens, distinct, BASE required, else `LAW_SHAPE`); `classifyIncomeV2` accepts `REFUND` (adds to pay, not to 40(1)/SSO wage). Seed law row untouched ⇒ no H1.3/H3.3 pin change.
- **`ot-rules.ts`** (R11 pure part) — `otAmount({…, normalDayMin?})`: new `otDayMinutes(law, N)` = min(hours×60, N); monthly/daily divisor and HOLIDAY_WORK normal cap use it; default ⇒ H2.9 vectors unchanged. 5 marked hunks.
- **`payroll.ts`** (marked): `RUN2_TEXT` (17 fixed texts of design §5 — brief says 18, design lists 17), `RUN2_WARN` (10 texts §5.1), `V2_VARIABLE_PAY = false`, `payrollEngineOf` / `getPayrollEngine` / `setPayrollEngine` (OWNER only · caps int 0–10000 · v2 needs `loadLawSet(lawDayOf(now))` ok else `LAW_MSG` · lock `hr:clockpolicy:<sys>` · audit `hr.payroll.engine` · warning `capRaised` above 10/20 %); v1 `createPayrollRun` throws `PayrollInputError(engineV2)` in an engine-2 shop (checked under the period lock); `requestAdjustment` accepts `REFUND` only in engine-2 shops (`refundV1`); v1 `buildRunRows` never locks/binds a `REFUND` row (left unbound ⇒ stranded list, design §2 last bullet).
- **`payroll-actions.ts`** (R8): `reverseRunAction` ⇒ `hr.payroll.reverse`; `decideAdjustmentAction` REJECTED ⇒ `hr.payadjust.reject` (both the system-level and the branch-level assert), APPROVED keeps `.approve`.
- **Messages** `hr.run2.*` th = en (flat keys — `msgParity` requires string values, so warnings are `warnCapRaised` … not a nested `warn` object).

## ORACLE-EDIT
- `scripts/qc-hr-h1.3.mts` S1.9: `HrPaySource` may carry exactly one trailing label `CARRY_FORWARD` (H3.4 `_kinds` migration); the 7 H1.3 labels stay exact and ordered.
- `scripts/qc-hr-h1.3.mts` S6.1: `hr/payroll-run-rules.ts` ignored for the tokens `lawRowIds`/`ytdJson` only (pure calculator returns them for payroll.ts to store, R4). Phase B: payroll.ts will need a `PAY_MARKED["HR H3.4"]` count there.
- `scripts/qc-hr-h0.1.mts` S4.2 `SCHEMA_SHA` 97a2390d… → 3ff49315… (payroll.prisma after the additive H3.4 schema). H3.2 will also move this pin — expect a merge conflict on that one line; re-take the sha of the merged file.

## Vector check (my arithmetic vs fixture)
All 72 vectors + 5 OTN vectors reproduce from the design formulae with no tuning. Spot checks by hand: V14 (31 × 33,333 = 1,033,323 ⇒ cap +33,323), V68 (T0 2,060,000 / T1 3,215,000 ⇒ 1,155,000 + regular 171,666), V69, V71/V72 (SSO components), OTN-02/04. I also re-ran the §B DB literals through the pure engine by hand (mA/mB/eC Sept + Oct, eS, S7.1): all agree with the oracle (mB Sept WHT 11,458 + 50,000; Oct 14,167). **No disagreement found.**

## Interpretations (please confirm)
1. `holidayKind SHOP` for DAILY/HOURLY: worked minutes = `holidayWorkMin − otHolidayWorkMin` paid as ordinary DAY_WAGE/HOUR_WAGE (V56); daily `m = min(N, workMin + that)`.
2. `POS_SALE_LINE` deductions (POS commission clawback) classed **OVERPAY** with CRM_COMMISSION / OT_REQUEST; design lists only those two — every other source (MANUAL, null, INVENTORY_ISSUE, …) is DAMAGES.
3. `CLAIM_CAPPED` = the cap was strictly the binding limit (`capLeft < amount && capLeft < availableLeft`); `CAP_NEEDS_CONSENT` = without consent the shop caps (above 10/20 %) would have applied more.
4. Blocked (`NET_NEGATIVE`): unworked rows still applied (cap at E0); advance/claim lines present with amount 0; `carry` and `receivable` empty (approve refuses anyway).
5. SSO `BASE` component = `max(0, E − Σ HOLIDAY_WORK)` (guards a LATE/ABSENT row eating the holiday-work premium).
6. A day outside the period, a duplicate day, a duplicate adjustment id or amount ≤ 0 ⇒ `BAD_INPUT`.
7. `setPayrollEngine` with engineVersion ∉ {1,2} ⇒ own text "รุ่นเครื่องคิดเงินเดือนต้องเป็น 1 หรือ 2" (not one of RUN2_TEXT).
8. Key change R8: staff who hold `hr.payadjust.approve` but not `hr.payadjust.reject` can no longer reject; staff with `hr.payroll.approve` but not `hr.payroll.reverse` can no longer reverse (brief: no new keys, so this is intended — owners should be told).

## Left for phase B (needs H3.2 or builds on it)
createPayrollRunV2 / recomputeDraftRun v2 / approve v2 (maker-checker, INPUTS_CHANGED, carry rows) / reverse CARRY_BOUND / previewPayrollRunV2 / confirmBranchHours / holidayWorkPricedInTx + `ot.ts` settlement hunks (N frozen in basisJson, subtract run-priced minutes) / setAdjustmentConsent / `hr/index.ts` exports / `payroll-run-ui.tsx` + page + engine card + inventory rows / S7 H3.2 gates. Note for phase B: the v1 duplicate text literal must stay only inside `createPayrollRun` (qc-hr-h0.1 S4.1 counts it) — the v2 create must build it from the same constant without repeating the template literal.

## Suites (phase A head, lane DB wo-hr-qc-l3, forced)
qc-hr-h3.4 32/58 (all S1.2–S1.6 · S1.8 · S2.* · S3.* · S4.1 · S4.17 · S7.1/S7.2 n/a · S8.1/S8.2 · X12.1 · Z1 green; RED-by-phase: S1.1 (UI file) · S1.7 (dispatch + ot.ts/index.ts hunks) · S1.9 (UI) · S1.10 (holidayWorkPricedInTx) · S4.2 v2 half · S4.3–S4.16 · S5.* · S6.*) · seed-hr-qc 33/33 · qc-hr-h3.3 51/51 · qc-hr-h1.3 63/63 (after the 2 ORACLE-EDITs) · qc-hr-h0.1 67/67 · qc-hr-h2.9 58/58 · qc-payroll 19/19 · qc-payroll-reverse 14/14 · qc-hr-payadjust 27/27 · qc-hf-hr-privacy 194/194 (F1-10 needs the literal `assertHrCan(auth, "hr.payadjust.approve")` in decideAdjustmentAction — kept as if/else) · fitness + fitness-hr env/noenv exit 0.
