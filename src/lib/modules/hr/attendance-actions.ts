"use server";
// HR H2.5 ▸ server actions ของหน้าลงเวลา (คิดผลใหม่) และการ์ดตั้งค่า (นโยบายตัดสินผล/การเตือน) — รับ FormData ตัวเดียว
//   ระบบ HR อ่านจากฟอร์มแล้วตรวจว่าเป็นของร้านนี้ · สิทธิ์/สาขา/เหตุผล/งวดเงินเดือน ตัดสินใน service (judge.ts · clock-settings.ts) ·
//   ไม่ส่งเวลา (now) เข้า service (R13) · ผลลัพธ์ = { ok, … } | { ok:false, reason ไทยคงที่ } ◂
import { revalidatePath } from "next/cache";
import { requireTenant } from "@/lib/core/context";
import { tenantDb } from "@/lib/core/db";
import { assertCan } from "@/lib/core/rbac";
import { hrViewerOf } from "./privacy";
import { JUDGE_TEXT, recomputeAttendanceDay } from "./judge";
import { saveAttendancePolicy, type AttendancePolicyInput } from "./clock-settings";
import { SETTINGS_TEXT } from "./settings";

const NO_SYSTEM_TEXT = "ไม่พบระบบพนักงานนี้";

async function systemOf(tenantId: string, formData: FormData): Promise<string | null> {
  const systemId = String(formData.get("systemId") ?? "").trim();
  if (!systemId) return null;
  const sys = await tenantDb({ tenantId }).appSystem.findFirst({ where: { id: systemId, type: "HR" }, select: { id: true } });
  return sys?.id ?? null;
}
type Auth = Awaited<ReturnType<typeof requireTenant>>;
/** ด่านคีย์ระดับร้าน (OWNER · MANAGER · hr.employee.create) — service ตรวจซ้ำละเอียดกว่า (สาขา · แถวของตัวเอง · ค่าทั้งร้าน) */
function keyGate(auth: Auth): boolean {
  try {
    assertCan(
      { role: auth.active.role, unitAccess: (Array.isArray(auth.active.unitAccess) ? auth.active.unitAccess : []) as string[], permissions: (auth.active.permissions ?? {}) as Record<string, unknown> },
      { module: "hr", action: "hr.employee.create" },
    );
    return true;
  } catch {
    return false;
  }
}
const text = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" ? v : undefined;
};

/** คิดผลการลงเวลาของแถวหนึ่งใหม่ (เหตุผล 3–200 ตัวอักษร) */
export async function recomputeAttendanceDayAction(formData: FormData): Promise<{ ok: true; changed: boolean } | { ok: false; reason: string }> {
  const auth = await requireTenant();
  if (!keyGate(auth)) return { ok: false, reason: JUDGE_TEXT.rNoPerm };
  const systemId = await systemOf(auth.active.tenantId, formData);
  if (!systemId) return { ok: false, reason: NO_SYSTEM_TEXT };
  const ctx = { tenantId: auth.active.tenantId, systemId };
  const r = await recomputeAttendanceDay(ctx, hrViewerOf(auth), { dayId: text(formData, "dayId") ?? "", reason: text(formData, "reason") ?? "" });
  if (!r.ok) return r;
  revalidatePath(`/app/sys/${systemId}/hr/attendance`);
  return { ok: true, changed: r.changed };
}

/** บันทึกนโยบายตัดสินผล/การเตือน (ช่องว่าง = คงค่าเดิม · absentAfterMin ว่าง = ถึงเวลาเลิกกะ) */
export async function saveAttendancePolicyAction(formData: FormData): Promise<{ ok: true; id: string } | { ok: false; reason: string }> {
  const auth = await requireTenant();
  if (!keyGate(auth)) return { ok: false, reason: SETTINGS_TEXT.noPermission };
  const systemId = await systemOf(auth.active.tenantId, formData);
  if (!systemId) return { ok: false, reason: NO_SYSTEM_TEXT };
  const ctx = { tenantId: auth.active.tenantId, systemId };
  const input: AttendancePolicyInput = {};
  for (const k of ["notInAlertMin", "earlyOutGraceMin", "otStepMin"] as const) {
    const v = text(formData, k);
    if (v !== undefined && v.trim() !== "") input[k] = v.trim();
  }
  const ab = text(formData, "absentAfterMin");
  if (ab !== undefined) input.absentAfterMin = ab.trim() === "" ? null : ab.trim();
  for (const k of ["flagEarlyOut", "alertsOn", "alertEmployee"] as const) input[k] = formData.get(k) === "on" || formData.get(k) === "true";
  const r = await saveAttendancePolicy(ctx, hrViewerOf(auth), input);
  if (r.ok) revalidatePath(`/app/sys/${systemId}/hr/settings`);
  return r;
}
