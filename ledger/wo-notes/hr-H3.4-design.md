# H3.4 — payroll run v2 · design companion (formulae · "must" ledger · accountant list)

Companion of `ledger/hr-briefs/hr-brief-H3.4.md` (DRAFT). The brief wins on contract wording; this file holds the full arithmetic, the collected "must" items and the accountant list. Hand arithmetic of every oracle vector: `ledger/wo-notes/hr-H3.4-oracle.md`. Vectors: `scripts/fixtures/hr-h3.4-vectors.json`.

## 1. Pure calculator `hr/payroll-run-rules.ts` · `computeRunItemV2(input, lawSet)`

### 1.1 Input (all money integer satang, all minutes integer)
`{ employeeId?, payType "MONTHLY"|"DAILY"|"HOURLY", baseSalarySatang, dailyRateSatang|null, hourlyRateSatang|null, ssoEligible (default true), deductions {spouse?: boolean, children?: int} (default {}), periodKey "YYYY-MM", startDate|null, endDate|null ("YYYY-MM-DD"), normalDayMin N (60–720, default 480), claimCapBp (0–10000, default 2000), monthIndex 1–12 (Bangkok month of the pay date), prior {incomeSatang, whtSatang, ssoSatang} (default 0s), days[], adjustments[] }`
- day `{ workDayId, day, dayClass WORKDAY|DAY_OFF|HOLIDAY|UNSCHEDULED, workMin, paidLeaveMin, unpaidLeaveMin, holidayWorkMin, holidayPaidMin, unplannedMin, review[], otHolidayWorkMin }` — the first 7 minute fields are copied from `HrWorkDay`; `otHolidayWorkMin` = Σ `HOLIDAY_WORK` segment minutes of APPROVED, settled `HrOtRequest` rows whose work date is that day (H2.9 `segmentsJson`). Missing minute fields = 0. `otWorkdayMin` / `otHolidayMin` are **not inputs** (never priced — H2.9 pays requested OT).
- adjustment `{ id, kind OT|COMMISSION|BONUS|ALLOWANCE|REFUND|DEDUCTION|ADVANCE, sourceType|null, amountSatang > 0 }` — the APPROVED rows bound to the run.
- `lawSet` = `LawSetV2` from `law.ts loadLawSet(lawDayOf(payDate))` (`{SSO,TAX_BRACKET,DEDUCTION}` rows `{id,json}`).

### 1.2 Refusals (`{ok:false, code}`, checked in this order)
`LAW_MISSING` (a row of the set absent) · `BAD_INPUT` (N ∉ 60–720, capBp ∉ 0–10000, a minute ∉ int 0–1440, a money value not a safe non-negative integer, periodKey/day malformed) · `BAD_MONTH` · `NO_RATE` (DAILY without positive daily rate, HOURLY without positive hourly rate) · `BAD_KIND` (kind outside the 7) · any H3.3 `LawEngineError` code (`LAW_SHAPE`, `BAD_DEDUCTION`, `BAD_SATANG`) passes through as `{ok:false, code}`.

