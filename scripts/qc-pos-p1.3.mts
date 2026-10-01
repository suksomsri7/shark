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
//     ปฏิเสธ = คืน { ok:false, code, message } (ข้อสอบรับ throw ที่มี .code เท่ากันด้วย) — ห้าม clamp เงียบ
//   ใช้ของใบ P1.1a: ตาราง PosProduct/PosCategory + src/lib/modules/pos/catalog.ts (createProduct/updateProduct/setPrice/archive/
//     listForUnit/byBarcode/ensureForInvItem) + PosSaleLine.productId
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
  ["P1.3-S1.3", "-", "ทรงข้อมูลสินค้าบนกริด: id invItemId name nameEn kind categoryId priceSatang sku barcode imageUrl optionGroupCount soldOut stockLeft"],
  ["P1.3-S1.4", "-", "สต็อกบนการ์ด: สินค้านับสต็อก (ครัวซองต์/น้ำดื่ม) stockLeft = InvItem.onHand · สินค้าไม่นับสต็อก (อเมริกาโน่/ลาเต้) stockLeft = null และไม่ขึ้น 'หมด'"],
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
  ["P1.3-S1.17", "-", "แคตตาล็อกเกิน 200 ตัว (มติ R4 · วันนี้ตัดที่ 200 ใน inventory.listItems): สินค้าตัวที่ 206 ค้นเจอทั้งชื่อ · SKU · บาร์โค้ด (ค้นฝั่งเซิร์ฟเวอร์)"],
  ["P1.3-S1.18", "X2", "PosProduct ผูกสาขาอื่น (unitId ≠ สาขานี้ · มติ R3) ไม่ขึ้นกริด · unitId = null (ทุกสาขา) ขึ้น"],
  ["P1.3-S1.19", "X4", "สินค้าที่ยังไม่ตั้งราคา (ไม่มี posPrice/salePrice) → priceSatang = null บนกริด — ห้ามเอาต้นทุนมาเป็นราคา (มติ R2)"],
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
  // ── S3 ส่งบิลฝั่งเซิร์ฟเวอร์ (สาขา sandbox ชั่วคราว · ระบบ POS/คลังชั่วคราว ไม่เชื่อมบัญชี/แต้ม/สมาชิก) ──
  ["P1.3-S3.1", "X4", "quoteRegisterCart ใช้ราคาแคตตาล็อกฝั่งเซิร์ฟเวอร์ (unitPriceSatang ที่ client ส่งมากับสินค้าแคตตาล็อกถูกเมิน) = priceCart ของราคาจริง"],
  ["P1.3-S3.2", "X4", "ขายสำเร็จ (เจ้าของ · เงินสด): PAID + receiptNo · grandTotal = ยอด quote · Σ payments = grandTotal · subtotalSatang = Σ lineTotal (ความหมายเดิมของ createSale)"],
  ["P1.3-S3.3", "X4", "บรรทัดที่บันทึก: lineTotal/discount ตรง quote · productId = PosProduct · itemId = InvItem ของสินค้า (ตัดสต็อกตามเดิม) · ตัดสต็อก 1 ครั้งต่อบรรทัด"],
  ["P1.3-S3.4", "-", "ขายบริการจากแคตตาล็อก (InvItem kind SERVICE · มติ R5): บรรทัดเก็บ serviceId = InvItem ของบริการ + productId · itemId = null · ไม่ตัดสต็อก · ราคา = ราคาบริการ"],
  ["P1.3-S3.5", "X4", "client แก้ราคาสินค้าแคตตาล็อก (unitPrice 1 สตางค์): จ่ายตามยอดปลอม → ปฏิเสธ ไม่มีบิล · จ่ายตามยอดจริง → ราคาที่บันทึก = ราคาเซิร์ฟเวอร์ (หรือปฏิเสธ) · ไม่มีบรรทัดราคา 1 สตางค์เกิดเลย (มติ R2)"],
  ["P1.3-S3.6", "X4", "จ่ายขาด/เกิน 1 สตางค์ → ปฏิเสธ PAYMENT_MISMATCH · ไม่มี PosSale เกิด"],
  ["P1.3-S3.7", "X3", "แคชเชียร์ส่วนลด 15% (เพดานปริยาย STAFF 10%) → DISCOUNT_EXCEEDS_LIMIT ไม่มีบิล · เจ้าของตะกร้าเดียวกัน → PAID · แคชเชียร์ที่มี pos._maxDiscountBp=2000 → PAID"],
  ["P1.3-S3.8", "X3", "รายการกำหนดเอง (ชื่อ+ราคาเอง ไม่มี productId): แคชเชียร์ไม่มี pos.sale.priceOverride → PERMISSION_DENIED · เจ้าของ → PAID"],
  ["P1.3-S3.9", "X3", "STAFF ที่ไม่มี pos.sale.create → PERMISSION_DENIED ทั้ง quote และ submit · ไม่มีบิล"],
  ["P1.3-S3.10", "X3", "แคชเชียร์จริง (unitAccess = สีลม) ส่งบิลเข้าสาขา sandbox → NOT_FOUND ไม่มีบิล (มติ R8 · คู่บวก = แคชเชียร์ที่มีสิทธิ์สาขานี้ขายได้ใน S3.7)"],
  ["P1.3-S3.11", "X2", "ctx ร้านกาแฟ + unitId ร้านอาหาร → NOT_FOUND · ไม่มีบิลเกิดในร้านอาหาร"],
  ["P1.3-S3.12", "X2", "productId ของร้านอื่น / สินค้า archive / id มั่ว → PRODUCT_NOT_FOUND · สินค้าปิดขายที่สาขานี้ → PRODUCT_UNAVAILABLE · ไม่มีบิล"],
  ["P1.3-S3.13", "X2", "memberId ที่ไม่ใช่ของร้านนี้ → ปฏิเสธ (MEMBER_NOT_FOUND) ไม่มีบิล"],
  ["P1.3-S3.14", "X1", "key เดิมส่งซ้ำ 2 ครั้ง → saleId เดิม · ครั้งที่ 2 duplicated=true · บิล 1 · payments 1 ชุด · ตัดสต็อก 1 ครั้ง"],
  ["P1.3-S3.15", "X1", "key เดิม 10 คำขอพร้อมกัน (connection คนละเส้น) × 3 รอบ → บิลเดียวต่อรอบ ทุกคำตอบ saleId เดียวกัน ตัดสต็อกครั้งเดียว"],
  ["P1.3-S3.16", "X1", "key เดิมแต่ตะกร้าเปลี่ยน → ได้บิลเดิม (หรือ IDEMPOTENCY_CONFLICT) ไม่มีบิลที่ 2 ยอดเดิมไม่เปลี่ยน"],
  ["P1.3-S3.17", "X6", "10 เครื่องขายพร้อมกัน (key ต่างกัน) × 2 รอบ → receiptNo ไม่ชน ไม่ว่าง ครบ 20"],
  ["P1.3-S3.18", "X6", "ชิ้นสุดท้าย นโยบายปริยาย ALLOW_NEGATIVE: 10 เครื่องขายพร้อมกัน × 3 รอบ → PAID ครบ · onHand = 1−10 เป๊ะ (ไม่มี lost update) · OUT 10 แถว"],
  ["P1.3-S3.19", "X6", "ชิ้นสุดท้าย นโยบาย BLOCK (settings.pos.stock.oversellPolicy): 10 เครื่องพร้อมกัน × 3 รอบ → PAID 1 · ที่เหลือ STOCK_INSUFFICIENT · onHand 0 · ผู้แพ้ไม่มีบิล"],
  ["P1.3-S3.20", "X8", "ไม่เชื่อมบัญชี/แต้ม/สมาชิก (sandbox) → ยังขายได้ · event pos.sale.paid ประมวลผลไม่ FAILED · ไม่มี AccountJournalEntry/PointLedger ของบิล"],
  ["P1.3-S3.21", "-", "ตะกร้า 200 บรรทัดส่งได้ → PAID · บันทึก 200 บรรทัด · Σ lineTotal = subtotalSatang"],
  ["P1.3-S3.22", "X4", "createSale แบบเดิม (โมดูลอื่น: itemId + unitPrice จากผู้เรียก ไม่มี productId) ยังทำงาน · ยอด = qty×price − ส่วนลด เหมือนเดิม"],
  ["P1.3-S3.23", "X3", "สินค้ายังไม่ตั้งราคา: ขายปกติ → PRICE_NOT_SET (ไม่ขายที่ต้นทุน) · ราคาเปิด (openPrice) แคชเชียร์ไม่มี pos.sale.priceOverride → PERMISSION_DENIED · เจ้าของ → PAID ที่ราคาที่กรอก"],
  ["P1.3-S3.24", "X2", "สาขาร้านเดียวกันที่ไม่ได้ผูกกับระบบ POS นี้ → submit/quote NOT_FOUND ไม่มีบิล (มติ R8 · createSale เองไม่ตรวจคู่นี้) · คู่บวก: ตะกร้าเดียวกันที่สาขาผูกแล้ว → PAID"],
  // ── S4 แถบสถานะ (เฉพาะส่วนที่ P1.3 เป็นเจ้าของ) ──
  ["P1.3-S4.1", "-", "registerStatus: unit.name · user.name · roleLabel เป็นภาษาคน (ไม่ใช่ OWNER/STAFF ดิบ) · pendingSyncCount = 0 (ออฟไลน์ P3)"],
  ["P1.3-S4.2", "-", "ยังไม่มีกะ (PosShift ของ P1.9 ยังไม่มี/ไม่เปิด) → shift = null ไม่ throw"],
  ["P1.3-S4.3", "X7", "pendingStockCount ('รอตัดสต็อก'): บิลวันนี้ (ตัดวันเวลาไทย +07:00) ที่ตัดสต็อกครบ → 0 · บิลที่ยังไม่ตัด (createSale ใน tx ผู้อื่น) → นับ 1"],
  ["P1.3-S4.4", "X2", "registerStatus ข้ามร้าน (unit ร้านอาหาร) → NOT_FOUND · แคชเชียร์สาขาอื่น → NOT_FOUND · สาขาตัวเอง → ok (คู่บวก)"],
  // ── S5 สถิต (ไม่แตะ DB) ──
  ["P1.3-S5.1", "-", "ข้อความหน้าขายครบ 2 ภาษา: ทุกคีย์ pos.register.* ที่จอใช้ (รายการในโน้ต) มีทั้ง th และ en (F15.4)"],
  ["P1.3-S5.2", "-", "ข้อความ en ไม่มีอักษรไทย · th ไม่ว่าง ไม่ใช่ชื่อคีย์/enum ดิบ · ตัวแปร ICU {x} ตรงกันทั้งสองภาษา"],
  ["P1.3-S5.3", "-", "ไฟล์ UI หน้าขายใหม่ (มี data-testid=\"pos-reg-…\") ไม่มีข้อความไทยฮาร์ดโค้ดนอกคอมเมนต์"],
  ["P1.3-S5.4", "-", "data-testid ทุกตัวของภาพ 01 (+ แถบตะกร้ามือถือ 05ก) มีในโค้ดหน้าขาย"],
  ["P1.3-S5.5", "-", "ปุ่ม/ช่องที่กดได้ของภาพ 01 มีแถวใน scripts/pos-ui-inventory.json (page /app/sys/[id]/pos/register · roles)"],
  ["P1.3-S5.6", "-", "หนี้ปุ่มไร้ testid ของหน้าขาย (register-ui.tsx · register/page.tsx) ใน baselineDebt = 0 หรือไฟล์ถูกแทนที่แล้ว"],
  ["P1.3-S5.7", "X11", "แป้นลัด F2 ค้นหา · F4 ชำระ · F8 พักบิล · Esc ล้าง มีตัวจับ keydown ในโค้ดหน้าขาย [static]"],
  ["P1.3-S5.8", "X11", "ช่องค้นหา/สแกน (pos-reg-search) autofocus และโฟกัสกลับหลังเพิ่มสินค้า [static]"],
  ["P1.3-S5.9", "X11", "ปุ่มหลัก (ชำระ · หมวด · การ์ดสินค้า · +/− จำนวน · พักบิล · บิลที่พัก · สมาชิก · รายการเอง · สแกนกล้อง) มีคลาสสูง ≥44px [static heuristic · ยืนยันจริงที่ visual]"],
  ["P1.3-S5.10", "X4", "สัญญา createSale/voidSale เข้ากันได้ย้อนหลัง (F15.2 ของ scripts/fitness-pos.mts เขียว) — 6 โมดูลที่เรียกไม่พัง"],
  // ── S9 คืนสภาพ ──
  ["P1.3-S9.1", "-", "QC4 คืนสภาพ: จำนวนแถวของร้าน QC POS ทั้งสอง (ทุกตารางที่ข้อสอบแตะ) ก่อน = หลัง · ตัวนับใบเสร็จสาขาจริงไม่ขยับ"],
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
const NEED_EXPORTS = ["registerCatalog", "quoteRegisterCart", "submitRegisterSale", "registerStatus"];
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
] as const;
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
const register = await tryImport("@/lib/modules/pos/register");
const catalog = await tryImport("@/lib/modules/pos/catalog");
const service = await tryImport("@/lib/modules/pos/service");
const inventory = await tryImport("@/lib/modules/inventory/service");
const sysSvc = await tryImport("@/lib/modules/system/service");

