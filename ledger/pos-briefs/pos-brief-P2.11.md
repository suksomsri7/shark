# Brief: P2.11 หลายสาขา (ราคา/เลขใบเสร็จ/รายงานรวม/สต็อก/โอน + P2.2U F4) + P2.11 follow-up bucket · lane B · ⏮ P2.2 · DRAFT by brief drafter (account B) 15 Oct 2026. Controller rules in §10.

Brief draft · 15 Oct 2026 · read-only survey of `session/pos` **bf8ca2bf** (code 3dd0639d; working tree f164d9d6 = bf8ca2bf + ledger only). Plan row `POS-MASTER-PLAN.md:86` (~30 · X2 · mockup 08); next row P2.12 "รายงานช่องทาง/สาขา/ผิดปกติ + PDF" `:87`. Design M12 `DESIGN-POS.md:253` ("สินค้า/ราคา/สต็อก ต่อสาขา · เลขใบเสร็จต่อสาขา · รายงานรวม [P2]"), M6 `:210` (รับ/โอนระหว่างสาขา = หน้าคลังเดิม + ทางลัด), M11 `:247` (เปรียบเทียบสาขา · ช่องทางหลังหักค่าคอมฯ), M8 `:230` (หลายกะต่อสาขา/เครื่อง). Owner O2 `POS-OWNER-PENDING.md:11` ("เลขวิ่งต่อสาขา/เดือน = เลขใบกำกับอย่างย่อ · ใบคืนเงินเลขชุดแยก · เลขต่อเครื่องตัดสินตอน P3.4").

⚠️ Prompt-vs-code (read these first):
1. **Branch compare in 08 is already built** (P1.17U R6/R7): `report-overview.ts:34` section `branches`, fan-out `:163–191` (≤ 8 units `:39`, 3 at a time, > 92 days refused), UI `ReportsOverview.tsx:452` + total row `:493`, pinned by `qc-pos-p1.17` OV4 `:88`. The **tenant roll-up already exists**: `ReportCtx.unitId` optional (`reports.ts:46`), no unit = every permitted unit (`scopeOf` `:297–323`). What 08 still lacks is the **channel block** ("ช่องทางการขาย % ของยอด … หักค่าคอมมิชชันแล้ว", `08-reports.body.html`), which the UI defers to "ช่องทาง P2.11" (`ReportsOverview.tsx:8`). There is no channel reader in `reports.ts`.
2. **Receipt numbers are already per branch/month**: `PosReceiptCounter @@unique([unitId, period])` (`pos.prisma:213–221`), `PosDocCounter @@unique([unitId, docType, period])` (`:225–234`), `PosSale @@unique([unitId, receiptNo])` (`:136`), format `YYYYMM-NNNN` (`service.ts:747–753`), CN `refund.ts:596–603`. What is **not** per branch is the tax identity on the receipt: "สาขาที่" = the linked book's `branchCode` (`receipt.ts:213–217, :301`), one book per POS system (`account/index.ts:66–72`), so every branch of one POS prints the same branch number. That is the real RN gap.
3. **Per-branch stock is "one inventory system per branch"**. A unit maps to an inventory through `AppSystemUnit @@unique([tenantId, unitId, type])`. The POS cut never passes a location (`service.ts:1032–1042` → `consumeBatch` → `resolveLocationId` default `inventory/service.ts:263–272`). `InvLocation` has no `unitId` (`inventory.prisma:117–128`). So two branches on one inventory system **share stock**, and the QC env is exactly that: silom + ari both linked to one INVENTORY system (`seed-pos-qc.mts:232–235`).
4. **Transfer exists only within one inventory system**: `inventory.transfer` (`inventory/service.ts:923–1010`), with the POS shortcut `posTransferStock` (`stock-count.ts:888–931`, R16 same-inventory `:900–902`). Two-step "รอรับที่ปลายทาง" and cross-inventory moves were parked to **P2.12** by P1.14 R16 (`pos-brief-P1.14.md:104`, `StockShortcuts.tsx:5`). Mockup 16 draws the two-step flow ("ปลายทางกด “รับแล้ว” สต็อกจึงย้าย").
5. Per-branch PromptPay and the day cut-off are **already done** in P1.18 Q9 (`payment-settings.ts:252–316`, `payment-intent-shared.ts:39–49`, `settings-general.ts:123, :194`). They are not P2.11 work.

