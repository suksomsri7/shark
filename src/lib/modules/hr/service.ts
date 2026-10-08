import { tenantDb } from "@/lib/core/db";
import { emitOutbox } from "@/lib/core/outbox";
import { writeAudit } from "@/lib/core/audit"; // HF-HR-0 ▸ ประวัติการตัดสินใบลา ◂
import type { HrAttendanceKind, HrLeaveType, Prisma } from "@prisma/client";
import * as approval from "@/lib/modules/approval/service";
import { thaiDateKey } from "@/lib/ui/date";
import { isAvailable as rulesIsAvailable, workedMinutes } from "./rules";
// WO 3.1 — Party (INTEGRATION-MAP §F.1): จาก name/phone/email เท่านั้น — **ห้ามส่ง nationalId/PDPA อื่น**
// เรียกผ่าน facade เท่านั้น (F2.2)
import * as party from "@/lib/modules/party";
// HR H0.5 ▸ PIN (hash · ไม่ซ้ำทั้งร้าน · ทางเก่า) อยู่ที่ pin.ts ที่เดียว — ไฟล์นี้ไม่แตะคอลัมน์ PIN เอง (F16.5) ◂
import { activateEmployeeKeepingPinUnique, hasPin, PIN_SELECT, pinOfInput, setPin, verifyPinForEmployee, type PinInput } from "./pin";
export { setPin } from "./pin"; // HR H0.5 ▸ ย้ายไป pin.ts · ผู้เรียกเดิม (actions · seed · oracle) import จากที่นี่ได้ตามเดิม ◂

// HR (ระบบที่ 17) — service ชั้นประกอบ (systemId-scoped)
// ⚠️ กติกา availability + ชั่วโมงทำงาน มาจาก rules.ts (สมอง FREEZE) — ที่นี่แค่โหลด DB แล้วเรียกใช้
//    contract C-2: availability เป็นของ HR เท่านั้น (ระบบอื่นถาม ห้าม copy สูตร)
// scope: ทุก query ผ่าน tenantDb({ tenantId, systemId }) — inject tenantId+systemId อัตโนมัติ

export type Ctx = { tenantId: string; systemId: string };

// แปลง "YYYY-MM-DD" → Date เที่ยงคืน UTC (ตรงกับ @db.Date + rules ที่ตัด ISO 10 ตัวแรก)
//   รับ Date มาแล้วก็ได้ (เช่น จาก server action ที่ parse เอง) → ใช้ตรง ๆ
const toDbDate = (s: string | Date): Date => (s instanceof Date ? s : new Date(`${s}T00:00:00Z`));

// ── พนักงาน ──
// HR H0.5 ▸ PIN ของพนักงานใหม่ = `pin` (`pinCode` ชื่อเก่ายังรับ — ทั้งสองทางผ่าน setPin = hash เสมอ ไม่เก็บตัวเปล่า) ◂
export type CreateEmployeeInput = {
  name: string;
  phone?: string | null;
  position?: string | null;
} & PinInput;

/**
 * สร้างพนักงาน แล้วค่อยตั้ง PIN (ถ้ามี) ผ่าน setPin — คนละคำสั่ง (ไม่ต้องอยู่ tx เดียว)
 * HR H0.5 ▸ PIN ใช้ไม่ได้ (ซ้ำในร้าน / รูปแบบผิด / ยังไม่ตั้งค่า pepper) ⇒ พนักงานยังถูกสร้าง · ผลมี pinSet:false + reason
 *   ให้หน้าจอบอกได้ว่า "สร้างแล้ว แต่ PIN นี้ใช้ไม่ได้" ◂
 */
export async function createEmployee(
  ctx: Ctx,
  input: CreateEmployeeInput,
): Promise<{ id: string; pinSet?: boolean; reason?: string }> {
  const name = input.name.trim();
  // WO 3.1 (MAP §F.1) — เชื่อม Party จาก name/phone เท่านั้น · ล้มเหลว = partyId null (ไม่ throw)
  const partyId = await party.safeFindOrCreate(ctx.tenantId, {
    name,
    phone: input.phone ?? null,
    kind: "PERSON",
  });
  const e = await tenantDb(ctx).hrEmployee.create({
    data: {
      tenantId: ctx.tenantId,
      systemId: ctx.systemId,
      name,
      phone: input.phone?.trim() || null,
      position: input.position?.trim() || null,
      partyId,
      // active = true (default ใน schema)
    },
  });
  const pin = pinOfInput(input);
  if (!pin) return { id: e.id };
  const pr = await setPin(ctx, e.id, pin);
  return pr.ok ? { id: e.id, pinSet: true } : { id: e.id, pinSet: false, reason: pr.reason };
}

export async function listEmployees(ctx: Ctx, take = 200) {
  return tenantDb(ctx).hrEmployee.findMany({
    where: { active: true },
    orderBy: { createdAt: "asc" },
    take,
  });
}

/** พนักงานที่ถูกลบแล้ว (soft delete) — ยังอยู่ในฐานเพื่อให้ประวัติลงเวลา/ลา/เงินเดือนอ่านได้ */
export async function listRemovedEmployees(ctx: Ctx, take = 200) {
  return tenantDb(ctx).hrEmployee.findMany({
    where: { active: false },
    orderBy: { updatedAt: "desc" },
    take,
  });
}

export type UpdateEmployeeInput = { name?: string; phone?: string | null; position?: string | null };

/** แก้ข้อมูลพื้นฐานของพนักงาน (ชื่อ/ตำแหน่ง/เบอร์) — เดิมกรอกตอนสร้างแล้วแก้ไม่ได้เลย */
export async function updateEmployee(
  ctx: Ctx,
  employeeId: string,
  input: UpdateEmployeeInput,
): Promise<{ ok: boolean; reason?: string }> {
  const name = input.name?.trim();
  if (input.name !== undefined && !name) return { ok: false, reason: "ต้องมีชื่อพนักงาน" };
  const emp = await tenantDb(ctx).hrEmployee.findFirst({ where: { id: employeeId } });
  if (!emp) return { ok: false, reason: "ไม่พบพนักงาน" };
  await tenantDb(ctx).hrEmployee.updateMany({
    where: { id: employeeId },
    data: {
      ...(name ? { name } : {}),
      ...(input.position !== undefined ? { position: input.position?.trim() || null } : {}),
      ...(input.phone !== undefined ? { phone: input.phone?.trim() || null } : {}),
    },
  });
  return { ok: true };
}

// ─────────── ทะเบียนพนักงานเต็มรูปแบบ (13 ส.ค. 2026 · เจ้าของสั่งข้อ 8) ───────────
// 🔒 ฟิลด์อ่อนไหว (PDPA) = เลขบัตร ประกันสังคม ทะเบียนบ้าน บัญชีธนาคาร + เอกสารแนบ
//    ชั้นหน้าจอ/action กันด้วยสิทธิ์เดียวกับเงินเดือน (canViewPayroll) — service ไม่ตัดสินสิทธิ์เอง
//    แต่ประกาศไว้ที่นี่ที่เดียวว่า "ช่องไหนอ่อนไหว" เพื่อไม่ให้แต่ละหน้าจำเอง (ลืม = ข้อมูลรั่ว)
export const SENSITIVE_EMPLOYEE_FIELDS = [
  "nationalId",
  "ssoNumber",
  "houseRegAddress",
  "bankName",
  "bankAccountNo",
  "bankAccountName",
] as const;

