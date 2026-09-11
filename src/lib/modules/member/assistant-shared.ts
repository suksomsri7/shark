// assistant-shared.ts — ชนิดข้อมูล + ตัวแยกเนื้อหาของหน้า "ผู้ช่วย AI — สมาชิก" (M3.10 · ภาพ 27 ซ้าย)
//
// 🔴 ไฟล์บริสุทธิ์: ไม่แตะ prisma/env/next/facade — `MemberAssistant.tsx` ('use client') import ได้
//    และไฟล์ `"use server"` (`assistant-actions.ts`) ห้าม export type (บทเรียน M2.2) ⇒ ชนิดอยู่ที่นี่
//
// คำตอบของผู้ช่วยเก็บเป็นข้อความเดียวใน `AiMessage.content` — หน้าจอแยกเป็นบล็อก:
//   ข้อความธรรมดา · ตาราง markdown (ตารางผลค้นหา) · บรรทัด `[tools: a · b (รอยืนยัน)]` (เครื่องมือที่ใช้)
// ⇒ ตัวแยกอยู่ที่นี่ที่เดียว (หน้าจอกับข้อสอบใช้ตัวเดียวกัน) ไม่ render markdown เป็น HTML ดิบ

export type AssistantMessageDto = { id: string; role: "USER" | "ASSISTANT"; content: string; at: string };

export type AssistantProposalDto = {
  id: string;
  kind: string;
  summary: string;
  risk: "NORMAL" | "DESTRUCTIVE";
  createdAt: string;
};

export type AssistantStateDto = {
  conversationId: string | null;
  messages: AssistantMessageDto[];
  proposals: AssistantProposalDto[];
  /**
   * รหัสสมาชิก → ชื่อที่แสดง (resolve ฝั่ง server ตอนเรนเดอร์ ด้วยสิทธิ์ของคนที่เปิดหน้า · ตีกลับรอบ 1)
   * 🔴 ชื่อไม่เคยเข้า prompt ของ AI — ผลของ tool ที่ส่งกลับโมเดลยังเป็นรหัสเหมือนเดิม · แผนที่นี้ใช้วาดตารางเท่านั้น
   */
  memberNames: Record<string, string>;
};

export type AssistantActionResult<T> = { ok: true; data: T } | { ok: false; reason: string };

export type AssistantConfirmResult = { ok: boolean; note: string; needsSecondConfirm?: boolean; state: AssistantStateDto };

export type AssistantToolRef = { name: string; pending: boolean };

export type AssistantBlock =
  | { type: "text"; text: string }
  | { type: "table"; headers: string[]; rows: string[][] }
  | { type: "tools"; tools: AssistantToolRef[] };

/** คำต่อท้ายชื่อเครื่องมือที่ "ยังไม่ทำ" (สร้างข้อเสนอรอคนกด) — ใช้ทั้งตอนเขียนและตอนอ่าน */
export const TOOL_PENDING_SUFFIX = "(รอยืนยัน)";

/** บรรทัดเครื่องมือที่ต่อท้ายคำตอบ — `[tools: member_search · member_vouchers_issue (รอยืนยัน)]` */
export function toolsLine(tools: AssistantToolRef[]): string {
  return `[tools: ${tools.map((t) => (t.pending ? `${t.name} ${TOOL_PENDING_SUFFIX}` : t.name)).join(" · ")}]`;
}

const TOOLS_RE = /^\[tools:\s*(.+)\]$/;

function cellsOf(line: string): string[] {
  const t = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return t.split("|").map((c) => c.trim());
}

const isTableLine = (line: string): boolean => /^\s*\|.*\|\s*$/.test(line);
const isDivider = (line: string): boolean => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line);

/** แยกคำตอบของผู้ช่วยเป็นบล็อก (ข้อความ · ตาราง · เครื่องมือที่ใช้) */
export function parseAssistantContent(content: string): AssistantBlock[] {
  const lines = String(content ?? "").replace(/\r\n/g, "\n").split("\n");
  const out: AssistantBlock[] = [];
  let text: string[] = [];
  const flush = () => {
    const joined = text.join("\n").trim();
    if (joined) out.push({ type: "text", text: joined });
    text = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const tools = TOOLS_RE.exec(line.trim());
    if (tools) {
      flush();
      const refs = tools[1]!
        .split(/[·,]/)
        .map((x) => x.trim())
        .filter(Boolean)
        .map((x) => ({ name: x.replace(TOOL_PENDING_SUFFIX, "").trim(), pending: x.includes(TOOL_PENDING_SUFFIX) }));
      if (refs.length > 0) out.push({ type: "tools", tools: refs });
      continue;
    }
    if (isTableLine(line) && i + 1 < lines.length && isDivider(lines[i + 1]!)) {
      flush();
      const headers = cellsOf(line);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && isTableLine(lines[i]!)) {
        rows.push(cellsOf(lines[i]!));
        i++;
      }
      i--;
      out.push({ type: "table", headers, rows });
      continue;
    }
    text.push(line);
  }
  flush();
  return out;
}

