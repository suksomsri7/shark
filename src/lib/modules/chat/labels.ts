// labels.ts — ป้ายกำกับห้องแชท (WO-CV6 · PLAN-CHAT-V2 §3 · มติ D6)
//
// 🔴 ของอีกชิ้นที่ "มีที่เก็บแต่ไม่มีใครใช้": `ChatConversation.tags Json @default("[]")`
//    มีมาตั้งแต่ต้น แต่ไม่มีโค้ดไหนอ่านหรือเขียนเลย ⇒ ทีมจัดหมวดห้องแชทเองไม่ได้มาตลอด
//
// รูปแบบข้อมูล: **array ของสตริงเท่านั้น** (`["สนใจทริป","รอโอนมัดจำ"]`)
//    ไม่ทำเป็น object `{name,color}` โดยตั้งใจ — สีของป้ายคือเรื่องหน้าจอ ไม่ใช่ข้อมูล
//    และ object ทำให้ค่าที่เขียนไปแล้วเปลี่ยนรูปไม่ได้อีกโดยไม่ต้อง migrate ข้อมูลเก่า
//
// 🔴 ขอบเขตที่ตั้งไว้ พร้อมเหตุผล (ไม่ใช่ตัวเลขลอย ๆ)
//    · ยาวไม่เกิน 24 ตัวอักษร — ชิปในคอลัมน์ขวากว้าง 280px ตามแบบร่าง ยาวกว่านี้ตัดคำหรือดันจอ
//    · ไม่เกิน 8 ป้ายต่อห้อง — เกินนี้ชิปพันบรรทัดจนอ่านไม่ออก และ "ทุกอย่างสำคัญ = ไม่มีอะไรสำคัญ"
//    · ห้ามซ้ำ (เทียบแบบไม่สนตัวพิมพ์ใหญ่-เล็ก) · ห้ามว่าง · ตัดช่องว่างหัวท้ายเสมอ
//      (ป้าย "VIP" กับ "vip" ที่อยู่คนละห้อง = ตัวกรองในอนาคตจะนับแยกกันโดยที่คนใช้ไม่รู้ตัว)

import type { Prisma } from "@prisma/client";
import { tenantDb } from "@/lib/core/db";

const db = (tenantId: string, systemId: string) => tenantDb({ tenantId, systemId });

/** ยาวสุดต่อป้าย — ผูกกับความกว้างของชิปในคอลัมน์บริบท (280px ตามแบบร่าง) */
export const TAG_MAX_LEN = 24;
/** จำนวนป้ายสูงสุดต่อห้อง */
export const TAG_MAX_PER_CONVERSATION = 8;

/**
 * ทำให้ป้ายเป็นรูปมาตรฐานก่อนเทียบ/บันทึก
 * — ตัดหัวท้าย · ยุบช่องว่างซ้อนเป็นช่องเดียว · ตัดอักขระควบคุม (ที่มองไม่เห็นแต่ทำให้ป้ายซ้ำเงียบ ๆ)
 */
export function normalizeTag(raw: unknown): string {
  return String(raw ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ") // อักขระควบคุมที่มองไม่เห็น = ป้ายที่ดู "เหมือนกัน" แต่ไม่ซ้ำกัน
    .replace(/\s+/g, " ")
    .trim();
}

/** อ่านคอลัมน์ Json ให้เป็นรายการป้ายที่ใช้ได้เสมอ — ค่าขยะ/รูปแบบเก่า = ถือว่าไม่มีป้าย */
export function parseTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") continue; // ค่าที่ไม่ใช่สตริง = ข้อมูลผิดรูป ไม่ใช่ป้ายที่ใครตั้งใจติด
    const t = normalizeTag(item).slice(0, TAG_MAX_LEN);
    if (!t) continue;
    if (out.some((x) => x.toLowerCase() === t.toLowerCase())) continue;
    out.push(t);
  }
  return out;
}

export type TagResult = { ok: boolean; tags?: string[]; reason?: string };

/**
 * เขียนรายการป้ายกลับลงห้อง — **compare-and-swap** กันสองคนติดป้ายพร้อมกันแล้วของหาย
 *
 * 🔴 ต่างจากตัวนับ (`usageCount`) ตรงที่ array ทั้งก้อนบวกด้วย SQL คำสั่งเดียวไม่ได้
 *    ⇒ ใช้เงื่อนไข "ค่าต้องยังเท่ากับตอนที่อ่านมา" แทน · ชนกันจริงจะไม่มีใครเขียนทับใคร
 * ⚠️ ลองใหม่ 1 รอบแล้วยังชน = เขียนแบบไม่มีเงื่อนไข (คนหลังชนะ) เพื่อไม่ให้ผู้ใช้เจอทางตัน
 *    — ความเสียหายสูงสุดคือป้ายของอีกคนหายไป 1 ใบ ซึ่ง **เห็นทันทีบนหน้าจอและติดใหม่ได้**
 *      คนละชั้นกับตัวนับที่พลาดแล้วเงียบและกู้คืนไม่ได้
 */
async function writeTags(
  tenantId: string,
  systemId: string,
  conversationId: string,
  prev: string[],
  next: string[],
): Promise<boolean> {
  const d = db(tenantId, systemId);
  for (const guard of [true, false]) {
    const res = await d.chatConversation.updateMany({
      where: {
        id: conversationId,
        tenantId,
        systemId,
        ...(guard ? { tags: { equals: prev as unknown as Prisma.InputJsonValue } } : {}),
      },
      data: { tags: next as unknown as Prisma.InputJsonValue },
    });
    if (res.count > 0) return true;
  }
  return false;
}

