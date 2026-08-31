// ai-suggest.ts — AI แนะนำคำตอบให้ทีมงาน (WO-CW3 §5.3/§5.4 · คำสั่งข้อ 8 + 9 ของเจ้าของ)
//
// 🔴 กติกาที่ห้ามรื้อ (ทุกข้อเคยเป็นความเสียหายจริงที่ไหนสักแห่งมาแล้ว)
//  1. **เป็นข้อเสนอเท่านั้น ห้ามส่งเอง** — ฟังก์ชันนี้ไม่เขียน ChatMessage ทิศ OUT และไม่ยิงออก
//     ช่องทางใด ๆ ทั้งสิ้น · คนกดใส่กล่องพิมพ์ แก้ แล้วกดส่งเอง
//  2. **ห้ามแต่งข้อมูล** — prompt สั่งชัดว่าอะไรไม่รู้ให้บอกว่าไม่รู้ ห้ามเดาราคา/วันที่/ที่ว่าง
//     และตัวเลือกที่ไม่มีที่มา (`sourcesUsed` ว่าง) ต้องติดธง `warn` ให้ UI ขึ้นป้ายเตือน
//     ([[feedback_no_fabricated_trip_data]])
//  3. **ห้ามสัญญาว่า "จะติดต่อกลับ"** ([[feedback_no_callback_promise]]) — ร้านไม่มีคิวงานที่รับประกันได้
//  4. **บริบททุกชิ้นผูก tenantId + systemId** — ข้อมูลของร้านอื่นห้ามไหลเข้า prompt แม้แต่คำเดียว
//  5. **เครดิตหมด = ไม่ยิง LLM เลย** และบอกตรง ๆ เป็นภาษาไทย (ไม่ใช่ปุ่มที่กดแล้วเงียบ)
//  6. **fail-soft** — AI พังต้องไม่ทำให้ทีมตอบลูกค้าไม่ได้ (กฎเหล็กข้อ 4)
//  7. **network อยู่นอกทรานแซกชัน** (กฎเหล็กข้อ 5)
//  8. หักเครดิตด้วย `CHAT_SUGGEST` ไม่ใช่ `CHAT` (คนละกระเป๋าความหมาย — ดู ai_credit.prisma)
//  9. 🔴 H6: `ChatAiSuggestion.outcome` เป็น `String` ไม่ใช่ enum ⇒ **ไม่มีด่านที่ระดับ DB**
//     ค่าที่ใช้ได้ต้องคุมในโค้ด (union + ตรวจก่อนเขียนทุกครั้ง) ไม่งั้นสถิติจะเน่าแบบเงียบ ๆ
// 10. 🔴 H3: ตารางใหม่ **ไม่มี FK** ⇒ conversationId / sourceMessageId ต้องถูกตรวจว่ามีจริง
//     และเป็นของ tenant/system นั้นก่อนเขียนเสมอ

import type { ChatChannelType, Prisma } from "@prisma/client";
import { tenantDb } from "@/lib/core/db";
import { resolveProvider, SMART_MODEL } from "@/lib/ai/provider";
import { canSpend, chargeUsageSafe, outOfCreditMessage } from "@/lib/ai/credit";
import { readBusinessHours } from "./business-hours";
import { searchAnswerExamples, saveAnswerExampleFromSuggestion, searchTerms } from "./learning";
import { getLinkedMember } from "./service";

// ───────────────────────── ค่าคงที่ของรอบนี้ ─────────────────────────

/** เสนอได้สูงสุด 3 ตัวเลือก — มากกว่านี้ทีมอ่านไม่ทันและค่า token พุ่งโดยไม่ได้ประโยชน์ */
const MAX_OPTIONS = 3;
/** ข้อความล่าสุดของเธรดที่ใส่เข้า prompt (§5.3 ข้อ 1) */
const THREAD_WINDOW = 10;
const MAX_KB = 4;
const MAX_EXAMPLES = 4;

