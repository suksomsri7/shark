# Prompt — P1.15 builder S (server half: PIN · staff token · discount cap · approval core · consumer). Controller: oracle `d8c5f358` merged into `session/pos`; base = `origin/wip/pos-p1.15-oracle` (identical content). Lane 3.

---

You are the BUILDER S for POS work order **P1.15**. Server + migration + actions + consumer only — **no UI** (13B lock screen / 21B dialog are P1.15U after P1.10U/P1.11U land). English reports, Thai code comments. Reply compact.

## Read first
- `ledger/pos-briefs/pos-brief-COMMON.md`, `pos-brief-LANE-RULES.md` (DB-command form with `env GATE_LOCK_FILE=/tmp/shark-gate-pos.lock` after `bash scripts/qc4.sh`).
- `ledger/pos-briefs/pos-brief-P1.15.md` — §2 R1–R9, §5 CD1–CD6 **as amended by the rulings below**.
- Oracle `scripts/qc-pos-p1.15.mts` (34 checks) + `ledger/wo-notes/pos-P1.15-oracle.md` (names table — use every name exactly, incl. `issueStaffToken(…, {now})`; fixture layout; drift list: `voidSale` audit signature and held-cart `heldByUserId` as built). Do NOT edit the oracle; report `ORACLE-EDIT?` with the check id if a check is impossible as written.
- Contracts: `pos-P1.8.md`, `pos-P1.9.md`, `pos-P1.10.md`, `pos-P1.16.md`; `src/lib/modules/approval/{index,service,labels,actions}.ts`; `src/lib/outbox-consumers.ts` approval chain. `AGENTS.md` → Next docs before Next code. Memory rules: `"use server"` files export only async functions; no `'use client'` file imports a module reaching prisma; `scripts/*.mts` are typechecked by `next build`.

## Controller rulings on CONTROLLER-DECISION 1–13 (binding)
| # | Ruling |
|---|--------|
| 1 | ▶ stand: `verifyStaffPin` takes optional `userId`; `managerPin` comes with `managerUserId`; with an id only that row is checked and failures count on it; without an id, match all rows and count nothing. Per-device throttle = follow-up (note it). |
| 2 | ▶ stand: cap and `forUserId` follow the staff token's user. |
| 3 | ▶ `STAFF` canonical, `CASHIER` read as alias. **Drop `overrideRequiresPin`** (override always needs a manager PIN). |
| 4 | ▶ stand: per-membership `pos._maxDiscountBp` wins; settings replace only the constant fallback. |
| 5 | ▶ stand (consumed/over-approved held cart ⇒ `DISCOUNT_EXCEEDS_LIMIT`, no new request; replay does not re-arm). |
| 6 | ▶ stand: one-line append `"pos→approval"` in `scripts/fitness.mts` ALLOWED_EDGES; POS imports only `@/lib/modules/approval`. |
| 7 | ▶ add `export { resolvePolicy } from "./service"` to `approval/index.ts` (index only; `service.ts` untouched). |
| 8 | ▶ stand: register `POS_VOID` "ยกเลิกบิล (POS)", `POS_REFUND` "คืนเงิน (POS)", `POS_DISCOUNT_OVER` "ส่วนลดเกินสิทธิ์ (POS)" in `approval/labels.ts` + the allowlist in `approval/actions.ts` (smallest hunks). |
| 9 | ▶ POS_VOID `entityId = saleId` for the first request; PENDING ⇒ `PENDING_APPROVAL`; after REJECTED/CANCELLED a retry opens a new request with `entityId = saleId:<n>` (n = closed requests for that sale + 1); APPROVED-but-not-executed is impossible (consumer executes) — treat as PENDING until the consumer runs. POS_REFUND `entityId = <saleId>:<refund idempotencyKey>`. |
| 10 | ▶ a policy binds everyone (managers/owners too — the manager PIN fallback is their fast path). Self-approval: the POS consumer **does not execute** a request whose decider = requester (`decidedById === requestedById`): ops event WARN `pos.approval.self_approved_blocked`, nothing executed, request left as is. Core-level block = follow-up. |
| 11 | ▶ a valid `managerPin` (manager with the needed permission) authorizes a requester who lacks `pos.sale.void`/`refund`; the requester must still hold `pos.sale.create` in the unit; audit records both ids. |
| 12 | ▶ stand (keys relative to `pos.register`/`pos.*` as PN8 accepts; smallest hunk in `messages/*`). |
| 13 | ▶ drop `shiftId`: an approved refund executes off-shift (`shiftId: null`, like non-register refunds); the snapshot keeps `deviceId` for the audit only. |
Drift: follow the code as built (`voidSale(tenantId, unitId, saleId, audit?)`, `heldByUserId`).

