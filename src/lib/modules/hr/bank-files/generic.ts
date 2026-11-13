// HR H3.5 ▸ ไฟล์ทั่วไป CSV/XLSX ตามชุดคอลัมน์ของร้าน (pure) — brief R8 (สัญญาของเราเอง ไม่ใช่รูปแบบธนาคาร)
//   ใช้ได้กับทุกธนาคาร: ร้านคัดลอกไปวางในแม่แบบของธนาคารเอง · ชุดในตัว GENERIC / KTB_BUSINESS = คอลัมน์ของเวกเตอร์ G5A/G7
//   KTB_BUSINESS: ชื่อ/รหัสคอลัมน์ [V] (คู่มือ Krungthai Business Bulk Payroll) · ลำดับคอลัมน์และตำแหน่งยอดเงิน [U] — ร้านตรวจกับ Bulk_Payroll.xls
//   CSV: "," · CRLF ทุกบรรทัด · ใส่ "…" เมื่อมี , " CR LF หรือช่องว่างหัว/ท้าย · เซลล์ขึ้นต้น = + - @ ⇒ ปฏิเสธ (FORMULA — ไม่แก้ให้เงียบ ๆ) ◂
import { encodable, singleByte, utf8, concat } from "./encode";

export const GENERIC_FIELDS = ["seq", "employeeCode", "employeeName", "payeeName", "bankName", "bankCode", "accountNo", "amount", "effectiveDate", "paymentRef", "blank"] as const;
export type GenericField = (typeof GENERIC_FIELDS)[number];
export const AMOUNT_STYLES = ["BAHT_2DP", "SATANG"] as const;
export const DATE_STYLES = ["ISO_CE", "DMY_CE", "DMY_BE"] as const;
export const CSV_ENCODINGS = ["UTF8_BOM", "TIS620"] as const;
export const GENERIC_MAX_COLUMNS = 30;
export const GENERIC_HEADER_MAX = 60;
export const GENERIC_CONST_MAX = 40;

export type GenericSpec = {
  columns: [string, string][];
  includeHeader: boolean;
  includeSummary: boolean;
  amountStyle: (typeof AMOUNT_STYLES)[number];
  dateStyle: (typeof DATE_STYLES)[number];
  encoding: (typeof CSV_ENCODINGS)[number];
};

/** ชุดในตัว (ค่าคงที่ในโค้ด — ไม่มีแถวในฐาน) */
export const BANK_PRESETS: Record<"GENERIC" | "KTB_BUSINESS", GenericSpec> = {
  GENERIC: {
    columns: [
      ["seq", "ลำดับ"],
      ["employeeCode", "รหัสพนักงาน"],
      ["payeeName", "ชื่อบัญชี"],
      ["bankCode", "รหัสธนาคาร"],
      ["bankName", "ธนาคาร"],
      ["accountNo", "เลขที่บัญชี"],
      ["amount", "จำนวนเงิน"],
      ["effectiveDate", "วันที่โอน"],
      ["paymentRef", "อ้างอิง"],
    ],
    includeHeader: true,
    includeSummary: false,
    amountStyle: "BAHT_2DP",
    dateStyle: "ISO_CE",
    encoding: "UTF8_BOM",
  },
  KTB_BUSINESS: {
    columns: [
      ["const:10", "File Type"],
      ["const:D", "Record Type"],
      ["blank", "Batch No."],
      ["paymentRef", "Payment Reference No."],
      ["blank", "Bulk Service Type"],
      ["bankCode", "Payee Bank ID"],
      ["blank", "Payee Branch Code"],
      ["blank", "PromptPay Type"],
      ["accountNo", "Payee Account No."],
      ["payeeName", "Payee Name"],
      ["const:N", "WHT Flag"],
      ["effectiveDate", "Effective Date"],
      ["const:01", "Service Type"],
      ["blank", "Fee Payer"],
      ["amount", "Amount"],
    ],
    includeHeader: true,
    includeSummary: false,
    amountStyle: "BAHT_2DP",
    dateStyle: "DMY_CE",
    encoding: "UTF8_BOM",
  },
};
export const isPresetKey = (k: unknown): k is keyof typeof BANK_PRESETS => k === "GENERIC" || k === "KTB_BUSINESS";

const CONTROL = /[\u0000-\u001f\u007f]/;
/** เซลล์ที่โปรแกรมตารางอาจอ่านเป็นสูตร — HR H3.5 fix r1 ▸ F4: ดูอักขระแรกหลังตัดช่องว่าง/อักขระควบคุมด้านหน้า · ขึ้นต้นด้วย tab/CR = ปฏิเสธเลย (OWASP CSV injection) ◂ */
export const formulaLike = (s: string) => /^[\t\r]/.test(s) || /^[=+\-@]/.test(s.replace(/^[\s\u0000-\u001f\u007f]+/, ""));

/** ตรวจคอลัมน์หนึ่งคู่ [field, header] — null = ใช้ได้ · อื่น ๆ = เหตุ */
export function columnProblem(col: unknown, encoding: GenericSpec["encoding"] | null): string | null {
  if (!Array.isArray(col) || col.length !== 2 || typeof col[0] !== "string" || typeof col[1] !== "string") return "shape";
  const [field, header] = col as [string, string];
  if (header.length > GENERIC_HEADER_MAX || CONTROL.test(header) || formulaLike(header)) return "header";
  if (encoding === "TIS620" && !encodable(header, "TIS620")) return "header";
  if (field.startsWith("const:")) {
    const v = field.slice(6);
    if (v.length < 1 || v.length > GENERIC_CONST_MAX || CONTROL.test(v) || formulaLike(v) || v.trim() !== v) return "const";
    if (encoding === "TIS620" && !encodable(v, "TIS620")) return "const";
    return null;
  }
  return (GENERIC_FIELDS as readonly string[]).includes(field) ? null : "field";
}

