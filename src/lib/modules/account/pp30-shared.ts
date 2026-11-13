// ─────────────────────────────────────────────────────────────
// pp30-shared.ts — ช่องของ ภ.พ.30 (ACC T1.3 · pure — ใช้ได้ทั้ง server/client/ข้อสอบ)
//
// ชื่อช่องตาม skill shark-thai-law `common-vat-invoice.md` §19: ยอดขาย · ยอดขายอัตรา 0 · ยอดขายยกเว้น · ภาษีขาย · ยอดซื้อ · ภาษีซื้อ · เครดิตยกมา
// + ม.84 (ภาษีซื้อเกิน = เครดิตยกไปหรือขอคืน) · skill ไม่ให้เลขข้อของแบบทางการ ⇒ ระบบไม่อ้างเลขข้อ
// ทุกยอดเป็นสตางค์ · design note ledger/wo-notes/T1.3.md
// ─────────────────────────────────────────────────────────────

import { PP30_EXCESS_CHOICES, PP30_EXCESS_CHOICE_LABEL_TH, type Pp30ExcessChoice } from "@/lib/core/settings/defs/account";
export { PP30_EXCESS_CHOICES, PP30_EXCESS_CHOICE_LABEL_TH, type Pp30ExcessChoice };

export function isPp30ExcessChoice(v: unknown): v is Pp30ExcessChoice {
  return typeof v === "string" && (PP30_EXCESS_CHOICES as readonly string[]).includes(v);
}

/** ช่องตัวเลขของ ภ.พ.30 (สตางค์) — ลำดับ = ลำดับแสดงบนจอ/พิมพ์/CSV */
export const PP30_LINE_KEYS = [
  "salesTotal",
  "salesZero",
  "salesExempt",
  "salesTaxable",
  "outputVat",
  "purchases",
  "inputVat",
  "taxPayable",
  "taxExcess",
  "creditBroughtForward",
  "netPayable",
  "netExcess",
  "creditCarriedForward",
] as const;
export type Pp30LineKey = (typeof PP30_LINE_KEYS)[number];
export type Pp30Lines = Record<Pp30LineKey, number> & { excessChoice: Pp30ExcessChoice };

export const PP30_LINE_LABEL_TH: Record<Pp30LineKey, string> = {
  salesTotal: "ยอดขายในเดือนนี้ (รวมทุกอัตรา)",
  salesZero: "หัก ยอดขายที่เสียภาษีอัตราร้อยละ 0",
  salesExempt: "หัก ยอดขายที่ได้รับยกเว้น",
  salesTaxable: "ยอดขายที่ต้องเสียภาษี",
  outputVat: "ภาษีขาย",
  purchases: "ยอดซื้อที่มีสิทธินำภาษีซื้อมาหัก",
  inputVat: "ภาษีซื้อ",
  taxPayable: "ภาษีที่ต้องชำระเดือนนี้ (ภาษีขาย > ภาษีซื้อ)",
  taxExcess: "ภาษีที่ชำระเกินเดือนนี้ (ภาษีซื้อ > ภาษีขาย)",
  creditBroughtForward: "เครดิตภาษียกมาจากเดือนก่อน",
  netPayable: "ภาษีสุทธิที่ต้องชำระ",
  netExcess: "ภาษีที่ชำระเกินสุทธิ",
  creditCarriedForward: "เครดิตภาษียกไปเดือนถัดไป",
};

/** ช่องที่เป็นยอดเงิน (มูลค่า) ไม่ใช่ภาษี — จอแสดงในคอลัมน์ "มูลค่า" */
export const PP30_AMOUNT_KEYS: readonly Pp30LineKey[] = ["salesTotal", "salesZero", "salesExempt", "salesTaxable", "purchases"];

/**
 * คิดช่องทั้งหมดจากยอดตั้งต้น — ตัวคิดเดียว (จอ · REST · ภาพที่ยื่น · แบบเพิ่มเติม · ข้อสอบ)
 * salesTaxable/Zero/Exempt = ฐานของรายงานภาษีขาย (T1.1) ตามกลุ่มอัตรา · outputVat/inputVat = ยอดเคลื่อนไหว GL ของบัญชีภาษี (mapping)
 */
