// QC — POS RUN ใบ P2.9b S: มัดจำเป็นวิธีชำระของ POS (รับมัดจำ · ใช้มัดจำในบิล · คืนสภาพเมื่อ void · คืนเงินมัดจำ · VAT ตอนรับเงิน)
//   เขียนก่อนสร้าง (fail-before) · ผู้สร้าง (builder) P2.9b S
// requires: pos-seed
//
// สัญญา: ledger/pos-briefs/pos-brief-P2.9b.md §0 · §2 R1–R10 · §3 · §4 · §6 · §7 · §10 มติผู้คุมงาน 1–12 (ผูกมัด):
//   มติ 1 VAT ตอนรับเงิน (บิลที่ใช้มัดจำ vat = VAT(ยอดบิล) − Σ VAT ของมัดจำที่ใช้ · แบ่งตามสัดส่วน ใบสุดท้ายรับเศษ) ·
//   มติ 2 CD2-A อ้างใบรับมัดจำด้วย payMethods[].refSaleId (สัญญา createSale ไม่เปลี่ยน · หน้าขายส่ง {DEPOSIT, depositId}) ·
//   มติ 3 เอกสาร DEPOSIT_RECEIPT + บิลที่ใช้มัดจำมี depositDeductedSatang · มติ 4 สาขาเดียวกัน ≤ 3 ใบ/บิล เจ้าของ = สมาชิกของมัดจำ ·
//   มติ 5 คืนเงินมัดจำ = ทั้งยอดคงเหลือ (pos.sale.refund หรือ PIN ผู้จัดการ) · ใบรับมัดจำ void/คืนแบบบิลขายไม่ได้ ·
//   มติ 6 ไม่มีหมดอายุ · มติ 7 ทางเดิมของจอง/โรงแรม/เช่าไม่ถูกเปลี่ยน (PAR) · มติ 8 มัดจำนับเป็น "เงินจริง" ฝั่งที่จ่ายของเพดานคืนเงิน ·
//   มติ 10 ข้อสอบ 36–42 ข้อ · การแข่งพิสูจน์ด้วยธุรกรรมที่สามถือล็อก (แบบ HT2.8/2.9) · มติ 11 ใบรับมัดจำผ่าน regCreateSale (ไม่มีจุดเรียก createSale( ใหม่)
//
// ชื่อที่ข้อสอบนี้ตั้ง (ผู้สร้างต้องทำให้มีจริง — ตารางเต็มใน ledger/wo-notes/pos-P2.9b-oracle.md):
//   src/lib/modules/pos/deposit.ts: registerTakeDeposit(ctx, actor, {amountSatang, payMethods, memberId?, customerName?, phone?, note?, idempotencyKey})
//     → {ok:true, deposit:{id, receiptSaleId, receiptNo, …}, duplicated?} · registerRefundDeposit(ctx, actor, {depositId, payMethods, reason, idempotencyKey, managerPin?, managerUserId?})
//     · registerDepositLookup(ctx, actor, {query}) → {ok:true, deposits:[{id, receiptNo, customerName, phoneMasked, remainingSatang, status, expiresAt}]}
//     · depositSaleVoided(evt) (งานหลักของ pos.sale.voided หลัง tenderSaleVoided)
//   ตาราง PosDeposit / PosDepositTxn (migration 20261211100000_pos_p29b_deposits) · ใบรับมัดจำ = PosSale sourceModule "POS_DEPOSIT" sourceId = depositId memberId null
//   แถวใช้มัดจำ = PosPayment {type DEPOSIT, refSaleId = ใบรับมัดจำ} · APPLY คีย์ dep-apply-<saleId>-<depositId> · RESTORE คีย์ dep-restore-<applyTxnId>
//   รหัสปฏิเสธ DEPOSIT_NOT_FOUND DEPOSIT_NOT_OWNER DEPOSIT_EXCEEDS DEPOSIT_CLOSED · ค่าตั้ง settings.pos.deposit.enabled (updatePosPaymentSettings {deposit:{enabled}})
//   account facade: applyExternalDepositReceipt · applyExternalDepositRefund · applyExternalSale.depositVatSatang? · upsertExternalSaleDocument.depositDeductedSatang?
//   closeDaySummary(...).deposits {receivedSatang, appliedSatang} (ใบรับมัดจำไม่อยู่ในยอดขาย)
//   มติ 13: refundTenderCaps (pure) ตัวเดียวของ refund.ts + refund-tenders.ts (X8)
//
// ขอบเขต: ST สถิต · R รับมัดจำ · A บัญชี · P ใช้มัดจำ · C แข่ง · X ย้อน/คืนเงิน · L ของเดิม (PAR) · Z คืนสภาพ
//
// 🔴 กติกาข้อสอบ (แบบเดียวกับ qc-pos-p2.9): SKIP เมื่อของ P2.9b ยังไม่มี (exit 0 + เหตุผล) · QC_FORCE=1 = ข้ามด่าน SKIP (แดงตามเหตุผล ไม่ crash · L เขียว)
//    --list = พิมพ์ทุก id ไม่แตะ DB · --no-db = ข้อสถิต ST1–ST5 + L1–L3 (ไม่โหลด prisma)
//    ฐาน = QC4 เท่านั้น · ร้านชั่วคราว `posqc-p29b-<rand>` (+ `-t2`) ลบทั้งร้านใน finally · นับแถวค้างทุกตาราง = 0
//    ฟิกซ์เจอร์ผ่านฟังก์ชันของโมดูล — ยกเว้น: มัดจำของร้านอื่น (แถว PosDeposit ตรงในร้าน -t2) · SQL ดิบ = อ่านตารางใหม่/ถือล็อก/pg_stat_activity/ลบร้าน
//    ไม่มีเครือข่าย: globalThis.fetch = ตัวกั้น (503 + นับ) ตลอดช่วง DB
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const SUITE = "qc-pos-p2.9b";
const ROOT = process.cwd();
const LIST = process.argv.includes("--list");
const NODB = process.argv.includes("--no-db");
const FORCE = process.env.QC_FORCE === "1";
/** ฐานของใบ (session/pos e7b05787 · โค้ด 9ada96ef) — ข้อ L เทียบกับตัวนี้ */
const BASE_REV = "e7b05787";
/** ORACLE-EDIT ผู้คุม 23.10 (CD-P51-O6): หมุด L3 ของมัดจำโมดูล (5 ฟังก์ชัน + qc-booking-deposit) = head P5.1 batch B (มัดจำโมดูล = POS_DEPOSIT · P5.1 MA2 แทนมติ 7) ◂ */
const L3_PIN = process.env.P29B_L3_PIN || "2b377f5a";
/** sha256 ของ scripts/pos-sale-contract.json (มติ 2 CD2-A = ไม่เปลี่ยน · ค่าเดียวกับ qc-pos-p2.4 ST4 / p2.5 / p2.6 L3) */
const CONTRACT_SHA = "762e073cd5f80eeeb915835ae6b85e5793956facdfe233f90d65484db04dac55"; // ORACLE-EDIT ผู้คุม 21.10 (CD-RP9 · contract +4 optional keys P3.6 · ba68f669 → 762e073c) · ORACLE-EDIT ผู้คุม 17 ต.ค. (CD-RP1 qc-pos-p2.9b L1): sha สัญญาหลัง P3.4 S (0617d17b · +CreateSaleInput.offline) — เดิม 72afb258e9c0dc46c4d5ea2346835b6a56afda551038325d14ed9e12910546ad

// ═════════════════════════ ทะเบียนข้อสอบ ═════════════════════════
// X-group: S สถิต · X1 idempotency/เล่นซ้ำ/แข่ง · X2 ข้ามขอบเขต (404-not-403) · X3 สิทธิ์ · X4 เงิน · X5 ผลข้างเคียงครบ/ไม่เขียนอะไร · PAR = เขียวทั้งก่อนและหลัง · "-" เชิงหน้าที่
type Def = readonly [string, string, string];
const D = (id: string, x: string, title: string): Def => [`P2.9b-${id}`, x, title] as const;
const CHECKS: readonly Def[] = [
  // ── ST สถิต ──
  D("ST1", "S", "[§3 มติ 2] migration 20261211100000_pos_p29b_deposits: SET lock_timeout '3s' · enum PosDepositStatus (OPEN USED REFUNDED EXPIRED) + PosDepositTxnType (RECEIVE APPLY RESTORE REFUND) ใน DO-block · CREATE TABLE IF NOT EXISTS PosDeposit/PosDepositTxn (ไม่มี FK) · CHECK used ≥ 0 · refunded ≥ 0 · used + refunded ≤ amount · unique (receiptSaleId) (tenantId, idempotencyKey) (txn idempotencyKey) · index ตาม §3 · ไม่มี ALTER PosSale/PosPayment/DROP/DELETE/UPDATE · schema ตรง (PosPayment ไม่มี depositId)"),
  D("ST2", "S", "[§3 R2 R3 R5 R8 มติ 3 11] scope.ts PosDeposit: sys() + PosDepositTxn: tenant · pos-qc-env มีสองตาราง · pos/deposit.ts export registerTakeDeposit/registerRefundDeposit/registerDepositLookup/depositSaleVoided · account facade export applyExternalDepositReceipt/applyExternalDepositRefund + applyExternalSale.depositVatSatang + upsertExternalSaleDocument.depositDeductedSatang (มาร์ก POS P2.9b) · modules/pos/** ไม่ import account/<ไฟล์ใน> · ค่าตั้ง pos.deposit"),
  D("ST3", "S", "[R10] PosSaleErrorCode + RegisterRefusalCode + REFUSAL_KEY + pos.register.errors th/en ครบ DEPOSIT_NOT_FOUND DEPOSIT_NOT_OWNER DEPOSIT_EXCEEDS DEPOSIT_CLOSED (en ไม่มีอักษรไทย · th มี)"),
  D("ST4", "S", "[R4 มติ 11] ลำดับล็อกใน createSaleOnce: ตัวนับใบเสร็จ → lockTenderCards → ล็อกมัดจำ · SQL ล็อก PosDeposit ORDER BY id FOR UPDATE · ตัดยอดแบบมีเงื่อนไข usedSatang = usedSatang + x"),
  D("ST5", "S", "[R2 R3 R6 R8 §7] voidSale มีด่าน POS_DEPOSIT · pos.sale.voided เรียก depositSaleVoided หลัง tenderSaleVoided · bridgePosSalePaid แยกทาง POS_DEPOSIT → applyExternalDepositReceipt (ไม่ใช่ในไฟล์คิว) · refund-consumer แยกทาง POS_DEPOSIT → applyExternalDepositRefund"),
  // ── R รับมัดจำ ──
  D("R1", "X4", "[R1 R2] รับมัดจำ ฿1,070 เงินสดของสมาชิก X → ใบรับ PosSale POS_DEPOSIT sourceId = มัดจำ memberId null 1 บรรทัด \"มัดจำ…\" vat 70 · PosDeposit {107000, 7000, 0, 0, OPEN, X, สาขา A} · RECEIVE 1 แถว · X ของกะ expectedCash +1,070"),
  D("R2", "X1", "[R2] คีย์เดียวกัน ×10 พร้อมกัน → มัดจำ 1 ใบ ใบรับ 1 ใบ id เดียวกันทุกคำตอบ · คีย์เดิมยอดอื่น → IDEMPOTENCY_CONFLICT"),
  D("R3", "X3", "[R2 R10] ยอด 0/ติดลบ · แถวจ่าย GIFT_CARD/STORE_CREDIT/DEPOSIT/PLATFORM → VALIDATION · ไม่มี pos.sale.create → PERMISSION_DENIED · ร้านอื่น → NOT_FOUND · ค่าตั้งปิด → VALIDATION · ไม่มีมัดจำ/บิลเกิดทุกกรณี"),
  D("R4", "X5", "[R2 มติ 5] ใบรับมัดจำ: pointEarned 0 · memberId null · refundSale → SALE_NOT_REFUNDABLE · voidSaleByActor (ลิ้นชักบิล) → SALE_NOT_VOIDABLE · ใบยัง PAID มัดจำยัง OPEN"),
  D("R5", "-", "[R9 มติ 3] ใบรับพิมพ์หัว \"ใบรับเงินมัดจำ\" + \"ใบกำกับภาษีอย่างย่อ\" (สมุดจด VAT + ABB) · ใบเสร็จบิลที่ใช้มัดจำมี \"มัดจำ\" + เลขใบรับ · ปิดวัน: ยอดขายไม่รวมใบรับมัดจำ + deposits {receivedSatang, appliedSatang} ตรงฐาน · registerPayTenders.deposit {visible, enabled = ค่าตั้ง}"),
  // ── A บัญชี ──
  D("A1", "X4", "[R3 §4] JV ใบรับ: Dr 1000 1,070 · Cr 2110 1,000 · Cr 2200 70 (ไม่มี 4000/4030) · เล่น pos.sale.paid ×2 + ระบาย → JV 1 รายการ"),
  D("A2", "X4", "[R5 §4 มติ 1] ใช้เต็มบนบิล ฿2,140 (มัดจำ 1,070 + เงินสด 1,070) → PosSale.vatSatang 70 · JV Dr 1000 1,070 + Dr 2110 1,000 · Cr 4000 2,000 · Cr 2200 70 · Σ VAT (ใบรับ + บิล) 140 · APPLY {107000, vat 7000} · มัดจำ USED"),
  D("A3", "X4", "[R4 R5 มติ 1] ใช้บางส่วน 500 แล้ว 570 → VAT ของ APPLY 32.71 + 37.29 = 70 พอดี (ใบหลังรับเศษ) · vat ของสองบิล = VAT(ยอด) − VAT ของ APPLY · JV ทั้งสองตรงสตางค์ · มัดจำ USED"),
  D("A4", "X4", "[R3 R5] สาขา C (สมุดไม่จด VAT): ใบรับ vat 0 · JV Dr 1010 / Cr 2110 1,000 · บิลใช้ vat 0 JV Dr 2110 / Cr 4000 · สาขา D (POS ไม่ผูกสมุด): รับ + ใช้ได้ ไม่มี JV"),
  D("A5", "X4", "[มติ 3] เอกสาร: ใบรับ = DEPOSIT_RECEIPT grandTotal 1,070 vat 70 · บิลที่ใช้มัดจำ (A2) depositDeducted 1,070 + vatAmount สุทธิ 70"),
  D("A6", "PAR", "[CD-P51-O6 แทนมติ 7 CD7] booking.recordDeposit → ใบรับ POS_DEPOSIT แถว DEPOSIT ไม่อ้างใบ · JV Dr 1010 500 / Cr 2110 ฐาน 467.29 / Cr 2200 VAT 32.71 · ไม่มีบรรทัด 4xxx · มี PosDeposit + PosDepositTxn RECEIVE"), // ORACLE-EDIT ผู้คุม 23.10 (CD-P51-O6 · P5.1 MA2 แทนมติ 7 CD7) ◂
  // ── P ใช้มัดจำ ──
  D("P1", "X4", "[R4 มติ 2] หน้าขาย {DEPOSIT, depositId} + เงินสด → PAID · PosPayment DEPOSIT refSaleId = ใบรับ · APPLY คีย์ dep-apply-<saleId>-<depositId> paymentId = แถวจ่าย · used + 1,070 · USED"),
  D("P2", "X4", "[R4 มติ 4] สองมัดจำ + บัตรของขวัญ + เงินสดในบิลเดียว → Σ จ่ายตรง · APPLY 2 · USE 1 · vat = VAT(ยอด) − Σ VAT APPLY"),
  D("P3", "X5", "[R4] ใช้เกินคงเหลือ → DEPOSIT_EXCEEDS ไม่เขียน · มัดจำ USED / REFUNDED → DEPOSIT_CLOSED · ไม่มีบิล"),
  D("P4", "X2", "[R4 มติ 4] มัดจำสาขา B / ร้านอื่น / ไม่มีจริง → DEPOSIT_NOT_FOUND ข้อความเดียวกัน (createSale + หน้าขาย) · มัดจำของ X บนบิล Y / walk-in → DEPOSIT_NOT_OWNER · มัดจำ walk-in บนบิล Y → ok"),
  D("P5", "X5", "[R4 มติ 2 4] หน้าขาย DEPOSIT ไม่มี depositId → VALIDATION (PAR S3.38/T6) · ใบเดียวสองแถว / 4 ใบ / ทิปบนบิลมัดจำล้วน / บิล MEMBER / บิล POS_DEPOSIT → VALIDATION · ไม่มีบิล มัดจำไม่ถูกแตะ"),
  D("P6", "X5", "[R4 §1] payOrder แถว DEPOSIT (มี/ไม่มี depositId) → VALIDATION ออเดอร์ยังไม่จ่าย · API sales.create แถว DEPOSIT (+refSaleId) → schema ปฏิเสธ · CASH ผ่าน (ตัวควบคุมบวก)"),
  D("P7", "X2", "[R9] registerDepositLookup: เลขใบรับ / ชื่อ → พบ คงเหลือ + สถานะ · เบอร์ปิดบัง (ไม่มีเบอร์เต็ม) · สาขา B ไม่เห็น · ไม่มีสิทธิ์ → PERMISSION_DENIED · ไม่เขียนแถว"),
  // ── C แข่ง (ธุรกรรมที่สามถือล็อก) ──
  D("C1", "X1", "[R4] มัดจำ 500 สองเครื่องใช้เครื่องละ 300 พร้อมกัน (ทั้งคู่ถูกกั้น) → PAID 1 · อีกใบ DEPOSIT_EXCEEDS · used 300 ≤ amount · APPLY 1"),
  D("C2", "X1", "[R4] คีย์เดียวกัน ×10 พร้อมกัน (มัดจำ 100 + เงินสด) → บิล 1 ใบ saleId เดียวกัน · APPLY 1 · used 100"),
  D("C3", "X1", "[R4 N4] คีย์ที่บันทึกแล้วส่งซ้ำด้วยมัดจำใบอื่น (createSale + หน้าขาย) → IDEMPOTENCY_CONFLICT · มัดจำใบอื่นไม่ถูกแตะ"),
  D("C4", "X1", "[R4 R8] ใช้มัดจำ ∥ คืนเงินมัดจำ (ถูกกั้นทั้งคู่) → ชนะหนึ่ง อีกฝั่ง DEPOSIT_CLOSED/EXCEEDS · used + refunded ≤ amount (CHECK)"),
  // ── X ย้อน/คืนเงิน ──
  D("X1", "X5", "[R6] void บิลที่ใช้มัดจำ (สมาชิก X) → RESTORE คีย์ dep-restore-<APPLY> · OPEN used 0 · JV ขายถูกกลับ (2110 + 2200 สุทธิ 0) · เล่น pos.sale.voided ×2 + ระบาย → ไม่เพิ่ม · บิล walk-in ก็คืน"),
  D("X2", "X4", "[R7 มติ 8] คืนบางส่วนของบิลมัดจำ + บัตร + เงินสด: เงินสด ≤ เงินสด + มัดจำ → ok มัดจำไม่ขยับ · เกินเพดาน → REFUND_METHOD_INVALID · DEPOSIT เป็นวิธีคืน → REFUND_METHOD_INVALID (E4 PAR) · ส่วนบัตรคืนเข้าบัตร ok"),
  D("X3", "X4", "[R8 มติ 5] คืนเงินมัดจำที่ยังไม่ใช้ (ผู้จัดการ) → ใบคืน REFUND refSaleId = ใบรับ เลข CN · REFUNDED · REFUND txn vat 70 · JV Dr 2110 1,000 + Dr 2200 70 / Cr 1000 1,070 · ใบลดหนี้ · ซ้ำคีย์เดิม + เล่น pos.sale.refunded ×2 → ไม่เพิ่ม"),
  D("X4", "X4", "[R8 §4] คืนคงเหลือ 570 หลังใช้ 500 → REFUND txn vat 37.29 · used 500 เท่าเดิม · REFUNDED · JV Dr 2110 532.71 + Dr 2200 37.29 / Cr 1000 570"),
  D("X5", "X3", "[R8 มติ 5] ใช้หมดแล้ว → DEPOSIT_CLOSED · แคชเชียร์ไม่มีสิทธิ์คืน → PERMISSION_DENIED · ไม่มีเหตุผล → REASON_REQUIRED · วิธีคืนไม่ใช่เงิน / ยอด ≠ คงเหลือ → VALIDATION · ไม่มีใบคืน"),
  D("X6", "X4", "[R6 R8] void บิลที่ใช้มัดจำหลังคืนคงเหลือไปแล้ว → RESTORE · used 0 refunded 570 · คงเหลือ 500 → OPEN · ไม่ติดลบ"),
  D("X7", "X5", "[R2 มติ 5] voidSale(ใบรับมัดจำ) โดยตรง → ปฏิเสธ · ใบยัง PAID · มัดจำ OPEN · ไม่มี pos.sale.voided ของใบรับ"),
  // มติ 13 (ภาคผนวก 15 ต.ค. 02:4xZ จาก P2.11) ▸ ตัวช่วยเพดานคืนตัวเดียวของ refund.ts + refund-tenders.ts ◂
  D("X8", "X4", "[มติ 13 R7] refundTenderCaps (pure · export จาก refund-shared.ts หรือไฟล์ pure ใหม่ · ไม่ import prisma) ถูกใช้ทั้ง refund.ts และ refund-tenders.ts · บิลบัตร + มัดจำ + เงินสด: refundTenderOptions.cashLikeCapSatang = เงินสด + มัดจำ (2,000) = ยอดที่ server รับจริง · หลังคืน 2,000 → 0 = server ปฏิเสธ · capSatang ของบัตร 1,000"),
  // ORACLE-ADD ผู้คุม 15 ต.ค. (P2.9b fix 1 · มติรอบแก้ 1–6) ▸ R1 F2 · hunt D1–D5 ◂
  D("A7", "X4", "[fix1 มติ 1 · R1 F2] มัดจำ ฿1.00 (VAT 7 สต.) ใช้ 50 + 50 สต. → 2110 สุทธิ 0 หลังใช้ครบ · APPLY แต่ละแถว ≤ VAT ของยอดแถว (splitIncludedVat) · Σ APPLY = 7 · มัดจำเล็กใช้ 50 แล้วคืนคงเหลือ → REFUND vat = VAT ที่ยังไม่ปล่อยพอดี · 2110 สุทธิ 0"),
  D("X9", "X4", "[fix1 มติ 2 · hunt D1] คืนเงินบิลที่ใช้มัดจำ: บิล ฿1,070 จ่ายมัดจำล้วน คืนครบ → ใบคืน VAT 70 · ใบรับ+บิล+ใบคืน สุทธิ 0 ทุกบัญชี · บิลผสม ฿2,140 คืนครบ → VAT 140 · คืนสองครั้ง Σ VAT 140 พอดี"),
  D("A8", "X4", "[fix1 มติ 3 · hunt D2] รับมัดจำตอน POS ไม่ผูกสมุด → ผูกสมุด → ใช้ → JV ใบรับถูกลงก่อน/พร้อมบิล · 2110 สุทธิ 0 · VAT 70 ครั้งเดียว · สมุดเลิกจด VAT ระหว่างรับกับใช้ → 2110 สุทธิ 0"),
  D("R6", "-", "[fix1 มติ 4 · hunt D3] หลังใบรับ ฿1,070 + บิล ฿2,140 ที่ใช้มัดจำนั้น (กะเดียวกัน): X ยอดขาย +2,140 · บิล +1 · เงินสดที่ควรมี +2,140 (แถวเงินสดจริง) · รายงานรายวันยอดขาย +2,140"),
  D("P8", "X2", "[fix1 มติ 5 · hunt D4] สมาชิก M ถูกรวมเข้า K → มัดจำของ M ใช้บนบิลของ K ได้ · สมาชิกอื่น Z → DEPOSIT_NOT_OWNER"),
  D("P9", "X2", "[fix1 มติ 6 · hunt D5] มัดจำ walk-in ที่มีเบอร์: หน้าขายต้องส่ง 4 หลักท้าย (ไม่ส่ง/ผิด → DEPOSIT_NOT_OWNER · ถูก → PAID) · ค้นด้วยชื่อ < 3 ตัว → VALIDATION · ≥ 3 ตัว → ไม่มียอดคงเหลือ · เลขใบรับ + 4 หลักถูก → มียอด · มัดจำไม่มีเบอร์ = ผู้ถือใบรับ (ใช้ได้)"),
  // ORACLE-ADD ผู้คุม 15 ต.ค. (P2.9b fix 2 · มติรอบแก้ 1–4) ▸ R2 F1 · hunter N1 N2 · D3 ◂
  D("P10", "X2", "[fix2 มติ 1 · R2 F1] ค้นด้วยสมาชิก A + ชื่อที่ตรงมัดจำของสมาชิก B ด้วย → แถวของ B ไม่มียอด · มัดจำของ A และของสมาชิกที่ถูกรวมเข้า A มียอด"),
  D("A9", "X4", "[fix2 มติ 2 · hunter N1] มัดจำ ฿1,070 (VAT 70) ตอนจด VAT → เลิกจด → ใช้ ฿1,050 แล้ว ฿20 → 2110 สุทธิ 0 · Σ VAT ที่ปล่อย 70 · แบบคืนเงิน ฿20 ที่เหลือแทน → 2110 สุทธิ 0 · Σ 70"),
  D("P11", "X2", "[fix2 มติ 3 · hunter N2] มัดจำ walk-in ที่มีเบอร์: ค้น / รายละเอียดบิล / ใบเสร็จ ไม่มี 4 หลักท้าย (เบอร์ปิดหมดเว้น 3 ตัวแรก · ไม่มี phoneLast4) · ผิด 5 ครั้ง → DEPOSIT_LOCKED · ครั้งที่ 6 ถูกก็ยังถูกปฏิเสธจนพ้นเวลาล็อก · ยอดไม่ขยับ"),
  // ORACLE-ADD ผู้คุม 15 ต.ค. (P2.9b fix 3 · มติรอบแก้ 2 · R3 F2 / hunter F1) ◂
  D("P12", "X2", "[fix3 มติ 2 · มติ 19 แก้] ค้นด้วยเลข 4 หลัก (= 4 หลักท้ายของเบอร์) → ไม่พบมัดจำจากเบอร์ · ตัวนับผิด/ล็อกไม่ขยับ · หน้าขายส่ง 4 หลักถูก → ผ่านครั้งแรก"),
  // ORACLE-ADD ผู้คุม 15 ต.ค. (P2.9b fix 4 · มติรอบแก้ 1 2 · R4 F2 / hunter N1 N2) ◂
  // ORACLE-EDIT ผู้คุม 15 ต.ค. (HF-FU z1 z2 · มติ 8): + posSalePosted(บิล ฿20) true · เครื่องหมาย zero entry แถวเดียวหลังเล่นซ้ำ ◂
  D("A10", "X4", "[fix4 มติ 1 · R4 F2 / hunter N1 · HF-FU มติ 8] ฉาก A9 บนช่องทาง DIRECT ค่าคอมฯ 10% (สมุดเลิกจด VAT · บิลสุดท้าย ฿20 ไม่มี JV ขาย) → COMMISSION ของบิล ฿20 ลงครั้งเดียว Dr 6500 200 / Cr 2100 200 · posSalePosted(บิล ฿20) = true (เครื่องหมาย + เอกสาร) · pos.sale.paid DONE · เล่นซ้ำไม่เพิ่ม · เครื่องหมาย account.external.zeroEntry 1 แถว · คืนบิลนั้นครบ → COMMISSION_REFUNDED ครั้งเดียว Dr 2100 200 / Cr 6500 200 (ไม่เงียบ no-commission) · 6500/2100 ของบิลสุทธิ 0"),
  D("X10", "X4", "[fix4 มติ 2 · hunter N2] คืนบิล ฿20 (zero entry) หลังเลิกจด VAT → ใบคืน VAT 2000 · JV ใบคืน Dr 2200 2000 / Cr 1010 2000 (รายได้ไม่ถูกแตะ) · รวมใบรับ+บิล+ใบคืน: รายได้ 100000 · 2200 เหลือ 5000 · 2110 สุทธิ 0 (= ทางคืนเงินมัดจำที่เหลือ) · ใบลดหนี้ VAT ฿20"),
  // ── L ของเดิม (PAR) ──
  D("L1", "PAR", "[§7 มติ 2] scripts/pos-sale-contract.json sha256 = 72afb258… (CD2-A ไม่เปลี่ยนสัญญา)"),
  D("L2", "PAR", "[§7 มติ 11 HF-TX] ผู้เรียก createSale( ใน src ต่อไฟล์ = ฐาน e7b05787 (ใบรับผ่าน regCreateSale)"),
  D("L3", "PAR", "[มติ 7 → CD-P51-O6] มัดจำโมดูล = POS_DEPOSIT (CD-P51-O6) · หมุด = head P5.1 batch B: booking recordDeposit/refundDeposit · hotel recordDeposit/checkOut · rental recordRentalDeposit + qc-booking-deposit ตรงหมุดทุกไบต์ (ตัดคอมเมนต์) · qc-hotel-public/qc-rental-public ไม่ถูกแก้ (ฐาน)"), // ORACLE-EDIT ผู้คุม 23.10 (CD-P51-O6) ◂
  D("L4", "PAR", "[§7] บิลไม่มีมัดจำเหมือนเดิม: เงินสด 300 + บัตร 325 → JV Dr 1000 300 · Dr 2110 325 · Cr 4000/2200 ของ 625 · vatSatang = VAT(ยอด) · บิลเงินสดล้วน vat + JV เดิม · ไม่มี PosDepositTxn"),
  // ── Z คืนสภาพ ──
  D("Z1", "-", "QC4 คืนสภาพ: ร้านชั่วคราว (+ -t2) เหลือ 0 แถวทุกตารางที่มี tenantId (รวม PosDeposit/PosDepositTxn) + Tenant ถูกลบ"),
  D("Z2", "-", "ร้าน QC ของ seed ไม่มีแถวของรอบนี้ (บิล/มัดจำ/txn/outbox/audit ที่มีรหัสรอบ) — นับก่อน/หลังพิมพ์เป็นข้อมูล"),
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
  const full = id.startsWith("P2.9b-") ? id : `P2.9b-${id}`;
  if (!TITLE.has(full)) throw new Error(`ข้อสอบเรียก id ที่ไม่ได้ลงทะเบียน: ${full}`);
  const r = { ok: !!ok, expected: String(expected), actual: String(actual) };
  results.set(full, r);
  console.log(`  ${r.ok ? "✅" : "❌"} [${full}] ${TITLE.get(full)}${r.ok ? "" : ` — expected ${r.expected} | actual ${r.actual}`}`);
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
const codeOf = (r: Any): string => (r && r.ok === false ? String(r.code ?? "NO_CODE") : r && r.ok === true ? "OK" : r && typeof r === "object" && r.saleId ? "OK" : r === undefined ? "undefined" : r === null ? "null" : "UNKNOWN");
const THAI = /[ก-๛]/;
const refused = (r: Any, ...codes: string[]) => r?.ok === false && codes.includes(String(r.code));
function errCode(e: unknown): string {
  const o = e as { code?: unknown; message?: unknown } | null;
  if (o && typeof o.code === "string" && /^[A-Z][A-Z0-9_]+$/.test(o.code)) return o.code;
  const m = /^([A-Z][A-Z0-9_]{3,})\b/.exec(String(o?.message ?? ""));
  if (m) return m[1]!;
  return "THROW";
}
const MISSING = "ยังไม่มีโมดูล/ฟังก์ชัน";
async function call(mod: Any, name: string, ...args: unknown[]): Promise<Any> {
  const fn = mod?.[name];
  if (typeof fn !== "function") return { ok: false, code: `MISSING:${name}`, message: `${MISSING} — ฟังก์ชัน ${name}`, missing: true };
  try {
    return await fn(...args);
  } catch (e) {
    return { ok: false, code: errCode(e), message: String((e as Error)?.message ?? e).slice(0, 200), threw: true, name: (e as Error)?.name };
  }
}
const tryImport = async (p: string): Promise<Any> => {
  try {
    return await import(p as string);
  } catch (e) {
    console.log(`  (โหลด ${p} ไม่ได้: ${(e as Error).message.slice(0, 140)})`);
    return null;
  }
};
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const isRecord = (v: unknown): v is Record<string, Any> => !!v && typeof v === "object" && !Array.isArray(v);
const camel = (code: string) => code.toLowerCase().replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());
const joinP = (p: string[], ok = "ครบ") => p.slice(0, 8).join(" · ") + (p.length > 8 ? ` …(+${p.length - 8})` : "") || ok;
/** ปัดครึ่งขึ้นของ a/b (จำนวนเต็มบวก) — สูตรส่วน VAT ของ APPLY (§2 R4) */
const roundHalfUp = (a: number, b: number) => Math.floor((2 * a + b) / (2 * b));
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
// ORACLE-EDIT ผู้คุม 16 ต.ค. (P2.14 TL-2) ▸ ตัดคอมเมนต์แบบไล่ตัวอักษร (เคารพสตริง '…' "…" `…` และคอมเมนต์บรรทัด) — แบบ regex เดิม
//   ให้ "/*" ที่อยู่ในคอมเมนต์บรรทัด (เช่น /m/* ใน scope.ts) กลืนโค้ดยาวถึง "*/" ถัดไป ⇒ ST2 อ่าน scope.ts ไม่ครบ (pos-P2.9b.md:48) · โมเดลเดียวกับ stripCode ของ qc-pos-p2.14 ◂
function stripComments(src: string): string {
  let out = "";
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i]!;
    const d = src[i + 1];
    if (c === "/" && d === "/") {
      while (i < n && src[i] !== "\n") i++;
      continue;
    }
    if (c === "/" && d === "*") {
      const e = src.indexOf("*/", i + 2);
      i = e < 0 ? n : e + 2;
      continue;
    }
    if (c === "'" || c === '"' || c === "`") {
      const q = c;
      out += c;
      i++;
      while (i < n && src[i] !== q) {
        if (src[i] === "\\" && i + 1 < n) {
          out += src[i]! + src[i + 1]!;
          i += 2;
          continue;
        }
        if (q !== "`" && src[i] === "\n") break;
        out += src[i]!;
        i++;
      }
      if (i < n) out += src[i]!;
      i++;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}
