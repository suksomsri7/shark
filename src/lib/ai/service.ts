// service ผู้ช่วย AI (Phase 1) — guard → provider → persist (docs/AI_LAYER.md)
// scope: AiConversation/AiMessage/AiUsage เป็น tenant-scoped → tenantDb({ tenantId })

import { prisma, tenantDb } from "@/lib/core/db";
import { logOps } from "@/lib/core/ops";
import { recordSample } from "./dataset";
import { memoryBlock } from "./memory";
import { buildSystemPrompt } from "./persona";
import { dailyLimits, FAST_MODEL, pickModel, resolveProvider, type AiChatMessage, type AiProvider } from "./provider";
import { dayKeyBangkok, overBudget, titleFrom, trimHistory } from "./rules";
import { runTool, toolRegistry } from "./tools";

export type Ctx = { tenantId: string };

const HISTORY_MAX_CHARS = 24_000; // งบบริบทต่อ request (ประมาณ ~6k token)
const HISTORY_TAKE = 40; // ดึงล่าสุดกี่แถวก่อน trim
const MAX_TOOL_ROUNDS = 5; // เพดานรอบ agent loop (กันวนไม่จบ)
// ข้อความปิดสุภาพเมื่อวนครบเพดานแต่ยังไม่ได้คำตอบ
const FALLBACK_REPLY =
  "ขอโทษครับ ผมยังหาคำตอบให้ไม่เสร็จในตอนนี้ ลองถามใหม่หรือถามให้เจาะจงขึ้นอีกนิดได้ครับ";

export type ClarifyOption = { label: string; value: string };
export type Clarify = { question: string; options: ClarifyOption[] };

export type SendResult =
  | { ok: true; conversationId: string; reply: string; clarify?: Clarify }
  | { ok: false; error: "ai_disabled" | "over_budget" | "empty" };

