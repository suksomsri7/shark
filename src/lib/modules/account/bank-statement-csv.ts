// ─────────────────────────────────────────────────────────────
// bank-statement-csv.ts — อ่านไฟล์ "รายการเดินบัญชี" (statement) ของธนาคารไทยเป็นแถวมาตรฐาน
// WO 5.3 · DESIGN-SPEC-V2 §10.2 · เฟรม g10
//
// นโยบาย:
//   - ไม่เพิ่ม dependency ใหม่ — ใช้ `src/lib/core/csv.ts` (parseCsv/columnIndex/cell) ที่มีอยู่
//   - รูปแบบธนาคารกำหนดด้วย "ชื่อพ้องของคอลัมน์" (alias) ไม่ใช่ตำแหน่งคอลัมน์ตายตัว
//     เพราะไฟล์ที่ลูกค้าส่งออกมาจริงต่างกันตามช่องทาง (K-Cyber/K PLUS · SCB Easy/Business Net ฯลฯ)
//     ⇒ ทนต่อคอลัมน์เพิ่ม/สลับที่/หัวไทยหรืออังกฤษ · หาไม่เจอ = ถอยไปใช้ชุด GENERIC
//   - เงิน = สตางค์ (Int) เสมอ · เครื่องหมาย: + เงินเข้า · − เงินออก (มุมมองเจ้าของบัญชี)
//   - วันที่: รับ พ.ศ. (2569/69) → ค.ศ. · dd/mm/yyyy · yyyy-mm-dd · "3 ก.ย. 2569" · มีเวลาต่อท้ายได้
//   - ข้อจำกัดที่รู้ตัว: อ่าน **UTF-8 (ตัด BOM ให้)** เท่านั้น — ไฟล์ TIS-620 ของ core banking รุ่นเก่า
//     ยังไม่รองรับ (ต้อง Save as UTF-8 ก่อน) · จดไว้ใน wo-notes/5.3.md
// ─────────────────────────────────────────────────────────────

import { parseCsv, columnIndex, cell, type CsvTable } from "@/lib/core/csv";

export type BankSource = "KBANK" | "SCB" | "KTB" | "BBL" | "GENERIC";

export const BANK_SOURCES: BankSource[] = ["KBANK", "SCB", "KTB", "BBL", "GENERIC"];

export const BANK_SOURCE_LABEL: Record<BankSource, string> = {
  KBANK: "กสิกรไทย (K-Cyber / K PLUS)",
  SCB: "ไทยพาณิชย์ (SCB Easy / Business Net)",
  KTB: "กรุงไทย (Krungthai NEXT / Corporate Online)",
  BBL: "กรุงเทพ (Bualuang iBanking)",
  GENERIC: "รูปแบบทั่วไป (กำหนดคอลัมน์เอง)",
};

// ─────────────────── ชื่อพ้องของคอลัมน์ต่อธนาคาร ───────────────────
// หมายเหตุ: alias เขียนจากรูปแบบไฟล์ที่พบบ่อยของแต่ละธนาคาร แล้วรวม alias กลางไว้ทุกชุด
// (columnIndex normalize: ตัดช่องว่าง/_/- + ตัวพิมพ์เล็ก ⇒ "Transaction Date" = "transactiondate")

type ColumnSpec = {
  date: string[];
  description: string[];
  ref: string[];
  debit: string[]; // เงินออก (ถอน)
  credit: string[]; // เงินเข้า (ฝาก)
  amount: string[]; // คอลัมน์เดียวมีเครื่องหมาย (ใช้เมื่อไม่มี debit/credit แยก)
  balance: string[];
};

const COMMON_DATE = ["วันที่", "วันที่ทำรายการ", "วัน/เดือน/ปี", "date", "transactiondate", "txndate", "postingdate", "วันที่รายการ"];
const COMMON_DESC = ["รายละเอียด", "รายการ", "คำอธิบาย", "description", "detail", "details", "transactiondescription", "narrative", "remark", "หมายเหตุ"];
const COMMON_REF = ["อ้างอิง", "เลขที่อ้างอิง", "เลขที่รายการ", "เลขที่เช็ค", "ref", "refno", "reference", "referenceno", "chequeno", "cheque", "code", "รหัสรายการ"];
const COMMON_DEBIT = ["ถอน", "ถอนเงิน", "ถอน/โอนออก", "เงินออก", "debit", "withdrawal", "withdraw", "dr", "paidout"];
const COMMON_CREDIT = ["ฝาก", "ฝากเงิน", "ฝาก/โอนเข้า", "เงินเข้า", "credit", "deposit", "cr", "paidin"];
const COMMON_AMOUNT = ["จำนวนเงิน", "จำนวน", "amount", "txnamount", "transactionamount", "มูลค่า"];
const COMMON_BALANCE = ["ยอดคงเหลือ", "คงเหลือ", "ยอดคงเหลือหลังทำรายการ", "balance", "runningbalance", "closingbalance"];

