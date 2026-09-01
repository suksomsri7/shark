// learning.ts — คลังตัวอย่างคำตอบของทีม (WO-CW3 §5.4 · คำสั่งข้อ 9 ของเจ้าของ)
//
// เป้าหมาย: "อนาคตระบบแนะนำได้แม่นขึ้น" โดยเรียนจาก **คำตอบที่มนุษย์ส่งจริง** เท่านั้น
//
// 🔴 กติกาที่ห้ามรื้อ (ทุกข้อมีเหตุผลเชิงความเสียหาย ไม่ใช่ความชอบ)
//  1. คลัง **ไม่โตเอง** — `sendReply` เฉย ๆ ห้ามสร้างตัวอย่าง ต้องมีคนกด "บันทึกเป็นตัวอย่างคำตอบ"
//     (เก็บทุกข้อความ = คลังเต็มไปด้วย "ครับ" / "เดี๋ยวเช็คให้" แล้วคำแนะนำรอบหลัง **แย่ลง** ไม่ใช่ดีขึ้น)
//  2. โน้ตภายในห้ามเข้าคลัง — ลูกค้าไม่เคยเห็น เอาไปเป็นตัวอย่างคำตอบไม่ได้
//  3. ถอดตัวอย่างที่ไม่ดี = ปัก `archivedAt` **ไม่ลบแถว** (ลบ = ตรวจย้อนไม่ได้ว่าเคยแนะนำอะไรผิด)
//  4. รอบนี้ **ไม่ทำ embedding / fine-tune** — retrieval เป็น keyword แบบเดียวกับ searchKb
//     (ยิง LLM ตอนบันทึก = ค่าใช้จ่ายแอบซ่อนที่เจ้าของไม่ได้สั่ง)
//  5. 🔴 H3: ตารางนี้ **ไม่มี FK ที่ระดับ DB** ⇒ ทุก id ที่รับเข้ามาต้องถูกตรวจในโค้ดว่ามีจริง
//     และเป็นของ tenant/system นั้น ก่อนเขียนเสมอ
//  6. 🔴 PDPA: `question`/`answer` = สำเนาเนื้อความ ⇒ ถูกกวาดด้วย `retentionDays` ที่ retention.ts
//
// ⚠️ ใช้ `tenantDb` (ผูกขอบเขตอัตโนมัติ) **และ** เขียน tenantId/systemId ใน where ซ้ำอีกชั้น —
//    ตั้งใจซ้ำ: ชั้นแรกกันคนลืม ชั้นสองทำให้อ่านโค้ดแล้วเห็นขอบเขตโดยไม่ต้องไปเปิด db.ts

import type { ChatChannelType, Prisma } from "@prisma/client";
import { tenantDb } from "@/lib/core/db";

/** ตัวอย่างคำตอบที่ถูกดึงไปใช้เป็นบริบท */
export type AnswerExampleHit = {
  id: string;
  question: string;
  answer: string;
  channel: ChatChannelType;
  lang: string | null;
};

export type SaveResult = { ok: boolean; exampleId?: string; reason?: string };

/** จำนวนตัวอย่างสูงสุดที่ยอมให้ไหลเข้า prompt รอบเดียว (คุมทั้ง token และสัญญาณรบกวน) */
const DEFAULT_TAKE = 5;

const db = (tenantId: string, systemId: string) => tenantDb({ tenantId, systemId });

/** token ยาวกว่านี้ = น่าจะเป็นภาษาที่ไม่มีเว้นวรรค → ต้องแตกเป็น n-gram (ดู searchTerms) */
const NGRAM_MIN_TOKEN = 12;
const NGRAM_SIZE = 8;
const NGRAM_STEP = 4;
/** เพดานจำนวนคำค้นต่อ 1 query — กัน `OR` บวมจนแผน SQL แย่ */
const MAX_TERMS = 10;

