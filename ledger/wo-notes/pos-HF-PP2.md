# POS HF-PP2 — manager gate for manual PROMPTPAY/CARD in `orders.payOrder` (server backstop) — builder notes

Lane: builder (account B) · tree `/root/projects/shark-pos-p11` · branch `wip/pos-hf-pp2` from `session/pos` 44d11b12 (code ca5a07b4) · merged `origin/session/pos` 7cb0359a (P2.8U 89eb07ed) → 2bc42fa2 before gates · not merged into `session/pos`.

## Commits
- 2a58f2e2 oracle `scripts/qc-pos-p2.8.mts` +P10 (60 → 61) · a7203f40 red-before `ledger/wo-notes/HF-PP2-red.txt` · 640e130b code · 2bc42fa2 merge upstream · (this commit) owner lines + notes.

## Diff (code — 3 files, all hunks marked `// POS HF-PP2 ▸ … ◂`)
- `src/lib/modules/pos/register-shared.ts:918-920` — `export const REGISTER_MANUAL_METHODS: ReadonlySet<string> = new Set(["PROMPTPAY", "CARD"])` (single owner flip point, §9 ruling 2; file stays pure).
- `src/lib/modules/pos/register.ts:470` (+ import in the existing register-shared block) and `:685` `const REG_MANUAL_METHODS = REGISTER_MANUAL_METHODS;` (old literal Set removed). No other change; HF-PP gate at `register.ts:2229-2237` untouched.
- `src/lib/modules/pos/order.ts:36-37` two marked import lines (register-shared constants · `isPaymentIntentId`/`parsePosIntentSettings` from `payment-intent-shared`).
- `src/lib/modules/pos/order.ts:1107-1117` gate (3 comment + 7 code lines) in `payOrder`, after every read-only check (scope `:1069`, validation, `orderInScope`, state checks `:1093-1100`, PLATFORM `:1101`, Σ `:1103`, `deviceShift`/SHIFT_REQUIRED `:1105-1106`) and immediately before `mutate` `:1118` ⇒ no write before the refusal. Refusal = `refuse("PERMISSION_DENIED", REGISTER_MANUAL_MANAGER_MESSAGE)` ⇒ UI `submitRefusalMessageKey` → `register.refusal.manualConfirmManager` (P2.8U `OrderPay.tsx` already maps it).
- Unchanged: order state machine, receipts, `createSale` input, `scripts/pos-sale-contract.json` (p1.6 48/48), schema, messages, UI.

### Builder decision (flag for reviewer/controller) — what counts as a "valid `pi_` reference" in payOrder
The register's predicate is format-only (`isPaymentIntentId`) because `submitRegisterSale` later claims the intent in `regSubmitWithIntents` (must exist, PAID, amount match, consumed once). **`payOrder` never claims/consumes intents** — a `pi_…` reference is stored as plain text on `PosPayment`. Copying the format-only predicate would let a STAFF bypass the gate by typing any `pi_xxxxxx` string. So the payOrder gate exempts a manual row only when every manual row references a **distinct, real `PosPaymentIntent` of this tenant+unit with status PAID and amount = row amount**; otherwise it reads the setting and refuses. Laziness kept: CASH/TRANSFER only, or actor has `pos.shift.manage@unit` ⇒ zero extra DB reads; manual row without `pi_` ⇒ one settings read (same as HF-PP); all rows `pi_` ⇒ one intent read (+ settings only if not all real). Kind (PROMPTPAY_* vs CARD_BEAM) is not cross-checked (money is real either way). The UI never sends `pi_` to payOrder (P2.8U `OrderPay` = intent null), so this only matters for crafted calls. Follow-up (not in scope): payOrder does not consume referenced intents (a PAID intent could back both a register sale and an order) — see Follow-ups.

## Which orders reach the gate (cites at 2bc42fa2)
Only DIRECT-paid orders (adapters MANUAL/CHAT/CUSTOM/API with DIRECT payout): `order.ts:1097` PLATFORM_PAID ⇒ `stateInvalid` · `:1098` `o.adapter === "WEB"` ⇒ `stateInvalid` · `:1101` any `PLATFORM` pay type ⇒ `CHANNEL_PAY_MISMATCH` — all before the gate, so WEB/PLATFORM never pass a manual method here.
Callers of `payOrder`: `pos/index.ts:124,152` facade `orders.payOrder` · `pos/order-actions.ts:164-178 payOrderAction` (UI, gated client-side by P2.8U fix1). REST: none (`src/app/api/v1/**`, `src/lib/api/**`, `src/lib/modules/pos/api/**` have no payOrder/orders.pay* caller; `/api/v1/sales` is GET read-only) — recorded in `POS-OWNER-PENDING.md` (14 ต.ค. HF-PP2).

## Oracle P10 (`qc-pos-p2.8`, X3)
Setting via `updatePosIntentSettings` (owner) · intents via `createPaymentIntent` + `confirmPaymentIntentManual` (owner) · temp `PaymentProfile` (Prisma, like qc-pos-p1.7) removed at end of step · setting restored in `finally`. STAFF2 (pos.sale.create + pos.order.accept, no shift.manage) on CHAT ACCEPTED UNPAID orders (12000): PROMPTPAY no ref / CARD `EDC-4242` / CASH+PROMPTPAY / forged `pi_` / real PAID `pi_` of 5000 ⇒ PERMISSION_DENIED + exact message ×5; PosSale/PosPayment +0, order ACCEPTED/UNPAID/no sale/version unchanged, PosOrderEvent + pos.order.* outbox unchanged · OWNER PROMPTPAY ⇒ PAID · STAFF2 CASH ⇒ PAID · STAFF2 PROMPTPAY + real PAID `pi_` 12000 ⇒ PAID · setting off ⇒ STAFF2 PROMPTPAY PAID. Header comment + Prisma-direct list updated.
Red-before (base code ca5a07b4, QC_FORCE): **60/61, only P10 red** — STAFF2 PROMPTPAY → OK (order paid, PosSale 9→10, event 2→3) — `ledger/wo-notes/HF-PP2-red.txt`.

