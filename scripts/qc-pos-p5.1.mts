// QC — POS RUN ใบ P5.1 (oracle · red-before): เงิน / race / idempotency ข้ามใบ — hunter M-A "the bill"
//   ผู้เขียน = oracle writer P5.1 (บัญชี B · 23 ต.ค. 2026) · ฐาน session/pos 1b33a55c · ทรี p11 · branch wip/pos-p5.1-oracle
// requires: (ไม่ต้อง seed — ร้านชั่วคราวของข้อสอบเอง `posqc-p51-<rand>` · ระบบ/สาขา/ผู้ใช้/สินค้า/สมาชิก/บัตรสร้างในรอบ · ไม่แตะ posqc-coffee-*)
//
// สัญญา: ledger/wo-notes/pos-P5.1-hunt-MA.md (F1–F14 · id ที่เสนอ MA1–MA13) + ledger/pos-briefs/pos-brief-P5.md §4 P5.1 · §8 · §10 ·
//   ตาราง finding ↔ ข้อ · red-before · ชุดแก้ตามไฟล์เจ้าของ = ledger/wo-notes/pos-P5.1-oracle.md
//
// 🔴 กติกาข้อสอบ: ทุกข้อ MA "แดงบนโค้ดปัจจุบัน" (red-before) — เขียวเมื่อชุดแก้ของ builder ลงแล้วเท่านั้น
//    หนึ่งข้อต่อหนึ่ง finding ที่ยืนยันในโค้ดแล้ว (F1–F11) · F12 F13 ไม่ยืนยัน (พฤติกรรมตามมติ P3.4 R6/Q8 · R4 — ข้อสอบ SY4/SY14 ของ qc-pos-p3.4) · F14 = INFO
//    เงินทุกตัวเป็นสตางค์ (คาด vs จริง) · race = โปรเซสลูก 2 ตัว (สคริปต์นี้ --child …) แบบ P2.14 Q5/Q6 · MA7 = ล็อก advisory ของ createSale เอง (กำหนดได้แน่นอน)
//    ไม่มีด่าน SKIP (ของทุกชิ้นมีอยู่แล้ว — ข้อสอบนี้ทดสอบพฤติกรรม ไม่ใช่ชื่อใหม่) ⇒ QC_FORCE ไม่มีผล (pos-gates.json mode unforced)
//    --list = พิมพ์ทุก id ไม่แตะ DB ไม่ import อะไร · --no-db = ST1 ทะเบียน + ST2 self-test (ไม่โหลด prisma) ·
//    --self-test = พลิกตัวตัดสินทุกข้อด้วยตัวอย่าง "ถูก" (ต้องเขียว) กับ "ตัวเลขของ hunter" (ต้องแดง) — พิสูจน์ว่าแดงไม่ใช่ฮาร์เนสพัง
//    ฐาน = QC4 เท่านั้น (qc4.sh + assertQc4BeforeWrite) · เขียนเฉพาะร้านชั่วคราว (ลบทั้งร้านใน finally · Z1) · ลายนิ้วมือนอกร้านเท่าเดิม (Z2)
//    globalThis.fetch = ตัวกั้น (503 + นับ) · ไม่ apply migration · ไม่ reseed · ระบาย outbox เฉพาะแถวของร้านชั่วคราว (claim แบบ lease ของ core)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { spawn } from "node:child_process";
import { join } from "node:path";

const SUITE = "qc-pos-p5.1";
const ROOT = process.cwd();
const ARGV = process.argv.slice(2);
const LIST = ARGV.includes("--list");
const NODB = ARGV.includes("--no-db");
const SELFTEST = ARGV.includes("--self-test");
const CHILD = ARGV.includes("--child");
/** หมุดของใบ (env override · pos-oracle-check O3): ฐานที่ข้อสอบนี้เขียนเทียบ — ข้อสอบไม่ diff ไฟล์ (ไม่มีข้อ "ไฟล์ห้ามแตะ") */
const PIN = process.env.P51_PIN || "1b33a55c";
/** หมุดเลน (แยกจากหมุดใบ · บทเรียน CD-RP4) — สำรองไว้ให้ผู้คุม re-pin หลัง merge ชุดแก้ (วันนี้ไม่มีข้อใดใช้) */
const LANE_PIN = process.env.P51_LANE_PIN || PIN;

// ═════════════════════════ 0. ทะเบียนข้อสอบ ═════════════════════════
// batch = ชุดแก้ตามไฟล์เจ้าของ (โน้ต §4): A refund/service.ts · B ผู้เรียก booking/hotel/rental/ticket/shop/clinic/subscription · C action เดิม · D offline/bridge/VAT
type Def = { id: string; finding: string; sev: string; batch: string; title: string };
const D = (id: string, finding: string, sev: string, batch: string, title: string): Def => ({ id: `P5.1-${id}`, finding, sev, batch, title });
const CHECKS: readonly Def[] = [
  D("ST1", "-", "-", "-", "[no-db] ทะเบียน: MA1–MA11 ↔ F1–F11 ครบหนึ่งต่อหนึ่ง (id ไม่ซ้ำ · มี severity + ชุดแก้) · F12 F13 F14 มีเหตุผลที่ไม่เขียนข้อ · มี Z1 Z2"),
  D("ST2", "-", "-", "-", "[no-db · self-test] ตัวตัดสินทุกข้อ: ตัวอย่างที่ถูก = เขียว · ตัวเลขบั๊กของ hunter = แดง (แดงของรอบ DB ไม่ใช่ฮาร์เนสพัง)"),
  D("MA1", "F1", "HIGH", "A", "[F1] สมาชิก (ระดับ 95%) + ส่วนลดท้ายบิล 10,000 + ค่าบริการ 9,000 บนบรรทัด 100,000 → ยอดรับ 4,000 · คืนครบทั้งบิลได้ และ ยอดคืน ≤ ยอดที่รับ (hunter: คืน 9,000 vs รับ 4,000) — หรือบิลถูกปฏิเสธตั้งแต่ขาย"),
  D("MA2", "F2", "HIGH", "B", "[F2] มัดจำ 50,000 + บิลปิดของราคา 200,000 (โรงแรม · เช่า · จองคิว action) → Σ ยอดบิลรายได้ (ไม่นับใบรับมัดจำ POS_DEPOSIT) = 200,000 · GL รายได้ (4xxx) = 186,916 · VAT 2200 = 13,084 (hunter: 250,000 / 16,355)"),
  // ORACLE-EDIT ผู้คุม 23.10 (CD-P51-O7 · R1 ของชุด B F2): MA2b = probe PB ◂
  D("MA2b", "R1-F2", "LOW-MED", "B", "[R1 F2] ค่าห้อง/ค่าเช่า 30,000 · มัดจำ 50,000 (บิลปิดจ่ายจากมัดจำ) → refundStay / refundRental ⇒ บิลปิด VOIDED + ใบคืน CN ของใบรับ 1 ใบ = 50,000 (20,000 ที่เหลือ + 30,000 ที่ void คืนสภาพ) · มัดจำคงเหลือ 0 REFUNDED (R1: มัดจำกลับ OPEN 50,000 · ลูกค้าไม่ได้เงินคืน)"),
  D("MA3", "F3", "MED", "C", "[F3] registerSaleAction (หน้าขายเดิม): แคชเชียร์ STAFF (pos.sale.create เท่านั้น) ขายสินค้าราคา 12,000 ที่ 100 → error ไม่มีบิล · หน้าขายใหม่เปิด (registerV2) → action เดิมปฏิเสธ ไม่มีบิล · ตัวควบคุม: OWNER ราคาแคตตาล็อก (V2 ปิด) = ok"),
  D("MA4", "F4", "MED", "B", "[F4] จองคิว: รับมัดจำ → คืนมัดจำ (void) → รับมัดจำอีกครั้ง → ถ้าขึ้นว่าจ่ายแล้ว (depositPaidAt) ต้องมีบิล PAID ของมัดจำ = 50,000 (hunter: ชี้บิล VOIDED · เงิน 0 บนสมุด)"),
  // ORACLE-EDIT ผู้คุม 23.10 (CD-P51-O7 · R1 ของชุด B F1): MA4b = probe PA ◂
  D("MA4b", "R1-F1", "MED", "B", "[R1 F1] จองคิว: รับมัดจำ 50,000 → (ตัวควบคุม: รับซ้ำ = no-op ใบเดิม) → ใช้ 10,000 กับบิล → คืนมัดจำ (CN 40,000) → รับอีกครั้ง ⇒ ใบรับใหม่ PAID 50,000 · นัดขึ้นจ่ายแล้วชี้ใบใหม่ (มัดจำ OPEN) · มัดจำเดิม REFUNDED (R1: ได้ใบเดิมกลับ · มัดจำ 0)"),
  D("MA5", "F5", "MED", "B", "[F5] createSale ล้ม (SHIFT_REQUIRED: otherSources บังคับกะ ไม่มีกะเปิด) ระหว่าง ticket.markPaid / hotel.checkOut → ปลดบังคับกะแล้วลองซ้ำ → ต้องได้บิล PAID ของคีย์ ticket-sale-<id> / hotel-sale-<id> (hunter: สถานะ commit ไปแล้ว ลองซ้ำ = ไม่มีบิลตลอดไป)"),
  D("MA6", "F6", "MED", "B", "[F6] subscribe แพ็กเกจ 30,000 พร้อมกันจาก 2 โปรเซส (ลูกค้า 5 คน · คนละคู่แข่ง) → ทุกคน ACTIVE 1 แถว · บิล PAID 1 ใบ = 30,000 (hunter: 2 ACTIVE + 2 บิล = 60,000)"),
  D("MA7", "F7", "LOW-MED", "B", "[F7] ticket: คืนเงิน (cancelOrder) แทรกระหว่าง claim PAID กับ createSale (ถือล็อก advisory ของคีย์ ticket-sale-<id>) → ห้ามมีบิล PAID บนออเดอร์ที่ไม่ใช่ PAID"),
  D("MA8", "F8", "LOW", "A", "[F8] createSale ตรง: qty 0 · ราคาติดลบ · ส่วนลดบรรทัด > ราคา · ส่วนลดท้ายบิล > ยอดบรรทัด · แถวชำระติดลบ (CASH −100 + TRANSFER 200) → ปฏิเสธทุกกรณี ไม่มีบิล"),
  D("MA9", "F9", "LOW", "D", "[F9] บิล 4 × 100,000 ที่ VAT 7% (26,168) → อัตรา POS เปลี่ยนเป็น 10% → คืนบางส่วน 1+1+1 หน่วย: VAT ใบคืนแต่ละใบ = ส่วนของอัตราบิลเดิม (6,542 ±1) · Σ VAT ใบคืน ≤ VAT บิล (hunter: 9,091 ×3 = 27,273 > 26,168)"),
  D("MA10", "F10", "LOW", "D", "[F10] บิล 15,000 + ทิป 1,000: [CASH 11,000 · GIFT_CARD 5,000] · ไม่มีบัญชีพักทิปตอนระบาย → JV Dr 2110 = 5,000 (ยอดบัตรจริง) · Dr 1000 = 10,000 (hunter: ตัดทิปจากแถวบัตร ⇒ 2110 = 4,000 · 1000 = 11,000)"),
  // ORACLE-EDIT ผู้คุม 23.10 (CD-P51-O8 · O9 · R1 ของชุด B F3 F4 · fix batch C): MA12 MA12b MA13 MA14 ◂
  D("MA12", "R1-F3", "MED", "C", "[R1 F3 · CD-P51-O8a] จองคิว NO_SHOW (setStatusAction) ที่มีมัดจำ 50,000 ⇒ บิล \"มัดจำริบ — ไม่มาตามนัด\" 1 ใบ PAID 50,000 จ่ายด้วยแถว DEPOSIT อ้างใบรับ (ไม่มีเงินสด) · GL รายได้ 46,729 · VAT 2200 สุทธิ 3,271 (ครั้งเดียว) · 2110 สุทธิ 0 · มัดจำคงเหลือ 0 USED · audit pos.deposit.forfeit · NO_SHOW ซ้ำ = ไม่มีบิลที่สอง (R1: มัดจำ OPEN ตลอดไป · ไม่มีรายได้)"),
  D("MA12b", "R1-F3", "MED", "C", "[R1 F3 · CD-P51-O8b · ตัวควบคุมบวก] ยกเลิก (จองคิว CANCELLED · โรงแรม cancelReservation · เช่า cancelBooking) ⇒ มัดจำยัง OPEN 50,000 · ไม่มีบิลริบ (คนตัดสินที่หน้าขาย: คืนหรือริบ)"),
  D("MA13", "R1-F3", "MED", "C", "[R1 F3 · CD-P51-O8c] หน้าขาย registerForfeitDeposit ของมัดจำโมดูลที่ OPEN (โรงแรมยกเลิก): แคชเชียร์ไม่มี pos.sale.manage = PERMISSION_DENIED ไม่มีบิล · ผู้จัดการไม่ใส่เหตุผล = REASON_REQUIRED · ผู้จัดการ + เหตุผล = บิลริบ 50,000 · มัดจำ 0 USED · audit เก็บเหตุผล + ผู้ทำ · ริบซ้ำ = ไม่มีบิลที่สอง"),
  D("MA14", "R1-F4", "LOW", "C", "[R1 F4 · CD-P51-O9] ใบรับมัดจำของโมดูลจ่ายด้วยวิธีจริง (ค่าปริยาย TRANSFER · ไม่ใช่ DEPOSIT) · สรุปวัน: DEPOSIT = Σ แถว DEPOSIT อ้างใบรับบนบิลปิดเท่านั้น · TRANSFER = Σ แถว TRANSFER · probe GL: Dr 1010 ของใบรับโมดูล = Σ แถว TRANSFER ของใบรับ (R1: ใบรับลงแถว DEPOSIT ⇒ บรรทัด DEPOSIT ≈ 2× มัดจำ ไม่ตรง 1010)"),
  // ORACLE-EDIT ผู้คุม 23.10 (CD-P51-O10 · R1 ของชุด C F1–F9): MA12c MA12d MA12e MA12f MA13b MA14b ◂
  D("MA12c", "RC-F1", "HIGH", "C", "[RC F1 F2 · CD-P51-O10] สมาชิกระดับลด 10% · NO_SHOW ⇒ บิลริบเต็ม 50,000 (ไม่มีส่วนลดระดับ · memberAttachOnly) · มัดจำ 0 USED · แต้ม +0 · ยอดสะสมเท่าเดิม · ไม่มีไทม์ไลน์ PURCHASE ของบิลริบ (R1: PAYMENT_MISMATCH ไม่ริบ / สมาชิกได้แต้ม+ยอดสะสม)"),
  D("MA12d", "RC-F3", "MED", "C", "[RC F3 · CD-P51-O10] void บิลริบ → มัดจำกลับ OPEN → NO_SHOW อีกครั้ง ⇒ บิลริบใบใหม่ PAID (คีย์ -r1) · มัดจำ 0 USED (R1: ได้บิล VOIDED เดิมกลับ · มัดจำ OPEN)"),
  D("MA12e", "RC-F4", "MED", "C", "[RC F4 F10 · CD-P51-O10/O10b] NO_SHOW → CONFIRMED (setStatusAction) ⇒ บิลริบ VOIDED อัตโนมัติ + audit pos.sale.void 1 แถว (ผู้กด · เหตุผล \"นัดออกจาก NO_SHOW\" · source booking) · มัดจำ OPEN 50,000 · แล้ว DONE (setStatusAction) = แถว DEPOSIT 50,000 + CASH 150,000 · Σ บิลรายได้ของนัด = ราคา 200,000 (R1: บิลริบยัง PAID · DONE คิดเงินสด 200,000)"),
  D("MA12f", "RC-F5", "MED", "C", "[RC F5 · CD-P51-O10] ริบไม่สำเร็จ (บังคับกะช่องทางอื่น · ไม่มีกะเปิด) ทาง setStatusAction ⇒ จอจองแสดงเหตุผล (redirect ?err=) + OpsEvent WARN pos.deposit.forfeit_failed · มัดจำยัง OPEN (R1: เงียบ · ไม่มี log)"),
  // ORACLE-EDIT ผู้คุม 23.10 (CD-P51-O10b · R1 รอบ 2 F10): MA12g ◂
  D("MA12g", "RC-F10", "MED", "C", "[RC F10 · CD-P51-O10b] ริบที่หน้าขายก่อน (บิล POS) → NO_SHOW → CONFIRMED ⇒ ปฏิเสธการเปลี่ยนสถานะ (ข้อความ \"ริบที่เคาน์เตอร์แล้ว\" + เลขบิล) · นัดยัง NO_SHOW · บิลริบยัง PAID · มัดจำ USED (R1: void บิลของผู้จัดการเงียบ ๆ)"),
  D("MA13b", "RC-F1", "HIGH", "C", "[RC F1 F2 · CD-P51-O10] หน้าขาย ริบมัดจำของสมาชิกระดับลด 10% (ผู้จัดการ) ⇒ ok · บิลริบเต็ม 50,000 · แต้ม +0 · ยอดสะสมเท่าเดิม · ไม่มีไทม์ไลน์ PURCHASE (R1: INTERNAL PAYMENT_MISMATCH)"),
  D("MA14b", "RC-F8", "LOW", "C", "[RC F8b · CD-P51-O10] ใบรับโมดูลในกะ + แถวรับแบบเดิม DEPOSIT (ก่อน O9) ⇒ รายงานกะ = สรุปวัน = reportPayments: TRANSFER 50,000 · DEPOSIT 0 (R1: กะ/รายงานวิธีชำระนับเป็น DEPOSIT)"),
  D("MA11", "F11", "LOW", "D", "[F11] ตัวรับ pos.sale.paid ของบิลเดียวกันทำงานพร้อมกันจาก 2 โปรเซส (×3 บิล) → ไม่มีโปรเซสใดโยน (P2002 ของคีย์ JV = ลงแล้ว) · JV PAID 1 ต่อบิล"),
  D("Z1", "-", "-", "-", "QC4 คืนสภาพ: ร้านชั่วคราว 0 แถวทุกตารางที่มี tenantId (PosSale/Payment · JV/เอกสาร · Hotel/Rental/Booking/Ticket · MemberSubscription · GiftCard · OutboxEvent · AuditLog …) + Tenant + User/Session ของรอบ"),
  D("Z2", "-", "-", "-", "ลายนิ้วมือนอกร้านชั่วคราว (แถวที่มีก่อนรอบ · id:status ของ PosSale AccountDocument AccountJournalEntry MemberSubscription HotelReservation TicketOrder Appointment GiftCard) เท่าเดิม"),
];
/** finding ที่ไม่ได้เขียนข้อ — เหตุผลอ้าง file:line (โน้ต §2) */
const NOT_WRITTEN: readonly { finding: string; why: string }[] = [
  { finding: "F12", why: "ไม่ยืนยันเป็นบั๊ก: ซิงก์ที่ราคา snapshot ใดก็ได้ของเครื่อง (offline-sync.ts:368) = มติ P3.4 R6/Q8 (hybrid · drift บันทึก + audit) — ข้อสอบ SY4 ของ qc-pos-p3.4 คาด OK+drift · 48 ชม. = อายุเก็บ (:311) ไม่ใช่อายุรับ (24 ชม. offline-shared.ts:20 · :410)" },
  { finding: "F13", why: "ไม่ยืนยันเป็นบั๊ก: คีย์ออฟไลน์ = คีย์บิลออนไลน์ที่ commit แล้ว → DUPLICATE บิลเดิม (register.ts:2609-2610 · offline-sync.ts:521) = มติ P3.4 R4/R5 (กู้บิล unknown) — ข้อสอบ SY14 · ต่าง payload = REJECTED IDEMPOTENCY_CONFLICT อยู่แล้ว (SY22c)" },
  { finding: "F14", why: "INFO (ไม่มี severity): สลิปเก็บยอดของ client (payment-slip.ts:163/:223 → F15) · samePayload ไม่ดูส่วนลดท้ายบิล/คูปอง (service.ts:549) · ABB ก่อน claim (tax-invoice.ts:151/:164 · ops WARN N2) — บันทึกในโน้ต ไม่เขียนข้อ" },
];
// ORACLE-EDIT ผู้คุม 23.10 (CD-P51-O8/O9): MA_IDS = MA1–MA11 (↔ F1–F11) เท่านั้น — MA12–MA14 อยู่ใน C_IDS ◂
const MA_IDS = CHECKS.filter((c) => /^P5\.1-MA(\d+)$/.test(c.id) && Number(/\d+$/.exec(c.id)![0]) <= 11).map((c) => c.id);
/** ORACLE-EDIT ผู้คุม 23.10 (CD-P51-O7): ข้อจาก R1 ของชุด B (ไม่นับใน MA1–MA11 ↔ F1–F11) ◂ */
const R1_IDS = ["P5.1-MA2b", "P5.1-MA4b"];
/** ORACLE-EDIT ผู้คุม 23.10 (CD-P51-O8/O9 · fix batch C): ข้อของ R1 ชุด B F3 (ริบมัดจำ) + F4 (วิธีรับของใบรับโมดูล) ◂ */
const C_IDS = ["P5.1-MA12", "P5.1-MA12b", "P5.1-MA13", "P5.1-MA14"];
/** ORACLE-EDIT ผู้คุม 23.10 (CD-P51-O10 · R1 ของชุด C) ◂ */
const C2_IDS = ["P5.1-MA12c", "P5.1-MA12d", "P5.1-MA12e", "P5.1-MA12f", "P5.1-MA12g", "P5.1-MA13b", "P5.1-MA14b"]; // ORACLE-EDIT ผู้คุม 23.10 (CD-P51-O10b): + MA12g ◂

