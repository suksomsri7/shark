# POS HF-FU — oracle notes (`scripts/qc-hf-fu.mts`)

Oracle writer · VPS (account B) · 15 Oct 2026 · tree `/root/projects/shark-pos-c` · branch `wip/pos-hf-fu-oracle` from `session/pos` **c3c52ef1** (local merge = P2.11U + P2.9b S).
Contract: `ledger/pos-briefs/pos-brief-HF-FU.md` ⚠️ · §0 · §2 · §6 (25 checks) · §7 · **§10 controller rulings 1–13 (binding)**.

**25 checks** = ST1 ST2 (static) · HN1–HN3 (a) · OD1 OD2 (b) · EQ1 (pure) EQ2 (pure + one DB plan) (c) · DM1 (d) · VO1 (j) · CN1 CN2 (n) · PB1 (pure) (p) · SM1 SM2 (s) · LK1 LK2 (l1 l2 F3) · HU1 (h1 h2) · ZE1 ZE2 (z3 z1) · FU1 FU2 (f1 f2 f3) · Z1 Z2.
Modes: `--list` (no DB, no imports) · `--no-db` (ST1 ST2 + pure EQ1 PB1; never loads prisma) · DB run SKIPs (exit 0 + reasons) until `releaseHeldOrders`, `orderChannelSettings` (order.ts), `sweepOrphanTableDrafts` (held-cart.ts), `RECIPE_REFUSAL_REASONS` (recipe-shared.ts), `channelRowsHash` (price-shared.ts) exist · `QC_FORCE=1` runs anyway (red by reason, no crash, every check wrapped) · `QC_ALL=1` prints every reason.

Fixtures (module functions only; Prisma direct only for Tenant/BusinessUnit/User/Membership/AccountSystemLink; raw SQL only for `PosOrder.receivedAt` (HN1 previous-day order), the row locks + `pg_blocking_pids`, the NOWAIT probe (p2.5 C7), fingerprint and cleanup): temp tenant `posqc-hffu-<rand>` with unit A (RESTAURANT · POS + INVENTORY + MEMBER + book A (VAT) · BLOCK · stations hot/drink · menus padthai/kaprao/chayen + odd-priced o1–o6 · inventory products salt (stock 1)/water/rice + archived item + SERVICE item), unit B (RESTAURANT · POS · no stations), unit C (SHOP · not linked to the POS), book B, POS Z (linked to book A, used only by ZE), channels CHAT (builtin), LINEMAN (preset · adapter MANUAL · PLATFORM), GRAB (PLATFORM · **adapter NONE**), CUSTOM_OFF / CUSTOM_PZ / CUSTOM_NH (DIRECT · adapter NONE), CUSTOM_B (unit B), members M1 M2; `-t2` tenant with unit X (POS + MEMBER · CUSTOM_X · member MX). Users OWNER, STAFF (`pos.sale.create` `pos.order.accept` `pos.order.reject`, **no** `pos.sale.void`), NOPERM, OWNER2. Devices + open shifts on A and B. Cleanup in `finally` (every `tenantId` table), residue 0, non-temp fingerprint printed as data.

