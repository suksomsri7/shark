// service ผู้ช่วย AI (Phase 1) — guard → provider → persist (docs/AI_LAYER.md)
// scope: AiConversation/AiMessage/AiUsage เป็น tenant-scoped → tenantDb({ tenantId })

import { prisma, tenantDb } from "@/lib/core/db";
import { logOps } from "@/lib/core/ops";
import { approvedPromptTweaksText } from "@/lib/platform/ai-tuning";
import { recordSample } from "./dataset";
import { memoryBlock } from "./memory";
import { buildSystemPrompt } from "./persona";
import { dailyLimits, FAST_MODEL, pickModel, resolveProvider, type AiChatMessage, type AiProvider } from "./provider";
import { dayKeyBangkok, overBudget, titleFrom, trimHistory } from "./rules";
import { runTool, toolRegistry } from "./tools";
import type { AiActor } from "./actor";
import { canSeeConversationId, newConversationId, sightOf, visibleConversationWhere, type ConvCtx } from "./conversation-owner";
import { findVisibleConversation, latestVisibleConversation } from "./conversations";
import { toolsOfferedTo } from "./tool-access";
import {
  CORE_TOOLS, LOAD_SKILL_TOOL, skillById, skillIndexPrompt, skillsForTenant, toolNamesOfSkills,
} from "./skills";
import { applyDegrade } from "./usage";
import { balanceOf, canSpend, chargeUsageSafe } from "./credit";
import type { AiCreditSource } from "@prisma/client";

export type Ctx = { tenantId: string };
/**
 * CRM C5.5-G1 ▸ ctx ของการส่งข้อความ = ร้าน + **ผู้กระทำ (บังคับ)** — ทุกเครื่องมือในเทิร์นนี้รันด้วยสิทธิ์ของผู้กระทำนี้
 *   และโมเดลได้รับเฉพาะเครื่องมือ/สกิลที่ผู้กระทำใช้ได้ (ดู ./tool-access.ts) ◂
 */
export type SendCtx = Ctx & { actor: AiActor };

const HISTORY_MAX_CHARS = 24_000; // งบบริบทต่อ request (ประมาณ ~6k token)
const HISTORY_TAKE = 40; // ดึงล่าสุดกี่แถวก่อน trim
const MAX_TOOL_ROUNDS = 5; // เพดานรอบ agent loop (กันวนไม่จบ)
// เครดิตเหลือน้อยกว่านี้ → ลดชั้นเป็น haiku อัตโนมัติ เพื่อยืดเครดิตก้อนสุดท้ายให้คุยได้นานขึ้น
const LOW_BALANCE_MICRO = 500_000; // = $0.50
// ข้อความปิดสุภาพเมื่อวนครบเพดานแต่ยังไม่ได้คำตอบ
const FALLBACK_REPLY =
  "ขอโทษครับ ผมยังหาคำตอบให้ไม่เสร็จในตอนนี้ ลองถามใหม่หรือถามให้เจาะจงขึ้นอีกนิดได้ครับ";

export type ClarifyOption = { label: string; value: string };
export type Clarify = { question: string; options: ClarifyOption[] };

export type SendResult =
  | { ok: true; conversationId: string; reply: string; clarify?: Clarify }
  // over_budget: scope="credit" = เครดิตในกระเป๋าหมด (ต้องเติม) · "day" = ชนตาข่ายกันยิงรัวรายวัน
  | { ok: false; error: "ai_disabled" | "over_budget" | "empty"; scope?: "credit" | "day"; resetAt?: string };

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

/**
 * บทสนทนาล่าสุด **ที่ผู้ดูเห็น** (ไม่มี = null)
 * CRM C5.5-G2 ▸ เดิม = ห้องล่าสุดของทั้งร้าน (ของใครก็ได้) · ตอนนี้ = ของผู้ดูเอง (+ เจ้าของร้าน: ห้องที่ไม่ได้สร้างโดยคนในร้าน) ◂
 */
export async function latestConversation(ctx: ConvCtx) {
  return latestVisibleConversation(ctx);
}

/**
 * ข้อความในบทสนทนา (เรียงเก่า→ใหม่) — CRM C5.5-G2 ▸ เฉพาะบทสนทนาที่ผู้ดูเห็น (ไม่เห็น = ว่าง เหมือนไม่มีอยู่) ·
 *   ตรวจสองชั้น: รหัสก่อน query + เงื่อนไขของห้องใน query เดียวกัน ◂
 */
