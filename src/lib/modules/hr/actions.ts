"use server";

import { revalidatePath } from "next/cache";
import { requireTenant } from "@/lib/core/context";
import { assertCan, canViewPayroll, evaluate } from "@/lib/core/rbac";
import type { HrAttendanceKind, HrLeaveType } from "@prisma/client";
import { checkRateLimitDb } from "@/lib/core/rate-limit-db"; // HR H0.3 ▸ ตัวจำกัดบน DB (ข้าม instance) แทน in-memory ◂
import {
  addEmployeeDoc,
  clock,
  ClockRefusedError,
  clockWithPin,
  createEmployee,
  decideLeave,
  bulkDecideLeave,
  cancelLeave, // HR H0.7 ▸ R5 ◂
  employeeOfUser, // HR H0.7 ▸ R3 ◂
  HrLeaveRequestError, // HR H0.7 ◂
  removeEmployeeDoc,
  requestLeave,
  saveEmployeeProfile,
  setEmployeeActive,
  setPin,
  setSchedule,
  updateEmployee,
  type Ctx,
} from "./service";
import { employeeProfileInputFromForm, hrViewerOf } from "./privacy";
// HR H1.1 ▸ R5 ขอบเขตสาขาของผู้กด — สาขาของเป้าหมายอ่านจากแถวใน DB เสมอ (ไม่เชื่อฟอร์ม) ◂
import {
  employeeIdOfDoc,
  employeeUnitsOf,
  homeUnitTarget,
  HrBranchError,
  hrScopeOf,
  leaveTargetOf,
  unitTargetOf,
} from "./scope";

type Auth = Awaited<ReturnType<typeof requireTenant>>;
const memberOf = (auth: Auth) => ({
  role: auth.active.role,
  unitAccess: (Array.isArray(auth.active.unitAccess) ? auth.active.unitAccess : []) as string[],
  permissions: auth.active.permissions as Record<string, unknown>,
});

// ตรวจสิทธิ์โมดูล HR (system-scoped) — OWNER/MANAGER ผ่าน · STAFF ตาม permission
// convention action = "hr.<entity>.<verb>" (F6 ratchet บังคับให้ไฟล์นี้เรียก assertCan)
// HR H1.1 ▸ R5: unitId = สาขาของเป้าหมาย (จาก hrTarget/hrHomeTarget) ส่งต่อเข้า assertCan · ไม่ส่ง = ด่านคีย์ระดับร้าน
//   (ทุกจุดที่ไม่ส่งมีหมายเหตุ "ทุกสาขา" กำกับ — oracle H1.1 S5.10) ◂
function assertHrCan(auth: Auth, action: string, unitId?: string) {
  assertCan(memberOf(auth), { module: "hr", action, ...(unitId ? { unitId } : {}) });
}

/**
 * HR H1.1 ▸ R5 สาขาของพนักงานเป้าหมาย: ระดับพนักงาน (ไม่มี `day`) = สาขาประจำ · แถวที่มีวันที่ = สาขาประจำ หรือยืมตัวที่ครอบวันนั้น
 * นอกสาขา / ยังไม่ระบุสาขา (ผู้กดไม่ใช่ผู้ดูแลทุกสาขา) ⇒ HrBranchError ข้อความไทยคงที่ · ไม่พบ ⇒ {} (service ตอบ "ไม่พบพนักงาน" ตามเดิม) ◂
 */
async function hrTarget(auth: Auth, ctx: Ctx, employeeId: string, day?: Date): Promise<{ unitId?: string }> {
  const emp = await employeeUnitsOf(ctx, employeeId);
  if (!emp) return {};
  const t = unitTargetOf(hrScopeOf(memberOf(auth)), emp, day);
  if (!t.ok) throw new HrBranchError(t.reason);
  return t.unitId ? { unitId: t.unitId } : {};
}
/** HR H1.1 ▸ สาขาประจำที่ผู้กดเลือกให้พนักงาน (สร้างใหม่ / ย้าย) — ต้องอยู่ในสาขาของผู้กด · ไม่ระบุ = เฉพาะผู้ดูแลทุกสาขา ◂ */
async function hrHomeTarget(auth: Auth, ctx: Ctx, unitId: string | null): Promise<{ unitId?: string }> {
  const t = await homeUnitTarget(ctx, hrScopeOf(memberOf(auth)), unitId);
  if (!t.ok) throw new HrBranchError(t.reason);
  return t.unitId ? { unitId: t.unitId } : {};
}

const KINDS = new Set<HrAttendanceKind>(["IN", "OUT"]);
const LEAVE_TYPES = new Set<HrLeaveType>(["SICK", "PERSONAL", "VACATION", "OTHER"]);