if (LIST) {
  console.log(`${SUITE} · PIN ${PIN} · LANE_PIN ${LANE_PIN} · ${CHECKS.length} ข้อ`);
  for (const c of CHECKS) console.log(`${c.id}\t${c.finding}\t${c.sev}\t${c.batch}\t${c.title}`);
  for (const n of NOT_WRITTEN) console.log(`(ไม่เขียนข้อ) ${n.finding}\t${n.why}`);
  process.exit(0);
}

// ═════════════════════════ 1. ผลตรวจ ═════════════════════════
const TITLE = new Map(CHECKS.map((c) => [c.id, c.title]));
const results = new Map<string, { ok: boolean; expected: string; actual: string }>();
const short = (v: unknown, n = 180): string => {
  let s: string;
  try {
    s = typeof v === "string" ? v : JSON.stringify(v);
  } catch {
    s = String(v);
  }
  s = s ?? String(v);
  return s.length > n ? `${s.slice(0, n)}…` : s;
};
function chk(id: string, ok: unknown, expected: unknown, actual: unknown): boolean {
  const full = id.startsWith("P5.1-") ? id : `P5.1-${id}`;
  const r = { ok: !!ok, expected: short(expected, 400), actual: short(actual, 900) };
  results.set(full, r);
  console.log(`${r.ok ? "✅" : "❌"} ${full} ${TITLE.get(full)?.slice(0, 110) ?? ""}`);
  if (!r.ok) console.log(`     คาด: ${r.expected}\n     จริง: ${r.actual}`);
  return r.ok;
}
const joinP = (p: string[], okText = "ครบ"): string => (p.length ? p.slice(0, 10).join(" · ") + (p.length > 10 ? ` …(+${p.length - 10})` : "") : okText);
const baht = (s: number) => (Number.isFinite(s) ? (s / 100).toLocaleString("en-US", { minimumFractionDigits: 2 }) : String(s));

// ═════════════════════════ 2. ตัวตัดสิน (บริสุทธิ์ — ใช้ทั้งรอบ DB และ self-test) ═════════════════════════
type Verdict = { ok: boolean; expected: string; actual: string };
const V = {
  /** F1 — ref: ยอดรับของบิล · ผลคืนครบ (ok · ยอดที่จ่ายออก) · หรือบิลถูกปฏิเสธตั้งแต่ขาย (รหัส) */
  MA1(x: { saleRefusedCode?: string | null; saleGrand: number; memberDiscount: number; refundOk: boolean; refundPaid: number; refundNote?: string }): Verdict {
    const expected = "คืนครบได้ และ ยอดคืน ≤ ยอดที่รับ (สตางค์) · หรือบิลถูกปฏิเสธตั้งแต่ขาย (BENEFITS_EXCEED_TOTAL/VALIDATION)";
    if (x.saleRefusedCode) {
      const ok = /BENEFIT|EXCEED|VALIDATION/.test(x.saleRefusedCode);
      return { ok, expected, actual: `บิลถูกปฏิเสธ ${x.saleRefusedCode}` };
    }
    const ok = x.memberDiscount > 0 && x.refundOk && x.refundPaid <= x.saleGrand;
    return { ok, expected, actual: `รับ ${x.saleGrand} · สิทธิ์สมาชิก ${x.memberDiscount} · คืน ${x.refundOk ? `จ่ายออก ${x.refundPaid}` : `ไม่สำเร็จ (${x.refundNote ?? "-"})`}${x.refundOk && x.refundPaid > x.saleGrand ? ` ⇒ จ่ายเกินที่รับ ${x.refundPaid - x.saleGrand}` : ""}` };
  },
  /** F2 — ต่อกรณี: ราคา · Σ ยอดบิลรายได้ · GL รายได้/VAT ที่ลงจริง (posted = มี JV ครบทุกบิล) */
  MA2(x: { cases: { name: string; price: number; base: number; vat: number; revenueGrand: number; glIncome: number; glVat: number; posted: boolean; note?: string }[] }): Verdict {
    const p: string[] = [];
    for (const c of x.cases) {
      const bad = c.revenueGrand !== c.price || !c.posted || c.glIncome !== c.base || c.glVat !== c.vat;
      p.push(`${c.name}: บิลรายได้ ${c.revenueGrand}/${c.price} · GL รายได้ ${c.posted ? c.glIncome : "ไม่ลง"}/${c.base} · VAT ${c.posted ? c.glVat : "-"}/${c.vat}${c.note ? ` (${c.note})` : ""}${bad ? " ✗" : " ✓"}`);
    }
    const ok = x.cases.length > 0 && x.cases.every((c) => c.revenueGrand === c.price && c.posted && c.glIncome === c.base && c.glVat === c.vat);
    return { ok, expected: "ทุกกรณี: Σ บิลรายได้ = ราคา · GL รายได้ = ฐานของราคา · VAT = VAT ของราคา", actual: joinP(p, "ไม่มีกรณี") };
  },
  // ORACLE-EDIT ผู้คุม 23.10 (CD-P51-O7): ตัวตัดสิน MA2b MA4b (R1 ของชุด B) ◂
  /** R1 F2 — ต่อกรณี: refund ok · บิลปิด VOIDED · ใบคืน CN ของใบรับ (จำนวน · ยอด) · มัดจำคงเหลือ/สถานะหลังระบายคิว */
  MA2b(x: { cases: { name: string; refundOk: boolean; refundNote?: string; voided: boolean; cnCount: number; cnSatang: number; left: number; depStatus: string | null; deposit: number }[] }): Verdict {
    const good = (c: { refundOk: boolean; voided: boolean; cnCount: number; cnSatang: number; left: number; depStatus: string | null; deposit: number }) => c.refundOk && c.voided && c.cnCount === 1 && c.cnSatang === c.deposit && c.left === 0 && c.depStatus === "REFUNDED";
    const ok = x.cases.length > 0 && x.cases.every(good);
    return { ok, expected: "ทุกกรณี: คืนเงิน ok · บิลปิด VOIDED · CN 1 ใบ = มัดจำทั้งหมด · คงเหลือ 0 REFUNDED", actual: joinP(x.cases.map((c) => `${c.name}: คืน ${c.refundOk ? "ok" : `ไม่สำเร็จ ${c.refundNote ?? ""}`} · บิล ${c.voided ? "VOIDED" : "ไม่ VOIDED"} · CN ${c.cnCount} ใบ ${c.cnSatang}/${c.deposit} · คงเหลือ ${c.left} ${c.depStatus ?? "-"}${good(c) ? " ✓" : " ✗"}`)) };
  },
  /** R1 F1 — ตัวควบคุม (รับซ้ำ = no-op ใบเดิม) · หลังใช้บางส่วน → คืน → รับใหม่ */
  MA4b(x: { ctlNoop: boolean; ctlSame: boolean; newReceipt: boolean; newStatus: string | null; newAmount: number; paidAt: boolean; linkedNew: boolean; linkedStatus: string | null; oldStatus: string | null; deposit: number }): Verdict {
    const ok = x.ctlNoop && x.ctlSame && x.newReceipt && x.newStatus === "PAID" && x.newAmount === x.deposit && x.paidAt && x.linkedNew && x.linkedStatus === "OPEN" && x.oldStatus === "REFUNDED";
    return {
      ok,
      expected: `ตัวควบคุม no-op ใบเดิม · รับใหม่ = ใบรับใหม่ PAID ${x.deposit} · นัดชี้ใบใหม่ (OPEN) · มัดจำเดิม REFUNDED`,
      actual: `ตัวควบคุม ${x.ctlNoop ? "noop" : "ไม่ noop"}/${x.ctlSame ? "ใบเดิม" : "ใบอื่น"} · รับใหม่ ${x.newReceipt ? "ใบใหม่" : "ใบเดิม"} ${x.newStatus ?? "-"} ${x.newAmount} · นัด ${x.paidAt ? "จ่ายแล้ว" : "ยังไม่จ่าย"} ชี้${x.linkedNew ? "ใบใหม่" : "ใบเดิม"} มัดจำ ${x.linkedStatus ?? "-"} · มัดจำเดิม ${x.oldStatus ?? "-"}`,
    };
  },
  // ORACLE-EDIT ผู้คุม 23.10 (CD-P51-O8/O9): ตัวตัดสิน MA12 MA12b MA13 MA14 ◂
  /** R1 F3 (O8a) — บิลริบของ NO_SHOW: จำนวน/สถานะ/ยอด/ชื่อบรรทัด/แถวจ่าย · GL · มัดจำ · audit · NO_SHOW ซ้ำ */
  MA12(x: { bills: number; status: string | null; grand: number; lineName: string | null; pays: string[]; glIncome: number; net2200: number; net2110: number; left: number; depStatus: string | null; audits: number; billsAfterRepeat: number; deposit: number; base: number; vat: number }): Verdict {
    const ok =
      x.bills === 1 && x.status === "PAID" && x.grand === x.deposit && x.lineName === "มัดจำริบ — ไม่มาตามนัด" && x.pays.join(",") === `DEPOSIT:${x.deposit}` &&
      x.glIncome === x.base && x.net2200 === x.vat && x.net2110 === 0 && x.left === 0 && x.depStatus === "USED" && x.audits === 1 && x.billsAfterRepeat === 1;
    return {
      ok,
      expected: `บิลริบ 1 ใบ PAID ${x.deposit} "มัดจำริบ — ไม่มาตามนัด" · แถว DEPOSIT:${x.deposit} เท่านั้น · GL รายได้ ${x.base} · 2200 สุทธิ ${x.vat} · 2110 สุทธิ 0 · มัดจำ 0 USED · audit 1 · NO_SHOW ซ้ำ = 1 ใบ`,
      actual: `บิลริบ ${x.bills} ใบ ${x.status ?? "-"} ${x.grand} "${x.lineName ?? "-"}" · แถว [${x.pays.join(",")}] · GL รายได้ ${x.glIncome} · 2200 สุทธิ ${x.net2200} · 2110 สุทธิ ${x.net2110} · มัดจำ ${x.left} ${x.depStatus ?? "-"} · audit ${x.audits} · หลังซ้ำ ${x.billsAfterRepeat} ใบ`,
    };
  },
  /** R1 F3 (O8b) — ตัวควบคุมบวก: ยกเลิกแล้วมัดจำยัง OPEN เต็ม · ไม่มีบิลริบ */
  MA12b(x: { cases: { name: string; cancelOk: boolean; depStatus: string | null; left: number; forfeitBills: number; deposit: number }[] }): Verdict {
    const good = (c: { cancelOk: boolean; depStatus: string | null; left: number; forfeitBills: number; deposit: number }) => c.cancelOk && c.depStatus === "OPEN" && c.left === c.deposit && c.forfeitBills === 0;
    const ok = x.cases.length === 3 && x.cases.every(good);
    return { ok, expected: "3 กรณี: ยกเลิก ok · มัดจำ OPEN เต็มยอด · ไม่มีบิลริบ", actual: joinP(x.cases.map((c) => `${c.name}: ยกเลิก ${c.cancelOk ? "ok" : "ไม่สำเร็จ"} · มัดจำ ${c.depStatus ?? "-"} ${c.left}/${c.deposit} · บิลริบ ${c.forfeitBills}${good(c) ? " ✓" : " ✗"}`), "ไม่มีกรณี") };
  },
  /** R1 F3 (O8c) — หน้าขาย ริบมัดจำ: สิทธิ์ · เหตุผลบังคับ · ผล · audit · ซ้ำ */
  // ORACLE-EDIT ผู้คุม 23.10 (CD-P51-O10 · RC F6 F9): + ผู้จัดการสาขาอื่นถูกปฏิเสธ · ค่าคอมฯ ACCRUE ของบิลริบ = 0 (ไม่ส่ง = ไม่ตัดสิน · self-test เดิม) ◂
  MA13(x: { cashier: string; cashierBills: number; noReason: string; noReasonBills: number; mgr: string; mgrBills: number; grand: number; left: number; depStatus: string | null; auditReason: string | null; reason: string; auditActorOk: boolean; againBills: number; deposit: number; otherBranch?: string; accrue?: number }): Verdict {
    const ok =
      x.cashier === "PERMISSION_DENIED" && x.cashierBills === 0 && x.noReason === "REASON_REQUIRED" && x.noReasonBills === 0 && x.mgr === "ok" && x.mgrBills === 1 &&
      x.grand === x.deposit && x.left === 0 && x.depStatus === "USED" && x.auditReason === x.reason && x.auditActorOk && x.againBills === 1 &&
      (x.otherBranch === undefined || /NOT_FOUND|PERMISSION_DENIED/.test(x.otherBranch)) && (x.accrue === undefined || x.accrue === 0);
    return {
      ok,
      expected: `แคชเชียร์ PERMISSION_DENIED บิล 0 · ผู้จัดการไม่มีเหตุผล REASON_REQUIRED บิล 0 · ผู้จัดการ ok บิล 1 = ${x.deposit} · มัดจำ 0 USED · audit เหตุผล "${x.reason}" + ผู้จัดการ · ซ้ำ = 1 ใบ`,
      actual: `แคชเชียร์ ${x.cashier} บิล ${x.cashierBills} · ไม่มีเหตุผล ${x.noReason} บิล ${x.noReasonBills} · ผู้จัดการ ${x.mgr} บิล ${x.mgrBills} ยอด ${x.grand} · มัดจำ ${x.left} ${x.depStatus ?? "-"} · audit "${x.auditReason ?? "-"}" ผู้ทำ ${x.auditActorOk ? "ตรง" : "ไม่ตรง"} · ซ้ำ ${x.againBills} ใบ${x.otherBranch === undefined ? "" : ` · ผู้จัดการสาขาอื่น ${x.otherBranch}`}${x.accrue === undefined ? "" : ` · ค่าคอมฯ ACCRUE ${x.accrue}`}`,
    };
  },
  // ORACLE-EDIT ผู้คุม 23.10 (CD-P51-O10): ตัวตัดสิน MA12c MA12d MA12e MA12f MA13b MA14b ◂
  /** RC F1 F2 — บิลริบของสมาชิกระดับ: ยอดเต็ม · ไม่มีส่วนลด · มัดจำ · แต้ม · ยอดสะสม · ไทม์ไลน์ (ใช้ทั้ง MA12c NO_SHOW และ MA13b หน้าขาย) */
  MA12c(x: { forfeit: string; bills: number; grand: number; discount: number; left: number; depStatus: string | null; points: number; spentDelta: number; timeline: number; tierApplied: boolean; deposit: number }): Verdict {
    const ok = x.tierApplied && x.forfeit === "ok" && x.bills === 1 && x.grand === x.deposit && x.discount === 0 && x.left === 0 && x.depStatus === "USED" && x.points === 0 && x.spentDelta === 0 && x.timeline === 0;
    return {
      ok,
      expected: `สมาชิกระดับ 10% · ริบ ok · บิล 1 ใบ ${x.deposit} ส่วนลด 0 · มัดจำ 0 USED · แต้ม 0 · ยอดสะสม +0 · ไทม์ไลน์ 0`,
      actual: `ระดับ ${x.tierApplied ? "ตั้งแล้ว" : "ตั้งไม่ได้ (fixture)"} · ริบ ${x.forfeit} · บิล ${x.bills} ใบ ${x.grand} ส่วนลด ${x.discount} · มัดจำ ${x.left} ${x.depStatus ?? "-"} · แต้ม ${x.points} · ยอดสะสม +${x.spentDelta} · ไทม์ไลน์ ${x.timeline}`,
    };
  },
  MA13b(x: { forfeit: string; bills: number; grand: number; discount: number; left: number; depStatus: string | null; points: number; spentDelta: number; timeline: number; tierApplied: boolean; deposit: number }): Verdict {
    return V.MA12c(x);
  },
  /** RC F3 — void บิลริบ → NO_SHOW อีกครั้ง */
  MA12d(x: { firstVoided: boolean; restored: boolean; newBill: boolean; newStatus: string | null; left: number; depStatus: string | null }): Verdict {
    const ok = x.firstVoided && x.restored && x.newBill && x.newStatus === "PAID" && x.left === 0 && x.depStatus === "USED";
    return { ok, expected: "บิลแรก VOIDED · มัดจำกลับ OPEN · NO_SHOW อีกครั้ง = บิลริบใบใหม่ PAID · มัดจำ 0 USED", actual: `บิลแรก ${x.firstVoided ? "VOIDED" : "ไม่ VOIDED"} · หลัง void ${x.restored ? "OPEN" : "ไม่ OPEN"} · ริบอีก ${x.newBill ? "ใบใหม่" : "ใบเดิม/ไม่มี"} ${x.newStatus ?? "-"} · มัดจำ ${x.left} ${x.depStatus ?? "-"}` };
  },
  /** RC F4 — ออกจาก NO_SHOW: บิลริบ VOIDED · มัดจำ OPEN · DONE ใช้มัดจำ + เงินสด = ราคา */
  // ORACLE-EDIT ผู้คุม 23.10 (CD-P51-O10b · F10a): + audit ของการ void (ไม่ส่ง = ไม่ตัดสิน · self-test เดิม) ◂
  MA12e(x: { statusOk: boolean; forfeitStatus: string | null; leftAfter: number; depStatusAfter: string | null; donePays: string[]; revenue: number; price: number; deposit: number; voidAudit?: string }): Verdict {
    const ok = (x.voidAudit === undefined || x.voidAudit === "1:actor:นัดออกจาก NO_SHOW:booking") && x.statusOk && x.forfeitStatus === "VOIDED" && x.leftAfter === x.deposit && x.depStatusAfter === "OPEN" && x.donePays.slice().sort().join(",") === [`CASH:${x.price - x.deposit}`, `DEPOSIT:${x.deposit}`].sort().join(",") && x.revenue === x.price;
    return {
      ok,
      expected: `CONFIRMED ok · บิลริบ VOIDED · มัดจำ OPEN ${x.deposit} · DONE = DEPOSIT:${x.deposit} + CASH:${x.price - x.deposit} · Σ บิลรายได้ ${x.price}`,
      actual: `CONFIRMED ${x.statusOk ? "ok" : "ไม่สำเร็จ"} · บิลริบ ${x.forfeitStatus ?? "-"} · มัดจำ ${x.depStatusAfter ?? "-"} ${x.leftAfter} · DONE [${x.donePays.join(",")}] · Σ บิลรายได้ ${x.revenue}${x.voidAudit === undefined ? "" : ` · audit void ${x.voidAudit}`}`,
    };
  },
  /** RC F10b — บิลริบของหน้าขาย (POS) ไม่ถูก void อัตโนมัติ: ปฏิเสธการเปลี่ยนสถานะ */
  MA12g(x: { regForfeit: string; refused: boolean; message: string; apptStatus: string | null; billStatus: string | null; depStatus: string | null }): Verdict {
    const ok = x.regForfeit === "ok" && x.refused && x.message.includes("ริบที่เคาน์เตอร์แล้ว") && x.apptStatus === "NO_SHOW" && x.billStatus === "PAID" && x.depStatus === "USED";
    return { ok, expected: "ริบหน้าขาย ok · CONFIRMED ถูกปฏิเสธ (\"ริบที่เคาน์เตอร์แล้ว\") · นัด NO_SHOW · บิลริบ PAID · มัดจำ USED", actual: `ริบหน้าขาย ${x.regForfeit} · CONFIRMED ${x.refused ? `ปฏิเสธ "${x.message.slice(0, 80)}"` : "ผ่าน"} · นัด ${x.apptStatus ?? "-"} · บิลริบ ${x.billStatus ?? "-"} · มัดจำ ${x.depStatus ?? "-"}` };
  },
  /** RC F5 — ริบล้ม: จอแสดงเหตุผล + OpsEvent WARN · มัดจำ OPEN */
  MA12f(x: { redirectErr: boolean; ops: number; depStatus: string | null; left: number; deposit: number }): Verdict {
    const ok = x.redirectErr && x.ops >= 1 && x.depStatus === "OPEN" && x.left === x.deposit;
    return { ok, expected: "redirect ?err= (จอจองแสดงเหตุผล) · OpsEvent WARN pos.deposit.forfeit_failed ≥ 1 · มัดจำ OPEN เต็ม", actual: `redirect ${x.redirectErr ? "?err=" : "ไม่มี"} · OpsEvent ${x.ops} · มัดจำ ${x.depStatus ?? "-"} ${x.left}` };
  },
  /** RC F8b — สามรายงานตรงกัน (ใบรับโมดูลแถวเดิม DEPOSIT) */
  MA14b(x: { bound: boolean; shift: { t: number; d: number }; day: { t: number; d: number }; rpt: { t: number; d: number }; deposit: number }): Verdict {
    const good = (r: { t: number; d: number }) => r.t === x.deposit && r.d === 0;
    const ok = x.bound && good(x.shift) && good(x.day) && good(x.rpt);
    return { ok, expected: `ใบรับผูกกะ · กะ = วัน = reportPayments: TRANSFER ${x.deposit} · DEPOSIT 0`, actual: `ผูกกะ ${x.bound ? "ใช่" : "ไม่"} · กะ T${x.shift.t}/D${x.shift.d} · วัน T${x.day.t}/D${x.day.d} · รายงาน T${x.rpt.t}/D${x.rpt.d}` };
  },
  /** R1 F4 (O9) — วิธีรับของใบรับโมดูล · สรุปวัน DEPOSIT/TRANSFER · probe GL 1010 */
  MA14(x: { receiptPays: string[]; moduleDepRows: number; reportDeposit: number; expectDeposit: number; reportTransfer: number; expectTransfer: number; jv1010: number; receiptTransfer: number }): Verdict {
    const ok = x.receiptPays.join(",") === "TRANSFER" && x.moduleDepRows === 0 && x.reportDeposit === x.expectDeposit && x.reportTransfer === x.expectTransfer && x.receiptTransfer > 0 && x.jv1010 === x.receiptTransfer;
    return {
      ok,
      expected: `ใบรับโมดูลใหม่ = แถว TRANSFER · ใบรับโมดูลทั้งร้านไม่มีแถว DEPOSIT · สรุปวัน DEPOSIT = ${x.expectDeposit} (บิลปิด) · TRANSFER = ${x.expectTransfer} · Dr 1010 ใบรับโมดูล = Σ TRANSFER ใบรับ`,
      actual: `ใบรับใหม่ [${x.receiptPays.join(",")}] · แถว DEPOSIT บนใบรับโมดูล ${x.moduleDepRows} · สรุปวัน DEPOSIT ${x.reportDeposit} (บิลปิด ${x.expectDeposit}) · TRANSFER ${x.reportTransfer}/${x.expectTransfer} · Dr 1010 ใบรับโมดูล ${x.jv1010} / TRANSFER ใบรับ ${x.receiptTransfer}`,
    };
  },
  /** F3 — a: STAFF ราคาต่ำกว่าแคตตาล็อก (V2 ปิด) · b: V2 เปิด · ctl: OWNER ราคาแคตตาล็อก (V2 ปิด) */
  // ORACLE-EDIT ผู้คุม 23.10 (CD-P51-O4b · R1 F1): + c = STAFF ราคาแคตตาล็อก 12,000 + ส่วนลดท้ายบิล 11,900 (เกินเพดาน STAFF) → error ไม่มีบิล · ไม่ส่ง c = ไม่ตัดสินข้อ c (self-test เดิม) ◂
  MA3(x: { ctl: string; a: string; aBill: number; b: string; bBill: number; c?: string; cBill?: number }): Verdict {
    const cOk = x.c === undefined || (x.c === "error" && x.cBill === 0);
    const ok = x.ctl === "ok" && x.a === "error" && x.aBill === 0 && x.b === "error" && x.bBill === 0 && cOk;
    return { ok, expected: "ตัวควบคุม ok · STAFF ราคาต่ำ = error ไม่มีบิล · V2 เปิด = error ไม่มีบิล · STAFF ส่วนลดท้ายบิลเกินเพดาน = error ไม่มีบิล", actual: `ตัวควบคุม ${x.ctl} · STAFF ราคา 100 แทน 12,000 → ${x.a} บิล ${x.aBill} · V2 เปิด → ${x.b} บิล ${x.bBill}${x.c === undefined ? "" : ` · STAFF ลดท้ายบิล 11,900 → ${x.c} บิล ${x.cBill}`}` };
  },
  /** F4 — หลังรับ→คืน→รับ: depositPaidAt · สถานะบิลที่ depositSaleId ชี้ · Σ บิลมัดจำ PAID */
  MA4(x: { paidAt: boolean; saleStatus: string | null; paidDeposit: number; deposit: number }): Verdict {
    const ok = !x.paidAt || (x.saleStatus === "PAID" && x.paidDeposit === x.deposit);
    return { ok, expected: `ขึ้นว่าจ่ายแล้ว ⇒ บิลมัดจำ PAID · Σ มัดจำ PAID = ${x.deposit}`, actual: `depositPaidAt ${x.paidAt ? "ตั้งแล้ว" : "ว่าง"} · บิลที่ชี้ ${x.saleStatus ?? "-"} · Σ มัดจำ PAID ${x.paidDeposit}` };
  },
  /** F5 — ต่อกรณี: ครั้งแรกล้มจริง (fixture) · สถานะบิลของคีย์หลังลองซ้ำ */
  MA5(x: { cases: { name: string; firstFailed: boolean; firstCode: string; retry: string; bill: string | null }[] }): Verdict {
    const ok = x.cases.length > 0 && x.cases.every((c) => c.firstFailed && c.bill === "PAID");
    return { ok, expected: "ครั้งแรกล้ม SHIFT_REQUIRED · ลองซ้ำหลังปลดกะ = บิล PAID ของคีย์", actual: joinP(x.cases.map((c) => `${c.name}: ครั้งแรก ${c.firstFailed ? c.firstCode : "ไม่ล้ม (fixture)"} · ลองซ้ำ ${c.retry} · บิล ${c.bill ?? "ไม่มี"}`)) };
  },
  /** F6 — สองโปรเซส: ACTIVE · บิล PAID · Σ เงิน */
  MA6(x: { price: number; customers: { active: number; bills: number; satang: number }[]; codes: string[] }): Verdict {
    const good = (c: { active: number; bills: number; satang: number }) => c.active === 1 && c.bills === 1 && c.satang === x.price;
    const ok = x.customers.length > 0 && x.customers.every(good);
    const bad = x.customers.filter((c) => !good(c));
    return {
      ok,
      expected: `ลูกค้าทุกคน: ACTIVE 1 · บิล PAID 1 · Σ ${x.price}`,
      actual: `${x.customers.length} คน · ผิด ${bad.length} คน [${x.customers.map((c) => `${c.active}/${c.bills}/${c.satang}`).join(" ")}] (ACTIVE/บิล/Σ) · ผลสองโปรเซส ${x.codes.slice(0, 4).join(" | ")}`,
    };
  },
  /** F7 — สถานะออเดอร์หลังคืน · สถานะบิลของคีย์ */
  MA7(x: { orderStatus: string; bill: string | null; cancelled: boolean }): Verdict {
    const ok = x.cancelled && !(x.bill === "PAID" && x.orderStatus !== "PAID");
    return { ok, expected: "ยกเลิก/คืนเกิดจริง · ไม่มีบิล PAID บนออเดอร์ที่ไม่ใช่ PAID", actual: `ยกเลิก ${x.cancelled ? "สำเร็จ" : "ไม่สำเร็จ (fixture)"} · ออเดอร์ ${x.orderStatus} · บิล ${x.bill ?? "ไม่มี"}` };
  },
  /** F8 — ต่อกรณี: ถูกปฏิเสธ (รหัส) · มีบิล */
  MA8(x: { cases: { name: string; code: string; bill: boolean }[] }): Verdict {
    const refusedOk = (c: { code: string; bill: boolean }) => c.code !== "ok" && !c.bill;
    const ok = x.cases.length > 0 && x.cases.every(refusedOk);
    return { ok, expected: "ทุกกรณี = ปฏิเสธ (VALIDATION) ไม่มีบิล", actual: joinP(x.cases.map((c) => `${c.name} → ${c.code}${c.bill ? " มีบิล PAID ✗" : ""}`)) };
  },
  /** F9 — VAT บิล · ใบคืนบางส่วน (ยอด · VAT จริง · VAT คาดที่อัตราบิล) */
  MA9(x: { saleVat: number; partials: { grand: number; vat: number; expect: number }[] }): Verdict {
    const sum = x.partials.reduce((t, r) => t + r.vat, 0);
    const ok = x.partials.length > 0 && x.partials.every((r) => Math.abs(r.vat - r.expect) <= 1) && sum <= x.saleVat;
    return { ok, expected: `VAT ใบคืนแต่ละใบ = ส่วนของอัตราบิล (±1) · Σ ≤ ${x.saleVat}`, actual: `${x.partials.map((r) => `${r.grand}→VAT ${r.vat} (คาด ${r.expect})`).join(" · ")} · Σ ${sum}${sum > x.saleVat ? ` > VAT บิล ${x.saleVat}` : ""}` };
  },
  /** F10 — Dr ต่อรหัสบัญชีของ JV ขาย */
  MA10(x: { dr2110: number; dr1000: number; gift: number; cash: number; tip: number; posted: boolean }): Verdict {
    const ok = x.posted && x.dr2110 === x.gift && x.dr1000 === x.cash - x.tip;
    return { ok, expected: `Dr 2110 = ${x.gift} · Dr 1000 = ${x.cash - x.tip}`, actual: x.posted ? `Dr 2110 = ${x.dr2110} · Dr 1000 = ${x.dr1000}` : "ไม่มี JV ขาย" };
  },
  /** F11 — สองโปรเซสต่อบิล: จำนวนที่โยน · JV PAID ต่อบิล */
  MA11(x: { rounds: number; throws: number; jvPerBill: number[]; codes: string[] }): Verdict {
    const ok = x.rounds > 0 && x.throws === 0 && x.jvPerBill.length === x.rounds && x.jvPerBill.every((n) => n === 1);
    return { ok, expected: `${x.rounds} บิล × 2 โปรเซส: โยน 0 · JV PAID 1 ต่อบิล`, actual: `โยน ${x.throws} (${x.codes.slice(0, 4).join(" | ") || "-"}) · JV ต่อบิล [${x.jvPerBill.join(",")}]` };
  },
};

