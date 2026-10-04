# POS P1.9b — manager recount of a force-closed shift (builder notes)

Builder · cloud run · 4 Oct 2026 · base `wip/pos-p1.9b-oracle` a4bc5d44 · pushed to `wip/pos-p1.9b`.
Brief `ledger/pos-briefs/pos-brief-P1.9b.md` (R1–R14 ratified) · oracle `scripts/qc-pos-p1.9b.mts` (not edited).
No DB here: no DB mode was run. The controller applies the migration to QC4 and runs the DB oracle.

## Migration
`prisma/migrations/20261125000000_pos_p19b_shift_recount/migration.sql` (sorts after `20261124000000_pos_p12_options`).
- Body = `prisma migrate diff --from-schema <prisma/schema at a4bc5d44, extracted to scratch> --to-schema prisma/schema --script`, verbatim.
  A header comment plus `SET lock_timeout = '3s';` sit on top (same style as P1.9/P1.2).
- Statements: `CREATE TABLE "PosShiftRecount"` (14 columns; `countDetail JSONB` the only nullable one; `createdAt DEFAULT CURRENT_TIMESTAMP`),
  `CREATE UNIQUE INDEX "PosShiftRecount_shiftId_key"`, `CREATE INDEX "PosShiftRecount_tenantId_unitId_createdAt_idx"`,
  `CREATE UNIQUE INDEX "PosShiftRecount_tenantId_idempotencyKey_key"`.
- No FK (shiftId is a loose id, as for PosCashMovement), no ALTER of any table, no DROP/RENAME/SET NOT NULL. New empty table ⇒ no rewrite, no long lock.
- Sanity: before the schema edit the same diff printed "This is an empty migration" (the extracted base = the tree), so the diff after the edit is exactly the P1.9b change, i.e. schema ↔ SQL agree.
- `prisma generate` run here (shared node_modules; additive superset).
- The new model block is `prisma format`-clean (pos.prisma has pre-existing format drift elsewhere; not touched).

## What was built
| step | commit | files |
|---|---|---|
| 1 schema + migration + scope | 720d90c5 | `prisma/schema/pos.prisma` (model PosShiftRecount) · migration · `src/lib/core/scope.ts` (`PosShiftRecount: sys()` at the head of MODULE_SCOPES, after the P1.9 entries) |
| 2 service + action + messages | ae36a49e | `shift.ts` · `shift-actions.ts` · `register-shared.ts` (REFUSAL_KEY +2, append-only block) · `src/messages/{th,en}/pos.json` |
| 3 UI | 7b2ea1b3 | `ShiftsClient.tsx` · `scripts/pos-ui-inventory.json` (+5 rows, wo P1.9b) |

`shift.ts`:
- `ShiftRefusalCode` + `SHIFT_NOT_FORCED`, `ALREADY_RECOUNTED` (Thai MSG for both). `ShiftRefusal` gains optional `recountId` (ALREADY_RECOUNTED carries it, R6).
- `recountShift(ctx, actor, input, client?)` → `{ok, recount: RecountView, duplicated?: true} | ShiftRefusal`. Order exactly R2:
  scopeOf (NOT_FOUND) → `!s.manage` = PERMISSION_DENIED → validation (keys, counted int 0…2e9, countDetail via `denomDetail` (null/undefined ok), note required trimmed 1–200, key `isId`; bad shiftId = NOT_FOUND) →
  `prior()` on `(tenantId, idempotencyKey)` → tx: `lockShift` FOR UPDATE (NOT_FOUND) → status ≠ FORCE_CLOSED = SHIFT_NOT_FORCED → existing recount by shiftId:
  same key + same payload = ok duplicated · same key other payload = IDEMPOTENCY_CONFLICT · else ALREADY_RECOUNTED → insert row + AuditLog (R5) in the same tx.
  P2002 → `prior()` again, else ALREADY_RECOUNTED (+recountId).
- Never touches PosShift / PosShiftCounter / outbox (no `finalizeClose`, `bumpCounter`, `emitOutbox`, `scheduleDrain`).
- Read paths: `xReport` (closed shift) and `zReport` return `{ok, report, recount: RecountView | null}`; `report` is the stored Z object untouched. X of an OPEN shift has no `recount` key.
  `listShifts` items are `ShiftListItem = ShiftView & {recount: {countedCashSatang, varianceSatang, recountedAt} | null}` (one extra `findMany` by shift ids).

