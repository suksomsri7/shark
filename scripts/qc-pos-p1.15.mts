// QC — POS RUN ใบ P1.15: PIN พนักงาน · โทเคนผู้ขายบนเครื่อง · เพดานส่วนลดตามบทบาท · อนุมัติ void/คืนเงิน/ส่วนลดเกินสิทธิ์ผ่านสายอนุมัติกลาง (fallback PIN ผู้จัดการ)
//   เขียนก่อนสร้าง (fail-before) · ผู้เขียนข้อสอบ
//
// สัญญา: ledger/pos-briefs/pos-brief-P1.15.md §2 R1–R9 · §4 แผนข้อสอบ · §5 CD1–CD6 · pos-brief-COMMON · pos-brief-LANE-RULES
//        ต่อยอด: pos-P1.8.md (refundSale) · pos-P1.9.md (openShift) · pos-P1.10.md (registerDevice/revokeDevice · DEVICE_REVOKED) ·
//        pos-P1.16.md (voidSaleByActor · voidSale(…, audit?)) · approval/service.ts (createPolicy · decide · requestStatuses)
//        โน้ต: ledger/wo-notes/pos-P1.15-oracle.md (ตารางชื่อ · ผังข้อมูลทดสอบ · ความคลาดเคลื่อน · CONTROLLER-DECISION · ผลแดงที่คาด)
// ชื่อทุกตัวที่ยังไม่มีในโค้ดถูก "ตั้ง" ในไฟล์นี้และลงทะเบียนในตารางชื่อของโน้ต — ผู้สร้างห้ามแก้ข้อสอบนี้ (ORACLE-EDIT เท่านั้น)
//   §3 (จอ 13B ล็อก/สลับพนักงาน · 21A/21B · แผ่นส่วนลดเกิน) = ใบ P1.15U + visual ของผู้คุมงาน — ไม่อยู่ในข้อสอบนี้
//
// ของที่ใบ P1.15 ต้องส่ง (ย่อจาก brief §2 + ชื่อที่ข้อสอบตั้ง):
//   schema: model PosStaffPin · model PosApprovalPayload · PosHeldCart.approvedRequestId String? (+ migration เพิ่มอย่างเดียว · scope.ts · pos-qc-env)
//   src/lib/modules/pos/staff-pin.ts: setStaffPin(ctx, actor, {userId, pin}) · verifyStaffPin(ctx, {unitId, deviceId, pin, userId?}) ·
//     unlockStaffPin(ctx, actor, {userId}) · staffFromToken(ctx, token) · listStaffForDevice(ctx, {unitId}) ·
//     issueStaffToken(ctx, {unitId, deviceId, userId}, opts?: {now?: Date}) (ตัวเซ็นตัวเดียวกับ verifyStaffPin — ข้อสอบใช้ทำโทเคนหมดอายุ)
//   src/lib/modules/pos/pos-approval-consumer.ts: onPosApprovalDecided(evt) (ลงทะเบียนใน outbox-consumers ข้างสายอนุมัติเดิม)
//   คีย์ input ใหม่ (ตรงตัว): staffToken (submitRegisterSale · holdRegisterCart · recallHeldCart · openShift) ·
//     managerPin + managerUserId (submitRegisterSale · voidSaleByActor · refundSale) · heldCartId (submitRegisterSale)
//   ผลใหม่: {ok:false, code:"APPROVAL_REQUIRED"|"PENDING_APPROVAL", requestId, heldCartId?} จาก voidSaleByActor / refundSale / submitRegisterSale
//
// ขอบเขต: PN PIN · TK โทเคนผู้ขาย · DC เพดานส่วนลด · AP สายอนุมัติ · NC ตัวควบคุมลบ · Z คืนสภาพ
//
// 🔴 กติกาข้อสอบ (แบบเดียวกับ qc-pos-p1.11): SKIP เมื่อของ P1.15 ยังไม่มี (exit 0 + เหตุผล) · QC_FORCE=1 = ข้ามด่าน SKIP (แดงตามเหตุผล ไม่ crash)
//    --list = พิมพ์ทุก id ไม่แตะ DB · --no-db = รันเฉพาะข้อสถิต PN0 AP0 + NC (exit 1 ถ้าแดง)
//    ฐาน = QC4 เท่านั้น (ก่อนเขียนแถวแรกต้องเป็น host ep-frosty-lab) · ร้านชั่วคราว `qc-p115-<rand>` + ผู้ใช้ชั่วคราว 6 คน (`qc-p115-<rand>-*@qc.invalid`)
//    ลบทั้งร้าน + ผู้ใช้ใน finally (พิมพ์แถวค้าง = 0) · ร้าน QC ของ seed ไม่ถูกเขียน — Z2 นับแถว + ลายนิ้วมือก่อน/หลัง
//    🔴 ไม่มีเครือข่าย: globalThis.fetch ถูกแทนด้วยตัวกั้น (503 + นับ) ตลอดช่วง DB
//    🔴 เวลา: หมดอายุโทเคนทดสอบผ่าน issueStaffToken(…, {now}) · ล็อก 15 นาทีอ่านจาก lockedUntil — ไม่มี sleep · ไม่ฮาร์ดโค้ดวันที่
//    โมดูล/โมเดลที่ยังไม่มีเข้าถึงแบบไดนามิก (`import(… as string)` + catch · `(prisma as any).posStaffPin?.…`) — next build ตรวจชนิด scripts/*.mts
//    ไม่ import lib/env แบบ static · SESSION_SECRET ถูกอ่านผ่านโมดูลที่ทดสอบเท่านั้น
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { createHash, randomBytes, scryptSync } from "node:crypto";

const SUITE = "qc-pos-p1.15";
const ROOT = process.cwd();
const LIST = process.argv.includes("--list");
const NODB = process.argv.includes("--no-db");
const FORCE = process.env.QC_FORCE === "1";

