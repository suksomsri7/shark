// where.ts — ตัวกำหนดขอบเขตการอ่านของ CRM v2 (RESOLUTIONS R-A · สร้างในใบ C1.3 · ใบ C1.4–C1.6/C1.2b เติมตัวของตัวเอง)
//
// 🔴 ไฟล์นี้คือ "ที่เดียว" ที่ตัดสินว่า actor อ่านแถวไหนของ CRM ได้ — ห้ามเขียน where ขอบเขตกระจายตามไฟล์บริการ
//    ใบ C1.7 จะ **แทนไส้ในของไฟล์นี้** ด้วย `visibleWhere(actor, entity)` (OWN/TEAM/ALL + ตัวกรองคีย์ API)
//    โดยลายเซ็นของฟังก์ชันไม่เปลี่ยน ⇒ ผู้เรียกทุกตัวได้การมองเห็นใหม่ทันทีโดยไม่ต้องแก้
// 🔴 วันนี้ (ก่อน C1.7): ขอบเขต = ร้าน + ระบบ CRM เดียวกัน (ctx.systemId ต้องถูก resolve ใหม่แล้วโดยผู้เรียก)

import type { Prisma } from "@prisma/client";
import type { MemberActor } from "@/lib/modules/member";

export type CrmScopeCtx = { tenantId: string; systemId: string };

/** AUDIT-CLASS X1: บริษัทที่ actor อ่านได้ในระบบ CRM ของ ctx — ร้านอื่น/ระบบ CRM อื่นของร้านเดียวกันไม่มีวันโผล่ */
export function companyWhere(ctx: CrmScopeCtx, actor: MemberActor): Prisma.CrmCompanyWhereInput {
  // ลูกค้า (portal) ไม่มีทางเข้าบริการฝั่งพนักงาน — ตอบด้วยเงื่อนไขที่ไม่มีวันจริง (ผู้เรียกแปลงเป็น "ไม่พบ")
  if (!actor || actor.role === "CUSTOMER") return { id: { in: [] } };
  return { tenantId: ctx.tenantId, systemId: ctx.systemId };
}

/** AUDIT-CLASS X1: ผู้ติดต่อที่ actor อ่านได้ (C1.3 ใช้กับหน้าบริษัท 360 + ช่องเลือกผู้ติดต่อ · C1.4 ขยาย · C1.7 แทนไส้ใน) */
export function contactWhere(ctx: CrmScopeCtx, actor: MemberActor): Prisma.CrmContactWhereInput {
  if (!actor || actor.role === "CUSTOMER") return { id: { in: [] } };
  return { tenantId: ctx.tenantId, systemId: ctx.systemId };
}

/** AUDIT-CLASS X1: ดีลที่ actor อ่านได้ (C1.3 ใช้ในบริษัท 360 · C1.5 ขยาย · C1.7 แทนไส้ใน) */
export function dealWhere(ctx: CrmScopeCtx, actor: MemberActor): Prisma.CrmDealWhereInput {
  if (!actor || actor.role === "CUSTOMER") return { id: { in: [] } };
  return { tenantId: ctx.tenantId, systemId: ctx.systemId };
}

/** AUDIT-CLASS X1: กิจกรรมที่ actor อ่านได้ (C1.3 ใช้ในไทม์ไลน์บริษัท 360 · C1.6 ขยาย · C1.7 แทนไส้ใน) */
export function activityWhere(ctx: CrmScopeCtx, actor: MemberActor): Prisma.CrmActivityWhereInput {
  if (!actor || actor.role === "CUSTOMER") return { id: { in: [] } };
  return { tenantId: ctx.tenantId, systemId: ctx.systemId };
}
