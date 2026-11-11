// SVC D.4 ▸ นำเข้า Excel/CSV — ส่วน pure (ledger/svc-briefs/svc-brief-d.4.md §2.2 §2.4 §2.5 §4)
//   🔴 pure: import ได้แค่ node:zlib · node:crypto + import type — ไม่แตะ prisma/next/env/ไฟล์/เครือข่าย
//   • อ่านไฟล์: ตัดสินจากไบต์ (ไม่เชื่อนามสกุล/contentType) · CSV/TSV (UTF-8 · BOM UTF-16LE · windows-874) · XLSX ตัวอ่านเล็กบน node:zlib
//   • XLSX: ไม่คำนวณสูตร (ใช้ค่าแคช <v>) · ถอด entity 5 ตัว + &#n; &#xh; เท่านั้น (ไม่อ่าน DTD) · กันไฟล์ระเบิดด้วยเพดานไบต์หลังคลาย + จำนวนรายการ
//   • เซลล์อันตราย (CSV/formula injection): neutralizeCell — ใช้ทั้งขาเข้าและทุกทางที่สะท้อนค่ากลับ
import { inflateRawSync } from "node:zlib";

export type ImportFieldKey =
  | "room"
  | "building"
  | "floor"
  | "roomType"
  | "tenantName"
  | "phone"
  | "idCard"
  | "startDate"
  | "months"
  | "rent"
  | "deposit"
  | "advanceRent"
  | "elecReading"
  | "waterReading"
  | "arrears"
  | "note";
/** key = index คอลัมน์ 0-based เป็นสตริง */
export type ImportMapping = Record<string, ImportFieldKey | "IGNORE">;

// ───────────────────────── ฟิลด์ + ชื่อพ้องของหัวคอลัมน์ ─────────────────────────
export const IMPORT_FIELDS: { key: ImportFieldKey; labelTh: string; aliases: string[] }[] = [
  { key: "room", labelTh: "เลขห้อง", aliases: ["ห้อง", "เลขห้อง", "ห้องเลขที่", "หมายเลขห้อง", "room", "room no", "roomno", "room number", "unit"] },
  { key: "building", labelTh: "อาคาร", aliases: ["อาคาร", "ตึก", "building"] },
  { key: "floor", labelTh: "ชั้น", aliases: ["ชั้น", "floor"] },
  { key: "roomType", labelTh: "ประเภทห้อง", aliases: ["ประเภทห้อง", "แบบห้อง", "ชนิดห้อง", "room type", "roomtype", "type"] },
  { key: "tenantName", labelTh: "ชื่อผู้เช่า", aliases: ["ชื่อผู้เช่า", "ผู้เช่า", "ชื่อ", "ชื่อ-นามสกุล", "ชื่อนามสกุล", "tenant", "tenant name", "name", "full name"] },
  { key: "phone", labelTh: "เบอร์โทร", aliases: ["โทร", "เบอร์", "เบอร์โทร", "เบอร์โทรศัพท์", "โทรศัพท์", "มือถือ", "phone", "tel", "mobile"] },
  { key: "idCard", labelTh: "เลขบัตรประชาชน", aliases: ["เลขบัตร", "เลขบัตรประชาชน", "บัตรประชาชน", "id card", "idcard", "national id", "citizen id"] },
  { key: "startDate", labelTh: "วันเริ่มสัญญา (วันเข้าอยู่)", aliases: ["เข้าอยู่", "วันเข้าอยู่", "วันเข้า", "วันเริ่มสัญญา", "เริ่มสัญญา", "วันเริ่ม", "start", "start date", "move in", "movein"] },
  { key: "months", labelTh: "ระยะสัญญา (เดือน)", aliases: ["ระยะสัญญา", "จำนวนเดือน", "เดือนสัญญา", "months", "term"] },
  { key: "rent", labelTh: "ค่าห้อง/เดือน", aliases: ["ค่าเช่า", "ค่าห้อง", "ค่าเช่าห้อง", "ค่าเช่า/เดือน", "rent", "monthly rent"] },
  { key: "deposit", labelTh: "เงินประกันที่ถือไว้", aliases: ["ประกัน", "เงินประกัน", "มัดจำ", "เงินมัดจำ", "deposit", "security deposit"] },
  { key: "advanceRent", labelTh: "ค่าเช่าล่วงหน้า", aliases: ["ค่าเช่าล่วงหน้า", "ล่วงหน้า", "advance", "advance rent"] },
  { key: "elecReading", labelTh: "เลขมิเตอร์ไฟล่าสุด", aliases: ["ไฟ", "มิเตอร์ไฟ", "เลขไฟ", "ไฟฟ้า", "elec", "electric", "electricity"] },
  { key: "waterReading", labelTh: "เลขมิเตอร์น้ำล่าสุด", aliases: ["น้ำ", "มิเตอร์น้ำ", "เลขน้ำ", "ประปา", "water"] },
  { key: "arrears", labelTh: "ยอดค้างยกมา", aliases: ["ค้าง", "ค้างชำระ", "ยอดค้าง", "ค้างจ่าย", "arrears", "outstanding", "balance"] },
  { key: "note", labelTh: "บันทึกของห้อง", aliases: ["หมายเหตุ", "บันทึก", "note", "notes", "remark", "remarks"] },
];
/** คอลัมน์ที่จงใจไม่นำเข้า (ผูกด้วยรหัสผูกห้อง D.9) */
const IGNORE_ALIASES = ["line", "line id", "lineid", "ไลน์", "ไอดีไลน์"];
export const IMPORT_FIELD_KEYS: readonly ImportFieldKey[] = IMPORT_FIELDS.map((f) => f.key);
export const isImportFieldKey = (v: unknown): v is ImportFieldKey => typeof v === "string" && (IMPORT_FIELD_KEYS as readonly string[]).includes(v);

