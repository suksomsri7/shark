# Prompt — P1.15 reviewer S (read-only). Controller: head under review = `wip/pos-p1.15` 1386a2f9 (builder 9b74a598 + fix 1386a2f9; base = oracle d8c5f358 over session/pos).

---

You are the REVIEWER for POS work order **P1.15 (server half)**: staff PIN · staff token on sell/hold/recall/open-shift · per-role discount caps + manager-PIN override · approvals (void/refund/discount-over) through the approval core · consumer · migration. Read-only: no edits/commits/DB/build/servers/`.env*`. English, ≤ 60 lines.

## Read first
- `ledger/pos-briefs/pos-brief-P1.15.md` (R1–R9, CD1–CD13) and `pos-prompt-accountB-P1.15-S.md` (controller rulings 1–13 — binding).
- `ledger/wo-notes/pos-P1.15-oracle.md` (names, drift) and builder notes `ledger/wo-notes/pos-P1.15.md` (`git show 1386a2f9:…`).
- Oracle `scripts/qc-pos-p1.15.mts` (34 checks, builder reports 34/34 ×3 forced + unforced).
- Approval core: `src/lib/modules/approval/**` (facade, policies, submit/approve/reject), `core/permissions.ts`, `register.ts`, `held-cart.ts`, `shift.ts`, `settings` parsers, `outbox-consumers.ts`.
- Next 16.2 rules (`node_modules/next/dist/docs/`); memory rules: `"use server"` exports only async functions; no client import reaching prisma; `scripts/*.mts` typechecked by `next build`.

## Tree
`/root/projects/shark-pos-b` is the builder's tree — read via `git show <sha>:<path>` / `git diff d8c5f358..1386a2f9` only. No checkout, pnpm, prisma, DB, servers, `git worktree`.

## Verify (cite file:line)
1. **PIN security** (R1/R2): scrypt with per-row salt, constant-time compare, weak-PIN list, uniqueness per unit, lock-out after N wrong (counter + `lockedUntil`), unlock by manager; no PIN or hash ever leaves the server (actions, logs, audit, errors); `listStaffForDevice` returns no hash/pinVersion secrets.
2. **Staff token** (R3): HMAC over `{userId, unitId, deviceId, pinVersion, exp}` with a server secret; `pinVersion` = hash of the stored hash (builder's CD2 deviation — judge whether it leaks anything or weakens TK5); expiry; verification refuses on every mismatch with `STAFF_TOKEN_INVALID`, **never silent fallback** to the session user; `soldByUserId` = token user (P1.17-ST4 kept by reassigning `actor` — check nothing else downstream still uses the original session actor where the token user is required: audit, shift ownership, discount cap).
3. **Discount caps** (R4, rulings 2/4/5): cap follows the token user's role; membership cap wins over tenant default; manager PIN authorizes the requester (ruling 11) — check the override cannot be replayed (bound to cart/sale/time?), and that `STAFF` is canonical with no `overrideRequiresPin` leftovers.
4. **Approvals** (R5–R7, rulings 6/9/10/12): POS calls only the approval facade; `resolvePolicy` exported from the approval index; policy binds everyone, consumer refuses self-approval; retry `entityId` formats `saleId:<n>` / refund `<saleId>:<key>`; approved refund allowed off-shift (ruling 13); `PosApprovalPayload` snapshot → consumer re-validates against the current sale state (status, remaining qty, amounts) before executing void/refund/discount; idempotent on re-delivery; rejected path cleans up (held cart `approvedRequestId`).
5. **Consumer registration**: one hunk in `outbox-consumers.ts`, `withAutomation`, fitness edge `pos → approval` only (no approval → pos).
6. **Migration**: additive only (`PosStaffPin`, `PosApprovalPayload`, nullable `PosHeldCart.approvedRequestId`, indexes); `scope.ts` registration (moved next to `PosDevice` — behaviour unchanged?); `pos-qc-env.mts` comment reword harmless.
7. **Settings keys** under `pos.register` (ruling 12) parsed with defaults; labels + allowlist (ruling 8).
8. **Collateral**: `qc-pos-p1.9` ST8 is red because its text forbids a `PosStaffPin` model — controller will ORACLE-EDIT that one condition (P1.15 R1 supersedes); say whether the other two ST8 conditions (no `PosShift.pin` column, `shift.ts` not reading `pinCode`/`hrEmployee`) still hold. `qc-pos-p0.2` red is claimed to be seed residue from P1.8/P1.16 refund runs — confirm from the diff that no P1.15 code touches that path.
9. **Gates**: notes' exit codes consistent with the diff; typecheck 0.

## Report format
Verdict first (`MERGEABLE` | `MERGEABLE-AFTER-FIXES` | `BLOCKED`), findings F1..Fn (severity, file:line, concrete input → wrong outcome, fix), "Verified OK" list, follow-ups for P1.15U/controller.
