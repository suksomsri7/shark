"use server";
// HR H3.1 ▸ server actions ของชั่วโมงทำงาน — ดึงชั่วโมงทำงานของงวด (แผง 06) · ค่าตั้งชั่วโมงทำงานปกติต่อวัน (เจ้าของร้าน) ·
//   ระบบ HR อ่านจากฟอร์มแล้วตรวจว่าเป็นของร้านนี้ · สิทธิ์/สาขา/งวด ตัดสินใน service (work-entries.ts) · ไม่ส่งเวลาเข้า service ·
//   ไฟล์ "use server" export ฟังก์ชันอย่างเดียว (ไม่มี type) ◂
import { revalidatePath } from "next/cache";
import { requireTenant } from "@/lib/core/context";
import { tenantDb } from "@/lib/core/db";
import { assertCan } from "@/lib/core/rbac";
import { hrViewerOf } from "./privacy";
import { buildWorkEntrySnapshot, finalizeWorkEntryDays, setNormalMinutesPerDay, WE_TEXT } from "./work-entries";

async function systemOf(tenantId: string, formData: FormData): Promise<string | null> {
  const systemId = String(formData.get("systemId") ?? "").trim();
  if (!systemId) return null;
  const sys = await tenantDb({ tenantId }).appSystem.findFirst({ where: { id: systemId, type: "HR" }, select: { id: true } });
  return sys?.id ?? null;
}

type Auth = Awaited<ReturnType<typeof requireTenant>>;
/** ด่านคีย์ระดับร้าน — service ตรวจซ้ำละเอียดกว่า (OWNER · hr.payroll.read · เจ้าของร้านเท่านั้นสำหรับค่าตั้ง · ขอบเขตสาขา) */
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

/** ดึงชั่วโมงทำงานของงวด (OWNER · hr.payroll.read) — ผล = จำนวนเท่านั้น */
export async function buildWorkEntriesAction(formData: FormData): Promise<{ ok: true; written: number; blocking: number; next: string | null } | { ok: false; reason: string }> {
  const auth = await requireTenant();
  if (auth.active.role !== "OWNER" && !keyGate(auth, "hr.payroll.read")) return { ok: false, reason: WE_TEXT.buildNo };
  const systemId = await systemOf(auth.active.tenantId, formData);
  if (!systemId) return { ok: false, reason: WE_TEXT.buildNo };
  const periodKey = String(formData.get("periodKey") ?? "");
  const after = String(formData.get("after") ?? "").trim(); // ดึงต่อจากหน้าที่ค้าง (r2 7)
  const r = await buildWorkEntrySnapshot({ tenantId: auth.active.tenantId, systemId }, hrViewerOf(auth), { periodKey, ...(after ? { after } : {}) });
  revalidatePath(`/app/sys/${systemId}/hr/payroll`);
  return r.ok ? { ok: true, written: r.written, blocking: r.blocking, next: r.next } : { ok: false, reason: r.reason };
}

/** ปิดผลวันที่ค้างของงวด (ตัวปิดวันของ H2.5) — OWNER · hr.payroll.read · แล้วกดดึงชั่วโมงทำงานใหม่ */
export async function finalizeWorkEntriesAction(formData: FormData): Promise<{ ok: true; finalized: number } | { ok: false; reason: string }> {
  const auth = await requireTenant();
  if (auth.active.role !== "OWNER" && !keyGate(auth, "hr.payroll.read")) return { ok: false, reason: WE_TEXT.buildNo };
  const systemId = await systemOf(auth.active.tenantId, formData);
  if (!systemId) return { ok: false, reason: WE_TEXT.buildNo };
  const r = await finalizeWorkEntryDays({ tenantId: auth.active.tenantId, systemId }, hrViewerOf(auth), { periodKey: String(formData.get("periodKey") ?? "") });
  revalidatePath(`/app/sys/${systemId}/hr/payroll`);
  return r;
}

/** ชั่วโมงทำงานปกติต่อวัน (นาที 60–720) — เจ้าของร้านเท่านั้น */
export async function saveNormalMinutesAction(formData: FormData): Promise<{ ok: true; id: string } | { ok: false; reason: string }> {
  const auth = await requireTenant();
  if (!keyGate(auth, "hr.employee.create")) return { ok: false, reason: WE_TEXT.normalOwner };
  const systemId = await systemOf(auth.active.tenantId, formData);
  if (!systemId) return { ok: false, reason: WE_TEXT.normalOwner };
  const r = await setNormalMinutesPerDay({ tenantId: auth.active.tenantId, systemId }, hrViewerOf(auth), formData.get("normalMinutesPerDay"));
  revalidatePath(`/app/sys/${systemId}/hr/settings`);
  return r;
}
