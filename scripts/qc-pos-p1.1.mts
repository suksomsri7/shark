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
// 🔃 รอบ 4 (ledger/pos-briefs/pos-brief-P1.1a-R4.md E1–E5): S3.40–S3.45 ใหม่ · S3.28 ขยาย · S3.29 behavioural (ดัก SQL) · S3.30 ตรงเป๊ะ
//    (ส่วนเพิ่มเทียบ dry-run ฐานก่อนสร้าง fixture) · S3.22/23/31/32 อ่านชุด migration _pos_v2_a + _pos_v2_a_links (ORACLE-EDIT รอรับรอง)
// 🔄 รอบ 5 (ledger/pos-briefs/pos-brief-P1.1a-R5.md F1–F8): S3.46–S3.59 ใหม่ (เรียกผ่าน facade `@/lib/modules/pos`.catalog · restore ตรวจแบบ
//    typeof ก่อนเรียก) · S1.21–S1.25 ต้องมีการเขียนจริงก่อน (created/updated > 0) · S1.38 ตรวจค่า before/after · S3.11 + behavioural (ดัก SQL)
//    ชื่อรับรองรอบ 5: restore · archived (ผลของ ensureForInvItem) · code BUSY · INTERNAL · audit pos.product.restore · fitness F15.6
// 🔀 รอบ oracle P1.1b (ledger/pos-briefs/pos-brief-P1.1b.md G1–G13 + addendum · notes ledger/wo-notes/pos-P1.1b-oracle.md): กลุ่ม S2 เขียนใหม่ทั้งกลุ่ม
//    ตาม API สุดท้ายของ P1.1a (id เดิม S2.1–S2.27 + X6.5 คงความหมาย · S2.10b/S2.11b/S2.19a/S2.28–S2.52 ใหม่) · prelude สร้าง "ข้อมูลเดิม" + backfill
//    หนึ่งรอบ ⇒ ข้อแก้/ทางย้อนไม่พึ่งข้อสร้าง · PART-B (S2.11b · S2.19) ข้ามด้วย guard ของตัวเองจนกว่า account/service.ts import แคตตาล็อก
//    · guard S2 นับ import `pos/catalog-legacy` ด้วย · ข้อคืนสภาพ QC4 R.1/R.2 (นับแถว + ลายนิ้วมือ) รันทุกครั้งท้ายไฟล์
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
//   VALIDATION · CONFLICT · [R5] BUSY (ล็อกร้านไม่ว่าง ลองใหม่ได้) · INTERNAL (error ไม่คาดคิด · ต้นฉบับใน cause) — ข้ามร้าน/ข้ามสาขา/ระบบผิด
//   = NOT_FOUND แบบ 404 ตรงกับข้อสอบหน้าขาย P1.3) · listForUnit คืน {items, nextCursor}
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
  D("S1.21", "-", "จอเดิม: เมนูร้านอาหาร (menu.listItems · orderingMenu · storefront.publicMenu) เหมือนก่อน backfill [R5: backfill ต้องเขียนจริงก่อน — created.posProduct + ผูกเมนู/เว็บร้าน > 0]"),
  D("S1.22", "-", "จอเดิม: หน้าร้านเว็บ (shop.listProducts activeOnly) เหมือนก่อน backfill [R5: backfill ต้องเขียนจริงก่อน]"),
  D("S1.23", "-", "จอเดิม: register.posCatalog เหมือนก่อน backfill ทุกรายการ (ราคา/ชื่อ/บาร์โค้ด · ไม่มีรายการเพิ่ม) [R5: backfill ต้องเขียนจริงก่อน]"),
  D("S1.24", "X4", "createSale ด้วย id เดิม (itemId=InvItem) ยังขายได้ และ subtotal/discount/vat/grand + บรรทัด เท่าก่อน backfill เป๊ะ [R5: backfill ต้องเขียนจริงก่อน]"),
  D("S1.25", "-", "rollback ระหว่างทาง: แถวเดิมของตารางเก่า checksum เท่าก่อน backfill (ยกเว้น updatedAt/คอลัมน์เชื่อมใหม่) · ไม่มีแถวเพิ่ม/หายในตารางเก่า [R5: backfill ต้องเขียนจริงก่อน]"),
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
  D("S1.38", "-", "ทุกการเขียน (createProduct · setPrice · archive) มีแถว AuditLog targetType PosProduct · targetId · actorId = ผู้กด · [R5] ค่า before/after: create ∅→ชื่อ/4250 · update ชื่อเดิม→ใหม่ · ราคา 4250→3999→0→3999 · archive null→เวลาที่เก็บจริง (แถวเดียว)"),
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
  // ── S2 · P1.1b sync สองทาง (guard แยก) — รอบ oracle P1.1b (brief pos-brief-P1.1b.md G1–G13 + addendum 1 ต.ค.) ──
  //    ทุกข้อใช้ fixture ของตัวเอง: แถว "ข้อมูลเดิม" สร้างตรง + backfill หนึ่งรอบ (prelude) ⇒ ข้อทางย้อน/แก้ไม่พึ่งข้อสร้าง
  //    PART-B (ต้องใช้ account/service.ts หลัง CRM merge) = S2.11b · S2.19 — ข้ามด้วย guard ของตัวเองจนกว่าไฟล์นั้น import แคตตาล็อก
  D("S2.1", "-", "menu.createItem → PosProduct ใหม่ 1 แถว (MENU · ระบบ POS ของสาขา · unitId · invItemId null · ราคา · หมวด PosCategory ชื่อเดียวกับ MenuCategory · ตัวเลือก) + MenuItem.posProductId"),
  D("S2.2", "-", "menu.updateItem ราคา/ชื่อ/ชื่ออังกฤษ (เมนูที่ backfill แล้ว) → PosProduct ตาม · ไม่เพิ่มแถว"),
  D("S2.3", "-", "menu.setItemOptionGroups (สลับลำดับ) → PosProductOptionGroup ตาม (groupId:sortOrder ตรงชุด)"),
  D("S2.4", "-", "menu.duplicateItem → เมนูสำเนาได้ PosProduct ของตัวเอง (ไม่แชร์กับต้นฉบับ) ราคา = ต้นฉบับ"),
  D("S2.5", "-", "menu.archiveItem → PosProduct ของเมนูนั้นถูกเก็บถาวร · เมนูอื่นไม่กระทบ"),
  D("S2.6", "-", "menu.setItemStock dailyStockQty → PosProduct.dailyStockQty ตาม"),
  D("S2.7", "-", "shop.createProduct (ไม่ผูกคลัง) → PosProduct ใหม่ 1 แถว (PRODUCT · POS แรกของร้าน · unitId สาขาร้าน · invItemId null) ราคา = priceSatang + ShopProduct.posProductId"),
  D("S2.8", "-", "shop.createProduct ผูก InvItem ที่มี PosProduct แล้ว → ชี้ตัวเดิม ไม่สร้างแถวใหม่"),
  D("S2.9", "-", "G5 shop.updateProduct ราคา: เว็บล้วน → PosProduct ตาม · แถวร่วมกับ InvItem ที่มีราคาบัญชี → ราคา POS ไม่ถูกเขียนทับ แต่ ShopProduct.priceSatang ของตัวเองถูกเขียน"),
  D("S2.10", "-", "register.setItemSalePrice สินค้าที่ยังไม่ผูกบัญชี (สร้าง AccountProduct + ผูก) → PosProduct.basePriceSatang ตาม"),
  D("S2.10b", "-", "register.setItemSalePrice สินค้าที่ผูกบัญชีแล้ว → AccountProduct.salePrice + PosProduct ตาม (Part A ตามการอ่านที่เข้มกว่า — ดู notes)"),
  D("S2.11", "-", "account/product.updateProduct (salePrice · vatRateBp) → PosProduct ตาม (ราคา + VAT)"),
  D("S2.11b", "-", "PART-B account.updateAccountProductSalePrice → PosProduct ตาม (ข้ามจนกว่า account/service.ts import แคตตาล็อก)"),
  D("S2.12", "-", "inventory.createItem → PosProduct ทันที (PRODUCT ราคา null · SERVICE ราคา = priceSatang) ในระบบ POS ที่ขายคลังนั้น"),
  D("S2.13", "-", "G4b ย้อนทาง: catalog.setPrice สินค้าผูกบัญชี → AccountProduct.salePrice ช่องเดียว (posPrice/posEnabled · InvItem.priceSatang/accountProductId ไม่แตะ · ไม่มี AP เพิ่ม) → register.posCatalog เห็นราคาใหม่"),
  D("S2.14", "-", "G4b ย้อนทาง: catalog.setPrice เมนู → MenuItem.basePrice ช่องเดียว → orderingMenu เห็น · updateProduct ชื่อ/ชื่ออังกฤษ → MenuItem.name/nameEn · คอลัมน์อื่นไม่ขยับ"),
  D("S2.15", "-", "G4b ย้อนทาง: catalog.setPrice/updateProduct สินค้าเว็บล้วน → ShopProduct.priceSatang/name → หน้าร้านเว็บเห็น · คอลัมน์อื่นไม่ขยับ"),
  D("S2.16", "-", "G6 ย้อนทาง: catalog.archive เมนู → MenuItem ARCHIVED + archivedAt + หายจาก orderingMenu"),
  D("S2.17", "-", "G4c ไม่เขียนซ้อน: ผู้เขียนเดิม 4 ทาง ซิงก์ครั้งแรกจริง (คู่บวก) แล้วบันทึกค่าเดิมซ้ำ 2 รอบ → จำนวน PosProduct/AccountProduct/InvItem/MenuItem/ShopProduct ไม่เพิ่ม ราคาไม่เพี้ยน"),
  D("S2.18", "-", "เมนูที่ผูก InvItem (เมนู→โค้ก) แก้ basePrice → แถว MENU ตาม (2600) · แถว PRODUCT ของโค้กคง 2000 · RecipeLine ไม่เบิ้ล"),
  D("S2.19", "X12", "PART-B F15.1: CATALOG_WRITER_BASELINE ว่าง · ผู้เขียนแคตตาล็อก (ตัวสแกน) อยู่แค่ catalog.ts + catalog-legacy.ts (ข้ามจนกว่า account/service.ts import แคตตาล็อก)"),
  D("S2.19a", "X12", "G1 F15.1 Part A: CATALOG_WRITER_BASELINE = { account/service.ts: { AccountProduct.price: 2 } } พอดี · ชุดผู้เขียน = catalog.ts + catalog-legacy.ts · ตัวสแกนพบนอกชุดนั้นตรงกับ baseline ทุกจุด"),
  D("S2.20", "-", "inventory.updateItem ราคา SERVICE (InvItem.priceSatang) → PosProduct ตาม"),
  D("S2.21", "-", "account/inventory-link.linkProductToItem({createItem}) → PosProduct ของ InvItem ใหม่ ราคา = AccountProduct.salePrice (R2) ในระบบ POS ที่ขายคลังนั้น"),
  D("S2.22", "-", "G10 AI proposal inventory_create_item (ai/proposals.runKind) → InvItem + PosProduct 1 แถว · ai/proposals.ts ไม่ import แคตตาล็อก (ไม่แก้ไฟล์นั้นใน Part A)"),
  D("S2.23", "-", "G9 booking.importServicesToCatalog (BookingService เก่า → InvItem SERVICE) → PosProduct SERVICE ราคา = BookingService.priceSatang"),
  D("S2.24", "-", "G9 ย้อนทาง: catalog.setPrice บริการ → InvItem.priceSatang → booking.serviceRoster + BookingService.priceSatang เห็นราคาใหม่"),
  D("S2.25", "-", "account/product.updateProduct [C7]: posPrice ไม่ชนะ salePrice>0 · salePrice ว่าง + posEnabled + posPrice → PosProduct = posPrice"),
  D("S2.26", "-", "menu.createCategory → PosCategory ชื่อ/ชื่ออังกฤษเดียวกัน 1 แถว (ระบบ POS · สาขา) · archiveCategory → PosCategory เก็บถาวร"),
  D("S2.27", "-", "menu.createOptionGroup + setItemOptionGroups + archiveOptionGroup → listForUnit ของเมนูที่ผูก เห็นตัวเลือก priceDelta ตรง แล้วหายเมื่อเก็บถาวร"),
  D("X6.5", "X6", "G7 แข่งกัน: menu.updateItem ราคา ↔ catalog.setPrice เมนูเดียวกัน 10 เลน (connection แยก) × 3 รอบ → ทุกเลนสำเร็จ · MenuItem.basePrice = PosProduct.basePriceSatang ทุกรอบ · ไม่มี error deadlock · pg_stat_database.deadlocks ส่วนเพิ่ม 0"),
  D("S2.28", "-", "G3 backfill-แล้วแก้ ≡ แก้-แล้ว backfill: แฝด 6 ชนิด (เมนู+ตัวเลือก+สูตร · เว็บล้วน · เว็บปิดขาย · สินค้า+AP · บริการ · เก็บถาวรคลัง) แถว PosProduct + PosProductOptionGroup + RecipeLine เท่ากันทุกช่อง"),
  D("S2.29", "-", "G3 (static) ตัวแปลงเดียว: มีฟังก์ชันใน pos/catalog*.ts ที่ backfillCatalog เรียกถึง และ catalog-legacy.ts เรียก และฟังก์ชันนั้นเรียกลำดับราคา initialPrice"),
  D("S2.30", "X12", "G4a (static) กักเขต: มี catalog-legacy.ts · SYSTEM_MARKER_ALLOWLIST มีไฟล์นี้พร้อมเหตุผล · ตัวบ่งชี้ใน src อยู่แค่ catalog.ts + catalog-legacy.ts · ไฟล์ผู้เขียนเดิม (menu · order · shop · inventory · account/product) import catalog-legacy · facade pos/index.ts ไม่ส่งต่อ"),
  D("S2.31", "X12", "G4a fitness F15.5 (behavioural · root ชั่วคราว): import catalog-legacy จาก src/app/** · src/lib/actions/** · ไฟล์ \"use server\" (static · namespace · import()) = ละเมิดครบ 3 ไฟล์ · ผู้เขียนเดิม (restaurant/menu.ts) import ได้ (คู่บวก)"),
  D("S2.32", "X12", "G4a (static) export ทุกฟังก์ชันของ catalog-legacy.ts รับ tx ของผู้เรียก (พารามิเตอร์ชนิด TransactionClient/Tx ไม่มีค่าปริยาย · ไม่รับ PrismaClient/CatalogClient) · ไม่ import prisma ตัวหลัก"),
  D("S2.33", "-", "G4c (static) ไม่ปิงปอง: pos/catalog*.ts ไม่ import โมดูลผู้เขียนเดิม (menu · order · shop · inventory · account · booking · register · ai/proposals)"),
  D("S2.34", "-", "G4c เขียนแต่ละฝั่งครั้งเดียว (ดัก SQL): ผู้เขียนเดิม 4 ทาง (เมนู · เว็บ · บริการ · บัญชี) = UPDATE ตารางเดิม 1 + PosProduct 1 · catalog.setPrice 4 ชนิด = PosProduct 1 + ตารางเดิมช่องเดียว 1"),
  D("S2.35", "X8", "G4b ย้อนทาง PRODUCT ไม่มี AccountProduct: setPrice → PosProduct เท่านั้น · ไม่สร้าง AccountProduct · InvItem.priceSatang/accountProductId ไม่ขยับ (X8.1) — ตัวกันถอย (เขียวบนฐาน)"),
  D("S2.36", "-", "G5 ตารางลำดับราคาของแถวร่วม (InvItem + AccountProduct + ShopProduct): ผู้เขียนลำดับต่ำ (เว็บร้าน · InvItem.priceSatang ของ PRODUCT) เขียนช่องตัวเองแต่ไม่ทับราคา · ผู้เขียนลำดับสูง (salePrice) ย้ายราคา (คู่บวก)"),
  D("S2.37", "-", "G6 inventory.archiveItem → PosProduct เก็บถาวร · inventory.unarchiveItem → restore (archivedAt null)"),
  D("S2.38", "-", "G6 ย้อนทาง: catalog.restore เมนูที่เก็บถาวรทั้งสองฝั่ง → MenuItem archivedAt null · ไม่ใช่ ARCHIVED · กลับมาใน orderingMenu"),
  D("S2.39", "X3", "G6/N1 restore ตรวจสิทธิ์บนแถวที่ล็อกแล้ว: อีก connection ย้ายแถว (สาขา A → ทุกสาขา) ค้างล็อกไว้ ผู้จัดการสาขา A กด restore → หลังปล่อย = PERMISSION_DENIED · แถวยังเก็บถาวร"),
  D("S2.40", "X6", "G7/G11 BUSY ผ่านประตูเดิม: ล็อกร้านถูกถือ → inventory.createItem throw ข้อความ BUSY ภาษาไทยของแคตตาล็อก + ไม่มี InvItem/PosProduct ค้าง (rollback ทั้งก้อน) · linkProductToItem({createItem}) คืน {ok:false, reason = ข้อความ BUSY} AP ยังไม่ผูก · คู่บวก ensureForInvItem = BUSY"),
  D("S2.41", "-", "G8 (static) สต็อก/86 ของเมนูย้ายเข้า catalog-legacy.ts: restaurant/order.ts import catalog-legacy · ตัวสแกน F15.1 ไม่พบการเขียนใน restaurant/order.ts และ restaurant/menu.ts"),
  D("S2.42", "-", "G8 ทางร้อนสั่งอาหาร (ดัก SQL): createOrder (หักสต็อก + 86 + หมดพอดี → rollback) และ cancelOrderItem (คืนสต็อก) จำนวนคำสั่ง = ฐาน a0f5e11e พอดี · ไม่มีคำสั่งแตะ PosProduct — ตัวกันถอย (เขียวบนฐาน)"),
  D("S2.43", "-", "G8 สต็อกสด/86 ไม่ mirror: setItemStock(isOutOfStock/stockQty) + resetDailyStock ไม่เขียน PosProduct (แถวไม่เปลี่ยน) · listForUnit availability ของเมนูอ่านจาก MenuItem (86 = false · ปลด = true)"),
  D("S2.44", "-", "G11 (static) ไม่จับแล้วไปต่อ: ทุก try ที่เรียก catalog-legacy (ในไฟล์ผู้เขียนเดิม) หรือ catalog (ใน catalog-legacy.ts) มี catch ที่ throw/return เท่านั้น"),
  D("S2.45", "-", "G11 (static) server action คืนการปฏิเสธเป็นข้อมูล: จุดเรียกประตูที่คืนค่าไม่มีช่องปฏิเสธ (inventory createItem/updateItem/archiveItem · shop createProduct/updateProduct · menu.archiveItem/setItemStock) อยู่ใน try ที่ catch คืนค่า (หรือ redirect)"),
  D("S2.46", "X12", "G12 fitness F15.5 ใช้ holdsMarker กับค่าปริยายพารามิเตอร์/แยกค่า: `ctx = { actorUserId: ตัวบ่งชี้ }` และ `{ ctx = { … } }` ถูกจับ (root ชั่วคราว) · คู่บวก `x = ตัวบ่งชี้` ถูกจับอยู่แล้ว"),
  D("S2.47", "X4", "G12 createCategory อ่านผ่าน ownFields: unitId จาก prototype ไม่ลงสาขา · คีย์แปลกของตัวเอง = VALIDATION · null/[] = VALIDATION · ไม่มีแถวเกิน"),
  D("S2.48", "X6", "G12 createProduct ล็อกร้านหลังตรวจสิทธิ์: ขณะอีก connection ถือล็อก แคชเชียร์ที่ไม่มี pos.product.manage สร้างสินค้ามีบาร์โค้ด = PERMISSION_DENIED ภายใน 2 วิ (ไม่รอล็อก) · คู่บวก เจ้าของ = BUSY · ไม่มีแถว"),
  D("S2.49", "-", "G13 ตรึงพฤติกรรม: ซิงก์จริง (คู่บวก) และแถวเดิมที่ประตูเขียน = ค่าที่ส่งพอดี คอลัมน์อื่นไม่ขยับ (เมนู · เว็บ · บริการ) · ผู้อ่านเดิม (listItems · orderingMenu · publicMenu · shop.listProducts · posCatalog · serviceRoster) เห็นแถว seed เหมือนก่อนกลุ่ม S2 ทุกตัวอักษร"),
  D("S2.50", "X2", "แยกร้าน: ประตูเดิมรับ id ของอีกร้าน (menu.updateItem/archiveItem/setItemStock · shop.updateProduct · inventory.updateItem/archiveItem · account updateProduct · shop.createProduct ผูก InvItem ร้านอื่น) → ไม่มี PosProduct ใดถูกสร้าง/แก้ในร้านใด · แถวเดิมไม่เปลี่ยน · คู่บวก ร้านตัวเองซิงก์"),
  D("S2.51", "X2", "แยกสาขา: shop.updateProduct ด้วยสาขาอื่น · menu.updateItem ด้วยสาขาที่ไม่ใช่ของเมนู → ไม่เปลี่ยนทั้งสองฝั่ง · คู่บวก สาขาถูกต้องซิงก์"),
  D("S2.52", "X3", "G4b ย้อนทางใต้กติกาแคตตาล็อก: แคชเชียร์ไม่มี pos.product.setPrice → PERMISSION_DENIED ทั้ง ShopProduct และ PosProduct ไม่เปลี่ยน · คู่บวก เจ้าของตั้งได้และ ShopProduct ตาม"),
  // ORACLE-ADD (controller R2 ruling) ▸ S2.R2 — ข้อของการแก้ R2 (brief pos-brief-P1.1b-R2.md F1–F6) · ต้องแดงบน 8bc118f6 และเขียวหลังแก้
  D("S2.R2.1", "-", "R2 F2 ย้อนทางลงขั้นที่ชนะ: แถวเว็บร้านเอง (C9b) ผูกบริการ InvItem.priceSatang>0 → setPrice เขียน InvItem.priceSatang (ไม่ใช่ ShopProduct.priceSatang) · แก้เว็บร้านครั้งถัดไปราคาคง · --verify แถวนี้ไม่ drift"),
  D("S2.R2.2", "-", "R2 F3 พี่น้อง: setPrice บนแถวเว็บร้านของบริการ → แถว InvItem ของบริการเดียวกันใน POS อีกระบบได้ราคาใหม่ในธุรกรรมเดียว"),
  D("S2.R2.3", "X4", "R2 F4 setPrice(0) ที่ช่องเดิมแสดงไม่ได้ (สินค้า + AP ราคา POS ชนะ) = VALIDATION ข้อความไทย · AP และ PosProduct ไม่เปลี่ยน · คู่บวก ราคา > 0 ไป AccountProduct.salePrice"),
  D("S2.R2.4", "-", "R2 F5 แถวเว็บร้านที่ ShopProduct สองแถวใช้ร่วม: แก้ ShopProduct แถวที่สองไม่เปลี่ยนราคา/ชื่อของแถวแคตตาล็อก (แถวแรกเป็นต้นทาง) · ShopProduct แถวที่สองยังถูกเขียน"),
  D("S2.R2.5", "X6", "R2 F6 menu.createItem 2 ครั้งพร้อมกัน หมวดใหม่ที่ยังไม่มี PosCategory: สำเร็จทั้งคู่ · PosCategory ชื่อนั้น 1 แถว · ทั้งสองแถว MENU ชี้หมวดเดียวกัน"),
  D("S2.R2.6", "-", "R2 F1 (static) ทุก redirect ?err= ใน inventory/actions · shop/actions · actions/booking · actions/restaurant ไปหน้าที่อ่าน err จาก searchParams แล้วแสดง (InvHub รับ err)"),
  // ORACLE-ADD (controller R3 ruling) ▸ S2.R3 — ข้อของการแก้ R3 (brief pos-brief-P1.1b-R3.md H1–H2) · S2.R3.1/S2.R3.2 ต้องแดงบน 6668635c
  D("S2.R3.1", "X6", "R3 H1 (2 connection) conn1 UPDATE AccountProduct.salePrice ค้างไม่ commit · conn2 inventory.linkAccountProduct(Y→A) เบื้องหลัง · conn1 commit → แถวของ Y = ราคาใหม่ · verifyCatalog ไม่มี drift ของแถว Y"),
  D("S2.R3.2", "X6", "R3 H1 (2 connection) conn1 UPDATE AccountProduct.salePrice ค้างไม่ commit · conn2 shop.createProduct({invItemId: Y ผูก A · C9b}) เบื้องหลัง · conn1 commit → แถวใหม่ = ราคาใหม่ · verifyCatalog ไม่มี drift"),
  D("S2.R3.3", "X6", "R3 H2 3 เลน (setPrice แถว P · link Y→A · account.updateProduct(A)) × 5 รอบ → ทุกเลนสำเร็จ · ไม่มี deadlock (error + pg_stat_database.deadlocks ส่วนเพิ่ม 0) · ทุกแถวของ A ราคาเท่ากัน = AP.salePrice · verify ไม่ drift"),
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
  D("S3.11", "-", "C6 (static) ค้นด้วยคำสั่งเดียว: listForUnit ไม่มี take: 2000 / invItem.findMany ก่อน · toViews ไม่ filter ต่อแถว (ใช้ Map) · [R5 behavioural] client ดัก SQL: หน้า 500 แถว ≤ 20 คำสั่ง และ ≤ หน้า 5 แถว + 2"),
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
  D("S3.23", "-", "M2 คำสั่งแรก SET LOCAL lock_timeout · ALTER TABLE … ADD COLUMN ของตารางเดิม 5 ตัวอยู่ท้าย (ก่อน RESET lock_timeout ตัวสุดท้าย · DO-block นับเป็นคำสั่งเดียว) [R4: อ่านชุด migration _pos_v2_a + _pos_v2_a_links ต่อกันตามลำดับโฟลเดอร์]"),
  D("S3.24", "-", "M3 SQL: \"trackStock\" BOOLEAN nullable ไม่มี DEFAULT"),
  D("S3.25", "-", "M4 index PosProduct(systemId, archivedAt, name, id)"),
  D("S3.26", "-", "M5 partial unique PosCategory(systemId, name) WHERE unitId IS NULL"),
  // ── S3.27+ · ROUND 3 (brief P1.1a-R3 · D1–D7) ──
  D("S3.27", "X3", "D1 ผู้จัดการร้านสาขาเดียว (unitAccess=[สาขานั้น]) และผู้จัดการที่ระบุทุกสาขาเอง ([สีลม, อารีย์]) เขียนสินค้า/หมวดทุกสาขาได้ (createProduct · setPrice · updateProduct · archive · createCategory)"),
  D("S3.28", "X3", "D1+C3 ผู้จัดการสาขา A ใน POS สองคลัง: สินค้าทุกสาขาที่ขายได้เฉพาะ A (คลัง X) แก้ได้ · ของคลัง Y และไม่ผูกคลัง = PERMISSION_DENIED · [R4] createProduct(unitId null) ผูก InvItem คลัง X ได้ · คลัง Y = PERMISSION_DENIED · updateProduct ย้ายไปสาขาที่คลังไม่มีของนั้น = VALIDATION"),
  D("S3.29", "-", "D2 (behavioural · R4) listForUnit ผ่าน client ที่ดัก SQL: InvMovement ถูกถามได้แค่ใน EXISTS (SELECT 1 …) ที่ผูก itemId + systemId ≤1 คำสั่งต่อหน้า ไม่มี GROUP BY/JOIN · movement ของคลังอื่นไม่ทำให้ AUTO ตัดสต็อก · movement ของคลังสาขาทำให้ตัด"),
  D("S3.30", "-", "D3+E3 (R4 · ตรงเป๊ะ) แถวราคา null ของ fixture แบ่งพวกครบ: อยู่ในตัวอย่างของตัวนับราคา null ตัวเดียวพอดี (soldAtCostToday · apIgnoredButTillPriced · invalidLegacyPrice · priceNotSetOther) · ส่วนเพิ่มของตัวนับ = จำนวน fixture · servicePriceDiffersFromAccountProduct"),
  D("S3.31", "-", "D4 คำสั่งสุดท้ายของ migration = RESET lock_timeout"),
  D("S3.32", "-", "D4 ทุกคำสั่งรันซ้ำได้: CREATE TABLE/INDEX IF NOT EXISTS · ADD COLUMN IF NOT EXISTS · enum/FK อยู่ใน DO $$ … EXCEPTION WHEN duplicate_object"),
  D("S3.33", "X12", "D5 facade (pos/index.ts) ไม่ส่งต่อ backfillCatalog · marker สร้างด้วย Symbol( ไม่ใช่ Symbol.for( · ไม่มี `?? CATALOG_SYSTEM_ACTOR` ใน src"),
  D("S3.34", "X2", "D6 createProduct ผูก InvItem ของคลังที่ไม่ได้เสิร์ฟสาขา unitId ที่ส่ง = VALIDATION (ไม่จองช่อง unique ด้วยแถวที่มองไม่เห็น)"),
  D("S3.35", "-", "D6 trackStock true บนบริการ (SERVICE) = VALIDATION ทั้ง createProduct และ updateProduct"),
  D("S3.36", "X6", "D6 createProduct/createCategory ธรรมดาไม่รอล็อกร้านที่อีก connection ถืออยู่ (เสร็จ < 3 วิ) · คู่บวก: createProduct ผูก InvItem ยังรอล็อก"),
  D("S3.37", "-", "D6 byBarcode (UNION) ยังคืนทั้งสองแหล่ง: บาร์โค้ดของแถวเอง + บาร์โค้ดของ InvItem ที่ผูก"),
  D("S3.38", "X3", "D6 สมาชิกที่ยังไม่รับคำเชิญ (acceptedAt null — กติกาบ้าน core/context.ts) = ไม่ใช่สมาชิก → NOT_FOUND"),
  D("S3.39", "-", "D6 zeroPriceWeb นับเฉพาะแถวที่ราคาสุดท้ายคือราคาเว็บ 0 (เว็บร้านราคา 0 ที่ผูก InvItem มีราคาบัญชี ไม่นับ) = 1 ตรง"),
  // ── S3.40+ · ROUND 4 (brief P1.1a-R4 · E1–E5) ──
  D("S3.40", "X3", "E1 facade catalog.checkCatalogWrite: actor null/undefined/ตัวบ่งชี้ระบบ = \"PERMISSION_DENIED\" (ทั้งแถวสาขาและแถวทุกสาขา) · เจ้าของ = \"OK\" (คู่บวก)"),
  D("S3.41", "X2", "E1 checkCatalogWrite unitId ที่ไม่ใช่สาขาไม่เก็บถาวรที่ผูก where.systemId (ร้านอื่น · POS อื่นของร้าน · สาขาเก็บถาวร · สาขาไม่มี POS · ไม่มีจริง) = \"NOT_FOUND\" แม้เป็นเจ้าของ · สาขาของ POS นี้ = \"OK\""),
  D("S3.42", "-", "E2 migration สองโฟลเดอร์ 20261120000000_pos_v2_a + 20261120000001_pos_v2_a_links · ไฟล์ links: SET lock_timeout (ไม่ใช่ LOCAL) แรก · ALTER TABLE … ADD COLUMN IF NOT EXISTS ห้าตัวพอดี (ตารางเดิม 5 ตัว) · RESET lock_timeout ท้าย · ไม่มี DO · ไม่มี $$"),
  D("S3.43", "-", "E2 ไฟล์แรก (_pos_v2_a) ไม่มี ALTER TABLE บนตารางเดิม 5 ตัว (MenuItem · ShopProduct · ShopOrderLine · PosSaleLine · RestaurantOrderItem) และไม่เพิ่มคอลัมน์เชื่อม"),
  D("S3.44", "-", "E3 ตัวนับ catalogPriceDiffersFromTill (ราคาแคตตาล็อกไม่ว่าง ≠ ราคาลิ้นชักวันนี้) ส่วนเพิ่ม = fixture 4 ตัวพอดี · ตัวอย่างมีทั้งสองราคา: posPrice 3000 vs ต้นทุน 2000 · บริการ AP 12000 vs 0 · posPrice 4400 vs 0 · บริการ AP 12000 vs คลัง 15000 · ราคาเท่ากันไม่ถูกนับ"),
  D("S3.45", "X12", "D5/E5 (behavioural) ค่าทุกตัวของ facade pos/index.ts และ facade.catalog ไม่มี symbol (ตัวบ่งชี้) และไม่มีฟังก์ชัน backfillCatalog · facade มี checkCatalogWrite"),
  // ── S3.46+ · ROUND 5 (brief P1.1a-R5 · F1–F8) — ผ่าน facade `@/lib/modules/pos`.catalog ──
  D("S3.46", "-", "F1 restore: archive → หายจาก list → facade.catalog.restore(ctx, id) → กลับมาใน list · กดซ้ำ OK ไม่มี audit แถวที่สอง · แถวไม่เคยเก็บถาวร restore = OK ไม่มี audit · audit pos.product.restore before.archivedAt ไม่ว่าง → after.archivedAt null · actorId = ผู้กด"),
  D("S3.47", "X3", "F1 restore ขอบเขตเดียวกับ archive: ผู้จัดการสาขา A กับแถวทุกสาขาที่ขายที่ B = PERMISSION_DENIED (แถวยังเก็บถาวร) · แถวที่ขายเฉพาะ A ได้ (คู่บวก) · ร้านอื่น = NOT_FOUND · id ไม่มีจริง = NOT_FOUND"),
  D("S3.48", "-", "F1 ensureForInvItem คืน {id, created, archived} — แถวปกติ archived=false · แถวที่เก็บถาวร archived=true id เดิม created=false และไม่ปลดเก็บถาวรเอง"),
  D("S3.49", "-", "F1 createProduct({invItemId}) ทับแถวแคตตาล็อกที่เก็บถาวร = CONFLICT · ข้อความบอกว่าเก็บถาวร/คืนได้ (มีคำว่า เก็บถาวร) · ไม่มี id ของแถวในข้อความ · ไม่มีแถวเพิ่ม"),
  D("S3.50", "-", "F1 แถวเก็บถาวร: setPrice + updateProduct ยังทำได้ (ไม่ปฏิเสธ) · restore แล้วแถวมีราคา/ชื่ออังกฤษใหม่ และ list เห็นราคานั้น"),
  D("S3.51", "-", "F1 restore ที่บาร์โค้ดชนแถวที่ยังขายอยู่ = CONFLICT (throw CatalogError ไม่ใช่ P2002 ดิบ) · แถวยังเก็บถาวร"),
  D("S3.52", "X4", "F2 ตัวเขียน: NUL (\\u0000) / surrogate เดี่ยว ใน name · nameEn · sku · barcode (createProduct) · name/nameEn (updateProduct) · ชื่อหมวด (createCategory) = VALIDATION ทุกตัว · ไม่มีแถวเพิ่ม · แถวเดิมไม่เปลี่ยน"),
  D("S3.53", "-", "F2 ตัวอ่าน: listForUnit q / cursor ที่มี NUL หรือ surrogate เดี่ยว = VALIDATION · byBarcode รหัสที่มี NUL / surrogate เดี่ยว = {items: []} (ไม่ throw)"),
  D("S3.54", "X12", "F2 ทุกการเรียกของ S3.52/S3.53 + id/สาขา/ctx ที่มี NUL: error ที่ throw เป็น CatalogError ที่ code ∈ ชุดรับรอง (NOT_FOUND · PERMISSION_DENIED · VALIDATION · CONFLICT · BUSY · INTERNAL) ไม่มี path (/root/ · src/lib/) · error ไม่คาดคิดจาก client = INTERNAL ข้อความไทยคงที่ เก็บต้นฉบับใน cause"),
  D("S3.55", "X6", "F3 อีก connection ถือ pg_advisory_xact_lock(hashtext('pos-catalog:'||tenant)) 8 วิ: createProduct(บาร์โค้ด) · createProduct(invItemId) · ensureForInvItem = BUSY ภายใน < 7 วิ (ข้อความไทย) ไม่เขียนอะไร · ปล่อยล็อกแล้วเรียกเดิมสำเร็จ"),
  D("S3.56", "-", "F4 เว็บร้าน 2 แถวแชร์ InvItem เดียวนอกคลังของ POS แรก (ราคา 0 และราคาผิดรูป→null): นับแถวแคตตาล็อกครั้งเดียว — zeroPriceWeb +1 · shopOwnRowInvItemOutsideFirstPos +2 · Σ ตัวนับราคา null ส่วนเพิ่ม = แถวราคา null ที่สร้าง (3)"),
  D("S3.57", "X2", "F6 checkCatalogWrite เจ้าของ + invItemId ของร้านอื่น / คลังที่ไม่ขายผ่าน POS นี้ / ไม่มีจริง = \"NOT_FOUND\" (แถวทุกสาขา + แถวสาขา) · InvItem ของคลัง POS นี้ = \"OK\" (คู่บวก)"),
  D("S3.58", "X4", "F6 อ่านเฉพาะคีย์ของตัวเอง (Object.hasOwn): patch ที่ unitId มาจาก prototype ไม่ย้ายแถว · create ที่ unitId มาจาก prototype ไม่ลงสาขานั้น · คีย์แปลกของตัวเอง = VALIDATION (create + update) · patch/input null หรือ array = VALIDATION"),
  D("S3.59", "X12", "F5 scripts/fitness-pos.mts ลงทะเบียนกฎ F15.6 (src/** ห้าม import จาก scripts/**) — static (หลักฐานลบเป็นของ builder)"),
  // ── ท้ายรัน ──
  D("S1.36", "X5", "rollback ปลายทาง: ลบแถวตารางใหม่ที่รันนี้สร้าง + คืนคอลัมน์เชื่อม + ลบ fixtures → ตารางเดิม (จำนวน + checksum) และตารางใหม่ เท่าก่อนรัน · ร้าน QC กลับสภาพเดิม"),
  // ── R · QC4 คืนสภาพ (รอบ oracle P1.1b · แบบ qc-pos-p1.3 S9.1/S9.2) — รันทุกครั้งที่ไม่ SKIP ทั้งไฟล์ (ทั้งโหมดปกติและ QC_FORCE) ──
  D("R.1", "X5", "QC4 คืนสภาพ — นับแถว: ทุกตารางที่มี tenantId ของร้าน QC POS ทั้งสอง ก่อน = หลัง · ตารางแคตตาล็อกของร้านอื่น (PosProduct · PosCategory · MenuItem · ShopProduct · InvItem · AccountProduct · BookingService) ก่อน = หลัง"),
  D("R.2", "X5", "QC4 คืนสภาพ — ลายนิ้วมือ: แถวที่มีอยู่ก่อนรันของร้าน QC POS (แคตตาล็อก · คลัง · บัญชีสินค้า · เมนู · เว็บร้าน · จอง · ระบบ/สาขา · สมาชิกทีม · ตั้งค่า) ทุกคอลัมน์รวม updatedAt ก่อน = หลัง (แถวที่ค่าคืนครบแต่ updatedAt เด้ง → คืน updatedAt ด้วย SQL ตรงก่อนตรวจ · พิมพ์จำนวน)"),
];
const S2_IDS = new Set(CHECKS.filter((c) => c.id.startsWith("P1.1-S2.") || c.id === "P1.1-X6.5").map((c) => c.id));
/** รอบ oracle P1.1b: ข้อคืนสภาพ QC4 (รันทุกครั้ง · ไม่อยู่ในกลุ่ม S2) */
const RES_IDS = new Set(CHECKS.filter((c) => c.id.startsWith("P1.1-R.")).map((c) => c.id));
/** PART-B (brief P1.1b "Why A / B"): ต้องใช้ account/service.ts ที่ CRM เขียนใหม่ — ข้ามด้วย guard ของตัวเองจนกว่าไฟล์นั้น import แคตตาล็อก */
const PART_B = new Set(["P1.1-S2.11b", "P1.1-S2.19"]);
const PART_B_WHY = "src/lib/modules/account/service.ts ยังไม่ import แคตตาล็อก (pos/catalog หรือ pos/catalog-legacy) — Part B ทำหลัง CRM merge (brief P1.1b \"Why A / B\")";

