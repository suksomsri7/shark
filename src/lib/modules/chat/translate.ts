// translate.ts — แปลข้อความในกล่องแชทลูกค้า (WO-CW3 §5.2 · มติ W3 = "กดแปล" ไม่ใช่อัตโนมัติ)
//
// ทำไมไม่แปลอัตโนมัติ: 1 ข้อความ ≈ $0.008 · inbox ที่มีข้อความวันละพันข้อความ = ค่าใช้จ่ายที่
// เจ้าของไม่ได้สั่งและมองไม่เห็น ⇒ เจ้าของเคาะว่า "กดเมื่อต้องการ" (มติ W3 · ห้ามรื้อโดยไม่คุย)
//
// 🔴 กติกาที่ห้ามรื้อ
//  1. **ต้นฉบับห้ามถูกทับ** — คำแปลไปอยู่ `translatedBody` คนละช่องกับ `body`
//     คำแปลผิดได้เสมอ ทีมต้องย้อนดูสิ่งที่ลูกค้าพิมพ์จริงได้ตลอด
//  2. **แปลซ้ำภาษาเดิม = คืนของเก่า ไม่จ่ายซ้ำ** (กดปุ่มรัว/รีเฟรชหน้า ต้องไม่กลายเป็นบิล)
//  3. **เครดิตหมด = ไม่ยิง LLM เลย** — ยิงก่อนแล้วค่อยพบว่าจ่ายไม่ได้ = จ่ายฟรีให้ผู้ให้บริการ
//  4. **fail-soft ทุกทาง** — provider ล่ม/ไม่มีคีย์/เครดิตหมด คืน { ok:false, reason:ไทย }
//     ห้าม throw ขึ้นไปถึงฟอร์มส่งข้อความ (กฎเหล็กข้อ 4: แปลพังต้องไม่ทำให้ตอบแชทไม่ได้)
//  5. **network call อยู่นอกทรานแซกชัน** เสมอ (กฎเหล็กข้อ 5 — pool ของ Neon)
//  6. **คำสั่งใน prompt เป็นภาษาอังกฤษ** — ไทยกิน token ~4 เท่า ([[reference_llm_thai_token_cost]])
//     เนื้อความที่จะแปลเป็นภาษาอะไรก็ได้ (นั่นคือข้อมูล ไม่ใช่คำสั่ง)
//  7. หักเครดิตด้วย `CHAT_TRANSLATE` **ไม่ใช่ `CHAT`** — `CHAT` คือผู้ช่วย AI ส่วนตัวของเจ้าของ
//     ปนกันเมื่อไหร่เจ้าของแยกบิลไม่ออกว่าเงินหมดไปกับอะไร แล้วจะไปปิดผิดตัว

import { tenantDb } from "@/lib/core/db";
import { resolveProvider } from "@/lib/ai/provider";
import { canSpend, chargeUsageSafe, outOfCreditMessage } from "@/lib/ai/credit";

export type TranslateResult =
  | { ok: true; text: string; cached: boolean; detectedLang?: string }
  | { ok: false; reason: string };

/** ชื่อภาษาเป็นภาษาอังกฤษ — ใช้ในคำสั่งของโมเดล (โมเดลเข้าใจชื่อเต็มดีกว่ารหัส 2 ตัวอักษร) */
const LANG_NAME: Record<string, string> = {
  th: "Thai",
  en: "English",
  cn: "Simplified Chinese",
  zh: "Simplified Chinese",
  ja: "Japanese",
  ko: "Korean",
  de: "German",
  fr: "French",
  ru: "Russian",
  es: "Spanish",
  it: "Italian",
  vi: "Vietnamese",
  id: "Indonesian",
  ms: "Malay",
  my: "Burmese",
  km: "Khmer",
  ar: "Arabic",
  he: "Hebrew",
  pt: "Portuguese",
  nl: "Dutch",
};

/** ชื่อภาษาไทยไว้ขึ้นข้อความบอกผู้ใช้ (error ต้องเป็นภาษาไทยเสมอ) */
const LANG_TH: Record<string, string> = {
  th: "ไทย",
  en: "อังกฤษ",
  cn: "จีน",
  zh: "จีน",
  ja: "ญี่ปุ่น",
  ko: "เกาหลี",
  de: "เยอรมัน",
  fr: "ฝรั่งเศส",
  ru: "รัสเซีย",
};

/** ความยาวสูงสุดที่ยอมแปลต่อครั้ง — เท่ากับเพดานข้อความของระบบ */
const MAX_TRANSLATE_CHARS = 4000;

