# POS P1.7 — builder S notes (payment intents · PromptPay dynamic · Beam · webhook · consume in sale)

Builder S · VPS tree `/root/projects/shark-pos-d` (own node_modules) · branch `wip/pos-p1.7` from `origin/wip/pos-p1.7-oracle` 3ac74097 · 9 Oct 2026 · lane 4.
Contract: `ledger/pos-briefs/pos-brief-P1.7.md` §2 R1–R8 + §5 CD1–CD6 as amended by controller rulings A–K + 12 · oracle `scripts/qc-pos-p1.7.mts` (unchanged) · names = oracle notes table (all 21 rows used as written). Server half only — no UI (P1.7U).

## Migration (QC4 only · additive)
- `prisma/migrations/20261130100000_pos_p17_payment_intent/migration.sql` = output of `prisma migrate diff --from-schema <copy of prisma/schema at 3ac74097 in scratch> --to-schema prisma/schema --script` (not diffed against the DB).
- Content: `CREATE TABLE "PosPaymentIntent"` (21 columns, `kind/status/confirmedVia` TEXT, `lateWebhook BOOLEAN NOT NULL DEFAULT false`, no FK) · `CREATE INDEX …_tenantId_unitId_status_createdAt_idx` · `CREATE INDEX …_beamChargeId_idx` · `CREATE UNIQUE INDEX …_tenantId_idempotencyKey_key`. No ALTER/DROP, no enum change (`PosPayType.CARD` already exists — P1.6).
- `migrate status` before: up to date (158 local) · `migrate deploy` (iso → qc4 → POS lock): applied only `20261130100000_pos_p17_payment_intent`, exit 0 · `prisma generate` in tree d only.
- Registered `PosPaymentIntent: sys()` in `core/scope.ts`; `scripts/pos-qc-env.mts` moved PosPaymentIntent from POS_FUTURE_MODELS to POS_MODELS.
  - Also reworded the comment on `pos-qc-env.mts:99` ("prisma/schema/*.prisma" → "ไฟล์ .prisma ใต้ prisma/schema"): the oracle's comment stripper treats that `/*` as a block comment that swallowed the whole POS_MODELS block up to the next `*/` (line 161), so C9 could never see `posPaymentIntent`. Comment-only change.

