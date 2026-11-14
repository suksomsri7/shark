// ส่วน "อันตราย" ของตั้งค่ากิจการในแอป (14 พ.ย. 2026 · แบบ bizdelete.png) — ขอลบ/ยกเลิกลบกิจการ + ส่งออกข้อมูลร้าน
//
// 🔴 ใช้ service เดิมของเว็บ (src/lib/platform/pdpa.ts) ตัวเดียวกับหน้า /app/settings/privacy — ไม่มีตรรกะลบ/ส่งออกซ้ำ
//   สิทธิ์ = OWNER ของกิจการเท่านั้น (ตรงกับ `requireOwner` ใน src/lib/pdpa/actions.ts) — route ตรวจจากด่าน (Membership สด)
//   ลบจริง = cron `sweepPendingDeletes` เมื่อครบ 30 วัน (ระหว่างนี้ร้านใช้งานได้ปกติ · requireTenant/requireMobile ไม่กั้น PENDING_DELETE)
// ขอลบ: ต้องส่งชื่อกิจการที่พิมพ์ยืนยัน (ตรวจซ้ำฝั่งเซิร์ฟเวอร์ · trim · ตรงทุกตัว) — กันแอปรุ่นที่ข้ามช่องยืนยัน
// ส่งออก: แอปไม่มีโมดูลไฟล์/แชร์ (expo-file-system/expo-sharing) ⇒ ออก "ลิงก์ดาวน์โหลดอายุสั้น" ให้แอปเปิดในเบราว์เซอร์ของเครื่อง
//   ลิงก์ = signed-link (HMAC · purpose `tenant.export` · subject = userId · อายุ 5 นาที) · เปิดได้ไม่เกิน 3 ครั้ง/ลิงก์
//   ตอนเปิดตรวจสิทธิ์สดอีกรอบ (ยังเป็น OWNER ของร้านนั้น · ร้านไม่ถูกระงับ) · ไม่มี Bearer ใน URL · ไม่มีลิงก์สาธารณะอายุยาว
// AuditLog: tenant.deletion.requested · tenant.deletion.cancelled · tenant.data.exported (via mobile)
// ห้าม import next/* (ถูกเรียกจาก route + ข้อสอบนอก Next context)
import { prisma } from "@/lib/core/db";
import { writeAudit } from "@/lib/core/audit";
import { sha256 } from "@/lib/core/hash";
import { checkRateLimitDb } from "@/lib/core/rate-limit-db";
import { signLink, verifyLink } from "@/lib/core/signed-link";
import { cancelTenantDeletion, exportTenantData, requestTenantDeletion } from "@/lib/platform/pdpa";
import { deletionOf, type BusinessProfile } from "@/lib/mobile/business-profile";

export const OWNER_ONLY = "เฉพาะเจ้าของกิจการ (OWNER) เท่านั้นที่ทำรายการนี้ได้";
export const EXPORT_PURPOSE = "tenant.export";
export const EXPORT_LINK_MIN = 5;
const EXPORT_LINK_USES = 3;

/** ผิดกติกา (ข้อความไทยให้ผู้ใช้ · route ตอบ 400/409) */
export class BusinessDangerError extends Error {
  constructor(
    message: string,
    readonly code: "name_mismatch" | "not_active" | "not_pending",
  ) {
    super(message);
  }
}

async function tenantRow(tenantId: string) {
  return prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true, slug: true, status: true, deleteRequestedAt: true } });
}

