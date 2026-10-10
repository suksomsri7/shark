# POS HF-TX — builder notes (account B · 10 Oct 2026)

Branch `wip/pos-hf-tx` · base `session/pos` d85ea5c3 · tree `shark-pos-c` · brief `ledger/pos-briefs/pos-brief-HF-TX.md` (§9 rulings 1–5 binding) · investigation `ledger/wo-notes/pos-HF-TX-investigation.md`.

## Commits
| step | commit | what |
|---|---|---|
| 1 | 132b0d0c | `src/lib/core/caller-tx.ts` `callerTx<T extends object>(tx: T): T` (Proxy: `has` false / `get` undefined for `$transaction`, methods bound; pure, no imports; JSDoc = why + rule) · `pos/service.ts` `afterSaleCommitted(input, saleId)` = the old post-commit body (stock lines ⇒ `consumeSaleInventory`; then `scheduleDrain()`); createSale's owned branch now calls it · facade `pos/index.ts` exports it |
| 2 | fc057096 · d70af6ea | suite `scripts/qc-hf-tx.mts` (HT1–HT7, 17 checks) · red-before `ledger/wo-notes/HF-TX-red.txt` |
| 3 | 7e186c27 | register intent path + giftcard sell/reload switched · giftcard P2002 retry · P1.7 comment corrected |
| 4 | 874cde70 | P2.4 table submit + P2.8 `orderCreateSale` switched · both local proxies deleted |
| 5 | 3de80ed3 (+ this file) | owner lines (`POS-OWNER-PENDING.md`) · notes |
| 6 | a140c628 | merge `origin/session/pos` eaae6ecd (ledger only — no src/scripts change) · gates round 1 |
| 6b | 6319bc34 | merge `origin/session/pos` 97cdf1c8 = MAIN-MERGE 0d581286 (origin/main 71a1f363 · 1011 files incl. `core/outbox.ts`, new `core/after-drain.ts`, `crm.prisma` +5) — clean, none of the HF files touched; `prisma generate` re-run · gates round 2 (final) |

