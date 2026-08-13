"use server";

import { revalidatePath } from "next/cache";
import { requireTenant } from "@/lib/core/context";
import { assertCan } from "@/lib/core/rbac";
import type { HrAttendanceKind, HrLeaveType } from "@prisma/client";
import { checkRateLimit } from "@/lib/core/rate-limit";
import {
  clock,
  clockWithPin,
  createEmployee,
  decideLeave,
  bulkDecideLeave,
  requestLeave,
  setPin,
  setSchedule,
  type Ctx,
} from "./service";

// ตรวจสิทธิ์โมดูล HR (system-scoped) — OWNER/MANAGER ผ่าน · STAFF ตาม permission
// convention action = "hr.<entity>.<verb>" (F6 ratchet บังคับให้ไฟล์นี้เรียก assertCan)
function assertHrCan(auth: Awaited<ReturnType<typeof requireTenant>>, action: string) {
  assertCan(
    {
      role: auth.active.role,
      unitAccess: auth.active.unitAccess as string[],
      permissions: auth.active.permissions as Record<string, unknown>,
    },
    { module: "hr", action },
  );
}

const KINDS = new Set<HrAttendanceKind>(["IN", "OUT"]);
const LEAVE_TYPES = new Set<HrLeaveType>(["SICK", "PERSONAL", "VACATION", "OTHER"]);

const revalidate = (systemId: string) => revalidatePath(`/app/sys/${systemId}`);

