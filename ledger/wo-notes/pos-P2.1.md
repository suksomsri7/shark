# POS P2.1 — builder S notes (`wip/pos-p2.1`)

Builder S · account B · 9 Oct 2026 · tree `/root/projects/shark-pos-b` (lane 3) · base `origin/session/pos` e4672cfa (oracle merged, 53 checks).
Contract: `ledger/pos-briefs/pos-brief-P2.1.md` (§9 binding) + `ledger/pos-briefs/pos-prompt-accountB-P2.1-S.md` (rulings 1–14) + names table in `pos-P2.1-oracle.md`.

## Checkpoint (restart from here)
- DONE: step 1 (schema + migration + registrations) · step 2 (channel service) · step 3 (createSale) · step 4 (accounting facade/gl + bridge + refund + refund-consumer)
- NEXT: step 5 (register server: channelId quote/submit/held, PLATFORM, service charge, seam)
- Commands:
  - oracle no-db: `pnpm exec tsx scripts/qc-pos-p2.1.mts --no-db`
  - oracle forced: `bash scripts/iso.sh env QC_FORCE=1 bash scripts/qc4.sh env GATE_LOCK_FILE=/tmp/shark-gate-pos.lock bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-pos-p2.1.mts`
  - typecheck: `env NODE_OPTIONS=--max-old-space-size=5632 ISO_MEM=6500M bash scripts/iso.sh flock -w 3600 /tmp/pos-gate.lock pnpm typecheck`

## Migration `prisma/migrations/20261203100000_pos_p21_sales_channel/migration.sql`
From `prisma migrate diff --from-schema <copy of pre-change prisma/schema> --to-schema prisma/schema --script` (never from the DB); hand edits: CREATE TYPE ordered before the PosSale ADD COLUMN that uses it, `IF NOT EXISTS` on ADD VALUE / CREATE TABLE / CREATE INDEX / ADD COLUMN, `SET/RESET lock_timeout`.
```sql
SET lock_timeout = '3s';
ALTER TYPE "PosPayType" ADD VALUE IF NOT EXISTS 'PLATFORM';
CREATE TYPE "SalesChannelKind" AS ENUM ('BUILTIN', 'EXTERNAL', 'CUSTOM');
CREATE TYPE "SalesChannelAdapter" AS ENUM ('NONE', 'MANUAL', 'WEB', 'CHAT', 'API');
CREATE TYPE "SalesChannelPayout" AS ENUM ('PLATFORM', 'DIRECT');
CREATE TABLE IF NOT EXISTS "SalesChannel" (… 21 columns, PK id …);
CREATE UNIQUE INDEX IF NOT EXISTS "SalesChannel_unitId_code_key" ON "SalesChannel"("unitId", "code");
CREATE INDEX IF NOT EXISTS "SalesChannel_tenantId_systemId_unitId_idx" ON "SalesChannel"("tenantId", "systemId", "unitId");
ALTER TABLE "PosSale" ADD COLUMN IF NOT EXISTS "channelId" TEXT, … "channelRef" TEXT, "channelPayout" "SalesChannelPayout",
  "channelCommissionSatang" INTEGER NOT NULL DEFAULT 0, "channelCommissionVatSatang" INTEGER NOT NULL DEFAULT 0;
RESET lock_timeout;
```
`migrate status` before: only this folder pending (QC4 also holds 6 other lanes' migrations — untouched) · `migrate deploy` (iso → QC_FORCE qc4 → POS gate lock) **0** · `prisma generate` (own node_modules) **0** · host `ep-frosty-lab-aoylqlv8…`.

## Steps
| step | commit | result |
|---|---|---|
| 1 | fe2f24c0 | ST1 green (`--no-db`); typecheck 0 (PAY_TYPE_LABEL_TH needed PLATFORM — exhaustive Record) |
| 2 | 20d8140e | B1–B5 + C1 C3 C4 C5 C6 green (forced run, 16/53 — rest = later steps); typecheck 0 |
| 3 | c8ed9887 | forced 28/53: ST1 ST2 ST4 ST5 S8 B1–B5 C1–C7 S1–S7 G5 G7 Q5 Z1 Z2 green (rest = steps 4–6); contract diff = exactly `channelId?`/`channelRef?`; typecheck 0 |
| 4 | (this) | forced 42/53 (all G R green; rest = P/Q/E1 + ST3 seam); qc-pos-account 16/16 · qc-account-cpa 107/107 · qc-pos-p1.8 49/49; typecheck 0 |