/**
 * สรุปของข้อเสนอ (" · " คั่น) → การกระทำ + ต้นทุน (ท่อนที่ขึ้นต้น "ต้นทุน") — ไม่มีท่อนต้นทุน = null
 * (ต้นทุนเขียนโดยตัวสร้างข้อเสนอจากข้อมูลจริงเท่านั้น — หน้าจอไม่คิดเลขเอง)
 */
export function splitProposalSummary(summary: string): { action: string; cost: string | null } {
  const parts = String(summary ?? "")
    .split(" · ")
    .map((p) => p.trim())
    .filter(Boolean);
  const costPart = parts.find((p) => /^ต้นทุน/.test(p)) ?? null;
  const action = parts.filter((p) => p !== costPart).join(" · ");
  return { action, cost: costPart ? costPart.replace(/^ต้นทุน(สูงสุด|รวม)?\s*/, "").trim() || costPart : null };
}

// ───────────────────────── ตารางผลค้นหา: รหัสสมาชิก → ชื่อ (ตีกลับรอบ 1 · ภาพ 27 ซ้าย "ชื่อ · ยอด 12 เดือน · มาล่าสุด") ─────────────────────────

const CODE_HEADER = /^(รหัส(สมาชิก)?|member\s*code|code)$/i;
const INDEX_HEADER = /^(#|ลำดับ|no\.?)$/i;
/** รูปรหัสสมาชิก (6 ตัวพิมพ์ใหญ่/ตัวเลข เช่น `5RVMTN`) — ใช้เดาคอลัมน์รหัสเมื่อหัวตารางไม่บอก */
const CODE_LIKE = /^[A-Z0-9]{4,12}$/;

/** คอลัมน์ที่เป็นรหัสสมาชิก (หัวตารางบอก หรือมีค่าที่ server resolve เป็นชื่อได้) — ไม่มี = -1 */
function codeColumn(block: Extract<AssistantBlock, { type: "table" }>, names: Record<string, string>): number {
  const byHeader = block.headers.findIndex((h) => CODE_HEADER.test(h.trim()));
  if (byHeader >= 0) return byHeader;
  return block.headers.findIndex((_, c) => block.rows.some((r) => names[(r[c] ?? "").trim()] !== undefined));
}

/** รหัสสมาชิกที่อาจอยู่ในตารางของคำตอบ — server เอาไป resolve เป็นชื่อ (ไม่เกิน 200 ตัว) */
export function memberCodeCandidates(contents: string[]): string[] {
  const out = new Set<string>();
  for (const content of contents) {
    for (const b of parseAssistantContent(content)) {
      if (b.type !== "table") continue;
      const col = b.headers.findIndex((h) => CODE_HEADER.test(h.trim()));
      for (const row of b.rows) {
        const cells = col >= 0 ? [row[col] ?? ""] : row;
        for (const cell of cells) {
          const v = cell.trim();
          if (CODE_LIKE.test(v)) out.add(v);
        }
      }
    }
  }
  return [...out].slice(0, 200);
}

export type AssistantDisplayTable = { headers: string[]; rows: { cells: string[]; sub: string | null }[] };

/**
 * ตารางที่วาดจริง: คอลัมน์รหัสสมาชิกกลายเป็น "ชื่อ" คอลัมน์แรก (รหัสอยู่บรรทัดรองใต้ชื่อ) · ตัดคอลัมน์ลำดับ (#)
 * resolve ไม่ได้ (ไม่มีสิทธิ์เห็น/ไม่ใช่รหัสจริง) = แสดงรหัสเดิม · ไม่มีคอลัมน์รหัส = ตารางเดิมทุกช่อง
 */
export function tableWithNames(block: Extract<AssistantBlock, { type: "table" }>, names: Record<string, string>): AssistantDisplayTable {
  const col = codeColumn(block, names);
  if (col < 0) return { headers: block.headers, rows: block.rows.map((cells) => ({ cells, sub: null })) };
  const keep = block.headers.map((_, i) => i).filter((i) => i !== col && !INDEX_HEADER.test((block.headers[i] ?? "").trim()));
  return {
    headers: ["ชื่อ", ...keep.map((i) => block.headers[i] ?? "")],
    rows: block.rows.map((row) => {
      const code = (row[col] ?? "").trim();
      const name = names[code];
      return { cells: [name ?? code, ...keep.map((i) => row[i] ?? "")], sub: name ? code : null };
    }),
  };
}
