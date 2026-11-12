"use server";
// HR H3.2 ▸ server actions ของกฎหักสาย/ขาด — บันทึกกฎ (เจ้าของร้าน) · ปุ่ม "คำนวณรายการหักสาย/ขาด" (Q4 — ทางเดียวที่สร้างรายการ) ·
//   ระบบ HR อ่านจากฟอร์มแล้วตรวจว่าเป็นของร้านนี้ · สิทธิ์/สาขา/งวด ตัดสินใน service (attendance-pay.ts) · ไม่ส่งเวลาเข้า service ·
//   ไฟล์ "use server" export ฟังก์ชันอย่างเดียว (ไม่มี type) ◂
import { revalidatePath } from "next/cache";
import { requireTenant } from "@/lib/core/context";
import { tenantDb } from "@/lib/core/db";
import { assertCan } from "@/lib/core/rbac";
import { hrViewerOf } from "./privacy";
import { canSyncAttendancePay, saveAttendancePayPolicy, syncAttendanceDeductions } from "./attendance-pay";
import { ATT_TEXT } from "./attendance-pay-rules";

async function systemOf(tenantId: string, formData: FormData): Promise<string | null> {
  const systemId = String(formData.get("systemId") ?? "").trim();
  if (!systemId) return null;
  const sys = await tenantDb({ tenantId }).appSystem.findFirst({ where: { id: systemId, type: "HR" }, select: { id: true } });
  return sys?.id ?? null;
}

type Auth = Awaited<ReturnType<typeof requireTenant>>;
/** ด่านคีย์ระดับร้าน — service ตรวจซ้ำละเอียดกว่า (เจ้าของร้านเท่านั้นสำหรับกฎ · hr.payroll.read + hr.payadjust.request สำหรับคำนวณ · ขอบเขตสาขา) */
function keyGate(auth: Auth, action: "hr.payroll.read" | "hr.employee.create"): boolean {
  try {
    assertCan(
      { role: auth.active.role, unitAccess: (Array.isArray(auth.active.unitAccess) ? auth.active.unitAccess : []) as string[], permissions: (auth.active.permissions ?? {}) as Record<string, unknown> },
      { module: "hr", action },
    );
    return true;
  } catch {
    return false;
  }
}

/** บันทึกกฎหักสาย/ขาด — เจ้าของร้านเท่านั้น (checkbox ที่ไม่ติ๊ก = false · ตัวเลขตรวจเข้มใน service) */
export async function saveAttendancePayPolicyAction(formData: FormData): Promise<{ ok: true; id: string } | { ok: false; reason: string }> {
  const auth = await requireTenant();
  if (auth.active.role !== "OWNER" || !keyGate(auth, "hr.employee.create")) return { ok: false, reason: ATT_TEXT.policyNo };
  const systemId = await systemOf(auth.active.tenantId, formData);
  if (!systemId) return { ok: false, reason: ATT_TEXT.failed };
  const on = (k: string) => formData.get(k) === "on";
  const r = await saveAttendancePayPolicy({ tenantId: auth.active.tenantId, systemId }, hrViewerOf(auth), {
    enabled: on("enabled"),
    late: on("late"),
    earlyOut: on("earlyOut"),
    absent: on("absent"),
    freeMin: String(formData.get("freeMin") ?? ""),
    stepMin: String(formData.get("stepMin") ?? ""),
  });
  revalidatePath(`/app/sys/${systemId}/hr/settings`);
  return r;
}

/** คำนวณรายการหักสาย/ขาดของงวด (OWNER · hr.payroll.read + hr.payadjust.request) — ผล = จำนวนเท่านั้น */
export async function syncAttendanceDeductionsAction(formData: FormData): Promise<{ ok: true; created: number; rejected: number; refunds: number; waiting: number; next: string | null } | { ok: false; reason: string }> {
  const auth = await requireTenant();
  const viewer = hrViewerOf(auth);
  if (!canSyncAttendancePay(viewer) || (auth.active.role !== "OWNER" && !keyGate(auth, "hr.payroll.read"))) return { ok: false, reason: ATT_TEXT.syncNo };
  const systemId = await systemOf(auth.active.tenantId, formData);
  if (!systemId) return { ok: false, reason: ATT_TEXT.syncNo };
  const after = String(formData.get("after") ?? "").trim();
  const r = await syncAttendanceDeductions({ tenantId: auth.active.tenantId, systemId }, viewer, { periodKey: String(formData.get("periodKey") ?? ""), ...(after ? { after } : {}) });
  revalidatePath(`/app/sys/${systemId}/hr/attendance`);
  revalidatePath(`/app/sys/${systemId}/hr/payroll`);
  return r.ok ? { ok: true, created: r.created, rejected: r.rejected, refunds: r.refunds, waiting: r.wait.length, next: r.next } : { ok: false, reason: r.reason };
}
