# HF-PP2 review (read-only) — tree p11 @ 3de290df (code 640e130b)
**Verdict: MERGEABLE** (one Low finding; optional 2-line tighten before or after merge, controller's call).
**F1 (Low) — `pi_` exemption isn't single-use.** `order.ts:1112-1114`: a STAFF row passes the gate when it names a PAID intent of this unit with the same amount. `payOrder` never consumes it (status stays PAID, `saleId` null), so one real PAID intent can exempt any number of crafted `payOrderAction` calls for the same amount. Example: STAFF sends PROMPTPAY 12000 ref=`pi_X` (already on order A) for order B → PAID with no manager. The same intent can still be consumed later by `submitRegisterSale`. The check also skips the register's 24 h `paidAt` window (`PAYMENT_INTENT_CONSUME_WINDOW_MS`) and the kind↔method match (builder notes this). "ไม่ซ้ำ" in the comment at :1108 only means distinct within the call. Only reachable through a crafted call: the UI always sends intent=null (`OrderPay.tsx:5,47`). It is strictly tighter than base, where there was no gate. Smallest fix, on the all-`pi_` branch only: add `paidAt >= now-24h` to the `findMany` `where`, and treat as not exempt if `prisma.posPayment.count({where:{tenantId:s.tenantId, reference:{in:piIds}}}) > 0`. P10 stays green with no ORACLE-EDIT, because piOk is unused before o3.
**Item 2 ruling: KEEP the strict rule (real PAID intent of this unit with the same amount), then TIGHTEN per F1. Do not relax to the register's format-only `isPaymentIntentId` (`register.ts:2231`).** The register can use a format-only check because `regSubmitWithIntents` later claims the intent (exists, PAID, amount, FOR UPDATE, once). `payOrder` claims nothing, so a format-only check would let anyone type `pi_xxxxxx` to bypass the gate.
- It refuses no legitimate flow today. The only callers are `index.ts:124,152` (facade) and `order-actions.ts:164-178` ← `OrderPay.tsx:47`, and that path sends no `pi_`. Without a manager, CARD/EDC or PROMPTPAY without a ref is supposed to be refused.
- It adds no DB reads on the common path. CASH/TRANSFER, or an actor with `pos.shift.manage`, costs 0 reads. A manual row without `pi_` costs 1 settings read (same as HF-PP). The intent read happens only when every manual row is `pi_`.
**Verified OK**
1. **Gate placement and behaviour.** The gate is at `order.ts:1107-1117`, after scope (:1069), validation (:1073-1087), `orderInScope` (:1089), the paid/state/WEB/PLATFORM checks (:1092-1101), Σ (:1103) and shift (:1105-1106). It comes before `mutate` (:1118), so nothing is written before the refusal (the paid-event read at :1093 is read-only).
   - Refusal is `refuse("PERMISSION_DENIED", REGISTER_MANUAL_MANAGER_MESSAGE)`. That maps to `refusal.manualConfirmManager` via `register-shared.ts:922-924`.
   - Reads are lazy as specified: settings are read only for a manual method without a valid intent when the actor lacks `can(…"pos.shift.manage", unitId)` (:183, the same `evaluate` as the register).
   - CASH/TRANSFER are untouched; the owner passes.
2. Ruled above.
3. **Shared set, no other changes.**
   - `REGISTER_MANUAL_METHODS` is exported at `register-shared.ts:918-920`.
   - `register.ts` changes only by import :470 and alias :685 (+2/−1 vs merge-base; the HF-PP gate at :2229-2237 is unchanged).
   - The 44d11b12…3de290df diff shows no change to schema or `pos-sale-contract.json`. The messages diff comes only from P2.8U; `7cb0359a..3de290df` shows no messages.
   - No change to the state machine, receipts or `createSale` input (`order.ts:1118-1138` untouched).
4. **Oracle P10 (`qc-pos-p2.8.mts`).** The D-row is in the list, and the step adds +85 lines in one hunk; the only other changes are header comments.
   - Five refusal cases (PROMPTPAY no ref, CARD EDC, CASH+PROMPTPAY, forged `pi_`, PAID `pi_` with the wrong amount) are each checked for the exact code and message.
   - After the refusals: PosSale/PosPayment count +0, order ACCEPTED/UNPAID/no sale/same version, events and outbox unchanged.
   - Positive controls: owner → PAID, STAFF2 CASH → PAID, real `pi_` → PAID, setting off → PAID (`paidOk` checks ok + PAID + sale + saleId).
   - It is not vacuous: `pay()` returning null fails `denied`, and red-before `HF-PP2-red.txt` is 60/61 with P10 red (paid at base).
   - Gap: no reuse case (see F1).
5. **REST.** `git grep payOrder` in `src/app/api`, `src/lib/api` and `pos/api` finds nothing. The owner lines are at `POS-OWNER-PENDING.md:127-129`.
   - The follow-up "a PAID intent can back both a register sale and an order" is partly pre-existing: `payOrder` never consumed intents, and a reference was just text. HF-PP2's exemption is new, and it turns that reuse into a way past the gate (F1).
6. **Markers and merge.** All hunks are marked `// POS HF-PP2 ▸ … ◂` (`order.ts:36,37,1107-1109`; `register-shared.ts:918`; `register.ts:470,685`). `diff 7cb0359a 2bc42fa2` touches only the HF-PP2 files, so P2.8U came in unchanged.
**Follow-ups:**
- (a) If F1 is deferred: card it for the P2.8 owner and add a P10 reuse case when it is fixed.
- (b) `payOrder` should claim/consume intents (FOR UPDATE) if `pi_` is ever wired into order pay.
- (c) ST6 PAR red on the `register.ts` alias is expected; confirm it on the merged tip.

## Controller rulings (account B, 14 Oct 12:2xZ)
1. Item 2: **keep the strict `pi_` rule** (real PAID intent of this unit, same amount) — the register's format-only check is safe only because `regSubmitWithIntents` claims the intent later; `payOrder` claims nothing.
2. **F1 → fix round 1 before merge** (quality-first): P10 extended first (same `pi_` on a second order ⇒ refused; `paidAt` older than 24 h ⇒ refused; red-before `HF-PP2-red2.txt`), then `order.ts` all-`pi_` branch adds the 24 h `paidAt` window + "not exempt if a `PosPayment` already references the intent". Gates p2.8 (60/61, ST6 PAR accepted) · p1.7 · hf-tx · p1.3 · fitness ±env · fitness-pos · typecheck. Follow-up (b) `payOrder` should claim intents FOR UPDATE if `pi_` is ever wired into order pay → P2.11/P3 owner line.
