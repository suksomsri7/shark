# Prompt — P1.8 builder S (server + migration). Controller fills `<ORACLE_SHA>` after merging the oracle into session/pos.

---

You are the BUILDER S for POS work order **P1.8** (partial refund · credit note · stock/points/member reversal · shift cash · doc-type-aware readers). Server side only — no UI (P1.16 does the bills page). Work in English, code comments in Thai (repo convention). Reply compact.

## Read first
- `ledger/pos-briefs/pos-brief-COMMON.md`, `pos-brief-LANE-RULES.md` (your tree is the build tree, see below).
- `ledger/pos-briefs/pos-brief-P1.8.md` — whole file. §2 R1–R10, §6 defaults and **§7 CD1–CD8** are binding.
- Oracle `scripts/qc-pos-p1.8.mts` (49 checks) + `ledger/wo-notes/pos-P1.8-oracle.md` (names table — use every name exactly as written; drift list; CONTROLLER-DECISION items are ruled in brief §7). Do NOT edit the oracle. If a check is impossible as written, stop and report `ORACLE-EDIT?` with the check id and why.
- `AGENTS.md` → read `node_modules/next/dist/docs/` before touching any Next code (server actions: "use server", no `export type`).
- Memory rules you must respect: `'use client'` files must not import modules that reach prisma; `"use server"` files export only async functions; `scripts/*.mts` are typechecked by `next build`.

## Tree
- `/root/projects/shark-pos-p11` (own read-write node_modules; `.env.qc`/`.env.qc4` = QC4 `ep-frosty-lab`, role neondb_owner — print only the hostname to confirm). The tree is clean and detached; run `git fetch origin session/pos && git checkout -b wip/pos-p1.8 origin/session/pos` (the oracle is already merged there at `<ORACLE_SHA>`).
- Other trees (`shark-pos`, `shark-pos-b`, `shark-pos-c`, `shark-crm*`, `shark-hr*`, `shark-in-th`) are other sessions — never touch them, never kill their processes, never `pkill -f`. Lane 2 is running a different oracle on QC4 at the same time with fixtures prefixed `posqc-p110-`; your oracle uses its own temporary tenant, so there is no overlap — but do not run `qc-pos-p1.10` and do not wipe QC4.
- DB commands: `bash scripts/iso.sh env QC_FORCE=1 bash scripts/qc4.sh bash scripts/with-gate-lock.sh <cmd>` (`QC_FORCE` only for the oracle runs that need it). Typecheck/build-grade commands through the POS lock: `env NODE_OPTIONS=--max-old-space-size=5632 ISO_MEM=6500M bash scripts/iso.sh flock -w 3600 /tmp/pos-gate.lock pnpm typecheck`. Never use `/tmp/shark-gate.lock` (held by another session). No `next build`, no server, no deploy, no `.env`, no Telegram.

## Migration (QC4 only, additive)
1. Edit `prisma/schema/pos.prisma`: enum `PosSaleDocType { SALE REFUND }`; `PosSale.docType @default(SALE)`, `refSaleId String?`, `refundedSatang Int @default(0)`, `reasonCode String?`; `PosSaleLine.refLineId String?`, `restock Boolean?`; new `PosDocCounter { id, tenantId, unitId, docType PosSaleDocType, period String, seq Int @default(0) @@unique([unitId, docType, period]) }`. No FKs, no index on `refSaleId` (P6.1 adds it CONCURRENTLY). Register `PosDocCounter` in `core/scope.ts` and move it to "present" in `scripts/pos-qc-env.mts`.
2. `prisma migrate diff --from-url <QC4> --to-schema-datamodel prisma/schema --script` into `prisma/migrations/<timestamp>_pos_p18_refund/migration.sql`. **Read the SQL**: CREATE TYPE / CREATE TABLE / ADD COLUMN (nullable or with default) / CREATE UNIQUE INDEX only. Never DROP/RENAME/NOT NULL-without-default.
3. `prisma migrate deploy` against QC4 through the wrappers, then `pnpm exec prisma generate` in this tree (the b/c trees bind-mount this node_modules read-only — additive client changes are fine).
⛔ Never `migrate dev`, `migrate reset`, `db push`.