// ═════════════════════════ ทะเบียนข้อสอบ D(id · X-group · หัวข้อ) — --list พิมพ์ชุดนี้ ═════════════════════════
// X-group: S สถิต · X1 idempotency/เล่นซ้ำ · X2 ข้ามขอบเขต/ความเป็นส่วนตัว · X3 สิทธิ์ · X4 เงิน · X5 ผลข้างเคียงครบทุกทาง · "-" เชิงหน้าที่
type Def = readonly [string, string, string];
const D = (id: string, x: string, title: string): Def => [`P1.15-${id}`, x, title] as const;
const CHECKS: readonly Def[] = [
  // ── PN PIN ──
  D("PN0", "S", "[R1 R7 CD1 CD5] สถิต: model PosStaffPin (id tenantId unitId userId pinHash failedCount Int @default(0) lockedUntil DateTime? setById createdAt updatedAt · @@unique([unitId, userId]) · @@index([tenantId, unitId])) · migration เพิ่มอย่างเดียว · scope.ts + pos-qc-env มี PosStaffPin · permissions.ts มีคีย์ pos.staff.manage · staff-pin.ts export 6 ฟังก์ชัน · ใช้ scryptSync + randomBytes(16) + createHmac sha256 · ไม่มี Math.random"),
  D("PN1", "X5", "[R1] setStaffPin ตั้ง PIN ตัวเอง → {ok:true} · 1 แถวต่อ (สาขา, คน) · pinHash = \"<salt 16 ไบต์ hex>:<hash hex>\" ตรวจด้วย scryptSync ได้ · ไม่มี PIN ดิบ · setById = ผู้ตั้ง · failedCount 0 · lockedUntil null · ตั้งซ้ำ = แทนแถวเดิม (ยัง 1 แถว · salt ใหม่ · ล้างตัวนับ/ล็อก)"),
  D("PN2", "-", "[R1] รูปแบบ PIN: 3 หลัก · 7 หลัก · มีตัวอักษร · ว่าง · ชนิด number · มีช่องว่าง · เลขไทย/เต็มความกว้าง → VALIDATION · PIN อ่อน 0000 1234 1111 123456 000000 → WEAK_PIN · แถวไม่เปลี่ยน · 4 หลักที่ไม่อ่อนผ่าน"),
  D("PN3", "X2", "[R1 R2 CD1] PIN ซ้ำในสาขาเดียวกัน → PIN_TAKEN (ข้อความไม่บอกชื่อเจ้าของ PIN) ไม่มีแถว · PIN เดียวกันอีกสาขา → ผ่าน (แถวต่อสาขา)"),
  D("PN4", "X3", "[R1 R7] ผู้จัดการตั้ง PIN ให้คนอื่นในสาขาได้ (setById = ผู้จัดการ) · แคชเชียร์ตั้งให้คนอื่น → PERMISSION_DENIED · คนที่ไม่มี pos.sale.create ตั้งเอง/ถูกตั้งให้ → ปฏิเสธ ไม่มีแถว · เจ้าของตั้งของตัวเอง (4 หลัก) ผ่าน"),
  D("PN5", "X5", "[R2] verifyStaffPin(ctx, {unitId, deviceId, pin}) → {ok:true, userId, role STAFF, staffToken, expiresAt = ตอนนี้ + 12 ชม.} · ระบุ userId ได้ · PIN ผิด → PIN_INVALID (ข้อความไม่มีชื่อใคร) · AuditLog pos.staff.pin_verified เฉพาะครั้งที่ผ่าน (นับตรง) · audit ไม่มี PIN/อีเมล/ชื่อ"),
  D("PN6", "X3", "[R2] ล็อก: ผิดติดกัน 5 ครั้ง (ระบุ userId) → failedCount 5 · lockedUntil ≈ ตอนนี้ + 15 นาที · PIN ถูก → PIN_LOCKED · PIN ถูกแบบไม่ระบุคนก็ไม่ผ่าน · ผิด 2 แล้วถูก → ตัวนับกลับ 0 · แคชเชียร์ unlockStaffPin → PERMISSION_DENIED · ผู้จัดการปลดล็อก → ตัวนับ 0 / null → PIN ถูกผ่าน"),
  D("PN7", "X2", "[R2 R8 P1.10] listStaffForDevice: สมาชิกสาขาที่มี pos.sale.create ครบชุด (ไม่รวมคนไม่มีสิทธิ์ขาย/คนสาขาอื่น) {userId name role hasPin shift?} · hasPin ตรง DB · กะของผู้เปิดกะ · ไม่มี pinHash/failedCount/email · ถอด pos.sale.create → PIN ของคนนั้น PIN_INVALID + หายจากรายการ · เครื่องถูกเพิกถอน → DEVICE_REVOKED"),
  D("PN8", "-", "[R9] คำปฏิเสธเป็นข้อมูลครบ 7 รหัส (PIN_INVALID PIN_LOCKED PIN_TAKEN WEAK_PIN STAFF_TOKEN_INVALID APPROVAL_REQUIRED PENDING_APPROVAL) {ok:false, code, message ไทย} ไม่ throw · refusalMessageKey ของทั้ง 7 ไม่ใช่ errors.unknown · ไม่ซ้ำกัน · มีข้อความใน messages th/en (pos.register.<คีย์> หรือ pos.<คีย์>)"),
  // ── TK โทเคนผู้ขาย ──
  D("TK1", "X5", "[R3] submitRegisterSale ที่ session เป็นเจ้าของ + staffToken ของแคชเชียร์ → soldByUserId = แคชเชียร์ · ไม่ส่งโทเคน → soldByUserId = ผู้ใช้ session (พฤติกรรมเดิม)"),
  D("TK2", "X5", "[R3] staffToken กับ holdRegisterCart → heldByUserId = คนในโทเคน · recallHeldCart → recalledByUserId = คนในโทเคน · openShift เครื่องที่ 2 → openedByUserId = คนในโทเคน"),
  D("TK3", "X3", "[R2 R3] โทเคนหมดอายุ (issueStaffToken now = 13 ชม.ก่อน · expiresAt ≈ 1 ชม.ก่อน) → staffFromToken null · ขาย → STAFF_TOKEN_INVALID ไม่มีบิล (ไม่ถอยไปใช้ผู้ใช้ session) · ออก 11 ชม.ก่อน → ยังใช้ได้ · โทเคนมั่ว/ถูกแก้ 1 ตัวอักษร → null"),
  D("TK4", "X2", "[R2 R3] โทเคนของเครื่อง 1 ใช้ที่เครื่อง 2 → ขาย STAFF_TOKEN_INVALID · staffFromToken(เครื่อง 2) null · สาขาอื่น null · เครื่องเดิม = คนเดิม (ตัวควบคุมบวก)"),
  D("TK5", "X3", "[R3 CD2] ถอด pos.sale.create ของคนในโทเคน → ขาย STAFF_TOKEN_INVALID · คืนสิทธิ์ → ผ่าน · ตั้ง PIN ใหม่ (pinVersion) → โทเคนเก่า null + STAFF_TOKEN_INVALID · โทเคนใหม่ใช้ได้"),
  // ── DC เพดานส่วนลด ──
  D("DC1", "X4", "[R4] แคชเชียร์ลด 15% บิล ฿200 → DISCOUNT_EXCEEDS_LIMIT ไม่มีบิล · ลด 10% ผ่าน (ยอด ฿180) · session เจ้าของ + โทเคนแคชเชียร์ ลด 15% → DISCOUNT_EXCEEDS_LIMIT (เพดานตามคนในโทเคน — CONTROLLER-DECISION)"),
  D("DC2", "X5", "[R4] แคชเชียร์ 15% + managerPin (ผู้จัดการ) → ผ่าน ยอด ฿170 · soldBy แคชเชียร์ · AuditLog pos.discount.override (targetId บิล · actorId ผู้จัดการ · after {saleId, byUserId ผู้จัดการ, forUserId แคชเชียร์, discountBp 1500}) · PIN ของแคชเชียร์อีกคน (เพดาน 10%) → DISCOUNT_EXCEEDS_LIMIT ไม่มี audit"),
  D("DC3", "X3", "[R4 R2] managerPin ผิด → PIN_INVALID · failedCount ของผู้จัดการ +1 · ไม่มีบิล · ไม่มี audit override"),
  D("DC4", "X4", "[R4] ผู้จัดการขายเองลด 15% → ผ่าน (เพดาน MANAGER 10000) · ไม่มี audit override"),
  D("DC5", "X4", "[R4] settings.pos.discount.maxBpByRole แคชเชียร์ 2000 → แคชเชียร์ 15% ผ่าน · 25% DISCOUNT_EXCEEDS_LIMIT · ล้างค่าตั้ง → 15% ถูกปฏิเสธอีก"),
  D("DC6", "X4", "[R4] ค่าตั้งเพี้ยน (pos.discount เป็นข้อความ) → ใช้ค่าปริยาย (แคชเชียร์ 10% ผ่าน · 15% ไม่ผ่าน) · maxBpByRole.MANAGER 1200 → ผู้จัดการ 15% DISCOUNT_EXCEEDS_LIMIT · 12% ผ่าน (แทนที่การอ่านค่าคงที่ด้วยการอ่านตามบทบาท)"),
  // ── AP สายอนุมัติ ──
  D("AP0", "S", "[R5 R6 CD3 CD5 CD6] สถิต: model PosApprovalPayload (requestId @id tenantId kind payload Json createdAt) · PosHeldCart.approvedRequestId String? · migration เพิ่มอย่างเดียว · scope.ts + pos-qc-env · pos-approval-consumer.ts export onPosApprovalDecided · outbox-consumers ผูกที่ approval.request.approved และ .rejected · approval/service.ts ไม่ถูกแก้ (ไม่มี POS_) · pos import approval ผ่าน facade เท่านั้น · fitness มีเส้น pos→approval · labels.ts มี POS_VOID POS_REFUND POS_DISCOUNT_OVER (CONTROLLER-DECISION)"),
  D("AP1", "X5", "[R5] มีกติกา POS_VOID (เกณฑ์ ฿100 · ขั้น MANAGER): แคชเชียร์ยกเลิกบิล ฿160 → {ok:false, code APPROVAL_REQUIRED, requestId} · ApprovalRequest (POS_VOID · entityId บิล · amount 16000 · สาขา/ระบบ · requestedBy แคชเชียร์ · PENDING) · outbox approval.request.submitted 1 · บิลยัง PAID · ไม่มี audit pos.sale.void / event pos.sale.voided"),
  D("AP2", "X1", "[R5 R7] ยกเลิกซ้ำ (คีย์ใหม่) → PENDING_APPROVAL requestId เดิม · คำขอยัง 1 ใบ · คนไม่มี pos.sale.void → NO_PERMISSION ไม่มีคำขอเพิ่ม"),
  D("AP3", "-", "[R5] บิล ฿50 (ต่ำกว่าเกณฑ์) → ยกเลิกทันที (VOIDED) · ไม่มีคำขอของบิลนั้น"),
  D("AP4", "X5", "[R6] ผู้จัดการ decide APPROVED → drainAll → บิล VOIDED · AuditLog pos.sale.void actorId ผู้ตัดสิน after.via \"approval\" + after.requestId · event approval.request.approved DONE · pos.sale.voided 1"),
  D("AP5", "X1", "[R6] เล่น consumer ซ้ำ (consumers[approval.request.approved] ×2 + onPosApprovalDecided ×2) → ไม่ throw · audit void 1 · voided 1 · สถานะเดิม"),
  D("AP6", "-", "[R6] บิล ฿170 ขอยกเลิก → ผู้จัดการ REJECTED → drainAll → บิลยัง PAID ไม่มี audit void · requestStatuses = REJECTED · เล่น rejected ซ้ำไม่เปลี่ยนอะไร"),
  D("AP7", "X5", "[R5 R6 CD3] กติกา POS_REFUND: แคชเชียร์คืน ฿120 → APPROVAL_REQUIRED · คำขอ POS_REFUND amount 12000 · PosApprovalPayload (kind POS_REFUND · payload มีบรรทัด/วิธีคืน/เหตุผล) · ยังไม่มีใบคืน · คืนซ้ำ → PENDING_APPROVAL · อนุมัติ → drain → ใบคืน 1 ใบ idempotencyKey approval-<requestId> ยอด 12000 · refundedSatang 12000 · เล่นซ้ำ ×2 ยัง 1 ใบ"),
  D("AP8", "X5", "[R4 R5] กติกา POS_DISCOUNT_OVER: แคชเชียร์ลด 15% → {APPROVAL_REQUIRED, requestId, heldCartId} · PosHeldCart HELD heldBy แคชเชียร์ · คำขอ POS_DISCOUNT_OVER entityId = heldCartId amount 3000 · ไม่มีบิล"),
  D("AP9", "X1", "[R6] อนุมัติ → drain → heldCart.approvedRequestId = requestId · recall → submit {heldCartId} ลด 20% → DISCOUNT_EXCEEDS_LIMIT · ลด 15% → ผ่าน 1 บิล + audit pos.discount.override (byUserId ผู้ตัดสิน · requestId) · เล่น approved ซ้ำ ×2 · submit อีกครั้ง (คีย์ใหม่) → DISCOUNT_EXCEEDS_LIMIT · บิลยัง 1"),
  D("AP10", "X3", "[R5 CD4] PIN ผู้จัดการชนะคำขอที่รอ: บิล ฿180 ขอยกเลิก (PENDING) → PIN ผิด PIN_INVALID (บิล PAID คำขอ PENDING) → PIN ถูก → VOIDED · คำขอ CANCELLED · audit pos.approval.pin_override {requestId, action POS_VOID, byUserId ผู้จัดการ} · audit void actorId ผู้จัดการ · decide ทีหลัง ok:false · คืนเงินด้วย PIN ขณะมีกติกา → ใบคืนทันที · ไม่มีคำขอ · pin_override {requestId null, action POS_REFUND}"),
  // ── NC ตัวควบคุมลบ ──
  D("NC", "-", "ตัวควบคุมลบ: ตัวตรวจของข้อสอบจับคำตอบที่ผิดโดยตั้งใจได้ (hash ดิบ/sha256/salt สั้น · PIN ผิด · หมดอายุ 24 ชม./1 ชม. · ล็อก 5 นาที · audit มี PIN · คำปฏิเสธที่ throw/ไม่มีข้อความ/อังกฤษ · คีย์ errors.unknown)"),
  // ── Z คืนสภาพ ──
  D("Z1", "-", "QC4 คืนสภาพ: ร้านชั่วคราวเหลือ 0 แถวทุกตารางที่มี tenantId + แถว Tenant ถูกลบ + ผู้ใช้ชั่วคราว 0"),
  D("Z2", "-", "QC4 ลายนิ้วมือ: แถวของร้าน QC POS (seed) ก่อน = หลัง (นับ + hash + ตารางใหม่ 2 ตาราง + Tenant)"),
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
  const full = id.startsWith("P1.15-") ? id : `P1.15-${id}`;
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
const codeOf = (r: Any): string => (r && r.ok === false ? String(r.code ?? "NO_CODE") : r && r.ok === true ? "OK" : r === undefined ? "undefined" : r === null ? "null" : typeof r === "string" ? "STRING" : "UNKNOWN");
const refused = (r: Any, code: string) => r?.ok === false && String(r.code) === code && !r.threw;
function errCode(e: unknown): string {
  const o = e as { code?: unknown; message?: unknown } | null;
  if (o && typeof o.code === "string" && /^[A-Z][A-Z0-9_]+$/.test(o.code)) return o.code;
  const m = /^([A-Z][A-Z0-9_]{3,})\b/.exec(String(o?.message ?? ""));
  if (m) return m[1]!;
  return "THROW";
}
const MISSING = "ยังไม่มีโมดูล/โมเดล";
async function call(mod: Any, name: string, ...args: unknown[]): Promise<Any> {
  const fn = mod?.[name];
  if (typeof fn !== "function") return { ok: false, code: `MISSING:${name}`, message: `${MISSING} — ฟังก์ชัน ${name}`, missing: true };
  try {
    return await fn(...args);
  } catch (e) {
    return { ok: false, code: errCode(e), message: String((e as Error)?.message ?? e).slice(0, 200), threw: true };
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
const THAI = /[ก-๛]/;
const isRecord = (v: unknown): v is Record<string, Any> => !!v && typeof v === "object" && !Array.isArray(v);
const HOUR = 3_600_000;
const MIN = 60_000;
const ms = (v: unknown): number => (v instanceof Date ? v.getTime() : typeof v === "string" || typeof v === "number" ? new Date(v).getTime() : NaN);

// ── ตัวตรวจของข้อสอบ (ใช้ทั้งข้อจริงและ NC) ──
/** pinHash = "<salt 16 ไบต์ hex 32 ตัว>:<hash hex>" ที่ scryptSync(pin, salt, len) ให้ hash เดิม (salt เป็น Buffer หรือสตริง hex ก็รับ · พารามิเตอร์ปริยายของ node) */
function scryptOk(pin: string, stored: unknown): boolean {
  if (typeof stored !== "string") return false;
  const m = /^([0-9a-f]{32}):([0-9a-f]{32,256})$/.exec(stored);
  if (!m || m[2]!.length % 2) return false;
  const len = m[2]!.length / 2;
  for (const salt of [Buffer.from(m[1]!, "hex"), m[1]!]) {
    try {
      if (scryptSync(pin, salt, len).toString("hex") === m[2]) return true;
    } catch {
      /* ไม่ใช่ */
    }
  }
  return false;
}
const saltOf = (stored: unknown) => (typeof stored === "string" ? stored.split(":")[0] ?? "" : "");
/** เวลาอยู่ในหน้าต่าง [lo, hi] (ms) */
const within = (t: unknown, lo: number, hi: number) => Number.isFinite(ms(t)) && ms(t) >= lo && ms(t) <= hi;
/** audit ที่ไม่ควรมีค่าดิบเหล่านี้ */
const auditLeaks = (row: Any, raws: string[]) => {
  const j = short({ before: row?.before, after: row?.after }, 100_000);
  return raws.filter((r) => r && r.length >= 4 && j.includes(r));
};
/** คำปฏิเสธที่ถูกรูป: {ok:false, code, message ไทย} ไม่ throw */
const goodRefusal = (r: Any): string => (!r || r.ok !== false ? "ไม่ใช่คำปฏิเสธ" : r.threw ? `throw (${short(r.message, 40)})` : typeof r.message !== "string" || !r.message.trim() ? "ไม่มี message" : !THAI.test(r.message) ? "message ไม่ใช่ไทย" : "");
/** ค้นคีย์ข้อความใน pos.json: pos.register.<key> ก่อน แล้ว pos.<key> */
function msgAt(json: Any, key: string): string {
  const get = (o: Any, path: string[]) => path.reduce((a: Any, k) => (isRecord(a) ? a[k] : undefined), o);
  for (const base of [["register"], []]) {
    const v = get(json, [...base, ...key.split(".")]);
    if (typeof v === "string" && v.trim()) return v;
  }
  return "";
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

const POS_DIR = "src/lib/modules/pos";
const F = {
  staff: `${POS_DIR}/staff-pin.ts`,
  appr: `${POS_DIR}/pos-approval.ts`,
  cons: `${POS_DIR}/pos-approval-consumer.ts`,
  consumers: "src/lib/outbox-consumers.ts",
  apService: "src/lib/modules/approval/service.ts",
  apLabels: "src/lib/modules/approval/labels.ts",
  perms: "src/lib/core/permissions.ts",
  scope: "src/lib/core/scope.ts",
  qcEnv: "scripts/pos-qc-env.mts",
  fitness: "scripts/fitness.mts",
  msgTh: "src/messages/th/pos.json",
  msgEn: "src/messages/en/pos.json",
};
const STAFF_FNS = ["setStaffPin", "verifyStaffPin", "unlockStaffPin", "staffFromToken", "listStaffForDevice", "issueStaffToken"] as const;
const PIN_COLS = ["id", "tenantId", "unitId", "userId", "pinHash", "failedCount", "lockedUntil", "setById", "createdAt", "updatedAt"] as const;
const PAYLOAD_COLS = ["requestId", "tenantId", "kind", "payload", "createdAt"] as const;
const NEW_CODES = ["PIN_INVALID", "PIN_LOCKED", "PIN_TAKEN", "WEAK_PIN", "STAFF_TOKEN_INVALID", "APPROVAL_REQUIRED", "PENDING_APPROVAL"];
const POS_TYPES = ["POS_VOID", "POS_REFUND", "POS_DISCOUNT_OVER"];

const srcOf = (f: string) => stripComments(rd(f));
const STATIC_IDS = ["PN0", "AP0", "NC"].map((x) => `P1.15-${x}`);
const skipReasons: string[] = [];
if (!existsSync(join(ROOT, F.staff))) skipReasons.push(`${F.staff} ยังไม่มี`);
for (const n of STAFF_FNS) if (!exportsFn(srcOf(F.staff), n)) skipReasons.push(`ยังไม่มี export ${n} (staff-pin.ts)`);
if (!exportsFn(srcOf(F.cons), "onPosApprovalDecided")) skipReasons.push(`ยังไม่มี export onPosApprovalDecided (${F.cons})`);

/** migration ที่แตะของใบนี้ต้องเป็นการเพิ่มล้วน */
function additiveMigration(touch: RegExp, must: [RegExp, string][]): string[] {
  const p: string[] = [];
  const files = walk("prisma/migrations", [], /\.sql$/).filter((f) => touch.test(rd(f)));
  if (!files.length) {
    p.push(`ไม่มี migration ที่แตะ ${touch.source.slice(0, 60)}`);
    return p;
  }
  const all = files.map((f) => rd(f).replace(/--.*$/gm, "")).join("\n");
  for (const [re, label] of must) if (!re.test(all)) p.push(`ไม่มี ${label}`);
  for (const f of files) {
    const stmts = rd(f).replace(/--.*$/gm, "").split(";").map((s) => s.trim()).filter(Boolean);
    const bad = stmts.filter((s) => !/^CREATE\s+(TYPE|TABLE|UNIQUE\s+INDEX|INDEX)\b/i.test(s) && !/^ALTER\s+TABLE\s+"[A-Za-z]+"\s+ADD\s+(COLUMN|CONSTRAINT)\b/i.test(s));
    if (bad.length) p.push(`${f.split("/").slice(-2, -1)[0]}: คำสั่งที่ไม่ใช่การเพิ่ม (${short(bad[0], 60)})`);
  }
  return p;
}

// ═════════════════════════ 1. ข้อสถิต (ไม่แตะ DB) ═════════════════════════
async function runStatic(): Promise<void> {
  console.log("\n── ข้อสถิต (ไม่แตะ DB) ──");
  const schemaSrc = walk("prisma/schema", [], /\.prisma$/).map((f) => stripPrismaComments(rd(f))).join("\n");
  // PN0
  {
    const p: string[] = [];
    const b = prismaBlock(schemaSrc, "model", "PosStaffPin");
    if (!b) p.push("ไม่มี model PosStaffPin");
    else {
      const miss = PIN_COLS.filter((c) => !fieldLine(b, c));
      if (miss.length) p.push(`PosStaffPin ขาด ${miss.join(",")}`);
      if (fieldLine(b, "failedCount") && !/^failedCount\s+Int\s+@default\(0\)/.test(fieldLine(b, "failedCount"))) p.push(`failedCount ไม่ใช่ Int @default(0) (${fieldLine(b, "failedCount")})`);
      if (fieldLine(b, "lockedUntil") && !/^lockedUntil\s+DateTime\?/.test(fieldLine(b, "lockedUntil"))) p.push("lockedUntil ไม่ใช่ DateTime?");
      if (!/@@unique\(\[\s*unitId\s*,\s*userId\s*\]\)/.test(b)) p.push("ไม่มี @@unique([unitId, userId])");
      if (!/@@index\(\[\s*tenantId\s*,\s*unitId\s*\]\)/.test(b)) p.push("ไม่มี @@index([tenantId, unitId])");
    }
    p.push(...additiveMigration(/"PosStaffPin"/, [[/CREATE\s+TABLE\s+"PosStaffPin"/i, 'CREATE TABLE "PosStaffPin"'], [/CREATE\s+UNIQUE\s+INDEX[^;]*ON\s+"PosStaffPin"\s*\(\s*"unitId"\s*,\s*"userId"\s*\)/i, "unique index PosStaffPin(unitId, userId)"]]));
    if (!/\bPosStaffPin\s*:/.test(srcOf(F.scope))) p.push("scope.ts ไม่มี PosStaffPin");
    const env = srcOf(F.qcEnv);
    const pm = env.slice(env.indexOf("export const POS_MODELS"), env.indexOf("export type PosModelKey"));
    if (!/\bposStaffPin\s*:/.test(pm)) p.push("pos-qc-env POS_MODELS ไม่มี posStaffPin");
    if (!/["']pos\.staff\.manage["']/.test(srcOf(F.perms))) p.push("permissions.ts ไม่มีคีย์ pos.staff.manage");
    const s = srcOf(F.staff);
    if (!s) p.push(`ไม่มี ${F.staff}`);
    else {
      for (const n of STAFF_FNS) if (!exportsFn(s, n)) p.push(`staff-pin.ts ไม่มี export ${n}`);
      if (!/\bscryptSync\s*\(/.test(s)) p.push("ไม่ใช้ scryptSync");
      if (!/\brandomBytes\s*\(\s*16\s*\)/.test(s)) p.push("salt ไม่ใช่ randomBytes(16)");
      if (!/\bcreateHmac\s*\(\s*["']sha256["']/.test(s)) p.push("โทเคนไม่ใช่ createHmac(\"sha256\")");
      if (!/SESSION_SECRET/.test(s)) p.push("ไม่อ่าน SESSION_SECRET");
      if (/\bMath\.random\s*\(/.test(s)) p.push("ใช้ Math.random");
      if (/^\s*["']use server["']/.test(rd(F.staff).replace(/^\s*(\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*/, ""))) p.push("staff-pin.ts เป็น \"use server\" (ต้องเป็นไฟล์บริการ — action แยกไฟล์)");
    }
    chk("PN0", p.length === 0, "schema + migration + ลงทะเบียน + pos.staff.manage + scrypt/HMAC", p.slice(0, 8).join(" · ") + (p.length > 8 ? ` …(+${p.length - 8})` : "") || "ครบ");
  }
  // AP0
  {
    const p: string[] = [];
    const b = prismaBlock(schemaSrc, "model", "PosApprovalPayload");
    if (!b) p.push("ไม่มี model PosApprovalPayload");
    else {
      const miss = PAYLOAD_COLS.filter((c) => !fieldLine(b, c));
      if (miss.length) p.push(`PosApprovalPayload ขาด ${miss.join(",")}`);
      if (fieldLine(b, "requestId") && !/@id\b/.test(fieldLine(b, "requestId"))) p.push("requestId ไม่ใช่ @id");
      if (fieldLine(b, "payload") && !/^payload\s+Json\b/.test(fieldLine(b, "payload"))) p.push("payload ไม่ใช่ Json");
    }
    const hc = fieldLine(prismaBlock(schemaSrc, "model", "PosHeldCart"), "approvedRequestId");
    if (!/^approvedRequestId\s+String\?/.test(hc)) p.push(`PosHeldCart.approvedRequestId ไม่ใช่ String? (${hc || "ไม่มี"})`);
    p.push(...additiveMigration(/"PosApprovalPayload"|"approvedRequestId"/, [[/CREATE\s+TABLE\s+"PosApprovalPayload"/i, 'CREATE TABLE "PosApprovalPayload"'], [/ALTER\s+TABLE\s+"PosHeldCart"\s+ADD\s+COLUMN\s+"approvedRequestId"/i, 'ADD COLUMN "approvedRequestId"']]));
    if (!/\bPosApprovalPayload\s*:/.test(srcOf(F.scope))) p.push("scope.ts ไม่มี PosApprovalPayload");
    const env = srcOf(F.qcEnv);
    const pm = env.slice(env.indexOf("export const POS_MODELS"), env.indexOf("export type PosModelKey"));
    if (!/\bposApprovalPayload\s*:/.test(pm)) p.push("pos-qc-env POS_MODELS ไม่มี posApprovalPayload");
    if (!exportsFn(srcOf(F.cons), "onPosApprovalDecided")) p.push("pos-approval-consumer.ts ไม่มี export onPosApprovalDecided");
    const cons = srcOf(F.consumers);
    if (!/pos-approval-consumer/.test(cons)) p.push("outbox-consumers ไม่ import pos-approval-consumer");
    for (const ev of ["approval.request.approved", "approval.request.rejected"]) {
      const m = new RegExp(`["']${ev.replace(/\./g, "\\.")}["']\\s*:\\s*([^\\n]*)`).exec(cons);
      if (!m) p.push(`outbox-consumers ไม่มี "${ev}"`);
      else if (!/\bpos\w*|\w*Pos\w*/.test(m[1]!)) p.push(`"${ev}" ไม่ได้ผูกตัวรับของ POS`);
    }
    if (/POS_(VOID|REFUND|DISCOUNT_OVER)/.test(srcOf(F.apService))) p.push("approval/service.ts ถูกแก้ (CD6)");
    for (const f of walk(POS_DIR)) {
      const s = srcOf(f);
      if (/["']@\/lib\/modules\/approval\/[^"']+["']/.test(s)) p.push(`${f.split("/").pop()} import approval ข้าม facade`);
    }
    if (!/["']pos→approval["']/.test(rd(F.fitness))) p.push("fitness ALLOWED_EDGES ไม่มี \"pos→approval\" (CONTROLLER-DECISION)");
    const lab = srcOf(F.apLabels);
    for (const t of POS_TYPES) if (!new RegExp(`value:\\s*["']${t}["']\\s*,\\s*label:\\s*["'][^"']*[ก-๛]`).test(lab)) p.push(`labels.ts ไม่มี ${t} (ป้ายไทย) (CONTROLLER-DECISION)`);
    chk("AP0", p.length === 0, "schema + migration + ลงทะเบียน + consumer ในสายอนุมัติ + facade + ป้าย", p.slice(0, 8).join(" · ") + (p.length > 8 ? ` …(+${p.length - 8})` : "") || "ครบ");
  }
  // NC ตัวควบคุมลบ (บริสุทธิ์)
  {
    const p: string[] = [];
    const salt = randomBytes(16);
    const good = `${salt.toString("hex")}:${scryptSync("258014", salt, 64).toString("hex")}`;
    const goodStrSalt = `${salt.toString("hex")}:${scryptSync("258014", salt.toString("hex"), 32).toString("hex")}`;
    if (!scryptOk("258014", good) || !scryptOk("258014", goodStrSalt)) p.push("ตัวตรวจ scrypt ปฏิเสธ hash ที่ถูก");
    if (scryptOk("258015", good)) p.push("ตัวตรวจ scrypt รับ PIN ผิด");
    for (const bad of ["258014", createHash("sha256").update("258014").digest("hex"), `abcd:${scryptSync("258014", "abcd", 64).toString("hex")}`, `${salt.toString("hex")}:${createHash("sha256").update("258014").digest("hex")}`, null])
      if (scryptOk("258014", bad)) p.push(`ตัวตรวจ scrypt รับ ${short(bad, 30)}`);
    const now = Date.now();
    const okExp = (t: number) => within(new Date(t), now + 12 * HOUR - 10 * MIN, now + 12 * HOUR + 10 * MIN);
    if (!okExp(now + 12 * HOUR) || okExp(now + 24 * HOUR) || okExp(now + HOUR)) p.push("ตัวตรวจ expiresAt ไม่แยก 12 ชม.");
    const okLock = (t: unknown) => within(t, now + 14 * MIN, now + 16 * MIN);
    if (!okLock(new Date(now + 15 * MIN)) || okLock(new Date(now + 5 * MIN)) || okLock(null)) p.push("ตัวตรวจ lockedUntil ไม่แยก 15 นาที");
    if (!auditLeaks({ after: { userId: "u1", pin: "258014" } }, ["258014"]).length || auditLeaks({ after: { userId: "u1" } }, ["258014"]).length) p.push("ตัวตรวจ audit รั่วไม่ทำงาน");
    if (goodRefusal({ ok: false, code: "PIN_INVALID", message: "PIN ไม่ถูกต้อง" })) p.push("goodRefusal ปฏิเสธคำปฏิเสธที่ถูก");
    for (const bad of [{ ok: false, code: "X", message: "wrong pin" }, { ok: false, code: "X" }, { ok: false, code: "X", message: "ผิด", threw: true }, { ok: true }])
      if (!goodRefusal(bad)) p.push(`goodRefusal รับ ${short(bad, 40)}`);
    const msgs = { register: { errors: { pinInvalid: "PIN ไม่ถูกต้อง" } }, staff: { errors: { pinLocked: "ล็อก" } } };
    if (!msgAt(msgs, "errors.pinInvalid") || !msgAt(msgs, "staff.errors.pinLocked") || msgAt(msgs, "errors.unknown")) p.push("ตัวค้นคีย์ข้อความผิด");
    chk("NC", p.length === 0, "ตัวตรวจทุกตัวจับของผิดได้", p.join(" · ") || "ครบ (scrypt 5 แบบผิด · หมดอายุ · ล็อก · audit · คำปฏิเสธ 4 แบบ · คีย์ข้อความ)");
  }
}

// ═════════════════════════ 1b. --no-db ═════════════════════════
if (NODB) {
  console.log(`[${SUITE}] --no-db: รัน ${STATIC_IDS.length} ข้อ (สถิต + NC)`);
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
const PSP: Any = typeof P.posStaffPin?.findMany === "function" ? P.posStaffPin : null;
const PAP: Any = typeof P.posApprovalPayload?.findMany === "function" ? P.posApprovalPayload : null;
if (!PSP) skipReasons.push("Prisma client ยังไม่มี delegate posStaffPin (R1)");
if (!PAP) skipReasons.push("Prisma client ยังไม่มี delegate posApprovalPayload (R6 CD3)");
const dbCols = new Set<string>();
try {
  const rows = (await P.$queryRawUnsafe(`SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name IN ('PosStaffPin','PosApprovalPayload','PosHeldCart')`)) as Any[];
  for (const r of rows) dbCols.add(`${r.table_name}.${r.column_name}`);
} catch (e) {
  console.log(`  (อ่าน information_schema ไม่ได้: ${(e as Error).message.slice(0, 100)})`);
}
for (const [t, cols] of [["PosStaffPin", PIN_COLS], ["PosApprovalPayload", PAYLOAD_COLS]] as const) {
  const miss = cols.filter((c) => !dbCols.has(`${t}.${c}`));
  if (miss.length === cols.length) skipReasons.push(`ฐาน QC4 ยังไม่มีตาราง ${t}`);
  else if (miss.length) skipReasons.push(`ตาราง ${t} ขาดคอลัมน์ ${miss.join(",")}`);
}
if (!dbCols.has("PosHeldCart.approvedRequestId")) skipReasons.push("ฐาน QC4 ยังไม่มีคอลัมน์ PosHeldCart.approvedRequestId (R6)");

const COUNT_MODELS = ["posSale", "posShift", "posDevice", "posHeldCart", "outboxEvent", "auditLog", "membership", "approvalPolicy", "approvalRequest", "appSystem"] as const;
const FP_MODELS = ["posSale", "posShift", "posDevice", "posHeldCart", "appSystem", "membership", "approvalRequest", "approvalPolicy"] as const;
async function snapshotCounts(): Promise<Record<string, number | string>> {
  const out: Record<string, number | string> = {};
  for (const tid of TIDS)
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
  for (const t of ["PosStaffPin", "PosApprovalPayload"]) {
    try {
      out[`qc.${t}`] = Number(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "${t}" WHERE "tenantId" = ANY($1::text[])`, TIDS)) as Any[])[0]?.n ?? 0);
    } catch {
      out[`qc.${t}`] = "absent";
    }
  }
  return out;
}
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
  try {
    const t = (await P.$queryRawUnsafe(`SELECT id, name, slug, limits, "updatedAt" FROM "Tenant" WHERE id = ANY($1::text[]) ORDER BY id`, TIDS)) as Any[];
    out.tenant = `${t.length}:${createHash("sha256").update(JSON.stringify(t)).digest("hex").slice(0, 16)}`;
  } catch (e) {
    out.tenant = `err:${(e as Error).message.slice(0, 40)}`;
  }
  return out;
}
const countsBefore = await snapshotCounts();

if (skipReasons.length > 0 && !FORCE) {
  console.log(`⏭️  SKIPPED — ${SUITE}: ของใบ P1.15 ยังไม่มี (ถูกต้องสำหรับข้อสอบที่เขียนก่อนสร้าง) · DB ${HOST}`);
  for (const r of skipReasons) console.log(`   • ${r}`);
  console.log(`   ข้อสอบ ${CHECKS.length} ข้อ (ดู --list) · QC_FORCE=1 = รันทั้งที่ยังไม่มีของ (ต้องแดงตามเหตุผล)`);
  console.log(`JSON_SUMMARY ${JSON.stringify({ suite: SUITE, total: 0, passed: 0, failed: [], skipped: true, reason: skipReasons, registered: CHECKS.length })}`);
  await P.$disconnect?.().catch?.(() => {});
  process.exit(0);
}
if (FORCE && skipReasons.length) console.log(`⚠️  QC_FORCE=1 — ข้ามด่าน SKIP ทั้งที่ยังขาด ${skipReasons.length} อย่าง (คาด: แดงตามเหตุผล ไม่ crash)`);
const fpBefore = await fingerprint();

// ═════════════════════════ 4. โหลดโมดูล ═════════════════════════
const ex = (f: string) => existsSync(join(ROOT, f));
const staffMod = ex(F.staff) ? await tryImport("@/lib/modules/pos/staff-pin") : null;
const consPos = ex(F.cons) ? await tryImport("@/lib/modules/pos/pos-approval-consumer") : null;
const register = await tryImport("@/lib/modules/pos/register");
const regShared = await tryImport("@/lib/modules/pos/register-shared");
const heldMod = await tryImport("@/lib/modules/pos/held-cart");
const shiftMod = await tryImport("@/lib/modules/pos/shift");
const devMod = await tryImport("@/lib/modules/pos/device");
const billsMod = await tryImport("@/lib/modules/pos/bills");
const refundMod = await tryImport("@/lib/modules/pos/refund");
const sysSvc = await tryImport("@/lib/modules/system/service");
const apSvc = await tryImport("@/lib/modules/approval/service");
const consMod = await tryImport("@/lib/outbox-consumers");

const RAND = Math.random().toString(36).slice(2, 8);
const TAG = `qc-p1.15-${RAND}`;
const T_SLUG = `qc-p115-${RAND}`;
const EMAIL_PREFIX = `${T_SLUG}-`;
const sleep = (n: number) => new Promise((r) => setTimeout(r, n));
let T = "";

// ── ตัวกั้นเครือข่าย ──
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
    return new Response("blocked by qc-pos-p1.15", { status: 503 });
  }) as typeof fetch;
}
function removeFetchGuard() {
  globalThis.fetch = realFetch;
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
const DB_IDS = CHECKS.map(([id]) => id).filter((id) => !STATIC_IDS.includes(id) && id !== "P1.15-Z1" && id !== "P1.15-Z2");
const dataRefusals: [string, Any][] = [];
const keep = (label: string, r: Any) => {
  if (r?.ok === false && !r.missing) dataRefusals.push([label, r]);
  return r;
};

async function runDb() {
  assertQc4BeforeWrite();
  installFetchGuard();
  console.log(`\n── ร้านชั่วคราว ${T_SLUG} · DB ${HOST} ──`);
  console.log("   สาขา A (POS-A · เครื่อง 1/2/3 · กะเครื่อง 1) · สาขา B (POS-B) · ผู้ใช้ OWNER MGR C1 C2 CB S0 (Membership จริง) · ไม่ผูกสมุด (VAT ไม่มี)");
  let fx = "";
  const U: Record<string, string> = {};
  const S: Record<string, string> = {};
  const US: Record<string, { id: string; name: string; email: string; role: string; unitAccess: string[]; perms: Record<string, boolean>; mid: string }> = {};
  try {
    const t = await P.tenant.create({ data: { name: `QC P1.15 PIN/อนุมัติ ${RAND}`, slug: T_SLUG, limits: { posDevices: 10 } } });
    T = t.id;
    for (const k of ["A", "B"]) U[k] = (await P.businessUnit.create({ data: { tenantId: T, type: "SHOP", name: `${TAG} สาขา${k}`, slug: `${T_SLUG}-${k.toLowerCase()}` } })).id;
    S.A = (await sysSvc.createSystem(T, "POS", "POS-A")).id;
    S.B = (await sysSvc.createSystem(T, "POS", "POS-B")).id;
    await sysSvc.linkUnit(T, S.A, U.A);
    await sysSvc.linkUnit(T, S.B, U.B);
  } catch (e) {
    fx = `ร้านชั่วคราว:${(e as Error).message.slice(0, 160)}`;
  }
  // ผู้ใช้ + Membership จริง
  const C1P = { "pos.sale.create": true, "pos.sale.read": true, "pos.sale.void": true, "pos.sale.refund": true, "pos.shift.operate": true, "pos.sale.priceOverride": true };
  const C2P = { "pos.sale.create": true, "pos.sale.read": true, "pos.shift.operate": true, "pos.sale.priceOverride": true };
  if (!fx) {
    try {
      const spec: [string, string, string[], Record<string, boolean>][] = [
        ["OWNER", "OWNER", ["*"], {}],
        ["MGR", "MANAGER", [U.A!, U.B!], {}],
        ["C1", "STAFF", [U.A!], C1P],
        ["C2", "STAFF", [U.A!, U.B!], C2P],
        ["CB", "STAFF", [U.B!], { "pos.sale.create": true }],
        ["S0", "STAFF", [U.A!], { "pos.shift.operate": true, "pos.sale.read": true }],
      ];
      for (const [k, role, unitAccess, perms] of spec) {
        const email = `${EMAIL_PREFIX}${k.toLowerCase()}@qc.invalid`;
        const name = `${k} พนักงานคิวซี${RAND}`;
        const u = await P.user.create({ data: { email, name } });
        const m = await P.membership.create({ data: { userId: u.id, tenantId: T, role, unitAccess, permissions: perms, acceptedAt: new Date() } });
        US[k] = { id: u.id, name, email, role, unitAccess, perms, mid: m.id };
      }
    } catch (e) {
      fx = `ผู้ใช้:${(e as Error).message.slice(0, 140)}`;
    }
  }
  const A = (k: string): Any => (US[k] ? { userId: US[k]!.id, role: US[k]!.role, unitAccess: [...US[k]!.unitAccess], permissions: { ...US[k]!.perms } } : { userId: `none-${k}`, role: "STAFF", unitAccess: [], permissions: {} });
  const MC = (k: string): Any => ({ ...A(k) }); // MembershipCtx & {userId} สำหรับ approval.decide
  const uid = (k: string) => US[k]?.id ?? `none-${k}`;
  const DEV1 = `qc115${RAND}d1`, DEV2 = `qc115${RAND}d2`, DEV3 = `qc115${RAND}d3`;
  const ctxA = (dev?: string): Any => ({ tenantId: T, systemId: S.A, unitId: U.A, ...(dev ? { deviceId: dev } : {}) });
  const ctxB = (dev?: string): Any => ({ tenantId: T, systemId: S.B, unitId: U.B, ...(dev ? { deviceId: dev } : {}) });
  let shift1 = "";
  if (!fx) {
    for (const d of [DEV1, DEV2, DEV3]) {
      const rg = await call(devMod, "registerDevice", ctxA(), A("OWNER"), { name: `เครื่อง QC ${d.slice(-2)}`, deviceCode: d });
      if (rg?.ok !== true) console.log(`  ⚠️  registerDevice ${d}: ${codeOf(rg)} ${short(rg?.message ?? "", 80)}`);
    }
    const o1 = await call(shiftMod, "openShift", ctxA(DEV1), A("OWNER"), { deviceId: DEV1, deviceLabel: "เครื่อง QC 1", floatSatang: 0 });
    if (o1?.ok !== true) fx = `เปิดกะเครื่อง 1: ${codeOf(o1)} ${short(o1?.message ?? "", 80)}`;
    else shift1 = String(o1.shift?.id ?? "");
  }
  const FX = (s: string) => (fx ? `fixture:${fx} · ` : "") + s;
  const NEED = (...xs: [unknown, string][]) => xs.filter(([v]) => !v).map(([, l]) => `${MISSING} ${l} · `).join("");
  const NS = NEED([staffMod && STAFF_FNS.every((n) => typeof staffMod[n] === "function"), "staff-pin.ts"]);
  const NT = NEED([PSP || dbCols.has("PosStaffPin.id"), "PosStaffPin"]);

  // ── ตัวอ่าน ──
  const pinRow = async (k: string, unit = "A"): Promise<Any> => {
    if (!T) return null;
    try {
      if (PSP) return await PSP.findFirst({ where: { tenantId: T, unitId: U[unit], userId: uid(k) } });
      const r = (await P.$queryRawUnsafe(`SELECT * FROM "PosStaffPin" WHERE "tenantId" = $1 AND "unitId" = $2 AND "userId" = $3`, T, U[unit], uid(k))) as Any[];
      return r[0] ?? null;
    } catch {
      return null;
    }
  };
  const pinRowsOf = async (k: string, unit = "A"): Promise<number> => {
    try {
      return Number(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "PosStaffPin" WHERE "tenantId" = $1 AND "unitId" = $2 AND "userId" = $3`, T, U[unit], uid(k))) as Any[])[0]?.n ?? 0);
    } catch {
      return -1;
    }
  };
  const audits = async (action: string, targetId?: string): Promise<Any[]> => (T ? ((await P.auditLog.findMany({ where: { tenantId: T, action, ...(targetId ? { targetId } : {}) }, orderBy: { createdAt: "asc" } }).catch(() => [])) as Any[]) : []);
  const saleRow = async (id: string): Promise<Any> => (id ? P.posSale.findUnique({ where: { id } }).catch(() => null) : null);
  const saleByKey = async (key: string): Promise<Any> => (T ? P.posSale.findFirst({ where: { tenantId: T, idempotencyKey: key } }).catch(() => null) : null);
  const requestsFor = async (type: string, entityPrefix: string): Promise<Any[]> =>
    T && entityPrefix ? ((await P.approvalRequest.findMany({ where: { tenantId: T, entityType: type, entityId: { startsWith: entityPrefix } }, orderBy: { createdAt: "asc" } }).catch(() => [])) as Any[]) : [];
  const reqRow = async (id: unknown): Promise<Any> => (typeof id === "string" && id ? P.approvalRequest.findUnique({ where: { id } }).catch(() => null) : null);
  const outboxCount = async (type: string, contains: string): Promise<number> =>
    T ? Number(await P.outboxEvent.count({ where: { tenantId: T, type, idempotencyKey: { contains } } }).catch(() => NaN)) : NaN;
  const setPosSettings = async (discount: unknown) => {
    const sys = await P.appSystem.findUnique({ where: { id: S.A }, select: { settings: true } });
    const cur = isRecord(sys?.settings) ? sys.settings : {};
    const pos = isRecord(cur.pos) ? { ...cur.pos } : {};
    if (discount === undefined) delete pos.discount;
    else pos.discount = discount;
    await P.appSystem.update({ where: { id: S.A }, data: { settings: { ...cur, pos } } });
  };
  const setPerms = async (k: string, perms: Record<string, boolean>) => {
    if (US[k]) await P.membership.update({ where: { id: US[k]!.mid }, data: { permissions: perms } });
  };

  // ── ตัวช่วยงานขาย ──
  let keyN = 0;
  const newKey = (p = "k") => `qc115-${RAND}-${p}-${++keyN}`;
  type CartIn = { amount: number; pct?: number; name?: string; lines?: [string, number][] };
  const cartOf = (c: CartIn): Any => ({
    lines: (c.lines ?? [[c.name ?? "สินค้า QC", c.amount]]).map(([name, unitPriceSatang]) => ({ name, qty: 1, unitPriceSatang })),
    ...(c.pct ? { billDiscount: { type: "PERCENT", value: c.pct } } : {}),
  });
  const grandOf = (c: CartIn) => {
    const sub = (c.lines ?? [[c.name ?? "", c.amount]]).reduce((a, [, v]) => a + v, 0);
    return sub - (c.pct ? Math.round((sub * c.pct) / 10_000) : 0);
  };
  const sell = async (ctx: Any, actor: Any, c: CartIn, extra: Record<string, unknown> = {}, key = newKey("s")): Promise<{ r: Any; key: string; grand: number }> => {
    const grand = grandOf(c);
    const input = { ...cartOf(c), idempotencyKey: key, expectedGrandTotalSatang: grand, payMethods: [{ type: "CASH", amountSatang: grand }], cashReceivedSatang: grand, ...extra };
    const r = await call(register, "submitRegisterSale", ctx, actor, input);
    return { r, key, grand };
  };
  /** บิลพื้นฐาน (แคชเชียร์ C1 · เครื่อง 1) — คืน id */
  const baseSale = async (label: string, c: CartIn): Promise<string> => {
    if (fx) return "";
    const { r } = await sell(ctxA(DEV1), A("C1"), c);
    if (r?.ok !== true) {
      console.log(`  ⚠️  บิล ${label}: ${codeOf(r)} ${short(r?.message ?? "", 80)}`);
      return "";
    }
    return String(r.saleId);
  };

  // PIN ปัจจุบันของแต่ละคน
  const PIN: Record<string, string> = { C1: "258014", C2: "482613", MGR: "713952", OWNER: "8402", CB: "258014" };
  let verOk = 0; // นับ verify ที่ผ่าน (audit ต้องเท่านี้)
  const verify = async (input: Record<string, unknown>, label: string, dev = DEV1): Promise<Any> => {
    const r = keep(label, await call(staffMod, "verifyStaffPin", ctxA(dev), { unitId: U.A, deviceId: dev, ...input }));
    if (r?.ok === true) verOk++;
    return r;
  };
  const setPin = async (ctx: Any, actorKey: string, userKey: string, pin: unknown, label: string) =>
    keep(label, await call(staffMod, "setStaffPin", ctx, A(actorKey), { userId: uid(userKey), pin }));

  // ════════ PN1 ตั้ง PIN ตัวเอง ════════
  {
    const p: string[] = [];
    const r1 = await setPin(ctxA(), "C1", "C1", "111999", "PN1 ตั้งครั้งแรก");
    if (r1?.ok !== true) p.push(`ตั้งครั้งแรก → ${codeOf(r1)}`);
    const row1 = await pinRow("C1");
    const r2 = await setPin(ctxA(), "C1", "C1", PIN.C1, "PN1 ตั้งซ้ำ");
    if (r2?.ok !== true) p.push(`ตั้งซ้ำ → ${codeOf(r2)}`);
    const row2 = await pinRow("C1");
    const n = await pinRowsOf("C1");
    if (!row2) p.push("ไม่มีแถว PosStaffPin");
    else {
      if (n !== 1) p.push(`แถว ${n} (คาด 1)`);
      if (!scryptOk(PIN.C1!, row2.pinHash)) p.push(`pinHash ตรวจด้วย scrypt ไม่ผ่าน (${short(row2.pinHash, 30)})`);
      if (String(row2.pinHash).includes(PIN.C1!)) p.push("pinHash มี PIN ดิบ");
      if (row2.setById !== uid("C1")) p.push(`setById ${row2.setById}`);
      if (row2.failedCount !== 0 || row2.lockedUntil !== null) p.push(`failedCount ${row2.failedCount} lockedUntil ${row2.lockedUntil}`);
      if (row2.tenantId !== T || row2.unitId !== U.A) p.push("tenantId/unitId ไม่ตรง");
      if (row1 && saltOf(row1.pinHash) === saltOf(row2.pinHash)) p.push("ตั้งซ้ำแล้ว salt เดิม");
      if (row1 && scryptOk("111999", row2.pinHash)) p.push("PIN เก่ายังใช้ได้");
    }
    // ตั้งซ้ำล้างตัวนับ/ล็อก
    if (row2 && T) {
      await P.$executeRawUnsafe(`UPDATE "PosStaffPin" SET "failedCount" = 3, "lockedUntil" = now() + interval '10 minutes' WHERE id = $1`, row2.id).catch(() => p.push("ตั้งตัวนับทดสอบไม่ได้"));
      const r3 = await setPin(ctxA(), "C1", "C1", PIN.C1, "PN1 ตั้งซ้ำหลังล็อก");
      const row3 = await pinRow("C1");
      if (r3?.ok !== true || row3?.failedCount !== 0 || row3?.lockedUntil !== null) p.push(`ตั้งซ้ำไม่ล้างตัวนับ/ล็อก (${codeOf(r3)} ${row3?.failedCount}/${row3?.lockedUntil})`);
    }
    chk("PN1", NS === "" && NT === "" && p.length === 0, "1 แถว · scrypt salt:hash · setById · ตั้งซ้ำแทน+ล้าง", FX(NS + NT + (p.join(" · ") || "ครบ")));
  }
  // ════════ PN2 รูปแบบ + PIN อ่อน ════════
  {
    const p: string[] = [];
    const before = (await pinRow("C1"))?.pinHash;
    for (const bad of ["123", "1234567", "12a4", "", 1234, " 2580", "2580 ", "๒๕๘๐", "２５８０", null]) {
      const r = await setPin(ctxA(), "C1", "C1", bad, `PN2 รูปแบบ ${short(bad, 10)}`);
      if (!refused(r, "VALIDATION")) p.push(`${short(bad, 10)} → ${codeOf(r)}`);
    }
    for (const weak of ["0000", "1234", "1111", "123456", "000000"]) {
      const r = await setPin(ctxA(), "C1", "C1", weak, `PN2 อ่อน ${weak}`);
      if (!refused(r, "WEAK_PIN")) p.push(`${weak} → ${codeOf(r)}`);
    }
    const after = (await pinRow("C1"))?.pinHash;
    if (!before || before !== after) p.push("แถวเปลี่ยนหลังคำขอที่ถูกปฏิเสธ");
    const ok4 = await setPin(ctxA(), "OWNER", "OWNER", PIN.OWNER, "PN2 เจ้าของ 4 หลัก");
    if (ok4?.ok !== true) p.push(`4 หลัก (${PIN.OWNER}) → ${codeOf(ok4)}`);
    chk("PN2", NS === "" && NT === "" && p.length === 0, "VALIDATION ×10 · WEAK_PIN ×5 · แถวเดิม · 4 หลักผ่าน", FX(NS + NT + (p.slice(0, 8).join(" · ") || "ครบ")));
  }
  // ════════ PN3 ซ้ำ + ต่อสาขา ════════
  {
    const p: string[] = [];
    const r = await setPin(ctxA(), "MGR", "C2", PIN.C1, "PN3 PIN ซ้ำ");
    if (!refused(r, "PIN_TAKEN")) p.push(`ซ้ำในสาขา A → ${codeOf(r)}`);
    if (typeof r?.message === "string" && US.C1 && (r.message.includes(US.C1.name) || r.message.includes(US.C1.email))) p.push("ข้อความบอกชื่อเจ้าของ PIN");
    if ((await pinRowsOf("C2")) > 0) p.push("มีแถวของ C2 หลังถูกปฏิเสธ");
    const rb = await setPin(ctxB(), "CB", "CB", PIN.CB, "PN3 สาขา B");
    if (rb?.ok !== true) p.push(`PIN เดียวกันที่สาขา B → ${codeOf(rb)}`);
    else if (!scryptOk(PIN.CB!, (await pinRow("CB", "B"))?.pinHash)) p.push("แถวสาขา B ตรวจไม่ผ่าน");
    chk("PN3", NS === "" && NT === "" && p.length === 0, "PIN_TAKEN ไม่บอกชื่อ · อีกสาขาผ่าน", FX(NS + NT + (p.join(" · ") || "ครบ")));
  }
  // ════════ PN4 สิทธิ์ตั้ง PIN ════════
  {
    const p: string[] = [];
    const x = await setPin(ctxA(), "C1", "C2", PIN.C2, "PN4 แคชเชียร์ตั้งให้คนอื่น");
    if (!refused(x, "PERMISSION_DENIED")) p.push(`แคชเชียร์ตั้งให้ C2 → ${codeOf(x)}`);
    if ((await pinRowsOf("C2")) > 0) p.push("มีแถว C2 หลังแคชเชียร์ตั้งให้");
    const m = await setPin(ctxA(), "MGR", "C2", PIN.C2, "PN4 ผู้จัดการตั้งให้ C2");
    const row = await pinRow("C2");
    if (m?.ok !== true) p.push(`ผู้จัดการตั้งให้ C2 → ${codeOf(m)}`);
    else if (row?.setById !== uid("MGR") || !scryptOk(PIN.C2!, row?.pinHash)) p.push(`แถว C2 setById ${row?.setById}`);
    const s0self = await setPin(ctxA(), "S0", "S0", "975310", "PN4 S0 ตั้งเอง");
    const s0mgr = await setPin(ctxA(), "MGR", "S0", "975310", "PN4 ผู้จัดการตั้งให้ S0");
    if (s0self?.ok !== false || s0self?.threw) p.push(`S0 ตั้งเอง → ${codeOf(s0self)}`);
    if (s0mgr?.ok !== false || s0mgr?.threw) p.push(`ผู้จัดการตั้งให้ S0 (ไม่มี pos.sale.create) → ${codeOf(s0mgr)}`);
    if ((await pinRowsOf("S0")) > 0) p.push("มีแถวของ S0");
    const mg = await setPin(ctxA(), "MGR", "MGR", PIN.MGR, "PN4 ผู้จัดการตั้งเอง");
    if (mg?.ok !== true) p.push(`ผู้จัดการตั้งเอง → ${codeOf(mg)}`);
    chk("PN4", NS === "" && NT === "" && p.length === 0, "ผู้จัดการตั้งให้ได้ · แคชเชียร์ PERMISSION_DENIED · ไม่มีสิทธิ์ขาย = ปฏิเสธ", FX(NS + NT + (p.join(" · ") || "ครบ")));
  }
  // ════════ PN5 verify ════════
  let tokC1 = "";
  {
    const p: string[] = [];
    const t0 = Date.now();
    const r = await verify({ pin: PIN.C1 }, "PN5 verify C1");
    const t1 = Date.now();
    if (r?.ok !== true) p.push(`PIN ถูก → ${codeOf(r)}`);
    else {
      if (r.userId !== uid("C1")) p.push(`userId ${r.userId}`);
      if (r.role !== "STAFF") p.push(`role ${r.role}`);
      if (typeof r.staffToken !== "string" || r.staffToken.length < 20) p.push(`staffToken ${short(r.staffToken, 30)}`);
      else tokC1 = r.staffToken;
      if (!within(r.expiresAt, t0 + 12 * HOUR - 2 * MIN, t1 + 12 * HOUR + 2 * MIN)) p.push(`expiresAt ${short(r.expiresAt, 30)} (คาด +12 ชม.)`);
      if (typeof r.staffToken === "string" && (r.staffToken.includes(PIN.C1!) || (US.C1 && r.staffToken.includes(US.C1.email)))) p.push("โทเคนมี PIN/อีเมล");
    }
    const rid = await verify({ pin: PIN.MGR, userId: uid("MGR") }, "PN5 verify MGR ระบุ userId");
    if (rid?.ok !== true || rid.userId !== uid("MGR") || rid.role !== "MANAGER") p.push(`ระบุ userId ผู้จัดการ → ${codeOf(rid)} ${rid?.userId === uid("MGR") ? "" : "userId ผิด"} ${rid?.role ?? ""}`);
    const w = await verify({ pin: "906142" }, "PN5 PIN ผิด");
    if (!refused(w, "PIN_INVALID")) p.push(`PIN ผิด → ${codeOf(w)}`);
    for (const k of ["C1", "C2", "MGR", "OWNER"]) if (US[k] && typeof w?.message === "string" && w.message.includes(US[k]!.name)) p.push(`ข้อความ PIN_INVALID มีชื่อ ${k}`);
    const au = await audits("pos.staff.pin_verified");
    if (au.length !== verOk) p.push(`audit pin_verified ${au.length} (คาด ${verOk} = ครั้งที่ผ่าน)`);
    for (const a of au) {
      const leak = auditLeaks(a, [PIN.C1!, PIN.MGR!, US.C1?.email ?? "", US.MGR?.email ?? "", US.C1?.name ?? "", US.MGR?.name ?? ""]);
      if (leak.length) p.push(`audit มีค่าดิบ ${leak.map((l) => l.slice(0, 6)).join(",")}`);
      if (!short(a.after, 2000).includes(uid("C1")) && !short(a.after, 2000).includes(uid("MGR")) && a.actorId !== uid("C1") && a.actorId !== uid("MGR")) p.push("audit ไม่มี userId");
    }
    chk("PN5", NS === "" && NT === "" && p.length === 0, "ok + token 12 ชม. · ระบุ userId · PIN_INVALID ไม่บอกชื่อ · audit เฉพาะที่ผ่าน", FX(NS + NT + (p.join(" · ") || "ครบ")));
  }
  // ════════ PN6 ล็อก ════════
  {
    const p: string[] = [];
    for (let i = 1; i <= 2; i++) {
      const r = await verify({ pin: "906142", userId: uid("C1") }, `PN6 C1 ผิด ${i}`);
      if (!refused(r, "PIN_INVALID")) p.push(`C1 ผิดครั้งที่ ${i} → ${codeOf(r)}`);
    }
    if ((await pinRow("C1"))?.failedCount !== 2) p.push(`C1 failedCount หลังผิด 2 = ${(await pinRow("C1"))?.failedCount}`);
    const okC1 = await verify({ pin: PIN.C1, userId: uid("C1") }, "PN6 C1 ถูก");
    if (okC1?.ok !== true) p.push(`C1 ถูกหลังผิด 2 → ${codeOf(okC1)}`);
    else tokC1 = okC1.staffToken ?? tokC1;
    if ((await pinRow("C1"))?.failedCount !== 0) p.push(`C1 ตัวนับไม่กลับ 0 (${(await pinRow("C1"))?.failedCount})`);
    const t0 = Date.now();
    for (let i = 1; i <= 5; i++) {
      const r = await verify({ pin: "906142", userId: uid("C2") }, `PN6 C2 ผิด ${i}`);
      if (!refused(r, "PIN_INVALID")) p.push(`C2 ผิดครั้งที่ ${i} → ${codeOf(r)}`);
    }
    const t1 = Date.now();
    const row = await pinRow("C2");
    if (row?.failedCount !== 5) p.push(`failedCount ${row?.failedCount} (คาด 5)`);
    if (!within(row?.lockedUntil, t0 + 15 * MIN - 2 * MIN, t1 + 15 * MIN + 2 * MIN)) p.push(`lockedUntil ${short(row?.lockedUntil, 30)} (คาด +15 นาที)`);
    const lk = await verify({ pin: PIN.C2, userId: uid("C2") }, "PN6 C2 ถูกขณะล็อก");
    if (!refused(lk, "PIN_LOCKED")) p.push(`PIN ถูกขณะล็อก → ${codeOf(lk)}`);
    const lk2 = await verify({ pin: PIN.C2 }, "PN6 C2 ถูกไม่ระบุคน");
    if (lk2?.ok === true) p.push("PIN ถูกแบบไม่ระบุคนผ่านทั้งที่ล็อก");
    const u1 = keep("PN6 แคชเชียร์ปลดล็อก", await call(staffMod, "unlockStaffPin", ctxA(), A("C1"), { userId: uid("C2") }));
    if (!refused(u1, "PERMISSION_DENIED")) p.push(`แคชเชียร์ปลดล็อก → ${codeOf(u1)}`);
    const u2 = keep("PN6 ผู้จัดการปลดล็อก", await call(staffMod, "unlockStaffPin", ctxA(), A("MGR"), { userId: uid("C2") }));
    const row2 = await pinRow("C2");
    if (u2?.ok !== true || row2?.failedCount !== 0 || row2?.lockedUntil !== null) p.push(`ผู้จัดการปลดล็อก → ${codeOf(u2)} (${row2?.failedCount}/${row2?.lockedUntil})`);
    const ok = await verify({ pin: PIN.C2, userId: uid("C2") }, "PN6 C2 หลังปลด");
    if (ok?.ok !== true || ok.userId !== uid("C2")) p.push(`หลังปลดล็อก → ${codeOf(ok)}`);
    chk("PN6", NS === "" && NT === "" && p.length === 0, "5 ผิด → ล็อก 15 นาที · PIN_LOCKED · ติดกันเท่านั้น · ปลดล็อกโดยผู้จัดการ", FX(NS + NT + (p.join(" · ") || "ครบ")));
  }
  // ════════ PN7 รายชื่อ + สิทธิ์ขาย + เครื่องถูกเพิกถอน ════════
  {
    const p: string[] = [];
    const listOf = (r: Any): Any[] | null => (Array.isArray(r) ? r : Array.isArray(r?.items) ? r.items : Array.isArray(r?.staff) ? r.staff : null);
    const r = keep("PN7 list", await call(staffMod, "listStaffForDevice", ctxA(DEV1), { unitId: U.A }));
    const items = listOf(r);
    if (!items) p.push(`listStaffForDevice → ${codeOf(r)} ${short(r, 60)}`);
    else {
      const ids = new Set(items.map((i: Any) => i.userId));
      const want = ["OWNER", "MGR", "C1", "C2"].map(uid);
      if (ids.size !== want.length || want.some((x) => !ids.has(x))) p.push(`ชุดคน ${items.length} (คาด OWNER MGR C1 C2 · ไม่มี CB S0)`);
      for (const it of items) {
        const k = Object.keys(US).find((x) => US[x]!.id === it.userId) ?? "?";
        const has = !!(await pinRow(k));
        if (it.hasPin !== has) p.push(`${k} hasPin ${it.hasPin} (DB ${has})`);
        if (US[k] && it.name !== US[k]!.name) p.push(`${k} name ${short(it.name, 20)}`);
        if (US[k] && it.role !== US[k]!.role) p.push(`${k} role ${it.role}`);
        const bad = ["pinHash", "failedCount", "lockedUntil", "email", "permissions"].filter((x) => x in it);
        if (bad.length) p.push(`${k} มีคีย์ ${bad.join(",")}`);
      }
      const own = items.find((i: Any) => i.userId === uid("OWNER"));
      if (shift1 && own?.shift?.id !== shift1) p.push(`กะของผู้เปิดกะ ${short(own?.shift, 50)} (คาด ${shift1})`);
      if (own?.shift && !Number.isFinite(ms(own.shift.openedAt))) p.push("shift.openedAt อ่านไม่ได้");
    }
    await setPerms("C2", { "pos.shift.operate": true });
    const v = await verify({ pin: PIN.C2 }, "PN7 C2 ไม่มีสิทธิ์ขาย");
    if (!refused(v, "PIN_INVALID")) p.push(`C2 ไม่มี pos.sale.create → ${codeOf(v)}`);
    const l2 = listOf(await call(staffMod, "listStaffForDevice", ctxA(DEV1), { unitId: U.A }));
    if (!l2 || l2.some((i: Any) => i.userId === uid("C2"))) p.push("C2 ยังอยู่ในรายการหลังถอดสิทธิ์");
    await setPerms("C2", C2P);
    // เครื่องถูกเพิกถอน
    const dev3 = T ? await P.posDevice.findFirst({ where: { tenantId: T, unitId: U.A, deviceCode: DEV3 } }).catch(() => null) : null;
    if (!dev3) p.push("ไม่มีเครื่อง 3");
    else {
      const rv = await call(devMod, "revokeDevice", ctxA(), A("OWNER"), { id: dev3.id });
      if (rv?.ok !== true) p.push(`revokeDevice → ${codeOf(rv)}`);
      const n0 = verOk;
      const d = await verify({ pin: PIN.C1 }, "PN7 เครื่องถูกเพิกถอน", DEV3);
      if (!refused(d, "DEVICE_REVOKED")) p.push(`เครื่องถูกเพิกถอน → ${codeOf(d)}`);
      if (verOk !== n0) p.push("ได้โทเคนจากเครื่องที่ถูกเพิกถอน");
    }
    chk("PN7", NS === "" && NT === "" && p.length === 0, "รายชื่อตรง · ถอดสิทธิ์ = PIN_INVALID + หาย · DEVICE_REVOKED", FX(NS + NT + (p.slice(0, 8).join(" · ") || "ครบ")));
  }

  // ════════ TK โทเคนผู้ขาย ════════
  const issue = async (k: string, dev: string, agoH: number): Promise<Any> => call(staffMod, "issueStaffToken", ctxA(dev), { unitId: U.A, deviceId: dev, userId: uid(k) }, { now: new Date(Date.now() - agoH * HOUR) });
  const fromTok = async (ctx: Any, tok: unknown): Promise<Any> => call(staffMod, "staffFromToken", ctx, tok);
  {
    const p: string[] = [];
    if (!tokC1) p.push("ไม่มีโทเคนของ C1 จาก PN5");
    const a = await sell(ctxA(DEV1), A("OWNER"), { amount: 5000, name: "TK1 โทเคน" }, { staffToken: tokC1 });
    if (a.r?.ok !== true) p.push(`ขาย + โทเคน → ${codeOf(a.r)} ${short(a.r?.message ?? "", 60)}`);
    else if ((await saleRow(a.r.saleId))?.soldByUserId !== uid("C1")) p.push(`soldByUserId ${(await saleRow(a.r.saleId))?.soldByUserId} (คาด C1)`);
    const b = await sell(ctxA(DEV1), A("OWNER"), { amount: 4000, name: "TK1 ไม่มีโทเคน" });
    if (b.r?.ok !== true) p.push(`ขายไม่มีโทเคน → ${codeOf(b.r)}`);
    else if ((await saleRow(b.r.saleId))?.soldByUserId !== uid("OWNER")) p.push("ไม่มีโทเคนแล้ว soldBy ไม่ใช่ผู้ใช้ session");
    chk("TK1", NS === "" && p.length === 0, "soldBy = คนในโทเคน · ไม่มีโทเคน = session", FX(NS + (p.join(" · ") || "ครบ")));
  }
  {
    const p: string[] = [];
    const tC2 = await verify({ pin: PIN.C2, userId: uid("C2") }, "TK2 verify C2");
    const tokC2 = tC2?.ok === true ? String(tC2.staffToken) : "";
    if (!tokC2) p.push(`verify C2 → ${codeOf(tC2)}`);
    const h = await call(heldMod, "holdRegisterCart", ctxA(DEV1), A("OWNER"), { cart: cartOf({ amount: 3000, name: "TK2 พัก" }), label: "TK2", staffToken: tokC2 });
    const hid = h?.ok === true ? String(h.heldCart?.id ?? "") : "";
    if (!hid) p.push(`พักบิล + โทเคน → ${codeOf(h)} ${short(h?.message ?? "", 60)}`);
    else {
      const row = await P.posHeldCart.findUnique({ where: { id: hid } }).catch(() => null);
      if (row?.heldByUserId !== uid("C2")) p.push(`heldByUserId ${row?.heldByUserId} (คาด C2)`);
      const rc = await call(heldMod, "recallHeldCart", ctxA(DEV1), A("OWNER"), { id: hid, staffToken: tokC1 });
      const row2 = await P.posHeldCart.findUnique({ where: { id: hid } }).catch(() => null);
      if (rc?.ok !== true) p.push(`เรียกคืน + โทเคน → ${codeOf(rc)}`);
      else if (row2?.recalledByUserId !== uid("C1")) p.push(`recalledByUserId ${row2?.recalledByUserId} (คาด C1)`);
    }
    const tD2 = await verify({ pin: PIN.C1 }, "TK2 verify C1 เครื่อง 2", DEV2);
    const tokD2 = tD2?.ok === true ? String(tD2.staffToken) : "";
    const o = await call(shiftMod, "openShift", ctxA(DEV2), A("OWNER"), { deviceId: DEV2, deviceLabel: "เครื่อง QC 2", floatSatang: 0, staffToken: tokD2 });
    if (o?.ok !== true) {
      p.push(`เปิดกะเครื่อง 2 + โทเคน → ${codeOf(o)} ${short(o?.message ?? "", 60)}`);
      await call(shiftMod, "openShift", ctxA(DEV2), A("OWNER"), { deviceId: DEV2, deviceLabel: "เครื่อง QC 2", floatSatang: 0 }); // ให้ TK4 มีกะ
    } else if ((await P.posShift.findUnique({ where: { id: o.shift?.id } }).catch(() => null))?.openedByUserId !== uid("C1")) p.push("openedByUserId ไม่ใช่คนในโทเคน");
    chk("TK2", NS === "" && p.length === 0, "heldBy / recalledBy / openedBy = คนในโทเคน", FX(NS + (p.join(" · ") || "ครบ")));
  }
  {
    const p: string[] = [];
    const t0 = Date.now();
    const old = await issue("C1", DEV1, 13);
    if (typeof old?.staffToken !== "string") p.push(`issueStaffToken → ${codeOf(old)}`);
    else {
      if (!within(old.expiresAt, t0 - HOUR - 2 * MIN, Date.now() - HOUR + 2 * MIN)) p.push(`expiresAt ${short(old.expiresAt, 30)} (คาด 1 ชม.ก่อน)`);
      const f = await fromTok(ctxA(DEV1), old.staffToken);
      if (f !== null) p.push(`staffFromToken หมดอายุ → ${short(f, 60)}`);
      const s = await sell(ctxA(DEV1), A("OWNER"), { amount: 3300, name: "TK3 หมดอายุ" }, { staffToken: old.staffToken });
      keep("TK3 ขายโทเคนหมดอายุ", s.r);
      if (!refused(s.r, "STAFF_TOKEN_INVALID")) p.push(`ขายโทเคนหมดอายุ → ${codeOf(s.r)}`);
      if (await saleByKey(s.key)) p.push("มีบิลจากโทเคนหมดอายุ");
    }
    const fresh = await issue("C1", DEV1, 11);
    const ff = typeof fresh?.staffToken === "string" ? await fromTok(ctxA(DEV1), fresh.staffToken) : null;
    if (ff?.userId !== uid("C1")) p.push(`โทเคนออก 11 ชม.ก่อน → ${short(ff, 60)} (คาด C1)`);
    if ((await fromTok(ctxA(DEV1), "abc.def")) !== null) p.push("โทเคนมั่วไม่ null");
    if (tokC1) {
      const i = Math.floor(tokC1.length / 2);
      const flip = (s: string, at: number) => s.slice(0, at) + (s[at] === "A" ? "B" : "A") + s.slice(at + 1);
      for (const at of [i, tokC1.length - 2]) if ((await fromTok(ctxA(DEV1), flip(tokC1, at))) !== null) p.push(`โทเคนถูกแก้ตำแหน่ง ${at} ไม่ null`);
    }
    chk("TK3", NS === "" && p.length === 0, "หมดอายุ null + STAFF_TOKEN_INVALID ไม่มีบิล · 11 ชม. ใช้ได้ · มั่ว/ถูกแก้ null", FX(NS + (p.join(" · ") || "ครบ")));
  }
  {
    const p: string[] = [];
    const s = await sell(ctxA(DEV2), A("OWNER"), { amount: 3400, name: "TK4 ต่างเครื่อง" }, { staffToken: tokC1 });
    keep("TK4 ขายต่างเครื่อง", s.r);
    if (!refused(s.r, "STAFF_TOKEN_INVALID")) p.push(`โทเคนเครื่อง 1 ขายที่เครื่อง 2 → ${codeOf(s.r)}`);
    if (await saleByKey(s.key)) p.push("มีบิลจากโทเคนต่างเครื่อง");
    if ((await fromTok(ctxA(DEV2), tokC1)) !== null) p.push("staffFromToken เครื่อง 2 ไม่ null");
    if ((await fromTok(ctxB(DEV1), tokC1)) !== null) p.push("staffFromToken สาขา B ไม่ null");
    if ((await fromTok({ ...ctxA(DEV1), tenantId: TIDS[0] }, tokC1)) !== null) p.push("staffFromToken ร้านอื่นไม่ null");
    const same = await fromTok(ctxA(DEV1), tokC1);
    if (same?.userId !== uid("C1")) p.push(`เครื่องเดิม → ${short(same, 60)} (คาด C1)`);
    chk("TK4", NS === "" && p.length === 0, "ต่างเครื่อง/สาขา/ร้าน = invalid · เครื่องเดิมใช้ได้", FX(NS + (p.join(" · ") || "ครบ")));
  }
  {
    const p: string[] = [];
    const tC2 = await verify({ pin: PIN.C2 }, "TK5 verify C2");
    const tokC2 = tC2?.ok === true ? String(tC2.staffToken) : "";
    if (!tokC2) p.push(`verify C2 → ${codeOf(tC2)}`);
    await setPerms("C2", { "pos.shift.operate": true });
    const s1 = await sell(ctxA(DEV1), A("OWNER"), { amount: 3500, name: "TK5 ถอดสิทธิ์" }, { staffToken: tokC2 });
    keep("TK5 ถอดสิทธิ์", s1.r);
    if (!refused(s1.r, "STAFF_TOKEN_INVALID")) p.push(`ถอด pos.sale.create → ${codeOf(s1.r)}`);
    if (await saleByKey(s1.key)) p.push("มีบิลหลังถอดสิทธิ์");
    await setPerms("C2", C2P);
    const s2 = await sell(ctxA(DEV1), A("OWNER"), { amount: 3500, name: "TK5 คืนสิทธิ์" }, { staffToken: tokC2 });
    if (s2.r?.ok !== true || (await saleRow(s2.r.saleId))?.soldByUserId !== uid("C2")) p.push(`คืนสิทธิ์ → ${codeOf(s2.r)}`);
    // pinVersion
    const oldTok = tokC1;
    PIN.C1 = "369147";
    const rs = await setPin(ctxA(), "C1", "C1", PIN.C1, "TK5 ตั้ง PIN ใหม่");
    if (rs?.ok !== true) p.push(`ตั้ง PIN ใหม่ → ${codeOf(rs)}`);
    if (oldTok && (await fromTok(ctxA(DEV1), oldTok)) !== null) p.push("โทเคนก่อนเปลี่ยน PIN ยังใช้ได้");
    const s3 = await sell(ctxA(DEV1), A("OWNER"), { amount: 3600, name: "TK5 โทเคนเก่า" }, { staffToken: oldTok });
    if (!refused(s3.r, "STAFF_TOKEN_INVALID")) p.push(`ขายด้วยโทเคนก่อนเปลี่ยน PIN → ${codeOf(s3.r)}`);
    const nv = await verify({ pin: PIN.C1 }, "TK5 verify PIN ใหม่");
    tokC1 = nv?.ok === true ? String(nv.staffToken) : "";
    if ((await fromTok(ctxA(DEV1), tokC1))?.userId !== uid("C1")) p.push("โทเคนใหม่ใช้ไม่ได้");
    chk("TK5", NS === "" && p.length === 0, "ถอดสิทธิ์ = invalid · คืน = ผ่าน · PIN ใหม่ทำโทเคนเก่าตาย", FX(NS + (p.join(" · ") || "ครบ")));
  }

  // ════════ DC เพดานส่วนลด (ยังไม่มีกติกา POS_DISCOUNT_OVER) ════════
  const B200 = { amount: 20000, name: "DC บิล ฿200" };
  const overrideAudits = async () => audits("pos.discount.override");
  {
    const p: string[] = [];
    const a = await sell(ctxA(DEV1), A("C1"), { ...B200, pct: 1500 });
    if (!refused(a.r, "DISCOUNT_EXCEEDS_LIMIT")) p.push(`15% → ${codeOf(a.r)}`);
    if (await saleByKey(a.key)) p.push("มีบิล 15%");
    const b = await sell(ctxA(DEV1), A("C1"), { ...B200, pct: 1000 });
    if (b.r?.ok !== true || b.r.grandTotalSatang !== 18000) p.push(`10% → ${codeOf(b.r)} ${b.r?.grandTotalSatang}`);
    const c = await sell(ctxA(DEV1), A("OWNER"), { ...B200, pct: 1500 }, { staffToken: tokC1 });
    if (!refused(c.r, "DISCOUNT_EXCEEDS_LIMIT")) p.push(`session เจ้าของ + โทเคน C1 ลด 15% → ${codeOf(c.r)}`);
    if (await saleByKey(c.key)) p.push("มีบิลจากเจ้าของ+โทเคน 15%");
    chk("DC1", p.length === 0, "15% ปฏิเสธ · 10% ผ่าน · เพดานตามคนในโทเคน", FX(p.join(" · ") || "ครบ"));
  }
  {
    const p: string[] = [];
    const n0 = (await overrideAudits()).length;
    const a = await sell(ctxA(DEV1), A("C1"), { ...B200, pct: 1500 }, { managerPin: PIN.MGR, managerUserId: uid("MGR") });
    if (a.r?.ok !== true) p.push(`15% + managerPin → ${codeOf(a.r)} ${short(a.r?.message ?? "", 60)}`);
    else {
      const row = await saleRow(a.r.saleId);
      if (row?.grandTotalSatang !== 17000 || row?.soldByUserId !== uid("C1")) p.push(`บิล grand ${row?.grandTotalSatang} soldBy ${row?.soldByUserId === uid("C1") ? "C1" : row?.soldByUserId}`);
      const au = (await overrideAudits()).filter((x) => x.targetId === a.r.saleId || x.after?.saleId === a.r.saleId);
      const x = au[0];
      if (au.length !== 1) p.push(`audit override ${au.length} (คาด 1)`);
      else {
        if (x.actorId !== uid("MGR")) p.push(`audit actorId ${x.actorId}`);
        if (x.after?.byUserId !== uid("MGR") || x.after?.forUserId !== uid("C1") || x.after?.discountBp !== 1500) p.push(`audit after ${short(x.after, 120)}`);
        if (auditLeaks(x, [PIN.MGR!]).length) p.push("audit มี PIN");
      }
    }
    const b = await sell(ctxA(DEV1), A("C1"), { ...B200, pct: 1500 }, { managerPin: PIN.C2, managerUserId: uid("C2") });
    keep("DC2 PIN แคชเชียร์อื่น", b.r);
    if (!refused(b.r, "DISCOUNT_EXCEEDS_LIMIT")) p.push(`PIN ของ C2 (เพดาน 10%) → ${codeOf(b.r)}`);
    if (await saleByKey(b.key)) p.push("มีบิลจาก PIN แคชเชียร์");
    if ((await overrideAudits()).length !== n0 + 1) p.push(`audit override รวม ${(await overrideAudits()).length - n0} (คาด 1)`);
    chk("DC2", p.length === 0, "ผ่าน + audit override · PIN เพดานไม่พอ = DISCOUNT_EXCEEDS_LIMIT", FX(p.join(" · ") || "ครบ"));
  }
  {
    const p: string[] = [];
    const before = (await pinRow("MGR"))?.failedCount;
    const n0 = (await overrideAudits()).length;
    const a = await sell(ctxA(DEV1), A("C1"), { ...B200, pct: 1500 }, { managerPin: "906142", managerUserId: uid("MGR") });
    keep("DC3 managerPin ผิด", a.r);
    if (!refused(a.r, "PIN_INVALID")) p.push(`managerPin ผิด → ${codeOf(a.r)}`);
    const after = (await pinRow("MGR"))?.failedCount;
    if (typeof before !== "number" || after !== before + 1) p.push(`failedCount ผู้จัดการ ${before} → ${after} (คาด +1)`);
    if (await saleByKey(a.key)) p.push("มีบิล");
    if ((await overrideAudits()).length !== n0) p.push("มี audit override");
    chk("DC3", NS === "" && NT === "" && p.length === 0, "PIN_INVALID · ตัวนับ +1 · ไม่มีบิล/audit", FX(NS + NT + (p.join(" · ") || "ครบ")));
  }
  {
    const p: string[] = [];
    const n0 = (await overrideAudits()).length;
    const a = await sell(ctxA(DEV1), A("MGR"), { ...B200, pct: 1500 });
    if (a.r?.ok !== true || a.r.grandTotalSatang !== 17000) p.push(`ผู้จัดการ 15% → ${codeOf(a.r)} ${a.r?.grandTotalSatang}`);
    if ((await overrideAudits()).length !== n0) p.push("มี audit override ของผู้จัดการเอง");
    chk("DC4", p.length === 0, "ผู้จัดการ 15% ผ่าน ไม่มี override", FX(p.join(" · ") || "ครบ"));
  }
  {
    const p: string[] = [];
    try {
      await setPosSettings({ maxBpByRole: { CASHIER: 2000, STAFF: 2000, MANAGER: 10000, OWNER: 10000 }, overrideRequiresPin: true });
      const n0 = (await overrideAudits()).length;
      const a = await sell(ctxA(DEV1), A("C1"), { ...B200, pct: 1500 });
      if (a.r?.ok !== true) p.push(`เพดาน 2000: 15% → ${codeOf(a.r)}`);
      const b = await sell(ctxA(DEV1), A("C1"), { ...B200, pct: 2500 });
      if (!refused(b.r, "DISCOUNT_EXCEEDS_LIMIT")) p.push(`เพดาน 2000: 25% → ${codeOf(b.r)}`);
      if ((await overrideAudits()).length !== n0) p.push("มี audit override ทั้งที่อยู่ในเพดาน");
      await setPosSettings(undefined);
      const c = await sell(ctxA(DEV1), A("C1"), { ...B200, pct: 1500 });
      if (!refused(c.r, "DISCOUNT_EXCEEDS_LIMIT")) p.push(`ล้างค่าตั้ง: 15% → ${codeOf(c.r)}`);
    } catch (e) {
      p.push(`ตั้งค่า: ${(e as Error).message.slice(0, 80)}`);
    } finally {
      await setPosSettings(undefined).catch(() => {});
    }
    chk("DC5", p.length === 0, "เพดานจากค่าตั้ง 2000 · 25% ปฏิเสธ · ล้างแล้วกลับปริยาย", FX(p.join(" · ") || "ครบ"));
  }
  {
    const p: string[] = [];
    try {
      await setPosSettings("พัง");
      const a = await sell(ctxA(DEV1), A("C1"), { ...B200, pct: 1000 });
      if (a.r?.ok !== true) p.push(`ค่าตั้งเพี้ยน: 10% → ${codeOf(a.r)}`);
      const b = await sell(ctxA(DEV1), A("C1"), { ...B200, pct: 1500 });
      if (!refused(b.r, "DISCOUNT_EXCEEDS_LIMIT")) p.push(`ค่าตั้งเพี้ยน: 15% → ${codeOf(b.r)}`);
      await setPosSettings({ maxBpByRole: { MANAGER: 1200 } });
      const c = await sell(ctxA(DEV1), A("MGR"), { ...B200, pct: 1500 });
      if (!refused(c.r, "DISCOUNT_EXCEEDS_LIMIT")) p.push(`MANAGER 1200: 15% → ${codeOf(c.r)}`);
      const d = await sell(ctxA(DEV1), A("MGR"), { ...B200, pct: 1200 });
      if (d.r?.ok !== true) p.push(`MANAGER 1200: 12% → ${codeOf(d.r)}`);
    } catch (e) {
      p.push(`ตั้งค่า: ${(e as Error).message.slice(0, 80)}`);
    } finally {
      await setPosSettings(undefined).catch(() => {});
    }
    chk("DC6", p.length === 0, "เพี้ยน = ปริยาย · MANAGER ตามค่าตั้ง", FX(p.join(" · ") || "ครบ"));
  }

  // ════════ AP สายอนุมัติ ════════
  const pol: Record<string, string> = {};
  if (!fx) {
    try {
      pol.VOID = (await apSvc.createPolicy({ tenantId: T }, { name: "QC ยกเลิกบิล ≥ ฿100", entityType: "POS_VOID", thresholdSatang: 10000, steps: [{ order: 1, approverRole: "MANAGER" }] })).id;
      pol.REFUND = (await apSvc.createPolicy({ tenantId: T }, { name: "QC คืนเงินทุกยอด", entityType: "POS_REFUND", steps: [{ order: 1, approverRole: "MANAGER" }] })).id;
    } catch (e) {
      fx = `createPolicy:${(e as Error).message.slice(0, 120)}`;
    }
  }
  const decideAs = async (k: string, reqId: unknown, decision: "APPROVED" | "REJECTED"): Promise<Any> =>
    typeof reqId === "string" && reqId ? call(apSvc, "decide", MC(k), { tenantId: T }, reqId, { decision, note: `QC ${decision}` }) : { ok: false, code: "NO_REQUEST" };
  const voidBy = async (k: string, saleId: string, extra: Record<string, unknown> = {}, label = "void"): Promise<Any> =>
    keep(label, await call(billsMod, "voidSaleByActor", ctxA(DEV1), A(k), { unitId: U.A, saleId, idempotencyKey: newKey("v"), reason: "ลูกค้าเปลี่ยนใจ QC", ...extra }));
  const NC_ = NEED([consPos && typeof consPos.onPosApprovalDecided === "function", "pos-approval-consumer.ts"]);
  const approvedEvt = async (reqId: string): Promise<Any> => (T && reqId ? P.outboxEvent.findFirst({ where: { tenantId: T, type: "approval.request.approved", idempotencyKey: `approval.request.approved#${reqId}` } }).catch(() => null) : null);
  const replay = async (evtRow: Any, errs: string[]) => {
    if (!evtRow) {
      errs.push("ไม่มี event ให้เล่นซ้ำ");
      return;
    }
    const evt = { id: evtRow.id, tenantId: evtRow.tenantId, type: evtRow.type, payload: evtRow.payload, systemId: evtRow.systemId, unitId: evtRow.unitId };
    const h = consMod?.consumers?.[evtRow.type];
    for (let i = 0; i < 2; i++) {
      for (const [lbl, fn] of [["consumers", h], ["onPosApprovalDecided", consPos?.onPosApprovalDecided]] as [string, Any][]) {
        if (typeof fn !== "function") {
          errs.push(`ไม่มี ${lbl}`);
          continue;
        }
        try {
          await fn(evt);
        } catch (e) {
          errs.push(`${lbl} throw ${(e as Error).message.slice(0, 50)}`);
        }
      }
    }
  };

  // AP1–AP5 ยกเลิกบิล ฿160 ผ่านสาย
  const s160 = await baseSale("s160", { amount: 16000, name: "AP บิล ฿160" });
  let rq160 = "";
  {
    const p: string[] = [];
    const r = await voidBy("C1", s160, {}, "AP1 void ฿160");
    if (!refused(r, "APPROVAL_REQUIRED") || typeof r?.requestId !== "string") p.push(`void ฿160 → ${codeOf(r)} requestId ${short(r?.requestId, 30)}`);
    else rq160 = r.requestId;
    const reqs = await requestsFor("POS_VOID", s160);
    const q = reqs[0];
    if (reqs.length !== 1) p.push(`คำขอ ${reqs.length} (คาด 1)`);
    else {
      if (rq160 && q.id !== rq160) p.push("requestId ไม่ตรงแถว");
      if (q.entityId !== s160) p.push(`entityId ${q.entityId} (คาด saleId)`);
      if (q.amountSatang !== 16000 || q.unitId !== U.A || q.systemId !== S.A || q.requestedById !== uid("C1") || q.status !== "PENDING" || q.policyId !== pol.VOID)
        p.push(`คำขอ amount ${q.amountSatang} unit ${q.unitId === U.A} sys ${q.systemId === S.A} by ${q.requestedById === uid("C1")} ${q.status} policy ${q.policyId === pol.VOID}`);
    }
    if ((await outboxCount("approval.request.submitted", rq160 || "none")) !== 1) p.push("ไม่มี outbox approval.request.submitted 1 แถว");
    if ((await saleRow(s160))?.status !== "PAID") p.push(`บิล ${(await saleRow(s160))?.status}`);
    if ((await audits("pos.sale.void", s160)).length) p.push("มี audit void");
    if ((await outboxCount("pos.sale.voided", s160)) !== 0) p.push("มี pos.sale.voided");
    chk("AP1", p.length === 0, "APPROVAL_REQUIRED + คำขอ PENDING + submitted · บิลยัง PAID", FX(p.join(" · ") || "ครบ"));
  }
  {
    const p: string[] = [];
    const r = await voidBy("C1", s160, {}, "AP2 void ซ้ำ");
    if (!refused(r, "PENDING_APPROVAL") || (rq160 && r.requestId !== rq160)) p.push(`ซ้ำ → ${codeOf(r)} requestId ${r?.requestId === rq160 ? "เดิม" : short(r?.requestId, 20)}`);
    const n = await requestsFor("POS_VOID", s160);
    if (n.length !== 1) p.push(`คำขอ ${n.length}`);
    const x = await voidBy("C2", s160, {}, "AP2 ไม่มีสิทธิ์");
    if (!refused(x, "NO_PERMISSION")) p.push(`C2 ไม่มี pos.sale.void → ${codeOf(x)}`);
    if ((await requestsFor("POS_VOID", s160)).length !== 1) p.push("คำขอเพิ่มจากคนไม่มีสิทธิ์");
    if ((await saleRow(s160))?.status !== "PAID") p.push("บิลไม่ PAID");
    chk("AP2", p.length === 0, "PENDING_APPROVAL id เดิม · NO_PERMISSION ไม่มีคำขอเพิ่ม", FX(p.join(" · ") || "ครบ"));
  }
  {
    const p: string[] = [];
    const s50 = await baseSale("s50", { amount: 5000, name: "AP บิล ฿50" });
    const r = await voidBy("C1", s50, {}, "AP3 void ฿50");
    if (r?.ok !== true) p.push(`void ฿50 → ${codeOf(r)}`);
    if ((await saleRow(s50))?.status !== "VOIDED") p.push(`บิล ${(await saleRow(s50))?.status}`);
    if ((await requestsFor("POS_VOID", s50)).length) p.push("มีคำขอของบิล ฿50");
    chk("AP3", !!s50 && p.length === 0, "ต่ำกว่าเกณฑ์ = VOIDED ทันที", FX(p.join(" · ") || "ครบ"));
  }
  {
    const p: string[] = [];
    const d = await decideAs("MGR", rq160, "APPROVED");
    if (d?.ok !== true || d.status !== "APPROVED") p.push(`decide → ${short(d, 80)}`);
    await drain();
    if ((await saleRow(s160))?.status !== "VOIDED") p.push(`บิลหลังอนุมัติ ${(await saleRow(s160))?.status}`);
    const au = await audits("pos.sale.void", s160);
    if (au.length !== 1) p.push(`audit void ${au.length} (คาด 1)`);
    else {
      if (au[0].actorId !== uid("MGR")) p.push(`audit actorId ${au[0].actorId === uid("C1") ? "C1 (ผู้ขอ)" : au[0].actorId}`);
      if (au[0].after?.via !== "approval" || au[0].after?.requestId !== rq160) p.push(`audit after ${short(au[0].after, 120)}`);
    }
    const ev = await approvedEvt(rq160);
    if (ev?.status !== "DONE") p.push(`event approved ${ev?.status ?? "ไม่มี"} ${short(ev?.lastError ?? "", 60)}`);
    if ((await outboxCount("pos.sale.voided", s160)) !== 1) p.push(`pos.sale.voided ${await outboxCount("pos.sale.voided", s160)}`);
    chk("AP4", NC_ === "" && p.length === 0, "อนุมัติ → VOIDED · audit via approval · DONE", FX(NC_ + (p.join(" · ") || "ครบ")));
  }
  {
    const p: string[] = [];
    const snap = async () => JSON.stringify({ st: (await saleRow(s160))?.status, au: (await audits("pos.sale.void", s160)).length, vo: await outboxCount("pos.sale.voided", s160) });
    const before = await snap();
    const errs: string[] = [];
    await replay(await approvedEvt(rq160), errs);
    const after = await snap();
    if (errs.length) p.push(errs.slice(0, 3).join(" · "));
    if (before !== after || before !== JSON.stringify({ st: "VOIDED", au: 1, vo: 1 })) p.push(`${before} → ${after}`);
    chk("AP5", NC_ === "" && p.length === 0, "เล่นซ้ำ ×2 ไม่เปลี่ยน", FX(NC_ + (p.join(" · ") || "ครบ")));
  }
  // AP6 ปฏิเสธ
  {
    const p: string[] = [];
    const s170 = await baseSale("s170", { amount: 17000, name: "AP บิล ฿170" });
    const r = await voidBy("C1", s170, {}, "AP6 void ฿170");
    const rq = refused(r, "APPROVAL_REQUIRED") ? String(r.requestId) : "";
    if (!rq) p.push(`void ฿170 → ${codeOf(r)}`);
    const d = await decideAs("MGR", rq, "REJECTED");
    if (d?.ok !== true) p.push(`decide REJECTED → ${short(d, 60)}`);
    await drain();
    if ((await saleRow(s170))?.status !== "PAID") p.push(`บิล ${(await saleRow(s170))?.status}`);
    if ((await audits("pos.sale.void", s170)).length) p.push("มี audit void");
    const st = rq ? await call(apSvc, "requestStatuses", { tenantId: T }, [rq]) : {};
    if (st?.[rq] !== "REJECTED") p.push(`requestStatuses ${short(st, 60)}`);
    const errs: string[] = [];
    const rj = T && rq ? await P.outboxEvent.findFirst({ where: { tenantId: T, type: "approval.request.rejected", idempotencyKey: `approval.request.rejected#${rq}` } }).catch(() => null) : null;
    if (rj?.status !== "DONE") p.push(`event rejected ${rj?.status ?? "ไม่มี"}`);
    await replay(rj, errs);
    if (errs.length) p.push(errs.slice(0, 2).join(" · "));
    if ((await saleRow(s170))?.status !== "PAID" || (await audits("pos.sale.void", s170)).length) p.push("เล่น rejected ซ้ำแล้วบิลเปลี่ยน");
    chk("AP6", !!s170 && NC_ === "" && p.length === 0, "REJECTED → ยัง PAID · ไม่มี audit", FX(NC_ + (p.join(" · ") || "ครบ")));
  }
  // AP7 คืนเงินผ่านสาย
  {
    const p: string[] = [];
    const sRf = await baseSale("sRf", { amount: 0, lines: [["AP คืน เสื้อ", 12000], ["AP คืน หมวก", 8000]] });
    const lines = sRf ? ((await P.posSaleLine.findMany({ where: { saleId: sRf }, orderBy: { id: "asc" } }).catch(() => [])) as Any[]) : [];
    const shirt = lines.find((l) => l.name === "AP คืน เสื้อ");
    const refundIn = (key: string): Any => ({ saleId: sRf, lines: [{ lineId: shirt?.id ?? "none", qty: 1 }], payMethods: [{ type: "CASH", amountSatang: 12000 }], reasonCode: "CHANGED_MIND", idempotencyKey: key });
    const r = keep("AP7 คืน", await call(refundMod, "refundSale", ctxA(DEV1), A("C1"), refundIn(newKey("rf"))));
    const rq = refused(r, "APPROVAL_REQUIRED") && typeof r.requestId === "string" ? r.requestId : "";
    if (!rq) p.push(`คืน ฿120 → ${codeOf(r)}`);
    const reqs = await requestsFor("POS_REFUND", sRf);
    if (reqs.length !== 1 || reqs[0]?.amountSatang !== 12000 || reqs[0]?.status !== "PENDING") p.push(`คำขอ ${reqs.length} amount ${reqs[0]?.amountSatang} ${reqs[0]?.status}`);
    const pay = rq && PAP ? await PAP.findUnique({ where: { requestId: rq } }).catch(() => null) : null;
    if (!pay) p.push(`${PAP ? "" : `${MISSING} PosApprovalPayload · `}ไม่มี PosApprovalPayload ของคำขอ`);
    else {
      const j = short(pay.payload, 5000);
      if (pay.kind !== "POS_REFUND" || pay.tenantId !== T) p.push(`payload kind ${pay.kind}`);
      if (!shirt || !j.includes(shirt.id) || !j.includes("12000") || !j.includes("CASH") || !j.includes("CHANGED_MIND")) p.push(`payload ไม่มีบรรทัด/ยอด/วิธี/เหตุผล ${j.slice(0, 80)}`);
    }
    const refundsOf = async () => (sRf ? ((await P.posSale.findMany({ where: { tenantId: T, refSaleId: sRf, docType: "REFUND" } }).catch(() => [])) as Any[]) : []);
    if ((await refundsOf()).length) p.push("มีใบคืนก่อนอนุมัติ");
    const r2 = keep("AP7 คืนซ้ำ", await call(refundMod, "refundSale", ctxA(DEV1), A("C1"), refundIn(newKey("rf"))));
    if (!refused(r2, "PENDING_APPROVAL") || r2.requestId !== rq) p.push(`คืนซ้ำ → ${codeOf(r2)}`);
    const d = await decideAs("MGR", rq, "APPROVED");
    if (d?.ok !== true) p.push(`decide → ${short(d, 60)}`);
    await drain();
    const after = async () => {
      const rf = await refundsOf();
      return { n: rf.length, key: rf[0]?.idempotencyKey, grand: rf[0]?.grandTotalSatang, refunded: (await saleRow(sRf))?.refundedSatang };
    };
    const a1 = await after();
    if (a1.n !== 1 || a1.key !== `approval-${rq}` || a1.grand !== 12000 || a1.refunded !== 12000) p.push(`หลังอนุมัติ ${short(a1, 120)}`);
    const errs: string[] = [];
    await replay(await approvedEvt(rq), errs);
    const a2 = await after();
    if (errs.length) p.push(errs.slice(0, 2).join(" · "));
    if (JSON.stringify(a1) !== JSON.stringify(a2)) p.push(`เล่นซ้ำเปลี่ยน ${short(a2, 80)}`);
    chk("AP7", !!sRf && NC_ === "" && p.length === 0, "APPROVAL_REQUIRED + payload · PENDING_APPROVAL · อนุมัติ = ใบคืน 1 ใบ key approval-<id>", FX(NC_ + (p.slice(0, 6).join(" · ") || "ครบ")));
  }
  // AP8–AP9 ส่วนลดเกินสิทธิ์ผ่านสาย
  if (!fx) {
    try {
      pol.DISC = (await apSvc.createPolicy({ tenantId: T }, { name: "QC ส่วนลดเกินสิทธิ์", entityType: "POS_DISCOUNT_OVER", steps: [{ order: 1, approverRole: "MANAGER" }] })).id;
    } catch (e) {
      console.log(`  ⚠️  createPolicy POS_DISCOUNT_OVER: ${(e as Error).message.slice(0, 100)}`);
    }
  }
  const CART15 = { amount: 20000, pct: 1500, name: "AP ส่วนลด ฿200" };
  let rqD = "", heldD = "";
  {
    const p: string[] = [];
    const a = await sell(ctxA(DEV1), A("C1"), CART15);
    keep("AP8 ส่วนลดเกิน", a.r);
    if (!refused(a.r, "APPROVAL_REQUIRED") || typeof a.r.requestId !== "string" || typeof a.r.heldCartId !== "string") p.push(`15% มีกติกา → ${codeOf(a.r)} ${short({ requestId: a.r?.requestId, heldCartId: a.r?.heldCartId }, 80)}`);
    else {
      rqD = a.r.requestId;
      heldD = a.r.heldCartId;
    }
    if (await saleByKey(a.key)) p.push("มีบิล");
    const hc = heldD ? await P.posHeldCart.findUnique({ where: { id: heldD } }).catch(() => null) : null;
    if (!hc || hc.status !== "HELD" || hc.heldByUserId !== uid("C1") || hc.tenantId !== T || hc.unitId !== U.A) p.push(`บิลพัก ${short(hc && { status: hc.status, by: hc.heldByUserId === uid("C1") }, 60)}`);
    else if (!short(hc.cartJson, 5000).includes("1500")) p.push("บิลพักไม่มีส่วนลด 15%");
    const q = await reqRow(rqD);
    if (!q || q.entityType !== "POS_DISCOUNT_OVER" || q.entityId !== heldD || q.amountSatang !== 3000 || q.status !== "PENDING" || q.requestedById !== uid("C1")) p.push(`คำขอ ${short(q && { t: q.entityType, e: q.entityId === heldD, a: q.amountSatang, s: q.status }, 100)}`);
    chk("AP8", p.length === 0, "APPROVAL_REQUIRED + heldCartId · บิลพัก HELD · คำขอ amount 3000", FX(p.join(" · ") || "ครบ"));
  }
  {
    const p: string[] = [];
    const d = await decideAs("MGR", rqD, "APPROVED");
    if (d?.ok !== true) p.push(`decide → ${short(d, 60)}`);
    await drain();
    const hc = heldD ? await P.posHeldCart.findUnique({ where: { id: heldD } }).catch(() => null) : null;
    if (hc?.approvedRequestId !== rqD || !rqD) p.push(`approvedRequestId ${short(hc?.approvedRequestId, 30)}`);
    const rc = await call(heldMod, "recallHeldCart", ctxA(DEV1), A("C1"), { id: heldD });
    if (rc?.ok !== true) p.push(`recall → ${codeOf(rc)}`);
    const big = await sell(ctxA(DEV1), A("C1"), { ...CART15, pct: 2000 }, { heldCartId: heldD });
    if (!refused(big.r, "DISCOUNT_EXCEEDS_LIMIT")) p.push(`20% ด้วย heldCartId → ${codeOf(big.r)}`);
    const n0 = (await overrideAudits()).length;
    const ok = await sell(ctxA(DEV1), A("C1"), CART15, { heldCartId: heldD });
    if (ok.r?.ok !== true || ok.r.grandTotalSatang !== 17000) p.push(`15% ด้วย heldCartId → ${codeOf(ok.r)} ${short(ok.r?.message ?? "", 60)}`);
    else {
      const au = (await overrideAudits()).slice(n0);
      const x = au[0];
      if (au.length !== 1 || x.after?.byUserId !== uid("MGR") || x.after?.forUserId !== uid("C1") || x.after?.discountBp !== 1500 || x.after?.requestId !== rqD) p.push(`audit override ${au.length} ${short(x?.after, 120)}`);
      if ((await saleRow(ok.r.saleId))?.soldByUserId !== uid("C1")) p.push("soldBy ไม่ใช่ C1");
    }
    const errs: string[] = [];
    await replay(await approvedEvt(rqD), errs);
    if (errs.length) p.push(errs.slice(0, 2).join(" · "));
    const again = await sell(ctxA(DEV1), A("C1"), CART15, { heldCartId: heldD });
    keep("AP9 ใช้ซ้ำ", again.r);
    if (!refused(again.r, "DISCOUNT_EXCEEDS_LIMIT")) p.push(`ใช้ซ้ำหลังเล่น event ซ้ำ → ${codeOf(again.r)}`);
    const sold = T ? await P.posSale.count({ where: { tenantId: T, docType: "SALE", grandTotalSatang: 17000, soldByUserId: uid("C1"), createdAt: { gte: new Date(Date.now() - HOUR) }, lines: { some: { name: "AP ส่วนลด ฿200" } } } }).catch(() => -1) : -1;
    if (sold !== 1) p.push(`บิลส่วนลดที่อนุมัติ ${sold} (คาด 1)`);
    chk("AP9", NC_ === "" && p.length === 0, "อนุมัติ → ใช้ได้ 1 ครั้งตามที่อนุมัติ · เล่นซ้ำไม่เปิดสิทธิ์ใหม่", FX(NC_ + (p.join(" · ") || "ครบ")));
  }
  // AP10 PIN ผู้จัดการชนะคำขอที่รอ + คืนเงินด้วย PIN
  {
    const p: string[] = [];
    const s180 = await baseSale("s180", { amount: 18000, name: "AP บิล ฿180" });
    const r = await voidBy("C1", s180, {}, "AP10 void ฿180");
    const rq = refused(r, "APPROVAL_REQUIRED") ? String(r.requestId) : "";
    if (!rq) p.push(`void ฿180 → ${codeOf(r)}`);
    const w = await voidBy("C1", s180, { managerPin: "906142", managerUserId: uid("MGR") }, "AP10 PIN ผิด");
    if (!refused(w, "PIN_INVALID")) p.push(`PIN ผิด → ${codeOf(w)}`);
    if ((await saleRow(s180))?.status !== "PAID" || (await reqRow(rq))?.status !== "PENDING") p.push("PIN ผิดแล้วบิล/คำขอเปลี่ยน");
    const n0 = (await audits("pos.approval.pin_override")).length;
    const ok = await voidBy("C1", s180, { managerPin: PIN.MGR, managerUserId: uid("MGR") }, "AP10 PIN ถูก");
    if (ok?.ok !== true) p.push(`PIN ถูก → ${codeOf(ok)}`);
    if ((await saleRow(s180))?.status !== "VOIDED") p.push(`บิล ${(await saleRow(s180))?.status}`);
    if ((await reqRow(rq))?.status !== "CANCELLED") p.push(`คำขอ ${(await reqRow(rq))?.status} (คาด CANCELLED)`);
    const po = (await audits("pos.approval.pin_override")).slice(n0);
    if (po.length !== 1 || po[0].after?.requestId !== rq || po[0].after?.action !== "POS_VOID" || po[0].after?.byUserId !== uid("MGR")) p.push(`pin_override ${po.length} ${short(po[0]?.after, 100)}`);
    if (po[0] && auditLeaks(po[0], [PIN.MGR!]).length) p.push("pin_override มี PIN");
    const av = await audits("pos.sale.void", s180);
    if (av.length !== 1 || av[0].actorId !== uid("MGR")) p.push(`audit void ${av.length} actor ${av[0]?.actorId === uid("C1") ? "C1" : av[0]?.actorId}`);
    const late = await decideAs("MGR", rq, "APPROVED");
    if (late?.ok !== false) p.push("decide หลังยกเลิกคำขอยัง ok");
    await drain();
    if ((await audits("pos.sale.void", s180)).length !== 1) p.push("void ซ้ำหลัง drain");
    // คืนเงินด้วย PIN ขณะมีกติกา POS_REFUND
    const sP = await baseSale("sRfPin", { amount: 9000, name: "AP คืนด้วย PIN" });
    const ln = sP ? ((await P.posSaleLine.findMany({ where: { saleId: sP } }).catch(() => [])) as Any[])[0] : null;
    const n1 = (await audits("pos.approval.pin_override")).length;
    const key = newKey("rfp");
    const rf = keep("AP10 คืนด้วย PIN", await call(refundMod, "refundSale", ctxA(DEV1), A("C1"), { saleId: sP, lines: [{ lineId: ln?.id ?? "none", qty: 1 }], payMethods: [{ type: "CASH", amountSatang: 9000 }], reasonCode: "DAMAGED", idempotencyKey: key, managerPin: PIN.MGR, managerUserId: uid("MGR") }));
    if (rf?.ok !== true) p.push(`คืนด้วย PIN → ${codeOf(rf)}`);
    if (!(await saleByKey(key))) p.push("ไม่มีใบคืน");
    if ((await requestsFor("POS_REFUND", sP)).length) p.push("มีคำขอคืนเงินทั้งที่ใช้ PIN");
    const po2 = (await audits("pos.approval.pin_override")).slice(n1);
    if (po2.length !== 1 || po2[0].after?.requestId !== null || po2[0].after?.action !== "POS_REFUND" || po2[0].after?.byUserId !== uid("MGR")) p.push(`pin_override คืนเงิน ${po2.length} ${short(po2[0]?.after, 100)}`);
    chk("AP10", !!s180 && !!sP && p.length === 0, "PIN ชนะคำขอ (CANCELLED) · audit ผู้จัดการ · คืนด้วย PIN ทันที", FX(p.join(" · ") || "ครบ"));
  }

  // ════════ PN8 ปฏิเสธเป็นข้อมูล + คีย์ข้อความ ════════
  {
    const p: string[] = [];
    const seen = new Set(dataRefusals.map(([, r]) => String(r.code)));
    const miss = NEW_CODES.filter((c) => !seen.has(c));
    if (miss.length) p.push(`ไม่พบ ${miss.join(",")}`);
    for (const [lbl, r] of dataRefusals) {
      if (!NEW_CODES.includes(String(r.code)) && !r.threw) continue;
      const g = goodRefusal(r);
      if (g) p.push(`${lbl}: ${g}`);
    }
    const fn = regShared?.refusalMessageKey;
    let th: Any = null, en: Any = null;
    try {
      th = JSON.parse(rd(F.msgTh) || "null");
      en = JSON.parse(rd(F.msgEn) || "null");
    } catch {
      p.push("อ่าน messages ไม่ได้");
    }
    if (typeof fn !== "function") p.push("ไม่มี refusalMessageKey");
    else {
      const keys = NEW_CODES.map((c) => [c, String(fn(c))] as const);
      for (const [c, k] of keys) {
        if (k === "errors.unknown") p.push(`${c} → errors.unknown`);
        else {
          if (!THAI.test(msgAt(th, k))) p.push(`${c} (${k}) ไม่มีข้อความไทย`);
          if (!msgAt(en, k)) p.push(`${c} (${k}) ไม่มีข้อความอังกฤษ`);
        }
      }
      if (new Set(keys.map(([, k]) => k)).size !== keys.length) p.push("คีย์ข้อความซ้ำกัน");
    }
    chk("PN8", p.length === 0, `${dataRefusals.length} คำปฏิเสธ · ครบ 7 รหัส · ไทย · คีย์ข้อความ th/en`, p.slice(0, 8).join(" · ") + (p.length > 8 ? ` …(+${p.length - 8})` : "") || "ครบ");
  }
}

// ═════════════════════════ 6. คืนสภาพ — ลบร้านชั่วคราวทั้งร้าน + ผู้ใช้ชั่วคราว ═════════════════════════
type WipeReport = { tables: number; left: Record<string, number>; tenantLeft: number; usersLeft: number; err: string };
async function wipeTenant(): Promise<WipeReport> {
  const rep: WipeReport = { tables: 0, left: {}, tenantLeft: 0, usersLeft: 0, err: "" };
  if (T) {
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
    await drain();
    await sleep(300);
    const tables = ((await P.$queryRawUnsafe(
      `SELECT c.table_name AS t FROM information_schema.columns c JOIN information_schema.tables t ON t.table_name = c.table_name AND t.table_schema = c.table_schema
       WHERE c.table_schema = current_schema() AND c.column_name = 'tenantId' AND t.table_type = 'BASE TABLE' ORDER BY 1`,
    )) as Any[]).map((r: Any) => String(r.t));
    rep.tables = tables.length;
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
  }
  // ผู้ใช้ชั่วคราว (User ไม่มี tenantId) — ลบตามอีเมลของรอบนี้เท่านั้น
  try {
    await P.user.deleteMany({ where: { email: { startsWith: EMAIL_PREFIX, endsWith: "@qc.invalid" } } });
    rep.usersLeft = Number(await P.user.count({ where: { email: { startsWith: EMAIL_PREFIX } } }));
  } catch (e) {
    rep.err = [rep.err, `ลบผู้ใช้ไม่ได้: ${(e as Error).message.slice(0, 80)}`].filter(Boolean).join(" · ");
  }
  return rep;
}

// ═════════════════════════ 7. รัน ═════════════════════════
let crashed = "";
let wipe: WipeReport = { tables: 0, left: {}, tenantLeft: 0, usersLeft: 0, err: "" };
try {
  await runStatic();
  await runDb();
} catch (e) {
  crashed = (e as Error)?.stack?.split("\n").slice(0, 3).join(" | ") ?? String(e);
  console.log(`💥 harness: ${crashed}`);
} finally {
  installFetchGuard();
  try {
    wipe = await wipeTenant();
    const residue = Object.values(wipe.left).reduce((a, b) => a + Math.abs(b), 0) + wipe.tenantLeft + wipe.usersLeft;
    console.log(`  ลบร้านชั่วคราว ${T || "(ไม่ได้สร้าง)"}: ${wipe.tables} ตาราง · แถวค้าง ${residue} ${JSON.stringify(wipe.left)} · Tenant ${wipe.tenantLeft} · ผู้ใช้ ${wipe.usersLeft}${wipe.err ? ` · ${wipe.err}` : ""}`);
  } catch (e) {
    wipe.err = `cleanup: ${(e as Error).message.slice(0, 200)}`;
    console.log(`💥 ${wipe.err}`);
  } finally {
    removeFetchGuard();
  }
}
if (guardHits.length) console.log(`  ⚠️  ตัวกั้นเครือข่ายถูกเรียก ${guardHits.length} ครั้ง: ${[...new Set(guardHits)].join(", ")}`);
await sleep(200);
const tempLeft = Object.entries(wipe.left).map(([k, v]) => `${k}:${v}`);
chk("Z1", tempLeft.length === 0 && wipe.tenantLeft === 0 && wipe.usersLeft === 0 && !wipe.err, "ร้านชั่วคราว 0 แถว · Tenant ถูกลบ · ผู้ใช้ชั่วคราว 0",
  [tempLeft.length ? `ร้านชั่วคราวเหลือ ${tempLeft.join(", ")}` : `ร้านชั่วคราว 0 (${wipe.tables} ตาราง)`, wipe.tenantLeft ? "แถว Tenant ยังอยู่" : "", wipe.usersLeft ? `ผู้ใช้เหลือ ${wipe.usersLeft}` : "ผู้ใช้ 0", wipe.err].filter(Boolean).join(" · "));
const countsAfter = await snapshotCounts();
const drift = Object.keys(countsBefore).filter((k) => countsBefore[k] !== countsAfter[k]).map((k) => `${k}:${countsBefore[k]}→${countsAfter[k]}`);
const fpAfter = await fingerprint();
const fpDrift = Object.keys(fpBefore).filter((k) => fpBefore[k] !== fpAfter[k]).map((k) => `${k}:${fpBefore[k]}→${fpAfter[k]}`);
chk("Z2", drift.length === 0 && fpDrift.length === 0 && !Object.values(fpBefore).some((v) => v.startsWith("err")), "ร้าน QC ก่อน = หลัง (นับ + ลายนิ้วมือ)",
  [drift.length ? `นับ: ${drift.join(", ")}` : "นับเท่าเดิม", fpDrift.length ? `ลายนิ้วมือ: ${fpDrift.join(", ")}` : `ลายนิ้วมือเท่าเดิม (${Object.entries(fpAfter).map(([k, v]) => (v.startsWith("err") ? `${k}=${v}` : `${k}=${v.split(":")[0]}`)).join(" ")})`].join(" · "));
for (const [id] of CHECKS) if (!results.has(id)) chk(id, false, "ถูกตรวจ", crashed ? `ไม่ถึง (harness ล้ม: ${crashed.slice(0, 80)})` : "ไม่ถึง");
const failed = [...results.entries()].filter(([, r]) => !r.ok).map(([id]) => id);
console.log(`\n===== ${SUITE} ===== ผ่าน ${results.size - failed.length}/${results.size}${FORCE ? " (QC_FORCE)" : ""}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ suite: SUITE, total: results.size, passed: results.size - failed.length, failed, skipped: false, forced: FORCE, missing: skipReasons, guardHits: guardHits.length, a5: { drift, fpDrift, tempLeft } })}`);
await P.$disconnect?.().catch?.(() => {});
process.exit(failed.length ? 1 : 0);

// ─── หมายเหตุขอบเขต ───
// นอกขอบเขต P1.15: จอ 13B/21A/21B/แผ่นส่วนลดเกิน (P1.15U) · HR→POS PIN sync (H3.x) · ผังพนักงานตอนเปิดกะ (P3) · อนุมัติเปิดลิ้นชัก ·
// ราคาเปิด (openPrice) · ตรวจจับผิดปกติ (P3) · 21C แพ็กสมาชิก (P2) · title/subtitle ของคำขอ (ผู้ตรวจ/visual)