## 0. What exists (verified at bf8ca2bf)
- **Price rows**: `PosProductChannelPrice` {channelCode?, unitId?, priceSatang?, notSold} (`pos.prisma:805–819`); unique `(productId, channelCode, unitId) NULLS NOT DISTINCT` + CHECK hand-written in `20261204100000_pos_p22_prices`; no `archivedAt` on rows (liveness = `SalesChannel.archivedAt` `:764`, `BusinessUnit.status`). (null, unit) = branch price (`pos-brief-P2.2.md:50`, F5 `wo-notes/pos-P2.2.md:82`). Resolver (`price-shared.ts:251–264, :270–295`): (code, u) > (code, *) > (null, u) > base, own row beats parent's, rules on top. Channels per unit, joined by `code` (P2.1 CD1 `pos-brief-P2.1.md:51`, `pos.prisma:801`).
- **06 save path**: `ProductPanel.tsx:104` → `setChannelPricesAction` (`catalog-price-actions.ts:45`, role-level `assertCan` only `:34`) → `setChannelPrices` (`catalog.ts:2332–2393`) = full replace by diff. Input checked against `liveChannelCodes` (`:2279–2286`) and `liveUnitsOfPos` (`:2289–2294`): "ไม่รู้จักช่องทางนี้" `:2356`, "ไม่รู้จักสาขานี้" `:2358`. `beforeRows` unfiltered (`:2363`); `removed` = before − input, deleted (`:2369, :2379`); permission per touched row (`requirePriceRowScope` `:2301–2319`).
  Client: `rowsFromDraft` `keep` (`products-scope.ts:87`) resends every loaded row; rows loaded per visible unit `OR [{unitId:null},{unitId}]`, no channel-liveness filter (`catalog.ts:1128–1131`, `products-data.ts:149–154`); `posUnits` drops ARCHIVED units (`register.ts:101–115`).
- **06 gate**: branch-limited managers get a refusal card via `posCanSetTenantPrice(m, posPriceUnitIds)` (`access.ts:62–73`, `products/page.tsx:47–69`, `pos-products-refusal`), because the base price lives on tenant-wide `AccountProduct` (HF-POS-PAGES decision 1, `wo-notes/HF-POS-PAGES.md:77`); base-price action same gate (`actions/pos.ts:483–484`); pinned by `qc-hf-pos-page-authz` P-7 (`:72–89`). (null, unit) row has no editor cell in 06 (`wo-notes/pos-P2.2U.md:62`).
- **Settings matrix** (who is per unit today):

  | Setting | Scope | Evidence |
  |---|---|---|
  | PromptPay | per unit (fallback: profile) | P1.18, above |
  | Oversell policy | per unit | `BusinessUnit.settings.pos.stock.oversellPolicy`, `settings-general.ts:311–363` |
  | Channels / commission | per unit | `SalesChannel @@unique([unitId, code])` `:772` |
  | Devices / `posRegNo` · shifts / Z · stock counts | per unit | `pos.prisma:519–532` (printed `receipt.ts:229–235`) · `:432, :456–457, :480` · `:555, :578` |
  | Service charge / tip | per POS system | `payment-settings.ts:65–84` |
  | Receipt header/footer/address/phone/refund prefix | per POS system | `receipt-settings.ts:68, :94–120` (writer: `pos.device.manage` at every unit `:60–64`) |
  | VAT rate / inclusive / ABB · tax branch no. | per POS system's book | `service.ts:458–468`, `account_gl.prisma:661–677`, `receipt.ts:301` |
  | Day cut-off, held cart, auto-lock, shift, weighed barcode, receipt locale | per POS system | `settings-general.ts:116–128` |
  | Recipes | product-wide | `RecipeLine` has no unitId `:341–354`; "สูตรไม่แยกสาขา" `products-data.ts:126` |
- **Unit-limited members**: `unitAccess` `["*"]|ids` (`core/rbac.ts:17`). `canAccessUnit` is true when no unit is passed (`:22–25`). `allBranches` = OWNER or `"*"` (`access.ts:16–17`). The unit switcher is always `?unit=` (`register/page.tsx:39–67`, `ReportsClient.tsx:448`, `StockClient.tsx:124`, `BillsClient.tsx:1062`).
- **QC env**: silom "สาขาสีลม" + ari "สาขาอารีย์" (`scripts/pos-qc-env.mts:211–214`). Both are linked to one POS / INVENTORY / ACCOUNT / MEMBER / POINT system (`:215–221`). The cashier has silom only (`:224–225`). No channel-price rows are seeded.
- **Oracles touching units**: `qc-pos-p2.2` A/B `:993` (C1/C3/C5/Q3; no archived-row check ⇒ F4 unpinned) · `qc-pos-p1.17` u1–u3 (D4, TX1 `:729–741`, OV1/OV4) · `qc-pos-p1.16` B1 `:56` · `qc-pos-p1.18` U1/U2 `:90–92`, B3 `:69` · `qc-pos-products` `:94–96`. Format pins: `qc-pos-closeday.mts:120` `/^\d{6}-\d{4},/`, `qc-pos-p1.8.mts:856` `/^CN\d{6}-\d{4}$/`, `qc-pos-p1.10` P1 `:1210` (`branchNo === BOOK.branchCode`).