/**
 * 🔴 H6 — ค่า outcome ที่ระบบยอมรับ ประกาศ **ที่เดียว**
 * DB เป็น String เปล่า ๆ ⇒ ถ้าไม่คุมที่นี่ วันหนึ่งจะมี "sent"/"SENT"/"used" ปนกันในตารางเดียว
 * แล้วรายงาน "AI ช่วยได้จริงไหม" จะนับผิดโดยไม่มีใครรู้
 */
export const SUGGESTION_OUTCOMES = ["PENDING", "IGNORED", "SENT_AS_IS", "SENT_EDITED"] as const;
export type SuggestionOutcome = (typeof SUGGESTION_OUTCOMES)[number];

export function isSuggestionOutcome(v: unknown): v is SuggestionOutcome {
  return typeof v === "string" && (SUGGESTION_OUTCOMES as readonly string[]).includes(v);
}

/** เส้นแบ่ง "ส่งตามที่เสนอ" กับ "แก้แล้วค่อยส่ง" (§5.4) */
export const SENT_AS_IS_THRESHOLD = 95;

export type SuggestOption = { id: string; body: string; sources: string[]; warn: boolean };
export type SuggestResult =
  | { ok: true; options: SuggestOption[]; sourceMessageId: string }
  | { ok: false; reason: string };

const db = (tenantId: string, systemId: string) => tenantDb({ tenantId, systemId });

// ───────────────────────── ความเหมือนของข้อความ ─────────────────────────