/** ค่าดิบ → GenericSpec ที่ตรวจแล้ว · null = ไม่ถูกต้อง */
export function genericSpecOf(raw: unknown): GenericSpec | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if ("preset" in r) return isPresetKey(r.preset) ? BANK_PRESETS[r.preset] : null;
  const enc = r.encoding === undefined ? "UTF8_BOM" : r.encoding;
  if (!(CSV_ENCODINGS as readonly unknown[]).includes(enc)) return null;
  if (!(AMOUNT_STYLES as readonly unknown[]).includes(r.amountStyle) || !(DATE_STYLES as readonly unknown[]).includes(r.dateStyle)) return null;
  if (typeof r.includeHeader !== "boolean" || typeof r.includeSummary !== "boolean") return null;
  if (!Array.isArray(r.columns) || r.columns.length < 1 || r.columns.length > GENERIC_MAX_COLUMNS) return null;
  if (r.columns.some((c) => columnProblem(c, enc as GenericSpec["encoding"]) !== null)) return null;
  return {
    columns: (r.columns as [string, string][]).map(([f, h]) => [f, h]),
    includeHeader: r.includeHeader,
    includeSummary: r.includeSummary,
    amountStyle: r.amountStyle as GenericSpec["amountStyle"],
    dateStyle: r.dateStyle as GenericSpec["dateStyle"],
    encoding: enc as GenericSpec["encoding"],
  };
}

/** สตางค์ → ข้อความตามรูปแบบ (ไม่มีตัวคั่นหลักพัน) */
export function amountText(satang: number, style: GenericSpec["amountStyle"]): string {
  if (style === "SATANG") return String(satang);
  return `${Math.floor(satang / 100)}.${String(satang % 100).padStart(2, "0")}`;
}
/** "YYYY-MM-DD" → ข้อความตามรูปแบบ */
export function dateText(day: string, style: GenericSpec["dateStyle"]): string {
  const [y, m, d] = day.split("-");
  if (style === "ISO_CE") return day;
  return `${d}/${m}/${style === "DMY_BE" ? Number(y) + 543 : y}`;
}

export type GenericRow = { seq: number; employeeCode: string; employeeName: string; payeeName: string; bankName: string; bankCode: string; accountNo: string; amountSatang: number; paymentRef: string };

export function cellsOf(spec: GenericSpec, r: GenericRow, effectiveDate: string): string[] {
  return spec.columns.map(([f]) => {
    if (f.startsWith("const:")) return f.slice(6);
    switch (f as GenericField) {
      case "seq":
        return String(r.seq);
      case "employeeCode":
        return r.employeeCode;
      case "employeeName":
        return r.employeeName;
      case "payeeName":
        return r.payeeName;
      case "bankName":
        return r.bankName;
      case "bankCode":
        return r.bankCode;
      case "accountNo":
        return r.accountNo;
      case "amount":
        return amountText(r.amountSatang, spec.amountStyle);
      case "effectiveDate":
        return dateText(effectiveDate, spec.dateStyle);
      case "paymentRef":
        return r.paymentRef;
      default:
        return "";
    }
  });
}

/** ตารางทั้งไฟล์: หัว (ถ้าเปิด) + แถว + สรุป 2 แถว (ถ้าเปิด) */
export function tableOf(spec: GenericSpec, body: string[][], count: number, totalSatang: number): string[][] {
  const out: string[][] = [];
  if (spec.includeHeader) out.push(spec.columns.map(([, h]) => h));
  out.push(...body);
  if (spec.includeSummary) out.push(["จำนวนรายการ", String(count)], ["ยอดรวม", amountText(totalSatang, spec.amountStyle)]);
  return out;
}

const csvCell = (s: string) => (/[,"\r\n]/.test(s) || /^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

export function csvBytes(table: string[][], encoding: GenericSpec["encoding"]): Uint8Array {
  const text = table.map((r) => r.map(csvCell).join(",") + "\r\n").join("");
  return encoding === "TIS620" ? singleByte(text) : concat([new Uint8Array([0xef, 0xbb, 0xbf]), utf8(text)]);
}

/** เซลล์นี้เขียนลงไฟล์ได้ไหม (CSV TIS-620 = ชุดอักขระ TIS-620 · CR/LF ใส่ในเครื่องหมายคำพูดได้ · XLSX = ไม่มีอักขระควบคุมนอก tab/CR/LF) */
export function cellWritable(s: string, target: "UTF8_BOM" | "TIS620" | "XLSX"): boolean {
  if (target === "TIS620") return encodable(s.replace(/[\r\n]/g, ""), "TIS620");
  // HR H3.5 fix r1 ▸ F4: UTF-8 CSV ปฏิเสธอักขระควบคุมแบบเดียวกับ XLSX (NUL · BEL · ESC · DEL …) + ตัวกลับทิศ U+202A–202E / U+2066–2069 · tab/CR/LF ในเซลล์ยังได้ (อยู่ใน "…") ◂
  return !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u202a-\u202e\u2066-\u2069\ufffe\uffff]|[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/.test(s);
}
