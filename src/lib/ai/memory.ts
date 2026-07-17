// AI Memory (agentic-1) — ความจำถาวรต่อร้าน
// AI จดข้อเท็จจริง/ความชอบเกี่ยวกับร้าน → เก็บถาวรต่อ tenant → ฉีดเข้า system prompt ทุกบทสนทนา
//
// กติกา:
// - tenant-scoped ทั้งหมด (tenantDb({ tenantId })) — guard inject ตัวกรอง tenantId ให้
// - จดซ้ำเนื้อหาเดิม = อัปเดต updatedAt ของแถวเดิม (find→update) ไม่งอกแถวใหม่ · ห้าม upsert
// - เพดาน 100 เรื่องต่อร้าน (กันบวม) — เกินแล้วจดเรื่องใหม่ = throw ไทย

import { tenantDb } from "@/lib/core/db";

export type MemoryCtx = { tenantId: string };

const MAX_MEMORIES = 100; // เพดานความจำต่อร้าน

/**
 * จดข้อเท็จจริงถาวรของร้าน — คืน { id }
 * - content ว่าง → throw
 * - ตรงกับที่จดไว้แล้ว → อัปเดต updatedAt ของแถวเดิม (ไม่งอกแถว)
 * - เป็นเรื่องใหม่และเต็มเพดาน (100) → throw
 */
export async function rememberFact(ctx: MemoryCtx, content: string): Promise<{ id: string }> {
  const text = String(content ?? "").trim();
  if (!text) throw new Error("ต้องระบุเนื้อหาที่จะจำ (ห้ามว่าง)");

  const db = tenantDb({ tenantId: ctx.tenantId });

  // ซ้ำเนื้อหาเดิม → เด้ง updatedAt ของแถวเดิม ไม่งอกแถวใหม่ (find→update ไม่ใช่ upsert)
  const existing = await db.aiMemory.findFirst({ where: { content: text }, select: { id: true } });
  if (existing) {
    await db.aiMemory.update({ where: { id: existing.id }, data: { updatedAt: new Date() } });
    return { id: existing.id };
  }

  // เรื่องใหม่ — กันเพดานก่อนสร้าง
  const count = await db.aiMemory.count();
  if (count >= MAX_MEMORIES) {
    throw new Error(`ร้านนี้จำครบ ${MAX_MEMORIES} เรื่องแล้ว ลบเรื่องเก่าที่ไม่ใช้ก่อนจึงจะจำเพิ่มได้`);
  }

  const created = await db.aiMemory.create({
    data: { tenantId: ctx.tenantId, content: text },
    select: { id: true },
  });
  return { id: created.id };
}

/** รายการความจำล่าสุด (updatedAt ใหม่→เก่า) */
export async function listMemories(ctx: MemoryCtx, take = 50) {
  return tenantDb({ tenantId: ctx.tenantId }).aiMemory.findMany({
    orderBy: { updatedAt: "desc" },
    take,
  });
}

/** ลืมความจำตาม id — คืน true ถ้าลบจริง, false ถ้าไม่พบ (ไม่ throw) */
export async function forgetMemory(ctx: MemoryCtx, id: string): Promise<boolean> {
  const memId = String(id ?? "").trim();
  if (!memId) return false;
  // ลบผ่าน deleteMany (guard กรอง tenantId ให้) — count 0 = ไม่พบ/ไม่ใช่ของร้านนี้
  const res = await tenantDb({ tenantId: ctx.tenantId }).aiMemory.deleteMany({ where: { id: memId } });
  return res.count > 0;
}

/** รวมความจำของร้านเป็น bullet ไทยสำหรับฉีดเข้า system prompt ("" ถ้ายังไม่มี) */
export async function memoryBlock(ctx: MemoryCtx): Promise<string> {
  const rows = await listMemories(ctx, MAX_MEMORIES);
  if (rows.length === 0) return "";
  return rows.map((r) => `- ${r.content}`).join("\n");
}