async function loadTags(tenantId: string, systemId: string, conversationId: string) {
  const conv = await db(tenantId, systemId).chatConversation.findFirst({
    where: { id: conversationId, tenantId, systemId },
    select: { id: true, tags: true },
  });
  return conv ? { id: conv.id, tags: parseTags(conv.tags) } : null;
}

/** ป้ายของห้องหนึ่ง (ให้หน้าจอเรียกใช้ได้โดยไม่ต้องรู้รูปแบบข้อมูล) */
export async function getConversationTags(args: {
  tenantId: string;
  systemId: string;
  conversationId: string;
}): Promise<string[]> {
  const conv = await loadTags(args.tenantId, args.systemId, (args.conversationId ?? "").trim());
  return conv?.tags ?? [];
}

/** ติดป้าย — กดซ้ำได้ไม่พัง (ป้ายเดิมอยู่แล้ว = ถือว่าสำเร็จ) */
export async function addConversationTag(args: {
  tenantId: string;
  systemId: string;
  conversationId: string;
  tag: string;
}): Promise<TagResult> {
  const { tenantId, systemId } = args;
  const conversationId = (args.conversationId ?? "").trim();
  const tag = normalizeTag(args.tag);
  if (!conversationId) return { ok: false, reason: "ไม่ได้ระบุห้องแชท" };
  if (!tag) return { ok: false, reason: "ยังไม่ได้พิมพ์ชื่อป้าย" };
  if (tag.length > TAG_MAX_LEN) {
    return { ok: false, reason: `ชื่อป้ายยาวเกิน ${TAG_MAX_LEN} ตัวอักษร — ตั้งให้สั้นพอที่จะอ่านจบในชิปเดียว` };
  }

  const conv = await loadTags(tenantId, systemId, conversationId);
  if (!conv) return { ok: false, reason: "ไม่พบห้องแชทนี้ในระบบของร้าน" };
  if (conv.tags.some((t) => t.toLowerCase() === tag.toLowerCase())) {
    return { ok: true, tags: conv.tags };
  }
  if (conv.tags.length >= TAG_MAX_PER_CONVERSATION) {
    return {
      ok: false,
      reason: `ห้องนี้มีป้ายครบ ${TAG_MAX_PER_CONVERSATION} ใบแล้ว — ถอดใบที่ไม่ใช้ก่อนจึงจะติดใบใหม่ได้`,
    };
  }

  const next = [...conv.tags, tag];
  const done = await writeTags(tenantId, systemId, conversationId, conv.tags, next);
  if (!done) return { ok: false, reason: "ติดป้ายไม่สำเร็จ — ลองใหม่อีกครั้ง" };
  return { ok: true, tags: next };
}

/** ถอดป้าย — ถอดของที่ไม่มีอยู่ = ถือว่าสำเร็จ (ผลลัพธ์ปลายทางตรงกับที่ผู้ใช้ต้องการอยู่แล้ว) */
export async function removeConversationTag(args: {
  tenantId: string;
  systemId: string;
  conversationId: string;
  tag: string;
}): Promise<TagResult> {
  const { tenantId, systemId } = args;
  const conversationId = (args.conversationId ?? "").trim();
  const tag = normalizeTag(args.tag);
  if (!conversationId || !tag) return { ok: false, reason: "ข้อมูลไม่ครบสำหรับถอดป้าย" };

  const conv = await loadTags(tenantId, systemId, conversationId);
  if (!conv) return { ok: false, reason: "ไม่พบห้องแชทนี้ในระบบของร้าน" };
  const next = conv.tags.filter((t) => t.toLowerCase() !== tag.toLowerCase());
  if (next.length === conv.tags.length) return { ok: true, tags: conv.tags };

  const done = await writeTags(tenantId, systemId, conversationId, conv.tags, next);
  if (!done) return { ok: false, reason: "ถอดป้ายไม่สำเร็จ — ลองใหม่อีกครั้ง" };
  return { ok: true, tags: next };
}

/**
 * ป้ายที่ร้านนี้ใช้อยู่จริง + จำนวนห้องของแต่ละใบ
 * ใช้ 2 ที่: (1) คำแนะนำตอนพิมพ์ป้ายใหม่ — กันคนสะกดคนละแบบจนกลายเป็นคนละป้าย
 *            (2) หน้า "เชื่อมช่องทาง" ให้เจ้าของเห็นว่าทีมแบ่งหมวดห้องแชทกันยังไง
 * ⚠️ อ่านทั้งระบบแล้วนับในหน่วยความจำ เพราะ `tags` เป็น Json — group by ใน SQL ทำไม่ได้ตรง ๆ
 *    จำกัดจำนวนแถวที่ดึงไว้เสมอ (ห้องแชทของร้านหนึ่งโตได้ไม่จำกัด)
 */
export async function listSystemTags(args: {
  tenantId: string;
  systemId: string;
  scanLimit?: number;
}): Promise<{ tag: string; count: number }[]> {
  const { tenantId, systemId } = args;
  const rows = await db(tenantId, systemId).chatConversation.findMany({
    where: { tenantId, systemId },
    select: { tags: true },
    orderBy: { lastMessageAt: "desc" },
    take: Math.max(1, Math.min(2000, args.scanLimit ?? 500)),
  });

  const counts = new Map<string, { tag: string; count: number }>();
  for (const r of rows) {
    for (const t of parseTags(r.tags)) {
      const k = t.toLowerCase();
      const cur = counts.get(k);
      if (cur) cur.count += 1;
      else counts.set(k, { tag: t, count: 1 });
    }
  }
  return [...counts.values()].sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, "th"));
}
