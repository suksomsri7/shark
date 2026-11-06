// ผู้ให้บริการ LLM — docs/AI_LAYER.md
// กฎ: SHARK_AI_KEY ต้องเป็น OpenRouter key ที่สร้างชื่อ "shark" เท่านั้น (ห้ามใช้ key ข้ามโปรเจกต์)
// ไม่มี key = คืน null (ชั้นบนแจ้งสุภาพ) · SHARK_AI_MOCK=1 = MockProvider (oracle/dev)
// AI_PROVIDER=anthropic = เรียก Anthropic ตรงด้วย SHARK_ANTHROPIC_KEY (คีย์ชื่อ "shark" เท่านั้น) · ปริยาย = OpenRouter

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
/** SEC S3a.1-S1 ▸ R-Z1: เพดานเวลาต่อคำขอถึงผู้ให้บริการ (90 วิ) — เกิน = abort (throw) ⇒ worker กลับคิว/ลองใหม่ ไม่ค้างจน lease หมด ◂ */
export const PROVIDER_FETCH_TIMEOUT_MS = 90_000;

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
      signal: AbortSignal.timeout(PROVIDER_FETCH_TIMEOUT_MS), // SEC S3a.1-S1 R-Z1
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

// ── ผู้ให้บริการตรง Anthropic (S1.20 · R-K18/R-K18b) ── Messages API ด้วย fetch ล้วน (ไม่มี SDK ในโปรเจกต์ · ห้ามติดตั้ง)
// FAST_MODEL/SMART_MODEL คงเป็น slug OpenRouter (ผู้เรียกเทียบ === FAST_MODEL) → แม็ปเป็น id ตรงตอน resolve เท่านั้น
export const ANTHROPIC_MODEL_IDS: Readonly<Record<string, string>> = Object.freeze({
  [FAST_MODEL]: "claude-haiku-4-5",
  [SMART_MODEL]: "claude-sonnet-5",
});

/**
 * slug OpenRouter หรือ id ตรง → id ของ Messages API (pure)
 * - อยู่ในตาราง → id ในตาราง · ขึ้นต้น "claude-" → คืนเดิม
 * - อื่น ๆ → ตัด prefix "anthropic/" แล้วแทน "." ด้วย "-" (เช่น anthropic/claude-x-4.6 → claude-x-4-6)
 */
