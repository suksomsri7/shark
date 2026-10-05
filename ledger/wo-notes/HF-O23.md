# HF-O23 — legacy POS register: idempotency-key squatting

Base: `rc/hotfixes-2026-10-01` 8999a79e · branch `wip/pos-hf-o23` · no schema change · no migration.

## Problem
`registerSaleAction` (`src/lib/actions/pos.ts`) took `input.idempotencyKey` from the client verbatim, looked up
`PosSale` by `(tenantId, idempotencyKey)` and returned that sale's receipt as "ok"; otherwise passed the same key to
`createSale`. Other modules write PosSale rows with predictable keys in the same unique space:
`hotel-sale-<resId>`, `hotel-deposit-<resId>`, `booking-sale-<apptId>`, `booking-deposit-<apptId>`, `ticket-sale-<orderId>`,
`ecom-<orderId>`, `rental-<bookingId>`, `rental-deposit-<bookingId>`, `clinic-<visitId>`, `school-<enrollmentId>`,
`subscription-<subId>`, `rest-<sha256…>`, `giftcard-{sell,reload,refund}-<…>`, `ai-<proposalId>`.
- (a) A cashier could pre-create a POS sale under another module's future key → that module's `createSale` short-circuits
  on the dup and returns the squatted sale → room/order never billed.
- (b) Sending another module's key returned that sale's receiptNo / grand total.

## Fix (mirrors V2 register R4 K1 `reg2:` on session/pos)
New `src/lib/modules/pos/legacy-key.ts` (separate file so it does not collide with session/pos's `register.ts`):
- `isPosClientKey`: `/^[A-Za-z0-9_-]{8,100}$/` — no `:` so a client cannot forge the prefix. Failure = existing Thai error.
- `posStoredKey(k)` = `"pos1:" + k` — used for lookup and `createSale`.
- `lookupPosKey(db, tenantId, unitId, k)` → `replay | taken | none`:
  - `pos1:` row with `sourceModule === "POS"` and same `unitId` → replay (same receipt, `changeSatang: 0` as before).
  - `pos1:` row of another unit → `taken` → error (never handed to `createSale`, whose own dup check would return it).
  - no `pos1:` row → bare-key row returned ONLY if POS + same unit (pre-deploy tab retry); anything else ignored → sale
    proceeds under `pos1:` key. Another module's sale is never returned.
- `register-ui.tsx`: key generator uses `crypto.randomUUID()` (passes); the non-secure-context fallback
  `k-<ts>-${Math.random()}` contained `.` and would now be rejected → changed to `Math.random().toString(36).slice(2)`.
- Not changed: concurrent double-submit with the same key still surfaces the unique-violation as an error (same as before;
  `createSale` has no P2002 re-read). Out of scope.

## Entry points that put an idempotency key into PosSale (grep `idempotencyKey` / `createSale(` in src/lib/actions + src/app/api)
| Entry | Key | Client-supplied? | Status |
|---|---|---|---|
| `actions/pos.ts registerSaleAction` | client | yes | **fixed** (`pos1:` + charset + POS/unit check) |
| `actions/booking.ts` (mark paid) | `booking-sale-${appt.id}` | no (server id) | ok |
| `actions/systems.ts` adjustPoints | `manual-…-${randomUUID()}` | no; PointLedger, not PosSale | n/a |
| `api/store/[tenantSlug]/[unitSlug]/book` | client (`z.string().max(100)`) | yes; goes to `Appointment.idempotencyKey`, not PosSale | n/a (own table) |
| `api/mobile/crm/call-log` | client, cleaned | yes; CRM activity, not PosSale | n/a |
| giftcard sell/reload (UI `ui-…`, API `api.giftcards.*`) | `giftcard-sell-<idem>` etc. | partially; namespaced `giftcard-*` prefix + checked against `GiftCardTxn` first | not squattable by POS anymore; intra-giftcard replay semantics unchanged (note only) |
No other action/API route calls `createSale` or `posSale.create` (QC ST6 pins this list).

## Checks (local, no DB)
- `NODE_OPTIONS=--max-old-space-size=5632 pnpm typecheck`: 1 error, `pos/service.ts(498)` `Record<PosPayType>` missing `CARD` —
  identical on untouched base (shared Prisma client is generated from session/pos's newer schema). No new errors.
- `env -u DATABASE_URL -u DIRECT_URL pnpm fitness`: 18 ✅ / 1 ❌ (F10.1 + F13 crash: scope registry vs newer client's
  13 Pos* models) — identical to base, env-induced.
- `pnpm exec tsx scripts/qc-hf-o23.mts --no-db`: 6/6 (ST1–ST6). Mutation: base `pos.ts` → ST2 red.
- esbuild syntax on `scripts/qc-hf-o23.mts`: ok.

## DB suites for the controller (QC4 / VPS)
- `qc-hf-o23` (new: DB1–DB5 + Z1 residue; asserts host `ep-frosty-lab`, `QC_ENV_FILE` defaults to `.env.qc`).
- `qc-hf-pos-page-authz` (same file `actions/pos.ts`).
- Regression (unchanged behaviour expected; they call `createSale` directly, not the action): `qc-pos-register`,
  `qc-pos-coupon`, `qc-pos-closeday`, `qc-hotel-money`, `qc-booking-deposit`, `qc-shop`, `qc-rental`, `qc-clinic`,
  `qc-school`, `qc-restaurant-pay`.

## Deploy note — in-flight tabs
- Tabs opened before deploy hold a UUID key → still valid charset. If such a tab re-submits a bill already saved under the
  bare key, the bare-key fallback returns it (POS + same unit) → no double sale. New sales from those tabs are stored as `pos1:`.
- Tabs on a non-secure context that used the old `k-<ts>-<0.123…>` fallback get "ข้อมูลบิลไม่ครบ ลองใหม่อีกครั้ง" once;
  reload fixes it (production is HTTPS, so `randomUUID` is the normal path).
- Existing rows are not rewritten. The bare-key fallback can be removed once no tab predates the deploy (e.g. after a day).