/** ขอลบกิจการ (ACTIVE → PENDING_DELETE) · confirmName ต้องตรงชื่อร้าน (trim) */
export async function requestBusinessDeletion(tenantId: string, userId: string, confirmName: string): Promise<BusinessProfile["deletion"]> {
  const t = await tenantRow(tenantId);
  if (!t || confirmName.trim() !== t.name.trim()) throw new BusinessDangerError("ชื่อที่พิมพ์ไม่ตรงกับชื่อกิจการ — พิมพ์ให้ตรงทุกตัวอักษร", "name_mismatch");
  if (t.status === "PENDING_DELETE") return deletionOf(t); // ขอไว้แล้ว = ตอบสถานะเดิม (idempotent · ไม่เริ่มนับใหม่)
  const ok = await requestTenantDeletion(tenantId);
  if (!ok) throw new BusinessDangerError("กิจการนี้อยู่ในสถานะที่ขอลบไม่ได้ — ติดต่อทีมงาน SHARK", "not_active");
  const after = await tenantRow(tenantId);
  await writeAudit({ tenantId, actorId: userId, action: "tenant.deletion.requested", targetType: "Tenant", targetId: tenantId, before: { status: t.status }, after: { status: after?.status, deleteRequestedAt: after?.deleteRequestedAt, via: "mobile.business" } });
  return deletionOf(after);
}

/** ยกเลิกการขอลบ (PENDING_DELETE → ACTIVE) · ไม่ได้ขอลบไว้ = ไม่ทำอะไร (idempotent) */
export async function cancelBusinessDeletion(tenantId: string, userId: string): Promise<null> {
  const t = await tenantRow(tenantId);
  if (!t || t.status !== "PENDING_DELETE") return null;
  const ok = await cancelTenantDeletion(tenantId);
  if (ok) await writeAudit({ tenantId, actorId: userId, action: "tenant.deletion.cancelled", targetType: "Tenant", targetId: tenantId, before: { status: t.status, deleteRequestedAt: t.deleteRequestedAt }, after: { status: "ACTIVE", via: "mobile.business" } });
  return null;
}

/** ออกลิงก์ดาวน์โหลดอายุสั้น (path + token) — route ประกอบ URL เต็มเอง */
export function issueExportToken(tenantId: string, userId: string): { token: string; expiresAt: string } {
  const token = signLink({ tenantId, purpose: EXPORT_PURPOSE, subjectId: userId, expMin: EXPORT_LINK_MIN });
  return { token, expiresAt: new Date(Date.now() + EXPORT_LINK_MIN * 60_000).toISOString() };
}

export type ExportFile = { json: string; filename: string };

/**
 * แลก token → ไฟล์ส่งออก · ล้มทุกกรณี (ลายเซ็นผิด/หมดอายุ/ใช้เกิน/ไม่ใช่ OWNER แล้ว/ร้านถูกระงับ) = null (ไม่บอกเหตุผล)
 *   ตรวจสิทธิ์สดตอนเปิด (Membership ที่รับแล้ว + role OWNER) — ลิงก์ที่ออกก่อนถูกลดสิทธิ์ใช้ไม่ได้
 */
export async function consumeExportToken(token: string): Promise<ExportFile | null> {
  const v = verifyLink(token, EXPORT_PURPOSE);
  if (!v) return null;
  const uses = await checkRateLimitDb(`sec:biz-export-link:${sha256(token)}`, { limit: EXPORT_LINK_USES, windowMs: (EXPORT_LINK_MIN + 1) * 60_000 });
  if (!uses.ok) return null;
  const m = await prisma.membership.findFirst({ where: { userId: v.subjectId, tenantId: v.tenantId, acceptedAt: { not: null } }, select: { role: true, tenant: { select: { slug: true, status: true } } } });
  if (!m || m.role !== "OWNER" || m.tenant.status === "SUSPENDED" || m.tenant.status === "CLOSED") return null;
  const json = await exportTenantData(v.tenantId);
  await writeAudit({ tenantId: v.tenantId, actorId: v.subjectId, action: "tenant.data.exported", targetType: "Tenant", targetId: v.tenantId, after: { via: "mobile.business", bytes: json.length } });
  const stamp = new Date().toISOString().slice(0, 10);
  return { json, filename: `shark-export-${m.tenant.slug}-${stamp}.json` };
}
