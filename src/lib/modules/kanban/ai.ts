// ai.ts — ปุ่ม "ผู้ช่วย AI" 3 ปุ่มในหลังการ์ด (K3.5 · ภาพ `ledger/design-kanban/03-card-back.png` แถบขวา)
//
// 🔴 กติกาที่ห้ามรื้อ (พิมพ์เขียว §8.3)
//  1. **AI ไม่เคยลงมือเอง** — `suggestChecklist` เป็นข้อเสนอล้วน (ไม่แตะ DB) เช็คลิสต์จะเกิดต่อเมื่อคน
//     กด "เพิ่มเช็คลิสต์นี้" → `acceptChecklistSuggestion` · `draftReply` ไม่บันทึกอะไรเลย
//     ตัวเดียวที่เขียน DB ทันทีคือ `summarizeCard` และมันเขียนเป็น **ความเห็นที่ติดป้าย "ผู้ช่วย AI"**
//     ซึ่งคนลบทิ้งได้ ไม่ใช่การเปลี่ยนเนื้องาน
//  2. **ห้ามปลอมเป็นคน** — ความเห็นทุกใบที่มาจากที่นี่ `aiGenerated: true` และขึ้นต้นด้วย
//     "สรุปโดยผู้ช่วย AI:" · `authorUserId` = คนกดปุ่ม (เพื่อให้รู้ว่าใครสั่ง ไม่ใช่เพื่อบอกว่าใครเขียน)
//  3. **prompt เป็นภาษาอังกฤษ** ([[reference_llm_thai_token_cost]]) — เนื้อหาการ์ด (ไทย) แนบเป็น data
//     ท้าย prompt · ผลลัพธ์ที่ผู้ใช้เห็นเป็นไทย
//  4. **โมเดลล่ม = ต้องบอกตรง ๆ** ไม่ใช่เขียนความเห็นเปล่า ๆ ลงการ์ด (ต่างจาก K3.2 ที่มีตัวร่างสำรอง
//     แบบคำนวณล้วน — ที่นี่ "สรุปงาน" ที่ไม่ได้อ่านงานจริงไม่มีค่าอะไรเลย)
//  5. **สิทธิ์ = EDITOR ของบอร์ด** ทุกฟังก์ชัน (ด่านจริงคือ `assertCardRole` ไม่ใช่การซ่อนปุ่ม)
//
// เพดาน token ขาออก 1500 ตามบทเรียน K3.2 (ไทยกิน token ~4 เท่า · 700 เคยตัด JSON กลางคัน)

import { z } from "zod";
import { resolveProvider, SMART_MODEL } from "@/lib/ai/provider";
import { canSpend, chargeUsageSafe } from "@/lib/ai/credit";
import { logActivity } from "./activity-log";
import { getCardFullDetail } from "./cards";
import { addItem, createChecklist } from "./checklists";
import { addComment } from "./comments";
import { prisma } from "./db";
import { assertCardRole } from "./members";
import type { CardFullDetailDto, KanbanActor, KanbanCtx } from "./types";

// ───────────────────────── ค่าคงที่ ─────────────────────────

/** ความเห็น/ความเห็นย้อนหลังที่ยัดเข้า prompt (มากกว่านี้จ่าย token โดยไม่ได้ความแม่นเพิ่ม) */
const PROMPT_COMMENTS = 20;
const SUMMARY_MAX = 700;
const REPLY_MAX = 900;
const CHECKLIST_ITEMS_MAX = 10;
const ITEM_TEXT_MAX = 120;
/** 🔴 ขาออกไทยกิน token ~4 เท่า — เพดานต่ำกว่านี้เคยตัด JSON กลางคันเงียบ ๆ (บทเรียน K3.2) */
const MAX_TOKENS = 1500;

const SUMMARY_PREFIX = "สรุปโดยผู้ช่วย AI:";
const NO_AI_TH =
  "ยังไม่ได้ตั้งค่าผู้ช่วย AI — ตั้งค่าที่ ตั้งค่าร้าน › ผู้ช่วย AI (หรือเติมเครดิต AI) ก่อนใช้ปุ่มนี้";
const AI_BROKEN_TH = "ผู้ช่วย AI ตอบกลับไม่ครบ — ลองกดอีกครั้ง";

// ───────────────────────── ชนิด ─────────────────────────