export type EmployeeProfileInput = {
  // ทั่วไป
  name?: string;
  nickname?: string | null;
  code?: string | null;
  phone?: string | null;
  email?: string | null;
  gender?: "MALE" | "FEMALE" | "OTHER" | null;
  birthDate?: string | null; // "YYYY-MM-DD"
  maritalStatus?: "SINGLE" | "MARRIED" | "DIVORCED" | "WIDOWED" | "OTHER" | null;
  // งาน
  position?: string | null;
  department?: string | null;
  employmentType?: "FULL_TIME" | "PART_TIME" | "CONTRACT" | "DAILY" | "PROBATION" | null;
  startDate?: string | null;
  endDate?: string | null;
  // ที่อยู่
  addressLine?: string | null;
  subdistrict?: string | null;
  district?: string | null;
  province?: string | null;
  postcode?: string | null;
  // ผู้ติดต่อฉุกเฉิน
  emergencyName?: string | null;
  emergencyPhone?: string | null;
  emergencyRelation?: string | null;
  note?: string | null;
  // 🔒 อ่อนไหว
  nationalId?: string | null;
  ssoNumber?: string | null;
  houseRegAddress?: string | null;
  bankName?: string | null;
  bankAccountNo?: string | null;
  bankAccountName?: string | null;
};

/** พนักงาน 1 คนพร้อมเอกสารแนบ (ใช้ในหน้าโปรไฟล์) */
export async function getEmployee(ctx: Ctx, employeeId: string) {
  return tenantDb(ctx).hrEmployee.findFirst({
    where: { id: employeeId },
    include: { docs: { orderBy: { createdAt: "desc" } } },
  });
}