function spec(extra: Partial<ColumnSpec>): ColumnSpec {
  return {
    date: [...(extra.date ?? []), ...COMMON_DATE],
    description: [...(extra.description ?? []), ...COMMON_DESC],
    ref: [...(extra.ref ?? []), ...COMMON_REF],
    debit: [...(extra.debit ?? []), ...COMMON_DEBIT],
    credit: [...(extra.credit ?? []), ...COMMON_CREDIT],
    amount: [...(extra.amount ?? []), ...COMMON_AMOUNT],
    balance: [...(extra.balance ?? []), ...COMMON_BALANCE],
  };
}

const COLUMNS: Record<BankSource, ColumnSpec> = {
  // กสิกรไทย: "วันที่ | เวลา | รายละเอียด | ถอนเงิน | ฝากเงิน | คงเหลือ | ช่องทาง"
  KBANK: spec({
    date: ["วันที่ทำรายการ", "วันที่ / เวลา", "datetime"],
    description: ["ช่องทาง/รายละเอียด", "channeldescription"],
    ref: ["เลขที่อ้างอิง (ref)", "หมายเลขอ้างอิง"],
  }),
  // ไทยพาณิชย์: "วันที่ทำรายการ | วันที่มีผล | รหัสรายการ | รายละเอียด | ถอน/โอนออก | ฝาก/โอนเข้า | ยอดคงเหลือ | ช่องทาง"
  SCB: spec({
    date: ["วันที่มีผล", "effectivedate", "valuedate"],
    description: ["รายละเอียดรายการ", "transactiondetail"],
    ref: ["รหัสรายการ", "transactioncode", "channelcode"],
  }),
  // กรุงไทย: "วันที่ | วันที่มีผล | เลขที่เช็ค | เดบิต | เครดิต | ยอดคงเหลือ | รายการ"
  KTB: spec({
    date: ["วันที่มีผล", "valuedate"],
    debit: ["เดบิต"],
    credit: ["เครดิต"],
    ref: ["เลขที่เช็ค", "chequenumber"],
  }),
  // กรุงเทพ: "Date | Description | Cheque No. | Withdrawal | Deposit | Balance"
  BBL: spec({
    ref: ["chequeno.", "เลขที่เช็ค"],
    description: ["transactiondescription"],
  }),
  GENERIC: spec({}),
};

// ─────────────────── วันที่ ───────────────────

const THAI_MONTH_ABBR = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const THAI_MONTH_FULL = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
const EN_MONTH = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/**
 * เลขปีในไฟล์ → ค.ศ.
 *   4 หลัก: 2569 = พ.ศ. (−543) · 2026 = ค.ศ. (ใช้ตรง)
 *   2 หลัก: 43–99 = พ.ศ. 25xx ("69" → 2569 → 2026) · 00–42 = ค.ศ. 20xx ("26" → 2026)
 *   (เส้นแบ่ง 43 เพราะ พ.ศ. 2543 = ค.ศ. 2000 — ปีที่ต่ำกว่านั้นไม่มีในไฟล์ statement จริง)
 */
function yearOf(raw: number, twoDigit: boolean): number {
  if (twoDigit) return raw >= 43 ? 2500 + raw - 543 : 2000 + raw;
  if (raw >= 2400) return raw - 543; // พ.ศ. เต็ม
  return raw; // ค.ศ. เต็ม
}

/** สร้าง Date ที่ "เที่ยงวันตามเวลาไทย" — กันวันเพี้ยนเมื่อเครื่อง/DB เป็น UTC (บทเรียน getDay() วันที่ไทย) */
export function bkkNoon(y: number, m: number, d: number): Date {
  const iso = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  return new Date(`${iso}T12:00:00+07:00`);
}