## Names table (exactly as the oracle calls them — builder must match)
| # | name | shape / where |
|---|---|---|
| 1 | `releaseHeldOrders` | `pos/order.ts` export `releaseHeldOrders(tenantId: string, unitId: string, opts?: { limit?: number }): Promise<{ accepted: string[] }>` (the oracle calls `(T, unitId, {limit: 20})`). Never throws to the caller; candidates = NEW orders of the unit with a `held` event (not `sale_refused`), `receivedAt ≥ posDayStart(now)`, channel `active && autoAccept && adapter ≠ MANUAL && !(pausedUntil > now)`, oldest `receivedAt` first, each in its own tx: re-check `autoAcceptBlockedInTx`, stop at the first blocked, else `acceptInTx(auto:true)`; sale refusal ⇒ skip + one `held {reason:"sale_refused"}` event, never retried. Raced/lost ⇒ skip (no throw). `accepted` = ids accepted in this call |
| 2 | held marker | `PosOrderEvent {type:"held", fromStatus:"NEW", toStatus:"NEW", actorUserId:null, payload:{reason:"paused"\|"backlog"}}` written at ingest only when `auto` was false **because of** `autoAcceptBlockedInTx` (channel autoAccept on, not MANUAL); `{reason:"sale_refused"}` once on a refused sweep accept |
| 3 | swept accept | transition NEW→ACCEPTED (`acceptedByUserId null`, event `accepted` actor null), kitchen round + PLATFORM sale in the same tx (as ingest), after-commit `afterSaleCommit` · adapter `accept` · `writeAudit pos.order.accept` **actorType SYSTEM**, `after {orderId, auto:true, swept:true, saleId}` · `scheduleDrain` |
| 4 | triggers (static) | `src/lib/actions/restaurant.ts` `kitchenPauseAction`: `releaseHeldOrders(` after `menu.setKitchenPause(` inside a `// POS HF-FU ▸ … ◂` hunk · `pos/kds.ts` `kdsSetAutoAcceptMax` and `kdsBoard` bodies and `pos/order.ts` `listOrders` body contain `releaseHeldOrders` (read path: before the read, errors ⇒ WARN + read continues) |
| 5 | `sweepOrphanTableDrafts` | `pos/held-cart.ts` export `sweepOrphanTableDrafts(db, {tenantId, systemId, unitId, limit?})` · called from `registerTables` (static) · HELD drafts with `tableSessionId` whose session (facade `tableSessionForPos`) is not OPEN (CLOSED · CANCELLED · MERGED) ⇒ DISCARDED (+version) + AuditLog `pos.heldCart.discard` **actorType SYSTEM** (actorId null), `before {status:"HELD", label, heldByUserId, lineCount, approxTotalSatang}`, `after {status:"DISCARDED", via:"session_not_open", tableSessionId}` — same row shape as `discardTableDraftsInTx` (`held-cart.ts:361–388`); scoped to the read's unit |
| 6 | share rotation | `allocateTableSplit` (`table-split-shared.ts:147–153`): running `rot` over shared items in input order; part p +1 when `((p−1−rot) mod N) < r`, then `rot = (rot + r) mod N`; EQUAL and SEAT one rule; `stockOwner` part 1; EQUAL totals `q+1` to parts 1..r unchanged. Server item order = table bill order (`createdAt, id`) |
| 7 | `legacyMergeSplitGuard` | `pos/table-split.ts:605` also returns `{ok:false, reason: string}` when the **from**-session has a DONE plan (OPEN on either side as today) |
| 8 | outbox j | `outbox-consumers.ts` `"pos.sale.voided"`: `posOrderOnSaleVoided(evt)` (or `orders.onSaleVoided`) inside the main try-chain (before `if (failed) throw err`), same `failed/err` pattern, marked `// POS HF-FU ▸ j ◂` **below** the key line; not a `compose` extra any more; ≤ 4 new lines above `"pos.sale.voided":` |
| 9 | `OrderDetail.saleStatus` | `"PAID" \| "VOIDED" \| "REFUNDED" \| null` (sale status of `o.saleId`, null = no sale) · `OrderPanel.tsx` `const noCancel = …` contains `saleStatus === "VOIDED"` |
| 10 | pre-bill title | `renderPreBillHtml` th: `<div class="t">` holds exactly two `<span>`s: `"ใบรายการ —"` and `"ไม่ใช่ใบเสร็จรับเงิน/<wbr>ใบกำกับภาษี"`, both `white-space:nowrap` (inline or via `<style>` rule — class or `.t span`), second `font-size:.95em`; `<title>` and `PRE_BILL_LABELS` unchanged; en `.t` text = `"PRE-BILL — NOT A RECEIPT"`; everything outside `.t`/`<style>` and all ESC/POS bytes = c3c52ef1 golden |
| 11 | `SplitPlanPartView` | + `memberName: string \| null` (registerMemberBriefs name of `memberId`, null when none/not visible) · + `paidMethods: PosPayType[] \| null` (distinct `posPayment.type` of the part's PAID sale; null while OPEN) — in `registerSplitTable` and `registerSplitDetail` results · `TableSplitDialog.tsx` has no `billDetailAction` and reads `paidMethods`/`memberName` |
| 12 | recipe reasons | `pos/recipe-shared.ts` export `RECIPE_REFUSAL_REASONS = ["KIND","ITEM_ARCHIVED","ITEM_SERVICE","DUPLICATE","NO_LINES","SHAPE"]` (as const) · writers throw `invalidAt(msg, field, reason)` ⇒ `CatalogError.reason`: PRODUCT row/soldByWeight = KIND · archived ingredient = ITEM_ARCHIVED · SERVICE ingredient = ITEM_SERVICE · same ingredient twice = DUPLICATE · `setBomEnabled(true)` without recipe = NO_LINES · bad shape (qty < 1, extra key, not array…) = SHAPE · `recipe-actions.ts refusalOf` passes `reason` · `recipeRefusalText` maps `reason` → `pos.recipe.errors.<camelCase(reason)>` before `errors.serverValidation` |
| 13 | recipe keys | `pos.recipe.errors.kind` (exists) · `itemArchived` · `itemService` · `duplicate` (exists) · `noLines` · `shape` (th Thai · en no Thai) |
| 14 | `assertCustomerLinks` | refusals keep `code VALIDATION` + Thai message and add `messageKey` `orders.errors.memberNotFound` \| `orders.errors.partyNotFound` \| `orders.errors.conversationNotFound` (th + en keys) |
| 15 | `orderChannelSettings` | `pos/order.ts` export `orderChannelSettings(ctx, actor): Promise<{ ok: true; items: { id: string; autoAccept: boolean; prepMinutes: number \| null; pausedUntil: string \| null }[] } \| OrderRefusal>` — scope "read" (`pos.sale.read`/`pos.sale.create`), channels of `ctx.unitId` not archived · NOPERM ⇒ PERMISSION_DENIED · unit not of ctx tenant ⇒ NOT_FOUND · `order-ui-actions.ts` calls it and contains no `prisma.` |
| 16 | hand-over lock | `step()` (`order.ts:972`) `mutate` callback: CAS first, then `SELECT … FROM "PosSale" … FOR SHARE` (tenant predicate); VOIDED ⇒ `OrderAbort(stateInvalid(… ORDER_SALE_VOIDED_MESSAGE, "orders.errors.saleVoided"))` · `webOrderForUpdate` SQL has `"tenantId"` |
| 17 | zero-entry marker | `recordExternalSaleZeroEntry` writes `after.bookSystemId = ctx.systemId`; `externalSaleZeroEntryRecorded` filters `after.bookSystemId = ctx.systemId` (markers without the field ignored) |
| 18 | `posSalePosted` | PAID JV **or** (marker of this book **and** the sale document exists) — `account/index.ts:755` |
| 19 | owner line z4 | `POS-OWNER-PENDING.md` line containing `P2.9b` + `HF-FU` + `2200` + `เงินสด`/`cash` (cash-only bill after de-registration strands 2200) |
| 20 | `report.channels.empty` | th `"ไม่มียอดในช่วงนี้"` · en `"No sales in this period"` |
| 21 | `ProductsData.incompleteUnitIds` | `string[]` — units whose list was truncated or threw `CatalogError` (`products-data.ts:77–92`) · keys `pos.products.branch.incomplete` (with `{unit}`) · `ProductPanel.tsx` uses `incompleteUnitIds` + `branch.incomplete` |
| 22 | f3 | `setChannelPrices(ctx, {productId, rows, purgeDead?, expectedRowsHash?})` (`CP_TOP_KEYS`) · mismatch under the product lock ⇒ `CatalogError("CONFLICT", …)`, nothing written · absent ⇒ today · `price-shared.ts` pure export `channelRowsHash(rows: {channelCode, unitId, priceSatang, notSold}[]): string` (order-insensitive) · `ProductsRow.rowsHash: string` = hash of the product's stored rows · key `pos.products.branch.conflict` |
| 23 | timeline | `OrderPanel.tsx` `EVENT_TYPES` + `"held"` · key `pos.orders.event.held` |

## Expected red-before (forced run at c3c52ef1 · `ledger/wo-notes/HF-FU-red.txt` §RUN)
**20/25 red · 5 green = PAR controls ST1 · OD2 · CN2 · Z1 · Z2** (brief §6 "≈ 20/25"). Residue 0 · leaks 0 · fingerprint unchanged.
- ST2: no new keys · `EVENT_TYPES` lacks `held` · no z4 owner line. EQ1: bases 10455/10455/10425 (spread 30), s −10/−10/20. PB1: `.t` has 0 spans (golden HTML outside `.t` + ESC/POS bytes already match — they pin "nothing else changes").
- HN1–HN3: `releaseHeldOrders` missing, no `held` events at ingest, triggers absent. OD1: drafts on CANCELLED/MERGED sessions stay HELD. EQ2: 500 plans ≠ rotation reference. DM1: guard `{ok:true}` with a DONE plan on from.
- VO1: static only (the behaviour half is already green: void ⇒ CANCELLED/REFUNDED, replay ×2 = 1 cancelled). CN1: no `saleStatus`, `OrderPanel` does not read it. HU1: **bug reproduced** — handOver blocked on the PosOrder row, void commits, release ⇒ `OK` + `HANDED` on a voided bill. LK2: no `messageKey`, no `orderChannelSettings`, action reads prisma.
- SM1/SM2: no `memberName`/`paidMethods`; dialog still calls `billDetailAction`. LK1: no `reason`, no reasons list, 4 keys missing. FU1: copy says today, no `incompleteUnitIds`. FU2: `expectedRowsHash` refused as an unknown key (VALIDATION), no `rowsHash`/`channelRowsHash`.
- ZE1: marker has no `bookSystemId`; in book B the gate **opens** (`posted:true`, 1 JV in B) — then book A cannot post (`P2002` on `AccountJournalEntry @@unique([tenantId, idempotencyKey])`, account_gl.prisma:493). ZE2: marker + document ⇒ `false` (marker without document `false` and the PAID-JV control `true` already hold).

## Edited existing suites at c3c52ef1 (normal run · §EDITED)
- `qc-pos-p2.5` **46/49**: red **M2 + M6** (refAlloc now rotates ⇒ red by construction until the allocator rotates — *not* green by construction; they turn green together with item c), **T5** (DONE-from now refused: guard `{ok:true}` today). **C7 green** with the new NOWAIT probe (fix c4194261 present). Residue 0.
- `qc-pos-p2.9b` **52/53**: red **A10** = `posSalePosted(฿20 zero-entry bill) = false`; the marker-count assertion (== 1 after replay) is **green at base** (pins today's single-write).
- `qc-pos-p2.6` **66/67**: red **O4** = held CHAT order still NEW after the ceiling clear.
- C7 fail-before (§C7): at **1a964205** NOWAIT on the part's `RestaurantOrderItem` rows **and** the `PosTableSplitPart` row = **55P03** while the wrong-PIN submit waits on the card; at c3c52ef1 both `OK`; submit = `GIFT_CARD_PIN` in both. 1a964205 generated + ran in < 5 min (no CONTROLLER-DECISION needed).

## Drift vs brief §0 (line numbers at c3c52ef1)
1. **HN1 "pause, ingest CHAT"** cannot happen: `ingestOrder` refuses WEB/CHAT/API with `CHANNEL_PAUSED` when the unit's kitchen is paused (`order.ts:688–690`, `pauseRefuses` `:228`). Pause-held orders exist only on channels with adapter `NONE`; the oracle holds a **GRAB (PLATFORM · adapter NONE)** order for HN1/HN3 and uses CHAT only for the ceiling (HN2, as p2.6 O4 does).
2. **"LINEMAN held whose sale is refused"** cannot happen with the preset: LINEMAN defaults to adapter `MANUAL` (`channel.ts:272`) ⇒ start ACCEPTED, never auto. The oracle uses the GRAB/NONE channel (PLATFORM payout) with `salt ×2` (stock 1, BLOCK) ⇒ `STOCK_INSUFFICIENT` at the swept accept.
3. Legacy `table.closeSession` on a session with only a draft (no items) sets **CANCELLED**, not CLOSED (`restaurant/table.ts:305–308`) — the sweep must treat every non-OPEN status (OD1 covers CANCELLED + MERGED).
4. §0 s says `registerMemberBriefs` is imported by `table-split.ts:17` — at c3c52ef1 that line imports `registerMemberGate`; `registerMemberBriefs` (`register-member.ts:122`) is imported by `table.ts` (floor). Builder adds the import.
5. l1 namespace: brief says `pos.products.recipe.errors.<reason>`; at c3c52ef1 the recipe screen uses **`pos.recipe.errors.*`** (`recipe-ui.tsx:53`, keys kind/duplicate/service/archived/noRecipe…). Oracle pins `pos.recipe.errors.<camelCase(reason)>` (precedent `pos.price.errors.<camelCase>`, `price-shared.ts:44`): `kind`, `duplicate` reused; `itemArchived`, `itemService`, `noLines`, `shape` new.
6. f2 "a unit forced over the cap": `PER_UNIT_MAX = 2000` (`products-data.ts:73`) — 2001 products per test is not practical; the oracle uses the `CatalogError` branch (unit C not linked to the POS ⇒ `listForUnit` throws ⇒ today `truncated:false`, `:88`).
7. `outbox-consumers.ts`: key line `:728`, markers `:724 :725 :727` ✓; `posOrderOnSaleVoided` last compose extra `:765` ✓ · `order.ts` `:632 :504–529 :983–986 :852–857 :652–661 :1342–1391 :1427–1446` ✓ · `kds.ts` `:738–749 :624` ✓ · `held-cart.ts:361–388` ✓ · `table-split.ts:605–609` (guard) ✓ · `table-split-shared.ts:147–153` ✓ · `pre-bill-render.ts:56 :141 :143` ✓ · `catalog.ts:85` invalidAt, `:2311` CP_TOP_KEYS, `:2399` setChannelPrices ✓ · `gl.ts:1795–1806`, `account/index.ts:723 :755–759` ✓ · `order-ui-actions.ts:46–48` ✓ · `OrderPanel.tsx:24 :61` ✓ · `TableSplitDialog.tsx:21 :152–173` ✓.
8. `AccountJournalEntry` idempotency is **tenant-wide** (`@@unique([tenantId, idempotencyKey])`): a COMMISSION key posted in one book blocks the same key in another book (seen in ZE1 at base). With z3 the second book never posts, so ZE1 is clean after the fix; info for the hunter (relink after a real commission).

## ORACLE-EDITs (each its own `test(...)` commit · dated marker `// ORACLE-EDIT ผู้คุม 15 ต.ค. (HF-FU <item>)`)
- `fee531f2` qc-pos-p2.5 **c**: `refAlloc` share loop rotates (`rot`) · M2 title bases `41334/41333/41333` (was `41334/41334/41332`).
- `45d607f8` qc-pos-p2.5 **d**: T5 title + control → "DONE plan on from ⇒ refused (orders not moved, plan still DONE on the from-session)" + new control "no plan ⇒ legacy merge ok".
- `353236fa` qc-pos-p2.5 **i**: C7 title + third card `probe` + NOWAIT probe on part 2 (card row held by tx3 · one wrong-PIN submit waits · `FOR UPDATE NOWAIT` on the part's items + part row must be `OK` · release ⇒ `GIFT_CARD_PIN`, part OPEN).
- `49311936` qc-pos-p2.9b **z1 z2**: A10 title + `posSalePosted(b2) === true` after the COMMISSION check + `account.external.zeroEntry` rows for b2 `== 1` after the replay.
- `2835c514` qc-pos-p2.6 **a** (ruling 11 pre-approved): O4 title + "held i1 is ACCEPTED with `acceptedByUserId` null right after `kdsSetAutoAcceptMax(null)`". No later count needed adjusting: after O4 no held candidate remains (CHAT autoAccept is reset to false in O4's `finally`), so the later kdsBoard read sweeps (K13a/K13b/K12b/K12c daily-counter checks) see nothing to accept.

Exact diffs (`git diff c3c52ef1 -- scripts/qc-pos-p2.5.mts scripts/qc-pos-p2.9b.mts scripts/qc-pos-p2.6.mts`):
```diff
diff --git a/scripts/qc-pos-p2.5.mts b/scripts/qc-pos-p2.5.mts
index 496e17c4..99b0b6ba 100644
--- a/scripts/qc-pos-p2.5.mts
+++ b/scripts/qc-pos-p2.5.mts
@@ -54,7 +54,8 @@ const CHECKS: readonly Def[] = [
   D("ST3", "S", "[R7 R8 R9 §7 มติ 8 9] ขอบเขต: restaurant/index.ts รอยต่อ POS P2.5 ▸ export moveTableSessionInTx mergeTableSessionsInTx unlinkTableItemsInTx · pos/table-split.ts + pos/table.ts export ฟังก์ชันใหม่ครบ 6 · table-split-shared.ts + pre-bill-render.ts บริสุทธิ์ (ไม่ถึง prisma/เซิร์ฟเวอร์ · ไม่มีนาฬิกา/สุ่ม · pre-bill-render import แค่ *-shared/receipt-render) · ไฟล์ pos ไม่เขียน Restaurant*/TableSession ตรง · ไฟล์ \"use server\" เรียกครบ 6 + catch · tableSaleVoided มีรอยต่อ POS P2.5 · ไฟล์ใหม่ไม่ปล่อย outbox · table-split.ts ไม่มี ticketForSale · 'use client' ไม่ import table-split/table · จอใหม่ (ถ้ามี) ไม่มีอักษรไทยในโค้ด · POS-OWNER-PENDING มีบรรทัด P2.5"),
   // ── M เงินแยกบิล ──
   D("M1", "X4", "[R1 R2 R5 15B มติ 4] registerSplitTable ITEM บนโต๊ะ A5 (ข้าว 3+1 · ลาเต้ 1+1 · ที่เหลือตามภาพ) → ใบ 1 ฐาน 67500 ค่าบริการ 6750 สุทธิ 74250 · ใบ 2 56500/5650/62150 · Σ 136400 = quote ทั้งโต๊ะ · แผนที่เก็บ (แถว PosTableSplit/Part/Line) = ผลของ allocateTableSplit ตรงตัว · version 1 · itemsHash = quote"),
-  D("M2", "X4", "[R2 มติ 4 CD4] EQUAL 3 บน 136400 → สุทธิ 45467 / 45467 / 45466 (เศษ 2 → ใบ 1–2) · ฐาน 41334/41334/41332 (ส่วนแบ่งต่อรายการ เศษไปใบต่ำ) · Σ ตรง · แทนด้วย EQUAL 4 (splitId+expectedVersion) → 4 × 34100 · version 2 · ส่วนแบ่ง 1 ชิ้นชื่อลงท้าย (1/4)"),
+  // ORACLE-EDIT ผู้คุม 15 ต.ค. (HF-FU c · มติ 3): เศษสตางค์ของส่วนแบ่งต่อรายการหมุนเวียน (rot) แทนไปใบต่ำเสมอ — เดิม "ฐาน 41334/41334/41332 (ส่วนแบ่งต่อรายการ เศษไปใบต่ำ)" ◂
+  D("M2", "X4", "[R2 มติ 4 CD4 · HF-FU มติ 3] EQUAL 3 บน 136400 → สุทธิ 45467 / 45467 / 45466 (เศษ 2 → ใบ 1–2) · ฐาน 41334/41333/41333 (ส่วนแบ่งต่อรายการ เศษหมุนเวียนตามลำดับรายการ) · Σ ตรง · แทนด้วย EQUAL 4 (splitId+expectedVersion) → 4 × 34100 · version 2 · ส่วนแบ่ง 1 ชิ้นชื่อลงท้าย (1/4)"),
   D("M3", "X4", "[R1 R2 15C] SEAT 4 ที่นั่ง + ยำวุ้นเส้นกลางโต๊ะ → 33825 / 45815 / 24255 / 32505 · ยำ 3750 × 4 · ใบ 1 ถือสต็อกของยำ (stockOwner) · Σ 136400 · ลืมระบุที่นั่ง 1 รายการ → VALIDATION ไม่มีแผน"),
   D("M4", "X3", "[R2 R5 CD5 มติ 5] ส่วนลดท้ายบิล 10% บนแผน ITEM 15B → ส่วนลด 6750/5650 · ค่าบริการ 6075/5085 · สุทธิ 66825/55935 · Σ 122760 = quote ทั้งโต๊ะที่ส่วนลดเดียวกัน · CASHIER แทนแผนด้วย 20% → DISCOUNT_EXCEEDS_LIMIT (แผนเดิมคงอยู่) · MANAGER 20% → ok"),
   D("M5", "X4", "[R2(6) COMMON-1] VAT ของแต่ละใบ = splitIncludedVat(สุทธิใบ) ที่ระดับบิลของใบ (บิลจริงของ 15B ทั้งสองใบ) · |Σ VAT ใบ − VAT ทั้งโต๊ะ| ≤ ⌊(N+1)/2⌋ · ข้อบริสุทธิ์ vatRateBp 0 → VAT 0 ทุกใบ"),
@@ -96,7 +97,8 @@ const CHECKS: readonly Def[] = [
   D("C5", "X1", "[R7 มติ 8] ย้าย ⇄ เปิดโต๊ะปลายทาง (ถือล็อกโต๊ะปลายทาง) → session OPEN บนโต๊ะปลายทาง 1 แถว (ย้ายผ่าน+เปิดได้ session เดิม หรือ เปิดใหม่+ย้าย TABLE_BUSY) · ย้าย ⇄ จ่ายของ session เดียวกัน (ถือแถว session) → ok ทั้งคู่ · session CLOSED บนโต๊ะใหม่ · โต๊ะเดิมต้องเก็บ"),
   D("C6", "X1", "[R8 มติ 8] รวมโต๊ะ ⇄ จ่ายของโต๊ะต้นทาง (ถือรายการไว้) → จ่ายแล้วรวม (ออเดอร์ที่จ่ายย้ายตาม) หรือ รวมแล้วจ่าย TABLE_ITEMS_CHANGED · รายการหนึ่งไม่มีสองบิล · บิลบางส่วนเดิมของโต๊ะต้นทาง void แล้วรายการกลับมาค้างจ่ายบนโต๊ะปลายทาง"),
   // ORACLE-ADD ผู้คุม 14 ต.ค. (P2.5 fix round 2 ruling 4 · hunter Low · id C7 because C6 exists)
-  D("C7", "X1", "[มติ fix2 ข้อ 4] จ่ายใบด้วยบัตรของขวัญ PIN ผิด 10 คำขอพร้อมกัน (คนละคีย์) บนบัตรใบเดียว → ทุกคำตอบ GIFT_CARD_PIN/GIFT_CARD_LOCKED (ไม่มี P2028/หมดเวลา) · ตัวนับ 5 · บัตรถูกล็อก · ใบยัง OPEN · ไม่มีบิล · ตัวควบคุม: บัตรใหม่ PIN ถูก → จ่ายใบได้ครั้งเดียว"),
+  // ORACLE-EDIT ผู้คุม 15 ต.ค. (HF-FU i · มติ 5): + probe NOWAIT (ธุรกรรมที่สามถือแถวบัตร · ระหว่างคำขอ PIN ผิดรอบัตร แถวรายการ/ใบต้องไม่ถูกล็อก) — fail-before 1a964205 = 55P03 ◂
+  D("C7", "X1", "[มติ fix2 ข้อ 4 · HF-FU มติ 5] จ่ายใบด้วยบัตรของขวัญ PIN ผิด 10 คำขอพร้อมกัน (คนละคีย์) บนบัตรใบเดียว → ทุกคำตอบ GIFT_CARD_PIN/GIFT_CARD_LOCKED (ไม่มี P2028/หมดเวลา) · ตัวนับ 5 · บัตรถูกล็อก · ใบยัง OPEN · ไม่มีบิล · ตัวควบคุม: บัตรใหม่ PIN ถูก → จ่ายใบได้ครั้งเดียว · probe: ธุรกรรมที่สามถือแถวบัตร FOR UPDATE → คำขอ PIN ผิด 1 รายการรอ → SELECT … FOR UPDATE NOWAIT บนรายการของใบ + แถวใบสำเร็จ (ไม่มี 55P03) · ปล่อยแล้วได้ GIFT_CARD_PIN"),
   // ── T ย้าย/รวม ──
   D("T1", "-", "[R7 CD8 มติ 8] registerMoveTable (WAITER) ขณะรอบ NEW + รอบร่าง + แผน OPEN → tableId เปลี่ยน · โต๊ะเดิม dirtySince (ต้องเก็บ) · โต๊ะใหม่สะอาด · ผัง: เดิม NEEDS_CLEARING ใหม่ DINING · kdsBoard label = ชื่อโต๊ะใหม่ · รายการยัง NEW · รอบร่าง/แผนตาม session · ย้ายไปโต๊ะเดิม → {ok, changed:false}"),
   D("T2", "X2", "[R7 CD10] ย้ายไปโต๊ะที่มีลูกค้า → TABLE_BUSY · INACTIVE → TABLE_INACTIVE · โต๊ะร้าน T2 / id มั่ว / ctx สาขา B → TABLE_NOT_FOUND · session ปิดแล้ว → TABLE_SESSION_CLOSED · CASHIER/NOPERM → PERMISSION_DENIED · ไม่เขียน · โต๊ะที่จองไว้ → ok + reservationOverridden (การจองยัง BOOKED)"),
@@ -104,7 +106,8 @@ const CHECKS: readonly Def[] = [
   // ORACLE-ADD ผู้คุม 14 ต.ค. (P2.5 fix round 1 ruling 6 · pos-P2.5-review.md N4)
   D("T4", "-", "[มติ fix1 ข้อ 6] แผน DONE บนโต๊ะ B (มีรอบร่าง) → รวม B เข้า A → แผนย้ายไป session A · void บิลใบ 1 → ใบ OPEN บน session A · quote/จ่ายใบ 1 ได้ · แผน DONE · แผน OPEN บน session ที่ปิดแล้ว (โต๊ะ A5 หลัง X4) ไม่กันการยกเลิกรายการ"),
   // ORACLE-ADD ผู้คุม 14 ต.ค. (P2.5 fix round 2 ruling 2 · F2)
-  D("T5", "X5", "[มติ fix2 ข้อ 2] หน้าเดิม mergeSessionAction เรียก legacyMergeSplitGuard ก่อน table.mergeSession · แผน OPEN ฝั่งต้นทาง / ฝั่งปลายทาง → ปฏิเสธ ออเดอร์ไม่ย้าย แผนไม่เปลี่ยน · ตัวควบคุม: มีแต่แผน DONE → รวมด้วยประตูเดิมได้"),
+  // ORACLE-EDIT ผู้คุม 15 ต.ค. (HF-FU d · มติ 4 refuse): แผน DONE ฝั่งต้นทาง = ปฏิเสธด้วย · ตัวควบคุมเปลี่ยนเป็น "ไม่มีแผน → รวมได้" — เดิม "ตัวควบคุม: มีแต่แผน DONE → รวมด้วยประตูเดิมได้" ◂
+  D("T5", "X5", "[มติ fix2 ข้อ 2 · HF-FU มติ 4] หน้าเดิม mergeSessionAction เรียก legacyMergeSplitGuard ก่อน table.mergeSession · แผน OPEN ฝั่งต้นทาง / ฝั่งปลายทาง → ปฏิเสธ ออเดอร์ไม่ย้าย แผนไม่เปลี่ยน · แผน DONE ฝั่งต้นทาง → ปฏิเสธ (ออเดอร์ไม่ย้าย แผนยัง DONE บน session ต้นทาง) · ตัวควบคุม: ไม่มีแผน → รวมด้วยประตูเดิมได้"),
   // ── B ใบรายการ ──
   D("B1", "X5", "[R9 มติ 9] registerTablePreBill ทั้งโต๊ะ → kind PRE_BILL · notReceipt · ยอด = quote (subtotal/serviceCharge/vat/total/itemsHash) · ไม่มีคีย์เลขเอกสาร/เลขภาษี · เลขใบเสร็จ +0 · session/โต๊ะไม่เปลี่ยน (ไม่ขอเช็คบิล) · AuditLog pos.table.preBill 1 แถวต่อครั้ง (2 ครั้ง = 2) · ไม่มี outbox/JV"),
   D("B2", "X2", "[R9 CD9 CD10] ใบรายการของใบ (tableSplitPartId) = ยอดของใบ + part {no, of} · copy:true → copy · WAITER (pos.sale.read) ok · NOPERM → PERMISSION_DENIED · session ร้าน T2 / ctx สาขา B → TABLE_NOT_FOUND · session CLOSED → TABLE_SESSION_CLOSED · ใบมั่ว → TABLE_SPLIT_NOT_FOUND"),
@@ -264,6 +267,9 @@ function refAlloc(i: RIn): ROut {
     for (const it of i.items) if ((got.get(it.id) ?? 0) !== it.qty) return { ok: false, code: "VALIDATION" };
   }
   const lines: RLine[][] = Array.from({ length: N }, () => []);
+  // ORACLE-EDIT ผู้คุม 15 ต.ค. (HF-FU c · มติ 3): เศษของส่วนแบ่งหมุนเวียนข้ามรายการกลางโต๊ะ (EQUAL และ SEAT กติกาเดียว) — ใบ p ได้ +1 เมื่อ ((p−1−rot) mod N) < r
+  //   แล้ว rot = (rot + r) mod N ตามลำดับรายการที่ส่งมา · เจ้าของสต็อกยังเป็นใบ 1 · ยอดสุทธิ EQUAL ยังเป็น q+1 ให้ใบ 1..r — เดิม `q + (p <= r ? 1 : 0)` ◂
+  let rot = 0;
   for (const it of i.items) {
     for (const [p, k] of [...(whole.get(it.id) ?? new Map<number, number>()).entries()].sort((a, b) => a[0] - b[0]))
       lines[p - 1]!.push({ itemId: it.id, qty: k, shareNum: null, shareDen: null, amountSatang: k * it.unitSatang, stockOwner: true });
@@ -272,7 +278,8 @@ function refAlloc(i: RIn): ROut {
       const g = u * it.unitSatang;
       const q = Math.floor(g / N);
       const r = g - q * N;
-      for (let p = 1; p <= N; p++) lines[p - 1]!.push({ itemId: it.id, qty: null, shareNum: u, shareDen: N, amountSatang: q + (p <= r ? 1 : 0), stockOwner: p === 1 });
+      for (let p = 1; p <= N; p++) lines[p - 1]!.push({ itemId: it.id, qty: null, shareNum: u, shareDen: N, amountSatang: q + ((((p - 1 - rot) % N) + N) % N < r ? 1 : 0), stockOwner: p === 1 });
+      rot = (rot + r) % N;
     }
   }
   if (lines.some((l) => !l.length)) return { ok: false, code: "VALIDATION" };
@@ -2381,6 +2388,7 @@ async function runDb() {
     };
     const bad = await sell("bad");
     const good = await sell("good");
+    const probe = await sell("probe"); // ORACLE-EDIT ผู้คุม 15 ต.ค. (HF-FU i): บัตรของ probe NOWAIT ◂
     await drain();
     const s = await seat("C7", { guestCount: 2, lines: [ml("kaprao", 1), ml("chayen", 1)] });
     const pl = splitOf(await mkSplit(s.sid, { mode: "EQUAL", partCount: 2 }));
@@ -2406,7 +2414,60 @@ async function runDb() {
     const ok2 = await sub(newKey("c7ok"), good, good.pin);
     const g2 = await P.giftCard.findUnique({ where: { id: good.id } }).catch(() => null);
     if (ok1?.ok !== true || !refused(ok2, "TABLE_SPLIT_PART_PAID") || g2?.balanceSatang !== 50_000 - grand) p.push(`(ตัวควบคุม) PIN ถูก → ${codeOf(ok1)} ${short(ok1?.message ?? "", 40)} · ซ้ำ ${codeOf(ok2)} · ยอดบัตร ${g2?.balanceSatang}`);
-    chk("C7", p.length === 0, "PIN ผิดพร้อมกันบนใบ = PIN/LOCKED ล้วน · ตัวนับ 5 · ไม่มีบิล · PIN ถูกจ่ายได้ครั้งเดียว", FX(P8(p) || "ครบ"));
+    // ORACLE-EDIT ผู้คุม 15 ต.ค. (HF-FU i · มติ 5): probe NOWAIT บนใบ 2 (ใบ 1 จ่ายแล้วโดยตัวควบคุม) — ธุรกรรมที่สามถือแถวบัตร probe FOR UPDATE · ยิงคำขอ PIN ผิด 1 รายการ ·
+    //   รอจนถูกกั้น (pg_blocking_pids) · tx4 SELECT … FOR UPDATE NOWAIT บนรายการของใบ + แถวใบ ⇒ ต้องสำเร็จ (ตรวจ PIN ก่อนล็อกใบ/รายการ · c4194261) ·
+    //   ปล่อยแล้วคำขอได้ GIFT_CARD_PIN · fail-before บน 1a964205 = 55P03 ทั้งสอง (ledger/wo-notes/HF-FU-red.txt §C7) ◂
+    {
+      const part2 = partOf(pl, 2);
+      const pid2 = String(part2?.id ?? "");
+      const items2 = [...new Set(((part2?.lines ?? []) as Any[]).map((l) => String(l.itemId)))];
+      const q2 = await pq(pid2);
+      const grand2 = q2?.ok === true ? Number(q2.grandTotalSatang) : 0;
+      const wrong = probe.pin === "000001" ? "000002" : "000001";
+      const pgCode = (e: unknown): string => {
+        const o = e as { code?: unknown; meta?: { code?: unknown }; message?: unknown } | null;
+        return String(o?.meta?.code ?? "") || (/\b(55P03)\b/.exec(String(o?.message ?? ""))?.[1] ?? `ERR:${String(o?.code ?? "")}:${String(o?.message ?? e).slice(0, 80)}`);
+      };
+      const nowait = async (sql: string, args: unknown[]): Promise<string> => {
+        try {
+          await P.$transaction(async (t4: Any) => {
+            await t4.$queryRawUnsafe(sql, ...args);
+          }, { timeout: 10_000, maxWait: 10_000 });
+          return "OK";
+        } catch (e) {
+          return pgCode(e);
+        }
+      };
+      const box: { p: Promise<Any> | null } = { p: null };
+      const res: Record<string, string> = {};
+      let blocked = 0;
+      if (!pid2 || !items2.length || !grand2) p.push(`(fixture) probe ใบ 2 ${codeOf(q2)} · รายการ ${items2.length}`);
+      else {
+        await P.$transaction(
+          async (tx: Any) => {
+            await tx.$queryRawUnsafe(`SELECT id FROM "GiftCard" WHERE id = $1 FOR UPDATE`, probe.id);
+            const bpid = Number(((await tx.$queryRawUnsafe(`SELECT pg_backend_pid()::int AS p`)) as Any[])[0].p);
+            box.p = call(register, "submitRegisterSale", ctxA(DEV2), A("OWNER"), { lines: [], tableSplitPartId: pid2, expectedSplitVersion: Number(pl.version), idempotencyKey: newKey("c7probe"), expectedGrandTotalSatang: grand2, payMethods: [{ type: "GIFT_CARD", amountSatang: grand2, giftCard: { number: probe.number, pin: wrong } }] });
+            const t1 = Date.now();
+            while (Date.now() - t1 < 12_000) {
+              const n = Number(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM pg_stat_activity WHERE $1::int = ANY(pg_blocking_pids(pid))`, bpid)) as Any[])[0].n);
+              if (n > blocked) blocked = n;
+              if (n > 0) break;
+              await sleep(150);
+            }
+            await sleep(700);
+            res.items = await nowait(`SELECT id FROM "RestaurantOrderItem" WHERE id = ANY($1::text[]) FOR UPDATE NOWAIT`, [items2]);
+            res.part = await nowait(`SELECT id FROM "PosTableSplitPart" WHERE id = $1 FOR UPDATE NOWAIT`, [pid2]);
+          },
+          { timeout: 60_000, maxWait: 15_000 },
+        );
+        const sub = await box.p;
+        if (blocked < 1) p.push("probe: คำขอ PIN ผิดไม่ถูกแถวบัตรกั้น (จัดฉากไม่ถึง)");
+        if (res.items !== "OK" || res.part !== "OK") p.push(`probe NOWAIT ระหว่างรอบัตร: รายการ ${res.items} · ใบ ${res.part} (คาด OK ทั้งคู่ — 55P03 = ล็อกใบ/รายการก่อนตรวจ PIN)`);
+        if (!refused(sub, "GIFT_CARD_PIN") || (await partRows(String(pl.splitId)))[1]?.status !== "OPEN") p.push(`probe: หลังปล่อย ${codeOf(sub)} · ใบ 2 ${(await partRows(String(pl.splitId)))[1]?.status} (คาด GIFT_CARD_PIN · OPEN)`);
+      }
+    }
+    chk("C7", p.length === 0, "PIN ผิดพร้อมกันบนใบ = PIN/LOCKED ล้วน · ตัวนับ 5 · ไม่มีบิล · PIN ถูกจ่ายได้ครั้งเดียว · probe NOWAIT ไม่ติดล็อก", FX(P8(p) || "ครบ"));
   });
 
   // ════════ T ย้าย/รวม ════════