## Steps (commits on `wip/pos-p1.7`)
1. 2b3b1bff — schema + migration + scope/pos-qc-env · `payment-intent-shared.ts` (types, `parsePosIntentSettings`, `intentRefusalMessageKey`) · `payment-intent.ts` (create · markIntentPaid · confirm manual · cancel · status · expire · lockSaleIntents/consumeSaleIntents) · `payment-intent-actions.ts`.
2. 49369151 — `beam.ts` additive (`method`, optional `description/returnUrl`, lenient QR read) · `payment-webhook.ts#onBeamWebhookEvent` · route `pos-` branch (6-line hunk + import).
3. 9b6eddc0 — `submitRegisterSale` consumes `pi_` intents in its own sale tx · `scheduleDrain()` after commit (ruling I) · `service.ts`: `consumeSaleInventory` exported (one word) for the post-commit stock cut.
4. 4d613198 — outbox consumer `pos.payment.intent_paid` (withAutomation no-op) + label · hourly cron calls `expirePaymentIntents()` (ruling 12).
5. 07dfdedf — messages `pos.payment.errors.*` (9) + `pos.register.errors.{intentNotFound,intentNotPaid,intentConsumed,intentExpired,amountMismatch}` th/en.
6. 55d2c07e — fix: one `createSale(` call site in register.ts (`regCreateSale` helper used by both the P1.6 path and the intent tx) — the first run of `qc-pos-p1.6` U4 counted 19 sites/15 files vs its registry 18/15.
Pushes: after step 5 (typecheck #1 = 0) and at the end (typecheck #2 = 0).

## Gates (final code 55d2c07e)
| command | result |
|---|---|
| `iso … flock /tmp/pos-gate.lock pnpm typecheck` | #1 exit 0 (before push of 07dfdedf) · #2 exit 0 (final) — 2 of 3 allowed |
| `qc-pos-p1.7 --no-db` | exit 0 · 2/2 |
| `qc-pos-p1.7` QC_FORCE=1 (first run, 07dfdedf tree) | exit 0 · 30/30 · residue 0 · tenant-less OpsEvent deleted 1, left 0 · fetch-guard hits 0 · fake Beam calls 14 |
| `qc-pos-p1.7` QC_FORCE=1 run on 55d2c07e (b2) | exit 0 · 30/30 · residue 0 |
| `qc-pos-p1.7` QC_FORCE=1 run on 55d2c07e (b3) | exit 0 · 30/30 · residue 0 · guardHits 0 |
| `qc-pos-p1.7` unforced on 55d2c07e (b3) | exit 0 · 30/30 (no SKIP) · residue 0 |
| `qc-pos-p1.6` | first run exit 1 · 47/48 (U4 call-site registry) → after 55d2c07e exit 0 · 48/48 |
| `qc-pos-p1.3` | exit 0 · 128/128 (07dfdedf and 55d2c07e) |
| `qc-pos-p1.5` | exit 0 · 21/21 |
| `qc-pos-p1.8` | exit 0 · 49/49 |
| `qc-pos-p1.9` | exit 0 · 53/53 |
| `qc-pos-p1.10` | exit 0 · 40/40 |
| `qc-pos-p1.11` | exit 0 · SKIPPED (P1.11 not built on this branch — expected) |
| `qc-pos-p1.16` | exit 0 · 28/28 |
| `qc-pos-account` | exit 0 · 16/16 |
| `qc-hf-pos-page-authz` | exit 0 · 56/56 |
| `qc-nav-functions` (static) | exit 0 · 11/11 |
| money set COMMON §7: `qc-account-cpa` · `qc-restaurant-money` · `qc-shop-refund` · `qc-hotel-money` · `qc-ticket-money` · `qc-subscription-money` | all exit 0 · 107/107 · 6/6 · 12/12 · 5/5 · 6/6 · 14/14 |
| `env -u DATABASE_URL -u DIRECT_URL pnpm fitness` | exit 0 · 41/41 (also the pre-commit hook on every commit) |
| `bash scripts/qc4.sh pnpm fitness` | exit 0 · 41/41 |
| `pnpm exec tsx scripts/fitness-pos.mts` | exit 0 · 8/8 · F15.2 contract unchanged (createSale/voidSale · 47 fields) — `--update-pos-contract` not needed |
All QC4 suites ran as `bash scripts/iso.sh [env QC_FORCE=1] bash scripts/qc4.sh env GATE_LOCK_FILE=/tmp/shark-gate-pos.lock bash scripts/with-gate-lock.sh pnpm exec tsx scripts/<suite>.mts` inside `systemd-run --no-block --unit=pos-p17s-<n> -p Type=oneshot -p RemainAfterExit=yes`. Not run here: `next build`, visual (no UI in this half) — CONTROLLER-RUN.

## Contract for P1.7U (PayScreen right panel of mockup 02 · 17A "ชำระเงิน" settings)
Types (client-safe): `src/lib/modules/pos/payment-intent-shared.ts`. Actions (`"use server"`, refusals returned as data `{ok:false, code, message}`): `src/lib/modules/pos/payment-intent-actions.ts`. Every action takes `{systemId, unitId, deviceId?}` plus:
- `createPaymentIntentAction({…, input: {method: "PROMPTPAY"|"CARD", amountSatang, idempotencyKey, deviceId}})` → `{ok:true, intent: PaymentIntentView, reused: boolean}`. Key = `[A-Za-z0-9_-]{8,100}`; build it from cart key + method + amount (CD3). Same key + same amount/method/unit = same intent (`reused:true`); otherwise `IDEMPOTENCY_CONFLICT`.
- `paymentIntentStatusAction({…, intentId})` → `{ok:true, status, amountSatang, kind, qrPayload, expiresAt, paidAt, confirmedVia}` (poll every 2 s; a stale PENDING comes back and is stored as `EXPIRED`).
- `confirmPaymentIntentManualAction({…, intentId})` → `{ok:true, intent, idempotent?}` ("ยืนยันเองเมื่อเห็นเงินเข้า").
- `cancelPaymentIntentAction({…, intentId})` → `{ok:true, intent, idempotent?}` (call it when the amount or method changes — CD3).
- `PaymentIntentView = {id, unitId, kind, status, amountSatang, qrPayload, expiresAt (ISO), paidAt (ISO|null), confirmedVia, lateWebhook, deviceId, createdAt}`. `kind`: `PROMPTPAY_STATIC` → show the QR + manual-confirm button · `PROMPTPAY_BEAM` → QR + "รอเงินเข้า… ยืนยันอัตโนมัติผ่าน Beam" · `CARD_BEAM` → `qrPayload` is Beam's hosted card-page URL (render as QR/link).
- Submit: on PAID put `reference: intent.id` on the matching `PROMPTPAY`/`CARD` pay row of `submitRegisterSaleAction` (amount must equal the intent amount). `PosPayment.reference = intentId`, `PosPayment.note = "via WEBHOOK"|"via MANUAL"`.
- Refusal codes — create/confirm/cancel/status: `NOT_FOUND` (scope) · `PERMISSION_DENIED` · `VALIDATION` · `DEVICE_REVOKED` · `IDEMPOTENCY_CONFLICT` · `PROMPTPAY_NOT_CONFIGURED` · `CARD_UNAVAILABLE` (disable the card tile: "Beam ยังไม่เปิดใช้") · `INTENT_NOT_FOUND` · `INTENT_EXPIRED` · `INTENT_CANCELLED` · `INTENT_PAID` · `INTENT_CONSUMED` · `INTERNAL`. Message key: `intentRefusalMessageKey(code)` → key under `pos` (`payment.errors.*` / `register.errors.*`).
- Submit refusals (RegisterRefusal, `refusalMessageKey` → `errors.*` under `pos.register`): `INTENT_NOT_FOUND` · `INTENT_NOT_PAID` · `INTENT_CONSUMED` · `INTENT_EXPIRED` (paidAt > 24 h) · `AMOUNT_MISMATCH` · `VALIDATION` (intent kind ≠ pay type, same intent twice, PROMPTPAY with a non-`pi_` reference).
- Lifecycle: `PENDING` → `PAID` (webhook or manual; outbox `pos.payment.intent_paid {intentId, unitId, amountSatang, via, kind, lateWebhook}`) → `CONSUMED` (+`saleId`, inside the sale tx; no event — `pos.sale.paid` covers it). `PENDING` → `EXPIRED` (hourly cron / status read / manual confirm after expiry) · `PENDING` → `CANCELLED`. A webhook after `EXPIRED` or past `expiresAt` still marks `PAID` with `lateWebhook:true`; a webhook on `CANCELLED` is refused + ops `pos.payment.refund_needed` (ERROR).
- Settings `AppSystem(POS).settings.pos.payment` (no setter in this card; 17A/P1.18): `beam.enabled` (true only when `=== true`, default false) · `qrExpiryMinutes` int 5..60, anything else = 15 · `manualConfirmRequiresManager` (true only when `=== true`; then manual confirm needs `pos.shift.manage`). Parser: `parsePosIntentSettings(settings)`. `updatePosPaymentSettings` (P1.6) keeps `pos.payment` untouched.
- PromptPay ID source (ruling B): `PaymentProfile.promptpayId` (one per shop). Missing/invalid → `PROMPTPAY_NOT_CONFIGURED`.

## Decisions taken (controller may overrule)
- Ruling A: `pi_` reference on CARD = Beam card intent; any other CARD reference = P1.6 EDC path; `CARD_REQUIRES_INTENT` not added.
- Ruling G: (a) kind ≠ pay type → `VALIDATION` in submit; (b) webhook chargeId ≠ `beamChargeId` → ignored + ops WARN `pos.payment.charge_mismatch`; (c) webhook for a `PROMPTPAY_STATIC` intent → ignored + ops WARN `pos.payment.webhook_ignored`.
- Webhook amount: the route's `paidSatang` must equal the intent amount; a missing/zero amount counts as `AMOUNT_MISMATCH` (WARN, status unchanged) — money is never confirmed unverified.
- Beam is called before the row is inserted (the id `pi_…` is generated first, so `referenceId = "pos-"+id` and a failure leaves no row). If two same-key creates race, the loser reads the winner's row (`reused:true`); its extra Beam charge is never shown (no money can arrive on it).
- CARD Beam failure → `CARD_UNAVAILABLE` + ops WARN `pos.payment.beam_card_failed` (no static fallback exists for cards).
- Manual confirm also applies the DEVICE_REVOKED guard when `ctx.deviceId` is given. Cancel of an already EXPIRED/CANCELLED intent = ok (idempotent); CONSUMED → `INTENT_CONSUMED`.
- Audit rows (`pos.payment.manual_confirm`, `pos.payment.cancel`) are written with `tx.auditLog.create` in the same tx as the status change (same pattern as shift/refund/held-cart).
- The intent sale tx: lock intents (sorted, FOR UPDATE) → checks → `createSale(input, tx)` → CONSUMED + `PosPayment.note`; after commit `consumeSaleInventory` (perpetual stock) + `scheduleDrain()` — the same post-commit work `createSale` does when it owns the tx. A same-key race resolves to the winner's bill (`duplicated:true`), a different-key race to `INTENT_CONSUMED`.
- ⚠️ **Beam PromptPay is untested against the real API (no creds).** `beam.ts` sends `paymentMethodType: "QR_PROMPT_PAY"` for `method:"promptpay"` and reads the QR leniently (`qrPayload ?? qr ?? qrCode ?? encodedImage.rawData`); no QR in the response = Beam failure → static fallback + `pos.payment.beam_fallback`. Card calls are byte-identical to before when `method` is omitted (account module unaffected). POS card charges send no `returnUrl` (none known server-side) — check with Beam before enabling.

## Follow-ups (ruling K · for the owner)
- Card MDR fee accounting: the `pos.sale.paid` account consumer books CARD at gross; a Beam fee needs an expense line.
- Beam refunds: P1.8 refunds stay a manual money return; cancelling a Beam intent does not cancel the Beam charge either.
- Report "เงินเข้าไม่มีบิล": PAID intents never consumed within 24 h (and `refund_needed` events).
- Per-branch PromptPay IDs (P1.18 settings) — today one `PaymentProfile.promptpayId` per shop.
- Settings UI for `pos.payment` (17A / P1.18).

## Fix round 1 (reviewer MERGEABLE-AFTER-FIXES on 0fc35040 · controller rulings F1–F5)
- **ORACLE-EDIT C31 (approved)** 08a6fa77: `scripts/qc-pos-p1.7.mts` + 1 check (C31, X4) — `[{TRANSFER 100 ref pi_X},{PROMPTPAY A ref pi_X}]` ⇒ VALIDATION, no bill, pi_X PAID with saleId null; a correct submit consumes it (one PosPayment row, note "via MANUAL"); a second bill ⇒ INTENT_CONSUMED. Oracle notes count 30→31.
  - Positive control: C31 run forced against the pre-fix `register.ts` + `payment-intent.ts` (0fc35040, files restored afterwards) ⇒ exit 1 · 30/31 · C31 red ("TRANSFER pi_: OK บิล 8→9 · PosPayment อ้าง 3"), residue 0.
- **F1** c9797733: (a) `regParseSubmit`: a `pi_…` reference on any type other than PROMPTPAY/CARD ⇒ VALIDATION. (b) The intent tx decides from the sale itself: it takes the same advisory key lock `createSale` uses (re-entrant in one tx), checks whether a sale with this key already exists, then calls `regCreateSale`; new sale ⇒ consume, existing sale (idempotent replay) ⇒ skip. The payment-row count is gone. `consumeSaleIntents` also only stamps notes on PROMPTPAY/CARD rows.
- **F2** 44750808: route `pos-` branch: facade outcome `INTERNAL` ⇒ HTTP 503 (Beam redelivers; confirmation is idempotent). Business refusals and unknown references stay 200, a bad signature stays 401.
- **F3** 256b28eb: `confirmPaymentIntentManual` refuses `CARD_BEAM` with new code `MANUAL_NOT_ALLOWED` (th/en `pos.payment.errors.manualNotAllowed`, `intentRefusalMessageKey`); `PROMPTPAY_BEAM` also needs `pos.shift.manage` (else PERMISSION_DENIED); STATIC unchanged; audit unchanged. Not covered by the oracle (M1–M3 use STATIC intents). The kind is read before the lock (immutable after create); unit/tenant mismatch ⇒ INTENT_NOT_FOUND.
- **F4** 8ef8b8f9: `qc-pos-p1.6` CALL_SITES comment for `register.ts` and the P1.6 oracle notes table now say that `regCreateSale` has two modes (own tx = P1.6 path; caller tx = `regSubmitWithIntents`, with the after-commit `consumeSaleInventory` + `scheduleDrain()` duplicated at the caller). Count unchanged at 18/15.
- **F5**: no code change; the "Beam PromptPay untested against the real API (no creds)" marker above stays.

| gate (final code 8ef8b8f9) | result |
|---|---|
| typecheck (`iso … flock /tmp/pos-gate.lock pnpm typecheck`) | exit 0 |
| `qc-pos-p1.7` QC_FORCE=1 ×2 | exit 0 · 31/31 · residue 0 (both) |
| `qc-pos-p1.7` unforced | exit 0 · 31/31 · residue 0 |
| `qc-pos-p1.6` | exit 0 · 48/48 (U4 18/15) |
| `qc-pos-p1.3` | exit 0 · 128/128 |
| `qc-pos-p1.8` | exit 0 · 49/49 |
| `qc-pos-p1.10` | exit 0 · 40/40 |
| `qc-pos-account` | exit 0 · 16/16 |
| `qc-hf-pos-page-authz` | exit 0 · 56/56 |
| `pnpm fitness` without env / with `qc4.sh` | exit 0 · 41/41 / exit 0 · 41/41 |
| `fitness-pos.mts` | exit 0 · 8/8 (contract unchanged) |
