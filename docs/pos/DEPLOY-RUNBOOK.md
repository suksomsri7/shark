# POS V2 — คู่มือขึ้น production (DEPLOY RUNBOOK)

> สถานะ: **ฉบับเตรียม (P6.1 prep · 22 ต.ค. 2026)** — แทน `ledger/pos-briefs/pos-runbook-P6.1-DRAFT.md` (3 ต.ค. · แช่แข็งแล้ว) ตามมติ P6 §10-2.
> ฐานที่ตรวจ: `session/pos` @ `23c85130` เทียบ `origin/main` @ `a84bca2b`. ทุกข้อที่อ้างโค้ด = `ไฟล์:บรรทัด` ของฐานนี้ — ตรวจซ้ำที่ commit ที่จะ merge จริง (`qc-pos-p6.1` ช่วยตรวจ).
> 🔴 เอกสารนี้ **ไม่อนุญาต** ให้ใครแตะ production. ทุกขั้นที่มี ⛔ = เจ้าของสั่งเอง ทีละขั้น (W32 · มติ P6 §10-1). ผู้คุมงานไม่ push `main` ไม่ deploy ไม่ต่อ prod.
> หัวข้อภาษาไทย · คำสั่งภาษาอังกฤษ · ไม่มี URL/รหัสผ่านในไฟล์นี้ — `<PROD_DIRECT_URL>` = ค่าที่เจ้าของถือเอง (direct ไม่ใช่ `-pooler`).

## 0. ขอบเขตและกติกา

- ขอบเขต: migration ของ POS V2 ทั้ง 36 ไฟล์ · index มือ (CONCURRENTLY) · backfill · env · งานตั้งเวลา · เปิดใช้ทีละร้าน · การถอยกลับ · การตรวจหลัง deploy.
- ลำดับใหญ่ (มติ P6 §10-4): **merge PR → migrate deploy → index CONCURRENTLY → backfill (catalog → `--verify` 0 → `backfillWebPrices`) → env/creds → เปิดธงทีละร้าน**.
- ถอยกลับ = **ปิดธง/สวิตช์ของร้าน** (ข้อมูลเป็นแบบเพิ่มอย่างเดียว) · SQL ถอยกลับ (ภาคผนวก ก) ใช้เฉพาะ migration ที่ **ล้มกลางทาง** (มติ P6 §10-5).
- `prisma migrate deploy` ผ่าน **direct URL เท่านั้น** (ห้าม `-pooler`: `SET lock_timeout` ระดับ session รั่วข้าม client บน PgBouncer).
- ห้ามรันชุดข้อสอบกับ prod · ห้ามแก้ `.env` · ไม่มี EAS · ไม่มี reseed (กติกา P6 §8).
- คำสั่ง node ทุกตัวบน VPS ผ่าน `scripts/iso.sh` (cgroup ของเซสชัน 5G) · `iso.sh` ไม่ส่ง env ของผู้เรียก ⇒ ตั้งตัวแปรด้วย `env A=… B=…` **หลัง** `iso.sh`.
- เวลาในบันทึก = `date -u`.

## 1. เงื่อนไขก่อนเริ่ม (ตรวจกับโค้ดวันนี้)

| # | เงื่อนไข / รายการ merge checklist | วันนี้ (23c85130) | ยังต้องทำไหม | หลักฐาน |
|---|---|---|---|---|
| 1.1 | CRM อยู่บน `main` ก่อน · migration POS เรียงหลังของ main ทั้งหมด | ✅ main มี `20261101000000_crm_v2_b` · `20261102000000_crm_v2_c` · ล่าสุด `20261104000003_account_journal_no_alloc_lock_v2` · POS 36 ไฟล์เริ่ม `20261120000000_pos_v2_a` | ตรวจซ้ำที่ commit merge (คำสั่งข้างล่าง) | `git ls-tree origin/main prisma/migrations/` |
| 1.2 | hotfix RC อยู่บน main (`hotfix/inventory-atomic` · `hotfix/pos-page-authz` · `rc/hotfixes-2026-10-01`) | ✅ ทั้ง 3 เป็น ancestor ของ `origin/main` | ไม่ใช่ตัวบล็อกแล้ว — ตรวจซ้ำด้วยคำสั่งข้างล่าง | `git merge-base --is-ancestor` |
| 1.3 | `checkCatalogWrite` ≡ `posCanSetTenantPrice` (กติกาเดียว) | อยู่ในทรีเดียวกันแล้ว: `src/lib/modules/pos/catalog.ts:322` (ตัวตัดสินรายแถวทุก action) · `src/lib/modules/pos/access.ts:69` (ราคาทุกสาขา = ทุกสาขาที่ผูกต้องมี `pos.product.setPrice`) | **ยังใช้** — ผู้ตรวจ R1 ยืนยันว่ากรณีราคาทุกสาขาให้ผลเท่ากัน (ใช้ที่ `src/lib/actions/pos.ts:484` · `src/app/app/sys/[id]/pos/products/page.tsx:48`) | catalog.ts:307 หมายเหตุ "ต้องตรงกันตอน merge" |
| 1.4 | `qc-prisma.sh` รู้จัก `ep-frosty-lab` | ❌ ยังรู้จักแค่ QC1–3 (`scripts/qc-prisma.sh:31`) · เลน POS ใช้ `scripts/qc4.sh:12-13` แทนมาตลอด | **ไม่บล็อก deploy** — งาน QC เท่านั้น (prod ไม่ใช้สคริปต์นี้) · ทำหรือไม่ = CD-P61-P7 | scripts/qc-prisma.sh:29-32 |
| 1.5 | `catalog-legacy.ts` อยู่ใน `SYSTEM_MARKER_ALLOWLIST` | ✅ `scripts/fitness-pos.mts:1052-1056` | ไม่ต้องทำแล้ว (fitness-pos ตรวจทุกด่าน) | fitness-pos.mts:1062 |
| 1.6 | `registerCatalog` ใช้กติกาความพร้อมขายเดียวกับ `listForUnit` | ✅ `src/lib/modules/pos/register.ts:407` · `:775` · `:851` | ไม่ต้องทำแล้ว (`qc-pos-p1.3` ตรวจ) | register.ts:998 |
| 1.7 | สัญญา `createSale` (`--update-pos-contract`) | snapshot `scripts/pos-sale-contract.json` · ตัวสร้าง `scripts/fitness-pos.mts:510` | **ยังใช้** — รัน `fitness-pos` ที่ commit merge ต้องเขียว (ห้ามเขียนทับ snapshot ถ้าไม่จำเป็น) | fitness-pos.mts:4 |
| 1.8 | dependency ใหม่ `@zxing/browser` | ส่วนต่าง `package.json` เทียบ main มีบรรทัดเดียว (`package.json:106`) + `pnpm-lock.yaml` +36 บรรทัด | **ยังใช้** — ตอน merge เอา `package.json` ทั้งสองฝั่งแล้ว `pnpm install` (ห้ามแก้ lockfile ด้วยมือ) · `@zxing/library` ต้องการ node ≥ 24 | `git diff --stat origin/main HEAD -- package.json pnpm-lock.yaml` |
| 1.9 | Prisma ที่ใช้ deploy = 7.8 (โหมด tx ของไฟล์ขึ้นกับรุ่นนี้ — §2) | `package.json:105` · `:125` = `^7.8.0` | **ยังใช้** — `pnpm exec prisma --version` ก่อน deploy | |
| 1.10 | ชุดข้อสอบเต็มบน Neon branch ส่วนตัว (ไม่ใช่ QC4) | ยังไม่ทำ | **ยังใช้** — ซ้อมตาม §4.4 (W31) | P6 brief §5 |
| 1.11 | `qc-account-api-*` ×5 (เลน acc-v2) เขียว · `qc-account-api-settings` ข้าม (P3.12 F23) | อยู่ใน `scripts/pos-gates.json` แล้ว | **ยังใช้** — ผลด่านเต็มที่ commit merge | HANDOVER-2026-10-16-POS-P2.md:219 |
| 1.12 | PR ของ `session/pos` → `main` พร้อม (ข้อความ PR) | ยังไม่มี ledger/pos-briefs/pos-PR-main.md (รอ P3.12/P4/P5 ปิด — P6 §10 addendum) | **ยังใช้** | qc-pos-p6.1 R1 |

```bash
# 1.1 — migration ที่ไม่อยู่บน main ต้องเป็น *_pos_* ทั้งหมด และเรียงหลังตัวสุดท้ายของ main
git -C /root/projects/shark-pos fetch origin main session/pos
comm -13 <(git -C /root/projects/shark-pos ls-tree --name-only origin/main prisma/migrations/ | sort) \
         <(git -C /root/projects/shark-pos ls-tree --name-only origin/session/pos prisma/migrations/ | sort)
git -C /root/projects/shark-pos ls-tree --name-only origin/main prisma/migrations/ | sort | grep -v migration_lock | tail -1
# 1.2 — hotfix ต้องเป็น ancestor ของ main (exit 0)
for b in hotfix/inventory-atomic hotfix/pos-page-authz rc/hotfixes-2026-10-01; do git -C /root/projects/shark-pos merge-base --is-ancestor origin/$b origin/main && echo "$b ok"; done
```

## 2. รายการ migration ของ POS (ลำดับ timestamp ตามที่ commit · 36 ไฟล์)

คำอธิบายคอลัมน์:
- **tx**: `DO` = ไฟล์มี `DO $$` ⇒ Prisma 7.8 ส่งทั้งไฟล์เป็น transaction เดียว (atomic · ล็อกที่ได้ถือจนจบไฟล์) · `stmt` = ไม่มี `DO` ⇒ ทีละคำสั่ง ทีละ transaction (ไม่ atomic · ล็อกสั้นต่อคำสั่ง · `SET LOCAL` ไม่มีผล ไฟล์จึงใช้ `SET lock_timeout` ระดับ session + `RESET` ท้ายไฟล์).
- **lock_timeout**: ค่าที่ไฟล์ตั้งเอง · `ไม่มี ⚠️` = ไฟล์ไม่ตั้ง (รอคิวล็อกได้ไม่จำกัด — §3.3).
- **ชั้นล็อก**: `L0` = สร้างของใหม่ล้วน (ไม่แตะตารางเดิม · ทันที) · `L1` = เปลี่ยน metadata ของตารางเดิม (ADD COLUMN ว่างได้ / ค่าคงที่ DEFAULT บน PG ≥ 11 · ADD VALUE ของ enum เดิม) — ACCESS EXCLUSIVE ระดับมิลลิวินาที แต่ต่อคิวหลัง transaction ยาว · `L2` = สร้าง index บนตารางเดิมในไฟล์ (SHARE lock บล็อกการเขียนตลอดเวลาสแกน ∝ จำนวนแถว) · `-TX` = อยู่ในไฟล์ `DO` ⇒ ACCESS EXCLUSIVE ของคำสั่ง ALTER ถือต่อจนจบไฟล์ (บล็อกทั้งอ่านและเขียน).
- **★** = ตารางที่มีอยู่แล้วบน prod (ดู §3.1).
- **เพิ่มอย่างเดียว / ทำลาย**: ทุกไฟล์ไม่มี DROP TABLE/COLUMN · RENAME · UPDATE/DELETE/INSERT ข้อมูล · SET NOT NULL บนตารางเดิม · ข้อยกเว้นเดียวที่ "ผ่อน" คือ `pos_p27_qr_orders` DROP NOT NULL บน `PosPaymentIntent` (ตารางใหม่ของ RUN นี้).
- **ถอนไม่ได้**: `ALTER TYPE … ADD VALUE` ลบค่าออกไม่ได้ (ปล่อยไว้ได้ — ค่าที่ไม่มีแถวใช้ไม่มีผล).

