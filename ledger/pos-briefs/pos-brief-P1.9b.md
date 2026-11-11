# P1.9b — manager recount of a force-closed shift (brief DRAFT · oracle writer · cloud run · 4 Oct 2026)

> Status: DRAFT written without DB access, for the controller to ratify. Base: `session/pos` 842cd4f7 (P1.9 accepted with R2 F1–F7, P1.2 S accepted). Lane rules + COMMON apply. Re-verify every file:line below on the builder's head.
> Owner ruling: **Q9.4** (brief P1.9 §3 O25, POS-RESUME 4 Oct 09:17): a manager may recount a shift that the system force-closed. The recount is recorded with an audit row. Deferred from P1.9 by §R2 ("Q9.4 manager recount of force-closed shift → new WO P1.9b").
> Oracle: `scripts/qc-pos-p1.9b.mts` (22 checks) · notes `ledger/wo-notes/pos-P1.9b-oracle.md`.
> Mockups: none. Mockup 07 has no recount control. Keep the UI to one button and one dialog on `/pos/shifts` (R12).

## 1. Facts as built (verified on `p19b-local` 842cd4f7)
- **Forced close.** `forceCloseOne` (`shift.ts:397-408`) calls `finalizeClose` (`:332-394`) with `forced:true, counted:null, byUserId:null, closeKey:null`.
  - The row is written once (`:368-384`): `status FORCE_CLOSED`, `expectedCashSatang` computed, `countedCashSatang/overShortSatang/closedByUserId` = null, `zNumber` from `zSeq`, and `zReport` frozen with `forced:true` (`:354-367`).
  - Event `pos.shift.closed` with `forced:true` (`:385-392`).
  - Triggers: the lazy path in `openShiftOfDevice` (`:411-420`, used by `openShift :442`, `currentShift :493` and `resolveRegisterShift :739`), and the hourly sweep `forceCloseStaleShifts` (`:699-723`).
- **Z is immutable** (`shift.ts:6`). `zReport()` returns the stored JSON (`:520-532`). `xReport()` of a closed shift returns the stored Z (`:512`). `closeShift` on a non-OPEN shift returns `SHIFT_CLOSED` unless the key matches `closeKey` (`:575-578`). A forced shift has `closeKey` null, so it can never be closed or counted today. **Nothing records a late count.**
- **Refusals** are data: `ShiftRefusalCode` (`shift.ts:62-72`), Thai `MSG` (`:128-139`), `refuse()` (`:140`), `guard()` turns a throw into `INTERNAL` (`:143-150`).
  - Scope: `scopeOf` (`:191-206`) gives a wrong tenant/system/unit `NOT_FOUND`, and computes `operate` and `manage` (`:203-204`). `shiftInScope` (`:209-212`). `lockShift` takes `FOR UPDATE` in scope (`:215-220`).
- **Idempotency pattern** to copy: `recordCashMovement` (`:605-649`).
  - `prior()` looks up `(tenantId, idempotencyKey)` before the tx: same payload ⇒ `duplicated:true`, different payload ⇒ `IDEMPOTENCY_CONFLICT` (`:620-628`).
  - A P2002 inside the tx re-runs `prior()` (`:644-647`).
- **Reads.** `listShifts` (`:653-668`) returns `ShiftView` (`:75-91`, `viewOf :222-240`). manage sees all shifts; operate sees only its own.
- **Schema.** `PosShift` is at `prisma/schema/pos.prisma:307-337`. Its count columns are nullable (`:322-324`). The latest migration is `20261124000000_pos_p12_options`.
  - scope registration: `core/scope.ts:51-55`. `PosShift: sys()` sits at the head of `MODULE_SCOPES`, because the P1.9 oracle comment stripper eats everything after the M2.9 comment (P1.9 notes).
- **Permissions.** `pos.shift.operate` and `pos.shift.manage` exist (`core/permissions.ts:138-139`). OWNER/MANAGER get both through `evaluate`.
- **Audit row pattern.** `tx.auditLog.create({ tenantId, unitId, actorType:"USER", actorId, action:"pos.heldCart.discard", targetType, targetId, before, after })` in the same tx (`held-cart.ts:273-284`). `AuditLog` is at `core.prisma:215-233`.
- **Actions.** `shift-actions.ts` is `"use server"`.
  - The coarse gate (`scopeOf :55-75`) needs operate, manage or sale.create at the unit; fine-grained checks are in `shift.ts`.
  - Every action is `session → scopeOf → service → catch → unexpected` (e.g. `zReportAction :142-152`).
- **UI.** `ShiftsClient.tsx` has:
  - history list `:314`, with the "forced" text from `statusText :214`
  - `showZ` → `viewZ` + `<Report>` (`:205-211`, `:294-297`)
  - refusal text through `te(refusalMessageKey(code))` (`:113`; `register-shared.ts:463-509`)
  - idempotency keys held in state and rotated only after success (closeKey `:108`, moveKey `:110`; R2 F6)

  `page.tsx:26` passes `canManage`. Messages are `src/messages/{th,en}/pos.json` → `pos.shift.*`.

