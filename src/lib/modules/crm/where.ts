// where.ts — ตัวกำหนดขอบเขตการอ่านของ CRM v2 (RESOLUTIONS R-A · สร้างในใบ C1.3 · ใบ C1.4–C1.6/C1.2b เติมตัวของตัวเอง ·
//            ใบ C1.7 แทนไส้ในด้วย `visibleWhere` ของ `./visibility`)
//
// 🔴 ไฟล์นี้คือ "ที่เดียว" ที่บริการของ CRM ถามว่า actor อ่านแถวไหนได้ — ห้ามเขียน where ขอบเขตกระจายตามไฟล์บริการ
// 🔴 C1.7: ชื่อฟังก์ชันเดิม แต่กลายเป็น async (ต้องอ่านทีม/policy ของผู้ดูจากฐานทุกครั้ง — ไม่มีแคช) ⇒ ผู้เรียกทุกตัว `await`
//    ขอบเขต = ร้าน + ระบบ CRM เดียวกัน + การมองเห็น OWN/TEAM/ALL + คีย์อ่านของเอนทิตี (ไม่มีคีย์อ่าน = ไม่เห็นอะไร)
// 🔴 ผู้เรียกต้อง resolve ctx.systemId ใหม่แล้ว (ระบบ CRM ของร้านนี้จริง) ก่อนเรียก

import type { Prisma } from "@prisma/client";
import type { MemberActor } from "@/lib/modules/member";
import { fileVisibleWhere, recordVisibleWhere, visibleWhere, type VisDb } from "./visibility";

export type CrmScopeCtx = { tenantId: string; systemId: string };
/** `db` = tx ของผู้เรียกที่ถือล็อกแถวอยู่ — คิวรีของการมองเห็นวิ่งบน tx นั้น (ไม่แย่ง connection ขณะถือล็อก) */
export type WhereOpts = { db?: VisDb };

/** AUDIT-CLASS X1: บริษัทที่ actor อ่านได้ในระบบ CRM ของ ctx (visibleWhere COMPANY) — ร้านอื่น/ระบบอื่น/ทีมอื่นไม่มีวันโผล่ */
export async function companyWhere(ctx: CrmScopeCtx, actor: MemberActor, opts: WhereOpts = {}): Promise<Prisma.CrmCompanyWhereInput> {
  return visibleWhere(ctx, actor, "COMPANY", opts);
}

/** AUDIT-CLASS X1: ผู้ติดต่อที่ actor อ่านได้ (visibleWhere CONTACT) */
export async function contactWhere(ctx: CrmScopeCtx, actor: MemberActor, opts: WhereOpts = {}): Promise<Prisma.CrmContactWhereInput> {
  return visibleWhere(ctx, actor, "CONTACT", opts);
}

/** AUDIT-CLASS X1: ดีลที่ actor อ่านได้ (visibleWhere DEAL · policy ต่อ pipeline มีผลเฉพาะแถวของ pipeline นั้น) */
export async function dealWhere(ctx: CrmScopeCtx, actor: MemberActor, opts: WhereOpts & { pipelineId?: string | null } = {}): Promise<Prisma.CrmDealWhereInput> {
  return visibleWhere(ctx, actor, "DEAL", opts);
}

/** AUDIT-CLASS X1: กิจกรรมที่ actor อ่านได้ (visibleWhere ACTIVITY — STAFF ปริยาย = ของตัวเอง · หัวหน้าทีม = ทั้งทีม) */
export async function activityWhere(ctx: CrmScopeCtx, actor: MemberActor, opts: WhereOpts = {}): Promise<Prisma.CrmActivityWhereInput> {
  return visibleWhere(ctx, actor, "ACTIVITY", opts);
}

// CRM C1.6 ▸ ไฟล์แนบของ CRM (`CrmFileLink` · มติ C19) — ขอบเขตการอ่านลิงก์ไฟล์ (R-A: C1.7 แทนไส้ใน)
/**
 * AUDIT-CLASS X1: ลิงก์ไฟล์ของระเบียนแม่ 1 ตัวที่ actor อ่านได้ — ตามการมองเห็นของแม่ (fileVisibleWhere → visibleWhere ของแม่)
 * ต้องระบุแม่เสมอ (C1.7 รีวิว: ไม่มีทาง "ไฟล์ทั้งระบบ" ที่ต้องดึงรายการ id ของแม่ทั้งหมด)
 */
export async function fileWhere(ctx: CrmScopeCtx, actor: MemberActor, parent: { entityType: string; entityId: string }, opts: WhereOpts = {}): Promise<Prisma.CrmFileLinkWhereInput> {
  return fileVisibleWhere(ctx, actor, parent, opts);
}

/**
 * AUDIT-CLASS X1: รายการวัตถุกำหนดเองที่ actor อ่านได้ **จาก id ที่ระบุ** (1 รายการ หรือชุดที่มีเพดาน) — ตามการมองเห็นของแม่
 * (recordVisibleWhere → visibleWhere/EXISTS ของแม่ · คิวรีเดียว) · รายการยาวของหน้า list ใช้ `recordVisibilitySql` ใน objects.ts
 */
export async function recordWhere(ctx: CrmScopeCtx, actor: MemberActor, target: { recordId?: string | null; recordIds?: readonly string[] | null } & WhereOpts): Promise<Prisma.CustomRecordWhereInput> {
  return recordVisibleWhere(ctx, actor, target);
}
// ◂ CRM C1.6
