# HF-TX investigator — REPORT (base session/pos 1636da3c · tree p11 detached · QC4 ep-frosty-lab · 10 Oct)

**Overall: mechanism CONFIRMED · production damage on today's call sites NOT confirmed ⇒ PARTIAL.** Brief drafted (untracked).

## 1. Code facts
- Ownership test: `src/lib/modules/pos/service.ts:462` `ownsTx = "$transaction" in client && typeof client.$transaction === "function"`; `withTx` :39–45 calls `client.$transaction(…)` on the same test. Post-"commit" block :804–810 (`consumeSaleInventory` if stock lines + `scheduleDrain()`) runs only when ownsTx. `consumeSaleInventory` :871–873 reads the sale through global `prisma`; if not found it does `return true` with no log.
- Prisma 7.8.0 runtime keeps `$transaction` on the itx client and nests via SAVEPOINT (depth/savepoints stack in `@prisma/client/runtime/client.js`). Prisma ^7 since repo inception 758bb3e4 (2026-07-11); ownsTx/post-commit cut since 9a6407ee / 87c3d972 (16–18 Jul) ⇒ latent since day one.
- createSale call sites that pass a tx (src): `pos/register.ts:2199` (regCreateSale) used with the caller tx at :2263 (regSubmitWithIntents, P1.7) — the regCreate path :2440 passes `prisma` (owns legitimately); `giftcard/service.ts:403` (sell) and `:674` (reload). All other 16 src call sites pass no client. Branches only: wip/pos-p2.4 `regCallerTx` (register.ts:2469) and wip/pos-p2.8 `flatTx` (order.ts:437) — the HF-TX workarounds.
- `qc-pos-p1.7.mts`: **no check asserts the stock cut, `pos.sale.paid` outbox or xid on the intent path.** S1/S4/S5 (:80/83/84, chk at :1124/1187/1198) assert only bill PAID, intent CONSUMED + saleId, PosPayment reference/note, and that exactly one bill was created; sales use custom lines with no stock. W1/W2/M1 assert only `pos.payment.intent_paid` outbox rows.

## 2. Probe (`scratchpad/hf-tx/probe.mts` → `probe.out`, exit 0; own tenant posqc-hftx-<rand>; cleanup: 0 rows left, tenant 0, user 0)
- (a) inside `prisma.$transaction`: `typeof tx.$transaction` = **function**, `"$transaction" in tx` = true; nested call runs on the **same pid 3492 / xid 5383942** ⇒ a savepoint, not a second connection.
- (c) positive control, plain register CASH: 1 OUT (−1), onHand 100→99, `pos.sale.paid` 1 row, Sale/Line/Payment xmin all 5383962; the spy saw one post-commit read with found:true.
- (b) P1.7 intent path (PROMPTPAY_STATIC → manual PAID → submit): bill OK, intent CONSUMED; 1 OUT (−1), onHand 99→98; outbox 1 row, DONE. **Spy: the first read is `found:false`**, i.e. createSale's own cut ran before commit and was skipped silently. Register's own post-commit `consumeSaleInventory`/`scheduleDrain` (:2271–2272) then did the real work (found:true). **xid split:** PosSale/PosSaleLine xmin 5383969 vs PosPaymentIntent/PosPayment 5383968.
- (d1) createSale(input, raw tx), giftcard shape, with a stocked line and no caller follow-up: the read inside the tx was found:false. Result: 0 OUT, onHand unchanged, outbox PENDING. Sale xmin 5383976 vs caller xid 5383975.
- (d2) the same call with `$transaction` hidden (P2.4/P2.8 proxy): no pre-commit attempt, 0 OUT (cutting is the caller's job by contract), sale xmin = caller xid 5383977.
- (e) caller throws after createSale(…, tx) ⇒ 0 sale rows, 0 OUT. Atomicity holds.

## 3. Verdict per call site
- `register.ts:2263` (P1.7 intent → regCreateSale → createSale(…, tx)): **PARTIAL.** Nested savepoint, pre-commit silent skip and early drain are all CONFIRMED by the probe. Stock is still cut and the outbox still drained, because register repeats both after commit. Consequences: sale rows sit under a sub-xid; wasted reads and an early drainAll; the code comment ("createSale does not open a nested tx") is false.
- `giftcard/service.ts:403` / `:674`: **PARTIAL (code + d1 shape).** Same nesting and xid split. There are no stock lines, so nothing to lose. The only drain is the early `scheduleDrain` inside the caller tx: in a request this runs via `after()` once the response is sent, so it works; outside a request it drains before commit and the event waits for cron.
- `register.ts:2440` (regCreate, `prisma`): **REFUTED / not affected.** Positive control.
- P2.4 table submit / P2.8 orderCreateSale (branches): **CONFIRMED-relevant.** Their single-xid oracles would fail without the local proxies. Today's damage is none, because the proxies are in place.
- Latent: any future caller that passes a tx with stock lines and does no post-commit cut loses the cut silently (d1). The proxy (d2) does not cut either, so the contract needs an explicit post-commit helper.

## 4. Side findings
- Under the proxy, createSale's P2002 retry (:469) no longer applies inside caller txs. The register intent path already retries the whole tx; giftcard does not (handled in the brief).
- Other `"$transaction" in` helpers also nest silently but are atomic and have no post-commit gating: pos/device.ts:68, channel.ts:371, payment-intent.ts:100, catalog.ts:145/1600, stamp/service.ts:34, ticket/service.ts:21, point/internal.ts:31. ticket.cancelOrder ownsTx (:385) has only a top-level caller. Left out of scope.

## 5. Deliverable
- **Untracked, not committed:** `/root/projects/shark-pos-p11/ledger/pos-briefs/pos-brief-HF-TX.md`. It covers a core `callerTx(tx)` helper, a new export `afterSaleCommitted(input, saleId)` from pos/service, switching register:2263 and giftcard:403/674, replacing P2.4 `regCallerTx` / P2.8 `flatTx`, a new suite `qc-hf-tx` (HT1–HT6 with positive and negative controls, red on 1636da3c), and the gates.
- Tree p11 is detached at 1636da3c; it was on wip/pos-p2.2u 2f8f1e67 (clean) before. No tracked edits, no commits, no `.env*` read, no other tree or process touched. The probe ran via iso → qc4 → with-gate-lock (POS lock), queued behind the p2.4/p2.8 oracles.
