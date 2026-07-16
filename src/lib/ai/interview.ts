// สัมภาษณ์ธุรกิจแบบพิมพ์อิสระ (M4 · WO-0016) — docs/AI_LAYER.md Phase 2
//
// หลักคิด: LLM เป็น "ผู้สัมภาษณ์" ถามทีละคำถามภาษาคนทั่วไป จนรู้ครบ 13 ข้อเท็จจริง
// ของ ZDnaFacts แล้วปิดจ๊อบด้วยบรรทัด `FACTS_JSON: {…}` — compile ยังเป็น deterministic เดิม
// (LLM แค่ฟัง ไม่ได้ประกอบระบบเอง) · ตรวจ ZDnaFacts ที่ boundary เสมอ LLM มโนโครงสร้างไม่ได้
//
// กติกาเหล็ก: JSON เพี้ยน/facts ไม่ผ่านสัญญา → คืน done:false ถามต่อ (ห้าม throw)

import { ZDnaFacts } from "@/lib/dna/schema";
import type { DnaFacts } from "@/lib/dna/schema";
import type { AiChatMessage, AiProvider } from "@/lib/ai/provider";

export type InterviewTurn = { role: "user" | "assistant"; content: string };
export type InterviewResult =
  | { done: false; question: string }
  | { done: true; facts: DnaFacts };

const MARKER = "FACTS_JSON:";

// system prompt (ไทย) — ระบุชื่อกิจการ + field ครบ 13 ข้อ (ชื่อ+ความหมาย+ชนิดค่า) + โปรโตคอล FACTS_JSON
function buildInterviewPrompt(tenantName: string): string {
  return [
    `คุณคือผู้สัมภาษณ์ธุรกิจของกิจการ "${tenantName}" บนแพลตฟอร์ม SHARK`,
    "หน้าที่: คุยกับเจ้าของกิจการด้วยภาษาคนทั่วไป ถามทีละคำถาม สั้น กระชับ ไม่ใช้ศัพท์เทคนิค",
    "เป้าหมายคือรู้ข้อเท็จจริง 13 ข้อต่อไปนี้ให้ครบ (อย่าถามหลายข้อพร้อมกัน อย่าถามซ้ำข้อที่รู้แล้ว):",
    "",
    "1. industryHint — ประเภทกิจการ (ค่าใดค่าหนึ่ง): SALON, RESTAURANT, HOTEL, CLINIC, RETAIL, SERVICE, OTHER",
    "2. branchCount — จำนวนสาขา (จำนวนเต็ม 1–20)",
    "3. appointment — ลูกค้านัดหมาย/จองคิวล่วงหน้าไหม (จริง/เท็จ)",
    "4. tables — มีโต๊ะให้ลูกค้านั่งไหม เช่นร้านอาหาร/คาเฟ่ (จริง/เท็จ)",
    "5. rooms — มีห้องพักให้เข้าพักไหม (จริง/เท็จ)",
    "6. walkinQueue — มีคิวหน้าร้านแบบ walk-in บัตรคิวไหม (จริง/เท็จ)",
    "7. sellsGoods — ขายสินค้า/คิดเงินหน้าร้านไหม (จริง/เท็จ)",
    "8. membership — มีระบบสมาชิก/สะสมแต้มไหม (จริง/เท็จ)",
    "9. rewardRedeem — ให้เอาแต้มแลกของรางวัลไหม ถามต่อเมื่อมีสมาชิก (จริง/เท็จ)",
    "10. staffCount — จำนวนพนักงาน (จำนวนเต็ม 0–500)",
    "11. vatRegistered — จดทะเบียน VAT ไหม (จริง/เท็จ)",
    "12. wantsAccounting — ต้องการระบบบัญชี/ออกเอกสารไหม (จริง/เท็จ)",
    "13. usesLineOA — ใช้ LINE OA คุยกับลูกค้าไหม (จริง/เท็จ)",
    "",
    "กติกา:",
    "- ตอบภาษาไทยเสมอ",
    "- ถ้ายังไม่ครบทั้ง 13 ข้อ ให้ถามคำถามถัดไป 1 ข้อเท่านั้น (ตอบเป็นข้อความธรรมดา ไม่มี JSON)",
    `- เมื่อรู้ครบทั้ง 13 ข้อแล้ว ให้ปิดจ๊อบด้วยบรรทัดขึ้นต้นว่า ${MARKER} ตามด้วย JSON object เดียวที่มีครบทั้ง 13 field ตามชื่อและชนิดข้างต้น`,
    `  เช่น: ${MARKER} {"industryHint":"SALON","branchCount":1,"appointment":true,...}`,
    `- ห้ามใส่บรรทัด ${MARKER} จนกว่าจะรู้ครบทุกข้อ`,
  ].join("\n");
}

// สกัด JSON object แรกหลัง marker — นับ brace ให้สมดุล (กันข้อความห้อยท้ายที่ LLM ชอบพูดเกิน)
// คืน null ถ้าไม่มี object สมบูรณ์ (เช่น brace ไม่ปิด)
function extractFirstJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null; // brace ไม่สมดุล = JSON เพี้ยน
}

// ข้อความสุภาพเมื่อ facts ยังไม่พร้อม/เพี้ยน — ขอข้อมูลเพิ่มแทนการ throw
const RETRY_QUESTION =
  "ขอโทษครับ ผมยังสรุปข้อมูลกิจการไม่ครบถ้วน ขอถามเพิ่มอีกนิดนะครับ — ช่วยเล่ารายละเอียดกิจการเพิ่มได้ไหมครับ";

export async function nextInterviewTurn(
  provider: AiProvider,
  tenantName: string,
  transcript: InterviewTurn[],
): Promise<InterviewResult> {
  const messages: AiChatMessage[] = [
    { role: "system", content: buildInterviewPrompt(tenantName) },
    ...transcript.map((t) => ({ role: t.role, content: t.content }) satisfies AiChatMessage),
  ];

  const reply = await provider.chat(messages);
  const text = reply.text ?? "";

  const markerAt = text.indexOf(MARKER);
  if (markerAt === -1) {
    // ไม่มี marker → คำถามถัดไป = ข้อความ LLM ทั้งก้อน
    return { done: false, question: text.trim() };
  }

  // มี marker → สกัด object แรกหลัง marker แล้ว parse ที่ boundary
  const after = text.slice(markerAt + MARKER.length);
  const json = extractFirstJsonObject(after);
  if (!json) return { done: false, question: RETRY_QUESTION };

  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return { done: false, question: RETRY_QUESTION };
  }

  const parsed = ZDnaFacts.safeParse(raw);
  if (!parsed.success) return { done: false, question: RETRY_QUESTION };

  return { done: true, facts: parsed.data };
}