export function toAnthropicModelId(slugOrId: string): string {
  const s = String(slugOrId ?? "").trim();
  const mapped = ANTHROPIC_MODEL_IDS[s];
  if (mapped) return mapped;
  if (s.startsWith("claude-")) return s;
  return s.replace(/^anthropic\//, "").replace(/\./g, "-");
}

type AnthropicBlock = Record<string, unknown>;
type AnthropicMessage = { role: "user" | "assistant"; content: string | AnthropicBlock[] };

// รูปแนบ → image block: data URL (base64) ⇒ source base64 · อื่น ๆ (http/https) ⇒ source url
function anthropicImageBlock(url: string): AnthropicBlock {
  const m = /^data:([^;,]+);base64,([\s\S]*)$/.exec(url);
  if (m) return { type: "image", source: { type: "base64", media_type: m[1], data: m[2] } };
  return { type: "image", source: { type: "url", url } };
}

/**
 * ประกอบ request body ของ Messages API (pure · ทดสอบได้)
 * - system ทุกข้อความต่อกันด้วย "\n\n" → system block เดียวพร้อม cache_control ephemeral (ไม่มี = ไม่ใส่คีย์)
 * - user มีรูป ⇒ blocks [text?, image…] · assistant มี toolCalls ⇒ blocks [text? (ไม่ว่าง), tool_use…]
 * - role tool ⇒ tool_result ใน user message · ผลที่ติดกันรวมเป็น user message เดียว (กติกา API)
 * - tools ⇒ input_schema + cache_control บนตัวสุดท้าย (cache ทั้งชุด) · ไม่มี tools = ไม่ใส่คีย์
 * - ไม่ส่งพารามิเตอร์สุ่ม/thinking/tool_choice (API รุ่นปัจจุบันปฏิเสธ/ใช้ค่าปริยาย)
 */
export function buildAnthropicRequestBody(
  model: string,
  messages: AiChatMessage[],
  tools: AiToolDef[] | undefined,
  opts?: { maxTokens?: number },
): Record<string, unknown> {
  const systemText = messages
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .join("\n\n");
  const out: AnthropicMessage[] = [];
  // ทิ้ง assistant ว่างแล้ว user สองก้อนจะติดกัน → ก้อนถัดไปต้องรวมเข้าก้อนก่อนหน้า
  let mergeNextUser = false;
  const pushUser = (content: string | AnthropicBlock[]) => {
    const prev = out[out.length - 1];
    if (mergeNextUser && prev?.role === "user") {
      if (typeof prev.content === "string" && typeof content === "string") {
        prev.content = [prev.content, content].filter((t) => t).join("\n\n");
      } else {
        const asBlocks = (c: string | AnthropicBlock[]): AnthropicBlock[] =>
          typeof c === "string" ? (c ? [{ type: "text", text: c }] : []) : c;
        prev.content = [...asBlocks(prev.content), ...asBlocks(content)];
      }
    } else {
      out.push({ role: "user", content });
    }
    mergeNextUser = false;
  };
  for (const m of messages) {
    if (m.role === "system") continue;
    if (m.role === "tool") {
      const block: AnthropicBlock = { type: "tool_result", tool_use_id: m.toolCallId ?? "", content: m.content };
      const prev = out[out.length - 1];
      const prevIsToolResults =
        prev?.role === "user" &&
        Array.isArray(prev.content) &&
        prev.content.length > 0 &&
        prev.content.every((b) => b.type === "tool_result");
      if (prevIsToolResults && !mergeNextUser) (prev.content as AnthropicBlock[]).push(block);
      else pushUser([block]);
      continue;
    }
    if (m.role === "assistant") {
      if (m.toolCalls && m.toolCalls.length > 0) {
        const blocks: AnthropicBlock[] = [];
        if (m.content) blocks.push({ type: "text", text: m.content });
        for (const tc of m.toolCalls) blocks.push({ type: "tool_use", id: tc.id, name: tc.name, input: tc.args ?? {} });
        out.push({ role: "assistant", content: blocks });
      } else if (!m.content || !m.content.trim()) {
        // assistant ข้อความว่าง/มีแต่ช่องว่าง และไม่มี tool call → API ตอบ 400 (content ว่างไม่ได้) จึงทิ้ง turn นี้
        mergeNextUser = true;
      } else {
        out.push({ role: "assistant", content: m.content });
      }
      continue;
    }
    // user
    if (m.imageUrls && m.imageUrls.length > 0) {
      const blocks: AnthropicBlock[] = [];
      if (m.content) blocks.push({ type: "text", text: m.content });
      for (const url of m.imageUrls) blocks.push(anthropicImageBlock(url));
      pushUser(blocks);
    } else {
      pushUser(m.content);
    }
  }
  const toolDefs =
    tools && tools.length > 0
      ? tools.map((t, i) => ({
          name: t.name,
          description: t.description,
          input_schema: t.parameters,
          ...(i === tools.length - 1 ? { cache_control: { type: "ephemeral" } } : {}),
        }))
      : undefined;
  return {
    model,
    max_tokens: opts?.maxTokens ?? 1024,
    ...(systemText ? { system: [{ type: "text", text: systemText, cache_control: { type: "ephemeral" } }] } : {}),
    messages: out,
    ...(toolDefs ? { tools: toolDefs } : {}),
  };
}

/**
 * อ่านผลของ Messages API → AiReply (pure)
 * - text = text blocks ต่อกัน · tool_use → toolCalls {id, name, args: input} · block อื่น (thinking ฯลฯ) ข้าม
 * - tokensIn = input + cache_creation_input + cache_read_input (คิดเงินครบทุก token ขาเข้า) · tokensOut = output
 * - stop_reason "refusal" ⇒ throw ไทย · ไม่มีทั้งข้อความและ tool_use ⇒ throw "ตอบว่าง" (แบบ OpenRouter)
 */
export function parseAnthropicReply(json: unknown, fallbackModel: string): AiReply {
  const data = (json ?? {}) as {
    model?: string;
    stop_reason?: string;
    content?: { type?: string; text?: string; id?: string; name?: string; input?: unknown }[];
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      cache_creation_input_tokens?: number;
      cache_read_input_tokens?: number;
    };
  };
  if (data.stop_reason === "refusal") throw new Error("AI ปฏิเสธคำขอนี้ (นโยบายความปลอดภัยของผู้ให้บริการ)");
  const blocks = Array.isArray(data.content) ? data.content : [];
  const text = blocks
    .filter((b) => b?.type === "text" && typeof b.text === "string")
    .map((b) => b.text as string)
    .join("");
  const toolCalls: AiToolCall[] = blocks
    .filter((b) => b?.type === "tool_use")
    .map((b) => ({ id: b.id ?? "", name: b.name ?? "", args: b.input ?? {} }));
  if (!text && toolCalls.length === 0) throw new Error("AI provider ตอบว่าง");
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  const u = data.usage ?? {};
  return {
    text,
    ...(toolCalls.length > 0 ? { toolCalls } : {}),
    tokensIn: n(u.input_tokens) + n(u.cache_creation_input_tokens) + n(u.cache_read_input_tokens),
    tokensOut: n(u.output_tokens),
    model: data.model ?? fallbackModel,
  };
}