const revalidate = (systemId: string) => revalidatePath(`/app/sys/${systemId}`);

// ── เพิ่มพนักงาน ──
export async function createEmployeeAction(formData: FormData) {
  const auth = await requireTenant();
  // ทุกสาขา: ด่านคีย์ระดับร้าน (ข้อความเดิม) — สาขาประจำที่เลือกตรวจด้วย hrHomeTarget ด้านล่าง
  assertHrCan(auth, "hr.employee.create");
  const systemId = String(formData.get("systemId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!systemId || !name) return;
  const ctx: Ctx = { tenantId: auth.active.tenantId, systemId };
  // HR H1.1 ▸ R5: สาขาประจำต้องอยู่ในสาขาของผู้กด (ไม่ระบุ = ผู้ดูแลทุกสาขาเท่านั้น) · นอกสาขา = HrBranchError ข้อความไทยคงที่ ◂
  const home = await hrHomeTarget(auth, ctx, String(formData.get("unitId") ?? ""));
  assertHrCan(auth, "hr.employee.create", home.unitId);
  await createEmployee(ctx, {
    unitId: home.unitId ?? null,
    name,
    phone: String(formData.get("phone") ?? "").trim() || null,
    position: String(formData.get("position") ?? "").trim() || null,
    // HR H0.5 r3 ▸ R3.4 (hunt F6) ไม่รับ pin จากฟอร์มสร้างพนักงานแล้ว — ฟอร์มไม่มีช่องนี้ และถ้ารับไว้จะเป็นช่องถาม "PIN นี้มีคนใช้ไหม"
    //   ที่ไม่ผ่านตัวจำกัด hr-setpin · ตั้ง PIN ทำที่ setPinAction เท่านั้น (มีถัง 10/10 นาที) ◂
  });
  revalidate(systemId);
}

// ── ลงเวลา (เข้า/ออก) "แทน" พนักงาน (ไม่มี PIN) ──
// HR H0.3 ▸ D7a: ลงเวลาแทนคนอื่นต้องมีสิทธิ์จัดการพนักงาน (hr.employee.create) เพิ่มจาก hr.attendance.clock
//   เดิมคีย์ hr.attendance.clock คีย์เดียว = บัญชีแท็บเล็ต kiosk ลงเวลาให้ใครก็ได้โดยไม่ใส่ PIN (ตอกบัตรแทนกัน)
//   คนที่มีแต่ hr.attendance.clock ยังใช้จอ kiosk (PIN ของพนักงานเอง) ได้ตามเดิม
//   ตอบข้อความไทยคงที่ ไม่ throw ข้อความระบบ · แถวที่ลงแทนมี note "ลงเวลาแทนโดย <ชื่อผู้กด>" (ไม่มี schema ใหม่)
//   พนักงานต้องเป็นของระบบนี้และยังไม่พ้นสภาพ (X2/R5) · กันกดซ้ำชนิดเดียวกันใน 60 วินาที อยู่ใน clock() ◂
export type ClockActionResult = { ok: true; deduped: boolean } | { ok: false; reason: string };
export async function clockAction(formData: FormData): Promise<ClockActionResult> {
  const auth = await requireTenant();
  // ทุกสาขา: ด่านคีย์ระดับร้าน (ข้อความเดิม) — สาขาของพนักงาน ณ วันนี้ตรวจด้วย hrTarget ด้านล่าง
  assertHrCan(auth, "hr.attendance.clock");
  const member = {
    role: auth.active.role,
    unitAccess: auth.active.unitAccess as string[],
    permissions: auth.active.permissions as Record<string, unknown>,
  };
  if (!evaluate(member, { module: "hr", action: "hr.employee.create" })) {
    return { ok: false, reason: "ไม่มีสิทธิ์ลงเวลาแทนผู้อื่น ให้พนักงานลงเวลาด้วย PIN ของตนเอง" };
  }
  const systemId = String(formData.get("systemId") ?? "");
  const employeeId = String(formData.get("employeeId") ?? "");
  const rawKind = String(formData.get("kind") ?? "");
  if (!systemId || !employeeId || !KINDS.has(rawKind as HrAttendanceKind)) return { ok: false, reason: "ข้อมูลไม่ครบ" };
  const ctx: Ctx = { tenantId: auth.active.tenantId, systemId };
  // HR H1.1 ▸ R5: แถวลงเวลามีวันที่ = วันนี้ ⇒ สาขาประจำ หรือยืมตัวที่เปิดวันนี้ (มติ 4) · นอกสาขา = ข้อความคงที่ ไม่มีแถว ◂
  try {
    const t = await hrTarget(auth, ctx, employeeId, new Date());
    assertHrCan(auth, "hr.attendance.clock", t.unitId);
  } catch (e) {
    if (e instanceof HrBranchError) return { ok: false, reason: e.message };
    throw e;
  }
  const note = String(formData.get("note") ?? "").trim() || `ลงเวลาแทนโดย ${auth.user.name ?? auth.user.email}`;
  let res: Awaited<ReturnType<typeof clock>>;
  try {
    res = await clock(ctx, { employeeId, kind: rawKind as HrAttendanceKind, note, requireActive: true });
  } catch (e) {
    if (e instanceof ClockRefusedError) return { ok: false, reason: "ไม่พบพนักงาน" };
    throw e;
  }
  revalidate(systemId);
  return { ok: true, deduped: res.deduped };
}

// ── แก้ข้อมูลพนักงาน / ลบ (soft) / กู้คืน ──
export async function updateEmployeeAction(formData: FormData) {
  const auth = await requireTenant();
  // ทุกสาขา: ด่านคีย์ระดับร้าน — สาขาประจำของพนักงานตรวจด้วย hrTarget ด้านล่าง
  assertHrCan(auth, "hr.employee.create");
  const systemId = String(formData.get("systemId") ?? "");
  const employeeId = String(formData.get("employeeId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!systemId || !employeeId || !name) return;
  const t = await hrTarget(auth, { tenantId: auth.active.tenantId, systemId }, employeeId); // HR H1.1 ▸ สาขาประจำ ◂
  assertHrCan(auth, "hr.employee.create", t.unitId);
  await updateEmployee({ tenantId: auth.active.tenantId, systemId }, employeeId, {
    name,
    position: String(formData.get("position") ?? ""),
    phone: String(formData.get("phone") ?? ""),
  });
  revalidatePath(`/app/sys/${systemId}/hr/employees`);
}

// ลบ = soft delete (ประวัติลงเวลา/ลา/เงินเดือน + นัดในระบบจองยังอ่านได้) · กู้คืนได้
export async function removeEmployeeAction(formData: FormData) {
  const auth = await requireTenant();
  // ทุกสาขา: ด่านคีย์ระดับร้าน — สาขาประจำของพนักงานตรวจด้วย hrTarget ด้านล่าง
  assertHrCan(auth, "hr.employee.create");
  const systemId = String(formData.get("systemId") ?? "");
  const employeeId = String(formData.get("employeeId") ?? "");
  if (!systemId || !employeeId) return;
  const t = await hrTarget(auth, { tenantId: auth.active.tenantId, systemId }, employeeId); // HR H1.1 ▸ สาขาประจำ ◂
  assertHrCan(auth, "hr.employee.create", t.unitId);
  await setEmployeeActive({ tenantId: auth.active.tenantId, systemId }, employeeId, false);
  revalidatePath(`/app/sys/${systemId}/hr/employees`);
}

export async function restoreEmployeeAction(formData: FormData) {
  const auth = await requireTenant();
  // ทุกสาขา: ด่านคีย์ระดับร้าน — สาขาประจำของพนักงานตรวจด้วย hrTarget ด้านล่าง
  assertHrCan(auth, "hr.employee.create");
  const systemId = String(formData.get("systemId") ?? "");
  const employeeId = String(formData.get("employeeId") ?? "");
  if (!systemId || !employeeId) return;
  const t = await hrTarget(auth, { tenantId: auth.active.tenantId, systemId }, employeeId); // HR H1.1 ▸ สาขาประจำ ◂
  assertHrCan(auth, "hr.employee.create", t.unitId);
  await setEmployeeActive({ tenantId: auth.active.tenantId, systemId }, employeeId, true);
  revalidatePath(`/app/sys/${systemId}/hr/employees`);
}

// ── โปรไฟล์พนักงานเต็มรูปแบบ (ข้อ 8) ──
// 🔒 PDPA: ช่องอ่อนไหว (เลขบัตร/ประกันสังคม/ทะเบียนบ้าน/บัญชีธนาคาร) + เอกสารแนบ
//    ต้องมีสิทธิ์เดียวกับเงินเดือน (OWNER หรือ hr.payroll.read) — คนอื่นแก้ช่องทั่วไปได้เท่านั้น
function canSeeSensitive(auth: Awaited<ReturnType<typeof requireTenant>>): boolean {
  return canViewPayroll({
    role: auth.active.role,
    unitAccess: auth.active.unitAccess as string[],
    permissions: auth.active.permissions as Record<string, unknown>,
  });
}

export type ProfileState = { status: "idle" } | { status: "ok"; message: string } | { status: "error"; message: string };

export async function saveEmployeeProfileAction(
  systemId: string,
  employeeId: string,
  _prev: ProfileState,
  formData: FormData,
): Promise<ProfileState> {
  const auth = await requireTenant();
  // ทุกสาขา: ด่านคีย์ระดับร้าน — สาขาประจำของพนักงาน (และสาขาที่จะย้ายไป) ตรวจด้านล่าง
  assertHrCan(auth, "hr.employee.create");
  const ctx: Ctx = { tenantId: auth.active.tenantId, systemId };
  const input = employeeProfileInputFromForm(formData, hrViewerOf(auth));
  // HR H1.1 ▸ R5 · มติ 4: แก้ได้เฉพาะพนักงานที่สาขาประจำอยู่ในสาขาของผู้กด · ย้ายสาขาประจำ = ผู้ดูแลทุกสาขา หรือย้ายเข้าสาขาของผู้กดเท่านั้น ◂
  try {
    const t = await hrTarget(auth, ctx, employeeId);
    assertHrCan(auth, "hr.employee.create", t.unitId);
    if (input.unitId !== undefined) {
      const home = await hrHomeTarget(auth, ctx, input.unitId);
      assertHrCan(auth, "hr.employee.create", home.unitId);
      input.unitId = home.unitId ?? null;
    }
  } catch (e) {
    if (e instanceof HrBranchError) return { status: "error", message: e.message };
    throw e;
  }
  // HF-HR-0: ช่องอ่อนไหวผ่านเข้า service เฉพาะผู้ดูเงินเดือน — ตัวกรองกลางอยู่ที่ privacy.ts (oracle เรียกตัวเดียวกัน)
  const res = await saveEmployeeProfile(ctx, employeeId, input);
  if (!res.ok) return { status: "error", message: res.reason ?? "บันทึกไม่ได้" };
  revalidatePath(`/app/sys/${systemId}/hr/employees/${employeeId}`);
  revalidatePath(`/app/sys/${systemId}/hr/employees`);
  return { status: "ok", message: "บันทึกแล้ว" };
}

export async function addEmployeeDocAction(formData: FormData) {
  const auth = await requireTenant();
  // ทุกสาขา: ด่านคีย์ระดับร้าน — สาขาประจำของพนักงานตรวจด้วย hrTarget ด้านล่าง
  assertHrCan(auth, "hr.employee.create");
  if (!canSeeSensitive(auth)) return; // 🔒 เอกสารพนักงาน = ข้อมูลอ่อนไหวทั้งชุด
  const systemId = String(formData.get("systemId") ?? "");
  const employeeId = String(formData.get("employeeId") ?? "");
  if (!systemId || !employeeId) return;
  const t = await hrTarget(auth, { tenantId: auth.active.tenantId, systemId }, employeeId); // HR H1.1 ▸ สาขาประจำ ◂
  assertHrCan(auth, "hr.employee.create", t.unitId);
  await addEmployeeDoc({ tenantId: auth.active.tenantId, systemId }, employeeId, {
    kind: String(formData.get("kind") ?? "OTHER"),
    title: String(formData.get("title") ?? ""),
    url: String(formData.get("url") ?? ""),
    note: String(formData.get("note") ?? ""),
  });
  revalidatePath(`/app/sys/${systemId}/hr/employees/${employeeId}`);
}

export async function removeEmployeeDocAction(formData: FormData) {
  const auth = await requireTenant();
  // ทุกสาขา: ด่านคีย์ระดับร้าน — สาขาของเจ้าของเอกสาร (จาก DB) ตรวจด้วย hrTarget ด้านล่าง
  assertHrCan(auth, "hr.employee.create");
  if (!canSeeSensitive(auth)) return;
  const systemId = String(formData.get("systemId") ?? "");
  const employeeId = String(formData.get("employeeId") ?? "");
  const docId = String(formData.get("docId") ?? "");
  if (!systemId || !docId) return;
  const owner = await employeeIdOfDoc({ tenantId: auth.active.tenantId, systemId }, docId); // HR H1.1 ▸ เจ้าของเอกสารจาก DB ◂
  if (!owner) return;
  const t = await hrTarget(auth, { tenantId: auth.active.tenantId, systemId }, owner);
  assertHrCan(auth, "hr.employee.create", t.unitId);
  await removeEmployeeDoc({ tenantId: auth.active.tenantId, systemId }, docId);
  revalidatePath(`/app/sys/${systemId}/hr/employees/${employeeId}`);
}

// ── kiosk: ตั้ง PIN + พนักงานลงเวลาเอง ──
// ตั้ง PIN = สิทธิ์ระดับจัดการพนักงาน (เท่ากับเพิ่มพนักงาน)
export type PinState = { status: "idle" } | { status: "ok"; message: string } | { status: "error"; message: string };
export async function setPinAction(systemId: string, employeeId: string, _prev: PinState, formData: FormData): Promise<PinState> {
  const auth = await requireTenant();
  // ทุกสาขา: ด่านคีย์ระดับร้าน — สาขาประจำของพนักงานตรวจด้วย hrTarget ด้านล่าง (ก่อนนับถังตั้ง PIN)
  assertHrCan(auth, "hr.employee.create");
  try {
    const t = await hrTarget(auth, { tenantId: auth.active.tenantId, systemId }, employeeId); // HR H1.1 ▸ สาขาประจำ ◂
    assertHrCan(auth, "hr.employee.create", t.unitId);
  } catch (e) {
    if (e instanceof HrBranchError) return { status: "error", message: e.message };
    throw e;
  }
  const pin = String(formData.get("pin") ?? "");
  // HR H0.3 ▸ D8 (ชั่วคราวก่อน H0.5): ข้อความ "PIN นี้ใช้ไม่ได้" ยังบอกได้ว่ามีคนใช้ PIN นั้น ⇒ จำกัด 10 ครั้ง/10 นาที ต่อผู้กด (ถังบน DB) ◂
  const gate = await checkRateLimitDb(`hr-setpin:${auth.active.tenantId}:${auth.user.id}`, { limit: 10, windowMs: 10 * 60_000 });
  if (!gate.ok) return { status: "error", message: `ตั้ง PIN บ่อยเกินไป ลองใหม่ในอีก ${gate.retryAfterSec ?? 60} วินาที` };
  const res = await setPin({ tenantId: auth.active.tenantId, systemId }, employeeId, pin, { actorId: auth.user.id }); // HR H0.5 ▸ audit hr.pin.set/clear มีผู้กด ◂
  if (!res.ok) return { status: "error", message: res.reason ?? "บันทึกไม่ได้" };
  revalidatePath(`/app/sys/${systemId}/hr/employees`);
  return { status: "ok", message: pin.trim() ? "ตั้ง PIN แล้ว" : "ปิดการลงเวลาเองของคนนี้แล้ว" };
}

export type KioskState =
  | { status: "idle" }
  | { status: "ok"; message: string; detail?: string }
  | { status: "error"; message: string };

/**
 * พนักงานกดลงเวลาเองบนจอ kiosk (หน้านี้เปิดค้างด้วยเซสชันของร้าน)
 * 🔴 กันเดา PIN: PIN 4 หลักจึงถูกจำกัดที่ชั้นนี้ ไม่ใช่ที่ความยาว PIN
 * HR H0.3 ▸ D7b: ตัวจำกัดบน DB (ChatRateBucket · ทุก instance เห็นตัวเลขเดียวกัน) 2 ถัง ตรวจ "ก่อน" เทียบ PIN —
 *   hr-kiosk:emp:<tenantId>:<employeeId> 5 ครั้ง/60 วินาที (เดาคนเดียว) · hr-kiosk:sys:<tenantId>:<systemId> 60 ครั้ง/60 วินาที (ไล่เดาหลายคน)
 *   ตัวจำกัดล่ม (DB error) = checkRateLimitDb ปล่อยผ่าน (fail-open + logOps WARN) ⇒ จอ kiosk ยังลงเวลาได้ ◂
 */
export async function kioskClockAction(systemId: string, _prev: KioskState, formData: FormData): Promise<KioskState> {
  const auth = await requireTenant();
  // ทุกสาขา: ด่านคีย์ระดับร้าน — สาขาของพนักงาน ณ วันนี้ตรวจด้วย hrTarget ด้านล่าง
  assertHrCan(auth, "hr.attendance.clock");
  const employeeId = String(formData.get("employeeId") ?? "");
  const pin = String(formData.get("pin") ?? "");
  if (!employeeId) return { status: "error", message: "เลือกชื่อของคุณก่อน" };
  // HR H1.1 ▸ จอ kiosk ของบัญชีที่จำกัดสาขา ลงเวลาได้เฉพาะคนในสาขา (สาขาประจำ หรือยืมตัวที่เปิดวันนี้) ◂
  try {
    const t = await hrTarget(auth, { tenantId: auth.active.tenantId, systemId }, employeeId, new Date());
    assertHrCan(auth, "hr.attendance.clock", t.unitId);
  } catch (e) {
    if (e instanceof HrBranchError) return { status: "error", message: e.message };
    throw e;
  }
  if (!/^\d{4,6}$/.test(pin.trim())) return { status: "error", message: "ใส่ PIN 4-6 หลัก" };
  const tenantId = auth.active.tenantId;
  const gateEmp = await checkRateLimitDb(`hr-kiosk:emp:${tenantId}:${employeeId}`, { limit: 5, windowMs: 60_000 });
  if (!gateEmp.ok) return { status: "error", message: `ลองใหม่ในอีก ${gateEmp.retryAfterSec ?? 60} วินาที` };
  const gateSys = await checkRateLimitDb(`hr-kiosk:sys:${tenantId}:${systemId}`, { limit: 60, windowMs: 60_000 });
  if (!gateSys.ok) return { status: "error", message: `ลองใหม่ในอีก ${gateSys.retryAfterSec ?? 60} วินาที` };

  const res = await clockWithPin({ tenantId: auth.active.tenantId, systemId }, employeeId, pin);
  if (!res.ok) return { status: "error", message: res.reason };
  revalidatePath(`/app/sys/${systemId}/hr/attendance`);
  const time = new Intl.DateTimeFormat("th-TH", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" }).format(res.at);
  // HR H0.3 ▸ แตะซ้ำภายใน 60 วินาที = ไม่บันทึกเพิ่ม · บอกว่าลงไว้แล้ว (ไม่กลายเป็นออกงาน) ◂
  if (res.deduped) {
    return {
      status: "ok",
      message: `${res.employeeName} · เพิ่งลงเวลา${res.kind === "IN" ? "เข้า" : "ออก"}ไปเมื่อ ${time}`,
      detail: "บันทึกไว้แล้ว ไม่ต้องกดซ้ำ",
    };
  }
  const detail =
    res.judgement === "LATE"
      ? `สาย ${res.lateMin} นาที`
      : res.judgement === "ON_TIME"
        ? "ตรงเวลา"
        : res.judgement === "DAY_OFF"
          ? "วันหยุดของคุณ (บันทึกไว้แล้ว)"
          : res.judgement === "NO_SCHEDULE"
            ? "ยังไม่ได้ตั้งตารางของคุณ — ระบบไม่ตัดสินว่าสาย"
            : undefined;
  return {
    status: "ok",
    message: `${res.employeeName} · ${res.kind === "IN" ? "เข้างาน" : "ออกงาน"} ${time}`,
    ...(detail ? { detail } : {}),
  };
}

// ── ขอลา (สถานะเริ่มต้น = รออนุมัติ) ──
// HR H0.7 ▸ R3 (HQ19 ค่าเริ่มต้น · COMMON §C.7): พนักงานทั่วไป (ไม่มี hr.employee.create และไม่มี hr.leave.decide) ยื่นได้เฉพาะของตัวเอง —
//   ไม่เชื่อ employeeId จากฟอร์ม ใช้ employeeOfUser() (ไม่มีแถวพนักงานที่ผูกบัญชี = ข้อความไทยคงที่) ·
//   ผู้จัดการ/เจ้าของ/ผู้ถือคีย์ข้างต้น ยื่นแทนพนักงานของระบบนี้ได้ (ระบบอื่น/ร้านอื่น = ไม่พบ — ตรวจใน requestLeave) + "ยื่นโดย" (filedById)
//   ผู้กด (auth user id) ส่งเข้า requestLeave เสมอ ⇒ ผู้ยื่นในสายอนุมัติ = user id (R2) · ปฏิเสธ = โยน HrLeaveRequestError (ข้อความไทย) ◂
const LEAVE_NO_EMPLOYEE = "บัญชีของคุณยังไม่ได้ผูกกับรายชื่อพนักงาน — ให้ผู้จัดการยื่นใบลาแทน หรือขอให้ผู้ดูแลผูกบัญชีก่อน";
export async function requestLeaveAction(formData: FormData) {
  const auth = await requireTenant();
  // ทุกสาขา: ด่านคีย์ระดับร้าน — ยื่นแทนคนอื่นตรวจสาขา (ณ วันเริ่มลา) ด้วย hrTarget ด้านล่าง · ยื่นของตัวเอง = แถวของตัวเอง
  assertHrCan(auth, "hr.leave.request");
  const member = {
    role: auth.active.role,
    unitAccess: auth.active.unitAccess as string[],
    permissions: auth.active.permissions as Record<string, unknown>,
  };
  const onBehalf =
    evaluate(member, { module: "hr", action: "hr.employee.create" }) || evaluate(member, { module: "hr", action: "hr.leave.decide" });
  let systemId = String(formData.get("systemId") ?? "");
  const posted = onBehalf ? String(formData.get("employeeId") ?? "").trim() : ""; // พนักงานทั่วไป: ไม่อ่านช่องนี้เลย
  const rawType = String(formData.get("type") ?? "PERSONAL");
  const type = (LEAVE_TYPES.has(rawType as HrLeaveType) ? rawType : "PERSONAL") as HrLeaveType;
  const fromDate = String(formData.get("fromDate") ?? "").trim();
  const toDate = String(formData.get("toDate") ?? "").trim();
  if (!systemId || !fromDate || !toDate) return;
  let employeeId = posted;
  if (employeeId) {
    // HR H1.1 ▸ R5: ยื่นแทน = แถวที่มีวันที่ ⇒ สาขาประจำ หรือยืมตัวที่ครอบวันเริ่มลา ◂
    const t = await hrTarget(auth, { tenantId: auth.active.tenantId, systemId }, employeeId, /^\d{4}-\d{2}-\d{2}$/.test(fromDate) ? new Date(`${fromDate}T00:00:00Z`) : new Date());
    assertHrCan(auth, "hr.leave.request", t.unitId);
  }
  if (!employeeId) {
    const own = await employeeOfUser(auth.active.tenantId, auth.active.userId);
    if (!own) throw new HrLeaveRequestError(LEAVE_NO_EMPLOYEE);
    employeeId = own.employeeId;
    systemId = own.systemId; // ใบลาอยู่ในระบบ HR ของแถวพนักงานตัวเอง
  }
  const ctx: Ctx = { tenantId: auth.active.tenantId, systemId };
  await requestLeave(ctx, {
    employeeId,
    actorUserId: auth.active.userId,
    type,
    fromDate,
    toDate,
    reason: String(formData.get("reason") ?? "").trim() || null,
  });
  revalidate(systemId);
}

// HR H0.7 ▸ R5: ผู้ยื่นยกเลิกใบลาของตัวเอง (ปุ่มในหน้า "อนุมัติ" → คำขอของฉัน) — ตัวกันอยู่ใน cancelLeave (ผู้ยื่นเท่านั้น · ยังรอ ·
//   ใบของเจ้าของร้านที่ยังไม่ถึงวันลา) · ร้าน = ร้านที่ล็อกอินอยู่ · ไม่ผ่าน = โยนข้อความไทยคงที่ (ไม่ส่งข้อความระบบ) ◂
const CANCEL_FORM_INVALID = "ข้อมูลใบลาไม่ครบ กรุณาเปิดหน้าใหม่แล้วลองอีกครั้ง";
export async function cancelLeaveAction(formData: FormData): Promise<void> {
  const auth = await requireTenant();
  const systemId = String(formData.get("systemId") ?? "");
  const leaveId = String(formData.get("leaveId") ?? "");
  if (!systemId || !leaveId) throw new HrLeaveRequestError(CANCEL_FORM_INVALID);
  const res = await cancelLeave({ tenantId: auth.active.tenantId, systemId }, leaveId, { actorUserId: auth.active.userId });
  if (!res.ok) throw new HrLeaveRequestError(res.reason);
  revalidate(systemId);
  revalidatePath("/app/approvals");
}

// ── อนุมัติ/ปฏิเสธการลา — availability เปลี่ยนเฉพาะเมื่ออนุมัติ (C-2) ──
export async function decideLeaveAction(formData: FormData) {
  const auth = await requireTenant();
  // ทุกสาขา: ด่านคีย์ระดับร้าน — สาขาของพนักงาน ณ วันเริ่มลาตรวจด้วย hrTarget ด้านล่าง
  assertHrCan(auth, "hr.leave.decide");
  const systemId = String(formData.get("systemId") ?? "");
  const leaveId = String(formData.get("leaveId") ?? "");
  const rawStatus = String(formData.get("status") ?? "");
  if (!systemId || !leaveId || (rawStatus !== "APPROVED" && rawStatus !== "REJECTED")) return;
  const ctx: Ctx = { tenantId: auth.active.tenantId, systemId };
  // HR H1.1 ▸ R5: ใบลา = แถวที่มีวันที่ ⇒ สาขาประจำ หรือยืมตัวที่ครอบ fromDate (มติ 4/7) · ไม่พบ = service ตอบตามเดิม ◂
  const lt = await leaveTargetOf(ctx, leaveId);
  if (lt) {
    const t = await hrTarget(auth, ctx, lt.employeeId, lt.fromDate);
    assertHrCan(auth, "hr.leave.decide", t.unitId);
  }
  // HF-HR-0: สถานะที่ผู้ใช้เห็นบนจอ (ไม่ส่ง = รายการรออนุมัติ) — จอค้างแล้วสถานะเปลี่ยน = ปฏิเสธ ไม่เปลี่ยนผลเงียบ ๆ
  const from = String(formData.get("from") ?? "") === "APPROVED" ? "APPROVED" : "PENDING";
  await decideLeave(ctx, leaveId, rawStatus, auth.active.userId, { from });
  revalidate(systemId);
}

// ── อนุมัติ/ปฏิเสธใบลาหลายใบพร้อมกัน (checkbox) — สิทธิ์เดียวกับตัดสินรายใบ ──
// คืนสรุปผลให้ useActionState แสดง inline (สำเร็จ N · ล้มเหลว M)
export type BulkLeaveState =
  | { status: "idle" }
  | { status: "done"; done: number; failed: { id: string; reason: string }[] }
  | { status: "error"; message: string };

export async function bulkDecideLeaveAction(
  systemId: string,
  _prev: BulkLeaveState,
  formData: FormData,
): Promise<BulkLeaveState> {
  const auth = await requireTenant();
  // ทุกสาขา: ด่านคีย์ระดับร้าน — สาขาของแต่ละใบตรวจในลูปด้านล่าง
  assertHrCan(auth, "hr.leave.decide");
  const leaveIds = formData.getAll("leaveIds").map(String).filter(Boolean);
  const rawStatus = String(formData.get("status") ?? "");
  if (!systemId) return { status: "error", message: "ไม่พบระบบ" };
  if (rawStatus !== "APPROVED" && rawStatus !== "REJECTED") {
    return { status: "error", message: "การตัดสินไม่ถูกต้อง" };
  }
  if (leaveIds.length === 0) return { status: "error", message: "กรุณาเลือกอย่างน้อย 1 ใบลา" };
  const ctx: Ctx = { tenantId: auth.active.tenantId, systemId };
  // HR H1.1 ▸ R5: ใบที่อยู่นอกสาขาของผู้กด ⇒ ไม่ตัดสิน · อยู่ในรายการล้มเหลวพร้อมข้อความคงที่ ◂
  const allowed: string[] = [];
  const outOfBranch: { id: string; reason: string }[] = [];
  for (const id of leaveIds) {
    const lt = await leaveTargetOf(ctx, id);
    try {
      const t = lt ? await hrTarget(auth, ctx, lt.employeeId, lt.fromDate) : {};
      assertHrCan(auth, "hr.leave.decide", t.unitId);
      allowed.push(id);
    } catch (e) {
      if (!(e instanceof HrBranchError)) throw e;
      outOfBranch.push({ id, reason: e.message });
    }
  }
  // HF-HR-0: ปุ่มนี้อยู่บนรายการ "รออนุมัติ" ⇒ ตัดสินเฉพาะใบที่ยังรอ (ไม่ถอนใบที่มีคนอนุมัติไปก่อนแบบเงียบ ๆ)
  const res = allowed.length ? await bulkDecideLeave(ctx, allowed, rawStatus, auth.active.userId, { from: "PENDING" }) : { done: 0, failed: [] };
  revalidate(systemId);
  return { status: "done", done: res.done, failed: [...res.failed, ...outOfBranch] };
}

// ── ตารางเวลาทำงานรายพนักงาน (11 ส.ค. 2026) ──
// ฟอร์มส่งมาทั้งสัปดาห์ในครั้งเดียว: off-<wd> (ติ๊ก=หยุด) · start-<wd> · end-<wd> · grace
export async function setWorkScheduleAction(formData: FormData) {
  const auth = await requireTenant();
  // ทุกสาขา: ด่านคีย์ระดับร้าน — สาขาประจำของพนักงานตรวจด้วย hrTarget ด้านล่าง
  assertHrCan(auth, "hr.employee.create");
  const systemId = String(formData.get("systemId") ?? "");
  const employeeId = String(formData.get("employeeId") ?? "");
  if (!systemId || !employeeId) return;
  const t = await hrTarget(auth, { tenantId: auth.active.tenantId, systemId }, employeeId); // HR H1.1 ▸ สาขาประจำ ◂
  assertHrCan(auth, "hr.employee.create", t.unitId);
  const toMin = (v: FormDataEntryValue | null): number | null => {
    const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(v ?? ""));
    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
  };
  const grace = Math.max(0, Math.min(120, Number(formData.get("graceMin") ?? 15) || 0));
  const rows = [];
  for (let wd = 0; wd < 7; wd++) {
    // ไม่ติ๊ก "ทำงาน" = วันนั้นไม่อยู่ในตาราง (ต่างจาก "หยุด" ที่ตั้งใจกำหนดว่าเป็นวันหยุดประจำ)
    if (formData.get(`on-${wd}`) == null) continue;
    const dayOff = formData.get(`off-${wd}`) != null;
    const startMin = toMin(formData.get(`start-${wd}`)) ?? 540;
    const endMin = toMin(formData.get(`end-${wd}`)) ?? 1080;
    rows.push({ weekday: wd, dayOff, startMin, endMin, graceMin: grace });
  }
  await setSchedule({ tenantId: auth.active.tenantId, systemId }, employeeId, rows);
  revalidatePath(`/app/sys/${systemId}/hr/employees`);
}