// ───────────────────────── เพดานแข็ง ─────────────────────────
export const IMPORT_MAX_COLUMNS = 60;
export const IMPORT_MAX_CELL = 1000;
const ZIP_MAX_ENTRIES = 500;
const DEFAULT_MAX_UNZIPPED = 20_000_000;

type ParseFail = { ok: false; code: "UNSUPPORTED_FORMAT" | "UNSAFE_FILE" | "EMPTY_FILE" | "SHEET_NOT_FOUND" | "TOO_MANY_ROWS" | "TOO_MANY_COLUMNS"; reason: string };
/** เพดานแถวข้อมูลแข็ง (ค่าตั้งสูงสุด 5,000) · เพดานผลรวมตัวอักษรหลังแยก (X2 ค) */
const HARD_MAX_ROWS = 5000;
const DEFAULT_MAX_CHARS = 10_000_000;
export type ParsedImportFile = {
  ok: true;
  format: "CSV" | "XLSX";
  encoding: "utf-8" | "utf-16le" | "windows-874" | "xlsx";
  sheet: string;
  sheets: { name: string; rowCount: number }[];
  headers: string[];
  rows: string[][];
};
const UNSUPPORTED: ParseFail = { ok: false, code: "UNSUPPORTED_FORMAT", reason: "ระบบอ่านไฟล์ชนิดนี้ไม่ได้ — บันทึกเป็น .xlsx หรือ CSV UTF-8 แล้วอัปโหลดใหม่" };
const UNSAFE: ParseFail = { ok: false, code: "UNSAFE_FILE", reason: "ไฟล์นี้ใหญ่ผิดปกติเมื่อคลายออก หรือมีส่วนประกอบมากเกินไป — ระบบไม่เปิดเพื่อความปลอดภัย บันทึกเป็นไฟล์ใหม่แล้วลองอีกครั้ง" };
const TOO_MANY_COLS: ParseFail = { ok: false, code: "TOO_MANY_COLUMNS", reason: `ไฟล์มีเกิน ${60} คอลัมน์ — ลบคอลัมน์ที่ไม่ใช้ออกก่อน` };
const tooManyRows = (n: number): ParseFail => ({ ok: false, code: "TOO_MANY_ROWS", reason: `ไฟล์มีแถวข้อมูลเกิน ${n.toLocaleString("en-US")} แถว — แบ่งเป็นหลายไฟล์` });
const EMPTY: ParseFail = { ok: false, code: "EMPTY_FILE", reason: "ไฟล์ว่าง หรือมีแต่แถวหัวคอลัมน์ — ใส่ข้อมูลห้องอย่างน้อย 1 แถว" };

// ───────────────────────── เซลล์อันตราย (§2.4) ─────────────────────────
const FORMULA_CH = /^[=+\-@＝＋－＠]/;
/** ขึ้นต้นด้วยอักขระสูตร/tab/CR/LF (หรือหลังตัดช่องว่างหัวแล้วขึ้นต้นด้วยอักขระสูตร) ⇒ `'` + ค่าที่ตัดช่องว่างหัวท้าย · อื่น = ค่าเดิม */
export function neutralizeCell(v: string): string {
  const s = typeof v === "string" ? v : String(v ?? "");
  if (/^[\t\r\n]/.test(s) || FORMULA_CH.test(s) || FORMULA_CH.test(s.replace(/^[\s\t\r\n]+/, ""))) return `'${s.trim()}`;
  return s;
}
/** ค่าดิบขึ้นต้นด้วยอักขระสูตร (หลังตัดช่องว่างหัว) */
export const looksFormula = (v: string): boolean => FORMULA_CH.test(v.replace(/^[\s\t\r\n]+/, ""));