const dateOrNull = (v: string | null | undefined): Date | null | undefined => {
  if (v === undefined) return undefined;
  const s = v?.trim();
  if (!s) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T00:00:00Z`) : undefined;
};
const strOrNull = (v: string | null | undefined): string | null | undefined =>
  v === undefined ? undefined : v?.trim() || null;

/**
 * บันทึกโปรไฟล์พนักงาน — ส่งมาช่องไหนแก้ช่องนั้น (ช่องที่ไม่ส่ง = ไม่แตะ)
 * 🔴 ผู้เรียกต้องกรองฟิลด์อ่อนไหวออกก่อน ถ้าผู้ใช้ไม่มีสิทธิ์ (ดู SENSITIVE_EMPLOYEE_FIELDS)
 */
export async function saveEmployeeProfile(
  ctx: Ctx,
  employeeId: string,
  input: EmployeeProfileInput,
): Promise<{ ok: boolean; reason?: string }> {
  const emp = await tenantDb(ctx).hrEmployee.findFirst({ where: { id: employeeId } });
  if (!emp) return { ok: false, reason: "ไม่พบพนักงาน" };
  const name = input.name?.trim();
  if (input.name !== undefined && !name) return { ok: false, reason: "ต้องมีชื่อพนักงาน" };
  const nid = strOrNull(input.nationalId);
  if (nid && !/^\d{13}$/.test(nid.replace(/\D/g, "")) ) {
    return { ok: false, reason: "เลขบัตรประชาชนต้องเป็นตัวเลข 13 หลัก" };
  }
  const bd = dateOrNull(input.birthDate);
  const sd = dateOrNull(input.startDate);
  const ed = dateOrNull(input.endDate);
  if (bd === undefined && input.birthDate !== undefined) return { ok: false, reason: "วันเกิดไม่ถูกต้อง" };
  if (sd === undefined && input.startDate !== undefined) return { ok: false, reason: "วันเริ่มงานไม่ถูกต้อง" };
  if (ed === undefined && input.endDate !== undefined) return { ok: false, reason: "วันสิ้นสุดงานไม่ถูกต้อง" };
  const startCmp = sd ?? emp.startDate;
  const endCmp = ed ?? emp.endDate;
  if (startCmp && endCmp && endCmp < startCmp) {
    return { ok: false, reason: "วันสิ้นสุดงานต้องไม่ก่อนวันเริ่มงาน" };
  }

  // WO 3.1 — เติม partyId ให้พนักงานเก่าที่ยังไม่มี จาก name/phone/email เท่านั้น (**ห้าม** nationalId/PDPA อื่น)
  let partyId = emp.partyId;
  if (!partyId) {
    const effName = name ?? emp.name;
    const effPhone = input.phone !== undefined ? strOrNull(input.phone) : emp.phone;
    const effEmail = input.email !== undefined ? strOrNull(input.email) : emp.email;
    if (effName || effPhone || effEmail) {
      partyId = await party.safeFindOrCreate(ctx.tenantId, {
        name: effName || effPhone || effEmail || "",
        phone: effPhone,
        email: effEmail,
        kind: "PERSON",
      });
    }
  }

  await tenantDb(ctx).hrEmployee.updateMany({
    where: { id: employeeId },
    data: {
      ...(name ? { name } : {}),
      ...(input.nickname !== undefined ? { nickname: strOrNull(input.nickname) } : {}),
      ...(input.code !== undefined ? { code: strOrNull(input.code) } : {}),
      ...(input.phone !== undefined ? { phone: strOrNull(input.phone) } : {}),
      ...(input.email !== undefined ? { email: strOrNull(input.email) } : {}),
      ...(input.gender !== undefined ? { gender: input.gender } : {}),
      ...(bd !== undefined ? { birthDate: bd } : {}),
      ...(input.maritalStatus !== undefined ? { maritalStatus: input.maritalStatus } : {}),
      ...(input.position !== undefined ? { position: strOrNull(input.position) } : {}),
      ...(input.department !== undefined ? { department: strOrNull(input.department) } : {}),
      ...(input.employmentType !== undefined ? { employmentType: input.employmentType } : {}),
      ...(sd !== undefined ? { startDate: sd } : {}),
      ...(ed !== undefined ? { endDate: ed } : {}),
      ...(input.addressLine !== undefined ? { addressLine: strOrNull(input.addressLine) } : {}),
      ...(input.subdistrict !== undefined ? { subdistrict: strOrNull(input.subdistrict) } : {}),
      ...(input.district !== undefined ? { district: strOrNull(input.district) } : {}),
      ...(input.province !== undefined ? { province: strOrNull(input.province) } : {}),
      ...(input.postcode !== undefined ? { postcode: strOrNull(input.postcode) } : {}),
      ...(input.emergencyName !== undefined ? { emergencyName: strOrNull(input.emergencyName) } : {}),
      ...(input.emergencyPhone !== undefined ? { emergencyPhone: strOrNull(input.emergencyPhone) } : {}),
      ...(input.emergencyRelation !== undefined ? { emergencyRelation: strOrNull(input.emergencyRelation) } : {}),
      ...(input.note !== undefined ? { note: strOrNull(input.note) } : {}),
      ...(input.nationalId !== undefined ? { nationalId: nid } : {}),
      ...(input.ssoNumber !== undefined ? { ssoNumber: strOrNull(input.ssoNumber) } : {}),
      ...(input.houseRegAddress !== undefined ? { houseRegAddress: strOrNull(input.houseRegAddress) } : {}),
      ...(input.bankName !== undefined ? { bankName: strOrNull(input.bankName) } : {}),
      ...(input.bankAccountNo !== undefined ? { bankAccountNo: strOrNull(input.bankAccountNo) } : {}),
      ...(input.bankAccountName !== undefined ? { bankAccountName: strOrNull(input.bankAccountName) } : {}),
      ...(partyId ? { partyId } : {}),
    },
  });
  return { ok: true };
}

/** แนบเอกสาร (สำเนาบัตร/ทะเบียนบ้าน/สัญญา) — 🔒 ผู้เรียกต้องเช็คสิทธิ์ก่อน */
export async function addEmployeeDoc(
  ctx: Ctx,
  employeeId: string,
  input: { kind: string; title: string; url: string; note?: string | null },
): Promise<{ ok: boolean; reason?: string }> {
  const emp = await tenantDb(ctx).hrEmployee.findFirst({ where: { id: employeeId } });
  if (!emp) return { ok: false, reason: "ไม่พบพนักงาน" };
  const title = input.title.trim();
  const url = input.url.trim();
  if (!title) return { ok: false, reason: "ตั้งชื่อเอกสารก่อน" };
  // รับเฉพาะลิงก์ที่ปลอดภัย (บทเรียน stored XSS จากไฟล์แนบเคส support 31 ก.ค.)
  if (!/^https?:\/\//i.test(url) && !/^data:image\//i.test(url)) {
    return { ok: false, reason: "ลิงก์ต้องเป็น http(s) หรือรูปภาพ" };
  }
  const KINDS = ["ID_CARD", "HOUSE_REG", "CONTRACT", "CERTIFICATE", "SSO_FORM", "BANK_BOOK", "OTHER"];
  const kind = (KINDS.includes(input.kind) ? input.kind : "OTHER") as "OTHER";
  await tenantDb(ctx).hrEmployeeDoc.create({
    data: { ...ctx, employeeId, kind, title, url, note: input.note?.trim() || null },
  });
  return { ok: true };
}

export async function removeEmployeeDoc(ctx: Ctx, docId: string): Promise<{ ok: boolean }> {
  await tenantDb(ctx).hrEmployeeDoc.deleteMany({ where: { id: docId } });
  return { ok: true };
}

/**
 * ลบ / กู้คืนพนักงาน — 🔴 soft delete เท่านั้น (active=false)
 * เหตุผล: บันทึกลงเวลา ใบลา สลิปเงินเดือน และนัดในระบบจองอ้างถึงคนนี้อยู่
 * ลบจริงจะทำให้ประวัติที่ผ่านมาอ่านไม่ได้ (และบิล/บัญชีที่ปิดไปแล้วต้องนิ่ง)
 * ผลข้างเคียงที่ตั้งใจ: ระบบจองคิวมองคนที่ถูกลบเป็น "ไม่รับคิว" อัตโนมัติ (ถามผ่าน employeesUnavailable)
 */
export async function setEmployeeActive(
  ctx: Ctx,
  employeeId: string,
  active: boolean,
): Promise<{ ok: boolean; reason?: string; name?: string; pinCleared?: boolean }> {
  const emp = await tenantDb(ctx).hrEmployee.findFirst({ where: { id: employeeId }, select: { id: true, name: true } });
  if (!emp) return { ok: false, reason: "ไม่พบพนักงาน" };
  if (!active) {
    // พ้นสภาพ = ออกจากดัชนี PIN (WHERE active) ⇒ PIN ของคนนี้ว่างให้คนอื่นตั้งได้ · hash ยังเก็บไว้ (กลับมาแล้วไม่ชน = ใช้ต่อได้)
    await tenantDb(ctx).hrEmployee.updateMany({ where: { id: employeeId }, data: { active } });
    return { ok: true, name: emp.name };
  }
  // HR H0.5 ▸ R4: กลับมาทำงานแล้ว PIN เดิมชนกับคนที่ตั้งไประหว่างนั้น ⇒ ล้าง PIN ของคนที่กลับมา (ต้องตั้งใหม่) ไม่ล้มทั้งคำสั่ง ◂
  const r = await activateEmployeeKeepingPinUnique(ctx, employeeId);
  if (r.count !== 1) return { ok: false, reason: "ไม่พบพนักงาน" };
  return r.pinCleared ? { ok: true, name: emp.name, pinCleared: true } : { ok: true, name: emp.name };
}

// HR H0.3 ▸ หน้าต่างกันแตะซ้ำ (วินาที) ต่อพนักงาน — ดู clock() ◂
export const CLOCK_DEDUPE_SEC = 60;

/** ปฏิเสธการลงเวลา — ข้อความไทยคงที่ (action ส่งต่อให้ผู้ใช้ได้โดยไม่ต้องอ่าน e.message ของระบบอื่น) */
export class ClockRefusedError extends Error {
  constructor(readonly reason: "ไม่พบพนักงาน") {
    super(reason);
    this.name = "ClockRefusedError";
  }
}

export type ClockOutcome = {
  id: string;
  kind: HrAttendanceKind;
  at: Date;
  judgement: AttendanceJudgement | null;
  lateMin: number | null;
  /** true = แตะซ้ำภายใน CLOCK_DEDUPE_SEC ⇒ ไม่เพิ่มแถว · id/kind/at คือของแถวล่าสุดที่มีอยู่แล้ว */
  deduped: boolean;
  employeeName: string;
};

// ── ลงเวลา (IN/OUT) ──
// เข้างาน = ตัดสินทันทีเทียบกับตารางของวันนั้น แล้ว **เก็บคำตัดสินติดแถวไว้** (snapshot)
//   ทำไมไม่คิดสดตอนอ่าน: ร้านแก้ตารางเดือนหน้า ไม่ควรย้อนไปเปลี่ยนว่าเมื่อวานใครสาย
//   (บทเรียนเดียวกับ Appointment.priceSatang — ประวัติต้องนิ่ง)
// ออกงาน = ไม่ตัดสิน (judgement null) — "ออกก่อนเวลา" ยังไม่ใช่สัญญาที่เจ้าของสั่ง
//
// HR H0.3 ▸ แตะครั้งเดียว = แถวเดียว (D13a) + พนักงานต้องเป็นของระบบ HR นี้ (X2)
//   ทั้งฟังก์ชันอยู่ในธุรกรรมเดียวของ tenantDb · ล็อกต่อพนักงานด้วย pg_advisory_xact_lock('hr:clock:<employeeId>') ⇒ แตะพร้อมกัน
//   (ข้าม instance ได้ เพราะล็อกอยู่ที่ฐาน) ต่อคิวกัน แล้วอ่านแถวล่าสุดของคนนี้ "ใต้ล็อก" ก่อนตัดสินใจ:
//   · kind "NEXT" (kiosk/PIN): แถวล่าสุดอายุ < CLOCK_DEDUPE_SEC (ชนิดใดก็ได้) = ไม่เพิ่มแถว คืนแถวนั้น (deduped) ⇒ แตะเบิ้ลไม่กลายเป็นออกงาน
//     ไม่งั้นเลือกเข้า/ออกจากแถวล่าสุดตั้งแต่ 00:00 เวลาไทย (กติกาเดียวกับ nextClockKind — ตัดสินใต้ล็อกเดียวกัน)
//   · kind IN/OUT (ทางตรง): ชนิดเดียวกันอายุ < CLOCK_DEDUPE_SEC = ไม่เพิ่มแถว · ชนิดตรงข้ามบันทึกได้ (ผู้จัดการแก้)
//   🔴 ทุกคำสั่งในธุรกรรมใช้ tx (บทเรียน HF-HR-0 รอบ 5d: connection ที่สองระหว่างถือล็อก = pool ตัน) — ตารางงานจึงอ่านผ่าน tx ไม่ใช่ getSchedule
//   ปฏิเสธ (ไม่พบพนักงานในระบบนี้ / พ้นสภาพเมื่อ requireActive) = throw ClockRefusedError ข้อความไทยคงที่ ⇒ ไม่มีแถว ◂
export async function clock(
  ctx: Ctx,
  input: { employeeId: string; kind: HrAttendanceKind | "NEXT"; note?: string | null; requireActive?: boolean },
): Promise<ClockOutcome> {
  const scope = { tenantId: ctx.tenantId, systemId: ctx.systemId };
  return tenantDb(ctx).$transaction(
    async (t) => {
      const tx = t as unknown as Prisma.TransactionClient;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`hr:clock:${input.employeeId}`}, 0))`;
      const emp = await tx.hrEmployee.findFirst({
        where: { ...scope, id: input.employeeId, ...(input.requireActive ? { active: true } : {}) },
        select: { id: true, name: true },
      });
      if (!emp) throw new ClockRefusedError("ไม่พบพนักงาน");
      const at = new Date();
      const last = await tx.hrAttendance.findFirst({
        where: { ...scope, employeeId: emp.id },
        orderBy: { at: "desc" },
        select: { id: true, kind: true, at: true, judgement: true, lateMin: true },
      });
      const fresh = !!last && at.getTime() - last.at.getTime() < CLOCK_DEDUPE_SEC * 1000;
      if (last && fresh && (input.kind === "NEXT" || input.kind === last.kind)) {
        return { id: last.id, kind: last.kind, at: last.at, judgement: last.judgement, lateMin: last.lateMin, deduped: true, employeeName: emp.name };
      }
      const kind: HrAttendanceKind = input.kind === "NEXT" ? kindAfter(last, at) : input.kind;
      let detail: ClockInDetail | null = null;
      if (kind === "IN") {
        const w = bkkParts(at).weekday;
        const r = await tx.hrWorkSchedule.findFirst({
          where: { ...scope, employeeId: emp.id, weekday: w },
          select: { weekday: true, dayOff: true, startMin: true, endMin: true, graceMin: true },
        });
        detail = clockInDetail(at, r ?? null);
      }
      const a = await tx.hrAttendance.create({
        data: {
          ...scope,
          employeeId: emp.id,
          kind,
          at,
          note: input.note?.trim() || null,
          judgement: detail?.judgement ?? null,
          dueMin: detail?.dueMin ?? null,
          lateMin: detail?.lateMin ?? null,
        },
        select: { id: true },
      });
      return { id: a.id, kind, at, judgement: detail?.judgement ?? null, lateMin: detail?.lateMin ?? null, deduped: false, employeeName: emp.name };
    },
    { maxWait: 5_000, timeout: 10_000 },
  );
}

