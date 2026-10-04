# POS P1.9b — oracle notes (manager recount of a force-closed shift · Q9.4)

Oracle writer · cloud run · 4 Oct 2026 · base `p19b-local` = `origin/session/pos` 842cd4f7 · pushed to `wip/pos-p1.9b-oracle`.
There is no DB here, so no DB run was done. The controller runs the base run on the VPS (QC4).
Brief: `ledger/pos-briefs/pos-brief-P1.9b.md` (rulings R1–R14). Oracle: `scripts/qc-pos-p1.9b.mts` (22 checks).

## Checks
| id | X | what |
|---|---|---|
| ST1 | - | schema `PosShiftRecount` columns · `shiftId @unique` · `@@unique([tenantId, idempotencyKey])` · required columns non-null · `countDetail Json?` |
| ST2 | - | migration: CREATE TABLE + unique `("shiftId")` · additive · no `ALTER TABLE "PosShift"` |
| ST3 | - | `scope.ts` has a real (non-comment) `PosShiftRecount:` line |
| ST4 | - | `shift.ts`:<br>• exports `recountShift`<br>• has 2 new codes, each with a Thai MSG<br>• the body writes the audit `pos.shift.recount`, checks `.manage`, and never updates `posShift`, `finalizeClose`, `bumpCounter` or `emitOutbox` |
| ST5 | - | `recountShiftAction` (use server · async only · no throw · calls the service · catch) |
| ST6 | - | messages `pos.shift.recount.{8}` + `pos.register.errors.{shiftNotForced, alreadyRecounted}` th+en · `refusalMessageKey` mapping |
| ST7 | X1 | ShiftsClient:<br>• calls the action<br>• the button is gated on FORCE_CLOSED + canManage<br>• the key is held in `useState(newKey)`, not `newKey()` in the request<br>• the Z view shows recount<br>• it uses `t("recount.*")` |
| ST8 | - | base-green guard: PosShift columns = the P1.9 set · no `pos.shift.recount*` permission or event |
| RC1 | X4 | happy path on a forced shift (float 1,000 + cash sale 4,500 → expected 5,500; counted 5,000 → variance −500), checking the row and the return value |
| RC2 | X4 | frozen Z: all PosShift columns, the zReport bytes, PosShiftCounter, the shift's outbox events, and the unit's sales, payments and cash moves are unchanged |
| RC3 | - | one AuditLog row `pos.shift.recount` with the R5 fields |
| RC4 | - | zReport/xReport show `recount` as a sibling and the report stays verbatim · `listShifts` item.recount · a normal close has `recount: null` |
| RC5 | - | an OPEN shift and a CLOSED shift both give `SHIFT_NOT_FORCED`, with no rows |
| RC6 | X3 | operate (the opener) → DENIED · sale.create → DENIED · STAFF + manage → ok · the opener sees the recount in Z |
| RC7 | X1 | same key/payload → duplicated · same key with another payload → IDEMPOTENCY_CONFLICT · a new key → ALREADY_RECOUNTED · 1 row and 1 audit |
| RC8 | X4 | 14 bad inputs → VALIDATION, with no rows |
| RC9 | X2 | another unit, another tenant and an unknown id → NOT_FOUND |
| RC10 | X6 | 10 lanes × 3 shifts with different keys → 1 ok, 9 ALREADY_RECOUNTED, 1 row, 1 audit |
| RC11 | X6 | 6 lanes with the same key → all ok with the same id, ≤1 not duplicated, 1 row, 1 audit |
| RC12 | - | refusals are data: all 6 codes seen, never thrown, message present, no other code |
| Z1 | - | row counts before = after (includes PosShiftRecount and AuditLog) |
| Z2 | - | fingerprints of the pre-existing QC rows (includes PosShift, PosShiftCounter, PosShiftRecount) |

Sandbox:
- 2 units and 1 POS system with `settings {}`. Because it is not registerV2, the register has no shift requirement. Sales are bound through `createSale({shiftId})` with sourceModule HOTEL.
- Forced shifts are made by setting `openedAt` back 25 h, then calling `currentShift` on that device (the lazy close path). The tenant-wide `forceCloseStaleShifts` is never called, so real QC shifts are untouched.
- The only OPEN shift (RC5) is closed before the block ends.

