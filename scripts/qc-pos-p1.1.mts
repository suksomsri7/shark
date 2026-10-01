// QC — POS WO P1.1a + P1.1b: แคตตาล็อกเดียว (PosProduct) · ตาราง + backfill + catalog.ts + dual-write ผู้เขียนเดิม
// oracle writer (P0.3 lane 3) · builder ห้ามแก้ expectation — ข้อไหนผิด ให้เขียน ORACLE-EDIT ใน notes ของใบตัวเอง
// สัญญา: ledger/pos-briefs/pos-brief-P1.1a.md · ledger/POS-MIGRATION-PLAN.md §0–§2 · ledger/POS-API.md §1 (GET /products)
//        ledger/DESIGN-POS.md §4 M4 + §7 · docs/modules/14-pos.md §5.2 §9 · POS-MASTER-PLAN แถว P1.1a/P1.1b
// 🔴 มติผู้คุมงาน 1 ต.ค. (survey · ledger/REVIEW-POS-DESIGN-2026-10-01.md §2 §6) ชนะเอกสารข้างบนเมื่อขัดกัน:
//    R1 PosProduct = tenantId + systemId (ระบบ POS) · unitId nullable (null = ทุกสาขา) · invItemId nullable (unique เมื่อมีค่า)
//       · kind อยู่ที่ PosProduct (PRODUCT/SERVICE/MENU/BUNDLE) · ไม่เพิ่ม MENU ใน InvItemKind · ไม่สร้าง InvItem ให้เมนู
//       · สาขาที่ไม่มีระบบ POS = backfill ข้าม + รายงานในตัวนับ (ไม่เดา)
//    R2 ราคา backfill (ห้ามใช้ต้นทุน): posPrice → salePrice → InvItem.priceSatang (SERVICE) → MenuItem.basePrice/ShopProduct.priceSatang ของแถวตัวเอง → null
//    R3 คอลัมน์: posProductId บน MenuItem/ShopProduct/ShopOrderLine · productId บน PosSaleLine/RestaurantOrderItem
//    R4 index = CREATE INDEX ธรรมดา (ไม่ตรวจโหมดสร้าง) · R5 P1.1b ครอบผู้เขียนราคา/ตัวเลือก/หมวดทุกตัวที่ survey พบ
//    + brief P1.1a (เขียนใหม่ 1 ต.ค.): unique(systemId, invItemId) · ไม่มีตาราง PosVariant (PosProduct.parentId) · ctx {tenantId, systemId, actorUserId}
//      · ระบบ POS ของแถว = ทางขายจริงวันนี้ (InvItem: คลังที่ผูกสาขาของ POS · MenuItem: systemForUnit(POS) แบบ restaurant/order.ts:421
//        · ShopProduct: POS ตัวแรกของร้านแบบ shop/service.ts:217) · ไม่มี POS = ข้าม + นับ skippedNoPosSystem · backfill พิมพ์ JSON_SUMMARY
// ชื่อที่เอกสารไม่ได้กำหนด (ผู้คุมงานต้องรับรองก่อน builder เริ่ม) → ledger/wo-notes/pos-P0.3-catalog.md "Names I had to invent"
// requires: pos-seed
//
// รัน (QC4 เท่านั้นระหว่าง CRM RUN):
//   bash scripts/iso.sh bash scripts/qc4.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-pos-p1.1.mts
//   … qc-pos-p1.1.mts --list      → พิมพ์ทุก id + X-group + ชื่อ ไม่แตะ DB/env (ผู้คุมงานดูความครอบคลุมตอนยัง SKIPPED)
//   QC_FORCE=1 …                   → ข้าม SKIP guard (พิสูจน์ว่าข้อสอบแดง "ถูกเหตุ" ไม่ crash)
//
// 🔴 กติกา (house style):
//   1) SKIP guard 2 ชั้น — S1/X (P1.1a): model+ตาราง PosProduct + catalog.ts + pos-backfill-catalog.mts · S2 (P1.1b): ผู้เขียนเดิม
//      import pos/catalog แล้ว — ยังไม่ถึง = S2 ข้ามทั้งกลุ่ม (P1.1a เขียวได้ก่อน) · ไม่มี seed POS = SKIPPED ทั้งไฟล์ (ไม่ seed เอง)
//   2) chk(id, ok, expected, actual) · ชื่อ + X-group มาจากทะเบียน CHECKS ที่เดียว → --list ครบเสมอ · ส่วนที่ล้ม = ทุกข้อในส่วนแดงพร้อมเหตุ
//   3) แถวชั่วคราวติดป้าย `qc-p1.1-<rand>` เฉพาะในร้าน QC ของ POS · snapshot ก่อนแตะ → ลบ/คืนใน finally →
//      ตรวจว่าตารางเดิม (จำนวน + checksum) และตารางใหม่ กลับเท่าก่อนรัน (= rollback story ปลายทาง S1.36 + A5)
//   4) race บน connection แยกจริง (PrismaClient ต่อเลน) 10 ขนาน × 3 รอบ · backfill 2 โปรเซสพร้อมกัน × 3 รอบ
//   5) เงิน = สตางค์ Int · ไม่ผูกวันที่ · createSale เรียกใน tx ที่ rollback ทิ้ง (ไม่มีบิล/สต็อก/คิวค้าง ไม่ drain)
//   6) บรรทัดท้าย = JSON_SUMMARY {...} · SKIPPED = exit 0 · แดงข้อเดียว = exit 1
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";

// ═══════════════════ 0. ทะเบียนข้อสอบ (id · X-group · ชื่อ) — แหล่งเดียวของ --list ═══════════════════
type Def = { id: string; x: string; title: string };
const D = (id: string, x: string, title: string): Def => ({ id: `P1.1-${id}`, x, title });
const CHECKS: readonly Def[] = [
  // ── S1 · P1.1a โครงสร้าง ──
  D("S1.1", "-", "ตารางใหม่มีจริง: PosProduct (+parentId ว่างไว้ให้ P1.2) · PosCategory · PosProductOptionGroup · RecipeLine · ไม่มีตาราง PosVariant"),
  D("S1.2", "-", "คอลัมน์เชื่อมใหม่ nullable ครบ (R3): MenuItem/ShopProduct/ShopOrderLine.posProductId · PosSaleLine/RestaurantOrderItem.productId"),
  D("S1.3", "-", "PosProduct มีคอลัมน์สัญญา (tenantId · systemId · unitId? · invItemId? · name · nameEn · kind · categoryId · basePriceSatang? · vatRateBp · stationId · dailyStockQty · images · archivedAt) · unique(systemId, invItemId) · kind ∋ PRODUCT/SERVICE/MENU/BUNDLE · index บนคอลัมน์เชื่อมทุกตัว (ไม่ตรวจโหมดสร้าง)"),
  D("S1.4", "-", "migration <ts>_pos_v2_a additive ล้วน: ไม่มี DROP/RENAME/SET NOT NULL/ADD COLUMN NOT NULL ไร้ DEFAULT บนตารางเดิม · ALTER TYPE ADD VALUE ไม่ปนไฟล์ DDL อื่น · ไม่แตะ enum InvItemKind"),
  D("S1.5", "-", "src/lib/core/scope.ts ลงทะเบียนตารางใหม่ทุกตัว (F1 fail-closed)"),
  // ── S1 · backfill ──
  D("S1.6", "-", "backfill --dry-run: exit 0 + JSON_SUMMARY นับต่อแหล่ง (invItem · menuItem · shopProduct) ตรง DB + skippedNoPosSystem ตรงกับแหล่งที่หา POS ไม่เจอตามทางขายจริง"),
  D("S1.7", "-", "backfill --dry-run ไม่เขียนอะไรเลย (ตารางใหม่ · คอลัมน์เชื่อม · ตารางเดิม เท่าเดิมทุก byte)"),
  D("S1.8", "-", "backfill จริง: exit 0 · created.posProduct = ที่ dry-run ทำนาย = แถวที่เพิ่มจริง · ไม่สร้าง InvItem เลย (R1)"),
  D("S1.9", "-", "InvItem ที่ขายได้ใน POS (คลังผูกสาขาที่มี POS) → PosProduct เดียว systemId = POS ของสาขานั้น · ไม่มีกำพร้า/ชี้ข้ามร้าน · systemId เป็นระบบ POS ของร้านเดียวกัน"),
  D("S1.10", "-", "ทุก MenuItem (สาขามี POS) → PosProduct ของตัวเอง 1 แถว: kind MENU · unitId = สาขาเมนู · invItemId = MenuItem.invItemId (null ถ้าไม่เคยผูก) · สาขาไม่มี POS = ไม่ผูก"),
  D("S1.11", "-", "ทุก ShopProduct → POS ตัวแรกของร้าน (ทางเดียวกับ shop checkout): มี invItemId → ชี้ PosProduct ของ InvItem นั้น · ไม่มี → PosProduct ของตัวเอง (PRODUCT · unitId สาขา · invItemId null) — แม้สาขาไม่ผูก POS"),
  D("S1.12", "-", "สองแหล่งชี้ InvItem เดียวกัน = PosProduct เดียว: เว็บร้าน→น้ำดื่ม ชี้ตัวของน้ำดื่ม · เมนู→โค้ก ถือ invItemId โค้ก (ไม่มีแถว PRODUCT ซ้ำของโค้ก)"),
  D("S1.13", "X4", "ราคาขั้น 2 (salePrice) ตรงสตางค์ทุกสินค้าใน seed รวมราคา 0 บาท (น้ำฟรี · น้ำแข็ง)"),
  D("S1.14", "X4", "ลำดับราคาทีละขั้นด้วย fixture ของตัวเอง: posPrice 4500 ชนะ salePrice 5000 · posPrice 0 ไม่นับ (→ salePrice) · SERVICE 15000 · SERVICE ราคา 0 ไม่มีบัญชี = null · เมนู 9900 · เว็บล้วน 12345 · มีแต่ต้นทุน = null · ทุกแถวตรงสูตร"),
  D("S1.15", "X8", "VAT ต่อสินค้า: vatRateBp = AccountProduct.vatRateBp (ไข่ 0 · อื่น 700) · ไม่มีบัญชี = null"),
  D("S1.16", "-", "หมวด: เมนู → PosCategory ชื่อ/ชื่ออังกฤษเดียวกับ MenuCategory · 1 PosCategory ต่อ MenuCategory (สาขามี POS · ไม่ซ้ำ)"),
  D("S1.17", "-", "ฟิลด์เมนูย้ายครบ: stationId · dailyStockQty · images (ลำดับเดิม)"),
  D("S1.18", "-", "ตัวเลือก: PosProductOptionGroup (groupId · sortOrder) = MenuItemOptionGroup ของเมนูทุกตัว · MenuOptionGroup ใช้ต่อ ไม่สร้างใหม่"),
  D("S1.19", "-", "บาร์โค้ดคงเดิม: byBarcode หา PosProduct เจอทุกบาร์โค้ดใน seed (น้ำดื่ม · โค้ก)"),
  D("S1.20", "-", "InvItem ที่เก็บถาวร → PosProduct archivedAt ไม่ว่าง และไม่โผล่ใน listForUnit"),
  D("X1.1", "X1", "backfill รอบสอง: created ทุกตัว = 0 · updated ทุกตัว = 0 · ตารางใหม่ checksum เท่าเดิม"),
  D("X6.1", "X6", "backfill 2 โปรเซสพร้อมกัน (connection แยก) × 3 รอบ บนแหล่งใหม่ทุกรอบ → ต่อแหล่ง 1 แถว ไม่ซ้ำ · ทั้งคู่ exit 0"),
  D("S1.21", "-", "จอเดิม: เมนูร้านอาหาร (menu.listItems · orderingMenu · storefront.publicMenu) เหมือนก่อน backfill"),
  D("S1.22", "-", "จอเดิม: หน้าร้านเว็บ (shop.listProducts activeOnly) เหมือนก่อน backfill"),
  D("S1.23", "-", "จอเดิม: register.posCatalog เหมือนก่อน backfill ทุกรายการ (ราคา/ชื่อ/บาร์โค้ด · ไม่มีรายการเพิ่ม)"),
  D("S1.24", "X4", "createSale ด้วย id เดิม (itemId=InvItem) ยังขายได้ และ subtotal/discount/vat/grand + บรรทัด เท่าก่อน backfill เป๊ะ"),
  D("S1.25", "-", "rollback ระหว่างทาง: แถวเดิมของตารางเก่า checksum เท่าก่อน backfill (ยกเว้น updatedAt/คอลัมน์เชื่อมใหม่) · ไม่มีแถวเพิ่ม/หายในตารางเก่า"),
  // ── S1 · catalog.ts API ──
  D("S1.26", "-", "catalog.ts export ครบ 7 ฟังก์ชัน (createProduct · updateProduct · setPrice · archive · listForUnit · byBarcode · ensureForInvItem) และ facade pos/index.ts ส่งต่อครบ"),
  D("S1.27", "X4", "createProduct ถูกต้อง → PosProduct systemId = POS ใน ctx · ราคา/VAT ตรงสตางค์ · invItemId null หรือ InvItem ในคลังที่ผูก POS ของร้านเดียวกัน"),
  D("S1.28", "X4", "createProduct ปฏิเสธ: ชื่อว่าง · ราคาติดลบ · ราคาเศษสตางค์ · บาร์โค้ดซ้ำในระบบ POS — และไม่เขียนอะไรเลย"),
  D("S1.29", "-", "updateProduct: ชื่อ/ชื่ออังกฤษ/หมวด เปลี่ยนจริง · listForUnit เห็นค่าใหม่ · จำนวนแถวไม่เพิ่ม"),
  D("S1.30", "X4", "setPrice: ตั้งได้ตรงสตางค์ (รวม 0) · ปฏิเสธติดลบ/เศษสตางค์/NaN/สตริง โดยราคาเดิมไม่เปลี่ยน"),
  D("S1.31", "-", "archive: หายจาก listForUnit · กดซ้ำไม่ error · แถวยังอยู่ (soft)"),
  D("S1.32", "-", "listForUnit คืนทรง POS-API §1: {id, invItemId, name, nameEn, kind, categoryId, basePriceSatang, images[], optionGroups[], variants[], recipe[], channelPrices[], availability{unitId→bool}, stock{unitId→qty}} · เงินเป็น Int"),
  D("S1.33", "-", "listForUnit: active ของระบบครบ (unitId null + unitId สาขานี้ · ไม่มีของสาขาอื่น) · stock[unit] = InvItem.onHand · availability[unit] = true · ตัวเลือกเมนูมี choices.priceDelta Int"),
  D("S1.34", "-", "byBarcode: ตรงตัวในระบบ · บาร์โค้ดไม่มี = null"),
  D("S1.35", "X1", "ensureForInvItem: เรียกซ้ำได้ id เดิม (created=false) · InvItem ใหม่ได้ราคาตามลำดับ R2"),
  D("S1.37", "-", "listForUnit ค้นฝั่ง server ด้วยชื่อไทย/SKU/บาร์โค้ด + แบ่งหน้า · ไม่มีเพดาน 200 (สินค้า >200 ตัวเดินครบทุกหน้า ไม่ซ้ำ)"),
  D("S1.38", "-", "ทุกการเขียน (createProduct · setPrice · archive) มีแถว AuditLog targetType PosProduct · targetId · actorId = ผู้กด"),
  // ── X · P1.1a ──
  D("X2.1", "X2", "ข้ามร้าน: updateProduct/setPrice/archive ด้วย productId ของอีกร้าน · ctx ที่ systemId เป็น POS ของอีกร้าน → ปฏิเสธ และแถวไม่เปลี่ยน"),
  D("X2.2", "X2", "ข้ามร้าน: ensureForInvItem(InvItem ร้านอื่น) ปฏิเสธ · byBarcode บาร์โค้ดร้านอื่น = null · listForUnit(สาขาร้านอื่น) ปฏิเสธ/ว่าง · ไม่มี id ร้านอื่นรั่ว"),
  D("X2.3", "X2", "ข้ามสาขา: แคชเชียร์ (unitAccess=สีลม) listForUnit/byBarcode สาขาอารีย์ → ปฏิเสธ · สีลมได้"),
  D("X3.1", "X3", "setPrice โดย STAFF ที่ไม่มี pos.product.setPrice → ปฏิเสธ ราคาไม่เปลี่ยน"),
  D("X3.2", "X3", "setPrice โดย STAFF ที่ Membership.permissions มี pos.product.setPrice=true → ได้ · OWNER ได้"),
  D("X3.3", "X3", "createProduct/updateProduct/archive โดย STAFF ที่ไม่มี pos.product.manage → ปฏิเสธ ไม่เขียน"),
  D("X6.2", "X6", "ensureForInvItem 10 เลนพร้อมกัน (connection แยก) × 3 รอบ → PosProduct 1 แถวต่อ InvItem · ทุกเลนได้ id เดียวกัน"),
  D("X6.3", "X6", "setPrice 10 เลนพร้อมกัน → ไม่ error · ราคาสุดท้ายเป็นหนึ่งในค่าที่ส่ง · แถวเดียว"),
  D("X6.4", "X6", "setPrice 5 เลน + updateProduct(nameEn) 5 เลนพร้อมกัน → ไม่มี lost update (ราคาและ nameEn เปลี่ยนทั้งคู่)"),
  D("X8.1", "X8", "ไม่เชื่อมบัญชี: setPrice สินค้าที่ไม่มี AccountProduct ได้ · ไม่สร้าง AccountProduct · InvItem.accountProductId ยัง null"),
  D("X9.1", "X9", "event outbox ตระกูล pos.* ที่เกิดระหว่างรัน (ถ้ามี) มี consumer ลงทะเบียนครบ"),
  // ── S2 · P1.1b dual-write (guard แยก) ──
  D("S2.1", "-", "menu.createItem → PosProduct ใหม่ 1 แถว (MENU · unitId · ราคา · หมวด · ตัวเลือก) + MenuItem.posProductId"),
  D("S2.2", "-", "menu.updateItem ราคา/ชื่อ → PosProduct ตาม · ไม่เพิ่มแถว"),
  D("S2.3", "-", "menu.setItemOptionGroups (สลับลำดับ) → PosProductOptionGroup ตาม"),
  D("S2.4", "-", "menu.duplicateItem → เมนูสำเนาได้ PosProduct ของตัวเอง (ไม่แชร์กับต้นฉบับ)"),
  D("S2.5", "-", "menu.archiveItem → PosProduct ของเมนูนั้นถูกเก็บถาวร · ต้นฉบับไม่กระทบ"),
  D("S2.6", "-", "menu.setItemStock dailyStockQty → PosProduct.dailyStockQty ตาม"),
  D("S2.7", "-", "shop.createProduct (ไม่ผูกคลัง) → PosProduct ใหม่ 1 แถว ราคา = priceSatang + ShopProduct.posProductId"),
  D("S2.8", "-", "shop.createProduct ผูก InvItem ที่มี PosProduct แล้ว → ชี้ตัวเดิม ไม่สร้างแถวใหม่"),
  D("S2.9", "-", "shop.updateProduct ราคา: เว็บล้วน → PosProduct ตาม · แชร์กับ InvItem ที่มีราคาบัญชี → ราคา POS ไม่ถูกเขียนทับ"),
  D("S2.10", "-", "register.setItemSalePrice (หน้า สินค้า/ราคา เดิม) → PosProduct.basePriceSatang ตาม"),
  D("S2.11", "-", "account.updateAccountProductSalePrice + account/product.updateProduct (salePrice · vatRateBp) → PosProduct ตาม"),
  D("S2.12", "-", "inventory.createItem → PosProduct ทันที (PRODUCT ราคา null · SERVICE ราคา = priceSatang)"),
  D("S2.13", "-", "ย้อนทาง: catalog.setPrice สินค้าผูกบัญชี → AccountProduct ตาม → register.posCatalog เห็นราคาใหม่"),
  D("S2.14", "-", "ย้อนทาง: catalog.setPrice เมนู → MenuItem.basePrice ตาม → orderingMenu เห็นราคาใหม่"),
  D("S2.15", "-", "ย้อนทาง: catalog.setPrice/updateProduct สินค้าเว็บล้วน → ShopProduct.priceSatang/name ตาม → หน้าร้านเว็บเห็น"),
  D("S2.16", "-", "ย้อนทาง: catalog.archive เมนู → MenuItem ARCHIVED + หายจาก orderingMenu"),
  D("S2.17", "-", "ไม่เขียนซ้อน: แก้ผ่านผู้เขียนเดิมด้วยค่าเดิมซ้ำ → จำนวน PosProduct/AccountProduct/InvItem ไม่เพิ่ม"),
  D("S2.18", "-", "เมนูที่ชี้ InvItem มีราคาบัญชี (เมนู→โค้ก) แก้ basePrice → ราคา POS ไม่ถูกเขียนทับ (ลำดับ R2)"),
  D("S2.19", "X12", "F15.1: CATALOG_WRITER_BASELINE ว่าง และตัวสแกนพบผู้เขียนแคตตาล็อกที่ catalog.ts ที่เดียว"),
  D("S2.20", "-", "inventory.updateItem ราคา SERVICE (InvItem.priceSatang) → PosProduct ตาม"),
  D("S2.21", "-", "account/inventory-link.linkProductToItem (สร้าง InvItem จากสินค้าบัญชี) → PosProduct ของ InvItem ใหม่ ราคาตาม R2"),
  D("S2.22", "-", "AI proposal inventory_create_item (ai/proposals.runKind) → PosProduct ของ InvItem ใหม่"),
  D("S2.23", "-", "booking.importServicesToCatalog (BookingService เก่า → InvItem SERVICE) → PosProduct SERVICE ราคา = BookingService.priceSatang"),
  D("S2.24", "-", "ย้อนทาง: catalog.setPrice บริการ → InvItem.priceSatang ตาม → booking.serviceRoster + BookingService.priceSatang เห็นราคาใหม่"),
  D("S2.25", "-", "account/product.updateProduct posPrice → PosProduct = posPrice (ขั้น 1 ของ R2)"),
  D("S2.26", "-", "menu.createCategory → PosCategory ชื่อเดียวกัน 1 แถว · archiveCategory → PosCategory เก็บถาวร"),
  D("S2.27", "-", "menu.createOptionGroup + archiveOptionGroup → listForUnit ของเมนูที่ผูก เห็นตัวเลือก priceDelta ตรง แล้วหายเมื่อเก็บถาวร"),
  D("X6.5", "X6", "แข่งกัน: menu.updateItem ราคา ↔ catalog.setPrice เมนูเดียวกัน 10 เลน × 3 รอบ → MenuItem.basePrice = PosProduct.basePriceSatang ทุกรอบ"),
  // ── ท้ายรัน ──
  D("S1.36", "X5", "rollback ปลายทาง: ลบแถวตารางใหม่ที่รันนี้สร้าง + คืนคอลัมน์เชื่อม + ลบ fixtures → ตารางเดิม (จำนวน + checksum) และตารางใหม่ เท่าก่อนรัน · ร้าน QC กลับสภาพเดิม"),
];
const S2_IDS = new Set(CHECKS.filter((c) => c.id.startsWith("P1.1-S2.") || c.id === "P1.1-X6.5").map((c) => c.id));

