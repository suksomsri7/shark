# Prompt — P1.7 builder S (server half: payment intents · PromptPay dynamic · Beam · webhook · consume in sale). Controller: oracle `3ac74097` merged into `session/pos`; base = `origin/wip/pos-p1.7-oracle`. Lane 4.

---

You are the BUILDER S for POS work order **P1.7**. Server + migration + actions + route hunk only — **no UI** (the PromptPay panel of mockup 02 is P1.7U after P1.10U lands). English reports, Thai code comments. Reply compact.

## Read first
- `ledger/pos-briefs/pos-brief-COMMON.md`, `pos-brief-LANE-RULES.md` (DB commands with `env GATE_LOCK_FILE=/tmp/shark-gate-pos.lock` after `bash scripts/qc4.sh`).
- `ledger/pos-briefs/pos-brief-P1.7.md` — §2 R1–R8, §5 CD1–CD6 **as amended by the rulings below**.
- Oracle `scripts/qc-pos-p1.7.mts` (30 checks) + `ledger/wo-notes/pos-P1.7-oracle.md` (names table incl. the fake Beam adapter contract `deps.beam = { enabled(), createCharge(...) }`, fixture layout, drift list: PROMPTPAY rejects `reference` today, `createSale` payments have no `note` field — follow the oracle). Do NOT edit the oracle; report `ORACLE-EDIT?` with the id if a check is impossible as written.
- Code to build on: `src/lib/payment/promptpay.ts`, `src/lib/payment/beam.ts`, `src/lib/modules/account/payment-request.ts` (pattern only — do not import account internals), `src/app/api/payment/beam/webhook/route.ts`, `src/app/api/cron/hourly/route.ts` (P1.9 force-close), `register.ts#submitRegisterSale`, P1.6 payments (`qc-pos-p1.6` must stay green). `AGENTS.md` → Next docs before Next code. Memory rules: `"use server"` files export only async functions; no `'use client'` file imports a module reaching prisma; `scripts/*.mts` are typechecked by `next build`.

