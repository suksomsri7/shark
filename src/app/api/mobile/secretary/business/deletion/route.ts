// POST/DELETE /api/mobile/secretary/business/deletion — ขอลบ/ยกเลิกลบกิจการจากแอป (ตั้งค่ากิจการ ส่วน "อันตราย" · 14 พ.ย. 2026)
//   กิจการ = x-tenant-id · OWNER เท่านั้น (อื่น ๆ 403 · ตรงกับ requireOwner ของหน้าเว็บ /app/settings/privacy) · เพดาน 5 ครั้ง/นาที
//   POST {confirmName} — ต้องตรงชื่อกิจการ (trim) ไม่งั้น 400 name_mismatch · ACTIVE → PENDING_DELETE (ลบจริงหลัง 30 วัน · cron เดิม)
//     ขอซ้ำขณะรอลบ = ตอบสถานะเดิม (ไม่เริ่มนับใหม่) · สถานะอื่น (PENDING/SUSPENDED…) = 409 not_active
//   DELETE = ยกเลิก (PENDING_DELETE → ACTIVE) · ไม่ได้ขอลบไว้ = 200 เฉย ๆ
//   ตอบ `{deletion: {requestedAt, purgeAt} | null}` · AuditLog tenant.deletion.requested/cancelled · ตรรกะ: src/lib/mobile/business-danger.ts
import { z } from "zod";
import { BusinessDangerError, OWNER_ONLY, cancelBusinessDeletion, requestBusinessDeletion } from "@/lib/mobile/business-danger";
import { fail, forbidden, gate, ok, readBody, withRateLimit, withErrors } from "../../_shared";

const Body = z.object({ confirmName: z.string().min(1).max(200) }).strict();

async function POST_(req: Request) {
  const a = await gate(req, null);
  if (!a.ok) return a.res;
  if (a.c.m.role !== "OWNER") return forbidden(OWNER_ONLY);
  const rl = await withRateLimit(`${a.c.tenantId}:${a.c.userId}`, "business-deletion", 5);
  if (rl) return rl;
  const b = await readBody(req, Body);
  if (!b.ok) return b.res;
  try {
    return ok({ deletion: await requestBusinessDeletion(a.c.tenantId, a.c.userId, b.v.confirmName) });
  } catch (e) {
    if (e instanceof BusinessDangerError) return fail(e.code === "name_mismatch" ? 400 : 409, e.code, e.message);
    throw e;
  }
}

async function DELETE_(req: Request) {
  const a = await gate(req, null);
  if (!a.ok) return a.res;
  if (a.c.m.role !== "OWNER") return forbidden(OWNER_ONLY);
  const rl = await withRateLimit(`${a.c.tenantId}:${a.c.userId}`, "business-deletion", 5);
  if (rl) return rl;
  return ok({ deletion: await cancelBusinessDeletion(a.c.tenantId, a.c.userId) });
}

export const POST = withErrors("secretary/business/deletion POST", POST_);
export const DELETE = withErrors("secretary/business/deletion DELETE", DELETE_);
