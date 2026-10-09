# Prompt — P2.1 builder S (`SalesChannel` per unit · `PosSale` channel + commission snapshot · `PosPayType.PLATFORM` · commission JV via the account facade · register server `channelId` · readers · permission · messages). Controller (account A, 9 Oct 15:4xZ): oracle merged into session/pos at e4672cfa (53 checks). Lane 3, tree b. Runs in parallel with P1.18 S (tree c) — shared hot files get the smallest marked hunks; conflicts are paid at merge.

---

You are the BUILDER S for POS work order **P2.1**. Server + actions + migration only — no pages/components (P2.1U). English reports, Thai code comments.

## Read first
- `ledger/pos-briefs/pos-brief-COMMON.md`, `pos-brief-LANE-RULES.md`.
- **`ledger/pos-briefs/pos-brief-P2.1.md`** — whole file; §0 facts, §2 R1–R13, §3 migration, §5 CD1–CD10, **§9 controller rulings** (binding: option A accounts · GP VAT → 1155 · pro-rata refunds, last takes the remainder · no register picker · bills `channel` filter unchanged + `salesChannelId` · P2.8 columns now · REST unchanged · platform contact on AR/AP lines · gift-card bills always STORE).
- **Oracle** `scripts/qc-pos-p2.1.mts` (53 checks) + `ledger/wo-notes/pos-P2.1-oracle.md` — the **Names table** (24 rows) is the contract: model/enums/columns, migration contents, registrations, pure helpers, service/actions, refusal codes, messages, pay-type lists, facade + gl names, JV shapes per account code, register keys, reader DTOs, audits, the register seam comment. Match it exactly. Do NOT edit the oracle (no ORACLE-EDIT is expected; if one is truly needed, stop and report it as CONTROLLER-RUN instead of editing).
- `AGENTS.md` → Next docs before Next code. Memory rules: `"use server"` files export only async functions; `scripts/*.mts` typechecked by `next build`; POS reaches accounting only via `@/lib/modules/account` (facade) — the two new facade functions live in `account/index.ts` + `account/gl.ts`; `createSale` input additive only (F15.2 contract regenerated with `--update-pos-contract`, diff = exactly `channelId?`, `channelRef?`).

