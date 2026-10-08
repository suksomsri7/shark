// QC — POS RUN ใบ P1.8: คืนเงินบางส่วน · ใบลดหนี้ (CN) · ย้อนสต็อก/แต้ม/ยอดสมาชิก · เงินสดในกะ · เขียนก่อนสร้าง (fail-before) · ผู้เขียนข้อสอบ
// requires: pos-seed
//
// สัญญา: ledger/pos-briefs/pos-brief-P1.8.md (มติ R1–R10 · คำถามเจ้าของ Q1–Q6 ใช้ค่าปริยายในไฟล์นี้) · pos-brief-COMMON · pos-brief-LANE-RULES
//        docs/modules/14-pos.md §7.6 (:908-914) · ledger/POS-CONTRACTS.md:111 (pos.sale.refunded)
//        โน้ต: ledger/wo-notes/pos-P1.8-oracle.md (รายการข้อ · ผลที่คาดบนฐาน · ชื่อที่ตั้งใหม่ · ความคลาดเคลื่อน · CONTROLLER-DECISION)
// ชื่อทุกตัวที่ยังไม่มีในโค้ดถูก "ตั้ง" ในไฟล์นี้ และลงทะเบียนในโน้ตหัวข้อ "Names I had to invent" — ผู้คุมงานต้องรับรองก่อนผู้สร้างเริ่ม
//   ผู้สร้างห้ามแก้ข้อสอบนี้ (ORACLE-EDIT เท่านั้น)
//
// ของที่ใบ P1.8 ต้องส่ง (ข้อสอบนี้คือสัญญา · ย่อจาก brief §2):
//   schema: enum PosSaleDocType {SALE REFUND} · PosSale.docType (@default SALE) · refSaleId String? · refundedSatang Int @default(0) · reasonCode String? ·
//     PosSaleLine.refLineId String? · restock Boolean? · model PosDocCounter {tenantId unitId docType period seq} @@unique([unitId, docType, period])
//   src/lib/modules/pos/refund.ts: refundSale(ctx, actor, input, client?) · saleForRefund(ctx, actor, {saleId}, client?) — ปฏิเสธเป็นข้อมูล ไม่ throw
//     input = { saleId, lines:[{lineId, qty, restock?}], payMethods:[{type CASH|TRANSFER|PROMPTPAY|CARD, amountSatang, reference?}],
//               reasonCode DAMAGED|WRONG_ITEM|CHANGED_MIND|OTHER, reason?(≤200), deviceId?, idempotencyKey }
//     ok = { ok:true, refund:{ id, receiptNo, grandTotalSatang, … }, sale:{ status, refundedSatang }, duplicated? }
//   refund-actions.ts ("use server"): refundSaleAction · saleForRefundAction · consumer `pos.sale.refunded` (refund-consumer.ts) ·
//   account facade applyExternalRefund · point.reversePartialEarn · member-bridges#onPosSaleRefunded · สิทธิ์ pos.sale.refund
//   รหัส: NO_PERMISSION SALE_NOT_FOUND SALE_NOT_REFUNDABLE REFUND_EXCEEDS REFUND_EMPTY PAYMENT_MISMATCH REFUND_METHOD_INVALID
//         SHIFT_REQUIRED REASON_REQUIRED IDEMPOTENCY_CONFLICT VALIDATION  (ข้อความ pos.refund.errors.<camel> th+en)
//   มติผู้คุมงาน (brief §7 CD1): voidSale ของบิล SALE ที่ refundedSatang > 0 → โยน PosSaleError code HAS_REFUNDS (ทุกผู้เรียก)
//
// สูตรเงินที่ข้อสอบตรึง (มติ R5 · ข้อสอบคำนวณเองจากแถว DB ของบิลเดิม):
//   ส่วนลดระดับบิล D = Σ lineTotal + serviceCharge − grandTotal (ท้ายบิล + คูปอง + สิทธิ์สมาชิก) → เกลี่ยลงบรรทัดแบบ largest remainder
//     (ตัวเดียวกับ account-bridge allocateBillDiscount · น้ำหนัก = lineTotal ของบรรทัดสินค้า · ค่าบริการไม่ถูกเกลี่ย) ⇒ net(บรรทัด) = lineTotal − ส่วนที่เกลี่ย
//   คืน q หน่วยของบรรทัด (Q หน่วย): ยังไม่ใช่หน่วยสุดท้าย = ปัดครึ่งขึ้น(net × q / Q) · ครบหน่วยสุดท้าย = net − Σ ที่คืนไปแล้วของบรรทัดนั้น
//   ค่าบริการของใบคืน: คืนบางส่วน = ปัดครึ่งขึ้น(SC × Σ ยอดบรรทัดที่คืน / Σ net ทั้งบิล) · ใบที่ทำให้คืนครบทั้งบิล = SC − Σ SC ที่คืนไปแล้ว · ทิปไม่คืนเลย
//   grandTotal(ใบคืน) = Σ บรรทัด + ค่าบริการ · vatSatang = splitIncludedVat(grandTotal, อัตราของ POS) · Σ payMethods ต้องเท่า grandTotal เป๊ะ
//   แต้มคืนบางส่วน = floor(แต้มที่ได้จากบิล × ยอดคืน / grandTotal ของบิลเดิม) จากล็อตเดิม · คืนครบ = ที่เหลือทั้งหมด (สุทธิ 0)
//
// ขอบเขต: S สถิต · A เงิน · E สิทธิ์คืน/ปฏิเสธ · N เลข CN · R แข่ง · I idempotency · H กะ · D ตัวอ่านยอด · C consumer · Q read model · Z คืนสภาพ
//   จอ 12 (bills-refund) = P1.16 · ไม่อยู่ในข้อสอบนี้
//
// 🔴 กติกาข้อสอบ (แบบเดียวกับ qc-pos-p1.9/p1.6): SKIP เมื่อของ P1.8 ยังไม่มี (exit 0 + เหตุผล) · QC_FORCE=1 = ข้ามด่าน SKIP (ต้องแดงตามเหตุผล ไม่ crash)
//    --list = พิมพ์ทุก id ไม่แตะ DB · --no-db = รันเฉพาะข้อสถิต S1–S9 (exit 1 ถ้าแดง)
//    ฐาน = QC4 เท่านั้น (ก่อนเขียนแถวแรกต้องเป็น host ep-frosty-lab) · ร้านทดสอบ = ร้านชั่วคราว `qc-p18-<rand>` (แบบ qc-pos-account:
//    POS ผูกสมุดบัญชีจด VAT + คลัง + สมาชิก + แต้ม + คูปอง) · ลบทั้งร้านใน finally ด้วย DELETE ตาม tenantId ทุกตาราง (ตรวจ slug ก่อนลบ)
//    ร้าน QC ของ seed ไม่ถูกเขียน (ใช้แค่ userId ของเจ้าของ/แคชเชียร์) — Z1 นับแถวก่อน/หลัง + ร้านชั่วคราวเหลือ 0 แถว · Z2 ลายนิ้วมือ
//    ทิปบนบิล X ใส่ด้วยการแก้แถวตรง (createSale รับทิปไม่ได้ขณะ TIP_POSTING_READY = false — payment-settings.ts:41)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";

const SUITE = "qc-pos-p1.8";
const ROOT = process.cwd();
const LIST = process.argv.includes("--list");
const NODB = process.argv.includes("--no-db");
const FORCE = process.env.QC_FORCE === "1";

// ═════════════════════════ ทะเบียนข้อสอบ D(id · X-group · หัวข้อ) — --list พิมพ์ชุดนี้ ═════════════════════════
// X-group: S สถิต · X1 idempotency/เล่นซ้ำ · X3 สิทธิ์ · X4 เงิน · X5 ย้อนผลข้างเคียงครบทุกทาง · X6 แข่ง · "-" เชิงหน้าที่
type Def = readonly [string, string, string];
const D = (id: string, x: string, title: string): Def => [`P1.8-${id}`, x, title] as const;
const CHECKS: readonly Def[] = [
  // ── S สถิต (ไม่แตะ DB) ──
  D("S1", "S", "[R1 R2] schema: enum PosSaleDocType {SALE REFUND} · PosSale.docType PosSaleDocType @default(SALE) · refSaleId String? (ไม่มี @relation) · refundedSatang Int @default(0) · reasonCode String? · PosSaleLine.refLineId String? · restock Boolean?"),
  D("S2", "S", "[R4] model PosDocCounter {tenantId unitId docType PosSaleDocType period String seq Int} @@unique([unitId, docType, period]) · core/scope.ts ลงทะเบียน PosDocCounter"),
  D("S3", "S", "[R1 F15.2] migration เพิ่มล้วน: CREATE TYPE PosSaleDocType · CREATE TABLE PosDocCounter + unique (unitId,docType,period) · ADD COLUMN ที่ NOT NULL ต้องมี DEFAULT · ไม่มี DROP/RENAME/SET NOT NULL/ALTER TYPE ADD VALUE · ไม่มี FK และ index บน refSaleId/refLineId"),
  D("S4", "S", "[R5 Q2] core/permissions.ts โมดูล pos มี pos.sale.refund (คนละคีย์กับ pos.sale.void)"),
  D("S5", "S", "[R7 COMMON 4] outbox-consumers.ts ลงทะเบียน \"pos.sale.refunded\" ครอบ withAutomation · มี src/lib/modules/pos/refund-consumer.ts"),
  D("S6", "S", "[R5 COMMON 6 · §7 CD1] ข้อความ pos.refund.errors.{noPermission saleNotFound saleNotRefundable refundExceeds refundEmpty paymentMismatch refundMethodInvalid shiftRequired reasonRequired idempotencyConflict validation hasRefunds} th (มีอักษรไทย) + en (ไม่มีอักษรไทย)"),
  D("S7", "S", "[R9] refund-actions.ts: \"use server\" บรรทัดแรก · export เฉพาะ async function (ไม่มี export type/interface/const) · ไม่ throw · refundSaleAction เรียก refundSale + catch · saleForRefundAction เรียก saleForRefund + catch · revalidatePath · unstable_rethrow"),
  D("S8", "S", "[R5 R7 COMMON 2-3] refund.ts export refundSale + saleForRefund · มี FOR UPDATE · ไม่แตะ posReceiptCounter / invItem.onHand · account/index export applyExternalRefund · point/lots + point facade export reversePartialEarn · member-bridges export onPosSaleRefunded · ลายเซ็น createSale/voidSale เดิม"),
  D("S9", "S", "[R3] ไฟล์ตัวอ่านขั้นต่ำรู้จัก docType: pos/service.ts (daySummary/listSales/closeDaySummary) · pos/shift.ts (computeReport/offShiftCash) · pos/reports.ts"),
  // ── A เงิน ──
  D("A1", "X4", "คืนบางส่วนบิล X (ส่วนลดบรรทัด+ท้ายบิล+คูปอง+ค่าบริการ+ทิป): เสื้อ×1 + หมวก×1 → ใบ REFUND ใหม่ (docType REFUND · refSaleId · status PAID · ร้าน/สาขา/ระบบเดิม · soldByUserId ผู้คืน · note = reason · reasonCode) · บรรทัด refLineId/qty/lineTotal ตามสูตร · SC ตามสัดส่วน · tip 0 · grand = Σ+SC · จ่าย CASH = grand · ผลลัพธ์ refund.id/receiptNo/sale.status/refundedSatang"),
  D("A2", "X4", "ปัดครึ่งขึ้น + หน่วยสุดท้ายเก็บเศษ: เสื้อ net 26,857/3 → 8,952 · 8,952 · 8,953 (ไม่ใช่แบบสะสม 8,952/8,953/8,952) · หมวก 13,891/2 → 6,946 แล้ว 6,945 · Σ ใบคืนของแต่ละบรรทัด = net ของบรรทัดเป๊ะ"),
  D("A3", "X4", "คืนครบบิล X ใบที่ 3: SC = ส่วนที่เหลือ (Σ SC ใบคืน = 4,383) · Σ grand ใบคืน = 48,217 = grand บิลเดิม · ทิป 500 ไม่ถูกคืน (Σ เงินคืน 48,217 ≠ 48,717 · tipSatang ใบคืน 0)"),
  D("A4", "X4", "VAT ระดับเอกสาร: ทุกใบคืนบน POS ผูกสมุดจด VAT 7% vatSatang = splitIncludedVat(grand, 700) · ใบคืนบน POS ไม่ผูกสมุด vatSatang 0"),
  D("A5", "X4", "Σ payMethods ≠ grand (±1) → PAYMENT_MISMATCH ไม่มีใบ ตัวนับ CN ไม่ขยับ · แบ่งคืน CASH 2,000 + TRANSFER 3,000 = 5,000 → ok แถวจ่าย 2 แถวตรงชุด"),
  D("A6", "X4", "บรรทัดชั่งคืนทั้งบรรทัด: qty 2 → REFUND_EXCEEDS · qty 1 = net ทั้งบรรทัด 3,500 · บรรทัดชุด (qty 2) คืน 1 ชุด = 4,000"),
  D("A7", "X4", "บิลเดิม (R2): refundedSatang สะสม 17,488 → 27,335 → 48,217 · status PAID ระหว่างคืนบางส่วน · REFUNDED เมื่อทุกบรรทัดคืนครบ"),
  // ── E สิทธิ์คืน / ปฏิเสธ ──
  D("E1", "-", "คืนไม่ได้: บิล VOIDED / บิล REFUNDED แล้ว / id ของใบ REFUND / บิลขายบัตรกำนัล (giftCardId) → SALE_NOT_REFUNDABLE · id ไม่มีจริง / บิลสาขาอื่น / บิลร้านอื่น → SALE_NOT_FOUND · ไม่มีใบคืนเกิด"),
  D("E2", "X4", "จำนวน: เกินที่เหลือ (รวมหลังคืนบางส่วน) → REFUND_EXCEEDS · lines ว่าง → REFUND_EMPTY · qty 0/−1/1.5/\"1\" · lineId ไม่มี/ของบิลอื่น/ซ้ำ · reason 201 ตัว · reasonCode แปลก → VALIDATION · ไม่มีใบคืนเกิด"),
  D("E3", "-", "เหตุผล: ไม่ส่ง reasonCode → REASON_REQUIRED · OTHER + reason ว่าง/ช่องว่าง → REASON_REQUIRED · OTHER + เหตุผล → ok"),
  D("E4", "X4", "วิธีคืนเงิน DEPOSIT / ROOM_CHARGE → REFUND_METHOD_INVALID ไม่มีใบ"),
  D("E5", "X3", "สิทธิ์: แคชเชียร์ QC (มี pos.sale.create + pos.sale.void แต่ไม่มี pos.sale.refund) → NO_PERMISSION ไม่มีใบ · STAFF ที่ได้ pos.sale.refund → ok · MANAGER → ok (soldByUserId = ผู้คืน)"),
  D("E6", "-", "คำปฏิเสธทุกตัวที่เก็บมา = คืน {ok:false, code, message} ข้อความไทย ไม่ throw"),
  // ── N เลข CN ──
  D("N1", "-", "[R4 O2] เลข CN${YYYYMM}-NNNN จาก PosDocCounter(docType REFUND) · ใบแรกของสาขา = 0001 · สาขาอื่นเริ่ม 0001 ของตัวเอง · PosReceiptCounter ไม่ขยับจากการคืน · ไม่มีแถว SALE ใน PosDocCounter · บิลขายถัดไปได้ YYYYMM-NNNN ต่อเลขเดิม"),
  D("N2", "-", "[R4] settings.pos.receipt.refundPrefix = \"RF\" → เลข RF${YYYYMM}-0001"),
  D("N3", "X6", "คืน 10 บิลต่างกันพร้อมกัน 10 connection บนสาขาที่ยังไม่เคยคืน (แถวตัวนับยังไม่มี) → ok 10 · เลข CN 0001–0010 ไม่ซ้ำ ไม่ข้าม · PosDocCounter.seq = 10"),
  // ── R แข่ง ──
  D("R1", "X6", "สองคนคืนบรรทัดเดียวกันที่เหลือ 1 พร้อมกัน (2 connection) × 3 รอบ → ok 1 + REFUND_EXCEEDS 1 ทุกรอบ · ใบคืน 1 ใบต่อบิล · refundedSatang = ยอดใบเดียว"),
  // ── I idempotency ──
  D("I1", "X1", "คีย์เดิม + payload เดิม → ใบคืนเดิม (refund.id เดิม) · ใบเดียว · เลข CN เดียว · ตัวนับไม่ขยับ · outbox pos.sale.refunded 1 แถว · แถวจ่าย 1 แถว"),
  D("I2", "X1", "คีย์เดิม + payload ต่าง (จำนวน / วิธีจ่าย) และคีย์ที่ชนกับคีย์ของบิลขาย → IDEMPOTENCY_CONFLICT · ไม่มีใบ/เลขเพิ่ม"),
  // ── H กะ ──
  D("H1", "X4", "[R5 R8] เปิดกะเครื่อง D (ตั้งต้น ฿1,000) → ขายเงินสด ฿620 → คืนเงินสด ฿85 ที่ D → ใบคืน shiftId = กะ · X: billCount 1 · salesTotal 62,000 · cashRefunds 8,500 · refundCount 1 · refundSatang 8,500 · CASH {count 1 amount 62,000 refundCount 1 refundSatang 8,500} · expected = 100,000 + 62,000 − 8,500 · Z ตอนปิดเหมือนกัน"),
  D("H2", "X4", "[R5] บังคับกะ (pos.shift.required.register): CASH ที่เครื่องไม่มีกะ / ไม่ส่งเครื่อง → SHIFT_REQUIRED ไม่มีใบ · TRANSFER ที่เครื่องไม่มีกะ → ok shiftId null"),
  D("H3", "X4", "[R5 Q5] บิลของกะที่ปิดแล้ว: voidSale → SHIFT_CLOSED บิลยัง PAID · คืนที่เครื่องที่มีกะเปิด → ok ผูกกะที่เปิด (ไม่ใช่กะเดิม) · คืนนอกกะ (ไม่บังคับกะ) → ok shiftId null"),
  // ── D ตัวอ่านยอด (positive control) ──
  D("D1", "X4", "[R3] daySummary · closeDaySummary · offShiftCash · listSales: ขาย ฿620 = +62,000 (positive control) · คืน ฿85 = −8,500 พอดี (ไม่ใช่ +8,500 ไม่ใช่ 0) · จำนวนบิลไม่เปลี่ยน · listSales ไม่มีใบ REFUND · offShiftCash มีแถวใบคืน −8,500"),
  D("D2", "X4", "[R3 P1.17] reportDailySales + reportOverview(daily): net +62,000 แล้ว −8,500 · billCount ไม่เปลี่ยน · refundCount +1 · refundTotalSatang +8,500"),
  D("D3", "X4", "[R3] บิลที่คืนครบทั้งใบ (฿300) มีผลสุทธิ 0 ต่อทุกตัวอ่าน (daySummary · closeDaySummary · report · overview · offShiftCash)"),
  // ── C consumer ──
  D("C1", "-", "[R6] outbox pos.sale.refunded 1 แถวต่อใบคืน คีย์ PosSale#<refundSaleId>#REFUNDED · payload {saleId refundSaleId sourceModule full lines[{refLineId qty amountSatang restock itemId}] payMethods} · ไม่มี pos.sale.paid ของใบคืน · AuditLog ของใบคืน"),
  D("C2", "X5", "[R7.1] บัญชีคืนบางส่วน: CREDIT_NOTE 1 ใบ refType PosSale refId = refundSaleId · sourceDocId = TAX_INVOICE_ABB ของบิล · docNo = เลข CN · grand 8,500 · VAT 556 · JV สมดุล: เงินสด 1000 −8,500 · รายได้ 4000 +7,944 · ภาษีขาย 2200 +556 · ลูกหนี้ 1100 0 · JV ของบิลเดิมไม่ถูกกลับรายการ"),
  D("C3", "X5", "[R7.1 CPA] คืนครบ: CN ใบที่ 2 · บิล + CN ทั้งสองรวมกัน 1000/4000/2200 สุทธิ 0 · ทั้งสมุด Σdr = Σcr · เอกสาร ABB ของบิลไม่ถูก VOID"),
  D("C4", "X5", "[R7.1] POS ไม่ผูกสมุด: consumer จบไม่ throw · ไม่มีเอกสาร/JV ของใบคืน · applyExternalRefund ตรง → {posted:false, reason:\"unlinked\"} ไม่ throw"),
  D("C5", "X5", "[R7.2 D5] แต้มคืนบางส่วน: บิล ฿620 ได้ 62 แต้ม → คืน ฿85 หัก floor(62×8,500/62,000) = 8 จากล็อตเดิม (remaining 54) · บิลที่ใช้แต้มแลก: คืนบางส่วนไม่คืนแต้มที่ใช้ (ล็อตที่ถูกตัดคงเดิม · ยอดลดเฉพาะส่วน EARN)"),
  D("C6", "X5", "[R7.2] คืนครบ: แต้มของบิลสุทธิ 0 (EARN + การกลับรายการ) · ยอดแต้มกลับเท่าก่อนซื้อ · ล็อต remaining 0"),
  D("C7", "X5", "[R7.3] ยอดใช้จ่ายสมาชิก: 62,000 → คืน 8,500 → 53,500 → คืนครบ → 0"),
  D("C8", "X5", "[R7.3] สแตมป์: คืนบางส่วนไม่แตะ (ไม่มี VOID) · คืนครบ → ตราของบิลถูก VOID"),
  D("C9", "X5", "[R7.4 O12] สต็อก restock:true → InvMovement IN คีย์ pos-refund-<refundSaleId>-<refundLineId>[-<invItemId>] ที่ต้นทุนของ OUT เดิม (ไม่ใช่ถัวเฉลี่ยปัจจุบัน) · ชุดคืนส่วนประกอบ · บรรทัดชั่งคืนกรัม · restock:false → ไม่มี movement · onHand ตาม"),
  D("C10", "X1", "[R7 COMMON 4] เล่น pos.sale.refunded ซ้ำ 2 รอบ: ไม่ throw · จำนวนเอกสาร/JV/แต้ม/ล็อต/movement/สแตมป์/ไทม์ไลน์/ยอดสะสม/outbox เท่าเดิม · ทุก event DONE"),
  D("C12", "X5", "[brief §7 CD1] void บิลที่คืนบางส่วนแล้ว (คืน ฿85 จาก ฿620): voidSale → HAS_REFUNDS (ข้อความไทย) · บิลยัง PAID refundedSatang 8,500 · ไม่มี outbox pos.sale.voided · แต้ม/สต็อก/ยอดสะสม/JV ไม่ถูกย้อนซ้ำ"),
  D("C11", "X5", "[R6 spec :913] คูปอง: คืนบางส่วน → การใช้คูปองยัง REDEEMED · คืนครบ → RELEASED"),
  // ── Q read model ──
  D("Q1", "-", "[R9] saleForRefund: lines[].lineId/refundableQty (หลังคืนเสื้อ×1 หมวก×1 → 2/1/1) · refunds[].receiptNo/grandTotalSatang · payments · member.pointsEarned 62 · accounting.docNo = เลข ABB · id ไม่มี → SALE_NOT_FOUND"),
  // ── Z คืนสภาพ ──
  D("Z1", "-", "QC4 คืนสภาพ: จำนวนแถวของร้าน QC POS ทั้งสอง ก่อน = หลัง · ร้านชั่วคราวเหลือ 0 แถวในทุกตารางที่มี tenantId + แถว Tenant ถูกลบ"),
  D("Z2", "-", "QC4 ลายนิ้วมือ: แถวเดิมของร้าน QC POS (PosProduct · AppSystem · AppSystemUnit · BusinessUnit · Membership · PosReceiptCounter · Customer) ก่อน = หลัง"),
];

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
const codeOf = (r: Any): string => (r && r.ok === false ? String(r.code ?? "NO_CODE") : r && r.ok === true ? "OK" : "UNKNOWN");
const refused = (r: Any, codes: string[]) => r?.ok === false && codes.includes(String(r.code));
function errCode(e: unknown): string {
  const o = e as { code?: unknown; message?: unknown } | null;
  if (o && typeof o.code === "string" && /^[A-Z][A-Z0-9_]+$/.test(o.code)) return o.code;
  const m = /^([A-Z][A-Z0-9_]{3,})\b/.exec(String(o?.message ?? ""));
  if (m) return m[1];
  return typeof o?.code === "string" && o.code ? o.code : "THROW";
}
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
const tryImport = async (p: string): Promise<Any> => {
  try {
    return await import(p as string);
  } catch (e) {
    console.log(`  (โหลด ${p} ไม่ได้: ${(e as Error).message.slice(0, 120)})`);
    return null;
  }
};
const THAI = /[฀-๿]/;
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
/** ปัดครึ่งขึ้นของ a/b (a ≥ 0 · b > 0 · จำนวนเต็มล้วน) */
const hu = (a: number, b: number) => Math.floor((2 * a + b) / (2 * b));
/** เกลี่ยแบบ largest remainder — ตัวเดียวกับ pos/account-bridge.ts allocateBillDiscount (ลำดับเสมอ = ลำดับบรรทัด) */
function allocLR(weights: number[], total: number): number[] {
  const sumW = sum(weights);
  if (total <= 0 || sumW <= 0) return weights.map(() => 0);
  const raw = weights.map((w) => (total * w) / sumW);
  const out = raw.map((r) => Math.floor(r));
  let rem = total - sum(out);
  const order = raw.map((r, i) => ({ i, frac: r - Math.floor(r) })).sort((a, b) => b.frac - a.frac);
  for (let k = 0; rem > 0 && order.length > 0; k++, rem--) out[order[k % order.length]!.i] += 1;
  return out;
}