## Names I had to invent (controller to ratify)
- table `PosShiftRecount` with these columns:
  - `shiftId` (unique), `zNumber`, `expectedCashSatang`, `countedCashSatang`, `varianceSatang`
  - `countDetail` (Json?), `note`, `recountedByUserId`, `idempotencyKey`, `createdAt`
- `recountShift(ctx, actor, {shiftId, countedCashSatang, countDetail?, note, idempotencyKey}, client?)` → `{ok, recount: RecountView, duplicated?}`
- `RecountView` = `{id, shiftId, zNumber, expectedCashSatang, countedCashSatang, varianceSatang, countDetail, note, recountedByUserId, recountedAt}`
- `recountShiftAction(args: Target & {recount})`
- codes `SHIFT_NOT_FORCED` and `ALREADY_RECOUNTED`; message keys `pos.register.errors.shiftNotForced` and `pos.register.errors.alreadyRecounted`
- `pos.shift.recount.{title,action,counted,variance,note,by,at,saved}`
- audit action `pos.shift.recount` (targetType `PosShift`)
- read paths: a `recount` sibling on the zReport/xReport result, and `listShifts` item.recount `{countedCashSatang, varianceSatang, recountedAt} | null`
- UI state name matching `/[Rr]ecount\w*Key/` with `useState(newKey)`

## Expected base run (842cd4f7 · P1.9 built, P1.9b not)
| Run | Expected result | Notes |
|---|---|---|
| `--list` | 22 ids, exit 0 | **ran here** |
| `--no-db` | 1/8, exit 1 | **ran here**. ST8 is green. ST1–ST7 are red for the right reasons (no model, no migration, no scope line, no `recountShift`, no codes, no action, no messages, no UI). |
| unforced | **SKIPPED, exit 0** | Reasons: no `recountShift` export, no `posShiftRecount` delegate, missing PosShiftRecount columns. The P1.9 prerequisites are present. |
| `QC_FORCE=1` | **3/22 green: ST8 · Z1 · Z2**, exit 1 | Details below. |

The 19 red checks under `QC_FORCE=1`:
- ST1–ST7 are red, as in `--no-db`.
- RC1–RC12 are red because `recountShift` returns `MISSING:recountShift`. Fixtures still build, since P1.9's open, close, currentShift and createSale(shiftId) all exist.
  - RC2 is red on purpose: "not recounted yet", even though the row is unchanged.
  - RC4 is red because zReport has no `recount` sibling.
  - RC12 is red because the MISSING codes count as "other code" and the 6 wanted codes are never seen.
- Z1/Z2 are green because cleanup removes the sandbox units, system, shifts, sales, audit and outbox rows.

Not run here: the DB modes (no DB). typecheck: see the commit report.

## Drift and risks found
- **The P1.9 scope.ts comment stripper** (P1.9 notes) would hide entries placed after the M2.9 comment. ST3 here checks raw lines (`^\s*PosShiftRecount\s*:`), so placement does not matter for this oracle. The brief still asks for placement next to the P1.9 entries.
- **Same-key race.** A loser of the `prior()` race reaches the tx after the winner's commit and sees an existing recount. Brief R2 step 5 therefore says: same key + same payload → duplicated, not ALREADY_RECOUNTED. RC11 enforces this.
- **P1.9 oracle compatibility.** Adding the `recount` sibling to `zReport/xReport` results and `listShifts` items must not break `qc-pos-p1.9`. Its C5 and X checks compare `report` and fields, not the whole result object. The builder must re-run `qc-pos-p1.9`; this is in the acceptance list.
- **Variance basis = the frozen Z expected** (R4), not a live recompute: module voids after close are allowed by P1.9 R2 F4, so a live figure can drift.
- The opener reading Z of their own forced shift sees the recount (RC6). Read permissions are unchanged from P1.9.
