"use server";
// HR H3.8 ▸ server actions ของหนังสือรับรองเงินเดือน (brief §5) — ตัวห่อบาง ๆ: เซสชัน (requireTenant + requireMembership) → payslip.ts
//   ผู้ดู/ผู้ขอ = บทบาท/สาขา/คีย์จากแถว Membership (ไม่ใช่ค่าจากผู้เรียก) · ด่านจริงอยู่ใน service (อ่านฐานซ้ำ) ·
//   ทุกตัว redirect กลับหน้าเดิมพร้อมรหัสผลสั้น (allowlist ใน payslip-ui) · ไม่มีชื่อ/ข้อความอิสระบน URL · ไม่ redirect ไปเส้นทางไฟล์ (หน้าใช้ <a download>) ·
//   ไม่ส่งเวลาเข้า service · ไฟล์ "use server" export ฟังก์ชัน async อย่างเดียว ◂
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireMembership, requireTenant } from "@/lib/core/context";
import { tenantDb } from "@/lib/core/db";
import type { SelfActor } from "./self";
import { cancelMySalaryCertRequest, issueSalaryCertificate, rejectSalaryCertRequest, requestSalaryCertificate, voidSalaryCertificate, type PayslipViewer } from "./payslip";

const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const ME_PAY = "/app/me/hr/pay";
type Auth = Awaited<ReturnType<typeof requireTenant>>;
/** ผู้ดูจากสมาชิกภาพจริง (requireMembership อ่านแถว Membership ของร้านที่เปิดอยู่) */
async function viewerOf(auth: Auth): Promise<PayslipViewer & { tenantId: string; userId: string }> {
  const m = await requireMembership(auth.active.tenantId);
  return { tenantId: m.tenantId, userId: auth.user.id, role: String(m.role), unitAccess: m.unitAccess, permissions: m.permissions };
}
async function systemOf(tenantId: string, fd: FormData): Promise<string | null> {
  const systemId = s(fd, "systemId");
  if (!ID_RE.test(systemId)) return null;
  const sys = await tenantDb({ tenantId }).appSystem.findFirst({ where: { id: systemId, type: "HR" }, select: { id: true } });
  return sys?.id ?? null;
}
const gateBack = (systemId: string, code: string) => `/app/sys/${systemId}/hr/payroll?sc=${encodeURIComponent(code)}#hr-salarycert`;
const meBack = (code: string) => `${ME_PAY}?sc=${encodeURIComponent(code)}#hr-salarycert-mine`;

/** พนักงานขอหนังสือรับรอง (วัตถุประสงค์จากรายการคงที่) */
export async function requestSalaryCertAction(fd: FormData): Promise<void> {
  const auth = await requireTenant();
  const v = await viewerOf(auth);
  const actor: SelfActor = { tenantId: v.tenantId, userId: v.userId, role: v.role, unitAccess: v.unitAccess, permissions: v.permissions };
  const r = await requestSalaryCertificate(actor, { purpose: s(fd, "purpose") });
  if (r.ok) revalidatePath(ME_PAY);
  redirect(meBack(r.ok ? "requested" : r.code));
}
/** พนักงานยกเลิกคำขอของตัวเองที่ยังรออยู่ */
export async function cancelSalaryCertRequestAction(fd: FormData): Promise<void> {
  const auth = await requireTenant();
  const v = await viewerOf(auth);
  const actor: SelfActor = { tenantId: v.tenantId, userId: v.userId, role: v.role, unitAccess: v.unitAccess, permissions: v.permissions };
  const r = await cancelMySalaryCertRequest(actor, { certId: s(fd, "certId") });
  if (r.ok) revalidatePath(ME_PAY);
  redirect(meBack(r.ok ? "cancelled" : r.code));
}
/** ผู้ผ่านด่านออกหนังสือรับรอง — จากคำขอ (requestId) หรือออกตรง (employeeId + purpose) */
export async function issueSalaryCertAction(fd: FormData): Promise<void> {
  const auth = await requireTenant();
  const v = await viewerOf(auth);
  const systemId = await systemOf(v.tenantId, fd);
  if (!systemId) redirect("/app");
  const requestId = s(fd, "requestId");
  const r = await issueSalaryCertificate({ tenantId: v.tenantId, systemId }, v, requestId ? { requestId } : { employeeId: s(fd, "employeeId"), purpose: s(fd, "purpose") });
  if (r.ok) revalidatePath(`/app/sys/${systemId}/hr/payroll`);
  redirect(gateBack(systemId, r.ok ? "issued" : r.code));
}
/** ผู้ผ่านด่านไม่อนุมัติคำขอ */
export async function rejectSalaryCertAction(fd: FormData): Promise<void> {
  const auth = await requireTenant();
  const v = await viewerOf(auth);
  const systemId = await systemOf(v.tenantId, fd);
  if (!systemId) redirect("/app");
  const r = await rejectSalaryCertRequest({ tenantId: v.tenantId, systemId }, v, { requestId: s(fd, "requestId") });
  if (r.ok) revalidatePath(`/app/sys/${systemId}/hr/payroll`);
  redirect(gateBack(systemId, r.ok ? "rejected" : r.code));
}
/** เจ้าของร้านยกเลิกใบที่ออกแล้ว (เหตุผล 1–200 ตัวอักษร · เลขไม่ถูกคืน) */
export async function voidSalaryCertAction(fd: FormData): Promise<void> {
  const auth = await requireTenant();
  const v = await viewerOf(auth);
  const systemId = await systemOf(v.tenantId, fd);
  if (!systemId) redirect("/app");
  const r = await voidSalaryCertificate({ tenantId: v.tenantId, systemId }, v, { certId: s(fd, "certId"), reason: s(fd, "reason") });
  if (r.ok) revalidatePath(`/app/sys/${systemId}/hr/payroll`);
  redirect(gateBack(systemId, r.ok ? "voided" : r.code));
}
// ◂ HR H3.8