export function normalizeLang(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim().toLowerCase().split(/[-_]/)[0];
  if (!v || v.length < 2 || v.length > 8) return null;
  return v;
}

export function langLabelTh(code: string): string {
  return LANG_TH[code] ?? code.toUpperCase();
}

/**
 * เดาภาษาต้นทางจากชุดตัวอักษร — **ตั้งใจไม่ใช้ LLM**
 *
 * เหตุผล: ใช้แค่ตัดสินว่า "ควรขึ้นปุ่มแปลไหม" กับ "แปลเป็นอะไร" — ความแม่นระดับตระกูลอักษรพอแล้ว
 * ยิง LLM เพื่อตรวจภาษา = จ่ายเงินสองรอบต่อข้อความเดียว โดยที่คำตอบไม่ได้ดีขึ้นในทางที่มีผลกับผู้ใช้
 * (ภาษาที่ใช้อักษรละตินเหมือนกันแยกไม่ออก → คืน "en" ซึ่งเป็นค่าที่ปลอดภัยที่สุดสำหรับ inbox ไทย)
 */
export function detectLang(text: string): string {
  const t = String(text ?? "");
  if (/[฀-๿]/.test(t)) return "th";
  if (/[가-힯ᄀ-ᇿ]/.test(t)) return "ko";
  if (/[぀-ヿ]/.test(t)) return "ja";
  if (/[一-鿿]/.test(t)) return "cn";
  if (/[Ѐ-ӿ]/.test(t)) return "ru";
  if (/[؀-ۿ]/.test(t)) return "ar";
  if (/[֐-׿]/.test(t)) return "he";
  return "en";
}

/**
 * คำสั่งของโมเดล — **ภาษาอังกฤษล้วน** และห้ามให้โมเดล "ตอบ" ข้อความ
 * (โมเดลที่ถูกป้อนข้อความลูกค้าโดยไม่กำกับ จะเผลอตอบแทนทีมงาน = ข้อความที่ไม่มีใครตรวจ)
 */
function systemPrompt(targetLang: string): string {
  const name = LANG_NAME[targetLang] ?? targetLang;
  return [
    `You are a translation engine inside a customer-support inbox. Translate the user message into ${name}.`,
    "Return ONLY the translated text. No preface, no quotes, no explanation, no notes.",
    "Never answer, summarise, or continue the message — translate it exactly as written.",
    "Keep numbers, prices, dates, product names, person names, URLs and emoji unchanged.",
    "Do not add facts that are not in the source text.",
    "If the text is already in the target language, return it unchanged.",
  ].join(" ");
}