const stripPrismaComments = (s: string) => s.replace(/\/\/.*$/gm, "");
const exportsFn = (src: string, n: string) => new RegExp(`export\\s+(async\\s+)?function\\s+${n}\\b|export\\s+const\\s+${n}\\b|export\\s*\\{[^}]*\\b${n}\\b[^}]*\\}`).test(src);
function prismaBlock(src: string, kind: "model" | "enum", name: string): string {
  const m = new RegExp(`\\b${kind}\\s+${name}\\s*\\{`).exec(src);
  if (!m) return "";
  const end = src.indexOf("\n}", m.index);
  return end < 0 ? "" : src.slice(m.index, end + 2);
}
const fieldLine = (block: string, f: string): string => (new RegExp(`^\\s*${f}\\s+[^\\n]*$`, "m").exec(block)?.[0] ?? "").trim();
function fnBody(src: string, n: string): string {
  const m = new RegExp(`(export\\s+)?(async\\s+)?function\\s+${n}\\b`).exec(src);
  if (!m) return "";
  const next = src.slice(m.index + 10).search(/\n(export\s|async function\s|function\s)/);
  return next < 0 ? src.slice(m.index) : src.slice(m.index, m.index + 10 + next);
}
function gitBuf(args: string[]): Buffer | null {
  try {
    return execFileSync("git", ["-C", ROOT, ...args], { stdio: ["ignore", "pipe", "ignore"], maxBuffer: 64 << 20 });
  } catch {
    return null;
  }
}

const POS_DIR = "src/lib/modules/pos";
const F = {
  deposit: `${POS_DIR}/deposit.ts`,
  tender: `${POS_DIR}/tender.ts`,
  service: `${POS_DIR}/service.ts`,
  bridge: `${POS_DIR}/account-bridge.ts`,
  shared: `${POS_DIR}/register-shared.ts`,
  refundConsumer: `${POS_DIR}/refund-consumer.ts`,
  paySet: `${POS_DIR}/payment-settings.ts`,
  account: "src/lib/modules/account/index.ts",
  accountService: "src/lib/modules/account/service.ts",
  consumers: "src/lib/outbox-consumers.ts",
  scope: "src/lib/core/scope.ts",
  qcEnv: "scripts/pos-qc-env.mts",
  msgTh: "src/messages/th/pos.json",
  msgEn: "src/messages/en/pos.json",
  contract: "scripts/pos-sale-contract.json",
  migration: "prisma/migrations/20261211100000_pos_p29b_deposits/migration.sql",
  booking: "src/lib/modules/booking/service.ts",
  hotel: "src/lib/modules/hotel/service.ts",
  rental: "src/lib/modules/rental/service.ts",
};
const NEW_CODES = ["DEPOSIT_NOT_FOUND", "DEPOSIT_NOT_OWNER", "DEPOSIT_EXCEEDS", "DEPOSIT_CLOSED"];
const DEP_FNS = ["registerTakeDeposit", "registerRefundDeposit", "registerDepositLookup", "depositSaleVoided"];
const ACC_FNS = ["applyExternalDepositReceipt", "applyExternalDepositRefund"];
/** ทางมัดจำเดิมที่ต้องไม่ถูกแตะ (มติ 7) — [ไฟล์, ฟังก์ชัน] */
const LEGACY_FNS: [string, string][] = [
  [F.booking, "recordDeposit"],
  [F.booking, "refundDeposit"],
  [F.hotel, "recordDeposit"],
  [F.hotel, "checkOut"],
  [F.rental, "recordRentalDeposit"],
];
// ORACLE-EDIT ผู้คุม 23.10 (CD-P51-O6): qc-booking-deposit ย้ายไปหมุด L3_PIN (แก้ตาม MA2) · qc-hotel-public / qc-rental-public คง "ไม่ถูกแก้" เทียบ BASE_REV ◂
const LEGACY_SUITES = ["scripts/qc-hotel-public.mts", "scripts/qc-rental-public.mts"];
const L3_PIN_SUITES = ["scripts/qc-booking-deposit.mts"];
const srcOf = (f: string) => stripComments(rd(f));
const STATIC_IDS = ["ST1", "ST2", "ST3", "ST4", "ST5", "L1", "L2", "L3"].map((x) => `P2.9b-${x}`);
const skipReasons: string[] = [];
if (!existsSync(join(ROOT, F.deposit))) skipReasons.push(`${F.deposit} ยังไม่มี`);
for (const n of DEP_FNS) if (!exportsFn(srcOf(F.deposit), n)) skipReasons.push(`ยังไม่มี export ${n} (pos/deposit.ts)`);
if (!existsSync(join(ROOT, F.migration))) skipReasons.push("ยังไม่มี migration 20261211100000_pos_p29b_deposits");