UI (`/pos/shifts`): history row of `FORCE_CLOSED` + `recount === null` + `canManage` shows "Recount" (≥44px). Dialog: counted (baht) + note + save/cancel.
Refusals and client-side validation show **inside the dialog** (`recountErr`); on refusal nothing reloads, so `load()` cannot wipe it (the P1.9 S2 lesson).
On success: key rotated, dialog closed, Z of that shift opened with the recount block, `saved` notice, then `load()`. History rows show the recount variance.

## Rules I invented (controller to ratify)
- **Payload equality** for idempotency = same unitId, systemId, shiftId, countedCashSatang, trimmed note, and countDetail compared key-order-independently (jsonb reorders keys). `countDetail: null` and omitted are the same payload.
- **Validation order**: keys → counted → countDetail → note → idempotencyKey → shiftId (NOT_FOUND). Same order as `recordCashMovement`.
- A forced shift with null zNumber/expectedCashSatang (cannot happen via `finalizeClose`) → `INTERNAL`, not a write.
- `recount.by` in the UI shows the last 8 chars of `recountedByUserId` (no name lookup on this page; a name join is a follow-up if wanted).
- The dialog has no backdrop-click close (keeps F15.3a debt at 0); Cancel button only.
- Inventory rows: the 5 new testids are `roles: ["owner"]`, `hiddenFor: ["cashier"]` (cashier has no manage).

## Checks (this tree, no DB)
| command | result |
|---|---|
| `NODE_OPTIONS=--max-old-space-size=5632 pnpm typecheck` | exit 0 (after each step) |
| `env -u DATABASE_URL -u DIRECT_URL pnpm fitness` | 41/41, exit 0 |
| `pnpm exec tsx scripts/fitness-pos.mts` | 8/8, exit 0 (F15.3a was red until the 5 inventory rows + cancel testid were added) |
| `qc-pos-p1.9b --no-db` | step 1: 4/8 (ST1 ST2 ST3 ST8) · final: **8/8, exit 0** |
| `qc-pos-p1.9b --list` | 22 ids, exit 0 |
| `qc-pos-p1.9 --no-db` | 13/13, exit 0 |
| `qc-pos-p1.4 --no-db` · `qc-pos-p1.5 --no-db` | 13/13 · 5/5, exit 0 |

No fitness baseline was raised. Not run here: any DB mode, build, visual (`scripts/visual-pos.mts`) — CONTROLLER-RUN.

## Expected DB result (QC4, after `prisma migrate deploy` of the new folder)
`qc-pos-p1.9b` unforced: **22/22, exit 0** (SKIP gate clears: export, delegate, columns). Per check:
| id | expected |
|---|---|
| ST1–ST8 | green (as `--no-db`) |
| RC1 | ok · row expected 5,500 · counted 5,000 · variance −500 · zNumber = shift's · countDetail `{"1000":5}` · not duplicated |
| RC2 | PosShift row, Z bytes, PosShiftCounter, shift events, sales/payments/moves unchanged (no write to any of them) |
| RC3 | exactly 1 AuditLog `pos.shift.recount`, before/after per R5 |
| RC4 | Z and X of SA carry `recount` sibling, report verbatim (`countedCashSatang` null); list SA.recount set; SC (normal close) `recount: null` in list and Z |
| RC5 | OPEN and CLOSED → SHIFT_NOT_FORCED, no row/audit |
| RC6 | operate opener and sale-only → PERMISSION_DENIED (manage check is before the key lookup); STAFF+manage → ok, variance −100; opener sees recount in Z |
| RC7 | duplicated / IDEMPOTENCY_CONFLICT / ALREADY_RECOUNTED; 1 row, 1 audit |
| RC8 | 14 × VALIDATION, no rows |
| RC9 | NOT_FOUND × 3 (other unit via lockShift scope, other tenant, unknown id) |
| RC10 | per round 1 ok + 9 ALREADY_RECOUNTED (FOR UPDATE serializes; the losers read the committed row under READ COMMITTED); 1 row, 1 audit |
| RC11 | 6 × ok, same id; first commits, the other 5 hit the existing-row branch with same key+payload ⇒ duplicated; 1 row, 1 audit |
| RC12 | all 6 codes seen, none thrown, no other code |
| Z1 · Z2 | green (cleanup deletes PosShiftRecount by unit and shiftId, audits by targetId) |

Also expected unchanged: `qc-pos-p1.9` 53/53 (it compares `report`/fields, never whole result objects), money set (no sale path touched).
Risk to watch on the VPS: RC10/RC11 use 10 PrismaClients × max 2 connections; `runTx` timeout 20 s / maxWait 10 s as in P1.9.
