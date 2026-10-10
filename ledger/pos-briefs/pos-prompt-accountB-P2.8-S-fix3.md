# Prompt — P2.8 S fix round 3 (hunter H1–H5). Controller (account A, 10 Oct 06:1xZ): branch `wip/pos-p2.8`, head 1db73b0c (code 1b84db06). Hunt report + binding rulings = `ledger/wo-notes/pos-P2.8-hunt.md` (controller tree `/root/projects/shark-pos`).

---

You are the same P2.8 S builder, tree `/root/projects/shark-pos-b`. Implement exactly the rulings H1–H5 + the W9 nit + owner lines. Nothing else; `register.ts`, `pos/service.ts`, `channel.ts`, chat and `pos-sale-contract.json` stay untouched.

## Fixes (cite file:line in the notes)
1. **H1** `confirmOrderPaid` (`shop/service.ts`, hunks inside `// POS P2.8 ▸ … ◂`): call `orders.webClaimInTx(tx, shopOrderId)` inside the claim tx — PosOrder `FOR UPDATE`; REJECTED/CANCELLED ⇒ the claim is refused (`ok:false`, shop-side code you choose; name it) and nothing is posted; otherwise `paymentState PAID` + version bump. In the posSaleId tx call `orders.webSaleBoundInTx(tx, shopOrderId, saleId)`. `onShopOrderPaid` = confirmer only: never writes PAID onto a REJECTED/CANCELLED order or onto a VOIDED sale (log a line instead). New facade exports in `pos/order.ts` + `pos/index.ts`.
2. **H2** `outbox-consumers.ts`: `"pos.order.cancelled": withAutomation(posOrderRejected)`.
3. **H3** `handOver`: bound sale VOIDED ⇒ `ORDER_STATE_INVALID` (`orders.errors.saleVoided` th/en). Follow-up line for the swallowed `onSaleVoided` retry (P2.11) + owner line.
4. **H4** `sourceCancelledInTx`: on OrderRaced re-read and retry inside the tx (pattern of `onShopOrderPaid`).
5. **H5** web door passes `priceSource` / `priceRuleId` / `listPriceSatang` from `webPricesForShop` into the mirror lines.
6. **ORACLE-ADD / EDIT** `scripts/qc-pos-p2.8.mts` — own commit each, red-before log on the pre-fix code (`scratchpad/p28/runs/p28-<id>-redbefore.log`), no existing assertion weakened: **W11** (a) createOrder → reject → confirmOrderPaid ⇒ ok:false, no `ecom-<id>` sale, after drain ShopOrder CANCELLED; (b) createOrder → confirmOrderPaid ⇒ PosOrder PAID **before any drain**, then reject ⇒ ORDER_STATE_INVALID webPaid; (c) mark the `shop.order.paid` row DONE without running ⇒ PosOrder still PAID. **W12** createOrder → accept → cancelOrder → drain ⇒ ShopOrder CANCELLED; confirmOrderPaid ⇒ ok:false, no ECOM sale, stock unchanged. **W13** (if cheap) withhold the `onSaleVoided` extra ⇒ handOver refused. **W4** + interleaved accept (H4). **W10** + sale line RULE with `priceRuleId` (H5). **W9** + cancel of a PAID WEB order ⇒ webPaid. Count 57 → 59 (60 with W13).
7. Owner lines (`POS-OWNER-PENDING.md`, P2.8 section): บัญชี · เว็บช็อป · ร้านอาหาร as ruled. Notes `ledger/wo-notes/pos-P2.8.md`: "fix round 3" section (per-H change with file:line, red-before paths, gates, P2.8U contract additions if any — e.g. `saleVoided` message).

## Gates (fix head; logs `scratchpad/p28/runs/fix3-*.log` with tree/head headers; same command forms; never `export CI`)
`qc-pos-p2.8` forced ×2 + unforced (59|60, PAR, residue 0) · `--no-db` · `qc-pos-p2.1` · `qc-pos-p2.2` · `qc-pos-p1.3` · `qc-pos-p1.6` · `qc-pos-p1.8` · `qc-pos-p1.12` · `qc-pos-p1.16` · `qc-shop` · `qc-shop-refund` · `qc-pos-account` · `qc-account-cpa` · fitness ±env · fitness-pos · typecheck. Merge `origin/session/pos` first if it moved.

## Done =
Commits (explicit paths) + push `wip/pos-p2.8`; report ≤15 lines: head SHA (ledger + code), per-H change with file:line, red-before paths, gate counts. Rules as before (no `.env*`, servers, build, deploy, Telegram, `pkill -f`, other trees). Commit trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
