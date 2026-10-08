# Prompt — P1.11 builder S (server half: token · public read · issue · tax-invoice request · review · send). Controller: oracle `fa643e0e` merged into `session/pos`; base = `origin/wip/pos-p1.11-oracle` (identical content). Lane 2.

---

You are the BUILDER S for POS work order **P1.11**. Server + migration + actions + consumers only — **no UI** (the U half starts after P1.10U is merged, because it touches PayDone/bills/settings). English reports, Thai code comments. Reply compact.

## Read first
- `ledger/pos-briefs/pos-brief-COMMON.md`, `pos-brief-LANE-RULES.md`.
- `ledger/pos-briefs/pos-brief-P1.11.md` — whole file; §2 R1–R9 and §5 CD1–CD6 are binding, **as amended by the rulings below**.
- Oracle `scripts/qc-pos-p1.11.mts` (38 checks) + `ledger/wo-notes/pos-P1.11-oracle.md` (names table — use every name exactly; fixture layout; drift list). Do NOT edit the oracle; report `ORACLE-EDIT?` with the check id if a check is impossible as written.
- Contracts: `ledger/wo-notes/pos-P1.10.md`, `pos-P1.8.md`, `pos-P1.16.md`. `AGENTS.md` → Next docs before Next code. Memory rules: `"use server"` files export only async functions; no `'use client'` file may import a module reaching prisma; `scripts/*.mts` are typechecked by `next build`.

## Controller rulings on the oracle's CONTROLLER-DECISION 1–11 (binding)
| # | Ruling |
|---|--------|
| 1 | ▶ stand. Composition-root file `src/lib/pos-receipt-bridges.ts` holds `onReceiptIssueReported(evt)` (board lookup → `kanban/links.createCardFromExternal` → `sendLineToParty` ack → write `PosReceiptIssue.kanbanCardId`) and the real LINE sender injected into `sendReceipt(…, { deps })` by `sendReceiptAction`. Register the consumer in `outbox-consumers.ts` with one line (`withAutomation`, dynamic import). No new fitness edges. |
| 2 | ▶ stand. `sendReceipt(ctx, actor, input, opts?: { deps?: { line?, fetch? } })`. |
| 3 | ▶ (b): add additive `code?: "NO_LINE_IDENTITY"` to `SendLineToPartyResult` in `chat/party-bridge.ts`, set it where the constant reason is returned. Smallest hunk; no other chat change. |
| 4 | ▶ stand. `receiptPayload` calls `ensureReceiptToken` for a token-less bill when `qrEReceipt` is on (idempotent single UPDATE, same transaction client). |
| 5 | ▶ stand, **no fallback**. Add `issueBoardId?: string \| null` to `parseReceiptSettings` (additive key, default null; keep every existing key/default unchanged — `qc-pos-p1.10` must stay 40/40). No board ⇒ `{ posted:false, reason:"no-board" }`. |
| 6 | ▶ reuse `AUTOMATION` as `sourceType`; `sourceKey = "pos-receipt-issue:<issueId>"`; title contains the receipt no. No enum migration. |
| 7 | ▶ stand (direct-call return + event DONE). Additionally `writeAudit("pos.receipt.issue_reported", { issueId, saleId })` when the row is created — audit only, the oracle does not check it. |
| 8 | ▶ stand. Add `submitReviewForRef(ctx, { customerId, refType, refId, rating, body })` to `member/index.ts`, composed of existing internals (REQUESTED row → same row submitted; none → create+submit). No other member change. |
| 9 | ▶ stand. Unknown keys ⇒ `VALIDATION`; public writes never read ids from the client. |
| 10 | ▶ stand. `PERMISSION_DENIED`. |
| 11 | ▶ use `point.getBalance(resolvePointSystemIds(...)[0], memberId)` in `publicReceipt`; leave `receipt.ts` as is. |
Drift notes in the oracle: follow the oracle (event names literal; `blockedAt`).