// ── ซอร์ส (สถิต) ──
function walk(dir: string, out: string[] = [], re = /\.(tsx|ts)$/): string[] {
  const abs = join(ROOT, dir);
  if (!existsSync(abs)) return out;
  for (const f of readdirSync(abs)) {
    const rel = `${dir}/${f}`;
    if (statSync(join(ROOT, rel)).isDirectory()) walk(rel, out, re);
    else if (re.test(f)) out.push(rel);
  }
  return out;
}
const stripComments = (s: string) => s.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
const stripPrismaComments = (s: string) => s.replace(/\/\/.*$/gm, "");
const exportsFn = (src: string, n: string) => new RegExp(`export\\s+(async\\s+)?function\\s+${n}\\b|export\\s+const\\s+${n}\\b|export\\s*\\{[^}]*\\b${n}\\b[^}]*\\}`).test(src);
function prismaBlock(src: string, kind: "model" | "enum", name: string): string {
  const m = new RegExp(`\\b${kind}\\s+${name}\\s*\\{`).exec(src);
  if (!m) return "";
  const end = src.indexOf("\n}", m.index);
  return end < 0 ? "" : src.slice(m.index, end + 2);
}
const fieldLine = (block: string, f: string): string => (new RegExp(`^\\s*${f}\\s+[^\\n]*$`, "m").exec(block)?.[0] ?? "").trim();
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
      /* ไฟล์พัง = คีย์หาย (S6 แดงเอง) */
    }
  }
  return keys;
}

const REFUND_FILE = "src/lib/modules/pos/refund.ts";
const REFUND_ACT_FILE = "src/lib/modules/pos/refund-actions.ts";
const REFUND_CONSUMER_FILE = "src/lib/modules/pos/refund-consumer.ts";
const SERVICE_FILE = "src/lib/modules/pos/service.ts";
const SHIFT_FILE = "src/lib/modules/pos/shift.ts";
const REPORTS_FILE = "src/lib/modules/pos/reports.ts";
/** รหัสปฏิเสธ (มติ R5) → คีย์ข้อความ pos.refund.errors.* (ชื่อที่ตั้งในข้อสอบนี้) */
const REFUSAL_KEYS: [string, string][] = [
  ["NO_PERMISSION", "noPermission"], ["SALE_NOT_FOUND", "saleNotFound"], ["SALE_NOT_REFUNDABLE", "saleNotRefundable"],
  ["REFUND_EXCEEDS", "refundExceeds"], ["REFUND_EMPTY", "refundEmpty"], ["PAYMENT_MISMATCH", "paymentMismatch"],
  ["REFUND_METHOD_INVALID", "refundMethodInvalid"], ["SHIFT_REQUIRED", "shiftRequired"], ["REASON_REQUIRED", "reasonRequired"],
  ["IDEMPOTENCY_CONFLICT", "idempotencyConflict"], ["VALIDATION", "validation"],
  ["HAS_REFUNDS", "hasRefunds"], // brief §7 CD1 — voidSale ของบิลที่มีการคืนเงินแล้ว
];
const schemaSrc = walk("prisma/schema", [], /\.prisma$/).map((f) => stripPrismaComments(rd(f))).join("\n");
const refundSrc = stripComments(rd(REFUND_FILE));

