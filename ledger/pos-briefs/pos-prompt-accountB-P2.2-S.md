# Prompt — P2.2 builder S (ราคาตามช่องทาง/สาขา `PosProductChannelPrice` · `PosPriceRule` happy hour/promo · pure resolver `price-shared.ts` · register seam/catalog/quote/submit · held-cart `:292` fix · createSale 3 optional line fields · bills readers · `bulkChannelMarkup` · permission `pos.price.rule` · messages). Controller (account A, 9 Oct 22:2xZ): oracle merged into `session/pos` at **b3c3fbf5** (42 checks, `scripts/qc-pos-p2.2.mts` + `ledger/wo-notes/pos-P2.2-oracle.md`). Lane 3, tree **c**. Parallel lanes: P2.3 oracle writer (tree p11, scripts only) and the P2.1U review/visual (tree b/d) — no other builder touches `register.ts`/`catalog.ts`/`service.ts`/`pos.json` right now, but keep hunks marked `// POS P2.2 ▸ … ◂` anyway.

---

You are the BUILDER S for POS work order **P2.2**. Server + actions + migration only — no pages/components (P2.2U). English reports, Thai code comments.

## Read first
- `ledger/pos-briefs/pos-brief-COMMON.md`, `pos-brief-LANE-RULES.md`.
- **`ledger/pos-briefs/pos-brief-P2.2.md`** — whole file; §0 facts, §2 R1–R12, §3 migration, §5 CD1–CD10, **§9 controller rulings Q1–Q10 + build order 1–6** (binding).
- **Oracle** `scripts/qc-pos-p2.2.mts` (42 checks) + `ledger/wo-notes/pos-P2.2-oracle.md` — the **names table** is the contract (models/columns/enums, migration contents, registrations, `price-shared.ts` exports and signatures, `resolvePrices`, catalog writers, `price-rule.ts` + actions, refusal codes + th messages, register quote/catalog fields, createSale line fields, reader DTOs, audits, message keys). Match it exactly. Its 14 **CONTROLLER-DECISION** items are ruled below.
- `AGENTS.md` → Next docs before Next code. Memory rules: `"use server"` files export only async functions; `'use client'` would import only `price-shared.ts` (U); `scripts/*.mts` typechecked by `next build`; `createSale` input additive only (F15.2 contract regenerated with `--update-pos-contract`, diff = exactly the 3 optional line fields `priceSource?`, `priceRuleId?`, `listPriceSatang?`); migrations additive and hand-written from a schema-to-schema diff; refusals `{ok:false, code, message(th)}` or the file's house style; th + en keys.

