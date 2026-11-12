# H3.4 — payroll run v2 · design companion (formulae · "must" ledger · accountant list)

Companion of `ledger/hr-briefs/hr-brief-H3.4.md` (DRAFT). The brief wins on contract wording; this file holds the full arithmetic, the collected "must" items and the accountant list. Hand arithmetic of every oracle vector: `ledger/wo-notes/hr-H3.4-oracle.md`. Vectors: `scripts/fixtures/hr-h3.4-vectors.json`.

## 1. Pure calculator `hr/payroll-run-rules.ts` · `computeRunItemV2(input, lawSet)`

### 1.1 Input (all money integer satang, all minutes integer)
`{ employeeId?, payType "MONTHLY"|"DAILY"|"HOURLY", baseSalarySatang, dailyRateSatang|null, hourlyRateSatang|null, ssoEligible (default true), deductions {spouse?: boolean, children?: int} (default {}), periodKey "YYYY-MM", startDate|null, endDate|null ("YYYY-MM-DD"), normalDayMin N (60–720, default 480), catCapBp (0–10000, default 1000), totalCapBp (0–10000, default 2000) (r2 L1), monthIndex 1–12 (Bangkok month of the pay date), prior {incomeSatang, whtSatang, ssoSatang} (default 0s), days[], adjustments[] }`
- day `{ workDayId, day, dayClass WORKDAY|DAY_OFF|HOLIDAY|UNSCHEDULED, holidayKind PUBLIC|SHOP (HOLIDAY days; default PUBLIC — r2 L4), workMin, paidLeaveMin, unpaidLeaveMin, holidayWorkMin, holidayPaidMin, unplannedMin, review[], otHolidayWorkMin }` — the first 7 minute fields are copied from `HrWorkDay`; `otHolidayWorkMin` = Σ `HOLIDAY_WORK` segment minutes of APPROVED, settled `HrOtRequest` rows whose work date is that day (H2.9 `segmentsJson`). Missing minute fields = 0. `otWorkdayMin` / `otHolidayMin` are **not inputs** (never priced — H2.9 pays requested OT).
- adjustment `{ id, kind OT|COMMISSION|BONUS|ALLOWANCE|REFUND|DEDUCTION|ADVANCE, sourceType|null, amountSatang > 0, consent?: boolean (s.77 written consent on file — r2 L1), carryCls?: "DAMAGES"|"OVERPAY" (carry-in rows) }` — the APPROVED rows bound to the run. Leaver: `endDate` inside the period ⇒ final period (r2 L8).
- `lawSet` = `LawSetV2` from `law.ts loadLawSet(lawDayOf(payDate))` (`{SSO,TAX_BRACKET,DEDUCTION}` rows `{id,json}`).

### 1.2 Refusals (`{ok:false, code}`, checked in this order)
`LAW_MISSING` (a row of the set absent) · `BAD_INPUT` (N ∉ 60–720, capBp ∉ 0–10000, a minute ∉ int 0–1440, a money value not a safe non-negative integer, periodKey/day malformed) · `BAD_MONTH` · `NO_RATE` (DAILY without positive daily rate, HOURLY without positive hourly rate) · `BAD_KIND` (kind outside the 7) · any H3.3 `LawEngineError` code (`LAW_SHAPE`, `BAD_DEDUCTION`, `BAD_SATANG`) passes through as `{ok:false, code}`.