// ───────────────────────── ข้อมูลส่วนตัว (§2.4) ─────────────────────────
/** เบอร์ไทยจากข้อความ (+66/0066 ⇒ 0 · ตัดขีด/ช่องว่าง) — ไม่ใช่รูปเบอร์ ⇒ "" */
export function phoneDigits(raw: string): string {
  const s = (raw ?? "").trim();
  if (!s || !/^[+\d][\d\s().-]*$/.test(s)) return "";
  let d = s.replace(/\D/g, "");
  if (d.startsWith("0066")) d = `0${d.slice(4)}`;
  else if (d.startsWith("66") && (s.startsWith("+") || d.length === 11)) d = `0${d.slice(2)}`;
  return /^0\d{8,9}$/.test(d) ? d : "";
}
/** ปิดเลขกลางของค่าที่ "หน้าตาเป็น" เบอร์/เลขบัตร — อื่นคืนเดิม */
export function maskPersonal(v: string): string {
  const s = (v ?? "").trim();
  // X9 ▸ ทุกค่าที่เป็นตัวเลขล้วน (หลังตัด - ( ) ช่องว่าง +) 8–12 หลัก ⇒ ปิดแบบเบอร์ · 13 หลัก ⇒ ปิดแบบเลขบัตร (ไม่ต้องขึ้นต้นด้วย 0)
  if (!/^[\d\s()+-]+$/.test(s)) return v;
  const digits = s.replace(/[\s()+-]/g, "");
  if (/^\d{13}$/.test(digits)) return `x-xxxx-xxxxx-xx-${digits.slice(-1)}`;
  if (/^\d{8,12}$/.test(digits)) {
    const ph = phoneDigits(s) || digits;
    return `${ph.slice(0, 3)}-xxx-${ph.slice(-4)}`;
  }
  return v;
}
/** ค่าที่ปลอดภัยสำหรับสะท้อนกลับ (ปิดข้อมูลส่วนตัว + ทำให้เป็นกลาง + ตัดยาว) */
export function safeEcho(v: string, max = 120): string {
  const m = maskPersonal(v);
  const n = neutralizeCell(m);
  return [...n].length > max ? `${[...n].slice(0, max).join("")}…` : n;
}