export async function listMessages(ctx: ConvCtx, conversationId: string, take = 100) {
  const s = sightOf(ctx);
  if (!canSeeConversationId(s, conversationId)) return [];
  return tenantDb({ tenantId: ctx.tenantId }).aiMessage.findMany({
    where: { conversationId, conversation: visibleConversationWhere(s) },
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
  ctx: SendCtx,
  input: { conversationId?: string; text: string; imageUrls?: string[] },
  deps?: {
    provider?: AiProvider;
    source?: AiCreditSource;
    /**
     * (M3.10) แจ้งชื่อเครื่องมือทุกตัวที่ถูกเรียกในเทิร์นนี้ (ไม่รวม load_skill) — หน้าผู้ช่วยของโมดูลใช้แสดง
     * บรรทัด "เครื่องมือที่ใช้" ใต้คำตอบ · ไม่ส่ง = พฤติกรรมเดิมทุกประการ · callback ล้ม = ข้าม (ไม่พาแชทล้ม)
     */
    onToolCall?: (name: string) => void;
  },
): Promise<SendResult> {
  const text = input.text.trim();
  if (!text) return { ok: false, error: "empty" };
  // CRM C5.5-G1 ▸ ผู้กระทำต้องเป็นของร้านเดียวกับ ctx (กันประตูที่ประกอบ ctx ผิด) ◂
  if (!ctx.actor || ctx.actor.tenantId !== ctx.tenantId) throw new Error("AI actor does not belong to this tenant");

  // routing ชั้น 1: เลือกโมเดลตามเนื้อความ (env SHARK_AI_MODEL ตั้งไว้ = คืนตัวนั้นเสมอ)
  // → ชั้น 2: resolveProvider ตาม tier · provider ฉีดได้ (ข้อสอบ) ไม่งั้นเลือกจาก env
  const hasImages = (input.imageUrls?.length ?? 0) > 0;
  let routedModel = pickModel(text, hasImages);
  let provider = deps?.provider ?? resolveProvider(routedModel === FAST_MODEL ? "fast" : "smart");
  if (!provider) return { ok: false, error: "ai_disabled" };

  const db = tenantDb({ tenantId: ctx.tenantId });
  const now = new Date();

  // กระเป๋าเครดิต (prepaid) — เช็คก่อนแตะ provider เสมอ (ห้ามจ่ายเงินให้ผู้ให้บริการแล้วค่อยพบว่าเครดิตหมด)
  // เครดิตหมด = ตัด ไม่มีโควตาฟรีรีเซ็ตรายรอบอีกแล้ว (กติกาเจ้าของ 8 ส.ค.)
  if (!(await canSpend(ctx.tenantId))) {
    return { ok: false, error: "over_budget", scope: "credit" };
  }

  // เพดานรายวันเดิม = ตาข่ายชั้นนอก (กันยอดรวมทั้งวันของร้าน — ยังคงไว้ ไม่ถอด)
  const day = dayKeyBangkok(now);
  const usage = await db.aiUsage.findFirst({ where: { day } });
  if (
    overBudget(
      { requests: usage?.requests ?? 0, tokensIn: usage?.tokensIn ?? 0, tokensOut: usage?.tokensOut ?? 0 },
      dailyLimits(),
    )
  ) {
    return { ok: false, error: "over_budget", scope: "day" };
  }

  // soft degrade: ใกล้เต็มโควตา → ลดชั้นเหลือ haiku ก่อน (ยังคุยได้) ค่อยตัดเมื่อครบเพดานจริง
  // ข้อยกเว้น: เจ้าของบังคับโมเดลเอง (SHARK_AI_MODEL) หรือมีรูปแนบ (งาน vision) = ไม่ลดชั้น
  const forcedModel = Boolean(process.env.SHARK_AI_MODEL?.trim());
  const lowBalance = (await balanceOf(ctx.tenantId)) < LOW_BALANCE_MICRO;
  if (lowBalance && !forcedModel && !hasImages && !deps?.provider) {
    const degraded = applyDegrade(routedModel, true);
    if (degraded !== routedModel) {
      const fallback = resolveProvider("fast");
      if (fallback) {
        routedModel = degraded;
        provider = fallback;
      }
    }
  }

  // persona ต้องรู้ชื่อกิจการ + ระบบที่เปิด + ความจำถาวรของร้าน + แนวทางที่ปรับปรุงระดับแพลตฟอร์ม
  // (พ่วง Promise.all เดิม ไม่เพิ่ม round-trip แยก · promptTweaks best-effort: query พลาด → "" ไม่ให้แชทพัง)
  const [tenant, systems, memories, promptTweaks] = await Promise.all([
    prisma.tenant.findUniqueOrThrow({ where: { id: ctx.tenantId } }),
    db.appSystem.findMany({ select: { type: true, name: true }, orderBy: { createdAt: "asc" } }),
    memoryBlock({ tenantId: ctx.tenantId, actor: ctx.actor }), // CRM C5.5-G3: the viewer's memories only (own + shop facts)
    approvedPromptTweaksText().catch(() => ""),
  ]);
  // สรุป DNA facts (ข้อมูลตอนสร้างกิจการ) — ฉีดเข้า persona ให้ AI เข้าใจธุรกิจตั้งแต่แรก (best-effort)
  const dnaSummary = await dnaFactsSummary(ctx.tenantId);

  // ── โหลดเครื่องมือแบบทยอย (progressive disclosure) ──
  // เดิมยัด tool ครบ 63 ตัวทุกคำขอ = 76,703 token = 94.5% ของบิล (วัดจริงบน prod)
  // ตอนนี้: แกนกลาง + load_skill เท่านั้น · AI สั่งโหลดชุดที่ต้องใช้เอง แล้วเครื่องมือจะโผล่ในรอบถัดไป
  const registry = toolRegistry();
  const defOf = (name: string) => registry.find((t) => t.def.name === name)?.def;
  // CRM C5.5-G1 ▸ ยื่นเฉพาะสิ่งที่ผู้กระทำใช้ได้: สกิลที่ไม่มีเครื่องมือให้ผู้กระทำนี้เลย = ไม่อยู่ในสารบัญ · แกนกลาง/สกิลที่โหลด
  //   = กรองรายเครื่องมือ (runTool ตรวจซ้ำทุกครั้งอยู่แล้ว — ชั้นนี้คือไม่ชวนโมเดลเรียกสิ่งที่จะโดนปฏิเสธ + ประหยัด token) ◂
  const offeredOf = (names: readonly string[]) => toolsOfferedTo(ctx.actor, names);
  const visibleSkills = skillsForTenant(systems.map((s) => s.type)).filter((s) => offeredOf(s.tools).length > 0);
  const loadedSkillIds = new Set<string>();
  const activeToolNames = new Set<string>(offeredOf(CORE_TOOLS));
  const currentTools = () => {
    const list = [...activeToolNames].map(defOf).filter((d): d is NonNullable<typeof d> => Boolean(d));
    // ยื่น load_skill ต่อเมื่อยังมีสกิลให้โหลด (โหลดครบแล้วยื่นต่อ = ชวนให้ AI เรียกวนเปล่า ๆ)
    if (visibleSkills.some((s) => !loadedSkillIds.has(s.id))) {
      list.push(LOAD_SKILL_TOOL(visibleSkills.filter((s) => !loadedSkillIds.has(s.id)).map((s) => s.id)));
    }
    return list;
  };

  // บทสนทนา: ต่อของเดิมถ้าระบุ ไม่งั้นเปิดใหม่
  // CRM C5.5-G2 ▸ ต่อได้เฉพาะห้องที่ผู้กระทำเห็น (ของตัวเอง · เจ้าของร้าน + ห้องที่ไม่ได้สร้างโดยคนในร้าน) — ห้องของคนอื่น
  //   = เหมือนไม่มีอยู่ ⇒ เปิดห้องใหม่ของผู้กระทำ (รหัสฝังผู้สร้าง) · ประวัติที่ป้อนโมเดลกรองด้วยกติกาเดียวกันอีกชั้นใน query ◂
  const conv = input.conversationId ? await findVisibleConversation(ctx, input.conversationId) : null;
  const conversation =
    conv ??
    (await prisma.aiConversation.create({
      data: { id: newConversationId(ctx), tenantId: ctx.tenantId, title: titleFrom(text) },
    }));
  const sight = sightOf(ctx);
  if (!canSeeConversationId(sight, conversation.id)) throw new Error("AI conversation is not visible to this actor");

  const history = await db.aiMessage.findMany({
    where: { conversationId: conversation.id, conversation: visibleConversationWhere(sight) },
    orderBy: { createdAt: "desc" },
    take: HISTORY_TAKE,
  });

  const messages: AiChatMessage[] = [
    {
      role: "system",
      content: [
        buildSystemPrompt({ tenantName: tenant.name, dna: dnaSummary, systems, memories, promptTweaks }),
        skillIndexPrompt(visibleSkills),
      ].filter(Boolean).join("\n\n"),
    },
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
  let tokensIn = 0;
  let tokensOut = 0;
  let finalText = "";
  let clarify: Clarify | null = null;
  const usedTools: { name: string; args: unknown }[] = []; // เครื่องมือที่ถูกเรียกจริงในเทิร์นนี้ (dataset)

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    let reply;
    try {
      reply = await provider.chat(messages, { tools: currentTools() });
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
        // load_skill = เครื่องมือของชั้น service เอง ไม่ได้อยู่ในทะเบียน tool ธุรกิจ
        if (tc.name === "load_skill") {
          const want = Array.isArray((tc.args as { skills?: unknown })?.skills)
            ? ((tc.args as { skills: unknown[] }).skills.map(String))
            : [];
          const ok: string[] = [];
          for (const id of want) {
            const sk = skillById(id);
            if (!sk || !visibleSkills.some((v) => v.id === id)) continue;
            loadedSkillIds.add(id);
            ok.push(id);
          }
          for (const n of offeredOf(toolNamesOfSkills(ok))) activeToolNames.add(n);
          messages.push({
            role: "tool",
            toolCallId: tc.id,
            content: ok.length
              ? `Loaded skills: ${ok.join(", ")}. Their tools are now available — call them now.`
              : "No matching skill. Pick an id from the AVAILABLE SKILLS list.",
          });
          continue;
        }
        try {
          deps?.onToolCall?.(tc.name);
        } catch {
          // ผู้ฟังพัง = ไม่ใช่เรื่องของแชท
        }
        // ส่ง conversation.id เข้าไปด้วย — action tool ต้องใช้ผูก proposal กับบทสนทนา
        // CRM C5.5-G1 ▸ ผู้กระทำของเทิร์นนี้ไปกับทุกการเรียก (runTool ตรวจสิทธิ์ซ้ำ — ชื่อที่ไม่ได้ยื่นก็โดนปฏิเสธ) ◂
        const result = await runTool(
          { tenantId: ctx.tenantId, actor: ctx.actor, conversationId: conversation.id },
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

  // หักเงินจากกระเป๋าเครดิต (prepaid) — คนละ write กับ tx ข้างบนเพราะต้องอ่านยอดสดก่อนหัก
  // ล้ม = บันทึก OpsEvent แล้วไปต่อ (ห้ามให้คำตอบที่ผู้ใช้ได้แล้วหายไปเพราะบัญชีเครดิต)
  await chargeUsageSafe({ tenantId: ctx.tenantId }, {
    source: deps?.source ?? "CHAT",
    model: routedModel,
    tokensIn,
    tokensOut,
    conversationId: conversation.id,
  });

  // เก็บ dataset (ฐาน self-host) — best-effort เท่านั้น: ห้ามให้พังการตอบ · gate ด้วย env ภายใน
  try {
    await recordSample({ tenantId: ctx.tenantId }, {
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

// สรุปข้อเท็จจริง DNA เป็น bullet ไทยสั้น ๆ (best-effort — ไม่มี/parse ไม่ผ่าน = undefined)
export async function dnaFactsSummary(tenantId: string): Promise<string | undefined> {
  try {
    const { ZDnaFacts } = await import("@/lib/dna/schema");
    const profile = await prisma.dnaProfile.findFirst({ where: { tenantId }, orderBy: { createdAt: "desc" } });
    if (!profile) return undefined;
    const parsed = ZDnaFacts.safeParse(profile.facts);
    if (!parsed.success) return undefined;
    const f = parsed.data;
    const hintTh: Record<string, string> = { SALON: "ร้านเสริมสวย/บริการ", RESTAURANT: "ร้านอาหาร", HOTEL: "ที่พัก/โรงแรม", CLINIC: "คลินิก", RETAIL: "ค้าปลีก", SERVICE: "งานบริการ", OTHER: "อื่น ๆ" };
    const b: string[] = [
      `- ประเภทธุรกิจ: ${hintTh[f.industryHint] ?? f.industryHint} · สาขา ${f.branchCount} แห่ง · พนักงาน ~${f.staffCount} คน`,
      `- ${f.vatRegistered ? "จดทะเบียน VAT" : "ไม่ได้จด VAT"} · ${f.wantsAccounting ? "ใช้ระบบบัญชี" : "ไม่เน้นบัญชี"}${f.usesLineOA ? " · ใช้ LINE OA คุยลูกค้า" : ""}`,
    ];
    const traits: string[] = [];
    if (f.appointment) traits.push("รับนัดหมาย/จองคิวล่วงหน้า");
    if (f.walkinQueue) traits.push("มีคิวหน้าร้าน");
    if (f.tables) traits.push("มีโต๊ะนั่ง");
    if (f.rooms) traits.push("มีห้องพัก");
    if (f.sellsGoods) traits.push("ขายสินค้าหน้าร้าน");
    if (f.membership) traits.push(f.rewardRedeem ? "มีสมาชิก+แลกแต้ม" : "มีระบบสมาชิก");
    if (traits.length) b.push(`- ลักษณะงาน: ${traits.join(" · ")}`);
    return b.join("\n");
  } catch {
    return undefined;
  }
}