function validYmd(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/**
 * อ่านวันที่จาก statement ธนาคารไทย (คืน null ถ้าอ่านไม่ออก)
 * รองรับ: 01/09/2569 · 01/09/2026 · 01/09/69 · 2026-09-01 · 01-09-2569 · "3 ก.ย. 2569" ·
 *         "3 กันยายน 2569" · "01 Sep 2026" · ต่อท้ายด้วยเวลา ("01/09/2569 10:23") ตัดทิ้ง
 */
export function parseThaiDate(raw: string): Date | null {
  const s = raw.trim().replace(/ /g, " ");
  if (!s) return null;
  // ตัดเวลาต่อท้าย (มีทั้ง "01/09/2569 10:23" และ "01/09/2569T10:23")
  const head = s.split(/[T\s]+/).filter(Boolean);
  if (head.length === 0) return null;

  // ISO / yyyy-mm-dd
  const iso = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(head[0]);
  if (iso) {
    const y = yearOf(Number(iso[1]), false);
    const m = Number(iso[2]);
    const d = Number(iso[3]);
    return validYmd(y, m, d) ? bkkNoon(y, m, d) : null;
  }

  // dd/mm/yyyy · dd-mm-yy · dd.mm.yyyy
  const dmy = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/.exec(head[0]);
  if (dmy) {
    const d = Number(dmy[1]);
    const m = Number(dmy[2]);
    const y = yearOf(Number(dmy[3]), dmy[3].length === 2);
    return validYmd(y, m, d) ? bkkNoon(y, m, d) : null;
  }

  // "3 ก.ย. 2569" / "3 กันยายน 2569" / "03 Sep 2026" (เดือนเป็นคำ)
  if (head.length >= 2) {
    const d = Number(head[0]);
    const monthText = head[1].toLowerCase();
    let m = -1;
    for (let i = 0; i < 12; i++) {
      if (
        head[1] === THAI_MONTH_ABBR[i] ||
        head[1] === THAI_MONTH_FULL[i] ||
        head[1].replace(/\./g, "") === THAI_MONTH_ABBR[i].replace(/\./g, "") ||
        monthText.startsWith(EN_MONTH[i])
      ) {
        m = i + 1;
        break;
      }
    }
    const yRaw = head[2] ? Number(head[2]) : NaN;
    if (Number.isFinite(d) && m > 0 && Number.isFinite(yRaw)) {
      const y = yearOf(yRaw, (head[2] ?? "").length === 2);
      return validYmd(y, m, d) ? bkkNoon(y, m, d) : null;
    }
  }
  return null;
}

// ─────────────────── จำนวนเงิน ───────────────────

/**
 * อ่านจำนวนเงินเป็นสตางค์ (คืน null ถ้าอ่านไม่ออก · ช่องว่าง/"-"/"0.00" = 0)
 * รองรับ: 1,234.56 · (250.00) = ติดลบ · −250.00 (unicode minus) · 250.00 DR/CR · ฿ นำหน้า · ช่องว่างคั่นหลักพัน
 */
export function parseAmountSatang(raw: string): number | null {
  let s = (raw ?? "").trim().replace(/ /g, "");
  if (s === "" || s === "-" || s === "—" || s === "–") return 0;
  let sign = 1;
  // (250.00) = ติดลบตามธรรมเนียมบัญชี
  if (/^\(.*\)$/.test(s)) {
    sign = -1;
    s = s.slice(1, -1);
  }
  // DR = เงินออก · CR = เงินเข้า (ต่อท้ายหรือขึ้นต้น)
  const drcr = /(^|\s)(dr|cr)(\s|$)/i.exec(s);
  if (drcr) {
    if (drcr[2].toLowerCase() === "dr") sign = -Math.abs(sign);
    s = s.replace(/(^|\s)(dr|cr)(\s|$)/i, " ");
  }
  s = s.replace(/[฿$]/g, "").replace(/[,\s]/g, "").replace(/[−–—]/g, "-");
  if (s.startsWith("+")) s = s.slice(1);
  if (s.startsWith("-")) {
    sign = -Math.abs(sign);
    s = s.slice(1);
  }
  if (s === "") return 0;
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  // ปัดเป็นสตางค์ผ่าน string เพื่อไม่ให้ float ปัดเพี้ยน (12.35 → 1235 ไม่ใช่ 1234)
  const [intPart, fracRaw = ""] = s.split(".");
  const frac = (fracRaw + "00").slice(0, 2);
  const satang = Number(intPart) * 100 + Number(frac);
  if (!Number.isSafeInteger(satang)) return null;
  return sign * satang;
}

// ─────────────────── ตัวอ่านไฟล์ ───────────────────

export type ParsedStatementRow = {
  seq: number; // ลำดับแถวในไฟล์ (1-based · นับเฉพาะแถวข้อมูล)
  csvRow: number; // เลขบรรทัดในไฟล์สำหรับรายงาน error (นับหัวคอลัมน์เป็นบรรทัด 1)
  txDate: Date;
  description: string;
  refNo: string | null;
  amountSatang: number; // + เข้า · − ออก
  balanceAfterSatang: number | null;
  fingerprint: string;
};

export type StatementParseResult = {
  source: BankSource;
  headers: string[];
  rows: ParsedStatementRow[];
  errors: { row: number; reason: string }[];
  /** ยอดคงเหลือแถวสุดท้าย (ถ้าไฟล์มีคอลัมน์ยอดคงเหลือ) */
  closingFromFile: number | null;
  /** ยอดยกมา = คงเหลือแถวแรก − จำนวนแถวแรก (ถ้ามีคอลัมน์ยอดคงเหลือ) */
  openingFromFile: number | null;
};

/** เดารูปแบบธนาคารจากหัวคอลัมน์ (ใช้ตอนผู้ใช้เลือก "รูปแบบทั่วไป" หรือเลือกผิด) */
export function detectBankSource(headers: string[]): BankSource {
  const has = (aliases: string[]) => columnIndex(headers, aliases) >= 0;
  if (has(["รหัสรายการ", "ถอน/โอนออก", "ฝาก/โอนเข้า"])) return "SCB";
  if (has(["เดบิต", "เครดิต"])) return "KTB";
  if (has(["ถอนเงิน", "ฝากเงิน"])) return "KBANK";
  if (has(["chequeno.", "เลขที่เช็ค"])) return "BBL";
  return "GENERIC";
}

/** hash สั้นแบบ deterministic (FNV-1a 32-bit ×2 รอบ) — ใช้ทำ fingerprint กันนำเข้าซ้ำ */
function hash(s: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 ^= c;
    h1 = Math.imul(h1, 0x01000193) >>> 0;
    h2 = (h2 + c) >>> 0;
    h2 = Math.imul(h2, 0x85ebca6b) >>> 0;
  }
  return h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0");
}