// ───────────────────────── วันที่ · เงิน ─────────────────────────
const pad2 = (n: number) => String(n).padStart(2, "0");
const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
const dim = (y: number, m: number) => [31, isLeap(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
function ymd(y: number, m: number, d: number): string | null {
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return null;
  if (y < 1900 || y > 2200 || m < 1 || m > 12 || d < 1 || d > dim(y, m)) return null;
  return `${y}-${pad2(m)}-${pad2(d)}`;
}
/** "1/5/69" · "01/05/2569" (พ.ศ.) · ISO · ตัวเลข Excel serial (20000–80000 · ระบบ 1900) ⇒ "YYYY-MM-DD" · ผิด/วันไม่มีจริง ⇒ null */
export function parseThaiDate(v: string, fmt: "BE_DMY" | "CE_DMY" | "ISO" = "BE_DMY"): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  if (!s || looksFormula(s)) return null;
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (iso) {
    const y = Number(iso[1]);
    return ymd(y >= 2400 ? y - 543 : y, Number(iso[2]), Number(iso[3]));
  }
  if (fmt === "ISO") return null;
  if (/^\d{5}(\.\d+)?$/.test(s)) {
    const n = Math.floor(Number(s));
    if (n < 20000 || n > 80000) return null;
    return new Date(Date.UTC(1899, 11, 30) + n * 86_400_000).toISOString().slice(0, 10);
  }
  const m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(s);
  if (!m) return null;
  const d = Number(m[1]);
  const mo = Number(m[2]);
  let y = Number(m[3]);
  if (fmt === "BE_DMY") {
    if (m[3].length === 2) y = 2500 + y - 543;
    else y = y >= 2400 ? y - 543 : y;
  } else {
    if (m[3].length === 2) y = 2000 + y;
    else if (y >= 2400) y -= 543;
  }
  return ymd(y, mo, d);
}
/** "4500" · "4,500" · "฿4,500.50" · "4500.00 บาท" ⇒ สตางค์ · ว่าง/ติดลบ/ทศนิยม > 2/สูตร/ขยะ ⇒ null */
export function parseMoneySatang(v: string): number | null {
  const raw = typeof v === "string" ? v.trim() : "";
  if (!raw || looksFormula(raw)) return null;
  if (raw.length > 64) return null; // Y1 ▸ เงินจริงไม่ยาวเกินนี้ — กัน `\s*(บาท…)$` ย้อนรอยกำลังสองบนช่องว่างยาว ◂
  const s = raw.replace(/^฿\s*/, "").replace(/\s*(บาท|thb|baht)\.?$/i, "").replace(/,/g, "").trim();
  const m = /^(\d{1,9})(?:\.(\d{1,2}))?$/.exec(s);
  if (!m) return null;
  const satang = Number(m[1]) * 100 + (m[2] ? Number(m[2].padEnd(2, "0")) : 0);
  return Number.isSafeInteger(satang) && satang <= 1_000_000_000 ? satang : null;
}

// ───────────────────────── เดาคอลัมน์จากหัว (ตรงชื่อพ้องเท่านั้น) ─────────────────────────
const normHead = (s: string) => s.normalize("NFC").trim().toLowerCase().replace(/\s+/g, " ");
const squash = (s: string) => normHead(s).replace(/[\s_\-.:]/g, "");
/** หัวคอลัมน์ ⇒ แมปปิ้ง (ตรงชื่อพ้อง หรือคำแรกตรง เช่น "ไฟ ก.ย.") · LINE ⇒ IGNORE · คอลัมน์ที่ไม่ตรงไม่อยู่ในผล */
export function headerGuess(headers: string[]): ImportMapping {
  const out: ImportMapping = {};
  const used = new Set<ImportFieldKey>();
  const hs = Array.isArray(headers) ? headers.map((h) => (typeof h === "string" ? h : "")) : [];
  const exact = (h: string, aliases: string[]) => aliases.some((a) => squash(a) === squash(h));
  const firstWord = (h: string, aliases: string[]) => {
    const w = normHead(h).split(" ")[0] ?? "";
    return !!w && w !== normHead(h) && aliases.some((a) => squash(a) === squash(w));
  };
  // รอบ 1 ตรงทั้งคำ · รอบ 2 คำแรก
  for (const pass of [exact, firstWord]) {
    hs.forEach((h, i) => {
      const k = String(i);
      if (out[k] !== undefined || !h.trim()) return;
      if (pass(h, IGNORE_ALIASES)) {
        out[k] = "IGNORE";
        return;
      }
      const f = IMPORT_FIELDS.find((x) => !used.has(x.key) && pass(h, x.aliases));
      if (f) {
        out[k] = f.key;
        used.add(f.key);
      }
    });
  }
  const sorted: ImportMapping = {};
  for (const k of Object.keys(out).sort((a, b) => Number(a) - Number(b))) sorted[k] = out[k];
  return sorted;
}

// ───────────────────────── CSV ─────────────────────────
function csvField(v: string): string {
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}
/** บรรทัด CSV ที่ปลอดภัย (ทุกช่องผ่าน neutralizeCell ก่อนครอบ quote) — ผู้เรียกฝั่ง server ใช้ csvRow ของ core/csv ทับได้ */
export function safeCsvLine(cells: readonly string[]): string {
  return cells.map((c) => csvField(neutralizeCell(c))).join(",");
}
/** แม่แบบ CSV (BOM + หัว 11 คอลัมน์ตามภาพ 12 + ตัวอย่าง 2 แถว) */
export function importTemplateCsv(): string {
  const rows = [
    ["ห้อง", "ชื่อผู้เช่า", "โทร", "เข้าอยู่", "ค่าเช่า", "ประกัน", "ไฟ", "น้ำ", "ค้าง", "LINE", "หมายเหตุ"],
    ["101", "สมชาย ใจดี", "081-234-5678", "1/5/69", "4500", "9000", "1287", "312", "", "", "ห้องมุม"],
    ["102", "", "", "", "4500", "", "1340", "298", "", "", "ห้องว่าง"],
  ];
  return `﻿${rows.map(safeCsvLine).join("\r\n")}\r\n`;
}

function tokenizeCsv(text: string, delim: string): string[][] {
  const records: string[][] = [];
  let field = "";
  let record: string[] = [];
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQ = false;
      } else field += ch;
      continue;
    }
    if (ch === '"' && field === "") inQ = true;
    else if (ch === delim) {
      record.push(field);
      field = "";
    } else if (ch === "\r") {
      if (text[i + 1] !== "\n") {
        record.push(field);
        records.push(record);
        field = "";
        record = [];
      }
    } else if (ch === "\n") {
      record.push(field);
      records.push(record);
      field = "";
      record = [];
    } else field += ch;
  }
  record.push(field);
  records.push(record);
  return records;
}

function decodeText(b: Uint8Array): { text: string; encoding: "utf-8" | "utf-16le" | "windows-874" } | null {
  if (b.length >= 2 && b[0] === 0xff && b[1] === 0xfe) return { text: new TextDecoder("utf-16le").decode(b.subarray(2)), encoding: "utf-16le" };
  if (b.length >= 3 && b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) {
    try {
      return { text: new TextDecoder("utf-8", { fatal: true }).decode(b.subarray(3)), encoding: "utf-8" };
    } catch {
      return null;
    }
  }
  if (b.includes(0)) return null;
  try {
    return { text: new TextDecoder("utf-8", { fatal: true }).decode(b), encoding: "utf-8" };
  } catch {
    return { text: new TextDecoder("windows-874").decode(b), encoding: "windows-874" };
  }
}

/** ตาราง (แถวดิบ) ⇒ หัว + แถวข้อมูล (แถวแรกที่ไม่ว่าง = หัว · แถวว่างล้วนถูกตัด · ทุกแถวยาวเท่าหัว) */
function tableOf(records: string[][]): { headers: string[]; rows: string[][] } {
  const nonEmpty = records.filter((r) => r.some((c) => c.trim() !== ""));
  if (!nonEmpty.length) return { headers: [], rows: [] };
  const width = nonEmpty.reduce((w, r) => {
    let last = r.length;
    while (last > 0 && r[last - 1].trim() === "") last--;
    return Math.max(w, last);
  }, 0);
  const fit = (r: string[]) => Array.from({ length: width }, (_, i) => r[i] ?? "");
  const [h, ...rows] = nonEmpty;
  return { headers: fit(h).map((x) => x.trim()), rows: rows.map(fit) };
}

