// QC — POS RUN ใบ P1.9: กะ · ลิ้นชักเงิน · X/Z · บังคับปิด · เงินสดเข้า/ออก · เงินสดนอกกะ · เขียนก่อนสร้าง (fail-before) · ผู้เขียนข้อสอบ
// requires: pos-seed
//
// สัญญา: ledger/pos-briefs/pos-brief-P1.9.md (มติร่าง S1–S16 · คำถามเจ้าของ O22–O26 ใช้ค่าปริยายในไฟล์นี้) · pos-brief-COMMON · pos-brief-LANE-RULES
//        docs/modules/14-pos.md §3.4 F1–F8 · §7.7 · :1036 (void เฉพาะกะเปิด) · ledger/POS-CONTRACTS.md C-8 + event :113
//        ledger/REVIEW-HR-V2-DESIGN-2026-10-01.md :235 (PIN เป็นของ HR — ห้ามสร้าง PosStaffPin)
//        โน้ต: ledger/wo-notes/pos-P1.9-oracle.md (รายการข้อ · ผลที่คาดบนฐาน · ชื่อที่ตั้งใหม่ · ความคลาดเคลื่อน)
// ชื่อทุกตัวที่ยังไม่มีในโค้ดถูก "ตั้ง" ในไฟล์นี้ และลงทะเบียนในโน้ตหัวข้อ "Names I had to invent" — ผู้คุมงานต้องรับรองก่อนผู้สร้างเริ่ม
//   ผู้สร้างห้ามแก้ข้อสอบนี้ (ORACLE-EDIT เท่านั้น)
//
// ของที่ใบ P1.9 ต้องส่ง (ข้อสอบนี้คือสัญญา · ย่อจาก brief §2):
//   schema: PosShift (deviceId · shiftNo · status OPEN|CLOSED|FORCE_CLOSED · floatSatang · expected/counted/overShort · countDetail ·
//     countedByMethod · closeNote · closeKey · zNumber · zReport …) · PosCashMovement (kind IN|OUT · amountSatang · reason · idempotencyKey) ·
//     PosShiftCounter (unitId unique · shiftSeq · zSeq) · PosSale.shiftId? · partial unique one_open_shift_per_device (SQL มือ)
//   src/lib/modules/pos/shift.ts (คืนคำปฏิเสธ {ok:false, code, message} ไม่ throw · ctx = RegisterCtx · client ท้ายเป็น PrismaClient ได้):
//     openShift · currentShift · xReport · closeShift · zReport · recordCashMovement · listShifts · offShiftCash · forceCloseStaleShifts
//   createSale input.shiftId? (FOR SHARE · SHIFT_REQUIRED / SHIFT_CLOSED) · voidSale ของบิลในกะที่ไม่ OPEN = SHIFT_CLOSED ·
//   submitRegisterSale ใช้ ctx.deviceId · ตั้งค่า settings.pos.shift.{required.register (ปริยาย = registerV2) · required.otherSources (ปริยาย false) ·
//     blindClose · overShortReasonSatang (ปริยาย 10000) · forceCloseAfterHours (ปริยาย 24)}
//   event pos.shift.opened / pos.shift.closed (+ consumer + ป้าย automation) · สิทธิ์ pos.shift.operate / pos.shift.manage
//   รหัสใหม่: SHIFT_REQUIRED · SHIFT_ALREADY_OPEN · SHIFT_CLOSED · REASON_REQUIRED · DRAWER_INSUFFICIENT
//
// ขอบเขต: ST สถิต · O เปิดกะ · X รายงาน X/เงินที่ควรมี · M เงินเข้า/ออก · C ปิดกะ/Z · F บังคับปิด · R บังคับมีกะ/ผู้เรียกเดิม/นอกกะ ·
//   I ข้ามสาขา/ร้าน · P สิทธิ์ · E event · D ปฏิเสธเป็นข้อมูล · Z คืนสภาพ
//   จอ 07 / 13A = ผู้คุมงานตรวจที่ visual — ไม่อยู่ในข้อสอบนี้
//
// 🔴 กติกาข้อสอบ (แบบเดียวกับ qc-pos-p1.5/p1.6): SKIP เมื่อของ P1.9 ยังไม่มี (exit 0 + เหตุผล) · QC_FORCE=1 = ข้ามด่าน SKIP (ต้องแดงตามเหตุผล ไม่ crash)
//    --list = พิมพ์ทุก id โดยไม่แตะ DB · --no-db = รันเฉพาะข้อสถิต (ST1–ST8) ไม่โหลด env/prisma (exit 1 ถ้าแดง)
//    ตาราง/คอลัมน์ตรวจจาก Prisma DMMF + information_schema (ไม่มี = SKIP/แดงพร้อมเหตุ ไม่ crash) · ก่อนเขียนแถวแรกต้องเป็น host ep-frosty-lab (QC4) เท่านั้น
//    แถวชั่วคราวติดป้าย `qc-p1.9-<rand>` อยู่ในร้าน QC กาแฟ (สาขา/ระบบ POS sandbox 4 สาขา 3 ระบบ) · ลบทั้งหมดใน finally
//    นับแถวร้าน QC ก่อน/หลังต้องเท่ากัน (Z1) + ลายนิ้วมือแถวเดิม (Z2) · การแข่งใช้ PrismaClient คนละตัว (connection จริงคนละเส้น)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";

const SUITE = "qc-pos-p1.9";
const ROOT = process.cwd();
const LIST = process.argv.includes("--list");
const NODB = process.argv.includes("--no-db");
const FORCE = process.env.QC_FORCE === "1";

// ═════════════════════════ ทะเบียนข้อสอบ D(id · X-group · หัวข้อ) — --list พิมพ์ชุดนี้ ═════════════════════════
// X-group: "-" = เชิงหน้าที่ล้วน · X1 idempotency · X2 ข้ามขอบเขต · X3 สิทธิ์ · X4 เงิน · X6 แข่ง (POS-MASTER-PLAN §3)
type Def = readonly [string, string, string];
const D = (id: string, x: string, title: string): Def => [`P1.9-${id}`, x, title] as const;
const CHECKS: readonly Def[] = [
  // ── ST สถิต (ไม่แตะ DB) ──
  D("ST1", "-", "[static · S1] schema: model PosShift (คอลัมน์สัญญาครบ · @@unique [unitId, shiftNo] + [unitId, zNumber]) · enum PosShiftStatus OPEN|CLOSED|FORCE_CLOSED · PosCashMovement (+ @@unique [tenantId, idempotencyKey]) · enum PosCashMoveKind IN|OUT · PosShiftCounter (unitId @unique · shiftSeq · zSeq) · PosSale.shiftId String?"),
  D("ST2", "-", "[static · S1] migration: สร้าง \"PosShift\" · partial unique one_open_shift_per_device ON (\"unitId\",\"deviceId\") WHERE status = 'OPEN' · \"shiftId\" ของ PosSale nullable · ไม่มี DROP/RENAME/SET NOT NULL ในไฟล์ที่แตะ PosShift"),
  D("ST3", "-", "[static · S1] src/lib/core/scope.ts ลงทะเบียน PosShift · PosCashMovement · PosShiftCounter (F1 fail-closed)"),
  D("ST4", "X3", "[static · S14] core/permissions.ts โมดูล pos มี pos.shift.operate และ pos.shift.manage"),
  D("ST5", "-", "[static · S13 S12] outbox-consumers.ts มี consumer pos.shift.opened + pos.shift.closed · automation/labels.ts มีป้ายทั้งคู่ · /api/cron/hourly เรียก forceCloseStaleShifts"),
  D("ST6", "-", "[static · S15] ข้อความ pos.shift.{title open close float expected counted overShort reason cashIn cashOut xReport zReport offShift forced blind required} + pos.register.errors.{shiftRequired shiftAlreadyOpen shiftClosed reasonRequired drawerInsufficient} th+en · en ไม่มีอักษรไทย · refusalMessageKey 5 รหัสใหม่ตรงคีย์"),
  D("ST7", "-", "[static · S3 S5 S15] shift-actions.ts \"use server\" · export async ล้วน · ไม่ throw · 8 action เรียกบริการของมัน + catch · RegisterCtx มี deviceId? · RegisterStatus.shift ไม่ใช่ null ตายตัว · createSale input มี shiftId?"),
  D("ST8", "-", "[static · S14 · ตะเข็บ HR] ไม่มี model PosStaffPin · PosShift ไม่มีคอลัมน์ pin · shift.ts ไม่อ่าน pinCode/hrEmployee (PIN เป็นของ HR verifyPin · P1.15/P3.5)"),
  // ── O เปิดกะ ──
  D("O1", "-", "เปิดกะ: เจ้าของเปิดเครื่อง D1 เงินตั้งต้น ฿2,000 + floatDetail → ok · แถว OPEN ร้าน/สาขา/ระบบ/deviceId ถูก · shiftNo ≥ 1 · openedByUserId · floatSatang 200,000 · floatDetail ตรงตัว · currentShift(D1) = กะนี้"),
  D("O2", "-", "เปิดซ้ำเครื่องเดิม → SHIFT_ALREADY_OPEN พร้อม shiftId ของกะที่เปิดอยู่ · ไม่มีแถวใหม่ · เครื่อง D2 สาขาเดียวกัน → ok กะที่ 2 (หลายกะพร้อมกันต่อสาขา) shiftNo = ของ D1 + 1"),
  D("O3", "X6", "เปิดกะเครื่องเดียวกัน 10 connection พร้อมกัน × 3 รอบ → ok 1 · SHIFT_ALREADY_OPEN 9 · ไม่มีรหัสอื่น · แถว OPEN ของเครื่องนั้น 1 แถว"),
  D("O4", "X4", "ตรวจค่าเปิดกะ: float −1 / 1.5 / \"100\" / 100,000,001 · deviceId สั้น/มีอักขระแปลก · floatDetail รวมไม่เท่า float / ธนบัตรไม่รู้จัก → VALIDATION · ไม่มีแถว"),
  // ── X รายงาน X ──
  D("X1", "X4", "ผูกบิลกับกะของเครื่อง: บิลหน้าขายที่ D1 → shiftId = กะ D1 · ที่ D2 → กะ D2 · บิล HOTEL (createSale เดิม) สาขาเดียวกัน → shiftId null · X ของกะ D1 ไม่นับบิลของ D2 และกลับกัน"),
  D("X2", "X4", "เงินที่ควรมี (S7) = float + เงินรับ − ทอน + นำเข้า − นำออก − คืนเงินสด = float + Σ CASH + เข้า − ออก − คืน = 226,500 (2,000 + 45 + 20 + 500 − 300 บาท) · ตรงกับที่ข้อสอบคำนวณเองจาก DB · ไม่นับ PromptPay/บัตร · บิล void · บิลนอกกะ"),
  D("X3", "X4", "X แยกวิธีชำระ: billCount 3 · salesTotal 13,500 · CASH 2 ใบ 6,500 · PROMPTPAY 1 ใบ 4,000 · CARD (หรือ TRANSFER ถ้ายังไม่มี CARD) 1 ใบ 3,000 · void 1 ใบ 9,000 · cashIn 50,000 · cashOut 30,000 · เรียก X 2 ครั้งได้ตัวเลขเท่าเดิมและไม่เขียนอะไรเลย (กะยัง OPEN · zNumber null)"),
  D("X4", "X3", "blind close (settings.pos.shift.blindClose): แคชเชียร์ (operate ไม่มี manage) เห็น expectedCashSatang = null แต่ตัวเลขอื่นครบ · เจ้าของเห็น 226,500 · ปิด blind แล้วแคชเชียร์เห็นตัวเลข"),
  D("X5", "X4", "รู้จักเงินรับ/ทอน/ทิป (P1.6): X.cashTendered 12,000 · change 5,500 · cashSales 6,500 · tendered − change = cashSales · tipSatang = Σ tip ของบิลในกะ (0)"),
  // ── M เงินสดเข้า/ออก ──
  D("M1", "X1", "นำเงินเข้า ฿500 / ออก ฿300 → แถว PosCashMovement (shiftId · kind · amount · reason · byUserId) · คีย์ซ้ำ payload เดิม → ok duplicated แถวเดิม ไม่มีแถวเพิ่ม · คีย์ซ้ำ payload ต่าง → IDEMPOTENCY_CONFLICT"),
  D("M2", "X4", "ตรวจเงินเข้า/ออก: 0 / −1 / 1.5 / \"100\" / เหตุผลว่าง / 201 ตัว / kind แปลก → VALIDATION · นำออกเกินเงินที่ควรมี → DRAWER_INSUFFICIENT · กะที่ไม่มี → NOT_FOUND · ไม่มีแถวเกิด"),
  // ── C ปิดกะ / Z ──
  D("C1", "X4", "ปิดกะ D2 (ควรมี 106,000 นับได้ 104,500 + เหตุผล) → CLOSED · overShort −1,500 · zNumber 1 (Z แรกของสาขา) · Z = expected/counted/overShort/closedBy/note/billCount 1/cashSales 6,000 · คอลัมน์ของแถวตรงกับ Z · event pos.shift.closed พก overShort/zNumber"),
  D("C2", "X4", "ผลต่างเกินเกณฑ์ไม่มีเหตุผล: ปริยาย ฿100 (ขาด 10,001 สตางค์) → REASON_REQUIRED กะยัง OPEN · ตั้ง overShortReasonSatang 500 → ขาด 501 ไม่มีเหตุผล → REASON_REQUIRED"),
  D("C3", "X4", "ตรวจค่าปิดกะ: countDetail รวมไม่เท่ายอดนับ / ธนบัตร 300 บาท / จำนวน −1 · counted −1 / 1.5 → VALIDATION · กะยัง OPEN · ไม่มี Z"),
  D("C4", "X4", "ปิดกะ D1 นับตรง 226,500 พร้อม countDetail ถูก + countedOther (PROMPTPAY 4,000 · บัตร 2,900) → overShort 0 ไม่ต้องมีเหตุผล · Z.byMethod: PROMPTPAY ผลต่าง 0 · บัตร −100 · countDetail เก็บตรงตัว · ผลต่างของบัตรไม่เข้า overShort"),
  D("C5", "X4", "Z แช่แข็ง: หลังปิด ขายที่ D1 → SHIFT_REQUIRED · createSale(shiftId กะที่ปิด) → SHIFT_CLOSED · เงินเข้า → SHIFT_CLOSED · voidSale บิลในกะ → SHIFT_CLOSED บิลยัง PAID · แก้ยอดจ่ายใน DB ตรง ๆ แล้ว zReport = JSON เดิมทุกไบต์ · ปิดซ้ำคีย์ใหม่ → SHIFT_CLOSED แถวไม่เปลี่ยน"),
  D("C6", "X6", "ปิดกะเดียวกัน 10 connection (คีย์ต่างกัน) × 3 รอบ → ok 1 · SHIFT_CLOSED 9 · zNumber ต่อเนื่อง 1,2,3 ของสาขานั้น · event closed 1 ต่อกะ · ลองซ้ำด้วยคีย์ของผู้ชนะ → ok duplicated zNumber เดิม ไม่มี event เพิ่ม"),
  D("C7", "X6", "ขายแข่งกับปิดกะ: 8 บิลหน้าขาย + ปิดกะ 1 พร้อมกัน → ทุกบิล PAID ที่ผูกกะนี้อยู่ใน Z (billCount/cashSales ตรง DB) · บิลที่ถูกปฏิเสธ = SHIFT_REQUIRED/SHIFT_CLOSED ไม่มีบิล · ไม่มีบิลผูกกะนี้ที่เกิดหลัง closedAt"),
  D("C8", "-", "เลข Z ต่อสาขา: Z ออกตามลำดับปิด (D2 ปิดก่อนได้ 1 แม้เปิดทีหลัง) · ไม่ซ้ำ ไม่ข้ามเลขในแต่ละสาขา · สาขาอื่นเริ่ม 1 ของตัวเอง · PosShiftCounter.zSeq = Z สูงสุด · shiftNo ไม่ซ้ำต่อสาขา"),
  // ── F บังคับปิด ──
  D("F1", "X4", "ขี้เกียจตอนเปิด: กะเปิดค้าง 25 ชม. (มีบิลเงินสด 4,500) → openShift เครื่องเดิม ok กะใหม่ + forceClosedShiftId · กะเก่า FORCE_CLOSED · expected 5,500 · counted/overShort/closedBy = null · มี zNumber · Z.forced true · event closed forced:true"),
  D("F2", "-", "ขี้เกียจตอนขาย: กะค้าง 25 ชม. → ขายที่เครื่องนั้น → SHIFT_REQUIRED ไม่มีบิล · กะนั้นกลายเป็น FORCE_CLOSED"),
  D("F3", "-", "กวาด forceCloseStaleShifts({now, tenantId}): ปิด 25 ชม. · ไม่แตะ 23 ชม. · รอบสองไม่ปิดอะไรเพิ่ม · ตั้ง forceCloseAfterHours 48 → 30 ชม. ไม่ถูกปิด"),
  D("F4", "X4", "กะที่ถูกบังคับปิดจบแล้ว: closeShift → SHIFT_CLOSED · voidSale บิลของกะนั้น → SHIFT_CLOSED บิลยัง PAID · zReport forced true counted null"),
  // ── R บังคับมีกะ / ผู้เรียกเดิม / นอกกะ ──
  D("R1", "X4", "POS ใหม่ (registerV2) ไม่ตั้งค่า: ขายหน้าขายไม่ส่ง deviceId / เครื่องไม่มีกะ → SHIFT_REQUIRED ไม่มีบิล ตัวนับใบเสร็จไม่ขยับ · deviceId ผิดรูป → VALIDATION · เปิดกะแล้วขายได้ ผูกกะ"),
  D("R2", "X1", "ลองซ้ำหลังปิดกะ: บิลที่ commit ในกะแล้วกะถูกปิด → ส่งคีย์+payload เดิม → ok duplicated saleId เดิม (ไม่ใช่ SHIFT_REQUIRED)"),
  D("R3", "-", "ตั้ง required.register = false: ขายไม่มี deviceId → PAID shiftId null · ส่ง deviceId ที่มีกะเปิด → ผูกกะนั้น"),
  D("R4", "X4", "ผู้เรียกเดิมไม่กระทบ (otherSources ปิด): createSale HOTEL ขณะมีกะเปิดและหลังปิด → PAID shiftId null · voidSale บิลเดิมหลังปิดกะ → VOIDED · POS ที่ไม่ใช่ registerV2 ขายหน้าขายไม่ส่ง deviceId → PAID shiftId null"),
  D("R5", "X4", "ตั้ง required.otherSources = true: สาขาไม่มีกะเปิด → createSale เดิม SHIFT_REQUIRED ไม่มีบิล ตัวนับไม่ขยับ · มีกะเปิด 1 กะ → ผูกกะนั้นและอยู่ใน X · ปิดค่ากลับ → shiftId null แม้มีกะเปิด"),
  D("R6", "X4", "เงินสดนอกกะ offShiftCash: บิลเงินสดที่ shiftId null ของสาขาวันนี้ (เฉพาะส่วน CASH ของบิลแบ่งจ่าย) · ไม่รวมบิลที่ผูกกะ · ไม่รวม VOIDED · total = Σ · แคชเชียร์ operate อย่างเดียว → PERMISSION_DENIED"),
  // ── I ข้ามขอบเขต ──
  D("I1", "X2", "ข้ามสาขา: ctx สาขา 2 กับกะของสาขา 1 → xReport/zReport/closeShift/recordCashMovement = NOT_FOUND · createSale สาขา 2 + shiftId กะเปิดของสาขา 1 → SHIFT_REQUIRED · deviceId เดียวกันเปิดที่สาขา 2 ได้ (คนละลิ้นชัก)"),
  D("I2", "X2", "ข้ามร้าน: เจ้าของร้าน QC อาหาร (ctx ร้านตัวเอง) กับ shiftId ร้านกาแฟ → NOT_FOUND ทั้ง x/z/close/cash · currentShift(deviceId เดียวกัน) = null · listShifts ไม่เห็น"),
  // ── P สิทธิ์ ──
  D("P1", "X3", "STAFF ไม่มี pos.shift.operate → PERMISSION_DENIED ทั้ง open/close/x/cash ไม่มีแถว · แคชเชียร์จริง (สีลม) ที่สาขา sandbox → NOT_FOUND"),
  D("P2", "X3", "operate ปิดกะของคนอื่น → PERMISSION_DENIED กะยัง OPEN · operate เปิด-ปิดกะของตัวเองได้ · STAFF ที่มี manage ปิดกะของคนอื่นได้"),
  // ── E event ──
  D("E1", "-", "event: pos.shift.opened 1 แถวต่อกะ · pos.shift.closed 1 แถวต่อกะที่ปิด (รวมบังคับปิด/แข่ง) · payload มี shiftId zNumber overShortSatang forced · consumers มีทั้งสอง · เล่นซ้ำ 2 ครั้งไม่ throw ไม่มีแถวเพิ่ม"),
  // ── D ปฏิเสธเป็นข้อมูล ──
  D("D1", "-", "คำปฏิเสธของ shift.ts / หน้าขาย (SHIFT_REQUIRED · SHIFT_ALREADY_OPEN · SHIFT_CLOSED · REASON_REQUIRED · DRAWER_INSUFFICIENT · VALIDATION · NOT_FOUND · PERMISSION_DENIED) = คืน {ok:false, code, message} ไม่ throw"),
  // ── Z คืนสภาพ ──
  D("Z1", "-", "QC4 คืนสภาพ: จำนวนแถวของร้าน QC POS ทั้งสอง (ทุกตารางที่ข้อสอบแตะ · รวม PosShift/PosCashMovement/PosShiftCounter) ก่อน = หลัง · ผลรวมตัวนับใบเสร็จไม่ขยับ"),
  D("Z2", "-", "QC4 ลายนิ้วมือ: แถวเดิมของร้าน QC POS (PosProduct · PosCategory · AppSystem · AppSystemUnit · BusinessUnit · Membership · PosReceiptCounter · PosShift) ทุกคอลัมน์ ก่อน = หลัง"),
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
const codeOf = (r: Any): string => (r && r.ok === false ? String(r.code ?? "NO_CODE") : r && r.ok === true ? "OK" : r && typeof r.saleId === "string" ? "SALE" : "UNKNOWN");
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
const sha = (v: unknown) => createHash("sha256").update(JSON.stringify(v ?? null)).digest("hex").slice(0, 16);
/** JSON ที่เรียงคีย์แล้ว (เทียบ Json ที่ DB อาจคืนลำดับคีย์ต่าง) */
const normJ = (v: unknown): string => JSON.stringify(v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b))) : (v ?? null));

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
const exportsFn = (src: string, n: string) => new RegExp(`export\\s+(async\\s+)?function\\s+${n}\\b|export\\s+const\\s+${n}\\b`).test(src);
/** บล็อก `model X { … }` / `enum X { … }` จากข้อความ schema ทั้งหมด ("" = ไม่มี) */
function prismaBlock(src: string, kind: "model" | "enum", name: string): string {
  const m = new RegExp(`\\b${kind}\\s+${name}\\s*\\{`).exec(src);
  if (!m) return "";
  const end = src.indexOf("\n}", m.index);
  return end < 0 ? "" : src.slice(m.index, end + 2);
}
/** บรรทัดฟิลด์ใน model block: `name Type…` */
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
      /* ไฟล์พัง = คีย์หาย (ST6 แดงเอง) */
    }
  }
  return keys;
}