## 1. Scope split (proposal)
**P2.11 S** (server, lane B, ~32 checks):
- **PR**:
  - F4 fix (§2).
  - **Branch-scoped save**: rows outside the caller's reach are preserved. The same mechanism lets a branch-limited manager save (x, own unit) rows, which reopens 06 to them in U.
  - `copyUnitPrices` (branch → branch, F5).
  - Compare reader `unitPriceMatrix`: the effective price per product × unit × channel via `resolveUnitPrice`, read-only.
- **RN**: per-unit tax branch number + per-unit receipt address/phone override (§4). Number format unchanged (O2).
- **RP**: `reportChannels` reader + overview section `channels` (§5).
- **SK**: an exported shared helper `posUnitInventoryMap` (unit → inventory system, `shared` groups). This replaces the private `inventorySystemsOfPos` copies (`catalog.ts:413`, P2.3U F5). It feeds 06/16 "คลังร่วมกับ…" notices. No change to stock cuts (§6).
- **FU subset**: k, l-price, m(i) (§3).

**P2.11U** (mockups 06/08/16/17A): 06 "สาขา: …" filter + branch column, (null, unit) editor cell, copy-from-branch dialog, compare view ("ขายที่ 2 สาขา") · 06 branch-manager mode (base price read-only, own-branch rows; ORACLE-EDIT `qc-hf-pos-page-authz` P-7) · 08 channel block · settings receipt tab per-branch "สาขาที่ / ที่อยู่ / โทร" · 16 shared-inventory notice · all-branch bills list shows the branch beside `receiptNo` (numbers repeat across branches).
**P2.12, not P2.11**: two-step / cross-inventory transfer (R16) · per-location stock cut inside a shared inventory (Q3) · hourly, anomalies, PDF · P2.2 F7/F8 (`pos-P2.2.md:83–84`) · D6/D8 movement-join readers (m ii/iii) · per-station 09 split.
**Out / owner lines**: per-branch recipes (P2.3 Q4 `pos-brief-P2.3.md:74` needs `RecipeLine.unitId`; a branch-only `PosProduct.unitId` row covers it today) · per-branch service charge (Q5) · full tax invoice (account doc) branch code (account owner).

## 2. P2.2U F4: the exact defect and the fix
- **Half A (archived custom channel)**:
  1. The archived channel's rows are still loaded (`catalog.ts:1128`, no liveness filter).
  2. `keep` resends them (`products-scope.ts:87`).
  3. The server refuses the whole save with "ไม่รู้จักช่องทางนี้" (`catalog.ts:2356`).
  4. So that product's prices can **never** be saved from 06 again. Today the UI only shows the service text (`ProductPanel.tsx:108–111`, `price-ui.tsx:144`).
- **Half B (archived/unlinked branch, builder F6 `pos-P2.2U.md:64`)**: the unit is not in `posUnits`, so its rows are never loaded. They land in `removed` and are **deleted silently** (`:2369, :2379`), and unarchiving the branch does not bring them back. The same path would delete other branches' rows, or refuse PERMISSION_DENIED, the moment 06 loads only a manager's units.
- **The two named fixes** (`POS-MASTER-PLAN.md:86`):
  - (S) Accept unchanged rows of archived codes.
  - (U) The client strips them with a notice. This leaves half B open, turns half A into a permanent delete, and needs a delete permission on dead units.
- **Recommend (S), widened to "out of reach"**. A stored row is out of reach when its code is archived, its unit is archived or unlinked, or the actor cannot `pos.product.setPrice` at its unit.
  - Out-of-reach rows that are absent from the input are **kept**. Present and `cpSame` = accepted, no-op.
  - Changed or new rows for a dead code or unit = `VALIDATION` with `field:"rows"` and a stable sub-code `PRICE_ROW_DEAD`.
  - Changed or new rows outside the actor's reach = `PERMISSION_DENIED`, and nothing is written.
  - Audit is unchanged (before/after of the full set).
  - The client keeps `keep` as is, so no client change is needed for F4.
- **Oracle**: PR1–PR4 (§7), each red on bf8ca2bf (PR1/PR2 by construction, PR3 via the deleted-row count, PR4 via the manager save).

## 3. Follow-up bucket triage (every P2.11-tagged item; sources from grep over pos-briefs, wo-notes, OWNER-PENDING, RESUME)
Lane-A files in flight in P2.9b (`pos-brief-P2.9b.md` §7/§10): `service.ts`, `register*.ts`, `tender.ts`, `refund*.ts` (R7 cap), `account-bridge.ts`, `refund-consumer.ts`, the `pos.sale.voided` block of `outbox-consumers.ts`, `account/*`, `InterimPayDialog.tsx`, `receipt*.ts` (CD3 title, soft).