/** self-test: [ตัวอย่างถูก (ต้องเขียว), ตัวอย่างบั๊ก = ตัวเลขของ hunter (ต้องแดง)] ต่อข้อ */
const SELF_SAMPLES: Record<string, [() => Verdict, () => Verdict]> = {
  MA1: [() => V.MA1({ saleGrand: 4_000, memberDiscount: 95_000, refundOk: true, refundPaid: 4_000 }), () => V.MA1({ saleGrand: 4_000, memberDiscount: 95_000, refundOk: true, refundPaid: 9_000 })],
  MA2: [
    () => V.MA2({ cases: [{ name: "hotel", price: 200_000, base: 186_916, vat: 13_084, revenueGrand: 200_000, glIncome: 186_916, glVat: 13_084, posted: true }] }),
    () => V.MA2({ cases: [{ name: "hotel", price: 200_000, base: 186_916, vat: 13_084, revenueGrand: 250_000, glIncome: 233_645, glVat: 16_355, posted: true }] }),
  ],
  // ORACLE-EDIT ผู้คุม 23.10 (CD-P51-O7): ถูก / ตัวเลขของ R1 probe PB · PA ◂
  MA2b: [
    () => V.MA2b({ cases: [{ name: "hotel", refundOk: true, voided: true, cnCount: 1, cnSatang: 50_000, left: 0, depStatus: "REFUNDED", deposit: 50_000 }] }),
    () => V.MA2b({ cases: [{ name: "hotel", refundOk: true, voided: true, cnCount: 0, cnSatang: 0, left: 50_000, depStatus: "OPEN", deposit: 50_000 }] }),
  ],
  MA4b: [
    () => V.MA4b({ ctlNoop: true, ctlSame: true, newReceipt: true, newStatus: "PAID", newAmount: 50_000, paidAt: true, linkedNew: true, linkedStatus: "OPEN", oldStatus: "REFUNDED", deposit: 50_000 }),
    () => V.MA4b({ ctlNoop: true, ctlSame: true, newReceipt: false, newStatus: "PAID", newAmount: 50_000, paidAt: true, linkedNew: false, linkedStatus: "REFUNDED", oldStatus: "REFUNDED", deposit: 50_000 }),
  ],
  // ORACLE-EDIT ผู้คุม 23.10 (CD-P51-O8/O9): ถูก / ตัวเลขของ R1 F3 F4 ◂
  MA12: [
    () => V.MA12({ bills: 1, status: "PAID", grand: 50_000, lineName: "มัดจำริบ — ไม่มาตามนัด", pays: ["DEPOSIT:50000"], glIncome: 46_729, net2200: 3_271, net2110: 0, left: 0, depStatus: "USED", audits: 1, billsAfterRepeat: 1, deposit: 50_000, base: 46_729, vat: 3_271 }),
    () => V.MA12({ bills: 0, status: null, grand: 0, lineName: null, pays: [], glIncome: 0, net2200: 3_271, net2110: 46_729, left: 50_000, depStatus: "OPEN", audits: 0, billsAfterRepeat: 0, deposit: 50_000, base: 46_729, vat: 3_271 }),
  ],
  MA12b: [
    () => V.MA12b({ cases: ["booking", "hotel", "rental"].map((name) => ({ name, cancelOk: true, depStatus: "OPEN", left: 50_000, forfeitBills: 0, deposit: 50_000 })) }),
    () => V.MA12b({ cases: ["booking", "hotel", "rental"].map((name) => ({ name, cancelOk: true, depStatus: "USED", left: 0, forfeitBills: 1, deposit: 50_000 })) }),
  ],
  MA13: [
    () => V.MA13({ cashier: "PERMISSION_DENIED", cashierBills: 0, noReason: "REASON_REQUIRED", noReasonBills: 0, mgr: "ok", mgrBills: 1, grand: 50_000, left: 0, depStatus: "USED", auditReason: "r", reason: "r", auditActorOk: true, againBills: 1, deposit: 50_000 }),
    () => V.MA13({ cashier: "MISSING:registerForfeitDeposit", cashierBills: 0, noReason: "MISSING:registerForfeitDeposit", noReasonBills: 0, mgr: "MISSING:registerForfeitDeposit", mgrBills: 0, grand: 0, left: 50_000, depStatus: "OPEN", auditReason: null, reason: "r", auditActorOk: false, againBills: 0, deposit: 50_000 }),
  ],
  MA14: [
    () => V.MA14({ receiptPays: ["TRANSFER"], moduleDepRows: 0, reportDeposit: 210_000, expectDeposit: 210_000, reportTransfer: 50_000, expectTransfer: 50_000, jv1010: 50_000, receiptTransfer: 50_000 }),
    () => V.MA14({ receiptPays: ["DEPOSIT"], moduleDepRows: 8, reportDeposit: 610_000, expectDeposit: 210_000, reportTransfer: 0, expectTransfer: 0, jv1010: 50_000, receiptTransfer: 0 }),
  ],
  // ORACLE-EDIT ผู้คุม 23.10 (CD-P51-O10): ถูก / ตัวเลขของ R1 ชุด C (probe-c Q1 Q2 Q4 Q6 Q7 · probe-c2 Q9) ◂
  MA12c: [
    () => V.MA12c({ forfeit: "ok", bills: 1, grand: 50_000, discount: 0, left: 0, depStatus: "USED", points: 0, spentDelta: 0, timeline: 0, tierApplied: true, deposit: 50_000 }),
    () => V.MA12c({ forfeit: "VALIDATION", bills: 0, grand: 0, discount: 0, left: 50_000, depStatus: "OPEN", points: 0, spentDelta: 0, timeline: 0, tierApplied: true, deposit: 50_000 }),
  ],
  MA13b: [
    () => V.MA13b({ forfeit: "ok", bills: 1, grand: 50_000, discount: 0, left: 0, depStatus: "USED", points: 0, spentDelta: 0, timeline: 0, tierApplied: true, deposit: 50_000 }),
    () => V.MA13b({ forfeit: "ok", bills: 1, grand: 50_000, discount: 0, left: 0, depStatus: "USED", points: 20, spentDelta: 50_000, timeline: 1, tierApplied: true, deposit: 50_000 }),
  ],
  MA12d: [() => V.MA12d({ firstVoided: true, restored: true, newBill: true, newStatus: "PAID", left: 0, depStatus: "USED" }), () => V.MA12d({ firstVoided: true, restored: true, newBill: false, newStatus: "VOIDED", left: 50_000, depStatus: "OPEN" })],
  MA12e: [
    () => V.MA12e({ statusOk: true, forfeitStatus: "VOIDED", leftAfter: 50_000, depStatusAfter: "OPEN", donePays: ["DEPOSIT:50000", "CASH:150000"], revenue: 200_000, price: 200_000, deposit: 50_000 }),
    () => V.MA12e({ statusOk: true, forfeitStatus: "PAID", leftAfter: 0, depStatusAfter: "USED", donePays: ["CASH:200000"], revenue: 250_000, price: 200_000, deposit: 50_000 }),
  ],
  MA12g: [
    () => V.MA12g({ regForfeit: "ok", refused: true, message: "บิลริบมัดจำ #202610-0009 ริบที่เคาน์เตอร์แล้ว — ให้ผู้จัดการยกเลิกบิลที่ POS ก่อน", apptStatus: "NO_SHOW", billStatus: "PAID", depStatus: "USED" }),
    () => V.MA12g({ regForfeit: "ok", refused: false, message: "", apptStatus: "CONFIRMED", billStatus: "VOIDED", depStatus: "OPEN" }),
  ], // ORACLE-EDIT ผู้คุม 23.10 (CD-P51-O10b) ◂
  MA12f: [() => V.MA12f({ redirectErr: true, ops: 1, depStatus: "OPEN", left: 50_000, deposit: 50_000 }), () => V.MA12f({ redirectErr: false, ops: 0, depStatus: "OPEN", left: 50_000, deposit: 50_000 })],
  MA14b: [
    () => V.MA14b({ bound: true, shift: { t: 50_000, d: 0 }, day: { t: 50_000, d: 0 }, rpt: { t: 50_000, d: 0 }, deposit: 50_000 }),
    () => V.MA14b({ bound: true, shift: { t: 0, d: 50_000 }, day: { t: 50_000, d: 0 }, rpt: { t: 0, d: 50_000 }, deposit: 50_000 }),
  ],
  MA3: [() => V.MA3({ ctl: "ok", a: "error", aBill: 0, b: "error", bBill: 0, c: "error", cBill: 0 }), () => V.MA3({ ctl: "ok", a: "error", aBill: 0, b: "error", bBill: 0, c: "ok", cBill: 1 })], // ORACLE-EDIT ผู้คุม 23.10 (CD-P51-O4b): ตัวอย่างบั๊ก = ช่องส่วนลดท้ายบิล (R1 F1) ◂
  MA4: [() => V.MA4({ paidAt: true, saleStatus: "PAID", paidDeposit: 50_000, deposit: 50_000 }), () => V.MA4({ paidAt: true, saleStatus: "VOIDED", paidDeposit: 0, deposit: 50_000 })],
  MA5: [
    () => V.MA5({ cases: [{ name: "ticket", firstFailed: true, firstCode: "SHIFT_REQUIRED", retry: "ok", bill: "PAID" }] }),
    () => V.MA5({ cases: [{ name: "ticket", firstFailed: true, firstCode: "SHIFT_REQUIRED", retry: "undefined", bill: null }] }),
  ],
  MA6: [
    () => V.MA6({ price: 30_000, customers: [{ active: 1, bills: 1, satang: 30_000 }, { active: 1, bills: 1, satang: 30_000 }], codes: ["ok", "THROW"] }),
    () => V.MA6({ price: 30_000, customers: [{ active: 1, bills: 1, satang: 30_000 }, { active: 2, bills: 2, satang: 60_000 }], codes: ["ok", "ok"] }),
  ],
  MA7: [() => V.MA7({ orderStatus: "CANCELLED", bill: "VOIDED", cancelled: true }), () => V.MA7({ orderStatus: "CANCELLED", bill: "PAID", cancelled: true })],
  MA8: [() => V.MA8({ cases: [{ name: "qty0", code: "VALIDATION", bill: false }] }), () => V.MA8({ cases: [{ name: "qty0", code: "ok", bill: true }] })],
  MA9: [() => V.MA9({ saleVat: 26_168, partials: [{ grand: 100_000, vat: 6_542, expect: 6_542 }, { grand: 100_000, vat: 6_542, expect: 6_542 }, { grand: 100_000, vat: 6_542, expect: 6_542 }] }), () => V.MA9({ saleVat: 26_168, partials: [{ grand: 100_000, vat: 9_091, expect: 6_542 }, { grand: 100_000, vat: 9_091, expect: 6_542 }, { grand: 100_000, vat: 9_091, expect: 6_542 }] })],
  MA10: [() => V.MA10({ dr2110: 5_000, dr1000: 10_000, gift: 5_000, cash: 11_000, tip: 1_000, posted: true }), () => V.MA10({ dr2110: 4_000, dr1000: 11_000, gift: 5_000, cash: 11_000, tip: 1_000, posted: true })],
  MA11: [() => V.MA11({ rounds: 3, throws: 0, jvPerBill: [1, 1, 1], codes: [] }), () => V.MA11({ rounds: 3, throws: 2, jvPerBill: [1, 1, 1], codes: ["P2002"] })],
};
function runSelfTest(): string[] {
  const p: string[] = [];
  for (const id of [...MA_IDS, ...R1_IDS, ...C_IDS, ...C2_IDS]) { // ORACLE-EDIT ผู้คุม 23.10 (CD-P51-O7): + MA2b MA4b · (CD-P51-O8/O9): + MA12 MA12b MA13 MA14 ◂
    const k = id.replace("P5.1-", "");
    const s = SELF_SAMPLES[k];
    if (!s) {
      p.push(`${k}: ไม่มีตัวอย่าง`);
      continue;
    }
    const good = s[0]();
    const bad = s[1]();
    if (!good.ok) p.push(`${k}: ตัวอย่างถูกแดง (${good.actual.slice(0, 80)})`);
    if (bad.ok) p.push(`${k}: ตัวเลขบั๊กเขียว (${bad.actual.slice(0, 80)})`);
    if (SELFTEST) console.log(`   ${good.ok && !bad.ok ? "🟢" : "🔴"} ${k}: ถูก → ${good.ok ? "เขียว" : "แดง"} · บั๊ก → ${bad.ok ? "เขียว" : "แดง"} (${bad.actual.slice(0, 100)})`);
  }
  return p;
}
function runRegistry(): string[] {
  const p: string[] = [];
  const ids = CHECKS.map((c) => c.id);
  if (new Set(ids).size !== ids.length) p.push("id ซ้ำ");
  for (let i = 1; i <= 11; i++) {
    const c = CHECKS.find((x) => x.id === `P5.1-MA${i}`);
    if (!c) p.push(`ไม่มี MA${i}`);
    else if (c.finding !== `F${i}` || !c.sev || !/^[ABCD]$/.test(c.batch)) p.push(`MA${i}: finding/severity/ชุดแก้ไม่ครบ`);
  }
  for (const f of ["F12", "F13", "F14"]) if (!NOT_WRITTEN.some((n) => n.finding === f && n.why.length > 20)) p.push(`${f} ไม่มีเหตุผล`);
  for (const z of ["P5.1-Z1", "P5.1-Z2"]) if (!ids.includes(z)) p.push(`ไม่มี ${z}`);
  if (MA_IDS.length !== 11) p.push(`ข้อ MA ${MA_IDS.length} (คาด 11)`);
  for (const r of R1_IDS) if (!CHECKS.some((c) => c.id === r && /^R1-F\d$/.test(c.finding) && c.batch === "B")) p.push(`ไม่มี ${r} (CD-P51-O7)`); // ORACLE-EDIT ผู้คุม 23.10 (CD-P51-O7) ◂
  for (const r of C_IDS) if (!CHECKS.some((c) => c.id === r && /^R1-F[34]$/.test(c.finding) && c.batch === "C")) p.push(`ไม่มี ${r} (CD-P51-O8/O9)`); // ORACLE-EDIT ผู้คุม 23.10 (CD-P51-O8/O9) ◂
  for (const r of C2_IDS) if (!CHECKS.some((c) => c.id === r && /^RC-F\d+$/.test(c.finding) && c.batch === "C")) p.push(`ไม่มี ${r} (CD-P51-O10)`); // ORACLE-EDIT ผู้คุม 23.10 (CD-P51-O10) ◂
  return p;
}

