// QC — POS RUN ใบ P1.6: จอชำระเงิน (ฝั่งเซิร์ฟเวอร์ + สัญญาข้อมูล) · เขียนก่อนสร้าง (fail-before) · ผู้เขียนข้อสอบ (oracle writer)
// requires: pos-seed
//
// สัญญา: ledger/pos-briefs/pos-brief-P1.6.md (§2 R1–R10 · §7 คำตอบเจ้าของ O19/O20/O21) · pos-brief-COMMON · pos-brief-LANE-RULES
//        ledger/REVIEW-POS-DESIGN-2026-10-01.md §3.2 (ผู้เรียก createSale) §3.3 §3.5 (กับดักคีย์ซ้ำของร้านอาหาร)
//        โน้ต: ledger/wo-notes/pos-P1.6-oracle.md (รายการข้อ · ผลที่คาดบนฐาน · ความคลาดเคลื่อนของ brief §1 · คำถามถึงผู้คุมงาน)
// ชื่อทุกตัวที่ยังไม่มีในโค้ดถูก "ตั้ง" ในไฟล์นี้ และลงทะเบียนในโน้ตหัวข้อ "Names I had to invent" — ผู้คุมงานต้องรับรองก่อนผู้สร้างเริ่ม
//   ผู้สร้างห้ามแก้ข้อสอบนี้ (ORACLE-EDIT เท่านั้น)
//
// ของที่ใบ P1.6 ต้องส่ง (ข้อสอบนี้คือสัญญา):
//   src/lib/money/vat.ts            splitIncludedVat(grossSatang, rateBp) → { baseSatang, vatSatang } — บริสุทธิ์ (ไม่แตะ prisma/server)
//                                    = สูตรเดียวกับสะพานบัญชีวันนี้ (account/index.ts:123-125): base = Math.round(gross/(1+rate/10000)) · vat = gross − base
//                                    ใช้ร่วมกันทั้ง createSale และ applyExternalSale (R1)
//   pos/service.ts createSale (เพิ่มฟิลด์ล้วน · F15.2):
//     input: note? (≤500) · lines[].note? · serviceChargeSatang? · tipSatang? · payMethods[].cashTenderedSatang? (ที่วิธี CASH) ·
//            payMethods[].reference? (CARD) · คงฟิลด์เดิมทุกตัว
//     เก็บ: PosSale.vatSatang (R1) · note · serviceChargeSatang · tipSatang · เงินรับ/ทอน ที่แถว PosPayment ของ CASH: tenderedSatang + changeSatang
//           (มติผู้คุมงาน §8 ข้อ 2) · PosSaleLine.note · ref ของบัตร
//           (PosPayment.reference ถ้ามีคอลัมน์ · ไม่มี = PosPayment.note ที่มีอยู่แล้ว)
//     ยอด: grandTotal = Σบรรทัด − ส่วนลด − คูปอง + serviceCharge (VAT รวมในราคา · ทิปไม่อยู่ใน grandTotal) · Σ payMethods = grandTotal + tip
//     ปฏิเสธ (throw error ที่มี .code หรือข้อความขึ้นต้นด้วยรหัส): PAYMENT_MISMATCH (รวมเงินรับ < ส่วนเงินสด) · IDEMPOTENCY_CONFLICT ·
//           UNIT_SYSTEM_MISMATCH (ก่อนแตะตัวนับใบเสร็จ) · STOCK_INSUFFICIENT (นโยบาย BLOCK)
//     คีย์ซ้ำ (R6): payload เดิม → คืนบิลเดิมพร้อม status ("PAID" | "VOIDED") · payload ต่าง → IDEMPOTENCY_CONFLICT (ไม่ขึ้นกับลำดับบรรทัด/วิธีจ่าย)
//   pos/register.ts submitRegisterSale: วิธีจ่าย CASH|PROMPTPAY|TRANSFER|CARD · 1…10 รายการ (ซ้ำชนิดได้) · 11 = SPLIT_INVALID ·
//     รายการ ≤ 0 = VALIDATION (คง P1.3 S3.43) · input เพิ่ม note · tipSatang · payMethods[].reference · quote เพิ่ม serviceChargeSatang
//   pos/pricing-shared.ts priceCart: input เพิ่ม serviceChargeBp? → serviceChargeSatang (ปัดครึ่งขึ้นจากยอดหลังส่วนลดทั้งหมด) · grand รวมค่าบริการ
//   pos/payment-settings.ts: posPaymentSettings(ctx) · updatePosPaymentSettings(ctx, actor, patch) → {ok:true, settings} | {ok:false, code, message}
//     เก็บที่ AppSystem(POS).settings.pos.serviceCharge {enabled, rateBp} · settings.pos.tip {enabled, ledgerAccountId} · ปริยายปิดทั้งคู่
//     เปิดทิปโดยไม่มี ledgerAccountId / บัญชีไม่ใช่ของสมุดที่ผูก POS นี้ / POS ไม่ผูกสมุด = TIP_ACCOUNT_REQUIRED (O20 · มติ §8 ข้อ 6) · STAFF = PERMISSION_DENIED · rateBp ผิดรูป = VALIDATION
//   action เปลือกบาง updatePosPaymentSettingsAction ในไฟล์ src/lib/modules/pos/*actions*.ts ("use server" · ไม่ throw)
//   R7+O21 การ์ดคู่สาขา↔ระบบใน createSale: สาขาผูก POS อื่น = UNIT_SYSTEM_MISMATCH เสมอ · สาขาไม่ผูก POS ใดเลย: ร้านมี POS ตัวเดียว = ขายได้เหมือนวันนี้ ·
//     ร้านมี POS 2+ = UNIT_SYSTEM_MISMATCH + ข้อความไทยมีคำว่า "เลือกจุดขายก่อน"
//   R8 นโยบาย BusinessUnit.settings.pos.stock.oversellPolicy (ที่เดียวกับ qc-pos-p1.3 S6.1): BLOCK = ตรวจ+ตัดใน tx ของบิล ·
//     ALLOW_NEGATIVE/ไม่ตั้ง = พฤติกรรมวันนี้
//   ข้อความ: refusalMessageKey ของ UNIT_SYSTEM_MISMATCH SPLIT_INVALID STOCK_INSUFFICIENT TIP_ACCOUNT_REQUIRED + คีย์ pos.register.errors.* th+en
//
// ขอบเขต: V VAT · T แบ่งจ่าย · C เงินสดรับ/ทอน · K ค่าบริการ/ทิป · N หมายเหตุ · I idempotency · U คู่สาขา↔ระบบ · B BLOCK · R ปฏิเสธเป็นข้อมูล · Z คืนสภาพ
//   UI (R9 ภาพ 02/05ข · ลบ InterimPayDialog/SaleDone) = ผู้คุมงานตรวจที่ visual — ไม่อยู่ในข้อสอบนี้
//
// 🔴 กติกาข้อสอบ (แบบเดียวกับ qc-pos-p1.3): SKIP เมื่อของ P1.6 ยังไม่มี (exit 0 + เหตุผล) · QC_FORCE=1 = ข้ามด่าน SKIP (ต้องแดงตามเหตุผล ไม่ crash)
//    --list = พิมพ์ทุก id โดยไม่แตะ DB · ก่อนเขียนแถวแรกต้องเป็น host ep-frosty-lab (QC4) เท่านั้น (ไม่มีทางปลด)
//    แถวชั่วคราวติดป้าย `qc-p1.6-<rand>` อยู่ในร้าน QC กาแฟ (สาขา/ระบบ sandbox) + สาขาชั่วคราว 1 สาขาในร้าน QC อาหาร (ข้อ U3) · ลบทั้งหมดใน finally
//    บิลบน POS ที่ผูกสมุดบัญชี (VAT) ทำใน tx ของข้อสอบแล้วลบ event pos.sale.paid ก่อน commit ⇒ ไม่มีการลงบัญชีจริงเกิดขึ้น
//    นับแถวร้าน QC ก่อน/หลังต้องเท่ากัน (Z1) + ลายนิ้วมือแถวเดิม (Z2) · การแข่งใช้ PrismaClient คนละตัว (connection จริงคนละเส้น)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";

const SUITE = "qc-pos-p1.6";
const ROOT = process.cwd();
const LIST = process.argv.includes("--list");
const FORCE = process.env.QC_FORCE === "1";