### 1.3 Pay lines (signed, one rounding per line, in this order)
Let `dayMin = min(480, N)` (s.68: "monthly wage ÷ (30 × average normal working hours per day)" [V] — the shop's `normalMinutesPerDay` IS that average; the min(8 h) guard only changes anything for a shop whose normal day is above 8 h, which s.23 limits anyway; same guard as H2.9 `otDivisors`) (r2 L3 — no vector change).
1. MONTHLY `BASE` = base (ref `profile`).
2. MONTHLY `PRORATION` (HQ6, **r2 L2 — one divisor ÷30 everywhere**) when employment ∩ period is not the whole calendar month: d = calendar days employed in the period; earned = `min(base, halfUp(base × d / 30))`; amount = earned − base (ref `employment`, minutes field = d). Flag `PARTIAL_MONTH`. A full calendar month (28, 29, 30 or 31 days) is always exactly base (no line); in a 31-day month 30 employed days already reach the cap (V53 line 0). ÷30 = s.68 + ฎีกา 7646/2542 + ป.พ.พ. 193/6 [V2]; there is no statutory proration divisor [U].
3. Per day ascending (`day` string), within a day in this order:
   - DAILY `DAY_WAGE`: m = min(N, workMin + paidLeave′); amount `halfUp(daily × m / N)`; line only when m > 0.
   - HOURLY `HOUR_WAGE`: m = workMin + paidLeave′; amount `halfUp(hourly × m / 60)`.
   - `paidLeave′` = paidLeaveMin, but 0 on a HOLIDAY day (never holiday pay + leave pay for one day — flag `HOLIDAY_LEAVE` when paidLeaveMin > 0 on a HOLIDAY day).
   - DAILY/HOURLY `HOLIDAY_PAY` (s.56(2) traditional holidays [V]) on a HOLIDAY day with `holidayKind PUBLIC` (the shop's announced traditional holidays) and holidayPaidMin > 0: DAILY `halfUp(daily × min(N, hp) / N)`; HOURLY `halfUp(hourly × hp / 60)` (hours of an hourly worker's holiday = N [U] → warning). MONTHLY: none (salary covers every holiday). Weekly day off (DAY_OFF): **no pay** for daily/hourly (s.56(1) exception [V]); annual leave and other paid leave are paid through paidLeaveMin (s.56(3), s.57).
   - r2 L4: `holidayKind SHOP` (shop closure, not one of the traditional holidays) for DAILY/HOURLY: no holiday pay; minutes worked that day are ordinary wage (`DAY_WAGE`/`HOUR_WAGE` 1×) and the HOLIDAY_WORK line is not produced; flag `SHOP_HOLIDAY` [U]. Monthly staff: unchanged.
   - `HOLIDAY_WORK` (s.62/63): m = max(0, holidayWorkMin − otHolidayWorkMin); bp = 10000 if MONTHLY or a PUBLIC holiday (s.62(1): entitled to holiday pay ⇒ +1×), else 20000 (s.62(2): weekly day off of a daily/hourly employee ⇒ 2×). Holiday OT (3×, s.63) is paid only by H2.9 requests. Amount `halfUp(rate × m × bp / den)`: MONTHLY den = 30 × dayMin × 10000 (rate = base) · DAILY den = dayMin × 10000 · HOURLY den = 60 × 10000. The bp values come from H2.9's `OT_LAW_DEFAULT`/`raised(otLawOf(...))` (holidayWorkPaidBp / holidayWorkUnpaidBp) — never lower.
   - MONTHLY `UNPAID_LEAVE`: amount `−floor(base × unpaidLeaveMin / (30 × N))` (H3.2's rule: ÷30÷N, floor = employee's favour).
   - Flags: `UNPLANNED` when any unplannedMin > 0 (not paid — decision §3 Q7); `WORKED_ON_LEAVE` when a day's review holds it (not paid).
4. `UNPAID_CAP` (ref `employment`): if the pay lines sum below 0, one line `+(−sum)` so E0 = 0; flag `UNPAID_CAPPED`.
5. E0 = Σ lines so far.

### 1.4 Adjustments
- Additions (code = kind, ref = adjustment id, sorted by id): OT, COMMISSION, BONUS, ALLOWANCE (taxable), REFUND (new kind — refund of a **claim**: not 40(1), not SSO wage). r2 L6: the refund of over-deducted lateness/absence (H3.2 refund, ALLOWANCE with sourceType LATE_RULE/ABSENT_RULE) is wage for time worked ⇒ taxable **and** back in the SSO wage of the refund period (V64); this ruling overrides H3.2 notes D-H32-refund-kind ("non-taxable reversal kind").
- Unworked time (code = `LATE_RULE`/`ABSENT_RULE`): DEDUCTION rows whose sourceType is LATE_RULE or ABSENT_RULE (H3.2). Applied in id order up to E0 (`min(row, remaining E0)`); excess dropped, never carried (flag `UNWORKED_CAPPED`). They reduce the **taxable and SSO wage** (no-work-no-pay, NA-07 default). Line amount = −applied, `requestedSatang` = row amount.
- Advance class (code `ADVANCE`): kind ADVANCE (incl. carry-in rows `sourceType CARRY_FORWARD`), order: carry-in first, then id.
- Claim class (code `DEDUCTION`), r2 L1 categories of s.76 para 2 ("in each case ≤ 10 %, together ≤ one fifth" [V]):
  - **DAMAGES** = s.76(4) damages/shortage: MANUAL/null DEDUCTION and INVENTORY_ISSUE (stock charge) — and their carry rows.
  - **OVERPAY** = recovery of overpaid wage: CRM_COMMISSION clawback and OT_REQUEST negative delta — not literally listed in s.76 [U]; treated as its own capped category so it can never exceed the damages cap.
  - Order: carry-in first (category from `carryCls`), then id. Union dues (2), welfare/co-op loans (3) and provident fund (5) have no source in HR V2 — **employee loans s.76(3) are deferred** (no loan product invented).

### 1.5 Order of computation
1. E = E0 − unworkedApplied.
2. whtIncome = E + OT + COMMISSION + BONUS + ALLOWANCE · ssoWage = E + OT + COMMISSION + ALLOWANCE (H3.3 Q5: bonus not wage) · REFUND in neither (classifyIncomeV2 hunk).
3. SSO = ssoEligible ? `ssoV2(ssoWage, SSO.json)` : 0 — r2 L5: base clamp and rate come only from the dated SSO row (2569–2571: 1,650–17,500 ⇒ max 875 ฿; 2572–2574: max 20,000 ⇒ 1,000 ฿; from 2575: 23,000 — กฎกระทรวง 2568 [V]; each step = a new row, no code change, V58), 5 %, half-up to whole baht (s.46 [V2]; V59/V60). The 83 ฿ minimum on a tiny wage is charged and never blocks by itself: flag `SSO_MIN_BASE` (warning); only if it makes net negative does the existing NEGATIVE_NET rule apply. Reported `ssoWageSatang` = 0 when not eligible (as H3.3 ITM-04). Late/absent rows reduce the SSO wage [V — ค่าจ้างคือเงินที่จ่าย].
4. regular month for the projection: MONTHLY = baseSalarySatang (unprorated); DAILY/HOURLY = E (placeholder until NA-11; not wired in DB). regularSso = ssoEligible ? ssoV2(regular).employee : 0.
5. (r2 L7) the projection multiplies by the **actual remaining pay periods of the year** (this one + 12 − monthIndex), which is RD Por.96/2543 ข้อ 1(1) for a mid-year starter ("start 1 April ⇒ 9 periods") [V]; the first 150,000 ฿ exempt band, bands, 50 %/100,000 expense, allowances all come from the law rows. WHT = `whtYtdV2({monthIndex, currentIncome: whtIncome, regularMonthly: regular, prior…, currentSso: SSO, regularSso, priorSso}, TAX, DEDUCTION).whtSatang` (HQ9 YTD; deductions passed normalised: `spouse: d.spouse === true`, children int — D-9).
6. available = E + taxable adds + REFUND − SSO − WHT. < 0 ⇒ `blocked: "NET_NEGATIVE"`, flag NEGATIVE_NET, nothing applied (lines amount 0), net = available (approve refuses, as H0.2 R3).
7. advanceApplied = min(Σ advance class, available), in order. Advance = wage paid early from the same employee's wage; limited only by net ≥ 0 — **[U]**: settings help shows "เงินเบิกค่าจ้างล่วงหน้าหักคืนจากค่าจ้างงวดนี้ — โปรดตรวจกับนักบัญชี/ที่ปรึกษาแรงงาน" (an advance larger than the work already done is a loan = s.76(3), deferred).
8. Caps (r2 L1): W = lpaWage = E + OT + COMMISSION + ALLOWANCE (whether OT belongs in the base is [U]). Legal defaults 1000 bp per category / 2000 bp total; shop settings `catCapBp`, `totalCapBp` 0–10000 (raising above 10/20 % shows the s.76 warning, never a block). Per claim, in order: effCat = consent ? catCapBp : min(catCapBp, 1000); effTot = consent ? totalCapBp : min(totalCapBp, 2000); applied = max(0, min(amount, ⌊W×effCat/10000⌋ − used[category], ⌊W×effTot/10000⌋ − usedTotal, available left)). So without written consent an item never passes the legal 10/20 % even when the shop raised its caps (flag `CAP_NEEDS_CONSENT` when the shop caps would have taken more); with consent it may go up to the shop setting (V62/V63). Outputs `catCapSatang` / `totalCapSatang` = the shop-setting limits.
9. carry = `[{cls "ADVANCE"}, {cls "DAMAGES"}, {cls "OVERPAY"}]` uncollected amounts (zeros omitted) ⇒ flag CARRY_FORWARD; flag CLAIM_CAPPED when a cap (not available pay) limited a claim. **r2 L8 final period** (endDate inside the period): nothing is carried — the same list is returned as `receivable` (flag RECEIVABLE): an employee receivable for H3.7, because the final wage is due within 3 days (s.70 [V2]) and cannot be withheld beyond the caps (V65/V66).
10. net = available − advanceApplied − claimApplied (≥ 0).
11. addSatang = taxable adds + REFUND · deductSatang = unworkedApplied + advanceApplied + claimApplied · **grossSatang = E0 + add − deduct = net + SSO + WHT** (identity; the stored `grossSatang` keeps v1's meaning "payable before SSO/WHT", so the JV of `postPayrollJV` stays balanced).
12. Output also: `lines` (`{code, ref, day|null, minutes|null, amountSatang, requestedSatang?}`), `whtIncomeSatang ssoWageSatang ssoBaseSatang ssoEmployeeSatang ssoEmployerSatang whtSatang availableSatang advanceAppliedSatang claimAppliedSatang catCapSatang totalCapSatang carry receivable addSatang deductSatang grossSatang netSatang blocked flags(sorted) lawRowIds(sorted) ytdJson` (ytdJson = H3.3 shape).

### 1.6 Rounding table (one rule per line)
| line | rule |
|---|---|
| PRORATION | earned = min(base, half-up(base × d / 30)) (r2 L2) |
| UNPAID_LEAVE | floor per day |
| DAY_WAGE · HOUR_WAGE · HOLIDAY_PAY · HOLIDAY_WORK | half-up per line (per day) |
| claim caps (category, total) | floor |
| SSO | baht half-up (H3.3) |
| WHT | annual tax satang half-up once, monthly half-up (H3.3) |
| everything else | exact integer sums |

## 2. DB behaviour (payroll.ts marked `HR H3.4` blocks)
- Engine per shop: `AppSystem.settings.hrPayroll = {engineVersion 1|2, catCapBp, totalCapBp}`; default `{1, 1000, 2000}` (r2 L1; raising a cap above 1000/2000 saves with the s.76 warning). `setPayrollEngine` OWNER only, lock `hr:clockpolicy:<sys>`, version 2 refused while `loadLawSet(today BKK)` is not ok (LAW_MISSING text), audit `hr.payroll.engine`. A run's `engineVersion` is fixed at creation; v1 runs keep the v1 path for recompute/approve/pay/reverse forever.
- Inputs at create (and DRAFT rebuild): build loop `buildWorkEntrySnapshot` until `next` null (≤ 100 calls) → period lock → duplicate/legacy checks (v1 texts) → law set at `lawDayOf(payDate)` → membership (H0.2 `periodMembership`) → profiles (refuse VARIABLE_PAY while `V2_VARIABLE_PAY = false` and an included profile is DAILY/HOURLY or MONTHLY base 0 — NA-11) → `workEntryStatesInTx` (H3.2 export) all CURRENT else WORK_ENTRIES → OT gate (PENDING request dated in the period, or APPROVED not settled / settleCode ≠ null ⇒ OT_OPEN) → APPROVED unbound adjustments of the period `FOR UPDATE` (as v1) → H3.2 approve hook re-run for LATE_RULE/ABSENT_RULE rows (stale ⇒ refuse with H3.2's `stale` text) → sibling DRAFT of the same tax year with payDate ≤ this one ⇒ YTD_DRAFT (D-6) → prior YTD from APPROVED/PAID items (`ytdPriorV2`; v1 items: whtIncome = snapshot base + add, wht, sso) → compute → write run (`engineVersion 2`, `createdById`, `inputDigest`) + items (`lawRowIds`, `ytdJson`, `snapshotJson {engineVersion, payType, normalDayMin, catCapBp, totalCapBp, lines, flags, carry, receivable, availableSatang, whtIncomeSatang, ssoWageSatang, workDays [[id, digest]…], holidayWork {day: minutes}}`) → bind adjustments (count check).
- `inputDigest` = sha256(canon of every item input minus volatile fields + law row ids + payDate). Approve recomputes from **current** work days/profiles/law/prior + the run's **bound** adjustments; digest differs ⇒ INPUTS_CHANGED (nothing written). New adjustments approved after create go to the next open period (as today).
- Approve (v2 only): actor required (NO_ACTOR) · `actor.userId === run.createdById && !isOwner` ⇒ SAME_PERSON · any item whose employee `linkedUserId === actor.userId && !isOwner` ⇒ OWN_PAY (owner O17) · H3.1 gate (existing) · OT gate · H3.2 hook · YTD_DRAFT · recompute digest · NEGATIVE_NET (existing) → claim → bind work entries (existing) → carry rows (never for a final-period item — its `receivable` stays in the snapshot and in the needs-review list "ลูกหนี้พนักงาน" for H3.7): per item carry entry ⇒ `HrPayAdjustment {kind ADVANCE|DEDUCTION, sourceType CARRY_FORWARD, sourceRef "cf:<runId>:<employeeId>:<ADVANCE|DAMAGES|OVERPAY>", consentAt copied from the source rows when all had consent, status APPROVED, periodKey = next open period after P (H2.9 R7 rule), requestedById = approver, decidedById null, note "ยกยอดหักจากงวด <P>"}` under the target period lock (P → targets ascending) → JV (unchanged `postPayrollJV`, totals of the run).
- Recompute DRAFT v2 (`recomputeDraftRun(ctx, runId, actor, {viewer, now})`): same as create, keeps the run id, sets `createdById = actor.userId` (the rebuilder becomes the maker), clears `stepsJson`.
- Reverse v2: inside the existing tx after the claim: carry rows of the run (`sourceRef LIKE 'cf:<runId>:%'`, FOR UPDATE): any bound to a run ⇒ CARRY_BOUND (whole tx rolled back); else guarded REJECTED (`runId IS NULL`, count check). Existing unbind of bound rows unchanged (carry-in rows become APPROVED-unbound again). Work days keep `runId` (state by run status); evidence stays in item `snapshotJson.workDays` (closes H3.1 debt "rebuilt rows overwrite the reversed run's inputs").
- H2.9 marked hunks (`ot-rules.ts`, `ot.ts`): `otAmount` optional `normalDayMin` ⇒ divisor and HOLIDAY_WORK cap use `min(480, N)`; settlement passes N from `normalMinutesOf(settings)` at first settlement and freezes it in `basisJson.normalDayMin` (re-settle uses the frozen value); settlement subtracts `holidayWorkPricedInTx(tx, ctx, {employeeId, day})` (minutes priced as HOLIDAY_WORK by APPROVED/PAID v2 runs) from the HOLIDAY_WORK segment.
- r2 L1 consent (s.77): migration `_v2` adds `HrPayAdjustment."consentAt" TIMESTAMP(3)` + `"consentById" TEXT` (nullable). Writer `setAdjustmentConsent(ctx, viewer, {id, consent})` in payroll.ts (OWNER or `hr.payadjust.approve` in branch, unbound rows only, audit `hr.payadjust.consent`). A stock charge counts as consented when H4.6's `stockConsentByAdjustment` holds a consent ref. The flag only records that a signed paper exists — the system stores no scan (PDPA).
- r2 H3.2 gates kept in v2 create/rebuild/approve (H3.2 fix r1, still in review — n/a until merged): approve gate "attendance sync current" (`attendanceRunGateInTx`, `ATT_TEXT.runSync`) for months inside the policy's in-force intervals only · pre-lock of earlier work periods ascending before the run-period lock (`attendancePreLockInTx`, refusal `lockRetry`) · APPROVED unbound stale deductions refuse (`stale`) · refunds bind only when all `refundOfIds` rows are in an APPROVED/PAID run, else held for the next sync · frozen months settle on the header snapshot; a frozen month with no snapshot gets no deductions · per-period cap Σ lines ≤ base (v2 also counts UNPAID_LEAVE inside it: UNPAID_CAP + UNWORKED cap at E0) · a human REJECT is a waiver for that digest (never re-created) · pay type stored in the header snapshot · sync button hosted on the payroll page (D-H32-ui-payroll).
- Keys: `reverseRunAction` asserts `hr.payroll.reverse`; `decideAdjustmentAction` asserts `hr.payadjust.reject` for REJECTED (APPROVED keeps `hr.payadjust.approve`).
- REFUND rows: `requestAdjustment` accepts kind REFUND only when the shop engine is 2 (else `refundV1`); v1 `sumAdjustments` never sees one (v1 runs exist only in v1 shops, and a shop switching back keeps its REFUND rows unbound → listed as stranded).

## 3. "Must" ledger (every item collected; DONE-BY-H3.4 / DEFERRED)
| # | from | item | status |
|---|---|---|---|
| 1 | H2.5 H3 must | planned roster break not subtracted | DONE (H3.1) — consumed via workMin |
| 2 | H2.5 | refuse/flag stale rows | DONE-BY-H3.4 (create + approve refuse non-CURRENT) |
| 3 | H2.5 | leaveFraction once per day | DONE (H3.1) |
| 4 | H2.5 | hourly leave offsets | DONE (H3.1) |
| 5 | H2.5 | OT measured not approved | DONE-BY-H3.4 (otWorkdayMin/otHolidayMin never priced) |
| 6 | H2.5 | stray IN after OUT | DONE (H3.1 STRAY_IN blocks) |
| 7 | H3.1 | never price otWorkdayMin/otHolidayMin | DONE-BY-H3.4 (not inputs; static S1.10) |
| 8 | H3.1 | never holiday pay + leave pay same day | DONE-BY-H3.4 (paidLeave′ = 0 on HOLIDAY, flag) |
| 9 | H3.1 | loop on `next` | DONE-BY-H3.4 |
| 10 | H3.1 | re-check staleness at create and approve | DONE-BY-H3.4 |
| 11 | H3.1 / D-H29-normal-hours | adopt normalMinutesPerDay (also H2.9 OT base) | DONE-BY-H3.4 (divisor min(480,N); H2.9 hunk; frozen per request) |
| 12 | H3.1 | decide unplannedMin incl. WORKED_ON_LEAVE | DONE-BY-H3.4: unpaid + flagged; paid only through an approved OT request |
| 13 | H3.1 | deductions capped at actual shortfall | DONE (H3.1/H3.2) + UNWORKED cap at E0 |
| 14 | H3.1 / H3.2 | HOLIDAY_WORK by dayClass × pay type minus OT_REQUEST minutes | DONE-BY-H3.4 |
| 15 | H3.1 / H3.2 | HOLIDAY_PAID daily-paid = one day's wage (s.56) | DONE-BY-H3.4 (DB wiring of DAILY gated by NA-11) |
| 16 | H3.1 | overnight shift into a holiday classed by start day | DEFERRED-TO accountant (A14) — engine follows H3.1 class |
| 17 | H3.1 | non-taxable reversal kind (D-H46-refund-kind) | DONE-BY-H3.4 (REFUND kind + classification + migration) |
| 18 | H3.2 | deduct unpaidLeaveMin of monthly staff ÷30÷N | DONE-BY-H3.4 |
| 19 | H3.2 | re-run R8 for attendance rows at approve | DONE-BY-H3.4 (guarded until H3.2 merges) |
| 20 | H3.2 | ALLOWANCE refunds taxable (D-H32-refund-kind) | DONE-BY-H3.4 — kept taxable on purpose: v2 treats LATE/ABSENT as reduced taxable wage, so their refund restores taxable wage; REFUND is for claim refunds |
| 21 | H3.2 | daily/hourly pay worked minutes only | DONE-BY-H3.4 (pure); DB DEFERRED-TO NA-11 ruling |
| 22 | H3.3 D-2 | wire computeItemV2 parts, store lawRowIds/ytdJson, LAW_MISSING with LAW_MSG | DONE-BY-H3.4 |
| 23 | H3.3 D-6 | sibling DRAFT sharing a pay day | DONE-BY-H3.4 (YTD_DRAFT) |
| 24 | H3.3 D-7 | law row activated after draft | DONE-BY-H3.4 (INPUTS_CHANGED) |
| 25 | H3.3 D-8 | leaver / no-December true-up | DEFERRED-TO accountant NA-12/NA-13 (engine keeps projecting) |
| 26 | H3.3 D-9 | normalise spouse to boolean before v2 | DONE-BY-H3.4 |
| 27 | H3.3 D-10 | globalReadDb helper | DEFERRED-TO core WO (not needed: v2 passes its tx to loadLawSet) |
| 28 | H3.3 N2 | pass Date only to lawDayOf | DONE-BY-H3.4 |
| 29 | H3.3 🔴 NA-11 | do not wire commission-only/daily/hourly | DONE-BY-H3.4 (VARIABLE_PAY refusal; one constant flips after the ruling) |
| 30 | H0.1 n2 / H0.2 | recompute wording "ดึงข้อมูลใหม่" in OW-5 text | DONE-BY-H3.4 (v2 texts only) |
| 31 | H0.2 | mobile run-row truncation | DONE-BY-H3.4 (payroll-run-ui) |
| 32 | H0.6 R9 | testids keyed by run id | DONE-BY-H3.4 |
| 33 | H0.6 F16.3 | BASELINE payroll page | DONE-BY-H3.4 (page via payroll-run-ui gate) |
| 34 | H1.1 | payType in the salary form | DEFERRED-TO H3.4b/owner (form shows payType read-only; DB wiring gated by NA-11) |
| 35 | H2.6 D2 | refuse/rebuild DRAFT whose inputs changed | DONE-BY-H3.4 |
| 36 | H2.9 | daily/hourly OT unpaid until H3.4 | DEFERRED-TO NA-11 (OT rows stay unbound; VARIABLE_PAY) |
| 37 | H2.9 D2 | no double pay holiday/OT | DONE-BY-H3.4 (both directions) |
| 38 | H2.10 | owner-employee approves own advance | unchanged (owner exemption) — ask owner at 100 % |
| 39 | H3.1 hunter 4 | preview names the PENDING_LEAVE day | DONE-BY-H3.4 (needs-review list: employee + day + code) |
| 40 | H3.1 r2 | reversed run keeps evidence of work days | DONE-BY-H3.4 (snapshotJson.workDays) |
| 41 | H4.6 | refund case (c) through payroll | PARTIAL: kind exists; auto-flow from `refundOwedSatang` DEFERRED-TO H4.6 follow-up (needs stock-charge writer change) |
| 42 | HQ7 | instalments set at request time | DEFERRED-TO owner HQ7 (carry-forward implemented; instalment column needs a ruling) |
| 43 | HQ17 | only owner edits own salary profile | DONE earlier (O17, H0.x) — re-checked statically |
| 44 | H3.7 | accrual/pay JV split | DEFERRED-TO H3.7 (v2 feeds today's JV: Σ gross, Σ SSO ee/er, Σ WHT, Σ net) |
| 45 | H3.2 r1 R1–R8 | sync-current gate · pre-lock earlier work periods · refund binds after its deductions · frozen-month snapshot · in-force intervals · cap = base · reject = waiver | DONE-BY-H3.4 (kept in v2 create/approve; S7.* guarded until H3.2 merges) |
| 46 | H3.2 r1 | store pay type in the header snapshot · sync button on the payroll page | DONE-BY-H3.4 (UI hosts the H3.2 action; header field is H3.2's writer — hand-off) |
| 47 | H3.2 notes | non-taxable refund kind for lateness refunds | OVERRIDDEN by controller L6 — lateness refund stays ALLOWANCE (taxable + SSO wage) |
| 48 | L1 / s.76(3) | employee loans (welfare/co-op debts, advance beyond work done) | DEFERRED (no loan product; needs advance-consent + 10/20 % caps) |
| 49 | L8 / s.70 | leaver's uncollected deductions | DONE-BY-H3.4 as `receivable` (snapshot + needs-review); booking as employee receivable DEFERRED-TO H3.7 |
| 50 | law file #5 | s.68 "average" normal hours | DONE (normalMinutesPerDay = the shop's average; min 8 h guard) |

## 4. Accountant list (new items only — H3.4, r2 after controller L1–L9; tags from `shark-thai-law`)
- B4-1 ÷30 everywhere — proration of starters/leavers (capped at base, full calendar month = base) and unpaid leave [U — no statutory divisor; support: s.68 + ฎีกา 7646/2542 V2].
- B4-2 Unpaid leave of a monthly employee deducted by v2 (v1 never did); unpaid leave + late/absent of a month ≤ base.
- B4-3 LATE_RULE/ABSENT_RULE rows reduce SSO wage [V] and taxable wage [U].
- B4-4 s.76(4) damages (manual deduction, stock charge) and overpayment recovery (commission clawback, OT overpayment — category OVERPAY [U]) capped 10 % per category, 20 % together, base = E + OT + commission + allowance (OT in the base [U]); above that only with written consent (s.77) up to the shop setting; remainder carried.
- B4-5 Advances = wage paid early, recovered from the same wage, limited only by net ≥ 0 [U]; an advance beyond work done is a s.76(3) loan (deferred).
- B4-6 Claims do not lower 40(1) income or SSO wage; refund of a claim (REFUND) is outside both [U]; refund of over-deducted lateness is taxable and SSO wage [U].
- B4-7 Holiday-work pricing: monthly +1× on any holiday; daily/hourly +1× plus holiday pay on a traditional (PUBLIC) holiday, 2× on the weekly day off; divisor ÷30÷min(8 h, normal day).
- B4-8 Daily/hourly: no pay for the weekly day off; holiday pay only on PUBLIC holidays the shop announced; a SHOP closure day is unpaid / worked = ordinary wage [U]; hourly holiday pay = hourly × normal day [U].
- B4-9 SSO 83 ฿ minimum is charged on a tiny wage; net negative ⇒ the run's NEGATIVE_NET rule, otherwise a warning only.
- B4-10 Mid-year starter: projection × actual remaining pay periods (Por.96/2543 ข้อ 1(1) [V]); the starter's first (prorated) pay counts once, the full salary for later months.
- B4-11 Gross column keeps v1 meaning (payable before SSO/WHT, after claims) so the JV balances; H3.7 must split claims/advances out of salary expense.
- B4-12 Unplanned minutes and work on a leave day are unpaid unless an OT request is approved.
- B4-13 Leaver's final run: uncollected carried amounts become an employee receivable (s.70, final wage within 3 days); recovery from severance pay is outside payroll [V2 ฎีกา 2681–2683/2545].
- B4-14 SSO wage includes OT and commission (H3.3 SSO_KINDS) while the law reference's default excludes OT/bonus [U] — ruling needed (T-HR-09).
- B4-15 YTD method spreads a one-off bonus/OT tax over the remaining months; Por.96/2543 ข้อ 1(5) withholds it in the month paid (NA-03 restated).

## 5. Fixed texts `RUN2_TEXT` (byte-exact — brief §3)
no `ไม่พบรอบจ่ายนี้ หรือคุณไม่มีสิทธิ์ดู` · engineOwner `เฉพาะเจ้าของร้านเปลี่ยนรุ่นเครื่องคิดเงินเดือนได้` · capRange `เพดานรายการหักต้องอยู่ระหว่าง 0–100%` · engineV1 `ร้านนี้ยังใช้เครื่องคิดเงินเดือนรุ่นเดิม — เจ้าของร้านเปิดรุ่นใหม่ได้ที่หน้าตั้งค่า HR` · engineV2 `ร้านนี้ใช้เครื่องคิดเงินเดือนรุ่นใหม่แล้ว — สร้างรอบจ่ายจากหน้าเงินเดือน` · variablePay `ร้านนี้มีพนักงานรายวัน/รายชั่วโมง หรือรับค่าคอมฯ อย่างเดียว — เครื่องรุ่นใหม่ยังไม่รองรับจนกว่านักบัญชียืนยันวิธีหักภาษี` · otOpen `มีคำขอ OT ของงวดนี้ที่ยังรออนุมัติหรือยังคิดเงินไม่เสร็จ — ตัดสินคำขอ OT ก่อนสร้างหรืออนุมัติรอบ` · ytdDraft `มีรอบจ่ายร่างของปีภาษีเดียวกันที่จ่ายก่อนหรือวันเดียวกัน — อนุมัติหรือลบรอบนั้นก่อน` · samePerson `คนสร้างรอบอนุมัติรอบเดียวกันไม่ได้ — ให้ผู้อนุมัติคนอื่นหรือเจ้าของร้านอนุมัติ` · ownPay `รอบนี้มีเงินเดือนของคุณเอง — ให้เจ้าของร้านอนุมัติ` · noActor `ระบุผู้อนุมัติไม่ได้ — กรุณาเข้าสู่ระบบใหม่` · inputsChanged `ข้อมูลเงินเดือนเปลี่ยนหลังสร้างร่าง — กด 'ดึงข้อมูลใหม่' แล้วตรวจอีกครั้ง` · carryBound `ยอดหักที่ยกไปงวดถัดไปถูกดึงเข้ารอบจ่ายงวดถัดไปแล้ว — กลับรายการรอบงวดถัดไปก่อน` · noRate `พนักงานบางคนยังไม่มีอัตราค่าจ้าง — ตั้งเงินเดือนก่อนสร้างรอบ` · refundV1 `รายการคืนเงิน (ไม่คิดภาษี) ใช้ได้เฉพาะร้านที่เปิดเครื่องคิดเงินเดือนรุ่นใหม่` · confirmNo `คุณไม่มีสิทธิ์ยืนยันชั่วโมงทำงานของสาขานี้` · carryNote `ยกยอดหักจากงวด {p}`. Reused: `LAW_MSG.*`, `WE_TEXT.approveBlocked` (WORK_ENTRIES), v1 duplicate/period/payDate/no-profile texts.

### 5.1 Warning texts (r2 L9 — `hr.run2.warn.*`, th = en keys, shown never blocking; [U] items say "โปรดตรวจกับ…")
capRaised `เพดานหักค่าเสียหายเกิน 10% ต่อประเภท หรือรวมเกิน 20% ของค่าจ้างงวดนั้น — ม.76 พ.ร.บ.คุ้มครองแรงงาน ให้เกินได้เฉพาะเมื่อลูกจ้างยินยอมเป็นหนังสือ (ม.77)` · capNeedsConsent `รายการนี้ยังไม่มีหนังสือยินยอมของลูกจ้าง จึงหักได้ไม่เกินเพดานตามกฎหมาย (10% ต่อประเภท · 20% รวม) — ส่วนที่เหลือยกไปงวดถัดไป` · advance `เงินเบิกค่าจ้างล่วงหน้าหักคืนจากค่าจ้างงวดนี้ได้ไม่เกินยอดสุทธิ — โปรดตรวจกับนักบัญชี/ที่ปรึกษาแรงงาน` · ssoMin `ค่าจ้างงวดนี้ต่ำกว่าฐานขั้นต่ำประกันสังคม ระบบจึงคิดเงินสมทบจากฐานขั้นต่ำตามกฎกระทรวง` · shopHoliday `วันปิดร้านไม่ใช่วันหยุดตามประเพณีที่ร้านประกาศ ลูกจ้างรายวัน/รายชั่วโมงจึงไม่ได้ค่าจ้างวันหยุด — โปรดตรวจกับที่ปรึกษาแรงงาน` · divisor30 `ระบบคิดค่าจ้างตามสัดส่วนด้วยการหาร 30 — กฎหมายไม่ได้กำหนดตัวหารไว้ โปรดตรวจกับนักบัญชี` · receivable `ยอดหักที่ยังเก็บไม่ได้ของพนักงานที่ออกงวดนี้ ระบบไม่หักจากค่าจ้างงวดสุดท้ายเกินเพดาน และบันทึกเป็นลูกหนี้พนักงาน` · hourlyHoliday `ค่าจ้างวันหยุดของลูกจ้างรายชั่วโมงคิดตามชั่วโมงทำงานปกติของร้าน — โปรดตรวจกับที่ปรึกษาแรงงาน`.