if (process.argv.includes("--list")) {
  for (const c of CHECKS) console.log(`${c.id}\t[${c.x}]\t${c.title}`);
  console.log(`รวม ${CHECKS.length} ข้อ · P1.1a ${CHECKS.length - S2_IDS.size} · P1.1b ${S2_IDS.size}`);
  process.exit(0);
}

// ═══════════════════ 1. env + checker ═══════════════════
const envMod = (await import("./pos-qc-env.mts" as string)) as Any;
const env = envMod.loadPosQcEnv("qc-pos-p1.1") as { isQc4: boolean };
if (!env.isQc4 && process.env.POS_QC_ALLOW_NON_QC4 !== "1") {
  console.error("🔴 qc-pos-p1.1: ฐานนี้ไม่ใช่ QC4 — ระหว่าง CRM RUN ให้รันผ่าน scripts/qc4.sh");
  process.exit(4);
}
const PQC = envMod.PQC as Any;
const QC_TIDS: string[] = [PQC.coffee.tenantId, PQC.resto.tenantId];
const Q = envMod.makeChecker("qc-pos-p1.1") as {
  chk: (id: string, title: string, ok: boolean, e: unknown, a: unknown) => boolean;
  skip: (r: string) => void;
  finish: (extra?: Record<string, unknown>) => number;
};
const DEF = new Map(CHECKS.map((c) => [c.id, c]));
const reported = new Set<string>();
function chk(short: string, ok: unknown, expected: unknown, actual: unknown): boolean {
  const id = `P1.1-${short}`;
  const d = DEF.get(id);
  if (!d) throw new Error(`oracle bug: ไม่มี id ${id} ในทะเบียน`);
  if (reported.has(id)) return true;
  reported.add(id);
  return Q.chk(id, `${d.title} {${d.x}}`, !!ok, expected, actual);
}
/** ข้อความ error บรรทัดที่มีความหมาย (Prisma ขึ้นต้นด้วย "Invalid `prisma…` invocation:" — เหตุจริงอยู่บรรทัดท้าย) */
const firstLine = (e: unknown): string => {
  if (!(e instanceof Error)) return String(e);
  const ls = e.message.split("\n").map((l) => l.trim()).filter(Boolean);
  return (/^Invalid `/.test(ls[0] ?? "") ? ls[ls.length - 1] : ls[0]) ?? e.name;
};
/** ส่วนที่ล้มกลางทาง → ทุกข้อที่ยังไม่รายงานในส่วนนั้นแดงพร้อมเหตุ (ไม่ crash · ไม่หายเงียบ) */
async function section(name: string, ids: string[], fn: () => Promise<void>) {
  try {
    await fn();
  } catch (e) {
    const msg = firstLine(e).slice(0, 300);
    console.log(`  ⚠️  ส่วน ${name} ล้ม: ${msg}`);
    for (const s of ids) if (!reported.has(`P1.1-${s}`)) chk(s, false, "ส่วนนี้ทำงานจบ", `ล้มก่อนถึงข้อนี้: ${msg}`);
  }
}

const FORCE = process.env.QC_FORCE === "1";
const RAND = randomBytes(3).toString("hex");
const TAG = `qc-p1.1-${RAND}`;
const t0 = new Date();
console.log(`[qc-pos-p1.1] tag ${TAG}${FORCE ? " · QC_FORCE=1 (ข้าม guard)" : ""}`);

const { prisma } = await import("@/lib/core/db");
const P = prisma as Any;
const q = async <T = Any,>(sql: string, ...params: unknown[]): Promise<T[]> => (await P.$queryRawUnsafe(sql, ...params)) as T[];
const ex = async (sql: string, ...params: unknown[]): Promise<number> => Number(await P.$executeRawUnsafe(sql, ...params));
const tableSet = async () => new Set((await q<{ table_name: string }>(`select table_name from information_schema.tables where table_schema='public'`)).map((r) => r.table_name));
type ColInfo = { data_type: string; is_nullable: string; column_default: string | null };
const colInfo = async (t: string): Promise<Map<string, ColInfo>> =>
  new Map((await q<{ column_name: string } & ColInfo>(`select column_name, data_type, is_nullable, column_default from information_schema.columns where table_schema='public' and table_name=$1`, t)).map((r) => [r.column_name, r]));
const read = (p: string) => (existsSync(p) ? readFileSync(p, "utf8") : "");

// ═══════════════════ 2. snapshot / checksum (ตารางเดิม + ตารางใหม่) ═══════════════════
/** ตารางเดิมที่ backfill/catalog/fixture อาจแตะ — คอลัมน์ที่ไม่นับ: updatedAt (เด้งตอนเขียนคอลัมน์เชื่อม) + คอลัมน์เชื่อมใหม่ (R3) */
const LEGACY: Record<string, string[]> = {
  BusinessUnit: ["updatedAt"], AppSystemUnit: [],
  InvItem: ["updatedAt"], InvItemImage: [], InvLocationStock: ["updatedAt"], InvMovement: [], AccountProduct: ["updatedAt"],
  MenuCategory: ["updatedAt"], MenuItem: ["updatedAt", "posProductId"], MenuOptionGroup: ["updatedAt"], MenuOptionChoice: ["updatedAt"],
  MenuItemOptionGroup: [], KdsStation: ["updatedAt"], ShopProduct: ["updatedAt", "posProductId"], ShopOrder: [], ShopOrderLine: ["posProductId"],
  RestaurantOrderItem: ["updatedAt", "productId"], PosSale: ["updatedAt"], PosSaleLine: ["productId"], PosPayment: [], PosReceiptCounter: [],
  BookingService: ["updatedAt"], Membership: ["updatedAt"],
};
const NEW_TABLES = ["PosProduct", "PosCategory", "PosProductOptionGroup", "RecipeLine", "PosVariant", "PosProductChannelPrice"];
const norm = (v: unknown): unknown => {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "bigint") return v.toString();
  if (Array.isArray(v)) return v.map(norm);
  if (typeof v === "object") {
    const o = v as Any;
    if (typeof o.toJSON === "function" && o.constructor !== Object) return norm(o.toJSON());
    return Object.fromEntries(Object.keys(o).sort().map((k) => [k, norm(o[k])]));
  }
  return v;
};
const hashOf = (o: unknown) => createHash("md5").update(JSON.stringify(norm(o))).digest("hex");
type Snap = Record<string, Map<string, string>>;
let TABLES = new Set<string>();
async function rowsOf(table: string, tids: string[]): Promise<Any[]> {
  if (!TABLES.has(table)) return [];
  const cols = await colInfo(table);
  if (cols.has("tenantId")) return q(`select * from "${table}" where "tenantId" = any($1::text[])`, tids);
  if (cols.has("productId") && TABLES.has("PosProduct"))
    return q(`select * from "${table}" where "productId" in (select id from "PosProduct" where "tenantId" = any($1::text[]))`, tids);
  return [];
}
async function snap(tables: Record<string, string[]>, tids = QC_TIDS): Promise<Snap> {
  const out: Snap = {};
  for (const [t, drop] of Object.entries(tables)) {
    const m = new Map<string, string>();
    for (const r of await rowsOf(t, tids)) {
      const c = { ...r };
      for (const k of drop) delete c[k];
      m.set(String(r.id), hashOf(c));
    }
    out[t] = m;
  }
  return out;
}
const snapNew = () => snap(Object.fromEntries(NEW_TABLES.map((t) => [t, []])));
const snapLegacy = () => snap(LEGACY);
/** ตารางเดิมแบบรวมคอลัมน์เชื่อม (ไม่นับ updatedAt) — ใช้ยืนยันว่า dry-run ไม่เขียน และใช้คืนสภาพท้ายรัน */
const snapLegacyLinks = () => snap(Object.fromEntries(Object.keys(LEGACY).map((t) => [t, ["updatedAt"]])));
function diffSnap(a: Snap, b: Snap) {
  const out: Record<string, { added: string[]; removed: string[]; changed: string[] }> = {};
  for (const t of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const x = a[t] ?? new Map(); const y = b[t] ?? new Map();
    const added = [...y.keys()].filter((k) => !x.has(k));
    const removed = [...x.keys()].filter((k) => !y.has(k));
    const changed = [...x.keys()].filter((k) => y.has(k) && y.get(k) !== x.get(k));
    if (added.length || removed.length || changed.length) out[t] = { added, removed, changed };
  }
  return out;
}
const diffText = (d: ReturnType<typeof diffSnap>) =>
  Object.entries(d).map(([t, v]) => `${t}+${v.added.length}/-${v.removed.length}/~${v.changed.length}`).join(" ") || "ไม่ต่าง";
async function rowCounts(): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const t of [...Object.keys(LEGACY), ...NEW_TABLES, "AppSystem", "OutboxEvent"]) {
    if (!TABLES.has(t)) continue;
    out[t] = (await rowsOf(t, QC_TIDS)).length;
  }
  return out;
}

// ═══════════════════ 3. ตัวช่วยเรียกโมดูล / ผลปฏิเสธ / เลน / backfill ═══════════════════
const loadErr: Record<string, string> = {};
async function load(spec: string): Promise<Any> {
  try {
    return await import(spec as string);
  } catch (e) {
    loadErr[spec] = firstLine(e);
    return null;
  }
}
type Try = { ok: boolean; value?: Any; err?: string };
/** ผลปฏิเสธ = โยน error หรือคืน {ok:false} — ยอมรับทั้งสองทรง (ดู notes "Names I had to invent") */
async function attempt(fn: () => Promise<Any>): Promise<Try> {
  try {
    const v = await fn();
    if (v && typeof v === "object" && (v as Any).ok === false) return { ok: false, value: v, err: String((v as Any).reason ?? (v as Any).code ?? "ok:false") };
    return { ok: true, value: v };
  } catch (e) {
    return { ok: false, err: firstLine(e).slice(0, 200) };
  }
}
const idOf = (v: Any): string | undefined => (typeof v === "string" ? v : v?.id ?? v?.productId ?? v?.product?.id ?? undefined);
const listOf = (v: Any): Any[] => (Array.isArray(v) ? v : Array.isArray(v?.items) ? v.items : Array.isArray(v?.products) ? v.products : []);
const isInt = (n: unknown) => typeof n === "number" && Number.isInteger(n);
const clients: Any[] = [];
let laneFactory: ((i: number) => Any) | null = null;
const lane = (i: number): Any => (laneFactory ? laneFactory(i) : prisma);

/** รันสคริปต์ backfill เป็นโปรเซสแยก (= connection แยก) · จำกัดร้านด้วย --tenant=<id> (ซ้ำได้) · คืน exit + BACKFILL_SUMMARY */
function runBackfill(args: string[]): Promise<{ code: number; out: string; summary: Any | null }> {
  return new Promise((resolve) => {
    const p = spawn("pnpm", ["exec", "tsx", "scripts/pos-backfill-catalog.mts", ...QC_TIDS.map((t) => `--tenant=${t}`), ...args], { env: process.env });
    let out = "";
    const timer = setTimeout(() => p.kill("SIGTERM"), 600_000);
    p.stdout.on("data", (d) => (out += String(d)));
    p.stderr.on("data", (d) => (out += String(d)));
    p.on("close", (code) => {
      clearTimeout(timer);
      // สรุปของ backfill = บรรทัด JSON_SUMMARY สุดท้าย (brief P1.1a ข้อ 4) · รับ BACKFILL_SUMMARY ด้วยถ้ามี
      const line = out.split("\n").reverse().find((l) => l.startsWith("BACKFILL_SUMMARY ") || l.startsWith("JSON_SUMMARY "));
      let summary: Any = null;
      try { summary = line ? JSON.parse(line.slice(line.indexOf(" ") + 1)) : null; } catch { summary = null; }
      resolve({ code: code ?? -1, out, summary });
    });
  });
}
const createdOf = (s: Any) => (s?.created ?? {}) as Record<string, number>;
const updatedOf = (s: Any) => (s?.updated ?? {}) as Record<string, number>;
const allZero = (o: Record<string, number>) => Object.keys(o).length > 0 && Object.values(o).every((n) => n === 0);
const tail = (out: string) => out.trim().split("\n").slice(-2).join(" | ").slice(0, 200);

/** ล้างค่าที่เปลี่ยนตามเวลาของจอเดิม (ครัวเปิด/ปิด) + ฟิลด์เชื่อมใหม่ + updatedAt */
const stripScreen = (v: unknown): unknown => {
  if (Array.isArray(v)) return v.map(stripScreen);
  if (v && typeof v === "object" && !(v instanceof Date)) {
    const o: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v as Any)) {
      if (["updatedAt", "posProductId", "kitchen", "kitchenOpen", "isOpen", "open", "now"].includes(k)) continue;
      o[k] = stripScreen(x);
    }
    return o;
  }
  return v;
};

// ═══════════════════ 4. ด่าน SKIP ═══════════════════
TABLES = await tableSet();
const schemaSrc = existsSync("prisma/schema") ? readdirSync("prisma/schema").filter((f) => f.endsWith(".prisma")).map((f) => read(`prisma/schema/${f}`)).join("\n") : "";
const need1a: [string, boolean][] = [
  ["model PosProduct ใน prisma/schema", /\bmodel\s+PosProduct\s*\{/.test(schemaSrc)],
  ["ตาราง PosProduct ใน DB (migration ลงแล้ว)", TABLES.has("PosProduct")],
  ["src/lib/modules/pos/catalog.ts", existsSync("src/lib/modules/pos/catalog.ts")],
  ["scripts/pos-backfill-catalog.mts", existsSync("scripts/pos-backfill-catalog.mts")],
];
const missing1a = need1a.filter(([, ok]) => !ok).map(([n]) => n);
/** ผู้เขียนเดิมที่ P1.1b ต้องต่อเข้า catalog.ts (survey §2.3 + R5) — ตัวใดตัวหนึ่ง import pos/catalog แล้ว = P1.1b เริ่ม */
const LEGACY_WRITERS = [
  "src/lib/modules/restaurant/menu.ts", "src/lib/modules/shop/service.ts", "src/lib/modules/account/service.ts", "src/lib/modules/account/product.ts",
  "src/lib/modules/account/inventory-link.ts", "src/lib/modules/inventory/service.ts", "src/lib/modules/booking/service.ts", "src/lib/ai/proposals.ts",
];
const p11bStarted = LEGACY_WRITERS.some((f) => /from\s+["'][^"']*pos\/catalog["']|import\(\s*["'][^"']*pos\/catalog["']/.test(read(f)));
const scopeCoffee = await envMod.resolvePosScope(prisma, "coffee");
const scopeResto = await envMod.resolvePosScope(prisma, "resto");
const seeded = !!scopeCoffee && !!scopeResto;
const countsBefore = seeded ? await rowCounts() : {};
if (seeded) console.log(`ROWCOUNTS_BEFORE ${JSON.stringify(countsBefore)}`);

if (!FORCE && (missing1a.length > 0 || !seeded)) {
  const why = [
    missing1a.length ? `P1.1a ยังไม่สร้าง (ขาด: ${missing1a.join(" · ")})` : "",
    !seeded ? "ยังไม่มี seed POS (scripts/seed-pos-qc.mts — ร้าน pos-qc-coffee/pos-qc-resto ไม่อยู่ใน DB นี้)" : "",
  ].filter(Boolean).join(" · ");
  Q.skip(why);
  if (seeded) {
    const after = await rowCounts();
    console.log(`ROWCOUNTS_AFTER ${JSON.stringify(after)} · ${hashOf(after) === hashOf(countsBefore) ? "เท่าเดิม" : "⚠️ ต่าง (มีคนอื่นเขียนระหว่างรัน?)"}`);
  }
  await P.$disconnect();
  process.exit(Q.finish({ catalogue: CHECKS.length, p11bStarted, seeded, missing: missing1a }));
}
if (!seeded) {
  console.error("❌ QC_FORCE=1 แต่ไม่มี seed POS — รัน seed-pos-qc.mts ก่อน (ข้อสอบนี้ไม่ seed เอง)");
  await P.$disconnect();
  process.exit(1);
}

// ═══════════════════ 5. บริบท ร้าน/สาขา/ผู้ใช้ ═══════════════════
const E = JSON.parse(read(PQC.expectedPath)) as Any;
const CF = E.coffee; const RS = E.resto;
const cfT = CF.tenantId as string; const rsT = RS.tenantId as string;
const SILOM = CF.units.silom as string; const ARI = CF.units.ari as string; const RMAIN = RS.units.main as string;
const sysC = CF.systems; const sysR = RS.systems;
const actorOf = async (u: Any) => {
  const m = await P.membership.findFirst({ where: { id: u.membershipId } });
  return { userId: u.userId, role: (m?.role ?? u.role) as string, unitAccess: (m?.unitAccess ?? ["*"]) as string[], permissions: (m?.permissions ?? {}) as Record<string, unknown> };
};
const cfOwner = await actorOf(CF.users.owner);
const cfCashier = await actorOf(CF.users.cashier);
const rsOwner = await actorOf(RS.users.owner);
/** CatalogCtx (brief P1.1a ข้อ 3): { tenantId, systemId = ระบบ POS, actorUserId | null } · null = ผู้เรียกระดับระบบ (backfill/ผู้เขียนเดิม) */
const ctxOwner = { tenantId: cfT, systemId: sysC.POS, actorUserId: cfOwner.userId as string };
const ctxCashier = { tenantId: cfT, systemId: sysC.POS, actorUserId: cfCashier.userId as string };
const ctxRsOwner = { tenantId: rsT, systemId: sysR.POS, actorUserId: rsOwner.userId as string };
const ctxSysCf = { tenantId: cfT, systemId: sysC.POS, actorUserId: null };
/** ให้สิทธิ์ชั่วคราวกับ Membership ของแคชเชียร์ แล้วคืนค่าเดิมทุกตัวอักษร (finally) */
const cashierMb = CF.users.cashier.membershipId as string;
const cashierPerm0 = (await P.membership.findFirst({ where: { id: cashierMb } }))?.permissions ?? {};
async function withCashierPerm<T>(extra: Record<string, unknown>, fn: () => Promise<T>): Promise<T> {
  await P.membership.update({ where: { id: cashierMb }, data: { permissions: { ...(cashierPerm0 as object), ...extra } } });
  try { return await fn(); } finally { await P.membership.update({ where: { id: cashierMb }, data: { permissions: cashierPerm0 } }); }
}
const itemBySku = (t: Any, sku: string) => (t.items as Any[]).find((i) => i.sku === sku);

// snapshot0 = ภาพก่อนแตะอะไรเลย (คืนสภาพท้ายรันเทียบกับตัวนี้)
const snapLegacy0 = await snapLegacyLinks();
const snapNew0 = await snapNew();
let catalog: Any = null;

// fixtures แบบ "ข้อมูลเก่า" (เขียนตรงเหมือนข้อมูลก่อน P1.1 — ไม่ผ่าน catalog)
const mkInv = async (tid: string, sys: string, sfx: string, extra: Record<string, unknown> = {}) =>
  (await P.invItem.create({ data: { tenantId: tid, systemId: sys, sku: `${TAG}-${sfx}`, name: `${TAG} ${sfx}`, ...extra } })) as Any;
const mkAp = async (tid: string, accSys: string, inv: Any, salePrice: number | null, vatRateBp = 700, posPrice: number | null = null) => {
  const ap = await P.accountProduct.create({ data: { tenantId: tid, systemId: accSys, name: inv.name, salePrice, posPrice, vatRateBp, invItemId: inv.id } });
  await P.invItem.update({ where: { id: inv.id }, data: { accountProductId: ap.id } });
  return ap as Any;
};
const rsCat = await P.menuCategory.findFirst({ where: { tenantId: rsT, unitId: RMAIN, name: "อาหารจานเดียว" } });
const rsStation = await P.kdsStation.findFirst({ where: { tenantId: rsT, unitId: RMAIN, name: "ครัว" } });
const mkMenu = async (sfx: string, extra: Record<string, unknown> = {}, unitId = RMAIN, tid = rsT, cat = rsCat?.id, st = rsStation?.id) =>
  (await P.menuItem.create({ data: { tenantId: tid, unitId, categoryId: cat, stationId: st, name: `${TAG} ${sfx}`, basePrice: 9900, ...extra } })) as Any;
const mkShop = async (sfx: string, priceSatang: number, invItemId: string | null = null, unitId = SILOM) =>
  (await P.shopProduct.create({ data: { tenantId: cfT, unitId, name: `${TAG} ${sfx}`, priceSatang, invItemId, imageUrl: "https://example.invalid/qc.jpg" } })) as Any;
const prodByInv = async (invItemId: string): Promise<Any[]> => q(`select * from "PosProduct" where "invItemId" = $1`, invItemId);
const prodById = async (id: string | null | undefined): Promise<Any | null> => (id ? (await q(`select * from "PosProduct" where id = $1`, id))[0] ?? null : null);
const linkOf = async (table: "MenuItem" | "ShopProduct", id: string): Promise<string | null> => (await q<{ p: string | null }>(`select "posProductId" as p from "${table}" where id = $1`, id))[0]?.p ?? null;
const countProducts = async (tid?: string) => Number((await q<{ n: number }>(`select count(*)::int as n from "PosProduct"${tid ? ` where "tenantId" = $1` : ""}`, ...(tid ? [tid] : [])))[0]?.n ?? -1);
const countWhere = async (table: string, tid: string) => Number((await q<{ n: number }>(`select count(*)::int as n from "${table}" where "tenantId" = $1`, tid))[0]?.n ?? -1);
/** สาขา → ระบบ POS (AppSystemUnit type POS · unique ต่อสาขา) — แหล่งความจริงเดียวของ "เมนู/สินค้าเว็บนี้อยู่ POS ไหน" */
const posOfUnit = async (): Promise<Map<string, string>> =>
  new Map((await q<{ unitId: string; systemId: string }>(`select "unitId", "systemId" from "AppSystemUnit" where type = 'POS' and "tenantId" = any($1::text[])`, QC_TIDS)).map((r) => [r.unitId, r.systemId]));
/** ร้าน → POS ตัวแรก (listSystems: type asc, createdAt asc) = ทางที่ shop checkout ใช้วันนี้ (shop/service.ts:217) */
const firstPosOfTenant = async (): Promise<Map<string, string>> => {
  const rows = await q<{ tenantId: string; id: string }>(`select "tenantId", id from "AppSystem" where type = 'POS' and "tenantId" = any($1::text[]) order by "createdAt" asc`, QC_TIDS);
  const m = new Map<string, string>();
  for (const r of rows) if (!m.has(r.tenantId)) m.set(r.tenantId, r.id);
  return m;
};
/** คลัง → ระบบ POS: คลัง I ขายได้ใน POS S เมื่อมีสาขาที่ผูกทั้ง I และ S (หลาย S = กำกวม → backfill ต้องข้าม+รายงาน) */
const posOfInventory = async (): Promise<Map<string, string[]>> => {
  const rows = await q<{ inv: string; pos: string }>(`
    select distinct i."systemId" as inv, p."systemId" as pos from "AppSystemUnit" i
    join "AppSystemUnit" p on p."unitId" = i."unitId" and p."tenantId" = i."tenantId" and p.type = 'POS'
    where i.type = 'INVENTORY' and i."tenantId" = any($1::text[])`, QC_TIDS);
  const m = new Map<string, string[]>();
  for (const r of rows) m.set(r.inv, [...(m.get(r.inv) ?? []), r.pos]);
  return m;
};

let exitCode = 1;
let s2Skipped: string | null = null;
try {
  const { PrismaClient } = (await import("@prisma/client")) as Any;
  const { PrismaPg } = (await import("@prisma/adapter-pg")) as Any;
  laneFactory = (i: number) => {
    while (clients.length <= i) clients.push(new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL, max: 2 }) }));
    return clients[i];
  };

  // ═══ S1.1–S1.5 โครงสร้าง ═══
  await section("schema", ["S1.1", "S1.2", "S1.3", "S1.4", "S1.5"], async () => {
    const T = TABLES;
    const ppCols = T.has("PosProduct") ? await colInfo("PosProduct") : new Map<string, ColInfo>();
    const needT = ["PosProduct", "PosCategory", "PosProductOptionGroup", "RecipeLine"];
    chk("S1.1", needT.every((t) => T.has(t)) && ppCols.get("parentId")?.is_nullable === "YES" && !T.has("PosVariant"), `${needT.join(",")} · PosProduct.parentId nullable · ไม่มี PosVariant`,
      `ขาด: ${needT.filter((t) => !T.has(t)).join(",") || "-"} · parentId ${ppCols.get("parentId")?.is_nullable ?? "ไม่มี"} · PosVariant ${T.has("PosVariant") ? "มี (R3 ห้าม)" : "ไม่มี"}`);
    const links: [string, string][] = [["MenuItem", "posProductId"], ["ShopProduct", "posProductId"], ["ShopOrderLine", "posProductId"], ["PosSaleLine", "productId"], ["RestaurantOrderItem", "productId"]];
    const linkBad: string[] = [];
    for (const [t, c] of links) { const ci = (await colInfo(t)).get(c); if (!ci || ci.is_nullable !== "YES") linkBad.push(`${t}.${c}:${ci ? "NOT NULL" : "ไม่มี"}`); }
    const solCols = await colInfo("ShopOrderLine");
    chk("S1.2", linkBad.length === 0 && solCols.get("productId")?.is_nullable === "NO", "ครบ + nullable · ShopOrderLine.productId (FK ShopProduct เดิม) ยัง NOT NULL", `${linkBad.join(" ") || "ครบ"} · ShopOrderLine.productId ${solCols.get("productId")?.is_nullable ?? "หาย!"}`);
    const needC = ["tenantId", "systemId", "unitId", "invItemId", "name", "nameEn", "kind", "categoryId", "basePriceSatang", "vatRateBp", "stationId", "dailyStockQty", "images", "archivedAt"];
    const missC = needC.filter((c) => !ppCols.has(c));
    const nullable = ["unitId", "invItemId", "basePriceSatang"].filter((c) => ppCols.get(c)?.is_nullable !== "YES");
    const notNull = ["tenantId", "systemId", "name", "kind"].filter((c) => ppCols.get(c)?.is_nullable !== "NO");
    const idx = await q<{ tablename: string; indexdef: string }>(`select tablename, indexdef from pg_indexes where schemaname='public' and tablename = any($1::text[])`, ["PosProduct", ...links.map((l) => l[0])]);
    const hasIdx = (t: string, c: string) => idx.some((r) => r.tablename === t && new RegExp(`\\(\\s*"${c}"`).test(r.indexdef));
    const uniqInv = idx.some((r) => r.tablename === "PosProduct" && /UNIQUE/i.test(r.indexdef) && /"invItemId"/.test(r.indexdef) && (/"systemId"/.test(r.indexdef) || /\(\s*"invItemId"\s*\)/.test(r.indexdef)));
    const idxMiss = [...links.map(([t, c]) => (hasIdx(t, c) ? "" : `${t}.${c}`)), uniqInv ? "" : "PosProduct unique(systemId, invItemId)", hasIdx("PosProduct", "systemId") || hasIdx("PosProduct", "tenantId") ? "" : "PosProduct(systemId|tenantId)"].filter(Boolean);
    const kindEnum = (await q<{ enumlabel: string }>(`select e.enumlabel from pg_enum e join pg_type t on t.oid = e.enumtypid join information_schema.columns c on c.udt_name = t.typname where c.table_name='PosProduct' and c.column_name='kind'`)).map((r) => r.enumlabel);
    const kindMiss = ["PRODUCT", "SERVICE", "MENU", "BUNDLE"].filter((k) => !kindEnum.includes(k));
    chk("S1.3", missC.length === 0 && nullable.length === 0 && notNull.length === 0 && idxMiss.length === 0 && kindMiss.length === 0,
      "คอลัมน์ครบ · unitId/invItemId/basePriceSatang nullable · tenantId/systemId/name/kind NOT NULL · kind ∋ PRODUCT/SERVICE/MENU/BUNDLE · index ครบ",
      `ขาดคอลัมน์: ${missC.join(",") || "-"} · ควร nullable: ${nullable.join(",") || "-"} · ควร NOT NULL: ${notNull.join(",") || "-"} · kind ขาด: ${kindMiss.join(",") || "-"} · ขาด index: ${idxMiss.join(",") || "-"}`);
    const bad0: string[] = [];
    const migs = existsSync("prisma/migrations") ? readdirSync("prisma/migrations").filter((d) => existsSync(`prisma/migrations/${d}/migration.sql`)).sort() : [];
    const mine = migs.filter((d) => /CREATE TABLE\s+(IF NOT EXISTS\s+)?"PosProduct"/i.test(read(`prisma/migrations/${d}/migration.sql`)));
    if (mine.length && !/_pos_v2_a$/.test(mine[0])) bad0.push(`${mine[0]}: ชื่อโฟลเดอร์ไม่ลงท้าย _pos_v2_a`);
    const startIdx = mine.length ? migs.indexOf(mine[0]) : -1;
    const related = startIdx < 0 ? [] : migs.slice(startIdx).filter((d) => /PosProduct|posProductId|PosCategory|RecipeLine|PosVariant/.test(read(`prisma/migrations/${d}/migration.sql`)));
    const bad: string[] = [...bad0];
    const OLD = ["MenuItem", "ShopProduct", "PosSaleLine", "RestaurantOrderItem", "ShopOrderLine", "InvItem", "AccountProduct", "PosSale"];
    for (const d of related) {
      const sql = read(`prisma/migrations/${d}/migration.sql`).replace(/--.*$/gm, "");
      if (/\bDROP\s+(TABLE|COLUMN)\b/i.test(sql)) bad.push(`${d}: DROP`);
      if (/\bRENAME\b/i.test(sql)) bad.push(`${d}: RENAME`);
      if (/ALTER TYPE\s+"InvItemKind"/i.test(sql)) bad.push(`${d}: แตะ InvItemKind (R1)`);
      for (const t of OLD) {
        for (const m of sql.matchAll(new RegExp(`ALTER TABLE\\s+"${t}"[^;]*`, "gi"))) {
          if (/SET NOT NULL/i.test(m[0])) bad.push(`${d}: ${t} SET NOT NULL`);
          if (/ADD COLUMN[^,;]*NOT NULL/i.test(m[0]) && !/DEFAULT/i.test(m[0])) bad.push(`${d}: ${t} ADD COLUMN NOT NULL ไร้ DEFAULT`);
        }
      }
      if (/ALTER TYPE[^;]*ADD VALUE/i.test(sql) && sql.replace(/ALTER TYPE[^;]*ADD VALUE[^;]*;/gi, "").trim().length > 0) bad.push(`${d}: ALTER TYPE ADD VALUE ปนกับ DDL อื่น`);
    }
    chk("S1.4", mine.length > 0 && bad.length === 0, "มี migration สร้าง PosProduct · additive ล้วน", `${mine[0] ?? "ไม่พบ migration"} (+${Math.max(0, related.length - 1)} ไฟล์) · ${bad.join(" · ") || "สะอาด"}`);
    const scopeSrc = read("src/lib/core/scope.ts");
    const scopeMiss = [...needT, ...(T.has("PosVariant") ? ["PosVariant"] : [])].filter((m) => !new RegExp(`\\b${m}\\s*:`).test(scopeSrc));
    chk("S1.5", scopeMiss.length === 0, "ลงทะเบียนครบ", `ขาด: ${scopeMiss.join(",") || "-"}`);
  });

  // ═══ fixtures (ข้อมูลเก่า) ก่อน backfill ═══
  const fx: Any = {};
  await section("fixtures", ["S1.6"], async () => {
    fx.water = itemBySku(CF, "PQC-CF-WATER"); fx.coke = itemBySku(RS, "PQC-RS-COKE"); fx.gift = itemBySku(CF, "PQC-CF-GIFT");
    fx.costOnly = await mkInv(cfT, sysC.INVENTORY, "costonly", { costSatang: 777 }); // มีแต่ต้นทุน → null (หน้าขายวันนี้โชว์ 7.77)
    fx.posPrice = await mkInv(cfT, sysC.INVENTORY, "posprice", { costSatang: 100 });
    fx.posPriceAp = await mkAp(cfT, sysC.ACCOUNT, fx.posPrice, 5000, 700, 4500); // ขั้น 1 posPrice ชนะ salePrice
    fx.posZero = await mkInv(cfT, sysC.INVENTORY, "poszero");
    await mkAp(cfT, sysC.ACCOUNT, fx.posZero, 5000, 700, 0); // posPrice 0 ไม่นับ (>0 เท่านั้น) → salePrice 5000
    fx.svcZero = await mkInv(cfT, sysC.INVENTORY, "svczero", { kind: "SERVICE", priceSatang: 0 }); // บริการราคา 0 ไม่มีบัญชี → null (แยก "ตั้ง 0" กับ "ยังไม่ตั้ง" ไม่ได้)
    // สินค้าจำนวนมากเกินเพดาน 200 ของหน้าขายเดิม (S1.37) — createMany คำสั่งเดียว
    await P.invItem.createMany({ data: Array.from({ length: 201 }, (_, i) => ({ tenantId: cfT, systemId: sysC.INVENTORY, sku: `${TAG}-bulk-${String(i).padStart(3, "0")}`, name: `${TAG} bulk ${i}` })) });
    fx.arch = await mkInv(cfT, sysC.INVENTORY, "arch", { archivedAt: new Date(), costSatang: 100 });
    await mkAp(cfT, sysC.ACCOUNT, fx.arch, 3300);
    fx.shShared = await mkShop("shop-shared", 1200, fx.water.id); // เว็บร้านชี้น้ำดื่ม (ราคาเว็บ 12.00 ≠ หน้าร้าน 10.00)
    fx.shOnly = await mkShop("shop-only", 12345);
    fx.g1 = await P.menuOptionGroup.create({ data: { tenantId: rsT, unitId: RMAIN, name: `${TAG} g1`, choices: { create: [{ tenantId: rsT, unitId: RMAIN, name: "ธรรมดา", priceDelta: 0 }, { tenantId: rsT, unitId: RMAIN, name: "พิเศษ", priceDelta: 1000 }] } } });
    fx.g2 = await P.menuOptionGroup.create({ data: { tenantId: rsT, unitId: RMAIN, name: `${TAG} g2`, maxSelect: 3, choices: { create: [{ tenantId: rsT, unitId: RMAIN, name: "ไข่ดาว", priceDelta: 1500 }] } } });
    fx.mOpt = await mkMenu("menu-opt", { basePrice: 9900, images: ["https://example.invalid/a.jpg", "https://example.invalid/b.jpg"], dailyStockQty: 30, stockQty: 30 });
    await P.menuItemOptionGroup.create({ data: { tenantId: rsT, unitId: RMAIN, itemId: fx.mOpt.id, groupId: fx.g2.id, sortOrder: 0 } });
    await P.menuItemOptionGroup.create({ data: { tenantId: rsT, unitId: RMAIN, itemId: fx.mOpt.id, groupId: fx.g1.id, sortOrder: 1 } });
    fx.mCoke = await mkMenu("menu-coke", { basePrice: 2500, invItemId: fx.coke.id }); // เมนูชี้ InvItem โค้ก (ราคาบัญชี 20.00)
    // สาขาที่ไม่มีระบบ POS (R1: backfill ต้องข้าม + รายงาน ไม่เดา)
    fx.noPosUnit = await P.businessUnit.create({ data: { tenantId: cfT, type: "SHOP", name: `${TAG} ไม่มี POS`, slug: `${TAG}-nopos` } });
    fx.noPosCat = await P.menuCategory.create({ data: { tenantId: cfT, unitId: fx.noPosUnit.id, name: `${TAG} cat` } });
    fx.noPosSt = await P.kdsStation.create({ data: { tenantId: cfT, unitId: fx.noPosUnit.id, name: `${TAG} st` } });
    fx.noPosMenu = await mkMenu("nopos-menu", { basePrice: 1111 }, fx.noPosUnit.id, cfT, fx.noPosCat.id, fx.noPosSt.id);
    fx.noPosShop = await mkShop("nopos-shop", 2222, null, fx.noPosUnit.id);
  });

  // ═══ ภาพก่อน backfill: จอเดิม + createSale (rollback ทิ้ง) ═══
  const menu = await load("@/lib/modules/restaurant/menu");
  const storefront = await load("@/lib/modules/restaurant/storefront");
  const shop = await load("@/lib/modules/shop/service");
  const reg = await load("@/lib/modules/pos/register");
  const posSvc = await load("@/lib/modules/pos/service");
  const screens = async () => ({
    menuList: stripScreen(await menu.listItems(rsT, RMAIN, { includeArchived: true })),
    ordering: stripScreen(await menu.orderingMenu(rsT, RMAIN)),
    publicMenu: stripScreen(await storefront.publicMenu(rsT, RMAIN)),
    shopList: stripScreen(await shop.listProducts({ tenantId: cfT, unitId: SILOM }, { activeOnly: true })),
    regCf: (await reg.posCatalog(cfT, sysC.INVENTORY)) as Any[],
    regRs: (await reg.posCatalog(rsT, sysR.INVENTORY)) as Any[],
  });
  class Rollback extends Error {}
  /** createSale ด้วย id เดิม (InvItem ของ seed + ราคาจาก pos-expected.json — ไม่พึ่งรายการหน้าขายที่ถูกตัด 200 ตัว) ใน tx ที่ rollback ทิ้ง */
  const saleProbe = async () => {
    const pick = ["PQC-CF-WATER", "PQC-CF-CROIS", "PQC-CF-EGG", "PQC-CF-FREE"].map((s) => itemBySku(CF, s));
    const lines = pick.map((c: Any, i: number) => ({ name: c.sku, qty: i + 1, unitPriceSatang: c.salePrice as number, itemId: c.id as string, discountSatang: i === 1 ? 500 : 0 }));
    const total = lines.reduce((s, l) => s + l.qty * l.unitPriceSatang - l.discountSatang, 0) - 300;
    let out: Any = null;
    try {
      await P.$transaction(async (tx: Any) => {
        const r = await posSvc.createSale({ tenantId: cfT, unitId: SILOM, systemId: sysC.POS, idempotencyKey: `${TAG}-probe-${randomBytes(4).toString("hex")}`, lines, billDiscountSatang: 300, payMethods: total > 0 ? [{ type: "CASH", amountSatang: total }] : [] }, tx);
        const s = await tx.posSale.findUnique({ where: { id: r.saleId }, include: { lines: true } });
        out = { subtotal: s.subtotalSatang, discount: s.discountSatang, vat: s.vatSatang, grand: s.grandTotalSatang, lines: (s.lines as Any[]).map((l) => [l.name, l.qty, l.unitPriceSatang, l.discountSatang, l.lineTotalSatang, l.itemId]).sort() };
        throw new Rollback("rollback");
      }, { timeout: 60_000, maxWait: 30_000 });
    } catch (e) {
      if (!(e instanceof Rollback)) throw e;
    }
    return out;
  };
  let before: Any = null; let saleBefore: Any = null;
  await section("before-screens", ["S1.21", "S1.22", "S1.23", "S1.24"], async () => {
    if (!menu || !storefront || !shop || !reg || !posSvc) throw new Error(`โหลดโมดูลเดิมไม่ได้: ${JSON.stringify(loadErr)}`);
    before = await screens();
    saleBefore = await saleProbe();
  });
  const legacyPre = await snapLegacy();

  // ═══ S1.6–S1.8 dry-run + จริง ═══
  let realSummary: Any = null;
  await section("backfill", ["S1.6", "S1.7", "S1.8"], async () => {
    const invs = await rowsOf("InvItem", QC_TIDS); const menus = await rowsOf("MenuItem", QC_TIDS); const shops = await rowsOf("ShopProduct", QC_TIDS);
    const uPos = await posOfUnit(); const iPos = await posOfInventory(); const tPos = await firstPosOfTenant();
    const srcCount = { invItem: invs.length, menuItem: menus.length, shopProduct: shops.length };
    const skipCount = {
      invItem: invs.filter((i) => (iPos.get(i.systemId) ?? []).length !== 1).length,
      menuItem: menus.filter((m) => !uPos.has(m.unitId)).length,
      shopProduct: shops.filter((s) => !tPos.has(s.tenantId)).length,
    };
    const nb = await snapNew(); const lb = await snapLegacyLinks();
    const dry = await runBackfill(["--dry-run"]);
    const s = dry.summary?.sources ?? {}; const sk = dry.summary?.skippedNoPosSystem ?? dry.summary?.skipped?.noPosSystem ?? {};
    chk("S1.6", dry.code === 0 && hashOf(norm({ invItem: s.invItem, menuItem: s.menuItem, shopProduct: s.shopProduct })) === hashOf(srcCount) &&
      hashOf(norm({ invItem: sk.invItem, menuItem: sk.menuItem, shopProduct: sk.shopProduct })) === hashOf(skipCount),
      `exit 0 · sources ${JSON.stringify(srcCount)} · skippedNoPosSystem ${JSON.stringify(skipCount)}`,
      `exit ${dry.code} · ${dry.summary ? `sources ${JSON.stringify(dry.summary.sources)} · skippedNoPosSystem ${JSON.stringify(sk)}` : `ไม่มี JSON_SUMMARY (${tail(dry.out)})`}`);
    const dn = diffSnap(nb, await snapNew()); const dl = diffSnap(lb, await snapLegacyLinks());
    chk("S1.7", dry.code === 0 && Object.keys(dn).length === 0 && Object.keys(dl).length === 0, "ไม่ต่าง", `ใหม่: ${diffText(dn)} · เดิม: ${diffText(dl)}`);
    const pBefore = await countProducts();
    const real = await runBackfill([]);
    realSummary = real.summary;
    const pDelta = (await countProducts()) - pBefore;
    const invDelta = (await rowsOf("InvItem", QC_TIDS)).length - invs.length;
    const c = createdOf(real.summary); const cd = createdOf(dry.summary);
    chk("S1.8", real.code === 0 && c.posProduct === pDelta && cd.posProduct === pDelta && invDelta === 0 && (c.invItem ?? 0) === 0,
      `exit 0 · created.posProduct=${pDelta} (=dry-run) · InvItem +0`, `exit ${real.code} · created ${JSON.stringify(c)} · dry ${JSON.stringify(cd)} · จริง +${pDelta} PosProduct +${invDelta} InvItem${real.code ? ` · ${tail(real.out)}` : ""}`);
  });

  // ═══ S1.9–S1.18 ค่าหลัง backfill ═══
  await section("invariants", ["S1.9", "S1.10", "S1.11", "S1.12", "S1.13", "S1.14", "S1.15", "S1.16", "S1.17", "S1.18"], async () => {
    const invs = await rowsOf("InvItem", QC_TIDS);
    const prods = await rowsOf("PosProduct", QC_TIDS);
    const menus = await rowsOf("MenuItem", QC_TIDS); const shops = await rowsOf("ShopProduct", QC_TIDS);
    const uPos = await posOfUnit(); const iPos = await posOfInventory(); const tPos = await firstPosOfTenant();
    const posSystems = new Set((await q<{ id: string; tenantId: string }>(`select id, "tenantId" from "AppSystem" where type = 'POS' and "tenantId" = any($1::text[])`, QC_TIDS)).map((r) => `${r.tenantId}/${r.id}`));
    const byInv = new Map<string, Any[]>();
    for (const p of prods) if (p.invItemId) byInv.set(p.invItemId, [...(byInv.get(p.invItemId) ?? []), p]);
    const invById = new Map(invs.map((i) => [i.id, i]));
    const prodMap = new Map(prods.map((p) => [p.id, p]));
    // S1.9
    const sellable = invs.filter((i) => (iPos.get(i.systemId) ?? []).length === 1);
    const notOne = sellable.filter((i) => (byInv.get(i.id) ?? []).length !== 1 || byInv.get(i.id)![0].systemId !== iPos.get(i.systemId)![0]).map((i) => `${i.sku}:${(byInv.get(i.id) ?? []).length}`);
    const unsellableWithProd = invs.filter((i) => (iPos.get(i.systemId) ?? []).length !== 1 && (byInv.get(i.id) ?? []).length > 0).map((i) => i.sku);
    const orphan = prods.filter((p) => (p.invItemId && (!invById.has(p.invItemId) || invById.get(p.invItemId).tenantId !== p.tenantId)) || !posSystems.has(`${p.tenantId}/${p.systemId}`)).map((p) => p.id);
    chk("S1.9", sellable.length > 0 && notOne.length === 0 && unsellableWithProd.length === 0 && orphan.length === 0,
      `InvItem ที่ขายได้ ${sellable.length} ตัว → 1 แถวต่อตัว (systemId ตรง) · กำพร้า 0`, `ไม่ใช่ 1/ระบบผิด: ${notOne.slice(0, 6).join(",") || "-"} · ไม่ผูก POS แต่มีแถว: ${unsellableWithProd.join(",") || "-"} · กำพร้า/ข้ามร้าน ${orphan.length}`);
    // S1.10
    const badMenu: string[] = [];
    const menuLinks = new Map<string, number>();
    for (const m of menus) {
      if (!uPos.has(m.unitId)) { if (m.posProductId) badMenu.push(`${m.name}:สาขาไม่มี POS แต่ผูก`); continue; }
      const p = prodMap.get(m.posProductId);
      if (!p) { badMenu.push(`${m.name}:ไม่มีลิงก์`); continue; }
      menuLinks.set(p.id, (menuLinks.get(p.id) ?? 0) + 1);
      if (p.tenantId !== m.tenantId || p.kind !== "MENU" || p.unitId !== m.unitId || p.systemId !== uPos.get(m.unitId) || (p.invItemId ?? null) !== (m.invItemId ?? null))
        badMenu.push(`${m.name}:kind ${p.kind} unit ${p.unitId === m.unitId} sys ${p.systemId === uPos.get(m.unitId)} inv ${p.invItemId ?? null}`);
    }
    const shared = [...menuLinks.values()].filter((n) => n > 1).length;
    chk("S1.10", badMenu.length === 0 && shared === 0 && menus.length > 0, `เมนู ${menus.length} ตัว: 1 MENU ต่อเมนู · สาขาไม่มี POS ไม่ผูก`, `${badMenu.slice(0, 4).join(" · ") || "ครบ"} · แถวที่หลายเมนูแชร์ ${shared}`);
    // S1.11
    const badShop: string[] = [];
    for (const s of shops) {
      const sys = tPos.get(s.tenantId);
      if (!sys) { if (s.posProductId) badShop.push(`${s.name}:ร้านไม่มี POS แต่ผูก`); continue; }
      const p = prodMap.get(s.posProductId);
      if (!p || p.tenantId !== s.tenantId) { badShop.push(`${s.name}:ไม่มีลิงก์`); continue; }
      if (s.invItemId) { if (p.invItemId !== s.invItemId || p.systemId !== sys) badShop.push(`${s.name}:ไม่ชี้แถวของ InvItem ใน POS ${sys}`); }
      else if (p.kind !== "PRODUCT" || p.unitId !== s.unitId || p.invItemId !== null || p.systemId !== sys) badShop.push(`${s.name}:kind ${p.kind} unit ${p.unitId === s.unitId} inv ${p.invItemId} sys ${p.systemId === sys}`);
    }
    const noPosShopLinked = !!shops.find((x) => x.id === fx.noPosShop.id)?.posProductId;
    chk("S1.11", badShop.length === 0 && shops.length > 0 && noPosShopLinked, `เว็บร้าน ${shops.length} ตัวผูกถูกทาง (รวมสาขาที่ไม่ผูก POS)`, `${badShop.slice(0, 5).join(" · ") || "ครบ"} · สาขาไม่มี POS ${noPosShopLinked ? "ผูกแล้ว" : "ไม่ผูก"}`);
    // S1.12
    const cokeP = byInv.get(fx.coke.id) ?? []; const waterP = byInv.get(fx.water.id) ?? [];
    const mCokeLink = menus.find((m) => m.id === fx.mCoke.id)?.posProductId; const shLink = shops.find((s) => s.id === fx.shShared.id)?.posProductId;
    chk("S1.12", cokeP.length === 1 && waterP.length === 1 && mCokeLink === cokeP[0]?.id && cokeP[0]?.kind === "MENU" && cokeP[0]?.unitId === RMAIN && shLink === waterP[0]?.id && waterP[0]?.unitId === null,
      "โค้ก 1 แถว = MENU ของเมนูโค้ก · น้ำดื่ม 1 แถว (unitId null) · เว็บร้านชี้น้ำดื่ม", `โค้ก ${cokeP.length} (${cokeP[0]?.kind}/${cokeP[0]?.unitId === RMAIN ? "main" : cokeP[0]?.unitId}) · menu→${mCokeLink === cokeP[0]?.id} · น้ำ ${waterP.length} (unit ${waterP[0]?.unitId}) · shop→${shLink === waterP[0]?.id}`);
    // S1.13–S1.14 ราคา (R2)
    const aps = await rowsOf("AccountProduct", QC_TIDS);
    const apById = new Map(aps.map((a) => [a.id, a]));
    const apOfInv = (inv: Any) => (inv?.accountProductId ? apById.get(inv.accountProductId) : aps.find((a) => a.invItemId === inv?.id)) ?? null;
    const expectPrice = (p: Any): number | null => {
      const inv = p.invItemId ? invById.get(p.invItemId) : null;
      const ap = inv ? apOfInv(inv) : null;
      if (typeof ap?.posPrice === "number" && ap.posPrice > 0) return ap.posPrice; // ขั้น 1 (>0)
      if (ap?.salePrice !== null && ap?.salePrice !== undefined) return ap.salePrice; // ขั้น 2 — null = ยังไม่ตั้ง · 0 = ตั้งใจ (ดู notes)
      if (inv?.kind === "SERVICE" && inv.priceSatang > 0) return inv.priceSatang; // ขั้น 3 (>0 — default 0 แยกไม่ออกว่าตั้งใจ)
      const m = menus.find((x) => x.posProductId === p.id);
      if (m) return m.basePrice;
      const s = shops.find((x) => x.posProductId === p.id && !x.invItemId);
      if (s) return s.priceSatang;
      return null;
    };
    const seedProducts = [...CF.items, ...RS.items].filter((i: Any) => i.kind === "PRODUCT");
    const badSeed = seedProducts.filter((i: Any) => byInv.get(i.id)?.[0]?.basePriceSatang !== i.salePrice).map((i: Any) => `${i.sku}:${byInv.get(i.id)?.[0]?.basePriceSatang}≠${i.salePrice}`);
    chk("S1.13", badSeed.length === 0, "ทุกตัว = salePrice (FREE/ICE = 0)", badSeed.join(" · ") || `ตรง ${seedProducts.length} ตัว`);
    const badAll = prods.filter((p) => (p.basePriceSatang ?? null) !== expectPrice(p)).map((p) => `${p.name}:${p.basePriceSatang ?? null}≠${expectPrice(p)}`);
    const pOf = (rows: Any[], id: string) => prodMap.get(rows.find((x) => x.id === id)?.posProductId);
    const rung = {
      posPrice: byInv.get(fx.posPrice.id)?.[0]?.basePriceSatang === 4500,
      posZero: byInv.get(fx.posZero.id)?.[0]?.basePriceSatang === 5000,
      svcZeroNull: byInv.get(fx.svcZero.id)?.[0]?.basePriceSatang === null,
      service: byInv.get(fx.gift.id)?.[0]?.basePriceSatang === 15000,
      menu: pOf(menus, fx.mOpt.id)?.basePriceSatang === 9900,
      shopOnly: pOf(shops, fx.shOnly.id)?.basePriceSatang === 12345,
      costOnlyNull: byInv.get(fx.costOnly.id)?.[0]?.basePriceSatang === null,
      menuCokeAp: cokeP[0]?.basePriceSatang === 2000,
    };
    chk("S1.14", badAll.length === 0 && Object.values(rung).every(Boolean), "posPrice 4500 · posPrice0→5000 · SERVICE 15000 · SERVICE 0 → null · เมนู 9900 · เว็บล้วน 12345 · ต้นทุนอย่างเดียว null · เมนู→โค้ก 2000 (salePrice ก่อน basePrice) · ทุกแถวตรงสูตร",
      `ไม่ตรง: ${badAll.slice(0, 5).join(" · ") || "-"} · ${Object.entries(rung).map(([k, v]) => `${k}${v ? "✓" : "✗"}`).join(" ")}`);
    // S1.15 VAT
    const badVat = prods.filter((p) => { const inv = p.invItemId ? invById.get(p.invItemId) : null; const ap = inv ? apOfInv(inv) : null; return (p.vatRateBp ?? null) !== (ap ? ap.vatRateBp : null); }).map((p) => p.name);
    const egg = byInv.get(itemBySku(CF, "PQC-CF-EGG").id)?.[0];
    chk("S1.15", badVat.length === 0 && egg?.vatRateBp === 0 && byInv.get(fx.costOnly.id)?.[0]?.vatRateBp === null, "ตาม AccountProduct · ไข่ 0 · ไม่มีบัญชี null", `ไม่ตรง: ${badVat.slice(0, 5).join(",") || "-"} · ไข่ ${egg?.vatRateBp}`);
    // S1.16 หมวด
    const cats = await rowsOf("PosCategory", QC_TIDS); const mcats = (await rowsOf("MenuCategory", QC_TIDS)).filter((c) => uPos.has(c.unitId));
    const catCols = await colInfo("PosCategory");
    const catById = new Map(cats.map((c) => [c.id, c]));
    const badCat: string[] = [];
    for (const m of menus.filter((x) => uPos.has(x.unitId))) {
      const p = prodMap.get(m.posProductId); const mc = mcats.find((c) => c.id === m.categoryId); const pc = p ? catById.get(p.categoryId) : null;
      if (!pc || pc.name !== mc?.name || (pc.nameEn ?? null) !== (mc?.nameEn ?? null) || (catCols.has("unitId") && pc.unitId !== mc?.unitId)) badCat.push(`${m.name}→${pc?.name ?? "-"}`);
    }
    const dupCat = mcats.filter((mc) => cats.filter((c) => c.tenantId === mc.tenantId && c.name === mc.name && (!catCols.has("unitId") || c.unitId === mc.unitId)).length !== 1).map((c) => c.name);
    chk("S1.16", badCat.length === 0 && dupCat.length === 0, "ชื่อตรง · 1 ต่อ MenuCategory", `ผิด: ${badCat.slice(0, 4).join(",") || "-"} · ซ้ำ/หาย: ${dupCat.join(",") || "-"}`);
    // S1.17
    const badFld = menus.filter((m) => uPos.has(m.unitId)).filter((m) => {
      const p = prodMap.get(m.posProductId);
      return !p || p.stationId !== m.stationId || (p.dailyStockQty ?? null) !== (m.dailyStockQty ?? null) || hashOf(p.images ?? []) !== hashOf(m.images ?? []);
    }).map((m) => m.name);
    chk("S1.17", badFld.length === 0, "station · dailyStockQty · images ตรง", badFld.slice(0, 4).join(",") || "ครบ");
    // S1.18
    const mog = await rowsOf("MenuItemOptionGroup", QC_TIDS); const pog = await rowsOf("PosProductOptionGroup", QC_TIDS);
    const ogNow = (await rowsOf("MenuOptionGroup", QC_TIDS)).length;
    const badOg: string[] = [];
    for (const m of menus.filter((x) => uPos.has(x.unitId))) {
      const want = mog.filter((x) => x.itemId === m.id).map((x) => `${x.groupId}:${x.sortOrder}`).sort().join(",");
      const have = pog.filter((x) => x.productId === m.posProductId).map((x) => `${x.groupId}:${x.sortOrder}`).sort().join(",");
      if (want !== have) badOg.push(`${m.name}: ${have || "∅"} ≠ ${want || "∅"}`);
    }
    const optP = pOf(menus, fx.mOpt.id);
    const optSet = pog.filter((x) => x.productId === optP?.id).map((x) => `${x.groupId === fx.g2.id ? "g2" : x.groupId === fx.g1.id ? "g1" : "?"}:${x.sortOrder}`).sort().join(",");
    chk("S1.18", badOg.length === 0 && optSet === "g1:1,g2:0" && ogNow === (snapLegacy0.MenuOptionGroup?.size ?? 0) + 2, "ตรงทุกเมนู · เมนูทดสอบ g2:0,g1:1 · ไม่มี MenuOptionGroup ใหม่", `${badOg.slice(0, 3).join(" · ") || "ตรง"} · ทดสอบ ${optSet || "∅"} · กลุ่ม ${ogNow}`);
  });

  // ═══ X1.1 รอบสอง ═══
  await section("second-run", ["X1.1"], async () => {
    const nb = await snapNew();
    const r2 = await runBackfill([]);
    const d = diffSnap(nb, await snapNew());
    chk("X1.1", r2.code === 0 && allZero(createdOf(r2.summary)) && allZero(updatedOf(r2.summary)) && Object.keys(d).length === 0, "exit 0 · created/updated = 0 · ตารางใหม่ไม่ต่าง",
      `exit ${r2.code} · created ${JSON.stringify(createdOf(r2.summary))} · updated ${JSON.stringify(updatedOf(r2.summary))} · ${diffText(d)}`);
  });

  // ═══ S1.21–S1.25 จอเดิม + createSale + rollback ระหว่างทาง ═══
  await section("after-screens", ["S1.21", "S1.22", "S1.23", "S1.24", "S1.25"], async () => {
    if (!before) throw new Error("ไม่มีภาพก่อน backfill");
    const after: Any = await screens();
    const eq = (k: string) => hashOf(before[k]) === hashOf(after[k]);
    chk("S1.21", eq("menuList") && eq("ordering") && eq("publicMenu"), "เหมือนเดิม", `listItems ${eq("menuList")} · orderingMenu ${eq("ordering")} · publicMenu ${eq("publicMenu")}`);
    chk("S1.22", eq("shopList"), "เหมือนเดิม", eq("shopList") ? "เหมือน" : "ต่าง");
    chk("S1.23", eq("regCf") && eq("regRs"), "เหมือนเดิมทุกรายการ", `ร้านกาแฟ ${eq("regCf")} (${before.regCf.length}→${after.regCf.length}) · ร้านอาหาร ${eq("regRs")} (${before.regRs.length}→${after.regRs.length})`);
    const saleAfter = await saleProbe();
    chk("S1.24", !!saleBefore && hashOf(saleBefore) === hashOf(saleAfter), JSON.stringify(saleBefore), JSON.stringify(saleAfter));
    const d = diffSnap(legacyPre, await snapLegacy());
    chk("S1.25", Object.keys(d).length === 0, "ตารางเดิมไม่ต่าง", diffText(d));
  });

  // ═══ X6.1 backfill 2 โปรเซสพร้อมกัน × 3 รอบ ═══
  await section("concurrent-backfill", ["X6.1"], async () => {
    const notes: string[] = []; let ok = true;
    for (let round = 1; round <= 3; round++) {
      const a = await mkInv(cfT, sysC.INVENTORY, `cc${round}a`); await mkAp(cfT, sysC.ACCOUNT, a, 5600 + round);
      const b = await mkInv(cfT, sysC.INVENTORY, `cc${round}b`);
      const m = await mkMenu(`cc${round}m`, { basePrice: 7000 + round });
      const s1 = await mkShop(`cc${round}s`, 3000 + round); const s2 = await mkShop(`cc${round}s2`, 3100, a.id);
      const pBefore = await countProducts();
      const [r1, r2] = await Promise.all([runBackfill([]), runBackfill([])]);
      const pa = await prodByInv(a.id); const pb = await prodByInv(b.id);
      const lm = await linkOf("MenuItem", m.id); const ls1 = await linkOf("ShopProduct", s1.id); const ls2 = await linkOf("ShopProduct", s2.id);
      const delta = (await countProducts()) - pBefore;
      const good = r1.code === 0 && r2.code === 0 && pa.length === 1 && pb.length === 1 && !!lm && !!ls1 && ls1 !== lm && ls2 === pa[0]?.id && delta === 4;
      ok &&= good;
      notes.push(`รอบ${round}: exit ${r1.code}/${r2.code} a${pa.length} b${pb.length} m ${lm ? "✓" : "✗"} s1 ${ls1 ? "✓" : "✗"} s2 ${ls2 === pa[0]?.id ? "✓" : "✗"} +${delta}`);
    }
    chk("X6.1", ok, "ทุกรอบ exit 0/0 · ต่อแหล่ง 1 แถว · +4 ต่อรอบ", notes.join(" · "));
  });

  // ═══ S1.19–S1.35 + X2/X3/X6/X8 catalog.ts ═══
  const catIds = ["S1.19", "S1.20", "S1.26", "S1.37", "S1.38", "S1.27", "S1.28", "S1.29", "S1.30", "S1.31", "S1.32", "S1.33", "S1.34", "S1.35", "X2.1", "X2.2", "X2.3", "X3.1", "X3.2", "X3.3", "X6.2", "X6.3", "X6.4", "X8.1"];
  await section("catalog", catIds, async () => {
    catalog = await load("@/lib/modules/pos/catalog");
    const FN = ["createProduct", "updateProduct", "setPrice", "archive", "listForUnit", "byBarcode", "ensureForInvItem"];
    const missFn = FN.filter((f) => typeof catalog?.[f] !== "function");
    const facade = await load("@/lib/modules/pos");
    const missFacade = FN.filter((f) => typeof facade?.[f] !== "function" && typeof facade?.catalog?.[f] !== "function");
    chk("S1.26", missFn.length === 0 && missFacade.length === 0, `${FN.join(",")} · facade ครบ`,
      `catalog ขาด: ${missFn.join(",") || "-"}${loadErr["@/lib/modules/pos/catalog"] ? ` (${loadErr["@/lib/modules/pos/catalog"]})` : ""} · facade ขาด: ${missFacade.join(",") || "-"}`);
    if (missFn.length) throw new Error(`catalog.ts ไม่ครบ: ${missFn.join(",")}`);
    const C = catalog;
    const bw = await attempt(() => C.byBarcode(ctxOwner, SILOM, "8850999000015"));
    const bc = await attempt(() => C.byBarcode(ctxRsOwner, RMAIN, "8851959132012"));
    const waterP = (await prodByInv(fx.water.id))[0]; const cokeP = (await prodByInv(fx.coke.id))[0];
    chk("S1.19", idOf(bw.value) === waterP?.id && idOf(bc.value) === cokeP?.id, `น้ำ ${waterP?.id} · โค้ก ${cokeP?.id}`, `${idOf(bw.value) ?? bw.err} · ${idOf(bc.value) ?? bc.err}`);
    const archP = (await prodByInv(fx.arch.id))[0];
    const listCf = await attempt(() => C.listForUnit(ctxOwner, SILOM));
    const listIds = new Set(listOf(listCf.value).map(idOf));
    chk("S1.20", !!archP?.archivedAt && listCf.ok && !listIds.has(archP?.id), "archivedAt ไม่ว่าง · ไม่อยู่ใน list", `archivedAt ${archP?.archivedAt ?? "null"} · อยู่ใน list ${listIds.has(archP?.id)}${listCf.ok ? "" : ` · list ปฏิเสธ: ${listCf.err}`}`);

    // createProduct
    const invSysOfPos = [sysC.INVENTORY];
    const pc0 = await countProducts(cfT);
    const cr = await attempt(() => C.createProduct(ctxOwner, { name: `${TAG} สินค้าใหม่`, nameEn: `${TAG} new`, kind: "PRODUCT", basePriceSatang: 4250, vatRateBp: 700 }));
    const np = await prodById(idOf(cr.value));
    const npInv = np?.invItemId ? (await q(`select * from "InvItem" where id = $1`, np.invItemId))[0] : null;
    const invOk = !np?.invItemId || (npInv?.tenantId === cfT && invSysOfPos.includes(npInv?.systemId));
    chk("S1.27", cr.ok && np?.tenantId === cfT && np?.systemId === sysC.POS && np?.basePriceSatang === 4250 && np?.vatRateBp === 700 && invOk && (await countProducts(cfT)) === pc0 + 1,
      "PosProduct ระบบ POS ร้านกาแฟ 4250/700 · InvItem (ถ้ามี) อยู่คลังที่ผูก", cr.ok ? `sys ${np?.systemId === sysC.POS} price ${np?.basePriceSatang} vat ${np?.vatRateBp} inv ${np?.invItemId ? npInv?.systemId : "null"}` : `ปฏิเสธ: ${cr.err}`);
    const pc1 = await countProducts(cfT); const ic1 = await countWhere("InvItem", cfT);
    const badInputs: [string, Any][] = [
      ["ชื่อว่าง", { name: "   ", basePriceSatang: 100 }],
      ["ติดลบ", { name: `${TAG} neg`, basePriceSatang: -1 }],
      ["เศษสตางค์", { name: `${TAG} frac`, basePriceSatang: 12.5 }],
      ["บาร์โค้ดซ้ำ", { name: `${TAG} dupbc`, basePriceSatang: 100, barcode: "8850999000015" }],
    ];
    const accepted: string[] = [];
    for (const [label, input] of badInputs) { const r = await attempt(() => C.createProduct(ctxOwner, input)); if (r.ok) accepted.push(label); }
    chk("S1.28", accepted.length === 0 && (await countProducts(cfT)) === pc1 && (await countWhere("InvItem", cfT)) === ic1, "ปฏิเสธทั้ง 4 · ไม่มีแถวเพิ่ม", `รับผิด: ${accepted.join(",") || "-"} · PosProduct +${(await countProducts(cfT)) - pc1} · InvItem +${(await countWhere("InvItem", cfT)) - ic1}`);
    // updateProduct
    const pid = np?.id as string;
    const anyCat = (await rowsOf("PosCategory", [cfT]))[0] ?? (await rowsOf("PosCategory", [rsT]))[0] ?? null;
    const sameTenantCat = anyCat?.tenantId === cfT ? anyCat : null;
    const up = await attempt(() => C.updateProduct(ctxOwner, pid, { name: `${TAG} ชื่อใหม่`, nameEn: `${TAG} renamed`, ...(sameTenantCat ? { categoryId: sameTenantCat.id } : {}) }));
    const npu = await prodById(pid);
    const inList = listOf((await attempt(() => C.listForUnit(ctxOwner, SILOM))).value).find((x) => idOf(x) === pid);
    chk("S1.29", up.ok && npu?.name === `${TAG} ชื่อใหม่` && npu?.nameEn === `${TAG} renamed` && (!sameTenantCat || npu?.categoryId === sameTenantCat.id) && inList?.name === `${TAG} ชื่อใหม่` && (await countProducts(cfT)) === pc1,
      "ชื่อ/ชื่ออังกฤษ/หมวด เปลี่ยน · list เห็น", up.ok ? `${npu?.name} · ${npu?.nameEn} · cat ${npu?.categoryId} · list ${inList?.name}` : `ปฏิเสธ: ${up.err}`);
    // setPrice
    const s1 = await attempt(() => C.setPrice(ctxOwner, pid, 3999)); const p3999 = (await prodById(pid))?.basePriceSatang;
    const s0 = await attempt(() => C.setPrice(ctxOwner, pid, 0)); const p0 = (await prodById(pid))?.basePriceSatang;
    await attempt(() => C.setPrice(ctxOwner, pid, 3999));
    const badOk: string[] = [];
    for (const b of [-100, 10.5, Number.NaN, "100" as Any]) { const r = await attempt(() => C.setPrice(ctxOwner, pid, b)); if (r.ok) badOk.push(String(b)); }
    const pEnd = (await prodById(pid))?.basePriceSatang;
    chk("S1.30", s1.ok && p3999 === 3999 && s0.ok && p0 === 0 && badOk.length === 0 && pEnd === 3999, "3999 · 0 · ปฏิเสธ -100/10.5/NaN/'100' · ค้าง 3999", `${s1.ok ? p3999 : s1.err} · ${s0.ok ? p0 : s0.err} · รับผิด ${badOk.join(",") || "-"} · ท้าย ${pEnd}`);
    // listForUnit shape (§1)
    const lf = await attempt(() => C.listForUnit(ctxOwner, SILOM));
    const rows = listOf(lf.value);
    const KEYS = ["id", "invItemId", "name", "nameEn", "kind", "categoryId", "basePriceSatang", "images", "optionGroups", "variants", "recipe", "channelPrices", "availability", "stock"];
    const ARR = ["images", "optionGroups", "variants", "recipe", "channelPrices"];
    const shapeBad = rows.flatMap((r) => [
      ...KEYS.filter((k) => !(k in r)).map((k) => `ขาด ${k}`),
      ...ARR.filter((k) => k in r && !Array.isArray(r[k])).map((k) => `${k} ไม่ใช่ array`),
      ...["availability", "stock"].filter((k) => k in r && (typeof r[k] !== "object" || r[k] === null || Array.isArray(r[k]))).map((k) => `${k} ไม่ใช่ object`),
      ...(r.basePriceSatang !== null && !isInt(r.basePriceSatang) ? ["ราคาไม่ใช่ Int"] : []),
    ]);
    chk("S1.32", lf.ok && rows.length > 0 && shapeBad.length === 0, KEYS.join(","), lf.ok ? `${rows.length} แถว · ${[...new Set(shapeBad)].slice(0, 5).join(" · ") || "ทรงถูก"}` : `ปฏิเสธ: ${lf.err}`);
    // listForUnit เนื้อหา: สินค้าผูกสาขาอารีย์ต้องไม่โผล่ที่สีลม
    const ariP = await attempt(() => C.createProduct(ctxOwner, { name: `${TAG} เฉพาะอารีย์`, basePriceSatang: 1500, unitId: ARI }));
    const ariId = idOf(ariP.value);
    const rows2 = listOf((await attempt(() => C.listForUnit(ctxOwner, SILOM))).value);
    const rowsAri = listOf((await attempt(() => C.listForUnit(ctxOwner, ARI))).value);
    const cfActive = (await rowsOf("PosProduct", [cfT])).filter((p) => !p.archivedAt && p.systemId === sysC.POS && (p.unitId === null || p.unitId === SILOM)).map((p) => p.id);
    const ids2 = new Set(rows2.map(idOf));
    const missing = cfActive.filter((id) => !ids2.has(id));
    const crois = itemBySku(CF, "PQC-CF-CROIS");
    const croisRow = rows2.find((r) => r.invItemId === crois.id);
    const croisOnHand = (await q(`select "onHand" from "InvItem" where id = $1`, crois.id))[0]?.onHand;
    const optLink = await linkOf("MenuItem", fx.mOpt.id);
    const optRow = listOf((await attempt(() => C.listForUnit(ctxRsOwner, RMAIN))).value).find((r) => idOf(r) === optLink);
    const choicesOk = !!optRow && optRow.optionGroups?.length === 2 && optRow.optionGroups.every((g: Any) => Array.isArray(g.choices) && g.choices.length > 0 && g.choices.every((c: Any) => isInt(c.priceDelta ?? c.priceDeltaSatang)));
    chk("S1.33", ariP.ok && missing.length === 0 && !ids2.has(ariId) && rowsAri.some((r) => idOf(r) === ariId) && croisRow?.stock?.[SILOM] === croisOnHand && croisRow?.availability?.[SILOM] === true && choicesOk,
      `active ครบ ${cfActive.length} · ของอารีย์ไม่โผล่สีลม · stock[สีลม]=${croisOnHand} · availability=true · ตัวเลือก 2 กลุ่ม`,
      `ขาด ${missing.length} · อารีย์@สีลม ${ids2.has(ariId)} · อารีย์@อารีย์ ${rowsAri.some((r) => idOf(r) === ariId)}${ariP.ok ? "" : ` (สร้างไม่ได้: ${ariP.err})`} · stock ${croisRow?.stock?.[SILOM]} · avail ${croisRow?.availability?.[SILOM]} · ตัวเลือก ${choicesOk ? "✓" : `✗ (${optRow ? optRow.optionGroups?.length : "ไม่พบเมนู"})`}`);
    const bu = await attempt(() => C.byBarcode(ctxOwner, SILOM, `99${RAND}000`));
    chk("S1.34", idOf(bw.value) === waterP?.id && bu.ok && (bu.value === null || bu.value === undefined), "ตรงตัว · ไม่มี = null", `น้ำ ${idOf(bw.value) ?? bw.err} · ไม่มี → ${bu.ok ? JSON.stringify(bu.value ?? null) : bu.err}`);
    // ensureForInvItem
    const eInv = await mkInv(cfT, sysC.INVENTORY, "ensure"); await mkAp(cfT, sysC.ACCOUNT, eInv, 6100, 0);
    const e1 = await attempt(() => C.ensureForInvItem(ctxSysCf, eInv.id));
    const e2 = await attempt(() => C.ensureForInvItem(ctxSysCf, eInv.id));
    const eRows = await prodByInv(eInv.id);
    chk("S1.35", e1.ok && e2.ok && idOf(e1.value) === idOf(e2.value) && e2.value?.created === false && eRows.length === 1 && eRows[0]?.basePriceSatang === 6100 && eRows[0]?.vatRateBp === 0 && eRows[0]?.systemId === sysC.POS,
      "id เดิม · created=false · 1 แถว · 6100/0 · ระบบ POS", `${idOf(e1.value) ?? e1.err} / ${idOf(e2.value) ?? e2.err} created2=${e2.value?.created} · ${eRows.length} แถว · ${eRows[0]?.basePriceSatang}/${eRows[0]?.vatRateBp}`);
    // S1.37 ค้นฝั่ง server + แบ่งหน้า (ไม่มีเพดาน 200) — รูปแบบรับ: array เดียวครบ หรือ {items, nextCursor} ผ่าน opts {limit, cursor}
    const qName = await attempt(() => C.listForUnit(ctxOwner, SILOM, { q: "น้ำดื่ม" }));
    const qSku = await attempt(() => C.listForUnit(ctxOwner, SILOM, { q: "PQC-CF-WATER" }));
    const qBar = await attempt(() => C.listForUnit(ctxOwner, SILOM, { q: "8850999000015" }));
    const hasWater = (r: Try) => r.ok && listOf(r.value).some((x) => idOf(x) === waterP?.id) && !listOf(r.value).some((x) => idOf(x) === archP?.id);
    const narrow = (r: Try) => r.ok && listOf(r.value).length < 20;
    const seen = new Set<string>(); let dupSeen = 0; let pages = 0; let cursor: Any = undefined; let overLimit = false;
    for (;;) {
      const pg = await attempt(() => C.listForUnit(ctxOwner, SILOM, { limit: 50, ...(cursor !== undefined ? { cursor } : {}) }));
      if (!pg.ok) break;
      const items = listOf(pg.value); pages++;
      if (items.length > 50 && pages === 1 && !pg.value?.nextCursor) { for (const it of items) { const k = idOf(it) as string; if (seen.has(k)) dupSeen++; seen.add(k); } break; }
      if (items.length > 50) overLimit = true;
      for (const it of items) { const k = idOf(it) as string; if (seen.has(k)) dupSeen++; seen.add(k); }
      cursor = pg.value?.nextCursor ?? pg.value?.cursor ?? null;
      if (!cursor || items.length === 0 || pages > 40) break;
    }
    const bulkIds = new Set((await q<{ id: string }>(`select p.id from "PosProduct" p join "InvItem" i on i.id = p."invItemId" where i.sku like $1`, `${TAG}-bulk-%`)).map((r) => r.id));
    const bulkSeen = [...bulkIds].filter((id) => seen.has(id)).length;
    chk("S1.37", hasWater(qName) && hasWater(qSku) && hasWater(qBar) && narrow(qName) && narrow(qSku) && narrow(qBar) && bulkIds.size === 201 && bulkSeen === 201 && dupSeen === 0 && !overLimit,
      "ชื่อ/SKU/บาร์โค้ด เจอน้ำดื่ม (ผลแคบ) · เดินทุกหน้าเห็น bulk 201/201 · ไม่ซ้ำ · หน้าละ ≤50",
      `ชื่อ ${qName.ok ? listOf(qName.value).length : qName.err} · sku ${qSku.ok ? listOf(qSku.value).length : qSku.err} · barcode ${qBar.ok ? listOf(qBar.value).length : qBar.err} · bulk ${bulkSeen}/${bulkIds.size} · หน้า ${pages} · ซ้ำ ${dupSeen} · เกินหน้า ${overLimit}`);
    // S1.38 AuditLog
    const auditOf = async (id: string) => q<{ action: string; actorId: string | null; createdAt: Date }>(`select action, "actorId", "createdAt" from "AuditLog" where "tenantId" = $1 and "targetType" = 'PosProduct' and "targetId" = $2 and "createdAt" >= $3`, cfT, id, t0);
    // archive
    const ar1 = await attempt(() => C.archive(ctxOwner, pid)); const ar2 = await attempt(() => C.archive(ctxOwner, pid));
    const afterList = new Set(listOf((await attempt(() => C.listForUnit(ctxOwner, SILOM))).value).map(idOf));
    const pa = await prodById(pid);
    chk("S1.31", ar1.ok && ar2.ok && !!pa?.archivedAt && !afterList.has(pid), "soft · ไม่อยู่ใน list · กดซ้ำได้", `${ar1.ok ? "✓" : ar1.err} ${ar2.ok ? "✓" : ar2.err} · archivedAt ${pa?.archivedAt ? "✓" : "null"} · list ${afterList.has(pid)}`);
    const au = await auditOf(pid);
    const auActs = au.map((a) => a.action);
    chk("S1.38", au.length >= 4 && au.every((a) => a.actorId === cfOwner.userId && /^pos\.product\./.test(a.action)) && auActs.some((a) => /creat/.test(a)) && auActs.some((a) => /price/i.test(a)) && auActs.some((a) => /archiv/.test(a)),
      "≥4 แถว (create · update · price · archive) · actorId = เจ้าของ · action pos.product.*", `${au.length} แถว: ${[...new Set(auActs)].join(",") || "-"} · actor ${[...new Set(au.map((a) => a.actorId))].join(",") || "-"}`);

    // X2 ข้ามร้าน — เป้าหมาย = สินค้าชั่วคราวของร้านอาหาร
    const rsNew = await attempt(() => C.createProduct(ctxRsOwner, { name: `${TAG} resto target`, basePriceSatang: 5000 }));
    const rsPid = idOf(rsNew.value) as string; const rsP0 = await prodById(rsPid);
    const x1 = [
      await attempt(() => C.updateProduct(ctxOwner, rsPid, { name: "HACK" })),
      await attempt(() => C.setPrice(ctxOwner, rsPid, 1)),
      await attempt(() => C.archive(ctxOwner, rsPid)),
      await attempt(() => C.setPrice({ tenantId: cfT, systemId: sysR.POS, actorUserId: cfOwner.userId }, rsPid, 1)),
      await attempt(() => C.listForUnit({ tenantId: cfT, systemId: sysR.POS, actorUserId: cfOwner.userId }, RMAIN)).then((r) => (r.ok && listOf(r.value).length === 0 ? { ok: false } : r)),
    ];
    const rsP1 = await prodById(rsPid);
    chk("X2.1", !!rsP0 && x1.every((r) => !r.ok) && hashOf(rsP0) === hashOf(rsP1), "ปฏิเสธ 5/5 · แถวไม่เปลี่ยน", `${x1.map((r) => (r.ok ? "รับ" : "ปฏิเสธ")).join("/")} · ${hashOf(rsP0) === hashOf(rsP1) ? "ไม่เปลี่ยน" : "⚠️ ถูกแก้"}${rsP0 ? "" : ` · สร้างเป้าไม่ได้: ${rsNew.err}`}`);
    const xInv = await mkInv(rsT, sysR.INVENTORY, "xinv");
    const pc2 = await countProducts(cfT);
    const x2a = await attempt(() => C.ensureForInvItem(ctxSysCf, xInv.id));
    const x2b = await attempt(() => C.byBarcode(ctxOwner, SILOM, "8851959132012"));
    const x2c = await attempt(() => C.listForUnit(ctxOwner, RMAIN));
    const rsIds = new Set((await rowsOf("PosProduct", [rsT])).map((p) => p.id));
    const leakIds = listOf(listCf.value).map(idOf).filter((id) => rsIds.has(id as string));
    chk("X2.2", !x2a.ok && (await countProducts(cfT)) === pc2 && (await prodByInv(xInv.id)).length === 0 && x2b.ok && !x2b.value && (!x2c.ok || listOf(x2c.value).length === 0) && leakIds.length === 0,
      "ensure ปฏิเสธ · บาร์โค้ดร้านอื่น null · list สาขาร้านอื่น ปฏิเสธ/ว่าง · ไม่รั่ว", `ensure ${x2a.ok ? "รับ" : "ปฏิเสธ"} · barcode ${x2b.ok ? JSON.stringify(idOf(x2b.value) ?? null) : x2b.err} · list ${x2c.ok ? listOf(x2c.value).length + " แถว" : "ปฏิเสธ"} · รั่ว ${leakIds.length}`);
    const u1 = await attempt(() => C.listForUnit(ctxCashier, ARI));
    const u2 = await attempt(() => C.byBarcode(ctxCashier, ARI, "8850999000015"));
    const u3 = await attempt(() => C.listForUnit(ctxCashier, SILOM));
    chk("X2.3", (!u1.ok || listOf(u1.value).length === 0) && (!u2.ok || !u2.value) && u3.ok && listOf(u3.value).length > 0, "อารีย์ ปฏิเสธ · สีลม ได้", `อารีย์ list ${u1.ok ? listOf(u1.value).length : "ปฏิเสธ"} · barcode ${u2.ok ? (u2.value ? "เจอ" : "null") : "ปฏิเสธ"} · สีลม ${u3.ok ? listOf(u3.value).length : u3.err}`);

    // X3 สิทธิ์ — เป้าหมาย = สินค้าชั่วคราวใหม่ของร้านกาแฟ
    const tgt = await attempt(() => C.createProduct(ctxOwner, { name: `${TAG} perm`, basePriceSatang: 2000 }));
    const tPid = idOf(tgt.value) as string; const tP = await prodById(tPid);
    const c1 = await attempt(() => C.setPrice(ctxCashier, tPid, 1));
    chk("X3.1", !!tP && !c1.ok && (await prodById(tPid))?.basePriceSatang === 2000, "ปฏิเสธ · ราคา 2000", `${c1.ok ? "รับ" : "ปฏิเสธ"} · ${(await prodById(tPid))?.basePriceSatang}`);
    const c2 = await withCashierPerm({ "pos.product.setPrice": true }, () => attempt(() => C.setPrice(ctxCashier, tPid, 2100))); const pStaff = (await prodById(tPid))?.basePriceSatang;
    const c3 = await attempt(() => C.setPrice(ctxOwner, tPid, 2200));
    chk("X3.2", c2.ok && pStaff === 2100 && c3.ok && (await prodById(tPid))?.basePriceSatang === 2200, "staff+สิทธิ์ 2100 · owner 2200", `${c2.ok ? pStaff : c2.err} · ${c3.ok ? (await prodById(tPid))?.basePriceSatang : c3.err}`);
    const pc3 = await countProducts(cfT); const snapT = hashOf(await prodById(tPid));
    const m1 = await attempt(() => C.createProduct(ctxCashier, { name: `${TAG} cashier-new`, basePriceSatang: 100 }));
    const m2 = await attempt(() => C.updateProduct(ctxCashier, tPid, { name: "HACK" }));
    const m3 = await attempt(() => C.archive(ctxCashier, tPid));
    chk("X3.3", !m1.ok && !m2.ok && !m3.ok && (await countProducts(cfT)) === pc3 && hashOf(await prodById(tPid)) === snapT, "ปฏิเสธ 3/3 · ไม่เขียน", `${[m1, m2, m3].map((r) => (r.ok ? "รับ" : "ปฏิเสธ")).join("/")}`);

    // X6 race บน connection แยก
    const notes2: string[] = []; let ok2 = true;
    for (let round = 1; round <= 3; round++) {
      const inv = await mkInv(cfT, sysC.INVENTORY, `race${round}`);
      const rs = await Promise.all(Array.from({ length: 10 }, (_, i) => attempt(() => C.ensureForInvItem(ctxSysCf, inv.id, lane(i)))));
      const rowsR = await prodByInv(inv.id);
      const idsR = new Set(rs.filter((r) => r.ok).map((r) => idOf(r.value)));
      const good = rowsR.length === 1 && rs.every((r) => r.ok) && idsR.size === 1 && idsR.has(rowsR[0]?.id);
      ok2 &&= good; notes2.push(`รอบ${round}: ${rowsR.length} แถว · ok ${rs.filter((r) => r.ok).length}/10 · id ${idsR.size}${rs.find((r) => !r.ok)?.err ? ` · ${rs.find((r) => !r.ok)?.err}` : ""}`);
    }
    chk("X6.2", ok2, "1 แถว · 10/10 · id เดียว ทุกรอบ", notes2.join(" · "));
    const prices = Array.from({ length: 10 }, (_, i) => 3000 + i);
    const rp = await Promise.all(prices.map((v, i) => attempt(() => C.setPrice(ctxOwner, tPid, v, lane(i)))));
    const fin = (await prodById(tPid))?.basePriceSatang;
    chk("X6.3", rp.every((r) => r.ok) && prices.includes(fin) && (await q(`select id from "PosProduct" where id = $1`, tPid)).length === 1, "10/10 · ราคาสุดท้าย ∈ ค่าที่ส่ง", `ok ${rp.filter((r) => r.ok).length}/10 · ${fin} · ${rp.find((r) => !r.ok)?.err ?? ""}`);
    await attempt(() => C.updateProduct(ctxOwner, tPid, { nameEn: "orig" }));
    await attempt(() => C.setPrice(ctxOwner, tPid, 1));
    const mix = await Promise.all(Array.from({ length: 10 }, (_, i) => (i % 2 === 0 ? attempt(() => C.setPrice(ctxOwner, tPid, 4000 + i, lane(i))) : attempt(() => C.updateProduct(ctxOwner, tPid, { nameEn: `${TAG} en${i}` }, lane(i))))));
    const fp = await prodById(tPid);
    chk("X6.4", mix.every((r) => r.ok) && [4000, 4002, 4004, 4006, 4008].includes(fp?.basePriceSatang) && /en[13579]$/.test(fp?.nameEn ?? ""), "ราคา ∈ 400x · nameEn ∈ enX", `ok ${mix.filter((r) => r.ok).length}/10 · ${fp?.basePriceSatang} · ${fp?.nameEn}`);
    // X8 ไม่เชื่อมบัญชี
    const naP = (await prodByInv(fx.costOnly.id))[0];
    const apC0 = await countWhere("AccountProduct", cfT);
    const na = await attempt(() => C.setPrice(ctxOwner, naP?.id, 5150));
    const naInv = (await q(`select "accountProductId" from "InvItem" where id = $1`, fx.costOnly.id))[0];
    chk("X8.1", na.ok && (await prodById(naP?.id))?.basePriceSatang === 5150 && (await countWhere("AccountProduct", cfT)) === apC0 && naInv?.accountProductId === null,
      "5150 · AccountProduct ไม่เพิ่ม · ยังไม่ผูก", `${na.ok ? (await prodById(naP?.id))?.basePriceSatang : na.err} · AP +${(await countWhere("AccountProduct", cfT)) - apC0} · ${naInv?.accountProductId ?? "null"}`);
  });

  // ═══ S2 · P1.1b dual-write (guard แยก) ═══
  const s2Ids = [...S2_IDS].map((id) => id.replace("P1.1-", ""));
  if (!p11bStarted && !FORCE) {
    s2Skipped = `P1.1b ยังไม่เริ่ม (ผู้เขียนเดิม ${LEGACY_WRITERS.length} ไฟล์ยังไม่ import pos/catalog) — ข้าม ${s2Ids.length} ข้อ`;
    console.log(`  ⏭️  ${s2Skipped}`);
  } else {
    await section("dual-write", s2Ids, async () => {
      const C = catalog;
      if (!C || !menu || !shop || !reg) throw new Error("ไม่มี catalog.ts หรือโมดูลเดิม");
      const inventory = await load("@/lib/modules/inventory/service");
      const accountF = await load("@/lib/modules/account");
      const accProduct = await load("@/lib/modules/account/product");
      const invLink = await load("@/lib/modules/account/inventory-link");
      const proposals = await load("@/lib/ai/proposals");
      const booking = await load("@/lib/modules/booking/service");
      const fit = await load("./fitness-pos.mts");
      // ── ร้านอาหาร ──
      const p0 = await countProducts(rsT);
      const r1 = await menu.createItem(rsT, RMAIN, { categoryId: rsCat.id, stationId: rsStation.id, name: `${TAG} dw-menu`, basePrice: 7300, optionGroupIds: [fx.g1.id] });
      const l1 = r1?.id ? await linkOf("MenuItem", r1.id) : null; const pp1 = await prodById(l1);
      const pog1 = l1 ? await q(`select "groupId" from "PosProductOptionGroup" where "productId" = $1`, l1) : [];
      const pcat = pp1?.categoryId ? (await q(`select name from "PosCategory" where id = $1`, pp1.categoryId))[0] : null;
      chk("S2.1", r1?.ok && pp1?.kind === "MENU" && pp1?.unitId === RMAIN && pp1?.basePriceSatang === 7300 && pcat?.name === rsCat.name && pog1.length === 1 && pog1[0].groupId === fx.g1.id && (await countProducts(rsT)) === p0 + 1,
        "MENU · unit main · 7300 · หมวดเดิม · g1 · +1", `${pp1?.kind} ${pp1?.unitId === RMAIN ? "main" : pp1?.unitId} ${pp1?.basePriceSatang} · ${pcat?.name ?? "-"} · og ${pog1.length} · +${(await countProducts(rsT)) - p0}`);
      await menu.updateItem(rsT, RMAIN, r1.id, { basePrice: 7600, name: `${TAG} dw-menu2`, nameEn: `${TAG} dw-en` });
      const pp2 = await prodById(l1);
      chk("S2.2", pp2?.basePriceSatang === 7600 && pp2?.name === `${TAG} dw-menu2` && pp2?.nameEn === `${TAG} dw-en` && (await countProducts(rsT)) === p0 + 1, "7600 · ชื่อใหม่ · ไม่เพิ่มแถว", `${pp2?.basePriceSatang} · ${pp2?.name} · ${pp2?.nameEn}`);
      await menu.setItemOptionGroups(rsT, RMAIN, r1.id, [fx.g2.id, fx.g1.id]);
      const pog2 = (await q(`select "groupId", "sortOrder" from "PosProductOptionGroup" where "productId" = $1`, l1)).map((x: Any) => `${x.groupId === fx.g2.id ? "g2" : "g1"}:${x.sortOrder}`).sort().join(",");
      chk("S2.3", pog2 === "g1:1,g2:0", "g1:1,g2:0", pog2 || "∅");
      const dup = await menu.duplicateItem(rsT, RMAIN, r1.id);
      const ld = dup?.id ? await linkOf("MenuItem", dup.id) : null;
      chk("S2.4", !!ld && ld !== l1 && (await prodById(ld))?.basePriceSatang === 7600 && (await countProducts(rsT)) === p0 + 2, "สำเนามี PosProduct ใหม่ 7600", `${ld ?? "ไม่มีลิงก์"}${ld === l1 ? " (แชร์กับต้นฉบับ!)" : ""} · ${(await prodById(ld))?.basePriceSatang}`);
      await menu.archiveItem(rsT, RMAIN, dup.id);
      chk("S2.5", !!(await prodById(ld))?.archivedAt && !(await prodById(l1))?.archivedAt, "สำเนาเก็บถาวร · ต้นฉบับไม่", `${(await prodById(ld))?.archivedAt ? "✓" : "✗"} · ${(await prodById(l1))?.archivedAt ? "ต้นฉบับโดนด้วย" : "✓"}`);
      await menu.setItemStock(rsT, RMAIN, r1.id, { dailyStockQty: 12 });
      chk("S2.6", (await prodById(l1))?.dailyStockQty === 12, "12", String((await prodById(l1))?.dailyStockQty));
      // ── เว็บร้าน ──
      const pc0 = await countProducts(cfT);
      const sp = await shop.createProduct({ tenantId: cfT, unitId: SILOM }, { name: `${TAG} dw-shop`, priceSatang: 4321 });
      const ls = sp?.id ? await linkOf("ShopProduct", sp.id) : null; const pls = await prodById(ls);
      chk("S2.7", pls?.basePriceSatang === 4321 && pls?.unitId === SILOM && (await countProducts(cfT)) === pc0 + 1, "4321 · unit สีลม · +1", `${pls?.basePriceSatang ?? "ไม่มีลิงก์"} · +${(await countProducts(cfT)) - pc0}`);
      const dwInv = await mkInv(cfT, sysC.INVENTORY, "dw-inv"); const dwAp = await mkAp(cfT, sysC.ACCOUNT, dwInv, 4000);
      const ens = await attempt(() => C.ensureForInvItem(ctxSysCf, dwInv.id));
      const pc1 = await countProducts(cfT);
      const sp2 = await shop.createProduct({ tenantId: cfT, unitId: SILOM }, { name: `${TAG} dw-shop2`, priceSatang: 9999, invItemId: dwInv.id });
      const ls2 = sp2?.id ? await linkOf("ShopProduct", sp2.id) : null;
      chk("S2.8", ens.ok && ls2 === idOf(ens.value) && (await countProducts(cfT)) === pc1, "ชี้ตัวเดิม · +0", `${ls2 === idOf(ens.value) ? "ตัวเดิม" : ls2} · +${(await countProducts(cfT)) - pc1}`);
      await shop.updateProduct({ tenantId: cfT, unitId: SILOM }, sp.id, { priceSatang: 4444 });
      await shop.updateProduct({ tenantId: cfT, unitId: SILOM }, sp2.id, { priceSatang: 9876 });
      chk("S2.9", (await prodById(ls))?.basePriceSatang === 4444 && (await prodById(ls2))?.basePriceSatang === 4000, "เว็บล้วน 4444 · แชร์คง 4000", `${(await prodById(ls))?.basePriceSatang} · ${(await prodById(ls2))?.basePriceSatang}`);
      // ── บัญชี / คลัง / AI / จอง ──
      const sInv = await mkInv(cfT, sysC.INVENTORY, "dw-setprice");
      await attempt(() => C.ensureForInvItem(ctxSysCf, sInv.id));
      const sp3 = await reg.setItemSalePrice(cfT, sysC.POS, sInv.id, 3900);
      chk("S2.10", sp3?.ok && (await prodByInv(sInv.id))[0]?.basePriceSatang === 3900, "3900", `${sp3?.ok ? "" : sp3?.reason} ${(await prodByInv(sInv.id))[0]?.basePriceSatang}`);
      await accountF.updateAccountProductSalePrice(cfT, dwAp.id, 4100);
      const a1 = (await prodByInv(dwInv.id))[0]?.basePriceSatang;
      const up2 = await accProduct.updateProduct(cfT, sysC.ACCOUNT, dwAp.id, { name: dwAp.name, salePrice: 4200, vatRateBp: 0 });
      const a2 = (await prodByInv(dwInv.id))[0];
      chk("S2.11", a1 === 4100 && up2?.ok && a2?.basePriceSatang === 4200 && a2?.vatRateBp === 0, "4100 → 4200/vat 0", `${a1} → ${up2?.ok ? `${a2?.basePriceSatang}/${a2?.vatRateBp}` : up2?.reason}`);
      const up3 = await accProduct.updateProduct(cfT, sysC.ACCOUNT, dwAp.id, { name: dwAp.name, salePrice: 4200, vatRateBp: 0, posPrice: 3800 });
      chk("S2.25", up3?.ok && (await prodByInv(dwInv.id))[0]?.basePriceSatang === 3800, "3800 (posPrice ชนะ salePrice)", `${up3?.ok ? (await prodByInv(dwInv.id))[0]?.basePriceSatang : up3?.reason}`);
      await accProduct.updateProduct(cfT, sysC.ACCOUNT, dwAp.id, { name: dwAp.name, salePrice: 4200, vatRateBp: 0, posPrice: null });
      const ci = await inventory.createItem({ tenantId: cfT, systemId: sysC.INVENTORY }, { sku: `${TAG}-ci`, name: `${TAG} ci` });
      const cs = await inventory.createItem({ tenantId: cfT, systemId: sysC.INVENTORY }, { sku: `${TAG}-cs`, name: `${TAG} cs`, kind: "SERVICE", priceSatang: 8800 });
      const pci = (await prodByInv(ci.id))[0]; const pcs = (await prodByInv(cs.id))[0];
      chk("S2.12", !!pci && pci.basePriceSatang === null && pcs?.kind === "SERVICE" && pcs?.basePriceSatang === 8800, "PRODUCT null · SERVICE 8800", `${pci ? pci.basePriceSatang : "ไม่มี"} · ${pcs ? `${pcs.kind} ${pcs.basePriceSatang}` : "ไม่มี"}`);
      await inventory.updateItem({ tenantId: cfT, systemId: sysC.INVENTORY }, cs.id, { priceSatang: 9100 });
      chk("S2.20", (await prodByInv(cs.id))[0]?.basePriceSatang === 9100, "9100", String((await prodByInv(cs.id))[0]?.basePriceSatang));
      const lnkAp = await P.accountProduct.create({ data: { tenantId: cfT, systemId: sysC.ACCOUNT, name: `${TAG} link-ap`, salePrice: 2700, vatRateBp: 700, type: "GOODS" } });
      const lk = await invLink.linkProductToItem({ tenantId: cfT, systemId: sysC.ACCOUNT }, lnkAp.id, { createItem: { sku: `${TAG}-lnk` } });
      const lkP = lk?.ok ? (await prodByInv(lk.itemId))[0] : null;
      chk("S2.21", lk?.ok && lkP?.basePriceSatang === 2700 && lkP?.systemId === sysC.POS, "PosProduct 2700", lk?.ok ? `${lkP ? lkP.basePriceSatang : "ไม่มีแถว"}` : lk?.reason);
      const ownerM = { role: cfOwner.role, unitAccess: cfOwner.unitAccess, permissions: cfOwner.permissions };
      const ai = await attempt(() => proposals.runKind(ownerM, cfT, "inventory_create_item", { sku: `${TAG}-ai`, name: `${TAG} ai` }, `${TAG}-ai-run`, cfOwner.userId));
      const aiInv = (await q(`select id from "InvItem" where "tenantId" = $1 and sku = $2`, cfT, `${TAG}-ai`))[0];
      chk("S2.22", ai.ok && !!aiInv && (await prodByInv(aiInv.id)).length === 1, "InvItem + PosProduct 1", `${ai.ok ? "" : ai.err} · inv ${aiInv ? "✓" : "✗"} · prod ${aiInv ? (await prodByInv(aiInv.id)).length : "-"}`);
      const bs = await P.bookingService.create({ data: { tenantId: cfT, unitId: SILOM, name: `${TAG} บริการเก่า`, durationMin: 30, priceSatang: 6600 } });
      const im = await attempt(() => booking.importServicesToCatalog({ tenantId: cfT, unitId: SILOM }));
      const bsItem = (await q(`select "itemId" from "BookingService" where id = $1`, bs.id))[0]?.itemId;
      const bsP = bsItem ? (await prodByInv(bsItem))[0] : null;
      chk("S2.23", im.ok && !!bsP && bsP.kind === "SERVICE" && bsP.basePriceSatang === 6600, "SERVICE 6600", `${im.ok ? "" : im.err} · ${bsP ? `${bsP.kind} ${bsP.basePriceSatang}` : "ไม่มีแถว"}`);
      // ── ย้อนทาง ──
      const v1 = await attempt(() => C.setPrice(ctxOwner, idOf(ens.value), 4700));
      const apNow = (await q(`select "salePrice", "posPrice" from "AccountProduct" where id = $1`, dwAp.id))[0];
      const regNow = ((await reg.posCatalog(cfT, sysC.INVENTORY)) as Any[]).find((c) => c.id === dwInv.id)?.priceSatang;
      chk("S2.13", v1.ok && (apNow?.posPrice ?? apNow?.salePrice) === 4700 && regNow === 4700, "AccountProduct 4700 · หน้าขายเดิม 4700", `${v1.ok ? "" : v1.err} AP ${apNow?.salePrice}/${apNow?.posPrice} · reg ${regNow}`);
      const v2 = await attempt(() => C.setPrice(ctxRsOwner, l1, 8100));
      const mNow = (await q(`select "basePrice" from "MenuItem" where id = $1`, r1.id))[0]?.basePrice;
      const om = ((await menu.orderingMenu(rsT, RMAIN)) as Any[]).flatMap((c) => c.items).find((i: Any) => i.id === r1.id)?.basePrice;
      chk("S2.14", v2.ok && mNow === 8100 && om === 8100, "MenuItem 8100 · orderingMenu 8100", `${v2.ok ? "" : v2.err} ${mNow} · ${om}`);
      const v3 = await attempt(() => C.setPrice(ctxOwner, ls, 4555));
      const v4 = await attempt(() => C.updateProduct(ctxOwner, ls, { name: `${TAG} dw-shop-renamed` }));
      const shNow = ((await shop.listProducts({ tenantId: cfT, unitId: SILOM }, { activeOnly: true })) as Any[]).find((x) => x.id === sp.id);
      chk("S2.15", v3.ok && v4.ok && shNow?.priceSatang === 4555 && shNow?.name === `${TAG} dw-shop-renamed`, "4555 · ชื่อใหม่", `${shNow?.priceSatang} · ${shNow?.name}`);
      const v6 = await attempt(() => C.setPrice(ctxOwner, pcs?.id, 9300));
      const csNow = (await q(`select "priceSatang" from "InvItem" where id = $1`, cs.id))[0]?.priceSatang;
      await P.bookingService.create({ data: { tenantId: cfT, unitId: SILOM, name: `${TAG} cs-proj`, durationMin: 30, priceSatang: 1, itemId: cs.id } });
      const roster = await attempt(() => booking.serviceRoster({ tenantId: cfT, unitId: SILOM }));
      const rRow = roster.ok ? (roster.value.rows as Any[]).find((r) => r.itemId === cs.id) : null;
      const bsNow = (await q(`select "priceSatang" from "BookingService" where "itemId" = $1 and "tenantId" = $2`, cs.id, cfT))[0]?.priceSatang;
      chk("S2.24", v6.ok && csNow === 9300 && rRow?.priceSatang === 9300 && bsNow === 9300, "InvItem 9300 · roster 9300 · BookingService 9300", `${v6.ok ? "" : v6.err} inv ${csNow} · roster ${rRow?.priceSatang ?? (roster.ok ? "ไม่พบ" : roster.err)} · bs ${bsNow}`);
      const pBeforeSame = [await countProducts(), await countWhere("AccountProduct", cfT), await countWhere("InvItem", cfT)];
      for (let k = 0; k < 2; k++) {
        await menu.updateItem(rsT, RMAIN, r1.id, { basePrice: 8100 });
        await shop.updateProduct({ tenantId: cfT, unitId: SILOM }, sp.id, { priceSatang: 4555 });
        await accountF.updateAccountProductSalePrice(cfT, dwAp.id, 4700);
        await inventory.updateItem({ tenantId: cfT, systemId: sysC.INVENTORY }, cs.id, { priceSatang: 9300 });
      }
      const pAfterSame = [await countProducts(), await countWhere("AccountProduct", cfT), await countWhere("InvItem", cfT)];
      chk("S2.17", hashOf(pBeforeSame) === hashOf(pAfterSame), JSON.stringify(pBeforeSame), JSON.stringify(pAfterSame));
      const cokeP = (await prodByInv(fx.coke.id))[0];
      await menu.updateItem(rsT, RMAIN, fx.mCoke.id, { basePrice: 2600 });
      chk("S2.18", (await prodById(cokeP?.id))?.basePriceSatang === 2000, "โค้กคง 2000", String((await prodById(cokeP?.id))?.basePriceSatang));
      // ── หมวด / ตัวเลือก ──
      const cc = await menu.createCategory(rsT, RMAIN, { name: `${TAG} หมวดใหม่`, nameEn: `${TAG} newcat` });
      const pcN = (await q(`select * from "PosCategory" where "tenantId" = $1 and name = $2`, rsT, `${TAG} หมวดใหม่`));
      const ac = cc?.ok ? await menu.archiveCategory(rsT, RMAIN, cc.id) : null;
      const pcA = (await q(`select "archivedAt" from "PosCategory" where "tenantId" = $1 and name = $2`, rsT, `${TAG} หมวดใหม่`))[0];
      chk("S2.26", cc?.ok && pcN.length === 1 && pcN[0].nameEn === `${TAG} newcat` && ac?.ok && !!pcA?.archivedAt, "PosCategory 1 แถว → archived", `${pcN.length} แถว · archived ${pcA?.archivedAt ? "✓" : "✗"}`);
      const og = await menu.createOptionGroup(rsT, RMAIN, { name: `${TAG} g3`, minSelect: 0, maxSelect: 1, choices: [{ name: "หวานน้อย", priceDelta: 0 }, { name: "เพิ่มช็อต", priceDelta: 2500 }] });
      await menu.setItemOptionGroups(rsT, RMAIN, r1.id, [fx.g2.id, fx.g1.id, og.id]);
      const findRow = async () => listOf((await attempt(() => C.listForUnit(ctxRsOwner, RMAIN))).value).find((r) => idOf(r) === l1);
      const withG3 = (await findRow())?.optionGroups?.find((g: Any) => (g.id ?? g.groupId) === og.id);
      const deltaOk = !!withG3 && (withG3.choices as Any[]).some((c) => (c.priceDelta ?? c.priceDeltaSatang) === 2500);
      await menu.archiveOptionGroup(rsT, RMAIN, og.id);
      const goneG3 = !(await findRow())?.optionGroups?.some((g: Any) => (g.id ?? g.groupId) === og.id);
      chk("S2.27", og?.ok && deltaOk && goneG3, "เห็น g3 (+25.00) แล้วหายเมื่อเก็บถาวร", `${og?.ok ? "" : og?.reason} เห็น ${deltaOk} · หาย ${goneG3}`);
      // ── race ──
      const notes3: string[] = []; let ok3 = true;
      for (let round = 1; round <= 3; round++) {
        await Promise.all(Array.from({ length: 10 }, (_, i) => (i % 2 === 0
          ? attempt(() => menu.updateItem(rsT, RMAIN, r1.id, { basePrice: 9000 + round * 10 + i }))
          : attempt(() => C.setPrice(ctxRsOwner, l1, 9500 + round * 10 + i, lane(i))))));
        const mb = (await q(`select "basePrice" from "MenuItem" where id = $1`, r1.id))[0]?.basePrice;
        const pb = (await prodById(l1))?.basePriceSatang;
        ok3 &&= mb === pb; notes3.push(`รอบ${round}: menu ${mb} / pos ${pb}`);
      }
      chk("X6.5", ok3, "เท่ากันทุกรอบ", notes3.join(" · "));
      const v5 = await attempt(() => C.archive(ctxRsOwner, l1));
      const mi = (await q(`select status, "archivedAt" from "MenuItem" where id = $1`, r1.id))[0];
      const inOm = ((await menu.orderingMenu(rsT, RMAIN)) as Any[]).flatMap((c) => c.items).some((i: Any) => i.id === r1.id);
      chk("S2.16", v5.ok && mi?.status === "ARCHIVED" && !!mi?.archivedAt && !inOm, "ARCHIVED · ไม่อยู่ใน orderingMenu", `${v5.ok ? "" : v5.err} ${mi?.status} · ${inOm ? "ยังอยู่" : "หาย"}`);
      const base = fit?.CATALOG_WRITER_BASELINE as Map<string, string> | undefined;
      const writers = typeof fit?.scanCatalogWriters === "function" ? (fit.scanCatalogWriters(process.cwd()) as { file: string }[]) : null;
      const others = (writers ?? []).filter((w) => w.file !== "src/lib/modules/pos/catalog.ts").map((w) => w.file);
      chk("S2.19", !!base && base.size === 0 && !!writers && others.length === 0, "baseline ว่าง · ผู้เขียน = catalog.ts", `baseline ${base?.size ?? "?"} · ผู้เขียนอื่น: ${others.join(",") || "-"}`);
    });
  }

  // ═══ X9 outbox ═══
  await section("outbox", ["X9.1"], async () => {
    const evs = await q<{ type: string }>(`select distinct type from "OutboxEvent" where "tenantId" = any($1::text[]) and "createdAt" >= $2 and type like 'pos.%'`, QC_TIDS, t0);
    const cons = (await load("@/lib/outbox-consumers"))?.consumers as Record<string, unknown> | undefined;
    const noCons = evs.map((e) => e.type).filter((t) => !cons || !(t in cons));
    chk("X9.1", !!cons && noCons.length === 0, "ทุกชนิดมี consumer", `ชนิดที่เกิด: ${evs.map((e) => e.type).join(",") || "ไม่มี"} · ไม่มี consumer: ${noCons.join(",") || "-"}`);
  });
  exitCode = 0;
} catch (e) {
  console.log(`  ⚠️  ล้มนอกส่วน: ${e instanceof Error ? e.stack?.split("\n").slice(0, 3).join(" | ") : String(e)}`);
} finally {
  // ═══ คืนสภาพ (= rollback story ปลายทาง) ═══
  const leftover: string[] = [];
  const run = async (label: string, sql: string, ...params: unknown[]) => {
    try { await ex(sql, ...params); } catch (e) { leftover.push(`${label}: ${firstLine(e).slice(0, 120)}`); }
  };
  try {
    TABLES = await tableSet();
    const fkRefs = async (table: string) =>
      q<{ tbl: string; col: string; nullable: string }>(`
        select cl.relname as tbl, a.attname as col, c2.is_nullable as nullable
        from pg_constraint con join pg_class cl on cl.oid = con.conrelid join pg_class rf on rf.oid = con.confrelid
        join pg_attribute a on a.attrelid = con.conrelid and a.attnum = any(con.conkey)
        join information_schema.columns c2 on c2.table_schema='public' and c2.table_name = cl.relname and c2.column_name = a.attname
        where con.contype = 'f' and rf.relname = $1`, table);
    /** ลบแถว (เฉพาะร้าน QC) + แถวที่อ้างถึงด้วย FK: nullable → set null · ไม่ใช่ → ลบตาม (ลึก 3 ชั้น) */
    const purge = async (table: string, ids: string[], depth = 0): Promise<void> => {
      if (!ids.length || !TABLES.has(table)) return;
      for (const r of await fkRefs(table)) {
        if (r.tbl === table) continue;
        if (r.nullable === "YES") await run(`null ${r.tbl}.${r.col}`, `update "${r.tbl}" set "${r.col}" = null where "${r.col}" = any($1::text[])`, ids);
        else if (depth < 3) {
          const cols = await colInfo(r.tbl);
          const ref = (await q<{ id: string }>(`select id from "${r.tbl}" where "${r.col}" = any($1::text[])${cols.has("tenantId") ? ` and "tenantId" = any($2::text[])` : ""}`, ids, ...(cols.has("tenantId") ? [QC_TIDS] : []))).map((x) => x.id);
          await purge(r.tbl, ref, depth + 1);
        }
      }
      const cols = await colInfo(table);
      await run(`delete ${table}`, `delete from "${table}" where id = any($1::text[])${cols.has("tenantId") ? ` and "tenantId" = any($2::text[])` : ""}`, ids, ...(cols.has("tenantId") ? [QC_TIDS] : []));
    };
    const fresh = (now: Snap, base: Snap, t: string) => [...(now[t]?.keys() ?? [])].filter((id) => !base[t]?.has(id));
    // 0) สิทธิ์แคชเชียร์กลับค่าเดิม + AuditLog ที่ชี้แถวชั่วคราว (ต้องเก็บ id ก่อนลบแถว)
    try { await P.membership.update({ where: { id: cashierMb }, data: { permissions: cashierPerm0 } }); } catch (e) { leftover.push(`membership: ${firstLine(e)}`); }
    {
      const n0 = await snapNew(); const l0 = await snapLegacyLinks();
      const freshAll = [...NEW_TABLES.flatMap((t) => fresh(n0, snapNew0, t)), ...Object.keys(LEGACY).flatMap((t) => fresh(l0, snapLegacy0, t))];
      if (TABLES.has("AuditLog"))
        await run("audit", `delete from "AuditLog" where "tenantId" = any($1::text[]) and "createdAt" >= $2 and ("targetId" = any($3::text[]) or coalesce("before"::text, '') like $4 or coalesce("after"::text, '') like $4)`, QC_TIDS, t0, freshAll, `%${TAG}%`);
    }
    // 1) ตารางใหม่: ลบแถวที่ไม่มีใน snapshot0 (ลูกก่อนแม่) + ปลดคอลัมน์เชื่อม
    const nowNew = await snapNew();
    for (const t of ["PosProductOptionGroup", "RecipeLine", "PosProductChannelPrice", "PosVariant", "PosProduct", "PosCategory"]) {
      const ids = fresh(nowNew, snapNew0, t);
      if (t === "PosProduct" && ids.length) {
        for (const [lt, lc] of [["MenuItem", "posProductId"], ["ShopProduct", "posProductId"], ["ShopOrderLine", "posProductId"], ["PosSaleLine", "productId"], ["RestaurantOrderItem", "productId"]])
          if (TABLES.has(lt)) await run(`unlink ${lt}`, `update "${lt}" set "${lc}" = null where "${lc}" = any($1::text[])`, ids);
      }
      await purge(t, ids);
    }
    // 2) ตารางเดิม: ลบแถวใหม่ (fixtures + ที่ผู้เขียนเดิม/catalog สร้างระหว่างรัน)
    const nowLeg = await snapLegacyLinks();
    for (const t of ["MenuItemOptionGroup", "MenuOptionChoice", "MenuOptionGroup", "MenuItem", "ShopProduct", "BookingService", "MenuCategory", "KdsStation", "InvItemImage", "InvLocationStock", "InvMovement"])
      await purge(t, fresh(nowLeg, snapLegacy0, t));
    const newAp = fresh(nowLeg, snapLegacy0, "AccountProduct");
    if (newAp.length) await run("unlink InvItem.accountProductId", `update "InvItem" set "accountProductId" = null where "accountProductId" = any($1::text[]) and "tenantId" = any($2::text[])`, newAp, QC_TIDS);
    await purge("InvItem", fresh(nowLeg, snapLegacy0, "InvItem"));
    await purge("AccountProduct", newAp);
    await purge("AppSystemUnit", fresh(nowLeg, snapLegacy0, "AppSystemUnit"));
    await purge("BusinessUnit", fresh(nowLeg, snapLegacy0, "BusinessUnit"));
    // 3) คอลัมน์เชื่อมของแถวเดิมที่ชี้ PosProduct ที่ไม่มีก่อนรัน
    if (TABLES.has("PosProduct")) {
      const pre = new Set([...(snapNew0.PosProduct?.keys() ?? [])]);
      for (const t of ["MenuItem", "ShopProduct"]) {
        const rows = await q<{ id: string; p: string | null }>(`select id, "posProductId" as p from "${t}" where "tenantId" = any($1::text[]) and "posProductId" is not null`, QC_TIDS);
        const stray = rows.filter((r) => r.p && !pre.has(r.p)).map((r) => r.id);
        if (stray.length) await run(`null ${t}.posProductId`, `update "${t}" set "posProductId" = null where id = any($1::text[])`, stray);
      }
    }
    // 4) outbox ที่อ้างแถวชั่วคราวของรันนี้ (ป้าย TAG ในชื่อ/sku)
    await run("outbox", `delete from "OutboxEvent" where "tenantId" = any($1::text[]) and "createdAt" >= $2 and payload::text like $3`, QC_TIDS, t0, `%${TAG}%`);
  } catch (e) {
    leftover.push(`cleanup: ${firstLine(e)}`);
  }
  // ═══ S1.36 rollback ปลายทาง ═══
  try {
    const dl = diffSnap(snapLegacy0, await snapLegacyLinks());
    const dn = diffSnap(snapNew0, await snapNew());
    const after = await rowCounts();
    chk("S1.36", Object.keys(dl).length === 0 && Object.keys(dn).length === 0 && leftover.length === 0, "ตารางเดิม/ใหม่ เท่าก่อนรัน · ไม่มีของค้าง",
      `เดิม: ${diffText(dl)} · ใหม่: ${diffText(dn)}${leftover.length ? ` · ค้าง: ${leftover.slice(0, 3).join(" | ")}` : ""}`);
    console.log(`ROWCOUNTS_AFTER ${JSON.stringify(after)} · ${hashOf(after) === hashOf(countsBefore) ? "เท่าเดิม" : "⚠️ ต่าง"}`);
  } catch (e) {
    chk("S1.36", false, "ตรวจได้", e instanceof Error ? e.message : String(e));
  }
  for (const c of clients) await c.$disconnect().catch(() => null);
}

// ข้อที่ยังไม่ถูกรายงาน (ส่วนที่ควรรันแต่ไม่ถึง) = แดง · กลุ่ม S2 ที่ข้ามโดยเจตนาไม่นับ
for (const c of CHECKS) {
  if (reported.has(c.id)) continue;
  if (s2Skipped && S2_IDS.has(c.id)) continue;
  chk(c.id.replace("P1.1-", ""), false, "รันถึง", "ไม่ถูกรันเลย (ล้มก่อนถึงส่วนนี้)");
}
await P.$disconnect();
const code = Q.finish({ catalogue: CHECKS.length, tag: TAG, skippedGroups: s2Skipped ? { S2: s2Skipped } : {}, force: FORCE, p11bStarted });
process.exit(exitCode === 0 ? code : 1);
