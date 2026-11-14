"use server";
// HR H4.5 ▸ server actions ของ LINE พนักงาน — ร้าน/ผู้ใช้จาก session เสมอ · ระบบ HR จากฟอร์มใช้คู่กับร้านจาก session (ระบบ/ร้านอื่น = ไม่พบ) ·
//   ยกเลิกผูกของตัวเอง = ไม่รับ employeeId (resolveSelf) · ผู้ดูแล = employeeId จากฟอร์ม แล้ว service ตรวจสิทธิ์จากแถว Membership + สาขาเอง ·
//   ผลลัพธ์ = { ok, reason? } ข้อความไทยคงที่ของ service เท่านั้น ◂
import { revalidatePath } from "next/cache";
import { requireMembership, requireTenant } from "@/lib/core/context";
import type { SelfActor } from "./self";
import { adminUnlinkLine, LINE_LINK_TEXT, unlinkMyLine } from "./line-link";
import { LINE_SETTINGS_TEXT, saveLineNotifyPolicy } from "./line-notify";
import { HR_LINE_EVENTS } from "./line-rules";

const field = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
type Auth = Awaited<ReturnType<typeof requireTenant>>;
/** ผู้กด = บัญชีในเซสชัน + สมาชิกภาพของร้านที่เปิดอยู่ (บทบาท/สาขา/คีย์จาก Membership · service อ่านซ้ำจากฐานอีกชั้น) */
async function actorOf(auth: Auth): Promise<SelfActor> {
  const m = await requireMembership(auth.active.tenantId);
  return { tenantId: m.tenantId, userId: auth.user.id, role: m.role, unitAccess: m.unitAccess, permissions: m.permissions };
}

/** ยกเลิกการผูก LINE ของตัวเอง */
export async function unlinkMyLineAction(): Promise<{ ok: boolean; reason?: string }> {
  const auth = await requireTenant();
  const r = await unlinkMyLine(await actorOf(auth));
  if (r.ok) revalidatePath("/app/me/hr/profile");
  return r.ok ? { ok: true } : { ok: false, reason: r.reason };
}

/** ผู้ดูแลยกเลิกการผูก LINE ของพนักงาน (หน้าโปรไฟล์พนักงาน) */
export async function adminUnlinkLineAction(fd: FormData): Promise<{ ok: boolean; reason?: string }> {
  const auth = await requireTenant();
  const systemId = field(fd, "systemId");
  if (!systemId) return { ok: false, reason: LINE_LINK_TEXT.notFound };
  const r = await adminUnlinkLine({ tenantId: auth.active.tenantId, systemId }, await actorOf(auth), { employeeId: field(fd, "employeeId") });
  if (r.ok) revalidatePath(`/app/sys/${systemId}/hr/employees/${field(fd, "employeeId")}`);
  return r.ok ? { ok: true } : { ok: false, reason: r.reason };
}

/** บันทึกค่าตั้งแจ้งเตือน LINE ของระบบ HR (การ์ดหน้าตั้งค่า) */
export async function saveLinePolicyAction(fd: FormData): Promise<{ ok: true; id: string } | { ok: false; reason: string }> {
  const auth = await requireTenant();
  const systemId = field(fd, "systemId");
  if (!systemId) return { ok: false, reason: LINE_SETTINGS_TEXT.notFound };
  const r = await saveLineNotifyPolicy({ tenantId: auth.active.tenantId, systemId }, await actorOf(auth), {
    enabled: field(fd, "enabled") === "on",
    events: Object.fromEntries(HR_LINE_EVENTS.map((k) => [k, field(fd, `ev_${k}`) === "on"])),
    mode: field(fd, "mode"),
    digestAt: field(fd, "digestAt"),
    monthlyCap: field(fd, "monthlyCap"),
    unitId: field(fd, "unitId") || null,
  });
  if (r.ok) revalidatePath(`/app/sys/${systemId}/hr/settings`);
  return r;
}