| # | Item · source | Owner module · size · risk | Recommendation |
|---|---|---|---|
| a | Held-NEW orders never auto-accepted after unpause/drain · `pos-P2.6.md:120`, OWNER-PENDING `:135` | `order.ts:632` + `kds.ts` · M · Med (orders stuck) | **HF-FU** |
| b | Orphan HELD drafts after legacy checkout · `pos-P2.4.md:98` F2, `pos-brief-P2.5.md:124`, OP `:170` | `table.ts`/held-cart · S–M · Low | **HF-FU** (sweep on read + expire) |
| c | EQUAL remainder rotation (phantom service ≤ ฿2) · `pos-P2.5-review.md:10–14, :93`, OP `:167` | `table-split-shared.ts:57, :164–175` pure · S · Low money | **HF-FU** + ORACLE-EDIT p2.5 row 12 + hunter |
| d | Legacy `mergeSession` does not repoint DONE plans · `pos-P2.5-review.md:123–124` | `actions/restaurant.ts:289–294`, `table-split.ts:605` · S · Low | **HF-FU** (refuse when from-session has DONE plans) |
| e | P2.5 F6 split guards outside legacy tx · `pos-P2.5.md:154`, OP `:192` | legacy page + `ai/proposals.ts:1355` · M · Med | **P2.14** (retire legacy checkout + AI close-bill) |
| f | P2.5U "…" stuck on failed detail fetch · `pos-P2.5U-review.md:22` | `TablesScreen.tsx:332–350` · S · UI | owner line → P2.14 UI sweep |
| g | PIN hashed twice on part pay · `pos-P2.5-review.md:119` | `service.ts:305, :605, :616` + contract sha · S · perf only | **defer**: batch with the next contract change (P2.13); lane A |
| h | Shared pure `refundTenderCaps` · `pos-P2.9U-review.md` L2, OP `:195` | `refund.ts:374` + `refund-tenders.ts:13–51` · S · **Med now** | **fold into P2.9b** (R7 changes the cap; the preview copy would diverge), Q1 |
| i | C7 tighter probe · `pos-P2.5-review.md:116` | `qc-pos-p2.5.mts:2371–2385` · S · oracle | **HF-FU** (ORACLE-EDIT) |
| j | `onSaleVoided` swallowed in `compose` · `pos-P2.8.md:192`, OP `:114` | `outbox-consumers.ts:758` (lane A block) · S · Med | **HF-FU after P2.9b merges**, or a P2.9b addendum (Q2) |
| k | `qc-pos-p2.2` ST1 filter misses index/enum/DROP-only migrations · `pos-P2.8.md:162` | `qc-pos-p2.2.mts:313, :355` · S · oracle | **P2.11** (same suite, FU1) |
| l | en VALIDATION keys / finer codes · P2.3U F3 (`recipe-ui.tsx:54–56`), P2.8U F3/F7, P2.2U-R2 N2 (`BulkMarkupDialog.tsx:69` matches "500" in Thai text) | catalog codes + UI · M | **split**: price/bulk codes + `field` → **P2.11** (FU2, same functions); recipe/orders keys → HF-FU |
| m | P2.3U: (i) `PosRecipeChoiceLine` not deleted on unlink/archive · (ii) D8 history label · (iii) drawer cost/margin · `pos-P2.3U-review.md:7, :53, :59` | (i) `catalog.ts:2003` S · (ii)/(iii) movement-join readers M | (i) **P2.11** (FU3, catalog.ts) · (ii)/(iii) **P2.12** |
| n | P2.8U G3 cancel stays disabled while the voided consumer lags · `pos-P2.8U-review.md:10, :18` | `OrderPanel.tsx:59–60` + `order.ts:1026` reader · S | **HF-FU** with j |
| o | KDS audible alert · `pos-P2.6U.md:62` | `KdsScreen.tsx` · S · UI | owner line (needs a sound/permission decision) |
| p | `pre-bill-render.ts:56` th title wraps at 80 mm · `pos-P2.5U.md:59, :87` | renderer · S · cosmetic | **HF-FU** |
| q | `GIFT_CARD_PIN` row index / attempts-left · `pos-P2.9U.md:39, :57` | `register.ts:611`, `service.ts:291–299` (lane A) · S–M | **P2.9bU** (same pay-dialog surface) |
| r | Gift card / store credit (+ `memberChoices`) on table & part pay · `pos-P2.5U.md:54, :61` | `TableCheckout.tsx`, `payOrder` · M | **P2.9bU** or own card, owner line |
| s | Member names (+ `paidMethods`) on split bill cards · `pos-P2.5U.md:53–55, :60` | `table-split-shared.ts:215` reader + `TableSplitDialog` · S | **HF-FU** (server reader) + UI in the same card |

