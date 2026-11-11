# POS HF-GC — gift card: reload `balanceAfter` from the locked update (H1) + crash-safe liability post on sell (H2)

Origin: HF-TX money-lane hunt (`pos-HF-TX-review.md` §hunt, 10 Oct) H1/H2 Low pre-existing; controller ruling there = follow-up card HF-GC after HF-PP. Base = `session/pos` **3e39c68c** (code adbb1640 = HF-PP2). Tree **shark-pos-b** (own node_modules; `pnpm exec prisma generate` once if the client predates the base; never `pnpm install`). Small S card, not counted.

## Facts (verified by the controller on the base — cite the live lines)
- `src/lib/modules/giftcard/service.ts reload` ≈667–750: `card = loadByNumber()` **before** the `$transaction`; inside the tx `after = card.balanceSatang + satang` (:725) then `giftCard.update({ balanceSatang: { increment } })` (:726–729) and `giftCardTxn.create({ balanceAfter: after })` (:736) ⇒ two parallel reloads (or reload ∥ `use`) write stale/duplicate `balanceAfter` on the ledger trail and return it; the column itself is right (increment).
- `sell` ≈430–515: the sale tx commits (card + SELL txn + `giftcard.sold` outbox row, payload without an accounting flag), then `pos.afterSaleCommitted`, then **outside the tx** `account.postGiftCardSale({refType:"GiftCard", refId: card.id, …})` (:498) and `giftCard.update({accountingDocId})` (:509). A crash between commit and :509 leaves a live card with no 2110 liability entry; `sellReplay` (replay of the same key) returns the stored result and never posts; `use`/expire post revenue only when `accountingDocId` is set (comment :9) ⇒ the card is invisible to accounting forever.
- `use` ≈560–630 computes its own `after` — check whether it runs under a row lock (`FOR UPDATE`/conditional decrement) and cite; fix only if it has the same pre-tx read.

## Scope (IN)
1. **H1** reload: take `balanceAfter` from the update result — `const upd = await tx.giftCard.update({ …, data: { balanceSatang: { increment: satang }, status: "ACTIVE" }, select: { balanceSatang: true } })`; `after = upd.balanceSatang`. Same for any other path that computes `after` from a pre-tx read (cite each). Mark `// POS HF-GC ▸ … ◂`.
2. **H2** sell: one idempotent helper `ensureGiftCardSalePosted(tenantId, giftCardId)` in `giftcard/service.ts`: loads the card; returns early if `accountingDocId` set or the card was sold without the switch (see 3); otherwise posts via `account.postGiftCardSale` and stores `accountingDocId`. **Idempotency**: verify whether `account.postGiftCardSale` dedupes by `(refType, refId)` — cite `account/gl.ts`; if it does not, look up an existing entry by ref first (read-only query on the account module's own reader; if none exists, CONTROLLER-DECISION line, do not add a writer in `account/**`). Call the helper (a) on the normal sell path in place of the inline post, (b) on `sellReplay` hits, and (c) from the `giftcard.sold` outbox consumer as a backstop step (marked hunk in `src/lib/outbox-consumers.ts`, registered as an additional idempotent step on the existing `giftcard.sold` consumer — never a new first step; memory: a failing first step blocks the rest).
3. Sold-with-switch-off cards must never post later: add `accountingLink: boolean` to the `giftcard.sold` payload (additive) **and** persist the decision on the card if a column already exists for it (look for one; if none, the payload flag + the replay path's `settings.accountingLink` at replay time is the rule — state which in the notes; no schema change in this card).
4. **Oracle** `scripts/qc-hf-tx.mts` +2 (18 → 20):
   - **HT2.6** reload trail: one card, 5 parallel `reload` with distinct keys (same satang) ⇒ 5 RELOAD txns, `balanceAfter` values are distinct and equal `initial + k·satang` for k=1..5 after sorting, max = card `balanceSatang`; returned `balanceAfter` of each call matches its txn row. Red-before = duplicates (all `initial + satang`).
   - **HT2.7** liability backstop: sell with `accountingLink` on ⇒ `accountingDocId` set and exactly 1 GL entry by ref `GiftCard#<id>`; then the suite nulls `accountingDocId` on its own temp card (simulating the crash window) and (a) replays `sell` with the same key ⇒ `accountingDocId` restored, GL entries by ref still 1; (b) re-runs the `giftcard.sold` consumer for that row ⇒ still 1 entry; (c) a card sold with the switch **off** then switch turned on + consumer replay ⇒ still 0 entries, `accountingDocId` null. Red-before = (a) returns null / 0 entries.
   - Red-before on the base saved as `ledger/wo-notes/HF-GC-red.txt`; green ×2 (forced + unforced) after.
5. Owner lines (`POS-OWNER-PENDING.md`, giftcard owner): helper + consumer backstop; `use`/expire still post only for cards with `accountingDocId`.

## OUT
No schema/migration; no change to `createSale`/contract sha/`callerTx` sites (HT6 stays green); no change to `account/**` writers; no UI.

## Gates
typecheck · fitness ±env · fitness-pos · `qc-hf-tx` 20/20 ×2 (forced + unforced) · `qc-pos-p1.6` 48 · `qc-pos-account` 16 · `qc-pos-p1.3` 128 · `qc-pos-p1.1` 180 · `qc-pos-p2.8` (60/61 ST6 wip-only) · `qc-member-m2.6/m2.7/m2.8` = known QC4 setup failures (member-expected.json ≠ seed, not POS) — run once, paste the setup error line, do not reseed · reviewer (read-only, ≤ 30 lines).

## §9 Controller rulings (account B, 14 Oct 12:4xZ)
1. Keep the inline post on the normal path (fast, same response shape) **plus** the consumer backstop; the helper is the single writer of `accountingDocId`.
2. Idempotency of the GL post is proven by the oracle (HT2.7 count = 1), not assumed.
3. Marked hunks only; `outbox-consumers.ts` hunk ≤ 15 lines.
