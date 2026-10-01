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
//   7) 🔴 รันคนเดียว: ระหว่างรัน ข้อสอบนี้ต้องเป็นผู้เขียนรายเดียวของร้าน QC ของ POS (ผู้คุมงานจัดคิวผ่าน gate lock ของ QC4)
//      — snapshot/checksum ก่อน-หลัง จะแดงหลอกถ้ามีคนอื่นเขียนร้านเดียวกันพร้อมกัน
// สัญญาที่ผู้คุมงานรับรอง 1 ต.ค. (รอบ ratification): ปฏิเสธ = throw error ที่มี .code คงที่ (NOT_FOUND · PERMISSION_DENIED ·
//   VALIDATION · CONFLICT — ข้ามร้าน/ข้ามสาขา/ระบบผิด = NOT_FOUND แบบ 404 ตรงกับข้อสอบหน้าขาย P1.3) · listForUnit คืน {items, nextCursor}
//   เสมอ · createCategory(ctx, {name, nameEn?, unitId?, sortOrder?}) · ความพร้อมขายเปลี่ยนผ่าน updateProduct(…, {availability:{[unitId]: bool}})
//   · เมนูทุกตัว = PosProduct MENU ของตัวเอง invItemId null ราคา basePrice · MenuItem.invItemId → RecipeLine(productId เมนู, invItemId, qty 1)
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
  D("S1.3", "-", "PosProduct มีคอลัมน์สัญญา (tenantId · systemId · unitId? · invItemId? · name · nameEn · kind · categoryId · basePriceSatang? · vatRateBp · stationId · dailyStockQty · images · archivedAt · trackStock nullable ไม่มี default [C2]) · unique(systemId, invItemId) · kind ∋ PRODUCT/SERVICE/MENU/BUNDLE · index ระบบ"),
  D("S1.4", "-", "migration <ts>_pos_v2_a additive ล้วน: ไม่มี DROP/RENAME/SET NOT NULL/ADD COLUMN NOT NULL ไร้ DEFAULT บนตารางเดิม · ALTER TYPE ADD VALUE ไม่ปนไฟล์ DDL อื่น · ไม่แตะ enum InvItemKind"),
  D("S1.5", "-", "src/lib/core/scope.ts ลงทะเบียนตารางใหม่ทุกตัว (F1 fail-closed)"),
  // ── S1 · backfill ──
  D("S1.6", "-", "backfill --dry-run: exit 0 + JSON_SUMMARY นับต่อแหล่ง (invItem · menuItem · shopProduct) ตรง DB + skippedNoPosSystem ตรงกับแหล่งที่หา POS ไม่เจอตามทางขายจริง"),
  D("S1.7", "-", "backfill --dry-run ไม่เขียนอะไรเลย (ตารางใหม่ · คอลัมน์เชื่อม · ตารางเดิม เท่าเดิมทุก byte)"),
  D("S1.8", "-", "backfill จริง: exit 0 · created.posProduct = ที่ dry-run ทำนาย = แถวที่เพิ่มจริง · ไม่สร้าง InvItem เลย (R1)"),
  D("S1.9", "-", "InvItem ที่ขายได้ใน POS (คลังผูกสาขาที่มี POS) → PosProduct เดียว systemId = POS ของสาขานั้น · ไม่มีกำพร้า/ชี้ข้ามร้าน · systemId เป็นระบบ POS ของร้านเดียวกัน"),
  D("S1.10", "-", "ทุก MenuItem (สาขามี POS) → PosProduct ของตัวเอง 1 แถว: kind MENU · unitId = สาขาเมนู · invItemId null · MenuItem.invItemId ที่มีอยู่ → RecipeLine(productId เมนู, invItemId, qty 1) แถวเดียว · สาขาไม่มี POS = ไม่ผูก"),
  D("S1.11", "-", "ทุก ShopProduct → POS ตัวแรกของร้าน (ทางเดียวกับ shop checkout): มี invItemId → ชี้ PosProduct ของ InvItem นั้น · ไม่มี → PosProduct ของตัวเอง (PRODUCT · unitId สาขา · invItemId null) — แม้สาขาไม่ผูก POS"),
  D("S1.12", "-", "InvItem ↔ ShopProduct(invItemId) = PosProduct เดียว (เว็บร้าน→น้ำดื่ม) · เมนู→โค้ก = 2 แถว: PRODUCT โค้ก (invItemId · 2000) + MENU (invItemId null · 2500 · RecipeLine→โค้ก)"),
  D("S1.13", "X4", "ราคาขั้น 2 (salePrice) ตรงสตางค์ทุกสินค้าใน seed รวมราคา 0 บาท (น้ำฟรี · น้ำแข็ง)"),
  D("S1.14", "X4", "ราคา = ที่ลิ้นชักคิดวันนี้ [C7] ทุกแถวตรงสูตร + ทีละขั้น: salePrice>0 ชนะ posPrice · posPrice>0 เมื่อ posEnabled · SERVICE 15000 · SERVICE 0 = null · เมนู 9900 · เว็บล้วน 12345 · มีแต่ต้นทุน = null · เมนูโค้ก 2500"),
  D("S1.15", "X8", "VAT ต่อสินค้า [C8]: vatRateBp = AccountProduct.vatRateBp (หาแบบลิ้นชัก · สมุดบัญชีที่ผูก POS จด VAT) · ไข่ 0 · อื่น 700 · ไม่มีบัญชี/ไม่จด VAT = null"),
  D("S1.16", "-", "หมวด: เมนู → PosCategory ชื่อ/ชื่ออังกฤษเดียวกับ MenuCategory · 1 PosCategory ต่อ MenuCategory (สาขามี POS · ไม่ซ้ำ)"),
  D("S1.17", "-", "ฟิลด์เมนูย้ายครบ: stationId · dailyStockQty · images (ลำดับเดิม)"),
  D("S1.18", "-", "ตัวเลือก: PosProductOptionGroup (groupId · sortOrder) = MenuItemOptionGroup ของเมนูทุกตัว · MenuOptionGroup ใช้ต่อ ไม่สร้างใหม่"),
  D("S1.19", "-", "บาร์โค้ดคงเดิม: byBarcode(...).items มี PosProduct ของทุกบาร์โค้ดใน seed (น้ำดื่ม · โค้ก)"),
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
  D("S1.28", "X4", "createProduct throw: ชื่อว่าง/ราคาติดลบ/เศษสตางค์ = VALIDATION · บาร์โค้ดซ้ำในระบบ POS = CONFLICT — และไม่เขียนอะไรเลย"),
  D("S1.29", "-", "updateProduct: ชื่อ/ชื่ออังกฤษ/หมวด เปลี่ยนจริง · listForUnit เห็นค่าใหม่ · จำนวนแถวไม่เพิ่ม"),
  D("S1.30", "X4", "setPrice: ตั้งได้ตรงสตางค์ (รวม 0) · ติดลบ/เศษสตางค์/NaN/สตริง = throw VALIDATION โดยราคาเดิมไม่เปลี่ยน"),
  D("S1.31", "-", "archive: หายจาก listForUnit · กดซ้ำไม่ error · แถวยังอยู่ (soft)"),
  D("S1.32", "-", "listForUnit คืน {items, nextCursor} (ไม่ใช่ array เปล่า) · item ทรง POS-API §1: {id, invItemId, name, nameEn, kind, categoryId, basePriceSatang, images[], optionGroups[], variants[], recipe[], channelPrices[], availability{unitId→bool}, stock{unitId→qty}} · เงินเป็น Int"),
  D("S1.33", "-", "listForUnit: active ของระบบครบ (unitId null + unitId สาขานี้ · ไม่มีของสาขาอื่น) · stock[unit] = InvItem.onHand · availability[unit] = true · ตัวเลือกเมนูมี choices.priceDelta Int"),
  D("S1.34", "-", "byBarcode: {items} ตรงตัวในระบบ · บาร์โค้ดไม่มี = items ว่าง"),
  D("S1.35", "X1", "ensureForInvItem: เรียกซ้ำได้ id เดิม (created=false) · InvItem ใหม่ได้ราคาตามลำดับ R2"),
  D("S1.37", "-", "listForUnit ค้นฝั่ง server ด้วยชื่อไทย/SKU/บาร์โค้ด + แบ่งหน้าด้วย {limit, cursor} → nextCursor · ไม่มีเพดาน 200 (สินค้า >200 ตัวเดินครบทุกหน้า ไม่ซ้ำ)"),
  D("S1.39", "-", "createCategory(ctx, {name, nameEn?, unitId?, sortOrder?}) → PosCategory ระบบ POS นี้ · ชื่อว่าง = VALIDATION · ชื่อซ้ำ (ระบบ+สาขาเดียวกัน) = CONFLICT"),
  D("S1.40", "-", "createProduct ไม่ส่ง kind → PRODUCT · updateProduct availability {[unitId]: false} → ยังอยู่ใน listForUnit สาขานั้นแต่ availability[unit]=false · สาขาอื่นไม่กระทบ · เปิดคืนได้"),
  D("S1.41", "-", "trackStock tri-state [C2]: updateProduct({trackStock}) true/false/null วนได้ · คอลัมน์เก็บค่าที่ตั้ง (null = AUTO)"),
  D("S1.38", "-", "ทุกการเขียน (createProduct · setPrice · archive) มีแถว AuditLog targetType PosProduct · targetId · actorId = ผู้กด"),
  // ── X · P1.1a ──
  D("X2.1", "X2", "ข้ามร้าน: updateProduct/setPrice/archive ด้วย productId ของอีกร้าน · ctx ที่ systemId เป็น POS ของอีกร้าน → throw NOT_FOUND และแถวไม่เปลี่ยน"),
  D("X2.2", "X2", "ข้ามร้าน: ensureForInvItem(InvItem ร้านอื่น) = NOT_FOUND · byBarcode บาร์โค้ดร้านอื่น = null · listForUnit(สาขาร้านอื่น) = NOT_FOUND · createCategory unitId ร้านอื่น = NOT_FOUND · ไม่มี id ร้านอื่นรั่ว"),
  D("X2.3", "X2", "ข้ามสาขา: แคชเชียร์ (unitAccess=สีลม) listForUnit/byBarcode สาขาอารีย์ → NOT_FOUND · สีลมได้"),
  D("X3.1", "X3", "setPrice โดย STAFF ที่ไม่มี pos.product.setPrice → PERMISSION_DENIED ราคาไม่เปลี่ยน"),
  D("X3.2", "X3", "setPrice โดย STAFF ที่ Membership.permissions มี pos.product.setPrice=true → ได้ · OWNER ได้"),
  D("X3.3", "X3", "STAFF สาขาเดียวที่ไม่มีคีย์ pos.product.manage: createProduct/createCategory ของสาขาตัวเอง · updateProduct/archive สินค้าสาขาตัวเอง → PERMISSION_DENIED ไม่เขียน (ทดสอบคีย์ ไม่ใช่กติกาสาขา) [D7]"),
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
  D("S2.18", "-", "เมนูที่ผูก InvItem (เมนู→โค้ก) แก้ basePrice → แถว MENU ตาม (2600) · แถว PRODUCT ของโค้กคง 2000 · RecipeLine ไม่เบิ้ล"),
  D("S2.19", "X12", "F15.1: CATALOG_WRITER_BASELINE ว่าง และตัวสแกนพบผู้เขียนแคตตาล็อกที่ catalog.ts ที่เดียว"),
  D("S2.20", "-", "inventory.updateItem ราคา SERVICE (InvItem.priceSatang) → PosProduct ตาม"),
  D("S2.21", "-", "account/inventory-link.linkProductToItem (สร้าง InvItem จากสินค้าบัญชี) → PosProduct ของ InvItem ใหม่ ราคาตาม R2"),
  D("S2.22", "-", "AI proposal inventory_create_item (ai/proposals.runKind) → PosProduct ของ InvItem ใหม่"),
  D("S2.23", "-", "booking.importServicesToCatalog (BookingService เก่า → InvItem SERVICE) → PosProduct SERVICE ราคา = BookingService.priceSatang"),
  D("S2.24", "-", "ย้อนทาง: catalog.setPrice บริการ → InvItem.priceSatang ตาม → booking.serviceRoster + BookingService.priceSatang เห็นราคาใหม่"),
  D("S2.25", "-", "account/product.updateProduct [C7]: posPrice ไม่ชนะ salePrice>0 · salePrice ว่าง + posEnabled + posPrice → PosProduct = posPrice"),
  D("S2.26", "-", "menu.createCategory → PosCategory ชื่อเดียวกัน 1 แถว · archiveCategory → PosCategory เก็บถาวร"),
  D("S2.27", "-", "menu.createOptionGroup + archiveOptionGroup → listForUnit ของเมนูที่ผูก เห็นตัวเลือก priceDelta ตรง แล้วหายเมื่อเก็บถาวร"),
  D("X6.5", "X6", "แข่งกัน: menu.updateItem ราคา ↔ catalog.setPrice เมนูเดียวกัน 10 เลน × 3 รอบ → MenuItem.basePrice = PosProduct.basePriceSatang ทุกรอบ"),
  // ── S3 · ROUND 2 (brief P1.1a-R2 · มติหลังผู้ตรวจ+นักล่า) — 1 ข้อขึ้นไปต่อ C/M ──
  D("S3.1", "X3", "C1 ผู้เรียกระดับระบบ = CATALOG_SYSTEM_ACTOR (unique symbol) ทำงาน · actorUserId null/undefined/\"\" = PERMISSION_DENIED (ensureForInvItem · createProduct · setPrice · createCategory)"),
  D("S3.2", "-", "C2 backfill/ensure ทิ้ง trackStock = null (AUTO) · read model มี trackStock (ค่าจริง) + trackStockMode auto|on|off"),
  D("S3.3", "-", "C2 AUTO คิดตอนอ่าน: สินค้าสร้างวันนี้ยังไม่มีของ = false → รับของเข้าทีหลัง = true เอง · ตั้ง off/on/null ได้ · true บนแถวไม่ผูกคลัง = VALIDATION"),
  D("S3.4", "X2", "C3 POS เดียวสองคลัง: สาขา A เห็นเฉพาะของคลัง X (list + ค้น SKU/บาร์โค้ด) · สาขา B เฉพาะคลัง Y · stock[A] = onHand ของ X"),
  D("S3.5", "X2", "C3 byBarcode ตามคลังของสาขา: บาร์โค้ดของคลัง Y ที่สาขา A = ว่าง · ที่สาขา B = เจอ"),
  D("S3.6", "X3", "C4/D1 ผู้จัดการสาขาสีลมใน POS สองสาขา: เขียนสินค้าทุกสาขาที่ขายที่อารีย์ด้วย (setPrice · updateProduct · archive · trackStock) · createProduct ทุกสาขา · ensureForInvItem (คลังร่วม) · createCategory ทุกสาขา = PERMISSION_DENIED"),
  D("S3.7", "X3", "C4 ย้ายสาขา: ผู้จัดการย้ายของสาขาตัวเองเป็นทุกสาขา = PERMISSION_DENIED · ไปสาขาที่ไม่มีสิทธิ์ = NOT_FOUND · แก้/ตั้งราคาของสาขาตัวเองได้ · เจ้าของย้ายทุกสาขา→สาขาเดียวได้"),
  D("S3.8", "-", "C4 หมวด: สินค้าสาขาสีลม + หมวดของสาขาอารีย์ = VALIDATION · หมวดทุกสาขาใช้ได้"),
  D("S3.9", "-", "C5 byBarcode คืน {items} 0..n · บาร์โค้ดซ้ำใน legacy = 2 รายการ ลำดับคงที่ (เรียกสองครั้งได้ลำดับเดิม)"),
  D("S3.10", "-", "C6 listForUnit ไม่ส่ง limit = 100 + nextCursor · limit 1000 = ตัดเหลือ 500 ไม่ error · เดินหน้า 100 ครบทุกแถวไม่ซ้ำ"),
  D("S3.11", "-", "C6 (static) ค้นด้วยคำสั่งเดียว: listForUnit ไม่มี take: 2000 / invItem.findMany ก่อน · toViews ไม่ filter ต่อแถว (ใช้ Map)"),
  D("S3.12", "X4", "C7 ทีละขั้นด้วย fixture: salePrice>0 ชนะ posPrice · posPrice ใช้เมื่อ posEnabled · posEnabled=false ไม่นับ · AccountProduct เก็บถาวร/สมุดบัญชีอื่น/ผูกครึ่งทาง (AP.invItemId) ไม่นับ · salePrice 0 + ต้นทุน>0 = null · 0 + ต้นทุน 0 = 0 · ราคาติดลบ = null"),
  D("S3.13", "-", "C7 ตัวนับใน dry-run: soldAtCostToday (+ ตัวอย่างชื่อ) · zeroPriceProduct · zeroPriceMenu · zeroPriceWeb · invalidLegacyPrice · posPriceDiffersFromSalePrice"),
  D("S3.14", "X8", "C8 VAT: สมุดบัญชีที่ผูก POS ไม่จด VAT → vatRateBp null · จด VAT → ค่าจาก AccountProduct"),
  D("S3.15", "-", "C9a เว็บร้านผูก InvItem ของ POS แรก = ชี้แถวเดิม ไม่แก้แถวร่วม · นับ shopPriceDiffersFromCatalog + shopInactiveLinked"),
  D("S3.16", "-", "C9b เว็บร้านผูก InvItem นอกคลังของ POS แรก = แถวของตัวเองใน POS แรก (invItemId ตั้ง · unitId สาขาร้าน) + นับ shopOwnRowInvItemOutsideFirstPos"),
  D("S3.17", "-", "C9c invItemId ชี้ InvItem ที่ไม่มีแล้ว = แถวของตัวเอง invItemId null + นับ shopDanglingInvItem · สาขาไม่อยู่ใน POS แรก = นับ shopBranchNotInFirstPos (unitId สาขาร้าน)"),
  D("S3.18", "X4", "C10 createProduct: MENU/BUNDLE + invItemId = VALIDATION · InvItem เก็บถาวร = VALIDATION · ชนิดไม่ตรง = VALIDATION · บาร์โค้ดเท่ากับ InvItem ของตัวเองได้ · P2002 → CONFLICT (static)"),
  D("S3.19", "X6", "C11 setPrice 2 เลนพร้อมกัน × 5 รอบ = audit ต่อเป็นสาย (ก่อน→หลัง ต่อกัน) · archive 2 เลนพร้อมกัน = ทั้งคู่คืน archivedAt ที่เก็บจริง"),
  D("S3.20", "X2", "C12 สาขาเก็บถาวร: เมนูไม่ถูกผูก · listForUnit = NOT_FOUND · POS ที่ปิดใช้งาน (เก่ากว่า) ไม่ถูกเลือกเป็น POS แรก"),
  D("S3.21", "-", "C13 backfill: prod ไม่มี --tenant/--all = ปฏิเสธ (static) · movement ใช้ groupBy/DISTINCT ไม่โหลดทั้งหมด · ตัวเลือกเมนูจัดกลุ่มด้วย Map · JSON_SUMMARY มีตัวนับครบทุกชื่อ"),
  D("S3.22", "-", "M1 ไม่มี index บนคอลัมน์เชื่อมของ 5 ตารางเดิม (SQL · schema · DB)"),
  D("S3.23", "-", "M2 คำสั่งแรก SET LOCAL lock_timeout · ALTER TABLE … ADD COLUMN ของตารางเดิม 5 ตัวอยู่ท้าย (ก่อน RESET lock_timeout ตัวสุดท้าย · DO-block นับเป็นคำสั่งเดียว)"),
  D("S3.24", "-", "M3 SQL: \"trackStock\" BOOLEAN nullable ไม่มี DEFAULT"),
  D("S3.25", "-", "M4 index PosProduct(systemId, archivedAt, name, id)"),
  D("S3.26", "-", "M5 partial unique PosCategory(systemId, name) WHERE unitId IS NULL"),
  // ── S3.27+ · ROUND 3 (brief P1.1a-R3 · D1–D7) ──
  D("S3.27", "X3", "D1 ผู้จัดการร้านสาขาเดียว (unitAccess=[สาขานั้น]) และผู้จัดการที่ระบุทุกสาขาเอง ([สีลม, อารีย์]) เขียนสินค้า/หมวดทุกสาขาได้ (createProduct · setPrice · updateProduct · archive · createCategory)"),
  D("S3.28", "X3", "D1+C3 ผู้จัดการสาขา A ใน POS สองคลัง: สินค้าทุกสาขาที่ขายได้เฉพาะ A (คลัง X) แก้ได้ · ของคลัง Y และไม่ผูกคลัง = PERMISSION_DENIED"),
  D("S3.29", "-", "D2 (static) ทางอ่านไม่สแกนประวัติ movement ทั้งร้าน: toViews ไม่มี invMovement.groupBy/findMany · มี EXISTS/LIMIT 1 ที่กรอง systemId ของคลัง"),
  D("S3.30", "-", "D3 ตัวนับ + ตัวอย่าง: apIgnoredButTillPriced (AP เก็บถาวร/สมุดอื่นที่ลิ้นชักคิด salePrice) · priceNotSetOther · servicePriceDiffersFromAccountProduct"),
  D("S3.31", "-", "D4 คำสั่งสุดท้ายของ migration = RESET lock_timeout"),
  D("S3.32", "-", "D4 ทุกคำสั่งรันซ้ำได้: CREATE TABLE/INDEX IF NOT EXISTS · ADD COLUMN IF NOT EXISTS · enum/FK อยู่ใน DO $$ … EXCEPTION WHEN duplicate_object"),
  D("S3.33", "X12", "D5 facade (pos/index.ts) ไม่ส่งต่อ backfillCatalog · marker สร้างด้วย Symbol( ไม่ใช่ Symbol.for( · ไม่มี `?? CATALOG_SYSTEM_ACTOR` ใน src"),
  D("S3.34", "X2", "D6 createProduct ผูก InvItem ของคลังที่ไม่ได้เสิร์ฟสาขา unitId ที่ส่ง = VALIDATION (ไม่จองช่อง unique ด้วยแถวที่มองไม่เห็น)"),
  D("S3.35", "-", "D6 trackStock true บนบริการ (SERVICE) = VALIDATION ทั้ง createProduct และ updateProduct"),
  D("S3.36", "X6", "D6 createProduct/createCategory ธรรมดาไม่รอล็อกร้านที่อีก connection ถืออยู่ (เสร็จ < 3 วิ) · คู่บวก: createProduct ผูก InvItem ยังรอล็อก"),
  D("S3.37", "-", "D6 byBarcode (UNION) ยังคืนทั้งสองแหล่ง: บาร์โค้ดของแถวเอง + บาร์โค้ดของ InvItem ที่ผูก"),
  D("S3.38", "X3", "D6 สมาชิกที่ยังไม่รับคำเชิญ (acceptedAt null — กติกาบ้าน core/context.ts) = ไม่ใช่สมาชิก → NOT_FOUND"),
  D("S3.39", "-", "D6 zeroPriceWeb นับเฉพาะแถวที่ราคาสุดท้ายคือราคาเว็บ 0 (เว็บร้านราคา 0 ที่ผูก InvItem มีราคาบัญชี ไม่นับ) = 1 ตรง"),
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
  BookingService: ["updatedAt"], Membership: ["updatedAt"], AppSystem: ["updatedAt"], AccountSettings: ["updatedAt"],
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
  for (const t of [...Object.keys(LEGACY), ...NEW_TABLES, "OutboxEvent"]) {
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
type Try = { ok: boolean; value?: Any; err?: string; code?: string; threw?: boolean };
/** สัญญา (ratified): catalog ปฏิเสธด้วยการ throw error ที่มี `.code` คงที่ · คืน {ok:false} = ผิดสัญญา (นับเป็นไม่ผ่านในข้อที่ตรวจ code) */
async function attempt(fn: () => Promise<Any>): Promise<Try> {
  try {
    const v = await fn();
    if (v && typeof v === "object" && (v as Any).ok === false) return { ok: false, value: v, err: `คืน {ok:false} แทน throw (${String((v as Any).code ?? (v as Any).reason ?? "")})`, code: undefined, threw: false };
    return { ok: true, value: v };
  } catch (e) {
    const code = typeof (e as Any)?.code === "string" ? ((e as Any).code as string) : undefined;
    return { ok: false, err: `${code ?? "ไม่มี code"}: ${firstLine(e).slice(0, 160)}`, code, threw: true };
  }
}
/** ปฏิเสธถูกสัญญา = throw + code ตรง */
const refused = (r: Try, code: string) => !r.ok && r.threw === true && r.code === code;
const codeOf = (r: Try) => (r.ok ? "รับ" : r.threw ? (r.code ?? "throw ไม่มี code") : "ok:false");
const idOf = (v: Any): string | undefined => (typeof v === "string" ? v : v?.id ?? v?.productId ?? v?.product?.id ?? undefined);
const listOf = (v: Any): Any[] => (Array.isArray(v) ? v : Array.isArray(v?.items) ? v.items : Array.isArray(v?.products) ? v.products : []);
const isInt = (n: unknown) => typeof n === "number" && Number.isInteger(n);
/** C5 (round 2): byBarcode คืน {items} — ตัวช่วยอ่าน (ทรงเก่าที่คืนแถวเดียว/null ถือว่าไม่ใช่สัญญา → S3.9 แดง) */
const bcItems = (v: Any): Any[] => (v && typeof v === "object" && Array.isArray(v.items) ? v.items : []);
/** อ่านครบทุกหน้า (C6: ค่าปริยาย 100 ต่อหน้า) — เดินตาม nextCursor ด้วย limit 500 */
async function listAll(C: Any, ctx: Any, unitId: string, opts: Record<string, unknown> = {}): Promise<Try & { items: Any[] }> {
  const items: Any[] = []; let cursor: Any = undefined; let last: Try = { ok: false };
  for (let i = 0; i < 50; i++) {
    last = await attempt(() => C.listForUnit(ctx, unitId, { ...opts, limit: 500, ...(cursor ? { cursor } : {}) }));
    if (!last.ok) return { ...last, items };
    items.push(...listOf(last.value));
    cursor = last.value?.nextCursor ?? null;
    if (!cursor) break;
  }
  return { ...last, items };
}
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
/** C1 (round 2): ผู้เรียกระดับระบบ = ตัวบ่งชี้ CATALOG_SYSTEM_ACTOR (unique symbol ที่ catalog.ts export) — null/undefined/"" = PERMISSION_DENIED */
const sysActor = (): Any => catalog?.CATALOG_SYSTEM_ACTOR ?? "__no_system_actor_export__";
const ctxSys = (tenantId: string, systemId: string) => ({ tenantId, systemId, actorUserId: sysActor() });
/** ให้สิทธิ์ชั่วคราวกับ Membership ของแคชเชียร์ แล้วคืนค่าเดิมทุกตัวอักษร (finally) */
const cashierMb = CF.users.cashier.membershipId as string;
const cashierPerm0 = (await P.membership.findFirst({ where: { id: cashierMb } }))?.permissions ?? {};
const cashierRole0 = (await P.membership.findFirst({ where: { id: cashierMb } }))?.role ?? "STAFF";
const cashierRow0 = (await P.membership.findFirst({ where: { id: cashierMb } })) as Any;
async function withCashierPerm<T>(extra: Record<string, unknown>, fn: () => Promise<T>, role?: string, unitAccess?: string[], acceptedAt?: Date | null): Promise<T> {
  await P.membership.update({ where: { id: cashierMb }, data: { permissions: { ...(cashierPerm0 as object), ...extra }, ...(role ? { role } : {}), ...(unitAccess ? { unitAccess } : {}), ...(acceptedAt !== undefined ? { acceptedAt } : {}) } });
  try { return await fn(); } finally {
    await P.membership.update({ where: { id: cashierMb }, data: { permissions: cashierPerm0, role: cashierRole0, unitAccess: cashierRow0?.unitAccess ?? [], acceptedAt: cashierRow0?.acceptedAt ?? null } });
  }
}
/** D1: แคชเชียร์ชั่วคราวเป็น MANAGER ของสาขาที่ระบุ (คืน role/สาขา/สิทธิ์เดิมทุกครั้ง) */
const asManagerOf = <T,>(units: string[], fn: () => Promise<T>) => withCashierPerm({}, fn, "MANAGER", units);
/** C4: แคชเชียร์ชั่วคราวเป็น MANAGER เฉพาะสาขาสีลม (unitAccess เดิม = [สีลม]) — คืน role/สิทธิ์เดิมเสมอ */
const asBranchManager = <T,>(fn: () => Promise<T>) => withCashierPerm({}, fn, "MANAGER");
const itemBySku = (t: Any, sku: string) => (t.items as Any[]).find((i) => i.sku === sku);
const BULK = 520; // C6: > 500 (เพดาน limit) และ > 200 (เพดานหน้าขายเดิม)

// snapshot0 = ภาพก่อนแตะอะไรเลย (คืนสภาพท้ายรันเทียบกับตัวนี้)
const snapLegacy0 = await snapLegacyLinks();
const snapNew0 = await snapNew();
let catalog: Any = null;

// fixtures แบบ "ข้อมูลเก่า" (เขียนตรงเหมือนข้อมูลก่อน P1.1 — ไม่ผ่าน catalog)
const mkInv = async (tid: string, sys: string, sfx: string, extra: Record<string, unknown> = {}) =>
  (await P.invItem.create({ data: { tenantId: tid, systemId: sys, sku: `${TAG}-${sfx}`, name: `${TAG} ${sfx}`, ...extra } })) as Any;
const mkAp = async (tid: string, accSys: string, inv: Any, salePrice: number | null, vatRateBp = 700, posPrice: number | null = null, o: { posEnabled?: boolean; archivedAt?: Date; halfLink?: boolean } = {}) => {
  const ap = await P.accountProduct.create({ data: { tenantId: tid, systemId: accSys, name: inv.name, salePrice, posPrice, vatRateBp, invItemId: inv.id, posEnabled: o.posEnabled ?? false, archivedAt: o.archivedAt ?? null } });
  // halfLink = มีแค่ AccountProduct.invItemId (หน้าขายวันนี้หาไม่เจอ — C7 ห้าม fallback ทางนี้)
  if (!o.halfLink) await P.invItem.update({ where: { id: inv.id }, data: { accountProductId: ap.id } });
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
  new Map((await q<{ unitId: string; systemId: string }>(`select l."unitId", l."systemId" from "AppSystemUnit" l join "BusinessUnit" u on u.id = l."unitId" join "AppSystem" s on s.id = l."systemId"
    where l.type = 'POS' and l."tenantId" = any($1::text[]) and u.status <> 'ARCHIVED' and s.active`, QC_TIDS)).map((r) => [r.unitId, r.systemId]));
/** ร้าน → POS ตัวแรก (listSystems: type asc, createdAt asc) = ทางที่ shop checkout ใช้วันนี้ (shop/service.ts:217) */
const firstPosOfTenant = async (): Promise<Map<string, string>> => {
  const rows = await q<{ tenantId: string; id: string }>(`select "tenantId", id from "AppSystem" where type = 'POS' and active and "tenantId" = any($1::text[]) order by "createdAt" asc, id asc`, QC_TIDS);
  const m = new Map<string, string>();
  for (const r of rows) if (!m.has(r.tenantId)) m.set(r.tenantId, r.id);
  return m;
};
/** คลัง → ระบบ POS: คลัง I ขายได้ใน POS S เมื่อมีสาขาที่ผูกทั้ง I และ S (หลาย S = กำกวม → backfill ต้องข้าม+รายงาน) */
const posOfInventory = async (): Promise<Map<string, string[]>> => {
  const rows = await q<{ inv: string; pos: string }>(`
    select distinct i."systemId" as inv, p."systemId" as pos from "AppSystemUnit" i
    join "AppSystemUnit" p on p."unitId" = i."unitId" and p."tenantId" = i."tenantId" and p.type = 'POS'
    join "BusinessUnit" u on u.id = i."unitId" join "AppSystem" ps on ps.id = p."systemId" join "AppSystem" isys on isys.id = i."systemId"
    where i.type = 'INVENTORY' and i."tenantId" = any($1::text[]) and u.status <> 'ARCHIVED' and ps.active and isys.active`, QC_TIDS);
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
    const needC = ["tenantId", "systemId", "unitId", "invItemId", "name", "nameEn", "kind", "categoryId", "basePriceSatang", "vatRateBp", "stationId", "dailyStockQty", "images", "archivedAt", "trackStock"];
    const missC = needC.filter((c) => !ppCols.has(c));
    const nullable = ["unitId", "invItemId", "basePriceSatang"].filter((c) => ppCols.get(c)?.is_nullable !== "YES");
    const notNull = ["tenantId", "systemId", "name", "kind"].filter((c) => ppCols.get(c)?.is_nullable !== "NO");
    // C2/M3 (round 2): trackStock nullable ไม่มี default (null = AUTO)
    const tsTri = ppCols.get("trackStock")?.is_nullable === "YES" && !ppCols.get("trackStock")?.column_default;
    const idx = await q<{ tablename: string; indexdef: string }>(`select tablename, indexdef from pg_indexes where schemaname='public' and tablename = any($1::text[])`, ["PosProduct", ...links.map((l) => l[0])]);
    const hasIdx = (t: string, c: string) => idx.some((r) => r.tablename === t && new RegExp(`\\(\\s*"${c}"`).test(r.indexdef));
    const uniqInv = idx.some((r) => r.tablename === "PosProduct" && /UNIQUE/i.test(r.indexdef) && /"invItemId"/.test(r.indexdef) && (/"systemId"/.test(r.indexdef) || /\(\s*"invItemId"\s*\)/.test(r.indexdef)));
    void hasIdx;
    const idxMiss = [uniqInv ? "" : "PosProduct unique(systemId, invItemId)", hasIdx("PosProduct", "systemId") || hasIdx("PosProduct", "tenantId") ? "" : "PosProduct(systemId|tenantId)"].filter(Boolean);
    const kindEnum = (await q<{ enumlabel: string }>(`select e.enumlabel from pg_enum e join pg_type t on t.oid = e.enumtypid join information_schema.columns c on c.udt_name = t.typname where c.table_name='PosProduct' and c.column_name='kind'`)).map((r) => r.enumlabel);
    const kindMiss = ["PRODUCT", "SERVICE", "MENU", "BUNDLE"].filter((k) => !kindEnum.includes(k));
    chk("S1.3", missC.length === 0 && nullable.length === 0 && notNull.length === 0 && tsTri && idxMiss.length === 0 && kindMiss.length === 0,
      "คอลัมน์ครบ · unitId/invItemId/basePriceSatang/trackStock nullable · tenantId/systemId/name/kind NOT NULL · kind ∋ PRODUCT/SERVICE/MENU/BUNDLE · index ครบ",
      `ขาดคอลัมน์: ${missC.join(",") || "-"} · trackStock nullable+ไม่มี default ${tsTri} (${ppCols.get("trackStock")?.is_nullable}/${ppCols.get("trackStock")?.column_default ?? "-"}) · ควร nullable: ${nullable.join(",") || "-"} · ควร NOT NULL: ${notNull.join(",") || "-"} · kind ขาด: ${kindMiss.join(",") || "-"} · ขาด index: ${idxMiss.join(",") || "-"}`);
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

  // ═══ S3.22–S3.26 · M1–M5 (static: migration.sql + schema · และ DB) ═══
  await section("migration-r2", ["S3.22", "S3.23", "S3.24", "S3.25", "S3.26", "S3.31", "S3.32"], async () => {
    const migDir = existsSync("prisma/migrations") ? readdirSync("prisma/migrations").find((d) => /_pos_v2_a$/.test(d)) : undefined;
    const sql = migDir ? read(`prisma/migrations/${migDir}/migration.sql`) : "";
    // DO $$ … $$ นับเป็นคำสั่งเดียว (ข้างในมี ; ของตัวเอง) — แทนด้วยตัวยึดก่อนตัดด้วย ;
    const doBlocks: string[] = [];
    const sqlNoDo = sql.replace(/--.*$/gm, "").replace(/DO\s+\$(\w*)\$[\s\S]*?\$\1\$/gi, (b) => `__DO_${doBlocks.push(b) - 1}__`);
    const stmts = sqlNoDo.split(";").map((x) => x.trim()).filter(Boolean);
    const OLD5: [string, string][] = [["ShopProduct", "posProductId"], ["ShopOrderLine", "posProductId"], ["PosSaleLine", "productId"], ["MenuItem", "posProductId"], ["RestaurantOrderItem", "productId"]];
    const sqlIdx = OLD5.filter(([t, c]) => new RegExp(`CREATE\\s+(UNIQUE\\s+)?INDEX[^;]*ON\\s+"${t}"\\s*\\(\\s*"${c}"`, "i").test(sql)).map(([t, c]) => `${t}.${c}`);
    const schemaAll = existsSync("prisma/schema") ? readdirSync("prisma/schema").filter((f) => f.endsWith(".prisma")).map((f) => read(`prisma/schema/${f}`)).join("\n") : "";
    const modelBlock = (name: string) => { const m = new RegExp(`model\\s+${name}\\s*\\{([\\s\\S]*?)\\n\\}`).exec(schemaAll); return m?.[1] ?? ""; };
    const schIdx = OLD5.filter(([t, c]) => new RegExp(`@@index\\(\\[\\s*${c}\\s*\\]`).test(modelBlock(t))).map(([t, c]) => `${t}.${c}`);
    const dbIdx = (await q<{ tablename: string; indexdef: string }>(`select tablename, indexdef from pg_indexes where schemaname='public' and tablename = any($1::text[])`, OLD5.map((x) => x[0])))
      .filter((r) => OLD5.some(([t, c]) => r.tablename === t && new RegExp(`\\(\\s*"${c}"`).test(r.indexdef))).map((r) => r.tablename);
    chk("S3.22", !!migDir && sqlIdx.length === 0 && schIdx.length === 0 && dbIdx.length === 0, "ไม่มี index บน 5 คอลัมน์เชื่อม (SQL/schema/DB)", `${migDir ?? "ไม่พบ *_pos_v2_a"} · SQL ${sqlIdx.join(",") || "-"} · schema ${schIdx.join(",") || "-"} · DB ${dbIdx.join(",") || "-"}`);
    const first = stmts[0] ?? "";
    const isAddOld = (x: string) => OLD5.some(([t]) => new RegExp(`^ALTER\\s+TABLE\\s+"${t}"\\s+ADD\\s+COLUMN`, "i").test(x));
    const addIdx = stmts.map((x, i) => (isAddOld(x) ? i : -1)).filter((i) => i >= 0);
    const tailEnd = /^RESET\s+lock_timeout$/i.test(stmts[stmts.length - 1] ?? "") ? stmts.length - 1 : stmts.length;
    const lastFive = addIdx.length === 5 && addIdx.every((i, k) => i === tailEnd - 5 + k);
    chk("S3.23", /^SET\s+(LOCAL\s+)?lock_timeout/i.test(first) && lastFive, "คำสั่งแรก SET LOCAL lock_timeout · ADD COLUMN 5 ตัวเดิมอยู่ท้าย", `คำสั่งแรก: ${first.slice(0, 60) || "-"} · ADD COLUMN ที่ตำแหน่ง ${addIdx.join(",") || "-"} / ${stmts.length}`);
    const tsDef = /"trackStock"\s+BOOLEAN([^,\n]*)/i.exec(sql)?.[1] ?? null;
    chk("S3.24", tsDef !== null && !/NOT\s+NULL|DEFAULT/i.test(tsDef), "\"trackStock\" BOOLEAN (nullable · ไม่มี DEFAULT)", tsDef === null ? "ไม่พบใน SQL" : `"trackStock" BOOLEAN${tsDef}`);
    const ppIdx = await q<{ indexdef: string }>(`select indexdef from pg_indexes where schemaname='public' and tablename='PosProduct'`);
    const cols = (d: string) => (/\(([^)]*)\)/.exec(d.slice(d.indexOf("USING")))?.[1] ?? "").split(",").map((c) => c.trim().replace(/"/g, "").split(/\s+/)[0]);
    const m4 = ppIdx.some((r) => cols(r.indexdef).join(",") === "systemId,archivedAt,name,id");
    chk("S3.25", m4, "index (systemId, archivedAt, name, id)", ppIdx.map((r) => cols(r.indexdef).join("+")).join(" · ") || "ไม่มี index");
    const pcIdx = await q<{ indexdef: string }>(`select indexdef from pg_indexes where schemaname='public' and tablename='PosCategory'`);
    const m5 = pcIdx.some((r) => /UNIQUE/i.test(r.indexdef) && cols(r.indexdef).join(",") === "systemId,name" && /WHERE[\s\S]*"?unitId"?\s+IS\s+NULL/i.test(r.indexdef));
    // S3.31 / S3.32 (D4)
    const last = stmts[stmts.length - 1] ?? "";
    chk("S3.31", /^RESET\s+lock_timeout$/i.test(last), "RESET lock_timeout", last.slice(0, 80) || "-");
    const unguarded: string[] = [];
    for (const st of stmts) {
      const one = st.replace(/\s+/g, " ");
      if (/^__DO_\d+__$/.test(one)) { const b = doBlocks[Number(one.slice(5, -2))] ?? ""; if (!/EXCEPTION\s+WHEN\s+duplicate_object|IF\s+NOT\s+EXISTS/i.test(b)) unguarded.push(`DO: ${b.slice(0, 50)}`); continue; }
      if (/^(SET|RESET)\b/i.test(one)) continue;
      if (/^CREATE TABLE\s+IF NOT EXISTS\b/i.test(one) || /^CREATE (UNIQUE )?INDEX\s+IF NOT EXISTS\b/i.test(one)) continue;
      if (/^ALTER TABLE\s+"\w+"\s+ADD COLUMN\s+IF NOT EXISTS\b/i.test(one)) continue;
      unguarded.push(one.slice(0, 70));
    }
    chk("S3.32", stmts.length > 0 && unguarded.length === 0, "ทุกคำสั่งมีตัวกันรันซ้ำ", `ไม่มีตัวกัน ${unguarded.length}/${stmts.length}: ${unguarded.slice(0, 3).join(" | ") || "-"}`);
    chk("S3.26", m5, "UNIQUE (systemId, name) WHERE unitId IS NULL", pcIdx.map((r) => r.indexdef.replace(/^CREATE /, "").slice(0, 110)).join(" · ") || "ไม่มี");
  });

  // ═══ fixtures (ข้อมูลเก่า) ก่อน backfill ═══
  const fx: Any = {};
  await section("fixtures", ["S1.6"], async () => {
    fx.water = itemBySku(CF, "PQC-CF-WATER"); fx.coke = itemBySku(RS, "PQC-RS-COKE"); fx.gift = itemBySku(CF, "PQC-CF-GIFT");
    fx.costOnly = await mkInv(cfT, sysC.INVENTORY, "costonly", { costSatang: 777 }); // มีแต่ต้นทุน → null (หน้าขายวันนี้โชว์ 7.77)
    fx.posPrice = await mkInv(cfT, sysC.INVENTORY, "posprice", { costSatang: 100 });
    fx.posPriceAp = await mkAp(cfT, sysC.ACCOUNT, fx.posPrice, 5000, 700, 4500, { posEnabled: true }); // C7: salePrice>0 ชนะ posPrice (แม้ posEnabled)
    fx.posZero = await mkInv(cfT, sysC.INVENTORY, "poszero");
    await mkAp(cfT, sysC.ACCOUNT, fx.posZero, 5000, 700, 0); // posPrice 0 ไม่นับ (>0 เท่านั้น) → salePrice 5000
    fx.svcZero = await mkInv(cfT, sysC.INVENTORY, "svczero", { kind: "SERVICE", priceSatang: 0 }); // บริการราคา 0 ไม่มีบัญชี → null (แยก "ตั้ง 0" กับ "ยังไม่ตั้ง" ไม่ได้)
    // สินค้าจำนวนมากเกินเพดาน 200 ของหน้าขายเดิม (S1.37) — createMany คำสั่งเดียว
    await P.invItem.createMany({ data: Array.from({ length: BULK }, (_, i) => ({ tenantId: cfT, systemId: sysC.INVENTORY, sku: `${TAG}-bulk-${String(i).padStart(3, "0")}`, name: `${TAG} bulk ${i}` })) });
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
    // ── round 2 fixtures ──
    // C7 ทีละขั้น (คลังร้านกาแฟ · สมุดบัญชีที่ผูก POS = sysC.ACCOUNT)
    fx.tempAcc = await P.appSystem.create({ data: { tenantId: cfT, type: "ACCOUNT", name: `${TAG} สมุดบัญชีอื่น` } });
    const c7 = async (sfx: string, sale: number | null, pos: number | null, o: Any = {}, inv: Record<string, unknown> = {}) => {
      const it = await mkInv(cfT, sysC.INVENTORY, sfx, inv);
      await mkAp(cfT, o.acc ?? sysC.ACCOUNT, it, sale, 700, pos, o);
      return it;
    };
    fx.p2 = await c7("c7-pos-enabled", null, 4400, { posEnabled: true });          // → 4400
    fx.p3 = await c7("c7-pos-disabled", null, 4300, { posEnabled: false });        // → null
    fx.p4 = await c7("c7-ap-archived", 3000, null, { archivedAt: new Date() });     // → null
    fx.p5 = await c7("c7-ap-foreign", 3100, null, { acc: fx.tempAcc.id });          // → null (สมุดบัญชีอื่น)
    fx.p6 = await c7("c7-half-link", 3200, null, { halfLink: true });               // → null (มีแต่ AP.invItemId)
    fx.p7 = await c7("c7-sold-at-cost", 0, null, {}, { costSatang: 900 });          // → null + soldAtCostToday
    fx.p8 = await c7("c7-zero-free", 0, null, {}, { costSatang: 0 });               // → 0 + zeroPriceProduct
    fx.p9 = await c7("c7-negative", -100, null);                                    // → null + invalidLegacyPrice
    fx.mZero = await mkMenu("c7-menu-zero", { basePrice: 0 });                      // → 0 + zeroPriceMenu
    fx.mNeg = await mkMenu("c7-menu-negative", { basePrice: -500 });                // → null + invalidLegacyPrice
    fx.sZero = await mkShop("c7-shop-zero", 0);                                     // → 0 + zeroPriceWeb
    // C5 บาร์โค้ดซ้ำใน legacy (InvItem.barcode ไม่ unique)
    fx.dupA = await mkInv(cfT, sysC.INVENTORY, "dup-a", { barcode: `98${RAND}55` });
    fx.dupB = await mkInv(cfT, sysC.INVENTORY, "dup-b", { barcode: `98${RAND}55` });
    // C3 POS ชั่วคราว 2 สาขา 2 คลัง (ไม่แตะ POS/คลังของ seed — แยกเป็นระบบใหม่ทั้งชุด)
    fx.tPos = await P.appSystem.create({ data: { tenantId: cfT, type: "POS", name: `${TAG} POS สองคลัง` } });
    fx.tInvX = await P.appSystem.create({ data: { tenantId: cfT, type: "INVENTORY", name: `${TAG} คลัง X` } });
    fx.tInvY = await P.appSystem.create({ data: { tenantId: cfT, type: "INVENTORY", name: `${TAG} คลัง Y` } });
    fx.uA = await P.businessUnit.create({ data: { tenantId: cfT, type: "SHOP", name: `${TAG} สาขา A`, slug: `${TAG}-a` } });
    fx.uB = await P.businessUnit.create({ data: { tenantId: cfT, type: "SHOP", name: `${TAG} สาขา B`, slug: `${TAG}-b` } });
    for (const [u, sys, type] of [[fx.uA.id, fx.tPos.id, "POS"], [fx.uA.id, fx.tInvX.id, "INVENTORY"], [fx.uB.id, fx.tPos.id, "POS"], [fx.uB.id, fx.tInvY.id, "INVENTORY"]] as const)
      await P.appSystemUnit.create({ data: { tenantId: cfT, systemId: sys, unitId: u, type } });
    fx.itX = await mkInv(cfT, fx.tInvX.id, "wh-x", { barcode: `97${RAND}01`, onHand: 7 });
    fx.itY = await mkInv(cfT, fx.tInvY.id, "wh-y", { barcode: `97${RAND}02`, onHand: 9 });
    // C9 เว็บร้าน (สาขาสีลม · POS แรก = POS ของ seed)
    fx.shInactive = await P.shopProduct.create({ data: { tenantId: cfT, unitId: SILOM, name: `${TAG} shop-inactive`, priceSatang: 1000, invItemId: fx.water.id, active: false } }); // a: inactive linked
    fx.shOutside = await mkShop("shop-outside-first-pos", 3333, fx.itX.id);        // b: InvItem นอกคลังของ POS แรก
    fx.shDangling = await mkShop("shop-dangling", 4444, `${TAG}-ghost-item`);       // c: InvItem ไม่มีแล้ว
    // C12 สาขาเก็บถาวรที่ยังผูก POS ของ seed + POS ปิดใช้งานที่เก่ากว่า
    fx.archUnit = await P.businessUnit.create({ data: { tenantId: cfT, type: "RESTAURANT", name: `${TAG} สาขาปิด`, slug: `${TAG}-closed`, status: "ARCHIVED" } });
    await P.appSystemUnit.create({ data: { tenantId: cfT, systemId: sysC.POS, unitId: fx.archUnit.id, type: "POS" } });
    fx.archCat = await P.menuCategory.create({ data: { tenantId: cfT, unitId: fx.archUnit.id, name: `${TAG} cat-arch` } });
    fx.archSt = await P.kdsStation.create({ data: { tenantId: cfT, unitId: fx.archUnit.id, name: `${TAG} st-arch` } });
    fx.archMenu = await mkMenu("menu-in-archived-branch", { basePrice: 1234 }, fx.archUnit.id, cfT, fx.archCat.id, fx.archSt.id);
    // ── round 3 fixtures ──
    // D1 ร้าน "สาขาเดียว" = POS ชั่วคราวที่มีสาขาเดียว (ไม่มีคลัง)
    fx.tPos1 = await P.appSystem.create({ data: { tenantId: cfT, type: "POS", name: `${TAG} POS สาขาเดียว` } });
    fx.uS = await P.businessUnit.create({ data: { tenantId: cfT, type: "SHOP", name: `${TAG} สาขาเดียว`, slug: `${TAG}-single` } });
    await P.appSystemUnit.create({ data: { tenantId: cfT, systemId: fx.tPos1.id, unitId: fx.uS.id, type: "POS" } });
    // D3 บริการที่ราคาคลัง ≠ ราคาบัญชี (ราคาลิ้นชัก = salePrice 12000) · D6 เว็บร้านราคา 0 ที่ผูกน้ำดื่ม (ราคาสุดท้าย = ราคาบัญชี ⇒ ไม่นับ zeroPriceWeb)
    fx.svcDiff = await mkInv(cfT, sysC.INVENTORY, "d3-svc-diff", { kind: "SERVICE", priceSatang: 15000 });
    await mkAp(cfT, sysC.ACCOUNT, fx.svcDiff, 12000);
    fx.shZeroLinked = await mkShop("d6-shop-zero-linked", 0, fx.water.id);
    fx.oldPos = await P.appSystem.create({ data: { tenantId: cfT, type: "POS", name: `${TAG} POS ปิดใช้งาน`, active: false, createdAt: new Date("2000-01-01T00:00:00Z") } });
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
  let drySummary: Any = null;
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
    drySummary = dry.summary;
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
  await section("invariants", ["S3.30", "S3.39", "S3.12", "S3.13", "S3.15", "S3.16", "S3.17", "S1.9", "S1.10", "S1.11", "S1.12", "S1.13", "S1.14", "S1.15", "S1.16", "S1.17", "S1.18"], async () => {
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
    // แถวของ InvItem ในระบบ POS ที่ขายมัน (round 2: InvItem เดียวกันมีแถวใน POS อื่นได้ — C9b แถวของเว็บร้านใน POS แรก)
    const inSys = (i: Any) => (byInv.get(i.id) ?? []).filter((p) => p.systemId === iPos.get(i.systemId)![0]);
    const notOne = sellable.filter((i) => inSys(i).length !== 1).map((i) => `${i.sku}:${inSys(i).length}`);
    const shopOwnInv = new Set(shops.map((x) => x.posProductId).filter(Boolean));
    const unsellableWithProd = invs.filter((i) => (iPos.get(i.systemId) ?? []).length !== 1 && (byInv.get(i.id) ?? []).some((p) => !shopOwnInv.has(p.id))).map((i) => i.sku);
    const orphan = prods.filter((p) => (p.invItemId && (!invById.has(p.invItemId) || invById.get(p.invItemId).tenantId !== p.tenantId)) || !posSystems.has(`${p.tenantId}/${p.systemId}`)).map((p) => p.id);
    chk("S1.9", sellable.length > 0 && notOne.length === 0 && unsellableWithProd.length === 0 && orphan.length === 0,
      `InvItem ที่ขายได้ ${sellable.length} ตัว → 1 แถวต่อตัว (systemId ตรง) · กำพร้า 0`, `ไม่ใช่ 1/ระบบผิด: ${notOne.slice(0, 6).join(",") || "-"} · ไม่ผูก POS แต่มีแถว: ${unsellableWithProd.join(",") || "-"} · กำพร้า/ข้ามร้าน ${orphan.length}`);
    // S1.10
    const recipes = await rowsOf("RecipeLine", QC_TIDS);
    const badMenu: string[] = [];
    const menuLinks = new Map<string, number>();
    for (const m of menus) {
      if (!uPos.has(m.unitId)) { if (m.posProductId) badMenu.push(`${m.name}:สาขาไม่มี POS แต่ผูก`); continue; }
      const p = prodMap.get(m.posProductId);
      if (!p) { badMenu.push(`${m.name}:ไม่มีลิงก์`); continue; }
      menuLinks.set(p.id, (menuLinks.get(p.id) ?? 0) + 1);
      if (p.tenantId !== m.tenantId || p.kind !== "MENU" || p.unitId !== m.unitId || p.systemId !== uPos.get(m.unitId) || p.invItemId !== null)
        badMenu.push(`${m.name}:kind ${p.kind} unit ${p.unitId === m.unitId} sys ${p.systemId === uPos.get(m.unitId)} inv ${p.invItemId ?? null}`);
      const rl = recipes.filter((r) => r.productId === p.id);
      if (m.invItemId ? !(rl.length === 1 && rl[0].invItemId === m.invItemId && Number(rl[0].qty) === 1) : rl.length !== 0)
        badMenu.push(`${m.name}:RecipeLine ${rl.length}${rl[0] ? ` (${rl[0].invItemId === m.invItemId ? "inv ✓" : "inv ✗"} qty ${rl[0].qty})` : ""}`);
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
      const inv = s.invItemId ? invById.get(s.invItemId) : null;
      const invInFirst = !!inv && (iPos.get(inv.systemId) ?? []).length === 1 && iPos.get(inv.systemId)![0] === sys;
      if (s.invItemId && invInFirst) { if (p.invItemId !== s.invItemId || p.systemId !== sys) badShop.push(`${s.name}:ไม่ชี้แถวของ InvItem ใน POS ${sys}`); } // C9a
      else if (s.invItemId && inv) { if (p.systemId !== sys || p.invItemId !== s.invItemId || p.unitId !== s.unitId) badShop.push(`${s.name}:C9b sys ${p.systemId === sys} inv ${p.invItemId === s.invItemId} unit ${p.unitId === s.unitId}`); } // C9b
      else if (p.kind !== "PRODUCT" || p.unitId !== s.unitId || p.invItemId !== null || p.systemId !== sys) badShop.push(`${s.name}:kind ${p.kind} unit ${p.unitId === s.unitId} inv ${p.invItemId} sys ${p.systemId === sys}`); // C9c/d
    }
    const noPosShopLinked = !!shops.find((x) => x.id === fx.noPosShop.id)?.posProductId;
    chk("S1.11", badShop.length === 0 && shops.length > 0 && noPosShopLinked, `เว็บร้าน ${shops.length} ตัวผูกถูกทาง (รวมสาขาที่ไม่ผูก POS)`, `${badShop.slice(0, 5).join(" · ") || "ครบ"} · สาขาไม่มี POS ${noPosShopLinked ? "ผูกแล้ว" : "ไม่ผูก"}`);
    // S1.12
    const cokeP = byInv.get(fx.coke.id) ?? []; const waterP = byInv.get(fx.water.id) ?? [];
    const mCokeLink = menus.find((m) => m.id === fx.mCoke.id)?.posProductId; const shLink = shops.find((s) => s.id === fx.shShared.id)?.posProductId;
    const mCokeP = prodMap.get(mCokeLink); const mCokeRl = recipes.filter((r) => r.productId === mCokeLink);
    chk("S1.12", cokeP.length === 1 && cokeP[0]?.kind === "PRODUCT" && cokeP[0]?.basePriceSatang === 2000 && !!mCokeP && mCokeP.id !== cokeP[0]?.id && mCokeP.kind === "MENU" && mCokeP.invItemId === null && mCokeP.basePriceSatang === 2500 && mCokeRl.length === 1 && mCokeRl[0].invItemId === fx.coke.id &&
      waterP.length === 1 && shLink === waterP[0]?.id && waterP[0]?.unitId === null,
      "โค้ก PRODUCT 2000 + เมนูโค้ก MENU 2500 (inv null · RecipeLine→โค้ก) · น้ำดื่ม 1 แถว (unitId null) · เว็บร้านชี้น้ำดื่ม",
      `โค้ก ${cokeP.length} (${cokeP[0]?.kind} ${cokeP[0]?.basePriceSatang}) · เมนูโค้ก ${mCokeP ? `${mCokeP.kind} ${mCokeP.basePriceSatang} inv ${mCokeP.invItemId}` : "ไม่มี"} · recipe ${mCokeRl.length} · น้ำ ${waterP.length} (unit ${waterP[0]?.unitId}) · shop→${shLink === waterP[0]?.id}`);
    // S3.2 (C2) backfill ทิ้ง trackStock = null (AUTO) — ทุกแถวที่รันนี้สร้าง (แถวเดิมของ seed ถูกสร้างใหม่ตอนผู้สร้างซ้อม rollback M6)
    const preIds = snapNew0.PosProduct ?? new Map();
    const madeNow = prods.filter((p) => !preIds.has(p.id));
    const tsNotNull = madeNow.filter((p) => p.trackStock !== null).map((p) => `${p.name}:${p.trackStock}`);
    const seedTs = prods.filter((p) => preIds.has(p.id) && p.trackStock !== null).length;
    fx.s32 = { ok: madeNow.length > 0 && tsNotNull.length === 0, msg: `แถวใหม่ ${madeNow.length} · ไม่ใช่ null ${tsNotNull.length}${tsNotNull.length ? ` (${tsNotNull.slice(0, 3).join(",")})` : ""} · แถวเดิม (ก่อนรัน) ที่ยังไม่ใช่ null ${seedTs}` };
    // S1.13–S1.14 ราคา (R2)
    const aps = await rowsOf("AccountProduct", QC_TIDS);
    const apById = new Map(aps.map((a) => [a.id, a]));
    // C7/C8: AccountProduct หาแบบลิ้นชักวันนี้เท่านั้น (InvItem.accountProductId → AP) · ไม่เก็บถาวร · อยู่ในสมุดบัญชีที่ผูก POS นี้ (findAccountLinkForPos)
    const acctLinks = await q<{ linkedId: string; systemId: string }>(`select "linkedId", "systemId" from "AccountSystemLink" where "tenantId" = any($1::text[]) and "linkedKind" = 'POS' and "archivedAt" is null and enabled`, QC_TIDS);
    const acctOfPos = new Map(acctLinks.map((l) => [l.linkedId, l.systemId]));
    const vatRows = await q<{ systemId: string; vatRegistered: boolean }>(`select "systemId", "vatRegistered" from "AccountSettings" where "tenantId" = any($1::text[])`, QC_TIDS);
    const vatReg = (accSys: string | undefined) => !!accSys && (vatRows.find((r) => r.systemId === accSys)?.vatRegistered ?? true);
    const apStrict = (p: Any): Any | null => {
      const inv = p.invItemId ? invById.get(p.invItemId) : null;
      const ap = inv?.accountProductId ? apById.get(inv.accountProductId) : null;
      return ap && !ap.archivedAt && ap.systemId === acctOfPos.get(p.systemId) ? ap : null;
    };
    const legal = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= 2_147_483_647;
    const expectPrice = (p: Any): number | null => {
      const inv = p.invItemId ? invById.get(p.invItemId) : null;
      const ap = apStrict(p);
      if (ap && legal(ap.salePrice) && ap.salePrice > 0) return ap.salePrice; // 1
      if (ap && ap.posEnabled && legal(ap.posPrice) && ap.posPrice > 0) return ap.posPrice; // 2
      if (inv?.kind === "SERVICE" && legal(inv.priceSatang) && inv.priceSatang > 0) return inv.priceSatang; // 3
      const m = menus.find((x) => x.posProductId === p.id);
      if (m) return legal(m.basePrice) ? m.basePrice : null; // 4 (0 คงไว้)
      // แถวของเว็บร้านเอง (C9b/c/d: unitId = สาขาร้าน) — แถวที่มาจาก InvItem มี unitId null
      const sp = shops.find((x) => x.posProductId === p.id && p.unitId !== null && p.unitId === x.unitId);
      if (sp) return legal(sp.priceSatang) ? sp.priceSatang : null;
      if (ap && ap.salePrice === 0 && Number(inv?.costSatang ?? 0) === 0) return 0; // ฟรีวันนี้ ฟรีพรุ่งนี้
      return null; // 5 — ไม่ใช้ต้นทุนเด็ดขาด
    };
    const seedProducts = [...CF.items, ...RS.items].filter((i: Any) => i.kind === "PRODUCT");
    const badSeed = seedProducts.filter((i: Any) => byInv.get(i.id)?.[0]?.basePriceSatang !== i.salePrice).map((i: Any) => `${i.sku}:${byInv.get(i.id)?.[0]?.basePriceSatang}≠${i.salePrice}`);
    chk("S1.13", badSeed.length === 0, "ทุกตัว = salePrice (FREE/ICE = 0)", badSeed.join(" · ") || `ตรง ${seedProducts.length} ตัว`);
    const badAll = prods.filter((p) => (p.basePriceSatang ?? null) !== expectPrice(p)).map((p) => `${p.name}:${p.basePriceSatang ?? null}≠${expectPrice(p)}`);
    const pOf = (rows: Any[], id: string) => prodMap.get(rows.find((x) => x.id === id)?.posProductId);
    const pInv = (it: Any) => (byInv.get(it.id) ?? [])[0]?.basePriceSatang;
    const rung = {
      saleBeatsPos: byInv.get(fx.posPrice.id)?.[0]?.basePriceSatang === 5000,
      posZero: byInv.get(fx.posZero.id)?.[0]?.basePriceSatang === 5000,
      svcZeroNull: byInv.get(fx.svcZero.id)?.[0]?.basePriceSatang === null,
      service: byInv.get(fx.gift.id)?.[0]?.basePriceSatang === 15000,
      menu: pOf(menus, fx.mOpt.id)?.basePriceSatang === 9900,
      shopOnly: pOf(shops, fx.shOnly.id)?.basePriceSatang === 12345,
      costOnlyNull: byInv.get(fx.costOnly.id)?.[0]?.basePriceSatang === null,
      cokeProduct: cokeP[0]?.basePriceSatang === 2000,
      menuCokeBase: pOf(menus, fx.mCoke.id)?.basePriceSatang === 2500,
    };
    chk("S1.14", badAll.length === 0 && Object.values(rung).every(Boolean), "salePrice ชนะ posPrice 5000 · posPrice0→5000 · SERVICE 15000 · SERVICE 0 → null · เมนู 9900 · เว็บล้วน 12345 · ต้นทุนอย่างเดียว null · โค้ก PRODUCT 2000 · เมนูโค้ก 2500 · ทุกแถวตรงสูตร",
      `ไม่ตรง: ${badAll.slice(0, 5).join(" · ") || "-"} · ${Object.entries(rung).map(([k, v]) => `${k}${v ? "✓" : "✗"}`).join(" ")}`);
    // S1.15 VAT
    const badVat = prods.filter((p) => { const ap = apStrict(p); return (p.vatRateBp ?? null) !== (ap && vatReg(acctOfPos.get(p.systemId)) ? ap.vatRateBp : null); }).map((p) => p.name);
    const egg = byInv.get(itemBySku(CF, "PQC-CF-EGG").id)?.[0];
    chk("S1.15", badVat.length === 0 && egg?.vatRateBp === 0 && byInv.get(fx.costOnly.id)?.[0]?.vatRateBp === null, "ตาม AccountProduct · ไข่ 0 · ไม่มีบัญชี null", `ไม่ตรง: ${badVat.slice(0, 5).join(",") || "-"} · ไข่ ${egg?.vatRateBp}`);
    // S3.12 (C7) ทีละขั้น
    const c7r = { posEnabled4400: pInv(fx.p2) === 4400, posDisabledNull: pInv(fx.p3) === null, apArchivedNull: pInv(fx.p4) === null, foreignBookNull: pInv(fx.p5) === null,
      halfLinkNull: pInv(fx.p6) === null, soldAtCostNull: pInv(fx.p7) === null, zeroFree0: pInv(fx.p8) === 0, negativeNull: pInv(fx.p9) === null,
      menuZero0: pOf(menus, fx.mZero.id)?.basePriceSatang === 0, menuNegNull: pOf(menus, fx.mNeg.id) !== undefined && pOf(menus, fx.mNeg.id)?.basePriceSatang === null, shopZero0: pOf(shops, fx.sZero.id)?.basePriceSatang === 0 };
    chk("S3.12", Object.values(c7r).every(Boolean), "ทุกขั้นตรง", Object.entries(c7r).map(([k, v]) => `${k}${v ? "✓" : "✗"}`).join(" "));
    // S3.13 / S3.15–S3.17 ตัวนับใน dry-run (ค่าในร้าน QC ≥ ที่ fixture ของรันนี้ทำให้เกิด) — อ่านจาก summary.counts.<ชื่อ> หรือ summary.<ชื่อ>
    const cnt = (k: string): number | undefined => { const v = drySummary?.counts?.[k] ?? drySummary?.[k]; return typeof v === "number" ? v : undefined; };
    const atLeast = (k: string, n: number) => (cnt(k) ?? -1) >= n;
    const dryText = JSON.stringify(drySummary ?? {});
    const s313 = { soldAtCostToday: atLeast("soldAtCostToday", 2), sample: dryText.includes(fx.p7.name) && dryText.includes(fx.costOnly.name), zeroPriceProduct: atLeast("zeroPriceProduct", 1),
      zeroPriceMenu: atLeast("zeroPriceMenu", 1), zeroPriceWeb: atLeast("zeroPriceWeb", 1), invalidLegacyPrice: atLeast("invalidLegacyPrice", 2), posPriceDiffersFromSalePrice: atLeast("posPriceDiffersFromSalePrice", 1) };
    chk("S3.13", Object.values(s313).every(Boolean), "ตัวนับครบ ≥ fixture + ตัวอย่างชื่อขายราคาทุน", Object.entries(s313).map(([k, v]) => `${k}${v ? "✓" : `✗(${cnt(k) ?? "ไม่มี"})`}`).join(" "));
    const waterNow = waterP[0];
    chk("S3.15", atLeast("shopPriceDiffersFromCatalog", 1) && atLeast("shopInactiveLinked", 1) && shops.find((x) => x.id === fx.shInactive.id)?.posProductId === waterNow?.id && waterNow?.basePriceSatang === 1000 && !(waterNow?.unavailableUnitIds ?? []).length,
      "ชี้น้ำดื่มเดิม · น้ำดื่มคง 1000 เปิดขาย · นับ 2 ชื่อ", `diff ${cnt("shopPriceDiffersFromCatalog") ?? "ไม่มี"} · inactive ${cnt("shopInactiveLinked") ?? "ไม่มี"} · ลิงก์ ${shops.find((x) => x.id === fx.shInactive.id)?.posProductId === waterNow?.id} · น้ำ ${waterNow?.basePriceSatang}/${(waterNow?.unavailableUnitIds ?? []).length}`);
    const outP = pOf(shops, fx.shOutside.id);
    chk("S3.16", !!outP && outP.systemId === tPos.get(cfT) && outP.invItemId === fx.itX.id && outP.unitId === SILOM && atLeast("shopOwnRowInvItemOutsideFirstPos", 1),
      "แถวของตัวเองใน POS แรก invItemId=X unitId=สีลม + นับ", `${outP ? `sys ${outP.systemId === tPos.get(cfT)} inv ${outP.invItemId === fx.itX.id} unit ${outP.unitId === SILOM}` : "ไม่ผูก"} · นับ ${cnt("shopOwnRowInvItemOutsideFirstPos") ?? "ไม่มี"}`);
    const dP = pOf(shops, fx.shDangling.id); const npP = pOf(shops, fx.noPosShop.id);
    chk("S3.17", !!dP && dP.invItemId === null && dP.systemId === tPos.get(cfT) && atLeast("shopDanglingInvItem", 1) && !!npP && npP.unitId === fx.noPosUnit.id && atLeast("shopBranchNotInFirstPos", 1),
      "dangling = แถวตัวเอง inv null + นับ · สาขานอก POS แรก unitId สาขาร้าน + นับ", `dangling ${dP ? `inv ${dP.invItemId}` : "ไม่ผูก"} · ${cnt("shopDanglingInvItem") ?? "ไม่มี"} · นอก POS ${npP ? `unit ${npP.unitId === fx.noPosUnit.id}` : "ไม่ผูก"} · ${cnt("shopBranchNotInFirstPos") ?? "ไม่มี"}`);
    // S3.30 (D3) ตัวนับใหม่ + ตัวอย่าง · S3.39 zeroPriceWeb ตรงเป๊ะ
    const s330 = { apIgnoredButTillPriced: atLeast("apIgnoredButTillPriced", 2), priceNotSetOther: atLeast("priceNotSetOther", 3), servicePriceDiffersFromAccountProduct: atLeast("servicePriceDiffersFromAccountProduct", 1),
      sampleApIgnored: dryText.includes(fx.p4.name) && dryText.includes(fx.p5.name), samplePriceNotSet: dryText.includes(fx.p3.name) && dryText.includes(fx.p6.name), svcDiffPrice: pInv(fx.svcDiff) === 12000 };
    chk("S3.30", Object.values(s330).every(Boolean), "นับ ≥ fixture (2 · 3 · 1) + ตัวอย่างชื่อ · บริการคิด salePrice 12000", Object.entries(s330).map(([k, v]) => `${k}${v ? "✓" : `✗(${cnt(k) ?? "-"})`}`).join(" "));
    chk("S3.39", cnt("zeroPriceWeb") === 1 && pOf(shops, fx.shZeroLinked.id)?.id === waterP[0]?.id, "zeroPriceWeb = 1 (เฉพาะเว็บล้วนราคา 0) · ราคา 0 ที่ผูกน้ำดื่มชี้แถวน้ำดื่ม", `zeroPriceWeb ${cnt("zeroPriceWeb") ?? "ไม่มี"} · ลิงก์ ${pOf(shops, fx.shZeroLinked.id)?.id === waterP[0]?.id}`);
    // S3.20 (C12) ส่วน backfill: เมนูในสาขาเก็บถาวรไม่ถูกผูก · POS ปิดใช้งานที่เก่ากว่าไม่ถูกเลือก (เว็บร้านผูก POS ของ seed)
    fx.s320 = { archMenuUnlinked: !menus.find((x) => x.id === fx.archMenu.id)?.posProductId, shopsOnSeedPos: pOf(shops, fx.shOnly.id)?.systemId === sysC.POS, noProdOnOldPos: !prods.some((x) => x.systemId === fx.oldPos.id) };
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
  const catIds = ["S3.27", "S3.28", "S3.29", "S3.33", "S3.34", "S3.35", "S3.36", "S3.37", "S3.38", "S3.1", "S3.2", "S3.3", "S3.4", "S3.5", "S3.6", "S3.7", "S3.8", "S3.9", "S3.10", "S3.11", "S3.14", "S3.18", "S3.19", "S3.20", "S3.21", "S1.19", "S1.20", "S1.26", "S1.37", "S1.38", "S1.39", "S1.40", "S1.41", "S1.27", "S1.28", "S1.29", "S1.30", "S1.31", "S1.32", "S1.33", "S1.34", "S1.35", "X2.1", "X2.2", "X2.3", "X3.1", "X3.2", "X3.3", "X6.2", "X6.3", "X6.4", "X8.1"];
  await section("catalog", catIds, async () => {
    catalog = await load("@/lib/modules/pos/catalog");
    const FN = ["createProduct", "updateProduct", "setPrice", "archive", "listForUnit", "byBarcode", "ensureForInvItem", "createCategory"];
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
    chk("S1.19", bcItems(bw.value).some((x) => idOf(x) === waterP?.id) && bcItems(bc.value).some((x) => idOf(x) === cokeP?.id), `items มีน้ำ ${waterP?.id} · โค้ก ${cokeP?.id}`, `${bw.ok ? `items ${bcItems(bw.value).length} (ทรง ${Array.isArray(bw.value?.items) ? "{items}" : typeof bw.value})` : bw.err} · ${bc.ok ? `items ${bcItems(bc.value).length}` : bc.err}`);
    const archP = (await prodByInv(fx.arch.id))[0];
    const listCf = await listAll(C, ctxOwner, SILOM);
    const listIds = new Set(listCf.items.map(idOf));
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
    for (const [label, input] of badInputs) { const r = await attempt(() => C.createProduct(ctxOwner, input)); if (!refused(r, label === "บาร์โค้ดซ้ำ" ? "CONFLICT" : "VALIDATION")) accepted.push(`${label}→${codeOf(r)}`); }
    chk("S1.28", accepted.length === 0 && (await countProducts(cfT)) === pc1 && (await countWhere("InvItem", cfT)) === ic1, "VALIDATION ×3 · CONFLICT ×1 · ไม่มีแถวเพิ่ม", `ผิดสัญญา: ${accepted.join(",") || "-"} · PosProduct +${(await countProducts(cfT)) - pc1} · InvItem +${(await countWhere("InvItem", cfT)) - ic1}`);
    // updateProduct
    const pid = np?.id as string;
    const anyCat = (await rowsOf("PosCategory", [cfT]))[0] ?? (await rowsOf("PosCategory", [rsT]))[0] ?? null;
    const sameTenantCat = anyCat?.tenantId === cfT ? anyCat : null;
    const up = await attempt(() => C.updateProduct(ctxOwner, pid, { name: `${TAG} ชื่อใหม่`, nameEn: `${TAG} renamed`, ...(sameTenantCat ? { categoryId: sameTenantCat.id } : {}) }));
    const npu = await prodById(pid);
    const inList = (await listAll(C, ctxOwner, SILOM)).items.find((x) => idOf(x) === pid);
    chk("S1.29", up.ok && npu?.name === `${TAG} ชื่อใหม่` && npu?.nameEn === `${TAG} renamed` && (!sameTenantCat || npu?.categoryId === sameTenantCat.id) && inList?.name === `${TAG} ชื่อใหม่` && (await countProducts(cfT)) === pc1,
      "ชื่อ/ชื่ออังกฤษ/หมวด เปลี่ยน · list เห็น", up.ok ? `${npu?.name} · ${npu?.nameEn} · cat ${npu?.categoryId} · list ${inList?.name}` : `ปฏิเสธ: ${up.err}`);
    // setPrice
    const s1 = await attempt(() => C.setPrice(ctxOwner, pid, 3999)); const p3999 = (await prodById(pid))?.basePriceSatang;
    const s0 = await attempt(() => C.setPrice(ctxOwner, pid, 0)); const p0 = (await prodById(pid))?.basePriceSatang;
    await attempt(() => C.setPrice(ctxOwner, pid, 3999));
    const badOk: string[] = [];
    for (const b of [-100, 10.5, Number.NaN, "100" as Any]) { const r = await attempt(() => C.setPrice(ctxOwner, pid, b)); if (!refused(r, "VALIDATION")) badOk.push(`${String(b)}→${codeOf(r)}`); }
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
    const envOk = lf.ok && !!lf.value && typeof lf.value === "object" && !Array.isArray(lf.value) && Array.isArray(lf.value.items) && "nextCursor" in lf.value;
    if (!envOk) shapeBad.push("ไม่ใช่ {items, nextCursor}");
    chk("S1.32", lf.ok && envOk && rows.length > 0 && shapeBad.length === 0, `{items, nextCursor} · ${KEYS.join(",")}`, lf.ok ? `${rows.length} แถว · ${[...new Set(shapeBad)].slice(0, 5).join(" · ") || "ทรงถูก"}` : `ปฏิเสธ: ${lf.err}`);
    // listForUnit เนื้อหา: สินค้าผูกสาขาอารีย์ต้องไม่โผล่ที่สีลม
    const ariP = await attempt(() => C.createProduct(ctxOwner, { name: `${TAG} เฉพาะอารีย์`, basePriceSatang: 1500, unitId: ARI }));
    const ariId = idOf(ariP.value);
    const rows2 = (await listAll(C, ctxOwner, SILOM)).items;
    const rowsAri = (await listAll(C, ctxOwner, ARI)).items;
    // C3: แถวผูก InvItem เห็นที่สาขาเฉพาะเมื่อ InvItem อยู่คลังของสาขานั้น (สีลม = คลัง seed)
    const invSysOf = new Map((await q<{ id: string; systemId: string }>(`select id, "systemId" from "InvItem" where "tenantId" = $1`, cfT)).map((r) => [r.id, r.systemId]));
    const cfActive = (await rowsOf("PosProduct", [cfT])).filter((p) => !p.archivedAt && p.systemId === sysC.POS && (p.unitId === null || p.unitId === SILOM) && (!p.invItemId || invSysOf.get(p.invItemId) === sysC.INVENTORY)).map((p) => p.id);
    const ids2 = new Set(rows2.map(idOf));
    const missing = cfActive.filter((id) => !ids2.has(id));
    const crois = itemBySku(CF, "PQC-CF-CROIS");
    const croisRow = rows2.find((r) => r.invItemId === crois.id);
    const croisOnHand = (await q(`select "onHand" from "InvItem" where id = $1`, crois.id))[0]?.onHand;
    const optLink = await linkOf("MenuItem", fx.mOpt.id);
    const optRow = (await listAll(C, ctxRsOwner, RMAIN)).items.find((r) => idOf(r) === optLink);
    const choicesOk = !!optRow && optRow.optionGroups?.length === 2 && optRow.optionGroups.every((g: Any) => Array.isArray(g.choices) && g.choices.length > 0 && g.choices.every((c: Any) => isInt(c.priceDelta ?? c.priceDeltaSatang)));
    chk("S1.33", ariP.ok && missing.length === 0 && !ids2.has(ariId) && rowsAri.some((r) => idOf(r) === ariId) && croisRow?.stock?.[SILOM] === croisOnHand && croisRow?.availability?.[SILOM] === true && choicesOk,
      `active ครบ ${cfActive.length} · ของอารีย์ไม่โผล่สีลม · stock[สีลม]=${croisOnHand} · availability=true · ตัวเลือก 2 กลุ่ม`,
      `ขาด ${missing.length} · อารีย์@สีลม ${ids2.has(ariId)} · อารีย์@อารีย์ ${rowsAri.some((r) => idOf(r) === ariId)}${ariP.ok ? "" : ` (สร้างไม่ได้: ${ariP.err})`} · stock ${croisRow?.stock?.[SILOM]} · avail ${croisRow?.availability?.[SILOM]} · ตัวเลือก ${choicesOk ? "✓" : `✗ (${optRow ? optRow.optionGroups?.length : "ไม่พบเมนู"})`}`);
    const bu = await attempt(() => C.byBarcode(ctxOwner, SILOM, `99${RAND}000`));
    chk("S1.34", bcItems(bw.value).length === 1 && idOf(bcItems(bw.value)[0]) === waterP?.id && bu.ok && Array.isArray(bu.value?.items) && bu.value.items.length === 0, "{items:[น้ำ]} · ไม่มี = {items:[]}", `น้ำ ${bw.ok ? bcItems(bw.value).length : bw.err} · ไม่มี → ${bu.ok ? JSON.stringify(bu.value ?? null).slice(0, 60) : bu.err}`);
    // ensureForInvItem
    const eInv = await mkInv(cfT, sysC.INVENTORY, "ensure"); await mkAp(cfT, sysC.ACCOUNT, eInv, 6100, 0);
    const e1 = await attempt(() => C.ensureForInvItem(ctxSys(cfT, sysC.POS), eInv.id));
    const e2 = await attempt(() => C.ensureForInvItem(ctxSys(cfT, sysC.POS), eInv.id));
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
      if (items.length > 50) overLimit = true;
      for (const it of items) { const k = idOf(it) as string; if (seen.has(k)) dupSeen++; seen.add(k); }
      cursor = pg.value?.nextCursor ?? null;
      if (!cursor || items.length === 0 || pages > 40) break;
    }
    const bulkIds = new Set((await q<{ id: string }>(`select p.id from "PosProduct" p join "InvItem" i on i.id = p."invItemId" where i.sku like $1`, `${TAG}-bulk-%`)).map((r) => r.id));
    const bulkSeen = [...bulkIds].filter((id) => seen.has(id)).length;
    chk("S1.37", hasWater(qName) && hasWater(qSku) && hasWater(qBar) && narrow(qName) && narrow(qSku) && narrow(qBar) && bulkIds.size === BULK && bulkSeen === BULK && dupSeen === 0 && !overLimit,
      `ชื่อ/SKU/บาร์โค้ด เจอน้ำดื่ม (ผลแคบ) · เดินทุกหน้าเห็น bulk ${BULK}/${BULK} · ไม่ซ้ำ · หน้าละ ≤50`,
      `ชื่อ ${qName.ok ? listOf(qName.value).length : qName.err} · sku ${qSku.ok ? listOf(qSku.value).length : qSku.err} · barcode ${qBar.ok ? listOf(qBar.value).length : qBar.err} · bulk ${bulkSeen}/${bulkIds.size} · หน้า ${pages} · ซ้ำ ${dupSeen} · เกินหน้า ${overLimit}`);
    // S1.38 AuditLog
    const auditOf = async (id: string) => q<{ action: string; actorId: string | null; createdAt: Date }>(`select action, "actorId", "createdAt" from "AuditLog" where "tenantId" = $1 and "targetType" = 'PosProduct' and "targetId" = $2 and "createdAt" >= $3`, cfT, id, t0);
    // archive
    const ar1 = await attempt(() => C.archive(ctxOwner, pid)); const ar2 = await attempt(() => C.archive(ctxOwner, pid));
    const afterList = new Set((await listAll(C, ctxOwner, SILOM)).items.map(idOf));
    const pa = await prodById(pid);
    chk("S1.31", ar1.ok && ar2.ok && !!pa?.archivedAt && !afterList.has(pid), "soft · ไม่อยู่ใน list · กดซ้ำได้", `${ar1.ok ? "✓" : ar1.err} ${ar2.ok ? "✓" : ar2.err} · archivedAt ${pa?.archivedAt ? "✓" : "null"} · list ${afterList.has(pid)}`);
    const au = await auditOf(pid);
    const auActs = au.map((a) => a.action);
    chk("S1.38", au.length >= 4 && au.every((a) => a.actorId === cfOwner.userId && /^pos\.product\./.test(a.action)) && auActs.some((a) => /creat/.test(a)) && auActs.some((a) => /price/i.test(a)) && auActs.some((a) => /archiv/.test(a)),
      "≥4 แถว (create · update · price · archive) · actorId = เจ้าของ · action pos.product.*", `${au.length} แถว: ${[...new Set(auActs)].join(",") || "-"} · actor ${[...new Set(au.map((a) => a.actorId))].join(",") || "-"}`);

    // S1.39 createCategory
    const cat1 = await attempt(() => C.createCategory(ctxOwner, { name: `${TAG} หมวดทดสอบ`, nameEn: `${TAG} cat`, unitId: SILOM, sortOrder: 3 }));
    const catRow = idOf(cat1.value) ? (await q(`select * from "PosCategory" where id = $1`, idOf(cat1.value)))[0] : null;
    const catEmpty = await attempt(() => C.createCategory(ctxOwner, { name: "  " }));
    const catDup = await attempt(() => C.createCategory(ctxOwner, { name: `${TAG} หมวดทดสอบ`, unitId: SILOM }));
    chk("S1.39", cat1.ok && catRow?.tenantId === cfT && (catRow?.systemId === undefined || catRow?.systemId === sysC.POS) && catRow?.name === `${TAG} หมวดทดสอบ` && (catRow?.unitId === undefined || catRow?.unitId === SILOM) && refused(catEmpty, "VALIDATION") && refused(catDup, "CONFLICT"),
      "สร้างได้ (ระบบ/สาขา/ชื่อตรง) · ว่าง VALIDATION · ซ้ำ CONFLICT", `${cat1.ok ? `${catRow?.name ?? "ไม่พบแถว"} unit ${catRow?.unitId}` : cat1.err} · ว่าง ${codeOf(catEmpty)} · ซ้ำ ${codeOf(catDup)}`);
    // S1.40 availability ผ่าน updateProduct
    const avP = await attempt(() => C.createProduct(ctxOwner, { name: `${TAG} 86`, basePriceSatang: 3000 }));
    const avId = idOf(avP.value) as string;
    const av1 = await attempt(() => C.updateProduct(ctxOwner, avId, { availability: { [SILOM]: false } }));
    const rowAt = async (u: string) => (await listAll(C, ctxOwner, u, { q: `${TAG} 86` })).items.find((x) => idOf(x) === avId);
    const sOff = await rowAt(SILOM); const aOn = await rowAt(ARI);
    const av2 = await attempt(() => C.updateProduct(ctxOwner, avId, { availability: { [SILOM]: true } }));
    const sBack = await rowAt(SILOM);
    const avRow = await prodById(avId);
    chk("S1.40", avRow?.kind === "PRODUCT" && av1.ok && sOff?.availability?.[SILOM] === false && aOn?.availability?.[ARI] === true && av2.ok && sBack?.availability?.[SILOM] === true,
      "kind PRODUCT · สีลม false (ยังอยู่ในรายการ) · อารีย์ true · เปิดคืน true", `kind ${avRow?.kind} · ${av1.ok ? "" : av1.err} สีลม ${sOff ? sOff.availability?.[SILOM] : "หายจากรายการ"} · อารีย์ ${aOn?.availability?.[ARI]} · คืน ${sBack?.availability?.[SILOM]}`);

    // S1.41 (ต่อ) updateProduct สลับ trackStock
    // C2: แถวไม่ผูกคลัง ⇒ ตั้ง true ไม่ได้ (VALIDATION) · false/null วนได้ (true บนแถวผูกคลังอยู่ใน S3.3)
    const tsOff = await attempt(() => C.updateProduct(ctxOwner, avId, { trackStock: false })); const tsB = (await prodById(avId))?.trackStock;
    const tsNull = await attempt(() => C.updateProduct(ctxOwner, avId, { trackStock: null })); const tsC = (await prodById(avId))?.trackStock;
    const tsTrue = await attempt(() => C.updateProduct(ctxOwner, avId, { trackStock: true }));
    chk("S1.41", tsOff.ok && tsB === false && tsNull.ok && tsC === null && refused(tsTrue, "VALIDATION"), "false → null (AUTO) · true บนแถวไม่ผูกคลัง = VALIDATION",
      `false ${tsOff.ok ? tsB : tsOff.err} · null ${tsNull.ok ? tsC : tsNull.err} · true ${codeOf(tsTrue)}`);

    // X2 ข้ามร้าน — เป้าหมาย = สินค้าชั่วคราวของร้านอาหาร
    const rsNew = await attempt(() => C.createProduct(ctxRsOwner, { name: `${TAG} resto target`, basePriceSatang: 5000 }));
    const rsPid = idOf(rsNew.value) as string; const rsP0 = await prodById(rsPid);
    const x1 = [
      await attempt(() => C.updateProduct(ctxOwner, rsPid, { name: "HACK" })),
      await attempt(() => C.setPrice(ctxOwner, rsPid, 1)),
      await attempt(() => C.archive(ctxOwner, rsPid)),
      await attempt(() => C.setPrice({ tenantId: cfT, systemId: sysR.POS, actorUserId: cfOwner.userId }, rsPid, 1)),
      await attempt(() => C.listForUnit({ tenantId: cfT, systemId: sysR.POS, actorUserId: cfOwner.userId }, RMAIN)),
    ];
    const rsP1 = await prodById(rsPid);
    chk("X2.1", !!rsP0 && x1.every((r) => refused(r, "NOT_FOUND")) && hashOf(rsP0) === hashOf(rsP1), "NOT_FOUND 5/5 · แถวไม่เปลี่ยน", `${x1.map(codeOf).join("/")} · ${hashOf(rsP0) === hashOf(rsP1) ? "ไม่เปลี่ยน" : "⚠️ ถูกแก้"}${rsP0 ? "" : ` · สร้างเป้าไม่ได้: ${rsNew.err}`}`);
    const xInv = await mkInv(rsT, sysR.INVENTORY, "xinv");
    const pc2 = await countProducts(cfT);
    const x2a = await attempt(() => C.ensureForInvItem(ctxSys(cfT, sysC.POS), xInv.id));
    const x2b = await attempt(() => C.byBarcode(ctxOwner, SILOM, "8851959132012"));
    const x2c = await attempt(() => C.listForUnit(ctxOwner, RMAIN));
    const x2d = await attempt(() => C.createCategory(ctxOwner, { name: `${TAG} xcat`, unitId: RMAIN }));
    const rsIds = new Set((await rowsOf("PosProduct", [rsT])).map((p) => p.id));
    const leakIds = listCf.items.map(idOf).filter((id) => rsIds.has(id as string));
    chk("X2.2", refused(x2a, "NOT_FOUND") && (await countProducts(cfT)) === pc2 && (await prodByInv(xInv.id)).length === 0 && x2b.ok && Array.isArray(x2b.value?.items) && x2b.value.items.length === 0 && refused(x2c, "NOT_FOUND") && refused(x2d, "NOT_FOUND") && leakIds.length === 0,
      "ensure NOT_FOUND · บาร์โค้ดร้านอื่น items ว่าง · list สาขาร้านอื่น NOT_FOUND · createCategory สาขาร้านอื่น NOT_FOUND · ไม่รั่ว", `ensure ${codeOf(x2a)} · barcode ${x2b.ok ? `items ${bcItems(x2b.value).length}` : x2b.err} · list ${codeOf(x2c)} · cat ${codeOf(x2d)} · รั่ว ${leakIds.length}`);
    const u1 = await attempt(() => C.listForUnit(ctxCashier, ARI));
    const u2 = await attempt(() => C.byBarcode(ctxCashier, ARI, "8850999000015"));
    const u3 = await attempt(() => C.listForUnit(ctxCashier, SILOM));
    chk("X2.3", refused(u1, "NOT_FOUND") && refused(u2, "NOT_FOUND") && u3.ok && listOf(u3.value).length > 0, "อารีย์ NOT_FOUND ×2 · สีลม ได้", `อารีย์ list ${codeOf(u1)} · barcode ${codeOf(u2)} · สีลม ${u3.ok ? listOf(u3.value).length : u3.err}`);

    // X3 สิทธิ์ — เป้าหมาย = สินค้าชั่วคราวใหม่ของร้านกาแฟ
    const tgt = await attempt(() => C.createProduct(ctxOwner, { name: `${TAG} perm`, basePriceSatang: 2000, unitId: SILOM }) /* ORACLE-EDIT P1.1-X3.2 (ผู้คุมงาน 1 ต.ค.): เป้าหมายเป็นสินค้าของสาขาสีลม — แคชเชียร์สาขาเดียวแก้สินค้าทุกสาขาไม่ได้ตาม C4/S3.6 */);
    const tPid = idOf(tgt.value) as string; const tP = await prodById(tPid);
    const c1 = await attempt(() => C.setPrice(ctxCashier, tPid, 1));
    chk("X3.1", !!tP && refused(c1, "PERMISSION_DENIED") && (await prodById(tPid))?.basePriceSatang === 2000, "PERMISSION_DENIED · ราคา 2000", `${codeOf(c1)} · ${(await prodById(tPid))?.basePriceSatang}`);
    const c2 = await withCashierPerm({ "pos.product.setPrice": true }, () => attempt(() => C.setPrice(ctxCashier, tPid, 2100))); const pStaff = (await prodById(tPid))?.basePriceSatang;
    const c3 = await attempt(() => C.setPrice(ctxOwner, tPid, 2200));
    chk("X3.2", c2.ok && pStaff === 2100 && c3.ok && (await prodById(tPid))?.basePriceSatang === 2200, "staff+สิทธิ์ 2100 · owner 2200", `${c2.ok ? pStaff : c2.err} · ${c3.ok ? (await prodById(tPid))?.basePriceSatang : c3.err}`);
    const pc3 = await countProducts(cfT); const snapT = hashOf(await prodById(tPid));
    const m1 = await attempt(() => C.createProduct(ctxCashier, { name: `${TAG} cashier-new`, basePriceSatang: 100, unitId: SILOM }));
    const m2 = await attempt(() => C.updateProduct(ctxCashier, tPid, { name: "HACK" }));
    const m3 = await attempt(() => C.archive(ctxCashier, tPid));
    const catN0 = (await rowsOf("PosCategory", [cfT])).length;
    const m4 = await attempt(() => C.createCategory(ctxCashier, { name: `${TAG} cashier-cat`, unitId: SILOM }));
    chk("X3.3", [m1, m2, m3, m4].every((r) => refused(r, "PERMISSION_DENIED")) && (await countProducts(cfT)) === pc3 && hashOf(await prodById(tPid)) === snapT && (await rowsOf("PosCategory", [cfT])).length === catN0,
      "PERMISSION_DENIED 4/4 · ไม่เขียน", `${[m1, m2, m3, m4].map(codeOf).join("/")}`);

    // X6 race บน connection แยก
    const notes2: string[] = []; let ok2 = true;
    for (let round = 1; round <= 3; round++) {
      const inv = await mkInv(cfT, sysC.INVENTORY, `race${round}`);
      const rs = await Promise.all(Array.from({ length: 10 }, (_, i) => attempt(() => C.ensureForInvItem(ctxSys(cfT, sysC.POS), inv.id, lane(i)))));
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
    // ═════════ ROUND 2 (S3.*) — ขอบเขตของตัวเอง (ชื่อตัวแปรไม่ชนกับข้างบน) ═════════
    {
    // S3.1 C1 ผู้เรียกระดับระบบ
    const marker = C.CATALOG_SYSTEM_ACTOR;
    const c1Inv = await mkInv(cfT, sysC.INVENTORY, "c1-marker");
    const c1ok = await attempt(() => C.ensureForInvItem({ tenantId: cfT, systemId: sysC.POS, actorUserId: marker }, c1Inv.id));
    const c1bad: string[] = [];
    for (const v of [null, undefined, ""]) {
      const cx: Any = { tenantId: cfT, systemId: sysC.POS, actorUserId: v };
      const tries = [
        await attempt(() => C.ensureForInvItem(cx, fx.costOnly.id)),
        await attempt(() => C.createProduct(cx, { name: `${TAG} c1-${String(v)}`, basePriceSatang: 100 })),
        await attempt(async () => C.setPrice(cx, (await prodByInv(fx.costOnly.id))[0]?.id, 1)),
        await attempt(() => C.createCategory(cx, { name: `${TAG} c1cat-${String(v)}` })),
      ];
      tries.forEach((r, k) => { if (!refused(r, "PERMISSION_DENIED")) c1bad.push(`${JSON.stringify(v) ?? "undefined"}#${k}→${codeOf(r)}`); });
    }
    chk("S3.1", typeof marker === "symbol" && c1ok.ok && c1bad.length === 0, "export เป็น symbol · marker ใช้ได้ · null/undefined/\"\" = PERMISSION_DENIED ×12",
      `marker ${typeof marker} · ensure ${c1ok.ok ? "ok" : c1ok.err} · ผิด ${c1bad.slice(0, 4).join(" ") || "-"} (${c1bad.length})`);
    // S3.2/S3.3 C2 tri-state
    const c2Row = (await listAll(C, ctxOwner, SILOM, { q: c1Inv.sku })).items.find((x) => x.invItemId === c1Inv.id);
    const c2Col0 = (await prodByInv(c1Inv.id))[0]?.trackStock;
    chk("S3.2", fx.s32?.ok === true && c2Col0 === null && !!c2Row && typeof c2Row.trackStock === "boolean" && ["auto", "on", "off"].includes(c2Row.trackStockMode),
      "backfill/ensure = null · view มี trackStock (boolean) + trackStockMode", `${fx.s32?.msg ?? "ส่วน invariants ไม่ได้รัน"} · ensure → ${c2Col0} · view ${c2Row ? `${c2Row.trackStock}/${c2Row.trackStockMode}` : "ไม่พบ"}`);
    const viewOf = async () => (await listAll(C, ctxOwner, SILOM, { q: c1Inv.sku })).items.find((x) => x.invItemId === c1Inv.id);
    const v0 = await viewOf();
    // "รับของเข้าทีหลัง" = movement IN + onHand (เขียนตรงแบบข้อมูลคลัง — ไม่เรียก receive เพื่อไม่ให้เกิดรายการบัญชี)
    await P.invMovement.create({ data: { tenantId: cfT, systemId: sysC.INVENTORY, itemId: c1Inv.id, type: "IN", qtyDelta: 3, balanceAfter: 3, idempotencyKey: `${TAG}-c2-recv` } });
    await P.invItem.update({ where: { id: c1Inv.id }, data: { onHand: 3 } });
    const v1 = await viewOf();
    const c2pid = (await prodByInv(c1Inv.id))[0]?.id;
    const sOff = await attempt(() => C.updateProduct(ctxOwner, c2pid, { trackStock: false })); const v2 = await viewOf();
    const sOn = await attempt(() => C.updateProduct(ctxOwner, c2pid, { trackStock: true })); const v3 = await viewOf();
    const sAuto = await attempt(() => C.updateProduct(ctxOwner, c2pid, { trackStock: null })); const v4 = await viewOf();
    const vs = (v: Any) => (v ? `${v.trackStock}/${v.trackStockMode}` : "ไม่พบ");
    chk("S3.3", v0?.trackStock === false && v0?.trackStockMode === "auto" && v1?.trackStock === true && v1?.trackStockMode === "auto" && sOff.ok && v2?.trackStock === false && v2?.trackStockMode === "off" &&
      sOn.ok && v3?.trackStock === true && v3?.trackStockMode === "on" && sAuto.ok && v4?.trackStock === true && v4?.trackStockMode === "auto",
      "ยังไม่มีของ false/auto → รับเข้า true/auto → off false/off → on true/on → null true/auto", `${vs(v0)} → ${vs(v1)} → ${sOff.ok ? vs(v2) : sOff.err} → ${sOn.ok ? vs(v3) : sOn.err} → ${sAuto.ok ? vs(v4) : sAuto.err}`);
    // S3.4/S3.5 C3 POS เดียวสองคลัง
    const ctxT = { tenantId: cfT, systemId: fx.tPos.id, actorUserId: cfOwner.userId as string };
    const la = (await listAll(C, ctxT, fx.uA.id)).items; const lb = (await listAll(C, ctxT, fx.uB.id)).items;
    const has = (rows: Any[], it: Any) => rows.some((r) => r.invItemId === it.id);
    const sA = await attempt(() => C.listForUnit(ctxT, fx.uA.id, { q: fx.itY.sku, limit: 50 })); const sA2 = await attempt(() => C.listForUnit(ctxT, fx.uA.id, { q: fx.itX.sku, limit: 50 }));
    const stockA = la.find((r) => r.invItemId === fx.itX.id)?.stock?.[fx.uA.id];
    chk("S3.4", has(la, fx.itX) && !has(la, fx.itY) && has(lb, fx.itY) && !has(lb, fx.itX) && sA.ok && !has(listOf(sA.value), fx.itY) && sA2.ok && has(listOf(sA2.value), fx.itX) && stockA === 7,
      "A: X ไม่มี Y · B: Y ไม่มี X · ค้น SKU ของ Y ที่ A = ว่าง · stock[A]=7", `A X${has(la, fx.itX) ? "✓" : "✗"} Y${has(la, fx.itY) ? "✗รั่ว" : "✓"} · B Y${has(lb, fx.itY) ? "✓" : "✗"} X${has(lb, fx.itX) ? "✗รั่ว" : "✓"} · ค้น ${sA.ok ? listOf(sA.value).length : sA.err}/${sA2.ok ? listOf(sA2.value).length : sA2.err} · stock ${stockA}`);
    const bYA = await attempt(() => C.byBarcode(ctxT, fx.uA.id, fx.itY.barcode)); const bYB = await attempt(() => C.byBarcode(ctxT, fx.uB.id, fx.itY.barcode));
    chk("S3.5", bYA.ok && bcItems(bYA.value).length === 0 && Array.isArray(bYA.value?.items) && bYB.ok && bcItems(bYB.value).some((x) => x.invItemId === fx.itY.id),
      "บาร์โค้ด Y: ที่ A ว่าง · ที่ B เจอ", `A ${bYA.ok ? `${bcItems(bYA.value).length} (ทรง ${Array.isArray(bYA.value?.items) ? "{items}" : typeof bYA.value})` : bYA.err} · B ${bYB.ok ? bcItems(bYB.value).length : bYB.err}`);
    // S3.6–S3.8 C4 ผู้จัดการเฉพาะสาขาสีลม (แคชเชียร์ชั่วคราวเป็น MANAGER)
    const allP = await attempt(() => C.createProduct(ctxOwner, { name: `${TAG} c4-all`, basePriceSatang: 1000 }));
    const allId = idOf(allP.value) as string;
    const allSnap = hashOf(await prodById(allId));
    const silP = await attempt(() => C.createProduct(ctxOwner, { name: `${TAG} c4-silom`, basePriceSatang: 1000, unitId: SILOM }));
    const silId = idOf(silP.value) as string;
    const c4Inv = await mkInv(cfT, sysC.INVENTORY, "c4-ensure");
    const catAri = await attempt(() => C.createCategory(ctxOwner, { name: `${TAG} cat-ari`, unitId: ARI }));
    const catAll = await attempt(() => C.createCategory(ctxOwner, { name: `${TAG} cat-all` }));
    const m = await asBranchManager(async () => ({
      setAll: await attempt(() => C.setPrice(ctxCashier, allId, 1)),
      updAll: await attempt(() => C.updateProduct(ctxCashier, allId, { nameEn: "HACK" })),
      arcAll: await attempt(() => C.archive(ctxCashier, allId)),
      tsAll: await attempt(() => C.updateProduct(ctxCashier, allId, { trackStock: false })),
      createAll: await attempt(() => C.createProduct(ctxCashier, { name: `${TAG} c4-mgr-all`, basePriceSatang: 1 })),
      ensure: await attempt(() => C.ensureForInvItem(ctxCashier, c4Inv.id)),
      catAll: await attempt(() => C.createCategory(ctxCashier, { name: `${TAG} c4-mgr-cat` })),
      ownPrice: await attempt(() => C.setPrice(ctxCashier, silId, 1100)),
      ownUpd: await attempt(() => C.updateProduct(ctxCashier, silId, { nameEn: `${TAG} mgr` })),
      toNull: await attempt(() => C.updateProduct(ctxCashier, silId, { unitId: null })),
      toAri: await attempt(() => C.updateProduct(ctxCashier, silId, { unitId: ARI })),
    }));
    const pd6 = ["setAll", "updAll", "arcAll", "tsAll", "createAll", "ensure", "catAll"] as const;
    chk("S3.6", pd6.every((k) => refused(m[k], "PERMISSION_DENIED")) && hashOf(await prodById(allId)) === allSnap && (await prodByInv(c4Inv.id)).length === 0,
      "PERMISSION_DENIED ×7 · แถวทุกสาขาไม่เปลี่ยน", pd6.map((k) => `${k}:${codeOf(m[k])}`).join(" "));
    const ownerMove = await attempt(() => C.updateProduct(ctxOwner, allId, { unitId: SILOM }));
    chk("S3.7", refused(m.toNull, "PERMISSION_DENIED") && refused(m.toAri, "NOT_FOUND") && m.ownPrice.ok && m.ownUpd.ok && (await prodById(silId))?.unitId === SILOM && ownerMove.ok && (await prodById(allId))?.unitId === SILOM,
      "→null PERMISSION_DENIED · →อารีย์ NOT_FOUND · ของสาขาตัวเองแก้ได้ · เจ้าของย้ายได้", `toNull ${codeOf(m.toNull)} · toAri ${codeOf(m.toAri)} · own ${m.ownPrice.ok ? "✓" : m.ownPrice.err}/${m.ownUpd.ok ? "✓" : m.ownUpd.err} · owner ${ownerMove.ok ? "✓" : ownerMove.err}`);
    const cAri = await attempt(() => C.updateProduct(ctxOwner, silId, { categoryId: idOf(catAri.value) }));
    const cAll = await attempt(() => C.updateProduct(ctxOwner, silId, { categoryId: idOf(catAll.value) }));
    chk("S3.8", catAri.ok && catAll.ok && refused(cAri, "VALIDATION") && cAll.ok, "หมวดสาขาอื่น VALIDATION · หมวดทุกสาขาได้", `ari ${codeOf(cAri)} · all ${cAll.ok ? "✓" : cAll.err}${catAri.ok && catAll.ok ? "" : ` · สร้างหมวด ${catAri.err ?? ""} ${catAll.err ?? ""}`}`);
    // S3.9 C5
    const d1 = await attempt(() => C.byBarcode(ctxOwner, SILOM, `98${RAND}55`)); const d2 = await attempt(() => C.byBarcode(ctxOwner, SILOM, `98${RAND}55`));
    const ord = (r: Try) => bcItems(r.value).map(idOf).join(",");
    const dupWant = new Set([(await prodByInv(fx.dupA.id))[0]?.id, (await prodByInv(fx.dupB.id))[0]?.id]);
    chk("S3.9", d1.ok && Array.isArray(d1.value?.items) && bcItems(d1.value).length === 2 && bcItems(d1.value).every((x) => dupWant.has(idOf(x))) && ord(d1) === ord(d2),
      "{items} 2 รายการ ลำดับคงที่", d1.ok ? `ทรง ${Array.isArray(d1.value?.items) ? "{items}" : typeof d1.value} · ${bcItems(d1.value).length} รายการ · ลำดับ ${ord(d1) === ord(d2) ? "คงที่" : "ไม่คงที่"}` : d1.err);
    // S3.10 C6
    const p0 = await attempt(() => C.listForUnit(ctxOwner, SILOM));
    const pBig = await attempt(() => C.listForUnit(ctxOwner, SILOM, { limit: 1000 }));
    const all100: string[] = []; let cur: Any = undefined; let pages = 0;
    for (; pages < 30; pages++) {
      const pg = await attempt(() => C.listForUnit(ctxOwner, SILOM, { limit: 100, ...(cur ? { cursor: cur } : {}) }));
      if (!pg.ok) break;
      all100.push(...listOf(pg.value).map((x) => idOf(x) as string));
      cur = pg.value?.nextCursor ?? null; if (!cur) break;
    }
    const invSysNow = new Map((await q<{ id: string; systemId: string }>(`select id, "systemId" from "InvItem" where "tenantId" = $1`, cfT)).map((r) => [r.id, r.systemId]));
    const total = (await rowsOf("PosProduct", [cfT])).filter((p) => !p.archivedAt && p.systemId === sysC.POS && (p.unitId === null || p.unitId === SILOM) && (!p.invItemId || invSysNow.get(p.invItemId) === sysC.INVENTORY)).length;
    chk("S3.10", p0.ok && listOf(p0.value).length === 100 && !!p0.value?.nextCursor && pBig.ok && listOf(pBig.value).length === Math.min(500, total) && (total <= 500 || !!pBig.value?.nextCursor) && new Set(all100).size === all100.length && all100.length === total,
      `ปริยาย 100 + nextCursor · 1000 → ${Math.min(500, total)} · เดินหน้า 100 ครบ ${total} ไม่ซ้ำ`,
      `ปริยาย ${p0.ok ? `${listOf(p0.value).length} next ${!!p0.value?.nextCursor}` : p0.err} · 1000 → ${pBig.ok ? listOf(pBig.value).length : pBig.err} · เดิน ${all100.length}/${total} ซ้ำ ${all100.length - new Set(all100).size}`);
    // S3.11 C6 static
    const catSrc = read("src/lib/modules/pos/catalog.ts");
    const fnBody = (name: string) => { const i0 = catSrc.search(new RegExp(`(export\\s+)?(async\\s+)?function\\s+${name}\\b`)); if (i0 < 0) return ""; const i1 = catSrc.slice(i0 + 10).search(/\n(export\s+)?(async\s+)?function\s+/); return catSrc.slice(i0, i1 < 0 ? undefined : i0 + 10 + i1); };
    const lfb = fnBody("listForUnit"); const tvb = fnBody("toViews");
    const s311 = { noTake2000: !/take:\s*2000/.test(lfb), noPreQuery: !/invItem\.findMany/.test(lfb), viewsMap: !!tvb && !/\.filter\(\s*\(?\s*\w+\s*\)?\s*=>\s*\w+\.productId\s*===\s*p\.id/.test(tvb) };
    chk("S3.11", !!lfb && Object.values(s311).every(Boolean), "ไม่มี take:2000 · ไม่มี invItem.findMany ก่อน · toViews ไม่ filter ต่อแถว", Object.entries(s311).map(([k, v]) => `${k}${v ? "✓" : "✗"}`).join(" "));
    // S3.14 C8 VAT ตามการจด VAT ของสมุดบัญชีที่ผูก POS (ร้านอาหาร: ปิดจด VAT ชั่วคราวแล้วคืน)
    const vRegInv = await mkInv(cfT, sysC.INVENTORY, "c8-reg"); await mkAp(cfT, sysC.ACCOUNT, vRegInv, 1500, 700);
    const vNoInv = await mkInv(rsT, sysR.INVENTORY, "c8-novat"); await mkAp(rsT, sysR.ACCOUNT, vNoInv, 1500, 700);
    const rsSet0 = await P.accountSettings.findFirst({ where: { systemId: sysR.ACCOUNT } });
    let vNo: Try = { ok: false };
    try {
      if (rsSet0) await P.accountSettings.update({ where: { id: rsSet0.id }, data: { vatRegistered: false } });
      else fx.tmpSettings = await P.accountSettings.create({ data: { tenantId: rsT, systemId: sysR.ACCOUNT, vatRegistered: false } });
      vNo = await attempt(() => C.ensureForInvItem(ctxSys(rsT, sysR.POS), vNoInv.id));
    } finally {
      if (rsSet0) await P.accountSettings.update({ where: { id: rsSet0.id }, data: { vatRegistered: rsSet0.vatRegistered } });
      else if (fx.tmpSettings) await P.accountSettings.delete({ where: { id: fx.tmpSettings.id } });
    }
    const vReg = await attempt(() => C.ensureForInvItem(ctxSys(cfT, sysC.POS), vRegInv.id));
    const vNoRow = (await prodByInv(vNoInv.id))[0]; const vRegRow = (await prodByInv(vRegInv.id))[0];
    chk("S3.14", vNo.ok && vNoRow?.vatRateBp === null && vReg.ok && vRegRow?.vatRateBp === 700, "ไม่จด VAT → null · จด VAT → 700", `ไม่จด ${vNo.ok ? vNoRow?.vatRateBp : vNo.err} · จด ${vReg.ok ? vRegRow?.vatRateBp : vReg.err}`);
    // S3.18 C10
    const c10Inv = await mkInv(cfT, sysC.INVENTORY, "c10-prod", { barcode: `96${RAND}10` });
    const c10Svc = await mkInv(cfT, sysC.INVENTORY, "c10-svc", { kind: "SERVICE", priceSatang: 500 });
    const c10Arch = await mkInv(cfT, sysC.INVENTORY, "c10-arch", { archivedAt: new Date() });
    const r10 = {
      menuInv: await attempt(() => C.createProduct(ctxOwner, { name: `${TAG} c10m`, kind: "MENU", invItemId: c10Inv.id, basePriceSatang: 100 })),
      bundleInv: await attempt(() => C.createProduct(ctxOwner, { name: `${TAG} c10b`, kind: "BUNDLE", invItemId: c10Inv.id, basePriceSatang: 100 })),
      archived: await attempt(() => C.createProduct(ctxOwner, { name: `${TAG} c10a`, kind: "PRODUCT", invItemId: c10Arch.id, basePriceSatang: 100 })),
      kindMismatch: await attempt(() => C.createProduct(ctxOwner, { name: `${TAG} c10k`, kind: "PRODUCT", invItemId: c10Svc.id, basePriceSatang: 100 })),
    };
    const ownBc = await attempt(() => C.createProduct(ctxOwner, { name: `${TAG} c10own`, kind: "PRODUCT", invItemId: c10Inv.id, barcode: `96${RAND}10`, basePriceSatang: 100 }));
    const p2002 = /P2002/.test(catSrc) && /CONFLICT/.test(catSrc);
    chk("S3.18", Object.values(r10).every((r) => refused(r, "VALIDATION")) && ownBc.ok && p2002, "VALIDATION ×4 · บาร์โค้ดของ InvItem ตัวเองได้ · map P2002→CONFLICT",
      `${Object.entries(r10).map(([k, r]) => `${k}:${codeOf(r)}`).join(" ")} · ownBarcode ${ownBc.ok ? "✓" : ownBc.err} · P2002 ${p2002 ? "✓" : "✗"}`);
    // S3.19 C11 audit chain + archive race (connection แยก)
    const chainBad: string[] = [];
    for (let r = 1; r <= 5; r++) {
      const cp = await attempt(() => C.createProduct(ctxOwner, { name: `${TAG} c11-${r}`, basePriceSatang: 100 }));
      const cid = idOf(cp.value) as string; const tStart = new Date();
      await Promise.all([attempt(() => C.setPrice(ctxOwner, cid, 200, lane(0))), attempt(() => C.setPrice(ctxOwner, cid, 300, lane(1)))]);
      const au = await q<{ before: Any; after: Any }>(`select before, after from "AuditLog" where "targetType" = 'PosProduct' and "targetId" = $1 and action like 'pos.product.%' and "createdAt" >= $2 and after::text like '%basePriceSatang%' order by "createdAt", id`, cid, tStart);
      const b = au.map((a) => a.before?.basePriceSatang); const a2 = au.map((a) => a.after?.basePriceSatang);
      const fin = (await prodById(cid))?.basePriceSatang;
      if (!(au.length === 2 && b[0] === 100 && b[1] === a2[0] && a2[1] === fin)) chainBad.push(`รอบ${r}: ${b.map((x, k) => `${x}→${a2[k]}`).join(", ")} ท้าย ${fin}`);
    }
    const arcBad: string[] = [];
    for (let r = 1; r <= 3; r++) {
      const ap = await attempt(() => C.createProduct(ctxOwner, { name: `${TAG} c11a-${r}`, basePriceSatang: 100 }));
      const aid = idOf(ap.value) as string;
      const [x1, x2] = await Promise.all([attempt(() => C.archive(ctxOwner, aid, lane(2))), attempt(() => C.archive(ctxOwner, aid, lane(3)))]);
      const stored = (await prodById(aid))?.archivedAt;
      const iso = (d: Any) => (d ? new Date(d).toISOString() : String(d));
      if (!(x1.ok && x2.ok && iso(x1.value?.archivedAt) === iso(stored) && iso(x2.value?.archivedAt) === iso(stored))) arcBad.push(`รอบ${r}: ${iso(x1.value?.archivedAt)}/${iso(x2.value?.archivedAt)} vs ${iso(stored)}`);
    }
    chk("S3.19", chainBad.length === 0 && arcBad.length === 0, "audit ต่อเป็นสาย 5/5 · archive คืนเวลาที่เก็บจริง 3/3", `${chainBad.slice(0, 2).join(" · ") || "สายครบ"} · ${arcBad.slice(0, 2).join(" · ") || "archive ตรง"}`);
    // S3.20 C12
    const arcList = await attempt(() => C.listForUnit(ctxOwner, fx.archUnit.id));
    const s320 = { ...(fx.s320 ?? { invariants: false }), listArchivedUnitNotFound: refused(arcList, "NOT_FOUND") };
    chk("S3.20", Object.values(s320).every(Boolean), "เมนูสาขาปิดไม่ผูก · เว็บร้านผูก POS seed · ไม่มีแถวใน POS ปิดใช้งาน · list สาขาปิด NOT_FOUND", Object.entries(s320).map(([k, v]) => `${k}${v ? "✓" : "✗"}`).join(" ") + ` (${codeOf(arcList)})`);
    // S3.21 C13 static + ชื่อตัวนับใน JSON_SUMMARY
    const bfSrc = read("scripts/pos-backfill-catalog.mts");
    const bfb = fnBody("planTenant") || catSrc;
    const NAMES = ["soldAtCostToday", "zeroPriceProduct", "zeroPriceMenu", "zeroPriceWeb", "invalidLegacyPrice", "posPriceDiffersFromSalePrice", "shopPriceDiffersFromCatalog", "shopInactiveLinked", "shopOwnRowInvItemOutsideFirstPos", "shopDanglingInvItem", "shopBranchNotInFirstPos"];
    const missNames = NAMES.filter((k) => typeof (drySummary?.counts?.[k] ?? drySummary?.[k]) !== "number");
    const s321 = { prodNeedsTenantOrAll: /--all\b/.test(bfSrc) && /isProd[\s\S]{0,400}(tenantArgs\.length|--all|all\b)/.test(bfSrc), movementsGrouped: !/invMovement\.findMany/.test(bfb) && /groupBy|SELECT\s+DISTINCT/i.test(bfb), optionGroupsMap: !/menuOgs\.filter\(/.test(bfb), countNames: missNames.length === 0 };
    chk("S3.21", Object.values(s321).every(Boolean), "prod ต้อง --tenant/--all · movement groupBy/DISTINCT · ตัวเลือกใช้ Map · ตัวนับครบ 11 ชื่อ", `${Object.entries(s321).map(([k, v]) => `${k}${v ? "✓" : "✗"}`).join(" ")} · ขาด: ${missNames.join(",") || "-"}`);

    // ═════════ ROUND 3 (S3.27+) ═════════
    // S3.27 D1 positives
    const sP = { tenantId: cfT, systemId: fx.tPos1.id, actorUserId: cfCashier.userId as string };
    const d1Run = async (cx: Any, label: string) => {
      const cp = await attempt(() => C.createProduct(cx, { name: `${TAG} d1-${label}`, basePriceSatang: 900 }));
      const id = idOf(cp.value) as string;
      return { cp, sp: await attempt(() => C.setPrice(cx, id, 950)), up: await attempt(() => C.updateProduct(cx, id, { nameEn: `${TAG} d1-${label}` })),
        cc: await attempt(() => C.createCategory(cx, { name: `${TAG} d1-cat-${label}` })), ar: await attempt(() => C.archive(cx, id)), unitNull: (await prodById(id))?.unitId === null };
    };
    const single = await asManagerOf([fx.uS.id], () => d1Run(sP, "single"));
    const explicitAll = await asManagerOf([SILOM, ARI], () => d1Run(ctxCashier, "explicit-all"));
    const d1s = (o: Any) => ["cp", "sp", "up", "cc", "ar"].map((k) => `${k}:${o[k].ok ? "✓" : codeOf(o[k])}`).join(" ");
    const d1ok = (o: Any) => ["cp", "sp", "up", "cc", "ar"].every((k) => o[k].ok) && o.unitNull;
    chk("S3.27", d1ok(single) && d1ok(explicitAll), "สาขาเดียว ✓×5 · ระบุทุกสาขา ✓×5 (แถว unitId null)", `สาขาเดียว ${d1s(single)} · ระบุทุกสาขา ${d1s(explicitAll)}`);
    // S3.28 D1+C3 ผู้จัดการสาขา A ใน POS สองคลัง
    const tCx = { tenantId: cfT, systemId: fx.tPos.id, actorUserId: cfCashier.userId as string };
    const prodX = (await prodByInv(fx.itX.id)).find((x) => x.systemId === fx.tPos.id);
    const prodY = (await prodByInv(fx.itY.id)).find((x) => x.systemId === fx.tPos.id);
    const noInvT = await attempt(() => C.createProduct(ctxT, { name: `${TAG} d1-tpos-noinv`, basePriceSatang: 500 }));
    const aOnly = await asManagerOf([fx.uA.id], async () => ({
      x: await attempt(() => C.setPrice(tCx, prodX?.id, 777)),
      y: await attempt(() => C.setPrice(tCx, prodY?.id, 778)),
      n: await attempt(() => C.setPrice(tCx, idOf(noInvT.value), 779)),
    }));
    chk("S3.28", !!prodX && prodX.unitId === null && aOnly.x.ok && refused(aOnly.y, "PERMISSION_DENIED") && refused(aOnly.n, "PERMISSION_DENIED"),
      "ขายเฉพาะ A ✓ · คลัง Y PERMISSION_DENIED · ไม่ผูกคลัง PERMISSION_DENIED", `X ${aOnly.x.ok ? "✓" : codeOf(aOnly.x)} · Y ${codeOf(aOnly.y)} · ไม่ผูก ${codeOf(aOnly.n)}${prodX ? "" : " · ไม่มีแถวของ X"}`);
    // S3.29 D2 static
    const restSrc = catSrc.replace(fnBody("planTenant"), "");
    const s329 = { noTenantScan: !/invMovement\s*\.\s*(groupBy|findMany)\s*\(/.test(restSrc), perItemExists: /EXISTS\s*\(\s*SELECT\s+1\s+FROM\s+"InvMovement"[\s\S]{0,400}"systemId"/i.test(restSrc) || /invMovement\s*\.\s*findFirst\s*\([\s\S]{0,300}systemId/.test(restSrc) };
    chk("S3.29", Object.values(s329).every(Boolean), "ไม่มี groupBy/findMany movement บนทางอ่าน · มี EXISTS/findFirst กรอง systemId", Object.entries(s329).map(([k, v]) => `${k}${v ? "✓" : "✗"}`).join(" "));
    // S3.33 D5
    const facade5 = await load("@/lib/modules/pos");
    const bfExposed = typeof facade5?.backfillCatalog === "function" || typeof facade5?.catalog?.backfillCatalog === "function";
    const symOk = /CATALOG_SYSTEM_ACTOR[^=\n]*=\s*Symbol\(/.test(catSrc) && !/Symbol\.for\(/.test(catSrc) && typeof marker === "symbol" && Symbol.keyFor(marker) === undefined;
    const srcFiles = (readdirSync("src", { recursive: true }) as string[]).filter((f) => /\.(ts|tsx|mts)$/.test(f)).map((f) => `src/${f}`);
    const fallback = srcFiles.filter((f) => /\?\?\s*CATALOG_SYSTEM_ACTOR/.test(read(f)));
    chk("S3.33", !bfExposed && symOk && fallback.length === 0, "facade ไม่มี backfillCatalog · Symbol( ไม่ลงทะเบียน · ไม่มี ?? CATALOG_SYSTEM_ACTOR", `facade ${bfExposed ? "ส่ง backfillCatalog ✗" : "✓"} · marker ${symOk ? "✓" : "✗"} · fallback ${fallback.join(",") || "-"}`);
    // S3.34 D6 InvItem ของคลังที่ไม่เสิร์ฟสาขา
    const yFresh = await mkInv(cfT, fx.tInvY.id, "d6-y-fresh");
    const wrongWh = await attempt(() => C.createProduct(ctxT, { name: `${TAG} d6-wrong-wh`, unitId: fx.uA.id, invItemId: yFresh.id, basePriceSatang: 100 }));
    const rightWh = await attempt(() => C.createProduct(ctxT, { name: `${TAG} d6-right-wh`, unitId: fx.uB.id, invItemId: yFresh.id, basePriceSatang: 100 }));
    chk("S3.34", refused(wrongWh, "VALIDATION") && rightWh.ok, "สาขา A + ของคลัง Y = VALIDATION · สาขา B + ของคลัง Y ได้ (คู่บวก)", `A ${codeOf(wrongWh)} · B ${rightWh.ok ? "✓" : rightWh.err}`);
    // S3.35 D6 trackStock true บนบริการ
    const svcFresh = await mkInv(cfT, sysC.INVENTORY, "d6-svc", { kind: "SERVICE", priceSatang: 2000 });
    const svcCreate = await attempt(() => C.createProduct(ctxOwner, { name: `${TAG} d6-svc`, kind: "SERVICE", invItemId: svcFresh.id, trackStock: true, basePriceSatang: 2000 }));
    // ห้ามแตะแถวของ seed (updatedAt/audit จะค้าง) — ใช้บริการชั่วคราวที่ ensure ขึ้นมาเอง
    const svc2 = await mkInv(cfT, sysC.INVENTORY, "d6-svc2", { kind: "SERVICE", priceSatang: 2100 });
    const svc2P = await attempt(() => C.ensureForInvItem(ctxSys(cfT, sysC.POS), svc2.id));
    const giftBefore = (await prodById(idOf(svc2P.value)))?.trackStock;
    const svcUpd = await attempt(() => C.updateProduct(ctxOwner, idOf(svc2P.value), { trackStock: true }));
    const giftAfter = (await prodById(idOf(svc2P.value)))?.trackStock;
    chk("S3.35", svc2P.ok && refused(svcCreate, "VALIDATION") && refused(svcUpd, "VALIDATION") && giftAfter === giftBefore, "create/update บริการ trackStock true = VALIDATION ×2", `create ${codeOf(svcCreate)} · update ${codeOf(svcUpd)}`);
    // S3.36 D6 ล็อกร้าน: ถือไว้บน connection หนึ่ง สร้างธรรมดาบนอีก connection ต้องไม่รอ
    const lockKey = `pos-catalog:${cfT}`;
    let held = false; let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => (release = r));
    const holder = lane(6).$transaction(async (tx: Any) => { await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(hashtext($1))`, lockKey); held = true; await gate; }, { timeout: 60_000, maxWait: 30_000 }).catch((e: unknown) => firstLine(e));
    for (let i = 0; i < 200 && !held; i++) await new Promise((r) => setTimeout(r, 50));
    const timed = async (ms: number, fn: () => Promise<Any>) => {
      const t = Date.now(); const pr = attempt(fn);
      const r = await Promise.race([pr, new Promise<"TIMEOUT">((res) => setTimeout(() => res("TIMEOUT"), ms))]);
      return { r, ms: Date.now() - t, pr };
    };
    const lockInv = await mkInv(cfT, sysC.INVENTORY, "d6-lock-inv");
    const plainP = await timed(3000, () => C.createProduct(ctxOwner, { name: `${TAG} d6-plain`, basePriceSatang: 100, unitId: SILOM }));
    const plainC = await timed(3000, () => C.createCategory(ctxOwner, { name: `${TAG} d6-plain-cat`, unitId: SILOM }));
    const ctrl = await timed(1500, () => C.createProduct(ctxOwner, { name: `${TAG} d6-lock-ctrl`, unitId: SILOM, invItemId: lockInv.id, basePriceSatang: 100 }));
    release(); await holder;
    await Promise.all([plainP.pr, plainC.pr, ctrl.pr]);
    const okT = (x: Any) => x.r !== "TIMEOUT" && (x.r as Try).ok;
    chk("S3.36", held && okT(plainP) && okT(plainC) && ctrl.r === "TIMEOUT", "ธรรมดาเสร็จ < 3 วิ ×2 · ผูก InvItem ยังรอ (คู่บวก)",
      `ถือล็อก ${held} · product ${plainP.r === "TIMEOUT" ? "รอเกิน 3 วิ" : `${plainP.ms}ms ${(plainP.r as Try).ok ? "✓" : (plainP.r as Try).err}`} · category ${plainC.r === "TIMEOUT" ? "รอเกิน 3 วิ" : `${plainC.ms}ms ${(plainC.r as Try).ok ? "✓" : (plainC.r as Try).err}`} · ctrl ${ctrl.r === "TIMEOUT" ? "รอ ✓" : "ไม่รอ ✗"}`);
    // S3.37 D6 byBarcode ทั้งสองแหล่ง
    const bc37 = `95${RAND}37`;
    const own37 = await attempt(() => C.createProduct(ctxOwner, { name: `${TAG} d6-own-bc`, barcode: bc37, unitId: SILOM, basePriceSatang: 100 }));
    const inv37 = await mkInv(cfT, sysC.INVENTORY, "d6-inv-bc", { barcode: bc37 });
    const ens37 = await attempt(() => C.ensureForInvItem(ctxSys(cfT, sysC.POS), inv37.id));
    const b37 = await attempt(() => C.byBarcode(ctxOwner, SILOM, bc37));
    const ids37 = new Set(bcItems(b37.value).map(idOf));
    chk("S3.37", own37.ok && ens37.ok && ids37.has(idOf(own37.value)) && ids37.has(idOf(ens37.value)) && ids37.size === 2, "2 รายการ (แถวเอง + InvItem)", `${b37.ok ? `${ids37.size} รายการ · own ${ids37.has(idOf(own37.value))} · inv ${ids37.has(idOf(ens37.value))}` : b37.err}${own37.ok ? "" : ` · own ${own37.err}`}${ens37.ok ? "" : ` · ensure ${ens37.err}`}`);
    // S3.38 D6 คำเชิญที่ยังไม่รับ
    const acc0 = cashierRow0?.acceptedAt ?? null;
    const unaccepted = await withCashierPerm({}, () => attempt(() => C.listForUnit(ctxCashier, SILOM, { limit: 5 })), undefined, undefined, null);
    chk("S3.38", acc0 !== null && refused(unaccepted, "NOT_FOUND"), "acceptedAt null → NOT_FOUND (ก่อนหน้าเป็นสมาชิกที่รับแล้ว)", `acceptedAt เดิม ${acc0 ? "มี" : "null (ทดสอบไม่ได้)"} · ${codeOf(unaccepted)}`);
    }
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
      const ens = await attempt(() => C.ensureForInvItem(ctxSys(cfT, sysC.POS), dwInv.id));
      const pc1 = await countProducts(cfT);
      const sp2 = await shop.createProduct({ tenantId: cfT, unitId: SILOM }, { name: `${TAG} dw-shop2`, priceSatang: 9999, invItemId: dwInv.id });
      const ls2 = sp2?.id ? await linkOf("ShopProduct", sp2.id) : null;
      chk("S2.8", ens.ok && ls2 === idOf(ens.value) && (await countProducts(cfT)) === pc1, "ชี้ตัวเดิม · +0", `${ls2 === idOf(ens.value) ? "ตัวเดิม" : ls2} · +${(await countProducts(cfT)) - pc1}`);
      await shop.updateProduct({ tenantId: cfT, unitId: SILOM }, sp.id, { priceSatang: 4444 });
      await shop.updateProduct({ tenantId: cfT, unitId: SILOM }, sp2.id, { priceSatang: 9876 });
      chk("S2.9", (await prodById(ls))?.basePriceSatang === 4444 && (await prodById(ls2))?.basePriceSatang === 4000, "เว็บล้วน 4444 · แชร์คง 4000", `${(await prodById(ls))?.basePriceSatang} · ${(await prodById(ls2))?.basePriceSatang}`);
      // ── บัญชี / คลัง / AI / จอง ──
      const sInv = await mkInv(cfT, sysC.INVENTORY, "dw-setprice");
      await attempt(() => C.ensureForInvItem(ctxSys(cfT, sysC.POS), sInv.id));
      const sp3 = await reg.setItemSalePrice(cfT, sysC.POS, sInv.id, 3900);
      chk("S2.10", sp3?.ok && (await prodByInv(sInv.id))[0]?.basePriceSatang === 3900, "3900", `${sp3?.ok ? "" : sp3?.reason} ${(await prodByInv(sInv.id))[0]?.basePriceSatang}`);
      await accountF.updateAccountProductSalePrice(cfT, dwAp.id, 4100);
      const a1 = (await prodByInv(dwInv.id))[0]?.basePriceSatang;
      const up2 = await accProduct.updateProduct(cfT, sysC.ACCOUNT, dwAp.id, { name: dwAp.name, salePrice: 4200, vatRateBp: 0 });
      const a2 = (await prodByInv(dwInv.id))[0];
      chk("S2.11", a1 === 4100 && up2?.ok && a2?.basePriceSatang === 4200 && a2?.vatRateBp === 0, "4100 → 4200/vat 0", `${a1} → ${up2?.ok ? `${a2?.basePriceSatang}/${a2?.vatRateBp}` : up2?.reason}`);
      const up3 = await accProduct.updateProduct(cfT, sysC.ACCOUNT, dwAp.id, { name: dwAp.name, salePrice: 4200, vatRateBp: 0, posPrice: 3800, posEnabled: true });
      const k1 = (await prodByInv(dwInv.id))[0]?.basePriceSatang;
      const up4 = await accProduct.updateProduct(cfT, sysC.ACCOUNT, dwAp.id, { name: dwAp.name, salePrice: null, vatRateBp: 0, posPrice: 3800, posEnabled: true });
      const k2 = (await prodByInv(dwInv.id))[0]?.basePriceSatang;
      chk("S2.25", up3?.ok && k1 === 4200 && up4?.ok && k2 === 3800, "salePrice 4200 ชนะ · salePrice ว่าง → posPrice 3800", `${up3?.ok ? k1 : up3?.reason} · ${up4?.ok ? k2 : up4?.reason}`);
      await accProduct.updateProduct(cfT, sysC.ACCOUNT, dwAp.id, { name: dwAp.name, salePrice: 4200, vatRateBp: 0, posPrice: null, posEnabled: false });
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
      const mCokeL = await linkOf("MenuItem", fx.mCoke.id);
      await menu.updateItem(rsT, RMAIN, fx.mCoke.id, { basePrice: 2600 });
      const rlN = mCokeL ? (await q(`select id from "RecipeLine" where "productId" = $1`, mCokeL)).length : -1;
      chk("S2.18", (await prodById(mCokeL))?.basePriceSatang === 2600 && (await prodById(cokeP?.id))?.basePriceSatang === 2000 && rlN === 1, "MENU 2600 · โค้ก PRODUCT 2000 · RecipeLine 1",
        `MENU ${(await prodById(mCokeL))?.basePriceSatang} · โค้ก ${(await prodById(cokeP?.id))?.basePriceSatang} · recipe ${rlN}`);
      // ── หมวด / ตัวเลือก ──
      const cc = await menu.createCategory(rsT, RMAIN, { name: `${TAG} หมวดใหม่`, nameEn: `${TAG} newcat` });
      const pcN = (await q(`select * from "PosCategory" where "tenantId" = $1 and name = $2`, rsT, `${TAG} หมวดใหม่`));
      const ac = cc?.ok ? await menu.archiveCategory(rsT, RMAIN, cc.id) : null;
      const pcA = (await q(`select "archivedAt" from "PosCategory" where "tenantId" = $1 and name = $2`, rsT, `${TAG} หมวดใหม่`))[0];
      chk("S2.26", cc?.ok && pcN.length === 1 && pcN[0].nameEn === `${TAG} newcat` && ac?.ok && !!pcA?.archivedAt, "PosCategory 1 แถว → archived", `${pcN.length} แถว · archived ${pcA?.archivedAt ? "✓" : "✗"}`);
      const og = await menu.createOptionGroup(rsT, RMAIN, { name: `${TAG} g3`, minSelect: 0, maxSelect: 1, choices: [{ name: "หวานน้อย", priceDelta: 0 }, { name: "เพิ่มช็อต", priceDelta: 2500 }] });
      await menu.setItemOptionGroups(rsT, RMAIN, r1.id, [fx.g2.id, fx.g1.id, og.id]);
      const findRow = async () => (await listAll(C, ctxRsOwner, RMAIN)).items.find((r) => idOf(r) === l1);
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
    await purge("AccountSettings", fresh(nowLeg, snapLegacy0, "AccountSettings"));
    await purge("AppSystem", fresh(nowLeg, snapLegacy0, "AppSystem"));
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