/** ครั้งถัดไปควรเป็นเข้าหรือออก จากแถวล่าสุด — มีแถว IN ตั้งแต่ 00:00 เวลาไทยของวันนี้ = ออก · นอกนั้น = เข้า */
function kindAfter(last: { kind: HrAttendanceKind; at: Date } | null, now: Date): HrAttendanceKind {
  const dayStart = new Date(`${bkkParts(now).dateStr}T00:00:00+07:00`);
  return last && last.at >= dayStart && last.kind === "IN" ? "OUT" : "IN";
}

// ─────────────────── kiosk: พนักงานกดลงเวลาเองด้วย PIN (13 ส.ค. 2026) ───────────────────
// เดิมมีแต่หน้าที่เจ้าของกดลงเวลา "แทน" พนักงาน (ใครกดก็ได้ ไม่มีการยืนยันตัวตน)
// kiosk = เปิดหน้านี้ค้างไว้บนแท็บเล็ตหน้าร้าน · พนักงานเลือกชื่อ + ใส่ PIN ของตัวเอง
// PIN = รหัสหน้าประตู 4-6 หลัก (ไม่ใช่รหัสผ่านบัญชี) · กันเดาด้วย rate limit ที่ชั้น action (ห้ามยิงรัว)
// HR H0.5 ▸ เดิมเก็บเป็นข้อความ (เจ้าของดูได้) — ตอนนี้เก็บเป็น hash ไม่มีใครดูได้ (ลืม = ตั้งใหม่) · ไม่ซ้ำทั้งร้าน ◂

// HR H0.5 ▸ setPin (ตั้ง/ล้าง PIN) ย้ายไป pin.ts — เก็บเป็น hash · ไม่ซ้ำทั้งร้าน (partial unique) · re-export ที่หัวไฟล์ ◂

/** ครั้งถัดไปของวันนี้ (เวลาไทย) ควรเป็นเข้าหรือออก — พนักงานไม่ต้องเลือกเอง
 *  HR H0.3 ▸ ใช้แสดงผลเท่านั้น · การลงเวลาจริงตัดสินซ้ำใต้ล็อกใน clock(kind "NEXT") ด้วย kindAfter ตัวเดียวกัน ◂ */
export async function nextClockKind(ctx: Ctx, employeeId: string): Promise<HrAttendanceKind> {
  const now = new Date();
  const last = await tenantDb(ctx).hrAttendance.findFirst({
    where: { employeeId },
    orderBy: { at: "desc" },
    select: { kind: true, at: true },
  });
  return kindAfter(last, now);
}

export type KioskClockResult =
  | {
      ok: true;
      employeeName: string;
      kind: HrAttendanceKind;
      at: Date;
      judgement: AttendanceJudgement | null;
      lateMin: number | null;
      /** HR H0.3 ▸ แตะซ้ำภายใน CLOCK_DEDUPE_SEC — ไม่มีแถวใหม่ kind/at = ของแถวที่ลงไว้แล้ว ◂ */
      deduped: boolean;
    }
  | { ok: false; reason: string };

/**
 * พนักงานลงเวลาเองด้วย PIN — ไม่บอกว่า "PIN ผิด" หรือ "คนนี้ไม่มี PIN" แยกกันเวลาเดาไม่ได้อยู่แล้ว
 * เพราะเลือกชื่อจากรายชื่อบนจอ (ไม่ใช่ระบบล็อกอิน) แต่ยังบอกให้ชัดว่าเกิดอะไรขึ้นเพื่อไม่ให้คนงง
 */
export async function clockWithPin(ctx: Ctx, employeeId: string, pin: string): Promise<KioskClockResult> {
  // HR H0.5 ▸ เทียบ PIN ที่ pin.ts (hash · เวลาคงที่ · ทางเก่าอัปเกรดเอง) — ข้อความเดิม: ไม่พบ / "<ชื่อ> ยังไม่มี PIN — …" / "PIN ไม่ถูกต้อง" ◂
  const emp = await verifyPinForEmployee(ctx, employeeId, pin);
  if (!emp.ok) return { ok: false, reason: emp.reason };
  // HR H0.3 ▸ เลือกเข้า/ออก + กันแตะซ้ำ ใต้ล็อกเดียวกันใน clock (เดิมอ่าน nextClockKind แล้วค่อยเขียน ⇒ แตะเบิ้ล = เข้า+ออก) ◂
  let res: ClockOutcome;
  try {
    res = await clock(ctx, { employeeId: emp.employeeId, kind: "NEXT", requireActive: true });
  } catch (e) {
    if (e instanceof ClockRefusedError) return { ok: false, reason: "ไม่พบพนักงาน" };
    throw e;
  }
  return { ok: true, employeeName: emp.name, kind: res.kind, at: res.at, judgement: res.judgement, lateMin: res.lateMin, deduped: res.deduped };
}

/** รายชื่อสำหรับจอ kiosk — บอกด้วยว่าใครยังไม่ได้ตั้ง PIN (เจ้าของจะรู้ว่าต้องไปตั้ง) */
export async function kioskRoster(ctx: Ctx) {
  const emps = await tenantDb(ctx).hrEmployee.findMany({
    where: { active: true },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, position: true, ...PIN_SELECT },
  });
  return emps.map((e) => ({ id: e.id, name: e.name, position: e.position, hasPin: hasPin(e) })); // HR H0.5 ▸ hash หรือตัวเปล่า (ช่วง rollout) ◂
}

// ── ลา ──
export type RequestLeaveInput = {
  employeeId: string;
  type: HrLeaveType;
  fromDate: string | Date; // "YYYY-MM-DD" หรือ Date สำเร็จรูป
  toDate: string | Date;
  reason?: string | null;
};