const SHIFT_FILE = "src/lib/modules/pos/shift.ts";
const SHIFT_ACT_FILE = "src/lib/modules/pos/shift-actions.ts";
const REG_SHARED_FILE = "src/lib/modules/pos/register-shared.ts";
const SERVICE_FILE = "src/lib/modules/pos/service.ts";
const SHIFT_FNS = ["openShift", "currentShift", "xReport", "closeShift", "zReport", "recordCashMovement", "listShifts", "offShiftCash", "forceCloseStaleShifts"] as const;
const SHIFT_ACTIONS: [string, string][] = SHIFT_FNS.filter((f) => f !== "forceCloseStaleShifts").map((f): [string, string] => [`${f}Action`, f]);
const SHIFT_COLS = [
  "id", "tenantId", "unitId", "systemId", "deviceId", "deviceLabel", "shiftNo", "status", "openedByUserId", "openedAt", "floatSatang", "floatDetail",
  "closedByUserId", "closedAt", "expectedCashSatang", "countedCashSatang", "overShortSatang", "countDetail", "countedByMethod", "closeNote", "closeKey",
  "zNumber", "zReport", "createdAt", "updatedAt",
] as const;
const MOVE_COLS = ["id", "tenantId", "unitId", "shiftId", "kind", "amountSatang", "reason", "byUserId", "idempotencyKey", "createdAt"] as const;
const COUNTER_COLS = ["id", "tenantId", "unitId", "shiftSeq", "zSeq"] as const;
const SHIFT_MSG_KEYS = ["title", "open", "close", "float", "expected", "counted", "overShort", "reason", "cashIn", "cashOut", "xReport", "zReport", "offShift", "forced", "blind", "required"] as const;
const NEW_CODES: [string, string][] = [
  ["SHIFT_REQUIRED", "errors.shiftRequired"], ["SHIFT_ALREADY_OPEN", "errors.shiftAlreadyOpen"], ["SHIFT_CLOSED", "errors.shiftClosed"],
  ["REASON_REQUIRED", "errors.reasonRequired"], ["DRAWER_INSUFFICIENT", "errors.drawerInsufficient"],
];
const schemaSrc = walk("prisma/schema", [], /\.prisma$/).map((f) => stripPrismaComments(rd(f))).join("\n");
const shiftSrc = stripComments(rd(SHIFT_FILE));
const actRaw = rd(SHIFT_ACT_FILE);
const actSrc = stripComments(actRaw);

