# Prompt — P1.11 reviewer S (read-only). Controller: head under review = `wip/pos-p1.11` (builder 483ec5d2 + controller ORACLE-EDIT commit on top; base = oracle fa643e0e over session/pos 4a280ca1).

---

You are the REVIEWER for POS work order **P1.11 (server half)**: public receipt by token · send via LINE/email · issue report → Kanban/chat · full-tax-invoice request · review via member facade · migration. Read-only: no edits/commits/DB/build/servers/`.env*`. English, ≤ 60 lines.

## Read first
- `ledger/pos-briefs/pos-brief-P1.11.md` (R1–R9, CD1–CD6) and `pos-prompt-accountB-P1.11-S.md` (controller rulings 1–11 — binding).
- `ledger/wo-notes/pos-P1.11-oracle.md` (names table, drift) and the builder notes `ledger/wo-notes/pos-P1.11.md` (`git show <head>:…`).
- Oracle `scripts/qc-pos-p1.11.mts` (38 checks) — the builder reports 36/38 before three controller ORACLE-EDITs (ST6 path/page deferral, S2 `{}`, P1.10 P6 QR URL); judge whether those edits weaken anything.
- Server contracts: `pos-P1.10.md`, `pos-P1.8.md`, `pos-P1.16.md`; `src/lib/modules/chat/party-bridge.ts`, `chat/push.ts`, `core/email.ts`, `kanban/links.ts`, `member/index.ts` (new `submitReviewForRef` + `reviewStateForRef`), `core/origin.ts`.
- Next 16.2 rules (`node_modules/next/dist/docs/`), memory rules: `"use server"` exports only async functions; no client import reaching prisma; `scripts/*.mts` typechecked by `next build`.

## Tree
`/root/projects/shark-pos-c` is the builder's tree — read via `git show <sha>:<path>` / `git diff fa643e0e..<head>` only (head = `git rev-parse wip/pos-p1.11`). No checkout, pnpm, prisma, DB, servers; no `git worktree`.

## Verify (cite file:line)
1. **Security of public paths**: token-only inputs (unknown keys ⇒ VALIDATION; no ids from the client); unique-index lookups; rate limits by rows (3 issues/24 h per sale, 5 sends/24 h per sale); no PII in `publicReceipt` (name/phone/email/cashier/deviceId/tenant/unit/sale ids absent); text stored trimmed/escaped on render; `noindex` where the page is (defer page checks if the U half is not yet there, but confirm the actions file `src/app/(store)/r/[token]/pos-receipt-actions.ts` is `"use server"`, async-only, and cannot be abused (e.g. `requestFullTaxInvoice` cannot overwrite another sale's request; `submitReceiptReview` cannot be used without member).
2. **Token** (R1): `crypto.randomBytes` Crockford base32 12 chars, set in `createSale` tx for both doc types, `ensureReceiptToken` idempotent, lazy creation in `receiptPayload` (ruling 4) does not break read-only callers (bills page, refund drawer) or transactions.
3. **Module boundary** (ruling 1): `src/lib/pos-receipt-bridges.ts` holds the chat/kanban calls; nothing under `modules/pos/**` imports chat/kanban; fitness edges unchanged; `outbox-consumers.ts` hunk is one registration.
4. **Issue consumer** (R4, rulings 5–7): `issueBoardId` from settings, no fallback board; `createCardFromExternal` with `sourceType AUTOMATION`, `sourceKey pos-receipt-issue:<id>`; idempotent on `kanbanCardId`; LINE ack never throws; audit on creation.
5. **Tax-invoice request** (R5): eligibility (PAID, ≤7 days, ABB kind), one open request, taxId 13 digits, event emitted, no-op consumer registered.
6. **Send** (R7, rulings 2/3/10): deps injection, `code` added to `SendLineToPartyResult` minimal, email via `sendEmailRich` with masked audit, VOIDED refused, rate limit, PERMISSION_DENIED semantics.
7. **Member additions** (ruling 8 + builder's extra `reviewStateForRef`): composed of existing internals only; no schema change; journey-requested review row reused; the extra read is minimal and safe.
8. **Migration**: additive only (column + unique index + 2 enums + 2 tables + indexes); `scope.ts` + `pos-qc-env.mts` registration; the `pos-qc-env.mts` comment change does not alter behaviour.
9. **Readers/money**: statuses derived from `status/docType/refundedSatang`; money shaping reuses `receiptPayload` internals (no re-derivation); `points.balance` via point module.
10. **Gates**: the notes' exit codes are consistent; `qc-member-m3.4` skipped with a stated reason; shared-DB flake I2 explanation plausible (another lane drained the outbox) — say whether the consumer should be resilient to that.

## Report format
Verdict first (`MERGEABLE` | `MERGEABLE-AFTER-FIXES` | `BLOCKED`), findings F1..Fn (severity, file:line, concrete input → wrong outcome, fix), "Verified OK" list, follow-ups for the U half/controller.
