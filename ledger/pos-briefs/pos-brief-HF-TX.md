# POS HF-TX — createSale must not treat a caller's interactive tx as its own (Prisma 7 nested savepoint)

Base `session/pos` 1636da3c. Severity: **low/medium hygiene + contract fix** — no stock/accounting loss on today's call sites (investigator probe, QC4, 10 Oct), but the contract "createSale(input, tx) runs in the caller's tx and does no post-commit work" is false since repo inception (Prisma ^7 since 758bb3e4, 2026-07-11; ownsTx gate since 9a6407ee/87c3d972, 16–18 Jul). Must land **before** P2.4 / P2.8 merge so their local proxies are replaced by the canonical one.

## Facts (evidence in investigator REPORT)
- Prisma 7.8 itx client exposes `$transaction` (function, `"$transaction" in tx` = true); calling it nests a SAVEPOINT on the same backend (same pid/xid).
- `pos/service.ts:462` `ownsTx = "$transaction" in client && typeof … === "function"` ⇒ always true ⇒ `withTx` (:39) opens a savepoint, and the post-"commit" block (:804–810) runs **before the caller commits**: `consumeSaleInventory` reads the sale through global `prisma`, does not see it, returns `true` silently (no log); `scheduleDrain()` fires early.
- Sale rows get the subtransaction xid (≠ caller xid): intent path PosSale/Line xmin 5383969 vs PosPaymentIntent/PosPayment 5383968. Atomicity holds (caller rollback ⇒ 0 sale rows).

## Scope (IN)
1. **Canonical helper** `src/lib/core/caller-tx.ts`: `export function callerTx<T extends object>(tx: T): T` — Proxy that hides `$transaction` (`has` false, `get` undefined) and binds methods (same shape as P2.4 `regCallerTx` / P2.8 `flatTx`). Pure, no imports. JSDoc: why (Prisma 7 nested savepoint) + rule "every helper that decides ownership by `$transaction` must receive `callerTx(tx)` when called inside a caller's tx".
2. **Post-commit helper** in `pos/service.ts` (additive export, via `pos/index.ts` facade): `afterSaleCommitted(input: CreateSaleInput, saleId: string): Promise<void>` = exactly today's :804–810 body (stock lines ⇒ `consumeSaleInventory`; then `scheduleDrain()`). createSale's own owned branch calls it (no behaviour change for top-level callers). F15.2 contract snapshot: additive only (refresh via `--update-pos-contract`).
3. **Switch call sites** (all createSale calls that pass a tx):
   - `pos/register.ts:2263` `regCreateSale(saleInput, callerTx(tx))`; replace :2271–2272 inline cut+drain with `afterSaleCommitted(saleInput, saleId)`.
   - `giftcard/service.ts:403` (sell) and `:674` (reload): `pos.createSale({...}, callerTx(tx))` + `await pos.afterSaleCommitted(input, saleId)` after the `$transaction` resolves (today its drain comes only from the nested branch — must keep an immediate drain).
   - P2.4 `regCallerTx` (wip/pos-p2.4 register.ts:2469) and P2.8 `flatTx` (wip/pos-p2.8 order.ts:437) — HF-TX markers: delete the local proxies, use `callerTx` + `afterSaleCommitted` (done by those lanes when they rebase on the HF, or by HF if merged first — controller rules).
4. Behaviour change to accept: under `callerTx`, createSale no longer retries P2002 (receipt counter row of a new month) inside a savepoint — the error aborts the caller tx. register intent path already retries the whole tx on P2002 (`continue`) ✓; giftcard sell/reload: wrap their `$transaction` in the same ≤3-attempt P2002 retry (idempotency key makes it safe) — or document as accepted (controller decides; default = add retry).

## OUT of scope
Other `"$transaction" in` helpers (pos/device.ts:68, channel.ts:371, payment-intent.ts:100, catalog.ts:145/1600, stamp/service.ts:34, ticket/service.ts:21, point/internal.ts:31) only nest a savepoint (atomic, no post-commit gating) — list them in a follow-up note, do not change. `ticket.cancelOrder` ownsTx gate (:385) has only a top-level caller today. No signature change of createSale/voidSale. No schema change.

## Oracle — new suite `scripts/qc-hf-tx.mts` (house style, own temp tenant `posqc-hftx-<rand>`, finally wipe, QC4 via iso+qc4+gate lock)
- HT1 intent path (stocked product, PROMPTPAY intent PAID manual → submitRegisterSale): PosSale, PosSaleLine, PosPayment, PosPaymentIntent **same xmin**; exactly 1 OUT movement after return; onHand −qty; `pos.sale.paid` 1 row; spy on global `prisma.posSale.findFirst` (status-only select) sees **no read before commit** (no `found:false`).
- HT2 giftcard sell + reload: PosSale xmin = GiftCard/GiftCardTxn xmin; `pos.sale.paid` 1 row and drained (DONE) by `drainAll` triggered post-commit; `giftCardId` set.
- HT3 caller rollback: createSale(…, callerTx(tx)) then throw ⇒ 0 sale rows, 0 OUT.
- HT4 positive control: plain register CASH path single xmin + 1 OUT (unchanged).
- HT5 negative control: raw `tx` (no wrapper) ⇒ checker sees xmin split and a pre-commit `found:false` read (proves HT1/HT2 can go red).
- HT6 static: every `createSale(` in src whose 2nd arg is not `prisma`/a PrismaClient passes `callerTx(`; no other Proxy hiding `$transaction` in src (`regCallerTx`/`flatTx` gone); `core/caller-tx.ts` pure. P1.6 U4 registry unchanged (18/15).
- RED on 1636da3c (save `ledger/wo-notes/HF-TX-red.txt`), GREEN after; run green ×2.

## Gates
typecheck · fitness · qc-hf-tx · qc-pos-p1.6 (U4, F15.2) · qc-pos-p1.7 · qc-pos-p1.3 · qc-pos-p2.3 · qc-pos-p1.12 · qc-member-m2.6 / m2.7 / m2.8 (giftcard) · qc-pos-account · then P2.4 / P2.8 suites after their rebase. No push to main, QC4 only.

## §9 Controller rulings (account A, 10 Oct 04:5xZ)
1. **Sequence: HF-TX builds AFTER P2.4 S + P2.8 S merge** (investigation = PARTIAL: mechanism confirmed, no stock/accounting loss on today's call sites — register repeats cut+drain post-commit; giftcard has no stock lines). One lane then switches all five sites (register:2263 · giftcard sell/reload · P2.4 `regCallerTx` · P2.8 `flatTx`) and deletes the local proxies; the P2.4/P2.8 lanes do **not** rebase for this.
2. Item 4 default accepted: giftcard sell/reload get the ≤3-attempt P2002 retry around their `$transaction` (idempotency key makes it safe).
3. Suite `qc-hf-tx` HT1–HT6 as drafted; red-before saved; add HT7 static = the listed out-of-scope `"$transaction" in` helpers are documented in `POS-OWNER-PENDING.md` (no change) so the list cannot rot silently.
4. `afterSaleCommitted` is additive on the facade; `createSale` signature/contract JSON unchanged (sha pinned by p2.3/p2.4/p2.6/p2.8 stays).
5. Owner lines: giftcard owner (helper switch + retry) · P1.7 comment "createSale does not open a nested tx" corrected in the HF.
