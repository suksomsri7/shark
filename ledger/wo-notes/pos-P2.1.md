# POS P2.1 — builder S notes (`wip/pos-p2.1`)

Builder S · account B · 9 Oct 2026 · tree `/root/projects/shark-pos-b` (lane 3) · base `origin/session/pos` e4672cfa (oracle merged, 53 checks).
Contract: `ledger/pos-briefs/pos-brief-P2.1.md` (§9 binding) + `ledger/pos-briefs/pos-prompt-accountB-P2.1-S.md` (rulings 1–14) + names table in `pos-P2.1-oracle.md`.

## Checkpoint (restart from here)
- DONE: step 1 (schema + migration + registrations) · step 2 (channel service) · step 3 (createSale) · step 4 (accounting) · step 5 (register server) · step 6 (readers)
- DONE: final gates (below) · NEXT: controller review / merge (builder does not merge)
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
| 4 | d1c7273f | forced 42/53 (all G R green; rest = P/Q/E1 + ST3 seam); qc-pos-account 16/16 · qc-account-cpa 107/107 · qc-pos-p1.8 49/49; typecheck 0 |
| 5 | b170ad10 | forced 49/53 (P1–P4 Q4 E1 ST3 green; rest = Q1 Q2 Q3 Q6 readers); typecheck 0 |
| 6 | 53a01f9b | forced **53/53** residue 0 (drift on posqc-coffee = parallel lane, info only); typecheck 0 |

## Deviations from the brief (rule touched)
1. **Other builtins (QR_TABLE/WEB/CHAT): payout locked + not archivable** (`CHANNEL_BUILTIN_LOCKED`) — ruling 4 lists name/active/commission as editable and is silent on payout/archive; WEB is the default target of every ECOM sale, so a PLATFORM payout or an archive there would break `shop.confirmOrderPaid` (R2/ruling 4).
2. **Non-builtin channel code is immutable after create** (`VALIDATION`, "สร้างช่องทางใหม่แทน") — not specified; bills snapshot `channelCode` and P2.12 groups by it (R3).
3. **Default resolution ignores `active`** of the builtin it picks (legacy callers keep selling if the owner switches WEB/STORE off) — only an explicit `channelId` must be active (R4/CD2/ruling 14).
4. **Ruling 13 (gift-card ⇒ STORE)** is enforced in `createSale` as `sourceModule === "MEMBER"` ⇒ STORE / commission 0 / `channelId` ignored: `giftCardId` is written by the giftcard module *after* `createSale` returns, so it cannot be seen during resolution; MEMBER also covers subscriptions (same semantics). Consumer `pos.sale.paid` already skips `giftCardId` bills ⇒ no JV either way.
5. **Service charge only on STORE/QR_TABLE** applied literally (WEB/CHAT/CUSTOM DIRECT get 0 too) (CD8).
6. **Price seam**: channel is resolved inside `regPrice` (shared by quote/submit/held/approval paths) and the literal `// P2.2 ▸ channel price here ◂` sits at the unit-price choice; no separate argument added (R10).
7. `receipt-render.ts` line 3 **comment** rephrased (`next/*` → `next/(ทุกตัว)`): the oracle's comment stripper took that `/*` inside a `//` comment as a block-comment start and hid `ReceiptPayType` (ST5). Comment-only, no ORACLE-EDIT.
8. `src/components/pos/register/PayDone.tsx` `PAY_LABEL` gained `PLATFORM: "pay.platform"` (+ `register.pay.platform` th/en) — exhaustive `Record<RegisterPayType>` compile fix only (P2.1U owns the UI).
9. Additive reader fields beyond the names table: `BillRow.channelRef`, `BillsPageData.salesChannels [{id, code, name}]` (filter options for mockup 12).
10. Commission JV: book GENERAL, journal `ADJUST`; reverse memo `คืนค่าคอมฯ ช่องทาง <name> · ใบคืน <CN…>`.
11. Refund method rule runs right after the sale is locked (before quantity/amount checks): sale paid PLATFORM ⇒ every refund row must be PLATFORM; otherwise PLATFORM ⇒ `REFUND_METHOD_INVALID` (R9).

## Foreign-module edits
- `src/lib/modules/account/index.ts` (facade): `applyExternalChannelCommission`, key table `CHANNEL_GL_KEY` (`PLATFORM_RECEIVABLE→AR`, `PLATFORM_COMMISSION→PAYMENT_FEE`, `CHANNEL_COMMISSION_PAYABLE→AP`, `CHANNEL_COMMISSION_VAT→VAT_INPUT_UNDUE`), `platformContact` (name match via `findContactForImport`, else `findOrCreateCustomerContact({name})`), `applyExternalSale`/`applyExternalRefund` channel union + `"PLATFORM"` + `channelName?` (PLATFORM ⇒ `ensureAccounting` + AR line with contact).
- `src/lib/modules/account/gl.ts`: `postExternalChannelCommission` (new) · `postExternalSale.drLines[].contactId?` · `postExternalRefund.crLines` key `+ "AR"` + `contactId?`. All additive — non-PLATFORM bills post byte-identical JVs (qc-pos-account 16/16, qc-account-cpa 107/107).
- Logged in `ledger/POS-OWNER-PENDING.md` under "แจ้งเจ้าของโมดูลบัญชี".
- Hot shared files touched with marked hunks: `core/permissions.ts`, `core/scope.ts`, `scripts/pos-qc-env.mts`, `src/messages/{th,en}/pos.json` (+ `channel` block appended at the end), `register-shared.ts`, `bills*.ts`, `shift.ts`, `ui/status-labels.ts` (+ CARD label that was missing).

