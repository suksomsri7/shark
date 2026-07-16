"use server";

import { revalidatePath } from "next/cache";
import { requireTenant } from "@/lib/core/context";
import { assertCan } from "@/lib/core/rbac";
import type { HrAttendanceKind, HrLeaveType } from "@prisma/client";
import {
  clock,
  createEmployee,
  decideLeave,
  requestLeave,
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