const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

/** Anthropic Messages API ตรง (fetch ล้วน · fetchImpl ฉีดได้สำหรับข้อสอบ — ข้อสอบไม่เรียก API จริง) */
export class AnthropicProvider implements AiProvider {
  readonly model: string;
  private readonly key: string;
  private readonly fetchImpl: typeof fetch;
  private readonly version: string;

  constructor(key: string, model: string, deps?: { fetchImpl?: typeof fetch; version?: string }) {
    this.key = key;
    this.model = model;
    this.fetchImpl = deps?.fetchImpl ?? ((input, init) => fetch(input, init));
    this.version = deps?.version ?? ANTHROPIC_VERSION;
  }

  async chat(messages: AiChatMessage[], opts?: { maxTokens?: number; tools?: AiToolDef[] }): Promise<AiReply> {
    const body = buildAnthropicRequestBody(this.model, messages, opts?.tools, { maxTokens: opts?.maxTokens });
    const res = await this.fetchImpl(ANTHROPIC_MESSAGES_URL, {
      method: "POST",
      headers: {
        "x-api-key": this.key,
        "anthropic-version": this.version,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(PROVIDER_FETCH_TIMEOUT_MS), // SEC S3a.1-S1 R-Z1
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      throw new Error(`AI provider ${res.status}: ${errBody.slice(0, 200)}`);
    }
    return parseAnthropicReply(await res.json(), this.model);
  }
}

/**
 * เลือก provider จาก env ตาม tier (routing ชั้นที่ 2) — null = ยังไม่เปิดใช้ (ห้าม throw)
 * - SHARK_AI_MODEL ตั้งไว้ → ใช้ตัวนั้นเสมอ (เจ้าของบังคับ — สอดคล้อง pickModel)
 * - ไม่งั้นใช้ constant ตาม tier · ไม่ส่ง tier = smart
 * - AI_PROVIDER=anthropic → AnthropicProvider (id ตรงจาก toAnthropicModelId) · อื่น ๆ = OpenRouter ทางเดิม
 */
export function resolveProvider(tier: "fast" | "smart" = "smart"): AiProvider | null {
  if (process.env.SHARK_AI_MOCK === "1") return new MockProvider();
  // S1.20: AI_PROVIDER=anthropic ⇒ ต้องมี SHARK_ANTHROPIC_KEY (ไม่มี = null · ไม่ตกไป OpenRouter)
  if (process.env.AI_PROVIDER === "anthropic") {
    const anthropicKey = process.env.SHARK_ANTHROPIC_KEY;
    if (!anthropicKey) return null;
    const forcedModel = process.env.SHARK_AI_MODEL;
    const slug = forcedModel && forcedModel.trim() ? forcedModel : tier === "fast" ? FAST_MODEL : SMART_MODEL;
    return new AnthropicProvider(anthropicKey, toAnthropicModelId(slug));
  }
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