| # | migration | tx | lock_timeout | ชั้นล็อก | สร้าง | แก้ของเดิม | เพิ่มอย่างเดียว | ทำลาย | ถอนไม่ได้ |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `20261120000000_pos_v2_a` | DO | 3s | L0 | 1 enum · ตาราง PosCategory PosProduct PosProductOptionGroup RecipeLine | — | ใช่ | ไม่ | — |
| 2 | `20261120000001_pos_v2_a_links` | stmt | 3s | L1 | — | MenuItem+posProductId ★ · PosSaleLine+productId ★ · RestaurantOrderItem+productId ★ · ShopOrderLine+posProductId ★ · ShopProduct+posProductId ★ | ใช่ | ไม่ | — |
| 3 | `20261121000000_pos_p15_held_cart` | stmt | ไม่มี ⚠️ | L0 | 1 enum · ตาราง PosHeldCart | — | ใช่ | ไม่ | — |
| 4 | `20261122000000_pos_p16_payment` | stmt | 3s | L1 | — | PosPayType+'CARD' · PosPayment+changeSatang,reference,tenderedSatang ★ · PosSale+note,serviceChargeSatang,tipSatang ★ · PosSaleLine+note ★ | ใช่ | ไม่ | enum ADD VALUE (ถอนไม่ได้) |
| 5 | `20261123000000_pos_p19_shift` | stmt | 3s | L1 | 2 enum · ตาราง PosShift PosCashMovement PosShiftCounter | PosSale+shiftId ★ | ใช่ | ไม่ | — |
| 6 | `20261124000000_pos_p12_options` | stmt | 3s | L1 | ตาราง PosSaleLineOption | PosProduct+scalePlu,soldByWeight · PosSaleLine+components,weightGrams ★ | ใช่ | ไม่ | — |
| 7 | `20261125000000_pos_p19b_shift_recount` | stmt | 3s | L0 | ตาราง PosShiftRecount | — | ใช่ | ไม่ | — |
| 8 | `20261126000000_pos_p117_reports` | stmt | 3s | L1 | — | PosSale+soldByUserId ★ | ใช่ | ไม่ | — |
| 9 | `20261127000000_pos_p114_stock_count` | stmt | 3s | L0 | 2 enum · ตาราง PosStockCount PosStockCountLine PosStockCountEntry | — | ใช่ | ไม่ | — |
| 10 | `20261128000000_pos_p18_refund` | stmt | 3s | L1 | 1 enum · ตาราง PosDocCounter | PosSale+docType,reasonCode,refSaleId,refundedSatang ★ · PosSaleLine+refLineId,restock ★ | ใช่ | ไม่ | — |
| 11 | `20261128100000_pos_p110_devices` | stmt | ไม่มี ⚠️ | L0 | 1 enum · ตาราง PosDevice | — | ใช่ | ไม่ | — |
| 12 | `20261129000000_pos_p111_online_receipt` | stmt | ไม่มี ⚠️ | L2 | 2 enum · ตาราง PosReceiptIssue PosTaxInvoiceRequest | PosSale+publicToken ★ · UIDX PosSale_publicToken_key ★ | ใช่ | ไม่ | — |
| 13 | `20261130000000_pos_p115_staff_pin_approval` | stmt | ไม่มี ⚠️ | L0 | ตาราง PosStaffPin PosApprovalPayload | PosHeldCart+approvedRequestId | ใช่ | ไม่ | — |
| 14 | `20261130100000_pos_p17_payment_intent` | stmt | ไม่มี ⚠️ | L0 | ตาราง PosPaymentIntent | — | ใช่ | ไม่ | — |
| 15 | `20261201100000_pos_p113_tax_invoice` | stmt | ไม่มี ⚠️ | L1 | ตาราง PosBuyerProfile | AccountDocument+supersededByDocId ★ · PosSale+taxInvoice,taxInvoiceDocId ★ | ใช่ | ไม่ | — |
| 16 | `20261202100000_pos_p112_member_snapshot` | stmt | ไม่มี ⚠️ | L1 | — | PosSale+memberSnapshot,memberBenefits ★ | ใช่ | ไม่ | — |
| 17 | `20261203100000_pos_p21_sales_channel` | stmt | 3s | L1 | 3 enum · ตาราง SalesChannel | PosPayType+'PLATFORM' · PosSale+channelId,channelCode,channelRef,channelPayout,channelCommissionSatang,channelCommissionVatSatang ★ | ใช่ | ไม่ | enum ADD VALUE (ถอนไม่ได้) |
| 18 | `20261204100000_pos_p22_prices` | stmt | 3s | L1 | 3 enum · ตาราง PosProductChannelPrice PosPriceRule | PosSaleLine+listPriceSatang,priceRuleId,priceSource ★ | ใช่ | ไม่ | — |
| 19 | `20261205100000_pos_p23_recipe` | stmt | 3s | L0 | ตาราง PosRecipeChoiceLine | PosProduct+bomEnabled | ใช่ | ไม่ | — |
| 20 | `20261206100000_pos_p24_tables` | DO | 3s | L1-TX | 1 enum · ตาราง RestaurantReservation | PosHeldCart+tableSessionId · RestaurantTable+dirtySince ★ | ใช่ | ไม่ | — |
| 21 | `20261207100000_pos_p28_orders` | DO | 3s | L0 | 3 enum · ตาราง PosOrder PosOrderLine PosOrderEvent | — | ใช่ | ไม่ | — |
| 22 | `20261208100000_pos_p26_kds` | DO | 3s | L2-TX | 1 enum · ตาราง PosAvailabilityMark | RestaurantOrder+posSaleId,posOrderId,channelCode,channelName,externalRef,targetMinutes ★ · RestaurantSetting+autoAcceptMaxOpen ★ · UIDX RestaurantOrder_posOrderId_key ★ · UIDX RestaurantOrder_posSaleId_key ★ | ใช่ | ไม่ | — |
| 23 | `20261208100100_pos_p26_stock_taken` | stmt | 3s | L1 | — | RestaurantOrderItem+stockTaken ★ | ใช่ | ไม่ | — |
| 24 | `20261208100200_pos_p26_station_set_at` | stmt | 3s | L0 | — | PosProduct+stationSetAt | ใช่ | ไม่ | — |
| 25 | `20261209100000_pos_p29_tenders` | DO | 3s | L2-TX | 1 enum | GiftCard+kind ★ · PosPayType+'GIFT_CARD' · PosPayType+'STORE_CREDIT' · PosPayment+giftCardId,giftCardTxnId ★ · UIDX GiftCard_storeCredit_owner_key ★ | ใช่ | ไม่ | enum ADD VALUE (ถอนไม่ได้) |
| 26 | `20261210100000_pos_p25_split` | DO | 3s | L0 | 3 enum · ตาราง PosTableSplit PosTableSplitPart PosTableSplitLine | — | ใช่ | ไม่ | — |
| 27 | `20261211100000_pos_p29b_deposits` | DO | 3s | L0 | 2 enum · ตาราง PosDeposit PosDepositTxn | — | ใช่ | ไม่ | — |
| 28 | `20261211110000_pos_p29b_deposit_phone_lock` | stmt | 3s | L0 | — | PosDeposit+phoneFailedCount,phoneLockedUntil | ใช่ | ไม่ | — |
| 29 | `20261215100000_pos_p210_customer_display` | DO | 3s | L0 | 1 enum · ตาราง PosCustomerDisplay | — | ใช่ | ไม่ | — |
| 30 | `20261216100000_pos_p27_qr_orders` | stmt | 3s | L0 | ตาราง PosOrderLink | PosOrder+payBy,paidAt,customerClaimAt,paymentIntentId,publicToken · PosOrderPaymentState+'PENDING_PAYMENT' · PosOrderPaymentState+'PREPAID' · PosPaymentIntent DROP NOT NULL ×2 · PosPaymentIntent+orderId · SalesChannelAdapter+'QR' | ใช่ | ไม่ | enum ADD VALUE (ถอนไม่ได้) |
| 31 | `20261217100000_pos_p35_staff_commission` | stmt | ไม่มี ⚠️ | L0 | 2 enum · ตาราง PosStaffCommission | — | ใช่ | ไม่ | — |
| 32 | `20261217110000_pos_p34_offline` | stmt | ไม่มี ⚠️ | L2 | ตาราง PosOfflineSale PosOfflineSnapshot | PosDevice+offlineCode,offlineSeq · PosSale+offlineRef,syncedAt ★ · UIDX PosSale_unit_offlineRef_key ★ | ใช่ | ไม่ | — |
| 33 | `20261218100000_pos_p3skel` | stmt | 5s | L0 | ตาราง PosIntegrationCredential PosPaymentSlip PosPrintAgent PosPrintJob | — | ใช่ | ไม่ | — |
| 34 | `20261218100100_pos_p3skel_slip_hash` | stmt | 5s | L0 | — | PosPaymentSlip+sha256 | ใช่ | ไม่ | — |
| 35 | `20261219100000_pos_p36_credit_enum` | stmt | 5s | L1 | — | PosPayType+'ON_ACCOUNT' | ใช่ | ไม่ | enum ADD VALUE (ถอนไม่ได้) |
| 36 | `20261219100100_pos_p36_credit` | stmt | 5s | L1 | ตาราง PosCreditAccount | PosSale+customerPartyId,crmDealId,creditTerms ★ | ใช่ | ไม่ | — |