Other P2.11-tagged lines: **P2.11U** P2.2U branch-row editor cell `pos-P2.2U.md:62` · **lane-A owner lines** held-cart `CHANNEL_NOT_SOLD` notice (P2.2 F1), STORE price on platform held-cart tiles (`pos-P2.2U-review.md:80`) · **P2.14** legacy `/restaurant/checkout/<id>` by URL (`pos-P2.4U-review.md:52`), P2.8U V2 harness scrollTop + en "Accept order" wrap · **P2.9bU** P2.6U N1 PayDone false "no kitchen ticket" (`pos-P2.6U-review-R3.md:17–20`) · **HF-FU** P2.8 hunt nits (`pos-P2.8-hunt.md:108, :129`), P2.8U F3 raw prisma read (`order-ui-actions.ts:46–48`) · **P2.12** per-station 09 split / previous-bizDate tickets · **P2.13** gift card via API/online orders (`pos-P2.9-review.md:148`) · **no action** P2.4 hunt R4-1 · **closed** P2.6U G1–G3 (`pos-P2.6U-review.md:95`).

**HF-FU card** (lane C server hygiene: a b c d i n p s + l-rest + hunt nits + F3; j after P2.9b): ~22 checks. Files: `order.ts`, `kds.ts`, `table*.ts`, `held-cart.ts`, `actions/restaurant.ts`, `pre-bill-render.ts`, orders UI. None in P2.11's file set.

## 4. Receipt numbering per branch
- **Today**: per unit and month (§⚠️2); CN per unit/docType/month. Two branches both issue `202610-0001`, which is legal per O2 because each branch is its own series. But the receipt prints one "สาขาที่" for all of them (`receipt.ts:301`, `receipt-render.ts:271`). The device line prints `posRegNo` per device (`receipt-render.ts:352–353`), which is the ภ.พ.06 approval number. Per-device numbering = P3.4 (O2).
- **Proposal R-RN** (no migration; JSON like `promptpayIdByUnit`): `settings.pos.receipt.byUnit.<unitId> = {taxBranchNo?: /^\d{5}$/, address?, phone?}`.
  - Reader `receiptUnitOverride(settings, unitId)`.
  - `buildReceipt` order: branchNo = unit override → book `branchCode` → "00000"; header address/phone = unit override → system header → book.
  - Writer `updatePosReceiptUnitSettings(ctx, actor, {unitId, patch})`. Permission: `pos.device.manage` at **that** unit, plus OWNER/all-branch for `taxBranchNo` (it is a tax identity). Unit must be linked and live; jsonb_set under `FOR UPDATE`; audit `pos.settings.updated` (masked phone, as R6).
  - RECEIPT kind still prints no branch number (`qc-pos-p1.10` P5 `:1303`).
- **Pins**: `receiptNo` format unchanged (closeday `:120`, p1.8 `:856`, p1.17 TX1 fixtures stay green). `qc-pos-p1.10` P1 `:1210` stays green (no override ⇒ book value). No ORACLE-EDIT expected. A branch prefix in `receiptNo` is **rejected** (O2; it breaks 3 suites and the `@@unique([unitId, receiptNo])` meaning).
- **Owner line** (account module): the full tax invoice doc (`AccountDocument`) prints the book's branch. A per-branch value on full tax invoices needs the account owner.

## 5. Consolidated reports (08)
- **Exists**: tenant roll-up (no `unitId`), branch compare (sales, bills, average, margin) with "รวมทุกสาขา", per-unit tax rows (`reports.ts:907–945`), CSV per unit name (`:1050, :1071`).
- **New, reader-only**: `reportChannels(ctx, actor, {from, to})` → rows per `channelCode` (null ⇒ "STORE"):
  - `{billCount, grossSatang, refundSatang, commissionSatang, commissionVatSatang, netSatang, sharePct}`.
  - Source: `PosSale.channelCode / channelCommission*` (`pos.prisma:124–130`). REFUND docs carry the copied channel + commission share (P2.1 CD10). PAID+REFUNDED count, VOIDED excluded.
  - Cut-off, scope and permission go through the same `scopeOf`/`prepare` (`REPORT_PERMISSION`); `unitId` omitted = all permitted units.
  - Join to `SalesChannel` by **code**, name from the selected unit or else the first live unit.
  - Overview gets section `"channels"` (per-section refusal as R6). CSV kind `channels` is optional (Q6).
- No PDF, hourly or anomalies (P2.12). Branch compare is unchanged (OV4 PAR).

