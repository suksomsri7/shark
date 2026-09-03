import { tenantDb } from "@/lib/core/db";
import type { HrAttendanceKind, HrLeaveType } from "@prisma/client";
import * as approval from "@/lib/modules/approval/service";
import { isAvailable as rulesIsAvailable, workedMinutes } from "./rules";
// WO 3.1 — Party (INTEGRATION-MAP §F.1): จาก name/phone/email เท่านั้น — **ห้ามส่ง nationalId/PDPA อื่น**
// เรียกผ่าน facade เท่านั้น (F2.2)
import * as party from "@/lib/modules/party";

// HR (ระบบที่ 17) — service ชั้นประกอบ (systemId-scoped)
// ⚠️ กติกา availability + ชั่วโมงทำงาน มาจาก rules.ts (สมอง FREEZE) — ที่นี่แค่โหลด DB แล้วเรียกใช้
//    contract C-2: availability เป็นของ HR เท่านั้น (ระบบอื่นถาม ห้าม copy สูตร)
// scope: ทุก query ผ่าน tenantDb({ tenantId, systemId }) — inject tenantId+systemId อัตโนมัติ

export type Ctx = { tenantId: string; systemId: string };

// แปลง "YYYY-MM-DD" → Date เที่ยงคืน UTC (ตรงกับ @db.Date + rules ที่ตัด ISO 10 ตัวแรก)
//   รับ Date มาแล้วก็ได้ (เช่น จาก server action ที่ parse เอง) → ใช้ตรง ๆ
const toDbDate = (s: string | Date): Date => (s instanceof Date ? s : new Date(`${s}T00:00:00Z`));

// ── พนักงาน ──
export type CreateEmployeeInput = {
  name: string;
  phone?: string | null;
  position?: string | null;
  pinCode?: string | null;
};

export async function createEmployee(ctx: Ctx, input: CreateEmployeeInput): Promise<{ id: string }> {
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
      pinCode: input.pinCode?.trim() || null,
      partyId,
      // active = true (default ใน schema)
    },
  });
  return { id: e.id };
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
): Promise<{ ok: boolean; reason?: string; name?: string }> {
  const emp = await tenantDb(ctx).hrEmployee.findFirst({ where: { id: employeeId } });
  if (!emp) return { ok: false, reason: "ไม่พบพนักงาน" };
  await tenantDb(ctx).hrEmployee.updateMany({ where: { id: employeeId }, data: { active } });
  return { ok: true, name: emp.name };
}

// ── ลงเวลา (IN/OUT) ──
// เข้างาน = ตัดสินทันทีเทียบกับตารางของวันนั้น แล้ว **เก็บคำตัดสินติดแถวไว้** (snapshot)
//   ทำไมไม่คิดสดตอนอ่าน: ร้านแก้ตารางเดือนหน้า ไม่ควรย้อนไปเปลี่ยนว่าเมื่อวานใครสาย
//   (บทเรียนเดียวกับ Appointment.priceSatang — ประวัติต้องนิ่ง)
// ออกงาน = ไม่ตัดสิน (judgement null) — "ออกก่อนเวลา" ยังไม่ใช่สัญญาที่เจ้าของสั่ง
export async function clock(
  ctx: Ctx,
  input: { employeeId: string; kind: HrAttendanceKind; note?: string | null },
): Promise<{ id: string; judgement: AttendanceJudgement | null; lateMin: number | null }> {
  const at = new Date();
  const detail =
    input.kind === "IN"
      ? clockInDetail(at, (await getSchedule(ctx, input.employeeId))[bkkParts(at).weekday] ?? null)
      : null;
  const a = await tenantDb(ctx).hrAttendance.create({
    data: {
      tenantId: ctx.tenantId,
      systemId: ctx.systemId,
      employeeId: input.employeeId,
      kind: input.kind,
      at,
      note: input.note?.trim() || null,
      judgement: detail?.judgement ?? null,
      dueMin: detail?.dueMin ?? null,
      lateMin: detail?.lateMin ?? null,
    },
  });
  return { id: a.id, judgement: detail?.judgement ?? null, lateMin: detail?.lateMin ?? null };
}

// ─────────────────── kiosk: พนักงานกดลงเวลาเองด้วย PIN (13 ส.ค. 2026) ───────────────────
// เดิมมีแต่หน้าที่เจ้าของกดลงเวลา "แทน" พนักงาน (ใครกดก็ได้ ไม่มีการยืนยันตัวตน)
// kiosk = เปิดหน้านี้ค้างไว้บนแท็บเล็ตหน้าร้าน · พนักงานเลือกชื่อ + ใส่ PIN ของตัวเอง
// PIN = รหัสหน้าประตู 4-6 หลัก (ไม่ใช่รหัสผ่านบัญชี) เจ้าของตั้ง/ดู/เปลี่ยนได้ → เก็บเป็นข้อความ
//   ป้องกันการเดาด้วย rate limit ที่ชั้น action (ห้ามยิงรัว) ไม่ใช่ด้วยการซ่อนค่า

