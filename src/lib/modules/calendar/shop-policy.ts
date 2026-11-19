// shop-policy.ts — นโยบายปฏิทินของ "ร้าน" (calendar_c · มติเจ้าของ 15 พ.ย. 2569 · ปิด Q9 / review b m6)
//   allowBookingExport: ร้าน (ผู้ควบคุมข้อมูลลูกค้า · PDPA) อนุญาตให้พนักงานส่งนัดลูกค้า (บัตรคิว) เข้า Google ส่วนตัวไหม
//   ค่าเริ่ม ปิด (ไม่มีแถว = ปิด) · ตัวเลือก BOOKING ของผู้ใช้ (CalLink.exportKinds) มีผลเฉพาะร้านที่เปิด
//   ปิดแล้ว = รอบซิงก์ถัดไปไม่ส่ง และลบสำเนาเดิมของร้านนั้นเอง (exportBookings: ไม่อยู่ในชุดที่ต้องการ = ลบ)
//   แก้ได้เฉพาะ OWNER/MANAGER (ด่านเดียวกับตั้งค่ากิจการ BIZ_ROLES) — ผู้เรียก: PATCH /api/mobile/secretary/business
import { tenantDb } from "@/lib/core/db";
import type { MembershipCtx } from "@/lib/core/rbac";

export type CalShopPolicyDto = { allowBookingExport: boolean };
export const SHOP_POLICY_ROLES: ReadonlySet<string> = new Set(["OWNER", "MANAGER"]);
export const BOOKING_EXPORT_OFF_HINT = "ร้านปิดการส่งนัดลูกค้าไป Google";

export class CalShopPolicyForbidden extends Error {}

export async function getShopPolicy(tenantId: string): Promise<CalShopPolicyDto> {
  const r = await tenantDb({ tenantId }).calShopPolicy.findFirst({ where: { tenantId }, select: { allowBookingExport: true } });
  return { allowBookingExport: r?.allowBookingExport === true };
}

/** ร้านใดในชุดนี้อนุญาต (คิวรีเดียวต่อร้าน · ไม่มีแถว = ปิด) */
export async function bookingExportAllowed(tenantIds: string[]): Promise<Set<string>> {
  const out = new Set<string>();
  for (const tenantId of [...new Set(tenantIds)]) if ((await getShopPolicy(tenantId)).allowBookingExport) out.add(tenantId);
  return out;
}

export function canEditShopPolicy(m: Pick<MembershipCtx, "role">): boolean {
  return SHOP_POLICY_ROLES.has(m.role);
}

export async function setShopPolicy(tenantId: string, actor: { userId: string; m: Pick<MembershipCtx, "role"> }, patch: Partial<CalShopPolicyDto>): Promise<CalShopPolicyDto> {
  if (!canEditShopPolicy(actor.m)) throw new CalShopPolicyForbidden("ตั้งค่านี้ได้เฉพาะเจ้าของหรือผู้จัดการของกิจการนี้");
  if (typeof patch.allowBookingExport !== "boolean") return getShopPolicy(tenantId);
  const db = tenantDb({ tenantId });
  const data = { allowBookingExport: patch.allowBookingExport, updatedById: actor.userId };
  const u = await db.calShopPolicy.updateMany({ where: { tenantId }, data });
  if (u.count === 0) {
    try {
      await db.calShopPolicy.create({ data: { tenantId, ...data } });
    } catch {
      await db.calShopPolicy.updateMany({ where: { tenantId }, data }); // สร้างพร้อมกัน
    }
  }
  return getShopPolicy(tenantId);
}
