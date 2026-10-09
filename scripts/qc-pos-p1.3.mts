// QC — POS RUN ใบ P1.3: หน้าขายใหม่ (ฝั่งเซิร์ฟเวอร์ + สัญญาข้อมูล) · เขียนก่อนสร้าง (fail-before) ในใบ P0.3 เลน 4
// requires: pos-seed
//
// สัญญา: ledger/POS-MASTER-PLAN.md แถว P1.3 (P1.2/P1.4–P1.6 = นอกขอบเขต — ดูหมายเหตุท้ายไฟล์) · ledger/DESIGN-POS.md §4 M1 + §6
//        ภาพ ledger/design-pos/01-register.png · 05-mobile.png (ก) · 19-states.png · 20-en-ipad.png
//        ledger/POS-API.md — แต่มติผู้คุมงาน R1 (1 ต.ค.): ไม่มี /api/u/[unitId]/pos/* และ X-Pos-Device ในโค้ด · P1.3 สร้างบน server action
//        ของหน้า /app/sys/[id]/pos/* ⇒ ข้อสอบนี้เรียกฟังก์ชันชั้น service ตรง (action เป็นเปลือกบางที่ต้องเรียกฟังก์ชันเหล่านี้)
//        มติ R1–R8 ของผู้คุมงาน (สำรวจโค้ด 1 ต.ค. · ledger/wo-notes/pos-P0.3-register.md หัวข้อแรก) ชนะเอกสารออกแบบเมื่อขัดกัน
//        R7: VAT ที่เก็บลงบิลเป็นของ P1.6 — ที่นี่ตรวจ VAT เฉพาะในฟังก์ชันคิดตะกร้า (แสดงบนจอ) เท่านั้น
//        docs/modules/14-pos.md §7.1 (ลำดับคิดเงิน) §9 (สิทธิ์) §11 (edge cases) §12 (QC checklist)
// ชื่อทุกตัวที่ยังไม่มีในโค้ดถูก "ตั้ง" ในไฟล์นี้ และลงทะเบียนใน ledger/wo-notes/pos-P0.3-register.md หัวข้อ
//   "Names I had to invent" — ผู้คุมงานต้องรับรองก่อนผู้สร้าง (builder) เริ่ม · ผู้สร้างห้ามแก้ข้อสอบนี้ (ORACLE-EDIT เท่านั้น)
//
// ของที่ใบ P1.3 ต้องส่ง (ข้อสอบนี้คือสัญญา):
//   src/lib/modules/pos/pricing-shared.ts   priceCart(input) — ฟังก์ชันบริสุทธิ์ (client+server ใช้ตัวเดียวกัน · ห้ามแตะ prisma)
//   src/lib/modules/pos/register.ts (เพิ่ม export)
//     registerCatalog(ctx, actor, { q?, categoryId? })            → { ok, categories[], products[] }
//     quoteRegisterCart(ctx, actor, input)                          → { ok, …ผล priceCart, lines[], vatMode, vatRateBp }
//     submitRegisterSale(ctx, actor, input, client?)                → { ok, saleId, receiptNo, grandTotalSatang, changeSatang, duplicated }
//     registerStatus(ctx, actor)                                    → { ok, unit, user{name, roleLabel}, shift|null, pendingStockCount, pendingSyncCount }
//     ctx = { tenantId, systemId (ระบบ POS), unitId } · actor = { userId, role, unitAccess, permissions } (ทรงเดียวกับ MemberActor)
//     ปฏิเสธของ register = **คืน** { ok:false, code, message } (เป็นมิตรกับ server action) — ห้าม clamp เงียบ
//     ปฏิเสธของ catalog.ts = **throw** typed error ที่มี .code คงที่ (ข้อสอบแปลงเป็น {ok:false, code} ด้วย call())
//     คำศัพท์ code ชุดเดียวกับ catalog: NOT_FOUND PERMISSION_DENIED VALIDATION|INVALID_LINE PRODUCT_NOT_FOUND PRODUCT_UNAVAILABLE
//       MEMBER_NOT_FOUND PRICE_NOT_SET PRICE_CHANGED IDEMPOTENCY_CONFLICT LINE_DISCOUNT_EXCEEDS_LINE BILL_DISCOUNT_EXCEEDS_TOTAL
//       TOO_MANY_LINES (+ DISCOUNT_EXCEEDS_LIMIT PAYMENT_MISMATCH STOCK_INSUFFICIENT จากสเปก)
//   ใช้ของใบ P1.1a (รับรองแล้ว · เลน 3): PosProduct/PosCategory + catalog.ts ctx {tenantId, systemId, actorUserId|null} + client ท้าย:
//     createProduct · updateProduct (รวม availability/unitId) · setPrice · archive · listForUnit→{items,nextCursor} · byBarcode ·
//     ensureForInvItem→{id,created} · createCategory(ctx,{name,unitId?,sortOrder?}) · ไม่มี setAvailability · PosSaleLine.productId
//   subtotalSatang = Σ ยอดบรรทัดหลังส่วนลดบรรทัด (ความหมายของโค้ด · รับรองแล้ว = แก้สเปก) · VAT: ผู้เรียกส่ง config บัญชีเข้า priceCart
//   (priceCart บริสุทธิ์) · เก็บ VAT ลงบิล = P1.6 · S6.1 (BLOCK oversell) = กลุ่มของ P1.6 มีด่าน SKIP ของตัวเอง
//
// 🔁 รอบ 3 (brief สุดท้าย ledger/pos-briefs/pos-brief-P1.3.md · มติ Q1–Q29 + Addendum · โน้ต ledger/wo-notes/pos-P1.3-oracle-r3.md):
//   Q4  หน้าใหม่อยู่หลังธง AppSystem(POS).settings.pos.registerV2 === true · อื่น ๆ = PosRegister เดิมทุกไบต์ (S5.6 S5.11 S5.12)
//   Q6/Q9 สินค้า: requiredOptionGroupCount · soldOutReason "UNAVAILABLE"|"NO_STOCK"|null (S1.23 S1.24 S3.26 S3.27)
//   Q8  pos.sale.priceOverride (OWNER/MANAGER ได้ · STAFF ไม่ได้) ตรวจที่ quote และ submit (S3.28)
//   Q12 ไม่มีคูปองใน P1.3: quote/submit ที่ client ส่ง couponCode/couponDiscountSatang = VALIDATION (S3.29)
//     ⮕ ORACLE-EDIT P1.12 (มติ Q7): couponCode ถูกตรวจจริงแล้ว (โค้ดใช้ไม่ได้ = COUPON_INVALID) · couponDiscountSatang ยัง VALIDATION ·
//       S3.42 สมาชิกที่มีส่วนลดระดับขายได้แล้ว (MEMBER_RIGHTS_UNSUPPORTED ไม่ถูกคืน)
//   Q21 registerCatalog {cursor?, limit?} → nextCursor (ปริยาย 100 · สูงสุด 500 · ลำดับคงที่) (S1.25 S1.26)
//   Q22 quote lines[i] = {productId?, unitPriceSatang, grossSatang, discountSatang, lineTotalSatang} ตามลำดับที่ส่ง (S3.30 S3.31)
//   Q23 registerStatus.user.role = OWNER|MANAGER|STAFF (S4.5) · Q25 registerVatConfig(ctx) (S4.6)
//   Addendum: ปฏิเสธ = คืน {ok:false, code, message} ไม่ throw (S3.36 S5.15) · BUSY→errors.busy INTERNAL→errors.unknown (S5.13)
//             checkCatalogWrite รับ membership ของ session (S5.15) · F15.5/F15.6 (S5.16) · client ไม่ import โมดูลเซิร์ฟเวอร์ (S5.17)
//   เงิน: re-read ราคาตอน quote+submit (S3.1 S3.5 S3.31) · Σ payMethods = ยอด (S3.6 S3.32) · idempotency (S3.14–S3.16)
//         ขอบเขตสาขา/ร้านของ productId (S3.12 S3.35) · เพดานส่วนลดปฏิเสธไม่ clamp (S2.6 S3.7 S3.33) · qty 1…9999 ≤200 บรรทัด (S3.34)
//   คืนสภาพ: นับแถว (S9.1) + ลายนิ้วมือแถวเดิมของร้าน QC (S9.2)
// 🔁 รอบ 3.1 (มติผู้คุมงานต่อคำถาม r3 · โน้ต r3 หัวข้อ "Round 3.1"): OPTIONS_REQUIRED เคร่ง (S3.26) · submit ต้องมี expectedGrandTotalSatang
//   ลำดับ คิดราคาใหม่ → คาด≠ยอด PRICE_CHANGED (พกยอดสด) → จ่าย≠ยอด PAYMENT_MISMATCH (S3.5 S3.6 S3.31 S3.37 · idempotency รวม expected S3.16)
//   · บรรทัดสินค้าขายที่สาขานี้ไม่ได้ = PRODUCT_NOT_FOUND · NOT_FOUND สงวนให้ ctx (S3.12 S3.35) · วิธีจ่าย CASH|PROMPTPAY เท่านั้น (S3.38)
//   · cashReceivedSatang ต้องมีเมื่อมีเงินสด ≥ ส่วนเงินสด · ทอน = รับ − ส่วนเงินสด (S3.39) · CONFLICT/OPTIONS_REQUIRED → คีย์ (S5.13)
//   · ไม่บังคับ pos-reg-coupon-line (S5.4) · limit/cursor ผิดรูป = VALIDATION (S3.36 S1.26) · ปิดมือชนะหมดสต็อก (S1.24 S3.27)
// 🔁 รอบ R4 (ผู้ล่าโค้ดบน 5f97add4 · มติ K1–K5 ledger/pos-briefs/pos-brief-P1.3-R4.md · โน้ต ledger/wo-notes/pos-P1.3-oracle-r4.md):
//   K1 คีย์หน้าขายเก็บเป็น 'reg2:'+คีย์ client (8–100 [A-Za-z0-9_-]) (S3.50) · K2 CONFLICT เปล่าเมื่อบิลไม่ใช่ POS สาขาเดียวกัน (S3.51)
//   K3 แข่งตอนคำขอแรกยังไม่ commit (S3.52) + client หมุนคีย์เฉพาะ resetBill (S5.21) · K4 ส่งซ้ำห้ามทอนติดลบ (S3.53)
//   K5 คำขอค้างอยู่ใน sessionStorage (S5.22) · m2 บันทึก pos.* ⇒ priceOverride (S3.54)
//   ⚙️ ปรับตัวช่วยตาม K1 (ไม่ลดความเข้มข้อเดิม): คีย์ของข้อสอบใช้ได้เฉพาะ [A-Za-z0-9_-] (KTAG แทน '.' ของ TAG · ป้ายไทย → '_') ·
//      ค้นบิลตามคีย์ = คีย์ดิบ หรือ 'reg2:'+คีย์ (keyIn — เจอทั้งสองแบบ = นับครบ ไม่หลุด) · cleanup จับคีย์ที่มี KTAG + บิลสาขา 2
//
// ขอบเขต (ไม่ซ้ำ scripts/qc-pos-register.mts 42 ข้อเดิม — ชุดนั้นยังเป็น regression ทั้งชุด ดูโน้ต):
//   S1 ข้อมูลกริด/หมวด/ค้นหา · S2 เครื่องคิดเงินตะกร้า (บริสุทธิ์) · S3 ส่งบิลฝั่งเซิร์ฟเวอร์ (X1 X2 X3 X4 X6 X8)
//   S4 แถบสถานะ · S5 สถิต (i18n · data-testid · แป้นลัด · ปุ่มแตะ · สัญญา createSale) · S9 คืนสภาพ QC4
//
// 🔴 กติกาข้อสอบ: SKIP เมื่อของ P1.1a/P1.3 ยังไม่มี (exit 0 + เหตุผล) · QC_FORCE=1 = ข้ามด่าน SKIP (ต้องแดงตามเหตุผล ไม่ crash)
//    --list = พิมพ์ทุก id โดยไม่แตะ DB · แถวชั่วคราวติดป้าย `qc-p1.3-<rand>` อยู่ในร้าน QC กาแฟเท่านั้น (สาขา sandbox ชั่วคราว
//    + ระบบ POS/คลัง ชั่วคราวที่ไม่เชื่อมบัญชี/แต้ม/สมาชิก) · ลบทั้งหมดใน finally · นับแถวร้าน QC ก่อน/หลังต้องเท่ากัน (S9.1)
//    การแข่งกันวิ่งบน PrismaClient คนละตัว (connection คนละเส้นจริง) ≥10 ขนาน หลายรอบ · เงินเป็นสตางค์ · ไม่ผูก "วันที่ N"
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { createHash, randomUUID } from "node:crypto";

const SUITE = "qc-pos-p1.3";
const ROOT = process.cwd();
const LIST = process.argv.includes("--list");
const FORCE = process.env.QC_FORCE === "1";

// ═════════════════════════ ทะเบียนข้อสอบ (id · X-group · หัวข้อ) — --list พิมพ์ชุดนี้ ═════════════════════════
// X-group: "-" = เชิงหน้าที่ล้วน · ค่าอื่น = กลุ่มบังคับใน POS-MASTER-PLAN §3
const CHECKS: readonly (readonly [string, string, string])[] = [
  // ── S1 ข้อมูลกริด/หมวด/ค้นหา (registerCatalog อ่าน PosProduct ผ่าน catalog) ──
  ["P1.3-S1.1", "-", "สาขาสีลมของร้าน QC: สินค้าที่ seed ไว้ 7 ตัว (PosProduct ของ InvItem ทั้ง 7) ขึ้นกริดครบ ตัวละ 1 แถว ไม่ซ้ำ"],
  ["P1.3-S1.2", "X4", "ราคาบนกริด = PosProduct.basePriceSatang ทุกตัว (สตางค์ Int) · อเมริกาโน่ = 6500 · สินค้า 0 บาทขึ้นกริดด้วยราคา 0 (ไม่ซ่อน ไม่เป็น null)"],
  ["P1.3-S1.3", "-", "ทรงข้อมูลสินค้าบนกริด: id invItemId name nameEn kind categoryId priceSatang sku barcode imageUrl optionGroupCount soldOut stockLeft trackStock trackStockMode · ผลมี nextCursor (แบ่งหน้า · C6)"],
  ["P1.3-S1.4", "-", "สต็อกบนการ์ด (trackStock โหมด auto · C2): ครัวซองต์/น้ำดื่ม trackStock=true stockLeft = InvItem.onHand · อเมริกาโน่/ลาเต้ (ไม่เคยรับเข้า) trackStock=false stockLeft = null ไม่ขึ้น 'หมด' · ทุกตัว trackStockMode 'auto'"],
  ["P1.3-S1.5", "-", "สาขาที่ยังไม่มีสินค้า → products [] categories [] (ข้อมูล empty state ภาพ 19ก) ไม่ throw"],
  ["P1.3-S1.6", "-", "สินค้าที่ archive แล้วไม่ขึ้นกริด (ตัวพี่น้องที่ไม่ archive ยังขึ้น)"],
  ["P1.3-S1.7", "-", "ปิดขายเฉพาะสาขา (availability=false · 86) → ยังขึ้นกริดแต่ soldOut=true (ภาพ 01 'หมด' สีจาง)"],
  ["P1.3-S1.8", "-", "สินค้านับสต็อกที่ onHand ≤ 0 → soldOut=true · onHand 2 → stockLeft 2 (ป้าย 'เหลือ 2')"],
  ["P1.3-S1.9", "-", "ค้นชื่อภาษาไทยบางส่วน 'ครัวซอง' → ครัวซองต์เนยสดตัวเดียว · มีช่องว่างหัวท้ายก็ยังเจอ"],
  ["P1.3-S1.10", "-", "ค้น SKU: ตรงตัว 'PQC-CF-WATER' → 1 · ตัวพิมพ์เล็ก 'pqc-cf-latte' → ลาเต้ · prefix 'PQC-CF-' → ครบ 7"],
  ["P1.3-S1.11", "-", "ค้นบาร์โค้ด EAN-13 '8850999000015' → น้ำดื่มตัวเดียว"],
  ["P1.3-S1.12", "-", "ค้นชื่ออังกฤษ (nameEn) ไม่สนตัวพิมพ์ 'ALMOND' → สินค้าที่ nameEn = 'Almond croissant' (ภาพ 20B)"],
  ["P1.3-S1.13", "-", "ค้นคำที่ไม่มี → products [] ไม่ error · หมวด: categoryId กรองเฉพาะหมวดนั้น · ไม่ส่ง = ทั้งหมด · หมวดมี productCount ถูก"],
  ["P1.3-S1.14", "X2", "ข้ามร้าน: ctx ร้านกาแฟ + unitId ของร้านอาหาร → ปฏิเสธ (NOT_FOUND) และไม่มี id ของร้านอื่นหลุดในผลใด ๆ"],
  ["P1.3-S1.15", "X2", "ข้ามระบบ: สาขาร้านเดียวกันที่ไม่ได้ผูกกับระบบ POS นี้ → ปฏิเสธ (NOT_FOUND)"],
  ["P1.3-S1.16", "X3", "ข้ามสาขา: แคชเชียร์ (unitAccess = สีลม) อ่านกริดสาขาอารีย์ → NOT_FOUND (404 ไม่ใช่ 403 · มติ R8) · สาขาสีลมของตัวเอง → ได้ (คู่บวก)"],
  ["P1.3-S1.17", "-", "แคตตาล็อกเกิน 200 ตัว (R4 + C6): หน้าแรกปริยาย ≤100 + nextCursor · limit 1000 ถูกบีบ ≤500 · เดินทุกหน้าได้ครบไม่ซ้ำ (>200) · ตัวท้าย ๆ ค้นเจอทั้งชื่อ · SKU · บาร์โค้ด"],
  ["P1.3-S1.18", "X2", "PosProduct ผูกสาขาอื่น (unitId ≠ สาขานี้ · มติ R3) ไม่ขึ้นกริด · unitId = null (ทุกสาขา) ขึ้น"],
  ["P1.3-S1.20", "-", "trackStock auto (C2): สินค้าผูก InvItem ที่ยังไม่เคยมีสต็อก → trackStock=false (mode auto) ไม่ขึ้น 'หมด' · รับเข้า 3 → trackStock=true stockLeft 3 · ตัดออกครบ → soldOut=true"],
  ["P1.3-S1.21", "X2", "POS สองคลัง (C3): สาขา sandbox (คลัง X) ไม่เห็นสินค้าของคลังสาขา 2 (Y) ทั้งกริด · ค้นชื่อ/SKU/บาร์โค้ด · สแกน · สาขา 2 เห็นของตัวเองแต่ไม่เห็นของคลัง X"],
  ["P1.3-S1.22", "-", "สแกนบาร์โค้ด (C5): registerScan บาร์โค้ดซ้ำ 2 ตัว → match 'choose' + products 2 ตัว ลำดับคงที่ (ไม่ใช่ตัวเก่าสุดเงียบ ๆ) · ตัวเดียว → 'one' · ไม่มี → 'none'"],
  ["P1.3-S1.19", "X4", "สินค้าที่ยังไม่ตั้งราคา (ไม่มี posPrice/salePrice) → priceSatang = null บนกริด — ห้ามเอาต้นทุนมาเป็นราคา (มติ R2)"],
  ["P1.3-S1.23", "-", "[Q6] ทุกสินค้ามี requiredOptionGroupCount (Int): กลุ่มบังคับ (minSelect ≥1) + กลุ่มเลือกได้ → optionGroupCount 2 required 1 · กลุ่มเลือกได้อย่างเดียว → 1/0 · ไม่มีกลุ่ม → 0/0 · required ≤ optionGroupCount"],
  ["P1.3-S1.24", "-", "[Q9 + มติ 3.1 ข้อ 12] ทุกสินค้ามี soldOutReason: ปิดขายสาขา (86) → 'UNAVAILABLE' · นับสต็อกหมด → 'NO_STOCK' · ทั้งปิดขายและหมด → 'UNAVAILABLE' (ปิดมือชนะ) · ขายได้ (รวมเหลือน้อย/ไม่นับสต็อก/ยังไม่ตั้งราคา) → null"],
  ["P1.3-S1.25", "-", "[Q21] แบ่งหน้า (แคตตาล็อก >500): ไม่ส่ง limit = 100 + nextCursor · limit 1000 ถูกบีบ = 500 พอดี + nextCursor · 3 หน้า (limit 100) ต่อกัน = 300 ตัวแรกของหน้า 500 ลำดับเดียวกัน (ไม่ซ้ำ ไม่ขาด) · หน้าสุดท้าย nextCursor null"],
  ["P1.3-S1.26", "X2", "[Q21 + มติ 3.1 ข้อ 9] cursor ของสาขาอื่น (สาขา 2 ของ POS เดียวกัน · ร้านอื่น) ใช้ที่สาขานี้ → VALIDATION (คืน ไม่ throw) หรือหน้าที่มีแต่ของสาขานี้ (ไม่มีของเฉพาะสาขา 2/คลัง Y/ร้านอื่น)"],
  ["P1.3-S1.27", "X2", "[3.2 ข้อ 8] ไม่เพี้ยนจากแคตตาล็อก: registerCatalog (เดินทุกหน้า) = catalog.listForUnit ทั้งชุด id และลำดับ สำหรับ OWNER · MANAGER · STAFF (สมาชิกจริงใน DB) บน fixture สาขาเฉพาะ/ทุกสาขา/archive/ปิดขาย/สาขาอื่น/หมวดซ่อน"],
  ["P1.3-S1.28", "-", "[3.2 ข้อ 8] เดินหน้าระหว่างมีการ archive / เพิ่ม / เปลี่ยนราคา ระหว่างหน้า: แถวที่ไม่ถูกแก้ไม่ซ้ำ ไม่ขาด (keyset)"],
  // ── S2 เครื่องคิดเงินตะกร้า priceCart (บริสุทธิ์ · pricing-shared.ts) ──
  ["P1.3-S2.1", "X4", "ตะกร้าภาพ 01: รวม 68,500 · ส่วนลดรายการ 1,000 · คูปอง 5,000 → ยอดสุทธิ 62,500 · VAT 7% รวมในราคา 4,089 (฿40.89 ตามภาพ)"],
  ["P1.3-S2.2", "X4", "ราคาตัวเลือก: ลาเต้ 7,500 + M 1,000 + นมโอ๊ต 1,500 × 2 → บรรทัด 20,000 (฿200 ตามภาพ)"],
  ["P1.3-S2.3", "X4", "ส่วนลดบรรทัด % (basis point · ปัดครึ่งขึ้น): 10% ของ 9,500 = 950 · 15% ของ 333 = 50 (49.95)"],
  ["P1.3-S2.4", "X4", "ส่วนลดบรรทัดเกินราคาบรรทัด → ปฏิเสธ LINE_DISCOUNT_EXCEEDS_LINE (ไม่ clamp)"],
  ["P1.3-S2.5", "X4", "ส่วนลดท้ายบิล: % คิดจากยอดหลังส่วนลดรายการ · บาทตรงตัว · เกินยอด → ปฏิเสธ BILL_DISCOUNT_EXCEEDS_TOTAL"],
  ["P1.3-S2.6", "X3", "เพดานส่วนลด maxDiscountBp=1000: (รายการ+ท้ายบิล)/รวม = 15% → ok:false DISCOUNT_EXCEEDS_LIMIT ไม่มียอดคืน (refusal not clamp) · 10% พอดี → ผ่าน · null = ไม่จำกัด"],
  ["P1.3-S2.7", "X4", "คูปองไม่นับในเพดานส่วนลด · คูปองเกินยอด → หักได้แค่ยอดที่เหลือ ยอดสุทธิ 0 (ไม่ติดลบ)"],
  ["P1.3-S2.8", "X4", "VAT แยกนอกราคา ปัดครึ่งขึ้น: net 150 → VAT 11 รวม 161 · NONE → VAT 0 รวม = net · INCLUDED → รวม = net"],
  ["P1.3-S2.9", "X4", "VAT คิดระดับบิล ไม่ใช่รายบรรทัด: INCLUDED 3×10 → 2 (รายบรรทัดจะได้ 3) · EXCLUDED 3×7 → 1 (รายบรรทัดจะได้ 0)"],
  ["P1.3-S2.10", "X4", "บรรทัดราคา 0 ได้ (ยอดบรรทัด 0) · ทั้งบิล 0 บาท → ok ยอด 0"],
  ["P1.3-S2.11", "-", "200 บรรทัดผ่านและยอดตรง · 201 บรรทัด → TOO_MANY_LINES · qty 10000 → INVALID_LINE"],
  ["P1.3-S2.12", "X4", "เงินต้องเป็นจำนวนเต็มสตางค์ไม่ติดลบ: ราคา 10.5 / ราคาติดลบ / qty 0 → INVALID_LINE"],
  ["P1.3-S2.13", "-", "บริสุทธิ์: เรียกซ้ำผลเท่ากันทุกไบต์ · ไม่แก้ object ที่ส่งเข้า · ไฟล์ไม่ import prisma/server (ใช้ฝั่ง client ได้)"],
  ["P1.3-S2.14", "X4", "สุ่ม 300 ตะกร้า (seed คงที่): Σ ยอดบรรทัด − ท้ายบิล − คูปอง (+VAT ถ้าแยก) = ยอดสุทธิ เป๊ะ · ทุกค่าเป็น Int ≥ 0"],
  ["P1.3-S2.15", "X3", "[3.2 ข้อ 4] เพดานส่วนลด vs การปัด (priceCart · STAFF 1000 bp): 10% ของ ฿33.35 · 10% ของ 5×฿33.33 · ท้ายบิล 10% ของ ฿123.45 → ผ่าน · 10.01% ของ ฿100 → DISCOUNT_EXCEEDS_LIMIT · AMOUNT = เพดานปัดครึ่งขึ้น ผ่าน · +1 สตางค์ → ปฏิเสธ"],
  // ── S3 ส่งบิลฝั่งเซิร์ฟเวอร์ (สาขา sandbox ชั่วคราว · ระบบ POS/คลังชั่วคราว ไม่เชื่อมบัญชี/แต้ม/สมาชิก) ──
  ["P1.3-S3.1", "X4", "quoteRegisterCart ใช้ราคาแคตตาล็อกฝั่งเซิร์ฟเวอร์ (unitPriceSatang ที่ client ส่งมากับสินค้าแคตตาล็อกถูกเมิน) = priceCart ของราคาจริง"],
  ["P1.3-S3.2", "X4", "ขายสำเร็จ (เจ้าของ · เงินสด · ตะกร้าเดียวกับ quote ไม่แนบราคา client): PAID + receiptNo · grandTotal = ยอด quote · Σ payments = grandTotal · subtotalSatang = Σ lineTotal (ความหมายเดิมของ createSale)"],
  ["P1.3-S3.3", "X4", "บรรทัดที่บันทึก: lineTotal/discount ตรง quote · productId = PosProduct · itemId = InvItem ของสินค้า (ตัดสต็อกตามเดิม) · ตัดสต็อก 1 ครั้งต่อบรรทัด"],
  ["P1.3-S3.4", "-", "ขายบริการจากแคตตาล็อก (InvItem kind SERVICE · มติ R5): บรรทัดเก็บ serviceId = InvItem ของบริการ + productId · itemId = null · ไม่ตัดสต็อก · ราคา = ราคาบริการ"],
  ["P1.3-S3.5", "X4", "client แก้ราคาสินค้าแคตตาล็อก (unitPrice 1 สตางค์): ยอดที่คาด/จ่ายปลอม → PRICE_CHANGED (มติ 3.1 ข้อ 2 · คืนยอดสดของเซิร์ฟเวอร์) ไม่มีบิล · จ่ายยอดจริง → ราคาที่บันทึก = ราคาเซิร์ฟเวอร์ (หรือ VALIDATION|PERMISSION_DENIED) · ไม่มีบรรทัดราคา 1 สตางค์เกิดเลย (มติ R2)"],
  ["P1.3-S3.6", "X4", "ยอดที่คาด = ยอดเซิร์ฟเวอร์ แต่จ่ายขาด/เกิน 1 สตางค์ → PAYMENT_MISMATCH · ไม่มี PosSale เกิด"],
  ["P1.3-S3.7", "X3", "แคชเชียร์ส่วนลด 15% (เพดานปริยาย STAFF 10%) → DISCOUNT_EXCEEDS_LIMIT ไม่มีบิล · เจ้าของตะกร้าเดียวกัน → PAID · แคชเชียร์ที่มี pos._maxDiscountBp=2000 → PAID"],
  ["P1.3-S3.8", "X3", "รายการกำหนดเอง (ชื่อ+ราคาเอง ไม่มี productId): แคชเชียร์ไม่มี pos.sale.priceOverride → PERMISSION_DENIED · เจ้าของ → PAID"],
  ["P1.3-S3.9", "X3", "STAFF ที่ไม่มี pos.sale.create → PERMISSION_DENIED ทั้ง quote และ submit · ไม่มีบิล"],
  ["P1.3-S3.10", "X3", "แคชเชียร์จริง (unitAccess = สีลม) ส่งบิลเข้าสาขา sandbox → NOT_FOUND ไม่มีบิล (มติ R8 · คู่บวก = แคชเชียร์ที่มีสิทธิ์สาขานี้ขายได้ใน S3.7)"],
  ["P1.3-S3.11", "X2", "ctx ร้านกาแฟ + unitId ร้านอาหาร → NOT_FOUND · ไม่มีบิลเกิดในร้านอาหาร"],
  ["P1.3-S3.12", "X2", "productId ของร้านอื่น / สินค้า archive / id มั่ว → PRODUCT_NOT_FOUND (มติ 3.1 ข้อ 3) · สินค้าปิดขายที่สาขานี้ → PRODUCT_UNAVAILABLE · ไม่มีบิล"],
  ["P1.3-S3.13", "X2", "memberId ที่ไม่ใช่ของร้านนี้ → ปฏิเสธ (MEMBER_NOT_FOUND) ไม่มีบิล"],
  ["P1.3-S3.14", "X1", "key เดิมส่งซ้ำ 2 ครั้ง → saleId เดิม · ครั้งที่ 2 duplicated=true · บิล 1 · payments 1 ชุด · ตัดสต็อก 1 ครั้ง"],
  ["P1.3-S3.15", "X1", "key เดิม 10 คำขอพร้อมกัน (connection คนละเส้น) × 3 รอบ → บิลเดียวต่อรอบ ทุกคำตอบ saleId เดียวกัน ตัดสต็อกครั้งเดียว"],
  ["P1.3-S3.16", "X1", "key เดิมแต่ตะกร้า (qty) / วิธีจ่าย / expectedGrandTotalSatang เปลี่ยน → IDEMPOTENCY_CONFLICT (ไม่ใช่บิลเดิมเงียบ ๆ) · ไม่มีบิลที่ 2 · ยอดบิลเดิมไม่เปลี่ยน · key เดิม payload เดิมยังได้บิลเดิม"],
  ["P1.3-S3.17", "X6", "10 เครื่องขายพร้อมกัน (key ต่างกัน) × 2 รอบ → receiptNo ไม่ชน ไม่ว่าง ครบ 20"],
  ["P1.3-S3.18", "X6", "ชิ้นสุดท้าย นโยบายปริยาย ALLOW_NEGATIVE: 10 เครื่องขายพร้อมกัน × 3 รอบ → PAID ครบ · onHand = 1−10 เป๊ะ (ไม่มี lost update) · OUT 10 แถว"],
  ["P1.3-S3.20", "X8", "ไม่เชื่อมบัญชี/แต้ม/สมาชิก (sandbox) → ยังขายได้ · event pos.sale.paid ประมวลผลไม่ FAILED · ไม่มี AccountJournalEntry/PointLedger ของบิล"],
  ["P1.3-S3.21", "-", "ตะกร้า 200 บรรทัดส่งได้ → PAID · บันทึก 200 บรรทัด · Σ lineTotal = subtotalSatang"],
  ["P1.3-S3.22", "X4", "createSale แบบเดิม (โมดูลอื่น: itemId + unitPrice จากผู้เรียก ไม่มี productId) ยังทำงาน · ยอด = qty×price − ส่วนลด เหมือนเดิม"],
  ["P1.3-S3.23", "X3", "สินค้ายังไม่ตั้งราคา: ขายปกติ → PRICE_NOT_SET (ไม่ขายที่ต้นทุน) · ราคาเปิด (openPrice) แคชเชียร์ไม่มี pos.sale.priceOverride → PERMISSION_DENIED · เจ้าของ → PAID ที่ราคาที่กรอก"],
  ["P1.3-S3.24", "X2", "สาขาร้านเดียวกันที่ไม่ได้ผูกกับระบบ POS นี้ → submit/quote NOT_FOUND ไม่มีบิล (มติ R8 · createSale เองไม่ตรวจคู่นี้) · คู่บวก: ตะกร้าเดียวกันที่สาขาผูกแล้ว → PAID"],
  // ── S4 แถบสถานะ (เฉพาะส่วนที่ P1.3 เป็นเจ้าของ) ──
  ["P1.3-S3.25", "X4", "trackStock ตั้งเป็น false (mode 'off') ชัดแจ้ง: ขายแล้วไม่ตัดสต็อก (OUT 0 · onHand เดิม) · กริดแสดง trackStock=false stockLeft null"],
  // ── S3 รอบ 3 (มติ Q6 Q8 Q9 Q12 Q22 + กฎเงินของ brief) ──
  ["P1.3-S3.26", "X4", "[Q6 + มติ 3.1 ข้อ 1] สินค้ามีกลุ่มตัวเลือกบังคับ: quote และ submit → OPTIONS_REQUIRED ไม่มียอด ไม่มีบิล · กลุ่มเลือกได้อย่างเดียว → quote/บิลที่ราคาฐาน"],
  ["P1.3-S3.27", "X4", "[Q9] หมดสต็อก (NO_STOCK) ยังขายได้ตามนโยบายปริยาย: PAID · OUT 1 · onHand 0 → −1 · ปิดขายสาขา (UNAVAILABLE) และทั้งปิดขาย+หมด → quote/submit PRODUCT_UNAVAILABLE ไม่มียอด ไม่มีบิล"],
  ["P1.3-S3.28", "X3", "[Q8] รายการกำหนดเอง/ราคาเปิด: STAFF ไม่มี pos.sale.priceOverride → quote PERMISSION_DENIED ทั้งสองแบบ · STAFF ที่มีคีย์ → quote+PAID ที่ราคาที่กรอก · MANAGER (ปริยายตามบทบาท) → PAID · คีย์อยู่ในแคตตาล็อกสิทธิ์"],
  ["P1.3-S3.29", "X4", "[Q12 → P1.12 ORACLE-EDIT] couponDiscountSatang จาก client → VALIDATION (ไม่เมิน ไม่เชื่อ) · couponCode ที่ใช้ไม่ได้ → quote ไม่มีส่วนลดคูปอง + memberConflicts COUPON_INVALID (หรือปฏิเสธ COUPON_INVALID) · submit COUPON_INVALID · ไม่มีบิล · ไม่มี CouponRedemption"],
  ["P1.3-S3.30", "X4", "[Q22+Q7] quote lines ตรงลำดับที่ส่ง: [สินค้า+ส่วนลด, รายการเอง, สินค้า×2 ราคา client ปลอม] → {productId?, unitPriceSatang (ราคาเซิร์ฟเวอร์), grossSatang, discountSatang, lineTotalSatang} ทุกช่อง Int · subtotal = Σ gross ก่อนส่วนลดบรรทัด"],
  ["P1.3-S3.31", "X4", "ราคาเปลี่ยนระหว่าง quote กับ submit (มติ 3.1 ข้อ 2): expectedGrandTotalSatang เก่า → PRICE_CHANGED (จ่ายยอดเก่าหรือยอดใหม่ก็ตาม) พร้อมยอด/บรรทัดสดของเซิร์ฟเวอร์ · ไม่มีบิล · quote ใหม่ได้ราคาใหม่ · คาด+จ่ายยอดใหม่ → PAID ที่ราคาใหม่ · ไม่มีบรรทัดราคาเก่า"],
  ["P1.3-S3.32", "X4", "Σ payMethods = ยอดเป๊ะ (หลายวิธี): เงินสด+พร้อมเพย์ ครบ → PAID 2 แถวรวม = ยอด · ขาด 1 สตางค์ → PAYMENT_MISMATCH · ยอดติดลบชดเชย / เศษสตางค์ / ไม่มีวิธีจ่าย → ปฏิเสธ · ไม่มีบิล"],
  ["P1.3-S3.33", "X3", "เพดานส่วนลดที่ quote (ปฏิเสธ ไม่ clamp): STAFF ส่วนลดบรรทัด 15% / ท้ายบิล 15% / ท้ายบิลเกิน 10% 1 สตางค์ → DISCOUNT_EXCEEDS_LIMIT ไม่มียอด · 10% พอดี → 5,850 · บรรทัดติดลบ/บิลติดลบ → ปฏิเสธ quote+submit ไม่มีบิล"],
  ["P1.3-S3.34", "X4", "qty ฝั่งเซิร์ฟเวอร์: 0 / −1 / 1.5 / 10000 / \"2\" → INVALID_LINE|VALIDATION · 9999 → quote ได้ (gross 9999×ราคา) · submit qty 10000 / 201 บรรทัด → ปฏิเสธ ไม่มีบิล · 201 บรรทัด quote → TOO_MANY_LINES"],
  ["P1.3-S3.35", "X2", "ขอบเขตสาขา/ร้านของ productId: สินค้าเฉพาะสาขา 2 · ของคลังสาขา 2 · ของร้านอื่น → quote/submit PRODUCT_NOT_FOUND (มติ 3.1 ข้อ 3) ไม่มียอด/บรรทัด/ชื่อรั่ว ไม่มีบิล · คู่บวก: สินค้าสาขา 2 quote ที่สาขา 2 ได้"],
  ["P1.3-S3.36", "-", "[Addendum + มติ 3.1 ข้อ 9] ปฏิเสธ = คืน {ok:false, code, message} ไม่ throw: limit 0 / 1.5 / \"10\" / cursor มั่ว → VALIDATION · q มี NUL → VALIDATION หรือ ok · quote lines ผิดชนิด · submit input null · status unitId มี NUL"],
  ["P1.3-S3.37", "X4", "[มติ 3.1 ข้อ 2] expectedGrandTotalSatang: ไม่ส่ง / 6500.5 / −1 / สตริง → VALIDATION · คาด = ยอดเซิร์ฟเวอร์แต่จ่ายต่าง → PAYMENT_MISMATCH · คาดผิดและจ่ายผิด → PRICE_CHANGED (ตรวจก่อน) · ไม่มีบิล"],
  ["P1.3-S3.38", "X4", "[มติ 3.1 ข้อ 4 · ORACLE-EDIT P1.6 §8.7] TRANSFER / CARD → PAID (P1.6 R2) · DEPOSIT / ROOM_CHARGE / รหัสมั่ว → VALIDATION ไม่มีบิล · PROMPTPAY ล้วน (ไม่ส่ง cashReceived) → PAID เงินทอน 0"],
  ["P1.3-S3.39", "X4", "[มติ 3.1 ข้อ 4] เงินสด: ไม่ส่ง cashReceivedSatang / รับน้อยกว่าส่วนเงินสด 1 สตางค์ → PAYMENT_MISMATCH ไม่มีบิล · เงินสด 4,000 + พร้อมเพย์ รับ 5,000 → PAID changeSatang 1,000 (คิดจากส่วนเงินสด)"],
  ["P1.3-S3.40", "X1", "[3.2 ข้อ 1] idempotency ไม่ขึ้นกับลำดับบรรทัด: [ราคาเปิด 60.00 ของ P, P ปกติ] สลับลำดับ → ok duplicated บิลเดียว · ต่างจริง (สินค้าอื่นราคาเท่ากัน / สมาชิกอื่น / แบ่งส่วนลดต่างแต่ยอดเท่า / แบ่งวิธีจ่ายต่าง) → IDEMPOTENCY_CONFLICT พร้อม saleId ของบิลเดิม"],
  ["P1.3-S3.41", "X1", "[3.2 ข้อ 2] ส่งซ้ำ key ของบิลที่ VOIDED แล้ว → ไม่ใช่ ok: IDEMPOTENCY_CONFLICT พร้อม saleId และสถานะบิล (VOIDED)"],
  ["P1.3-S3.42", "X8", "[3.2 ข้อ 3 → P1.12 ORACLE-EDIT] สมาชิกที่ระดับมีส่วนลดอัตโนมัติ → quote ok + tierDiscountSatang > 0 (MEMBER_RIGHTS_UNSUPPORTED ไม่ถูกคืนแล้ว) · submit ตามยอด quote → PAID ส่วนลดระดับ = quote · สมาชิกที่ระดับไม่มีส่วนลด → แนบและขายได้"],
  ["P1.3-S3.43", "X4", "[3.2 ข้อ 5] รูปวิธีจ่าย: มีรายการยอด 0 → VALIDATION · บิลยอด 0 (ลด 100% โดย OWNER / ราคาเปิด 0 ที่มีสิทธิ์) ส่งวิธีจ่ายว่าง → PAID · วิธีจ่ายว่างกับยอด ≠ 0 → PAYMENT_MISMATCH"],
  ["P1.3-S3.44", "X1", "[3.2 ข้อ 6] ส่งซ้ำ payload เดิมทุกไบต์ → changeSatang เท่าคำตอบแรก (duplicated)"],
  ["P1.3-S3.45", "X4", "[3.2 ข้อ 9] สุ่ม ≥500 ตะกร้า (seed คงที่ · ส่วนลด/จำนวน/ราคาเปิด/รายการเอง · OWNER+STAFF): priceCart ฝั่ง client = quoteRegisterCart ทุกช่องยอดและทุกบรรทัด (หรือปฏิเสธรหัสเดียวกัน) · 0 ต่าง"],
  ["P1.3-S3.46", "X8", "[3.2 ข้อ 10] ผลข้างเคียงเทียบทางเดิม (สินค้านับสต็อก): movement เดียวกัน · ชนิด outbox เดียวกัน · ข้อมูลเข้า bridge บัญชีเดียวกัน · COGS GL เท่ากัน · ตรึงความต่างที่รับรอง: AUTO ไม่เคยมีสต็อก ขายไม่ตัด (C2) · บริการ serviceId = InvItem ไม่ตัดสต็อก (R5)"],
  ["P1.3-S3.47", "X3", "[3.2 ข้อ 12] STAFF ที่มี wildcard pos.* ตั้งราคาเปิดได้ (PAID) · STAFF ที่มีแค่ pos.sale.create → PERMISSION_DENIED"],
  ["P1.3-S3.48", "X1", "[3.2 ข้อ 7] idempotencyKey: ว่าง / ช่องว่างล้วน / ไม่ใช่สตริง / ยาว 101 → VALIDATION ไม่มีบิล · ยาว 100 → PAID"],
  ["P1.3-S3.49", "X3", "[3.2 ข้อ 4] เพดานส่วนลด vs การปัดที่ quote ของเซิร์ฟเวอร์ (STAFF): กรณีเดียวกับ S2.15 ให้ผลเดียวกัน"],
  // ── S3 รอบ R4 (ผู้ล่าโค้ด 5f97add4 · มติ K1–K5 ใน ledger/pos-briefs/pos-brief-P1.3-R4.md) ──
  ["P1.3-S3.50", "X1", "[R4 K1] คีย์หน้าขายอยู่ใน namespace ของตัวเอง (เก็บ 'reg2:'+คีย์): submit คีย์ hotel-sale-<id> → บิลเก็บ reg2:… ไม่ยึดคีย์ดิบ · เช็คเอาท์โรงแรม (createSale HOTEL คีย์เดียวกัน) ได้บิลใหม่ของตัวเอง · บิลโรงแรมมาก่อน → submit ได้บิลใหม่ ไม่เจอ/ไม่รั่วบิลโรงแรม · rental-/rental-deposit-/booking-deposit- ไม่ถูกยึด · คีย์ 8–100 [A-Za-z0-9_-] (7 ตัว · จุด · โคลอน 'reg2:' · ไทย · ช่องว่าง → VALIDATION ไม่มีบิล · 8 ตัว / UUID → PAID)"],
  ["P1.3-S3.51", "X2", "[R4 K2] IDEMPOTENCY_CONFLICT พก saleId/receiptNo/saleStatus เฉพาะบิล POS สาขาเดียวกันที่ผู้ขอมองเห็น: คีย์ของสาขา 2 ใช้ที่สาขา sandbox (เจ้าของ · แคชเชียร์ · payload เดิม/ต่าง) → CONFLICT เปล่า ไม่มี id/เลขใบเสร็จ/unitId ของสาขา 2 · บิลโมดูลอื่น (HOTEL) ที่คีย์ reg2:… สาขาเดียวกัน → CONFLICT เปล่า ไม่มีบิลที่ 2 · คู่บวก: สาขา 2 payload เดิม = duplicated · payload ต่าง = CONFLICT + saleId"],
  ["P1.3-S3.52", "X1", "[R4 K3] คำขอแรกค้าง (ตัวนับใบเสร็จถูกล็อกจาก connection อื่น) · ราคาเปลี่ยน · ส่งตะกร้าที่คิดราคาใหม่ด้วยคีย์เดิม (ค้างเช่นกัน) → ปล่อยล็อก: บิล PAID เดียวของคีย์ · คำตอบหนึ่ง ok อีกคำตอบ duplicated หรือ IDEMPOTENCY_CONFLICT (saleId เดียวกัน) · ไม่มี THROW/INTERNAL/BUSY · Σ จ่าย = ยอดบิล"],
  ["P1.3-S3.53", "X4", "[R4 K4 · มติ r4 ข้อ 3] ส่งซ้ำคีย์เดิมด้วย cashReceivedSatang 0 / รับขาด 1 สตางค์ / ไม่ส่ง → PAYMENT_MISMATCH · ติดลบ → VALIDATION (ตรวจเหมือนครั้งแรก ก่อนดูคีย์ · ห้าม ok แม้ทอน ≥ 0) · บิลเดียว · ส่งซ้ำ payload เดิมยังทอนเท่าเดิม"],
  ["P1.3-S3.54", "X3", "[R4 m2 · คงมติ S3.47] STAFF ที่มี wildcard pos.* ได้ pos.sale.priceOverride: quote + PAID รายการกำหนดเอง (บันทึกพฤติกรรม — เปิด V2 = STAFF pos.* ตั้งราคาเองได้ · อยู่ใน checklist deploy)"],
  ["P1.3-S4.1", "-", "registerStatus: unit.name · user.name · roleLabel เป็นภาษาคน (ไม่ใช่ OWNER/STAFF ดิบ) · pendingSyncCount = 0 (ออฟไลน์ P3)"],
  ["P1.3-S4.2", "-", "ยังไม่มีกะ (PosShift ของ P1.9 ยังไม่มี/ไม่เปิด) → shift = null ไม่ throw"],
  ["P1.3-S4.3", "X7", "pendingStockCount ('รอตัดสต็อก'): บิลวันนี้ (ตัดวันเวลาไทย +07:00) ที่ตัดสต็อกครบ → 0 · บิลที่ยังไม่ตัด (createSale ใน tx ผู้อื่น) → นับ 1"],
  ["P1.3-S4.4", "X2", "registerStatus ข้ามร้าน (unit ร้านอาหาร) → NOT_FOUND · แคชเชียร์สาขาอื่น → NOT_FOUND · สาขาตัวเอง → ok (คู่บวก)"],
  ["P1.3-S4.5", "-", "[Q23] registerStatus.user.role = รหัสบทบาท OWNER · MANAGER · STAFF ตาม actor (roleLabel ภาษาคนยังอยู่ · S4.1)"],
  ["P1.3-S4.6", "X4", "[Q25] registerVatConfig(ctx) = {mode, rateBp} เดียวกับ vatMode/vatRateBp ของ quote (สาขา sandbox และสาขาสีลม) · mode ∈ INCLUDED|NONE"],
  ["P1.3-S4.7", "X7", "[3.2 ข้อ 11] pendingStockCount: บิล PAID วันนี้ที่บรรทัดผูกสต็อกยังไม่มี movement pos-consume-<sale>-<line> → +1 · ตัดด้วยคีย์นั้นแล้ว → กลับเท่าเดิม"],
  // ── S5 สถิต (ไม่แตะ DB) ──
  ["P1.3-S5.1", "-", "ข้อความหน้าขายครบ 2 ภาษา: ทุกคีย์ pos.register.* ที่จอใช้ (รายการในโน้ต) มีทั้ง th และ en (F15.4)"],
  ["P1.3-S5.2", "-", "ข้อความ en ไม่มีอักษรไทย · th ไม่ว่าง ไม่ใช่ชื่อคีย์/enum ดิบ · ตัวแปร ICU {x} ตรงกันทั้งสองภาษา · ต้นไม้คีย์ pos.register.* th = en (A6)"],
  ["P1.3-S5.3", "-", "ไฟล์ UI หน้าขายใหม่ (มี data-testid=\"pos-reg-…\") ไม่มีข้อความไทยฮาร์ดโค้ดนอกคอมเมนต์"],
  ["P1.3-S5.4", "-", "data-testid ทุกตัวของภาพ 01 (+ แถบตะกร้ามือถือ 05ก) มีในโค้ดหน้าขาย"],
  ["P1.3-S5.5", "-", "ปุ่ม/ช่องที่กดได้ของภาพ 01 มีแถวใน scripts/pos-ui-inventory.json (page /app/sys/[id]/pos/register · roles)"],
  ["P1.3-S5.6", "-", "[Q4] หนี้ปุ่มไร้ testid: register/page.tsx = 0 (หรือไม่มีแถวหนี้) · register-ui.tsx (จอเดิมหลังธง) ≤ baseline 22 ได้ตราบที่ธงยังอยู่"],
  ["P1.3-S5.7", "X11", "แป้นลัด F2 ค้นหา · F4 ชำระ · F8 พักบิล · Esc ล้าง มีตัวจับ keydown ในโค้ดหน้าขาย [static]"],
  ["P1.3-S5.8", "X11", "ช่องค้นหา/สแกน (pos-reg-search) autofocus และโฟกัสกลับหลังเพิ่มสินค้า [static]"],
  ["P1.3-S5.9", "X11", "ปุ่มหลัก (ชำระ · หมวด · การ์ดสินค้า · +/− จำนวน · พักบิล · บิลที่พัก · สมาชิก · รายการเอง · สแกนกล้อง) มีคลาสสูง ≥44px [static heuristic · ยืนยันจริงที่ visual]"],
  ["P1.3-S5.10", "X4", "สัญญา createSale/voidSale เข้ากันได้ย้อนหลัง (F15.2 ของ scripts/fitness-pos.mts เขียว) — 6 โมดูลที่เรียกไม่พัง"],
  ["P1.3-S5.11", "-", "[Q4] ธง: register/page.tsx เลือกจอใหม่เมื่อ settings.pos.registerV2 === true เท่านั้น (อื่น ๆ = <PosRegister> เดิม) · ด่านสิทธิ์ HF-POS-PAGES คงอยู่ · seed QC ตั้ง registerV2: true [static]"],
  ["P1.3-S5.12", "-", "[Q4] จอเดิมไม่ถูกแตะ: register-ui.tsx และ actions/pos.ts ตรงไบต์กับฐาน a670d313 (sha256) · แถวทะเบียนจอเดิม 3 แถวยังอยู่ [static · regression guard]"],
  ["P1.3-S5.13", "-", "[Addendum+§4.6+มติ 3.1 ข้อ 5] refusalMessageKey(code): ทุกรหัสในคำศัพท์ได้คีย์ตามตารางสเปก · BUSY → errors.busy · CONFLICT → errors.conflict · OPTIONS_REQUIRED → errors.optionsRequired · INTERNAL/UNKNOWN/รหัสไม่รู้จัก → errors.unknown · ทุกคีย์ที่คืนมีทั้ง th+en"],
  ["P1.3-S5.14", "-", "register-shared.ts บริสุทธิ์ (import ค่าได้แค่ ./*-shared · @/lib/modules/pos/*-shared · @/lib/ui/money สำหรับ moneyText) · REGISTER_MAX_LINES 200 · MAX_QTY 9999 · LOW_STOCK 5 (Q10) · PAGE_SIZE 100 · moneyText 8550 → ฿85.50 · 62500 → ฿625 · −1000 → −฿10"],
  ["P1.3-S5.15", "-", "[Addendum+G10] register-actions.ts: \"use server\" · export เฉพาะ async function (4 action ตามสเปก) · ทุกตัวเรียก requireTenant + มี catch · ไม่มี throw · checkCatalogWrite รับ membership ของ session ไม่ใช่ object ที่ประกอบเอง [static]"],
  ["P1.3-S5.16", "-", "[Addendum] โค้ดหน้าขาย P1.3 ไม่มีตัวบ่งชี้ระบบ CATALOG_SYSTEM_ACTOR เลย · ไม่ import scripts/** · fitness F15.1 F15.5 F15.6 เขียว"],
  ["P1.3-S5.17", "-", "[G9] ไฟล์ \"use client\" ของหน้าขายไม่ import โมดูลเซิร์ฟเวอร์ (register.ts · catalog · service · core/db · prisma · next/headers · core/context) [static]"],
  ["P1.3-S5.18", "-", "[3.2 ข้อ 13 · Q24] register.ts export registerScan ⇒ register-actions.ts export registerScanAction (async · requireTenant) [static]"],
  ["P1.3-S5.19", "-", "[B2.1 · Q4] รางไอคอนของ /pos/register ขึ้นกับธง: isRailPath บังคับรางหน้าขายเฉพาะ id ที่ layout ส่งมา (posRegisterV2On) · AppShell+AppMain ส่ง id ต่อ · ไม่มี regex หน้าขายแบบไม่มีเงื่อนไข ⇒ ธงปิด = shell เท่า main [static]"],
  ["P1.3-S5.20", "-", "[B2.2 รีวิว B2] จอขายกันพลาดระดับซอร์ส: เพิ่มสินค้าใช้ setCart แบบฟังก์ชัน + ผลสแกนเช็กรุ่นบิล · openPay ไม่ซ้อนกล่องชำระ · หลังม่าน inert + RegisterDialog กักโฟกัส · ยืนยันชำระปิดระหว่างรอ quote · beforeunload ตอน sending/unknown · สแกน none/choose มีข้อความ · Esc ข้าม isComposing · แถวปุ่มรอง ≥40px · [B2.3] โฟกัสค้นหาหลัง commit (ไม่เรียกข้าง pop/setLayers([])) · quote ล้มแสดงในกล่องชำระ [static]"],
  ["P1.3-S5.21", "X1", "[R4 K3] RegisterScreen.tsx หมุนคีย์ (ตัวสร้างคีย์ที่เรียก randomUUID · setIdemKey(newKey…)) เฉพาะใน resetBill เท่านั้น · ปฏิเสธ/ไม่แน่ใจใน send ไม่หมุนคีย์และไม่เรียก resetBill/nextSale · ไฟล์อื่นของหน้าขายไม่สร้างคีย์เอง [static]"],
  ["P1.3-S5.22", "X1", "[R4 K5] คำขอที่ค้าง (คีย์ + payload + phase) เก็บใน sessionStorage คีย์ตาม systemId+unitId: setItem/getItem/removeItem · ทุกการแตะ sessionStorage อยู่ใน try (private mode) · เก็บเป็น JSON · โหลดกลับ (JSON.parse) แล้วขึ้นสถานะ 'unknown' (ลองซ้ำคีย์เดิม) [static]"],
  // ── S6 กลุ่มแยกของ P1.6 (SKIP เองจนกว่าโค้ดจะอ่าน settings.pos.stock.oversellPolicy · มติผู้คุมงาน 1 ต.ค. ข้อ 4) ──
  ["P1.3-S6.1", "X6", "[P1.6] ชิ้นสุดท้าย นโยบาย BLOCK (settings.pos.stock.oversellPolicy): 10 เครื่องพร้อมกัน × 3 รอบ → PAID 1 · ที่เหลือ STOCK_INSUFFICIENT · onHand 0 · ผู้แพ้ไม่มีบิล"],
  // ── S9 คืนสภาพ ──
  ["P1.3-S9.1", "-", "QC4 คืนสภาพ: จำนวนแถวของร้าน QC POS ทั้งสอง (ทุกตารางที่ข้อสอบแตะ) ก่อน = หลัง · ตัวนับใบเสร็จสาขาจริงไม่ขยับ"],
  ["P1.3-S9.2", "-", "QC4 ลายนิ้วมือ: แถวเดิมของร้าน QC POS (PosProduct · PosCategory · InvItem · AppSystem รวม settings · AppSystemUnit · BusinessUnit · Membership · PosReceiptCounter) ทุกคอลัมน์ ก่อน = หลัง"],
] as const;

if (LIST) {
  console.log(`${SUITE} — ${CHECKS.length} ข้อ (id · X · หัวข้อ)`);
  for (const [id, x, t] of CHECKS) console.log(`${id}\t${x}\t${t}`);
  const byX = new Map<string, number>();
  for (const [, x] of CHECKS) byX.set(x, (byX.get(x) ?? 0) + 1);
  console.log(`X-coverage: ${[...byX.entries()].map(([k, v]) => `${k}=${v}`).join(" ")}`);
  process.exit(0);
}

// ═════════════════════════ ตัวช่วยทั่วไป ═════════════════════════
const TITLE = new Map(CHECKS.map(([id, , t]) => [id, t]));
const results = new Map<string, { ok: boolean; expected: string; actual: string }>();
function chk(id: string, ok: unknown, expected: unknown, actual: unknown): boolean {
  if (!TITLE.has(id)) throw new Error(`ข้อสอบเรียก id ที่ไม่ได้ลงทะเบียน: ${id}`);
  const r = { ok: !!ok, expected: String(expected), actual: String(actual) };
  results.set(id, r);
  console.log(`  ${r.ok ? "✅" : "❌"} [${id}] ${TITLE.get(id)}${r.ok ? "" : ` — expected ${r.expected} | actual ${r.actual}`}`);
  return r.ok;
}
const skippedChecks = new Map<string, string>();
function skipCheck(id: string, reason: string) {
  skippedChecks.set(id, reason);
  console.log(`  ⏭️  [${id}] ${TITLE.get(id)} — SKIPPED: ${reason}`);
}
const rd = (p: string) => (existsSync(join(ROOT, p)) ? readFileSync(join(ROOT, p), "utf8") : "");
const short = (v: unknown, n = 220) => {
  let s: string;
  try {
    s = typeof v === "string" ? v : JSON.stringify(v);
  } catch {
    s = String(v);
  }
  return (s ?? "undefined").slice(0, n);
};
/** ปัดครึ่งขึ้นของ num/den (num ≥ 0, den > 0) — ตัวตรวจคิดเอง ไม่ยืมของผู้สร้าง */
const rhu = (num: number, den: number) => Math.floor((2 * num + den) / (2 * den));
/** รหัสปฏิเสธจากผลแบบ {ok:false, code} หรือ error ที่มี .code */
const codeOf = (r: Any): string => (r && r.ok === false ? String(r.code ?? "NO_CODE") : r && r.ok === true ? "OK" : "UNKNOWN");
const refused = (r: Any, codes: string[]) => r?.ok === false && codes.includes(String(r.code));

/** เรียกฟังก์ชันของผู้สร้างแบบไม่ crash: ไม่มีฟังก์ชัน = {ok:false, code:"MISSING:<name>"} · throw = {ok:false, code:e.code|THROW} */
async function call(mod: Any, name: string, ...args: unknown[]): Promise<Any> {
  const fn = mod?.[name];
  if (typeof fn !== "function") return { ok: false, code: `MISSING:${name}`, message: `ยังไม่มีฟังก์ชัน ${name}` };
  try {
    const r = await fn(...args);
    return r;
  } catch (e) {
    const err = e as { code?: unknown; message?: unknown };
    return { ok: false, code: String(err?.code ?? "THROW"), message: String(err?.message ?? e).slice(0, 200), threw: true };
  }
}
function callSync(mod: Any, name: string, ...args: unknown[]): Any {
  const fn = mod?.[name];
  if (typeof fn !== "function") return { ok: false, code: `MISSING:${name}` };
  try {
    return fn(...args);
  } catch (e) {
    return { ok: false, code: String((e as { code?: unknown })?.code ?? "THROW"), message: String((e as Error)?.message ?? e).slice(0, 200), threw: true };
  }
}

// ═════════════════════════ 1. env (QC4 เท่านั้น) ═════════════════════════
const envMod = (await import("./pos-qc-env.mjs" as string)) as Any;
envMod.loadPosQcEnv(SUITE);
const PQC = envMod.PQC as Any;

// ═════════════════════════ 2. ด่าน SKIP (ของใบ P1.1a / P1.3 ยังไม่มี) ═════════════════════════
const regSrc = rd("src/lib/modules/pos/register.ts");
const NEED_FILES = ["src/lib/modules/pos/catalog.ts", "src/lib/modules/pos/pricing-shared.ts"];
const NEED_EXPORTS = ["registerCatalog", "registerScan", "quoteRegisterCart", "submitRegisterSale", "registerStatus"];
const missingFiles = NEED_FILES.filter((f) => !existsSync(join(ROOT, f)));
const missingExports = NEED_EXPORTS.filter((n) => !new RegExp(`export\\s+(async\\s+)?function\\s+${n}\\b|export\\s+const\\s+${n}\\b`).test(regSrc));
const { prisma } = (await import("@/lib/core/db")) as Any;
const P = prisma as Any;
const hasPosProduct = typeof P.posProduct?.findMany === "function";
const hasPosCategory = typeof P.posCategory?.findMany === "function";
let scope: Any = null;
try {
  scope = await envMod.resolvePosScope(prisma, "coffee");
} catch (e) {
  console.log(`  (resolvePosScope ล้ม: ${(e as Error).message.slice(0, 120)})`);
}
let restoScope: Any = null;
try {
  restoScope = await envMod.resolvePosScope(prisma, "resto");
} catch {
  /* ไม่มีก็ได้ — ข้อข้ามร้านจะใช้ id ปลอมแทน */
}
const E: Any = existsSync(join(ROOT, PQC.expectedPath)) ? JSON.parse(rd(PQC.expectedPath)) : null;

// ── A5: นับแถวของร้าน QC POS (อ่านอย่างเดียว) — ใช้ทั้งตอน SKIP (พิสูจน์ว่าไม่แตะ) และตอนรันจริง (S9.1) ──
const COUNT_MODELS = [
  "posSale", "posSaleLine", "posPayment", "posReceiptCounter", "outboxEvent", "invItem", "invMovement", "invLocationStock",
  "appSystem", "appSystemUnit", "businessUnit", "auditLog", "accountJournalEntry", "pointLedger", "customer", "couponRedemption",
  "posProduct", "posCategory",
  // รอบ 3: fixture กลุ่มตัวเลือก (Q6) เขียน MenuOptionGroup/Choice + PosProductOptionGroup ตรง (catalog ยังไม่มี API ผูกกลุ่ม)
  "menuOptionGroup", "menuOptionChoice", "posProductOptionGroup", "recipeLine",
  // รอบ 3.2: ระดับสมาชิกชั่วคราวของ S3.42
  "memberTierDef", "memberTierBenefit",
] as const;
/** S9.2 ลายนิ้วมือ: แถวเดิมของร้าน QC (ทุกคอลัมน์) — จับ "แก้แถวที่ข้อสอบไม่ได้สร้าง" ที่การนับแถวมองไม่เห็น (เช่นราคา/ธง/สต็อกของสาขาจริง) */
const FP_MODELS = ["posProduct", "posCategory", "invItem", "appSystem", "appSystemUnit", "businessUnit", "membership", "posReceiptCounter"] as const;
async function fingerprint(): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const tids = envMod.PQC_TENANT_IDS as string[];
  for (const m of FP_MODELS) {
    const d = P[m];
    if (typeof d?.findMany !== "function") {
      out[m] = "absent";
      continue;
    }
    try {
      const rows = (await d.findMany({ where: { tenantId: { in: tids } }, orderBy: { id: "asc" } })) as Any[];
      out[m] = `${rows.length}:${createHash("sha256").update(JSON.stringify(rows)).digest("hex").slice(0, 16)}`;
    } catch (e) {
      out[m] = `err:${(e as Error).message.slice(0, 40)}`;
    }
  }
  return out;
}
async function snapshotCounts(): Promise<Record<string, number | string>> {
  const out: Record<string, number | string> = {};
  for (const tid of envMod.PQC_TENANT_IDS as string[]) {
    for (const m of COUNT_MODELS) {
      const d = P[m];
      if (typeof d?.count !== "function") {
        out[`${tid}.${m}`] = "absent";
        continue;
      }
      try {
        out[`${tid}.${m}`] = await d.count({ where: { tenantId: tid } });
      } catch (e) {
        out[`${tid}.${m}`] = `err:${(e as Error).message.slice(0, 40)}`;
      }
    }
    try {
      const rows = (await P.posReceiptCounter.findMany({ where: { tenantId: tid }, select: { unitId: true, period: true, seq: true } })) as Any[];
      out[`${tid}.receiptSeqSum`] = rows.reduce((s, r) => s + Number(r.seq), 0);
    } catch {
      out[`${tid}.receiptSeqSum`] = "err";
    }
  }
  return out;
}
const countsBefore = await snapshotCounts();

const skipReasons: string[] = [];
if (!hasPosProduct) skipReasons.push("ตาราง PosProduct ของ P1.1a ยังไม่มีใน Prisma client");
if (!hasPosCategory) skipReasons.push("ตาราง PosCategory ของ P1.1a ยังไม่มีใน Prisma client");
if (missingFiles.length) skipReasons.push(`ไฟล์ยังไม่มี: ${missingFiles.join(", ")}`);
if (missingExports.length) skipReasons.push(`src/lib/modules/pos/register.ts ยังไม่มี export: ${missingExports.join(", ")}`);
if (!scope) skipReasons.push("ชุดข้อมูล QC POS (ร้านกาแฟ) ยังไม่ถูก seed บน DB นี้ — รัน scripts/seed-pos-qc.mts ก่อน (เจ้าของคือเลน 1)");

if (skipReasons.length > 0 && !FORCE) {
  console.log(`⏭️  SKIPPED — ${SUITE}: ของใบ P1.1a/P1.3 ยังไม่มี (ถูกต้องสำหรับข้อสอบที่เขียนก่อนสร้าง)`);
  for (const r of skipReasons) console.log(`   • ${r}`);
  console.log(`   ข้อมูล: seed ร้านกาแฟ ${scope ? "มี" : "ไม่มี"} · seed ร้านอาหาร ${restoScope ? "มี" : "ไม่มี"} · ข้อสอบ ${CHECKS.length} ข้อ (ดู --list) · QC_FORCE=1 = รันทั้งที่ยังไม่มีของ (ต้องแดงตามเหตุผล)`);
  console.log(`   A5 (อ่านอย่างเดียว) จำนวนแถวร้าน QC POS: ${JSON.stringify(countsBefore)}`);
  console.log(`JSON_SUMMARY ${JSON.stringify({ suite: SUITE, total: 0, passed: 0, failed: [], skipped: true, reason: skipReasons, registered: CHECKS.length, seed: { coffee: !!scope, resto: !!restoScope }, a5: countsBefore })}`);
  await P.$disconnect?.().catch?.(() => {});
  process.exit(0);
}
if (FORCE && skipReasons.length) console.log(`⚠️  QC_FORCE=1 — ข้ามด่าน SKIP ทั้งที่ยังขาด: ${skipReasons.join(" | ")} (คาด: แดงตามเหตุผล ไม่ crash)`);
const fpBefore = await fingerprint();

// ═════════════════════════ 3. โหลดโมดูล (ไม่มี = null → ข้อที่ใช้แดงด้วยเหตุ MISSING) ═════════════════════════
const tryImport = async (p: string): Promise<Any> => {
  try {
    return await import(p as string);
  } catch (e) {
    console.log(`  (โหลด ${p} ไม่ได้: ${(e as Error).message.slice(0, 120)})`);
    return null;
  }
};
const pricing = await tryImport("@/lib/modules/pos/pricing-shared");
const regShared = existsSync(join(ROOT, "src/lib/modules/pos/register-shared.ts")) ? await tryImport("@/lib/modules/pos/register-shared") : null;
const register = await tryImport("@/lib/modules/pos/register");
const catalog = await tryImport("@/lib/modules/pos/catalog");
const service = await tryImport("@/lib/modules/pos/service");
const inventory = await tryImport("@/lib/modules/inventory/service");
const sysSvc = await tryImport("@/lib/modules/system/service");

const RAND = Math.random().toString(36).slice(2, 8);
const TAG = `qc-p1.3-${RAND}`;
// R4 K1: คีย์ idempotency ของหน้าขาย = 8–100 ตัว [A-Za-z0-9_-] ⇒ TAG มี '.' ใช้เป็นคีย์ไม่ได้ · เซิร์ฟเวอร์เก็บ REG_NS + คีย์
const KTAG = TAG.replace(/[^A-Za-z0-9_-]/g, "_");
const REG_NS = "reg2:";
/** where ของ PosSale.idempotencyKey: คีย์ดิบ (createSale ของโมดูลอื่น/ก่อน K1) หรือคีย์ใน namespace หน้าขาย (หลัง K1) */
const keyIn = (k: string) => ({ in: [k, `${REG_NS}${k}`] });
const runStart = new Date();

// ═════════════════════════ 4. S2 + S5 (ไม่ต้องใช้ seed) ═════════════════════════
type Line = { qty: number; unitPriceSatang: number; optionDeltasSatang?: number[]; discount?: { type: "AMOUNT" | "PERCENT"; value: number } };
type Cart = { lines: Line[]; billDiscount?: { type: "AMOUNT" | "PERCENT"; value: number }; couponDiscountSatang?: number; vat: { mode: "NONE" | "INCLUDED" | "EXCLUDED"; rateBp: number }; maxDiscountBp?: number | null };
const price = (c: Cart): Any => callSync(pricing, "priceCart", c);
const VAT7I = { mode: "INCLUDED" as const, rateBp: 700 };
const VAT7E = { mode: "EXCLUDED" as const, rateBp: 700 };
const VAT0 = { mode: "NONE" as const, rateBp: 0 };

function runPricing() {
  console.log("\n── S2 เครื่องคิดเงินตะกร้า (priceCart) ──");
  // S2.1 ภาพ 01
  const mock: Cart = {
    lines: [
      { qty: 2, unitPriceSatang: 7500, optionDeltasSatang: [1000, 1500] }, // ลาเต้ M นมโอ๊ต ×2 = 200
      { qty: 1, unitPriceSatang: 7000 }, // อเมริกาโน่ L = 70
      { qty: 1, unitPriceSatang: 9500, discount: { type: "AMOUNT", value: 1000 } }, // ครัวซองต์อัลมอนด์ 95 − 10
      { qty: 1, unitPriceSatang: 32000 }, // เมล็ดกาแฟ 320
    ],
    couponDiscountSatang: 5000,
    vat: VAT7I,
  };
  const r1 = price(mock);
  chk("P1.3-S2.1", r1?.ok === true && r1.subtotalSatang === 68500 && r1.lineDiscountSatang === 1000 && r1.billDiscountSatang === 0 && r1.couponDiscountSatang === 5000 && r1.grandTotalSatang === 62500 && r1.vatSatang === 4089 && r1.vatSatang === rhu(62500 * 700, 10700),
    "subtotal 68500 · lineDisc 1000 · coupon 5000 · total 62500 · vat 4089", short(r1));
  const r2 = price({ lines: [mock.lines[0]], vat: VAT0 });
  chk("P1.3-S2.2", r2?.ok === true && r2.lines?.[0]?.grossSatang === 20000 && r2.lines?.[0]?.lineTotalSatang === 20000 && r2.grandTotalSatang === 20000, "บรรทัด 20000", short(r2));
  const r3a = price({ lines: [{ qty: 1, unitPriceSatang: 9500, discount: { type: "PERCENT", value: 1000 } }], vat: VAT0 });
  const r3b = price({ lines: [{ qty: 1, unitPriceSatang: 333, discount: { type: "PERCENT", value: 1500 } }], vat: VAT0 });
  chk("P1.3-S2.3", r3a?.lines?.[0]?.discountSatang === 950 && r3a?.grandTotalSatang === 8550 && r3b?.lines?.[0]?.discountSatang === 50 && r3b?.grandTotalSatang === 283,
    "950→8550 · 50→283", `${short(r3a?.lines?.[0])} ${r3a?.grandTotalSatang} · ${short(r3b?.lines?.[0])} ${r3b?.grandTotalSatang} (${codeOf(r3a)}/${codeOf(r3b)})`);
  const r4 = price({ lines: [{ qty: 2, unitPriceSatang: 500, discount: { type: "AMOUNT", value: 1001 } }], vat: VAT0 });
  chk("P1.3-S2.4", refused(r4, ["LINE_DISCOUNT_EXCEEDS_LINE"]) && r4.grandTotalSatang === undefined, "ok:false LINE_DISCOUNT_EXCEEDS_LINE ไม่มียอด", short(r4));
  const base5: Line[] = [{ qty: 1, unitPriceSatang: 10000, discount: { type: "AMOUNT", value: 1000 } }];
  const r5a = price({ lines: base5, billDiscount: { type: "PERCENT", value: 1000 }, vat: VAT0 }); // 10% ของ 9000 = 900
  const r5b = price({ lines: base5, billDiscount: { type: "AMOUNT", value: 1234 }, vat: VAT0 });
  const r5c = price({ lines: base5, billDiscount: { type: "AMOUNT", value: 9001 }, vat: VAT0 });
  chk("P1.3-S2.5", r5a?.billDiscountSatang === 900 && r5a?.grandTotalSatang === 8100 && r5b?.billDiscountSatang === 1234 && r5b?.grandTotalSatang === 7766 && refused(r5c, ["BILL_DISCOUNT_EXCEEDS_TOTAL"]),
    "900→8100 · 1234→7766 · 9001 ปฏิเสธ", `${r5a?.billDiscountSatang}/${r5a?.grandTotalSatang} · ${r5b?.billDiscountSatang}/${r5b?.grandTotalSatang} · ${codeOf(r5c)}`);
  const c6 = (lineBp: number, billBp: number, max: number | null): Cart => ({
    lines: [{ qty: 1, unitPriceSatang: 10000, discount: { type: "PERCENT", value: lineBp } }],
    billDiscount: billBp ? { type: "AMOUNT", value: billBp } : undefined,
    vat: VAT0,
    maxDiscountBp: max,
  });
  const r6a = price(c6(1000, 500, 1000)); // 1000 + 500 = 15% ของ 10000
  const r6b = price(c6(500, 500, 1000)); // 10% พอดี
  const r6c = price(c6(9000, 0, null));
  chk("P1.3-S2.6", refused(r6a, ["DISCOUNT_EXCEEDS_LIMIT"]) && r6a.grandTotalSatang === undefined && r6b?.ok === true && r6b.grandTotalSatang === 9000 && r6c?.ok === true && r6c.grandTotalSatang === 1000,
    "15% ปฏิเสธ · 10% → 9000 · null → 1000", `${codeOf(r6a)} · ${codeOf(r6b)}/${r6b?.grandTotalSatang} · ${codeOf(r6c)}/${r6c?.grandTotalSatang}`);
  const r7a = price({ lines: [{ qty: 1, unitPriceSatang: 10000 }], couponDiscountSatang: 5000, vat: VAT0, maxDiscountBp: 1000 });
  const r7b = price({ lines: [{ qty: 1, unitPriceSatang: 3000 }], couponDiscountSatang: 5000, vat: VAT7I });
  chk("P1.3-S2.7", r7a?.ok === true && r7a.grandTotalSatang === 5000 && r7b?.ok === true && r7b.couponDiscountSatang === 3000 && r7b.grandTotalSatang === 0 && r7b.vatSatang === 0,
    "คูปองไม่ติดเพดาน 5000 · คูปองเกิน → หัก 3000 ยอด 0", `${codeOf(r7a)}/${r7a?.grandTotalSatang} · ${r7b?.couponDiscountSatang}/${r7b?.grandTotalSatang}/${r7b?.vatSatang}`);
  const r8a = price({ lines: [{ qty: 1, unitPriceSatang: 150 }], vat: VAT7E });
  const r8b = price({ lines: [{ qty: 1, unitPriceSatang: 150 }], vat: VAT0 });
  const r8c = price({ lines: [{ qty: 1, unitPriceSatang: 150 }], vat: VAT7I });
  chk("P1.3-S2.8", r8a?.vatSatang === 11 && r8a?.grandTotalSatang === 161 && r8b?.vatSatang === 0 && r8b?.grandTotalSatang === 150 && r8c?.grandTotalSatang === 150 && r8c?.vatSatang === rhu(150 * 700, 10700),
    "EXCL 11/161 · NONE 0/150 · INCL 150/10", `${r8a?.vatSatang}/${r8a?.grandTotalSatang} · ${r8b?.vatSatang}/${r8b?.grandTotalSatang} · ${r8c?.vatSatang}/${r8c?.grandTotalSatang}`);
  const three = (p: number): Line[] => [0, 1, 2].map(() => ({ qty: 1, unitPriceSatang: p }));
  const r9a = price({ lines: three(10), vat: VAT7I });
  const r9b = price({ lines: three(7), vat: VAT7E });
  chk("P1.3-S2.9", r9a?.vatSatang === 2 && r9a?.grandTotalSatang === 30 && r9b?.vatSatang === 1 && r9b?.grandTotalSatang === 22, "INCL 2/30 · EXCL 1/22", `${r9a?.vatSatang}/${r9a?.grandTotalSatang} · ${r9b?.vatSatang}/${r9b?.grandTotalSatang}`);
  const r10a = price({ lines: [{ qty: 3, unitPriceSatang: 0 }, { qty: 1, unitPriceSatang: 2500 }], vat: VAT7I });
  const r10b = price({ lines: [{ qty: 1, unitPriceSatang: 0 }], vat: VAT7E });
  chk("P1.3-S2.10", r10a?.ok === true && r10a.lines?.[0]?.lineTotalSatang === 0 && r10a.grandTotalSatang === 2500 && r10b?.ok === true && r10b.grandTotalSatang === 0 && r10b.vatSatang === 0,
    "บรรทัด 0 ok · บิล 0 ok", `${codeOf(r10a)}/${r10a?.grandTotalSatang} · ${codeOf(r10b)}/${r10b?.grandTotalSatang}`);
  const many = (n: number): Line[] => Array.from({ length: n }, (_, i) => ({ qty: 1 + (i % 3), unitPriceSatang: 100 + i }));
  const exp200 = many(200).reduce((s, l) => s + l.qty * l.unitPriceSatang, 0);
  const r11a = price({ lines: many(200), vat: VAT0 });
  const r11b = price({ lines: many(201), vat: VAT0 });
  const r11c = price({ lines: [{ qty: 10000, unitPriceSatang: 1 }], vat: VAT0 });
  chk("P1.3-S2.11", r11a?.ok === true && r11a.grandTotalSatang === exp200 && r11a.lines?.length === 200 && refused(r11b, ["TOO_MANY_LINES"]) && refused(r11c, ["INVALID_LINE", "VALIDATION"]),
    `200 → ${exp200} · 201 TOO_MANY_LINES · qty 10000 INVALID_LINE`, `${codeOf(r11a)}/${r11a?.grandTotalSatang} · ${codeOf(r11b)} · ${codeOf(r11c)}`);
  const r12 = [
    price({ lines: [{ qty: 1, unitPriceSatang: 10.5 }], vat: VAT0 }),
    price({ lines: [{ qty: 1, unitPriceSatang: -1 }], vat: VAT0 }),
    price({ lines: [{ qty: 0, unitPriceSatang: 100 }], vat: VAT0 }),
  ];
  chk("P1.3-S2.12", r12.every((r) => refused(r, ["INVALID_LINE", "VALIDATION"])), "INVALID_LINE ×3", r12.map(codeOf).join(","));
  // S2.13 บริสุทธิ์ + client-safe
  const input = JSON.parse(JSON.stringify(mock)) as Cart;
  const frozen = JSON.stringify(input);
  const a = price(input);
  const b = price(input);
  const pSrc = rd("src/lib/modules/pos/pricing-shared.ts");
  const valueImports = [...pSrc.matchAll(/^\s*import\s+(?!type\b)[^;]*?from\s+["']([^"']+)["']/gm)].map((m) => m[1]);
  const badImports = valueImports.filter((m) => !/^\.\/[\w-]+-shared(\.ts)?$/.test(m));
  const serverOnly = /["']use server["']|server-only|@\/lib\/core\/db|@prisma\/client|next\/headers/.test(pSrc.replace(/^\s*import\s+type[^;]*;/gm, ""));
  chk("P1.3-S2.13", pSrc.length > 0 && a?.ok === true && JSON.stringify(a) === JSON.stringify(b) && JSON.stringify(input) === frozen && badImports.length === 0 && !serverOnly,
    "ผลเท่ากัน · input ไม่ถูกแก้ · import ได้แค่ ./*-shared หรือ type", `file:${pSrc.length > 0} same:${JSON.stringify(a) === JSON.stringify(b)} mut:${JSON.stringify(input) !== frozen} imports:[${badImports.join(",")}] serverOnly:${serverOnly}`);
  // S2.14 สุ่ม 300 ตะกร้า (LCG seed คงที่ — ทำซ้ำได้)
  let s = 20261001;
  const rnd = (n: number) => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s % n;
  };
  let bad = "";
  for (let k = 0; k < 300 && !bad; k++) {
    const lines: Line[] = Array.from({ length: 1 + rnd(12) }, () => {
      const unit = rnd(5) === 0 ? 0 : 1 + rnd(50000);
      const qty = 1 + rnd(5);
      const l: Line = { qty, unitPriceSatang: unit, optionDeltasSatang: rnd(3) === 0 ? [rnd(3000)] : undefined };
      const gross = qty * (unit + (l.optionDeltasSatang?.[0] ?? 0));
      if (rnd(4) === 0) l.discount = rnd(2) ? { type: "AMOUNT", value: rnd(gross + 1) } : { type: "PERCENT", value: rnd(10001) };
      return l;
    });
    const mode = (["NONE", "INCLUDED", "EXCLUDED"] as const)[rnd(3)];
    const cart: Cart = { lines, couponDiscountSatang: rnd(3) === 0 ? rnd(20000) : 0, vat: { mode, rateBp: mode === "NONE" ? 0 : 700 } };
    const r = price(cart);
    if (r?.ok !== true) {
      bad = `cart#${k} ${codeOf(r)} ${short(r, 120)}`;
      break;
    }
    const sumLines = (r.lines as Any[]).reduce((t: number, l: Any) => t + l.lineTotalSatang, 0);
    const net = sumLines - r.billDiscountSatang - r.couponDiscountSatang;
    const expTotal = mode === "EXCLUDED" ? net + r.vatSatang : net;
    const expVat = mode === "NONE" ? 0 : mode === "INCLUDED" ? rhu(net * 700, 10700) : rhu(net * 700, 10000);
    const ints = [r.subtotalSatang, r.lineDiscountSatang, r.billDiscountSatang, r.couponDiscountSatang, r.netSatang, r.vatSatang, r.grandTotalSatang, ...(r.lines as Any[]).flatMap((l: Any) => [l.grossSatang, l.discountSatang, l.lineTotalSatang])];
    if (r.grandTotalSatang !== expTotal || r.netSatang !== net || r.vatSatang !== expVat || !ints.every((x) => Number.isInteger(x) && x >= 0)) bad = `cart#${k} total ${r.grandTotalSatang}≠${expTotal} net ${r.netSatang}≠${net} vat ${r.vatSatang}≠${expVat}`;
  }
  chk("P1.3-S2.14", !bad, "300/300 สมการตรง", bad || "ok");
  // S2.15 (รอบ 3.2 ข้อ 4): ส่วนลด PERCENT ที่ bp ≤ เพดาน ห้ามถูกปฏิเสธเพราะการปัดสตางค์ · AMOUNT เทียบเพดานที่ปัดครึ่งขึ้นแล้ว
  const r215 = ROUNDING_CASES.map(([label, lines, bill, want]) => {
    const r = price({ lines, billDiscount: bill, vat: VAT0, maxDiscountBp: 1000 });
    return { label, got: r?.ok === true ? `OK:${r.grandTotalSatang}` : codeOf(r), want };
  });
  const bad215 = r215.filter((x) => x.got !== x.want);
  chk("P1.3-S2.15", bad215.length === 0, ROUNDING_CASES.map(([l, , , w]) => `${l}=${w}`).join(" · "), bad215.map((x) => `${x.label}:${x.got}≠${x.want}`).join(" · ") || "ตรงทุกกรณี");
}
/** กรณีเพดาน vs การปัด (S2.15 pure · S3.49 เซิร์ฟเวอร์) — [ชื่อ, บรรทัด, ส่วนลดท้ายบิล, ผลที่ต้องได้ "OK:<ยอด>" | รหัส] · เพดาน STAFF 1000 bp */
const ROUNDING_CASES: [string, Line[], Cart["billDiscount"], string][] = [
  ["10%×33.35", [{ qty: 1, unitPriceSatang: 3335, discount: { type: "PERCENT", value: 1000 } }], undefined, "OK:3001"],
  ["10%×5×33.33", [{ qty: 5, unitPriceSatang: 3333, discount: { type: "PERCENT", value: 1000 } }], undefined, "OK:14998"],
  ["บิล10%×123.45", [{ qty: 1, unitPriceSatang: 12345 }], { type: "PERCENT", value: 1000 }, "OK:11110"],
  ["10.01%×100", [{ qty: 1, unitPriceSatang: 10000, discount: { type: "PERCENT", value: 1001 } }], undefined, "DISCOUNT_EXCEEDS_LIMIT"],
  ["฿3.34 บน 33.35", [{ qty: 1, unitPriceSatang: 3335, discount: { type: "AMOUNT", value: 334 } }], undefined, "OK:3001"],
  ["฿3.35 บน 33.35", [{ qty: 1, unitPriceSatang: 3335, discount: { type: "AMOUNT", value: 335 } }], undefined, "DISCOUNT_EXCEEDS_LIMIT"],
  ["บิล฿10.01 บน 100", [{ qty: 1, unitPriceSatang: 10000 }], { type: "AMOUNT", value: 1001 }, "DISCOUNT_EXCEEDS_LIMIT"],
];

// ── S5 สถิต ──
const POS_DIRS = ["src/lib/modules/pos", "src/app/app/sys/[id]/pos", "src/components/pos"];
function walk(dir: string, out: string[] = []): string[] {
  const abs = join(ROOT, dir);
  if (!existsSync(abs)) return out;
  for (const f of readdirSync(abs)) {
    const rel = `${dir}/${f}`;
    if (statSync(join(ROOT, rel)).isDirectory()) walk(rel, out);
    else if (/\.(tsx|ts)$/.test(f)) out.push(rel);
  }
  return out;
}
const stripComments = (s: string) => s.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

/** testid ที่ภาพ 01 (+ 05ก) มี — กดได้ (ต้องมีแถวในทะเบียน) · ลงท้าย * = แพตเทิร์นจากตัวแปร */
const TESTIDS_CLICKABLE = [
  "pos-reg-unit-switch", // ตัวเลือกสาขา (หัวจอ)
  "pos-reg-tab-*", // เมนูโหมด: sale · tables · online-orders · bills · shift · products · reports · settings
  "pos-reg-search", // ค้นหา/สแกน (F2)
  "pos-reg-custom-item", // + รายการกำหนดเอง
  "pos-reg-scan-camera", // สแกนด้วยกล้อง
  "pos-reg-category-*", // ชิปหมวด (รวม pos-reg-category-all)
  "pos-reg-product-*", // การ์ดสินค้า (pos-reg-product-<productId>)
  "pos-reg-bill-type", // บิลใหม่ · ซื้อกลับ ▾
  "pos-reg-hold", // พักบิล (F8)
  "pos-reg-held-bills", // บิลที่พัก (2)
  "pos-reg-member-pick", // เลือก/ค้นสมาชิก
  "pos-reg-member-remove", // ถอด
  "pos-reg-cart-line-*", // แตะบรรทัด → แก้ไข (จำนวน/หมายเหตุ/ส่วนลด)
  "pos-reg-line-qty-*", // กล่องจำนวน/ปุ่ม +/−
  "pos-reg-line-discount-*", // ส่วนลดรายบรรทัด (บาท/%)
  "pos-reg-line-remove-*", // ลบบรรทัด
  "pos-reg-bill-discount-edit", // "แก้" ข้างส่วนลดท้ายบิล
  "pos-reg-coupon", // ช่อง/ปุ่มคูปอง
  "pos-reg-bill-discount", // % ส่วนลดท้ายบิล
  "pos-reg-note", // หมายเหตุ
  "pos-reg-tax-invoice", // ใบกำกับเต็มรูป (ฟอร์มจริง P1.13)
  "pos-reg-pay", // ชำระเงิน ฿625 (F4)
  "pos-reg-cart-bar", // มือถือ 05ก: แถบตะกร้าล่าง (ดูตะกร้า/ชำระ)
] as const;
/** testid แสดงผล (ต้องมีในโค้ด แต่ไม่ต้องมีแถวทะเบียนเพราะกดไม่ได้ — นิยามเดียวกับ F15.3) */
const TESTIDS_DISPLAY = [
  "pos-reg-status-online", "pos-reg-status-shift", "pos-reg-status-user", "pos-reg-status-stock-pending", "pos-reg-status-sync-pending",
  "pos-reg-status-printer", "pos-reg-shortcuts", "pos-reg-subtotal", "pos-reg-line-discounts", "pos-reg-bill-discount-line",
  "pos-reg-vat-line", "pos-reg-total", // มติ 3.1 ข้อ 6: pos-reg-coupon-line ออก (P1.12 เพิ่มพร้อมฟีเจอร์คูปอง) · pos-reg-coupon (soon) ยังบังคับ
] as const;
/** ปุ่มหลักที่ต้องสูง ≥44px (X11) */
const TOUCH_TESTIDS = ["pos-reg-pay", "pos-reg-category-", "pos-reg-product-", "pos-reg-line-qty-", "pos-reg-hold", "pos-reg-held-bills", "pos-reg-member-pick", "pos-reg-custom-item", "pos-reg-scan-camera"];
/** คีย์ข้อความที่จอใช้ (namespace pos.register) */
const I18N_KEYS = [
  "search.placeholder", "search.customItem", "search.scanCamera", "category.all", "product.soldOut", "product.left", "product.sizes",
  "product.stock", "product.service", "cart.newBill", "cart.billType.takeaway", "cart.hold", "cart.heldBills", "cart.empty",
  "member.add", "member.remove", "totals.subtotal", "totals.lineDiscounts", "totals.billDiscount", "totals.edit", "totals.coupon",
  "totals.vatIncluded", "totals.vatExcluded", "totals.total", "actions.billDiscount", "actions.note", "actions.taxInvoice", "actions.pay",
  "shortcuts.title", "shortcuts.search", "shortcuts.pay", "shortcuts.hold", "shortcuts.clear", "status.online", "status.offline",
  "status.lastSync", "status.shift", "status.noShift", "status.pendingStock", "status.pendingSync", "status.printerReady",
  "empty.title", "empty.body", "errors.discountExceedsLimit", "errors.paymentMismatch", "errors.productUnavailable",
  "errors.stockInsufficient", "errors.permissionDenied", "roles.owner", "roles.manager", "roles.cashier",
].map((k) => `pos.register.${k}`);

function posMessages(locale: string): Map<string, unknown> {
  const keys = new Map<string, unknown>();
  const flat = (o: unknown, prefix: string) => {
    if (o && typeof o === "object" && !Array.isArray(o)) for (const [k, v] of Object.entries(o)) flat(v, `${prefix}.${k}`);
    else keys.set(prefix, o);
  };
  const dir = join(ROOT, "src", "messages", locale);
  for (const f of existsSync(dir) ? readdirSync(dir).filter((x) => x.endsWith(".json")).sort() : []) {
    try {
      const j = JSON.parse(readFileSync(join(dir, f), "utf8")) as Record<string, unknown>;
      if (f === "pos.json") flat(j, "pos");
      else if (j && typeof j === "object" && "pos" in j) flat(j.pos, "pos");
    } catch {
      /* ไฟล์พัง = คีย์หาย (ข้อ S5.1 แดงเอง) */
    }
  }
  return keys;
}

async function runStatic() {
  console.log("\n── S5 สถิต (i18n · testid · แป้นลัด · ปุ่มแตะ · สัญญา createSale) ──");
  const th = posMessages("th");
  const en = posMessages("en");
  const miss = I18N_KEYS.filter((k) => typeof th.get(k) !== "string" || typeof en.get(k) !== "string");
  chk("P1.3-S5.1", miss.length === 0, `${I18N_KEYS.length} คีย์ครบ th+en`, miss.length ? `ขาด ${miss.length}: ${miss.slice(0, 8).join(", ")}${miss.length > 8 ? " …" : ""}` : "ครบ");
  const thai = /[฀-๿]/;
  const ph = (s: string) => [...s.matchAll(/\{(\w+)/g)].map((m) => m[1]).sort().join(",");
  const probs: string[] = [];
  for (const k of new Set([...th.keys(), ...en.keys()].filter((x) => x.startsWith("pos.register.")))) {
    const t = th.get(k);
    const e = en.get(k);
    if (typeof e === "string" && thai.test(e)) probs.push(`${k}: en มีอักษรไทย`);
    if (typeof t === "string" && (!t.trim() || t === k || /^[A-Z][A-Z0-9_]+$/.test(t.trim()))) probs.push(`${k}: th ว่าง/ชื่อคีย์/enum`);
    if (typeof t === "string" && typeof e === "string" && ph(t) !== ph(e)) probs.push(`${k}: ตัวแปร {${ph(t)}}≠{${ph(e)}}`);
    // รอบ 3 (A6 · สเปก §6.1): ต้นไม้คีย์สองภาษาเท่ากัน — คีย์ที่มีฝั่งเดียว = จออีกภาษาโชว์ชื่อคีย์
    if (th.has(k) !== en.has(k)) probs.push(`${k}: มีแค่ ${th.has(k) ? "th" : "en"}`);
  }
  chk("P1.3-S5.2", th.size > 0 && probs.length === 0, "0 ปัญหา", th.size === 0 ? "ยังไม่มีคีย์ pos.* เลย" : probs.slice(0, 6).join(" · ") || "0");

  const files = POS_DIRS.flatMap((d) => walk(d));
  const regFiles = files.filter((f) => /data-testid=(\{`|")pos-reg-/.test(rd(f)));
  const regSrcAll = regFiles.map((f) => rd(f)).join("\n");
  const thaiHits: string[] = [];
  for (const f of regFiles) {
    stripComments(rd(f))
      .split("\n")
      .forEach((ln, i) => {
        if (thai.test(ln)) thaiHits.push(`${f}:${i + 1}`);
      });
  }
  chk("P1.3-S5.3", regFiles.length > 0 && thaiHits.length === 0, "มีไฟล์หน้าขายใหม่ และ 0 บรรทัดไทยฮาร์ดโค้ด", regFiles.length === 0 ? "ยังไม่มีไฟล์ที่ใช้ testid pos-reg-*" : `${thaiHits.length}: ${thaiHits.slice(0, 5).join(", ")}`);
  const present = (t: string) => regSrcAll.includes(t.endsWith("*") ? t.slice(0, -1) : `"${t}"`) || (!t.endsWith("*") && regSrcAll.includes(`\`${t}\``));
  const missingIds = [...TESTIDS_CLICKABLE, ...TESTIDS_DISPLAY].filter((t) => !present(t));
  chk("P1.3-S5.4", missingIds.length === 0, `${TESTIDS_CLICKABLE.length + TESTIDS_DISPLAY.length} testid อยู่ในโค้ด`, missingIds.length ? `ขาด ${missingIds.length}: ${missingIds.slice(0, 8).join(", ")}${missingIds.length > 8 ? " …" : ""}` : "ครบ");
  let inv: Any = null;
  try {
    inv = JSON.parse(rd("scripts/pos-ui-inventory.json"));
  } catch {
    /* inv null */
  }
  const rows = (inv?.rows ?? []) as Any[];
  const noRow = TESTIDS_CLICKABLE.filter((t) => !rows.some((r) => r.testid === t && r.page === "/app/sys/[id]/pos/register" && Array.isArray(r.roles) && r.roles.length > 0));
  chk("P1.3-S5.5", inv && noRow.length === 0, `${TESTIDS_CLICKABLE.length} แถว`, noRow.length ? `ไม่มีแถว ${noRow.length}: ${noRow.slice(0, 8).join(", ")}${noRow.length > 8 ? " …" : ""}` : "ครบ");
  // S5.6 (รอบ 3 · ORACLE-EDIT ตาม Q4): page.tsx เขียนใหม่ ⇒ หนี้ 0 · register-ui.tsx = จอเดิมหลังธง (ห้ามแตะ) ⇒ คงที่ ≤ baseline 22 จน P1.12 ลบไฟล์
  const debtItems = (inv?.baselineDebt?.items ?? []) as Any[];
  const pageDebt = debtItems.find((d) => d.file === "src/app/app/sys/[id]/pos/register/page.tsx");
  const legacyDebt = debtItems.find((d) => d.file === "src/lib/modules/pos/register-ui.tsx");
  const LEGACY_DEBT_BASELINE = 22;
  const pageOk = !pageDebt || Number(pageDebt.untestid) === 0;
  const legacyOk = !existsSync(join(ROOT, "src/lib/modules/pos/register-ui.tsx")) || !legacyDebt || Number(legacyDebt.untestid) <= LEGACY_DEBT_BASELINE;
  chk("P1.3-S5.6", !!inv && pageOk && legacyOk, `page.tsx 0 · register-ui.tsx ≤ ${LEGACY_DEBT_BASELINE}`, `page.tsx=${pageDebt ? pageDebt.untestid : "ไม่มีแถว"} · register-ui.tsx=${legacyDebt ? legacyDebt.untestid : "ไม่มีแถว"}`);
  const code = stripComments(regSrcAll);
  const keys = ["F2", "F4", "F8", "Escape"].filter((k) => !new RegExp(`["'\`]${k}["'\`]`).test(code));
  chk("P1.3-S5.7", regFiles.length > 0 && /keydown|onKeyDown/.test(code) && keys.length === 0, "keydown + F2 F4 F8 Escape", regFiles.length === 0 ? "ยังไม่มีไฟล์หน้าขายใหม่" : `ขาด: ${keys.join(",") || "-"} · keydown:${/keydown|onKeyDown/.test(code)}`);
  const tagOf = (t: string): string => {
    const i = code.indexOf(t);
    if (i < 0) return "";
    const st = code.lastIndexOf("<", i);
    const en2 = code.indexOf(">", i);
    return st >= 0 && en2 > i ? code.slice(st, en2 + 1) : "";
  };
  const searchTag = tagOf("pos-reg-search");
  chk("P1.3-S5.8", !!searchTag && (/autoFocus/.test(searchTag) || /\.focus\(\)/.test(code)) && /\.focus\(\)/.test(code), "autoFocus/ref.focus() + โฟกัสกลับ", searchTag ? `autoFocus:${/autoFocus/.test(searchTag)} focus():${/\.focus\(\)/.test(code)}` : "ไม่พบ pos-reg-search");
  const TOUCH = /(^|[\s"'`])(min-h-(1[1-9]|[2-9]\d)|h-(1[1-9]|[2-9]\d)|size-(1[1-9]|[2-9]\d)|min-h-\[(4[4-9]|[5-9]\d|\d{3})px\]|h-\[(4[4-9]|[5-9]\d|\d{3})px\]|touch-target|pos-touch)(?=$|[\s"'`])/;
  const small = TOUCH_TESTIDS.filter((t) => !TOUCH.test(tagOf(t)));
  chk("P1.3-S5.9", regFiles.length > 0 && small.length === 0, "ทุกปุ่มหลักมีคลาส ≥44px (h-11+/min-h-11+/[44px]+/touch-target)", regFiles.length === 0 ? "ยังไม่มีไฟล์หน้าขายใหม่" : `ไม่ผ่าน: ${small.join(", ") || "-"}`);
  // S5.10 สัญญา createSale (F15.2) — รัน fitness-pos ครั้งเดียว เก็บผลทุกด่าน (S5.16 ใช้ F15.1/F15.5/F15.6)
  const fit = new Map<string, { ok: boolean; detail: string }>();
  let fitErr = "";
  try {
    const fp = (await import("./fitness-pos.mjs" as string)) as Any;
    fp.runPosFitness((id: string, _n: string, ok: boolean, detail: string) => {
      fit.set(id, { ok, detail });
    }, ROOT);
  } catch (e) {
    fitErr = `โหลด fitness-pos ไม่ได้: ${(e as Error).message.slice(0, 100)}`;
  }
  const f = fit.get("F15.2");
  chk("P1.3-S5.10", f?.ok === true, "F15.2 ✅", f ? short(f.detail, 200) : fitErr || "ไม่พบผล F15.2");

  // ── รอบ 3: สถิตของมติ Q4 + Addendum ──
  const PAGE = "src/app/app/sys/[id]/pos/register/page.tsx";
  const LEGACY_UI = "src/lib/modules/pos/register-ui.tsx";
  const LEGACY_ACTIONS = "src/lib/actions/pos.ts";
  const SHARED = "src/lib/modules/pos/register-shared.ts";
  const ACTIONS = "src/lib/modules/pos/register-actions.ts";
  const SEED = "scripts/seed-pos-qc.mts";
  const pageCode = stripComments(rd(PAGE));
  // S5.11 ธง Q4 — ตัวอ่านธงอยู่ใน page.tsx หรือในโมดูล POS ที่ page ใช้ (ผู้สร้างเลือกได้) · เทียบ === true เคร่ง (สตริง "true" = จอเดิม)
  const flagSrc = [pageCode, ...walk("src/lib/modules/pos").filter((x) => /\.ts$/.test(x)).map((x) => stripComments(rd(x)))].join("\n");
  const flagStrict = /registerV2[^\n;]{0,80}[!=]==\s*true\b|\btrue\s*[!=]==[^\n;]{0,80}registerV2/.test(flagSrc);
  const flagPath = /settings[\s\S]{0,120}\bpos\b[\s\S]{0,80}registerV2/.test(flagSrc);
  const bothScreens = /<RegisterScreen\b/.test(pageCode) && /<PosRegister\b/.test(pageCode);
  const guardKept = /posRegisterView\s*\(/.test(pageCode) && /notFound\s*\(\s*\)/.test(pageCode) && /requireTenant\s*\(/.test(pageCode);
  const seedOn = /registerV2["']?\s*:\s*true\b/.test(stripComments(rd(SEED)));
  chk("P1.3-S5.11", flagStrict && flagPath && bothScreens && guardKept && seedOn, "registerV2 === true · settings.pos · <RegisterScreen>+<PosRegister> · ด่าน HF-POS-PAGES · seed on",
    `strict:${flagStrict} path:${flagPath} screens:${bothScreens} guard:${guardKept} seed:${seedOn}`);
  // S5.12 จอเดิมไม่ถูกแตะ — sha256 ตอนฐาน a670d313 (accepted P1.1a + hotfix/pos-page-authz)
  //   🔴 ตั้งใจเป็นสายสะดุด (มติ 3.1 ข้อ 7): merge ที่แก้สองไฟล์นี้อย่างชอบธรรม (เช่น CRM pos-deal-select · hotfix POS) ต้องเปลี่ยน hash
  //      ผ่าน ORACLE-EDIT ที่ผู้คุมงานเห็นเท่านั้น — ห้ามเปลี่ยนเป็น "diff กับ merge-base" (merge-base ของ session/pos ไม่มี hotfix ⇒ แดงหลอก)
  const LEGACY_SHA: Record<string, string> = {
    [LEGACY_UI]: "c69cb3f2b374889f3d3825bd330b06ce85ecd74cf58a192a0820d76dfa3abf30",
    [LEGACY_ACTIONS]: "49ef6de456953b100eaf2d0890d6438ff68e502d33b363b3436fbed5dc01fd24",
  };
  const shaOf = (p: string) => (existsSync(join(ROOT, p)) ? createHash("sha256").update(readFileSync(join(ROOT, p))).digest("hex") : "absent");
  const shaBad = Object.entries(LEGACY_SHA).filter(([p, h]) => shaOf(p) !== h).map(([p]) => `${p}=${shaOf(p).slice(0, 12)}`);
  const legacyRows = ["pos-pay-button", "pos-member-select", "pos-catalog-item"].filter((t) => !rows.some((r) => r.testid === t && r.page === "/app/sys/[id]/pos/register"));
  chk("P1.3-S5.12", shaBad.length === 0 && legacyRows.length === 0, "ไบต์ตรงฐาน · แถวจอเดิม 3", `ไบต์ต่าง: ${shaBad.join(", ") || "-"} · แถวหาย: ${legacyRows.join(", ") || "-"}`);
  // S5.13 รหัสปฏิเสธ → คีย์ข้อความ (สเปก §4.6 + Addendum) — client ห้ามโชว์ message ไทยของเซิร์ฟเวอร์
  const EXPECT_KEY: Record<string, string> = {
    NOT_FOUND: "errors.notFound", PERMISSION_DENIED: "errors.permissionDenied", VALIDATION: "errors.invalidLine", INVALID_LINE: "errors.invalidLine",
    PRODUCT_NOT_FOUND: "errors.productNotFound", PRODUCT_UNAVAILABLE: "errors.productUnavailable", MEMBER_NOT_FOUND: "errors.memberNotFound",
    PRICE_NOT_SET: "errors.priceNotSet", PRICE_CHANGED: "errors.priceChanged", PAYMENT_MISMATCH: "errors.paymentMismatch",
    IDEMPOTENCY_CONFLICT: "errors.idempotencyConflict", LINE_DISCOUNT_EXCEEDS_LINE: "errors.lineDiscountExceedsLine",
    BILL_DISCOUNT_EXCEEDS_TOTAL: "errors.billDiscountExceedsTotal", DISCOUNT_EXCEEDS_LIMIT: "errors.discountExceedsLimit",
    TOO_MANY_LINES: "errors.tooManyLines", STOCK_INSUFFICIENT: "errors.stockInsufficient",
    BUSY: "errors.busy", INTERNAL: "errors.unknown", "QC_NEVER_A_CODE": "errors.unknown",
    // มติ 3.1 ข้อ 5 · UNKNOWN = รหัสกันตกของ action (สเปก §3.1) → "anything else" ของตาราง §4.6
    CONFLICT: "errors.conflict", OPTIONS_REQUIRED: "errors.optionsRequired", UNKNOWN: "errors.unknown",
    MEMBER_RIGHTS_UNSUPPORTED: "errors.memberRightsUnsupported", // มติ 3.2 ข้อ 3
  };
  const ANY_KEY: string[] = [];
  const normKey = (k: unknown) => (typeof k === "string" ? k.replace(/^pos\.register\./, "") : `<${typeof k}>`);
  const keyProbs: string[] = [];
  if (typeof regShared?.refusalMessageKey !== "function") keyProbs.push(`ยังไม่มี ${SHARED} refusalMessageKey`);
  else {
    for (const [code, want] of Object.entries(EXPECT_KEY)) {
      const got = normKey(callSync(regShared, "refusalMessageKey", code));
      if (got !== want) keyProbs.push(`${code}→${got}≠${want}`);
    }
    for (const code of [...Object.keys(EXPECT_KEY), ...ANY_KEY]) {
      const got = normKey(callSync(regShared, "refusalMessageKey", code));
      if (typeof th.get(`pos.register.${got}`) !== "string" || typeof en.get(`pos.register.${got}`) !== "string") keyProbs.push(`${code}→${got} ไม่มีใน th/en`);
    }
  }
  chk("P1.3-S5.13", keyProbs.length === 0, "ทุกรหัสได้คีย์ตามตาราง · BUSY→errors.busy · CONFLICT→errors.conflict · OPTIONS_REQUIRED→errors.optionsRequired · INTERNAL/UNKNOWN→errors.unknown · คีย์มีสองภาษา", keyProbs.slice(0, 6).join(" · ") || "ครบ");
  // S5.14 register-shared บริสุทธิ์ + ค่าคงที่ + moneyText
  const sSrc = rd(SHARED);
  const sImports = [...sSrc.matchAll(/^\s*import\s+(?!type\b)[^;]*?from\s+["']([^"']+)["']/gm)].map((m) => m[1]);
  const sBad = sImports.filter((m) => !/^\.\/[\w-]+-shared(\.ts)?$/.test(m) && !/^@\/lib\/modules\/pos\/[\w-]+-shared$/.test(m) && m !== "@/lib/ui/money");
  const sServer = /["']use server["']|server-only|@\/lib\/core\/db|@prisma\/client|next\/headers/.test(sSrc.replace(/^\s*import\s+type[^;]*;/gm, ""));
  const consts = { REGISTER_MAX_LINES: 200, REGISTER_MAX_QTY: 9999, REGISTER_LOW_STOCK: 5, REGISTER_PAGE_SIZE: 100 } as Record<string, number>;
  const cBad = Object.entries(consts).filter(([k, v]) => regShared?.[k] !== v).map(([k]) => `${k}=${short(regShared?.[k])}`);
  const money = [[8550, "฿85.50"], [62500, "฿625"], [-1000, "−฿10"]] as const;
  const mBad = money.filter(([v, want]) => callSync(regShared, "moneyText", v) !== want).map(([v]) => `${v}→${short(callSync(regShared, "moneyText", v))}`);
  chk("P1.3-S5.14", sSrc.length > 0 && sBad.length === 0 && !sServer && cBad.length === 0 && mBad.length === 0, "import ./*-shared + @/lib/ui/money เท่านั้น · ค่าคงที่ 200/9999/5/100 · moneyText",
    sSrc.length === 0 ? `ยังไม่มี ${SHARED}` : `imports:[${sBad.join(",")}] server:${sServer} consts:[${cBad.join(",")}] money:[${mBad.join(",")}]`);
  // S5.15 server action — ไฟล์ "use server" แยก (ไม่ต่อท้าย actions/pos.ts) · export async function อย่างเดียว · ไม่ throw ปฏิเสธ
  const aRaw = rd(ACTIONS);
  const aCode = stripComments(aRaw);
  const aProbs: string[] = [];
  if (!aRaw) aProbs.push(`ยังไม่มี ${ACTIONS}`);
  else {
    if (!/^\s*["']use server["']\s*;?/.test(aCode)) aProbs.push(`บรรทัดแรกไม่ใช่ "use server"`);
    const exportsAll = [...aCode.matchAll(/^\s*export\b[^\n]*/gm)].map((m) => m[0].trim());
    const nonFn = exportsAll.filter((x) => !/^export\s+async\s+function\s+\w+/.test(x));
    if (nonFn.length) aProbs.push(`export ที่ไม่ใช่ async function: ${nonFn.slice(0, 3).join(" | ")}`);
    const fnNames = exportsAll.map((x) => /^export\s+async\s+function\s+(\w+)/.exec(x)?.[1]).filter((x): x is string => !!x);
    const missingActs = ["registerCatalogAction", "quoteRegisterCartAction", "submitRegisterSaleAction", "registerStatusAction"].filter((n) => !fnNames.includes(n));
    if (missingActs.length) aProbs.push(`ไม่มี action: ${missingActs.join(",")}`);
    if (/\bthrow\b/.test(aCode)) aProbs.push("มี throw (ปฏิเสธต้องคืน {ok:false, code, message})");
    // แยกการประกาศระดับบนสุด ⇒ ทุก action ต้องเรียก requireTenant และมี catch (ผิดพลาดไม่คาดคิด = {ok:false, code}) —
    //   ตรงในตัวมันเอง หรือผ่านตัวช่วยในไฟล์เดียวกัน (ฟังก์ชัน/const ไม่ export) ที่มีของนั้น
    const decls = [...aCode.matchAll(/^(export\s+)?(?:async\s+)?function\s+(\w+)|^(export\s+)?const\s+(\w+)\s*=/gm)].map((m) => ({ exported: !!(m[1] || m[3]), name: m[2] ?? m[4], at: m.index ?? 0 }));
    const seg = (i: number) => aCode.slice(decls[i].at, i + 1 < decls.length ? decls[i + 1].at : aCode.length);
    const helpersWith = (re: RegExp) => decls.map((d, i) => ({ d, i })).filter(({ d, i }) => !d.exported && re.test(seg(i))).map(({ d }) => d.name);
    const tenantHelpers = helpersWith(/requireTenant\s*\(/);
    const catchHelpers = helpersWith(/\bcatch\b/);
    const callsAny = (body: string, names: string[]) => names.some((n) => new RegExp(`\\b${n}\\s*\\(`).test(body));
    decls.forEach((d, i) => {
      if (!d.exported) return;
      const body = seg(i);
      if (!/requireTenant\s*\(/.test(body) && !callsAny(body, tenantHelpers)) aProbs.push(`${d.name} ไม่เรียก requireTenant`);
      if (!/\bcatch\b/.test(body) && !callsAny(body, catchHelpers)) aProbs.push(`${d.name} ไม่มี catch`);
    });
  }
  // checkCatalogWrite ในโค้ด P1.3: อาร์กิวเมนต์แรกต้องไม่ใช่ object ที่ประกอบเอง/spread (ต้องเป็น membership ของ session จาก requireTenant)
  const p13Files = [...new Set([...regFiles, SHARED, ACTIONS, "src/lib/modules/pos/pricing-shared.ts", PAGE, ...walk("src/components/pos/register")])].filter((x) => existsSync(join(ROOT, x)));
  for (const pf of [...p13Files, "src/lib/modules/pos/register.ts"]) {
    for (const m of stripComments(rd(pf)).matchAll(/checkCatalogWrite\s*\(\s*([^,)]*)/g)) {
      const arg = m[1].trim();
      if (/^[{[]|^\.\.\.|body|input|req|params|searchParams|formData/i.test(arg)) aProbs.push(`${pf}: checkCatalogWrite(${arg.slice(0, 30)} …) ไม่ใช่ membership ของ session`);
    }
  }
  chk("P1.3-S5.15", aProbs.length === 0, "use server · async function ×4 · requireTenant+catch ทุกตัว · ไม่ throw · checkCatalogWrite(session)", aProbs.slice(0, 5).join(" · ") || "ผ่าน");
  // S5.16 Addendum F15.5/F15.6 — โค้ดหน้าขาย P1.3 ไม่มีตัวบ่งชี้ระบบเลย · ไม่ import scripts/** · fitness ทั้งสามด่านเขียว
  //   (register.ts ไม่อยู่ในชุดเข้มนี้: P1.1b แก้ setItemSalePrice ในไฟล์เดียวกันขนาน — register.ts ถูกคุมด้วย F15.5 ของ fitness ตามเดิม)
  const p16Probs: string[] = [];
  const mustExist = [SHARED, ACTIONS, "src/lib/modules/pos/pricing-shared.ts"].filter((x) => !existsSync(join(ROOT, x)));
  if (mustExist.length) p16Probs.push(`ยังไม่มี: ${mustExist.join(", ")}`);
  if (!walk("src/components/pos/register").length) p16Probs.push("ยังไม่มี src/components/pos/register/*");
  for (const pf of p13Files) {
    const c = stripComments(rd(pf));
    if (/CATALOG_SYSTEM_ACTOR/.test(c)) p16Probs.push(`${pf}: CATALOG_SYSTEM_ACTOR`);
    if (/(from\s+|import\s*\(\s*|require\s*\(\s*)["'](?:[^"']*\/)?scripts\//.test(c)) p16Probs.push(`${pf}: import scripts/**`);
  }
  for (const id of ["F15.1", "F15.5", "F15.6"]) {
    const r = fit.get(id);
    if (!r) p16Probs.push(`${id}: ไม่มีผล${fitErr ? ` (${fitErr})` : ""}`);
    else if (!r.ok) p16Probs.push(`${id}: ${short(r.detail, 80)}`);
  }
  chk("P1.3-S5.16", p16Probs.length === 0, "ไฟล์ P1.3 ครบ · ไม่มี marker · ไม่ import scripts · F15.1/F15.5/F15.6 ✅", p16Probs.slice(0, 5).join(" · ") || "ผ่าน");
  // S5.17 G9 — ไฟล์ "use client" ใต้หน้าขายไม่ import โมดูลที่ถึง prisma (tsc ผ่านแต่ next build พัง)
  const clientFiles = p13Files.filter((x) => /^\s*["']use client["']/.test(rd(x)));
  const SERVER_MOD = /^(@\/lib\/modules\/pos\/(register|catalog|service|index|db|access|tabs)(\.tsx?)?$|@\/lib\/modules\/pos$|\.{1,2}\/(.*\/)?(register|catalog|service|db)(\.tsx?)?$|@\/lib\/core\/(db|context)$|@prisma\/client$|next\/headers$|server-only$|@\/lib\/modules\/(inventory|account|member|crm|system)(\/|$))/;
  const g9: string[] = [];
  for (const cf of clientFiles) {
    for (const m of stripComments(rd(cf)).matchAll(/^\s*import\s+(?!type\b)[^;]*?from\s+["']([^"']+)["']/gm)) {
      if (SERVER_MOD.test(m[1]) && !/-shared$|-actions$/.test(m[1])) g9.push(`${cf} ← ${m[1]}`);
    }
  }
  chk("P1.3-S5.17", clientFiles.length > 0 && g9.length === 0, "มีไฟล์ client ของหน้าขาย · 0 import โมดูลเซิร์ฟเวอร์", clientFiles.length === 0 ? "ยังไม่มีไฟล์ \"use client\" ของหน้าขาย" : g9.slice(0, 4).join(" · ") || "สะอาด");
  // S5.18 (รอบ 3.2 ข้อ 13 · Q24 Enter บนบาร์โค้ดตรงตัว): มี registerScan ฝั่งบริการ ⇒ ต้องมี action ให้จอเรียก
  const regExportsScan = /export\s+(async\s+)?function\s+registerScan\b|export\s+const\s+registerScan\b/.test(stripComments(rd("src/lib/modules/pos/register.ts")));
  const scanAct = /^\s*export\s+async\s+function\s+registerScanAction\s*\(/m.test(aCode);
  const scanBody = scanAct ? aCode.slice(aCode.search(/export\s+async\s+function\s+registerScanAction/)).split(/\n\s*export\s+/)[0] : "";
  chk("P1.3-S5.18", !regExportsScan || (scanAct && /registerScan\s*\(/.test(scanBody)),
    "registerScan ⇒ export async function registerScanAction (เรียก registerScan)", `register.ts registerScan:${regExportsScan} · action:${scanAct} · เรียก registerScan:${/registerScan\s*\(/.test(scanBody)}`);
  // S5.19 (B2.1 · ORACLE-EDIT): ธงปิด ⇒ หน้าขายเดิมต้องได้ shell เหมือน main (ไม่ถูกบังคับราง) — ตรวจระดับซอร์ส ไม่แตะ DB
  //   🔴 อ่านซอร์สดิบ (ไม่ stripComments) — regex บอร์ดงาน `\/kanban\/b\//` มี "//" ที่ stripComments ตีเป็นคอมเมนต์แล้วตัดท้ายบรรทัดทิ้ง
  const railSrc = rd("src/components/app-shell/NavRail.tsx");
  const railFn = railSrc.slice(Math.max(0, railSrc.search(/export\s+function\s+isRailPath\b/))).split(/\n\}/)[0];
  const railGated = /isRailPath\s*\(\s*pathname\s*:\s*string\s*,\s*posRegisterV2Ids\b/.test(railFn) && /pos\\\/register/.test(railFn) && /posRegisterV2Ids\.includes\(/.test(railFn);
  const railUncond = /pos\\\/register\\\/\?\$\/\.test\(\s*pathname\s*\)/.test(railSrc);
  const shellPass = ["src/components/app-shell/AppShell.tsx", "src/components/app-shell/AppMain.tsx"].filter((f) => !/isRailPath\(\s*pathname\s*,\s*posRegisterV2Ids\s*\)/.test(stripComments(rd(f))));
  const layoutSrc = stripComments(rd("src/app/app/layout.tsx"));
  const layoutOk = /posRegisterV2On\s*\(/.test(layoutSrc) && (layoutSrc.match(/posRegisterV2Ids=\{posRegisterV2Ids\}/g) ?? []).length >= 2;
  chk("P1.3-S5.19", railGated && !railUncond && shellPass.length === 0 && layoutOk,
    "isRailPath(pathname, posRegisterV2Ids) · ไม่มี regex ไม่มีเงื่อนไข · AppShell+AppMain ส่ง id · layout ใช้ posRegisterV2On ส่งทั้งคู่",
    `gated:${railGated} uncond:${railUncond} shell-miss:${shellPass.join(",") || "-"} layout:${layoutOk}`);
  // S5.20 (B2.2 · ORACLE-EDIT): ข้อที่รีวิว B2 พบ — ตรวจระดับซอร์สเท่านั้น (พฤติกรรมจริงยืนยันที่เบราว์เซอร์ของผู้คุมงาน)
  const RS = stripComments(rd("src/components/pos/register/RegisterScreen.tsx"));
  const RD = stripComments(rd("src/components/pos/register/RegisterDialog.tsx"));
  const PD = stripComments(rd("src/components/pos/register/InterimPayDialog.tsx"));
  const CP = stripComments(rd("src/components/pos/register/CartPanel.tsx"));
  const fnBody = (src: string, name: string) => { const k = src.search(new RegExp(`const\\s+${name}\\s*=`)); return k < 0 ? "" : src.slice(k, k + 900); };
  const b22: Record<string, boolean> = {
    s1Fn: /setCart\(\s*fn\s*\)|setCart\(\s*\(\s*prev/.test(RS) && /updateCart\(\s*\(\s*prev/.test(fnBody(RS, "addProduct")) && /updateCart\(\s*\(\s*prev/.test(fnBody(RS, "addLine")),
    s1Gen: /billGen\.current\+\+/.test(fnBody(RS, "resetBill")) && /gen\s*!==\s*billGen\.current/.test(fnBody(RS, "addFromSearchEnter").concat(RS.slice(RS.indexOf("registerScanAction({"), RS.indexOf("registerScanAction({") + 400))),
    s2Pay: /kind\s*===\s*"pay"/.test(fnBody(RS, "openPay")),
    s2Inert: /inert=\{\s*layers\.length\s*>\s*0\s*\}/.test(RS) && /inert=\{\s*i\s*<\s*layers\.length\s*-\s*1\s*\}/.test(RS),
    s2Trap: /focusin/.test(RD) && /"Tab"/.test(RD) && /closest\(\s*"\[inert\]"\s*\)/.test(RD),
    n1: /quotePending/.test(PD) && /!p\.quotePending/.test(PD) && /quotePending=\{\s*!quoteFresh\b/.test(RS),
    n2: /beforeunload/.test(RS) && /"sending"[\s\S]{0,80}"unknown"|"unknown"[\s\S]{0,80}"sending"/.test(RS.slice(Math.max(0, RS.indexOf("beforeunload") - 300), RS.indexOf("beforeunload") + 10)),
    n3: /match\s*===\s*"choose"/.test(RS) && /search\.noResult/.test(RS),
    n4: /isComposing/.test(RS.slice(RS.indexOf('"Escape"'), RS.indexOf('"Escape"') + 300)),
    s3: !/pos-reg-(bill-discount|note|tax-invoice)"\s+className="[^"]*\bh-9\b/.test(CP),
    // B2.3 R1: focusSearch ข้าง pop()/setLayers([]) = ไม่มีผล (หลังม่านยัง inert ตอนนั้น) ⇒ ต้องโฟกัสหลัง commit จาก effect ที่ดู layers.length
    r1: !/(?:\bpop\(\s*\)|setLayers\(\s*\[\s*\]\s*\))\s*;?\s*(?:\S[^\n]*\n\s*){0,2}focusSearch\(/.test(RS) && /useEffect\([\s\S]{0,400}layers\.length[\s\S]{0,300}focusSearch\(\)[\s\S]{0,120}\[\s*layers\.length/.test(RS),
    // B2.3 N-a: quote ล้ม ⇒ ส่ง error เข้ากล่องชำระ (ไม่ใช่ "กำลังโหลด" ค้าง)
    na: /quoteError/.test(PD) && /!p\.quoteError/.test(PD) && /quotePending=\{\s*!quoteFresh\s*&&\s*!quoteFailed\s*\}/.test(RS) && /quoteError=\{/.test(RS),
  };
  const b22Bad = Object.entries(b22).filter(([, v]) => !v).map(([k]) => k);
  chk("P1.3-S5.20", b22Bad.length === 0, "S1 S2 S3 N1–N4 + B2.3 R1 N-a ครบ (static)", b22Bad.length ? `ขาด: ${b22Bad.join(", ")}` : "ครบ");

  // ── รอบ R4 (มติ K3 · K5) — ตรวจระดับซอร์สเท่านั้น (พฤติกรรมจริงยืนยันที่เบราว์เซอร์ของผู้คุมงาน) ──
  /** ช่วง [เปิด, ปิด] ของบล็อก {…} แรกหลังตำแหน่ง at (นับวงเล็บปีกกาแบบหยาบ · ใช้กับซอร์สที่ stripComments แล้ว) */
  const blockAt = (src: string, at: number): [number, number] => {
    if (at < 0) return [-1, -1];
    const open = src.indexOf("{", at);
    if (open < 0) return [-1, -1];
    let depth = 0;
    for (let i = open; i < src.length; i++) {
      if (src[i] === "{") depth++;
      else if (src[i] === "}" && --depth === 0) return [open, i];
    }
    return [open, src.length];
  };
  const inSpan = (i: number, [a, b]: [number, number]) => a >= 0 && i > a && i < b;
  const idxAll = (src: string, re: RegExp) => [...src.matchAll(new RegExp(re.source, re.flags.includes("g") ? re.flags : `${re.flags}g`))].map((m) => m.index ?? -1);
  // S5.21 K3: คีย์ของบิลหมุนเฉพาะใน resetBill (บิลใหม่ · ล้างบิล · พักบิลภายหลัง) — ปฏิเสธใด ๆ ใน send ต้องเก็บคีย์เดิม
  const k3: string[] = [];
  if (!RS) k3.push("ไม่มี RegisterScreen.tsx");
  else {
    const genM = /const\s+(\w+)\s*=\s*(?:\(\s*\)\s*=>|function\s*\(\s*\))[\s\S]{0,240}?randomUUID/.exec(RS);
    const gen = genM?.[1] ?? "";
    if (!gen) k3.push("ไม่พบตัวสร้างคีย์ (const X = () => … randomUUID)");
    const genSpan = genM ? blockAt(RS, genM.index) : ([-1, -1] as [number, number]);
    const resetSpan = blockAt(RS, RS.search(/const\s+resetBill\s*=/));
    const sendSpan = blockAt(RS, RS.search(/const\s+send\s*=/));
    if (resetSpan[0] < 0) k3.push("ไม่พบ resetBill");
    if (sendSpan[0] < 0) k3.push("ไม่พบ send");
    if (gen) {
      // จุดหมุน = ตั้งที่เก็บคีย์บิลด้วยค่าใหม่: setIdemKey(gen()|gen|randomUUID…) หรือ <…idem…>(.current) = gen()/randomUUID
      //   (ตัวสร้างเดียวกันใช้ทำ key ของบรรทัดตะกร้าด้วย ⇒ นับเฉพาะที่ไหลเข้าที่เก็บคีย์ · ค่าเริ่มต้น useState(gen)/useRef(gen()) ไม่นับ ·
      //    setIdemKey(ค่าที่โหลดกลับจาก storage) = คีย์เดิม ไม่นับ)
      const newVal = `(?:${gen}\\b|crypto\\.randomUUID|randomUUID)`;
      const rot = [...idxAll(RS, new RegExp(`setIdemKey\\(\\s*${newVal}`)), ...idxAll(RS, new RegExp(`\\b\\w*[Ii]dem\\w*(?:\\.current)?\\s*=\\s*${newVal}`))]
        .filter((i) => !inSpan(i, genSpan));
      if (!/setIdemKey\(|[Ii]dem\w*Ref\b/.test(RS)) k3.push("ไม่พบที่เก็บคีย์บิล (setIdemKey / …idem…Ref)");
      const outside = rot.filter((i) => !inSpan(i, resetSpan));
      if (outside.length) k3.push(`หมุนคีย์นอก resetBill ${outside.length} จุด: ${outside.map((i) => RS.slice(i, i + 28).replace(/\s+/g, " ")).slice(0, 3).join(" | ")}`);
      if (!rot.some((i) => inSpan(i, resetSpan))) k3.push("resetBill ไม่หมุนคีย์");
    }
    const uuidOut = idxAll(RS, /randomUUID\s*\(/).filter((i) => !inSpan(i, genSpan) && !(genM && i >= genM.index && i <= genM.index + genM[0].length));
    if (uuidOut.length) k3.push(`randomUUID นอกตัวสร้างคีย์ ${uuidOut.length} จุด`);
    const sendBody = sendSpan[0] >= 0 ? RS.slice(sendSpan[0], sendSpan[1]) : "";
    if (/\b(resetBill|nextSale)\s*\(/.test(sendBody)) k3.push("send เรียก resetBill/nextSale (ปฏิเสธ = ล้างคีย์)");
    for (const f of walk("src/components/pos/register").filter((x) => !/RegisterScreen\.tsx$/.test(x))) {
      if (/randomUUID\s*\(/.test(stripComments(rd(f)))) k3.push(`${f}: สร้างคีย์เอง (randomUUID)`);
    }
  }
  chk("P1.3-S5.21", k3.length === 0, "หมุนคีย์เฉพาะใน resetBill · send ไม่หมุน/ไม่ resetBill · ไม่มีตัวสร้างคีย์อื่น", k3.slice(0, 4).join(" · ") || "ผ่าน");
  // S5.22 K5: คำขอที่ค้าง (คีย์ + payload + phase) อยู่รอด reload/Back ด้วย sessionStorage ต่อ POS system + unit · ทุกการแตะอยู่ใน try
  const k5: string[] = [];
  const ssFiles = walk("src/components/pos/register").map((f) => ({ f, c: stripComments(rd(f)) })).filter((x) => /sessionStorage/.test(x.c));
  if (!ssFiles.length) k5.push("ยังไม่มีไฟล์หน้าขายที่ใช้ sessionStorage");
  else {
    const all = ssFiles.map((x) => x.c).join("\n");
    for (const m of ["setItem", "getItem", "removeItem"]) if (!new RegExp(`\\.${m}\\s*\\(`).test(all)) k5.push(`ไม่มี sessionStorage.${m}`);
    for (const { f, c } of ssFiles) {
      const tries = idxAll(c, /\btry\s*\{/).map((i) => blockAt(c, i));
      const naked = idxAll(c, /sessionStorage/).filter((i) => !tries.some((sp) => inSpan(i, sp)));
      if (naked.length) k5.push(`${f}: แตะ sessionStorage นอก try ${naked.length} จุด`);
    }
    const scoped = /`[^`]*\$\{[^}]*\b(systemId|sysId)\b[^}]*\}[^`]*\$\{[^}]*\bunitId\b[^}]*\}[^`]*`|`[^`]*\$\{[^}]*\bunitId\b[^}]*\}[^`]*\$\{[^}]*\b(systemId|sysId)\b[^}]*\}[^`]*`/.test(all);
    if (!scoped) k5.push("คีย์ storage ไม่ได้ผูก systemId+unitId (template `…${systemId}…${unitId}…`)");
    const near = (re: RegExp, win: number, need: RegExp) => idxAll(all, re).some((i) => need.test(all.slice(Math.max(0, i - win), i + win)));
    if (!near(/\.setItem\s*\(/, 400, /JSON\.stringify\s*\(/)) k5.push("setItem ไม่ได้เก็บ JSON");
    if (!near(/\.getItem\s*\(/, 1500, /JSON\.parse\s*\(/)) k5.push("getItem ไม่ได้ JSON.parse");
    if (!idxAll(all, /\.getItem\s*\(/).some((i) => /"unknown"/.test(all.slice(i, i + 1500)))) k5.push("โหลดกลับแล้วไม่ขึ้นสถานะ \"unknown\"");
    if (!/idempotencyKey|idemKey/.test(all) || !/phase/i.test(all)) k5.push("ไม่เห็นคีย์/phase ในข้อมูลที่เก็บ");
  }
  chk("P1.3-S5.22", k5.length === 0, "sessionStorage set/get/remove ใน try · คีย์ตาม systemId+unitId · JSON · โหลดกลับเป็น unknown", k5.slice(0, 4).join(" · ") || "ผ่าน");
}

// ═════════════════════════ 5. S1 S3 S4 (ต้องมี seed + sandbox) ═════════════════════════
const DB_IDS = CHECKS.map(([id]) => id).filter((id) => /-S[1346]\./.test(id));
/** ด่าน SKIP ของกลุ่ม S6 (เจ้าของ P1.6): โค้ดใน src/ ยังไม่มีใครอ่าน `oversellPolicy` ⇒ ข้าม (QC_FORCE=1 = รันให้แดงตามเหตุผล) */
const OVERSELL_READY = walk("src").some((f) => /oversellPolicy/.test(stripComments(rd(f))));
const sb = {
  unitId: "", unlinkedUnitId: "", unit2Id: "", posSysId: "", invSysId: "", invSys2Id: "",
  productIds: [] as string[], categoryIds: [] as string[], invItemIds: [] as string[], menuGroupIds: [] as string[],
  // รอบ 3.2: ผู้ใช้/สมาชิกร้านชั่วคราว (S1.27) · ระบบสมาชิก + ลูกค้า + ระดับ ชั่วคราว (S3.42)
  userIds: [] as string[], membershipIds: [] as string[], memSysId: "", customerIds: [] as string[],
};
const lanes: Any[] = [];
let realCounters: Any[] = [];
/** R4.2: snapshot ตัวนับถูกถ่ายแล้ว (ว่างก็นับว่าถ่าย) ⇒ cleanup ลบตัวนับที่ไม่อยู่ใน snapshot เสมอ · ยังไม่ถ่าย (ล้มก่อน) = ไม่แตะ */
let realCountersTaken = false;

async function lane(i: number): Promise<Any> {
  if (lanes[i]) return lanes[i];
  const { PrismaClient } = (await import("@prisma/client")) as Any;
  const { PrismaPg } = (await import("@prisma/adapter-pg")) as Any;
  while (lanes.length <= i) lanes.push(new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL, max: 2 }) }));
  return lanes[i];
}

async function runDb() {
  if (!scope || !E) {
    for (const id of DB_IDS) chk(id, false, "seed ร้าน QC POS", "ยังไม่ได้ seed (scripts/seed-pos-qc.mts) — ข้อ DB ตรวจไม่ได้");
    return;
  }
  const tid: string = scope.tenantId;
  const posSys: string = scope.posSystemId;
  const silom: string = E.coffee.units.silom;
  const ari: string = E.coffee.units.ari;
  const restoUnit: string = E.resto?.units?.main ?? "posqc-resto-unit-main";
  const restoTid: string = E.resto?.tenantId ?? "posqc-resto-tenant";
  const mOwner = await P.membership.findFirst({ where: { tenantId: tid, userId: E.coffee.users.owner.userId } });
  const mCash = await P.membership.findFirst({ where: { tenantId: tid, userId: E.coffee.users.cashier.userId } });
  const actor = (m: Any, userId: string, over: Partial<Any> = {}) => ({
    userId,
    role: m?.role ?? "STAFF",
    unitAccess: Array.isArray(m?.unitAccess) ? m.unitAccess : [],
    permissions: (m?.permissions ?? {}) as Record<string, unknown>,
    ...over,
  });
  const owner = actor(mOwner, E.coffee.users.owner.userId);
  const cashierReal = actor(mCash, E.coffee.users.cashier.userId);
  realCounters = await P.posReceiptCounter.findMany({ where: { tenantId: { in: envMod.PQC_TENANT_IDS } } });
  realCountersTaken = true;

  // ─── S1 อ่านกริดของสาขาจริงที่ seed ไว้ (อ่านอย่างเดียว) ───
  console.log("\n── S1 ข้อมูลกริด/หมวด/ค้นหา ──");
  const cSilom = { tenantId: tid, systemId: posSys, unitId: silom };
  const g = await call(register, "registerCatalog", cSilom, owner, {});
  const prods = (g?.ok ? g.products : []) as Any[];
  const items = E.coffee.items as Any[];
  const byInv = new Map<string, Any[]>();
  for (const p of prods) byInv.set(p.invItemId, [...(byInv.get(p.invItemId) ?? []), p]);
  const seenOnce = items.every((it) => (byInv.get(it.id) ?? []).length === 1);
  chk("P1.3-S1.1", g?.ok === true && seenOnce, `7 สินค้า seed ตัวละ 1 แถว`, g?.ok ? `เจอ ${items.filter((it) => byInv.has(it.id)).length}/7 · ซ้ำ ${items.filter((it) => (byInv.get(it.id) ?? []).length > 1).map((it) => it.sku).join(",") || "-"}` : codeOf(g));
  let priceBad = "";
  for (const p of prods) {
    const row = hasPosProduct ? await P.posProduct.findFirst({ where: { id: p.id, tenantId: tid } }) : null;
    if (!row || row.basePriceSatang !== p.priceSatang) priceBad += `${p.sku ?? p.id}:${p.priceSatang}≠${row?.basePriceSatang} `;
  }
  const amer = prods.find((p) => p.sku === "PQC-CF-AMER");
  const free = prods.find((p) => p.sku === "PQC-CF-FREE");
  chk("P1.3-S1.2", g?.ok === true && prods.length > 0 && !priceBad && amer?.priceSatang === 6500 && free?.priceSatang === 0, "= basePriceSatang · AMER 6500 · FREE 0", `${priceBad || "ตรง"} · AMER ${amer?.priceSatang} · FREE ${free?.priceSatang}`);
  const SHAPE = ["id", "invItemId", "name", "nameEn", "kind", "categoryId", "priceSatang", "sku", "barcode", "imageUrl", "optionGroupCount", "soldOut", "stockLeft", "trackStock", "trackStockMode"];
  const shapeMiss = prods.length ? SHAPE.filter((k) => !(k in prods[0])) : SHAPE;
  const typesOk = prods.every((p) => typeof p.id === "string" && typeof p.name === "string" && (p.priceSatang === null || Number.isInteger(p.priceSatang)) && typeof p.soldOut === "boolean" && Number.isInteger(p.optionGroupCount) && (p.stockLeft === null || Number.isInteger(p.stockLeft)));
  chk("P1.3-S1.3", g?.ok === true && prods.length > 0 && shapeMiss.length === 0 && typesOk && Array.isArray(g.categories) && "nextCursor" in g && prods.every((p) => typeof p.trackStock === "boolean" && ["auto", "on", "off"].includes(p.trackStockMode)), "ครบทุกคีย์ ชนิดถูก", `ขาด: ${shapeMiss.join(",") || "-"} · ชนิด ${typesOk}`);
  const onHandOf = async (id: string) => Number((await P.invItem.findUnique({ where: { id }, select: { onHand: true } }))?.onHand ?? NaN);
  const crois = prods.find((p) => p.sku === "PQC-CF-CROIS");
  const water = prods.find((p) => p.sku === "PQC-CF-WATER");
  const latte = prods.find((p) => p.sku === "PQC-CF-LATTE");
  const ohC = crois ? await onHandOf(crois.invItemId) : NaN;
  const ohW = water ? await onHandOf(water.invItemId) : NaN;
  chk("P1.3-S1.4", crois?.stockLeft === ohC && water?.stockLeft === ohW && amer?.stockLeft === null && latte?.stockLeft === null && amer?.soldOut === false && latte?.soldOut === false
    && crois?.trackStock === true && water?.trackStock === true && amer?.trackStock === false && latte?.trackStock === false && [crois, water, amer, latte].every((p) => p?.trackStockMode === "auto"),
    `CROIS ${ohC} · WATER ${ohW} · AMER/LATTE null ไม่หมด`, `CROIS ${crois?.stockLeft} · WATER ${water?.stockLeft} · AMER ${amer?.stockLeft}/${amer?.soldOut} · LATTE ${latte?.stockLeft}/${latte?.soldOut}`);

  // search บนสาขาจริง (อ่านอย่างเดียว)
  const q = async (text: string, extra: Any = {}) => {
    const r = await call(register, "registerCatalog", cSilom, owner, { q: text, ...extra });
    return { r, skus: ((r?.ok ? r.products : []) as Any[]).map((p) => p.sku).sort() };
  };
  const s9a = await q("ครัวซอง");
  const s9b = await q("  ครัวซองต์เนยสด  ");
  chk("P1.3-S1.9", s9a.skus.join() === "PQC-CF-CROIS" && s9b.skus.join() === "PQC-CF-CROIS", "CROIS ทั้งสองแบบ", `${s9a.skus.join()} · ${s9b.skus.join()} (${codeOf(s9a.r)})`);
  const s10a = await q("PQC-CF-WATER");
  const s10b = await q("pqc-cf-latte");
  const s10c = await q("PQC-CF-");
  chk("P1.3-S1.10", s10a.skus.join() === "PQC-CF-WATER" && s10b.skus.join() === "PQC-CF-LATTE" && items.every((it) => s10c.skus.includes(it.sku)),
    "WATER · LATTE · prefix ครบ 7", `${s10a.skus.join()} · ${s10b.skus.join()} · ${s10c.skus.length}`);
  const s11 = await q("8850999000015");
  chk("P1.3-S1.11", s11.skus.join() === "PQC-CF-WATER", "WATER", s11.skus.join() || codeOf(s11.r));

  // ข้ามร้าน/ข้ามระบบ/ข้ามสาขา
  const xs = await call(register, "registerCatalog", { tenantId: tid, systemId: posSys, unitId: restoUnit }, owner, {});
  const leaked = JSON.stringify(xs).includes(restoTid) || JSON.stringify(xs).includes("posqc-resto-");
  chk("P1.3-S1.14", refused(xs, ["NOT_FOUND"]) && !leaked, "NOT_FOUND ไม่รั่ว", `${codeOf(xs)} leak:${leaked}`);
  const xa = await call(register, "registerCatalog", { tenantId: tid, systemId: posSys, unitId: ari }, cashierReal, {});
  const xo = await call(register, "registerCatalog", cSilom, cashierReal, {});
  chk("P1.3-S1.16", refused(xa, ["NOT_FOUND"]) && xo?.ok === true, "อารีย์ NOT_FOUND · สีลมได้", `${codeOf(xa)} · ${codeOf(xo)}`);

  // ─── sandbox: สาขาชั่วคราว + ระบบ POS/คลังชั่วคราว (ไม่เชื่อมบัญชี/แต้ม/สมาชิก) ───
  console.log(`\n── sandbox ${TAG} (สาขา + ระบบ POS/คลัง ชั่วคราวในร้าน QC กาแฟ) ──`);
  const unit = await P.businessUnit.create({ data: { tenantId: tid, type: "SHOP", name: `${TAG} sandbox`, slug: `${TAG}-sb` } });
  sb.unitId = unit.id;
  const unl = await P.businessUnit.create({ data: { tenantId: tid, type: "SHOP", name: `${TAG} unlinked`, slug: `${TAG}-unl` } });
  sb.unlinkedUnitId = unl.id;
  const unit2 = await P.businessUnit.create({ data: { tenantId: tid, type: "SHOP", name: `${TAG} branch2`, slug: `${TAG}-b2` } });
  sb.unit2Id = unit2.id;
  const sPos = await P.appSystem.create({ data: { tenantId: tid, type: "POS", name: `${TAG} POS` } });
  sb.posSysId = sPos.id;
  const sInv = await P.appSystem.create({ data: { tenantId: tid, type: "INVENTORY", name: `${TAG} INV` } });
  sb.invSysId = sInv.id;
  await sysSvc.linkUnit(tid, sPos.id, unit.id);
  await sysSvc.linkUnit(tid, sInv.id, unit.id);
  await sysSvc.linkUnit(tid, sPos.id, unit2.id); // สาขาที่ 2 ของระบบ POS sandbox (ปลายทางของ PosProduct.unitId ≠ สาขานี้ · S1.18)
  const ctx = { tenantId: tid, systemId: sPos.id, unitId: unit.id };
  // ctx ของ catalog (ratified · lane 3): {tenantId, systemId, actorUserId|null} — refusal ของ catalog = THROW typed error ที่มี .code
  //   (call() แปลงเป็น {ok:false, code} ให้) · ส่วน register คืน {ok:false, code} เอง (server-action friendly)
  // C1 (round 2): ผู้เรียกระบบ = CATALOG_SYSTEM_ACTOR (unique symbol ที่ catalog.ts export) · actorUserId null ถูกปฏิเสธแล้ว
  //   fixture สร้างสินค้าทุกสาขา (unitId null) ⇒ ต้องเป็นผู้มีสิทธิ์ทุกสาขาหรือ marker (C4/C10) — ใช้ marker · ไม่มี marker (ยังไม่สร้าง) = owner (แดงตามเหตุผลอยู่แล้ว)
  const SYSTEM_ACTOR: unknown = catalog?.CATALOG_SYSTEM_ACTOR ?? owner.userId;
  const cctx = { tenantId: tid, systemId: sPos.id, actorUserId: SYSTEM_ACTOR };
  const invCtx = { tenantId: tid, systemId: sInv.id };
  const cashier = actor(mCash, E.coffee.users.cashier.userId, { role: "STAFF", unitAccess: [unit.id], permissions: { ...(PQC.cashierPermissions as Record<string, unknown>) } });

  // S1.5 empty (ก่อนสร้างสินค้า)
  const e0 = await call(register, "registerCatalog", ctx, owner, {});
  chk("P1.3-S1.5", e0?.ok === true && Array.isArray(e0.products) && e0.products.length === 0 && Array.isArray(e0.categories) && e0.categories.length === 0, "[] []", `${codeOf(e0)} ${short({ p: e0?.products?.length, c: e0?.categories?.length })}`);
  // S1.15 สาขาที่ไม่ผูก POS
  const u1 = await call(register, "registerCatalog", { tenantId: tid, systemId: sPos.id, unitId: unl.id }, owner, {});
  chk("P1.3-S1.15", refused(u1, ["NOT_FOUND"]), "NOT_FOUND", codeOf(u1));

  // ── สินค้า sandbox ผ่าน catalog.ts เท่านั้น (ผู้เขียนเดียว F15.1 · ชื่อ/ทรงตามที่ผู้คุมงานรับรองจากเลน 3) ──
  //   ไม่นับสต็อก = createProduct (ไม่มี InvItem) · นับสต็อก = InvItem (inventory facade) + ensureForInvItem → {id, created} + setPrice
  //   trackStock (round 2 · C2) = tri-state: ไม่ส่ง = null = AUTO (มี invItemId + kind PRODUCT + (เคยมี movement หรือ onHand ≠ 0))
  //   fixture ไม่ตั้งค่า เว้นข้อที่ทดสอบการตั้งชัดแจ้ง (S3.25 ตั้ง false)
  const idOf = (r: Any): string | null => (typeof r === "string" ? r : r?.ok === false ? null : (r?.id ?? r?.product?.id ?? null));
  const must = (label: string, r: Any): Any => {
    if (r?.ok === false) throw Object.assign(new Error(`${label} ล้ม: ${short(r)}`), { code: r.code });
    return r;
  };
  const mkFree = async (name: string, priceSatang: number, patch: Any = {}) => {
    const r = must("createProduct", await call(catalog, "createProduct", cctx, { name, kind: "PRODUCT", basePriceSatang: priceSatang, ...patch }));
    const id = idOf(r);
    if (!id) throw new Error(`createProduct ไม่คืน id: ${short(r)}`);
    sb.productIds.push(id);
    return { id, invItemId: null as string | null };
  };
  /** stock: null = ไม่รับเข้า · n = รับเข้า n · "consumed" = รับเข้า 1 แล้วตัดออก 1 (นับสต็อกแต่เหลือ 0) */
  const mkTracked = async (sku: string, name: string, priceSatang: number | null, stock: number | null | "consumed", patch: Any = {}, itemMore: Any = {}) => {
    const cost = priceSatang === null ? 1234 : Math.floor(priceSatang / 3); // ต้นทุน 1,234 = กับดัก "เอาต้นทุนมาเป็นราคา"
    const it = await inventory.createItem(invCtx, { sku: `${TAG}-${sku}`, name, costSatang: cost, ...itemMore });
    sb.invItemIds.push(it.id);
    const qty = stock === "consumed" ? 1 : stock;
    if (qty && qty > 0) await inventory.receive(invCtx, { itemId: it.id, qty, costSatang: cost, idempotencyKey: `${TAG}-recv-${sku}` });
    if (stock === "consumed") await inventory.consume(invCtx, { itemId: it.id, qty: 1, sourceModule: "QC", idempotencyKey: `${TAG}-use-${sku}` });
    const r = must("ensureForInvItem", await call(catalog, "ensureForInvItem", cctx, it.id));
    const id = idOf(r);
    if (!id) throw new Error(`ensureForInvItem ไม่คืน id: ${short(r)}`);
    sb.productIds.push(id);
    if (priceSatang !== null && itemMore.kind !== "SERVICE") must("setPrice", await call(catalog, "setPrice", cctx, id, priceSatang));
    if (Object.keys(patch).length) must("updateProduct", await call(catalog, "updateProduct", cctx, id, patch));
    return { id, invItemId: it.id as string };
  };
  let built = false;
  let A: Any = null, B: Any = null, C: Any = null, D: Any = null, LOW: Any = null, ZERO: Any = null, ARCH: Any = null, OFF: Any = null;
  let NOPRICE: Any = null, SVC: Any = null, OTHER: Any = null, AUTO: Any = null, OFFSTK: Any = null, DUP1: Any = null, DUP2: Any = null, W2: Any = null;
  let REQP: Any = null, OPTP: Any = null, RP: Any = null, BOTH: Any = null;
  // รอบ 3.2: สินค้าเฉพาะสาขานี้ · สินค้าในหมวดซ่อน (S1.27) · AUTO ไม่เคยมีสต็อก (S3.46) · ราคาปัดยาก (S3.49) · P/Q ราคาเท่ากัน (S3.40)
  let UNITP: Any = null, HIDP: Any = null, NEVER: Any = null, P3335: Any = null, P3333: Any = null, P12345: Any = null, P10000: Any = null, PP: Any = null, QQ: Any = null; // รอบ 3: สินค้ามีกลุ่มบังคับ (Q6) · กลุ่มเลือกได้ · สินค้าเปลี่ยนราคา (S3.31)
  let catId = "";
  try {
    const cat = must("createCategory", await call(catalog, "createCategory", cctx, { name: `${TAG} ขนม`, sortOrder: 1 }));
    catId = idOf(cat) ?? cat?.category?.id ?? "";
    if (catId) sb.categoryIds.push(catId);
    A = await mkFree("กาแฟทดสอบ", 6500);
    B = await mkTracked("B", "ครัวซองต์อัลมอนด์ทดสอบ", 9500, 50, { nameEn: "Almond croissant", categoryId: catId || undefined });
    C = await mkTracked("C", "บราวนี่ทดสอบ", 6500, 50, { categoryId: catId || undefined });
    D = await mkFree("น้ำเปล่าแจกทดสอบ", 0);
    LOW = await mkTracked("LOW", "ขนมเหลือน้อย", 3000, 2);
    ZERO = await mkTracked("ZERO", "ขนมหมดสต็อก", 3000, "consumed"); // auto ⇒ ต้องเคยมี movement จึงนับสต็อก
    ARCH = await mkFree("สินค้าเลิกขาย", 1000);
    OFF = await mkFree("เมนูปิดขายวันนี้", 4000);
    NOPRICE = await mkTracked("NOPRICE", "สินค้ายังไม่ตั้งราคา", null, null);
    SVC = await mkTracked("SVC", "บริการจัดกระเช้าทดสอบ", 30000, null, {}, { kind: "SERVICE", priceSatang: 30000 });
    OTHER = await mkFree("สินค้าเฉพาะสาขาอื่น", 1500, { unitId: unit2.id });
    AUTO = await mkTracked("AUTO", "ขนมรอรับของ", 2000, null);
    OFFSTK = await mkTracked("OFFSTK", "ของแถมไม่ตัดสต็อก", 5000, 5, { trackStock: false });
    DUP1 = await mkTracked("DUP1", "สบู่ก้อนซ้ำหนึ่ง", 2500, null, {}, { barcode: "8850999666663" });
    DUP2 = await mkTracked("DUP2", "สบู่ก้อนซ้ำสอง", 2600, null, {}, { barcode: "8850999666663" });
    // C3: คลังที่ 2 ผูกสาขา 2 ของ POS sandbox เดียวกัน
    const sInv2 = await P.appSystem.create({ data: { tenantId: tid, type: "INVENTORY", name: `${TAG} INV2` } });
    sb.invSys2Id = sInv2.id;
    await sysSvc.linkUnit(tid, sInv2.id, unit2.id);
    const it2 = await inventory.createItem({ tenantId: tid, systemId: sInv2.id }, { sku: `${TAG}-WH2`, name: "สินค้าคลังสาขาสอง", costSatang: 500, barcode: "8850999777772" });
    sb.invItemIds.push(it2.id);
    const w2 = must("ensureForInvItem(WH2)", await call(catalog, "ensureForInvItem", cctx, it2.id));
    W2 = { id: idOf(w2), invItemId: it2.id };
    if (W2.id) sb.productIds.push(W2.id);
    must("setPrice(WH2)", await call(catalog, "setPrice", cctx, W2.id, 1800));
    must("archive", await call(catalog, "archive", cctx, ARCH.id));
    // ไม่มี setAvailability (ratified) — ปิดขายเฉพาะสาขาผ่าน updateProduct · ชื่อคีย์ patch `availability` = ตาม read model POS-API §1 (โน้ต §6)
    must("updateProduct(availability)", await call(catalog, "updateProduct", cctx, OFF.id, { availability: { [unit.id]: false } }));
    // รอบ 3 (Q6): สินค้า + กลุ่มตัวเลือก — P1.1a ไม่มี API ผูกกลุ่ม (backfill เท่านั้น · P1.2 เป็นเจ้าของ) ⇒ fixture เขียนแถวตรงแบบเดียวกับ
    //   qc-pos-p1.1 (MenuOptionGroup ของร้านนี้ unitId = สาขา sandbox + PosProductOptionGroup) · ลบใน finally · นับใน S9.1
    // รอบ 3.1 (มติ ข้อ 12): ทั้งปิดขายที่สาขา (86) และนับสต็อกหมด — ปิดมือต้องชนะ (soldOutReason UNAVAILABLE · ไม่ขาย)
    BOTH = await mkTracked("BOTH", "ขนมปิดขายและหมด", 3000, "consumed", { availability: { [unit.id]: false } });
    REQP = await mkFree("ลาเต้ต้องเลือกขนาด", 7500, { nameEn: "Latte (size required)" });
    UNITP = await mkFree("ขนมเฉพาะสาขานี้", 2200, { unitId: unit.id });
    const hid = must("createCategory(hidden)", await call(catalog, "createCategory", cctx, { name: `${TAG} หมวดซ่อน`, sortOrder: 9 }));
    const hidId = idOf(hid) ?? hid?.category?.id ?? "";
    if (hidId) {
      sb.categoryIds.push(hidId);
      await P.posCategory.update({ where: { id: hidId }, data: { isVisible: false } }); // catalog ยังไม่มีทางซ่อนหมวด (สำเนาจาก MenuCategory.isVisible)
    }
    HIDP = await mkFree("ขนมในหมวดซ่อน", 2300, { categoryId: hidId || undefined });
    NEVER = await mkTracked("NEVER", "ขนมยังไม่เคยรับเข้า", 2500, null);
    P3335 = await mkFree("ราคาปัดยาก 3335", 3335);
    P3333 = await mkFree("ราคาปัดยาก 3333", 3333);
    P12345 = await mkFree("ราคาปัดยาก 12345", 12345);
    P10000 = await mkFree("ราคาเต็มร้อย 10000", 10000);
    PP = await mkFree("ขนมพีราคาเปิดได้", 4500);
    QQ = await mkFree("ขนมคิวราคาเท่าพี", 4500);
    OPTP = await mkFree("อเมริกาโน่ท็อปปิ้งเสริม", 5500);
    RP = await mkFree("ขนมเปลี่ยนราคา", 5000);
    const gReq = await P.menuOptionGroup.create({ data: { tenantId: tid, unitId: unit.id, name: `${TAG} ขนาด`, minSelect: 1, maxSelect: 1,
      choices: { create: [{ tenantId: tid, unitId: unit.id, name: "S", priceDelta: 0 }, { tenantId: tid, unitId: unit.id, name: "M", priceDelta: 1000 }] } } });
    sb.menuGroupIds.push(gReq.id);
    const gOpt = await P.menuOptionGroup.create({ data: { tenantId: tid, unitId: unit.id, name: `${TAG} ท็อปปิ้ง`, minSelect: 0, maxSelect: 3,
      choices: { create: [{ tenantId: tid, unitId: unit.id, name: "ช็อตเพิ่ม", priceDelta: 1500 }] } } });
    sb.menuGroupIds.push(gOpt.id);
    await P.posProductOptionGroup.create({ data: { tenantId: tid, productId: REQP.id, groupId: gReq.id, sortOrder: 0 } });
    await P.posProductOptionGroup.create({ data: { tenantId: tid, productId: REQP.id, groupId: gOpt.id, sortOrder: 1 } });
    await P.posProductOptionGroup.create({ data: { tenantId: tid, productId: OPTP.id, groupId: gOpt.id, sortOrder: 0 } });
    built = true;
  } catch (e) {
    console.log(`  ⚠️  สร้างสินค้า sandbox ไม่สำเร็จ: ${(e as Error).message.slice(0, 200)}`);
  }

  const g2 = await call(register, "registerCatalog", ctx, owner, {});
  const sbP = (g2?.ok ? g2.products : []) as Any[];
  const find = (id: string) => sbP.find((p) => p.id === id);
  chk("P1.3-S1.6", built && !find(ARCH.id) && !!find(A.id), "ARCH ไม่ขึ้น · A ขึ้น", built ? `ARCH:${!!find(ARCH.id)} A:${!!find(A.id)}` : "สร้าง sandbox ไม่ได้");
  chk("P1.3-S1.7", built && find(OFF.id)?.soldOut === true && find(A.id)?.soldOut === false, "OFF soldOut · A ไม่", built ? `OFF:${short(find(OFF.id)?.soldOut)} A:${short(find(A.id)?.soldOut)}` : "สร้าง sandbox ไม่ได้");
  chk("P1.3-S1.8", built && find(ZERO.id)?.soldOut === true && find(LOW.id)?.stockLeft === 2 && find(LOW.id)?.soldOut === false, "ZERO soldOut · LOW 2", built ? `ZERO:${short(find(ZERO.id))} LOW:${find(LOW.id)?.stockLeft}` : "สร้าง sandbox ไม่ได้");
  const s12 = await call(register, "registerCatalog", ctx, owner, { q: "ALMOND" });
  chk("P1.3-S1.12", built && s12?.ok === true && s12.products.length === 1 && s12.products[0].id === B.id, "B ตัวเดียว", `${codeOf(s12)} ${short((s12?.products ?? []).map((p: Any) => p.name))}`);
  const s13a = await call(register, "registerCatalog", ctx, owner, { q: "ไม่มีสินค้านี้แน่นอน-qc" });
  const s13b = await call(register, "registerCatalog", ctx, owner, { categoryId: catId });
  const catRow = ((g2?.categories ?? []) as Any[]).find((c) => c.id === catId);
  const s13bIds = ((s13b?.products ?? []) as Any[]).map((p) => p.id).sort().join();
  chk("P1.3-S1.13", built && !!catId && s13a?.ok === true && s13a.products.length === 0 && s13bIds === [B.id, C.id].sort().join() && catRow?.productCount === 2 && sbP.length >= 6,
    "ว่าง · หมวด = B,C · count 2 · ทั้งหมด ≥6", `${codeOf(s13a)}/${s13a?.products?.length} · ${s13bIds} · count ${catRow?.productCount} · all ${sbP.length}`);

  chk("P1.3-S1.18", built && !find(OTHER.id) && !!find(A.id), "OTHER ไม่ขึ้น · A (unitId null) ขึ้น", built ? `OTHER:${!!find(OTHER.id)} A:${!!find(A.id)}` : "สร้าง sandbox ไม่ได้");
  chk("P1.3-S1.19", built && !!find(NOPRICE.id) && find(NOPRICE.id)?.priceSatang === null, "priceSatang null (ไม่ใช่ต้นทุน 1234)", built ? `${short(find(NOPRICE.id)?.priceSatang)}` : "สร้าง sandbox ไม่ได้");
  // S1.20 trackStock auto พลิกเมื่อรับเข้า (C2)
  const bySku = async (sku: string, c: Any = ctx, a2: Any = owner) => {
    const r = await call(register, "registerCatalog", c, a2, { q: sku });
    return ((r?.ok ? r.products : []) as Any[])[0] ?? null;
  };
  const a0 = built ? await bySku(`${TAG}-AUTO`) : null;
  let a1: Any = null;
  let a2: Any = null;
  if (built) {
    try {
      await inventory.receive(invCtx, { itemId: AUTO.invItemId, qty: 3, costSatang: 600, idempotencyKey: `${TAG}-recv-AUTO2` });
      a1 = await bySku(`${TAG}-AUTO`);
      await inventory.consume(invCtx, { itemId: AUTO.invItemId, qty: 3, sourceModule: "QC", idempotencyKey: `${TAG}-use-AUTO2` });
      a2 = await bySku(`${TAG}-AUTO`);
    } catch (e) {
      console.log(`  (S1.20 รับ/ตัดสต็อกไม่ได้: ${(e as Error).message.slice(0, 80)})`);
    }
  }
  chk("P1.3-S1.20", a0?.trackStock === false && a0?.trackStockMode === "auto" && a0?.stockLeft === null && a0?.soldOut === false && a1?.trackStock === true && a1?.trackStockMode === "auto" && a1?.stockLeft === 3 && a1?.soldOut === false && a2?.soldOut === true,
    "ก่อน false/auto/null · รับ 3 → true/auto/3 · ตัดหมด → soldOut", short({ a0: a0 && [a0.trackStock, a0.trackStockMode, a0.stockLeft, a0.soldOut], a1: a1 && [a1.trackStock, a1.trackStockMode, a1.stockLeft], a2: a2?.soldOut }));
  // S1.21 POS สองคลัง (C3)
  const c2 = { tenantId: tid, systemId: sPos.id, unitId: unit2.id };
  const idsOf = (r: Any) => ((r?.ok ? r.products : []) as Any[]).map((p) => p.id);
  const atA = [
    ...idsOf(await call(register, "registerCatalog", ctx, owner, {})),
    ...idsOf(await call(register, "registerCatalog", ctx, owner, { q: "สินค้าคลังสาขาสอง" })),
    ...idsOf(await call(register, "registerCatalog", ctx, owner, { q: `${TAG}-WH2` })),
    ...idsOf(await call(register, "registerCatalog", ctx, owner, { q: "8850999777772" })),
  ];
  const scanA = await call(register, "registerScan", ctx, owner, { barcode: "8850999777772" });
  const atB = idsOf(await call(register, "registerCatalog", c2, owner, { q: "8850999777772" }));
  const bAtB = idsOf(await call(register, "registerCatalog", c2, owner, { q: "ครัวซองต์อัลมอนด์ทดสอบ" }));
  chk("P1.3-S1.21", built && !!W2?.id && !atA.includes(W2.id) && scanA?.ok === true && scanA.match === "none" && atB.includes(W2.id) && !bAtB.includes(B?.id),
    "สาขา X ไม่เห็น WH2 (4 ทาง + สแกน none) · สาขา 2 เห็น WH2 · ไม่เห็น B", `X:${atA.includes(W2?.id)} scan:${codeOf(scanA)}/${scanA?.match} · Y:${atB.includes(W2?.id)} B@Y:${bAtB.includes(B?.id)}`);

  // S1.17 เกิน 200 ตัว + แบ่งหน้า (R4 + C6): เติม 196 ตัว แล้วเดินทุกหน้า + ค้นตัวท้าย (เข็ม)
  let needle: Any = null;
  if (built) {
    try {
      for (let i = 0; i < 196; i++) await mkFree(`สินค้าเติม ${i}`, 1000 + i);
      needle = await mkTracked("NEEDLE", "ขนมเปี๊ยะไส้ทุเรียนเข็ม", 4500, null, {}, { barcode: "8850999888881" });
      // รอบ 3 (Q21 เพดาน 500 ต้องพิสูจน์ด้วยแคตตาล็อก >500): เติมอีก 300 แถวแบบ createMany ตรง — แถวทรงเดียวกับ createProduct
      //   (PRODUCT · ไม่ผูกคลัง · ทุกสาขา) ไม่ผ่าน catalog.ts เพื่อความเร็วเท่านั้น (F15.1 สแกนแค่ src/) · ลบด้วย systemId sandbox ใน finally
      await P.posProduct.createMany({ data: Array.from({ length: 300 }, (_, i) => ({ tenantId: tid, systemId: sPos.id, name: `สินค้าเติมชุด ${String(i).padStart(3, "0")}`, kind: "PRODUCT", basePriceSatang: 2000 + i })) });
    } catch (e) {
      console.log(`  ⚠️  เติมสินค้า 200+ ไม่สำเร็จ: ${(e as Error).message.slice(0, 120)}`);
    }
  }
  const p0 = await call(register, "registerCatalog", ctx, owner, {});
  const pBig = await call(register, "registerCatalog", ctx, owner, { limit: 1000 });
  const walked = new Set<string>();
  let dupW = 0;
  let pagesW = 0;
  let cur: Any = null;
  do {
    const r = await call(register, "registerCatalog", ctx, owner, { limit: 100, cursor: cur ?? undefined });
    if (r?.ok !== true) break;
    for (const p of r.products as Any[]) walked.has(p.id) ? dupW++ : walked.add(p.id);
    cur = r.nextCursor ?? null;
    pagesW++;
  } while (cur && pagesW < 30);
  const nByName = await call(register, "registerCatalog", ctx, owner, { q: "เปี๊ยะไส้ทุเรียนเข็ม" });
  const nBySku = await call(register, "registerCatalog", ctx, owner, { q: `${TAG}-NEEDLE` });
  const nByBc = await call(register, "registerCatalog", ctx, owner, { q: "8850999888881" });
  const hit = (r: Any) => r?.ok === true && (r.products as Any[]).some((p) => p.id === needle?.id);
  chk("P1.3-S1.17", !!needle && p0?.ok === true && p0.products.length <= 100 && !!p0.nextCursor && pBig?.ok === true && pBig.products.length <= 500 && walked.size > 200 && dupW === 0 && walked.has(needle.id) && hit(nByName) && hit(nBySku) && hit(nByBc),
    "หน้าแรก ≤100+cursor · 1000→≤500 · เดินครบ >200 ไม่ซ้ำ · เข็มเจอ 3 ทาง", `p0 ${p0?.products?.length}/${!!p0?.nextCursor} · big ${pBig?.products?.length} · walked ${walked.size} in ${pagesW} pages dup ${dupW} · name ${hit(nByName)} sku ${hit(nBySku)} bc ${hit(nByBc)} (${codeOf(p0)})`);
  // S1.22 สแกนบาร์โค้ดซ้ำ (C5)
  const sc1 = await call(register, "registerScan", ctx, owner, { barcode: "8850999666663" });
  const sc1b = await call(register, "registerScan", ctx, owner, { barcode: "8850999666663" });
  const sc2 = await call(register, "registerScan", ctx, owner, { barcode: "8850999888881" });
  const sc3 = await call(register, "registerScan", ctx, owner, { barcode: "0000000000000" });
  const chooseIds = ((sc1?.products ?? []) as Any[]).map((p) => p.id);
  chk("P1.3-S1.22", built && sc1?.ok === true && sc1.match === "choose" && chooseIds.length === 2 && chooseIds.slice().sort().join() === [DUP1?.id, DUP2?.id].sort().join()
    && chooseIds.join() === ((sc1b?.products ?? []) as Any[]).map((p) => p.id).join() && sc2?.ok === true && sc2.match === "one" && sc2.product?.id === needle?.id && sc3?.ok === true && sc3.match === "none",
    "choose ×2 ลำดับคงที่ · one · none", `${codeOf(sc1)}/${sc1?.match}/${chooseIds.length} · ${sc2?.match} · ${sc3?.match}`);

  // ─── S1 รอบ 3 ───
  // S1.23 Q6 จำนวนกลุ่มบังคับ (กริด sandbox ก่อนเติม 200+ · และสาขาจริงที่ seed ไว้ — ทุกแถวต้องมีคีย์)
  const optOf = (p: Any) => (p ? `${p.optionGroupCount}/${p.requiredOptionGroupCount}` : "ไม่ขึ้นกริด");
  const allHaveReq = [...sbP, ...prods].every((p) => Number.isInteger(p.requiredOptionGroupCount) && p.requiredOptionGroupCount >= 0 && p.requiredOptionGroupCount <= p.optionGroupCount);
  chk("P1.3-S1.23", built && sbP.length > 0 && allHaveReq && optOf(find(REQP?.id)) === "2/1" && optOf(find(OPTP?.id)) === "1/0" && optOf(find(A?.id)) === "0/0",
    "ทุกแถวมีคีย์ · REQP 2/1 · OPTP 1/0 · A 0/0", `keys:${allHaveReq} · REQP ${optOf(find(REQP?.id))} · OPTP ${optOf(find(OPTP?.id))} · A ${optOf(find(A?.id))} (${codeOf(g2)})`);
  // S1.24 Q9 เหตุที่หมด
  const reasonOf = (p: Any) => (p ? (p.soldOutReason === undefined ? "<ไม่มีคีย์>" : String(p.soldOutReason)) : "ไม่ขึ้นกริด");
  const reasonKeys = [...sbP, ...prods].every((p) => "soldOutReason" in p && [null, "UNAVAILABLE", "NO_STOCK"].includes(p.soldOutReason) && (p.soldOutReason === null) === (p.soldOut === false));
  const wantReason: [Any, string][] = [[OFF, "UNAVAILABLE"], [ZERO, "NO_STOCK"], [BOTH, "UNAVAILABLE"], [A, "null"], [LOW, "null"], [AUTO, "null"], [NOPRICE, "null"], [OFFSTK, "null"]];
  const reasonBad = wantReason.filter(([p, w]) => reasonOf(find(p?.id)) !== w).map(([p, w]) => `${find(p?.id)?.name ?? p?.id}:${reasonOf(find(p?.id))}≠${w}`);
  chk("P1.3-S1.24", built && sbP.length > 0 && reasonKeys && reasonBad.length === 0, "ทุกแถว null⇔ขายได้ · OFF UNAVAILABLE · ZERO NO_STOCK · BOTH (ปิด+หมด) UNAVAILABLE · ที่เหลือ null", `keys:${reasonKeys} · ${reasonBad.join(" · ") || "ตรง"}`);
  // S1.25 Q21 แบ่งหน้า — ตอนนี้ sandbox มี >500 ตัว (16 + 196 + เข็ม + 300)
  const pDef = await call(register, "registerCatalog", ctx, owner, {});
  const p500 = await call(register, "registerCatalog", ctx, owner, { limit: 1000 });
  const ids500 = ((p500?.products ?? []) as Any[]).map((p) => p.id);
  const three: string[] = [];
  let curP: Any = undefined;
  let pageRes: Any = null;
  for (let i = 0; i < 3; i++) {
    pageRes = await call(register, "registerCatalog", ctx, owner, { limit: 100, ...(curP ? { cursor: curP } : {}) });
    if (pageRes?.ok !== true) break;
    three.push(...(pageRes.products as Any[]).map((p) => p.id));
    curP = pageRes.nextCursor;
    if (!curP) break;
  }
  // หน้าสุดท้ายของการเดินทั้งหมด (S1.17 เดินไปแล้ว — เดินซ้ำที่ limit 500 เพื่อหา nextCursor null)
  let lastCur: Any = undefined;
  let walkN = 0;
  let lastNull = false;
  for (let i = 0; i < 10; i++) {
    const r = await call(register, "registerCatalog", ctx, owner, { limit: 500, ...(lastCur ? { cursor: lastCur } : {}) });
    if (r?.ok !== true) break;
    walkN += (r.products as Any[]).length;
    lastCur = r.nextCursor;
    if (!lastCur) {
      lastNull = r.nextCursor === null || r.nextCursor === undefined;
      break;
    }
  }
  const threeOk = three.length === 300 && new Set(three).size === 300 && three.join() === ids500.slice(0, 300).join();
  chk("P1.3-S1.25", pDef?.ok === true && pDef.products.length === 100 && !!pDef.nextCursor && p500?.ok === true && ids500.length === 500 && !!p500.nextCursor && threeOk && lastNull && walkN === walked.size && walkN > 500,
    "ปริยาย 100+cursor · 1000→500+cursor · 3×100 = 300 แรกของ 500 · หน้าสุดท้าย null · เดินครบ = S1.17",
    `def ${pDef?.products?.length}/${!!pDef?.nextCursor} · big ${ids500.length}/${!!p500?.nextCursor} · 3 หน้า ${three.length} uniq ${new Set(three).size} ลำดับตรง ${three.join() === ids500.slice(0, 300).join()} · walk ${walkN} (S1.17 ${walked.size}) last null ${lastNull} (${codeOf(pDef)})`);
  // S1.26 Q21 cursor ข้ามสาขา/ร้าน — ปฏิเสธ (คืน ไม่ throw) หรือผลอยู่ในชุดที่สาขานี้เห็น
  const visibleHere = new Set<string>(walked);
  const foreignCursors: string[] = [];
  {
    let c: Any = undefined;
    for (let i = 0; i < 8; i++) {
      const r = await call(register, "registerCatalog", c2, owner, { limit: 100, ...(c ? { cursor: c } : {}) });
      if (r?.ok !== true || !r.nextCursor) break;
      foreignCursors.push(r.nextCursor);
      c = r.nextCursor;
    }
    const r1 = await call(register, "registerCatalog", c2, owner, { limit: 1 });
    if (r1?.ok && r1.nextCursor) foreignCursors.push(r1.nextCursor);
  }
  if (restoScope && E.resto?.users?.owner?.userId) {
    const mRO = await P.membership.findFirst({ where: { tenantId: restoTid, userId: E.resto.users.owner.userId } });
    const rr = await call(register, "registerCatalog", { tenantId: restoTid, systemId: E.resto.posSystemId ?? restoScope.posSystemId, unitId: restoUnit }, actor(mRO, E.resto.users.owner.userId), { limit: 1 });
    if (rr?.ok && rr.nextCursor) foreignCursors.push(rr.nextCursor);
  }
  const leakIds = new Set([OTHER?.id, W2?.id].filter(Boolean));
  const curProbs: string[] = [];
  for (const fc of foreignCursors) {
    const r = await call(register, "registerCatalog", ctx, owner, { limit: 100, cursor: fc });
    if (r?.threw) curProbs.push(`throw ${r.code}`);
    else if (r?.ok === true) {
      const outside = (r.products as Any[]).filter((p) => !visibleHere.has(p.id) || leakIds.has(p.id));
      if (outside.length) curProbs.push(`หลุด ${outside.length}: ${outside.slice(0, 2).map((p) => p.name).join(",")}`);
    } else if (!refused(r, ["VALIDATION"])) curProbs.push(`code ${codeOf(r)}`); // มติ 3.1 ข้อ 9: VALIDATION หรือหน้าของสาขานี้
  }
  chk("P1.3-S1.26", built && foreignCursors.length >= 2 && curProbs.length === 0, `cursor ต่างถิ่น ${foreignCursors.length} ตัว: VALIDATION (คืน) หรืออยู่ในชุดของสาขานี้`,
    foreignCursors.length < 2 ? `ได้ cursor ต่างถิ่นแค่ ${foreignCursors.length} (registerCatalog ${codeOf(await call(register, "registerCatalog", c2, owner, { limit: 1 }))})` : curProbs.slice(0, 4).join(" · ") || "ปลอดภัยทุกตัว");

  // ─── S1 รอบ 3.2 ───
  // S1.27 ไม่เพี้ยนจาก catalog.listForUnit (B1 อ่านตรงด้วย SQL ชุดเดียวกัน · D2) — สมาชิกจริงใน DB เพราะ listForUnit โหลด membership เอง
  const roleActors: { role: string; userId: string; actor: Any }[] = [{ role: "OWNER", userId: owner.userId, actor: owner }];
  for (const [role, perms] of [["MANAGER", {}], ["STAFF", { ...(PQC.cashierPermissions as Record<string, unknown>) }]] as [string, Record<string, unknown>][]) {
    try {
      const u = await P.user.create({ data: { email: `${TAG}-${role.toLowerCase()}@qc.invalid`, name: `${TAG} ${role}` } });
      sb.userIds.push(u.id);
      const m = await P.membership.create({ data: { userId: u.id, tenantId: tid, role, unitAccess: [unit.id], permissions: perms, acceptedAt: new Date() } });
      sb.membershipIds.push(m.id);
      roleActors.push({ role, userId: u.id, actor: actor(m, u.id) });
    } catch (e) {
      console.log(`  (S1.27 สร้างสมาชิกร้าน ${role} ไม่ได้: ${(e as Error).message.slice(0, 80)})`);
    }
  }
  const walkReg = async (a: Any, c: Any = ctx): Promise<{ ids: string[]; err: string }> => {
    const ids: string[] = [];
    let cur: Any = undefined;
    for (let i = 0; i < 20; i++) {
      const r = await call(register, "registerCatalog", c, a, { limit: 500, ...(cur ? { cursor: cur } : {}) });
      if (r?.ok !== true) return { ids, err: codeOf(r) };
      ids.push(...(r.products as Any[]).map((p) => p.id));
      cur = r.nextCursor;
      if (!cur) return { ids, err: "" };
    }
    return { ids, err: "เกิน 20 หน้า" };
  };
  const walkCat = async (userId: string): Promise<{ ids: string[]; err: string }> => {
    const ids: string[] = [];
    let cur: Any = null;
    for (let i = 0; i < 20; i++) {
      const r = await call(catalog, "listForUnit", { tenantId: tid, systemId: sPos.id, actorUserId: userId }, unit.id, { limit: 500, cursor: cur });
      if (!Array.isArray(r?.items)) return { ids, err: codeOf(r) };
      ids.push(...(r.items as Any[]).map((p) => p.id));
      cur = r.nextCursor;
      if (!cur) return { ids, err: "" };
    }
    return { ids, err: "เกิน 20 หน้า" };
  };
  const drift27: string[] = [];
  let ownerIds27: string[] = [];
  for (const ra of roleActors) {
    const a = await walkReg(ra.actor);
    const b = await walkCat(ra.userId);
    if (ra.role === "OWNER") ownerIds27 = a.ids;
    const same = !a.err && !b.err && a.ids.length === b.ids.length && a.ids.join() === b.ids.join();
    if (!same) {
      const firstDiff = a.ids.findIndex((x, i) => x !== b.ids[i]);
      drift27.push(`${ra.role}: reg ${a.ids.length}${a.err ? `/${a.err}` : ""} cat ${b.ids.length}${b.err ? `/${b.err}` : ""} ต่างที่ #${firstDiff}`);
    }
  }
  const has27 = (x: Any) => !!x?.id && ownerIds27.includes(x.id);
  const cover27 = built && has27(UNITP) && has27(HIDP) && has27(A) && has27(OFF) && !has27(ARCH) && !has27(OTHER) && !has27(W2) && ownerIds27.length > 500;
  chk("P1.3-S1.27", roleActors.length === 3 && drift27.length === 0 && cover27, "OWNER/MANAGER/STAFF: id+ลำดับ = listForUnit · fixture ครบ (สาขานี้/หมวดซ่อน/ทุกสาขา/ปิดขาย มี · archive/สาขาอื่น/คลังอื่น ไม่มี)",
    `actors ${roleActors.map((r) => r.role).join(",")} · ${drift27.join(" · ") || "ไม่เพี้ยน"} · cover ${cover27} (n ${ownerIds27.length})`);
  // S1.28 เดินหน้าในขณะที่แคตตาล็อกเปลี่ยนระหว่างหน้า (archive ข้างหน้า · archive ข้างหลัง · เพิ่ม 2 · เปลี่ยนราคา)
  const pre28 = await walkReg(owner);
  const seen28: string[] = [];
  const archLater = pre28.ids[250];
  const archEarlier = pre28.ids[50];
  const repriced = pre28.ids[300];
  let mut28 = "";
  {
    let cur: Any = undefined;
    for (let page = 1; page <= 30; page++) {
      const r = await call(register, "registerCatalog", ctx, owner, { limit: 100, ...(cur ? { cursor: cur } : {}) });
      if (r?.ok !== true) {
        mut28 += ` page${page}:${codeOf(r)}`;
        break;
      }
      seen28.push(...(r.products as Any[]).map((p) => p.id));
      try {
        if (page === 1) {
          must("archive(later)", await call(catalog, "archive", cctx, archLater));
          for (const nm of ["!! ขนมแทรกต้นรายการ", "สินค้าเติมชุด 150 แทรก", "ฮฮ ขนมแทรกท้ายรายการ"]) {
            const np = must("createProduct(insert)", await call(catalog, "createProduct", cctx, { name: `${nm} ${TAG}`, kind: "PRODUCT", basePriceSatang: 1111 }));
            if (idOf(np)) sb.productIds.push(idOf(np)!);
          }
          must("setPrice(repriced)", await call(catalog, "setPrice", cctx, repriced, 7777));
        }
        if (page === 2) must("archive(earlier)", await call(catalog, "archive", cctx, archEarlier));
      } catch (e) {
        mut28 += ` mut:${(e as Error).message.slice(0, 60)}`;
      }
      cur = r.nextCursor;
      if (!cur) break;
    }
  }
  const count28 = new Map<string, number>();
  for (const id of seen28) count28.set(id, (count28.get(id) ?? 0) + 1);
  const dup28 = [...count28.values()].filter((n) => n > 1).length;
  const unchanged28 = pre28.ids.filter((id) => id !== archLater && id !== archEarlier);
  const gap28 = unchanged28.filter((id) => count28.get(id) !== 1).length;
  chk("P1.3-S1.28", pre28.ids.length > 300 && !mut28 && dup28 === 0 && gap28 === 0 && !count28.has(archLater) && count28.get(archEarlier) === 1,
    "ไม่ซ้ำ · แถวไม่ถูกแก้ครบหน้าละครั้ง · archive ข้างหน้าไม่โผล่ · archive ข้างหลังเห็นครั้งเดียว",
    `pre ${pre28.ids.length} seen ${seen28.length} dup ${dup28} gap ${gap28} later:${count28.get(archLater) ?? 0} earlier:${count28.get(archEarlier) ?? 0}${mut28}`);

  // ─── S3 quote + submit ───
  console.log("\n── S3 ส่งบิลฝั่งเซิร์ฟเวอร์ ──");
  let keyN = 0;
  // R4 K1: คีย์ต้องเป็น [A-Za-z0-9_-] ⇒ KTAG + ป้าย (ไทย/อักขระอื่น → '_') · ตัวนับต่อท้ายทำให้ไม่ซ้ำเสมอ
  const key = (label: string) => `${KTAG}-${label}-${++keyN}`.replace(/[^A-Za-z0-9_-]/g, "_");
  const saleByKey = async (k: string) => P.posSale.findFirst({ where: { tenantId: tid, idempotencyKey: keyIn(k) } });
  // รอบ 3.1 (มติ ข้อ 2 + 4): submit ต้องมี expectedGrandTotalSatang (ยอดที่แคชเชียร์เห็นจาก quote ล่าสุด) และ cashReceivedSatang เมื่อมีเงินสด
  //   sub() เติมให้เมื่อข้อสอบไม่ได้ระบุคีย์นั้น: expected = Σ payMethods (แคชเชียร์จ่ายยอดที่เห็น) · received = ส่วนเงินสด (ทอน 0)
  //   ข้อที่ทดสอบ "คาดต่างจากที่จ่าย" ระบุ expected เอง · ข้อที่ทดสอบ "ไม่ส่งคีย์" ใช้ subRaw (ไม่เติมอะไร) · ไม่แก้ object ของผู้เรียก
  const withDefaults = (input: Any): Any => {
    if (!input || typeof input !== "object") return input;
    const pm = (Array.isArray(input.payMethods) ? input.payMethods : []) as Any[];
    const sum = pm.reduce((t: number, p: Any) => t + (Number(p?.amountSatang) || 0), 0);
    const cash = pm.filter((p) => p?.type === "CASH").reduce((t: number, p: Any) => t + (Number(p?.amountSatang) || 0), 0);
    return {
      ...input,
      ...("expectedGrandTotalSatang" in input ? {} : { expectedGrandTotalSatang: sum }),
      ...("cashReceivedSatang" in input || cash === 0 ? {} : { cashReceivedSatang: cash }),
    };
  };
  const subRaw = (a: Any, input: Any, cl?: Any, c: Any = ctx) => call(register, "submitRegisterSale", c, a, input, cl);
  const sub = (a: Any, input: Any, cl?: Any, c: Any = ctx) => subRaw(a, withDefaults(input), cl, c);
  const quote = (a: Any, input: Any, c: Any = ctx) => call(register, "quoteRegisterCart", c, a, input);
  const pay = (amt: number) => [{ type: "CASH", amountSatang: amt }];
  const outMoves = async (saleId: string) => P.invMovement.count({ where: { tenantId: tid, type: "OUT", refType: "PosSale", refId: saleId } });

  // S3.1 quote ไม่เชื่อราคาจาก client
  const cart1 = { lines: [{ productId: A?.id, qty: 2, unitPriceSatang: 1 }, { productId: B?.id, qty: 1, discount: { type: "AMOUNT", value: 1000 } }] };
  const q1 = await quote(owner, cart1);
  const exp1 = price({ lines: [{ qty: 2, unitPriceSatang: 6500 }, { qty: 1, unitPriceSatang: 9500, discount: { type: "AMOUNT", value: 1000 } }], vat: { mode: q1?.vatMode ?? "NONE", rateBp: q1?.vatRateBp ?? 0 } });
  chk("P1.3-S3.1", q1?.ok === true && exp1?.ok === true && q1.grandTotalSatang === exp1.grandTotalSatang && q1.subtotalSatang === 22500 && q1.vatSatang === exp1.vatSatang,
    `subtotal 22500 · total ${exp1?.grandTotalSatang}`, `${codeOf(q1)} subtotal ${q1?.subtotalSatang} total ${q1?.grandTotalSatang} vat ${q1?.vatSatang}/${exp1?.vatSatang}`);
  // S3.2–S3.4 ขายจริง
  const k2 = key("happy");
  // รอบ 3: ส่งตะกร้าแบบที่จอส่งจริง (บรรทัดสินค้าไม่มีราคา client · สเปก §3.3) — ราคาปลอมตอน submit คือ S3.5 (PRICE_CHANGED ได้ตาม Q22)
  const cart1Clean = { lines: cart1.lines.map(({ unitPriceSatang: _u, ...l }: Any) => l) };
  const s2 = q1?.ok ? await sub(owner, { idempotencyKey: k2, ...cart1Clean, payMethods: pay(q1.grandTotalSatang), cashReceivedSatang: 100000 }) : { ok: false, code: "NO_QUOTE" };
  const sale2 = await saleByKey(k2);
  const pays2 = sale2 ? await P.posPayment.findMany({ where: { saleId: sale2.id } }) : [];
  const lines2 = sale2 ? ((await P.posSaleLine.findMany({ where: { saleId: sale2.id }, orderBy: { lineTotalSatang: "asc" } })) as Any[]) : [];
  const sumLines2 = lines2.reduce((t, l) => t + l.lineTotalSatang, 0);
  chk("P1.3-S3.2", s2?.ok === true && sale2?.status === "PAID" && !!sale2.receiptNo && sale2.grandTotalSatang === q1?.grandTotalSatang && s2.grandTotalSatang === sale2.grandTotalSatang && pays2.reduce((t: number, p: Any) => t + p.amountSatang, 0) === sale2.grandTotalSatang && sale2.subtotalSatang === sumLines2 && s2.changeSatang === 100000 - sale2.grandTotalSatang,
    `PAID · total ${q1?.grandTotalSatang} · Σpay = total · subtotal = Σline`, `${codeOf(s2)} ${short({ st: sale2?.status, rn: sale2?.receiptNo, gt: sale2?.grandTotalSatang, sub: sale2?.subtotalSatang, sumLines2, ch: s2?.changeSatang })}`);
  const qLines = ((q1?.lines ?? []) as Any[]).map((l) => `${l.lineTotalSatang}/${l.discountSatang}`).sort().join();
  const sLines = lines2.map((l) => `${l.lineTotalSatang}/${l.discountSatang}`).sort().join();
  const prodIds2 = lines2.map((l) => l.productId).sort().join();
  const itemIds2 = lines2.map((l) => l.itemId).sort().join();
  const mv2 = sale2 ? await outMoves(sale2.id) : -1;
  chk("P1.3-S3.3", !!sale2 && qLines === sLines && prodIds2 === [A?.id, B?.id].sort().join() && itemIds2 === [A?.invItemId, B?.invItemId].sort().join() && mv2 === 1,
    `บรรทัดตรง quote · productId · itemId · OUT เฉพาะ B = 1`, `q ${qLines} s ${sLines} · prod ${prodIds2} · item ${itemIds2 === [A?.invItemId, B?.invItemId].sort().join()} · OUT ${mv2}`);
  // S3.4 บริการจากแคตตาล็อก (มติ R5)
  const k4 = key("service");
  const qS = await quote(owner, { lines: [{ productId: SVC?.id, qty: 1 }] });
  const s4 = qS?.ok ? await sub(owner, { idempotencyKey: k4, lines: [{ productId: SVC?.id, qty: 1 }], payMethods: pay(qS.grandTotalSatang) }) : qS;
  const sale4 = await saleByKey(k4);
  const l4 = sale4 ? await P.posSaleLine.findFirst({ where: { saleId: sale4.id } }) : null;
  const mv4 = sale4 ? await outMoves(sale4.id) : -1;
  chk("P1.3-S3.4", s4?.ok === true && l4?.serviceId === SVC?.invItemId && l4?.productId === SVC?.id && l4?.itemId === null && mv4 === 0 && l4?.unitPriceSatang === 30000,
    "serviceId = InvItem บริการ · productId · itemId null · OUT 0 · 30000", `${codeOf(s4)} ${short({ svc: l4?.serviceId === SVC?.invItemId, prod: l4?.productId === SVC?.id, item: l4?.itemId, mv4, up: l4?.unitPriceSatang })}`);
  // S3.5 แก้ราคา
  const k5 = key("tamper");
  const s5 = await sub(owner, { idempotencyKey: k5, lines: [{ productId: A?.id, qty: 1, unitPriceSatang: 1 }], payMethods: pay(1) });
  const qA0 = await quote(owner, { lines: [{ productId: A?.id, qty: 1 }] });
  const k5b = key("tamper-paid");
  const s5b = await sub(cashier, { idempotencyKey: k5b, lines: [{ productId: A?.id, qty: 1, unitPriceSatang: 1 }], payMethods: pay(qA0?.grandTotalSatang ?? 6500) });
  const sale5b = await saleByKey(k5b);
  const l5b = sale5b ? await P.posSaleLine.findFirst({ where: { saleId: sale5b.id } }) : null;
  const oneSatang = await P.posSaleLine.count({ where: { tenantId: tid, unitId: unit.id, unitPriceSatang: 1 } });
  // รอบ 3.1 (มติ ข้อ 2): s5 คาดยอด 1 สตางค์ (sub เติม expected = ที่จ่าย) ⇒ PRICE_CHANGED เท่านั้น พร้อมยอดสดของเซิร์ฟเวอร์ ·
  //   s5b คาด = จ่าย = ยอดจริง ⇒ ราคา client ต่อบรรทัดถูกเมิน (PAID @6500) หรือถูกปฏิเสธเป็นอินพุตต้องห้าม (VALIDATION|PERMISSION_DENIED)
  const ok5b = s5b?.ok === true ? l5b?.unitPriceSatang === 6500 && sale5b?.grandTotalSatang === qA0?.grandTotalSatang : refused(s5b, ["VALIDATION", "PERMISSION_DENIED"]) && !sale5b;
  chk("P1.3-S3.5", refused(s5, ["PRICE_CHANGED"]) && s5.grandTotalSatang === qA0?.grandTotalSatang && !(await saleByKey(k5)) && ok5b && oneSatang === 0,
    "ยอดปลอม PRICE_CHANGED + ยอดสด · ยอดจริง → ราคา 6500 หรือ VALIDATION|PERMISSION_DENIED · 0 บรรทัดราคา 1", `${codeOf(s5)} fresh ${s5?.grandTotalSatang}/${qA0?.grandTotalSatang} · ${codeOf(s5b)} price ${l5b?.unitPriceSatang} · บรรทัด 1 สตางค์ ${oneSatang}`);
  // S3.6 จ่ายขาด/เกิน 1 สตางค์
  const qA = await quote(owner, { lines: [{ productId: A?.id, qty: 1 }] });
  const k6a = key("under");
  const k6b = key("over");
  const s6a = await sub(owner, { idempotencyKey: k6a, lines: [{ productId: A?.id, qty: 1 }], payMethods: pay((qA?.grandTotalSatang ?? 0) - 1), expectedGrandTotalSatang: qA?.grandTotalSatang ?? 0 });
  const s6b = await sub(owner, { idempotencyKey: k6b, lines: [{ productId: A?.id, qty: 1 }], payMethods: pay((qA?.grandTotalSatang ?? 0) + 1), expectedGrandTotalSatang: qA?.grandTotalSatang ?? 0 });
  chk("P1.3-S3.6", qA?.ok === true && refused(s6a, ["PAYMENT_MISMATCH"]) && refused(s6b, ["PAYMENT_MISMATCH"]) && !(await saleByKey(k6a)) && !(await saleByKey(k6b)), "PAYMENT_MISMATCH ×2", `${codeOf(qA)} · ${codeOf(s6a)} · ${codeOf(s6b)}`);
  // S3.7 เพดานส่วนลด
  const disc15 = { lines: [{ productId: A?.id, qty: 1, discount: { type: "PERCENT", value: 1500 } }] };
  const qd = await quote(owner, disc15);
  const k7a = key("cap-cashier");
  const s7a = await sub(cashier, { idempotencyKey: k7a, ...disc15, payMethods: pay(qd?.grandTotalSatang ?? 0) });
  const s7b = await sub(owner, { idempotencyKey: key("cap-owner"), ...disc15, payMethods: pay(qd?.grandTotalSatang ?? 0) });
  const cashier20 = { ...cashier, permissions: { ...cashier.permissions, "pos._maxDiscountBp": 2000 } };
  const s7c = await sub(cashier20, { idempotencyKey: key("cap-2000"), ...disc15, payMethods: pay(qd?.grandTotalSatang ?? 0) });
  chk("P1.3-S3.7", refused(s7a, ["DISCOUNT_EXCEEDS_LIMIT"]) && !(await saleByKey(k7a)) && s7b?.ok === true && s7c?.ok === true, "cashier ปฏิเสธ · owner ok · cashier 20% ok", `${codeOf(s7a)} · ${codeOf(s7b)} · ${codeOf(s7c)}`);
  // S3.8 รายการกำหนดเอง
  const custom = { lines: [{ name: "ค่าห่อของขวัญ", qty: 1, unitPriceSatang: 2000 }] };
  const k8a = key("custom-cashier");
  const s8a = await sub(cashier, { idempotencyKey: k8a, ...custom, payMethods: pay(2000) });
  const s8b = await sub(owner, { idempotencyKey: key("custom-owner"), ...custom, payMethods: pay(2000) });
  chk("P1.3-S3.8", refused(s8a, ["PERMISSION_DENIED"]) && !(await saleByKey(k8a)) && s8b?.ok === true, "cashier PERMISSION_DENIED · owner ok", `${codeOf(s8a)} · ${codeOf(s8b)}`);
  // S3.9 ไม่มี pos.sale.create
  const noperm = { ...cashier, permissions: {} };
  const k9 = key("noperm");
  const q9 = await quote(noperm, { lines: [{ productId: A?.id, qty: 1 }] });
  const s9 = await sub(noperm, { idempotencyKey: k9, lines: [{ productId: A?.id, qty: 1 }], payMethods: pay(6500) });
  chk("P1.3-S3.9", refused(q9, ["PERMISSION_DENIED"]) && refused(s9, ["PERMISSION_DENIED"]) && !(await saleByKey(k9)), "PERMISSION_DENIED ×2", `${codeOf(q9)} · ${codeOf(s9)}`);
  // S3.10 แคชเชียร์จริง (สีลม) เข้าสาขา sandbox
  const k10 = key("other-unit");
  const s10 = await sub(cashierReal, { idempotencyKey: k10, lines: [{ productId: A?.id, qty: 1 }], payMethods: pay(qA?.grandTotalSatang ?? 6500) });
  chk("P1.3-S3.10", refused(s10, ["NOT_FOUND"]) && !(await saleByKey(k10)), "NOT_FOUND ไม่มีบิล", codeOf(s10));
  // S3.11 unit ร้านอื่น
  const k11 = key("resto-unit");
  const restoBefore = await P.posSale.count({ where: { tenantId: restoTid } });
  const s311 = await sub(owner, { idempotencyKey: k11, lines: [{ name: "x", qty: 1, unitPriceSatang: 100 }], payMethods: pay(100) }, undefined, { tenantId: tid, systemId: posSys, unitId: restoUnit });
  const restoAfter = await P.posSale.count({ where: { tenantId: restoTid } });
  chk("P1.3-S3.11", refused(s311, ["NOT_FOUND"]) && restoAfter === restoBefore && !(await saleByKey(k11)), "NOT_FOUND · ร้านอาหารไม่มีบิลใหม่", `${codeOf(s311)} resto ${restoBefore}→${restoAfter}`);
  // S3.12 product ข้ามร้าน/archive/มั่ว/ปิดขาย
  const restoProd = hasPosProduct ? await P.posProduct.findFirst({ where: { tenantId: restoTid } }) : null;
  const badIds = [restoProd?.id ?? "posqc-resto-not-a-product", ARCH?.id ?? "no-arch", `${TAG}-nonexistent`];
  const r12: string[] = [];
  for (const pid of badIds) r12.push(codeOf(await sub(owner, { idempotencyKey: key("badprod"), lines: [{ productId: pid, qty: 1 }], payMethods: pay(100) })));
  const s12off = await sub(owner, { idempotencyKey: key("offprod"), lines: [{ productId: OFF?.id, qty: 1 }], payMethods: pay(4000) });
  const tagged12 = await P.posSale.count({ where: { tenantId: tid, idempotencyKey: { contains: "-badprod-" } } });
  // รอบ 3.1 (มติ ข้อ 3): บรรทัดสินค้าที่ขายที่สาขานี้ไม่ได้ = PRODUCT_NOT_FOUND เท่านั้น (NOT_FOUND สงวนให้ ctx สาขา/ระบบ)
  const PNF = ["PRODUCT_NOT_FOUND"];
  chk("P1.3-S3.12", r12.every((c) => PNF.includes(c)) && refused(s12off, ["PRODUCT_UNAVAILABLE"]) && tagged12 === 0 && !!restoProd, "PRODUCT_NOT_FOUND ×3 · PRODUCT_UNAVAILABLE · 0 บิล", `${r12.join(",")} · ${codeOf(s12off)} · บิล ${tagged12} · restoProduct:${!!restoProd}`);
  // S3.13 member ข้ามร้าน
  const foreign = await P.customer.findFirst({ where: { tenantId: { not: tid } }, select: { id: true } });
  const k13 = key("member");
  const s13 = await sub(owner, { idempotencyKey: k13, memberId: foreign?.id ?? `${TAG}-no-member`, lines: [{ productId: A?.id, qty: 1 }], payMethods: pay(qA?.grandTotalSatang ?? 6500) });
  chk("P1.3-S3.13", refused(s13, ["MEMBER_NOT_FOUND", "NOT_FOUND"]) && !(await saleByKey(k13)), "MEMBER_NOT_FOUND ไม่มีบิล", codeOf(s13));
  // S3.14 key ซ้ำตามลำดับ
  const qC = await quote(owner, { lines: [{ productId: C?.id, qty: 1 }] });
  const k14 = key("idem-seq");
  const in14 = { idempotencyKey: k14, lines: [{ productId: C?.id, qty: 1 }], payMethods: pay(qC?.grandTotalSatang ?? 0) };
  const a14 = await sub(owner, in14);
  const b14 = await sub(owner, in14);
  const n14 = await P.posSale.count({ where: { tenantId: tid, idempotencyKey: keyIn(k14) } });
  const sale14 = await saleByKey(k14);
  const p14 = sale14 ? await P.posPayment.count({ where: { saleId: sale14.id } }) : -1;
  const m14 = sale14 ? await outMoves(sale14.id) : -1;
  chk("P1.3-S3.14", a14?.ok === true && b14?.ok === true && a14.saleId === b14.saleId && b14.duplicated === true && a14.duplicated !== true && n14 === 1 && p14 === 1 && m14 === 1,
    "saleId เดิม · dup true · 1 บิล · 1 payment · OUT 1", `${codeOf(a14)}/${codeOf(b14)} same:${a14?.saleId === b14?.saleId} dup:${a14?.duplicated}/${b14?.duplicated} n ${n14} p ${p14} m ${m14}`);
  // S3.15 key ซ้ำพร้อมกัน 10 × 3 รอบ (connection แยก)
  const rounds15: string[] = [];
  let ok15 = !!qC?.ok;
  for (let r = 0; r < 3; r++) {
    const k = key(`idem-par${r}`);
    const res = await Promise.all(Array.from({ length: 10 }, async (_, i) => sub(owner, { idempotencyKey: k, lines: [{ productId: C?.id, qty: 1 }], payMethods: pay(qC?.grandTotalSatang ?? 0) }, await lane(i))));
    const ids = new Set(res.filter((x) => x?.ok).map((x) => x.saleId));
    const n = await P.posSale.count({ where: { tenantId: tid, idempotencyKey: keyIn(k) } });
    const sale = await saleByKey(k);
    const mv = sale ? await outMoves(sale.id) : -1;
    const allOk = res.every((x) => x?.ok === true);
    rounds15.push(`r${r}: ok ${res.filter((x) => x?.ok).length}/10 ids ${ids.size} n ${n} OUT ${mv}${allOk ? "" : ` codes ${[...new Set(res.map(codeOf))].join("|")}`}`);
    if (!(allOk && ids.size === 1 && n === 1 && mv === 1)) ok15 = false;
  }
  chk("P1.3-S3.15", ok15, "ทุกรอบ: 10/10 ok · id เดียว · 1 บิล · OUT 1", rounds15.join(" ; "));
  // S3.16 key เดิม ตะกร้าเปลี่ยน
  // รอบ 3: เคร่งเป็น IDEMPOTENCY_CONFLICT (brief "same key different payload ⇒ IDEMPOTENCY_CONFLICT") — คืนบิลเดิมเงียบ ๆ ทำให้แคชเชียร์
  //   เข้าใจว่าบิลใหม่ (qty 3) ถูกเก็บเงินแล้วทั้งที่บันทึกแค่ qty 1 · ตะกร้าเดิม key เดิม (retry จริง) ยังต้องได้บิลเดิม
  const c16 = await sub(owner, { idempotencyKey: k14, lines: [{ productId: C?.id, qty: 3 }], payMethods: pay((qC?.grandTotalSatang ?? 0) * 3) });
  const c16pay = await sub(owner, { idempotencyKey: k14, lines: [{ productId: C?.id, qty: 1 }], payMethods: [{ type: "PROMPTPAY", amountSatang: qC?.grandTotalSatang ?? 0 }] });
  // รอบ 3.1 (มติ ข้อ 2): payload ที่เทียบรวม expectedGrandTotalSatang ด้วย — ตรวจ key ก่อนคิดราคา (retry หลังราคาเปลี่ยนต้องได้บิลเดิม)
  const c16exp = await sub(owner, { ...in14, expectedGrandTotalSatang: (qC?.grandTotalSatang ?? 0) + 1 });
  const c16same = await sub(owner, in14);
  const n16 = await P.posSale.count({ where: { tenantId: tid, idempotencyKey: keyIn(k14) } });
  const sale16 = await saleByKey(k14);
  chk("P1.3-S3.16", refused(c16, ["IDEMPOTENCY_CONFLICT"]) && refused(c16pay, ["IDEMPOTENCY_CONFLICT"]) && refused(c16exp, ["IDEMPOTENCY_CONFLICT"]) && c16same?.ok === true && c16same.saleId === sale14?.id && n16 === 1 && sale16?.grandTotalSatang === sale14?.grandTotalSatang,
    "qty/วิธีจ่าย/expected ต่าง IDEMPOTENCY_CONFLICT · payload เดิม = บิลเดิม · 1 บิล · ยอดเดิม", `${codeOf(c16)} · ${codeOf(c16pay)} · ${codeOf(c16exp)} · same ${codeOf(c16same)}/${c16same?.saleId === sale14?.id} · n ${n16} total ${sale16?.grandTotalSatang}/${sale14?.grandTotalSatang}`);
  // S3.17 เลขใบเสร็จไม่ชน
  const rn: string[] = [];
  let fail17 = "";
  for (let r = 0; r < 2; r++) {
    const res = await Promise.all(Array.from({ length: 10 }, async (_, i) => sub(owner, { idempotencyKey: key(`rcpt${r}-${i}`), lines: [{ productId: A?.id, qty: 1 }], payMethods: pay(qA?.grandTotalSatang ?? 0) }, await lane(i))));
    for (const x of res) x?.ok ? rn.push(String(x.receiptNo ?? "")) : (fail17 ||= codeOf(x));
  }
  chk("P1.3-S3.17", rn.length === 20 && new Set(rn).size === 20 && rn.every((x) => !!x), "20 เลข ไม่ซ้ำ ไม่ว่าง", `${rn.length} ใบ · ไม่ซ้ำ ${new Set(rn).size}${fail17 ? ` · ล้ม ${fail17}` : ""}`);
  // S3.18 ชิ้นสุดท้าย ALLOW_NEGATIVE
  const r18: string[] = [];
  let ok18 = true;
  for (let r = 0; r < 3; r++) {
    let L: Any = null;
    try {
      L = await mkTracked(`LAST${r}`, `ชิ้นสุดท้าย ${r}`, 2500, 1);
    } catch (e) {
      r18.push(`r${r}: สร้างไม่ได้ ${(e as Error).message.slice(0, 60)}`);
      ok18 = false;
      continue;
    }
    const qL = await quote(owner, { lines: [{ productId: L.id, qty: 1 }] });
    const res = await Promise.all(Array.from({ length: 10 }, async (_, i) => sub(owner, { idempotencyKey: key(`last${r}-${i}`), lines: [{ productId: L.id, qty: 1 }], payMethods: pay(qL?.grandTotalSatang ?? 0) }, await lane(i))));
    const paid = res.filter((x) => x?.ok).length;
    const oh = await onHandOf(L.invItemId);
    const outs = await P.invMovement.count({ where: { tenantId: tid, itemId: L.invItemId, type: "OUT" } });
    r18.push(`r${r}: PAID ${paid}/10 onHand ${oh} OUT ${outs}`);
    if (!(paid === 10 && oh === -9 && outs === 10)) ok18 = false;
  }
  chk("P1.3-S3.18", ok18, "ทุกรอบ PAID 10 · onHand −9 · OUT 10", r18.join(" ; "));
  // S6.1 ชิ้นสุดท้าย BLOCK (กลุ่มแยก · P1.6)
  if (!OVERSELL_READY && !FORCE) skipCheck("P1.3-S6.1", "P1.6 — ยังไม่มีโค้ดใน src/ อ่าน settings.pos.stock.oversellPolicy (นโยบาย BLOCK ตรวจใน tx ของบิล)");
  else {
  await P.businessUnit.update({ where: { id: unit.id }, data: { settings: { pos: { stock: { oversellPolicy: "BLOCK" } } } } });
  const r19: string[] = [];
  let ok19 = true;
  for (let r = 0; r < 3; r++) {
    let L: Any = null;
    try {
      L = await mkTracked(`BLK${r}`, `ชิ้นสุดท้าย BLOCK ${r}`, 2500, 1);
    } catch (e) {
      r19.push(`r${r}: สร้างไม่ได้ ${(e as Error).message.slice(0, 60)}`);
      ok19 = false;
      continue;
    }
    const qL = await quote(owner, { lines: [{ productId: L.id, qty: 1 }] });
    const keys19 = Array.from({ length: 10 }, (_, i) => key(`blk${r}-${i}`));
    const res = await Promise.all(keys19.map(async (k, i) => sub(owner, { idempotencyKey: k, lines: [{ productId: L.id, qty: 1 }], payMethods: pay(qL?.grandTotalSatang ?? 0) }, await lane(i))));
    const paid = res.filter((x) => x?.ok).length;
    const lost = res.filter((x) => refused(x, ["STOCK_INSUFFICIENT"])).length;
    const oh = await onHandOf(L.invItemId);
    const sales = await P.posSale.count({ where: { tenantId: tid, idempotencyKey: { in: keys19.flatMap((k) => keyIn(k).in) } } });
    r19.push(`r${r}: PAID ${paid} STOCK_INSUFFICIENT ${lost} onHand ${oh} บิล ${sales}`);
    if (!(paid === 1 && lost === 9 && oh === 0 && sales === 1)) ok19 = false;
  }
  await P.businessUnit.update({ where: { id: unit.id }, data: { settings: {} } });
  chk("P1.3-S6.1", ok19, "ทุกรอบ PAID 1 · 9 STOCK_INSUFFICIENT · onHand 0 · บิล 1", (OVERSELL_READY ? "" : "[ยังไม่มีโค้ด oversellPolicy] ") + r19.join(" ; "));
  }
  // S3.20 ไม่เชื่อมระบบอื่น
  let ok20 = false;
  let act20 = "ไม่มีบิล S3.2";
  if (sale2) {
    const evKey = `PosSale#${sale2.id}#PAID`;
    let ev: Any = null;
    for (let i = 0; i < 40; i++) {
      ev = await P.outboxEvent.findFirst({ where: { tenantId: tid, idempotencyKey: evKey } });
      if (ev && ev.status !== "PENDING") break;
      await new Promise((r) => setTimeout(r, 500));
    }
    const je = await P.accountJournalEntry.count({ where: { tenantId: tid, refType: "PosSale", refId: sale2.id } });
    const pl = await P.pointLedger.count({ where: { tenantId: tid, refId: sale2.id } });
    ok20 = sale2.status === "PAID" && !!ev && ev.status === "DONE" && je === 0 && pl === 0;
    act20 = `sale ${sale2.status} · event ${ev?.status ?? "ไม่มี"}${ev?.lastError ? ` (${String(ev.lastError).slice(0, 60)})` : ""} · journal ${je} · point ${pl}`;
  }
  chk("P1.3-S3.20", ok20, "PAID · event DONE · journal 0 · point 0", act20);
  // S3.21 200 บรรทัด
  const lines200 = Array.from({ length: 200 }, (_, i) => ({ productId: i % 2 ? A?.id : D?.id, qty: 1 + (i % 3) }));
  const q21 = await quote(owner, { lines: lines200 });
  const k21 = key("200");
  const s21 = q21?.ok ? await sub(owner, { idempotencyKey: k21, lines: lines200, payMethods: pay(q21.grandTotalSatang) }) : q21;
  const sale21 = await saleByKey(k21);
  const l21 = sale21 ? ((await P.posSaleLine.findMany({ where: { saleId: sale21.id }, select: { lineTotalSatang: true } })) as Any[]) : [];
  chk("P1.3-S3.21", s21?.ok === true && sale21?.status === "PAID" && l21.length === 200 && l21.reduce((t, l) => t + l.lineTotalSatang, 0) === sale21.subtotalSatang, "PAID · 200 บรรทัด · Σ = subtotal", `${codeOf(s21)} lines ${l21.length} sub ${sale21?.subtotalSatang}`);
  // S3.22 createSale แบบเดิม
  const k22 = key("legacy");
  let s22: Any;
  try {
    s22 = await service.createSale({
      tenantId: tid, unitId: unit.id, systemId: sPos.id, sourceModule: "HOTEL", sourceId: `${TAG}-folio`, idempotencyKey: k22,
      lines: [{ name: "ค่าห้อง (เดิม)", qty: 2, unitPriceSatang: 1234, discountSatang: 100, itemId: B?.invItemId }],
      payMethods: [{ type: "CASH", amountSatang: 2368 }],
    });
  } catch (e) {
    s22 = { ok: false, code: (e as Error).message.slice(0, 80) };
  }
  const sale22 = await saleByKey(k22);
  const l22 = sale22 ? await P.posSaleLine.findFirst({ where: { saleId: sale22.id } }) : null;
  chk("P1.3-S3.22", sale22?.status === "PAID" && sale22.grandTotalSatang === 2368 && l22?.lineTotalSatang === 2368 && l22?.unitPriceSatang === 1234 && s22?.grandTotalSatang === 2368, "PAID 2368 · line 2368 @1234", `${short({ st: sale22?.status, gt: sale22?.grandTotalSatang, lt: l22?.lineTotalSatang, up: l22?.unitPriceSatang, r: s22?.grandTotalSatang ?? s22?.code })}`);

  // S3.23 ยังไม่ตั้งราคา / ราคาเปิด
  const k23a = key("noprice");
  const s23a = await sub(owner, { idempotencyKey: k23a, lines: [{ productId: NOPRICE?.id, qty: 1 }], payMethods: pay(1234) });
  const s23a0 = await sub(owner, { idempotencyKey: key("noprice0"), lines: [{ productId: NOPRICE?.id, qty: 1 }], payMethods: pay(1) }); // รอบ 3.2: จ่ายยอด 0 = VALIDATION ที่โครง (มติ 3.2 ข้อ 5) ⇒ ใช้ 1 สตางค์ (ยังต้อง PRICE_NOT_SET)
  const k23b = key("open-cashier");
  const s23b = await sub(cashier, { idempotencyKey: k23b, lines: [{ productId: NOPRICE?.id, qty: 1, unitPriceSatang: 4200, openPrice: true }], payMethods: pay(4200) });
  const k23c = key("open-owner");
  const s23c = await sub(owner, { idempotencyKey: k23c, lines: [{ productId: NOPRICE?.id, qty: 1, unitPriceSatang: 4200, openPrice: true }], payMethods: pay(4200) });
  const sale23c = await saleByKey(k23c);
  const l23c = sale23c ? await P.posSaleLine.findFirst({ where: { saleId: sale23c.id } }) : null;
  const atCost = await P.posSaleLine.count({ where: { tenantId: tid, unitId: unit.id, productId: NOPRICE?.id ?? "-", unitPriceSatang: 1234 } }).catch(() => -1);
  chk("P1.3-S3.23", refused(s23a, ["PRICE_NOT_SET"]) && refused(s23a0, ["PRICE_NOT_SET"]) && !(await saleByKey(k23a)) && refused(s23b, ["PERMISSION_DENIED"]) && !(await saleByKey(k23b)) && s23c?.ok === true && l23c?.unitPriceSatang === 4200 && atCost === 0,
    "PRICE_NOT_SET ×2 · cashier PERMISSION_DENIED · owner PAID @4200 · 0 บรรทัดราคาต้นทุน", `${codeOf(s23a)} · ${codeOf(s23a0)} · ${codeOf(s23b)} · ${codeOf(s23c)} @${l23c?.unitPriceSatang} · atCost ${atCost}`);
  // S3.24 สาขาไม่ผูก POS นี้ + คู่บวก
  const cUnl = { tenantId: tid, systemId: sPos.id, unitId: unl.id };
  const k24 = key("unlinked");
  const q24 = await quote(owner, { lines: [{ productId: A?.id, qty: 1 }] }, cUnl);
  const s24 = await sub(owner, { idempotencyKey: k24, lines: [{ productId: A?.id, qty: 1 }], payMethods: pay(qA?.grandTotalSatang ?? 6500) }, undefined, cUnl);
  const s24p = await sub(owner, { idempotencyKey: key("linked"), lines: [{ productId: A?.id, qty: 1 }], payMethods: pay(qA?.grandTotalSatang ?? 6500) });
  const unlSales = await P.posSale.count({ where: { tenantId: tid, unitId: unl.id } });
  chk("P1.3-S3.24", refused(q24, ["NOT_FOUND"]) && refused(s24, ["NOT_FOUND"]) && unlSales === 0 && s24p?.ok === true, "NOT_FOUND ×2 · 0 บิล · คู่บวก PAID", `${codeOf(q24)} · ${codeOf(s24)} · บิล ${unlSales} · ${codeOf(s24p)}`);

  // S3.25 trackStock false ชัดแจ้ง → ขายไม่ตัดสต็อก
  const ohOff0 = OFFSTK ? await onHandOf(OFFSTK.invItemId) : NaN;
  const k25 = key("track-off");
  const q25 = await quote(owner, { lines: [{ productId: OFFSTK?.id, qty: 1 }] });
  const s25 = q25?.ok ? await sub(owner, { idempotencyKey: k25, lines: [{ productId: OFFSTK?.id, qty: 1 }], payMethods: pay(q25.grandTotalSatang) }) : q25;
  const sale25 = await saleByKey(k25);
  const mv25 = sale25 ? await outMoves(sale25.id) : -1;
  const ohOff1 = OFFSTK ? await onHandOf(OFFSTK.invItemId) : NaN;
  const v25 = OFFSTK ? await bySku(`${TAG}-OFFSTK`) : null;
  chk("P1.3-S3.25", s25?.ok === true && mv25 === 0 && ohOff1 === ohOff0 && ohOff0 === 5 && v25?.trackStock === false && v25?.trackStockMode === "off" && v25?.stockLeft === null,
    "PAID · OUT 0 · onHand 5 คงเดิม · off/null", `${codeOf(s25)} OUT ${mv25} onHand ${ohOff0}→${ohOff1} · ${short(v25 && [v25.trackStock, v25.trackStockMode, v25.stockLeft])}`);

  // ─── S3 รอบ 3 ───
  /** ปฏิเสธที่ "ไม่มียอด" — ไม่ clamp ไม่คิดราคาให้ของที่ไม่ควรถูกคิด */
  const noTotals = (r: Any) => r?.ok === false && r.grandTotalSatang === undefined && r.subtotalSatang === undefined && r.lines === undefined;
  const linesOf = (r: Any) => ((r?.lines ?? []) as Any[]);
  const lineOfSale = async (k: string) => {
    const s = await saleByKey(k);
    return s ? await P.posSaleLine.findFirst({ where: { saleId: s.id } }) : null;
  };
  // S3.26 Q6 ตัวเลือกบังคับ
  const OPTCODES = ["OPTIONS_REQUIRED"]; // มติ 3.1 ข้อ 1
  const q26r = await quote(owner, { lines: [{ productId: REQP?.id, qty: 1 }] });
  const k26r = key("req-opt");
  const s26r = await sub(owner, { idempotencyKey: k26r, lines: [{ productId: REQP?.id, qty: 1 }], payMethods: pay(7500) });
  const q26o = await quote(owner, { lines: [{ productId: OPTP?.id, qty: 1 }] });
  const k26o = key("opt-only");
  const s26o = q26o?.ok ? await sub(owner, { idempotencyKey: k26o, lines: [{ productId: OPTP?.id, qty: 1 }], payMethods: pay(q26o.grandTotalSatang) }) : q26o;
  const l26o = await lineOfSale(k26o);
  chk("P1.3-S3.26", refused(q26r, OPTCODES) && noTotals(q26r) && refused(s26r, OPTCODES) && !(await saleByKey(k26r)) && q26o?.ok === true && linesOf(q26o)[0]?.unitPriceSatang === 5500 && s26o?.ok === true && l26o?.unitPriceSatang === 5500 && l26o?.productId === OPTP?.id,
    "บังคับ: ปฏิเสธ quote+submit ไม่มียอด/บิล · เลือกได้: 5500 · PAID @5500", `req ${codeOf(q26r)}/${noTotals(q26r)} · ${codeOf(s26r)} · opt ${codeOf(q26o)} @${linesOf(q26o)[0]?.unitPriceSatang} · ${codeOf(s26o)} @${l26o?.unitPriceSatang}`);
  // S3.27 Q9 หมดสต็อกยังขาย · ปิดขายสาขาไม่ขาย
  const oh27a = ZERO ? await onHandOf(ZERO.invItemId) : NaN;
  const q27 = await quote(owner, { lines: [{ productId: ZERO?.id, qty: 1 }] });
  const k27 = key("no-stock");
  const s27 = q27?.ok ? await sub(owner, { idempotencyKey: k27, lines: [{ productId: ZERO?.id, qty: 1 }], payMethods: pay(q27.grandTotalSatang) }) : q27;
  const sale27 = await saleByKey(k27);
  const mv27 = sale27 ? await outMoves(sale27.id) : -1;
  const oh27b = ZERO ? await onHandOf(ZERO.invItemId) : NaN;
  const q27off = await quote(owner, { lines: [{ productId: OFF?.id, qty: 1 }] });
  const q27both = await quote(owner, { lines: [{ productId: BOTH?.id, qty: 1 }] });
  const k27both = key("off-and-empty");
  const s27both = await sub(owner, { idempotencyKey: k27both, lines: [{ productId: BOTH?.id, qty: 1 }], payMethods: pay(3000) });
  chk("P1.3-S3.27", oh27a === 0 && s27?.ok === true && sale27?.status === "PAID" && mv27 === 1 && oh27b === -1 && refused(q27off, ["PRODUCT_UNAVAILABLE"]) && noTotals(q27off)
      && refused(q27both, ["PRODUCT_UNAVAILABLE"]) && noTotals(q27both) && refused(s27both, ["PRODUCT_UNAVAILABLE"]) && !(await saleByKey(k27both)),
    "NO_STOCK: PAID · OUT 1 · 0→−1 · UNAVAILABLE: quote ปฏิเสธไม่มียอด", `${codeOf(s27)} ${sale27?.status} OUT ${mv27} onHand ${oh27a}→${oh27b} · off ${codeOf(q27off)}/${noTotals(q27off)} · ปิด+หมด ${codeOf(q27both)}/${codeOf(s27both)}`);
  // S3.28 Q8 pos.sale.priceOverride ที่ quote + submit
  const customQ = { lines: [{ name: "ค่าห่อของขวัญ", qty: 1, unitPriceSatang: 2000 }] };
  const openQ = { lines: [{ productId: NOPRICE?.id, qty: 1, unitPriceSatang: 4200, openPrice: true }] };
  const q28a = await quote(cashier, customQ);
  const q28b = await quote(cashier, openQ);
  const cashierPO = { ...cashier, permissions: { ...cashier.permissions, "pos.sale.priceOverride": true } };
  const q28c = await quote(cashierPO, customQ);
  const k28c = key("po-custom");
  const s28c = q28c?.ok ? await sub(cashierPO, { idempotencyKey: k28c, ...customQ, payMethods: pay(q28c.grandTotalSatang) }) : q28c;
  const l28c = await lineOfSale(k28c);
  const q28d = await quote(cashierPO, openQ);
  const k28d = key("po-open");
  const s28d = q28d?.ok ? await sub(cashierPO, { idempotencyKey: k28d, ...openQ, payMethods: pay(q28d.grandTotalSatang) }) : q28d;
  const l28d = await lineOfSale(k28d);
  const manager = actor(mCash, E.coffee.users.cashier.userId, { role: "MANAGER", unitAccess: [unit.id], permissions: {} });
  const k28e = key("mgr-custom");
  const s28e = await sub(manager, { idempotencyKey: k28e, ...customQ, payMethods: pay(q28c?.grandTotalSatang ?? 2000) });
  const permKey = /["']pos\.sale\.priceOverride["']\s*:/.test(stripComments(rd("src/lib/core/permissions.ts")));
  chk("P1.3-S3.28", refused(q28a, ["PERMISSION_DENIED"]) && noTotals(q28a) && refused(q28b, ["PERMISSION_DENIED"]) && noTotals(q28b) && s28c?.ok === true && l28c?.unitPriceSatang === 2000 && !l28c?.productId
      && s28d?.ok === true && l28d?.unitPriceSatang === 4200 && l28d?.productId === NOPRICE?.id && s28e?.ok === true && permKey,
    "STAFF quote ×2 PERMISSION_DENIED · STAFF+คีย์ PAID @2000/@4200 · MANAGER PAID · คีย์ในแคตตาล็อก", `${codeOf(q28a)} · ${codeOf(q28b)} · ${codeOf(s28c)} @${l28c?.unitPriceSatang} · ${codeOf(s28d)} @${l28d?.unitPriceSatang} · mgr ${codeOf(s28e)} · key ${permKey}`);
  // S3.29 Q12 คูปองจาก client — ORACLE-EDIT P1.12: ส่วนลดคูปองเป็นสตางค์ = VALIDATION · โค้ดที่ใช้ไม่ได้ = COUPON_INVALID (quote รายงานใน memberConflicts)
  const crBefore = await P.couponRedemption.count({ where: { tenantId: tid } });
  const tA = qA?.grandTotalSatang ?? 6500;
  const q29a = await quote(owner, { lines: [{ productId: A?.id, qty: 1 }], couponCode: "WELCOME50" });
  const q29b = await quote(owner, { lines: [{ productId: A?.id, qty: 1 }], couponDiscountSatang: 1000 });
  const k29c = key("coupon-code");
  const s29c = await sub(owner, { idempotencyKey: k29c, lines: [{ productId: A?.id, qty: 1 }], couponCode: "WELCOME50", payMethods: pay(tA) });
  const k29d = key("coupon-disc");
  const s29d = await sub(owner, { idempotencyKey: k29d, lines: [{ productId: A?.id, qty: 1 }], couponDiscountSatang: 1000, payMethods: pay(tA - 1000) });
  const crAfter = await P.couponRedemption.count({ where: { tenantId: tid } });
  const q29aOk =
    (refused(q29a, ["COUPON_INVALID"]) && noTotals(q29a)) ||
    (q29a?.ok === true && q29a.couponDiscountSatang === 0 && (q29a.memberConflicts ?? []).some((c: Any) => c?.code === "COUPON_INVALID"));
  chk("P1.3-S3.29", q29aOk && refused(q29b, ["VALIDATION"]) && noTotals(q29b) && refused(s29c, ["COUPON_INVALID"]) && refused(s29d, ["VALIDATION"]) && !(await saleByKey(k29c)) && !(await saleByKey(k29d)) && crAfter === crBefore,
    "โค้ดใช้ไม่ได้: quote ไม่มีส่วนลด + COUPON_INVALID · submit COUPON_INVALID · ส่วนลดสตางค์ VALIDATION ×2 · ไม่มีบิล · CouponRedemption คงเดิม",
    `${[q29a, q29b, s29c, s29d].map(codeOf).join(",")} · q29a coupon ${q29a?.couponDiscountSatang} conflicts ${JSON.stringify(q29a?.memberConflicts ?? null).slice(0, 80)} · redemption ${crBefore}→${crAfter}`);
  // S3.30 Q22 ทรงบรรทัด quote ตรงลำดับ + Q7 subtotal ก่อนส่วนลดบรรทัด
  const q30 = await quote(owner, { lines: [
    { productId: B?.id, qty: 1, discount: { type: "AMOUNT", value: 1000 } },
    { name: "ค่าส่งในเมือง", qty: 1, unitPriceSatang: 3000 },
    { productId: A?.id, qty: 2, unitPriceSatang: 1 },
  ] });
  const want30: [string | null, number, number, number, number][] = [[B?.id ?? "?", 9500, 9500, 1000, 8500], [null, 3000, 3000, 0, 3000], [A?.id ?? "?", 6500, 13000, 0, 13000]];
  const bad30 = want30.flatMap(([pid, up, gr, dc, lt], i) => {
    const l = linesOf(q30)[i];
    if (!l) return [`#${i} ไม่มี`];
    const got = [l.productId ?? null, l.unitPriceSatang, l.grossSatang, l.discountSatang, l.lineTotalSatang];
    const ints = [l.unitPriceSatang, l.grossSatang, l.discountSatang, l.lineTotalSatang].every((x) => Number.isInteger(x));
    return got.join("|") === [pid, up, gr, dc, lt].join("|") && ints ? [] : [`#${i} ${short(got, 80)}`];
  });
  chk("P1.3-S3.30", q30?.ok === true && linesOf(q30).length === 3 && bad30.length === 0 && q30.subtotalSatang === 25500 && q30.lineDiscountSatang === 1000,
    "3 บรรทัดตามลำดับ · ราคาเซิร์ฟเวอร์ · subtotal 25500 (ก่อนส่วนลด) · lineDiscount 1000", `${codeOf(q30)} n ${linesOf(q30).length} · ${bad30.join(" · ") || "ตรง"} · sub ${q30?.subtotalSatang} ld ${q30?.lineDiscountSatang}`);
  // S3.31 ราคาเปลี่ยนระหว่าง quote กับ submit (เซิร์ฟเวอร์อ่านราคาใหม่ตอน submit ไม่ใช้ quote ที่จำไว้)
  const PC = ["PRICE_CHANGED"]; // มติ 3.1 ข้อ 2: ยอดที่คาด ≠ ยอดเซิร์ฟเวอร์ ⇒ PRICE_CHANGED เสมอ (ตรวจก่อนการจ่าย)
  const q31a = await quote(owner, { lines: [{ productId: RP?.id, qty: 2 }] });
  const up31a = linesOf(q31a)[0]?.unitPriceSatang;
  let setOk = false;
  try {
    must("setPrice(RP)", await call(catalog, "setPrice", cctx, RP?.id, 5600));
    setOk = true;
  } catch (e) {
    console.log(`  (S3.31 setPrice ไม่ได้: ${(e as Error).message.slice(0, 80)})`);
  }
  // s31a: คาดยอดเก่า + จ่ายยอดเก่า · s31b: คาดยอดเก่า + จ่ายยอดใหม่ (ลำดับตรวจ: คาดก่อนจ่าย ⇒ ยัง PRICE_CHANGED)
  const oldTotal = q31a?.grandTotalSatang ?? 10000;
  const k31a = key("stale-expect");
  const s31a = await sub(owner, { idempotencyKey: k31a, lines: [{ productId: RP?.id, qty: 2 }], payMethods: pay(oldTotal), expectedGrandTotalSatang: oldTotal });
  const k31b = key("stale-total");
  const s31b = await sub(owner, { idempotencyKey: k31b, lines: [{ productId: RP?.id, qty: 2 }], payMethods: pay(oldTotal + 1200), expectedGrandTotalSatang: oldTotal });
  const q31c = await quote(owner, { lines: [{ productId: RP?.id, qty: 2 }] });
  const k31c = key("repriced");
  const s31c = q31c?.ok ? await sub(owner, { idempotencyKey: k31c, lines: [{ productId: RP?.id, qty: 2 }], payMethods: pay(q31c.grandTotalSatang) }) : q31c;
  const l31c = await lineOfSale(k31c);
  const stale31 = await P.posSaleLine.count({ where: { tenantId: tid, productId: RP?.id ?? "-", unitPriceSatang: 5000 } });
  // คำปฏิเสธ PRICE_CHANGED พกยอดสดของ quote มาด้วย (จอแสดงใหม่ได้ทันที)
  const fresh31 = s31a?.grandTotalSatang === q31c?.grandTotalSatang && linesOf(s31a)[0]?.unitPriceSatang === 5600;
  chk("P1.3-S3.31", setOk && up31a === 5000 && refused(s31a, PC) && fresh31 && refused(s31b, PC) && !(await saleByKey(k31a)) && !(await saleByKey(k31b)) && linesOf(q31c)[0]?.unitPriceSatang === 5600 && s31c?.ok === true && l31c?.unitPriceSatang === 5600 && stale31 === 0,
    "ราคาเดิม 5000 → คาดยอดเก่า PRICE_CHANGED ×2 + ยอดสด · quote ใหม่ 5600 · PAID @5600 · 0 บรรทัด @5000", `set ${setOk} · q ${up31a} · ${codeOf(s31a)} fresh ${fresh31} (${s31a?.grandTotalSatang}) · ${codeOf(s31b)} · re-q ${linesOf(q31c)[0]?.unitPriceSatang} · ${codeOf(s31c)} @${l31c?.unitPriceSatang} · stale ${stale31}`);
  // S3.32 Σ payMethods = ยอด (หลายวิธี · ค่าผิดรูป)
  const k32 = key("split");
  const s32 = await sub(owner, { idempotencyKey: k32, lines: [{ productId: A?.id, qty: 1 }], payMethods: [{ type: "CASH", amountSatang: 4000 }, { type: "PROMPTPAY", amountSatang: tA - 4000 }], cashReceivedSatang: 4000 });
  const sale32 = await saleByKey(k32);
  const pays32 = sale32 ? ((await P.posPayment.findMany({ where: { saleId: sale32.id } })) as Any[]) : [];
  const BADPAY = ["VALIDATION", "INVALID_LINE", "PAYMENT_MISMATCH"];
  const badPays: [string, Any[], string[]][] = [
    ["short", [{ type: "CASH", amountSatang: 4000 }, { type: "PROMPTPAY", amountSatang: tA - 4001 }], ["PAYMENT_MISMATCH"]],
    ["negative", [{ type: "CASH", amountSatang: tA + 1000 }, { type: "PROMPTPAY", amountSatang: -1000 }], BADPAY],
    ["fraction", [{ type: "CASH", amountSatang: tA - 0.5 }, { type: "PROMPTPAY", amountSatang: 0.5 }], BADPAY],
    ["empty", [], BADPAY],
  ];
  const r32: string[] = [];
  let ok32 = true;
  for (const [label, pm, codes] of badPays) {
    const k = key(`pay-${label}`);
    const r = await sub(owner, { idempotencyKey: k, lines: [{ productId: A?.id, qty: 1 }], payMethods: pm, expectedGrandTotalSatang: tA });
    const made = !!(await saleByKey(k));
    r32.push(`${label}:${codeOf(r)}${made ? "+บิล" : ""}`);
    if (!refused(r, codes) || made) ok32 = false;
  }
  chk("P1.3-S3.32", s32?.ok === true && pays32.length === 2 && pays32.reduce((t, p) => t + p.amountSatang, 0) === sale32?.grandTotalSatang && sale32?.grandTotalSatang === tA && ok32,
    "split PAID 2 แถว Σ = ยอด · ขาด/ติดลบ/เศษ/ว่าง ปฏิเสธ ไม่มีบิล", `${codeOf(s32)} pays ${pays32.length} Σ ${pays32.reduce((t, p) => t + p.amountSatang, 0)}/${sale32?.grandTotalSatang} · ${r32.join(" ")}`);
  // S3.33 เพดานส่วนลดที่ quote (ปฏิเสธ ไม่ clamp) + บรรทัด/บิลติดลบ
  const DEL = ["DISCOUNT_EXCEEDS_LIMIT"];
  const q33a = await quote(cashier, { lines: [{ productId: A?.id, qty: 1, discount: { type: "PERCENT", value: 1500 } }] });
  const q33b = await quote(cashier, { lines: [{ productId: A?.id, qty: 1 }], billDiscount: { type: "PERCENT", value: 1500 } });
  const q33c = await quote(cashier, { lines: [{ productId: A?.id, qty: 1 }], billDiscount: { type: "AMOUNT", value: 650 } });
  const q33d = await quote(cashier, { lines: [{ productId: A?.id, qty: 1 }], billDiscount: { type: "AMOUNT", value: 651 } });
  const q33e = await quote(owner, { lines: [{ productId: A?.id, qty: 1, discount: { type: "AMOUNT", value: 6501 } }] });
  const k33f = key("neg-line");
  const s33f = await sub(owner, { idempotencyKey: k33f, lines: [{ productId: A?.id, qty: 1, discount: { type: "AMOUNT", value: 6501 } }], payMethods: pay(tA) }); // รอบ 3.2: ไม่ใช้รายการจ่าย 0
  const k33g = key("neg-bill");
  const s33g = await sub(owner, { idempotencyKey: k33g, lines: [{ productId: A?.id, qty: 1 }], billDiscount: { type: "AMOUNT", value: 6501 }, payMethods: pay(tA) });
  const neg33 = (await P.posSaleLine.count({ where: { tenantId: tid, unitId: unit.id, lineTotalSatang: { lt: 0 } } })) + (await P.posSale.count({ where: { tenantId: tid, unitId: unit.id, grandTotalSatang: { lt: 0 } } }));
  chk("P1.3-S3.33", refused(q33a, DEL) && noTotals(q33a) && refused(q33b, DEL) && noTotals(q33b) && q33c?.ok === true && q33c.grandTotalSatang === 5850 && refused(q33d, DEL) && noTotals(q33d)
      && refused(q33e, ["LINE_DISCOUNT_EXCEEDS_LINE"]) && refused(s33f, ["LINE_DISCOUNT_EXCEEDS_LINE"]) && refused(s33g, ["BILL_DISCOUNT_EXCEEDS_TOTAL"]) && !(await saleByKey(k33f)) && !(await saleByKey(k33g)) && neg33 === 0,
    "15%/15%/651 ปฏิเสธไม่มียอด · 650 → 5850 · บรรทัด/บิลติดลบ ปฏิเสธ · 0 แถวติดลบ",
    `${codeOf(q33a)}/${noTotals(q33a)} · ${codeOf(q33b)} · ${codeOf(q33c)}=${q33c?.grandTotalSatang} · ${codeOf(q33d)} · ${codeOf(q33e)} · ${codeOf(s33f)} · ${codeOf(s33g)} · neg ${neg33}`);
  // S3.34 qty ฝั่งเซิร์ฟเวอร์
  const QTYC = ["INVALID_LINE", "VALIDATION"];
  const r34: string[] = [];
  for (const v of [0, -1, 1.5, 10000, "2"] as unknown[]) r34.push(codeOf(await quote(owner, { lines: [{ productId: A?.id, qty: v }] })));
  const q34ok = await quote(owner, { lines: [{ productId: A?.id, qty: 9999 }] });
  const k34a = key("qty-10000");
  const s34a = await sub(owner, { idempotencyKey: k34a, lines: [{ productId: A?.id, qty: 10000 }], payMethods: pay(10000 * 6500) });
  const lines201 = Array.from({ length: 201 }, (_, i) => ({ productId: i % 2 ? A?.id : D?.id, qty: 1 }));
  const q34b = await quote(owner, { lines: lines201 });
  const k34c = key("201");
  const s34c = await sub(owner, { idempotencyKey: k34c, lines: lines201, payMethods: pay(100 * 6500) });
  chk("P1.3-S3.34", r34.every((c) => QTYC.includes(c)) && q34ok?.ok === true && linesOf(q34ok)[0]?.grossSatang === 9999 * 6500 && refused(s34a, QTYC) && !(await saleByKey(k34a)) && refused(q34b, ["TOO_MANY_LINES"]) && refused(s34c, ["TOO_MANY_LINES"]) && !(await saleByKey(k34c)),
    "5 ค่าผิด INVALID_LINE|VALIDATION · 9999 ได้ · submit 10000/201 ปฏิเสธ ไม่มีบิล", `${r34.join(",")} · 9999 ${codeOf(q34ok)}/${linesOf(q34ok)[0]?.grossSatang} · ${codeOf(s34a)} · ${codeOf(q34b)} · ${codeOf(s34c)}`);
  // S3.35 ขอบเขตสาขา/ร้านของ productId — ไม่คิดราคาให้ ไม่รั่วชื่อ
  const scopeCases: [string, string | undefined, string | undefined][] = [
    ["สาขา2", OTHER?.id, "สินค้าเฉพาะสาขาอื่น"],
    ["คลังY", W2?.id, "สินค้าคลังสาขาสอง"],
    ["ร้านอื่น", restoProd?.id, restoProd?.name],
  ];
  const r35: string[] = [];
  let ok35 = scopeCases.every(([, id]) => !!id);
  for (const [label, pid, nm] of scopeCases) {
    const qx = await quote(owner, { lines: [{ productId: pid ?? "-", qty: 1 }] });
    const kx = key(`scope-${label}`);
    const sx = await sub(owner, { idempotencyKey: kx, lines: [{ productId: pid ?? "-", qty: 1 }], payMethods: pay(1800) });
    const leak = !!nm && (JSON.stringify(qx).includes(nm) || JSON.stringify(sx).includes(nm));
    const made = !!(await saleByKey(kx));
    r35.push(`${label}:${codeOf(qx)}/${codeOf(sx)}${leak ? "+ชื่อรั่ว" : ""}${made ? "+บิล" : ""}${noTotals(qx) ? "" : "+มียอด"}`);
    if (!(refused(qx, PNF) && noTotals(qx) && refused(sx, PNF) && !leak && !made)) ok35 = false;
  }
  const q35pos = await quote(owner, { lines: [{ productId: OTHER?.id, qty: 1 }] }, c2);
  chk("P1.3-S3.35", ok35 && q35pos?.ok === true && linesOf(q35pos)[0]?.unitPriceSatang === 1500, "3 ทาง PRODUCT_NOT_FOUND ไม่มียอด ไม่รั่ว ไม่มีบิล · คู่บวกสาขา 2 = 1500",
    `${r35.join(" · ")} · สาขา2 ${codeOf(q35pos)} @${linesOf(q35pos)[0]?.unitPriceSatang}`);
  // S3.36 Addendum: ปฏิเสธต้อง "คืน" (server action ใน production ปิดข้อความของ error ที่ throw)
  const t36: [string, Any, (r: Any) => boolean][] = [
    ["q-NUL", await call(register, "registerCatalog", ctx, owner, { q: "กาแฟ\u0000" }), (r) => r?.ok === true || refused(r, ["VALIDATION"])],
    // มติ 3.1 ข้อ 9: limit ที่ไม่ใช่จำนวนเต็ม ≥ 1 และ cursor ผิดรูป = VALIDATION เท่านั้น (เกิน 500 = บีบ · S1.25)
    ["cursor-มั่ว", await call(register, "registerCatalog", ctx, owner, { cursor: "%%%not-a-cursor%%%" }), (r) => refused(r, ["VALIDATION"])],
    ["limit-0", await call(register, "registerCatalog", ctx, owner, { limit: 0 }), (r) => refused(r, ["VALIDATION"])],
    ["limit-1.5", await call(register, "registerCatalog", ctx, owner, { limit: 1.5 }), (r) => refused(r, ["VALIDATION"])],
    ["limit-str", await call(register, "registerCatalog", ctx, owner, { limit: "10" }), (r) => refused(r, ["VALIDATION"])],
    ["quote-lines-x", await quote(owner, { lines: "x" }), (r) => refused(r, ["VALIDATION", "INVALID_LINE"])],
    ["submit-null", await call(register, "submitRegisterSale", ctx, owner, null), (r) => refused(r, ["VALIDATION", "INVALID_LINE"])],
    ["status-NUL", await call(register, "registerStatus", { ...ctx, unitId: `${unit.id}\u0000` }, owner), (r) => refused(r, ["NOT_FOUND", "VALIDATION"])],
  ];
  const bad36 = t36.filter(([, r, ok]) => r?.threw === true || !ok(r) || (r?.ok === false && (typeof r.code !== "string" || typeof r.message !== "string"))).map(([l, r]) => `${l}:${r?.threw ? "THROW " : ""}${codeOf(r)}`);
  chk("P1.3-S3.36", bad36.length === 0, "8 กรณี: คืน {ok:false, code, message} ตามรหัส (q NUL ok ได้) ไม่ throw", bad36.join(" · ") || "ไม่มี throw");

  // ─── S3 รอบ 3.1 (มติผู้คุมงานต่อคำถาม r3) ───
  // S3.37 expectedGrandTotalSatang (มติ ข้อ 2): ลำดับ = คิดราคาใหม่ → คาด ≠ ยอด ⇒ PRICE_CHANGED → จ่าย ≠ ยอด ⇒ PAYMENT_MISMATCH
  const base37 = { lines: [{ productId: A?.id, qty: 1 }], payMethods: pay(tA), cashReceivedSatang: tA };
  const cases37: [string, Any, string][] = [
    ["ไม่ส่ง", base37, "VALIDATION"],
    ["เศษ", { ...base37, expectedGrandTotalSatang: tA + 0.5 }, "VALIDATION"],
    ["ติดลบ", { ...base37, expectedGrandTotalSatang: -1 }, "VALIDATION"],
    ["สตริง", { ...base37, expectedGrandTotalSatang: String(tA) }, "VALIDATION"],
    ["จ่ายต่าง", { ...base37, payMethods: pay(tA + 100), cashReceivedSatang: tA + 100, expectedGrandTotalSatang: tA }, "PAYMENT_MISMATCH"],
    ["คาดผิด+จ่ายผิด", { ...base37, payMethods: pay(tA + 200), cashReceivedSatang: tA + 200, expectedGrandTotalSatang: tA + 100 }, "PRICE_CHANGED"],
  ];
  const r37: string[] = [];
  let ok37 = true;
  for (const [label, input, want] of cases37) {
    const k = key(`exp-${label}`);
    const r = await subRaw(owner, { idempotencyKey: k, ...input });
    const made = !!(await saleByKey(k));
    r37.push(`${label}:${codeOf(r)}${made ? "+บิล" : ""}`);
    if (!refused(r, [want]) || made) ok37 = false;
  }
  chk("P1.3-S3.37", ok37, "ไม่ส่ง/เศษ/ติดลบ/สตริง VALIDATION · จ่ายต่าง PAYMENT_MISMATCH · คาดผิดก่อน PRICE_CHANGED · ไม่มีบิล", r37.join(" · "));
  // S3.38 วิธีจ่ายของ P1.3 = CASH | PROMPTPAY (มติ ข้อ 4 · P1.6 เปิดที่เหลือ) — createSale เดิมของโมดูลอื่นไม่เปลี่ยน (S3.22)
  const r38: string[] = [];
  let ok38 = true;
  // ORACLE-EDIT (P1.6 · มติ pos-brief-P1.6 §8 ข้อ 7 — อนุมัติให้แก้ตอน build): TRANSFER + CARD เป็นวิธีจ่ายของหน้าขายแล้ว (P1.6 R2)
  //   ⇒ สองตัวนี้ต้อง PAID (แถวจ่ายชนิดนั้น 1 แถว) · DEPOSIT / ROOM_CHARGE / รหัสมั่ว ยัง VALIDATION ไม่มีบิลเหมือนเดิม
  for (const t of ["TRANSFER", "CARD"]) {
    const k = key(`paytype-${t}`);
    const r = await sub(owner, { idempotencyKey: k, lines: [{ productId: A?.id, qty: 1 }], payMethods: [{ type: t, amountSatang: tA }] });
    const sale = await saleByKey(k);
    const pays = sale ? ((await P.posPayment.findMany({ where: { saleId: sale.id } })) as Any[]) : [];
    r38.push(`${t}:${codeOf(r)}${sale ? "+บิล" : ""}`);
    if (!(r?.ok === true && pays.length === 1 && pays[0].type === t)) ok38 = false;
  }
  for (const t of ["DEPOSIT", "ROOM_CHARGE", "QC_NOT_A_METHOD"]) {
    const k = key(`paytype-${t}`);
    const r = await sub(owner, { idempotencyKey: k, lines: [{ productId: A?.id, qty: 1 }], payMethods: [{ type: t, amountSatang: tA }] });
    const made = !!(await saleByKey(k));
    r38.push(`${t}:${codeOf(r)}${made ? "+บิล" : ""}`);
    if (!refused(r, ["VALIDATION"]) || made) ok38 = false;
  }
  const k38pp = key("promptpay-only");
  const s38pp = await sub(owner, { idempotencyKey: k38pp, lines: [{ productId: A?.id, qty: 1 }], payMethods: [{ type: "PROMPTPAY", amountSatang: tA }] });
  const sale38pp = await saleByKey(k38pp);
  const pays38 = sale38pp ? ((await P.posPayment.findMany({ where: { saleId: sale38pp.id } })) as Any[]) : [];
  chk("P1.3-S3.38", ok38 && s38pp?.ok === true && s38pp.changeSatang === 0 && pays38.length === 1 && pays38[0].type === "PROMPTPAY" && pays38[0].amountSatang === tA,
    "TRANSFER/CARD → PAID (P1.6 ORACLE-EDIT) · DEPOSIT/ROOM_CHARGE/มั่ว → VALIDATION ไม่มีบิล · PROMPTPAY ล้วน PAID ทอน 0", `${r38.join(" ")} · pp ${codeOf(s38pp)} ทอน ${s38pp?.changeSatang} pays ${pays38.map((p) => `${p.type}:${p.amountSatang}`).join(",")}`);
  // S3.39 เงินสดที่รับ (มติ ข้อ 4): ต้องส่งเมื่อมีส่วนเงินสด · ≥ ส่วนเงินสด · ทอน = รับ − ส่วนเงินสด
  const k39a = key("cash-no-recv");
  const s39a = await subRaw(owner, { idempotencyKey: k39a, lines: [{ productId: A?.id, qty: 1 }], payMethods: pay(tA), expectedGrandTotalSatang: tA });
  const k39b = key("cash-low-recv");
  const s39b = await sub(owner, { idempotencyKey: k39b, lines: [{ productId: A?.id, qty: 1 }], payMethods: pay(tA), cashReceivedSatang: tA - 1 });
  const k39c = key("cash-split-change");
  const s39c = await sub(owner, { idempotencyKey: k39c, lines: [{ productId: A?.id, qty: 1 }], payMethods: [{ type: "CASH", amountSatang: 4000 }, { type: "PROMPTPAY", amountSatang: tA - 4000 }], cashReceivedSatang: 5000 });
  const sale39c = await saleByKey(k39c);
  chk("P1.3-S3.39", refused(s39a, ["PAYMENT_MISMATCH"]) && !(await saleByKey(k39a)) && refused(s39b, ["PAYMENT_MISMATCH"]) && !(await saleByKey(k39b)) && s39c?.ok === true && s39c.changeSatang === 1000 && sale39c?.grandTotalSatang === tA,
    "ไม่ส่ง/รับขาด PAYMENT_MISMATCH ไม่มีบิล · เงินสด 4000 รับ 5000 + พร้อมเพย์ → ทอน 1000", `${codeOf(s39a)} · ${codeOf(s39b)} · ${codeOf(s39c)} ทอน ${s39c?.changeSatang}`);

  // ─── S3 รอบ 3.2 (ช่องโหว่ที่ผู้ตรวจ B1 พบ · มติผู้คุมงาน) ───
  const salesByKey = async (k: string) => P.posSale.count({ where: { tenantId: tid, idempotencyKey: keyIn(k) } });
  // S3.40 idempotency ไม่ขึ้นกับลำดับบรรทัด · payload ต่างจริง = IDEMPOTENCY_CONFLICT ที่พก saleId ของบิลเดิม
  const l40open = { productId: PP?.id, qty: 1, openPrice: true, unitPriceSatang: 6000 };
  const l40plain = { productId: PP?.id, qty: 1 };
  //   ตามมติตรงตัว: บรรทัดไม่มีส่วนลด [ราคาเปิด 6,000 ของ P, P ปกติ 4,500] — บรรทัด P ปกติที่มาก่อนต้องไม่ "กิน" บรรทัดราคาเปิดที่บันทึกไว้
  const base40 = { lines: [l40open, l40plain], payMethods: [{ type: "CASH", amountSatang: 4000 }, { type: "PROMPTPAY", amountSatang: 6500 }], cashReceivedSatang: 4000, expectedGrandTotalSatang: 10500 };
  const k40 = key("order");
  const s40 = await sub(owner, { idempotencyKey: k40, ...base40 });
  const s40swap = await sub(owner, { idempotencyKey: k40, ...base40, lines: [l40plain, l40open] });
  //   แบ่งส่วนลดต่างแต่ยอดเท่า ต้องมีส่วนลดในบิลต้นฉบับ ⇒ คีย์ที่สอง: [ราคาเปิด −500, P ปกติ] ยอด 10,000
  const base40d = { lines: [{ ...l40open, discount: { type: "AMOUNT", value: 500 } }, l40plain], payMethods: [{ type: "CASH", amountSatang: 4000 }, { type: "PROMPTPAY", amountSatang: 6000 }], cashReceivedSatang: 4000, expectedGrandTotalSatang: 10000 };
  const k40d = key("order-disc");
  const s40d = await sub(owner, { idempotencyKey: k40d, ...base40d });
  const var40: [string, string, Any, Any][] = [
    ["สินค้าอื่นราคาเท่ากัน", k40, s40, { ...base40, lines: [l40open, { productId: QQ?.id, qty: 1 }] }],
    ["สมาชิกอื่น", k40, s40, { ...base40, memberId: E.coffee.memberId }],
    ["แบ่งวิธีจ่ายต่าง", k40, s40, { ...base40, payMethods: [{ type: "CASH", amountSatang: 6500 }, { type: "PROMPTPAY", amountSatang: 4000 }], cashReceivedSatang: 6500 }],
    ["แบ่งส่วนลดต่าง", k40d, s40d, { ...base40d, lines: [l40open, { ...l40plain, discount: { type: "AMOUNT", value: 500 } }] }],
  ];
  const r40: string[] = [];
  let ok40 = s40d?.ok === true;
  for (const [label, k, orig, input] of var40) {
    const r = await sub(owner, { idempotencyKey: k, ...input });
    const carries = r?.saleId === orig?.saleId && !!orig?.saleId;
    r40.push(`${label}:${codeOf(r)}${carries ? "+saleId" : ""}`);
    if (!refused(r, ["IDEMPOTENCY_CONFLICT"]) || !carries) ok40 = false;
  }
  const n40 = (await salesByKey(k40)) + (await salesByKey(k40d));
  chk("P1.3-S3.40", s40?.ok === true && s40swap?.ok === true && s40swap.duplicated === true && s40swap.saleId === s40.saleId && ok40 && n40 === 2,
    "สลับลำดับ = บิลเดิม duplicated · 4 แบบต่างจริง IDEMPOTENCY_CONFLICT + saleId ของบิลเดิม · คีย์ละบิลเดียว", `${codeOf(s40)}/${codeOf(s40d)} · swap ${codeOf(s40swap)}/dup ${s40swap?.duplicated} · ${r40.join(" ")} · n ${n40}`);
  // S3.41 key ของบิลที่ void แล้ว — ห้ามตอบ ok (จอจะบอกว่าขายสำเร็จทั้งที่บิลถูกยกเลิก)
  const k41 = key("voided");
  const in41 = { idempotencyKey: k41, lines: [{ productId: A?.id, qty: 1 }], payMethods: pay(tA) };
  const s41 = await sub(owner, in41);
  let void41 = "";
  try {
    if (s41?.ok) await service.voidSale(tid, unit.id, s41.saleId);
    else void41 = "ไม่มีบิลให้ void";
  } catch (e) {
    void41 = (e as Error).message.slice(0, 60);
  }
  const s41b = await sub(owner, in41);
  const st41 = (await saleByKey(k41))?.status;
  const status41 = s41b?.saleStatus ?? s41b?.status;
  chk("P1.3-S3.41", s41?.ok === true && !void41 && st41 === "VOIDED" && refused(s41b, ["IDEMPOTENCY_CONFLICT"]) && s41b.saleId === s41.saleId && status41 === "VOIDED" && (await salesByKey(k41)) === 1,
    "VOIDED → IDEMPOTENCY_CONFLICT + saleId + สถานะ VOIDED", `${codeOf(s41)} void:${void41 || "ok"} st ${st41} · retry ${codeOf(s41b)} saleId:${s41b?.saleId === s41?.saleId} status:${status41}`);
  // S3.42 สิทธิ์สมาชิกอัตโนมัติ (ส่วนลดระดับ) — ORACLE-EDIT P1.12: หน้าขายคิดส่วนลดระดับเองแล้ว (quote = บิล) · MEMBER_RIGHTS_UNSUPPORTED ไม่ถูกคืน
  let cDisc: Any = null, cPlain: Any = null, fx42 = "";
  try {
    const sMem = await P.appSystem.create({ data: { tenantId: tid, type: "MEMBER", name: `${TAG} MEMBER` } });
    sb.memSysId = sMem.id;
    await sysSvc.linkUnit(tid, sMem.id, unit.id);
    const tDisc = await P.memberTierDef.create({ data: { tenantId: tid, systemId: sMem.id, key: `${TAG}-disc`, name: "ระดับมีส่วนลด" } });
    await P.memberTierBenefit.create({ data: { tenantId: tid, tierDefId: tDisc.id, type: "DISCOUNT_PCT", config: { pct: 10 } } });
    const tPlain = await P.memberTierDef.create({ data: { tenantId: tid, systemId: sMem.id, key: `${TAG}-plain`, name: "ระดับธรรมดา" } });
    cDisc = await P.customer.create({ data: { tenantId: tid, memberSystemId: sMem.id, name: `${TAG} สมาชิกมีส่วนลด`, tierDefId: tDisc.id } });
    sb.customerIds.push(cDisc.id);
    cPlain = await P.customer.create({ data: { tenantId: tid, memberSystemId: sMem.id, name: `${TAG} สมาชิกธรรมดา`, tierDefId: tPlain.id } });
    sb.customerIds.push(cPlain.id);
  } catch (e) {
    fx42 = (e as Error).message.slice(0, 80);
  }
  const quiet = async () => {
    for (let i = 0; i < 40; i++) {
      if ((await P.outboxEvent.count({ where: { tenantId: { in: envMod.PQC_TENANT_IDS }, status: "PENDING" } })) === 0) return;
      await new Promise((r) => setTimeout(r, 500));
    }
  };
  await quiet();
  const c42a = await snapshotCounts();
  const q42 = await quote(owner, { lines: [{ productId: A?.id, qty: 1 }], memberId: cDisc?.id ?? "-" });
  const k42 = key("member-tier");
  const g42 = q42?.ok === true ? Number(q42.grandTotalSatang) : tA;
  const s42 = await sub(owner, { idempotencyKey: k42, lines: [{ productId: A?.id, qty: 1 }], memberId: cDisc?.id ?? "-", payMethods: pay(g42) });
  const sale42 = await saleByKey(k42);
  await quiet();
  const c42b = await snapshotCounts();
  const drift42 = Object.keys(c42a).filter((k) => c42a[k] !== c42b[k]).map((k) => `${k}:${c42a[k]}→${c42b[k]}`);
  const k42p = key("member-plain");
  const s42p = await sub(owner, { idempotencyKey: k42p, lines: [{ productId: A?.id, qty: 1 }], memberId: cPlain?.id ?? "-", payMethods: pay(tA) });
  const sale42p = await saleByKey(k42p);
  const tier42 = Number(q42?.tierDiscountSatang ?? 0);
  const tierOk = q42?.ok === true && tier42 > 0 && q42.memberDiscountSatang === tier42 && q42.grandTotalSatang === tA - tier42
    && s42?.ok === true && sale42?.memberId === cDisc?.id && sale42?.tierDiscountSatang === tier42 && sale42?.grandTotalSatang === q42.grandTotalSatang;
  chk("P1.3-S3.42", !fx42 && tierOk && codeOf(q42) !== "MEMBER_RIGHTS_UNSUPPORTED" && codeOf(s42) !== "MEMBER_RIGHTS_UNSUPPORTED" && s42p?.ok === true && sale42p?.memberId === cPlain?.id && sale42p?.grandTotalSatang === tA,
    "มีส่วนลดระดับ: quote ok ส่วนลดระดับ = บิล · ไม่มี MEMBER_RIGHTS_UNSUPPORTED · ไม่มีส่วนลด: PAID แนบสมาชิก",
    `${fx42 ? `fixture:${fx42} · ` : ""}${codeOf(q42)} tier ${tier42} grand ${q42?.grandTotalSatang}/${tA} · ${codeOf(s42)} sale tier ${sale42?.tierDiscountSatang} grand ${sale42?.grandTotalSatang} · drift(ข้อมูล) ${drift42.join(",") || "0"} · plain ${codeOf(s42p)} member:${sale42p?.memberId === cPlain?.id}`);
  // S3.43 รูปวิธีจ่าย
  const r43: string[] = [];
  const zeroEntry = await sub(owner, { idempotencyKey: key("pay-zero-entry"), lines: [{ productId: A?.id, qty: 1 }], payMethods: [{ type: "CASH", amountSatang: 0 }, { type: "PROMPTPAY", amountSatang: tA }] });
  const zeroOnly = await sub(owner, { idempotencyKey: key("pay-zero-only"), lines: [{ productId: A?.id, qty: 1, discount: { type: "PERCENT", value: 10000 } }], payMethods: [{ type: "CASH", amountSatang: 0 }] });
  const k43a = key("zero-bill-discount");
  const z43a = await sub(owner, { idempotencyKey: k43a, lines: [{ productId: A?.id, qty: 1, discount: { type: "PERCENT", value: 10000 } }], payMethods: [] });
  const k43b = key("zero-bill-open");
  const z43b = await sub(owner, { idempotencyKey: k43b, lines: [{ productId: NOPRICE?.id, qty: 1, openPrice: true, unitPriceSatang: 0 }], payMethods: [] });
  const k43c = key("empty-nonzero");
  const z43c = await sub(owner, { idempotencyKey: k43c, lines: [{ productId: A?.id, qty: 1 }], payMethods: [], expectedGrandTotalSatang: tA });
  const sale43a = await saleByKey(k43a);
  const sale43b = await saleByKey(k43b);
  const pays43 = sale43a ? await P.posPayment.count({ where: { saleId: sale43a.id } }) : -1;
  r43.push(`0+PP:${codeOf(zeroEntry)}`, `0เดี่ยว:${codeOf(zeroOnly)}`, `ลด100%:${codeOf(z43a)}/${sale43a?.grandTotalSatang}`, `เปิด0:${codeOf(z43b)}/${sale43b?.grandTotalSatang}`, `ว่าง≠0:${codeOf(z43c)}`);
  chk("P1.3-S3.43", refused(zeroEntry, ["VALIDATION"]) && refused(zeroOnly, ["VALIDATION"]) && z43a?.ok === true && sale43a?.grandTotalSatang === 0 && pays43 === 0 && z43b?.ok === true && sale43b?.grandTotalSatang === 0
      && refused(z43c, ["PAYMENT_MISMATCH"]) && !(await saleByKey(k43c)),
    "ยอด 0 ในรายการจ่าย VALIDATION ×2 · บิล 0 + จ่ายว่าง PAID ×2 (0 แถวจ่าย) · ว่างกับยอด ≠ 0 PAYMENT_MISMATCH", r43.join(" · "));
  // S3.44 ส่งซ้ำทุกไบต์ → เงินทอนเท่าเดิม
  const in44 = { idempotencyKey: key("same-change"), lines: [{ productId: A?.id, qty: 1 }], payMethods: pay(tA), cashReceivedSatang: tA + 3500 };
  const s44a = await sub(owner, in44);
  const s44b = await sub(owner, in44);
  chk("P1.3-S3.44", s44a?.ok === true && s44a.changeSatang === 3500 && s44b?.ok === true && s44b.duplicated === true && s44b.saleId === s44a.saleId && s44b.changeSatang === s44a.changeSatang,
    "ทอน 3500 ทั้งสองคำตอบ · duplicated", `${codeOf(s44a)} ${s44a?.changeSatang} · ${codeOf(s44b)} ${s44b?.changeSatang} dup ${s44b?.duplicated}`);
  // S3.45 สุ่มเทียบ priceCart (client) กับ quoteRegisterCart (server)
  const cat45 = await call(register, "registerCatalog", ctx, owner, { limit: 200 });
  const pool45 = ((cat45?.products ?? []) as Any[]).filter((p) => p.priceSatang !== null && p.soldOutReason !== "UNAVAILABLE" && p.requiredOptionGroupCount === 0).slice(0, 40);
  const vat45 = await call(register, "registerVatConfig", ctx);
  const vcfg45 = { mode: (vat45?.mode ?? "NONE") as "NONE" | "INCLUDED" | "EXCLUDED", rateBp: Number(vat45?.rateBp ?? 0) };
  let seed45 = 20261002;
  const rnd45 = (n: number) => {
    seed45 = (seed45 * 1103515245 + 12345) % 2147483648;
    return n <= 0 ? 0 : seed45 % n;
  };
  const F45 = ["subtotalSatang", "lineDiscountSatang", "billDiscountSatang", "couponDiscountSatang", "netSatang", "vatSatang", "grandTotalSatang"];
  let n45 = 0, ok45n = 0, misN45 = 0;
  const mis45: string[] = [];
  for (let k = 0; k < 520 && pool45.length >= 10; k++) {
    const asStaff = rnd45(3) === 0;
    const a = asStaff ? cashier : owner;
    const pureLines: Line[] = [];
    const srvLines: Any[] = [];
    for (let i = 0, n = 1 + rnd45(6); i < n; i++) {
      const qty = 1 + rnd45(12);
      let unitP: number;
      let srv: Any;
      if (!asStaff && rnd45(10) === 0) {
        unitP = rnd45(50000);
        srv = { name: `สุ่ม ${k}-${i}`, qty, unitPriceSatang: unitP };
      } else {
        const p = pool45[rnd45(pool45.length)];
        const open = !asStaff && rnd45(6) === 0 ? rnd45(100000) : null;
        unitP = open ?? p.priceSatang;
        srv = { productId: p.id, qty, ...(open !== null ? { openPrice: true, unitPriceSatang: open } : {}) };
      }
      const gross = qty * unitP;
      const dk = rnd45(5);
      const disc = dk === 2 ? { type: "AMOUNT" as const, value: rnd45(asStaff ? Math.floor(gross / 8) + 1 : gross + 2) } : dk === 3 ? { type: "PERCENT" as const, value: rnd45(asStaff ? 1300 : 10500) } : undefined;
      pureLines.push({ qty, unitPriceSatang: unitP, ...(disc ? { discount: disc } : {}) });
      srvLines.push({ ...srv, ...(disc ? { discount: disc } : {}) });
    }
    const bill = rnd45(4) === 0 ? (rnd45(2) ? { type: "AMOUNT" as const, value: rnd45(2000) } : { type: "PERCENT" as const, value: rnd45(asStaff ? 1200 : 3000) }) : undefined;
    const pr = price({ lines: pureLines, billDiscount: bill, vat: vcfg45, maxDiscountBp: asStaff ? 1000 : null });
    const sr = await quote(a, { lines: srvLines, ...(bill ? { billDiscount: bill } : {}) });
    n45++;
    let same: boolean;
    if (pr?.ok === true && sr?.ok === true) {
      ok45n++;
      same = F45.every((f) => pr[f] === sr[f]) && (pr.lines as Any[]).length === linesOf(sr).length
        && (pr.lines as Any[]).every((l: Any, i: number) => ["unitPriceSatang", "grossSatang", "discountSatang", "lineTotalSatang"].every((f) => l[f] === linesOf(sr)[i]?.[f]));
    } else same = pr?.ok === false && sr?.ok === false && pr.code === sr.code;
    if (!same) {
      misN45++;
      if (mis45.length < 3) mis45.push(`#${k}${asStaff ? "S" : "O"} pure ${pr?.ok ? pr.grandTotalSatang : codeOf(pr)} srv ${sr?.ok ? sr.grandTotalSatang : codeOf(sr)}`);
    }
  }
  chk("P1.3-S3.45", pool45.length >= 10 && n45 >= 500 && misN45 === 0 && ok45n >= 300, "≥500 ตะกร้า · 0 ต่าง · ≥300 ตะกร้าคิดได้", `pool ${pool45.length} · n ${n45} ok ${ok45n} · ต่าง ${misN45}: ${mis45.join(" · ") || "-"}`);
  // S3.46 ผลข้างเคียงเทียบทางเดิม (createSale ของโมดูลอื่น) — สินค้านับสต็อก B
  const qB46 = await quote(owner, { lines: [{ productId: B?.id, qty: 1 }] });
  const k46r = key("side-register");
  const s46r = await sub(owner, { idempotencyKey: k46r, lines: [{ productId: B?.id, qty: 1 }], payMethods: pay(qB46?.grandTotalSatang ?? 9500) });
  const k46l = key("side-legacy");
  let leg46 = "";
  try {
    await service.createSale({ tenantId: tid, unitId: unit.id, systemId: sPos.id, sourceModule: "POS", idempotencyKey: k46l,
      lines: [{ name: "ครัวซองต์อัลมอนด์ทดสอบ", qty: 1, unitPriceSatang: 9500, discountSatang: 0, itemId: B?.invItemId }], payMethods: [{ type: "CASH", amountSatang: 9500 }] });
  } catch (e) {
    leg46 = (e as Error).message.slice(0, 60);
  }
  const shape46 = async (k: string) => {
    const sale = await P.posSale.findFirst({ where: { tenantId: tid, idempotencyKey: keyIn(k) }, include: { lines: true, payments: true } });
    if (!sale) return null;
    const mv = (await P.invMovement.findMany({ where: { tenantId: tid, refType: "PosSale", refId: sale.id } })) as Any[];
    const ev = ((await P.outboxEvent.findMany({ where: { tenantId: tid, idempotencyKey: { startsWith: `PosSale#${sale.id}#` } }, select: { type: true } })) as Any[]).map((e) => e.type).sort();
    const gl = (await P.accountJournalEntry.findMany({ where: { tenantId: tid, refType: "InvMovement", refId: { in: mv.map((m) => m.id) } }, include: { lines: true } })) as Any[];
    const keyOk = mv.every((m) => sale.lines.some((l: Any) => m.idempotencyKey === `pos-consume-${sale.id}-${l.id}`));
    return {
      movements: mv.map((m) => `${m.type}:${m.qtyDelta}:${m.itemId === B?.invItemId}`).sort().join(","),
      keyOk,
      events: ev.join(","),
      bridge: JSON.stringify({
        sale: [sale.status, sale.sourceModule, sale.subtotalSatang, sale.discountSatang, sale.vatSatang, sale.grandTotalSatang, sale.memberId, sale.giftCardId ?? null],
        lines: sale.lines.map((l: Any) => [l.name, l.qty, l.unitPriceSatang, l.discountSatang, l.lineTotalSatang, l.itemId, l.serviceId]),
        payments: sale.payments.map((p: Any) => [p.type, p.amountSatang]),
      }),
      cogs: gl.map((e) => e.lines.map((l: Any) => `${l.accountId}:${l.debit}:${l.credit}`).sort().join("|")).sort().join(" / "),
    };
  };
  const sh46r = await shape46(k46r);
  const sh46l = await shape46(k46l);
  const sameSide = !!sh46r && !!sh46l && sh46r.movements === sh46l.movements && sh46r.movements === "OUT:-1:true" && sh46r.keyOk && sh46l.keyOk && sh46r.events === sh46l.events && sh46r.events.includes("pos.sale.paid") && sh46r.bridge === sh46l.bridge && sh46r.cogs === sh46l.cogs;
  // (a) AUTO ที่ไม่เคยมีสต็อก: ขายผ่านหน้าใหม่ไม่ตัดสต็อก (C2) — ความต่างที่รับรองจากทางเดิม (ทางเดิมผูก itemId แล้วตัด)
  const qN46 = await quote(owner, { lines: [{ productId: NEVER?.id, qty: 1 }] });
  const k46n = key("side-never");
  const s46n = qN46?.ok ? await sub(owner, { idempotencyKey: k46n, lines: [{ productId: NEVER?.id, qty: 1 }], payMethods: pay(qN46.grandTotalSatang) }) : qN46;
  const l46n = await lineOfSale(k46n);
  const mvN = NEVER ? await P.invMovement.count({ where: { tenantId: tid, itemId: NEVER.invItemId } }) : -1;
  const vN = NEVER ? await bySku(`${TAG}-NEVER`) : null;
  const okNever = s46n?.ok === true && l46n?.productId === NEVER?.id && l46n?.itemId === null && mvN === 0 && (NEVER ? await onHandOf(NEVER.invItemId) : NaN) === 0 && vN?.trackStock === false && vN?.soldOut === false;
  // (b) บริการจากแคตตาล็อก: serviceId = InvItem · ไม่ตัดสต็อก (R5) — บัญชีรายได้ที่ bridge ใช้ = บันทึกในโน้ต (ค่าที่สังเกต)
  const k46s = key("side-service");
  const s46s = await sub(owner, { idempotencyKey: k46s, lines: [{ productId: SVC?.id, qty: 1 }], payMethods: pay(30000) });
  const l46s = await lineOfSale(k46s);
  const sale46s = await saleByKey(k46s);
  const mvS = sale46s ? await outMoves(sale46s.id) : -1;
  const okSvc = s46s?.ok === true && l46s?.serviceId === SVC?.invItemId && l46s?.itemId === null && l46s?.productId === SVC?.id && mvS === 0;
  chk("P1.3-S3.46", !leg46 && sameSide && okNever && okSvc, "B: movement/outbox/ข้อมูล bridge/COGS เท่าทางเดิม · AUTO ไม่เคยมีสต็อก ไม่ตัด · บริการ serviceId ไม่ตัด",
    `legacy:${leg46 || "ok"} · reg ${short(sh46r && { m: sh46r.movements, k: sh46r.keyOk, e: sh46r.events, c: sh46r.cogs.length }, 140)} · same:${sameSide} · never:${okNever} (${codeOf(s46n)} item ${l46n?.itemId} mv ${mvN}) · svc:${okSvc} (${codeOf(s46s)} mv ${mvS})`);
  // S3.47 wildcard pos.* = ตั้งราคาเปิดได้ (rbac วันนี้) · มีแค่ pos.sale.create = ไม่ได้
  const staffW = { ...cashier, permissions: { "pos.*": true } };
  const k47a = key("wild-open");
  const s47a = await sub(staffW, { idempotencyKey: k47a, ...openQ, payMethods: pay(4200) });
  const l47a = await lineOfSale(k47a);
  const k47b = key("create-only-open");
  const s47b = await sub({ ...cashier, permissions: { "pos.sale.create": true } }, { idempotencyKey: k47b, ...openQ, payMethods: pay(4200) });
  chk("P1.3-S3.47", s47a?.ok === true && l47a?.unitPriceSatang === 4200 && refused(s47b, ["PERMISSION_DENIED"]) && !(await saleByKey(k47b)),
    "pos.* → PAID @4200 · pos.sale.create อย่างเดียว → PERMISSION_DENIED", `${codeOf(s47a)} @${l47a?.unitPriceSatang} · ${codeOf(s47b)}`);
  // S3.48 รูปแบบ idempotencyKey
  const bad48: [string, unknown][] = [["ว่าง", ""], ["ช่องว่างล้วน", "   \t "], ["ตัวเลข", 12345], ["ยาว101", `${KTAG}-k101-`.padEnd(101, "x")]];
  const r48: string[] = [];
  let ok48 = true;
  for (const [label, k] of bad48) {
    const r = await sub(owner, { idempotencyKey: k, lines: [{ productId: A?.id, qty: 1 }], payMethods: pay(tA) });
    const made = typeof k === "string" ? !!(await saleByKey(k)) : false;
    r48.push(`${label}:${codeOf(r)}${made ? "+บิล" : ""}`);
    if (!refused(r, ["VALIDATION"]) || made) ok48 = false;
  }
  const k48ok = `${KTAG}-k100-`.padEnd(100, "y"); // R4 K1: '.' ของ TAG ไม่อยู่ในชุดอักขระคีย์
  const s48ok = await sub(owner, { idempotencyKey: k48ok, lines: [{ productId: A?.id, qty: 1 }], payMethods: pay(tA) });
  chk("P1.3-S3.48", ok48 && s48ok?.ok === true, "ว่าง/ช่องว่าง/ตัวเลข/101 → VALIDATION ไม่มีบิล · 100 ตัว PAID", `${r48.join(" ")} · 100:${codeOf(s48ok)}`);
  // S3.49 เพดานส่วนลด vs การปัด ที่ quote ของเซิร์ฟเวอร์ (กรณีเดียวกับ S2.15 · STAFF)
  const byPrice49: Record<number, Any> = { 3335: P3335, 3333: P3333, 12345: P12345, 10000: P10000 };
  const r49 = [] as { label: string; got: string; want: string }[];
  for (const [label, lines, bill, want] of ROUNDING_CASES) {
    const q = await quote(cashier, { lines: lines.map((l) => ({ productId: byPrice49[l.unitPriceSatang]?.id ?? "-", qty: l.qty, ...(l.discount ? { discount: l.discount } : {}) })), ...(bill ? { billDiscount: bill } : {}) });
    r49.push({ label, got: q?.ok === true ? `OK:${q.grandTotalSatang}` : codeOf(q), want });
  }
  const bad49 = r49.filter((x) => x.got !== x.want);
  chk("P1.3-S3.49", bad49.length === 0, ROUNDING_CASES.map(([l, , , w]) => `${l}=${w}`).join(" · "), bad49.map((x) => `${x.label}:${x.got}≠${x.want}`).join(" · ") || "ตรงทุกกรณี");

  // ─── S3 รอบ R4 (ผู้ล่าโค้ด 5f97add4 · มติ K1–K5 · สูตร probe 1/2/3/5 ของผู้ล่า) ───
  console.log("\n── S3 รอบ R4 (K1–K5) ──");
  /** แถวที่ "ยึด" คีย์ดิบนี้ตรงตัว (ไม่ผ่าน keyIn — คือสิ่งที่ hotel/service.ts ใช้หา hotel-sale-<id>) */
  const rawRow = async (k: string) => P.posSale.findUnique({ where: { tenantId_idempotencyKey: { tenantId: tid, idempotencyKey: k } } });
  const posSaleById = async (id: unknown) => (typeof id === "string" ? P.posSale.findFirst({ where: { id, tenantId: tid } }) : null);
  const legacySale = async (input: Any): Promise<Any> => {
    try {
      return await service.createSale({ tenantId: tid, unitId: unit.id, systemId: sPos.id, ...input });
    } catch (e) {
      return { ok: false, code: (e as Error).message.slice(0, 80) };
    }
  };
  // สินค้า R4 สองตัว (catalog · ทุกสาขา · ไม่ผูกคลัง ⇒ ขายได้ทั้งสาขา sandbox และสาขา 2): R4P = K1/K2/K4 · R4R = K3 (ถูกเปลี่ยนราคา)
  let R4P: Any = null, R4R: Any = null, fxR4 = "";
  try {
    R4P = await mkFree(`สินค้า R4 ${TAG}`, 3000);
    R4R = await mkFree(`สินค้า R4 แข่ง ${TAG}`, 4000);
  } catch (e) {
    fxR4 = (e as Error).message.slice(0, 80);
  }
  const lR4 = [{ productId: R4P?.id ?? "-", qty: 1 }];
  const tR4 = (await quote(owner, { lines: lR4 }))?.grandTotalSatang ?? 3000;

  // S3.50 K1 — probe 1: ยึดคีย์ hotel-sale-<reservationId> ผ่านหน้าขาย แล้วเช็คเอาท์ (ทางเดียวกับ hotel/service.ts: pos.createSale HOTEL คีย์เดียวกัน)
  const r50: string[] = [];
  let ok50 = !fxR4 && !!R4P;
  {
    const kSq = `hotel-sale-${KTAG}-resv1`;
    const s = await sub(owner, { idempotencyKey: kSq, lines: lR4, payMethods: pay(tR4) });
    const occupied = await rawRow(kSq);
    const own = s?.ok ? await posSaleById(s.saleId) : null;
    const h = await legacySale({ sourceModule: "HOTEL", sourceId: `${KTAG}-resv1`, idempotencyKey: kSq, lines: [{ name: "ค่าห้อง 1 คืน", qty: 1, unitPriceSatang: 150000 }], payMethods: [{ type: "CASH", amountSatang: 150000 }] });
    const hRow = await rawRow(kSq);
    const okSq = s?.ok === true && !occupied && own?.idempotencyKey === `${REG_NS}${kSq}` && own?.sourceModule === "POS"
      && typeof h?.saleId === "string" && h.saleId !== s.saleId && hRow?.id === h.saleId && hRow?.sourceModule === "HOTEL" && hRow?.grandTotalSatang === 150000 && hRow?.status === "PAID";
    r50.push(`squat:${codeOf(s)} เก็บ=${own?.idempotencyKey === `${REG_NS}${kSq}` ? "reg2:…" : short(own?.idempotencyKey, 40)} ยึดดิบ:${!!occupied} เช็คเอาท์:${h?.saleId === s?.saleId ? "ได้บิลหน้าขาย❌" : hRow?.sourceModule ?? short(h?.code, 40)}/${hRow?.grandTotalSatang}`);
    if (!okSq) ok50 = false;
  }
  {
    // บิลโรงแรมมาก่อน → submit คีย์เดียวกันต้องไม่ "เจอ" บิลนั้น (ไม่ duplicated · ไม่ CONFLICT · ไม่มี id/เลขใบเสร็จรั่ว) และบิลโรงแรมไม่ถูกแตะ
    const kH = `hotel-sale-${KTAG}-resv2`;
    const h = await legacySale({ sourceModule: "HOTEL", sourceId: `${KTAG}-resv2`, idempotencyKey: kH, lines: [{ name: "ค่าห้อง 2 คืน", qty: 1, unitPriceSatang: 120000 }], payMethods: [{ type: "CASH", amountSatang: 120000 }] });
    const s = await sub(owner, { idempotencyKey: kH, lines: lR4, payMethods: pay(tR4) });
    const js = JSON.stringify(s ?? {});
    const hRow = await rawRow(kH);
    const okH = typeof h?.saleId === "string" && s?.ok === true && s.saleId !== h.saleId && s.duplicated !== true && !js.includes(h.saleId) && !(h.receiptNo && js.includes(h.receiptNo))
      && hRow?.id === h.saleId && hRow?.grandTotalSatang === 120000 && hRow?.sourceModule === "HOTEL";
    r50.push(`โรงแรมก่อน:${codeOf(s)}${s?.saleId === h?.saleId ? " (ได้บิลโรงแรม❌)" : ""}`);
    if (!okH) ok50 = false;
  }
  for (const pre of ["rental-", "rental-deposit-", "booking-deposit-"]) {
    const k = `${pre}${KTAG}-x`;
    const s = await sub(owner, { idempotencyKey: k, lines: lR4, payMethods: pay(tR4) });
    const occ = await rawRow(k);
    r50.push(`${pre}:${codeOf(s)}${occ ? " ยึดดิบ❌" : ""}`);
    if (s?.ok !== true || occ) ok50 = false;
  }
  {
    const r8 = (RAND + "zzzzzz").slice(0, 6);
    const badK: [string, string][] = [["7ตัว", `R4${r8.slice(0, 5)}`], ["จุด", `${KTAG}.dot`], ["โคลอน", `${REG_NS}${KTAG}`], ["ไทย", `${KTAG}-ไทย`], ["ช่องว่าง", `${KTAG} sp`]];
    for (const [label, k] of badK) {
      const s = await sub(owner, { idempotencyKey: k, lines: lR4, payMethods: pay(tR4) });
      const made = !!(await saleByKey(k));
      r50.push(`${label}:${codeOf(s)}${made ? "+บิล" : ""}`);
      if (!refused(s, ["VALIDATION"]) || made) ok50 = false;
    }
    // คีย์นอก KTAG สองตัวนี้ถูกลบใน cleanup ผ่านบิลของสาขา sandbox (orUnits)
    const goodK: [string, string][] = [["8ตัว", `R4${r8}`], ["UUID", randomUUID()]];
    for (const [label, k] of goodK) {
      const s = await sub(owner, { idempotencyKey: k, lines: lR4, payMethods: pay(tR4) });
      const row = s?.ok ? await posSaleById(s.saleId) : null;
      r50.push(`${label}:${codeOf(s)}`);
      if (s?.ok !== true || row?.idempotencyKey !== `${REG_NS}${k}` || (await rawRow(k))) ok50 = false;
    }
  }
  chk("P1.3-S3.50", ok50, "reg2: namespace · hotel-sale-/rental-/booking-deposit- ไม่ถูกยึด · เช็คเอาท์ได้บิลของตัวเอง · ชุดอักขระ/ความยาวคีย์ตาม K1",
    `${fxR4 ? `fixture:${fxR4} · ` : ""}${r50.join(" · ")}`);

  // S3.51 K2 — probe 2: คีย์ข้ามสาขา ⇒ CONFLICT เปล่า (ไม่บอกว่าสาขาอื่นมีบิลอะไร)
  const r51: string[] = [];
  let ok51 = !fxR4;
  {
    const c2 = { tenantId: tid, systemId: sPos.id, unitId: unit2.id };
    const k51 = key("xbranch");
    const in51 = { idempotencyKey: k51, lines: lR4, payMethods: pay(tR4) };
    const in51b = { ...in51, lines: [{ ...lR4[0], qty: 2 }], payMethods: pay(tR4 * 2) };
    const s = await sub(owner, in51, undefined, c2);
    const row = s?.ok ? await posSaleById(s.saleId) : null;
    const secrets = [s?.saleId, row?.receiptNo, unit2.id].filter((x): x is string => typeof x === "string" && x.length > 0);
    const leaks = (r: Any) => secrets.some((x) => JSON.stringify(r ?? {}).includes(x));
    const bare = (r: Any) => refused(r, ["IDEMPOTENCY_CONFLICT"]) && r.saleId == null && r.receiptNo == null && r.saleStatus == null && !leaks(r);
    const xs: [string, Any][] = [
      ["เจ้าของ payload เดิม", await sub(owner, in51)],
      ["เจ้าของ payload ต่าง", await sub(owner, in51b)],
      ["แคชเชียร์ sandbox", await sub(cashier, in51)],
    ];
    const pDup = await sub(owner, in51, undefined, c2);
    const pCon = await sub(owner, in51b, undefined, c2);
    const n = await salesByKey(k51);
    const okX = s?.ok === true && row?.unitId === unit2.id && xs.every(([, r]) => bare(r)) && pDup?.ok === true && pDup.duplicated === true && pDup.saleId === s.saleId
      && refused(pCon, ["IDEMPOTENCY_CONFLICT"]) && pCon.saleId === s.saleId && n === 1;
    r51.push(`สาขา2:${codeOf(s)} · ${xs.map(([l, r]) => `${l}:${codeOf(r)}${r?.saleId ? "+saleId❌" : ""}${r?.receiptNo ? "+receiptNo❌" : ""}${r?.saleStatus ? "+status❌" : ""}${leaks(r) ? "+รั่ว❌" : ""}`).join(" ")} · คู่บวก dup:${pDup?.duplicated}/${pDup?.saleId === s?.saleId} con:${codeOf(pCon)}/${pCon?.saleId === s?.saleId} · n ${n}`);
    if (!okX) ok51 = false;
  }
  {
    // บิลของโมดูลอื่น (sourceModule HOTEL) ที่ถือคีย์รูป reg2:… สาขาเดียวกัน (เช่นมาจาก actions/pos.ts เดิมที่รับคีย์อะไรก็ได้ · O23)
    const kF = key("foreign-src");
    const h = await legacySale({ sourceModule: "HOTEL", sourceId: `${KTAG}-src`, idempotencyKey: `${REG_NS}${kF}`, lines: [{ name: "ค่าห้อง (โมดูลอื่น)", qty: 1, unitPriceSatang: 2100 }], payMethods: [{ type: "CASH", amountSatang: 2100 }] });
    const s = await sub(owner, { idempotencyKey: kF, lines: lR4, payMethods: pay(tR4) });
    const js = JSON.stringify(s ?? {});
    const n = await salesByKey(kF);
    const okF = typeof h?.saleId === "string" && refused(s, ["IDEMPOTENCY_CONFLICT"]) && s.saleId == null && s.receiptNo == null && s.saleStatus == null && !js.includes(h.saleId) && !(h.receiptNo && js.includes(h.receiptNo)) && n === 1;
    r51.push(`โมดูลอื่น reg2:…:${codeOf(s)}${s?.saleId ? "+saleId❌" : ""} n ${n}${typeof h?.saleId === "string" ? "" : ` fixture:${short(h?.code, 40)}`}`);
    if (!okF) ok51 = false;
  }
  chk("P1.3-S3.51", ok51, "ข้ามสาขา/โมดูลอื่น: CONFLICT เปล่า ไม่มี saleId/receiptNo/saleStatus/unitId รั่ว · คู่บวกสาขาเดียวกันยังพก saleId · คีย์ละบิลเดียว", r51.join(" ; "));

  // S3.52 K3 — probe 3: คำขอแรกค้างใน tx (ล็อกแถวตัวนับใบเสร็จของสาขา sandbox จาก connection อื่น) · ราคาเปลี่ยน ·
  //   client (หลัง K3) ส่งตะกร้าที่คิดราคาใหม่ด้วยคีย์เดิม → ต้องจบที่บิลเดียว (เส้น P2002) · ล็อกค้างรวม ≈2.5 วิ < 5 วิ (tx ปริยายของ Prisma)
  const r52: string[] = [];
  let ok52 = !fxR4 && !!R4R;
  if (ok52) {
    const lR = [{ productId: R4R.id, qty: 1 }];
    const tA52 = (await quote(owner, { lines: lR }))?.grandTotalSatang ?? 4000;
    const k52 = key("race-reprice");
    const holder = await lane(0);
    const subLane1 = await lane(1);
    const subLane2 = await lane(2);
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));
    let lockedN = -1;
    let fx52 = "";
    let onLocked: () => void = () => {};
    const lockedP = new Promise<void>((r) => (onLocked = r));
    const holdP = (holder.$transaction(async (tx: Any) => {
      const rows = (await tx.$queryRaw`SELECT id FROM "PosReceiptCounter" WHERE "unitId" = ${unit.id} FOR UPDATE`) as Any[];
      lockedN = rows.length;
      onLocked();
      await gate;
    }, { timeout: 30000, maxWait: 10000 }) as Promise<unknown>).catch((e: unknown) => {
      fx52 ||= `lock:${String((e as Error)?.message ?? e).slice(0, 60)}`;
      onLocked();
    });
    await lockedP;
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const track = (p: Promise<Any>) => {
      const st = { done: false };
      p.then(() => (st.done = true), () => (st.done = true));
      return st;
    };
    let p1: Promise<Any> = Promise.resolve({ ok: false, code: "NOT_STARTED" });
    let p2: Promise<Any> = Promise.resolve({ ok: false, code: "NOT_STARTED" });
    let blocked1 = false, blocked2 = false, tB52 = -1;
    try {
      if (lockedN > 0) {
        p1 = sub(owner, { idempotencyKey: k52, lines: lR, payMethods: pay(tA52) }, subLane1);
        const st1 = track(p1);
        await sleep(1500);
        blocked1 = !st1.done;
        must("setPrice(R4R)", await call(catalog, "setPrice", cctx, R4R.id, 4500));
        tB52 = (await quote(owner, { lines: lR }))?.grandTotalSatang ?? -1;
        p2 = sub(owner, { idempotencyKey: k52, lines: lR, payMethods: pay(tB52) }, subLane2);
        const st2 = track(p2);
        await sleep(800);
        blocked2 = !st2.done;
      } else fx52 ||= `ไม่มีแถวตัวนับให้ล็อก (${lockedN})`;
    } catch (e) {
      fx52 ||= (e as Error).message.slice(0, 60);
    } finally {
      release();
    }
    await holdP;
    const [a, b] = await Promise.all([p1, p2]);
    const rows52 = (await P.posSale.findMany({ where: { tenantId: tid, idempotencyKey: keyIn(k52) }, include: { payments: true } })) as Any[];
    const row = rows52[0];
    const bad = (r: Any) => r?.threw === true || ["INTERNAL", "BUSY", "UNKNOWN", "THROW", "NOT_STARTED"].includes(String(r?.code));
    const winner = [a, b].filter((r) => r?.ok === true && r.duplicated !== true);
    const loserOk = (r: Any) => (r?.ok === true && r.duplicated === true && r.saleId === row?.id) || (refused(r, ["IDEMPOTENCY_CONFLICT"]) && (r.saleId == null || r.saleId === row?.id));
    const other = winner.length === 1 ? [a, b].find((r) => r !== winner[0]) : null;
    ok52 = !fx52 && lockedN > 0 && blocked1 && rows52.length === 1 && row?.status === "PAID" && winner.length === 1 && winner[0].saleId === row.id && !!other && loserOk(other)
      && !bad(a) && !bad(b) && [tA52, tB52].includes(row.grandTotalSatang) && (row.payments as Any[]).reduce((t: number, p: Any) => t + p.amountSatang, 0) === row.grandTotalSatang;
    r52.push(`${fx52 ? `fixture:${fx52} · ` : ""}ล็อก ${lockedN} แถว · ค้าง1:${blocked1} ค้าง2:${blocked2} · ราคา ${tA52}→${tB52} · ตอบ1 ${codeOf(a)}${a?.duplicated ? "/dup" : ""} · ตอบ2 ${codeOf(b)}${b?.duplicated ? "/dup" : ""} · บิล ${rows52.length} ${row?.status ?? "-"} ยอด ${row?.grandTotalSatang ?? "-"}`);
  } else r52.push(`fixture:${fxR4 || "ไม่มีสินค้า R4R"}`);
  chk("P1.3-S3.52", ok52, "คำขอค้าง+คีย์เดิมตะกร้าคิดราคาใหม่ → บิล PAID เดียว · ok หนึ่ง + dup|CONFLICT หนึ่ง · ไม่มี INTERNAL/BUSY/THROW", r52.join(""));

  // S3.53 K4 — probe 5: ส่งซ้ำคีย์เดิมด้วยเงินรับต่าง ⇒ ห้ามทอนติดลบ (ลำดับตรวจเดียวกับครั้งแรก — ปฏิเสธดีกว่า)
  const r53: string[] = [];
  let ok53 = !fxR4;
  {
    const k53 = key("replay-change");
    const in53 = { idempotencyKey: k53, lines: lR4, payMethods: pay(tR4), cashReceivedSatang: tR4 + 500, expectedGrandTotalSatang: tR4 };
    const s = await subRaw(owner, in53);
    const { cashReceivedSatang: _c, ...noRecv } = in53;
    // มติผู้คุมงาน (คำถาม r4 ข้อ 3): ต้องปฏิเสธด้วยรหัสเดียวกับการส่งครั้งแรก (S3.39 · S3.36) ก่อนดูคีย์ — ทอน ≥ 0 อย่างเดียวไม่พอ
    const reps: [string, Any, string][] = [
      ["รับ0", await subRaw(owner, { ...in53, cashReceivedSatang: 0 }), "PAYMENT_MISMATCH"],
      ["รับขาด1", await subRaw(owner, { ...in53, cashReceivedSatang: tR4 - 1 }), "PAYMENT_MISMATCH"],
      ["ไม่ส่ง", await subRaw(owner, noRecv), "PAYMENT_MISMATCH"],
      ["ติดลบ", await subRaw(owner, { ...in53, cashReceivedSatang: -500 }), "VALIDATION"],
    ];
    const same = await subRaw(owner, in53);
    const okRep = (r: Any, want: string) => refused(r, [want]) && r.changeSatang === undefined && r.saleId == null;
    const n = await salesByKey(k53);
    ok53 = ok53 && s?.ok === true && s.changeSatang === 500 && reps.every(([, r, want]) => okRep(r, want)) && same?.ok === true && same.duplicated === true && same.changeSatang === 500 && n === 1;
    r53.push(`แรก ${codeOf(s)} ทอน ${s?.changeSatang} · ${reps.map(([l, r, w]) => `${l}:${codeOf(r)}${r?.ok ? ` ทอน ${r.changeSatang}` : ""}(≠${w})`).join(" ")} · ซ้ำเดิม ทอน ${same?.changeSatang}/dup ${same?.duplicated} · n ${n}`);
  }
  chk("P1.3-S3.53", ok53, "ส่งซ้ำ: เงินรับ 0/ขาด/ไม่ส่ง → PAYMENT_MISMATCH · ติดลบ → VALIDATION (ปฏิเสธเท่านั้น เหมือนครั้งแรก) · บิลเดียว · payload เดิมทอน 500", r53.join(""));

  // S3.54 m2 — คงมติ S3.47 (wildcard pos.* = ทุกคีย์ pos.*) · บันทึกให้เห็นว่า STAFF pos.* ทำรายการกำหนดเองได้เมื่อเปิด V2
  {
    const staffW54 = { ...cashier, permissions: { "pos.*": true } };
    const q54 = await quote(staffW54, custom);
    const k54 = key("wild-custom");
    const s54 = await sub(staffW54, { idempotencyKey: k54, ...custom, payMethods: pay(2000) });
    const l54 = await lineOfSale(k54);
    chk("P1.3-S3.54", q54?.ok === true && q54.grandTotalSatang === 2000 && s54?.ok === true && l54?.unitPriceSatang === 2000 && l54?.productId === null,
      "STAFF pos.*: quote 2000 + PAID รายการกำหนดเอง @2000 (พฤติกรรมที่รับรอง · ไม่ใช่บั๊ก)", `quote ${codeOf(q54)}/${q54?.grandTotalSatang} · submit ${codeOf(s54)} @${l54?.unitPriceSatang} prod ${short(l54?.productId)}`);
  }

  // ─── S4 แถบสถานะ ───
  console.log("\n── S4 แถบสถานะ ──");
  const st = await call(register, "registerStatus", ctx, owner);
  const rawRole = /^(OWNER|MANAGER|STAFF|CUSTOMER)$/.test(String(st?.user?.roleLabel ?? ""));
  chk("P1.3-S4.1", st?.ok === true && st.unit?.name === unit.name && typeof st.user?.name === "string" && !!st.user.name && typeof st.user?.roleLabel === "string" && !!st.user.roleLabel && !rawRole && st.pendingSyncCount === 0,
    "unit/user/roleLabel ภาษาคน · pendingSync 0", `${codeOf(st)} ${short({ unit: st?.unit?.name, user: st?.user, sync: st?.pendingSyncCount })}`);
  chk("P1.3-S4.2", st?.ok === true && st.shift === null, "shift null", `${codeOf(st)} shift=${short(st?.shift)}`);
  const pend0 = st?.pendingStockCount;
  const k43 = key("pending-stock");
  try {
    await P.$transaction((tx: Any) =>
      service.createSale({ tenantId: tid, unitId: unit.id, systemId: sPos.id, idempotencyKey: k43, lines: [{ name: "รอตัดสต็อก", qty: 1, unitPriceSatang: 500, itemId: C?.invItemId }], payMethods: [{ type: "CASH", amountSatang: 500 }] }, tx),
    );
  } catch (e) {
    console.log(`  (สร้างบิลค้างตัดสต็อกไม่ได้: ${(e as Error).message.slice(0, 80)})`);
  }
  const st2 = await call(register, "registerStatus", ctx, owner);
  chk("P1.3-S4.3", pend0 === 0 && st2?.pendingStockCount === 1, "0 → 1", `${short(pend0)} → ${short(st2?.pendingStockCount)} (${codeOf(st2)})`);
  const x4a = await call(register, "registerStatus", { tenantId: tid, systemId: posSys, unitId: restoUnit }, owner);
  const x4b = await call(register, "registerStatus", { tenantId: tid, systemId: posSys, unitId: ari }, cashierReal);
  const x4c = await call(register, "registerStatus", { tenantId: tid, systemId: posSys, unitId: silom }, cashierReal);
  chk("P1.3-S4.4", refused(x4a, ["NOT_FOUND"]) && refused(x4b, ["NOT_FOUND"]) && x4c?.ok === true, "NOT_FOUND · NOT_FOUND · สีลม ok", `${codeOf(x4a)} · ${codeOf(x4b)} · ${codeOf(x4c)}`);
  // S4.5 Q23 รหัสบทบาท (จออังกฤษแปลจากรหัส — roleLabel เป็นภาษาไทยจากเซิร์ฟเวอร์)
  const manager4 = actor(mCash, E.coffee.users.cashier.userId, { role: "MANAGER", unitAccess: [unit.id], permissions: {} });
  const r45 = [] as Any[];
  for (const a of [owner, manager4, cashier]) r45.push(await call(register, "registerStatus", ctx, a));
  const roles45 = r45.map((r) => String(r?.user?.role)).join(",");
  const labels45 = r45.every((r) => r?.ok === true && typeof r.user?.roleLabel === "string" && !!r.user.roleLabel && !/^(OWNER|MANAGER|STAFF)$/.test(r.user.roleLabel));
  chk("P1.3-S4.5", roles45 === "OWNER,MANAGER,STAFF" && labels45, "OWNER,MANAGER,STAFF · roleLabel ภาษาคน", `${roles45} · labels ${labels45} (${r45.map(codeOf).join(",")})`);
  // S4.6 Q25 registerVatConfig(ctx) — ค่าเดียวกับที่ quote ใช้ (หน้าเพจส่งให้ client คิดยอดทันใจก่อน quote แรก)
  const vatOf = async (c: Any) => {
    const r = await call(register, "registerVatConfig", c);
    return r?.ok === false ? { err: codeOf(r) } : { mode: r?.mode ?? r?.vatMode, rateBp: r?.rateBp ?? r?.vatRateBp };
  };
  const vSb = await vatOf(ctx);
  const qSb = await quote(owner, { lines: [{ productId: A?.id, qty: 1 }] });
  const vSi = await vatOf(cSilom);
  const qSi = amer ? await quote(owner, { lines: [{ productId: amer.id, qty: 1 }] }, cSilom) : { ok: false, code: "NO_AMER" };
  const vatSame = (v: Any, q: Any) => !v.err && q?.ok === true && v.mode === q.vatMode && v.rateBp === q.vatRateBp && ["INCLUDED", "NONE"].includes(v.mode) && Number.isInteger(v.rateBp);
  chk("P1.3-S4.6", vatSame(vSb, qSb) && vatSame(vSi, qSi), "sandbox + สีลม: {mode, rateBp} = quote · INCLUDED|NONE", `sb ${short(vSb)} vs ${qSb?.vatMode}/${qSb?.vatRateBp} · silom ${short(vSi)} vs ${qSi?.vatMode}/${qSi?.vatRateBp}`);
  // S4.7 รอตัดสต็อก: บิล PAID วันนี้ที่บรรทัดผูกสต็อกยังไม่มี movement คีย์ pos-consume-<sale>-<line> (สร้างใน tx ของผู้อื่น = ไม่ตัดหลัง commit)
  const p47a = (await call(register, "registerStatus", ctx, owner))?.pendingStockCount;
  const k47s = key("pending-2");
  let p47fx = "";
  try {
    await P.$transaction((tx: Any) =>
      service.createSale({ tenantId: tid, unitId: unit.id, systemId: sPos.id, idempotencyKey: k47s, lines: [{ name: "รอตัดสต็อก 2", qty: 1, unitPriceSatang: 700, itemId: C?.invItemId }], payMethods: [{ type: "CASH", amountSatang: 700 }] }, tx),
    );
  } catch (e) {
    p47fx = (e as Error).message.slice(0, 60);
  }
  const p47b = (await call(register, "registerStatus", ctx, owner))?.pendingStockCount;
  const sale47 = await saleByKey(k47s);
  const line47 = sale47 ? await P.posSaleLine.findFirst({ where: { saleId: sale47.id } }) : null;
  try {
    if (sale47 && line47) await inventory.consume(invCtx, { itemId: C?.invItemId, qty: 1, sourceModule: "POS", refType: "PosSale", refId: sale47.id, idempotencyKey: `pos-consume-${sale47.id}-${line47.id}` });
  } catch (e) {
    p47fx += ` consume:${(e as Error).message.slice(0, 60)}`;
  }
  const p47c = (await call(register, "registerStatus", ctx, owner))?.pendingStockCount;
  chk("P1.3-S4.7", !p47fx && Number.isInteger(p47a) && p47b === p47a + 1 && p47c === p47a, "n → n+1 (ไม่มี movement) → n (มี movement คีย์ pos-consume)", `${p47fx ? `fixture:${p47fx} · ` : ""}${short(p47a)} → ${short(p47b)} → ${short(p47c)}`);
}

// ═════════════════════════ 6. คืนสภาพ (ลบทุกอย่างที่ข้อสอบสร้าง) ═════════════════════════
async function del(model: string, where: Any): Promise<number> {
  const d = P[model];
  if (typeof d?.deleteMany !== "function") return 0;
  try {
    return (await d.deleteMany({ where })).count as number;
  } catch (e) {
    console.log(`  (ลบ ${model} ไม่ได้: ${(e as Error).message.slice(0, 100)})`);
    return -1;
  }
}
async function cleanup() {
  const tids = envMod.PQC_TENANT_IDS as string[];
  const orUnits = sb.unitId ? [{ unitId: sb.unitId }] : [];
  // R4: คีย์หน้าขายหลัง K1 = 'reg2:'+KTAG… · คีย์ hotel-sale-/rental-…KTAG ของ S3.50 · บิลสาขา 2 ของ S3.51
  const sales = (await P.posSale.findMany({ where: { tenantId: { in: tids }, OR: [{ idempotencyKey: { startsWith: TAG } }, { idempotencyKey: { contains: KTAG } }, ...orUnits, ...(sb.unit2Id ? [{ unitId: sb.unit2Id }] : [])] }, select: { id: true } })) as Any[];
  const saleIds = sales.map((s) => s.id);
  // สินค้า/หมวดที่ catalog สร้างในระบบ POS sandbox (รวมที่ข้อสอบไม่รู้ id) — รวบไว้ก่อนลบ audit/ตารางลูก
  if (sb.posSysId && typeof P.posProduct?.findMany === "function") {
    try {
      const extra = ((await P.posProduct.findMany({ where: { tenantId: { in: tids }, systemId: sb.posSysId }, select: { id: true } })) as Any[]).map((r) => r.id);
      sb.productIds = [...new Set([...sb.productIds, ...extra])];
    } catch {
      /* ไม่มีคอลัมน์ systemId = ใช้รายการที่จำไว้ */
    }
  }
  // รอคิวของบิลเราให้จบก่อนลบ (กันตัวระบายในโปรเซสนี้เขียนตามหลังการลบ)
  for (let i = 0; i < 20 && saleIds.length; i++) {
    const pend = await P.outboxEvent.count({ where: { tenantId: { in: tids }, status: "PENDING", OR: [{ unitId: sb.unitId || "-" }, { idempotencyKey: { in: saleIds.flatMap((id) => [`PosSale#${id}#PAID`, `PosSale#${id}#VOIDED`]) } }] } });
    if (pend === 0) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  const counts: Record<string, number> = {};
  counts.outbox = await del("outboxEvent", { tenantId: { in: tids }, OR: [...(sb.unitId ? [{ unitId: sb.unitId }] : []), { idempotencyKey: { in: saleIds.flatMap((id) => [`PosSale#${id}#PAID`, `PosSale#${id}#VOIDED`]) } }] });
  counts.audit = await del("auditLog", { tenantId: { in: tids }, createdAt: { gte: runStart }, OR: [...(sb.unitId ? [{ unitId: sb.unitId }] : []), { targetId: { in: [...saleIds, ...sb.productIds, ...sb.categoryIds, ...sb.invItemIds] } }] });
  counts.journal = await del("accountJournalEntry", { tenantId: { in: tids }, refType: "PosSale", refId: { in: saleIds } });
  counts.point = await del("pointLedger", { tenantId: { in: tids }, refId: { in: saleIds } });
  counts.coupon = await del("couponRedemption", { tenantId: { in: tids }, refType: "PosSale", refId: { in: saleIds } });
  counts.payment = await del("posPayment", { saleId: { in: saleIds } });
  counts.line = await del("posSaleLine", { saleId: { in: saleIds } });
  counts.sale = await del("posSale", { id: { in: saleIds } });
  // ตารางลูกของ PosProduct (ของ P1.1a/P1.2 — มีหรือไม่ก็ได้)
  for (const m of ["posProductOptionGroup", "posVariant", "recipeLine", "posProductChannelPrice", "posProductAvailability", "posProductUnit"]) {
    if (sb.productIds.length) await del(m, { productId: { in: sb.productIds } });
  }
  counts.product = sb.productIds.length ? await del("posProduct", { id: { in: sb.productIds } }) : 0;
  if (sb.posSysId) counts.productBySystem = await del("posProduct", { tenantId: { in: tids }, systemId: sb.posSysId }); // ที่ catalog สร้างเองโดยข้อสอบไม่รู้ id
  counts.category = sb.categoryIds.length ? await del("posCategory", { id: { in: sb.categoryIds } }) : 0;
  // รอบ 3: กลุ่มตัวเลือกของ fixture Q6 (ลิงก์ PosProductOptionGroup ลบไปพร้อมสินค้าแล้วด้านบน) — ลบตัวเลือกก่อนกลุ่ม (FK)
  if (sb.unitId || sb.menuGroupIds.length) {
    const gw = { tenantId: { in: tids }, OR: [{ id: { in: sb.menuGroupIds } }, ...(sb.unitId ? [{ unitId: sb.unitId }] : [])] };
    const gids = typeof P.menuOptionGroup?.findMany === "function" ? ((await P.menuOptionGroup.findMany({ where: gw, select: { id: true } })) as Any[]).map((g) => g.id) : [];
    if (gids.length) {
      await del("posProductOptionGroup", { tenantId: { in: tids }, groupId: { in: gids } });
      await del("menuOptionChoice", { groupId: { in: gids } });
      counts.menuGroup = await del("menuOptionGroup", { id: { in: gids } });
    }
  }
  for (const sbInv of [sb.invSysId, sb.invSys2Id].filter(Boolean)) {
    // 🔴 inventory.receive/consume โพสต์ GL เข้าระบบบัญชี "ตัวแรกของร้าน" (inventory/service.ts postMovementGl) แม้ระบบคลัง
    //    sandbox ไม่ได้ผูกบัญชี ⇒ ต้องลบ AccountJournalEntry refType InvMovement ของ movement ชั่วคราวก่อน (บรรทัดลบตาม cascade)
    //    พบจากการรัน QC_FORCE ครั้งแรก: accountJournalEntry 2→8 (S9.1 จับได้)
    const mvIds = ((await P.invMovement.findMany({ where: { tenantId: { in: tids }, systemId: sbInv }, select: { id: true } })) as Any[]).map((m) => m.id);
    if (mvIds.length) counts.invJournal = (counts.invJournal ?? 0) + await del("accountJournalEntry", { tenantId: { in: tids }, refType: "InvMovement", refId: { in: mvIds } });
    for (const m of ["invMovement", "invLot", "invLocationStock", "invItemImage"]) await del(m, { tenantId: { in: tids }, OR: [{ systemId: sbInv }, { itemId: { in: sb.invItemIds } }] });
    counts.invItem = (counts.invItem ?? 0) + (await del("invItem", { tenantId: { in: tids }, systemId: sbInv }));
    for (const m of ["invLocation", "invCategory", "invSettings"]) await del(m, { tenantId: { in: tids }, systemId: sbInv });
  }
  if (sb.unitId) await del("posReceiptCounter", { unitId: sb.unitId });
  // ตัวนับใบเสร็จของสาขาจริง: คืนค่าเดิม (บิลหลุดเข้าสาขาจริง = บั๊กของผู้สร้าง แต่ข้อมูลต้องคืน)
  for (const c of realCounters) {
    try {
      // ORACLE-EDIT (P1.11U รอบ 3): ระหว่างรอบนี้อาจมีการขายจริงของร้าน QC (รอบภาพ/เลนอื่น) — คืนค่าเป็น max(snapshot, เลขที่ออกไปแล้วจริง) ห้ามต่ำกว่าใบที่ออกแล้ว (ไม่งั้นขายต่อชน unique receiptNo = BUSY)
      const issuedRows = (await P.posSale.findMany({ where: { unitId: c.unitId, receiptNo: { startsWith: `${c.period}-` } }, select: { receiptNo: true }, orderBy: { receiptNo: "desc" }, take: 20 })) as Any[];
      const issued = issuedRows.reduce((m: number, r: Any) => Math.max(m, Number(String(r.receiptNo).slice(String(c.period).length + 1)) || 0), 0);
      await P.posReceiptCounter.update({ where: { id: c.id }, data: { seq: Math.max(Number(c.seq), issued) } });
    } catch {
      /* แถวหาย = ไม่มีอะไรให้คืน */
    }
  }
  // R4.2 (VPS run A: ตัวนับของสาขา 2 ชั่วคราว (S3.51 ขาย 1 บิล) ค้าง เพราะเดิมลบเฉพาะเมื่อ snapshot ไม่ว่าง):
  //   ตัวนับของสาขาชั่วคราวทุกสาขา · และตัวนับใด ๆ ของร้าน QC ที่ไม่อยู่ใน snapshot ก่อนรัน (snapshot ว่างก็ลบ)
  const tmpUnits = [sb.unit2Id, sb.unlinkedUnitId].filter(Boolean);
  if (tmpUnits.length) await del("posReceiptCounter", { tenantId: { in: tids }, unitId: { in: tmpUnits } });
  if (realCountersTaken) await del("posReceiptCounter", { tenantId: { in: tids }, id: { notIn: realCounters.map((c: Any) => c.id) }, ...(sb.unitId ? { unitId: { not: sb.unitId } } : {}) });
  // รอบ 3.2: ลูกค้า/ระดับ/ระบบสมาชิกชั่วคราว (S3.42) — แถวที่อ้าง customerId ก่อน แล้วลูกค้า แล้วระดับ
  if (sb.customerIds.length) {
    for (const m of ["memberActivity", "memberTierHistory", "memberAttribution", "memberConsent", "memberFieldValue", "memberFieldValueHistory", "memberChannelIdentity",
      "memberNotification", "memberAccessLog", "memberAddress", "pointLedger", "pointLot", "pointBalance", "pointAdjustRequest", "voucher", "stampCardProgress",
      "couponRedemption", "rewardRedemption", "automationRun", "customerSession", "customerOtp"]) await del(m, { customerId: { in: sb.customerIds } });
    counts.customer = await del("customer", { id: { in: sb.customerIds } });
  }
  if (sb.memSysId) {
    const defs = typeof P.memberTierDef?.findMany === "function" ? ((await P.memberTierDef.findMany({ where: { systemId: sb.memSysId }, select: { id: true } })) as Any[]).map((d) => d.id) : [];
    if (defs.length) await del("memberTierBenefit", { tierDefId: { in: defs } });
    await del("memberTierDef", { systemId: sb.memSysId });
  }
  // รอบ 3.2: สมาชิกร้าน/ผู้ใช้ชั่วคราวของ S1.27
  if (sb.membershipIds.length) await del("membership", { id: { in: sb.membershipIds } });
  if (sb.userIds.length) counts.user = await del("user", { id: { in: sb.userIds } });
  const units = [sb.unitId, sb.unlinkedUnitId, sb.unit2Id].filter(Boolean);
  if (units.length) await del("appSystemUnit", { unitId: { in: units } });
  const systems = [sb.posSysId, sb.invSysId, sb.invSys2Id, sb.memSysId].filter(Boolean);
  if (systems.length) {
    await del("appSystemUnit", { systemId: { in: systems } });
    await del("appSystem", { id: { in: systems } });
  }
  if (units.length) await del("businessUnit", { id: { in: units } });
  console.log(`  ลบแล้ว: ${JSON.stringify(counts)} · สาขา ${units.length} · ระบบ ${systems.length}`);
}

// ═════════════════════════ 7. รัน ═════════════════════════
let crashed = "";
try {
  runPricing();
  await runStatic();
  await runDb();
} catch (e) {
  crashed = (e as Error)?.stack?.split("\n").slice(0, 3).join(" | ") ?? String(e);
  console.log(`💥 harness: ${crashed}`);
} finally {
  try {
    await cleanup();
  } catch (e) {
    console.log(`💥 cleanup: ${(e as Error).message.slice(0, 200)}`);
  }
}
const countsAfter = await snapshotCounts();
const drift = Object.keys(countsBefore).filter((k) => countsBefore[k] !== countsAfter[k]).map((k) => `${k}:${countsBefore[k]}→${countsAfter[k]}`);
chk("P1.3-S9.1", drift.length === 0, "ก่อน = หลัง", drift.length ? drift.join(", ") : "เท่ากันทุกตาราง");
const fpAfter = await fingerprint();
const fpDrift = Object.keys(fpBefore).filter((k) => fpBefore[k] !== fpAfter[k]).map((k) => `${k}:${fpBefore[k]}→${fpAfter[k]}`);
chk("P1.3-S9.2", fpDrift.length === 0 && !Object.values(fpBefore).some((v) => v.startsWith("err")), "ลายนิ้วมือเท่าเดิมทุกตาราง", fpDrift.length ? fpDrift.join(", ") : `เท่าเดิม (${Object.entries(fpAfter).map(([k, v]) => `${k}=${v.split(":")[0]}`).join(" ")})`);
// ข้อที่ไม่ถึง (harness ล้มกลางทาง) = แดง ไม่ใช่หายเงียบ
for (const [id] of CHECKS) if (!results.has(id) && !skippedChecks.has(id)) chk(id, false, "ถูกตรวจ", crashed ? `ไม่ถึง (harness ล้ม: ${crashed.slice(0, 80)})` : "ไม่ถึง");
for (const c of lanes) await c.$disconnect?.().catch?.(() => {});
const failed = [...results.entries()].filter(([, r]) => !r.ok).map(([id]) => id);
console.log(`\n===== ${SUITE} ===== ผ่าน ${results.size - failed.length}/${results.size}${FORCE ? " (QC_FORCE)" : ""}${skippedChecks.size ? ` · ข้าม ${skippedChecks.size} (กลุ่มของใบอื่น)` : ""}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ suite: SUITE, total: results.size, passed: results.size - failed.length, failed, skipped: false, forced: FORCE, skippedChecks: Object.fromEntries(skippedChecks), missing: skipReasons, a5: { drift } })}`);
await P.$disconnect?.().catch?.(() => {});
process.exit(failed.length ? 1 : 0);

// ─── หมายเหตุขอบเขต ───
// นอกขอบเขต P1.3 (ใบอื่นเป็นเจ้าของ): P1.2 ตัวเลือก/variant จาก DB (choiceId → priceDelta) — ที่นี่ทดสอบแค่ส่วนต่างราคาในฟังก์ชันบริสุทธิ์ ·
// P1.4 สแกนบาร์โค้ด/กล้อง · P1.5 พักบิล (ปุ่มมี testid แต่พฤติกรรมเป็นของ P1.5) · P1.6 จ่ายหลายวิธี/numpad/เงินทอน ·
// P1.9 กะ (S4.2 ตรวจแค่ "ยังไม่มีกะไม่พัง") · P1.12 สมาชิก/แต้ม · P1.13 ใบกำกับเต็มรูป · P1.15 PIN/อนุมัติเกินเพดาน