const RAND = Math.random().toString(36).slice(2, 8);
const TAG = `qc-p1.3-${RAND}`;
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
  chk("P1.3-S2.11", r11a?.ok === true && r11a.grandTotalSatang === exp200 && r11a.lines?.length === 200 && refused(r11b, ["TOO_MANY_LINES"]) && refused(r11c, ["INVALID_LINE"]),
    `200 → ${exp200} · 201 TOO_MANY_LINES · qty 10000 INVALID_LINE`, `${codeOf(r11a)}/${r11a?.grandTotalSatang} · ${codeOf(r11b)} · ${codeOf(r11c)}`);
  const r12 = [
    price({ lines: [{ qty: 1, unitPriceSatang: 10.5 }], vat: VAT0 }),
    price({ lines: [{ qty: 1, unitPriceSatang: -1 }], vat: VAT0 }),
    price({ lines: [{ qty: 0, unitPriceSatang: 100 }], vat: VAT0 }),
  ];
  chk("P1.3-S2.12", r12.every((r) => refused(r, ["INVALID_LINE"])), "INVALID_LINE ×3", r12.map(codeOf).join(","));
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
}

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
  "pos-reg-coupon-line", "pos-reg-vat-line", "pos-reg-total",
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
  const debt = ((inv?.baselineDebt?.items ?? []) as Any[]).filter((d) => ["src/lib/modules/pos/register-ui.tsx", "src/app/app/sys/[id]/pos/register/page.tsx"].includes(d.file));
  const openDebt = debt.filter((d) => Number(d.untestid) > 0 && existsSync(join(ROOT, d.file)));
  chk("P1.3-S5.6", inv && openDebt.length === 0, "หนี้หน้าขาย 0", openDebt.map((d) => `${d.file}=${d.untestid}`).join(", ") || "0");
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
  // S5.10 สัญญา createSale (F15.2)
  let f152: { ok: boolean; detail: string } | null = null;
  try {
    const fp = (await import("./fitness-pos.mjs" as string)) as Any;
    fp.runPosFitness((id: string, _n: string, ok: boolean, detail: string) => {
      if (id === "F15.2") f152 = { ok, detail };
    }, ROOT);
  } catch (e) {
    f152 = { ok: false, detail: `โหลด fitness-pos ไม่ได้: ${(e as Error).message.slice(0, 100)}` };
  }
  const f = f152 as { ok: boolean; detail: string } | null;
  chk("P1.3-S5.10", f?.ok === true, "F15.2 ✅", f ? short(f.detail, 200) : "ไม่พบผล F15.2");
}