export function computePp30Lines(i: {
  salesTaxable: number;
  salesZero: number;
  salesExempt: number;
  outputVat: number;
  purchases: number;
  inputVat: number;
  creditBroughtForward: number;
  excessChoice: Pp30ExcessChoice;
}): Pp30Lines {
  const diff = i.outputVat - i.inputVat;
  const net = diff - i.creditBroughtForward;
  const netExcess = net < 0 ? -net : 0;
  return {
    salesTotal: i.salesTaxable + i.salesZero + i.salesExempt,
    salesZero: i.salesZero,
    salesExempt: i.salesExempt,
    salesTaxable: i.salesTaxable,
    outputVat: i.outputVat,
    purchases: i.purchases,
    inputVat: i.inputVat,
    taxPayable: diff > 0 ? diff : 0,
    taxExcess: diff < 0 ? -diff : 0,
    creditBroughtForward: i.creditBroughtForward,
    netPayable: net > 0 ? net : 0,
    netExcess,
    creditCarriedForward: i.excessChoice === "REFUND" ? 0 : netExcess,
    excessChoice: i.excessChoice,
  };
}

/** ผลต่างต่อช่อง (ใหม่ − เดิม) · ช่องที่เดิมไม่ได้บันทึก (null) = ใช้ค่าใหม่ทั้งค่า */
export function diffPp30Lines(next: Pp30Lines, prev: Partial<Record<Pp30LineKey, number | null>>): Record<Pp30LineKey, number> {
  const out = {} as Record<Pp30LineKey, number>;
  for (const k of PP30_LINE_KEYS) out[k] = next[k] - (prev[k] ?? 0);
  return out;
}

export function pp30HasDiff(d: Record<Pp30LineKey, number>): boolean {
  return PP30_LINE_KEYS.some((k) => d[k] !== 0);
}

/**
 * อ่านช่องที่เก็บไว้ (JSON ของแถวยื่น) — แถวก่อน T1.3 ไม่มี `lines` ⇒ สร้างจากคอลัมน์เดิม (ภาษีขาย/ซื้อ/สุทธิ) ช่องอื่น = null (ไม่ได้บันทึก)
 */
export function storedPp30Lines(
  json: unknown,
  legacy: { salesVatSatang: number; inputVatSatang: number; payableSatang: number },
): Partial<Record<Pp30LineKey, number | null>> & { excessChoice?: Pp30ExcessChoice; legacy: boolean } {
  if (json && typeof json === "object") {
    const o = json as Record<string, unknown>;
    const out: Partial<Record<Pp30LineKey, number | null>> & { excessChoice?: Pp30ExcessChoice; legacy: boolean } = { legacy: false };
    for (const k of PP30_LINE_KEYS) out[k] = typeof o[k] === "number" ? (o[k] as number) : null;
    if (isPp30ExcessChoice(o.excessChoice)) out.excessChoice = o.excessChoice;
    return out;
  }
  const p = legacy.payableSatang;
  return {
    legacy: true,
    outputVat: legacy.salesVatSatang,
    inputVat: legacy.inputVatSatang,
    taxPayable: p > 0 ? p : 0,
    taxExcess: p < 0 ? -p : 0,
    // แถวเดิมไม่มีเครดิตยกมา ⇒ ถือว่าเครดิตยกไป = ส่วนที่ชำระเกิน (ประมาณ — ติดป้าย "แถวก่อน T1.3")
    creditCarriedForward: p < 0 ? -p : 0,
  };
}

export type Pp30CarrySource = "OVERRIDE" | "FILED" | "COMPUTED" | "NONE" | "QUERY";
export const PP30_CARRY_SOURCE_LABEL_TH: Record<Pp30CarrySource, string> = {
  OVERRIDE: "ร้านแก้เอง",
  FILED: "จากแบบที่ยื่นของเดือนก่อน",
  COMPUTED: "ระบบคิดต่อเนื่องจากเดือนก่อน (ยังไม่ได้ทำเครื่องหมายยื่น)",
  NONE: "ไม่มีเครดิตยกมา",
  QUERY: "ค่าที่ใส่ดูชั่วคราว (ไม่บันทึก)",
};

export function prevPeriodKey(k: string): string {
  const [y, m] = k.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}
export function nextPeriodKey(k: string): string {
  const [y, m] = k.split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
}
export function isPp30PeriodKey(k: unknown): k is string {
  return typeof k === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(k);
}