## Controller rulings on the oracle's CONTROLLER-DECISION items (1–14)
1. **G9 → yes**: the channel's account contact goes on the AR 1100 line of the PLATFORM sale's PAID entry **and** on the commission entry (per-platform receivable nets for payout matching). DIRECT: contact on the AP line of the commission entry.
2. **Create defaults → accept**: preset codes ⇒ EXTERNAL / PLATFORM / MANUAL; other codes ⇒ CUSTOM / DIRECT / NONE; creating a builtin code ⇒ `CHANNEL_CODE_TAKEN`.
3. **Tip / cash tendered on a PLATFORM bill → `CHANNEL_PAY_MISMATCH`** when the channel check runs; existing validation firing first (`VALIDATION`) is acceptable.
4. **Builtins → accept**: STORE fully locked; other builtins commission/name/active editable, code/kind locked (`CHANNEL_BUILTIN_LOCKED`).
5. **Limit → archived rows count** toward 30.
6. **Other-unit channel id ⇒ `CHANNEL_NOT_FOUND`** (same as other tenant; 404-not-403).
7. **Commission visibility → accept**: `BillDetail.channel.commission*` only for actors with `pos.report.view` (OWNER/MANAGER by role); others get the channel without the figures.
8. **Receipts → accept**: `channel` (null for STORE) on receipt/public receipt, never a commission key or amount.
9. **Refund share → accept** (copy of the sale's channel fields on the REFUND row + own share; completing refund takes the remainder).
10. **Commission entry → accept**: GENERAL book, memo "ค่าคอมฯ ช่องทาง <name> · บิล <receiptNo>", keys `PosSale#<saleId>#COMMISSION` / `PosSale#<refundId>#COMMISSION_REFUNDED`.
11. Audit `actorId` = acting user. Accept.
12. Accept the fixture reading (direct `createSale` for restaurant/hotel/booking sourceModules; real shop confirm for ECOM).
13. **Gift-card-sale bills (`giftCardId`) ⇒ always STORE / commission 0** — implement it in `createSale` resolution even though no check covers it; the reviewer verifies.
14. Legacy bills (`channelId` null) read `defaultChannelCode(sourceModule)` everywhere. Accept.

## Tree
- `/root/projects/shark-pos-b` — own rw node_modules; `.env.qc`/`.env.qc4` = QC4 (`ep-frosty-lab`, neondb_owner — print only the hostname). `git -C /root/projects/shark-pos-b status --short` must be clean (it is on `wip/pos-p2.1-oracle`, merged), then `git -C /root/projects/shark-pos-b fetch origin session/pos && git -C /root/projects/shark-pos-b checkout -B wip/pos-p2.1 origin/session/pos && pnpm exec prisma generate` (inside the tree). Always `git -C /root/projects/shark-pos-b …` / absolute paths.
- Other lanes: P1.18 S on tree c (edits `permissions.ts`, `pos.json`, `register-shared.ts`, `bills*.ts`, `reports.ts`, `shift.ts`, `pos-qc-env.mts` too — keep your hunks minimal and marked `// POS P2.1 ▸ … ◂`), P1.12U visual/build on tree d (port 3228, tenant `posqc-coffee`). Suites may show restore/fingerprint drift from a parallel run — re-run once before calling it red.
- Never touch other worktrees or processes, never `pkill -f`. DB commands: `bash scripts/iso.sh env QC_FORCE=1 bash scripts/qc4.sh env GATE_LOCK_FILE=/tmp/shark-gate-pos.lock bash scripts/with-gate-lock.sh <cmd>`. Typecheck: `env NODE_OPTIONS=--max-old-space-size=5632 ISO_MEM=6500M bash scripts/iso.sh flock -w 3600 /tmp/pos-gate.lock pnpm typecheck`. No build/server/deploy/.env/Telegram. Scratch only under `/tmp/claude-0/-root/ed31d917-ff51-51e8-bfad-e5b8bfa6fa15/scratchpad/p21/` — never a bare file in the scratchpad root. Never run `seed-member-qc`/`seed-hr-qc`/`migrate reset|dev`/`db push`/`migrate resolve`; never wipe QC4.

## Migration (QC4 only, additive — names table row 4)
`prisma/schema/pos.prisma`: `SalesChannel` model + 3 enums + `PosPayType.PLATFORM` + 6 `PosSale` columns. Folder `prisma/migrations/20261203100000_pos_p21_sales_channel/migration.sql` written by hand from a schema-to-schema `prisma migrate diff --script` (never from the DB): `SET lock_timeout` · `ALTER TYPE "PosPayType" ADD VALUE IF NOT EXISTS 'PLATFORM'` (unused in-file, P1.6 pattern) · `CREATE TYPE` ×3 · `CREATE TABLE "SalesChannel"` · unique index `("unitId","code")` + index `("tenantId","systemId","unitId")` · `ALTER TABLE "PosSale" ADD COLUMN` × 6 — nothing else. Read it, `prisma migrate deploy` on QC4 through the wrappers, `pnpm exec prisma generate`. Register `SalesChannel` in `core/scope.ts`; move it from `POS_FUTURE_MODELS` to `POS_MODELS` in `scripts/pos-qc-env.mts`.

## Build order (commit + push `wip/pos-p2.1` after each step; typecheck before each push)
1. Schema + migration + deploy + generate + registrations + `pos.channel.manage`. `qc-pos-p2.1 --no-db`: ST1 green.
2. `pos/channel-shared.ts` (pure: `channelCommission`, `channelRefundShare`, `parseChannelInput`, `defaultChannelCode`, constants, builtin names) · `pos/channel.ts` (`ensureUnitChannels` race-free, `listChannels`, `saveChannel`, `archiveChannel`, audits) · `pos/channel-actions.ts` · refusal codes + `REFUSAL_KEY` + messages th/en (`register.errors.*`, `channel.*`, `shift.method.PLATFORM`, `receipt.public.pay.PLATFORM`). B/C green.
3. `createSale`: `channelId?`/`channelRef?` (R4, CD2 default, CD3 `samePayload` only when passed, R5 PLATFORM rules, R6 snapshot, ruling 13 gift-card ⇒ STORE); pay-type lists learn PLATFORM (names table row 17); contract regenerated. S green.
4. Accounting: facade `applyExternalChannelCommission` + gl `postExternalChannelCommission` (GENERAL book, keys, memo, contact per ruling 1, `ensureAccounting` first, non-VAT book folds VAT into 6500); `applyExternalSale`/`applyExternalRefund` channel union + `PLATFORM` → AR with contact; `channelOf` explicit PLATFORM; `bridgePosSalePaid` calls the commission step after the PAID JV; `refund.ts` copies channel fields + share onto the REFUND row and enforces the refund method rule (`REFUND_METHOD_INVALID`); `refund-consumer.ts` posts `#COMMISSION_REFUNDED` (reverse mode). G/R green. **Money suites must be byte-identical for every non-PLATFORM sale** — run `qc-pos-account`, `qc-account-cpa` after this step.
5. Register server (R10: `REG_QUOTE_KEYS` + `channelId`, held carts, submit `channelRef`, quote result `channel {id, code, name, payout}`, `REGISTER_PAY_TYPES` + PLATFORM per R5, service charge only on STORE/QR_TABLE (CD8), the seam comment `// P2.2 ▸ channel price here ◂`). P green.
6. Readers (R11): bills `salesChannel` + `salesChannelId`, `BillDetail.channel` (ruling 7), `ReceiptPayload.channel`, `PublicReceipt.channel`, shift X/Z PLATFORM non-cash row, payments report + close-day label, legacy fallback. Q/E green. Notes with the P2.1U contract.

After each step: typecheck; `qc-pos-p2.1` forced; suites of what you touched. Before "done": `qc-pos-p2.1` forced ×2 + unforced **53/53**, residue 0; regression per brief §4: `qc-pos-p1.3` 128, `p1.5` 21, `p1.6`, `p1.7`, `p1.8` 49, `p1.9`/`9b`, `p1.10`, `p1.11` 38, `p1.12` 67, `p1.13` 32, `p1.15` 39, `p1.16` 28, `p1.17`, `qc-pos-account` 16, `qc-pos-coupon`, `qc-pos-closeday`, `qc-account-cpa` 107, `qc-restaurant-money` 6, `qc-shop-refund` 12, `qc-hotel-money` 5, `qc-ticket-money` 6, `qc-subscription-money` 14, `qc-hf-pos-page-authz` 56, `pnpm fitness` with/without env, `scripts/fitness-pos.mts` (contract updated), typecheck 0. Every log carries a `tree=/root/projects/shark-pos-b head=<sha>` header under `scratchpad/p21/runs/`.

## Done =
- `ledger/wo-notes/pos-P2.1.md`: migration SQL, per-step results, deviations from the brief with the rule they touch, foreign-module edits (account facade/gl — also append one line to `ledger/POS-OWNER-PENDING.md` under "แจ้งเจ้าของโมดูลบัญชี"), contract summary for P2.1U (actions, DTOs, refusal codes, keys, what the UI must send), follow-ups, gate exit codes.
- Last push of `wip/pos-p2.1`; report ≤25 lines with the head SHA. Do not merge, do not touch `session/pos` or `main`.
Commit trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
