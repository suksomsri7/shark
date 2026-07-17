// dataset — เก็บ AiTrainingSample เป็นฐานเทรนโมเดลเล็ก self-host อนาคต (distillation)
// ⚠️ PDPA: anonymize ก่อนเก็บเสมอ (เบอร์/อีเมล → placeholder) · เก็บเมื่อ SHARK_AI_COLLECT=1 เท่านั้น
// ของมีค่า = โครง tool-calling (คำสั่ง → เครื่องมือที่เลือก + args) ไม่ใช่ข้อมูลลูกค้า
import { tenantDb } from "@/lib/core/db";

export type DatasetCtx = { tenantId: string };
export type SampleToolCall = { name: string; args?: unknown };
export type SampleInput = {
  userText: string;
  toolCalls: SampleToolCall[];
  replyText: string;
  model: string;
};

/**
 * ปกปิดข้อมูลส่วนบุคคล — คงตัวเลขยอด/จำนวนไว้ (โครงคำสั่งต้องอ่านออก)
 * - อีเมล → <EMAIL> (ทำก่อน กันตัวเลขในอีเมลโดนจับเป็นเบอร์)
 * - เบอร์ 0 ตามด้วย 8–9 หลัก (รวม 9–10 หลัก) → <PHONE>
 */
export function anonymize(text: string): string {
  return String(text ?? "")
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "<EMAIL>")
    .replace(/0\d{8,9}/g, "<PHONE>");
}

// anonymize ลึกในทุก string ของ args (object/array ซ้อนได้) — คงชนิด/โครงเดิม
function anonymizeDeep(v: unknown): unknown {
  if (typeof v === "string") return anonymize(v);
  if (Array.isArray(v)) return v.map(anonymizeDeep);
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) out[k] = anonymizeDeep(val);
    return out;
  }
  return v;
}

/**
 * เก็บ 1 sample — best-effort เท่านั้น (ผู้เรียกครอบ try/catch เพิ่มได้)
 * - ปิด env (SHARK_AI_COLLECT ≠ "1") → คืนเงียบ ไม่เก็บ ไม่ throw
 * - anonymize userText + replyText + args ของทุก toolCall ก่อนเก็บ
 */
export async function recordSample(ctx: DatasetCtx, input: SampleInput): Promise<void> {
  if (process.env.SHARK_AI_COLLECT !== "1") return;
  const toolCallsJson = (input.toolCalls ?? []).map((tc) => ({
    name: tc.name,
    args: anonymizeDeep(tc.args ?? {}),
  }));
  await tenantDb(ctx).aiTrainingSample.create({
    data: {
      tenantId: ctx.tenantId,
      userText: anonymize(input.userText),
      toolCallsJson,
      replyText: anonymize(input.replyText),
      model: input.model,
    },
  });
}
