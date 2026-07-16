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

const DEFAULT_MODEL = "anthropic/claude-haiku-4.5";

/** Mock — deterministic สำหรับข้อสอบ: ตอบทวนข้อความล่าสุด + นับ token จากความยาว */
export class MockProvider implements AiProvider {
  async chat(messages: AiChatMessage[]): Promise<AiReply> {
    const last = [...messages].reverse().find((m) => m.role === "user");
    const text = `รับทราบ: ${last?.content ?? ""}`.trim();
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

    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${this.key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        messages: oaMessages,
        max_tokens: opts?.maxTokens ?? 1024,
        ...(tools ? { tools } : {}),
      }),
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

/** เลือก provider จาก env — null = ยังไม่เปิดใช้ (ชั้นบนต้องแจ้งสุภาพ ห้าม throw) */
export function resolveProvider(): AiProvider | null {
  if (process.env.SHARK_AI_MOCK === "1") return new MockProvider();
  const key = process.env.SHARK_AI_KEY;
  if (!key) return null;
  return new OpenRouterProvider(key, process.env.SHARK_AI_MODEL ?? DEFAULT_MODEL);
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
