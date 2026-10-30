// SVC D.4 ▸ ตัวต่อ AI เดาคอลัมน์ (ImportColumnGuesser) — ledger/svc-briefs/svc-brief-d.4.md §3.2 "AI เสนอ · คนยืนยัน"
//   • เสียบได้: import.ts รับ deps.guesser (ทดสอบ/ฉากใช้ตัวตายตัว) · ไม่ส่ง = defaultColumnGuesser ของร้าน · ไม่มี provider/เครดิต ⇒ null (ใช้หัวคอลัมน์แทน)
//   • PDPA: ผู้เรียก (import.ts) ส่งเฉพาะหัวคอลัมน์ + ตัวอย่างที่ปิดเบอร์/เลขบัตร และแทนชื่อคนด้วย "ชื่อ-นามสกุล" แล้วเท่านั้น
//   • ผลจาก AI = ข้อเสนอ (ไม่ใช่การยืนยัน) · import.ts กรองผลผิดรูปทิ้งเอง · ตัวต่อนี้ไม่ throw (ล้ม ⇒ [])
//   • คิดเครดิต AI เดิมของร้าน (canSpend ก่อน · chargeUsageSafe หลังเรียกสำเร็จ)
import { resolveProvider } from "@/lib/ai/provider";
import { canSpend, chargeUsageSafe } from "@/lib/ai/credit";
import type { ImportFieldKey } from "./import-parse";

export type ImportColumnGuesser = {
  guess(input: { headers: string[]; samples: string[][]; fields: { key: ImportFieldKey; labelTh: string }[] }): Promise<{ col: number; field: ImportFieldKey | "IGNORE"; confidence: number }[]>;
};

const SYSTEM = [
  "You map spreadsheet columns of a Thai dormitory tenant register to system fields.",
  "Reply with JSON only: an array of {\"col\": <0-based column index>, \"field\": <field key or \"IGNORE\">, \"confidence\": <0..1>}.",
  "Use each field key at most once. Use IGNORE for columns that should not be imported (e.g. LINE id).",
].join(" ");

function parseReply(text: string): { col: number; field: ImportFieldKey | "IGNORE"; confidence: number }[] {
  // Y1 ▸ indexOf แทน /\[[\s\S]*\]/ (ผลเดียวกัน: '[' ตัวแรก ถึง ']' ตัวสุดท้าย · ไม่ย้อนรอยกำลังสอง) ◂
  const a = text.indexOf("[");
  const z = text.lastIndexOf("]");
  if (a < 0 || z < a) return [];
  try {
    const arr: unknown = JSON.parse(text.slice(a, z + 1));
    if (!Array.isArray(arr)) return [];
    const out: { col: number; field: ImportFieldKey | "IGNORE"; confidence: number }[] = [];
    for (const x of arr.slice(0, 80)) {
      if (!x || typeof x !== "object") continue;
      const o = x as { col?: unknown; field?: unknown; confidence?: unknown };
      if (typeof o.col !== "number" || typeof o.field !== "string") continue;
      out.push({ col: o.col, field: o.field as ImportFieldKey | "IGNORE", confidence: typeof o.confidence === "number" ? o.confidence : 0.5 });
    }
    return out;
  } catch {
    return [];
  }
}

/** ตัวต่อจริงของร้าน — ไม่มี provider (ไม่ได้ตั้งคีย์) หรือเครดิตหมด ⇒ null */
export async function defaultColumnGuesser(ctx: { tenantId: string; actorUserId?: string | null }): Promise<ImportColumnGuesser | null> {
  const provider = resolveProvider("fast");
  if (!provider) return null;
  try {
    if (!(await canSpend(ctx.tenantId))) return null;
  } catch {
    return null;
  }
  return {
    async guess(input) {
      try {
        const user = JSON.stringify({ fields: input.fields, headers: input.headers, samples: input.samples });
        const r = await provider.chat(
          [
            { role: "system", content: SYSTEM },
            { role: "user", content: user },
          ],
          { maxTokens: 800 },
        );
        await chargeUsageSafe(
          { tenantId: ctx.tenantId },
          { source: "CHAT", model: r.model, tokensIn: r.tokensIn, tokensOut: r.tokensOut, ...(ctx.actorUserId ? { userId: ctx.actorUserId } : {}), note: "dorm.import.guessColumns" },
        );
        return parseReply(r.text);
      } catch {
        return [];
      }
    },
  };
}
