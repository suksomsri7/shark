// ─────────────────────────────────────────────────────────────
// wht-calc.ts — ตัวคิดหัก ณ ที่จ่ายตัวเดียว (ACC T3.1 · T3.2 · T3.6 · T3.7) · pure (จอ/เซิร์ฟเวอร์/ชุดทดสอบใช้ร่วม)
//
//   ประเภทเงินได้ (รหัสขยาย)  WHT_INCOME_CODES — ม.40(1)–(8) + ข้อย่อยของ ท.ป.4/2528 (โฆษณา · ขนส่ง · รางวัล ฯลฯ — skill §10)
//   ผู้รับ                     whtRecipientOf(contact) — ประเภทผู้ติดต่อ/ประเทศ/ค่าที่ร้านตั้งต่อผู้ติดต่อ
//   ฐาน (T3.2)               docWhtBase — รายบรรทัดก่อน VAT หลังส่วนลด · ใช้ธงรายบรรทัด · ไม่มีธง = เฉพาะบรรทัดบริการ (สินค้าไม่หัก — skill §12)
//                             instalmentWhtBase — งวดจ่ายบางส่วน: สัดส่วนสะสม (ปัดครั้งเดียวต่อยอดสะสม ⇒ รวมทุกงวด = ฐานทั้งใบพอดีถึงสตางค์)
//   ออกภาษีให้ (T3.6)          grossUp — สูตรตามค่าตั้ง (WHT_GROSS_UP_FORMULAS)
//   ขั้นต่ำ (T3.6)             minimumCheck — 1,000 บาทต่อสัญญา (ยอดรวมของสัญญา ไม่ใช่ยอดงวด)
//   คำเตือน                   paymentWhtWarnings — ทะเบียนกลาง (ต่อท้าย warnings.ts) · ไม่บล็อก (มีเฉพาะผู้รับต่างประเทศที่ต้องยืนยันข้อเท็จจริง)
//
// 🔴 ไม่ import db/prisma/next · เงินเป็นสตางค์จำนวนเต็ม · อัตราเป็น basis point
// design notes: ledger/wo-notes/T3.1.md · T3.2.md · T3.6.md · T3.7.md
// ─────────────────────────────────────────────────────────────
import { computeTotals } from "./totals";
import { legalWarning, type LegalWarning } from "@/lib/core/settings/legal/warnings";
import {
  WHT_CONDITION_LABEL_TH,
  WHT_GROSS_UP_FORMULA_LABEL_TH,
  WHT_RECIPIENT_LABEL_TH,
  type WhtCondition,
  type WhtGrossUpFormula,
  type WhtRecipient,
} from "@/lib/core/settings/legal/th-tax-2569";

// ═══════════════ ประเภทเงินได้ (รหัสขยาย) ═══════════════

/** enum ในฐานข้อมูล (ม.40(1)–(8)) */
export type WhtParent = "M40_1" | "M40_2" | "M40_3" | "M40_4" | "M40_5" | "M40_6" | "M40_7" | "M40_8";

export type WhtIncomeCode = {
  code: string;
  /** ม.40 ที่เก็บในคอลัมน์ enum (ข้อย่อยของ ท.ป.4/2528 แมปไปที่ ม.40 ตามลักษณะเงินได้ — ค่าเริ่มของระบบ บันทึกใน T3.1.md) */
  parent: WhtParent;
  labelTh: string;
  /** ข้อของ ท.ป.4/2528 / มาตรา (แสดงบนจอ) */
  clauseTh: string;
};

/**
 * ประเภทเงินได้ที่เลือกได้ในแผงรับ/จ่าย (T3.1) — ลำดับ = ลำดับบนจอ
 *   ข้อย่อยที่เพิ่ม (skill §10 [V]): ค่าโฆษณา (ข้อ 10) · ค่าขนส่ง (ข้อ 12/4) · รางวัล/ส่วนลดส่งเสริมการขาย (ข้อ 12/2) ·
 *   เบี้ยประกันวินาศภัย (ข้อ 12/3) · รางวัลประกวด/ชิงโชค (ข้อ 9(1)) · ค่าแสดงนักแสดงสาธารณะ (ข้อ 9(2)) · เงินปันผล (ข้อ 5)
 */
