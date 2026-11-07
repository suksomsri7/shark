// SVC H.5 ▸ ของใช้ร่วมของจอบิลระหว่างพัก (folio · เช็กเอาต์ · เงินประกัน · คิวบิลลงห้อง — ภาพ 09 ครึ่งขวา · ใบสั่ง h.5 §4)
//   pure ล้วน: ไม่มี directive · import type เท่านั้น · เงินเป็นสตางค์ Int → บาททศนิยม 2 ตำแหน่ง + จุลภาค · ข้อความไทยทั้งหมด
import type { FolioDto, FolioItemDto, PrepareOk, UnmatchedRow } from "@/lib/modules/hotel";

export type { FolioDto, FolioItemDto, PrepareOk, UnmatchedRow };

/** ผลของ action (ข้อมูล ไม่ throw) */
export type FolioActionResult = { ok: boolean; code?: string; reason?: string; [k: string]: unknown };
export type FolioAction = (input: unknown) => Promise<FolioActionResult>;
export type FolioRunner = () => Promise<FolioActionResult>;
export type FolioActions = {
  post: FolioAction;
  void: FolioAction;
  prepare: FolioAction;
  settle: FolioAction;
  takeSecurity: FolioAction;
  refundSecurity: FolioAction;
  forfeitSecurity: FolioAction;
};

/** สตางค์ → "1,490.00" (ติดลบ = "-100.00") */
export function bahtTh(satang: number): string {
  const n = Number.isFinite(satang) ? Math.trunc(satang) : 0;
  return (n / 100).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
/** "บาท" ที่ผู้ใช้พิมพ์ (มีจุลภาคได้) → สตางค์ · ผิดรูป = null */
export function satangOfInput(text: string): number | null {
  const t = text.replace(/[,\s฿]/g, "");
  if (!/^-?\d+(\.\d{1,2})?$/.test(t)) return null;
  const [i, f = ""] = t.replace("-", "").split(".");
  const v = Number(i) * 100 + Number((f + "00").slice(0, 2));
  return t.startsWith("-") ? -v : v;
}

const MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const DOW = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];
/** เลขวันของ "YYYY-MM-DD" (pure · ไม่พึ่งวันของเครื่อง) */
function dayNo(ymd: string): number {
  const y0 = Number(ymd.slice(0, 4));
  const m = Number(ymd.slice(5, 7));
  const d = Number(ymd.slice(8, 10));
  const y = m <= 2 ? y0 - 1 : y0;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const doy = Math.floor((153 * ((m + 9) % 12) + 2) / 5) + d - 1;
  return era * 146097 + yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy - 719468;
}
/** "ศ. 6 พ.ย." */
export function dayTh(ymd: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return ymd;
  const dow = (((dayNo(ymd) + 4) % 7) + 7) % 7;
  return `${DOW[dow]} ${Number(ymd.slice(8, 10))} ${MONTHS[Number(ymd.slice(5, 7)) - 1] ?? ""}`;
}
/** "7 พ.ย. 19:20" จาก ISO (เวลาไทย) */
export function dateTimeTh(iso: string | null): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const s = new Date(t + 7 * 3_600_000).toISOString();
  return `${Number(s.slice(8, 10))} ${MONTHS[Number(s.slice(5, 7)) - 1] ?? ""} ${s.slice(11, 16)}`;
}