## Build order (commit + push `wip/pos-p1.8` after each step; typecheck before each push)
1. Shared pure helpers: refund amount allocation (`allocateBillDiscount` moved to a shared module used by both the accounting bridge and refunds), refund VAT via `splitIncludedVat`; unit tests live in the oracle — run it.
2. `src/lib/modules/pos/refund.ts` `refundSale` (R5) + `saleForRefund` (R9), CN numbering via `PosDocCounter` (R4), tx rules (R6: lock original `FOR UPDATE`, remaining qty, `refundedSatang`, status PAID→REFUNDED on full, coupons released only on full, outbox `pos.sale.refunded`, `writeAudit`), permission `pos.sale.refund` in `core/permissions.ts` (OWNER/MANAGER), `voidSale` guard `HAS_REFUNDS` (CD1).
3. `refund-actions.ts` (`refundSaleAction`, `saleForRefundAction`) with refusal-as-data and message keys `pos.refund.errors.*` th+en.
4. Consumer chain (R7): `src/lib/modules/pos/refund-consumer.ts` + one registration line in `outbox-consumers.ts` (shared hot file — smallest hunk, wrapped with `withAutomation`); account facade `applyExternalRefund` in `account/index.ts` (CREDIT_NOTE doc with `sourceDocId`, pro-rata GL reversal, idempotent, unlinked ⇒ `{posted:false, reason:"unlinked"}`); `point.reversePartialEarn` in `point/lots.ts`; `member-bridges.ts#onPosSaleRefunded` (spend −, points partial / full via `releaseOnVoid` remainder so the bill nets to 0 — CD2/CD3, stamps on full only, `evaluateAndApply`); inventory return at the ORIGINAL OUT movement's `costSatang` with key `pos-refund-<refundSaleId>-<refundLineId>[-<invItemId>]`, `restock:false` ⇒ no movement; bundles/weighed lines as P1.2 cut them.
5. Readers (R3): grep every `posSale.` read in `src/` — list each site in the notes with the verdict (`docType:"SALE"` added / `− refundedSatang` applied / unaffected and why). Minimum: `daySummary`, `listSales`, `closeDaySummary` (`service.ts:933-996`), `computeReport` + `offShiftCash` (R8: `cashRefundsSatang`, `refundCount`, `refundSatang`, `byMethod[].refundCount/refundSatang`, `expectedCash` subtracts), `reports.ts`/`report-overview.ts` (fill the reserved `refundCount/refundTotalSatang`, net = after refunds), legacy `src/app/app/sys/[id]/pos/sales/page.tsx`.
6. Spec rows (CD8): update `docs/modules/14-pos.md` §7.6 items 1–3 with a one-line "P1.8 ruling" note each (shift only when required · `CN${YYYYMM}-NNNN` · bill stays PAID on partial).

After each step: typecheck; `qc-pos-p1.8` forced; suites of what you touched.
Before "done": money set COMMON §7 (`qc-pos-account`, `qc-account-cpa` 107, `qc-restaurant-money`, `qc-shop-refund`, `qc-hotel-money`, `qc-ticket-money`, `qc-subscription-money`) identical to before; `qc-pos-p1.3`, `p1.6`, `p1.9`, `p1.9b`, `p1.14`, `p1.17`, `qc-pos-p1.1` unchanged; `qc-hf-pos-page-authz`; `pnpm fitness` with and without .env; `scripts/fitness-pos.mts`; typecheck 0. A suite that breaks only because its fixture never set `docType` gets a FIXTURE fix with a note — never a weakened assertion.

## Done =
- `qc-pos-p1.8` forced ×2 green (49/49) and unforced green, no residue (the oracle's own cleanup reports it).
- Everything in the "Before done" list green; exit codes pasted.
- `ledger/wo-notes/pos-P1.8.md`: migration SQL summary, per-step results, reader call-site table (R3), contract summary for P1.16 (action names, input/result shapes, refusal codes, `saleForRefund` fields), follow-ups, the final gate lines.
- Last push of `wip/pos-p1.8`; report ≤25 lines with the head SHA. Do not merge, do not touch `session/pos` or `main`.
