// Support Desk — ฝั่งร้าน (WO-0021) · tenant-scoped ทั้งหมดผ่าน tenantDb
// ปุ่มช่วยเหลือในแอปร้าน: เปิดเคส/ดูเคสของตัวเอง/คุยต่อ
// ทุก query ผ่าน tenantDb({ tenantId }) → inject tenantId อัตโนมัติ (kernel guard)
// เคสข้ามร้าน = มองไม่เห็น/แก้ไม่ได้ (findUnique คืน null · list คืน [])

import type { SupportCase, SupportMessage } from "@prisma/client";
import { tenantDb } from "@/lib/core/db";

type Ctx = { tenantId: string };

// เปิดเคสใหม่ (สถานะ OPEN) + ข้อความแรกฝั่งร้าน (SHOP)
export async function createCase(
  ctx: Ctx,
  input: { userId: string; subject: string; body: string },
): Promise<{ id: string }> {
  const db = tenantDb(ctx);
  const c = await db.supportCase.create({
    data: { tenantId: ctx.tenantId, openedByUserId: input.userId, subject: input.subject },
  });
  await db.supportMessage.create({
    data: { tenantId: ctx.tenantId, caseId: c.id, authorSide: "SHOP", authorId: input.userId, body: input.body },
  });
  return { id: c.id };
}

// เคสของร้านนี้ (มีความเคลื่อนไหวล่าสุดก่อน)
export async function listMyCases(ctx: Ctx, take = 50): Promise<SupportCase[]> {
  return tenantDb(ctx).supportCase.findMany({ orderBy: { updatedAt: "desc" }, take });
}

// บทสนทนาในเคส (เก่า→ใหม่) · เคสข้ามร้าน → [] (tenantId ถูก inject ใน where)
export async function listCaseMessages(ctx: Ctx, caseId: string): Promise<SupportMessage[]> {
  return tenantDb(ctx).supportMessage.findMany({
    where: { caseId },
    orderBy: { createdAt: "asc" },
  });
}

// ร้านพิมพ์ข้อความต่อในเคส
// - เคสไม่ใช่ของ tenant นี้ → false (findUnique คืน null เพราะ kernel guard)
// - เคสปิดแล้ว (RESOLVED) → เปิดใหม่เป็น OPEN
// - ทุกข้อความจากร้าน = ดันสถานะเป็น OPEN (รอแพลตฟอร์มตอบ)
export async function addShopMessage(
  ctx: Ctx,
  caseId: string,
  userId: string,
  body: string,
): Promise<boolean> {
  const db = tenantDb(ctx);
  const existing = await db.supportCase.findUnique({ where: { id: caseId } });
  if (!existing) return false;
  await db.supportCase.update({ where: { id: caseId }, data: { status: "OPEN" } });
  await db.supportMessage.create({
    data: { tenantId: ctx.tenantId, caseId, authorSide: "SHOP", authorId: userId, body },
  });
  return true;
}