// ═════════════════════════ 1. ข้อสถิต ═════════════════════════
function runStatic(): void {
  console.log("\n── ST/L ข้อสถิต (ไม่แตะ DB) ──");
  const schemaSrc = walk("prisma/schema", [], /\.prisma$/).map((f) => stripPrismaComments(rd(f))).join("\n");
  // ST1 migration + schema
  {
    const p: string[] = [];
    const mig = rd(F.migration).replace(/--.*$/gm, "");
    const cols = (cs: string[]) => cs.map((c) => `"${c}"`).join("\\s*,\\s*");
    const hasIndex = (table: string, cs: string[], unique: boolean) =>
      new RegExp(`CREATE\\s+${unique ? "UNIQUE\\s+" : ""}INDEX\\s+IF\\s+NOT\\s+EXISTS\\s+"[^"]+"\\s+ON\\s+"${table}"\\s*\\(\\s*${cols(cs)}\\s*\\)`, "i").test(mig) ||
      (unique && new RegExp(`CREATE\\s+TABLE\\s+IF\\s+NOT\\s+EXISTS\\s+"${table}"[\\s\\S]*?UNIQUE\\s*\\(\\s*${cols(cs)}\\s*\\)[\\s\\S]*?\\);`, "i").test(mig));
    if (!mig) p.push("ไม่มีไฟล์ migration");
    else {
      if (!/SET\s+lock_timeout\s*=\s*'3s'/i.test(mig)) p.push("ไม่มี SET lock_timeout = '3s'");
      if (!/DO\s+\$\$[\s\S]*CREATE\s+TYPE\s+"PosDepositStatus"\s+AS\s+ENUM\s*\(\s*'OPEN'\s*,\s*'USED'\s*,\s*'REFUNDED'\s*,\s*'EXPIRED'\s*\)[\s\S]*?\$\$/i.test(mig)) p.push("ไม่มี PosDepositStatus (OPEN USED REFUNDED EXPIRED) ใน DO-block");
      if (!/DO\s+\$\$[\s\S]*CREATE\s+TYPE\s+"PosDepositTxnType"\s+AS\s+ENUM\s*\(\s*'RECEIVE'\s*,\s*'APPLY'\s*,\s*'RESTORE'\s*,\s*'REFUND'\s*\)[\s\S]*?\$\$/i.test(mig)) p.push("ไม่มี PosDepositTxnType (RECEIVE APPLY RESTORE REFUND) ใน DO-block");
      for (const t of ["PosDeposit", "PosDepositTxn"]) if (!new RegExp(`CREATE\\s+TABLE\\s+IF\\s+NOT\\s+EXISTS\\s+"${t}"\\s*\\(`, "i").test(mig)) p.push(`ไม่มี CREATE TABLE IF NOT EXISTS "${t}"`);
      if (!/CHECK\s*\(/i.test(mig)) p.push("ไม่มี CHECK");
      for (const [lbl, re] of [
        ["used ≥ 0", /"usedSatang"\s*>=\s*0/],
        ["refunded ≥ 0", /"refundedSatang"\s*>=\s*0/],
        ["used + refunded ≤ amount", /"usedSatang"\s*\+\s*"refundedSatang"\s*<=\s*"amountSatang"/],
      ] as const)
        if (!re.test(mig)) p.push(`CHECK ไม่มี ${lbl}`);
      if (!hasIndex("PosDeposit", ["receiptSaleId"], true)) p.push("ไม่มี unique (receiptSaleId)");
      if (!hasIndex("PosDeposit", ["tenantId", "idempotencyKey"], true)) p.push("ไม่มี unique (tenantId, idempotencyKey)");
      if (!hasIndex("PosDeposit", ["tenantId", "unitId", "status", "createdAt"], false)) p.push("ไม่มี index (tenantId, unitId, status, createdAt)");
      if (!hasIndex("PosDeposit", ["tenantId", "customerId"], false)) p.push("ไม่มี index (tenantId, customerId)");
      if (!hasIndex("PosDepositTxn", ["idempotencyKey"], true)) p.push("PosDepositTxn ไม่มี unique (idempotencyKey)");
      if (!hasIndex("PosDepositTxn", ["depositId"], false)) p.push("PosDepositTxn ไม่มี index (depositId)");
      if (!hasIndex("PosDepositTxn", ["saleId"], false)) p.push("PosDepositTxn ไม่มี index (saleId)");
      for (const bad of [/\bDROP\b/i, /\bDELETE\b/i, /\bUPDATE\b/i, /\bRENAME\b/i, /\bREFERENCES\b/i, /ALTER\s+TABLE\s+"PosSale"/i, /ALTER\s+TABLE\s+"PosPayment"/i]) if (bad.test(mig)) p.push(`มีคำสั่งต้องห้าม ${bad.source}`);
    }
    const spec: Record<string, [string, string][]> = {
      PosDeposit: [
        ["id", "String"], ["tenantId", "String"], ["systemId", "String"], ["unitId", "String"], ["customerId", "String\\?"], ["customerName", "String\\?"], ["phoneMasked", "String\\?"],
        ["amountSatang", "Int"], ["vatSatang", "Int"], ["usedSatang", "Int"], ["refundedSatang", "Int"], ["status", "PosDepositStatus"], ["receiptSaleId", "String"], ["receiptNo", "String\\??"],
        ["note", "String\\?"], ["reference", "String\\?"], ["expiresAt", "DateTime\\?"], ["idempotencyKey", "String"], ["createdByUserId", "String"], ["createdAt", "DateTime"], ["updatedAt", "DateTime"],
      ],
      PosDepositTxn: [
        ["id", "String"], ["tenantId", "String"], ["depositId", "String"], ["type", "PosDepositTxnType"], ["satang", "Int"], ["vatSatang", "Int"], ["saleId", "String\\?"], ["paymentId", "String\\?"], ["refTxnId", "String\\?"], ["idempotencyKey", "String"], ["createdAt", "DateTime"],
      ],
    };
    for (const [model, fields] of Object.entries(spec)) {
      const blk = prismaBlock(schemaSrc, "model", model);
      if (!blk) {
        p.push(`schema ไม่มี model ${model}`);
        continue;
      }
      const bad = fields.filter(([f, t]) => !new RegExp(`^${f}\\s+${t}(\\s|$)`).test(fieldLine(blk, f))).map(([f]) => f);
      if (bad.length) p.push(`${model} ฟิลด์ไม่ตรง ${bad.join(",")}`);
      if (/@relation/.test(blk)) p.push(`${model} มี @relation (ต้อง loose id ไม่มี FK)`);
    }
    if (!/^receiptSaleId\s+String\s+[^\n]*@unique/.test(fieldLine(prismaBlock(schemaSrc, "model", "PosDeposit"), "receiptSaleId")) && !/@@unique\(\[\s*receiptSaleId\s*\]/.test(prismaBlock(schemaSrc, "model", "PosDeposit"))) p.push("PosDeposit.receiptSaleId ไม่ unique");
    for (const [en, vals] of [["PosDepositStatus", ["OPEN", "USED", "REFUNDED", "EXPIRED"]], ["PosDepositTxnType", ["RECEIVE", "APPLY", "RESTORE", "REFUND"]]] as const) {
      const blk = prismaBlock(schemaSrc, "enum", en);
      const miss = vals.filter((v) => !new RegExp(`^\\s*${v}\\b`, "m").test(blk));
      if (!blk || miss.length) p.push(`schema enum ${en} ขาด ${miss.join(",") || "ทั้งหมด"}`);
    }
    if (fieldLine(prismaBlock(schemaSrc, "model", "PosPayment"), "depositId")) p.push("PosPayment มี depositId (มติ 2 = CD2-A)");
    chk("ST1", p.length === 0, "migration + schema ตาม §3 (CD2-A)", joinP(p));
  }
  // ST2 scope + qc-env + exports + facade
  {
    const p: string[] = [];
    const sc = srcOf(F.scope);
    if (!/\bPosDeposit\s*:\s*sys\(\s*\)/.test(sc)) p.push("scope.ts ไม่มี PosDeposit: sys()");
    if (!/\bPosDepositTxn\s*:\s*tenant\b/.test(sc)) p.push("scope.ts ไม่มี PosDepositTxn: tenant");
    const env = srcOf(F.qcEnv);
    for (const m of ["PosDeposit", "PosDepositTxn"]) if (!new RegExp(`model\\s*:\\s*["']${m}["']`).test(env)) p.push(`pos-qc-env ไม่มี ${m}`);
    const dep = srcOf(F.deposit);
    for (const n of DEP_FNS) if (!exportsFn(dep, n)) p.push(`deposit.ts ไม่มี ${n}`);
    const acc = srcOf(F.account);
    for (const n of ACC_FNS) if (!exportsFn(acc, n)) p.push(`account facade ไม่มี ${n}`);
    if (!/depositVatSatang/.test(fnBody(acc, "applyExternalSale"))) p.push("applyExternalSale ไม่มี depositVatSatang");
    if (!/depositDeductedSatang/.test(fnBody(srcOf(F.accountService), "upsertExternalSaleDocument"))) p.push("upsertExternalSaleDocument ไม่มี depositDeductedSatang");
    if (!/POS P2\.9b ▸/.test(rd(F.account))) p.push("account/index.ts ไม่มีมาร์ก // POS P2.9b ▸ … ◂");
    for (const f of walk(POS_DIR)) {
      const s = stripComments(rd(f));
      if (/from\s+["']@\/lib\/modules\/account\/[^"']+["']|import\(\s*["']@\/lib\/modules\/account\//.test(s)) p.push(`${f.replace(`${POS_DIR}/`, "")} import account/<ไฟล์ใน>`);
    }
    if (!/\bdeposit\b/.test(fnBody(srcOf(F.paySet), "parsePosPaymentSettings"))) p.push("parsePosPaymentSettings ไม่อ่าน pos.deposit");
    chk("ST2", p.length === 0, "scope · qc-env · exports · facade · ค่าตั้ง", joinP(p));
  }
  // ST3 รหัส + ข้อความ
  {
    const p: string[] = [];
    const sv = srcOf(F.service);
    const pu = /export\s+type\s+PosSaleErrorCode\s*=([\s\S]*?);/.exec(sv)?.[1] ?? "";
    const missP = NEW_CODES.filter((c) => !new RegExp(`["']${c}["']`).test(pu));
    if (missP.length) p.push(`PosSaleErrorCode ขาด ${missP.join(",")}`);
    const sh = srcOf(F.shared);
    const ub = /export\s+type\s+RegisterRefusalCode\s*=([\s\S]*?);/.exec(sh)?.[1] ?? "";
    const missU = NEW_CODES.filter((c) => !new RegExp(`["']${c}["']`).test(ub));
    if (missU.length) p.push(`RegisterRefusalCode ขาด ${missU.join(",")}`);
    const rk = /REFUSAL_KEY[^=]*=\s*\{([\s\S]*?)\};/.exec(sh)?.[1] ?? "";
    const missK = NEW_CODES.filter((c) => !new RegExp(`\\b${c}\\s*:\\s*["']errors\\.${camel(c)}["']`).test(rk));
    if (missK.length) p.push(`REFUSAL_KEY ขาด ${missK.join(",")}`);
    for (const [lang, f] of [["th", F.msgTh], ["en", F.msgEn]] as const) {
      let j: Any = null;
      try {
        j = JSON.parse(rd(f));
      } catch {
        p.push(`${lang}: อ่าน json ไม่ได้`);
        continue;
      }
      const errs = j?.register?.errors;
      if (!isRecord(errs)) {
        p.push(`${lang}: ไม่มี register.errors`);
        continue;
      }
      const miss = NEW_CODES.map(camel).filter((k) => typeof errs[k] !== "string" || !String(errs[k]).trim());
      if (miss.length) p.push(`${lang}: ขาด ${miss.join(",")}`);
      const wrong = NEW_CODES.map(camel).filter((k) => typeof errs[k] === "string" && (lang === "en" ? THAI.test(errs[k]) : !THAI.test(errs[k])));
      if (wrong.length) p.push(`${lang}: ภาษาไม่ตรง ${wrong.join(",")}`);
    }
    chk("ST3", p.length === 0, "รหัสใหม่ 4 ตัว · คีย์ · ข้อความ th/en", joinP(p));
  }
  // ST4 ลำดับล็อก
  {
    const p: string[] = [];
    const body = fnBody(srcOf(F.service), "createSaleOnce");
    const iC = body.indexOf("posReceiptCounter.upsert");
    const iG = body.search(/lockTenderCards\s*\(/);
    const iD = body.search(/lock\w*Deposits?\s*\(|"PosDeposit"[\s\S]{0,300}?FOR\s+UPDATE/);
    if (iC < 0) p.push("ไม่พบ posReceiptCounter.upsert ใน createSaleOnce");
    if (iG < 0) p.push("createSaleOnce ไม่เรียก lockTenderCards");
    if (iD < 0) p.push("createSaleOnce ไม่ล็อกมัดจำ (lock…Deposits( / PosDeposit FOR UPDATE)");
    else if (iD < iC || (iG >= 0 && iD < iG)) p.push("ล็อกมัดจำก่อนตัวนับ/บัตร");
    const all = walk(POS_DIR).map((f) => stripComments(rd(f))).join("\n");
    if (!/FROM\s+"PosDeposit"[\s\S]{0,400}?ORDER\s+BY\s+(\w+\.)?"?id"?[\s\S]{0,80}?FOR\s+UPDATE/i.test(all)) p.push("ไม่มี SQL ล็อก PosDeposit ORDER BY id FOR UPDATE");
    if (!/"usedSatang"\s*=\s*"usedSatang"\s*\+/.test(all) && !/updateMany\([\s\S]{0,400}?usedSatang\s*:\s*\{\s*increment/.test(all)) p.push("ไม่มีการตัดยอดแบบมีเงื่อนไข usedSatang = usedSatang + x");
    chk("ST4", p.length === 0, "ตัวนับ → บัตร → มัดจำ · ORDER BY id · ตัดแบบมีเงื่อนไข", joinP(p));
  }
  // ST5 ด่าน + การต่อสาย
  {
    const p: string[] = [];
    if (!/POS_DEPOSIT/.test(fnBody(srcOf(F.service), "voidSale"))) p.push("voidSale ไม่มีด่าน POS_DEPOSIT");
    const cons = srcOf(F.consumers);
    const vb = /"pos\.sale\.voided"\s*:([\s\S]*?)"pos\.sale\.refunded"/.exec(cons)?.[1] ?? "";
    const iT = vb.search(/tenderSaleVoided/);
    const iDv = vb.search(/depositSaleVoided/);
    if (iDv < 0) p.push("pos.sale.voided ไม่เรียก depositSaleVoided");
    else if (iT >= 0 && iDv < iT) p.push("depositSaleVoided ก่อน tenderSaleVoided");
    if (/applyExternalDeposit/.test(cons)) p.push("outbox-consumers เรียก applyExternalDeposit* ตรง (ต้องอยู่ใน account-bridge/refund-consumer)");
    const br = srcOf(F.bridge);
    const paid = fnBody(br, "bridgePosSalePaid");
    if (!/POS_DEPOSIT/.test(paid) && !/POS_DEPOSIT/.test(br)) p.push("account-bridge ไม่มีทาง POS_DEPOSIT");
    if (!/applyExternalDepositReceipt/.test(br)) p.push("account-bridge ไม่เรียก applyExternalDepositReceipt");
    const rc = srcOf(F.refundConsumer);
    if (!/POS_DEPOSIT/.test(rc)) p.push("refund-consumer ไม่มีทาง POS_DEPOSIT");
    if (!/applyExternalDepositRefund|bridgePosDeposit\w*/.test(rc) || !/applyExternalDepositRefund/.test(rc + br)) p.push("refund-consumer ไม่ไปถึง applyExternalDepositRefund");
    chk("ST5", p.length === 0, "voidSale guard · ขั้น void · สะพานรับ/คืน", joinP(p));
  }
  // L1 sha สัญญา
  {
    const raw = existsSync(join(ROOT, F.contract)) ? readFileSync(join(ROOT, F.contract)) : null;
    const h = raw ? createHash("sha256").update(raw).digest("hex") : "";
    chk("L1", h === CONTRACT_SHA, CONTRACT_SHA.slice(0, 12), h.slice(0, 12) || "อ่านไม่ได้");
  }
  // L2 ทะเบียนผู้เรียก createSale( ต่อไฟล์ = ฐาน
  {
    const p: string[] = [];
    const count = (src: string) => (stripComments(src).match(/\bcreateSale\s*\(/g) ?? []).length;
    const skip = (f: string) => f.endsWith("src/lib/modules/pos/service.ts") || f.endsWith("src/lib/contracts.ts");
    const now: Record<string, number> = {};
    for (const f of walk("src")) {
      if (skip(f)) continue;
      const n = count(rd(f));
      if (n) now[f] = n;
    }
    const base: Record<string, number> = {};
    const ls = gitBuf(["ls-tree", "-r", "--name-only", BASE_REV, "src/"]);
    if (!ls) p.push(`อ่านไฟล์ที่ ${BASE_REV} ไม่ได้`);
    else
      for (const f of ls.toString("utf8").split("\n").filter((x) => /\.(ts|tsx)$/.test(x))) {
        if (skip(f)) continue;
        const b = gitBuf(["show", `${BASE_REV}:${f}`]);
        const n = b ? count(b.toString("utf8")) : 0;
        if (n) base[f] = n;
      }
    // ORACLE-EDIT ผู้คุม 15 ต.ค. (P2.13) มติ 1: POST /sales ผ่าน submitRegisterSale ⇒ pos/api/ops/sales.ts 1 → 0 (ฐานเดิมนับ 1 · ยอมเฉพาะไฟล์นี้)
    delete base["src/lib/modules/pos/api/ops/sales.ts"];
    const diff = [...new Set([...Object.keys(now), ...Object.keys(base)])].filter((f) => now[f] !== base[f]).map((f) => `${f.replace("src/lib/", "")}:${base[f] ?? 0}→${now[f] ?? 0}`);
    if (diff.length) p.push(`ต่าง ${diff.join(", ")}`);
    chk("L2", p.length === 0, `= ฐาน (${sum(Object.values(base))} จุด/${Object.keys(base).length} ไฟล์)`, joinP(p, `${sum(Object.values(now))} จุด/${Object.keys(now).length} ไฟล์`));
  }
  // L3 ทางมัดจำเดิม
  {
    const p: string[] = [];
    const norm = (s: string) => stripComments(s).replace(/\s+/g, " ").trim();
    for (const [f, fn] of LEGACY_FNS) {
      const b = gitBuf(["show", `${L3_PIN}:${f}`]); // ORACLE-EDIT ผู้คุม 23.10 (CD-P51-O6): เทียบหมุด L3_PIN (เดิม BASE_REV) ◂
      const was = b ? norm(fnBody(b.toString("utf8"), fn)) : "";
      const now = norm(fnBody(rd(f), fn));
      if (!was) p.push(`อ่าน ${fn} ที่ ${L3_PIN} ไม่ได้`);
      else if (was !== now) p.push(`${f.replace("src/lib/modules/", "")}#${fn} เปลี่ยน`);
    }
    for (const f of LEGACY_SUITES) {
      const b = gitBuf(["show", `${BASE_REV}:${f}`]);
      if (!b) p.push(`อ่าน ${f} ที่ ${BASE_REV} ไม่ได้`);
      else if (b.toString("utf8") !== rd(f)) p.push(`${f} ถูกแก้`);
    }
    for (const f of L3_PIN_SUITES) {
      const b = gitBuf(["show", `${L3_PIN}:${f}`]);
      if (!b) p.push(`อ่าน ${f} ที่ ${L3_PIN} ไม่ได้`);
      else if (b.toString("utf8") !== rd(f)) p.push(`${f} ต่างจากหมุด ${L3_PIN}`);
    }
    chk("L3", p.length === 0, `มัดจำโมดูล 5 ฟังก์ชัน + qc-booking-deposit ตรงหมุด ${L3_PIN} · qc-hotel-public/qc-rental-public ตรงฐาน (CD-P51-O6)`, joinP(p));
  }
}

// ═════════════════════════ 1b. --no-db ═════════════════════════
if (NODB) {
  console.log(`[${SUITE}] --no-db: รัน ${STATIC_IDS.length} ข้อ (สถิต · ไม่โหลด prisma)`);
  try {
    runStatic();
  } catch (e) {
    console.log(`💥 harness: ${(e as Error)?.stack?.split("\n").slice(0, 3).join(" | ")}`);
  }
  for (const id of STATIC_IDS) if (!results.has(id)) chk(id, false, "ถูกตรวจ", "ไม่ถึง");
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
const HOST = (() => {
  try {
    return new URL(process.env.DATABASE_URL ?? "").hostname;
  } catch {
    return "?";
  }
})();
function assertQc4BeforeWrite(): void {
  const mark = envMod.POS_QC_HOST_MARK as string;
  const bad = [["DATABASE_URL", process.env.DATABASE_URL ?? ""], ["DIRECT_URL", process.env.DIRECT_URL ?? ""]].filter(([n, u]) => (n === "DATABASE_URL" || u) && !u!.includes(mark));
  if (bad.length) {
    console.error(`🔴 หยุด! ${SUITE}: จะเขียนแถวได้เฉพาะ QC4 (${mark}) — ${bad.map(([n]) => n).join(", ")} ไม่ใช่ (ยังไม่ได้เขียนอะไร)`);
    process.exit(4);
  }
}

// ═════════════════════════ 3. ด่าน SKIP ═════════════════════════
const { prisma } = (await import("@/lib/core/db" as string)) as Any;
const P = prisma as Any;
let seedOk = false;
try {
  seedOk = !!(await envMod.resolvePosScope(prisma, "coffee"));
} catch (e) {
  console.log(`  (resolvePosScope ล้ม: ${(e as Error).message.slice(0, 120)})`);
}
if (!seedOk) skipReasons.push("ชุดข้อมูล QC POS (ร้านกาแฟ) ยังไม่ถูก seed — รัน scripts/seed-pos-qc.mts ก่อน");
const colsOf = async (t: string): Promise<Set<string>> => {
  try {
    const rows = (await P.$queryRawUnsafe(`SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1`, t)) as Any[];
    return new Set(rows.map((r) => String(r.column_name)));
  } catch {
    return new Set();
  }
};
const depCols = await colsOf("PosDeposit");
const txnCols = await colsOf("PosDepositTxn");
const COL = { dep: depCols.has("receiptSaleId") && depCols.has("usedSatang"), txn: txnCols.has("depositId") && txnCols.has("idempotencyKey") };
if (!COL.dep) skipReasons.push("ฐาน QC4 ยังไม่มีตาราง PosDeposit");
if (!COL.txn) skipReasons.push("ฐาน QC4 ยังไม่มีตาราง PosDepositTxn");

const COUNT_MODELS = ["posSale", "posPayment", "giftCardTxn", "outboxEvent", "auditLog", "accountJournalEntry"] as const;
async function snapshotCounts(): Promise<Record<string, number | string>> {
  const out: Record<string, number | string> = {};
  for (const tid of TIDS) {
    for (const m of COUNT_MODELS) {
      const d = P[m];
      out[`${tid}.${m}`] = typeof d?.count === "function" ? await d.count({ where: { tenantId: tid } }).catch((e: Error) => `err:${e.message.slice(0, 30)}`) : "absent";
    }
    if (COL.dep) out[`${tid}.posDeposit`] = Number(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "PosDeposit" WHERE "tenantId" = $1`, tid).catch(() => [{ n: -1 }])) as Any[])[0]?.n ?? -1);
  }
  return out;
}
const countsBefore = await snapshotCounts();

if (skipReasons.length > 0 && !FORCE) {
  console.log(`⏭️  SKIPPED — ${SUITE}: ของใบ P2.9b ยังไม่มี (ถูกต้องสำหรับข้อสอบที่เขียนก่อนสร้าง) · DB ${HOST}`);
  for (const r of skipReasons) console.log(`   • ${r}`);
  console.log(`JSON_SUMMARY ${JSON.stringify({ suite: SUITE, total: 0, passed: 0, failed: [], skipped: true, reason: skipReasons, registered: CHECKS.length, seed: seedOk })}`);
  await P.$disconnect?.().catch?.(() => {});
  process.exit(0);
}
if (FORCE && skipReasons.length) console.log(`⚠️  QC_FORCE=1 — ข้ามด่าน SKIP ทั้งที่ยังขาด ${skipReasons.length} อย่าง (คาด: แดงตามเหตุผล ไม่ crash · L เขียว)`);

// ═════════════════════════ 4. โหลดโมดูล ═════════════════════════
const svc = await tryImport("@/lib/modules/pos/service");
const depMod = existsSync(join(ROOT, F.deposit)) ? await tryImport("@/lib/modules/pos/deposit") : null;
const tenderMod = await tryImport("@/lib/modules/pos/tender");
const regMod = await tryImport("@/lib/modules/pos/register");
const refundMod = await tryImport("@/lib/modules/pos/refund");
const refundTendersMod = await tryImport("@/lib/modules/pos/refund-tenders"); // มติ 13 ◂
const rcpMod = await tryImport("@/lib/modules/pos/receipt");
const renderMod = await tryImport("@/lib/modules/pos/receipt-render");
const billsMod = await tryImport("@/lib/modules/pos/bills");
const shiftMod = await tryImport("@/lib/modules/pos/shift");
const devMod = await tryImport("@/lib/modules/pos/device");
const paySet = await tryImport("@/lib/modules/pos/payment-settings");
const orderMod = await tryImport("@/lib/modules/pos/order");
const chMod = await tryImport("@/lib/modules/pos/channel");
const apiSales = await tryImport("@/lib/modules/pos/api/ops/sales");
const sysSvc = await tryImport("@/lib/modules/system/service");
const accSvc = await tryImport("@/lib/modules/account/service");
const glMod = await tryImport("@/lib/modules/account/gl");
const memMod = await tryImport("@/lib/modules/member");
const gcMod = await tryImport("@/lib/modules/giftcard");
const bookMod = await tryImport("@/lib/modules/booking/service");
const vatMod = await tryImport("@/lib/money/vat");
const consMod = await tryImport("@/lib/outbox-consumers");

const RAND = Math.random().toString(36).slice(2, 8);
const TAG = `qc-p2.9b-${RAND}`;
const T_SLUG = `posqc-p29b-${RAND}`;
const T2_SLUG = `${T_SLUG}-t2`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let T = "";
let T2 = "";
const RUN_START = Date.now();

const realFetch = globalThis.fetch;
const guardHits: string[] = [];
function installFetchGuard() {
  globalThis.fetch = (async (input: Any) => {
    let host = "?";
    try {
      host = new URL(typeof input === "string" ? input : String(input?.url ?? input)).host;
    } catch {
      /* ไม่ใช่ URL */
    }
    guardHits.push(host);
    return new Response(`blocked by ${SUITE}`, { status: 503 });
  }) as typeof fetch;
}
function removeFetchGuard() {
  globalThis.fetch = realFetch;
}
async function drain(n = 2): Promise<void> {
  for (let i = 0; i < n; i++) {
    try {
      if (typeof consMod?.drainAll === "function") await consMod.drainAll();
    } catch (e) {
      console.log(`  (drainAll ล้ม: ${(e as Error).message.slice(0, 100)})`);
    }
  }
}

// ═════════════════════════ 5. ข้อที่ต้องมี DB ═════════════════════════
const DB_IDS = CHECKS.map(([id]) => id).filter((id) => !STATIC_IDS.includes(id) && !["P2.9b-Z1", "P2.9b-Z2"].includes(id));

async function runDb() {
  if (!seedOk) {
    for (const id of DB_IDS) chk(id, false, "seed ร้าน QC POS", "ยังไม่ได้ seed — ข้อ DB ตรวจไม่ได้");
    return;
  }
  assertQc4BeforeWrite();
  installFetchGuard();
  if (!process.env.SESSION_SECRET) process.env.SESSION_SECRET = `qc-p29b-${RAND}-${Math.random().toString(36).slice(2)}`;
  console.log(`\n── ร้านชั่วคราว ${T_SLUG} (+ ${T2_SLUG}) · DB ${HOST} ──`);
  let fx = "";
  const notes: string[] = [];
  const S: Record<string, string> = {};
  const U: Record<string, string> = {};
  const ownerId: string = PQC.coffee.users.owner.userId;
  const cashierId: string = PQC.coffee.users.cashier.userId;
  const step = async (label: string, fn: () => unknown): Promise<Any> => {
    try {
      return await fn();
    } catch (e) {
      const m = `${label}: ${String((e as Error)?.message ?? e).slice(0, 140)}`;
      notes.push(m);
      console.log(`  ⚠️  fixture ${m}`);
      return null;
    }
  };
  let ledgerTip = "";
  try {
    const t = await P.tenant.create({ data: { name: `QC P2.9b มัดจำ ${RAND}`, slug: T_SLUG } });
    T = t.id;
    const t2 = await P.tenant.create({ data: { name: `QC P2.9b ร้านอื่น ${RAND}`, slug: T2_SLUG } });
    T2 = t2.id;
    for (const k of ["A", "B", "C", "D"]) U[k] = (await P.businessUnit.create({ data: { tenantId: T, type: "SHOP", name: `${TAG} สาขา${k}`, slug: `${T_SLUG}-${k.toLowerCase()}` } })).id;
    U.L = (await P.businessUnit.create({ data: { tenantId: T, type: "BOOKING", name: `${TAG} สปา (ทางเดิม)`, slug: `${T_SLUG}-l` } })).id;
    S.POS = (await sysSvc.createSystem(T, "POS", "POS P2.9b (ผูกบัญชี VAT)")).id;
    S.ACC = (await sysSvc.createSystem(T, "ACCOUNT", "บัญชี QC P2.9b")).id;
    S.MEM = (await sysSvc.createSystem(T, "MEMBER", "สมาชิก QC P2.9b")).id;
    S.POSC = (await sysSvc.createSystem(T, "POS", "POS P2.9b C (สมุดไม่จด VAT)")).id;
    S.ACCC = (await sysSvc.createSystem(T, "ACCOUNT", "บัญชี QC P2.9b ไม่จด VAT")).id;
    S.POSD = (await sysSvc.createSystem(T, "POS", "POS P2.9b D (ไม่ผูกสมุด)")).id;
    await accSvc.saveSettings(T, S.ACC, { orgName: "ร้านมัดจำคิวซี จำกัด", taxId: "0105561177639", vatRegistered: true });
    await glMod.ensureAccounting({ tenantId: T, systemId: S.ACC });
    await accSvc.saveSettings(T, S.ACCC, { orgName: "ร้านมัดจำคิวซี (ไม่จด VAT)", taxId: "", vatRegistered: false });
    await glMod.ensureAccounting({ tenantId: T, systemId: S.ACCC });
    await P.accountSystemLink.create({ data: { tenantId: T, systemId: S.ACC, linkedKind: "POS", linkedId: S.POS } });
    await P.accountSystemLink.create({ data: { tenantId: T, systemId: S.ACCC, linkedKind: "POS", linkedId: S.POSC } });
    for (const k of ["A", "B", "L"]) await sysSvc.linkUnit(T, S.POS, U[k]);
    await sysSvc.linkUnit(T, S.POSC, U.C);
    await sysSvc.linkUnit(T, S.POSD, U.D);
    await sysSvc.linkUnit(T, S.MEM, U.A);
    ledgerTip = (await P.accountLedger.create({ data: { tenantId: T, systemId: S.ACC, code: "2190", name: `${TAG} ทิปรอจ่ายพนักงาน`, type: "LIABILITY" } })).id;
  } catch (e) {
    fx = `ร้านชั่วคราว:${(e as Error).message.slice(0, 160)}`;
    console.log(`  ⚠️  ${fx}`);
  }
  const FXB = (s: string) => (fx ? `fixture:${fx} · ` : "") + s;

  const owner = { userId: ownerId, role: "OWNER", unitAccess: ["*"], permissions: {} };
  const noperm = { userId: cashierId, role: "STAFF", unitAccess: [U.A], permissions: { "pos.sale.read": true } };
  const cashier = { userId: cashierId, role: "STAFF", unitAccess: [U.A], permissions: { "pos.sale.create": true } };
  const manager = { userId: cashierId, role: "MANAGER", unitAccess: [U.A], permissions: { "pos.sale.create": true, "pos.sale.refund": true } };
  const SYS_OF: Record<string, string> = { A: "POS", B: "POS", C: "POSC", D: "POSD", L: "POS" };
  const DEV1 = `qc29b${RAND}d1`;
  const ctxOf = (k: string, deviceId?: string): Any => ({ tenantId: T, systemId: S[SYS_OF[k] ?? "POS"], unitId: U[k], ...(deviceId ? { deviceId } : {}) });
  /** ขอบเขตของการรับ/คืนมัดจำ — สาขา A ใช้เครื่องที่เปิดกะ (เงินสด) · สาขาอื่นไม่ใช้เครื่อง (โอน) */
  const ctxU = (k: string): Any => ctxOf(k, k === "A" ? DEV1 : undefined);
  const ctxM: Any = { tenantId: T, systemId: S.MEM, actorUserId: ownerId };
  const gctx: Any = { tenantId: T, systemId: S.MEM, posSystemId: S.POS, actorUserId: ownerId };
  const sysCtx = (sys = "POS"): Any => ({ tenantId: T, systemId: S[sys] });

  // ─── เครื่อง + กะ ───
  let SHIFT = "";
  if (!fx) {
    const rg = await call(devMod, "registerDevice", ctxOf("A"), owner, { name: "เคาน์เตอร์ QC 29b", deviceCode: DEV1 });
    if (rg?.ok !== true) console.log(`  ⚠️  registerDevice: ${codeOf(rg)} ${short(rg?.message ?? "", 80)}`);
    const o1 = await call(shiftMod, "openShift", ctxOf("A", DEV1), owner, { deviceId: DEV1, deviceLabel: "เคาน์เตอร์ QC 29b", floatSatang: 0 });
    if (o1?.ok !== true) fx = `เปิดกะ: ${codeOf(o1)} ${short(o1?.message ?? "", 80)}`;
    else SHIFT = String(o1.shift?.id ?? "");
  }

  // ─── สมาชิก + บัตรของขวัญ + ทิป ───
  const rnd = (n: number) => String(Math.floor(Math.random() * 10 ** n)).padStart(n, "0");
  const C: Record<string, string> = {};
  const GC: Record<string, { id: string; number: string; pin: string }> = {};
  if (!fx) {
    for (const k of ["X", "Y"]) {
      const r = await step(`สมาชิก ${k}`, () => memMod.createMember(ctxM, owner, { phone: `0896${rnd(6)}`, name: `${k === "X" ? "สมชาย" : "สมหญิง"} มัดจำดี ${RAND}`, source: "WALK_IN", homeUnitId: U.A }));
      if (r?.customerId) C[k] = String(r.customerId);
    }
    await step("บัตร: เปิดใช้ + ผูกบัญชี", () => gcMod.setSettings(gctx, owner, { enabled: true, accountingLink: true }));
    for (const [k, s] of [["G1", 10_000], ["G2", 100_000], ["G3", 50_000]] as const) {
      const r = await step(`บัตร ${k}`, () => gcMod.sell(gctx, owner, { satang: s, payMethods: [{ type: "CASH", amountSatang: s }], unitId: U.A, recipient: { print: true }, idempotencyKey: `${TAG}-gc-${k}` }));
      if (r?.giftCardId) GC[k] = { id: String(r.giftCardId), number: String(r.number), pin: String(r.pin) };
    }
    const tp = await call(paySet, "updatePosPaymentSettings", sysCtx(), owner, { tip: { enabled: true, ledgerAccountId: ledgerTip || "-" } });
    if (tp?.ok !== true) notes.push(`เปิดทิป: ${codeOf(tp)}`);
    await drain();
  }
  const X = C.X ?? "";
  const Y = C.Y ?? "";

  // ─── ตัวช่วยของบิล/มัดจำ ───
  const memberOf = (cid: string) => (cid ? { memberId: cid, memberSystemId: S.MEM } : {});
  let keyN = 0;
  const key = (p: string) => `p29b${RAND}-${p}-${++keyN}`.replace(/[^A-Za-z0-9_-]/g, "");
  const cash = (amt: number): Any => ({ type: "CASH", amountSatang: amt });
  const xfer = (amt: number): Any => ({ type: "TRANSFER", amountSatang: amt });
  const gcPay = (amt: number, k: string): Any => ({ type: "GIFT_CARD", amountSatang: amt, giftCard: { number: GC[k]?.number ?? `GC-missing-${k}`, pin: GC[k]?.pin ?? "" } });
  type LineIn = [string, number];
  const saleIn = (k: string, lines: LineIn[], pays: Any[], extra: Any = {}): Any => ({
    tenantId: T,
    unitId: U.A,
    systemId: S.POS,
    idempotencyKey: k,
    lines: lines.map(([name, p]) => ({ name: `${name} ${RAND}`, qty: 1, unitPriceSatang: p })),
    payMethods: pays,
    ...extra,
  });
  const cs = (input: Any) => call(svc, "createSale", input);
  const ok = (r: Any) => !!r && r.ok !== false && typeof r.saleId === "string";
  const saleByKey = async (k: string): Promise<Any> => P.posSale.findFirst({ where: { tenantId: T, idempotencyKey: { contains: k } } }).catch(() => null);
  const saleRow = async (id: string): Promise<Any> => (id ? P.posSale.findUnique({ where: { id } }).catch(() => null) : null);
  const paysOf = async (saleId: string): Promise<Any[]> => (saleId ? ((await P.$queryRawUnsafe(`SELECT * FROM "PosPayment" WHERE "saleId" = $1 ORDER BY id`, saleId).catch(() => [])) as Any[]) : []);
  const linesOf = async (saleId: string): Promise<Any[]> => (saleId ? ((await P.posSaleLine.findMany({ where: { saleId } }).catch(() => [])) as Any[]) : []);
  const lineId = async (saleId: string, name: string): Promise<string> => String((await linesOf(saleId)).find((l) => String(l.name).startsWith(name))?.id ?? "");
  const jvOf = async (refType: string, refIds: string[]): Promise<Any[]> =>
    (await P.accountJournalEntry.findMany({ where: { tenantId: T, refType, refId: { in: refIds.filter(Boolean) } }, include: { lines: { include: { account: { select: { code: true } } } } } }).catch(() => [])) as Any[];
  const netByCode = (es: Any[]): Record<string, number> => {
    const m: Record<string, number> = {};
    for (const l of es.flatMap((e: Any) => e.lines ?? [])) m[l.account?.code ?? "?"] = (m[l.account?.code ?? "?"] ?? 0) + l.debit - l.credit;
    for (const k of Object.keys(m)) if (m[k] === 0) delete m[k];
    return m;
  };
  const sameNet = (got: Record<string, number>, want: Record<string, number>) => {
    const w = Object.fromEntries(Object.entries(want).filter(([, v]) => v !== 0));
    return short(Object.entries(got).sort(), 4000) === short(Object.entries(w).sort(), 4000);
  };
  const balanced = (es: Any[]) => es.length > 0 && es.every((e: Any) => sum((e.lines ?? []).map((l: Any) => l.debit)) === sum((e.lines ?? []).map((l: Any) => l.credit)));
  const events = async (type: string, pred: (p: Any) => boolean): Promise<Any[]> => ((await P.outboxEvent.findMany({ where: { tenantId: T, type } }).catch(() => [])) as Any[]).filter((e) => pred(e.payload ?? {}));
  const replay = async (type: string, pred: (p: Any) => boolean, times = 2): Promise<string[]> => {
    const errs: string[] = [];
    const evs = await events(type, pred);
    const h = consMod?.consumers?.[type];
    if (!evs.length) errs.push(`ไม่พบ event ${type}`);
    else if (typeof h !== "function") errs.push(`ไม่มี consumers[${type}]`);
    else
      for (const ev of evs)
        for (let i = 0; i < times; i++)
          try {
            await h(ev);
          } catch (e) {
            errs.push(`${type} ×${i + 1} throw ${(e as Error).message.slice(0, 60)}`);
          }
    return errs;
  };
  const refund = (saleId: string, lines: { lineId: string; qty: number }[], payMethods: Any[], k?: string) =>
    call(refundMod, "refundSale", ctxOf("A"), owner, { saleId, lines, payMethods, reasonCode: "CHANGED_MIND", idempotencyKey: k ?? key("rf") });
  const refundDocs = async (saleId: string): Promise<Any[]> => (saleId ? ((await P.posSale.findMany({ where: { tenantId: T, docType: "REFUND", refSaleId: saleId } }).catch(() => [])) as Any[]) : []);
  const voidBill = (saleId: string) => call(svc, "voidSale", T, U.A, saleId, { actorUserId: ownerId, reason: "QC P2.9b" });
  const split = (g: number, rate = 700): { baseSatang: number; vatSatang: number } => (typeof vatMod?.splitIncludedVat === "function" ? vatMod.splitIncludedVat(g, rate) : { baseSatang: NaN, vatSatang: NaN });

  // ── มัดจำ (ตารางใหม่อ่านด้วย SQL ดิบ — ก่อนมีตาราง = แถวว่าง ไม่ crash) ──
  const q = async (sql: string, ...args: unknown[]): Promise<Any[]> => {
    try {
      return (await P.$queryRawUnsafe(sql, ...args)) as Any[];
    } catch {
      return [];
    }
  };
  type Dep = { id: string; receiptSaleId: string; receiptNo: string; phone?: string }; // ORACLE-ADD ผู้คุม 15 ต.ค. (P2.9b fix 1 มติ 6): เบอร์ของมัดจำ walk-in ◂
  const DP: Record<string, Dep> = {};
  const depRow = async (id: string): Promise<Any> =>
    id && COL.dep
      ? ((await q(`SELECT id, "tenantId", "systemId", "unitId", "customerId", "customerName", "phoneMasked", "amountSatang", "vatSatang", "usedSatang", "refundedSatang", status::text AS status, "receiptSaleId", "receiptNo", "idempotencyKey" FROM "PosDeposit" WHERE id = $1`, id))[0] ?? null)
      : null;
  const dep = (l: string) => depRow(DP[l]?.id ?? "");
  const dtx = async (depId: string, type?: string): Promise<Any[]> =>
    depId && COL.txn ? q(`SELECT id, "tenantId", "depositId", type::text AS type, satang, "vatSatang", "saleId", "paymentId", "refTxnId", "idempotencyKey" FROM "PosDepositTxn" WHERE "depositId" = $1${type ? ` AND type::text = '${type}'` : ""} ORDER BY id`, depId) : [];
  const dtxOf = (l: string, type?: string) => dtx(DP[l]?.id ?? "", type);
  const saleTxns = async (saleId: string): Promise<Any[]> => (saleId && COL.txn ? q(`SELECT id, type::text AS type, satang, "vatSatang", "depositId", "paymentId", "idempotencyKey" FROM "PosDepositTxn" WHERE "saleId" = $1 ORDER BY id`, saleId) : []);
  const depsByKey = async (k: string): Promise<Any[]> => (COL.dep ? q(`SELECT id FROM "PosDeposit" WHERE "tenantId" = $1 AND "idempotencyKey" LIKE $2`, T, `%${k}%`) : []);
  const depIdOf = (r: Any) => String(r?.deposit?.id ?? r?.depositId ?? "");
  const takeRaw = (unit: string, actor: Any, input: Any, ctx?: Any) => call(depMod, "registerTakeDeposit", ctx ?? ctxU(unit), actor, input);
  /** รับมัดจำผ่านฟังก์ชันของโมดูล (ฟิกซ์เจอร์) — สาขา A เงินสด · อื่น ๆ โอน */
  const take = async (label: string, unit: string, amount: number, extra: Any = {}): Promise<Any> => {
    const r = fx ? null : await takeRaw(unit, owner, { amountSatang: amount, payMethods: [unit === "A" ? cash(amount) : xfer(amount)], idempotencyKey: key(`dep-${label}`), ...extra });
    const id = depIdOf(r);
    const row = id ? await depRow(id) : null;
    if (row) DP[label] = { id, receiptSaleId: String(row.receiptSaleId ?? ""), receiptNo: String(row.receiptNo ?? ""), ...(typeof extra.phone === "string" && extra.phone ? { phone: extra.phone } : {}) };
    else notes.push(`มัดจำ ${label}: ${codeOf(r)} ${short(r?.message ?? "", 80)}`);
    return r;
  };
  const PHONES: string[] = [];
  const walkIn = (name: string) => {
    const phone = `08${rnd(8)}`;
    PHONES.push(phone);
    return { customerName: `${name} ${RAND}`, phone };
  };
  /** แถวใช้มัดจำของ createSale (CD2-A: refSaleId = ใบรับมัดจำ) */
  const depPay = (amt: number, l: string): Any => ({ type: "DEPOSIT", amountSatang: amt, refSaleId: DP[l]?.receiptSaleId || `qc-missing-${l}` });
  /** แถวใช้มัดจำของหน้าขาย ({DEPOSIT, depositId}) */
  // ORACLE-EDIT ผู้คุม 15 ต.ค. (P2.9b fix 1 มติ 6 · hunt D5): มัดจำ walk-in ที่มีเบอร์ = หน้าขายส่ง 4 หลักท้ายด้วย ◂
  const regDep = (amt: number, l: string): Any => ({ type: "DEPOSIT", amountSatang: amt, depositId: DP[l]?.id || `qc-missing-${l}`, ...(DP[l]?.phone ? { phoneLast4: DP[l]!.phone!.slice(-4) } : {}) });
  const regSubmit = async (cart: Any, k: string, pays: Any[]) => {
    const q0 = await call(regMod, "quoteRegisterCart", ctxOf("A"), owner, cart);
    // ORACLE-EDIT ผู้คุม 15 ต.ค. (CD-P29b-1 P1 cash row carries cashReceivedSatang): แถวเงินสดของหน้าขายต้องมีเงินที่รับ (R4 K4 · PAYMENT_MISMATCH = พฤติกรรมที่ปักไว้) ⇒ ส่ง cashReceivedSatang = ส่วนเงินสด ◂
    const cashPart = sum(pays.filter((x: Any) => x.type === "CASH").map((x: Any) => Number(x.amountSatang)));
    return call(regMod, "submitRegisterSale", ctxOf("A", DEV1), owner, { ...cart, idempotencyKey: k, expectedGrandTotalSatang: Number(q0?.grandTotalSatang ?? sum((cart.lines ?? []).map((l: Any) => l.unitPriceSatang * l.qty))), payMethods: pays, ...(cashPart > 0 ? { cashReceivedSatang: cashPart } : {}) });
  };
  const xCash = async (): Promise<number> => {
    const x = SHIFT ? await call(shiftMod, "xReport", ctxOf("A", DEV1), owner, { shiftId: SHIFT }) : null;
    return x?.ok === true ? Number(x.report?.expectedCashSatang) : NaN;
  };

  // ════════ ค่าตั้ง (ปิดก่อน → ลองรับ → เปิด) ════════
  const offProbe = { take: null as Any, key: "", tenders: null as Any };
  if (!fx) {
    offProbe.key = key("off");
    offProbe.take = await takeRaw("A", owner, { amountSatang: 10_000, payMethods: [cash(10_000)], idempotencyKey: offProbe.key, ...walkIn("ปิดสวิตช์") });
    offProbe.tenders = await call(tenderMod, "registerPayTenders", ctxOf("A"), owner);
    for (const sys of ["POS", "POSC", "POSD"]) {
      const r = await call(paySet, "updatePosPaymentSettings", sysCtx(sys), owner, { deposit: { enabled: true } });
      if (r?.ok !== true) notes.push(`เปิดมัดจำ ${sys}: ${codeOf(r)} ${short(r?.message ?? "", 60)}`);
    }
  }
  console.log(`   สมาชิก ${Object.keys(C).join(",")} · บัตร ${Object.keys(GC).join(",")} · กะ ${SHIFT ? "เปิด" : "ไม่มี"} · ตาราง ${COL.dep ? "มี" : "ไม่มี"}`);

  // ════════ R รับมัดจำ ════════
  {
    const p: string[] = [];
    const x0 = await xCash();
    const r = fx || !X ? null : await take("R1", "A", 107_000, { memberId: X, note: "โต๊ะ 19:00" });
    if (r?.ok !== true || !DP.R1) p.push(`รับมัดจำ → ${codeOf(r)} ${short(r?.message ?? "", 80)}`);
    else {
      const d = await dep("R1");
      if (d.amountSatang !== 107_000 || d.vatSatang !== 7_000 || d.usedSatang !== 0 || d.refundedSatang !== 0 || d.status !== "OPEN" || d.customerId !== X || d.unitId !== U.A || d.tenantId !== T)
        p.push(`มัดจำ ${short({ a: d.amountSatang, v: d.vatSatang, u: d.usedSatang, r: d.refundedSatang, s: d.status, X: d.customerId === X, unit: d.unitId === U.A })}`);
      const s = await saleRow(DP.R1.receiptSaleId);
      if (s?.sourceModule !== "POS_DEPOSIT" || s?.sourceId !== DP.R1.id || s?.memberId !== null || s?.grandTotalSatang !== 107_000 || s?.vatSatang !== 7_000 || s?.docType !== "SALE" || s?.status !== "PAID" || (DP.R1.receiptNo && s?.receiptNo !== DP.R1.receiptNo))
        p.push(`ใบรับ ${short({ src: s?.sourceModule, sid: s?.sourceId === DP.R1.id, member: s?.memberId, g: s?.grandTotalSatang, v: s?.vatSatang, st: s?.status })}`);
      const ls = await linesOf(DP.R1.receiptSaleId);
      if (ls.length !== 1 || !String(ls[0]?.name ?? "").startsWith("มัดจำ") || ls[0]?.qty !== 1 || ls[0]?.unitPriceSatang !== 107_000) p.push(`บรรทัด ${short(ls.map((l) => `${l.name}:${l.qty}x${l.unitPriceSatang}`))}`);
      const pays = await paysOf(DP.R1.receiptSaleId);
      if (pays.length !== 1 || pays[0].type !== "CASH" || pays[0].amountSatang !== 107_000) p.push(`แถวจ่าย ${short(pays.map((x) => `${x.type}:${x.amountSatang}`))}`);
      const rcv = await dtxOf("R1");
      if (rcv.length !== 1 || rcv[0].type !== "RECEIVE" || rcv[0].satang !== 107_000 || rcv[0].vatSatang !== 7_000 || rcv[0].saleId !== DP.R1.receiptSaleId) p.push(`txn ${short(rcv.map((t) => `${t.type}:${t.satang}/${t.vatSatang}`))}`);
      const x1 = await xCash();
      if (x1 - x0 !== 107_000) p.push(`X expectedCash ${x0}→${x1} (คาด +107000)`);
    }
    chk("R1", p.length === 0, "ใบรับ POS_DEPOSIT · มัดจำ OPEN 1070/70 · RECEIVE · ลิ้นชัก +1070", FXB(joinP(p)));
  }
  {
    const p: string[] = [];
    if (fx) p.push("fixture");
    else {
      const k = key("r2");
      const input = { amountSatang: 20_000, payMethods: [cash(20_000)], idempotencyKey: k, ...walkIn("คุณอรทัย") };
      const rs = await Promise.all(Array.from({ length: 10 }, () => takeRaw("A", owner, input)));
      const ids = new Set(rs.map(depIdOf).filter(Boolean));
      const bad = rs.filter((x) => x?.ok !== true).map(codeOf);
      const depIds = (await depsByKey(k)).map((x) => String(x.id));
      const nDep = depIds.length;
      // ใบรับ = บิล POS_DEPOSIT ที่ sourceId เป็นมัดจำของคีย์นี้ (คีย์ของใบรับเป็นของผู้สร้าง) + ใบรับที่มีคีย์ของ client
      const nSale = await P.posSale.count({ where: { tenantId: T, sourceModule: "POS_DEPOSIT", OR: [{ sourceId: { in: depIds.length ? depIds : ["-"] } }, { idempotencyKey: { contains: k } }] } }).catch(() => -1);
      if (bad.length || ids.size !== 1 || nDep !== 1 || nSale !== 1) p.push(`ok ${10 - bad.length} ${[...new Set(bad)].join(",")} · id ${ids.size} · มัดจำ ${nDep} · ใบรับ ${nSale}`);
      const only = [...ids][0] ?? "";
      if (only) {
        const row = await depRow(only);
        if (row) DP.R2 = { id: only, receiptSaleId: String(row.receiptSaleId), receiptNo: String(row.receiptNo ?? ""), phone: input.phone }; // ORACLE-ADD ผู้คุม 15 ต.ค. (P2.9b fix 1 มติ 6) ◂
      }
      const c = await takeRaw("A", owner, { ...input, amountSatang: 25_000, payMethods: [cash(25_000)] });
      if (!refused(c, "IDEMPOTENCY_CONFLICT") || (await depsByKey(k)).length !== 1) p.push(`คีย์เดิมยอดอื่น → ${codeOf(c)}`);
    }
    chk("R2", p.length === 0, "1 มัดจำ · 1 ใบรับ · CONFLICT", FXB(joinP(p)));
  }
  {
    const p: string[] = [];
    if (fx) p.push("fixture");
    else {
      const tryOne = async (label: string, unit: string, actor: Any, input: Any, codes: string[], ctx?: Any) => {
        const k = key("r3");
        const r = await takeRaw(unit, actor, { idempotencyKey: k, ...walkIn("ลองผิด"), ...input }, ctx);
        const nDep = (await depsByKey(k)).length;
        const made = await saleByKey(k);
        if (!refused(r, ...codes) || nDep || made) p.push(`${label} → ${codeOf(r)}${nDep ? " +มัดจำ" : ""}${made ? " +บิล" : ""} (คาด ${codes.join("|")})`);
      };
      await tryOne("ยอด 0", "A", owner, { amountSatang: 0, payMethods: [cash(0)] }, ["VALIDATION"]);
      await tryOne("ติดลบ", "A", owner, { amountSatang: -100, payMethods: [cash(-100)] }, ["VALIDATION"]);
      await tryOne("GIFT_CARD", "A", owner, { amountSatang: 1_000, payMethods: [gcPay(1_000, "G1")] }, ["VALIDATION"]);
      await tryOne("STORE_CREDIT", "A", owner, { amountSatang: 1_000, payMethods: [{ type: "STORE_CREDIT", amountSatang: 1_000 }], memberId: X || undefined }, ["VALIDATION"]);
      await tryOne("DEPOSIT", "A", owner, { amountSatang: 1_000, payMethods: [{ type: "DEPOSIT", amountSatang: 1_000 }] }, ["VALIDATION"]);
      await tryOne("PLATFORM", "A", owner, { amountSatang: 1_000, payMethods: [{ type: "PLATFORM", amountSatang: 1_000 }] }, ["VALIDATION"]);
      await tryOne("ไม่มีสิทธิ์", "A", noperm, { amountSatang: 1_000, payMethods: [cash(1_000)] }, ["PERMISSION_DENIED"]);
      await tryOne("ร้านอื่น", "A", owner, { amountSatang: 1_000, payMethods: [cash(1_000)] }, ["NOT_FOUND"], { tenantId: T2, systemId: S.POS, unitId: U.A, deviceId: DEV1 });
      const offN = offProbe.key ? (await depsByKey(offProbe.key)).length : -1;
      if (!refused(offProbe.take, "VALIDATION") || offN !== 0 || (offProbe.key && (await saleByKey(offProbe.key)))) p.push(`ค่าตั้งปิด → ${codeOf(offProbe.take)} มัดจำ ${offN}`);
    }
    chk("R3", p.length === 0, "VALIDATION ×6 · PERMISSION_DENIED · NOT_FOUND · ปิด = VALIDATION · ไม่มีแถว", FXB(joinP(p)));
  }
  {
    const p: string[] = [];
    if (!DP.R1) p.push("ไม่มีมัดจำ R1");
    else {
      const rid = DP.R1.receiptSaleId;
      await drain();
      const s = await saleRow(rid);
      if (s?.pointEarned !== 0 || s?.memberId !== null) p.push(`แต้ม ${s?.pointEarned} · สมาชิก ${s?.memberId}`);
      const l = await lineId(rid, "มัดจำ");
      const rf = await refund(rid, [{ lineId: l || "-", qty: 1 }], [cash(107_000)]);
      if (!refused(rf, "SALE_NOT_REFUNDABLE")) p.push(`refundSale → ${codeOf(rf)}`);
      const vd = await call(billsMod, "voidSaleByActor", ctxOf("A", DEV1), owner, { unitId: U.A, saleId: rid, reason: "QC ลองยกเลิกใบรับ", idempotencyKey: key("r4v") });
      if (!refused(vd, "SALE_NOT_VOIDABLE")) p.push(`voidSaleByActor → ${codeOf(vd)}`);
      const s2 = await saleRow(rid);
      const d = await dep("R1");
      if (s2?.status !== "PAID" || d?.status !== "OPEN" || (await refundDocs(rid)).length) p.push(`ใบ ${s2?.status} · มัดจำ ${d?.status}`);
    }
    chk("R4", p.length === 0, "แต้ม 0 · SALE_NOT_REFUNDABLE · SALE_NOT_VOIDABLE · ยัง PAID/OPEN", FXB(joinP(p)));
  }

  // ════════ A บัญชี ════════
  await drain();
  {
    const p: string[] = [];
    if (!DP.R1) p.push("ไม่มีมัดจำ R1");
    else {
      const rid = DP.R1.receiptSaleId;
      const jv = await jvOf("PosSale", [rid]);
      const want = { "1000": 107_000, "2110": -100_000, "2200": -7_000 };
      if (jv.length !== 1 || !balanced(jv) || !sameNet(netByCode(jv), want)) p.push(`JV ${jv.length} ${short(netByCode(jv))} (คาด ${short(want)})`);
      p.push(...(await replay("pos.sale.paid", (x) => x.saleId === rid)));
      await drain();
      const jv2 = await jvOf("PosSale", [rid]);
      if (jv2.length !== 1) p.push(`หลังเล่นซ้ำ JV ${jv2.length}`);
    }
    chk("A1", p.length === 0, "Dr 1000 1070 · Cr 2110 1000 · Cr 2200 70 · 1 JV", FXB(joinP(p)));
  }
  let a2Sale = "";
  {
    const p: string[] = [];
    await take("A2", "A", 107_000, { memberId: X || undefined });
    if (!DP.A2) p.push("ไม่มีมัดจำ A2");
    else {
      const r = await cs(saleIn(key("a2"), [["ชุดอาหาร A2", 214_000]], [depPay(107_000, "A2"), cash(107_000)], memberOf(X)));
      if (!ok(r)) p.push(`createSale → ${codeOf(r)} ${short(r?.message ?? "", 80)}`);
      else {
        a2Sale = r.saleId;
        await drain();
        const s = await saleRow(a2Sale);
        if (s?.vatSatang !== 7_000 || s?.grandTotalSatang !== 214_000) p.push(`บิล vat ${s?.vatSatang} (คาด 7000) grand ${s?.grandTotalSatang}`);
        const pay = (await paysOf(a2Sale)).find((x) => x.type === "DEPOSIT");
        if (pay?.refSaleId !== DP.A2.receiptSaleId) p.push(`แถว DEPOSIT refSaleId ${pay?.refSaleId === DP.A2.receiptSaleId ? "" : "ไม่ตรงใบรับ"}`);
        const jv = await jvOf("PosSale", [a2Sale]);
        const want = { "1000": 107_000, "2110": 100_000, "4000": -200_000, "2200": -7_000 };
        if (jv.length !== 1 || !balanced(jv) || !sameNet(netByCode(jv), want)) p.push(`JV ${jv.length} ${short(netByCode(jv))} (คาด ${short(want)})`);
        const vatAll = netByCode([...(await jvOf("PosSale", [DP.A2.receiptSaleId])), ...jv])["2200"] ?? 0;
        if (vatAll !== -14_000) p.push(`Σ VAT ใบรับ + บิล ${vatAll} (คาด −14000)`);
        const ap = await dtxOf("A2", "APPLY");
        if (ap.length !== 1 || ap[0].satang !== 107_000 || ap[0].vatSatang !== 7_000 || ap[0].saleId !== a2Sale) p.push(`APPLY ${short(ap.map((t) => `${t.satang}/${t.vatSatang}`))}`);
        const d = await dep("A2");
        if (d?.usedSatang !== 107_000 || d?.status !== "USED") p.push(`มัดจำ ${d?.usedSatang}/${d?.status}`);
      }
    }
    chk("A2", p.length === 0, "vat 70 · Dr 1000 1070 + Dr 2110 1000 / Cr 4000 2000 + Cr 2200 70 · Σ VAT 140 · USED", FXB(joinP(p)));
  }
  {
    const p: string[] = [];
    await take("A3", "A", 107_000, walkIn("แบ่งใช้"));
    if (!DP.A3) p.push("ไม่มีมัดจำ A3");
    else {
      const v1 = roundHalfUp(7_000 * 50_000, 107_000); // 3271
      const v2 = 7_000 - v1; // 3729 (ใบหลังรับเศษ)
      const b1 = await cs(saleIn(key("a3a"), [["ของ A3 ก", 100_000]], [depPay(50_000, "A3"), cash(50_000)]));
      const b2 = ok(b1) ? await cs(saleIn(key("a3b"), [["ของ A3 ข", 57_000]], [depPay(57_000, "A3")])) : null;
      if (!ok(b1) || !ok(b2)) p.push(`บิล → ${codeOf(b1)} / ${codeOf(b2)} ${short(b1?.message ?? b2?.message ?? "", 80)}`);
      else {
        await drain();
        const ap = await dtxOf("A3", "APPLY");
        const vOf = (sid: string) => ap.find((t) => t.saleId === sid)?.vatSatang;
        if (ap.length !== 2 || vOf(b1.saleId) !== v1 || vOf(b2.saleId) !== v2) p.push(`APPLY vat ${short(ap.map((t) => `${t.satang}/${t.vatSatang}`))} (คาด ${v1} + ${v2})`);
        const s1 = split(100_000);
        const s2 = split(57_000);
        const r1 = await saleRow(b1.saleId);
        const r2 = await saleRow(b2.saleId);
        if (r1?.vatSatang !== s1.vatSatang - v1 || r2?.vatSatang !== s2.vatSatang - v2) p.push(`vat บิล ${r1?.vatSatang}/${r2?.vatSatang} (คาด ${s1.vatSatang - v1}/${s2.vatSatang - v2})`);
        const j1 = netByCode(await jvOf("PosSale", [b1.saleId]));
        const j2 = netByCode(await jvOf("PosSale", [b2.saleId]));
        const w1 = { "1000": 50_000, "2110": 50_000 - v1, "4000": -s1.baseSatang, "2200": -(s1.vatSatang - v1) };
        const w2 = { "2110": 57_000 - v2, "4000": -s2.baseSatang, "2200": -(s2.vatSatang - v2) };
        if (!sameNet(j1, w1)) p.push(`JV ก ${short(j1)} (คาด ${short(w1)})`);
        if (!sameNet(j2, w2)) p.push(`JV ข ${short(j2)} (คาด ${short(w2)})`);
        const d = await dep("A3");
        if (d?.usedSatang !== 107_000 || d?.status !== "USED") p.push(`มัดจำ ${d?.usedSatang}/${d?.status}`);
      }
    }
    chk("A3", p.length === 0, "APPLY vat 3271 + 3729 = 7000 · vat บิล = VAT(ยอด) − APPLY · JV ตรงสตางค์", FXB(joinP(p)));
  }
  {
    const p: string[] = [];
    // สาขา C — สมุดไม่จด VAT
    await take("AC", "C", 100_000, walkIn("สาขาซี"));
    if (!DP.AC) p.push("ไม่มีมัดจำสาขา C");
    else {
      await drain();
      const d = await dep("AC");
      const rs = await saleRow(DP.AC.receiptSaleId);
      if (d?.vatSatang !== 0 || rs?.vatSatang !== 0) p.push(`C vat มัดจำ ${d?.vatSatang} ใบรับ ${rs?.vatSatang}`);
      const jr = netByCode(await jvOf("PosSale", [DP.AC.receiptSaleId]));
      if (!sameNet(jr, { "1010": 100_000, "2110": -100_000 })) p.push(`C JV ใบรับ ${short(jr)}`);
      const b = await cs(saleIn(key("a4c"), [["ของ A4 C", 100_000]], [depPay(100_000, "AC")], { unitId: U.C, systemId: S.POSC }));
      if (!ok(b)) p.push(`C บิล → ${codeOf(b)} ${short(b?.message ?? "", 60)}`);
      else {
        await drain();
        const s = await saleRow(b.saleId);
        const jb = netByCode(await jvOf("PosSale", [b.saleId]));
        if (s?.vatSatang !== 0 || !sameNet(jb, { "2110": 100_000, "4000": -100_000 })) p.push(`C บิล vat ${s?.vatSatang} JV ${short(jb)}`);
      }
    }
    // สาขา D — POS ไม่ผูกสมุด
    await take("AD", "D", 50_000, walkIn("สาขาดี"));
    if (!DP.AD) p.push("ไม่มีมัดจำสาขา D");
    else {
      const b = await cs(saleIn(key("a4d"), [["ของ A4 D", 50_000]], [depPay(50_000, "AD")], { unitId: U.D, systemId: S.POSD }));
      await drain();
      const d = await dep("AD");
      const jv = await jvOf("PosSale", [DP.AD.receiptSaleId, b?.saleId ?? ""]);
      if (!ok(b) || d?.status !== "USED" || jv.length) p.push(`D บิล ${codeOf(b)} · มัดจำ ${d?.status} · JV ${jv.length}`);
    }
    chk("A4", p.length === 0, "C: vat 0 · Dr 1010 / Cr 2110 · Dr 2110 / Cr 4000 · D: ไม่มี JV ใช้ได้", FXB(joinP(p)));
  }
  {
    const p: string[] = [];
    const docOf = async (refId: string): Promise<Any> => (refId ? P.accountDocument.findFirst({ where: { tenantId: T, refType: "PosSale", refId } }).catch(() => null) : null);
    if (!DP.R1) p.push("ไม่มีมัดจำ R1");
    else {
      const d = await docOf(DP.R1.receiptSaleId);
      if (!d || d.docType !== "DEPOSIT_RECEIPT" || d.grandTotal !== 107_000 || d.vatAmount !== 7_000) p.push(`เอกสารใบรับ ${d ? `${d.docType} ${d.grandTotal}/${d.vatAmount}` : "ไม่มี"}`);
    }
    if (!a2Sale) p.push("ไม่มีบิล A2");
    else {
      const d = await docOf(a2Sale);
      if (!d || d.depositDeducted !== 107_000 || d.vatAmount !== 7_000) p.push(`เอกสารบิล A2 ${d ? `${d.docType} หักมัดจำ ${d.depositDeducted} vat ${d.vatAmount}` : "ไม่มี"} (คาด 107000 / 7000)`);
    }
    chk("A5", p.length === 0, "DEPOSIT_RECEIPT 1070/70 · บิล depositDeducted 1070 vat 70", FXB(joinP(p)));
  }
  {
    const p: string[] = [];
    if (fx) p.push("fixture");
    else {
      const ctx = { tenantId: T, unitId: U.L };
      const service = await step("บริการจอง", () => P.bookingService.create({ data: { tenantId: T, unitId: U.L, name: `นวด ${RAND}`, durationMin: 60, bufferMin: 0, priceSatang: 0, depositSatang: 50_000 } }));
      const staff = await step("ช่างจอง", () => P.bookingStaff.create({ data: { tenantId: T, unitId: U.L, name: `ช่าง ${RAND}` } }));
      const ap = service && staff ? await call(bookMod, "createAppointment", { tenantId: T, unitId: U.L, serviceId: service.id, staffId: staff.id, dateStr: "2031-05-21", startMin: 600, customerName: "ลูกค้าจอง", customerPhone: "0800000009", source: "STAFF" }) : null;
      const rdp = ap?.id ? await call(bookMod, "recordDeposit", ctx, ap.id) : null;
      if (rdp?.ok !== true || !rdp?.saleId) p.push(`recordDeposit → ${codeOf(rdp)} ${short(rdp?.reason ?? rdp?.message ?? ap?.reason ?? "", 80)}`);
      else {
        await drain();
        const sid = String(rdp.saleId);
        const s = await saleRow(sid);
        const pays = await paysOf(sid);
        // ORACLE-EDIT ผู้คุม 23.10 (CD-P51-O6 · P5.1 MA2 แทนมติ 7 CD7): มัดจำโมดูล = ใบรับ POS_DEPOSIT (Cr 2110 ฐาน + Cr 2200 · ไม่มีรายได้) + PosDeposit + RECEIVE
        //   (เดิม: บิล BOOKING · JV Dr 2110 / Cr รายได้ = hunt M-A F2 รายได้ซ้ำ) ◂
        if (s?.sourceModule !== "POS_DEPOSIT" || pays.length !== 1 || pays[0].type !== "DEPOSIT" || pays[0].refSaleId) p.push(`บิล ${s?.sourceModule} แถว ${short(pays.map((x) => `${x.type}:${x.refSaleId ?? "-"}`))}`);
        const net = netByCode(await jvOf("PosSale", [sid]));
        const v = split(50_000);
        const has4 = Object.entries(net).some(([c, x]) => c.startsWith("4") && x !== 0);
        if (net["1010"] !== 50_000 || net["2110"] !== -v.baseSatang || net["2200"] !== -v.vatSatang || has4 || net["1000"]) p.push(`JV ${short(net)} (คาด Dr 1010 50000 · Cr 2110 ${v.baseSatang} · Cr 2200 ${v.vatSatang} · ไม่มี 4xxx)`);
        if (COL.dep && !(await q(`SELECT id FROM "PosDeposit" WHERE "receiptSaleId" = $1`, sid)).length) p.push("ไม่มี PosDeposit ของใบรับ");
        if (COL.txn && !(await saleTxns(sid)).some((t: Any) => String(t.type) === "RECEIVE")) p.push("ไม่มี PosDepositTxn RECEIVE ของใบรับ");
      }
    }
    chk("A6", p.length === 0, "ใบรับ POS_DEPOSIT · Dr 1010 / Cr 2110 + 2200 · ไม่มี 4xxx · PosDeposit + RECEIVE (CD-P51-O6)", FXB(joinP(p)));
  }

  // ════════ R5 ตัวอ่าน ════════
  {
    const p: string[] = [];
    const text = async (saleId: string): Promise<string> => {
      const r = await call(rcpMod, "receiptPayload", ctxOf("A"), owner, { saleId });
      if (r?.ok !== true || typeof renderMod?.renderReceiptHtml !== "function") return `(${codeOf(r)})`;
      try {
        return String(renderMod.renderReceiptHtml(r.payload, { paper: "80", locale: "th" })).replace(/<[^>]+>/g, " ");
      } catch (e) {
        return `(render ${(e as Error).message.slice(0, 40)})`;
      }
    };
    if (!DP.R1) p.push("ไม่มีมัดจำ R1");
    else {
      const t = await text(DP.R1.receiptSaleId);
      if (!t.includes("ใบรับเงินมัดจำ") || !t.includes("ใบกำกับภาษีอย่างย่อ")) p.push(`หัวใบรับ ${short(t.replace(/\s+/g, " "), 80)}`);
    }
    if (!a2Sale || !DP.A2) p.push("ไม่มีบิล A2");
    else {
      const t = await text(a2Sale);
      if (!t.includes("มัดจำ") || (DP.A2.receiptNo && !t.includes(DP.A2.receiptNo))) p.push("ใบเสร็จบิล A2 ไม่มีบรรทัดมัดจำ + เลขใบรับ");
    }
    // ปิดวัน: เทียบกับฐานข้อมูล ณ ตอนนี้
    const cd = fx ? null : await call(svc, "closeDaySummary", { tenantId: T, systemId: S.POS });
    const one = async (sql: string): Promise<number> => Number((await q(sql, T, S.POS))[0]?.n ?? NaN);
    const sales = await one(`SELECT COALESCE(SUM("grandTotalSatang"),0)::int AS n FROM "PosSale" WHERE "tenantId" = $1 AND "systemId" = $2 AND "docType"::text = 'SALE' AND status::text <> 'VOIDED' AND COALESCE("sourceModule"::text,'') <> 'POS_DEPOSIT'`);
    const refunds = await one(`SELECT COALESCE(SUM(r."grandTotalSatang"),0)::int AS n FROM "PosSale" r JOIN "PosSale" s ON s.id = r."refSaleId" WHERE r."tenantId" = $1 AND r."systemId" = $2 AND r."docType"::text = 'REFUND' AND COALESCE(s."sourceModule"::text,'') <> 'POS_DEPOSIT'`);
    const recv = await one(`SELECT COALESCE(SUM("grandTotalSatang"),0)::int AS n FROM "PosSale" WHERE "tenantId" = $1 AND "systemId" = $2 AND "docType"::text = 'SALE' AND status::text <> 'VOIDED' AND "sourceModule"::text = 'POS_DEPOSIT'`);
    const applied = await one(`SELECT COALESCE(SUM(p."amountSatang"),0)::int AS n FROM "PosPayment" p JOIN "PosSale" s ON s.id = p."saleId" WHERE s."tenantId" = $1 AND s."systemId" = $2 AND p.type::text = 'DEPOSIT' AND s."docType"::text = 'SALE' AND s.status::text <> 'VOIDED' AND p."refSaleId" IN (SELECT id FROM "PosSale" WHERE "tenantId" = $1 AND "sourceModule"::text = 'POS_DEPOSIT')`);
    if (cd?.ok === false || cd?.netSalesSatang !== sales - refunds) p.push(`ปิดวัน ยอดขาย ${cd?.netSalesSatang ?? codeOf(cd)} (คาด ${sales - refunds} ไม่รวมใบรับ ${recv})`);
    if (cd?.deposits?.receivedSatang !== recv || cd?.deposits?.appliedSatang !== applied) p.push(`ปิดวัน deposits ${short(cd?.deposits)} (คาด รับ ${recv} ใช้ ${applied})`);
    const offT = offProbe.tenders?.tenders ?? offProbe.tenders;
    const on = await call(tenderMod, "registerPayTenders", ctxOf("A"), owner);
    const onT = on?.tenders ?? on;
    if (offT?.deposit?.visible !== true || offT?.deposit?.enabled !== false) p.push(`ปิดสวิตช์ ${short(offT?.deposit)}`);
    if (on?.ok !== true || onT?.deposit?.visible !== true || onT?.deposit?.enabled !== true) p.push(`เปิดสวิตช์ ${codeOf(on)} ${short(onT?.deposit)}`);
    chk("R5", p.length === 0, "หัวใบรับ · บรรทัดมัดจำ · ปิดวันไม่รวมใบรับ + deposits · ช่องจอชำระตามค่าตั้ง", FXB(joinP(p)));
  }

  // ════════ P ใช้มัดจำ ════════
  {
    const p: string[] = [];
    await take("P1", "A", 107_000, { memberId: X || undefined });
    if (!DP.P1) p.push("ไม่มีมัดจำ P1");
    else {
      const k = key("p1");
      const r = await regSubmit({ lines: [{ name: `ของ P1 ${RAND}`, qty: 1, unitPriceSatang: 150_000 }], memberId: X }, k, [regDep(107_000, "P1"), cash(43_000)]);
      if (r?.ok !== true) p.push(`หน้าขาย → ${codeOf(r)} ${short(r?.message ?? "", 80)}`);
      else {
        const sid = String(r.saleId);
        const pay = (await paysOf(sid)).find((x) => x.type === "DEPOSIT");
        if (!pay || pay.refSaleId !== DP.P1.receiptSaleId || pay.amountSatang !== 107_000) p.push(`แถว DEPOSIT ${short(pay ? { ref: pay.refSaleId === DP.P1.receiptSaleId, a: pay.amountSatang } : null)}`);
        const ap = await dtxOf("P1", "APPLY");
        if (ap.length !== 1 || ap[0].idempotencyKey !== `dep-apply-${sid}-${DP.P1.id}` || ap[0].paymentId !== pay?.id || ap[0].satang !== 107_000 || ap[0].vatSatang !== 7_000 || ap[0].saleId !== sid)
          p.push(`APPLY ${short(ap.map((t) => ({ key: t.idempotencyKey, pay: t.paymentId === pay?.id, s: t.satang, v: t.vatSatang })))}`);
        const d = await dep("P1");
        if (d?.usedSatang !== 107_000 || d?.status !== "USED") p.push(`มัดจำ ${d?.usedSatang}/${d?.status}`);
        if ((await saleRow(sid))?.status !== "PAID") p.push("บิลไม่ PAID");
      }
    }
    chk("P1", p.length === 0, "PAID · refSaleId = ใบรับ · APPLY คีย์ dep-apply · USED", FXB(joinP(p)));
  }
  {
    const p: string[] = [];
    await take("P2a", "A", 30_000, walkIn("คู่ ก"));
    await take("P2b", "A", 20_000, walkIn("คู่ ข"));
    if (!DP.P2a || !DP.P2b || !GC.G1) p.push("ไม่มีมัดจำ/บัตร P2");
    else {
      const r = await cs(saleIn(key("p2"), [["ของ P2", 100_000]], [depPay(30_000, "P2a"), depPay(20_000, "P2b"), gcPay(10_000, "G1"), cash(40_000)]));
      if (!ok(r)) p.push(`createSale → ${codeOf(r)} ${short(r?.message ?? "", 80)}`);
      else {
        const pays = await paysOf(r.saleId);
        const ap = await saleTxns(r.saleId);
        const uses = (await P.giftCardTxn.findMany({ where: { tenantId: T, giftCardId: GC.G1.id, type: "USE" } }).catch(() => [])) as Any[];
        if (sum(pays.map((x) => Number(x.amountSatang))) !== 100_000 || pays.filter((x) => x.type === "DEPOSIT").length !== 2) p.push(`แถวจ่าย ${short(pays.map((x) => `${x.type}:${x.amountSatang}`))}`);
        if (ap.filter((t) => t.type === "APPLY").length !== 2 || uses.length !== 1) p.push(`APPLY ${ap.length} · USE ${uses.length}`);
        const s = await saleRow(r.saleId);
        const want = split(100_000).vatSatang - sum(ap.map((t) => Number(t.vatSatang)));
        if (s?.vatSatang !== want) p.push(`vat ${s?.vatSatang} (คาด ${want})`);
        const da = await dep("P2a");
        const db = await dep("P2b");
        if (da?.status !== "USED" || db?.status !== "USED") p.push(`มัดจำ ${da?.status}/${db?.status}`);
      }
    }
    chk("P2", p.length === 0, "Σ ตรง · APPLY 2 · USE 1 · vat สุทธิ", FXB(joinP(p)));
  }
  {
    const p: string[] = [];
    await take("P3", "A", 10_000, walkIn("เกินยอด"));
    await take("P3r", "A", 10_000, walkIn("คืนแล้ว"));
    const tryOne = async (label: string, pays: Any[], code: string) => {
      const k = key("p3");
      const r = await cs(saleIn(k, [["ของ P3", sum(pays.map((x) => x.amountSatang))]], pays));
      if (!refused(r, code) || (await saleByKey(k))) p.push(`${label} → ${codeOf(r)} (คาด ${code})`);
    };
    if (!DP.P3 || !DP.A2) p.push("ไม่มีมัดจำ P3/A2");
    else {
      await tryOne("เกินคงเหลือ", [depPay(15_000, "P3"), cash(5_000)], "DEPOSIT_EXCEEDS");
      const d = await dep("P3");
      if (d?.usedSatang !== 0 || (await dtxOf("P3", "APPLY")).length) p.push("มัดจำ P3 ถูกเขียน");
      await tryOne("USED", [depPay(1_000, "A2")], "DEPOSIT_CLOSED");
    }
    if (!DP.P3r) p.push("ไม่มีมัดจำ P3r");
    else {
      const rr = await call(depMod, "registerRefundDeposit", ctxU("A"), owner, { depositId: DP.P3r.id, payMethods: [cash(10_000)], reason: "ลูกค้ายกเลิก", idempotencyKey: key("p3rf") });
      if (rr?.ok !== true) p.push(`คืนมัดจำ (ฟิกซ์เจอร์) → ${codeOf(rr)}`);
      else await tryOne("REFUNDED", [depPay(1_000, "P3r")], "DEPOSIT_CLOSED");
    }
    chk("P3", p.length === 0, "EXCEEDS ไม่เขียน · USED/REFUNDED → CLOSED", FXB(joinP(p)));
  }
  {
    const p: string[] = [];
    await take("PB", "B", 10_000, walkIn("สาขาบี"));
    await take("P4x", "A", 10_000, { memberId: X || undefined });
    await take("P4w", "A", 10_000, walkIn("ถือใบ"));
    // มัดจำของร้านอื่น (แถวตรงในร้าน -t2 · ไม่มีฟังก์ชันให้สร้างข้ามร้าน)
    const t2Receipt = `qc29b-t2-sale-${RAND}`;
    if (!fx && COL.dep) {
      await step("มัดจำร้านอื่น", () =>
        P.$executeRawUnsafe(
          `INSERT INTO "PosDeposit" (id, "tenantId", "systemId", "unitId", "amountSatang", "vatSatang", "usedSatang", "refundedSatang", status, "receiptSaleId", "receiptNo", "idempotencyKey", "createdByUserId", "createdAt", "updatedAt")
           VALUES ($1, $2, $3, $4, 10000, 654, 0, 0, 'OPEN', $5, 'T2-0001', $6, $7, now(), now())`,
          `qc29b-t2-dep-${RAND}`, T2, `qc29b-t2-sys-${RAND}`, `qc29b-t2-unit-${RAND}`, t2Receipt, `qc29b-t2-${RAND}`, ownerId,
        ),
      );
    }
    const msgs: string[] = [];
    const tryNF = async (label: string, ref: string) => {
      const k = key("p4");
      const r = await cs(saleIn(k, [["ของ P4", 10_000]], [{ type: "DEPOSIT", amountSatang: 10_000, refSaleId: ref }]));
      if (!refused(r, "DEPOSIT_NOT_FOUND") || (await saleByKey(k))) p.push(`${label} → ${codeOf(r)}`);
      msgs.push(String(r?.message ?? ""));
    };
    await tryNF("สาขา B", DP.PB?.receiptSaleId || "qc-missing-PB");
    await tryNF("ร้านอื่น", t2Receipt);
    await tryNF("ไม่มีจริง", `qc29b-none-${RAND}`);
    if (new Set(msgs).size !== 1) p.push("ข้อความ NOT_FOUND ไม่เหมือนกัน");
    const rk = key("p4r");
    const rr = await regSubmit({ lines: [{ name: `ของ P4 หน้าขาย ${RAND}`, qty: 1, unitPriceSatang: 10_000 }] }, rk, [regDep(10_000, "PB")]);
    if (!refused(rr, "DEPOSIT_NOT_FOUND") || (await saleByKey(rk))) p.push(`หน้าขาย สาขา B → ${codeOf(rr)}`);
    const kY = key("p4y");
    const ry = DP.P4x && Y ? await cs(saleIn(kY, [["ของ P4 Y", 10_000]], [depPay(10_000, "P4x")], memberOf(Y))) : null;
    if (!refused(ry, "DEPOSIT_NOT_OWNER") || (await saleByKey(kY))) p.push(`X บนบิล Y → ${codeOf(ry)}`);
    const kW = key("p4n");
    const rw = DP.P4x ? await cs(saleIn(kW, [["ของ P4 walk", 10_000]], [depPay(10_000, "P4x")])) : null;
    if (!refused(rw, "DEPOSIT_NOT_OWNER") || (await saleByKey(kW))) p.push(`X บนบิล walk-in → ${codeOf(rw)}`);
    if ((await dep("P4x"))?.usedSatang !== 0) p.push("มัดจำ X ถูกตัด");
    const rok = DP.P4w && Y ? await cs(saleIn(key("p4ok"), [["ของ P4 ถือใบ", 10_000]], [depPay(10_000, "P4w")], memberOf(Y))) : null;
    if (!ok(rok)) p.push(`walk-in บนบิล Y (ควรผ่าน) → ${codeOf(rok)} ${short(rok?.message ?? "", 60)}`);
    chk("P4", p.length === 0, "NOT_FOUND ×4 ข้อความเดียว · NOT_OWNER ×2 · walk-in ok", FXB(joinP(p)));
  }
  {
    const p: string[] = [];
    // PAR ครึ่งหนึ่ง: หน้าขายส่ง DEPOSIT ไม่มี depositId = VALIDATION (qc-pos-p1.3 S3.38 / qc-pos-p1.6 T6)
    const rk = key("p5r");
    const rr = fx ? null : await regSubmit({ lines: [{ name: `ของ P5 ${RAND}`, qty: 1, unitPriceSatang: 1_000 }] }, rk, [{ type: "DEPOSIT", amountSatang: 1_000 }]);
    if (!refused(rr, "VALIDATION") || (await saleByKey(rk))) p.push(`หน้าขายไม่มี depositId → ${codeOf(rr)}`);
    for (const l of ["P5a", "P5b", "P5c", "P5d"]) await take(l, "A", 1_000, walkIn(`สี่ใบ ${l}`));
    const tryOne = async (label: string, input: Any) => {
      const r = fx ? null : await cs(input);
      if (!refused(r, "VALIDATION") || (await saleByKey(input.idempotencyKey))) p.push(`${label} → ${codeOf(r)}`);
    };
    if (!DP.P5a || !DP.P5d) p.push("ไม่มีมัดจำ P5");
    else {
      await tryOne("ใบเดียวสองแถว", saleIn(key("p5"), [["ของ P5", 1_000]], [depPay(500, "P5a"), depPay(500, "P5a")]));
      await tryOne("4 ใบ", saleIn(key("p5"), [["ของ P5", 4_000]], [depPay(1_000, "P5a"), depPay(1_000, "P5b"), depPay(1_000, "P5c"), depPay(1_000, "P5d")]));
      await tryOne("ทิปบนบิลมัดจำล้วน", saleIn(key("p5"), [["ของ P5", 900]], [depPay(1_000, "P5a")], { tipSatang: 100 }));
      await tryOne("บิล MEMBER", saleIn(key("p5"), [["บัตรของขวัญ P5", 1_000]], [depPay(1_000, "P5a")], { sourceModule: "MEMBER" }));
      await tryOne("บิล POS_DEPOSIT", saleIn(key("p5"), [["มัดจำ P5", 1_000]], [depPay(1_000, "P5a")], { sourceModule: "POS_DEPOSIT" }));
      for (const l of ["P5a", "P5b", "P5c", "P5d"]) if ((await dep(l))?.usedSatang !== 0) p.push(`${l} ถูกตัด`);
    }
    chk("P5", p.length === 0, "VALIDATION ×6 · ไม่มีบิล · มัดจำไม่ถูกแตะ", FXB(joinP(p)));
  }
  {
    const p: string[] = [];
    await take("P6", "A", 1_000, walkIn("ออเดอร์"));
    if (fx) p.push("fixture");
    else {
      const chans = (await call(chMod, "ensureUnitChannels", P, { tenantId: T, systemId: S.POS, unitId: U.A })) as Any;
      const chat = Array.isArray(chans) ? chans.find((c: Any) => c.code === "CHAT") : null;
      if (!chat) p.push(`ไม่มีช่องทาง CHAT (${codeOf(chans)})`);
      else {
        const ing = await call(orderMod, "ingestOrder", ctxOf("A"), owner, { channelId: chat.id, idempotencyKey: key("p6"), lines: [{ name: `ของออเดอร์ ${RAND}`, unitPriceSatang: 1_000, qty: 1 }], customer: { name: "คุณแชท" }, fulfilment: "PICKUP", paymentState: "PAY_ON_PICKUP" });
        const id = String(ing?.orderId ?? "");
        if (!id) p.push(`ingestOrder → ${codeOf(ing)} ${short(ing?.message ?? "", 60)}`);
        else {
          const acc = await call(orderMod, "acceptOrder", ctxOf("A", DEV1), owner, { id });
          if (acc?.ok !== true) p.push(`acceptOrder → ${codeOf(acc)}`);
          const s0 = await P.posSale.count({ where: { tenantId: T } });
          for (const pm of [{ type: "DEPOSIT", amountSatang: 1_000 }, { type: "DEPOSIT", amountSatang: 1_000, depositId: DP.P6?.id || "qc-missing-P6" }]) {
            const r = await call(orderMod, "payOrder", ctxOf("A", DEV1), owner, { id, idempotencyKey: key("p6p"), payMethods: [pm] });
            if (!refused(r, "VALIDATION")) p.push(`payOrder ${"depositId" in pm ? "+depositId" : ""} → ${codeOf(r)}`);
          }
          const o = await P.posOrder.findUnique({ where: { id } }).catch(() => null);
          if (!o || o.paymentState === "PAID" || o.saleId) p.push(`ออเดอร์ ${o?.paymentState}/${o?.saleId ? "มีบิล" : "-"}`);
          if ((await P.posSale.count({ where: { tenantId: T } })) !== s0) p.push("มีบิลเกิด");
        }
      }
      const op = ((apiSales?.SALES_OPS ?? []) as Any[]).find((o) => o?.id === "sales.create");
      if (!op?.input?.safeParse) p.push("ไม่พบ op sales.create");
      else {
        for (const pm of [{ type: "DEPOSIT", amountSatang: 1_000 }, { type: "DEPOSIT", amountSatang: 1_000, refSaleId: DP.P6?.receiptSaleId || "qc-missing" }]) {
          const r = op.input.safeParse({ unitId: U.A, lines: [{ name: "API", qty: 1, unitPriceSatang: 1_000 }], payMethods: [pm] });
          if (r?.success !== false) p.push(`API ยอมรับ ${short(pm)}`);
        }
        const okIn = op.input.safeParse({ unitId: U.A, lines: [{ name: "API", qty: 1, unitPriceSatang: 1_000 }], payMethods: [{ type: "CASH", amountSatang: 1_000 }] });
        if (okIn?.success !== true) p.push("ตัวควบคุมบวก: CASH ถูกปฏิเสธ");
      }
      if (DP.P6 && (await dep("P6"))?.usedSatang !== 0) p.push("มัดจำ P6 ถูกตัด");
    }
    chk("P6", p.length === 0, "payOrder VALIDATION ×2 · API ปฏิเสธ ×2 · CASH ผ่าน", FXB(joinP(p)));
  }
  {
    const p: string[] = [];
    const look = (query: string, actor: Any = owner, unit = "A") => call(depMod, "registerDepositLookup", ctxOf(unit), actor, { query });
    const rows = (r: Any): Any[] => (Array.isArray(r?.deposits) ? r.deposits : []);
    if (!DP.R1 || !DP.R2) p.push("ไม่มีมัดจำ R1/R2");
    else {
      const n0 = COL.txn ? Number((await q(`SELECT count(*)::int AS n FROM "PosDepositTxn" WHERE "tenantId" = $1`, T))[0]?.n ?? -1) : -1;
      const a = await look(DP.R1.receiptNo || "-");
      const ra = rows(a).find((x) => x?.id === DP.R1.id);
      if (a?.ok !== true || !ra || ra.remainingSatang !== 107_000 || ra.status !== "OPEN" || ra.receiptNo !== DP.R1.receiptNo) p.push(`เลขใบรับ → ${codeOf(a)} ${short(ra ?? rows(a).length, 120)}`);
      const r2 = await depRow(DP.R2.id);
      const b = await look(`คุณอรทัย ${RAND}`);
      const rb = rows(b).find((x) => x?.id === DP.R2.id);
      // ORACLE-EDIT ผู้คุม 15 ต.ค. (P2.9b fix 1 มติ 6 · hunt D5): ค้นด้วยชื่อ = แถวปิดบังไม่มียอดคงเหลือ · ยอดเห็นเมื่อเลขใบรับ + 4 หลักท้าย ◂
      if (b?.ok !== true || !rb || rb.remainingSatang !== null || typeof rb.phoneMasked !== "string" || !rb.phoneMasked) p.push(`ชื่อ → ${codeOf(b)} ${short(rb ?? rows(b).length, 120)}`);
      const b2 = DP.R2.phone ? await call(depMod, "registerDepositLookup", ctxOf("A"), owner, { query: DP.R2.receiptNo || "-", phoneLast4: DP.R2.phone.slice(-4) }) : null;
      const rb2 = rows(b2).find((x) => x?.id === DP.R2.id);
      if (!rb2 || rb2.remainingSatang !== 20_000) p.push(`เลขใบรับ + 4 หลัก → ${codeOf(b2)} ${short(rb2 ?? rows(b2).length, 120)}`);
      const bj = JSON.stringify(b ?? {});
      if (PHONES.some((ph) => bj.includes(ph))) p.push("ผลมีเบอร์เต็ม");
      if (!r2?.phoneMasked || PHONES.includes(String(r2.phoneMasked))) p.push(`PosDeposit.phoneMasked ${r2?.phoneMasked ? "เป็นเบอร์เต็ม" : "ว่าง"}`);
      const c = await look(DP.R1.receiptNo || "-", owner, "B");
      if (rows(c).some((x) => x?.id === DP.R1.id) || !(c?.ok === true || refused(c, "DEPOSIT_NOT_FOUND"))) p.push(`สาขา B เห็น/ผิด → ${codeOf(c)}`);
      const d = await look(DP.R1.receiptNo || "-", noperm);
      if (!refused(d, "PERMISSION_DENIED")) p.push(`ไม่มีสิทธิ์ → ${codeOf(d)}`);
      const n1 = COL.txn ? Number((await q(`SELECT count(*)::int AS n FROM "PosDepositTxn" WHERE "tenantId" = $1`, T))[0]?.n ?? -1) : -1;
      if (n0 !== n1 || (await depRow(DP.R1.id))?.usedSatang !== 0) p.push(`ค้นแล้วแถวเปลี่ยน ${n0}→${n1}`);
    }
    chk("P7", p.length === 0, "พบด้วยเลข/ชื่อ · ปิดบังเบอร์ · สาขาอื่นไม่เห็น · สิทธิ์ · ไม่เขียน", FXB(joinP(p)));
  }

  // ════════ C แข่ง ════════
  type Settled = { ok: true; v: Any } | { ok: false; e: Any };
  const settle = (pr: Promise<Any>): Promise<Settled> => pr.then((v) => (v && v.ok === false ? ({ ok: false, e: v } as Settled) : ({ ok: true, v } as Settled)), (e) => ({ ok: false as const, e }));
  const holdLock = async (depositId: string, minWaiters: number, starts: (() => Promise<Any>)[], act: (tx: Any) => Promise<void> = async () => {}) => {
    let blocked = 0;
    let heldMs = 0;
    const box: { ps: Promise<Settled>[] } = { ps: [] };
    await P.$transaction(async (tx: Any) => {
      await tx.$queryRawUnsafe(`SELECT id FROM "PosDeposit" WHERE id = $1 FOR UPDATE`, depositId);
      const pid = Number(((await tx.$queryRawUnsafe(`SELECT pg_backend_pid()::int AS p`)) as Any[])[0].p);
      box.ps = starts.map((s) => settle(s()));
      const t0 = Date.now();
      while (Date.now() - t0 < 20_000) {
        // ผู้รอชั้นที่ 2 (รอผู้รอคนแรกที่ถือแถวตัวนับใบเสร็จ) นับด้วย — แบบเดียวกับ qc-pos-p2.9 C1
        const n = Number(((await P.$queryRawUnsafe(
          `WITH w1 AS (SELECT pid FROM pg_stat_activity WHERE $1::int = ANY(pg_blocking_pids(pid)))
           SELECT count(*)::int AS n FROM pg_stat_activity WHERE pid IN (SELECT pid FROM w1) OR pg_blocking_pids(pid) && ARRAY(SELECT pid FROM w1)`, pid)) as Any[])[0].n);
        blocked = Math.max(blocked, n);
        if (blocked >= minWaiters && Date.now() - t0 >= 800) break;
        await sleep(150);
      }
      heldMs = Date.now() - t0;
      await act(tx);
    }, { timeout: 60_000, maxWait: 15_000 });
    return { blocked, heldMs, res: await Promise.all(box.ps) };
  };
  const raceReady = COL.dep && COL.txn && !!depMod && !fx;
  {
    const p: string[] = [];
    await take("C1", "A", 50_000, walkIn("แข่ง"));
    if (!raceReady || !DP.C1) p.push(raceReady ? "ไม่มีมัดจำ C1" : "ยังไม่มีของ P2.9b");
    else {
      const k1 = key("c1");
      const k2 = key("c1");
      const h = await holdLock(DP.C1.id, 2, [() => svc.createSale(saleIn(k1, [["ของ C1", 30_000]], [depPay(30_000, "C1")])), () => svc.createSale(saleIn(k2, [["ของ C1", 30_000]], [depPay(30_000, "C1")]))]);
      const okN = h.res.filter((x) => x.ok).length;
      const bad = h.res.filter((x) => !x.ok).map((x) => errCode((x as Any).e));
      const d = await dep("C1");
      const nSale = Number(!!(await saleByKey(k1))) + Number(!!(await saleByKey(k2)));
      const ap = await dtxOf("C1", "APPLY");
      if (h.blocked < 2 || okN !== 1 || bad[0] !== "DEPOSIT_EXCEEDS" || d?.usedSatang !== 30_000 || nSale !== 1 || ap.length !== 1) p.push(`กั้น ${h.blocked} · ok ${okN} · ${bad.join(",")} · used ${d?.usedSatang} · บิล ${nSale} · APPLY ${ap.length}`);
    }
    chk("C1", p.length === 0, "1 PAID · 1 DEPOSIT_EXCEEDS · used 300 · APPLY 1", FXB(joinP(p)));
  }
  {
    const p: string[] = [];
    await take("C2", "A", 30_000, walkIn("คีย์ซ้ำ"));
    if (!DP.C2) p.push("ไม่มีมัดจำ C2");
    else {
      const k = key("c2");
      const rs = await Promise.all(Array.from({ length: 10 }, () => settle(svc.createSale(saleIn(k, [["ของ C2", 30_000]], [depPay(10_000, "C2"), cash(20_000)])))));
      const ids = new Set(rs.filter((x) => x.ok).map((x) => (x as Any).v?.saleId));
      const errs = rs.filter((x) => !x.ok).map((x) => errCode((x as Any).e));
      const nSale = await P.posSale.count({ where: { tenantId: T, idempotencyKey: k } });
      const ap = await dtxOf("C2", "APPLY");
      const d = await dep("C2");
      if (errs.length || ids.size !== 1 || nSale !== 1 || ap.length !== 1 || d?.usedSatang !== 10_000) p.push(`ok ${rs.length - errs.length} ${errs.slice(0, 3).join(",")} · saleId ${ids.size} · บิล ${nSale} · APPLY ${ap.length} · used ${d?.usedSatang}`);
    }
    chk("C2", p.length === 0, "1 บิล · APPLY 1 · used 100", FXB(joinP(p)));
  }
  {
    const p: string[] = [];
    for (const l of ["C3a", "C3b", "C3c"]) await take(l, "A", 10_000, walkIn(`ซ้ำต่างใบ ${l}`));
    if (!DP.C3a || !DP.C3b || !DP.C3c) p.push("ไม่มีมัดจำ C3");
    else {
      const k = key("c3");
      const a = await cs(saleIn(k, [["ของ C3", 10_000]], [depPay(10_000, "C3a")]));
      const b = ok(a) ? await cs(saleIn(k, [["ของ C3", 10_000]], [depPay(10_000, "C3b")])) : null;
      if (!ok(a) || !refused(b, "IDEMPOTENCY_CONFLICT")) p.push(`createSale: ครั้งแรก ${codeOf(a)} · ใบอื่นคีย์เดิม ${codeOf(b)}`);
      const k2 = key("c3r");
      const cart = { lines: [{ name: `ของ C3 หน้าขาย ${RAND}`, qty: 1, unitPriceSatang: 5_000 }] };
      const c = await regSubmit(cart, k2, [regDep(5_000, "C3c")]);
      const d = c?.ok === true ? await regSubmit(cart, k2, [regDep(5_000, "C3b")]) : null;
      if (c?.ok !== true || !refused(d, "IDEMPOTENCY_CONFLICT")) p.push(`หน้าขาย: ครั้งแรก ${codeOf(c)} · ใบอื่นคีย์เดิม ${codeOf(d)}`);
      const db = await dep("C3b");
      const tb = await dtxOf("C3b");
      if (db?.usedSatang !== 0 || tb.length !== 1 || tb[0]?.type !== "RECEIVE") p.push(`มัดจำ C3b ถูกแตะ used ${db?.usedSatang} · txn ${short(tb.map((t) => t.type))}`);
    }
    chk("C3", p.length === 0, "CONFLICT ×2 · มัดจำใบอื่นไม่ถูกแตะ", FXB(joinP(p)));
  }
  {
    const p: string[] = [];
    await take("C4", "A", 50_000, walkIn("ใช้หรือคืน"));
    if (!raceReady || !DP.C4) p.push(raceReady ? "ไม่มีมัดจำ C4" : "ยังไม่มีของ P2.9b");
    else {
      const k = key("c4");
      const h = await holdLock(DP.C4.id, 2, [
        () => svc.createSale(saleIn(k, [["ของ C4", 50_000]], [depPay(50_000, "C4")])),
        () => depMod.registerRefundDeposit(ctxU("A"), owner, { depositId: DP.C4.id, payMethods: [cash(50_000)], reason: "ลูกค้ายกเลิก", idempotencyKey: key("c4rf") }),
      ]);
      const [apply, rf] = h.res;
      const d = await dep("C4");
      const sale = await saleByKey(k);
      const rdocs = await refundDocs(DP.C4.receiptSaleId);
      const one = Number(!!apply?.ok) + Number(!!rf?.ok);
      const loser = !apply?.ok ? errCode((apply as Any)?.e) : String((rf as Any)?.e?.code ?? errCode((rf as Any)?.e));
      const inv = Number(d?.usedSatang) + Number(d?.refundedSatang);
      const shape = apply?.ok ? !!sale && rdocs.length === 0 && d?.usedSatang === 50_000 : !sale && rdocs.length === 1 && d?.refundedSatang === 50_000;
      if (h.blocked < 2 || one !== 1 || !["DEPOSIT_CLOSED", "DEPOSIT_EXCEEDS"].includes(loser) || inv !== 50_000 || !shape)
        p.push(`กั้น ${h.blocked} · ชนะ ${one} (${apply?.ok ? "ใช้" : rf?.ok ? "คืน" : "-"}) · แพ้ ${loser} · used+refunded ${inv} · บิล ${sale ? 1 : 0} ใบคืน ${rdocs.length}`);
    }
    chk("C4", p.length === 0, "ชนะหนึ่ง · CLOSED/EXCEEDS · used + refunded = 500", FXB(joinP(p)));
  }

  // ════════ X ย้อน/คืนเงิน ════════
  {
    const p: string[] = [];
    await take("X1", "A", 107_000, { memberId: X || undefined });
    await take("X1w", "A", 20_000, walkIn("void walk"));
    if (!DP.X1 || !DP.X1w) p.push("ไม่มีมัดจำ X1");
    else {
      const r = await cs(saleIn(key("x1"), [["ของ X1", 150_000]], [depPay(107_000, "X1"), cash(43_000)], memberOf(X)));
      if (!ok(r)) p.push(`createSale → ${codeOf(r)} ${short(r?.message ?? "", 80)}`);
      else {
        await drain();
        const v = await voidBill(r.saleId);
        if (v?.ok === false) p.push(`void → ${codeOf(v)}`);
        await drain();
        const ap = (await dtxOf("X1", "APPLY"))[0];
        const rs1 = await dtxOf("X1", "RESTORE");
        const jv1 = await jvOf("PosSale", [r.saleId]);
        p.push(...(await replay("pos.sale.voided", (x) => x.saleId === r.saleId)));
        await drain();
        const rs2 = await dtxOf("X1", "RESTORE");
        const jv2 = await jvOf("PosSale", [r.saleId]);
        const d = await dep("X1");
        if (!ap || rs1.length !== 1 || rs2.length !== 1 || rs2[0].idempotencyKey !== `dep-restore-${ap.id}` || rs2[0].satang !== 107_000 || rs2[0].refTxnId !== ap.id) p.push(`RESTORE ${rs1.length}→${rs2.length} ${short(rs2.map((t) => ({ key: t.idempotencyKey === `dep-restore-${ap?.id}`, s: t.satang })))}`);
        if (d?.status !== "OPEN" || d?.usedSatang !== 0) p.push(`มัดจำ ${d?.status}/${d?.usedSatang}`);
        const has = (c: string) => jv1.some((e: Any) => (e.lines ?? []).some((l: Any) => l.account?.code === c));
        if (jv1.length !== 2 || jv2.length !== 2 || Object.keys(netByCode(jv2)).length || !has("2110") || !has("2200")) p.push(`JV ${jv1.length}→${jv2.length} net ${short(netByCode(jv2))}`);
      }
      const w = await cs(saleIn(key("x1w"), [["ของ X1 walk", 20_000]], [depPay(20_000, "X1w")]));
      if (!ok(w)) p.push(`walk-in → ${codeOf(w)}`);
      else {
        await drain();
        await voidBill(w.saleId);
        await drain();
        const d = await dep("X1w");
        if (d?.status !== "OPEN" || d?.usedSatang !== 0) p.push(`walk-in มัดจำ ${d?.status}/${d?.usedSatang}`);
      }
    }
    chk("X1", p.length === 0, "RESTORE 1 คีย์ dep-restore · OPEN · JV สุทธิ 0 · ซ้ำไม่เพิ่ม · walk-in", FXB(joinP(p)));
  }
  const x8: { before: Any; after: Any; server: Any } = { before: null, after: null, server: null };
  {
    const p: string[] = [];
    await take("X2", "A", 100_000, walkIn("คืนบางส่วน"));
    if (!DP.X2 || !GC.G2) p.push("ไม่มีมัดจำ/บัตร X2");
    else {
      const r = await cs(saleIn(key("x2"), [["ของ X2 ใหญ่", 200_000], ["ของ X2 เล็ก", 100_000]], [depPay(100_000, "X2"), gcPay(100_000, "G2"), cash(100_000)]));
      if (!ok(r)) p.push(`createSale → ${codeOf(r)} ${short(r?.message ?? "", 80)}`);
      else {
        await drain();
        const lBig = await lineId(r.saleId, "ของ X2 ใหญ่");
        const lSmall = await lineId(r.saleId, "ของ X2 เล็ก");
        x8.before = await call(refundTendersMod, "refundTenderOptions", ctxOf("A"), owner, { saleId: r.saleId });
        const f1 = await refund(r.saleId, [{ lineId: lBig, qty: 1 }], [cash(200_000)]);
        if (f1?.ok !== true) p.push(`คืนเงินสด 2000 (≤ เงินสด + มัดจำ) → ${codeOf(f1)} ${short(f1?.message ?? "", 80)}`);
        x8.after = await call(refundTendersMod, "refundTenderOptions", ctxOf("A"), owner, { saleId: r.saleId });
        const f2 = await refund(r.saleId, [{ lineId: lSmall, qty: 1 }], [cash(100_000)]);
        if (!refused(f2, "REFUND_METHOD_INVALID")) p.push(`เกินเพดาน → ${codeOf(f2)}`);
        x8.server = { first: f1?.ok === true, second: codeOf(f2) };
        const f3 = await refund(r.saleId, [{ lineId: lSmall, qty: 1 }], [{ type: "DEPOSIT", amountSatang: 100_000 }]);
        if (!refused(f3, "REFUND_METHOD_INVALID")) p.push(`DEPOSIT เป็นวิธีคืน → ${codeOf(f3)}`);
        const f4 = await refund(r.saleId, [{ lineId: lSmall, qty: 1 }], [{ type: "GIFT_CARD", amountSatang: 100_000 }]);
        if (f4?.ok !== true) p.push(`ส่วนบัตรเข้าบัตร → ${codeOf(f4)} ${short(f4?.message ?? "", 60)}`);
        await drain();
        const d = await dep("X2");
        if (d?.usedSatang !== 100_000 || d?.refundedSatang !== 0 || d?.status !== "USED" || (await dtxOf("X2")).some((t) => t.type === "RESTORE" || t.type === "REFUND")) p.push(`มัดจำขยับ ${d?.usedSatang}/${d?.refundedSatang}/${d?.status}`);
      }
    }
    chk("X2", p.length === 0, "เงินสด ≤ เงินสด+มัดจำ ok · เกิน/DEPOSIT → REFUND_METHOD_INVALID · บัตร ok · มัดจำไม่ขยับ", FXB(joinP(p)));
  }
  // มติ 13: เพดานของจอ (refundTenderOptions) = เพดานของ server (refundSale) — ตัวช่วยเดียว ◂
  {
    const p: string[] = [];
    const files = walk(POS_DIR).filter((f) => exportsFn(stripComments(rd(f)), "refundTenderCaps"));
    if (files.length !== 1) p.push(`export refundTenderCaps ${files.length} ไฟล์ ${files.map((f) => f.replace(`${POS_DIR}/`, "")).join(",")}`);
    else if (/from\s+["'](\.\/db|@\/lib\/core\/db|@prisma\/client)["']/.test(stripComments(rd(files[0]!)))) p.push(`${files[0]!.replace(`${POS_DIR}/`, "")} ไม่ pure (import db/prisma)`);
    for (const f of [`${POS_DIR}/refund.ts`, `${POS_DIR}/refund-tenders.ts`]) if (!/\brefundTenderCaps\s*\(/.test(stripComments(rd(f)))) p.push(`${f.replace(`${POS_DIR}/`, "")} ไม่เรียก refundTenderCaps`);
    const b = x8.before;
    const a = x8.after;
    if (!b) p.push("ไม่มีบิล X2");
    else {
      const card = (o: Any) => (Array.isArray(o?.cards) ? o.cards.find((c: Any) => c?.giftCardId === GC.G2?.id) : null);
      if (b?.ok !== true || b.cashLikeCapSatang !== 200_000 || card(b)?.capSatang !== 100_000) p.push(`จอก่อนคืน ${codeOf(b)} cap ${b?.cashLikeCapSatang} (คาด 200000) บัตร ${card(b)?.capSatang}`);
      if (!x8.server?.first) p.push("server ไม่รับเงินสด 2000 ที่จอบอกว่าได้");
      if (a?.ok !== true || a.cashLikeCapSatang !== 0) p.push(`จอหลังคืน ${codeOf(a)} cap ${a?.cashLikeCapSatang} (คาด 0)`);
      if (x8.server?.second !== "REFUND_METHOD_INVALID") p.push(`server หลังคืน → ${x8.server?.second} (จอ cap 0)`);
    }
    chk("X8", p.length === 0, "ตัวช่วยเดียว pure · จอ = server (2000 → 0) · บัตร 1000", FXB(joinP(p)));
  }
  const refundDeposit = (l: string, actor: Any, extra: Any = {}) =>
    call(depMod, "registerRefundDeposit", ctxU("A"), actor, { depositId: DP[l]?.id ?? `qc-missing-${l}`, payMethods: [cash(Number(extra.amount ?? 0))], reason: "ลูกค้ายกเลิกการจอง", idempotencyKey: extra.key ?? key(`rd-${l}`), ...extra.input });
  {
    const p: string[] = [];
    await take("X3", "A", 107_000, walkIn("คืนมัดจำ"));
    if (!DP.X3) p.push("ไม่มีมัดจำ X3");
    else {
      const k = key("x3");
      const r = await refundDeposit("X3", manager, { amount: 107_000, key: k });
      if (r?.ok !== true) p.push(`registerRefundDeposit → ${codeOf(r)} ${short(r?.message ?? "", 80)}`);
      else {
        await drain();
        const docs = await refundDocs(DP.X3.receiptSaleId);
        const rf = docs[0];
        if (docs.length !== 1 || rf?.docType !== "REFUND" || rf?.grandTotalSatang !== 107_000 || !String(rf?.receiptNo ?? "").startsWith("CN")) p.push(`ใบคืน ${docs.length} ${short(rf ? { t: rf.docType, g: rf.grandTotalSatang, no: rf.receiptNo } : null)}`);
        const d = await dep("X3");
        if (d?.status !== "REFUNDED" || d?.refundedSatang !== 107_000 || d?.usedSatang !== 0) p.push(`มัดจำ ${d?.status}/${d?.refundedSatang}`);
        const rt = await dtxOf("X3", "REFUND");
        if (rt.length !== 1 || rt[0].satang !== 107_000 || rt[0].vatSatang !== 7_000) p.push(`REFUND txn ${short(rt.map((t) => `${t.satang}/${t.vatSatang}`))}`);
        const want = { "2110": 100_000, "2200": 7_000, "1000": -107_000 };
        const jv = rf ? await jvOf("PosSale", [rf.id]) : [];
        if (jv.length !== 1 || !balanced(jv) || !sameNet(netByCode(jv), want)) p.push(`JV ${jv.length} ${short(netByCode(jv))} (คาด ${short(want)})`);
        const cn = rf ? await P.accountDocument.findFirst({ where: { tenantId: T, refType: "PosSale", refId: rf.id } }).catch(() => null) : null;
        if (!cn || cn.docType !== "CREDIT_NOTE" || cn.grandTotal !== 107_000) p.push(`ใบลดหนี้ ${cn ? `${cn.docType} ${cn.grandTotal}` : "ไม่มี"}`);
        const again = await refundDeposit("X3", manager, { amount: 107_000, key: k });
        if (again?.ok !== true) p.push(`ซ้ำคีย์เดิม → ${codeOf(again)}`);
        if (rf) p.push(...(await replay("pos.sale.refunded", (x) => [x.refundId, x.saleId, x.refundSaleId].includes(rf.id))).filter((e) => !e.startsWith("ไม่พบ")));
        await drain();
        if ((await refundDocs(DP.X3.receiptSaleId)).length !== 1 || (rf && (await jvOf("PosSale", [rf.id])).length !== 1) || (await dtxOf("X3", "REFUND")).length !== 1) p.push("เล่นซ้ำแล้วเพิ่ม");
      }
    }
    chk("X3", p.length === 0, "ใบคืน CN 1070 · REFUNDED · vat 70 · Dr 2110 1000 + Dr 2200 70 / Cr 1000 1070 · ใบลดหนี้ · ซ้ำไม่เพิ่ม", FXB(joinP(p)));
  }
  let x4Sale = "";
  {
    const p: string[] = [];
    await take("X4", "A", 107_000, walkIn("ใช้บางส่วนแล้วคืน"));
    if (!DP.X4) p.push("ไม่มีมัดจำ X4");
    else {
      const v1 = roundHalfUp(7_000 * 50_000, 107_000);
      const b = await cs(saleIn(key("x4"), [["ของ X4", 50_000]], [depPay(50_000, "X4")]));
      if (!ok(b)) p.push(`บิลใช้ 500 → ${codeOf(b)} ${short(b?.message ?? "", 60)}`);
      else {
        x4Sale = b.saleId;
        await drain();
        const r = await refundDeposit("X4", owner, { amount: 57_000 });
        if (r?.ok !== true) p.push(`คืนคงเหลือ 570 → ${codeOf(r)} ${short(r?.message ?? "", 80)}`);
        else {
          await drain();
          const d = await dep("X4");
          if (d?.usedSatang !== 50_000 || d?.refundedSatang !== 57_000 || d?.status !== "REFUNDED") p.push(`มัดจำ ${d?.usedSatang}/${d?.refundedSatang}/${d?.status}`);
          const rt = await dtxOf("X4", "REFUND");
          if (rt.length !== 1 || rt[0].satang !== 57_000 || rt[0].vatSatang !== 7_000 - v1) p.push(`REFUND txn ${short(rt.map((t) => `${t.satang}/${t.vatSatang}`))} (คาด 57000/${7_000 - v1})`);
          const rf = (await refundDocs(DP.X4.receiptSaleId))[0];
          const want = { "2110": 57_000 - (7_000 - v1), "2200": 7_000 - v1, "1000": -57_000 };
          const net = rf ? netByCode(await jvOf("PosSale", [rf.id])) : {};
          if (!sameNet(net, want)) p.push(`JV ${short(net)} (คาด ${short(want)})`);
        }
      }
    }
    chk("X4", p.length === 0, "REFUND 570 vat 3729 · used 500 เท่าเดิม · JV Dr 2110 53271 + Dr 2200 3729 / Cr 1000 57000", FXB(joinP(p)));
  }
  {
    const p: string[] = [];
    await take("X5", "A", 10_000, walkIn("ปฏิเสธคืน"));
    if (!DP.A2 || !DP.X5) p.push("ไม่มีมัดจำ A2/X5");
    else {
      const a = await refundDeposit("A2", owner, { amount: 1_000 });
      if (!refused(a, "DEPOSIT_CLOSED")) p.push(`ใช้หมดแล้ว → ${codeOf(a)}`);
      const b = await refundDeposit("X5", cashier, { amount: 10_000 });
      if (!refused(b, "PERMISSION_DENIED", "NO_PERMISSION")) p.push(`แคชเชียร์ → ${codeOf(b)}`);
      const c = await refundDeposit("X5", manager, { amount: 10_000, input: { reason: "" } });
      if (!refused(c, "REASON_REQUIRED", "VALIDATION")) p.push(`ไม่มีเหตุผล → ${codeOf(c)}`);
      const d = await call(depMod, "registerRefundDeposit", ctxU("A"), manager, { depositId: DP.X5.id, payMethods: [gcPay(10_000, "G1")], reason: "ลอง", idempotencyKey: key("x5g") });
      if (!refused(d, "VALIDATION")) p.push(`คืนเข้าบัตร → ${codeOf(d)}`);
      const e = await refundDeposit("X5", manager, { amount: 5_000 });
      if (!refused(e, "VALIDATION")) p.push(`ยอด ≠ คงเหลือ → ${codeOf(e)}`);
      const dx = await dep("X5");
      if ((await refundDocs(DP.X5.receiptSaleId)).length || dx?.status !== "OPEN" || dx?.refundedSatang !== 0) p.push(`มีใบคืน/มัดจำขยับ ${dx?.status}`);
    }
    chk("X5", p.length === 0, "CLOSED · PERMISSION_DENIED · REASON_REQUIRED · VALIDATION ×2 · ไม่มีใบคืน", FXB(joinP(p)));
  }
  {
    const p: string[] = [];
    if (!x4Sale || !DP.X4) p.push("ไม่มีบิล X4");
    else {
      const v = await voidBill(x4Sale);
      if (v?.ok === false) p.push(`void → ${codeOf(v)}`);
      await drain();
      const d = await dep("X4");
      const rs = await dtxOf("X4", "RESTORE");
      if (rs.length !== 1 || rs[0].satang !== 50_000 || d?.usedSatang !== 0 || d?.refundedSatang !== 57_000 || d?.status !== "OPEN") p.push(`RESTORE ${rs.length} · มัดจำ ${d?.usedSatang}/${d?.refundedSatang}/${d?.status}`);
      if (Number(d?.usedSatang) < 0 || Number(d?.usedSatang) + Number(d?.refundedSatang) > Number(d?.amountSatang)) p.push("ติดลบ/เกิน amount");
    }
    chk("X6", p.length === 0, "RESTORE 500 · used 0 refunded 570 · OPEN", FXB(joinP(p)));
  }
  {
    const p: string[] = [];
    if (!DP.X5) p.push("ไม่มีมัดจำ X5");
    else {
      const rid = DP.X5.receiptSaleId;
      const v = await voidBill(rid);
      await drain();
      const s = await saleRow(rid);
      const d = await dep("X5");
      const ev = await events("pos.sale.voided", (x) => x.saleId === rid);
      if (v?.ok !== false || s?.status !== "PAID" || d?.status !== "OPEN" || ev.length) p.push(`voidSale → ${codeOf(v)} · ใบ ${s?.status} · มัดจำ ${d?.status} · event ${ev.length}`);
    }
    chk("X7", p.length === 0, "voidSale ใบรับ → ปฏิเสธ · PAID · OPEN · ไม่มี event", FXB(joinP(p)));
  }

  // ════════ ORACLE-ADD ผู้คุม 15 ต.ค. (P2.9b fix 1 · มติรอบแก้ 1–6) ▸ A7 X9 A8 R6 P8 P9 ◂ ════════
  const allNet = async (ids: string[]) => netByCode(await jvOf("PosSale", ids));
  {
    // A7 — มัดจำเล็ก: ปล่อย VAT ต่อแถวไม่เกิน VAT ของยอดแถว · ที่เหลือออกกับแถวสุดท้าย/การคืน ⇒ 2110 สุทธิ 0
    const p: string[] = [];
    await take("A7a", "A", 100, walkIn("มัดจำเล็ก ก"));
    await take("A7b", "A", 100, walkIn("มัดจำเล็ก ข"));
    if (!DP.A7a || !DP.A7b) p.push("ไม่มีมัดจำ A7");
    else {
      const d0 = await dep("A7a");
      const b1 = await cs(saleIn(key("a7a1"), [["ของ A7 ก1", 50]], [depPay(50, "A7a")]));
      const b2 = ok(b1) ? await cs(saleIn(key("a7a2"), [["ของ A7 ก2", 50]], [depPay(50, "A7a")])) : null;
      if (!ok(b1) || !ok(b2)) p.push(`ใช้ 50+50 → ${codeOf(b1)} / ${codeOf(b2)}`);
      else {
        await drain();
        const ap = await dtxOf("A7a", "APPLY");
        const cap = split(50).vatSatang;
        const first = ap.find((t) => t.saleId === b1.saleId);
        if (ap.length !== 2 || sum(ap.map((t) => Number(t.vatSatang))) !== Number(d0?.vatSatang) || Number(first?.vatSatang) > cap) p.push(`APPLY ${short(ap.map((t) => `${t.satang}/${t.vatSatang}`))} (VAT มัดจำ ${d0?.vatSatang} · เพดานแถวแรก ${cap})`);
        const n = await allNet([DP.A7a.receiptSaleId, b1.saleId, b2.saleId]);
        if (n["2110"]) p.push(`2110 สุทธิ ${n["2110"]} (คาด 0) ${short(n)}`);
      }
      const db0 = await dep("A7b");
      const c1 = await cs(saleIn(key("a7b1"), [["ของ A7 ข1", 50]], [depPay(50, "A7b")]));
      if (!ok(c1)) p.push(`ใช้ 50 → ${codeOf(c1)}`);
      else {
        await drain();
        const rr = await call(depMod, "registerRefundDeposit", ctxU("A"), owner, { depositId: DP.A7b.id, payMethods: [cash(50)], reason: "คืนคงเหลือมัดจำเล็ก", idempotencyKey: key("a7rf") });
        if (rr?.ok !== true) p.push(`คืนคงเหลือ → ${codeOf(rr)} ${short(rr?.message ?? "", 60)}`);
        else {
          await drain();
          const ap = (await dtxOf("A7b", "APPLY"))[0];
          const rt = (await dtxOf("A7b", "REFUND"))[0];
          if (!ap || !rt || Number(ap.vatSatang) + Number(rt.vatSatang) !== Number(db0?.vatSatang)) p.push(`APPLY ${ap?.vatSatang} + REFUND ${rt?.vatSatang} ≠ VAT มัดจำ ${db0?.vatSatang}`);
          const n = await allNet([DP.A7b.receiptSaleId, c1.saleId, String(rr.refund?.id ?? "")]);
          if (n["2110"]) p.push(`2110 สุทธิ (ใบรับ+บิล+ใบคืน) ${n["2110"]} (คาด 0) ${short(n)}`);
        }
      }
    }
    chk("A7", p.length === 0, "2110 สุทธิ 0 · APPLY ≤ VAT ของแถว · คืนคงเหลือ = VAT ที่เหลือ", FXB(joinP(p)));
  }
  {
    // X9 — คืนเงินบิลที่ใช้มัดจำ: ฐาน VAT ของใบคืน = VAT ของบิล + VAT ของมัดจำที่ใช้ (= VAT เต็มบิล)
    const p: string[] = [];
    await take("X9a", "A", 107_000, walkIn("คืนบิลมัดจำล้วน"));
    await take("X9b", "A", 107_000, walkIn("คืนบิลผสม"));
    await take("X9c", "A", 107_000, walkIn("คืนสองครั้ง"));
    if (!DP.X9a || !DP.X9b || !DP.X9c) p.push("ไม่มีมัดจำ X9");
    else {
      const rdoc = async (saleId: string) => (await refundDocs(saleId)).map((d) => d.id);
      // (ก) จ่ายมัดจำล้วน คืนครบเป็นเงินสด
      const a = await cs(saleIn(key("x9a"), [["ของ X9 ก", 107_000]], [depPay(107_000, "X9a")]));
      if (!ok(a)) p.push(`บิลมัดจำล้วน → ${codeOf(a)}`);
      else {
        await drain();
        const f = await refund(a.saleId, [{ lineId: await lineId(a.saleId, "ของ X9 ก"), qty: 1 }], [cash(107_000)]);
        await drain();
        const docs = await refundDocs(a.saleId);
        if (f?.ok !== true || docs.length !== 1 || docs[0]?.vatSatang !== 7_000) p.push(`(ก) คืน ${codeOf(f)} · VAT ใบคืน ${docs[0]?.vatSatang} (คาด 7000)`);
        const n = await allNet([DP.X9a.receiptSaleId, a.saleId, ...(await rdoc(a.saleId))]);
        if (Object.keys(n).length) p.push(`(ก) สุทธิ ${short(n)} (คาด 0 ทุกบัญชี)`);
      }
      // (ข) บิลผสม ฿2,140 คืนครบครั้งเดียว
      const b = await cs(saleIn(key("x9b"), [["ของ X9 ข1", 100_000], ["ของ X9 ข2", 114_000]], [depPay(107_000, "X9b"), cash(107_000)]));
      if (!ok(b)) p.push(`บิลผสม → ${codeOf(b)}`);
      else {
        await drain();
        const f = await refund(b.saleId, [{ lineId: await lineId(b.saleId, "ของ X9 ข1"), qty: 1 }, { lineId: await lineId(b.saleId, "ของ X9 ข2"), qty: 1 }], [cash(214_000)]);
        await drain();
        const docs = await refundDocs(b.saleId);
        if (f?.ok !== true || docs.length !== 1 || docs[0]?.vatSatang !== 14_000) p.push(`(ข) คืน ${codeOf(f)} · VAT ใบคืน ${docs[0]?.vatSatang} (คาด 14000)`);
        const n = await allNet([DP.X9b.receiptSaleId, b.saleId, ...(await rdoc(b.saleId))]);
        if (Object.keys(n).length) p.push(`(ข) สุทธิ ${short(n)} (คาด 0)`);
      }
      // (ค) คืนสองครั้ง
      const c = await cs(saleIn(key("x9c"), [["ของ X9 ค1", 100_000], ["ของ X9 ค2", 114_000]], [depPay(107_000, "X9c"), cash(107_000)]));
      if (!ok(c)) p.push(`บิลคืนสองครั้ง → ${codeOf(c)}`);
      else {
        await drain();
        const f1 = await refund(c.saleId, [{ lineId: await lineId(c.saleId, "ของ X9 ค1"), qty: 1 }], [cash(100_000)]);
        const f2 = await refund(c.saleId, [{ lineId: await lineId(c.saleId, "ของ X9 ค2"), qty: 1 }], [cash(114_000)]);
        await drain();
        const docs = await refundDocs(c.saleId);
        const vs = sum(docs.map((d) => Number(d.vatSatang)));
        if (f1?.ok !== true || f2?.ok !== true || docs.length !== 2 || vs !== 14_000) p.push(`(ค) คืน ${codeOf(f1)}/${codeOf(f2)} · Σ VAT ${vs} (คาด 14000) ${short(docs.map((d) => d.vatSatang))}`);
        const n = await allNet([DP.X9c.receiptSaleId, c.saleId, ...docs.map((d) => d.id)]);
        if (Object.keys(n).length) p.push(`(ค) สุทธิ ${short(n)} (คาด 0)`);
      }
    }
    chk("X9", p.length === 0, "VAT ใบคืน 70 / 140 / Σ 140 · ใบรับ+บิล+ใบคืน สุทธิ 0", FXB(joinP(p)));
  }
  {
    // A8 — JV ใบรับต้องมีก่อนหัก VAT มัดจำ · สมุดเลิกจด VAT = หักตามที่บันทึกไว้
    const p: string[] = [];
    if (fx) p.push("fixture");
    else {
      const mk = async (k: string, vatBook: boolean) => {
        const unit = (await P.businessUnit.create({ data: { tenantId: T, type: "SHOP", name: `${TAG} สาขา${k}`, slug: `${T_SLUG}-${k.toLowerCase()}` } })).id;
        const pos = (await sysSvc.createSystem(T, "POS", `POS P2.9b ${k}`)).id;
        await sysSvc.linkUnit(T, pos, unit);
        const r = await call(paySet, "updatePosPaymentSettings", { tenantId: T, systemId: pos }, owner, { deposit: { enabled: true } });
        if (r?.ok !== true) p.push(`เปิดมัดจำ ${k}: ${codeOf(r)}`);
        const acc = (await sysSvc.createSystem(T, "ACCOUNT", `บัญชี QC P2.9b ${k}`)).id;
        await accSvc.saveSettings(T, acc, { orgName: `ร้านมัดจำคิวซี ${k}`, taxId: "0105561177639", vatRegistered: vatBook });
        await glMod.ensureAccounting({ tenantId: T, systemId: acc });
        return { unit, pos, acc };
      };
      const ctxK = (z: { unit: string; pos: string }): Any => ({ tenantId: T, systemId: z.pos, unitId: z.unit });
      const takeK = async (z: { unit: string; pos: string }, label: string) => {
        const r = await takeRaw("", owner, { amountSatang: 107_000, payMethods: [xfer(107_000)], idempotencyKey: key(`dep-${label}`), ...walkIn(label) }, ctxK(z));
        const id = depIdOf(r);
        const row = id ? await depRow(id) : null;
        if (row) DP[label] = { id, receiptSaleId: String(row.receiptSaleId), receiptNo: String(row.receiptNo ?? "") };
        else p.push(`มัดจำ ${label}: ${codeOf(r)} ${short(r?.message ?? "", 60)}`);
      };
      // (ก) รับตอนไม่ผูกสมุด → ผูก → ใช้เต็มบนบิล ฿1,070
      const g = await step("สาขา G", () => mk("G", true));
      if (g) {
        await takeK(g, "A8g");
        await drain();
        await P.accountSystemLink.create({ data: { tenantId: T, systemId: g.acc, linkedKind: "POS", linkedId: g.pos } });
        const b = DP.A8g ? await cs(saleIn(key("a8g"), [["ของ A8 G", 107_000]], [depPay(107_000, "A8g")], { unitId: g.unit, systemId: g.pos })) : null;
        if (!ok(b)) p.push(`(ก) บิล → ${codeOf(b)} ${short(b?.message ?? "", 60)}`);
        else {
          await drain();
          const jr = await jvOf("PosSale", [DP.A8g.receiptSaleId]);
          const jb = await jvOf("PosSale", [b.saleId]);
          const n = netByCode([...jr, ...jb]);
          if (jr.length !== 1 || jb.length !== 1 || n["2110"] || n["2200"] !== -7_000) p.push(`(ก) JV ใบรับ ${jr.length} บิล ${jb.length} · สุทธิ ${short(n)} (คาด 2110 0 · 2200 −7000)`);
        }
      }
      // (ข) รับตอนจด VAT → เลิกจด → ใช้เต็ม
      const h = await step("สาขา H", () => mk("H", true));
      if (h) {
        await P.accountSystemLink.create({ data: { tenantId: T, systemId: h.acc, linkedKind: "POS", linkedId: h.pos } });
        await takeK(h, "A8h");
        await drain();
        await accSvc.saveSettings(T, h.acc, { orgName: "ร้านมัดจำคิวซี H", taxId: "0105561177639", vatRegistered: false });
        const b = DP.A8h ? await cs(saleIn(key("a8h"), [["ของ A8 H", 107_000]], [depPay(107_000, "A8h")], { unitId: h.unit, systemId: h.pos })) : null;
        if (!ok(b)) p.push(`(ข) บิล → ${codeOf(b)} ${short(b?.message ?? "", 60)}`);
        else {
          await drain();
          const jr = await jvOf("PosSale", [DP.A8h.receiptSaleId]);
          const jb = await jvOf("PosSale", [b.saleId]);
          const n = netByCode([...jr, ...jb]);
          if (jr.length !== 1 || jb.length !== 1 || !balanced([...jr, ...jb]) || n["2110"] || n["2200"] !== -7_000) p.push(`(ข) JV ใบรับ ${jr.length} บิล ${jb.length} · สุทธิ ${short(n)} (คาด 2110 0 · 2200 −7000)`);
        }
      }
    }
    chk("A8", p.length === 0, "ใบรับลงก่อน · 2110 สุทธิ 0 · VAT 70 ครั้งเดียว · เลิกจด VAT = 2110 สุทธิ 0", FXB(joinP(p)));
  }
  {
    // R6 — X/Z + รายงานรายวัน ไม่นับใบรับมัดจำเป็นยอดขาย (เงินสดยังนับ)
    const p: string[] = [];
    if (fx || !SHIFT) p.push("ไม่มีกะ");
    else {
      const repMod = await tryImport("@/lib/modules/pos/reports");
      const today = await call(svc, "posBusinessToday", { tenantId: T, systemId: S.POS });
      const xr = async () => (await call(shiftMod, "xReport", ctxOf("A", DEV1), owner, { shiftId: SHIFT }))?.report;
      const dr = async () => (await call(repMod, "reportDailySales", { tenantId: T, systemId: S.POS, unitId: U.A }, owner, { from: today, to: today }))?.report?.totals;
      const x0 = await xr();
      const d0 = await dr();
      await take("R6", "A", 107_000, walkIn("รายงานกะ"));
      const b = DP.R6 ? await cs(saleIn(key("r6"), [["ของ R6", 214_000]], [depPay(107_000, "R6"), cash(107_000)], { shiftId: SHIFT })) : null;
      if (!ok(b)) p.push(`บิล → ${codeOf(b)} ${short(b?.message ?? "", 60)}`);
      else {
        await drain();
        const x1 = await xr();
        const d1 = await dr();
        const dx = (k: string) => Number(x1?.[k]) - Number(x0?.[k]);
        if (dx("salesTotalSatang") !== 214_000 || dx("billCount") !== 1 || dx("expectedCashSatang") !== 214_000) p.push(`X ยอดขาย +${dx("salesTotalSatang")} บิล +${dx("billCount")} เงินสด +${dx("expectedCashSatang")} (คาด 214000/1/214000)`);
        const dd = Number(d1?.netSalesSatang) - Number(d0?.netSalesSatang);
        const dbc = Number(d1?.billCount) - Number(d0?.billCount);
        if (dd !== 214_000 || dbc !== 1) p.push(`รายงานรายวัน +${dd} บิล +${dbc} (คาด 214000/1)`);
        // ORACLE-EDIT ผู้คุม 15 ต.ค. (P2.9b fix 2 มติ 4 · D3): ใบคืนเงินมัดจำไม่ใช่การคืนของยอดขายกะ (เงินสดยังนับ) ◂
        await take("R6r", "A", 10_000, walkIn("คืนในกะ"));
        const rr = DP.R6r ? await call(depMod, "registerRefundDeposit", ctxU("A"), owner, { depositId: DP.R6r.id, payMethods: [cash(10_000)], reason: "คืนในกะ", idempotencyKey: key("r6rf") }) : null;
        if (rr?.ok !== true) p.push(`คืนมัดจำในกะ → ${codeOf(rr)}`);
        else {
          await drain();
          const x2 = await xr();
          const dz = (k: string) => Number(x2?.[k]) - Number(x1?.[k]);
          if (dz("refundCount") !== 0 || dz("refundSatang") !== 0 || dz("salesTotalSatang") !== 0 || dz("expectedCashSatang") !== 0) p.push(`X หลังรับ+คืนมัดจำ: คืน +${dz("refundCount")}/${dz("refundSatang")} ยอดขาย +${dz("salesTotalSatang")} เงินสด +${dz("expectedCashSatang")} (คาด 0 ทั้งหมด)`);
        }
      }
    }
    chk("R6", p.length === 0, "X/Z + รายงานรายวัน +2,140 · เงินสด +2,140", FXB(joinP(p)));
  }
  {
    // P8 — มัดจำตามสมาชิกที่ถูกรวม (mergedIntoId)
    const p: string[] = [];
    const mm: Record<string, string> = {};
    if (!fx)
      for (const k of ["M", "K", "Z"]) {
        const r = await step(`สมาชิก ${k}`, () => memMod.createMember(ctxM, owner, { phone: `0897${rnd(6)}`, name: `${k} รวมมัดจำ ${RAND}`, source: "WALK_IN", homeUnitId: U.A }));
        if (r?.customerId) mm[k] = String(r.customerId);
      }
    if (!mm.M || !mm.K || !mm.Z) p.push("ไม่มีสมาชิก P8");
    else {
      await take("P8", "A", 10_000, { memberId: mm.M });
      const mg = await call(memMod, "mergeMembers", ctxM, owner, { keepId: mm.K, mergeId: mm.M, confirm: "MERGE" });
      if (mg?.ok === false) p.push(`รวมสมาชิก → ${codeOf(mg)} ${short(mg?.message ?? "", 60)}`);
      const kz = key("p8z");
      const rz = DP.P8 ? await cs(saleIn(kz, [["ของ P8 Z", 10_000]], [depPay(10_000, "P8")], memberOf(mm.Z))) : null;
      if (!refused(rz, "DEPOSIT_NOT_OWNER") || (await saleByKey(kz))) p.push(`Z → ${codeOf(rz)}`);
      const rk = DP.P8 ? await cs(saleIn(key("p8k"), [["ของ P8 K", 10_000]], [depPay(10_000, "P8")], memberOf(mm.K))) : null;
      if (!ok(rk)) p.push(`K (ผู้เก็บ) → ${codeOf(rk)} ${short(rk?.message ?? "", 60)}`);
      if (ok(rk) && (await dep("P8"))?.status !== "USED") p.push("มัดจำไม่ถูกตัด");
    }
    chk("P8", p.length === 0, "มัดจำของ M ใช้บนบิล K · Z → NOT_OWNER", FXB(joinP(p)));
  }
  {
    // P9 — มัดจำ walk-in ที่มีเบอร์ = ต้องมี 4 หลักท้าย · ค้นด้วยชื่อไม่เห็นยอด · ไม่มีเบอร์ = ผู้ถือใบรับ
    const p: string[] = [];
    await take("P9p", "A", 5_000, walkIn("มีเบอร์ทดสอบ"));
    await take("P9n", "A", 5_000, { customerName: `ไม่มีเบอร์ ${RAND}` });
    if (!DP.P9p || !DP.P9n || !DP.P9p.phone) p.push("ไม่มีมัดจำ P9");
    else {
      const cart = { lines: [{ name: `ของ P9 ${RAND}`, qty: 1, unitPriceSatang: 5_000 }] };
      const base = { type: "DEPOSIT", amountSatang: 5_000, depositId: DP.P9p.id };
      const last4 = DP.P9p.phone.slice(-4);
      const wrong = String((Number(last4) + 1) % 10_000).padStart(4, "0");
      const a = await regSubmit(cart, key("p9a"), [base]);
      if (!refused(a, "DEPOSIT_NOT_OWNER")) p.push(`ไม่ส่ง 4 หลัก → ${codeOf(a)}`);
      const b = await regSubmit(cart, key("p9b"), [{ ...base, phoneLast4: wrong }]);
      if (!refused(b, "DEPOSIT_NOT_OWNER")) p.push(`4 หลักผิด → ${codeOf(b)}`);
      if ((await dep("P9p"))?.usedSatang !== 0) p.push("มัดจำถูกตัดทั้งที่ปฏิเสธ");
      const look = (input: Any) => call(depMod, "registerDepositLookup", ctxOf("A"), owner, input);
      const rowsOf = (r: Any): Any[] => (Array.isArray(r?.deposits) ? r.deposits : []);
      const s2 = await look({ query: "มี" });
      if (!refused(s2, "VALIDATION")) p.push(`ค้นชื่อ 1–2 ตัว → ${codeOf(s2)}`);
      const s3 = await look({ query: `มีเบอร์ทดสอบ ${RAND}` });
      const r3 = rowsOf(s3).find((x) => x?.id === DP.P9p!.id);
      if (s3?.ok !== true || !r3 || r3.remainingSatang !== null) p.push(`ค้นชื่อ → ${codeOf(s3)} ${short(r3 ?? rowsOf(s3).length, 100)} (คาด ไม่มียอด)`);
      const s4 = await look({ query: DP.P9p.receiptNo, phoneLast4: wrong });
      const r4 = rowsOf(s4).find((x) => x?.id === DP.P9p!.id);
      if (r4 && r4.remainingSatang !== null) p.push("เลขใบรับ + 4 หลักผิด เห็นยอด");
      const s5 = await look({ query: DP.P9p.receiptNo, phoneLast4: last4 });
      const r5 = rowsOf(s5).find((x) => x?.id === DP.P9p!.id);
      if (!r5 || r5.remainingSatang !== 5_000) p.push(`เลขใบรับ + 4 หลักถูก → ${short(r5 ?? rowsOf(s5).length, 100)}`);
      const c = await regSubmit(cart, key("p9c"), [{ ...base, phoneLast4: last4 }]);
      if (c?.ok !== true) p.push(`4 หลักถูก → ${codeOf(c)} ${short(c?.message ?? "", 60)}`);
      const d = await regSubmit(cart, key("p9d"), [{ type: "DEPOSIT", amountSatang: 5_000, depositId: DP.P9n.id }]);
      if (d?.ok !== true) p.push(`มัดจำไม่มีเบอร์ (ผู้ถือใบรับ) → ${codeOf(d)} ${short(d?.message ?? "", 60)}`);
    }
    chk("P9", p.length === 0, "4 หลักท้ายบังคับ · ค้นชื่อไม่เห็นยอด · ไม่มีเบอร์ = ผู้ถือใบรับ", FXB(joinP(p)));
  }

  // ════════ ORACLE-ADD ผู้คุม 15 ต.ค. (P2.9b fix 2 · มติรอบแก้ 1–3) ▸ P10 A9 P11 ◂ ════════
  {
    // P10 — ค้นด้วยสมาชิก: ยอดเห็นเฉพาะมัดจำของสมาชิกในบิล (+ ที่ถูกรวมเข้ามา) · มัดจำของคนอื่นที่ชื่อตรงคำค้น = ไม่มียอด
    const p: string[] = [];
    const mm: Record<string, string> = {};
    if (!fx)
      for (const k of ["A", "A2", "B"]) {
        const r = await step(`สมาชิก P10 ${k}`, () => memMod.createMember(ctxM, owner, { phone: `0898${rnd(6)}`, name: `ร่วมชื่อ${RAND} ${k}`, source: "WALK_IN", homeUnitId: U.A }));
        if (r?.customerId) mm[k] = String(r.customerId);
      }
    if (!mm.A || !mm.A2 || !mm.B) p.push("ไม่มีสมาชิก P10");
    else {
      await take("P10a", "A", 3_000, { memberId: mm.A });
      await take("P10a2", "A", 4_000, { memberId: mm.A2 });
      await take("P10b", "A", 5_000, { memberId: mm.B });
      const mg = await call(memMod, "mergeMembers", ctxM, owner, { keepId: mm.A, mergeId: mm.A2, confirm: "MERGE" });
      if (mg?.ok === false) p.push(`รวมสมาชิก → ${codeOf(mg)}`);
      const r = await call(depMod, "registerDepositLookup", ctxOf("A"), owner, { memberId: mm.A, query: `ร่วมชื่อ${RAND}` });
      const rows: Any[] = Array.isArray(r?.deposits) ? r.deposits : [];
      const row = (l: string) => rows.find((x) => x?.id === DP[l]?.id);
      if (r?.ok !== true) p.push(`ค้น → ${codeOf(r)}`);
      if (row("P10a")?.remainingSatang !== 3_000) p.push(`ของ A ${short(row("P10a") ?? null, 80)}`);
      if (row("P10a2")?.remainingSatang !== 4_000) p.push(`ของ A2 (รวมเข้า A) ${short(row("P10a2") ?? null, 80)}`);
      if (!row("P10b") || row("P10b").remainingSatang !== null || row("P10b").amountSatang !== null) p.push(`ของ B ${short(row("P10b") ?? "ไม่พบ", 80)} (คาด พบแต่ไม่มียอด)`);
    }
    chk("P10", p.length === 0, "ของ B ไม่มียอด · ของ A + A2 มียอด", FXB(joinP(p)));
  }
  {
    // A9 — VAT ที่ยังไม่ปล่อยต้องไม่เกินคงเหลือ (ชิ้นสุดท้ายเล็กกว่า VAT ค้าง · สมุดเลิกจด VAT)
    const p: string[] = [];
    if (fx) p.push("fixture");
    else {
      const unit = (await P.businessUnit.create({ data: { tenantId: T, type: "SHOP", name: `${TAG} สาขาI`, slug: `${T_SLUG}-i` } })).id;
      const pos = (await sysSvc.createSystem(T, "POS", "POS P2.9b I")).id;
      await sysSvc.linkUnit(T, pos, unit);
      await call(paySet, "updatePosPaymentSettings", { tenantId: T, systemId: pos }, owner, { deposit: { enabled: true } });
      const acc = (await sysSvc.createSystem(T, "ACCOUNT", "บัญชี QC P2.9b I")).id;
      await accSvc.saveSettings(T, acc, { orgName: "ร้านมัดจำคิวซี I", taxId: "0105561177639", vatRegistered: true });
      await glMod.ensureAccounting({ tenantId: T, systemId: acc });
      await P.accountSystemLink.create({ data: { tenantId: T, systemId: acc, linkedKind: "POS", linkedId: pos } });
      const ctxI: Any = { tenantId: T, systemId: pos, unitId: unit };
      for (const l of ["A9u", "A9r"]) {
        const r = await takeRaw("", owner, { amountSatang: 107_000, payMethods: [xfer(107_000)], idempotencyKey: key(`dep-${l}`), ...walkIn(l) }, ctxI);
        const id = depIdOf(r);
        const row = id ? await depRow(id) : null;
        if (row) DP[l] = { id, receiptSaleId: String(row.receiptSaleId), receiptNo: String(row.receiptNo ?? "") };
        else p.push(`มัดจำ ${l}: ${codeOf(r)}`);
      }
      await drain();
      await accSvc.saveSettings(T, acc, { orgName: "ร้านมัดจำคิวซี I", taxId: "0105561177639", vatRegistered: false });
      const inI = (k: string, name: string, amt: number, l: string) => cs(saleIn(k, [[name, amt]], [depPay(amt, l)], { unitId: unit, systemId: pos }));
      if (DP.A9u) {
        const b1 = await inI(key("a9u1"), "ของ A9 ก", 105_000, "A9u");
        const b2 = ok(b1) ? await inI(key("a9u2"), "ของ A9 ข", 2_000, "A9u") : null;
        if (!ok(b1) || !ok(b2)) p.push(`ใช้ 1,050 + 20 → ${codeOf(b1)} / ${codeOf(b2)} ${short(b1?.message ?? b2?.message ?? "", 60)}`);
        else {
          await drain();
          const ap = await dtxOf("A9u", "APPLY");
          const n = await allNet([DP.A9u.receiptSaleId, b1.saleId, b2.saleId]);
          if (sum(ap.map((t) => Number(t.vatSatang))) !== 7_000 || n["2110"]) p.push(`ใช้ครบ: Σ APPLY VAT ${sum(ap.map((t) => Number(t.vatSatang)))} (คาด 7000) · 2110 สุทธิ ${n["2110"] ?? 0} ${short(n)}`);
          // ORACLE-EDIT ผู้คุม 15 ต.ค. (P2.9b fix 3 มติ 1 · R3 F1): บิลสุดท้ายที่ทุกบรรทัดบัญชีเป็น 0 ต้องไม่ทำให้คิวค้าง — pos.sale.paid ของบิลในชุดนี้ DONE ทุกตัว + มีเอกสารขายของบิลสุดท้าย ◂
          const evs = await events("pos.sale.paid", (x) => [DP.A9u.receiptSaleId, b1.saleId, b2.saleId].includes(x.saleId));
          const notDone = evs.filter((e) => e.status !== "DONE").map((e) => `${String(e.payload?.saleId ?? "").slice(-4)}:${e.status}/${e.attempts ?? "?"}`);
          if (evs.length !== 3 || notDone.length) p.push(`pos.sale.paid ${evs.length} ตัว · ไม่ DONE ${notDone.join(",") || "-"}`);
          const doc2 = await P.accountDocument.findFirst({ where: { tenantId: T, refType: "PosSale", refId: b2.saleId } }).catch(() => null);
          if (!doc2) p.push("ไม่มีเอกสารขายของบิลสุดท้าย (฿20)");
        }
      }
      if (DP.A9r) {
        const b1 = await inI(key("a9r1"), "ของ A9 ค", 105_000, "A9r");
        if (!ok(b1)) p.push(`ใช้ 1,050 → ${codeOf(b1)}`);
        else {
          await drain();
          const rr = await call(depMod, "registerRefundDeposit", ctxI, owner, { depositId: DP.A9r.id, payMethods: [xfer(2_000)], reason: "คืนที่เหลือ", idempotencyKey: key("a9rf") });
          if (rr?.ok !== true) p.push(`คืน 20 → ${codeOf(rr)} ${short(rr?.message ?? "", 60)}`);
          else {
            await drain();
            const tx = [...(await dtxOf("A9r", "APPLY")), ...(await dtxOf("A9r", "REFUND"))];
            const n = await allNet([DP.A9r.receiptSaleId, b1.saleId, String(rr.refund?.id ?? "")]);
            if (sum(tx.map((t) => Number(t.vatSatang))) !== 7_000 || n["2110"]) p.push(`คืนที่เหลือ: Σ VAT ${sum(tx.map((t) => Number(t.vatSatang)))} (คาด 7000) · 2110 สุทธิ ${n["2110"] ?? 0} ${short(n)}`);
          }
        }
      }
    }
    chk("A9", p.length === 0, "2110 สุทธิ 0 · Σ VAT 70 (ใช้ครบ / คืนที่เหลือ)", FXB(joinP(p)));
  }
  {
    // P11 — ไม่มี 4 หลักท้ายในตัวอ่าน · ผิด 5 ครั้ง = ล็อก
    const p: string[] = [];
    await take("P11", "A", 6_000, walkIn("ล็อกเบอร์"));
    if (!DP.P11 || !DP.P11.phone) p.push("ไม่มีมัดจำ P11");
    else {
      const last4 = DP.P11.phone.slice(-4);
      const strings = (v: unknown, out: string[] = []): string[] => {
        if (typeof v === "string") out.push(v);
        else if (Array.isArray(v)) v.forEach((x) => strings(x, out));
        else if (v && typeof v === "object") Object.values(v).forEach((x) => strings(x, out));
        return out;
      };
      const leaks = (label: string, v: unknown) => {
        const j = JSON.stringify(v ?? {});
        if (j.includes("phoneLast4") || j.includes(DP.P11!.phone!) || strings(v).some((x) => /[xX•*]/.test(x) && x.replace(/\D/g, "").endsWith(last4) && x.replace(/\D/g, "").length >= 4)) p.push(`${label} มี 4 หลักท้าย/phoneLast4`);
      };
      const lk = await call(depMod, "registerDepositLookup", ctxOf("A"), owner, { query: `ล็อกเบอร์ ${RAND}` });
      leaks("ค้น", lk);
      const row = (Array.isArray(lk?.deposits) ? lk.deposits : []).find((x: Any) => x?.id === DP.P11!.id);
      if (!row || typeof row.phoneMasked !== "string" || !row.phoneMasked.startsWith(DP.P11.phone.slice(0, 3))) p.push(`เบอร์ปิด ${short(row?.phoneMasked ?? null)} (คาด ขึ้นต้น 3 ตัวแรก)`);
      const cart = { lines: [{ name: `ของ P11 ${RAND}`, qty: 1, unitPriceSatang: 6_000 }] };
      const wrong = String((Number(last4) + 1) % 10_000).padStart(4, "0");
      const codes: string[] = [];
      for (let i = 0; i < 5; i++) codes.push(codeOf(await regSubmit(cart, key("p11w"), [{ type: "DEPOSIT", amountSatang: 6_000, depositId: DP.P11.id, phoneLast4: wrong }])));
      if (codes.slice(0, 4).some((c) => c !== "DEPOSIT_NOT_OWNER") || !["DEPOSIT_LOCKED", "DEPOSIT_NOT_OWNER"].includes(codes[4]!)) p.push(`ผิด 1–5 → ${codes.join(",")}`);
      const six = await regSubmit(cart, key("p11c"), [{ type: "DEPOSIT", amountSatang: 6_000, depositId: DP.P11.id, phoneLast4: last4 }]);
      if (!refused(six, "DEPOSIT_LOCKED")) p.push(`ครั้งที่ 6 (ถูก) ระหว่างล็อก → ${codeOf(six)}`);
      const d = await dep("P11");
      if (d?.usedSatang !== 0 || d?.status !== "OPEN") p.push(`มัดจำขยับ ${d?.usedSatang}/${d?.status}`);
      // รายละเอียดบิล + ใบเสร็จ ของบิลที่ใช้มัดจำ walk-in ที่มีเบอร์ (P9p ใช้ไปแล้วด้วย 4 หลักถูก) + ใบรับมัดจำ
      const p9 = DP.P9p ? await P.posPayment.findFirst({ where: { tenantId: T, type: "DEPOSIT", refSaleId: DP.P9p.receiptSaleId } }).catch(() => null) : null;
      for (const sid of [p9?.saleId, DP.P11.receiptSaleId].filter(Boolean) as string[]) {
        leaks(`รายละเอียดบิล ${sid.slice(-4)}`, await call(billsMod, "billDetail", ctxOf("A"), owner, { saleId: sid, unitId: U.A }));
        leaks(`ใบเสร็จ ${sid.slice(-4)}`, await call(rcpMod, "receiptPayload", ctxOf("A"), owner, { saleId: sid }));
      }
      const db = await P.$queryRawUnsafe(`SELECT "phoneMasked" FROM "PosDeposit" WHERE id = $1`, DP.P11.id).catch(() => []) as Any[];
      if (String(db[0]?.phoneMasked ?? "").replace(/\D/g, "").endsWith(last4)) p.push("PosDeposit.phoneMasked มี 4 หลักท้าย");
    }
    chk("P11", p.length === 0, "ไม่มี 4 หลักท้ายในตัวอ่าน · ผิด 5 = DEPOSIT_LOCKED · ถูกระหว่างล็อก = ปฏิเสธ", FXB(joinP(p)));
  }

  {
    // ORACLE-ADD ผู้คุม 15 ต.ค. (P2.9b fix 3 มติ 2): P12 — 4 หลักท้ายเป็นความลับยืนยันตอนใช้เท่านั้น (ค้นด้วยเลข 4 หลักไม่พบ · ไม่แตะตัวนับ) ◂
    const p: string[] = [];
    await take("P12", "A", 4_000, walkIn("ไม่ค้นด้วยเบอร์"));
    if (!DP.P12 || !DP.P12.phone) p.push("ไม่มีมัดจำ P12");
    else {
      const last4 = DP.P12.phone.slice(-4);
      const ctr = async () => ((await q(`SELECT "phoneFailedCount" AS n, "phoneLockedUntil" AS l FROM "PosDeposit" WHERE id = $1`, DP.P12!.id))[0] ?? null) as Any;
      const c0 = await ctr();
      const r = await call(depMod, "registerDepositLookup", ctxOf("A"), owner, { query: last4 });
      const rows: Any[] = Array.isArray(r?.deposits) ? r.deposits : [];
      if (!(r?.ok === true || refused(r, "VALIDATION")) || rows.some((x) => x?.id === DP.P12!.id)) p.push(`ค้น "${last4}" → ${codeOf(r)} · พบมัดจำ P12 ${rows.some((x) => x?.id === DP.P12!.id)}`);
      const c1 = await ctr();
      if (!c0 || Number(c1?.n) !== Number(c0.n) || Number(c1?.n) !== 0 || c1?.l) p.push(`ตัวนับ ${c0?.n}→${c1?.n} ล็อก ${c1?.l ?? "-"}`);
      const cart = { lines: [{ name: `ของ P12 ${RAND}`, qty: 1, unitPriceSatang: 4_000 }] };
      const a = await regSubmit(cart, key("p12"), [{ type: "DEPOSIT", amountSatang: 4_000, depositId: DP.P12.id, phoneLast4: last4 }]);
      if (a?.ok !== true) p.push(`หน้าขาย 4 หลักถูก (ครั้งแรก) → ${codeOf(a)} ${short(a?.message ?? "", 60)}`);
    }
    chk("P12", p.length === 0, "ค้นด้วยเลข 4 หลักไม่พบจากเบอร์ · ตัวนับไม่ขยับ · 4 หลักถูกผ่านครั้งแรก", FXB(joinP(p)));
  }

  {
    // ORACLE-ADD ผู้คุม 15 ต.ค. (P2.9b fix 4 มติ 1 2 · R4 F2 / hunter N1 N2): A10 — บิลสุดท้ายที่ไม่มี JV ขาย (zero entry) บนช่องทางที่มีค่าคอมฯ ⇒ ค่าคอมฯ ลงครั้งเดียว + คืนแล้วกลับค่าคอมฯ ·
    //   X10 — คืนบิล ฿20 (zero entry) หลังเลิกจด VAT ⇒ Dr 2200 2000 / Cr เงิน 2000 · รายได้ 100000 · 2200 เหลือ 5000 (= ทางคืนเงินมัดจำที่เหลือ) · ใบลดหนี้ VAT ฿20 ◂
    const pa: string[] = [];
    const px: string[] = [];
    const jvKey = async (k: string): Promise<Any[]> =>
      (await P.accountJournalEntry.findMany({ where: { tenantId: T, idempotencyKey: k }, include: { lines: { include: { account: { select: { code: true } } } } } }).catch(() => [])) as Any[];
    const notDone = (evs: Any[]) => evs.filter((e) => e.status !== "DONE").map((e) => `${e.status}/${e.attempts ?? "?"}`);
    /** สาขาใหม่ + POS + สมุดจด VAT · มัดจำ ฿1,070 (VAT 70) โอน → ลงใบรับ → สมุดเลิกจด VAT → ใช้ ฿1,050 แล้ว ฿20 (บิลสุดท้าย = ทุกบรรทัดบัญชี 0) */
    const deregLast = async (k: string, p: string[], channel: boolean) => {
      const unit = (await P.businessUnit.create({ data: { tenantId: T, type: "SHOP", name: `${TAG} สาขา${k}`, slug: `${T_SLUG}-${k.toLowerCase()}` } })).id;
      const pos = (await sysSvc.createSystem(T, "POS", `POS P2.9b ${k}`)).id;
      await sysSvc.linkUnit(T, pos, unit);
      await call(paySet, "updatePosPaymentSettings", { tenantId: T, systemId: pos }, owner, { deposit: { enabled: true } });
      const acc = (await sysSvc.createSystem(T, "ACCOUNT", `บัญชี QC P2.9b ${k}`)).id;
      await accSvc.saveSettings(T, acc, { orgName: `ร้านมัดจำคิวซี ${k}`, taxId: "0105561177639", vatRegistered: true });
      await glMod.ensureAccounting({ tenantId: T, systemId: acc });
      await P.accountSystemLink.create({ data: { tenantId: T, systemId: acc, linkedKind: "POS", linkedId: pos } });
      const ctxK: Any = { tenantId: T, systemId: pos, unitId: unit };
      let channelId = "";
      if (channel) {
        const ch = await call(chMod, "saveChannel", ctxK, owner, { code: "CUSTOM_AGENT", name: `ตัวแทน ${k} ${RAND}`, payout: "DIRECT", commissionBp: 1000 });
        if (ch?.ok !== true) p.push(`ช่องทาง ${k}: ${codeOf(ch)} ${short(ch?.message ?? "", 60)}`);
        else channelId = String(ch.channel?.id ?? "");
      }
      const l = `${k}dep`;
      const r = await takeRaw("", owner, { amountSatang: 107_000, payMethods: [xfer(107_000)], idempotencyKey: key(`dep-${l}`), ...walkIn(l) }, ctxK);
      const id = depIdOf(r);
      const row = id ? await depRow(id) : null;
      if (!row) {
        p.push(`มัดจำ ${k}: ${codeOf(r)} ${short(r?.message ?? "", 60)}`);
        return null;
      }
      DP[l] = { id, receiptSaleId: String(row.receiptSaleId), receiptNo: String(row.receiptNo ?? "") };
      await drain();
      await accSvc.saveSettings(T, acc, { orgName: `ร้านมัดจำคิวซี ${k}`, taxId: "0105561177639", vatRegistered: false });
      const extra: Any = { unitId: unit, systemId: pos, ...(channelId ? { channelId } : {}) };
      const b1 = await cs(saleIn(key(`${k}b1`), [[`ของ ${k} ก`, 105_000]], [depPay(105_000, l)], extra));
      const b2 = ok(b1) ? await cs(saleIn(key(`${k}b2`), [[`ของ ${k} ข`, 2_000]], [depPay(2_000, l)], extra)) : null;
      if (!ok(b1) || !ok(b2)) {
        p.push(`ใช้ 1,050 + 20 → ${codeOf(b1)} / ${codeOf(b2)} ${short(b1?.message ?? b2?.message ?? "", 60)}`);
        return null;
      }
      await drain();
      /** คืนบิล ฿20 ครบ (โอน) → ใบคืน */
      const refundB2 = async (): Promise<Any> => {
        const f = await call(refundMod, "refundSale", ctxK, owner, { saleId: b2.saleId, lines: [{ lineId: await lineId(b2.saleId, `ของ ${k} ข`), qty: 1 }], payMethods: [xfer(2_000)], reasonCode: "CHANGED_MIND", idempotencyKey: key(`${k}rf`) });
        await drain();
        const docs = await refundDocs(b2.saleId);
        if (f?.ok !== true || docs.length !== 1) {
          p.push(`คืน ฿20 → ${codeOf(f)} ${short(f?.message ?? "", 60)} · ใบคืน ${docs.length}`);
          return null;
        }
        const ev = await events("pos.sale.refunded", (x) => x.refundSaleId === docs[0].id);
        if (ev.length !== 1 || notDone(ev).length) p.push(`pos.sale.refunded ${ev.length} ตัว · ไม่ DONE ${notDone(ev).join(",") || "-"}`);
        return docs[0];
      };
      return { receipt: String(row.receiptSaleId), b1: String(b1.saleId), b2: String(b2.saleId), refundB2 };
    };
    if (fx) {
      pa.push("fixture");
      px.push("fixture");
    } else {
      // ── A10 ──
      const z = await step("สาขา J", () => deregLast("J", pa, true));
      if (!z && !pa.length) pa.push("ฟิกซ์เจอร์สาขา J ล้ม (ดูหมายเหตุ)");
      if (z) {
        const evs = await events("pos.sale.paid", (x) => [z.b1, z.b2].includes(x.saleId));
        if (evs.length !== 2 || notDone(evs).length) pa.push(`pos.sale.paid ${evs.length} ตัว · ไม่ DONE ${notDone(evs).join(",") || "-"}`);
        if ((await jvKey(`PosSale#${z.b2}#PAID`)).length !== 0) pa.push("บิล ฿20 มี JV ขาย (ฉากต้องเป็น zero entry)");
        const c1 = await jvKey(`PosSale#${z.b1}#COMMISSION`);
        if (c1.length !== 1 || !sameNet(netByCode(c1), { "6500": 10_500, "2100": -10_500 })) pa.push(`COMMISSION บิล ฿1,050 ${c1.length} รายการ ${short(netByCode(c1))} (คาด Dr 6500 10500 / Cr 2100)`);
        const com = () => jvKey(`PosSale#${z.b2}#COMMISSION`);
        const c2 = await com();
        if (c2.length !== 1 || !sameNet(netByCode(c2), { "6500": 200, "2100": -200 })) pa.push(`COMMISSION บิล ฿20 ${c2.length} รายการ ${short(netByCode(c2))} (คาด 1 · Dr 6500 200 / Cr 2100 200)`);
        // ORACLE-EDIT ผู้คุม 15 ต.ค. (HF-FU z1 · มติ 8): posSalePosted = JV PAID หรือ (เครื่องหมาย zero entry และมีเอกสารขาย) ⇒ บิล ฿20 = true ◂
        const accIdx = await tryImport("@/lib/modules/account");
        const b2Sys = String((await P.posSale.findUnique({ where: { id: z.b2 }, select: { systemId: true } }).catch(() => null))?.systemId ?? "");
        const posted2 = typeof accIdx?.posSalePosted === "function" ? await accIdx.posSalePosted({ tenantId: T, sourceSystemId: b2Sys, refId: z.b2 }).catch((e: unknown) => `throw ${(e as Error).message.slice(0, 60)}`) : "ไม่มี posSalePosted";
        if (posted2 !== true) pa.push(`posSalePosted(บิล ฿20 zero entry + เอกสาร) = ${short(posted2)} (คาด true · HF-FU มติ 8)`);
        pa.push(...(await replay("pos.sale.paid", (x) => x.saleId === z.b2)));
        await drain();
        if ((await com()).length !== 1) pa.push(`เล่น pos.sale.paid ซ้ำ → COMMISSION ${(await com()).length} (คาด 1)`);
        // ORACLE-EDIT ผู้คุม 15 ต.ค. (HF-FU z2 · มติ 8 · R5 F3 / hunter H3): เครื่องหมาย zero entry ของบิล ฿20 แถวเดียวหลังเล่นซ้ำ ◂
        const marks2 = Number(await P.auditLog.count({ where: { tenantId: T, action: "account.external.zeroEntry", targetType: "PosSale", targetId: z.b2 } }).catch(() => -1));
        if (marks2 !== 1) pa.push(`เครื่องหมาย account.external.zeroEntry ของบิล ฿20 = ${marks2} แถว (คาด 1)`);
        const rd = await z.refundB2();
        if (rd) {
          const rvKey = `PosSale#${rd.id}#COMMISSION_REFUNDED`;
          const rv = await jvKey(rvKey);
          if (rv.length !== 1 || !sameNet(netByCode(rv), { "2100": 200, "6500": -200 })) pa.push(`COMMISSION_REFUNDED ${rv.length} รายการ ${short(netByCode(rv))} (คาด 1 · Dr 2100 200 / Cr 6500 200)`);
          pa.push(...(await replay("pos.sale.refunded", (x) => x.refundSaleId === rd.id)));
          await drain();
          const after = [...(await com()), ...(await jvKey(rvKey))];
          const n = netByCode(after);
          if (after.length !== 2 || n["6500"] || n["2100"]) pa.push(`หลังเล่นซ้ำ ${after.length} รายการ · 6500/2100 สุทธิ ${short(n)} (คาด 2 · 0)`);
        }
      }
      // ── X10 ──
      const y = await step("สาขา K", () => deregLast("K", px, false));
      if (!y && !px.length) px.push("ฟิกซ์เจอร์สาขา K ล้ม (ดูหมายเหตุ)");
      if (y) {
        const rd = await y.refundB2();
        if (rd) {
          if (Number(rd.vatSatang) !== 2_000) px.push(`VAT ใบคืน ${rd.vatSatang} (คาด 2000)`);
          const jr = netByCode(await jvOf("PosSale", [rd.id]));
          if (!sameNet(jr, { "2200": 2_000, "1010": -2_000 })) px.push(`JV ใบคืน ${short(jr)} (คาด Dr 2200 2000 / Cr 1010 2000)`);
          const n = await allNet([y.receipt, y.b1, y.b2, rd.id]);
          const want = { "1010": 105_000, "4000": -100_000, "2200": -5_000 };
          if (!sameNet(n, want)) px.push(`รวมใบรับ+บิล+ใบคืน ${short(n)} (คาด ${short(want)})`);
          const cn = await P.accountDocument.findFirst({ where: { tenantId: T, docType: "CREDIT_NOTE", refType: "PosSale", refId: rd.id } }).catch(() => null);
          if (!cn || Number(cn.vatAmount) !== 2_000) px.push(`ใบลดหนี้ VAT ${cn ? cn.vatAmount : "ไม่มีใบ"} (คาด 2000)`);
        }
      }
    }
    chk("A10", pa.length === 0, "COMMISSION ฿20 ครั้งเดียว 200 · คืน → COMMISSION_REFUNDED ครั้งเดียว · สุทธิ 0", FXB(joinP(pa)));
    chk("X10", px.length === 0, "ใบคืน VAT 2000 · Dr 2200 / Cr 1010 2000 · รายได้ 100000 · 2200 5000 · ใบลดหนี้ VAT 2000", FXB(joinP(px)));
  }

  // ════════ L4 บิลไม่มีมัดจำ ════════
  {
    const p: string[] = [];
    if (!GC.G3 || fx) p.push("ไม่มีบัตร G3");
    else {
      const r = await cs(saleIn(key("l4"), [["ชุด L4", 62_500]], [cash(30_000), gcPay(32_500, "G3")]));
      const c = await cs(saleIn(key("l4c"), [["ของ L4 เงินสด", 10_000]], [cash(10_000)]));
      if (!ok(r) || !ok(c)) p.push(`บิล → ${codeOf(r)} / ${codeOf(c)}`);
      else {
        await drain();
        const v = split(62_500);
        const jv = await jvOf("PosSale", [r.saleId]);
        const want = { "1000": 30_000, "2110": 32_500, "4000": -v.baseSatang, "2200": -v.vatSatang };
        if (jv.length !== 1 || !balanced(jv) || !sameNet(netByCode(jv), want)) p.push(`JV บัตร ${short(netByCode(jv))} (คาด ${short(want)})`);
        if ((await saleRow(r.saleId))?.vatSatang !== v.vatSatang) p.push("vat บิลบัตร ≠ VAT(ยอด)");
        const vc = split(10_000);
        const jc = netByCode(await jvOf("PosSale", [c.saleId]));
        if ((await saleRow(c.saleId))?.vatSatang !== vc.vatSatang || !sameNet(jc, { "1000": 10_000, "4000": -vc.baseSatang, "2200": -vc.vatSatang })) p.push(`บิลเงินสด ${short(jc)}`);
        if (COL.txn && ((await saleTxns(r.saleId)).length || (await saleTxns(c.saleId)).length)) p.push("มี PosDepositTxn บนบิลไม่มีมัดจำ");
      }
    }
    chk("L4", p.length === 0, "JV/vat เดิมทุกสตางค์ · ไม่มี txn มัดจำ", FXB(joinP(p)));
  }
  if (notes.length) console.log(`  ℹ️  ฟิกซ์เจอร์มีหมายเหตุ ${notes.length}: ${notes.slice(0, 6).join(" | ")}`);
}

// ═════════════════════════ 6. คืนสภาพ ═════════════════════════
type WipeReport = { tables: number; left: Record<string, number>; tenantLeft: number; err: string };
async function wipeTenant(tid: string, slug: string): Promise<WipeReport> {
  const rep: WipeReport = { tables: 0, left: {}, tenantLeft: 0, err: "" };
  if (!tid) return rep;
  try {
    const t = (await P.$queryRawUnsafe(`SELECT slug FROM "Tenant" WHERE id = $1`, tid)) as Any[];
    if (t.length && t[0].slug !== slug) {
      rep.err = `slug ไม่ตรง (${t[0].slug}) — ไม่ลบ`;
      return rep;
    }
  } catch (e) {
    rep.err = `อ่าน Tenant ไม่ได้: ${(e as Error).message.slice(0, 60)}`;
    return rep;
  }
  const tables = ((await P.$queryRawUnsafe(
    `SELECT c.table_name AS t FROM information_schema.columns c JOIN information_schema.tables t ON t.table_name = c.table_name AND t.table_schema = c.table_schema
     WHERE c.table_schema = current_schema() AND c.column_name = 'tenantId' AND t.table_type = 'BASE TABLE' ORDER BY 1`,
  )) as Any[]).map((r: Any) => String(r.t));
  rep.tables = tables.length;
  await P.$executeRawUnsafe(`UPDATE "AccountJournalEntry" SET "reversalOfId" = NULL WHERE "tenantId" = $1`, tid).catch(() => {});
  await P.$executeRawUnsafe(`UPDATE "Customer" SET "mergedIntoId" = NULL, "referredById" = NULL WHERE "tenantId" = $1`, tid).catch(() => {});
  let pending = [...tables];
  for (let pass = 0; pass < 12 && pending.length; pass++) {
    const next: string[] = [];
    for (const tb of pending) {
      try {
        await P.$executeRawUnsafe(`DELETE FROM "${tb}" WHERE "tenantId" = $1`, tid);
      } catch {
        next.push(tb);
      }
    }
    pending = next;
  }
  try {
    await P.$executeRawUnsafe(`DELETE FROM "Tenant" WHERE id = $1 AND slug = $2`, tid, slug);
  } catch (e) {
    rep.err = `ลบ Tenant ไม่ได้: ${(e as Error).message.slice(0, 80)}`;
  }
  for (const tb of tables) {
    try {
      const n = Number(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "${tb}" WHERE "tenantId" = $1`, tid)) as Any[])[0]?.n ?? 0);
      if (n) rep.left[tb] = n;
    } catch {
      rep.left[tb] = -1;
    }
  }
  rep.tenantLeft = Number(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "Tenant" WHERE id = $1`, tid)) as Any[])[0]?.n ?? 0);
  return rep;
}

// ═════════════════════════ 7. รัน ═════════════════════════
let crashed = "";
const wipes: WipeReport[] = [];
try {
  runStatic();
  await runDb();
} catch (e) {
  crashed = (e as Error)?.stack?.split("\n").slice(0, 3).join(" | ") ?? String(e);
  console.log(`💥 harness: ${crashed}`);
} finally {
  installFetchGuard();
  try {
    await drain();
    await sleep(300);
    for (const [tid, slug] of [[T, T_SLUG], [T2, T2_SLUG]] as const) {
      const w = await wipeTenant(tid, slug);
      wipes.push(w);
      const residue = Object.values(w.left).reduce((a, b) => a + Math.abs(b), 0) + w.tenantLeft;
      console.log(`  ลบร้านชั่วคราว ${tid || "(ไม่ได้สร้าง)"}: ${w.tables} ตาราง · แถวค้าง ${residue} ${JSON.stringify(w.left)} · Tenant ${w.tenantLeft}${w.err ? ` · ${w.err}` : ""}`);
    }
  } catch (e) {
    wipes.push({ tables: 0, left: {}, tenantLeft: 0, err: `cleanup: ${(e as Error).message.slice(0, 200)}` });
    console.log(`💥 cleanup ${(e as Error).message.slice(0, 200)}`);
  } finally {
    removeFetchGuard();
  }
}
await sleep(200);
const tempLeft = wipes.flatMap((w) => Object.entries(w.left).map(([k, v]) => `${k}:${v}`));
const tenantLeft = sum(wipes.map((w) => w.tenantLeft));
const wipeErr = wipes.map((w) => w.err).filter(Boolean).join(" · ");
chk("Z1", tempLeft.length === 0 && tenantLeft === 0 && !wipeErr, "ร้านชั่วคราว 0 แถว · Tenant ถูกลบ", [tempLeft.length ? `เหลือ ${tempLeft.join(", ")}` : `0 แถว (${wipes[0]?.tables ?? 0} ตาราง)`, tenantLeft ? "Tenant ยังอยู่" : "", wipeErr].filter(Boolean).join(" · "));
const countsAfter = await snapshotCounts();
const drift = Object.keys(countsBefore).filter((k) => countsBefore[k] !== countsAfter[k]).map((k) => `${k}:${countsBefore[k]}→${countsAfter[k]}`);
if (drift.length) console.log(`  ℹ️  ร้าน QC seed นับก่อน/หลังต่างกัน (ข้อมูล · อาจเป็น lane อื่น): ${drift.join(", ")}`);
async function seedLeaks(): Promise<string[]> {
  const out: string[] = [];
  const n = async (lbl: string, f: () => Promise<unknown>) => {
    try {
      const v = Number(await f());
      if (v) out.push(`${lbl}:${v}`);
    } catch (e) {
      out.push(`${lbl}:err ${(e as Error).message.slice(0, 40)}`);
    }
  };
  const since = new Date(RUN_START - 60_000);
  const like = `%${RAND}%`;
  await n("posSale", () => P.posSale.count({ where: { tenantId: { in: TIDS }, idempotencyKey: { contains: RAND } } }));
  await n("posDevice", () => P.posDevice.count({ where: { tenantId: { in: TIDS }, deviceCode: { contains: `qc29b${RAND}` } } }));
  if (COL.dep) await n("posDeposit", async () => ((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "PosDeposit" WHERE "tenantId" = ANY($1::text[]) AND "idempotencyKey" LIKE $2`, TIDS, like)) as Any[])[0]?.n);
  if (COL.txn) await n("posDepositTxn", async () => ((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "PosDepositTxn" WHERE "tenantId" = ANY($1::text[]) AND "idempotencyKey" LIKE $2`, TIDS, like)) as Any[])[0]?.n);
  await n("outboxEvent", async () => ((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "OutboxEvent" WHERE "tenantId" = ANY($1::text[]) AND "createdAt" >= $2 AND "payload"::text LIKE $3`, TIDS, since, like)) as Any[])[0]?.n);
  await n("auditLog", async () => ((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "AuditLog" WHERE "tenantId" = ANY($1::text[]) AND "createdAt" >= $2 AND (coalesce("after"::text,'') || coalesce("before"::text,'')) LIKE $3`, TIDS, since, like)) as Any[])[0]?.n);
  return out;
}
const leaks = await seedLeaks();
chk("Z2", leaks.length === 0, "ร้าน seed ไม่มีแถวของรอบนี้", [leaks.length ? `มีแถว ${leaks.join(", ")}` : "ไม่มีแถวของรอบนี้", drift.length ? `(ข้อมูล) นับต่าง ${drift.length}` : "นับเท่าเดิม"].join(" · "));
for (const [id] of CHECKS) if (!results.has(id)) chk(id, false, "ถูกตรวจ", crashed ? `ไม่ถึง (harness ล้ม: ${crashed.slice(0, 80)})` : "ไม่ถึง");
const failed = [...results.entries()].filter(([, r]) => !r.ok).map(([id]) => id);
if (guardHits.length) console.log(`  ⚠️  ตัวกั้นเครือข่ายถูกเรียก ${guardHits.length} ครั้ง: ${[...new Set(guardHits)].join(", ")}`);
console.log(`\n===== ${SUITE} ===== ผ่าน ${results.size - failed.length}/${results.size}${FORCE ? " (QC_FORCE)" : ""}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ suite: SUITE, total: results.size, passed: results.size - failed.length, failed, skipped: false, forced: FORCE, missing: skipReasons, guardHits: guardHits.length, residue: tempLeft.length + tenantLeft, leaks, drift })}`);
await P.$disconnect?.().catch?.(() => {});
process.exit(failed.length ? 1 : 0);