// ═════════════════════════ 1. ข้อสถิต (ไม่แตะ DB · ST1–ST8) ═════════════════════════
async function runStatic(): Promise<void> {
  console.log("\n── ST ข้อสถิต (ไม่แตะ DB) ──");
  // ST1 schema
  const s1: string[] = [];
  const shiftB = prismaBlock(schemaSrc, "model", "PosShift");
  const moveB = prismaBlock(schemaSrc, "model", "PosCashMovement");
  const ctrB = prismaBlock(schemaSrc, "model", "PosShiftCounter");
  const saleB = prismaBlock(schemaSrc, "model", "PosSale");
  const stEnum = prismaBlock(schemaSrc, "enum", "PosShiftStatus");
  const mvEnum = prismaBlock(schemaSrc, "enum", "PosCashMoveKind");
  if (!shiftB) s1.push("ไม่มี model PosShift");
  else {
    const miss = SHIFT_COLS.filter((c) => !fieldLine(shiftB, c));
    if (miss.length) s1.push(`PosShift ขาด ${miss.join(",")}`);
    if (!/@@unique\(\[\s*unitId\s*,\s*shiftNo\s*\]/.test(shiftB)) s1.push("ไม่มี @@unique([unitId, shiftNo])");
    if (!/@@unique\(\[\s*unitId\s*,\s*zNumber\s*\]/.test(shiftB)) s1.push("ไม่มี @@unique([unitId, zNumber])");
    for (const f of ["closedByUserId", "closedAt", "expectedCashSatang", "countedCashSatang", "overShortSatang", "zNumber", "zReport"]) {
      const l = fieldLine(shiftB, f);
      if (l && !/\?/.test(l.split(/\s+/)[1] ?? "")) s1.push(`${f} ต้อง nullable`);
    }
  }
  if (!stEnum || !["OPEN", "CLOSED", "FORCE_CLOSED"].every((v) => new RegExp(`\\b${v}\\b`).test(stEnum))) s1.push("enum PosShiftStatus ไม่ครบ OPEN|CLOSED|FORCE_CLOSED");
  if (!moveB) s1.push("ไม่มี model PosCashMovement");
  else {
    const miss = MOVE_COLS.filter((c) => !fieldLine(moveB, c));
    if (miss.length) s1.push(`PosCashMovement ขาด ${miss.join(",")}`);
    if (!/@@unique\(\[\s*tenantId\s*,\s*idempotencyKey\s*\]/.test(moveB)) s1.push("PosCashMovement ไม่มี @@unique([tenantId, idempotencyKey])");
  }
  if (!mvEnum || !/\bIN\b/.test(mvEnum) || !/\bOUT\b/.test(mvEnum)) s1.push("enum PosCashMoveKind ไม่ครบ IN|OUT");
  if (!ctrB) s1.push("ไม่มี model PosShiftCounter");
  else {
    const miss = COUNTER_COLS.filter((c) => !fieldLine(ctrB, c));
    if (miss.length) s1.push(`PosShiftCounter ขาด ${miss.join(",")}`);
    if (!/@unique/.test(fieldLine(ctrB, "unitId")) && !/@@unique\(\[\s*unitId\s*\]/.test(ctrB)) s1.push("PosShiftCounter.unitId ไม่ unique");
  }
  const sid = fieldLine(saleB, "shiftId");
  if (!sid) s1.push("PosSale ไม่มี shiftId");
  else if (!/^shiftId\s+String\?/.test(sid)) s1.push(`PosSale.shiftId ไม่ใช่ String? (${sid.slice(0, 40)})`);
  chk("P1.9-ST1", s1.length === 0, "PosShift · PosCashMovement · PosShiftCounter · enum 2 · PosSale.shiftId?", s1.join(" · ") || "ครบ");

  // ST2 migration
  const s2: string[] = [];
  const migFiles = walk("prisma/migrations", [], /\.sql$/).filter((f) => /PosShift/.test(rd(f)));
  if (!migFiles.length) s2.push("ไม่มี migration ที่แตะ PosShift");
  const migAll = migFiles.map((f) => rd(f).replace(/--.*$/gm, "")).join("\n");
  if (migFiles.length && !/CREATE\s+TABLE\s+"PosShift"/i.test(migAll)) s2.push("ไม่มี CREATE TABLE \"PosShift\"");
  if (migFiles.length && !/CREATE\s+UNIQUE\s+INDEX[^;]*one_open_shift_per_device[^;]*\(\s*"unitId"\s*,\s*"deviceId"\s*\)[^;]*WHERE[^;]*status[^;]*'OPEN'/is.test(migAll)) s2.push("ไม่มี partial unique one_open_shift_per_device (unitId, deviceId) WHERE status='OPEN'");
  const addShiftId = /ALTER\s+TABLE\s+"PosSale"[^;]*ADD\s+COLUMN\s+"shiftId"[^;,]*/i.exec(migAll)?.[0] ?? "";
  if (migFiles.length && !addShiftId) s2.push("ไม่มี ADD COLUMN \"shiftId\" ของ PosSale");
  else if (/NOT\s+NULL/i.test(addShiftId)) s2.push("PosSale.shiftId NOT NULL");
  for (const f of migFiles) {
    const t = rd(f).replace(/--.*$/gm, "");
    if (/\bDROP\s+(TABLE|COLUMN)\b|\bRENAME\b|SET\s+NOT\s+NULL/i.test(t)) s2.push(`${f.split("/").slice(-2, -1)[0]}: มี DROP/RENAME/SET NOT NULL`);
  }
  chk("P1.9-ST2", s2.length === 0, "CREATE PosShift · partial unique · shiftId nullable · additive", s2.join(" · ") || `ครบ (${migFiles.length} ไฟล์)`);

  // ST3 scope.ts
  const scopeSrc = stripComments(rd("src/lib/core/scope.ts"));
  const s3 = ["PosShift", "PosCashMovement", "PosShiftCounter"].filter((m) => !new RegExp(`\\b${m}\\s*:`).test(scopeSrc));
  chk("P1.9-ST3", s3.length === 0, "3 ตารางลงทะเบียน", s3.length ? `ขาด ${s3.join(",")}` : "ครบ");

  // ST4 permissions
  const permSrc = stripComments(rd("src/lib/core/permissions.ts"));
  const posAt = permSrc.search(/module:\s*["']pos["']/);
  const posBlock = posAt < 0 ? "" : permSrc.slice(posAt, permSrc.indexOf("}", permSrc.indexOf("actions", posAt)) + 1);
  const s4 = ["pos.shift.operate", "pos.shift.manage"].filter((k) => !posBlock.includes(`"${k}"`));
  chk("P1.9-ST4", posBlock && s4.length === 0, "operate + manage ในโมดูล pos", s4.length ? `ขาด ${s4.join(",")}` : "ครบ");

  // ST5 outbox + labels + cron
  const s5: string[] = [];
  const obSrc = stripComments(rd("src/lib/outbox-consumers.ts"));
  const lbSrc = stripComments(rd("src/lib/automation/labels.ts"));
  const cronSrc = stripComments(rd("src/app/api/cron/hourly/route.ts"));
  for (const ev of ["pos.shift.opened", "pos.shift.closed"]) {
    if (!new RegExp(`["']${ev.replace(/\./g, "\\.")}["']\\s*:`).test(obSrc)) s5.push(`consumer ${ev} ไม่มี`);
    if (!new RegExp(`value:\\s*["']${ev.replace(/\./g, "\\.")}["']`).test(lbSrc)) s5.push(`ป้าย ${ev} ไม่มี`);
  }
  if (!/forceCloseStaleShifts\s*\(/.test(cronSrc)) s5.push("cron hourly ไม่เรียก forceCloseStaleShifts");
  chk("P1.9-ST5", s5.length === 0, "consumer 2 · ป้าย 2 · cron sweep", s5.join(" · ") || "ครบ");

  // ST6 ข้อความ + refusalMessageKey
  const regShared = await tryImport("@/lib/modules/pos/register-shared");
  const th = posMessages("th");
  const en = posMessages("en");
  const thai = /[฀-๿]/;
  const s6: string[] = [];
  const keys = [...SHIFT_MSG_KEYS.map((k) => `pos.shift.${k}`), ...NEW_CODES.map(([, k]) => `pos.register.${k}`)];
  for (const k of keys) {
    const t = th.get(k);
    const e = en.get(k);
    if (typeof t !== "string" || !t.trim()) s6.push(`${k}: th ขาด`);
    if (typeof e !== "string" || !e.trim()) s6.push(`${k}: en ขาด`);
    else if (thai.test(e)) s6.push(`${k}: en มีอักษรไทย`);
  }
  for (const [code, key] of NEW_CODES) {
    const mk = callSync(regShared, "refusalMessageKey", code);
    if (mk !== key) s6.push(`refusalMessageKey(${code})=${short(mk, 40)}`);
  }
  chk("P1.9-ST6", s6.length === 0, `${keys.length} คีย์ th+en · refusalMessageKey 5`, s6.slice(0, 8).join(" · ") + (s6.length > 8 ? ` …(+${s6.length - 8})` : "") || "ครบ");

  // ST7 actions + การเดินสาย
  const s7: string[] = [];
  if (!actRaw) s7.push(`ไม่มี ${SHIFT_ACT_FILE}`);
  else {
    if (!/^\s*["']use server["']/.test(actRaw.replace(/^\s*(\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*/, ""))) s7.push("ไม่มี \"use server\" บรรทัดแรก");
    const exps = [...actSrc.matchAll(/^\s*export\b[^\n]*/gm)].map((m) => m[0].trim());
    const nonFn = exps.filter((x) => !/^export\s+async\s+function\s+\w+/.test(x));
    if (nonFn.length) s7.push(`export ไม่ใช่ async function (${nonFn.slice(0, 2).join(" | ")})`);
    if (/\bthrow\b/.test(actSrc)) s7.push("มี throw");
    const names = exps.map((x) => /^export\s+async\s+function\s+(\w+)/.exec(x)?.[1]).filter((x): x is string => !!x);
    for (const [a, f] of SHIFT_ACTIONS) {
      if (!names.includes(a)) {
        s7.push(`ไม่มี ${a}`);
        continue;
      }
      const at = actSrc.search(new RegExp(`export\\s+async\\s+function\\s+${a}\\b`));
      const body = actSrc.slice(at).split(/\n\s*export\s+/)[0] ?? "";
      if (!new RegExp(`\\b${f}\\s*\\(`).test(body)) s7.push(`${a} ไม่เรียก ${f}`);
      if (!/\bcatch\b/.test(body)) s7.push(`${a} ไม่มี catch`);
    }
  }
  const rs = stripComments(rd(REG_SHARED_FILE));
  const ctxType = /export\s+type\s+RegisterCtx\s*=\s*\{[^}]*\}/.exec(rs)?.[0] ?? "";
  if (!/deviceId\s*\?\s*:\s*string/.test(ctxType)) s7.push("RegisterCtx ไม่มี deviceId?: string");
  const statusType = /export\s+type\s+RegisterStatus\s*=\s*\{[\s\S]*?\n\};/.exec(rs)?.[0] ?? "";
  if (/\bshift\s*:\s*null\s*;/.test(statusType)) s7.push("RegisterStatus.shift ยัง null ตายตัว");
  const svc = stripComments(rd(SERVICE_FILE));
  const csInput = /export\s+type\s+CreateSaleInput\s*=\s*\{[\s\S]*?\n\};/.exec(svc)?.[0] ?? "";
  if (!/\bshiftId\s*\?\s*:\s*string/.test(csInput)) s7.push("CreateSaleInput ไม่มี shiftId?: string");
  chk("P1.9-ST7", s7.length === 0, "actions 8 · RegisterCtx.deviceId? · RegisterStatus.shift · CreateSaleInput.shiftId?", s7.slice(0, 8).join(" · ") + (s7.length > 8 ? ` …(+${s7.length - 8})` : "") || "ครบ");

  // ST8 ตะเข็บ HR (เขียวได้บนฐาน — ห้ามมีตาราง PIN ของ POS)
  const s8: string[] = [];
  if (prismaBlock(schemaSrc, "model", "PosStaffPin")) s8.push("มี model PosStaffPin (PIN เป็นของ HR)");
  if (shiftB && /^\s*\w*pin\w*\s+/im.test(shiftB.split("\n").slice(1).join("\n"))) s8.push("PosShift มีคอลัมน์ pin");
  if (/\bpinCode\b|\bhrEmployee\b|\bpinHash\b/.test(shiftSrc)) s8.push("shift.ts อ่าน PIN/HrEmployee ตรง");
  chk("P1.9-ST8", s8.length === 0, "ไม่มีตาราง/คอลัมน์ PIN ของ POS", s8.join(" · ") || "ไม่มี (ถูก)");
}
const STATIC_IDS = ["P1.9-ST1", "P1.9-ST2", "P1.9-ST3", "P1.9-ST4", "P1.9-ST5", "P1.9-ST6", "P1.9-ST7", "P1.9-ST8"];

const skipReasons: string[] = [];
for (const f of SHIFT_FNS) if (!exportsFn(shiftSrc, f)) skipReasons.push(`${SHIFT_FILE} ยังไม่มี export ${f}`);

// ═════════════════════════ 1b. --no-db ═════════════════════════
if (NODB) {
  console.log(`[${SUITE}] --no-db: รัน ${STATIC_IDS.length} ข้อสถิต (ไม่ผ่านด่าน SKIP · ข้ออื่นต้องใช้ DB)`);
  if (skipReasons.length) console.log(`   (ของ P1.9 ที่ยังขาด: ${skipReasons.length} ฟังก์ชันใน ${SHIFT_FILE})`);
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

// ═════════════════════════ 3. ด่าน SKIP (ตาราง/คอลัมน์ + ของ P1.9) ═════════════════════════
const { prisma } = (await import("@/lib/core/db")) as Any;
const P = prisma as Any;
const prismaPkg = (await import("@prisma/client")) as Any;
const DMMF = ((prismaPkg?.Prisma ?? prismaPkg?.default?.Prisma)?.dmmf?.datamodel ?? { models: [], enums: [] }) as { models: { name: string; fields: { name: string }[] }[]; enums: { name: string; values: { name: string }[] }[] };
const dbCols = new Set<string>();
const dbPayTypes = new Set<string>();
try {
  const rows = (await P.$queryRawUnsafe(
    `SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name IN ('PosShift','PosCashMovement','PosShiftCounter','PosSale','PosPayment')`,
  )) as Any[];
  for (const r of rows) dbCols.add(`${r.table_name}.${r.column_name}`);
  const ev = (await P.$queryRawUnsafe(`SELECT e.enumlabel AS v FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'PosPayType'`)) as Any[];
  for (const r of ev) dbPayTypes.add(String(r.v));
} catch (e) {
  console.log(`  (อ่าน information_schema ไม่ได้: ${(e as Error).message.slice(0, 100)})`);
}
const clientHas = (model: string, field: string) => (DMMF.models.length ? !!DMMF.models.find((m) => m.name === model)?.fields.some((f) => f.name === field) : dbCols.has(`${model}.${field}`));
const hasField = (model: string, field: string) => clientHas(model, field) && dbCols.has(`${model}.${field}`);
const enumHas = (en: string, v: string) => (DMMF.enums?.length ? !!DMMF.enums.find((e) => e.name === en)?.values.some((x) => x.name === v) : en === "PosPayType" && dbPayTypes.has(v));
const PS: Any = typeof P.posShift?.findMany === "function" ? P.posShift : null;
const PM: Any = typeof P.posCashMovement?.findMany === "function" ? P.posCashMovement : null;
const PC: Any = typeof P.posShiftCounter?.findMany === "function" ? P.posShiftCounter : null;
if (!PS) skipReasons.push("Prisma client ยังไม่มี delegate posShift (S1)");
if (!PM) skipReasons.push("Prisma client ยังไม่มี delegate posCashMovement (S1)");
if (!PC) skipReasons.push("Prisma client ยังไม่มี delegate posShiftCounter (S1)");
const missShift = SHIFT_COLS.filter((c) => !hasField("PosShift", c));
if (missShift.length) skipReasons.push(`ตาราง PosShift ขาดคอลัมน์ (client/DB): ${missShift.join(",")}`);
const missMove = MOVE_COLS.filter((c) => !hasField("PosCashMovement", c));
if (missMove.length) skipReasons.push(`ตาราง PosCashMovement ขาดคอลัมน์: ${missMove.join(",")}`);
if (!hasField("PosSale", "shiftId")) skipReasons.push("PosSale.shiftId ยังไม่มี (client/DB)");
const TENDER_READY = hasField("PosPayment", "tenderedSatang") && hasField("PosPayment", "changeSatang");
const HAS_TIP = hasField("PosSale", "tipSatang");
const HAS_DOCTYPE = hasField("PosSale", "docType");
const CARD_TYPE = enumHas("PosPayType", "CARD") ? "CARD" : "TRANSFER";
if (!TENDER_READY) console.log("  ⚠️  PosPayment.tenderedSatang/changeSatang ยังไม่มี (P1.6) — X5 จะแดงตามเหตุผลนี้");

let scope: Any = null;
let restoScope: Any = null;
try {
  scope = await envMod.resolvePosScope(prisma, "coffee");
  restoScope = await envMod.resolvePosScope(prisma, "resto");
} catch (e) {
  console.log(`  (resolvePosScope ล้ม: ${(e as Error).message.slice(0, 120)})`);
}
if (!scope) skipReasons.push("ชุดข้อมูล QC POS (ร้านกาแฟ) ยังไม่ถูก seed บน DB นี้ — รัน scripts/seed-pos-qc.mts ก่อน");
if (!restoScope) skipReasons.push("ชุดข้อมูล QC POS (ร้านอาหาร) ยังไม่ถูก seed — ข้อ I2 ต้องใช้");

const COUNT_MODELS = [
  "posSale", "posSaleLine", "posPayment", "posReceiptCounter", "outboxEvent", "appSystem", "appSystemUnit", "businessUnit", "auditLog",
  "posProduct", "posCategory", "posShift", "posCashMovement", "posShiftCounter", "couponRedemption", "pointLedger",
] as const;
const FP_MODELS = ["posProduct", "posCategory", "appSystem", "appSystemUnit", "businessUnit", "membership", "posReceiptCounter", "posShift"] as const;
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

if (skipReasons.length > 0 && !FORCE) {
  console.log(`⏭️  SKIPPED — ${SUITE}: ของใบ P1.9 ยังไม่มี (ถูกต้องสำหรับข้อสอบที่เขียนก่อนสร้าง)`);
  for (const r of skipReasons) console.log(`   • ${r}`);
  console.log(`   ข้อมูล: seed ร้านกาแฟ ${scope ? "มี" : "ไม่มี"} · seed ร้านอาหาร ${restoScope ? "มี" : "ไม่มี"} · ข้อสอบ ${CHECKS.length} ข้อ (ดู --list) · QC_FORCE=1 = รันทั้งที่ยังไม่มีของ (ต้องแดงตามเหตุผล)`);
  console.log(`   A5 (อ่านอย่างเดียว) จำนวนแถวร้าน QC POS: ${JSON.stringify(countsBefore)}`);
  console.log(`JSON_SUMMARY ${JSON.stringify({ suite: SUITE, total: 0, passed: 0, failed: [], skipped: true, reason: skipReasons, registered: CHECKS.length, seed: { coffee: !!scope, resto: !!restoScope }, a5: countsBefore })}`);
  await P.$disconnect?.().catch?.(() => {});
  process.exit(0);
}
if (FORCE && skipReasons.length) console.log(`⚠️  QC_FORCE=1 — ข้ามด่าน SKIP ทั้งที่ยังขาด ${skipReasons.length} อย่าง (คาด: แดงตามเหตุผล ไม่ crash)`);
const fpBefore = await fingerprint();

// ═════════════════════════ 4. โหลดโมดูล ═════════════════════════
const shiftMod = existsSync(join(ROOT, SHIFT_FILE)) ? await tryImport("@/lib/modules/pos/shift") : null;
const register = await tryImport("@/lib/modules/pos/register");
const svc = await tryImport("@/lib/modules/pos/service");
const catalog = await tryImport("@/lib/modules/pos/catalog");
const sysSvc = await tryImport("@/lib/modules/system/service");

const RAND = Math.random().toString(36).slice(2, 8);
const TAG = `qc-p1.9-${RAND}`;
const runStart = new Date();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const HOUR = 3_600_000;

// ═════════════════════════ 5. ข้อที่ต้องมี DB (sandbox) ═════════════════════════
const DB_IDS = CHECKS.map(([id]) => id).filter((id) => !STATIC_IDS.includes(id) && id !== "P1.9-Z1" && id !== "P1.9-Z2");
const sb = { unitIds: [] as string[], systemIds: [] as string[], productIds: [] as string[], shiftIds: new Set<string>() };
const lanes: Any[] = [];
async function lane(i: number): Promise<Any> {
  if (lanes[i]) return lanes[i];
  const { PrismaClient } = (await import("@prisma/client")) as Any;
  const { PrismaPg } = (await import("@prisma/adapter-pg")) as Any;
  while (lanes.length <= i) lanes.push(new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL, max: 2 }) }));
  return lanes[i];
}
const shiftRow = async (id: string | null | undefined): Promise<Any> => (PS && id ? PS.findUnique({ where: { id } }).catch(() => null) : null);
const saleRow = async (id: string | null | undefined): Promise<Any> => (id ? P.posSale.findUnique({ where: { id } }).catch(() => null) : null);
const setShift = async (id: string, data: Any): Promise<string> => {
  if (!PS || !id) return "ไม่มี delegate posShift / id";
  try {
    await PS.update({ where: { id }, data });
    return "";
  } catch (e) {
    return `update ล้ม: ${(e as Error).message.slice(0, 80)}`;
  }
};
const shiftsOf = async (where: Any): Promise<Any[]> => (PS ? ((await PS.findMany({ where, orderBy: { createdAt: "asc" } }).catch(() => [])) as Any[]) : []);
const receiptSeq = async (unitId: string): Promise<number> =>
  ((await P.posReceiptCounter.findMany({ where: { unitId }, select: { seq: true } }).catch(() => [])) as Any[]).reduce((t, x) => t + Number(x.seq), 0);
const salesIn = async (unitId: string): Promise<number> => P.posSale.count({ where: { unitId } }).catch(() => NaN);
const shiftEvents = async (shiftId: string, type: string): Promise<Any[]> =>
  shiftId ? ((await P.outboxEvent.findMany({ where: { type, idempotencyKey: { contains: shiftId } } }).catch(() => [])) as Any[]) : [];

/** เงินในลิ้นชักที่ข้อสอบคำนวณเองจาก DB (S7) — null = อ่านไม่ได้ (เช่นยังไม่มี PosSale.shiftId) */
async function dbCash(shiftId: string): Promise<Any> {
  try {
    const sh = await shiftRow(shiftId);
    if (!sh) return { err: "ไม่มีแถวกะ" };
    const all = (await P.posSale.findMany({ where: { shiftId } })) as Any[];
    const isRefund = (s: Any) => HAS_DOCTYPE && s.docType === "REFUND";
    const live = all.filter((s) => s.status !== "VOIDED" && !isRefund(s));
    const voided = all.filter((s) => s.status === "VOIDED" && !isRefund(s));
    const refunds = all.filter((s) => s.status !== "VOIDED" && isRefund(s));
    const pays = (await P.posPayment.findMany({ where: { saleId: { in: live.map((s) => s.id) } } })) as Any[];
    const rpays = refunds.length ? ((await P.posPayment.findMany({ where: { saleId: { in: refunds.map((s) => s.id) }, type: "CASH" } })) as Any[]) : [];
    const cash = pays.filter((p) => p.type === "CASH");
    const byMethod: Record<string, { count: number; amount: number }> = {};
    for (const p of pays) {
      const b = (byMethod[p.type] ??= { count: 0, amount: 0 });
      b.count += 1;
      b.amount += p.amountSatang;
    }
    const mv = PM ? ((await PM.findMany({ where: { shiftId } })) as Any[]) : [];
    const cashSales = cash.reduce((t, p) => t + p.amountSatang, 0);
    const tendered = cash.reduce((t, p) => t + (typeof p.tenderedSatang === "number" ? p.tenderedSatang : p.amountSatang), 0);
    const change = cash.reduce((t, p) => t + (typeof p.changeSatang === "number" ? p.changeSatang : 0), 0);
    const inS = mv.filter((m) => m.kind === "IN").reduce((t, m) => t + m.amountSatang, 0);
    const outS = mv.filter((m) => m.kind === "OUT").reduce((t, m) => t + m.amountSatang, 0);
    const refundCash = rpays.reduce((t, p) => t + Math.abs(p.amountSatang), 0);
    const float = Number(sh.floatSatang);
    return {
      float, cashSales, tendered, change, inS, outS, refundCash,
      tip: HAS_TIP ? live.reduce((t, s) => t + (s.tipSatang ?? 0), 0) : 0,
      expected: float + cashSales + inS - outS - refundCash,
      expectedTender: float + tendered - change + inS - outS - refundCash,
      billCount: live.length, salesTotal: live.reduce((t, s) => t + s.grandTotalSatang, 0),
      voidCount: voided.length, voidTotal: voided.reduce((t, s) => t + s.grandTotalSatang, 0),
      byMethod, saleIds: live.map((s) => s.id),
    };
  } catch (e) {
    return { err: (e as Error).message.slice(0, 100) };
  }
}
const methodOf = (rep: Any, type: string): Any => (Array.isArray(rep?.byMethod) ? rep.byMethod.find((m: Any) => m?.type === type) : undefined);

async function runDb() {
  if (!scope) {
    for (const id of DB_IDS) chk(id, false, "seed ร้าน QC POS", "ยังไม่ได้ seed (scripts/seed-pos-qc.mts) — ข้อ DB ตรวจไม่ได้");
    return;
  }
  const tid: string = scope.tenantId;
  const restoTid: string = PQC.resto.tenantId;
  const mOwner = await P.membership.findFirst({ where: { tenantId: tid, userId: PQC.coffee.users.owner.userId } });
  const mCash = await P.membership.findFirst({ where: { tenantId: tid, userId: PQC.coffee.users.cashier.userId } });
  const mROwner = await P.membership.findFirst({ where: { tenantId: restoTid, userId: PQC.resto.users.owner.userId } });
  const actor = (m: Any, userId: string, fallbackRole: string, over: Partial<Any> = {}) => ({
    userId,
    role: m?.role ?? fallbackRole,
    unitAccess: Array.isArray(m?.unitAccess) ? m.unitAccess : [],
    permissions: (m?.permissions ?? {}) as Record<string, unknown>,
    ...over,
  });
  const owner = actor(mOwner, PQC.coffee.users.owner.userId, "OWNER");
  const realCashier = actor(mCash, PQC.coffee.users.cashier.userId, "STAFF");
  const restoOwner = actor(mROwner, PQC.resto.users.owner.userId, "OWNER");

  // ─── sandbox (เขียนแถวแรก ⇒ ด่าน host QC4 ก่อน) ───
  assertQc4BeforeWrite();
  console.log(`\n── sandbox ${TAG} (4 สาขา + 3 ระบบ POS ชั่วคราวในร้าน QC กาแฟ) ──`);
  let fx = "";
  let u1 = "", u2 = "", u3 = "", u4 = "", posS = "", posL = "", posR = "";
  const V2 = new Map<string, boolean>();
  try {
    for (const label of ["u1", "u2", "u3", "u4"]) {
      const u = await P.businessUnit.create({ data: { tenantId: tid, type: "SHOP", name: `${TAG} ${label}`, slug: `${TAG}-${label}` } });
      sb.unitIds.push(u.id);
    }
    [u1, u2, u3, u4] = sb.unitIds as [string, string, string, string];
    // posS / posR = POS ใหม่ (registerV2) · posL = POS ที่ยังใช้จอเดิม (ไม่ตั้งธง = ผู้เรียกแบบ sandbox ของข้อสอบใบก่อน)
    for (const [k, v2] of [["S", true], ["L", false], ["R", true]] as [string, boolean][]) {
      const s = await P.appSystem.create({ data: { tenantId: tid, type: "POS", name: `${TAG} POS-${k}`, settings: v2 ? { pos: { registerV2: true } } : {} } });
      sb.systemIds.push(s.id);
      V2.set(s.id, v2);
    }
    [posS, posL, posR] = sb.systemIds as [string, string, string];
    await sysSvc.linkUnit(tid, posS, u1);
    await sysSvc.linkUnit(tid, posS, u2);
    await sysSvc.linkUnit(tid, posL, u3);
    await sysSvc.linkUnit(tid, posR, u4);
  } catch (e) {
    fx = `sandbox:${(e as Error).message.slice(0, 120)}`;
    console.log(`  ⚠️  ${fx}`);
  }
  const FX = (s: string) => (fx ? `fixture:${fx} · ` : "") + s;
  const setShiftSettings = async (systemId: string, shift: Any | null): Promise<string> => {
    try {
      const pos: Any = V2.get(systemId) ? { registerV2: true } : {};
      if (shift) pos.shift = shift;
      await P.appSystem.update({ where: { id: systemId }, data: { settings: Object.keys(pos).length ? { pos } : {} } });
      return "";
    } catch (e) {
      return `ตั้งค่าไม่ได้: ${(e as Error).message.slice(0, 60)}`;
    }
  };
  const SYSTEM_ACTOR: unknown = catalog?.CATALOG_SYSTEM_ACTOR ?? owner.userId;
  const PRICE = new Map<string, number>();
  const mkProd = async (systemId: string, name: string, price: number): Promise<string> => {
    const r = await call(catalog, "createProduct", { tenantId: tid, systemId, actorUserId: SYSTEM_ACTOR }, { name, kind: "PRODUCT", basePriceSatang: price });
    const id = typeof r === "string" ? r : r?.ok === false ? "" : r?.id;
    if (!id) throw new Error(`createProduct ไม่คืน id: ${short(r)}`);
    sb.productIds.push(id);
    PRICE.set(id, price);
    return id;
  };
  let A = "", B = "", L = "";
  try {
    if (!fx) {
      A = await mkProd(posS, "ลาเต้ P1.9", 4500);
      B = await mkProd(posS, "เค้ก P1.9", 6000);
      L = await mkProd(posL, "ชาไทยจอเดิม P1.9", 3000);
    }
  } catch (e) {
    fx ||= `product:${(e as Error).message.slice(0, 100)}`;
  }

  // ─── ผู้กระทำ ───
  const units = () => [u1, u2, u3, u4].filter(Boolean);
  const cashOp = actor(mCash, PQC.coffee.users.cashier.userId, "STAFF", { unitAccess: units(), permissions: { "pos.sale.create": true, "pos.shift.operate": true } });
  const cashMgr = actor(mCash, PQC.coffee.users.cashier.userId, "STAFF", { unitAccess: units(), permissions: { "pos.sale.create": true, "pos.shift.operate": true, "pos.shift.manage": true } });
  const noShift = actor(mCash, PQC.coffee.users.cashier.userId, "STAFF", { unitAccess: units(), permissions: { "pos.sale.create": true } });
  const ctx = (unitId: string, systemId: string, deviceId?: string): Any => ({ tenantId: tid, systemId, unitId, ...(deviceId !== undefined ? { deviceId } : {}) });
  const ctxR = { tenantId: restoTid, systemId: PQC.resto.systems.POS.id, unitId: PQC.resto.units.main.id };
  const dev = (n: string) => `qc19-${RAND}-${n}`;

  // ─── ทางเรียก ───
  const dataRefusals: [string, Any, string][] = [];
  const track = (r: Any) => {
    const id = r?.ok === true ? r.shift?.id : undefined;
    if (typeof id === "string") sb.shiftIds.add(id);
    return r;
  };
  const open = async (c: Any, a: Any, input: Any, cl?: Any) => track(cl ? await call(shiftMod, "openShift", c, a, input, cl) : await call(shiftMod, "openShift", c, a, input));
  const close = (c: Any, a: Any, input: Any, cl?: Any) => (cl ? call(shiftMod, "closeShift", c, a, input, cl) : call(shiftMod, "closeShift", c, a, input));
  const xr = (c: Any, a: Any, shiftId: string) => call(shiftMod, "xReport", c, a, { shiftId });
  const zr = (c: Any, a: Any, shiftId: string) => call(shiftMod, "zReport", c, a, { shiftId });
  const move = (c: Any, a: Any, input: Any) => call(shiftMod, "recordCashMovement", c, a, input);
  const cur = (c: Any, a: Any, deviceId: string) => call(shiftMod, "currentShift", c, a, { deviceId });
  const sid = (r: Any): string => (r?.ok === true && typeof r.shift?.id === "string" ? r.shift.id : "");
  const rep = (r: Any): Any => (r?.ok === true ? r.report : null);
  let keyN = 0;
  const newKey = () => `p19-${RAND}-${++keyN}`;
  /** ขายผ่านหน้าขาย — ยอดจากราคาที่ตั้งเอง (POS sandbox ไม่ผูกบัญชี ⇒ ไม่มี VAT) */
  const regSale = async (c: Any, a: Any, lines: { productId: string; qty: number }[], pay: { type: string; amountSatang: number }[] | null, opts: { cash?: number; key?: string; cl?: Any } = {}) => {
    const grand = lines.reduce((t, l) => t + (PRICE.get(l.productId) ?? 0) * l.qty, 0);
    const input: Any = { lines, idempotencyKey: opts.key ?? newKey(), payMethods: pay ?? [{ type: "CASH", amountSatang: grand }], expectedGrandTotalSatang: grand };
    const cashPart = input.payMethods.filter((p: Any) => p.type === "CASH").reduce((t: number, p: Any) => t + p.amountSatang, 0);
    if (cashPart > 0) input.cashReceivedSatang = opts.cash ?? cashPart;
    const r = opts.cl ? await call(register, "submitRegisterSale", c, a, input, opts.cl) : await call(register, "submitRegisterSale", c, a, input);
    return { r, input, saleId: r?.ok === true && typeof r.saleId === "string" ? r.saleId : "" };
  };
  /** createSale แบบผู้เรียกเดิม (โรงแรม) — คืน SaleResult หรือ {ok:false, code} */
  const legacy = async (unitId: string, systemId: string, amount: number, opts: { pay?: Any[]; shiftId?: string; source?: string } = {}) => {
    const input: Any = {
      tenantId: tid, unitId, systemId, sourceModule: opts.source ?? "HOTEL", idempotencyKey: `${TAG}-cs-${++keyN}`,
      lines: [{ name: "ค่าห้อง QC P1.9", qty: 1, unitPriceSatang: amount }], payMethods: opts.pay ?? [{ type: "CASH", amountSatang: amount }],
    };
    if (opts.shiftId) input.shiftId = opts.shiftId;
    const r = await call(svc, "createSale", input);
    return { r, saleId: typeof r?.saleId === "string" ? r.saleId : "" };
  };
  const voidS = (unitId: string, saleId: string) => call(svc, "voidSale", tid, unitId, saleId);
  const voidOk = (r: Any) => !(r && r.ok === false);

  const D1 = dev("d1"), D2 = dev("d2");
  const FLOAT1 = 200_000;
  const FD1 = { "100000": 1, "50000": 1, "10000": 4, "2000": 5 };

  // ════════ O1 เปิดกะ ════════
  const o1 = await open(ctx(u1, posS), owner, { deviceId: D1, deviceLabel: "เคาน์เตอร์ 1", floatSatang: FLOAT1, floatDetail: FD1 });
  const S1 = sid(o1);
  {
    const row = await shiftRow(S1);
    const c = await cur(ctx(u1, posS), owner, D1);
    const p: string[] = [];
    if (!S1) p.push(`open ${codeOf(o1)} ${short(o1?.message ?? "", 60)}`);
    if (!row) p.push("ไม่มีแถว");
    else {
      if (row.status !== "OPEN") p.push(`status ${row.status}`);
      if (row.tenantId !== tid || row.unitId !== u1 || row.systemId !== posS || row.deviceId !== D1) p.push("ร้าน/สาขา/ระบบ/เครื่อง ผิด");
      if (!(Number.isInteger(row.shiftNo) && row.shiftNo >= 1)) p.push(`shiftNo ${row.shiftNo}`);
      if (row.openedByUserId !== owner.userId) p.push(`openedBy ${row.openedByUserId}`);
      if (row.floatSatang !== FLOAT1) p.push(`float ${row.floatSatang}`);
      if (normJ(row.floatDetail) !== normJ(FD1)) p.push(`floatDetail ${short(row.floatDetail, 60)}`);
      if (row.zNumber !== null || row.zReport !== null) p.push("มี Z ตั้งแต่เปิด");
    }
    if (!(c?.ok === true && c.shift?.id === S1)) p.push(`currentShift ${codeOf(c)} ${short(c?.shift?.id ?? null, 30)}`);
    chk("P1.9-O1", p.length === 0, "OPEN · ขอบเขตถูก · shiftNo · float 200,000 + detail · currentShift", FX(p.join(" · ") || "ครบ"));
  }

  // ════════ O2 เปิดซ้ำ + เครื่องที่ 2 ════════
  let S2 = "";
  {
    const p: string[] = [];
    const n0 = (await shiftsOf({ unitId: u1 })).length;
    const again = await open(ctx(u1, posS), owner, { deviceId: D1, floatSatang: 0 });
    dataRefusals.push(["open ซ้ำ", again, "SHIFT_ALREADY_OPEN"]);
    if (!refused(again, ["SHIFT_ALREADY_OPEN"])) p.push(`เปิดซ้ำ ${codeOf(again)}`);
    else if (again.shiftId !== S1) p.push(`ไม่พก shiftId (${short(again.shiftId, 30)})`);
    if ((await shiftsOf({ unitId: u1 })).length !== n0) p.push("มีแถวเกิดจากเปิดซ้ำ");
    const o2 = await open(ctx(u1, posS), owner, { deviceId: D2, deviceLabel: "เคาน์เตอร์ 2", floatSatang: 100_000 });
    S2 = sid(o2);
    const r1 = await shiftRow(S1);
    const r2 = await shiftRow(S2);
    if (!S2) p.push(`เครื่อง 2 ${codeOf(o2)}`);
    else if (!(r1 && r2 && r2.status === "OPEN" && r2.shiftNo === r1.shiftNo + 1)) p.push(`shiftNo ${r1?.shiftNo}→${r2?.shiftNo} status ${r2?.status}`);
    chk("P1.9-O2", p.length === 0, "ซ้ำ = SHIFT_ALREADY_OPEN+shiftId · เครื่อง 2 ok shiftNo+1", FX(p.join(" · ") || "ครบ"));
  }

  // ════════ O3 แข่งเปิด ════════
  {
    const p: string[] = [];
    for (let round = 0; round < 3; round++) {
      const d = dev(`race-open-${round}`);
      const rs = await Promise.all(Array.from({ length: 10 }, async (_, i) => open(ctx(u2, posS), owner, { deviceId: d, floatSatang: 0 }, await lane(i))));
      const ok = rs.filter((r) => r?.ok === true).length;
      const dup = rs.filter((r) => refused(r, ["SHIFT_ALREADY_OPEN"])).length;
      const other = rs.filter((r) => !(r?.ok === true || refused(r, ["SHIFT_ALREADY_OPEN"]))).map(codeOf);
      const rows = (await shiftsOf({ unitId: u2, deviceId: d, status: "OPEN" })).length;
      if (ok !== 1 || dup !== 9 || rows !== 1) p.push(`รอบ ${round + 1}: ok ${ok} dup ${dup} แถว ${rows}${other.length ? ` อื่น ${[...new Set(other)].join(",")}` : ""}`);
    }
    chk("P1.9-O3", p.length === 0, "3 รอบ × (ok 1 · ALREADY_OPEN 9 · OPEN 1 แถว)", FX(p.join(" · ") || "ครบ"));
  }

  // ════════ O4 ตรวจค่าเปิดกะ ════════
  {
    const p: string[] = [];
    const before = (await shiftsOf({ unitId: u2 })).length;
    const cases: [string, Any][] = [
      ["float −1", { deviceId: dev("v1"), floatSatang: -1 }],
      ["float 1.5", { deviceId: dev("v2"), floatSatang: 1.5 }],
      ["float สตริง", { deviceId: dev("v3"), floatSatang: "100" }],
      ["float เกินเพดาน", { deviceId: dev("v4"), floatSatang: 100_000_001 }],
      ["deviceId สั้น", { deviceId: "abc", floatSatang: 0 }],
      ["deviceId อักขระแปลก", { deviceId: "qc19 dev/1;--", floatSatang: 0 }],
      ["floatDetail รวมไม่เท่า", { deviceId: dev("v5"), floatSatang: 1000, floatDetail: { "500": 1 } }],
      ["floatDetail ธนบัตร 300", { deviceId: dev("v6"), floatSatang: 30000, floatDetail: { "30000": 1 } }],
    ];
    for (const [label, input] of cases) {
      const r = await open(ctx(u2, posS), owner, input);
      if (label === "float −1") dataRefusals.push(["open float −1", r, "VALIDATION"]);
      if (!refused(r, ["VALIDATION"])) p.push(`${label}: ${codeOf(r)}`);
    }
    if ((await shiftsOf({ unitId: u2 })).length !== before) p.push("มีแถวเกิด");
    chk("P1.9-O4", p.length === 0, "8 กรณี VALIDATION ไม่มีแถว", FX(p.join(" · ") || "ครบ"));
  }

  // ════════ X1–X3 สร้างกิจกรรมในกะ D1/D2 ════════
  const c1 = ctx(u1, posS, D1);
  const c2 = ctx(u1, posS, D2);
  const sa = await regSale(c1, owner, [{ productId: A, qty: 1 }], null, { cash: 10_000 }); // CASH 4,500 รับ 10,000 ทอน 5,500
  const sb2 = await regSale(c1, owner, [{ productId: B, qty: 1 }], [{ type: "CASH", amountSatang: 2000 }, { type: "PROMPTPAY", amountSatang: 4000 }], { cash: 2000 });
  const sc = await regSale(c1, owner, [{ productId: A, qty: 2 }], null); // 9,000 → void
  const vc = sc.saleId ? await voidS(u1, sc.saleId) : { ok: false, code: "NO_SALE" };
  const sd = await legacy(u1, posS, 3000, { pay: [{ type: CARD_TYPE, amountSatang: 3000 }], shiftId: S1, source: "POS" });
  const kIn = `${TAG}-in-1`;
  const mIn = await move(c1, owner, { shiftId: S1, kind: "IN", amountSatang: 50_000, reason: "แลกเหรียญ", idempotencyKey: kIn });
  const mOut = await move(c1, owner, { shiftId: S1, kind: "OUT", amountSatang: 30_000, reason: "จ่ายค่าน้ำแข็ง", idempotencyKey: `${TAG}-out-1` });
  const sf = await legacy(u1, posS, 7000); // HOTEL นอกกะ
  const sg = await regSale(c2, owner, [{ productId: B, qty: 1 }], null); // D2 6,000
  const EXP1 = FLOAT1 + 4500 + 2000 + 50_000 - 30_000; // 226,500

  // ════════ X1 ผูกบิล ════════
  {
    const p: string[] = [];
    const ra = await saleRow(sa.saleId);
    const rg = await saleRow(sg.saleId);
    const rf = await saleRow(sf.saleId);
    if (!sa.saleId) p.push(`ขาย D1 ${codeOf(sa.r)}`);
    if (!sg.saleId) p.push(`ขาย D2 ${codeOf(sg.r)}`);
    if (!ra || !("shiftId" in ra)) p.push("PosSale ไม่มีคอลัมน์ shiftId");
    else {
      if (ra.shiftId !== S1) p.push(`บิล D1 shiftId ${short(ra.shiftId, 30)}`);
      if (rg?.shiftId !== S2) p.push(`บิล D2 shiftId ${short(rg?.shiftId, 30)}`);
      if (!rf || rf.shiftId !== null) p.push(`บิล HOTEL shiftId ${short(rf?.shiftId, 30)}`);
    }
    const x1 = rep(await xr(c1, owner, S1));
    const x2 = rep(await xr(c1, owner, S2));
    if (!x1 || !x2) p.push("xReport ไม่ ok");
    else {
      if (x2.billCount !== 1 || x2.cashSalesSatang !== 6000) p.push(`X D2 bill ${x2.billCount} cash ${x2.cashSalesSatang}`);
      if (x1.cashSalesSatang === 6500 + 6000) p.push("X D1 นับบิลของ D2");
    }
    chk("P1.9-X1", p.length === 0, "D1→กะ1 · D2→กะ2 · HOTEL→null · X แยกเครื่อง", FX(p.join(" · ") || "ครบ"));
  }

  // ════════ X2 เงินที่ควรมี ════════
  {
    const p: string[] = [];
    const x = rep(await xr(c1, owner, S1));
    const d = await dbCash(S1);
    if (!x) p.push("xReport ไม่ ok");
    else if (x.expectedCashSatang !== EXP1) p.push(`X.expected ${x.expectedCashSatang} ≠ ${EXP1}`);
    if (d.err) p.push(`คำนวณจาก DB ไม่ได้: ${d.err}`);
    else {
      if (d.expected !== EXP1) p.push(`DB expected ${d.expected}`);
      if (d.expectedTender !== EXP1) p.push(`สูตรเงินรับ−ทอน ${d.expectedTender}`);
      if (x && x.expectedCashSatang !== d.expected) p.push(`X ${x.expectedCashSatang} ≠ DB ${d.expected}`);
    }
    if (x) {
      const parts = x.floatSatang + x.cashTenderedSatang - x.changeSatang + x.cashInSatang - x.cashOutSatang - x.cashRefundsSatang;
      if (parts !== x.expectedCashSatang) p.push(`ส่วนประกอบใน X รวมได้ ${parts}`);
      if (x.cashRefundsSatang !== (d.err ? 0 : d.refundCash)) p.push(`cashRefunds ${x.cashRefundsSatang}`);
    }
    chk("P1.9-X2", p.length === 0, `expected ${EXP1} = DB = ส่วนประกอบ`, FX(p.join(" · ") || "ครบ"));
  }

  // ════════ X3 แยกวิธีชำระ + X ไม่เขียน ════════
  {
    const p: string[] = [];
    if (!voidOk(vc)) p.push(`void บิล c ${codeOf(vc)}`);
    if (!sd.saleId) p.push(`createSale(shiftId) ${codeOf(sd.r)}`);
    if (!sb2.saleId) p.push(`ขายแบ่งจ่าย ${codeOf(sb2.r)}`);
    const before = { row: sha(await shiftRow(S1)), sh: (await shiftsOf({ unitId: u1 })).length, mv: PM ? await PM.count({ where: { unitId: u1 } }).catch(() => -1) : -1, ob: await P.outboxEvent.count({ where: { unitId: u1 } }).catch(() => -1) };
    const xa = rep(await xr(c1, owner, S1));
    const xb = rep(await xr(c1, owner, S1));
    const after = { row: sha(await shiftRow(S1)), sh: (await shiftsOf({ unitId: u1 })).length, mv: PM ? await PM.count({ where: { unitId: u1 } }).catch(() => -1) : -1, ob: await P.outboxEvent.count({ where: { unitId: u1 } }).catch(() => -1) };
    if (!xa) p.push("xReport ไม่ ok");
    else {
      const want: [string, number, number][] = [["CASH", 2, 6500], ["PROMPTPAY", 1, 4000], [CARD_TYPE, 1, 3000]];
      for (const [t, n, amt] of want) {
        const m = methodOf(xa, t);
        if (!m || m.count !== n || m.amountSatang !== amt) p.push(`${t} ${short(m, 60)}`);
      }
      if (xa.billCount !== 3 || xa.salesTotalSatang !== 13_500) p.push(`bill ${xa.billCount} total ${xa.salesTotalSatang}`);
      if (xa.voidCount !== 1 || xa.voidTotalSatang !== 9000) p.push(`void ${xa.voidCount}/${xa.voidTotalSatang}`);
      if (xa.cashInSatang !== 50_000 || xa.cashOutSatang !== 30_000) p.push(`in ${xa.cashInSatang} out ${xa.cashOutSatang}`);
      if (xa.status !== "OPEN" || xa.zNumber !== null) p.push(`status ${xa.status} z ${xa.zNumber}`);
      const strip = (o: Any) => ({ ...o, asOf: undefined, generatedAt: undefined });
      if (xb && sha(strip(xa)) !== sha(strip(xb))) p.push("X ครั้งที่ 2 ต่างจากครั้งแรก");
      const d = await dbCash(S1);
      if (!d.err && (d.billCount !== xa.billCount || d.salesTotal !== xa.salesTotalSatang)) p.push(`DB bill ${d.billCount}/${d.salesTotal}`);
    }
    if (JSON.stringify(before) !== JSON.stringify(after)) p.push(`X เขียนข้อมูล ${short(before, 80)} → ${short(after, 80)}`);
    chk("P1.9-X3", p.length === 0, `CASH 2/6,500 · PP 1/4,000 · ${CARD_TYPE} 1/3,000 · bill 3/13,500 · void 1/9,000 · ไม่เขียน`, FX(p.join(" · ") || "ครบ"));
  }

  // ════════ X4 blind ════════
  {
    const p: string[] = [];
    const e = await setShiftSettings(posS, { blindClose: true });
    if (e) p.push(e);
    const xc = await xr(c1, cashOp, S1);
    const xo = await xr(c1, owner, S1);
    if (rep(xc)?.expectedCashSatang !== null || rep(xc)?.billCount !== 3) p.push(`แคชเชียร์ ${codeOf(xc)} expected ${short(rep(xc)?.expectedCashSatang, 20)} bill ${rep(xc)?.billCount}`);
    if (rep(xo)?.expectedCashSatang !== EXP1) p.push(`เจ้าของ expected ${short(rep(xo)?.expectedCashSatang, 20)}`);
    await setShiftSettings(posS, null);
    const xc2 = await xr(c1, cashOp, S1);
    if (rep(xc2)?.expectedCashSatang !== EXP1) p.push(`ปิด blind แล้วแคชเชียร์ ${short(rep(xc2)?.expectedCashSatang, 20)}`);
    chk("P1.9-X4", p.length === 0, "blind: แคชเชียร์ null · เจ้าของ 226,500 · ปิด blind เห็น", FX(p.join(" · ") || "ครบ"));
  }

  // ════════ X5 เงินรับ/ทอน/ทิป ════════
  {
    const p: string[] = [];
    if (!TENDER_READY) p.push("PosPayment.tenderedSatang/changeSatang ยังไม่มี (P1.6 ยังไม่รวม)");
    const x = rep(await xr(c1, owner, S1));
    const d = await dbCash(S1);
    if (!x) p.push("xReport ไม่ ok");
    else {
      if (x.cashTenderedSatang !== 12_000 || x.changeSatang !== 5500 || x.cashSalesSatang !== 6500) p.push(`tendered ${x.cashTenderedSatang} change ${x.changeSatang} cash ${x.cashSalesSatang}`);
      if (x.cashTenderedSatang - x.changeSatang !== x.cashSalesSatang) p.push("tendered − change ≠ cashSales");
      if (typeof x.tipSatang !== "number" || x.tipSatang !== (d.err ? 0 : d.tip)) p.push(`tip ${short(x.tipSatang, 20)}`);
    }
    chk("P1.9-X5", p.length === 0, "รับ 12,000 · ทอน 5,500 · สุทธิ 6,500 · tip = Σ", FX(p.join(" · ") || "ครบ"));
  }

  // ════════ M1 เงินเข้า/ออก ════════
  {
    const p: string[] = [];
    const rows = PM ? ((await PM.findMany({ where: { shiftId: S1 }, orderBy: { createdAt: "asc" } }).catch(() => [])) as Any[]) : [];
    const rin = rows.find((r) => r.kind === "IN");
    const rout = rows.find((r) => r.kind === "OUT");
    if (mIn?.ok !== true || mOut?.ok !== true) p.push(`record in ${codeOf(mIn)} out ${codeOf(mOut)}`);
    if (!(rin && rin.amountSatang === 50_000 && rin.reason === "แลกเหรียญ" && rin.byUserId === owner.userId && rin.unitId === u1)) p.push(`แถว IN ${short(rin, 80)}`);
    if (!(rout && rout.amountSatang === 30_000 && rout.reason === "จ่ายค่าน้ำแข็ง")) p.push(`แถว OUT ${short(rout, 60)}`);
    const n0 = rows.length;
    const rep1 = await move(c1, owner, { shiftId: S1, kind: "IN", amountSatang: 50_000, reason: "แลกเหรียญ", idempotencyKey: kIn });
    if (!(rep1?.ok === true && rep1.duplicated === true && rep1.movement?.id === rin?.id)) p.push(`ซ้ำ payload เดิม ${codeOf(rep1)} dup ${short(rep1?.duplicated, 10)}`);
    const rep2 = await move(c1, owner, { shiftId: S1, kind: "IN", amountSatang: 50_001, reason: "แลกเหรียญ", idempotencyKey: kIn });
    dataRefusals.push(["cash key ต่าง payload", rep2, "IDEMPOTENCY_CONFLICT"]);
    if (!refused(rep2, ["IDEMPOTENCY_CONFLICT"])) p.push(`ซ้ำ payload ต่าง ${codeOf(rep2)}`);
    const n1 = PM ? await PM.count({ where: { shiftId: S1 } }).catch(() => -1) : -1;
    if (n1 !== n0 || n0 !== 2) p.push(`แถว ${n0}→${n1}`);
    chk("P1.9-M1", p.length === 0, "IN/OUT ครบฟิลด์ · ซ้ำเดิม = duplicated · ซ้ำต่าง = CONFLICT · 2 แถว", FX(p.join(" · ") || "ครบ"));
  }

  // ════════ M2 ตรวจเงินเข้า/ออก ════════
  {
    const p: string[] = [];
    const n0 = PM ? await PM.count({ where: { unitId: u1 } }).catch(() => -1) : -1;
    const base = (o: Any) => ({ shiftId: S1, kind: "IN", amountSatang: 100, reason: "ทดสอบ", idempotencyKey: `${TAG}-mv-${++keyN}`, ...o });
    const cases: [string, Any, string][] = [
      ["0", base({ amountSatang: 0 }), "VALIDATION"],
      ["−1", base({ amountSatang: -1 }), "VALIDATION"],
      ["1.5", base({ amountSatang: 1.5 }), "VALIDATION"],
      ["สตริง", base({ amountSatang: "100" }), "VALIDATION"],
      ["เหตุผลว่าง", base({ reason: "" }), "VALIDATION"],
      ["เหตุผล 201", base({ reason: "ก".repeat(201) }), "VALIDATION"],
      ["kind แปลก", base({ kind: "SIDEWAYS" }), "VALIDATION"],
      ["ออกเกินเงินที่ควรมี", base({ kind: "OUT", amountSatang: EXP1 + 1 }), "DRAWER_INSUFFICIENT"],
      ["กะไม่มี", base({ shiftId: `nope-${RAND}` }), "NOT_FOUND"],
    ];
    for (const [label, input, code] of cases) {
      const r = await move(c1, owner, input);
      if (label === "ออกเกินเงินที่ควรมี") dataRefusals.push(["cash out เกิน", r, "DRAWER_INSUFFICIENT"]);
      if (label === "0") dataRefusals.push(["cash 0", r, "VALIDATION"]);
      if (!refused(r, [code])) p.push(`${label}: ${codeOf(r)}`);
    }
    const n1 = PM ? await PM.count({ where: { unitId: u1 } }).catch(() => -1) : -1;
    if (n1 !== n0 || n0 < 0) p.push(`แถว ${n0}→${n1}`);
    chk("P1.9-M2", p.length === 0, "7 VALIDATION · DRAWER_INSUFFICIENT · NOT_FOUND · ไม่มีแถว", FX(p.join(" · ") || "ครบ"));
  }

  // ════════ C1 ปิดกะ D2 ════════
  let zS2: Any = null;
  {
    const p: string[] = [];
    const r = await close(c2, owner, { shiftId: S2, countedCashSatang: 104_500, note: "ทอนเกินให้ลูกค้า", idempotencyKey: `${TAG}-close-s2` });
    zS2 = rep(r);
    const row = await shiftRow(S2);
    if (r?.ok !== true) p.push(`close ${codeOf(r)} ${short(r?.message ?? "", 60)}`);
    else {
      const z = zS2 ?? {};
      if (z.expectedCashSatang !== 106_000 || z.countedCashSatang !== 104_500 || z.overShortSatang !== -1500) p.push(`Z exp ${z.expectedCashSatang} cnt ${z.countedCashSatang} os ${z.overShortSatang}`);
      if (z.zNumber !== 1) p.push(`zNumber ${z.zNumber}`);
      if (z.billCount !== 1 || z.cashSalesSatang !== 6000) p.push(`Z bill ${z.billCount} cash ${z.cashSalesSatang}`);
      if (z.closedByUserId !== owner.userId || z.note !== "ทอนเกินให้ลูกค้า" || z.forced !== false) p.push(`Z closedBy/note/forced ${short([z.closedByUserId, z.note, z.forced], 80)}`);
    }
    if (!row || row.status !== "CLOSED" || row.zNumber !== 1 || row.expectedCashSatang !== 106_000 || row.countedCashSatang !== 104_500 || row.overShortSatang !== -1500 || row.closeNote !== "ทอนเกินให้ลูกค้า" || !row.closedAt)
      p.push(`แถว ${short(row && { s: row.status, z: row.zNumber, e: row.expectedCashSatang, c: row.countedCashSatang, o: row.overShortSatang }, 100)}`);
    if (row && zS2 && sha(row.zReport) !== sha(zS2)) p.push("zReport ในแถว ≠ Z ที่คืน");
    const ev = await shiftEvents(S2, "pos.shift.closed");
    const pl = ev[0]?.payload ?? {};
    if (ev.length !== 1 || pl.overShortSatang !== -1500 || pl.zNumber !== 1 || pl.forced !== false) p.push(`event ${ev.length} ${short(pl, 80)}`);
    chk("P1.9-C1", p.length === 0, "CLOSED · −1,500 · Z#1 · Z = แถว · event", FX(p.join(" · ") || "ครบ"));
  }

  // ════════ C2 ผลต่างเกินเกณฑ์ ════════
  {
    const p: string[] = [];
    const r1 = await close(c1, owner, { shiftId: S1, countedCashSatang: EXP1 - 10_001, idempotencyKey: `${TAG}-c2a` });
    dataRefusals.push(["close ไม่มีเหตุผล", r1, "REASON_REQUIRED"]);
    if (!refused(r1, ["REASON_REQUIRED"])) p.push(`ปริยาย ขาด 10,001: ${codeOf(r1)}`);
    const e = await setShiftSettings(posS, { overShortReasonSatang: 500 });
    if (e) p.push(e);
    const r2 = await close(c1, owner, { shiftId: S1, countedCashSatang: EXP1 - 501, idempotencyKey: `${TAG}-c2b` });
    if (!refused(r2, ["REASON_REQUIRED"])) p.push(`ตั้ง 500 ขาด 501: ${codeOf(r2)}`);
    await setShiftSettings(posS, null);
    if ((await shiftRow(S1))?.status !== "OPEN") p.push("กะไม่ OPEN แล้ว");
    chk("P1.9-C2", p.length === 0, "REASON_REQUIRED ×2 · กะยัง OPEN", FX(p.join(" · ") || "ครบ"));
  }

  // ════════ C3 ตรวจค่าปิดกะ ════════
  {
    const p: string[] = [];
    const k = () => `${TAG}-c3-${++keyN}`;
    const cases: [string, Any][] = [
      ["detail รวมไม่เท่า", { countedCashSatang: EXP1, countDetail: { "100000": 2 } }],
      ["ธนบัตร 300", { countedCashSatang: 30_000, countDetail: { "30000": 1 } }],
      ["จำนวน −1", { countedCashSatang: 0, countDetail: { "100000": -1, "50000": 2 } }],
      ["counted −1", { countedCashSatang: -1 }],
      ["counted 1.5", { countedCashSatang: 1.5 }],
    ];
    for (const [label, input] of cases) {
      const r = await close(c1, owner, { shiftId: S1, note: "ทดสอบ", idempotencyKey: k(), ...input });
      if (!refused(r, ["VALIDATION"])) p.push(`${label}: ${codeOf(r)}`);
    }
    const row = await shiftRow(S1);
    if (row?.status !== "OPEN" || row?.zNumber !== null) p.push(`แถว ${row?.status} z ${row?.zNumber}`);
    chk("P1.9-C3", p.length === 0, "5 กรณี VALIDATION · ยัง OPEN ไม่มี Z", FX(p.join(" · ") || "ครบ"));
  }

  // ════════ C4 ปิดกะ D1 + countedOther ════════
  const CD1 = { "100000": 2, "10000": 2, "5000": 1, "1000": 1, "500": 1 }; // 226,500
  let zS1: Any = null;
  {
    const p: string[] = [];
    const r = await close(c1, owner, { shiftId: S1, countedCashSatang: EXP1, countDetail: CD1, countedOther: { PROMPTPAY: 4000, [CARD_TYPE]: 2900 }, idempotencyKey: `${TAG}-close-s1` });
    zS1 = rep(r);
    if (r?.ok !== true) p.push(`close ${codeOf(r)} ${short(r?.message ?? "", 60)}`);
    else {
      if (zS1.overShortSatang !== 0 || zS1.expectedCashSatang !== EXP1) p.push(`os ${zS1.overShortSatang} exp ${zS1.expectedCashSatang}`);
      const pp = methodOf(zS1, "PROMPTPAY");
      const cd = methodOf(zS1, CARD_TYPE);
      if (!(pp?.countedSatang === 4000 && pp?.diffSatang === 0)) p.push(`PROMPTPAY ${short(pp, 60)}`);
      if (!(cd?.countedSatang === 2900 && cd?.diffSatang === -100)) p.push(`${CARD_TYPE} ${short(cd, 60)}`);
      if (normJ(zS1.countDetail) !== normJ(CD1)) p.push(`countDetail ${short(zS1.countDetail, 60)}`);
    }
    const row = await shiftRow(S1);
    if (row?.status !== "CLOSED" || row?.overShortSatang !== 0) p.push(`แถว ${row?.status} os ${row?.overShortSatang}`);
    chk("P1.9-C4", p.length === 0, "os 0 ไม่ต้องเหตุผล · PP diff 0 · บัตร −100 · detail ตรง", FX(p.join(" · ") || "ครบ"));
  }

  // ════════ C5 Z แช่แข็ง ════════
  {
    const p: string[] = [];
    const row0 = await shiftRow(S1);
    const zA = rep(await zr(c1, owner, S1));
    if (!zA) p.push("zReport ไม่ ok");
    else if (zS1 && sha(zA) !== sha(zS1)) p.push("zReport ≠ Z ตอนปิด");
    const n0 = await salesIn(u1);
    const s1 = await regSale(c1, owner, [{ productId: A, qty: 1 }], null);
    dataRefusals.push(["ขายหลังปิดกะ", s1.r, "SHIFT_REQUIRED"]);
    if (!refused(s1.r, ["SHIFT_REQUIRED"])) p.push(`ขาย D1 หลังปิด ${codeOf(s1.r)}`);
    const s2 = await legacy(u1, posS, 1000, { shiftId: S1, source: "POS" });
    if (!refused(s2.r, ["SHIFT_CLOSED"])) p.push(`createSale(shiftId ปิด) ${codeOf(s2.r)}`);
    if ((await salesIn(u1)) !== n0) p.push("มีบิลเกิด");
    const m = await move(c1, owner, { shiftId: S1, kind: "IN", amountSatang: 100, reason: "หลังปิด", idempotencyKey: `${TAG}-after` });
    dataRefusals.push(["cash หลังปิด", m, "SHIFT_CLOSED"]);
    if (!refused(m, ["SHIFT_CLOSED"])) p.push(`เงินเข้าหลังปิด ${codeOf(m)}`);
    const v = sa.saleId ? await voidS(u1, sa.saleId) : { ok: false, code: "NO_SALE" };
    if (!refused(v, ["SHIFT_CLOSED"])) p.push(`void บิลในกะปิด ${codeOf(v)}`);
    if ((await saleRow(sa.saleId))?.status !== "PAID") p.push("บิลไม่ PAID แล้ว");
    // แก้ยอดจ่ายใน DB ตรง ๆ แล้วอ่าน Z ซ้ำ
    const payA = sa.saleId ? ((await P.posPayment.findFirst({ where: { saleId: sa.saleId, type: "CASH" } }).catch(() => null)) as Any) : null;
    if (payA) await P.posPayment.update({ where: { id: payA.id }, data: { amountSatang: payA.amountSatang + 100 } }).catch(() => null);
    const zB = rep(await zr(c1, owner, S1));
    if (payA) await P.posPayment.update({ where: { id: payA.id }, data: { amountSatang: payA.amountSatang } }).catch(() => null);
    if (!zB || !zA || sha(zB) !== sha(zA)) p.push("Z เปลี่ยนตามข้อมูลบิล (คำนวณใหม่)");
    const again = await close(c1, owner, { shiftId: S1, countedCashSatang: 1, note: "ซ้ำ", idempotencyKey: `${TAG}-close-s1-again` });
    dataRefusals.push(["ปิดซ้ำคีย์ใหม่", again, "SHIFT_CLOSED"]);
    if (!refused(again, ["SHIFT_CLOSED"])) p.push(`ปิดซ้ำ ${codeOf(again)}`);
    const row1 = await shiftRow(S1);
    if (sha(row0) !== sha(row1)) p.push("แถวกะที่ปิดถูกเขียน");
    chk("P1.9-C5", p.length === 0, "ขาย/เงินเข้า/void หลังปิด = ปฏิเสธ · Z เดิมทุกไบต์ · ปิดซ้ำ = SHIFT_CLOSED", FX(p.join(" · ") || "ครบ"));
  }

  // ════════ C6 แข่งปิด ════════
  const raceShifts: string[] = [];
  {
    const p: string[] = [];
    let winnerKey = "", winnerShift = "", winnerZ: Any = null;
    for (let round = 0; round < 3; round++) {
      const o = await open(ctx(u2, posS), owner, { deviceId: dev(`race-close-${round}`), floatSatang: 0 });
      const s = sid(o);
      raceShifts.push(s);
      if (!s) {
        p.push(`รอบ ${round + 1}: เปิด ${codeOf(o)}`);
        continue;
      }
      const keys = Array.from({ length: 10 }, (_, i) => `${TAG}-rc-${round}-${i}`);
      const rs = await Promise.all(keys.map(async (k, i) => close(ctx(u2, posS), owner, { shiftId: s, countedCashSatang: 0, idempotencyKey: k }, await lane(i))));
      const okIdx = rs.map((r, i) => (r?.ok === true ? i : -1)).filter((i) => i >= 0);
      const lost = rs.filter((r) => refused(r, ["SHIFT_CLOSED"])).length;
      const other = rs.filter((r) => !(r?.ok === true || refused(r, ["SHIFT_CLOSED"]))).map(codeOf);
      const ev = await shiftEvents(s, "pos.shift.closed");
      if (okIdx.length !== 1 || lost !== 9 || ev.length !== 1) p.push(`รอบ ${round + 1}: ok ${okIdx.length} closed ${lost} event ${ev.length}${other.length ? ` อื่น ${[...new Set(other)].join(",")}` : ""}`);
      if (okIdx.length === 1 && round === 0) {
        winnerKey = keys[okIdx[0]];
        winnerShift = s;
        winnerZ = rs[okIdx[0]].report;
      }
    }
    const zs = (await Promise.all(raceShifts.map(shiftRow))).map((r) => r?.zNumber);
    if (JSON.stringify(zs) !== JSON.stringify([1, 2, 3])) p.push(`zNumber สาขา 2 ${JSON.stringify(zs)}`);
    if (winnerKey) {
      const re = await close(ctx(u2, posS), owner, { shiftId: winnerShift, countedCashSatang: 0, idempotencyKey: winnerKey });
      if (!(re?.ok === true && re.duplicated === true && re.report?.zNumber === winnerZ?.zNumber)) p.push(`ลองซ้ำคีย์ผู้ชนะ ${codeOf(re)} dup ${short(re?.duplicated, 10)}`);
      if ((await shiftEvents(winnerShift, "pos.shift.closed")).length !== 1) p.push("ลองซ้ำแล้วมี event เพิ่ม");
    }
    chk("P1.9-C6", p.length === 0, "3 รอบ × (ok 1 · CLOSED 9 · event 1) · Z 1,2,3 · ลองซ้ำ = duplicated", FX(p.join(" · ") || "ครบ"));
  }

  // ════════ C7 ขายแข่งกับปิดกะ ════════
  let S3 = "";
  {
    const p: string[] = [];
    const D3 = dev("d3");
    S3 = sid(await open(ctx(u1, posS), owner, { deviceId: D3, floatSatang: 0 }));
    if (!S3) p.push("เปิดกะ D3 ไม่ได้");
    const c3 = ctx(u1, posS, D3);
    const jobs: Promise<Any>[] = [];
    for (let i = 0; i < 8; i++) jobs.push(lane(i).then((cl) => regSale(c3, owner, [{ productId: A, qty: 1 }], null, { cl })).then((x) => x.r));
    jobs.push(lane(8).then((cl) => close(c3, owner, { shiftId: S3, countedCashSatang: 0, note: "แข่งกับบิล", idempotencyKey: `${TAG}-c7` }, cl)));
    const rs = await Promise.all(jobs);
    const closeR = rs[8];
    const sales = rs.slice(0, 8);
    const okSales = sales.filter((r) => r?.ok === true).length;
    const refusedSales = sales.filter((r) => refused(r, ["SHIFT_REQUIRED", "SHIFT_CLOSED"])).length;
    const other = sales.filter((r) => !(r?.ok === true || refused(r, ["SHIFT_REQUIRED", "SHIFT_CLOSED"]))).map(codeOf);
    if (closeR?.ok !== true) p.push(`close ${codeOf(closeR)}`);
    if (okSales + refusedSales !== 8) p.push(`บิล ok ${okSales} ปฏิเสธ ${refusedSales} อื่น ${[...new Set(other)].join(",")}`);
    const row = await shiftRow(S3);
    const d = await dbCash(S3);
    const z = row?.zReport ?? {};
    if (d.err) p.push(`DB ${d.err}`);
    else {
      if (z.billCount !== d.billCount || z.cashSalesSatang !== d.cashSales) p.push(`Z bill ${z.billCount}/${z.cashSalesSatang} ≠ DB ${d.billCount}/${d.cashSales}`);
      if (d.billCount !== okSales) p.push(`บิลผูกกะ ${d.billCount} ≠ ok ${okSales}`);
      const late = row?.closedAt ? await P.posSale.count({ where: { shiftId: S3, createdAt: { gt: row.closedAt } } }).catch(() => -1) : -1;
      if (late !== 0) p.push(`บิลหลัง closedAt ${late}`);
    }
    chk("P1.9-C7", p.length === 0, "บิลที่ผูกกะ = ที่อยู่ใน Z · ที่เหลือปฏิเสธไม่มีบิล", FX(p.join(" · ") || `ok ${okSales} · ปฏิเสธ ${refusedSales}`));
  }

  // ════════ C8 เลข Z ต่อสาขา ════════
  {
    const p: string[] = [];
    const rs1 = await shiftRow(S1);
    const rs2 = await shiftRow(S2);
    const rs3 = await shiftRow(S3);
    if (!(rs2?.zNumber === 1 && rs1?.zNumber === 2 && rs3?.zNumber === 3)) p.push(`สาขา 1 Z: D2 ${rs2?.zNumber} D1 ${rs1?.zNumber} D3 ${rs3?.zNumber}`);
    for (const u of [u1, u2]) {
      const rows = await shiftsOf({ unitId: u });
      const zn = rows.map((r) => r.zNumber).filter((z) => z !== null).sort((a, b) => a - b);
      if (zn.some((z, i) => z !== i + 1)) p.push(`${u === u1 ? "สาขา 1" : "สาขา 2"} Z ${JSON.stringify(zn)}`);
      const sn = rows.map((r) => r.shiftNo);
      if (new Set(sn).size !== sn.length) p.push("shiftNo ซ้ำ");
      const ctr = PC ? ((await PC.findFirst({ where: { unitId: u } }).catch(() => null)) as Any) : null;
      if (!ctr || ctr.zSeq !== (zn.length ? zn[zn.length - 1] : 0)) p.push(`counter zSeq ${ctr?.zSeq} ≠ ${zn[zn.length - 1]}`);
    }
    chk("P1.9-C8", p.length === 0, "Z ตามลำดับปิด · gapless ต่อสาขา · zSeq = สูงสุด · shiftNo ไม่ซ้ำ", FX(p.join(" · ") || "ครบ"));
  }

  // ════════ F1 ขี้เกียจตอนเปิด ════════
  let SF1 = "", saleF1 = "";
  {
    const p: string[] = [];
    const DF = dev("f1");
    SF1 = sid(await open(ctx(u2, posS), owner, { deviceId: DF, floatSatang: 1000 }));
    saleF1 = (await regSale(ctx(u2, posS, DF), owner, [{ productId: A, qty: 1 }], null)).saleId;
    const e = await setShift(SF1, { openedAt: new Date(Date.now() - 25 * HOUR) });
    if (e) p.push(e);
    const o = await open(ctx(u2, posS), owner, { deviceId: DF, floatSatang: 500 });
    const row = await shiftRow(SF1);
    if (!(o?.ok === true && sid(o) && sid(o) !== SF1 && o.forceClosedShiftId === SF1)) p.push(`เปิดใหม่ ${codeOf(o)} forced ${short(o?.forceClosedShiftId, 30)}`);
    if (!row || row.status !== "FORCE_CLOSED") p.push(`กะเก่า ${row?.status}`);
    else {
      if (row.expectedCashSatang !== 5500) p.push(`expected ${row.expectedCashSatang}`);
      if (row.countedCashSatang !== null || row.overShortSatang !== null || row.closedByUserId !== null) p.push("counted/overShort/closedBy ไม่ null");
      if (!Number.isInteger(row.zNumber) || row.zReport?.forced !== true) p.push(`z ${row.zNumber} forced ${short(row.zReport?.forced, 10)}`);
    }
    const ev = await shiftEvents(SF1, "pos.shift.closed");
    if (ev.length !== 1 || ev[0]?.payload?.forced !== true) p.push(`event ${ev.length} forced ${short(ev[0]?.payload?.forced, 10)}`);
    chk("P1.9-F1", p.length === 0, "เปิดใหม่ ok + forceClosedShiftId · FORCE_CLOSED exp 5,500 · null ×3 · Z forced · event", FX(p.join(" · ") || "ครบ"));
  }

  // ════════ F2 ขี้เกียจตอนขาย ════════
  {
    const p: string[] = [];
    const DF = dev("f2");
    const s = sid(await open(ctx(u2, posS), owner, { deviceId: DF, floatSatang: 0 }));
    const e = await setShift(s, { openedAt: new Date(Date.now() - 25 * HOUR) });
    if (e) p.push(e);
    const n0 = await salesIn(u2);
    const r = await regSale(ctx(u2, posS, DF), owner, [{ productId: A, qty: 1 }], null);
    if (!refused(r.r, ["SHIFT_REQUIRED"])) p.push(`ขาย ${codeOf(r.r)}`);
    if ((await salesIn(u2)) !== n0) p.push("มีบิลเกิด");
    if ((await shiftRow(s))?.status !== "FORCE_CLOSED") p.push(`กะ ${(await shiftRow(s))?.status}`);
    chk("P1.9-F2", p.length === 0, "SHIFT_REQUIRED ไม่มีบิล · กะ FORCE_CLOSED", FX(p.join(" · ") || "ครบ"));
  }

  // ════════ F3 กวาด ════════
  {
    const p: string[] = [];
    const s25 = sid(await open(ctx(u2, posS), owner, { deviceId: dev("f3a"), floatSatang: 0 }));
    const s23 = sid(await open(ctx(u2, posS), owner, { deviceId: dev("f3b"), floatSatang: 0 }));
    await setShift(s25, { openedAt: new Date(Date.now() - 25 * HOUR) });
    await setShift(s23, { openedAt: new Date(Date.now() - 23 * HOUR) });
    const r1 = await call(shiftMod, "forceCloseStaleShifts", { now: new Date(), tenantId: tid });
    const closed1: string[] = Array.isArray(r1?.closed) ? r1.closed : [];
    if (!closed1.includes(s25) || closed1.includes(s23)) p.push(`รอบ 1 ${codeOf(r1)} ${short(closed1, 80)}`);
    if ((await shiftRow(s25))?.status !== "FORCE_CLOSED" || (await shiftRow(s23))?.status !== "OPEN") p.push("สถานะหลังกวาดผิด");
    const r2 = await call(shiftMod, "forceCloseStaleShifts", { now: new Date(), tenantId: tid });
    const closed2: string[] = Array.isArray(r2?.closed) ? r2.closed : ["?"];
    if (closed2.some((x) => [s25, s23].includes(x)) || closed2.includes("?")) p.push(`รอบ 2 ${short(closed2, 60)}`);
    const e = await setShiftSettings(posS, { forceCloseAfterHours: 48 });
    if (e) p.push(e);
    const s30 = sid(await open(ctx(u2, posS), owner, { deviceId: dev("f3c"), floatSatang: 0 }));
    await setShift(s30, { openedAt: new Date(Date.now() - 30 * HOUR) });
    const r3 = await call(shiftMod, "forceCloseStaleShifts", { now: new Date(), tenantId: tid });
    if (!Array.isArray(r3?.closed) || r3.closed.includes(s30) || (await shiftRow(s30))?.status !== "OPEN") p.push(`ตั้ง 48 ชม. ${short(r3?.closed, 60)}`);
    await setShiftSettings(posS, null);
    chk("P1.9-F3", p.length === 0, "ปิด 25 ชม. · ไม่แตะ 23 · รอบสองว่าง · 48 ชม. ไม่ปิด 30", FX(p.join(" · ") || "ครบ"));
  }

  // ════════ F4 กะที่ถูกบังคับปิดจบแล้ว ════════
  {
    const p: string[] = [];
    const r = await close(ctx(u2, posS), owner, { shiftId: SF1, countedCashSatang: 5500, idempotencyKey: `${TAG}-f4` });
    if (!refused(r, ["SHIFT_CLOSED"])) p.push(`close ${codeOf(r)}`);
    const v = saleF1 ? await voidS(u2, saleF1) : { ok: false, code: "NO_SALE" };
    if (!refused(v, ["SHIFT_CLOSED"])) p.push(`void ${codeOf(v)}`);
    if ((await saleRow(saleF1))?.status !== "PAID") p.push("บิลไม่ PAID");
    const z = rep(await zr(ctx(u2, posS), owner, SF1));
    if (!(z?.forced === true && z.countedCashSatang === null)) p.push(`zReport ${short(z && { f: z.forced, c: z.countedCashSatang }, 60)}`);
    chk("P1.9-F4", p.length === 0, "close/void = SHIFT_CLOSED · Z forced counted null", FX(p.join(" · ") || "ครบ"));
  }

  // ════════ R1 POS ใหม่บังคับมีกะ ════════
  const DX = dev("rx");
  let SX = "";
  {
    const p: string[] = [];
    const n0 = await salesIn(u2);
    const q0 = await receiptSeq(u2);
    const a1 = await regSale(ctx(u2, posS), owner, [{ productId: A, qty: 1 }], null);
    const a2 = await regSale(ctx(u2, posS, DX), owner, [{ productId: A, qty: 1 }], null);
    const a3 = await regSale(ctx(u2, posS, "ab"), owner, [{ productId: A, qty: 1 }], null);
    dataRefusals.push(["ขายไม่มีกะ", a2.r, "SHIFT_REQUIRED"]);
    if (!refused(a1.r, ["SHIFT_REQUIRED"])) p.push(`ไม่ส่ง deviceId ${codeOf(a1.r)}`);
    if (!refused(a2.r, ["SHIFT_REQUIRED"])) p.push(`เครื่องไม่มีกะ ${codeOf(a2.r)}`);
    if (!refused(a3.r, ["VALIDATION"])) p.push(`deviceId ผิดรูป ${codeOf(a3.r)}`);
    if ((await salesIn(u2)) !== n0 || (await receiptSeq(u2)) !== q0) p.push("มีบิล/ตัวนับขยับ");
    SX = sid(await open(ctx(u2, posS), owner, { deviceId: DX, floatSatang: 0 }));
    const ok = await regSale(ctx(u2, posS, DX), owner, [{ productId: A, qty: 1 }], null);
    if (!(ok.saleId && (await saleRow(ok.saleId))?.shiftId === SX)) p.push(`เปิดกะแล้วขาย ${codeOf(ok.r)}`);
    chk("P1.9-R1", p.length === 0, "SHIFT_REQUIRED ×2 · VALIDATION · ไม่มีบิล · เปิดกะแล้วผูก", FX(p.join(" · ") || "ครบ"));
  }

  // ════════ R2 ลองซ้ำหลังปิดกะ ════════
  {
    const p: string[] = [];
    const key = newKey();
    const first = await regSale(ctx(u2, posS, DX), owner, [{ productId: B, qty: 1 }], null, { key });
    const cl = await close(ctx(u2, posS), owner, { shiftId: SX, countedCashSatang: 10_500, idempotencyKey: `${TAG}-r2` });
    if (cl?.ok !== true) p.push(`ปิด ${codeOf(cl)}`);
    const again = await regSale(ctx(u2, posS, DX), owner, [{ productId: B, qty: 1 }], null, { key });
    if (!(first.saleId && again.r?.ok === true && again.r.duplicated === true && again.saleId === first.saleId)) p.push(`ลองซ้ำ ${codeOf(again.r)} dup ${short(again.r?.duplicated, 10)}`);
    chk("P1.9-R2", p.length === 0, "duplicated saleId เดิม", FX(p.join(" · ") || "ครบ"));
  }

  // ════════ R3 ปิดการบังคับของหน้าขาย ════════
  {
    const p: string[] = [];
    const e = await setShiftSettings(posS, { required: { register: false } });
    if (e) p.push(e);
    const a = await regSale(ctx(u2, posS), owner, [{ productId: A, qty: 1 }], null);
    const ra = await saleRow(a.saleId);
    if (!(a.saleId && ra && "shiftId" in ra && ra.shiftId === null)) p.push(`ไม่มี deviceId ${codeOf(a.r)} shiftId ${short(ra?.shiftId, 20)}`);
    const DY = dev("ry");
    const sy = sid(await open(ctx(u2, posS), owner, { deviceId: DY, floatSatang: 0 }));
    const b = await regSale(ctx(u2, posS, DY), owner, [{ productId: A, qty: 1 }], null);
    if (!(b.saleId && sy && (await saleRow(b.saleId))?.shiftId === sy)) p.push(`มีกะเปิด ${codeOf(b.r)}`);
    await setShiftSettings(posS, null);
    chk("P1.9-R3", p.length === 0, "OFF: null · มีกะ: ผูก", FX(p.join(" · ") || "ครบ"));
  }

  // ════════ R4 ผู้เรียกเดิมไม่กระทบ ════════
  {
    const p: string[] = [];
    const rf = await saleRow(sf.saleId);
    if (!(rf && "shiftId" in rf && rf.shiftId === null && rf.status === "PAID")) p.push(`HOTEL ขณะกะเปิด ${short(rf && { s: rf.status, sh: rf.shiftId }, 60)}`);
    const h = await legacy(u1, posS, 2500);
    const rh = await saleRow(h.saleId);
    if (!(rh && "shiftId" in rh && rh.shiftId === null)) p.push(`HOTEL หลังปิดกะ ${codeOf(h.r)}`);
    const v = sf.saleId ? await voidS(u1, sf.saleId) : { ok: false, code: "NO_SALE" };
    if (!voidOk(v) || (await saleRow(sf.saleId))?.status !== "VOIDED") p.push(`void บิลเดิม ${codeOf(v)}`);
    const l = await regSale(ctx(u3, posL), owner, [{ productId: L, qty: 1 }], null);
    const rl = await saleRow(l.saleId);
    if (!(l.saleId && rl && "shiftId" in rl && rl.shiftId === null)) p.push(`POS จอเดิม ${codeOf(l.r)} ${short(l.r?.message ?? "", 40)}`);
    chk("P1.9-R4", p.length === 0, "HOTEL null ×2 · void ได้ · จอเดิมขายได้ null", FX(p.join(" · ") || "ครบ"));
  }

  // ════════ R5 otherSources ════════
  let S4 = "", boundR5 = "";
  const offShiftSales: { id: string; cash: number }[] = [];
  {
    const p: string[] = [];
    const e = await setShiftSettings(posR, { required: { otherSources: true } });
    if (e) p.push(e);
    const n0 = await salesIn(u4);
    const q0 = await receiptSeq(u4);
    const a = await legacy(u4, posR, 1200);
    if (!refused(a.r, ["SHIFT_REQUIRED"])) p.push(`0 กะ ${codeOf(a.r)}`);
    if ((await salesIn(u4)) !== n0 || (await receiptSeq(u4)) !== q0) p.push("มีบิล/ตัวนับขยับ");
    S4 = sid(await open(ctx(u4, posR), owner, { deviceId: dev("d4"), floatSatang: 0 }));
    const b = await legacy(u4, posR, 1200);
    boundR5 = b.saleId;
    if (!(b.saleId && S4 && (await saleRow(b.saleId))?.shiftId === S4)) p.push(`1 กะ ${codeOf(b.r)}`);
    const x = rep(await xr(ctx(u4, posR), owner, S4));
    if (x?.cashSalesSatang !== 1200) p.push(`X cash ${x?.cashSalesSatang}`);
    await setShiftSettings(posR, null);
    const c = await legacy(u4, posR, 2500);
    const rc = await saleRow(c.saleId);
    if (!(rc && "shiftId" in rc && rc.shiftId === null)) p.push(`ปิดค่ากลับ ${codeOf(c.r)} ${short(rc?.shiftId, 20)}`);
    else offShiftSales.push({ id: c.saleId, cash: 2500 });
    chk("P1.9-R5", p.length === 0, "0 กะ SHIFT_REQUIRED · 1 กะ ผูก+X · ปิดค่า null", FX(p.join(" · ") || "ครบ"));
  }

  // ════════ R6 เงินสดนอกกะ ════════
  {
    const p: string[] = [];
    const sp = await legacy(u4, posR, 1500, { pay: [{ type: "CASH", amountSatang: 1000 }, { type: "TRANSFER", amountSatang: 500 }] });
    if (sp.saleId) offShiftSales.push({ id: sp.saleId, cash: 1000 });
    const sv = await legacy(u4, posR, 800);
    if (sv.saleId) await voidS(u4, sv.saleId);
    const r = await call(shiftMod, "offShiftCash", ctx(u4, posR), owner, {});
    const bills: Any[] = r?.ok === true && Array.isArray(r.bills) ? r.bills : [];
    const ids = bills.map((b) => b?.saleId);
    if (r?.ok !== true) p.push(`offShiftCash ${codeOf(r)}`);
    for (const s of offShiftSales) {
      const b = bills.find((x) => x?.saleId === s.id);
      if (!b || b.cashSatang !== s.cash) p.push(`ขาด/ผิด ${s.cash}: ${short(b, 60)}`);
    }
    if (boundR5 && ids.includes(boundR5)) p.push("รวมบิลที่ผูกกะ");
    if (sv.saleId && ids.includes(sv.saleId)) p.push("รวมบิล VOIDED");
    const want = offShiftSales.reduce((t, s) => t + s.cash, 0);
    if (r?.ok === true && (r.totalSatang !== want || r.totalSatang !== bills.reduce((t, b) => t + (b?.cashSatang ?? 0), 0))) p.push(`total ${r.totalSatang} ≠ ${want}`);
    const deny = await call(shiftMod, "offShiftCash", ctx(u4, posR), cashOp, {});
    dataRefusals.push(["offShiftCash ไม่มี manage", deny, "PERMISSION_DENIED"]);
    if (!refused(deny, ["PERMISSION_DENIED"])) p.push(`operate ${codeOf(deny)}`);
    chk("P1.9-R6", p.length === 0, `นอกกะ ${want} (เฉพาะส่วน CASH) · ไม่รวมผูกกะ/VOIDED · operate = PERMISSION_DENIED`, FX(p.join(" · ") || "ครบ"));
  }

  // ════════ I1 ข้ามสาขา ════════
  {
    const p: string[] = [];
    const SI = sid(await open(ctx(u1, posS), owner, { deviceId: D1, floatSatang: 0 }));
    if (!SI) p.push("เปิดกะสาขา 1 ใหม่ไม่ได้");
    const cu2 = ctx(u2, posS);
    const rs: [string, Any][] = [
      ["x", await xr(cu2, owner, SI)],
      ["z", await zr(cu2, owner, S1)],
      ["close", await close(cu2, owner, { shiftId: SI, countedCashSatang: 0, idempotencyKey: `${TAG}-i1` })],
      ["cash", await move(cu2, owner, { shiftId: SI, kind: "IN", amountSatang: 100, reason: "ข้ามสาขา", idempotencyKey: `${TAG}-i1m` })],
    ];
    for (const [l, r] of rs) {
      if (l === "close") dataRefusals.push(["close ข้ามสาขา", r, "NOT_FOUND"]);
      if (!refused(r, ["NOT_FOUND"])) p.push(`${l} ${codeOf(r)}`);
    }
    if ((await shiftRow(SI))?.status !== "OPEN") p.push("กะสาขา 1 ถูกแตะ");
    const n0 = await salesIn(u2);
    const s = await legacy(u2, posS, 1000, { shiftId: SI, source: "POS" });
    if (!refused(s.r, ["SHIFT_REQUIRED"])) p.push(`createSale ข้ามสาขา ${codeOf(s.r)}`);
    if ((await salesIn(u2)) !== n0) p.push("มีบิลเกิด");
    const same = await open(ctx(u2, posS), owner, { deviceId: D1, floatSatang: 0 });
    if (!(same?.ok === true && sid(same) !== SI)) p.push(`deviceId เดียวกันที่สาขา 2 ${codeOf(same)}`);
    chk("P1.9-I1", p.length === 0, "NOT_FOUND ×4 · createSale ข้ามสาขา SHIFT_REQUIRED · deviceId เดิมเปิดที่สาขา 2 ได้", FX(p.join(" · ") || "ครบ"));
  }

  // ════════ I2 ข้ามร้าน ════════
  {
    const p: string[] = [];
    const rs: [string, Any][] = [
      ["x", await xr(ctxR, restoOwner, S1)],
      ["z", await zr(ctxR, restoOwner, S1)],
      ["close", await close(ctxR, restoOwner, { shiftId: S4, countedCashSatang: 0, idempotencyKey: `${TAG}-i2` })],
      ["cash", await move(ctxR, restoOwner, { shiftId: S4, kind: "IN", amountSatang: 100, reason: "ข้ามร้าน", idempotencyKey: `${TAG}-i2m` })],
    ];
    for (const [l, r] of rs) if (!refused(r, ["NOT_FOUND"])) p.push(`${l} ${codeOf(r)}`);
    if ((await shiftRow(S4))?.status !== "OPEN") p.push("กะร้านกาแฟถูกแตะ");
    const c = await cur(ctxR, restoOwner, D1);
    if (!(c?.ok === true && c.shift === null)) p.push(`currentShift ${codeOf(c)} ${short(c?.shift?.id ?? null, 30)}`);
    const l = await call(shiftMod, "listShifts", ctxR, restoOwner, {});
    const ids: string[] = l?.ok === true && Array.isArray(l.items) ? l.items.map((x: Any) => x?.id) : [];
    if (l?.ok !== true) p.push(`listShifts ${codeOf(l)}`);
    if (ids.some((i) => sb.shiftIds.has(i))) p.push("listShifts เห็นกะร้านกาแฟ");
    chk("P1.9-I2", p.length === 0, "NOT_FOUND ×4 · currentShift null · list ไม่เห็น", FX(p.join(" · ") || "ครบ"));
  }

  // ════════ P1 ไม่มีสิทธิ์กะ ════════
  {
    const p: string[] = [];
    const n0 = (await shiftsOf({ unitId: u4 })).length;
    const m0 = PM ? await PM.count({ where: { unitId: u4 } }).catch(() => -1) : -1;
    const c4 = ctx(u4, posR);
    const rs: [string, Any][] = [
      ["open", await open(c4, noShift, { deviceId: dev("p1"), floatSatang: 0 })],
      ["close", await close(c4, noShift, { shiftId: S4, countedCashSatang: 1200, idempotencyKey: `${TAG}-p1` })],
      ["x", await xr(c4, noShift, S4)],
      ["cash", await move(c4, noShift, { shiftId: S4, kind: "IN", amountSatang: 100, reason: "ไม่มีสิทธิ์", idempotencyKey: `${TAG}-p1m` })],
    ];
    for (const [l, r] of rs) {
      if (l === "open") dataRefusals.push(["open ไม่มีสิทธิ์", r, "PERMISSION_DENIED"]);
      if (!refused(r, ["PERMISSION_DENIED"])) p.push(`${l} ${codeOf(r)}`);
    }
    if ((await shiftsOf({ unitId: u4 })).length !== n0 || (PM ? await PM.count({ where: { unitId: u4 } }).catch(() => -1) : -1) !== m0) p.push("มีแถวเกิด");
    if ((await shiftRow(S4))?.status !== "OPEN") p.push("กะถูกปิด");
    const s1 = await open(c4, realCashier, { deviceId: dev("p1b"), floatSatang: 0 });
    const s2 = await xr(c4, realCashier, S4);
    if (!refused(s1, ["NOT_FOUND"]) || !refused(s2, ["NOT_FOUND"])) p.push(`แคชเชียร์สีลม open ${codeOf(s1)} x ${codeOf(s2)}`);
    chk("P1.9-P1", p.length === 0, "PERMISSION_DENIED ×4 ไม่มีแถว · สาขาอื่น NOT_FOUND", FX(p.join(" · ") || "ครบ"));
  }

  // ════════ P2 กะของตัวเอง / ของคนอื่น ════════
  {
    const p: string[] = [];
    const c4 = ctx(u4, posR);
    const deny = await close(c4, cashOp, { shiftId: S4, countedCashSatang: 1200, idempotencyKey: `${TAG}-p2a` });
    if (!refused(deny, ["PERMISSION_DENIED"])) p.push(`operate ปิดกะเจ้าของ ${codeOf(deny)}`);
    if ((await shiftRow(S4))?.status !== "OPEN") p.push("กะเจ้าของถูกปิด");
    const own = await open(c4, cashOp, { deviceId: dev("p2"), floatSatang: 300 });
    const ownC = await close(c4, cashOp, { shiftId: sid(own), countedCashSatang: 300, idempotencyKey: `${TAG}-p2b` });
    if (own?.ok !== true || ownC?.ok !== true) p.push(`operate เปิด ${codeOf(own)} ปิดของตัวเอง ${codeOf(ownC)}`);
    const mgr = await close(c4, cashMgr, { shiftId: S4, countedCashSatang: 1200, idempotencyKey: `${TAG}-p2c` });
    if (mgr?.ok !== true || (await shiftRow(S4))?.closedByUserId !== cashMgr.userId) p.push(`manage ปิดกะคนอื่น ${codeOf(mgr)}`);
    chk("P1.9-P2", p.length === 0, "operate ปิดของคนอื่นไม่ได้ · ของตัวเองได้ · manage ได้", FX(p.join(" · ") || "ครบ"));
  }

  // ════════ E1 event ════════
  {
    const p: string[] = [];
    const all = [...sb.shiftIds];
    let closedN = 0;
    for (const s of all) {
      const row = await shiftRow(s);
      const op = await shiftEvents(s, "pos.shift.opened");
      if (op.length !== 1) p.push(`${s.slice(-6)} opened ${op.length}`);
      if (row && row.status !== "OPEN") {
        closedN++;
        const ce = await shiftEvents(s, "pos.shift.closed");
        if (ce.length !== 1) p.push(`${s.slice(-6)} closed ${ce.length}`);
        const pl = ce[0]?.payload ?? {};
        if (ce[0] && !(pl.shiftId === s && "zNumber" in pl && "overShortSatang" in pl && "forced" in pl)) p.push(`payload ${short(pl, 60)}`);
      }
    }
    if (all.length < 10 || closedN < 8) p.push(`กะที่ตรวจ ${all.length} ปิด ${closedN}`);
    const ob = await tryImport("@/lib/outbox-consumers");
    const cons = ob?.consumers ?? {};
    for (const t of ["pos.shift.opened", "pos.shift.closed"]) if (typeof cons[t] !== "function") p.push(`ไม่มี consumer ${t}`);
    const evt = (await shiftEvents(S1, "pos.shift.closed"))[0];
    if (evt && typeof cons["pos.shift.closed"] === "function") {
      const cnt = async () => JSON.stringify([await P.outboxEvent.count({ where: { tenantId: scope.tenantId } }).catch(() => -1), PS ? await PS.count({ where: { tenantId: scope.tenantId } }).catch(() => -1) : -1, PM ? await PM.count({ where: { tenantId: scope.tenantId } }).catch(() => -1) : -1]);
      const c0 = await cnt();
      for (let i = 0; i < 2; i++) {
        try {
          await cons["pos.shift.closed"](evt);
        } catch (e) {
          p.push(`เล่นซ้ำครั้งที่ ${i + 1} throw ${(e as Error).message.slice(0, 60)}`);
        }
      }
      const c1x = await cnt();
      if (c0 !== c1x) p.push(`เล่นซ้ำแล้วแถวเปลี่ยน (outbox/กะ/เงินเข้าออก) ${c0} → ${c1x}`);
    } else if (!evt) p.push("ไม่มี event closed ของกะ D1");
    chk("P1.9-E1", p.length === 0, "opened 1 · closed 1 ต่อกะ · payload · consumer 2 · เล่นซ้ำไม่มีผล", FX(p.join(" · ") || `ครบ (${all.length} กะ · ปิด ${closedN})`));
  }

  // ════════ D1 ปฏิเสธเป็นข้อมูล ════════
  const badD1 = dataRefusals
    .filter(([, r, code]) => !(r?.ok === false && r.threw !== true && r.code === code && typeof r.message === "string" && r.message.length > 0))
    .map(([l, r]) => `${l}:${r?.threw ? "THROW " : ""}${codeOf(r)}`);
  chk("P1.9-D1", dataRefusals.length >= 12 && badD1.length === 0, `${dataRefusals.length} คำปฏิเสธ = {ok:false, code, message} ไม่ throw`, FX(badD1.join(" · ") || "ครบ"));
}

// ═════════════════════════ 6. คืนสภาพ ═════════════════════════
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
  const units = sb.unitIds;
  const systems = sb.systemIds;
  const counts: Record<string, number> = {};
  if (!units.length && !systems.length) return;
  if (PS) {
    try {
      const extra = ((await PS.findMany({ where: { tenantId: { in: TIDS }, unitId: { in: units } }, select: { id: true } })) as Any[]).map((r) => r.id);
      for (const id of extra) sb.shiftIds.add(id);
    } catch {
      /* ใช้รายการที่จำไว้ */
    }
  }
  const shiftIds = [...sb.shiftIds];
  if (systems.length && typeof P.posProduct?.findMany === "function") {
    try {
      const extra = ((await P.posProduct.findMany({ where: { tenantId: { in: TIDS }, systemId: { in: systems } }, select: { id: true } })) as Any[]).map((r) => r.id);
      sb.productIds = [...new Set([...sb.productIds, ...extra])];
    } catch {
      /* ใช้รายการที่จำไว้ */
    }
  }
  const unitOr = [...(units.length ? [{ unitId: { in: units } }] : []), ...(systems.length ? [{ systemId: { in: systems } }] : [])];
  const sales = ((await P.posSale.findMany({ where: { tenantId: { in: TIDS }, OR: unitOr }, select: { id: true } }).catch(() => [])) as Any[]).map((s) => s.id);
  const evWhere = { tenantId: { in: TIDS }, OR: [...unitOr, ...shiftIds.filter(Boolean).map((id) => ({ idempotencyKey: { contains: id } })), ...(sales.length ? [{ idempotencyKey: { in: sales.flatMap((s) => [`PosSale#${s}#PAID`, `PosSale#${s}#VOIDED`]) } }] : [])] };
  for (let i = 0; i < 20; i++) {
    const pend = await P.outboxEvent.count({ where: { ...evWhere, status: "PENDING" } }).catch(() => 0);
    if (pend === 0) break;
    await sleep(500);
  }
  counts.outbox = await del("outboxEvent", evWhere);
  counts.audit = await del("auditLog", { tenantId: { in: TIDS }, createdAt: { gte: runStart }, OR: [...(units.length ? [{ unitId: { in: units } }] : []), { targetId: { in: [...shiftIds, ...sb.productIds, ...systems, ...units, ...sales] } }] });
  if (units.length) counts.move = await del("posCashMovement", { tenantId: { in: TIDS }, unitId: { in: units } });
  if (sales.length) {
    await del("couponRedemption", { tenantId: { in: TIDS }, refType: "PosSale", refId: { in: sales } });
    await del("pointLedger", { tenantId: { in: TIDS }, refType: "PosSale", refId: { in: sales } });
    counts.payment = await del("posPayment", { saleId: { in: sales } });
    counts.line = await del("posSaleLine", { saleId: { in: sales } });
    counts.sale = await del("posSale", { id: { in: sales } });
  }
  if (units.length) {
    counts.shift = await del("posShift", { tenantId: { in: TIDS }, unitId: { in: units } });
    if (PS === null && dbCols.has("PosShift.unitId")) {
      for (const u of units) {
        try {
          await P.$executeRawUnsafe(`DELETE FROM "PosShift" WHERE "unitId" = $1`, u);
        } catch {
          /* ไม่มีตาราง */
        }
      }
    }
    await del("posShiftCounter", { tenantId: { in: TIDS }, unitId: { in: units } });
  }
  for (const m of ["posProductOptionGroup", "posVariant", "recipeLine", "posProductChannelPrice", "posProductAvailability", "posProductUnit"]) {
    if (sb.productIds.length) await del(m, { productId: { in: sb.productIds } });
  }
  counts.product = sb.productIds.length ? await del("posProduct", { id: { in: sb.productIds } }) : 0;
  if (systems.length) counts.productBySystem = await del("posProduct", { tenantId: { in: TIDS }, systemId: { in: systems } });
  if (systems.length) await del("posCategory", { tenantId: { in: TIDS }, systemId: { in: systems } });
  if (units.length) await del("posReceiptCounter", { tenantId: { in: TIDS }, unitId: { in: units } });
  if (units.length) await del("appSystemUnit", { unitId: { in: units } });
  if (systems.length) {
    await del("appSystemUnit", { systemId: { in: systems } });
    await del("appSystem", { id: { in: systems } });
  }
  if (units.length) await del("businessUnit", { id: { in: units } });
  console.log(`  ลบแล้ว: ${JSON.stringify(counts)} · กะ ${shiftIds.length} · บิล ${sales.length} · สาขา ${units.length} · ระบบ ${systems.length}`);
}

// ═════════════════════════ 7. รัน ═════════════════════════
let crashed = "";
try {
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
chk("P1.9-Z1", drift.length === 0, "ก่อน = หลัง", drift.length ? drift.join(", ") : "เท่ากันทุกตาราง");
const fpAfter = await fingerprint();
const fpDrift = Object.keys(fpBefore).filter((k) => fpBefore[k] !== fpAfter[k]).map((k) => `${k}:${fpBefore[k]}→${fpAfter[k]}`);
chk("P1.9-Z2", fpDrift.length === 0 && !Object.values(fpBefore).some((v) => v.startsWith("err")), "ลายนิ้วมือเท่าเดิมทุกตาราง", fpDrift.length ? fpDrift.join(", ") : `เท่าเดิม (${Object.entries(fpAfter).map(([k, v]) => `${k}=${v.split(":")[0]}`).join(" ")})`);
for (const [id] of CHECKS) if (!results.has(id) && !skippedChecks.has(id)) chk(id, false, "ถูกตรวจ", crashed ? `ไม่ถึง (harness ล้ม: ${crashed.slice(0, 80)})` : "ไม่ถึง");
for (const c of lanes) await c.$disconnect?.().catch?.(() => {});
const failed = [...results.entries()].filter(([, r]) => !r.ok).map(([id]) => id);
console.log(`\n===== ${SUITE} ===== ผ่าน ${results.size - failed.length}/${results.size}${FORCE ? " (QC_FORCE)" : ""}${skippedChecks.size ? ` · ข้าม ${skippedChecks.size}` : ""}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ suite: SUITE, total: results.size, passed: results.size - failed.length, failed, skipped: false, forced: FORCE, skippedChecks: Object.fromEntries(skippedChecks), missing: skipReasons, a5: { drift } })}`);
await P.$disconnect?.().catch?.(() => {});
process.exit(failed.length ? 1 : 0);

// ─── หมายเหตุขอบเขต ───
// นอกขอบเขต P1.9: PosDevice/เครื่องพิมพ์/เปิดลิ้นชัก (P1.10) · ใบคืนเงิน (P1.8 — ข้อ X2 นับ cashRefunds เมื่อมี PosSale.docType) ·
// PIN/สลับพนักงาน/ตารางงาน HR (P1.15/P3.5 ผ่าน hr.verifyPin) · JV ขาด/เกิน + การ์ดบอร์ดงาน (P3) · จอ 07/13A = visual ของผู้คุมงาน