/** ชนิดรายการ → ป้ายไทย */
export const ITEM_TYPE_TH: Record<string, string> = {
  ROOM: "ค่าห้อง",
  SERVICE: "บริการ",
  POS_CHARGE: "ลงห้องจาก POS",
  MINIBAR: "มินิบาร์",
  DISCOUNT: "ส่วนลด",
  TAX: "ภาษีมูลค่าเพิ่ม",
  SERVICE_CHARGE: "ค่าบริการ",
  DEPOSIT: "มัดจำ",
  PAYMENT: "ชำระเงิน",
  REFUND: "คืนเงิน",
  PENALTY: "ค่าปรับ/ค่าเสียหาย",
  SECURITY_DEPOSIT: "เงินประกันห้อง",
  SECURITY_REFUND: "คืนเงินประกันห้อง",
  VOID_REVERSAL: "กลับรายการ",
};
export const FOLIO_STATUS_TH: Record<string, string> = { OPEN: "เปิดอยู่", SETTLED: "ปิดบิลแล้ว", VOID: "ยกเลิกแล้ว" };
export const SECURITY_STATE_TH: Record<string, string> = { NONE: "ยังไม่รับ", HELD: "ถืออยู่ · คืนแยกตอนเช็กเอาต์", REFUNDED: "คืนแล้ว", FORFEITED: "ริบแล้ว (ค่าเสียหาย)" };
/** รายการที่ลงเองได้ (PostItemDialog) */
export const MANUAL_TYPES: { value: "SERVICE" | "MINIBAR" | "PENALTY" | "DISCOUNT"; labelTh: string; managerOnly: boolean }[] = [
  { value: "MINIBAR", labelTh: "มินิบาร์", managerOnly: false },
  { value: "SERVICE", labelTh: "บริการ (ซักรีด · สปา · รถรับส่ง)", managerOnly: false },
  { value: "PENALTY", labelTh: "ค่าปรับ/ค่าเสียหาย", managerOnly: false },
  { value: "DISCOUNT", labelTh: "ส่วนลด (ผู้จัดการ)", managerOnly: true },
];
/** วิธีจ่ายหน้าเคาน์เตอร์ (ภาพ 09: พร้อมเพย์ · บัตร · เงินสด · โอน) */
export const PAY_OPTIONS: { value: "PROMPTPAY" | "CARD" | "CASH" | "TRANSFER"; labelTh: string; subTh: string }[] = [
  { value: "PROMPTPAY", labelTh: "พร้อมเพย์", subTh: "QR ยอดตรง" },
  { value: "CARD", labelTh: "บัตร", subTh: "เครื่อง EDC" },
  { value: "CASH", labelTh: "เงินสด", subTh: "ทอนเงินได้" },
  { value: "TRANSFER", labelTh: "โอน", subTh: "แนบเลขอ้างอิง" },
];
export const PAY_TH: Record<string, string> = { PROMPTPAY: "พร้อมเพย์", CARD: "บัตร", CASH: "เงินสด", TRANSFER: "โอน", DEPOSIT: "มัดจำ" };

/** แถวที่แสดงในกลุ่ม (กลุ่มตามภาพ 09: ค่าห้อง · ลงห้องจาก POS · บริการ/มินิบาร์ · ส่วนลด · ภาษี · เงิน) */
export type FolioGroupKey = "ROOM" | "POS" | "OTHER" | "DISCOUNT" | "TAX" | "MONEY" | "SECURITY";
export const GROUP_TH: Record<FolioGroupKey, string> = {
  ROOM: "ค่าห้อง (ราคาตามวัน)",
  POS: "ลงห้องจาก POS (ไม่ต้องจ่ายที่ละบิล)",
  OTHER: "มินิบาร์ · ซักรีด · บริการ",
  DISCOUNT: "ส่วนลด",
  TAX: "ภาษีและค่าบริการ",
  MONEY: "มัดจำและการชำระ",
  SECURITY: "เงินประกันห้อง (ไม่รวมในยอดชำระ)",
};
const GROUP_OF: Record<string, FolioGroupKey> = {
  ROOM: "ROOM",
  POS_CHARGE: "POS",
  SERVICE: "OTHER",
  MINIBAR: "OTHER",
  PENALTY: "OTHER",
  DISCOUNT: "DISCOUNT",
  TAX: "TAX",
  SERVICE_CHARGE: "TAX",
  DEPOSIT: "MONEY",
  PAYMENT: "MONEY",
  REFUND: "MONEY",
  SECURITY_DEPOSIT: "SECURITY",
  SECURITY_REFUND: "SECURITY",
};
/** จัดกลุ่มแถว (แถวกลับรายการไปอยู่ใต้กลุ่มของแถวเดิม) */
export function groupItems(items: FolioItemDto[]): { key: FolioGroupKey; labelTh: string; items: FolioItemDto[] }[] {
  const byId = new Map(items.map((i) => [i.id, i]));
  const out = new Map<FolioGroupKey, FolioItemDto[]>();
  for (const i of items) {
    const base = i.type === "VOID_REVERSAL" && i.reversalOfId ? (byId.get(i.reversalOfId)?.type ?? "OTHER") : i.type;
    const k = GROUP_OF[base] ?? "OTHER";
    out.set(k, [...(out.get(k) ?? []), i]);
  }
  const order: FolioGroupKey[] = ["ROOM", "POS", "OTHER", "DISCOUNT", "TAX", "MONEY", "SECURITY"];
  return order.filter((k) => out.has(k)).map((k) => ({ key: k, labelTh: GROUP_TH[k], items: out.get(k) ?? [] }));
}
/** ยอดชำระ (ค่าใช้จ่ายที่มีผล + ภาษีแยก) */
export function chargesOf(f: FolioDto): number {
  return f.chargesSatang + f.tax.lines.reduce((s, l) => s + l.amountSatang, 0);
}
/** ป้ายภาษีใต้ยอด (INCLUSIVE ⇒ ราคารวม VAT แล้ว) */
export function taxNoteTh(f: FolioDto): string {
  if (f.tax.mode === "EXCLUSIVE") return `แยกภาษี · ภาษีมูลค่าเพิ่ม ${(f.tax.vatBp / 100).toFixed(2)}%${f.tax.serviceChargeBp ? ` · ค่าบริการ ${(f.tax.serviceChargeBp / 100).toFixed(2)}%` : ""}`;
  return `ราคารวม VAT แล้ว (ภาษี ฿${bahtTh(f.tax.vatIncludedSatang)}) · ขอใบกำกับภาษีเต็มรูปได้`;
}