/**
 * แตกคำค้น — ต่อยอดจากกติกาของ `searchKb` แต่แก้จุดที่ searchKb ยังพลาดกับภาษาไทย
 *
 * 🔴 ภาษาไทย/จีน/ญี่ปุ่น **ไม่มีเว้นวรรคระหว่างคำ** ⇒ การตัดคำด้วย `\s+` อย่างเดียวจะได้
 *    token เดียวยาว ๆ ("ราคาแพ็กเกจดำน้ำสองวันเท่าไหร่ครับ") ซึ่งแทบไม่มีวันตรงกับข้อความไหนเลย
 *    ⇒ คลังตัวอย่าง/คลังความรู้จะ "มีของแต่หาไม่เจอ" = ฟีเจอร์ตายเงียบ
 *    แก้ด้วย n-gram หน้าต่างเลื่อน (8 ตัวอักษร ก้าวละ 4) — วิธีมาตรฐานของภาษาที่ไม่ตัดคำ
 *    ไม่ต้องพึ่งพจนานุกรมหรือไลบรารีตัดคำ (ซึ่งจะกลายเป็นของอีกชิ้นที่ต้องดูแล)
 * ⚠️ รอบนี้ **ไม่ทำ embedding** ตามมติ §5.4 — อัปเกรดเป็น vector search เป็น WO แยก
 */
export function searchTerms(query: string): string[] {
  const q = (query ?? "").trim();
  if (!q) return [];
  const words = q.split(/\s+/).map((t) => t.trim()).filter((t) => t.length >= 2);
  const out = new Set<string>([q, ...words]);
  for (const w of [q, ...words]) {
    if (w.length < NGRAM_MIN_TOKEN) continue;
    for (let i = 0; i + NGRAM_SIZE <= w.length; i += NGRAM_STEP) out.add(w.slice(i, i + NGRAM_SIZE));
  }
  return [...out].slice(0, MAX_TERMS);
}

// ───────────────────────── บันทึกตัวอย่าง (เส้นทางที่ 2 ของ §5.4) ─────────────────────────

/**
 * ทีมกด "บันทึกเป็นตัวอย่างคำตอบ" บนข้อความที่ส่งไปแล้ว
 *
 * 🔴 ต้องเป็นการกดของคน ไม่ใช่ผลข้างเคียงของการส่งข้อความ (กติกาข้อ 1 ด้านบน)
 * `question` = ข้อความล่าสุดของลูกค้า **ก่อนหน้า** คำตอบนี้ — คือสิ่งที่คำตอบนี้ตอบอยู่
 */
export async function saveAnswerExample(args: {
  tenantId: string;
  systemId: string;
  messageId: string;
  userId: string;
  tags?: string[];
}): Promise<SaveResult> {
  const { tenantId, systemId } = args;
  const messageId = (args.messageId ?? "").trim();
  if (!messageId) return { ok: false, reason: "ไม่ได้ระบุข้อความที่จะบันทึก" };
  const d = db(tenantId, systemId);

  // H3: ไม่มี FK → ตรวจเองว่าข้อความมีจริงและเป็นของร้าน/ระบบนี้
  const msg = await d.chatMessage.findFirst({ where: { id: messageId, tenantId, systemId } });
  if (!msg) return { ok: false, reason: "ไม่พบข้อความนี้ในระบบแชทของร้าน" };
  if (msg.direction !== "OUT") {
    return { ok: false, reason: "บันทึกได้เฉพาะคำตอบของทีม ไม่ใช่ข้อความของลูกค้า" };
  }
  if (msg.isInternal) {
    return { ok: false, reason: "โน้ตภายในบันทึกเป็นตัวอย่างคำตอบไม่ได้ (ลูกค้าไม่เคยเห็นข้อความนี้)" };
  }
  const answer = (msg.body ?? "").trim();
  if (!answer) return { ok: false, reason: "ข้อความนี้ไม่มีเนื้อความให้บันทึก" };

  const conv = await d.chatConversation.findFirst({
    where: { id: msg.conversationId, tenantId, systemId },
    include: { contact: true },
  });
  if (!conv) return { ok: false, reason: "ไม่พบบทสนทนาของข้อความนี้" };

  // คำถามที่นำไปสู่คำตอบนี้ = ข้อความของลูกค้าที่มาก่อนหน้าที่สุด
  const question = await d.chatMessage.findFirst({
    where: {
      tenantId,
      systemId,
      conversationId: conv.id,
      direction: "IN",
      isInternal: false,
      createdAt: { lt: msg.createdAt },
    },
    orderBy: { createdAt: "desc" },
  });
  const questionBody = (question?.body ?? "").trim();
  if (!questionBody) {
    return { ok: false, reason: "ยังหาข้อความของลูกค้าที่นำไปสู่คำตอบนี้ไม่เจอ" };
  }

  // กดซ้ำ = ไม่เพิ่มแถวใหม่ (ผู้ใช้กดสองครั้งไม่ควรได้ตัวอย่างซ้ำในคลัง)
  const dup = await d.chatAnswerExample.findFirst({
    where: { tenantId, systemId, sourceMessageId: msg.id },
  });
  if (dup) return { ok: true, exampleId: dup.id };

  const created = await d.chatAnswerExample.create({
    data: {
      tenantId,
      systemId,
      question: questionBody,
      answer,
      channel: conv.channel,
      lang: conv.contact.lang ?? null,
      tags: (args.tags ?? []) as unknown as Prisma.InputJsonValue,
      sourceMessageId: msg.id,
      fromSuggestionId: null, // พิมพ์เองล้วน — แยกออกจากตัวอย่างที่มาจาก AI
      createdByUserId: args.userId,
    },
  });
  return { ok: true, exampleId: created.id };
}

