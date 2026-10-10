# Prompt — P2.8 S money-lane HUNTER (read-only). Controller (account A, 10 Oct): head = `wip/pos-p2.8` **__HEAD__** (R2 MERGEABLE). Quality-first ruling (LANE-RULES §คุณภาพมาก่อน): this hunt runs after R2 and before merge; any Medium+ finding ⇒ fix round before merge.

---

You are the MONEY-LANE HUNTER for POS work order **P2.8 S**. You are not a general reviewer: the reviewer already passed the card. You hunt only for **money, stock, accounting and concurrency defects** in the code this card added or changed — races, lost updates, double cut / double post, missed cut, idempotency holes, partial commits, retry loops that re-post, refusal paths that leave money half-moved. Read-only: no edits/commits/DB/build/servers/`.env*`. English, ≤ 60 lines.

## Scope (hunt here, cite file:line for every claim)
orders: ingest replay/idempotency (ref · key · code locks), accept race (`UPDATE … WHERE status=NEW AND version`), PLATFORM sale on accept via `flatTx` + `afterSaleCommit` (stock cut once, drain once), MANUAL default-ACCEPTED path, `payOrder` (frozen total, `SHIFT_REQUIRED`, duplicated key after lost race), transitions + outbox one row per (order,type), `cancelOrder` → `voidSaleByActor` (PENDING_APPROVAL, HAS_REFUNDS mapping), WEB mirror in the ShopOrder tx, `onShopOrderPaid` / `onSaleVoided` ordering (void before paid), PAID-WEB reject refusal, storefront dual-read price rule (WEB row / explicit WEB rule only), `backfillWebPrices` idempotency + conflicts, `posOrderRejected` consumer → `shop.cancelOrder` idempotency, channel pause (`shop.createOrder` throws inside tx), journal numbering race observed in S2/V3 (owner line) — does any P2.8 path post a JV outside the outbox retry?

## Method
- Read the reviewer reports first (`ledger/wo-notes/pos-P2.8-review.md` + `-R2.md` in the controller tree `/root/projects/shark-pos`) and **do not repeat accepted findings**; hunt what they did not walk.
- For each suspected path write the **interleaving** (two actors, step by step, which rows/locks/xids) and the end state of money/stock/journal. A hypothesis without a concrete interleaving is not a finding.
- Check every `catch`/`onError`/`return true` on these paths: what is swallowed, what is logged, what retries, what can double-post on retry (outbox consumers: are the steps idempotent per event id?).
- Check every place money is computed twice (quote vs sale vs journal): same rounding, same VAT, same service charge.
- Oracle coverage: for each real finding say which suite/check would have caught it and propose the ORACLE-ADD (id, setup, assertion) — the fix round adds it with a red-before.

## Tree
`/root/projects/shark-pos-b` — read via `git -C /root/projects/shark-pos-b show __HEAD__:<path>` / `git -C /root/projects/shark-pos-b diff <base>...__HEAD__ -- . ':!ledger'` (base = the merge-base with `session/pos`; compute it with `git -C … merge-base`). No checkout, pnpm, prisma, DB, servers; never touch other trees/processes; never `cd`. Scratch only under `/tmp/claude-0/-root/ed31d917-ff51-51e8-bfad-e5b8bfa6fa15/scratchpad/p2.8-h/` (lower-case).

## Report format
Verdict first (`CLEAN` | `FINDINGS`), then H1..Hn (severity High/Medium/Low · file:line · interleaving · money/stock/journal end state · smallest fix · ORACLE-ADD proposal), then "Walked clean" (paths you traced with no defect, one line each — this list is as important as the findings), then owner notes (บัญชี · คลัง · ร้านอาหาร/เว็บช็อป). Write `/tmp/claude-0/-root/ed31d917-ff51-51e8-bfad-e5b8bfa6fa15/scratchpad/p2.8-h/REPORT.md` if the harness allows and return it verbatim as your final message either way.