// ═════════════════════════ ทะเบียนข้อสอบ (id · X-group · หัวข้อ) — --list พิมพ์ชุดนี้ ═════════════════════════
// X-group: "-" = เชิงหน้าที่ล้วน · ค่าอื่น = กลุ่มบังคับใน POS-MASTER-PLAN §3 (X1 idempotency · X2 ข้ามขอบเขต · X3 สิทธิ์ · X4 เงิน · X6 แข่ง)
const CHECKS: readonly (readonly [string, string, string])[] = [
  // ── V VAT เก็บลงบิล (R1) ──
  ["P1.6-V1", "X4", "splitIncludedVat (src/lib/money/vat.ts) = สูตรสะพานบัญชี (gross − Math.round(gross/(1+rate))) ทุกตัวใน 10,000 ยอดสุ่ม + 0…2,000 × อัตรา 0/100/300/500/700/900/1000/1500 bp · base+vat = gross · Int · อัตรา 700 = VAT ของ priceCart INCLUDED (จอ = บิล)"],
  ["P1.6-V2", "X4", "ผู้ใช้สูตรเดียว [static]: account/index.ts applyExternalSale เรียก splitIncludedVat และไม่มีสูตรถอด VAT แบบเขียนเอง · service.ts ไม่มี `const vat = 0` และเรียก splitIncludedVat · vat.ts ไม่ import prisma/server"],
  ["P1.6-V3", "X4", "createSale บน POS ที่ผูกสมุดจด VAT 7%: vatSatang = splitIncludedVat(grandTotal, 700) (0 · 1 · 15 · 6,500 · 10,700 · 6,500−ส่วนลด 500) · grandTotal = Σบรรทัด − ส่วนลด (VAT รวมในราคา ยอดไม่เปลี่ยน)"],
  ["P1.6-V4", "X4", "vatSatang = 0 เมื่อ POS ไม่ผูกบัญชี · ผูกสมุดที่ไม่จด VAT · การเชื่อมถูกปิด (AccountSystemLink.enabled=false)"],
  ["P1.6-V5", "X4", "หน้าขายบน POS ที่จด VAT: vatSatang ที่เก็บ = vatSatang ของ quote (INCLUDED 700) = splitIncludedVat(grandTotal) · grandTotal = quote"],
  // ── T แบ่งจ่าย (R2) ──
  ["P1.6-T1", "X4", "บิล 0 บาท + payMethods ว่าง → PAID 0 แถวจ่าย vat 0 ทั้ง createSale เดิมและหน้าขาย (รายการเอง 0 บาทโดยเจ้าของ)"],
  ["P1.6-T2", "X4", "แบ่ง 1 สตางค์: CASH 1 + PROMPTPAY 1 + TRANSFER 1 + CARD ที่เหลือ → PAID · 4 แถว ชนิด/ยอดตรงทุกแถว · Σ = grandTotal"],
  ["P1.6-T3", "X4", "10 รายการ (ซ้ำชนิดได้) → PAID 10 แถว · 11 รายการ → SPLIT_INVALID ไม่มีบิล"],
  ["P1.6-T4", "X4", "Σ ≠ ยอด (ขาด/เกิน 1 สตางค์) → PAYMENT_MISMATCH · รายการ 0 / −1 (ชดเชย) / 1.5 → VALIDATION · ไม่มีบิลทุกกรณี"],
  ["P1.6-T5", "-", "CARD + reference (EDC): หน้าขายและ createSale เดิมเก็บ reference ตรงตัว (PosPayment.reference หรือ .note)"],
  ["P1.6-T6", "X4", "ชนิดวิธีจ่ายของหน้าขาย = CASH|PROMPTPAY|TRANSFER|CARD: TRANSFER ล้วน / CARD ล้วน → PAID · DEPOSIT / ROOM_CHARGE / รหัสมั่ว → VALIDATION ไม่มีบิล"],
  ["P1.6-T7", "X4", "ปิดวันเห็นบัตร: closeDaySummary(POS sandbox).byMethod มี CARD = Σ ยอด CARD ของบิล PAID วันนี้ · cashInDrawer ไม่รวมบัตร · closeDayBills ของบิลบัตรไม่ใช่ '—'"],
  // ── C เงินสดรับ/ทอน (R3) ──
  ["P1.6-C1", "X4", "หน้าขาย เงินสด 4,000 + พร้อมเพย์ รับ 5,000 → changeSatang 1,000 · แถว PosPayment CASH เก็บ tenderedSatang 5,000 + changeSatang 1,000 · พร้อมเพย์ล้วน → ไม่มีแถว CASH"],
  ["P1.6-C2", "X4", "createSale: CASH 6,500 + cashTenderedSatang 10,000 → แถว CASH tenderedSatang 10,000 / changeSatang 3,500"],
  ["P1.6-C3", "X4", "เงินรับ < ส่วนเงินสด 1 สตางค์ → PAYMENT_MISMATCH ทั้งหน้าขายและ createSale · ไม่มีบิล · ตัวนับใบเสร็จสาขาไม่ขยับ"],
  ["P1.6-C4", "X4", "ผู้เรียกเดิมที่ไม่ส่งเงินรับ (createSale CASH ไม่มี cashTenderedSatang) ยัง PAID เหมือนเดิม (ไม่ปฏิเสธ · F15.2)"],
  // ── K ค่าบริการ / ทิป (O19/O20) ──
  ["P1.6-K1", "X4", "ปิด (ไม่มีตั้งค่า หรือ enabled:false + rateBp) → quote/บิล serviceChargeSatang 0 tipSatang 0 · grandTotal = priceCart แบบวันนี้ · createSale เดิมเก็บ 0/0"],
  ["P1.6-K2", "X4", "ค่าบริการเปิด 10%: quote 6,500 → ค่าบริการ 650 รวม 7,150 · บิลเก็บ 650/7,150 · VAT = splitIncludedVat(7,150) = 468 (อยู่ในฐาน VAT) · จ่าย 6,500 → PAYMENT_MISMATCH"],
  ["P1.6-K3", "X4", "ค่าบริการปัดครึ่งขึ้นจากยอดหลังส่วนลด: 3,335 → 334 (ไม่ใช่ 333) · 13,000 − ท้ายบิล 1,000 → 1,200 รวม 13,200 · priceCart(serviceChargeBp) ฝั่ง client ได้เท่ากัน"],
  ["P1.6-K4", "X3", "เปิดทิปโดยไม่มีบัญชี / บัญชีของสมุดอื่น → TIP_ACCOUNT_REQUIRED (คืนเป็นข้อมูล) ทิปยังปิด · บัญชีของสมุดที่ผูก POS นี้ → เปิดได้"],
  ["P1.6-K5", "X4", "ทิปเปิด: ทิป 500 บนบิล 6,500 → tipSatang 500 · grandTotal 6,500 (ไม่ใช่รายได้) · VAT 425 (ไม่ใช่ 458 · ไม่อยู่ในฐาน) · Σจ่าย 7,000 · จ่าย 6,500 → PAYMENT_MISMATCH"],
  ["P1.6-K6", "X4", "ทิปปิดแต่ส่ง tipSatang 500 → VALIDATION ไม่มีบิล (ไม่เมินเงียบ) · ทิปเปิดแต่ −1 / 1.5 / \"500\" → VALIDATION"],
  ["P1.6-K7", "X3", "ตั้งค่าชำระเงิน: STAFF → PERMISSION_DENIED · rateBp 1.5 / −1 / 10001 → VALIDATION · ค่าตั้งเดิมไม่เปลี่ยน"],
  ["P1.6-K9", "X3", "POS ที่ไม่ผูกสมุดบัญชี: เปิดทิป (แม้ส่ง ledgerAccountId ของสมุดใด ๆ) → TIP_ACCOUNT_REQUIRED คืนเป็นข้อมูล · ทิปยังปิด"],
  ["P1.6-K8", "X4", "ค่าบริการเปิดที่ POS แต่ผู้เรียกเดิม (createSale ไม่ส่ง serviceChargeSatang เช่นร้านอาหารที่มีบรรทัด service charge เอง) → serviceChargeSatang 0 ยอดเดิม (ไม่คิดซ้ำ)"],
  // ── N หมายเหตุ (R5 · Q11) ──
  ["P1.6-N1", "-", "หมายเหตุบิล 500 ตัวอักษร → PosSale.note ตรงตัว (หน้าขาย + createSale) · 501 → VALIDATION ไม่มีบิล"],
  ["P1.6-N2", "-", "หมายเหตุบรรทัด → PosSaleLine.note ตรงตัว · 501 → VALIDATION ไม่มีบิล"],
  // ── I idempotency ทุกผู้เรียก (R6) ──
  ["P1.6-I1", "X1", "createSale เดิม คีย์ซ้ำ + payload เดิม (รวมสลับลำดับบรรทัด) ขณะ PAID → saleId เดิม status \"PAID\" · บิล 1 · แถวจ่าย 1 ชุด"],
  ["P1.6-I2", "X1", "createSale เดิม คีย์ซ้ำ + payload ต่าง (จำนวน / ราคา / ชนิดวิธีจ่าย / แบ่งยอดต่าง) ขณะ PAID → IDEMPOTENCY_CONFLICT · บิล 1 · ยอดเดิม"],
  ["P1.6-I3", "X1", "createSale เดิม คีย์ของบิลที่ VOIDED + payload เดิม → saleId เดิม status \"VOIDED\" · ไม่มีบิลใหม่ · ตัวนับใบเสร็จไม่ขยับ"],
  ["P1.6-I4", "X1", "createSale เดิม คีย์ของบิลที่ VOIDED + payload ต่าง → IDEMPOTENCY_CONFLICT · ไม่มีบิลใหม่"],
  ["P1.6-I5", "X1", "หน้าขาย (คงสัญญา P1.3): PAID+เดิม → ok duplicated · PAID+ต่าง → CONFLICT+saleId · VOIDED+เดิม/ต่าง → CONFLICT + saleStatus VOIDED"],
  ["P1.6-I6", "X1", "ร้านอาหาร re-checkout (restaurant/order.ts:418 คีย์ rest-<hash>) หลัง voidCheckout รายการชุดเดิม → จบ PAID (มติ §8 ข้อ 3: ผู้เรียกออกคีย์ใหม่เมื่อบิลเดิม VOIDED) · บิลใหม่ ≠ บิลเดิม · PAID เพียง 1 บิล · บิลเดิมยัง VOIDED"],
  ["P1.6-I7", "X6", "createSale เดิม คีย์เดียว 10 connection พร้อมกัน × 3 รอบ → ทุกคำตอบ ok saleId เดียว · บิล 1 ต่อรอบ (ไม่มี P2002 หลุดถึงผู้เรียก)"],
  // ── U คู่สาขา↔ระบบ (R7 + O21) ──
  ["P1.6-U1", "X2", "คู่ผิดชัดแจ้ง (สาขาผูก POS อื่น): ขณะตัวนับใบเสร็จของสาขาถูกล็อกจาก connection อื่น → UNIT_SYSTEM_MISMATCH ทันที (ไม่ค้างรอ) · ไม่มีบิล · ตัวนับไม่ขยับหลังปล่อยล็อก"],
  ["P1.6-U2", "X2", "ร้านมี POS 2+ · สาขาไม่ผูก POS ใดเลย → UNIT_SYSTEM_MISMATCH + ข้อความ 'เลือกจุดขายก่อน' · ไม่มีบิล · ไม่มีแถวตัวนับของสาขานั้น"],
  ["P1.6-U3", "X2", "ร้านมี POS ตัวเดียว (ร้าน QC อาหาร) · สาขาไม่ผูก POS → ขายได้เหมือนวันนี้ (ผู้เรียกแบบ 'POS ตัวแรก') · คู่ที่ผูกถูก (sandbox) → PAID"],
  ["P1.6-U4", "-", "[static] service.ts มีการ์ด UNIT_SYSTEM_MISMATCH (ลำดับ 'ก่อนตัวนับ' พิสูจน์ที่ U1) · ทะเบียนผู้เรียก createSale ใน src = 18 จุด/15 ไฟล์ตามโน้ต (จุดใหม่/หาย = ผู้คุมงานทบทวน)"],
  // ── B นโยบายขายเกินสต็อก (R8 · S3.19/S6.1) ──
  ["P1.6-B1", "X4", "BLOCK: เหลือ 2 ขาย 3 → STOCK_INSUFFICIENT ไม่มีบิล สต็อก 2 ไม่มี OUT ตัวนับไม่ขยับ · ขาย 2 → PAID สต็อก 0 OUT 1 แถว (ไม่ตัดซ้ำหลัง commit) · สินค้าไม่นับสต็อกยังขายได้"],
  ["P1.6-B2", "X4", "BLOCK ผ่าน createSale รูปแบบเดิม (บรรทัดมี itemId): เหลือ 1 ขาย 2 → STOCK_INSUFFICIENT ไม่มีบิล สต็อก 1"],
  ["P1.6-B3", "X6", "BLOCK ชิ้นสุดท้าย 10 connection × 3 รอบ → PAID 1 · STOCK_INSUFFICIENT 9 · สต็อก 0 ไม่ติดลบ · ไม่มีรหัสอื่น (deadlock/BUSY/INTERNAL/THROW)"],
  ["P1.6-B4", "X6", "BLOCK สองสินค้าสลับลำดับบรรทัด ([X,Y]/[Y,X]) 10 connection × 3 รอบ (เหลืออย่างละ 5) → PAID 5 · STOCK_INSUFFICIENT 5 · สต็อก 0/0 · ไม่มี deadlock"],
  ["P1.6-B5", "X4", "ไม่ตั้งนโยบาย / ALLOW_NEGATIVE → ขายเกินได้เหมือนวันนี้ (PAID · สต็อก −1)"],
  // ── R ปฏิเสธเป็นข้อมูล (R10) ──
  ["P1.6-R1", "-", "คำปฏิเสธใหม่ของหน้าขาย/ตั้งค่า (SPLIT_INVALID · STOCK_INSUFFICIENT · PAYMENT_MISMATCH เงินรับ · VALIDATION หมายเหตุ/ทิป · TIP_ACCOUNT_REQUIRED) = คืน {ok:false, code, message} ไม่ throw"],
  ["P1.6-R2", "-", "[static] ไฟล์ action ของ POS (*actions*.ts): \"use server\" · export เฉพาะ async function · ไม่มี throw · ทุกตัวมี catch · มี updatePosPaymentSettingsAction"],
  ["P1.6-R3", "-", "refusalMessageKey: UNIT_SYSTEM_MISMATCH→errors.unitSystemMismatch · SPLIT_INVALID→errors.splitInvalid · STOCK_INSUFFICIENT→errors.stockInsufficient · TIP_ACCOUNT_REQUIRED→errors.tipAccountRequired · ทุกคีย์มี th+en · en ไม่มีอักษรไทย · th ของ unitSystemMismatch มี 'เลือกจุดขาย'"],
  // ── Z คืนสภาพ ──
  ["P1.6-Z1", "-", "QC4 คืนสภาพ: จำนวนแถวของร้าน QC POS ทั้งสอง (ทุกตารางที่ข้อสอบแตะ) ก่อน = หลัง · ผลรวมตัวนับใบเสร็จไม่ขยับ"],
  ["P1.6-Z2", "-", "QC4 ลายนิ้วมือ: แถวเดิมของร้าน QC POS (PosProduct · PosCategory · InvItem · AppSystem รวม settings · AppSystemUnit · BusinessUnit · Membership · PosReceiptCounter · AccountSettings · AccountSystemLink) ทุกคอลัมน์ ก่อน = หลัง"],
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
/** รหัสปฏิเสธจากผลแบบ {ok:false, code} */
const codeOf = (r: Any): string => (r && r.ok === false ? String(r.code ?? "NO_CODE") : r && r.ok === true ? "OK" : "UNKNOWN");
const refused = (r: Any, codes: string[]) => r?.ok === false && codes.includes(String(r.code));
/** รหัสของ error ที่ createSale โยน: .code (typed error) ก่อน · ไม่มี = รหัสตัวพิมพ์ใหญ่ที่ขึ้นต้นข้อความ ("PAYMENT_MISMATCH: …") · ไม่มีทั้งคู่ = THROW */
function errCode(e: unknown): string {
  const o = e as { code?: unknown; message?: unknown } | null;
  if (o && typeof o.code === "string" && /^[A-Z][A-Z0-9_]+$/.test(o.code)) return o.code;
  const m = /^([A-Z][A-Z0-9_]{3,})\b/.exec(String(o?.message ?? ""));
  if (m) return m[1];
  return typeof o?.code === "string" && o.code ? o.code : "THROW";
}

/** เรียกฟังก์ชันของผู้สร้างแบบไม่ crash: ไม่มีฟังก์ชัน = {ok:false, code:"MISSING:<name>"} · throw = {ok:false, code, threw:true} */
async function call(mod: Any, name: string, ...args: unknown[]): Promise<Any> {
  const fn = mod?.[name];
  if (typeof fn !== "function") return { ok: false, code: `MISSING:${name}`, message: `ยังไม่มีฟังก์ชัน ${name}` };
  try {
    return await fn(...args);
  } catch (e) {
    return { ok: false, code: errCode(e), message: String((e as Error)?.message ?? e).slice(0, 200), threw: true };
  }
}
function callSync(mod: Any, name: string, ...args: unknown[]): Any {
  const fn = mod?.[name];
  if (typeof fn !== "function") return { ok: false, code: `MISSING:${name}` };
  try {
    return fn(...args);
  } catch (e) {
    return { ok: false, code: errCode(e), message: String((e as Error)?.message ?? e).slice(0, 200), threw: true };
  }
}

// ═════════════════════════ 1. env (QC4 เท่านั้น) ═════════════════════════
const envMod = (await import("./pos-qc-env.mjs" as string)) as Any;
envMod.loadPosQcEnv(SUITE);
const PQC = envMod.PQC as Any;
const TIDS = envMod.PQC_TENANT_IDS as string[];
/** ด่าน host ก่อนเขียนแถวแรก: DATABASE_URL (และ DIRECT_URL ถ้ามี) ต้องเป็น ep-frosty-lab เท่านั้น — POS_QC_ALLOW_HOST ไม่ปลดด่านนี้ */
function assertQc4BeforeWrite(): void {
  const mark = envMod.POS_QC_HOST_MARK as string;
  const bad = [["DATABASE_URL", process.env.DATABASE_URL ?? ""], ["DIRECT_URL", process.env.DIRECT_URL ?? ""]].filter(([n, u]) => (n === "DATABASE_URL" || u) && !u.includes(mark));
  if (bad.length) {
    console.error(`🔴 หยุด! ${SUITE}: จะเขียนแถวได้เฉพาะ QC4 (${mark}) — ${bad.map(([n]) => n).join(", ")} ไม่ใช่ (ยังไม่ได้เขียนอะไร)`);
    process.exit(4);
  }
}

// ═════════════════════════ 2. ด่าน SKIP (ของใบ P1.6 ยังไม่มี) ═════════════════════════
const { prisma } = (await import("@/lib/core/db")) as Any;
const P = prisma as Any;
const prismaPkg = (await import("@prisma/client")) as Any;
const DMMF = ((prismaPkg?.Prisma ?? prismaPkg?.default?.Prisma)?.dmmf?.datamodel ?? { models: [], enums: [] }) as { models: { name: string; fields: { name: string }[] }[]; enums: { name: string; values: { name: string }[] }[] };
const dbCols = new Set<string>();
const dbPayTypes = new Set<string>();
// DMMF ของ client ที่ generate แล้ว (ไม่มี = ใช้ information_schema แทน — ตารางที่ข้อสอบถามมีแค่ PosSale/PosSaleLine/PosPayment)
const hasField = (model: string, field: string) =>
  DMMF.models.length ? !!DMMF.models.find((m) => m.name === model)?.fields.some((f) => f.name === field) : dbCols.has(`${model}.${field}`);
const enumHas = (en: string, v: string) => (DMMF.enums.length ? !!DMMF.enums.find((e) => e.name === en)?.values.some((x) => x.name === v) : en === "PosPayType" && dbPayTypes.has(v));
try {
  const rows = (await P.$queryRawUnsafe(
    `SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name IN ('PosSale','PosSaleLine','PosPayment')`,
  )) as Any[];
  for (const r of rows) dbCols.add(`${r.table_name}.${r.column_name}`);
  const ev = (await P.$queryRawUnsafe(`SELECT e.enumlabel AS v FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'PosPayType'`)) as Any[];
  for (const r of ev) dbPayTypes.add(String(r.v));
} catch (e) {
  console.log(`  (อ่าน information_schema ไม่ได้: ${(e as Error).message.slice(0, 100)})`);
}
/** ที่เก็บเงินรับ/ทอน (R3 ให้ผู้คุมงานตัดสิน) — ข้อสอบรับทั้งระดับบิลและระดับแถวจ่าย CASH */
/** เงินรับ/ทอน = แถว PosPayment ของ CASH (มติ §8 ข้อ 2) */
const TENDER_READY = hasField("PosPayment", "tenderedSatang") && hasField("PosPayment", "changeSatang");
const NEW_FIELDS: [string, string][] = [["PosSale", "note"], ["PosSale", "serviceChargeSatang"], ["PosSale", "tipSatang"], ["PosSaleLine", "note"]];

let scope: Any = null;
let restoScope: Any = null;
try {
  scope = await envMod.resolvePosScope(prisma, "coffee");
  restoScope = await envMod.resolvePosScope(prisma, "resto");
} catch (e) {
  console.log(`  (resolvePosScope ล้ม: ${(e as Error).message.slice(0, 120)})`);
}

// ── A5: นับแถวของร้าน QC POS (อ่านอย่างเดียว) — ใช้ทั้งตอน SKIP และตอนรันจริง (Z1) ──
const COUNT_MODELS = [
  "posSale", "posSaleLine", "posPayment", "posReceiptCounter", "outboxEvent", "invItem", "invMovement", "invLocationStock",
  "appSystem", "appSystemUnit", "businessUnit", "auditLog", "accountJournalEntry", "pointLedger", "customer", "couponRedemption",
  "posProduct", "posCategory", "recipeLine",
  // P1.6: สมุดบัญชี sandbox (V3–V5 · K) + โต๊ะ/ออเดอร์ร้านอาหาร sandbox (I6)
  "accountSettings", "accountSystemLink", "accountDocument",
  "restaurantSetting", "restaurantZone", "restaurantTable", "tableSession", "restaurantOrder", "restaurantOrderItem", "kdsStation",
] as const;
const FP_MODELS = ["posProduct", "posCategory", "invItem", "appSystem", "appSystemUnit", "businessUnit", "membership", "posReceiptCounter", "accountSettings", "accountSystemLink"] as const;
async function fingerprint(): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const m of FP_MODELS) {
    const d = P[m];
    if (typeof d?.findMany !== "function") {
      out[m] = "absent";
      continue;
    }
    try {
      const rows = (await d.findMany({ where: { tenantId: { in: TIDS } }, orderBy: { id: "asc" } })) as Any[];
      out[m] = `${rows.length}:${createHash("sha256").update(JSON.stringify(rows)).digest("hex").slice(0, 16)}`;
    } catch (e) {
      out[m] = `err:${(e as Error).message.slice(0, 40)}`;
    }
  }
  return out;
}
async function snapshotCounts(): Promise<Record<string, number | string>> {
  const out: Record<string, number | string> = {};
  for (const tid of TIDS) {
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
      const rows = (await P.posReceiptCounter.findMany({ where: { tenantId: tid }, select: { seq: true } })) as Any[];
      out[`${tid}.receiptSeqSum`] = rows.reduce((s, r) => s + Number(r.seq), 0);
    } catch {
      out[`${tid}.receiptSeqSum`] = "err";
    }
  }
  return out;
}
const countsBefore = await snapshotCounts();

// ── ตัวบ่งชี้ว่าของ P1.6 ถูกสร้างแล้ว (ไม่ครบ = SKIP ทั้งชุดเมื่อไม่ FORCE — แบบเดียวกับ qc-pos-p1.3) ──
const POS_SRC_DIRS = ["src/lib/modules/pos", "src/lib/money", "src/app/app/sys/[id]/pos", "src/components/pos"];
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
const exportsFn = (src: string, n: string) => new RegExp(`export\\s+(async\\s+)?function\\s+${n}\\b|export\\s+const\\s+${n}\\b`).test(src);
const VAT_FILE = "src/lib/money/vat.ts";
const PAYSET_FILE = "src/lib/modules/pos/payment-settings.ts";
const svcSrc = stripComments(rd("src/lib/modules/pos/service.ts"));
const regSharedSrc = stripComments(rd("src/lib/modules/pos/register-shared.ts"));
const OVERSELL_READY = walk("src").some((f) => /oversellPolicy/.test(stripComments(rd(f))));
const payTypesLine = /REGISTER_PAY_TYPES\s*=\s*\[([^\]]*)\]/.exec(regSharedSrc)?.[1] ?? "";

