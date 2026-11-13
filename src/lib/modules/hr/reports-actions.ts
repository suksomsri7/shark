"use server";
// HR H3.9 ▸ action ของหน้ารายงาน/การ์ดทะเบียน — ส่งต่อ service ทั้งหมด (ด่าน: สมาชิกภาพจริง · ขอบเขตสาขาของพนักงาน · สิทธิ์เงินเดือน อยู่ใน reports.ts)
//   ผลการกด = redirect กลับพร้อมรหัสสั้น (ok · NO · INPUT · OWNER · ACK) — ไม่มีข้อความอิสระบน URL ◂
import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { requireTenant } from "@/lib/core/context";
import { assertCan, type MembershipCtx } from "@/lib/core/rbac";
import { hrViewerOf } from "./privacy";
import { saveRegisterFields, setReportSettings } from "./reports";

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const idOf = (v: FormDataEntryValue | null) => (typeof v === "string" && ID_RE.test(v) ? v : "");

type Auth = Awaited<ReturnType<typeof requireTenant>>;
/**
 * ด่านคีย์ระดับร้าน (หยาบ) ก่อนเรียก service — all-branch: ไม่ส่ง unitId (ทุกสาขา) เพราะสาขาของพนักงานตรวจใน service จากฐาน (unitTargetOf) ·
 * ด่านจริงอยู่ใน reports.ts (สมาชิกภาพจริง · ขอบเขตสาขา · สิทธิ์เงินเดือน · เจ้าของร้าน)
 */
function keyGate(auth: Auth, action: string): boolean {
  try {
    const m = { role: auth.active.role, unitAccess: (Array.isArray(auth.active.unitAccess) ? auth.active.unitAccess : []) as string[], permissions: (auth.active.permissions ?? {}) as Record<string, unknown> };
    assertCan(m as MembershipCtx, { module: "hr", action });
    return true;
  } catch {
    return false;
  }
}

export async function saveRegisterFieldsAction(formData: FormData): Promise<void> {
  const auth = await requireTenant();
  const systemId = idOf(formData.get("systemId"));
  const employeeId = idOf(formData.get("employeeId"));
  if (!systemId || !employeeId) redirect("/app");
  if (!keyGate(auth, "hr.employee.create")) redirect(`/app/sys/${systemId}/hr/employees/${employeeId}?reg=NO#hr-register`); // all-branch (สาขาตรวจใน service)
  const r = await saveRegisterFields(
    { tenantId: auth.active.tenantId, systemId },
    hrViewerOf(auth),
    {
      employeeId,
      nationality: formData.has("nationality") ? String(formData.get("nationality") ?? "") : undefined,
      otherBenefits: formData.has("otherBenefits") ? String(formData.get("otherBenefits") ?? "") : undefined,
    },
    { locale: await getLocale() },
  );
  redirect(`/app/sys/${systemId}/hr/employees/${employeeId}?reg=${r.ok ? "ok" : encodeURIComponent(r.code)}#hr-register`);
}

export async function saveReportSettingsAction(formData: FormData): Promise<void> {
  const auth = await requireTenant();
  const systemId = idOf(formData.get("systemId"));
  if (!systemId) redirect("/app");
  if (auth.active.role !== "OWNER" || !keyGate(auth, "hr.payroll.read")) redirect(`/app/sys/${systemId}/hr/reports?report=register&rs=OWNER#hrrep-fullid`); // all-branch · เจ้าของร้านเท่านั้น
  const r = await setReportSettings(
    { tenantId: auth.active.tenantId, systemId },
    hrViewerOf(auth),
    { registerFullId: formData.get("registerFullId") === "1", acknowledge: formData.get("acknowledge") === "1" },
    { locale: await getLocale() },
  );
  redirect(`/app/sys/${systemId}/hr/reports?report=register&rs=${r.ok ? "ok" : encodeURIComponent(r.code)}#hrrep-fullid`);
}
// ◂ HR H3.9
