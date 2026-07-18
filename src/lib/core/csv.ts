// ── ตัวแยก CSV กลาง (ไม่พึ่ง dependency ภายนอก) ──
// ใช้โดยการนำเข้าข้อมูล (ลูกค้า/สินค้า) จาก Excel → SHARK (WO Wave6-A)
// รองรับ: บรรทัดหัวคอลัมน์ · ตัวคั่น , หรือ tab (auto-detect) · field ครอบ " (มี ,/ขึ้นบรรทัด/"" ภายในได้)
//         · ข้ามบรรทัดว่างล้วน · ตัด BOM หัวไฟล์ (Excel บันทึก UTF-8 มักมี BOM)

export type CsvTable = { headers: string[]; rows: string[][] };

// สรุปผลนำเข้าใช้ร่วมทุก entity — created/skipped(ซ้ำ)/errors(แถวที่ผิด + เหตุผล)
export type ImportSummary = { created: number; skipped: number; errors: { row: number; reason: string }[] };

// เดาตัวคั่นจากบรรทัดแรก — มี tab ⇒ TSV, ไม่งั้น comma
function detectDelim(text: string): string {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  return firstLine.includes("\t") ? "\t" : ",";
}

// state-machine tokenizer → records (แต่ละ record = string[] ของ field)
// จัดการ quote/escaped-quote/ตัวคั่น/CRLF อย่างถูกต้อง (ไม่ split ด้วย regex)
function tokenize(text: string, delim: string): string[][] {
  const records: string[][] = [];
  let field = "";
  let record: string[] = [];
  let inQuotes = false;
  let i = 0;
  const n = text.length;
  while (i < n) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'; // "" ภายใน quote = literal quote
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (ch === delim) {
      record.push(field);
      field = "";
      i++;
      continue;
    }
    if (ch === "\r") {
      i++; // กลืน CR — ใช้ \n เป็นตัวจบแถว
      continue;
    }
    if (ch === "\n") {
      record.push(field);
      records.push(record);
      field = "";
      record = [];
      i++;
      continue;
    }
    field += ch;
    i++;
  }
  // แถวสุดท้าย (ไฟล์ไม่ปิดด้วย \n) — ถ้าไฟล์ปิดด้วย \n จะได้ record ว่างที่ถูกกรองทีหลัง
  record.push(field);
  records.push(record);
  return records;
}

// parse CSV/TSV text → { headers, rows } · แถวว่างล้วนถูกตัดทิ้ง · header ถูก trim
export function parseCsv(text: string): CsvTable {
  const clean = text.replace(/^﻿/, "");
  const delim = detectDelim(clean);
  const records = tokenize(clean, delim).filter((r) => r.some((c) => c.trim() !== ""));
  if (records.length === 0) return { headers: [], rows: [] };
  const [headers, ...rows] = records;
  return { headers: headers.map((h) => h.trim()), rows };
}

// หา index คอลัมน์จากรายการชื่อพ้อง (ไทย/อังกฤษ) — normalize: ตัดช่องว่าง/_/-, ตัวพิมพ์เล็ก
export function columnIndex(headers: string[], aliases: string[]): number {
  const norm = (s: string) => s.trim().toLowerCase().replace(/[\s_-]/g, "");
  const wanted = new Set(aliases.map(norm));
  for (let i = 0; i < headers.length; i++) {
    if (wanted.has(norm(headers[i]))) return i;
  }
  return -1;
}

// อ่าน cell แบบ trim (คอลัมน์ไม่พบ index=-1 → "")
export function cell(row: string[], idx: number): string {
  return idx >= 0 ? (row[idx] ?? "").trim() : "";
}