function normalizeForCompare(s: string): string {
  return String(s ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * ความเหมือน 0..100 — Sørensen–Dice บน bigram ของตัวอักษร
 *
 * ทำไมไม่ใช้ Levenshtein: ข้อความไทยไม่มีเว้นวรรคระหว่างคำ และทีมมักแก้แบบ "เติมประโยค"
 * ระยะแก้ไขจะลงโทษการเติมข้อความยาว ๆ เกินจริง · Dice วัด "เนื้อหาทับกันแค่ไหน" ซึ่งตรงกับ
 * คำถามที่เราอยากตอบ: ทีมใช้ของ AI เท่าไหร่ ไม่ใช่ต้องกดแก้กี่ครั้ง
 */
export function similarityPercent(a: string, b: string): number {
  const x = normalizeForCompare(a);
  const y = normalizeForCompare(b);
  if (!x && !y) return 100;
  if (!x || !y) return 0;
  if (x === y) return 100;
  if (x.length < 2 || y.length < 2) return x === y ? 100 : 0;

  const grams = new Map<string, number>();
  for (let i = 0; i < x.length - 1; i++) {
    const g = x.slice(i, i + 2);
    grams.set(g, (grams.get(g) ?? 0) + 1);
  }
  let hits = 0;
  for (let i = 0; i < y.length - 1; i++) {
    const g = y.slice(i, i + 2);
    const n = grams.get(g) ?? 0;
    if (n > 0) {
      hits += 1;
      grams.set(g, n - 1);
    }
  }
  const pct = Math.round((2 * hits * 100) / (x.length - 1 + (y.length - 1)));
  // ต่างกันจริงต้องไม่ปัดขึ้นไปแตะ 100 (ไม่งั้น SENT_EDITED กลายเป็น SENT_AS_IS)
  return Math.min(99, Math.max(0, pct));
}

// ───────────────────────── ประกอบบริบท (§5.3 ข้อ 1–6) ─────────────────────────

type Ctx = {
  promptContext: string;
  sourceIds: Set<string>;
  kbCount: number;
  exampleCount: number;
};

function trim(s: string, n: number): string {
  const t = String(s ?? "").replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n)}…` : t;
}

/**
 * 🔴 คลังความรู้ (§5.3 ข้อ 3) — query ตรงแทนการเรียก `kb.searchKb`
 *
 * เหตุผล 2 ข้อ: (1) `chat → kb` ไม่ใช่เส้นที่อนุมัติใน fitness F2 (allowlist ข้ามโมดูล)
 * (2) ที่สำคัญกว่า — ที่นี่เขียน `tenantId` ลงใน `where` ตรง ๆ ทำให้ขอบเขตอ่านออกจากโค้ด
 * ไม่ใช่ซ่อนอยู่ใน extension ของ tenantDb อย่างเดียว (ข้อมูลข้ามร้านหลุดเข้า prompt = ครั้งเดียวก็สาย)
 */
async function loadKb(tenantId: string, systemId: string, query: string) {
  const ts = searchTerms(query);
  if (ts.length === 0) return [];
  const rows = await db(tenantId, systemId).kbArticle.findMany({
    where: {
      tenantId,
      active: true,
      OR: ts.flatMap((t) => [
        { title: { contains: t, mode: "insensitive" as const } },
        { body: { contains: t, mode: "insensitive" as const } },
      ]),
    },
    orderBy: [{ updatedAt: "desc" }],
    take: MAX_KB * 5,
  });
  const scored = rows
    .map((r) => {
      const tl = r.title.toLowerCase();
      const bl = r.body.toLowerCase();
      let score = 0;
      for (const t of ts) {
        const tt = t.toLowerCase();
        if (tl.includes(tt)) score += 3;
        else if (bl.includes(tt)) score += 1;
      }
      return { r, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_KB);
  return scored.map((x) => x.r);
}

/**
 * ประกอบบริบททั้ง 6 แหล่งของ §5.3 เป็นข้อความเดียวที่จะไปอยู่ใน **user message**
 * (ไม่ใช่ system — system เก็บไว้ให้คำสั่งภาษาอังกฤษล้วนเพื่อคุม token · ดู §5.2)
 */
async function buildContext(args: {
  tenantId: string;
  systemId: string;
  conversationId: string;
  channel: ChatChannelType;
  contact: { displayName: string | null; lang: string | null; customerId: string | null };
  messages: { direction: string; body: string | null; isInternal: boolean; createdAt: Date }[];
  question: string;
  setting: { senderAlias: string | null; staffLang: string; businessHours: unknown };
}): Promise<Ctx> {
  const { tenantId, systemId } = args;
  const sourceIds = new Set<string>();
  const parts: string[] = [];

  // (6) ร้าน + ระบบที่ร้านเปิดใช้ — ให้ AI รู้ว่าตัวเองพูดในนามใคร และร้านทำอะไรได้บ้าง
  const systems = await db(tenantId, systemId).appSystem.findMany({
    where: { tenantId, active: true },
    select: { type: true, name: true },
    take: 30,
  });
  parts.push(
    `# ร้าน\nชื่อที่ใช้ตอบลูกค้า: ${args.setting.senderAlias ?? "ทีมงาน"}\n` +
      `ระบบที่ร้านเปิดใช้: ${systems.map((s) => `${s.name} (${s.type})`).join(", ") || "ไม่ระบุ"}\n` +
      `ช่องทางของบทสนทนานี้: ${args.channel}`,
  );

  // (5) เวลาทำการ — คำตอบที่บอกเวลาผิดคือคำตอบที่ทำให้ลูกค้ามาเก้อ
  const bh = readBusinessHours(args.setting.businessHours);
  if (bh) {
    parts.push(
      `# เวลาทำการของทีมตอบแชท (${bh.tz})\n` +
        bh.days.map((d) => `วัน ${d.d}: ${d.open}-${d.close}`).join(" · ") +
        (bh.holidays.length ? `\nวันหยุด: ${bh.holidays.join(", ")}` : ""),
    );
  }

  // (4) โปรไฟล์สมาชิกที่ผูกไว้ — มีเฉพาะเมื่อ contact ถูกผูกกับระบบสมาชิกแล้ว
  if (args.contact.customerId) {
    const m = await getLinkedMember(tenantId, args.contact.customerId).catch(() => null);
    if (m) {
      parts.push(
        `# ลูกค้าคนนี้เป็นสมาชิกของร้าน\nชื่อ: ${m.name ?? "-"} · เบอร์: ${m.phone ?? "-"}`,
      );
    }
  }

  // (3) คลังความรู้ของร้าน
  const kb = await loadKb(tenantId, systemId, args.question);
  if (kb.length > 0) {
    for (const a of kb) sourceIds.add(`kb:${a.id}`);
    parts.push(
      `# คลังความรู้ของร้าน (อ้างอิงได้)\n` +
        kb.map((a) => `[kb:${a.id}] ${a.title}\n${trim(a.body, 700)}`).join("\n\n"),
    );
  }

  // (2) คลังตัวอย่างคำตอบที่ทีมเคยใช้จริง — นี่คือสิ่งที่ทำให้แม่นขึ้นตามการใช้งาน (§5.4)
  const examples = await searchAnswerExamples({
    tenantId,
    systemId,
    query: args.question,
    take: MAX_EXAMPLES,
  });
  if (examples.length > 0) {
    for (const e of examples) sourceIds.add(`example:${e.id}`);
    parts.push(
      `# คำตอบที่ทีมเคยใช้จริงกับคำถามคล้ายกัน (น้ำเสียงและข้อเท็จจริงให้ยึดตามนี้)\n` +
        examples
          .map((e) => `[example:${e.id}] ถาม: ${trim(e.question, 240)}\nตอบ: ${trim(e.answer, 500)}`)
          .join("\n\n"),
    );
  }

  // (1) ข้อความล่าสุดของเธรด — โน้ตภายในใส่ได้ (ทีมเขียนไว้ให้ทีมอ่าน) แต่ต้องกำกับให้ชัด
  parts.push(
    `# บทสนทนาล่าสุด (เก่า → ใหม่)\n` +
      args.messages
        .map((m) => {
          const who = m.isInternal ? "โน้ตภายใน" : m.direction === "IN" ? "ลูกค้า" : "ทีมงาน";
          return `${who}: ${trim(m.body ?? "", 700)}`;
        })
        .join("\n"),
  );

  parts.push(`# ข้อความล่าสุดของลูกค้าที่ต้องตอบ\n${args.question}`);

  return {
    promptContext: parts.join("\n\n"),
    sourceIds,
    kbCount: kb.length,
    exampleCount: examples.length,
  };
}

