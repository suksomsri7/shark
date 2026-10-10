// Mobile: บทสนทนา (session แชท) ของกิจการ — CRUD + unread/read (ledger/MOBILE_PLAN.md M-11)
// ทุก query ผ่าน tenantDb(ctx) กันข้ามกิจการ · ลบ = soft (deletedAt) เก็บประวัติไว้
// สำคัญ: rename/delete ข้าม tenant ต้องคืน false ไม่ throw → ใช้ updateMany นับ count (tenantDb.update จะโยน P2025)

// CRM C5.5-G2 ▸ ทุกฟังก์ชันรับผู้ดู (ctx.actor) — ห้องที่ลิสต์/แก้/ลบ/อ่านได้ = ของผู้ดูเท่านั้น (เจ้าของร้าน + ห้องที่ไม่ได้สร้างโดยคนในร้าน)
//   ห้องของคนอื่น = ตอบแบบเดียวกับไม่มีอยู่ (ลิสต์ไม่มี · rename/delete/read = false) · ห้องใหม่ = รหัสฝังผู้สร้าง ◂

import { tenantDb } from "@/lib/core/db";
import { canSeeConversationId, newConversationId, sightOf, visibleConversationWhere, type ConvCtx } from "@/lib/ai/conversation-owner";

export type ConversationRow = { id: string; title: string; updatedAt: Date; unread: boolean };

// รายการห้อง (ตัด deletedAt · เรียงล่าสุดก่อน) + คำนวณ unread = มี ASSISTANT ใหม่กว่า lastReadAt
export async function listConversations(ctx: ConvCtx): Promise<ConversationRow[]> {
  const db = tenantDb({ tenantId: ctx.tenantId });
  const s = sightOf(ctx);
  const rows = (
    await db.aiConversation.findMany({
      where: { deletedAt: null, ...visibleConversationWhere(s) },
      orderBy: { updatedAt: "desc" },
      take: 100, // ร้านที่คุยเยอะมีห้องหลักพัน — จอในแอปเลื่อนดูล่าสุดอยู่แล้ว ไม่ต้องขนมาทั้งหมด
    })
  ).filter((r) => canSeeConversationId(s, r.id));
  if (rows.length === 0) return [];

  // เวลาตอบ ASSISTANT ล่าสุดต่อห้อง (query เดียว กัน N+1)
  const latest = await db.aiMessage.groupBy({
    by: ["conversationId"],
    where: { role: "ASSISTANT", conversationId: { in: rows.map((r) => r.id) } },
    _max: { createdAt: true },
  });
  const maxMap = new Map(latest.map((l) => [l.conversationId, l._max.createdAt]));

  return rows.map((r) => {
    const lastAssistant = maxMap.get(r.id) ?? null;
    const unread = lastAssistant != null && (r.lastReadAt == null || lastAssistant > r.lastReadAt);
    return { id: r.id, title: r.title, updatedAt: r.updatedAt, unread };
  });
}

// เปิดห้องใหม่ (tenantId ใส่ตรง ๆ ให้ตรง type — convention repo)
export async function createConversation(ctx: ConvCtx, title?: string): Promise<{ id: string }> {
  const row = await tenantDb({ tenantId: ctx.tenantId }).aiConversation.create({
    data: { id: newConversationId(ctx), tenantId: ctx.tenantId, title: (title ?? "").trim() },
  });
  return { id: row.id };
}

// เปลี่ยนชื่อห้อง — ข้าม tenant = 0 แถว = false (ไม่ throw)
export async function renameConversation(ctx: ConvCtx, id: string, title: string): Promise<boolean> {
  if (!canSeeConversationId(sightOf(ctx), id)) return false;
  const res = await tenantDb({ tenantId: ctx.tenantId }).aiConversation.updateMany({
    where: { id },
    data: { title: title.trim() },
  });
  return res.count > 0;
}

// ลบแบบ soft (set deletedAt) — ห้ามลบแถวจริง · ข้าม tenant = false
export async function deleteConversation(ctx: ConvCtx, id: string): Promise<boolean> {
  if (!canSeeConversationId(sightOf(ctx), id)) return false;
  const res = await tenantDb({ tenantId: ctx.tenantId }).aiConversation.updateMany({
    where: { id, deletedAt: null },
    data: { deletedAt: new Date() },
  });
  return res.count > 0;
}

// ทำเครื่องหมายว่าอ่านแล้ว (lastReadAt = now) — ข้าม tenant = false
export async function markRead(ctx: ConvCtx, id: string): Promise<boolean> {
  if (!canSeeConversationId(sightOf(ctx), id)) return false;
  const res = await tenantDb({ tenantId: ctx.tenantId }).aiConversation.updateMany({
    where: { id },
    data: { lastReadAt: new Date() },
  });
  return res.count > 0;
}