const skipReasons: string[] = [];
if (!exportsFn(rd(VAT_FILE), "splitIncludedVat")) skipReasons.push(`${VAT_FILE} ยังไม่มี export splitIncludedVat (R1)`);
for (const [m, f] of NEW_FIELDS) {
  const c = hasField(m, f);
  const d = dbCols.has(`${m}.${f}`);
  if (!c || !d) skipReasons.push(`คอลัมน์ ${m}.${f} ยังไม่มี (client ${c ? "✓" : "✗"} · DB ${d ? "✓" : "✗"})`);
}
for (const f of ["tenderedSatang", "changeSatang"]) {
  const c = hasField("PosPayment", f);
  const d = dbCols.has(`PosPayment.${f}`);
  if (!c || !d) skipReasons.push(`คอลัมน์ PosPayment.${f} ยังไม่มี (client ${c ? "✓" : "✗"} · DB ${d ? "✓" : "✗"}) (R3 · มติ §8 ข้อ 2)`);
}
if (!enumHas("PosPayType", "CARD") || !dbPayTypes.has("CARD")) skipReasons.push(`enum PosPayType ยังไม่มี CARD (client ${enumHas("PosPayType", "CARD") ? "✓" : "✗"} · DB ${dbPayTypes.has("CARD") ? "✓" : "✗"})`);
if (!/["']CARD["']/.test(payTypesLine) || !/["']TRANSFER["']/.test(payTypesLine)) skipReasons.push("REGISTER_PAY_TYPES ยังไม่รวม TRANSFER/CARD (R2)");
if (!/UNIT_SYSTEM_MISMATCH/.test(svcSrc)) skipReasons.push("service.ts ยังไม่มีการ์ด UNIT_SYSTEM_MISMATCH (R7)");
if (!OVERSELL_READY) skipReasons.push("ยังไม่มีโค้ดใน src/ อ่าน settings.pos.stock.oversellPolicy (R8)");
if (!exportsFn(rd(PAYSET_FILE), "updatePosPaymentSettings") || !exportsFn(rd(PAYSET_FILE), "posPaymentSettings")) skipReasons.push(`${PAYSET_FILE} ยังไม่มี export updatePosPaymentSettings/posPaymentSettings (O19/O20)`);
if (!scope) skipReasons.push("ชุดข้อมูล QC POS (ร้านกาแฟ) ยังไม่ถูก seed บน DB นี้ — รัน scripts/seed-pos-qc.mts ก่อน");
if (!restoScope) skipReasons.push("ชุดข้อมูล QC POS (ร้านอาหาร) ยังไม่ถูก seed — ข้อ U3 ต้องใช้");

if (skipReasons.length > 0 && !FORCE) {
  console.log(`⏭️  SKIPPED — ${SUITE}: ของใบ P1.6 ยังไม่มี (ถูกต้องสำหรับข้อสอบที่เขียนก่อนสร้าง)`);
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
const vatMod = existsSync(join(ROOT, VAT_FILE)) ? await tryImport("@/lib/money/vat") : null;
const pricing = await tryImport("@/lib/modules/pos/pricing-shared");
const regShared = await tryImport("@/lib/modules/pos/register-shared");
const register = await tryImport("@/lib/modules/pos/register");
const catalog = await tryImport("@/lib/modules/pos/catalog");
const service = await tryImport("@/lib/modules/pos/service");
const paySet = existsSync(join(ROOT, PAYSET_FILE)) ? await tryImport("@/lib/modules/pos/payment-settings") : null;
const inventory = await tryImport("@/lib/modules/inventory/service");
const sysSvc = await tryImport("@/lib/modules/system/service");
const restaurant = await tryImport("@/lib/modules/restaurant/order");

const RAND = Math.random().toString(36).slice(2, 8);
const TAG = `qc-p1.6-${RAND}`;
// คีย์ของหน้าขาย = 8–100 ตัว [A-Za-z0-9_-] (P1.3 K1) ⇒ ใช้ KTAG · เซิร์ฟเวอร์เก็บ 'reg2:' + คีย์
const KTAG = TAG.replace(/[^A-Za-z0-9_-]/g, "_");
const REG_NS = "reg2:";
const keyIn = (k: string) => ({ in: [k, `${REG_NS}${k}`] });
const runStart = new Date();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** สูตรสะพานบัญชีตรงตัว (account/index.ts:123-125 ณ 315da19e · กรณีจด VAT) — ตัวอ้างอิงของ V1/V3/V5/K2/K5 */
const bridgeVat = (gross: number, rateBp: number): number => {
  const base = rateBp > 0 ? Math.round(gross / (1 + rateBp / 10000)) : gross;
  return gross - base;
};
/** ปัดครึ่งขึ้นของ num/den (num ≥ 0) — ตัวตรวจคิดเอง */
const rhu = (num: number, den: number) => Math.floor((2 * num + den) / (2 * den));

// ═════════════════════════ 4. ข้อที่ไม่แตะ DB (V1 V2 U4 R2 R3) ═════════════════════════
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
      /* ไฟล์พัง = คีย์หาย (R3 แดงเอง) */
    }
  }
  return keys;
}

/** ทะเบียนผู้เรียก createSale ณ 315da19e (REVIEW §3.2 + 2 จุดที่เกิดหลังรีวิว: pos/api/ops/sales.ts · pos/register.ts) — ดูโน้ตสำหรับตารางเต็ม */
const CALL_SITES: Record<string, number> = {
  "src/lib/actions/booking.ts": 1, // setStatusAction DONE · systemForUnit
  "src/lib/actions/pos.ts": 1, // registerSaleAction (จอเดิม) · systemId จาก client + posUnitIsLinked
  "src/lib/ai/proposals.ts": 1, // pos_create_sale · POS ตัวแรกของร้าน (O3/O21)
  "src/lib/modules/booking/service.ts": 1, // recordDeposit · systemForUnit
  "src/lib/modules/clinic/service.ts": 1, // billVisit · POS ตัวแรกของร้าน (O21)
  "src/lib/modules/giftcard/service.ts": 2, // sell/reload · resolvePosForMember · tx ของผู้เรียก
  "src/lib/modules/hotel/service.ts": 2, // checkOut/recordDeposit · systemForUnit
  "src/lib/modules/member/subscription.ts": 1, // subscribe · resolvePosForMember
  "src/lib/modules/pos/api/ops/sales.ts": 1, // REST/AI op sales.create · posUnitIsLinked
  "src/lib/modules/pos/register.ts": 1, // หน้าขายใหม่ P1.3 · regScope · P1.7: จุดเดียวใน regCreateSale มี 2 โหมด (tx ของตัวเอง = ทาง P1.6 · tx ของผู้เรียก = ใบขอรับเงิน pi_ → ตัดสต็อกหลัง commit + scheduleDrain ทำซ้ำที่ผู้เรียก regSubmitWithIntents)
  "src/lib/modules/rental/service.ts": 2, // returnAsset (POS ตัวแรก · O21) / recordRentalDeposit (systemForUnit)
  "src/lib/modules/restaurant/order.ts": 1, // checkout · systemForUnit · คีย์ rest-<hash> (I6)
  "src/lib/modules/school/service.ts": 1, // markPaid · POS ตัวแรกของร้าน (O21)
  "src/lib/modules/shop/service.ts": 1, // confirmOrderPaid · POS ตัวแรกของร้าน (O21)
  "src/lib/modules/ticket/service.ts": 1, // markPaid · systemForUnit
};

const NEW_REFUSAL_KEYS: [string, string][] = [
  ["UNIT_SYSTEM_MISMATCH", "errors.unitSystemMismatch"],
  ["SPLIT_INVALID", "errors.splitInvalid"],
  ["STOCK_INSUFFICIENT", "errors.stockInsufficient"],
  ["TIP_ACCOUNT_REQUIRED", "errors.tipAccountRequired"],
];

