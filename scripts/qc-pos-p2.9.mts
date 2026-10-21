// QC — POS RUN ใบ P2.9 S: บัตรของขวัญ/เครดิตร้านเป็นวิธีชำระ (02 แถว 2) · ทิปลงบัญชีพักทิป (หนี้สิน) · ย้อนครบ X5 (void/คืนเงินกลับเข้าบัตร)
//   เขียนก่อนสร้าง (fail-before) · ผู้สร้าง (builder) P2.9 S
// requires: pos-seed
//
// สัญญา: ledger/pos-briefs/pos-brief-P2.9.md §0 · §2 R1–R13 · §3 · §4 · §6 · §7 · §10 มติผู้คุมงาน 1–13 (ผูกมัด):
//   มติ 1 VAT ตอนใช้บัตร (แถวชำระ Dr 2110 · บิลลงรายได้+VAT เต็มบิล · ใช้บัตรแบบชำระไม่ลง GIFTCARD_USED) · CD1b บัตรที่ขายตอนปิดสวิตช์ก็ Dr 2110 ·
//   มติ 2 ไม่มี VOUCHER ใน PosPayType · มติ 3 PIN สำหรับบัตรของขวัญ (เครดิตร้านไม่มี PIN — เจ้าของบิลต้องเป็นเจ้าของเครดิต) · มติ 4 ≤ 3 ใบ/บิล ไม่ซ้ำใบ ·
//   มติ 5 เครดิตร้าน = GiftCard kind STORE_CREDIT ของสมาชิก · มติ 6 มัดจำ → P2.9b (ไม่มีส่วน D) · มติ 7 ทิปลงหนี้สิน (บัญชีพักทิปต้องเป็น LIABILITY) ·
//   มติ 8 ช่องลงบิลห้อง: ซ่อนเมื่อสาขาไม่มีระบบโรงแรม · มติ 10 ย้อนบัตร/เครดิต = งานหลักของคิว POS (walk-in ได้ · ไม่ซ้ำกับสะพานสมาชิก) ·
//   มติ 12 ข้อสอบ 40–45 ข้อ · การแข่งพิสูจน์ด้วยธุรกรรมที่สามถือล็อก (แบบ HT2.8/2.9 ใน qc-hf-tx)
//
// ชื่อที่ข้อสอบนี้ตั้ง (ผู้สร้างต้องทำให้มีจริง — ดูโน้ต ledger/wo-notes/pos-P2.9.md):
//   createSale: payMethods[].giftCard? {number, pin} (เฉพาะแถว GIFT_CARD · เพิ่มล้วน F15.2) · แถว STORE_CREDIT = เครดิตของสมาชิกของบิล (ไม่มีฟิลด์เพิ่ม) ·
//     รหัสปฏิเสธใหม่ GIFT_CARD_NOT_FOUND GIFT_CARD_PIN GIFT_CARD_LOCKED GIFT_CARD_CHANGED STORE_CREDIT_NOT_OWNER (PosSaleError.code)
//   PosPayment.giftCardId / giftCardTxnId · GiftCard.kind (GIFT | STORE_CREDIT) · USE ของแถวชำระ refType "PosPayment" refId = PosPayment.id คีย์ pos-gct-<saleId>-<cardId>
//   src/lib/modules/pos/tender.ts: registerGiftCardLookup(ctx, actor, {number}) · registerPayTenders(ctx, actor) · tenderSaleVoided(evt) (งานหลักของ pos.sale.voided)
//   refundSale: วิธีคืน GIFT_CARD (กลับเข้าบัตรเดิม · คีย์ pos-refund-<refundId>-<cardId>) · STORE_CREDIT (ออก/เติมเครดิตของสมาชิก · คีย์ pos-credit-<refundId>)
//   payment-settings: เปิดทิปได้จริง (บัญชีพักทิป = LIABILITY ของสมุดที่ผูก) · สะพานบัญชีลง Cr บัญชีพักทิป (ไม่ตัดทิปออกจากขา Dr)
//
// ขอบเขต: ST สถิต · T ทิป · S เครดิตร้าน · G บัตรของขวัญเป็นวิธีชำระ · A บัญชี · C แข่ง · V ย้อนครบ (void/คืนเงิน) · R ตัวอ่าน/ช่องจอชำระ · L ของเดิม (PAR) · Z คืนสภาพ
//
// 🔴 กติกาข้อสอบ (แบบเดียวกับ qc-pos-p1.12/p2.8): SKIP เมื่อของ P2.9 ยังไม่มี (exit 0 + เหตุผล) · QC_FORCE=1 = ข้ามด่าน SKIP (แดงตามเหตุผล ไม่ crash · L เขียว)
//    --list = พิมพ์ทุก id ไม่แตะ DB · --no-db = ข้อสถิต ST1–ST4 + L1 L2 (ไม่โหลด prisma)
//    ฐาน = QC4 เท่านั้น · ร้านชั่วคราว `posqc-p29-<rand>` (+ `-t2` ถือบัตรร้านอื่น) ลบทั้งร้านใน finally · นับแถวค้างทุกตาราง = 0
//    ฟิกซ์เจอร์ผ่านฟังก์ชันของโมดูล — ยกเว้น: บัตรหมดอายุ (เลื่อน expiresAt) · บัตรร้านอื่น (แถว GiftCard ตรง) · SQL ดิบ = ถือล็อก/pg_stat_activity/ลบร้าน/คอลัมน์ใหม่
//    ไม่มีเครือข่าย: globalThis.fetch = ตัวกั้น (503 + นับ) ตลอดช่วง DB
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const SUITE = "qc-pos-p2.9";
const ROOT = process.cwd();
const LIST = process.argv.includes("--list");
const NODB = process.argv.includes("--no-db");
const FORCE = process.env.QC_FORCE === "1";
/** ฐานของใบ (session/pos 57dc226b · โค้ด 671e6fd2) — ข้อ L เทียบกับตัวนี้ */
const BASE_REV = "57dc226b";

// ═════════════════════════ ทะเบียนข้อสอบ ═════════════════════════
// X-group: S สถิต · X1 idempotency/เล่นซ้ำ/แข่ง · X2 ข้ามขอบเขต (404-not-403) · X3 สิทธิ์ · X4 เงิน · X5 ผลข้างเคียงครบ/ไม่เขียนอะไร · PAR = เขียวทั้งก่อนและหลัง · "-" เชิงหน้าที่
type Def = readonly [string, string, string];
const D = (id: string, x: string, title: string): Def => [`P2.9-${id}`, x, title] as const;
const CHECKS: readonly Def[] = [
  // ── ST สถิต ──
  D("ST1", "S", "[§3 มติ 5 6] migration 20261209100000_pos_p29_tenders: SET lock_timeout '3s' · PosPayType ADD VALUE IF NOT EXISTS GIFT_CARD + STORE_CREDIT · PosPayment ADD COLUMN IF NOT EXISTS giftCardId/giftCardTxnId TEXT (nullable) · GiftCardKind (GIFT, STORE_CREDIT) ใน DO-block · GiftCard.kind NOT NULL DEFAULT 'GIFT' · unique index (systemId, ownerCustomerId) WHERE kind = STORE_CREDIT · ไม่มี DROP/UPDATE/DELETE/PosDeposit/depositId · schema ตรง (ไม่มี VOUCHER)"),
  D("ST2", "S", "[R3 hard rule P1.12] modules/pos/** ไม่ import @/lib/modules/giftcard (static+dynamic) · pos/tender.ts export registerGiftCardLookup/registerPayTenders/tenderSaleVoided · member facade export useGiftCardTender/refundGiftCardTender/refundToGiftCard/issueStoreCredit/giftCardTenderLookup · pos.sale.voided เรียก tenderSaleVoided"),
  D("ST3", "S", "[R4 R6 มติ 1 9] account-bridge channelOf: GIFT_CARD + STORE_CREDIT → ช่องทางเงินรับล่วงหน้า (ไม่ตก TRANSFER) · applyExternalSale และ applyExternalRefund แปลงช่องทางนั้นเป็น DEPOSIT_RECEIVED (2110)"),
  // ORACLE-ADD ผู้คุม 14 ต.ค. (fix 1) ▸ 48 → 57: ST5 RC1 G9 G10 MG1 MG2 C5 T6 S5 ◂
  D("ST5", "S", "[fix1 F1 มติ 1] ลำดับล็อก สต็อก → ตัวนับ → บัตร: prepareSaleTenders ไม่ล็อกบัตร · createSale เรียก lockTenderCards หลัง posReceiptCounter.upsert"),
  D("ST4", "S", "[R11] RegisterRefusalCode + REFUSAL_KEY + pos.register.errors th/en ครบ GIFT_CARD_NOT_FOUND GIFT_CARD_PIN GIFT_CARD_LOCKED GIFT_CARD_CHANGED STORE_CREDIT_NOT_OWNER (en ไม่มีอักษรไทย · th มี)"),
  // ── T ทิป (มติ 7) ──
  D("T1", "X3", "[R9 มติ 7] เปิดทิปด้วยบัญชีที่ไม่ใช่หนี้สิน (ค่าใช้จ่าย 5990 ของสมุดที่ผูก) → TIP_ACCOUNT_REQUIRED (ข้อมูล) · ทิปยังปิด"),
  D("T2", "-", "[R9 มติ 7] บัญชีพักทิป 2190 (LIABILITY ของสมุดที่ผูก) → ok · posPaymentSettings.tip.enabled = true · ledgerAccountId ตรง"),
  D("T3", "X4", "[R9] บิล 6,500 + ทิป 500 เงินสด 7,000 → JV ขาย Dr 1000 7,000 · Cr 4000 6,075 · Cr 2200 425 · Cr 2190 500 · สมดุล · PosSale.tipSatang 500 grand 6,500"),
  D("T4", "X4", "[R9 P1.8] คืนเงินบิลทิปเต็มบรรทัด → ใบคืน 6,500 (tip 0) · CN ไม่แตะ 2190 · บิลเดิมยัง tip 500"),
  D("T5", "X5", "[R9] X ของกะก่อนคืน: expectedCash = float + 7,000 (ทิปเงินสดอยู่ในลิ้นชัก) · void บิลทิปอีกใบ → Σ ต่อรหัสบัญชี (ขาย+กลับ) = 0 รวม 2190"),
  // ── S เครดิตร้าน (มติ 5) ──
  D("T6", "X4", "[fix1 H5 มติ 6] บัญชีพักทิปถูกเก็บหลังเปิดทิป (2190 archivedAt) → createSale ทิป → VALIDATION ไม่มีบิล · pos.sale.paid DEAD 0 · archiveLedger(2190) / updateLedger type → ปฏิเสธ (บัญชีถูกใช้เป็นบัญชีพักทิปของ POS)"),
  D("S1", "X1", "[R7] คืนเงินบิลของสมาชิก X ด้วย STORE_CREDIT 600 → GiftCard kind STORE_CREDIT 1 ใบ เจ้าของ X ระบบสมาชิกของสาขา ยอด 600 · แถวคืน giftCardId · CN Cr 2110 600 · ยิงคืนซ้ำคีย์เดิม + เล่น pos.sale.refunded ×2 → ยัง 1 ใบ 600 · REFUND 1 แถว"),
  D("S2", "X4", "[R7] คืนครั้งที่สอง STORE_CREDIT 400 → ใบเดิม (ไม่เพิ่มใบ) ยอด 1,000 · บิล walk-in คืนเป็น STORE_CREDIT → REFUND_METHOD_INVALID ไม่มีใบคืน"),
  D("S3", "X2", "[R7 มติ 3] หน้าขาย: X จ่าย STORE_CREDIT 300 (ไม่มี PIN) → PAID · เครดิต 700 · USE refType PosPayment · JV Dr 2110 300 · สมาชิก Y / walk-in ใช้ STORE_CREDIT → STORE_CREDIT_NOT_OWNER ไม่มีบิล"),
  D("S4", "X5", "[R5 มติ 10] void บิลเครดิต → เครดิตกลับ 1,000 · REFUND 1 แถว (คีย์ giftcard-refund-<USE>) · เล่น pos.sale.voided ×2 + ระบาย → ไม่เพิ่ม"),
  // ── G บัตรของขวัญเป็นวิธีชำระ ──
  D("S5", "X2", "[fix1 F4 มติ 7] reload / suspend ด้วยเลขเครดิตร้าน (SC-…) → ไม่พบ · PosSale ของคีย์ 0 · ยอดเครดิตเท่าเดิม · giftcard.list ไม่มีเลข SC · KPI outstanding ไม่รวมเครดิตร้าน"),
  D("G1", "X2", "[R2 R12 CD11] registerGiftCardLookup: numberMasked GC-••••<4 ท้าย> · ยอด/สถานะ/usable · ไม่มี PIN · ไม่เขียนแถว (txn/ตัวนับ PIN เท่าเดิม) · สาขา B (ไม่มีระบบสมาชิก) ค้นได้ · ไม่พบ/ร้านอื่น/เลขเครดิตร้าน → GIFT_CARD_NOT_FOUND ข้อความเดียวกัน · ไม่มี pos.sale.create → PERMISSION_DENIED"),
  D("G2", "X4", "[R3] บิล 625 = เงินสด 300 + บัตร A 325 → PAID · บัตร A 175 · USE 1 แถว refType PosPayment refId = PosPayment.id คีย์ pos-gct-<saleId>-<cardId> · PosPayment.giftCardId/giftCardTxnId ตั้ง"),
  D("G3", "X4", "[R3 มติ 4] บิล 600 = บัตร B 100 + บัตร C 200 + เงินสด 300 → USE 2 แถว · บัตร B 0 DEPLETED · บัตร C 100 · Σ จ่าย = 600"),
  D("G4", "X3", "[R3 มติ 3] PIN ผิด → GIFT_CARD_PIN ไม่มีบิล · ตัวนับ PIN +1 (คงอยู่แม้ไม่มีบิล) · ผิดครั้งที่ 5 → GIFT_CARD_LOCKED · PIN ถูกระหว่างล็อก → GIFT_CARD_LOCKED"),
  D("G5", "X5", "[R3] ใช้เกินยอด (บัตร A 200 > 175) → GIFT_CARD_CHANGED · ไม่มีบิล · ยอด/txn เท่าเดิม"),
  D("G6", "X2", "[R3 มติ 4] บัตรเดียวสองแถว → VALIDATION · บัตรถูกระงับ / หมดอายุ → GIFT_CARD_CHANGED · บัตรร้านอื่น / เลขเครดิตร้าน → GIFT_CARD_NOT_FOUND · ไม่มีบิลทุกกรณี"),
  D("G7", "X5", "[R3] แถว GIFT_CARD บนบิลขายบัตร (sourceModule MEMBER) / พร้อม memberChoices.giftCard / 4 แถว / ไม่มี giftCard / giftCard บนแถวเงินสด → VALIDATION ไม่มีบิล"),
  D("G8", "X4", "[R3 มติ 7] ทิปบนบิลที่จ่ายด้วยบัตร/เครดิตล้วน (ทิป > ส่วนเงินสด/โอน/บัตรธนาคาร) → VALIDATION ไม่มีบิล"),
  D("G9", "X3", "[fix1 H2 มติ 3] 20 บิลพร้อมกัน PIN ผิด (คนละคีย์) บนบัตรใบเดียว → pinFailedCount = 5 · มี GIFT_CARD_LOCKED · ทุกคำตอบ PIN/LOCKED · 0 บิล · ยอดบัตรเท่าเดิม"),
  // ORACLE-ADD ผู้คุม 14 ต.ค. (fix 2) ▸ 57 → 60: G11 RC2 C5b · RC1 + กรณี STAFF + PIN ผู้จัดการ ◂
  D("G11", "X3", "[fix2 H2/N3 มติ 2] 50 บิลพร้อมกันบนบัตรนับ 0 (มี PIN ถูก 1 ใบ) → จองสิทธิ์ก่อนเทียบ: ตัวนับ ≤ 5 · คำตอบที่ไม่ใช่ LOCKED ≤ 5 (≤ 10 ถ้า PIN ถูกได้บิลแล้วล้างตัวนับ) · ที่เหลือ GIFT_CARD_LOCKED · บิล ≤ 1"),
  // ORACLE-ADD ผู้คุม 14 ต.ค. (fix 3) ▸ 60 → 62: G12 MG3 ◂
  D("G12", "X1", "[fix3 N4] คีย์เดียวกัน บัตรคนละใบ (หน้าขาย + createSale) → IDEMPOTENCY_CONFLICT · บัตรใบที่สองไม่ถูกแตะ (ยอด · ตัวนับ PIN · txn)"),
  D("G10", "X1", "[fix1 H6 มติ 8] หน้าขาย: ส่งซ้ำคีย์ที่บันทึกแล้วด้วยแถว GIFT_CARD ไม่มี PIN → บิลเดิม (duplicated) ตัดบัตรครั้งเดียว · คีย์ใหม่ไม่มี PIN → VALIDATION ไม่มีบิล"),
  // ── A บัญชี (มติ 1) ──
  D("A1", "X4", "[R4 มติ 1] JV ขายของบิล G2: Dr 1000 300 · Dr 2110 325 · Cr 4000 ฐาน + Cr 2200 VAT ของยอดเต็ม 625 (splitIncludedVat) · สมดุล · JV GIFTCARD_USED ของ USE แถวชำระ = 0"),
  D("A2", "PAR", "[ของเดิม P1.12 Z2] ทางส่วนลดเดิม memberChoices.giftCard → JV GIFTCARD_USED ของ USE นั้น 1 รายการ (Dr 2110 / Cr 4030)"),
  D("A3", "X4", "[CD1b] บัตรที่ขายตอนปิดสวิตช์ผูกบัญชี (ไม่มี accountingDocId) ใช้ชำระ 200 → JV ขาย Dr 2110 200"),
  D("A4", "X4", "[มติ 1] เอกสารขาย (ABB) ของบิล G2 grandTotal = 625 (ไม่ใช่ 625 − 325)"),
  // ORACLE-ADD ผู้คุม 14 ต.ค. (CD-P29-1 อนุมัติ · เงื่อนไข a b) → 48 ข้อ ◂
  D("APIN", "X2", "[CD-P29-1 (a)] PIN ไม่ถูกเก็บ/บันทึก/สะท้อน: บิลบัตรของขวัญทางหน้าขาย (submitRegisterSale) + บิล G2 → ค้นสตริง PIN (เป็นคำ) ใน AuditLog · OutboxEvent · PosPayment ของร้าน · คำตอบ submit · createSale · receiptPayload · billDetail · registerGiftCardLookup = 0 ที่"),
  // ── C แข่ง (ธุรกรรมที่สามถือล็อก) ──
  D("C1", "X1", "[R3] บัตร D 100 สองเครื่องพร้อมกัน (ทั้งคู่ถูกกั้น) → PAID 1 ใบ อีกใบ GIFT_CARD_CHANGED · บัตร 0 ไม่ติดลบ · USE 1"),
  D("C2", "X1", "[R3 R13] คีย์เดียวกัน ×10 พร้อมกัน (บัตร K 100 + เงินสด) → บิล 1 ใบ saleId เดียวกันทุกคำตอบ · USE ของบัตร 1 แถว"),
  D("C3", "X1", "[HF-GC H1] ใช้ชำระ ∥ เติมเงิน (A ถือล็อกแล้วเติม 50) → USE.balanceAfter = 100 + 50 − 30 = 120 · บัตร 120"),
  D("C4", "X1", "[HF-GC2] ใช้ชำระ ∥ expireDue → USE + EXPIRE = 100 · บัตร EXPIRED 0 · ผู้ใช้ชนะ ⇒ EXPIRE = ยอดหลังใช้ (60) · ผู้หมดอายุชนะ ⇒ GIFT_CARD_CHANGED ไม่มีบิล"),
  // ── V ย้อนครบ (X5 · มติ 10) ──
  D("V1", "X5", "[R5] void บิลสมาชิก X ที่จ่ายบัตร V 200 (DEPLETED) + เงินสด → REFUND 1 แถวต่อ USE · บัตร ACTIVE 200 · Σ JV ต่อรหัส (ขาย+กลับ) = 0 รวม 2110 · เล่น pos.sale.voided ×2 + ระบาย → ไม่เพิ่ม REFUND/JV"),
  D("V2", "X5", "[R5 มติ 10] void บิล walk-in ที่จ่ายบัตร W 150 → บัตรกลับ 150 ACTIVE (สะพานสมาชิกข้ามบิล walk-in)"),
  D("V3", "X1", "[R5] member.releaseOnVoid ของบิล V1 หลัง void → giftCardRefunded 0 · ยอดบัตรเท่าเดิม (ไม่คืนซ้ำ)"),
  // ORACLE-EDIT ผู้คุม 14 ต.ค. (fix 1 มติ 2 · H1): V4/V6/V7 ใช้สัดส่วนตามส่วนที่บัตรจ่าย (325/625) — 225 = บัตร 117 + เงินสด 108 · 400 = บัตร 208 + เงินสด 192 ◂
  D("V4", "X4", "[R6 · fix1 มติ 2] คืนบางส่วนตามสัดส่วน (บรรทัด 225 = บัตร 117 + เงินสด 108) → REFUND 117 คีย์ pos-refund-<refundId>-<cardId> · บัตร +117 · CN Cr 2110 117 + Cr 1000 108"),
  D("V5", "X5", "[R6] คืนเข้าบัตรเกินส่วนที่บัตรจ่าย (บรรทัด 400 ทั้งหมดเข้าบัตร > 208 ที่เหลือ) → REFUND_METHOD_INVALID · ไม่มีใบคืน · บัตรเท่าเดิม"),
  D("V6", "X1", "[R6 R5 · fix1 มติ 2] คืนส่วนที่เหลือ (400 = บัตร 208 + เงินสด 192) → บิล REFUNDED · คืนเข้าบัตรรวม = 325 (= ส่วนที่บัตรจ่ายพอดี) · เล่น pos.sale.refunded ×2 → บัตรไม่เพิ่ม"),
  D("V7", "X4", "[R6] บัตรถูกใช้ที่บิลอื่น 50 ระหว่างคืน → การคืนครั้งหลังยังเข้า: ยอด = ยอดปัจจุบัน + 208"),
  D("V8", "X5", "[R6] คืนเข้าบัตรที่ถูกระงับ / หมดอายุ → REFUND_METHOD_INVALID · ไม่มีใบคืน · ยอดบัตรเท่าเดิม"),
  D("V9", "X1", "[R6] คืนบรรทัดเดียวกันเข้าบัตรสองคำขอพร้อมกัน → ok 1 · อีกคำขอ REFUND_EXCEEDS · บัตร +100 ครั้งเดียว"),
  D("RC1", "X4", "[fix1 H1 มติ 2 · fix2 มติ 6] เพดานคืนเป็นเงิน: บิล walk-in จ่ายบัตร 100% → คืน CASH → REFUND_METHOD_INVALID · บิลสมาชิก บัตรถูกระงับ → CASH ปฏิเสธ · STORE_CREDIT ได้ · บิล walk-in บัตรถูกระงับ → CASH ต้องมีเหตุผล (REASON_REQUIRED) · มีเหตุผล → ok + audit cardShareToCash · STAFF (ไม่มีสิทธิ์คืน) + PIN ผู้จัดการ → ok · audit ผู้กระทำ = ผู้จัดการ + cardShareToCash"),
  D("RC2", "X4", "[fix2 N2 มติ 5] บิลเครดิตของ ME → รวม ME เข้า MF → คืนบางส่วน STORE_CREDIT → เครดิตของ MF (ผู้เก็บ) +100 · ไม่ปฏิเสธ"),
  D("MG1", "X4", "[fix1 H3 มติ 4] รวมสมาชิก (ทั้งคู่มีเครดิต 200 + 300) → ใบผู้เก็บ 500 · ใบผู้ถูกรวม 0 DEPLETED ไม่มีเจ้าของ · ADJUST MERGE 2 แถว · ยอดรวมเท่าเดิม · ผู้เก็บจ่ายเครดิต 500 ได้"),
  D("MG3", "X1", "[fix3 N5] ผู้เก็บถูกรวมต่อระหว่างที่ void รอล็อก (ถือล็อกใบผู้เก็บ K แล้วรวม K → W ใน tx เดียวกัน) → คืนเข้า W +300 · K 0 · REFUND บน W"),
  D("MG2", "X5", "[fix1 H3 มติ 4] ใช้เครดิต 300 → รวมสมาชิก → void บิล → เครดิตผู้เก็บ +300 · ใบที่ถูกรวม 0 · REFUND อยู่บนใบผู้เก็บ"),
  D("C5", "X4", "[fix1 H4 มติ 5] ใช้บัตร 40 → บัตรหมดอายุ (expireDue 60) → void บิล → บัตร EXPIRED ยอด 0 · REFUND 40 + EXPIRE 40 · JV ของ EXPIRE นั้น 1 รายการ · 2110 ของบัตร (ขาย+บิล+หมดอายุ) สุทธิ 0"),
  D("C5b", "X4", "[fix2 G1/N1 มติ 1] บัตรเลยวันหมดอายุแต่ยัง ACTIVE ยอด 200 → void บิล 100 → ACTIVE 300 ไม่มี EXPIRE · expireDue → EXPIRE 300 · 2110 ของบัตรสุทธิ 0"),
  // ── R ตัวอ่าน / ช่องจอชำระ ──
  D("R1", "-", "[R10] receiptPayload + billDetail: แถว GIFT_CARD มี card {kind GIFT, numberMasked GC-••••<4 ท้าย>, balanceAfterSatang 17,500} · แถว STORE_CREDIT มี card kind STORE_CREDIT · X ของกะมีแถว STORE_CREDIT"),
  D("R2", "-", "[มติ 6 8 13] registerPayTenders: สาขา A (SHOP) {giftCard.enabled, storeCredit.enabled, deposit {visible, enabled false}, roomCharge.visible false} · สาขา B storeCredit.enabled false (ไม่มีระบบสมาชิก) · สาขาโรงแรม (UnitType HOTEL) roomCharge {visible, enabled false}"),
  // ── L ของเดิม (PAR) ──
  D("L1", "PAR", "[§7 F15.2] scripts/pos-sale-contract.json เทียบฐาน 57dc226b = เพิ่มอย่างเดียว (ของเดิมทุกคีย์เท่าเดิม · ของใหม่มีแค่ payMethods[].giftCard*) · ทะเบียนผู้เรียกในไฟล์ไม่ลด"),
  D("L2", "PAR", "[§7 HF-TX] ผู้เรียก createSale( ใน src ต่อไฟล์ = ฐาน 57dc226b (มติ 6: ไม่มีจุดใหม่)"),
  D("L3", "PAR", "[CD2 P1.12 Z2] ทางเดิม memberChoices.giftCard: grand = 30,000 − 10,000 · giftCardTxnId · USE refType PosSale · แถวชำระ CASH อย่างเดียว · memberBenefits มี GIFTCARD 10,000"),
  // ── O ผู้เรียก createSale อื่นยังไม่รับบัตรของขวัญ (CD-P29-1 (b)) ──
  D("O1", "X5", "[CD-P29-1 (b)] ออเดอร์ CHAT (DIRECT) ACCEPTED → payOrder GIFT_CARD (ไม่มี/มี giftCard) → VALIDATION · ออเดอร์ยังไม่จ่าย (paymentState ≠ PAID · saleId null) · ไม่มีบิล · ยอดบัตรเท่าเดิม"),
  D("O2", "X5", "[CD-P29-1 (b)] API sales.create (SALES_OPS) payMethods GIFT_CARD (+giftCard) → schema ปฏิเสธ (VALIDATION · 422) ก่อนถึง createSale · ไม่มีบิล"),
  // ── Z คืนสภาพ ──
  D("Z1", "-", "QC4 คืนสภาพ: ร้านชั่วคราว (+ -t2) เหลือ 0 แถวทุกตารางที่มี tenantId + Tenant ถูกลบ"),
  D("Z2", "-", "ร้าน QC ของ seed ไม่มีแถวของรอบนี้ (บิล/บัตร/txn/outbox/audit ที่มีรหัสรอบ) — นับก่อน/หลังพิมพ์เป็นข้อมูล"),
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
  const full = id.startsWith("P2.9-") ? id : `P2.9-${id}`;
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
const refused = (r: Any, code: string) => r?.ok === false && String(r.code) === code;
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
const stripComments = (s: string) => s.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
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
  tender: `${POS_DIR}/tender.ts`,
  service: `${POS_DIR}/service.ts`,
  bridge: `${POS_DIR}/account-bridge.ts`,
  shared: `${POS_DIR}/register-shared.ts`,
  account: "src/lib/modules/account/index.ts",
  member: "src/lib/modules/member/index.ts",
  consumers: "src/lib/outbox-consumers.ts",
  msgTh: "src/messages/th/pos.json",
  msgEn: "src/messages/en/pos.json",
  contract: "scripts/pos-sale-contract.json",
  migration: "prisma/migrations/20261209100000_pos_p29_tenders/migration.sql",
};
const NEW_CODES = ["GIFT_CARD_NOT_FOUND", "GIFT_CARD_PIN", "GIFT_CARD_LOCKED", "GIFT_CARD_CHANGED", "STORE_CREDIT_NOT_OWNER"];
const TENDER_FNS = ["registerGiftCardLookup", "registerPayTenders", "tenderSaleVoided"];
const MEMBER_FNS = ["useGiftCardTender", "refundGiftCardTender", "refundToGiftCard", "issueStoreCredit", "giftCardTenderLookup"];
const srcOf = (f: string) => stripComments(rd(f));
const STATIC_IDS = ["ST1", "ST2", "ST3", "ST4", "ST5", "L1", "L2"].map((x) => `P2.9-${x}`);
const skipReasons: string[] = [];
if (!existsSync(join(ROOT, F.tender))) skipReasons.push(`${F.tender} ยังไม่มี`);
for (const n of TENDER_FNS) if (!exportsFn(srcOf(F.tender), n)) skipReasons.push(`ยังไม่มี export ${n} (pos/tender.ts)`);
if (!existsSync(join(ROOT, F.migration))) skipReasons.push("ยังไม่มี migration 20261209100000_pos_p29_tenders");

