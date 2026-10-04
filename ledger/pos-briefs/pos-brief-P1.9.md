# P1.9 — shifts · cash drawer · X/Z · forced close · cash outside a shift (brief DRAFT · oracle writer · cloud run · 4 Oct 2026)

> Status: DRAFT written without DB access, for the controller to ratify. Base: `session/pos` 5f34e116 (P1.5 accepted). **Depends on P1.6** (CARD, tendered/change on the CASH `PosPayment` row, tip outside grandTotal, refusal-as-data idempotency), which is being built in parallel. The P1.9 builder starts only after P1.6 is merged into `session/pos`. Re-verify every file:line below on that head. Lane rules + COMMON apply. The money set (COMMON §7 + `qc-pos-account`) is mandatory.
> Mockups: `ledger/design-pos/07-shift` (X · count by denomination · over/short + reason · Z history · off-shift cash · device) and `13-shift-open-lock` part A (open shift: device · float by denomination · previous Z). **13B (PIN lock / switch staff) is NOT P1.9.** It is P1.15/P3.5 on HR's `verifyPin` (see S14).
> Oracle: `scripts/qc-pos-p1.9.mts` (45 checks) · notes `ledger/wo-notes/pos-P1.9-oracle.md`.

## 1. Facts as built (verified 4 Oct on `p19o-local` 5f34e116 — re-check after the P1.6 merge)
- No shift exists anywhere. `prisma/schema/pos.prisma` has no `PosShift`, `PosDevice`, `PosCashMovement` or `PosSale.shiftId` (`pos.prisma:19-59`). `scripts/pos-qc-env.mts:159-163` lists `PosShift`/`PosDevice`/`PosStaffPin` as future models.
- `createSale` `service.ts:98` is the money entry point for 19 call sites. Duplicate key returns the stored row (`service.ts:102-111`; P1.6 R6 changes this). `PAYMENT_MISMATCH` is thrown as a message prefix (`service.ts:156,250`). `pos.sale.paid` is emitted in the bill tx (`service.ts:290-297`).
- `voidSale` `service.ts:363-366` voids any PAID sale of the unit, with no time or shift limit. It has 10 external callers (rental, school, hotel, booking, restaurant, clinic, shop, ticket, REST ops, AI proposal).
- Legacy "close day" `closeDaySummary` `service.ts:533-596` is a read-only calendar-day aggregate per POS system. `cashInDrawerSatang` is Σ CASH of the day's PAID bills, with no float, change, in/out or refunds (`:590`). `PAY_TYPE_ORDER` has no CARD (`:498`; P1.6 T7 adds it).
- Register: `RegisterCtx = {tenantId, systemId, unitId}` (`register-shared.ts:47`). `RegisterStatus.shift: null` ("P1.9"; `register-shared.ts:175`, `register.ts:1218`). Unknown submit keys are `VALIDATION` (`register.ts:736`). Change is computed but not stored (`register.ts:1102-1105`). P1.6 ruling §8.2 moves tendered/change onto the CASH `PosPayment` row.
- The "new POS" flag is `AppSystem(POS).settings.pos.registerV2 === true` (`register-shared.ts:36`). The seed turns it on for the QC coffee POS. Sandbox POSes created by the P1.3/P1.5/P1.6 oracles have `settings {}`, so the flag is off for them.
- Permissions: the `pos` module has `sale.create`, `product.setPrice`, `product.manage`, `sale.void` and `sale.priceOverride` (`core/permissions.ts:133-137`). No shift key exists. `evaluate`: OWNER all, MANAGER all in accessible units, STAFF explicit key or `pos.*` (`core/rbac.ts:32-40`).
- Outbox: a new event needs a consumer. The pattern for an automation-only consumer is `withAutomation(async () => {})` (`outbox-consumers.ts:187,699`), plus a label in `AUTOMATION_EVENTS` (`automation/labels.ts:28-30`).
- Cron: `/api/cron/hourly` exists and runs best-effort sweeps with an injected `now` (`src/app/api/cron/hourly/route.ts`; `vercel.json` hourly + daily). A sweep can be added without new infrastructure.
- HR seam: `HrEmployee.pinCode` is plain and non-unique, and the review rules that **HR owns the PIN; do NOT build `PosStaffPin`** (`REVIEW-HR-V2-DESIGN-2026-10-01.md:235`). HR H0.5 delivers `hr.verifyPin` and H2.1 `hr.onShiftToday`. C-8 PIN/roster is owned by POS P3.5 (`HR-V2-MASTER-PLAN.md:52,68,96`).
- Spec base: `docs/modules/14-pos.md` §3.4 F1–F8 (`:144-155`), model sketch `:575-600`, flow §7.7 (`:916-922`), "void only while the shift is open" (`:1036`). Contracts C-8 (`POS-CONTRACTS.md:51-61`), events (`:113`). Migration plan: partial unique "1 OPEN per device" is hand-written SQL (`POS-MIGRATION-PLAN.md:43`).