/**
 * คำสั่งของโมเดล — **ภาษาอังกฤษล้วน** ([[reference_llm_thai_token_cost]])
 * เนื้อความบริบทเป็นภาษาไทยได้ (นั่นคือข้อมูล) แต่ "กฎ" ที่ซ้ำทุกครั้งต้องถูก เพราะถูก cache ด้วย
 */
function systemPrompt(replyLang: string): string {
  return [
    "You draft reply options for a human support agent of a small business in Thailand.",
    `Write the replies in the customer's language (${replyLang}).`,
    "You are NOT talking to the customer. A human reads your options, edits them, and decides whether to send.",
    "",
    "HARD RULES:",
    "1. Use ONLY facts present in the context block. Do not make up prices, dates, availability, addresses, promotions or policies.",
    "2. If the context does not contain the answer, say plainly that you need to check with the team, and ask the customer for the detail you are missing.",
    "3. Never promise that someone will call back, contact you back, or get back to you at a specific time — the shop has no queue that guarantees it.",
    "4. Never invent a discount, a booking, or a confirmation.",
    "5. Keep each option short and ready to send (1-4 sentences), polite, and in the shop's voice.",
    "",
    "For every option, list the context ids you actually used (for example kb:abc123 or example:xyz789).",
    "If an option uses no context id, return an empty sources array — do not fabricate an id.",
    "",
    "Answer with JSON only, in this exact shape:",
    '{"options":[{"body":"...","sources":["kb:..."]}]}',
    `Return at most ${MAX_OPTIONS} options, best first.`,
  ].join("\n");
}

type ParsedOption = { body: string; sources: string[] };

