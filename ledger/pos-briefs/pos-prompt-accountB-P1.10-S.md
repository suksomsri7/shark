# Prompt — P1.10 builder S (devices · printer config · receipt payload · renderers). Controller: oracle merged into session/pos at 8b28a96d.

---

You are the BUILDER S for POS work order **P1.10**. Server + pure renderers + actions only — no hardware code, no pages (P1.10U). English reports, Thai code comments.

## Read first
- `ledger/pos-briefs/pos-brief-COMMON.md`, `pos-brief-LANE-RULES.md`.
- `ledger/pos-briefs/pos-brief-P1.10.md` — whole file; §2 R1–R9, §5 defaults, **§6 CD1–CD5 + drift** are binding (permission refusal code is `PERMISSION_DENIED`; add key `pos.sale.read`; hold/recall guards live in `held-cart.ts`; `openShift` reads `input.deviceId`).
- Oracle `scripts/qc-pos-p1.10.mts` (40 checks) + `ledger/wo-notes/pos-P1.10-oracle.md` (31 names — use them exactly). Do NOT edit the oracle; report `ORACLE-EDIT?` with the id if a check is impossible as written.
- `AGENTS.md` → Next docs before touching Next code. Memory rules: `"use server"` files export only async functions; `receipt-render.ts` must import nothing that reaches prisma/server (a client bundle will import it); `scripts/*.mts` are typechecked by `next build`.

## Tree
- `/root/projects/shark-pos-c` — it now has its OWN read-write node_modules (not a bind mount), so `pnpm exec prisma generate` here affects nobody else. `.env.qc`/`.env.qc4` = QC4 (`ep-frosty-lab`, neondb_owner — print only the hostname). Run `git status --short` (must be clean), then `git fetch origin session/pos && git checkout -b wip/pos-p1.10 origin/session/pos`.
- Another builder is working on P1.8 in `/root/projects/shark-pos-p11` on the same QC4 (its migration adds `PosDocCounter`, enum `PosSaleDocType`, columns on `PosSale`/`PosSaleLine`). You will see those objects in QC4 but not in your schema — that is expected: your `migrate diff` must be taken **from your schema, not from the database** (use `--from-migrations prisma/migrations --to-schema-datamodel prisma/schema --shadow-database-url` is NOT allowed either — instead write the migration by hand from `prisma migrate diff --from-schema-datamodel <copy of the pre-P1.10 schema dir> --to-schema-datamodel prisma/schema --script`, as P1.9 did). Your migration must contain only YOUR objects (`PosDevice`, `PosDeviceStatus`, its indexes). Never touch `PosDocCounter`/`PosSale.docType`. Do not run `qc-pos-p1.8`. Leave fixtures prefixed `qc-p18-*` alone. Never wipe QC4.
- Never touch other worktrees or processes, never `pkill -f`. DB commands: `bash scripts/iso.sh env QC_FORCE=1 bash scripts/qc4.sh bash scripts/with-gate-lock.sh <cmd>` (`QC_FORCE` only where the oracle needs it). Typecheck: `env NODE_OPTIONS=--max-old-space-size=5632 ISO_MEM=6500M bash scripts/iso.sh flock -w 3600 /tmp/pos-gate.lock pnpm typecheck` (never `/tmp/shark-gate.lock`). No build/server/deploy/.env/Telegram.

## Migration (QC4 only, additive)
1. `prisma/schema/pos.prisma`: enum `PosDeviceStatus { ACTIVE REVOKED }`; model `PosDevice` per brief R1 (loose ids, no FKs, `@@unique([unitId, deviceCode])`, `@@index([tenantId, unitId, status])`). Register in `core/scope.ts` (`sys()`); add to `scripts/pos-qc-env.mts` present list if it has one.
2. Migration folder `prisma/migrations/<timestamp>_pos_p110_devices/migration.sql` — CREATE TYPE / CREATE TABLE / CREATE INDEX only. Read it. `prisma migrate deploy` on QC4 through the wrappers. If deploy reports P1.8's pending migration folder is absent/present mismatch, STOP and report (do not resolve/mark). Then `pnpm exec prisma generate` in this tree.
⛔ Never `migrate dev`, `migrate reset`, `db push`, `migrate resolve`.

## Build order (commit + push `wip/pos-p1.10` after each step; typecheck before each push)
1. Pure parsers `parsePrinterConfig`, `parseReceiptSettings` (R3/R4) + settings read/update (`receipt-settings.ts`, `receipt-settings-actions.ts`, pattern = `payment-settings*.ts`).
2. `device.ts` + `device-actions.ts` (R2: register/list/update/revoke/heartbeat, limit from `Tenant.limits.posDevices` default 3, online = 120 s, heartbeat throttle 30 s), permission `pos.device.manage` + `pos.sale.read` in `core/permissions.ts`, REVOKED guards in `submitRegisterSale` (`register.ts`), `openShift` (`shift.ts`, input + ctx), `holdRegisterCart`/`recallHeldCart` (`held-cart.ts`), heartbeat inside `registerStatus`. Message keys `pos.device.*`, `pos.receipt.*` th+en; `refusalMessageKey` for `DEVICE_REVOKED DEVICE_LIMIT DEVICE_NOT_FOUND`.
3. `receipt.ts` `receiptPayload` (R5: exact shape, `kind` by VAT config via `vatConfigOf`, shop header from receipt settings with fallback to the linked book's business profile — `AccountSettings.logoUrl`, `branchCode`, `taxId` — `copy:true` ⇒ `writeAudit("pos.receipt.reprint")`) + `receipt-actions.ts` (`receiptPayloadAction`, `reprintReceiptAction`).
4. `receipt-render.ts` (R6): `renderReceiptHtml(payload, {paper, locale})` and `encodeEscPos(payload, {paper, drawerKick, thaiText, cut})` → `{ bytes: Uint8Array, rasterSlots }`; deterministic; TIS-620 table built in; columns 32/48; commands exactly as the oracle asserts (init `1B 40` first, cut `1D 56 42 00` last, drawer `1B 70 00 19 FA` only with drawerKick + CASH, `1D 76 30` per raster slot).

After each step: typecheck; `qc-pos-p1.10` forced; suites of what you touched (`qc-pos-p1.3` incl. hold/recall, `qc-pos-p1.5`, `qc-pos-p1.9`, `qc-pos-p1.9b`, `qc-pos-p1.6`).
Before "done": `qc-pos-p1.10` forced ×2 + unforced green, no residue; `qc-pos-p1.3/p1.5/p1.6/p1.9/p1.9b/p1.14/p1.17/p1.1` unchanged; `qc-hf-pos-page-authz`; `pnpm fitness` with and without .env; `scripts/fitness-pos.mts`; typecheck 0.

## Done =
- All gates above green with exit codes pasted in `ledger/wo-notes/pos-P1.10.md` (migration SQL summary, per-step results, contract summary for P1.10U: action names, input/result shapes, refusal codes, payload/renderer signatures, follow-ups).
- Last push of `wip/pos-p1.10`; report ≤25 lines with the head SHA. Do not merge, do not touch `session/pos` or `main`.