## 2. Contract (proposed rulings S1…S16 — controller; additive only, F15.2)
S1 **Model.** These names are for the controller to ratify; the oracle uses them.
  - `PosShift` (tenantId · unitId · systemId · `deviceId` String · `deviceLabel`? ≤40 · `shiftNo` Int · `status` PosShiftStatus OPEN|CLOSED|FORCE_CLOSED · `openedByUserId` · `openedAt` · `floatSatang` · `floatDetail` Json? · `closedByUserId`? · `closedAt`? · `expectedCashSatang`? · `countedCashSatang`? · `overShortSatang`? · `countDetail` Json? · `countedByMethod` Json? · `closeNote`? · `closeKey`? · `zNumber`? · `zReport` Json? · createdAt/updatedAt).
    - `@@unique([unitId, shiftNo])` and `@@unique([unitId, zNumber])`.
    - Hand-written SQL partial unique `one_open_shift_per_device` on `("unitId","deviceId") WHERE status='OPEN'`.
  - `PosCashMovement` (tenantId · unitId · shiftId · `kind` PosCashMoveKind IN|OUT · `amountSatang` > 0 · `reason` 1–200 · `byUserId` · `idempotencyKey` · createdAt). It has `@@unique([tenantId, idempotencyKey])`.
  - `PosShiftCounter` (tenantId · `unitId` unique · `shiftSeq` · `zSeq`). It is upserted and incremented inside the open/close tx, like `PosReceiptCounter`.
  - `PosSale.shiftId String?` (nullable FK). Its index follows the P6.1 CONCURRENTLY rule.
  - The new tables are registered in `core/scope.ts` (F1). The migration is additive only.
S2 **Device = an opaque id until P1.10.** `deviceId` matches `[A-Za-z0-9_-]{8,64}`. The client generates it once and keeps it in localStorage. P1.10 adds `PosDevice` and an FK later, so P1.9 creates no device table. There is one OPEN shift per (unit, device). Several shifts can be open at once per unit (one per device, F2). The same deviceId string on another unit is a different drawer. Nothing limits the user (O26).
S3 **Service** `src/lib/modules/pos/shift.ts`. It follows the register pattern: `(ctx, actor, input, client?)`; refusals are returned as `{ok:false, code, message}` and never thrown; ctx is `RegisterCtx`. Functions:
  - `openShift(ctx, actor, {deviceId, deviceLabel?, floatSatang, floatDetail?})` → `{ok, shift, forceClosedShiftId?}`
  - `currentShift(ctx, actor, {deviceId})` → `{ok, shift|null}`
  - `xReport(ctx, actor, {shiftId})` → `{ok, report}`
  - `closeShift(ctx, actor, {shiftId, countedCashSatang, countDetail?, countedOther?, note?, idempotencyKey})` → `{ok, shift, report, duplicated?}`
  - `zReport(ctx, actor, {shiftId})` → `{ok, report}`
  - `recordCashMovement(ctx, actor, {shiftId, kind, amountSatang, reason, idempotencyKey})` → `{ok, movement, duplicated?}`
  - `listShifts(ctx, actor, {limit?})`
  - `offShiftCash(ctx, actor, {businessDate?})`
  - System-level: `forceCloseStaleShifts({now?, tenantId?}, client?)` → `{closed: string[]}`

  Thin `"use server"` actions go in `src/lib/modules/pos/shift-actions.ts`. Scope works as in the register: a wrong tenant, system or unit, or a shift of another unit or tenant, is `NOT_FOUND` (404, not 403).
S4 **Opening float.** An integer from 0 to 100,000,000 satang. `floatDetail` is optional `{ "<denomSatang>": count }`, where the denominations are 100000 50000 10000 5000 2000 1000 500 200 100 50 25. If given, it must sum to the float; otherwise `VALIDATION`.
  - `shiftNo` comes from the per-unit counter at open.
  - An open request on a device that already has an OPEN shift returns `SHIFT_ALREADY_OPEN` carrying `shiftId`. The UI adopts that shift; there is no idempotency key on open. A race of concurrent opens resolves to exactly one through the partial unique index (P2002 → `SHIFT_ALREADY_OPEN`).