## Controller rulings on CONTROLLER-DECISION A–K + 12 (binding)
| # | Ruling |
|---|--------|
| A | ▶ oracle proposal: a `pi_` reference on CARD = Beam card intent (must be PAID etc.); any other reference = P1.6 EDC path unchanged. **Drop `CARD_REQUIRES_INTENT`.** |
| B | ▶ `PaymentProfile.promptpayId` (one per shop, legacy parity). No channel fallback in this card (note it as follow-up: per-branch IDs in P1.18 settings). |
| C | ▶ extend `beam.ts` additively: optional `method: "card"\|"promptpay"` input (default card = today's behaviour), and read a QR payload field leniently from the response (`qrPayload ?? qr ?? qrCode ?? null`); when Beam returns no QR for promptpay ⇒ treat as Beam failure ⇒ STATIC fallback + ops event. Mark "Beam PromptPay untested against the real API (no creds)" in the notes for the owner. |
| D | ▶ stand (route exercised with fake env inside the oracle only). |
| E | ▶ stand (`paymentIntentStatus` writes EXPIRED with the guarded update). |
| F | ▶ stand (24 h consume window for every PAID intent ⇒ `INTENT_EXPIRED`). |
| G | ▶ refuse all: (a) kind ≠ pay type ⇒ `VALIDATION`; (b) webhook chargeId ≠ `beamChargeId` ⇒ ignore + ops WARN; (c) webhook for a STATIC intent ⇒ ignore + ops WARN. |
| H | ▶ stand (parser defaults; `updatePosPaymentSettings` keeps `pos.payment`). |
| I | ▶ do it: after the sale tx commits in `register.ts`, call `scheduleDrain()` (same helper `createSale` uses) so `pos.sale.paid` consumers run without waiting for cron. |
| J | ▶ stand (ops naming via `logOps`; amount_mismatch WARN; refund_needed ERROR). |
| K | ▶ follow-ups for the owner: card MDR fee accounting, Beam refunds, "เงินเข้าไม่มีบิล" report — write them in the notes. |
| 12 | ▶ stand: `src/app/api/cron/hourly/route.ts` also calls `expirePaymentIntents()` (one-line hunk). |

## Tree
- `/root/projects/shark-pos-d` — own read-write node_modules copy (`prisma generate` here affects nobody); HEAD on `wip/pos-p1.7-oracle`. `.env.qc`/`.env.qc4` = QC4 `ep-frosty-lab`, neondb_owner — print only the hostname. Run `git status --short` (must be clean), then `git fetch origin wip/pos-p1.7-oracle && git checkout -b wip/pos-p1.7 origin/wip/pos-p1.7-oracle`.
- Other lanes share QC4 (P1.11 in tree c, P1.15 in tree b — their migrations may already be applied on QC4: `20261129000000_pos_p111_online_receipt` and a `_pos_p115_*` folder; that is expected). Never wipe QC4, never run `seed-*`, never touch other trees/processes, never `pkill -f`. Suites via `systemd-run --no-block --unit=pos-p17s-<n> -p Type=oneshot -p RemainAfterExit=yes /usr/bin/bash <script>` with a log and polling (never block a shell > 10 min). Typecheck: `env NODE_OPTIONS=--max-old-space-size=5632 ISO_MEM=6500M bash scripts/iso.sh flock -w 7200 /tmp/pos-gate.lock pnpm typecheck` (shared with lane 1's builds; at most 3× per work order). No build/server/deploy/.env/Telegram; never print Beam env values.

## Migration (QC4 only, additive — CD5)
`PosPaymentIntent` exactly as the oracle names its fields; no enum change needed (CARD exists). Folder `prisma/migrations/<timestamp>_pos_p17_payment_intent/migration.sql` from `prisma migrate diff --from-schema-datamodel <copy of the pre-P1.7 schema dir> --to-schema-datamodel prisma/schema --script` (never from the database). Read it: CREATE TABLE / CREATE INDEX / CREATE UNIQUE INDEX only. `prisma migrate deploy` on QC4 through the wrappers (if deploy reports a pending folder that is not yours and not one of the other lanes' listed above, STOP and report); then `pnpm exec prisma generate`. Register in `core/scope.ts` + `scripts/pos-qc-env.mts`. ⛔ Never `migrate dev|reset|resolve`, `db push`.

## Build order (commit + push `wip/pos-p1.7` after each step; typecheck before each push)
1. Settings parser `pos.payment` (H) + `payment-intent.ts`: `createPaymentIntent` (R2: static EMV via `promptpayPayload` from `PaymentProfile.promptpayId`; Beam via injectable `deps.beam`; fallback + ops event; idempotency; expiry), `paymentIntentStatus` (E), `expirePaymentIntents` (R5), `cancelPaymentIntent` (R3c), `markIntentPaid` (R3a) + `payment-intent-actions.ts`.
2. `beam.ts` additive extension (C) + webhook facade `payment-webhook.ts#onBeamWebhookEvent` + the `pos-` branch in the route (smallest hunk) + manual confirm (R3b, audit).
3. Consume in `submitRegisterSale` (R4 + A + G): `pi_` reference ⇒ lock intent FOR UPDATE in the sale tx, checks, CONSUMED + saleId, `PosPayment.reference = intentId`; `scheduleDrain()` after commit (I); P1.6 path unchanged.
4. Outbox `pos.payment.intent_paid` + no-op consumer registration; hourly cron hunk (12).
5. Message keys `pos.payment.errors.*` th+en + `refusalMessageKey`; notes.

After each step: typecheck; `qc-pos-p1.7` forced; suites you touched (`qc-pos-p1.6`, `qc-pos-p1.3`, `qc-pos-p1.9`, `qc-pos-account`).
Before "done": `qc-pos-p1.7` forced ×2 + unforced, residue 0; `qc-pos-p1.3/p1.5/p1.6/p1.8/p1.9/p1.10/p1.11/p1.16`, `qc-hf-pos-page-authz`, `qc-nav-functions`, money set COMMON §7 unchanged; `pnpm fitness` ×2; `scripts/fitness-pos.mts` (`--update-pos-contract` if the sale contract changes — report the diff); typecheck 0.

## Done =
- Gates green with exit codes in `ledger/wo-notes/pos-P1.7.md` (migration SQL summary, per-step results, contract summary for P1.7U: action names, input/result shapes, refusal codes, intent lifecycle, settings keys, follow-ups K).
- Last push of `wip/pos-p1.7`; report ≤25 lines with the head SHA. Do not merge, do not touch `session/pos` or `main`.
