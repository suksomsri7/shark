"use server";
// HR H2.9 ▸ server actions ของคำขอ OT (แบบ swap-actions.ts) — ร้าน/ผู้ใช้มาจาก session เสมอ · ระบบ HR จากฟอร์มใช้คู่กับร้านจาก session
//   (ระบบอื่น/ร้านอื่น = ไม่พบ) · ยื่นของตัวเอง = ไม่ส่ง employeeId (service หาพนักงานจากบัญชีผู้ใช้ — employeeOfUser · §C.7) ·
//   ยื่นแทน = employeeId จากฟอร์ม แล้ว service ตรวจสิทธิ์/สาขาเอง · เวลา = เวลาจริงของเซิร์ฟเวอร์ (action ไม่ส่งเวลาเข้า service) ·
//   ผลลัพธ์ = { ok, reason? } ข้อความไทยคงที่ของ service เท่านั้น ◂
import { revalidatePath } from "next/cache";
import { requireTenant } from "@/lib/core/context";
import { assertCan } from "@/lib/core/rbac";
import { hrViewerOf } from "./privacy";
import { SETTINGS_TEXT } from "./settings";
import { cancelOtRequest, decideOtRequest, OT_TEXT, requestOt, revokeOtRequest, saveOtPolicy } from "./ot";

type Auth = Awaited<ReturnType<typeof requireTenant>>;
const field = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
function ctxOf(auth: Auth, fd: FormData): { tenantId: string; systemId: string } | null {
  const systemId = field(fd, "systemId");
  return systemId ? { tenantId: auth.active.tenantId, systemId } : null;
}
/** ด่านคีย์ระดับร้านก่อนเรียก service (service ตรวจซ้ำแบบเข้ม: สาขา · ของตัวเอง · ผู้ยื่นแทน) — ไม่ผ่าน = false (ผู้เรียกคืนข้อความคงที่) */
function can(auth: Auth, action: string): boolean {
  try {
    assertCan(hrViewerOf(auth), { module: "hr", action });
    return true;
  } catch {
    return false;
  }
}
const done = (systemId: string) => {
  revalidatePath(`/app/sys/${systemId}/hr/leave`);
  revalidatePath(`/app/sys/${systemId}/hr/settings`);
};

/** ยื่นคำขอ OT — ช่อง employeeId ว่าง = ของตัวเอง (self) */
export async function requestOtAction(_prev: unknown, fd: FormData): Promise<{ ok: boolean; reason?: string; warnWeek?: boolean }> {
  const auth = await requireTenant();
  const ctx = ctxOf(auth, fd);
  if (!ctx) return { ok: false, reason: OT_TEXT.notFound };
  const employeeId = field(fd, "employeeId");
  const r = await requestOt(ctx, hrViewerOf(auth), { ...(employeeId ? { employeeId } : {}), date: field(fd, "date"), start: field(fd, "start"), end: field(fd, "end"), reason: field(fd, "reason") });
  if (!r.ok) return { ok: false, reason: r.reason };
  done(ctx.systemId);
  return { ok: true, warnWeek: r.warnWeek };
}

export async function decideOtAction(_prev: unknown, fd: FormData): Promise<{ ok: boolean; reason?: string }> {
  const auth = await requireTenant();
  const ctx = ctxOf(auth, fd);
  if (!ctx) return { ok: false, reason: OT_TEXT.notFound };
  if (!can(auth, "hr.payadjust.approve")) return { ok: false, reason: OT_TEXT.notFound };
  const d = field(fd, "decision");
  const r = await decideOtRequest(ctx, hrViewerOf(auth), field(fd, "id"), d === "APPROVED" ? "APPROVED" : d === "REJECTED" ? "REJECTED" : ("" as "APPROVED"));
  if (!r.ok) return { ok: false, reason: r.reason };
  done(ctx.systemId);
  return { ok: true };
}

export async function revokeOtAction(_prev: unknown, fd: FormData): Promise<{ ok: boolean; reason?: string }> {
  const auth = await requireTenant();
  const ctx = ctxOf(auth, fd);
  if (!ctx) return { ok: false, reason: OT_TEXT.notFound };
  if (!can(auth, "hr.payadjust.approve")) return { ok: false, reason: OT_TEXT.notFound };
  const r = await revokeOtRequest(ctx, hrViewerOf(auth), field(fd, "id"), { reason: field(fd, "reason") });
  if (!r.ok) return { ok: false, reason: r.reason };
  done(ctx.systemId);
  return { ok: true };
}

export async function cancelOtAction(_prev: unknown, fd: FormData): Promise<{ ok: boolean; reason?: string }> {
  const auth = await requireTenant();
  const ctx = ctxOf(auth, fd);
  if (!ctx) return { ok: false, reason: OT_TEXT.notFound };
  const r = await cancelOtRequest(ctx, hrViewerOf(auth), field(fd, "id"));
  if (!r.ok) return { ok: false, reason: r.reason };
  done(ctx.systemId);
  return { ok: true };
}

/** ตั้งนโยบาย OT (หน้าตั้งค่า — ผลเป็นข้อความคงที่ ⇒ หน้าแปลงเป็นรหัสสั้น ?msg=) */
export async function saveOtPolicyAction(fd: FormData): Promise<{ ok: true; id: string } | { ok: false; reason: string }> {
  const auth = await requireTenant();
  const ctx = ctxOf(auth, fd);
  if (!ctx) return { ok: false, reason: OT_TEXT.notFound };
  if (!can(auth, "hr.employee.create")) return { ok: false, reason: SETTINGS_TEXT.noPermission };
  const r = await saveOtPolicy(ctx, hrViewerOf(auth), { afterHours: field(fd, "afterHours"), maxAheadDays: field(fd, "maxAheadDays"), otRoundMin: field(fd, "otRoundMin") });
  if (r.ok) done(ctx.systemId);
  return r;
}