export const WHT_INCOME_CODES: readonly WhtIncomeCode[] = [
  { code: "M40_8", parent: "M40_8", labelTh: "ค่าบริการ", clauseTh: "ม.40(8) · ท.ป.4/2528 ข้อ 12/1" },
  { code: "M40_7", parent: "M40_7", labelTh: "ค่าจ้างทำของ/รับเหมา", clauseTh: "ม.40(7) · ข้อ 8" },
  { code: "M40_5", parent: "M40_5", labelTh: "ค่าเช่าทรัพย์สิน", clauseTh: "ม.40(5)(ก) · ข้อ 6" },
  { code: "M40_6", parent: "M40_6", labelTh: "ค่าวิชาชีพอิสระ", clauseTh: "ม.40(6) · ข้อ 7" },
  { code: "ADVERTISING", parent: "M40_8", labelTh: "ค่าโฆษณา", clauseTh: "ท.ป.4/2528 ข้อ 10" },
  { code: "TRANSPORT", parent: "M40_8", labelTh: "ค่าขนส่ง", clauseTh: "ท.ป.4/2528 ข้อ 12/4" },
  { code: "PROMOTION", parent: "M40_8", labelTh: "รางวัล/ส่วนลดจากการส่งเสริมการขาย", clauseTh: "ท.ป.4/2528 ข้อ 12/2" },
  { code: "NONLIFE_INSURANCE", parent: "M40_8", labelTh: "เบี้ยประกันวินาศภัย", clauseTh: "ท.ป.4/2528 ข้อ 12/3" },
  { code: "PRIZE", parent: "M40_8", labelTh: "รางวัลประกวด แข่งขัน ชิงโชค", clauseTh: "ท.ป.4/2528 ข้อ 9(1)" },
  { code: "PERFORMER", parent: "M40_8", labelTh: "ค่าแสดงของนักแสดงสาธารณะ", clauseTh: "ท.ป.4/2528 ข้อ 9(2)" },
  { code: "M40_2", parent: "M40_2", labelTh: "ค่านายหน้า/ค่าธรรมเนียม", clauseTh: "ม.40(2) · ข้อ 3/1" },
  { code: "M40_3", parent: "M40_3", labelTh: "ค่าลิขสิทธิ์/goodwill", clauseTh: "ม.40(3) · ข้อ 3/2" },
  { code: "M40_4", parent: "M40_4", labelTh: "ดอกเบี้ย", clauseTh: "ม.40(4)(ก) · ข้อ 4(3)" },
  { code: "DIVIDEND", parent: "M40_4", labelTh: "เงินปันผล/ส่วนแบ่งกำไร", clauseTh: "ม.40(4)(ข) · ข้อ 5" },
  { code: "M40_1", parent: "M40_1", labelTh: "เงินเดือน/ค่าจ้าง", clauseTh: "ม.40(1) · ม.50(1)" },
];

export const DEFAULT_WHT_CODE = "M40_8";

export function whtIncomeCodeOf(code: string | null | undefined): WhtIncomeCode | null {
  return WHT_INCOME_CODES.find((c) => c.code === code) ?? null;
}
/** รหัสขยาย/รหัส enum → enum (ไม่รู้จัก = null) */
export function whtParentOf(code: string | null | undefined): WhtParent | null {
  return whtIncomeCodeOf(code)?.parent ?? null;
}
export const whtCodeLabel = (code: string): string => {
  const c = whtIncomeCodeOf(code);
  return c ? `${c.labelTh} (${c.clauseTh})` : code;
};

// ═══════════════ ผู้รับ ═══════════════

export const WHT_RECIPIENT_CHOICES: readonly WhtRecipient[] = ["JURISTIC_TH", "INDIVIDUAL_TH", "FOUNDATION", "FOREIGN_PE", "FOREIGN"];

/**
 * ผู้รับเงินได้ของผู้ติดต่อ — ค่าที่ร้านตั้งต่อผู้ติดต่อชนะ · ไม่ตั้ง = เดาจากข้อมูล (ค่าเริ่มของระบบ — T3.1.md):
 *   ประเทศ/ประเทศของเลขทะเบียนไม่ใช่ไทย = ต่างประเทศ · บุคคล = บุคคลธรรมดาในไทย · ประเภทนิติบุคคลมีคำว่ามูลนิธิ/สมาคม = มูลนิธิ/สมาคม · อื่น = บริษัท/ห้างฯ ในไทย
 */