## Contract for P2.1U
- **Actions** (`pos/channel-actions.ts`, `"use server"`): `listChannelsAction({systemId, unitId, includeArchived?})` → `{ok:true, items: ChannelItem[]}` · `saveChannelAction({systemId, unitId, input: ChannelInput})` → `{ok:true, channel}` · `archiveChannelAction({systemId, unitId, id})` → `{ok:true, channel}`. Refusal `{ok:false, code, message, field?}`; codes `NOT_FOUND PERMISSION_DENIED VALIDATION CHANNEL_NOT_FOUND CHANNEL_CODE_TAKEN CHANNEL_BUILTIN_LOCKED CHANNEL_LIMIT INTERNAL` → screen text via `refusalMessageKey(code)` → `pos.register.errors.*`.
- `ChannelItem` = `{id, code, kind, name, adapter, active, payout, commissionBp, commissionFixedSatang, commissionVatBp, sortOrder, archived}`; `ChannelInput` keys `{id?, code?, name, active?, payout?, commissionBp?, commissionFixedSatang?, commissionVatBp?, sortOrder?, adapter?}` (create ⇒ `code` required; preset code ⇒ EXTERNAL/PLATFORM/MANUAL defaults; other ⇒ CUSTOM/DIRECT/NONE). Read = `pos.sale.read|create`; write = `pos.channel.manage` (OWNER/MANAGER by role).
- Client-safe calculator `pos/channel-shared.ts`: `channelCommission(gross, rates)` (live example ฿420 → ฿126 · net ฿294), `parseChannelInput`, `CHANNEL_BUILTIN_CODES/NAMES`, `CHANNEL_EXTERNAL_PRESETS`, `CHANNEL_LIMIT_PER_UNIT`, `CHANNEL_REF_MAX`, `defaultChannelCode`, `channelFallbackName`.
- Bills (mockup 12): `BillRow.salesChannel {code, name}` (never null today), `BillRow.channelRef`, query `salesChannelId`, `BillsPageData.salesChannels`; old `channel` filter = sourceModule (unchanged). Bill drawer (mockup 09 block): `BillDetail.channel {code, name, ref, payout, commissionSatang?, commissionVatSatang?}` — numbers present only for `pos.report.view`; net = grandTotal − commission − commissionVat.
- Receipts: `ReceiptPayload.channel {code, name, ref} | null` (null = STORE) rendered as "ช่องทาง <name> · <ref>"; `PublicReceipt.channel {name, ref} | null`. No commission anywhere.
- Register: cart key `channelId` (quote/submit/held), submit key `channelRef` (≤40), quote result `channel {id, code, name, payout}`; PLATFORM tender only on payout-PLATFORM channels (single row, full amount, no tip/cash) — no picker in P2.1U (ruling Q3).
- Messages: `pos.channel.*` (title, subtitle, add, connect, edit, archive, status, kind, builtin, field, payout, summary, example, commissionBlock, label, all, empty, error, saved), `register.errors.channel*`, `register.pay.platform`, `shift.method.PLATFORM`, `receipt.public.pay.PLATFORM`; labels `POS_PAY_TYPE_LABEL.PLATFORM` / `PAY_TYPE_LABEL_TH.PLATFORM` = "แพลตฟอร์ม".

## Follow-ups
- P6.1: `CREATE INDEX CONCURRENTLY` on `PosSale(channelId…)`; backfill builtins per unit + `channelId/channelCode` on legacy bills, then NOT NULL (CD9).
- Account owner: platform contact creation is find-then-create without a lock (two concurrent first posts of a new channel could create two contacts) — an advisory lock per (book, name) in the facade would close it; contacts are created through `createContact` ⇒ a `Party` named after the platform also appears (CD6 side effect).
- `quoteRegisterCart`/`listChannels` lazily create the 4 builtins on first touch of a unit (a write on a read path — by design R2).
- P2.4/P2.7/P2.8 pass explicit `channelId` (QR table, chat, manual orders); P2.13 REST `EXTERNAL_PAY_TYPES` + `channelId`.
- O25/O26 (accounts option B, GP VAT, pro-rata) unchanged — a later ruling = mapping change / ORACLE-EDIT.

## Gate exit codes (head 53a01f9b · logs `scratchpad/p21/runs/final*/` with `tree=… head=…` headers)
- `qc-pos-p2.1` forced ×2: **0 · 53/53 · 0 · 53/53** · unforced: **0 · 53/53** (not skipped) · residue 0 · leaks 0 · guard hits 0.
- Regression (unforced, QC4): p1.3 128 · p1.5 21 · p1.6 48 · p1.7 32 · p1.8 49 · p1.9 53 · p1.9b 22 · p1.10 40 · p1.11 38 · p1.12 67 · p1.13 33 · p1.15 39 · p1.16 28 · p1.17 40 · qc-pos-account 16 · qc-pos-coupon 8 · qc-pos-closeday 22 · qc-account-cpa 107 · qc-restaurant-money 6 · qc-shop-refund 12 · qc-hotel-money 5 · qc-ticket-money 6 · qc-subscription-money 14 · qc-hf-pos-page-authz 56 — all exit 0.
  - First pass: p1.3 (S1.9 S9.1 S9.2) · p1.5 (Z1 Z2) · p1.7 (Z2) · p1.9 (Z1 Z2) red **only on seed-tenant drift** — tree d `visual-pos.mts p112u-en --tenant coffee` was selling on `posqc-coffee-tenant` (outside the POS gate lock) during the run (S1.9 = its `PQC-VIS-…` product in the search). Re-run once after it ended: **all four exit 0, full counts** (`runs/final-rerun/`).
- `pnpm fitness` no env 0 · 41/41 · QC4 env 0 · 41/41 · `scripts/fitness-pos.mts` 0 · 8/8 (F15.2 contract diff = `channelId?`, `channelRef?`) · typecheck 0.