export async function requestLeave(ctx: Ctx, input: RequestLeaveInput): Promise<{ id: string }> {
  // HF-HR-0 ▸ รอบ 5c (F2): ใบลา + event + คำขอในสายอนุมัติ (ถ้ามีสาย) เกิดใน **ธุรกรรมเดียว** — เดิมเป็นคนละคำสั่ง ⇒ ทางตรง (decideLeave)
  //   ที่ตัดสินในช่วงระหว่างนั้นไม่เห็นคำขอ จึงตัดสินได้ แล้วคำขอก็ยังถูกสร้าง (สาย PENDING/REJECTED + ใบลา APPROVED) · ลำดับ event เดิม
  //   (hr.leave.submitted ก่อน approval.request.submitted) · ใช้ tx จาก tenantDb (ไม่ลาก prisma ดิบเข้ามา — fitness F5.1) ◂
  const policy = await approval.resolvePolicy({ tenantId: ctx.tenantId }, { entityType: "HrLeave", systemId: ctx.systemId });
  return tenantDb(ctx).$transaction(async (t) => {
  const tx = t as unknown as Prisma.TransactionClient;
  const l = await tx.hrLeave.create({
    data: {
      tenantId: ctx.tenantId,
      systemId: ctx.systemId,
      employeeId: input.employeeId,
      type: input.type,
      fromDate: toDbDate(input.fromDate),
      toDate: toDbDate(input.toDate),
      reason: input.reason?.trim() || null,
      // status = PENDING (default ใน schema)
    },
  });
  // K3.3 (§9.2) — บอกทั้งระบบว่า "มีคนยื่นใบลา" หลังแถวถูกเขียนแล้ว
  //   ปลายทางที่รออยู่ = สะพานบอร์ดงาน (`platform/kanban-bridges#onLeaveSubmitted` เปิดการ์ด "หาคนแทน")
  //   + กฎอัตโนมัติของร้าน + เว็บฮุคขาออก
  //   🔴 event ใหม่ต้องลงทะเบียน **3 ที่พร้อมกัน**: consumer (`outbox-consumers.ts`) ·
  //      `AUTOMATION_EVENTS` · `WEBHOOK_EVENTS` — ขาดที่ใดที่หนึ่ง = event ค้าง PENDING แล้ว
  //      คิวทั้งระบบตันเงียบ ๆ (`reference_outbox_new_event_needs_consumer`)
  //   idempotencyKey ผูก leaveId ⇒ ใบลา 1 ใบ = event 1 ใบตลอดกาล (ยิงซ้ำไม่เพิ่มแถว)
  //   HF-HR-0 รอบ 5c: ยิงใน tx ของ tenantDb เดียวกับแถวใบลาแล้ว (เดิม emitOutboxOutsideTx — ไม่ atomic)
  await emitOutbox(tx, {
    tenantId: ctx.tenantId,
    type: "hr.leave.submitted",
    idempotencyKey: `hr.leave.submitted#${l.id}`,
    payload: {
      leaveId: l.id,
      employeeId: input.employeeId,
      fromDate: toDbDate(input.fromDate).toISOString(),
      toDate: toDbDate(input.toDate).toISOString(),
      type: input.type,
    },
    systemId: ctx.systemId,
  });
  // WO-0049b: มีสายอนุมัติใบลา → ยื่นเข้าสาย (ใบลาคง PENDING จน effect ตัดสินหลังอนุมัติ/ปฏิเสธ)
  //   ไม่มีสายอนุมัติ → พฤติกรรมเดิม (ใบลารอ decideLeave ด้วยมือตามเดิม)
  if (policy) {
    await approval.submitForApproval(
      { tenantId: ctx.tenantId },
      { entityType: "HrLeave", entityId: l.id, systemId: ctx.systemId, requestedById: input.employeeId },
      { tx },
    );
  }
  return { id: l.id };
  });
}

// อนุมัติ/ปฏิเสธการลา — availability เปลี่ยนเฉพาะเมื่อ APPROVED (C-2)
// HF-HR-0 (D10 · มติผู้คุมงาน C1): ทางที่อนุญาต = PENDING → APPROVED/REJECTED · APPROVED → REJECTED (ถอนอนุมัติ = "เปลี่ยนใจ"
//   ช่องจองกลับมาเอง · qc-hr-leave-booking LV-9) — นอกนั้นปฏิเสธ · ผู้ตัดสินต้องไม่ใช่เจ้าของใบลา ·
//   ใบที่อยู่ในสายอนุมัติต้องตัดสินที่สายอนุมัติ (effect ใน approval-effects.ts เขียนใบลาเอง) ·
//   ใบที่อนุมัติผ่านสายแล้ว ถอนทางตรงไม่ได้ (approval core ยังไม่มีทางถอนผล)
//   ⚠️ ตรวจ "ตัดสินใบของตัวเอง" ได้เฉพาะพนักงานที่ผูกบัญชีผู้ใช้ (linkedUserId) — ใบของพนักงานที่ไม่ผูกบัญชี ตรวจไม่ได้
//   ไม่ผ่าน = โยน HrLeaveDecisionError (ข้อความไทย) — ผู้เรียกเดิม (action/bulk/ข้อเสนอ AI) โยนต่อ/เก็บเหตุผลได้ตามเดิม
//   ทุกการตัดสิน/ถอน = AuditLog 1 แถว (before/after: สถานะ + ผู้ตัดสิน) — ผู้อนุมัติเดิมไม่หายแม้ถูกถอน
export class HrLeaveDecisionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HrLeaveDecisionError";
  }
}
const LEAVE_STATUS_TH: Record<string, string> = { APPROVED: "อนุมัติแล้ว", REJECTED: "ไม่อนุมัติแล้ว", CANCELLED: "ยกเลิกแล้ว" };
const LEAVE_STALE = "สถานะใบลาเปลี่ยนไปแล้ว กรุณาเปิดดูใหม่";

