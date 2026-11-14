// GET/PATCH /api/mobile/secretary/business — ข้อมูลกิจการ "ตั้งค่ากิจการ" (แบบ bizgear Ⓑ · 14 พ.ย. 2026)
//   กิจการ = x-tenant-id ของคำขอ (แอปส่ง id ของกิจการที่กด ⚙ ได้โดยไม่ต้องสลับ) · OWNER/MANAGER ของกิจการนั้นเท่านั้น (อื่น ๆ 403)
//   PATCH {name?, businessType?, address?, phone?, taxId?, branchCode?, branchName?, hours?} — ส่งเฉพาะช่องที่แก้ · ชื่อ = OWNER เท่านั้น
//   ช่องบนเอกสาร (address/phone/taxId/branch*) = สิทธิ์ `account.settings.manage` แบบเว็บ (ไม่มี = 403) · ตอบ `can: {editName, editTax}`
//   ที่เก็บจริง + กติกาตรวจ: src/lib/mobile/business-profile.ts (AccountSettings ของสมุดหลัก · ChatSetting.businessHours · Tenant · TenantBranding)
import { z } from "zod";
import { BIZ_DENY, BIZ_ROLES, businessCan, BusinessProfileError, BusinessProfileForbidden, getBusinessProfile, updateBusinessProfile } from "@/lib/mobile/business-profile";
import { fail, forbidden, gate, ok, readBody, thrown, withRateLimit, withErrors } from "../_shared";

const Day = z.object({ d: z.number().int().min(0).max(6), open: z.string().max(5), close: z.string().max(5) }).strict();
const Body = z
  .object({
    name: z.string().max(200).optional(),
    businessType: z.string().max(40).nullable().optional(),
    address: z.string().max(1000).nullable().optional(),
    phone: z.string().max(80).nullable().optional(),
    taxId: z.string().max(40).nullable().optional(),
    branchCode: z.string().max(20).nullable().optional(),
    branchName: z.string().max(200).nullable().optional(),
    hours: z.object({ days: z.array(Day).max(7), tz: z.string().max(64).nullable().optional() }).strict().nullable().optional(),
  })
  .strict();

async function GET_(req: Request) {
  const a = await gate(req, null);
  if (!a.ok) return a.res;
  if (!BIZ_ROLES.has(a.c.m.role)) return forbidden(BIZ_DENY);
  return ok({ profile: await getBusinessProfile(a.c.tenantId), role: a.c.m.role, can: businessCan(a.c.m) });
}

async function PATCH_(req: Request) {
  const a = await gate(req, null);
  if (!a.ok) return a.res;
  if (!BIZ_ROLES.has(a.c.m.role)) return forbidden(BIZ_DENY);
  const rl = await withRateLimit(`${a.c.tenantId}:${a.c.userId}`, "business");
  if (rl) return rl;
  const b = await readBody(req, Body);
  if (!b.ok) return b.res;
  try {
    const profile = await updateBusinessProfile(a.c.tenantId, { userId: a.c.userId, m: a.c.m }, b.v);
    return ok({ profile, role: a.c.m.role, can: businessCan(a.c.m) });
  } catch (e) {
    if (e instanceof BusinessProfileForbidden) return forbidden(e.message);
    if (e instanceof BusinessProfileError) return fail(400, "invalid", e.message);
    return thrown(e, "business.patch");
  }
}

export const GET = withErrors("secretary/business GET", GET_);
export const PATCH = withErrors("secretary/business PATCH", PATCH_);