## Tree
- `/root/projects/shark-pos-b` — now has its **own read-write node_modules copy** (`pnpm exec prisma generate` here affects nobody). `.env.qc`/`.env.qc4` = QC4 `ep-frosty-lab`, neondb_owner — print only the hostname. Run `git status --short` (must be clean; HEAD detached at d8c5f358), then `git fetch origin wip/pos-p1.15-oracle && git checkout -b wip/pos-p1.15 origin/wip/pos-p1.15-oracle`.
- Other lanes share QC4 (temp tenants `qc-p111-*`, `qc-p17-*`; the QC coffee shop is used by p1.3/p1.9/p1.10 suites). Never wipe QC4, never run `seed-*` scripts, never touch other trees or processes, never `pkill -f`. Suites via `systemd-run --no-block --unit=pos-p115s-<n> -p Type=oneshot -p RemainAfterExit=yes /usr/bin/bash <script>` with a log and polling (never block a shell > 10 min); DB commands `bash scripts/iso.sh env QC_FORCE=1 bash scripts/qc4.sh env GATE_LOCK_FILE=/tmp/shark-gate-pos.lock bash scripts/with-gate-lock.sh <cmd>`. Typecheck: `env NODE_OPTIONS=--max-old-space-size=5632 ISO_MEM=6500M bash scripts/iso.sh flock -w 7200 /tmp/pos-gate.lock pnpm typecheck` (lane 1's build holds it for long stretches; typecheck at most 3× per work order). No build/server/deploy/.env/Telegram.

## Migration (QC4 only, additive — CD5)
`PosStaffPin`, `PosApprovalPayload` (required — the core has no payload/title column), held-cart column `approvedRequestId String?` exactly as the oracle names them. Migration folder `prisma/migrations/<timestamp>_pos_p115_staff_pin_approval/migration.sql` from `prisma migrate diff --from-schema-datamodel <copy of the pre-P1.15 schema dir> --to-schema-datamodel prisma/schema --script` (never from the database — other lanes' objects live there). Read it: CREATE TABLE / ADD COLUMN (nullable) / CREATE INDEX only. `prisma migrate deploy` on QC4 through the wrappers (if deploy reports a pending folder that is not yours — P1.11's `20261129000000_pos_p111_online_receipt` is already applied — STOP and report); then `pnpm exec prisma generate`. Register in `core/scope.ts` + `scripts/pos-qc-env.mts`. ⛔ Never `migrate dev|reset|resolve`, `db push`.

## Build order (commit + push `wip/pos-p1.15` after each step; typecheck before each push)
1. `staff-pin.ts` (R1/R2: scrypt, weak/taken/lock-out/unlock, `issueStaffToken`/`staffFromToken` HMAC with `pinVersion`), `listStaffForDevice` (R8), permission `pos.staff.manage`, `staff-pin-actions.ts`.
2. R3 staff token on `submitRegisterSale` / `holdRegisterCart` / `recallHeldCart` / `openShift` (`STAFF_TOKEN_INVALID`, never silent fallback).
3. R4 discount cap: settings `pos.discount.maxBpByRole` parser (STAFF/MANAGER/OWNER; CASHIER alias), `regMaxDiscountBp` by role of the acting user (ruling 2/4), `managerPin`+`managerUserId` override + audit `pos.discount.override`.
4. R5 approval: `pos-approval.ts` (entity types, snapshot in `PosApprovalPayload`, `APPROVAL_REQUIRED`/`PENDING_APPROVAL`, retry rule 9, manager-PIN fallback with `cancelRequest`, audit `pos.approval.pin_override`), wired into `voidSaleByActor`, `refundSale`, `submitRegisterSale` (auto-hold for discount-over); fitness edge; `resolvePolicy` export; labels + allowlist.
5. R6 consumer `pos-approval-consumer.ts` (approved/rejected for `POS_*`, idempotent, self-approval block, refund off-shift, held-cart arming) + one registration hunk in `outbox-consumers.ts`.
6. Message keys + `refusalMessageKey` (PN8), notes.

After each step: typecheck; `qc-pos-p1.15` forced; suites you touched (`qc-pos-p1.3` incl. hold/recall, `qc-pos-p1.6`, `qc-pos-p1.8`, `qc-pos-p1.9`, `qc-pos-p1.16`, `qc-approval`).
Before "done": `qc-pos-p1.15` forced ×2 + unforced, residue 0; `qc-pos-p1.3/p1.5/p1.6/p1.8/p1.9/p1.9b/p1.10/p1.11/p1.16`, `qc-approval`, `qc-hf-pos-page-authz`, `qc-nav-functions` unchanged; money set COMMON §7; `pnpm fitness` ×2; `scripts/fitness-pos.mts` (`--update-pos-contract` if the sale contract changes — report the diff); typecheck 0.

## Done =
- Gates green with exit codes in `ledger/wo-notes/pos-P1.15.md` (migration SQL summary, per-step results, contract summary for P1.15U: action names, input/result shapes, refusal codes, token lifecycle, follow-ups incl. per-device throttle and core self-approval block).
- Last push of `wip/pos-p1.15`; report ≤25 lines with the head SHA. Do not merge, do not touch `session/pos` or `main`.
