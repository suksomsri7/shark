// Mobile: บทสนทนา (session แชท) ของกิจการ — CRUD + unread/read (ledger/MOBILE_PLAN.md M-11)
// ทุก query ผ่าน tenantDb(ctx) กันข้ามกิจการ · ลบ = soft (deletedAt) เก็บประวัติไว้
// สำคัญ: rename/delete ข้าม tenant ต้องคืน false ไม่ throw → ใช้ updateMany นับ count (tenantDb.update จะโยน P2025)

import { tenantDb } from "@/lib/core/db";
import type { Ctx } from "@/lib/ai/service";

export type ConversationRow = { id: string; title: string; updatedAt: Date; unread: boolean };

// รายการห้อง (ตัด deletedAt · เรียงล่าสุดก่อน) + คำนวณ unread = มี ASSISTANT ใหม่กว่า lastReadAt
export async function listConversations(ctx: Ctx): Promise<ConversationRow[]> {
  const db = tenantDb(ctx);
  const rows = await db.aiConversation.findMany({
    where: { deletedAt: null },
    orderBy: { updatedAt: "desc" },
  });
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
export async function createConversation(ctx: Ctx, title?: string): Promise<{ id: string }> {
  const row = await tenantDb(ctx).aiConversation.create({
    data: { tenantId: ctx.tenantId, title: (title ?? "").trim() },
  });
  return { id: row.id };
}

// เปลี่ยนชื่อห้อง — ข้าม tenant = 0 แถว = false (ไม่ throw)
export async function renameConversation(ctx: Ctx, id: string, title: string): Promise<boolean> {
  const res = await tenantDb(ctx).aiConversation.updateMany({
    where: { id },
    data: { title: title.trim() },
  });
  return res.count > 0;
}

// ลบแบบ soft (set deletedAt) — ห้ามลบแถวจริง · ข้าม tenant = false
export async function deleteConversation(ctx: Ctx, id: string): Promise<boolean> {
  const res = await tenantDb(ctx).aiConversation.updateMany({
    where: { id, deletedAt: null },
    data: { deletedAt: new Date() },
  });
  return res.count > 0;
}

// ทำเครื่องหมายว่าอ่านแล้ว (lastReadAt = now) — ข้าม tenant = false
export async function markRead(ctx: Ctx, id: string): Promise<boolean> {
  const res = await tenantDb(ctx).aiConversation.updateMany({
    where: { id },
    data: { lastReadAt: new Date() },
  });
  return res.count > 0;
}