export async function decideLeave(
  ctx: Ctx,
  leaveId: string,
  status: "APPROVED" | "REJECTED",
  decidedById?: string | null,
  // from = สถานะที่ผู้ตัดสินเห็นบนจอ · ไม่ส่ง: มีผู้ตัดสิน (คน/ข้อเสนอ AI) = ถือว่าเห็น "รออนุมัติ" ·
  //   ไม่มีผู้ตัดสินเลย (งานภายใน/ผู้เรียกรุ่นเก่า) = ใช้สถานะปัจจุบัน
  opts: { from?: "PENDING" | "APPROVED" } = {},
): Promise<void> {
  // HF-HR-0 ▸ รอบ 4 (R4.2): ผู้เรียกที่ "ส่งช่องผู้ตัดสินมาแต่ว่าง" (null / สตริงว่าง = ไม่รู้ว่าใครตัดสิน) ห้ามตัดสินทุกทาง —
  //   กติกาห้ามตัดสินใบของตัวเอง + การถอนอนุมัติ ต้องรู้ตัวผู้ตัดสิน · ผู้เรียกใน src ทุกจุดส่ง user id จริง (oracle S-14) ·
  //   ไม่ส่งช่องนี้เลย (undefined) = งานภายใน/ข้อสอบรุ่นเก่า (qc-hr · qc-hr-attendance · qc-hr-leave-booking LV-9) คงพฤติกรรมเดิม ◂
  if (decidedById !== undefined && !(typeof decidedById === "string" && decidedById.trim())) {
    throw new HrLeaveDecisionError("ระบบไม่ทราบผู้ตัดสินใบลานี้ จึงยังบันทึกผลไม่ได้ — กรุณาอนุมัติใบลาในหน้าระบบพนักงาน");
  }
  const db = tenantDb(ctx);
  const leave = await db.hrLeave.findFirst({
    where: { id: leaveId },
    select: { status: true, decidedById: true, employee: { select: { linkedUserId: true } } },
  });
  if (!leave) throw new HrLeaveDecisionError("ไม่พบใบลา หรืออยู่นอกร้านนี้");
  const from = opts.from ?? (decidedById ? "PENDING" : leave.status);
  // ข้อเสนอ/หน้าจอที่ค้าง (เห็นสถานะหนึ่ง แต่ตอนนี้เป็นอีกสถานะ) ห้ามเปลี่ยนผลแบบเงียบ ๆ
  if (from !== leave.status) throw new HrLeaveDecisionError(LEAVE_STALE);
  const allowed = from === "PENDING" || (from === "APPROVED" && status === "REJECTED");
  if (!allowed) throw new HrLeaveDecisionError(`ใบลานี้${LEAVE_STATUS_TH[from] ?? "ตัดสินแล้ว"} — เปลี่ยนผลไม่ได้`);
  if (decidedById && leave.employee.linkedUserId === decidedById) {
    throw new HrLeaveDecisionError("ใบลานี้เป็นของบัญชีผู้ตัดสินเอง — ให้หัวหน้าหรือเจ้าของกิจการเป็นผู้ตัดสิน");
  }
  // สายอนุมัติ (requestLeave → submitForApproval) — อ่านอย่างเดียว ผูกร้าน
  // HF-HR-0 ▸ รอบ 5b (H2): ใบลาที่มีคำขอในสายอนุมัติ "สถานะใดก็ได้" (รอ · อนุมัติ · ปฏิเสธ) = สายเป็นเจ้าของการตัดสิน — ทางตรงปฏิเสธทุกกรณี
  //   (เดิมดูแค่ รอ/อนุมัติ ⇒ ช่วงระหว่าง "สายตัดสินแล้ว" กับ "effect เขียนใบลา" ทางตรงตัดสินสวนผลของสายได้) ·
  //   ยกเว้นเดียว: CANCELLED (cancelRequest — สายจะไม่ตัดสินและไม่มี effect เขียนใบลาอีก) ⇒ ปล่อยให้ทางตรง ไม่งั้นใบลาค้างถาวร ◂
  const chains = await tenantDb({ tenantId: ctx.tenantId }).approvalRequest.findMany({
    where: { entityType: "HrLeave", entityId: leaveId, status: { in: ["PENDING", "APPROVED", "REJECTED"] } },
    select: { status: true },
    take: 20,
  });
  const chainHas = (s: string) => chains.some((c) => c.status === s);
  if (chainHas("PENDING")) {
    throw new HrLeaveDecisionError("ใบลานี้อยู่ในสายอนุมัติ — ตัดสินได้ที่หน้า “อนุมัติ” (คำขอรอตัดสิน)");
  }
  if (from === "APPROVED" && (chainHas("APPROVED") || leave.decidedById === "approval-engine")) {
    throw new HrLeaveDecisionError("ใบลานี้อนุมัติผ่านสายอนุมัติแล้ว — ระบบยังไม่มีการถอนผลของสายอนุมัติ ดูรายละเอียดได้ที่หน้า “อนุมัติ” หรือติดต่อเจ้าของกิจการ");
  }
  if (chains.length > 0) {
    throw new HrLeaveDecisionError("ใบลานี้ตัดสินผ่านสายอนุมัติแล้ว — ผลของใบลามาจากหน้า “อนุมัติ” เท่านั้น (ตัดสินซ้ำทางนี้ไม่ได้) หากต้องเปลี่ยนผล กรุณาติดต่อเจ้าของกิจการ");
  }
  // เงื่อนไข "สถานะต้นทางที่คาดไว้" ใน SQL เดียว ⇒ กดพร้อมกันสองทางได้ผลเดียว (อีกทางได้ 0 แถว)
  const res = await db.hrLeave.updateMany({
    where: { id: leaveId, status: from },
    data: { status, decidedById: decidedById ?? null },
  });
  if (res.count === 0) throw new HrLeaveDecisionError(LEAVE_STALE);
  await writeAudit({
    tenantId: ctx.tenantId,
    actorType: decidedById ? "USER" : "SYSTEM",
    actorId: decidedById ?? null,
    action: "hr.leave.decide",
    targetType: "HrLeave",
    targetId: leaveId,
    before: { status: from, decidedById: leave.decidedById },
    after: { status, decidedById: decidedById ?? null },
  });
}

// อนุมัติ/ปฏิเสธใบลาหลายใบพร้อมกัน (bulk) — วน decideLeave() ทีละใบ (แต่ละใบ scope tenant+system เดิม)
// ไม่ atomic ทั้งชุด: ใบไหน id ข้ามร้าน/ไม่พบ → guard tenantDb โยน (P2025) → บันทึก failed แล้วไปต่อ
export type BulkLeaveResult = { done: number; failed: { id: string; reason: string }[] };
export async function bulkDecideLeave(
  ctx: Ctx,
  leaveIds: string[],
  status: "APPROVED" | "REJECTED",
  decidedById?: string | null,
  opts: { from?: "PENDING" | "APPROVED" } = {},
): Promise<BulkLeaveResult> {
  const result: BulkLeaveResult = { done: 0, failed: [] };
  for (const id of leaveIds) {
    try {
      await decideLeave(ctx, id, status, decidedById ?? null, opts);
      result.done += 1;
    } catch (e) {
      // HF-HR-0: เหตุผลไทยจาก decideLeave (ตัดสินแล้ว/ของตัวเอง/อยู่ในสายอนุมัติ) · อื่น ๆ (DB) → ข้อความกลาง
      result.failed.push({ id, reason: e instanceof HrLeaveDecisionError ? e.message : "ไม่พบใบลา หรืออยู่นอกร้านนี้" });
    }
  }
  return result;
}

// ── availability (contract C-2) ──
// โหลดใบลาของพนักงาน แล้วให้ rules ตัดสิน — rules นับเฉพาะ APPROVED (PENDING ไม่ทำให้ไม่ว่าง)
export async function isAvailable(ctx: Ctx, employeeId: string, date: Date): Promise<boolean> {
  const leaves = await tenantDb(ctx).hrLeave.findMany({
    where: { employeeId },
    select: { fromDate: true, toDate: true, status: true },
  });
  return rulesIsAvailable(leaves, date);
}

/**
 * contract C-2 (13 ส.ค. 2026): ใครลา "อนุมัติแล้ว" ในวันนั้น — ถามเป็นชุดคิวรีเดียว
 * ระบบอื่น (จองคิว) เรียกตัวนี้ ห้าม copy สูตรวันลาไปคิดเอง · สูตรอยู่ rules.isAvailable ที่เดียว
 */
export async function employeesOnLeave(ctx: Ctx, employeeIds: string[], date: Date): Promise<Set<string>> {
  if (employeeIds.length === 0) return new Set();
  const leaves = await tenantDb(ctx).hrLeave.findMany({
    where: { employeeId: { in: employeeIds } },
    select: { employeeId: true, fromDate: true, toDate: true, status: true },
  });
  const out = new Set<string>();
  for (const l of leaves) if (!rulesIsAvailable([l], date)) out.add(l.employeeId);
  return out;
}

/**
 * "วันนั้นคนไหนใช้งานไม่ได้" = ลาอนุมัติแล้ว **หรือ** ถูกลบ/ลาออกจากทะเบียน (active=false)
 * ระบบอื่นควรถามตัวนี้ (จุดเดียว) แทนที่จะเช็ค active เองแล้วลืมเรื่องใบลา หรือกลับกัน
 */
export async function employeesUnavailable(ctx: Ctx, employeeIds: string[], date: Date): Promise<Set<string>> {
  if (employeeIds.length === 0) return new Set();
  const out = await employeesOnLeave(ctx, employeeIds, date);
  const gone = await tenantDb(ctx).hrEmployee.findMany({
    where: { id: { in: employeeIds }, active: false },
    select: { id: true },
  });
  for (const g of gone) out.add(g.id);
  return out;
}

// ── reads (สำหรับ UI) ──
export async function listLeaves(ctx: Ctx, take = 100) {
  return tenantDb(ctx).hrLeave.findMany({
    include: { employee: true },
    orderBy: [{ createdAt: "desc" }],
    take,
  });
}

export async function pendingLeaves(ctx: Ctx, take = 100) {
  return tenantDb(ctx).hrLeave.findMany({
    where: { status: "PENDING" },
    include: { employee: true },
    orderBy: [{ fromDate: "asc" }, { createdAt: "asc" }],
    take,
  });
}

export async function listAttendance(ctx: Ctx, take = 50) {
  return tenantDb(ctx).hrAttendance.findMany({
    include: { employee: true },
    orderBy: { at: "desc" },
    take,
  });
}

// ชั่วโมงทำงานของพนักงานในเดือน (คิดเป็นนาที) — จับคู่ IN/OUT ด้วยกติกา rules.workedMinutes
export async function monthlyMinutes(ctx: Ctx, employeeId: string, monthStart: Date): Promise<number> {
  const start = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth(), 1));
  const end = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 1));
  const events = await tenantDb(ctx).hrAttendance.findMany({
    where: { employeeId, at: { gte: start, lt: end } },
    select: { kind: true, at: true },
    orderBy: { at: "asc" },
  });
  return workedMinutes(events);
}