## Controller rulings on the oracle's CONTROLLER-DECISION items (binding)
1. **Keep the existing `NOT_FOUND`** in `CatalogErrorCode` (house style; do not widen the union). **ORACLE-EDIT** C3 in its own commit `test(pos P2.2): ORACLE-EDIT C3 — catalog NOT_FOUND (controller ruling 1)`, count unchanged (42). No other oracle edit; anything else ⇒ stop and report CONTROLLER-RUN.
2. Accept (`listPriceSatang` = step-② list price without option deltas; `null` for OPEN/CUSTOM/WEIGHED).
3. Accept (variant own row beats parent at the same level; rules match product or parent; category falls back to the parent's).
4. Accept (notSold branch row wins only without a channel row; never rescued by a rule).
5. Accept (single rounding; 115 × 3 000 bp roundTo 100 ⇒ 100; upsert only the (code, unit) row; one audit per product written; input shape as stated).
6. **Implement**: a full replace that removes rows needs the row scope of the removed rows (a unit-A manager cannot delete an all-branch row ⇒ `PERMISSION_DENIED`, nothing written). No new check; note it.
7. Accept (exact input keys; 18-key result DTO with ISO dates).
8. Accept (`pos.price.rule` at every unit in `unitIds`, or every linked unit when empty; archive same).
9. Accept (limit counts inactive, not archived).
10. Accept (tile fields; `priceValidUntil`).
11. Accept (`listForUnit.channelPrices` scope and shape).
12. Accept (`VALIDATION` on bad snapshot fields; replay returns the original bill; fields not in `samePayload`).
13. Accept (the fix must reference `cart.channelId` in `held-cart.ts`).
14. Accept (REFUND rows keep the 3 columns `null`).
Time gate of the suite (skips 23:40–23:59 Bangkok) accepted — plan your runs around it.

## Tree
- `/root/projects/shark-pos-c` — own rw node_modules; `.env.qc`/`.env.qc4` = QC4 (`ep-frosty-lab`, neondb_owner — print only the hostname). `git -C /root/projects/shark-pos-c status --short` must be clean (it is on `wip/pos-p2.2-oracle`, cherry-picked onto session/pos), then `git -C /root/projects/shark-pos-c fetch origin session/pos && git -C /root/projects/shark-pos-c checkout -B wip/pos-p2.2 origin/session/pos && pnpm exec prisma generate` (inside the tree). Always `git -C /root/projects/shark-pos-c …` / absolute paths.
- Never touch other worktrees or processes, never `pkill -f`. DB commands: `bash scripts/iso.sh env QC_FORCE=1 bash scripts/qc4.sh env GATE_LOCK_FILE=/tmp/shark-gate-pos.lock bash scripts/with-gate-lock.sh <cmd>`. Typecheck: `env NODE_OPTIONS=--max-old-space-size=5632 ISO_MEM=6500M bash scripts/iso.sh flock -w 3600 /tmp/pos-gate.lock pnpm typecheck`. No build/server/deploy/.env/Telegram. Scratch only under `/tmp/claude-0/-root/ed31d917-ff51-51e8-bfad-e5b8bfa6fa15/scratchpad/p22/` — never a bare file in the scratchpad root. Never run `seed-member-qc`/`seed-hr-qc`/`migrate reset|dev`/`db push`/`migrate resolve`; never wipe QC4. Other lanes run suites/visuals on `posqc-coffee` — re-run once before calling a suite red.

## Migration (QC4 only, additive — names table)
`prisma/schema/pos.prisma`: `PosProductChannelPrice` (moved from future), `PosPriceRule`, 3 enums, 3 nullable `PosSaleLine` columns. Folder `prisma/migrations/20261204100000_pos_p22_prices/migration.sql` written by hand from a schema-to-schema `prisma migrate diff --script` (never from the DB): `SET lock_timeout` · `CREATE TYPE` ×3 · 2 `CREATE TABLE` with the CHECK and the hand-written `NULLS NOT DISTINCT` unique index · indexes · `ALTER TABLE "PosSaleLine" ADD COLUMN` ×3 — nothing else (ST checks pin it). `prisma migrate deploy` on QC4 through the wrappers, `pnpm exec prisma generate`. Register both tables in `core/scope.ts`; `pos-qc-env.mts` per the names table; `pos.price.rule` in the permission catalogue.

## Build order (commit + push `wip/pos-p2.2` after each step; typecheck before each push)
1. Schema + migration + deploy + generate + registrations + `pos.price.rule` + `pos/price-shared.ts` pure resolver (precedence, variant lookup, PERCENT/AMOUNT/PRICE math, Bangkok windows, tie-break, bulk rounding). ST + B green.
2. `catalog.setChannelPrices` + `bulkChannelMarkup` + `listForUnit.channelPrices` (+ ruling 6). C green.
3. `pos/price-rule.ts` + `price-rule-actions.ts` + permission checks + audits. P green. `git merge origin/session/pos` here.
4. Register seam (`regPrice` resolves through the resolver at the P2.1 seam — keep the seam comment text), catalog tiles (`listPriceSatang`, `priceSource`, `priceRule`, `priceValidUntil`), quote/submit (`CHANNEL_NOT_SOLD`, `PRICE_CHANGED` flow, tier/coupon on the rule price), `held-cart.ts:292` fix (`cart.channelId` to the probe). Q + H green (H2 red before the fix — keep that log).
5. `createSale` 3 line fields + `VALIDATION` + contract regen (`--update-pos-contract`) + bills readers (R11 source) + `pos/index.ts` resolver export. S + R green.
6. Messages th/en (`pos.price.*`, `register.errors.CHANNEL_NOT_SOLD`, …), `MARKETING.happyHourPricing` stays false, notes `ledger/wo-notes/pos-P2.2.md` with the P2.2U contract (06 drawer tab ราคาตามช่องทาง, rule list/editor, bills source badge) and follow-ups.

After each step: typecheck; `qc-pos-p2.2` forced; suites of what you touched. Before "done": `qc-pos-p2.2` forced ×2 + unforced **42/42**, residue 0; regression: `qc-pos-p2.1` 55, `qc-pos-p1.12` 67, `qc-pos-p1.3` 128, `qc-pos-p1.5` 21, `qc-pos-p1.8` 49, `qc-pos-p1.2`, `qc-pos-p1.15` 39, `qc-pos-p1.13` 33, `qc-pos-p1.16` 28, `qc-pos-p1.17` 40, `qc-pos-p1.18` 81 (ST7 0), `qc-pos-account` 16, `qc-account-cpa` 107, `qc-shop-refund` 12, `qc-restaurant-money` 6, `qc-hotel-money` 5, `qc-ticket-money` 6, `qc-subscription-money` 14, `qc-hf-pos-page-authz` 56, `pnpm fitness` with/without env, `scripts/fitness-pos.mts` (contract updated: exactly the 3 optional line fields), typecheck 0. Every log carries a `tree=/root/projects/shark-pos-c head=<sha>` header under `scratchpad/p22/runs/`.

## Done =
Notes `ledger/wo-notes/pos-P2.2.md` (migration SQL, per-step results, deviations with the rule touched, the ORACLE-EDIT C3 commit, P2.2U contract, follow-ups, gate exit codes) · push `wip/pos-p2.2` · report ≤20 lines with the head SHA. Do not merge, do not touch `session/pos`/`main`/other trees.
Commit trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