## Tree
- `/root/projects/shark-pos-c` — own read-write node_modules (`pnpm exec prisma generate` here affects nobody). `.env.qc`/`.env.qc4` = QC4 `ep-frosty-lab`, neondb_owner — print only the hostname. Run `git status --short` (must be clean), then `git fetch origin wip/pos-p1.11-oracle && git checkout -b wip/pos-p1.11 origin/wip/pos-p1.11-oracle`.
- Lane 1 (P1.10U) is being accepted on `shark-pos-p11` using the same QC4 (its suites use `posqc-*`/QC shop fixtures; yours use the temp tenant `qc-p111-*`). Do not run `qc-pos-p1.10u-print`/visual scripts, never wipe QC4, never touch other trees or processes, never `pkill -f`. Other sessions share the QC4 gate lock today — a suite may queue up to 30 min: run suites via `systemd-run --no-block --unit=pos-p111s-<n> -p Type=oneshot -p RemainAfterExit=yes /usr/bin/bash <script>` writing a log and poll it; never block a shell > 10 min.
- DB commands: `bash scripts/iso.sh env QC_FORCE=1 bash scripts/qc4.sh bash scripts/with-gate-lock.sh <cmd>`. Typecheck: `env NODE_OPTIONS=--max-old-space-size=5632 ISO_MEM=6500M bash scripts/iso.sh flock -w 7200 /tmp/pos-gate.lock pnpm typecheck` (the pos-gate lock is also used by lane 1's build — expect waits; never `/tmp/shark-gate.lock`). No build/server/deploy/.env/Telegram.

## Migration (QC4 only, additive — CD5)
1. `prisma/schema/pos.prisma`: `PosSale.publicToken String? @unique`; models `PosReceiptIssue` and `PosTaxInvoiceRequest` exactly as the oracle names their fields (+ enums if the oracle expects string statuses, use `String` with defaults — check the names table). Register both in `core/scope.ts` and `scripts/pos-qc-env.mts` present list.
2. Migration folder `prisma/migrations/<timestamp>_pos_p111_online_receipt/migration.sql` written from `prisma migrate diff --from-schema-datamodel <copy of the pre-P1.11 schema dir> --to-schema-datamodel prisma/schema --script` (never from the database — other lanes' objects live there). Read it: ADD COLUMN (nullable) / CREATE UNIQUE INDEX / CREATE TABLE / CREATE INDEX only. `prisma migrate deploy` on QC4 through the wrappers; if deploy reports a pending folder that is not yours, STOP and report. Then `pnpm exec prisma generate`.
⛔ Never `migrate dev`, `migrate reset`, `db push`, `migrate resolve`.

## Build order (commit + push `wip/pos-p1.11` after each step; typecheck before each push)
1. Token: `ensureReceiptToken`, `createSale` sets `publicToken` in-tx (both docTypes), `receiptPayload.footer.qrEReceiptUrl` via `core/origin.ts` (R3 + ruling 4). `scripts/fitness-pos.mts --update-pos-contract` if the sale contract changes (report the diff).
2. `public-receipt.ts` `publicReceipt(token)` (R2, no PII, statuses, points via ruling 11) + `public-receipt-actions.ts` (public server actions taking the token only: `publicReceiptAction`, `reportReceiptIssueAction`, `requestFullTaxInvoiceAction`, `submitReceiptReviewAction`).
3. `receipt-issue.ts` (R4 + rate limit by rows) + bridge consumer (ruling 1/5/6/7) + outbox registration + `parseReceiptSettings.issueBoardId`.
4. `receipt-tax-request.ts` (R5) + no-op consumer registration for `pos.receipt.taxInvoiceRequested`.
5. Review via `member/index.ts#submitReviewForRef` (ruling 8); `receipt-send.ts` `sendReceipt` (R7, deps injection, audit, rate limit) + `sendReceiptAction` wiring the real LINE sender from the bridge file + `sendEmailRich`.
6. Message keys `pos.receipt.public.*`, `pos.receipt.send.*`, `pos.receipt.issue.*`, `pos.receipt.taxInvoice.*` (refusal messages only; th+en) and `refusalMessageKey` entries for the new codes.

After each step: typecheck; `qc-pos-p1.11` forced; suites of what you touched (`qc-pos-p1.10` for receipt/settings, `qc-pos-p1.3`, `qc-pos-p1.8`, `qc-pos-p1.16`, member suites that cover reviews if any run on QC4 without re-seeding — never run `seed-member-qc`).
Before "done": `qc-pos-p1.11` forced ×2 + unforced green, residue 0; `qc-pos-p1.10` 40/40; `qc-pos-p1.3`, `p1.8`, `p1.16`, `p1.9`, `qc-hf-pos-page-authz`, `qc-nav-functions` unchanged; money set COMMON §7 unchanged; `pnpm fitness` with and without .env; `scripts/fitness-pos.mts`; typecheck 0.

## Done =
- All gates green with exit codes in `ledger/wo-notes/pos-P1.11.md` (migration SQL summary, per-step results, contract summary for the U half: action names, input/result shapes, refusal codes, public receipt shape, follow-ups).
- Last push of `wip/pos-p1.11`; report ≤25 lines with the head SHA. Do not merge, do not touch `session/pos` or `main`.