export function whtRecipientOf(c: {
  whtRecipient?: string | null;
  legalType?: string | null;
  legalEntityType?: string | null;
  country?: string | null;
  taxIdCountry?: string | null;
} | null | undefined): { recipient: WhtRecipient; assumed: boolean } {
  if (!c) return { recipient: "JURISTIC_TH", assumed: true };
  const o = (WHT_RECIPIENT_CHOICES as readonly string[]).includes(c.whtRecipient ?? "") ? (c.whtRecipient as WhtRecipient) : null;
  if (o) return { recipient: o, assumed: false };
  const foreign = (v: string | null | undefined) => !!v && v.trim() !== "" && v.trim().toUpperCase() !== "TH";
  if (foreign(c.country) || foreign(c.taxIdCountry)) return { recipient: "FOREIGN", assumed: false };
  if (c.legalType === "PERSON") return { recipient: "INDIVIDUAL_TH", assumed: false };
  if (/มูลนิธิ|สมาคม/.test(c.legalEntityType ?? "")) return { recipient: "FOUNDATION", assumed: false };
  return { recipient: "JURISTIC_TH", assumed: false };
}

export const whtRecipientLabel = (r: WhtRecipient): string => WHT_RECIPIENT_LABEL_TH[r];

// ═══════════════ ฐาน (T3.2) ═══════════════

export type WhtBaseLine = {
  /** ฐานบรรทัดตามที่บันทึก (qty×ราคา − ส่วนลดบรรทัด · INCLUDE = รวม VAT) */
  amount: number;
  vatRateBp: number | null;
  /** ธงรายบรรทัด (ฟอร์ม V2) — มีอย่างใดอย่างหนึ่ง = บรรทัดนี้หัก */
  whtIncomeType?: string | null;
  whtRateBp?: number | null;
  whtIncomeCode?: string | null;
  lineKind?: string | null;
};

export type DocWhtBase = {
  /** ฐานทั้งใบที่หักได้ (ก่อน VAT หลังส่วนลดทุกชั้น) */
  base: number;
  /** ใช้ธงรายบรรทัด (true) · ไม่มีธง = ใช้บรรทัดบริการ/ทุกบรรทัด */
  byLineFlags: boolean;
  /** ฐานของบรรทัดสินค้าที่ไม่นับ (แจ้งบนจอ) */
  goodsExcluded: number;
  /** รายประเภทเงินได้ของบรรทัดที่มีธง (code → ฐาน/อัตรา) */
  byCode: { code: string; rateBp: number | null; base: number }[];
  /** ก่อน VAT ทั้งใบ (เทียบ) */
  netAll: number;
};

/**
 * ฐานหัก ณ ที่จ่ายของเอกสาร (skill §12 [V]: ไม่รวม VAT · รายบรรทัด · สินค้าแยกราคาไม่หัก)
 *   1) มีบรรทัดที่ติดธง (ประเภทเงินได้/อัตรา) ⇒ ฐาน = Σ มูลค่าก่อน VAT ของบรรทัดที่ติดธงเท่านั้น
 *   2) ไม่มีธง ⇒ ฐาน = Σ บรรทัดที่ไม่ใช่สินค้า (lineKind GOODS ไม่นับ) — เอกสารเก่าไม่มีชนิดบรรทัด = ทุกบรรทัด
 *   ส่วนลดท้ายบิลกระจายตามสัดส่วน (computeTotals ตัวเดียวกับฟอร์ม)
 */
