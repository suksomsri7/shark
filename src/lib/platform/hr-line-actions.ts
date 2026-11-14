"use server";
// HR H4.5 ▸ server action ของการ์ด "LINE ของฉัน" (/app/me/hr/profile) — ออกรหัสผูกให้พนักงานของบัญชีที่ล็อกอิน (ตัวตนจาก session เท่านั้น ·
//   ไม่อ่านค่าใดจากฟอร์ม) · รหัสคืนครั้งเดียวถึงหน้าจอผู้ขอ · ไม่ log/audit รหัส · หน้าส่ง action นี้เป็น prop ให้ hr/line-ui.tsx (HR ไม่ import แพลตฟอร์ม) ◂
import { requireMembership, requireTenant } from "@/lib/core/context";
import { issueHrLineCode } from "@/lib/platform/hr-line";

export async function issueMyLineCodeAction(): Promise<{ ok: true; code: string; deepLink: string | null; expiresAt: string } | { ok: false; reason: string }> {
  const auth = await requireTenant();
  const m = await requireMembership(auth.active.tenantId); // สมาชิกภาพของร้านที่เปิดอยู่ (บทบาท/สาขา/คีย์จาก Membership)
  const r = await issueHrLineCode({ tenantId: m.tenantId, userId: auth.user.id, role: m.role, unitAccess: m.unitAccess, permissions: m.permissions });
  return r.ok ? { ok: true, code: r.code, deepLink: r.deepLink, expiresAt: r.expiresAt.toISOString() } : { ok: false, reason: r.reason };
}