สรุป: **36 ไฟล์ · เพิ่มอย่างเดียว 36 · ทำลาย 0** · `DO` 8 ไฟล์ (#1 #20 #21 #22 #25 #26 #27 #29) · `ALTER TYPE ADD VALUE` **5** ไฟล์ (#4 #17 #25 #30 #35 — brief P6 §⚠️2 นับ 6 เพราะรวม `pos_p18_refund` ที่มีคำนี้ใน comment เท่านั้น) · ไม่มี `lock_timeout` 9 ไฟล์ (4 ไฟล์แตะตารางเดิม: #12 #15 #16 #32 — §3.3) · ชั้น L2 ขึ้นไป 4 ไฟล์ (#12 #22 #25 #32 — §3.2).
ข้อสังเกต: `20260809100000_pos_service_split` อยู่บน main/prod แล้ว (ไม่นับใน 36) · `verify-prod-pos.mts` M1 ตรวจทุกไฟล์ `*_pos_*` ในทรี (37).

## 3. ตรวจล็อกก่อน deploy (อ่านอย่างเดียว · ⛔ เจ้าของสั่ง)

### 3.1 ตารางเดิมที่ migration POS แก้ (12 ตาราง = 9 โมดูลอื่น + 3 `Pos*` ก่อน RUN)

| ตาราง | ประเภท | migration ที่แตะ |
|---|---|---|
| `AccountDocument` | โมดูลอื่น | pos_p113_tax_invoice |
| `GiftCard` | โมดูลอื่น | pos_p29_tenders |
| `MenuItem` | โมดูลอื่น | pos_v2_a_links |
| `PosPayment` | Pos* ก่อน RUN | pos_p16_payment · pos_p29_tenders |
| `PosSale` | Pos* ก่อน RUN | pos_p16_payment · pos_p19_shift · pos_p117_reports · pos_p18_refund · pos_p111_online_receipt · pos_p113_tax_invoice · pos_p112_member_snapshot · pos_p21_sales_channel · pos_p34_offline · pos_p36_credit |
| `PosSaleLine` | Pos* ก่อน RUN | pos_v2_a_links · pos_p16_payment · pos_p12_options · pos_p18_refund · pos_p22_prices |
| `RestaurantOrder` | โมดูลอื่น | pos_p26_kds |
| `RestaurantOrderItem` | โมดูลอื่น | pos_v2_a_links · pos_p26_stock_taken |
| `RestaurantSetting` | โมดูลอื่น | pos_p26_kds |
| `RestaurantTable` | โมดูลอื่น | pos_p24_tables |
| `ShopOrderLine` | โมดูลอื่น | pos_v2_a_links |
| `ShopProduct` | โมดูลอื่น | pos_v2_a_links |

หมายเหตุ: brief P6 §⚠️3 นับ `RecipeLine` เป็นตารางเดิม — ไม่ใช่: main ไม่มี model/ตารางนี้ (จองไว้ใน comment `restaurant.prisma` เท่านั้น) · `pos_v2_a` เป็นผู้สร้าง (`CREATE TABLE IF NOT EXISTS`) ⇒ ตารางเดิมจริง = 12 (โมดูลอื่น 9: AccountDocument · GiftCard · MenuItem · RestaurantOrder · RestaurantOrderItem · RestaurantSetting · RestaurantTable · ShopOrderLine · ShopProduct).

### 3.2 index ที่ migration สร้างบนตารางเดิม (ไม่ CONCURRENTLY · ใช้เวลาตามจำนวนแถว)

| index | ตาราง | ชนิด | migration | โหมด |
|---|---|---|---|---|
| `PosSale_publicToken_key` | `PosSale` | UNIQUE | `pos_p111_online_receipt` | stmt |
| `RestaurantOrder_posSaleId_key` | `RestaurantOrder` | UNIQUE | `pos_p26_kds` | DO = tx เดียว (ถือ ACCESS EXCLUSIVE จนจบไฟล์) |
| `RestaurantOrder_posOrderId_key` | `RestaurantOrder` | UNIQUE | `pos_p26_kds` | DO = tx เดียว (ถือ ACCESS EXCLUSIVE จนจบไฟล์) |
| `GiftCard_storeCredit_owner_key` | `GiftCard` | UNIQUE | `pos_p29_tenders` | DO = tx เดียว (ถือ ACCESS EXCLUSIVE จนจบไฟล์) |
| `PosSale_unit_offlineRef_key` | `PosSale` | UNIQUE | `pos_p34_offline` | stmt |

ทั้ง 5 ตัวสร้างบนคอลัมน์ที่เพิ่งเพิ่ม (ค่าว่างทุกแถว) แต่ Postgres ยังต้องสแกนทั้งตาราง ⇒ เวลาล็อก ∝ จำนวนแถวของ `PosSale` / `RestaurantOrder` / `GiftCard` บน prod — **ต้องได้ตัวเลขแถวก่อน** (§3.4) แล้วตัดสินว่าพอรับได้ในหน้าต่างนอกเวลาขาย หรือต้องแยกเป็น index มือ (CD-P61-P1).

### 3.3 ไฟล์ที่ไม่ตั้ง `lock_timeout` แต่แตะตารางเดิม

`pos_p111_online_receipt` (PosSale + unique index) · `pos_p113_tax_invoice` (AccountDocument · PosSale) · `pos_p112_member_snapshot` (PosSale) · `pos_p34_offline` (PosSale + unique index) — ถ้ามี transaction ยาวถือ `PosSale` อยู่ คำสั่ง ALTER จะรอไม่มีกำหนด และทุกการขายที่ตามมาจะต่อคิวหลังมัน. ทางเลือก (ซ้อมก่อนบน branch — CD-P61-P2): (ก) ตั้ง `lock_timeout` ระดับ role ของผู้ deploy ชั่วคราว `ALTER ROLE <deploy_role> SET lock_timeout = '5s'` แล้ว `RESET` หลัง deploy (⛔) · (ข) เติม `options=-c lock_timeout=5s` ใน `<PROD_DIRECT_URL>` (ต้องพิสูจน์ว่า Neon proxy ส่งต่อ) · (ค) ไม่ทำอะไร แต่รันข้อ 3.4 ทันทีก่อน deploy และหยุดถ้ามี transaction > 5 วินาที.

### 3.4 คำสั่งตรวจ (อ่านอย่างเดียว · psql บน direct URL · ⛔ เจ้าของสั่ง · นอกเวลาขาย)

```sql
BEGIN; SET TRANSACTION READ ONLY;
-- transaction ที่เปิดค้าง > 5 วิ (ต้อง 0 ก่อนกด deploy)
SELECT pid, state, now() - xact_start AS age, left(query, 80) FROM pg_stat_activity WHERE xact_start < now() - interval '5 seconds' AND pid <> pg_backend_pid();
-- ล็อกที่ถืออยู่บนตารางเดิม 12 ตาราง
SELECT c.relname, l.mode, l.granted, a.pid, now() - a.xact_start AS age FROM pg_locks l JOIN pg_class c ON c.oid = l.relation JOIN pg_stat_activity a ON a.pid = l.pid WHERE c.relname IN ('PosSale','PosSaleLine','PosPayment','AccountDocument','GiftCard','MenuItem','RestaurantOrder','RestaurantOrderItem','RestaurantSetting','RestaurantTable','ShopOrderLine','ShopProduct');
-- ขนาด/จำนวนแถวโดยประมาณ (ตัดสิน §3.2 และ §5)
SELECT relname, n_live_tup, pg_size_pretty(pg_total_relation_size(relid)) FROM pg_stat_user_tables WHERE relname IN ('PosSale','PosSaleLine','PosPayment','AccountDocument','GiftCard','MenuItem','RestaurantOrder','RestaurantOrderItem','RestaurantSetting','RestaurantTable','ShopOrderLine','ShopProduct','InvItem','TableSession') ORDER BY n_live_tup DESC;
ROLLBACK;
```

## 4. ขั้นตอน deploy migration + การกู้เมื่อล้ม

### 4.1 ก่อนกด
1. ⛔ เจ้าของเลือกหน้าต่างนอกเวลาขายของทุกร้านที่มี POS (ร้านอาหาร/ร้านค้า/โรงแรม/ตั๋วก็เรียก `createSale`).
2. ⛔ สร้าง Neon branch ของ prod ทันทีก่อน deploy (จุดย้อนกลับทันที) — จด branch id ใน ledger/wo-notes/pos-P6.1.md (สร้างตอนซ้อม).
3. รัน §3.4 · บันทึกผล.
4. `pnpm exec prisma --version` = 7.8.x (§1.9).

### 4.2 deploy
```bash
# ⛔ เจ้าของ · บน VPS · direct URL เท่านั้น (ห้าม -pooler) · ไม่ใช่ .env
env -C /root/projects/shark-pos bash scripts/iso.sh env DIRECT_URL='<PROD_DIRECT_URL>' DATABASE_URL='<PROD_DIRECT_URL>' pnpm exec prisma migrate status
env -C /root/projects/shark-pos bash scripts/iso.sh env DIRECT_URL='<PROD_DIRECT_URL>' DATABASE_URL='<PROD_DIRECT_URL>' pnpm exec prisma migrate deploy
```
- ลำดับ Vercel: โค้ดเก่าต้องรันบน schema ใหม่ได้ (ทุกไฟล์เพิ่มอย่างเดียว) ⇒ **migrate ก่อน แล้วค่อย promote build ใหม่** · ธงทุกตัวปิดเป็นค่าปริยาย ⇒ พฤติกรรม prod ไม่เปลี่ยนตอน deploy.
- หลัง deploy: `verify-prod-pos.mts` (§10) ต้อง M1/M2/T1/C1/E1/I1 เขียว.

### 4.3 ล้มกลางทาง (P3018 → P3009)
1. lock timeout / error ⇒ Prisma บันทึกไฟล์นั้นว่าล้ม (`P3018`) · deploy รอบถัดไปปฏิเสธด้วย `P3009`.
2. ดูว่าไฟล์นั้นเป็น `DO` (atomic ⇒ ไม่มีอะไรเหลือ — ข้ามไปข้อ 4) หรือ `stmt` (อาจเหลือบางส่วน).
3. ไฟล์ `stmt`: รัน SQL ถอยกลับของไฟล์นั้น (ภาคผนวก ก) **ทีละคำสั่ง (autocommit)** · ทุกคำสั่งเป็น `IF EXISTS` ⇒ รันซ้ำได้.
4. ⛔ `env -C /root/projects/shark-pos bash scripts/iso.sh env DIRECT_URL='<PROD_DIRECT_URL>' DATABASE_URL='<PROD_DIRECT_URL>' pnpm exec prisma migrate resolve --rolled-back <migration_name>`
5. แก้เหตุ (เช่น รอ transaction ยาวจบ) → ⛔ deploy ใหม่ (§4.2) · ทุกไฟล์รันซ้ำได้ (`IF NOT EXISTS` / `DO … EXCEPTION WHEN duplicate_object`).
6. เคยซ้อมบน QC4 เฉพาะคู่ `pos_v2_a` / `_links` (P1.1a) — ต้องซ้อมครบ 36 ไฟล์บน branch (§4.4).

### 4.4 ซ้อมก่อนของจริง (W31)
- ค่าปริยาย W31: ⛔ เจ้าของอนุญาต branch ที่คัดลอกจาก prod เฉพาะเมื่อ **ลบภายในวันเดียวกันและไม่ส่งออกข้อมูล** · ไม่อนุญาต ⇒ ซ้อมบน QC4 เท่านั้น.
- บน branch: `migrate deploy` 36 ไฟล์ (จดเวลาต่อไฟล์จาก log) → backfill `--dry-run` → `verify-prod-pos.mts` → ด่านเต็ม + `qc:all` (สูตร QC7 ของ P3.12 · allowlist = host ของ branch นั้นเท่านั้น — CD-P61-P3) → ลบ branch → จดใน ledger/wo-notes/pos-P6.1.md (สร้างตอนซ้อม).
- ห้ามถ่ายภาพ/คัดลอกข้อมูลลูกค้าจาก branch.

## 5. index มือ (CREATE INDEX CONCURRENTLY) — หลัง migration ก่อนเปิดธง

กติกา (มติ P5 §10-9 · P1.1a M1): index บนตารางเดิมที่ใหญ่ **ไม่อยู่ใน migration** · สร้างมือทีละตัว นอก transaction (psql autocommit) · หลังสร้างต้อง `indisvalid = true` · ไม่ valid ⇒ `DROP INDEX CONCURRENTLY IF EXISTS` แล้วสร้างใหม่. ชื่อใช้แบบ Prisma (`<Table>_<cols>_idx`) เพื่อให้ `@@index` ในอนาคตไม่ drift (CD-P61-P4). รายการเดียวกับ `HAND_INDEXES` ใน `scripts/verify-prod-pos.mts` (ข้อ X1).

```sql
-- ⛔ เจ้าของ · psql บน <PROD_DIRECT_URL> · ทีละบรรทัด · นอกเวลาขาย
SET lock_timeout = '5s';
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ShopProduct_posProductId_idx" ON "ShopProduct" ("posProductId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ShopOrderLine_posProductId_idx" ON "ShopOrderLine" ("posProductId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "PosSaleLine_productId_idx" ON "PosSaleLine" ("productId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "MenuItem_posProductId_idx" ON "MenuItem" ("posProductId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "RestaurantOrderItem_productId_idx" ON "RestaurantOrderItem" ("productId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "InvItem_tenantId_barcode_idx" ON "InvItem" ("tenantId", "barcode");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "PosSale_shiftId_idx" ON "PosSale" ("shiftId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "PosSale_refSaleId_idx" ON "PosSale" ("refSaleId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "PosSale_channelId_idx" ON "PosSale" ("channelId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "PosSaleLine_refLineId_idx" ON "PosSaleLine" ("refLineId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "PosSale_customerPartyId_idx" ON "PosSale" ("customerPartyId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "PosSale_crmDealId_idx" ON "PosSale" ("crmDealId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "PosOrderLine_orderId_idx" ON "PosOrderLine" ("orderId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "PosOrderEvent_orderId_idx" ON "PosOrderEvent" ("orderId");
-- ก่อนตัวสุดท้าย: นับโต๊ะที่มี session OPEN ซ้ำ (verify X1) ต้องเป็น 0 · ไม่ใช่ 0 = เจ้าของปิด session ซ้ำในแอปก่อน
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "one_open_session_per_table" ON "TableSession" ("tableId") WHERE "status" = 'OPEN';
RESET lock_timeout;
-- ตรวจ (ทุกแถวต้อง t)
SELECT c.relname, i.indisvalid FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid WHERE c.relname IN ('ShopProduct_posProductId_idx','ShopOrderLine_posProductId_idx','PosSaleLine_productId_idx','MenuItem_posProductId_idx','RestaurantOrderItem_productId_idx','InvItem_tenantId_barcode_idx','PosSale_shiftId_idx','PosSale_refSaleId_idx','PosSale_channelId_idx','PosSaleLine_refLineId_idx','PosSale_customerPartyId_idx','PosSale_crmDealId_idx','PosOrderLine_orderId_idx','PosOrderEvent_orderId_idx','one_open_session_per_table');
```

| index | ที่มา | สถานะ |
|---|---|---|
| คอลัมน์เชื่อม 5 ตัว (`ShopProduct`/`ShopOrderLine`/`MenuItem`.`posProductId` · `PosSaleLine`/`RestaurantOrderItem`.`productId`) | P1.1a M1/M7 · `prisma/schema/ecommerce.prisma:29` `:71` · `pos.prisma:186` · `restaurant.prisma:187` `:469` | พร้อม |
| `InvItem (tenantId, barcode)` | P1.1a (ขา UNION ที่สองของ `byBarcode`) · `ledger/wo-notes/pos-P1.1a.md:369` | พร้อม |
| `PosSale.shiftId` · `.refSaleId` · `.channelId` | `prisma/schema/pos.prisma:91` `:100` `:126` · TL-6 | พร้อม |
| `PosOrderLine.orderId` · `PosOrderEvent.orderId` (ตารางใหม่ ว่างตอน deploy) | TL-6 `ledger/HANDOVER-2026-10-16-POS-P2.md:218` | พร้อม (ใส่ใน migration ก็ได้ — มติ P5 §10-9 · เลือกทางมือเพื่อไม่แตะ `prisma/`) |
| `one_open_session_per_table` (partial unique) | P2.4 มติ Q9 · `prisma/schema/restaurant.prisma:356` · `src/lib/modules/restaurant/table.ts:174` · QC4 มีอยู่แล้วโดยไม่มี migration (`ledger/POS-RESUME.md:1275`) | พร้อม · ต้องนับแถวซ้ำก่อน |
| `PosSaleLine.refLineId` | P1.8 · `prisma/migrations/20261128000000_pos_p18_refund/migration.sql:4` | พร้อม |
| `PosSale.customerPartyId` · `PosSale.crmDealId` | P3.6 · `prisma/schema/pos.prisma:142` · `prisma/migrations/20261219100100_pos_p36_credit/migration.sql:2` (`sweepDealIntents` รายชั่วโมงอ่าน `crmDealId`) | พร้อม |
| ผลวัดของ P5.3 (index/batching) | `ledger/pos-briefs/pos-brief-P5.md:110` · `:154` | **pending P5.3** |

## 6. env

| ชื่อ | ใช้ที่ | ทำอะไร | ใครตั้ง |
|---|---|---|---|
| `POS_CREDENTIALS_KEY` | `src/lib/modules/pos/secret-box.ts:4` `:12` (≥ 32 ตัว `:14`) | กุญแจกล่อง creds (แพลตฟอร์ม · ตรวจสลิป · e-Tax) — W4: **ตั้งบน prod ก่อนวาง creds ใด ๆ** (`openssl rand -hex 32`) · ห้ามใช้ค่าเดียวกับ `CHAT_CREDENTIALS_KEY`/`SESSION_SECRET` · ไม่ตั้ง = การ์ดขึ้น "ยังไม่ตั้งกุญแจ" และบันทึกถูกปฏิเสธ | ⛔ เจ้าของ (Vercel dashboard) |
| กุญแจอุปกรณ์ (P5.2 D1c) | ยังไม่มีในโค้ด — `ledger/pos-briefs/pos-brief-P5.md:149` `:159` (env แยก ห้ามใช้ `CHAT_CREDENTIALS_KEY`/`POS_CREDENTIALS_KEY`) | คุกกี้อุปกรณ์ลงลายเซ็น (จับคู่โดยผู้จัดการ) | **pending P5.2 fix round** — ชื่อยังไม่กำหนด (CD-P61-P5) |
| `APP_URL` | ลิงก์ใบเสร็จออนไลน์/QR/webhook ของ POS | มีอยู่แล้วบน prod | ตรวจเท่านั้น |
| `SESSION_SECRET` | โทเคนพนักงาน/จอลูกค้า | มีอยู่แล้วบน prod | ตรวจเท่านั้น |
| `CRON_SECRET` | `/api/cron/*` | มีอยู่แล้ว (แพลตฟอร์ม) | ตรวจเท่านั้น |
| Beam keys | แพลตฟอร์ม (W20) | ไม่ใช่ env ของ POS | — |

`verify-prod-pos.mts` ข้อ V1 รายงานแค่ "ตั้ง/ไม่ตั้ง" ในโปรเซสที่รัน (ไม่ใช่ Vercel) ⇒ env ของ Vercel ⛔ เจ้าของดูใน dashboard เอง · ห้ามพิมพ์ค่า.

## 7. งานตั้งเวลา (cron) — ต้องถูกยิงจริงบน prod (ตรวจ ไม่เดา)

| งาน | อยู่ที่ | ถูกยิงโดย |
|---|---|---|
| `forceCloseStaleShifts` (ปิดกะค้าง) | `src/app/api/cron/hourly/route.ts:10` `:89-97` | `vercel.json:8-9` (`0 * * * *`) |
| `expirePaymentIntents` | `route.ts:11` `:98-106` | เดียวกัน |
| `expirePreorders` (สั่งล่วงหน้าเลยเวลาจ่าย) | `route.ts:12` `:107-115` | เดียวกัน |
| `sendPosDailyBriefs` (สรุปเช้า) | `route.ts:13` `:116-132` | เดียวกัน |
| `sweepPosBoard` (บอร์ดงาน 86/คืนเงิน) | `route.ts:133-142` | เดียวกัน |
| `sweepDealIntents` (บิลผูกดีล CRM) | `route.ts:143-152` | เดียวกัน |
| `pos.staffCommission.payroll` | `src/lib/platform/minute-jobs.ts:462-471` | ตัวกระจายงานรายนาที — `scripts/crm-cron.mts` บน crontab VPS (`ledger/CRM-C6-REGISTER.md:14`) หรือ `/api/cron/outbox` (`src/app/api/cron/outbox/route.ts:21` · route นี้ไม่มีตัวตั้งเวลาชี้มา — `ledger/crm-briefs/crm-brief-RESOLUTIONS.md:36`) |
| `pos.slip.purge` (+ `expirePrintJobs`) | `minute-jobs.ts:474-486` | เดียวกัน |

ตรวจหลัง deploy: OpsEvent/บันทึกท้ายรอบของ hourly มีค่า `posShiftsForced` ≥ 0 (ไม่ใช่ −1) · ตัวกระจายรายนาทีมีชื่อ `pos.*` ในรอบล่าสุด (CD-P61-P6: crontab ของ CRM ติดตั้งบน prod VPS แล้วหรือยัง — เจ้าของยืนยัน).

## 8. backfill (ลำดับ · ทีละร้าน · dry-run ก่อนเสมอ)

ลำดับ (มติ P6 §10-4): **catalog → `--verify` = 0 → `backfillWebPrices` → ข้อมูล P1.9 → ธง**.

1. ⛔ แคตตาล็อก dry-run (ทีละร้าน หรือ `--all` ที่พิมพ์เอง · C13) — ตัวเลขส่ง TG ให้เจ้าของ:
   ```bash
   env -C /root/projects/shark-pos bash scripts/iso.sh env ALLOW_PROD_BACKFILL=1 pnpm exec tsx scripts/pos-backfill-catalog.mts --tenant=<id> --dry-run
   ```
   ตัวนับราคาที่ต้องดูกับเจ้าของ (`scripts/pos-backfill-catalog.mts` · DRAFT §4): `soldAtCostToday` · `apIgnoredButTillPriced` · `invalidLegacyPrice` · `priceNotSetOther` · `catalogPriceDiffersFromTill` (เทียบราคาที่เก็บจริง ไม่ใช่คิดใหม่).
2. ⛔ เจ้าของตอบ "ทำ" → รันจริง (ต้องมี dry-run ชุดร้านเดียวกันภายใน 24 ชม. — `pos-backfill-catalog.mts:14`) · idempotent: รอบสอง created 0 · updated 0 (`:9`).
3. ⛔ `--verify` (อ่านล้วน) ต้อง exit 0 ทุกร้าน — รันซ้ำ **หลัง** backfill เพราะการแก้ของเดิมที่แข่งกับ backfill อาจทิ้ง drift (P1.1b hunter #3):
   ```bash
   env -C /root/projects/shark-pos bash scripts/iso.sh env ALLOW_PROD_BACKFILL=1 pnpm exec tsx scripts/pos-backfill-catalog.mts --tenant=<id> --verify
   ```
4. ⛔ `backfillWebPrices` (`src/lib/modules/pos/catalog.ts:3561` · `{ tenantIds, dryRun }` · รันซ้ำได้ · ต้องก่อนเปิดราคาเว็บอ่านสองทาง — HANDOVER-P2 :219) — **ยังไม่มีสคริปต์ CLI** (เรียกได้แค่จากข้อสอบ `qc-pos-p2.8`) ⇒ CD-P61-P8: ต้องมีตัวห่อ `--dry-run`/`--tenant` แบบเดียวกับ catalog ก่อน deploy.
5. ⛔ ข้อมูล P1.9 (OQ-P19-1 = (a)): ทุกระบบ POS ที่ `registerV2` เปิดอยู่แล้วตอน deploy → ตั้ง `settings.pos.shift.required.register = false` ก่อนเปิดใช้ (ร้านเลือกเปิดเอง) — **ยังไม่มีสคริปต์** (CD-P61-P8) · `verify-prod-pos` S3 บอกจำนวนระบบที่ `registerV2 = true` (QC4 วันนี้ = 2).
6. ทุกขั้น: ตัวเลข dry-run → TG → เจ้าของ "ทำ" → จริง → รอบสอง = 0 (CRM §9 C6.2).

## 9. เปิดใช้ทีละร้าน (rollout) · ธง/สวิตช์ · การถอยกลับ

- ร้านทดลองก่อน (W5 — ยังไม่มีร้านทดลอง) · ร้านอื่นคง V1/ปิด จนเจ้าของสั่ง (W-next-10).
- ⛔ ก่อนเปิด `registerV2` ของร้าน: เจ้าของทบทวนสิทธิ์ — พนักงานที่ถือ `pos.*` จะได้ `pos.sale.priceOverride` (ราคาเปิด + รายการกำหนดเอง) ทันที (m2 · P1.3 S3.47/S3.54).

| ธง/สวิตช์ (`AppSystem(POS).settings.pos.*` ต่อระบบ) | ค่าปริยาย | อ่านที่ | ถอยกลับ |
|---|---|---|---|
| `registerV2` | ปิด (ต้อง `=== true`) | `src/lib/modules/pos/register-shared.ts:109-112` | ตั้งเป็น false → กลับหน้าขายเดิม (แท็บเก่าที่ไม่มี deviceId ต้องโหลดใหม่) |
| `offline.enabled` | ปิด | `src/lib/modules/pos/offline-shared.ts:51-57` | ปิด → เครื่องหยุดรับขายออฟไลน์ใหม่ · บิลที่ค้างซิงก์ยังซิงก์ได้ |
| `credit.enabled` (+ `requireBuyer`) | ปิด | `src/lib/modules/pos/credit-settings.ts:39-41` | ปิด → ไม่รับวางบิลใหม่ · ยอดค้างเดิมคงอยู่ |
| `chat.receiptAuto` · `chat.refundNotice` · `chat.orderStatus` · `chat.autoReply` | ปิดทั้ง 4 | `src/lib/modules/pos/chat-link-shared.ts:24-31` | ปิดรายตัวในหน้าตั้งค่า |
| `board.enabled` (+ rules) · `teamRoom` | ปิด | `src/lib/modules/pos/board-settings-shared.ts:37-45` | ปิด → cron ไม่สร้างการ์ดใหม่ |
| `ai.enabled` · `ai.brief.enabled` | ปิด | `src/lib/modules/pos/ai-brief.ts:152` · `ai-settings-actions.ts:6` | ปิด → ไม่ส่งสรุปเช้า |
| `deposit.enabled` · `serviceCharge.enabled` · `tip.enabled` | ปิด | `src/lib/modules/pos/payment-settings.ts:32-35` `:67-77` | ปิดรายตัว |
| แพลตฟอร์ม/ตรวจสลิป/e-Tax (creds `PLATFORM` · `SLIP_VERIFY` · `ETAX`) | ไม่มี creds = ปิด | `src/lib/modules/pos/integration-creds.ts:19-20` | ลบ/ปิด creds ในหน้าตั้งค่า · ต้องมี `POS_CREDENTIALS_KEY` ก่อน (§6) |
| พิมพ์ผ่าน LAN (print agent) | ไม่มี agent = ปิด | `src/lib/modules/pos/print-relay.ts:108` `:135` | `revokePrintAgent` |
| `shift.required.register` | เปิดสำหรับ registerV2 (ค่าปริยาย) | P1.9 | ข้อมูลขั้น §8.5 |

- ถอยกลับทั้งร้าน = ปิดธงตามตาราง (ไม่ต้องย้อน migration · ข้อมูลเพิ่มอย่างเดียว).
- ถอยกลับทั้งระบบ (เหตุร้ายแรง) = ⛔ promote build ก่อนหน้าบน Vercel — schema ใหม่รองรับโค้ดเก่า (§4.2) · ไม่ต้องย้อนฐาน.
- SQL ถอยกลับในภาคผนวก ก = เฉพาะ migration ที่ล้ม (§4.3) — ไม่ใช่ทางถอยปกติ.

## 10. ตรวจหลัง deploy — `scripts/verify-prod-pos.mts`

```bash
# รายการข้อ (ไม่แตะ DB)
env -C /root/projects/shark-pos bash scripts/iso.sh pnpm exec tsx scripts/verify-prod-pos.mts --list
# ⛔ เจ้าของ · prod อ่านอย่างเดียว · host ต้องอยู่ใน allowlist + ALLOW_PROD_AUDIT=1 (ไม่โหลด .env)
env -C /root/projects/shark-pos bash scripts/iso.sh env ALLOW_PROD_AUDIT=1 DATABASE_URL='<PROD_DIRECT_URL>' pnpm exec tsx scripts/verify-prod-pos.mts
# self-test บน QC4 (เลนปกติ)
env -C /root/projects/shark-pos bash scripts/iso.sh bash scripts/qc4.sh env GATE_LOCK_FILE=/tmp/shark-gate-pos.lock bash scripts/with-gate-lock.sh pnpm exec tsx scripts/verify-prod-pos.mts --self-test
```

| ส่วน | ข้อ | หลัง migrate | หลัง index | หลัง backfill | ทุกวัน 24 ชม. แรก |
|---|---|---|---|---|---|
| ด่าน | G1 · RO · P0 | 🟢 | 🟢 | 🟢 | 🟢 |
| migration | M1 · M2 · M3 | 🟢 | 🟢 | 🟢 | 🟢 |
| schema | T1 · C1 · E1 · I1 | 🟢 | 🟢 | 🟢 | 🟢 |
| index มือ | X1 | 🟡 (ยังไม่สร้าง) | 🟢 | 🟢 | 🟢 |
| ข้อมูล | S1 · S2 | S2 🟢 · S1 ดูตัวเลข | | | |
| ธง/ค่าตั้ง | S3 · S4 | จดตัวเลข (registerV2 = true กี่ระบบ → §8.5) | | ร้านทดลองเท่านั้นที่เปลี่ยน | |
| แคตตาล็อก | S5 | linked = 0 | | linked ตรง dry-run · `--verify` 0 | |
| คิว/ops | S6 · S7 | จด baseline | | | FAILED 0 · ERROR 0 (CRM C6.1) |
| integration | S8 · V1 | creds 0 | | | creds > 0 ⇒ `POS_CREDENTIALS_KEY` ตั้งแล้ว |

exit 0 = ไม่มี FAIL · ผล `JSON_SUMMARY` วางใน ledger/wo-notes/pos-P6.1.md (สร้างตอนซ้อม).

## 11. จุดที่ต้องให้เจ้าของสั่ง ⛔ (W32 · ทีละขั้น)

1. ⛔ merge PR `session/pos` → `main` (W-next-11).
2. ⛔ เลือกหน้าต่างนอกเวลาขาย + ใครรัน (W-next-8 · ค่าปริยาย W32 = เจ้าของรันเองตามเอกสารนี้ ผู้คุมอ่านให้ทีละขั้น).
3. ⛔ ซ้อมบน branch ที่คัดลอกจาก prod (W31) หรือ QC4 เท่านั้น.
4. ⛔ สร้าง Neon branch จุดย้อนกลับก่อน deploy.
5. ⛔ รันคำสั่งตรวจอ่านอย่างเดียว §3.4 บน prod.
6. ⛔ ตั้ง `lock_timeout` ระดับ role ชั่วคราว (ถ้าเลือก §3.3 ก).
7. ⛔ `prisma migrate deploy` (§4.2) · ⛔ `migrate resolve --rolled-back` (§4.3).
8. ⛔ promote build ใหม่บน Vercel หลัง migrate.
9. ⛔ `CREATE INDEX CONCURRENTLY` ทีละตัว (§5).
10. ⛔ ตั้ง env `POS_CREDENTIALS_KEY` บน Vercel (§6 · W4).
11. ⛔ backfill: dry-run → "ทำ" → จริง ทีละร้าน (§8.1–8.5).
12. ⛔ `verify-prod-pos.mts` บน prod (§10).
13. ⛔ เปิดธงร้านทดลอง (§9 · W5) — หลังทบทวนสิทธิ์ priceOverride.
14. ⛔ ขายจริง 1 บิล + Z report + ออเดอร์ MANUAL ลงบัญชีที่ร้านทดลอง (หลักฐานปิด `POS-MASTER-PLAN.md:142-143`).

## 12. ดัชนีหลักฐาน (evidence pack)

- บันทึกการซ้อม/deploy จริง: ledger/wo-notes/pos-P6.1.md (สร้างตอนซ้อม) (ชื่อ branch · log migrate · ตัวเลข dry-run · ผล verify · ด่าน + qc:all · ลบ branch).
- งานเตรียมนี้: ledger/wo-notes/pos-P6.1-prep.md (ตาราง migration · ผล `--self-test` บน QC4 · red-before ของ `qc-pos-p6.1`).
- ดัชนีรวมสุดท้าย = HANDOVER-POS ฉบับปิด (P6.2 · มติ P6 §10-9) `ledger/HANDOVER-*-POS.md` §ดัชนีหลักฐาน — ข้อที่ต้องเจ้าของ (ขายจริงที่ร้านทดลอง = W5) ติดป้าย "owner".
- ข้อความ PR: ledger/pos-briefs/pos-PR-main.md (ยังไม่มี — รอ P3.12/P4/P5 ปิด).

## ภาคผนวก ก — SQL ถอยกลับ (เฉพาะ migration ที่ล้มกลางทาง)

กติกา: รันเฉพาะของไฟล์ที่ล้ม · ทีละคำสั่ง autocommit · ทุกคำสั่ง `IF EXISTS` (รันซ้ำได้) · ลำดับ = index → คอลัมน์ → ตาราง → type (ย้อนลำดับสร้าง) · ไฟล์ `DO` เป็น atomic ⇒ ปกติไม่มีอะไรต้องถอย (บล็อกมีไว้กรณีรันมือ) · ค่า enum ที่เพิ่มถอนไม่ได้ (ปล่อยไว้) · จบแล้ว ⛔ `prisma migrate resolve --rolled-back <name>` (§4.3).

#### 20261120000000_pos_v2_a
```sql
SET lock_timeout = '3s';
DROP INDEX IF EXISTS "PosCategory_systemId_name_all_branches_key";
DROP INDEX IF EXISTS "RecipeLine_productId_invItemId_key";
DROP INDEX IF EXISTS "RecipeLine_invItemId_idx";
DROP INDEX IF EXISTS "RecipeLine_tenantId_idx";
DROP INDEX IF EXISTS "PosProductOptionGroup_productId_groupId_key";
DROP INDEX IF EXISTS "PosProductOptionGroup_groupId_idx";
DROP INDEX IF EXISTS "PosProductOptionGroup_tenantId_idx";
DROP INDEX IF EXISTS "PosProduct_systemId_invItemId_key";
DROP INDEX IF EXISTS "PosProduct_parentId_idx";
DROP INDEX IF EXISTS "PosProduct_systemId_barcode_idx";
DROP INDEX IF EXISTS "PosProduct_systemId_archivedAt_name_id_idx";
DROP INDEX IF EXISTS "PosProduct_tenantId_idx";
DROP INDEX IF EXISTS "PosCategory_systemId_unitId_name_key";
DROP INDEX IF EXISTS "PosCategory_tenantId_idx";
DROP TABLE IF EXISTS "RecipeLine";
DROP TABLE IF EXISTS "PosProductOptionGroup";
DROP TABLE IF EXISTS "PosProduct";
DROP TABLE IF EXISTS "PosCategory";
DROP TYPE IF EXISTS "PosProductKind";
RESET lock_timeout;
```

#### 20261120000001_pos_v2_a_links
```sql
SET lock_timeout = '3s';
ALTER TABLE "RestaurantOrderItem" DROP COLUMN IF EXISTS "productId";
ALTER TABLE "MenuItem" DROP COLUMN IF EXISTS "posProductId";
ALTER TABLE "PosSaleLine" DROP COLUMN IF EXISTS "productId";
ALTER TABLE "ShopOrderLine" DROP COLUMN IF EXISTS "posProductId";
ALTER TABLE "ShopProduct" DROP COLUMN IF EXISTS "posProductId";
RESET lock_timeout;
```

#### 20261121000000_pos_p15_held_cart
```sql
SET lock_timeout = '3s';
DROP INDEX IF EXISTS "PosHeldCart_unitId_status_createdAt_idx";
DROP TABLE IF EXISTS "PosHeldCart";
DROP TYPE IF EXISTS "PosHeldCartStatus";
RESET lock_timeout;
```

#### 20261122000000_pos_p16_payment
```sql
SET lock_timeout = '3s';
ALTER TABLE "PosSaleLine" DROP COLUMN IF EXISTS "note";
ALTER TABLE "PosSale" DROP COLUMN IF EXISTS "tipSatang";
ALTER TABLE "PosSale" DROP COLUMN IF EXISTS "serviceChargeSatang";
ALTER TABLE "PosSale" DROP COLUMN IF EXISTS "note";
ALTER TABLE "PosPayment" DROP COLUMN IF EXISTS "tenderedSatang";
ALTER TABLE "PosPayment" DROP COLUMN IF EXISTS "reference";
ALTER TABLE "PosPayment" DROP COLUMN IF EXISTS "changeSatang";
-- PosPayType 'CARD': ค่า enum ถอนไม่ได้ — ปล่อยไว้ (ค่าที่ไม่มีแถวใช้ = ไม่มีผล)
RESET lock_timeout;
```

#### 20261123000000_pos_p19_shift
```sql
SET lock_timeout = '3s';
DROP INDEX IF EXISTS "one_open_shift_per_device";
DROP INDEX IF EXISTS "PosShiftCounter_unitId_key";
DROP INDEX IF EXISTS "PosCashMovement_tenantId_idempotencyKey_key";
DROP INDEX IF EXISTS "PosCashMovement_shiftId_idx";
DROP INDEX IF EXISTS "PosShift_unitId_zNumber_key";
DROP INDEX IF EXISTS "PosShift_unitId_shiftNo_key";
DROP INDEX IF EXISTS "PosShift_tenantId_unitId_status_idx";
ALTER TABLE "PosSale" DROP COLUMN IF EXISTS "shiftId";
DROP TABLE IF EXISTS "PosShiftCounter";
DROP TABLE IF EXISTS "PosCashMovement";
DROP TABLE IF EXISTS "PosShift";
DROP TYPE IF EXISTS "PosCashMoveKind";
DROP TYPE IF EXISTS "PosShiftStatus";
RESET lock_timeout;
```

#### 20261124000000_pos_p12_options
```sql
SET lock_timeout = '3s';
DROP INDEX IF EXISTS "PosProduct_systemId_scalePlu_active_key";
DROP INDEX IF EXISTS "PosSaleLineOption_lineId_idx";
DROP INDEX IF EXISTS "PosSaleLineOption_saleId_idx";
DROP INDEX IF EXISTS "PosSaleLineOption_tenantId_idx";
ALTER TABLE "PosProduct" DROP COLUMN IF EXISTS "soldByWeight";
ALTER TABLE "PosProduct" DROP COLUMN IF EXISTS "scalePlu";
ALTER TABLE "PosSaleLine" DROP COLUMN IF EXISTS "weightGrams";
ALTER TABLE "PosSaleLine" DROP COLUMN IF EXISTS "components";
DROP TABLE IF EXISTS "PosSaleLineOption";
RESET lock_timeout;
```

#### 20261125000000_pos_p19b_shift_recount
```sql
SET lock_timeout = '3s';
DROP INDEX IF EXISTS "PosShiftRecount_tenantId_idempotencyKey_key";
DROP INDEX IF EXISTS "PosShiftRecount_tenantId_unitId_createdAt_idx";
DROP INDEX IF EXISTS "PosShiftRecount_shiftId_key";
DROP TABLE IF EXISTS "PosShiftRecount";
RESET lock_timeout;
```

#### 20261126000000_pos_p117_reports
```sql
SET lock_timeout = '3s';
ALTER TABLE "PosSale" DROP COLUMN IF EXISTS "soldByUserId";
RESET lock_timeout;
```

#### 20261127000000_pos_p114_stock_count
```sql
SET lock_timeout = '3s';
DROP INDEX IF EXISTS "PosStockCount_open_location_key";
DROP INDEX IF EXISTS "PosStockCountEntry_tenantId_idempotencyKey_key";
DROP INDEX IF EXISTS "PosStockCountEntry_countId_idx";
DROP INDEX IF EXISTS "PosStockCountLine_countId_itemId_key";
DROP INDEX IF EXISTS "PosStockCountLine_tenantId_idx";
DROP INDEX IF EXISTS "PosStockCount_unitId_countNo_key";
DROP INDEX IF EXISTS "PosStockCount_tenantId_openKey_key";
DROP INDEX IF EXISTS "PosStockCount_tenantId_unitId_status_idx";
DROP TABLE IF EXISTS "PosStockCountEntry";
DROP TABLE IF EXISTS "PosStockCountLine";
DROP TABLE IF EXISTS "PosStockCount";
DROP TYPE IF EXISTS "PosStockCountScope";
DROP TYPE IF EXISTS "PosStockCountStatus";
RESET lock_timeout;
```

#### 20261128000000_pos_p18_refund
```sql
SET lock_timeout = '3s';
DROP INDEX IF EXISTS "PosDocCounter_unitId_docType_period_key";
ALTER TABLE "PosSaleLine" DROP COLUMN IF EXISTS "restock";
ALTER TABLE "PosSaleLine" DROP COLUMN IF EXISTS "refLineId";
ALTER TABLE "PosSale" DROP COLUMN IF EXISTS "refundedSatang";
ALTER TABLE "PosSale" DROP COLUMN IF EXISTS "refSaleId";
ALTER TABLE "PosSale" DROP COLUMN IF EXISTS "reasonCode";
ALTER TABLE "PosSale" DROP COLUMN IF EXISTS "docType";
DROP TABLE IF EXISTS "PosDocCounter";
DROP TYPE IF EXISTS "PosSaleDocType";
RESET lock_timeout;
```

#### 20261128100000_pos_p110_devices
```sql
SET lock_timeout = '3s';
DROP INDEX IF EXISTS "PosDevice_unitId_deviceCode_key";
DROP INDEX IF EXISTS "PosDevice_tenantId_unitId_status_idx";
DROP TABLE IF EXISTS "PosDevice";
DROP TYPE IF EXISTS "PosDeviceStatus";
RESET lock_timeout;
```

#### 20261129000000_pos_p111_online_receipt
```sql
SET lock_timeout = '3s';
DROP INDEX IF EXISTS "PosSale_publicToken_key";
DROP INDEX IF EXISTS "PosTaxInvoiceRequest_tenantId_status_createdAt_idx";
DROP INDEX IF EXISTS "PosTaxInvoiceRequest_tenantId_saleId_idx";
DROP INDEX IF EXISTS "PosReceiptIssue_tenantId_saleId_createdAt_idx";
ALTER TABLE "PosSale" DROP COLUMN IF EXISTS "publicToken";
DROP TABLE IF EXISTS "PosTaxInvoiceRequest";
DROP TABLE IF EXISTS "PosReceiptIssue";
DROP TYPE IF EXISTS "PosTaxInvoiceRequestStatus";
DROP TYPE IF EXISTS "PosReceiptIssueStatus";
RESET lock_timeout;
```

#### 20261130000000_pos_p115_staff_pin_approval
```sql
SET lock_timeout = '3s';
DROP INDEX IF EXISTS "PosApprovalPayload_tenantId_kind_idx";
DROP INDEX IF EXISTS "PosStaffPin_unitId_userId_key";
DROP INDEX IF EXISTS "PosStaffPin_tenantId_unitId_idx";
ALTER TABLE "PosHeldCart" DROP COLUMN IF EXISTS "approvedRequestId";
DROP TABLE IF EXISTS "PosApprovalPayload";
DROP TABLE IF EXISTS "PosStaffPin";
RESET lock_timeout;
```

#### 20261130100000_pos_p17_payment_intent
```sql
SET lock_timeout = '3s';
DROP INDEX IF EXISTS "PosPaymentIntent_tenantId_idempotencyKey_key";
DROP INDEX IF EXISTS "PosPaymentIntent_beamChargeId_idx";
DROP INDEX IF EXISTS "PosPaymentIntent_tenantId_unitId_status_createdAt_idx";
DROP TABLE IF EXISTS "PosPaymentIntent";
RESET lock_timeout;
```

#### 20261201100000_pos_p113_tax_invoice
```sql
SET lock_timeout = '3s';
DROP INDEX IF EXISTS "PosBuyerProfile_tenantId_taxId_idx";
DROP INDEX IF EXISTS "PosBuyerProfile_customerId_key";
ALTER TABLE "PosSale" DROP COLUMN IF EXISTS "taxInvoiceDocId";
ALTER TABLE "PosSale" DROP COLUMN IF EXISTS "taxInvoice";
ALTER TABLE "AccountDocument" DROP COLUMN IF EXISTS "supersededByDocId";
DROP TABLE IF EXISTS "PosBuyerProfile";
RESET lock_timeout;
```

#### 20261202100000_pos_p112_member_snapshot
```sql
SET lock_timeout = '3s';
ALTER TABLE "PosSale" DROP COLUMN IF EXISTS "memberBenefits";
ALTER TABLE "PosSale" DROP COLUMN IF EXISTS "memberSnapshot";
RESET lock_timeout;
```

#### 20261203100000_pos_p21_sales_channel
```sql
SET lock_timeout = '3s';
DROP INDEX IF EXISTS "SalesChannel_tenantId_systemId_unitId_idx";
DROP INDEX IF EXISTS "SalesChannel_unitId_code_key";
ALTER TABLE "PosSale" DROP COLUMN IF EXISTS "channelCommissionVatSatang";
ALTER TABLE "PosSale" DROP COLUMN IF EXISTS "channelCommissionSatang";
ALTER TABLE "PosSale" DROP COLUMN IF EXISTS "channelPayout";
ALTER TABLE "PosSale" DROP COLUMN IF EXISTS "channelRef";
ALTER TABLE "PosSale" DROP COLUMN IF EXISTS "channelCode";
ALTER TABLE "PosSale" DROP COLUMN IF EXISTS "channelId";
DROP TABLE IF EXISTS "SalesChannel";
DROP TYPE IF EXISTS "SalesChannelPayout";
DROP TYPE IF EXISTS "SalesChannelAdapter";
DROP TYPE IF EXISTS "SalesChannelKind";
-- PosPayType 'PLATFORM': ค่า enum ถอนไม่ได้ — ปล่อยไว้ (ค่าที่ไม่มีแถวใช้ = ไม่มีผล)
RESET lock_timeout;
```

#### 20261204100000_pos_p22_prices
```sql
SET lock_timeout = '3s';
DROP INDEX IF EXISTS "PosPriceRule_tenantId_systemId_archivedAt_idx";
DROP INDEX IF EXISTS "PosProductChannelPrice_tenantId_systemId_productId_idx";
DROP INDEX IF EXISTS "PosProductChannelPrice_product_code_unit_key";
ALTER TABLE "PosSaleLine" DROP COLUMN IF EXISTS "priceSource";
ALTER TABLE "PosSaleLine" DROP COLUMN IF EXISTS "priceRuleId";
ALTER TABLE "PosSaleLine" DROP COLUMN IF EXISTS "listPriceSatang";
DROP TABLE IF EXISTS "PosPriceRule";
DROP TABLE IF EXISTS "PosProductChannelPrice";
DROP TYPE IF EXISTS "PosPriceRuleAdjust";
DROP TYPE IF EXISTS "PosPriceRuleKind";
DROP TYPE IF EXISTS "PosPriceSource";
RESET lock_timeout;
```

#### 20261205100000_pos_p23_recipe
```sql
SET lock_timeout = '3s';
DROP INDEX IF EXISTS "PosRecipeChoiceLine_productId_choiceId_invItemId_key";
DROP INDEX IF EXISTS "PosRecipeChoiceLine_invItemId_idx";
DROP INDEX IF EXISTS "PosRecipeChoiceLine_tenantId_idx";
ALTER TABLE "PosProduct" DROP COLUMN IF EXISTS "bomEnabled";
DROP TABLE IF EXISTS "PosRecipeChoiceLine";
RESET lock_timeout;
```

#### 20261206100000_pos_p24_tables
```sql
SET lock_timeout = '3s';
DROP INDEX IF EXISTS "RestaurantReservation_unitId_at_idx";
DROP INDEX IF EXISTS "RestaurantReservation_tenantId_idx";
DROP INDEX IF EXISTS "PosHeldCart_tableSessionId_held_key";
ALTER TABLE "RestaurantTable" DROP COLUMN IF EXISTS "dirtySince";
ALTER TABLE "PosHeldCart" DROP COLUMN IF EXISTS "tableSessionId";
DROP TABLE IF EXISTS "RestaurantReservation";
DROP TYPE IF EXISTS "RestReservationStatus";
RESET lock_timeout;
```

#### 20261207100000_pos_p28_orders
```sql
SET lock_timeout = '3s';
DROP INDEX IF EXISTS "PosOrder_tenantId_idempotencyKey_key";
DROP INDEX IF EXISTS "PosOrder_tenantId_channelId_externalRef_key";
DROP INDEX IF EXISTS "PosOrder_tenantId_unitId_status_receivedAt_idx";
DROP TABLE IF EXISTS "PosOrderEvent";
DROP TABLE IF EXISTS "PosOrderLine";
DROP TABLE IF EXISTS "PosOrder";
DROP TYPE IF EXISTS "PosOrderFulfilment";
DROP TYPE IF EXISTS "PosOrderPaymentState";
DROP TYPE IF EXISTS "PosOrderStatus";
RESET lock_timeout;
```

#### 20261208100000_pos_p26_kds
```sql
SET lock_timeout = '3s';
DROP INDEX IF EXISTS "PosAvailabilityMark_tenantId_unitId_idx";
DROP INDEX IF EXISTS "PosAvailabilityMark_unitId_productId_key";
DROP INDEX IF EXISTS "RestaurantOrder_posOrderId_key";
DROP INDEX IF EXISTS "RestaurantOrder_posSaleId_key";
ALTER TABLE "RestaurantSetting" DROP COLUMN IF EXISTS "autoAcceptMaxOpen";
ALTER TABLE "RestaurantOrder" DROP COLUMN IF EXISTS "targetMinutes";
ALTER TABLE "RestaurantOrder" DROP COLUMN IF EXISTS "externalRef";
ALTER TABLE "RestaurantOrder" DROP COLUMN IF EXISTS "channelName";
ALTER TABLE "RestaurantOrder" DROP COLUMN IF EXISTS "channelCode";
ALTER TABLE "RestaurantOrder" DROP COLUMN IF EXISTS "posOrderId";
ALTER TABLE "RestaurantOrder" DROP COLUMN IF EXISTS "posSaleId";
DROP TABLE IF EXISTS "PosAvailabilityMark";
DROP TYPE IF EXISTS "PosAvailabilitySource";
RESET lock_timeout;
```

#### 20261208100100_pos_p26_stock_taken
```sql
SET lock_timeout = '3s';
ALTER TABLE "RestaurantOrderItem" DROP COLUMN IF EXISTS "stockTaken";
RESET lock_timeout;
```

#### 20261208100200_pos_p26_station_set_at
```sql
SET lock_timeout = '3s';
ALTER TABLE "PosProduct" DROP COLUMN IF EXISTS "stationSetAt";
RESET lock_timeout;
```

#### 20261209100000_pos_p29_tenders
```sql
SET lock_timeout = '3s';
DROP INDEX IF EXISTS "GiftCard_storeCredit_owner_key";
ALTER TABLE "GiftCard" DROP COLUMN IF EXISTS "kind";
ALTER TABLE "PosPayment" DROP COLUMN IF EXISTS "giftCardTxnId";
ALTER TABLE "PosPayment" DROP COLUMN IF EXISTS "giftCardId";
DROP TYPE IF EXISTS "GiftCardKind";
-- PosPayType 'GIFT_CARD': ค่า enum ถอนไม่ได้ — ปล่อยไว้ (ค่าที่ไม่มีแถวใช้ = ไม่มีผล)
-- PosPayType 'STORE_CREDIT': ค่า enum ถอนไม่ได้ — ปล่อยไว้ (ค่าที่ไม่มีแถวใช้ = ไม่มีผล)
RESET lock_timeout;
```

#### 20261210100000_pos_p25_split
```sql
SET lock_timeout = '3s';
DROP INDEX IF EXISTS "PosTableSplitLine_itemId_idx";
DROP INDEX IF EXISTS "PosTableSplitLine_splitId_idx";
DROP INDEX IF EXISTS "PosTableSplitPart_saleId_key";
DROP INDEX IF EXISTS "PosTableSplitPart_splitId_no_key";
DROP INDEX IF EXISTS "PosTableSplitPart_tenantId_idx";
DROP INDEX IF EXISTS "PosTableSplit_session_open_key";
DROP INDEX IF EXISTS "PosTableSplit_sessionId_idx";
DROP INDEX IF EXISTS "PosTableSplit_tenantId_unitId_idx";
DROP TABLE IF EXISTS "PosTableSplitLine";
DROP TABLE IF EXISTS "PosTableSplitPart";
DROP TABLE IF EXISTS "PosTableSplit";
DROP TYPE IF EXISTS "PosTableSplitPartStatus";
DROP TYPE IF EXISTS "PosTableSplitStatus";
DROP TYPE IF EXISTS "PosTableSplitMode";
RESET lock_timeout;
```

#### 20261211100000_pos_p29b_deposits
```sql
SET lock_timeout = '3s';
DROP INDEX IF EXISTS "PosDepositTxn_saleId_idx";
DROP INDEX IF EXISTS "PosDepositTxn_depositId_idx";
DROP INDEX IF EXISTS "PosDepositTxn_idempotencyKey_key";
DROP INDEX IF EXISTS "PosDeposit_tenantId_customerId_idx";
DROP INDEX IF EXISTS "PosDeposit_tenantId_unitId_status_createdAt_idx";
DROP INDEX IF EXISTS "PosDeposit_tenantId_idempotencyKey_key";
DROP INDEX IF EXISTS "PosDeposit_receiptSaleId_key";
DROP TABLE IF EXISTS "PosDepositTxn";
DROP TABLE IF EXISTS "PosDeposit";
DROP TYPE IF EXISTS "PosDepositTxnType";
DROP TYPE IF EXISTS "PosDepositStatus";
RESET lock_timeout;
```

#### 20261211110000_pos_p29b_deposit_phone_lock
```sql
SET lock_timeout = '3s';
ALTER TABLE "PosDeposit" DROP COLUMN IF EXISTS "phoneLockedUntil";
ALTER TABLE "PosDeposit" DROP COLUMN IF EXISTS "phoneFailedCount";
RESET lock_timeout;
```

#### 20261215100000_pos_p210_customer_display
```sql
SET lock_timeout = '3s';
DROP INDEX IF EXISTS "PosCustomerDisplay_tenantId_unitId_status_idx";
DROP INDEX IF EXISTS "PosCustomerDisplay_pairCodeHash_key";
DROP INDEX IF EXISTS "PosCustomerDisplay_active_device_key";
DROP INDEX IF EXISTS "PosCustomerDisplay_tokenHash_key";
DROP TABLE IF EXISTS "PosCustomerDisplay";
DROP TYPE IF EXISTS "PosCustomerDisplayStatus";
RESET lock_timeout;
```

#### 20261216100000_pos_p27_qr_orders
```sql
SET lock_timeout = '3s';
DROP INDEX IF EXISTS "PosOrderLink_active_unit_key";
DROP INDEX IF EXISTS "PosOrderLink_tenantId_unitId_status_idx";
DROP INDEX IF EXISTS "PosOrderLink_token_key";
DROP INDEX IF EXISTS "PosPaymentIntent_orderId_idx";
DROP INDEX IF EXISTS "PosOrder_tenantId_unitId_paymentState_payBy_idx";
DROP INDEX IF EXISTS "PosOrder_publicToken_key";
ALTER TABLE "PosPaymentIntent" DROP COLUMN IF EXISTS "orderId";
ALTER TABLE "PosOrder" DROP COLUMN IF EXISTS "publicToken";
ALTER TABLE "PosOrder" DROP COLUMN IF EXISTS "paymentIntentId";
ALTER TABLE "PosOrder" DROP COLUMN IF EXISTS "customerClaimAt";
ALTER TABLE "PosOrder" DROP COLUMN IF EXISTS "paidAt";
ALTER TABLE "PosOrder" DROP COLUMN IF EXISTS "payBy";
DROP TABLE IF EXISTS "PosOrderLink";
-- PosOrderPaymentState 'PENDING_PAYMENT': ค่า enum ถอนไม่ได้ — ปล่อยไว้ (ค่าที่ไม่มีแถวใช้ = ไม่มีผล)
-- PosOrderPaymentState 'PREPAID': ค่า enum ถอนไม่ได้ — ปล่อยไว้ (ค่าที่ไม่มีแถวใช้ = ไม่มีผล)
-- SalesChannelAdapter 'QR': ค่า enum ถอนไม่ได้ — ปล่อยไว้ (ค่าที่ไม่มีแถวใช้ = ไม่มีผล)
-- PosPaymentIntent DROP NOT NULL (deviceId · createdByUserId): ปล่อยไว้ — SET NOT NULL กลับล้มถ้ามีแถว null
RESET lock_timeout;
```

#### 20261217100000_pos_p35_staff_commission
```sql
SET lock_timeout = '3s';
DROP INDEX IF EXISTS "PosStaffCommission_saleId_idx";
DROP INDEX IF EXISTS "PosStaffCommission_tenantId_userId_status_periodKey_idx";
DROP INDEX IF EXISTS "PosStaffCommission_sourceKey_key";
DROP TABLE IF EXISTS "PosStaffCommission";
DROP TYPE IF EXISTS "PosStaffCommissionStatus";
DROP TYPE IF EXISTS "PosStaffCommissionKind";
RESET lock_timeout;
```

#### 20261217110000_pos_p34_offline
```sql
SET lock_timeout = '3s';
DROP INDEX IF EXISTS "PosDevice_unit_offlineCode_key";
DROP INDEX IF EXISTS "PosSale_unit_offlineRef_key";
DROP INDEX IF EXISTS "PosOfflineSnapshot_tenantId_unitId_deviceId_issuedAt_idx";
DROP INDEX IF EXISTS "PosOfflineSnapshot_unitId_deviceId_hash_key";
DROP INDEX IF EXISTS "PosOfflineSale_tenantId_unitId_offlineRef_idx";
DROP INDEX IF EXISTS "PosOfflineSale_tenantId_unitId_status_soldAt_idx";
DROP INDEX IF EXISTS "PosOfflineSale_tenantId_idempotencyKey_key";
ALTER TABLE "PosDevice" DROP COLUMN IF EXISTS "offlineSeq";
ALTER TABLE "PosDevice" DROP COLUMN IF EXISTS "offlineCode";
ALTER TABLE "PosSale" DROP COLUMN IF EXISTS "syncedAt";
ALTER TABLE "PosSale" DROP COLUMN IF EXISTS "offlineRef";
DROP TABLE IF EXISTS "PosOfflineSnapshot";
DROP TABLE IF EXISTS "PosOfflineSale";
RESET lock_timeout;
```

#### 20261218100000_pos_p3skel
```sql
SET lock_timeout = '3s';
DROP INDEX IF EXISTS "PosPrintJob_status_expiresAt_idx";
DROP INDEX IF EXISTS "PosPrintJob_agentId_status_createdAt_idx";
DROP INDEX IF EXISTS "PosPrintJob_tenantId_idempotencyKey_key";
DROP INDEX IF EXISTS "PosPrintAgent_tenantId_unitId_idx";
DROP INDEX IF EXISTS "PosPrintAgent_tokenHash_key";
DROP INDEX IF EXISTS "PosPaymentSlip_purgeAfter_idx";
DROP INDEX IF EXISTS "PosPaymentSlip_tenantId_intentId_idx";
DROP INDEX IF EXISTS "PosPaymentSlip_tenantId_saleId_idx";
DROP INDEX IF EXISTS "PosPaymentSlip_tenantId_transRef_key";
DROP INDEX IF EXISTS "PosPaymentSlip_tenantId_idempotencyKey_key";
DROP INDEX IF EXISTS "PosIntegrationCredential_tenantId_systemId_unitId_idx";
DROP INDEX IF EXISTS "PosIntegrationCredential_tenantId_kind_provider_scopeKey_key";
DROP TABLE IF EXISTS "PosPrintJob";
DROP TABLE IF EXISTS "PosPrintAgent";
DROP TABLE IF EXISTS "PosPaymentSlip";
DROP TABLE IF EXISTS "PosIntegrationCredential";
RESET lock_timeout;
```

#### 20261218100100_pos_p3skel_slip_hash
```sql
SET lock_timeout = '3s';
DROP INDEX IF EXISTS "PosPaymentSlip_tenantId_sha256_key";
ALTER TABLE "PosPaymentSlip" DROP COLUMN IF EXISTS "sha256";
RESET lock_timeout;
```

#### 20261219100000_pos_p36_credit_enum
```sql
SET lock_timeout = '3s';
-- PosPayType 'ON_ACCOUNT': ค่า enum ถอนไม่ได้ — ปล่อยไว้ (ค่าที่ไม่มีแถวใช้ = ไม่มีผล)
RESET lock_timeout;
```

#### 20261219100100_pos_p36_credit
```sql
SET lock_timeout = '3s';
DROP INDEX IF EXISTS "PosCreditAccount_tenantId_idx";
DROP INDEX IF EXISTS "PosCreditAccount_systemId_partyId_key";
ALTER TABLE "PosSale" DROP COLUMN IF EXISTS "creditTerms";
ALTER TABLE "PosSale" DROP COLUMN IF EXISTS "crmDealId";
ALTER TABLE "PosSale" DROP COLUMN IF EXISTS "customerPartyId";
DROP TABLE IF EXISTS "PosCreditAccount";
RESET lock_timeout;
```

## ภาคผนวก ข — เปลี่ยนอะไรจาก DRAFT 3 ต.ค.

- รายการ migration 2 → 36 ไฟล์ พร้อมโหมด tx · lock_timeout · ชั้นล็อก · SQL ถอยกลับครบทุกไฟล์ (DRAFT §1 รู้จักแค่ `pos_v2_a`/`_links`).
- ตาราง pre-flight 5 → 12 ตาราง (+ index บนตารางเดิม 5 ตัว · ไฟล์ไม่มี lock_timeout 4 ไฟล์).
- เงื่อนไข §0: hotfix RC ไม่ใช่ตัวบล็อกแล้ว · `SYSTEM_MARKER_ALLOWLIST` และกติกา registerCatalog ทำแล้ว · `qc-prisma.sh` ยังไม่รู้จัก QC4 (ไม่บล็อก).
- index มือ: จาก "InvItem barcode + 5" → 15 ตัว (+ `PosSale` 5 · `PosSaleLine.refLineId` · order lines/events · `one_open_session_per_table`) + รายการ pending P5.3.
- เพิ่ม env (`POS_CREDENTIALS_KEY` · กุญแจอุปกรณ์ pending) · cron 8 งาน · ตารางธง/สวิตช์ + ทางถอย · ขั้นข้อมูล P1.9 (a) · m2 priceOverride.
- `scripts/verify-prod-pos.mts` แทน `scripts/prodmig.cjs` (มติ §10-3) · ข้อ O18 (`inv-cache-audit.mts` `ALLOW_PROD_AUDIT=1`) คงเป็นงานตรวจ prod ที่ค้าง (⛔ ทีละครั้ง).
- DRAFT §6 "ใครรัน deploy" → W32 (ค่าปริยาย = เจ้าของ).
