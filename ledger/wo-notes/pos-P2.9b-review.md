# P2.9b S — delivery (account B, 15 Oct 04:1xZ) — head 92bb601c / code 759cbfc0 (branch wip/pos-p2.9b from oracle 6749b1b8 + upstream 3ec8c707)
Builder: migration `20261211100000_pos_p29b_deposits` applied on QC4 · hunks: `service.ts` (deposit prepare/lock after `lockTenderCards`/conditional use, APPLY VAT split, `billVat`, `voidSale` guard, close-day `deposits`), `register.ts` (`{DEPOSIT, depositId}` parse → receipt bill, payload bag, read-only `export { regCreateSale }`), `register-shared.ts`, `order.ts` (payOrder refuses DEPOSIT), new `deposit.ts` + `deposit-links.ts`, `account-bridge.ts`, `refund-consumer.ts`, pure `refundTenderCaps` in `refund-shared.ts`, receipt/render/bills readers, `payment-settings.ts`, `tender.ts`; account additive `index.ts`/`gl.ts`/`service.ts`; one try-block `outbox-consumers.ts:757` · contract sha 72afb258 unchanged · caller registry 19/16 · ORACLE-EDIT `qc-pos-p2.9` ST1 (50d523c7); R2 stayed green. Gates (head 759cbfc0): typecheck 0 · fitness 50/50 ±env · fitness-pos 8/8 · **p2.9b 40/41** (P1 = oracle defect) · p2.9 62 · hf-tx 22 · p1.6 48 · p1.8 49 · p1.12 72 · p1.3 128 · p1.1 180 · account 16 · cpa 107 · p2.5 49 · p2.4 50 · p2.6 67 · p2.8 60/61 (ST6 wip) · booking-deposit 18 · hotel-public 15 · rental-public 16 · authz 81.
**CD-P29b-1 → APPROVED (ORACLE-EDIT)**: P1 sent a cash row without `cashReceivedSatang` (register refuses PAYMENT_MISMATCH — pinned by p1.6); builder applies `P2.9b-CD-oracle-P1-cash.patch` as `test(qc-pos-p2.9b)` with the dated marker → 41/41. Deviations accepted: scope entries at the head of MODULE_SCOPES (oracle ST2 comment-stripping quirk → oracle-maintenance follow-up) · refund approval queue not wired (manager PIN path only) → owner line · receipt documents created whenever the POS is linked → accepted · fully refunded receipt bill = REFUNDED → accepted · `phoneLast4` column (ruling 19).
→ R1 (reviewer aa61b06d, 11 items) + money hunter (a2b1c213, a–g) sent in parallel 04:1xZ.

## R1 (account B, 15 Oct 04:2xZ) — head 92bb601c / code 759cbfc0 — **MERGEABLE (code)** (reviewer aa61b06d; full `scratchpad/p29br/R1.md`; 30 non-ledger files in `3ec8c707^2..3ec8c707`)
F1 Low (process): gate table recorded at 3ec8c707 dirty=1 and p2.9b 40/41 — re-run after the CD-P29b-1 oracle commit, record at the new head dirty=0 (already ordered) · **F2 Low (money, tiny deposits)**: each apply's VAT share comes from the deposit's own VAT ratio (`service.ts` `lockSaleDeposits`) but the bill JV caps it at the bill's VAT (`account/index.ts:166–168`) ⇒ a ฿1.00 deposit (VAT 7) used 50 + 50 satang records VAT 4 + 3 while the JVs release 3 + 3 ⇒ Dr 2110 94 vs Cr 93 at receipt = 1 satang stuck in 2110 · F3 Info `checkDeposit` order NOT_FOUND → CLOSED → NOT_OWNER → EXCEEDS (a non-owner learns "closed"; harmless, as the oracle encodes) · F4 Info deviation 4 (refund approval queue not wired) needs a ruling · F5 Info P2.9bU contract: `registerTakeDeposit` accepts a CASH row without `cashReceivedSatang` (deposit.ts:181–185) while the register requires it — U must always send it. Verified OK: money (receipt JV no revenue; applied bill JV balanced, Σ VAT = full-bill VAT; `vatSatang` reduced only with linked rows, other path byte-identical; 3271 + 3729 exact; CN Dr 2110 + Dr 2200 / Cr cash; document net VAT; unlinked = no JV) · locks (stock → counter → cards → deposits FOR UPDATE by id; conditional UPDATE ⇒ EXCEEDS; unique apply keys; receipt via exported `regCreateSale` in the caller tx, after-commit after commit; registries 19/16; refund/void-restore cannot deadlock a sale) · refusals (one NOT_FOUND message; walk-in bill NOT_OWNER; legacy rows unchanged; orders/API refuse) · idempotency (both bags carry the ref; replay = same bill) · reversal (restore after the card restore, walk-in safe, drain twice no-op; refund consumer; `voidSale` refuses receipts) · caps (one `refundTenderCaps`, DEPOSIT cash-like, PAR) · readers (masked lookup, tile from the setting, apply allowed while off, title/lines, close-day block) · permissions · hygiene (marked hunks; account additive; untouched modules; contract unchanged; migration CHECK/uniques/lock_timeout; ORACLE-EDIT dated; th/en 3135/3135) · gates match (p2.8 60/61 ST6 wip).
**Controller rulings**: F2 → **fix** in the next round: cap each APPLY txn's `vatSatang` at `splitIncludedVat(x)` of that row's amount (and keep the remainder rule so Σ = deposit VAT only when the whole deposit is used; otherwise the unreleased satang stays with the deposit and is released by the final apply/refund — the builder states the invariant and the oracle pins it: ORACLE-ADD A7, ฿1.00 deposit used 50 + 50 ⇒ 2110 nets to 0 after both applies) · F4 → accepted + owner line (approval queue for deposit refunds = later card) · F5 → P2.9bU contract line · F3 → accepted. Fix round waits for the hunter (one batch).

## Money hunt (account B, 15 Oct 04:2xZ · hunter a2b1c213 · code read + arithmetic, no QC4 probe · full `scratchpad/p29bh/hunt.md`)
**D1 Medium** `refund.ts:589-594` caps refund VAT at the bill's stored (reduced) VAT ⇒ refunding a deposit-paid bill reverses 0 (full) / 70 instead of 140 (mixed) VAT; revenue −70, 2200 keeps VAT for returned goods · **D2 Medium** `account-bridge.ts:120, 195-198` always deducts the deposit VAT even when the deposit receipt was never posted (POS unlinked at receipt, linked at apply; or VAT registration dropped between) ⇒ 2110 −1,000 / −70 and output VAT short · D3 Low `shift.ts:385`, `reports.ts:458, 626` count deposit receipts as sales (X/Z + reports ฿3,210 vs close-day ฿2,140; cash/ledger right) · D4 Low merged member's deposit refused on the kept member's bill (`service.ts ≈:68`; no `mergedIntoId` follow) · D5 Low walk-in deposits = bearer by a guessable sequential receipt no; name-prefix lookup lists up to 20 deposits with balances. No finding: double spend (lock + conditional update; split/table parts reach the deposit code; part void restores), replays, other doors, VAT rounding remainder, re-use after void, remainder refund VAT, shared caps, receipt bill immutability + no points/CRM, close-day cash once, no second-connection wait, lock cycle only with refunds (PG detects, no money effect), idempotency keys.