// ───────────────────────── ZIP / XLSX ─────────────────────────
type ZipEntry = { name: string; method: number; flags: number; csize: number; usize: number; offset: number };
class ZipStop extends Error {
  constructor(public readonly fail: ParseFail) {
    super(fail.code);
  }
}
const u16 = (b: Uint8Array, o: number) => b[o] | (b[o + 1] << 8);
const u32 = (b: Uint8Array, o: number) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;

function zipDirectory(b: Uint8Array): ZipEntry[] {
  let eo = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 22 - 65_535); i--) {
    if (b[i] === 0x50 && b[i + 1] === 0x4b && b[i + 2] === 0x05 && b[i + 3] === 0x06) {
      eo = i;
      break;
    }
  }
  if (eo < 0) throw new ZipStop(UNSUPPORTED);
  if (u16(b, eo + 4) !== 0 || u16(b, eo + 6) !== 0) throw new ZipStop(UNSUPPORTED); // แยกไฟล์หลายแผ่น
  const n = u16(b, eo + 10);
  const cdOff = u32(b, eo + 16);
  if (n === 0xffff || cdOff === 0xffffffff) throw new ZipStop(UNSUPPORTED); // zip64
  if (n > ZIP_MAX_ENTRIES) throw new ZipStop(UNSAFE);
  const out: ZipEntry[] = [];
  let p = cdOff;
  const dec = new TextDecoder("utf-8");
  for (let i = 0; i < n; i++) {
    if (p + 46 > b.length || u32(b, p) !== 0x02014b50) throw new ZipStop(UNSUPPORTED);
    const flags = u16(b, p + 8);
    const method = u16(b, p + 10);
    const csize = u32(b, p + 20);
    const usize = u32(b, p + 24);
    const nl = u16(b, p + 28);
    const el = u16(b, p + 30);
    const cl = u16(b, p + 32);
    const offset = u32(b, p + 42);
    if (csize === 0xffffffff || usize === 0xffffffff || offset === 0xffffffff) throw new ZipStop(UNSUPPORTED);
    out.push({ name: dec.decode(b.subarray(p + 46, p + 46 + nl)), method, flags, csize, usize, offset });
    p += 46 + nl + el + cl;
  }
  return out;
}

class ZipReader {
  private used = 0;
  private readonly byName = new Map<string, ZipEntry>();
  constructor(
    private readonly b: Uint8Array,
    entries: ZipEntry[],
    private readonly cap: number,
  ) {
    for (const e of entries) this.byName.set(e.name.replace(/^\/+/, ""), e);
    if (entries.reduce((s, e) => s + e.usize, 0) > cap) throw new ZipStop(UNSAFE);
  }
  has(name: string) {
    return this.byName.has(name);
  }
  read(name: string): string | null {
    const e = this.byName.get(name);
    if (!e) return null;
    if (e.flags & 0x1) throw new ZipStop(UNSUPPORTED); // เข้ารหัส
    const b = this.b;
    if (e.offset + 30 > b.length || u32(b, e.offset) !== 0x04034b50) throw new ZipStop(UNSUPPORTED);
    const start = e.offset + 30 + u16(b, e.offset + 26) + u16(b, e.offset + 28);
    const comp = b.subarray(start, start + e.csize);
    const left = this.cap - this.used;
    let data: Uint8Array;
    if (e.method === 0) data = comp;
    else if (e.method === 8) {
      try {
        data = inflateRawSync(comp, { maxOutputLength: Math.max(1, left) });
      } catch (err) {
        if (err instanceof RangeError || (err as { code?: string })?.code === "ERR_BUFFER_TOO_LARGE") throw new ZipStop(UNSAFE);
        throw new ZipStop(UNSUPPORTED);
      }
    } else throw new ZipStop(UNSUPPORTED);
    this.used += data.length;
    if (this.used > this.cap) throw new ZipStop(UNSAFE);
    return new TextDecoder("utf-8").decode(data);
  }
}