// ── เพิ่มพนักงาน ──
export async function createEmployeeAction(formData: FormData) {
  const auth = await requireTenant();
  assertHrCan(auth, "hr.employee.create");
  const systemId = String(formData.get("systemId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!systemId || !name) return;
  const ctx: Ctx = { tenantId: auth.active.tenantId, systemId };
  await createEmployee(ctx, {
    name,
    phone: String(formData.get("phone") ?? "").trim() || null,
    position: String(formData.get("position") ?? "").trim() || null,
    pinCode: String(formData.get("pinCode") ?? "").trim() || null,
  });
  revalidate(systemId);
}

// ── ลงเวลา (เข้า/ออก) ──
export async function clockAction(formData: FormData) {
  const auth = await requireTenant();
  assertHrCan(auth, "hr.attendance.clock");
  const systemId = String(formData.get("systemId") ?? "");
  const employeeId = String(formData.get("employeeId") ?? "");
  const rawKind = String(formData.get("kind") ?? "");
  if (!systemId || !employeeId || !KINDS.has(rawKind as HrAttendanceKind)) return;
  const ctx: Ctx = { tenantId: auth.active.tenantId, systemId };
  await clock(ctx, { employeeId, kind: rawKind as HrAttendanceKind });
  revalidate(systemId);
}

// ── kiosk: ตั้ง PIN + พนักงานลงเวลาเอง ──
// ตั้ง PIN = สิทธิ์ระดับจัดการพนักงาน (เท่ากับเพิ่มพนักงาน)
export type PinState = { status: "idle" } | { status: "ok"; message: string } | { status: "error"; message: string };
export async function setPinAction(systemId: string, employeeId: string, _prev: PinState, formData: FormData): Promise<PinState> {
  const auth = await requireTenant();
  assertHrCan(auth, "hr.employee.create");
  const pin = String(formData.get("pin") ?? "");
  const res = await setPin({ tenantId: auth.active.tenantId, systemId }, employeeId, pin);
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
 * 🔴 กันเดา PIN: 5 ครั้ง/นาที ต่อพนักงาน 1 คน (ยิงรัวไม่ได้) — limiter เป็น in-memory ต่อ instance
 *    ตามข้อจำกัดเดิมของ core/rate-limit · PIN 4 หลักจึงถูกจำกัดที่ชั้นนี้ ไม่ใช่ที่ความยาว PIN
 */
export async function kioskClockAction(systemId: string, _prev: KioskState, formData: FormData): Promise<KioskState> {
  const auth = await requireTenant();
  assertHrCan(auth, "hr.attendance.clock");
  const employeeId = String(formData.get("employeeId") ?? "");
  const pin = String(formData.get("pin") ?? "");
  if (!employeeId) return { status: "error", message: "เลือกชื่อของคุณก่อน" };
  if (!/^\d{4,6}$/.test(pin.trim())) return { status: "error", message: "ใส่ PIN 4-6 หลัก" };
  const gate = checkRateLimit(`hr-kiosk:${employeeId}`, { limit: 5, windowMs: 60_000 });
  if (!gate.ok) return { status: "error", message: `ลองใหม่ในอีก ${gate.retryAfterSec} วินาที` };

  const res = await clockWithPin({ tenantId: auth.active.tenantId, systemId }, employeeId, pin);
  if (!res.ok) return { status: "error", message: res.reason };
  revalidatePath(`/app/sys/${systemId}/hr/attendance`);
  const time = new Intl.DateTimeFormat("th-TH", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" }).format(res.at);
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
export async function requestLeaveAction(formData: FormData) {
  const auth = await requireTenant();
  assertHrCan(auth, "hr.leave.request");
  const systemId = String(formData.get("systemId") ?? "");
  const employeeId = String(formData.get("employeeId") ?? "");
  const rawType = String(formData.get("type") ?? "PERSONAL");
  const type = (LEAVE_TYPES.has(rawType as HrLeaveType) ? rawType : "PERSONAL") as HrLeaveType;
  const fromDate = String(formData.get("fromDate") ?? "").trim();
  const toDate = String(formData.get("toDate") ?? "").trim();
  if (!systemId || !employeeId || !fromDate || !toDate) return;
  const ctx: Ctx = { tenantId: auth.active.tenantId, systemId };
  await requestLeave(ctx, {
    employeeId,
    type,
    fromDate,
    toDate,
    reason: String(formData.get("reason") ?? "").trim() || null,
  });
  revalidate(systemId);
}

// ── อนุมัติ/ปฏิเสธการลา — availability เปลี่ยนเฉพาะเมื่ออนุมัติ (C-2) ──
export async function decideLeaveAction(formData: FormData) {
  const auth = await requireTenant();
  assertHrCan(auth, "hr.leave.decide");
  const systemId = String(formData.get("systemId") ?? "");
  const leaveId = String(formData.get("leaveId") ?? "");
  const rawStatus = String(formData.get("status") ?? "");
  if (!systemId || !leaveId || (rawStatus !== "APPROVED" && rawStatus !== "REJECTED")) return;
  const ctx: Ctx = { tenantId: auth.active.tenantId, systemId };
  await decideLeave(ctx, leaveId, rawStatus, auth.active.userId);
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
  assertHrCan(auth, "hr.leave.decide");
  const leaveIds = formData.getAll("leaveIds").map(String).filter(Boolean);
  const rawStatus = String(formData.get("status") ?? "");
  if (!systemId) return { status: "error", message: "ไม่พบระบบ" };
  if (rawStatus !== "APPROVED" && rawStatus !== "REJECTED") {
    return { status: "error", message: "การตัดสินไม่ถูกต้อง" };
  }
  if (leaveIds.length === 0) return { status: "error", message: "กรุณาเลือกอย่างน้อย 1 ใบลา" };
  const ctx: Ctx = { tenantId: auth.active.tenantId, systemId };
  const res = await bulkDecideLeave(ctx, leaveIds, rawStatus, auth.active.userId);
  revalidate(systemId);
  return { status: "done", done: res.done, failed: res.failed };
}

// ── ตารางเวลาทำงานรายพนักงาน (11 ส.ค. 2026) ──
// ฟอร์มส่งมาทั้งสัปดาห์ในครั้งเดียว: off-<wd> (ติ๊ก=หยุด) · start-<wd> · end-<wd> · grace
export async function setWorkScheduleAction(formData: FormData) {
  const auth = await requireTenant();
  assertHrCan(auth, "hr.employee.create");
  const systemId = String(formData.get("systemId") ?? "");
  const employeeId = String(formData.get("employeeId") ?? "");
  if (!systemId || !employeeId) return;
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
