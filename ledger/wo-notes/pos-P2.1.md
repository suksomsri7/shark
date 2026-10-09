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

## Fix round 1 (reviewer F1–F4 + nit · prompt `pos-prompt-accountB-P2.1-S-fix.md` · 9 Oct 2026)
Commits: `5b1f44d2` ORACLE-EDIT (oracle only) · `bb3f96f1` code F1–F4 · `f8cb6813` migration comment + owner line · this notes commit. Everything in the review's "Verified OK" untouched; no schema/SQL change, no new migration.

| finding | change (file:line at bb3f96f1/f8cb6813) |
|---|---|
| **F1** (money) | `pos/account-bridge.ts:178` `postSaleCommission` = the single commission step (no commission/payout ⇒ no query) · `:202` `bridgePosSaleCommission(sale)` (exported) · `pos/refund-consumer.ts:78` step 1a calls it for every SALE bill before 1c (failure ⇒ pushed to `errors` ⇒ event retries) · `:122` 1c passes `saleRefId: sale.id` · `src/lib/outbox-consumers.ts:142` `pos.sale.paid` self-heals COMMISSION for a `REFUNDED` sale (PosSaleStatus has no PARTIALLY_REFUNDED — a partial refund keeps `PAID`, so the normal path already runs the step) · facade `account/index.ts:528–530`: own key posted ⇒ `already` before ensureAccounting/contact · non-reverse without PAID ⇒ `no-paid` (never COMMISSION without PAID — also closes "PAID rejected by line check, COMMISSION posted anyway") · reverse with `saleRefId` and no sale COMMISSION ⇒ `no-commission` (never reverse a commission that was never posted) · gl `account/gl.ts:1757` `posSaleEntryPosted` (read-only). |
| **F2** | `account/index.ts:490` `platformContact` → `account/service.ts:4093` `ensureNamedCustomerContact`: fast find (name case-insensitive, not archived, `orderBy createdAt asc, id asc`) → else one tx: `pg_advisory_xact_lock(hashtext(systemId || ':' || lower(name)))` → re-find → create with Party/code/`account.contact.created` all through `tx` (same row as `findOrCreateCustomerContact({name})`→`createContact`), code-conflict retry ×6 like `ensureAccountContact`. `findContactForImport` is no longer on this path ⇒ service function left alone (no orderBy; noted for the owner). Owner line: `ledger/POS-OWNER-PENDING.md:53`. |
| **F3** | gl `account/gl.ts:1765` `posSalePaidContact(ctx, saleId, "AR")` = contact on the Dr line of the AR-mapped account in `PosSale#<sale>#PAID` · `applyExternalRefund` (`account/index.ts:427`) PLATFORM rows use it, live channel name only as fallback · `applyExternalChannelCommission` (`:534`) PLATFORM payout uses it for COMMISSION_REFUNDED (via `saleRefId`) **and** COMMISSION (deviation 12) · no PosSale schema change. |
| **F4** | `pos/account-bridge.ts:182–183` one `select {status}` right before the commission step; `VOIDED` ⇒ skip (void consumer's `reverseFor` stays the only writer). Runs only for bills with commission + payout. |
| **Nit** | `prisma/migrations/20261203100000_pos_p21_sales_channel/migration.sql` header lines 3–5: comment now says the file is not re-runnable as a whole (unguarded CREATE TYPE ×3); SQL byte-identical (`git diff` touches `--` lines only). |

**ORACLE-EDIT** (`5b1f44d2`, own commit): new check **P2.1-R7** (ruling "R6" — that id is taken by the AGENT refund check). Red before the consumer change: `runs/r7-red-before.log` (head 5b1f44d2, forced) exit 1 · 53/54 · R7 `COMMISSION 0 · COMMISSION_REFUNDED 1 · 1100 {LINE MAN +12600} · 6500 −12600` (the reviewer's phantom). Green from bb3f96f1. Recorded in `pos-P2.1-oracle.md` (end).

**Deviations (fix round)**
12. COMMISSION (not only the refund side) takes the PAID 1100 contact for PLATFORM payout — otherwise a self-healed COMMISSION after a rename would split the per-platform AR again. Normal path: same contact as before (PAID was just posted with the same name).
13. Lock key uses `lower(name)` (the find is case-insensitive) and lives in `service.ts`, not in the facade block: the facade may not touch raw prisma (F5 baseline freeze, `index.ts:5`) and the lock tx must use `tx` only (calling `createContact` inside would wait on a second pool connection — the rule written on `ensureAccountContact`).
14. Facade result reasons added: `no-paid`, `no-commission` (both `{posted:false}`, no throw).

**Remaining race windows**
- F4: a void whose consumer drains between the status re-read (`account-bridge.ts:182`) and the COMMISSION commit still orphans COMMISSION (1100 −c / 6500 +c) — now one facade call wide (was PAID→ensureAccounting→contact→COMMISSION). Same class as the pre-existing "void drained before PAID" race; closing it needs a POS-side status lock around the account post (not done — the void consumer stays the only reverser).
- F1: if the refund event exhausts its retries (FAILED) while the COMMISSION step keeps failing, a later `pos.sale.paid` retry may self-heal COMMISSION after the refund event stopped ⇒ COMMISSION without COMMISSION_REFUNDED until ops re-drives the FAILED refund event (idempotent, safe). If PAID can never post (line check rejects), neither COMMISSION nor COMMISSION_REFUNDED posts (consistent).
- F2: a Party statement that fails inside the lock tx aborts it ⇒ throw ⇒ outbox retry (old path continued with `partyId` null).
- F3: DIRECT payout (AP 2100) refunds still use the live name (PAID has no contact line for a DIRECT bill) — follow-up: take the contact from the sale's COMMISSION counter line.

**Gate exit codes (code head `f8cb6813` = bb3f96f1 + comment-only migration edit · logs `scratchpad/p21-fix/runs/final-*` with `tree=/root/projects/shark-pos-b head=f8cb6813` headers; `dirty=2` in some headers = these two ledger notes being edited during the run, no code)**
- `qc-pos-p2.1` forced ×2: **0 · 54/54 · 0 · 54/54** · unforced **0 · 54/54** (not skipped) · residue 0 · leaks 0 · guard hits 0 · R7 fail-before log `runs/r7-red-before.log` (head 5b1f44d2: exit 1 · 53/54).
- Money/regression (unforced, QC4): qc-pos-p1.8 49 · qc-pos-account 16 · qc-account-cpa 107 · qc-shop-refund 12 · qc-restaurant-money 6 · qc-hotel-money 5 · qc-ticket-money 6 · qc-subscription-money 14 · qc-pos-p1.13 33 · qc-pos-p1.3 128 — all exit 0.
  - qc-pos-p1.3 first pass exit 1 (S1.9 · S9.1 · S9.2) = seed-tenant drift only (`posqc-coffee-tenant` posSale 176→177, posProduct 18→7 … from a parallel lane on that tenant, same as round 0); re-run once `runs/final-qc-pos-p1.3-rerun.log`: **0 · 128/128**, drift [].
- `pnpm fitness` no env **0 · 41/41** · QC4 env **0 · 41/41** · `scripts/fitness-pos.mts` **0 · 8/8** · typecheck **0** (before the code commit and again at f8cb6813).
- Checkpoint: fix round 1 DONE · NEXT = controller re-review / merge (builder does not merge).