// ═════════════════════════ 1. ข้อสถิต (ไม่แตะ DB · S1–S9) ═════════════════════════
async function runStatic(): Promise<void> {
  console.log("\n── S ข้อสถิต (ไม่แตะ DB) ──");
  // S1 schema ของ PosSale / PosSaleLine
  {
    const p: string[] = [];
    const en = prismaBlock(schemaSrc, "enum", "PosSaleDocType");
    if (!en || !/\bSALE\b/.test(en) || !/\bREFUND\b/.test(en)) p.push("enum PosSaleDocType ไม่ครบ SALE|REFUND");
    const sale = prismaBlock(schemaSrc, "model", "PosSale");
    const line = prismaBlock(schemaSrc, "model", "PosSaleLine");
    const want: [string, string, RegExp][] = [
      [sale, "docType", /^docType\s+PosSaleDocType\s+@default\(SALE\)/],
      [sale, "refSaleId", /^refSaleId\s+String\?/],
      [sale, "refundedSatang", /^refundedSatang\s+Int\s+@default\(0\)/],
      [sale, "reasonCode", /^reasonCode\s+String\?/],
      [line, "refLineId", /^refLineId\s+String\?/],
      [line, "restock", /^restock\s+Boolean\?/],
    ];
    for (const [blk, f, re] of want) {
      const l = fieldLine(blk, f);
      if (!l) p.push(`ขาด ${f}`);
      else if (!re.test(l)) p.push(`${f} ผิดรูป (${l.slice(0, 50)})`);
    }
    if (/@relation\([^)]*fields:\s*\[\s*refSaleId\s*\]/.test(sale)) p.push("refSaleId มี @relation (ต้องเป็น id หลวม)");
    if (/@@index\(\[\s*refSaleId/.test(sale)) p.push("มี @@index refSaleId (เลื่อนไป P6.1)");
    chk("P1.8-S1", p.length === 0, "PosSaleDocType · docType/refSaleId/refundedSatang/reasonCode · refLineId/restock", p.join(" · ") || "ครบ");
  }
  // S2 PosDocCounter + scope
  {
    const p: string[] = [];
    const b = prismaBlock(schemaSrc, "model", "PosDocCounter");
    if (!b) p.push("ไม่มี model PosDocCounter");
    else {
      for (const [f, re] of [["tenantId", /^tenantId\s+String\b/], ["unitId", /^unitId\s+String\b/], ["docType", /^docType\s+PosSaleDocType\b/], ["period", /^period\s+String\b/], ["seq", /^seq\s+Int\b/]] as [string, RegExp][]) {
        const l = fieldLine(b, f);
        if (!l) p.push(`ขาด ${f}`);
        else if (!re.test(l)) p.push(`${f} ผิดรูป`);
      }
      if (!/@@unique\(\[\s*unitId\s*,\s*docType\s*,\s*period\s*\]/.test(b)) p.push("ไม่มี @@unique([unitId, docType, period])");
    }
    const scopeSrc = stripComments(rd("src/lib/core/scope.ts"));
    if (!/\bPosDocCounter\s*:/.test(scopeSrc)) p.push("core/scope.ts ไม่ลงทะเบียน PosDocCounter");
    chk("P1.8-S2", p.length === 0, "PosDocCounter + unique + scope", p.join(" · ") || "ครบ");
  }
  // S3 migration
  {
    const p: string[] = [];
    const files = walk("prisma/migrations", [], /\.sql$/).filter((f) => /PosDocCounter|PosSaleDocType|refundedSatang/.test(rd(f)));
    if (!files.length) p.push("ไม่มี migration ที่แตะ PosDocCounter/PosSaleDocType");
    const all = files.map((f) => rd(f).replace(/--.*$/gm, "")).join("\n");
    if (files.length) {
      if (!/CREATE\s+TYPE\s+"PosSaleDocType"\s+AS\s+ENUM\s*\(\s*'SALE'\s*,\s*'REFUND'\s*\)/i.test(all)) p.push("ไม่มี CREATE TYPE PosSaleDocType ('SALE','REFUND')");
      if (!/CREATE\s+TABLE\s+"PosDocCounter"/i.test(all)) p.push("ไม่มี CREATE TABLE PosDocCounter");
      if (!/CREATE\s+UNIQUE\s+INDEX[^;]*ON\s+"PosDocCounter"\s*\(\s*"unitId"\s*,\s*"docType"\s*,\s*"period"\s*\)/i.test(all)) p.push("ไม่มี unique (unitId,docType,period)");
      for (const col of ["docType", "refSaleId", "refundedSatang", "reasonCode", "refLineId", "restock"]) {
        const m = new RegExp(`ADD\\s+COLUMN\\s+"${col}"[^,;]*`, "i").exec(all)?.[0] ?? "";
        if (!m) p.push(`ไม่มี ADD COLUMN "${col}"`);
        else if (/NOT\s+NULL/i.test(m) && !/DEFAULT/i.test(m)) p.push(`"${col}" NOT NULL ไม่มี DEFAULT`);
        else if (["refSaleId", "reasonCode", "refLineId", "restock"].includes(col) && /NOT\s+NULL/i.test(m)) p.push(`"${col}" ต้อง nullable`);
      }
      for (const f of files) {
        const t = rd(f).replace(/--.*$/gm, "");
        const tag = f.split("/").slice(-2, -1)[0];
        if (/\bDROP\s+(TABLE|COLUMN|TYPE)\b|\bRENAME\b|SET\s+NOT\s+NULL|ALTER\s+TYPE[^;]*ADD\s+VALUE/i.test(t)) p.push(`${tag}: มี DROP/RENAME/SET NOT NULL/ADD VALUE`);
        if (/FOREIGN\s+KEY\s*\(\s*"(refSaleId|refLineId)"\s*\)/i.test(t)) p.push(`${tag}: มี FK บน refSaleId/refLineId`);
        if (/CREATE\s+(UNIQUE\s+)?INDEX[^;]*\(\s*"refSaleId"/i.test(t)) p.push(`${tag}: สร้าง index refSaleId (เลื่อนไป P6.1)`);
      }
    }
    chk("P1.8-S3", p.length === 0, "migration เพิ่มล้วน", p.join(" · ") || `ครบ (${files.length} ไฟล์)`);
  }
  // S4 permission
  {
    const permSrc = stripComments(rd("src/lib/core/permissions.ts"));
    const at = permSrc.search(/module:\s*["']pos["']/);
    const blk = at < 0 ? "" : permSrc.slice(at, permSrc.indexOf("}", permSrc.indexOf("actions", at)) + 1);
    chk("P1.8-S4", /"pos\.sale\.refund"\s*:/.test(blk) && /"pos\.sale\.void"\s*:/.test(blk), "pos.sale.refund ในโมดูล pos", /"pos\.sale\.refund"/.test(blk) ? "มี" : "ไม่มี pos.sale.refund");
  }
  // S5 consumer
  {
    const p: string[] = [];
    const ob = stripComments(rd("src/lib/outbox-consumers.ts"));
    const m = /["']pos\.sale\.refunded["']\s*:\s*([^\n]*)/.exec(ob);
    if (!m) p.push("ไม่มี consumer pos.sale.refunded");
    else if (!/withAutomation\s*\(/.test(m[1] ?? "")) p.push("pos.sale.refunded ไม่ครอบ withAutomation (บรรทัดเดียวกัน)");
    if (!existsSync(join(ROOT, REFUND_CONSUMER_FILE))) p.push(`ไม่มี ${REFUND_CONSUMER_FILE}`);
    chk("P1.8-S5", p.length === 0, "consumer + withAutomation + refund-consumer.ts", p.join(" · ") || "ครบ");
  }
  // S6 messages
  {
    const th = posMessages("th");
    const en = posMessages("en");
    const p: string[] = [];
    for (const [, k] of REFUSAL_KEYS) {
      const key = `pos.refund.errors.${k}`;
      const t = th.get(key);
      const e = en.get(key);
      if (typeof t !== "string" || !t.trim()) p.push(`${key}: th ขาด`);
      else if (!THAI.test(t)) p.push(`${key}: th ไม่มีอักษรไทย`);
      if (typeof e !== "string" || !e.trim()) p.push(`${key}: en ขาด`);
      else if (THAI.test(e)) p.push(`${key}: en มีอักษรไทย`);
    }
    chk("P1.8-S6", p.length === 0, `${REFUSAL_KEYS.length} คีย์ th+en`, p.slice(0, 6).join(" · ") + (p.length > 6 ? ` …(+${p.length - 6})` : "") || "ครบ");
  }
  // S7 actions
  {
    const p: string[] = [];
    const raw = rd(REFUND_ACT_FILE);
    const src = stripComments(raw);
    if (!raw) p.push(`ไม่มี ${REFUND_ACT_FILE}`);
    else {
      if (!/^\s*["']use server["']/.test(raw.replace(/^\s*(\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*/, ""))) p.push("ไม่มี \"use server\" บรรทัดแรก");
      const exps = [...src.matchAll(/^\s*export\b[^\n]*/gm)].map((m) => m[0].trim());
      const bad = exps.filter((x) => !/^export\s+async\s+function\s+\w+/.test(x));
      if (bad.length) p.push(`export ที่ไม่ใช่ async function (${bad.slice(0, 2).join(" | ").slice(0, 80)})`);
      if (/\bthrow\b/.test(src)) p.push("มี throw");
      for (const [a, f] of [["refundSaleAction", "refundSale"], ["saleForRefundAction", "saleForRefund"]] as [string, string][]) {
        const at = src.search(new RegExp(`export\\s+async\\s+function\\s+${a}\\b`));
        if (at < 0) {
          p.push(`ไม่มี ${a}`);
          continue;
        }
        const body = src.slice(at).split(/\n\s*export\s+/)[0] ?? "";
        if (!new RegExp(`\\b${f}\\s*\\(`).test(body)) p.push(`${a} ไม่เรียก ${f}`);
        if (!/\bcatch\b/.test(body)) p.push(`${a} ไม่มี catch`);
      }
      if (!/\brevalidatePath\s*\(/.test(src)) p.push("ไม่มี revalidatePath");
      if (!/\bunstable_rethrow\b/.test(src)) p.push("ไม่มี unstable_rethrow (session pattern)");
    }
    chk("P1.8-S7", p.length === 0, "use server · async ล้วน · ไม่ throw · 2 actions + catch · revalidatePath", p.join(" · ") || "ครบ");
  }
  // S8 wiring
  {
    const p: string[] = [];
    if (!refundSrc) p.push(`ไม่มี ${REFUND_FILE}`);
    else {
      for (const f of ["refundSale", "saleForRefund"]) if (!exportsFn(refundSrc, f)) p.push(`refund.ts ไม่ export ${f}`);
      if (!/FOR\s+UPDATE/i.test(refundSrc)) p.push("refund.ts ไม่มี FOR UPDATE (ล็อกบิลเดิม)");
      if (/posReceiptCounter/.test(refundSrc)) p.push("refund.ts แตะ posReceiptCounter (ตัวนับใบเสร็จขาย)");
      if (/invItem\.(update|updateMany|upsert)\s*\(/.test(refundSrc) || /\bonHand\s*:/.test(refundSrc)) p.push("refund.ts เขียน InvItem/onHand ตรง (C-1)");
    }
    const acc = stripComments(rd("src/lib/modules/account/index.ts"));
    if (!exportsFn(acc, "applyExternalRefund")) p.push("account/index ไม่ export applyExternalRefund");
    if (!exportsFn(stripComments(rd("src/lib/modules/point/lots.ts")), "reversePartialEarn")) p.push("point/lots ไม่ export reversePartialEarn");
    if (!/\breversePartialEarn\b/.test(stripComments(rd("src/lib/modules/point/index.ts")))) p.push("point facade (index.ts) ไม่ส่งออก reversePartialEarn");
    if (!exportsFn(stripComments(rd("src/lib/member-bridges.ts")), "onPosSaleRefunded")) p.push("member-bridges ไม่ export onPosSaleRefunded");
    const svc = stripComments(rd(SERVICE_FILE));
    if (!/export\s+async\s+function\s+createSale\s*\(\s*input:\s*CreateSaleInput\s*,\s*client:\s*Client\s*=\s*prisma\s*\)/.test(svc)) p.push("ลายเซ็น createSale เปลี่ยน");
    if (!/export\s+async\s+function\s+voidSale\s*\(\s*tenantId:\s*string\s*,\s*unitId:\s*string\s*,\s*saleId:\s*string\s*\)/.test(svc)) p.push("ลายเซ็น voidSale เปลี่ยน");
    chk("P1.8-S8", p.length === 0, "refund.ts + facade + point + member + ลายเซ็นเดิม", p.join(" · ") || "ครบ");
  }
  // S9 readers
  {
    const p: string[] = [];
    const svc = stripComments(rd(SERVICE_FILE));
    for (const fn of ["daySummary", "listSales", "closeDaySummary"]) {
      const at = svc.search(new RegExp(`export\\s+async\\s+function\\s+${fn}\\b`));
      const body = at < 0 ? "" : (svc.slice(at).split(/\nexport\s/)[0] ?? "");
      if (!/\bdocType\b/.test(body)) p.push(`service.ts ${fn} ไม่รู้จัก docType`);
    }
    const sh = stripComments(rd(SHIFT_FILE));
    for (const fn of ["computeReport", "offShiftCash"]) {
      const at = sh.search(new RegExp(`export\\s+async\\s+function\\s+${fn}\\b`));
      const body = at < 0 ? "" : (sh.slice(at).split(/\nexport\s/)[0] ?? "");
      if (!/\bdocType\b/.test(body)) p.push(`shift.ts ${fn} ไม่รู้จัก docType`);
    }
    if (!/\bdocType\b/.test(stripComments(rd(REPORTS_FILE)))) p.push("reports.ts ไม่รู้จัก docType");
    chk("P1.8-S9", p.length === 0, "ตัวอ่านขั้นต่ำรู้จัก docType", p.join(" · ") || "ครบ");
  }
}
const STATIC_IDS = ["S1", "S2", "S3", "S4", "S5", "S6", "S7", "S8", "S9"].map((x) => `P1.8-${x}`);

const skipReasons: string[] = [];
for (const f of ["refundSale", "saleForRefund"]) if (!exportsFn(refundSrc, f)) skipReasons.push(`${REFUND_FILE} ยังไม่มี export ${f}`);

// ═════════════════════════ 1b. --no-db ═════════════════════════
if (NODB) {
  console.log(`[${SUITE}] --no-db: รัน ${STATIC_IDS.length} ข้อสถิต (ไม่ผ่านด่าน SKIP · ข้ออื่นต้องใช้ DB)`);
  let crashedS = "";
  try {
    await runStatic();
  } catch (e) {
    crashedS = (e as Error)?.stack?.split("\n").slice(0, 3).join(" | ") ?? String(e);
    console.log(`💥 harness: ${crashedS}`);
  }
  for (const id of STATIC_IDS) if (!results.has(id)) chk(id, false, "ถูกตรวจ", crashedS ? `ไม่ถึง (harness ล้ม: ${crashedS.slice(0, 80)})` : "ไม่ถึง");
  const failedN = [...results.entries()].filter(([, r]) => !r.ok).map(([id]) => id);
  console.log(`\n===== ${SUITE} (--no-db) ===== ผ่าน ${results.size - failedN.length}/${results.size}`);
  console.log(`JSON_SUMMARY ${JSON.stringify({ suite: SUITE, mode: "no-db", total: results.size, passed: results.size - failedN.length, failed: failedN, skipped: false, registered: CHECKS.length, missing: skipReasons })}`);
  process.exit(failedN.length ? 1 : 0);
}

// ═════════════════════════ 2. env (QC4 เท่านั้น) ═════════════════════════
const envMod = (await import("./pos-qc-env.mjs" as string)) as Any;
envMod.loadPosQcEnv(SUITE);
const PQC = envMod.PQC as Any;
const TIDS = envMod.PQC_TENANT_IDS as string[];
function assertQc4BeforeWrite(): void {
  const mark = envMod.POS_QC_HOST_MARK as string;
  const bad = [["DATABASE_URL", process.env.DATABASE_URL ?? ""], ["DIRECT_URL", process.env.DIRECT_URL ?? ""]].filter(([n, u]) => (n === "DATABASE_URL" || u) && !u.includes(mark));
  if (bad.length) {
    console.error(`🔴 หยุด! ${SUITE}: จะเขียนแถวได้เฉพาะ QC4 (${mark}) — ${bad.map(([n]) => n).join(", ")} ไม่ใช่ (ยังไม่ได้เขียนอะไร)`);
    process.exit(4);
  }
}

// ═════════════════════════ 3. ด่าน SKIP (ตาราง/คอลัมน์ + ของ P1.8) ═════════════════════════
const { prisma } = (await import("@/lib/core/db" as string)) as Any;
const P = prisma as Any;
const prismaPkg = (await import("@prisma/client" as string)) as Any;
const DMMF = ((prismaPkg?.Prisma ?? prismaPkg?.default?.Prisma)?.dmmf?.datamodel ?? { models: [], enums: [] }) as { models: { name: string; fields: { name: string }[] }[] };
const dbCols = new Set<string>();
try {
  const rows = (await P.$queryRawUnsafe(
    `SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name IN ('PosSale','PosSaleLine','PosDocCounter')`,
  )) as Any[];
  for (const r of rows) dbCols.add(`${r.table_name}.${r.column_name}`);
} catch (e) {
  console.log(`  (อ่าน information_schema ไม่ได้: ${(e as Error).message.slice(0, 100)})`);
}
const clientHas = (model: string, field: string) => (DMMF.models.length ? !!DMMF.models.find((m) => m.name === model)?.fields.some((f) => f.name === field) : dbCols.has(`${model}.${field}`));
const hasField = (model: string, field: string) => clientHas(model, field) && dbCols.has(`${model}.${field}`);
for (const [m, f] of [["PosSale", "docType"], ["PosSale", "refSaleId"], ["PosSale", "refundedSatang"], ["PosSale", "reasonCode"], ["PosSaleLine", "refLineId"], ["PosSaleLine", "restock"]] as [string, string][]) {
  if (!hasField(m, f)) skipReasons.push(`${m}.${f} ยังไม่มี (client ${clientHas(m, f) ? "✓" : "✗"} · DB ${dbCols.has(`${m}.${f}`) ? "✓" : "✗"})`);
}
const PDC: Any = typeof P.posDocCounter?.findMany === "function" ? P.posDocCounter : null;
if (!PDC) skipReasons.push("Prisma client ยังไม่มี delegate posDocCounter (R4)");
let seedOk = false;
try {
  seedOk = !!(await envMod.resolvePosScope(prisma, "coffee"));
} catch (e) {
  console.log(`  (resolvePosScope ล้ม: ${(e as Error).message.slice(0, 120)})`);
}
if (!seedOk) skipReasons.push("ชุดข้อมูล QC POS (ร้านกาแฟ) ยังไม่ถูก seed — รัน scripts/seed-pos-qc.mts ก่อน (ใช้ userId เจ้าของ/แคชเชียร์)");

const COUNT_MODELS = [
  "posSale", "posSaleLine", "posPayment", "posReceiptCounter", "posDocCounter", "outboxEvent", "auditLog", "posShift", "couponRedemption",
  "pointLedger", "pointLot", "customer", "stampEvent", "invMovement", "accountDocument", "accountJournalEntry", "memberActivity",
] as const;
const FP_MODELS = ["posProduct", "appSystem", "appSystemUnit", "businessUnit", "membership", "posReceiptCounter", "customer"] as const;
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
      // BigInt (Customer.spent12mSatang) ทำ JSON.stringify ล้ม → แปลงเป็นข้อความก่อน
      out[m] = `${rows.length}:${createHash("sha256").update(JSON.stringify(rows, (_k, v) => (typeof v === "bigint" ? v.toString() : v))).digest("hex").slice(0, 16)}`;
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
  }
  return out;
}
const countsBefore = await snapshotCounts();

if (skipReasons.length > 0 && !FORCE) {
  console.log(`⏭️  SKIPPED — ${SUITE}: ของใบ P1.8 ยังไม่มี (ถูกต้องสำหรับข้อสอบที่เขียนก่อนสร้าง)`);
  for (const r of skipReasons) console.log(`   • ${r}`);
  console.log(`   ข้อมูล: seed ร้านกาแฟ ${seedOk ? "มี" : "ไม่มี"} · ข้อสอบ ${CHECKS.length} ข้อ (ดู --list) · QC_FORCE=1 = รันทั้งที่ยังไม่มีของ (ต้องแดงตามเหตุผล)`);
  console.log(`JSON_SUMMARY ${JSON.stringify({ suite: SUITE, total: 0, passed: 0, failed: [], skipped: true, reason: skipReasons, registered: CHECKS.length, seed: seedOk })}`);
  await P.$disconnect?.().catch?.(() => {});
  process.exit(0);
}
if (FORCE && skipReasons.length) console.log(`⚠️  QC_FORCE=1 — ข้ามด่าน SKIP ทั้งที่ยังขาด ${skipReasons.length} อย่าง (คาด: แดงตามเหตุผล ไม่ crash)`);
const fpBefore = await fingerprint();

// ═════════════════════════ 4. โหลดโมดูล ═════════════════════════
const refundMod = existsSync(join(ROOT, REFUND_FILE)) ? await tryImport("@/lib/modules/pos/refund") : null;
const svc = await tryImport("@/lib/modules/pos/service");
const shiftMod = await tryImport("@/lib/modules/pos/shift");
const reportsMod = await tryImport("@/lib/modules/pos/reports");
const overviewMod = await tryImport("@/lib/modules/pos/report-overview");
const sysSvc = await tryImport("@/lib/modules/system/service");
const accSvc = await tryImport("@/lib/modules/account/service");
const accIdx = await tryImport("@/lib/modules/account");
const glMod = await tryImport("@/lib/modules/account/gl");
const invSvc = await tryImport("@/lib/modules/inventory/service");
const couponSvc = await tryImport("@/lib/modules/coupon/service");
const pointMod = await tryImport("@/lib/modules/point");
const vatMod = await tryImport("@/lib/money/vat");
const consMod = await tryImport("@/lib/outbox-consumers");

const RAND = Math.random().toString(36).slice(2, 8);
const TAG = `qc-p1.8-${RAND}`;
const T_SLUG = `qc-p18-${RAND}`;
const HOUR = 3_600_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const vatOf = (gross: number, bp: number): number => {
  const r = callSync(vatMod, "splitIncludedVat", gross, bp);
  return typeof r?.vatSatang === "number" ? r.vatSatang : NaN;
};
let T = ""; // ร้านชั่วคราว (Tenant.id)

const lanes: Any[] = [];
async function lane(i: number): Promise<Any> {
  if (lanes[i]) return lanes[i];
  const { PrismaClient } = (await import("@prisma/client" as string)) as Any;
  const { PrismaPg } = (await import("@prisma/adapter-pg" as string)) as Any;
  while (lanes.length <= i) lanes.push(new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL, max: 2 }) }));
  return lanes[i];
}
async function drain(): Promise<void> {
  for (let i = 0; i < 2; i++) {
    try {
      if (typeof consMod?.drainAll === "function") await consMod.drainAll();
    } catch (e) {
      console.log(`  (drainAll ล้ม: ${(e as Error).message.slice(0, 100)})`);
    }
  }
}

// ═════════════════════════ 5. ข้อที่ต้องมี DB ═════════════════════════
const DB_IDS = CHECKS.map(([id]) => id).filter((id) => !STATIC_IDS.includes(id) && id !== "P1.8-Z1" && id !== "P1.8-Z2");

async function runDb() {
  if (!seedOk) {
    for (const id of DB_IDS) chk(id, false, "seed ร้าน QC POS", "ยังไม่ได้ seed (scripts/seed-pos-qc.mts) — ข้อ DB ตรวจไม่ได้");
    return;
  }
  // ─── ร้านชั่วคราว (เขียนแถวแรก ⇒ ด่าน host QC4 ก่อน) ───
  assertQc4BeforeWrite();
  console.log(`\n── ร้านชั่วคราว ${T_SLUG} (POS-A ผูกสมุดจด VAT + คลัง/สมาชิก/แต้ม/คูปอง · POS-N ไม่ผูกสมุด · POS-P prefix RF) ──`);
  let fx = "";
  const S: Record<string, string> = {}; // id ของระบบ
  const U: Record<string, string> = {}; // id ของสาขา
  const ownerId: string = PQC.coffee.users.owner.userId;
  const cashierId: string = PQC.coffee.users.cashier.userId;
  const mgrId: string = PQC.resto.users.owner.userId;
  try {
    const t = await P.tenant.create({ data: { name: `QC P1.8 คืนเงิน ${RAND}`, slug: T_SLUG } });
    T = t.id;
    for (const k of ["A", "B", "S", "R", "Q", "Q2", "N", "P"]) {
      const u = await P.businessUnit.create({ data: { tenantId: T, type: "SHOP", name: `${TAG} ${k}`, slug: `${T_SLUG}-${k.toLowerCase()}` } });
      U[k] = u.id;
    }
    S.POSA = (await sysSvc.createSystem(T, "POS", "POS-A (ผูกบัญชี)")).id;
    S.POSN = (await sysSvc.createSystem(T, "POS", "POS-N (ไม่ผูกบัญชี)")).id;
    S.POSP = (await sysSvc.createSystem(T, "POS", "POS-P (prefix RF)")).id;
    S.ACC = (await sysSvc.createSystem(T, "ACCOUNT", "บัญชี QC P1.8")).id;
    S.INV = (await sysSvc.createSystem(T, "INVENTORY", "คลัง QC P1.8")).id;
    S.MEM = (await sysSvc.createSystem(T, "MEMBER", "สมาชิก QC P1.8")).id;
    S.PTS = (await sysSvc.createSystem(T, "POINT", "แต้ม QC P1.8")).id;
    S.CPN = (await sysSvc.createSystem(T, "COUPON", "คูปอง QC P1.8")).id;
    await accSvc.saveSettings(T, S.ACC, { orgName: "ร้านคืนเงินคิวซี จำกัด", taxId: "0105561177639", vatRegistered: true });
    await glMod.ensureAccounting({ tenantId: T, systemId: S.ACC });
    await P.accountSystemLink.create({ data: { tenantId: T, systemId: S.ACC, linkedKind: "POS", linkedId: S.POSA } });
    for (const k of ["A", "B", "S", "R", "Q", "Q2"]) await sysSvc.linkUnit(T, S.POSA, U[k]);
    await sysSvc.linkUnit(T, S.POSN, U.N);
    await sysSvc.linkUnit(T, S.POSP, U.P);
    for (const s of ["INV", "MEM", "PTS", "CPN"]) await sysSvc.linkUnit(T, S[s], U.A);
    await P.appSystem.update({ where: { id: S.POSP }, data: { settings: { pos: { receipt: { refundPrefix: "RF" } } } } });
    await P.pointSettings.upsert({ where: { tenantId: T }, create: { tenantId: T, satangPerPoint: 1000 }, update: { satangPerPoint: 1000 } });
  } catch (e) {
    fx = `ร้านชั่วคราว:${(e as Error).message.slice(0, 160)}`;
    console.log(`  ⚠️  ${fx}`);
  }
  const FX = (s: string) => (fx ? `fixture:${fx} · ` : "") + s;
  const allUnits = () => Object.values(U);
  const owner = { userId: ownerId, role: "OWNER", unitAccess: ["*"], permissions: {} };
  const manager = () => ({ userId: mgrId, role: "MANAGER", unitAccess: allUnits(), permissions: {} });
  const cashier = () => ({ userId: cashierId, role: "STAFF", unitAccess: allUnits(), permissions: { ...(PQC.cashierPermissions ?? {}), "pos.sale.create": true, "pos.sale.void": true, "pos.shift.operate": true } });
  const staffRefund = () => ({ ...cashier(), permissions: { ...cashier().permissions, "pos.sale.refund": true } });
  const ctxOf = (k: string, deviceId?: string): Any => ({ tenantId: T, systemId: k === "N" ? S.POSN : k === "P" ? S.POSP : S.POSA, unitId: U[k], ...(deviceId ? { deviceId } : {}) });

  // ─── ทางเรียก ───
  let keyN = 0;
  const newKey = (p = "r") => `${TAG}-${p}-${++keyN}`;
  const refusals: [string, Any, string][] = [];
  const asData = (label: string, r: Any, code: string) => {
    refusals.push([label, r, code]);
    return r;
  };
  type LineReq = [string, number, boolean?];
  const rin = (saleId: string, lines: LineReq[], pay: [string, number][], extra: Any = {}): Any => ({
    saleId,
    lines: lines.map(([lineId, qty, restock]) => ({ lineId, qty, ...(restock !== undefined ? { restock } : {}) })),
    payMethods: pay.map(([type, amountSatang]) => ({ type, amountSatang })),
    reasonCode: "CHANGED_MIND",
    reason: "ลูกค้าเปลี่ยนใจ",
    idempotencyKey: newKey(),
    ...extra,
  });
  const refund = async (c: Any, a: Any, input: Any, cl?: Any): Promise<Any> => (cl ? call(refundMod, "refundSale", c, a, input, cl) : call(refundMod, "refundSale", c, a, input));
  const rid = (r: Any): string => (r?.ok === true && typeof r.refund?.id === "string" ? r.refund.id : "");
  const row = async (id: string): Promise<Any> => (id ? P.posSale.findUnique({ where: { id }, include: { lines: true, payments: true } }).catch(() => null) : null);
  const refundsOf = async (saleId: string): Promise<number> => (saleId ? P.posSale.count({ where: { refSaleId: saleId } }).catch(() => NaN) : NaN);
  const docSeq = async (unitId: string, docType = "REFUND"): Promise<number> =>
    PDC ? ((await PDC.findMany({ where: { unitId, docType } }).catch(() => [])) as Any[]).reduce((t: number, x: Any) => t + Number(x.seq), 0) : NaN;
  const receiptSeq = async (unitId: string): Promise<number> => ((await P.posReceiptCounter.findMany({ where: { unitId } }).catch(() => [])) as Any[]).reduce((t: number, x: Any) => t + Number(x.seq), 0);

  /** บิลขายผ่าน createSale เดิม (ผู้เรียกเดิม · คืน id บรรทัดตามชื่อ) */
  const sale = async (k: string, lines: Any[], pay: [string, number][] | Any[], extra: Any = {}): Promise<{ id: string; r: Any; L: Record<string, string>; receiptNo: string; key: string }> => {
    const key = `${TAG}-s-${++keyN}`;
    const payMethods = (pay as Any[]).map((p: Any) => (Array.isArray(p) ? { type: p[0], amountSatang: p[1] } : p));
    const input: Any = { tenantId: T, unitId: U[k], systemId: k === "N" ? S.POSN : k === "P" ? S.POSP : S.POSA, sourceModule: "POS", idempotencyKey: key, lines, payMethods, ...extra };
    const r = fx ? { ok: false, code: "FIXTURE" } : await call(svc, "createSale", input);
    const id = typeof r?.saleId === "string" ? r.saleId : "";
    const L: Record<string, string> = {};
    if (id) for (const l of (await P.posSaleLine.findMany({ where: { saleId: id } })) as Any[]) L[l.name] = l.id;
    if (!id) console.log(`  ⚠️  fixture sale ${k} ล้ม: ${codeOf(r)} ${short(r?.message ?? "", 120)}`);
    return { id, r, L, receiptNo: typeof r?.receiptNo === "string" ? r.receiptNo : "", key };
  };
  const one = (name: string, price: number, qty = 1, extra: Any = {}) => ({ name, qty, unitPriceSatang: price, ...extra });

  // ─── ของในคลัง (สาขา A) ───
  const invCtx = () => ({ tenantId: T, systemId: S.INV, actorUserId: ownerId });
  const I: Record<string, string> = {};
  if (!fx) {
    try {
      for (const [k, name, cost, stock] of [["I1", "นมสด P1.8", 1000, 20], ["C1", "แก้ว P1.8", 300, 20], ["C2", "ฝา P1.8", 200, 20], ["G", "กาแฟคั่ว P1.8 (กรัม)", 5, 5000]] as [string, string, number, number][]) {
        const it = await invSvc.createItem(invCtx(), { sku: `${T_SLUG}-${k}`, name, costSatang: cost, kind: "PRODUCT" });
        I[k] = it.id;
        await invSvc.receive(invCtx(), { itemId: it.id, qty: stock, costSatang: cost, idempotencyKey: `${TAG}-recv-${k}`, sourceModule: "QC", note: "QC P1.8 รับเข้าตั้งต้น" });
      }
    } catch (e) {
      fx = `คลัง:${(e as Error).message.slice(0, 120)}`;
    }
  }
  // ─── สมาชิก · แต้ม · สแตมป์ · คูปอง ───
  let C1 = "", C2 = "", CPN_CODE = "", preloadLot = "";
  if (!fx) {
    try {
      C1 = (await P.customer.create({ data: { tenantId: T, memberSystemId: S.MEM, name: "สมาชิกคืนเงิน QC", phone: "0899180001" } })).id;
      C2 = (await P.customer.create({ data: { tenantId: T, memberSystemId: S.MEM, name: "สมาชิกใช้แต้ม QC", phone: "0899180002" } })).id;
      await P.stampCard.create({ data: { tenantId: T, systemId: S.MEM, name: "สะสมตรา QC P1.8", slots: 10, ruleKind: "PER_SALE_MIN", ruleConfig: { minSatang: 1000, allowAutoFromSale: true, perDayMax: 5 }, rewardKind: "POINTS", rewardConfig: { points: 10 } } });
      CPN_CODE = `QC18${RAND}`.toUpperCase();
      const cp = await couponSvc.createCoupon({ tenantId: T, systemId: S.CPN, code: CPN_CODE, name: "ลด 15 บาท QC P1.8", type: "FIXED", valueSatang: 1500 });
      if (!cp?.ok) throw new Error(`คูปอง ${short(cp)}`);
      const e = await pointMod.earnWithLot({ tenantId: T, systemId: S.PTS, memberSystemId: S.MEM, actorUserId: null }, { customerId: C2, points: 500, refType: "QC", refId: TAG, idempotencyKey: `${TAG}-preload`, reason: "QC P1.8 แต้มตั้งต้น" });
      preloadLot = e?.lotId ?? "";
    } catch (e) {
      fx = `สมาชิก:${(e as Error).message.slice(0, 120)}`;
    }
  }

  // ═════ บิลตั้งต้น ═════
  // M: สมาชิก C1 · ฿620 เงินสด (แต้ม 62 · ตรา 1 · ยอดสะสม 62,000 · ABB)
  const M = await sale("A", [one("ลาเต้ M", 8500, 2), one("เค้กชุด M", 45000)], [["CASH", 62000]], { memberId: C1, memberSystemId: S.MEM });
  // X: ส่วนลดบรรทัด + ท้ายบิล + คูปอง + ค่าบริการ (+ ทิป 500 แก้แถวตรง)
  const X = await sale("A", [one("เสื้อ X", 10000, 3, { discountSatang: 999 }), one("หมวก X", 7500, 2), one("ถุงผ้า X", 3333)], [["CASH", 48217]], {
    billDiscountSatang: 2000, couponSystemId: S.CPN, couponCode: CPN_CODE, serviceChargeSatang: 4383,
  });
  if (X.id) {
    try {
      await P.posSale.update({ where: { id: X.id }, data: { tipSatang: 500 } });
      await P.posPayment.updateMany({ where: { saleId: X.id, type: "CASH" }, data: { amountSatang: 48717 } });
    } catch (e) {
      console.log(`  ⚠️  ใส่ทิปบิล X ไม่ได้: ${(e as Error).message.slice(0, 80)}`);
    }
  }
  // C2b: สมาชิก C2 ใช้ 200 แต้ม (= ฿20) แลกส่วนลด
  const B2 = await sale("A", [one("ชา C2", 10000), one("ขนม C2", 20000)], [["CASH", 28000]], { memberId: C2, memberSystemId: S.MEM, memberChoices: { points: 200 } });
  // V: คลัง (บรรทัดสินค้า · ชุด · ชั่ง)
  const V = await sale("A", [
    one("นม V", 5000, 2, { itemId: I.I1 }),
    one("ชุดแก้ว V", 4000, 2, { components: [{ invItemId: I.C1, qty: 2 }, { invItemId: I.C2, qty: 1 }] }),
    one("กาแฟชั่ง V", 3500, 1, { itemId: I.G, weightGrams: 350 }),
  ], [["CASH", 21500]]);
  // N: POS ไม่ผูกสมุด
  const NB = await sale("N", [one("ของ N", 10700)], [["CASH", 10700]]);
  await drain();
  // ราคาทุนเปลี่ยนหลังขาย (O12: คืนที่ต้นทุนเดิม ไม่ใช่ถัวเฉลี่ยใหม่)
  if (!fx) {
    try {
      for (const [k, qty, cost] of [["I1", 10, 3000], ["C1", 10, 900], ["C2", 10, 800], ["G", 1000, 20]] as [string, number, number][]) {
        await invSvc.receive(invCtx(), { itemId: I[k], qty, costSatang: cost, idempotencyKey: `${TAG}-recv2-${k}`, sourceModule: "QC", note: "QC P1.8 ราคาทุนเปลี่ยน" });
      }
    } catch (e) {
      console.log(`  ⚠️  รับเข้ารอบสองไม่ได้: ${(e as Error).message.slice(0, 80)}`);
    }
  }

  // ════════ N1 เลข CN (ใบแรกของสาขา Q) · สาขา B · ตัวนับใบเสร็จขาย ════════
  const qN1 = await sale("Q", [one("ของ qN1", 5000, 2)], [["CASH", 10000]]);
  const qB = await sale("B", [one("ของ qB", 4000)], [["CASH", 4000]]);
  const period = (qN1.receiptNo.split("-")[0] ?? "").trim();
  {
    const p: string[] = [];
    const rcBefore = await receiptSeq(U.Q);
    const r1 = await refund(ctxOf("Q"), owner, rin(qN1.id, [[qN1.L["ของ qN1"], 1]], [["CASH", 5000]]));
    const rB = await refund(ctxOf("B"), owner, rin(qB.id, [[qB.L["ของ qB"], 1]], [["CASH", 4000]]));
    const r1row = await row(rid(r1));
    const rBrow = await row(rid(rB));
    if (!/^\d{6}$/.test(period)) p.push(`period จากบิลขาย ${short(qN1.receiptNo, 20)}`);
    if (!rid(r1)) p.push(`คืน Q ${codeOf(r1)} ${short(r1?.message ?? "", 60)}`);
    else if (r1row?.receiptNo !== `CN${period}-0001`) p.push(`เลข Q ${short(r1row?.receiptNo, 20)} (คาด CN${period}-0001)`);
    if (rid(r1) && r1?.refund?.receiptNo !== r1row?.receiptNo) p.push("refund.receiptNo ไม่ตรงแถว");
    if (!rid(rB)) p.push(`คืน B ${codeOf(rB)}`);
    else if (rBrow?.receiptNo !== `CN${period}-0001`) p.push(`เลข B ${short(rBrow?.receiptNo, 20)} (สาขาอื่นต้องเริ่ม 0001)`);
    const ctr = PDC ? ((await PDC.findMany({ where: { unitId: U.Q } }).catch(() => [])) as Any[]) : [];
    const refundCtr = ctr.find((c: Any) => c.docType === "REFUND" && c.period === period);
    if (!refundCtr || Number(refundCtr.seq) !== 1 || refundCtr.tenantId !== T) p.push(`PosDocCounter(Q,REFUND,${period}) ${short(refundCtr ?? null, 80)}`);
    if (ctr.some((c: Any) => c.docType === "SALE")) p.push("มีแถว SALE ใน PosDocCounter (การย้ายตัวนับขายเลื่อนไป P1.10/P6.1)");
    const rcAfter = await receiptSeq(U.Q);
    if (rcAfter !== rcBefore) p.push(`PosReceiptCounter ขยับ ${rcBefore}→${rcAfter}`);
    const after = await sale("Q", [one("ของหลังคืน", 1000)], [["CASH", 1000]]);
    if (after.receiptNo !== `${period}-${String(rcBefore + 1).padStart(4, "0")}`) p.push(`บิลขายถัดไป ${short(after.receiptNo, 20)} (คาด ${period}-${String(rcBefore + 1).padStart(4, "0")})`);
    chk("P1.8-N1", p.length === 0, `CN${period}-0001 ต่อสาขา · ตัวนับขายเดิม`, FX(p.join(" · ") || "ครบ"));
  }
  // ════════ N2 prefix ════════
  {
    const b = await sale("P", [one("ของ P", 4000)], [["CASH", 4000]]);
    const r = await refund(ctxOf("P"), owner, rin(b.id, [[b.L["ของ P"], 1]], [["CASH", 4000]]));
    const rr = await row(rid(r));
    const per = b.receiptNo.split("-")[0] ?? "";
    chk("P1.8-N2", rr?.receiptNo === `RF${per}-0001`, `RF${per}-0001`, FX(rid(r) ? short(rr?.receiptNo, 20) : `${codeOf(r)} ${short(r?.message ?? "", 60)}`));
  }

  // ════════ A1/A2/A3/A7/C11 บิล X ════════
  const xs = X.id ? await row(X.id) : null;
  const xNames = ["เสื้อ X", "หมวก X", "ถุงผ้า X"];
  const xLines: Any[] = xNames.map((n) => (xs?.lines ?? []).find((l: Any) => l.name === n)).filter(Boolean);
  const xSC = Number(xs?.serviceChargeSatang ?? 0);
  const xGrand = Number(xs?.grandTotalSatang ?? 0);
  const xD = sum(xLines.map((l: Any) => l.lineTotalSatang)) + xSC - xGrand;
  const xAlloc = allocLR(xLines.map((l: Any) => Math.max(0, l.lineTotalSatang)), xD);
  const xNet: Record<string, number> = {};
  xLines.forEach((l: Any, i: number) => (xNet[l.id] = l.lineTotalSatang - xAlloc[i]!));
  const xNetTotal = sum(Object.values(xNet));
  const xQty: Record<string, number> = Object.fromEntries(xLines.map((l: Any) => [l.id, l.qty]));
  const doneQty: Record<string, number> = {};
  const doneAmt: Record<string, number> = {};
  let doneSc = 0;
  /** ยอดที่คาดของใบคืน (สูตรมติ R5) — ไม่บันทึกสถานะ */
  const expectX = (req: [string, number][]) => {
    const lines = req.map(([id, q]) => {
      const last = (doneQty[id] ?? 0) + q === xQty[id];
      return { id, q, amt: last ? xNet[id]! - (doneAmt[id] ?? 0) : hu(xNet[id]! * q, xQty[id]!) };
    });
    const linesSum = sum(lines.map((l) => l.amt));
    const full = Object.keys(xQty).every((id) => (doneQty[id] ?? 0) + (req.find(([x]) => x === id)?.[1] ?? 0) === xQty[id]);
    const sc = full ? xSC - doneSc : hu(xSC * linesSum, xNetTotal);
    return { lines, sc, grand: linesSum + sc, full };
  };
  const commitX = (e: ReturnType<typeof expectX>) => {
    for (const l of e.lines) {
      doneQty[l.id] = (doneQty[l.id] ?? 0) + l.q;
      doneAmt[l.id] = (doneAmt[l.id] ?? 0) + l.amt;
    }
    doneSc += e.sc;
  };
  const cpnStatus = async (saleId: string): Promise<string> =>
    saleId ? ((await P.couponRedemption.findMany({ where: { tenantId: T, refType: "PosSale", refId: saleId } }).catch(() => [])) as Any[]).map((x: Any) => x.status).sort().join(",") : "";
  const [xl1, xl2, xl3] = [X.L["เสื้อ X"] ?? "", X.L["หมวก X"] ?? "", X.L["ถุงผ้า X"] ?? ""];
  const fxX = !X.id || xLines.length !== 3 ? `บิล X ${codeOf(X.r)} ${short(X.r?.message ?? "", 80)}` : "";
  console.log(`  บิล X: grand ${xGrand} · SC ${xSC} · D ${xD} · net ${short(Object.values(xNet))} · tip ${xs?.tipSatang}`);
  const xRefunds: string[] = [];
  const xGrands: number[] = [];
  const sale7: Any[] = [];
  const cpn: string[] = [await cpnStatus(X.id)];
  // RX1 = เสื้อ×1 + หมวก×1
  const e1 = expectX([[xl1, 1], [xl2, 1]]);
  const rx1 = await refund(ctxOf("A"), owner, rin(X.id, [[xl1, 1], [xl2, 1]], [["CASH", e1.grand]], { reasonCode: "WRONG_ITEM", reason: "ไซซ์ไม่พอดี" }));
  if (rid(rx1)) {
    commitX(e1);
    xRefunds.push(rid(rx1));
    xGrands.push(e1.grand);
  }
  sale7.push(await row(X.id));
  cpn.push(await cpnStatus(X.id));
  {
    const p: string[] = [];
    const r = await row(rid(rx1));
    if (fxX) p.push(fxX);
    if (!r) p.push(`refundSale ${codeOf(rx1)} ${short(rx1?.message ?? "", 80)}`);
    else {
      if (r.docType !== "REFUND") p.push(`docType ${r.docType}`);
      if (r.refSaleId !== X.id) p.push("refSaleId ผิด");
      if (r.status !== "PAID") p.push(`status ${r.status}`);
      if (r.tenantId !== T || r.unitId !== U.A || r.systemId !== S.POSA) p.push("ร้าน/สาขา/ระบบ ผิด");
      if (r.soldByUserId !== ownerId) p.push(`soldByUserId ${r.soldByUserId}`);
      if (r.note !== "ไซซ์ไม่พอดี") p.push(`note ${short(r.note, 30)}`);
      if (r.reasonCode !== "WRONG_ITEM") p.push(`reasonCode ${r.reasonCode}`);
      if (r.tipSatang !== 0) p.push(`tip ${r.tipSatang}`);
      if (r.serviceChargeSatang !== e1.sc) p.push(`SC ${r.serviceChargeSatang} (คาด ${e1.sc})`);
      if (r.grandTotalSatang !== e1.grand) p.push(`grand ${r.grandTotalSatang} (คาด ${e1.grand})`);
      if (r.subtotalSatang - r.discountSatang + r.serviceChargeSatang !== r.grandTotalSatang) p.push("subtotal − discount + SC ≠ grand");
      if (!/^CN\d{6}-\d{4}$/.test(String(r.receiptNo))) p.push(`receiptNo ${short(r.receiptNo, 20)}`);
      const ls = (r.lines ?? []) as Any[];
      if (ls.length !== 2) p.push(`บรรทัด ${ls.length}`);
      for (const l of e1.lines) {
        const got = ls.find((x: Any) => x.refLineId === l.id);
        if (!got) p.push(`ไม่มีบรรทัด refLineId ${l.id.slice(-6)}`);
        else {
          if (got.qty !== l.q || got.lineTotalSatang !== l.amt) p.push(`บรรทัด ${got.name}: qty ${got.qty} total ${got.lineTotalSatang} (คาด ${l.q}/${l.amt})`);
          if (got.unitPriceSatang * got.qty - got.discountSatang !== got.lineTotalSatang) p.push(`บรรทัด ${got.name} ราคา×จำนวน−ส่วนลด ≠ total`);
        }
      }
      const pays = (r.payments ?? []) as Any[];
      if (!(pays.length === 1 && pays[0].type === "CASH" && pays[0].amountSatang === e1.grand)) p.push(`จ่าย ${short(pays.map((x: Any) => `${x.type}:${x.amountSatang}`))}`);
      if (rx1?.refund?.receiptNo !== r.receiptNo) p.push("ผล refund.receiptNo ไม่ตรง");
      if (!(rx1?.sale?.status === "PAID" && rx1?.sale?.refundedSatang === e1.grand)) p.push(`ผล sale ${short(rx1?.sale)}`);
    }
    chk("P1.8-A1", p.length === 0, `ใบ REFUND ครบ · บรรทัด ${short(e1.lines.map((l) => l.amt))} · SC ${e1.sc} · grand ${e1.grand}`, p.join(" · ") || "ครบ");
  }
  // Q1 (บิล X หลัง RX1) — เก็บไว้ตรวจรวมท้าย
  const q1x = await call(refundMod, "saleForRefund", ctxOf("A"), owner, { saleId: X.id });
  // RX2 = เสื้อ×1 · RX3 = ที่เหลือทั้งหมด
  const e2 = expectX([[xl1, 1]]);
  const rx2 = await refund(ctxOf("A"), owner, rin(X.id, [[xl1, 1]], [["CASH", e2.grand]]));
  if (rid(rx2)) {
    commitX(e2);
    xRefunds.push(rid(rx2));
    xGrands.push(e2.grand);
  }
  sale7.push(await row(X.id));
  cpn.push(await cpnStatus(X.id));
  const e3 = expectX([[xl1, 1], [xl2, 1], [xl3, 1]]);
  const rx3 = await refund(ctxOf("A"), owner, rin(X.id, [[xl1, 1], [xl2, 1], [xl3, 1]], [["CASH", e3.grand]]));
  if (rid(rx3)) {
    commitX(e3);
    xRefunds.push(rid(rx3));
    xGrands.push(e3.grand);
  }
  sale7.push(await row(X.id));
  cpn.push(await cpnStatus(X.id));
  const xRows = await Promise.all(xRefunds.map((id) => row(id)));
  {
    const p: string[] = [];
    if (fxX) p.push(fxX);
    if (!rid(rx2) || !rid(rx3)) p.push(`RX2 ${codeOf(rx2)} · RX3 ${codeOf(rx3)} ${short(rx3?.message ?? rx2?.message ?? "", 60)}`);
    const per: Record<string, number[]> = {};
    for (const r of xRows) for (const l of (r?.lines ?? []) as Any[]) (per[l.refLineId] ??= []).push(l.lineTotalSatang);
    const n1 = xNet[xl1] ?? 0;
    const q = Math.floor(n1 / 3);
    if (short(per[xl1] ?? []) !== short([q, q, n1 - 2 * q])) p.push(`เสื้อ ${short(per[xl1] ?? [])} (คาด ${short([q, q, n1 - 2 * q])})`);
    const n2 = xNet[xl2] ?? 0;
    if (short(per[xl2] ?? []) !== short([hu(n2, 2), n2 - hu(n2, 2)])) p.push(`หมวก ${short(per[xl2] ?? [])} (คาด ${short([hu(n2, 2), n2 - hu(n2, 2)])})`);
    for (const id of [xl1, xl2, xl3]) if (sum(per[id] ?? []) !== xNet[id]) p.push(`Σ บรรทัด ${id.slice(-6)} = ${sum(per[id] ?? [])} ≠ net ${xNet[id]}`);
    chk("P1.8-A2", p.length === 0 && n1 % 3 === 1 && n2 % 2 === 1, `เสื้อ ${short([q, q, n1 - 2 * q])} · หมวก ${short([hu(n2, 2), n2 - hu(n2, 2)])}`, p.join(" · ") || `ครบ (net ${n1}/${n2})`);
  }
  {
    const p: string[] = [];
    if (fxX) p.push(fxX);
    if (xRows.length !== 3 || xRows.some((r) => !r)) p.push(`ใบคืน ${xRows.filter(Boolean).length}/3`);
    else {
      const r3 = xRows[2];
      if (r3.serviceChargeSatang !== e3.sc) p.push(`SC ใบสุดท้าย ${r3.serviceChargeSatang} (คาด ${e3.sc} = ส่วนที่เหลือ)`);
      if (sum(xRows.map((r: Any) => r.serviceChargeSatang)) !== xSC) p.push(`Σ SC ${sum(xRows.map((r: Any) => r.serviceChargeSatang))} ≠ ${xSC}`);
      if (sum(xRows.map((r: Any) => r.grandTotalSatang)) !== xGrand) p.push(`Σ grand ${sum(xRows.map((r: Any) => r.grandTotalSatang))} ≠ ${xGrand}`);
      if (xRows.some((r: Any) => r.tipSatang !== 0)) p.push("ใบคืนมีทิป");
      const paid = sum(xRows.flatMap((r: Any) => (r.payments ?? []).map((x: Any) => x.amountSatang)));
      if (paid !== xGrand) p.push(`Σ เงินคืน ${paid} (คาด ${xGrand} · ทิป ${xs?.tipSatang} ไม่คืน)`);
    }
    chk("P1.8-A3", p.length === 0 && xs?.tipSatang === 500, `Σ grand ${xGrand} · Σ SC ${xSC} · ทิปไม่คืน`, p.join(" · ") || `ครบ (tip บิล ${xs?.tipSatang})`);
  }
  {
    const p: string[] = [];
    const want = [[xGrands[0], "PAID"], [(xGrands[0] ?? 0) + (xGrands[1] ?? 0), "PAID"], [xGrand, "REFUNDED"]] as [number, string][];
    sale7.forEach((s: Any, i: number) => {
      if (!(s?.refundedSatang === want[i]![0] && s?.status === want[i]![1])) p.push(`หลังใบ ${i + 1}: refunded ${s?.refundedSatang} status ${s?.status} (คาด ${want[i]![0]} ${want[i]![1]})`);
    });
    chk("P1.8-A7", p.length === 0 && xGrands.length === 3, "17,488 PAID → 27,335 PAID → 48,217 REFUNDED", FX(p.join(" · ") || "ครบ"));
  }
  chk("P1.8-C11", cpn[0] === "REDEEMED" && cpn[1] === "REDEEMED" && cpn[2] === "REDEEMED" && cpn[3] === "RELEASED" && xGrands.length === 3,
    "ก่อน REDEEMED · บางส่วน REDEEMED ×2 · ครบ RELEASED", FX(`${cpn.join(" → ")} (ใบคืน ${xGrands.length})`));

  // ════════ A5 PAYMENT_MISMATCH + แบ่งคืน ════════
  {
    const p: string[] = [];
    const b = await sale("Q", [one("ของ qPay", 5000, 2)], [["CASH", 10000]]);
    const l = b.L["ของ qPay"] ?? "";
    const seq0 = await docSeq(U.Q);
    for (const amt of [4999, 5001]) {
      const r = asData(`PAYMENT_MISMATCH ${amt}`, await refund(ctxOf("Q"), owner, rin(b.id, [[l, 1]], [["CASH", amt]])), "PAYMENT_MISMATCH");
      if (!refused(r, ["PAYMENT_MISMATCH"])) p.push(`จ่าย ${amt} → ${codeOf(r)}`);
    }
    if ((await refundsOf(b.id)) !== 0 || (await docSeq(U.Q)) !== seq0) p.push(`มีใบ/เลขเกิด (ใบ ${await refundsOf(b.id)} seq ${seq0}→${await docSeq(U.Q)})`);
    const ok = await refund(ctxOf("Q"), owner, rin(b.id, [[l, 1]], [["CASH", 2000], ["TRANSFER", 3000]]));
    const r = await row(rid(ok));
    const got = ((r?.payments ?? []) as Any[]).map((x: Any) => `${x.type}:${x.amountSatang}`).sort().join(",");
    if (got !== "CASH:2000,TRANSFER:3000") p.push(`แบ่งคืน ${codeOf(ok)} ${got}`);
    chk("P1.8-A5", p.length === 0, "±1 = PAYMENT_MISMATCH ไม่มีใบ · CASH 2,000 + TRANSFER 3,000 ok", FX(p.join(" · ") || "ครบ"));
  }

  // ════════ A6 บรรทัดชั่ง + ชุด · RV1/RV2 (C9 ตรวจหลังระบายคิว) ════════
  const vNames = { I1: V.L["นม V"] ?? "", B: V.L["ชุดแก้ว V"] ?? "", G: V.L["กาแฟชั่ง V"] ?? "" };
  let rv1 = "", rv2 = "";
  const onHand0: Record<string, number> = {};
  {
    const p: string[] = [];
    if (!V.id) p.push(`บิล V ${codeOf(V.r)} ${short(V.r?.message ?? "", 80)}`);
    const ex = asData("ชั่ง qty 2", await refund(ctxOf("A"), owner, rin(V.id, [[vNames.G, 2, true]], [["CASH", 7000]])), "REFUND_EXCEEDS");
    if (!refused(ex, ["REFUND_EXCEEDS"])) p.push(`ชั่ง qty 2 → ${codeOf(ex)}`);
    for (const k of ["I1", "C1", "C2", "G"]) onHand0[k] = Number((await P.invItem.findUnique({ where: { id: I[k] ?? "-" } }).catch(() => null))?.onHand ?? NaN);
    const r = await refund(ctxOf("A"), owner, rin(V.id, [[vNames.I1, 1, true], [vNames.B, 1, true], [vNames.G, 1, true]], [["CASH", 12500]], { reasonCode: "DAMAGED", reason: "ของมีตำหนิ" }));
    rv1 = rid(r);
    const rr = await row(rv1);
    const by = (id: string) => ((rr?.lines ?? []) as Any[]).find((x: Any) => x.refLineId === id);
    if (!rv1) p.push(`RV1 ${codeOf(r)} ${short(r?.message ?? "", 60)}`);
    else {
      if (by(vNames.G)?.lineTotalSatang !== 3500 || by(vNames.G)?.qty !== 1) p.push(`ชั่ง ${short(by(vNames.G)?.lineTotalSatang)}`);
      if (by(vNames.B)?.lineTotalSatang !== 4000 || by(vNames.B)?.qty !== 1) p.push(`ชุด ${short(by(vNames.B)?.lineTotalSatang)}`);
      if (by(vNames.I1)?.lineTotalSatang !== 5000) p.push(`นม ${short(by(vNames.I1)?.lineTotalSatang)}`);
      if (rr.grandTotalSatang !== 12500) p.push(`grand ${rr.grandTotalSatang}`);
      if (by(vNames.I1)?.restock !== true || by(vNames.G)?.restock !== true) p.push("restock ไม่ถูกเก็บบนบรรทัดใบคืน");
    }
    const r2 = await refund(ctxOf("A"), owner, rin(V.id, [[vNames.I1, 1, false]], [["CASH", 5000]], { reasonCode: "DAMAGED", reason: "ของเสีย ไม่รับคืน" }));
    rv2 = rid(r2);
    if (!rv2) p.push(`RV2 ${codeOf(r2)}`);
    else if (((await row(rv2))?.lines ?? [])[0]?.restock !== false) p.push("RV2 restock ไม่เป็น false");
    chk("P1.8-A6", p.length === 0, "ชั่ง qty2 = REFUND_EXCEEDS · ชั่ง 3,500 · ชุด 4,000", FX(p.join(" · ") || "ครบ"));
  }

  // ════════ E1–E5 ════════
  const qE = await sale("Q", [one("ของ qE", 5000, 3), one("แถม qE", 2000)], [["CASH", 17000]]);
  const qI = await sale("Q", [one("ของ qI", 5000, 3)], [["CASH", 15000]]);
  {
    const p: string[] = [];
    const qV = await sale("Q", [one("ของ qV", 3000)], [["CASH", 3000]]);
    const vr = qV.id ? await call(svc, "voidSale", T, U.Q, qV.id) : { ok: false, code: "NO_SALE" };
    if ((await row(qV.id))?.status !== "VOIDED") p.push(`void fixture ${codeOf(vr)}`);
    const qF = await sale("Q", [one("ของ qF", 3000)], [["CASH", 3000]]);
    const rF = await refund(ctxOf("Q"), owner, rin(qF.id, [[qF.L["ของ qF"], 1]], [["CASH", 3000]]));
    if (!rid(rF)) p.push(`เตรียมบิลคืนครบ ${codeOf(rF)}`);
    const qG = await sale("Q", [one("บัตรกำนัล qG", 50000)], [["CASH", 50000]]);
    if (qG.id) await P.posSale.update({ where: { id: qG.id }, data: { giftCardId: `qc-gc-${RAND}` } }).catch(() => {});
    const cases: [string, Any, string, string][] = [
      ["VOIDED", ctxOf("Q"), qV.id, "SALE_NOT_REFUNDABLE"],
      ["REFUNDED", ctxOf("Q"), qF.id, "SALE_NOT_REFUNDABLE"],
      ["เอกสาร REFUND", ctxOf("Q"), rid(rF) || "missing-refund-doc", "SALE_NOT_REFUNDABLE"],
      ["บัตรกำนัล", ctxOf("Q"), qG.id, "SALE_NOT_REFUNDABLE"],
      ["id ไม่มี", ctxOf("Q"), `cqc18unknown${RAND}xx`, "SALE_NOT_FOUND"],
      ["สาขาอื่น", ctxOf("B"), qE.id, "SALE_NOT_FOUND"],
      ["ร้านอื่น", { tenantId: PQC.coffee.tenantId, systemId: PQC.coffee.systems.POS.id, unitId: PQC.coffee.units.silom.id }, qE.id, "SALE_NOT_FOUND"],
    ];
    for (const [label, c, saleId, code] of cases) {
      const lineId = label === "REFUNDED" ? qF.L["ของ qF"] : label === "บัตรกำนัล" ? qG.L["บัตรกำนัล qG"] : label === "VOIDED" ? qV.L["ของ qV"] : qE.L["ของ qE"];
      const amt = label === "บัตรกำนัล" ? 50000 : label === "VOIDED" || label === "REFUNDED" ? 3000 : 5000;
      const r = asData(`E1 ${label}`, await refund(c, owner, rin(saleId, [[lineId ?? "x", 1]], [["CASH", amt]])), code);
      if (!refused(r, [code])) p.push(`${label} → ${codeOf(r)}`);
    }
    for (const [label, id] of [["VOIDED", qV.id], ["REFUNDED", qF.id], ["บัตรกำนัล", qG.id], ["qE", qE.id]] as [string, string][]) {
      const n = await refundsOf(id);
      if (n !== (label === "REFUNDED" ? 1 : 0)) p.push(`${label}: ใบคืน ${n}`);
    }
    chk("P1.8-E1", p.length === 0, "NOT_REFUNDABLE ×4 · NOT_FOUND ×3 · ไม่มีใบเกิด", FX(p.join(" · ") || "ครบ"));
  }
  {
    const p: string[] = [];
    const l1 = qE.L["ของ qE"] ?? "", l2 = qE.L["แถม qE"] ?? "";
    const bad = async (label: string, input: Any, code: string) => {
      const r = asData(`E2 ${label}`, await refund(ctxOf("Q"), owner, input), code);
      if (!refused(r, [code])) p.push(`${label} → ${codeOf(r)}`);
    };
    await bad("qty 4", rin(qE.id, [[l1, 4]], [["CASH", 20000]]), "REFUND_EXCEEDS");
    await bad("lines ว่าง", rin(qE.id, [], [["CASH", 0]]), "REFUND_EMPTY");
    for (const q of [0, -1, 1.5, "1"] as Any[]) await bad(`qty ${JSON.stringify(q)}`, rin(qE.id, [[l1, q]], [["CASH", 5000]]), "VALIDATION");
    await bad("lineId ไม่มี", rin(qE.id, [["cqc18nolinexx", 1]], [["CASH", 5000]]), "VALIDATION");
    await bad("lineId ของบิลอื่น", rin(qE.id, [[qI.L["ของ qI"] ?? "x", 1]], [["CASH", 5000]]), "VALIDATION");
    await bad("lineId ซ้ำ", rin(qE.id, [[l1, 1], [l1, 1]], [["CASH", 10000]]), "VALIDATION");
    await bad("reason 201", rin(qE.id, [[l1, 1]], [["CASH", 5000]], { reason: "ก".repeat(201) }), "VALIDATION");
    await bad("reasonCode แปลก", rin(qE.id, [[l1, 1]], [["CASH", 5000]], { reasonCode: "FOO" }), "VALIDATION");
    const part = await refund(ctxOf("Q"), owner, rin(qE.id, [[l1, 2]], [["CASH", 10000]]));
    if (!rid(part)) p.push(`คืน 2 หน่วย ${codeOf(part)}`);
    await bad("เกินหลังคืนบางส่วน", rin(qE.id, [[l1, 2]], [["CASH", 10000]]), "REFUND_EXCEEDS");
    if ((await refundsOf(qE.id)) !== 1) p.push(`ใบคืนของ qE ${await refundsOf(qE.id)} (คาด 1)`);
    void l2;
    chk("P1.8-E2", p.length === 0, "EXCEEDS ×2 · EMPTY · VALIDATION ×9 · ใบคืนเฉพาะที่ถูก", FX(p.join(" · ") || "ครบ"));
  }
  {
    const p: string[] = [];
    const l2 = qE.L["แถม qE"] ?? "";
    const noCode = rin(qE.id, [[l2, 1]], [["CASH", 2000]]);
    delete noCode.reasonCode;
    for (const [label, input] of [["ไม่มี reasonCode", noCode], ["OTHER ว่าง", rin(qE.id, [[l2, 1]], [["CASH", 2000]], { reasonCode: "OTHER", reason: "" })], ["OTHER ช่องว่าง", rin(qE.id, [[l2, 1]], [["CASH", 2000]], { reasonCode: "OTHER", reason: "   " })]] as [string, Any][]) {
      const r = asData(`E3 ${label}`, await refund(ctxOf("Q"), owner, input), "REASON_REQUIRED");
      if (!refused(r, ["REASON_REQUIRED"])) p.push(`${label} → ${codeOf(r)}`);
    }
    const ok = await refund(ctxOf("Q"), owner, rin(qE.id, [[l2, 1]], [["CASH", 2000]], { reasonCode: "OTHER", reason: "ของแถมไม่ตรงปก" }));
    const r = await row(rid(ok));
    if (!(r?.reasonCode === "OTHER" && r?.note === "ของแถมไม่ตรงปก")) p.push(`OTHER + เหตุผล ${codeOf(ok)} ${short(r?.reasonCode)}`);
    chk("P1.8-E3", p.length === 0, "REASON_REQUIRED ×3 · OTHER+เหตุผล ok", FX(p.join(" · ") || "ครบ"));
  }
  {
    const p: string[] = [];
    const l1 = qI.L["ของ qI"] ?? "";
    for (const type of ["DEPOSIT", "ROOM_CHARGE"]) {
      const r = asData(`E4 ${type}`, await refund(ctxOf("Q"), owner, rin(qI.id, [[l1, 1]], [[type, 5000]])), "REFUND_METHOD_INVALID");
      if (!refused(r, ["REFUND_METHOD_INVALID"])) p.push(`${type} → ${codeOf(r)}`);
    }
    if ((await refundsOf(qI.id)) !== 0) p.push("มีใบคืนเกิด");
    chk("P1.8-E4", p.length === 0, "DEPOSIT/ROOM_CHARGE = REFUND_METHOD_INVALID", FX(p.join(" · ") || "ครบ"));
  }
  {
    const p: string[] = [];
    const b = await sale("Q", [one("ของ qPerm", 5000, 3)], [["CASH", 15000]]);
    const l = b.L["ของ qPerm"] ?? "";
    const c = asData("E5 แคชเชียร์", await refund(ctxOf("Q"), cashier(), rin(b.id, [[l, 1]], [["CASH", 5000]])), "NO_PERMISSION");
    if (!refused(c, ["NO_PERMISSION"])) p.push(`แคชเชียร์ → ${codeOf(c)}`);
    if ((await refundsOf(b.id)) !== 0) p.push("แคชเชียร์ทำให้เกิดใบคืน");
    const s = await refund(ctxOf("Q"), staffRefund(), rin(b.id, [[l, 1]], [["CASH", 5000]]));
    if ((await row(rid(s)))?.soldByUserId !== cashierId) p.push(`STAFF+สิทธิ์ ${codeOf(s)}`);
    const m = await refund(ctxOf("Q"), manager(), rin(b.id, [[l, 1]], [["CASH", 5000]]));
    if ((await row(rid(m)))?.soldByUserId !== mgrId) p.push(`MANAGER ${codeOf(m)}`);
    chk("P1.8-E5", p.length === 0, "แคชเชียร์ NO_PERMISSION · STAFF+pos.sale.refund ok · MANAGER ok", FX(p.join(" · ") || "ครบ"));
  }

  // ════════ N3 คืน 10 บิลพร้อมกันบนสาขาที่ยังไม่เคยคืน ════════
  {
    const p: string[] = [];
    const bills: Any[] = [];
    for (let i = 0; i < 10; i++) bills.push(await sale("Q2", [one(`ของ q2-${i}`, 3000)], [["CASH", 3000]]));
    const per2 = (bills[0]?.receiptNo ?? "").split("-")[0] ?? "";
    const rs = await Promise.all(bills.map(async (b: Any, i: number) => refund(ctxOf("Q2"), owner, rin(b.id, [[b.L[`ของ q2-${i}`] ?? "x", 1]], [["CASH", 3000]]), await lane(i))));
    const ok = rs.filter((r: Any) => !!rid(r));
    const nos = (await Promise.all(ok.map((r: Any) => row(rid(r))))).map((r: Any) => String(r?.receiptNo)).sort();
    const want = Array.from({ length: 10 }, (_, i) => `CN${per2}-${String(i + 1).padStart(4, "0")}`);
    if (ok.length !== 10) p.push(`ok ${ok.length}/10 (${[...new Set(rs.filter((r: Any) => !rid(r)).map(codeOf))].join(",")})`);
    if (nos.join(",") !== want.join(",")) p.push(`เลข ${short(nos, 120)}`);
    if ((await docSeq(U.Q2)) !== 10) p.push(`seq ${await docSeq(U.Q2)}`);
    chk("P1.8-N3", p.length === 0, "10 ok · CN 0001–0010 · seq 10", FX(p.join(" · ") || "ครบ"));
  }
  // ════════ R1 แข่งคืนบรรทัดเดียวกัน ════════
  {
    const p: string[] = [];
    for (let round = 0; round < 3; round++) {
      const b = await sale("Q", [one(`ของแข่ง ${round}`, 5000)], [["CASH", 5000]]);
      const l = b.L[`ของแข่ง ${round}`] ?? "";
      const rs = await Promise.all([0, 1].map(async (i) => refund(ctxOf("Q"), owner, rin(b.id, [[l, 1]], [["CASH", 5000]]), await lane(i))));
      const ok = rs.filter((r: Any) => !!rid(r)).length;
      const ex = rs.filter((r: Any) => refused(r, ["REFUND_EXCEEDS"])).length;
      const s = await row(b.id);
      const n = await refundsOf(b.id);
      if (!(ok === 1 && ex === 1 && n === 1 && s?.refundedSatang === 5000 && s?.status === "REFUNDED")) {
        p.push(`รอบ ${round + 1}: ok ${ok} exceeds ${ex} อื่น ${rs.filter((r: Any) => !rid(r) && !refused(r, ["REFUND_EXCEEDS"])).map(codeOf).join(",")} ใบ ${n} refunded ${s?.refundedSatang} ${s?.status}`);
      }
    }
    chk("P1.8-R1", p.length === 0, "3 รอบ × (ok 1 · REFUND_EXCEEDS 1 · ใบ 1)", FX(p.join(" · ") || "ครบ"));
  }
  // ════════ I1/I2 idempotency ════════
  {
    const p: string[] = [];
    const l = qI.L["ของ qI"] ?? "";
    const input = rin(qI.id, [[l, 1]], [["CASH", 5000]]);
    const a = await refund(ctxOf("Q"), owner, input);
    const seqA = await docSeq(U.Q);
    const b = await refund(ctxOf("Q"), owner, { ...input });
    const id = rid(a);
    if (!id) p.push(`ครั้งแรก ${codeOf(a)} ${short(a?.message ?? "", 60)}`);
    else {
      if (rid(b) !== id) p.push(`ซ้ำ → ${codeOf(b)} ${rid(b) ? "ใบใหม่" : ""}`);
      if ((await refundsOf(qI.id)) !== 1) p.push(`ใบคืน ${await refundsOf(qI.id)}`);
      if ((await docSeq(U.Q)) !== seqA) p.push("ตัวนับขยับตอนซ้ำ");
      if (b?.refund?.receiptNo !== a?.refund?.receiptNo) p.push("เลข CN ต่าง");
      const ev = await P.outboxEvent.count({ where: { tenantId: T, type: "pos.sale.refunded", idempotencyKey: `PosSale#${id}#REFUNDED` } }).catch(() => NaN);
      if (ev !== 1) p.push(`outbox ${ev}`);
      if (((await row(id))?.payments ?? []).length !== 1) p.push("แถวจ่ายไม่ใช่ 1");
    }
    chk("P1.8-I1", p.length === 0, "ใบเดิม · 1 ใบ · 1 เลข · 1 event", FX(p.join(" · ") || "ครบ"));
    const q: string[] = [];
    const seqB = await docSeq(U.Q);
    for (const [label, inp] of [
      ["จำนวนต่าง", { ...input, lines: [{ lineId: l, qty: 2 }], payMethods: [{ type: "CASH", amountSatang: 10000 }] }],
      ["วิธีจ่ายต่าง", { ...input, payMethods: [{ type: "TRANSFER", amountSatang: 5000 }] }],
      ["คีย์ของบิลขาย", { ...rin(qI.id, [[l, 1]], [["CASH", 5000]]), idempotencyKey: qI.key }],
    ] as [string, Any][]) {
      const r = asData(`I2 ${label}`, await refund(ctxOf("Q"), owner, inp), "IDEMPOTENCY_CONFLICT");
      if (!refused(r, ["IDEMPOTENCY_CONFLICT"])) q.push(`${label} → ${codeOf(r)}`);
    }
    if ((await refundsOf(qI.id)) !== (id ? 1 : 0) || (await docSeq(U.Q)) !== seqB) q.push("มีใบ/เลขเพิ่ม");
    chk("P1.8-I2", q.length === 0 && !!id, "IDEMPOTENCY_CONFLICT ×3 · ไม่มีอะไรเพิ่ม", FX(q.join(" · ") || (id ? "ครบ" : "ครั้งแรกไม่ผ่าน")));
  }

  // ════════ H กะ ════════
  const dev = (n: string) => `qc18-${RAND}-${n}`;
  const openS = async (d: string, float = 0) => {
    const r = await call(shiftMod, "openShift", ctxOf("S"), owner, { deviceId: d, floatSatang: float });
    return r?.ok === true ? String(r.shift?.id ?? "") : "";
  };
  {
    const p: string[] = [];
    const D1 = dev("d1");
    const S1 = await openS(D1, 100_000);
    if (!S1) p.push("เปิดกะไม่ได้");
    const b = await sale("S", [one("ข้าว H", 8500, 2), one("ชุด H", 45000)], [{ type: "CASH", amountSatang: 62000, cashTenderedSatang: 62000 }], { shiftId: S1 });
    if (!b.id) p.push("ขายในกะไม่ได้");
    const r = await refund(ctxOf("S", D1), owner, rin(b.id, [[b.L["ข้าว H"] ?? "", 1]], [["CASH", 8500]], { deviceId: D1 }));
    const rr = await row(rid(r));
    if (!rr) p.push(`คืน ${codeOf(r)} ${short(r?.message ?? "", 60)}`);
    else if (rr.shiftId !== S1) p.push(`ใบคืน shiftId ${short(rr.shiftId, 30)}`);
    const x = await call(shiftMod, "xReport", ctxOf("S", D1), owner, { shiftId: S1 });
    const rep = x?.ok === true ? x.report : null;
    const cash = Array.isArray(rep?.byMethod) ? rep.byMethod.find((m: Any) => m?.type === "CASH") : null;
    const exp = 100_000 + 62_000 - 8_500;
    const want = { billCount: 1, salesTotalSatang: 62000, cashRefundsSatang: 8500, refundCount: 1, refundSatang: 8500, expectedCashSatang: exp };
    if (!rep) p.push(`X ${codeOf(x)}`);
    else {
      for (const [k, v] of Object.entries(want)) if (rep[k] !== v) p.push(`X.${k} ${rep[k]} (คาด ${v})`);
      if (!(cash?.count === 1 && cash?.amountSatang === 62000 && cash?.refundCount === 1 && cash?.refundSatang === 8500)) p.push(`CASH ${short(cash)}`);
    }
    const z = S1 ? await call(shiftMod, "closeShift", ctxOf("S", D1), owner, { shiftId: S1, countedCashSatang: exp, idempotencyKey: newKey("close") }) : null;
    const zr = z?.ok === true ? z.report : null;
    if (!(zr?.cashRefundsSatang === 8500 && zr?.expectedCashSatang === exp && zr?.overShortSatang === 0)) p.push(`Z ${codeOf(z)} ${short({ c: zr?.cashRefundsSatang, e: zr?.expectedCashSatang, o: zr?.overShortSatang })}`);
    chk("P1.8-H1", p.length === 0, `X/Z: refunds 8,500 · expected ${exp}`, FX(p.join(" · ") || "ครบ"));
  }
  {
    const p: string[] = [];
    const b = await sale("S", [one("ของ H2", 5000, 3)], [["CASH", 15000]]);
    const l = b.L["ของ H2"] ?? "";
    let setErr = "";
    try {
      await P.appSystem.update({ where: { id: S.POSA }, data: { settings: { pos: { shift: { required: { register: true } } } } } });
    } catch (e) {
      setErr = (e as Error).message.slice(0, 60);
    }
    const D9 = dev("d9");
    const a = asData("H2 CASH ไม่มีกะ", await refund(ctxOf("S", D9), owner, rin(b.id, [[l, 1]], [["CASH", 5000]], { deviceId: D9 })), "SHIFT_REQUIRED");
    if (!refused(a, ["SHIFT_REQUIRED"])) p.push(`CASH เครื่องไม่มีกะ → ${codeOf(a)}`);
    const nd = asData("H2 CASH ไม่ส่งเครื่อง", await refund(ctxOf("S"), owner, rin(b.id, [[l, 1]], [["CASH", 5000]])), "SHIFT_REQUIRED");
    if (!refused(nd, ["SHIFT_REQUIRED"])) p.push(`CASH ไม่ส่งเครื่อง → ${codeOf(nd)}`);
    if ((await refundsOf(b.id)) !== 0) p.push("มีใบเกิด");
    const t = await refund(ctxOf("S", D9), owner, rin(b.id, [[l, 1]], [["TRANSFER", 5000]], { deviceId: D9 }));
    const tr = await row(rid(t));
    if (!(tr && tr.shiftId === null)) p.push(`TRANSFER → ${codeOf(t)} shiftId ${short(tr?.shiftId, 30)}`);
    await P.appSystem.update({ where: { id: S.POSA }, data: { settings: {} } }).catch(() => {});
    chk("P1.8-H2", p.length === 0 && !setErr, "SHIFT_REQUIRED ×2 · TRANSFER ok shiftId null", FX(p.join(" · ") || setErr || "ครบ"));
  }
  {
    const p: string[] = [];
    const D2 = dev("d2"), D3 = dev("d3"), D4 = dev("d4");
    const S0 = await openS(D2);
    const b = await sale("S", [one("ของ H3", 5000, 4)], [["CASH", 20000]], { shiftId: S0 });
    const c = S0 ? await call(shiftMod, "closeShift", ctxOf("S", D2), owner, { shiftId: S0, countedCashSatang: 20000, idempotencyKey: newKey("close") }) : null;
    if (!(S0 && b.id && c?.ok === true)) p.push(`เตรียมกะปิด ${codeOf(c)}`);
    const v = await call(svc, "voidSale", T, U.S, b.id);
    if (!(v?.ok === false && v.code === "SHIFT_CLOSED") || (await row(b.id))?.status !== "PAID") p.push(`void บิลกะปิด → ${codeOf(v)} (คาด SHIFT_CLOSED)`);
    const S3 = await openS(D3);
    const l = b.L["ของ H3"] ?? "";
    const r = await refund(ctxOf("S", D3), owner, rin(b.id, [[l, 1]], [["CASH", 5000]], { deviceId: D3 }));
    const rr = await row(rid(r));
    if (!(rr && rr.shiftId === S3 && S3 && rr.shiftId !== S0)) p.push(`คืนที่เครื่องมีกะ ${codeOf(r)} shiftId ${short(rr?.shiftId, 30)}`);
    const off = await refund(ctxOf("S", D4), owner, rin(b.id, [[l, 1]], [["CASH", 5000]], { deviceId: D4 }));
    const or = await row(rid(off));
    if (!(or && or.shiftId === null)) p.push(`คืนนอกกะ ${codeOf(off)} shiftId ${short(or?.shiftId, 30)}`);
    chk("P1.8-H3", p.length === 0, "void = SHIFT_CLOSED · คืนผูกกะที่เปิด · นอกกะ null", FX(p.join(" · ") || "ครบ"));
  }

  // ════════ D ตัวอ่านยอด (สาขา R · ไม่มีกะ) ════════
  const today = callSync(svc, "bkkToday");
  const since = new Date(Date.now() + 7 * HOUR - 2 * 24 * HOUR).toISOString().slice(0, 10);
  const readers = async (): Promise<Any> => {
    const o: Any = {};
    const ds = await call(svc, "daySummary", T, U.R);
    o.dayTotal = ds?.totalSatang;
    o.dayCount = ds?.count;
    const ls = await call(svc, "listSales", T, U.R, since);
    o.listIds = Array.isArray(ls) ? ls.map((x: Any) => x.id) : [];
    const cd = await call(svc, "closeDaySummary", { tenantId: T, systemId: S.POSA, unitIds: [U.R] });
    o.closeNet = cd?.netSalesSatang;
    o.closeBills = cd?.billCount;
    const rc = { tenantId: T, systemId: S.POSA, unitId: U.R };
    const rp = await call(reportsMod, "reportDailySales", rc, owner, { from: today, to: today });
    const t = rp?.ok === true ? rp.report?.totals : null;
    o.repNet = t?.netSalesSatang;
    o.repBills = t?.billCount;
    o.repRefundCount = t?.refundCount;
    o.repRefundTotal = t?.refundTotalSatang;
    const ov = await call(overviewMod, "reportOverview", rc, owner, { from: today, to: today, only: ["daily"] });
    const ot = ov?.ok === true && ov.overview?.daily?.ok === true ? ov.overview.daily.data?.totals : null;
    o.ovNet = ot?.netSalesSatang;
    o.ovRefundCount = ot?.refundCount;
    o.ovRefundTotal = ot?.refundTotalSatang;
    const off = await call(shiftMod, "offShiftCash", rc, owner, {});
    o.offTotal = off?.ok === true ? off.totalSatang : undefined;
    o.offBills = off?.ok === true && Array.isArray(off.bills) ? off.bills : [];
    return o;
  };
  const NETS = ["dayTotal", "closeNet", "repNet", "ovNet", "offTotal"] as const;
  const delta = (a: Any, b: Any, k: string) => (typeof a?.[k] === "number" && typeof b?.[k] === "number" ? b[k] - a[k] : NaN);
  const s0 = await readers();
  const R1b = await sale("R", [one("ลาเต้ R", 8500, 2), one("เค้กชุด R", 45000)], [["CASH", 62000]]);
  const s1 = await readers();
  const rR = await refund(ctxOf("R"), owner, rin(R1b.id, [[R1b.L["ลาเต้ R"] ?? "", 1]], [["CASH", 8500]]));
  const s2 = await readers();
  {
    const p: string[] = [];
    for (const k of ["dayTotal", "closeNet", "offTotal"]) {
      if (delta(s0, s1, k) !== 62000) p.push(`${k} ขาย Δ ${delta(s0, s1, k)} (positive control คาด +62000)`);
      if (delta(s1, s2, k) !== -8500) p.push(`${k} คืน Δ ${delta(s1, s2, k)} (คาด −8500)`);
    }
    if (delta(s1, s2, "dayCount") !== 0 || delta(s1, s2, "closeBills") !== 0) p.push(`จำนวนบิล Δ day ${delta(s1, s2, "dayCount")} close ${delta(s1, s2, "closeBills")}`);
    if (!rid(rR)) p.push(`คืน ${codeOf(rR)}`);
    else {
      if (!s2.listIds.includes(R1b.id)) p.push("listSales ไม่มีบิลขาย");
      if (s2.listIds.includes(rid(rR))) p.push("listSales มีใบ REFUND");
      const ob = (s2.offBills as Any[]).find((x: Any) => x.saleId === rid(rR));
      if (ob?.cashSatang !== -8500) p.push(`offShiftCash แถวใบคืน ${short(ob ?? null, 80)}`);
    }
    chk("P1.8-D1", p.length === 0, "+62,000 แล้ว −8,500 · จำนวนบิลคงที่ · listSales ไม่มีใบคืน · offShift −8,500", FX(p.join(" · ") || "ครบ"));
  }
  {
    const p: string[] = [];
    for (const k of ["repNet", "ovNet"]) {
      if (delta(s0, s1, k) !== 62000) p.push(`${k} ขาย Δ ${delta(s0, s1, k)} (positive control)`);
      if (delta(s1, s2, k) !== -8500) p.push(`${k} คืน Δ ${delta(s1, s2, k)} (คาด −8500)`);
    }
    if (delta(s1, s2, "repBills") !== 0) p.push(`billCount Δ ${delta(s1, s2, "repBills")}`);
    if (delta(s1, s2, "repRefundCount") !== 1 || delta(s1, s2, "ovRefundCount") !== 1) p.push(`refundCount Δ ${delta(s1, s2, "repRefundCount")}/${delta(s1, s2, "ovRefundCount")}`);
    if (delta(s1, s2, "repRefundTotal") !== 8500 || delta(s1, s2, "ovRefundTotal") !== 8500) p.push(`refundTotal Δ ${delta(s1, s2, "repRefundTotal")}/${delta(s1, s2, "ovRefundTotal")}`);
    chk("P1.8-D2", p.length === 0, "report/overview: +62,000 → −8,500 · refundCount +1 · refundTotal +8,500", FX(p.join(" · ") || "ครบ"));
  }
  {
    const p: string[] = [];
    const R2b = await sale("R", [one("ชา R2", 10000), one("ขนม R2", 20000)], [["CASH", 30000]]);
    const r = await refund(ctxOf("R"), owner, rin(R2b.id, [[R2b.L["ชา R2"] ?? "", 1], [R2b.L["ขนม R2"] ?? "", 1]], [["CASH", 30000]]));
    const s3 = await readers();
    if (!rid(r)) p.push(`คืนครบ ${codeOf(r)}`);
    for (const k of NETS) if (delta(s2, s3, k) !== 0) p.push(`${k} Δ ${delta(s2, s3, k)}`);
    if (typeof s3.dayTotal !== "number") p.push("อ่าน daySummary ไม่ได้");
    chk("P1.8-D3", p.length === 0, "บิลคืนครบ = 0 ทุกตัวอ่าน", FX(p.join(" · ") || "ครบ"));
  }

  // ════════ C consumer (บิล M · B2 · N · V) ════════
  const bal = async (cid: string): Promise<number> => (cid ? Number(await call(pointMod, "getBalance", S.PTS, cid)) : NaN);
  const spend = async (cid: string): Promise<number> => (cid ? Number((await P.customer.findUnique({ where: { id: cid } }).catch(() => null))?.totalSpentSatang ?? NaN) : NaN);
  const earnRow = async (saleId: string): Promise<Any> => (saleId ? P.pointLedger.findFirst({ where: { tenantId: T, refType: "PosSale", refId: saleId, type: "EARN" } }).catch(() => null) : null);
  const lotOf = async (id: string | null | undefined): Promise<Any> => (id ? P.pointLot.findUnique({ where: { id } }).catch(() => null) : null);
  const stampAdds = async (saleId: string): Promise<Any[]> => (saleId ? ((await P.stampEvent.findMany({ where: { tenantId: T, refType: "SALE", refId: saleId, type: "ADD" } }).catch(() => [])) as Any[]) : []);
  const stampVoids = async (addIds: string[]): Promise<number> => (addIds.length ? P.stampEvent.count({ where: { tenantId: T, type: "VOID", refId: { in: addIds } } }).catch(() => NaN) : 0);
  const abbOf = async (saleId: string): Promise<Any> => (saleId ? P.accountDocument.findFirst({ where: { tenantId: T, docType: "TAX_INVOICE_ABB", refType: "PosSale", refId: saleId } }).catch(() => null) : null);
  const cnOf = async (refundId: string): Promise<Any[]> => (refundId ? ((await P.accountDocument.findMany({ where: { tenantId: T, docType: "CREDIT_NOTE", refType: "PosSale", refId: refundId } }).catch(() => [])) as Any[]) : []);
  const jvOf = async (refIds: string[], docIds: string[] = []): Promise<Any[]> =>
    (await P.accountJournalEntry.findMany({
      where: { tenantId: T, OR: [{ refType: "PosSale", refId: { in: refIds.filter(Boolean) } }, ...(docIds.length ? [{ refType: "AccountDocument", refId: { in: docIds } }] : [])] },
      include: { lines: { include: { account: { select: { code: true } } } } },
    }).catch(() => [])) as Any[];
  const netCode = (es: Any[], code: string) => sum(es.flatMap((e: Any) => e.lines ?? []).filter((l: Any) => l.account?.code === code).map((l: Any) => l.debit - l.credit));
  const balanced = (es: Any[]) => es.length > 0 && es.every((e: Any) => sum((e.lines ?? []).map((l: Any) => l.debit)) === sum((e.lines ?? []).map((l: Any) => l.credit)));

  const m0 = { bal: await bal(C1), spend: await spend(C1), earn: await earnRow(M.id), stamps: await stampAdds(M.id), abb: await abbOf(M.id) };
  const b20 = { bal: await bal(C2), earn: await earnRow(B2.id), preload: Number((await lotOf(preloadLot))?.remaining ?? NaN) };
  console.log(`  ก่อนคืน: M แต้ม ${m0.earn?.delta ?? "—"} ยอดสะสม ${m0.spend} ตรา ${m0.stamps.length} ABB ${m0.abb?.docNo ?? "—"} · B2 แต้มได้ ${b20.earn?.delta ?? "—"} ยอด ${b20.bal} ล็อตตั้งต้นเหลือ ${b20.preload}`);
  // Q1 ส่วนสมาชิก/บัญชีของบิล M (ก่อนคืน)
  const q1m = await call(refundMod, "saleForRefund", ctxOf("A"), owner, { saleId: M.id });
  const q1u = asData("Q1 id ไม่มี", await call(refundMod, "saleForRefund", ctxOf("A"), owner, { saleId: `cqc18unknown${RAND}yy` }), "SALE_NOT_FOUND");

  const rm1r = await refund(ctxOf("A"), owner, rin(M.id, [[M.L["ลาเต้ M"] ?? "", 1]], [["CASH", 8500]]));
  const rm1 = rid(rm1r);
  const b2l = B2.L["ชา C2"] ?? "";
  const b2Sale = await row(B2.id);
  const b2Lines = ["ชา C2", "ขนม C2"].map((n) => ((b2Sale?.lines ?? []) as Any[]).find((l: Any) => l.name === n)).filter(Boolean);
  const b2D = sum(b2Lines.map((l: Any) => l.lineTotalSatang)) + Number(b2Sale?.serviceChargeSatang ?? 0) - Number(b2Sale?.grandTotalSatang ?? 0);
  const b2Net = b2Lines.length === 2 ? b2Lines[0].lineTotalSatang - allocLR(b2Lines.map((l: Any) => l.lineTotalSatang), b2D)[0]! : NaN;
  const rb2r = await refund(ctxOf("A"), owner, rin(B2.id, [[b2l, 1]], [["CASH", b2Net]]));
  const rnr = await refund(ctxOf("N"), owner, rin(NB.id, [[NB.L["ของ N"] ?? "", 1]], [["CASH", 10700]]));
  const rn = rid(rnr);
  await drain();
  const m1 = { bal: await bal(C1), spend: await spend(C1), lot: await lotOf(m0.earn?.lotId), stamps: await stampAdds(M.id) };
  const b21 = { bal: await bal(C2), preload: Number((await lotOf(preloadLot))?.remaining ?? NaN) };
  // A4 VAT (ใบคืนบน POS-A ทั้งหมดที่มี + ใบคืน N)
  {
    const p: string[] = [];
    const ids = [...xRefunds, rm1, rv1, rv2].filter(Boolean);
    for (const id of ids) {
      const r = await row(id);
      const v = vatOf(r?.grandTotalSatang ?? 0, 700);
      if (r?.vatSatang !== v) p.push(`${String(r?.receiptNo ?? id.slice(-6))}: vat ${r?.vatSatang} (คาด ${v})`);
    }
    const rnRow = await row(rn);
    if (!rnRow || rnRow.vatSatang !== 0) p.push(`ใบคืน POS ไม่ผูกสมุด vat ${short(rnRow?.vatSatang)} ${codeOf(rnr)}`);
    chk("P1.8-A4", p.length === 0 && ids.length >= 6, "vat = splitIncludedVat(grand, 700) · ไม่ผูกสมุด 0", FX(p.join(" · ") || `ครบ (${ids.length} ใบ)`));
  }
  // C1 event + audit
  {
    const p: string[] = [];
    const ev = rm1 ? ((await P.outboxEvent.findMany({ where: { tenantId: T, type: "pos.sale.refunded", idempotencyKey: `PosSale#${rm1}#REFUNDED` } }).catch(() => [])) as Any[]) : [];
    if (!rm1) p.push(`RM1 ${codeOf(rm1r)} ${short(rm1r?.message ?? "", 60)}`);
    else if (ev.length !== 1) p.push(`event ${ev.length}`);
    else {
      const pl = ev[0].payload ?? {};
      if (pl.saleId !== M.id || pl.refundSaleId !== rm1 || pl.sourceModule !== "POS" || pl.full !== false) p.push(`payload หัว ${short({ s: pl.saleId === M.id, r: pl.refundSaleId === rm1, m: pl.sourceModule, f: pl.full })}`);
      const l0 = Array.isArray(pl.lines) ? pl.lines[0] : null;
      if (!(Array.isArray(pl.lines) && pl.lines.length === 1 && l0?.refLineId === M.L["ลาเต้ M"] && l0?.qty === 1 && l0?.amountSatang === 8500 && [undefined, null, false].includes(l0?.restock) && l0?.itemId === null)) p.push(`payload lines ${short(pl.lines, 120)}`);
      if (!(Array.isArray(pl.payMethods) && pl.payMethods.length === 1 && pl.payMethods[0]?.type === "CASH" && pl.payMethods[0]?.amountSatang === 8500)) p.push(`payload payMethods ${short(pl.payMethods, 80)}`);
    }
    const ev1 = rv1 ? ((await P.outboxEvent.findFirst({ where: { tenantId: T, idempotencyKey: `PosSale#${rv1}#REFUNDED` } }).catch(() => null)) as Any) : null;
    const vl = Array.isArray(ev1?.payload?.lines) ? (ev1.payload.lines as Any[]) : [];
    const vlOf = (id: string) => vl.find((x: Any) => x.refLineId === id);
    if (!(vlOf(vNames.I1)?.restock === true && vlOf(vNames.I1)?.itemId === I.I1 && vlOf(vNames.G)?.itemId === I.G && vlOf(vNames.B)?.itemId === null)) p.push(`payload RV1 ${short(vl, 140)}`);
    const full = rn ? ((await P.outboxEvent.findFirst({ where: { tenantId: T, idempotencyKey: `PosSale#${rn}#REFUNDED` } }).catch(() => null)) as Any) : null;
    if (full?.payload?.full !== true) p.push(`event คืนครบ full ${short(full?.payload?.full)}`);
    const allRefundIds = ((await P.posSale.findMany({ where: { tenantId: T, docType: "REFUND" }, select: { id: true } }).catch(() => [])) as Any[]).map((x: Any) => x.id);
    if (allRefundIds.length) {
      const paid = await P.outboxEvent.count({ where: { tenantId: T, type: "pos.sale.paid", OR: allRefundIds.map((id: string) => ({ idempotencyKey: { contains: id } })) } }).catch(() => NaN);
      if (paid !== 0) p.push(`pos.sale.paid ของใบคืน ${paid}`);
    }
    const au = rm1 ? await P.auditLog.count({ where: { tenantId: T, targetId: rm1, action: { contains: "refund", mode: "insensitive" } } }).catch(() => NaN) : 0;
    if (!(au >= 1)) p.push(`AuditLog ของใบคืน ${au}`);
    chk("P1.8-C1", p.length === 0, "event 1 · payload ครบ · ไม่มี pos.sale.paid · audit", FX(p.join(" · ") || "ครบ"));
  }
  // C2 บัญชีคืนบางส่วน
  const rm1Row = await row(rm1);
  {
    const p: string[] = [];
    const cn = await cnOf(rm1);
    const v = vatOf(8500, 700);
    if (!m0.abb) p.push("บิล M ไม่มีเอกสาร TAX_INVOICE_ABB (fixture)");
    if (cn.length !== 1) p.push(`CREDIT_NOTE ${cn.length} ใบ`);
    else {
      const d = cn[0];
      if (d.sourceDocId !== m0.abb?.id) p.push("sourceDocId ไม่ใช่ ABB ของบิล");
      if (d.docNo !== rm1Row?.receiptNo) {
        // ORACLE-EDIT C2 (ผู้คุม 8 ต.ค.): หลายสาขาใช้สมุดบัญชีเล่มเดียว → เลข CN รันต่อสาขา ชนกันข้ามสาขาได้ ⇒ เอกสารบัญชีใบหลังได้ docNo null
        //   (กติกาเดียวกับใบกำกับอย่างย่อของบิลขายวันนี้ · เลขต่อสมุดหลายสาขา = P1.13/P3.4) — ยอมรับ null เฉพาะเมื่อมี CREDIT_NOTE ใบอื่นในสมุดเดียวกันถือเลขนั้นอยู่
        const taken = d.docNo == null && rm1Row?.receiptNo
          ? await P.accountDocument.findFirst({ where: { systemId: d.systemId, docType: "CREDIT_NOTE", docNo: rm1Row.receiptNo, id: { not: d.id } }, select: { id: true } }).catch(() => null)
          : null;
        if (!taken) p.push(`docNo ${short(d.docNo, 20)} ≠ ${short(rm1Row?.receiptNo, 20)}`);
      }
      if (d.grandTotal !== 8500 || d.vatAmount !== v) p.push(`grand ${d.grandTotal} vat ${d.vatAmount}`);
    }
    const es = await jvOf([rm1], cn.map((d: Any) => d.id));
    if (!balanced(es)) p.push(`JV ${es.length} รายการ ไม่สมดุล/ไม่มี`);
    const want: [string, number][] = [["1000", -8500], ["4000", 8500 - v], ["2200", v], ["1100", 0]];
    for (const [code, n] of want) if (netCode(es, code) !== n) p.push(`${code} สุทธิ ${netCode(es, code)} (คาด ${n})`);
    const saleEs = await jvOf([M.id]);
    const reversed = saleEs.some((e: Any) => e.reversalOfId) || ((await P.accountJournalEntry.count({ where: { tenantId: T, reversalOfId: { in: saleEs.map((e: Any) => e.id) } } }).catch(() => 0)) as number) > 0;
    if (reversed) p.push("JV ของบิลเดิมถูกกลับรายการ");
    chk("P1.8-C2", p.length === 0, `CN 1 ใบ · 1000 −8,500 · 4000 +${8500 - v} · 2200 +${v}`, FX(p.join(" · ") || "ครบ"));
  }
  // C4 POS ไม่ผูกสมุด
  {
    const p: string[] = [];
    if (!rn) p.push(`คืน N ${codeOf(rnr)}`);
    const docs = rn ? await P.accountDocument.count({ where: { tenantId: T, refId: rn } }).catch(() => NaN) : NaN;
    const jes = rn ? (await jvOf([rn])).length : NaN;
    if (docs !== 0 || jes !== 0) p.push(`เอกสาร ${docs} JV ${jes}`);
    const ev = rn ? ((await P.outboxEvent.findFirst({ where: { tenantId: T, idempotencyKey: `PosSale#${rn}#REFUNDED` } }).catch(() => null)) as Any) : null;
    if (ev?.status !== "DONE") p.push(`event ${short(ev?.status ?? null)} ${short(ev?.lastError ?? "", 60)}`);
    const f = await call(accIdx, "applyExternalRefund", {
      tenantId: T, sourceSystemId: S.POSN, refId: rn || "x", saleRefId: NB.id, occurredAt: new Date(), grossSatang: 10700,
      payMethods: [{ channel: "CASH", amountSatang: 10700 }], lines: [], docNo: "CN-QC",
    });
    if (!(f?.posted === false && f?.reason === "unlinked" && !f?.threw)) p.push(`applyExternalRefund ${short(f, 80)}`);
    chk("P1.8-C4", p.length === 0, "ไม่มีเอกสาร/JV · event DONE · {posted:false, reason:unlinked}", FX(p.join(" · ") || "ครบ"));
  }
  // C5 แต้มบางส่วน
  {
    const p: string[] = [];
    const N = Number(m0.earn?.delta ?? NaN);
    const k = Math.floor((N * 8500) / 62000);
    if (N !== 62) p.push(`fixture แต้มบิล M ${N} (คาด 62)`);
    if (m1.bal !== m0.bal - k) p.push(`ยอดแต้ม ${m0.bal}→${m1.bal} (คาด −${k})`);
    if (Number(m1.lot?.remaining) !== N - k) p.push(`ล็อต remaining ${m1.lot?.remaining} (คาด ${N - k})`);
    const N2 = Number(b20.earn?.delta ?? NaN);
    const k2 = Math.floor((N2 * b2Net) / Number(b2Sale?.grandTotalSatang ?? NaN));
    if (!rid(rb2r)) p.push(`คืนบิลใช้แต้ม ${codeOf(rb2r)}`);
    if (!(N2 > 0) || !(b20.preload >= 0)) p.push(`fixture บิลใช้แต้ม: earn ${N2} ล็อตตั้งต้น ${b20.preload}`);
    if (b21.preload !== b20.preload) p.push(`ล็อตที่ถูกตัด ${b20.preload}→${b21.preload} (BURN ถูกคืน)`);
    if (b21.bal !== b20.bal - k2) p.push(`ยอดแต้มบิลใช้แต้ม ${b20.bal}→${b21.bal} (คาด −${k2})`);
    chk("P1.8-C5", p.length === 0, `M −${k} (ล็อตเดิม ${N - k}) · บิลใช้แต้ม −${k2} BURN ไม่คืน`, FX(p.join(" · ") || "ครบ"));
  }
  // C7 (ส่วนแรก) · C8 (ส่วนแรก) เก็บผล
  const c7a = m1.spend;
  const c8a = { adds: m1.stamps.length, voids: await stampVoids(m1.stamps.map((s: Any) => s.id)) };
  // C9 สต็อก
  {
    const p: string[] = [];
    if (!rv1) p.push("ไม่มี RV1");
    const rvr = await row(rv1);
    const refLine = (id: string) => ((rvr?.lines ?? []) as Any[]).find((x: Any) => x.refLineId === id)?.id ?? "?";
    const outs = V.id ? ((await P.invMovement.findMany({ where: { tenantId: T, type: "OUT", refType: "PosSale", refId: V.id } }).catch(() => [])) as Any[]) : [];
    const outCost = (key: string) => outs.find((m: Any) => m.idempotencyKey === key)?.costSatang;
    const want: [string, string, number, unknown][] = [
      [`pos-refund-${rv1}-${refLine(vNames.I1)}`, I.I1 ?? "", 1, outCost(`pos-consume-${V.id}-${vNames.I1}`)],
      [`pos-refund-${rv1}-${refLine(vNames.B)}-${I.C1}`, I.C1 ?? "", 2, outCost(`pos-consume-${V.id}-${vNames.B}-${I.C1}`)],
      [`pos-refund-${rv1}-${refLine(vNames.B)}-${I.C2}`, I.C2 ?? "", 1, outCost(`pos-consume-${V.id}-${vNames.B}-${I.C2}`)],
      [`pos-refund-${rv1}-${refLine(vNames.G)}`, I.G ?? "", 350, outCost(`pos-consume-${V.id}-${vNames.G}`)],
    ];
    const ins = rv1 ? ((await P.invMovement.findMany({ where: { tenantId: T, idempotencyKey: { startsWith: `pos-refund-${rv1}` } } }).catch(() => [])) as Any[]) : [];
    if (outs.length !== 4) p.push(`fixture OUT ${outs.length} (คาด 4)`);
    for (const [key, item, qty, cost] of want) {
      const m = ins.find((x: Any) => x.idempotencyKey === key);
      if (!m) p.push(`ไม่มี ${key.replace(rv1, "<rv1>").slice(0, 60)}`);
      else if (!(m.type === "IN" && m.itemId === item && m.qtyDelta === qty && m.costSatang === cost && m.sourceModule === "POS")) p.push(`${key.slice(-12)}: ${m.type} qty ${m.qtyDelta} cost ${m.costSatang} (คาด ${qty} @ ${cost})`);
    }
    if (ins.length !== 4) p.push(`IN ของ RV1 ${ins.length} (คาด 4)`);
    const curCost = Number((await P.invItem.findUnique({ where: { id: I.I1 ?? "-" } }).catch(() => null))?.costSatang ?? NaN);
    if (curCost === outCost(`pos-consume-${V.id}-${vNames.I1}`)) p.push("fixture: ต้นทุนถัวเฉลี่ยปัจจุบันไม่ต่างจากต้นทุนเดิม (ข้อสอบพิสูจน์ O12 ไม่ได้)");
    const ins2 = rv2 ? await P.invMovement.count({ where: { tenantId: T, idempotencyKey: { startsWith: `pos-refund-${rv2}` } } }).catch(() => NaN) : NaN;
    if (ins2 !== 0) p.push(`restock:false มี movement ${ins2}`);
    for (const [k, d] of [["I1", 1], ["C1", 2], ["C2", 1], ["G", 350]] as [string, number][]) {
      const now = Number((await P.invItem.findUnique({ where: { id: I[k] ?? "-" } }).catch(() => null))?.onHand ?? NaN);
      if (now !== onHand0[k]! + d) p.push(`onHand ${k} ${onHand0[k]}→${now} (คาด +${d})`);
    }
    chk("P1.8-C9", p.length === 0, "IN 4 รายการที่ต้นทุน OUT เดิม · restock:false ไม่มี · onHand ตาม", FX(p.join(" · ") || "ครบ"));
  }

  // ════════ C12 (§7 CD1) void บิลที่คืนบางส่วนแล้ว → HAS_REFUNDS ════════
  {
    const p: string[] = [];
    const snap = async () => {
      const w = { where: { tenantId: T } };
      return JSON.stringify({
        bal: await bal(C1), spend: await spend(C1), pl: await P.pointLedger.count(w).catch(() => -1), mv: await P.invMovement.count(w).catch(() => -1),
        je: await P.accountJournalEntry.count(w).catch(() => -1), st: await P.stampEvent.count(w).catch(() => -1),
      });
    };
    const before = await snap();
    const v = M.id ? await call(svc, "voidSale", T, U.A, M.id) : { ok: false, code: "NO_SALE" };
    await drain();
    const s = await row(M.id);
    if (!rm1) p.push(`ไม่มีการคืนบางส่วนก่อน (${codeOf(rm1r)})`);
    if (!(v?.ok === false && v.code === "HAS_REFUNDS")) p.push(`voidSale → ${v === undefined ? "สำเร็จ (ไม่ปฏิเสธ)" : codeOf(v)}`);
    else if (!THAI.test(String(v.message ?? ""))) p.push("ข้อความไม่ใช่ภาษาไทย");
    if (!(s?.status === "PAID" && s?.refundedSatang === 8500)) p.push(`บิล ${s?.status} refunded ${s?.refundedSatang}`);
    const ev = M.id ? await P.outboxEvent.count({ where: { tenantId: T, type: "pos.sale.voided", idempotencyKey: `PosSale#${M.id}#VOIDED` } }).catch(() => NaN) : NaN;
    if (ev !== 0) p.push(`outbox pos.sale.voided ${ev}`);
    const after = await snap();
    if (after !== before) p.push(`ย้อนซ้ำ ${before} → ${after}`.slice(0, 220));
    chk("P1.8-C12", p.length === 0, "HAS_REFUNDS · PAID 8,500 · ไม่มี voided · ไม่ย้อนซ้ำ", FX(p.join(" · ") || "ครบ"));
  }

  // ── คืนครบบิล M ──
  const rm2r = await refund(ctxOf("A"), owner, rin(M.id, [[M.L["ลาเต้ M"] ?? "", 1], [M.L["เค้กชุด M"] ?? "", 1]], [["CASH", 53500]]));
  const rm2 = rid(rm2r);
  await drain();
  const m2 = { bal: await bal(C1), spend: await spend(C1), lot: await lotOf(m0.earn?.lotId), stamps: await stampAdds(M.id) };
  {
    const p: string[] = [];
    if (!rm2) p.push(`RM2 ${codeOf(rm2r)} ${short(rm2r?.message ?? "", 60)}`);
    const cns = [...(await cnOf(rm1)), ...(await cnOf(rm2))];
    if (cns.length !== 2) p.push(`CREDIT_NOTE ${cns.length} (คาด 2)`);
    if (cns.some((d: Any) => d.sourceDocId !== m0.abb?.id)) p.push("CN ไม่อ้าง ABB");
    const es = await jvOf([M.id, rm1, rm2], cns.map((d: Any) => d.id));
    for (const code of ["1000", "4000", "2200", "1100"]) if (netCode(es, code) !== 0) p.push(`${code} สุทธิ ${netCode(es, code)}`);
    const book = (await P.accountJournalEntry.findMany({ where: { tenantId: T }, include: { lines: true } }).catch(() => [])) as Any[];
    const dr = sum(book.flatMap((e: Any) => e.lines ?? []).map((l: Any) => l.debit));
    const cr = sum(book.flatMap((e: Any) => e.lines ?? []).map((l: Any) => l.credit));
    if (dr !== cr || !book.length) p.push(`ทั้งสมุด dr ${dr} cr ${cr}`);
    const abb = await abbOf(M.id);
    if (!abb || abb.status === "VOIDED") p.push(`ABB ${short(abb?.status ?? null)}`);
    chk("P1.8-C3", p.length === 0, "CN 2 ใบ · บิล+CN สุทธิ 0 · สมุดสมดุล · ABB ไม่ VOID", FX(p.join(" · ") || "ครบ"));
  }
  {
    const p: string[] = [];
    const rows = ((await P.pointLedger.findMany({ where: { tenantId: T, customerId: C1, refType: "PosSale", refId: { in: [M.id, rm1, rm2].filter(Boolean) } } }).catch(() => [])) as Any[]);
    const net = sum(rows.map((r: Any) => r.delta));
    if (!(rows.length >= 2 && net === 0)) p.push(`แต้มของบิลสุทธิ ${net} (${rows.length} แถว)`);
    if (m2.bal !== m0.bal - Number(m0.earn?.delta ?? 0)) p.push(`ยอดแต้ม ${m2.bal} (คาด ${m0.bal - Number(m0.earn?.delta ?? 0)})`);
    if (Number(m2.lot?.remaining) !== 0) p.push(`ล็อต remaining ${m2.lot?.remaining}`);
    chk("P1.8-C6", p.length === 0 && !!rm2, "แต้มสุทธิ 0 · ยอดกลับเท่าก่อนซื้อ · ล็อต 0", FX(p.join(" · ") || (rm2 ? "ครบ" : "ไม่มี RM2")));
  }
  chk("P1.8-C7", m0.spend === 62000 && c7a === 53500 && m2.spend === 0, "62,000 → 53,500 → 0", FX(`${m0.spend} → ${c7a} → ${m2.spend}`));
  {
    const c8b = await stampVoids(m2.stamps.map((s: Any) => s.id));
    chk("P1.8-C8", m0.stamps.length === 1 && c8a.adds === 1 && c8a.voids === 0 && c8b === 1 && !!rm1 && !!rm2, "ตรา 1 · บางส่วน VOID 0 · ครบ VOID 1", FX(`ตรา ${m0.stamps.length} · หลังบางส่วน ADD ${c8a.adds} VOID ${c8a.voids} · หลังครบ VOID ${c8b}`));
  }
  // C10 เล่นซ้ำ ×2
  {
    const p: string[] = [];
    const handler = consMod?.consumers?.["pos.sale.refunded"];
    const snap = async () => {
      const w = { where: { tenantId: T } };
      const lots = (await P.pointLot.findMany(w).catch(() => [])) as Any[];
      const items = (await P.invItem.findMany(w).catch(() => [])) as Any[];
      const custs = (await P.customer.findMany(w).catch(() => [])) as Any[];
      const crs = (await P.couponRedemption.findMany(w).catch(() => [])) as Any[];
      return JSON.stringify({
        doc: await P.accountDocument.count(w).catch(() => -1), je: await P.accountJournalEntry.count(w).catch(() => -1), pl: await P.pointLedger.count(w).catch(() => -1),
        lot: sum(lots.map((l: Any) => l.remaining)), mv: await P.invMovement.count(w).catch(() => -1), oh: sum(items.map((i: Any) => i.onHand)),
        st: await P.stampEvent.count(w).catch(() => -1), act: await P.memberActivity.count(w).catch(() => -1), sp: sum(custs.map((c: Any) => c.totalSpentSatang)),
        cr: crs.map((c: Any) => c.status).sort().join(","), ob: await P.outboxEvent.count(w).catch(() => -1),
      });
    };
    const evs = ((await P.outboxEvent.findMany({ where: { tenantId: T, type: "pos.sale.refunded" }, orderBy: { createdAt: "asc" } }).catch(() => [])) as Any[]);
    const before = await snap();
    const errs: string[] = [];
    if (typeof handler !== "function") p.push("ไม่มี consumer pos.sale.refunded");
    else
      for (let round = 0; round < 2; round++)
        for (const e of evs) {
          try {
            await handler({ id: e.id, tenantId: e.tenantId, type: e.type, payload: e.payload, systemId: e.systemId, unitId: e.unitId });
          } catch (err) {
            errs.push(`${String(e.idempotencyKey).slice(-20)}: ${(err as Error).message.slice(0, 60)}`);
          }
        }
    const after = await snap();
    if (errs.length) p.push(`throw ${errs.length} (${errs[0]})`);
    if (before !== after) p.push(`เปลี่ยน ${before} → ${after}`.slice(0, 300));
    if (evs.length < 10) p.push(`event ${evs.length} (คาด ≥10)`);
    const notDone = evs.length ? await P.outboxEvent.count({ where: { tenantId: T, type: "pos.sale.refunded", status: { not: "DONE" } } }).catch(() => NaN) : NaN;
    if (notDone !== 0) p.push(`event ไม่ DONE ${notDone}`);
    chk("P1.8-C10", p.length === 0, "เล่นซ้ำ 2 รอบ ไม่ throw · ทุกตัวนับเท่าเดิม · DONE ทั้งหมด", FX(p.join(" · ") || `ครบ (${evs.length} event)`));
  }
  // Q1 read model
  {
    const p: string[] = [];
    const lines = Array.isArray(q1x?.lines) ? (q1x.lines as Any[]) : [];
    const rq = (id: string) => lines.find((l: Any) => l.lineId === id)?.refundableQty;
    if (q1x?.ok !== true) p.push(`X ${codeOf(q1x)}`);
    else {
      if (!(rq(xl1) === 2 && rq(xl2) === 1 && rq(xl3) === 1)) p.push(`refundableQty ${short(lines.map((l: Any) => [l.lineId === xl1 ? "เสื้อ" : l.lineId === xl2 ? "หมวก" : "ถุง", l.refundableQty]))}`);
      const rf = Array.isArray(q1x.refunds) ? (q1x.refunds as Any[]) : [];
      const x1 = await row(xRefunds[0] ?? "");
      if (!(rf.length === 1 && rf[0]?.receiptNo === x1?.receiptNo && rf[0]?.grandTotalSatang === xGrands[0])) p.push(`refunds ${short(rf, 100)}`);
      if (!Array.isArray(q1x.payments) || !q1x.payments.length) p.push("ไม่มี payments");
    }
    if (q1m?.ok !== true) p.push(`M ${codeOf(q1m)}`);
    else {
      if (q1m.member?.pointsEarned !== 62) p.push(`member.pointsEarned ${short(q1m.member?.pointsEarned)}`);
      if (!(typeof q1m.accounting?.docNo === "string" && q1m.accounting.docNo === m0.abb?.docNo)) p.push(`accounting.docNo ${short(q1m.accounting?.docNo)} (ABB ${short(m0.abb?.docNo)})`);
    }
    if (!refused(q1u, ["SALE_NOT_FOUND"])) p.push(`id ไม่มี → ${codeOf(q1u)}`);
    chk("P1.8-Q1", p.length === 0, "refundableQty 2/1/1 · refunds · member · accounting · NOT_FOUND", FX(p.join(" · ") || "ครบ"));
  }
  // E6 ปฏิเสธเป็นข้อมูล
  {
    const p: string[] = [];
    for (const [label, r, code] of refusals) {
      if (!(r?.ok === false && r.code === code && typeof r.message === "string" && THAI.test(r.message) && !r.threw)) p.push(`${label}: ${codeOf(r)}${r?.threw ? " (throw)" : ""}${typeof r?.message === "string" && !THAI.test(r.message) ? " (ไม่ไทย)" : ""}`);
    }
    chk("P1.8-E6", p.length === 0 && refusals.length >= 25, `${refusals.length} คำปฏิเสธเป็นข้อมูลไทย`, FX(p.slice(0, 6).join(" · ") + (p.length > 6 ? ` …(+${p.length - 6})` : "") || "ครบ"));
  }
}

// ═════════════════════════ 6. คืนสภาพ — ลบร้านชั่วคราวทั้งร้าน ═════════════════════════
type WipeReport = { tables: number; left: Record<string, number>; tenantLeft: number; err: string };
async function wipeTenant(): Promise<WipeReport> {
  const rep: WipeReport = { tables: 0, left: {}, tenantLeft: 0, err: "" };
  if (!T) return rep;
  try {
    const t = (await P.$queryRawUnsafe(`SELECT slug FROM "Tenant" WHERE id = $1`, T)) as Any[];
    if (t.length && t[0].slug !== T_SLUG) {
      rep.err = `slug ไม่ตรง (${t[0].slug}) — ไม่ลบ`;
      return rep;
    }
  } catch (e) {
    rep.err = `อ่าน Tenant ไม่ได้: ${(e as Error).message.slice(0, 60)}`;
    return rep;
  }
  // รอคิวของร้านนี้ (drain ที่ค้างในโปรเซสนี้) ก่อนลบ
  await drain();
  const tables = ((await P.$queryRawUnsafe(
    `SELECT c.table_name AS t FROM information_schema.columns c JOIN information_schema.tables t ON t.table_name = c.table_name AND t.table_schema = c.table_schema
     WHERE c.table_schema = current_schema() AND c.column_name = 'tenantId' AND t.table_type = 'BASE TABLE' ORDER BY 1`,
  )) as Any[]).map((r: Any) => String(r.t));
  rep.tables = tables.length;
  await P.$executeRawUnsafe(`UPDATE "AccountJournalEntry" SET "reversalOfId" = NULL WHERE "tenantId" = $1`, T).catch(() => {});
  let pending = [...tables];
  for (let pass = 0; pass < 10 && pending.length; pass++) {
    const next: string[] = [];
    for (const tb of pending) {
      try {
        await P.$executeRawUnsafe(`DELETE FROM "${tb}" WHERE "tenantId" = $1`, T);
      } catch {
        next.push(tb);
      }
    }
    pending = next;
  }
  try {
    await P.$executeRawUnsafe(`DELETE FROM "Tenant" WHERE id = $1 AND slug = $2`, T, T_SLUG);
  } catch (e) {
    rep.err = `ลบ Tenant ไม่ได้: ${(e as Error).message.slice(0, 80)}`;
  }
  for (const tb of tables) {
    try {
      const n = Number(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "${tb}" WHERE "tenantId" = $1`, T)) as Any[])[0]?.n ?? 0);
      if (n) rep.left[tb] = n;
    } catch {
      rep.left[tb] = -1;
    }
  }
  rep.tenantLeft = Number(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "Tenant" WHERE id = $1`, T)) as Any[])[0]?.n ?? 0);
  return rep;
}

// ═════════════════════════ 7. รัน ═════════════════════════
let crashed = "";
let wipe: WipeReport = { tables: 0, left: {}, tenantLeft: 0, err: "" };
try {
  await runStatic();
  await runDb();
} catch (e) {
  crashed = (e as Error)?.stack?.split("\n").slice(0, 3).join(" | ") ?? String(e);
  console.log(`💥 harness: ${crashed}`);
} finally {
  try {
    wipe = await wipeTenant();
    console.log(`  ลบร้านชั่วคราว ${T || "(ไม่ได้สร้าง)"}: ${wipe.tables} ตาราง · เหลือ ${JSON.stringify(wipe.left)} · Tenant ${wipe.tenantLeft}${wipe.err ? ` · ${wipe.err}` : ""}`);
  } catch (e) {
    wipe.err = `cleanup: ${(e as Error).message.slice(0, 200)}`;
    console.log(`💥 ${wipe.err}`);
  }
}
await sleep(200);
const countsAfter = await snapshotCounts();
const drift = Object.keys(countsBefore).filter((k) => countsBefore[k] !== countsAfter[k]).map((k) => `${k}:${countsBefore[k]}→${countsAfter[k]}`);
const tempLeft = Object.entries(wipe.left).map(([k, v]) => `${k}:${v}`);
chk("P1.8-Z1", drift.length === 0 && tempLeft.length === 0 && wipe.tenantLeft === 0 && !wipe.err, "ร้าน QC ก่อน = หลัง · ร้านชั่วคราว 0 แถว",
  [drift.length ? `ร้าน QC: ${drift.join(", ")}` : "ร้าน QC เท่าเดิม", tempLeft.length ? `ร้านชั่วคราวเหลือ ${tempLeft.join(", ")}` : `ร้านชั่วคราว 0 (${wipe.tables} ตาราง)`, wipe.tenantLeft ? "แถว Tenant ยังอยู่" : "", wipe.err].filter(Boolean).join(" · "));
const fpAfter = await fingerprint();
const fpDrift = Object.keys(fpBefore).filter((k) => fpBefore[k] !== fpAfter[k]).map((k) => `${k}:${fpBefore[k]}→${fpAfter[k]}`);
chk("P1.8-Z2", fpDrift.length === 0 && !Object.values(fpBefore).some((v) => v.startsWith("err")), "ลายนิ้วมือเท่าเดิมทุกตาราง", fpDrift.length ? fpDrift.join(", ") : `เท่าเดิม (${Object.entries(fpAfter).map(([k, v]) => `${k}=${v.split(":")[0]}`).join(" ")})`);
for (const [id] of CHECKS) if (!results.has(id)) chk(id, false, "ถูกตรวจ", crashed ? `ไม่ถึง (harness ล้ม: ${crashed.slice(0, 80)})` : "ไม่ถึง");
for (const c of lanes) await c.$disconnect?.().catch?.(() => {});
const failed = [...results.entries()].filter(([, r]) => !r.ok).map(([id]) => id);
console.log(`\n===== ${SUITE} ===== ผ่าน ${results.size - failed.length}/${results.size}${FORCE ? " (QC_FORCE)" : ""}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ suite: SUITE, total: results.size, passed: results.size - failed.length, failed, skipped: false, forced: FORCE, missing: skipReasons, a5: { drift, tempLeft } })}`);
await P.$disconnect?.().catch?.(() => {});
process.exit(failed.length ? 1 : 0);

// ─── หมายเหตุขอบเขต ───
// นอกขอบเขต P1.8 (R10): เครดิตร้าน (Q1) · คืนผ่านเกตเวย์ (P1.7) · อนุมัติ/PIN (P1.15) · พิมพ์ CN (P1.10) · จอ bills (P1.16) · API v1 refund ·
// เครื่องมือ AI · ย้ายตัวนับขายเข้า PosDocCounter · คืนเงินของใบคืน · สะพาน CRM/บอร์ดงาน (ไฟล์ร้อนของ CRM)