if (SELFTEST || NODB) {
  console.log(`${SUITE} · PIN ${PIN} · LANE_PIN ${LANE_PIN} · ${NODB ? "--no-db" : "--self-test"} (ไม่โหลด prisma)`);
  const st = runSelfTest();
  if (NODB) {
    const reg = runRegistry();
    chk("ST1", reg.length === 0, "ทะเบียนครบ", joinP(reg));
  }
  chk("ST2", st.length === 0, "ถูก = เขียว · บั๊ก = แดง ทุกข้อ", joinP(st, `${MA_IDS.length + R1_IDS.length + C_IDS.length + C2_IDS.length} ข้อพลิกได้ครบ`));
  const failedN = [...results.entries()].filter(([, r]) => !r.ok).map(([id]) => id);
  console.log(`\n===== ${SUITE} (${NODB ? "--no-db" : "--self-test"}) ===== ผ่าน ${results.size - failedN.length}/${results.size}`);
  console.log(`JSON_SUMMARY ${JSON.stringify({ suite: SUITE, mode: NODB ? "no-db" : "self-test", total: results.size, passed: results.size - failedN.length, failed: failedN, skipped: false, registered: CHECKS.length, pin: PIN })}`);
  process.exit(failedN.length ? 1 : 0);
}

// ═════════════════════════ 3. env (QC4 เท่านั้น) + prisma ═════════════════════════
const { AsyncLocalStorage } = await import("node:async_hooks");
(globalThis as Any).AsyncLocalStorage ??= AsyncLocalStorage;
const envMod = (await import("./pos-qc-env.mjs" as string)) as Any;
envMod.loadPosQcEnv(SUITE);
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
assertQc4BeforeWrite();
if (!process.env.SESSION_SECRET) process.env.SESSION_SECRET = `qc-p51-${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
const { prisma } = (await import("@/lib/core/db" as string)) as Any;
const P = prisma as Any;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const tryImport = async (p: string): Promise<Any> => {
  try {
    return await import(p as string);
  } catch (e) {
    console.log(`  (โหลด ${p} ไม่ได้: ${(e as Error).message.slice(0, 140)})`);
    return null;
  }
};
function errCode(e: unknown): string {
  const o = e as { code?: unknown; message?: unknown } | null;
  if (o && typeof o.code === "string" && /^[A-Z][A-Z0-9_]+$/.test(o.code)) return o.code;
  const m = /^([A-Z][A-Z0-9_]{3,})\b/.exec(String(o?.message ?? ""));
  return m ? m[1]! : "THROW";
}
async function call(mod: Any, name: string, ...args: unknown[]): Promise<Any> {
  const fn = mod?.[name];
  if (typeof fn !== "function") return { ok: false, code: `MISSING:${name}`, message: `ไม่มีฟังก์ชัน ${name}`, missing: true };
  try {
    const r = await fn(...args);
    return r === undefined ? { ok: true, undefinedResult: true } : r;
  } catch (e) {
    const o = e as Any;
    return { ok: false, code: errCode(e), message: String(o?.message ?? e).slice(0, 240), threw: true };
  }
}
const codeOf = (r: Any): string => (r?.ok === false ? String(r.code ?? r.reason ?? "FAIL") : r?.status === "error" ? "error" : "ok");

const realFetch = globalThis.fetch;
const guardHits: string[] = [];
function installFetchGuard(): void {
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
function removeFetchGuard(): void {
  globalThis.fetch = realFetch;
}

// ═════════════════════════ 3b. โปรเซสลูก (MA6 MA11 — "เครื่องที่สอง") ═════════════════════════
// โปรโตคอล (P2.14 Q5/Q6): --child <sub|paid> <base64 JSON> → โหลดโมดูล → CHILD_READY → รอ GO ทาง stdin → ทำงาน → CHILD_RESULT <json>
if (CHILD) {
  installFetchGuard();
  const task = ARGV[ARGV.indexOf("--child") + 1] ?? "";
  let arg: Any = {};
  try {
    arg = JSON.parse(Buffer.from(ARGV[ARGV.indexOf("--child") + 2] ?? "", "base64").toString("utf8"));
  } catch {
    arg = {};
  }
  const subMod = task === "sub" ? await tryImport("@/lib/modules/member/subscription") : null;
  const obx = task === "paid" ? await tryImport("@/lib/outbox-consumers") : null;
  // แตะ prisma ก่อน GO (ให้สองโปรเซสเริ่มพร้อมกันจริง ไม่ใช่ตัวหนึ่งยังต่อ DB อยู่)
  await P.$queryRawUnsafe(`SELECT 1`).catch(() => null);
  console.log("CHILD_READY");
  await new Promise<void>((resolve) => {
    let buf = "";
    process.stdin.on("data", (d: Buffer) => {
      buf += String(d);
      if (buf.includes("GO")) resolve();
    });
    setTimeout(resolve, 120_000);
  });
  let result: Any;
  if (task === "sub") {
    const items = await Promise.all((Array.isArray(arg.inputs) ? arg.inputs : []).map((input: Any) => call(subMod, "subscribe", arg.ctx, input)));
    result = { ok: items.every((x: Any) => x?.ok !== false), items };
  }
  else if (task === "paid") {
    const h = obx?.consumers?.["pos.sale.paid"];
    if (typeof h !== "function") result = { ok: false, code: "MISSING:consumer" };
    else {
      // ทุก event ของรายการพร้อมกัน (อีกโปรเซสทำชุดเดียวกันพร้อมกัน ⇒ คู่แข่งต่อบิล)
      const items = await Promise.all(
        (Array.isArray(arg.evts) ? arg.evts : []).map(async (evt: Any) => {
          try {
            await h(evt);
            return { ok: true, saleId: evt?.payload?.saleId };
          } catch (e) {
            const o = e as Any;
            return { ok: false, saleId: evt?.payload?.saleId, code: String(o?.code ?? errCode(e)), message: String(o?.message ?? e).slice(0, 200), threw: true };
          }
        }),
      );
      result = { ok: items.every((x: Any) => x.ok), items };
    }
  } else result = { ok: false, code: "CHILD_TASK_UNKNOWN" };
  console.log(`CHILD_RESULT ${JSON.stringify({ result, pid: process.pid, at: Date.now() })}`);
  await sleep(1500); // ให้ drain เบื้องหลัง (scheduleDrain ของ createSale) จบก่อนออก
  removeFetchGuard();
  await P.$disconnect?.().catch?.(() => {});
  process.exit(0);
}
/** โปรเซสลูก 2 ตัวพร้อมกัน — คืนผลของทั้งคู่ · ไม่พร้อม/ค้าง = หมายเหตุ */
async function twinChildren(task: "sub" | "paid", args: [Any, Any]): Promise<{ results: Any[]; note: string }> {
  const script = process.argv[1] ?? join(ROOT, "scripts", `${SUITE}.mts`);
  const kids = args.map((a) => spawn(process.execPath, [...process.execArgv, script, "--child", task, Buffer.from(JSON.stringify(a)).toString("base64")], { cwd: ROOT, env: { ...process.env }, stdio: ["pipe", "pipe", "pipe"] }));
  const outs = kids.map(() => ({ text: "", ready: false, result: null as Any }));
  kids.forEach((k, i) => {
    k.stdout.on("data", (d: Buffer) => {
      outs[i]!.text += String(d);
      if (outs[i]!.text.includes("CHILD_READY")) outs[i]!.ready = true;
      const m = /CHILD_RESULT (\{.*\})/.exec(outs[i]!.text);
      if (m && !outs[i]!.result) {
        try {
          outs[i]!.result = JSON.parse(m[1]!);
        } catch {
          outs[i]!.result = { parseError: true };
        }
      }
    });
    k.stderr.on("data", (d: Buffer) => {
      outs[i]!.text += String(d);
    });
  });
  let note = "";
  const t0 = Date.now();
  while (!outs.every((o) => o.ready) && Date.now() - t0 < 150_000) await sleep(200);
  if (!outs.every((o) => o.ready)) note = `โปรเซสลูกไม่พร้อม (${outs.map((o) => (o.ready ? "ready" : short(o.text.slice(-160), 160))).join(" | ")})`;
  for (const k of kids) k.stdin.write("GO\n");
  const t1 = Date.now();
  while (!outs.every((o) => o.result) && Date.now() - t1 < 120_000) await sleep(200);
  const t2 = Date.now();
  while (kids.some((k) => k.exitCode === null) && Date.now() - t2 < 8_000) await sleep(200);
  for (const k of kids) {
    try {
      k.stdin.end();
      if (k.exitCode === null) k.kill("SIGTERM");
    } catch {
      /* จบแล้ว */
    }
  }
  if (!outs.every((o) => o.result)) note += ` · โปรเซสลูกไม่ตอบ (${outs.map((o) => short(o.text.slice(-200), 200)).join(" | ")})`;
  return { results: outs.map((o) => o.result?.result ?? null), note };
}

// ═════════════════════════ 4. ลายนิ้วมือนอกร้านชั่วคราว (Z2) ═════════════════════════
const TEMP_LIKE = "posqc-%";
const RUN_START = new Date();
const FP_TABLES: [string, string][] = [
  ["PosSale", "status"],
  ["AccountDocument", "status"],
  ["AccountJournalEntry", "status"],
  ["MemberSubscription", "status"],
  ["HotelReservation", "status"],
  ["TicketOrder", "status"],
  ["Appointment", "status"],
  ["GiftCard", "balanceSatang"],
];
async function fingerprint(): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const [tb, col] of FP_TABLES) {
    try {
      const r = (await P.$queryRawUnsafe(
        `SELECT count(*)::int AS n, coalesce(md5(string_agg(x.id || ':' || coalesce(x."${col}"::text, ''), ',' ORDER BY x.id)), '-') AS h
         FROM "${tb}" x WHERE x."createdAt" < $2 AND NOT (x."tenantId" IN (SELECT id FROM "Tenant" WHERE slug LIKE $1))`,
        TEMP_LIKE,
        RUN_START,
      )) as Any[];
      out[tb] = `${r[0]?.n ?? "?"}:${String(r[0]?.h ?? "-").slice(0, 12)}`;
    } catch (e) {
      const m = (e as Error).message;
      out[tb] = /does not exist|ไม่มี/i.test(m) ? "absent" : `err:${m.slice(0, 30)}`;
    }
  }
  return out;
}
const fpBefore = await fingerprint();

// ═════════════════════════ 5. โมดูล ═════════════════════════
const sysSvc = await tryImport("@/lib/modules/system/service");
const accSvc = await tryImport("@/lib/modules/account/service");
const glMod = await tryImport("@/lib/modules/account/gl");
const posSvc = await tryImport("@/lib/modules/pos/service");
const refundMod = await tryImport("@/lib/modules/pos/refund");
const catalog = await tryImport("@/lib/modules/pos/catalog");
const memMod = await tryImport("@/lib/modules/member");
const tierMod = await tryImport("@/lib/modules/member/tiers");
const subMod = await tryImport("@/lib/modules/member/subscription");
const gcMod = await tryImport("@/lib/modules/giftcard");
const hotelMod = await tryImport("@/lib/modules/hotel/service");
const rentalMod = await tryImport("@/lib/modules/rental/service");
const bookingMod = await tryImport("@/lib/modules/booking/service");
const ticketMod = await tryImport("@/lib/modules/ticket/service");
const vatMod = await tryImport("@/lib/money/vat");
const ctxMod = await tryImport("@/lib/core/caller-tx");
const hashMod = await tryImport("@/lib/core/hash");
const OBX = await tryImport("@/lib/outbox-consumers");
const CONS: Any = OBX?.consumers ?? {};
const posAct = await tryImport("@/lib/actions/pos");
const bookingAct = await tryImport("@/lib/actions/booking");
const depositMod = await tryImport("@/lib/modules/pos/deposit"); // ORACLE-EDIT ผู้คุม 23.10 (CD-P51-O8c): registerForfeitDeposit ◂
const shiftMod = await tryImport("@/lib/modules/pos/shift"); // ORACLE-EDIT ผู้คุม 23.10 (CD-P51-O10): MA14b รายงานกะ ◂
const reportsMod = await tryImport("@/lib/modules/pos/reports"); // ORACLE-EDIT ผู้คุม 23.10 (CD-P51-O10): MA14b reportPayments ◂

// ── Next request scope (เทคนิคเดียวกับ qc-hf-o23 / qc-crm-c3.5) — ให้ requireTenant()/requireUnit() อ่านคุกกี้ได้ในโปรเซส ·
//    globalThis.AsyncLocalStorage ตั้งไว้ก่อน import ใด ๆ (ส่วน 3) — ไม่งั้นโมดูลของ Next ที่ถูกดึงมาก่อนจะโยน Invariant ◂
const nextWork = (await import("next/dist/server/app-render/work-async-storage.external.js" as string).catch(() => null)) as Any;
const nextWorkUnit = (await import("next/dist/server/app-render/work-unit-async-storage.external.js" as string).catch(() => null)) as Any;
const nextCookies = (await import("next/dist/server/web/spec-extension/cookies.js" as string).catch(() => null)) as Any;
async function inScope<R>(cookie: string, pathname: string, fn: () => Promise<R>): Promise<R> {
  if (!nextWork?.workAsyncStorage || !nextWorkUnit?.workUnitAsyncStorage || !nextCookies?.RequestCookies) throw new Error("ไม่มี Next request scope (next/dist/... โหลดไม่ได้)");
  const req = new Request(`http://qc.local${pathname}`, { headers: { cookie, "user-agent": SUITE, "x-forwarded-for": "203.0.113.151" } });
  const jar = new nextCookies.RequestCookies(req.headers);
  const workStore = { route: pathname, page: `${pathname}/page`, forceStatic: false, dynamicShouldError: false, isStaticGeneration: false, fallbackRouteParams: null, incrementalCache: {}, pendingRevalidatedTags: [] };
  const unit = { type: "request", phase: "action", implicitTags: [], cookies: jar, mutableCookies: jar, userspaceMutableCookies: jar, headers: req.headers, draftMode: undefined, rootParams: {}, url: { pathname, search: "" } };
  return nextWork.workAsyncStorage.run(workStore, () => nextWorkUnit.workUnitAsyncStorage.run(unit, fn));
}

const RAND = Math.random().toString(36).slice(2, 8);
const TAG = `qc-p51-${RAND}`;
const T_SLUG = `posqc-p51-${RAND}`;
let T = "";

// ── outbox: ระบายเฉพาะแถวของร้านชั่วคราว · claim แบบ lease ของ core (ไม่ซ้อนกับ drain เบื้องหลังของ createSale) ──
const pumpErr: string[] = [];
const evtOf = (row: Any) => ({ id: row.id, tenantId: row.tenantId, type: row.type, payload: row.payload, systemId: row.systemId, unitId: row.unitId });
async function pump(rounds = 40): Promise<boolean> {
  await sleep(400);
  for (let i = 0; i < rounds; i++) {
    const now = new Date();
    const rows = (await P.outboxEvent.findMany({ where: { tenantId: T, status: "PENDING" }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: 200 }).catch(() => [])) as Any[];
    if (!rows.length) return true;
    let did = 0;
    for (const row of rows) {
      // แถวที่ drain อื่นล้มแล้ว (attempts ≥ 1 · รอ backoff) = ทำเลย (ร้านชั่วคราวของเรา) · attempts 0 + availableAt อนาคต = lease ของ drain อื่น → ไม่แย่ง (กัน P2002 ซ้อนของฮาร์เนสเอง)
      const late = Number(row.attempts ?? 0) > 0 && row.availableAt && new Date(row.availableAt).getTime() > now.getTime();
      const lease = new Date(Date.now() + 120_000);
      const claim = await P.outboxEvent.updateMany({ where: { id: row.id, status: "PENDING", ...(late ? {} : { availableAt: { lte: new Date() } }) }, data: { availableAt: lease } });
      if (claim.count === 0) continue;
      did++;
      const h = CONS[row.type];
      if (typeof h === "function") {
        try {
          await h(evtOf(row));
        } catch (e) {
          const o = e as Any;
          pumpErr.push(`${row.type}: ${String(o?.code ?? o?.name ?? "")} ${String(o?.message ?? e).slice(0, 100)}`);
        }
      }
      await P.outboxEvent.updateMany({ where: { id: row.id, status: "PENDING" }, data: { status: "DONE", processedAt: new Date() } }).catch(() => null);
    }
    if (!did) await sleep(500);
  }
  return false;
}
const split = (g: number, bp = 700): { baseSatang: number; vatSatang: number } => (typeof vatMod?.splitIncludedVat === "function" ? vatMod.splitIncludedVat(g, bp) : { baseSatang: NaN, vatSatang: NaN });