## 2. Contract (proposed rulings R1…R14 — controller; additive only)
R1 **Model: a new table. PosShift gets no new columns.** The row of a forced shift is never written again (R3).
  - `PosShiftRecount` has these columns:
    - `id` cuid, `tenantId`, `unitId`, `systemId`
    - `shiftId` String **@unique**: one recount per shift (R6), and the unique index decides races (R11)
    - `zNumber` Int: copied from the shift
    - `expectedCashSatang` Int: copied from `PosShift.expectedCashSatang`, the frozen Z expected
    - `countedCashSatang` Int
    - `varianceSatang` Int = counted − expected
    - `countDetail` Json?
    - `note` String (1–200)
    - `recountedByUserId` String
    - `idempotencyKey` String
    - `createdAt` DateTime @default(now()) (this is "recountedAt")
  - `@@unique([tenantId, idempotencyKey])` and `@@index([tenantId, unitId, createdAt])`.
  - `shiftId` is a loose id with no FK, as ratified for `PosSale.shiftId` and `PosCashMovement.shiftId`.
  - Register it in `core/scope.ts` as `PosShiftRecount: sys()`, **next to the P1.9 entries at the head of `MODULE_SCOPES`**.
  - Migration `2026112500000x_pos_p19b_recount`: CREATE TABLE plus indexes only. No ALTER of `"PosShift"`, no DROP/RENAME/SET NOT NULL. Use `migrate diff` against a pre-change schema copy, read the SQL, then deploy to QC4 only.
R2 **Service** `recountShift(ctx, actor, {shiftId, countedCashSatang, countDetail?, note, idempotencyKey}, client?)` in `src/lib/modules/pos/shift.ts`, which stays the only writer of shift tables. It returns `{ok:true, recount: RecountView, duplicated?: true} | ShiftRefusal`.
  - `RecountView` = `{id, shiftId, zNumber, expectedCashSatang, countedCashSatang, varianceSatang, countDetail, note, recountedByUserId, recountedAt (ISO)}`.
  - The order is fixed:
    1. scope (`NOT_FOUND`)
    2. permission (R7)
    3. input validation (R9)
    4. key lookup `prior()`
    5. tx: `lockShift` FOR UPDATE → `NOT_FOUND`; status ≠ FORCE_CLOSED → `SHIFT_NOT_FORCED`; then, if a recount already exists:
       - same key and same payload → `ok` + that row + `duplicated:true`. This is a same-key racer that lost the `prior()` race (R11).
       - same key, different payload → `IDEMPOTENCY_CONFLICT`
       - otherwise → `ALREADY_RECOUNTED`

       If none exists, insert the recount + the audit row (R5).
    6. on P2002 → `prior()` again, otherwise `ALREADY_RECOUNTED`
  - Permission comes before the key lookup, so a replayed key never bypasses permission. This is the P1.9 deferred item "duplicate-close key before permission", which is not repeated here.
R3 **Frozen Z stays immutable.** `recountShift` never updates `PosShift`: every column, including `updatedAt`, `zReport`, `countedCashSatang` (still null) and `closeKey` (still null), is byte-identical before and after. It does not move `PosShiftCounter` (no new zNumber). It emits no `pos.shift.closed` and touches no sale, payment or cash movement.
R4 **Variance basis = the frozen Z.** `varianceSatang = countedCashSatang − PosShift.expectedCashSatang`. It is not recomputed from live sales: module voids are allowed after close (P1.9 R2 F4), so a live figure could drift from Z. There is no over/short threshold or REASON_REQUIRED, because the note is always required (R9).
R5 **Audit row** in the same tx: exactly one `AuditLog` per recount.
  - Fields: `tenantId`, `unitId`, `actorType "USER"`, `actorId` = the actor, `action "pos.shift.recount"`, `targetType "PosShift"`, `targetId` = shiftId.
  - `before {status:"FORCE_CLOSED", zNumber, expectedCashSatang, countedCashSatang:null}`
  - `after {recountId, countedCashSatang, varianceSatang, note}`
  - A duplicate replay writes no audit row.
R6 **Policy: one recount per shift, final.** A second recount with a new key gives `ALREADY_RECOUNTED` (carrying `recountId`). A correction of a recount is out of scope; if the owner wants one later, it is a new WO with a versioned table. There is no time window: any FORCE_CLOSED shift of the unit can be recounted.
R7 **Permission: `pos.shift.manage` only** (existing key; no new key).
  - operate-only actors get `PERMISSION_DENIED`, even the opener of the shift.
  - OWNER/MANAGER get it through `evaluate`, and a STAFF member with an explicit `pos.shift.manage` is allowed.
R8 **Only forced shifts.** An OPEN shift or a normally CLOSED shift gives `SHIFT_NOT_FORCED`, with no row and no audit.
R9 **Validation** (`VALIDATION`, nothing written):
  - keys limited to `shiftId, countedCashSatang, countDetail, note, idempotencyKey`
  - `countedCashSatang` an integer 0…2,000,000,000
  - `countDetail` optional, with known denominations (`SHIFT_DENOMS`) and Σ = counted
  - `note` required, trimmed, 1–200 characters
  - `idempotencyKey` must pass `isId`

  A bad `shiftId` is `NOT_FOUND`.
