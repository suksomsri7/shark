# POS P1.9 — oracle notes (`scripts/qc-pos-p1.9.mts`)

Oracle writer · cloud run · 4 Oct 2026 · branch `wip/pos-p1.9-oracle`, base `5f34e116` (session/pos after P1.5).
No DB here, so nothing was run against QC4. The suite runs on the VPS:
`bash scripts/iso.sh bash scripts/qc4.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-pos-p1.9.mts` (then again with `QC_FORCE=1`).
The contract is in `ledger/pos-briefs/pos-brief-P1.9.md` (S1–S16, owner questions O22–O26).

## Check list (45 · X: X1=2 X2=2 X3=4 X4=17 X6=3 · functional 17)
| id | X | what |
|---|---|---|
| ST1 | - | schema: PosShift/PosCashMovement/PosShiftCounter, the 2 enums, `PosSale.shiftId String?`, the uniques |
| ST2 | - | migration: CREATE PosShift, partial unique `one_open_shift_per_device`, nullable shiftId, additive only |
| ST3 | - | `core/scope.ts` registers the 3 tables |
| ST4 | X3 | `pos.shift.operate` + `pos.shift.manage` in permissions.ts |
| ST5 | - | consumers + automation labels for `pos.shift.opened/closed`; hourly cron calls `forceCloseStaleShifts` |
| ST6 | - | 16 `pos.shift.*` keys + 5 `pos.register.errors.*` keys th+en; `refusalMessageKey` for the 5 new codes |
| ST7 | - | `shift-actions.ts` (8 actions); `RegisterCtx.deviceId?`; `RegisterStatus.shift` not literal null; `CreateSaleInput.shiftId?` |
| ST8 | - | HR seam: no `PosStaffPin`, no pin column on PosShift, `shift.ts` does not read `pinCode`/`HrEmployee` |
| O1 | - | open: row fields, shiftNo, float + floatDetail, `currentShift` |
| O2 | - | reopen on the same device = `SHIFT_ALREADY_OPEN` + shiftId; second device = second shift with shiftNo+1 |
| O3 | X6 | open race on one device: 10 lanes × 3 rounds → 1 ok / 9 `SHIFT_ALREADY_OPEN` |
| O4 | X4 | open validation (8 cases) |
| X1 | X4 | bill → device's shift; D2 separate; HOTEL `createSale` → null |
| X2 | X4 | expected cash 226,500 = X = DB recompute = tendered−change form |
| X3 | X4 | byMethod / bill / void / in / out; X twice is identical and writes nothing |
| X4 | X3 | blind close hides expected from operate-only staff |
| X5 | X4 | tendered 12,000 / change 5,500 / net 6,500 / tip (needs the P1.6 columns) |
| M1 | X1 | cash IN/OUT rows; idempotent replay; `IDEMPOTENCY_CONFLICT` |
| M2 | X4 | cash validation; `DRAWER_INSUFFICIENT`; `NOT_FOUND` |
| C1 | X4 | close D2: −1,500, Z#1, Z equals row, closed event |
| C2 | X4 | `REASON_REQUIRED` (default ฿100; setting 500) |
| C3 | X4 | close validation (countDetail sum / unknown denomination / negative; counted −1 / 1.5) |
| C4 | X4 | close D1 with countDetail + countedOther: PROMPTPAY diff 0, CARD −100, cash over/short 0 |
| C5 | X4 | Z frozen: sale / cash / void after close refused; DB tamper leaves `zReport` identical; re-close = `SHIFT_CLOSED` |
| C6 | X6 | close race 10 lanes × 3 rounds → 1 winner; Z 1,2,3; winner-key retry = duplicated |
| C7 | X6 | 8 sales racing 1 close: every bound PAID bill is in Z; no bill after closedAt |
| C8 | - | Z numbered per unit in close order, gapless; `zSeq` = max; shiftNo unique |
| F1 | X4 | lazy force-close on open (25 h): FORCE_CLOSED, expected 5,500, nulls, Z forced, event forced |
| F2 | - | lazy force-close on register sale → `SHIFT_REQUIRED`, no bill |
| F3 | - | sweep: 25 h closed, 23 h kept, second run empty, setting 48 h respected |
| F4 | X4 | forced shift: close/void = `SHIFT_CLOSED` |
| R1 | X4 | registerV2 POS: no device / no shift → `SHIFT_REQUIRED`, no bill, no counter; malformed deviceId → VALIDATION |
| R2 | X1 | retry of a committed bill after its shift closed → duplicated |
| R3 | - | `required.register=false` → null, or bind if a shift is open |
| R4 | X4 | legacy unaffected: HOTEL null ×2, legacy void works, non-V2 POS register works with null |
| R5 | X4 | `required.otherSources=true`: 0 open → `SHIFT_REQUIRED`; 1 open → bound + in X; reset → null |
| R6 | X4 | `offShiftCash`: CASH part only, excludes bound and VOIDED, total; operate-only → PERMISSION_DENIED |
| I1 | X2 | cross-unit NOT_FOUND ×4; `createSale` with another unit's shift → `SHIFT_REQUIRED`; same deviceId on another unit is OK |
| I2 | X2 | cross-tenant NOT_FOUND ×4; `currentShift` null; `listShifts` does not see coffee shifts |
| P1 | X3 | no `pos.shift.operate` → PERMISSION_DENIED ×4; silom cashier at sandbox → NOT_FOUND |
| P2 | X3 | operate cannot close another's shift; can close own; manage can close another's |
| E1 | - | 1 opened + 1 closed event per shift; payload; consumers; replay ×2 is a no-op |
| D1 | - | ≥12 collected refusals are `{ok:false, code, message}` and not thrown |
| Z1 | - | row counts before = after (incl. PosShift/PosCashMovement/PosShiftCounter) and receipt seq sum |
| Z2 | - | fingerprint of existing QC rows unchanged |