export function docWhtBase(doc: { lines: readonly WhtBaseLine[]; discountAmount: number; vatMode: "INCLUDE" | "EXCLUDE" | "NONE" | string; vatRateBp?: number }): DocWhtBase {
  const t = computeTotals({
    lines: doc.lines.map((l) => ({ description: "", qty: 1, unitPrice: l.amount, vatRateBp: l.vatRateBp ?? undefined })),
    discountAmount: doc.discountAmount,
    vatMode: (doc.vatMode === "INCLUDE" || doc.vatMode === "EXCLUDE" ? doc.vatMode : "NONE") as "INCLUDE" | "EXCLUDE" | "NONE",
    vatRegistered: doc.vatMode !== "NONE",
    vatRateBp: doc.vatRateBp ?? 0,
  });
  const nets = t.lines.map((b) => b.net);
  const flagged = (l: WhtBaseLine) => !!(l.whtIncomeCode || l.whtIncomeType || (l.whtRateBp ?? 0) > 0);
  const byLineFlags = doc.lines.some(flagged);
  let base = 0;
  let goodsExcluded = 0;
  const byCodeMap = new Map<string, { code: string; rateBp: number | null; base: number }>();
  doc.lines.forEach((l, i) => {
    const n = nets[i] ?? 0;
    if (byLineFlags) {
      if (!flagged(l)) {
        if (l.lineKind === "GOODS") goodsExcluded += n;
        return;
      }
      base += n;
      const code = l.whtIncomeCode || l.whtIncomeType || "";
      const k = `${code}|${l.whtRateBp ?? ""}`;
      const cur = byCodeMap.get(k) ?? { code, rateBp: l.whtRateBp ?? null, base: 0 };
      cur.base += n;
      byCodeMap.set(k, cur);
      return;
    }
    if (l.lineKind === "GOODS") {
      goodsExcluded += n;
      return;
    }
    base += n;
  });
  return { base, byLineFlags, goodsExcluded, byCode: [...byCodeMap.values()], netAll: nets.reduce((a, b) => a + b, 0) };
}

/**
 * ฐานของงวดจ่ายหนึ่ง (จ่ายบางส่วน) — สัดส่วนสะสม: ฐานงวด = ⌊ฐาน × (ตัดหนี้สะสมหลังงวด ÷ ยอดใบ)⌉ − ⌊ฐาน × (ตัดหนี้สะสมก่อนงวด ÷ ยอดใบ)⌉
 *   ปัดเศษเฉพาะยอดสะสม ⇒ งวดทั้งหมดรวมกัน = ฐานทั้งใบพอดี (ไม่มีสตางค์หาย/เกินแม้แบ่งจ่ายกี่งวด) · ตรงกับ 50 ทวิ ของแต่ละงวด
 *   tieOff = เงินที่จ่าย + ภาษีที่หัก (ยอดที่ตัดหนี้) · ยอดใบ ≤ 0 = ฐานเท่ายอดตัดหนี้ (ไม่มีสัดส่วนให้คิด)
 */
export function instalmentWhtBase(fullBase: number, grandTotal: number, paidBefore: number, tieOff: number): number {
  if (grandTotal <= 0) return Math.max(0, tieOff);
  const cum = (paid: number) => Math.round((fullBase * Math.min(Math.max(0, paid), grandTotal)) / grandTotal);
  return Math.max(0, cum(paidBefore + tieOff) - cum(paidBefore));
}

export const whtOf = (base: number, rateBp: number): number => (rateBp > 0 ? Math.round((base * rateBp) / 10000) : 0);

/**
 * แผงจ่าย: ผู้ใช้กรอก "เงินที่จ่าย/รับจริง" (cash) ⇒ หาภาษีของงวดนั้น
 *   tieOff = cash + wht · wht = ฐานงวด(tieOff) × r — แก้สมการ 2 รอบ (ฐานงวดเป็นเส้นตรงตาม tieOff ⇒ รอบที่ 2 นิ่งในระดับสตางค์)
 */
export function whtForCash(cash: number, rateBp: number, fullBase: number, grandTotal: number, paidBefore: number): { wht: number; base: number; tieOff: number } {
  if (rateBp <= 0) return { wht: 0, base: instalmentWhtBase(fullBase, grandTotal, paidBefore, cash), tieOff: cash };
  let wht = 0;
  for (let i = 0; i < 3; i++) {
    const base = instalmentWhtBase(fullBase, grandTotal, paidBefore, cash + wht);
    const next = whtOf(base, rateBp);
    if (next === wht) break;
    wht = next;
  }
  const base = instalmentWhtBase(fullBase, grandTotal, paidBefore, cash + wht);
  return { wht, base, tieOff: cash + wht };
}

