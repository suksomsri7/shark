// conversations.ts — ตัวอ่านบทสนทนา AI "ที่ผู้ดูนี้เห็น" (CRM C5.5-G2 · กติกาอยู่ที่ ./conversation-owner.ts)
// ทุกประตูที่รับ conversationId จากภายนอก (เว็บ · แอป · REST · หน้าผู้ช่วยของโมดูล · sendMessage) ต้องผ่านที่นี่ —
// มองไม่เห็น = null แบบเดียวกับ "ไม่มีอยู่"

import { tenantDb } from "@/lib/core/db";
import { canSeeConversationId, sightOf, visibleConversationWhere, type ConvCtx, type ConvSight } from "./conversation-owner";

/** บทสนทนารหัสนี้ ถ้าผู้ดูเห็น (ไม่เห็น / ไม่มี / ร้านอื่น = null) */
export async function findVisibleConversation(ctx: ConvCtx, conversationId: string | null | undefined) {
  const s = sightOf(ctx);
  const id = typeof conversationId === "string" ? conversationId.trim() : "";
  if (!id || !canSeeConversationId(s, id)) return null;
  const row = await tenantDb({ tenantId: ctx.tenantId }).aiConversation.findFirst({ where: { id } });
  return row && canSeeConversationId(s, row.id) ? row : null;
}

/**
 * บทสนทนาล่าสุด **ของผู้ดูเอง** (แชทเว็บเปิดห้องนี้) — ไม่มี = null (เว็บเปิดห้องใหม่)
 * CRM C5.5-G3 (รีวิว G2-5) ▸ เดิม = ห้องล่าสุดที่เห็น ⇒ เจ้าของร้านเปิดแชทแล้วเจอห้องของคีย์ API / งานประจำแทนห้องตัวเอง
 *   ตอนนี้ = ห้องที่ผู้ดูสร้างเองเท่านั้น · ห้องรุ่นเดิม/คีย์/งานประจำยังเปิดได้จากรายการห้อง (แอป) และด้วยรหัสห้อง ◂
 */
export async function latestVisibleConversation(ctx: ConvCtx) {
  const s = sightOf(ctx);
  const own: ConvSight = { own: s.own, ownerExtras: false };
  const rows = await tenantDb({ tenantId: ctx.tenantId }).aiConversation.findMany({
    where: visibleConversationWhere(own),
    orderBy: { updatedAt: "desc" },
    take: 10,
  });
  return rows.find((r) => canSeeConversationId(own, r.id)) ?? null;
}