// ─────────────────── ตารางเวลาทำงานรายพนักงาน (11 ส.ค. 2026) ───────────────────
// เดิมมีแค่บันทึกเข้า-ออก แต่ไม่มี "ควรเข้ากี่โมง" → บอกไม่ได้ว่าใครสาย ใครขาด
// ครึ่งวัน = ตั้งช่วงเวลาสั้นลง (เสาร์ 09:00-13:00) ไม่ต้องมีชนิดพิเศษให้จำเพิ่ม

export type ScheduleRow = {
  weekday: number;
  dayOff: boolean;
  startMin: number;
  endMin: number;
  graceMin: number;
};

/** ตารางของพนักงานคนหนึ่ง ครบ 7 วัน — วันที่ยังไม่ตั้งคืน null เพื่อให้ UI รู้ว่า "ยังไม่ได้ตั้ง" */
export async function getSchedule(ctx: Ctx, employeeId: string): Promise<(ScheduleRow | null)[]> {
  const rows = await tenantDb(ctx).hrWorkSchedule.findMany({ where: { employeeId } });
  const byDay = new Map(rows.map((r) => [r.weekday, r]));
  return Array.from({ length: 7 }, (_, wd) => {
    const r = byDay.get(wd);
    return r ? { weekday: wd, dayOff: r.dayOff, startMin: r.startMin, endMin: r.endMin, graceMin: r.graceMin } : null;
  });
}

/** ตั้งตารางทั้งสัปดาห์ในครั้งเดียว (upsert ต่อวัน) — ไม่ส่งวันไหนมา = ลบวันนั้นทิ้ง (กลับเป็น "ยังไม่ตั้ง") */
export async function setSchedule(ctx: Ctx, employeeId: string, rows: ScheduleRow[]): Promise<{ ok: boolean; reason?: string }> {
  const emp = await tenantDb(ctx).hrEmployee.findFirst({ where: { id: employeeId } });
  if (!emp) return { ok: false, reason: "ไม่พบพนักงาน" };
  for (const r of rows) {
    if (r.weekday < 0 || r.weekday > 6) return { ok: false, reason: "วันในสัปดาห์ไม่ถูกต้อง" };
    if (!r.dayOff && (r.startMin < 0 || r.endMin > 24 * 60 || r.endMin <= r.startMin)) {
      return { ok: false, reason: "เวลาออกงานต้องหลังเวลาเข้างาน" };
    }
  }
  // เขียนผ่าน tenantDb ตามกติกาโมดูล (ห้ามแตะ prisma ตรง — fitness F5.1 คุมไว้)
  // ไม่ห่อ transaction: เป็นหน้าตั้งค่า ไม่ใช่เส้นทางเงิน · พังกลางคันแค่กดบันทึกใหม่
  const db = tenantDb(ctx);
  const keep = rows.map((r) => r.weekday);
  await db.hrWorkSchedule.deleteMany({ where: { employeeId, weekday: { notIn: keep } } });
  for (const r of rows) {
    const data = { dayOff: r.dayOff, startMin: r.startMin, endMin: r.endMin, graceMin: Math.max(0, r.graceMin) };
    const existing = await db.hrWorkSchedule.findFirst({ where: { employeeId, weekday: r.weekday } });
    if (existing) await db.hrWorkSchedule.updateMany({ where: { id: existing.id }, data });
    else await db.hrWorkSchedule.create({ data: { ...ctx, employeeId, weekday: r.weekday, ...data } });
  }
  return { ok: true };
}

export type AttendanceJudgement = "ON_TIME" | "LATE" | "DAY_OFF" | "NO_SCHEDULE";

// เวลาไทยคงที่ +7 (ทั้งโปรเจกต์ใช้ค่านี้ ไม่มี DST) — อ่านค่าด้วย getUTC* บนเวลาที่บวกแล้ว
const BKK_MS = 7 * 3_600_000;
/** แปลง instant → วัน/เวลาแบบไทย (วันที่ "YYYY-MM-DD" · weekday 0=อาทิตย์ · นาทีจากเที่ยงคืน) */
export function bkkParts(at: Date): { dateStr: string; weekday: number; minOfDay: number } {
  const d = new Date(at.getTime() + BKK_MS);
  return {
    dateStr: d.toISOString().slice(0, 10),
    weekday: d.getUTCDay(),
    minOfDay: d.getUTCHours() * 60 + d.getUTCMinutes(),
  };
}

export type ClockInDetail = {
  judgement: AttendanceJudgement;
  dueMin: number | null; // ควรเข้ากี่โมง (นาทีเวลาไทย)
  lateMin: number | null; // สายกี่นาทีจากเวลาที่ควรเข้า (ไม่หักเวลาผ่อนผัน) · 0 = ไม่สาย
};

/**
 * ตัดสินการเข้างาน + เก็บหลักฐานที่ใช้ตัดสิน
 * ยังไม่ตั้งตาราง = NO_SCHEDULE (ไม่ตัดสิน) — สำคัญ: ห้ามบอกว่า "สาย" ทั้งที่ร้านยังไม่เคยกำหนดเวลา
 * ผ่อนผัน (graceMin) ใช้ตัดสินว่า "สายไหม" · แต่ lateMin รายงานตามจริงจากเวลาที่ควรเข้า
 */
export function clockInDetail(at: Date, sch: ScheduleRow | null): ClockInDetail {
  if (!sch) return { judgement: "NO_SCHEDULE", dueMin: null, lateMin: null };
  if (sch.dayOff) return { judgement: "DAY_OFF", dueMin: null, lateMin: null };
  const { minOfDay } = bkkParts(at);
  const late = minOfDay > sch.startMin + sch.graceMin;
  return {
    judgement: late ? "LATE" : "ON_TIME",
    dueMin: sch.startMin,
    lateMin: late ? minOfDay - sch.startMin : 0,
  };
}

/** สัญญาเดิม (oracle + ผู้เรียกเก่าใช้อยู่) — คำตัดสินอย่างเดียว */
export function judgeClockIn(at: Date, sch: ScheduleRow | null): AttendanceJudgement {
  return clockInDetail(at, sch).judgement;
}

// ─────────────────── สรุปการเข้างานรายเดือน (13 ส.ค. 2026) ───────────────────
// เดิมมีตารางเข้างาน + ปุ่มลงเวลา แต่ไม่มีใครเอาสองอย่างมาชนกัน → เจ้าของยังตอบไม่ได้ว่า
// เดือนนี้ใครสายกี่ครั้ง ขาดกี่วัน · ที่นี่คือจุดที่ตารางเริ่มมีประโยชน์จริง
//
// 🔴 กติกา "ห้ามกล่าวหาจากข้อมูลที่ยังไม่มี" (3 ชั้น):
//   1) ไม่มีแถวตารางของวันนั้น = ไม่นับอะไรเลย (ไม่ใช่ขาดงาน)
//   2) วันก่อนที่ร้านตั้งตารางให้คนนี้ = ไม่นับ (createdAt ของแถวตาราง)
//   3) วันนี้ยังไม่จบ = ไม่นับขาดงาน (นับเฉพาะวันที่ผ่านไปแล้ว)
// วันลาที่อนุมัติแล้ว = "ลา" ไม่ใช่ "ขาด"
export type MonthAttendance = {
  workedMinutes: number; // ชั่วโมงทำงานจริงจากการจับคู่ IN/OUT
  onTimeCount: number;
  lateCount: number;
  lateMinutes: number;
  absentDays: number; // ต้องมาแต่ไม่มีบันทึกเข้างาน (ไม่ใช่วันลา)
  leaveDays: number; // วันที่ต้องมาแต่ลาและได้อนุมัติ
  workDays: number; // วันที่ต้องมาทำงานตามตาราง (ไม่รวมวันลา) นับถึงเมื่อวาน
  unjudgedCount: number; // เข้างานตอนที่ยังไม่มีตาราง → ระบบไม่ตัดสิน
};

