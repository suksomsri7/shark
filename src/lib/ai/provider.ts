// ผู้ให้บริการ LLM — docs/AI_LAYER.md
// กฎ: SHARK_AI_KEY ต้องเป็น OpenRouter key ที่สร้างชื่อ "shark" เท่านั้น (ห้ามใช้ key ข้ามโปรเจกต์)
// ไม่มี key = คืน null (ชั้นบนแจ้งสุภาพ) · SHARK_AI_MOCK=1 = MockProvider (oracle/dev)

// นิยาม tool ที่ยื่นให้ LLM (JSON Schema ของ arguments) — ฝั่ง OpenAI-compatible
export type AiToolDef = { name: string; description: string; parameters: object };
// การเรียกเครื่องมือที่ LLM ขอ (args = อาร์กิวเมนต์ที่ parse แล้ว — เพี้ยน = {})
export type AiToolCall = { id: string; name: string; args: unknown };

// role "tool" = ผลลัพธ์เครื่องมือส่งกลับ · toolCalls = คำขอเรียกเครื่องมือของ assistant
export type AiChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  toolCallId?: string;
  toolCalls?: AiToolCall[];
  /** รูปแนบ (data URL หรือ http) — ส่งเข้าโมเดล vision inline ต่อข้อความนี้ (ไม่ persist ใน DB) */
  imageUrls?: string[];
};
export type AiReply = {
  text: string;
  toolCalls?: AiToolCall[];
  tokensIn: number;
  tokensOut: number;
  model: string;
};

export interface AiProvider {
  chat(messages: AiChatMessage[], opts?: { maxTokens?: number; tools?: AiToolDef[] }): Promise<AiReply>;
}

// ── ROUTING 2 ชั้น ── คุม cost: คำถามอ่านสั้น → FAST (haiku ถูก/เร็ว) · งานหนัก/มีรูป → SMART (sonnet)
export const FAST_MODEL = "anthropic/claude-haiku-4.5";
export const SMART_MODEL = "anthropic/claude-sonnet-5";

// คำสั่ง "ทำงาน" (mutation) — ต้องใช้โมเดลฉลาดวางแผน tool-calling/ยืนยัน
const ACTION_WORDS = [
  "สร้าง", "เพิ่ม", "ลบ", "ยกเลิก", "จอง", "ขาย", "อนุมัติ", "บันทึก",
  "ปรับ", "โอน", "รับ", "ชำระ", "เปิดบิล", "สมัคร",
];

/**
 * เลือกโมเดลตามเนื้อความ (routing ชั้นที่ 1 = ก่อนเรียก provider)
 * - env SHARK_AI_MODEL ตั้งไว้ → คืนค่านั้นเสมอ (เจ้าของบังคับตัวเดียว ไม่ auto-route)
 *   → อยากเปิด auto-routing ต้อง "ลบ SHARK_AI_MODEL ออกจาก .env" (ห้ามลบให้เอง)
 * - มีรูป → SMART เสมอ (vision)
 * - มีคำสั่งทำงาน หรือยาว > 120 ตัว → SMART
 * - ที่เหลือ (คำถามอ่านสั้น) → FAST
 */
export function pickModel(text: string, hasImages: boolean): string {
  const forced = process.env.SHARK_AI_MODEL;
  if (forced && forced.trim()) return forced;
  if (hasImages) return SMART_MODEL;
  const t = String(text ?? "");
  if (t.length > 120) return SMART_MODEL;
  // ตัดคำนามรายงาน "ยอด+…" ออกก่อน (เช่น "ยอดขาย"/"ยอดรับ" = คำถามอ่าน ไม่ใช่คำสั่งขาย/รับ)
  // กัน false-positive: substring "ขาย" ใน "ยอดขาย" ไม่ควรทำให้คำถามอ่านกลายเป็นคำสั่ง
  const scan = t.replace(/ยอด(ขาย|รับ|โอน|ชำระ|ปรับ)/g, "ยอด");
  if (ACTION_WORDS.some((w) => scan.includes(w))) return SMART_MODEL;
  return FAST_MODEL;
}

/**
 * ประกอบ request body ของ OpenRouter (แยกเป็น pure function เพื่อทดสอบ + prompt caching)
 * - cacheSystem=true → system message content เป็น array พร้อม cache_control ephemeral
 *   (Anthropic prompt caching ผ่าน OpenRouter — ลด token ของ system prompt + tool schema
 *    ที่ซ้ำทุก request ในบทสนทนาเดียว)
 */
export function buildRequestBody(
  model: string,
  oaMessages: unknown[],
  tools: unknown[] | undefined,
  opts?: { cacheSystem?: boolean; maxTokens?: number },
): Record<string, unknown> {
  const messages = opts?.cacheSystem
    ? oaMessages.map((m) => {
        const mm = (m ?? {}) as { role?: string; content?: unknown };
        if (mm.role === "system" && typeof mm.content === "string") {
          return {
            ...mm,
            content: [{ type: "text", text: mm.content, cache_control: { type: "ephemeral" } }],
          };
        }
        return m;
      })
    : oaMessages;
  return {
    model,
    messages,
    max_tokens: opts?.maxTokens ?? 1024,
    ...(tools && tools.length > 0 ? { tools } : {}),
  };
}