/** ถอด entity 5 ตัว + &#n; &#xh; (อื่น ๆ คงเดิม — ไม่ขยาย entity ที่ประกาศใน DTD) */
function xmlText(s: string): string {
  return s.replace(/&(amp|lt|gt|quot|apos|#\d{1,7}|#x[0-9a-fA-F]{1,6});/g, (m, e: string) => {
    if (e === "amp") return "&";
    if (e === "lt") return "<";
    if (e === "gt") return ">";
    if (e === "quot") return '"';
    if (e === "apos") return "'";
    const cp = e[1] === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
    return cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : m;
  });
}
/** Y1 ▸ แท็กเปิดยาวเกินนี้ (ไบต์/ตัวอักษร) ⇒ UNSAFE ก่อนอ่าน attribute — ไฟล์จริงไม่มีแท็กเซลล์/แถว/ชีต/Relationship ยาวถึง 1 KB ◂ */
const MAX_TAG = 1024;
/** แท็กเปิด [a, gt] ยาวเกิน MAX_TAG ⇒ UNSAFE */
const tagGuard = (a: number, gt: number) => {
  if (gt - a + 1 > MAX_TAG) throw new ZipStop(UNSAFE);
};
/** attribute ของแท็กเปิด (สั้นกว่า MAX_TAG เสมอ — ยาวกว่า ⇒ UNSAFE ก่อนเข้า regex · กันย้อนรอยกำลังสอง) */
function attrsOf(tag: string): Record<string, string> {
  if (tag.length > MAX_TAG) throw new ZipStop(UNSAFE);
  const out: Record<string, string> = {};
  for (const m of tag.matchAll(/([A-Za-z_][\w:.-]*)\s*=\s*("([^"]*)"|'([^']*)')/g)) out[m[1]] = xmlText(m[3] ?? m[4] ?? "");
  return out;
}
/** ข้อความในทุก <t>…</t> ของ fragment (รวม rich text run) — ผู้เรียกส่งเฉพาะช่วงของเซลล์/รายการ (ค้นไม่เลยขอบ ⇒ เชิงเส้นรวมทั้งไฟล์) · แท็กไม่ปิด ⇒ UNSAFE */
function textRunsIn(frag: string): string {
  let out = "";
  let p = 0;
  for (;;) {
    const a = frag.indexOf("<t", p);
    if (a < 0) return out;
    const ch = frag.charCodeAt(a + 2);
    if (ch !== 62 /* > */ && ch !== 32 && ch !== 47 /* / */ && ch !== 9 && ch !== 10 && ch !== 13) {
      p = a + 2;
      continue;
    }
    const gt = frag.indexOf(">", a);
    if (gt < 0) throw new ZipStop(UNSAFE);
    tagGuard(a, gt);
    if (frag.charCodeAt(gt - 1) === 47) {
      p = gt + 1;
      continue;
    }
    const close = frag.indexOf("</t>", gt);
    if (close < 0) throw new ZipStop(UNSAFE);
    out += xmlText(frag.slice(gt + 1, close));
    p = close + 4;
  }
}
const colIndex = (ref: string): number => {
  const letters = /^([A-Z]{1,3})/.exec(ref)?.[1] ?? "";
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
};
/** แท็กเปิดที่ตำแหน่ง a ชื่อ name (ตามด้วยช่องว่าง/>//) */
const isTag = (xml: string, a: number, name: string) => {
  const c = xml.charCodeAt(a + 1 + name.length);
  return c === 62 || c === 32 || c === 47 || c === 9 || c === 10 || c === 13;
};
/** sharedStrings: <si>…</si> ทีละรายการ (สแกนเชิงเส้น · ไม่ปิด ⇒ UNSAFE) */
function sharedStrings(xml: string, budget: { chars: number }): string[] {
  const out: string[] = [];
  let p = 0;
  for (;;) {
    const a = xml.indexOf("<si", p);
    if (a < 0) return out;
    if (!isTag(xml, a, "si")) {
      p = a + 3;
      continue;
    }
    const gt = xml.indexOf(">", a);
    if (gt < 0) throw new ZipStop(UNSAFE);
    tagGuard(a, gt);
    if (xml.charCodeAt(gt - 1) === 47) {
      out.push("");
      p = gt + 1;
      continue;
    }
    const close = xml.indexOf("</si>", gt);
    if (close < 0) throw new ZipStop(UNSAFE);
    const t = textRunsIn(xml.slice(gt + 1, close));
    budget.chars -= t.length;
    if (budget.chars < 0) throw new ZipStop(UNSAFE);
    out.push(t);
    p = close + 5;
  }
}
type SheetScan = { headers: string[]; rows: string[][]; dataRows: number };
/**
 * แยกชีตด้วยการสแกนเชิงเส้น (indexOf · ไม่มี regex ย้อนรอย): แถวแรกที่ไม่ว่าง = หัว · แถวว่างล้วนถูกตัด
 *   strict (ชีตที่เลือก): แถวข้อมูล > maxRows ⇒ TOO_MANY_ROWS ทันที · ค่าในคอลัมน์ที่ > 60 ⇒ TOO_MANY_COLUMNS · ตัวอักษรรวม > งบ ⇒ UNSAFE
 *   ไม่ strict (ชีตอื่น): นับแถวอย่างเดียว (หยุดที่ maxRows + 1)
 */
function scanSheet(xml: string, sst: string[], strict: boolean, maxRows: number, budget: { chars: number }): SheetScan | ParseFail {
  const records: string[][] = [];
  let dataRows = 0;
  let width = 0;
  let p = 0;
  for (;;) {
    const a = xml.indexOf("<row", p);
    if (a < 0) break;
    if (!isTag(xml, a, "row")) {
      p = a + 4;
      continue;
    }
    const gt = xml.indexOf(">", a);
    if (gt < 0) throw new ZipStop(UNSAFE);
    tagGuard(a, gt);
    if (xml.charCodeAt(gt - 1) === 47) {
      p = gt + 1;
      continue;
    }
    const end = xml.indexOf("</row>", gt);
    if (end < 0) throw new ZipStop(UNSAFE);
    // ── เซลล์ในแถว (ค้นเฉพาะใน body ของแถว/เซลล์ — ไม่ค้นเลยขอบ ⇒ เชิงเส้นรวมทั้งไฟล์) ──
    const body = xml.slice(gt + 1, end);
    const row: string[] = [];
    let next = 0;
    let any = false;
    let q = 0;
    for (;;) {
      const c = body.indexOf("<c", q);
      if (c < 0) break;
      if (!isTag(body, c, "c")) {
        q = c + 2;
        continue;
      }
      const cg = body.indexOf(">", c);
      if (cg < 0) throw new ZipStop(UNSAFE);
      tagGuard(c, cg);
      const a2 = attrsOf(body.slice(c, cg + 1));
      const idx = a2.r ? colIndex(a2.r) : next;
      next = idx + 1;
      if (body.charCodeAt(cg - 1) === 47) {
        q = cg + 1;
        continue; // เซลล์ว่าง — ไม่เติมช่อง
      }
      const ce = body.indexOf("</c>", cg);
      if (ce < 0) throw new ZipStop(UNSAFE);
      const cell = body.slice(cg + 1, ce);
      let val = "";
      const vA = cell.indexOf("<v>");
      let vRaw: string | undefined;
      if (vA >= 0) {
        const vB = cell.indexOf("</v>", vA);
        if (vB < 0) throw new ZipStop(UNSAFE);
        vRaw = cell.slice(vA + 3, vB);
      }
      if (a2.t === "s") val = vRaw !== undefined ? (sst[Number(vRaw)] ?? "") : "";
      else if (a2.t === "inlineStr") val = textRunsIn(cell);
      else if (a2.t === "b") val = vRaw === "1" ? "TRUE" : vRaw === "0" ? "FALSE" : "";
      else if (a2.t === "str" || a2.t === "e") val = vRaw !== undefined ? xmlText(vRaw) : "";
      else if (vRaw !== undefined) {
        const t = xmlText(vRaw).trim();
        const n = Number(t);
        val = t !== "" && Number.isFinite(n) && !/e/i.test(String(n)) ? String(n) : t;
      }
      q = ce + 4;
      if (val === "" || idx < 0) continue;
      if (idx >= IMPORT_MAX_COLUMNS) {
        if (strict) return TOO_MANY_COLS;
        continue;
      }
      if (strict) {
        budget.chars -= val.length;
        if (budget.chars < 0) throw new ZipStop(UNSAFE);
        while (row.length < idx) row.push("");
        row[idx] = val;
      }
      if (val.trim() !== "") any = true;
    }
    p = end + 6;
    if (!any) continue;
    if (!strict) dataRows++;
    if (strict) {
      if (records.length > 0 && records.length > maxRows) return tooManyRows(maxRows);
      let last = row.length;
      while (last > 0 && (row[last - 1] ?? "").trim() === "") last--;
      width = Math.max(width, last);
      records.push(row);
    } else if (dataRows > maxRows + 1) break;
  }
  if (!strict) return { headers: [], rows: [], dataRows: Math.max(0, dataRows - 1) };
  if (!records.length) return { headers: [], rows: [], dataRows: 0 };
  const fit = (r: string[]) => Array.from({ length: width }, (_, i) => r[i] ?? "");
  const [h, ...rows] = records;
  return { headers: fit(h).map((x) => x.trim()), rows: rows.map(fit), dataRows: rows.length };
}

/** Y1 ▸ แท็กเปิดชื่อ name ทุกตัว (สแกน indexOf ทีละแท็ก · ไม่มี regex) — ไม่มี `>` ปิด หรือยาวเกิน MAX_TAG ⇒ UNSAFE ◂ */
function openTags(xml: string, name: string): string[] {
  const out: string[] = [];
  const open = `<${name}`;
  let p = 0;
  for (;;) {
    const a = xml.indexOf(open, p);
    if (a < 0) return out;
    if (!isTag(xml, a, name)) {
      p = a + open.length;
      continue;
    }
    const gt = xml.indexOf(">", a);
    if (gt < 0) throw new ZipStop(UNSAFE);
    tagGuard(a, gt);
    out.push(xml.slice(a, gt + 1));
    p = gt + 1;
  }
}

function parseXlsx(b: Uint8Array, sheetName: string | null, cap: number, maxRows: number, maxChars: number): ParsedImportFile | ParseFail {
  const z = new ZipReader(b, zipDirectory(b), cap);
  if (!z.has("xl/workbook.xml")) return UNSUPPORTED;
  const wb = z.read("xl/workbook.xml") ?? "";
  const rels = z.read("xl/_rels/workbook.xml.rels") ?? "";
  const target = new Map<string, string>();
  for (const tag of openTags(rels, "Relationship")) {
    const a = attrsOf(tag);
    if (a.Id && a.Target) target.set(a.Id, a.Target.startsWith("/") ? a.Target.slice(1) : `xl/${a.Target}`.replace(/\/\.\//g, "/"));
  }
  const sheetDefs: { name: string; path: string }[] = [];
  for (const tag of openTags(wb, "sheet")) {
    const a = attrsOf(tag);
    const rid = a["r:id"] ?? Object.entries(a).find(([k]) => /:id$/.test(k))?.[1] ?? "";
    const path = target.get(rid) ?? "";
    if (a.name && path) sheetDefs.push({ name: a.name, path });
  }
  if (!sheetDefs.length) return UNSUPPORTED;
  const pickIdx = sheetName ? sheetDefs.findIndex((d) => d.name === sheetName) : 0;
  if (pickIdx < 0) return { ok: false, code: "SHEET_NOT_FOUND", reason: "ไม่พบชีตที่เลือกในไฟล์นี้ — เลือกชีตใหม่" };
  const budget = { chars: maxChars };
  const sst = z.has("xl/sharedStrings.xml") ? sharedStrings(z.read("xl/sharedStrings.xml") ?? "", budget) : [];
  const counts: { name: string; rowCount: number }[] = [];
  let pick: SheetScan | null = null;
  for (let i = 0; i < sheetDefs.length; i++) {
    const r = scanSheet(z.read(sheetDefs[i].path) ?? "", sst, i === pickIdx, maxRows, budget);
    if ("ok" in r) return r;
    if (i === pickIdx) pick = r;
    counts.push({ name: sheetDefs[i].name, rowCount: r.dataRows });
  }
  if (!pick || !pick.headers.length || !pick.rows.length) return EMPTY;
  if (pick.headers.length > IMPORT_MAX_COLUMNS) return TOO_MANY_COLS;
  return { ok: true, format: "XLSX", encoding: "xlsx", sheet: sheetDefs[pickIdx].name, sheets: counts, headers: pick.headers, rows: pick.rows };
}

/** อ่านไฟล์นำเข้า (ตัดสินจากไบต์) — ไม่ throw · ไม่จองหน่วยความจำเกินเพดาน */
export function parseImportFile(data: Uint8Array, opts?: { sheet?: string | null; maxUnzippedBytes?: number; maxRows?: number; maxChars?: number }): ParsedImportFile | ParseFail {
  try {
    if (!(data instanceof Uint8Array) || data.length === 0) return EMPTY;
    const b = data;
    const cap = typeof opts?.maxUnzippedBytes === "number" && opts.maxUnzippedBytes > 0 ? Math.min(opts.maxUnzippedBytes, 40_000_000) : DEFAULT_MAX_UNZIPPED;
    const sheet = typeof opts?.sheet === "string" && opts.sheet.trim() ? opts.sheet.trim() : null;
    const maxRows = typeof opts?.maxRows === "number" && opts.maxRows > 0 ? Math.min(opts.maxRows, HARD_MAX_ROWS) : HARD_MAX_ROWS;
    const maxChars = typeof opts?.maxChars === "number" && opts.maxChars > 0 ? Math.min(opts.maxChars, DEFAULT_MAX_CHARS) : DEFAULT_MAX_CHARS;
    if (b.length >= 4 && b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04) return parseXlsx(b, sheet, cap, maxRows, maxChars);
    if (b.length >= 4 && b[0] === 0x50 && b[1] === 0x4b) return UNSUPPORTED;
    if (b.length >= 4 && b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0) return UNSUPPORTED;
    if (b.length >= 5 && String.fromCharCode(b[0], b[1], b[2], b[3], b[4]) === "%PDF-") return UNSUPPORTED;
    const dec = decodeText(b);
    if (!dec) return UNSUPPORTED;
    const text = dec.text.replace(/^﻿/, "");
    if (!text.trim()) return EMPTY;
    if (sheet && sheet !== "CSV") return { ok: false, code: "SHEET_NOT_FOUND", reason: "ไฟล์ CSV มีชีตเดียว — ไม่ต้องเลือกชีต" };
    const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
    const delim = firstLine.includes("\t") ? "\t" : ",";
    const t = tableOf(tokenizeCsv(text, delim));
    if (!t.headers.length || !t.rows.length) return EMPTY;
    if (t.headers.length > IMPORT_MAX_COLUMNS) return TOO_MANY_COLS;
    if (t.rows.length > maxRows) return tooManyRows(maxRows);
    return { ok: true, format: "CSV", encoding: dec.encoding, sheet: "CSV", sheets: [{ name: "CSV", rowCount: t.rows.length }], headers: t.headers, rows: t.rows };
  } catch (e) {
    if (e instanceof ZipStop) return e.fail;
    return UNSUPPORTED;
  }
}
