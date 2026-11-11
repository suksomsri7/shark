# P1.5 — hold / recall bills (brief DRAFT · controller · cloud run · 3 Oct 2026)

> DRAFT without DB. Preconditions: P1.3 accepted + merged; re-verify file:line. Mockup 14 (held-bills drawer, marked * in plan).

## Facts (on `wip/pos-p1.3` 5f97add4)
- `RegisterScreen.tsx:429` `onHold = soon` (F8) and held-bills button = soon; cart is one serialisable `RegisterCart` (`register-shared.ts`) — P1.3 spec §1.3 designed it to be stored verbatim.
- No `PosHeldCart` table yet (DESIGN-POS §7 / MIGRATION-PLAN list it). Approval contract already allows `refType:'PosHeldCart'` (POS-CONTRACTS:66).

## Rulings (proposed)
H1 **Table** `PosHeldCart` (tenantId, unitId, systemId, label ≤60, cartJson, lineCount, approxTotalSatang, heldByUserId, recalledAt?, recalledByUserId?, status HELD|RECALLED|DISCARDED, createdAt, version) — additive migration, index (unitId, status, createdAt). Cart JSON validated server-side on write (same schema as quote input; prices NOT trusted).
H2 **Recall is atomic and single-winner**: `UPDATE … SET status='RECALLED' WHERE id=? AND status='HELD'` count===1, else `ALREADY_RECALLED` (2 devices racing ⇒ exactly one gets the cart; X6, 10 lanes × 3 rounds).
H3 **Re-price on recall**: recalled cart goes through `quoteRegisterCart` again; changed price/archived/unavailable product ⇒ shown as line warnings, never silently re-priced at the old price (S-check: hold at ฿50, change price to ฿60, recall ⇒ quote 60 + visible notice).
H4 Scope: per unit (not cross-branch); visible to all register users of that unit; discard needs the same permission as clearing a bill; auto-expire HELD older than N days (setting, default 2) by a cron — or lazily on list (builder proposes; no new cron if lazy works).
H5 Holding the current cart clears the screen and rotates the bill's idempotency key; recall creates a NEW key (a held cart never reuses a key that might have reached the server).
H6 F8 hold · held-bills button with count pill (P1.3 spec rows 14/15) · drawer per mockup 14 · ≥44px · `pos.*` th+en.
H7 Oracle `qc-pos-p1.5.mts` (~20): hold/list/recall/discard, race, re-price, cross-unit/cross-tenant = NOT_FOUND, permission, idempotency key rotation static, residue check.

## Controller rulings on the oracle writer's questions (4 Oct · oracle `wip/pos-p1.45-oracle` 171e8fbc, 21 checks)
1. **Expiry** is rolling, measured from `createdAt` (default 2 days = 48 h, settable). It is lazy on list, with no cron.
2. **Bad lines on recall:** keep them with a visible warning, never drop them silently. Pay is blocked until the cashier removes or fixes them; the quote path already refuses archived and unavailable lines.
3. **Discarding another user's held cart:** needs the same permission as clearing a bill (H4), with no extra role. The audit row records who discarded it.
4. **Recall while the current cart is not empty:** the UI asks "hold current bill first?" (hold or cancel). The server is unaffected. The current cart is never silently overwritten.
5. **Approval link** uses `entityType` (the code name). POS-CONTRACTS:66 `refType` is outdated; fix it at P6 docs.
6. **Names ratified** as listed in `ledger/wo-notes/pos-P1.5-oracle.md`. Key rotation goes through `resetBill()` for both hold and recall (this keeps P1.3 S5.21).