### 1.3 Pay lines (signed, one rounding per line, in this order)
Let `D` = calendar days of the period, `dayMin = min(480, N)` (s.68 divisor, never below ÷30÷8 — same guard as H2.9 `otDivisors`).
1. MONTHLY `BASE` = base (ref `profile`).
2. MONTHLY `PRORATION` (HQ6) when employment ∩ period has `d < D` days: amount = `halfUp(base × d / D) − base` (ref `employment`, minutes field = d). Flag `PARTIAL_MONTH`.
3. Per day ascending (`day` string), within a day in this order:
   - DAILY `DAY_WAGE`: m = min(N, workMin + paidLeave′); amount `halfUp(daily × m / N)`; line only when m > 0.
   - HOURLY `HOUR_WAGE`: m = workMin + paidLeave′; amount `halfUp(hourly × m / 60)`.
   - `paidLeave′` = paidLeaveMin, but 0 on a HOLIDAY day (never holiday pay + leave pay for one day — flag `HOLIDAY_LEAVE` when paidLeaveMin > 0 on a HOLIDAY day).
   - DAILY/HOURLY `HOLIDAY_PAY` (s.56) on a HOLIDAY day with holidayPaidMin > 0: DAILY `halfUp(daily × min(N, hp) / N)`; HOURLY `halfUp(hourly × hp / 60)`. MONTHLY: none (salary covers it).
   - `HOLIDAY_WORK` (s.62/63): m = max(0, holidayWorkMin − otHolidayWorkMin); bp = 10000 if MONTHLY or dayClass HOLIDAY, else 20000 (s.62(2): weekly day off of a daily/hourly employee). Amount `halfUp(rate × m × bp / den)`: MONTHLY den = 30 × dayMin × 10000 (rate = base) · DAILY den = dayMin × 10000 · HOURLY den = 60 × 10000. The bp values come from H2.9's `OT_LAW_DEFAULT`/`raised(otLawOf(...))` (holidayWorkPaidBp / holidayWorkUnpaidBp) — never lower.
   - MONTHLY `UNPAID_LEAVE`: amount `−floor(base × unpaidLeaveMin / (30 × N))` (H3.2's rule: ÷30÷N, floor = employee's favour).
   - Flags: `UNPLANNED` when any unplannedMin > 0 (not paid — decision §3 Q7); `WORKED_ON_LEAVE` when a day's review holds it (not paid).
4. `UNPAID_CAP` (ref `employment`): if the pay lines sum below 0, one line `+(−sum)` so E0 = 0; flag `UNPAID_CAPPED`.
5. E0 = Σ lines so far.

### 1.4 Adjustments
- Additions (code = kind, ref = adjustment id, sorted by id): OT, COMMISSION, BONUS, ALLOWANCE (taxable), REFUND (new kind — not 40(1), not SSO wage).
- Unworked time (code = `LATE_RULE`/`ABSENT_RULE`): DEDUCTION rows whose sourceType is LATE_RULE or ABSENT_RULE (H3.2). Applied in id order up to E0 (`min(row, remaining E0)`); excess dropped, never carried (flag `UNWORKED_CAPPED`). They reduce the **taxable and SSO wage** (no-work-no-pay, NA-07 default). Line amount = −applied, `requestedSatang` = row amount.
- Advance class (code `ADVANCE`): kind ADVANCE (incl. carry-in rows `sourceType CARRY_FORWARD`), order: carry-in first, then id.
- Claim class (code `DEDUCTION`): every other DEDUCTION (MANUAL/null, INVENTORY_ISSUE, CRM_COMMISSION clawback, OT_REQUEST negative delta, CARRY_FORWARD of a claim), order: carry-in first, then id.