/** ฉีดตัวเรียกโมเดลเองได้ (ข้อสอบ/ภาพใช้ตัวปลอม — ห้ามจ่ายเครดิตร้านโดยไม่จำเป็น) */
export type KanbanAiDeps = { complete?: (prompt: string) => Promise<string> };
export type KanbanAiOpts = { deps?: KanbanAiDeps };

export type CardSummaryResult = { commentId: string; text: string };
export type ChecklistSuggestion = { title: string; items: string[] };
export type DraftReplyResult = { text: string };

// ───────────────────────── ตัวเรียกโมเดล ─────────────────────────

/** ร้านนี้ใช้ปุ่มผู้ช่วย AI ได้ไหม (จอเอาไปตัดสินว่าจะ disable ปุ่ม — ไม่ใช่ด่านความปลอดภัย) */
export function isKanbanAiConfigured(): boolean {
  return resolveProvider("smart") !== null;
}

/**
 * ตัวเรียกโมเดลจริงของร้าน (คีย์ + เครดิตอยู่ที่ `src/lib/ai/*`)
 * ไม่มีคีย์/เครดิตหมด และไม่มี `deps.complete` → โยนข้อความไทยที่บอกทางแก้ (ไม่ใช่ error ดิบ)
 */
async function completionOf(ctx: KanbanCtx, deps?: KanbanAiDeps): Promise<(prompt: string) => Promise<string>> {
  if (deps?.complete) return deps.complete;
  const provider = resolveProvider("smart");
  if (!provider) throw new Error(NO_AI_TH);
  if (!(await canSpend(ctx.tenantId))) throw new Error(NO_AI_TH);
  return async (prompt: string) => {
    const reply = await provider.chat([{ role: "user", content: prompt }], { maxTokens: MAX_TOKENS });
    if (reply.tokensOut >= MAX_TOKENS) {
      // ชนเพดาน = คำตอบถูกตัดกลางคัน — ต้องเห็นในบันทึก ไม่ใช่ "คำตอบสั้นผิดปกติ" ที่หาสาเหตุไม่เจอ
      const { logOps } = await import("@/lib/core/ops");
      await logOps("WARN", "kanban.ai", `คำตอบของผู้ช่วย AI ชนเพดาน ${MAX_TOKENS} token — อาจถูกตัดกลางคัน`, {
        tenantId: ctx.tenantId,
        detail: `tokensOut=${reply.tokensOut} model=${reply.model || SMART_MODEL}`,
      });
    }
    await chargeUsageSafe(
      { tenantId: ctx.tenantId },
      {
        // ⚠️ หนี้: enum `AiCreditSource` ยังไม่มีช่องของบอร์ดงาน ⇒ ลงกระเป๋าเดียวกับ K3.2
        //    ("ทีมงานใช้ AI ตอนทำงานกับลูกค้า") · เพิ่มค่า enum = ไมเกรชันของ WO ถัดไป
        source: "CHAT_SUGGEST",
        model: reply.model || SMART_MODEL,
        tokensIn: reply.tokensIn,
        tokensOut: reply.tokensOut,
        ...(ctx.actorUserId ? { userId: ctx.actorUserId } : {}),
        note: "ผู้ช่วย AI ในหลังการ์ด (K3.5)",
      },
    );
    return reply.text;
  };
}

/** ผู้เรียกส่ง actor มาเอง (แบบเดียวกับ service อื่นของโมดูล) — ใช้ตัวนั้นเป็นตัวตัดสินสิทธิ์ */
function withActor(ctx: KanbanCtx, actor: KanbanActor): KanbanCtx {
  return { ...ctx, actor };
}

const oneLine = (s: string) => s.replace(/\s+/g, " ").trim();
const cut = (s: string, max: number) => (s.length <= max ? s : `${s.slice(0, max - 1)}…`);