// แปลง args ของ ask_clarify เป็น Clarify ที่สะอาด (กัน args เพี้ยน) — คืน null ถ้าไม่มีคำถาม/ตัวเลือกใช้ได้
function parseClarify(rawArgs: unknown): Clarify | null {
  const a = (rawArgs && typeof rawArgs === "object" ? rawArgs : {}) as Record<string, unknown>;
  const question = String(a.question ?? "").trim();
  const options = Array.isArray(a.options)
    ? a.options
        .map((o) => {
          const r = (o && typeof o === "object" ? o : {}) as Record<string, unknown>;
          const label = String(r.label ?? "").trim();
          const value = String(r.value ?? label).trim();
          return { label, value };
        })
        .filter((o) => o.label.length > 0)
    : [];
  if (!question || options.length === 0) return null;
  return { question, options };
}

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
  input: { conversationId?: string; text: string; imageUrls?: string[] },
  deps?: { provider?: AiProvider },
): Promise<SendResult> {
  const text = input.text.trim();
  if (!text) return { ok: false, error: "empty" };

  // routing ชั้น 1: เลือกโมเดลตามเนื้อความ (env SHARK_AI_MODEL ตั้งไว้ = คืนตัวนั้นเสมอ)
  // → ชั้น 2: resolveProvider ตาม tier · provider ฉีดได้ (ข้อสอบ) ไม่งั้นเลือกจาก env
  const routedModel = pickModel(text, (input.imageUrls?.length ?? 0) > 0);
  const tier = routedModel === FAST_MODEL ? "fast" : "smart";
  const provider = deps?.provider ?? resolveProvider(tier);
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

  // persona ต้องรู้ชื่อกิจการ + ระบบที่เปิด + ความจำถาวรของร้าน (พ่วง Promise.all เดิม ไม่เพิ่ม round-trip แยก)
  const [tenant, systems, memories] = await Promise.all([
    prisma.tenant.findUniqueOrThrow({ where: { id: ctx.tenantId } }),
    db.appSystem.findMany({ select: { type: true, name: true }, orderBy: { createdAt: "asc" } }),
    memoryBlock({ tenantId: ctx.tenantId }),
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
    { role: "system", content: buildSystemPrompt({ tenantName: tenant.name, systems, memories }) },
    ...trimHistory(
      history
        .reverse()
        .map((m) => ({ role: m.role === "USER" ? ("user" as const) : ("assistant" as const), content: m.content })),
      HISTORY_MAX_CHARS,
    ),
    // แนบรูปเข้ากับข้อความ user (ส่งเข้าโมเดล vision inline) — ไม่ persist รูปใน DB
    {
      role: "user",
      content: text,
      ...(input.imageUrls && input.imageUrls.length > 0 ? { imageUrls: input.imageUrls } : {}),
    },
  ];

  // ── agent loop ── ส่ง tools ทุกรอบ · LLM ขอเรียกเครื่องมือ → รัน (read-only) แล้วป้อนผลกลับรอบถัดไป
  // เพดาน 5 รอบ (กันวนไม่จบ) · ครบเพดานยังไม่ได้คำตอบ = ปิดด้วยข้อความสุภาพ
  // token/usage รวมทุกรอบ · persist เฉพาะ USER + ASSISTANT ตัวจบ (ไม่เก็บ tool traffic)
  // ยื่นเครื่องมือครบชุดเสมอ (test = prod ห้ามต่างกัน) — action tools แค่ "เสนอ" proposal
  // การทำจริงเกิดที่ปุ่มยืนยันใน UI + assertCan สิทธิ์คนกด จึงปลอดภัยแม้ LLM เรียกมั่ว
  const tools = toolRegistry().map((t) => t.def);
  let tokensIn = 0;
  let tokensOut = 0;
  let finalText = "";
  let clarify: Clarify | null = null;
  const usedTools: { name: string; args: unknown }[] = []; // เครื่องมือที่ถูกเรียกจริงในเทิร์นนี้ (dataset)

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    let reply;
    try {
      reply = await provider.chat(messages, { tools });
    } catch (e) {
      // provider ล่ม → บันทึก ERROR แล้วโยนต่อ (พฤติกรรมเดิมห้ามเปลี่ยน)
      await logOps("ERROR", "ai", "provider.chat ล้มเหลว", {
        tenantId: ctx.tenantId,
        detail: e instanceof Error ? (e.stack ?? e.message) : String(e),
      });
      throw e;
    }
    tokensIn += reply.tokensIn;
    tokensOut += reply.tokensOut;

    if (reply.toolCalls && reply.toolCalls.length > 0) {
      // ask_clarify — คำสั่งกำกวม: จบเทิร์นด้วยคำถาม + ตัวเลือกให้กด (ไม่วน tool ต่อ ไม่สร้าง proposal)
      const clarifyCall = reply.toolCalls.find((tc) => tc.name === "ask_clarify");
      if (clarifyCall) {
        const parsed = parseClarify(clarifyCall.args);
        if (parsed) {
          clarify = parsed;
          finalText = parsed.question;
          break;
        }
      }
      messages.push({ role: "assistant", content: reply.text ?? "", toolCalls: reply.toolCalls });
      for (const tc of reply.toolCalls) {
        usedTools.push({ name: tc.name, args: tc.args });
        // ส่ง conversation.id เข้าไปด้วย — action tool ต้องใช้ผูก proposal กับบทสนทนา
        const result = await runTool(
          { tenantId: ctx.tenantId, conversationId: conversation.id },
          tc.name,
          tc.args,
        );
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

  // เก็บ dataset (ฐาน self-host) — best-effort เท่านั้น: ห้ามให้พังการตอบ · gate ด้วย env ภายใน
  try {
    await recordSample(ctx, {
      userText: text,
      toolCalls: usedTools,
      replyText: finalText,
      model: routedModel,
    });
  } catch {
    // เก็บไม่ได้ = ข้าม (dataset เป็นงานเบื้องหลัง ไม่กระทบผู้ใช้)
  }

  return {
    ok: true,
    conversationId: conversation.id,
    reply: finalText,
    ...(clarify ? { clarify } : {}),
  };
}