@@ -2580,7 +2641,8 @@ async function runDb() {
       if (ord?.sessionId !== from.sid || (await sessRow(from.sid))?.status !== "OPEN") p.push(`ฝั่ง${side}: ออเดอร์ย้าย/ต้นทางไม่ OPEN`);
       if ((await snap(side === "from" ? from.sid : into.sid, String(pl?.splitId ?? ""))) !== s0) p.push(`ฝั่ง${side}: แผน/รายการเปลี่ยน`);
     }
-    // ตัวควบคุม: มีแต่แผน DONE (ต้นทางมีรอบร่าง ⇒ ยัง OPEN) → รวมด้วยประตูเดิมได้
+    // ORACLE-EDIT ผู้คุม 15 ต.ค. (HF-FU d · มติ 4): แผน DONE ฝั่งต้นทาง (ต้นทางมีรอบร่าง ⇒ ยัง OPEN) → ปฏิเสธ · ออเดอร์ไม่ย้าย · แผนยัง DONE บน session ต้นทาง
+    //   (เดิม = ตัวควบคุม "มีแต่แผน DONE → รวมได้") · ตัวควบคุมใหม่: ไม่มีแผน → รวมด้วยประตูเดิมได้ ◂
     const into = await seat("T5ci", { guestCount: 2, lines: [ml("kaprao", 1)] });
     const from = await seat("T5cf", { guestCount: 2, lines: [ml("chayen", 1)] });
     const pl = splitOf(await mkSplit(from.sid, { mode: "EQUAL", partCount: 2 }));