## 6. Stock and transfer
- **Per-branch stock today** = separate inventory systems per branch (cuts go to the branch's inventory default location). A shared inventory = shared stock (§⚠️3). A `PosProduct` sells only where its `InvItem`'s system is linked (`catalog.ts:777`). So separate inventories mean separate catalogue rows, with cross-branch identity by SKU.
- **P2.11 S**: no change to cuts. The `posUnitInventoryMap` reader feeds the U notices. Pin R16: `posTransferStock` to a location of another inventory = NOT_FOUND (TR1, PAR).
- **Unit → location mapping inside one inventory** (sales/void/refund/count/availability read by location) touches `service.ts` stock cut + `refund-consumer` restock (lane A) + every stock reader. Size **L** ⇒ P2.12 or later (Q3).
- **Cross-inventory or two-step transfer** needs item mapping by SKU across systems, an in-transit state (new model), and the GL question when the books differ (like P2.9 CD11). ⇒ **P2.12** with the mockup-16 two-step flow (Q4).

## 7. Oracle plan: `scripts/qc-pos-p2.11.mts` (~32 checks; red-before `ledger/wo-notes/P2.11-red.txt`)
**Fixtures** (module functions; raw SQL only for archive flags and cleanup): temp tenant `posqc-p211-<rand>` (+ `-t2` for X2) · POS with units A, B, C (archived after rows are written), D unlinked, E · shared inventory A/B, own inventory E · book VAT 7 % + `posAbbreviatedInvoice`, `branchCode 00000` · custom channel ZZ (archived after rows), LINEMAN · OWNER, MANAGER{A}, MANAGER{A,B}, CASHIER{A}, NOPERM.

**Checks**:
- `ST1–ST4` static:
  - No migration / `pos.prisma` unchanged vs base.
  - Prices still written only in `catalog.ts` (F15.1), `posUnitInventoryMap` exported once and the private copies removed.
  - New codes and messages th/en, en has no Thai.
  - P2.11 diff touches none of the lane-A files listed in §3 except marked hunks in `receipt.ts`.
- `PR1–PR9` prices:
  - PR1: ZZ archived, resend unchanged ⇒ ok, row kept.
  - PR2: ZZ changed/new ⇒ VALIDATION `PRICE_ROW_DEAD`, nothing written.
  - PR3: C-archived rows survive a save that omits them; unarchive ⇒ effective again.
  - PR4: MANAGER{A} saves (LINEMAN, A) + (null, A) with B rows omitted ⇒ ok, B rows byte-identical.
  - PR5: MANAGER{A} touches (x, B) or (code, *) ⇒ PERMISSION_DENIED, nothing written.
  - PR6: `copyUnitPrices` A→B, `overwrite:false` skips existing (x, B) rows, `true` replaces, notSold copied, audit 1/product, rerun `changed:false`.
  - PR7: copy needs setPrice at B; target C/D ⇒ VALIDATION, t2 unit ⇒ NOT_FOUND (X2).
  - PR8: `unitPriceMatrix` equals `priceOf` for every (product, unit, channel) cell (PAR with register).
  - PR9: bulk >500 / dead-row refusals carry `field` (l-price; N2 no substring).
- `RN1–RN5` receipts:
  - RN1: A override 00001 ⇒ ABB payload/HTML/text "สาขาที่ 00001"; B ⇒ book 00000.
  - RN2: address/phone override per unit, others fall back.
  - RN3: writer VALIDATION (4/6 digits, letters, unknown/archived unit), PERMISSION (MANAGER{A} cannot set taxBranchNo; can set address at A only), audit masked.
  - RN4: RECEIPT kind prints no branch.
  - RN5: A and B first sales both `^\d{6}-\d{4}$` with independent seq; CN per unit (O2 pin).
- `RP1–RP5` reports:
  - RP1: channels per unit exact (gross, refund, commission, net) on a fixture of STORE/LINEMAN/refund/void.
  - RP2: all-units = Σ A+B; MANAGER{A} sees A only.
  - RP3: code join across units (LINEMAN on A and B = one row).
  - RP4: cut-off 240 moves a 02:00 sale to the previous day.
  - RP5: overview `channels` section refusal does not break the others; OV PAR.
- `SK1–SK2 · TR1` stock:
  - SK1: the map marks A/B shared and E alone, ARCHIVED excluded.
  - SK2: sale at A cuts the shared default location (pin current behaviour).
  - TR1: cross-inventory location ⇒ NOT_FOUND (R16).
- `FU1–FU3`:
  - FU1: ST1-filter self-test on synthetic index/enum/DROP-only migration text (pure).
  - FU2: recipe choice lines deleted on unlink/archive of the group; re-link starts clean.
  - FU3: price refusal codes en keys exist (static).
- `Z1–Z2`: residue 0 (price rows, AuditLog, PosSale*, counters, settings keys restored) + non-temp fingerprint identical.

**Count**: ST4 + PR9 + RN5 + RP5 + SK2 + TR1 + FU3 + Z2 = **31**. Expected red-before: all but SK1–SK2 (red only on missing export), TR1, ST1, RN5, Z.

**Regression (merge set)**:
- typecheck (pos lock 5632 MB), fitness ±env, `fitness-pos`.
- `qc-pos-p2.11` ×2.
- `qc-pos-p2.2` 42 (+ k ORACLE-EDIT of ST1 filter, own commit), `qc-pos-p2.1` 55, `qc-pos-p1.17`, `qc-pos-p1.16` 28, `qc-pos-products` 24.
- `qc-pos-p1.18` 81, `qc-pos-p1.10` 40 (RN), `qc-pos-p1.10u-print`, `qc-pos-p1.14` (R16), `qc-pos-p2.3` (FU2), `qc-pos-closeday`, `qc-pos-p1.8` 49.
- `qc-pos-p1.1` 180 + `qc-pos-p1.3` 128 (merge-point rule).
- `qc-hf-pos-page-authz` 81 (S unchanged; U edits P-7).
- `qc-pos-inventory`, `qc-inventory`.

## 8. Open questions (≤ 10, with recommendation)
1. **h `refundTenderCaps` vs P2.9b R7**: P2.9b changes the H1 cap (DEPOSIT cash-like) in `refund.ts`. The preview in `refund-tenders.ts:20–51` recomputes it and would silently diverge. **Rec: addendum to the P2.9b builder** to extract the pure helper there (one cap, two callers), with the hunter checking both.
2. **j `onSaleVoided` retry**: P2.9b already edits that `pos.sale.voided` try-chain (RESTORE step). **Rec: HF-FU after P2.9b merges** (smaller money-card diff); alt a 6-line addendum to P2.9b.
3. **Stock per branch inside one inventory** (unit → location for cuts and reads): **Rec: no in P2.11.** Document "branch stock = branch inventory system"; P2.12 or owner decides (L, lane A files).
4. **Transfer**: **Rec: two-step/cross-inventory = P2.12** (R16, mockup 16); P2.11 pins R16 only. Alt: an immediate cross-inventory same-book transfer in P2.11 (+ ~4 checks, an inventory facade + owner line).
5. **Per-branch service charge / receipt footer**: **Rec: keep system-wide**; add `byUnit` later on owner ask (the same JSON shape as RN makes it cheap).
6. **`channels` CSV kind**: Rec yes (1 check inside RP1) if P2.12 PDF wants the same reader; else skip.
7. **06 for branch-limited managers** (reverses HF-POS-PAGES decision 1): **Rec yes in U** (base price read-only, own-branch rows only); S already enforces it via PR4/PR5. Owner confirms.
8. **Sequencing**: P2.11 S touches `catalog*.ts`, `reports.ts`, `report-overview.ts`, `receipt*.ts`, `products-scope.ts` (no change needed), messages, and the new `qc-pos-p2.11`. None are lane-A core files ⇒ **run on tree c in parallel with P2.9b (tree b)**. `receipt.ts` = smallest marked hunk (P2.9b CD3 may edit titles); builder merges `origin/session/pos` before final gates. P2.10 (customer display) shares only `messages/*` and `visual-pos.mts`.
9. **HF-FU first?** **Rec: no.** P2.11 S first (plan order, tree c). HF-FU (minus j) can take the second lane only if P2.9b finishes first; lane ceiling 2. Its money items (c) need the hunter.
10. **Per-branch recipes** (P2.3 Q4): **Rec: owner line, not P2.11** (needs `RecipeLine.unitId`, ripples into the cut and the 06 recipe UI).

## 9. Visual states for P2.11U (`visual-pos.mts --states`, 1440×900 · 1024×768 · 390×844, owner + manager{A}, th/en at merge)
- `products-branch-filter`: 06 "สาขา: สีลม", branch column, inherited vs own cell.
- `products-branch-copy`: dialog "คัดลอกราคาจากสาขา", overwrite toggle, result toast.
- `products-branch-compare`: matrix of product × branch.
- `products-dead-row-note`: muted note "ราคาของช่องทาง/สาขาที่เก็บแล้ว N แถวเก็บไว้ไม่แก้".
- `products-manager-branch`: base price read-only, own-branch only.
- `reports-channels`: 08 block "ช่องทางการขาย % ของยอด" + footnote "หักค่าคอมมิชชันแล้ว".
- `settings-receipt-branch`: per-branch สาขาที่/ที่อยู่/โทร.
- `stock-shared-inventory`: 16 note "คลังร่วมกับสาขา…".
- `bills-all-branches`: branch label beside the receipt no.
- UI rules: tokens only, ≥ 44 px, `pos.products.branch*` / `pos.reports.channels*` / `pos.settings.receipt.byUnit*` th/en.

## 10. Controller rulings (account B, 15 Oct 02:4xZ) — binding
1. **Scope = §1 as drafted.** P2.11 S (tree c, lane B, no migration): PR (F4 widened to "out of reach" + branch-scoped save + `copyUnitPrices` + `unitPriceMatrix`) · RN (`settings.pos.receipt.byUnit.<unitId>` override, number format unchanged — O2, no prefix) · RP (`reportChannels` + overview section `channels` + CSV kind `channels` = Q6 yes) · SK (`posUnitInventoryMap`, private copies removed, no change to stock cuts) · FU k, l-price (`field` + stable sub-codes), m(i). **P2.11U** = separate card (§9: 06 branch filter/column/editor cell/copy/compare/dead-row note, 06 manager mode with the `qc-hf-pos-page-authz` P-7 ORACLE-EDIT in U, 08 channel block, settings receipt per-branch, 16 shared-inventory note, all-branch bills label). **P2.12** = two-step/cross-inventory transfer (R16), per-location stock inside a shared inventory (Q3 no), hourly/anomalies/PDF, m(ii)/(iii), P2.2 F7/F8.
2. **F4 → (S) widened**: out-of-reach rows (archived code, archived/unlinked unit, or a unit where the actor lacks `pos.product.setPrice`) are kept when absent, accepted when present and unchanged, refused when changed/new: dead code/unit ⇒ `VALIDATION` with `field:"rows"` + sub-code `PRICE_ROW_DEAD`; outside the actor's reach ⇒ `PERMISSION_DENIED`, nothing written; audit unchanged; client `keep` unchanged (no client change for F4).
3. **Follow-up triage = §3 table accepted.** Into P2.11: k, l-price, m(i). **HF-FU card** (lane C server hygiene, after P2.11 or when a lane frees, ~22 checks, hunter on c): a b c d i n p s + l-rest + P2.8 hunt nits + P2.8U F3; **j joins HF-FU after P2.9b merges**. **h → P2.9b builder addendum** (ruling 13 added to `pos-brief-P2.9b.md` §10: one pure `refundTenderCaps` used by `refund.ts` and `refund-tenders.ts`, hunter checks both). g → P2.13 (next contract change). e → P2.14. q, r → P2.9bU. f, o, per-branch recipes (Q10), per-branch service charge (Q5), full tax invoice branch code → owner lines.
4. **RN = §4**: reader/writer as proposed; `taxBranchNo` = OWNER or all-branch only; address/phone = `pos.device.manage` at that unit; unit must be linked and live; jsonb_set under FOR UPDATE; audit masked; RECEIPT kind prints no branch; `qc-pos-p1.10` P1/P5, closeday, p1.8, p1.17 pins stay green (no ORACLE-EDIT).
5. **RP = §5**: reader-only, PAID + REFUNDED, VOIDED excluded, join by `code`, same `scopeOf`/`prepare`/cut-off; branch compare untouched (OV4 PAR).
6. **Stock = §6**: no cut change; `posUnitInventoryMap` exported once; TR1 pins R16.
7. **Oracle**: `qc-pos-p2.11` = §7 (controller accepts 28–34); oracle-first on tree c from `origin/session/pos`; red-before `ledger/wo-notes/P2.11-red.txt`; fixtures through module functions (raw SQL only for archive flags/cleanup); residue/fingerprint Z. **ORACLE-EDIT approved**: `qc-pos-p2.2` ST1 migration filter (k; own `test(...)` commit, dated marker, listed). Any other pin turning red = CONTROLLER-DECISION.
8. **Q7 → yes in U** (branch-limited managers get 06 in branch mode; S enforces via PR4/PR5) + owner line (reverses HF-POS-PAGES decision 1 — owner confirms).
9. **Sequencing/boundaries (Q8/Q9)**: tree **c** in parallel with P2.9b (tree b); P2.11 S may touch `catalog*.ts`, `reports.ts`, `report-overview.ts`, `receipt*.ts` (smallest marked hunk), settings readers/writers, messages, the new suite; **never** `service.ts`, `register*.ts`, `tender*.ts`, `refund*.ts`, `account-bridge.ts`, `outbox-consumers.ts`, `account/**` (lane A); builder merges `origin/session/pos` before final gates. HF-FU not first.
10. **Gates** = §7 regression set (+ `qc-pos-p2.9` 62 and `qc-pos-p2.5` 49 at the merge point) · hunter at merge (money lane: price save paths incl. permission bypass, channel report sums vs bills, receipt identity) · controller visuals none for S (U card).