/** อ่านคำตอบของโมเดล — ตอบไม่เป็น JSON ก็ต้องยังใช้งานได้ (1 ตัวเลือกไม่มีที่มา + ติดธงเตือน) */
function parseOptions(raw: string): ParsedOption[] {
  const text = String(raw ?? "").trim();
  if (!text) return [];
  const jsonText = text.startsWith("```")
    ? text.replace(/^```[a-z]*\s*/i, "").replace(/```\s*$/, "").trim()
    : text;
  try {
    const o = JSON.parse(jsonText) as { options?: unknown };
    const list = Array.isArray(o.options) ? o.options : Array.isArray(o) ? (o as unknown[]) : [];
    const out: ParsedOption[] = [];
    for (const it of list) {
      if (!it || typeof it !== "object") continue;
      const r = it as { body?: unknown; text?: unknown; sources?: unknown };
      const body = typeof r.body === "string" ? r.body : typeof r.text === "string" ? r.text : "";
      if (!body.trim()) continue;
      const sources = Array.isArray(r.sources)
        ? r.sources.filter((s): s is string => typeof s === "string")
        : [];
      out.push({ body: body.trim(), sources });
    }
    if (out.length > 0) return out;
  } catch {
    // ไม่ใช่ JSON — ตกไปใช้ข้อความดิบเป็นตัวเลือกเดียว (ดีกว่าคืน "ไม่มีคำแนะนำ" ทั้งที่จ่ายเงินไปแล้ว)
  }
  return [{ body: text, sources: [] }];
}

// ───────────────────────── แนะนำคำตอบ ─────────────────────────

export async function suggestReply(args: {
  tenantId: string;
  systemId: string;
  conversationId: string;
  userId: string;
}): Promise<SuggestResult> {
  const { tenantId, systemId, userId } = args;
  const d = db(tenantId, systemId);

  const setting = await d.chatSetting.findFirst({ where: { tenantId, systemId } });
  if (!setting) return { ok: false, reason: "ไม่พบการตั้งค่าของระบบแชทนี้" };
  if (!setting.aiSuggestEnabled) {
    return {
      ok: false,
      reason: "ร้านยังไม่ได้เปิดใช้ AI แนะนำคำตอบ — เปิดได้ที่ เชื่อมช่องทาง → การแปลและ AI",
    };
  }

  // H3: ตรวจว่าเธรดเป็นของร้าน/ระบบนี้จริง ก่อนแตะข้อมูลอะไรทั้งสิ้น
  const conv = await d.chatConversation.findFirst({
    where: { id: (args.conversationId ?? "").trim(), tenantId, systemId },
    include: { contact: true },
  });
  if (!conv) return { ok: false, reason: "ไม่พบบทสนทนานี้ในร้านของคุณ" };

  const recent = await d.chatMessage.findMany({
    where: { tenantId, systemId, conversationId: conv.id },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: THREAD_WINDOW,
  });
  const messages = [...recent].reverse();
  const lastIn = [...messages].reverse().find((m) => m.direction === "IN" && !m.isInternal);
  const question = (lastIn?.body ?? "").trim();
  if (!lastIn || !question) {
    return { ok: false, reason: "ยังไม่มีข้อความจากลูกค้าให้ตั้งต้น — AI แนะนำคำตอบไม่ได้" };
  }

  // 🔴 ด่านเงินมาก่อนการยิง LLM เสมอ (ยิงก่อนแล้วจ่ายไม่ได้ = จ่ายฟรีให้ผู้ให้บริการ)
  if (!(await canSpend(tenantId))) return { ok: false, reason: outOfCreditMessage() };

  const ctx = await buildContext({
    tenantId,
    systemId,
    conversationId: conv.id,
    channel: conv.channel,
    contact: conv.contact,
    messages,
    question,
    setting: {
      senderAlias: setting.senderAlias,
      staffLang: setting.staffLang,
      businessHours: setting.businessHours,
    },
  });

  // SMART_MODEL: ประกอบคำตอบจากหลายแหล่งพร้อมกัน ไม่ใช่งานเบา
  const provider = resolveProvider("smart");
  if (!provider) {
    return { ok: false, reason: "ระบบ AI ยังไม่พร้อมใช้งาน — ผู้ดูแลระบบยังไม่ได้ตั้งค่าผู้ให้บริการ AI" };
  }

  const replyLang = conv.contact.lang?.trim() || setting.staffLang || "th";
  let reply;
  try {
    // 🔴 นอกทรานแซกชันเสมอ
    reply = await provider.chat(
      [
        { role: "system", content: systemPrompt(replyLang) },
        { role: "user", content: ctx.promptContext },
      ],
      { maxTokens: 1200 },
    );
  } catch {
    return { ok: false, reason: "ขอคำแนะนำจาก AI ไม่สำเร็จ — ระบบ AI ขัดข้องชั่วคราว กรุณาลองใหม่อีกครั้ง" };
  }

  const parsed = parseOptions(reply.text).slice(0, MAX_OPTIONS);
  if (parsed.length === 0) {
    return { ok: false, reason: "AI ยังไม่มีคำแนะนำสำหรับข้อความนี้ — ลองอีกครั้งหรือพิมพ์ตอบเอง" };
  }

  const costMicro = await chargeUsageSafe(
    { tenantId },
    {
      source: "CHAT_SUGGEST",
      model: reply.model,
      tokensIn: reply.tokensIn,
      tokensOut: reply.tokensOut,
      conversationId: conv.id,
      userId,
      note: "AI แนะนำคำตอบในกล่องแชทลูกค้า",
    },
  );

  // แบ่งค่าใช้จ่ายลงทุกตัวเลือก — เจ้าของต้องเห็นว่าปุ่มนี้กินเงินเท่าไหร่ ไม่ใช่ 0 ทุกแถว
  const per = Math.floor(costMicro / parsed.length);
  const remainder = costMicro - per * parsed.length;

  const options: SuggestOption[] = [];
  for (let i = 0; i < parsed.length; i++) {
    const p = parsed[i]!;
    // 🔴 ยอมรับเฉพาะที่มาที่เรา "ยื่นให้จริง" — โมเดลแต่ง id ขึ้นมาเองไม่ได้
    //    (ที่มาปลอม = ป้าย "อ้างอิงได้" บนคำตอบที่ไม่มีอะไรรองรับ = อันตรายกว่าไม่มีป้ายเลย)
    const sources = [...new Set(p.sources.map((s) => s.trim()))].filter((s) => ctx.sourceIds.has(s));
    const row = await d.chatAiSuggestion.create({
      data: {
        tenantId,
        systemId,
        conversationId: conv.id,
        sourceMessageId: lastIn.id,
        suggestedBody: p.body,
        rank: i,
        model: reply.model || SMART_MODEL,
        costMicro: per + (i === 0 ? remainder : 0),
        sourcesUsed: sources as unknown as Prisma.InputJsonValue,
        outcome: "PENDING" satisfies SuggestionOutcome,
        createdByUserId: userId,
      },
    });
    options.push({ id: row.id, body: p.body, sources, warn: sources.length === 0 });
  }

  return { ok: true, options, sourceMessageId: lastIn.id };
}