/** แถวแยกจ่าย (SplitPayEditor) */
export type PayRowDraft = { type: "PROMPTPAY" | "CARD" | "CASH" | "TRANSFER"; amountText: string; tenderedText: string; reference: string };
export const emptyRow = (type: PayRowDraft["type"], amountSatang: number): PayRowDraft => ({ type, amountText: amountSatang > 0 ? (amountSatang / 100).toFixed(2) : "", tenderedText: "", reference: "" });
/** แถวร่าง → payMethods ของ settle + ตรวจยอดรวม · เงินทอน */
export function payMethodsOf(rows: PayRowDraft[], payable: number): { ok: true; payMethods: { type: string; amountSatang: number; cashTenderedSatang?: number; reference?: string }[]; changeSatang: number } | { ok: false; reasonTh: string } {
  const out: { type: string; amountSatang: number; cashTenderedSatang?: number; reference?: string }[] = [];
  let change = 0;
  for (const r of rows) {
    const amt = satangOfInput(r.amountText || "0");
    if (amt === null || amt < 0) return { ok: false, reasonTh: "กรอกยอดแต่ละวิธีจ่ายเป็นตัวเลข (ทศนิยมไม่เกิน 2 ตำแหน่ง)" };
    const row: { type: string; amountSatang: number; cashTenderedSatang?: number; reference?: string } = { type: r.type, amountSatang: amt };
    if (r.type === "CASH" && r.tenderedText.trim()) {
      const t = satangOfInput(r.tenderedText);
      if (t === null || amt > t) return { ok: false, reasonTh: "เงินที่รับมาต้องไม่น้อยกว่ายอดเงินสด" };
      row.cashTenderedSatang = t;
      change += t - amt;
    }
    if (r.reference.trim()) row.reference = r.reference.trim();
    out.push(row);
  }
  const sum = out.reduce((s, x) => s + x.amountSatang, 0);
  if (sum !== payable) return { ok: false, reasonTh: `ยอดรวมทุกวิธีจ่าย ฿${bahtTh(sum)} ต้องเท่ายอดที่ต้องชำระ ฿${bahtTh(payable)}` };
  return { ok: true, payMethods: out, changeSatang: change };
}

/** ข้อความผลเช็กเอาต์ (ภาพ 09 ท้ายการ์ด) */
export const CHECKOUT_DONE_TH = "ปิดเป็นบิล POS 1 ใบ (ต้นทาง HOTEL) → ลงบัญชีอัตโนมัติ · ห้อง → รอทำความสะอาด · ส่งใบเสร็จ";
export const FORFEIT_LABEL_TH = "ริบประกัน";
export const FORFEIT_REASON_TH = "ระบุเหตุผลการริบเงินประกันอย่างน้อย 3 ตัวอักษร";
export const UNMATCHED_TITLE_TH = "บิลลงห้องที่ยังไม่ผูกห้อง";
// ◂ SVC H.5