@@ -2589,8 +2651,15 @@ async function runDb() {
     const b = await payPart(pl, 2);
     if (!a.saleId || !b.saleId || (await planRow(String(pl?.splitId ?? "")))?.status !== "DONE") p.push(`(fixture) แผน DONE ${codeOf(a.r)}/${codeOf(b.r)}`);
     const x = await legacy(into, from);
-    if (x.g?.ok !== true || JSON.stringify(x.m) !== JSON.stringify({ ok: true }) || (await sessRow(from.sid))?.status !== "MERGED") p.push(`(ตัวควบคุม) แผน DONE → ตัวกัน ${short(x.g, 40)} · รวม ${short(x.m, 40)}`);
-    chk("T5", p.length === 0, "หน้าเดิมรวมโต๊ะที่มีแผน OPEN ไม่ได้ (ต้นทาง/ปลายทาง) · แผน DONE รวมได้", FX(P8(p) || "ครบ"));
+    const ordD = await P.restaurantOrder.findUnique({ where: { id: from.orderId } }).catch(() => null);
+    const plD = await planRow(String(pl?.splitId ?? ""));
+    if (x.g?.ok !== false || typeof x.g?.reason !== "string" || x.m) p.push(`แผน DONE ฝั่งต้นทาง → ตัวกัน ${short(x.g, 60)} · รวม ${short(x.m, 40)} (คาด ปฏิเสธ · HF-FU มติ 4)`);
+    if (ordD?.sessionId !== from.sid || (await sessRow(from.sid))?.status !== "OPEN" || plD?.status !== "DONE" || plD?.sessionId !== from.sid) p.push(`แผน DONE ฝั่งต้นทาง: ออเดอร์ ${ordD?.sessionId === from.sid ? "อยู่เดิม" : "ย้าย"} · ต้นทาง ${(await sessRow(from.sid))?.status} · แผน ${plD?.status} ${plD?.sessionId === from.sid ? "session เดิม" : "ย้าย"}`);
+    const into2 = await seat("T5ni", { guestCount: 2, lines: [ml("kaprao", 1)] });
+    const from2 = await seat("T5nf", { guestCount: 2, lines: [ml("chayen", 1)] });
+    const y = await legacy(into2, from2);
+    if (y.g?.ok !== true || JSON.stringify(y.m) !== JSON.stringify({ ok: true }) || (await sessRow(from2.sid))?.status !== "MERGED") p.push(`(ตัวควบคุม) ไม่มีแผน → ตัวกัน ${short(y.g, 40)} · รวม ${short(y.m, 40)}`);
+    chk("T5", p.length === 0, "หน้าเดิมรวมโต๊ะที่มีแผน OPEN ไม่ได้ (ต้นทาง/ปลายทาง) · แผน DONE ฝั่งต้นทางไม่ได้ · ไม่มีแผนรวมได้", FX(P8(p) || "ครบ"));
   });
   // ORACLE-ADD ผู้คุม 14 ต.ค. (P2.5 fix round 1 ruling 5 · CD-P25-N3 option 2: no VAT-EXCLUDED mode in the register)
   await step("M8", async () => {
diff --git a/scripts/qc-pos-p2.6.mts b/scripts/qc-pos-p2.6.mts
index e7af71fc..2be8faff 100644
--- a/scripts/qc-pos-p2.6.mts
+++ b/scripts/qc-pos-p2.6.mts
@@ -109,7 +109,8 @@ const CHECKS: readonly Def[] = [
   D("O1", "-", "[P2.8][R11 CD7] ตั๋วแรกของรอบออนไลน์ออกจาก NEW → PosOrder ACCEPTED → PREPARING (PosOrderEvent 1 แถว actor null) · start อีกสถานี → ไม่มี event เพิ่ม"),
   D("O2", "X1", "[P2.8][R11] READY บางสถานี → ยัง PREPARING · ครบทุกสถานี → READY + outbox pos.order.ready 1 แถว · recall → ออเดอร์ยัง READY"),
   D("O3", "X1", "[P2.8][R11] ยกเลิกออเดอร์ CHAT ที่รับแล้ว → ระบายคิว → รายการ NEW/COOKING/READY ของรอบ = CANCELLED (cancelReason \"ออเดอร์ถูกยกเลิก\") · ระบาย/เล่นซ้ำ ×2 → ไม่เปลี่ยน"),
-  D("O4", "-", "[P2.8][R11 R13 มติ 10] kitchenProgress {orderId done total} = DB · autoAcceptMaxOpen 1 + CHAT autoAccept → ออเดอร์ค้าง NEW (ครัวค้าง) · ล้างเพดาน → ACCEPTED · พักครัว → CHAT ingest CHANNEL_PAUSED · LINEMAN (MANUAL) ยังได้"),
+  // ORACLE-EDIT ผู้คุม 15 ต.ค. (HF-FU a · มติ 11): + ล้างเพดานแล้วออเดอร์ที่ค้าง (i1) ถูกรับ ◂
+  D("O4", "-", "[P2.8][R11 R13 มติ 10] kitchenProgress {orderId done total} = DB · autoAcceptMaxOpen 1 + CHAT autoAccept → ออเดอร์ค้าง NEW (ครัวค้าง) · ล้างเพดาน → ACCEPTED · พักครัว → CHAT ingest CHANNEL_PAUSED · LINEMAN (MANUAL) ยังได้ · ล้างเพดาน → ออเดอร์ที่ค้างถูกตัวกวาดรับ (ACCEPTED · ผู้รับ null · HF-FU)"),
   // ── A 86 ──
   D("A1", "-", "[R9 CD6] COOK setAvailability({ผัดไทย MENU · KDS · false}) → MenuItem.isOutOfStock · PosAvailabilityMark (source KDS · markedBy COOK) · AuditLog pos.product.availability · outbox 1 แถว {productId unitId systemId available:false source KDS at} · board.eightySix มีผัดไทย"),
   D("A2", "X1", "[R9] เรียกซ้ำ → ok ไม่มี event เพิ่ม · คืนขาย → event available:true · mark หาย · isOutOfStock false · คืนซ้ำ → ไม่มี event"),
@@ -2067,6 +2068,9 @@ async function runDb() {
     const i1 = await chat("bk1");
     if ((await poRow(String(i1?.orderId ?? "")))?.status !== "NEW") p.push(`ครัวค้าง ≥ 1 + autoAccept → ${(await poRow(String(i1?.orderId ?? "")))?.status ?? codeOf(i1)} (คาด NEW)`);
     await K("kdsSetAutoAcceptMax", ctxA(), A("OWNER"), { maxOpen: null });
+    // ORACLE-EDIT ผู้คุม 15 ต.ค. (HF-FU a · มติ 1 + 11): ล้างเพดาน ⇒ ตัวกวาดรับออเดอร์ที่ค้างจากเพดาน (held) หลัง commit — i1 = ACCEPTED ผู้รับ null ◂
+    const i1a = await poRow(String(i1?.orderId ?? ""));
+    if (i1a?.status !== "ACCEPTED" || i1a?.acceptedByUserId !== null) p.push(`ล้างเพดาน → ออเดอร์ที่ค้าง ${i1a?.status ?? codeOf(i1)} ผู้รับ ${short(i1a?.acceptedByUserId ?? null)} (คาด ACCEPTED · null · HF-FU มติ 1)`);
     const i2 = await chat("bk2");
     if ((await poRow(String(i2?.orderId ?? "")))?.status !== "ACCEPTED") p.push(`ไม่มีเพดาน → ${(await poRow(String(i2?.orderId ?? "")))?.status ?? codeOf(i2)} (คาด ACCEPTED)`);
     await menu.setKitchenPause(T, U.A, true, "qc");
diff --git a/scripts/qc-pos-p2.9b.mts b/scripts/qc-pos-p2.9b.mts
index 05360b39..8b2dfb86 100644
--- a/scripts/qc-pos-p2.9b.mts
+++ b/scripts/qc-pos-p2.9b.mts
@@ -107,7 +107,8 @@ const CHECKS: readonly Def[] = [
   // ORACLE-ADD ผู้คุม 15 ต.ค. (P2.9b fix 3 · มติรอบแก้ 2 · R3 F2 / hunter F1) ◂
   D("P12", "X2", "[fix3 มติ 2 · มติ 19 แก้] ค้นด้วยเลข 4 หลัก (= 4 หลักท้ายของเบอร์) → ไม่พบมัดจำจากเบอร์ · ตัวนับผิด/ล็อกไม่ขยับ · หน้าขายส่ง 4 หลักถูก → ผ่านครั้งแรก"),
   // ORACLE-ADD ผู้คุม 15 ต.ค. (P2.9b fix 4 · มติรอบแก้ 1 2 · R4 F2 / hunter N1 N2) ◂
-  D("A10", "X4", "[fix4 มติ 1 · R4 F2 / hunter N1] ฉาก A9 บนช่องทาง DIRECT ค่าคอมฯ 10% (สมุดเลิกจด VAT · บิลสุดท้าย ฿20 ไม่มี JV ขาย) → COMMISSION ของบิล ฿20 ลงครั้งเดียว Dr 6500 200 / Cr 2100 200 · pos.sale.paid DONE · เล่นซ้ำไม่เพิ่ม · คืนบิลนั้นครบ → COMMISSION_REFUNDED ครั้งเดียว Dr 2100 200 / Cr 6500 200 (ไม่เงียบ no-commission) · 6500/2100 ของบิลสุทธิ 0"),
+  // ORACLE-EDIT ผู้คุม 15 ต.ค. (HF-FU z1 z2 · มติ 8): + posSalePosted(บิล ฿20) true · เครื่องหมาย zero entry แถวเดียวหลังเล่นซ้ำ ◂
+  D("A10", "X4", "[fix4 มติ 1 · R4 F2 / hunter N1 · HF-FU มติ 8] ฉาก A9 บนช่องทาง DIRECT ค่าคอมฯ 10% (สมุดเลิกจด VAT · บิลสุดท้าย ฿20 ไม่มี JV ขาย) → COMMISSION ของบิล ฿20 ลงครั้งเดียว Dr 6500 200 / Cr 2100 200 · posSalePosted(บิล ฿20) = true (เครื่องหมาย + เอกสาร) · pos.sale.paid DONE · เล่นซ้ำไม่เพิ่ม · เครื่องหมาย account.external.zeroEntry 1 แถว · คืนบิลนั้นครบ → COMMISSION_REFUNDED ครั้งเดียว Dr 2100 200 / Cr 6500 200 (ไม่เงียบ no-commission) · 6500/2100 ของบิลสุทธิ 0"),
   D("X10", "X4", "[fix4 มติ 2 · hunter N2] คืนบิล ฿20 (zero entry) หลังเลิกจด VAT → ใบคืน VAT 2000 · JV ใบคืน Dr 2200 2000 / Cr 1010 2000 (รายได้ไม่ถูกแตะ) · รวมใบรับ+บิล+ใบคืน: รายได้ 100000 · 2200 เหลือ 5000 · 2110 สุทธิ 0 (= ทางคืนเงินมัดจำที่เหลือ) · ใบลดหนี้ VAT ฿20"),
   // ── L ของเดิม (PAR) ──
   D("L1", "PAR", "[§7 มติ 2] scripts/pos-sale-contract.json sha256 = 72afb258… (CD2-A ไม่เปลี่ยนสัญญา)"),
@@ -2099,9 +2100,17 @@ async function runDb() {
         const com = () => jvKey(`PosSale#${z.b2}#COMMISSION`);
         const c2 = await com();
         if (c2.length !== 1 || !sameNet(netByCode(c2), { "6500": 200, "2100": -200 })) pa.push(`COMMISSION บิล ฿20 ${c2.length} รายการ ${short(netByCode(c2))} (คาด 1 · Dr 6500 200 / Cr 2100 200)`);
+        // ORACLE-EDIT ผู้คุม 15 ต.ค. (HF-FU z1 · มติ 8): posSalePosted = JV PAID หรือ (เครื่องหมาย zero entry และมีเอกสารขาย) ⇒ บิล ฿20 = true ◂
+        const accIdx = await tryImport("@/lib/modules/account");
+        const b2Sys = String((await P.posSale.findUnique({ where: { id: z.b2 }, select: { systemId: true } }).catch(() => null))?.systemId ?? "");
+        const posted2 = typeof accIdx?.posSalePosted === "function" ? await accIdx.posSalePosted({ tenantId: T, sourceSystemId: b2Sys, refId: z.b2 }).catch((e: unknown) => `throw ${(e as Error).message.slice(0, 60)}`) : "ไม่มี posSalePosted";
+        if (posted2 !== true) pa.push(`posSalePosted(บิล ฿20 zero entry + เอกสาร) = ${short(posted2)} (คาด true · HF-FU มติ 8)`);
         pa.push(...(await replay("pos.sale.paid", (x) => x.saleId === z.b2)));
         await drain();
         if ((await com()).length !== 1) pa.push(`เล่น pos.sale.paid ซ้ำ → COMMISSION ${(await com()).length} (คาด 1)`);
+        // ORACLE-EDIT ผู้คุม 15 ต.ค. (HF-FU z2 · มติ 8 · R5 F3 / hunter H3): เครื่องหมาย zero entry ของบิล ฿20 แถวเดียวหลังเล่นซ้ำ ◂
+        const marks2 = Number(await P.auditLog.count({ where: { tenantId: T, action: "account.external.zeroEntry", targetType: "PosSale", targetId: z.b2 } }).catch(() => -1));
+        if (marks2 !== 1) pa.push(`เครื่องหมาย account.external.zeroEntry ของบิล ฿20 = ${marks2} แถว (คาด 1)`);
         const rd = await z.refundB2();
         if (rd) {
           const rvKey = `PosSale#${rd.id}#COMMISSION_REFUNDED`;
```

## CONTROLLER-DECISION (the oracle encodes my proposal for each)
1. **Channel substitutes for HN1/HN2** (drift 1–2): pause-held = GRAB with adapter NONE (PLATFORM); sale-refused held = the same GRAB channel. Accept, or rule that CHAT should be held (not refused) under a kitchen pause — that would be a behaviour change outside the brief.
2. **CN2 stays a pure PAR control**: the static "OrderPanel reads `saleStatus`" assertion lives in **CN1** (brief §6 lists it under CN2) so the green-before set matches §6 (ST1 OD2 CN2 Z1 Z2).
3. **M2/M6 are red at base after the `refAlloc` edit** (not green by construction) — they pin the new allocator. The rotation depends on item order: the oracle (EQ2 DB plan and p2.5 M2) assumes the server keeps the table-bill order (`createdAt asc, id asc`), which equals send order for one round.
4. **DM1/T5**: only "DONE on the from-session ⇒ refused" is pinned. A DONE plan on the *into* side is not asserted either way.
5. **Legacy merge refusal text**: the guard keeps `{ok:false, reason}` (Thai, the legacy page redirects with `?err=`); ruling 4's "th+en key" is not tested (no screen reads a key there). Say if a `messageKey` is wanted.
6. **SM1 "other system/tenant ⇒ null"** is not reachable through module functions (a plan part cannot hold a foreign member — `registerMemberGate` refuses); the oracle pins that refusal (`MEMBER_NOT_FOUND`, no plan) and `null` for a memberless part.
7. **FU2 `rowsHash`**: pinned as `channelRowsHash` of the product's stored rows and equal to `channelRowsHash(row.rows)` in the fixture (all stored rows are in the payload there). If the loader's `rows` ever omits stored rows (units the user cannot see), the hash must still cover the stored set the server compares under the product lock.
8. **HN audit shape**: swept accept audit pinned as `actorType SYSTEM` + `after.auto true` + `after.swept true` (ingest precedent `order.ts:647`). OD1 discard audit pinned as `actorType SYSTEM` (actorId null) — the POS-close precedent writes USER; ruling 2 says SYSTEM.
9. **HU1 lock order is enforced by behaviour**: a builder that reads `PosSale FOR SHARE` *before* the PosOrder CAS still hands over (the share read precedes the void commit) — HU1 stays red; the brief's order (CAS first, then share) is the only green one.
10. Lane pins expected red on the wip branch (ruling 11, not run here): `qc-pos-p2.11` ST1/ST4, `qc-pos-p2.8` ST6.

## Runs (this session)
- `--list` (no DB) — output below · `--no-db` 1/4 (ST1 green; ST2 EQ1 PB1 red) exit 1.
- Forced QC4 run ×2 (second = committed file): 5/25 green, 20 red, residue 0, leaks 0, fingerprint unchanged.
- Edited suites at base: p2.5 46/49 · p2.9b 52/53 · p2.6 66/67 (reds listed above).
- C7 probe: c3c52ef1 GREEN · 1a964205 RED 55P03 (§C7).
- Typecheck `env NODE_OPTIONS=--max-old-space-size=5632 ISO_MEM=6500M bash scripts/iso.sh flock -w 3600 /tmp/pos-gate.lock pnpm typecheck` → **rc 0** (includes `scripts/qc-hf-fu.mts` and the three edited suites).
- Builder regression set: brief §8 (merge gates) — p2.5 (49 · with edits) · p2.6 (67 · O4 edit) · p2.9b (53 · A10 edit) · p2.4 · p2.8 · p2.9 · hf-tx · p1.1 · p1.3 · p1.8 · p2.3 · p2.11 · p2.2 · p1.18 · authz · restaurant ×4 · account · account-cpa.

## `--list`
```
qc-hf-fu — 25 ข้อ (id · X · หัวข้อ)
HF-FU-ST1	PAR	[§3 §4 §7 มติ 6] ไม่มี migration · prisma/ ไม่เปลี่ยน (เทียบฐาน c3c52ef1 หรือ merge-base) · ไฟล์ห้ามแตะ §4 (register*.ts service.ts tender*.ts refund*.ts deposit.ts account-bridge.ts · InterimPayDialog PayDone BillsClient · restaurant/** · visual-pos.mts) ไม่เปลี่ยน · outbox-consumers: บรรทัดเหนือ "pos.sale.voided": เพิ่ม ≤ 4 · รอยต่อ POS P2.4/P2.6/P2.8 อยู่ใน ±8 บรรทัดของคีย์ · รอยต่อ HF-FU j (ถ้ามี) อยู่ใต้คีย์ · *-shared/pre-bill-render บริสุทธิ์ · 'use client' ไม่ import pos/table(-split)/order/kds · ทะเบียนผู้เรียก createSale เท่าเดิม
HF-FU-ST2	S	[มติ 7 9 10 · ST7] คีย์ข้อความใหม่ th = en (th ไทย · en ไม่มีไทย): orders.event.held · orders.errors.memberNotFound/partyNotFound/conversationNotFound · recipe.errors.kind/itemArchived/itemService/duplicate/noLines/shape · products.branch.incomplete ({unit}) · products.branch.conflict · OrderPanel EVENT_TYPES มี held · POS-OWNER-PENDING มีบรรทัด P2.9b + HF-FU (บิลเงินสดล้วนหลังเลิกจด VAT ค้าง 2200 · z4)
HF-FU-HN1	-	[a มติ 1] พักครัว + ช่องทาง adapter NONE รับอัตโนมัติ → ingest = NEW + event held 1 แถว (NEW→NEW · payload.reason paused) · kitchenPauseAction เรียก releaseHeldOrders หลัง setKitchenPause (รอยต่อ POS HF-FU) · เลิกพัก + releaseHeldOrders(T, A) → ACCEPTED (acceptedByUserId null · event accepted ผู้กระทำ null · รอบครัว 1 · บิล PLATFORM 1 · audit pos.order.accept {auto:true, swept:true} ผู้กระทำ SYSTEM) · ผลคืน accepted มี id · ออเดอร์ที่รับเข้าก่อนต้นวันไทย (receivedAt) ยัง NEW · กวาดซ้ำ = ไม่มีอะไรเปลี่ยน
HF-FU-HN2	X1	[a มติ 1] เพดาน 1 + ตั๋วค้าง → ออเดอร์ R (GRAB ของไม่พอ) + CHAT c1 c2 c3 = NEW + held {reason:backlog} · kdsTicketDone ตั๋วค้าง → listOrders (กวาดตอนอ่าน) → R ถูกปฏิเสธบิล (STOCK_INSUFFICIENT) คง NEW + held {reason:sale_refused} 1 แถว ไม่มีบิล · c1 ACCEPTED · c2 c3 NEW (หยุดที่ตัวแรกที่ติดเพดาน) · done c1 → kdsBoard (กวาดตอนอ่าน) → c2 · done c2 → listOrders → c3 · FIFO ตาม receivedAt · R ไม่ถูกลองซ้ำ (sale_refused ยัง 1)
HF-FU-HN3	X1	[a มติ 1] กวาด ‖ พนักงาน acceptOrder ออเดอร์เดียวกัน (ธุรกรรมที่สามถือแถว PosOrder · ทั้งคู่รอ) → ACCEPTED 1 · บิล PLATFORM 1 · รอบครัว 1 · ตัวควบคุมที่ไม่ถูกกวาด: ช่องทางปิดรับอัตโนมัติภายหลัง · MANUAL ที่เริ่ม NEW · NEW ที่ไม่มี held · ช่องทางพักรับ (pausedUntil) · ออเดอร์ held ของสาขา B · ของร้าน T2
HF-FU-OD1	X1	[b มติ 2] รอบร่าง HELD ของ session ที่หน้าเดิมปิด (table.closeSession) และของ session ที่หน้าเดิมรวมเข้าโต๊ะอื่น (MERGED) → registerTables (อ่านผัง) → DISCARDED ทั้งคู่ + audit pos.heldCart.discard 1 แถว/ร่าง (actorType SYSTEM · after {status DISCARDED, via session_not_open, tableSessionId}) · อ่านซ้ำไม่เพิ่ม audit · registerTables เรียก sweepOrphanTableDrafts
HF-FU-OD2	PAR	[b มติ 2] ไม่แตะ: ร่างของ session ที่ยัง OPEN · บิลพักในลิ้นชัก (tableSessionId null) · ร่างของ session ที่ปิดแล้วของสาขา B (อ่านผังสาขา A) — ยัง HELD ทุกแถว version เดิม
HF-FU-EQ1	P	[c มติ 3] allocateTableSplit บริสุทธิ์: 30 รายการราคาคี่ EQUAL 3 ค่าบริการ 0 → ฐานต่อใบห่าง ≤ 1 · |ค่าบริการของใบ| ≤ 1 · Σ สุทธิ = ยอดโต๊ะ · SEAT กลางโต๊ะล้วน 30 รายการ → ฐานห่าง ≤ 1 · ผลตรงตัวอ้างอิงหมุนเศษ (rot) ทุกบรรทัด · เจ้าของสต็อก = ใบ 1
HF-FU-EQ2	X4	[c มติ 3] 500 แผนสุ่ม (EQUAL/SEAT มีกลางโต๊ะ · seed คงที่) ตรงตัวอ้างอิงหมุนเศษ · ยอดส่วนแบ่งต่อใบห่าง ≤ 1 · Σ สุทธิตรง · เรียกซ้ำผลเดิม · แผนจริงบน DB (EQUAL 3 ราคาคี่ · ลำดับรายการตามบิลโต๊ะ createdAt,id) = ผลบริสุทธิ์ทุกบรรทัด · ฐานห่าง ≤ 1
HF-FU-DM1	X5	[d มติ 4] legacyMergeSplitGuard: ต้นทางมีแผน DONE → {ok:false, reason} · ออเดอร์ไม่ย้าย · ต้นทางยัง OPEN · แผนยัง DONE บน session ต้นทาง · ตัวควบคุม: ไม่มีแผน → ok + table.mergeSession {ok:true}
HF-FU-VO1	X1	[j มติ 6] สถิต: "pos.sale.voided" เรียกตัวรับออเดอร์ในสายหลัก (ก่อน if (failed) throw) ไม่ใช่ compose ตัวสุดท้าย · รอยต่อ POS HF-FU ▸ j ใต้คีย์ · พฤติกรรม: void บิลของออเดอร์ LINEMAN ที่ READY → ระบายคิว → CANCELLED + REFUNDED · เล่นตัวรับซ้ำ ×2 → event cancelled 1 · version ไม่ขยับ
HF-FU-CN1	-	[n มติ 7] getOrder.order.saleStatus: บิล PAID = "PAID" · ไม่มีบิล = null · void แล้วตัวรับยังไม่ถึง (ธุรกรรมที่สามถือแถว PosOrder) = "VOIDED" ขณะออเดอร์ยังไม่ปิด · OrderPanel.tsx ให้ saleStatus === "VOIDED" ปลดปุ่มยกเลิกเหมือน saleVoided
HF-FU-CN2	PAR	[n §0] บิลถูก void แล้วตัวรับยังไม่ถึง → STAFF (ไม่มี pos.sale.void) cancelOrder → ok · ออเดอร์ CANCELLED + REFUNDED · บิล VOIDED · pos.sale.voided ของบิล 1 · event cancelled 1
HF-FU-PB1	P	[p มติ 7] renderPreBillHtml th: .t มีสอง span ไม่ตัดบรรทัด (white-space:nowrap) "ใบรายการ —" + "ไม่ใช่ใบเสร็จรับเงิน/ใบกำกับภาษี" (span ที่สอง font-size .95em · <wbr> หลัง /) · <title> = หัวเต็ม · PRE_BILL_LABELS.th.title เดิม · en .t = หัวเดิม · HTML นอก .t/<style> = ฐาน (golden c3c52ef1 · th 80/58 · en) · ESC/POS ไบต์ = ฐาน (golden th 80 raster · th 58 tis620 · en 80)
HF-FU-SM1	X2	[s มติ 7] SplitPlanPartView.memberName: แผน SEAT 3 ใบ (ใบ 1 สมาชิก M1 · ใบ 2 M2 · ใบ 3 ไม่มี) → registerSplitTable + registerSplitDetail ชื่อตรงสมาชิก · ใบ 3 null · สมาชิกร้าน T2 บนใบ → MEMBER_NOT_FOUND ไม่มีแผน (ไม่เคยเป็นของร้านอื่น)
HF-FU-SM2	-	[s มติ 7] SplitPlanPartView.paidMethods: ใบ 1 จ่าย CASH+CARD → [CARD, CASH] (ไม่ซ้ำ) · ใบ 2 CASH → [CASH] · ใบ 3 OPEN → null · TableSplitDialog.tsx ไม่เรียก billDetailAction และอ่าน paidMethods/memberName
HF-FU-LK1	X3	[l1 มติ 7] สูตร: KIND (PRODUCT) · ITEM_ARCHIVED · ITEM_SERVICE · DUPLICATE · NO_LINES (setBomEnabled ไม่มีสูตร) · SHAPE (qty 0 · ช่องเกิน) → CatalogError VALIDATION + reason ตรงกรณี ∈ RECIPE_REFUSAL_REASONS (recipe-shared.ts · 6 ค่า) · คีย์ recipe.errors.<camel(reason)> th/en (en ไม่มีไทย) · recipe-actions ส่ง reason · recipeRefusalText ใช้ reason ก่อนข้อความบริการ
HF-FU-LK2	X2	[l2 F3 มติ 7] ingestOrder ด้วย memberId/partyId/chatConversationId มั่ว → VALIDATION + messageKey orders.errors.memberNotFound/partyNotFound/conversationNotFound · orderChannelSettings(ctx, actor) คืนค่าตั้งรับออเดอร์ของช่องทางสาขา (NOPERM = PERMISSION_DENIED · สาขาร้านอื่น = NOT_FOUND) · order-ui-actions.ts ไม่มี prisma. และเรียก orderChannelSettings
HF-FU-HU1	X1	[h1 h2 มติ 7] สถิต: ขั้นส่งมอบอ่านสถานะบิลในธุรกรรม (FOR SHARE "PosSale") · webOrderForUpdate SQL มี "tenantId" · พฤติกรรม: ธุรกรรมที่สามถือแถว PosOrder → handOver รอ → void บิล commit → ปล่อย → handOver ORDER_STATE_INVALID messageKey orders.errors.saleVoided · ออเดอร์ไม่เคย HANDED (CANCELLED + REFUNDED หลังระบาย)
HF-FU-ZE1	X2	[z3 มติ 9] เครื่องหมายของบิล X ในสมุด A (recordExternalSaleZeroEntry เขียน after.bookSystemId) → ย้าย POS ไปผูกสมุด B → applyExternalChannelCommission = {posted:false, reason:no-paid} (ไม่มี JV ใดในสมุด B) · ผูกกลับ A → posted (หรือ already)
HF-FU-ZE2	-	[z1 มติ 8] posSalePosted: เครื่องหมาย + เอกสารขาย = true · เครื่องหมายไม่มีเอกสาร = false · บิลที่มี JV PAID = true (ตัวควบคุม)
HF-FU-FU1	-	[f1 f2 มติ 7] report.channels.empty th "ไม่มียอดในช่วงนี้" en "No sales in this period" (ไม่มี วันนี้/today) · loadProductsData สาขาที่โหลดไม่ครบ (CatalogError — สาขาไม่ผูก POS) อยู่ใน incompleteUnitIds · สาขาปกติไม่อยู่ · ProductPanel ใช้ incompleteUnitIds/branch.incomplete
HF-FU-FU2	X1	[f3 มติ 10] setChannelPrices + expectedRowsHash: ค่าเก่า → CatalogError CONFLICT ไม่เขียน · ตรง (= ProductsRow.rowsHash = channelRowsHash(rows)) → ok เขียน · ไม่ส่ง → ok (ของเดิม) · channelRowsHash ไม่ขึ้นกับลำดับแถว · คีย์ products.branch.conflict
HF-FU-Z1	PAR	QC4 คืนสภาพ: ร้านชั่วคราว T + T2 เหลือ 0 แถวทุกตารางที่มี tenantId · แถว Tenant ถูกลบ · ผู้ใช้ชั่วคราว 0
HF-FU-Z2	PAR	รอยของรอบนี้นอกร้านชั่วคราว = 0 (PosSale คีย์/id · AuditLog/OutboxEvent ที่มีรหัสรอบ · Tenant slug · InvItem sku) · ลายนิ้วมือร้านอื่น (PosOrder PosHeldCart PosTableSplit SalesChannel) ก่อน/หลังพิมพ์เป็นข้อมูล
X-coverage: PAR=5 S=1 -=5 X1=6 P=2 X4=1 X5=1 X2=3 X3=1
```