R10 **Idempotency.** The key is per tenant (`@@unique([tenantId, idempotencyKey])`).
  - A same key with the same payload (shiftId, counted, countDetail, note) returns `ok` + the same row + `duplicated:true`. It writes no new row and no audit row.
  - A same key with a different payload returns `IDEMPOTENCY_CONFLICT`.
R11 **Concurrency.** N managers recount the same shift at once with different keys. Exactly one gets `ok`; the rest get `ALREADY_RECOUNTED`. There is 1 recount row and 1 audit row. The FOR UPDATE lock on the shift row serializes them, and `shiftId @unique` is the backstop. N concurrent calls with the same key all return the same row id, with 1 row and 1 audit.
R12 **Read paths show the recount alongside the frozen Z, never merged into it.**
  - `zReport` and `xReport` of a closed shift return `{ok, report, recount: RecountView | null}`. `report` stays the stored Z verbatim; `recount` is a sibling key. For an OPEN shift (`xReport`), `recount` may be absent.
  - Each `listShifts` item gains `recount: {countedCashSatang, varianceSatang, recountedAt} | null`.
  - Read permissions are unchanged from P1.9: operate reads its own shifts, manage reads all, so the opener sees the manager's recount of their shift.
R13 **Action + UI (minimal).**
  - `recountShiftAction(args: Target & {recount: RecountShiftInput})` in `shift-actions.ts`: session → scopeOf → `recountShift` → catch → `unexpected`; `touch()` on success.
  - `ShiftsClient`: in the history row of a `FORCE_CLOSED` shift with `recount === null` and `canManage`, show a button (≥44px, tokens only) that opens a dialog with counted (baht), note and save. Hold the key in state (`recountKey`) and rotate it only after success (the F6 pattern). Refusals use `te(refusalMessageKey(code))`.
  - The Z view shows a recount block (counted, variance, by, at) when `recount` is present.
  - Messages th+en: `pos.shift.recount.{title,action,counted,variance,note,by,at,saved}`. `refusalMessageKey` maps `SHIFT_NOT_FORCED → errors.shiftNotForced` and `ALREADY_RECOUNTED → errors.alreadyRecounted`, with both keys under `pos.register.errors` in th+en. `src/messages/*` and `register-shared.ts` hunks are append-only.
  - Visual check by the controller (one screenshot of the dialog at 1440 and 390); not in the oracle.
R14 **No event, no new permission key, no hot-file hunks** beyond messages. A recount is an audit fact. The over/short JV for recounts is a P3 consumer that may later add `pos.shift.recounted`; P1.9b adds none (so there is no `outbox-consumers.ts` or `labels.ts` change). `ShiftRefusalCode` gains `SHIFT_NOT_FORCED` and `ALREADY_RECOUNTED`, and `MSG` gains Thai texts for both.

## 3. Owner questions
None. Q9.4 is answered ("manager may recount, audit row"). Policy choices are made here as rulings for the controller: R6 one final recount with no window, R7 manage-only, R14 no event. If the owner later wants corrections or a JV, that is a new card.

## 4. Order of work
1. The controller ratifies R1–R14 and the invented names (oracle notes §Names).
2. Base run of the oracle on the VPS:
   - unforced: SKIPPED, exit 0
   - `QC_FORCE=1`: 3 green (ST8 · Z1 · Z2), 19 red
   - `--no-db`: 1/8 (ST8), exit 1

   Then accept the oracle and merge it into `session/pos`.
3. Builder (one card, S+U small):
   - schema + migration (QC4 only)
   - scope.ts
   - `shift.ts` `recountShift` + `RecountView` + the read-path sibling + listShifts field + 2 codes
   - `shift-actions.ts` action
   - `register-shared.ts` REFUSAL_KEY (2 rows)
   - messages th+en
   - ShiftsClient button + dialog + Z block
4. Reviewer → hunter (race R11, immutability R3) → controller visual → accept.

## 5. Acceptance
- `qc-pos-p1.9b` 22/22 forced ×2, plus unforced with no residue (Z1/Z2).
- `qc-pos-p1.9` 53/53 unchanged (its Z/X/list assertions must still hold with the added `recount` sibling key).
- `qc-pos-p1.6`, `qc-pos-p1.3`, `qc-pos-closeday` and `qc-pos-account` green. The money set (COMMON §7) is unchanged (no sale path is touched).
- `pnpm fitness` both modes · `fitness-pos` · typecheck · build.

## 6. Out of scope
- correcting or deleting a recount, or several recounts per shift (R6)
- recount of normally closed shifts (R8)
- an over/short JV, Kanban card or LINE note for a recount (P3; R14)
- a denomination grid in the dialog (the server accepts `countDetail`; the UI may omit it)
- shift reports and monthly over/short (P1.17 reads `PosShiftRecount` if it wants)
- settings UI