S5 **Sale binding.** `createSale` gains an optional `shiftId`. Inside the bill tx it locks the shift row `FOR SHARE`.
  - If the shift does not exist, or belongs to another tenant, unit or system, it throws `SHIFT_REQUIRED`.
  - If the shift is not OPEN, it throws `SHIFT_CLOSED`.

  This happens before the receipt counter. `closeShift` takes the row `FOR UPDATE`, so it waits for in-flight sales, and every committed bound sale is inside Z. `submitRegisterSale` resolves the OPEN shift of `(ctx.unitId, ctx.deviceId)` and passes `shiftId`. `RegisterCtx` gains `deviceId?`; a malformed value is `VALIDATION`. `registerStatus` returns the device's shift view (S15).
S6 **"Sales require an open shift" setting** `AppSystem(POS).settings.pos.shift.required = {register?: boolean, otherSources?: boolean}`.
  - `register` defaults to `posRegisterV2On(settings)`. That means ON for the new POS, and OFF for sandbox or legacy POSes, so the P1.3/P1.5/P1.6 suites are unaffected.
    - When ON and the device has no OPEN shift (or `deviceId` is missing), the result is `SHIFT_REQUIRED` with no bill and no counter movement.
    - When OFF, the sale binds to the device's open shift if there is one; otherwise `shiftId` is null.
  - `otherSources` defaults to false. While it is false, legacy callers (no `shiftId`) behave exactly as today: `shiftId` null, never refused.
    - When true and the unit has 0 OPEN shifts, the result is `SHIFT_REQUIRED`.
    - With exactly 1 OPEN shift, the sale binds to it.
    - With 2+, the sale stays null and shows as off-shift cash (O24).
  - The key lookup happens **before** the shift check. A retry of a bill committed in a since-closed shift returns `duplicated`, never `SHIFT_REQUIRED`.
S7 **Expected cash, per pay type, CARD- and tender-aware.** For shift S, take the sales with `shiftId = S` that are not VOIDED (and not `docType REFUND` once P1.8 exists):
  - `cashSalesSatang` = Σ amount of the CASH rows.
  - `cashTenderedSatang` = Σ (tendered ?? amount).
  - `changeSatang` = Σ (change ?? 0).

  **expected = float + cashTendered − change + cashIn − cashOut − cashRefunds**, which equals float + cashSales + in − out − refunds.
  - A cash tip is already inside the CASH amount (payments = grandTotal + tip, P1.6 §8.1). X/Z show `tipSatang` separately, so the owner can pay tips out with a cash OUT.
  - CARD, PROMPTPAY and TRANSFER go to `byMethod` only and never into expected cash.
  - `cashRefundsSatang` = Σ CASH paid out by refund documents bound to S. It is 0 until P1.8 adds `docType`; P1.8 must bind refunds to the refunding device's shift.
  - At close, `countedOther` (CARD/PROMPTPAY/TRANSFER, optional, e.g. the EDC settlement total) gives `byMethod[].countedSatang/diffSatang`. Over/short stays cash-only.
S8 **Cash in/out** (`recordCashMovement`) needs the target shift to be OPEN; a closed shift gives `SHIFT_CLOSED`. The amount is an integer > 0 and the reason is 1–200 characters; otherwise `VALIDATION`.
  - An OUT larger than the current expected cash is `DRAWER_INSUFFICIENT`.
  - The idempotency key behaves like a bill key: same payload ⇒ the same row with `duplicated:true`; different payload ⇒ `IDEMPOTENCY_CONFLICT`.

  "Open drawer without a sale" (mockup button) is a printer or hardware action for P1.10. P1.9 only logs it as an audit row, if at all.
S9 **X report** = `ShiftReport` computed live and read-only (it writes nothing). Fields:
  - identity: shiftId · shiftNo · zNumber(null) · status · unitId · deviceId · openedByUserId · openedAt
  - totals: floatSatang · billCount · salesTotalSatang · voidCount · voidTotalSatang · `byMethod[{type,count,amountSatang}]`
  - cash: cashSalesSatang · cashTenderedSatang · changeSatang · tipSatang · cashInSatang · cashOutSatang · cashRefundsSatang · expectedCashSatang

  **Blind close** (`settings.pos.shift.blindClose`, default false): for an actor without `pos.shift.manage`, `expectedCashSatang` is `null` while the shift is OPEN.
