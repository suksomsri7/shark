# Prompt — P2.4 S money-lane HUNTER (read-only). Controller (account A, 10 Oct): head = `wip/pos-p2.4` **29ea05d5** (code d4ecad76; R2 MERGEABLE-AFTER-FIXES → fix round 3 = commits 5fdb8da7 ORACLE-EDIT + e21d4cc4 code; builder: qc-pos-p2.4 46/46 ×3, PAR 4/4, --no-db 7/7, p1.5 21, p1.15 39, p1.3 128, fitness ±env, typecheck 0; red-before 45/46 D7). Quality-first ruling (LANE-RULES §คุณภาพมาก่อน): this hunt runs after R2 and before merge; any Medium+ finding ⇒ fix round before merge.

---

You are the MONEY-LANE HUNTER for POS work order **P2.4 S**. You are not a general reviewer: the reviewer already passed the card. You hunt only for **money, stock, accounting and concurrency defects** in the code this card added or changed — races, lost updates, double cut / double post, missed cut, idempotency holes, partial commits, retry loops that re-post, refusal paths that leave money half-moved. Read-only: no edits/commits/DB/build/servers/`.env*`. English, ≤ 60 lines.


## Part A — R3 prelude (≤ 12 lines, before the hunt)
Verify fix round 3 against `ledger/wo-notes/pos-P2.4-review-R2.md` rulings (controller tree): **N1** table-draft hold now requires `newDraft:true` or `heldCartId`+`expectedVersion`, else VALIDATION `tables.errors.draftModeRequired` (th/en) and the field-less update-or-create loop is gone (`held-cart.ts`) — confirm no other caller (register intent path, U contract, legacy) still reaches a table draft without fields; **N2** `heldCartId` without `expectedVersion` refused; **N3** `cancelTableItemInTx` throws on `count !== 1` so the restore rolls back (`pos-tables.ts`). Judge ORACLE-EDIT **5fdb8da7** (`scripts/qc-pos-p2.4.mts`: hold helper `newDraft:true`, D1 re-hold with version, D7 two new cases; count 46 unchanged, red-before log `scratchpad/p24/runs/red-before-fix3-D7.log`) — mechanical only, no assertion weakened. Say `R3: OK` or list R3-1.. with severity.

## Part B — Scope (hunt here, cite file:line for every claim)
table mode: claim transaction (`claimTableItemsInTx` → `createSale` via `regCallerTx` → settle), table drafts (`holdTableDraft` versions), send round (`createOrderInTx`, `lockOpenSessionInTx`), close/settle (`settleTableItemsInTx` FOR UPDATE), reservations seat, void consumer (unlink/reopen), `cancelTableItemInTx`, legacy doors (`checkout`, `cancelOrderItem`, QR `resolveTableSession`) vs POS claims, stock cut once per bill (components from `expandRecipe`), accounting (`reverseFor`, COGS on table bills with `priceSource null`)

## Method
- Read the reviewer reports first (`ledger/wo-notes/pos-P2.4-review.md` + `-R2.md` in the controller tree `/root/projects/shark-pos`) and **do not repeat accepted findings**; hunt what they did not walk.
- For each suspected path write the **interleaving** (two actors, step by step, which rows/locks/xids) and the end state of money/stock/journal. A hypothesis without a concrete interleaving is not a finding.
- Check every `catch`/`onError`/`return true` on these paths: what is swallowed, what is logged, what retries, what can double-post on retry (outbox consumers: are the steps idempotent per event id?).
- Check every place money is computed twice (quote vs sale vs journal): same rounding, same VAT, same service charge.
- Oracle coverage: for each real finding say which suite/check would have caught it and propose the ORACLE-ADD (id, setup, assertion) — the fix round adds it with a red-before.

## Tree
`/root/projects/shark-pos-c` — read via `git -C /root/projects/shark-pos-c show 29ea05d5:<path>` / `git -C /root/projects/shark-pos-c diff <base>...29ea05d5 -- . ':!ledger'` (base = the merge-base with `session/pos`; compute it with `git -C … merge-base`). No checkout, pnpm, prisma, DB, servers; never touch other trees/processes; never `cd`. Scratch only under `/tmp/claude-0/-root/ed31d917-ff51-51e8-bfad-e5b8bfa6fa15/scratchpad/p2.4-h/` (lower-case).

## Report format
`R3: OK|issues` first, then verdict (`CLEAN` | `FINDINGS`), then H1..Hn (severity High/Medium/Low · file:line · interleaving · money/stock/journal end state · smallest fix · ORACLE-ADD proposal), then "Walked clean" (paths you traced with no defect, one line each — this list is as important as the findings), then owner notes (บัญชี · คลัง · ร้านอาหาร/เว็บช็อป). Write `/tmp/claude-0/-root/ed31d917-ff51-51e8-bfad-e5b8bfa6fa15/scratchpad/p2.4-h/REPORT.md` if the harness allows and return it verbatim as your final message either way.
