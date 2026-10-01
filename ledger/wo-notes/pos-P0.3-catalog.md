# WO P0.3 · lane 3 — oracle `scripts/qc-pos-p1.1.mts` (single catalogue · P1.1a + P1.1b)

> RUN "POS ใหม่" · worktree `/root/projects/shark-pos-c` · branch `wip/pos-p0.3-catalog` · 1 ต.ค. 2569 · oracle writer: Claude Opus 5.5
> brief: `/root/projects/shark-pos/ledger/pos-briefs/pos-brief-P0.3.md` (Lane 3) + LANE-RULES + COMMON · ไม่แตะ `src/` `prisma/` หรือสคริปต์เดิม

## Ratified names (controller 1 Oct) — contract for the P1.1a/P1.1b builders
> **Round 2 (brief `pos-brief-P1.1a-R2.md`) changed the items marked 🔁 below — R2 wins where they differ.**
> **Round 3 (brief `pos-brief-P1.1a-R3.md`) changed the items marked 🔂 — R3 wins over R2.**
> **Round 4 (brief `pos-brief-P1.1a-R4.md`) changed/added the items marked 🔃 — R4 wins over R3.** (names below marked "oracle R4" are the oracle writer's inventions — controller to ratify)
- 🔃 **E1** `catalog.checkCatalogWrite(actor: MembershipCtx, where, row, action, client?)` (facade): `null`/`undefined`/the system marker ⇒ returns `"PERMISSION_DENIED"` (oracle R4: the marker is not a `MembershipCtx`); `row.unitId` that is not a non-archived branch linked (type POS) to `where.systemId` ⇒ returns `"NOT_FOUND"` (even for OWNER). Verdicts are RETURNED (not thrown). The system bypass lives only in the private path behind `actorOf`.
- 🔃 **E2** migrations: `20261120000000_pos_v2_a` (enum + 4 tables + indexes + FKs, atomic) and `20261120000001_pos_v2_a_links` (`SET lock_timeout` (not `LOCAL`) → exactly 5 × `ALTER TABLE "<old>" ADD COLUMN IF NOT EXISTS "<col>" TEXT` → `RESET lock_timeout`; no `DO`, no dollar-quote, nothing else). Oracle R4: S3.22/S3.23/S3.31/S3.32 read the two files concatenated in folder order.
- 🔃 **E3** counters: `tillPrice` per InvItem row = today's register (PRODUCT `salePrice > 0 ? salePrice : max(0, cost)` via `InvItem.accountProductId` with no archived/book filter — `register.ts:146-149`; SERVICE `InvItem.priceSatang` only — `register.ts:166-174`). New counter **`catalogPriceDiffersFromTill`** (catalogue price non-null and ≠ tillPrice) under `counts`, samples under **`samples.catalogPriceDiffersFromTill[tenantId]`** (≤20), each sample carries both prices — oracle R4 names **`catalogPriceSatang`** / **`tillPriceSatang`** (the oracle also accepts any sample row whose numeric values contain both). Oracle R4 scope ruling: rows sourced from an InvItem only (web/menu own rows have no till price). The four price-null counters partition the price-null rows; **`samples.invalidLegacyPrice[tenantId]`** (≤20) is required (oracle R4 — needed for "exactly one counter's samples"); sample rows identified by source id or name.
- 🔃 **E5 fixture note** the 520 "bulk" InvItems of S1.37 are now `SERVICE priceSatang 100` (catalogue = till = 100) so the price-null samples (≤20/tenant) can hold every named fixture.
- 🔂 **D1 (replaces the C4 bullet)** an all-branch row (`unitId null`) has a SCOPE = the non-archived branches of this POS where it is sellable (row with `invItemId`: only branches whose warehouse holds the item — C3; row without: every non-archived branch linked to the POS). The actor needs the permission at EVERY branch of the scope (`evaluate(action, unitId)` per branch); empty scope ⇒ OWNER/`*` only. So a single-branch-shop manager and a manager listing all branches may write all-branch rows; an A-only manager in a two-branch shop may not (except an all-branch row sellable only at A). Moving between branches needs both. Refusal codes unchanged (`PERMISSION_DENIED`; target branch not accessible ⇒ `NOT_FOUND`). Exported helper `catalogWriteScope(…)` (name is the builder's; must agree with `posCanSetTenantPrice` of hotfix/pos-page-authz at merge).
- 🔂 **D2** effective trackStock on the read path: per item `EXISTS … LIMIT 1` filtered by the warehouse `systemId` (or `onHand ≠ 0` first) — no tenant-wide movement `groupBy`.
- 🔂 **D3** extra counts with ≤20 samples per tenant: `apIgnoredButTillPriced`, `priceNotSetOther`, `servicePriceDiffersFromAccountProduct` (counts top-level or under `counts`; samples anywhere in the summary, matched by product name).
- 🔂 **D4** migration: last statement `RESET lock_timeout;`; every statement re-runnable (`IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS` / enum + FKs in `DO $$ … EXCEPTION WHEN duplicate_object …$$`).
- 🔂 **D5** the facade must not export `backfillCatalog`; marker = `Symbol(` (never `Symbol.for(`); `?? CATALOG_SYSTEM_ACTOR` forbidden in `src/`; fitness F15.5 (builder).
- 🔂 **D6** `createProduct` with an InvItem whose warehouse does not serve the given `unitId` ⇒ `VALIDATION`; `trackStock: true` on a SERVICE ⇒ `VALIDATION`; plain `createProduct`/`createCategory` (no invItemId, no barcode) take no tenant-wide advisory lock; memberships with `acceptedAt = null` are treated as non-members (`NOT_FOUND`) — house rule verified in `src/lib/core/context.ts:23,50` and `src/lib/core/push.ts:313-315`; `zeroPriceWeb` counts only rows whose final price is the web price 0; `byBarcode` as UNION (same result).
- 🔂 **D6 note** `systemForUnit` (`src/lib/modules/system/service.ts:58-68`) does NOT filter inactive inventory systems ⇒ `unitInventory` keeps that behaviour (no filter); recorded, not tested. Builder note: P2002 inside a caller-supplied transaction surfaces as `CONFLICT` but the caller's transaction is already aborted (P1.1b callers must not continue in that tx).
- 🔁 **C1** system caller = `catalog.CATALOG_SYSTEM_ACTOR` (module-level `unique symbol`); `actorUserId: string | typeof CATALOG_SYSTEM_ACTOR`; `null`/`undefined`/`""` ⇒ `PERMISSION_DENIED` (fail closed). Replaces the `null` convention below.
- 🔁 **C2** `trackStock Boolean?` tri-state: `null` = AUTO (effective = has invItemId AND kind PRODUCT AND (≥1 movement OR onHand ≠ 0), computed at read time) · `updateProduct({trackStock: true|false|null})` · read model `trackStock: boolean` + `trackStockMode: "auto"|"on"|"off"` · `true` without invItemId ⇒ VALIDATION · backfill/ensure/createProduct leave null. Replaces the "explicit column frozen at backfill" rule below.
- 🔁 **C3** an invItem-linked product is visible at unit U only if its InvItem belongs to U's own inventory system (list, search, byBarcode, stock).
- 🔁 **C4** all-branch writes (product/category `unitId null`, create all-branch, `ensureForInvItem`, move to/from null) need an all-branch actor ⇒ else `PERMISSION_DENIED`; moving to a branch the actor cannot access ⇒ `NOT_FOUND` (404 semantics, oracle choice); category of another branch on a product ⇒ `VALIDATION` (oracle choice).
- 🔁 **C5** `byBarcode(ctx, unitId, barcode) → {items: ProductView[]}` (0..n, deterministic order) — replaces `view | null`.
- 🔁 **C6** `listForUnit` default limit 100, max 500 (larger clamped, never VALIDATION), always `nextCursor` when more rows; single-query search.
- 🔁 **C7** price precedence = what the till charges today (salePrice>0 → posPrice>0 if posEnabled → SERVICE priceSatang>0 → own menu/shop price (0 kept) → salePrice 0 & cost 0 ⇒ 0 → else null); AccountProduct only via `InvItem.accountProductId`, not archived, in the book linked to this POS. Replaces "Zero prices" and the old posPrice-first rung below.
- 🔁 **C8** `vatRateBp` copied only when the linked book is VAT-registered, else null.
- 🔁 **C9/C13** dry-run `JSON_SUMMARY` counts (top-level or under `counts`): `soldAtCostToday` (+ first 20 id/name per tenant somewhere in the summary), `zeroPriceProduct`, `zeroPriceMenu`, `zeroPriceWeb`, `invalidLegacyPrice`, `posPriceDiffersFromSalePrice`, `shopPriceDiffersFromCatalog`, `shopInactiveLinked`, `shopOwnRowInvItemOutsideFirstPos`, `shopDanglingInvItem`, `shopBranchNotInFirstPos`; ShopProduct cases a–d per brief.
- 🔁 **C12** archived branches / inactive systems excluded; first POS = active, `createdAt, id`.
- 🔁 **M1** no index on the 5 old link columns (removed from SQL and schema).

- **ctx** `{tenantId, systemId (POS), actorUserId: string | null}` — `null` = system caller (backfill / legacy writers): permission checks skipped, tenant/system checks still apply. Every catalog function takes an optional **trailing `client`** (PrismaClient or tx).
- **Refusals**: catalog functions **throw** a typed error carrying a stable `.code`; the oracle asserts on `code`, never on message text, and counts a returned `{ok:false}` as a contract breach. Codes (aligned with the register oracle, lane 4): `NOT_FOUND` (other tenant/branch/system/product/InvItem — 404 semantics, also cross-branch for a cashier), `PERMISSION_DENIED`, `VALIDATION` (bad name/price), `CONFLICT` (duplicate barcode / category name).
- **API**: `createProduct(ctx, {name, nameEn?, kind? (default "PRODUCT"), categoryId?, basePriceSatang, vatRateBp?, barcode?, unitId?, invItemId?})` · `updateProduct(ctx, id, {name?, nameEn?, categoryId?, unitId?, trackStock?, availability?: {[unitId]: boolean}})` — **no `setAvailability`** · `setPrice(ctx, id, priceSatang)` · `archive(ctx, id)` · `listForUnit(ctx, unitId, {q?, limit?, cursor?}) → {items, nextCursor}` (never a bare array) · `byBarcode(ctx, unitId, barcode) → view | null` · `ensureForInvItem(ctx, invItemId) → {id, created}` · **`createCategory(ctx, {name, nameEn?, unitId?, sortOrder?}) → {id}`** · all exported via `src/lib/modules/pos/index.ts`.
- **Permissions**: price changes `pos.product.setPrice`; create/update/archive/createCategory **`pos.product.manage`** (P1.1a adds it to `permissions.ts` as one marked hunk + Thai label); listForUnit/byBarcode need branch access only.
- **AuditLog**: `targetType "PosProduct"`, `targetId`, `actorId = actorUserId`, `action` `pos.product.*`.
- **PosProduct columns**: `systemId, unitId?, invItemId?, kind, name, nameEn, categoryId, basePriceSatang?, vatRateBp?, stationId, dailyStockQty, images, archivedAt, parentId?`, **`trackStock Boolean @default(false)`** — backfill: true iff `invItemId` set AND that InvItem has ≥1 InvMovement or `onHand ≠ 0`; MENU false in P1.1a; afterwards the column is the truth (`updateProduct({trackStock})`, register reads it, never re-derives).
- **Read model**: optionGroups[].choices[].`priceDelta` · `stock[unitId] = InvItem.onHand` · `availability{unitId→bool}`.
- **Backfill**: `--tenant=<id>` (repeatable) · `--dry-run` · last line `JSON_SUMMARY {dryRun, sources:{invItem,menuItem,shopProduct}, perSystem, skippedNoPosSystem:{invItem,menuItem,shopProduct}, created:{…}, updated:{…}}`; every skip counted under a named reason (InvItem with >1 POS is counted under `skippedNoPosSystem.invItem` today — a separate `skippedAmbiguousPos` key is welcome but not asserted).
- **Menus (changed ruling b)**: every MenuItem → its own PosProduct `kind MENU`, `invItemId null`, price `MenuItem.basePrice`; a set `MenuItem.invItemId` becomes ONE `RecipeLine(productId = menu product, invItemId, qty 1)`. "Two sources → one product" applies only to InvItem ↔ ShopProduct(invItemId). Coke fixture ⇒ PRODUCT (Coke, 2000) + MENU (null, 2500, RecipeLine→Coke).
- **Shop rows** in a branch with no POS link ⇒ linked to the POS that shop checkout uses (tenant's first POS, `shop/service.ts:217`). MenuItem per-unit skip and InvItem 0/>1-POS skip stay.
- **Zero prices**: `salePrice 0` kept (deliberate); `posPrice 0` ignored; SERVICE `priceSatang 0` without AccountProduct ⇒ null.
- **Price write-back** by row kind: InvItem+AccountProduct → `AccountProduct.salePrice`; SERVICE → `InvItem.priceSatang`; MENU → `MenuItem.basePrice`; shop-only → `ShopProduct.priceSatang`.
- **Run alone**: this oracle must be the only writer on the POS QC tenants while it runs (controller serialises it through the QC4 gate lock).

## Controller rulings 1 Oct (survey) — override pos-brief-P1.1a (old) / POS-MIGRATION-PLAN where they differ
Source: controller message + `/root/projects/shark-pos-e/ledger/REVIEW-POS-DESIGN-2026-10-01.md` §2, §6 rows 1/2/3/14 (verified against code by me) + **pos-brief-P1.1a.md rewritten by the controller the same day** (its R1–R8 are now the builder's contract; the oracle follows it).
- **R1 scope**: `PosProduct` = `tenantId` + `systemId` (POS AppSystem) + nullable `unitId` (null = every branch) + nullable `invItemId` (unique per `(systemId, invItemId)` when set). `kind` on PosProduct (PRODUCT/SERVICE/MENU/BUNDLE). No MENU in `InvItemKind`; **no InvItems created for menus**. 1:1 assertions = every InvItem sellable in a POS system → exactly one PosProduct; every MenuItem → exactly one own PosProduct (kind MENU, `posProductId` set, `invItemId` only if `MenuItem.invItemId` already set); every ShopProduct → the PosProduct of its `invItemId`, else its own.
- **R2 price** (never cost): `AccountProduct.posPrice` (>0) → `AccountProduct.salePrice` → `InvItem.priceSatang` (SERVICE, >0) → `MenuItem.basePrice` / `ShopProduct.priceSatang` for their own rows → null. Each rung has its own fixture; cost-only → null.
- **R3 columns**: `posProductId` on MenuItem / ShopProduct / ShopOrderLine; `productId` on PosSaleLine / RestaurantOrderItem (ShopOrderLine.productId is the existing FK to ShopProduct — oracle asserts it stays NOT NULL).
- **R4 indexes**: plain CREATE INDEX; the oracle only checks that indexes exist, never how they were created.
- **R5 P1.1b**: dual-write asserted for every writer the survey found (each verified to exist, file:line below).
- Brief P1.1a (new): no `PosVariant` table, `PosProduct.parentId` instead · ctx = `{tenantId, systemId, actorUserId|null}` · backfill prints `JSON_SUMMARY` + `skippedNoPosSystem` · migration folder `<ts>_pos_v2_a` · audit row per write · listForUnit server-side search + pagination, no 200 cap · facade export.

### What changed in the oracle after the rulings (first draft → final)
| was (first draft, old brief/MIG) | now |
|---|---|
| PosProduct 1:1 InvItem, `invItemId` NOT NULL + unique; backfill creates InvItem for every MenuItem/shop-only product | `invItemId` nullable, unique `(systemId, invItemId)`; backfill must create **0** InvItems (S1.8, S1.25) |
| `ShopOrderLine.productId` new column | `ShopOrderLine.posProductId`; old `productId` must stay NOT NULL (S1.2) |
| price: salePrice → SERVICE priceSatang → menu → shop | posPrice(>0) → salePrice → SERVICE priceSatang(>0) → own menu/shop → null; new fixtures posPrice 4500/5000, posPrice 0, SERVICE 0 (S1.14) |
| PosVariant table or parentId | parentId required, PosVariant forbidden (S1.1) |
| ctx `{tenantId, actor:{role,unitAccess,permissions}}` | ctx `{tenantId, systemId, actorUserId}`; X3.2 grants `pos.product.setPrice` by temporarily editing the cashier's Membership.permissions (restored in finally + verified by snapshot) |
| summary line `BACKFILL_SUMMARY`, `skipped.noPosSystem` | `JSON_SUMMARY` (BACKFILL_SUMMARY still accepted), `skippedNoPosSystem` (old key still accepted) |
| no unit/system resolution | resolution per selling path (see below) + fixture branch without POS (S1.6, S1.10, S1.11) |
| — | new S1.37 (search + pagination, 201 bulk items), S1.38 (AuditLog), S1.26 facade, X2.1 foreign-systemId ctx, S2.20–S2.27 (R5 writers) |

## Checkpoint
| # | step | state |
|---|---|---|
| 1 | read brief/contracts/code | ✅ |
| 2 | write `scripts/qc-pos-p1.1.mts` | ✅ 82 checks (P1.1a 54 · P1.1b 28) — ratification round applied |
| 3 | A1 run via qc4 → SKIPPED exit 0 | ✅ |
| 4 | A2 `--list` | ✅ |
| 5 | A3 `QC_FORCE=1` → red for the right reason, no crash | ✅ |
| 6 | A4 typecheck (once, end) | see §A4 |
| 7 | A5 row counts before/after | ✅ |
| 8 | commit + push | see §Commits |

## "Which POS system does a row belong to" (what the oracle expects — traced in today's code)
| source | resolution (code today) | oracle helper | no POS |
|---|---|---|---|
| InvItem | register lists InvItems of the INVENTORY system linked (AppSystemUnit) to a unit of the POS system (`pos/register.ts:125-152` resolvePosLinks → posCatalog) ⇒ POS S sells inventory I iff some unit has both `AppSystemUnit(type INVENTORY)=I` and `(type POS)=S` | `posOfInventory()` | 0 POS **or >1 POS** ⇒ skipped + counted in `skippedNoPosSystem.invItem` (ambiguity is never guessed) |
| MenuItem | restaurant checkout `systemForUnit(tenantId, unitId, "POS")` (`restaurant/order.ts:421`) | `posOfUnit()` | unit without POS link ⇒ skipped, `posProductId` stays null, counted (fixture: temp unit `…-nopos`) |
| ShopProduct | shop checkout `listSystems(tenantId,"POS")[0]` = **first POS of the tenant by createdAt**, regardless of the unit (`shop/service.ts:217`) | `firstPosOfTenant()` | only a tenant with no POS at all is skipped; a shop product in a unit without POS link is **still linked** (code wins over the controller's "unit has no POS ⇒ skip" wording — flagged) |
`unitId` on the product: MenuItem/ShopProduct → their unit; InvItem-derived → null (all branches).

## P1.1b writer paths asserted (R5 — each verified to exist in `src/lib/modules/…` today)
| writer (file:line) | check |
|---|---|
| `restaurant/menu.ts:231` createItem · `:279` updateItem · `:299` setItemOptionGroups · `:314` duplicateItem · `:341` archiveItem · `:347` setItemStock | S2.1–S2.6, S2.18, X6.5 |
| `restaurant/menu.ts:95` createCategory · `:116` archiveCategory · `:137` createOptionGroup (choice priceDelta) · `:178` archiveOptionGroup | S2.26, S2.27 |
| `shop/service.ts:43` createProduct · `:74` updateProduct | S2.7–S2.9 |
| `pos/register.ts:266` setItemSalePrice → `account/service.ts:568` updateAccountProductSalePrice | S2.10, S2.11 |
| `account/product.ts:567` updateProduct (salePrice · vatRateBp · posPrice) | S2.11, S2.25 |
| `inventory/service.ts:190` createItem · `:312` updateItem (InvItem.priceSatang) | S2.12, S2.20 |
| `account/inventory-link.ts:190` linkProductToItem (copies salePrice into a new InvItem) | S2.21 |
| `ai/proposals.ts:455` runKind → `:608` `inventory_create_item` | S2.22 |
| `booking/service.ts:310` importServicesToCatalog · `:224` serviceRoster (re-syncs `BookingService.priceSatang`) | S2.23, S2.24 |
| reverse direction catalog → legacy (AccountProduct / MenuItem / ShopProduct / InvItem+BookingService) | S2.13–S2.16, S2.24 |
| F15.1 ratchet empty (`scripts/fitness-pos.mts` CATALOG_WRITER_BASELINE + scanCatalogWriters) | S2.19 |
Not covered (stock/availability writers, not catalogue): `restaurant/order.ts` menu `stockQty`/86 decrements (survey §2.5 note) and `menu.resetDailyStock` — P1.1b/P2.4 must decide where they live; the F15.1 baseline cannot reach zero while they stay in order.ts.

## Check table (id · what it proves · X-group) — same text as `--list`

| id | what it proves | X |
|---|---|---|
| P1.1-S1.1 | ตารางใหม่มีจริง: PosProduct (+parentId ว่างไว้ให้ P1.2) · PosCategory · PosProductOptionGroup · RecipeLine · ไม่มีตาราง PosVariant | - |
| P1.1-S1.2 | คอลัมน์เชื่อมใหม่ nullable ครบ (R3): MenuItem/ShopProduct/ShopOrderLine.posProductId · PosSaleLine/RestaurantOrderItem.productId | - |
| P1.1-S1.3 | PosProduct มีคอลัมน์สัญญา (tenantId · systemId · unitId? · invItemId? · name · nameEn · kind · categoryId · basePriceSatang? · vatRateBp · stationId · dailyStockQty · images · archivedAt · trackStock nullable ไม่มี default [C2]) · unique(systemId, invItemId) · kind ∋ PRODUCT/SERVICE/MENU/BUNDLE · index ระบบ | - |
| P1.1-S1.4 | migration <ts>_pos_v2_a additive ล้วน: ไม่มี DROP/RENAME/SET NOT NULL/ADD COLUMN NOT NULL ไร้ DEFAULT บนตารางเดิม · ALTER TYPE ADD VALUE ไม่ปนไฟล์ DDL อื่น · ไม่แตะ enum InvItemKind | - |
| P1.1-S1.5 | src/lib/core/scope.ts ลงทะเบียนตารางใหม่ทุกตัว (F1 fail-closed) | - |
| P1.1-S1.6 | backfill --dry-run: exit 0 + JSON_SUMMARY นับต่อแหล่ง (invItem · menuItem · shopProduct) ตรง DB + skippedNoPosSystem ตรงกับแหล่งที่หา POS ไม่เจอตามทางขายจริง | - |
| P1.1-S1.7 | backfill --dry-run ไม่เขียนอะไรเลย (ตารางใหม่ · คอลัมน์เชื่อม · ตารางเดิม เท่าเดิมทุก byte) | - |
| P1.1-S1.8 | backfill จริง: exit 0 · created.posProduct = ที่ dry-run ทำนาย = แถวที่เพิ่มจริง · ไม่สร้าง InvItem เลย (R1) | - |
| P1.1-S1.9 | InvItem ที่ขายได้ใน POS (คลังผูกสาขาที่มี POS) → PosProduct เดียว systemId = POS ของสาขานั้น · ไม่มีกำพร้า/ชี้ข้ามร้าน · systemId เป็นระบบ POS ของร้านเดียวกัน | - |
| P1.1-S1.10 | ทุก MenuItem (สาขามี POS) → PosProduct ของตัวเอง 1 แถว: kind MENU · unitId = สาขาเมนู · invItemId null · MenuItem.invItemId ที่มีอยู่ → RecipeLine(productId เมนู, invItemId, qty 1) แถวเดียว · สาขาไม่มี POS = ไม่ผูก | - |
| P1.1-S1.11 | ทุก ShopProduct → POS ตัวแรกของร้าน (ทางเดียวกับ shop checkout): มี invItemId → ชี้ PosProduct ของ InvItem นั้น · ไม่มี → PosProduct ของตัวเอง (PRODUCT · unitId สาขา · invItemId null) — แม้สาขาไม่ผูก POS | - |
| P1.1-S1.12 | InvItem ↔ ShopProduct(invItemId) = PosProduct เดียว (เว็บร้าน→น้ำดื่ม) · เมนู→โค้ก = 2 แถว: PRODUCT โค้ก (invItemId · 2000) + MENU (invItemId null · 2500 · RecipeLine→โค้ก) | - |
| P1.1-S1.13 | ราคาขั้น 2 (salePrice) ตรงสตางค์ทุกสินค้าใน seed รวมราคา 0 บาท (น้ำฟรี · น้ำแข็ง) | X4 |
| P1.1-S1.14 | ราคา = ที่ลิ้นชักคิดวันนี้ [C7] ทุกแถวตรงสูตร + ทีละขั้น: salePrice>0 ชนะ posPrice · posPrice>0 เมื่อ posEnabled · SERVICE 15000 · SERVICE 0 = null · เมนู 9900 · เว็บล้วน 12345 · มีแต่ต้นทุน = null · เมนูโค้ก 2500 | X4 |
| P1.1-S1.15 | VAT ต่อสินค้า [C8]: vatRateBp = AccountProduct.vatRateBp (หาแบบลิ้นชัก · สมุดบัญชีที่ผูก POS จด VAT) · ไข่ 0 · อื่น 700 · ไม่มีบัญชี/ไม่จด VAT = null | X8 |
| P1.1-S1.16 | หมวด: เมนู → PosCategory ชื่อ/ชื่ออังกฤษเดียวกับ MenuCategory · 1 PosCategory ต่อ MenuCategory (สาขามี POS · ไม่ซ้ำ) | - |
| P1.1-S1.17 | ฟิลด์เมนูย้ายครบ: stationId · dailyStockQty · images (ลำดับเดิม) | - |
| P1.1-S1.18 | ตัวเลือก: PosProductOptionGroup (groupId · sortOrder) = MenuItemOptionGroup ของเมนูทุกตัว · MenuOptionGroup ใช้ต่อ ไม่สร้างใหม่ | - |
| P1.1-S1.19 | บาร์โค้ดคงเดิม: byBarcode(...).items มี PosProduct ของทุกบาร์โค้ดใน seed (น้ำดื่ม · โค้ก) | - |
| P1.1-S1.20 | InvItem ที่เก็บถาวร → PosProduct archivedAt ไม่ว่าง และไม่โผล่ใน listForUnit | - |
| P1.1-X1.1 | backfill รอบสอง: created ทุกตัว = 0 · updated ทุกตัว = 0 · ตารางใหม่ checksum เท่าเดิม | X1 |
| P1.1-X6.1 | backfill 2 โปรเซสพร้อมกัน (connection แยก) × 3 รอบ บนแหล่งใหม่ทุกรอบ → ต่อแหล่ง 1 แถว ไม่ซ้ำ · ทั้งคู่ exit 0 | X6 |
| P1.1-S1.21 | จอเดิม: เมนูร้านอาหาร (menu.listItems · orderingMenu · storefront.publicMenu) เหมือนก่อน backfill | - |
| P1.1-S1.22 | จอเดิม: หน้าร้านเว็บ (shop.listProducts activeOnly) เหมือนก่อน backfill | - |
| P1.1-S1.23 | จอเดิม: register.posCatalog เหมือนก่อน backfill ทุกรายการ (ราคา/ชื่อ/บาร์โค้ด · ไม่มีรายการเพิ่ม) | - |
| P1.1-S1.24 | createSale ด้วย id เดิม (itemId=InvItem) ยังขายได้ และ subtotal/discount/vat/grand + บรรทัด เท่าก่อน backfill เป๊ะ | X4 |
| P1.1-S1.25 | rollback ระหว่างทาง: แถวเดิมของตารางเก่า checksum เท่าก่อน backfill (ยกเว้น updatedAt/คอลัมน์เชื่อมใหม่) · ไม่มีแถวเพิ่ม/หายในตารางเก่า | - |
| P1.1-S1.26 | catalog.ts export ครบ 7 ฟังก์ชัน (createProduct · updateProduct · setPrice · archive · listForUnit · byBarcode · ensureForInvItem) และ facade pos/index.ts ส่งต่อครบ | - |
| P1.1-S1.27 | createProduct ถูกต้อง → PosProduct systemId = POS ใน ctx · ราคา/VAT ตรงสตางค์ · invItemId null หรือ InvItem ในคลังที่ผูก POS ของร้านเดียวกัน | X4 |
| P1.1-S1.28 | createProduct throw: ชื่อว่าง/ราคาติดลบ/เศษสตางค์ = VALIDATION · บาร์โค้ดซ้ำในระบบ POS = CONFLICT — และไม่เขียนอะไรเลย | X4 |
| P1.1-S1.29 | updateProduct: ชื่อ/ชื่ออังกฤษ/หมวด เปลี่ยนจริง · listForUnit เห็นค่าใหม่ · จำนวนแถวไม่เพิ่ม | - |
| P1.1-S1.30 | setPrice: ตั้งได้ตรงสตางค์ (รวม 0) · ติดลบ/เศษสตางค์/NaN/สตริง = throw VALIDATION โดยราคาเดิมไม่เปลี่ยน | X4 |
| P1.1-S1.31 | archive: หายจาก listForUnit · กดซ้ำไม่ error · แถวยังอยู่ (soft) | - |
| P1.1-S1.32 | listForUnit คืน {items, nextCursor} (ไม่ใช่ array เปล่า) · item ทรง POS-API §1: {id, invItemId, name, nameEn, kind, categoryId, basePriceSatang, images[], optionGroups[], variants[], recipe[], channelPrices[], availability{unitId→bool}, stock{unitId→qty}} · เงินเป็น Int | - |
| P1.1-S1.33 | listForUnit: active ของระบบครบ (unitId null + unitId สาขานี้ · ไม่มีของสาขาอื่น) · stock[unit] = InvItem.onHand · availability[unit] = true · ตัวเลือกเมนูมี choices.priceDelta Int | - |
| P1.1-S1.34 | byBarcode: {items} ตรงตัวในระบบ · บาร์โค้ดไม่มี = items ว่าง | - |
| P1.1-S1.35 | ensureForInvItem: เรียกซ้ำได้ id เดิม (created=false) · InvItem ใหม่ได้ราคาตามลำดับ R2 | X1 |
| P1.1-S1.37 | listForUnit ค้นฝั่ง server ด้วยชื่อไทย/SKU/บาร์โค้ด + แบ่งหน้าด้วย {limit, cursor} → nextCursor · ไม่มีเพดาน 200 (สินค้า >200 ตัวเดินครบทุกหน้า ไม่ซ้ำ) | - |
| P1.1-S1.39 | createCategory(ctx, {name, nameEn?, unitId?, sortOrder?}) → PosCategory ระบบ POS นี้ · ชื่อว่าง = VALIDATION · ชื่อซ้ำ (ระบบ+สาขาเดียวกัน) = CONFLICT | - |
| P1.1-S1.40 | createProduct ไม่ส่ง kind → PRODUCT · updateProduct availability {[unitId]: false} → ยังอยู่ใน listForUnit สาขานั้นแต่ availability[unit]=false · สาขาอื่นไม่กระทบ · เปิดคืนได้ | - |
| P1.1-S1.41 | trackStock tri-state [C2]: updateProduct({trackStock}) true/false/null วนได้ · คอลัมน์เก็บค่าที่ตั้ง (null = AUTO) | - |
| P1.1-S1.38 | ทุกการเขียน (createProduct · setPrice · archive) มีแถว AuditLog targetType PosProduct · targetId · actorId = ผู้กด | - |
| P1.1-X2.1 | ข้ามร้าน: updateProduct/setPrice/archive ด้วย productId ของอีกร้าน · ctx ที่ systemId เป็น POS ของอีกร้าน → throw NOT_FOUND และแถวไม่เปลี่ยน | X2 |
| P1.1-X2.2 | ข้ามร้าน: ensureForInvItem(InvItem ร้านอื่น) = NOT_FOUND · byBarcode บาร์โค้ดร้านอื่น = null · listForUnit(สาขาร้านอื่น) = NOT_FOUND · createCategory unitId ร้านอื่น = NOT_FOUND · ไม่มี id ร้านอื่นรั่ว | X2 |
| P1.1-X2.3 | ข้ามสาขา: แคชเชียร์ (unitAccess=สีลม) listForUnit/byBarcode สาขาอารีย์ → NOT_FOUND · สีลมได้ | X2 |
| P1.1-X3.1 | setPrice โดย STAFF ที่ไม่มี pos.product.setPrice → PERMISSION_DENIED ราคาไม่เปลี่ยน | X3 |
| P1.1-X3.2 | setPrice โดย STAFF ที่ Membership.permissions มี pos.product.setPrice=true → ได้ · OWNER ได้ | X3 |
| P1.1-X3.3 | STAFF สาขาเดียวที่ไม่มีคีย์ pos.product.manage: createProduct/createCategory ของสาขาตัวเอง · updateProduct/archive สินค้าสาขาตัวเอง → PERMISSION_DENIED ไม่เขียน (ทดสอบคีย์ ไม่ใช่กติกาสาขา) [D7] | X3 |
| P1.1-X6.2 | ensureForInvItem 10 เลนพร้อมกัน (connection แยก) × 3 รอบ → PosProduct 1 แถวต่อ InvItem · ทุกเลนได้ id เดียวกัน | X6 |
| P1.1-X6.3 | setPrice 10 เลนพร้อมกัน → ไม่ error · ราคาสุดท้ายเป็นหนึ่งในค่าที่ส่ง · แถวเดียว | X6 |
| P1.1-X6.4 | setPrice 5 เลน + updateProduct(nameEn) 5 เลนพร้อมกัน → ไม่มี lost update (ราคาและ nameEn เปลี่ยนทั้งคู่) | X6 |
| P1.1-X8.1 | ไม่เชื่อมบัญชี: setPrice สินค้าที่ไม่มี AccountProduct ได้ · ไม่สร้าง AccountProduct · InvItem.accountProductId ยัง null | X8 |
| P1.1-X9.1 | event outbox ตระกูล pos.* ที่เกิดระหว่างรัน (ถ้ามี) มี consumer ลงทะเบียนครบ | X9 |
| P1.1-S2.1 | menu.createItem → PosProduct ใหม่ 1 แถว (MENU · unitId · ราคา · หมวด · ตัวเลือก) + MenuItem.posProductId | - |
| P1.1-S2.2 | menu.updateItem ราคา/ชื่อ → PosProduct ตาม · ไม่เพิ่มแถว | - |
| P1.1-S2.3 | menu.setItemOptionGroups (สลับลำดับ) → PosProductOptionGroup ตาม | - |
| P1.1-S2.4 | menu.duplicateItem → เมนูสำเนาได้ PosProduct ของตัวเอง (ไม่แชร์กับต้นฉบับ) | - |
| P1.1-S2.5 | menu.archiveItem → PosProduct ของเมนูนั้นถูกเก็บถาวร · ต้นฉบับไม่กระทบ | - |
| P1.1-S2.6 | menu.setItemStock dailyStockQty → PosProduct.dailyStockQty ตาม | - |
| P1.1-S2.7 | shop.createProduct (ไม่ผูกคลัง) → PosProduct ใหม่ 1 แถว ราคา = priceSatang + ShopProduct.posProductId | - |
| P1.1-S2.8 | shop.createProduct ผูก InvItem ที่มี PosProduct แล้ว → ชี้ตัวเดิม ไม่สร้างแถวใหม่ | - |
| P1.1-S2.9 | shop.updateProduct ราคา: เว็บล้วน → PosProduct ตาม · แชร์กับ InvItem ที่มีราคาบัญชี → ราคา POS ไม่ถูกเขียนทับ | - |
| P1.1-S2.10 | register.setItemSalePrice (หน้า สินค้า/ราคา เดิม) → PosProduct.basePriceSatang ตาม | - |
| P1.1-S2.11 | account.updateAccountProductSalePrice + account/product.updateProduct (salePrice · vatRateBp) → PosProduct ตาม | - |
| P1.1-S2.12 | inventory.createItem → PosProduct ทันที (PRODUCT ราคา null · SERVICE ราคา = priceSatang) | - |
| P1.1-S2.13 | ย้อนทาง: catalog.setPrice สินค้าผูกบัญชี → AccountProduct ตาม → register.posCatalog เห็นราคาใหม่ | - |
| P1.1-S2.14 | ย้อนทาง: catalog.setPrice เมนู → MenuItem.basePrice ตาม → orderingMenu เห็นราคาใหม่ | - |
| P1.1-S2.15 | ย้อนทาง: catalog.setPrice/updateProduct สินค้าเว็บล้วน → ShopProduct.priceSatang/name ตาม → หน้าร้านเว็บเห็น | - |
| P1.1-S2.16 | ย้อนทาง: catalog.archive เมนู → MenuItem ARCHIVED + หายจาก orderingMenu | - |
| P1.1-S2.17 | ไม่เขียนซ้อน: แก้ผ่านผู้เขียนเดิมด้วยค่าเดิมซ้ำ → จำนวน PosProduct/AccountProduct/InvItem ไม่เพิ่ม | - |
| P1.1-S2.18 | เมนูที่ผูก InvItem (เมนู→โค้ก) แก้ basePrice → แถว MENU ตาม (2600) · แถว PRODUCT ของโค้กคง 2000 · RecipeLine ไม่เบิ้ล | - |
| P1.1-S2.19 | F15.1: CATALOG_WRITER_BASELINE ว่าง และตัวสแกนพบผู้เขียนแคตตาล็อกที่ catalog.ts ที่เดียว | X12 |
| P1.1-S2.20 | inventory.updateItem ราคา SERVICE (InvItem.priceSatang) → PosProduct ตาม | - |
| P1.1-S2.21 | account/inventory-link.linkProductToItem (สร้าง InvItem จากสินค้าบัญชี) → PosProduct ของ InvItem ใหม่ ราคาตาม R2 | - |
| P1.1-S2.22 | AI proposal inventory_create_item (ai/proposals.runKind) → PosProduct ของ InvItem ใหม่ | - |
| P1.1-S2.23 | booking.importServicesToCatalog (BookingService เก่า → InvItem SERVICE) → PosProduct SERVICE ราคา = BookingService.priceSatang | - |
| P1.1-S2.24 | ย้อนทาง: catalog.setPrice บริการ → InvItem.priceSatang ตาม → booking.serviceRoster + BookingService.priceSatang เห็นราคาใหม่ | - |
| P1.1-S2.25 | account/product.updateProduct [C7]: posPrice ไม่ชนะ salePrice>0 · salePrice ว่าง + posEnabled + posPrice → PosProduct = posPrice | - |
| P1.1-S2.26 | menu.createCategory → PosCategory ชื่อเดียวกัน 1 แถว · archiveCategory → PosCategory เก็บถาวร | - |
| P1.1-S2.27 | menu.createOptionGroup + archiveOptionGroup → listForUnit ของเมนูที่ผูก เห็นตัวเลือก priceDelta ตรง แล้วหายเมื่อเก็บถาวร | - |
| P1.1-X6.5 | แข่งกัน: menu.updateItem ราคา ↔ catalog.setPrice เมนูเดียวกัน 10 เลน × 3 รอบ → MenuItem.basePrice = PosProduct.basePriceSatang ทุกรอบ | X6 |
| P1.1-S3.1 | C1 ผู้เรียกระดับระบบ = CATALOG_SYSTEM_ACTOR (unique symbol) ทำงาน · actorUserId null/undefined/"" = PERMISSION_DENIED (ensureForInvItem · createProduct · setPrice · createCategory) | X3 |
| P1.1-S3.2 | C2 backfill/ensure ทิ้ง trackStock = null (AUTO) · read model มี trackStock (ค่าจริง) + trackStockMode auto/on/off | - |
| P1.1-S3.3 | C2 AUTO คิดตอนอ่าน: สินค้าสร้างวันนี้ยังไม่มีของ = false → รับของเข้าทีหลัง = true เอง · ตั้ง off/on/null ได้ · true บนแถวไม่ผูกคลัง = VALIDATION | - |
| P1.1-S3.4 | C3 POS เดียวสองคลัง: สาขา A เห็นเฉพาะของคลัง X (list + ค้น SKU/บาร์โค้ด) · สาขา B เฉพาะคลัง Y · stock[A] = onHand ของ X | X2 |
| P1.1-S3.5 | C3 byBarcode ตามคลังของสาขา: บาร์โค้ดของคลัง Y ที่สาขา A = ว่าง · ที่สาขา B = เจอ | X2 |
| P1.1-S3.6 | C4/D1 ผู้จัดการสาขาสีลมใน POS สองสาขา: เขียนสินค้าทุกสาขาที่ขายที่อารีย์ด้วย (setPrice · updateProduct · archive · trackStock) · createProduct ทุกสาขา · ensureForInvItem (คลังร่วม) · createCategory ทุกสาขา = PERMISSION_DENIED | X3 |
| P1.1-S3.7 | C4 ย้ายสาขา: ผู้จัดการย้ายของสาขาตัวเองเป็นทุกสาขา = PERMISSION_DENIED · ไปสาขาที่ไม่มีสิทธิ์ = NOT_FOUND · แก้/ตั้งราคาของสาขาตัวเองได้ · เจ้าของย้ายทุกสาขา→สาขาเดียวได้ | X3 |
| P1.1-S3.8 | C4 หมวด: สินค้าสาขาสีลม + หมวดของสาขาอารีย์ = VALIDATION · หมวดทุกสาขาใช้ได้ | - |
| P1.1-S3.9 | C5 byBarcode คืน {items} 0..n · บาร์โค้ดซ้ำใน legacy = 2 รายการ ลำดับคงที่ (เรียกสองครั้งได้ลำดับเดิม) | - |
| P1.1-S3.10 | C6 listForUnit ไม่ส่ง limit = 100 + nextCursor · limit 1000 = ตัดเหลือ 500 ไม่ error · เดินหน้า 100 ครบทุกแถวไม่ซ้ำ | - |
| P1.1-S3.11 | C6 (static) ค้นด้วยคำสั่งเดียว: listForUnit ไม่มี take: 2000 / invItem.findMany ก่อน · toViews ไม่ filter ต่อแถว (ใช้ Map) | - |
| P1.1-S3.12 | C7 ทีละขั้นด้วย fixture: salePrice>0 ชนะ posPrice · posPrice ใช้เมื่อ posEnabled · posEnabled=false ไม่นับ · AccountProduct เก็บถาวร/สมุดบัญชีอื่น/ผูกครึ่งทาง (AP.invItemId) ไม่นับ · salePrice 0 + ต้นทุน>0 = null · 0 + ต้นทุน 0 = 0 · ราคาติดลบ = null | X4 |
| P1.1-S3.13 | C7 ตัวนับใน dry-run: soldAtCostToday (+ ตัวอย่างชื่อ) · zeroPriceProduct · zeroPriceMenu · zeroPriceWeb · invalidLegacyPrice · posPriceDiffersFromSalePrice | - |
| P1.1-S3.14 | C8 VAT: สมุดบัญชีที่ผูก POS ไม่จด VAT → vatRateBp null · จด VAT → ค่าจาก AccountProduct | X8 |
| P1.1-S3.15 | C9a เว็บร้านผูก InvItem ของ POS แรก = ชี้แถวเดิม ไม่แก้แถวร่วม · นับ shopPriceDiffersFromCatalog + shopInactiveLinked | - |
| P1.1-S3.16 | C9b เว็บร้านผูก InvItem นอกคลังของ POS แรก = แถวของตัวเองใน POS แรก (invItemId ตั้ง · unitId สาขาร้าน) + นับ shopOwnRowInvItemOutsideFirstPos | - |
| P1.1-S3.17 | C9c invItemId ชี้ InvItem ที่ไม่มีแล้ว = แถวของตัวเอง invItemId null + นับ shopDanglingInvItem · สาขาไม่อยู่ใน POS แรก = นับ shopBranchNotInFirstPos (unitId สาขาร้าน) | - |
| P1.1-S3.18 | C10 createProduct: MENU/BUNDLE + invItemId = VALIDATION · InvItem เก็บถาวร = VALIDATION · ชนิดไม่ตรง = VALIDATION · บาร์โค้ดเท่ากับ InvItem ของตัวเองได้ · P2002 → CONFLICT (static) | X4 |
| P1.1-S3.19 | C11 setPrice 2 เลนพร้อมกัน × 5 รอบ = audit ต่อเป็นสาย (ก่อน→หลัง ต่อกัน) · archive 2 เลนพร้อมกัน = ทั้งคู่คืน archivedAt ที่เก็บจริง | X6 |
| P1.1-S3.20 | C12 สาขาเก็บถาวร: เมนูไม่ถูกผูก · listForUnit = NOT_FOUND · POS ที่ปิดใช้งาน (เก่ากว่า) ไม่ถูกเลือกเป็น POS แรก | X2 |
| P1.1-S3.21 | C13 backfill: prod ไม่มี --tenant/--all = ปฏิเสธ (static) · movement ใช้ groupBy/DISTINCT ไม่โหลดทั้งหมด · ตัวเลือกเมนูจัดกลุ่มด้วย Map · JSON_SUMMARY มีตัวนับครบทุกชื่อ | - |
| P1.1-S3.22 | M1 ไม่มี index บนคอลัมน์เชื่อมของ 5 ตารางเดิม (SQL · schema · DB) | - |
| P1.1-S3.23 | M2 คำสั่งแรก SET LOCAL lock_timeout · ALTER TABLE … ADD COLUMN ของตารางเดิม 5 ตัวอยู่ท้าย (ก่อน RESET lock_timeout ตัวสุดท้าย · DO-block นับเป็นคำสั่งเดียว) | - |
| P1.1-S3.24 | M3 SQL: "trackStock" BOOLEAN nullable ไม่มี DEFAULT | - |
| P1.1-S3.25 | M4 index PosProduct(systemId, archivedAt, name, id) | - |
| P1.1-S3.26 | M5 partial unique PosCategory(systemId, name) WHERE unitId IS NULL | - |
| P1.1-S3.27 | D1 ผู้จัดการร้านสาขาเดียว (unitAccess=[สาขานั้น]) และผู้จัดการที่ระบุทุกสาขาเอง ([สีลม, อารีย์]) เขียนสินค้า/หมวดทุกสาขาได้ (createProduct · setPrice · updateProduct · archive · createCategory) | X3 |
| P1.1-S3.28 | D1+C3 ผู้จัดการสาขา A ใน POS สองคลัง: สินค้าทุกสาขาที่ขายได้เฉพาะ A (คลัง X) แก้ได้ · ของคลัง Y และไม่ผูกคลัง = PERMISSION_DENIED | X3 |
| P1.1-S3.29 | D2 (static) ทางอ่านไม่สแกนประวัติ movement ทั้งร้าน: toViews ไม่มี invMovement.groupBy/findMany · มี EXISTS/LIMIT 1 ที่กรอง systemId ของคลัง | - |
| P1.1-S3.30 | D3 ตัวนับ + ตัวอย่าง: apIgnoredButTillPriced (AP เก็บถาวร/สมุดอื่นที่ลิ้นชักคิด salePrice) · priceNotSetOther · servicePriceDiffersFromAccountProduct | - |
| P1.1-S3.31 | D4 คำสั่งสุดท้ายของ migration = RESET lock_timeout | - |
| P1.1-S3.32 | D4 ทุกคำสั่งรันซ้ำได้: CREATE TABLE/INDEX IF NOT EXISTS · ADD COLUMN IF NOT EXISTS · enum/FK อยู่ใน DO $$ … EXCEPTION WHEN duplicate_object | - |
| P1.1-S3.33 | D5 facade (pos/index.ts) ไม่ส่งต่อ backfillCatalog · marker สร้างด้วย Symbol( ไม่ใช่ Symbol.for( · ไม่มี `?? CATALOG_SYSTEM_ACTOR` ใน src | X12 |
| P1.1-S3.34 | D6 createProduct ผูก InvItem ของคลังที่ไม่ได้เสิร์ฟสาขา unitId ที่ส่ง = VALIDATION (ไม่จองช่อง unique ด้วยแถวที่มองไม่เห็น) | X2 |
| P1.1-S3.35 | D6 trackStock true บนบริการ (SERVICE) = VALIDATION ทั้ง createProduct และ updateProduct | - |
| P1.1-S3.36 | D6 createProduct/createCategory ธรรมดาไม่รอล็อกร้านที่อีก connection ถืออยู่ (เสร็จ < 3 วิ) · คู่บวก: createProduct ผูก InvItem ยังรอล็อก | X6 |
| P1.1-S3.37 | D6 byBarcode (UNION) ยังคืนทั้งสองแหล่ง: บาร์โค้ดของแถวเอง + บาร์โค้ดของ InvItem ที่ผูก | - |
| P1.1-S3.38 | D6 สมาชิกที่ยังไม่รับคำเชิญ (acceptedAt null — กติกาบ้าน core/context.ts) = ไม่ใช่สมาชิก → NOT_FOUND | X3 |
| P1.1-S3.39 | D6 zeroPriceWeb นับเฉพาะแถวที่ราคาสุดท้ายคือราคาเว็บ 0 (เว็บร้านราคา 0 ที่ผูก InvItem มีราคาบัญชี ไม่นับ) = 1 ตรง | - |
| P1.1-S1.36 | rollback ปลายทาง: ลบแถวตารางใหม่ที่รันนี้สร้าง + คืนคอลัมน์เชื่อม + ลบ fixtures → ตารางเดิม (จำนวน + checksum) และตารางใหม่ เท่าก่อนรัน · ร้าน QC กลับสภาพเดิม | X5 |

Groups: S1.1–S1.38 + X1/X2/X3/X6/X8/X9 = P1.1a (guard: model+table PosProduct, catalog.ts, backfill script). S2.1–S2.27 + X6.5 = P1.1b (own guard: one of the 8 legacy writer files imports `pos/catalog`; until then the group is skipped and listed in `skippedGroups`).

### X-groups that do not apply (one line each)
- **X5 void/refund**: P1.1 creates no money documents; the only "reverse" is the migration rollback story → S1.25 (mid-run) + S1.36 (end of run, tagged X5). Void/refund reversal belongs to P1.8.
- **X7 time**: catalogue has no business-day logic; no check depends on a date (no "day N", timestamps only compared to the run start `t0`). Availability windows of MenuCategory are copy-only in P1.1a (R6) — P2.4 owns them.
- **X10 visual / X11 touch**: no UI in P1.1a/b (brief R8). Old screens are asserted at data level (S1.21–S1.23), pixels are the visual lane's.
- **X12 no env**: F15.1 is a static fitness rule; S2.19 imports `scripts/fitness-pos.mts` and checks the baseline is empty (ratchet) — the no-env run of `pnpm fitness` itself is the builder's A5, not this oracle.
- **X4** applied as integer-satang + exact equality (S1.13/14/24/27/28/30); there is no Σpay/VAT math in a catalogue.

## Names I had to invent — first draft (SUPERSEDED where it differs from "Ratified names" above; kept for history)
| name / shape | where used | why |
|---|---|---|
| `CatalogCtx = {tenantId, systemId, actorUserId: string \| null}`; `null` = system caller (backfill / legacy writers) — permission checks skipped, tenant/system checks still apply | every catalog call | brief gives the ctx keys but not the system-caller convention |
| every catalog function takes an optional **trailing `client`** (PrismaClient or tx) like `createSale(input, client)` | X6.2–X6.5 lanes on separate connections | needed to race on separate connections; house convention (`createSale`, member facade) |
| refusal = **throw** or return **`{ok:false, reason}`** — the oracle accepts both, never inspects the message | all refusal checks | no error-code contract exists for catalog |
| `createProduct(ctx, {name, nameEn?, kind?, categoryId?, basePriceSatang, vatRateBp?, barcode?, unitId?, invItemId?})` → `{id, …}` (or id string) | S1.27–S1.29, X2/X3 | brief names the function only. `invItemId` of the new row may be null **or** an InvItem in a POS-linked inventory system of the same tenant (builder's choice) |
| `updateProduct(ctx, id, patch {name?, nameEn?, categoryId?})` · `setPrice(ctx, id, priceSatang: number)` (Int ≥ 0 only; NaN/float/string/negative refused) · `archive(ctx, id)` (soft, idempotent) | S1.29–S1.31 | |
| `listForUnit(ctx, unitId, opts? {q?, limit?, cursor?})` → array **or** `{items, nextCursor}`; items = POS-API §1 shape | S1.32/33/37 | brief: server search + pagination; opts names invented |
| `byBarcode(ctx, unitId, barcode)` → product view or `null` | S1.19/34, X2 | |
| `ensureForInvItem(ctx, invItemId)` → `{id, created: boolean}` | S1.35, X6.2 | `created` flag invented (needed to prove idempotency) |
| permission keys: price change = `pos.product.setPrice` (exists today); create/update/archive = **`pos.product.manage`** (spec §9 key, not yet in `src/lib/core/permissions.ts`) · `listForUnit`/`byBarcode` need only unit access (cashier must sell) | X2.3, X3.1–X3.3 | |
| AuditLog rows: `targetType = "PosProduct"`, `targetId` = product id, `actorId` = actorUserId, `action` matches `^pos\.product\.` and contains create/price/archive wording | S1.38 | via existing `writeAudit` |
| PosProduct columns: `systemId, unitId, invItemId, name, nameEn, kind (enum ∋ PRODUCT/SERVICE/MENU/BUNDLE), categoryId, basePriceSatang (nullable), vatRateBp (nullable), stationId, dailyStockQty, images, archivedAt, parentId` | S1.3 etc. | `vatRateBp`, `stationId`, `dailyStockQty`, `images` names invented (R6 says "copy menu fields" without names) |
| `PosProductOptionGroup(productId, groupId → MenuOptionGroup, sortOrder)` · `PosCategory(tenantId, [unitId], name, nameEn, archivedAt)` | S1.16/18, S2.26 | |
| read model: `optionGroups[].id` (or `groupId`), `optionGroups[].choices[].priceDelta` (or `priceDeltaSatang`) · `stock[unitId]` = `InvItem.onHand` (system total — no unit-level stock exists) · `availability[unitId]` boolean | S1.33, S2.27 | §1 gives only top-level keys |
| backfill CLI: `--tenant=<id>` (repeatable) limits the run to those tenants; `--dry-run`; last line `JSON_SUMMARY {dryRun, sources:{invItem,menuItem,shopProduct}, perSystem:{…}, skippedNoPosSystem:{invItem,menuItem,shopProduct}, created:{posProduct,posCategory,posProductOptionGroup,…}, updated:{posProduct,menuItem,shopProduct,…}}` — in dry-run `created/updated` = "would" | S1.6–S1.8, X1.1, X6.1 | without `--tenant` the oracle would backfill every tenant of QC4 (forbidden: temp rows only in POS QC tenants) |
| VAT on PosProduct = `AccountProduct.vatRateBp` copied; no AccountProduct → null | S1.15, S2.11 | VAT per product is nowhere in the POS docs |
| precedence detail: `salePrice = 0` is a deliberate zero (null = unset) and is kept; `posPrice = 0` is ignored (rule says >0); SERVICE `priceSatang = 0` with no AccountProduct → null (default 0 cannot be told from "unset") | S1.13/S1.14 | brief R4 asks the oracle to decide and flag |
| MenuItem with `invItemId` (fixture: menu → Coke InvItem): the **MENU row holds the invItemId** and is the single row of that InvItem (no extra PRODUCT row); its price follows R2 (AccountProduct.salePrice 2000 beats basePrice 2500) | S1.12/S1.14, S2.18 | literal reading of R1; two menus pointing at the same InvItem (unique clash) is NOT tested — needs a ruling |
| dual-write precedence: a legacy price write on a row that is not the top price source (shop price of a shared InvItem, basePrice of a menu whose InvItem has an AccountProduct price) does **not** overwrite `basePriceSatang` | S2.9, S2.18 | no doc covers multi-source rows |
| `catalog.setPrice` on an InvItem with AccountProduct writes `AccountProduct.salePrice` (posPrice null) so the old register (`posCatalog` reads salePrice) shows it; on a SERVICE writes `InvItem.priceSatang` (booking roster follows); on a menu writes `MenuItem.basePrice`; on a shop-only row writes `ShopProduct.priceSatang` | S2.13–S2.15, S2.24 | "AccountProduct ซิงก์ตาม" in DESIGN §4 M4 without detail |

## Contradictions found (documents vs real code) — code wins
1. MIG §2 / old brief: "every MenuItem → new InvItem kind=MENU", "PosProduct 1:1 InvItem" — `InvItemKind` has only PRODUCT/SERVICE (`inventory.prisma:14-17`); InvItem is per inventory system, MenuItem/ShopProduct per unit. Resolved by R1.
2. Old brief: nullable `productId` on `ShopOrderLine` — `ShopOrderLine.productId` already exists (`ecommerce.prisma:58-59`). R3.
3. MIG §2 step 3 names the oracle `qc-pos-catalog-backfill.mts`; P0.3/P1.1a briefs say `qc-pos-p1.1.mts` (used).
4. MIG §1 "CREATE INDEX CONCURRENTLY / -- @concurrent" — impossible inside prisma migrate (repo note in `20260731170000_businessunit_slug_index/migration.sql`). R4.
5. "Price = AccountProduct.salePrice" (MIG/old brief) vs today's register: `posCatalog` uses salePrice **if > 0 else `InvItem.costSatang`** (`pos/register.ts:149`) and services use `InvItem.priceSatang` (`:168-178`); `AccountProduct.posPrice` is written by the account UI but never read by POS. The oracle asserts R2 (never cost) — so for a cost-only item the new catalogue says "price not set" while the old register still shows cost (old screen unchanged, S1.23).
6. Old register list is capped at **200 newest PRODUCT items** (`inventory/service.ts:793-799`). S1.37 seeds 201 temp items: while the oracle runs, the coffee shop's old register (and `posCatalog`) temporarily does not show some seed items — this is why the createSale probe now takes seed ids/prices from `pos-expected.json` instead of the register list.
7. Controller wording "a unit with no POS system ⇒ skipped" vs shop checkout code (first POS of the tenant, unit ignored — `shop/service.ts:217`). The new brief says code wins → oracle links such ShopProducts; only MenuItems are skipped per unit.
8. Spec §9 permission `pos.product.manage` does not exist in `src/lib/core/permissions.ts` (only `pos.product.setPrice`, `pos.sale.create`, `pos.sale.void`).
9. `docs/modules/14-pos.md` §4 `PosProduct` (unit-scoped, own `stockQty`, `price Int`) is the July spec, superseded by DESIGN §7 (stock stays in Inventory) — oracle follows DESIGN + rulings.

## Criteria I could not test (and why)
- Tenant with **no POS system / no INVENTORY system / no ACCOUNT link**: both POS QC tenants have all three and the lane rule forbids creating tenants. Only expressed through computed `skippedNoPosSystem` counts; "no-accounting shop" is approximated by an item without AccountProduct (X8.1).
- **Two POS systems** sharing one inventory (ambiguous InvItem) and **two menus pointing at one InvItem**: need a second POS AppSystem in a QC tenant, which would change the old shop checkout ("first POS") for every other lane's tests while running — left as an open ruling, counted only.
- **Production guard** of the backfill (`ALLOW_PROD_BACKFILL=1` + prior dry-run): cannot be exercised without pointing at prod; reviewer reads the code.
- **"rollback = drop new tables"** literally: not executed (destructive on shared QC4). Replaced by S1.25 (old rows' checksums untouched by backfill) + S1.36 (deleting everything new + nulling link columns restores old tables bit-for-bit, `updatedAt` excluded).
- **P1.1b AI proposal path** goes through `runKind` (S2.22) which may write side rows the oracle does not snapshot (e.g. AI audit tables) — cleanup covers AuditLog and every snapshotted table; anything else would show as leftover only by inspection.
- Pixel parity / old pages rendering: data-level only (S1.21–S1.23); pages need a running app (CONTROLLER-RUN).
- Concurrency with **other lanes** writing the same POS QC tenants during a run can make S1.25/S1.36/row-count comparisons flaky (snapshot-based); run the oracle alone on QC4.

## Acceptance
**A1** `bash scripts/iso.sh bash scripts/qc4.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-pos-p1.1.mts` → exit 0
```
⏭️  SKIPPED — P1.1a ยังไม่สร้าง (ขาด: model PosProduct ใน prisma/schema · ตาราง PosProduct ใน DB (migration ลงแล้ว) · src/lib/modules/pos/catalog.ts · scripts/pos-backfill-catalog.mts)
===== qc-pos-p1.1 ===== ผ่าน 0/0 (SKIPPED)
JSON_SUMMARY {"suite":"qc-pos-p1.1","total":0,"passed":0,"failed":[],"skipped":"P1.1a ยังไม่สร้าง (…)","catalogue":79,"p11bStarted":false,"seeded":true,"missing":[4 items]}
```
POS QC seed **is present** on QC4 (`seeded:true` — `resolvePosScope` coffee + resto found); the oracle never seeds.

**A2** `bash scripts/iso.sh pnpm exec tsx scripts/qc-pos-p1.1.mts --list` → exit 0, no env/DB touched (exits before `loadPosQcEnv`), 79 lines + `รวม 79 ข้อ · P1.1a 51 · P1.1b 28`.

**A3** `bash scripts/iso.sh bash scripts/qc4.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 pnpm exec tsx scripts/qc-pos-p1.1.mts` (note: `QC_FORCE=1` must be inside the iso chain — iso.sh does not forward the caller's env) → exit 1, `ผ่าน 7/79`, no crash, every red names its reason:
- S1.1–S1.5 red: `ขาด: PosProduct,PosCategory,…` / no migration / scope.ts missing models.
- S1.6/S1.7 red: backfill script missing (exit ≠ 0, no JSON_SUMMARY); sections that need the table end with `relation "PosProduct" does not exist` and mark all their ids red.
- S1.26 red `catalog ขาด: createProduct,…`; the catalog section marks its 23 ids red with that reason; S2 group (forced) red with `ไม่มี catalog.ts`.
- Green under force, correctly: S1.21–S1.25 (no backfill happened, so old screens/createSale/old rows are trivially unchanged — they are regression guards), X9.1 (no pos.* events emitted), S1.36 (cleanup restored everything).
- `ROWCOUNTS_BEFORE` = `ROWCOUNTS_AFTER` in the forced run too (all fixtures — 214 InvItems, temp unit, menus, shop products, option groups, AccountProducts — removed).

**A5** QC4 left as found — POS QC tenants row counts identical before/after in every run (SKIPPED and forced):
`{"BusinessUnit":3,"AppSystemUnit":13,"InvItem":9,"InvItemImage":0,"InvLocationStock":3,"InvMovement":3,"AccountProduct":8,"MenuCategory":3,"MenuItem":4,"MenuOptionGroup":0,"MenuOptionChoice":0,"MenuItemOptionGroup":0,"KdsStation":2,"ShopProduct":0,…,"BookingService":0,"Membership":4,"AppSystem":8,"OutboxEvent":0}` (forced run: S1.36 green = legacy + new tables checksum-identical to the pre-run snapshot, cashier Membership.permissions restored).

**A6** this file.

**A4** typecheck — see below.

### A4 typecheck (lane rule 5 command)
- run 1: `env NODE_OPTIONS=--max-old-space-size=5632 ISO_MEM=6500M bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm typecheck` → exit 2 · 1 error, in this oracle only: `scripts/qc-pos-p1.1.mts(737,60): error TS7053` (`after[k]` on a typed object) → fixed by typing `after: Any` (no behaviour change; A1 re-run exit 0 SKIPPED).
- run 2 (allowed because run 1 found errors): same command → **exit 0** (`tsc --noEmit`, no output).

## Temp data left
None. Every run printed identical `ROWCOUNTS_BEFORE`/`ROWCOUNTS_AFTER` for the POS QC tenants; the forced run's S1.36 confirms legacy + new tables are checksum-identical to the pre-run snapshot. Scratch logs only in the session scratchpad (not in the repo).

## Ratification round (controller 1 Oct) — what changed
- Refusal checks now require a thrown error with the exact `code` (S1.28 VALIDATION×3 + CONFLICT, S1.30 VALIDATION, X2.1–X2.3 NOT_FOUND, X3.1/X3.3 PERMISSION_DENIED); `{ok:false}` = fail.
- S1.32 requires `{items, nextCursor}`; S1.37 pages only via `nextCursor`.
- New: S1.39 createCategory (+ X2.2 other-tenant unit NOT_FOUND, X3.3 cashier PERMISSION_DENIED), S1.40 `kind` defaults to PRODUCT + availability via `updateProduct`, S1.41 trackStock backfill rule + flip; S1.3 asserts `trackStock NOT NULL DEFAULT false`.
- Menu ruling b: S1.10 (MENU, invItemId null, RecipeLine qty 1 when MenuItem.invItemId set), S1.12 (Coke PRODUCT 2000 + MENU 2500 + RecipeLine), S1.14 (menu→Coke uses basePrice 2500), S2.18 (menu basePrice edit moves the MENU row to 2600, Coke PRODUCT stays 2000, still 1 RecipeLine).
- Header: "run alone" rule.
- Final runs (no typecheck this round, per controller): `--list` exit 0 `รวม 82 ข้อ · P1.1a 54 · P1.1b 28` · A1 exit 0 SKIPPED `ผ่าน 0/0 (SKIPPED)` · `QC_FORCE=1` exit 1 `ผ่าน 7/82` (same 7 trivially-green guards; every red names missing table/script/catalog), ROWCOUNTS before = after.

## Round 2 (brief P1.1a-R2 · oracle writer · run on `wip/pos-p1.1a` e4531ab1 code, QC4 with migration applied)
Worktree `/root/projects/shark-pos-p11`. `--list` → `รวม 108 ข้อ · P1.1a 80 · P1.1b 28` (was 82 · 54 · 28). No typecheck this round (builder's final typecheck covers the file).

### Check ↔ C/M item
| item | checks (new = S3.*, changed = S1.*/X*/S2.*) |
|---|---|
| C1 system actor | S3.1 (new) · every `actorUserId: null` → `ctxSys()` marker (S1.35, X2.2, X6.2, S2.*) |
| C2 trackStock tri-state | S3.2, S3.3 (new) · S1.3 (column nullable, no default) · S1.41 rewritten (false/null round-trip, true w/o invItem = VALIDATION) |
| C3 multi-warehouse | S3.4, S3.5 (new; temp POS + 2 temp branches + 2 temp warehouses, all tagged and removed) · S1.33 expected set filtered by the branch's warehouse |
| C4 branch authority | S3.6, S3.7, S3.8 (new; seed cashier temporarily MANAGER of Silom, restored) |
| C5 byBarcode `{items}` | S3.9 (new, duplicate barcode) · S1.19, S1.34, X2.2 changed to `{items}` |
| C6 paging/search | S3.10 (default 100, 1000→500, stable paging), S3.11 (static: no `take: 2000`, no pre-query, Map in toViews) · S1.37 bulk 201→520 · all full-list reads now page via `nextCursor` |
| C7 price | S3.12 (each rung with own fixture), S3.13 (counts + sold-at-cost sample) · S1.14 / expected-price formula rewritten · S2.25 rewritten |
| C8 VAT | S3.14 (resto book temporarily non-VAT, restored) · S1.15 formula |
| C9 ShopProduct a–d | S3.15, S3.16, S3.17 · S1.11 per-case logic · S1.9 counts the InvItem's row per selling system |
| C10 createProduct validity | S3.18 (+ static P2002→CONFLICT) |
| C11 audit chain | S3.19 (setPrice ×2 lanes × 5 rounds; archive ×2 lanes × 3 rounds) |
| C12 resolver | S3.20 (archived branch linked to the seed POS + older inactive POS) · resolver helpers in the oracle exclude archived/inactive, first POS = active by `createdAt, id` |
| C13 backfill | S3.21 (static prod-flag rule, groupBy/DISTINCT, Map, all count names present) |
| M1–M5 | S3.22 – S3.26 |

### Result on current code (e4531ab1) — `ผ่าน 40/80` (P1.1b group skipped by its guard), exit 1, no crash, `ROWCOUNTS_BEFORE = ROWCOUNTS_AFTER`, S1.36 green (QC4 back to 13 products / 3 categories / 4 menu links)
RED for the targeted item: S1.3 (trackStock NOT NULL DEFAULT false) · S3.22–S3.26 (indexes on old tables, first statement is CREATE TYPE, ADD COLUMNs at positions 1–5, trackStock NOT NULL DEFAULT, no M4 index, no M5 partial unique) · S1.6 / S1.10 / S3.20 (archived branch counted as having POS) · S1.14 / S1.15 / S3.12 (posPrice beats salePrice, archived / foreign-book / half-link AP used, cost-only rows fine but sale 0 + cost → 0, negative prices kept) · S3.13 / S3.21 (no named counts) · S3.15–S3.17 · S1.19 / S1.34 / S3.5 / S3.9 (byBarcode returns a single row) · S3.1 (no marker export; null accepted ×12) · S3.2 / S1.41 (trackStock frozen boolean) · S3.4 (other warehouse leaks into list) · S3.6 / S3.7 / S3.8 (branch manager writes all-branch rows, moves to null, foreign-branch category accepted) · S3.10 / S3.11 (no default limit, 1000 ⇒ VALIDATION, take:2000 pre-query, filter per row) · S3.18 (MENU+inv, archived inv, kind mismatch accepted; no P2002 mapping) · S3.19 (audit `100→300, 100→200`; archive returns its own timestamp).
RED by cascade (green once the item named is fixed): S1.11 / S1.12 / X6.1 (first-POS picks the older INACTIVE temp POS → shop rows linked there or skipped — C12) · S1.35 / X6.2 / S3.3 / S3.14 (system-caller marker not recognised → NOT_FOUND — C1) · X2.2 (byBarcode shape — C5) · S3.18 bundle/own-barcode (the MENU+inv product was wrongly created first — C10).
Unchanged checks stay green (schema basics, S1.7/S1.8 counts, S1.13/S1.16–S1.18, old screens S1.21–S1.25, X1.1, catalog API S1.20/S1.26–S1.33/S1.37–S1.40, X2.1/X2.3/X3/X6.3/X6.4/X8.1/X9.1, S1.36).

### Could not test / test only statically
- C13 "production host without `--tenant`/`--all` refuses": static only (cannot point at prod).
- C6 "single query / Map in toViews" and C10 "P2002 → CONFLICT": static source checks (no deterministic way to force a raw unique violation through the pre-checks).
- C2 "receipt after creation" emulated by inserting an `IN` InvMovement + `onHand` directly (calling `inventory.receive` would post GL entries the snapshot does not cover).
- M2 "SET LOCAL has effect inside prisma migrate's wrapping": static only (first statement text); the builder must verify and may use the working form — then S3.23's regex (`SET (LOCAL)? lock_timeout`) still accepts `SET lock_timeout`.
- M5 fallback ("advisory-lock guard if no partial-index precedent works with drift"): S3.26 asserts the index; a documented fallback needs an ORACLE-EDIT.
- M6 rollback rehearsal: builder's job (not observable from the oracle beyond S1.36).

### Oracle choices the controller should ratify (round 2)
- Moving a product to a branch the actor cannot access ⇒ `NOT_FOUND` (404, as `assertUnit` does today); moving to `null` without all-branch rights ⇒ `PERMISSION_DENIED`.
- Product + category of a different branch ⇒ `VALIDATION`.
- `salePrice 0 && cost 0 ⇒ 0` is evaluated AFTER the menu/shop rungs (only reachable for InvItem rows).
- C9b own row in the first POS has `unitId = ShopProduct.unitId` — so it is invisible on tills unless that branch's warehouse is the InvItem's (consistent with C3); S1.33 expects that.
- Counts may sit at top level or under `summary.counts`; the sold-at-cost sample is matched by product name anywhere in the summary.

### Lines in `scripts/qc-pos-p1.3.mts` (lane 4, NOT edited) that must change
- L27–29 (header comment): ctx `actorUserId|null` → `actorUserId | CATALOG_SYSTEM_ACTOR` (C1); `byBarcode` → `{items}` (C5); `listForUnit` default limit 100 (C6); trackStock tri-state (C2).
- L686–688: `cctx` comment says `actorUserId|null` — owner id is still fine (owner is all-branch, C4); any system-level call must use `catalog.CATALOG_SYSTEM_ACTOR`.
- L701 comment "trackStock = column, not computed at read time" is now wrong (C2 AUTO).
- L708 `createProduct(…, { trackStock: false })` — still legal (explicit off), but the C2 contract wants `null`/omitted unless the test means "off".
- L727 `const full = { trackStock: stock !== null, …patch }` — sets an explicit value; for C2 the "stock-tracked" fixtures should leave `trackStock` unset (AUTO after `inventory.receive`) or the register oracle stops testing AUTO; a `"consumed"` fixture with explicit `true` stays valid.
- L618, L758 (`registerCatalog` full grid) and L775–790 (S1.17 >200 items): if `registerCatalog` delegates to `listForUnit`, it now gets 100 rows per page (C6) — the register builder must page or the oracle must assert paging; S1.17 by name/SKU/barcode search stays valid.
- No `byBarcode` call in that file today (only comments); if added, use `{items}`.

### Debts (brief §C) — not oracle work
Cross-module raw reads (N5) → P1.1b · editable web-only rows / channel price → P2.8 · trigram search → P5.3 · backfill vs writer lock contention → P6.1 runbook · `pos.product.manage` visible before enforced → P1.1b (or `planned` flag).

## Round 3 (brief P1.1a-R3 · run on `wip/pos-p1.1a` a0e248eb code, QC4)
`--list` → `รวม 121 ข้อ · P1.1a 93 · P1.1b 28` (round 2: 108 · 80). Controller's ORACLE-EDIT on X3.2 (target = Silom product) kept as written.

### Check ↔ D item
| item | checks |
|---|---|
| D1 scope rule | S3.27 (new: single-branch-shop manager via a temp one-branch POS · manager with `unitAccess [Silom, Ari]`) · S3.28 (new: A-only manager in the temp two-warehouse POS — all-branch row of warehouse X allowed, of Y / without InvItem refused) · S3.6/S3.7/S3.8 kept: the Silom-only manager in the two-branch seed shop is still refused under D1 (titles clarified) |
| D2 | S3.29 (static: no movement `groupBy`/`findMany` outside `planTenant`; an `EXISTS … "InvMovement" … "systemId"` or `invMovement.findFirst(… systemId …)` present). Dynamic version not meaningful: a movement row's `systemId` always equals its item's warehouse in this data model, so a tenant-wide vs warehouse-filtered lookup returns the same answer on any fixture. |
| D3 | S3.30 (≥ fixture counts + sample names; new fixture `d3-svc-diff`) |
| D4 | S3.31 (RESET last), S3.32 (every statement guarded) · S3.23 now treats a `DO $$…$$` block as one statement and expects the 5 ADD COLUMNs right before the final RESET |
| D5 | S3.33 (facade, `Symbol(` + `Symbol.keyFor(marker) === undefined`, no `?? CATALOG_SYSTEM_ACTOR` in `src/`) — F15.5 itself and its negative proof are the builder's |
| D6 | S3.34 (wrong warehouse ⇒ VALIDATION, positive control at the right branch) · S3.35 (SERVICE trackStock true, create + update) · S3.36 (tenant lock held on a separate connection: plain createProduct/createCategory must finish < 3 s; positive control: an invItem create still waits) · S3.37 (byBarcode returns own-barcode row + InvItem-barcode row) · S3.38 (seed cashier `acceptedAt` set to null for the call, restored) · S3.39 (`zeroPriceWeb` = 1 exactly; new fixture: web row price 0 linked to the water InvItem must not count) |
| D7 / X3.3 | X3.3 now: Silom STAFF without `pos.product.manage` creates a SILOM product / SILOM category, updates/archives a Silom product ⇒ PERMISSION_DENIED (tests the key, not the branch rule) |

### Result on current code (a0e248eb) — `ผ่าน 82/93` (P1.1b skipped by guard), exit 1, no crash, ROWCOUNTS before = after, S1.36 green
RED (11, all new, each for its D item): S3.27 (single-branch / explicit-all managers refused — createProduct PERMISSION_DENIED; the later setPrice/update/archive NOT_FOUND are a cascade of the missing id) · S3.28 (all three PERMISSION_DENIED — row sellable only at A refused) · S3.29 (`invMovement.groupBy` by tenant in `toViews`) · S3.30 (no `apIgnoredButTillPriced` / `priceNotSetOther` / `servicePriceDiffersFromAccountProduct`) · S3.31 (last statement is an ADD COLUMN) · S3.32 (28/29 statements unguarded) · S3.33 (`export * as catalog` exposes `backfillCatalog`) · S3.34 (wrong-warehouse create accepted; the positive control then CONFLICTs on the occupied slot — cascade) · S3.35 (SERVICE trackStock true accepted twice) · S3.36 (plain createProduct waits behind the held lock; createCategory already fine; control waits as it should) · S3.38 (unaccepted membership accepted).
GREEN already (guards for the builder's rewrites): S3.37 (both barcode sources), S3.39 (zeroPriceWeb = 1), S3.6–S3.8, X3.3, all round-1/2 checks.

### QC4 incident during this round (fixed)
The first round-3 run touched a seed product (the gift service) to test S3.35 and restored the value but not its `updatedAt`, leaving 2 AuditLog rows — S1.36 caught it (`PosProduct ~1`). Repaired by hand on QC4 (`updatedAt = createdAt`, as on its 12 siblings from the same backfill; the 2 audit rows deleted) and S3.35 now uses its own temp service. Second run: S1.36 green, ROWCOUNTS equal, 13 products / 3 categories / 4 menu links intact.

### Lines in `scripts/qc-pos-p1.3.mts` (not edited) affected by round 3
Nothing new beyond round 2's list, except: any fixture that relies on an all-branch product being writable by a branch-limited manager now follows D1 (scope = branches where sellable).