S10 **Close and Z.** `closeShift` does the following:
  1. Locks the shift `FOR UPDATE`.
  2. Requires OPEN; otherwise `SHIFT_CLOSED`. The exception is the same `idempotencyKey` as the stored `closeKey`, which gets ok + the stored Z + `duplicated:true`.
  3. Validates `countDetail`: Σ must equal counted and the denominations must be known; otherwise `VALIDATION`.
  4. Computes `overShort = counted − expected`. If |overShort| > `settings.pos.shift.overShortReasonSatang` (default 10,000) and the note is empty, the result is `REASON_REQUIRED` (O22).
  5. Takes `zNumber` from the per-unit `zSeq`, gapless in close order.
  6. Freezes `zReport` = the X fields + countedCashSatang · overShortSatang · countDetail · countedByMethod · note · closedByUserId · closedAt · forced. It sets status CLOSED and emits `pos.shift.closed`, all in one tx.

  **Z is immutable.** `zReport()` returns the stored JSON verbatim and never recomputes. Nothing writes a closed shift again. Concurrent closes give exactly one winner, and the losers get `SHIFT_CLOSED`.
S11 **Void after close.** `voidSale` of a sale whose `shiftId` is not OPEN throws `SHIFT_CLOSED` ("refund only", spec `:1036`); it locks the shift `FOR SHARE` like S5. Sales with `shiftId` null (all legacy bills) are unaffected.
S12 **Forced close: lazy first, plus the existing hourly cron.** A shift OPEN for longer than `settings.pos.shift.forceCloseAfterHours` (default 24, range 1–72) is set to FORCE_CLOSED with:
  - expected computed, `countedCashSatang`, `overShortSatang` and `closedByUserId` all null
  - a `zNumber` and a frozen Z with `forced:true`
  - a `pos.shift.closed` event with `forced:true`

  Triggers:
  - `openShift` or `currentShift` on that device; the open then proceeds and returns `forceClosedShiftId`.
  - the register's shift lookup; the sale then follows S6.
  - `forceCloseStaleShifts({now})`, which is wired as one best-effort block in `/api/cron/hourly`.

  A forced shift cannot be closed again (`SHIFT_CLOSED`); a late count is O25.
S13 **Events.** Both are emitted in the same tx:
  - `pos.shift.opened` {shiftId, unitId, deviceId, shiftNo, floatSatang}, key `PosShift#<id>#OPENED`.
  - `pos.shift.closed` {shiftId, unitId, deviceId, zNumber, expectedCashSatang, countedCashSatang, overShortSatang, forced}, key `PosShift#<id>#CLOSED`.

  There is exactly one of each per shift. The consumers are `withAutomation(async () => {})` plus `AUTOMATION_EVENTS` labels, with one marked block in the hot files. The Account JV for over/short, the Kanban "count cash" card and the LINE summary are P3 consumers on the same event. No `pos.shift.overshort` event: the closed payload carries it.