/** ตัดของแถมที่โมเดลชอบใส่มา (โควต/คำอธิบาย) — เก็บเฉพาะเนื้อคำแปล */
function cleanTranslation(raw: string): string {
  let t = String(raw ?? "").trim();
  // บางโมเดลตอบเป็น JSON แม้จะสั่งไม่ให้ — รับไว้แทนที่จะโชว์ JSON ดิบให้ทีมอ่าน
  if (t.startsWith("{") && t.endsWith("}")) {
    try {
      const o = JSON.parse(t) as Record<string, unknown>;
      for (const k of ["translation", "translated", "text", "result"]) {
        if (typeof o[k] === "string" && (o[k] as string).trim()) return (o[k] as string).trim();
      }
    } catch {
      // ไม่ใช่ JSON จริง — ใช้ข้อความตามเดิม
    }
  }
  if (t.length > 1 && /^["“”'`]/.test(t) && /["“”'`]$/.test(t)) t = t.slice(1, -1).trim();
  return t;
}

type ProviderRun =
  | { ok: true; text: string; model: string; tokensIn: number; tokensOut: number }
  | { ok: false; reason: string };

/**
 * ยิง LLM 1 ครั้งเพื่อแปล — **นอกทรานแซกชันเสมอ** และไม่ throw ทุกกรณี
 * (ผู้เรียกต้องเช็คเครดิตมาก่อนแล้ว — ที่นี่ไม่ตัดสินใจเรื่องเงิน)
 */
async function runTranslate(text: string, targetLang: string): Promise<ProviderRun> {
  // FAST_MODEL: งานแปลข้อความสั้นไม่ต้องใช้โมเดลแพง (routing ชั้น 2 ของ ai/provider)
  const provider = resolveProvider("fast");
  if (!provider) {
    return { ok: false, reason: "ระบบแปลภาษายังไม่พร้อมใช้งาน — ผู้ดูแลระบบยังไม่ได้ตั้งค่าผู้ให้บริการ AI" };
  }
  try {
    const reply = await provider.chat(
      [
        { role: "system", content: systemPrompt(targetLang) },
        { role: "user", content: text },
      ],
      { maxTokens: 1024 },
    );
    const out = cleanTranslation(reply.text);
    if (!out) return { ok: false, reason: "แปลข้อความไม่สำเร็จ — ผู้ให้บริการ AI ตอบกลับมาว่าง กรุณาลองใหม่" };
    return { ok: true, text: out, model: reply.model, tokensIn: reply.tokensIn, tokensOut: reply.tokensOut };
  } catch {
    // 🔴 กลืนไว้ตรงนี้เสมอ — แปลพังต้องไม่ทำให้ทีมตอบลูกค้าไม่ได้ (กฎเหล็กข้อ 4)
    return { ok: false, reason: "แปลข้อความไม่สำเร็จ — ระบบแปลขัดข้องชั่วคราว กรุณาลองใหม่อีกครั้ง" };
  }
}

/** ตั้งค่าของระบบแชท + ด่านสวิตช์ "เปิดใช้การแปล" (ของที่กินเงินร้าน ต้องเปิดเอง) */
export async function guardTranslateEnabled(
  tenantId: string,
  systemId: string,
): Promise<{ ok: true; staffLang: string } | { ok: false; reason: string }> {
  const setting = await tenantDb({ tenantId, systemId }).chatSetting.findFirst({
    where: { tenantId, systemId },
  });
  if (!setting) return { ok: false, reason: "ไม่พบการตั้งค่าของระบบแชทนี้" };
  if (!setting.translateEnabled) {
    return {
      ok: false,
      reason: "ร้านยังไม่ได้เปิดใช้การแปลข้อความ — เปิดได้ที่ เชื่อมช่องทาง → การแปลและ AI",
    };
  }
  return { ok: true, staffLang: normalizeLang(setting.staffLang) ?? "th" };
}

// ───────────────────────── ขาไป: ลูกค้า → ทีม ─────────────────────────

/**
 * แปลข้อความที่มีอยู่แล้วในเธรด (ปุ่ม "แปล" ใต้ฟองข้อความ)
 *
 * ลำดับที่ห้ามสลับ: สวิตช์ร้าน → หาข้อความ (กันข้ามร้าน) → มีคำแปลเดิมไหม → เครดิต → ยิง LLM
 * ทุกด่านก่อน "ยิง LLM" คือด่านที่ทำให้เราไม่จ่ายเงินโดยไม่จำเป็น
 */
export async function translateMessage(args: {
  tenantId: string;
  systemId: string;
  messageId: string;
  targetLang?: string | null;
  userId: string;
}): Promise<TranslateResult> {
  const { tenantId, systemId } = args;
  const gate = await guardTranslateEnabled(tenantId, systemId);
  if (!gate.ok) return gate;

  const target = normalizeLang(args.targetLang) ?? gate.staffLang;
  const d = tenantDb({ tenantId, systemId });

  // 🔴 ผูก tenantId + systemId เสมอ — เดา messageId ของร้านอื่นถูกก็ต้องไม่ได้อะไร
  const msg = await d.chatMessage.findFirst({
    where: { id: (args.messageId ?? "").trim(), tenantId, systemId },
  });
  if (!msg) return { ok: false, reason: "ไม่พบข้อความนี้ในระบบแชทของร้าน" };
  if (msg.purgedAt) return { ok: false, reason: "ข้อความนี้ถูกลบตามอายุการเก็บข้อมูลแล้ว" };

  const source = (msg.body ?? "").trim();
  if (!source) return { ok: false, reason: "ข้อความนี้ไม่มีตัวอักษรให้แปล" };
  if (source.length > MAX_TRANSLATE_CHARS) {
    return { ok: false, reason: `แปลได้ครั้งละไม่เกิน ${MAX_TRANSLATE_CHARS.toLocaleString("th-TH")} ตัวอักษร` };
  }

  // แปลซ้ำภาษาเดิม = คืนของเก่า ไม่ยิง LLM ไม่จ่ายซ้ำ
  if (msg.translatedLang === target && (msg.translatedBody ?? "").trim()) {
    return { ok: true, text: msg.translatedBody!, cached: true, detectedLang: msg.detectedLang ?? undefined };
  }

  const detected = detectLang(source);
  // ต้นทาง = ปลายทางอยู่แล้ว → ไม่ต้องจ่ายเงินเพื่อได้ข้อความเดิม
  if (detected === target) {
    await d.chatMessage.updateMany({
      where: { id: msg.id, tenantId, systemId },
      data: { detectedLang: detected },
    });
    return { ok: true, text: source, cached: true, detectedLang: detected };
  }

  // 🔴 ด่านเงินต้องมาก่อนการยิง LLM เสมอ (TR-8.2)
  if (!(await canSpend(tenantId))) return { ok: false, reason: outOfCreditMessage() };

  const run = await runTranslate(source, target);
  if (!run.ok) return run;

  await chargeUsageSafe(
    { tenantId },
    {
      source: "CHAT_TRANSLATE",
      model: run.model,
      tokensIn: run.tokensIn,
      tokensOut: run.tokensOut,
      conversationId: msg.conversationId,
      userId: args.userId,
      note: `แปลข้อความเป็นภาษา${langLabelTh(target)}`,
    },
  );

  // 🔴 เขียนคำแปลลง "คนละช่อง" กับต้นฉบับ — `body` ห้ามถูกแตะ
  await d.chatMessage.updateMany({
    where: { id: msg.id, tenantId, systemId },
    data: {
      detectedLang: detected,
      translatedBody: run.text,
      translatedLang: target,
      translatedAt: new Date(),
    },
  });

  return { ok: true, text: run.text, cached: false, detectedLang: detected };
}

// ───────────────────────── ขากลับ: ทีม → ลูกค้า ─────────────────────────

/**
 * แปลร่างที่ทีมพิมพ์ ก่อนกดส่ง (ปุ่ม "แปลก่อนส่ง")
 *
 * 🔴 **ห้ามส่งเอง** — ฟังก์ชันนี้ไม่เขียน ChatMessage และไม่ยิงออกช่องทางใด ๆ
 *    คืนคำแปลให้ทีมเห็น ตรวจ แล้วกดส่งเองอีกครั้ง (คำแปลผิดที่ถูกส่งอัตโนมัติ = ความเสียหายกับลูกค้าจริง)
 *    ตอนกดส่ง ชั้น action จะส่ง `originalBody` (ต้นฉบับที่ทีมพิมพ์) ไปเก็บใน `ChatMessage.meta`
 */
export async function translateDraft(args: {
  tenantId: string;
  systemId: string;
  conversationId: string;
  body: string;
  targetLang?: string | null;
  userId: string;
}): Promise<TranslateResult> {
  const { tenantId, systemId } = args;
  const gate = await guardTranslateEnabled(tenantId, systemId);
  if (!gate.ok) return gate;

  const source = (args.body ?? "").trim();
  if (!source) return { ok: false, reason: "ยังไม่มีข้อความให้แปล" };
  if (source.length > MAX_TRANSLATE_CHARS) {
    return { ok: false, reason: `แปลได้ครั้งละไม่เกิน ${MAX_TRANSLATE_CHARS.toLocaleString("th-TH")} ตัวอักษร` };
  }

  const d = tenantDb({ tenantId, systemId });
  // H3-style: ตรวจว่าเธรดเป็นของร้าน/ระบบนี้จริงก่อน แล้วค่อยใช้ภาษาของลูกค้าเป็นปลายทาง
  const conv = await d.chatConversation.findFirst({
    where: { id: (args.conversationId ?? "").trim(), tenantId, systemId },
    include: { contact: true },
  });
  if (!conv) return { ok: false, reason: "ไม่พบบทสนทนานี้ในร้านของคุณ" };

  const target = normalizeLang(args.targetLang) ?? normalizeLang(conv.contact.lang) ?? "en";
  if (target === detectLang(source)) {
    return { ok: true, text: source, cached: true, detectedLang: target };
  }

  if (!(await canSpend(tenantId))) return { ok: false, reason: outOfCreditMessage() };

  const run = await runTranslate(source, target);
  if (!run.ok) return run;

  await chargeUsageSafe(
    { tenantId },
    {
      source: "CHAT_TRANSLATE",
      model: run.model,
      tokensIn: run.tokensIn,
      tokensOut: run.tokensOut,
      conversationId: conv.id,
      userId: args.userId,
      note: `แปลร่างคำตอบเป็นภาษา${langLabelTh(target)}`,
    },
  );

  return { ok: true, text: run.text, cached: false, detectedLang: detectLang(source) };
}