## Per-site diff (file:line at head)
- `src/lib/core/caller-tx.ts:15` — `callerTx` (new).
- `src/lib/modules/pos/service.ts:806` — `if (ownsTx) await afterSaleCommitted(input, result.saleId);` · `:816` `export async function afterSaleCommitted(input: Pick<CreateSaleInput, "tenantId" | "unitId" | "lines">, saleId)` — param narrowed to `Pick<…>` (a full `CreateSaleInput` is still accepted) so P2.8's `afterSaleCommit(tenantId, unitId, saleId, lines)` can call it without rebuilding the input. Facade `pos/index.ts:24`.
- `src/lib/modules/pos/register.ts:2431` (P1.7 intent path, `regSubmitWithIntents`) — `regCreateSale(saleInput, callerTx(tx))`; `:2437` `await afterSaleCommitted(saleInput, saleId)` replaces the inline cut+drain. `:2377–2382` regCreateSale JSDoc: the P1.7 claim "createSale does not open a nested tx" corrected.
- `src/lib/modules/pos/register.ts:2516` (P2.4 table submit, `regSubmitTable`) — `regCreateSale(saleInput, callerTx(tx))`; `:2525` `afterSaleCommitted`; the local proxy + its JSDoc deleted; HF-TX marker = "switched". Unused imports `consumeSaleInventory` / `scheduleDrain` dropped from register.ts.
- `src/lib/modules/pos/order.ts:438` (P2.8 `orderCreateSale`, used at `:487` accept-in-tx and `:1116` payOrder) — `createSale(input, callerTx(tx))`; local proxy + JSDoc deleted; marker "switched". `:466–468` `afterSaleCommit` now = `afterSaleCommitted({ tenantId, unitId, lines }, saleId)` (adds the canonical `scheduleDrain()`; the callers' own later `scheduleDrain()` at :612/:904/:1136 vicinity stay — a second drain is harmless, leased).
- `src/lib/modules/giftcard/service.ts:434` (sell) / `:719` (reload) — `pos.createSale(saleInput, callerTx(tx))`; `:492` / `:750` `await pos.afterSaleCommitted(…)` after the `$transaction` resolves (keeps an immediate post-commit drain; before, the only drain was the early in-tx one).
- Grep `regCallerTx` / `flatTx` over `src` = empty.

## P2002 retry (ruling 2 / brief item 4)
- Under `callerTx`, createSale no longer retries P2002 itself (`ownsTx` false — service.ts `createSale` retry loop needs `ownsTx`); a P2002 (receipt-counter row of a new month upserted by two bills) aborts the caller tx.
- Register intent path: already retries the whole tx — `register.ts:2451` `if (code === "P2002") { …regLoadSale… continue; }` inside `for (attempt < 3)` (table path same at `:2542`). Verified, no change.
- Giftcard: `giftcard/service.ts:220` `SALE_TX_ATTEMPTS = 3` + `isUniqueViolation` (P2002). sell `:487` / reload `:745`: on P2002 below the cap, re-check the idempotency key (`sellReplay` / `reloadReplay`, extracted from the existing entry replay) — a racing request with the same key that committed ⇒ return its result; otherwise retry. sell draws a new card number + PIN per attempt (a card-number P2002 is retryable too). Reload keeps the pre-read card (same as before).

## Evidence (xmin, QC4)
- Red-before (src = d85ea5c3, suite forced): HT1 intent path PosSale/Line 5454374 vs PosPayment/PosPaymentIntent 5454373 + spy `intent:found:false,intent:found` (createSale's own cut ran pre-commit) · HT2 sell PosSaleLine/PosPayment 5454358 vs PosSale/GiftCard/GiftCardTxn 5454357 (PosSale shows the outer xid only because the giftcard flag UPDATE rewrites it), reload 5454360 vs 5454359 · HT2.2 sell event PENDING after 20 s (early drain). HT4/HT5 controls green, HT6.4 registry green. 6/17.
- Green (head): HT1 all four tables 5456857, spy `intent:found` only · HT2 sell all five 5456843, reload all five 5456848, both events DONE · HT3.2 sale xmin 5456864 = caller xid 5456864, 0 reads inside the tx, OUT 0 → 1 after `afterSaleCommitted` · HT5 still sees 5456868 vs 5456867 + `found:false` (the checker can go red). 17/17.
- Note HT2.4 (reload drain) was green on the red run: the in-tx `drainAll` can land after commit (race noted in the investigation §3) — the deterministic red signals are the xmin checks.

## Contract
- `scripts/pos-sale-contract.json` unchanged (sha 7a418de1…). F15.2 green; its info line "createSale callers +1 order.ts" predates this HF (P2.8) and is not refreshed — ruling 4 pins the JSON.
- P1.6 U4 registry unchanged (19 sites / 16 files, = qc-pos-p1.6 CALL_SITES; HT6.4).

## Gates (final — round 2 at 6319bc34, QC4 via iso → qc4 → POS gate lock)
| gate | result |
|---|---|
| typecheck | 0 (at 6319bc34; first attempt timed out on the shared POS gate lock behind builds, re-queued) · DB gates ran twice at 6319bc34 with identical results |
| qc-hf-tx forced / unforced | 17/17 · 17/17 · residue 0 |
| qc-pos-p1.6 (U4 + F15.2) | 48/48 |
| qc-pos-p1.7 | 32/32 |
| qc-pos-p1.1 (lane rule 1d843e0c) | 180/180 (round 1 on eaae6ecd: 177/178 — S2.33 pre-existing, fixed by MAIN-MERGE rename) |
| qc-pos-p1.3 | 128/128 |
| qc-pos-p2.3 | 46/46 |
| qc-pos-p2.4 | 49/49 |
| qc-pos-p2.8 | 59/60 — ST6 (PAR) red by design: pins `register.ts`/`service.ts` sha to the P2.8 base or the merge-base with origin/session/pos; HF-TX changes both on purpose (rulings 1/3) ⇒ green once HF-TX is merged into session/pos. No behavioural check red |
| qc-pos-p1.12 | 72/72 |
| qc-pos-account | 16/16 |
| fitness no-env / env | 50/50 · 50/50 (round 1: 41/41 · 41/41) |
| fitness-pos | 8/8 (F15.2 green · contract JSON unchanged) |
| qc-member-m2.6 / m2.7 / m2.8 (R14, run last) | crash at fixture `actorOf` (null membership.role) = QC4 member seed missing; pre-existing (POS-RESUME :476, :1311 — MAIN-MERGE owner line). Giftcard sell/reload covered by qc-hf-tx HT2 on its own tenant |

## Follow-ups
- Out-of-scope `"$transaction" in` helpers listed in `POS-OWNER-PENDING.md` (HF-TX · HT7 line) — HT7 fails if one is added/removed without updating the list.
- `ticket/service.ts` cancelOrder `ownsTx` gate: only a top-level caller today; any future in-tx caller must pass `callerTx(tx)`.
- Reload computes `balanceAfter` from the card read before the tx (pre-existing; unchanged).
- qc-pos-p1.7 still has no stock/outbox/xid assertion on the intent path — qc-hf-tx HT1 covers it.

## Fix round 1 (review R1 = MERGEABLE · `ledger/wo-notes/pos-HF-TX-review.md` on session/pos) — code head 39926c02
| finding | change |
|---|---|
| F1 | `scripts/qc-hf-tx.mts` HT3.2 / HT5: caller xid = `pg_current_xact_id()::xid::text` (32-bit, same domain as `xmin`) instead of `txid_current()` (64-bit, epoch-extended) — epoch-safe |
| F2 | new **HT2.5**: two parallel `giftcard.sell` with one idempotency key ⇒ both resolve · GiftCard +1 · PosSale 1 · SELL GiftCardTxn 1 · same card/sale · pins set/null · PosSale.giftCardId = that card (loser: either the entry replay or the P2002 → `sellReplay` path). Suite 17 → 18 |
| F3 | `POS-OWNER-PENDING.md` giftcard owner line reworded: money/card rows covered by HT2 + HT2.5 on the HF tenant; m2.6–m2.8 never ran with this HF (crash at `actorOf`, QC4 member seed) — pending rerun after the seed is fixed |
| F4 | every gate log of this round starts with `tree=/root/projects/shark-pos-c head=<sha> dirty=<n>` (+ cmd, start/end, rc) — logs in the session scratch `hftx/gates-fix1/` (typecheck.out replaces the headerless `tc-final.out`) |
| F5 | `// POS HF-TX ▸ … ◂` markers added (comments only): `giftcard/service.ts` `sellReplay`, `reloadReplay`, the sell return; `order.ts` `afterSaleCommit`. `afterSaleCommitted` stays where it was (no runtime change) |
| hunt H1/H2 (money lane on 6319bc34, Low, pre-existing) | two ledger lines under the giftcard owner: reload `balanceAfter` from the pre-tx read · sell 2110 post not crash-safe — both "→ follow-up card HF-GC (controller)" |

Gates at 39926c02 (dirty 0; all logs headed): typecheck 0 · qc-hf-tx forced 18/18 · unforced 18/18 (residue 0; HT3.2 xmin 5483569 = caller 5483569 · HT5 5483573 vs 5483572) · qc-pos-p1.6 48/48 · qc-pos-p2.8 59/60 (ST6 only — same PAR reason as above, expected until the merged tip is on session/pos) · fitness no-env 50/50 · env 50/50.
