# Prompt — P1.8 builder S · FIX round 1 (reviewer verdict MERGEABLE-AFTER-FIXES). Controller rulings inline.

---

You are the BUILDER S for POS work order **P1.8**, fix round 1. The reviewer (read-only Opus, money lane) returned MERGEABLE-AFTER-FIXES on `wip/pos-p1.8` @ 7bbeb3fc. Apply the fixes below exactly as ruled. English reports, Thai code comments. Server only.

## Read first (fast)
- `ledger/pos-briefs/pos-prompt-accountB-P1.8-S.md` (original prompt — all tree/DB/typecheck rules still apply), `ledger/pos-briefs/pos-brief-P1.8.md` §2 R3/R5/R6/R7, `ledger/wo-notes/pos-P1.8.md` (your notes), oracle `scripts/qc-pos-p1.8.mts` (do NOT edit; report `ORACLE-EDIT?` with the check id if a ruling collides with a check).
- Tree `/root/projects/shark-pos-p11` (own rw node_modules, QC4 `ep-frosty-lab`). It is currently detached at a scratch merge commit b0e5718d — run `git status --short` (must be clean), then `git checkout wip/pos-p1.8 && git pull --ff-only origin wip/pos-p1.8` (head 7bbeb3fc) and `pnpm exec prisma generate` in this tree. No schema/migration changes (frozen). Never touch other trees, never `pkill -f`, no build/server/deploy/.env/Telegram. Do not run `qc-pos-p1.10`.
- DB: `bash scripts/iso.sh env QC_FORCE=1 bash scripts/qc4.sh bash scripts/with-gate-lock.sh <cmd>`. Typecheck: `env NODE_OPTIONS=--max-old-space-size=5632 ISO_MEM=6500M bash scripts/iso.sh flock -w 3600 /tmp/pos-gate.lock pnpm typecheck`. Never `/tmp/shark-gate.lock`.

## Fixes (controller rulings)
F1 (MAJOR, bills of other modules) — RULING amends R5: `refundSale`/`saleForRefund` refuse `sale.sourceModule !== "POS"` with `SALE_NOT_REFUNDABLE` (same code; the message key may stay generic). Hotel/ticket/booking/shop/… keep their own module refund flows + `voidSale`. Note in the P1.16 contract. (Oracle bills are `sourceModule: "POS"` — verify, stays green.)
F2 (MAJOR, `src/lib/ai/tools.ts` counts REFUND docs as sales — lines ~114, 244, 282, 1728, 1818) — controller exception for the CRM-hot file: SMALLEST hunks only — add `docType: "SALE"` to each `posSale` where that filters `status: "PAID"`; do NOT net out `refundedSatang` there (gross sales is the pre-P1.8 meaning; netting = follow-up). Keep the diff to those where-clauses.
F3 (MAJOR, `member/tiers.ts` `collectEvidence` ~476-509) — select `refundedSatang` and use `grandTotalSatang − refundedSatang` in BOTH loops (12-month and per-window). Refund docs already carry `memberId: null`, so no docType filter is needed there — say so in the notes. `sources.ts:781`, `referrals.ts:838/945`, `journeys.ts:1392` = follow-ups only (reports).
F4 (MAJOR, ฿0 refund impossible) — `cleanInput`: accept `payMethods: []` (and skip the ≥1-satang rule) ONLY when the computed refund `grand === 0`; otherwise rules unchanged. The refund document then has no payment rows, outbox payload `payMethods: []`. Make sure the full-refund path (status → REFUNDED, coupon release, points remainder) runs for a ฿0 completing refund.
F5 (MINOR, `refund-math.ts refundLineAmount`) — cap partials: `Math.min(halfUpDiv(...), Math.max(0, net − prevAmount))`.
F6 (MINOR, VAT remainder) — the refund that completes the bill (`full === true`) takes `vat = sale.vatSatang − Σ vatSatang of earlier REFUND docs of this bill` (never negative). Partial refunds keep the current-rate split. Revenue 4000/4030 split residue = document next to your follow-up F8 (no code).
F7 (MINOR, shared idempotency-key space) — do NOT prefix keys (oracle expects a refund sent with a sale's key → `IDEMPOTENCY_CONFLICT`). Instead: in `createSaleOnce` (`service.ts` ~357-372) and `regDuplicate` (`register.ts`), an existing row with `docType === "REFUND"` ⇒ `IDEMPOTENCY_CONFLICT` (never returned as the sale). Mirror: refund duplicate lookup accepts only `docType === "REFUND"` rows as a replay.
F8 (MINOR, `refund-consumer.ts` step 1) — re-post the original sale ONLY when `pos.sale.paid` actually skipped it (use the same `alreadyPosted("PosSale#<saleId>#PAID")`-style check the sale bridge uses); never let that pre-step block the refund posting (wrap it, log, continue). When the credit-note document returns `ok:false` (and reason ≠ "unlinked"), THROW so the outbox retries instead of warning.
F9 (MINOR, stock return location/lot) — pass the original OUT movement's `locationId`/`lotCode` to the inventory return so multi-warehouse stock doesn't drift. Member-step failure stays warn-only (matches the sale side) — one line in the notes.
Reviewer-confirmed follow-ups to add (owner rulings needed): gift-card share on partial refund under-refunds (your F6); `sources/referrals/journeys` gross-only; AI tools net-of-refund.

## Gates before "done"
typecheck 0 · `qc-pos-p1.8` forced ×2 + unforced green (49/49), no residue · money set COMMON §7 (`qc-pos-account`, `qc-account-cpa`, `qc-restaurant-money`, `qc-shop-refund`, `qc-hotel-money`, `qc-ticket-money`, `qc-subscription-money`) identical to before · `qc-pos-p1.3`, `p1.6`, `p1.9`, `p1.9b`, `p1.14`, `p1.17`, `p1.1` unchanged · `qc-hf-pos-page-authz` · `pnpm fitness` (with and without .env) · `scripts/fitness-pos.mts` · one member suite that covers tiers (`qc-member-m*` with tier evaluation — find it; read its header first: never a suite that hits prod). If a ruling collides with an oracle check, stop and report `ORACLE-EDIT?` with the check id + exact assertion.

## Done =
- Commits on `wip/pos-p1.8` (one per fix group is fine), typecheck before each push, last push done.
- `ledger/wo-notes/pos-P1.8.md`: new section "Fix round 1" — per-fix one line + gate lines with exit codes, contract additions for P1.16 (POS-only refunds, ฿0 refunds with `payMethods: []`, VAT remainder rule), follow-ups list updated.
- Report ≤20 lines with the head SHA. Do not merge, do not touch `session/pos` or `main`.
