# Prompt — P1.7 reviewer S (read-only). Controller: head under review = `wip/pos-p1.7` 0fc35040 (builder steps 2b3b1bff…0fc35040; base = oracle 3ac74097 over session/pos).

---

You are the REVIEWER for POS work order **P1.7 (server half)**: `PosPaymentIntent` (dynamic PromptPay static-EMV fallback · Beam PromptPay/card) · Beam webhook facade · manual confirm · intent consumption inside `submitRegisterSale` · expiry cron · migration. Read-only: no edits/commits/DB/build/servers/`.env*`/network. English, ≤ 60 lines.

## Read first
- `ledger/pos-briefs/pos-brief-P1.7.md` (R1–R6, CD A–K + 12) and `pos-prompt-accountB-P1.7-S.md` (controller rulings — binding: `pi_` reference on CARD = Beam, EDC path unchanged, no `CARD_REQUIRES_INTENT`; `PaymentProfile.promptpayId`; `beam.ts` additive `method` + lenient QR field marked untested; refuse G a/b/c; `scheduleDrain()` after commit; hourly cron calls `expirePaymentIntents`).
- `ledger/wo-notes/pos-P1.7-oracle.md` and builder notes `ledger/wo-notes/pos-P1.7.md` (`git show 0fc35040:…`).
- Oracle `scripts/qc-pos-p1.7.mts` (30 checks; builder reports 30/30 ×2 forced + unforced).
- `src/lib/payment/beam.ts`, the Beam webhook route (`src/app/api/payment/beam/webhook/route.ts`), `register.ts` (`submitRegisterSale`, new `regCreateSale` helper), `payment-intent.ts`, `payment-intent-shared.ts`, `payment-webhook.ts`, the cron route, `outbox-consumers.ts`.
- Next 16.2 rules (`node_modules/next/dist/docs/`); memory rules: `"use server"` exports only async functions; no client import reaching prisma (`payment-intent-shared.ts` must be prisma-free); `scripts/*.mts` typechecked by `next build`.

## Tree
`/root/projects/shark-pos-d` is the builder's tree — read via `git show <sha>:<path>` / `git diff 3ac74097..0fc35040` only. No checkout, pnpm, prisma, DB, servers, `git worktree`, no network.

## Verify (cite file:line)
1. **Money safety**: an intent is PAID only from (a) a webhook whose signature verifies **and** whose amount equals `amountSatang` exactly (missing/zero ⇒ `AMOUNT_MISMATCH` — builder decision, judge), or (b) manual confirm by a permitted user with audit. Consumption in the sale tx: `FOR UPDATE`, status PAID, same tenant/unit, amount = the CASH-less payment line amount, not expired, not already CONSUMED (double-use concrete input); after consume `CONSUMED + saleId`. A sale that fails after the lock leaves the intent PAID (rollback) — confirm.
2. **Webhook**: existing (non-`pos-`) branch byte-for-byte unchanged; `pos-` branch never throws (always 200 after verify? what on signature failure?); idempotent on redelivery; unknown intent ⇒ logged, no 500; no PII in logs.
3. **beam.ts**: additive only — card calls without `method` behave exactly as before (diff of the old path); QR field leniency can't mis-parse a card response into a QR; untested paths marked in notes.
4. **PromptPay static EMV** (R2): `promptpayPayload` from `PaymentProfile.promptpayId`, CRC correct (compute one example by hand from the oracle fixture), amount in baht with 2 decimals.
5. **Expiry / cancel**: `expirePaymentIntents` only moves PENDING → EXPIRED past `expiresAt`; cannot touch PAID/CONSUMED; cron hunk minimal; cancel refuses PAID.
6. **Revoked device** on manual confirm (builder addition) — consistent with P1.10 guards?
7. **Outbox**: `pos.payment.intent_paid` emitted inside the tx; no-op consumer registered via one hunk with `withAutomation`; `scheduleDrain()` after commit, not inside.
8. **Migration**: one table + 3 indexes, additive; `scope.ts` + `pos-qc-env.mts` registration; the comment reword on `pos-qc-env.mts:99` harmless.
9. **Messages**: `pos.payment.errors.*` th+en complete for every refusal code in the contract; `refusalMessageKey` mapping.
10. **Gates**: notes' exit codes consistent; `qc-pos-p1.6` U4 caller registry 18 still truthful (the helper isn't hiding a second call path that bypasses checks).

## Report format
Verdict first (`MERGEABLE` | `MERGEABLE-AFTER-FIXES` | `BLOCKED`), findings F1..Fn (severity, file:line, concrete input → wrong outcome, fix), "Verified OK" list, follow-ups for P1.7U/controller/owner (Beam keys).
