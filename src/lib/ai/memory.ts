// AI Memory (agentic-1) — ความจำถาวรของผู้ช่วย (AI จดจากบทสนทนา → ฉีดเข้า system prompt)
//
// กติกา:
// - tenant-scoped ทั้งหมด (tenantDb({ tenantId })) — guard inject ตัวกรอง tenantId ให้
// - CRM C5.5-G3 (รีวิว G2-1) ▸ ความจำมีเจ้าของ — รหัสฝังผู้จด (กติกาอยู่ที่ ./conversation-owner.ts · ไม่มี migration):
//     ข้อเท็จจริงของร้าน = จดโดยเจ้าของร้าน (OWNER) หรือรุ่นเดิม → ทุกคนในร้านเห็น
//     ความจำส่วนตัว = จดโดยคนอื่นในร้าน → เข้า prompt/รายการ/ลบได้เฉพาะคนจดเอง
//     ของคีย์ API / งานภายใน → เจ้าของร้านเท่านั้น
//   ทุกตัวอ่าน (memoryBlock · listMemories) และตัวลบรับ **ผู้ดู (ctx.actor) บังคับ** — ตัวประกอบ prompt ใช้ตัวกรองเดียวกัน
// - 🔴 ด่านข้อมูลติดต่อ: ความจำที่จะเป็น "ของร้าน" (ทุกคนเห็น) ห้ามมีเบอร์โทร / อีเมล / เลขบัตรประชาชน (./contact-data.ts) —
//     ปฏิเสธด้วยข้อความไทยที่ผู้ช่วยส่งต่อได้ · ความจำส่วนตัวเก็บได้ · ความจำรุ่นเดิมที่มีข้อมูลติดต่อ = ไม่ลบ แต่ซ่อนจากคนที่ไม่ใช่ OWNER
// - จดซ้ำเนื้อหาเดิม (ในชุดที่ผู้จดดูแล) = อัปเดต updatedAt ของแถวเดิม (find→update) ไม่งอกแถวใหม่ · ห้าม upsert
// - เพดาน 100 เรื่องต่อชุด (ข้อเท็จจริงของร้าน 100 · ส่วนตัวต่อคน 100) — เกินแล้วจดเรื่องใหม่ = throw ไทย
// - SEC S1.10 (R-K3) ▸ ความจำ "รอเจ้าของยืนยัน" (`status = "PENDING"`): ข้อเท็จจริงของร้านที่คนที่ไม่ใช่ OWNER เสนอ
//     (กติกาจากการตีกลับ · remember_fact ในห้องเลขา) — รหัส `o~<ผู้จด>~…` · ผ่านด่านข้อมูลติดต่อแบบของร้าน ·
//     **ไม่เข้า** memoryBlock/listMemories จนกว่า OWNER ยืนยัน (`teach.confirmMemory` → status null) ·
//     ไม่มีแถว PENDING = ผลเดิมทุกแถว ◂

import { tenantDb } from "@/lib/core/db";
import type { AiActor } from "./actor";
import { contactDataRefusal, findContactData } from "./contact-data";
import { canForgetMemory, canSeeMemory, managedMemoryWhere, memorySightOf, newMemoryId, newShopMemoryId, visibleMemoryWhere } from "./conversation-owner";

export type MemoryCtx = { tenantId: string; actor: AiActor };

const MAX_MEMORIES = 100; // เพดานต่อชุด และจำนวนที่ฉีดเข้า prompt
const READ_WINDOW = 400; // ดึงมาคัดใน JS (แถวรุ่นเดิมที่มีข้อมูลติดต่อถูกตัดหลัง query)
/** SEC S1.10 ▸ สถานะ "รอเจ้าของยืนยัน" ของ AiMemory (null = ยืนยันแล้วแบบเดิม) ◂ */
export const MEMORY_PENDING = "PENDING";
/** where ของความจำที่ยืนยันแล้ว (status null ต้องผ่าน — `not` ของ Prisma ตัด null ทิ้ง) */
const CONFIRMED_MEMORY = { OR: [{ status: null }, { status: { not: MEMORY_PENDING } }] };

/**
 * จดความจำ — คืน { id, shared }
 * - content ว่าง → throw
 * - จะเป็นของร้าน (ผู้จดเป็น OWNER) และมีข้อมูลติดต่อ → throw ข้อความไทย (ผู้ช่วยส่งต่อให้ผู้ใช้)
 * - ตรงกับที่จดไว้แล้วในชุดเดียวกัน → อัปเดต updatedAt ของแถวเดิม (ไม่งอกแถว)
 * - เป็นเรื่องใหม่และชุดนั้นเต็มเพดาน (100) → throw
 */