### 1.5 Order of computation
1. E = E0 − unworkedApplied.
2. whtIncome = E + OT + COMMISSION + BONUS + ALLOWANCE · ssoWage = E + OT + COMMISSION + ALLOWANCE (H3.3 Q5: bonus not wage) · REFUND in neither (classifyIncomeV2 hunk).
3. SSO = ssoEligible ? `ssoV2(ssoWage, SSO.json)` (clamp min/max base, baht half-up, employer = employee) : 0. Reported `ssoWageSatang` = 0 when not eligible (as H3.3 ITM-04).
4. regular month for the projection: MONTHLY = baseSalarySatang (unprorated); DAILY/HOURLY = E (placeholder until NA-11; not wired in DB). regularSso = ssoEligible ? ssoV2(regular).employee : 0.
5. WHT = `whtYtdV2({monthIndex, currentIncome: whtIncome, regularMonthly: regular, prior…, currentSso: SSO, regularSso, priorSso}, TAX, DEDUCTION).whtSatang` (HQ9 YTD; deductions passed normalised: `spouse: d.spouse === true`, children int — D-9).
6. available = E + taxable adds + REFUND − SSO − WHT. < 0 ⇒ `blocked: "NET_NEGATIVE"`, flag NEGATIVE_NET, nothing applied (lines amount 0), net = available (approve refuses, as H0.2 R3).
7. advanceApplied = min(Σ advance class, available), in order.
8. claimCap = `floor(lpaWage × claimCapBp / 10000)`, lpaWage = E + OT + COMMISSION + ALLOWANCE (s.76 para 2 "one fifth of wages"; default 2000 bp, shop setting 0–10000). claimApplied = min(Σ claims, available − advanceApplied, claimCap), in order.
9. carry = `[{cls "ADVANCE", amount Σadv − advApplied}, {cls "CLAIM", amount Σclaim − claimApplied}]` (zeros omitted) ⇒ flag CARRY_FORWARD; flag CLAIM_CAPPED when claims were limited by the cap (cap < min(Σclaim, available − advApplied)).
10. net = available − advanceApplied − claimApplied (≥ 0).
11. addSatang = taxable adds + REFUND · deductSatang = unworkedApplied + advanceApplied + claimApplied · **grossSatang = E0 + add − deduct = net + SSO + WHT** (identity; the stored `grossSatang` keeps v1's meaning "payable before SSO/WHT", so the JV of `postPayrollJV` stays balanced).
12. Output also: `lines` (`{code, ref, day|null, minutes|null, amountSatang, requestedSatang?}`), `whtIncomeSatang ssoWageSatang ssoBaseSatang ssoEmployeeSatang ssoEmployerSatang whtSatang availableSatang advanceAppliedSatang claimAppliedSatang claimCapSatang carry addSatang deductSatang grossSatang netSatang blocked flags(sorted) lawRowIds(sorted) ytdJson` (ytdJson = H3.3 shape).

### 1.6 Rounding table (one rule per line)
| line | rule |
|---|---|
| PRORATION | earned = half-up(base × d / D) |
| UNPAID_LEAVE | floor per day |
| DAY_WAGE · HOUR_WAGE · HOLIDAY_PAY · HOLIDAY_WORK | half-up per line (per day) |
| claim cap | floor |
| SSO | baht half-up (H3.3) |
| WHT | annual tax satang half-up once, monthly half-up (H3.3) |
| everything else | exact integer sums |

## 2. DB behaviour (payroll.ts marked `HR H3.4` blocks)
- Engine per shop: `AppSystem.settings.hrPayroll = {engineVersion 1|2, claimCapBp}`; default `{1, 2000}`. `setPayrollEngine` OWNER only, lock `hr:clockpolicy:<sys>`, version 2 refused while `loadLawSet(today BKK)` is not ok (LAW_MISSING text), audit `hr.payroll.engine`. A run's `engineVersion` is fixed at creation; v1 runs keep the v1 path for recompute/approve/pay/reverse forever.
- Inputs at create (and DRAFT rebuild): build loop `buildWorkEntrySnapshot` until `next` null (≤ 100 calls) → period lock → duplicate/legacy checks (v1 texts) → law set at `lawDayOf(payDate)` → membership (H0.2 `periodMembership`) → profiles (refuse VARIABLE_PAY while `V2_VARIABLE_PAY = false` and an included profile is DAILY/HOURLY or MONTHLY base 0 — NA-11) → `workEntryStatesInTx` (H3.2 export) all CURRENT else WORK_ENTRIES → OT gate (PENDING request dated in the period, or APPROVED not settled / settleCode ≠ null ⇒ OT_OPEN) → APPROVED unbound adjustments of the period `FOR UPDATE` (as v1) → H3.2 approve hook re-run for LATE_RULE/ABSENT_RULE rows (stale ⇒ refuse with H3.2's `stale` text) → sibling DRAFT of the same tax year with payDate ≤ this one ⇒ YTD_DRAFT (D-6) → prior YTD from APPROVED/PAID items (`ytdPriorV2`; v1 items: whtIncome = snapshot base + add, wht, sso) → compute → write run (`engineVersion 2`, `createdById`, `inputDigest`) + items (`lawRowIds`, `ytdJson`, `snapshotJson {engineVersion, payType, normalDayMin, claimCapBp, lines, flags, carry, availableSatang, whtIncomeSatang, ssoWageSatang, workDays [[id, digest]…], holidayWork {day: minutes}}`) → bind adjustments (count check).
- `inputDigest` = sha256(canon of every item input minus volatile fields + law row ids + payDate). Approve recomputes from **current** work days/profiles/law/prior + the run's **bound** adjustments; digest differs ⇒ INPUTS_CHANGED (nothing written). New adjustments approved after create go to the next open period (as today).
- Approve (v2 only): actor required (NO_ACTOR) · `actor.userId === run.createdById && !isOwner` ⇒ SAME_PERSON · any item whose employee `linkedUserId === actor.userId && !isOwner` ⇒ OWN_PAY (owner O17) · H3.1 gate (existing) · OT gate · H3.2 hook · YTD_DRAFT · recompute digest · NEGATIVE_NET (existing) → claim → bind work entries (existing) → carry rows: per item carry entry ⇒ `HrPayAdjustment {kind ADVANCE|DEDUCTION, sourceType CARRY_FORWARD, sourceRef "cf:<runId>:<employeeId>:<cls>", status APPROVED, periodKey = next open period after P (H2.9 R7 rule), requestedById = approver, decidedById null, note "ยกยอดหักจากงวด <P>"}` under the target period lock (P → targets ascending) → JV (unchanged `postPayrollJV`, totals of the run).
- Recompute DRAFT v2 (`recomputeDraftRun(ctx, runId, actor, {viewer, now})`): same as create, keeps the run id, sets `createdById = actor.userId` (the rebuilder becomes the maker), clears `stepsJson`.
- Reverse v2: inside the existing tx after the claim: carry rows of the run (`sourceRef LIKE 'cf:<runId>:%'`, FOR UPDATE): any bound to a run ⇒ CARRY_BOUND (whole tx rolled back); else guarded REJECTED (`runId IS NULL`, count check). Existing unbind of bound rows unchanged (carry-in rows become APPROVED-unbound again). Work days keep `runId` (state by run status); evidence stays in item `snapshotJson.workDays` (closes H3.1 debt "rebuilt rows overwrite the reversed run's inputs").
- H2.9 marked hunks (`ot-rules.ts`, `ot.ts`): `otAmount` optional `normalDayMin` ⇒ divisor and HOLIDAY_WORK cap use `min(480, N)`; settlement passes N from `normalMinutesOf(settings)` at first settlement and freezes it in `basisJson.normalDayMin` (re-settle uses the frozen value); settlement subtracts `holidayWorkPricedInTx(tx, ctx, {employeeId, day})` (minutes priced as HOLIDAY_WORK by APPROVED/PAID v2 runs) from the HOLIDAY_WORK segment.
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

## 4. Accountant list (new items only — H3.4)
- B4-1 HQ6: proration by calendar days of the month (28–31), half-up; unpaid leave by ÷30÷N, floor — two different divisors in one payslip.
- B4-2 Unpaid leave of a monthly employee deducted by v2 (v1 never did); unpaid leave larger than the month ⇒ capped at 0 pay.
- B4-3 LATE_RULE/ABSENT_RULE rows reduce taxable and SSO wage (no-work-no-pay) — NA-07 default.
- B4-4 s.76 claims (manual deduction, stock charge, commission clawback, OT overpayment) capped at 20 % of wage (LPA wage = E + OT + commission + allowance), remainder carried; advances not capped except by net ≥ 0 — confirm advance = prepaid wage, not s.76(4).
- B4-5 Claims are post-tax: they do not lower 40(1) income or SSO wage (incl. commission clawback and OT overpayment correction).
- B4-6 REFUND kind: outside 40(1) and SSO wage (refund of a claim already deducted after tax).
- B4-7 Holiday-work pricing: monthly 1× on public holiday and weekly day off; daily/hourly 1× + holiday pay on public holiday, 2× on weekly day off; divisor ÷30÷min(8 h, normal day).
- B4-8 Hourly staff get s.56 holiday pay = hourly × normal day.
- B4-9 SSO minimum base (1,650 ฿ ⇒ 83 ฿) on a tiny part-time wage makes net negative ⇒ run blocked (V21/V24/V26) — confirm the minimum applies to part-timers with almost no wage.
- B4-10 Mid-month starter: WHT projection uses the full monthly salary for the remaining months.
- B4-11 Gross column keeps v1 meaning (payable before SSO/WHT, after claims) so the JV balances; H3.7 must split claims/advances out of salary expense.
- B4-12 Unplanned minutes and work on a leave day are unpaid unless an OT request is approved.

## 5. Fixed texts `RUN2_TEXT` (byte-exact — brief §3)
no `ไม่พบรอบจ่ายนี้ หรือคุณไม่มีสิทธิ์ดู` · engineOwner `เฉพาะเจ้าของร้านเปลี่ยนรุ่นเครื่องคิดเงินเดือนได้` · capRange `เพดานรายการหักต้องอยู่ระหว่าง 0–100%` · engineV1 `ร้านนี้ยังใช้เครื่องคิดเงินเดือนรุ่นเดิม — เจ้าของร้านเปิดรุ่นใหม่ได้ที่หน้าตั้งค่า HR` · engineV2 `ร้านนี้ใช้เครื่องคิดเงินเดือนรุ่นใหม่แล้ว — สร้างรอบจ่ายจากหน้าเงินเดือน` · variablePay `ร้านนี้มีพนักงานรายวัน/รายชั่วโมง หรือรับค่าคอมฯ อย่างเดียว — เครื่องรุ่นใหม่ยังไม่รองรับจนกว่านักบัญชียืนยันวิธีหักภาษี` · otOpen `มีคำขอ OT ของงวดนี้ที่ยังรออนุมัติหรือยังคิดเงินไม่เสร็จ — ตัดสินคำขอ OT ก่อนสร้างหรืออนุมัติรอบ` · ytdDraft `มีรอบจ่ายร่างของปีภาษีเดียวกันที่จ่ายก่อนหรือวันเดียวกัน — อนุมัติหรือลบรอบนั้นก่อน` · samePerson `คนสร้างรอบอนุมัติรอบเดียวกันไม่ได้ — ให้ผู้อนุมัติคนอื่นหรือเจ้าของร้านอนุมัติ` · ownPay `รอบนี้มีเงินเดือนของคุณเอง — ให้เจ้าของร้านอนุมัติ` · noActor `ระบุผู้อนุมัติไม่ได้ — กรุณาเข้าสู่ระบบใหม่` · inputsChanged `ข้อมูลเงินเดือนเปลี่ยนหลังสร้างร่าง — กด 'ดึงข้อมูลใหม่' แล้วตรวจอีกครั้ง` · carryBound `ยอดหักที่ยกไปงวดถัดไปถูกดึงเข้ารอบจ่ายงวดถัดไปแล้ว — กลับรายการรอบงวดถัดไปก่อน` · noRate `พนักงานบางคนยังไม่มีอัตราค่าจ้าง — ตั้งเงินเดือนก่อนสร้างรอบ` · refundV1 `รายการคืนเงิน (ไม่คิดภาษี) ใช้ได้เฉพาะร้านที่เปิดเครื่องคิดเงินเดือนรุ่นใหม่` · confirmNo `คุณไม่มีสิทธิ์ยืนยันชั่วโมงทำงานของสาขานี้` · carryNote `ยกยอดหักจากงวด {p}`. Reused: `LAW_MSG.*`, `WE_TEXT.approveBlocked` (WORK_ENTRIES), v1 duplicate/period/payDate/no-profile texts.