/**
 * บันทึกตัวอย่างจาก "คำแนะนำของ AI ที่ถูกส่งจริง" (เส้นทางที่ 1 ของ §5.4)
 * เรียกจาก `recordSuggestionOutcome` เท่านั้น — ไม่เปิดเป็น action ตรง ๆ
 *
 * 🔴 `answer` = ข้อความที่ **ส่งจริง** ไม่ใช่ที่ AI เสนอ (ของมนุษย์คือความจริงเสมอ)
 */
export async function saveAnswerExampleFromSuggestion(args: {
  tenantId: string;
  systemId: string;
  question: string;
  answer: string;
  channel: ChatChannelType;
  lang?: string | null;
  sourceMessageId?: string | null;
  fromSuggestionId: string;
  userId: string;
}): Promise<SaveResult> {
  const { tenantId, systemId } = args;
  const question = (args.question ?? "").trim();
  const answer = (args.answer ?? "").trim();
  if (!question || !answer) return { ok: false, reason: "ไม่มีเนื้อความพอที่จะเก็บเป็นตัวอย่าง" };

  const d = db(tenantId, systemId);
  const dup = await d.chatAnswerExample.findFirst({
    where: { tenantId, systemId, fromSuggestionId: args.fromSuggestionId },
  });
  if (dup) return { ok: true, exampleId: dup.id };

  const created = await d.chatAnswerExample.create({
    data: {
      tenantId,
      systemId,
      question,
      answer,
      channel: args.channel,
      lang: args.lang ?? null,
      tags: [] as unknown as Prisma.InputJsonValue,
      sourceMessageId: args.sourceMessageId ?? null,
      fromSuggestionId: args.fromSuggestionId,
      createdByUserId: args.userId,
    },
  });
  return { ok: true, exampleId: created.id };
}

// ───────────────────────── ค้นคลัง (ใช้เป็นบริบทของ AI แนะนำคำตอบ) ─────────────────────────

/**
 * ค้นตัวอย่างที่ใกล้เคียงคำถามของลูกค้า — keyword hybrid แบบเดียวกับ `searchKb`
 *
 * - ตัวที่ถูกถอด (`archivedAt`) **ไม่ถูกดึงมาใช้อีก** แต่แถวยังอยู่ให้ตรวจย้อนได้
 * - ตัวที่ถูกดึงไปใช้จริงจะขยับ `useCount` / `lastUsedAt` → ใช้จัดอันดับรอบถัดไป
 *   (ตัวอย่างที่ถูกหยิบบ่อย = ตัวที่ทีมยอมรับ — สัญญาณคุณภาพเดียวที่เรามีโดยไม่ต้องให้ใครมานั่งให้คะแนน)
 */
