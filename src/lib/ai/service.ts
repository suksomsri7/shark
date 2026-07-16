// service ผู้ช่วย AI (Phase 1) — guard → provider → persist (docs/AI_LAYER.md)
// scope: AiConversation/AiMessage/AiUsage เป็น tenant-scoped → tenantDb({ tenantId })

import { prisma, tenantDb } from "@/lib/core/db";
import { buildSystemPrompt } from "./persona";
import { dailyLimits, resolveProvider, type AiChatMessage, type AiProvider } from "./provider";
import { dayKeyBangkok, overBudget, titleFrom, trimHistory } from "./rules";
import { runTool, toolRegistry } from "./tools";

export type Ctx = { tenantId: string };

const HISTORY_MAX_CHARS = 24_000; // งบบริบทต่อ request (ประมาณ ~6k token)
const HISTORY_TAKE = 40; // ดึงล่าสุดกี่แถวก่อน trim
const MAX_TOOL_ROUNDS = 5; // เพดานรอบ agent loop (กันวนไม่จบ)
// ข้อความปิดสุภาพเมื่อวนครบเพดานแต่ยังไม่ได้คำตอบ
const FALLBACK_REPLY =
  "ขอโทษครับ ผมยังหาคำตอบให้ไม่เสร็จในตอนนี้ ลองถามใหม่หรือถามให้เจาะจงขึ้นอีกนิดได้ครับ";

export type SendResult =
  | { ok: true; conversationId: string; reply: string }
  | { ok: false; error: "ai_disabled" | "over_budget" | "empty" };

/** บทสนทนาล่าสุดของ tenant (ไม่มี = null) */
export async function latestConversation(ctx: Ctx) {
  return tenantDb(ctx).aiConversation.findFirst({ orderBy: { updatedAt: "desc" } });
}

/** ข้อความในบทสนทนา (เรียงเก่า→ใหม่) */
export async function listMessages(ctx: Ctx, conversationId: string, take = 100) {
  return tenantDb(ctx).aiMessage.findMany({
    where: { conversationId },
    orderBy: { createdAt: "asc" },
    take,
  });
}

/** เปิดใช้ได้ไหม (มี provider) — UI ใช้ตัดสินใจแสดงสถานะ */
export function aiEnabled(): boolean {
  return resolveProvider() !== null;
}

/**
 * ส่งข้อความหา AI: ตรวจเพดาน → เรียก provider → persist USER+ASSISTANT + นับ usage
 * ไม่มี provider/เกินเพดาน = คืน error สุภาพ (ไม่ throw — UI ต้องแสดงข้อความได้เสมอ)
 */
export async function sendMessage(
  ctx: Ctx,
  input: { conversationId?: string; text: string },
  deps?: { provider?: AiProvider },
): Promise<SendResult> {
  const text = input.text.trim();
  if (!text) return { ok: false, error: "empty" };

  // provider ฉีดได้ (ข้อสอบ) — ไม่งั้นเลือกจาก env
  const provider = deps?.provider ?? resolveProvider();
  if (!provider) return { ok: false, error: "ai_disabled" };

  const db = tenantDb(ctx);
  const day = dayKeyBangkok(new Date());
  const usage = await db.aiUsage.findFirst({ where: { day } });
  if (
    overBudget(
      { requests: usage?.requests ?? 0, tokensIn: usage?.tokensIn ?? 0, tokensOut: usage?.tokensOut ?? 0 },
      dailyLimits(),
    )
  ) {
    return { ok: false, error: "over_budget" };
  }

  // persona ต้องรู้ชื่อกิจการ + ระบบที่เปิด
  const [tenant, systems] = await Promise.all([
    prisma.tenant.findUniqueOrThrow({ where: { id: ctx.tenantId } }),
    db.appSystem.findMany({ select: { type: true, name: true }, orderBy: { createdAt: "asc" } }),
  ]);

  // บทสนทนา: ต่อของเดิมถ้าระบุ ไม่งั้นเปิดใหม่
  const conv = input.conversationId
    ? await db.aiConversation.findFirst({ where: { id: input.conversationId } })
    : null;
  const conversation =
    conv ??
    (await prisma.aiConversation.create({
      data: { tenantId: ctx.tenantId, title: titleFrom(text) },
    }));

  const history = await db.aiMessage.findMany({
    where: { conversationId: conversation.id },
    orderBy: { createdAt: "desc" },
    take: HISTORY_TAKE,
  });

  const messages: AiChatMessage[] = [
    { role: "system", content: buildSystemPrompt({ tenantName: tenant.name, systems }) },
    ...trimHistory(
      history
        .reverse()
        .map((m) => ({ role: m.role === "USER" ? ("user" as const) : ("assistant" as const), content: m.content })),
      HISTORY_MAX_CHARS,
    ),
    { role: "user", content: text },
  ];

  // ── agent loop ── ส่ง tools ทุกรอบ · LLM ขอเรียกเครื่องมือ → รัน (read-only) แล้วป้อนผลกลับรอบถัดไป
  // เพดาน 5 รอบ (กันวนไม่จบ) · ครบเพดานยังไม่ได้คำตอบ = ปิดด้วยข้อความสุภาพ
  // token/usage รวมทุกรอบ · persist เฉพาะ USER + ASSISTANT ตัวจบ (ไม่เก็บ tool traffic)
  const tools = toolRegistry().map((t) => t.def);
  let tokensIn = 0;
  let tokensOut = 0;
  let finalText = "";

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const reply = await provider.chat(messages, { tools });
    tokensIn += reply.tokensIn;
    tokensOut += reply.tokensOut;

    if (reply.toolCalls && reply.toolCalls.length > 0) {
      messages.push({ role: "assistant", content: reply.text ?? "", toolCalls: reply.toolCalls });
      for (const tc of reply.toolCalls) {
        const result = await runTool({ tenantId: ctx.tenantId }, tc.name, tc.args);
        messages.push({ role: "tool", content: result, toolCallId: tc.id });
      }
      continue; // ไปรอบถัดไปให้ LLM เรียบเรียงคำตอบจากผลเครื่องมือ
    }

    finalText = reply.text;
    break;
  }
  if (!finalText.trim()) finalText = FALLBACK_REPLY;

  // persist คู่ข้อความ + ยอดใช้ อะตอมมิก (ผ่าน prisma ตรง — ใส่ tenantId เองให้ตรง type)
  await prisma.$transaction([
    prisma.aiMessage.create({
      data: { tenantId: ctx.tenantId, conversationId: conversation.id, role: "USER", content: text },
    }),
    prisma.aiMessage.create({
      data: {
        tenantId: ctx.tenantId,
        conversationId: conversation.id,
        role: "ASSISTANT",
        content: finalText,
        tokensIn,
        tokensOut,
      },
    }),
    prisma.aiConversation.update({ where: { id: conversation.id }, data: { updatedAt: new Date() } }),
    prisma.aiUsage.upsert({
      where: { tenantId_day: { tenantId: ctx.tenantId, day } },
      create: { tenantId: ctx.tenantId, day, requests: 1, tokensIn, tokensOut },
      update: {
        requests: { increment: 1 },
        tokensIn: { increment: tokensIn },
        tokensOut: { increment: tokensOut },
      },
    }),
  ]);

  return { ok: true, conversationId: conversation.id, reply: finalText };
}