export function fingerprintOf(input: { dayKey: string; amountSatang: number; description: string; refNo: string | null; dupIndex: number }): string {
  const desc = input.description.replace(/\s+/g, " ").trim().toLowerCase();
  return hash(`${input.dayKey}|${input.amountSatang}|${desc}|${input.refNo ?? ""}|${input.dupIndex}`);
}

function dayKeyOf(d: Date): string {
  // เที่ยงวันไทยอยู่แล้ว → ใช้ +07:00 offset ในการตัดวัน
  const bkk = new Date(d.getTime() + 7 * 3600 * 1000);
  return bkk.toISOString().slice(0, 10);
}

export const STATEMENT_MAX_ROWS = 5000;

/**
 * อ่านไฟล์ statement → แถวมาตรฐาน + error ต่อแถว (ไม่ throw · แถวเสียถูกข้ามพร้อมเหตุผลไทย)
 * source = รูปแบบที่ผู้ใช้เลือก · ถ้าเป็น GENERIC จะพยายามเดาจากหัวคอลัมน์ก่อน
 */
export function parseBankStatementCsv(text: string, source: BankSource): StatementParseResult {
  const table: CsvTable = parseCsv(text);
  const errors: { row: number; reason: string }[] = [];
  if (table.headers.length === 0) {
    return { source, headers: [], rows: [], errors: [{ row: 1, reason: "ไฟล์ว่าง หรือไม่มีบรรทัดหัวคอลัมน์" }], closingFromFile: null, openingFromFile: null };
  }

  const effective: BankSource = source === "GENERIC" ? detectBankSource(table.headers) : source;
  const cols = COLUMNS[effective] ?? COLUMNS.GENERIC;

  const iDate = columnIndex(table.headers, cols.date);
  const iDesc = columnIndex(table.headers, cols.description);
  const iRef = columnIndex(table.headers, cols.ref);
  const iDebit = columnIndex(table.headers, cols.debit);
  const iCredit = columnIndex(table.headers, cols.credit);
  const iAmount = columnIndex(table.headers, cols.amount);
  const iBalance = columnIndex(table.headers, cols.balance);

  if (iDate < 0) {
    return {
      source: effective,
      headers: table.headers,
      rows: [],
      errors: [{ row: 1, reason: `ไม่พบคอลัมน์วันที่ (ต้องมีหัวคอลัมน์ เช่น "วันที่" / "Date") — หัวที่พบ: ${table.headers.join(" · ")}` }],
      closingFromFile: null,
      openingFromFile: null,
    };
  }
  if (iDebit < 0 && iCredit < 0 && iAmount < 0) {
    return {
      source: effective,
      headers: table.headers,
      rows: [],
      errors: [{ row: 1, reason: `ไม่พบคอลัมน์จำนวนเงิน (ต้องมี "ถอน"+"ฝาก" หรือ "จำนวนเงิน") — หัวที่พบ: ${table.headers.join(" · ")}` }],
      closingFromFile: null,
      openingFromFile: null,
    };
  }

  const rows: ParsedStatementRow[] = [];
  const dupCount = new Map<string, number>();
  let seq = 0;

  for (let r = 0; r < table.rows.length; r++) {
    const csvRow = r + 2; // +1 หัวคอลัมน์ +1 นับจาก 1
    if (rows.length >= STATEMENT_MAX_ROWS) {
      errors.push({ row: csvRow, reason: `ไฟล์มีแถวเกิน ${STATEMENT_MAX_ROWS} แถว — แบ่งไฟล์ก่อนนำเข้า` });
      break;
    }
    const row = table.rows[r];
    const dateText = cell(row, iDate);
    if (dateText === "") continue; // แถวสรุป/แถวว่างท้ายไฟล์
    const txDate = parseThaiDate(dateText);
    if (!txDate) {
      errors.push({ row: csvRow, reason: `วันที่อ่านไม่ออก: "${dateText}"` });
      continue;
    }

    let amountSatang: number | null = null;
    if (iDebit >= 0 || iCredit >= 0) {
      const dr = iDebit >= 0 ? parseAmountSatang(cell(row, iDebit)) : 0;
      const cr = iCredit >= 0 ? parseAmountSatang(cell(row, iCredit)) : 0;
      if (dr === null || cr === null) {
        errors.push({ row: csvRow, reason: `จำนวนเงินอ่านไม่ออก: ถอน "${cell(row, iDebit)}" ฝาก "${cell(row, iCredit)}"` });
        continue;
      }
      // ถอน = เงินออก (ติดลบ) · ฝาก = เงินเข้า — ไฟล์บางแบบใส่ค่าติดลบมาแล้วในคอลัมน์ถอน
      amountSatang = Math.abs(cr) - Math.abs(dr);
      if (dr === 0 && cr === 0 && iAmount >= 0) {
        const a = parseAmountSatang(cell(row, iAmount));
        if (a !== null) amountSatang = a;
      }
    } else {
      const a = parseAmountSatang(cell(row, iAmount));
      if (a === null) {
        errors.push({ row: csvRow, reason: `จำนวนเงินอ่านไม่ออก: "${cell(row, iAmount)}"` });
        continue;
      }
      amountSatang = a;
    }
    if (amountSatang === 0) {
      errors.push({ row: csvRow, reason: "จำนวนเงินเป็น 0 — ข้ามแถวนี้" });
      continue;
    }

    const balanceRaw = iBalance >= 0 ? parseAmountSatang(cell(row, iBalance)) : null;
    const description = cell(row, iDesc) || "(ไม่มีรายละเอียด)";
    const refNo = iRef >= 0 ? cell(row, iRef) || null : null;

    const dayKey = dayKeyOf(txDate);
    const dupKey = `${dayKey}|${amountSatang}|${description.replace(/\s+/g, " ").trim().toLowerCase()}|${refNo ?? ""}`;
    const dupIndex = dupCount.get(dupKey) ?? 0;
    dupCount.set(dupKey, dupIndex + 1);

    seq += 1;
    rows.push({
      seq,
      csvRow,
      txDate,
      description,
      refNo,
      amountSatang,
      balanceAfterSatang: balanceRaw,
      fingerprint: fingerprintOf({ dayKey, amountSatang, description, refNo, dupIndex }),
    });
  }

  const withBalance = rows.filter((r) => r.balanceAfterSatang !== null);
  const closingFromFile = withBalance.length > 0 ? withBalance[withBalance.length - 1].balanceAfterSatang! : null;
  const first = withBalance[0];
  const openingFromFile = first ? first.balanceAfterSatang! - first.amountSatang : null;

  return { source: effective, headers: table.headers, rows, errors, closingFromFile, openingFromFile };
}