// ═════════════════════════ 1. ข้อสถิต ═════════════════════════
function runStatic(): void {
  console.log("\n── ST/L ข้อสถิต (ไม่แตะ DB) ──");
  const schemaSrc = walk("prisma/schema", [], /\.prisma$/).map((f) => stripPrismaComments(rd(f))).join("\n");
  // ST1
  {
    const p: string[] = [];
    const mig = rd(F.migration).replace(/--.*$/gm, "");
    if (!mig) p.push("ไม่มีไฟล์ migration");
    else {
      if (!/SET\s+lock_timeout\s*=\s*'3s'/i.test(mig)) p.push("ไม่มี SET lock_timeout = '3s'");
      for (const v of ["GIFT_CARD", "STORE_CREDIT"]) if (!new RegExp(`ALTER\\s+TYPE\\s+"PosPayType"\\s+ADD\\s+VALUE\\s+IF\\s+NOT\\s+EXISTS\\s+'${v}'`, "i").test(mig)) p.push(`ไม่มี ADD VALUE IF NOT EXISTS '${v}'`);
      for (const c of ["giftCardId", "giftCardTxnId"]) if (!new RegExp(`ADD\\s+COLUMN\\s+IF\\s+NOT\\s+EXISTS\\s+"${c}"\\s+TEXT\\s*[,;]`, "i").test(mig)) p.push(`PosPayment ไม่มี ADD COLUMN IF NOT EXISTS "${c}" TEXT (nullable)`);
      if (!/ALTER\s+TABLE\s+"PosPayment"/i.test(mig)) p.push('ไม่มี ALTER TABLE "PosPayment"');
      if (!/DO\s+\$\$[\s\S]*CREATE\s+TYPE\s+"GiftCardKind"\s+AS\s+ENUM\s*\(\s*'GIFT'\s*,\s*'STORE_CREDIT'\s*\)[\s\S]*\$\$/i.test(mig)) p.push("ไม่มี CREATE TYPE GiftCardKind ('GIFT','STORE_CREDIT') ใน DO-block");
      if (!/ALTER\s+TABLE\s+"GiftCard"\s+ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+"kind"\s+"GiftCardKind"\s+NOT\s+NULL\s+DEFAULT\s+'GIFT'/i.test(mig)) p.push("ไม่มี GiftCard.kind NOT NULL DEFAULT 'GIFT'");
      if (!/CREATE\s+UNIQUE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+"GiftCard_storeCredit_owner_key"\s+ON\s+"GiftCard"\s*\(\s*"systemId"\s*,\s*"ownerCustomerId"\s*\)\s+WHERE\s+"kind"\s*=\s*'STORE_CREDIT'/i.test(mig)) p.push("ไม่มี unique index (systemId, ownerCustomerId) WHERE kind = 'STORE_CREDIT'");
      for (const bad of [/\bDROP\b/i, /\bDELETE\b/i, /\bUPDATE\b/i, /\bRENAME\b/i, /PosDeposit/i, /depositId/i, /'VOUCHER'/i]) if (bad.test(mig)) p.push(`มีคำสั่งต้องห้าม ${bad.source}`);
      if (/ALTER\s+TABLE\s+"PosPayment"[^;]*NOT\s+NULL/i.test(mig)) p.push("คอลัมน์ PosPayment ใหม่ต้อง nullable");
    }
    const en = prismaBlock(schemaSrc, "enum", "PosPayType");
    for (const v of ["GIFT_CARD", "STORE_CREDIT"]) if (!new RegExp(`^\\s*${v}\\b`, "m").test(en)) p.push(`schema PosPayType ไม่มี ${v}`);
    if (/^\s*VOUCHER\b/m.test(en)) p.push("schema PosPayType มี VOUCHER (มติ 2)");
    const pp = prismaBlock(schemaSrc, "model", "PosPayment");
    for (const c of ["giftCardId", "giftCardTxnId"]) if (!new RegExp(`^${c}\\s+String\\?(\\s|$)`).test(fieldLine(pp, c))) p.push(`PosPayment.${c} ไม่ใช่ String?`);
    if (fieldLine(pp, "depositId")) p.push("PosPayment มี depositId (มติ 6 = P2.9b)");
    const kind = prismaBlock(schemaSrc, "enum", "GiftCardKind");
    if (!/^\s*GIFT\b/m.test(kind) || !/^\s*STORE_CREDIT\b/m.test(kind)) p.push("schema ไม่มี enum GiftCardKind {GIFT STORE_CREDIT}");
    if (!/^kind\s+GiftCardKind\s+@default\(GIFT\)/.test(fieldLine(prismaBlock(schemaSrc, "model", "GiftCard"), "kind"))) p.push("GiftCard.kind ไม่ใช่ GiftCardKind @default(GIFT)");
    // ORACLE-EDIT ผู้คุม 15 ต.ค. (P2.9b มติ 10): model PosDeposit มีแล้วตั้งแต่ P2.9b (migration 20261211100000_pos_p29b_deposits) — ไม่ห้ามอีก ·
    //   PosPayment.depositId ยังห้าม (CD2-A · บรรทัดบน) · migration ของ P2.9 ยังห้ามคำว่า PosDeposit (บน) ◂
    if (prismaBlock(schemaSrc, "model", "PosDeposit") && !existsSync(join(ROOT, "prisma/migrations/20261211100000_pos_p29b_deposits/migration.sql"))) p.push("มี model PosDeposit โดยไม่มี migration ของ P2.9b (มติ 6)");
    chk("ST1", p.length === 0, "migration + schema ตาม §3 (ไม่มีมัดจำ)", joinP(p));
  }
  // ST2
  {
    const p: string[] = [];
    for (const f of walk(POS_DIR)) {
      const s = stripComments(rd(f));
      if (/from\s+["']@\/lib\/modules\/giftcard(\/[^"']*)?["']|import\(\s*["']@\/lib\/modules\/giftcard/.test(s)) p.push(`${f.replace(`${POS_DIR}/`, "")} import giftcard`);
    }
    const t = srcOf(F.tender);
    for (const n of TENDER_FNS) if (!exportsFn(t, n)) p.push(`tender.ts ไม่มี ${n}`);
    const m = srcOf(F.member);
    for (const n of MEMBER_FNS) if (!new RegExp(`\\b${n}\\b`).test(m)) p.push(`member facade ไม่มี ${n}`);
    const cons = srcOf(F.consumers);
    const vb = /"pos\.sale\.voided"\s*:([\s\S]*?)"pos\.sale\.refunded"/.exec(cons)?.[1] ?? "";
    if (!/tenderSaleVoided|tenderOnSaleVoided/.test(vb)) p.push("pos.sale.voided ไม่เรียกขั้นย้อนบัตร (tenderSaleVoided)");
    chk("ST2", p.length === 0, "POS → บัตรผ่าน member facade · tender.ts + member exports + ขั้น void", joinP(p));
  }
  // ST3
  {
    const p: string[] = [];
    const br = srcOf(F.bridge);
    const ch = fnBody(br, "channelOf");
    for (const v of ["GIFT_CARD", "STORE_CREDIT"]) if (!new RegExp(`case\\s+["']${v}["']`).test(ch)) p.push(`channelOf ไม่มี case ${v}`);
    const ret = /case\s+["']GIFT_CARD["'][\s\S]*?return\s+["']([A-Z_]+)["']/.exec(ch)?.[1] ?? "";
    if (!ret || ["TRANSFER", "CASH", "PROMPTPAY", "PLATFORM", "ROOM_CHARGE"].includes(ret)) p.push(`GIFT_CARD → ${ret || "?"} (ต้องเป็นช่องทางเงินรับล่วงหน้า)`);
    const acc = srcOf(F.account);
    for (const fn of ["applyExternalSale", "applyExternalRefund"]) {
      const b = fnBody(acc, fn);
      if (!ret || !new RegExp(`["']${ret}["']`).test(b)) p.push(`${fn} ไม่รู้จักช่องทาง ${ret || "?"}`);
      else if (!/DEPOSIT_RECEIVED/.test(b)) p.push(`${fn} ไม่แปลง ${ret} → DEPOSIT_RECEIVED`);
    }
    chk("ST3", p.length === 0, "GIFT_CARD/STORE_CREDIT → 2110 ทั้งขายและคืน", joinP(p));
  }
  // ST4
  {
    const p: string[] = [];
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
    chk("ST4", p.length === 0, "รหัสใหม่ 5 ตัว · คีย์ · ข้อความ th/en", joinP(p));
  }
  // ORACLE-ADD ผู้คุม 14 ต.ค. (fix 1) ST5 ลำดับล็อก (F1) ◂
  {
    const p: string[] = [];
    const sv = srcOf(F.service);
    if (/lockTenderCards/.test(fnBody(sv, "prepareSaleTenders"))) p.push("prepareSaleTenders ยังล็อกบัตร");
    const body = fnBody(sv, "createSaleOnce");
    const iC = body.indexOf("posReceiptCounter.upsert");
    const iL = body.search(/lockTenderCards\s*\(/);
    if (iC < 0) p.push("ไม่พบ posReceiptCounter.upsert ใน createSaleOnce");
    if (iL < 0) p.push("createSaleOnce ไม่เรียก lockTenderCards");
    else if (iL < iC) p.push("lockTenderCards ก่อนตัวนับใบเสร็จ");
    chk("ST5", p.length === 0, "สต็อก → ตัวนับ → บัตร", joinP(p));
  }
  // L1 สัญญา createSale = เพิ่มอย่างเดียว
  {
    const p: string[] = [];
    let cur: Any = null;
    let base: Any = null;
    try {
      cur = JSON.parse(rd(F.contract));
    } catch {
      p.push("อ่าน contract ปัจจุบันไม่ได้");
    }
    const bb = gitBuf(["show", `${BASE_REV}:${F.contract}`]);
    try {
      base = bb ? JSON.parse(bb.toString("utf8")) : null;
    } catch {
      base = null;
    }
    if (!base) p.push(`อ่าน contract ที่ ${BASE_REV} ไม่ได้`);
    if (cur && base) {
      if (short(cur.functions, 100_000) !== short(base.functions, 100_000)) p.push("functions เปลี่ยน");
      for (const [tn, fields] of Object.entries(base.types ?? {}) as [string, Any][]) {
        for (const [k, v] of Object.entries(fields)) if (short(cur.types?.[tn]?.[k]) !== short(v)) p.push(`${tn}.${k} เปลี่ยน/หาย`);
        // ORACLE-EDIT ผู้คุม 17 ต.ค. (CD-RP1 qc-pos-p2.9 L1): + CreateSaleInput.offline (P3.4 S · 0617d17b · เพิ่มอย่างเดียว) — ฟิลด์ใหม่อื่นยังแดง
        for (const k of Object.keys(cur.types?.[tn] ?? {})) if (!(k in fields) && !/^payMethods\[\]\.giftCard(\.|$)/.test(k) && !(tn === "CreateSaleInput" && ["offline", "customerPartyId", "crmDealId", "memberAttachOnly", "creditOverrideByUserId"].includes(k)) /* ORACLE-EDIT ผู้คุม 21.10 (CD-RP9 qc-pos-p2.9 L1): + 4 ฟิลด์ optional ของ P3.6 S (f6ae3054 · เพิ่มอย่างเดียว) */) p.push(`${tn}.${k} ใหม่นอกขอบเขต`);
      }
      for (const tn of Object.keys(cur.types ?? {})) if (!(tn in (base.types ?? {}))) p.push(`ชนิดใหม่ ${tn}`);
      for (const [fn, files] of Object.entries(base.callers ?? {}) as [string, Any][]) {
        const now = new Set(cur.callers?.[fn] ?? []);
        const gone = (files as string[]).filter((f) => !now.has(f));
        if (gone.length) p.push(`ผู้เรียก ${fn} หาย ${gone.join(",")}`);
      }
    }
    chk("L1", p.length === 0, "เพิ่มอย่างเดียว (payMethods[].giftCard*)", joinP(p));
  }
  // L2 ทะเบียนผู้เรียก createSale( ต่อไฟล์ = ฐาน
  {
    const p: string[] = [];
    const count = (src: string) => (stripComments(src).match(/\bcreateSale\s*\(/g) ?? []).length;
    const now: Record<string, number> = {};
    for (const f of walk("src")) {
      if (f.endsWith("src/lib/modules/pos/service.ts") || f.endsWith("src/lib/contracts.ts")) continue;
      const n = count(rd(f));
      if (n) now[f] = n;
    }
    const base: Record<string, number> = {};
    const ls = gitBuf(["ls-tree", "-r", "--name-only", BASE_REV, "src/"]);
    if (!ls) p.push(`อ่านไฟล์ที่ ${BASE_REV} ไม่ได้`);
    else
      for (const f of ls.toString("utf8").split("\n").filter((x) => /\.(ts|tsx)$/.test(x))) {
        if (f.endsWith("src/lib/modules/pos/service.ts") || f.endsWith("src/lib/contracts.ts")) continue;
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
const payCols = await colsOf("PosPayment");
const gcCols = await colsOf("GiftCard");
const COL = { pay: payCols.has("giftCardId") && payCols.has("giftCardTxnId"), kind: gcCols.has("kind") };
if (!COL.pay) skipReasons.push("ฐาน QC4 ยังไม่มี PosPayment.giftCardId/giftCardTxnId");
if (!COL.kind) skipReasons.push("ฐาน QC4 ยังไม่มี GiftCard.kind");

const COUNT_MODELS = ["posSale", "posPayment", "giftCard", "giftCardTxn", "outboxEvent", "auditLog", "accountJournalEntry"] as const;
async function snapshotCounts(): Promise<Record<string, number | string>> {
  const out: Record<string, number | string> = {};
  for (const tid of TIDS)
    for (const m of COUNT_MODELS) {
      const d = P[m];
      out[`${tid}.${m}`] = typeof d?.count === "function" ? await d.count({ where: { tenantId: tid } }).catch((e: Error) => `err:${e.message.slice(0, 30)}`) : "absent";
    }
  return out;
}
const countsBefore = await snapshotCounts();

if (skipReasons.length > 0 && !FORCE) {
  console.log(`⏭️  SKIPPED — ${SUITE}: ของใบ P2.9 ยังไม่มี (ถูกต้องสำหรับข้อสอบที่เขียนก่อนสร้าง) · DB ${HOST}`);
  for (const r of skipReasons) console.log(`   • ${r}`);
  console.log(`JSON_SUMMARY ${JSON.stringify({ suite: SUITE, total: 0, passed: 0, failed: [], skipped: true, reason: skipReasons, registered: CHECKS.length, seed: seedOk })}`);
  await P.$disconnect?.().catch?.(() => {});
  process.exit(0);
}
if (FORCE && skipReasons.length) console.log(`⚠️  QC_FORCE=1 — ข้ามด่าน SKIP ทั้งที่ยังขาด ${skipReasons.length} อย่าง (คาด: แดงตามเหตุผล ไม่ crash · L เขียว)`);

// ═════════════════════════ 4. โหลดโมดูล ═════════════════════════
const svc = await tryImport("@/lib/modules/pos/service");
const tenderMod = existsSync(join(ROOT, F.tender)) ? await tryImport("@/lib/modules/pos/tender") : null;
const regMod = await tryImport("@/lib/modules/pos/register");
const refundMod = await tryImport("@/lib/modules/pos/refund");
const rcpMod = await tryImport("@/lib/modules/pos/receipt");
const billsMod = await tryImport("@/lib/modules/pos/bills");
const shiftMod = await tryImport("@/lib/modules/pos/shift");
const devMod = await tryImport("@/lib/modules/pos/device");
const paySet = await tryImport("@/lib/modules/pos/payment-settings");
const sysSvc = await tryImport("@/lib/modules/system/service");
const accSvc = await tryImport("@/lib/modules/account/service");
const glMod = await tryImport("@/lib/modules/account/gl");
const memMod = await tryImport("@/lib/modules/member");
const gcMod = await tryImport("@/lib/modules/giftcard");
const vatMod = await tryImport("@/lib/money/vat");
const ctxMod = await tryImport("@/lib/core/caller-tx");
const consMod = await tryImport("@/lib/outbox-consumers");
const orderMod = await tryImport("@/lib/modules/pos/order"); // ORACLE-ADD CD-P29-1 (b) ◂
const chMod = await tryImport("@/lib/modules/pos/channel");
const apiSales = await tryImport("@/lib/modules/pos/api/ops/sales");
const coaMod = await tryImport("@/lib/modules/account/coa"); // ORACLE-ADD fix1 T6 ◂
const staffPinMod = await tryImport("@/lib/modules/pos/staff-pin"); // ORACLE-ADD fix2 RC1 d ◂

const RAND = Math.random().toString(36).slice(2, 8);
const TAG = `qc-p2.9-${RAND}`;
const T_SLUG = `posqc-p29-${RAND}`;
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
const DB_IDS = CHECKS.map(([id]) => id).filter((id) => !STATIC_IDS.includes(id) && !["P2.9-Z1", "P2.9-Z2"].includes(id));

async function runDb() {
  if (!seedOk) {
    for (const id of DB_IDS) chk(id, false, "seed ร้าน QC POS", "ยังไม่ได้ seed — ข้อ DB ตรวจไม่ได้");
    return;
  }
  assertQc4BeforeWrite();
  installFetchGuard();
  if (!process.env.SESSION_SECRET) process.env.SESSION_SECRET = `qc-p29-${RAND}-${Math.random().toString(36).slice(2)}`;
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
  let ledgerExp = "";
  try {
    const t = await P.tenant.create({ data: { name: `QC P2.9 วิธีชำระบัตร ${RAND}`, slug: T_SLUG } });
    T = t.id;
    const t2 = await P.tenant.create({ data: { name: `QC P2.9 ร้านอื่น ${RAND}`, slug: T2_SLUG } });
    T2 = t2.id;
    for (const k of ["A", "B"]) U[k] = (await P.businessUnit.create({ data: { tenantId: T, type: "SHOP", name: `${TAG} สาขา${k}`, slug: `${T_SLUG}-${k.toLowerCase()}` } })).id;
    U.H = (await P.businessUnit.create({ data: { tenantId: T, type: "HOTEL", name: `${TAG} โรงแรม`, slug: `${T_SLUG}-h` } })).id; // มติ 8: สาขาโรงแรม (UnitType HOTEL)
    S.POS = (await sysSvc.createSystem(T, "POS", "POS P2.9 (ผูกบัญชี VAT)")).id;
    S.ACC = (await sysSvc.createSystem(T, "ACCOUNT", "บัญชี QC P2.9")).id;
    S.MEM = (await sysSvc.createSystem(T, "MEMBER", "สมาชิก QC P2.9")).id;
    await accSvc.saveSettings(T, S.ACC, { orgName: "ร้านบัตรคิวซี จำกัด", taxId: "0105561177639", vatRegistered: true });
    await glMod.ensureAccounting({ tenantId: T, systemId: S.ACC });
    await P.accountSystemLink.create({ data: { tenantId: T, systemId: S.ACC, linkedKind: "POS", linkedId: S.POS } });
    for (const k of ["A", "B", "H"]) await sysSvc.linkUnit(T, S.POS, U[k]);
    await sysSvc.linkUnit(T, S.MEM, U.A);
    ledgerTip = (await P.accountLedger.create({ data: { tenantId: T, systemId: S.ACC, code: "2190", name: `${TAG} ทิปรอจ่ายพนักงาน`, type: "LIABILITY" } })).id;
    ledgerExp = (await P.accountLedger.create({ data: { tenantId: T, systemId: S.ACC, code: "5990", name: `${TAG} ค่าใช้จ่ายทิป (ผิดชนิด)`, type: "EXPENSE" } })).id;
  } catch (e) {
    fx = `ร้านชั่วคราว:${(e as Error).message.slice(0, 160)}`;
    console.log(`  ⚠️  ${fx}`);
  }
  const FXB = (s: string) => (fx ? `fixture:${fx} · ` : "") + s;

  const owner = { userId: ownerId, role: "OWNER", unitAccess: ["*"], permissions: {} };
  const noperm = { userId: cashierId, role: "STAFF", unitAccess: [U.A], permissions: { "pos.sale.read": true } };
  const ctxOf = (k: string, deviceId?: string): Any => ({ tenantId: T, systemId: S.POS, unitId: U[k], ...(deviceId ? { deviceId } : {}) });
  const ctxM: Any = { tenantId: T, systemId: S.MEM, actorUserId: ownerId };
  const gctx: Any = { tenantId: T, systemId: S.MEM, posSystemId: S.POS, actorUserId: ownerId };
  const sysCtx = (): Any => ({ tenantId: T, systemId: S.POS });

  // ─── เครื่อง + กะ ───
  const DEV1 = `qc29${RAND}d1`;
  let SHIFT = "";
  if (!fx) {
    const rg = await call(devMod, "registerDevice", ctxOf("A"), owner, { name: "เคาน์เตอร์ QC 29", deviceCode: DEV1 });
    if (rg?.ok !== true) console.log(`  ⚠️  registerDevice: ${codeOf(rg)} ${short(rg?.message ?? "", 80)}`);
    const o1 = await call(shiftMod, "openShift", ctxOf("A", DEV1), owner, { deviceId: DEV1, deviceLabel: "เคาน์เตอร์ QC 29", floatSatang: 0 });
    if (o1?.ok !== true) fx = `เปิดกะ: ${codeOf(o1)} ${short(o1?.message ?? "", 80)}`;
    else SHIFT = String(o1.shift?.id ?? "");
  }

  // ─── สมาชิก + บัตร ───
  const rnd = (n: number) => String(Math.floor(Math.random() * 10 ** n)).padStart(n, "0");
  const C: Record<string, string> = {};
  const GC: Record<string, { id: string; number: string; pin: string }> = {};
  const sellCard = async (k: string, satang: number, opts: Any = {}) => {
    const r = await step(`บัตร ${k}`, () => gcMod.sell(gctx, owner, { satang, payMethods: [{ type: "CASH", amountSatang: satang }], unitId: U.A, recipient: { print: true }, idempotencyKey: `${TAG}-gc-${k}`, ...opts }));
    if (r?.giftCardId) GC[k] = { id: String(r.giftCardId), number: String(r.number), pin: String(r.pin) };
  };
  if (!fx) {
    for (const k of ["X", "Y", "MA", "MB", "MC", "MD", "ME", "MF", "MS", "MK", "MW"]) {
      const r = await step(`สมาชิก ${k}`, () => memMod.createMember(ctxM, owner, { phone: `0895${rnd(6)}`, name: `${k === "X" ? "สมชาย" : k === "Y" ? "สมหญิง" : `สมาชิก${k}`} บัตรดี ${RAND}`, source: "WALK_IN", homeUnitId: U.A }));
      if (r?.customerId) C[k] = String(r.customerId);
    }
    await step("บัตร: เปิดใช้ (สวิตช์บัญชีปิด)", () => gcMod.setSettings(gctx, owner, { enabled: true, accountingLink: false }));
    await sellCard("F", 20_000); // CD1b — ขายตอนสวิตช์ปิด
    await step("บัตร: สวิตช์บัญชีเปิด", () => gcMod.setSettings(gctx, owner, { enabled: true, accountingLink: true }));
    const plan: [string, number][] = [["A", 50_000], ["B", 10_000], ["C", 30_000], ["D", 10_000], ["E", 30_000], ["S", 10_000], ["X", 10_000], ["V", 20_000], ["W", 15_000], ["R", 10_000], ["Q", 10_000], ["K", 30_000], ["Z", 10_000], ["Y", 10_000], ["H", 20_000], ["L", 30_000], ["M", 10_000], ["RC1", 50_000], ["RC2", 10_000], ["RC3", 10_000], ["PN", 30_000], ["PL", 10_000], ["QQ", 10_000], ["QB", 30_000], ["PX", 10_000], ["RC4", 10_000], ["PY", 10_000], ["PZ", 10_000]]; // + fix1 + fix2 + fix3
    for (const [k, s] of plan) await sellCard(k, s);
    if (GC.S) await step("บัตร S ระงับ", () => gcMod.suspend(gctx, owner, { number: GC.S.number, reason: "QC P2.9" }));
    if (GC.X) await step("บัตร X หมดอายุ", () => P.giftCard.update({ where: { id: GC.X.id }, data: { expiresAt: new Date(Date.now() - 3_600_000) } }));
    // บัตรของร้านอื่น (แถวตรง · ร้าน -t2)
    const t2num = `GC-9${rnd(7)}`;
    await step("บัตรร้านอื่น", () => P.giftCard.create({ data: { tenantId: T2, systemId: `qc29-t2-${RAND}`, number: t2num, pinHash: "0".repeat(64), initialSatang: 10_000, balanceSatang: 10_000 } }));
    GC.T2 = { id: "", number: t2num, pin: "1234" };
    await drain();
  }
  const X = C.X ?? "";
  const Y = C.Y ?? "";
  console.log(`   สมาชิก ${Object.keys(C).join(",")} · บัตร ${Object.keys(GC).join(",")} · กะ ${SHIFT ? "เปิด" : "ไม่มี"}`);

  // ─── ตัวช่วยของบิล ───
  const memberOf = (cid: string) => (cid ? { memberId: cid, memberSystemId: S.MEM } : {});
  let keyN = 0;
  const key = (p: string) => `p29${RAND}-${p}-${++keyN}`.replace(/[^A-Za-z0-9_-]/g, "");
  const gcPay = (amt: number, k: string, pin?: string): Any => ({ type: "GIFT_CARD", amountSatang: amt, giftCard: { number: GC[k]?.number ?? `GC-missing-${k}`, pin: pin ?? GC[k]?.pin ?? "" } });
  const cash = (amt: number): Any => ({ type: "CASH", amountSatang: amt });
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
  const saleByKey = async (k: string): Promise<Any> => P.posSale.findFirst({ where: { tenantId: T, idempotencyKey: k } }).catch(() => null);
  const card = async (k: string): Promise<Any> => (GC[k]?.id ? P.giftCard.findUnique({ where: { id: GC[k].id } }).catch(() => null) : null);
  const cardById = async (id: string): Promise<Any> => (id ? P.giftCard.findUnique({ where: { id } }).catch(() => null) : null);
  const txns = async (cardId: string, type?: string): Promise<Any[]> => (cardId ? ((await P.giftCardTxn.findMany({ where: { tenantId: T, giftCardId: cardId, ...(type ? { type } : {}) }, orderBy: { createdAt: "asc" } }).catch(() => [])) as Any[]) : []);
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
  const voidBill = (saleId: string) => call(svc, "voidSale", T, U.A, saleId, { actorUserId: ownerId, reason: "QC P2.9" });
  const split = (g: number) => (typeof vatMod?.splitIncludedVat === "function" ? vatMod.splitIncludedVat(g, 700) : { baseSatang: NaN, vatSatang: NaN });
  const scCard = async (cid: string): Promise<Any[]> => (cid && COL.kind ? ((await P.$queryRawUnsafe(`SELECT id, number, "balanceSatang", "ownerCustomerId", "systemId", kind::text AS kind, status::text AS status FROM "GiftCard" WHERE "tenantId" = $1 AND "ownerCustomerId" = $2 AND kind::text = 'STORE_CREDIT'`, T, cid).catch(() => [])) as Any[]) : []);

  // ════════ T ทิป ════════
  const setPay = (patch: Any) => call(paySet, "updatePosPaymentSettings", sysCtx(), owner, patch);
  const readPay = async () => (await call(paySet, "posPaymentSettings", sysCtx())) as Any;
  {
    const r1 = fx ? null : await setPay({ tip: { enabled: true, ledgerAccountId: ledgerExp || "-" } });
    const a1 = fx ? null : await readPay();
    chk("T1", !fx && refused(r1, "TIP_ACCOUNT_REQUIRED") && a1?.tip?.enabled === false, "TIP_ACCOUNT_REQUIRED · ทิปปิด", FXB(`${codeOf(r1)} → ${short(a1?.tip)}`));
    const r2 = fx ? null : await setPay({ tip: { enabled: true, ledgerAccountId: ledgerTip || "-" } });
    const a2 = fx ? null : await readPay();
    chk("T2", !fx && r2?.ok === true && a2?.tip?.enabled === true && a2?.tip?.ledgerAccountId === ledgerTip, "ok · enabled · ledger 2190", FXB(`${codeOf(r2)} ${short(r2?.message ?? "", 60)} → ${short(a2?.tip)}`));
  }
  let tipSale = "";
  {
    const p: string[] = [];
    const k = key("tip");
    const r = fx ? null : await cs(saleIn(k, [["อาหาร ทิป", 6500]], [{ ...cash(7000), cashTenderedSatang: 7000 }], { tipSatang: 500, shiftId: SHIFT || undefined }));
    if (!ok(r)) p.push(`createSale → ${codeOf(r)} ${short(r?.message ?? "", 80)}`);
    else {
      tipSale = r.saleId;
      await drain();
      const row = await P.posSale.findUnique({ where: { id: tipSale } });
      if (row?.tipSatang !== 500 || row?.grandTotalSatang !== 6500 || row?.vatSatang !== 425) p.push(`บิล tip ${row?.tipSatang} grand ${row?.grandTotalSatang} vat ${row?.vatSatang}`);
      const jv = await jvOf("PosSale", [tipSale]);
      const net = netByCode(jv);
      const want = { "1000": 7000, "4000": -6075, "2200": -425, "2190": -500 };
      if (jv.length !== 1 || !balanced(jv) || short(Object.entries(net).sort()) !== short(Object.entries(want).sort())) p.push(`JV ${jv.length} ${short(net)} (คาด ${short(want)})`);
    }
    chk("T3", p.length === 0, "Dr 1000 7000 · Cr 4000 6075 · Cr 2200 425 · Cr 2190 500", FXB(joinP(p)));
  }
  // T5 (ก่อน T4 — X ก่อนคืนเงิน)
  {
    const p: string[] = [];
    const x = SHIFT ? await call(shiftMod, "xReport", ctxOf("A", DEV1), owner, { shiftId: SHIFT }) : null;
    if (x?.ok !== true || x.report?.expectedCashSatang !== 7000) p.push(`X ${codeOf(x)} expected ${x?.report?.expectedCashSatang} (คาด 7000)`);
    const k = key("tipv");
    const r = fx ? null : await cs(saleIn(k, [["อาหาร ทิปยกเลิก", 1000]], [cash(1200)], { tipSatang: 200 }));
    if (!ok(r)) p.push(`บิลทิปที่สอง → ${codeOf(r)}`);
    else {
      await drain();
      const v = await voidBill(r.saleId);
      if (v?.ok === false) p.push(`void → ${codeOf(v)}`);
      await drain();
      const jv = await jvOf("PosSale", [r.saleId]);
      const net = netByCode(jv);
      if (jv.length !== 2 || !balanced(jv) || Object.keys(net).length) p.push(`JV ${jv.length} net ${short(net)} (คาด 2 รายการ สุทธิ 0)`);
      if (!jv.some((e: Any) => (e.lines ?? []).some((l: Any) => l.account?.code === "2190"))) p.push("JV ไม่มีบรรทัด 2190");
    }
    chk("T5", p.length === 0, "X expected 7000 · void สุทธิ 0 รวม 2190", FXB(joinP(p)));
  }
  {
    const p: string[] = [];
    const lid = tipSale ? await lineId(tipSale, "อาหาร ทิป") : "";
    const r = lid ? await refund(tipSale, [{ lineId: lid, qty: 1 }], [cash(6500)]) : null;
    if (r?.ok !== true) p.push(`refund → ${codeOf(r)} ${short(r?.message ?? "", 60)}`);
    else {
      await drain();
      const doc = r.refund;
      if (doc?.grandTotalSatang !== 6500) p.push(`ใบคืน ${doc?.grandTotalSatang}`);
      const row = await P.posSale.findUnique({ where: { id: doc?.id ?? "-" } });
      if (row?.tipSatang !== 0) p.push(`ใบคืน tip ${row?.tipSatang}`);
      const jv = await jvOf("PosSale", [doc?.id ?? ""]);
      if (jv.some((e: Any) => (e.lines ?? []).some((l: Any) => l.account?.code === "2190"))) p.push("CN แตะ 2190");
      if (!jv.length) p.push("ไม่มี JV ของใบคืน");
      const orig = await P.posSale.findUnique({ where: { id: tipSale } });
      if (orig?.tipSatang !== 500) p.push(`บิลเดิม tip ${orig?.tipSatang}`);
    }
    chk("T4", !!tipSale && p.length === 0, "ใบคืน 6500 tip 0 · CN ไม่แตะ 2190", FXB(tipSale ? joinP(p) : "ไม่มีบิลทิป (T3)"));
  }
  // ORACLE-ADD ผู้คุม 14 ต.ค. (fix 1 · H5): บัญชีพักทิปที่ใช้งานอยู่ห้ามเก็บ/เปลี่ยนชนิด · ถ้าถูกเก็บไปแล้ว บิลทิปต้องถูกปฏิเสธ (ไม่ใช่ JV ค้าง) ◂
  {
    const p: string[] = [];
    if (fx || !ledgerTip) p.push("fixture");
    else {
      const cctx = { tenantId: T, systemId: S.ACC };
      const ar = await call(coaMod, "archiveLedger", cctx, ledgerTip);
      if (ar?.ok !== false) p.push(`archiveLedger → ${short(ar, 80)}`);
      const ur = await call(coaMod, "updateLedger", cctx, ledgerTip, { type: "EXPENSE" });
      if (ur?.ok !== false) p.push(`updateLedger type → ${short(ur, 80)}`);
      // ORACLE-ADD ผู้คุม 14 ต.ค. (fix 2 · H5 ค้าง): ปิดใช้งาน (setLedgerActive false) ก็ต้องถูกปฏิเสธ ◂
      const sa = await call(coaMod, "setLedgerActive", cctx, ledgerTip, false);
      if (sa?.ok !== false) p.push(`setLedgerActive(false) → ${short(sa, 80)}`);
      const lg = await P.accountLedger.findUnique({ where: { id: ledgerTip } });
      if (lg?.archivedAt || lg?.type !== "LIABILITY") p.push("บัญชีพักทิปถูกเปลี่ยน");
      // จำลองบัญชีที่ถูกเก็บก่อนมีด่าน (แถวตรง · คืนค่าทันทีหลังตรวจ)
      await P.accountLedger.update({ where: { id: ledgerTip }, data: { archivedAt: new Date() } });
      const k = key("t6");
      const r = await cs(saleIn(k, [["อาหาร T6", 1000]], [cash(1200)], { tipSatang: 200 }));
      if (!refused(r, "VALIDATION") || (await saleByKey(k))) p.push(`ทิป + บัญชีถูกเก็บ → ${codeOf(r)}`);
      await P.accountLedger.update({ where: { id: ledgerTip }, data: { archivedAt: null } });
      await drain();
      const dead = await P.outboxEvent.count({ where: { tenantId: T, type: "pos.sale.paid", status: "FAILED" } });
      if (dead) p.push(`pos.sale.paid FAILED ${dead}`);
    }
    chk("T6", p.length === 0, "เก็บ/เปลี่ยนชนิดถูกปฏิเสธ · บิลทิป VALIDATION · FAILED 0", FXB(joinP(p)));
  }

  // ════════ S เครดิตร้าน ════════
  let sx1 = "";
  let scId = "";
  let scNumber = "";
  {
    const p: string[] = [];
    const k = key("sx1");
    const r = fx || !X ? null : await cs(saleIn(k, [["เสื้อ S1", 60_000], ["กางเกง S2", 40_000]], [cash(100_000)], memberOf(X)));
    if (!ok(r)) p.push(`บิล X → ${codeOf(r)} ${short(r?.message ?? "", 60)}`);
    else {
      sx1 = r.saleId;
      await drain();
      const l1 = await lineId(sx1, "เสื้อ S1");
      const rk = key("s1");
      const f1 = await refund(sx1, [{ lineId: l1, qty: 1 }], [{ type: "STORE_CREDIT", amountSatang: 60_000 }], rk);
      if (f1?.ok !== true) p.push(`คืน STORE_CREDIT → ${codeOf(f1)} ${short(f1?.message ?? "", 80)}`);
      else {
        const f1b = await refund(sx1, [{ lineId: l1, qty: 1 }], [{ type: "STORE_CREDIT", amountSatang: 60_000 }], rk);
        if (f1b?.ok !== true || f1b.refund?.id !== f1.refund?.id) p.push(`คืนซ้ำคีย์เดิม → ${codeOf(f1b)} ${f1b?.refund?.id === f1.refund?.id ? "" : "ใบต่าง"}`);
        await drain();
        p.push(...(await replay("pos.sale.refunded", (x) => x.refundId === f1.refund.id || x.saleId === f1.refund.id || x.refundSaleId === f1.refund.id)).filter((e) => !e.startsWith("ไม่พบ")));
        await drain();
        const cards = await scCard(X);
        if (cards.length !== 1) p.push(`เครดิตของ X ${cards.length} ใบ`);
        else {
          scId = String(cards[0].id);
          scNumber = String(cards[0].number);
          if (Number(cards[0].balanceSatang) !== 60_000 || cards[0].systemId !== S.MEM) p.push(`เครดิต ${cards[0].balanceSatang} ระบบ ${cards[0].systemId === S.MEM ? "ถูก" : "ผิด"}`);
          const tx = await txns(scId);
          if (tx.length !== 1 || tx[0].satang !== 60_000) p.push(`txn ${tx.length} ${short(tx.map((t) => `${t.type}:${t.satang}`))}`);
        }
        const rp = await paysOf(f1.refund.id);
        if (!rp.length || rp[0].type !== "STORE_CREDIT" || (scId && rp[0].giftCardId !== scId)) p.push(`แถวคืน ${short(rp.map((x) => `${x.type}:${x.giftCardId ?? "-"}`))}`);
        const jv = await jvOf("PosSale", [f1.refund.id]);
        const net = netByCode(jv);
        if ((net["2110"] ?? 0) !== -60_000) p.push(`CN 2110 ${net["2110"] ?? 0} (คาด −60000) ${short(net)}`);
      }
    }
    chk("S1", COL.kind && p.length === 0, "1 ใบ 600 · Cr 2110 600 · ซ้ำไม่เพิ่ม", FXB(joinP(p)));
  }
  {
    const p: string[] = [];
    if (!sx1) p.push("ไม่มีบิล S1");
    else {
      const l2 = await lineId(sx1, "กางเกง S2");
      const f2 = await refund(sx1, [{ lineId: l2, qty: 1 }], [{ type: "STORE_CREDIT", amountSatang: 40_000 }]);
      if (f2?.ok !== true) p.push(`คืนครั้งที่สอง → ${codeOf(f2)} ${short(f2?.message ?? "", 60)}`);
      await drain();
      const cards = await scCard(X);
      if (cards.length !== 1 || Number(cards[0]?.balanceSatang) !== 100_000 || (scId && cards[0]?.id !== scId)) p.push(`เครดิต ${cards.length} ใบ ${short(cards.map((c) => c.balanceSatang))}`);
    }
    const kw = key("swalk");
    const w = fx ? null : await cs(saleIn(kw, [["ของ walk S", 5000]], [cash(5000)]));
    if (!ok(w)) p.push(`บิล walk-in → ${codeOf(w)}`);
    else {
      const lw = await lineId(w.saleId, "ของ walk S");
      const fw = await refund(w.saleId, [{ lineId: lw, qty: 1 }], [{ type: "STORE_CREDIT", amountSatang: 5000 }]);
      if (!refused(fw, "REFUND_METHOD_INVALID")) p.push(`walk-in คืน STORE_CREDIT → ${codeOf(fw)}`);
      if ((await refundDocs(w.saleId)).length) p.push("walk-in มีใบคืน");
    }
    chk("S2", p.length === 0, "ใบเดิม 1000 · walk-in REFUND_METHOD_INVALID", FXB(joinP(p)));
  }
  let s3Sale = "";
  {
    const p: string[] = [];
    const cart = (cid?: string): Any => ({ lines: [{ name: `ของเครดิต ${RAND}`, qty: 1, unitPriceSatang: 30_000 }], ...(cid ? { memberId: cid } : {}) });
    const sub = async (cid: string | undefined, pays: Any[]) => {
      const k = key("s3");
      const q = await call(regMod, "quoteRegisterCart", ctxOf("A"), owner, cart(cid));
      const r = await call(regMod, "submitRegisterSale", ctxOf("A", DEV1), owner, { ...cart(cid), idempotencyKey: k, expectedGrandTotalSatang: Number(q?.grandTotalSatang ?? 30_000), payMethods: pays });
      return { r, k, q };
    };
    if (fx || !X) p.push("ไม่มีสมาชิก X");
    else {
      const a = await sub(X, [{ type: "STORE_CREDIT", amountSatang: 30_000 }]);
      if (a.r?.ok !== true) p.push(`X STORE_CREDIT → ${codeOf(a.r)} ${short(a.r?.message ?? "", 80)} (quote ${codeOf(a.q)})`);
      else {
        s3Sale = String(a.r.saleId);
        await drain();
        const cards = await scCard(X);
        if (Number(cards[0]?.balanceSatang) !== 70_000) p.push(`เครดิต ${cards[0]?.balanceSatang} (คาด 70000)`);
        const use = (await txns(scId, "USE"))[0];
        const pay = (await paysOf(s3Sale)).find((x) => x.type === "STORE_CREDIT");
        if (!use || use.refType !== "PosPayment" || use.refId !== pay?.id || pay?.giftCardTxnId !== use?.id) p.push(`USE ${short(use ? { refType: use.refType, refId: use.refId === pay?.id } : null)} · pay ${short(pay?.giftCardTxnId ? "txn" : null)}`);
        const net = netByCode(await jvOf("PosSale", [s3Sale]));
        if ((net["2110"] ?? 0) !== 30_000) p.push(`JV 2110 ${net["2110"] ?? 0} (คาด Dr 30000)`);
      }
      const b = Y ? await sub(Y, [{ type: "STORE_CREDIT", amountSatang: 30_000 }]) : null;
      if (!refused(b?.r, "STORE_CREDIT_NOT_OWNER") || (b && (await saleByKey(b.k)))) p.push(`Y → ${codeOf(b?.r)}`);
      const c = await sub(undefined, [{ type: "STORE_CREDIT", amountSatang: 30_000 }]);
      if (!refused(c.r, "STORE_CREDIT_NOT_OWNER") || (await saleByKey(c.k))) p.push(`walk-in → ${codeOf(c.r)}`);
    }
    chk("S3", p.length === 0, "X ok 700 · Dr 2110 · Y/walk-in NOT_OWNER", FXB(joinP(p)));
  }
  {
    const p: string[] = [];
    if (!s3Sale) p.push("ไม่มีบิล S3");
    else {
      const v = await voidBill(s3Sale);
      if (v?.ok === false) p.push(`void → ${codeOf(v)} ${short(v?.message ?? "", 60)}`);
      await drain();
      p.push(...(await replay("pos.sale.voided", (x) => x.saleId === s3Sale)));
      await drain();
      const cards = await scCard(X);
      if (Number(cards[0]?.balanceSatang) !== 100_000) p.push(`เครดิต ${cards[0]?.balanceSatang} (คาด 100000)`);
      const use = (await txns(scId, "USE"))[0];
      const refs = (await txns(scId, "REFUND")).filter((t) => t.refType === "GiftCardTxn" && t.refId === use?.id);
      if (refs.length !== 1 || refs[0]?.idempotencyKey !== `giftcard-refund-${use?.id}`) p.push(`REFUND ของ USE ${refs.length} ${short(refs.map((t) => t.idempotencyKey))}`);
    }
    chk("S4", p.length === 0, "เครดิตกลับ 1000 · REFUND 1", FXB(joinP(p)));
  }
  // ORACLE-ADD ผู้คุม 14 ต.ค. (fix 1 · F4): เลขเครดิตร้านไม่ใช่บัตรกำนัล ◂
  {
    const p: string[] = [];
    if (!scNumber) p.push("ไม่มีเลขเครดิตร้าน (S1)");
    else {
      const b0 = (await scCard(X))[0]?.balanceSatang;
      const idem = `${TAG}-s5-reload`;
      const rl = await call(gcMod, "reload", gctx, owner, { number: scNumber, satang: 1_000, payMethods: [cash(1_000)], unitId: U.A, idempotencyKey: idem });
      if (rl?.ok !== false || !/NOT_FOUND/.test(String(rl?.code))) p.push(`reload SC → ${codeOf(rl)} ${short(rl?.message ?? "", 60)}`);
      if (await P.posSale.count({ where: { tenantId: T, idempotencyKey: `giftcard-reload-${idem}` } })) p.push("มีบิลเติมเงิน");
      const su = await call(gcMod, "suspend", gctx, owner, { number: scNumber, reason: "QC S5" });
      if (su?.ok !== false) p.push(`suspend SC → ${codeOf(su)}`);
      const c = (await scCard(X))[0];
      if (c?.balanceSatang !== b0 || c?.status !== "ACTIVE") {
        p.push(`เครดิต ${b0}→${c?.balanceSatang}/${c?.status}`);
        // คืนสภาพ (กันข้อถัดไปพังตาม — เฉพาะเมื่อโค้ดยังรับ SC เป็นบัตรกำนัล)
        if (c?.id) await P.giftCard.update({ where: { id: c.id }, data: { balanceSatang: Number(b0), status: "ACTIVE" } });
      }
      const ls = await call(gcMod, "list", gctx, { take: 200 });
      if (ls?.ok === false || (ls?.rows ?? []).some((r: Any) => String(r.number).startsWith("SC-"))) p.push(`list ${codeOf(ls)} มีเลข SC`);
      const giftBal = sum(((await P.$queryRawUnsafe(`SELECT "balanceSatang" AS b FROM "GiftCard" WHERE "tenantId" = $1 AND "systemId" = $2 AND status::text = 'ACTIVE' AND kind::text = 'GIFT'`, T, S.MEM)) as Any[]).map((r) => Number(r.b)));
      if (ls?.kpi?.outstandingSatang !== giftBal) p.push(`KPI outstanding ${ls?.kpi?.outstandingSatang} (คาด GIFT ${giftBal})`);
    }
    chk("S5", p.length === 0, "SC ไม่ใช่บัตรกำนัล · ไม่มีบิล · list/KPI GIFT เท่านั้น", FXB(joinP(p)));
  }

  // ════════ G บัตรของขวัญเป็นวิธีชำระ ════════
  const lookup = (num: string, actor: Any = owner, unit = "A") => call(tenderMod, "registerGiftCardLookup", ctxOf(unit), actor, { number: num });
  {
    const p: string[] = [];
    const c0 = await card("A");
    const n0 = (await txns(GC.A?.id ?? "")).length;
    const a = GC.A ? await lookup(GC.A.number) : null;
    const last4 = GC.A?.number.slice(-4) ?? "????";
    const cd = a?.card ?? a;
    if (a?.ok !== true || cd?.numberMasked !== `GC-••••${last4}` || cd?.balanceSatang !== 50_000 || cd?.status !== "ACTIVE" || cd?.usable !== true) p.push(`A → ${codeOf(a)} ${short(cd, 140)}`);
    if (a && /pin/i.test(Object.keys(cd ?? {}).join(","))) p.push("ผลมีฟิลด์ PIN");
    if (a && JSON.stringify(a).includes(GC.A?.number ?? "∅")) p.push("ผลมีเลขเต็ม");
    const c1 = await card("A");
    if ((await txns(GC.A?.id ?? "")).length !== n0 || c1?.pinFailedCount !== c0?.pinFailedCount || c1?.balanceSatang !== c0?.balanceSatang) p.push("ค้นแล้วแถวเปลี่ยน");
    const b = GC.A ? await lookup(GC.A.number, owner, "B") : null;
    if (b?.ok !== true) p.push(`สาขา B → ${codeOf(b)}`);
    const u = await lookup(`GC-0${rnd(7)}`);
    const o = await lookup(GC.T2?.number ?? "GC-none");
    const s = scNumber ? await lookup(scNumber) : null;
    if (!refused(u, "GIFT_CARD_NOT_FOUND") || !refused(o, "GIFT_CARD_NOT_FOUND") || u?.message !== o?.message) p.push(`ไม่พบ ${codeOf(u)} · ร้านอื่น ${codeOf(o)} · ข้อความ${u?.message === o?.message ? "เดียวกัน" : "ต่าง"}`);
    if (scNumber && !refused(s, "GIFT_CARD_NOT_FOUND")) p.push(`เลขเครดิตร้าน → ${codeOf(s)}`);
    const np = GC.A ? await lookup(GC.A.number, noperm) : null;
    if (!refused(np, "PERMISSION_DENIED")) p.push(`ไม่มีสิทธิ์ → ${codeOf(np)}`);
    chk("G1", p.length === 0, "masked · ไม่เขียน · ไม่พบ = ข้อความเดียว · สิทธิ์", FXB(joinP(p)));
  }
  let g2Sale = "";
  let g2Txn = "";
  {
    const p: string[] = [];
    const k = key("g2");
    const r = fx ? null : await cs(saleIn(k, [["ชุด G2", 62_500]], [cash(30_000), gcPay(32_500, "A")]));
    if (!ok(r)) p.push(`createSale → ${codeOf(r)} ${short(r?.message ?? "", 80)}`);
    else {
      g2Sale = r.saleId;
      const c = await card("A");
      if (c?.balanceSatang !== 17_500) p.push(`บัตร A ${c?.balanceSatang}`);
      const uses = await txns(GC.A.id, "USE");
      const pay = (await paysOf(g2Sale)).find((x) => x.type === "GIFT_CARD");
      if (uses.length !== 1) p.push(`USE ${uses.length}`);
      const u = uses[0];
      g2Txn = String(u?.id ?? "");
      if (u?.refType !== "PosPayment" || u?.refId !== pay?.id || u?.idempotencyKey !== `pos-gct-${g2Sale}-${GC.A.id}` || u?.satang !== 32_500) p.push(`USE ${short({ refType: u?.refType, refIdOk: u?.refId === pay?.id, key: u?.idempotencyKey, satang: u?.satang })}`);
      if (pay?.giftCardId !== GC.A.id || pay?.giftCardTxnId !== u?.id) p.push(`PosPayment ${short({ giftCardId: pay?.giftCardId === GC.A.id, txn: pay?.giftCardTxnId === u?.id })}`);
      if ((await P.posSale.findUnique({ where: { id: g2Sale } }))?.status !== "PAID") p.push("ไม่ PAID");
    }
    chk("G2", p.length === 0, "PAID · บัตร 175 · USE PosPayment", FXB(joinP(p)));
  }
  {
    const p: string[] = [];
    const k = key("g3");
    const r = fx ? null : await cs(saleIn(k, [["ชุด G3", 60_000]], [gcPay(10_000, "B"), gcPay(20_000, "C"), cash(30_000)]));
    if (!ok(r)) p.push(`createSale → ${codeOf(r)} ${short(r?.message ?? "", 80)}`);
    else {
      const b = await card("B");
      const c = await card("C");
      if (b?.balanceSatang !== 0 || b?.status !== "DEPLETED" || c?.balanceSatang !== 10_000) p.push(`B ${b?.balanceSatang}/${b?.status} · C ${c?.balanceSatang}`);
      const uses = [...(await txns(GC.B.id, "USE")), ...(await txns(GC.C.id, "USE"))];
      if (uses.length !== 2) p.push(`USE ${uses.length}`);
      if (sum((await paysOf(r.saleId)).map((x) => Number(x.amountSatang))) !== 60_000) p.push("Σ จ่าย ≠ 60000");
    }
    chk("G3", p.length === 0, "USE 2 · B 0 DEPLETED · C 100", FXB(joinP(p)));
  }
  {
    const p: string[] = [];
    const wrong = GC.E?.pin === "0000" ? "1111" : "0000";
    const k1 = key("g4");
    const r1 = fx ? null : await cs(saleIn(k1, [["ของ G4", 10_000]], [gcPay(10_000, "E", wrong)]));
    if (!refused(r1, "GIFT_CARD_PIN") || (await saleByKey(k1))) p.push(`PIN ผิด → ${codeOf(r1)}`);
    if ((await card("E"))?.pinFailedCount !== 1) p.push(`ตัวนับ ${(await card("E"))?.pinFailedCount} (คาด 1)`);
    let last: Any = null;
    for (let i = 0; i < 4; i++) last = fx ? null : await cs(saleIn(key("g4"), [["ของ G4", 10_000]], [gcPay(10_000, "E", wrong)]));
    if (!refused(last, "GIFT_CARD_LOCKED")) p.push(`ครั้งที่ 5 → ${codeOf(last)}`);
    const k6 = key("g4ok");
    const r6 = fx ? null : await cs(saleIn(k6, [["ของ G4", 10_000]], [gcPay(10_000, "E")]));
    if (!refused(r6, "GIFT_CARD_LOCKED") || (await saleByKey(k6))) p.push(`PIN ถูกระหว่างล็อก → ${codeOf(r6)}`);
    if ((await card("E"))?.balanceSatang !== 30_000) p.push("ยอดบัตร E เปลี่ยน");
    chk("G4", p.length === 0, "PIN → LOCKED", FXB(joinP(p)));
  }
  {
    const p: string[] = [];
    const n0 = (await txns(GC.A?.id ?? "")).length;
    const k = key("g5");
    const r = fx ? null : await cs(saleIn(k, [["ของ G5", 20_000]], [gcPay(20_000, "A")]));
    if (!refused(r, "GIFT_CARD_CHANGED") || (await saleByKey(k))) p.push(`เกินยอด → ${codeOf(r)}`);
    if ((await card("A"))?.balanceSatang !== 17_500 || (await txns(GC.A?.id ?? "")).length !== n0) p.push("แถวเปลี่ยน");
    chk("G5", p.length === 0, "GIFT_CARD_CHANGED · ไม่เขียน", FXB(joinP(p)));
  }
  {
    const p: string[] = [];
    const tryOne = async (label: string, pays: Any[], code: string) => {
      const k = key("g6");
      const r = fx ? null : await cs(saleIn(k, [["ของ G6", 10_000]], pays));
      if (!refused(r, code) || (await saleByKey(k))) p.push(`${label} → ${codeOf(r)} (คาด ${code})`);
    };
    await tryOne("ใบเดียวสองแถว", [gcPay(5_000, "C"), gcPay(5_000, "C")], "VALIDATION");
    await tryOne("ระงับ", [gcPay(10_000, "S")], "GIFT_CARD_CHANGED");
    await tryOne("หมดอายุ", [gcPay(10_000, "X")], "GIFT_CARD_CHANGED");
    await tryOne("ร้านอื่น", [gcPay(10_000, "T2")], "GIFT_CARD_NOT_FOUND");
    if (scNumber) await tryOne("เลขเครดิตร้าน", [{ type: "GIFT_CARD", amountSatang: 10_000, giftCard: { number: scNumber, pin: "1234" } }], "GIFT_CARD_NOT_FOUND");
    else p.push("ไม่มีเลขเครดิตร้าน (S1)");
    chk("G6", p.length === 0, "VALIDATION · CHANGED ×2 · NOT_FOUND ×2", FXB(joinP(p)));
  }
  {
    const p: string[] = [];
    const tryOne = async (label: string, input: Any) => {
      const r = fx ? null : await cs(input);
      if (!refused(r, "VALIDATION") || (await saleByKey(input.idempotencyKey))) p.push(`${label} → ${codeOf(r)}`);
    };
    await tryOne("บิลขายบัตร", saleIn(key("g7"), [["บัตรของขวัญ G7", 10_000]], [gcPay(10_000, "M")], { sourceModule: "MEMBER" }));
    await tryOne("คู่ memberChoices.giftCard", saleIn(key("g7"), [["ของ G7", 20_000]], [gcPay(10_000, "M"), cash(5_000)], { ...memberOf(X), memberChoices: { giftCard: { number: GC.L?.number, pin: GC.L?.pin, satang: 5_000 } } }));
    await tryOne("4 แถว", saleIn(key("g7"), [["ของ G7", 4_000]], [gcPay(1_000, "M"), gcPay(1_000, "K"), gcPay(1_000, "C"), gcPay(1_000, "H")]));
    await tryOne("ไม่มี giftCard", saleIn(key("g7"), [["ของ G7", 1_000]], [{ type: "GIFT_CARD", amountSatang: 1_000 }]));
    await tryOne("giftCard บนเงินสด", saleIn(key("g7"), [["ของ G7", 1_000]], [{ type: "CASH", amountSatang: 1_000, giftCard: { number: GC.M?.number, pin: GC.M?.pin } }]));
    if ((await card("M"))?.balanceSatang !== 10_000) p.push("บัตร M ถูกตัด");
    chk("G7", p.length === 0, "VALIDATION ×5 · ไม่มีบิล", FXB(joinP(p)));
  }
  {
    const p: string[] = [];
    const k = key("g8");
    const r = fx ? null : await cs(saleIn(k, [["ของ G8", 10_000]], [gcPay(10_500, "M")], { tipSatang: 500 }));
    if (!refused(r, "VALIDATION") || (await saleByKey(k))) p.push(`บัตร+ทิป → ${codeOf(r)}`);
    const k2 = key("g8");
    // ทิป 200 ≤ เงินสด 4,200 ⇒ ผ่าน (ทิปจ่ายจากเงินสด) · ทิป 500 > เงินสด 300 ⇒ VALIDATION
    const r2 = fx || !X ? null : await cs(saleIn(k2, [["ของ G8 เครดิต", 10_000]], [{ type: "STORE_CREDIT", amountSatang: 6_000 }, cash(4_200)], { ...memberOf(X), tipSatang: 200 }));
    const k3 = key("g8");
    const r3 = fx || !X ? null : await cs(saleIn(k3, [["ของ G8 เครดิต2", 10_000]], [{ type: "STORE_CREDIT", amountSatang: 10_200 }, cash(300)], { ...memberOf(X), tipSatang: 500 }));
    if (!refused(r3, "VALIDATION") || (await saleByKey(k3))) p.push(`เครดิต+ทิปเกินเงินสด → ${codeOf(r3)}`);
    if (!ok(r2)) p.push(`เครดิต+ทิปจากเงินสด (ควรผ่าน) → ${codeOf(r2)} ${short(r2?.message ?? "", 60)}`);
    chk("G8", p.length === 0, "VALIDATION เมื่อทิป > ส่วนเงินสด/ธนาคาร", FXB(joinP(p)));
  }
  // ORACLE-ADD ผู้คุม 14 ต.ค. (fix 1 · H2): ตัวนับ PIN ผิดเป็นอะตอมมิก ◂
  {
    const p: string[] = [];
    if (fx || !GC.PN) p.push("fixture");
    else {
      const keys = Array.from({ length: 20 }, () => key("g9"));
      const pins = Array.from({ length: 20 }, (_, i) => String(100000 + i * 7919).slice(-6)).map((x) => (x === GC.PN.pin ? "000001" : x));
      const rs = await Promise.all(keys.map((k, i) => cs(saleIn(k, [["ของ G9", 1_000]], [gcPay(1_000, "PN", pins[i])]))));
      const codes = rs.map(codeOf);
      const c = await card("PN");
      const nSale = await P.posSale.count({ where: { tenantId: T, idempotencyKey: { in: keys } } });
      if (c?.pinFailedCount !== 5 || !codes.includes("GIFT_CARD_LOCKED") || codes.some((x) => x !== "GIFT_CARD_PIN" && x !== "GIFT_CARD_LOCKED") || nSale !== 0 || c?.balanceSatang !== 30_000)
        p.push(`ตัวนับ ${c?.pinFailedCount} · ${[...new Set(codes)].join(",")} · บิล ${nSale} · ยอด ${c?.balanceSatang}`);
    }
    chk("G9", p.length === 0, "ตัวนับ 5 · LOCKED · 0 บิล", FXB(joinP(p)));
  }
  // ORACLE-ADD ผู้คุม 14 ต.ค. (fix 2): จองสิทธิ์ก่อนเทียบ PIN — คลื่นใหญ่ที่มี PIN ถูก 1 ใบ ◂
  {
    const p: string[] = [];
    if (fx || !GC.PX) p.push("fixture");
    else {
      const keys = Array.from({ length: 50 }, () => key("g11"));
      const pins = keys.map((_, i) => (i === 20 ? GC.PX.pin : String(200000 + i * 7907).slice(-6) === GC.PX.pin ? "000002" : String(200000 + i * 7907).slice(-6)));
      const rs = await Promise.all(keys.map((k, i) => cs(saleIn(k, [["ของ G11", 1_000]], [gcPay(1_000, "PX", pins[i])]))));
      const codes = rs.map(codeOf);
      const c = await card("PX");
      const bills = await P.posSale.count({ where: { tenantId: T, idempotencyKey: { in: keys } } });
      const nonLocked = codes.filter((x) => x !== "GIFT_CARD_LOCKED").length;
      const odd = codes.filter((x) => !["GIFT_CARD_LOCKED", "GIFT_CARD_PIN", "OK"].includes(x));
      if (Number(c?.pinFailedCount) > 5 || bills > 1 || nonLocked > (bills ? 10 : 5) || odd.length || !codes.includes("GIFT_CARD_LOCKED"))
        p.push(`ตัวนับ ${c?.pinFailedCount} · บิล ${bills} · ไม่ใช่ LOCKED ${nonLocked} · อื่น ${[...new Set(odd)].join(",") || "-"}`);
    }
    chk("G11", p.length === 0, "ตัวนับ ≤ 5 · ไม่ใช่ LOCKED ≤ 5 (≤ 10 ถ้ามีบิล) · บิล ≤ 1", FXB(joinP(p)));
  }
  // ORACLE-ADD ผู้คุม 14 ต.ค. (fix 1 · H6): ส่งซ้ำแบบไม่มี PIN ได้เฉพาะคีย์ที่มีบิลแล้ว ◂
  {
    const p: string[] = [];
    if (fx || !GC.PL) p.push("fixture");
    else {
      const cart: Any = { lines: [{ name: `ของ G10 ${RAND}`, qty: 1, unitPriceSatang: 4_000 }] };
      const q = await call(regMod, "quoteRegisterCart", ctxOf("A"), owner, cart);
      const exp = Number(q?.grandTotalSatang ?? 4_000);
      const sub = (k: string, gc: Any) => call(regMod, "submitRegisterSale", ctxOf("A", DEV1), owner, { ...cart, idempotencyKey: k, expectedGrandTotalSatang: exp, payMethods: [{ type: "GIFT_CARD", amountSatang: 4_000, giftCard: gc }] });
      const k1 = key("g10");
      const a = await sub(k1, { number: GC.PL.number, pin: GC.PL.pin });
      const b = a?.ok === true ? await sub(k1, { number: GC.PL.number }) : null;
      if (a?.ok !== true || b?.ok !== true || b.saleId !== a.saleId) p.push(`ครั้งแรก ${codeOf(a)} · ซ้ำไม่มี PIN ${codeOf(b)} ${b?.saleId === a?.saleId ? "" : "บิลต่าง"}`);
      if ((await card("PL"))?.balanceSatang !== 6_000 || (await txns(GC.PL.id, "USE")).length !== 1) p.push(`บัตร ${(await card("PL"))?.balanceSatang} (คาด 6000) · USE ${(await txns(GC.PL.id, "USE")).length}`);
      const k2 = key("g10");
      const c = await sub(k2, { number: GC.PL.number });
      if (!refused(c, "VALIDATION") || (await saleByKey(k2))) p.push(`คีย์ใหม่ไม่มี PIN → ${codeOf(c)}`);
    }
    chk("G10", p.length === 0, "ซ้ำไม่มี PIN = บิลเดิม · ตัดครั้งเดียว · คีย์ใหม่ VALIDATION", FXB(joinP(p)));
  }
  // ORACLE-ADD ผู้คุม 14 ต.ค. (fix 3): คีย์เดียวกันแต่บัตรคนละใบ = คำขอคนละอัน ◂
  {
    const p: string[] = [];
    if (fx || !GC.PY || !GC.PZ) p.push("fixture");
    else {
      const z0 = await card("PZ");
      const nz0 = (await txns(GC.PZ.id)).length;
      const cart: Any = { lines: [{ name: `ของ G12 ${RAND}`, qty: 1, unitPriceSatang: 3_000 }] };
      const q = await call(regMod, "quoteRegisterCart", ctxOf("A"), owner, cart);
      const exp = Number(q?.grandTotalSatang ?? 3_000);
      const sub = (k: string, kk: string) => call(regMod, "submitRegisterSale", ctxOf("A", DEV1), owner, { ...cart, idempotencyKey: k, expectedGrandTotalSatang: exp, payMethods: [{ type: "GIFT_CARD", amountSatang: 3_000, giftCard: { number: GC[kk].number, pin: GC[kk].pin } }] });
      const k1 = key("g12");
      const a = await sub(k1, "PY");
      const b = a?.ok === true ? await sub(k1, "PZ") : null;
      if (a?.ok !== true || !refused(b, "IDEMPOTENCY_CONFLICT")) p.push(`หน้าขาย: ครั้งแรก ${codeOf(a)} · บัตรอื่นคีย์เดิม ${codeOf(b)}`);
      const k2 = key("g12");
      const c = await cs(saleIn(k2, [["ของ G12 ตรง", 2_000]], [gcPay(2_000, "PY")]));
      const d = ok(c) ? await cs(saleIn(k2, [["ของ G12 ตรง", 2_000]], [gcPay(2_000, "PZ")])) : null;
      if (!ok(c) || !refused(d, "IDEMPOTENCY_CONFLICT")) p.push(`createSale: ครั้งแรก ${codeOf(c)} · บัตรอื่นคีย์เดิม ${codeOf(d)}`);
      const z1 = await card("PZ");
      if (z1?.balanceSatang !== z0?.balanceSatang || z1?.pinFailedCount !== z0?.pinFailedCount || (await txns(GC.PZ.id)).length !== nz0) p.push(`บัตร PZ ถูกแตะ ${z0?.balanceSatang}→${z1?.balanceSatang} · ตัวนับ ${z0?.pinFailedCount}→${z1?.pinFailedCount}`);
    }
    chk("G12", p.length === 0, "CONFLICT ×2 · บัตรใบที่สองไม่ถูกแตะ", FXB(joinP(p)));
  }

  // ════════ A บัญชี ════════
  await drain();
  {
    const p: string[] = [];
    if (!g2Sale) p.push("ไม่มีบิล G2");
    else {
      const jv = await jvOf("PosSale", [g2Sale]);
      const net = netByCode(jv);
      const v = split(62_500);
      const want = { "1000": 30_000, "2110": 32_500, "4000": -v.baseSatang, "2200": -v.vatSatang };
      if (jv.length !== 1 || !balanced(jv) || short(Object.entries(net).sort()) !== short(Object.entries(want).sort())) p.push(`JV ${jv.length} ${short(net)} (คาด ${short(want)})`);
      const used = await jvOf("GiftCardTxn", [g2Txn]);
      if (used.length) p.push(`JV GIFTCARD_USED ของ USE แถวชำระ ${used.length}`);
    }
    chk("A1", p.length === 0, "Dr 1000 300 · Dr 2110 325 · Cr 4000+2200 ของ 625 · ไม่มี GIFTCARD_USED", FXB(joinP(p)));
  }
  let legacy: Any = null;
  {
    const p: string[] = [];
    const k = key("legacy");
    legacy = fx || !X || !GC.L ? null : await cs(saleIn(k, [["ของ legacy", 30_000]], [cash(20_000)], { ...memberOf(X), memberChoices: { giftCard: { number: GC.L.number, pin: GC.L.pin, satang: 10_000 } } }));
    if (!ok(legacy)) p.push(`createSale เดิม → ${codeOf(legacy)} ${short(legacy?.message ?? "", 80)}`);
    else {
      await drain();
      const row = await P.posSale.findUnique({ where: { id: legacy.saleId } });
      const jv = await jvOf("GiftCardTxn", [String(row?.giftCardTxnId ?? "")]);
      const net = netByCode(jv);
      if (jv.length !== 1 || net["2110"] !== 10_000 || net["4030"] !== -10_000) p.push(`GIFTCARD_USED ${jv.length} ${short(net)}`);
    }
    chk("A2", p.length === 0, "GIFTCARD_USED 1 · Dr 2110 / Cr 4030", FXB(joinP(p)));
  }
  {
    const p: string[] = [];
    const f = await card("F");
    if (f?.accountingDocId) p.push("บัตร F มี accountingDocId (ฟิกซ์เจอร์)");
    const k = key("a3");
    const r = fx ? null : await cs(saleIn(k, [["ของ A3", 20_000]], [gcPay(20_000, "F")]));
    if (!ok(r)) p.push(`createSale → ${codeOf(r)} ${short(r?.message ?? "", 80)}`);
    else {
      await drain();
      const net = netByCode(await jvOf("PosSale", [r.saleId]));
      if (net["2110"] !== 20_000) p.push(`JV 2110 ${net["2110"] ?? 0} ${short(net)}`);
    }
    chk("A3", p.length === 0, "Dr 2110 200 แม้ขายตอนปิดสวิตช์", FXB(joinP(p)));
  }
  {
    const p: string[] = [];
    const doc = g2Sale ? await P.accountDocument.findFirst({ where: { tenantId: T, refType: "PosSale", refId: g2Sale } }).catch(() => null) : null;
    if (!doc || doc.grandTotal !== 62_500) p.push(`เอกสาร ${doc ? doc.grandTotal : "ไม่มี"} (คาด 62500)`);
    chk("A4", !!g2Sale && p.length === 0, "ABB 625", FXB(g2Sale ? joinP(p) : "ไม่มีบิล G2"));
  }
  // ORACLE-ADD ผู้คุม 14 ต.ค. (CD-P29-1 (a)): PIN ไม่หลุดออกไปที่ใดเลย ◂
  {
    const p: string[] = [];
    const pins: string[] = [];
    const tok = (pin: string) => new RegExp(`(^|[^0-9])${pin}([^0-9]|$)`);
    const hits = (label: string, v: unknown) => {
      const str = (() => {
        try {
          return JSON.stringify(v) ?? "";
        } catch {
          return String(v);
        }
      })();
      for (const pin of pins) if (tok(pin).test(str)) p.push(`${label} มี PIN`);
    };
    let regRes: Any = null;
    if (fx || !GC.A || !GC.M) p.push("fixture");
    else {
      pins.push(GC.A.pin, GC.M.pin);
      const k = key("apin");
      const cart: Any = { lines: [{ name: `ของ PIN ${RAND}`, qty: 1, unitPriceSatang: 5_000 }] };
      const q = await call(regMod, "quoteRegisterCart", ctxOf("A"), owner, cart);
      regRes = await call(regMod, "submitRegisterSale", ctxOf("A", DEV1), owner, { ...cart, idempotencyKey: k, expectedGrandTotalSatang: Number(q?.grandTotalSatang ?? 5_000), payMethods: [{ type: "GIFT_CARD", amountSatang: 5_000, giftCard: { number: GC.M.number, pin: GC.M.pin } }] });
      if (regRes?.ok !== true) p.push(`หน้าขาย GIFT_CARD → ${codeOf(regRes)} ${short(regRes?.message ?? "", 60)}`);
      await drain();
      hits("คำตอบ submit", regRes);
      const saleIds = [String(regRes?.saleId ?? ""), g2Sale].filter(Boolean);
      for (const id of saleIds) {
        hits(`receiptPayload ${id.slice(-4)}`, await call(rcpMod, "receiptPayload", ctxOf("A"), owner, { saleId: id }));
        hits(`billDetail ${id.slice(-4)}`, await call(billsMod, "billDetail", ctxOf("A"), owner, { saleId: id, unitId: U.A }));
      }
      hits("registerGiftCardLookup", await call(tenderMod, "registerGiftCardLookup", ctxOf("A"), owner, { number: GC.A.number }));
      hits("AuditLog", await P.auditLog.findMany({ where: { tenantId: T } }).catch(() => []));
      hits("OutboxEvent", await P.outboxEvent.findMany({ where: { tenantId: T }, select: { type: true, payload: true } }).catch(() => []));
      hits("PosPayment", await P.$queryRawUnsafe(`SELECT * FROM "PosPayment" WHERE "tenantId" = $1`, T).catch(() => []));
      hits("GiftCardTxn", await P.giftCardTxn.findMany({ where: { tenantId: T } }).catch(() => []));
      const wrong = GC.E?.pin === "0000" ? "1111" : "0000";
      const bad = await cs(saleIn(key("apin"), [["ของ PIN ผิด", 1_000]], [gcPay(1_000, "A", wrong)]));
      pins.push(wrong);
      hits("ข้อความ GIFT_CARD_PIN", bad?.message ?? "");
      if (!g2Sale) p.push("ไม่มีบิล G2");
    }
    chk("APIN", p.length === 0 && pins.length > 0, "PIN 0 ที่ (audit · outbox · แถวชำระ · txn · DTO · ข้อความผิด)", FXB(joinP(p, `ค้น ${pins.length} PIN · 0 ที่`)));
  }

  // ════════ C แข่ง ════════
  type Settled = { ok: true; v: Any } | { ok: false; e: Any };
  const settle = (pr: Promise<Any>): Promise<Settled> => pr.then((v) => (v && v.ok === false ? ({ ok: false, e: v } as Settled) : ({ ok: true, v } as Settled)), (e) => ({ ok: false as const, e }));
  const holdLock = async (cardId: string, minWaiters: number, starts: (() => Promise<Any>)[], act: (tx: Any) => Promise<void>) => {
    let blocked = 0;
    let heldMs = 0;
    const box: { ps: Promise<Settled>[] } = { ps: [] };
    await P.$transaction(async (tx: Any) => {
      await tx.$queryRawUnsafe(`SELECT id FROM "GiftCard" WHERE id = $1 FOR UPDATE`, cardId);
      const pid = Number(((await tx.$queryRawUnsafe(`SELECT pg_backend_pid()::int AS p`)) as Any[])[0].p);
      box.ps = starts.map((s) => settle(s()));
      const t0 = Date.now();
      while (Date.now() - t0 < 20_000) {
        // ผู้รอชั้นที่ 2 (รอผู้รอคนแรกที่ถือคิวล็อกแถว) นับด้วย — pg_blocking_pids ของเขาคือผู้รอคนแรก ไม่ใช่ A
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
  const tenderReady = !!tenderMod && COL.pay;
  {
    const p: string[] = [];
    if (fx || !GC.D || !tenderReady) p.push(fx ? "fixture" : "ยังไม่มีของ P2.9");
    else {
      const k1 = key("c1");
      const k2 = key("c1");
      const h = await holdLock(GC.D.id, 2, [() => svc.createSale(saleIn(k1, [["ของ C1", 10_000]], [gcPay(10_000, "D")])), () => svc.createSale(saleIn(k2, [["ของ C1", 10_000]], [gcPay(10_000, "D")]))], async () => {});
      const okN = h.res.filter((x) => x.ok).length;
      const bad = h.res.filter((x) => !x.ok).map((x) => errCode((x as Any).e));
      const d = await card("D");
      const nSale = Number(!!(await saleByKey(k1))) + Number(!!(await saleByKey(k2)));
      if (h.blocked < 2 || okN !== 1 || bad[0] !== "GIFT_CARD_CHANGED" || d?.balanceSatang !== 0 || nSale !== 1 || (await txns(GC.D.id, "USE")).length !== 1) p.push(`กั้น ${h.blocked} · ok ${okN} · ${bad.join(",")} · บัตร ${d?.balanceSatang} · บิล ${nSale}`);
    }
    chk("C1", p.length === 0, "1 PAID · 1 GIFT_CARD_CHANGED · 0 · USE 1", joinP(p));
  }
  {
    const p: string[] = [];
    if (fx || !GC.K) p.push("fixture");
    else {
      const k = key("c2");
      const rs = await Promise.all(Array.from({ length: 10 }, () => settle(svc.createSale(saleIn(k, [["ของ C2", 15_000]], [gcPay(10_000, "K"), cash(5_000)])))));
      const ids = new Set(rs.filter((x) => x.ok).map((x) => (x as Any).v?.saleId));
      const errs = rs.filter((x) => !x.ok).map((x) => errCode((x as Any).e));
      const nSale = await P.posSale.count({ where: { tenantId: T, idempotencyKey: k } });
      const uses = await txns(GC.K.id, "USE");
      if (errs.length || ids.size !== 1 || nSale !== 1 || uses.length !== 1 || (await card("K"))?.balanceSatang !== 20_000) p.push(`ok ${rs.length - errs.length} ${errs.slice(0, 3).join(",")} · saleId ${ids.size} · บิล ${nSale} · USE ${uses.length}`);
    }
    chk("C2", p.length === 0, "1 บิล · USE 1", joinP(p));
  }
  {
    const p: string[] = [];
    if (fx || !GC.R || !tenderReady) p.push(fx ? "fixture" : "ยังไม่มีของ P2.9");
    else {
      const id = GC.R.id;
      const k = key("c3");
      const h = await holdLock(id, 1, [() => svc.createSale(saleIn(k, [["ของ C3", 3_000]], [gcPay(3_000, "R")]))], async (tx) => {
        await tx.giftCard.update({ where: { id }, data: { balanceSatang: { increment: 5_000 } } });
        await tx.giftCardTxn.create({ data: { tenantId: T, giftCardId: id, type: "RELOAD", satang: 5_000, balanceAfter: 15_000, refType: "QC", refId: null, idempotencyKey: `qc29-${RAND}-reload` } });
      });
      const use = (await txns(id, "USE"))[0];
      const c = await card("R");
      if (h.blocked < 1 || !h.res[0]?.ok || use?.balanceAfter !== 12_000 || c?.balanceSatang !== 12_000) p.push(`กั้น ${h.blocked} · ${h.res[0]?.ok ? "ok" : errCode((h.res[0] as Any)?.e)} · USE.balanceAfter ${use?.balanceAfter} · บัตร ${c?.balanceSatang} (คาด 12000)`);
    }
    chk("C3", p.length === 0, "balanceAfter 120", joinP(p));
  }
  {
    const p: string[] = [];
    const CUTOFF = new Date("2001-01-02T05:00:00.000Z");
    const foreign = await P.giftCard.count({ where: { status: "ACTIVE", expiresAt: { not: null, lte: CUTOFF }, NOT: { tenantId: T } } }).catch(() => -1);
    if (foreign) p.push(`ไม่รัน: บัตรร้านอื่น ${foreign} ใบถึงกำหนด ≤ 2001-01-02`);
    else if (fx || !GC.Q || !tenderReady) p.push(fx ? "fixture" : "ยังไม่มีของ P2.9");
    else {
      const id = GC.Q.id;
      await P.giftCard.update({ where: { id }, data: { expiresAt: null } });
      const k = key("c4");
      let exp: Promise<Settled> | null = null;
      const h = await holdLock(id, 1, [() => svc.createSale(saleIn(k, [["ของ C4", 4_000]], [gcPay(4_000, "Q")]))], async (tx) => {
        await tx.giftCard.update({ where: { id }, data: { expiresAt: new Date("2001-01-01T05:00:00.000Z") } });
      });
      exp = settle(gcMod.expireDue(CUTOFF));
      const e = await exp;
      const c = await card("Q");
      const uses = sum((await txns(id, "USE")).map((t) => Number(t.satang)));
      const exps = (await txns(id, "EXPIRE")).map((t) => Number(t.satang));
      const tOk = h.res[0]?.ok === true;
      const okInv = c?.status === "EXPIRED" && c?.balanceSatang === 0 && uses + sum(exps) === 10_000 && exps.length === 1 && (tOk ? exps[0] === 6_000 && !!(await saleByKey(k)) : errCode((h.res[0] as Any)?.e) === "GIFT_CARD_CHANGED" && exps[0] === 10_000 && !(await saleByKey(k)));
      if (h.blocked < 1 || !e.ok || !okInv) p.push(`กั้น ${h.blocked} · ใช้ ${tOk ? "ok" : errCode((h.res[0] as Any)?.e)} · expire ${e.ok ? "ok" : "ล้ม"} · บัตร ${c?.status}/${c?.balanceSatang} · USE ${uses} EXPIRE ${exps.join(",")}`);
    }
    chk("C4", p.length === 0, "USE + EXPIRE = 100 · EXPIRE = ยอดหลังใช้", joinP(p));
  }

  // ════════ V ย้อนครบ ════════
  let v1Sale = "";
  {
    const p: string[] = [];
    const k = key("v1");
    const r = fx || !X ? null : await cs(saleIn(k, [["ของ V1", 25_000]], [gcPay(20_000, "V"), cash(5_000)], memberOf(X)));
    if (!ok(r)) p.push(`createSale → ${codeOf(r)} ${short(r?.message ?? "", 80)}`);
    else {
      v1Sale = r.saleId;
      await drain();
      if ((await card("V"))?.status !== "DEPLETED") p.push("บัตร V ไม่ DEPLETED หลังขาย");
      const v = await voidBill(v1Sale);
      if (v?.ok === false) p.push(`void → ${codeOf(v)}`);
      await drain();
      const c = await card("V");
      const use = (await txns(GC.V.id, "USE"))[0];
      const ref1 = (await txns(GC.V.id, "REFUND")).length;
      const jv1 = await jvOf("PosSale", [v1Sale]);
      p.push(...(await replay("pos.sale.voided", (x) => x.saleId === v1Sale)));
      await drain();
      const ref2 = await txns(GC.V.id, "REFUND");
      const jv2 = await jvOf("PosSale", [v1Sale]);
      if (c?.balanceSatang !== 20_000 || c?.status !== "ACTIVE") p.push(`บัตร ${c?.balanceSatang}/${c?.status}`);
      if (ref1 !== 1 || ref2.length !== 1 || ref2[0]?.refId !== use?.id) p.push(`REFUND ${ref1}→${ref2.length}`);
      if (jv1.length !== 2 || jv2.length !== 2 || Object.keys(netByCode(jv2)).length || !jv1.some((e: Any) => (e.lines ?? []).some((l: Any) => l.account?.code === "2110"))) p.push(`JV ${jv1.length}→${jv2.length} net ${short(netByCode(jv2))}`);
    }
    chk("V1", p.length === 0, "REFUND 1 · ACTIVE 200 · JV สุทธิ 0 · เล่นซ้ำไม่เพิ่ม", FXB(joinP(p)));
  }
  {
    const p: string[] = [];
    const k = key("v2");
    const r = fx ? null : await cs(saleIn(k, [["ของ V2", 15_000]], [gcPay(15_000, "W")]));
    if (!ok(r)) p.push(`createSale → ${codeOf(r)} ${short(r?.message ?? "", 80)}`);
    else {
      await drain();
      const v = await voidBill(r.saleId);
      if (v?.ok === false) p.push(`void → ${codeOf(v)}`);
      await drain();
      const c = await card("W");
      if (c?.balanceSatang !== 15_000 || c?.status !== "ACTIVE") p.push(`บัตร W ${c?.balanceSatang}/${c?.status}`);
    }
    chk("V2", p.length === 0, "walk-in void → บัตรกลับ 150", FXB(joinP(p)));
  }
  {
    const p: string[] = [];
    if (!v1Sale) p.push("ไม่มีบิล V1");
    else {
      const b0 = (await card("V"))?.balanceSatang;
      const rel = await call(memMod, "releaseOnVoid", ctxM, { saleId: v1Sale, unitId: U.A });
      const b1 = (await card("V"))?.balanceSatang;
      if (rel?.ok === false || rel?.giftCardRefunded !== 0 || b0 !== b1) p.push(`releaseOnVoid ${short(rel)} · ยอด ${b0}→${b1}`);
    }
    chk("V3", p.length === 0, "giftCardRefunded 0 · ยอดเท่าเดิม", FXB(joinP(p)));
  }
  // V4–V7: บิลสองบรรทัด 400 + 225 = เงินสด 300 + บัตร N 325 (บัตร N 500 ขายเฉพาะชุดนี้)
  let vSale = "";
  let vRefundId = "";
  await sellCard("N", 50_000);
  {
    const p: string[] = [];
    const k = key("vb");
    const r = fx || !GC.N ? null : await cs(saleIn(k, [["ของ V-ใหญ่", 40_000], ["ของ V-เล็ก", 22_500]], [cash(30_000), gcPay(32_500, "N")]));
    if (!ok(r)) p.push(`บิล V → ${codeOf(r)} ${short(r?.message ?? "", 80)}`);
    else {
      vSale = r.saleId;
      await drain();
      const before = (await card("N"))?.balanceSatang;
      const ls = await lineId(vSale, "ของ V-เล็ก");
      const f = await refund(vSale, [{ lineId: ls, qty: 1 }], [{ type: "GIFT_CARD", amountSatang: 11_700 }, cash(10_800)]); // ORACLE-EDIT fix1 มติ 2 ◂
      if (f?.ok !== true) p.push(`คืน → ${codeOf(f)} ${short(f?.message ?? "", 80)}`);
      else {
        vRefundId = f.refund.id;
        await drain();
        const after = (await card("N"))?.balanceSatang;
        const refs = (await txns(GC.N.id, "REFUND")).filter((t) => t.idempotencyKey === `pos-refund-${vRefundId}-${GC.N.id}`);
        if (after !== (before ?? 0) + 11_700 || refs.length !== 1 || refs[0].satang !== 11_700) p.push(`บัตร ${before}→${after} · REFUND ${refs.length}`);
        const net = netByCode(await jvOf("PosSale", [vRefundId]));
        if (net["2110"] !== -11_700 || net["1000"] !== -10_800) p.push(`CN ${short(net)}`);
        const rp = (await paysOf(vRefundId)).find((x) => x.type === "GIFT_CARD");
        if (rp?.giftCardId !== GC.N.id) p.push("แถวคืนไม่มี giftCardId");
      }
    }
    chk("V4", p.length === 0, "REFUND 117 · CN Cr 2110 117 + Cr 1000 108", FXB(joinP(p)));
  }
  {
    const p: string[] = [];
    if (!vSale) p.push("ไม่มีบิล V");
    else {
      const b0 = (await card("N"))?.balanceSatang;
      const d0 = (await refundDocs(vSale)).length;
      const lb = await lineId(vSale, "ของ V-ใหญ่");
      const f = await refund(vSale, [{ lineId: lb, qty: 1 }], [{ type: "GIFT_CARD", amountSatang: 40_000 }]);
      if (!refused(f, "REFUND_METHOD_INVALID")) p.push(`เกินส่วนบัตร → ${codeOf(f)}`);
      if ((await refundDocs(vSale)).length !== d0 || (await card("N"))?.balanceSatang !== b0) p.push("มีการเขียน");
    }
    chk("V5", p.length === 0, "REFUND_METHOD_INVALID · ไม่เขียน", FXB(joinP(p)));
  }
  {
    const p7: string[] = [];
    const p6: string[] = [];
    if (!vSale) p6.push("ไม่มีบิล V");
    else {
      // V7: ใช้บัตร N ที่บิลอื่น 50 ก่อนคืนครั้งหลัง
      const ko = key("v7");
      const o = await cs(saleIn(ko, [["ของ V7", 5_000]], [gcPay(5_000, "N")]));
      if (!ok(o)) p7.push(`ใช้บัตรที่บิลอื่น → ${codeOf(o)}`);
      const b0 = Number((await card("N"))?.balanceSatang);
      const lb = await lineId(vSale, "ของ V-ใหญ่");
      const f = await refund(vSale, [{ lineId: lb, qty: 1 }], [{ type: "GIFT_CARD", amountSatang: 20_800 }, cash(19_200)]); // ORACLE-EDIT fix1 มติ 2 ◂
      if (f?.ok !== true) p6.push(`คืนส่วนที่เหลือ → ${codeOf(f)} ${short(f?.message ?? "", 80)}`);
      else {
        await drain();
        const b1 = Number((await card("N"))?.balanceSatang);
        if (b1 !== b0 + 20_800) p7.push(`ยอด ${b0}→${b1} (คาด +20800)`);
        const refundedToCard = sum((await txns(GC.N.id, "REFUND")).map((t) => Number(t.satang)));
        if (refundedToCard !== 32_500) p6.push(`คืนเข้าบัตรรวม ${refundedToCard} (คาด 32500)`);
        if ((await P.posSale.findUnique({ where: { id: vSale } }))?.status !== "REFUNDED") p6.push("บิลไม่ REFUNDED");
        p6.push(...(await replay("pos.sale.refunded", (x) => [x.refundId, x.saleId, x.refundSaleId].includes(f.refund.id))).filter((e) => !e.startsWith("ไม่พบ")));
        await drain();
        if (Number((await card("N"))?.balanceSatang) !== b1) p6.push("เล่นซ้ำแล้วบัตรเพิ่ม");
      }
    }
    chk("V6", p6.length === 0, "REFUNDED · คืนเข้าบัตร 325 · ซ้ำไม่เพิ่ม", FXB(joinP(p6)));
    chk("V7", !!vSale && p7.length === 0, "ยอด = ปัจจุบัน + 208", FXB(vSale ? joinP(p7) : "ไม่มีบิล V"));
  }
  {
    const p: string[] = [];
    for (const [k, how] of [["Z", "suspend"], ["Y", "expire"]] as const) {
      const ks = key("v8");
      const r = fx || !GC[k] ? null : await cs(saleIn(ks, [[`ของ V8 ${k}`, 10_000]], [gcPay(10_000, k)]));
      if (!ok(r)) {
        p.push(`บิล ${k} → ${codeOf(r)}`);
        continue;
      }
      await drain();
      if (how === "suspend") await step("ระงับ Z", () => gcMod.suspend(gctx, owner, { number: GC.Z.number, reason: "QC V8" }));
      else await P.giftCard.update({ where: { id: GC.Y.id }, data: { expiresAt: new Date(Date.now() - 60_000) } });
      const b0 = (await card(k))?.balanceSatang;
      const l = await lineId(r.saleId, `ของ V8 ${k}`);
      const f = await refund(r.saleId, [{ lineId: l, qty: 1 }], [{ type: "GIFT_CARD", amountSatang: 10_000 }]);
      if (!refused(f, "REFUND_METHOD_INVALID")) p.push(`${how} → ${codeOf(f)}`);
      if ((await refundDocs(r.saleId)).length || (await card(k))?.balanceSatang !== b0) p.push(`${how}: มีการเขียน`);
    }
    chk("V8", p.length === 0, "REFUND_METHOD_INVALID ×2 · ไม่เขียน", FXB(joinP(p)));
  }
  {
    const p: string[] = [];
    const k = key("v9");
    const r = fx || !GC.H ? null : await cs(saleIn(k, [["ของ V9", 20_000]], [gcPay(10_000, "H"), cash(10_000)]));
    if (!ok(r)) p.push(`บิล → ${codeOf(r)}`);
    else {
      await drain();
      const l = await lineId(r.saleId, "ของ V9");
      const b0 = Number((await card("H"))?.balanceSatang);
      const rs = await Promise.all([0, 1].map(() => refund(r.saleId, [{ lineId: l, qty: 1 }], [{ type: "GIFT_CARD", amountSatang: 10_000 }, cash(10_000)])));
      const okN = rs.filter((x) => x?.ok === true).length;
      const codes = rs.filter((x) => x?.ok !== true).map(codeOf);
      const b1 = Number((await card("H"))?.balanceSatang);
      if (okN !== 1 || codes[0] !== "REFUND_EXCEEDS" || b1 !== b0 + 10_000) p.push(`ok ${okN} · ${codes.join(",")} · บัตร ${b0}→${b1}`);
    }
    chk("V9", p.length === 0, "1 ok · REFUND_EXCEEDS · +100 ครั้งเดียว", FXB(joinP(p)));
  }
  // ORACLE-ADD ผู้คุม 14 ต.ค. (fix 1 · H1): เพดานคืนเป็นเงิน = ส่วนที่จ่ายเป็นเงิน · บัตรใช้ไม่ได้ ⇒ เครดิตร้าน (สมาชิก) / เงินสดพร้อมเหตุผล (walk-in) ◂
  {
    const p: string[] = [];
    const refundR = (saleId: string, lineName: string, pays: Any[], extra: Any = {}) =>
      lineId(saleId, lineName).then((l) => call(refundMod, "refundSale", ctxOf("A"), owner, { saleId, lines: [{ lineId: l, qty: 1 }], payMethods: pays, reasonCode: "CHANGED_MIND", idempotencyKey: key("rc"), ...extra }));
    if (fx || !GC.RC1 || !GC.RC2 || !GC.RC3 || !X) p.push("fixture");
    else {
      // (a) walk-in 100% บัตร → คืนเงินสด
      const a = await cs(saleIn(key("rc1"), [["ของ RC1", 50_000]], [gcPay(50_000, "RC1")]));
      if (!ok(a)) p.push(`บิล a → ${codeOf(a)}`);
      else {
        const r = await refundR(a.saleId, "ของ RC1", [cash(50_000)]);
        if (!refused(r, "REFUND_METHOD_INVALID") || (await refundDocs(a.saleId)).length) p.push(`a: บัตร 100% คืนเงินสด → ${codeOf(r)}`);
      }
      // (b) สมาชิก X · บัตรถูกระงับ → เงินสดไม่ได้ · เครดิตร้านได้
      const b = await cs(saleIn(key("rc2"), [["ของ RC2", 10_000]], [gcPay(10_000, "RC2")], memberOf(X)));
      if (!ok(b)) p.push(`บิล b → ${codeOf(b)}`);
      else {
        await drain();
        await step("ระงับ RC2", () => gcMod.suspend(gctx, owner, { number: GC.RC2.number, reason: "QC RC1" }));
        const c0 = Number((await scCard(X))[0]?.balanceSatang ?? 0);
        const r1 = await refundR(b.saleId, "ของ RC2", [cash(10_000)], { reasonCode: "OTHER", reason: "บัตรถูกระงับ" });
        if (!refused(r1, "REFUND_METHOD_INVALID")) p.push(`b: สมาชิก บัตรระงับ คืนเงินสด → ${codeOf(r1)}`);
        const r2 = await refundR(b.saleId, "ของ RC2", [{ type: "STORE_CREDIT", amountSatang: 10_000 }]);
        const c1 = Number((await scCard(X))[0]?.balanceSatang ?? 0);
        if (r2?.ok !== true || c1 !== c0 + 10_000) p.push(`b: เครดิตร้าน → ${codeOf(r2)} ${c0}→${c1}`);
      }
      // (c) walk-in · บัตรถูกระงับ → เงินสดต้องมีเหตุผล · มีแล้ว ok + audit
      const c = await cs(saleIn(key("rc3"), [["ของ RC3", 10_000]], [gcPay(10_000, "RC3")]));
      if (!ok(c)) p.push(`บิล c → ${codeOf(c)}`);
      else {
        await drain();
        await step("ระงับ RC3", () => gcMod.suspend(gctx, owner, { number: GC.RC3.number, reason: "QC RC1" }));
        const r1 = await refundR(c.saleId, "ของ RC3", [cash(10_000)]);
        if (!refused(r1, "REASON_REQUIRED")) p.push(`c: ไม่มีเหตุผล → ${codeOf(r1)}`);
        const r2 = await refundR(c.saleId, "ของ RC3", [cash(10_000)], { reasonCode: "OTHER", reason: "บัตรถูกระงับ คืนเงินสด" });
        if (r2?.ok !== true) p.push(`c: มีเหตุผล → ${codeOf(r2)} ${short(r2?.message ?? "", 60)}`);
        else {
          const au = (await P.auditLog.findMany({ where: { tenantId: T, action: "pos.sale.refund", targetId: r2.refund.id } })) as Any[];
          if (!au.some((x) => Number(x.after?.cardShareToCash) === 10_000)) p.push(`audit ${short(au.map((x) => x.after), 120)}`);
        }
      }
    }
    // ORACLE-ADD ผู้คุม 14 ต.ค. (fix 2) (มติ 6): STAFF ไม่มีสิทธิ์คืน + PIN ผู้จัดการ → คืนส่วนบัตรที่ใช้ไม่ได้เป็นเงินสดได้ · audit ผู้กระทำ = ผู้จัดการ ◂
    if (!fx && GC.RC4) {
      let PIN = "";
      await step("RC1 สมาชิกภาพเจ้าของ (PIN ผู้จัดการ)", () => P.membership.create({ data: { userId: ownerId, tenantId: T, role: "OWNER", unitAccess: ["*"], permissions: {}, acceptedAt: new Date() } }));
      for (let i = 0; i < 4 && !PIN; i++) {
        const cand = `7${rnd(5)}`;
        const r = await call(staffPinMod, "setStaffPin", ctxOf("A"), owner, { userId: ownerId, pin: cand });
        if (r?.ok === true) PIN = cand;
      }
      const staff = { userId: cashierId, role: "STAFF", unitAccess: [U.A], permissions: { "pos.sale.create": true } };
      const d = await cs(saleIn(key("rc4"), [["ของ RC4", 10_000]], [gcPay(10_000, "RC4")]));
      if (!PIN || !ok(d)) p.push(`d: ${PIN ? "" : "ไม่มี PIN ผู้จัดการ · "}บิล ${codeOf(d)}`);
      else {
        await drain();
        await step("ระงับ RC4", () => gcMod.suspend(gctx, owner, { number: GC.RC4.number, reason: "QC RC1 d" }));
        const l = await lineId(d.saleId, "ของ RC4");
        const r = await call(refundMod, "refundSale", ctxOf("A"), staff, { saleId: d.saleId, lines: [{ lineId: l, qty: 1 }], payMethods: [cash(10_000)], reasonCode: "OTHER", reason: "บัตรถูกระงับ ผู้จัดการอนุมัติ", idempotencyKey: key("rc4r"), managerPin: PIN, managerUserId: ownerId });
        if (r?.ok !== true) p.push(`d: STAFF + PIN ผู้จัดการ → ${codeOf(r)} ${short(r?.message ?? "", 60)}`);
        else {
          const au = (await P.auditLog.findMany({ where: { tenantId: T, action: "pos.sale.refund", targetId: r.refund.id } })) as Any[];
          if (!au.some((x) => x.actorId === ownerId && Number(x.after?.cardShareToCash) === 10_000)) p.push(`d: audit ${short(au.map((x) => ({ a: x.actorId === ownerId, c: x.after?.cardShareToCash })), 120)}`);
        }
      }
    }
    chk("RC1", p.length === 0, "a REFUND_METHOD_INVALID · b CASH ปฏิเสธ/STORE_CREDIT ok · c REASON_REQUIRED → ok + audit · d STAFF + PIN ผู้จัดการ ok", FXB(joinP(p)));
  }
  // ORACLE-ADD ผู้คุม 14 ต.ค. (fix 1 · H3): รวมสมาชิกที่มีเครดิตร้าน ◂
  const creditOf = async (cid: string, satang: number, k: string) =>
    step(`เครดิต ${k}`, () => P.$transaction((tx: Any) => memMod.issueStoreCredit(T, { systemId: S.MEM, customerId: cid, satang, idempotencyKey: `${TAG}-sc-${k}`, refundSaleId: `qc-${k}` }, tx)));
  const anyCard = async (cid: string): Promise<Any[]> => ((await P.$queryRawUnsafe(`SELECT id, "balanceSatang", status::text AS status, "ownerCustomerId" FROM "GiftCard" WHERE "tenantId" = $1 AND kind::text = 'STORE_CREDIT' AND id IN (SELECT "giftCardId" FROM "GiftCardTxn" WHERE "tenantId" = $1 AND "idempotencyKey" LIKE $2)`, T, `${TAG}-sc-${cid}%`)) as Any[]);
  {
    const p: string[] = [];
    if (fx || !C.MA || !C.MB) p.push("fixture");
    else {
      await creditOf(C.MA, 20_000, "MA");
      await creditOf(C.MB, 30_000, "MB");
      const cb = (await anyCard("MB"))[0];
      const mg = await call(memMod, "mergeMembers", ctxM, owner, { keepId: C.MA, mergeId: C.MB, confirm: "MERGE" });
      if (mg?.ok === false) p.push(`merge → ${codeOf(mg)} ${short(mg?.message ?? "", 60)}`);
      const keep = (await scCard(C.MA))[0];
      const gone = cb ? await cardById(cb.id) : null;
      const adj = cb && keep ? ((await P.giftCardTxn.findMany({ where: { tenantId: T, type: "ADJUST", refType: "MERGE", giftCardId: { in: [cb.id, keep.id] } } })) as Any[]) : [];
      if (Number(keep?.balanceSatang) !== 50_000 || gone?.balanceSatang !== 0 || gone?.status !== "DEPLETED" || gone?.ownerCustomerId !== null || adj.length !== 2) p.push(`ผู้เก็บ ${keep?.balanceSatang} · ใบรวม ${gone?.balanceSatang}/${gone?.status}/${gone?.ownerCustomerId ? "มีเจ้าของ" : "ไม่มี"} · ADJUST ${adj.length}`);
      const pay = await cs(saleIn(key("mg1"), [["ของ MG1", 50_000]], [{ type: "STORE_CREDIT", amountSatang: 50_000 }], memberOf(C.MA)));
      if (!ok(pay) || Number((await scCard(C.MA))[0]?.balanceSatang) !== 0) p.push(`ผู้เก็บจ่ายเครดิต → ${codeOf(pay)} ${short(pay?.message ?? "", 60)}`);
    }
    chk("MG1", p.length === 0, "500 · 0 DEPLETED ไม่มีเจ้าของ · ADJUST 2 · จ่ายได้", FXB(joinP(p)));
  }
  {
    const p: string[] = [];
    if (fx || !C.MC || !C.MD) p.push("fixture");
    else {
      await creditOf(C.MC, 10_000, "MC");
      await creditOf(C.MD, 30_000, "MD");
      const dCard = (await anyCard("MD"))[0];
      const bill = await cs(saleIn(key("mg2"), [["ของ MG2", 30_000]], [{ type: "STORE_CREDIT", amountSatang: 30_000 }], memberOf(C.MD)));
      if (!ok(bill)) p.push(`บิลเครดิต → ${codeOf(bill)}`);
      else {
        await drain();
        const mg = await call(memMod, "mergeMembers", ctxM, owner, { keepId: C.MC, mergeId: C.MD, confirm: "MERGE" });
        if (mg?.ok === false) p.push(`merge → ${codeOf(mg)}`);
        const v = await voidBill(bill.saleId);
        if (v?.ok === false) p.push(`void → ${codeOf(v)}`);
        await drain();
        const keep = (await scCard(C.MC))[0];
        const gone = dCard ? await cardById(dCard.id) : null;
        const refOnKeep = keep ? (await txns(keep.id, "REFUND")).filter((t) => t.refType === "GiftCardTxn") : [];
        if (Number(keep?.balanceSatang) !== 40_000 || gone?.balanceSatang !== 0 || refOnKeep.length !== 1) p.push(`ผู้เก็บ ${keep?.balanceSatang} (คาด 40000) · ใบที่ถูกรวม ${gone?.balanceSatang} · REFUND บนใบผู้เก็บ ${refOnKeep.length}`);
      }
    }
    chk("MG2", p.length === 0, "ผู้เก็บ +300 · ใบที่ถูกรวม 0", FXB(joinP(p)));
  }
  // ORACLE-ADD ผู้คุม 14 ต.ค. (fix 3): ผู้เก็บถูกรวมต่อระหว่างที่การคืนรอล็อกใบผู้เก็บ ◂
  {
    const p: string[] = [];
    if (fx || !C.MS || !C.MK || !C.MW) p.push("fixture");
    else {
      await creditOf(C.MS, 30_000, "MS");
      await creditOf(C.MK, 10_000, "MK");
      await creditOf(C.MW, 5_000, "MW");
      const kCard = (await anyCard("MK"))[0];
      const wCard = (await anyCard("MW"))[0];
      const bill = await cs(saleIn(key("mg3"), [["ของ MG3", 30_000]], [{ type: "STORE_CREDIT", amountSatang: 30_000 }], memberOf(C.MS)));
      if (!ok(bill) || !kCard || !wCard) p.push(`บิลเครดิต → ${codeOf(bill)}`);
      else {
        await drain();
        const mg = await call(memMod, "mergeMembers", ctxM, owner, { keepId: C.MK, mergeId: C.MS, confirm: "MERGE" });
        if (mg?.ok === false) p.push(`merge MS→MK → ${codeOf(mg)}`);
        const kId = String(kCard.id);
        const wId = String(wCard.id);
        // A ถือล็อก K · void + ระบายคิว (การคืนรอล็อก K) · ระหว่างนั้น A รวม K → W (แถวเดียวกับ foldStoreCreditOnMerge) แล้ว commit
        const h = await holdLock(kId, 1, [async () => { await voidBill(bill.saleId); await drain(1); }], async (tx) => {
          const kb = Number(((await tx.$queryRawUnsafe(`SELECT "balanceSatang" AS b FROM "GiftCard" WHERE id = $1`, kId)) as Any[])[0].b);
          await tx.$executeRawUnsafe(`SELECT id FROM "GiftCard" WHERE id = $1 FOR UPDATE`, wId);
          await tx.giftCard.update({ where: { id: wId }, data: { balanceSatang: { increment: kb } } });
          await tx.giftCard.update({ where: { id: kId }, data: { balanceSatang: 0, status: "DEPLETED", ownerCustomerId: null } });
          const wb = Number(((await tx.$queryRawUnsafe(`SELECT "balanceSatang" AS b FROM "GiftCard" WHERE id = $1`, wId)) as Any[])[0].b);
          await tx.giftCardTxn.create({ data: { tenantId: T, giftCardId: kId, type: "ADJUST", satang: kb, balanceAfter: 0, refType: "MERGE", refId: wId, idempotencyKey: `qc29-${RAND}-mg3-out` } });
          await tx.giftCardTxn.create({ data: { tenantId: T, giftCardId: wId, type: "ADJUST", satang: kb, balanceAfter: wb, refType: "MERGE", refId: kId, idempotencyKey: `qc29-${RAND}-mg3-in` } });
        });
        await drain();
        const k = await cardById(kId);
        const w = await cardById(wId);
        const refOnW = (await txns(wId, "REFUND")).filter((t) => t.refType === "GiftCardTxn");
        if (h.blocked < 1 || k?.balanceSatang !== 0 || w?.balanceSatang !== 45_000 || refOnW.length !== 1) p.push(`กั้น ${h.blocked} · K ${k?.balanceSatang} (คาด 0) · W ${w?.balanceSatang} (คาด 45000) · REFUND บน W ${refOnW.length}`);
      }
    }
    chk("MG3", p.length === 0, "W +300 · K 0 · REFUND บน W", FXB(joinP(p)));
  }
  // ORACLE-ADD ผู้คุม 14 ต.ค. (fix 1 · H4): void คืนเข้าบัตรที่หมดอายุแล้ว ⇒ REFUND + EXPIRE · 2110 สุทธิ 0 ◂
  {
    const p: string[] = [];
    const CUTOFF = new Date("2001-01-02T05:00:00.000Z");
    const foreign = await P.giftCard.count({ where: { status: "ACTIVE", expiresAt: { not: null, lte: CUTOFF }, NOT: { tenantId: T } } }).catch(() => -1);
    if (foreign) p.push(`ไม่รัน: บัตรร้านอื่น ${foreign} ใบถึงกำหนด ≤ 2001-01-02`);
    else if (fx || !GC.QQ) p.push("fixture");
    else {
      const id = GC.QQ.id;
      const bill = await cs(saleIn(key("c5"), [["ของ C5", 4_000]], [gcPay(4_000, "QQ")]));
      if (!ok(bill)) p.push(`บิล → ${codeOf(bill)}`);
      else {
        await drain();
        await P.giftCard.update({ where: { id }, data: { expiresAt: new Date("2001-01-01T05:00:00.000Z") } });
        await call(gcMod, "expireDue", CUTOFF);
        const v = await voidBill(bill.saleId);
        if (v?.ok === false) p.push(`void → ${codeOf(v)}`);
        await drain();
        p.push(...(await replay("pos.sale.voided", (x) => x.saleId === bill.saleId)));
        await drain();
        const c = await card("QQ");
        const all = await txns(id);
        const ref = all.filter((t) => t.type === "REFUND");
        const exp = all.filter((t) => t.type === "EXPIRE");
        const late = exp.filter((t) => t.idempotencyKey !== `giftcard-expire-${id}`);
        if (c?.status !== "EXPIRED" || c?.balanceSatang !== 0 || ref.length !== 1 || ref[0].satang !== 4_000 || late.length !== 1 || late[0].satang !== 4_000) p.push(`บัตร ${c?.status}/${c?.balanceSatang} · REFUND ${short(ref.map((t) => t.satang))} · EXPIRE ${short(exp.map((t) => t.satang))}`);
        const lateJv = late.length ? await jvOf("GiftCardTxn", [late[0].id]) : [];
        if (lateJv.length !== 1) p.push(`JV ของ EXPIRE หลัง void ${lateJv.length}`);
        const expJv = await jvOf("GiftCardTxn", exp.map((t) => t.id));
        const net = netByCode([...(await jvOf("GiftCard", [id])), ...(await jvOf("PosSale", [bill.saleId])), ...expJv]);
        if ((net["2110"] ?? 0) !== 0) p.push(`2110 สุทธิ ${net["2110"]} ${short(net)}`);
      }
    }
    chk("C5", p.length === 0, "EXPIRED 0 · REFUND 40 + EXPIRE 40 · JV 1 · 2110 สุทธิ 0", FXB(joinP(p)));
  }
  // ORACLE-ADD ผู้คุม 14 ต.ค. (fix 2): บัตรเลยวันหมดอายุแต่ยัง ACTIVE — void คืนยอดเข้าบัตร (ยังไม่หมดอายุทันที) · expireDue ถัดไปตัดทั้งก้อน ◂
  {
    const p: string[] = [];
    const CUTOFF = new Date("2001-01-02T05:00:00.000Z");
    const foreign = await P.giftCard.count({ where: { status: "ACTIVE", expiresAt: { not: null, lte: CUTOFF }, NOT: { tenantId: T } } }).catch(() => -1);
    if (foreign) p.push(`ไม่รัน: บัตรร้านอื่น ${foreign} ใบถึงกำหนด ≤ 2001-01-02`);
    else if (fx || !GC.QB) p.push("fixture");
    else {
      const id = GC.QB.id;
      const bill = await cs(saleIn(key("c5b"), [["ของ C5b", 10_000]], [gcPay(10_000, "QB")]));
      if (!ok(bill)) p.push(`บิล → ${codeOf(bill)}`);
      else {
        await drain();
        await P.giftCard.update({ where: { id }, data: { expiresAt: new Date("2001-01-01T05:00:00.000Z") } });
        const v = await voidBill(bill.saleId);
        if (v?.ok === false) p.push(`void → ${codeOf(v)}`);
        await drain();
        const c1 = await card("QB");
        const e1 = await txns(id, "EXPIRE");
        if (c1?.status !== "ACTIVE" || c1?.balanceSatang !== 30_000 || e1.length) p.push(`หลัง void ${c1?.status}/${c1?.balanceSatang} · EXPIRE ${e1.length} (คาด ACTIVE 30000 · 0)`);
        await call(gcMod, "expireDue", CUTOFF);
        const c2 = await card("QB");
        const e2 = await txns(id, "EXPIRE");
        if (c2?.status !== "EXPIRED" || c2?.balanceSatang !== 0 || e2.length !== 1 || e2[0]?.satang !== 30_000) p.push(`หลัง expireDue ${c2?.status}/${c2?.balanceSatang} · EXPIRE ${short(e2.map((t) => t.satang))}`);
        const net = netByCode([...(await jvOf("GiftCard", [id])), ...(await jvOf("PosSale", [bill.saleId])), ...(await jvOf("GiftCardTxn", e2.map((t) => t.id)))]);
        if ((net["2110"] ?? 0) !== 0) p.push(`2110 สุทธิ ${net["2110"]} ${short(net)}`);
      }
    }
    chk("C5b", p.length === 0, "void → ACTIVE 300 · expireDue → EXPIRE 300 · 2110 สุทธิ 0", FXB(joinP(p)));
  }
  // ORACLE-ADD ผู้คุม 14 ต.ค. (fix 2): คืนบิลเครดิตของสมาชิกที่ถูกรวมแล้ว → เครดิตของผู้เก็บ ◂
  {
    const p: string[] = [];
    if (fx || !C.ME || !C.MF) p.push("fixture");
    else {
      await creditOf(C.ME, 30_000, "ME");
      const bill = await cs(saleIn(key("rc2"), [["ของ RC2 ก", 10_000], ["ของ RC2 ข", 20_000]], [{ type: "STORE_CREDIT", amountSatang: 30_000 }], memberOf(C.ME)));
      if (!ok(bill)) p.push(`บิลเครดิต → ${codeOf(bill)}`);
      else {
        await drain();
        const mg = await call(memMod, "mergeMembers", ctxM, owner, { keepId: C.MF, mergeId: C.ME, confirm: "MERGE" });
        if (mg?.ok === false) p.push(`merge → ${codeOf(mg)}`);
        const b0 = Number((await scCard(C.MF))[0]?.balanceSatang ?? 0);
        const l = await lineId(bill.saleId, "ของ RC2 ก");
        const r = await refund(bill.saleId, [{ lineId: l, qty: 1 }], [{ type: "STORE_CREDIT", amountSatang: 10_000 }]);
        const b1 = Number((await scCard(C.MF))[0]?.balanceSatang ?? 0);
        if (r?.ok !== true || b1 !== b0 + 10_000) p.push(`คืน STORE_CREDIT → ${codeOf(r)} ${short(r?.message ?? "", 60)} · ผู้เก็บ ${b0}→${b1}`);
        if ((await scCard(C.ME)).length) p.push("มีเครดิตใบใหม่ของสมาชิกที่ถูกรวม");
      }
    }
    chk("RC2", p.length === 0, "เครดิตผู้เก็บ +100", FXB(joinP(p)));
  }

  // ════════ R ตัวอ่าน / ช่องจอชำระ ════════
  {
    const p: string[] = [];
    const cardOf = (pays: Any[], t: string) => (pays ?? []).find((x: Any) => x?.type === t)?.card;
    if (!g2Sale) p.push("ไม่มีบิล G2");
    else {
      const rc = await call(rcpMod, "receiptPayload", ctxOf("A"), owner, { saleId: g2Sale });
      const pays = rc?.receipt?.payments ?? rc?.payload?.payments ?? rc?.payments;
      const c = cardOf(pays, "GIFT_CARD");
      if (c?.kind !== "GIFT" || c?.numberMasked !== `GC-••••${GC.A.number.slice(-4)}` || c?.balanceAfterSatang !== 17_500) p.push(`ใบเสร็จ ${codeOf(rc)} ${short(c ?? pays, 160)}`);
      const bd = await call(billsMod, "billDetail", ctxOf("A"), owner, { saleId: g2Sale, unitId: U.A });
      const bc = cardOf(bd?.bill?.payments ?? bd?.payments, "GIFT_CARD");
      if (bc?.kind !== "GIFT" || bc?.balanceAfterSatang !== 17_500) p.push(`billDetail ${codeOf(bd)} ${short(bc, 100)}`);
    }
    if (!s3Sale) p.push("ไม่มีบิล S3");
    else {
      const rc = await call(rcpMod, "receiptPayload", ctxOf("A"), owner, { saleId: s3Sale });
      const c = cardOf(rc?.receipt?.payments ?? rc?.payload?.payments ?? rc?.payments, "STORE_CREDIT");
      if (c?.kind !== "STORE_CREDIT") p.push(`ใบเสร็จเครดิต ${short(c, 100)}`);
    }
    // บิลเครดิตร้านที่ยังมีชีวิตในกะ (บิล S3 ถูก void ใน S4) — แล้วอ่าน X
    const sk = key("r1");
    const sr = SHIFT && X ? await cs(saleIn(sk, [["ของ R1 เครดิต", 1_000]], [{ type: "STORE_CREDIT", amountSatang: 1_000 }], { ...memberOf(X), shiftId: SHIFT })) : null;
    if (!ok(sr)) p.push(`บิลเครดิตในกะ → ${codeOf(sr)} ${short(sr?.message ?? "", 60)}`);
    const x = SHIFT ? await call(shiftMod, "xReport", ctxOf("A", DEV1), owner, { shiftId: SHIFT }) : null;
    const rows = (x?.report?.byMethod ?? []) as Any[];
    if (!rows.some((m) => m.type === "STORE_CREDIT")) p.push(`X byMethod ${short(rows.map((m) => m.type))}`);
    chk("R1", p.length === 0, "card บนแถวชำระ · X มี STORE_CREDIT", FXB(joinP(p)));
  }
  {
    const p: string[] = [];
    const a = await call(tenderMod, "registerPayTenders", ctxOf("A"), owner);
    const b = await call(tenderMod, "registerPayTenders", ctxOf("B"), owner);
    const h = await call(tenderMod, "registerPayTenders", ctxOf("H"), owner);
    const ta = a?.tenders ?? a;
    const tb = b?.tenders ?? b;
    const th = h?.tenders ?? h;
    if (a?.ok !== true || ta?.giftCard?.enabled !== true || ta?.storeCredit?.enabled !== true || ta?.deposit?.visible !== true || ta?.deposit?.enabled !== false || ta?.roomCharge?.visible !== false) p.push(`A ${codeOf(a)} ${short(ta, 200)}`);
    if (b?.ok !== true || tb?.roomCharge?.visible !== false || tb?.storeCredit?.enabled !== false || tb?.giftCard?.enabled !== true) p.push(`B ${codeOf(b)} ${short(tb, 200)}`);
    if (h?.ok !== true || th?.roomCharge?.visible !== true || th?.roomCharge?.enabled !== false) p.push(`โรงแรม ${codeOf(h)} ${short(th, 200)}`);
    chk("R2", p.length === 0, "A: บัตร/เครดิตเปิด · มัดจำแสดงแต่ปิด · ห้องซ่อน · B: เครดิตปิด · โรงแรม: ห้องแสดงแต่ปิด", FXB(joinP(p)));
  }

  // ════════ L3 ทางเดิม ════════
  {
    const p: string[] = [];
    if (!ok(legacy)) p.push(`ไม่มีบิล legacy (${codeOf(legacy)})`);
    else {
      const row = await P.posSale.findUnique({ where: { id: legacy.saleId } });
      const pays = await paysOf(legacy.saleId);
      const use = row?.giftCardTxnId ? await P.giftCardTxn.findUnique({ where: { id: row.giftCardTxnId } }) : null;
      const ben = row?.memberBenefits as Any;
      if (legacy.grandTotalSatang !== 20_000 || row?.grandTotalSatang !== 20_000) p.push(`grand ${legacy.grandTotalSatang}/${row?.grandTotalSatang}`);
      if (!use || use.refType !== "PosSale" || use.refId !== legacy.saleId || use.satang !== 10_000) p.push(`USE ${short(use ? { refType: use.refType, satang: use.satang } : null)}`);
      if (pays.length !== 1 || pays[0].type !== "CASH" || pays[0].giftCardId) p.push(`แถวชำระ ${short(pays.map((x) => x.type))}`);
      if (!(ben?.lines ?? []).some((l: Any) => l.kind === "GIFTCARD" && l.discountSatang === 10_000)) p.push(`memberBenefits ${short(ben, 100)}`);
    }
    chk("L3", p.length === 0, "ทางส่วนลดเดิมเหมือนเดิม", FXB(joinP(p)));
  }
  // ════════ O ผู้เรียก createSale อื่น (CD-P29-1 (b)) ════════
  {
    const p: string[] = [];
    if (fx || !GC.K) p.push("fixture");
    else {
      const chans = (await call(chMod, "ensureUnitChannels", P, { tenantId: T, systemId: S.POS, unitId: U.A })) as Any;
      const chat = Array.isArray(chans) ? chans.find((c: Any) => c.code === "CHAT") : null;
      if (!chat) p.push(`ไม่มีช่องทาง CHAT (${codeOf(chans)})`);
      else {
        const ing = await call(orderMod, "ingestOrder", ctxOf("A"), owner, { channelId: chat.id, idempotencyKey: key("o1"), lines: [{ name: `ของออเดอร์ ${RAND}`, unitPriceSatang: 1_000, qty: 1 }], customer: { name: "คุณแชท" }, fulfilment: "PICKUP", paymentState: "PAY_ON_PICKUP" });
        const id = String(ing?.orderId ?? "");
        if (!id) p.push(`ingestOrder → ${codeOf(ing)} ${short(ing?.message ?? "", 60)}`);
        else {
          const acc = await call(orderMod, "acceptOrder", ctxOf("A", DEV1), owner, { id });
          if (acc?.ok !== true) p.push(`acceptOrder → ${codeOf(acc)}`);
          const b0 = (await card("K"))?.balanceSatang;
          const s0 = await P.posSale.count({ where: { tenantId: T } });
          for (const pm of [{ type: "GIFT_CARD", amountSatang: 1_000 }, { type: "GIFT_CARD", amountSatang: 1_000, giftCard: { number: GC.K.number, pin: GC.K.pin } }]) {
            const r = await call(orderMod, "payOrder", ctxOf("A", DEV1), owner, { id, idempotencyKey: key("o1p"), payMethods: [pm] });
            if (!refused(r, "VALIDATION")) p.push(`payOrder ${pm.giftCard ? "+giftCard" : ""} → ${codeOf(r)}`);
          }
          const o = await P.posOrder.findUnique({ where: { id } }).catch(() => null);
          if (!o || o.paymentState === "PAID" || o.saleId) p.push(`ออเดอร์ ${o?.paymentState}/${o?.saleId ? "มีบิล" : "-"}`);
          if ((await P.posSale.count({ where: { tenantId: T } })) !== s0 || (await card("K"))?.balanceSatang !== b0) p.push("มีบิล/บัตรถูกตัด");
        }
      }
    }
    chk("O1", p.length === 0, "VALIDATION ×2 · ออเดอร์ยังไม่จ่าย · ไม่มีบิล", FXB(joinP(p)));
  }
  {
    const p: string[] = [];
    const op = ((apiSales?.SALES_OPS ?? []) as Any[]).find((o) => o?.id === "sales.create");
    if (!op?.input?.safeParse) p.push("ไม่พบ op sales.create");
    else {
      const s0 = await P.posSale.count({ where: { tenantId: T } });
      for (const pm of [{ type: "GIFT_CARD", amountSatang: 1_000 }, { type: "GIFT_CARD", amountSatang: 1_000, giftCard: { number: GC.K?.number ?? "GC-0", pin: "123456" } }]) {
        const r = op.input.safeParse({ unitId: U.A, lines: [{ name: "API", qty: 1, unitPriceSatang: 1_000 }], payMethods: [pm] });
        if (r?.success !== false) p.push(`schema ยอมรับ ${short(pm)}`);
      }
      const okIn = op.input.safeParse({ unitId: U.A, lines: [{ name: "API", qty: 1, unitPriceSatang: 1_000 }], payMethods: [{ type: "CASH", amountSatang: 1_000 }] });
      if (okIn?.success !== true) p.push("ตัวควบคุมบวก: CASH ถูกปฏิเสธ");
      if ((await P.posSale.count({ where: { tenantId: T } })) !== s0) p.push("มีบิลเกิด");
    }
    chk("O2", p.length === 0, "schema ปฏิเสธ GIFT_CARD ×2 · CASH ผ่าน", FXB(joinP(p)));
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
  await n("giftCardTxn", () => P.giftCardTxn.count({ where: { tenantId: { in: TIDS }, idempotencyKey: { contains: RAND } } }));
  await n("posDevice", () => P.posDevice.count({ where: { tenantId: { in: TIDS }, deviceCode: { contains: `qc29${RAND}` } } }));
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