function runPure() {
  console.log("\n── V/U/R ข้อที่ไม่แตะ DB ──");
  // V1 สูตรเดียว 10k สุ่ม (seed คงที่ · mulberry32)
  let s = 0x16160616;
  const rnd = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const RATES = [0, 100, 300, 500, 700, 900, 1000, 1500]; // ไม่มีอัตราใดในชุดนี้มีค่ากึ่งกลางพอดี (เศษ .5) ⇒ ทศนิยมลอยตัวไม่ทำให้ผลต่าง
  const grosses: number[] = [];
  for (let g = 0; g <= 2000; g++) grosses.push(g);
  for (let i = 0; i < 10000; i++) grosses.push(Math.floor(Math.pow(10, rnd() * 9))); // 1 … 10^9 สตางค์ กระจายแบบ log
  let n1 = 0;
  const bad1: string[] = [];
  let pcBad = 0;
  for (const g of grosses) {
    for (const r of g <= 2000 ? RATES : [700, RATES[Math.floor(rnd() * RATES.length)]]) {
      n1++;
      const h = callSync(vatMod, "splitIncludedVat", g, r);
      const exp = bridgeVat(g, r);
      const ok = h && h.ok !== false && Number.isInteger(h.vatSatang) && Number.isInteger(h.baseSatang) && h.vatSatang === exp && h.baseSatang + h.vatSatang === g;
      if (!ok && bad1.length < 4) bad1.push(`g${g}@${r}:${short(h, 60)}≠vat ${exp}`);
      if (!ok) n1 = -Infinity;
    }
    if (g < 1_000_000_000) {
      const pc = callSync(pricing, "priceCart", { lines: [{ qty: 1, unitPriceSatang: g }], vat: { mode: "INCLUDED", rateBp: 700 } });
      if (!(pc?.ok === true && pc.vatSatang === bridgeVat(g, 700))) pcBad++;
    }
  }
  chk("P1.6-V1", n1 > 0 && bad1.length === 0 && pcBad === 0, `${grosses.length} ยอด ≥ 2 อัตราต่อยอด เท่าสูตรสะพานทุกตัว · priceCart 700 ตรง`,
    bad1.length ? `ต่าง: ${bad1.join(" · ")}` : `ตรวจ ${Number.isFinite(n1) ? n1 : "?"} คู่ · priceCart ต่าง ${pcBad}`);

  // V2 ผู้ใช้สูตรเดียว (static)
  const acc = stripComments(rd("src/lib/modules/account/index.ts"));
  const vatSrc = stripComments(rd(VAT_FILE));
  const p2: string[] = [];
  if (!/splitIncludedVat/.test(acc)) p2.push("account/index.ts ไม่เรียก splitIncludedVat");
  if (!/from\s+["']@\/lib\/money\/vat["']/.test(acc)) p2.push("account/index.ts ไม่ import @/lib/money/vat");
  if (/Math\.round\(\s*gross\s*\/\s*\(\s*1\s*\+/.test(acc)) p2.push("account/index.ts ยังมีสูตรถอด VAT เขียนเอง");
  if (/const\s+vat\s*=\s*0\b/.test(svcSrc)) p2.push("service.ts ยังมี const vat = 0");
  if (!/splitIncludedVat/.test(svcSrc)) p2.push("service.ts ไม่เรียก splitIncludedVat");
  if (!vatSrc) p2.push(`${VAT_FILE} ไม่มี`);
  else if (/from\s+["'](@prisma|@\/lib\/core|next\/|server-only)/.test(vatSrc) || /\bprisma\b/.test(vatSrc)) p2.push("vat.ts import ของเซิร์ฟเวอร์/prisma");
  chk("P1.6-V2", p2.length === 0, "สะพาน + createSale ใช้ helper เดียว · helper บริสุทธิ์", p2.join(" · ") || "ครบ");

  // U4 ลำดับการ์ดใน service.ts + ทะเบียนผู้เรียก
  const iGuard = svcSrc.indexOf("UNIT_SYSTEM_MISMATCH");
  const iCounter = svcSrc.indexOf("posReceiptCounter.upsert");
  const found: Record<string, number> = {};
  for (const f of walk("src")) {
    if (f.endsWith("src/lib/modules/pos/service.ts") || f.endsWith("src/lib/contracts.ts")) continue;
    const n = (stripComments(rd(f)).match(/\bcreateSale\s*\(/g) ?? []).length;
    if (n) found[f] = n;
  }
  const diff = [...new Set([...Object.keys(CALL_SITES), ...Object.keys(found)])].filter((f) => CALL_SITES[f] !== found[f]).map((f) => `${f.replace("src/lib/", "")}:${CALL_SITES[f] ?? 0}→${found[f] ?? 0}`);
  const total4 = Object.values(found).reduce((a, b) => a + b, 0);
  chk("P1.6-U4", iGuard >= 0 && iCounter >= 0 && diff.length === 0, "มีการ์ด · 18 จุด/15 ไฟล์ตรงทะเบียน",
    `การ์ด@${iGuard} ตัวนับ@${iCounter} · ผู้เรียก ${total4} จุด/${Object.keys(found).length} ไฟล์${diff.length ? ` · ต่าง: ${diff.join(", ")}` : ""}`);

  // R2 ไฟล์ action ของ POS ทั้งหมด
  const actFiles = walk("src/lib/modules/pos").filter((f) => /actions?\.tsx?$/.test(f) || /-actions\.tsx?$/.test(f));
  const p22: string[] = [];
  let hasSettingsAction = false;
  for (const f of actFiles) {
    const raw = rd(f);
    const code = stripComments(raw);
    if (!/^\s*["']use server["']/.test(raw.replace(/^\s*(\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*/, ""))) p22.push(`${f}: ไม่มี "use server" บรรทัดแรก`);
    const exps = [...code.matchAll(/^\s*export\b[^\n]*/gm)].map((m) => m[0].trim());
    const nonFn = exps.filter((x) => !/^export\s+async\s+function\s+\w+/.test(x));
    if (nonFn.length) p22.push(`${f}: export ไม่ใช่ async function (${nonFn.slice(0, 2).join(" | ")})`);
    if (/\bthrow\b/.test(code)) p22.push(`${f}: มี throw`);
    const names = exps.map((x) => /^export\s+async\s+function\s+(\w+)/.exec(x)?.[1]).filter((x): x is string => !!x);
    if (names.includes("updatePosPaymentSettingsAction")) hasSettingsAction = true;
    // แต่ละ action ต้องมี catch ในตัวของมัน (ตัดช่วงจาก export หนึ่งถึง export ถัดไป)
    const idx = names.map((n) => code.indexOf(`function ${n}`));
    names.forEach((n, i) => {
      const body = code.slice(idx[i], i + 1 < idx.length ? idx[i + 1] : undefined);
      if (!/\bcatch\b/.test(body)) p22.push(`${f}#${n}: ไม่มี catch`);
    });
  }
  if (!hasSettingsAction) p22.push("ไม่มี updatePosPaymentSettingsAction ใน src/lib/modules/pos/*actions*.ts");
  chk("P1.6-R2", actFiles.length > 0 && p22.length === 0, "ทุกไฟล์ action: use server · async fn ล้วน · ไม่ throw · มี catch · มี action ตั้งค่าชำระเงิน", p22.join(" · ") || `${actFiles.length} ไฟล์ ผ่าน`);

  // R3 คีย์ข้อความของรหัสใหม่
  const th = posMessages("th");
  const en = posMessages("en");
  const thai = /[฀-๿]/;
  const p3: string[] = [];
  for (const [code, want] of NEW_REFUSAL_KEYS) {
    const got = callSync(regShared, "refusalMessageKey", code);
    if (got !== want) p3.push(`${code}→${short(got, 40)}`);
    const k = `pos.register.${want}`;
    const t = th.get(k);
    const e = en.get(k);
    if (typeof t !== "string" || !t.trim()) p3.push(`${k}: th ขาด`);
    if (typeof e !== "string" || !e.trim()) p3.push(`${k}: en ขาด`);
    else if (thai.test(e)) p3.push(`${k}: en มีอักษรไทย`);
  }
  const tUsm = th.get("pos.register.errors.unitSystemMismatch");
  if (typeof tUsm === "string" && !tUsm.includes("เลือกจุดขาย")) p3.push("th unitSystemMismatch ไม่มี 'เลือกจุดขาย' (O21)");
  chk("P1.6-R3", p3.length === 0, "4 รหัส → คีย์เฉพาะ · th+en ครบ · ข้อความ O21", p3.join(" · ") || "ครบ");
}

// ═════════════════════════ 5. ข้อที่ต้องมี DB (sandbox) ═════════════════════════
const DB_IDS = CHECKS.map(([id]) => id).filter((id) => !["P1.6-V1", "P1.6-V2", "P1.6-U4", "P1.6-R2", "P1.6-R3", "P1.6-Z1", "P1.6-Z2"].includes(id));
const sb = {
  unitIds: [] as string[], restoUnitIds: [] as string[], systemIds: [] as string[], accSystemIds: [] as string[], posLinkedIds: [] as string[],
  productIds: [] as string[], invItemIds: [] as string[], invSysIds: [] as string[], restoUnitR: "",
};
const lanes: Any[] = [];
let realCounters: Any[] = [];
let realCountersTaken = false;

async function lane(i: number): Promise<Any> {
  if (lanes[i]) return lanes[i];
  const { PrismaClient } = (await import("@prisma/client")) as Any;
  const { PrismaPg } = (await import("@prisma/adapter-pg")) as Any;
  while (lanes.length <= i) lanes.push(new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL, max: 2 }) }));
  return lanes[i];
}

/** ย้อน tx ของข้อสอบเมื่อผลไม่ ok (กันแถวครึ่ง ๆ กลาง ๆ ถูก commit) */
class Rollback {
  constructor(public r: Any) {}
}
/**
 * รันใน tx ของข้อสอบ แล้วลบ event pos.sale.paid ของบิลก่อน commit ⇒ ตัวระบายคิวไม่เคยเห็น event (ไม่มีการลงบัญชีสมุด sandbox ที่จด VAT)
 * — createSale ที่ถูกเรียกใน tx ผู้อื่นไม่ระบายคิวและไม่ตัดสต็อกหลัง commit อยู่แล้ว (service.ts ownsTx) · ผลไม่ ok = ย้อนทั้ง tx
 */
async function quietTx(fn: (tx: Any) => Promise<Any>): Promise<Any> {
  try {
    return await P.$transaction(
      async (tx: Any) => {
        const r = await fn(tx);
        if (!r || r.ok !== true) throw new Rollback(r);
        if (r.saleId) await tx.outboxEvent.deleteMany({ where: { tenantId: { in: TIDS }, idempotencyKey: { in: [`PosSale#${r.saleId}#PAID`] } } });
        return r;
      },
      { timeout: 30000, maxWait: 10000 },
    );
  } catch (e) {
    if (e instanceof Rollback) return e.r;
    return { ok: false, code: errCode(e), message: String((e as Error)?.message ?? e).slice(0, 200), threw: true };
  }
}
/** createSale แบบไม่ crash: {ok:true, …ผล} | {ok:false, code, message, threw:true} */
async function callSale(input: Any, client?: Any): Promise<Any> {
  const fn = service?.createSale;
  if (typeof fn !== "function") return { ok: false, code: "MISSING:createSale" };
  try {
    const r = await (client ? fn(input, client) : fn(input));
    return { ok: true, ...r };
  } catch (e) {
    return { ok: false, code: errCode(e), message: String((e as Error)?.message ?? e).slice(0, 200), threw: true };
  }
}

async function runDb() {
  if (!scope) {
    for (const id of DB_IDS) chk(id, false, "seed ร้าน QC POS", "ยังไม่ได้ seed (scripts/seed-pos-qc.mts) — ข้อ DB ตรวจไม่ได้");
    return;
  }
  const tid: string = scope.tenantId;
  const restoTid: string = PQC.resto.tenantId;
  const restoPos: string = PQC.resto.systems.POS.id;
  const mOwner = await P.membership.findFirst({ where: { tenantId: tid, userId: PQC.coffee.users.owner.userId } });
  const mCash = await P.membership.findFirst({ where: { tenantId: tid, userId: PQC.coffee.users.cashier.userId } });
  const actor = (m: Any, userId: string, over: Partial<Any> = {}) => ({
    userId,
    role: m?.role ?? "STAFF",
    unitAccess: Array.isArray(m?.unitAccess) ? m.unitAccess : [],
    permissions: (m?.permissions ?? {}) as Record<string, unknown>,
    ...over,
  });
  const owner = actor(mOwner, PQC.coffee.users.owner.userId);
  realCounters = await P.posReceiptCounter.findMany({ where: { tenantId: { in: TIDS } } });
  realCountersTaken = true;

  // ─── sandbox (เขียนแถวแรก ⇒ ด่าน host QC4 ก่อน) ───
  assertQc4BeforeWrite();
  console.log(`\n── sandbox ${TAG} (สาขา + ระบบ POS/คลัง/บัญชี ชั่วคราวในร้าน QC กาแฟ) ──`);
  const mkUnit = async (label: string, type = "SHOP", tenantId = tid) => {
    const u = await P.businessUnit.create({ data: { tenantId, type, name: `${TAG} ${label}`, slug: `${TAG}-${label}` } });
    (tenantId === tid ? sb.unitIds : sb.restoUnitIds).push(u.id);
    return u.id as string;
  };
  const mkSys = async (type: string, label: string) => {
    const s = await P.appSystem.create({ data: { tenantId: tid, type, name: `${TAG} ${label}` } });
    sb.systemIds.push(s.id);
    if (type === "ACCOUNT") sb.accSystemIds.push(s.id);
    if (type === "INVENTORY") sb.invSysIds.push(s.id);
    return s.id as string;
  };
  let fx = "";
  let uS = "", uV = "", uN = "", uX = "", uR = "", uRT = "", posS = "", invS = "", posV = "", accV = "", posN = "", accN = "", linkV = "";
  try {
    uS = await mkUnit("s"); // สาขาขายหลัก (POS ไม่ผูกบัญชี + คลัง)
    uV = await mkUnit("v"); // POS ที่ผูกสมุดจด VAT 7%
    uN = await mkUnit("n"); // POS ที่ผูกสมุดไม่จด VAT
    uX = await mkUnit("x"); // ไม่ผูก POS ใดเลย (U2)
    uR = await mkUnit("r", "RESTAURANT"); // ร้านอาหาร sandbox ผูก posS (I6)
    posS = await mkSys("POS", "POS-S");
    invS = await mkSys("INVENTORY", "INV-S");
    posV = await mkSys("POS", "POS-V");
    accV = await mkSys("ACCOUNT", "ACC-V");
    posN = await mkSys("POS", "POS-N");
    accN = await mkSys("ACCOUNT", "ACC-N");
    await sysSvc.linkUnit(tid, posS, uS);
    await sysSvc.linkUnit(tid, invS, uS);
    await sysSvc.linkUnit(tid, posS, uR);
    await sysSvc.linkUnit(tid, posV, uV);
    await sysSvc.linkUnit(tid, posN, uN);
    await P.accountSettings.create({ data: { tenantId: tid, systemId: accV, vatRegistered: true, vatRateBp: 700 } });
    await P.accountSettings.create({ data: { tenantId: tid, systemId: accN, vatRegistered: false, vatRateBp: 700 } });
    sb.posLinkedIds.push(posV, posN);
    linkV = (await P.accountSystemLink.create({ data: { tenantId: tid, systemId: accV, linkedKind: "POS", linkedId: posV } })).id;
    await P.accountSystemLink.create({ data: { tenantId: tid, systemId: accN, linkedKind: "POS", linkedId: posN } });
    // U3: สาขาชั่วคราวในร้าน QC อาหาร (POS ตัวเดียว) — ไม่ผูก POS
    uRT = await mkUnit("rt", "SHOP", restoTid);
  } catch (e) {
    fx = `sandbox:${(e as Error).message.slice(0, 120)}`;
    console.log(`  ⚠️  ${fx}`);
  }
  const ctxS = { tenantId: tid, systemId: posS, unitId: uS };
  const ctxV = { tenantId: tid, systemId: posV, unitId: uV };
  const SYSTEM_ACTOR: unknown = catalog?.CATALOG_SYSTEM_ACTOR ?? owner.userId;
  const cctx = { tenantId: tid, systemId: posS, actorUserId: SYSTEM_ACTOR };
  const invCtx = { tenantId: tid, systemId: invS };
  const idOf = (r: Any): string | null => (typeof r === "string" ? r : r?.ok === false ? null : (r?.id ?? r?.product?.id ?? null));
  const must = (label: string, r: Any): Any => {
    if (r?.ok === false) throw Object.assign(new Error(`${label} ล้ม: ${short(r)}`), { code: r.code });
    return r;
  };
  const mkFree = async (name: string, priceSatang: number) => {
    const r = must("createProduct", await call(catalog, "createProduct", cctx, { name, kind: "PRODUCT", basePriceSatang: priceSatang }));
    const id = idOf(r);
    if (!id) throw new Error(`createProduct ไม่คืน id: ${short(r)}`);
    sb.productIds.push(id);
    return { id, invItemId: null as string | null };
  };
  /** สินค้านับสต็อก: InvItem (คลัง sandbox) + รับเข้า stock + PosProduct ผ่าน catalog.ensureForInvItem + ราคา */
  const mkTracked = async (sku: string, name: string, priceSatang: number, stock: number) => {
    const cost = Math.floor(priceSatang / 3);
    const it = await inventory.createItem(invCtx, { sku: `${TAG}-${sku}`, name, costSatang: cost });
    sb.invItemIds.push(it.id);
    if (stock > 0) await inventory.receive(invCtx, { itemId: it.id, qty: stock, costSatang: cost, idempotencyKey: `${TAG}-recv-${sku}` });
    const r = must("ensureForInvItem", await call(catalog, "ensureForInvItem", cctx, it.id));
    const id = idOf(r);
    if (!id) throw new Error(`ensureForInvItem ไม่คืน id: ${short(r)}`);
    sb.productIds.push(id);
    must("setPrice", await call(catalog, "setPrice", cctx, id, priceSatang));
    return { id, invItemId: it.id as string };
  };
  let A: Any = null;
  try {
    if (!fx) A = await mkFree("กาแฟทดสอบ P1.6", 6500);
  } catch (e) {
    fx ||= `product:${(e as Error).message.slice(0, 100)}`;
  }
  const FX = (s: string) => (fx ? `fixture:${fx} · ` : "") + s;

  let keyN = 0;
  const key = (label: string) => `${KTAG}-${label}-${++keyN}`.replace(/[^A-Za-z0-9_-]/g, "_");
  const saleByKey = async (k: string, t = tid) => P.posSale.findFirst({ where: { tenantId: t, idempotencyKey: keyIn(k) }, include: { lines: { orderBy: { id: "asc" } }, payments: { orderBy: { id: "asc" } } } });
  const salesByKey = async (k: string, t = tid) => P.posSale.count({ where: { tenantId: t, idempotencyKey: keyIn(k) } });
  const counterSeq = async (unitId: string) => ((await P.posReceiptCounter.findMany({ where: { unitId }, select: { seq: true } })) as Any[]).reduce((t, r) => t + Number(r.seq), 0);
  const onHandOf = async (id: string) => Number((await P.invItem.findUnique({ where: { id }, select: { onHand: true } }))?.onHand ?? NaN);
  const outCount = async (itemId: string) => P.invMovement.count({ where: { tenantId: tid, itemId, type: "OUT" } });
  /** expected = Σจ่าย − ทิป · cashReceived = ส่วนเงินสด (เมื่อข้อสอบไม่ระบุ) — ไม่แก้ object ของผู้เรียก */
  const withDefaults = (input: Any): Any => {
    if (!input || typeof input !== "object") return input;
    const pm = (Array.isArray(input.payMethods) ? input.payMethods : []) as Any[];
    const sum = pm.reduce((t: number, p: Any) => t + (Number(p?.amountSatang) || 0), 0);
    const cash = pm.filter((p) => p?.type === "CASH").reduce((t: number, p: Any) => t + (Number(p?.amountSatang) || 0), 0);
    const tip = Number.isInteger(input.tipSatang) ? input.tipSatang : 0;
    return {
      ...input,
      ...("expectedGrandTotalSatang" in input ? {} : { expectedGrandTotalSatang: sum - tip }),
      ...("cashReceivedSatang" in input || cash === 0 ? {} : { cashReceivedSatang: cash }),
    };
  };
  const subRaw = (a: Any, input: Any, c: Any = ctxS, cl?: Any) => call(register, "submitRegisterSale", c, a, input, cl);
  const sub = (a: Any, input: Any, c: Any = ctxS, cl?: Any) => subRaw(a, withDefaults(input), c, cl);
  const quote = (a: Any, input: Any, c: Any = ctxS) => call(register, "quoteRegisterCart", c, a, input);
  const pay = (amt: number) => [{ type: "CASH", amountSatang: amt }];
  /** เงินรับ/ทอนของแถว CASH (มติ §8 ข้อ 2) · ไม่มีแถว CASH = null */
  const tenderOf = (sale: Any): { t: unknown; c: unknown } | null => {
    if (!TENDER_READY) return { t: "ไม่มีคอลัมน์", c: "ไม่มีคอลัมน์" };
    const cp = ((sale?.payments ?? []) as Any[]).find((p) => p.type === "CASH");
    return cp ? { t: cp.tenderedSatang, c: cp.changeSatang } : null;
  };
  const refOf = (p: Any) => (hasField("PosPayment", "reference") ? p?.reference : p?.note);
  const zeroish = (v: unknown) => v === 0 || v === null || v === undefined;
  /** คำปฏิเสธที่ต้องเป็น "ข้อมูล" (R1) — เก็บระหว่างทาง ตัดสินท้ายสุด */
  const dataRefusals: [string, Any, string][] = [];
  const asData = (label: string, r: Any, code: string) => dataRefusals.push([label, r, code]);
  const legacy = (over: Any = {}) => ({
    tenantId: tid, unitId: uS, systemId: posS, sourceModule: "HOTEL", idempotencyKey: key("legacy"),
    lines: [{ name: "ค่าห้องทดสอบ", qty: 1, unitPriceSatang: 4000 }, { name: "มินิบาร์ทดสอบ", qty: 2, unitPriceSatang: 1250 }],
    payMethods: [{ type: "CASH", amountSatang: 6500 }],
    ...over,
  });

  // ════════ V VAT ════════
  console.log("\n── V VAT เก็บลงบิล ──");
  const vIn = (k: string, lines: Any[], total: number, over: Any = {}) => ({
    tenantId: tid, unitId: uV, systemId: posV, sourceModule: "POS", idempotencyKey: k,
    lines, payMethods: total > 0 ? [{ type: "PROMPTPAY", amountSatang: total }] : [], ...over,
  });
  const v3cases: [string, Any[], number, number][] = [
    ["0", [{ name: "น้ำเปล่าฟรี", qty: 1, unitPriceSatang: 0 }], 0, 0],
    ["1", [{ name: "ลูกอม", qty: 1, unitPriceSatang: 1 }], 0, 1],
    ["15", [{ name: "ลูกอม", qty: 3, unitPriceSatang: 5 }], 0, 15],
    ["6500", [{ name: "กาแฟ", qty: 1, unitPriceSatang: 6500 }], 0, 6500],
    ["10700", [{ name: "เค้ก", qty: 2, unitPriceSatang: 5350 }], 0, 10700],
    ["6500-500", [{ name: "กาแฟ", qty: 1, unitPriceSatang: 6500 }], 500, 6000],
  ];
  const r3: string[] = [];
  let ok3 = !fx;
  for (const [label, lines, disc, total] of v3cases) {
    const k = key(`vat-${label}`);
    const r = await quietTx((tx) => callSale(vIn(k, lines, total, disc ? { billDiscountSatang: disc } : {}), tx));
    const s = await saleByKey(k);
    const want = bridgeVat(total, 700);
    r3.push(`${label}:${codeOf(r)} g${s?.grandTotalSatang} vat ${s?.vatSatang}/${want}`);
    if (!(r?.ok === true && s?.grandTotalSatang === total && s?.vatSatang === want)) ok3 = false;
  }
  chk("P1.6-V3", ok3, "ทุกยอด vat = splitIncludedVat(grand,700) · grand ไม่เปลี่ยน", FX(r3.join(" · ")));
  // V4
  const kU = key("vat-unlinked");
  const rU = await callSale({ tenantId: tid, unitId: uS, systemId: posS, sourceModule: "POS", idempotencyKey: kU, lines: [{ name: "กาแฟ", qty: 1, unitPriceSatang: 10700 }], payMethods: [{ type: "PROMPTPAY", amountSatang: 10700 }] });
  const kN = key("vat-notreg");
  const rN = await quietTx((tx) => callSale({ tenantId: tid, unitId: uN, systemId: posN, sourceModule: "POS", idempotencyKey: kN, lines: [{ name: "กาแฟ", qty: 1, unitPriceSatang: 10700 }], payMethods: [{ type: "PROMPTPAY", amountSatang: 10700 }] }, tx));
  let rD: Any = { ok: false, code: "FIXTURE" };
  const kD = key("vat-disabled");
  try {
    if (linkV) await P.accountSystemLink.update({ where: { id: linkV }, data: { enabled: false } });
    rD = await quietTx((tx) => callSale(vIn(kD, [{ name: "กาแฟ", qty: 1, unitPriceSatang: 10700 }], 10700), tx));
  } finally {
    if (linkV) await P.accountSystemLink.update({ where: { id: linkV }, data: { enabled: true } }).catch(() => {});
  }
  const sU = await saleByKey(kU), sN = await saleByKey(kN), sD = await saleByKey(kD);
  chk("P1.6-V4", rU?.ok === true && rN?.ok === true && rD?.ok === true && sU?.vatSatang === 0 && sN?.vatSatang === 0 && sD?.vatSatang === 0 && sU?.grandTotalSatang === 10700,
    "ไม่ผูก / ไม่จด / ปิดการเชื่อม → vat 0", FX(`unlinked ${codeOf(rU)} vat ${sU?.vatSatang} · notreg ${codeOf(rN)} vat ${sN?.vatSatang} · disabled ${codeOf(rD)} vat ${sD?.vatSatang}`));
  // V5 หน้าขายบน POS VAT
  const cart5 = { lines: [{ name: "เมนูทดสอบ VAT", qty: 1, unitPriceSatang: 6500 }, { name: "ขนมทดสอบ VAT", qty: 1, unitPriceSatang: 3500 }] };
  const q5 = await quote(owner, cart5, ctxV);
  const k5 = key("vat-reg");
  const s5 = q5?.ok ? await quietTx((tx) => sub(owner, { idempotencyKey: k5, ...cart5, payMethods: [{ type: "PROMPTPAY", amountSatang: q5.grandTotalSatang }] }, ctxV, tx)) : q5;
  const sale5 = await saleByKey(k5);
  chk("P1.6-V5", q5?.ok === true && q5.vatMode === "INCLUDED" && q5.vatRateBp === 700 && s5?.ok === true && sale5?.grandTotalSatang === q5.grandTotalSatang && sale5?.vatSatang === q5.vatSatang && sale5?.vatSatang === bridgeVat(q5.grandTotalSatang, 700),
    "INCLUDED 700 · vat บิล = vat quote = helper", FX(`quote ${codeOf(q5)} ${q5?.vatMode}/${q5?.vatRateBp} g${q5?.grandTotalSatang} vat ${q5?.vatSatang} · submit ${codeOf(s5)} · บิล g${sale5?.grandTotalSatang} vat ${sale5?.vatSatang}`));

  // ════════ T แบ่งจ่าย ════════
  console.log("\n── T แบ่งจ่าย ──");
  const tA = 6500;
  const LA = () => [{ productId: A?.id ?? "-", qty: 1 }];
  const kT1a = key("zero-legacy");
  const t1a = await callSale(legacy({ idempotencyKey: kT1a, lines: [{ name: "ของแถมทดสอบ", qty: 1, unitPriceSatang: 0 }], payMethods: [] }));
  const kT1b = key("zero-reg");
  const t1b = await sub(owner, { idempotencyKey: kT1b, lines: [{ name: "ของแถมหน้าร้าน", qty: 1, unitPriceSatang: 0 }], payMethods: [] });
  const st1a = await saleByKey(kT1a), st1b = await saleByKey(kT1b);
  chk("P1.6-T1", t1a?.ok === true && t1b?.ok === true && st1a?.grandTotalSatang === 0 && st1b?.grandTotalSatang === 0 && st1a?.payments.length === 0 && st1b?.payments.length === 0 && st1a?.vatSatang === 0 && st1b?.vatSatang === 0,
    "ทั้งสองทาง PAID ยอด 0 · 0 แถวจ่าย · vat 0", FX(`legacy ${codeOf(t1a)} g${st1a?.grandTotalSatang} p${st1a?.payments.length} · reg ${codeOf(t1b)} g${st1b?.grandTotalSatang} p${st1b?.payments.length}`));
  const pm2 = [{ type: "CASH", amountSatang: 1 }, { type: "PROMPTPAY", amountSatang: 1 }, { type: "TRANSFER", amountSatang: 1 }, { type: "CARD", amountSatang: tA - 3, reference: "EDC-123456" }];
  const kT2 = key("split-1sat");
  const t2 = await sub(owner, { idempotencyKey: kT2, lines: LA(), payMethods: pm2, cashReceivedSatang: 1 });
  const st2 = await saleByKey(kT2);
  const bag = (xs: Any[]) => xs.map((p) => `${p.type}:${p.amountSatang}`).sort().join(",");
  chk("P1.6-T2", t2?.ok === true && !!st2 && bag(st2.payments) === bag(pm2) && (st2.payments as Any[]).reduce((t, p) => t + p.amountSatang, 0) === st2.grandTotalSatang && st2.grandTotalSatang === tA,
    `4 แถว ${bag(pm2)}`, FX(`${codeOf(t2)} · ${st2 ? bag(st2.payments) : "ไม่มีบิล"}`));
  const pm10 = [
    { type: "CASH", amountSatang: 1 }, { type: "PROMPTPAY", amountSatang: 1 }, { type: "PROMPTPAY", amountSatang: 1 }, { type: "TRANSFER", amountSatang: 1 },
    { type: "TRANSFER", amountSatang: 1 }, { type: "CARD", amountSatang: 1, reference: "EDC-A" }, { type: "CARD", amountSatang: 1, reference: "EDC-B" },
    { type: "PROMPTPAY", amountSatang: 1 }, { type: "TRANSFER", amountSatang: 1 }, { type: "CARD", amountSatang: tA - 9, reference: "EDC-C" },
  ];
  const kT3a = key("split-10");
  const t3a = await sub(owner, { idempotencyKey: kT3a, lines: LA(), payMethods: pm10, cashReceivedSatang: 1 });
  const pm11 = [...pm10.slice(0, 9), { type: "PROMPTPAY", amountSatang: 1 }, { type: "CARD", amountSatang: tA - 10, reference: "EDC-D" }];
  const kT3b = key("split-11");
  const t3b = await sub(owner, { idempotencyKey: kT3b, lines: LA(), payMethods: pm11, cashReceivedSatang: 1 });
  asData("T3 11 รายการ", t3b, "SPLIT_INVALID");
  const st3a = await saleByKey(kT3a);
  chk("P1.6-T3", t3a?.ok === true && st3a?.payments.length === 10 && bag(st3a.payments) === bag(pm10) && refused(t3b, ["SPLIT_INVALID"]) && !(await saleByKey(kT3b)),
    "10 → PAID 10 แถว · 11 → SPLIT_INVALID ไม่มีบิล", FX(`10:${codeOf(t3a)} แถว ${st3a?.payments.length} · 11:${codeOf(t3b)}`));
  const bad4: [string, Any[], string][] = [
    ["ขาด1", [{ type: "PROMPTPAY", amountSatang: 4000 }, { type: "CARD", amountSatang: tA - 4001 }], "PAYMENT_MISMATCH"],
    ["เกิน1", [{ type: "PROMPTPAY", amountSatang: 4000 }, { type: "CARD", amountSatang: tA - 3999 }], "PAYMENT_MISMATCH"],
    ["ศูนย์", [{ type: "PROMPTPAY", amountSatang: 0 }, { type: "CARD", amountSatang: tA }], "VALIDATION"],
    ["ติดลบ", [{ type: "PROMPTPAY", amountSatang: tA + 100 }, { type: "CARD", amountSatang: -100 }], "VALIDATION"],
    ["เศษ", [{ type: "PROMPTPAY", amountSatang: tA - 0.5 }, { type: "CARD", amountSatang: 0.5 }], "VALIDATION"],
  ];
  const r4: string[] = [];
  let ok4 = !!A;
  for (const [label, pm, want] of bad4) {
    const k = key(`pay4-${label}`);
    const r = await sub(owner, { idempotencyKey: k, lines: LA(), payMethods: pm, expectedGrandTotalSatang: tA });
    const made = !!(await saleByKey(k));
    r4.push(`${label}:${codeOf(r)}${made ? "+บิล" : ""}`);
    if (!refused(r, [want]) || made) ok4 = false;
  }
  chk("P1.6-T4", ok4, "ขาด/เกิน PAYMENT_MISMATCH · 0/ติดลบ/เศษ VALIDATION · ไม่มีบิล", FX(r4.join(" · ")));
  const kT5 = key("card-legacy");
  const t5 = await callSale(legacy({ idempotencyKey: kT5, payMethods: [{ type: "CARD", amountSatang: 6500, reference: "EDC-998877" }] }));
  const st5 = await saleByKey(kT5);
  const card2 = (st2?.payments as Any[] | undefined)?.find((p) => p.type === "CARD");
  chk("P1.6-T5", refOf(card2) === "EDC-123456" && t5?.ok === true && refOf(st5?.payments?.[0]) === "EDC-998877" && st5?.payments?.[0]?.type === "CARD",
    "reference ตรงตัวทั้งสองทาง", FX(`reg ${short(refOf(card2))} · legacy ${codeOf(t5)} ${short(refOf(st5?.payments?.[0]))}`));
  const r6: string[] = [];
  let ok6 = !!A;
  for (const t of ["TRANSFER", "CARD"]) {
    const k = key(`only-${t}`);
    const r = await sub(owner, { idempotencyKey: k, lines: LA(), payMethods: [{ type: t, amountSatang: tA }] });
    const s = await saleByKey(k);
    r6.push(`${t}:${codeOf(r)}`);
    if (!(r?.ok === true && s?.payments?.[0]?.type === t)) ok6 = false;
  }
  for (const t of ["DEPOSIT", "ROOM_CHARGE", "QC_NOT_A_METHOD"]) {
    const k = key(`bad-${t}`);
    const r = await sub(owner, { idempotencyKey: k, lines: LA(), payMethods: [{ type: t, amountSatang: tA }] });
    const made = !!(await saleByKey(k));
    r6.push(`${t}:${codeOf(r)}${made ? "+บิล" : ""}`);
    if (!refused(r, ["VALIDATION"]) || made) ok6 = false;
  }
  chk("P1.6-T6", ok6, "TRANSFER/CARD PAID · DEPOSIT/ROOM_CHARGE/มั่ว VALIDATION", FX(r6.join(" · ")));
  // T7 ปิดวัน (ขอบเขต POS sandbox · วันนี้)
  const sum7 = await call(service, "closeDaySummary", { tenantId: tid, systemId: posS });
  const bills7 = await call(service, "closeDayBills", { tenantId: tid, systemId: posS });
  const cardPaid = (await P.posPayment.findMany({ where: { tenantId: tid, type: "CARD", sale: { systemId: posS, status: "PAID" } }, select: { amountSatang: true } }).catch(() => [])) as Any[];
  const cashPaid = (await P.posPayment.findMany({ where: { tenantId: tid, type: "CASH", sale: { systemId: posS, status: "PAID" } }, select: { amountSatang: true } }).catch(() => [])) as Any[];
  const cardSum = cardPaid.reduce((t, p) => t + p.amountSatang, 0);
  const cashSum = cashPaid.reduce((t, p) => t + p.amountSatang, 0);
  const cardLine = Array.isArray(sum7?.byMethod) ? (sum7.byMethod as Any[]).find((m) => m.type === "CARD") : null;
  const billT5 = Array.isArray(bills7) ? (bills7 as Any[]).find((b) => b.receiptNo && b.receiptNo === st5?.receiptNo) : null;
  chk("P1.6-T7", cardSum > 0 && cardLine?.amountSatang === cardSum && sum7?.cashInDrawerSatang === cashSum && !!billT5 && billT5.methodLabel !== "—",
    `CARD ${cardSum} · ลิ้นชัก ${cashSum} · บิลบัตรมีชื่อวิธีจ่าย`, FX(`byMethod ${short(sum7?.byMethod, 160)} · ลิ้นชัก ${sum7?.cashInDrawerSatang} · label ${short(billT5?.methodLabel)}`));

  // ════════ C เงินสดรับ/ทอน ════════
  console.log("\n── C เงินสดรับ/ทอน ──");
  const kC1 = key("cash-change");
  const c1 = await sub(owner, { idempotencyKey: kC1, lines: LA(), payMethods: [{ type: "CASH", amountSatang: 4000 }, { type: "PROMPTPAY", amountSatang: tA - 4000 }], cashReceivedSatang: 5000 });
  const sc1 = await saleByKey(kC1);
  const kC1p = key("pp-only");
  const c1p = await sub(owner, { idempotencyKey: kC1p, lines: LA(), payMethods: [{ type: "PROMPTPAY", amountSatang: tA }] });
  const sc1p = await saleByKey(kC1p);
  const tc1 = tenderOf(sc1), tc1p = tenderOf(sc1p);
  chk("P1.6-C1", c1?.ok === true && c1.changeSatang === 1000 && tc1?.t === 5000 && tc1?.c === 1000 && c1p?.ok === true && tc1p === null && (sc1?.payments as Any[] | undefined)?.filter((p) => p.type !== "CASH").every((p) => zeroish(p.tenderedSatang) && zeroish(p.changeSatang)),
    "แถว CASH 5000/1000 · แถวอื่นไม่มีเงินรับ/ทอน · พร้อมเพย์ล้วนไม่มีแถว CASH", FX(`${codeOf(c1)} ทอน ${c1?.changeSatang} · DB ${short(tc1)} · pp ${codeOf(c1p)} ${short(tc1p)}`));
  const kC2 = key("cash-legacy");
  const c2 = await callSale(legacy({ idempotencyKey: kC2, payMethods: [{ type: "CASH", amountSatang: 6500, cashTenderedSatang: 10000 }], cashTenderedSatang: 10000 }));
  const sc2 = await saleByKey(kC2);
  const tc2 = tenderOf(sc2);
  chk("P1.6-C2", c2?.ok === true && tc2?.t === 10000 && tc2?.c === 3500, "แถว CASH 10000 / 3500", FX(`${codeOf(c2)} · DB ${short(tc2)}`));
  const seqC3 = await counterSeq(uS);
  const kC3a = key("cash-low-reg");
  const c3a = await sub(owner, { idempotencyKey: kC3a, lines: LA(), payMethods: [{ type: "CASH", amountSatang: 4000 }, { type: "PROMPTPAY", amountSatang: tA - 4000 }], cashReceivedSatang: 3999 });
  asData("C3 เงินรับขาด", c3a, "PAYMENT_MISMATCH");
  const kC3b = key("cash-low-legacy");
  const c3b = await callSale(legacy({ idempotencyKey: kC3b, payMethods: [{ type: "CASH", amountSatang: 6500, cashTenderedSatang: 6499 }], cashTenderedSatang: 6499 }));
  const seqC3b = await counterSeq(uS);
  chk("P1.6-C3", refused(c3a, ["PAYMENT_MISMATCH"]) && refused(c3b, ["PAYMENT_MISMATCH"]) && !(await saleByKey(kC3a)) && !(await saleByKey(kC3b)) && seqC3 === seqC3b,
    "PAYMENT_MISMATCH ×2 · ไม่มีบิล · ตัวนับเท่าเดิม", FX(`reg ${codeOf(c3a)} · legacy ${codeOf(c3b)} · ตัวนับ ${seqC3}→${seqC3b}`));
  const kC4 = key("cash-no-tender");
  const c4 = await callSale(legacy({ idempotencyKey: kC4 }));
  const sc4 = await saleByKey(kC4);
  chk("P1.6-C4", c4?.ok === true && sc4?.status === "PAID" && sc4?.grandTotalSatang === 6500, "PAID ยอด 6500 (ไม่ส่งเงินรับ = ไม่ปฏิเสธ)", FX(`${codeOf(c4)} ${sc4?.status} g${sc4?.grandTotalSatang}`));

  // ════════ K ค่าบริการ / ทิป ════════
  console.log("\n── K ค่าบริการ / ทิป ──");
  const sysCtxV = { tenantId: tid, systemId: posV };
  const setPay = (patch: Any, a: Any = owner) => call(paySet, "updatePosPaymentSettings", sysCtxV, a, patch);
  const readPay = async () => call(paySet, "posPaymentSettings", sysCtxV);
  const custom = (price: number, name = "เมนูทดสอบ") => [{ name, qty: 1, unitPriceSatang: price }];
  // K1 ปิด
  const q1a = await quote(owner, { lines: custom(6500) }, ctxV);
  const k1a = key("sc-off");
  const s1a = q1a?.ok ? await quietTx((tx) => sub(owner, { idempotencyKey: k1a, lines: custom(6500), payMethods: [{ type: "PROMPTPAY", amountSatang: q1a.grandTotalSatang }] }, ctxV, tx)) : q1a;
  const sale1a = await saleByKey(k1a);
  let off1 = await setPay({ serviceCharge: { enabled: false, rateBp: 1000 } });
  if (typeof paySet?.updatePosPaymentSettings !== "function") {
    // ไม่มี API ตั้งค่า (ยังไม่สร้าง) — เขียนค่าที่ปิดอยู่ตรง ๆ ตามที่เก็บที่ตั้งชื่อไว้ เพื่อวัด "ยอดเท่าวันนี้" แยกจาก API
    await P.appSystem.update({ where: { id: posV }, data: { settings: { pos: { serviceCharge: { enabled: false, rateBp: 1000 } } } } }).catch(() => {});
    off1 = { ok: false, code: "MISSING:updatePosPaymentSettings" };
  }
  const q1b = await quote(owner, { lines: custom(6500) }, ctxV);
  const pc1 = callSync(pricing, "priceCart", { lines: [{ qty: 1, unitPriceSatang: 6500 }], vat: { mode: "INCLUDED", rateBp: 700 } });
  const sale1L = sU; // V4: createSale เดิมบน POS ไม่มีตั้งค่า
  chk("P1.6-K1", q1a?.ok === true && q1a.serviceChargeSatang === 0 && q1a.grandTotalSatang === pc1?.grandTotalSatang && s1a?.ok === true && sale1a?.serviceChargeSatang === 0 && sale1a?.tipSatang === 0
      && off1?.ok === true && q1b?.ok === true && q1b.serviceChargeSatang === 0 && q1b.grandTotalSatang === q1a.grandTotalSatang && sale1L?.serviceChargeSatang === 0 && sale1L?.tipSatang === 0,
    "ค่าบริการ 0 · ยอด = priceCart วันนี้ · ปิดแบบมี rate ก็เท่าเดิม · createSale เดิม 0/0",
    FX(`q ${codeOf(q1a)} sc ${q1a?.serviceChargeSatang} g${q1a?.grandTotalSatang}/${pc1?.grandTotalSatang} · บิล ${codeOf(s1a)} sc ${sale1a?.serviceChargeSatang} tip ${sale1a?.tipSatang} · ตั้งปิด ${codeOf(off1)} q ${q1b?.serviceChargeSatang}/${q1b?.grandTotalSatang} · legacy ${sale1L?.serviceChargeSatang}/${sale1L?.tipSatang}`));
  // K2 เปิด 10%
  const on2 = await setPay({ serviceCharge: { enabled: true, rateBp: 1000 } });
  const q2 = await quote(owner, { lines: custom(6500) }, ctxV);
  const k2 = key("sc-on");
  const s2 = await quietTx((tx) => sub(owner, { idempotencyKey: k2, lines: custom(6500), payMethods: [{ type: "PROMPTPAY", amountSatang: 7150 }], expectedGrandTotalSatang: 7150 }, ctxV, tx));
  const sale2 = await saleByKey(k2);
  const k2b = key("sc-short");
  const s2b = await quietTx((tx) => sub(owner, { idempotencyKey: k2b, lines: custom(6500), payMethods: [{ type: "PROMPTPAY", amountSatang: 6500 }], expectedGrandTotalSatang: 7150 }, ctxV, tx));
  chk("P1.6-K2", on2?.ok === true && q2?.ok === true && q2.serviceChargeSatang === 650 && q2.grandTotalSatang === 7150 && q2.vatSatang === bridgeVat(7150, 700)
      && s2?.ok === true && sale2?.serviceChargeSatang === 650 && sale2?.grandTotalSatang === 7150 && sale2?.vatSatang === 468 && bridgeVat(7150, 700) === 468
      && refused(s2b, ["PAYMENT_MISMATCH"]) && !(await saleByKey(k2b)),
    "quote 650/7150 · บิล 650/7150 vat 468 · จ่าย 6500 PAYMENT_MISMATCH",
    FX(`ตั้ง ${codeOf(on2)} · q ${codeOf(q2)} sc ${q2?.serviceChargeSatang} g${q2?.grandTotalSatang} vat ${q2?.vatSatang} · บิล ${codeOf(s2)} ${sale2?.serviceChargeSatang}/${sale2?.grandTotalSatang} vat ${sale2?.vatSatang} · ขาด ${codeOf(s2b)}`));
  // K3 ปัด + ส่วนลด + priceCart
  const q3a = await quote(owner, { lines: custom(3335) }, ctxV);
  const q3b = await quote(owner, { lines: [{ name: "เมนูทดสอบ", qty: 2, unitPriceSatang: 6500 }], billDiscount: { type: "AMOUNT", value: 1000 } }, ctxV);
  const pc3a = callSync(pricing, "priceCart", { lines: [{ qty: 1, unitPriceSatang: 3335 }], vat: { mode: "INCLUDED", rateBp: 700 }, serviceChargeBp: 1000 });
  const pc3b = callSync(pricing, "priceCart", { lines: [{ qty: 2, unitPriceSatang: 6500 }], billDiscount: { type: "AMOUNT", value: 1000 }, vat: { mode: "INCLUDED", rateBp: 700 }, serviceChargeBp: 1000 });
  chk("P1.6-K3", q3a?.serviceChargeSatang === 334 && q3a?.grandTotalSatang === 3669 && rhu(3335 * 1000, 10000) === 334 && q3b?.serviceChargeSatang === 1200 && q3b?.grandTotalSatang === 13200
      && pc3a?.serviceChargeSatang === 334 && pc3a?.grandTotalSatang === 3669 && pc3b?.serviceChargeSatang === 1200 && pc3b?.grandTotalSatang === 13200 && pc3b?.vatSatang === q3b?.vatSatang,
    "334/3669 · 1200/13200 · priceCart = quote", FX(`q ${q3a?.serviceChargeSatang}/${q3a?.grandTotalSatang} · ${q3b?.serviceChargeSatang}/${q3b?.grandTotalSatang} (${codeOf(q3b)}) · pc ${pc3a?.serviceChargeSatang}/${pc3a?.grandTotalSatang} · ${pc3b?.serviceChargeSatang}/${pc3b?.grandTotalSatang}`));
  // K4 เปิดทิป
  // ORACLE-EDIT (controller 4 Oct · P1.6 §9 F5): tip cannot be enabled until P1.6b books the tip to its liability ledger.
  // While TIP_BOOKED=false: K4's valid-ledger case expects TIP_NOT_AVAILABLE (tip stays off); K5 expects tip sales refused (no bill).
  // P1.6b flips TIP_BOOKED to true, which restores the original K4/K5 expectations unchanged.
  const TIP_BOOKED = false;
  // บัญชีพักทิป (หนี้สิน) ในสมุด sandbox: ของสมุด V (ผูก posV) = ถูก · ของสมุด N (ผูก posN) = สมุดอื่น — ลบด้วย systemId ตอนคืนสภาพ
  let ledgerV = "", ledgerN = "", fxK4 = "";
  try {
    if (accV) ledgerV = (await P.accountLedger.create({ data: { tenantId: tid, systemId: accV, code: "2195", name: `${TAG} ทิปรอจ่ายพนักงาน`, type: "LIABILITY" } })).id;
    if (accN) ledgerN = (await P.accountLedger.create({ data: { tenantId: tid, systemId: accN, code: "2195", name: `${TAG} ทิปรอจ่าย (สมุดอื่น)`, type: "LIABILITY" } })).id;
  } catch (e) {
    fxK4 = (e as Error).message.slice(0, 80);
  }
  await setPay({ serviceCharge: { enabled: false } });
  const t4a = await setPay({ tip: { enabled: true } });
  asData("K4 เปิดทิปไม่มีบัญชี", t4a, "TIP_ACCOUNT_REQUIRED");
  const after4a = await readPay();
  const t4w = await setPay({ tip: { enabled: true, ledgerAccountId: ledgerN || "-" } });
  asData("K4 บัญชีสมุดอื่น", t4w, "TIP_ACCOUNT_REQUIRED");
  const after4w = await readPay();
  const t4b = await setPay({ tip: { enabled: true, ledgerAccountId: ledgerV || "-" } });
  const after4b = await readPay();
  chk("P1.6-K4", !fxK4 && !!ledgerV && refused(t4a, ["TIP_ACCOUNT_REQUIRED"]) && after4a?.tip?.enabled === false && refused(t4w, ["TIP_ACCOUNT_REQUIRED"]) && after4w?.tip?.enabled === false
      && (TIP_BOOKED ? (t4b?.ok === true && after4b?.tip?.enabled === true && after4b?.tip?.ledgerAccountId === ledgerV)
                     : (refused(t4b, ["TIP_NOT_AVAILABLE"]) && after4b?.tip?.enabled === false)),
    "ไม่มีบัญชี / สมุดอื่น → TIP_ACCOUNT_REQUIRED ทิปยังปิด · บัญชีสมุดที่ผูก → เปิด",
    FX(`${fxK4 ? `ledger:${fxK4} · ` : ""}${codeOf(t4a)} → ${short(after4a?.tip)} · สมุดอื่น ${codeOf(t4w)} → ${short(after4w?.tip)} · ${codeOf(t4b)} → ${short(after4b?.tip)}`));
  // K9 POS ไม่ผูกสมุด (posS) — เปิดทิปไม่ได้แม้ส่งบัญชีที่มีอยู่จริง
  const sysCtxS = { tenantId: tid, systemId: posS };
  const t9 = await call(paySet, "updatePosPaymentSettings", sysCtxS, owner, { tip: { enabled: true, ledgerAccountId: ledgerV || "-" } });
  asData("K9 POS ไม่ผูกสมุด", t9, "TIP_ACCOUNT_REQUIRED");
  const after9 = await call(paySet, "posPaymentSettings", sysCtxS);
  chk("P1.6-K9", refused(t9, ["TIP_ACCOUNT_REQUIRED"]) && after9?.tip?.enabled === false, "TIP_ACCOUNT_REQUIRED · ทิปยังปิด", FX(`${codeOf(t9)} → ${short(after9?.tip)}`));
  // K5 ทิปเปิด
  const k5a = key("tip-on");
  const s5a = await quietTx((tx) => sub(owner, { idempotencyKey: k5a, lines: custom(6500), tipSatang: 500, payMethods: [{ type: "PROMPTPAY", amountSatang: 7000 }], expectedGrandTotalSatang: 6500 }, ctxV, tx));
  const sale5a = await saleByKey(k5a);
  const k5b = key("tip-short");
  const s5b = await quietTx((tx) => sub(owner, { idempotencyKey: k5b, lines: custom(6500), tipSatang: 500, payMethods: [{ type: "PROMPTPAY", amountSatang: 6500 }], expectedGrandTotalSatang: 6500 }, ctxV, tx));
  const pay5 = ((sale5a?.payments ?? []) as Any[]).reduce((t, p) => t + p.amountSatang, 0);
  chk("P1.6-K5", !TIP_BOOKED ? (refused(s5a, ["VALIDATION"]) && !sale5a && refused(s5b, ["VALIDATION", "PAYMENT_MISMATCH"]) && !(await saleByKey(k5b))) : s5a?.ok === true && sale5a?.tipSatang === 500 && sale5a?.grandTotalSatang === 6500 && sale5a?.vatSatang === 425 && bridgeVat(6500, 700) === 425 && pay5 === 7000 && refused(s5b, ["PAYMENT_MISMATCH"]) && !(await saleByKey(k5b)),
    "tip 500 · grand 6500 · vat 425 · Σจ่าย 7000 · ขาด PAYMENT_MISMATCH", FX(`${codeOf(s5a)} tip ${sale5a?.tipSatang} g${sale5a?.grandTotalSatang} vat ${sale5a?.vatSatang} Σ${pay5} · ${codeOf(s5b)}`));
  // K6 ทิปผิดรูป (เปิดอยู่) แล้วปิดทิป
  const r6k: string[] = [];
  let ok6k = true;
  for (const v of [-1, 1.5, "500"] as unknown[]) {
    const k = key("tip-bad");
    const r = await quietTx((tx) => subRaw(owner, { idempotencyKey: k, lines: custom(6500), tipSatang: v, payMethods: [{ type: "PROMPTPAY", amountSatang: 7000 }], expectedGrandTotalSatang: 6500 }, ctxV, tx));
    r6k.push(`${short(v)}:${codeOf(r)}`);
    if (!refused(r, ["VALIDATION"]) || (await saleByKey(k))) ok6k = false;
  }
  const off6 = await setPay({ tip: { enabled: false } });
  const k6off = key("tip-off");
  const s6off = await quietTx((tx) => sub(owner, { idempotencyKey: k6off, lines: custom(6500), tipSatang: 500, payMethods: [{ type: "PROMPTPAY", amountSatang: 7000 }], expectedGrandTotalSatang: 6500 }, ctxV, tx));
  asData("K6 ทิปตอนปิด", s6off, "VALIDATION");
  chk("P1.6-K6", ok6k && off6?.ok === true && refused(s6off, ["VALIDATION"]) && !(await saleByKey(k6off)), "−1/1.5/\"500\" VALIDATION · ปิดแล้วส่งทิป VALIDATION · ไม่มีบิล",
    FX(`${r6k.join(" ")} · ปิด ${codeOf(off6)} · ส่งทิป ${codeOf(s6off)}`));
  // K7 สิทธิ์ + ค่าผิดรูป
  const before7 = await readPay();
  const cashierV = actor(mCash, PQC.coffee.users.cashier.userId, { role: "STAFF", unitAccess: [uV], permissions: { ...(PQC.cashierPermissions as Record<string, unknown>) } });
  const p7 = await setPay({ serviceCharge: { enabled: true, rateBp: 500 } }, cashierV);
  const v7 = [];
  for (const rate of [1.5, -1, 10001]) v7.push(await setPay({ serviceCharge: { enabled: true, rateBp: rate } }));
  const after7 = await readPay();
  chk("P1.6-K7", refused(p7, ["PERMISSION_DENIED"]) && v7.every((r) => refused(r, ["VALIDATION"])) && before7?.ok !== false && JSON.stringify(before7) === JSON.stringify(after7),
    "STAFF PERMISSION_DENIED · 3 ค่าผิด VALIDATION · ค่าตั้งเท่าเดิม", FX(`staff ${codeOf(p7)} · ${v7.map(codeOf).join(",")} · same ${JSON.stringify(before7) === JSON.stringify(after7)}`));
  // K8 ผู้เรียกเดิมไม่โดนค่าบริการ
  const on8 = await setPay({ serviceCharge: { enabled: true, rateBp: 1000 } });
  const k8 = key("sc-legacy");
  const s8 = await quietTx((tx) => callSale(vIn(k8, [{ name: "อาหารโต๊ะ 5", qty: 1, unitPriceSatang: 6000 }, { name: "Service charge 10%", qty: 1, unitPriceSatang: 600 }], 6600, { sourceModule: "RESTAURANT" }), tx));
  const sale8 = await saleByKey(k8);
  await setPay({ serviceCharge: { enabled: false } });
  chk("P1.6-K8", on8?.ok === true && s8?.ok === true && sale8?.serviceChargeSatang === 0 && sale8?.grandTotalSatang === 6600, "serviceCharge 0 · grand 6600 (ไม่คิดซ้ำ)",
    FX(`ตั้ง ${codeOf(on8)} · ${codeOf(s8)} sc ${sale8?.serviceChargeSatang} g${sale8?.grandTotalSatang}`));

  // ════════ N หมายเหตุ ════════
  console.log("\n── N หมายเหตุ ──");
  const note500 = ("หมายเหตุทดสอบ ไม่ใส่น้ำแข็ง · " + "x".repeat(500)).slice(0, 500);
  const note501 = note500 + "y";
  const kN1 = key("note-500");
  const n1 = await sub(owner, { idempotencyKey: kN1, lines: LA(), payMethods: pay(tA), note: note500 });
  const kN1b = key("note-501");
  const n1b = await sub(owner, { idempotencyKey: kN1b, lines: LA(), payMethods: pay(tA), note: note501 });
  asData("N1 หมายเหตุ 501", n1b, "VALIDATION");
  const kN1c = key("note-legacy");
  const n1c = await callSale(legacy({ idempotencyKey: kN1c, note: note500 }));
  const sn1 = await saleByKey(kN1), sn1c = await saleByKey(kN1c);
  chk("P1.6-N1", n1?.ok === true && sn1?.note === note500 && refused(n1b, ["VALIDATION"]) && !(await saleByKey(kN1b)) && n1c?.ok === true && sn1c?.note === note500,
    "500 ตรงตัว ×2 · 501 VALIDATION", FX(`reg ${codeOf(n1)} len ${String(sn1?.note ?? "").length} · 501 ${codeOf(n1b)} · legacy ${codeOf(n1c)} len ${String(sn1c?.note ?? "").length}`));
  const lnote = "ไม่ใส่น้ำแข็ง · หวานน้อย";
  const kN2 = key("line-note");
  const n2 = await sub(owner, { idempotencyKey: kN2, lines: [{ productId: A?.id ?? "-", qty: 1, note: lnote }], payMethods: pay(tA) });
  const kN2b = key("line-note-501");
  const n2b = await sub(owner, { idempotencyKey: kN2b, lines: [{ productId: A?.id ?? "-", qty: 1, note: note501 }], payMethods: pay(tA) });
  const sn2 = await saleByKey(kN2);
  chk("P1.6-N2", n2?.ok === true && sn2?.lines?.[0]?.note === lnote && refused(n2b, ["VALIDATION"]) && !(await saleByKey(kN2b)), "บรรทัดเก็บ note · 501 VALIDATION",
    FX(`${codeOf(n2)} note ${short(sn2?.lines?.[0]?.note)} · 501 ${codeOf(n2b)}`));

  // ════════ I idempotency ════════
  console.log("\n── I idempotency ──");
  const kI1 = key("idem-legacy");
  const inI1 = legacy({ idempotencyKey: kI1 });
  const i1a = await callSale(inI1);
  const i1b = await callSale(inI1);
  const i1c = await callSale({ ...inI1, lines: [...inI1.lines].reverse() });
  const nI1 = await salesByKey(kI1);
  const sI1 = await saleByKey(kI1);
  chk("P1.6-I1", i1a?.ok === true && i1b?.ok === true && i1c?.ok === true && i1b.saleId === i1a.saleId && i1c.saleId === i1a.saleId && i1b.status === "PAID" && i1c.status === "PAID" && nI1 === 1 && sI1?.payments.length === 1,
    "saleId เดิม · status PAID · 1 บิล · 1 แถวจ่าย", FX(`${codeOf(i1a)}/${codeOf(i1b)}/${codeOf(i1c)} same ${i1b?.saleId === i1a?.saleId}/${i1c?.saleId === i1a?.saleId} status ${i1b?.status}/${i1c?.status} n ${nI1} p ${sI1?.payments.length}`));
  const var2: [string, Any][] = [
    ["qty", { ...inI1, lines: [inI1.lines[0], { ...inI1.lines[1], qty: 3 }], payMethods: [{ type: "CASH", amountSatang: 7750 }] }],
    ["price", { ...inI1, lines: [{ ...inI1.lines[0], unitPriceSatang: 4100 }, inI1.lines[1]], payMethods: [{ type: "CASH", amountSatang: 6600 }] }],
    ["paytype", { ...inI1, payMethods: [{ type: "PROMPTPAY", amountSatang: 6500 }] }],
    ["split", { ...inI1, payMethods: [{ type: "CASH", amountSatang: 3000 }, { type: "PROMPTPAY", amountSatang: 3500 }] }],
  ];
  const r2i: string[] = [];
  let ok2i = i1a?.ok === true;
  for (const [label, input] of var2) {
    const r = await callSale(input);
    r2i.push(`${label}:${codeOf(r)}`);
    if (!refused(r, ["IDEMPOTENCY_CONFLICT"])) ok2i = false;
  }
  const sI2 = await saleByKey(kI1);
  chk("P1.6-I2", ok2i && (await salesByKey(kI1)) === 1 && sI2?.grandTotalSatang === 6500 && sI2?.status === "PAID", "4 แบบ IDEMPOTENCY_CONFLICT · 1 บิล ยอดเดิม", FX(`${r2i.join(" ")} · g${sI2?.grandTotalSatang}`));
  const kI3 = key("idem-voided");
  const inI3 = legacy({ idempotencyKey: kI3 });
  const i3a = await callSale(inI3);
  let v3 = "";
  try {
    if (i3a?.ok) await service.voidSale(tid, uS, i3a.saleId);
    else v3 = "ไม่มีบิลให้ void";
  } catch (e) {
    v3 = (e as Error).message.slice(0, 60);
  }
  const seqI3 = await counterSeq(uS);
  const i3b = await callSale(inI3);
  const seqI3b = await counterSeq(uS);
  const sI3 = await saleByKey(kI3);
  chk("P1.6-I3", i3a?.ok === true && !v3 && i3b?.ok === true && i3b.saleId === i3a.saleId && i3b.status === "VOIDED" && sI3?.status === "VOIDED" && (await salesByKey(kI3)) === 1 && seqI3 === seqI3b,
    "saleId เดิม status VOIDED · ไม่มีบิลใหม่ · ตัวนับเท่าเดิม", FX(`${codeOf(i3a)} void:${v3 || "ok"} · retry ${codeOf(i3b)} same ${i3b?.saleId === i3a?.saleId} status ${i3b?.status} · ตัวนับ ${seqI3}→${seqI3b}`));
  const i4 = await callSale({ ...inI3, payMethods: [{ type: "PROMPTPAY", amountSatang: 6500 }] });
  chk("P1.6-I4", refused(i4, ["IDEMPOTENCY_CONFLICT"]) && (await salesByKey(kI3)) === 1, "IDEMPOTENCY_CONFLICT · 1 บิล", FX(`${codeOf(i4)} · n ${await salesByKey(kI3)}`));
  // I5 หน้าขาย
  const kI5 = key("idem-reg");
  const inI5 = { idempotencyKey: kI5, lines: LA(), payMethods: pay(tA) };
  const i5a = await sub(owner, inI5);
  const i5b = await sub(owner, inI5);
  const i5c = await sub(owner, { ...inI5, lines: [{ productId: A?.id ?? "-", qty: 2 }], payMethods: pay(2 * tA) });
  let v5 = "";
  try {
    if (i5a?.ok) await service.voidSale(tid, uS, i5a.saleId);
  } catch (e) {
    v5 = (e as Error).message.slice(0, 60);
  }
  const i5d = await sub(owner, inI5);
  const i5e = await sub(owner, { ...inI5, payMethods: [{ type: "PROMPTPAY", amountSatang: tA }] });
  const st = (r: Any) => r?.saleStatus ?? r?.status;
  chk("P1.6-I5", i5a?.ok === true && i5b?.ok === true && i5b.duplicated === true && i5b.saleId === i5a.saleId && refused(i5c, ["IDEMPOTENCY_CONFLICT"]) && i5c.saleId === i5a.saleId
      && !v5 && refused(i5d, ["IDEMPOTENCY_CONFLICT"]) && st(i5d) === "VOIDED" && i5d.saleId === i5a.saleId && refused(i5e, ["IDEMPOTENCY_CONFLICT"]) && (await salesByKey(kI5)) === 1,
    "dup · CONFLICT+saleId · VOIDED CONFLICT+status ×2 · 1 บิล", FX(`${codeOf(i5a)} · ${codeOf(i5b)}/dup ${i5b?.duplicated} · ${codeOf(i5c)} · void:${v5 || "ok"} · ${codeOf(i5d)}/${st(i5d)} · ${codeOf(i5e)}/${st(i5e)}`));
  // I6 ร้านอาหาร re-checkout
  let fx6 = "";
  let r6a: Any = null, r6v: Any = null, r6b: Any = null;
  try {
    if (!uR || fx) throw new Error("ไม่มีสาขาร้านอาหาร sandbox");
    const bkk = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
    const zone = await P.restaurantZone.create({ data: { tenantId: tid, unitId: uR, name: `${TAG} โซน` } });
    const table = await P.restaurantTable.create({ data: { tenantId: tid, unitId: uR, zoneId: zone.id, name: `${TAG}-T1` } });
    const station = await P.kdsStation.create({ data: { tenantId: tid, unitId: uR, name: `${TAG} ครัว` } });
    const sess = await P.tableSession.create({ data: { tenantId: tid, unitId: uR, tableId: table.id } });
    const ord = await P.restaurantOrder.create({ data: { tenantId: tid, unitId: uR, type: "DINE_IN", sessionId: sess.id, bizDate: bkk, dailyNo: 1 } });
    await P.restaurantOrderItem.create({ data: { tenantId: tid, unitId: uR, orderId: ord.id, stationId: station.id, nameSnapshot: "ข้าวผัดทดสอบ", unitPrice: 6000, qty: 1, lineTotal: 6000 } });
    r6a = await call(restaurant, "checkout", { tenantId: tid, unitId: uR, sessionId: sess.id, payMethod: "CASH" });
    r6v = await call(restaurant, "voidCheckout", tid, uR, sess.id);
    r6b = await call(restaurant, "checkout", { tenantId: tid, unitId: uR, sessionId: sess.id, payMethod: "CASH" });
  } catch (e) {
    fx6 = (e as Error).message.slice(0, 100);
  }
  const restSales = (await P.posSale.findMany({ where: { tenantId: tid, unitId: uR || "-" }, select: { id: true, status: true } })) as Any[];
  const paid6 = restSales.filter((x) => x.status === "PAID");
  const first6 = restSales.find((x) => x.id === r6a?.saleId);
  chk("P1.6-I6", !fx6 && r6a?.ok === true && r6v?.ok === true && r6b?.ok === true && r6b.saleId !== r6a.saleId && paid6.length === 1 && paid6[0].id === r6b.saleId && first6?.status === "VOIDED",
    "ครั้งแรก PAID → void → re-checkout ok บิลใหม่ PAID · PAID 1 บิล · บิลเดิม VOIDED",
    `${fx6 ? `fixture:${fx6} · ` : ""}1:${codeOf(r6a)} void:${codeOf(r6v)} 2:${codeOf(r6b)} ใหม่ ${r6b?.saleId !== r6a?.saleId} · บิล ${restSales.map((x) => x.status).join(",")} · เดิม ${first6?.status}`);
  // I7 แข่งคีย์เดียว (ผู้เรียกเดิม)
  const r7: string[] = [];
  let ok7 = !fx;
  for (let r = 0; r < 3; r++) {
    const k = key(`idem-race${r}`);
    const input = legacy({ idempotencyKey: k });
    const res = await Promise.all(Array.from({ length: 10 }, async (_, i) => callSale(input, await lane(i))));
    const ids = new Set(res.filter((x) => x?.ok).map((x) => x.saleId));
    const n = await salesByKey(k);
    const allOk = res.every((x) => x?.ok === true);
    r7.push(`r${r}: ok ${res.filter((x) => x?.ok).length}/10 ids ${ids.size} n ${n}${allOk ? "" : ` codes ${[...new Set(res.map(codeOf))].join("|")}`}`);
    if (!(allOk && ids.size === 1 && n === 1)) ok7 = false;
  }
  chk("P1.6-I7", ok7, "ทุกรอบ 10/10 ok · id เดียว · 1 บิล", FX(r7.join(" ; ")));

  // ════════ U คู่สาขา↔ระบบ ════════
  console.log("\n── U คู่สาขา↔ระบบ ──");
  // U1 คู่ผิด: สาขา V (ผูก posV) + posS · ตัวนับของสาขา V มีแถวแล้วจาก V3
  const seqU1 = await counterSeq(uV);
  const kU1 = key("pair-wrong");
  const r1u: string[] = [];
  let resU1: Any = { ok: false, code: "NOT_STARTED" };
  let blockedU1 = false;
  let lockedN = -1;
  let fxU1 = "";
  {
    const holder = await lane(0);
    const caller = await lane(1);
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));
    let onLocked: () => void = () => {};
    const lockedP = new Promise<void>((r) => (onLocked = r));
    const holdP = (holder.$transaction(async (tx: Any) => {
      const rows = (await tx.$queryRaw`SELECT id FROM "PosReceiptCounter" WHERE "unitId" = ${uV} FOR UPDATE`) as Any[];
      lockedN = rows.length;
      onLocked();
      await gate;
    }, { timeout: 30000, maxWait: 10000 }) as Promise<unknown>).catch((e: unknown) => {
      fxU1 ||= `lock:${String((e as Error)?.message ?? e).slice(0, 60)}`;
      onLocked();
    });
    await lockedP;
    let pU1: Promise<Any> = Promise.resolve({ ok: false, code: "NOT_STARTED" });
    try {
      if (lockedN > 0) {
        const st1 = { done: false };
        pU1 = callSale({ tenantId: tid, unitId: uV, systemId: posS, sourceModule: "SHOP", idempotencyKey: kU1, lines: [{ name: "ของผิดสาขา", qty: 1, unitPriceSatang: 1000 }], payMethods: [{ type: "PROMPTPAY", amountSatang: 1000 }] }, caller);
        pU1.then(() => (st1.done = true), () => (st1.done = true));
        await sleep(1500);
        blockedU1 = !st1.done;
      } else fxU1 ||= `ไม่มีแถวตัวนับของสาขา V ให้ล็อก (${lockedN})`;
    } finally {
      release();
    }
    await holdP;
    resU1 = await pU1;
  }
  const seqU1b = await counterSeq(uV);
  r1u.push(`${fxU1 ? `fixture:${fxU1} · ` : ""}ล็อก ${lockedN} · ค้าง:${blockedU1} · ${codeOf(resU1)} · บิล ${await salesByKey(kU1)} · ตัวนับ ${seqU1}→${seqU1b}`);
  chk("P1.6-U1", !fxU1 && lockedN > 0 && !blockedU1 && refused(resU1, ["UNIT_SYSTEM_MISMATCH"]) && (await salesByKey(kU1)) === 0 && seqU1 === seqU1b,
    "ไม่ค้าง · UNIT_SYSTEM_MISMATCH · 0 บิล · ตัวนับเท่าเดิม", FX(r1u.join("")));
  // U2 สาขาไม่ผูก POS ในร้าน POS 2+
  const posCount = await P.appSystem.count({ where: { tenantId: tid, type: "POS" } });
  const kU2 = key("pair-ambiguous");
  // POS ของ seed ผูกสมุดบัญชีจริง ⇒ ทำใน quietTx (ถ้าฐานยังไม่มีการ์ด บิลที่หลุดจะไม่ถูกลงบัญชี — ลบด้วย unitId ตอนคืนสภาพ)
  const u2 = await quietTx((tx) => callSale({ tenantId: tid, unitId: uX || "-", systemId: scope.posSystemId, sourceModule: "SHOP", idempotencyKey: kU2, lines: [{ name: "ของหน้าเว็บ", qty: 1, unitPriceSatang: 1000 }], payMethods: [{ type: "PROMPTPAY", amountSatang: 1000 }] }, tx));
  const cU2 = await P.posReceiptCounter.count({ where: { unitId: uX || "-" } });
  chk("P1.6-U2", posCount >= 2 && refused(u2, ["UNIT_SYSTEM_MISMATCH"]) && String(u2?.message ?? "").includes("เลือกจุดขายก่อน") && (await salesByKey(kU2)) === 0 && cU2 === 0,
    "POS ≥2 · UNIT_SYSTEM_MISMATCH 'เลือกจุดขายก่อน' · 0 บิล · 0 ตัวนับ", FX(`POS ${posCount} · ${codeOf(u2)} ${short(u2?.message, 80)} · ตัวนับ ${cU2}`));
  // U3 ร้าน POS ตัวเดียว
  const restoPosCount = await P.appSystem.count({ where: { tenantId: restoTid, type: "POS" } });
  const kU3 = key("pair-single");
  const u3 = await quietTx((tx) => callSale({ tenantId: restoTid, unitId: uRT || "-", systemId: restoPos, sourceModule: "SHOP", idempotencyKey: kU3, lines: [{ name: "ของหน้าเว็บร้านอาหาร", qty: 1, unitPriceSatang: 1500 }], payMethods: [{ type: "PROMPTPAY", amountSatang: 1500 }] }, tx));
  const sU3 = await saleByKey(kU3, restoTid);
  const kU3b = key("pair-ok");
  const u3b = await callSale({ tenantId: tid, unitId: uS, systemId: posS, sourceModule: "SHOP", idempotencyKey: kU3b, lines: [{ name: "ของถูกสาขา", qty: 1, unitPriceSatang: 1000 }], payMethods: [{ type: "PROMPTPAY", amountSatang: 1000 }] });
  chk("P1.6-U3", restoPosCount === 1 && u3?.ok === true && sU3?.status === "PAID" && sU3?.systemId === restoPos && u3b?.ok === true,
    "ร้าน POS 1 ตัว + สาขาไม่ผูก → PAID · คู่ถูก → PAID", FX(`ร้านอาหาร POS ${restoPosCount} · ${codeOf(u3)} ${sU3?.status} · คู่ถูก ${codeOf(u3b)}`));

  // ════════ B นโยบายขายเกินสต็อก ════════
  console.log("\n── B oversellPolicy ──");
  const setPolicy = async (p: string | null) => {
    try {
      await P.businessUnit.update({ where: { id: uS || "-" }, data: { settings: p ? { pos: { stock: { oversellPolicy: p } } } : {} } });
    } catch (e) {
      console.log(`  (ตั้ง oversellPolicy=${p} ไม่ได้: ${(e as Error).message.slice(0, 80)})`);
    }
  };
  const DEADLOCKISH = (r: Any) => r?.ok !== true && !refused(r, ["STOCK_INSUFFICIENT"]);
  try {
    await setPolicy("BLOCK");
    // B1
    let fxB1 = "";
    let L1: Any = null;
    try {
      L1 = await mkTracked("B1", "ขนม BLOCK หนึ่ง", 2500, 2);
    } catch (e) {
      fxB1 = (e as Error).message.slice(0, 80);
    }
    const seqB1 = await counterSeq(uS);
    const kB1a = key("block-over");
    const b1a = L1 ? await sub(owner, { idempotencyKey: kB1a, lines: [{ productId: L1.id, qty: 3 }], payMethods: pay(7500) }) : { ok: false, code: "FIXTURE" };
    asData("B1 BLOCK", b1a, "STOCK_INSUFFICIENT");
    const ohB1a = L1 ? await onHandOf(L1.invItemId) : NaN;
    const outB1a = L1 ? await outCount(L1.invItemId) : -1;
    const seqB1a = await counterSeq(uS);
    const kB1b = key("block-exact");
    const b1b = L1 ? await sub(owner, { idempotencyKey: kB1b, lines: [{ productId: L1.id, qty: 2 }], payMethods: pay(5000) }) : { ok: false, code: "FIXTURE" };
    const sB1b = await saleByKey(kB1b);
    const ohB1b = L1 ? await onHandOf(L1.invItemId) : NaN;
    const outB1b = sB1b ? await P.invMovement.count({ where: { tenantId: tid, type: "OUT", refType: "PosSale", refId: sB1b.id } }) : -1;
    const kB1c = key("block-untracked");
    const b1c = await sub(owner, { idempotencyKey: kB1c, lines: LA(), payMethods: pay(tA) });
    chk("P1.6-B1", !fxB1 && refused(b1a, ["STOCK_INSUFFICIENT"]) && !(await saleByKey(kB1a)) && ohB1a === 2 && outB1a === 0 && seqB1a === seqB1 && b1b?.ok === true && ohB1b === 0 && outB1b === 1 && b1c?.ok === true,
      "ขาย 3 STOCK_INSUFFICIENT (สต็อก 2 · OUT 0 · ตัวนับเดิม) · ขาย 2 PAID สต็อก 0 OUT 1 · ไม่นับสต็อก PAID",
      FX(`${fxB1 ? `fixture:${fxB1} · ` : ""}${codeOf(b1a)} oh ${ohB1a} out ${outB1a} ตัวนับ ${seqB1}→${seqB1a} · ${codeOf(b1b)} oh ${ohB1b} out ${outB1b} · untracked ${codeOf(b1c)}`));
    // B2 createSale รูปแบบเดิม
    let L2: Any = null;
    let fxB2 = "";
    try {
      L2 = await mkTracked("B2", "ขนม BLOCK สอง", 2500, 1);
    } catch (e) {
      fxB2 = (e as Error).message.slice(0, 80);
    }
    const kB2 = key("block-legacy");
    const b2 = L2 ? await callSale({ tenantId: tid, unitId: uS, systemId: posS, sourceModule: "POS", idempotencyKey: kB2, lines: [{ name: "ขนม BLOCK สอง", qty: 2, unitPriceSatang: 2500, itemId: L2.invItemId }], payMethods: [{ type: "CASH", amountSatang: 5000 }] }) : { ok: false, code: "FIXTURE" };
    const ohB2 = L2 ? await onHandOf(L2.invItemId) : NaN;
    chk("P1.6-B2", !fxB2 && refused(b2, ["STOCK_INSUFFICIENT"]) && !(await saleByKey(kB2)) && ohB2 === 1, "STOCK_INSUFFICIENT · ไม่มีบิล · สต็อก 1",
      FX(`${fxB2 ? `fixture:${fxB2} · ` : ""}${codeOf(b2)} oh ${ohB2}`));
    // B3 ชิ้นสุดท้าย 10×3
    const rB3: string[] = [];
    let okB3 = true;
    for (let r = 0; r < 3; r++) {
      let L: Any = null;
      try {
        L = await mkTracked(`B3R${r}`, `ชิ้นสุดท้าย BLOCK ${r}`, 2500, 1);
      } catch (e) {
        rB3.push(`r${r}: สร้างไม่ได้ ${(e as Error).message.slice(0, 60)}`);
        okB3 = false;
        continue;
      }
      const keys = Array.from({ length: 10 }, (_, i) => key(`b3-${r}-${i}`));
      const res = await Promise.all(keys.map(async (k, i) => sub(owner, { idempotencyKey: k, lines: [{ productId: L.id, qty: 1 }], payMethods: pay(2500) }, ctxS, await lane(i))));
      const paid = res.filter((x) => x?.ok).length;
      const lost = res.filter((x) => refused(x, ["STOCK_INSUFFICIENT"])).length;
      const other = [...new Set(res.filter(DEADLOCKISH).map(codeOf))];
      const oh = await onHandOf(L.invItemId);
      const n = await P.posSale.count({ where: { tenantId: tid, idempotencyKey: { in: keys.flatMap((k) => keyIn(k).in) } } });
      rB3.push(`r${r}: PAID ${paid} SI ${lost} oh ${oh} บิล ${n}${other.length ? ` อื่น ${other.join("|")}` : ""}`);
      if (!(paid === 1 && lost === 9 && oh === 0 && n === 1 && other.length === 0)) okB3 = false;
    }
    chk("P1.6-B3", okB3, "ทุกรอบ PAID 1 · SI 9 · สต็อก 0 · บิล 1 · ไม่มีรหัสอื่น", FX(rB3.join(" ; ")));
    // B4 สองสินค้าสลับลำดับ 10×3
    const rB4: string[] = [];
    let okB4 = true;
    for (let r = 0; r < 3; r++) {
      let X: Any = null, Y: Any = null;
      try {
        X = await mkTracked(`B4X${r}`, `ขนม X ${r}`, 2500, 5);
        Y = await mkTracked(`B4Y${r}`, `ขนม Y ${r}`, 2500, 5);
      } catch (e) {
        rB4.push(`r${r}: สร้างไม่ได้ ${(e as Error).message.slice(0, 60)}`);
        okB4 = false;
        continue;
      }
      const keys = Array.from({ length: 10 }, (_, i) => key(`b4-${r}-${i}`));
      const res = await Promise.all(keys.map(async (k, i) => {
        const lines = i % 2 ? [{ productId: X.id, qty: 1 }, { productId: Y.id, qty: 1 }] : [{ productId: Y.id, qty: 1 }, { productId: X.id, qty: 1 }];
        return sub(owner, { idempotencyKey: k, lines, payMethods: pay(5000) }, ctxS, await lane(i));
      }));
      const paid = res.filter((x) => x?.ok).length;
      const lost = res.filter((x) => refused(x, ["STOCK_INSUFFICIENT"])).length;
      const other = [...new Set(res.filter(DEADLOCKISH).map(codeOf))];
      const ohX = await onHandOf(X.invItemId), ohY = await onHandOf(Y.invItemId);
      rB4.push(`r${r}: PAID ${paid} SI ${lost} oh ${ohX}/${ohY}${other.length ? ` อื่น ${other.join("|")}` : ""}`);
      if (!(paid === 5 && lost === 5 && ohX === 0 && ohY === 0 && other.length === 0)) okB4 = false;
    }
    chk("P1.6-B4", okB4, "ทุกรอบ PAID 5 · SI 5 · สต็อก 0/0 · ไม่มี deadlock", FX(rB4.join(" ; ")));
    // B5 ปริยาย / ALLOW_NEGATIVE
    const rB5: string[] = [];
    let okB5 = true;
    for (const [label, pol] of [["ไม่ตั้ง", null], ["ALLOW_NEGATIVE", "ALLOW_NEGATIVE"]] as [string, string | null][]) {
      await setPolicy(pol);
      let L: Any = null;
      try {
        L = await mkTracked(`B5${pol ?? "none"}`, `ขนมขายเกิน ${label}`, 2500, 2);
      } catch (e) {
        rB5.push(`${label}: สร้างไม่ได้ ${(e as Error).message.slice(0, 60)}`);
        okB5 = false;
        continue;
      }
      const r = await sub(owner, { idempotencyKey: key(`b5-${label}`), lines: [{ productId: L.id, qty: 3 }], payMethods: pay(7500) });
      const oh = await onHandOf(L.invItemId);
      rB5.push(`${label}: ${codeOf(r)} oh ${oh}`);
      if (!(r?.ok === true && oh === -1)) okB5 = false;
    }
    chk("P1.6-B5", okB5, "PAID · สต็อก −1 ทั้งสองแบบ", FX(rB5.join(" · ")));
  } finally {
    await setPolicy(null);
  }

  // ════════ R1 ปฏิเสธเป็นข้อมูล ════════
  const badR1 = dataRefusals.filter(([, r, code]) => !(r?.ok === false && r.threw !== true && r.code === code && typeof r.message === "string" && r.message.length > 0))
    .map(([l, r]) => `${l}:${r?.threw ? "THROW " : ""}${codeOf(r)}`);
  chk("P1.6-R1", dataRefusals.length >= 8 && badR1.length === 0, `${dataRefusals.length} คำปฏิเสธ = {ok:false, code, message} ไม่ throw`, FX(badR1.join(" · ") || "ครบ"));
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
  const units = [...sb.unitIds, ...sb.restoUnitIds];
  const systems = sb.systemIds;
  const sales = (await P.posSale.findMany({ where: { tenantId: { in: TIDS }, OR: [{ idempotencyKey: { startsWith: TAG } }, { idempotencyKey: { contains: KTAG } }, ...(units.length ? [{ unitId: { in: units } }] : []), ...(systems.length ? [{ systemId: { in: systems } }] : [])] }, select: { id: true } })) as Any[];
  const saleIds = sales.map((s) => s.id);
  if (systems.length && typeof P.posProduct?.findMany === "function") {
    try {
      const extra = ((await P.posProduct.findMany({ where: { tenantId: { in: TIDS }, systemId: { in: systems } }, select: { id: true } })) as Any[]).map((r) => r.id);
      sb.productIds = [...new Set([...sb.productIds, ...extra])];
    } catch {
      /* ใช้รายการที่จำไว้ */
    }
  }
  const evKeys = saleIds.flatMap((id) => [`PosSale#${id}#PAID`, `PosSale#${id}#VOIDED`]);
  const evWhere = { tenantId: { in: TIDS }, OR: [...(units.length ? [{ unitId: { in: units } }] : []), ...(systems.length ? [{ systemId: { in: systems } }] : []), { idempotencyKey: { in: evKeys } }] };
  // รอคิวของบิลเราให้จบก่อนลบ (กันตัวระบายในโปรเซสนี้เขียนตามหลังการลบ)
  for (let i = 0; i < 20 && (saleIds.length || units.length); i++) {
    const pend = await P.outboxEvent.count({ where: { ...evWhere, status: "PENDING" } });
    if (pend === 0) break;
    await sleep(500);
  }
  const counts: Record<string, number> = {};
  counts.outbox = await del("outboxEvent", evWhere);
  counts.audit = await del("auditLog", { tenantId: { in: TIDS }, createdAt: { gte: runStart }, OR: [...(units.length ? [{ unitId: { in: units } }] : []), { targetId: { in: [...saleIds, ...sb.productIds, ...sb.invItemIds, ...systems] } }] });
  counts.journal = await del("accountJournalEntry", { tenantId: { in: TIDS }, refType: "PosSale", refId: { in: saleIds } });
  counts.point = await del("pointLedger", { tenantId: { in: TIDS }, refId: { in: saleIds } });
  counts.coupon = await del("couponRedemption", { tenantId: { in: TIDS }, refType: "PosSale", refId: { in: saleIds } });
  // ร้านอาหาร sandbox (I6) — รายการผูก saleId แบบหลวม ⇒ ลบก่อนบิลก็ได้ · ลำดับตาม FK
  if (units.length) {
    for (const m of ["restaurantOrderItemOption", "restaurantOrderItem", "restaurantOrder", "restaurantServiceRequest", "tableSession", "restaurantTable", "restaurantZone", "kdsStation", "restaurantSetting"]) {
      const n = await del(m, { tenantId: { in: TIDS }, unitId: { in: units } });
      if (n > 0) counts[m] = n;
    }
  }
  counts.payment = await del("posPayment", { saleId: { in: saleIds } });
  counts.line = await del("posSaleLine", { saleId: { in: saleIds } });
  counts.sale = await del("posSale", { id: { in: saleIds } });
  for (const m of ["posProductOptionGroup", "posVariant", "recipeLine", "posProductChannelPrice", "posProductAvailability", "posProductUnit"]) {
    if (sb.productIds.length) await del(m, { productId: { in: sb.productIds } });
  }
  counts.product = sb.productIds.length ? await del("posProduct", { id: { in: sb.productIds } }) : 0;
  if (systems.length) counts.productBySystem = await del("posProduct", { tenantId: { in: TIDS }, systemId: { in: systems } });
  if (systems.length) await del("posCategory", { tenantId: { in: TIDS }, systemId: { in: systems } });
  for (const sbInv of sb.invSysIds) {
    // inventory.receive/consume โพสต์ GL เข้าสมุด "ตัวแรกของร้าน" (inventory/service.ts postMovementGl) ⇒ ลบ AccountJournalEntry refType InvMovement ก่อน
    const mvIds = ((await P.invMovement.findMany({ where: { tenantId: { in: TIDS }, systemId: sbInv }, select: { id: true } })) as Any[]).map((m) => m.id);
    if (mvIds.length) counts.invJournal = (counts.invJournal ?? 0) + (await del("accountJournalEntry", { tenantId: { in: TIDS }, refType: "InvMovement", refId: { in: mvIds } }));
    for (const m of ["invMovement", "invLot", "invLocationStock", "invItemImage"]) await del(m, { tenantId: { in: TIDS }, OR: [{ systemId: sbInv }, { itemId: { in: sb.invItemIds } }] });
    counts.invItem = (counts.invItem ?? 0) + (await del("invItem", { tenantId: { in: TIDS }, systemId: sbInv }));
    for (const m of ["invLocation", "invCategory", "invSettings"]) await del(m, { tenantId: { in: TIDS }, systemId: sbInv });
  }
  if (units.length) counts.counter = await del("posReceiptCounter", { tenantId: { in: TIDS }, unitId: { in: units } });
  // ตัวนับใบเสร็จของสาขาจริง: คืนค่าเดิม (บิลหลุดเข้าสาขาจริง = บั๊กของผู้สร้าง แต่ข้อมูลต้องคืน) · ตัวนับใหม่ที่ไม่อยู่ใน snapshot = ลบ
  for (const c of realCounters) {
    try {
      await P.posReceiptCounter.update({ where: { id: c.id }, data: { seq: c.seq } });
    } catch {
      /* แถวหาย = ไม่มีอะไรให้คืน */
    }
  }
  if (realCountersTaken) await del("posReceiptCounter", { tenantId: { in: TIDS }, id: { notIn: realCounters.map((c: Any) => c.id) } });
  // สมุดบัญชี sandbox (V/K): การเชื่อม → ตั้งค่า → (เอกสาร/บรรทัดบัญชีถ้ามีหลุด) — ไม่มี event ถูกระบาย จึงไม่ควรมีเอกสาร
  if (sb.posLinkedIds.length) counts.accLink = await del("accountSystemLink", { tenantId: { in: TIDS }, linkedKind: "POS", linkedId: { in: sb.posLinkedIds } });
  if (sb.accSystemIds.length) {
    counts.accJournal = await del("accountJournalEntry", { tenantId: { in: TIDS }, systemId: { in: sb.accSystemIds } });
    counts.accDoc = await del("accountDocument", { tenantId: { in: TIDS }, systemId: { in: sb.accSystemIds } });
    for (const m of ["accountLedger", "accountMapping", "accountDocSequence", "accountPeriod"]) await del(m, { tenantId: { in: TIDS }, systemId: { in: sb.accSystemIds } });
    counts.accSettings = await del("accountSettings", { tenantId: { in: TIDS }, systemId: { in: sb.accSystemIds } });
  }
  if (units.length) await del("appSystemUnit", { unitId: { in: units } });
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
  runPure();
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
chk("P1.6-Z1", drift.length === 0, "ก่อน = หลัง", drift.length ? drift.join(", ") : "เท่ากันทุกตาราง");
const fpAfter = await fingerprint();
const fpDrift = Object.keys(fpBefore).filter((k) => fpBefore[k] !== fpAfter[k]).map((k) => `${k}:${fpBefore[k]}→${fpAfter[k]}`);
chk("P1.6-Z2", fpDrift.length === 0 && !Object.values(fpBefore).some((v) => v.startsWith("err")), "ลายนิ้วมือเท่าเดิมทุกตาราง", fpDrift.length ? fpDrift.join(", ") : `เท่าเดิม (${Object.entries(fpAfter).map(([k, v]) => `${k}=${v.split(":")[0]}`).join(" ")})`);
// ข้อที่ไม่ถึง (harness ล้มกลางทาง) = แดง ไม่ใช่หายเงียบ
for (const [id] of CHECKS) if (!results.has(id) && !skippedChecks.has(id)) chk(id, false, "ถูกตรวจ", crashed ? `ไม่ถึง (harness ล้ม: ${crashed.slice(0, 80)})` : "ไม่ถึง");
for (const c of lanes) await c.$disconnect?.().catch?.(() => {});
const failed = [...results.entries()].filter(([, r]) => !r.ok).map(([id]) => id);
console.log(`\n===== ${SUITE} ===== ผ่าน ${results.size - failed.length}/${results.size}${FORCE ? " (QC_FORCE)" : ""}${skippedChecks.size ? ` · ข้าม ${skippedChecks.size}` : ""}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ suite: SUITE, total: results.size, passed: results.size - failed.length, failed, skipped: false, forced: FORCE, skippedChecks: Object.fromEntries(skippedChecks), missing: skipReasons, a5: { drift } })}`);
await P.$disconnect?.().catch?.(() => {});
process.exit(failed.length ? 1 : 0);

// ─── หมายเหตุขอบเขต ───
// นอกขอบเขต P1.6 (ใบอื่นเป็นเจ้าของ): P1.7 PromptPay แบบไดนามิก/เกตเวย์บัตร · P1.8 คืนเงิน/CN · P1.9 กะ/ลิ้นชัก/Z ·
// P1.10 พิมพ์ · P1.12 สิทธิ์สมาชิกตอนจ่าย · P1.13 ใบกำกับเต็มรูป · P1.15 PIN/อนุมัติ · UI ภาพ 02/05ข = ผู้คุมงานตรวจที่ visual
