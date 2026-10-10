# Prompt — P2.8 S money-lane HUNTER (read-only). Controller (account A, 10 Oct): head = `wip/pos-p2.8` **1db73b0c** (code 1b84db06; R1 MERGEABLE-AFTER-FIXES → fix round 2 = e827c9a4 W9 · 8439325a W10 · 3994b3c7 code F1–F5 · merge 1b84db06; builder: qc-pos-p2.8 57/57 ×3, PAR 4/4, residue 0; p2.1 55 · p2.2 42 · p2.3 46 · p1.3 128 · p1.6 48 · p1.12 72 · p1.16 28 · p1.18 81 · shop 15 · shop-refund 12 · pos-account 16 · account-cpa 107 · fitness ±env · fitness-pos · typecheck 0). Quality-first ruling (LANE-RULES §คุณภาพมาก่อน): this hunt runs after R2 and before merge; any Medium+ finding ⇒ fix round before merge.

---

You are the MONEY-LANE HUNTER for POS work order **P2.8 S**. You are not a general reviewer: the reviewer already passed the card. You hunt only for **money, stock, accounting and concurrency defects** in the code this card added or changed — races, lost updates, double cut / double post, missed cut, idempotency holes, partial commits, retry loops that re-post, refusal paths that leave money half-moved. Read-only: no edits/commits/DB/build/servers/`.env*`. English, ≤ 60 lines.


## Part A — R2 verification (≤ 18 lines, before the hunt)
Verify fix round 2 against the controller rulings at the end of `ledger/wo-notes/pos-P2.8-review.md` (controller tree `/root/projects/shark-pos`) and the builder's "fix round 2" section (`git -C /root/projects/shark-pos-b show 1db73b0c:ledger/wo-notes/pos-P2.8.md`). Diff `488fa30a...1b84db06 -- . ':!ledger'` (6 files). Cite file:line:
- **F1** PAID WEB order ⇒ `rejectOrder` and `cancelOrder` refuse `ORDER_STATE_INVALID` (`orders.errors.webPaid` th/en) before any state change or outbox row; unpaid WEB reject still cancels the ShopOrder.
- **F2** storefront price and `createOrder` snapshot use the resolver result only when a `(WEB, *)` row exists or the winning rule lists `WEB` explicitly; BRANCH rows and all-channel rules (`channelCodes: []`) never reach the storefront; otherwise `ShopProduct.priceSatang`. Same helper for both reads (no drift)? `catalog.ts` hunk inside markers?
- **F3** web door: variant whose parent is archived ⇒ `PRODUCT_UNAVAILABLE`.
- **F4** void refusal mapping (`HAS_REFUNDS` → `ORDER_STATE_INVALID` + `orders.errors.hasRefunds`; `REASON_REQUIRED` → `VALIDATION`; unknown → `INTERNAL`) — no raw void code reaches the client; the mapping does not swallow `PENDING_APPROVAL`.
- **F5** `listOrders` newest-first take 2000 then reverse; `since` clamped to 7 days and the effective value returned.
- **ORACLE-ADDs** W9 (e827c9a4) and W10 (8439325a): assertions match rulings F1/F2 (W10: BRANCH row + all-channel −10% rule, no WEB row ⇒ 20000 on storefront + snapshot; explicit WEB −20% ⇒ 16000); red-before logs under `/tmp/claude-0/-root/ed31d917-ff51-51e8-bfad-e5b8bfa6fa15/scratchpad/p28/runs/` really red on the pre-fix code; count 55 → 57; nothing weakened.
- Owner lines + P2.8U contract additions present; `register.ts`/`service.ts`/`channel.ts`/chat untouched; contract sha unchanged.
Say `R2: OK` or list R2-1.. with severity.

## Part B — Scope (hunt here, cite file:line for every claim)
orders: ingest replay/idempotency (ref · key · code locks), accept race (`UPDATE … WHERE status=NEW AND version`), PLATFORM sale on accept via `flatTx` + `afterSaleCommit` (stock cut once, drain once), MANUAL default-ACCEPTED path, `payOrder` (frozen total, `SHIFT_REQUIRED`, duplicated key after lost race), transitions + outbox one row per (order,type), `cancelOrder` → `voidSaleByActor` (PENDING_APPROVAL, HAS_REFUNDS mapping), WEB mirror in the ShopOrder tx, `onShopOrderPaid` / `onSaleVoided` ordering (void before paid), PAID-WEB reject refusal, storefront dual-read price rule (WEB row / explicit WEB rule only), `backfillWebPrices` idempotency + conflicts, `posOrderRejected` consumer → `shop.cancelOrder` idempotency, channel pause (`shop.createOrder` throws inside tx), journal numbering race observed in S2/V3 (owner line) — does any P2.8 path post a JV outside the outbox retry?

## Method
- Read the reviewer reports first (`ledger/wo-notes/pos-P2.8-review.md` + `-R2.md` in the controller tree `/root/projects/shark-pos`) and **do not repeat accepted findings**; hunt what they did not walk.
- For each suspected path write the **interleaving** (two actors, step by step, which rows/locks/xids) and the end state of money/stock/journal. A hypothesis without a concrete interleaving is not a finding.
- Check every `catch`/`onError`/`return true` on these paths: what is swallowed, what is logged, what retries, what can double-post on retry (outbox consumers: are the steps idempotent per event id?).
- Check every place money is computed twice (quote vs sale vs journal): same rounding, same VAT, same service charge.
- Oracle coverage: for each real finding say which suite/check would have caught it and propose the ORACLE-ADD (id, setup, assertion) — the fix round adds it with a red-before.

## Tree
`/root/projects/shark-pos-b` — read via `git -C /root/projects/shark-pos-b show 1db73b0c:<path>` / `git -C /root/projects/shark-pos-b diff <base>...1db73b0c -- . ':!ledger'` (base = the merge-base with `session/pos`; compute it with `git -C … merge-base`). No checkout, pnpm, prisma, DB, servers; never touch other trees/processes; never `cd`. Scratch only under `/tmp/claude-0/-root/ed31d917-ff51-51e8-bfad-e5b8bfa6fa15/scratchpad/p2.8-h/` (lower-case).

## Report format
`R2: OK|issues` first, then verdict (`CLEAN` | `FINDINGS`), then H1..Hn (severity High/Medium/Low · file:line · interleaving · money/stock/journal end state · smallest fix · ORACLE-ADD proposal), then "Walked clean" (paths you traced with no defect, one line each — this list is as important as the findings), then owner notes (บัญชี · คลัง · ร้านอาหาร/เว็บช็อป). Write `/tmp/claude-0/-root/ed31d917-ff51-51e8-bfad-e5b8bfa6fa15/scratchpad/p2.8-h/REPORT.md` if the harness allows and return it verbatim as your final message either way.