export async function searchAnswerExamples(args: {
  tenantId: string;
  systemId: string;
  query: string;
  channel?: ChatChannelType | null;
  lang?: string | null;
  take?: number;
  /**
   * `false` = อ่านอย่างเดียว ไม่ขยับ `useCount`/`lastUsedAt` (ค่าเริ่มต้น `true` = พฤติกรรมเดิม)
   * 🔴 เพิ่ม 1 ก.ย. (สาย F รายงาน): คอลัมน์บริบท "แสดง" คำแนะนำทุกครั้งที่เปิดห้อง — ถ้านับทุกครั้ง
   *    ตัวเลขที่แปลว่า "ทีมยอมรับตัวอย่างนี้" จะถูกปั๊มโดยการแค่มอง ⇒ สัญญาณคุณภาพเพี้ยน
   *    การนับที่มีความหมายคือตอนทีม **กดใช้** จริง (AI suggest/กดวางลงกล่องพิมพ์)
   */
  countUse?: boolean;
}): Promise<AnswerExampleHit[]> {
  const { tenantId, systemId } = args;
  const take = Math.max(1, Math.min(20, args.take ?? DEFAULT_TAKE));
  const ts = searchTerms(args.query);
  if (ts.length === 0) return [];

  const d = db(tenantId, systemId);
  const rows = await d.chatAnswerExample.findMany({
    where: {
      tenantId,
      systemId,
      archivedAt: null, // ของที่ถอดแล้วห้ามกลับมาสอน AI อีก
      ...(args.channel ? { channel: args.channel } : {}),
      ...(args.lang ? { lang: args.lang } : {}),
      OR: ts.flatMap((t) => [
        { question: { contains: t, mode: "insensitive" as const } },
        { answer: { contains: t, mode: "insensitive" as const } },
      ]),
    },
    orderBy: [{ useCount: "desc" }, { createdAt: "desc" }],
    take: take * 5,
  });

  // ให้คะแนนเหมือน searchKb: ตรงในคำถาม ×3 (คำถามคือสิ่งที่เรากำลังจับคู่) · ตรงในคำตอบ ×1
  const scored = rows
    .map((r) => {
      const q = r.question.toLowerCase();
      const a = r.answer.toLowerCase();
      let score = 0;
      for (const t of ts) {
        const tt = t.toLowerCase();
        if (q.includes(tt)) score += 3;
        else if (a.includes(tt)) score += 1;
      }
      return { r, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || b.r.useCount - a.r.useCount)
    .slice(0, take);

  if (scored.length > 0 && args.countUse !== false) {
    // best-effort: ตัวนับใช้จัดอันดับ ไม่ใช่ข้อมูลการเงิน — พลาดแล้วห้ามทำให้คำแนะนำล้ม
    await d.chatAnswerExample
      .updateMany({
        where: { tenantId, systemId, id: { in: scored.map((x) => x.r.id) } },
        data: { useCount: { increment: 1 }, lastUsedAt: new Date() },
      })
      .catch(() => ({ count: 0 }));
  }

  return scored.map(({ r }) => ({
    id: r.id,
    question: r.question,
    answer: r.answer,
    channel: r.channel,
    lang: r.lang,
  }));
}

/** รายการในคลังสำหรับหน้าจัดการ (ดู/ถอด) — รวมตัวที่ถอดแล้วได้ ถ้าขอ */
export async function listAnswerExamples(args: {
  tenantId: string;
  systemId: string;
  includeArchived?: boolean;
  take?: number;
}) {
  const { tenantId, systemId } = args;
  return db(tenantId, systemId).chatAnswerExample.findMany({
    where: {
      tenantId,
      systemId,
      ...(args.includeArchived ? {} : { archivedAt: null }),
    },
    orderBy: [{ createdAt: "desc" }],
    take: Math.max(1, Math.min(200, args.take ?? 50)),
  });
}

/** ถอดตัวอย่างที่ไม่ดีออกจากคลัง — ปัก `archivedAt` ไม่ลบแถว */
export async function archiveAnswerExample(args: {
  tenantId: string;
  systemId: string;
  exampleId: string;
  userId: string;
}): Promise<{ ok: boolean; reason?: string }> {
  const { tenantId, systemId } = args;
  const exampleId = (args.exampleId ?? "").trim();
  if (!exampleId) return { ok: false, reason: "ไม่ได้ระบุตัวอย่างที่จะถอด" };
  const res = await db(tenantId, systemId).chatAnswerExample.updateMany({
    where: { id: exampleId, tenantId, systemId, archivedAt: null },
    data: { archivedAt: new Date() },
  });
  if (res.count === 0) return { ok: false, reason: "ไม่พบตัวอย่างนี้ในคลังของร้าน (หรือถูกถอดไปแล้ว)" };
  return { ok: true };
}

/** เอาตัวอย่างที่ถอดแล้วกลับมาใช้ใหม่ (ถอดผิดตัวต้องแก้ได้ ไม่ใช่ทางเดียว) */
export async function restoreAnswerExample(args: {
  tenantId: string;
  systemId: string;
  exampleId: string;
}): Promise<{ ok: boolean; reason?: string }> {
  const { tenantId, systemId } = args;
  const res = await db(tenantId, systemId).chatAnswerExample.updateMany({
    where: { id: (args.exampleId ?? "").trim(), tenantId, systemId, archivedAt: { not: null } },
    data: { archivedAt: null },
  });
  if (res.count === 0) return { ok: false, reason: "ไม่พบตัวอย่างที่ถูกถอดไว้" };
  return { ok: true };
}
