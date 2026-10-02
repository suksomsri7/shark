// conversations.ts — ตัวอ่านบทสนทนา AI "ที่ผู้ดูนี้เห็น" (CRM C5.5-G2 · กติกาอยู่ที่ ./conversation-owner.ts)
// ทุกประตูที่รับ conversationId จากภายนอก (เว็บ · แอป · REST · หน้าผู้ช่วยของโมดูล · sendMessage) ต้องผ่านที่นี่ —
// มองไม่เห็น = null แบบเดียวกับ "ไม่มีอยู่"

import { tenantDb } from "@/lib/core/db";
import { canSeeConversationId, sightOf, visibleConversationWhere, type ConvCtx } from "./conversation-owner";

/** บทสนทนารหัสนี้ ถ้าผู้ดูเห็น (ไม่เห็น / ไม่มี / ร้านอื่น = null) */
export async function findVisibleConversation(ctx: ConvCtx, conversationId: string | null | undefined) {
  const s = sightOf(ctx);
  const id = typeof conversationId === "string" ? conversationId.trim() : "";
  if (!id || !canSeeConversationId(s, id)) return null;
  const row = await tenantDb({ tenantId: ctx.tenantId }).aiConversation.findFirst({ where: { id } });
  return row && canSeeConversationId(s, row.id) ? row : null;
}

/** บทสนทนาล่าสุดที่ผู้ดูเห็น (แชทเว็บเปิดห้องนี้) — ไม่มี = null */
export async function latestVisibleConversation(ctx: ConvCtx) {
  const s = sightOf(ctx);
  const rows = await tenantDb({ tenantId: ctx.tenantId }).aiConversation.findMany({
    where: visibleConversationWhere(s),
    orderBy: { updatedAt: "desc" },
    take: 10,
  });
  return rows.find((r) => canSeeConversationId(s, r.id)) ?? null;
}