export async function rememberFact(
  ctx: MemoryCtx,
  content: string,
  /** SEC S1.10 (R-K3) ▸ `pending` = เสนอเป็นข้อเท็จจริงของร้านที่รอ OWNER ยืนยัน (ผู้จดเป็น OWNER = ยืนยันทันที ไม่สนธงนี้) ◂ */
  opts?: { pending?: boolean },
): Promise<{ id: string; shared: boolean; pending?: true }> {
  const text = String(content ?? "").trim();
  if (!text) throw new Error("ต้องระบุเนื้อหาที่จะจำ (ห้ามว่าง)");
  const sight = memorySightOf(ctx);
  const pending = opts?.pending === true && !sight.owner;
  // ผู้จดไม่ชัด = throw ก่อนแตะฐานข้อมูล · pending = รหัสของร้าน `o~<ผู้จด>~` (newShopMemoryId throw เมื่อไม่ใช่คนในร้าน)
  const { id, shared } = pending ? { id: newShopMemoryId(ctx), shared: true } : newMemoryId(ctx);
  if (shared) {
    const kinds = findContactData(text);
    if (kinds.length > 0) throw new Error(contactDataRefusal(kinds, "เป็นความจำของร้าน"));
  }
  const db = tenantDb({ tenantId: ctx.tenantId });
  const mine = managedMemoryWhere(sight, shared);

  // ซ้ำเนื้อหาเดิมในชุดเดียวกัน → เด้ง updatedAt ของแถวเดิม ไม่งอกแถวใหม่ (find→update ไม่ใช่ upsert)
  const dupes = await db.aiMemory.findMany({ where: { AND: [mine, { content: text }] }, select: { id: true, status: true }, take: 5 });
  if (pending) {
    // SEC S1.10 ▸ ร้านมีเรื่องนี้แล้ว (ยืนยันแล้ว หรือมีคนเสนอรอไว้) = ไม่งอกแถว · ไม่แตะแถวของคนอื่น ◂
    const same = dupes.find((r) => r.status !== MEMORY_PENDING) ?? dupes[0];
    if (same) return same.status === MEMORY_PENDING ? { id: same.id, shared: true, pending: true } : { id: same.id, shared: true };
  }
  const existing = dupes.find((r) => canForgetMemory(sight, r.id));
  if (existing) {
    // SEC S1.10 ▸ OWNER จดเรื่องที่มีคนเสนอรอไว้ = ยืนยันแถวนั้น (status null) ◂
    await db.aiMemory.update({ where: { id: existing.id }, data: { updatedAt: new Date(), ...(existing.status === MEMORY_PENDING && sight.owner ? { status: null } : {}) } });
    return { id: existing.id, shared };
  }

  // เรื่องใหม่ — กันเพดานของชุดก่อนสร้าง
  const count = await db.aiMemory.count({ where: mine });
  if (count >= MAX_MEMORIES) {
    throw new Error(
      shared
        ? `ร้านนี้จำข้อเท็จจริงของร้านครบ ${MAX_MEMORIES} เรื่องแล้ว ลบเรื่องเก่าที่ไม่ใช้ก่อนจึงจะจำเพิ่มได้`
        : `คุณมีความจำส่วนตัวครบ ${MAX_MEMORIES} เรื่องแล้ว ลบเรื่องเก่าที่ไม่ใช้ก่อนจึงจะจำเพิ่มได้`,
    );
  }

  const created = await db.aiMemory.create({ data: { id, tenantId: ctx.tenantId, content: text, ...(pending ? { status: MEMORY_PENDING } : {}) }, select: { id: true } });
  return pending ? { id: created.id, shared, pending: true } : { id: created.id, shared };
}

/**
 * รายการความจำ **ที่ผู้ดูเห็น** (updatedAt ใหม่→เก่า)
 * SEC S1.10 ▸ ไม่รวม status "PENDING" (รอเจ้าของยืนยัน) เว้นแต่ `opts.includePending` ◂
 */
export async function listMemories(ctx: MemoryCtx, take = 50, opts?: { includePending?: boolean }) {
  const sight = memorySightOf(ctx);
  const rows = await tenantDb({ tenantId: ctx.tenantId }).aiMemory.findMany({
    where: opts?.includePending === true ? visibleMemoryWhere(sight) : { AND: [visibleMemoryWhere(sight), CONFIRMED_MEMORY] },
    orderBy: { updatedAt: "desc" },
    take: READ_WINDOW,
  });
  return rows.filter((r) => canSeeMemory(sight, r)).slice(0, Math.max(0, take));
}

/** ลืมความจำตาม id — คืน true ถ้าลบจริง, false ถ้าไม่พบ/ไม่ใช่สิทธิ์ของผู้ดู (ไม่ throw · ไม่บอกว่ามีอยู่) */
export async function forgetMemory(ctx: MemoryCtx, id: string): Promise<boolean> {
  const memId = String(id ?? "").trim();
  if (!memId) return false;
  const sight = memorySightOf(ctx);
  const db = tenantDb({ tenantId: ctx.tenantId });
  const row = await db.aiMemory.findFirst({ where: { id: memId }, select: { id: true, content: true } });
  if (!row || !canSeeMemory(sight, row) || !canForgetMemory(sight, row.id)) return false;
  const res = await db.aiMemory.deleteMany({ where: { id: memId } });
  return res.count > 0;
}

/** รวมความจำที่ผู้ดูเห็นเป็น bullet สำหรับฉีดเข้า system prompt ("" ถ้ายังไม่มี) — ตัวกรองเดียวกับ listMemories (ไม่มี PENDING) */
export async function memoryBlock(ctx: MemoryCtx): Promise<string> {
  const rows = await listMemories(ctx, MAX_MEMORIES);
  if (rows.length === 0) return "";
  return rows.map((r) => `- ${r.content}`).join("\n");
}