## Gates (all at head 2bc42fa2 = code 640e130b + upstream 7cb0359a, dirty 0; headed logs `scratchpad/hfpp2/gates/*.out`, each starts `tree=/root/projects/shark-pos-p11 head=2bc42fa2 dirty=0`)
| gate | result |
|---|---|
| typecheck (pos-gate.lock, 5632/6500M) | rc 0 |
| fitness no-env / env (qc4) | 50/50 · 50/50 |
| fitness-pos | 8/8 |
| qc-pos-p2.8 forced / unforced | 60/61 · 60/61 — **P10 ✅**; only ST6 (PAR) red: `register.ts` sha ≠ P2.8 base / merge-base (the alias hunk). Same expected PAR reason as HF-PP/HF-TX — green once merged into `session/pos`; controller confirms on the merged tip. residue 0 · leaks 0 |
| qc-pos-p1.7 | 33/33 (R4b register gate unchanged) |
| qc-hf-tx | 18/18 (residue 0) |
| qc-pos-p1.3 | 128/128 |
| qc-pos-p1.1 | 180/180 |
| qc-pos-p2.4 | 50/50 · PAR 4/4 |
| qc-pos-p1.6 (contract sha) | 48/48 |
| qc-hf-pos-page-authz | 71/71 |

## Merge notes
- P2.6 S (tree c, edits `order.ts`): HF-PP2 touches `order.ts` only at two new import lines after `:35` and one block before `mutate` in `payOrder` — upstream merge should be trivial; keep both hunks.
- Visual: none (no UI). No `--state` list for the controller.

## Follow-ups
1. payOrder does not consume `pi_` intents it accepts as exemption (could double-use one PAID intent across a register sale and an order) — card for P2.7/P2.8 owner if `pi_` on order pay is ever wired in the UI.
2. Owner decisions carried: CARD under the setting (flip at `REGISTER_MANUAL_METHODS`), TRANSFER not covered (HF-PP fix 1 line).

## Fix round 1 (review F1)
Ruling: keep the strict `pi_` rule; tighten — exemption must be single-use and inside the register's 24 h `paidAt` window.
- Commits: 4fadbbae oracle + red2 · 448c632c code · (this commit) notes.
- Code `src/lib/modules/pos/order.ts` (inside the existing `// POS HF-PP2 ▸ … ◂` block, now `:1107-1119`; all-`pi_` branch only): `:37` import adds `PAYMENT_INTENT_CONSUME_WINDOW_MS` from `payment-intent-shared` (same source `payment-intent.ts:27` uses for `lockSaleIntents` `:542`) · `:1113` `allPi` (every manual row a distinct `pi_`) · `:1114` `used = allPi && posPayment.count({tenantId, reference in piIds}) > 0` (intent already backing a sale ⇒ not exempt) · `:1115` intent `findMany` adds `paidAt >= now − 24 h` and runs only when `allPi && !used`. Reads stay lazy: CASH/TRANSFER-only or `pos.shift.manage` ⇒ 0 reads; a manual row without `pi_` ⇒ settings read only. Comment line `:1108` updated. Nothing else changed.
- Oracle P10 (no new D-row, still 61): fixture adds orders o5 o6 + a third PAID intent with `paidAt` moved back 25 h (Prisma direct on the temp tenant, header updated); setting on, STAFF2: o5 PROMPTPAY with o3's `pi_` (already on o3's sale) / o6 PROMPTPAY with the >24 h `pi_` ⇒ each PERMISSION_DENIED + exact message, PosSale/PosPayment/PosOrderEvent +0, order ACCEPTED/UNPAID/version unchanged. Separate orders so neither case masks the other when red.
- Red2 (code 640e130b, QC_FORCE) `ledger/wo-notes/HF-PP2-red2.txt`: 59/61 — P10 red on both new cases (o5 → OK PosSale 12→13; o6 → OK PosSale 13→14) + ST6 PAR (expected).

| gate (head 448c632c, dirty 0, logs `scratchpad/hfpp2/gates-fix1/*.out` headed `tree=/root/projects/shark-pos-p11 head=448c632c dirty=0`) | result |
|---|---|
| typecheck | rc 0 |
| fitness no-env / env | 50/50 · 50/50 |
| fitness-pos | 8/8 |
| qc-pos-p2.8 forced / unforced | 60/61 · 60/61 — P10 ✅ · only ST6 PAR red (`register.ts` alias hunk vs merge-base; green once merged) · residue 0 |
| qc-pos-p1.7 | 33/33 |
| qc-hf-tx | 18/18 |
| qc-pos-p1.3 | 128/128 |

`origin/session/pos` moved to e93b0337 (ledger-only: review + prompts) — not merged this round (no code delta).
Follow-up 1 above is now covered for payOrder (reuse refused); register-side consumption is unchanged.