// ───────────────────────── บันทึกผลลัพธ์ (§5.4 เส้นทางที่ 1 และ 3) ─────────────────────────

export type OutcomeResult = {
  ok: boolean;
  outcome?: SuggestionOutcome;
  similarity?: number;
  exampleId?: string;
  reason?: string;
};

/**
 * ทีมตัดสินใจกับคำแนะนำแล้ว — ส่งจริง (ตามที่เสนอ / แก้แล้วส่ง) หรือกดข้าม
 *
 * 🔴 ความจริงคือ **ข้อความที่ส่งจริง** ไม่ใช่ที่ AI เสนอ ⇒ `ChatAnswerExample.answer = sentBody`
 * 🔴 `IGNORED` ไม่เข้าคลัง — สัญญาณลบห้ามกลายเป็นตัวอย่างให้เรียนรู้
 */
export async function recordSuggestionOutcome(args: {
  tenantId: string;
  systemId: string;
  suggestionId: string;
  sentMessageId?: string | null;
  sentBody?: string | null;
  outcome?: string | null;
  userId?: string;
}): Promise<OutcomeResult> {
  const { tenantId, systemId } = args;
  const d = db(tenantId, systemId);

  // H3: ไม่มี FK → ตรวจเองว่าคำแนะนำนี้เป็นของร้าน/ระบบนี้ (เดา id ถูกก็แก้ของคนอื่นไม่ได้)
  const sug = await d.chatAiSuggestion.findFirst({
    where: { id: (args.suggestionId ?? "").trim(), tenantId, systemId },
  });
  if (!sug) return { ok: false, reason: "ไม่พบคำแนะนำนี้ในร้านของคุณ" };
  if (sug.outcome !== "PENDING") {
    // ตัดสินไปแล้ว = ไม่ทับ (กดสองครั้ง/ยิงซ้ำ ต้องไม่ทำให้สถิติเพี้ยนและไม่สร้างตัวอย่างซ้ำ)
    return { ok: true, outcome: sug.outcome as SuggestionOutcome, similarity: sug.similarity ?? undefined };
  }

  const sentBody = (args.sentBody ?? "").trim();
  const explicit = args.outcome ?? null;

  // ── กดข้าม ──
  if (explicit === "IGNORED" || (!sentBody && explicit !== null)) {
    if (explicit !== "IGNORED") return { ok: false, reason: "ค่าผลลัพธ์ของคำแนะนำไม่ถูกต้อง" };
    await d.chatAiSuggestion.updateMany({
      where: { id: sug.id, tenantId, systemId },
      data: { outcome: "IGNORED" satisfies SuggestionOutcome },
    });
    return { ok: true, outcome: "IGNORED" };
  }
  if (!sentBody) return { ok: false, reason: "ไม่ได้ระบุข้อความที่ส่งจริง" };
  // H6: ถ้าผู้เรียกส่ง outcome มาด้วย ต้องเป็นค่าที่ระบบรู้จักเท่านั้น
  if (explicit !== null && !isSuggestionOutcome(explicit)) {
    return { ok: false, reason: "ค่าผลลัพธ์ของคำแนะนำไม่ถูกต้อง" };
  }

  const similarity = similarityPercent(sug.suggestedBody, sentBody);
  const outcome: SuggestionOutcome =
    similarity >= SENT_AS_IS_THRESHOLD ? "SENT_AS_IS" : "SENT_EDITED";

  await d.chatAiSuggestion.updateMany({
    where: { id: sug.id, tenantId, systemId },
    data: {
      outcome,
      similarity,
      sentMessageId: args.sentMessageId ?? null,
    },
  });

  // ── เข้าคลังเรียนรู้ (เส้นทางที่ 1) ──
  // H3: อ่านคำถามต้นทาง + เธรด จาก DB จริงเสมอ ห้ามเชื่อค่าที่ผู้เรียกส่งมา
  const src = await d.chatMessage.findFirst({
    where: { id: sug.sourceMessageId, tenantId, systemId },
  });
  const conv = await d.chatConversation.findFirst({
    where: { id: sug.conversationId, tenantId, systemId },
    include: { contact: true },
  });
  const question = (src?.body ?? "").trim();
  if (!src || !conv || !question) {
    // ผลลัพธ์ถูกบันทึกไปแล้ว (สถิติต้องตรง) แค่ไม่มีข้อมูลพอจะเก็บเป็นตัวอย่าง
    return { ok: true, outcome, similarity };
  }

  const saved = await saveAnswerExampleFromSuggestion({
    tenantId,
    systemId,
    question,
    answer: sentBody, // 🔴 ของมนุษย์คือความจริง — ไม่ใช่ sug.suggestedBody
    channel: conv.channel,
    lang: conv.contact.lang ?? null,
    sourceMessageId: args.sentMessageId ?? null,
    fromSuggestionId: sug.id,
    userId: args.userId ?? sug.createdByUserId,
  });

  return { ok: true, outcome, similarity, ...(saved.exampleId ? { exampleId: saved.exampleId } : {}) };
}

/** ทีมกดข้ามคำแนะนำทั้งชุดของข้อความนั้น (เส้นทางที่ 3) */
export async function ignoreSuggestions(args: {
  tenantId: string;
  systemId: string;
  conversationId: string;
  sourceMessageId: string;
}): Promise<{ ok: boolean; count: number }> {
  const { tenantId, systemId } = args;
  const res = await db(tenantId, systemId).chatAiSuggestion.updateMany({
    where: {
      tenantId,
      systemId,
      conversationId: args.conversationId,
      sourceMessageId: args.sourceMessageId,
      outcome: "PENDING",
    },
    data: { outcome: "IGNORED" satisfies SuggestionOutcome },
  });
  return { ok: true, count: res.count };
}