// ═════════════════════════ 5. S1 S3 S4 (ต้องมี seed + sandbox) ═════════════════════════
const DB_IDS = CHECKS.map(([id]) => id).filter((id) => /-S[134]\./.test(id));
const sb = {
  unitId: "", unlinkedUnitId: "", posSysId: "", invSysId: "",
  productIds: [] as string[], categoryIds: [] as string[], invItemIds: [] as string[],
};
const lanes: Any[] = [];
let realCounters: Any[] = [];

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
  const SHAPE = ["id", "invItemId", "name", "nameEn", "kind", "categoryId", "priceSatang", "sku", "barcode", "imageUrl", "optionGroupCount", "soldOut", "stockLeft"];
  const shapeMiss = prods.length ? SHAPE.filter((k) => !(k in prods[0])) : SHAPE;
  const typesOk = prods.every((p) => typeof p.id === "string" && typeof p.name === "string" && (p.priceSatang === null || Number.isInteger(p.priceSatang)) && typeof p.soldOut === "boolean" && Number.isInteger(p.optionGroupCount) && (p.stockLeft === null || Number.isInteger(p.stockLeft)));
  chk("P1.3-S1.3", g?.ok === true && prods.length > 0 && shapeMiss.length === 0 && typesOk && Array.isArray(g.categories), "ครบทุกคีย์ ชนิดถูก", `ขาด: ${shapeMiss.join(",") || "-"} · ชนิด ${typesOk}`);
  const onHandOf = async (id: string) => Number((await P.invItem.findUnique({ where: { id }, select: { onHand: true } }))?.onHand ?? NaN);
  const crois = prods.find((p) => p.sku === "PQC-CF-CROIS");
  const water = prods.find((p) => p.sku === "PQC-CF-WATER");
  const latte = prods.find((p) => p.sku === "PQC-CF-LATTE");
  const ohC = crois ? await onHandOf(crois.invItemId) : NaN;
  const ohW = water ? await onHandOf(water.invItemId) : NaN;
  chk("P1.3-S1.4", crois?.stockLeft === ohC && water?.stockLeft === ohW && amer?.stockLeft === null && latte?.stockLeft === null && amer?.soldOut === false && latte?.soldOut === false,
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
  const sPos = await P.appSystem.create({ data: { tenantId: tid, type: "POS", name: `${TAG} POS` } });
  sb.posSysId = sPos.id;
  const sInv = await P.appSystem.create({ data: { tenantId: tid, type: "INVENTORY", name: `${TAG} INV` } });
  sb.invSysId = sInv.id;
  await sysSvc.linkUnit(tid, sPos.id, unit.id);
  await sysSvc.linkUnit(tid, sInv.id, unit.id);
  const ctx = { tenantId: tid, systemId: sPos.id, unitId: unit.id };
  const cctx = { tenantId: tid, systemId: sPos.id, actorUserId: owner.userId };
  const invCtx = { tenantId: tid, systemId: sInv.id };
  const cashier = actor(mCash, E.coffee.users.cashier.userId, { role: "STAFF", unitAccess: [unit.id], permissions: { ...(PQC.cashierPermissions as Record<string, unknown>) } });

  // S1.5 empty (ก่อนสร้างสินค้า)
  const e0 = await call(register, "registerCatalog", ctx, owner, {});
  chk("P1.3-S1.5", e0?.ok === true && Array.isArray(e0.products) && e0.products.length === 0 && Array.isArray(e0.categories) && e0.categories.length === 0, "[] []", `${codeOf(e0)} ${short({ p: e0?.products?.length, c: e0?.categories?.length })}`);
  // S1.15 สาขาที่ไม่ผูก POS
  const u1 = await call(register, "registerCatalog", { tenantId: tid, systemId: sPos.id, unitId: unl.id }, owner, {});
  chk("P1.3-S1.15", refused(u1, ["NOT_FOUND"]), "NOT_FOUND", codeOf(u1));

  // สินค้า sandbox: ผ่าน inventory + catalog (ผู้เขียนเดียว F15.1)
  const mkItem = async (sku: string, name: string, cost: number, stock: number | null, more: Any = {}) => {
    const it = await inventory.createItem(invCtx, { sku: `${TAG}-${sku}`, name, costSatang: cost, ...more });
    sb.invItemIds.push(it.id);
    if (stock && stock > 0) await inventory.receive(invCtx, { itemId: it.id, qty: stock, costSatang: cost, idempotencyKey: `${TAG}-recv-${sku}` });
    return it.id as string;
  };
  /** priceSatang null = ไม่ตั้งราคา (ต้นทุน 1,234 ถูกตั้งไว้เพื่อจับการเอาต้นทุนมาเป็นราคา) · itemMore = ฟิลด์ของ InvItem (kind/barcode/priceSatang) */
  const mkProduct = async (sku: string, name: string, priceSatang: number | null, stock: number | null, extra: Any = {}, itemMore: Any = {}) => {
    const invItemId = await mkItem(sku, name, priceSatang === null ? 1234 : Math.floor(priceSatang / 3), stock, itemMore);
    const pr = await call(catalog, "ensureForInvItem", cctx, invItemId);
    const id = pr?.id ?? (pr?.ok === false ? null : pr?.product?.id);
    if (!id) throw Object.assign(new Error(`ensureForInvItem ล้ม: ${short(pr)}`), { code: pr?.code ?? "CATALOG" });
    sb.productIds.push(id);
    if (priceSatang !== null && itemMore.kind !== "SERVICE") {
      const sp = await call(catalog, "setPrice", cctx, id, priceSatang);
      if (sp?.ok === false) throw Object.assign(new Error(`setPrice ล้ม: ${short(sp)}`), { code: sp.code });
    }
    const up = await call(catalog, "updateProduct", cctx, id, { trackStock: stock !== null, ...extra });
    if (up?.ok === false) throw Object.assign(new Error(`updateProduct ล้ม: ${short(up)}`), { code: up.code });
    return { id, invItemId };
  };
  let built = false;
  let A: Any = null, B: Any = null, C: Any = null, D: Any = null, LOW: Any = null, ZERO: Any = null, ARCH: Any = null, OFF: Any = null;
  let NOPRICE: Any = null, SVC: Any = null, OTHER: Any = null;
  let catId = "";
  try {
    const cat = await call(catalog, "createCategory", cctx, { name: `${TAG} ขนม`, nameEn: "Bakery" });
    catId = cat?.id ?? cat?.category?.id ?? "";
    if (catId) sb.categoryIds.push(catId);
    A = await mkProduct("A", "กาแฟทดสอบ", 6500, null);
    B = await mkProduct("B", "ครัวซองต์อัลมอนด์ทดสอบ", 9500, 50, { nameEn: "Almond croissant", categoryId: catId || undefined });
    C = await mkProduct("C", "บราวนี่ทดสอบ", 6500, 50, { categoryId: catId || undefined });
    D = await mkProduct("D", "น้ำเปล่าแจกทดสอบ", 0, null);
    LOW = await mkProduct("LOW", "ขนมเหลือน้อย", 3000, 2);
    ZERO = await mkProduct("ZERO", "ขนมหมดสต็อก", 3000, 0);
    ARCH = await mkProduct("ARCH", "สินค้าเลิกขาย", 1000, null);
    OFF = await mkProduct("OFF", "เมนูปิดขายวันนี้", 4000, null);
    NOPRICE = await mkProduct("NOPRICE", "สินค้ายังไม่ตั้งราคา", null, null);
    SVC = await mkProduct("SVC", "บริการจัดกระเช้าทดสอบ", 30000, null, {}, { kind: "SERVICE", priceSatang: 30000 });
    OTHER = await mkProduct("OTHER", "สินค้าเฉพาะสาขาอื่น", 1500, null, { unitId: unl.id });
    await call(catalog, "archive", cctx, ARCH.id);
    await call(catalog, "setAvailability", cctx, OFF.id, { unitId: unit.id, available: false });
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
  // S1.17 เกิน 200 ตัว: เติมให้ครบ 205 ตัวในระบบคลัง sandbox แล้วค้นตัวสุดท้าย (เข็ม)
  let needle: Any = null;
  if (built) {
    try {
      for (let i = 0; i < 196; i++) await mkProduct(`F${i}`, `สินค้าเติม ${i}`, 1000 + i, null);
      needle = await mkProduct("NEEDLE", "ขนมเปี๊ยะไส้ทุเรียนเข็ม", 4500, null, {}, { barcode: "8850999888881" });
    } catch (e) {
      console.log(`  ⚠️  เติมสินค้า 200+ ไม่สำเร็จ: ${(e as Error).message.slice(0, 120)}`);
    }
  }
  const nByName = await call(register, "registerCatalog", ctx, owner, { q: "เปี๊ยะไส้ทุเรียนเข็ม" });
  const nBySku = await call(register, "registerCatalog", ctx, owner, { q: `${TAG}-NEEDLE` });
  const nByBc = await call(register, "registerCatalog", ctx, owner, { q: "8850999888881" });
  const hit = (r: Any) => r?.ok === true && (r.products as Any[]).some((p) => p.id === needle?.id);
  const total17 = await P.invItem.count({ where: { tenantId: tid, systemId: sInv.id } });
  chk("P1.3-S1.17", !!needle && total17 > 200 && hit(nByName) && hit(nBySku) && hit(nByBc), "เจอทั้ง 3 ทาง (ในระบบคลังที่มี >200 ตัว)", `items ${total17} · name ${hit(nByName)} sku ${hit(nBySku)} barcode ${hit(nByBc)} (${codeOf(nByName)})`);

  // ─── S3 quote + submit ───
  console.log("\n── S3 ส่งบิลฝั่งเซิร์ฟเวอร์ ──");
  let keyN = 0;
  const key = (label: string) => `${TAG}-${label}-${++keyN}`;
  const saleByKey = async (k: string) => P.posSale.findFirst({ where: { tenantId: tid, idempotencyKey: k } });
  const sub = (a: Any, input: Any, cl?: Any, c: Any = ctx) => call(register, "submitRegisterSale", c, a, input, cl);
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
  const s2 = q1?.ok ? await sub(owner, { idempotencyKey: k2, ...cart1, payMethods: pay(q1.grandTotalSatang), cashReceivedSatang: 100000 }) : { ok: false, code: "NO_QUOTE" };
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
  const ok5b = s5b?.ok === true ? l5b?.unitPriceSatang === 6500 && sale5b?.grandTotalSatang === qA0?.grandTotalSatang : refused(s5b, ["PRICE_CHANGED", "PAYMENT_MISMATCH", "PERMISSION_DENIED"]) && !sale5b;
  chk("P1.3-S3.5", refused(s5, ["PAYMENT_MISMATCH", "PRICE_CHANGED"]) && !(await saleByKey(k5)) && ok5b && oneSatang === 0,
    "ยอดปลอมปฏิเสธ · ยอดจริง → ราคา 6500 หรือปฏิเสธ · 0 บรรทัดราคา 1", `${codeOf(s5)} · ${codeOf(s5b)} price ${l5b?.unitPriceSatang} · บรรทัด 1 สตางค์ ${oneSatang}`);
  // S3.6 จ่ายขาด/เกิน 1 สตางค์
  const qA = await quote(owner, { lines: [{ productId: A?.id, qty: 1 }] });
  const k6a = key("under");
  const k6b = key("over");
  const s6a = await sub(owner, { idempotencyKey: k6a, lines: [{ productId: A?.id, qty: 1 }], payMethods: pay((qA?.grandTotalSatang ?? 0) - 1) });
  const s6b = await sub(owner, { idempotencyKey: k6b, lines: [{ productId: A?.id, qty: 1 }], payMethods: pay((qA?.grandTotalSatang ?? 0) + 1) });
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
  chk("P1.3-S3.12", r12.every((c) => c === "PRODUCT_NOT_FOUND") && refused(s12off, ["PRODUCT_UNAVAILABLE"]) && tagged12 === 0 && !!restoProd, "PRODUCT_NOT_FOUND ×3 · PRODUCT_UNAVAILABLE · 0 บิล", `${r12.join(",")} · ${codeOf(s12off)} · บิล ${tagged12} · restoProduct:${!!restoProd}`);
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
  const n14 = await P.posSale.count({ where: { tenantId: tid, idempotencyKey: k14 } });
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
    const n = await P.posSale.count({ where: { tenantId: tid, idempotencyKey: k } });
    const sale = await saleByKey(k);
    const mv = sale ? await outMoves(sale.id) : -1;
    const allOk = res.every((x) => x?.ok === true);
    rounds15.push(`r${r}: ok ${res.filter((x) => x?.ok).length}/10 ids ${ids.size} n ${n} OUT ${mv}${allOk ? "" : ` codes ${[...new Set(res.map(codeOf))].join("|")}`}`);
    if (!(allOk && ids.size === 1 && n === 1 && mv === 1)) ok15 = false;
  }
  chk("P1.3-S3.15", ok15, "ทุกรอบ: 10/10 ok · id เดียว · 1 บิล · OUT 1", rounds15.join(" ; "));
  // S3.16 key เดิม ตะกร้าเปลี่ยน
  const c16 = await sub(owner, { idempotencyKey: k14, lines: [{ productId: C?.id, qty: 3 }], payMethods: pay((qC?.grandTotalSatang ?? 0) * 3) });
  const n16 = await P.posSale.count({ where: { tenantId: tid, idempotencyKey: k14 } });
  const sale16 = await saleByKey(k14);
  chk("P1.3-S3.16", (c16?.ok === true ? c16.saleId === sale14?.id && c16.grandTotalSatang === sale14?.grandTotalSatang : refused(c16, ["IDEMPOTENCY_CONFLICT"])) && n16 === 1 && sale16?.grandTotalSatang === sale14?.grandTotalSatang,
    "บิลเดิม/IDEMPOTENCY_CONFLICT · 1 บิล · ยอดเดิม", `${codeOf(c16)} n ${n16} total ${sale16?.grandTotalSatang}/${sale14?.grandTotalSatang}`);
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
      L = await mkProduct(`LAST${r}`, `ชิ้นสุดท้าย ${r}`, 2500, 1);
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
  // S3.19 ชิ้นสุดท้าย BLOCK
  await P.businessUnit.update({ where: { id: unit.id }, data: { settings: { pos: { stock: { oversellPolicy: "BLOCK" } } } } });
  const r19: string[] = [];
  let ok19 = true;
  for (let r = 0; r < 3; r++) {
    let L: Any = null;
    try {
      L = await mkProduct(`BLK${r}`, `ชิ้นสุดท้าย BLOCK ${r}`, 2500, 1);
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
    const sales = await P.posSale.count({ where: { tenantId: tid, idempotencyKey: { in: keys19 } } });
    r19.push(`r${r}: PAID ${paid} STOCK_INSUFFICIENT ${lost} onHand ${oh} บิล ${sales}`);
    if (!(paid === 1 && lost === 9 && oh === 0 && sales === 1)) ok19 = false;
  }
  await P.businessUnit.update({ where: { id: unit.id }, data: { settings: {} } });
  chk("P1.3-S3.19", ok19, "ทุกรอบ PAID 1 · 9 STOCK_INSUFFICIENT · onHand 0 · บิล 1", r19.join(" ; "));
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
  const s23a0 = await sub(owner, { idempotencyKey: key("noprice0"), lines: [{ productId: NOPRICE?.id, qty: 1 }], payMethods: pay(0) });
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
  const sales = (await P.posSale.findMany({ where: { tenantId: { in: tids }, OR: [{ idempotencyKey: { startsWith: TAG } }, ...orUnits] }, select: { id: true } })) as Any[];
  const saleIds = sales.map((s) => s.id);
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
  counts.category = sb.categoryIds.length ? await del("posCategory", { id: { in: sb.categoryIds } }) : 0;
  if (sb.invSysId) {
    for (const m of ["invMovement", "invLot", "invLocationStock", "invItemImage"]) await del(m, { tenantId: { in: tids }, OR: [{ systemId: sb.invSysId }, { itemId: { in: sb.invItemIds } }] });
    counts.invItem = await del("invItem", { tenantId: { in: tids }, systemId: sb.invSysId });
    for (const m of ["invLocation", "invCategory", "invSettings"]) await del(m, { tenantId: { in: tids }, systemId: sb.invSysId });
  }
  if (sb.unitId) await del("posReceiptCounter", { unitId: sb.unitId });
  // ตัวนับใบเสร็จของสาขาจริง: คืนค่าเดิม (บิลหลุดเข้าสาขาจริง = บั๊กของผู้สร้าง แต่ข้อมูลต้องคืน)
  for (const c of realCounters) {
    try {
      await P.posReceiptCounter.update({ where: { id: c.id }, data: { seq: c.seq } });
    } catch {
      /* แถวหาย = ไม่มีอะไรให้คืน */
    }
  }
  if (realCounters.length) await del("posReceiptCounter", { tenantId: { in: tids }, id: { notIn: realCounters.map((c: Any) => c.id) }, ...(sb.unitId ? { unitId: { not: sb.unitId } } : {}) });
  const units = [sb.unitId, sb.unlinkedUnitId].filter(Boolean);
  if (units.length) await del("appSystemUnit", { unitId: { in: units } });
  const systems = [sb.posSysId, sb.invSysId].filter(Boolean);
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
// ข้อที่ไม่ถึง (harness ล้มกลางทาง) = แดง ไม่ใช่หายเงียบ
for (const [id] of CHECKS) if (!results.has(id)) chk(id, false, "ถูกตรวจ", crashed ? `ไม่ถึง (harness ล้ม: ${crashed.slice(0, 80)})` : "ไม่ถึง");
for (const c of lanes) await c.$disconnect?.().catch?.(() => {});
const failed = [...results.entries()].filter(([, r]) => !r.ok).map(([id]) => id);
console.log(`\n===== ${SUITE} ===== ผ่าน ${results.size - failed.length}/${results.size}${FORCE ? " (QC_FORCE)" : ""}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ suite: SUITE, total: results.size, passed: results.size - failed.length, failed, skipped: false, forced: FORCE, missing: skipReasons, a5: { drift } })}`);
await P.$disconnect?.().catch?.(() => {});
process.exit(failed.length ? 1 : 0);

// ─── หมายเหตุขอบเขต ───
// นอกขอบเขต P1.3 (ใบอื่นเป็นเจ้าของ): P1.2 ตัวเลือก/variant จาก DB (choiceId → priceDelta) — ที่นี่ทดสอบแค่ส่วนต่างราคาในฟังก์ชันบริสุทธิ์ ·
// P1.4 สแกนบาร์โค้ด/กล้อง · P1.5 พักบิล (ปุ่มมี testid แต่พฤติกรรมเป็นของ P1.5) · P1.6 จ่ายหลายวิธี/numpad/เงินทอน ·
// P1.9 กะ (S4.2 ตรวจแค่ "ยังไม่มีกะไม่พัง") · P1.12 สมาชิก/แต้ม · P1.13 ใบกำกับเต็มรูป · P1.15 PIN/อนุมัติเกินเพดาน