S14 **Permissions + HR seam.**
  - New keys `pos.shift.operate` (open · close **own** shift · cash in/out · X) and `pos.shift.manage` (close another's shift · Z/history of all · off-shift cash · see expected under blind close).
  - OWNER/MANAGER get both through `evaluate`.
  - Selling in an open shift needs only `pos.sale.create` (any staff on that device; mockup 13B).
  - The actor is the session user. **There is no PIN in P1.9 and no `PosStaffPin` table** (HR owns the PIN, review ruling #3). Mockup 13A's roster list (HR `onShiftToday`) and 13B's PIN lock come with P3.5/P1.15 through `hr.verifyPin`.
S15 **Register and UI.**
  - `RegisterStatus.shift` becomes `{id, shiftNo, openedAt, openedByName, deviceLabel} | null`.
  - The pay button is blocked with a "เปิดกะก่อนเริ่มขาย" card when S6 requires a shift.
  - The `/pos/shifts` page (mockup 07) and the open-shift modal (13A) are built from these functions.
  - Messages: `pos.shift.*` in th+en. `refusalMessageKey` maps SHIFT_REQUIRED→errors.shiftRequired, SHIFT_ALREADY_OPEN→errors.shiftAlreadyOpen, SHIFT_CLOSED→errors.shiftClosed, REASON_REQUIRED→errors.reasonRequired and DRAWER_INSUFFICIENT→errors.drawerInsufficient.
  - The UI is checked by controller visual (07, 13A × 3 sizes + EN), not by the oracle.
S16 **Legacy `closeDay`** (`closeDaySummary/Bills/Csv`, `/pos/close`) stays as is: a calendar-day sales view, not a drawer reconciliation. It must return identical numbers before and after P1.9. The new "off-shift cash" report (`offShiftCash`: CASH portion of non-VOIDED bills with `shiftId` null on the unit for the BKK business date, D17) is separate. `/pos/close` may link to `/pos/shifts`, but its numbers do not change.

## 3. Owner questions (answer before the builder; the oracle encodes the defaults shown)
- **O22 Over/short threshold**: the spec says ฿100 (`overShortAlertSatang 10000`); mockup 07 shows "บังคับเมื่อเกิน ฿10". Default ฿100, configurable. — *เงินขาด/เกินเท่าไรถึงต้องใส่เหตุผล: ฿100 (ตั้งเปลี่ยนได้) หรือ ฿10?*
- **O23 Forced-close rule**: OPEN for more than 24 h (default), or "crossed the 04:00 business-day boundary" (spec §7.7 cron at 04:00)? — *กะค้างให้ระบบปิดเองเมื่อเปิดเกิน 24 ชม. หรือเมื่อข้ามตี 4 ของวันถัดไป?*
- **O24 Other modules' cash** (hotel, booking and others taking cash at the counter): keep it off-shift by default (today's behaviour, shown in the "off-shift cash" report), or let the owner switch `otherSources` ON so it must land in a drawer? With 2+ drawers open, it stays off-shift. — *เงินสดจากระบบอื่น (โรงแรม/จอง) ให้ "นอกกะ" เหมือนเดิม หรือบังคับเข้าลิ้นชักที่เปิดอยู่?*
- **O25 Late count after a forced close**: allow a manager to record the count later (a separate WO, keeping the frozen Z and adding a reconciliation row), or treat a forced close as final? — *กะที่ระบบปิดเอง ให้ผู้จัดการนับเงินย้อนหลังได้ไหม หรือจบที่ระบบปิด?*
- **O26 One person, two drawers**: may one user hold OPEN shifts on two devices of the same branch? Default: allowed (not enforced). — *พนักงานคนเดียวเปิดกะ 2 เครื่องพร้อมกันได้ไหม?*

## 4. Order of work
1. Controller ratifies S1–S16 and the invented names (oracle notes §4). The owner answers O22–O26; the oracle already encodes the defaults.
2. Oracle on the VPS against base: unforced should be SKIPPED exit 0; forced 3 green (ST8 · Z1 · Z2) / 42 red. `--no-db`: 1/8 (ST8), exit 1. Then accept the oracle and merge it into session/pos.
3. Builder S (after P1.6 merges):
   - migration (enums, 3 tables, `PosSale.shiftId`, hand-SQL partial unique; `migrate diff` → read SQL → deploy QC4 only)
   - `shift.ts` + actions
   - `createSale`/`voidSale`/`submitRegisterSale`/`registerStatus` hunks
   - permissions keys · scope.ts · outbox block · labels · hourly-cron block
4. Builder U: mockup 07 + 13A, register shift card, messages.
5. Controller visual → parity reviewer → code reviewer → hunter (money lane: S5/S10 locks, races) → accept.

## 5. Acceptance
- `qc-pos-p1.9` green ×2 with no residue.
- `qc-pos-p1.3`, `qc-pos-p1.5`, `qc-pos-p1.6` and `qc-pos-closeday` unchanged and green.
- The money set (COMMON §7) and `qc-pos-account` are identical before/after, and every `createSale`/`voidSale` caller's suite is green; the legacy path is untouched (S6/S11).
- fitness both modes · typecheck · build · visual parity 07/13A.

## 6. Out of scope
- `PosDevice`, printer, cash-drawer kick, the "open drawer" button (P1.10)
- refund documents (P1.8; this brief only reserves how they enter expected cash)
- PIN lock, staff switch, HR roster in the open modal (P1.15/P3.5 via HR `verifyPin`/`onShiftToday`)
- over/short JV, Kanban card, LINE/meeting summary consumers (P3)
- shift reports and monthly over/short (P1.17)
- settings UI for `pos.shift.*` (P1.18; P1.9 reads settings only)
- offline shifts (P3.4)

## Owner answers (4 Oct 2026)
- Owner: use all recommended defaults for every owner question in this brief (see POS-RESUME 4 Oct). The questions labelled O22–O26 in this brief are tracked as Q9.1–Q9.5 (ids clash with earlier O22/O23).