## Controller rulings — fix round 1 (account B, 15 Oct 04:2xZ) — oracle first (dated ORACLE-ADD, red-before block 2 in `P2.9b-red.txt`)
1. **R1 F2** — cap each APPLY txn's `vatSatang` at `splitIncludedVat(x)`; state the invariant (Σ released VAT ≤ deposit VAT; unreleased satang stay on the deposit and go out with the final apply/refund) · ORACLE-ADD **A7** (฿1.00 deposit used 50 + 50 ⇒ 2110 nets to 0 after both applies; refund of the remainder of a partly used tiny deposit carries exactly the unreleased VAT).
2. **D1** — refund VAT basis for a bill with APPLY rows = stored bill VAT + Σ applied deposit VAT (the full-bill VAT); the CN reverses VAT pro-rata to the refunded share of that basis; partial refunds cannot over-reverse (cap at the basis − already reversed) · ORACLE-ADD **X9** (full refund of a ฿1,070 deposit-paid bill ⇒ CN VAT 70, revenue 0, 2200 0 · full refund of the ฿2,140 mixed bill ⇒ CN VAT 140 · two partial refunds Σ VAT = 140 exactly).
3. **D2** — before deducting deposit VAT on an applying bill, ensure the deposit receipt is posted (post the missing DEPOSIT_RECEIPT JV first, as `refund-consumer.ts:33` does for refunds); if the book is no longer VAT-registered at apply, deduct only what was posted (deposit VAT as recorded on the RECEIVE txn, not recomputed) · ORACLE-ADD **A8** (deposit taken unlinked → link book → apply ⇒ receipt JV posted first, 2110 nets 0, VAT 70 once · VAT registration dropped between receipt and apply ⇒ 2110 nets 0).
4. **D3** — `shift.ts` X/Z sales and `reports.ts` sales exclude `sourceModule POS_DEPOSIT` bills (cash stays counted) consistently with close-day · ORACLE-ADD **R6** (X/Z + daily report after a deposit receipt + its apply = ฿2,140 sales, cash ฿3,210 per actual cash rows).
5. **D4** — deposit ownership follows `Customer.mergedIntoId` (≤ 5 hops, as P2.9 store credit) at apply and at lookup · ORACLE-ADD **P8** (member X merged into Y: X's deposit applies on Y's bill; X's own bill cannot exist — refusal unchanged for Z).
6. **D5** — walk-in deposits that recorded a phone require the phone's last 4 digits at apply (`depositId` + `phoneLast4` from the register; mismatch ⇒ `DEPOSIT_NOT_OWNER`); name lookup needs ≥ 3 characters and returns masked rows **without** balances (balance only after selecting by receipt no + last 4); deposits without a phone stay bearer by receipt no (owner line: recommend requiring a phone in P2.9bU) · ORACLE-ADD **P9**.
7. Gates after fix 1: full prompt set (typecheck · fitness ±env · fitness-pos · p2.9b **48** (41 + A7 X9 A8 R6 P8 P9 + the CD-P29b-1 P1 fix already in) forced ×2 + unforced · p2.9 62 · hf-tx 22 · p1.6 48 · p1.8 49 · p1.12 72 · p1.3 128 · p1.1 180 · account 16 · cpa 107 · p2.5 49 · p2.4 50 · p2.6 67 · p2.8 (ST6 wip) · booking-deposit 18 · hotel-public 15 · rental-public 16 · authz 81) at a clean head (dirty=0). Then R2 (hunks) + hunter re-check with QC4 probes for D1/D2 → merge gates on tree b → merge → 33/55.

## Fix round 1 delivered (account B, 15 Oct 05:2xZ) — head 50c70e04 (code fbe92b5a)
180bd51a CD-P29b-1 P1 fix (41/41 ×3 before fix 1) · 3adb1e19 ORACLE-ADD A7 X9 A8 R6 P8 P9 (+ `regDep`/P7 fixture edits) · red-before block 2 **38/47** (6 new red + P4/C3 — register refused the new `phoneLast4` key — + P7) · fixes 65837d05 (A7 cap) · 57722a00 (X9 refund VAT basis) · 29253342 (A8 receipt JV first / recorded VAT only) · 8d8b847e (R6 X/Z + reports exclude POS_DEPOSIT) · 6fddae0f (P8 mergedIntoId) · fbe92b5a (P9 phoneLast4 at apply, lookup ≥ 3 chars without balances) · count **47** (41 + 6; the P1 fix edits an existing check) · gates head=e800b1c0 dirty=0: typecheck 0 · fitness 50/50 ±env · fitness-pos 8/8 · **p2.9b 47/47 ×3** · p2.9 62 · hf-tx 22 · p1.6 48 · p1.8 49 · p1.12 72 · p1.3 128 · p1.1 180 · account 16 · cpa 107 · p2.5 49 · p2.4 50 · p2.6 67 · p2.8 60/61 (ST6 wip) · booking-deposit 18 · hotel-public 15 · rental-public 16 · authz 81 · owner lines (approval queue; bearer deposits without a phone) · P2.9bU contract updated. → R2 (hunks) + hunter re-check (D1–D5 + new surface) sent.

## R2 (account B, 15 Oct 05:3xZ) — head 50c70e04 / code fbe92b5a vs 92bb601c — **MERGEABLE** (reviewer aa61b06d; full `scratchpad/p29br/R2.md`)
**F1 Low** `register.ts` lookup hunk: the `holder` flag counts any member-linked deposit as the caller's when a `memberId` is passed ⇒ a lookup for member A with a name query matching member B's deposit shows B's balance — fix: holder only when the owner is A or a member merged into A · **F2 Low** `phoneLast4` has no attempt limit (wrong value ⇒ DEPOSIT_NOT_OWNER only; 10,000 tries by staff on a visible walk-in deposit) → owner line + P2.9bU (require a phone at take; count failed attempts later) · Info: count 47 correct (P1 fix edits an existing check) · Info: 3adb1e19 also changes the P7 assertion (ruling 6, dated) — fine. Verified OK: scope (10 non-ledger files, no message change 3135/3135, contract + giftcard/member/booking/hotel/rental untouched, no new createSale( site, hunks marked) · A7 (฿1.00: 47 + 46 = 93 vs 93 ⇒ 2110 nets 0; JVs balance; stored VAT = 2200 line) · X9 (basis = bill VAT + applied VAT, capped at basis − reversed; three partials never over-reverse; no-deposit path unchanged) · A8 (receipt JV posted first; recorded VAT; unlinked-then-linked charges VAT once; registration dropped ⇒ 2110 nets 0) · R6 (X/Z, daily, staff reports exclude receipts from sales/counts, cash counted; close-day unchanged) · P8 (≤ 5 hops, same tenant, no loop) · P9 · gates head=e800b1c0 dirty=0.
**Controller rulings**: F1 → fix round 2 (one-line holder rule + ORACLE-ADD **P10**: lookup for A with a query matching B's deposit ⇒ B's row masked without balance; A's own and merged-in deposits with balance) · F2 → owner line + P2.9bU contract line (phone required at take) · round 2 also merges `origin/session/pos` after the P2.11 push (receipt.ts hunks on both sides). Waits for the hunter re-check (one batch).

## Hunter re-check (account B, 15 Oct 05:3xZ · a2b1c213 · code + arithmetic · full `scratchpad/p29bh/recheck.md`)
D1 CLOSED (`refund.ts:590-597`: 70; 70 + 70 = 140; 65 + 42 + 33 = 140) · D2 unlinked→linked CLOSED (`account-bridge.ts:120, 202-210`) · D2 registration dropped PARTIAL → **N1** · D3 CLOSED with leftover (X/Z still counts deposit refunds as refunds `shift.ts:402-403`; close-day/reports exclude them) · D4 CLOSED (`service.ts:419-430`) · D5/P9 PARTIAL → **N2** · X9 mixed bills clean (card share capped, deposit untouched, bill 33 + remainder 37 = 70, nothing released twice).
**N1 Low–Med**: per-use VAT cap (`service.ts:465`) + the clamps at `account/index.ts:168` and the refund clamp in `deposit.ts` ⇒ when the last slice of a deposit is smaller than its unreleased VAT (e.g. ฿1,070 taken VAT-registered, registration dropped, ฿1,050 used releases 0, last ฿20 releases 20) 2110 ends −50 and ฿50 VAT stays stuck · **N2 Low–Med**: `registerDepositLookup` (`deposit.ts:~358`) returns the masked phone whose mask keeps the last 4 (`maskPhone` `order-shared.ts:97`) + the receipt no even for a 3-letter name search ⇒ P9 defeated; no attempt limit.

## Controller rulings — fix round 2 (account B, 15 Oct 05:3xZ) — oracle first (dated ORACLE-ADD/EDIT, red-before block 3)
1. **R2 F1** — lookup `holder` only when the deposit's owner is the caller's member or a member merged into it · ORACLE-ADD **P10**.
2. **N1** — in `lockSaleDeposits` release `max(cap, VATleft − (remaining − use))`, bounded by this use and by VATleft (so VATleft ≤ remaining always holds); same invariant in the remainder refund · ORACLE-ADD **A9** (registration dropped after receipt: use 1,050 then 20 ⇒ 2110 nets 0 and Σ released VAT = 70; also refund of the last ฿20 instead of use ⇒ nets 0).
3. **N2** — walk-in deposits that recorded a phone: every reader (lookup, bill detail, receipt/pre-bill payloads, close-day) masks the phone **fully except the first 3 digits** (no last 4 anywhere; `phoneLast4` never serialised); per-deposit wrong-last-4 counter with the gift-card PIN reserve pattern (one UPDATE … RETURNING; 5th wrong ⇒ `DEPOSIT_LOCKED` for 15 min, message th/en; correct value resets only when not locked) · ORACLE-ADD **P11** (lookup/bill detail/receipt payload carry no last 4 for a walk-in deposit; 5 wrong tries ⇒ DEPOSIT_LOCKED, 6th correct try refused until unlock, balance untouched).
4. **D3 leftover** — shift X/Z exclude POS_DEPOSIT refund documents from refunds as close-day does (cash rows unchanged) · ORACLE-EDIT **R6** extended (dated).
5. **R2 F2** → owner line + P2.9bU contract line (phone required at take) — no code beyond ruling 3.
6. Then merge `origin/session/pos` (P2.11 S lands on `receipt.ts` :28/:215/:301-303 + `reports.ts` + `catalog.ts` — keep both sides; the controller pushes P2.11 shortly: if it is not on origin when you reach this step, merge what is there and note it) → gates = the fix-1 set with `qc-pos-p2.9b` **50** (47 + P10 A9 P11) forced ×2 + unforced, plus `qc-pos-p2.11` 34 and `qc-pos-p1.17` 40 after the upstream merge. Then R3 (hunks) + hunter sign-off → merge gates on tree b → merge → 34/55 (or 33).

## Fix round 2 delivered (account B, 15 Oct 06:3xZ) — head 8445a4c5 (code 7d38de9a; gate head f51a942b = + upstream 491ff89e of ed200e6c/744e4f35)
Commits: d5ed3a9e oracle (ORACLE-ADD P10 A9 P11 + R6 extended; red-before block 3 **46/50**, residue 0) · 410ded79 ruling 1 (P10 holder) · 86cc9163 + 7d38de9a ruling 2 (A9; 7d38de9a also keeps the VAT recorded at receipt on the deposit-refund posting after VAT de-registration — otherwise 2110 stayed 2,000 satang off) · 19c097e1 ruling 3 (P11 mask + per-deposit wrong-last-4 counter + `DEPOSIT_LOCKED` 15 min · **new migration `20261211110000_pos_p29b_deposit_phone_lock`** applied on QC4; QC5 pending) · 34fb3ebf ruling 4 (R6 extended) · owner/contract lines (phone required at take; DEPOSIT_LOCKED in the P2.9bU contract). Upstream merge 491ff89e: receipt.ts/reports.ts/messages auto-merged both sides, conflict only in POS-OWNER-PENDING (both kept).
Gates at f51a942b (dirty 0): typecheck 0 · fitness 50/50 ±env · fitness-pos 8/8 · **p2.9b 50/50 ×3** · p2.9 62 · hf-tx 22 · p1.6 48 · p1.8 49 · p1.12 72 · p1.3 128 · p1.1 180 · account 16 · cpa 107 · p2.5 49 · p2.4 50 · p2.6 67 · p1.17 40 · booking-deposit 18 · hotel-public 15 · rental-public 16 · authz 81 · **p2.8 60/61** (ST6 wip-only) · **p2.11 32/34** (ST1/ST4).
**Controller ruling on the builder's CONTROLLER-DECISION (p2.11 ST1/ST4)**: rejected as a re-pin — `qc-pos-p2.11.mts:258–268` takes the base from `git merge-base HEAD origin/session/pos` (fallback f164d9d6), the same mechanism as p2.8 ST6; both suites are red on any wip branch carrying a migration or lane-A files and go green after the push. Merge gates86 therefore expect p2.11 32/34 + p2.8 60/61 at the merge tip, and both are re-run after the push (gates87 pattern).
→ R3 (aa61b06d) + hunter sign-off (a2b1c213) sent in parallel.

## Hunter sign-off pass on fix 2 (account B, 15 Oct 06:4xZ · a2b1c213 · code read, no probe · full `scratchpad/p29bh/signoff.md`) — **one Low–Medium finding**, rest clean
A9 clean (`service.ts:465-468`: unreleased VAT ≤ remaining deposit; 107000/7000 worked through big-then-small, small-then-big, exact, use-then-refund in both VAT states — 2110 nets 0, output VAT once at receipt, refund VAT kept after de-registration via `account/index.ts:398-399`) · P11 counter clean (`deposit-links.ts:48-71` single `UPDATE … RETURNING`, 5th wrong ⇒ 15-min lock, restart after expiry, reset on correct; masks `deposit.ts:197/:141`, no phone on receipt/audit) · P10 clean (`service.ts:419-430`, `register.ts:2524-2528` before table/split/replay; `payOrder`/API refuse deposits) · R6 clean (`shift.ts:402-404`; GL cash = drawer, revenue = X/Z net).
**F1 (Low–Med)** `deposit.ts:347`: a 4-digit lookup query also searches by phone last 4 without touching the counter ⇒ a cashier can enumerate 0000–9999 (read-only) until the target receipt appears, then pass the last-4 check first try — ruling 3's lock never engages.

## R3 (account B, 15 Oct 06:4xZ) — head 8445a4c5 / code 7d38de9a — **MERGEABLE-AFTER-FIXES** (reviewer aa61b06d; full `scratchpad/p29br/R3.md`) — rulings 1, 4, 5, 6 applied; 2 applied but exposes F1; 3 in place but F2 defeats it; merge 491ff89e carries both P2.11 and P2.9b hunks, th/en 3139/3139
**F1 Med** `account/index.ts` `applyExternalSale`: in the A9 path after VAT de-registration the last ฿20 use is fully covered by the deposit and the 2000-satang VAT release zeroes the sale base ⇒ every journal line is 0, lines filtered out, `commitEntry` throws "ไม่มีบัญชี lines" ⇒ that bill's `pos.sale.paid` event retries and ends DEAD (A9 stays green because 2110 nets 0 and the test never checks the event outcome). **F2 Med** = hunter F1 (`deposit.ts:347` last-4 lookup without counter).

## Controller rulings — fix round 3 (account B, 15 Oct 06:4xZ) — oracle first (dated ORACLE-EDIT/ADD, red-before block 4 in `P2.9b-red.txt`)
1. **R3 F1** — `applyExternalSale` (and any sibling external-document poster that can hit the same case): when every journal line nets to 0 the document is still written and audited (payload `zeroEntry: true`) and the journal entry is skipped — never throw; the outbox event completes. ORACLE-EDIT **A9**: after draining, assert no `pos.sale.paid` event of the fixture bills is FAILED/DEAD and the sale document of the last bill exists. Owner line (`POS-OWNER-PENDING.md`): VAT de-registration between deposit receipt and use makes the released VAT absorb the whole value of a small last bill (revenue 0 on that bill, VAT stays as booked at receipt) — accountant to confirm the treatment.
2. **R3 F2 / hunter F1** — drop the phone-last-4 search clause from the deposit lookup (`deposit.ts:347`): lookup = receipt no / holder name prefix (member deposits by member as today); the phone last 4 is a verification secret only (`checkDepositPhone`, counter + `DEPOSIT_LOCKED`). Brief §10 **ruling 19 amended** by the controller (controller tree): "lookup by receipt no / name prefix; last 4 = verification only". ORACLE-EDIT the existing lookup check that expects a last-4 match (by reason, dated marker) and ORACLE-ADD **P12**: a 4-digit query returns no deposit matched by phone and leaves `wrongAttempts`/lock untouched; a correct last 4 at apply still passes first try for the right holder. P2.9bU contract line updated (lookup field placeholder "เลขใบเสร็จ / ชื่อ", phone asked only at apply).
3. Gates after fix 3 (clean head, dirty 0): typecheck · fitness ±env · fitness-pos · `qc-pos-p2.9b` **51** (50 + P12) forced ×2 + unforced, residue 0 · `qc-pos-p2.9` 62 · `qc-hf-tx` 22 · `qc-pos-account` 16 · `qc-account-cpa` 107 · `qc-pos-p1.17` 40 · `qc-hf-pos-page-authz` 81 · `qc-pos-p2.11` (expect 32/34, ST1/ST4) · `qc-pos-p2.8` (expect 60/61, ST6). Report ≤ 10 lines (head SHA first). Then R4 on the two hunks + hunter re-check → merge.

## Fix round 3 delivered (account B, 15 Oct 08:2xZ) — head da045e04 (code eef6e031; gates at 6b019acb dirty 0)
92da6d7c oracle (A9 edit + P12; red-before block 4 49/51) · 950fc192 ruling 1 · eef6e031 ruling 2 · 6b019acb contract line. Gates: typecheck 0 · fitness 50/50 ±env · fitness-pos 8/8 · **p2.9b 51/51 ×3** · p2.9 62 · hf-tx 22 · account 16 · cpa 107 · p1.17 40 · authz 81 · p2.11 32/34 (pins) · p2.8 60/61 (ST6). Full table in `pos-P2.9b.md` §Fix round 3.

## R4 (account B, 15 Oct 08:23Z · head da045e04 / code eef6e031) — verbatim

# P2.9b R4 — head da045e04 / code eef6e031 vs 8445a4c5 — **MERGEABLE**
(R4 reviewer, read-only, account B, 15 Oct. Note: the R3 and fix-3 rulings sections are in the controller tree `/root/projects/shark-pos/ledger/wo-notes/pos-P2.9b-review.md` §R3/§"Controller rulings — fix round 3". Tree b's copy stops at fix round 2.)

**F1 Low** `pos/refund-consumer.ts:77-83` (+ retries of `pos.sale.paid`). A zero-entry bill never gets `PosSale#<id>#PAID`, so `posSalePosted === false` stays true for good. Each refund event for that bill re-runs `bridgePosSalePaid`. The document upsert is idempotent, but the run writes another `account.external.zeroEntry` audit row (`account/index.ts:262-271`). That audit is also written before the document layer and commission, so an event retry duplicates it. No money moves. Smallest fix: write the audit only when the document is newly created, or skip it if one already exists for (action, refId). Not blocking.
**F2 Low** `account/index.ts:715`. On a zero-entry bill that also carries a channel commission (DIRECT payout, last bill fully covered by the deposit after VAT de-registration), `applyExternalChannelCommission` returns `no-paid` without saying anything. The commission expense/AP is then never posted. Smallest fix: let the zero-entry marker count as "PAID present" for COMMISSION, or add it to the owner line. It is an edge case: it needs the A9 conditions plus a channel commission.
**F3 Info** `account/index.ts:248-249`: the comment says "any other bill = old path every byte", which is not exact. A gross-0 PAID bill with no deposit (100% discount) also meets `zeroEntry`. Before, `commitEntry` threw ("ไม่มีบรรทัดบัญชี") and the event went DEAD. Now the event is DONE with an audit row and no document (the bridge sends `lines` only when gross > 0). This follows the ruling ("never throw") but no oracle covers it. Note it in the builder notes.
**F4 Info** `pos/deposit.ts:334`: the docstring "อ่านอย่างเดียว (ไม่เขียนแถวใด)" is stale since fix 2. Receipt no + `phoneLast4` calls `checkDepositPhone` (`:357`), which writes the counter. This is by design (fix-2 ruling 3, P2.9bU contract "both counted"). A query with no `phoneLast4` never touches it.

**Verified OK — ruling 1**
- The skip test is exact per line: `base===0 && vat===0 && !tipCr && drLines.every(l => l.amountSatang===0)` (`index.ts:249`), checked on drLines after the `:234` filter. Every zero line is dropped when depositVat > 0, so the set is empty and `every` is true. svcBase ≤ base, so it is 0 too. `postExternalSale`'s Cr side is exactly goodsBase/svcBase/vat/crExtra(tip) (`gl.ts:1752-1756`), so every Cr is 0 as well. base ≥ 0 holds algebraically.
- No throw: `{skipped:true}` gives `posted=false`. The document layer is unchanged (`:273+`). The audit payload has `zeroEntry:true` (`:269`). `writeAudit` swallows its own errors.
- Sibling posters cannot reach an empty `commitEntry` in A9:
  - `applyExternalDepositReceipt` `:353-355` and `applyExternalDepositRefund` `:410-412` both guard gross > 0 and Σpay = gross, so Dr/Cr money = gross > 0.
  - `applyExternalRefund` `:592-594`: same guard (CN poster).
  - `applyExternalChannelCommission` `:713-715`: `zero` / `no-paid` return before posting.
- A9 ORACLE-EDIT (`qc-pos-p2.9b.mts:1935-1940`, after `drain()` `:1930`): all 3 `pos.sale.paid` events (receipt, b1, b2) must be `DONE`. This is stricter than "not FAILED/DEAD", because red-before was PENDING/1. The ฿20 bill's `accountDocument` must exist. `.catch→null` fails closed. Red-before block 4 = 49/51 (A9 + P12).
- Owner line: `ledger/POS-OWNER-PENDING.md:210`.

**Verified OK — ruling 2**
- The `deposit.ts:346-349` OR clause is now receipt no (exact) / `customerName` startsWith (insensitive) / `customerId in mergedFamily` only. The `phoneLast4` push is removed (`:347`).
- `viewOf` (`:127-146`) never serialises `phoneLast4`. A walk-in `phoneMasked` shows only the first 3 digits.
- The counter is touched only on receipt no + last 4.
- P12 (`:2004-2021`): a 4-digit query returns OK/VALIDATION without the P12 deposit, the counter stays 0 with no lock, and the correct last 4 at apply passes first try.
- No older check expected a phone match, so no ORACLE-EDIT was needed. Checked P7 `:1295-1320`, P9 `:1854-1870`, P10 `:1892`, P11 `:1978`: all query by receipt/name/member. `:1308` and P9 s4/s5 use receipt + last 4 as verification and are still valid.
- Brief ruling 19 amended text (controller tree `pos-brief-P2.9b.md:108`) matches the code.
- Contract line is present (`pos-P2.9b.md` §P2.9bU "fix 3").

**Verified OK — hygiene**
- 8445a4c5..da045e04 touches only `scripts/qc-pos-p2.9b.mts`, `P2.9b-red.txt`, `POS-OWNER-PENDING.md`, `pos-P2.9b.md`, `account/index.ts`, `pos/deposit.ts`. Each commit matches its stat (92da6d7c test-only, 950fc192, eef6e031, 6b019acb ledger-only).
- No hunk in `register.ts`, `account/service.ts`, `giftcard/**`, `member/**`, `prisma/`, or `src/messages`.
- th/en leaf keys 3155/3155, unchanged.

## Hunter re-check on fix 3 (account B, 15 Oct 08:23Z) — verbatim

# P2.9b hunter re-check, fix 3: `wip/pos-p2.9b` da045e04 (code eef6e031). Code read and arithmetic only, no probes.
**Verdict: FINDINGS (2 Low, 2 Info)**
- R3 F1 / A9: closed.
- Hunter F1 (last-4 lookup): closed.
- None of the findings blocks the merge on its own. N1 and N2 are owner-line or follow-up material.

## A9 path (฿1,070 deposit, VAT 70, then de-registered)
- **Use 1,050:** releases 5000 satang of VAT. Bill 1 JV: Dr 2110 100000 / Cr income 100000.
- **Last ฿20 bill:**
  - `account/index.ts`: baseFull 2000, vatFull 0, depositVat 2000 ⇒ vat 0, base 0.
  - The DEPOSIT Dr line is 0 and filtered out ⇒ `drLines = []`. So the test at :249 is true, and it is exact: the JV balances (Σdr = base + vat), so base = vat = 0 ⇔ every Dr line is 0.
  - Result: no JV, audit `zeroEntry` (:263), document upserted (:298), the event's `bridgePosSalePaid` result is not checked ⇒ **DONE**.
- **Totals:** 2110: Cr 100000 − Dr 100000 = **0**. Σ released VAT = 5000 + 2000 = **7000 (฿70)**. 2200 keeps 7000, booked once at receipt.
- **Void of the zero-entry bill:** `reverseFor` finds no entries ⇒ `[]`, no throw. The document is voided, and RESTORE puts back 2000 / VAT 2000.
- **X/Z, close-day, reports:** these read `PosSale` only, so the bill is counted once (฿20, DEPOSIT tender). The GL change doesn't affect them.
- **Code that assumes a PAID sale has a JV:**
  - No `journalEntryId` on `PosSale` or on documents. E-tax, reconcile and `linkActivity` don't key on the sale JV.
  - The only readers are `posSalePosted` (refund-consumer :60/:77, `ensureDepositReceiptsPosted`) and the commission gate (N1).
- **Refund of the zero-entry bill:**
  - `refund.ts:594`: basis = 0 + 2000, full refund ⇒ refund VAT 2000.
  - Step 1a: `posSalePosted` is false for ever, so `bridgePosSalePaid` runs again on every refund event. That is idempotent: zero entry again, the document already exists (`created:false`, no second bundle cut).
  - `postExternalRefund` doesn't need the sale JV: it books its own JV under the refund id. No "reverse of nothing" throw.
  - **Re-registered:** `explicitVat` 2000 ⇒ Dr 2200 2000 / Cr cash 2000. Consistent.
  - **De-registered:** see N2.

## Hunter F1 / R3 F2 (last 4)
- `deposit.ts:345-349`: the lookup's OR list is receipt no exact / name prefix / member family only. There is no phone clause.
- Other places that could match a deposit by phone:
  - `git grep phoneLast4` finds it only in the deposit, deposit-links and register checks.
  - No `PosSale` phone column. The receipt sale has `memberId` null.
  - Bill and receipt search never join `PosDeposit`.
  - Only free text a cashier types into `note` could carry a phone.
- **Counter:** reserved before it compares, in one `UPDATE … RETURNING` (`deposit-links.ts:56-64`).
  - The 5th wrong try sets now() + 15 min. After expiry the count restarts at 1.
  - A correct value resets the count only when the row is not locked (or the count equals its own slot).
- The brief says "at apply only". That is not quite true: there are two doors, apply (`register.ts:2524`) and lookup with `receiptNo` + `phoneLast4` (`deposit.ts:357`). Both go through the same counter, so neither bypasses it.
- **Lock hint:** a LOCKED row in the lookup looks the same as WRONG or no last 4 (balance null, `needsPhoneLast4` true, same status). Apply returns a distinct DEPOSIT_LOCKED. That tells an attacker to wait, but not the digits.
- Worst case at 5 tries per 15 min ≈ 500 h for 10⁴ values. A deliberate 15-min lockout of a customer's deposit is inherent to the design.

## Findings
- **N1 Low** `account/index.ts:715` together with `account-bridge.ts:190`: a zero-entry bill never gets a `PAID` JV, so its channel commission returns `no-paid` silently.
  - Scenario: A9 de-registered last slice on a DIRECT/PLATFORM channel with commission ⇒ commission expense and AP/AR never booked. A refund then returns `no-commission`, consistently.
  - It is narrow: it needs de-registration, a small last slice and a commission channel.
  - Fix: let the commission gate accept "PAID posted **or** zero entry recorded", or refuse DEPOSIT on commission bills. Otherwise add it to the owner line.
- **N2 Low** `account/index.ts:602`: refunding the ฿20 zero-entry bill after de-registration ignores `refund.vatSatang` (2000) because `explicitVat` requires `vatRegistered`. It books Dr income 2000 / Cr cash 2000 instead of Dr 2200 2000.
  - Result: income 98000 and 2200 at 7000. The remainder-refund path (7d38de9a) gives income 100000 and 2200 at 5000.
  - Two paths for the same economics differ by 2000 between revenue and output VAT. The POS refund also prints VAT ฿20 while the credit note shows 0.
  - This predates fix 3 (A9 path) and isn't a regression.
  - Fix: honour the explicit VAT on refunds of deposit-paid bills, the same way the deposit-refund posting does. Or extend the ruling-1 owner line to "refund after de-registration".
- **N3 Info** fix 3 also changes ฿0 bills. A ฿0 bill (`register.ts:2154`, empty payMethods) now meets `zeroEntry` too: it completes with an audit row, where before `commitEntry` threw and the event went DEAD. That is an improvement, but the comment "otherwise byte-identical" (:247) is not exact.
- **N4 Info** idempotency:
  - `writeAudit` runs outside any transaction before the document. Event retries and every refund-consumer step 1a add duplicate `account.external.zeroEntry` rows. That is cosmetic.
  - A transient document failure ⇒ the event is still DONE, with no document and no JV (no money is lost). The document heals only if the bill is later refunded.
  - The lookup doc comment "อ่านอย่างเดียว (ไม่เขียนแถวใด)" (`deposit.ts:334`) is stale: lookup with receipt no + last 4 writes the counter.
- No new lock or ordering risk:
  - The zero-entry branch takes no lock and runs before the document's own transaction.
  - The document upsert dedupes by ref (`findDocByRef` + the in-tx `again`).
  - The 3 fix-3 commits touch only `account/index.ts`, `deposit.ts` and the QC script.

## Controller rulings — fix round 4 (account B, 15 Oct) — oracle first (dated ORACLE-ADD, red-before block 5 in `P2.9b-red.txt`) — all Low, but money-ledger correctness with small fixes: round before merge (quality rule 10 Oct)
1. **R4 F2 / hunter N1** — the channel-commission gate (`account/index.ts:~715` + `account-bridge.ts:~190`) treats a sale as paid when its PAID JV exists **or** the sale's account document exists with the `zeroEntry` outcome (choose the smallest reliable signal — e.g. `applyExternalSale` returns `{skipped:true, zeroEntry:true}` and the bridge records it on the document payload); commission expense/AP posts once; refund-side commission reversal stays consistent · ORACLE-ADD **A10**: A9 scenario on a commission channel (PLATFORM or DIRECT with commission) ⇒ commission JV posted exactly once, event DONE; refund of that bill reverses the commission consistently (no `no-commission` silent return).
2. **Hunter N2** — `applyExternalRefund` (`account/index.ts:~602`): honour the explicit `refund.vatSatang` for refunds of deposit-paid bills after VAT de-registration, the way the deposit-refund posting does (7d38de9a): Dr 2200 / Cr cash for the VAT part, income untouched for it · ORACLE-ADD **X10**: refund of the ฿20 zero-entry bill after de-registration ⇒ Dr 2200 2000 / Cr cash 2000; income stays 100000 and 2200 ends 5000 — identical to the remainder-refund path; the CN shows VAT ฿20 like the POS refund.
3. **R4 F1 / hunter N4 (audit + document)** — `zeroEntry` audit written once per (action, refId) (skip when one exists, or write it only when the document is newly created); on the zero-entry path a document upsert failure **rethrows** so the event retries (idempotent upsert) instead of ending DONE without a document — "never throw" of ruling 1 applies to the empty journal only. No oracle (failure injection); reviewer verifies by reading.
4. **R4 F3 / hunter N3 (info)** — fix the comment at `account/index.ts:~247` ("otherwise byte-identical" is not exact: ฿0 bills now complete with an audit row and no JV) and add one line to the notes + owner line (฿0 bills: previously DEAD event, now DONE — improvement) · **R4 F4** — fix the stale docstring at `deposit.ts:~334` (lookup with receipt no + last 4 writes the counter).
5. Gates after fix 4 (clean head, dirty 0; one unit like out6 → out7): typecheck · fitness ±env · fitness-pos · `qc-pos-p2.9b` **53** (51 + A10 + X10) forced ×2 + unforced, residue 0 · `qc-pos-p2.9` 62 · `qc-hf-tx` 22 · `qc-pos-account` 16 · `qc-account-cpa` 107 · `qc-pos-p1.17` 40 · `qc-hf-pos-page-authz` 81 · `qc-pos-p1.8` 49 · `qc-pos-p1.12` 72 (refund paths) · `qc-pos-p2.11` (32/34 pins) · `qc-pos-p2.8` (60/61 ST6). Notes §"Fix round 4", push. Then R5 (hunks) + hunter sign-off → merge gates on tree b → merge → 34/55.

## Fix round 4 delivered (account B, 15 Oct 09:2xZ) — head 9700c5e1 (code 0e15d4e3) — marker `gl.recordExternalSaleZeroEntry` (AuditLog row + advisory xact lock) · commission gate PAID JV or marker · `applyExternalRefund` depositPaid explicit VAT · document failure rethrow · comments/owner lines · red-before block 5 51/53 · gates out7: typecheck 0 · fitness ±env · p2.9b 53/53 ×3 · p2.9 62 · hf-tx 22 · account 16 · cpa 107 · p1.17 40 · authz 81 · p1.8 49 · p1.12 72 · pins p2.11 32/34 p2.8 60/61

## R5 (account B, 15 Oct 09:29Z) — **MERGEABLE** — verbatim

# P2.9b R5: review of the fix-round-4 hunks (head 9700c5e1 · code 0e15d4e3 · diff da045e04..0e15d4e3)
**Verdict: MERGEABLE**. Rulings 1–4 are implemented as ruled. I found no blocking issue, only three Info notes. Read-only review; no gates re-run (the gate table in the notes is out7, dirty 0).

**Findings**
- F1 (Info): the marker is written before the document (index.ts:267, then :295/:316). If the document fails for good (for example a deterministic totals mismatch in the upsert at service.ts, which retries until DEAD), the marker still exists. The refund consumer's step 1a (`bridgePosSaleCommission`, refund-consumer.ts, outside the 1a try) can then post COMMISSION on a bill that has no document. This is visible (the event is DEAD) and the money is still correct, because the commission is owed either way. The ruling accepts it. No change is needed.
- F2 (Info): `posSalePosted` still checks only the PAID JV (index.ts:755–758). So on a zero-entry bill, every `pos.sale.refunded` re-runs `bridgePosSalePaid` in step 1a. This is idempotent: the marker exists-check skips the write, the document upsert returns the existing doc (`created:false`), so no bundle stock is consumed again, and commission is "already". It is only extra queries per refund. Optional later: make `posSalePosted` count the marker.
- F3 (Info): A10 asserts that COMMISSION and the reversal each post once, but it never counts marker rows. Ruling 3 is verified by reading only, as ruled. A one-line `auditLog.count(action zeroEntry, targetId b2) === 1` after the replay at qc:2104 would pin it cheaply. Optional.

**Ruling 1: verified OK**
- Marker: one `AuditLog` row with `action="account.external.zeroEntry"`, `targetType="PosSale"`, `targetId=<bill id>` per tenant (gl.ts:1793–1806).
  - There is no unique constraint, and no migration (AuditLog has only `[tenantId,createdAt]` and `[action]` indexes).
  - One row per bill is enforced by `pg_advisory_xact_lock(hashtext("acc-zero-entry:<tenant>:<bill>"))` plus a `findFirst` inside the same `prisma.$transaction` (gl.ts:1802–1804). Under READ COMMITTED, a waiting retry's `findFirst` takes a fresh snapshot after the lock is granted, so it sees the first row. Two concurrent retries therefore write one row.
  - A hash collision only adds serialization.
  - The write is not swallowed: it is a direct `create`, not `writeAudit`. A failure throws, so `pos.sale.paid` retries.
  - It is its own transaction, committed before `postSaleCommission` runs in the bridge, which happens after `applyExternalSale` returns.
- Commission gate (index.ts:723): `!PAID && !marker` returns `no-paid`, so the gate still refuses when neither exists. The marker query only runs when PAID is missing, so normal bills get no extra query. The reverse side (index.ts:724) is unchanged and is satisfied because COMMISSION now exists. Void goes through `reverseFor`, which reverses every POSTED JV of `PosSale/<bill>`, COMMISSION included. `postSaleCommission` still skips VOIDED bills.
- A10 (qc:2090–2114):
  - zero-entry fixture with no PAID JV: :2096
  - COMMISSION once, Dr 6500 200 / Cr 2100 200: :2099–2100
  - replay of `pos.sale.paid` still gives 1: :2103–2104
  - COMMISSION_REFUNDED once, Dr 2100 / Cr 6500 200: :2107–2108
  - replay of the refund, then 2 JVs with 6500/2100 net 0: :2111–2114

**Ruling 2: verified OK**
- `keepVat = vatRegistered || (depositPaid && vatSatang > 0)` (index.ts:606). `cnVat = vatRegistered || explicitVat !== null` (:608).
  - VAT-registered book: `keepVat` and `cnVat` are true, which is exactly the old `explicitVat`, `vatMode` and `vatRegistered` behaviour.
  - Not registered, without a deposit or with refund VAT 0: `explicitVat` is null and `cnVat` is false, which is the old path.
- CN: `vatMode: cnVat ? INCLUDE : NONE` and `vatRegistered: cnVat` (:650–651), with `vatSatang` = refund VAT. `upsertExternalCreditNoteDocument` uses `vatRegistered` only for totals, then applies the explicit VAT.
- Plumbing:
  - bridge param 7 `depositPaid`: account-bridge.ts:341, :360
  - consumer passes `sale.payments.some(DEPOSIT && refSaleId)`: refund-consumer.ts:114
- Mixed and partial cases are bounded. After de-registration the POS rate is 0, so the bill's own `vatSatang` is 0 (the fixture's 5000/2000 deposit-VAT release shows this). The POS refund basis is then `sale.vatSatang + Σ APPLY VAT` = deposit VAT only (refund.ts:592–597), which is exactly what sits in 2200. So pro-rata refunds sum to that amount and cannot over-debit 2200.
- X10 (qc:2117–2130):
  - refund VAT 2000: :2123
  - JV Dr 2200 2000 / Cr 1010 2000 (income untouched): :2125
  - receipt + bills + refund = 1010 105000 / 4000 −100000 / 2200 −5000, with 2110 absent (net 0) under `sameNet`: :2127
  - CN `vatAmount` 2000: :2130

**Ruling 3: verified OK**
- `if (!doc.ok && zeroEntry) throw` (index.ts:316) applies to the zero-entry path only.
- The non-zero path still returns `{posted, reason}` (:317). `zeroMark` is `{}` on that path, so every non-zero return is byte-identical (:276, :317, :322).
- The empty-journal skip still does not throw (:253).
- No double audit: `writeAudit` and its import are removed, and the marker exists-check makes retries and step 1a write nothing.
- The document upsert is idempotent by ref (`findDocByRef` first), so a retry after a partial failure is safe.

**Ruling 4: verified OK**
- index.ts:248–251 now states that ฿0 bills hit the condition (DONE, marker, no JV, no document, because the bridge sends lines only when gross > 0, account-bridge.ts `lines` guard). That is accurate against gl.ts:222 (the "ไม่มีบรรทัดบัญชี" throw that happened before).
- deposit.ts:334–335: the docstring now matches `checkDepositPhone`, which writes the counter.
- `POS-OWNER-PENDING.md` has the 2 owner lines: ฿0 bills including the fixed-commission effect, and the rulings 1–2 accounting treatment.

**Hygiene: OK**
- Files touched: `account/gl.ts` (+19, marker helpers; this is in the account module, so the facade does not touch raw prisma), `account/index.ts`, `pos/account-bridge.ts` (+3), `pos/refund-consumer.ts` (+1), `pos/deposit.ts` (docstring only), `scripts/qc-pos-p2.9b.mts`, and ledger files.
- No `register.ts`, `service.ts`, `giftcard`, `member`, `prisma` or messages hunk. No migration, no new table or column.
- th/en key counts are equal: pos 3139/3139, common 16/16.

## Hunter sign-off on fix 4 (account B, 15 Oct 09:29Z) — **SIGNED-OFF** — verbatim

# P2.9b hunter sign-off, fix 4: `wip/pos-p2.9b` 9700c5e1 (code 0e15d4e3). Code read and arithmetic only, no probes.
**Verdict: SIGNED-OFF.** N1 and N2 are closed. The notes below are Info only and none blocks the merge.

## N1 / A10: closed
- **Sale path:** zero-entry bill ⇒ marker (`index.ts:267`), then document (:316), then `postSaleCommission` (`account-bridge.ts:190`). The gate (`index.ts:723`) accepts PAID or the marker. It still returns `no-paid` when neither exists.
- **Commission:** DIRECT 10% of 2000 = 200 ⇒ Dr 6500 200 / Cr 2100 200, folded because the book is de-registered.
- **No double post:**
  - Replaying the event: COMMISSION is keyed per bill (:720 "already").
  - Refund step 1a re-runs `bridgePosSalePaid` because `posSalePosted` is false for ever. The marker exists so no new row, the document gives `created:false`, and commission says "already".
  - Step 1c finds COMMISSION ⇒ one COMMISSION_REFUNDED, Dr 2100 200 / Cr 6500 200, net 0.
- A10 asserts all of this (`qc-pos-p2.9b.mts:2097-2115`).

## N2 / X10: closed
- **X10 arithmetic:**
  - Receipt: Dr 1010 107000 / Cr 2110 100000 / Cr 2200 7000.
  - b1: Dr 2110 100000 / Cr 4000 100000.
  - b2: no JV.
  - Refund: VAT 2000 (`refund.ts:594-597`, basis 0 + 2000, full) ⇒ `keepVat` (`index.ts:606`) ⇒ Dr 2200 2000 / Cr 1010 2000.
  - Net: 1010 105000, 4000 −100000, 2200 −5000, 2110 0. That equals the remainder-refund path. The CN is INCLUDE with VAT 2000 (:608).
- **Mixed case** (฿500 bill = ฿200 deposit with VAT 1308 + ฿300 cash, after de-registration):
  - Bill JV: base 48692, Dr 2110 18692 + cash 30000.
  - Refund of ฿100: share = round(1308 × 10000 / 50000) = 262 ⇒ Dr 4000 9738 + Dr 2200 262.
  - Final refund: left = 1046 ⇒ ΣVAT 1308, Σincome 48692. Every account ends at 0.
  - Caps hold: vat ≤ grand, ≤ left, and `explicitVat` ≤ gross.
- **Unchanged paths:**
  - VAT-registered books: `keepVat` is already true, and `cnVat` = `vatRegistered` ⇒ byte-identical.
  - De-registered books with no deposit, or with refund VAT 0: the old path.

## Marker risks
- **Marker without a document:** yes, by ordering. The marker commits in its own transaction before the document.
  - On a transient failure, the event stays PENDING (`outbox.ts:294`) and refund step 0 waits. The retry heals it: the marker is skipped, the upsert dedupes, and the bundle stock cut runs only on `created`.
  - The document's only deterministic `ok:false` (total mismatch) can't occur after the line check at :192. After 5 tries the event is FAILED. Then a refund's 1a and `bridgePosSaleCommission` can post commission with no sale document. That is economically right, because the bill has no GL.
- **Void before commission:** `postSaleCommission` re-reads the bill and skips VOIDED (`account-bridge.ts:270`). The PAID JV path behaves the same way, so the marker adds no new exposure. The read-then-void race is pre-existing.
- **Retry storms:** bounded by 5 attempts. Each attempt takes the advisory lock, checks existence and writes no row. The exists-under-xact-lock read is correct at READ COMMITTED.
- **Zero-entry decision stability:** base + vat = gross − depositVat, whatever the registration. So the marker can't flip to a PAID JV if the book re-registers between retries.

## Info
- **H1 (Info)** `gl.ts:1795`: the marker lookup is tenant + refId only, not book-scoped. If a POS is relinked to another book, an old marker opens the commission gate in the new book. Very narrow; owner line, or add `systemId` to `after` and the filter.
- **H2 (Info)** policy split after de-registration:
  - A deposit-paid bill sold while VAT-registered now reverses its whole refund VAT through 2200, including the bill's own VAT, so 2200 ends at 0.
  - A cash-only bill in the same timing still books Dr income gross, leaving 2200 stranded.
  - The deposit-paid behaviour is the better one. The accountant should see both in the ruling-2 owner line, along with "CN with VAT from a de-registered book".
- **H3 (Info)** ruling 3 idempotency was verified by reading only. A10 counts COMMISSION and the reversal under replay, but not `account.external.zeroEntry` rows; a count == 1 check would pin it.
- **H4 (Info)** every ฿0 bill now adds one AuditLog row plus a small lock transaction. This is fine at bill volume. `gl.ts` writes `auditLog` directly rather than through `core/audit` (intentional: it throws). Fitness is green.

## Controller decision (account B, 15 Oct 09:29Z): merge. Info items → follow-ups in the HF-FU card: R5 F2 `posSalePosted` counts the marker · R5 F3 / hunter H3 ORACLE-ADD marker count == 1 · hunter H1 marker lookup book-scoped (systemId) · H2 owner line extended (cash-only bill after de-registration still strands 2200).