## Expected results on the current base (5f34e116; P1.6 not merged)
- `--list`: exit 0, 45 ids. **Verified here.**
- `--no-db`: 1/8 green (ST8), exit 1. **Verified here.** ST1–ST7 are red for the right reasons: no models, no migration, no scope/permission/consumer/label/cron entries, no messages, no actions or `deviceId`/`shiftId` types.
- Unforced on the VPS: **SKIPPED, exit 0**. The reasons are the 9 missing `shift.ts` exports, the missing delegates posShift/posCashMovement/posShiftCounter, the missing PosShift/PosCashMovement columns and the missing `PosSale.shiftId`.
- `QC_FORCE=1` on the VPS: expected **3 green (ST8, Z1, Z2) / 42 red**, exit 1, with no crash.
  - Every DB check is red through `MISSING:<fn>` or a missing column/row.
  - On base the register and legacy sales still go through without being bound, and cleanup removes them.
  - X5 is also red for the reason "P1.6 columns missing".
- After the P1.6 merge and before P1.9 the result is the same, except that X3/C4 use CARD instead of TRANSFER once the enum value exists.

## Invented names (controller must ratify)
- Tables, enums and SQL:
  - `PosShift` with columns as in ST1 / `SHIFT_COLS`: `deviceId`, `deviceLabel`, `shiftNo`, `floatSatang`, `floatDetail`, `openedByUserId`, `closedByUserId`, `expectedCashSatang`, `countedCashSatang`, `overShortSatang`, `countDetail`, `countedByMethod`, `closeNote`, `closeKey`, `zNumber`, `zReport`
  - `PosShiftStatus` OPEN/CLOSED/FORCE_CLOSED
  - `PosCashMovement` (`kind`, `amountSatang`, `reason`, `byUserId`, `idempotencyKey`)
  - `PosCashMoveKind` IN/OUT
  - `PosShiftCounter` (`shiftSeq`, `zSeq`)
  - `PosSale.shiftId`
  - SQL index `one_open_shift_per_device`
- `src/lib/modules/pos/shift.ts`: `openShift`, `currentShift`, `xReport`, `closeShift`, `zReport`, `recordCashMovement`, `listShifts`, `offShiftCash`, `forceCloseStaleShifts`. Actions in `src/lib/modules/pos/shift-actions.ts` are named `<fn>Action`.
- Result shapes:
  - `{ok, shift: {id,…}}`, `{ok, report: ShiftReport}`, `{ok, movement, duplicated?}`, `{ok, items}`
  - `{ok, totalSatang, bills[{saleId, cashSatang, …}]}`
  - `{closed: string[]}`
  - `forceClosedShiftId` on open
  - `shiftId` carried by `SHIFT_ALREADY_OPEN`