/** ตั้ง/ล้าง PIN ให้พนักงาน — ว่าง = ปิดการลงเวลาเองของคนนี้ */
export async function setPin(ctx: Ctx, employeeId: string, pin: string): Promise<{ ok: boolean; reason?: string }> {
  const clean = pin.trim();
  if (clean && !/^\d{4,6}$/.test(clean)) return { ok: false, reason: "PIN ต้องเป็นตัวเลข 4-6 หลัก" };
  const emp = await tenantDb(ctx).hrEmployee.findFirst({ where: { id: employeeId } });
  if (!emp) return { ok: false, reason: "ไม่พบพนักงาน" };
  if (clean) {
    // PIN ซ้ำกับคนอื่นในร้านได้ (เลือกชื่อก่อนใส่ PIN อยู่แล้ว) แต่เตือนไว้ว่าอย่าซ้ำจะดีกว่า
    const dup = await tenantDb(ctx).hrEmployee.findFirst({
      where: { pinCode: clean, active: true, NOT: { id: employeeId } },
      select: { name: true },
    });
    if (dup) return { ok: false, reason: `PIN นี้ ${dup.name} ใช้อยู่ — ตั้งเลขอื่นเพื่อไม่ให้สับสน` };
  }
  await tenantDb(ctx).hrEmployee.updateMany({ where: { id: employeeId }, data: { pinCode: clean || null } });
  return { ok: true };
}

/** ครั้งถัดไปของวันนี้ (เวลาไทย) ควรเป็นเข้าหรือออก — พนักงานไม่ต้องเลือกเอง */
export async function nextClockKind(ctx: Ctx, employeeId: string): Promise<HrAttendanceKind> {
  const { dateStr } = bkkParts(new Date());
  const dayStart = new Date(`${dateStr}T00:00:00+07:00`);
  const last = await tenantDb(ctx).hrAttendance.findFirst({
    where: { employeeId, at: { gte: dayStart } },
    orderBy: { at: "desc" },
    select: { kind: true },
  });
  return last?.kind === "IN" ? "OUT" : "IN";
}

export type KioskClockResult =
  | { ok: true; employeeName: string; kind: HrAttendanceKind; at: Date; judgement: AttendanceJudgement | null; lateMin: number | null }
  | { ok: false; reason: string };

/**
 * พนักงานลงเวลาเองด้วย PIN — ไม่บอกว่า "PIN ผิด" หรือ "คนนี้ไม่มี PIN" แยกกันเวลาเดาไม่ได้อยู่แล้ว
 * เพราะเลือกชื่อจากรายชื่อบนจอ (ไม่ใช่ระบบล็อกอิน) แต่ยังบอกให้ชัดว่าเกิดอะไรขึ้นเพื่อไม่ให้คนงง
 */
export async function clockWithPin(ctx: Ctx, employeeId: string, pin: string): Promise<KioskClockResult> {
  const emp = await tenantDb(ctx).hrEmployee.findFirst({ where: { id: employeeId, active: true } });
  if (!emp) return { ok: false, reason: "ไม่พบพนักงาน" };
  if (!emp.pinCode) return { ok: false, reason: `${emp.name} ยังไม่มี PIN — ให้เจ้าของตั้งที่หน้าพนักงาน` };
  if (emp.pinCode !== pin.trim()) return { ok: false, reason: "PIN ไม่ถูกต้อง" };
  const kind = await nextClockKind(ctx, employeeId);
  const res = await clock(ctx, { employeeId, kind });
  return { ok: true, employeeName: emp.name, kind, at: new Date(), judgement: res.judgement, lateMin: res.lateMin };
}

/** รายชื่อสำหรับจอ kiosk — บอกด้วยว่าใครยังไม่ได้ตั้ง PIN (เจ้าของจะรู้ว่าต้องไปตั้ง) */
export async function kioskRoster(ctx: Ctx) {
  const emps = await tenantDb(ctx).hrEmployee.findMany({
    where: { active: true },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, position: true, pinCode: true },
  });
  return emps.map((e) => ({ id: e.id, name: e.name, position: e.position, hasPin: !!e.pinCode }));
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
  const l = await tenantDb(ctx).hrLeave.create({
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
  // WO-0049b: มีสายอนุมัติใบลา → ยื่นเข้าสาย (ใบลาคง PENDING จน effect ตัดสินหลังอนุมัติ/ปฏิเสธ)
  //   ไม่มีสายอนุมัติ → พฤติกรรมเดิม (ใบลารอ decideLeave ด้วยมือตามเดิม)
  const policy = await approval.resolvePolicy(
    { tenantId: ctx.tenantId },
    { entityType: "HrLeave", systemId: ctx.systemId },
  );
  if (policy) {
    await approval.submitForApproval(
      { tenantId: ctx.tenantId },
      { entityType: "HrLeave", entityId: l.id, systemId: ctx.systemId, requestedById: input.employeeId },
    );
  }
  return { id: l.id };
}

// อนุมัติ/ปฏิเสธการลา — availability เปลี่ยนเฉพาะเมื่อ APPROVED (C-2)
export async function decideLeave(
  ctx: Ctx,
  leaveId: string,
  status: "APPROVED" | "REJECTED",
  decidedById?: string | null,
): Promise<void> {
  await tenantDb(ctx).hrLeave.update({
    where: { id: leaveId },
    data: { status, decidedById: decidedById ?? null },
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
): Promise<BulkLeaveResult> {
  const result: BulkLeaveResult = { done: 0, failed: [] };
  for (const id of leaveIds) {
    try {
      await decideLeave(ctx, id, status, decidedById ?? null);
      result.done += 1;
    } catch {
      // id ข้ามร้าน/ไม่พบ → guard โยน P2025 (ข้อความอังกฤษ) → ใช้เหตุผลไทยแทน
      result.failed.push({ id, reason: "ไม่พบใบลา หรืออยู่นอกร้านนี้" });
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