// ═════════════════════════ 6. ข้อที่ต้องมี DB ═════════════════════════
async function runDb(): Promise<void> {
  installFetchGuard();
  console.log(`\n── ร้านชั่วคราว ${T_SLUG} · DB ${HOST} · PIN ${PIN} ──`);
  let fx = "";
  const U: Record<string, string> = {};
  const SLUG: Record<string, string> = {};
  const S: Record<string, string> = {};
  const US: Record<string, { id: string; role: string; unitAccess: string[]; perms: Record<string, boolean>; cookie: string }> = {};
  const step = async <R,>(label: string, fn: () => Promise<R> | R): Promise<R | null> => {
    try {
      return await fn();
    } catch (e) {
      console.log(`  ⚠️  fixture ${label}: ${String((e as Error)?.message ?? e).slice(0, 160)}`);
      return null;
    }
  };
  const blk = async (id: string, fn: () => Promise<void>): Promise<void> => {
    try {
      await fn();
    } catch (e) {
      chk(id, false, "ไม่โยน", `💥 ${String((e as Error)?.stack ?? e).split("\n").slice(0, 2).join(" | ").slice(0, 220)}`);
    }
  };
  const must = (label: string, r: Any): Any => {
    if (!r || r.ok === false || r.status === "error") throw new Error(`${label} ล้ม: ${codeOf(r)} ${short(r?.message ?? r?.reason ?? "", 120)}`);
    return r;
  };

  // ─── ร้าน · สาขา · ระบบ · สมุดบัญชี ───
  try {
    T = (await P.tenant.create({ data: { name: `QC P5.1 เงิน ${RAND}`, slug: T_SLUG } })).id;
    for (const [k, type] of [["A", "SHOP"], ["H", "HOTEL"], ["H5", "HOTEL"], ["R", "RENTAL"], ["B", "BOOKING"], ["B4", "BOOKING"], ["K", "TICKET"], ["BM", "BOOKING"], ["BZ", "BOOKING"]] as const) { // ORACLE-EDIT ผู้คุม 23.10 (CD-P51-O10): BM = จองคิวที่ผูกสมาชิก+แต้ม (MA12c MA13b) · BZ = จองคิวแยกของ MA14b ◂
      SLUG[k] = `${T_SLUG}-${k.toLowerCase()}`;
      U[k] = (await P.businessUnit.create({ data: { tenantId: T, type, name: `${TAG} สาขา ${k}`, slug: SLUG[k] } })).id;
    }
    S.POS = (await sysSvc.createSystem(T, "POS", `POS P5.1 ${RAND}`)).id;
    S.ACC = (await sysSvc.createSystem(T, "ACCOUNT", `บัญชี P5.1 ${RAND}`)).id;
    S.MEM = (await sysSvc.createSystem(T, "MEMBER", `สมาชิก P5.1 ${RAND}`)).id;
    for (const k of Object.keys(U)) await sysSvc.linkUnit(T, S.POS, U[k]);
    await sysSvc.linkUnit(T, S.MEM, U.A);
    // ORACLE-EDIT ผู้คุม 23.10 (CD-P51-O10): สาขาจองคิว BM ผูกสมาชิก + แต้ม (มัดจำของสมาชิก · ผลข้างเคียงของบิลริบ) ◂
    S.PNT = (await sysSvc.createSystem(T, "POINT", `แต้ม P5.1 ${RAND}`)).id;
    await sysSvc.linkUnit(T, S.MEM, U.BM);
    await sysSvc.linkUnit(T, S.PNT, U.BM);
    await accSvc.saveSettings(T, S.ACC, { orgName: `ร้านเงินคิวซี ${RAND} จำกัด`, taxId: "0105561177639", vatRegistered: true });
    await glMod.ensureAccounting({ tenantId: T, systemId: S.ACC });
    await P.accountSystemLink.create({ data: { tenantId: T, systemId: S.ACC, linkedKind: "POS", linkedId: S.POS } });
    S.TIPL = (await P.accountLedger.create({ data: { tenantId: T, systemId: S.ACC, code: "2190", name: `${TAG} ทิปรอจ่ายพนักงาน`, type: "LIABILITY" } })).id;
  } catch (e) {
    fx = `ร้านชั่วคราว: ${(e as Error).message.slice(0, 160)}`;
    console.log(`  ⚠️  ${fx}`);
  }
  // ─── ผู้ใช้ + Membership + Session (คุกกี้จริง สำหรับ action เดิม) ───
  if (!fx) {
    try {
      const DAY = 86_400_000;
      for (const [k, role, ua, perms] of [
        ["OWNER", "OWNER", ["*"], {}],
        ["CASH", "STAFF", [U.A!], { "pos.sale.create": true }],
        ["MGR", "MANAGER", ["*"], {}], // ORACLE-EDIT ผู้คุม 23.10 (CD-P51-O8c): ผู้จัดการของ MA13 ◂
      ] as const) {
        const u = await P.user.create({ data: { email: `${T_SLUG}-${k.toLowerCase()}@qc.invalid`, name: `${k} คิวซี${RAND}` } });
        await P.membership.create({ data: { userId: u.id, tenantId: T, role, unitAccess: [...ua], permissions: perms, acceptedAt: new Date() } });
        const token = hashMod.randomToken(32) as string;
        await P.session.create({ data: { userId: u.id, tokenHash: hashMod.sha256(token), idleExpiresAt: new Date(Date.now() + 30 * DAY), expiresAt: new Date(Date.now() + 90 * DAY) } });
        US[k] = { id: u.id, role, unitAccess: [...ua], perms: { ...perms }, cookie: `shark_session=${token}; __Host-shark_session=${token}; shark_tenant=${T}` };
      }
    } catch (e) {
      fx = `ผู้ใช้: ${(e as Error).message.slice(0, 140)}`;
    }
  }
  const FXB = (s: string) => (fx ? `fixture: ${fx} · ` : "") + s;
  const uid = (k: string) => US[k]?.id ?? `none-${k}`;
  const A = (k: string): Any => (US[k] ? { userId: US[k]!.id, role: US[k]!.role, unitAccess: [...US[k]!.unitAccess], permissions: { ...US[k]!.perms } } : { userId: `none-${k}`, role: "STAFF", unitAccess: [], permissions: {} });
  const ctxA = (): Any => ({ tenantId: T, systemId: S.POS ?? "none", unitId: U.A ?? "none" });
  const cc = (): Any => ({ tenantId: T, systemId: S.POS ?? "none", actorUserId: uid("OWNER") });
  let keyN = 0;
  const newKey = (pfx = "k") => `p51${RAND}${pfx}${++keyN}`;
  const patchPos = async (fn: (pos: Record<string, Any>) => void, db: Any = P) => {
    const s0 = (await db.appSystem.findUnique({ where: { id: S.POS }, select: { settings: true } }))?.settings ?? {};
    const s = s0 && typeof s0 === "object" && !Array.isArray(s0) ? JSON.parse(JSON.stringify(s0)) : {};
    const pos = s.pos && typeof s.pos === "object" ? s.pos : {};
    fn(pos);
    await db.appSystem.update({ where: { id: S.POS }, data: { settings: { ...s, pos } } });
  };
  const setShift = (otherSources: boolean) => patchPos((pos) => void (pos.shift = { ...(pos.shift && typeof pos.shift === "object" ? pos.shift : {}), required: { register: false, otherSources } }));
  if (!fx) await step("ค่าตั้ง POS (ไม่บังคับกะ)", () => setShift(false));

  const bkkYmd = (d: Date) => new Date(d.getTime() + 7 * 3600_000).toISOString().slice(0, 10);
  const addDays = (ymd: string, n: number) => new Date(Date.parse(`${ymd}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
  const TODAY = bkkYmd(new Date());
  const rnd = (n: number) => String(Math.floor(Math.random() * 10 ** n)).padStart(n, "0");
  const saleByKey = async (k: string): Promise<Any> => P.posSale.findFirst({ where: { tenantId: T, idempotencyKey: k } }).catch(() => null);
  const unitBills = async (unitId: string): Promise<Any[]> => (await P.posSale.findMany({ where: { tenantId: T, unitId, docType: "SALE" }, orderBy: { createdAt: "asc" } }).catch(() => [])) as Any[];
  const jvLines = async (refIds: string[]): Promise<Any[]> =>
    (await P.accountJournalEntry.findMany({ where: { tenantId: T, refType: "PosSale", refId: { in: refIds.filter(Boolean) } }, include: { lines: { include: { account: { select: { code: true } } } } } }).catch(() => [])) as Any[];
  const netCr = (es: Any[], pred: (code: string) => boolean): number => es.flatMap((e: Any) => e.lines ?? []).filter((l: Any) => pred(String(l.account?.code ?? ""))).reduce((t: number, l: Any) => t + Number(l.credit ?? 0) - Number(l.debit ?? 0), 0);
  const netDr = (es: Any[], code: string): number => -netCr(es, (c) => c === code);
  /** MA2: บิลของสาขา (ขาย · PAID) → ยอดรายได้ (ไม่นับ POS_DEPOSIT) + GL รายได้/VAT */
  const revenueOf = async (name: string, unitId: string, price: number, note = ""): Promise<Any> => {
    await pump();
    const bills = (await unitBills(unitId)).filter((b) => b.status === "PAID");
    const revenueGrand = bills.filter((b) => b.sourceModule !== "POS_DEPOSIT").reduce((t, b) => t + Number(b.grandTotalSatang), 0);
    const jv = await jvLines(bills.map((b) => b.id));
    const posted = bills.length > 0 && bills.every((b) => jv.some((e) => e.refId === b.id));
    const sp = split(price);
    return {
      name,
      price,
      base: sp.baseSatang,
      vat: sp.vatSatang,
      revenueGrand,
      glIncome: netCr(jv, (c) => c.startsWith("4")),
      glVat: netCr(jv, (c) => c === "2200"),
      posted,
      note: `${bills.length} บิล [${bills.map((b) => `${b.sourceModule}:${b.grandTotalSatang}`).join(",")}]${note ? ` · ${note}` : ""}`,
    };
  };

  // ─── สินค้า · สมาชิก (ระดับ) · บัตรของขวัญ ───
  const PROD = { name: `ของราคา 120 บาท ${RAND}`, price: 12_000, id: "" };
  let M1 = "";
  const M2S: string[] = [];
  const ctxM: Any = { tenantId: T, systemId: S.MEM, actorUserId: uid("OWNER") };
  const gctx: Any = { tenantId: T, systemId: S.MEM, posSystemId: S.POS, actorUserId: uid("OWNER") };
  let GC: { id: string; number: string; pin: string } | null = null;
  if (!fx) {
    await step("สินค้า", async () => {
      const p = await catalog.createProduct(cc(), { name: PROD.name, kind: "PRODUCT", basePriceSatang: PROD.price });
      PROD.id = String(p?.id ?? "");
    });
    await step("สมาชิก + ระดับ 95%", async () => {
      await tierMod.createTierDef(ctxM, A("OWNER"), { key: "silver", name: "Silver", color: "SLATE", isDefault: true, legacyTier: "SILVER" });
      const vip = await tierMod.createTierDef(ctxM, A("OWNER"), { key: "vip95", name: "VIP 95", color: "AMBER", legacyTier: "GOLD" });
      await tierMod.setBenefits(ctxM, A("OWNER"), vip.id, [{ type: "DISCOUNT_PCT", config: { pct: 95, maxSatang: 10_000_000 } }]);
      const r1 = await memMod.createMember(ctxM, A("OWNER"), { phone: `0896${rnd(6)}`, name: `สมาชิก VIP ${RAND}`, source: "WALK_IN", homeUnitId: U.A });
      M1 = String(r1?.customerId ?? "");
      if (!M1) throw new Error(`createMember M1 ${short(r1, 80)}`);
      await tierMod.applyTierChange(ctxM, M1, vip.id, "MANUAL", { qc: TAG }, { byUserId: uid("OWNER") });
      for (let i = 0; i < 5; i++) {
        const r2 = await memMod.createMember(ctxM, A("OWNER"), { phone: `0897${rnd(6)}`, name: `สมาชิกแพ็กเกจ ${i + 1} ${RAND}`, source: "WALK_IN", homeUnitId: U.A });
        if (!r2?.customerId) throw new Error(`createMember M2-${i} ${short(r2, 80)}`);
        M2S.push(String(r2.customerId));
      }
    });
    await step("บัตรของขวัญ", async () => {
      await gcMod.setSettings(gctx, A("OWNER"), { enabled: true, accountingLink: true });
      const r = await gcMod.sell(gctx, A("OWNER"), { satang: 10_000, payMethods: [{ type: "CASH", amountSatang: 10_000 }], unitId: U.A, recipient: { print: true }, idempotencyKey: `${TAG}-gc-1` });
      if (!r?.giftCardId) throw new Error(`sell ${short(r, 100)}`);
      GC = { id: String(r.giftCardId), number: String(r.number), pin: String(r.pin) };
    });
    await pump();
  }
  console.log(`   ร้าน ${T ? "ok" : "-"} · สาขา ${Object.keys(U).join(",")} · สินค้า ${PROD.id ? "ok" : "-"} · สมาชิก M1 ${M1 ? "ok" : "-"} M2 ×${M2S.length} · บัตร ${GC ? "ok" : "-"}`);

  // ════════ MA1 (F1 · ชุด A) สิทธิ์สมาชิกกินค่าบริการ → คืนเกินที่รับ ════════
  await blk("MA1", async () => {
    if (fx || !M1) return void chk("MA1", false, "fixture", FXB("ไม่มีสมาชิก M1"));
    const base: Any = { tenantId: T, unitId: U.A, systemId: S.POS, memberId: M1, memberSystemId: S.MEM, lines: [{ name: `ของ MA1 ${RAND}`, qty: 1, unitPriceSatang: 100_000 }], billDiscountSatang: 10_000, serviceChargeSatang: 9_000 };
    let r = await call(posSvc, "createSale", { ...base, idempotencyKey: newKey("ma1"), payMethods: [{ type: "CASH", amountSatang: 4_000 }] });
    if (r?.ok === false && r.code === "PAYMENT_MISMATCH") {
      const m = /ยอด (-?\d+)/.exec(String(r.message ?? ""));
      if (m) r = await call(posSvc, "createSale", { ...base, idempotencyKey: newKey("ma1"), payMethods: [{ type: "CASH", amountSatang: Math.max(0, Number(m[1])) }] });
    }
    if (r?.ok === false) {
      const v = V.MA1({ saleRefusedCode: `${r.code} ${r.message ?? ""}`, saleGrand: 0, memberDiscount: 0, refundOk: false, refundPaid: 0 });
      return void chk("MA1", v.ok, v.expected, v.actual);
    }
    const sale = await P.posSale.findUnique({ where: { id: r.saleId }, include: { lines: true } });
    const grand = Number(sale?.grandTotalSatang ?? NaN);
    const memberDiscount = Number(sale?.discountSatang ?? 0) - 10_000;
    const lineId = String(sale?.lines?.[0]?.id ?? "");
    const rf = (amt: number) => call(refundMod, "refundSale", ctxA(), A("OWNER"), { saleId: r.saleId, lines: [{ lineId, qty: 1 }], payMethods: [{ type: "CASH", amountSatang: amt }], reasonCode: "CHANGED_MIND", idempotencyKey: newKey("ma1rf") });
    let f = await rf(grand);
    let note = `ขอคืน ${grand} → ${codeOf(f)}`;
    if (f?.ok === false && f.code === "PAYMENT_MISMATCH") {
      const m = /ยอดคืน (-?\d+)/.exec(String(f.message ?? ""));
      if (m) {
        f = await rf(Number(m[1]));
        note += ` · ระบบคิดยอดคืน ${m[1]} → ${codeOf(f)}`;
      }
    }
    const docs = (await P.posSale.findMany({ where: { tenantId: T, docType: "REFUND", refSaleId: r.saleId } }).catch(() => [])) as Any[];
    const paid = docs.reduce((t, d) => t + Math.abs(Number(d.grandTotalSatang)), 0);
    const v = V.MA1({ saleGrand: grand, memberDiscount, refundOk: docs.length > 0, refundPaid: paid, refundNote: `${note} ${short(f?.message ?? "", 60)}` });
    chk("MA1", v.ok, v.expected, `${v.actual} · บิล sc ${sale?.serviceChargeSatang} ส่วนลด ${sale?.discountSatang} · ${note}`);
  });

  // ════════ MA2 (F2 · ชุด B) มัดจำนับเป็นรายได้ซ้ำ ════════
  await blk("MA2", async () => {
    if (fx) return void chk("MA2", false, "fixture", FXB(""));
    const cases: Any[] = [];
    // (a) โรงแรม — module ล้วน
    const h = await step("MA2 โรงแรม", async () => {
      const rt = await hotelMod.createRoomType({ tenantId: T, unitId: U.H, name: `ห้อง MA2 ${RAND}`, capacity: 2, baseRateSatang: 100_000, depositSatang: 50_000 });
      const room = must("createRoom", await hotelMod.createRoom({ tenantId: T, unitId: U.H, roomTypeId: rt.id, number: "201" }));
      const rv = must("createReservation", await hotelMod.createReservation({ tenantId: T, unitId: U.H, roomTypeId: rt.id, checkInDate: TODAY, checkOutDate: addDays(TODAY, 2), guestName: `แขก MA2 ${RAND}`, guestPhone: `0811${rnd(6)}` }));
      const d = await call(hotelMod, "recordDeposit", T, U.H, rv.id);
      const ci = await call(hotelMod, "checkIn", T, U.H, rv.id, room.id);
      const co = await call(hotelMod, "checkOut", T, U.H, rv.id);
      const row = await P.hotelReservation.findUnique({ where: { id: rv.id } });
      return { price: Number(row?.totalSatang ?? NaN), note: `มัดจำ ${codeOf(d)} · เช็คอิน ${codeOf(ci)} · เช็คเอาท์ ${codeOf(co)} · มัดจำ ${row?.depositSatang}` };
    });
    cases.push(await revenueOf("โรงแรม", U.H!, h?.price ?? 200_000, h?.note ?? "fixture ล้ม"));
    // (b) เช่า — module ล้วน
    const rr = await step("MA2 เช่า", async () => {
      const ctxR = { tenantId: T, unitId: U.R };
      const as = await rentalMod.createAsset(ctxR, { name: `ของเช่า MA2 ${RAND}`, dailyRateSatang: 100_000, depositSatang: 50_000 });
      const start = new Date();
      const bk = await rentalMod.createBooking(ctxR, { assetId: as.id, customerName: `ผู้เช่า MA2 ${RAND}`, customerPhone: `0812${rnd(6)}`, startDate: start, endDate: new Date(start.getTime() + 2 * 86_400_000) });
      const d = await call(rentalMod, "recordRentalDeposit", ctxR, bk.id);
      const pu = await call(rentalMod, "pickUp", ctxR, bk.id);
      const ret = await call(rentalMod, "returnAsset", ctxR, bk.id, {});
      return { price: Number(bk.quoteSatang), note: `มัดจำ ${codeOf(d)} · รับของ ${short(pu, 20)} · คืนของ ${codeOf(ret)}` };
    });
    cases.push(await revenueOf("เช่า", U.R!, rr?.price ?? 200_000, rr?.note ?? "fixture ล้ม"));
    // (c) จองคิว — มัดจำ (module) + บิลปิด (action เดิม setStatusAction DONE)
    const bb = await step("MA2 จองคิว", async () => {
      const svc = await P.bookingService.create({ data: { tenantId: T, unitId: U.B, name: `บริการ MA2 ${RAND}`, durationMin: 60, priceSatang: 200_000, depositSatang: 50_000 } });
      const stf = await P.bookingStaff.create({ data: { tenantId: T, unitId: U.B, name: `ช่าง MA2 ${RAND}` } });
      const ap = must("createAppointment", await bookingMod.createAppointment({ tenantId: T, unitId: U.B, serviceId: svc.id, staffId: stf.id, dateStr: addDays(TODAY, 1), startMin: 600, customerName: `ลูกค้า MA2 ${RAND}`, customerPhone: `0813${rnd(6)}` }));
      const d = await call(bookingMod, "recordDeposit", { tenantId: T, unitId: U.B }, ap.id);
      const fd = new FormData();
      fd.set("id", ap.id);
      fd.set("status", "DONE");
      let act = "ok";
      try {
        await inScope(US.OWNER!.cookie, `/app/u/${SLUG.B}/booking`, () => bookingAct.setStatusAction(SLUG.B, fd));
      } catch (e) {
        act = `โยน ${String((e as Error)?.message ?? e).slice(0, 60)}`;
      }
      const row = await P.appointment.findUnique({ where: { id: ap.id } });
      return { price: Number(row?.priceSatang ?? NaN), note: `มัดจำ ${codeOf(d)} · action DONE ${act} · สถานะ ${row?.status}` };
    });
    cases.push(await revenueOf("จองคิว", U.B!, bb?.price ?? 200_000, bb?.note ?? "fixture ล้ม"));
    const v = V.MA2({ cases });
    chk("MA2", v.ok, v.expected, v.actual);
  });

  // ════════ MA2b (R1 F2 · ชุด B · ORACLE-EDIT ผู้คุม 23.10 CD-P51-O7) คืนเงินทั้งรายการ = คืนมัดจำด้วย ════════
  await blk("MA2b", async () => {
    if (fx) return void chk("MA2b", false, "fixture", FXB(""));
    const caseOf = async (name: string, receiptId: string | null, finalKey: string, r: Any, deposit: number): Promise<Any> => {
      await pump();
      const fin = await saleByKey(finalKey);
      const cns = receiptId ? ((await P.posSale.findMany({ where: { tenantId: T, docType: "REFUND", refSaleId: receiptId } }).catch(() => [])) as Any[]) : [];
      const d: Any = receiptId ? await P.posDeposit.findUnique({ where: { receiptSaleId: receiptId } }).catch(() => null) : null;
      return { name, refundOk: r?.ok === true, refundNote: short(r?.reason ?? r?.message ?? "", 60), voided: fin?.status === "VOIDED", cnCount: cns.length, cnSatang: cns.reduce((t, x) => t + Number(x.grandTotalSatang), 0), left: d ? d.amountSatang - d.usedSatang - d.refundedSatang : -1, depStatus: d?.status ?? null, deposit };
    };
    const cases: Any[] = [];
    const h = await step("MA2b โรงแรม", async () => {
      const rt = await hotelMod.createRoomType({ tenantId: T, unitId: U.H, name: `ห้อง MA2b ${RAND}`, capacity: 2, baseRateSatang: 15_000, depositSatang: 50_000 });
      const room = must("createRoom", await hotelMod.createRoom({ tenantId: T, unitId: U.H, roomTypeId: rt.id, number: "202" }));
      const rv = must("createReservation", await hotelMod.createReservation({ tenantId: T, unitId: U.H, roomTypeId: rt.id, checkInDate: TODAY, checkOutDate: addDays(TODAY, 2), guestName: `แขก MA2b ${RAND}`, guestPhone: `0821${rnd(6)}` }));
      const d = must("recordDeposit", await call(hotelMod, "recordDeposit", T, U.H, rv.id));
      must("checkIn", await call(hotelMod, "checkIn", T, U.H, rv.id, room.id));
      must("checkOut", await call(hotelMod, "checkOut", T, U.H, rv.id));
      const r = await call(hotelMod, "refundStay", T, U.H, rv.id);
      return caseOf("โรงแรม", d.saleId ?? null, `hotel-sale-${rv.id}`, r, 50_000);
    });
    if (h) cases.push(h);
    const rr = await step("MA2b เช่า", async () => {
      const ctxR = { tenantId: T, unitId: U.R };
      const as = await rentalMod.createAsset(ctxR, { name: `ของเช่า MA2b ${RAND}`, dailyRateSatang: 15_000, depositSatang: 50_000 });
      const start = new Date();
      const bk = await rentalMod.createBooking(ctxR, { assetId: as.id, customerName: `ผู้เช่า MA2b ${RAND}`, customerPhone: `0822${rnd(6)}`, startDate: start, endDate: new Date(start.getTime() + 2 * 86_400_000) });
      const d = must("recordRentalDeposit", await call(rentalMod, "recordRentalDeposit", ctxR, bk.id));
      await call(rentalMod, "pickUp", ctxR, bk.id);
      must("returnAsset", await call(rentalMod, "returnAsset", ctxR, bk.id, {}));
      const r = await call(rentalMod, "refundRental", ctxR, bk.id);
      return caseOf("เช่า", d.saleId ?? null, `rental-${bk.id}`, r, 50_000);
    });
    if (rr) cases.push(rr);
    const v = V.MA2b({ cases });
    chk("MA2b", cases.length === 2 && v.ok, v.expected, `${cases.length === 2 ? "" : `fixture: ${cases.length}/2 กรณี · `}${v.actual}`);
  });

  // ════════ MA3 (F3 · ชุด C) action เดิม registerSaleAction ════════
  await blk("MA3", async () => {
    if (fx || !PROD.id || !posAct?.registerSaleAction) return void chk("MA3", false, "fixture", FXB(`สินค้า ${PROD.id ? "ok" : "-"} · action ${posAct?.registerSaleAction ? "ok" : "-"}`));
    const sell = async (who: string, unitPrice: number, billDiscountSatang = 0): Promise<{ status: string; bill: number; msg: string }> => { // ORACLE-EDIT ผู้คุม 23.10 (CD-P51-O4b): + ส่วนลดท้ายบิล ◂
      const key = newKey("ma3");
      let res: Any;
      try {
        res = await inScope(US[who]!.cookie, `/app/sys/${S.POS}/pos/register`, () =>
          posAct.registerSaleAction({ systemId: S.POS, unitId: U.A, lines: [{ name: PROD.name, qty: 1, unitPriceSatang: unitPrice }], ...(billDiscountSatang ? { billDiscountSatang } : {}), payType: "CASH", cashReceivedSatang: unitPrice - billDiscountSatang, idempotencyKey: key }),
        );
      } catch (e) {
        res = { status: "error", message: `โยน ${String((e as Error)?.message ?? e).slice(0, 80)}` };
      }
      const bill = await P.posSale.count({ where: { tenantId: T, idempotencyKey: { in: [key, `pos1:${key}`] }, status: "PAID" } }).catch(() => -1);
      return { status: String(res?.status ?? "?"), bill: Number(bill), msg: short(res?.message ?? res?.receiptNo ?? "", 80) };
    };
    const ctl = await sell("OWNER", PROD.price);
    const a = await sell("CASH", 100);
    const c = await sell("CASH", PROD.price, PROD.price - 100); // ORACLE-EDIT ผู้คุม 23.10 (CD-P51-O4b): ราคาแคตตาล็อก + ส่วนลดท้ายบิล 11,900 ⇒ บิล 100 ◂
    await patchPos((pos) => void (pos.registerV2 = true));
    let b: { status: string; bill: number; msg: string };
    try {
      b = await sell("OWNER", PROD.price);
    } finally {
      await patchPos((pos) => void (pos.registerV2 = false));
    }
    const v = V.MA3({ ctl: ctl.status, a: a.status, aBill: a.bill, b: b.status, bBill: b.bill, c: c.status, cBill: c.bill }); // ORACLE-EDIT ผู้คุม 23.10 (CD-P51-O4b) ◂
    chk("MA3", v.ok, v.expected, `${v.actual} · (${ctl.msg} | ${a.msg} | ${b.msg} | ${c.msg})`);
  });

  // ════════ MA4 (F4 · ชุด B) รับมัดจำซ้ำหลังคืน = บิล VOIDED ════════
  await blk("MA4", async () => {
    if (fx) return void chk("MA4", false, "fixture", FXB(""));
    const ctxB = { tenantId: T, unitId: U.B4 };
    const svc = await P.bookingService.create({ data: { tenantId: T, unitId: U.B4, name: `บริการ MA4 ${RAND}`, durationMin: 60, priceSatang: 200_000, depositSatang: 50_000 } });
    const stf = await P.bookingStaff.create({ data: { tenantId: T, unitId: U.B4, name: `ช่าง MA4 ${RAND}` } });
    const ap = must("createAppointment", await bookingMod.createAppointment({ tenantId: T, unitId: U.B4, serviceId: svc.id, staffId: stf.id, dateStr: addDays(TODAY, 1), startMin: 660, customerName: `ลูกค้า MA4 ${RAND}`, customerPhone: `0814${rnd(6)}` }));
    const r1 = await call(bookingMod, "recordDeposit", ctxB, ap.id);
    const r2 = await call(bookingMod, "refundDeposit", ctxB, ap.id);
    const r3 = await call(bookingMod, "recordDeposit", ctxB, ap.id);
    const row = await P.appointment.findUnique({ where: { id: ap.id } });
    const sale = row?.depositSaleId ? await P.posSale.findUnique({ where: { id: row.depositSaleId } }) : null;
    const paidDeposit = (await unitBills(U.B4!)).filter((b) => b.status === "PAID").reduce((t, b) => t + Number(b.grandTotalSatang), 0);
    const fixtureOk = r1?.ok === true && r2?.ok === true;
    const v = V.MA4({ paidAt: !!row?.depositPaidAt, saleStatus: sale?.status ?? null, paidDeposit, deposit: 50_000 });
    chk("MA4", fixtureOk && v.ok, v.expected, `${fixtureOk ? "" : "fixture: "}รับ ${codeOf(r1)} → คืน ${codeOf(r2)} → รับอีก ${codeOf(r3)}${r3?.noop ? " (noop)" : ""} · ${v.actual}`);
  });

  // ════════ MA4b (R1 F1 · ชุด B · ORACLE-EDIT ผู้คุม 23.10 CD-P51-O7) ใช้บางส่วน → คืน → รับใหม่ ════════
  await blk("MA4b", async () => {
    if (fx) return void chk("MA4b", false, "fixture", FXB(""));
    const ctxB = { tenantId: T, unitId: U.B4 };
    const svc = await P.bookingService.create({ data: { tenantId: T, unitId: U.B4, name: `บริการ MA4b ${RAND}`, durationMin: 60, priceSatang: 200_000, depositSatang: 50_000 } });
    const stf = await P.bookingStaff.create({ data: { tenantId: T, unitId: U.B4, name: `ช่าง MA4b ${RAND}` } });
    const ap = must("createAppointment", await bookingMod.createAppointment({ tenantId: T, unitId: U.B4, serviceId: svc.id, staffId: stf.id, dateStr: addDays(TODAY, 2), startMin: 720, customerName: `ลูกค้า MA4b ${RAND}`, customerPhone: `0823${rnd(6)}` }));
    const r1 = must("recordDeposit", await call(bookingMod, "recordDeposit", ctxB, ap.id));
    const R0 = String(r1.saleId ?? "");
    const ctl = await call(bookingMod, "recordDeposit", ctxB, ap.id); // ตัวควบคุม: รับซ้ำโดยไม่มีการคืน = no-op ใบเดิม
    must("ใช้มัดจำ 10,000", await call(posSvc, "createSale", { tenantId: T, unitId: U.B4, systemId: S.POS, idempotencyKey: newKey("ma4b"), lines: [{ name: `ใช้มัดจำ MA4b ${RAND}`, qty: 1, unitPriceSatang: 10_000 }], payMethods: [{ type: "DEPOSIT", amountSatang: 10_000, refSaleId: R0 }] }));
    const r2 = must("refundDeposit", await call(bookingMod, "refundDeposit", ctxB, ap.id));
    const r3 = await call(bookingMod, "recordDeposit", ctxB, ap.id);
    const row = await P.appointment.findUnique({ where: { id: ap.id } });
    const nsale = r3?.saleId ? await P.posSale.findUnique({ where: { id: String(r3.saleId) } }) : null;
    const linked: Any = row?.depositSaleId ? await P.posDeposit.findUnique({ where: { receiptSaleId: row.depositSaleId } }).catch(() => null) : null;
    const old: Any = R0 ? await P.posDeposit.findUnique({ where: { receiptSaleId: R0 } }).catch(() => null) : null;
    const v = V.MA4b({ ctlNoop: ctl?.noop === true, ctlSame: String(ctl?.saleId ?? "") === R0, newReceipt: !!r3?.saleId && String(r3.saleId) !== R0, newStatus: nsale?.status ?? null, newAmount: Number(nsale?.grandTotalSatang ?? 0), paidAt: !!row?.depositPaidAt, linkedNew: !!row?.depositSaleId && row.depositSaleId !== R0 && row.depositSaleId === String(r3?.saleId ?? ""), linkedStatus: linked?.status ?? null, oldStatus: old?.status ?? null, deposit: 50_000 });
    chk("MA4b", v.ok, v.expected, `รับ ${codeOf(r1)} → ซ้ำ ${codeOf(ctl)}${ctl?.noop ? " (noop)" : ""} → ใช้ 10,000 → คืน ${codeOf(r2)} → รับอีก ${codeOf(r3)} · ${v.actual}`);
  });

  // ════════ ORACLE-EDIT ผู้คุม 23.10 (CD-P51-O8 · R1 ของชุด B F3 · fix batch C) ตัวช่วยของ MA12 MA12b MA13 MA14 ════════
  /** บิลขายที่จ่ายด้วยแถว DEPOSIT อ้างใบรับนี้ (บิลริบ/บิลปิด) */
  const forfeitBillsOf = async (receiptId: string): Promise<Any[]> => {
    if (!receiptId) return [];
    const pays = (await P.posPayment.findMany({ where: { tenantId: T, type: "DEPOSIT", refSaleId: receiptId }, select: { saleId: true } }).catch(() => [])) as Any[];
    const ids = [...new Set(pays.map((p: Any) => String(p.saleId)))];
    return ids.length ? ((await P.posSale.findMany({ where: { tenantId: T, id: { in: ids }, docType: "SALE" }, include: { lines: true, payments: true } }).catch(() => [])) as Any[]) : [];
  };
  const depOf = async (receiptId: string): Promise<Any> => (receiptId ? P.posDeposit.findUnique({ where: { receiptSaleId: receiptId } }).catch(() => null) : null);
  const leftOf = (d: Any): number => (d ? Number(d.amountSatang) - Number(d.usedSatang) - Number(d.refundedSatang) : -1);
  const bookingAppt = async (label: string, startMin: number): Promise<Any> => {
    const svc = await P.bookingService.create({ data: { tenantId: T, unitId: U.B, name: `บริการ ${label} ${RAND}`, durationMin: 60, priceSatang: 200_000, depositSatang: 50_000 } });
    const stf = await P.bookingStaff.create({ data: { tenantId: T, unitId: U.B, name: `ช่าง ${label} ${RAND}` } });
    return must("createAppointment", await bookingMod.createAppointment({ tenantId: T, unitId: U.B, serviceId: svc.id, staffId: stf.id, dateStr: addDays(TODAY, 3), startMin, customerName: `ลูกค้า ${label} ${RAND}`, customerPhone: `0831${rnd(6)}` }));
  };
  /** ปุ่มสถานะบนจอจริง (setStatusAction · คุกกี้ OWNER) */
  const setStatusVia = async (apId: string, status: string): Promise<string> => {
    const fd = new FormData();
    fd.set("id", apId);
    fd.set("status", status);
    try {
      await inScope(US.OWNER!.cookie, `/app/u/${SLUG.B}/booking`, () => bookingAct.setStatusAction(SLUG.B, fd));
      return "ok";
    } catch (e) {
      return `โยน ${String((e as Error)?.message ?? e).slice(0, 60)}`;
    }
  };
  const hotelDeposit = async (label: string, roomNo: string, fromDay: number): Promise<{ rvId: string; receiptId: string }> => {
    const rt = await hotelMod.createRoomType({ tenantId: T, unitId: U.H, name: `ห้อง ${label} ${RAND}`, capacity: 2, baseRateSatang: 100_000, depositSatang: 50_000 });
    must("createRoom", await hotelMod.createRoom({ tenantId: T, unitId: U.H, roomTypeId: rt.id, number: roomNo }));
    const rv = must("createReservation", await hotelMod.createReservation({ tenantId: T, unitId: U.H, roomTypeId: rt.id, checkInDate: addDays(TODAY, fromDay), checkOutDate: addDays(TODAY, fromDay + 2), guestName: `แขก ${label} ${RAND}`, guestPhone: `0832${rnd(6)}` }));
    const d = must("recordDeposit", await call(hotelMod, "recordDeposit", T, U.H, rv.id));
    return { rvId: String(rv.id), receiptId: String(d.saleId ?? "") };
  };

  // ════════ MA12 (R1 F3 · ชุด C · CD-P51-O8a) จองคิว NO_SHOW ⇒ ริบมัดจำเป็นรายได้ ════════
  await blk("MA12", async () => {
    if (fx) return void chk("MA12", false, "fixture", FXB(""));
    const ap = await bookingAppt("MA12", 600);
    must("recordDeposit", await call(bookingMod, "recordDeposit", { tenantId: T, unitId: U.B }, ap.id));
    const R = String((await P.appointment.findUnique({ where: { id: ap.id } }))?.depositSaleId ?? "");
    const act = await setStatusVia(ap.id, "NO_SHOW");
    await pump();
    const bills = await forfeitBillsOf(R);
    const b: Any = bills[0] ?? null;
    const jvF = b ? await jvLines([String(b.id)]) : [];
    const jvAll = await jvLines([R, ...(b ? [String(b.id)] : [])]);
    const d = await depOf(R);
    const audits = d ? Number(await P.auditLog.count({ where: { tenantId: T, action: "pos.deposit.forfeit", targetId: d.id } }).catch(() => -1)) : 0;
    const again = await call(bookingMod, "setAppointmentStatus", T, U.B, ap.id, "NO_SHOW"); // NO_SHOW ซ้ำ (บริการตรง) = ไม่มีบิลที่สอง
    await pump();
    const after = await forfeitBillsOf(R);
    const sp = split(50_000);
    const v = V.MA12({
      bills: bills.length,
      status: b?.status ?? null,
      grand: Number(b?.grandTotalSatang ?? 0),
      lineName: b ? (b.lines?.length === 1 ? String(b.lines[0].name) : `${b.lines?.length ?? 0} บรรทัด`) : null,
      pays: ((b?.payments ?? []) as Any[]).map((p: Any) => `${p.type}:${p.amountSatang}`),
      glIncome: netCr(jvF, (c) => c.startsWith("4")),
      net2200: netCr(jvAll, (c) => c === "2200"),
      net2110: netCr(jvAll, (c) => c === "2110"),
      left: leftOf(d),
      depStatus: d?.status ?? null,
      audits,
      billsAfterRepeat: after.length,
      deposit: 50_000,
      base: sp.baseSatang,
      vat: sp.vatSatang,
    });
    chk("MA12", !!R && v.ok, v.expected, `${R ? "" : "fixture: ไม่มีใบรับ · "}action NO_SHOW ${act} · ซ้ำ ${codeOf(again)} · ${v.actual}`);
  });

  // ════════ MA12b (R1 F3 · ชุด C · CD-P51-O8b · ตัวควบคุมบวก) ยกเลิก ⇒ มัดจำยัง OPEN ════════
  await blk("MA12b", async () => {
    if (fx) return void chk("MA12b", false, "fixture", FXB(""));
    const caseOf = async (name: string, receiptId: string, cancelOk: boolean): Promise<Any> => {
      await pump();
      const d = await depOf(receiptId);
      return { name, cancelOk: cancelOk && !!receiptId, depStatus: d?.status ?? null, left: leftOf(d), forfeitBills: (await forfeitBillsOf(receiptId)).length, deposit: 50_000 };
    };
    const cases: Any[] = [];
    const b = await step("MA12b จองคิว", async () => {
      const ap = await bookingAppt("MA12b", 660);
      must("recordDeposit", await call(bookingMod, "recordDeposit", { tenantId: T, unitId: U.B }, ap.id));
      const act = await setStatusVia(ap.id, "CANCELLED");
      const row = await P.appointment.findUnique({ where: { id: ap.id } });
      return caseOf("จองคิว", String(row?.depositSaleId ?? ""), act === "ok" && row?.status === "CANCELLED");
    });
    if (b) cases.push(b);
    const h = await step("MA12b โรงแรม", async () => {
      const x = await hotelDeposit("MA12b", "212", 5);
      const c = await call(hotelMod, "cancelReservation", T, U.H, x.rvId, `ลูกค้ายกเลิก MA12b ${RAND}`);
      return caseOf("โรงแรม", x.receiptId, c?.ok === true);
    });
    if (h) cases.push(h);
    const rr = await step("MA12b เช่า", async () => {
      const ctxR = { tenantId: T, unitId: U.R };
      const as = await rentalMod.createAsset(ctxR, { name: `ของเช่า MA12b ${RAND}`, dailyRateSatang: 100_000, depositSatang: 50_000 });
      const start = new Date(Date.now() + 5 * 86_400_000);
      const bk = await rentalMod.createBooking(ctxR, { assetId: as.id, customerName: `ผู้เช่า MA12b ${RAND}`, customerPhone: `0833${rnd(6)}`, startDate: start, endDate: new Date(start.getTime() + 2 * 86_400_000) });
      const d = must("recordRentalDeposit", await call(rentalMod, "recordRentalDeposit", ctxR, bk.id));
      const c = await call(rentalMod, "cancelBooking", ctxR, bk.id);
      return caseOf("เช่า", String(d.saleId ?? ""), c === true);
    });
    if (rr) cases.push(rr);
    const v = V.MA12b({ cases });
    chk("MA12b", v.ok, v.expected, `${cases.length === 3 ? "" : `fixture: ${cases.length}/3 กรณี · `}${v.actual}`);
  });

  // ════════ MA13 (R1 F3 · ชุด C · CD-P51-O8c) หน้าขาย "ริบมัดจำ" ของมัดจำโมดูลที่ OPEN ════════
  await blk("MA13", async () => {
    if (fx) return void chk("MA13", false, "fixture", FXB(""));
    const x = await hotelDeposit("MA13", "213", 8);
    must("cancelReservation", await call(hotelMod, "cancelReservation", T, U.H, x.rvId, `ลูกค้ายกเลิก MA13 ${RAND}`));
    const R = x.receiptId;
    const dep0 = await depOf(R);
    const depositId = String(dep0?.id ?? "none");
    const ctxH = { tenantId: T, systemId: S.POS, unitId: U.H };
    const cashier = { userId: uid("CASH"), role: "STAFF", unitAccess: [U.H], permissions: { "pos.sale.create": true } };
    const mgr = { userId: uid("MGR"), role: "MANAGER", unitAccess: [U.H], permissions: {} };
    const reason = `ลูกค้ายกเลิกกระชั้นชิด MA13 ${RAND}`;
    const nb = async () => (await forfeitBillsOf(R)).length;
    // ORACLE-EDIT ผู้คุม 23.10 (CD-P51-O10 · RC F6 F9): ผู้จัดการสาขาอื่น (สาขา A) ขอสาขา H = ถูกปฏิเสธ · เปิดค่าคอมฯ พนักงานระหว่างข้อนี้ ⇒ บิลริบไม่ลง ACCRUE ◂
    const mgrX = { userId: uid("MGR"), role: "MANAGER", unitAccess: [U.A], permissions: {} };
    const ox = await call(depositMod, "registerForfeitDeposit", ctxH, mgrX, { depositId, reason, idempotencyKey: newKey("ma13x") });
    await patchPos((pos) => void (pos.staffCommission = { enabled: true, defaultBp: 500, sellerRoles: ["STAFF", "MANAGER", "OWNER"] }));
    const a = await call(depositMod, "registerForfeitDeposit", ctxH, cashier, { depositId, reason, idempotencyKey: newKey("ma13a") });
    const aB = await nb();
    const b = await call(depositMod, "registerForfeitDeposit", ctxH, mgr, { depositId, reason: "   ", idempotencyKey: newKey("ma13b") });
    const bB = await nb();
    const c = await call(depositMod, "registerForfeitDeposit", ctxH, mgr, { depositId, reason, idempotencyKey: newKey("ma13c") });
    await pump();
    await patchPos((pos) => void (pos.staffCommission = { enabled: false }));
    const bills = await forfeitBillsOf(R);
    const accrue = bills[0] ? ((await P.posStaffCommission.findMany({ where: { tenantId: T, saleId: bills[0].id, kind: "ACCRUE" } }).catch(() => [])) as Any[]).reduce((t: number, x: Any) => t + Number(x.amountSatang), 0) : 0;
    const d = await depOf(R);
    const au: Any = d ? await P.auditLog.findFirst({ where: { tenantId: T, action: "pos.deposit.forfeit", targetId: d.id } }).catch(() => null) : null;
    const again = await call(depositMod, "registerForfeitDeposit", ctxH, mgr, { depositId, reason, idempotencyKey: newKey("ma13d") });
    const againB = await nb();
    const v = V.MA13({
      cashier: codeOf(a),
      cashierBills: aB,
      noReason: codeOf(b),
      noReasonBills: bB,
      mgr: codeOf(c),
      mgrBills: bills.length,
      grand: Number(bills[0]?.grandTotalSatang ?? 0),
      left: leftOf(d),
      depStatus: d?.status ?? null,
      auditReason: au?.after && typeof au.after === "object" ? String((au.after as Any).reason ?? "") : null,
      reason,
      auditActorOk: !!au && au.actorId === uid("MGR"),
      againBills: againB,
      deposit: 50_000,
      otherBranch: codeOf(ox),
      accrue,
    });
    chk("MA13", !!dep0 && v.ok, v.expected, `${dep0 ? `มัดจำ ${dep0.status} ${leftOf(dep0)}` : "fixture: ไม่มีมัดจำ"} · ซ้ำ ${codeOf(again)} · ${v.actual}`);
  });

  // ════════ ORACLE-EDIT ผู้คุม 23.10 (CD-P51-O10 · R1 ของชุด C F1–F9) MA12c MA12d MA12e MA12f MA13b ════════
  let VIP10 = "";
  const ensureVip10 = async (): Promise<string> => {
    if (VIP10) return VIP10;
    const t = await tierMod.createTierDef(ctxM, A("OWNER"), { key: "vip10", name: "VIP 10", color: "AMBER", legacyTier: "PLATINUM" });
    await tierMod.setBenefits(ctxM, A("OWNER"), t.id, [{ type: "DISCOUNT_PCT", config: { pct: 10, maxSatang: 10_000_000 } }]);
    VIP10 = String(t.id);
    return VIP10;
  };
  /** นัดของสมาชิกระดับ 10% (สาขา BM ผูกสมาชิก+แต้ม) + มัดจำ 50,000 */
  const tierDeposit = async (label: string, startMin: number): Promise<Any> => {
    const svc = await P.bookingService.create({ data: { tenantId: T, unitId: U.BM, name: `บริการ ${label} ${RAND}`, durationMin: 60, priceSatang: 200_000, depositSatang: 50_000 } });
    const stf = await P.bookingStaff.create({ data: { tenantId: T, unitId: U.BM, name: `ช่าง ${label} ${RAND}` } });
    const ap = must("createAppointment", await bookingMod.createAppointment({ tenantId: T, unitId: U.BM, serviceId: svc.id, staffId: stf.id, dateStr: addDays(TODAY, 4), startMin, customerName: `สมาชิก ${label} ${RAND}`, customerPhone: `0841${rnd(6)}` }));
    const cid = String((await P.appointment.findUnique({ where: { id: ap.id } }))?.customerId ?? "");
    let tierApplied = false;
    if (cid) {
      const vip = await ensureVip10();
      const tc = await tierMod.applyTierChange(ctxM, cid, vip, "MANUAL", { qc: TAG }, { byUserId: uid("OWNER") });
      tierApplied = tc?.changed === true;
    }
    const r = must("recordDeposit", await call(bookingMod, "recordDeposit", { tenantId: T, unitId: U.BM }, ap.id));
    await pump();
    const spent0 = cid ? Number((await P.customer.findUnique({ where: { id: cid }, select: { totalSpentSatang: true } }))?.totalSpentSatang ?? 0) : 0;
    return { ap, cid, R: String(r.saleId ?? ""), tierApplied, spent0 };
  };
  const memberEffects = async (x: Any, forfeit: string): Promise<Any> => {
    await pump();
    const bills = await forfeitBillsOf(x.R);
    const b: Any = bills[0] ?? null;
    const d = await depOf(x.R);
    const points = b ? ((await P.pointLedger.findMany({ where: { tenantId: T, refType: "PosSale", refId: b.id, type: "EARN" } }).catch(() => [])) as Any[]).reduce((t: number, l: Any) => t + Number(l.delta ?? 0), 0) : 0;
    const timeline = b ? Number(await P.memberActivity.count({ where: { tenantId: T, refType: "PosSale", refId: b.id } }).catch(() => -1)) : 0;
    const spent1 = x.cid ? Number((await P.customer.findUnique({ where: { id: x.cid }, select: { totalSpentSatang: true } }))?.totalSpentSatang ?? 0) : 0;
    return { forfeit, bills: bills.length, grand: Number(b?.grandTotalSatang ?? 0), discount: Number(b?.discountSatang ?? 0), left: leftOf(d), depStatus: d?.status ?? null, points: points + Number(b?.pointEarned ?? 0), spentDelta: spent1 - x.spent0, timeline, tierApplied: x.tierApplied && !!x.cid, deposit: 50_000 };
  };

  // ════════ MA12c (RC F1 F2) สมาชิกระดับ · NO_SHOW ⇒ ริบเต็ม · ไม่มีผลข้างเคียงสมาชิก ════════
  await blk("MA12c", async () => {
    if (fx) return void chk("MA12c", false, "fixture", FXB(""));
    const x = await tierDeposit("MA12c", 600);
    const r = await call(bookingMod, "setAppointmentStatus", T, U.BM, x.ap.id, "NO_SHOW");
    const e = await memberEffects(x, "?");
    e.forfeit = e.bills === 1 ? "ok" : short(r?.forfeit?.reason ?? r?.reason ?? r, 80);
    const v = V.MA12c(e);
    chk("MA12c", v.ok, v.expected, v.actual);
  });

  // ════════ MA13b (RC F1 F2) หน้าขาย ริบมัดจำสมาชิกระดับ ════════
  await blk("MA13b", async () => {
    if (fx) return void chk("MA13b", false, "fixture", FXB(""));
    const x = await tierDeposit("MA13b", 660);
    const d0 = await depOf(x.R);
    const mgr = { userId: uid("MGR"), role: "MANAGER", unitAccess: [U.BM], permissions: {} };
    const r = await call(depositMod, "registerForfeitDeposit", { tenantId: T, systemId: S.POS, unitId: U.BM }, mgr, { depositId: String(d0?.id ?? "none"), reason: `ไม่มาตามนัด MA13b ${RAND}` });
    const e = await memberEffects(x, codeOf(r));
    const v = V.MA13b(e);
    chk("MA13b", v.ok, v.expected, `${v.actual}${r?.ok === false ? ` (${short(r.message, 80)})` : ""}`);
  });

  // ════════ MA12d (RC F3) void บิลริบ → NO_SHOW อีกครั้ง = บิลใหม่ ════════
  await blk("MA12d", async () => {
    if (fx) return void chk("MA12d", false, "fixture", FXB(""));
    const ap = await bookingAppt("MA12d", 780);
    must("recordDeposit", await call(bookingMod, "recordDeposit", { tenantId: T, unitId: U.B }, ap.id));
    const R = String((await P.appointment.findUnique({ where: { id: ap.id } }))?.depositSaleId ?? "");
    await call(bookingMod, "setAppointmentStatus", T, U.B, ap.id, "NO_SHOW");
    await pump();
    const b1: Any = (await forfeitBillsOf(R))[0] ?? null;
    const vd = b1 ? await call(posSvc, "voidSale", T, U.B, b1.id) : { ok: false, code: "NO_BILL" };
    await pump();
    const dV = await depOf(R);
    const b1s = b1 ? (await P.posSale.findUnique({ where: { id: b1.id }, select: { status: true } }))?.status : null;
    await call(bookingMod, "setAppointmentStatus", T, U.B, ap.id, "NO_SHOW");
    await pump();
    const nb: Any = (await forfeitBillsOf(R)).find((b: Any) => b.id !== b1?.id) ?? null;
    const d = await depOf(R);
    const v = V.MA12d({ firstVoided: b1s === "VOIDED", restored: dV?.status === "OPEN" && leftOf(dV) === 50_000, newBill: !!nb, newStatus: nb?.status ?? null, left: leftOf(d), depStatus: d?.status ?? null });
    chk("MA12d", !!b1 && v.ok, v.expected, `${b1 ? "" : "fixture: ไม่มีบิลริบแรก · "}void ${codeOf(vd)} · ${v.actual}`);
  });

  // ════════ MA12e (RC F4) NO_SHOW → CONFIRMED ⇒ void บิลริบ · DONE ใช้มัดจำ ════════
  await blk("MA12e", async () => {
    if (fx) return void chk("MA12e", false, "fixture", FXB(""));
    const ap = await bookingAppt("MA12e", 840);
    must("recordDeposit", await call(bookingMod, "recordDeposit", { tenantId: T, unitId: U.B }, ap.id));
    const R = String((await P.appointment.findUnique({ where: { id: ap.id } }))?.depositSaleId ?? "");
    await call(bookingMod, "setAppointmentStatus", T, U.B, ap.id, "NO_SHOW");
    await pump();
    const b1: Any = (await forfeitBillsOf(R))[0] ?? null;
    const rc = await setStatusVia(ap.id, "CONFIRMED"); // ORACLE-EDIT ผู้คุม 23.10 (CD-P51-O10b · F10a): ผ่านปุ่มจริง ⇒ ผู้กดลง audit ของ void ◂
    const row = await P.appointment.findUnique({ where: { id: ap.id } });
    const va = b1 ? ((await P.auditLog.findMany({ where: { tenantId: T, action: "pos.sale.void", targetId: b1.id } }).catch(() => [])) as Any[]) : [];
    const voidAudit = `${va.length}:${va[0]?.actorId === uid("OWNER") ? "actor" : String(va[0]?.actorId ?? "-")}:${String((va[0]?.after as Any)?.reason ?? "-")}:${String((va[0]?.after as Any)?.source ?? "-")}`;
    const fst = b1 ? (await P.posSale.findUnique({ where: { id: b1.id }, select: { status: true } }))?.status ?? null : null;
    const dA = await depOf(R);
    const act = await setStatusVia(ap.id, "DONE");
    await pump();
    const done: Any = await P.posSale.findFirst({ where: { tenantId: T, idempotencyKey: `booking-sale-${ap.id}` }, include: { payments: true } }).catch(() => null);
    const bills = (await P.posSale.findMany({ where: { tenantId: T, sourceId: ap.id, docType: "SALE", status: { not: "VOIDED" } } }).catch(() => [])) as Any[];
    const v = V.MA12e({
      statusOk: row?.status === "CONFIRMED",
      forfeitStatus: fst,
      leftAfter: leftOf(dA),
      depStatusAfter: dA?.status ?? null,
      donePays: ((done?.payments ?? []) as Any[]).map((p: Any) => `${p.type}:${p.amountSatang}`),
      revenue: bills.filter((b) => b.sourceModule !== "POS_DEPOSIT").reduce((t, b) => t + Number(b.grandTotalSatang), 0),
      price: 200_000,
      deposit: 50_000,
      voidAudit,
    });
    chk("MA12e", !!b1 && v.ok, v.expected, `${b1 ? "" : "fixture: ไม่มีบิลริบ · "}CONFIRMED → ${short(rc, 80)} · DONE action ${act} · ${v.actual}`);
  });

  // ════════ MA12g (RC F10b · ORACLE-EDIT ผู้คุม 23.10 CD-P51-O10b) บิลริบของหน้าขาย → ออกจาก NO_SHOW ⇒ ปฏิเสธ ════════
  await blk("MA12g", async () => {
    if (fx) return void chk("MA12g", false, "fixture", FXB(""));
    const ap = await bookingAppt("MA12g", 960);
    must("recordDeposit", await call(bookingMod, "recordDeposit", { tenantId: T, unitId: U.B }, ap.id));
    const R = String((await P.appointment.findUnique({ where: { id: ap.id } }))?.depositSaleId ?? "");
    const d0 = await depOf(R);
    const mgr = { userId: uid("MGR"), role: "MANAGER", unitAccess: [U.B], permissions: {} };
    const rf = await call(depositMod, "registerForfeitDeposit", { tenantId: T, systemId: S.POS, unitId: U.B }, mgr, { depositId: String(d0?.id ?? "none"), reason: `ไม่มาตามนัด MA12g ${RAND}` });
    await call(bookingMod, "setAppointmentStatus", T, U.B, ap.id, "NO_SHOW");
    await pump();
    const rc = await call(bookingMod, "setAppointmentStatus", T, U.B, ap.id, "CONFIRMED");
    await pump();
    const row = await P.appointment.findUnique({ where: { id: ap.id } });
    const b: Any = (await forfeitBillsOf(R))[0] ?? null;
    const d = await depOf(R);
    const v = V.MA12g({ regForfeit: codeOf(rf), refused: rc?.ok === false, message: String(rc?.reason ?? rc?.message ?? ""), apptStatus: row?.status ?? null, billStatus: b?.status ?? null, depStatus: d?.status ?? null });
    chk("MA12g", v.ok, v.expected, `${v.actual} · บิล ${b?.sourceModule ?? "-"}`);
  });

  // ════════ MA12f (RC F5) ริบล้มทางจอ ⇒ เหตุผลบนจอ + OpsEvent WARN ════════
  await blk("MA12f", async () => {
    if (fx) return void chk("MA12f", false, "fixture", FXB(""));
    const ap = await bookingAppt("MA12f", 900);
    must("recordDeposit", await call(bookingMod, "recordDeposit", { tenantId: T, unitId: U.B }, ap.id));
    const R = String((await P.appointment.findUnique({ where: { id: ap.id } }))?.depositSaleId ?? "");
    let redirectErr = false;
    let note = "ไม่โยน";
    await setShift(true);
    try {
      const fd = new FormData();
      fd.set("id", ap.id);
      fd.set("status", "NO_SHOW");
      await inScope(US.OWNER!.cookie, `/app/u/${SLUG.B}/booking`, () => bookingAct.setStatusAction(SLUG.B, fd));
    } catch (e) {
      const dg = String((e as Any)?.digest ?? (e as Error)?.message ?? "");
      redirectErr = dg.includes("NEXT_REDIRECT") && dg.includes("err=");
      note = dg.slice(0, 80);
    } finally {
      await setShift(false);
    }
    await pump();
    const ops = Number(await P.opsEvent.count({ where: { tenantId: T, source: "pos.deposit.forfeit_failed" } }).catch(() => -1));
    const d = await depOf(R);
    const v = V.MA12f({ redirectErr, ops, depStatus: d?.status ?? null, left: leftOf(d), deposit: 50_000 });
    chk("MA12f", v.ok, v.expected, `${v.actual} · (${note})`);
  });

  // ════════ MA5 (F5 · ชุด B) createSale ล้มหลัง commit สถานะ → ไม่มีบิลตลอดไป ════════
  await blk("MA5", async () => {
    if (fx) return void chk("MA5", false, "fixture", FXB(""));
    const ctxK = { tenantId: T, unitId: U.K };
    const ev = await ticketMod.createEvent(ctxK, { name: `งาน MA5 ${RAND}`, startAt: new Date(Date.now() + 7 * 86_400_000) });
    const tt = await ticketMod.addTicketType(ctxK, ev.id, { name: `บัตร ${RAND}`, priceSatang: 30_000, quota: 50 });
    const od = must("createOrder", await ticketMod.createOrder(ctxK, { eventId: ev.id, buyerName: `ผู้ซื้อ MA5 ${RAND}`, buyerPhone: `0815${rnd(6)}`, lines: [{ ticketTypeId: tt.id, qty: 1 }], channel: "STAFF", markPaid: false }));
    const rt = await hotelMod.createRoomType({ tenantId: T, unitId: U.H5, name: `ห้อง MA5 ${RAND}`, capacity: 2, baseRateSatang: 80_000, depositSatang: 0 });
    const room = must("createRoom", await hotelMod.createRoom({ tenantId: T, unitId: U.H5, roomTypeId: rt.id, number: "501" }));
    const rv = must("createReservation", await hotelMod.createReservation({ tenantId: T, unitId: U.H5, roomTypeId: rt.id, checkInDate: TODAY, checkOutDate: addDays(TODAY, 1), guestName: `แขก MA5 ${RAND}`, guestPhone: `0816${rnd(6)}` }));
    must("checkIn", await call(hotelMod, "checkIn", T, U.H5, rv.id, room.id));
    let t1: Any;
    let h1: Any;
    await setShift(true);
    try {
      t1 = await call(ticketMod, "markPaid", ctxK, od.orderId);
      h1 = await call(hotelMod, "checkOut", T, U.H5, rv.id);
    } finally {
      await setShift(false);
    }
    const t2 = await call(ticketMod, "markPaid", ctxK, od.orderId);
    const h2 = await call(hotelMod, "checkOut", T, U.H5, rv.id);
    const failed = (r: Any) => r?.ok === false;
    const why = (r: Any) => `${r?.code ?? ""}${r?.reason ? ` ${String(r.reason).slice(0, 40)}` : ""}${r?.message ? ` ${String(r.message).slice(0, 50)}` : ""}`.trim();
    const tb = await saleByKey(`ticket-sale-${od.orderId}`);
    const hb = await saleByKey(`hotel-sale-${rv.id}`);
    const tOrder = await P.ticketOrder.findUnique({ where: { id: od.orderId } }).catch(() => null);
    const hRow = await P.hotelReservation.findUnique({ where: { id: rv.id } }).catch(() => null);
    const v = V.MA5({
      cases: [
        { name: `ตั๋ว (ออเดอร์ ${tOrder?.status})`, firstFailed: failed(t1) && /SHIFT/.test(why(t1)), firstCode: why(t1), retry: t2?.undefinedResult ? "คืน undefined" : codeOf(t2), bill: tb?.status ?? null },
        { name: `โรงแรม (การจอง ${hRow?.status})`, firstFailed: failed(h1), firstCode: why(h1), retry: `${codeOf(h2)} ${why(h2)}`.trim(), bill: hb?.status ?? null },
      ],
    });
    chk("MA5", v.ok, v.expected, v.actual);
  });

  // ════════ MA6 (F6 · ชุด B) subscribe ซ้อนจากสองโปรเซส ════════
  await blk("MA6", async () => {
    if (fx || M2S.length !== 5) return void chk("MA6", false, "fixture", FXB(`สมาชิก M2 ×${M2S.length} (คาด 5)`));
    const ctxS = { tenantId: T, systemId: S.MEM };
    const plan = await subMod.createPlan(ctxS, { name: `แพ็กเกจ MA6 ${RAND}`, priceSatang: 30_000, periodDays: 30 });
    // ลูกค้า 5 คน · สองโปรเซสสมัครทุกคนพร้อมกัน ⇒ คู่แข่ง 5 คู่ต่อรอบ (คู่เดียวแพ้ race ได้ — run 1 ของ 23 ต.ค. เขียวโดยบังเอิญ)
    const arg = { ctx: ctxS, inputs: M2S.map((customerId) => ({ customerId, planId: plan.id })) };
    const { results: rs, note } = await twinChildren("sub", [arg, arg]);
    const customers: { active: number; bills: number; satang: number }[] = [];
    for (const cid of M2S) {
      const active = Number(await P.memberSubscription.count({ where: { tenantId: T, customerId: cid, status: "ACTIVE" } }).catch(() => -1));
      const bills = ((await P.posSale.findMany({ where: { tenantId: T, memberId: cid, sourceModule: "MEMBER", docType: "SALE", status: "PAID" } }).catch(() => [])) as Any[]).filter((b) => String(b.idempotencyKey).startsWith("subscription-"));
      customers.push({ active, bills: bills.length, satang: bills.reduce((t, b) => t + Number(b.grandTotalSatang), 0) });
    }
    const codes = rs.flatMap((r) => (Array.isArray(r?.items) ? r.items : [r])).map((r: Any) => (r ? `${codeOf(r)}${r?.message ? ` ${String(r.message).slice(0, 30)}` : ""}` : "ไม่มีผล"));
    const v = V.MA6({ price: 30_000, customers, codes });
    chk("MA6", v.ok && !note, v.expected, `${v.actual}${note ? ` · (ฮาร์เนส) ${note}` : ""}`);
  });

  // ════════ MA7 (F7 · ชุด B) คืนเงินแทรกระหว่าง claim PAID กับ createSale ════════
  await blk("MA7", async () => {
    if (fx) return void chk("MA7", false, "fixture", FXB(""));
    const ctxK = { tenantId: T, unitId: U.K };
    const ev = await ticketMod.createEvent(ctxK, { name: `งาน MA7 ${RAND}`, startAt: new Date(Date.now() + 7 * 86_400_000) });
    const tt = await ticketMod.addTicketType(ctxK, ev.id, { name: `บัตร ${RAND}`, priceSatang: 25_000, quota: 50 });
    const od = must("createOrder", await ticketMod.createOrder(ctxK, { eventId: ev.id, buyerName: `ผู้ซื้อ MA7 ${RAND}`, buyerPhone: `0817${rnd(6)}`, lines: [{ ticketTypeId: tt.id, qty: 1 }], channel: "STAFF", markPaid: false }));
    const key = `ticket-sale-${od.orderId}`;
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));
    let held = false;
    const holder = P.$transaction(
      async (tx: Any) => {
        await tx.$queryRawUnsafe(`SELECT 1 AS x FROM (SELECT pg_advisory_xact_lock(hashtext($1::text || ':' || $2::text))) l`, T, key);
        held = true;
        await gate;
      },
      { timeout: 150_000, maxWait: 30_000 },
    );
    const t0 = Date.now();
    while (!held && Date.now() - t0 < 30_000) await sleep(100);
    const mp = call(ticketMod, "markPaid", ctxK, od.orderId);
    let claimed = false;
    const t1 = Date.now();
    while (!claimed && Date.now() - t1 < 30_000) {
      claimed = (await P.ticketOrder.findUnique({ where: { id: od.orderId }, select: { status: true } }).catch(() => null))?.status === "PAID";
      if (!claimed) await sleep(100);
    }
    await sleep(500); // createSale ถึงล็อกแล้ว (claim commit ก่อน createSale)
    const c = await call(ticketMod, "cancelOrder", ctxK, od.orderId);
    release();
    await holder.catch(() => null);
    const m = await mp;
    const order = await P.ticketOrder.findUnique({ where: { id: od.orderId } }).catch(() => null);
    const bill = await saleByKey(key);
    const v = V.MA7({ orderStatus: String(order?.status ?? "?"), bill: bill?.status ?? null, cancelled: claimed && c?.ok !== false && order?.status !== "PAID" });
    chk("MA7", held && v.ok, v.expected, `${held ? "" : "(ฮาร์เนส) ไม่ได้ล็อก · "}claim PAID ${claimed ? "เห็น" : "ไม่เห็น"} · cancel ${codeOf(c)} · markPaid ${codeOf(m)} · ${v.actual}`);
  });

  // ════════ MA8 (F8 · ชุด A) createSale ไม่มีด่านค่าพื้นฐาน ════════
  await blk("MA8", async () => {
    if (fx) return void chk("MA8", false, "fixture", FXB(""));
    const ln = (name: string, unitPriceSatang: number, qty = 1, discountSatang?: number): Any => ({ name: `${name} ${RAND}`, qty, unitPriceSatang, ...(discountSatang !== undefined ? { discountSatang } : {}) });
    const cases: [string, Any][] = [
      ["qty 0", { lines: [ln("ของ qty0", 10_000, 0), ln("ของคู่ qty0", 1_000)], payMethods: [{ type: "CASH", amountSatang: 1_000 }] }],
      ["ราคาติดลบ", { lines: [ln("ของ ก", 10_000), ln("ของติดลบ", -5_000)], payMethods: [{ type: "CASH", amountSatang: 5_000 }] }],
      ["ส่วนลดบรรทัด > ราคา", { lines: [ln("ของลดเกิน", 10_000, 1, 15_000), ln("ของ ข", 20_000)], payMethods: [{ type: "CASH", amountSatang: 15_000 }] }],
      ["ส่วนลดท้ายบิล > ยอด", { lines: [ln("ของ ค", 10_000)], billDiscountSatang: 15_000, serviceChargeSatang: 9_000, payMethods: [{ type: "CASH", amountSatang: 4_000 }] }],
      ["แถวชำระติดลบ", { lines: [ln("ของ ง", 100)], payMethods: [{ type: "CASH", amountSatang: -100 }, { type: "TRANSFER", amountSatang: 200 }] }],
    ];
    const out: { name: string; code: string; bill: boolean }[] = [];
    for (const [name, extra] of cases) {
      const k = newKey("ma8");
      const r = await call(posSvc, "createSale", { tenantId: T, unitId: U.A, systemId: S.POS, idempotencyKey: k, ...extra });
      const b = await saleByKey(k);
      out.push({ name, code: r?.ok === false ? String(r.code) : "ok", bill: b?.status === "PAID" });
    }
    const v = V.MA8({ cases: out });
    chk("MA8", v.ok, v.expected, v.actual);
  });

  // ════════ MA10 (F10 · ชุด D) ทิปถูกตัดจากแถวบัตร ════════
  await blk("MA10", async () => {
    if (fx || !GC || !ctxMod?.callerTx) return void chk("MA10", false, "fixture", FXB(`บัตร ${GC ? "ok" : "-"} · callerTx ${ctxMod?.callerTx ? "ok" : "-"}`));
    const card = GC as { id: string; number: string; pin: string };
    await patchPos((pos) => void (pos.tip = { enabled: true, ledgerAccountId: S.TIPL }));
    const k = newKey("ma10");
    const input: Any = {
      tenantId: T,
      unitId: U.A,
      systemId: S.POS,
      idempotencyKey: k,
      lines: [{ name: `อาหาร MA10 ${RAND}`, qty: 1, unitPriceSatang: 15_000 }],
      tipSatang: 1_000,
      payMethods: [{ type: "CASH", amountSatang: 11_000 }, { type: "GIFT_CARD", amountSatang: 5_000, giftCard: { number: card.number, pin: card.pin } }],
    };
    let saleId = "";
    let err = "";
    try {
      // บิล + ปิดบัญชีพักทิปในธุรกรรมเดียวกัน ⇒ ตัวระบายใดก็ตามเห็น "ไม่มีบัญชีพักทิปตอนระบาย" แน่นอน (ไม่แข่งกับ drain เบื้องหลัง)
      await P.$transaction(
        async (tx: Any) => {
          const r = await posSvc.createSale(input, ctxMod.callerTx(tx));
          saleId = String(r?.saleId ?? "");
          await patchPos((pos) => void (pos.tip = { enabled: true, ledgerAccountId: null }), tx);
        },
        { timeout: 60_000, maxWait: 20_000 },
      );
    } catch (e) {
      err = `${errCode(e)} ${String((e as Error)?.message ?? e).slice(0, 100)}`;
    }
    await patchPos((pos) => void (pos.tip = { enabled: false, ledgerAccountId: null })).catch(() => null);
    if (!saleId) return void chk("MA10", false, "fixture: บิลบัตร+ทิป", `createSale ล้ม ${err}`);
    await pump();
    const jv = (await jvLines([saleId])).filter((e: Any) => String(e.idempotencyKey ?? "").endsWith("#PAID") || !e.idempotencyKey);
    const v = V.MA10({ dr2110: netDr(jv, "2110"), dr1000: netDr(jv, "1000"), gift: 5_000, cash: 11_000, tip: 1_000, posted: jv.length > 0 });
    chk("MA10", v.ok, v.expected, `${v.actual} · JV ${jv.length} · pump ${pumpErr.length ? short(pumpErr.slice(-2), 120) : "ok"}`);
  });

  // ════════ MA11 (F11 · ชุด D) P2002 ของคีย์ JV ทำทั้ง event ล้ม ════════
  await blk("MA11", async () => {
    if (fx || !ctxMod?.callerTx) return void chk("MA11", false, "fixture", FXB(""));
    const evts: Any[] = [];
    const saleIds: string[] = [];
    for (let i = 0; i < 3; i++) {
      let saleId = "";
      await P.$transaction(
        async (tx: Any) => {
          const r = await posSvc.createSale({ tenantId: T, unitId: U.A, systemId: S.POS, idempotencyKey: newKey("ma11"), lines: [{ name: `ของ MA11-${i} ${RAND}`, qty: 1, unitPriceSatang: 10_700 + i * 100 }], payMethods: [{ type: "CASH", amountSatang: 10_700 + i * 100 }] }, ctxMod.callerTx(tx));
          saleId = String(r?.saleId ?? "");
          // event ของบิลนี้ = ของสองโปรเซสลูกเท่านั้น (ไม่ให้ drain ใดหยิบก่อน)
          await tx.$executeRawUnsafe(`UPDATE "OutboxEvent" SET status = 'DONE', "processedAt" = now() WHERE "tenantId" = $1 AND type = 'pos.sale.paid' AND payload->>'saleId' = $2`, T, saleId);
        },
        { timeout: 60_000, maxWait: 20_000 },
      );
      const row = ((await P.outboxEvent.findMany({ where: { tenantId: T, type: "pos.sale.paid" } }).catch(() => [])) as Any[]).find((e) => e.payload?.saleId === saleId);
      if (row) {
        evts.push(evtOf(row));
        saleIds.push(saleId);
      }
    }
    if (evts.length !== 3) return void chk("MA11", false, "fixture: 3 บิล + event", `ได้ ${evts.length}`);
    const { results: rs, note } = await twinChildren("paid", [{ evts }, { evts }]);
    const flat = rs.flatMap((r) => (Array.isArray(r?.items) ? r.items : [r]));
    const throws = flat.filter((r) => !r || r.ok === false);
    const jvPerBill: number[] = [];
    for (const id of saleIds) jvPerBill.push(Number(await P.accountJournalEntry.count({ where: { tenantId: T, idempotencyKey: `PosSale#${id}#PAID` } }).catch(() => -1)));
    const v = V.MA11({ rounds: 3, throws: throws.length, jvPerBill, codes: throws.map((r) => (r ? `${r.code} ${String(r.message ?? "").slice(0, 50)}` : "ไม่มีผล")) });
    chk("MA11", v.ok && !note, v.expected, `${v.actual}${note ? ` · (ฮาร์เนส) ${note}` : ""}`);
  });

  // ════════ MA9 (F9 · ชุด D) VAT ใบคืนบางส่วนใช้อัตราวันนี้ (ท้ายสุด — เปลี่ยนอัตราของสมุด แล้วคืนค่า) ════════
  await blk("MA9", async () => {
    if (fx) return void chk("MA9", false, "fixture", FXB(""));
    const r = await call(posSvc, "createSale", { tenantId: T, unitId: U.A, systemId: S.POS, idempotencyKey: newKey("ma9"), lines: [{ name: `ของ MA9 ${RAND}`, qty: 4, unitPriceSatang: 100_000 }], payMethods: [{ type: "CASH", amountSatang: 400_000 }] });
    must("createSale MA9", r);
    const sale = await P.posSale.findUnique({ where: { id: r.saleId }, include: { lines: true } });
    const lineId = String(sale?.lines?.[0]?.id ?? "");
    const partials: { grand: number; vat: number; expect: number }[] = [];
    const notes: string[] = [];
    await P.$executeRawUnsafe(`UPDATE "AccountSettings" SET "vatRateBp" = 1000 WHERE "systemId" = $1 AND "tenantId" = $2`, S.ACC, T);
    try {
      for (let i = 0; i < 3; i++) {
        const f = await call(refundMod, "refundSale", ctxA(), A("OWNER"), { saleId: r.saleId, lines: [{ lineId, qty: 1 }], payMethods: [{ type: "CASH", amountSatang: 100_000 }], reasonCode: "CHANGED_MIND", idempotencyKey: newKey("ma9rf") });
        notes.push(codeOf(f));
      }
    } finally {
      await P.$executeRawUnsafe(`UPDATE "AccountSettings" SET "vatRateBp" = 700 WHERE "systemId" = $1 AND "tenantId" = $2`, S.ACC, T);
    }
    const docs = (await P.posSale.findMany({ where: { tenantId: T, docType: "REFUND", refSaleId: r.saleId }, orderBy: { createdAt: "asc" } }).catch(() => [])) as Any[];
    for (const d of docs) partials.push({ grand: Math.abs(Number(d.grandTotalSatang)), vat: Math.abs(Number(d.vatSatang)), expect: split(Math.abs(Number(d.grandTotalSatang)), 700).vatSatang });
    const saleVat = Number(sale?.vatSatang ?? NaN);
    const v = V.MA9({ saleVat, partials });
    chk("MA9", docs.length === 3 && saleVat === split(400_000, 700).vatSatang && v.ok, v.expected, `บิล VAT ${saleVat} (คาด ${split(400_000, 700).vatSatang}) · ใบคืน ${notes.join(",")} · ${v.actual}`);
  });

  // ════════ MA14 (R1 F4 · ชุด C · ORACLE-EDIT ผู้คุม 23.10 CD-P51-O9) วิธีรับของใบรับโมดูล + สรุปวัน + probe GL 1010 ════════
  await blk("MA14", async () => {
    if (fx) return void chk("MA14", false, "fixture", FXB(""));
    const ap = await bookingAppt("MA14", 720);
    const r = must("recordDeposit", await call(bookingMod, "recordDeposit", { tenantId: T, unitId: U.B }, ap.id));
    const R = String(r.saleId ?? "");
    await pump();
    const receiptPays = ((await P.posPayment.findMany({ where: { tenantId: T, saleId: R } }).catch(() => [])) as Any[]).map((p: Any) => String(p.type));
    // ใบรับของโมดูลทั้งร้าน (PosDeposit ของโมดูล = คีย์ dep:mod:…) — ทุกข้อของรอบนี้
    const modIds = ((await P.posDeposit.findMany({ where: { tenantId: T, idempotencyKey: { startsWith: "dep:mod:" } }, select: { receiptSaleId: true } }).catch(() => [])) as Any[]).map((x: Any) => String(x.receiptSaleId));
    const modPays = modIds.length ? ((await P.posPayment.findMany({ where: { tenantId: T, saleId: { in: modIds } } }).catch(() => [])) as Any[]) : [];
    const receiptTransfer = modPays.filter((p: Any) => p.type === "TRANSFER").reduce((t: number, p: Any) => t + Number(p.amountSatang), 0);
    const jv1010 = netDr(await jvLines(modIds), "1010");
    // สรุปวัน vs แถวชำระจริง (บิลของรอบนี้ทั้งหมดเกิดวันนี้)
    const cd = await call(posSvc, "closeDaySummary", { tenantId: T, systemId: S.POS });
    const by = (t: string): number => Number(((cd?.byMethod ?? []) as Any[]).find((m: Any) => m.type === t)?.amountSatang ?? 0);
    const rows = (await P.posPayment.findMany({ where: { tenantId: T, type: { in: ["DEPOSIT", "TRANSFER"] } }, include: { sale: { select: { docType: true, status: true, sourceModule: true, systemId: true } } } }).catch(() => [])) as Any[];
    const mine = rows.filter((p: Any) => p.sale?.systemId === S.POS);
    const sumOf = (pred: (p: Any) => boolean): number => mine.filter(pred).reduce((t: number, p: Any) => t + Number(p.amountSatang), 0);
    const finalSale = (p: Any) => p.sale?.docType === "SALE" && p.sale?.status !== "VOIDED" && p.sale?.sourceModule !== "POS_DEPOSIT";
    const anySale = (p: Any) => p.sale?.docType === "SALE" && p.sale?.status !== "VOIDED";
    const refundDoc = (p: Any) => p.sale?.docType === "REFUND";
    const expectDeposit = sumOf((p) => p.type === "DEPOSIT" && finalSale(p)) - sumOf((p) => p.type === "DEPOSIT" && refundDoc(p));
    const expectTransfer = sumOf((p) => p.type === "TRANSFER" && anySale(p)) - sumOf((p) => p.type === "TRANSFER" && refundDoc(p));
    const v = V.MA14({ receiptPays, moduleDepRows: modPays.filter((p: Any) => p.type === "DEPOSIT").length, reportDeposit: by("DEPOSIT"), expectDeposit, reportTransfer: by("TRANSFER"), expectTransfer, jv1010, receiptTransfer });
    chk("MA14", !!R && cd?.ok !== false && v.ok, v.expected, `${R ? "" : "fixture: ไม่มีใบรับ · "}ใบรับโมดูล ${modIds.length} ใบ · สรุปวัน ${cd?.ok === false ? codeOf(cd) : "ok"} · ${v.actual}`);
  });

  // ════════ MA14b (RC F8b · ORACLE-EDIT ผู้คุม 23.10 CD-P51-O10) สามรายงานตรงกัน — ใบรับโมดูลในกะ + แถวรับแบบเดิม DEPOSIT ════════
  await blk("MA14b", async () => {
    if (fx) return void chk("MA14b", false, "fixture", FXB(""));
    const ctxZ = { tenantId: T, systemId: S.POS, unitId: U.BZ };
    const op = must("openShift", await call(shiftMod, "openShift", ctxZ, A("OWNER"), { deviceId: `qc51-${RAND}-z`, floatSatang: 0 }));
    const shiftId = String(op?.shift?.id ?? "");
    let R = "";
    await setShift(true);
    try {
      const svc = await P.bookingService.create({ data: { tenantId: T, unitId: U.BZ, name: `บริการ MA14b ${RAND}`, durationMin: 60, priceSatang: 200_000, depositSatang: 50_000 } });
      const stf = await P.bookingStaff.create({ data: { tenantId: T, unitId: U.BZ, name: `ช่าง MA14b ${RAND}` } });
      const ap = must("createAppointment", await bookingMod.createAppointment({ tenantId: T, unitId: U.BZ, serviceId: svc.id, staffId: stf.id, dateStr: addDays(TODAY, 3), startMin: 600, customerName: `ลูกค้า MA14b ${RAND}`, customerPhone: `0851${rnd(6)}` }));
      R = String(must("recordDeposit", await call(bookingMod, "recordDeposit", { tenantId: T, unitId: U.BZ }, ap.id)).saleId ?? "");
    } finally {
      await setShift(false);
    }
    await pump();
    const rcpt: Any = R ? await P.posSale.findUnique({ where: { id: R } }) : null;
    await P.posPayment.updateMany({ where: { tenantId: T, saleId: R }, data: { type: "DEPOSIT" } }); // แถวรับแบบเดิม (ใบรับโมดูลก่อน O9)
    const pick = (rows: Any[], t: string) => Number((rows ?? []).find((m: Any) => m.type === t)?.amountSatang ?? 0);
    const day = await call(posSvc, "closeDaySummary", { tenantId: T, systemId: S.POS, unitIds: [U.BZ] });
    const rpt = await call(reportsMod, "reportPayments", { tenantId: T, systemId: S.POS, unitId: U.BZ }, A("OWNER"), { from: TODAY, to: TODAY });
    const sh = await call(shiftMod, "xReport", ctxZ, A("OWNER"), { shiftId });
    const v = V.MA14b({
      bound: !!shiftId && rcpt?.shiftId === shiftId,
      shift: { t: pick(sh?.report?.byMethod, "TRANSFER"), d: pick(sh?.report?.byMethod, "DEPOSIT") },
      day: { t: pick(day?.byMethod, "TRANSFER"), d: pick(day?.byMethod, "DEPOSIT") },
      rpt: { t: pick(rpt?.report?.rows, "TRANSFER"), d: pick(rpt?.report?.rows, "DEPOSIT") },
      deposit: 50_000,
    });
    chk("MA14b", v.ok, v.expected, `${v.actual} · (${codeOf(day)}/${codeOf(rpt)}/${codeOf(sh)})`);
  });
}