- `ShiftReport` fields:
  - totals: `floatSatang`, `billCount`, `salesTotalSatang`, `voidCount`, `voidTotalSatang`, `byMethod[{type, count, amountSatang, countedSatang?, diffSatang?}]`
  - cash: `cashSalesSatang`, `cashTenderedSatang`, `changeSatang`, `tipSatang`, `cashInSatang`, `cashOutSatang`, `cashRefundsSatang`, `expectedCashSatang`
  - close (Z only): `countedCashSatang`, `overShortSatang`, `countDetail`, `note`, `closedByUserId`, `forced`
  - identity: `zNumber`, `status`
- Inputs:
  - `closeShift`: `countedOther` {PROMPTPAY, TRANSFER, CARD}
  - `RegisterCtx.deviceId?`
  - `CreateSaleInput.shiftId?`
  - denomination keys in satang strings: "100000" … "25"
- Settings `AppSystem(POS).settings.pos.shift`: `required.register` (default = registerV2), `required.otherSources` (default false), `blindClose` (false), `overShortReasonSatang` (10000), `forceCloseAfterHours` (24).
- Codes and messages:
  - codes: `SHIFT_REQUIRED`, `SHIFT_ALREADY_OPEN`, `SHIFT_CLOSED`, `REASON_REQUIRED`, `DRAWER_INSUFFICIENT`
  - their `pos.register.errors.*` keys
  - 16 `pos.shift.*` keys (ST6)
- Permissions `pos.shift.operate`, `pos.shift.manage`. Events `pos.shift.opened`, `pos.shift.closed`, with idempotency keys `PosShift#<id>#OPENED/CLOSED`.

## Encoding choices worth a second look
- The float cap is 100,000,000 satang, so O4 uses 100,000,001.
- Expected cash in X2/C1 assumes the POS sandbox has no VAT, because it is not linked to a book. If the P1.6 VAT is INCLUDED, grandTotal is still unchanged.
- C7 accepts both `SHIFT_REQUIRED` and `SHIFT_CLOSED` for losing sales (resolve-before vs lock-after).
- I1 asks for `SHIFT_REQUIRED` (not NOT_FOUND) when `createSale` gets a shift from another unit (S5 order: mismatch before status).
- R5 legacy refusal is a **throw** (`createSale` contract), so it is not in D1.
- E1 replays the real `pos.shift.closed` consumer twice and compares only the outbox/PosShift/PosCashMovement counts, which avoids flakes from concurrent `pos.sale.paid` drains.

## Drift vs. design docs
- `POS-MIGRATION-PLAN.md:18` and `DESIGN-POS.md` §7 list `PosStaffPin`. The HR review (`REVIEW-HR-V2-DESIGN-2026-10-01.md:235`) and `HR-V2-MASTER-PLAN.md:96` overrule this (HR owns the PIN). ST8 enforces it, and the plan rows should be updated.
- `POS-MASTER-PLAN.md:62` says "cron force-close". The brief rules lazy plus the **existing** hourly cron instead of a new cron. `14-pos.md` §7.7 says 04:00 unit-tz; the brief defaults to 24 h (O23).
- `14-pos.md:575` names `floatAmount`, `expectedCash`, `countedCash`, `overShort`, `openedBy`, `closedBy`. The brief uses the satang-suffixed names of the current schema convention.
- `POS-CONTRACTS.md:113` and `DESIGN-POS.md:302` also list `pos.shift.overshort`. The brief folds it into the `pos.shift.closed` payload.
- Mockup 07 says "บังคับเมื่อเกิน ฿10" but the spec settings say 10000 satang (O22).

## Commands run here
- `esbuild scripts/qc-pos-p1.9.mts --loader:.mts=ts` → OK
- `tsx scripts/qc-pos-p1.9.mts --list` → 45 ids, exit 0
- `tsx scripts/qc-pos-p1.9.mts --no-db` → 1/8 (ST8), exit 1