if (process.argv.includes("--list")) {
  for (const c of CHECKS) console.log(`${c.id}\t[${c.x}]\t${c.title}`);
  console.log(`รวม ${CHECKS.length} ข้อ · P1.1a ${CHECKS.length - S2_IDS.size - RES_IDS.size} · คืนสภาพ QC4 ${RES_IDS.size} · P1.1b ${S2_IDS.size} (PART-B ${PART_B.size}: ${[...PART_B].join(",")})`);
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
/** R5: เหมือน attempt แต่เก็บ error ดิบ (ตรวจข้อความ/คลาส/cause) + เวลา */
type TryX = Try & { e?: unknown; ms: number };
async function attemptX(fn: () => Promise<Any>): Promise<TryX> {
  const t = Date.now();
  let raw: unknown;
  const r = await attempt(async () => { try { return await fn(); } catch (e) { raw = e; throw e; } });
  return { ...r, e: raw, ms: Date.now() - t };
}
/** R5 (F2/F3): ชุด code ที่รับรองแล้ว — error ที่หลุดจาก facade ต้องอยู่ในชุดนี้ */
const RATIFIED_CODES = new Set(["NOT_FOUND", "PERMISSION_DENIED", "VALIDATION", "CONFLICT", "BUSY", "INTERNAL"]);
const PATH_RE = /\/root\/|src\/lib\//;
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
  // รอบ oracle P1.1b: ประตูที่ brief G2/G8 เพิ่ม
  "src/lib/modules/restaurant/order.ts", "src/lib/modules/pos/register.ts",
];
/** import แคตตาล็อก = pos/catalog หรือ pos/catalog-legacy (brief P1.1b G1/G2 — ประตูเดิมเรียก catalog-legacy.ts) */
const CATALOG_IMPORT_RE = /from\s+["'][^"']*pos\/catalog(-legacy)?["']|import\(\s*["'][^"']*pos\/catalog(-legacy)?["']/;
const p11bStarted = LEGACY_WRITERS.some((f) => CATALOG_IMPORT_RE.test(read(f)));
/** PART-B เริ่มเมื่อ account/service.ts import แคตตาล็อก */
const partBStarted = CATALOG_IMPORT_RE.test(read("src/lib/modules/account/service.ts"));
const skippedChecks: Record<string, string> = {};
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

// ═══ R · QC4 คืนสภาพ (รอบ oracle P1.1b · แบบ qc-pos-p1.3 S9.1/S9.2) — ภาพก่อนสร้าง fixture ใด ๆ ═══
/** ตารางแคตตาล็อกที่นับแถวของ "ร้านอื่น" ด้วย (ร้านอื่นต้องไม่ถูกแตะเลย) */
const RES_OTHER = ["PosProduct", "PosCategory", "MenuItem", "ShopProduct", "InvItem", "AccountProduct", "BookingService"];
/** ตารางที่เก็บลายนิ้วมือทุกคอลัมน์ (รวม updatedAt) ของแถวเดิมของร้าน QC */
const RES_FP = [
  "PosProduct", "PosCategory", "PosProductOptionGroup", "RecipeLine", "InvItem", "InvItemImage", "InvLocationStock", "AccountProduct",
  "MenuItem", "MenuCategory", "MenuOptionGroup", "MenuOptionChoice", "MenuItemOptionGroup", "KdsStation", "ShopProduct", "BookingService",
  "AppSystem", "AppSystemUnit", "BusinessUnit", "Membership", "AccountSettings", "AccountSystemLink", "RestaurantSetting", "PosReceiptCounter",
];
async function residueCounts(): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  const tabs = (await q<{ t: string }>(`select c.table_name as t from information_schema.columns c join information_schema.tables tb on tb.table_schema = c.table_schema and tb.table_name = c.table_name
    where c.table_schema = 'public' and c.column_name = 'tenantId' and tb.table_type = 'BASE TABLE' order by 1`)).map((r) => r.t);
  for (let i = 0; i < tabs.length; i += 40) {
    const sql = tabs.slice(i, i + 40).map((t) => `select '${t}' as t, count(*)::int as n from "${t}" where "tenantId" = any($1::text[])`).join(" union all ");
    for (const r of await q<{ t: string; n: number }>(sql, QC_TIDS)) out[r.t] = Number(r.n);
  }
  for (const t of RES_OTHER) if (TABLES.has(t)) out[`ร้านอื่น.${t}`] = Number((await q<{ n: number }>(`select count(*)::int as n from "${t}" where not ("tenantId" = any($1::text[]))`, QC_TIDS))[0]?.n ?? -1);
  return out;
}
type FpRow = { h: string; hNoU: string; u: string | null };
async function residueFp(): Promise<Record<string, Map<string, FpRow>>> {
  const out: Record<string, Map<string, FpRow>> = {};
  for (const t of RES_FP) {
    if (!TABLES.has(t)) continue;
    const cols = await colInfo(t);
    if (!cols.has("tenantId")) continue;
    const hasU = cols.has("updatedAt");
    const rows = await q<Any>(`select *${hasU ? `, "updatedAt"::text as "__qcU"` : ""} from "${t}" where "tenantId" = any($1::text[])`, QC_TIDS);
    const m = new Map<string, FpRow>();
    for (const r of rows) {
      const u = (r.__qcU ?? null) as string | null;
      delete r.__qcU;
      const noU = { ...r };
      delete noU.updatedAt;
      m.set(String(r.id), { h: hashOf(r), hNoU: hashOf(noU), u });
    }
    out[t] = m;
  }
  return out;
}
const resCounts0 = await residueCounts();
const resFp0 = await residueFp();
/** ตารางข้างเคียงที่ประตูเดิมสร้างแถวเองได้ (เช่น nextSku สร้าง InvSettings) — แถวใหม่ของรันนี้ถูกลบท้ายรัน (พบจาก R.1 รอบแรก) */
const EXTRA_FRESH = ["InvSettings", "InvLocation", "InvCategory", "AccountUnit", "RestaurantOrder"];
const extraIdsOf = async (): Promise<Record<string, Set<string>>> => {
  const out: Record<string, Set<string>> = {};
  for (const t of EXTRA_FRESH) if (TABLES.has(t)) out[t] = new Set((await q<{ id: string }>(`select id from "${t}" where "tenantId" = any($1::text[])`, QC_TIDS)).map((r) => r.id));
  return out;
};
const extraIds0 = await extraIdsOf();

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
    // ORACLE-EDIT P1.1-S3.22/S3.23/S3.31/S3.32 (oracle writer R4 — รอผู้คุมงานรับรอง): E2 แยกคอลัมน์เชื่อม 5 ตัวไปไฟล์ที่สอง
    //   `_pos_v2_a_links` ⇒ "migration" ของข้อเหล่านี้ = ชุด _pos_v2_a (+ _pos_v2_a_links ถ้ามี) ต่อกันตามลำดับโฟลเดอร์ (ไฟล์เดียว = เหมือนเดิมทุกตัวอักษร)
    const migSet = existsSync("prisma/migrations") ? readdirSync("prisma/migrations").filter((d) => /_pos_v2_a(_links)?$/.test(d) && existsSync(`prisma/migrations/${d}/migration.sql`)).sort() : [];
    const sql = migDir ? migSet.map((d) => read(`prisma/migrations/${d}/migration.sql`)).join("\n") : "";
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

  // ═══ S3.42–S3.43 · E2 (round 4 · static) แยก migration: ตารางใหม่ (atomic · DO $$) + คอลัมน์เชื่อมตารางเดิม (ทีละคำสั่ง) ═══
  await section("migration-r4", ["S3.42", "S3.43"], async () => {
    const MAIN = "20261120000000_pos_v2_a"; const LINKS = "20261120000001_pos_v2_a_links";
    const has = (d: string) => existsSync(`prisma/migrations/${d}/migration.sql`);
    const strip = (x: string) => x.replace(/--.*$/gm, "");
    const linksSql = strip(read(`prisma/migrations/${LINKS}/migration.sql`));
    const lst = linksSql.split(";").map((x) => x.replace(/\s+/g, " ").trim()).filter(Boolean);
    const OLD5: [string, string][] = [["ShopProduct", "posProductId"], ["ShopOrderLine", "posProductId"], ["PosSaleLine", "productId"], ["MenuItem", "posProductId"], ["RestaurantOrderItem", "productId"]];
    const mid = lst.slice(1, -1);
    const addRe = /^ALTER TABLE "(\w+)" ADD COLUMN IF NOT EXISTS "(\w+)" TEXT$/i;
    const midPairs = mid.map((x) => addRe.exec(x)).map((m) => (m ? `${m[1]}.${m[2]}` : "✗"));
    const want5 = OLD5.map(([t, c]) => `${t}.${c}`).sort();
    const s342 = {
      bothFolders: has(MAIN) && has(LINKS),
      setFirst: /^SET lock_timeout\b/i.test(lst[0] ?? "") && !/^SET LOCAL\b/i.test(lst[0] ?? ""),
      resetLast: /^RESET lock_timeout$/i.test(lst[lst.length - 1] ?? ""),
      fiveAddIfNotExists: (linksSql.match(/ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS/gi) ?? []).length === 5 && mid.length === 5 && midPairs.slice().sort().join(",") === want5.join(","),
      noDo: !/\bDO\b/i.test(linksSql),
      noDollar: !/\$\w*\$/.test(linksSql),
    };
    chk("S3.42", Object.values(s342).every(Boolean), `${MAIN} + ${LINKS} · SET lock_timeout → ADD COLUMN IF NOT EXISTS ×5 (${want5.join(" ")}) → RESET · ไม่มี DO/$$`,
      `${Object.entries(s342).map(([k, v]) => `${k}${v ? "✓" : "✗"}`).join(" ")} · โฟลเดอร์ ${has(MAIN) ? "main✓" : "main✗"} ${has(LINKS) ? "links✓" : "links ไม่มี"} · คำสั่ง ${lst.length}: ${lst.map((x) => x.slice(0, 40)).join(" | ").slice(0, 200) || "-"}`);
    const mainSql = strip(read(`prisma/migrations/${MAIN}/migration.sql`));
    const touch = OLD5.filter(([t]) => new RegExp(`ALTER\\s+TABLE\\s+(IF\\s+EXISTS\\s+)?(ONLY\\s+)?"${t}"`, "i").test(mainSql)).map(([t]) => t);
    const addLink = OLD5.filter(([, c]) => new RegExp(`ADD\\s+COLUMN\\s+(IF\\s+NOT\\s+EXISTS\\s+)?"${c}"`, "i").test(mainSql)).map(([, c]) => c);
    chk("S3.43", has(MAIN) && touch.length === 0 && addLink.length === 0, `${MAIN} ไม่มี ALTER TABLE บนตารางเดิม 5 ตัว · ไม่มี ADD COLUMN คอลัมน์เชื่อม`,
      `${has(MAIN) ? "" : "ไม่พบไฟล์ · "}ALTER TABLE: ${touch.join(",") || "-"} · ADD COLUMN: ${[...new Set(addLink)].join(",") || "-"}`);
  });

  // ═══ R4 ฐานตัวนับ: dry-run ก่อนสร้าง fixture (อ่านล้วน) — S3.30/S3.44 เทียบ "ส่วนเพิ่ม" = fixture ของรันนี้พอดี (ไม่ผูกกับสภาพ seed) ═══
  let baseSummary: Any = null;
  await section("baseline-counts", ["S3.30", "S3.44"], async () => {
    const b = await runBackfill(["--dry-run"]);
    if (b.code !== 0 || !b.summary) throw new Error(`dry-run ฐานตัวนับล้ม: exit ${b.code} · ${tail(b.out)}`);
    baseSummary = b.summary;
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
    // R4: บริการราคา 100 (ไม่ใช่สินค้าไม่มีราคา) — ให้ 520 แถวนี้อยู่นอกตัวนับราคา null ⇒ ตัวอย่าง ≤20 ต่อร้านของ priceNotSetOther
    //     มี fixture ที่มีชื่อครบทุกตัว (S3.30 ตรงเป๊ะ) · S1.37 ทดสอบแค่การเดินหน้า/ค้น (ไม่ขึ้นกับชนิด) · ราคา = 100 ทั้งแคตตาล็อกและลิ้นชัก
    await P.invItem.createMany({ data: Array.from({ length: BULK }, (_, i) => ({ tenantId: cfT, systemId: sysC.INVENTORY, sku: `${TAG}-bulk-${String(i).padStart(3, "0")}`, name: `${TAG} bulk ${i}`, kind: "SERVICE", priceSatang: 100 })) });
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
    // ── round 4 fixtures (E3/E5) — ราคาลิ้นชักวันนี้: PRODUCT = salePrice>0 ? salePrice : max(0, ต้นทุน) (register.ts:146-149) · SERVICE = InvItem.priceSatang (register.ts:166-174)
    fx.r4SvcArchAp = await mkInv(cfT, sysC.INVENTORY, "r4-svc0-arch-ap", { kind: "SERVICE", priceSatang: 0 });
    await mkAp(cfT, sysC.ACCOUNT, fx.r4SvcArchAp, 2500, 700, null, { archivedAt: new Date() });           // แคตตาล็อก null · ลิ้นชัก 0 (บริการไม่อ่าน AP) ⇒ priceNotSetOther
    fx.r4PosOverCost = await mkInv(cfT, sysC.INVENTORY, "r4-pos-over-cost", { costSatang: 2000 });
    await mkAp(cfT, sysC.ACCOUNT, fx.r4PosOverCost, 0, 700, 3000, { posEnabled: true });                 // แคตตาล็อก 3000 · ลิ้นชัก 2000 (ต้นทุน) ⇒ catalogPriceDiffersFromTill
    fx.r4SvcLiveAp = await mkInv(cfT, sysC.INVENTORY, "r4-svc0-live-ap", { kind: "SERVICE", priceSatang: 0 });
    await mkAp(cfT, sysC.ACCOUNT, fx.r4SvcLiveAp, 12000);                                                // แคตตาล็อก 12000 · ลิ้นชัก 0 ⇒ catalogPriceDiffersFromTill
    fx.r4NegCost = await mkInv(cfT, sysC.INVENTORY, "r4-neg-with-cost", { costSatang: 800 });
    await mkAp(cfT, sysC.ACCOUNT, fx.r4NegCost, -100);                                                   // แคตตาล็อก null · ลิ้นชัก 800 ⇒ ตัวนับราคา null ตัวเดียวพอดี (soldAtCost หรือ invalidLegacy)
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
  await section("invariants", ["S3.30", "S3.44", "S3.39", "S3.12", "S3.13", "S3.15", "S3.16", "S3.17", "S1.9", "S1.10", "S1.11", "S1.12", "S1.13", "S1.14", "S1.15", "S1.16", "S1.17", "S1.18"], async () => {
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
    // S3.30 (D3 → R4 E3/E5 · ตรงเป๊ะ) แถวราคา null แบ่งพวกครบ — ส่วนเพิ่มเทียบฐานตัวนับก่อนสร้าง fixture (baseSummary) · ตัวอย่างจับคู่ด้วย id แหล่ง หรือชื่อ (ป้าย TAG ไม่ซ้ำ)
    const cntB = (k: string): number | undefined => { const v = baseSummary?.counts?.[k] ?? baseSummary?.[k]; return typeof v === "number" ? v : undefined; };
    const delta = (k: string): number | null => (cnt(k) === undefined || cntB(k) === undefined ? null : (cnt(k) as number) - (cntB(k) as number));
    const samplesOf = (k: string, tid: string): Any[] => { const v = drySummary?.samples?.[k]?.[tid]; return Array.isArray(v) ? v : []; };
    const inSample = (k: string, tid: string, f: Any) => samplesOf(k, tid).some((r: Any) => r && (r.id === f.id || r.name === f.name));
    const PN = ["soldAtCostToday", "apIgnoredButTillPriced", "invalidLegacyPrice", "priceNotSetOther"] as const;
    const SC = "soldAtCostToday", AI = "apIgnoredButTillPriced", IL = "invalidLegacyPrice", NS = "priceNotSetOther";
    // แถวราคา null ของ fixture รันนี้ (แหล่ง → ตัวนับที่ต้องอยู่ · r4NegCost เข้าได้ตัวเดียวจาก 2 ตัวตามลำดับตัดสินของ builder)
    const pnFix: [string, Any, string, string[]][] = [
      ["costOnly", fx.costOnly, cfT, [SC]], ["p7", fx.p7, cfT, [SC]],
      ["p4", fx.p4, cfT, [AI]], ["p5", fx.p5, cfT, [AI]],
      ["p9", fx.p9, cfT, [IL]], ["mNeg", fx.mNeg, rsT, [IL]],
      ["svcZero", fx.svcZero, cfT, [NS]], ["p3", fx.p3, cfT, [NS]], ["p6", fx.p6, cfT, [NS]], ["dupA", fx.dupA, cfT, [NS]], ["dupB", fx.dupB, cfT, [NS]],
      ["itX", fx.itX, cfT, [NS]], ["itY", fx.itY, cfT, [NS]], ["r4SvcArchAp", fx.r4SvcArchAp, cfT, [NS]],
      ["r4NegCost", fx.r4NegCost, cfT, [SC, IL]],
    ];
    const memb = pnFix.map(([label, f, tid, ok]) => { const at = PN.filter((k) => inSample(k, tid, f)); return { label, at, good: at.length === 1 && ok.includes(at[0]) }; });
    const negBucket = memb.find((m) => m.label === "r4NegCost")?.at[0];
    const wantDelta: Record<string, number> = { [SC]: 2 + (negBucket === SC ? 1 : 0), [AI]: 2, [IL]: 2 + (negBucket === IL ? 1 : 0), [NS]: 8 };
    const pricedCtl: [string, Any, string][] = [["r4PosOverCost", fx.r4PosOverCost, cfT], ["r4SvcLiveAp", fx.r4SvcLiveAp, cfT], ["p2", fx.p2, cfT], ["svcDiff", fx.svcDiff, cfT], ["posPrice", fx.posPrice, cfT], ["p8", fx.p8, cfT]];
    const ctlLeak = pricedCtl.filter(([, f, tid]) => PN.some((k) => inSample(k, tid, f))).map(([l]) => l);
    const nullMadeNow = madeNow.filter((p) => p.basePriceSatang === null).length;
    const dSum = PN.reduce((s, k) => s + (delta(k) ?? Number.NaN), 0);
    const s330 = {
      samplesInvalidLegacy: !!drySummary?.samples && typeof drySummary.samples === "object" && "invalidLegacyPrice" in drySummary.samples,
      membership: memb.every((m) => m.good),
      exactDeltas: PN.every((k) => delta(k) === wantDelta[k]),
      partitionSum: dSum === pnFix.length && nullMadeNow === pnFix.length,
      pricedNotInPriceNull: ctlLeak.length === 0,
      servicePriceDiffersFromAccountProduct: (delta("servicePriceDiffersFromAccountProduct") ?? -1) >= 1 && inSample("servicePriceDiffersFromAccountProduct", cfT, fx.svcDiff),
      svcDiffPrice: pInv(fx.svcDiff) === 12000,
      r4Prices: pInv(fx.r4SvcArchAp) === null && pInv(fx.r4NegCost) === null && pInv(fx.r4PosOverCost) === 3000 && pInv(fx.r4SvcLiveAp) === 12000,
    };
    chk("S3.30", Object.values(s330).every(Boolean),
      `ทุกแถวราคา null ของ fixture (${pnFix.length}) อยู่ในตัวอย่างตัวนับเดียว · ส่วนเพิ่ม soldAtCost ${wantDelta[SC]} · apIgnored 2 · invalidLegacy ${wantDelta[IL]} · priceNotSetOther 8 (ผลรวม ${pnFix.length} = แถว null ที่สร้าง) · มีราคาไม่อยู่ในตัวอย่างราคา null · samples.invalidLegacyPrice มี`,
      `${Object.entries(s330).map(([k, v]) => `${k}${v ? "✓" : "✗"}`).join(" ")} · ส่วนเพิ่ม ${PN.map((k) => `${k}=${delta(k) ?? "ไม่มี"}`).join(" ")} (รวม ${Number.isNaN(dSum) ? "-" : dSum} · null ที่สร้าง ${nullMadeNow}) · ผิดที่: ${memb.filter((m) => !m.good).map((m) => `${m.label}→${m.at.join("+") || "ไม่มีในตัวอย่าง"}`).join(", ") || "-"}${ctlLeak.length ? ` · มีราคาแต่อยู่ในตัวอย่าง: ${ctlLeak.join(",")}` : ""}`);
    // S3.44 (E3) catalogPriceDiffersFromTill — ส่วนเพิ่ม = 4 · ตัวอย่างมีทั้งราคาแคตตาล็อกและราคาลิ้นชัก
    const pairOk = (r: Any, cat: number, till: number) => {
      if (!r || typeof r !== "object") return false;
      if (r.catalogPriceSatang === cat && r.tillPriceSatang === till) return true;
      const nums = Object.values(r).filter((v): v is number => typeof v === "number");
      const i = nums.indexOf(cat);
      return i >= 0 && nums.some((v, j) => j !== i && v === till);
    };
    const CD = "catalogPriceDiffersFromTill";
    const sampleRow = (f: Any) => samplesOf(CD, cfT).find((r: Any) => r && (r.id === f.id || r.name === f.name));
    const cdIn: [string, Any, number, number][] = [["r4PosOverCost", fx.r4PosOverCost, 3000, 2000], ["r4SvcLiveAp", fx.r4SvcLiveAp, 12000, 0], ["p2", fx.p2, 4400, 0], ["svcDiff", fx.svcDiff, 12000, 15000]];
    const cdOut: [string, Any][] = [["posPrice", fx.posPrice], ["posZero", fx.posZero], ["p8", fx.p8], ["arch", fx.arch], ["svcZero", fx.svcZero], ["costOnly", fx.costOnly]];
    const cdBadIn = cdIn.filter(([, f, c, t]) => !pairOk(sampleRow(f), c, t)).map(([l, f]) => `${l}:${sampleRow(f) ? JSON.stringify(sampleRow(f)).slice(0, 80) : "ไม่มีในตัวอย่าง"}`);
    const cdBadOut = cdOut.filter(([, f]) => !!sampleRow(f)).map(([l]) => l);
    chk("S3.44", delta(CD) === 4 && cdBadIn.length === 0 && cdBadOut.length === 0,
      "ส่วนเพิ่ม 4 · ตัวอย่าง 3000/2000 · 12000/0 · 4400/0 · 12000/15000 · ราคาเท่ากัน/null ไม่อยู่ในตัวอย่าง",
      `ส่วนเพิ่ม ${delta(CD) ?? `ไม่มีตัวนับ (${cnt(CD) ?? "-"}/${cntB(CD) ?? "-"})`} · ขาด/ผิด: ${cdBadIn.join(" · ") || "-"} · ไม่ควรอยู่: ${cdBadOut.join(",") || "-"}`);
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
    // R5 (F8): "เหมือนเดิม" มีความหมายเฉพาะเมื่อ backfill เขียนจริง — created.posProduct + ผูกคอลัมน์เชื่อมเมนู/เว็บร้าน > 0 ก่อน (fixture ของรันนี้รับประกัน)
    const rc = createdOf(realSummary); const ru = updatedOf(realSummary);
    const wrote = (rc.posProduct ?? 0) > 0 && (ru.menuItem ?? 0) > 0 && (ru.shopProduct ?? 0) > 0;
    const wroteTxt = `backfill เขียน posProduct ${rc.posProduct ?? "?"} · menuItem ${ru.menuItem ?? "?"} · shopProduct ${ru.shopProduct ?? "?"}${wrote ? "" : " ✗ (ไม่ได้เขียน — ข้อนี้พิสูจน์อะไรไม่ได้)"}`;
    chk("S1.21", wrote && eq("menuList") && eq("ordering") && eq("publicMenu"), "backfill เขียนจริง · เหมือนเดิม", `${wroteTxt} · listItems ${eq("menuList")} · orderingMenu ${eq("ordering")} · publicMenu ${eq("publicMenu")}`);
    chk("S1.22", wrote && eq("shopList"), "backfill เขียนจริง · เหมือนเดิม", `${wroteTxt} · ${eq("shopList") ? "เหมือน" : "ต่าง"}`);
    chk("S1.23", wrote && eq("regCf") && eq("regRs"), "backfill เขียนจริง · เหมือนเดิมทุกรายการ", `${wroteTxt} · ร้านกาแฟ ${eq("regCf")} (${before.regCf.length}→${after.regCf.length}) · ร้านอาหาร ${eq("regRs")} (${before.regRs.length}→${after.regRs.length})`);
    const saleAfter = await saleProbe();
    chk("S1.24", wrote && !!saleBefore && hashOf(saleBefore) === hashOf(saleAfter), `backfill เขียนจริง · ${JSON.stringify(saleBefore)}`, `${wroteTxt} · ${JSON.stringify(saleAfter)}`);
    const d = diffSnap(legacyPre, await snapLegacy());
    chk("S1.25", wrote && Object.keys(d).length === 0, "backfill เขียนจริง · ตารางเดิมไม่ต่าง", `${wroteTxt} · ${diffText(d)}`);
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

  // ═══ S3.56 · R5 F4 ตัวนับของแถวแคตตาล็อกที่เว็บร้านหลายแถวใช้ร่วม (สถานะหลัง X6.1 = ทุกแหล่งผูกแล้ว ⇒ ส่วนเพิ่ม = fixture ของข้อนี้พอดี) ═══
  await section("r5-counters", ["S3.56"], async () => {
    const base = await runBackfill(["--dry-run"]);
    if (base.code !== 0 || !base.summary) throw new Error(`dry-run ฐานล้ม: exit ${base.code} · ${tail(base.out)}`);
    // InvItem 2 ตัวในคลัง X (ขายผ่าน POS สองคลังของ fixture เท่านั้น — นอกคลังของ POS แรก) · เว็บร้านสีลม 2 แถวต่อ InvItem
    //   zero: ราคาเว็บ 0 ทั้งคู่ ⇒ แถวของเว็บร้านเองราคา 0 (zeroPriceWeb) · neg: ราคาเว็บ −100 ทั้งคู่ ⇒ ราคาผิดรูป → null (ตัวนับราคา null)
    const zInv = await mkInv(cfT, fx.tInvX.id, "r5-shared-zero"); const nInv = await mkInv(cfT, fx.tInvX.id, "r5-shared-neg");
    const sh = [await mkShop("r5-shared-zero-1", 0, zInv.id), await mkShop("r5-shared-zero-2", 0, zInv.id), await mkShop("r5-shared-neg-1", -100, nInv.id), await mkShop("r5-shared-neg-2", -100, nInv.id)];
    const pre = new Set((await rowsOf("PosProduct", QC_TIDS)).map((p) => p.id));
    const real = await runBackfill([]);
    if (real.code !== 0 || !real.summary) throw new Error(`backfill ล้ม: exit ${real.code} · ${tail(real.out)}`);
    const made = (await rowsOf("PosProduct", QC_TIDS)).filter((p) => !pre.has(p.id));
    const madeNull = made.filter((p) => p.basePriceSatang === null).length;
    const c = (s: Any, k: string): number => { const v = s?.counts?.[k] ?? s?.[k]; return typeof v === "number" ? v : Number.NaN; };
    const dl = (k: string) => c(real.summary, k) - c(base.summary, k);
    const PNK = ["soldAtCostToday", "apIgnoredButTillPriced", "invalidLegacyPrice", "priceNotSetOther"];
    const sumNull = PNK.reduce((s, k) => s + dl(k), 0);
    const links = await Promise.all(sh.map((x) => linkOf("ShopProduct", x.id)));
    const r356 = {
      created4: made.length === 4,
      linksShared: !!links[0] && links[0] === links[1] && !!links[2] && links[2] === links[3] && links[0] !== links[2],
      zeroPriceWeb1: dl("zeroPriceWeb") === 1,
      shopOwnRow2: dl("shopOwnRowInvItemOutsideFirstPos") === 2,
      priceNullSum: sumNull === madeNull && madeNull === 3,
    };
    chk("S3.56", Object.values(r356).every(Boolean), "สร้าง 4 แถว (InvItem ×2 ใน POS สองคลัง + แถวเว็บร้าน ×2) · เว็บร้านคู่ละแถวเดียว · zeroPriceWeb +1 · shopOwnRowInvItemOutsideFirstPos +2 · Σ ตัวนับราคา null +3 = แถวราคา null ที่สร้าง 3",
      `${Object.entries(r356).map(([k, v]) => `${k}${v ? "✓" : "✗"}`).join(" ")} · สร้าง ${made.length} (null ${madeNull}) · zeroPriceWeb +${dl("zeroPriceWeb")} · shopOwnRow +${dl("shopOwnRowInvItemOutsideFirstPos")} · ราคา null ${PNK.map((k) => `${k}+${dl(k)}`).join(" ")} (รวม ${sumNull})`);
  });

  // ═══ S1.19–S1.35 + X2/X3/X6/X8 catalog.ts ═══
  const catIds = ["S3.46", "S3.47", "S3.48", "S3.49", "S3.50", "S3.51", "S3.52", "S3.53", "S3.54", "S3.55", "S3.57", "S3.58", "S3.59", "S3.27", "S3.28", "S3.29", "S3.40", "S3.41", "S3.45", "S3.33", "S3.34", "S3.35", "S3.36", "S3.37", "S3.38", "S3.1", "S3.2", "S3.3", "S3.4", "S3.5", "S3.6", "S3.7", "S3.8", "S3.9", "S3.10", "S3.11", "S3.14", "S3.18", "S3.19", "S3.20", "S3.21", "S1.19", "S1.20", "S1.26", "S1.37", "S1.38", "S1.39", "S1.40", "S1.41", "S1.27", "S1.28", "S1.29", "S1.30", "S1.31", "S1.32", "S1.33", "S1.34", "S1.35", "X2.1", "X2.2", "X2.3", "X3.1", "X3.2", "X3.3", "X6.2", "X6.3", "X6.4", "X8.1"];
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
    // R5 (F8): ค่า before/after ของทุกแถว — create (before ว่าง · after ชื่อ/ราคา 4250) · update (ชื่อเดิม → ชื่อใหม่) · price สาย 4250→3999→0→3999
    //   (ค่าที่ถูกปฏิเสธไม่มีแถว) · archive แถวเดียว (archivedAt null → เวลาที่เก็บจริง)
    const auv = await q<{ action: string; before: Any; after: Any }>(`select action, before, after from "AuditLog" where "tenantId" = $1 and "targetType" = 'PosProduct' and "targetId" = $2 and "createdAt" >= $3 order by "createdAt", id`, cfT, pid, t0);
    const isoS = (v: unknown) => (v ? new Date(v as string).toISOString() : String(v));
    const aCreate = auv.filter((a) => /creat/.test(a.action)); const aUpd = auv.filter((a) => /updat/.test(a.action));
    const aPrice = auv.filter((a) => /price/i.test(a.action)); const aArch = auv.filter((a) => /archiv/.test(a.action));
    const chain = aPrice.map((a) => `${a.before?.basePriceSatang}→${a.after?.basePriceSatang}`).join(",");
    const s138v = {
      create: aCreate.length === 1 && aCreate[0].before == null && aCreate[0].after?.name === `${TAG} สินค้าใหม่` && aCreate[0].after?.basePriceSatang === 4250,
      update: aUpd.length >= 1 && aUpd[0].before?.name === `${TAG} สินค้าใหม่` && aUpd[0].after?.name === `${TAG} ชื่อใหม่` && aUpd[0].before?.nameEn === `${TAG} new` && aUpd[0].after?.nameEn === `${TAG} renamed`,
      priceChain: chain === "4250→3999,3999→0,0→3999",
      archive: aArch.length === 1 && aArch[0].before?.archivedAt === null && !!pa?.archivedAt && isoS(aArch[0].after?.archivedAt) === isoS(pa.archivedAt),
    };
    chk("S1.38", au.length >= 4 && au.every((a) => a.actorId === cfOwner.userId && /^pos\.product\./.test(a.action)) && auActs.some((a) => /creat/.test(a)) && auActs.some((a) => /price/i.test(a)) && auActs.some((a) => /archiv/.test(a)) && Object.values(s138v).every(Boolean),
      "≥4 แถว (create · update · price · archive) · actorId = เจ้าของ · action pos.product.* · [R5] before/after: create ∅→4250 · update ชื่อเดิม→ใหม่ · ราคา 4250→3999,3999→0,0→3999 · archive null→เวลาจริง ×1",
      `${au.length} แถว: ${[...new Set(auActs)].join(",") || "-"} · actor ${[...new Set(au.map((a) => a.actorId))].join(",") || "-"} · ${Object.entries(s138v).map(([k, v]) => `${k}${v ? "✓" : "✗"}`).join(" ")} · ราคา ${chain || "-"}`);

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
    // R5 (F8 · behavioural): นับคำสั่ง SQL ที่ถึง DB จริง (client ดัก $on("query") แบบ S3.29) — หน้า 500 แถว ≤ 20 คำสั่ง และไม่เกินหน้า 5 แถว + 2
    //   (เผื่อคำสั่งมีเงื่อนไข: กลุ่มตัวเลือก · movement ของแถว AUTO) ⇒ ไม่มี N+1 ต่อแถว
    const spy11 = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL, max: 2 }), log: [{ emit: "event", level: "query" }] });
    clients.push(spy11);
    const sql11: string[] = [];
    spy11.$on("query", (e: Any) => sql11.push(String(e?.query ?? "")));
    const count11 = async (limit: number) => { const i0 = sql11.length; const r = await attempt(() => C.listForUnit(ctxOwner, SILOM, { limit }, spy11)); await new Promise((res) => setTimeout(res, 50)); return { r, n: sql11.length - i0, rows: listOf(r.value).length }; };
    const big11 = await count11(500); const small11 = await count11(5);
    const s311b = { probe: big11.r.ok && small11.r.ok && big11.n > 0 && big11.rows === 500 && small11.rows === 5, max20: big11.n <= 20, flat: big11.n <= small11.n + 2 };
    console.log(`  ℹ️  S3.11 คำสั่ง SQL: หน้า ${big11.rows} แถว = ${big11.n} · หน้า ${small11.rows} แถว = ${small11.n}`);
    chk("S3.11", !!lfb && Object.values(s311).every(Boolean) && Object.values(s311b).every(Boolean), "ไม่มี take:2000 · ไม่มี invItem.findMany ก่อน · toViews ไม่ filter ต่อแถว · [R5] หน้า 500 แถว ≤ 20 คำสั่ง SQL และ ≤ หน้า 5 แถว + 2",
      `${Object.entries({ ...s311, ...s311b }).map(([k, v]) => `${k}${v ? "✓" : "✗"}`).join(" ")} · หน้า ${big11.rows} แถว = ${big11.n} คำสั่ง · หน้า ${small11.rows} แถว = ${small11.n} คำสั่ง${big11.r.ok ? "" : ` · ${big11.r.err}`}`);
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
    // R4 (E5 · ตรึงพฤติกรรมเดิม): createProduct แถวทุกสาขาผูก InvItem ใหม่ (ยังไม่อยู่ในแคตตาล็อก) — คลัง X (ขายได้แค่ A) ได้ · คลัง Y (ขายที่ B) ไม่ได้
    const x2 = await mkInv(cfT, fx.tInvX.id, "r4-wh-x2"); const y2 = await mkInv(cfT, fx.tInvY.id, "r4-wh-y2");
    const aNew = await asManagerOf([fx.uA.id], async () => ({
      cx: await attempt(() => C.createProduct(tCx, { name: `${TAG} r4-a-x2`, unitId: null, invItemId: x2.id, basePriceSatang: 600 })),
      cy: await attempt(() => C.createProduct(tCx, { name: `${TAG} r4-a-y2`, unitId: null, invItemId: y2.id, basePriceSatang: 600 })),
    }));
    const x2Row = await prodById(idOf(aNew.cx.value));
    const y2Rows = (await prodByInv(y2.id)).length;
    // updateProduct (เจ้าของ) ย้ายแถวผูกคลัง X ไปสาขา B (คลัง Y) = VALIDATION แถวไม่เปลี่ยน · ไปสาขา A (คลัง X) ได้ (คู่บวก)
    const mvId = (x2Row?.id ?? prodX?.id) as string;
    const mv0 = hashOf(await prodById(mvId));
    const mvB = await attempt(() => C.updateProduct(ctxT, mvId, { unitId: fx.uB.id }));
    const mvSame = hashOf(await prodById(mvId)) === mv0;
    const mvA = await attempt(() => C.updateProduct(ctxT, mvId, { unitId: fx.uA.id }));
    const mvAUnit = (await prodById(mvId))?.unitId;
    const r4ok = aNew.cx.ok && x2Row?.unitId === null && x2Row?.invItemId === x2.id && refused(aNew.cy, "PERMISSION_DENIED") && y2Rows === 0 && refused(mvB, "VALIDATION") && mvSame && mvA.ok && mvAUnit === fx.uA.id;
    chk("S3.28", !!prodX && prodX.unitId === null && aOnly.x.ok && refused(aOnly.y, "PERMISSION_DENIED") && refused(aOnly.n, "PERMISSION_DENIED") && r4ok,
      "ขายเฉพาะ A ✓ · คลัง Y PERMISSION_DENIED · ไม่ผูกคลัง PERMISSION_DENIED · [R4] สร้างทุกสาขาผูก X ✓ · ผูก Y PERMISSION_DENIED · ย้ายไป B = VALIDATION (ไม่เปลี่ยน) · ย้ายไป A ✓",
      `X ${aOnly.x.ok ? "✓" : codeOf(aOnly.x)} · Y ${codeOf(aOnly.y)} · ไม่ผูก ${codeOf(aOnly.n)}${prodX ? "" : " · ไม่มีแถวของ X"} · [R4] สร้าง X ${aNew.cx.ok ? `✓ unit ${x2Row?.unitId ?? "null"}` : aNew.cx.err} · สร้าง Y ${codeOf(aNew.cy)} (แถว ${y2Rows}) · →B ${codeOf(mvB)}${mvSame ? "" : " (แถวเปลี่ยน!)"} · →A ${mvA.ok ? `✓ ${mvAUnit === fx.uA.id ? "" : "unit ผิด"}` : mvA.err}`);
    // S3.29 D2 (R4 · behavioural แทน regex — E5): ส่ง client ที่ดัก SQL (Prisma `$on("query")` — ใช้ได้กับ PrismaPg บน 7.8 · ตรวจแล้ว) ให้ listForUnit
    //   แล้วดูคำสั่งที่ถึง DB จริง + ผลของ AUTO เมื่อ movement อยู่คลังอื่น/คลังสาขา (ไม่ต้องมี hook ใน schema/โค้ดสินค้า)
    const spy = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL, max: 2 }), log: [{ emit: "event", level: "query" }] });
    clients.push(spy);
    const sqlSeen: string[] = [];
    spy.$on("query", (e: Any) => sqlSeen.push(String(e?.query ?? "")));
    const traced = async (fn: () => Promise<Any>) => { const i0 = sqlSeen.length; const r = await attempt(fn); await new Promise((res) => setTimeout(res, 20)); return { r, sql: sqlSeen.slice(i0) }; };
    const d2Inv = await mkInv(cfT, sysC.INVENTORY, "r4-d2-probe"); // onHand 0 · PRODUCT · AUTO
    const d2P = await attempt(() => C.ensureForInvItem(ctxSys(cfT, sysC.POS), d2Inv.id));
    await P.invMovement.create({ data: { tenantId: cfT, systemId: fx.tInvX.id, itemId: d2Inv.id, type: "IN", qtyDelta: 1, balanceAfter: 1, idempotencyKey: `${TAG}-d2-other-wh` } });
    const tOther = await traced(() => C.listForUnit(ctxOwner, SILOM, { q: d2Inv.sku }, spy));
    const vOther = listOf(tOther.r.value).find((x) => x.invItemId === d2Inv.id);
    await P.invMovement.create({ data: { tenantId: cfT, systemId: sysC.INVENTORY, itemId: d2Inv.id, type: "IN", qtyDelta: 1, balanceAfter: 1, idempotencyKey: `${TAG}-d2-own-wh` } });
    const tOwn = await traced(() => C.listForUnit(ctxOwner, SILOM, { q: d2Inv.sku }, spy));
    const vOwn = listOf(tOwn.r.value).find((x) => x.invItemId === d2Inv.id);
    const tBig = await traced(() => C.listForUnit(ctxOwner, SILOM, { q: `${TAG} c7-`, limit: 500 }, spy)); // หน้าที่มีแถว AUTO onHand 0 หลายแถว (fixture C7 ×8 · N+1 จะเห็นเป็นหลายคำสั่ง) — ไม่ใช้หน้าแรกเปล่า ๆ เพราะ bulk 520 แถว (บริการ) กินทั้งหน้า
    const autoZero = listOf(tBig.r.value).filter((x) => x.trackStockMode === "auto" && x.kind === "PRODUCT" && x.invItemId && x.stock?.[SILOM] === 0).length;
    const mvBad = (sqls: string[]): string[] => {
      const mv = sqls.filter((x) => /"InvMovement"/.test(x));
      const out: string[] = [];
      if (mv.length > 1) out.push(`${mv.length} คำสั่งต่อหน้า`);
      for (const x of mv) {
        const from = (x.match(/FROM\s+("public"\.)?"InvMovement"/gi) ?? []).length;
        const inExists = (x.match(/EXISTS\s*\(\s*SELECT\s+1\s+FROM\s+("public"\.)?"InvMovement"/gi) ?? []).length;
        if (/GROUP\s+BY/i.test(x)) out.push("GROUP BY");
        if (/JOIN\s+("public"\.)?"InvMovement"/i.test(x)) out.push("JOIN InvMovement");
        if (from !== inExists) out.push("FROM InvMovement นอก EXISTS");
        if (!/"itemId"/.test(x) || !/"systemId"/.test(x)) out.push("ไม่ผูก itemId/systemId");
      }
      return out;
    };
    const probeOk = [tOther, tOwn, tBig].every((t) => t.sql.some((x) => /"PosProduct"/.test(x))); // คู่บวกของตัวดัก
    const s329 = {
      probe: probeOk, setup: d2P.ok && tOther.r.ok && tOwn.r.ok && tBig.r.ok && autoZero >= 2,
      otherWarehouseOff: vOther?.trackStock === false && vOther?.trackStockMode === "auto", ownWarehouseOn: vOwn?.trackStock === true && vOwn?.trackStockMode === "auto",
      sqlShape: [tOther, tOwn, tBig].every((t) => mvBad(t.sql).length === 0),
    };
    chk("S3.29", Object.values(s329).every(Boolean), "ตัวดักเห็น SQL · movement คลังอื่น = AUTO false · คลังสาขา = AUTO true · InvMovement เฉพาะใน EXISTS(SELECT 1 …) ผูก itemId+systemId ≤1 คำสั่ง/หน้า ไม่มี GROUP BY/JOIN",
      `${Object.entries(s329).map(([k, v]) => `${k}${v ? "✓" : "✗"}`).join(" ")} · AUTO onHand 0 ในหน้าใหญ่ ${autoZero} · คลังอื่น ${vOther ? `${vOther.trackStock}/${vOther.trackStockMode}` : "ไม่พบ"} · คลังสาขา ${vOwn ? `${vOwn.trackStock}/${vOwn.trackStockMode}` : "ไม่พบ"} · ผิดรูป: ${[...new Set([tOther, tOwn, tBig].flatMap((t) => mvBad(t.sql)))].join(",") || "-"}${d2P.ok ? "" : ` · ensure ${d2P.err}`}`);
    // ═════════ ROUND 4 (S3.40+) — E1 ผ่าน facade · E5 facade behavioural ═════════
    const facade4 = await load("@/lib/modules/pos");
    const ccw = facade4?.catalog?.checkCatalogWrite;
    const PERM_M = (C.PERM_MANAGE as string | undefined) ?? "pos.product.manage";
    const whereC = { tenantId: cfT, systemId: sysC.POS };
    const ownerM = { role: cfOwner.role, unitAccess: cfOwner.unitAccess, permissions: cfOwner.permissions };
    // ใช้ action ของ requireRowWrite (pos.product.manage) — ส่งเป็นอาร์กิวเมนต์ที่ 4
    const verdictA = async (actor: Any, unitId: string | null) => {
      if (typeof ccw !== "function") return "ไม่มี facade.catalog.checkCatalogWrite";
      try { return String(await ccw(actor, whereC, { unitId, invItemId: null }, PERM_M)); } catch (e) { return `throw ${firstLine(e).slice(0, 70)}`; }
    };
    const e1a: [string, string][] = [
      ["null@สีลม", await verdictA(null, SILOM)], ["undefined@สีลม", await verdictA(undefined, SILOM)], ["null@ทุกสาขา", await verdictA(null, null)],
      ["undefined@ทุกสาขา", await verdictA(undefined, null)], ["ตัวบ่งชี้@สีลม", await verdictA(marker, SILOM)], ["ตัวบ่งชี้@ทุกสาขา", await verdictA(marker, null)],
    ];
    const e1ctl: [string, string][] = [["เจ้าของ@สีลม", await verdictA(ownerM, SILOM)], ["เจ้าของ@ทุกสาขา", await verdictA(ownerM, null)]];
    chk("S3.40", e1a.every(([, v]) => v === "PERMISSION_DENIED") && e1ctl.every(([, v]) => v === "OK"), "null/undefined/ตัวบ่งชี้ = PERMISSION_DENIED ×6 · เจ้าของ OK ×2",
      `${e1a.map(([k, v]) => `${k}:${v}`).join(" ")} · ${e1ctl.map(([k, v]) => `${k}:${v}`).join(" ")}`);
    const e1b: [string, string][] = [
      ["สาขาร้านอื่น", await verdictA(ownerM, RMAIN)], ["สาขาของ POS อื่น (A)", await verdictA(ownerM, fx.uA.id)], ["สาขาเก็บถาวร", await verdictA(ownerM, fx.archUnit.id)],
      ["สาขาไม่มี POS", await verdictA(ownerM, fx.noPosUnit.id)], ["ไม่มีจริง", await verdictA(ownerM, `${TAG}-ghost-unit`)],
    ];
    const e1bCtl: [string, string][] = [["สีลม", await verdictA(ownerM, SILOM)], ["อารีย์", await verdictA(ownerM, ARI)]];
    chk("S3.41", e1b.every(([, v]) => v === "NOT_FOUND") && e1bCtl.every(([, v]) => v === "OK"), "NOT_FOUND ×5 (เจ้าของ) · สาขาของ POS นี้ OK ×2",
      `${e1b.map(([k, v]) => `${k}:${v}`).join(" ")} · ${e1bCtl.map(([k, v]) => `${k}:${v}`).join(" ")}`);
    // S3.45 facade: ค่าทุกตัว (module namespace + facade.catalog) ไม่มี symbol · ไม่มี backfillCatalog (ทั้งชื่อคีย์และตัวฟังก์ชันเดียวกัน)
    const fVals: [string, unknown][] = [...Object.entries(facade4 ?? {}), ...Object.entries((facade4?.catalog ?? {}) as Record<string, unknown>).map(([k, v]) => [`catalog.${k}`, v] as [string, unknown])];
    const symHit = fVals.filter(([, v]) => typeof v === "symbol" || v === marker).map(([k]) => k);
    const bfHit = fVals.filter(([k, v]) => /(^|\.)backfillCatalog$/.test(k) || (typeof v === "function" && (v === C.backfillCatalog || (v as Any).name === "backfillCatalog"))).map(([k]) => k);
    chk("S3.45", !!facade4 && fVals.length > 0 && symHit.length === 0 && bfHit.length === 0 && typeof ccw === "function", "ไม่มี symbol · ไม่มี backfillCatalog · มี catalog.checkCatalogWrite",
      `ค่า ${fVals.length} ตัว · symbol: ${symHit.join(",") || "-"} · backfill: ${bfHit.join(",") || "-"} · checkCatalogWrite ${typeof ccw}`);
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

    // ═════════ ROUND 5 (S3.46+) — brief P1.1a-R5 F1–F6 · เรียกผ่าน facade `@/lib/modules/pos`.catalog (ทางที่ผู้เรียกนอกโมดูลใช้) ═════════
    {
    const F: Any = facade?.catalog ?? {};
    const CE: Any = facade?.CatalogError;
    const ctxT5 = { tenantId: cfT, systemId: fx.tPos.id, actorUserId: cfOwner.userId as string };
    const tCx5 = { tenantId: cfT, systemId: fx.tPos.id, actorUserId: cfCashier.userId as string };
    // F1: restore ยังไม่มีบน b9d192ec — ตรวจ typeof ก่อนเรียก (ไม่มี = ปฏิเสธด้วย code NO_RESTORE ⇒ ข้อที่ใช้แดงพร้อมเหตุ ไม่ล้มทั้งชุด)
    //   ลายเซ็นที่ใช้ = restore(ctx, id, client?) แบบเดียวกับ archive (ผู้กระทำอยู่ใน ctx.actorUserId) — ดู "ที่กำกวม" ใน notes รอบ 5
    const hasRestore = typeof F.restore === "function";
    const restore = (ctx: Any, id: unknown): Promise<Any> =>
      hasRestore ? F.restore(ctx, id) : Promise.reject(Object.assign(new Error("facade.catalog.restore ยังไม่มี (typeof ≠ function)"), { code: "NO_RESTORE" }));
    const restoreAudits = async (id: string) =>
      q<{ before: Any; after: Any; actorId: string | null }>(`select before, after, "actorId" from "AuditLog" where "tenantId" = $1 and "targetType" = 'PosProduct' and "targetId" = $2 and action = 'pos.product.restore' and "createdAt" >= $3 order by "createdAt", id`, cfT, id, t0);
    const inListAt = async (ctx: Any, unit: string, id: string, qq: string) => (await listAll(F, ctx, unit, { q: qq })).items.find((x) => idOf(x) === id);
    const flags = (o: Record<string, boolean>) => Object.entries(o).map(([k, v]) => `${k}${v ? "✓" : "✗"}`).join(" ");

    // S3.46 F1 archive → restore → กลับมาใน list · กดซ้ำ OK ไม่มี audit ซ้ำ · แถวไม่เคยเก็บถาวร restore = OK ไม่มี audit · audit before/after
    const n46 = `${TAG} r5-restore`;
    const p46 = await attempt(() => F.createProduct(ctxOwner, { name: n46, unitId: SILOM, basePriceSatang: 4600 }));
    const id46 = idOf(p46.value) as string;
    const a46 = await attempt(() => F.archive(ctxOwner, id46));
    const gone46 = !(await inListAt(ctxOwner, SILOM, id46, n46));
    const r46a = await attempt(() => restore(ctxOwner, id46));
    const back46 = await inListAt(ctxOwner, SILOM, id46, n46);
    const r46b = await attempt(() => restore(ctxOwner, id46));
    const au46 = id46 ? await restoreAudits(id46) : [];
    const live46 = await attempt(() => F.createProduct(ctxOwner, { name: `${TAG} r5-never-archived`, unitId: SILOM, basePriceSatang: 100 }));
    const r46c = await attempt(() => restore(ctxOwner, idOf(live46.value)));
    const au46c = idOf(live46.value) ? await restoreAudits(idOf(live46.value) as string) : [];
    const row46 = await prodById(id46);
    const s346 = {
      setup: p46.ok && a46.ok && gone46 && live46.ok,
      restored: r46a.ok && !!back46 && row46?.archivedAt === null,
      idempotent: r46b.ok && au46.length === 1,
      liveNoAudit: r46c.ok && au46c.length === 0 && (await prodById(idOf(live46.value)))?.archivedAt === null,
      audit: au46.length >= 1 && !!au46[0].before?.archivedAt && !!au46[0].after && typeof au46[0].after === "object" && "archivedAt" in au46[0].after && au46[0].after.archivedAt === null && au46[0].actorId === cfOwner.userId,
    };
    chk("S3.46", Object.values(s346).every(Boolean), "เก็บแล้วหาย → restore กลับมาใน list · ซ้ำ OK (audit 1 แถว) · แถวปกติ restore OK ไม่มี audit · audit pos.product.restore archivedAt เวลา → null โดยเจ้าของ",
      `${flags(s346)} · restore ${codeOf(r46a)}/${codeOf(r46b)} · แถวปกติ ${codeOf(r46c)} · audit ${au46.length}/${au46c.length}${au46[0] ? ` (${JSON.stringify(au46[0].before)}→${JSON.stringify(au46[0].after)})` : ""}`);

    // S3.47 F1 ขอบเขตเดียวกับ archive (D1 requireRowWrite) · ร้านอื่น/ไม่มีจริง = NOT_FOUND
    const yInv5 = await mkInv(cfT, fx.tInvY.id, "r5-restore-y"); const xInv5 = await mkInv(cfT, fx.tInvX.id, "r5-restore-x");
    const ey5 = await attempt(() => F.ensureForInvItem(ctxSys(cfT, fx.tPos.id), yInv5.id));
    const ex5 = await attempt(() => F.ensureForInvItem(ctxSys(cfT, fx.tPos.id), xInv5.id));
    const yId = idOf(ey5.value) as string; const xId = idOf(ex5.value) as string;
    const ay5 = await attempt(() => F.archive(ctxT5, yId)); const ax5 = await attempt(() => F.archive(ctxT5, xId));
    const other47 = await attempt(() => restore(ctxRsOwner, yId));
    const ghost47 = await attempt(() => restore(ctxOwner, `${TAG}-ghost-product`));
    const mgr47 = await asManagerOf([fx.uA.id], async () => ({ y: await attempt(() => restore(tCx5, yId)), x: await attempt(() => restore(tCx5, xId)) }));
    const yRow5 = await prodById(yId); const xRow5 = await prodById(xId);
    const s347 = {
      setup: ey5.ok && ex5.ok && ay5.ok && ax5.ok && yRow5?.unitId === null && xRow5?.unitId === null,
      managerA_rowSoldAtB_denied: refused(mgr47.y, "PERMISSION_DENIED") && !!yRow5?.archivedAt,
      managerA_rowSoldAtA_ok: mgr47.x.ok && xRow5?.archivedAt === null,
      otherTenantNotFound: refused(other47, "NOT_FOUND"),
      ghostNotFound: refused(ghost47, "NOT_FOUND"),
    };
    chk("S3.47", Object.values(s347).every(Boolean), "ผู้จัดการ A: แถวขายที่ B = PERMISSION_DENIED (ยังเก็บถาวร) · แถวขายที่ A ได้ · ร้านอื่น NOT_FOUND · ไม่มีจริง NOT_FOUND",
      `${flags(s347)} · B ${codeOf(mgr47.y)} · A ${codeOf(mgr47.x)} · ร้านอื่น ${codeOf(other47)} · ไม่มีจริง ${codeOf(ghost47)}${ey5.ok && ex5.ok ? "" : ` · ensure ${ey5.err ?? ""} ${ex5.err ?? ""}`}`);

    // S3.48 F1 ensureForInvItem {id, created, archived} · ไม่ปลดเก็บถาวรเอง
    const inv48 = await mkInv(cfT, sysC.INVENTORY, "r5-ensure-arch");
    const e48a = await attempt(() => F.ensureForInvItem(ctxSys(cfT, sysC.POS), inv48.id));
    const id48 = idOf(e48a.value) as string;
    const a48 = await attempt(() => F.archive(ctxOwner, id48));
    const at48 = (await prodById(id48))?.archivedAt;
    const e48b = await attempt(() => F.ensureForInvItem(ctxSys(cfT, sysC.POS), inv48.id));
    const row48 = await prodById(id48);
    const s348 = {
      liveFlag: e48a.ok && e48a.value?.created === true && e48a.value?.archived === false,
      archivedFlag: a48.ok && e48b.ok && idOf(e48b.value) === id48 && e48b.value?.created === false && e48b.value?.archived === true,
      notUnarchived: !!at48 && !!row48?.archivedAt && isoS(row48.archivedAt) === isoS(at48),
    };
    chk("S3.48", Object.values(s348).every(Boolean), "แถวปกติ {created:true, archived:false} · แถวเก็บถาวร {id เดิม, created:false, archived:true} · ยังเก็บถาวร",
      `${flags(s348)} · ครั้งแรก ${e48a.ok ? JSON.stringify(e48a.value) : e48a.err} · หลังเก็บ ${e48b.ok ? JSON.stringify(e48b.value) : e48b.err}`);

    // S3.49 F1 createProduct({invItemId}) ทับแถวเก็บถาวร = CONFLICT ที่บอกว่าเก็บถาวร (ไม่รั่ว id)
    const pc49 = await countProducts(cfT);
    const c49 = await attemptX(() => F.createProduct(ctxOwner, { name: `${TAG} r5-over-archived`, invItemId: inv48.id, basePriceSatang: 100 }));
    const msg49 = String((c49.e as Any)?.message ?? "");
    const s349 = { conflict: refused(c49, "CONFLICT"), saysArchived: /เก็บถาวร/.test(msg49), noIdLeak: !!id48 && !msg49.includes(id48), noRow: (await countProducts(cfT)) === pc49 };
    chk("S3.49", Object.values(s349).every(Boolean), "CONFLICT · ข้อความมี \"เก็บถาวร\" (คืนได้) · ไม่มี id · ไม่มีแถวเพิ่ม", `${flags(s349)} · ${codeOf(c49)}: ${msg49.slice(0, 120) || "-"}`);

    // S3.50 F1 setPrice/updateProduct บนแถวเก็บถาวรได้ → restore แล้วแถวพกค่าล่าสุด
    const sp50 = await attempt(() => F.setPrice(ctxOwner, id48, 7777));
    const up50 = await attempt(() => F.updateProduct(ctxOwner, id48, { nameEn: `${TAG} r5-arch-en` }));
    const mid50 = await prodById(id48);
    const rs50 = await attempt(() => restore(ctxOwner, id48));
    const row50 = await prodById(id48);
    const view50 = await inListAt(ctxOwner, SILOM, id48, inv48.sku);
    const s350 = {
      setPriceArchived: sp50.ok && mid50?.basePriceSatang === 7777 && !!mid50?.archivedAt,
      updateArchived: up50.ok && mid50?.nameEn === `${TAG} r5-arch-en`,
      restoredCarries: rs50.ok && row50?.archivedAt === null && row50?.basePriceSatang === 7777 && row50?.nameEn === `${TAG} r5-arch-en`,
      listed: view50?.basePriceSatang === 7777,
    };
    chk("S3.50", Object.values(s350).every(Boolean), "setPrice 7777 + updateProduct บนแถวเก็บถาวรได้ · restore แล้ว 7777 + nameEn ใหม่ · list เห็น 7777",
      `${flags(s350)} · setPrice ${codeOf(sp50)} · update ${codeOf(up50)} · restore ${codeOf(rs50)} · list ${view50 ? view50.basePriceSatang : "ไม่พบ"}`);

    // S3.51 F1 restore ที่บาร์โค้ดชนแถวที่ขายอยู่ = CONFLICT (ไม่ใช่ P2002 ดิบ) · แถวยังเก็บถาวร
    const bc51 = `94${RAND}51`;
    const a51 = await attempt(() => F.createProduct(ctxOwner, { name: `${TAG} r5-bc-a`, barcode: bc51, unitId: SILOM, basePriceSatang: 100 }));
    const id51 = idOf(a51.value) as string;
    const ar51 = await attempt(() => F.archive(ctxOwner, id51));
    const b51 = await attempt(() => F.createProduct(ctxOwner, { name: `${TAG} r5-bc-b`, barcode: bc51, unitId: SILOM, basePriceSatang: 100 }));
    const rs51 = await attemptX(() => restore(ctxOwner, id51));
    const row51 = await prodById(id51);
    const s351 = { setup: a51.ok && ar51.ok && b51.ok, conflict: refused(rs51, "CONFLICT") && (!CE || rs51.e instanceof CE), stillArchived: !!row51?.archivedAt };
    chk("S3.51", Object.values(s351).every(Boolean), "แถว A เก็บ → แถว B ใช้บาร์โค้ดเดียวกัน → restore A = CONFLICT (CatalogError) · A ยังเก็บถาวร",
      `${flags(s351)} · restore ${codeOf(rs51)}${b51.ok ? "" : ` · สร้าง B ${b51.err}`}`);

    // S3.52 F2 ตัวเขียน: NUL / surrogate เดี่ยว = VALIDATION ไม่มีแถว
    const NUL = "\u0000"; const LONE = "\uD800";
    const BAD: [string, string][] = [["NUL", NUL], ["surrogate", LONE]];
    const tgt52 = await attempt(() => F.createProduct(ctxOwner, { name: `${TAG} r5-f2-target`, unitId: SILOM, basePriceSatang: 100 }));
    const id52 = idOf(tgt52.value) as string;
    const h52 = hashOf(await prodById(id52));
    const pc52 = await countProducts(cfT); const cat52 = (await rowsOf("PosCategory", [cfT])).length;
    const w52: [string, TryX][] = [];
    for (const [lb, ch] of BAD) {
      w52.push([`create.name ${lb}`, await attemptX(() => F.createProduct(ctxOwner, { name: `${TAG} r5 a${ch}b`, basePriceSatang: 100 }))]);
      w52.push([`create.nameEn ${lb}`, await attemptX(() => F.createProduct(ctxOwner, { name: `${TAG} r5-en-${lb}`, nameEn: `x${ch}y`, basePriceSatang: 100 }))]);
      w52.push([`create.sku ${lb}`, await attemptX(() => F.createProduct(ctxOwner, { name: `${TAG} r5-sku-${lb}`, sku: `s${ch}k`, basePriceSatang: 100 }))]);
      w52.push([`create.barcode ${lb}`, await attemptX(() => F.createProduct(ctxOwner, { name: `${TAG} r5-bc-${lb}`, barcode: `88${ch}01`, unitId: SILOM, basePriceSatang: 100 }))]);
      w52.push([`update.name ${lb}`, await attemptX(() => F.updateProduct(ctxOwner, id52, { name: `n${ch}m` }))]);
      w52.push([`update.nameEn ${lb}`, await attemptX(() => F.updateProduct(ctxOwner, id52, { nameEn: `n${ch}m` }))]);
      w52.push([`category.name ${lb}`, await attemptX(() => F.createCategory(ctxOwner, { name: `${TAG} c${ch}t`, unitId: SILOM }))]);
      w52.push([`category.nameEn ${lb}`, await attemptX(() => F.createCategory(ctxOwner, { name: `${TAG} r5-cat-${lb}`, nameEn: `c${ch}t`, unitId: SILOM }))]);
    }
    const w52bad = w52.filter(([, r]) => !refused(r, "VALIDATION")).map(([l, r]) => `${l}→${codeOf(r)}`);
    const pc52b = await countProducts(cfT); const cat52b = (await rowsOf("PosCategory", [cfT])).length; const same52 = hashOf(await prodById(id52)) === h52;
    chk("S3.52", tgt52.ok && w52bad.length === 0 && pc52b === pc52 && cat52b === cat52 && same52, `VALIDATION ×${w52.length} · PosProduct/PosCategory +0 · แถวเป้าไม่เปลี่ยน`,
      `ผิด ${w52bad.length}/${w52.length}: ${w52bad.slice(0, 6).join(" · ") || "-"} · PosProduct +${pc52b - pc52} · PosCategory +${cat52b - cat52} · แถวเป้า ${same52 ? "เดิม" : "เปลี่ยน!"}`);

    // S3.53 F2 ตัวอ่าน: q/cursor = VALIDATION · byBarcode = {items: []}
    const cur53 = (n: string) => Buffer.from(JSON.stringify({ n, i: "x" })).toString("base64url");
    const r53: [string, TryX, "V" | "E"][] = [];
    for (const [lb, ch] of BAD) {
      r53.push([`q ${lb}`, await attemptX(() => F.listForUnit(ctxOwner, SILOM, { q: `a${ch}b` })), "V"]);
      r53.push([`cursor ${lb}`, await attemptX(() => F.listForUnit(ctxOwner, SILOM, { cursor: cur53(`a${ch}b`) })), "V"]);
      r53.push([`byBarcode ${lb}`, await attemptX(() => F.byBarcode(ctxOwner, SILOM, `88${ch}50`)), "E"]);
    }
    r53.push(["cursor ดิบมี NUL", await attemptX(() => F.listForUnit(ctxOwner, SILOM, { cursor: `eyJu${NUL}` })), "V"]);
    const r53bad = r53.filter(([, r, k]) => (k === "V" ? !refused(r, "VALIDATION") : !(r.ok && Array.isArray(r.value?.items) && r.value.items.length === 0)))
      .map(([l, r]) => `${l}→${r.ok ? `รับ ${JSON.stringify(r.value?.items?.length ?? r.value).slice(0, 20)}` : codeOf(r)}`);
    chk("S3.53", r53bad.length === 0, "q/cursor (NUL · surrogate · cursor ดิบ) = VALIDATION ×5 · byBarcode NUL/surrogate = {items: []} ×2", `ผิด ${r53bad.length}/${r53.length}: ${r53bad.join(" · ") || "-"}`);

    // S3.54 F2 ไม่มี error ดิบหลุด facade: code ∈ ชุดรับรอง · ไม่มี path · CatalogError · error ไม่คาดคิด = INTERNAL (ต้นฉบับใน cause)
    const ext54: [string, TryX][] = [
      ["setPrice id NUL", await attemptX(() => F.setPrice(ctxOwner, `x${NUL}`, 100))],
      ["archive id NUL", await attemptX(() => F.archive(ctxOwner, `x${NUL}`))],
      ["updateProduct id NUL", await attemptX(() => F.updateProduct(ctxOwner, `x${NUL}`, { nameEn: "a" }))],
      ["restore id NUL", await attemptX(() => restore(ctxOwner, `x${NUL}`))],
      ["ensureForInvItem id NUL", await attemptX(() => F.ensureForInvItem(ctxSys(cfT, sysC.POS), `x${NUL}`))],
      ["createProduct unitId NUL", await attemptX(() => F.createProduct(ctxOwner, { name: `${TAG} r5-u-nul`, unitId: `u${NUL}`, basePriceSatang: 100 }))],
      ["createProduct categoryId NUL", await attemptX(() => F.createProduct(ctxOwner, { name: `${TAG} r5-c-nul`, categoryId: `c${NUL}`, basePriceSatang: 100 }))],
      ["createProduct invItemId NUL", await attemptX(() => F.createProduct(ctxOwner, { name: `${TAG} r5-i-nul`, invItemId: `i${NUL}`, basePriceSatang: 100 }))],
      ["listForUnit unitId NUL", await attemptX(() => F.listForUnit(ctxOwner, `u${NUL}`))],
      ["byBarcode unitId NUL", await attemptX(() => F.byBarcode(ctxOwner, `u${NUL}`, "8850999000015"))],
      ["ctx.systemId NUL", await attemptX(() => F.listForUnit({ ...ctxOwner, systemId: `s${NUL}` }, SILOM))],
      ["ctx.actorUserId NUL", await attemptX(() => F.listForUnit({ ...ctxOwner, actorUserId: `a${NUL}` }, SILOM))],
      ["ctx.tenantId NUL", await attemptX(() => F.setPrice({ ...ctxOwner, tenantId: `t${NUL}` }, id52, 1))],
      ["setPrice id surrogate", await attemptX(() => F.setPrice(ctxOwner, `x${LONE}`, 100))],
    ];
    const hyg = (r: TryX): string | null => {
      if (r.ok || !r.threw) return null;
      const e: Any = r.e; const msg = String(e?.message ?? e ?? ""); const out: string[] = [];
      if (typeof e?.code !== "string" || !RATIFIED_CODES.has(e.code)) out.push(`code ${String(e?.code ?? "ไม่มี")}`);
      if (PATH_RE.test(msg)) out.push("มี path");
      if (CE && !(e instanceof CE)) out.push(`ไม่ใช่ CatalogError (${e?.constructor?.name ?? typeof e})`);
      return out.length ? out.join("+") : null;
    };
    const all54: [string, TryX][] = [...w52, ...r53.map(([l, r]) => [l, r] as [string, TryX]), ...ext54];
    const thrown54 = all54.filter(([, r]) => !r.ok && r.threw).length;
    const dirty54 = all54.map(([l, r]) => [l, hyg(r)] as const).filter(([, h]) => h !== null).map(([l, h]) => `${l}: ${h}`);
    const boom = new Error("boom P2010 at /root/projects/x/src/lib/modules/pos/catalog.ts:1:1");
    const fake: Any = { appSystem: { findFirst: async () => { throw boom; } } };
    const i1 = await attemptX(() => F.listForUnit(ctxOwner, SILOM, {}, fake));
    const i2 = await attemptX(() => F.setPrice(ctxOwner, id52, 100, fake));
    const internalOk = (r: TryX) => {
      const e: Any = r.e; const msg = String(e?.message ?? "");
      return refused(r, "INTERNAL") && !PATH_RE.test(msg) && !/boom|P2010/.test(msg) && /[฀-๿]/.test(msg) && (e?.cause === boom || String(e?.cause?.message ?? "").includes("boom"));
    };
    const fixedMsg = String((i1.e as Any)?.message ?? "1") === String((i2.e as Any)?.message ?? "2");
    chk("S3.54", thrown54 >= 10 && dirty54.length === 0 && internalOk(i1) && internalOk(i2) && fixedMsg,
      "ทุก error ที่ throw = CatalogError · code ∈ {NOT_FOUND, PERMISSION_DENIED, VALIDATION, CONFLICT, BUSY, INTERNAL} · ไม่มี path · client พัง = INTERNAL ข้อความไทยเดียวกัน (cause = ต้นฉบับ)",
      `throw ${thrown54}/${all54.length} · ไม่สะอาด ${dirty54.length}: ${dirty54.slice(0, 5).join(" · ") || "-"} · client พัง: list ${codeOf(i1)} ${internalOk(i1) ? "✓" : "✗"} · setPrice ${codeOf(i2)} ${internalOk(i2) ? "✓" : "✗"} · ข้อความคงที่ ${fixedMsg}`);

    // S3.55 F3 ล็อกร้านถูกถืออีก connection 8 วิ ⇒ ผู้เขียนที่ต้องใช้ล็อก = BUSY < 7 วิ ไม่เขียน · ปล่อยแล้วสำเร็จ
    //   คีย์ = ที่ catalog.ts ใช้วันนี้: lockTenant(tx, `pos-catalog:${tenantId}`) → `SELECT pg_advisory_xact_lock(hashtext(${key}))` (catalog.ts:323-325)
    const key55 = `pos-catalog:${cfT}`;
    const bc55 = `93${RAND}55`;
    const invE55 = await mkInv(cfT, sysC.INVENTORY, "r5-busy-ensure"); const invC55 = await mkInv(cfT, sysC.INVENTORY, "r5-busy-create");
    const calls55: [string, () => Promise<Any>][] = [
      ["createProduct(บาร์โค้ด)", () => F.createProduct(ctxOwner, { name: `${TAG} r5-busy-bc`, barcode: bc55, unitId: SILOM, basePriceSatang: 100 })],
      ["createProduct(invItemId)", () => F.createProduct(ctxOwner, { name: `${TAG} r5-busy-inv`, invItemId: invC55.id, basePriceSatang: 100 })],
      ["ensureForInvItem", () => F.ensureForInvItem(ctxSys(cfT, sysC.POS), invE55.id)],
    ];
    let held55 = false; let heldAt55 = 0;
    const holder55 = lane(7).$transaction(async (tx: Any) => {
      await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(hashtext($1))`, key55);
      held55 = true; heldAt55 = Date.now();
      await new Promise((r) => setTimeout(r, 8000));
    }, { timeout: 60_000, maxWait: 30_000 }).then(() => "ok").catch((e: unknown) => firstLine(e));
    for (let i = 0; i < 400 && !held55; i++) await new Promise((r) => setTimeout(r, 25));
    const during55 = await Promise.all(calls55.map(([, f]) => attemptX(f)));
    const sinceHeld55 = Date.now() - heldAt55;
    const wrote55 = (await q(`select id from "PosProduct" where "tenantId" = $1 and barcode = $2`, cfT, bc55)).length + (await prodByInv(invC55.id)).length + (await prodByInv(invE55.id)).length;
    const holderRes55 = await holder55;
    const after55: TryX[] = [];
    for (const [, f] of calls55) after55.push(await attemptX(f));
    const s355 = {
      held: held55 && holderRes55 === "ok",
      busy: during55.every((r) => refused(r, "BUSY")),
      under7s: during55.every((r) => r.ms < 7000),
      thaiMessage: during55.every((r) => /[฀-๿]/.test(String((r.e as Any)?.message ?? ""))),
      nothingWritten: wrote55 === 0,
      okAfterRelease: after55.every((r) => r.ok),
    };
    chk("S3.55", Object.values(s355).every(Boolean), "ถือล็อก 8 วิ: BUSY ×3 ภายใน < 7 วิ (ข้อความไทย) · ไม่มีแถว · ปล่อยแล้วสำเร็จ ×3",
      `${flags(s355)} · ระหว่างถือ: ${calls55.map(([l], k) => `${l} ${codeOf(during55[k])} ${(during55[k].ms / 1000).toFixed(1)}s`).join(" · ")} (กลับมาหลังได้ล็อก ${(sinceHeld55 / 1000).toFixed(1)}s) · แถวที่เขียน ${wrote55} · หลังปล่อย ${after55.map(codeOf).join("/")}${holderRes55 === "ok" ? "" : ` · holder ${holderRes55}`}`);

    // S3.57 F6 checkCatalogWrite ตรวจ invItemId ทุกผู้กระทำ (รวมเจ้าของ)
    const ccw5 = F.checkCatalogWrite;
    const ownerM5 = { role: cfOwner.role, unitAccess: cfOwner.unitAccess, permissions: cfOwner.permissions };
    const v57 = async (unitId: string | null, invItemId: string) => {
      if (typeof ccw5 !== "function") return "ไม่มี facade.catalog.checkCatalogWrite";
      try { return String(await ccw5(ownerM5, { tenantId: cfT, systemId: sysC.POS }, { unitId, invItemId }, (C.PERM_MANAGE as string | undefined) ?? "pos.product.manage")); } catch (e) { return `throw ${firstLine(e).slice(0, 60)}`; }
    };
    const nf57: [string, string][] = [
      ["ร้านอื่น@ทุกสาขา", await v57(null, xInv.id)], ["คลังของ POS อื่น@ทุกสาขา", await v57(null, fx.itX.id)], ["ไม่มีจริง@ทุกสาขา", await v57(null, `${TAG}-ghost-inv`)],
      ["ร้านอื่น@สีลม", await v57(SILOM, xInv.id)], ["คลังของ POS อื่น@สีลม", await v57(SILOM, fx.itX.id)], ["ไม่มีจริง@สีลม", await v57(SILOM, `${TAG}-ghost-inv`)],
    ];
    const ok57: [string, string][] = [["น้ำดื่ม@ทุกสาขา", await v57(null, fx.water.id)], ["น้ำดื่ม@สีลม", await v57(SILOM, fx.water.id)]];
    chk("S3.57", nf57.every(([, v]) => v === "NOT_FOUND") && ok57.every(([, v]) => v === "OK"), "NOT_FOUND ×6 (เจ้าของ) · InvItem คลัง POS นี้ OK ×2",
      `${nf57.map(([k, v]) => `${k}:${v}`).join(" ")} · ${ok57.map(([k, v]) => `${k}:${v}`).join(" ")}`);

    // S3.58 F6 Object.hasOwn · คีย์แปลกของตัวเอง · null/array
    const p58 = await attempt(() => F.createProduct(ctxOwner, { name: `${TAG} r5-own-keys`, unitId: SILOM, basePriceSatang: 100 }));
    const id58 = idOf(p58.value) as string;
    const inh58 = await attemptX(() => F.updateProduct(ctxOwner, id58, Object.create({ unitId: null })));
    const unit58 = (await prodById(id58))?.unitId;
    const pc58 = await countProducts(cfT);
    const inhC58 = await attemptX(() => F.createProduct(ctxOwner, Object.assign(Object.create({ unitId: ARI }), { name: `${TAG} r5-inh-create`, basePriceSatang: 100 })));
    const inhRow58 = idOf(inhC58.value) ? await prodById(idOf(inhC58.value)) : null;
    const pc58b = await countProducts(cfT);
    const unkC58 = await attemptX(() => F.createProduct(ctxOwner, { name: `${TAG} r5-unknown-key`, basePriceSatang: 100, bogus: 1 }));
    const unkU58 = await attemptX(() => F.updateProduct(ctxOwner, id58, { bogus: 1 }));
    const np58: [string, TryX][] = [
      ["update null", await attemptX(() => F.updateProduct(ctxOwner, id58, null))], ["update []", await attemptX(() => F.updateProduct(ctxOwner, id58, []))],
      ["create null", await attemptX(() => F.createProduct(ctxOwner, null))], ["create []", await attemptX(() => F.createProduct(ctxOwner, []))],
    ];
    const pc58c = await countProducts(cfT);
    const s358 = {
      setup: p58.ok,
      inheritedPatchNoMove: (inh58.ok || refused(inh58, "VALIDATION")) && unit58 === SILOM,
      inheritedCreateNotAtBranch: (inhC58.ok && inhRow58?.unitId === null) || (refused(inhC58, "VALIDATION") && pc58b === pc58),
      unknownKeyCreate: refused(unkC58, "VALIDATION"),
      unknownKeyUpdate: refused(unkU58, "VALIDATION"),
      nullOrArray: np58.every(([, r]) => refused(r, "VALIDATION")),
      noStrayRows: pc58c === pc58b,
    };
    chk("S3.58", Object.values(s358).every(Boolean), "unitId จาก prototype ไม่ย้าย/ไม่ลงสาขา · คีย์แปลก VALIDATION (create + update) · null/[] VALIDATION ×4 · ไม่มีแถวเกิน",
      `${flags(s358)} · patch prototype ${codeOf(inh58)} → unit ${unit58 === SILOM ? "สีลม" : String(unit58)} · create prototype ${codeOf(inhC58)} → unit ${inhRow58 ? String(inhRow58.unitId) : "-"} · คีย์แปลก ${codeOf(unkC58)}/${codeOf(unkU58)} · ${np58.map(([l, r]) => `${l}:${codeOf(r)}`).join(" ")}`);

    // S3.59 F5 fitness F15.6 ลงทะเบียน (static)
    const fitSrc = read("scripts/fitness-pos.mts");
    const f156 = /(guarded\(\s*chk\s*,|\bchk\()\s*["']F15\.6["']/.test(fitSrc);
    chk("S3.59", f156, "scripts/fitness-pos.mts มี chk/guarded(\"F15.6\")", f156 ? "ลงทะเบียนแล้ว" : "ไม่พบ F15.6");
    }
  });

  // ═══ S2 · P1.1b sync สองทาง (guard แยก) — รอบ oracle P1.1b (brief pos-brief-P1.1b.md G1–G13 + addendum 1 ต.ค.) ═══
  //   ลำดับ: static (ไม่แตะ DB) → prelude (แถว "ข้อมูลเดิม" สร้างตรง + backfill รอบเดียว = มีลิงก์บนฐานแล้ว) → ทีละกลุ่ม (section ต่อกลุ่ม ·
  //   ทุกการเรียกประตูผ่าน attempt ⇒ ไม่มี throw หลุดทำให้ข้ออื่นแดงผิดเหตุ) → G13 ผู้อ่าน → G3 แฝด (backfill รอบสอง) ปิดท้าย
  //   🔴 PART-B (S2.11b · S2.19) ข้ามด้วย guard ของตัวเอง — พิมพ์เหตุ + JSON_SUMMARY.skippedChecks
  const s2Ids = [...S2_IDS].map((id) => id.replace("P1.1-", ""));
  if (!p11bStarted && !FORCE) {
    s2Skipped = `P1.1b ยังไม่เริ่ม (ผู้เขียนเดิม ${LEGACY_WRITERS.length} ไฟล์ยังไม่ import pos/catalog หรือ pos/catalog-legacy) — ข้าม ${s2Ids.length} ข้อ (PART-B ${PART_B.size} ข้อในนั้น)`;
    console.log(`  ⏭️  ${s2Skipped}`);
  } else {
    if (!partBStarted) {
      for (const id of PART_B) {
        skippedChecks[id] = PART_B_WHY;
        console.log(`  ⏭️  [${id}] ข้าม (PART-B) — ${PART_B_WHY}`);
      }
    }
    const runPartB = partBStarted;
    const C: Any = catalog;
    const inventory = await load("@/lib/modules/inventory/service");
    const accountF = await load("@/lib/modules/account");
    const accProduct = await load("@/lib/modules/account/product");
    const invLink = await load("@/lib/modules/account/inventory-link");
    const proposals = await load("@/lib/ai/proposals");
    const booking = await load("@/lib/modules/booking/service");
    const order = await load("@/lib/modules/restaurant/order");
    const fit = await load("./fitness-pos.mts");
    const flags2 = (o: Record<string, boolean>) => Object.entries(o).map(([k, v]) => `${k}${v ? "✓" : "✗"}`).join(" ");
    const CAT_FILE = "src/lib/modules/pos/catalog.ts";
    const LEGACY_FILE = "src/lib/modules/pos/catalog-legacy.ts";
    const legacyExists = existsSync(LEGACY_FILE);
    const tsMod: Any = await import("typescript" as string);
    const ts: Any = tsMod.default ?? tsMod;
    const parseTs = (file: string, text = read(file)): Any => ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const walkFiles = (dir: string, re: RegExp, out: string[] = []): string[] => {
      if (!existsSync(dir)) return out;
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        if (e.name === "node_modules" || e.name.startsWith(".")) continue;
        const p = `${dir}/${e.name}`;
        if (e.isDirectory()) walkFiles(p, re, out);
        else if (re.test(p)) out.push(p);
      }
      return out;
    };
    /** ตัวระบุโมดูลทุกแบบในไฟล์: import/export from · import x = require · import() · require() */
    const specsOf = (sf: Any): string[] => {
      const out: string[] = [];
      const v = (n: Any) => {
        if ((ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) && n.moduleSpecifier && ts.isStringLiteralLike(n.moduleSpecifier)) out.push(n.moduleSpecifier.text);
        else if (ts.isImportEqualsDeclaration(n) && ts.isExternalModuleReference(n.moduleReference) && ts.isStringLiteralLike(n.moduleReference.expression)) out.push(n.moduleReference.expression.text);
        else if (ts.isCallExpression(n) && (n.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(n.expression) && n.expression.text === "require")) && n.arguments[0] && ts.isStringLiteralLike(n.arguments[0])) out.push(n.arguments[0].text);
        ts.forEachChild(n, v);
      };
      v(sf);
      return out;
    };
    const isLegacySpec = (s: string) => /(^|\/)catalog-legacy(\.ts)?$/.test(s);
    const importsLegacy = (f: string) => existsSync(f) && specsOf(parseTs(f)).some(isLegacySpec);
    /** ชื่อที่ import จากโมดูลที่ตรง `isTarget` (named + namespace/default) */
    const bindingsFrom = (sf: Any, isTarget: (s: string) => boolean) => {
      const names = new Set<string>(); const ns = new Set<string>();
      for (const st of sf.statements) {
        if (!ts.isImportDeclaration(st) || !ts.isStringLiteralLike(st.moduleSpecifier) || !isTarget(st.moduleSpecifier.text) || !st.importClause) continue;
        const cl = st.importClause;
        if (cl.name) ns.add(cl.name.text);
        const nb = cl.namedBindings;
        if (nb && ts.isNamespaceImport(nb)) ns.add(nb.name.text);
        else if (nb && ts.isNamedImports(nb)) for (const e of nb.elements) names.add(e.name.text);
      }
      return { names, ns };
    };
    const callsInto = (node: Any, b: { names: Set<string>; ns: Set<string> }): boolean => {
      let hit = false;
      const v = (n: Any) => {
        if (hit) return;
        if (ts.isCallExpression(n)) {
          const e = n.expression;
          if (ts.isIdentifier(e) && b.names.has(e.text)) hit = true;
          else if (ts.isPropertyAccessExpression(e) && ts.isIdentifier(e.expression) && b.ns.has(e.expression.text)) hit = true;
        }
        ts.forEachChild(n, v);
      };
      v(node);
      return hit;
    };
    /** catch นี้ออกจากทางเดิน (throw หรือ return) — ไม่นับในฟังก์ชันซ้อน */
    const catchExits = (block: Any): boolean => {
      let ok = false;
      const v = (n: Any) => {
        if (ok || ts.isFunctionLike(n)) return;
        if (ts.isThrowStatement(n) || ts.isReturnStatement(n)) { ok = true; return; }
        ts.forEachChild(n, v);
      };
      ts.forEachChild(block, v);
      return ok;
    };
    /** catch นี้คืน "ข้อมูล" (return ที่มีค่า) หรือ redirect — ไม่นับในฟังก์ชันซ้อน */
    const catchReturnsData = (block: Any): boolean => {
      let ok = false;
      const v = (n: Any) => {
        if (ok || ts.isFunctionLike(n)) return;
        if (ts.isReturnStatement(n) && n.expression) { ok = true; return; }
        if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === "redirect") { ok = true; return; }
        ts.forEachChild(n, v);
      };
      ts.forEachChild(block, v);
      return ok;
    };
    const lineOf = (sf: Any, n: Any) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;

    // ─────────────── STATIC (ไม่แตะ DB) ───────────────
    await section("s2-static-f151", ["S2.19a", ...(runPartB ? ["S2.19"] : [])], async () => {
      const writers = typeof fit?.scanCatalogWriters === "function" ? (fit.scanCatalogWriters(process.cwd()) as { file: string; hits: { kind: string }[] }[]) : null;
      const base = (fit?.CATALOG_WRITER_BASELINE ?? null) as Record<string, Record<string, number>> | null;
      // ชุดผู้เขียน = ค่าของ export CATALOG_WRITER / CATALOG_WRITERS (สตริง · อาร์เรย์ · Set)
      const allowed = new Set<string>();
      for (const k of ["CATALOG_WRITER", "CATALOG_WRITERS"]) {
        const v = fit?.[k];
        if (typeof v === "string") allowed.add(v);
        else if (Array.isArray(v) || v instanceof Set) for (const x of v as Iterable<unknown>) if (typeof x === "string") allowed.add(x);
      }
      const outside: Record<string, Record<string, number>> = {};
      for (const w of writers ?? []) {
        if (allowed.has(w.file)) continue;
        const c: Record<string, number> = {};
        for (const h of w.hits) c[h.kind] = (c[h.kind] ?? 0) + 1;
        outside[w.file] = c;
      }
      const wantSet = [CAT_FILE, LEGACY_FILE].sort().join(",");
      const setOk = [...allowed].sort().join(",") === wantSet;
      const A_BASE = { "src/lib/modules/account/service.ts": { "AccountProduct.price": 2 } };
      const baseA = !!base && hashOf(base) === hashOf(A_BASE);
      const scanA = !!writers && hashOf(outside) === hashOf(A_BASE);
      const show = (o: unknown) => JSON.stringify(o ?? null).slice(0, 260);
      chk("S2.19a", baseA && scanA && setOk, `baseline ${JSON.stringify(A_BASE)} · ชุดผู้เขียน ${wantSet} · ตัวสแกนนอกชุด = baseline`,
        `baseline ${baseA ? "✓" : `✗ ${Object.keys(base ?? {}).length} ไฟล์ ${show(base)}`} · ชุดผู้เขียน ${setOk ? "✓" : `✗ ${[...allowed].join(",") || "-"}`} · นอกชุด ${scanA ? "✓" : `✗ ${show(outside)}`}`);
      if (runPartB) {
        const emptyB = !!base && Object.keys(base).length === 0;
        const scanB = !!writers && Object.keys(outside).length === 0;
        chk("S2.19", emptyB && scanB && setOk, "baseline ว่าง · ผู้เขียน = catalog.ts + catalog-legacy.ts", `baseline ${show(base)} · นอกชุด ${show(outside)} · ชุดผู้เขียน ${[...allowed].join(",")}`);
      }
    });

    await section("s2-static-g4", ["S2.29", "S2.30", "S2.32", "S2.33", "S2.41", "S2.44", "S2.45"], async () => {
      // S2.30 G4a กักเขต
      const allowMap = fit?.SYSTEM_MARKER_ALLOWLIST;
      const reason = allowMap instanceof Map ? allowMap.get(LEGACY_FILE) : undefined;
      const markerFiles = walkFiles("src", /\.(ts|tsx|mts)$/).filter((f) => {
        const t = read(f);
        if (!t.includes("CATALOG_SYSTEM_ACTOR")) return false;
        let hit = false;
        const v = (n: Any) => {
          if (hit) return;
          if ((ts.isIdentifier(n) || ts.isStringLiteralLike(n)) && n.text === "CATALOG_SYSTEM_ACTOR") hit = true;
          ts.forEachChild(n, v);
        };
        v(parseTs(f, t));
        return hit;
      });
      const outsideMarker = markerFiles.filter((f) => f !== CAT_FILE && f !== LEGACY_FILE);
      const REQ_IMPORTERS = ["src/lib/modules/restaurant/menu.ts", "src/lib/modules/restaurant/order.ts", "src/lib/modules/shop/service.ts", "src/lib/modules/inventory/service.ts", "src/lib/modules/account/product.ts"];
      const noImport = REQ_IMPORTERS.filter((f) => !importsLegacy(f));
      const facadeLeak = specsOf(parseTs("src/lib/modules/pos/index.ts")).some(isLegacySpec);
      const s230 = { legacyFile: legacyExists, allowlisted: typeof reason === "string" && reason.trim().length > 0, markerOnlyTwo: outsideMarker.length === 0, doorsImport: noImport.length === 0, facadeClean: !facadeLeak };
      chk("S2.30", Object.values(s230).every(Boolean), "catalog-legacy.ts มี · อยู่ใน SYSTEM_MARKER_ALLOWLIST พร้อมเหตุผล · ตัวบ่งชี้เฉพาะ catalog.ts + catalog-legacy.ts · ผู้เขียนเดิม 5 ไฟล์ import · facade ไม่ส่งต่อ",
        `${flags2(s230)} · ตัวบ่งชี้นอกสองไฟล์: ${outsideMarker.join(",") || "-"} · ยังไม่ import: ${noImport.map((f) => f.replace("src/lib/modules/", "")).join(",") || "-"}`);

      // S2.32 G4a export รับ tx ของผู้เรียก
      const sfL = legacyExists ? parseTs(LEGACY_FILE) : null;
      const badExp: string[] = []; let nExp = 0;
      if (sfL) {
        const isExp = (n: Any) => !!(ts.canHaveModifiers(n) && ts.getModifiers(n)?.some((m: Any) => m.kind === ts.SyntaxKind.ExportKeyword));
        const fnsL: [string, Any][] = [];
        for (const st of sfL.statements) {
          if (ts.isFunctionDeclaration(st) && isExp(st) && st.name) fnsL.push([st.name.text, st]);
          else if (ts.isVariableStatement(st) && isExp(st))
            for (const d of st.declarationList.declarations) if (d.initializer && (ts.isArrowFunction(d.initializer) || ts.isFunctionExpression(d.initializer)) && ts.isIdentifier(d.name)) fnsL.push([d.name.text, d.initializer]);
        }
        nExp = fnsL.length;
        for (const [name, fn] of fnsL) {
          const ps = fn.parameters as Any[];
          const txP = ps.find((p) => p.type && /TransactionClient|Tx\b/.test(p.type.getText(sfL)));
          const wide = ps.find((p) => p.type && /PrismaClient\b|CatalogClient\b/.test(p.type.getText(sfL)));
          if (!txP) badExp.push(`${name}: ไม่มีพารามิเตอร์ tx`);
          else if (txP.initializer || txP.questionToken) badExp.push(`${name}: tx มีค่าปริยาย/ไม่บังคับ`);
          if (wide) badExp.push(`${name}: รับ ${wide.type.getText(sfL)}`);
        }
      }
      const rootDb = sfL ? specsOf(sfL).filter((s) => /(^|\/)(core\/db|pos\/db)$|^\.\/db$/.test(s)) : [];
      chk("S2.32", !!sfL && nExp > 0 && badExp.length === 0 && rootDb.length === 0, "ทุก export รับ tx (บังคับ · ไม่มีค่าปริยาย) · ไม่ import prisma ตัวหลัก",
        sfL ? `export ${nExp} ฟังก์ชัน · ${badExp.slice(0, 5).join(" · ") || "tx ครบ"} · import db: ${rootDb.join(",") || "-"}` : "ไม่มีไฟล์ catalog-legacy.ts");

      // S2.33 G4c ไม่ปิงปอง
      const DOOR_RE = /(^|\/)(restaurant\/(menu|order)|shop\/service|inventory\/service|modules\/inventory|account\/(product|inventory-link|service)|modules\/account|booking\/service|pos\/register|ai\/proposals)(\.ts)?$/;
      const catFiles = walkFiles("src/lib/modules/pos", /\/catalog[^/]*\.ts$/);
      const pp: string[] = [];
      for (const f of catFiles) for (const s of specsOf(parseTs(f))) {
        const norm2 = s.replace(/^@\/lib\/modules\//, "").replace(/^(\.\.\/)+/, "").replace(/^\.\//, "pos/");
        if (DOOR_RE.test(norm2) || DOOR_RE.test(s)) pp.push(`${f.replace("src/lib/modules/", "")} → ${s}`);
      }
      chk("S2.33", legacyExists && pp.length === 0, "catalog-legacy.ts มี · pos/catalog*.ts ไม่ import ประตูเดิม", `${legacyExists ? "" : "ไม่มี catalog-legacy.ts · "}${pp.join(" · ") || "ไม่ import ประตูเดิม"}`);

      // S2.29 G3 ตัวแปลงเดียว (call graph ภายใน pos/catalog*.ts)
      const fnCalls = new Map<string, Set<string>>();
      for (const f of catFiles) {
        const sf = parseTs(f);
        const addFn = (name: string, body: Any) => {
          const calls = fnCalls.get(name) ?? new Set<string>();
          const v = (n: Any) => {
            if (ts.isCallExpression(n)) {
              const e = n.expression;
              if (ts.isIdentifier(e)) calls.add(e.text);
              else if (ts.isPropertyAccessExpression(e)) calls.add(e.name.text);
            }
            ts.forEachChild(n, v);
          };
          if (body) v(body);
          fnCalls.set(name, calls);
        };
        const visit = (n: Any) => {
          if (ts.isFunctionDeclaration(n) && n.name) addFn(n.name.text, n.body);
          else if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer && (ts.isArrowFunction(n.initializer) || ts.isFunctionExpression(n.initializer))) addFn(n.name.text, n.initializer.body);
          ts.forEachChild(n, visit);
        };
        visit(sf);
      }
      const reach = (start: string): Set<string> => {
        const seen = new Set<string>([start]); const st = [start];
        while (st.length) { const x = st.pop() as string; for (const y of fnCalls.get(x) ?? []) if (fnCalls.has(y) && !seen.has(y)) { seen.add(y); st.push(y); } }
        return seen;
      };
      const bfReach = reach("backfillCatalog");
      const legacyCalls = new Set<string>();
      if (sfL) { const v = (n: Any) => { if (ts.isCallExpression(n)) { const e = n.expression; if (ts.isIdentifier(e)) legacyCalls.add(e.text); else if (ts.isPropertyAccessExpression(e)) legacyCalls.add(e.name.text); } ts.forEachChild(n, v); }; v(sfL); }
      const shared = [...legacyCalls].filter((n) => n !== "initialPrice" && n !== "initialPriceSatang" && bfReach.has(n) && reach(n).has("initialPrice"));
      chk("S2.29", legacyExists && bfReach.has("initialPrice") && shared.length > 0, "มีฟังก์ชันร่วม (backfill เรียกถึง ∩ catalog-legacy เรียก) ที่ไปถึง initialPrice",
        `${legacyExists ? "" : "ไม่มี catalog-legacy.ts · "}backfill ถึง initialPrice ${bfReach.has("initialPrice")} · ฟังก์ชันร่วม: ${shared.join(",") || "-"}`);

      // S2.41 G8 สต็อก/86 ย้ายเข้า catalog-legacy
      const writers = typeof fit?.scanCatalogWriters === "function" ? (fit.scanCatalogWriters(process.cwd()) as { file: string; hits: { kind: string; line: number }[] }[]) : [];
      const inRest = writers.filter((w) => w.file === "src/lib/modules/restaurant/order.ts" || w.file === "src/lib/modules/restaurant/menu.ts").map((w) => `${w.file.replace("src/lib/modules/", "")}×${w.hits.length}`);
      const orderImp = importsLegacy("src/lib/modules/restaurant/order.ts");
      chk("S2.41", legacyExists && orderImp && inRest.length === 0, "order.ts import catalog-legacy · ไม่มีจุดเขียนแคตตาล็อกใน restaurant/order.ts + menu.ts", `order.ts import ${orderImp} · จุดเขียนเหลือ: ${inRest.join(" ") || "-"}`);

      // S2.44 G11 ไม่จับแล้วไปต่อ
      const DOOR_FILES = ["src/lib/modules/restaurant/menu.ts", "src/lib/modules/restaurant/order.ts", "src/lib/modules/shop/service.ts", "src/lib/modules/inventory/service.ts", "src/lib/modules/account/product.ts", "src/lib/modules/account/inventory-link.ts", "src/lib/modules/booking/service.ts", "src/lib/modules/pos/register.ts"];
      const carry: string[] = []; let tries = 0;
      const scanTry = (f: string, isTarget: (s: string) => boolean) => {
        if (!existsSync(f)) return;
        const sf = parseTs(f); const b = bindingsFrom(sf, isTarget);
        if (!b.names.size && !b.ns.size) return;
        const v = (n: Any) => {
          if (ts.isTryStatement(n) && n.catchClause && callsInto(n.tryBlock, b)) {
            tries++;
            if (!catchExits(n.catchClause.block)) carry.push(`${f.replace("src/lib/modules/", "")}:${lineOf(sf, n.catchClause)}`);
          }
          ts.forEachChild(n, v);
        };
        v(sf);
      };
      for (const f of DOOR_FILES) scanTry(f, isLegacySpec);
      scanTry(LEGACY_FILE, (s) => /(^|\/)catalog(\.ts)?$/.test(s));
      const importers = DOOR_FILES.filter((f) => importsLegacy(f)).length;
      chk("S2.44", legacyExists && importers > 0 && carry.length === 0, "มีผู้เขียนเดิมที่ต่อ catalog-legacy · ทุก catch รอบการเรียก catalog-legacy/catalog ออกด้วย throw/return",
        `${legacyExists ? "" : "ไม่มี catalog-legacy.ts · "}ผู้เขียนเดิมที่ import ${importers}/${DOOR_FILES.length} · try ที่เกี่ยว ${tries} · จับแล้วไปต่อ: ${carry.join(",") || "-"}`);

      // S2.45 G11 server action คืนการปฏิเสธเป็นข้อมูล
      const ACTION_DOORS: [string, RegExp][] = [
        ["src/lib/modules/inventory/actions.ts", /^(createItem|updateItem|archiveItem)$/],
        ["src/lib/modules/shop/actions.ts", /^shop\.(createProduct|updateProduct)$/],
        ["src/lib/actions/restaurant.ts", /^menu\.(archiveItem|setItemStock)$/],
      ];
      const bare: string[] = []; let sites = 0;
      for (const [f, re] of ACTION_DOORS) {
        if (!existsSync(f)) { bare.push(`${f}: ไม่พบไฟล์`); continue; }
        const sf = parseTs(f);
        const v = (n: Any, guard: Any[]) => {
          if (ts.isFunctionLike(n) && guard.length) guard = [];
          if (ts.isCallExpression(n) && re.test(n.expression.getText(sf))) {
            sites++;
            if (!guard.some((cc) => catchReturnsData(cc.block))) bare.push(`${f.replace(/^src\/lib\//, "")}:${lineOf(sf, n)} ${n.expression.getText(sf)}`);
          }
          if (ts.isTryStatement(n) && n.catchClause) {
            v(n.tryBlock, [...guard, n.catchClause]);
            v(n.catchClause, guard);
            if (n.finallyBlock) v(n.finallyBlock, guard);
            return;
          }
          ts.forEachChild(n, (c: Any) => v(c, guard));
        };
        v(sf, []);
      }
      chk("S2.45", sites > 0 && bare.length === 0, "ทุกจุดเรียกประตูที่ไม่มีช่องปฏิเสธใน server action อยู่ใน try ที่ catch คืนค่า/redirect",
        `จุดเรียก ${sites} · ไม่มี try/catch คืนข้อมูล ${bare.length}: ${bare.slice(0, 6).join(" · ") || "-"}`);
    });

    // S2.31 + S2.46: fitness บน root ชั่วคราว (ไม่แตะต้นไม้จริง · ลบทิ้งใน finally)
    await section("s2-fitness-probe", ["S2.31", "S2.46"], async () => {
      const { mkdtempSync, mkdirSync, writeFileSync, rmSync, copyFileSync } = await import("node:fs");
      const { tmpdir } = await import("node:os");
      const { dirname } = await import("node:path");
      const root = mkdtempSync(`${tmpdir()}/qc-p11b-fit-`);
      try {
        const put = (rel: string, text: string) => { mkdirSync(dirname(`${root}/${rel}`), { recursive: true }); writeFileSync(`${root}/${rel}`, text); };
        mkdirSync(`${root}/src/lib/modules/pos`, { recursive: true });
        copyFileSync(CAT_FILE, `${root}/${CAT_FILE}`);
        put("src/lib/modules/pos/catalog-legacy.ts", `export async function qcProbeLegacy(tx: unknown): Promise<unknown> {\n  return tx;\n}\n`);
        const BAD = ["src/app/qcprobe/page.tsx", "src/lib/actions/qcprobe.ts", "src/lib/modules/qcprobe/actions.ts"];
        put(BAD[0], `import { qcProbeLegacy } from "@/lib/modules/pos/catalog-legacy";\nexport default function Page() {\n  void qcProbeLegacy;\n  return null;\n}\n`);
        put(BAD[1], `import * as L from "../modules/pos/catalog-legacy";\nexport const qcProbe = L;\n`);
        put(BAD[2], `"use server";\nexport async function qcProbe() {\n  const L = await import("@/lib/modules/pos/catalog-legacy");\n  return typeof L;\n}\n`);
        const GOOD = "src/lib/modules/restaurant/menu.ts";
        put(GOOD, `import { qcProbeLegacy } from "@/lib/modules/pos/catalog-legacy";\nexport async function qcDoor(tx: unknown) {\n  return qcProbeLegacy(tx);\n}\n`);
        const MK = ["CATALOG", "SYSTEM", "ACTOR"].join("_");
        put("scripts/qc-zzprobe.mts", [
          `import * as C from "../src/lib/modules/pos/catalog";`,
          `export function qcP1(ctx = { tenantId: "t", actorUserId: C.${MK} }) { return ctx; }`,
          `export function qcP2({ ctx = { actorUserId: C.${MK} } }: { ctx?: unknown } = {}) { return ctx; }`,
          `export function qcP3(x = C.${MK}) { return x; }`,
          ``,
        ].join("\n"));
        const v1: string[] = typeof fit?.scanSystemMarker === "function" ? (fit.scanSystemMarker(root) as string[]) : [];
        const f155: string[] = [];
        if (typeof fit?.runPosFitness === "function") {
          const log0 = console.log; console.log = () => undefined;
          try { fit.runPosFitness((id: string, _n: string, ok: boolean, detail: string) => { if (id === "F15.5" && !ok) f155.push(String(detail)); }, root); } finally { console.log = log0; }
        }
        const all = [...v1, ...f155].join("\n");
        const caught = BAD.filter((f) => all.includes(f));
        const goodFlag = all.split("\n").some((l) => l.includes(GOOD));
        chk("S2.31", typeof fit?.scanSystemMarker === "function" && caught.length === BAD.length && !goodFlag, `ละเมิดครบ ${BAD.length} ไฟล์ (src/app · src/lib/actions · "use server") · ${GOOD} ไม่ถูกจับ`,
          `จับได้ ${caught.length}/${BAD.length}: ${caught.join(",") || "-"} · ผู้เขียนเดิมถูกจับ ${goodFlag}`);
        const at = (ln: number) => v1.some((l) => l.startsWith(`scripts/qc-zzprobe.mts:${ln}:`));
        const s246 = { objParamDefault: at(2), objDestructDefault: at(3), control: at(4) };
        chk("S2.46", Object.values(s246).every(Boolean), "บรรทัด 2 (พารามิเตอร์ = ออบเจกต์ถือตัวบ่งชี้) · 3 (แยกค่า = ออบเจกต์ถือตัวบ่งชี้) ถูกจับ · คู่บวกบรรทัด 4",
          `${flags2(s246)} · ${v1.filter((l) => l.includes("qc-zzprobe")).slice(0, 4).join(" | ") || "ไม่มีรายงานของไฟล์ทดสอบ"}`);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    });

    // ─────────────── ตัวดัก SQL (G4c · G8) — ห่อ pg.Client.prototype.query (โมดูล pg ตัวเดียวกับที่ PrismaPg ใช้) ───────────────
    const sqlLog: string[] = []; let sqlOn = false; let sqlTapOk = false;
    try {
      const pgMod: Any = await import("pg" as string);
      const pgc: Any = pgMod.default ?? pgMod;
      const proto: Any = pgc?.Client?.prototype;
      if (proto && typeof proto.query === "function" && !proto.__qcP11bTap) {
        const orig = proto.query;
        proto.query = function (this: Any, ...args: Any[]) {
          if (sqlOn) { const a = args[0]; sqlLog.push(typeof a === "string" ? a : String(a?.text ?? "")); }
          return orig.apply(this, args);
        };
        proto.__qcP11bTap = true;
      }
      sqlOn = true; sqlLog.length = 0;
      await P.invItem.findFirst({ where: { tenantId: cfT }, select: { id: true } });
      sqlOn = false;
      sqlTapOk = sqlLog.some((s) => /"InvItem"/.test(s));
    } catch { sqlOn = false; sqlTapOk = false; }
    const traceSql = async <T,>(fn: () => Promise<T>): Promise<{ r: T; sql: string[] }> => {
      sqlLog.length = 0; sqlOn = true;
      try { const r = await fn(); return { r, sql: [...sqlLog] }; } finally { sqlOn = false; }
    };
    const writesTo = (sql: string[], table: string) => sql.filter((s) => new RegExp(`\\b(UPDATE|INSERT\\s+INTO|DELETE\\s+FROM)\\s+(?:"public"\\.)?"${table}"`, "i").test(s)).length;

    // ─────────────── PRELUDE: แถว "ข้อมูลเดิม" (สร้างตรง ไม่ผ่านประตู) + backfill หนึ่งรอบ ───────────────
    const behaveIds = s2Ids.filter((id) => !["S2.19a", "S2.19", "S2.29", "S2.30", "S2.31", "S2.32", "S2.33", "S2.41", "S2.44", "S2.45", "S2.46"].includes(id) && !(PART_B.has(`P1.1-${id}`) && !runPartB));
    const s2: Any = {}; const L: Record<string, string | null> = {};
    const seedIds = new Set<string>([...Object.values(snapLegacy0).flatMap((m) => [...m.keys()]), ...Object.values(snapNew0).flatMap((m) => [...m.keys()])]);
    const DROP_SCREEN = new Set(["updatedAt", "posProductId", "kitchen", "kitchenOpen", "isOpen", "open", "now", "_count"]);
    const projSeed = (v: unknown): unknown => {
      if (Array.isArray(v)) return v.filter((x) => !(x && typeof x === "object" && typeof (x as Any).id === "string" && !seedIds.has((x as Any).id))).map(projSeed);
      if (v && typeof v === "object" && !(v instanceof Date)) {
        const o: Record<string, unknown> = {};
        for (const [k, x] of Object.entries(v as Any)) if (!DROP_SCREEN.has(k)) o[k] = projSeed(x);
        return o;
      }
      return v;
    };
    const seedReaders = async () => {
      const roster: Any = booking ? await attempt(() => booking.serviceRoster({ tenantId: cfT, unitId: SILOM })) : { ok: false };
      return {
        listItems: projSeed(await menu.listItems(rsT, RMAIN, { includeArchived: true })),
        ordering: projSeed(await menu.orderingMenu(rsT, RMAIN)),
        publicMenu: projSeed(await storefront.publicMenu(rsT, RMAIN)),
        shop: projSeed(await shop.listProducts({ tenantId: cfT, unitId: SILOM })),
        posCatalogCf: projSeed(await reg.posCatalog(cfT, sysC.INVENTORY)),
        posCatalogRs: projSeed(await reg.posCatalog(rsT, sysR.INVENTORY)),
        roster: roster.ok ? projSeed(((roster.value?.rows ?? []) as Any[]).filter((r) => seedIds.has(r.itemId))) : `roster ${roster.err}`,
      };
    };
    let readersBefore: Any = null;
    const prodOfInv = async (inv: Any, sys: string = sysC.POS): Promise<Any | null> => (inv ? (await prodByInv(inv.id)).find((p) => p.systemId === sys) ?? null : null);
    const rowOf = async (table: string, id: string | null | undefined): Promise<Any | null> => (id ? (await q(`select * from "${table}" where id = $1`, id))[0] ?? null : null);
    const omItem = async (menuId: string) => ((await menu.orderingMenu(rsT, RMAIN)) as Any[]).flatMap((c) => c.items).find((i: Any) => i.id === menuId);
    /** แถวเดิมเท่ากันทุกคอลัมน์ ยกเว้นที่ระบุ (+ updatedAt · คอลัมน์เชื่อม) */
    const sameExcept = (a: Any, b: Any, keys: string[]) => {
      if (!a || !b) return false;
      const x = { ...a }; const y = { ...b };
      for (const k of [...keys, "updatedAt", "posProductId", "productId"]) { delete x[k]; delete y[k]; }
      return hashOf(x) === hashOf(y);
    };
    const ctxInvC = { tenantId: cfT, systemId: sysC.INVENTORY };
    const ctxShop = { tenantId: cfT, unitId: SILOM };
    let preludeOk = false;
    await section("s2-prelude", behaveIds, async () => {
      if (!C || !menu || !shop || !reg || !storefront) throw new Error(`ไม่มี catalog.ts หรือโมดูลเดิม (${JSON.stringify(loadErr).slice(0, 160)})`);
      readersBefore = await seedReaders();
      const mk = (sfx: string, basePrice: number, extra: Record<string, unknown> = {}) => mkMenu(`s2-${sfx}`, { basePrice, ...extra });
      s2.m = {
        mA: await mk("mA", 7300), mB: await mk("mB", 7400), mC: await mk("mC", 7500), mD2: await mk("mD2", 7650, { status: "ARCHIVED", archivedAt: new Date() }),
        mDarch: await mk("mDarch", 7600), mE: await mk("mE", 7700), mF: await mk("mF", 7800, { stockQty: 30 }), mOG: await mk("mOG", 7900), mIso: await mk("mIso", 8000),
        mCnt: await mk("mCnt", 8100), mH: await mk("mH", 8200), mSame: await mk("mSame", 8300), mT1A: await mk("g3-menu", 5000, { invItemId: fx.coke.id, images: ["https://example.invalid/g3.jpg"] }),
      };
      await P.menuItemOptionGroup.create({ data: { tenantId: rsT, unitId: RMAIN, itemId: s2.m.mA.id, groupId: fx.g1.id, sortOrder: 0 } });
      await P.menuItemOptionGroup.create({ data: { tenantId: rsT, unitId: RMAIN, itemId: s2.m.mT1A.id, groupId: fx.g1.id, sortOrder: 0 } });
      const sh = (sfx: string, price: number, inv: string | null = null) => mkShop(`s2-${sfx}`, price, inv);
      const inv = (sfx: string, extra: Record<string, unknown> = {}) => mkInv(cfT, sysC.INVENTORY, `s2-${sfx}`, extra);
      s2.i = {
        invShared: await inv("invShared", { costSatang: 100 }), invS8: await inv("invS8"), invAp: await inv("invAp", { costSatang: 100 }), invAp2: await inv("invAp2", { costSatang: 100 }),
        invRev: await inv("invRev", { costSatang: 100 }), invCntAp: await inv("invCntAp", { costSatang: 100 }), invNoAp: await inv("invNoAp", { costSatang: 100 }),
        invArch: await inv("invArch", { costSatang: 100 }), invG5: await inv("invG5", { costSatang: 100 }), invSame: await inv("invSame", { costSatang: 100 }),
        sInv: await inv("sInv"), sInv2: await inv("sInv2"), invIsoAp: await inv("invIsoAp"),
        svcA: await inv("svcA", { kind: "SERVICE", priceSatang: 8800 }), svcB: await inv("svcB", { kind: "SERVICE", priceSatang: 9000, sortOrder: -1_000_000 }), // ขึ้นหัว listServices (take 200 · sortOrder asc) — 520 แถว bulk ของ S1.37 ไม่ดันหลุดหน้าต่าง roster
        svcCnt: await inv("svcCnt", { kind: "SERVICE", priceSatang: 9100 }), // ORACLE-EDIT (controller 4 Oct): was swallowed by the comment above (S2.34)
        svcIso: await inv("svcIso", { kind: "SERVICE", priceSatang: 9200 }), svcH: await inv("svcH", { kind: "SERVICE", priceSatang: 9300 }), svcSame: await inv("svcSame", { kind: "SERVICE", priceSatang: 9400 }),
        invT4A: await inv("g3a-ap", { name: `${TAG} s2-g3-ap`, costSatang: 100 }), svcT5A: await inv("g3a-svc", { name: `${TAG} s2-g3-svc`, kind: "SERVICE", priceSatang: 4400 }),
        invT6A: await inv("g3a-arch", { name: `${TAG} s2-g3-arch`, costSatang: 100 }),
      };
      const I = s2.i;
      s2.a = {
        apShared: await mkAp(cfT, sysC.ACCOUNT, I.invShared, 4000), apEdit: await mkAp(cfT, sysC.ACCOUNT, I.invAp, 4100), apEdit2: await mkAp(cfT, sysC.ACCOUNT, I.invAp2, 4100),
        apRev: await mkAp(cfT, sysC.ACCOUNT, I.invRev, 4000, 700, 3500, { posEnabled: false }), apCnt: await mkAp(cfT, sysC.ACCOUNT, I.invCntAp, 4500), apArch: await mkAp(cfT, sysC.ACCOUNT, I.invArch, 4600),
        apG5: await mkAp(cfT, sysC.ACCOUNT, I.invG5, 4000), apSame: await mkAp(cfT, sysC.ACCOUNT, I.invSame, 4700), apS2: await mkAp(cfT, sysC.ACCOUNT, I.sInv2, 3000),
        apIso: await mkAp(cfT, sysC.ACCOUNT, I.invIsoAp, 4900), apT4A: await mkAp(cfT, sysC.ACCOUNT, I.invT4A, 4300), apT6A: await mkAp(cfT, sysC.ACCOUNT, I.invT6A, 4500),
      };
      s2.s = {
        shWeb: await sh("shWeb", 4100), shRev: await sh("shRev", 4200), shCnt: await sh("shCnt", 4300), shIsoW: await sh("shIsoW", 4350), shIsoB: await sh("shIsoB", 4360),
        shPerm: await sh("shPerm", 4400), shH: await sh("shH", 4450), shSame: await sh("shSame", 4600), shShared: await sh("shShared", 1200, I.invShared.id), shG5: await sh("shG5", 1200, I.invG5.id),
        shT2A: await sh("g3-web", 4100), shT3A: await sh("g3-off", 4200),
      };
      s2.bsB = await P.bookingService.create({ data: { tenantId: cfT, unitId: SILOM, name: I.svcB.name, durationMin: 30, priceSatang: 9000, itemId: I.svcB.id } });
      const bf = await runBackfill([]);
      if (bf.code !== 0 || !bf.summary) throw new Error(`backfill ของ prelude ล้ม: exit ${bf.code} · ${tail(bf.out)}`);
      for (const [k, m] of Object.entries(s2.m as Record<string, Any>)) L[k] = await linkOf("MenuItem", m.id);
      for (const [k, s] of Object.entries(s2.s as Record<string, Any>)) L[k] = await linkOf("ShopProduct", s.id);
      for (const [k, i] of Object.entries(s2.i as Record<string, Any>)) L[k] = (await prodOfInv(i))?.id ?? null;
      const miss = Object.entries(L).filter(([, v]) => !v).map(([k]) => k);
      if (miss.length) throw new Error(`backfill ของ prelude ไม่ผูกแถว: ${miss.join(",")}`);
      preludeOk = true;
    });

    if (preludeOk) {
      const M = s2.m; const I = s2.i; const A = s2.a; const S = s2.s;
      const ownerM = { role: cfOwner.role, unitAccess: cfOwner.unitAccess, permissions: cfOwner.permissions };

      // ═══ ร้านอาหาร: S2.1–S2.6 · S2.18 · S2.26 · S2.27 ═══
      await section("s2-menu", ["S2.1", "S2.2", "S2.3", "S2.4", "S2.5", "S2.6", "S2.18", "S2.26", "S2.27"], async () => {
        const p0 = await countProducts(rsT);
        const r1 = await attempt(() => menu.createItem(rsT, RMAIN, { categoryId: rsCat.id, stationId: rsStation.id, name: `${TAG} s2-new-menu`, basePrice: 7300, optionGroupIds: [fx.g1.id] }));
        const newId = r1.ok ? (r1.value?.id as string | undefined) : undefined;
        const l1 = newId ? await linkOf("MenuItem", newId) : null; const pp1 = await prodById(l1);
        const pog1 = l1 ? await q<Any>(`select "groupId", "sortOrder" from "PosProductOptionGroup" where "productId" = $1`, l1) : [];
        const pcat = pp1?.categoryId ? (await q<Any>(`select name, "unitId" from "PosCategory" where id = $1`, pp1.categoryId))[0] : null;
        const d1 = (await countProducts(rsT)) - p0;
        chk("S2.1", r1.ok && r1.value?.ok === true && pp1?.kind === "MENU" && pp1?.systemId === sysR.POS && pp1?.unitId === RMAIN && pp1?.invItemId === null && pp1?.basePriceSatang === 7300 && pcat?.name === rsCat.name && pog1.length === 1 && pog1[0].groupId === fx.g1.id && d1 === 1,
          "MENU · POS ร้านอาหาร · สาขา main · inv null · 7300 · หมวดชื่อเดิม · g1 · +1", `${r1.ok ? "" : `ปฏิเสธ ${r1.err} · `}ลิงก์ ${l1 ? "✓" : "✗"} · ${pp1 ? `${pp1.kind} ${pp1.unitId === RMAIN ? "main" : pp1.unitId} ${pp1.basePriceSatang}` : "ไม่มีแถว"} · หมวด ${pcat?.name ?? "-"} · og ${pog1.length} · +${d1}`);
        const pA0 = await countProducts(rsT);
        const u2 = await attempt(() => menu.updateItem(rsT, RMAIN, M.mA.id, { basePrice: 7600, name: `${TAG} s2-mA-ed`, nameEn: `${TAG} s2-mA-en` }));
        const pp2 = await prodById(L.mA);
        chk("S2.2", u2.ok && pp2?.basePriceSatang === 7600 && pp2?.name === `${TAG} s2-mA-ed` && pp2?.nameEn === `${TAG} s2-mA-en` && (await countProducts(rsT)) === pA0, "7600 · ชื่อใหม่ · ชื่ออังกฤษใหม่ · ไม่เพิ่มแถว",
          `${u2.ok ? "" : `ปฏิเสธ ${u2.err} · `}${pp2?.basePriceSatang} · ${pp2?.name} · ${pp2?.nameEn} · +${(await countProducts(rsT)) - pA0}`);
        const u3 = await attempt(() => menu.setItemOptionGroups(rsT, RMAIN, M.mA.id, [fx.g2.id, fx.g1.id]));
        const pog2 = (await q<Any>(`select "groupId", "sortOrder" from "PosProductOptionGroup" where "productId" = $1`, L.mA)).map((x: Any) => `${x.groupId === fx.g2.id ? "g2" : x.groupId === fx.g1.id ? "g1" : "?"}:${x.sortOrder}`).sort().join(",");
        chk("S2.3", u3.ok && pog2 === "g1:1,g2:0", "g1:1,g2:0", `${u3.ok ? "" : `ปฏิเสธ ${u3.err} · `}${pog2 || "∅"}`);
        const u6 = await attempt(() => menu.setItemStock(rsT, RMAIN, M.mA.id, { dailyStockQty: 12 }));
        chk("S2.6", u6.ok && (await prodById(L.mA))?.dailyStockQty === 12, "dailyStockQty 12", `${u6.ok ? "" : `ปฏิเสธ ${u6.err} · `}${String((await prodById(L.mA))?.dailyStockQty)}`);
        const pd0 = await countProducts(rsT);
        const dup = await attempt(() => menu.duplicateItem(rsT, RMAIN, M.mA.id));
        const ld = dup.ok && dup.value?.id ? await linkOf("MenuItem", dup.value.id) : null; const pld = await prodById(ld);
        chk("S2.4", dup.ok && !!ld && ld !== L.mA && pld?.kind === "MENU" && pld?.unitId === RMAIN && pld?.basePriceSatang === 7600 && (await countProducts(rsT)) === pd0 + 1, "สำเนามี PosProduct MENU ของตัวเอง 7600 · +1",
          `${dup.ok ? "" : `ปฏิเสธ ${dup.err} · `}${ld ?? "ไม่มีลิงก์"}${ld && ld === L.mA ? " (แชร์กับต้นฉบับ!)" : ""} · ${pld?.basePriceSatang} · +${(await countProducts(rsT)) - pd0}`);
        const a5 = await attempt(() => menu.archiveItem(rsT, RMAIN, M.mB.id));
        const pB = await prodById(L.mB); const pA = await prodById(L.mA);
        chk("S2.5", a5.ok && !!pB?.archivedAt && !pA?.archivedAt, "mB เก็บถาวร · mA ไม่กระทบ", `${a5.ok ? "" : `ปฏิเสธ ${a5.err} · `}mB ${pB?.archivedAt ? "✓" : "✗"} · mA ${pA?.archivedAt ? "โดนด้วย" : "✓"}`);
        const cokeP = (await prodByInv(fx.coke.id))[0]; const mCokeL = await linkOf("MenuItem", fx.mCoke.id);
        const u18 = await attempt(() => menu.updateItem(rsT, RMAIN, fx.mCoke.id, { basePrice: 2600 }));
        const rlN = mCokeL ? (await q(`select id from "RecipeLine" where "productId" = $1`, mCokeL)).length : -1;
        chk("S2.18", u18.ok && !!mCokeL && (await prodById(mCokeL))?.basePriceSatang === 2600 && (await prodById(cokeP?.id))?.basePriceSatang === 2000 && rlN === 1, "MENU 2600 · โค้ก PRODUCT 2000 · RecipeLine 1",
          `MENU ${(await prodById(mCokeL))?.basePriceSatang} · โค้ก ${(await prodById(cokeP?.id))?.basePriceSatang} · recipe ${rlN}`);
        const cc = await attempt(() => menu.createCategory(rsT, RMAIN, { name: `${TAG} s2-cat`, nameEn: `${TAG} s2-cat-en` }));
        const pcN = await q<Any>(`select * from "PosCategory" where "tenantId" = $1 and name = $2`, rsT, `${TAG} s2-cat`);
        const ac = cc.ok && cc.value?.id ? await attempt(() => menu.archiveCategory(rsT, RMAIN, cc.value.id)) : { ok: false, err: "ไม่มีหมวด" } as Try;
        const pcA = (await q<Any>(`select "archivedAt" from "PosCategory" where "tenantId" = $1 and name = $2`, rsT, `${TAG} s2-cat`))[0];
        chk("S2.26", cc.ok && cc.value?.ok === true && pcN.length === 1 && pcN[0].nameEn === `${TAG} s2-cat-en` && pcN[0].systemId === sysR.POS && pcN[0].unitId === RMAIN && ac.ok && !!pcA?.archivedAt,
          "PosCategory 1 แถว (ระบบ/สาขา/ชื่ออังกฤษ) → เก็บถาวร", `${cc.ok ? "" : `ปฏิเสธ ${cc.err} · `}${pcN.length} แถว · archived ${pcA?.archivedAt ? "✓" : "✗"}`);
        const og = await attempt(() => menu.createOptionGroup(rsT, RMAIN, { name: `${TAG} s2-g3`, minSelect: 0, maxSelect: 1, choices: [{ name: "หวานน้อย", priceDelta: 0 }, { name: "เพิ่มช็อต", priceDelta: 2500 }] }));
        const ogId = og.ok ? (og.value?.id as string | undefined) : undefined;
        const so = ogId ? await attempt(() => menu.setItemOptionGroups(rsT, RMAIN, M.mOG.id, [fx.g1.id, ogId])) : ({ ok: false, err: "ไม่มีกลุ่ม" } as Try);
        const findRow = async () => (await listAll(C, ctxRsOwner, RMAIN, { q: `${TAG} s2-mOG` })).items.find((r) => idOf(r) === L.mOG);
        const withG3 = ogId ? (await findRow())?.optionGroups?.find((g: Any) => (g.groupId ?? g.id) === ogId) : null;
        const deltaOk = !!withG3 && (withG3.choices as Any[]).some((c) => (c.priceDelta ?? c.priceDeltaSatang) === 2500);
        const ao = ogId ? await attempt(() => menu.archiveOptionGroup(rsT, RMAIN, ogId)) : ({ ok: false } as Try);
        const goneG3 = !!ogId && ao.ok && !(await findRow())?.optionGroups?.some((g: Any) => (g.groupId ?? g.id) === ogId);
        chk("S2.27", og.ok && so.ok && deltaOk && goneG3, "เห็นกลุ่มใหม่ (+25.00) แล้วหายเมื่อเก็บถาวร", `${og.ok ? "" : `ปฏิเสธ ${og.err} · `}เห็น ${deltaOk} · หาย ${goneG3}`);
      });

      // ═══ เว็บร้าน: S2.7–S2.9 ═══
      await section("s2-shop", ["S2.7", "S2.8", "S2.9"], async () => {
        const pc0 = await countProducts(cfT);
        const sp = await attempt(() => shop.createProduct(ctxShop, { name: `${TAG} s2-new-shop`, priceSatang: 4321 }));
        const ls = sp.ok ? await linkOf("ShopProduct", sp.value.id) : null; const pls = await prodById(ls);
        const firstPos = (await firstPosOfTenant()).get(cfT);
        chk("S2.7", sp.ok && pls?.kind === "PRODUCT" && pls?.basePriceSatang === 4321 && pls?.unitId === SILOM && pls?.invItemId === null && pls?.systemId === firstPos && (await countProducts(cfT)) === pc0 + 1, "PRODUCT 4321 · POS แรก · สาขาสีลม · inv null · +1",
          `${sp.ok ? "" : `ปฏิเสธ ${sp.err} · `}${pls ? `${pls.kind} ${pls.basePriceSatang} ${pls.unitId === SILOM ? "สีลม" : pls.unitId}` : "ไม่มีลิงก์"} · +${(await countProducts(cfT)) - pc0}`);
        const pc1 = await countProducts(cfT);
        const sp2 = await attempt(() => shop.createProduct(ctxShop, { name: `${TAG} s2-new-shop-inv`, priceSatang: 9999, invItemId: I.invS8.id }));
        const ls2 = sp2.ok ? await linkOf("ShopProduct", sp2.value.id) : null;
        chk("S2.8", sp2.ok && ls2 === L.invS8 && (await countProducts(cfT)) === pc1, "ชี้แถวของ InvItem เดิม · +0", `${sp2.ok ? "" : `ปฏิเสธ ${sp2.err} · `}${ls2 === L.invS8 ? "ตัวเดิม" : ls2 ?? "ไม่มีลิงก์"} · +${(await countProducts(cfT)) - pc1}`);
        const u1 = await attempt(() => shop.updateProduct(ctxShop, S.shWeb.id, { priceSatang: 4444 }));
        const u2 = await attempt(() => shop.updateProduct(ctxShop, S.shShared.id, { priceSatang: 9876 }));
        const own = (await rowOf("ShopProduct", S.shShared.id))?.priceSatang;
        chk("S2.9", u1.ok && u2.ok && (await prodById(L.shWeb))?.basePriceSatang === 4444 && (await prodById(L.invShared))?.basePriceSatang === 4000 && own === 9876, "เว็บล้วน 4444 · แถวร่วมคง 4000 · ShopProduct ร่วม 9876",
          `${u1.ok && u2.ok ? "" : `ปฏิเสธ ${u1.err ?? ""} ${u2.err ?? ""} · `}เว็บล้วน ${(await prodById(L.shWeb))?.basePriceSatang} · ร่วม ${(await prodById(L.invShared))?.basePriceSatang} · ShopProduct ${own}`);
      });

      // ═══ บัญชี / ราคา POS เดิม / AI: S2.10 · S2.10b · S2.11 · S2.11b · S2.25 · S2.21 · S2.22 ═══
      await section("s2-acc", ["S2.10", "S2.10b", "S2.11", ...(runPartB ? ["S2.11b"] : []), "S2.25", "S2.21", "S2.22"], async () => {
        const r10 = await attempt(() => reg.setItemSalePrice(cfT, sysC.POS, I.sInv.id, 3900));
        chk("S2.10", r10.ok && r10.value?.ok === true && (await prodById(L.sInv))?.basePriceSatang === 3900, "ผูกบัญชีใหม่ · PosProduct 3900", `${r10.ok ? (r10.value?.ok ? "" : `${r10.value?.reason} · `) : `${r10.err} · `}${(await prodById(L.sInv))?.basePriceSatang}`);
        const r10b = await attempt(() => reg.setItemSalePrice(cfT, sysC.POS, I.sInv2.id, 3950));
        const ap10b = await rowOf("AccountProduct", A.apS2.id);
        chk("S2.10b", r10b.ok && r10b.value?.ok === true && ap10b?.salePrice === 3950 && (await prodById(L.sInv2))?.basePriceSatang === 3950, "AccountProduct 3950 · PosProduct 3950",
          `${r10b.ok ? (r10b.value?.ok ? "" : `${r10b.value?.reason} · `) : `${r10b.err} · `}AP ${ap10b?.salePrice} · PosProduct ${(await prodById(L.sInv2))?.basePriceSatang}`);
        const up11 = await attempt(() => accProduct.updateProduct(cfT, sysC.ACCOUNT, A.apEdit.id, { name: A.apEdit.name, salePrice: 4200, vatRateBp: 0 }));
        const p11 = await prodById(L.invAp);
        chk("S2.11", up11.ok && up11.value?.ok === true && p11?.basePriceSatang === 4200 && p11?.vatRateBp === 0, "4100 → 4200 · VAT 0", `${up11.ok ? (up11.value?.ok ? "" : `${up11.value?.reason} · `) : `${up11.err} · `}${p11?.basePriceSatang}/${p11?.vatRateBp}`);
        if (runPartB) {
          const r11b = await attempt(() => accountF.updateAccountProductSalePrice(cfT, A.apEdit2.id, 4150));
          chk("S2.11b", r11b.ok && (await prodById(L.invAp2))?.basePriceSatang === 4150, "4100 → 4150", `${r11b.ok ? "" : `${r11b.err} · `}${(await prodById(L.invAp2))?.basePriceSatang}`);
        }
        const up3 = await attempt(() => accProduct.updateProduct(cfT, sysC.ACCOUNT, A.apEdit.id, { name: A.apEdit.name, salePrice: 4200, vatRateBp: 0, posPrice: 3800, posEnabled: true }));
        const k1 = (await prodById(L.invAp))?.basePriceSatang;
        const up4 = await attempt(() => accProduct.updateProduct(cfT, sysC.ACCOUNT, A.apEdit.id, { name: A.apEdit.name, salePrice: null, vatRateBp: 0, posPrice: 3800, posEnabled: true }));
        const k2 = (await prodById(L.invAp))?.basePriceSatang;
        chk("S2.25", up3.ok && up3.value?.ok === true && k1 === 4200 && up4.ok && up4.value?.ok === true && k2 === 3800, "salePrice 4200 ชนะ posPrice · salePrice ว่าง + posEnabled → 3800", `${k1} · ${k2}`);
        const lnkAp = await P.accountProduct.create({ data: { tenantId: cfT, systemId: sysC.ACCOUNT, name: `${TAG} s2-link-ap`, salePrice: 2700, vatRateBp: 700, type: "GOODS" } });
        const lk = await attempt(() => invLink.linkProductToItem({ tenantId: cfT, systemId: sysC.ACCOUNT }, lnkAp.id, { createItem: { sku: `${TAG}-s2-lnk` } }));
        const lkItem = lk.ok && lk.value?.ok ? await rowOf("InvItem", lk.value.itemId) : null;
        const lkPos = lkItem ? ((await posOfInventory()).get(lkItem.systemId) ?? []) : [];
        const lkP = lkItem && lkPos.length === 1 ? await prodOfInv(lkItem, lkPos[0]) : null;
        // ORACLE-EDIT (controller 4 Oct): legacy inventorySystemId() picks an arbitrary INVENTORY system (findFirst, no order — pre-existing, G2 keeps it).
        // Expected price follows C7 for the POS that actually sells the chosen inventory: book of that POS = sysC.ACCOUNT ⇒ 2700, otherwise no AP price ⇒ null.
        const lkBook = lkPos.length === 1 ? (await q<{ systemId: string }>(`select "systemId" from "AccountSystemLink" where "tenantId" = $1 and "linkedKind" = 'POS' and "linkedId" = $2 and "archivedAt" is null and enabled`, cfT, lkPos[0]))[0]?.systemId ?? null : null;
        const lkWant = lkBook === sysC.ACCOUNT ? 2700 : null;
        chk("S2.21", lk.ok && lk.value?.ok === true && lkPos.length === 1 && !!lkP && (lkP.basePriceSatang ?? null) === lkWant, `PosProduct ของ InvItem ใหม่ = ราคาตาม C7 ของ POS ที่ขายคลังนั้น (คาด ${lkWant})`,
          `${lk.ok ? (lk.value?.ok ? "" : `${lk.value?.reason} · `) : `${lk.err} · `}คลัง→POS ${lkPos.length} · ${lkP ? lkP.basePriceSatang : "ไม่มีแถว"}`);
        const propSrc = read("src/lib/ai/proposals.ts");
        const propImp = /from\s+["'][^"']*pos\/catalog(-legacy)?["']|import\(\s*["'][^"']*pos\/catalog(-legacy)?["']/.test(propSrc);
        const ai = await attempt(() => proposals.runKind(ownerM, cfT, "inventory_create_item", { sku: `${TAG}-s2-ai`, name: `${TAG} s2 ai` }, `${TAG}-s2-ai-run`, cfOwner.userId));
        const aiInv = (await q<Any>(`select id from "InvItem" where "tenantId" = $1 and sku = $2`, cfT, `${TAG}-s2-ai`))[0];
        const aiN = aiInv ? (await prodByInv(aiInv.id)).length : -1;
        chk("S2.22", ai.ok && !!aiInv && aiN === 1 && !propImp, "InvItem + PosProduct 1 · ai/proposals.ts ไม่ import แคตตาล็อก", `${ai.ok ? "" : `${ai.err} · `}inv ${aiInv ? "✓" : "✗"} · prod ${aiN} · proposals import แคตตาล็อก ${propImp}`);
      });

      // ═══ คลัง / จอง: S2.12 · S2.20 · S2.23 · S2.37 ═══
      await section("s2-inv", ["S2.12", "S2.20", "S2.23", "S2.37"], async () => {
        const ci = await attempt(() => inventory.createItem(ctxInvC, { sku: `${TAG}-s2-ci`, name: `${TAG} s2 ci` }));
        const cs = await attempt(() => inventory.createItem(ctxInvC, { sku: `${TAG}-s2-cs`, name: `${TAG} s2 cs`, kind: "SERVICE", priceSatang: 8800 }));
        const pci = ci.ok ? await prodOfInv(ci.value) : null; const pcs = cs.ok ? await prodOfInv(cs.value) : null;
        chk("S2.12", ci.ok && cs.ok && pci?.kind === "PRODUCT" && pci?.basePriceSatang === null && pcs?.kind === "SERVICE" && pcs?.basePriceSatang === 8800, "PRODUCT null · SERVICE 8800 (POS ของคลัง seed)",
          `${pci ? `${pci.kind} ${pci.basePriceSatang}` : "ไม่มี"} · ${pcs ? `${pcs.kind} ${pcs.basePriceSatang}` : "ไม่มี"}`);
        const u20 = await attempt(() => inventory.updateItem(ctxInvC, I.svcA.id, { priceSatang: 9100 }));
        chk("S2.20", u20.ok && (await prodById(L.svcA))?.basePriceSatang === 9100, "9100", `${u20.ok ? "" : `${u20.err} · `}${(await prodById(L.svcA))?.basePriceSatang}`);
        const bs = await P.bookingService.create({ data: { tenantId: cfT, unitId: SILOM, name: `${TAG} s2 บริการเก่า`, durationMin: 30, priceSatang: 6600 } });
        const im = await attempt(() => booking.importServicesToCatalog({ tenantId: cfT, unitId: SILOM }));
        const bsItem = (await rowOf("BookingService", bs.id))?.itemId as string | undefined;
        const bsP = bsItem ? await prodOfInv({ id: bsItem }) : null;
        chk("S2.23", im.ok && !!bsItem && bsP?.kind === "SERVICE" && bsP?.basePriceSatang === 6600, "SERVICE 6600", `${im.ok ? "" : `${im.err} · `}${bsItem ? "" : "ไม่ได้ย้าย · "}${bsP ? `${bsP.kind} ${bsP.basePriceSatang}` : "ไม่มีแถว"}`);
        const ar = await attempt(() => inventory.archiveItem(ctxInvC, I.invArch.id));
        const pAr = await prodById(L.invArch);
        const un = await attempt(() => inventory.unarchiveItem(ctxInvC, I.invArch.id));
        const pUn = await prodById(L.invArch);
        chk("S2.37", ar.ok && !!pAr?.archivedAt && un.ok && pUn?.archivedAt === null, "archiveItem → เก็บถาวร · unarchiveItem → กู้คืน", `archive ${ar.ok ? (pAr?.archivedAt ? "✓" : "✗ ไม่ตาม") : ar.err} · unarchive ${un.ok ? (pUn?.archivedAt === null ? "✓" : "✗") : un.err}`);
      });

      // ═══ ย้อนทาง (G4b · G6 · G9): S2.13–S2.16 · S2.24 · S2.35 · S2.38 · S2.52 ═══
      await section("s2-reverse", ["S2.13", "S2.14", "S2.15", "S2.16", "S2.24", "S2.35", "S2.38", "S2.52"], async () => {
        const ap0 = await rowOf("AccountProduct", A.apRev.id); const inv0 = await rowOf("InvItem", I.invRev.id); const apN0 = await countWhere("AccountProduct", cfT);
        const v13 = await attempt(() => C.setPrice(ctxOwner, L.invRev, 4700));
        const ap1 = await rowOf("AccountProduct", A.apRev.id); const inv1 = await rowOf("InvItem", I.invRev.id);
        const regNow = ((await reg.posCatalog(cfT, sysC.INVENTORY)) as Any[]).find((c) => c.id === I.invRev.id)?.priceSatang;
        const s213 = { setPrice: v13.ok, salePrice: ap1?.salePrice === 4700, onlyThatField: sameExcept(ap0, ap1, ["salePrice"]), invUntouched: sameExcept(inv0, inv1, []), noNewAp: (await countWhere("AccountProduct", cfT)) === apN0, till: regNow === 4700 };
        chk("S2.13", Object.values(s213).every(Boolean), "AP.salePrice 4700 ช่องเดียว (posPrice 3500/posEnabled คง) · InvItem ไม่แตะ · ไม่มี AP ใหม่ · หน้าขายเดิม 4700",
          `${flags2(s213)} · ${v13.ok ? "" : `${v13.err} · `}AP ${ap1?.salePrice}/${ap1?.posPrice}/${ap1?.posEnabled} · reg ${regNow}`);
        const m0 = await rowOf("MenuItem", M.mC.id);
        const v14 = await attempt(() => C.setPrice(ctxRsOwner, L.mC, 8100));
        const m1 = await rowOf("MenuItem", M.mC.id); const om = (await omItem(M.mC.id))?.basePrice;
        const v14b = await attempt(() => C.updateProduct(ctxRsOwner, L.mC, { name: `${TAG} s2-mC-ren`, nameEn: `${TAG} s2-mC-ren-en` }));
        const m2 = await rowOf("MenuItem", M.mC.id);
        const s214 = { setPrice: v14.ok, basePrice: m1?.basePrice === 8100, onlyPrice: sameExcept(m0, m1, ["basePrice"]), ordering: om === 8100, update: v14b.ok, names: m2?.name === `${TAG} s2-mC-ren` && m2?.nameEn === `${TAG} s2-mC-ren-en`, onlyNames: sameExcept(m1, m2, ["name", "nameEn"]) };
        chk("S2.14", Object.values(s214).every(Boolean), "MenuItem.basePrice 8100 ช่องเดียว · orderingMenu 8100 · name/nameEn ตาม", `${flags2(s214)} · ${m1?.basePrice} · om ${om} · ${m2?.name}`);
        const sh0 = await rowOf("ShopProduct", S.shRev.id);
        const v15 = await attempt(() => C.setPrice(ctxOwner, L.shRev, 4555));
        const sh1 = await rowOf("ShopProduct", S.shRev.id);
        const v15b = await attempt(() => C.updateProduct(ctxOwner, L.shRev, { name: `${TAG} s2-shRev-ren` }));
        const sh2 = await rowOf("ShopProduct", S.shRev.id);
        const shNow = ((await shop.listProducts(ctxShop, { activeOnly: true })) as Any[]).find((x) => x.id === S.shRev.id);
        const s215 = { setPrice: v15.ok, price: sh1?.priceSatang === 4555, onlyPrice: sameExcept(sh0, sh1, ["priceSatang"]), update: v15b.ok, name: sh2?.name === `${TAG} s2-shRev-ren`, onlyName: sameExcept(sh1, sh2, ["name"]), storefront: shNow?.priceSatang === 4555 && shNow?.name === `${TAG} s2-shRev-ren` };
        chk("S2.15", Object.values(s215).every(Boolean), "ShopProduct 4555 · ชื่อใหม่ · คอลัมน์อื่นคง · หน้าร้านเห็น", `${flags2(s215)} · ${sh2?.priceSatang} · ${sh2?.name}`);
        const v16 = await attempt(() => C.archive(ctxRsOwner, L.mDarch));
        const mi = await rowOf("MenuItem", M.mDarch.id); const inOm = !!(await omItem(M.mDarch.id));
        chk("S2.16", v16.ok && mi?.status === "ARCHIVED" && !!mi?.archivedAt && !inOm, "MenuItem ARCHIVED + archivedAt · หายจาก orderingMenu", `${v16.ok ? "" : `${v16.err} · `}${mi?.status} · ${mi?.archivedAt ? "archivedAt ✓" : "archivedAt ✗"} · ${inOm ? "ยังอยู่" : "หาย"}`);
        const pre38 = await rowOf("MenuItem", M.mD2.id); const pp38 = await prodById(L.mD2);
        const v38 = await attempt(() => C.restore(ctxRsOwner, L.mD2));
        const mi38 = await rowOf("MenuItem", M.mD2.id); const in38 = !!(await omItem(M.mD2.id));
        const s238 = { setup: pre38?.status === "ARCHIVED" && !!pre38?.archivedAt && !!pp38?.archivedAt, restore: v38.ok, menuItem: mi38?.archivedAt === null && mi38?.status !== "ARCHIVED", ordering: in38 };
        chk("S2.38", Object.values(s238).every(Boolean), "เมนูเก็บถาวรทั้งสองฝั่ง → restore → MenuItem archivedAt null · ไม่ใช่ ARCHIVED · กลับมาใน orderingMenu", `${flags2(s238)} · ${v38.ok ? "" : `${v38.err} · `}${mi38?.status} · archivedAt ${mi38?.archivedAt ? "ยังมี" : "null"}`);
        const v24 = await attempt(() => C.setPrice(ctxOwner, L.svcB, 9300));
        const invNow = (await rowOf("InvItem", I.svcB.id))?.priceSatang;
        const roster = await attempt(() => booking.serviceRoster({ tenantId: cfT, unitId: SILOM }));
        const rRow = roster.ok ? ((roster.value?.rows ?? []) as Any[]).find((r) => r.itemId === I.svcB.id) : null;
        const bsNow = (await rowOf("BookingService", s2.bsB.id))?.priceSatang;
        chk("S2.24", v24.ok && invNow === 9300 && rRow?.priceSatang === 9300 && bsNow === 9300, "InvItem 9300 · roster 9300 · BookingService 9300", `${v24.ok ? "" : `${v24.err} · `}inv ${invNow} · roster ${rRow?.priceSatang ?? (roster.ok ? "ไม่พบ" : roster.err)} · bs ${bsNow}`);
        const i35a = await rowOf("InvItem", I.invNoAp.id); const apN35 = await countWhere("AccountProduct", cfT);
        const v35 = await attempt(() => C.setPrice(ctxOwner, L.invNoAp, 2500));
        const i35b = await rowOf("InvItem", I.invNoAp.id);
        const apFor = (await q(`select id from "AccountProduct" where "invItemId" = $1`, I.invNoAp.id)).length;
        chk("S2.35", v35.ok && (await prodById(L.invNoAp))?.basePriceSatang === 2500 && (await countWhere("AccountProduct", cfT)) === apN35 && apFor === 0 && sameExcept(i35a, i35b, []) && i35b?.accountProductId === null,
          "PosProduct 2500 · ไม่มี AccountProduct ใหม่ · InvItem ไม่ขยับ", `${v35.ok ? "" : `${v35.err} · `}AP +${(await countWhere("AccountProduct", cfT)) - apN35} · AP ของ inv ${apFor} · InvItem ${sameExcept(i35a, i35b, []) ? "คง" : "เปลี่ยน"}`);
        const sp0 = await rowOf("ShopProduct", S.shPerm.id); const pp0 = await prodById(L.shPerm);
        const d52 = await attempt(() => C.setPrice(ctxCashier, L.shPerm, 1));
        const sp1 = await rowOf("ShopProduct", S.shPerm.id); const pp1 = await prodById(L.shPerm);
        const o52 = await attempt(() => C.setPrice(ctxOwner, L.shPerm, 4499));
        const sp2 = await rowOf("ShopProduct", S.shPerm.id);
        const s252 = { denied: refused(d52, "PERMISSION_DENIED"), shopKept: hashOf(sp0) === hashOf(sp1), posKept: hashOf(pp0) === hashOf(pp1), ownerOk: o52.ok && sp2?.priceSatang === 4499 };
        chk("S2.52", Object.values(s252).every(Boolean), "แคชเชียร์ PERMISSION_DENIED ทั้งสองฝั่งไม่เปลี่ยน · เจ้าของตั้ง 4499 → ShopProduct ตาม", `${flags2(s252)} · แคชเชียร์ ${codeOf(d52)} · ShopProduct หลังเจ้าของ ${sp2?.priceSatang}`);
      });

      // ═══ S2.34 G4c เขียนแต่ละฝั่งครั้งเดียว (ดัก SQL) ═══
      await section("s2-g4c", ["S2.34"], async () => {
        if (!sqlTapOk) { chk("S2.34", false, "ตัวดัก SQL ใช้ได้", "ดัก pg.Client.prototype.query ไม่ได้ (คู่บวกของตัวดักไม่เห็นคำสั่ง)"); return; }
        const cases: [string, () => Promise<Any>, [string, number][]][] = [
          ["menu.updateItem", () => menu.updateItem(rsT, RMAIN, M.mCnt.id, { basePrice: 8101 }), [["MenuItem", 1], ["PosProduct", 1]]],
          ["setPrice(MENU)", () => C.setPrice(ctxRsOwner, L.mCnt, 8102), [["PosProduct", 1], ["MenuItem", 1]]],
          ["shop.updateProduct", () => shop.updateProduct(ctxShop, S.shCnt.id, { priceSatang: 4301 }), [["ShopProduct", 1], ["PosProduct", 1]]],
          ["setPrice(เว็บล้วน)", () => C.setPrice(ctxOwner, L.shCnt, 4302), [["PosProduct", 1], ["ShopProduct", 1]]],
          ["inventory.updateItem", () => inventory.updateItem(ctxInvC, I.svcCnt.id, { priceSatang: 9101 }), [["InvItem", 1], ["PosProduct", 1]]],
          ["setPrice(SERVICE)", () => C.setPrice(ctxOwner, L.svcCnt, 9102), [["PosProduct", 1], ["InvItem", 1]]],
          ["account updateProduct", () => accProduct.updateProduct(cfT, sysC.ACCOUNT, A.apCnt.id, { name: A.apCnt.name, salePrice: 4501, vatRateBp: 700 }), [["AccountProduct", 1], ["PosProduct", 1]]],
          ["setPrice(PRODUCT+AP)", () => C.setPrice(ctxOwner, L.invCntAp, 4502), [["PosProduct", 1], ["AccountProduct", 1]]],
        ];
        const bad: string[] = [];
        for (const [label, fn, want] of cases) {
          const t = await traceSql(() => attempt(fn));
          const got = want.map(([tb]) => `${tb}=${writesTo(t.sql, tb)}`).join(" ");
          if (!t.r.ok || t.r.value?.ok === false || want.some(([tb, n]) => writesTo(t.sql, tb) !== n)) bad.push(`${label}: ${t.r.ok ? (t.r.value?.ok === false ? `ok:false ${t.r.value?.reason ?? ""}` : "") : t.r.err} ${got}`);
        }
        chk("S2.34", bad.length === 0, "ทุกกรณี: ตารางเดิม 1 · PosProduct 1 · สำเร็จ", bad.join(" · ") || "ครบ");
      });

      // ═══ S2.36 G5 แถวร่วม ═══
      await section("s2-g5", ["S2.36"], async () => {
        const a = await attempt(() => shop.updateProduct(ctxShop, S.shG5.id, { priceSatang: 1300 }));
        const pa = (await prodById(L.invG5))?.basePriceSatang; const sa = (await rowOf("ShopProduct", S.shG5.id))?.priceSatang;
        const b = await attempt(() => inventory.updateItem(ctxInvC, I.invG5.id, { priceSatang: 777 }));
        const pb = (await prodById(L.invG5))?.basePriceSatang; const ib = (await rowOf("InvItem", I.invG5.id))?.priceSatang;
        const c = await attempt(() => accProduct.updateProduct(cfT, sysC.ACCOUNT, A.apG5.id, { name: A.apG5.name, salePrice: 4100, vatRateBp: 700 }));
        const pc = (await prodById(L.invG5))?.basePriceSatang;
        const d = await attempt(() => shop.updateProduct(ctxShop, S.shG5.id, { priceSatang: 1400 }));
        const pd = (await prodById(L.invG5))?.basePriceSatang; const sd = (await rowOf("ShopProduct", S.shG5.id))?.priceSatang;
        const s236 = { webOwnWritten: a.ok && sa === 1300, webNoOverride: pa === 4000, invOwnWritten: b.ok && ib === 777, invNoOverride: pb === 4000, salePriceMoves: c.ok && c.value?.ok === true && pc === 4100, webStillNoOverride: d.ok && sd === 1400 && pd === 4100 };
        chk("S2.36", Object.values(s236).every(Boolean), "เว็บร้าน 1300/1400 เขียนแต่ราคาคง · InvItem.priceSatang 777 เขียนแต่ราคาคง · salePrice 4100 ย้ายราคา", `${flags2(s236)} · ราคา ${pa}→${pb}→${pc}→${pd}`);
      });

      // ═══ S2.17 G4c ไม่เขียนซ้อน ═══
      await section("s2-same", ["S2.17"], async () => {
        const first = [
          await attempt(() => menu.updateItem(rsT, RMAIN, M.mSame.id, { basePrice: 8350 })),
          await attempt(() => shop.updateProduct(ctxShop, S.shSame.id, { priceSatang: 4650 })),
          await attempt(() => accProduct.updateProduct(cfT, sysC.ACCOUNT, A.apSame.id, { name: A.apSame.name, salePrice: 4750, vatRateBp: 700 })),
          await attempt(() => inventory.updateItem(ctxInvC, I.svcSame.id, { priceSatang: 9450 })),
        ];
        const prices = async () => [(await prodById(L.mSame))?.basePriceSatang, (await prodById(L.shSame))?.basePriceSatang, (await prodById(L.invSame))?.basePriceSatang, (await prodById(L.svcSame))?.basePriceSatang];
        const synced = first.every((r) => r.ok) && hashOf(await prices()) === hashOf([8350, 4650, 4750, 9450]);
        const counts = async () => [await countProducts(cfT), await countProducts(rsT), await countWhere("AccountProduct", cfT), await countWhere("InvItem", cfT), await countWhere("MenuItem", rsT), await countWhere("ShopProduct", cfT)];
        const c0 = await counts();
        for (let k = 0; k < 2; k++) {
          await attempt(() => menu.updateItem(rsT, RMAIN, M.mSame.id, { basePrice: 8350 }));
          await attempt(() => shop.updateProduct(ctxShop, S.shSame.id, { priceSatang: 4650 }));
          await attempt(() => accProduct.updateProduct(cfT, sysC.ACCOUNT, A.apSame.id, { name: A.apSame.name, salePrice: 4750, vatRateBp: 700 }));
          await attempt(() => inventory.updateItem(ctxInvC, I.svcSame.id, { priceSatang: 9450 }));
        }
        const c1 = await counts(); const p1 = await prices();
        chk("S2.17", synced && hashOf(c0) === hashOf(c1) && hashOf(p1) === hashOf([8350, 4650, 4750, 9450]), "ซิงก์ครั้งแรก 8350/4650/4750/9450 · บันทึกซ้ำ 2 รอบจำนวนแถวคง ราคาคง",
          `ซิงก์ครั้งแรก ${synced ? "✓" : `✗ ${JSON.stringify(await prices())}`} · แถว ${JSON.stringify(c0)} → ${JSON.stringify(c1)} · ราคา ${JSON.stringify(p1)}`);
      });

      // ═══ S2.39 G6/N1 restore ตรวจสิทธิ์บนแถวที่ล็อก ═══
      await section("s2-n1", ["S2.39"], async () => {
        const ctxT = { tenantId: cfT, systemId: fx.tPos.id, actorUserId: cfOwner.userId as string };
        const ctxTc = { tenantId: cfT, systemId: fx.tPos.id, actorUserId: cfCashier.userId as string };
        const cp = await attempt(() => C.createProduct(ctxT, { name: `${TAG} s2-n1`, basePriceSatang: 100, unitId: fx.uA.id }));
        const id = idOf(cp.value) as string;
        const ar = id ? await attempt(() => C.archive(ctxT, id)) : ({ ok: false, err: "ไม่มีแถว" } as Try);
        if (!cp.ok || !ar.ok) { chk("S2.39", false, "เตรียมแถวได้", `create ${cp.err ?? "✓"} · archive ${ar.err ?? "✓"}`); return; }
        let release: () => void = () => undefined;
        const gate = new Promise<void>((res) => { release = res; });
        let held = false;
        const holder = lane(8).$transaction(async (tx: Any) => {
          await tx.$executeRawUnsafe(`update "PosProduct" set "unitId" = null where id = $1`, id);
          held = true;
          await gate;
        }, { timeout: 90_000, maxWait: 30_000 }).then(() => "ok").catch((e: unknown) => firstLine(e));
        for (let i = 0; i < 400 && !held; i++) await new Promise((r) => setTimeout(r, 25));
        const res = await asManagerOf([fx.uA.id], async () => {
          const pr = attempt(() => C.restore(ctxTc, id, lane(9)));
          let waited = false;
          for (let i = 0; i < 80 && !waited; i++) {
            await new Promise((r) => setTimeout(r, 250));
            const w = await q<{ n: number }>(`select count(*)::int as n from pg_stat_activity where datname = current_database() and wait_event_type = 'Lock' and pid <> pg_backend_pid()`);
            waited = (w[0]?.n ?? 0) > 0;
          }
          release();
          const hr = await holder;
          return { r: await pr, waited, hr };
        });
        const row = await prodById(id);
        const s239 = { holderOk: res.hr === "ok", restoreBlocked: res.waited, denied: refused(res.r, "PERMISSION_DENIED"), stillArchived: !!row?.archivedAt, movedAllBranch: row?.unitId === null };
        chk("S2.39", s239.holderOk && s239.denied && s239.stillArchived && s239.movedAllBranch, "restore ถูกล็อกรอ (ตรวจได้) → หลังปล่อย PERMISSION_DENIED · แถวยังเก็บถาวร · แถวเป็นทุกสาขาแล้ว",
          `${flags2(s239)} · restore ${codeOf(res.r)} · holder ${res.hr}`);
      });

      // ═══ S2.48 G12 ล็อกหลังตรวจสิทธิ์ · S2.40 G7/G11 BUSY ผ่านประตูเดิม ═══
      const holdTenantLock = (ms: number, laneNo: number) => {
        let held = false;
        const done = lane(laneNo).$transaction(async (tx: Any) => {
          await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(hashtext($1))`, `pos-catalog:${cfT}`);
          held = true;
          await new Promise((r) => setTimeout(r, ms));
        }, { timeout: 90_000, maxWait: 30_000 }).then(() => "ok").catch((e: unknown) => firstLine(e));
        return { done, isHeld: () => held };
      };
      await section("s2-busy", ["S2.48", "S2.40"], async () => {
        const bc1 = `92${RAND}48`; const bc2 = `92${RAND}49`;
        const h1 = holdTenantLock(9000, 7);
        for (let i = 0; i < 400 && !h1.isHeld(); i++) await new Promise((r) => setTimeout(r, 25));
        const cash = await attemptX(() => C.createProduct(ctxCashier, { name: `${TAG} s2-g12-cashier`, barcode: bc1, unitId: SILOM, basePriceSatang: 100 }));
        const own = await attemptX(() => C.createProduct(ctxOwner, { name: `${TAG} s2-g12-owner`, barcode: bc2, unitId: SILOM, basePriceSatang: 100 }));
        const h1r = await h1.done;
        const rows48 = (await q(`select id from "PosProduct" where "tenantId" = $1 and barcode = any($2::text[])`, cfT, [bc1, bc2])).length;
        const s248 = { cashierDeniedFast: refused(cash, "PERMISSION_DENIED") && cash.ms < 2000, ownerBusy: refused(own, "BUSY"), noRows: rows48 === 0, holder: h1r === "ok" };
        chk("S2.48", Object.values(s248).every(Boolean), "แคชเชียร์ PERMISSION_DENIED < 2 วิ · เจ้าของ BUSY (ล็อกมีผลจริง) · ไม่มีแถว", `${flags2(s248)} · แคชเชียร์ ${codeOf(cash)} ${cash.ms} ms · เจ้าของ ${codeOf(own)} ${own.ms} ms`);

        const ctrlInv = await mkInv(cfT, sysC.INVENTORY, "s2-busy-ctrl");
        const apBusy = await P.accountProduct.create({ data: { tenantId: cfT, systemId: sysC.ACCOUNT, name: `${TAG} s2-busy-ap`, salePrice: 1500, vatRateBp: 700, type: "GOODS" } });
        const sku1 = `${TAG}-s2-busy1`; const sku2 = `${TAG}-s2-busy2`;
        const h2 = holdTenantLock(12000, 7);
        for (let i = 0; i < 400 && !h2.isHeld(); i++) await new Promise((r) => setTimeout(r, 25));
        const [ctrl, d1, d2] = await Promise.all([
          attemptX(() => C.ensureForInvItem(ctxSys(cfT, sysC.POS), ctrlInv.id)),
          attemptX(() => inventory.createItem(ctxInvC, { sku: sku1, name: `${TAG} s2 busy1` })),
          attemptX(() => invLink.linkProductToItem({ tenantId: cfT, systemId: sysC.ACCOUNT }, apBusy.id, { createItem: { sku: sku2 } })),
        ]);
        const h2r = await h2.done;
        const busyMsg = String((ctrl.e as Any)?.message ?? "");
        const inv1 = (await q(`select id from "InvItem" where "tenantId" = $1 and sku = $2`, cfT, sku1)).length;
        const inv2 = (await q(`select id from "InvItem" where "tenantId" = $1 and sku = $2`, cfT, sku2)).length;
        const apNow = await rowOf("AccountProduct", apBusy.id);
        const d1msg = String((d1.e as Any)?.message ?? "");
        const d2reason = String(d2.value?.reason ?? "");
        const s240 = {
          control: refused(ctrl, "BUSY") && /[฀-๿]/.test(busyMsg), holder: h2r === "ok",
          createItemSurfaces: !d1.ok && d1.threw === true && !!busyMsg && d1msg.includes(busyMsg), createItemRolledBack: inv1 === 0,
          linkSurfaces: !d2.ok && d2.threw === false && d2.value?.ok === false && !!busyMsg && d2reason.includes(busyMsg), linkRolledBack: inv2 === 0 && !apNow?.invItemId,
        };
        chk("S2.40", Object.values(s240).every(Boolean), "คู่บวก ensure = BUSY · createItem throw ข้อความ BUSY + ไม่มี InvItem · linkProductToItem {ok:false, reason BUSY} + ไม่มี InvItem/ลิงก์",
          `${flags2(s240)} · createItem ${d1.ok ? "สำเร็จ (ไม่รอล็อก)" : d1msg.slice(0, 60)} · link ${d2.ok ? "สำเร็จ (ไม่รอล็อก)" : d2.threw ? `throw ${d2.err}` : d2reason.slice(0, 60)} · InvItem ${inv1}/${inv2}`);
      });

      // ═══ S2.42 · S2.43 G8 ทางร้อนสั่งอาหาร + สต็อกสดไม่ mirror ═══
      // ฐาน (a0f5e11e · วัดด้วยตัวดักเดียวกันใน QC_FORCE): createOrder ทาง "หมดพอดี" (หัก + 86 + ตัวที่สองหมด → ROLLBACK) · cancelOrderItem (คืนสต็อก)
      //   วัดบน a0f5e11e (QC_FORCE · tag qc-p1.1-883caa): createOrder = RestaurantSetting · MenuItem(+OptionGroup/Group/Choice) · BEGIN · (SELECT/UPDATE/SELECT/UPDATE 86) · (SELECT/UPDATE หมด) · ROLLBACK = 13
      //   · cancelOrderItem = BEGIN · SELECT item · SELECT menu · UPDATE menu · UPDATE item · COMMIT = 6
      const BASE_ORDER_STMTS = { createOrderOutOfStock: 13, cancelOrderItem: 6 };
      await section("s2-g8", ["S2.42", "S2.43"], async () => {
        const mS1 = await mkMenu("s2-ord-1", { basePrice: 5000, stockQty: 1 }); const mS0 = await mkMenu("s2-ord-0", { basePrice: 5000, stockQty: 0 });
        let ord: Any = null;
        try {
          const cart = [{ menuItemId: mS1.id, qty: 1, choiceIds: [] }, { menuItemId: mS0.id, qty: 1, choiceIds: [] }];
          const call = () => order.createOrder({ tenantId: rsT, unitId: RMAIN, type: "TAKEAWAY", cart, placedByUserId: rsOwner.userId });
          const warm = await attempt(call);
          const t1 = sqlTapOk ? await traceSql(() => attempt(call)) : null;
          const t2 = sqlTapOk ? await traceSql(() => attempt(call)) : null;
          // attempt แปลง {ok:false} เป็น Try{ok:false, threw:false, value} — ทางหมดพอดีคืนค่า (ไม่ throw)
          const oos = (t: Any) => !!t && t.r.threw !== true && t.r.value?.ok === false && t.r.value?.err?.code === "OUT_OF_STOCK";
          const s1Back = (await rowOf("MenuItem", mS1.id))?.stockQty === 1;
          ord = await P.restaurantOrder.create({ data: { tenantId: rsT, unitId: RMAIN, type: "TAKEAWAY", status: "CONFIRMED", bizDate: `qc-${RAND}`, dailyNo: 0, note: `${TAG} s2-g8` } });
          const mkLine = () => P.restaurantOrderItem.create({ data: { tenantId: rsT, unitId: RMAIN, orderId: ord.id, menuItemId: mS1.id, stationId: rsStation.id, nameSnapshot: mS1.name, unitPrice: 5000, qty: 1, lineTotal: 5000, kdsStatus: "NEW" } });
          const li1 = await mkLine(); const li2 = await mkLine();
          const c1 = sqlTapOk ? await traceSql(() => attempt(() => order.cancelOrderItem(rsT, RMAIN, li1.id, "qc", rsOwner.userId))) : null;
          const c2 = sqlTapOk ? await traceSql(() => attempt(() => order.cancelOrderItem(rsT, RMAIN, li2.id, "qc", rsOwner.userId))) : null;
          const cOk = (t: Any) => !!t && t.r.ok && t.r.value?.ok === true;
          const touchesPos = [t1, t2, c1, c2].some((t) => !!t && t.sql.some((s: string) => /"PosProduct"/.test(s)));
          const n = { createOrderOutOfStock: t1?.sql.length ?? -1, cancelOrderItem: c1?.sql.length ?? -1 };
          const stable = !!t1 && !!t2 && !!c1 && !!c2 && t1.sql.length === t2.sql.length && c1.sql.length === c2.sql.length;
          console.log(`  ℹ️  [S2.42] จำนวนคำสั่ง ${JSON.stringify(n)} · ฐาน ${JSON.stringify(BASE_ORDER_STMTS)} · createOrder: ${(t1?.sql ?? []).map((s: string) => s.replace(/\s+/g, " ").slice(0, 48)).join(" ¦ ")}`);
          console.log(`  ℹ️  [S2.42] cancelOrderItem: ${(c1?.sql ?? []).map((s: string) => s.replace(/\s+/g, " ").slice(0, 48)).join(" ¦ ")}`);
          const s242 = { tap: sqlTapOk, warm: warm.threw !== true && warm.value?.ok === false, outOfStockPath: oos(t1) && oos(t2) && s1Back, cancelOk: cOk(c1) && cOk(c2), stable, equalsBase: hashOf(n) === hashOf(BASE_ORDER_STMTS), noPosProduct: !touchesPos };
          chk("S2.42", Object.values(s242).every(Boolean), `จำนวนคำสั่ง = ฐาน ${JSON.stringify(BASE_ORDER_STMTS)} · คงที่สองรอบ · ไม่แตะ PosProduct`, `${flags2(s242)} · วัดได้ ${JSON.stringify(n)} (รอบสอง ${t2?.sql.length ?? "-"}/${c2?.sql.length ?? "-"})`);
        } finally {
          if (ord) {
            await P.restaurantOrderItem.deleteMany({ where: { orderId: ord.id, tenantId: rsT } }).catch(() => null);
            await P.restaurantOrder.deleteMany({ where: { id: ord.id, tenantId: rsT } }).catch(() => null);
          }
        }
        const p0 = await prodById(L.mF);
        const avail = async () => (await listAll(C, ctxRsOwner, RMAIN, { q: `${TAG} s2-mF` })).items.find((r) => idOf(r) === L.mF)?.availability?.[RMAIN];
        const a0 = await avail();
        const t86 = sqlTapOk ? await traceSql(() => attempt(() => menu.setItemStock(rsT, RMAIN, M.mF.id, { isOutOfStock: true, stockQty: 3 }))) : null;
        const a86 = await avail(); const p86 = await prodById(L.mF);
        const tUn = sqlTapOk ? await traceSql(() => attempt(() => menu.setItemStock(rsT, RMAIN, M.mF.id, { isOutOfStock: false }))) : null;
        const aUn = await avail();
        const tRs = sqlTapOk ? await traceSql(() => attempt(() => menu.resetDailyStock(rsT, RMAIN))) : null;
        const p1 = await prodById(L.mF);
        const posW = [t86, tUn, tRs].reduce((s, t) => s + (t ? writesTo(t.sql, "PosProduct") : 0), 0);
        const s243 = { tap: sqlTapOk, calls: !!t86?.r.ok && !!tUn?.r.ok && !!tRs?.r.ok, noPosWrites: posW === 0, rowUnchanged: hashOf(p0) === hashOf(p86) && hashOf(p0) === hashOf(p1), before: a0 === true, outWhen86: a86 === false, backWhenUn: aUn === true };
        chk("S2.43", Object.values(s243).every(Boolean), "ไม่มี UPDATE PosProduct · แถวไม่เปลี่ยน · availability true → 86 false → ปลด true", `${flags2(s243)} · availability ${a0}/${a86}/${aUn} · เขียน PosProduct ${posW}`);
      });

      // ═══ S2.47 G12 createCategory อ่านผ่าน ownFields ═══
      await section("s2-g12", ["S2.47"], async () => {
        const n0 = (await rowsOf("PosCategory", [cfT])).length;
        const proto = Object.create({ unitId: SILOM }, { name: { value: `${TAG} s2-g12-proto`, enumerable: true } });
        const i1 = await attempt(() => C.createCategory(ctxOwner, proto));
        const r1 = (await q<Any>(`select "unitId" from "PosCategory" where "tenantId" = $1 and name = $2`, cfT, `${TAG} s2-g12-proto`))[0];
        const n1 = (await rowsOf("PosCategory", [cfT])).length;
        const i2 = await attempt(() => C.createCategory(ctxOwner, { name: `${TAG} s2-g12-unk`, bogus: 1 } as Any));
        const i3 = await attempt(() => C.createCategory(ctxOwner, null as Any));
        const i4 = await attempt(() => C.createCategory(ctxOwner, [] as Any));
        const n2 = (await rowsOf("PosCategory", [cfT])).length;
        const s247 = {
          protoIgnored: (i1.ok && !!r1 && r1.unitId === null && n1 === n0 + 1) || (refused(i1, "VALIDATION") && !r1 && n1 === n0),
          unknownKey: refused(i2, "VALIDATION"), nullInput: refused(i3, "VALIDATION"), arrayInput: refused(i4, "VALIDATION"), noStray: n2 === n1,
        };
        chk("S2.47", Object.values(s247).every(Boolean), "unitId จาก prototype ไม่ลงสาขา · คีย์แปลก/null/[] = VALIDATION · ไม่มีแถวเกิน", `${flags2(s247)} · prototype ${codeOf(i1)} → unit ${r1 ? String(r1.unitId) : "-"} · คีย์แปลก ${codeOf(i2)} · null ${codeOf(i3)} · [] ${codeOf(i4)}`);
      });

      // ═══ S2.50 · S2.51 แยกร้าน / แยกสาขา ═══
      await section("s2-iso", ["S2.50", "S2.51"], async () => {
        const allProds = async () => new Map((await q<Any>(`select * from "PosProduct" where "tenantId" = any($1::text[])`, QC_TIDS)).map((r) => [r.id as string, hashOf(r)]));
        const legacyRows = async () => [await rowOf("MenuItem", M.mIso.id), await rowOf("ShopProduct", S.shIsoW.id), await rowOf("InvItem", I.svcIso.id), await rowOf("AccountProduct", A.apIso.id), await rowOf("ShopProduct", S.shIsoB.id)].map((r) => { const x = { ...r }; delete x.updatedAt; return hashOf(x); });
        const before = await allProds(); const lBefore = await legacyRows();
        const xs: [string, Try][] = [
          ["menu.updateItem", await attempt(() => menu.updateItem(cfT, SILOM, M.mIso.id, { basePrice: 1 }))],
          ["menu.archiveItem", await attempt(() => menu.archiveItem(cfT, SILOM, M.mIso.id))],
          ["menu.setItemStock", await attempt(() => menu.setItemStock(cfT, SILOM, M.mIso.id, { dailyStockQty: 99 }))],
          ["shop.updateProduct", await attempt(() => shop.updateProduct({ tenantId: rsT, unitId: RMAIN }, S.shIsoW.id, { priceSatang: 1 }))],
          ["inventory.updateItem", await attempt(() => inventory.updateItem({ tenantId: rsT, systemId: sysR.INVENTORY }, I.svcIso.id, { priceSatang: 1 }))],
          ["inventory.archiveItem", await attempt(() => inventory.archiveItem({ tenantId: rsT, systemId: sysR.INVENTORY }, I.svcIso.id))],
          ["account updateProduct", await attempt(() => accProduct.updateProduct(rsT, sysC.ACCOUNT, A.apIso.id, { name: "HACK", salePrice: 1 }))],
        ];
        const fx8 = await attempt(() => shop.createProduct(ctxShop, { name: `${TAG} s2-iso-foreign-inv`, priceSatang: 777, invItemId: fx.coke.id }));
        const after = await allProds(); const lAfter = await legacyRows();
        const changed = [...before.keys()].filter((k) => after.get(k) !== before.get(k));
        const added = [...after.keys()].filter((k) => !before.has(k));
        const fx8Link = fx8.ok ? await linkOf("ShopProduct", fx8.value.id) : null;
        const fx8Row = await prodById(fx8Link);
        const addedOk = added.every((k) => k === fx8Link) && (!fx8Row || (fx8Row.tenantId === cfT && fx8Row.invItemId !== fx.coke.id));
        const pos = await attempt(() => menu.updateItem(rsT, RMAIN, M.mIso.id, { basePrice: 8888 }));
        const posOk = pos.ok && (await prodById(L.mIso))?.basePriceSatang === 8888;
        const s250 = { noChange: changed.length === 0, onlyOwnNewRow: addedOk, legacyKept: hashOf(lBefore.slice(0, 4)) === hashOf(lAfter.slice(0, 4)), positiveControl: posOk };
        chk("S2.50", Object.values(s250).every(Boolean), "ไม่มี PosProduct เปลี่ยน/เพิ่ม (ยกเว้นแถวของเว็บร้านเองที่ไม่ผูก InvItem ร้านอื่น) · แถวเดิมไม่เปลี่ยน · คู่บวก 8888",
          `${flags2(s250)} · เปลี่ยน ${changed.length} · เพิ่ม ${added.length} · ${xs.map(([l, r]) => `${l}:${codeOf(r)}`).join(" ")}`);
        const before2 = await allProds(); const lB2 = await legacyRows();
        const w1 = await attempt(() => shop.updateProduct({ tenantId: cfT, unitId: ARI }, S.shIsoB.id, { priceSatang: 1 }));
        const w2 = await attempt(() => menu.updateItem(rsT, `${TAG}-no-unit`, M.mIso.id, { basePrice: 2 }));
        const after2 = await allProds(); const lA2 = await legacyRows();
        const changed2 = [...before2.keys()].filter((k) => after2.get(k) !== before2.get(k)).length + [...after2.keys()].filter((k) => !before2.has(k)).length;
        const pos2 = await attempt(() => shop.updateProduct(ctxShop, S.shIsoB.id, { priceSatang: 4888 }));
        const pos2Ok = pos2.ok && (await prodById(L.shIsoB))?.basePriceSatang === 4888;
        const s251 = { noChange: changed2 === 0, legacyKept: lB2[0] === lA2[0] && lB2[4] === lA2[4], positiveControl: pos2Ok };
        chk("S2.51", Object.values(s251).every(Boolean), "สาขาผิด: ทั้งสองฝั่งไม่เปลี่ยน · คู่บวก สาขาถูก 4888", `${flags2(s251)} · shop สาขาอารีย์ ${codeOf(w1)} · menu สาขาปลอม ${codeOf(w2)}`);
      });

      // ═══ X6.5 G7 แข่งกัน (connection แยก) + ตัวนับ deadlock ═══
      await section("s2-race", ["X6.5"], async () => {
        const dl = async () => Number((await q<{ d: unknown }>(`select deadlocks as d from pg_stat_database where datname = current_database()`))[0]?.d ?? -1);
        const d0 = await dl();
        const notes: string[] = []; let ok = true; const errs: string[] = [];
        for (let round = 1; round <= 3; round++) {
          const rs = await Promise.all(Array.from({ length: 10 }, (_, i) => (i % 2 === 0
            ? attempt(() => menu.updateItem(rsT, RMAIN, M.mE.id, { basePrice: 9000 + round * 10 + i }))
            : attempt(() => C.setPrice(ctxRsOwner, L.mE, 9500 + round * 10 + i, lane(i))))));
          const mb = (await rowOf("MenuItem", M.mE.id))?.basePrice; const pb = (await prodById(L.mE))?.basePriceSatang;
          const failed = rs.filter((r) => !r.ok);
          for (const f of failed) errs.push(f.err ?? "?");
          ok &&= mb === pb && failed.length === 0;
          notes.push(`รอบ${round}: menu ${mb} / pos ${pb} · ล้ม ${failed.length}`);
        }
        await new Promise((r) => setTimeout(r, 12_000)); // สถิติ pg_stat ส่งช้าได้ถึง ~10 วิ
        const d1 = await dl();
        const deadlockErr = errs.some((e) => /deadlock|40P01/i.test(e));
        chk("X6.5", ok && !deadlockErr && d0 >= 0 && d1 - d0 === 0, "ทุกรอบเท่ากัน · 10/10 สำเร็จ · ไม่มี deadlock (error + ตัวนับ)",
          `${notes.join(" · ")} · deadlocks +${d1 - d0} · ${errs.slice(0, 2).join(" | ")}`);
      });

      // ═══ S2.49 G13 ตรึงพฤติกรรม ═══
      await section("s2-g13", ["S2.49"], async () => {
        const m0 = await rowOf("MenuItem", M.mH.id);
        const u1 = await attempt(() => menu.updateItem(rsT, RMAIN, M.mH.id, { basePrice: 8250, name: `${TAG} s2-mH-ed` }));
        const m1 = await rowOf("MenuItem", M.mH.id);
        const s0 = await rowOf("ShopProduct", S.shH.id);
        const u2 = await attempt(() => shop.updateProduct(ctxShop, S.shH.id, { priceSatang: 4460 }));
        const s1 = await rowOf("ShopProduct", S.shH.id);
        const i0 = await rowOf("InvItem", I.svcH.id);
        const u3 = await attempt(() => inventory.updateItem(ctxInvC, I.svcH.id, { priceSatang: 9350 }));
        const i1 = await rowOf("InvItem", I.svcH.id);
        const readersAfter = await seedReaders();
        const diffR = Object.keys(readersBefore ?? {}).filter((k) => hashOf(readersBefore[k]) !== hashOf(readersAfter[k as keyof typeof readersAfter]));
        const s249 = {
          synced: (await prodById(L.mH))?.basePriceSatang === 8250 && (await prodById(L.shH))?.basePriceSatang === 4460 && (await prodById(L.svcH))?.basePriceSatang === 9350,
          menuRow: u1.ok && m1?.basePrice === 8250 && m1?.name === `${TAG} s2-mH-ed` && sameExcept(m0, m1, ["basePrice", "name"]),
          shopRow: u2.ok && s1?.priceSatang === 4460 && sameExcept(s0, s1, ["priceSatang"]),
          invRow: u3.ok && i1?.priceSatang === 9350 && sameExcept(i0, i1, ["priceSatang"]),
          seedReaders: !!readersBefore && diffR.length === 0,
        };
        chk("S2.49", Object.values(s249).every(Boolean), "ซิงก์จริง (คู่บวก) · แถวเดิม = ค่าที่ส่ง คอลัมน์อื่นคง · ผู้อ่านเดิมเห็นแถว seed เหมือนเดิม",
          `${flags2(s249)} · ผู้อ่านที่ต่าง: ${diffR.join(",") || "-"} · PosProduct ${(await prodById(L.mH))?.basePriceSatang}/${(await prodById(L.shH))?.basePriceSatang}/${(await prodById(L.svcH))?.basePriceSatang}`);
      });

      // ═══ S2.28 G3 แฝด: backfill-แล้วแก้ ≡ แก้-แล้ว backfill (backfill รอบสองของกลุ่ม — ปิดท้าย) ═══
      await section("s2-g3", ["S2.28"], async () => {
        const T: Any = { A: { m: M.mT1A, web: S.shT2A, off: S.shT3A, ap: { inv: I.invT4A, ap: A.apT4A }, svc: I.svcT5A, arch: { inv: I.invT6A, ap: A.apT6A } } };
        const inv = (sfx: string, extra: Record<string, unknown>) => mkInv(cfT, sysC.INVENTORY, `s2-${sfx}`, extra);
        const bM = await mkMenu("s2-g3-menu", { basePrice: 5000, invItemId: fx.coke.id, images: ["https://example.invalid/g3.jpg"] });
        await P.menuItemOptionGroup.create({ data: { tenantId: rsT, unitId: RMAIN, itemId: bM.id, groupId: fx.g1.id, sortOrder: 0 } });
        const bApInv = await inv("g3b-ap", { name: `${TAG} s2-g3-ap`, costSatang: 100 });
        const bArchInv = await inv("g3b-arch", { name: `${TAG} s2-g3-arch`, costSatang: 100 });
        T.B = {
          m: bM, web: await mkShop("s2-g3-web", 4100), off: await mkShop("s2-g3-off", 4200),
          ap: { inv: bApInv, ap: await mkAp(cfT, sysC.ACCOUNT, bApInv, 4300) },
          svc: await inv("g3b-svc", { name: `${TAG} s2-g3-svc`, kind: "SERVICE", priceSatang: 4400 }),
          arch: { inv: bArchInv, ap: await mkAp(cfT, sysC.ACCOUNT, bArchInv, 4500) },
        };
        const edit = async (t: Any): Promise<string[]> => {
          const rs: [string, Try][] = [
            ["menu.updateItem", await attempt(() => menu.updateItem(rsT, RMAIN, t.m.id, { basePrice: 6100, name: `${TAG} s2-g3-menu-ed`, nameEn: `${TAG} s2-g3-en` }))],
            ["menu.setItemOptionGroups", await attempt(() => menu.setItemOptionGroups(rsT, RMAIN, t.m.id, [fx.g2.id, fx.g1.id]))],
            ["menu.setItemStock", await attempt(() => menu.setItemStock(rsT, RMAIN, t.m.id, { dailyStockQty: 7 }))],
            ["shop.updateProduct", await attempt(() => shop.updateProduct(ctxShop, t.web.id, { priceSatang: 5100, name: `${TAG} s2-g3-web-ed` }))],
            ["shop.updateProduct(off)", await attempt(() => shop.updateProduct(ctxShop, t.off.id, { active: false }))],
            ["account updateProduct", await attempt(() => accProduct.updateProduct(cfT, sysC.ACCOUNT, t.ap.ap.id, { name: t.ap.inv.name, salePrice: 5200, vatRateBp: 0 }))],
            ["inventory.updateItem", await attempt(() => inventory.updateItem(ctxInvC, t.svc.id, { priceSatang: 5300 }))],
            ["inventory.archiveItem", await attempt(() => inventory.archiveItem(ctxInvC, t.arch.inv.id))],
          ];
          return rs.filter(([, r]) => !r.ok || r.value?.ok === false).map(([l, r]) => `${l}:${r.ok ? r.value?.reason : r.err}`);
        };
        const eA = await edit(T.A); const eB = await edit(T.B);
        const bf = await runBackfill([]);
        const normP = (p: Any) => {
          if (!p) return null;
          const x: Any = { ...p };
          for (const k of ["id", "createdAt", "updatedAt"]) delete x[k];
          x.invItemId = p.invItemId ? "inv" : null;
          x.archivedAt = !!p.archivedAt;
          return x;
        };
        const kids = async (pid: string | null) => pid ? {
          og: (await q<Any>(`select "groupId", "sortOrder" from "PosProductOptionGroup" where "productId" = $1`, pid)).map((r) => `${r.groupId}:${r.sortOrder}`).sort(),
          rl: (await q<Any>(`select "invItemId", qty from "RecipeLine" where "productId" = $1`, pid)).map((r) => `${r.invItemId}:${r.qty}`).sort(),
        } : null;
        const rowsOfTwin = async (t: Any) => {
          const ids = {
            m: await linkOf("MenuItem", t.m.id), web: await linkOf("ShopProduct", t.web.id), off: await linkOf("ShopProduct", t.off.id),
            ap: (await prodOfInv(t.ap.inv))?.id ?? null, svc: (await prodOfInv(t.svc))?.id ?? null, arch: (await prodOfInv(t.arch.inv))?.id ?? null,
          };
          const out: Record<string, Any> = {};
          for (const [k, id] of Object.entries(ids)) out[k] = { p: normP(await prodById(id)), kids: await kids(id) };
          return out;
        };
        const ra = await rowsOfTwin(T.A); const rb = await rowsOfTwin(T.B);
        const diff = Object.keys(ra).filter((k) => !ra[k].p || !rb[k].p || hashOf(ra[k]) !== hashOf(rb[k]));
        const detail = diff.map((k) => {
          const a = ra[k].p; const b = rb[k].p;
          if (!a || !b) return `${k}: ${a ? "" : "A ไม่มีแถว "}${b ? "" : "B ไม่มีแถว"}`;
          const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((c) => hashOf(a[c]) !== hashOf(b[c]));
          const kd = hashOf(ra[k].kids) !== hashOf(rb[k].kids) ? " +ตัวเลือก/สูตร" : "";
          return `${k}: ${keys.slice(0, 4).map((c) => `${c} ${JSON.stringify(a[c])}≠${JSON.stringify(b[c])}`).join(", ")}${kd}`;
        });
        chk("S2.28", bf.code === 0 && eA.length === 0 && eB.length === 0 && diff.length === 0, "แฝด 6 ชนิดเท่ากันทุกช่อง (PosProduct + ตัวเลือก + สูตร)",
          `backfill exit ${bf.code} · แก้ A ล้ม ${eA.join(",") || "-"} · แก้ B ล้ม ${eB.join(",") || "-"} · ต่าง ${diff.length}: ${detail.join(" · ").slice(0, 400) || "-"}`);
      });

      // ═══ ORACLE-ADD (controller R2 ruling) ▸ S2.R2.1–S2.R2.6 · brief pos-brief-P1.1b-R2.md ═══
      await section("s2-r2", ["S2.R2.1", "S2.R2.2", "S2.R2.3", "S2.R2.4", "S2.R2.5", "S2.R2.6"], async () => {
        const ctxX = { tenantId: cfT, systemId: fx.tInvX.id };
        // F2 + F3: บริการในคลัง X (ขายผ่าน POS สองคลัง fx.tPos) + สินค้าเว็บร้านผูกบริการนั้น (POS แรก · C9b แถวของตัวเอง)
        const cs = await attempt(() => inventory.createItem(ctxX, { sku: `${TAG}-r2-svc`, name: `${TAG} r2 svc`, kind: "SERVICE", priceSatang: 5000 }));
        const svcId = cs.ok ? (cs.value?.id as string) : null;
        const sp = svcId ? await attempt(() => shop.createProduct(ctxShop, { name: `${TAG} r2-shop-svc`, priceSatang: 1000, invItemId: svcId })) : ({ ok: false, err: "ไม่มีบริการ" } as Try);
        const shopRowId = sp.ok ? await linkOf("ShopProduct", sp.value.id) : null;
        const tPosRow = svcId ? (await prodByInv(svcId)).find((p) => p.systemId === fx.tPos.id) ?? null : null;
        const sp0 = sp.ok ? await rowOf("ShopProduct", sp.value.id) : null;
        const v1 = shopRowId ? await attempt(() => C.setPrice(ctxOwner, shopRowId, 5500)) : ({ ok: false, err: "ไม่มีแถว" } as Try);
        const inv1 = svcId ? await rowOf("InvItem", svcId) : null;
        const sp1 = sp.ok ? await rowOf("ShopProduct", sp.value.id) : null;
        const e1 = sp.ok ? await attempt(() => shop.updateProduct(ctxShop, sp.value.id, { name: `${TAG} r2-shop-svc-ed` })) : ({ ok: false } as Try);
        const p1 = await prodById(shopRowId);
        const ver = typeof C.verifyCatalog === "function" ? await attempt(() => C.verifyCatalog({ tenantIds: [cfT] })) : ({ ok: false, err: "ไม่มี verifyCatalog" } as Try);
        const verRows = ver.ok ? ((ver.value?.samples ?? []) as Any[]).filter((d) => d.productId === shopRowId || d.productId === tPosRow?.id) : null;
        const r21 = {
          setup: cs.ok && sp.ok && !!shopRowId && sp0?.priceSatang === 1000, setPrice: v1.ok, invItemPrice: inv1?.priceSatang === 5500, shopPriceKept: sp1?.priceSatang === 1000,
          nextShopEditKeeps: e1.ok && p1?.basePriceSatang === 5500, verifyNoDrift: !!verRows && verRows.length === 0,
        };
        chk("S2.R2.1", Object.values(r21).every(Boolean), "InvItem.priceSatang 5500 · ShopProduct คง 1000 · แก้เว็บร้านแล้วราคาคง 5500 · verify ไม่มี drift ของสองแถวนี้",
          `${flags2(r21)} · ${v1.ok ? "" : `setPrice ${v1.err} · `}inv ${inv1?.priceSatang} · shop ${sp1?.priceSatang} · catalogue ${p1?.basePriceSatang} · verify ${verRows ? JSON.stringify(verRows.slice(0, 2)) : ver.err}`);
        const sib = tPosRow ? await prodById(tPosRow.id) : null;
        chk("S2.R2.2", !!tPosRow && tPosRow.basePriceSatang === 5000 && v1.ok && sib?.basePriceSatang === 5500, "แถว InvItem ใน POS สองคลัง 5000 → 5500 (พี่น้อง)",
          `${tPosRow ? `ก่อน ${tPosRow.basePriceSatang} · หลัง ${sib?.basePriceSatang}` : "ไม่มีแถวพี่น้อง (createItem ไม่สร้างแถวใน POS สองคลัง)"}`);
        // F4: สินค้า + AP (salePrice ว่าง · posPrice 3500 · posEnabled) → ขั้น pos ชนะ ⇒ salePrice 0 ไม่ทำให้ราคาเป็น 0
        const iP = await mkInv(cfT, sysC.INVENTORY, "r2-posrung", { costSatang: 100 });
        const aP = await mkAp(cfT, sysC.ACCOUNT, iP, null, 700, 3500, { posEnabled: true });
        const en = await attempt(() => C.ensureForInvItem(ctxSys(cfT, sysC.POS), iP.id));
        const rowP = en.ok ? (en.value?.id as string) : null;
        const pP0 = await prodById(rowP); const aP0 = await rowOf("AccountProduct", aP.id);
        const z = rowP ? await attempt(() => C.setPrice(ctxOwner, rowP, 0)) : ({ ok: false, err: "ไม่มีแถว" } as Try);
        const pP1 = await prodById(rowP); const aP1 = await rowOf("AccountProduct", aP.id);
        const okP = rowP ? await attempt(() => C.setPrice(ctxOwner, rowP, 3600)) : ({ ok: false } as Try);
        const aP2 = await rowOf("AccountProduct", aP.id); const pP2 = await prodById(rowP);
        const zMsg = String(z.err ?? "");
        const r23 = {
          setup: pP0?.basePriceSatang === 3500, refused: refused(z, "VALIDATION") && /[฀-๿]/.test(zMsg), apKept: hashOf(aP0) === hashOf(aP1), posKept: hashOf(pP0) === hashOf(pP1),
          positive: okP.ok && aP2?.salePrice === 3600 && pP2?.basePriceSatang === 3600,
        };
        chk("S2.R2.3", Object.values(r23).every(Boolean), "0 = VALIDATION ไทย · AP + PosProduct ไม่เปลี่ยน · คู่บวก 3600 → AP.salePrice", `${flags2(r23)} · ${codeOf(z)} ${zMsg.slice(0, 60)} · AP ${aP1?.salePrice}/${aP2?.salePrice} · pos ${pP1?.basePriceSatang}/${pP2?.basePriceSatang}`);
        // F5: ShopProduct สองแถวชี้ InvItem เดียวนอก POS แรก ⇒ แถวแคตตาล็อกเดียว (C9b) · แถวแรกเป็นต้นทาง
        const iS = await mkInv(cfT, fx.tInvX.id, "r2-shared");
        const s1 = await attempt(() => shop.createProduct(ctxShop, { name: `${TAG} r2-sh1`, priceSatang: 1000, invItemId: iS.id }));
        const s2r = await attempt(() => shop.createProduct(ctxShop, { name: `${TAG} r2-sh2`, priceSatang: 2000, invItemId: iS.id }));
        const l1 = s1.ok ? await linkOf("ShopProduct", s1.value.id) : null; const l2 = s2r.ok ? await linkOf("ShopProduct", s2r.value.id) : null;
        const ps0 = await prodById(l1);
        const u2 = s2r.ok ? await attempt(() => shop.updateProduct(ctxShop, s2r.value.id, { priceSatang: 2500, name: `${TAG} r2-sh2-ed` })) : ({ ok: false } as Try);
        const ps1 = await prodById(l1); const own2 = s2r.ok ? await rowOf("ShopProduct", s2r.value.id) : null;
        const r24 = { setup: s1.ok && s2r.ok && !!l1 && l1 === l2 && ps0?.basePriceSatang === 1000, edit: u2.ok, priceKept: ps1?.basePriceSatang === 1000, nameKept: ps1?.name === `${TAG} r2-sh1`, ownWritten: own2?.priceSatang === 2500 };
        chk("S2.R2.4", Object.values(r24).every(Boolean), "แถวร่วมคง 1000 + ชื่อแถวแรก · ShopProduct แถวที่สอง 2500", `${flags2(r24)} · ${ps1?.basePriceSatang} · ${ps1?.name}`);
        // F6: หมวดใหม่ (ยังไม่มี PosCategory) + createItem 2 ครั้งพร้อมกัน
        const nc = await P.menuCategory.create({ data: { tenantId: rsT, unitId: RMAIN, name: `${TAG} r2-cat` } });
        const mk = (k: number) => attempt(() => menu.createItem(rsT, RMAIN, { categoryId: nc.id, stationId: rsStation.id, name: `${TAG} r2-race-${k}`, basePrice: 4000 + k }));
        const [c1, c2] = await Promise.all([mk(1), mk(2)]);
        const pcs = await q<Any>(`select id from "PosCategory" where "tenantId" = $1 and name = $2`, rsT, `${TAG} r2-cat`);
        const cats = await Promise.all([c1, c2].map(async (c) => (c.ok && c.value?.id ? (await prodById(await linkOf("MenuItem", c.value.id)))?.categoryId : null)));
        const r25 = { both: c1.ok && c1.value?.ok === true && c2.ok && c2.value?.ok === true, oneCategory: pcs.length === 1, sameCat: !!cats[0] && cats[0] === cats[1] && cats[0] === pcs[0]?.id };
        chk("S2.R2.5", Object.values(r25).every(Boolean), "สำเร็จทั้งคู่ · PosCategory 1 · สองแถวชี้หมวดเดียวกัน", `${flags2(r25)} · ${c1.ok ? "" : c1.err} ${c2.ok ? "" : c2.err} · PosCategory ${pcs.length}`);
        // F1 (static): redirect ?err= → หน้าที่อ่าน err
        const ACT = ["src/lib/modules/inventory/actions.ts", "src/lib/modules/shop/actions.ts", "src/lib/actions/booking.ts", "src/lib/actions/restaurant.ts"];
        const pagesOf = (tpl: string): string[] => {
          if (/^\/app\/sys\/\$\{[^}]+\}\?err=/.test(tpl)) return ["src/app/app/sys/[id]/page.tsx"];
          const m = /^\/app\/u\/\$\{[^}]+\}(\/[^?$]*)\?err=/.exec(tpl);
          if (m) return [`src/app/app/u/[unitSlug]${m[1]}/page.tsx`];
          const r = /^\$\{base\(unitSlug\)\}(\/[^?$]*|\$\{back\}|)\?err=/.exec(tpl);
          if (r) return r[1] === "${back}" ? ["src/app/app/u/[unitSlug]/restaurant/menu/page.tsx", "src/app/app/u/[unitSlug]/restaurant/menu/stock/page.tsx"] : [`src/app/app/u/[unitSlug]/restaurant${r[1]}/page.tsx`];
          return [`?? ${tpl}`];
        };
        const readsErr = (f: string) => {
          const t = read(f);
          return /\berr\b[^;]*=\s*await searchParams|\{[^}]*\berr\b[^}]*\}\s*=\s*(await\s+)?searchParams|\{[^}]*\berr\b[^}]*\}\s*=\s*sp\b/.test(t) && /\{err\s*&&/.test(t);
        };
        const bad6: string[] = []; let n6 = 0;
        for (const f of ACT) {
          for (const m of read(f).matchAll(/redirect\(`([^`]*\?err=[^`]*)`\)/g)) {
            n6++;
            for (const pg of pagesOf(m[1]!)) {
              if (pg === "src/app/app/sys/[id]/page.tsx") {
                const ui = read("src/lib/modules/inventory/ui.tsx");
                const hubOk = /<InvHub[^>]*err=\{err\}/.test(read(pg)) && /function InvHub\(\{[^)]*\berr\b/.test(ui) && /\{err\s*&&/.test(ui.slice(ui.indexOf("function InvHub(")));
                if (!hubOk) bad6.push(`${f.split("/").pop()} → ${pg} (InvHub ไม่รับ/ไม่แสดง err)`);
              } else if (!existsSync(pg) || !readsErr(pg)) bad6.push(`${f.split("/").pop()} → ${pg}`);
            }
          }
        }
        chk("S2.R2.6", n6 > 0 && bad6.length === 0, "ทุกปลายทาง ?err= อ่าน err และแสดง", `redirect ${n6} · ไม่แสดง ${bad6.length}: ${[...new Set(bad6)].slice(0, 5).join(" · ") || "-"}`);
      });

      // ═══ ORACLE-ADD (controller R3 ruling) ▸ S2.R3.1–S2.R3.3 · brief pos-brief-P1.1b-R3.md ═══
      await section("s2-r3", ["S2.R3.1", "S2.R3.2", "S2.R3.3"], async () => {
        const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
        const driftOf = async (ids: (string | null | undefined)[]) => {
          const want = new Set(ids.filter(Boolean) as string[]);
          const v = await attempt(() => C.verifyCatalog({ tenantIds: [cfT] }));
          return v.ok ? ((v.value?.samples ?? []) as Any[]).filter((d) => want.has(d.productId)) : null;
        };
        /** conn1 (connection แยก): UPDATE AccountProduct.salePrice ค้างไว้ไม่ commit → รัน conn2 เบื้องหลัง → รอ 1.5 วิ → commit → รอ conn2 จบ */
        const raceAp = async (apId: string, price: number, conn2: () => Promise<Any>) => {
          let release!: () => void; const gate = new Promise<void>((r) => (release = r));
          let held = false;
          const t1 = attempt(() => lane(30).$transaction(async (tx: Any) => {
            await tx.$executeRawUnsafe(`UPDATE "AccountProduct" SET "salePrice" = $1 WHERE id = $2`, price, apId);
            held = true;
            await gate;
          }, { timeout: 60_000, maxWait: 10_000 }));
          for (let i = 0; i < 100 && !held; i++) await sleep(50);
          const t2 = attempt(conn2);
          await sleep(1_500);
          const waited = await Promise.race([t2.then(() => false), sleep(10).then(() => true)]);
          release();
          return { held, waited, c1: await t1, c2: await t2 };
        };
        // H1 ข้อ 1: InvItem ที่ขายผ่าน POS แรก (มีแถวแล้ว · ยังไม่ผูก) + AP A ในสมุดที่ผูก POS (salePrice 2000)
        const y1 = await mkInv(cfT, sysC.INVENTORY, "r3-link", { costSatang: 100 });
        const a1 = await mkAp(cfT, sysC.ACCOUNT, y1, 2000, 700, null, { halfLink: true });
        const e1 = await attempt(() => C.ensureForInvItem(ctxSys(cfT, sysC.POS), y1.id));
        const r1 = await raceAp(a1.id, 2700, () => inventory.linkAccountProduct(ctxInvC, y1.id, a1.id));
        const rows1 = await prodByInv(y1.id);
        const d1 = await driftOf(rows1.map((r) => r.id));
        const s31 = {
          setup: e1.ok && r1.held, bothOk: r1.c1.ok && r1.c2.ok, linked: (await rowOf("InvItem", y1.id))?.accountProductId === a1.id,
          price: rows1.length > 0 && rows1.every((r) => r.basePriceSatang === 2700), noDrift: !!d1 && d1.length === 0,
        };
        chk("S2.R3.1", Object.values(s31).every(Boolean), "แถวของ Y = 2700 (ราคาหลัง conn1 commit) · verify ไม่มี drift",
          `${flags2(s31)} · conn2 รอ ${r1.waited} · ${r1.c1.ok ? "" : `conn1 ${r1.c1.err} · `}${r1.c2.ok ? "" : `conn2 ${r1.c2.err} · `}แถว ${rows1.map((r) => r.basePriceSatang).join(",")} · drift ${d1 ? JSON.stringify(d1.slice(0, 2)) : "verify ล้ม"}`);
        // H1 ข้อ 2: InvItem นอกคลังของ POS แรก ผูก AP A (commit แล้ว) → shop.createProduct = แถวของเว็บร้านเอง (C9b) ราคาจาก AP
        const y2 = await mkInv(cfT, fx.tInvX.id, "r3-shop", { costSatang: 100 });
        const a2 = await mkAp(cfT, sysC.ACCOUNT, y2, 3000);
        const r2 = await raceAp(a2.id, 3700, () => shop.createProduct(ctxShop, { name: `${TAG} r3-shop`, priceSatang: 1000, invItemId: y2.id }));
        const l2 = r2.c2.ok && r2.c2.value?.id ? await linkOf("ShopProduct", r2.c2.value.id) : null;
        const p2 = await prodById(l2);
        const d2 = await driftOf([l2]);
        const s32 = { setup: r2.held, bothOk: r2.c1.ok && r2.c2.ok, row: !!p2 && p2.invItemId === y2.id, price: p2?.basePriceSatang === 3700, noDrift: !!d2 && d2.length === 0 };
        chk("S2.R3.2", Object.values(s32).every(Boolean), "แถวใหม่ = 3700 (ราคาหลัง conn1 commit) · verify ไม่มี drift",
          `${flags2(s32)} · conn2 รอ ${r2.waited} · ${r2.c1.ok ? "" : `conn1 ${r2.c1.err} · `}${r2.c2.ok ? "" : `conn2 ${r2.c2.err} · `}แถว ${p2?.basePriceSatang} · drift ${d2 ? JSON.stringify(d2.slice(0, 2)) : "verify ล้ม"}`);
        // H2: 3 เลน × 5 รอบ บน AP A3 (แถว P ผูกแล้ว) · แต่ละรอบ InvItem ใหม่ (มีแถวแล้ว) ถูกผูกเข้า A3 ระหว่าง setPrice/updateProduct
        const dl = async () => Number((await q<{ d: unknown }>(`select deadlocks as d from pg_stat_database where datname = current_database()`))[0]?.d ?? -1);
        const dl0 = await dl();
        const pInv = await mkInv(cfT, sysC.INVENTORY, "r3-p", { costSatang: 100 });
        const a3 = await mkAp(cfT, sysC.ACCOUNT, pInv, 4000);
        const eP = await attempt(() => C.ensureForInvItem(ctxSys(cfT, sysC.POS), pInv.id));
        const rowP = eP.ok ? (eP.value?.id as string) : null;
        const errs3: string[] = []; const notes3: string[] = []; const ys: string[] = [];
        for (let round = 1; round <= 5 && rowP; round++) {
          const y = await mkInv(cfT, sysC.INVENTORY, `r3-y${round}`, { costSatang: 100 });
          await attempt(() => C.ensureForInvItem(ctxSys(cfT, sysC.POS), y.id));
          ys.push(y.id);
          const rs = await Promise.all([
            attempt(() => C.setPrice(ctxOwner, rowP, 4100 + round, lane(31))),
            sleep(round * 7).then(() => attempt(() => inventory.linkAccountProduct(ctxInvC, y.id, a3.id))),
            attempt(() => accProduct.updateProduct(cfT, sysC.ACCOUNT, a3.id, { name: a3.name, salePrice: 4500 + round, vatRateBp: 700 })),
          ]);
          rs.forEach((r, i) => { if (!r.ok || r.value?.ok === false) errs3.push(`รอบ${round} เลน${i + 1}: ${r.ok ? r.value?.reason : r.err}`); });
          const ap = await rowOf("AccountProduct", a3.id);
          const prices = [...(await prodByInv(pInv.id)), ...(await Promise.all(ys.map((x) => prodByInv(x)))).flat()].map((p) => p.basePriceSatang);
          notes3.push(`รอบ${round}: AP ${ap?.salePrice} · แถว ${[...new Set(prices)].join("/")}`);
        }
        await sleep(12_000); // สถิติ pg_stat ส่งช้าได้ถึง ~10 วิ
        const dl1 = await dl();
        const apEnd = await rowOf("AccountProduct", a3.id);
        const all3 = [...(await prodByInv(pInv.id)), ...(await Promise.all(ys.map((x) => prodByInv(x)))).flat()];
        const d3 = await driftOf(all3.map((r) => r.id));
        const s33 = {
          setup: !!rowP && ys.length === 5, allOk: errs3.length === 0, noDeadlockErr: !errs3.some((e) => /deadlock|40P01/i.test(e)), deadlockCounter: dl0 >= 0 && dl1 - dl0 === 0,
          equal: all3.length === 6 && all3.every((r) => r.basePriceSatang === apEnd?.salePrice), noDrift: !!d3 && d3.length === 0,
        };
        chk("S2.R3.3", Object.values(s33).every(Boolean), "ทุกเลนสำเร็จ · deadlock 0 · ทุกแถวของ A = AP.salePrice · verify ไม่ drift",
          `${flags2(s33)} · ${notes3.join(" · ")} · deadlocks +${dl1 - dl0} · ${errs3.slice(0, 3).join(" | ") || "-"} · drift ${d3 ? d3.length : "verify ล้ม"}`);
      });
    }
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
    // 3b) ตารางข้างเคียงที่ประตูเดิมสร้างเอง (รอบ oracle P1.1b) — แถวที่ไม่มีก่อนรัน
    {
      const now = await extraIdsOf();
      for (const t of ["RestaurantOrder", "AccountUnit", "InvCategory", "InvLocation", "InvSettings"]) await purge(t, [...(now[t] ?? [])].filter((id) => !extraIds0[t]?.has(id)));
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
  // ═══ R.1 / R.2 · QC4 คืนสภาพ (รอบ oracle P1.1b) ═══
  try {
    // แถวเดิมที่ค่าคืนครบทุกคอลัมน์แต่ updatedAt เด้ง (ข้อสอบสลับสิทธิ์แคชเชียร์/ตั้งค่า VAT แล้วคืนด้วย Prisma) → คืน updatedAt ด้วย SQL ตรง
    //   (ไม่ผ่าน @updatedAt) · แถวที่ค่าอื่นยังต่างไม่แตะ ⇒ R.2 แดงตามจริง
    const fpNow = await residueFp();
    const touched: Record<string, number> = {};
    for (const [t, m0] of Object.entries(resFp0)) {
      const m1 = fpNow[t] ?? new Map<string, FpRow>();
      const dt = (await colInfo(t)).get("updatedAt")?.data_type ?? "";
      const cast = /with time zone/.test(dt) ? "timestamptz" : "timestamp(3)";
      for (const [id, r0] of m0) {
        const r1 = m1.get(id);
        if (r1 && r1.h !== r0.h && r1.hNoU === r0.hNoU && r0.u !== null && dt) {
          await ex(`update "${t}" set "updatedAt" = $1::${cast} where id = $2 and "tenantId" = any($3::text[])`, r0.u, id, QC_TIDS);
          touched[t] = (touched[t] ?? 0) + 1;
        }
      }
    }
    const c1 = await residueCounts();
    const dc = [...new Set([...Object.keys(resCounts0), ...Object.keys(c1)])].filter((k) => resCounts0[k] !== c1[k]).map((k) => `${k} ${resCounts0[k] ?? "-"}→${c1[k] ?? "-"}`);
    chk("R.1", dc.length === 0, "จำนวนแถวเท่าเดิมทุกตาราง (ร้าน QC POS + ตารางแคตตาล็อกของร้านอื่น)", dc.slice(0, 12).join(" · ") || `เท่าเดิม (${Object.keys(c1).length} รายการ)`);
    const fp1 = await residueFp();
    const dfp: string[] = [];
    for (const [t, m0] of Object.entries(resFp0)) {
      const m1 = fp1[t] ?? new Map<string, FpRow>();
      let gone = 0; let chg = 0;
      for (const [id, r0] of m0) { const r1 = m1.get(id); if (!r1) gone++; else if (r1.h !== r0.h) chg++; }
      if (gone || chg) dfp.push(`${t} หาย ${gone} เปลี่ยน ${chg}`);
    }
    const tTxt = Object.entries(touched).map(([t, n]) => `${t} ${n}`).join(" ");
    console.log(`  ℹ️  [R] นับ ${Object.keys(c1).length} รายการ · ลายนิ้วมือ ${Object.values(resFp0).reduce((s, m) => s + m.size, 0)} แถว · คืน updatedAt: ${tTxt || "ไม่มี"}`);
    chk("R.2", dfp.length === 0, "แถวเดิมของร้าน QC เท่าเดิมทุกคอลัมน์", `${dfp.join(" · ") || `เท่าเดิม (${Object.values(resFp0).reduce((s, m) => s + m.size, 0)} แถว)`}${tTxt ? ` · คืน updatedAt: ${tTxt}` : ""}`);
  } catch (e) {
    const msg = firstLine(e).slice(0, 200);
    chk("R.1", false, "ตรวจได้", msg);
    chk("R.2", false, "ตรวจได้", msg);
  }
  for (const c of clients) await c.$disconnect().catch(() => null);
}

// ข้อที่ยังไม่ถูกรายงาน (ส่วนที่ควรรันแต่ไม่ถึง) = แดง · กลุ่ม S2 ที่ข้ามโดยเจตนาไม่นับ
for (const c of CHECKS) {
  if (reported.has(c.id)) continue;
  if (s2Skipped && S2_IDS.has(c.id)) continue;
  if (skippedChecks[c.id]) continue;
  chk(c.id.replace("P1.1-", ""), false, "รันถึง", "ไม่ถูกรันเลย (ล้มก่อนถึงส่วนนี้)");
}
await P.$disconnect();
const code = Q.finish({ catalogue: CHECKS.length, tag: TAG, skippedGroups: s2Skipped ? { S2: s2Skipped } : {}, skippedChecks, force: FORCE, p11bStarted, partBStarted });
process.exit(exitCode === 0 ? code : 1);