// ═════════════════════════ 7. คืนสภาพ ═════════════════════════
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
    if (!slug.startsWith("posqc-p51-")) {
      rep.err = `slug ${slug} ไม่ใช่ร้านชั่วคราวของ P5.1 — ไม่ลบ`;
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
  await P.$executeRawUnsafe(`UPDATE "CrmCompany" SET "parentCompanyId" = NULL, "mergedIntoId" = NULL WHERE "tenantId" = $1`, tid).catch(() => {});
  let pending = [...tables];
  for (let pass = 0; pass < 14 && pending.length; pass++) {
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
  await P.$executeRawUnsafe(`DELETE FROM "User" WHERE email LIKE $1`, `${slug}-%@qc.invalid`).catch(() => {});
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

// ═════════════════════════ 8. รัน ═════════════════════════
let crashed = "";
let wipe: WipeReport = { tables: 0, left: {}, tenantLeft: 0, err: "" };
let usersLeft = -1;
let sessionsLeft = -1;
console.log(`${SUITE} · PIN ${PIN} · LANE_PIN ${LANE_PIN} · DB ${HOST} · ร้านชั่วคราว ${T_SLUG}`);
try {
  const reg = runRegistry();
  chk("ST1", reg.length === 0, "ทะเบียนครบ", joinP(reg));
  const st = runSelfTest();
  chk("ST2", st.length === 0, "ถูก = เขียว · บั๊ก = แดง ทุกข้อ", joinP(st, `${MA_IDS.length + R1_IDS.length + C_IDS.length + C2_IDS.length} ข้อพลิกได้ครบ`));
  await runDb();
} catch (e) {
  crashed = (e as Error)?.stack?.split("\n").slice(0, 3).join(" | ") ?? String(e);
  console.log(`💥 harness: ${crashed}`);
} finally {
  installFetchGuard();
  try {
    await sleep(1500); // ให้ drain เบื้องหลังของผลิตภัณฑ์จบก่อนลบ
    wipe = await wipeTenant(T, T_SLUG);
    const residue = Object.values(wipe.left).reduce((a, b) => a + Math.abs(b), 0) + wipe.tenantLeft;
    console.log(`  ลบร้านชั่วคราว ${T || "(ไม่ได้สร้าง)"}: ${wipe.tables} ตาราง · แถวค้าง ${residue} ${JSON.stringify(wipe.left)} · Tenant ${wipe.tenantLeft}${wipe.err ? ` · ${wipe.err}` : ""}`);
    await P.$executeRawUnsafe(`DELETE FROM "User" WHERE email LIKE $1`, `${T_SLUG}-%@qc.invalid`).catch(() => {});
    usersLeft = Number(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "User" WHERE email LIKE $1`, `${T_SLUG}-%@qc.invalid`)) as Any[])[0]?.n ?? -1);
    sessionsLeft = Number(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "Session" s WHERE NOT EXISTS (SELECT 1 FROM "User" u WHERE u.id = s."userId")`)) as Any[])[0]?.n ?? -1);
  } catch (e) {
    wipe = { tables: 0, left: {}, tenantLeft: 0, err: `cleanup: ${(e as Error).message.slice(0, 200)}` };
    console.log(`💥 cleanup ${(e as Error).message.slice(0, 200)}`);
  } finally {
    removeFetchGuard();
  }
}
await sleep(200);
const tempLeft = Object.entries(wipe.left).map(([k, v]) => `${k}:${v}`);
chk("Z1", tempLeft.length === 0 && wipe.tenantLeft === 0 && !wipe.err && usersLeft === 0 && sessionsLeft === 0, "ร้านชั่วคราว 0 แถว · Tenant ถูกลบ · User 0 · Session กำพร้า 0", [tempLeft.length ? `เหลือ ${tempLeft.join(", ")}` : `0 แถว (${wipe.tables} ตาราง)`, wipe.tenantLeft ? "Tenant ยังอยู่" : "", wipe.err, `User ${usersLeft}`, `Session กำพร้า ${sessionsLeft}`].filter(Boolean).join(" · "));
const fpAfter = await fingerprint();
const fpDrift = Object.keys(fpBefore).filter((k) => fpBefore[k] !== fpAfter[k]).map((k) => `${k}:${fpBefore[k]}→${fpAfter[k]}`);
const fpErr = Object.values(fpBefore).some((v) => v.startsWith("err"));
chk("Z2", fpDrift.length === 0 && !fpErr, "ลายนิ้วมือเท่าเดิม", fpDrift.length ? `ต่าง ${fpDrift.join(", ")}` : `เท่าเดิม (${Object.entries(fpAfter).map(([k, v]) => `${k}=${v.split(":")[0]}`).join(" ")})`);
for (const c of CHECKS) if (!results.has(c.id)) chk(c.id, false, "ถูกตรวจ", crashed ? `ไม่ถึง (harness ล้ม: ${crashed.slice(0, 80)})` : "ไม่ถึง");
const failed = [...results.entries()].filter(([, r]) => !r.ok).map(([id]) => id);
if (guardHits.length) console.log(`  ⚠️  ตัวกั้นเครือข่ายถูกเรียก ${guardHits.length} ครั้ง: ${[...new Set(guardHits)].join(", ")}`);
if (pumpErr.length) console.log(`  ⚠️  ตัวระบาย (ร้านชั่วคราว) ล้ม ${pumpErr.length}: ${short(pumpErr.slice(0, 4), 300)}`);
console.log(`\n===== ${SUITE} ===== ผ่าน ${results.size - failed.length}/${results.size} · บาทของข้อ MA = สตางค์/100 (${baht(100)} = 100 สตางค์)`);
console.log(
  `JSON_SUMMARY ${JSON.stringify({ suite: SUITE, total: results.size, passed: results.size - failed.length, failed, skipped: false, registered: CHECKS.length, pin: PIN, notWritten: NOT_WRITTEN.map((n) => n.finding), guardHits: guardHits.length, pumpErrors: pumpErr.length, residue: tempLeft.length + wipe.tenantLeft + Math.max(0, usersLeft) })}`,
);
await P.$disconnect?.().catch?.(() => {});
process.exit(failed.length ? 1 : 0);

// ─── หมายเหตุขอบเขต ───
// นอกขอบเขต: F12/F13 (มติ P3.4 — ตัดสินโดยผู้คุม ถ้าจะเปลี่ยนต้องแก้ SY4/SY14 ด้วย) · F14 INFO · สองคีย์ใช้บัตรใบเดียวพร้อมกัน (hunter coverage "not covered") ·
//   lens M-B (ออเดอร์/โต๊ะ/KDS/กะ/คอมมิชชัน/cron) = hunter ใบถัดไป · ไม่มีข้อ UI