/** ตัดหนี้ทั้งก้อนที่เหลือ (ค่าเริ่มของกล่องใหม่): ฐาน = ฐานที่เหลือ · ภาษี = ฐาน × r · เงินจริง = ยอดค้าง − ภาษี */
export function whtForRemaining(remaining: number, rateBp: number, fullBase: number, grandTotal: number, paidBefore: number): { wht: number; base: number; cash: number } {
  const base = instalmentWhtBase(fullBase, grandTotal, paidBefore, remaining);
  const wht = whtOf(base, rateBp);
  return { wht, base, cash: Math.max(0, remaining - wht) };
}

// ═══════════════ ออกภาษีให้ (T3.6) ═══════════════

/**
 * ผู้จ่ายออกภาษีให้ — net = เงินได้ก่อนบวกภาษี (ฐานก่อน VAT ของงวด) · คืนภาษีที่ผู้จ่ายออกแทน + "จำนวนเงินที่จ่าย" บน 50 ทวิ (= net + ภาษี)
 *   สูตรตามค่าตั้ง (skill §13 สูตรทางการไม่พบ [U] · สูตรในวงการ [V2])
 */
export function grossUp(net: number, rateBp: number, formula: WhtGrossUpFormula): { tax: number; income: number } {
  if (rateBp <= 0 || net <= 0) return { tax: 0, income: Math.max(0, net) };
  const r = rateBp / 10000;
  let tax: number;
  if (formula === "GROSS_UP_CONVERGED") tax = Math.round((net * rateBp) / (10000 - rateBp));
  else if (formula === "GROSS_UP_ONE_STEP") tax = Math.round((net + net * r) * r);
  else tax = Math.round(net * r);
  return { tax, income: net + tax };
}

export const grossUpFormulaText = (f: WhtGrossUpFormula) => WHT_GROSS_UP_FORMULA_LABEL_TH[f];
export const whtConditionLabel = (c: WhtCondition) => WHT_CONDITION_LABEL_TH[c];

// ═══════════════ ขั้นต่ำ 1,000 (T3.6) ═══════════════

/**
 * ขั้นต่ำต่อสัญญา (ท.ป.4/2528 ข้อ 12/7 [V]) — contractTotal = ยอดของสัญญา (ใบสั่งซื้อต้นทาง ถ้ามี · ไม่มี = ยอดเอกสาร) รวม VAT
 *   "BELOW" = สัญญาไม่ถึงขั้นต่ำ (ไม่ต้องหักตามคำสั่ง) · "REACHED" = ถึงขั้นต่ำ — ต้องหักแม้งวดนี้ไม่ถึง 1,000 · null = ไม่เกี่ยว (ม.50 อัตราก้าวหน้า)
 */
export function minimumCheck(contractTotal: number, minSatang: number | null, progressive: boolean): "BELOW" | "REACHED" | null {
  if (progressive || minSatang === null) return null;
  return contractTotal < minSatang ? "BELOW" : "REACHED";
}

// ═══════════════ คำเตือนของการจ่ายหนึ่งงวด ═══════════════