/** พนักงานที่ "ตั้งตารางแล้ว" (มีแถวตารางอย่างน้อย 1 วัน) — หน้าจอใช้แยกว่าไม่มีข้อมูล vs ไม่มาทำงาน */
export async function employeesWithSchedule(ctx: Ctx): Promise<Set<string>> {
  const rows = await tenantDb(ctx).hrWorkSchedule.findMany({ select: { employeeId: true } });
  return new Set(rows.map((r) => r.employeeId));
}

export async function monthlyAttendance(
  ctx: Ctx,
  employeeId: string,
  monthStart: Date,
): Promise<MonthAttendance> {
  const y = monthStart.getUTCFullYear();
  const m = monthStart.getUTCMonth();
  // ขอบเดือนแบบเวลาไทย (เที่ยงคืนไทย = 17:00Z ของวันก่อนหน้า) — ไม่ใช้ขอบ UTC ตรง ๆ
  const startUtc = new Date(Date.UTC(y, m, 1) - BKK_MS);
  const endUtc = new Date(Date.UTC(y, m + 1, 1) - BKK_MS);
  const db = tenantDb(ctx);
  const [events, schedRows, leaves] = await Promise.all([
    db.hrAttendance.findMany({
      where: { employeeId, at: { gte: startUtc, lt: endUtc } },
      select: { kind: true, at: true, judgement: true, lateMin: true },
      orderBy: { at: "asc" },
    }),
    db.hrWorkSchedule.findMany({ where: { employeeId } }),
    db.hrLeave.findMany({ where: { employeeId }, select: { fromDate: true, toDate: true, status: true } }),
  ]);

  const ins = events.filter((e) => e.kind === "IN");
  const inDates = new Set(ins.map((e) => bkkParts(e.at).dateStr));
  const byWeekday = new Map(schedRows.map((r) => [r.weekday, r]));
  const todayStr = bkkParts(new Date()).dateStr;
  const daysInMonth = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();

  let absentDays = 0;
  let leaveDays = 0;
  let workDays = 0;
  for (let day = 1; day <= daysInMonth; day++) {
    const dayUtc = new Date(Date.UTC(y, m, day));
    const dateStr = dayUtc.toISOString().slice(0, 10);
    if (dateStr >= todayStr) break; // ชั้น 3: วันนี้/อนาคตยังตัดสินไม่ได้
    const sch = byWeekday.get(dayUtc.getUTCDay());
    if (!sch || sch.dayOff) continue; // ชั้น 1
    if (dateStr < bkkParts(sch.createdAt).dateStr) continue; // ชั้น 2
    if (!rulesIsAvailable(leaves, dayUtc)) {
      leaveDays++;
      continue;
    }
    workDays++;
    if (!inDates.has(dateStr)) absentDays++;
  }

  return {
    workedMinutes: workedMinutes(events),
    onTimeCount: ins.filter((e) => e.judgement === "ON_TIME").length,
    lateCount: ins.filter((e) => e.judgement === "LATE").length,
    lateMinutes: ins.reduce((s, e) => s + (e.judgement === "LATE" ? (e.lateMin ?? 0) : 0), 0),
    absentDays,
    leaveDays,
    workDays,
    unjudgedCount: ins.filter((e) => e.judgement == null || e.judgement === "NO_SCHEDULE").length,
  };
}

// ─────────── ทางเข้าระดับร้าน สำหรับโมดูลอื่น (WO CRM v2 · C0.3 ส่วน C) ───────────
// 🔴 สองตัวล่างนี้รับ **tenantId เปล่า ๆ** (ไม่มี systemId) เพราะผู้เรียกคือ CRM ซึ่งรู้แค่ "userId คนนี้"
//    ไม่รู้ว่าร้านนี้มีระบบ HR ระบบไหน ⇒ ไล่ระบบ HR ของร้านก่อน แล้วค่อย query แบบผูก systemId ตามปกติ
//    (HrEmployee/HrLeave เป็น system-scoped ⇒ `tenantDb({tenantId})` เฉย ๆ จะโยน fail-closed —
//     นั่นคือพฤติกรรมที่ถูก ห้ามหลบด้วยการลาก prisma ดิบเข้ามาในไฟล์นี้ · chokepoint F5.1)

/** พนักงานที่ผูกกับ user คนนี้ในร้านนี้ — ไม่มี/ข้ามร้าน → null (ของที่ยัง active มาก่อนเสมอ) */
export async function employeeOfUser(
  tenantId: string,
  userId: string,
): Promise<{ employeeId: string; systemId: string; name: string } | null> {
  const uid = (userId ?? "").trim();
  if (!tenantId || !uid) return null;
  const systems = await tenantDb({ tenantId }).appSystem.findMany({
    where: { tenantId, type: "HR" },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  for (const s of systems) {
    const row = await tenantDb({ tenantId, systemId: s.id }).hrEmployee.findFirst({
      where: { linkedUserId: uid },
      // ที่ยังทำงานอยู่มาก่อน — คนที่ลาออกแล้วยังคืนได้ถ้าไม่มีแถวอื่น (ผู้เรียกจะได้รู้ว่า "เคยเป็นใคร")
      orderBy: [{ active: "desc" }, { createdAt: "asc" }],
      select: { id: true, systemId: true, name: true },
    });
    if (row) return { employeeId: row.id, systemId: row.systemId, name: row.name };
  }
  return null;
}

/**
 * "คนนี้ลาอยู่ไหม ณ เวลานั้น" — นับเฉพาะใบลาที่ **APPROVED** (PENDING/REJECTED ไม่นับ)
 *
 * 🕐 กับดักวันที่ไทย (ผู้คุมงานตัดสินไว้ในใบ C0.3 ข้อ 4): `HrLeave.fromDate/toDate` เป็น `@db.Date`
 *    = เที่ยงคืน **UTC** ของวันนั้น ส่วน `at` เป็นเวลาจริง ⇒ เทียบ `toDate >= at` ดิบ ๆ จะตอบผิด
 *    (ลาวันเดียว 20 ก.ย. ถามตอนเที่ยงวันที่ 20 ตามเวลาไทย → `toDate` = 20 ก.ย. 00:00Z < at ⇒ ตอบ "ไม่ลา"
 *     แล้วระบบก็แจกงานให้คนที่ไม่อยู่) และช่วง 00:00–07:00 ตามเวลาไทยยังเป็น "เมื่อวาน" ในสายตา UTC อีกด้วย
 *    ⇒ แปลง `at` เป็น **วันตามปฏิทินไทย** ด้วย `thaiDateKey` (+07:00 · helper กลางของรีโป) ก่อน
 *    แล้วค่อยแปลงกลับเป็นเที่ยงคืน UTC ของวันนั้น ซึ่งเป็นรูปเดียวกับที่คอลัมน์ `@db.Date` เก็บ
 *    ⇒ `fromDate <= วันไทย <= toDate` จึงเป็นการเทียบ "วันกับวัน" ไม่ใช่ "วันกับเวลา" (รวมปลายทั้งสองข้าง)
 */
export async function isOnLeave(tenantId: string, userId: string, at: Date): Promise<boolean> {
  const emp = await employeeOfUser(tenantId, userId);
  if (!emp) return false;
  const when = at instanceof Date && Number.isFinite(at.getTime()) ? at : new Date();
  const dayTh = toDbDate(thaiDateKey(when)); // วันไทยของ `at` ในรูปเดียวกับคอลัมน์ @db.Date
  const hit = await tenantDb({ tenantId, systemId: emp.systemId }).hrLeave.count({
    where: {
      employeeId: emp.employeeId,
      status: "APPROVED",
      fromDate: { lte: dayTh },
      toDate: { gte: dayTh },
    },
  });
  return hit > 0;
}