/** ทิ้งรั้ว ```json ที่โมเดลชอบใส่มา แล้วหยิบก้อน { … } ก้อนแรก */
function extractJson(raw: string): unknown {
  const text = raw.replace(/```json/gi, "```").replace(/```/g, "").trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  const body = start >= 0 && end > start ? text.slice(start, end + 1) : text;
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

// ───────────────────────── prompt (อังกฤษล้วน · เนื้อหาการ์ดแนบเป็น data) ─────────────────────────
//
// 🔴 อยู่รวมกันตรงนี้ที่เดียวโดยตั้งใจ: อ่านจบใน 30 บรรทัดว่า "อะไรออกจากร้านไปหาผู้ให้บริการ LLM"
//    คำตอบคือ **เนื้อหาของการ์ดใบเดียวที่คนกดเปิดอยู่** (ชื่อ/รายละเอียด/เช็คลิสต์/ความเห็น)
//    ไม่มีเบอร์/อีเมล/รหัสภายใน และไม่มีข้อมูลของการ์ดใบอื่น

/** เนื้อหาการ์ดที่แนบท้าย prompt — บรรทัดแรกของ prompt ต้องเป็นอังกฤษเสมอ (ข้อสอบเฝ้าอยู่) */
function cardContext(detail: CardFullDetailDto): string {
  const lines: string[] = [`TITLE: ${detail.title}`];
  if (detail.description) lines.push(`DESCRIPTION:\n${cut(detail.description, 4000)}`);
  if (detail.labels.length > 0) lines.push(`LABELS: ${detail.labels.join(", ")}`);
  if (detail.dueAt) lines.push(`DUE: ${detail.dueAt}`);
  for (const cl of detail.checklists) {
    const items = cl.items.map((i) => `${i.done ? "[x]" : "[ ]"} ${i.text}`).join("\n");
    lines.push(`CHECKLIST "${cl.title}":\n${items}`);
  }
  const comments = detail.comments.slice(-PROMPT_COMMENTS);
  if (comments.length > 0) {
    lines.push(`COMMENTS (oldest first):\n${comments.map((c) => `- ${c.author}: ${oneLine(c.body)}`).join("\n")}`);
  }
  for (const l of detail.links) lines.push(`LINKED ${l.linkType}: ${l.title}${l.subtitle ? ` (${l.subtitle})` : ""}`);
  return lines.join("\n");
}

function summaryPrompt(detail: CardFullDetailDto): string {
  return [
    "You summarise ONE task card of a Thai dive shop back office for the staff working on it.",
    "Reply with Thai prose only: 2 to 4 sentences, no markdown, no bullet list, no preamble.",
    "Say what the task is, what has already been done, and what is still open.",
    "Keep every number the card mentions (people, dates, money). Never invent facts that are not in the card.",
    `Stay under ${SUMMARY_MAX} characters.`,
    "CARD:",
    cardContext(detail),
  ].join("\n");
}

function checklistPrompt(detail: CardFullDetailDto): string {
  return [
    "You turn ONE task card of a Thai dive shop back office into a short checklist of concrete steps.",
    "Reply with JSON only, no prose, no markdown fences.",
    'Shape: {"title": string, "items": string[]}',
    "Rules:",
    "- title: Thai, at most 60 characters, names the group of steps.",
    `- items: at most ${CHECKLIST_ITEMS_MAX} Thai steps, each at most ${ITEM_TEXT_MAX} characters, in the order they must happen.`,
    "- Skip steps the card already marks as done. Never invent prices, availability or promises.",
    "CARD:",
    cardContext(detail),
  ].join("\n");
}

function replyPrompt(detail: CardFullDetailDto): string {
  return [
    "You draft ONE message the shop staff will send to the customer of this task card.",
    "Reply with the Thai message body only: no greeting placeholders, no markdown, no explanation of what you wrote.",
    "Be polite, concrete and short (at most 4 sentences). Confirm only what the card already states.",
    "Never promise a price, a date or availability that the card does not contain. Unknown stays unknown.",
    `Stay under ${REPLY_MAX} characters.`,
    "CARD:",
    cardContext(detail),
  ].join("\n");
}

// ───────────────────────── ปุ่มที่ 1: สรุปการ์ดนี้ ─────────────────────────

/**
 * อ่านชื่อ/รายละเอียด/เช็คลิสต์/ความเห็นของการ์ด → เขียน "ความเห็นของผู้ช่วย AI" 1 ใบลงการ์ด
 * (ติดป้าย `aiGenerated` + กิจกรรม `AI_SUGGESTED` เพื่อให้ย้อนอ่านได้ว่าใครสั่งเมื่อไร)
 */
export async function summarizeCard(
  ctx: KanbanCtx,
  actor: KanbanActor,
  cardId: string,
  opts: KanbanAiOpts = {},
): Promise<CardSummaryResult> {
  const c = withActor(ctx, actor);
  const { boardId } = await assertCardRole(c, cardId, "EDITOR");
  const detail = await getCardFullDetail(c, cardId);
  const complete = await completionOf(c, opts.deps);
  const text = cut(oneLine(await complete(summaryPrompt(detail))), SUMMARY_MAX);
  if (!text) throw new Error(AI_BROKEN_TH);

  const comment = await addComment(c, cardId, `${SUMMARY_PREFIX} ${text}`, { aiGenerated: true });
  await logActivity(prisma, {
    tenantId: c.tenantId,
    boardId,
    cardId,
    actorUserId: c.actorUserId ?? null,
    type: "AI_SUGGESTED",
    data: { kind: "summary", commentId: comment.id },
  });
  return { commentId: comment.id, text };
}

// ───────────────────────── ปุ่มที่ 2: แตกเป็นเช็คลิสต์ (เสนอ → คนกดรับ) ─────────────────────────

const SuggestionSchema = z.object({
  title: z.string().trim().min(1).max(60),
  items: z.array(z.string().trim().min(1)).min(1),
});

/** 🔴 ข้อเสนอล้วน — ไม่เขียนอะไรลง DB เลย (คนต้องกด "เพิ่มเช็คลิสต์นี้" ก่อน) */
export async function suggestChecklist(
  ctx: KanbanCtx,
  actor: KanbanActor,
  cardId: string,
  opts: KanbanAiOpts = {},
): Promise<ChecklistSuggestion> {
  const c = withActor(ctx, actor);
  await assertCardRole(c, cardId, "EDITOR");
  const detail = await getCardFullDetail(c, cardId);
  const complete = await completionOf(c, opts.deps);
  const parsed = SuggestionSchema.safeParse(extractJson(await complete(checklistPrompt(detail))));
  if (!parsed.success) throw new Error(AI_BROKEN_TH);
  return {
    title: cut(oneLine(parsed.data.title), 60),
    items: parsed.data.items.map((t) => cut(oneLine(t), ITEM_TEXT_MAX)).filter(Boolean).slice(0, CHECKLIST_ITEMS_MAX),
  };
}

/**
 * คนกด "เพิ่มเช็คลิสต์นี้" → สร้างจริงผ่าน service ของเช็คลิสต์ (ด่าน EDITOR + เพดานจำนวนรายการ
 * เป็นตัวเดียวกับตอนคนพิมพ์เอง) · แก้รายการก่อนกดได้ ⇒ ที่ส่งมาคือสิ่งที่คนเห็นและยอมรับแล้ว
 */
export async function acceptChecklistSuggestion(
  ctx: KanbanCtx,
  actor: KanbanActor,
  cardId: string,
  suggestion: ChecklistSuggestion,
): Promise<{ checklistId: string }> {
  const c = withActor(ctx, actor);
  const { boardId } = await assertCardRole(c, cardId, "EDITOR");
  const parsed = SuggestionSchema.safeParse(suggestion);
  if (!parsed.success) throw new Error("ข้อเสนอเช็คลิสต์ไม่ครบ — กดสร้างข้อเสนอใหม่อีกครั้ง");
  const items = parsed.data.items.map((t) => cut(oneLine(t), ITEM_TEXT_MAX)).filter(Boolean).slice(0, CHECKLIST_ITEMS_MAX);

  const checklist = await createChecklist(c, cardId, cut(oneLine(parsed.data.title), 60));
  for (const text of items) await addItem(c, checklist.id, text);
  await logActivity(prisma, {
    tenantId: c.tenantId,
    boardId,
    cardId,
    actorUserId: c.actorUserId ?? null,
    type: "AI_SUGGESTED",
    data: { kind: "checklist", accepted: true, checklistId: checklist.id, count: items.length },
  });
  return { checklistId: checklist.id };
}

// ───────────────────────── ปุ่มที่ 3: ร่างข้อความตอบลูกค้า ─────────────────────────

/** ร่างอย่างเดียว — ไม่บันทึก ไม่ส่ง (คนคัดลอกไปแก้แล้วส่งเองในช่องทางที่ถูก) */
export async function draftReply(
  ctx: KanbanCtx,
  actor: KanbanActor,
  cardId: string,
  opts: KanbanAiOpts = {},
): Promise<DraftReplyResult> {
  const c = withActor(ctx, actor);
  await assertCardRole(c, cardId, "EDITOR");
  const detail = await getCardFullDetail(c, cardId);
  const complete = await completionOf(c, opts.deps);
  const text = cut((await complete(replyPrompt(detail))).trim(), REPLY_MAX);
  if (!text) throw new Error(AI_BROKEN_TH);
  return { text };
}