const baht = (s: number) => (s / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (bp: number) => `${bp / 100}%`;

export type PaymentWhtCheck = {
  /** ฝั่งร้านจ่าย (direction IN) — ฝั่งรับ (ลูกค้าหักเรา) ไม่เตือนเรื่องตาราง */
  shopPays: boolean;
  whtOn: boolean;
  code: string;
  rateBp: number;
  whtAmount: number;
  /** ฐานของงวดที่ระบบคิด (T3.2) */
  base: number;
  channel: "NORMAL" | "EWHT";
  condition: WhtCondition;
  /** อัตราตามตาราง ณ วันที่จ่าย (null = ไม่มีอัตราคงที่) + วิธี */
  table: { value: number | null; method: "RATE" | "NONE" | "PROGRESSIVE"; source?: string | null };
  recipient: WhtRecipient;
  /** ผู้ขายเป็นตัวแทนหักภาษี (ฉ.457) */
  agent: boolean;
  contractTotal: number;
  instalment: number;
  minSatang: number | null;
  /** ยืนยันแล้วว่าผู้รับต่างประเทศทำงานนอกไทย/อยู่ประเทศคู่อนุสัญญา (ไม่หัก) */
  foreignConfirmed?: boolean;
  /** สูตรออกภาษีให้ที่ใช้ (เมื่อ condition ไม่ใช่ WITHHOLD) */
  formula?: WhtGrossUpFormula;
  ewhtRef?: string | null;
};

/** คำเตือนของงวดจ่าย (pure) — ใช้ทั้งพรีวิวบนจอและตอนบันทึก · ทั้งหมดไม่บล็อก ยกเว้น WHT_FOREIGN_NO_WITHHOLD (ต้องยืนยันข้อเท็จจริง) */
export function paymentWhtWarnings(p: PaymentWhtCheck): LegalWarning[] {
  const out: LegalWarning[] = [];
  if (!p.shopPays) return out;
  const tableRate = p.table.method === "RATE" ? p.table.value : null;
  if (p.recipient === "FOREIGN" && !p.whtOn) {
    if (!p.foreignConfirmed) out.push(legalWarning("WHT_FOREIGN_NO_WITHHOLD"));
  }
  if (p.agent && p.whtOn) out.push(legalWarning("WHT_AGENT_VENDOR"));
  if (!p.whtOn) {
    const mc = minimumCheck(p.contractTotal, p.minSatang, p.table.method === "PROGRESSIVE");
    if (!p.agent && tableRate && tableRate > 0 && mc === "REACHED" && p.instalment < (p.minSatang ?? 0))
      out.push(legalWarning("WHT_MINIMUM_CUMULATIVE", { contract: baht(p.contractTotal), instalment: baht(p.instalment) }));
    return out;
  }
  if (p.table.method === "NONE") out.push(legalWarning("WHT_TABLE_NO_DUTY", { code: whtCodeLabel(p.code), recipient: whtRecipientLabel(p.recipient) }, p.table.source ? { citation: p.table.source } : {}));
  else if (p.table.method === "PROGRESSIVE") out.push(legalWarning("WHT_PROGRESSIVE_MANUAL"));
  else if (tableRate !== null && p.rateBp !== tableRate)
    out.push(legalWarning("WHT_RATE_DIFFERS_FROM_TABLE", { rate: pct(p.rateBp), table: pct(tableRate), code: whtCodeLabel(p.code), recipient: whtRecipientLabel(p.recipient) }, p.table.source ? { citation: p.table.source } : {}));
  const mc = minimumCheck(p.contractTotal, p.minSatang, p.table.method === "PROGRESSIVE");
  if (mc === "BELOW") out.push(legalWarning("WHT_BELOW_MINIMUM", { contract: baht(p.contractTotal) }));
  if (p.condition === "WITHHOLD" && p.rateBp > 0 && Math.abs(p.whtAmount - whtOf(p.base, p.rateBp)) > 1)
    out.push(legalWarning("WHT_AMOUNT_DIFFERS", { amount: baht(p.whtAmount), expected: baht(whtOf(p.base, p.rateBp)), base: baht(p.base), rate: pct(p.rateBp) }));
  if (p.condition !== "WITHHOLD") out.push(legalWarning("WHT_GROSS_UP", { condition: whtConditionLabel(p.condition), formula: grossUpFormulaText(p.formula ?? "GROSS_UP_CONVERGED"), tax: baht(p.whtAmount) }));
  if (p.channel === "EWHT") out.push(legalWarning("WHT_EWHT_CHANNEL", { ref: p.ewhtRef ? ` (เลขอ้างอิงธนาคาร ${p.ewhtRef})` : "" }));
  return out;
}

/** ค่าธรรมเนียมรับบัตร/โอนที่ร้านจ่ายธนาคาร/ผู้ให้บริการ (T3.6 · J10) — ร้านนิติบุคคล + ค่าธรรมเนียมครั้งนี้ ≥ 1,000 ⇒ แจ้งให้ทราบ */
export function feeWhtWarnings(feeSatang: number, juristicPayer: boolean | null, minPerTime: number): LegalWarning[] {
  if (juristicPayer === false || feeSatang < minPerTime) return [];
  return [legalWarning("WHT_ON_FEE", { fee: baht(feeSatang) })];
}