/** Mock — deterministic สำหรับข้อสอบ: ตอบทวนข้อความล่าสุด + นับ token จากความยาว */
export class MockProvider implements AiProvider {
  async chat(messages: AiChatMessage[]): Promise<AiReply> {
    const last = [...messages].reverse().find((m) => m.role === "user");
    const imgCount = last?.imageUrls?.length ?? 0;
    const base = `รับทราบ: ${last?.content ?? ""}`.trim();
    // สะท้อนจำนวนรูปที่แนบมา (ยืนยันว่า imageUrls ไหลถึง provider จริง)
    const text = imgCount > 0 ? `${base} (เห็นรูป ${imgCount} ใบ)` : base;
    const tokensIn = Math.ceil(messages.reduce((s, m) => s + m.content.length, 0) / 4);
    return { text, tokensIn, tokensOut: Math.ceil(text.length / 4), model: "mock" };
  }
}

/** OpenRouter (OpenAI-compatible chat completions) */
export class OpenRouterProvider implements AiProvider {
  constructor(
    private key: string,
    private model: string,
  ) {}

  async chat(messages: AiChatMessage[], opts?: { maxTokens?: number; tools?: AiToolDef[] }): Promise<AiReply> {
    // แปลง message ภายในเป็นรูปแบบ OpenAI: assistant ที่มี toolCalls → tool_calls,
    // role:"tool" → { role:"tool", tool_call_id, content }
    const oaMessages = messages.map((m) => {
      // vision: มีรูปแนบ → content เป็น array [{type:"text"},{type:"image_url",image_url:{url}}]
      // (รูปแบบ OpenAI/OpenRouter · โมเดล anthropic รองรับ vision) — ใช้เฉพาะ user message
      if (m.imageUrls && m.imageUrls.length > 0) {
        const parts: unknown[] = [];
        if (m.content) parts.push({ type: "text", text: m.content });
        for (const url of m.imageUrls) parts.push({ type: "image_url", image_url: { url } });
        return { role: m.role, content: parts };
      }
      if (m.role === "assistant" && m.toolCalls && m.toolCalls.length > 0) {
        return {
          role: "assistant",
          content: m.content || null,
          tool_calls: m.toolCalls.map((tc) => ({
            id: tc.id,
            type: "function",
            function: { name: tc.name, arguments: JSON.stringify(tc.args ?? {}) },
          })),
        };
      }
      if (m.role === "tool") {
        return { role: "tool", tool_call_id: m.toolCallId, content: m.content };
      }
      return { role: m.role, content: m.content };
    });

    // tools → OpenAI tools param (function calling)
    const tools =
      opts?.tools && opts.tools.length > 0
        ? opts.tools.map((t) => ({
            type: "function",
            function: { name: t.name, description: t.description, parameters: t.parameters },
          }))
        : undefined;

    // prompt caching เสมอ: cache system + tool schema (ซ้ำทุก request) → ลด token
    const body = buildRequestBody(this.model, oaMessages, tools, {
      cacheSystem: true,
      maxTokens: opts?.maxTokens,
    });
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.key}`,
        "Content-Type": "application/json",
        // OpenRouter ส่วนใหญ่ผ่าน beta caching ให้เอง — ใส่ไว้กันเหนียว
        "anthropic-beta": "prompt-caching-2024-07-31",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`AI provider ${res.status}: ${body.slice(0, 200)}`);
    }
    const data = (await res.json()) as {
      choices?: {
        message?: {
          content?: string;
          tool_calls?: { id?: string; function?: { name?: string; arguments?: string } }[];
        };
      }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
      model?: string;
    };
    const msg = data.choices?.[0]?.message;
    const text = msg?.content ?? "";
    // อ่าน tool_calls — JSON.parse arguments เพี้ยน = args {} (กันพัง ไม่ throw)
    const toolCalls: AiToolCall[] = (msg?.tool_calls ?? []).map((c) => {
      let args: unknown = {};
      try {
        args = c.function?.arguments ? JSON.parse(c.function.arguments) : {};
      } catch {
        args = {};
      }
      return { id: c.id ?? "", name: c.function?.name ?? "", args };
    });
    // ตอบว่างจริง (ไม่มีทั้งข้อความและ tool call) = ผิดปกติ
    if (!text && toolCalls.length === 0) throw new Error("AI provider ตอบว่าง");
    return {
      text,
      ...(toolCalls.length > 0 ? { toolCalls } : {}),
      tokensIn: data.usage?.prompt_tokens ?? 0,
      tokensOut: data.usage?.completion_tokens ?? 0,
      model: data.model ?? this.model,
    };
  }
}

/**
 * เลือก provider จาก env ตาม tier (routing ชั้นที่ 2) — null = ยังไม่เปิดใช้ (ห้าม throw)
 * - SHARK_AI_MODEL ตั้งไว้ → ใช้ตัวนั้นเสมอ (เจ้าของบังคับ — สอดคล้อง pickModel)
 * - ไม่งั้นใช้ constant ตาม tier · ไม่ส่ง tier = smart
 */
export function resolveProvider(tier: "fast" | "smart" = "smart"): AiProvider | null {
  if (process.env.SHARK_AI_MOCK === "1") return new MockProvider();
  const key = process.env.SHARK_AI_KEY;
  if (!key) return null;
  const forced = process.env.SHARK_AI_MODEL;
  const model = forced && forced.trim() ? forced : tier === "fast" ? FAST_MODEL : SMART_MODEL;
  return new OpenRouterProvider(key, model);
}

/** เพดานใช้งานต่อ tenant ต่อวัน (override ได้ทาง env) */
export function dailyLimits(): { maxRequests: number; maxTokens: number } {
  const req = Number(process.env.SHARK_AI_DAILY_REQ);
  const tok = Number(process.env.SHARK_AI_DAILY_TOKENS);
  return {
    maxRequests: Number.isFinite(req) && req > 0 ? req : 300,
    maxTokens: Number.isFinite(tok) && tok > 0 ? tok : 400_000,
  };
}
