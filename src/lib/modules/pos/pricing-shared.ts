// pricing-shared.ts — เครื่องคิดเงินตะกร้าของหน้าขาย (POS P1.3 · ข้อสอบ scripts/qc-pos-p1.3.mts กลุ่ม S2)
//
// 🔴 ฟังก์ชันบริสุทธิ์ล้วน: ไม่ import อะไรเลย (ไม่แตะฐานข้อมูล · ไม่มีโมดูลฝั่งเซิร์ฟเวอร์) ⇒ client ใช้คิดยอดทันใจ และเซิร์ฟเวอร์ใช้ตัวเดียวกัน
//    คิดยอดจริงด้วยราคาที่อ่านจาก DB (quoteRegisterCart / submitRegisterSale ใน register.ts) — ยอดสองฝั่งจึงตรงกันทุกสตางค์
// 🔴 เงินเป็นสตางค์จำนวนเต็มทุกตัว · ไม่มีทศนิยมในการคิดเงิน · ปัดครึ่งขึ้น (เฉพาะค่าที่ไม่ติดลบ) · VAT คิดระดับบิลครั้งเดียว ไม่ใช่รายบรรทัด
// 🔴 ส่วนลดเกินเพดาน/เกินยอด = ปฏิเสธ (ok:false + code) — ไม่บีบค่าเงียบ ๆ และไม่คืนยอดใด ๆ ในคำปฏิเสธ
//
// ลำดับคิดเงิน (docs/modules/14-pos.md §7.1 · มติ P1.3 Q7):
//   gross = qty × (ราคา + Σ ส่วนต่างตัวเลือก) → ส่วนลดบรรทัด (บาท/basis point) → subtotal = Σ gross (ก่อนส่วนลดบรรทัด)
//   → ส่วนลดท้ายบิล (% คิดจากยอดหลังส่วนลดบรรทัด) → เพดานส่วนลด (บรรทัด+ท้ายบิล)/subtotal → คูปอง (ไม่นับในเพดาน · หักได้ไม่เกินยอดที่เหลือ)
//   → net → VAT: INCLUDED = ถอดจากยอด (ยอดไม่เปลี่ยน) · EXCLUDED = บวกเพิ่ม · NONE = 0

/** ส่วนลด: AMOUNT = สตางค์ · PERCENT = basis point (10000 = 100%) */
export type PriceDiscount = { type: "AMOUNT" | "PERCENT"; value: number };
export type PriceVatMode = "NONE" | "INCLUDED" | "EXCLUDED";
export type PriceVat = { mode: PriceVatMode; rateBp: number };

export type PriceCartLineInput = {
  qty: number;
  unitPriceSatang: number;
  /** ส่วนต่างราคาตัวเลือก (P1.2) — P1.3 ไม่ส่ง */
  optionDeltasSatang?: number[];
  discount?: PriceDiscount | null;
};

export type PriceCartInput = {
  lines: PriceCartLineInput[];
  billDiscount?: PriceDiscount | null;
  /** ส่วนลดคูปองที่ตรวจแล้ว (P1.12) — P1.3 ฝั่งเซิร์ฟเวอร์ไม่รับคูปองจาก client (มติ Q12) */
  couponDiscountSatang?: number;
  vat: PriceVat;
  /** เพดานส่วนลดของผู้ขาย (basis point ของ subtotal) · null/ไม่ส่ง = ไม่จำกัด */
  maxDiscountBp?: number | null;
};

export type PriceCartLine = {
  qty: number;
  unitPriceSatang: number;
  optionDeltaSatang: number;
  grossSatang: number;
  discountSatang: number;
  lineTotalSatang: number;
};

export type PriceCartOk = {
  ok: true;
  /** Σ gross ก่อนส่วนลดบรรทัด (ตัวเลข "รวม" บนจอ) — ⚠️ ไม่ใช่ PosSale.subtotalSatang (= หลังส่วนลดบรรทัด · มติ Q7) */
  subtotalSatang: number;
  lineDiscountSatang: number;
  billDiscountSatang: number;
  couponDiscountSatang: number;
  netSatang: number;
  vatSatang: number;
  grandTotalSatang: number;
  vatMode: PriceVatMode;
  vatRateBp: number;
  lines: PriceCartLine[];
};

export type PriceRefusalCode =
  | "VALIDATION"
  | "INVALID_LINE"
  | "TOO_MANY_LINES"
  | "LINE_DISCOUNT_EXCEEDS_LINE"
  | "BILL_DISCOUNT_EXCEEDS_TOTAL"
  | "DISCOUNT_EXCEEDS_LIMIT";
export type PriceRefusal = { ok: false; code: PriceRefusalCode; message: string; lineIndex?: number };
export type PriceCartResult = PriceCartOk | PriceRefusal;

/** บิลหนึ่งใส่ได้ไม่เกิน (ซ้ำกับ REGISTER_MAX_LINES ใน register-shared — ไฟล์นี้ import ใครไม่ได้) */
export const PRICE_MAX_LINES = 200;
export const PRICE_MAX_QTY = 9999;
/** เพดานคอลัมน์เงินใน DB (Int4) — ยอดใดเกินนี้บันทึกไม่ได้ ⇒ ปฏิเสธตั้งแต่คิดราคา */
export const PRICE_MAX_SATANG = 2_147_483_647;
const BP_FULL = 10_000;

const isInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v);
const isMoney = (v: unknown): v is number => isInt(v) && v >= 0 && v <= PRICE_MAX_SATANG;
const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** ปัดครึ่งขึ้นของ num/den (num ≥ 0 · den > 0) — จำนวนเต็มล้วน */
export function roundHalfUp(num: number, den: number): number {
  return Math.floor((2 * num + den) / (2 * den));
}

const refuse = (code: PriceRefusalCode, message: string, lineIndex?: number): PriceRefusal =>
  lineIndex === undefined ? { ok: false, code, message } : { ok: false, code, message, lineIndex };

/** ส่วนลดที่ถูกรูป: null = ไม่มี · undefined คืน "ผิดรูป" ผ่าน ok:false */
function readDiscount(v: unknown): { ok: true; d: PriceDiscount | null } | { ok: false } {
  if (v === undefined || v === null) return { ok: true, d: null };
  if (!isRecord(v)) return { ok: false };
  if (v.type === "AMOUNT" && isMoney(v.value)) return { ok: true, d: { type: "AMOUNT", value: v.value } };
  // PERCENT เกิน 100% ไม่ผิดรูป — คิดแล้วเกินยอดเอง (ปฏิเสธด้วยรหัส "เกิน" ไม่ใช่ "ผิดรูป") · จำกัดบนไว้กันเลขล้น
  if (v.type === "PERCENT" && isInt(v.value) && v.value >= 0 && v.value <= PRICE_MAX_SATANG) return { ok: true, d: { type: "PERCENT", value: v.value } };
  return { ok: false };
}

/** ส่วนลดเป็นสตางค์ของฐาน `base` — PERCENT เกิน 100% คิดจาก 100% + 1 (ให้ผู้เรียกเห็นว่า "เกิน") โดยไม่คูณเลขใหญ่ */
function discountOf(d: PriceDiscount | null, base: number): number {
  if (!d) return 0;
  if (d.type === "AMOUNT") return d.value;
  if (d.value > BP_FULL) return base + 1;
  return roundHalfUp(base * d.value, BP_FULL);
}

/**
 * คิดยอดตะกร้า — บริสุทธิ์ (ผลเท่ากันทุกครั้ง · ไม่แก้ออบเจกต์ที่ส่งเข้า · ไม่อ่านเวลา/สุ่ม)
 * ปฏิเสธ: VALIDATION (โครงผิด) · INVALID_LINE (จำนวน/ราคาไม่ใช่จำนวนเต็มในช่วง) · TOO_MANY_LINES (> 200 บรรทัด)
 *        · LINE_DISCOUNT_EXCEEDS_LINE · BILL_DISCOUNT_EXCEEDS_TOTAL · DISCOUNT_EXCEEDS_LIMIT
 */
export function priceCart(input: PriceCartInput): PriceCartResult {
  if (!isRecord(input)) return refuse("VALIDATION", "ข้อมูลตะกร้าไม่ถูกต้อง");
  const rawLines: unknown = input.lines;
  if (!Array.isArray(rawLines)) return refuse("VALIDATION", "ข้อมูลรายการในตะกร้าไม่ถูกต้อง");
  if (rawLines.length > PRICE_MAX_LINES) return refuse("TOO_MANY_LINES", `บิลหนึ่งใส่ได้ไม่เกิน ${PRICE_MAX_LINES} รายการ`);

  // VAT + เพดาน + คูปอง (โครงของบิล)
  const vat: unknown = input.vat;
  if (!isRecord(vat) || (vat.mode !== "NONE" && vat.mode !== "INCLUDED" && vat.mode !== "EXCLUDED") || !isInt(vat.rateBp) || vat.rateBp < 0 || vat.rateBp > BP_FULL) {
    return refuse("VALIDATION", "ตั้งค่าภาษีมูลค่าเพิ่มไม่ถูกต้อง");
  }
  const vatMode = vat.mode as PriceVatMode;
  const vatRateBp = vatMode === "NONE" ? 0 : (vat.rateBp as number);
  const maxRaw: unknown = input.maxDiscountBp;
  if (maxRaw !== undefined && maxRaw !== null && !(isInt(maxRaw) && maxRaw >= 0)) return refuse("VALIDATION", "เพดานส่วนลดไม่ถูกต้อง");
  const maxDiscountBp = maxRaw === undefined || maxRaw === null ? null : Math.min(maxRaw as number, BP_FULL);
  const couponRaw: unknown = input.couponDiscountSatang;
  if (couponRaw !== undefined && couponRaw !== null && !isMoney(couponRaw)) return refuse("VALIDATION", "ส่วนลดคูปองไม่ถูกต้อง");
  const couponAsked = (couponRaw as number | null | undefined) ?? 0;
  const bill = readDiscount(input.billDiscount);
  if (!bill.ok) return refuse("VALIDATION", "ส่วนลดท้ายบิลไม่ถูกต้อง");

  // บรรทัด
  const lines: PriceCartLine[] = [];
  let subtotal = 0;
  let lineDiscount = 0;
  for (let i = 0; i < rawLines.length; i++) {
    const l: unknown = rawLines[i];
    if (!isRecord(l)) return refuse("INVALID_LINE", "รายการในตะกร้าไม่ถูกต้อง", i);
    const qty: unknown = l.qty;
    const unit: unknown = l.unitPriceSatang;
    if (!isInt(qty) || qty < 1 || qty > PRICE_MAX_QTY) return refuse("INVALID_LINE", `จำนวนต้องเป็นจำนวนเต็ม 1–${PRICE_MAX_QTY}`, i);
    if (!isMoney(unit)) return refuse("INVALID_LINE", "ราคาต้องเป็นจำนวนเต็มสตางค์ที่ไม่ติดลบ", i);
    const deltasRaw: unknown = l.optionDeltasSatang;
    let optionDelta = 0;
    if (deltasRaw !== undefined && deltasRaw !== null) {
      if (!Array.isArray(deltasRaw) || deltasRaw.length > 50) return refuse("INVALID_LINE", "ราคาตัวเลือกไม่ถูกต้อง", i);
      for (const d of deltasRaw) {
        if (!isInt(d) || Math.abs(d) > PRICE_MAX_SATANG) return refuse("INVALID_LINE", "ราคาตัวเลือกไม่ถูกต้อง", i);
        optionDelta += d;
      }
    }
    const each = unit + optionDelta;
    if (each < 0 || each > PRICE_MAX_SATANG) return refuse("INVALID_LINE", "ราคาต่อชิ้นรวมตัวเลือกต้องไม่ติดลบ", i);
    const gross = qty * each;
    if (gross > PRICE_MAX_SATANG) return refuse("INVALID_LINE", "ยอดของรายการสูงเกินที่ระบบรับได้", i);
    const disc = readDiscount(l.discount);
    if (!disc.ok) return refuse("INVALID_LINE", "ส่วนลดของรายการไม่ถูกต้อง", i);
    const discountSatang = discountOf(disc.d, gross);
    if (discountSatang > gross) return refuse("LINE_DISCOUNT_EXCEEDS_LINE", "ส่วนลดมากกว่าราคาของรายการ", i);
    subtotal += gross;
    lineDiscount += discountSatang;
    if (subtotal > PRICE_MAX_SATANG) return refuse("INVALID_LINE", "ยอดรวมของบิลสูงเกินที่ระบบรับได้", i);
    lines.push({ qty, unitPriceSatang: unit, optionDeltaSatang: optionDelta, grossSatang: gross, discountSatang, lineTotalSatang: gross - discountSatang });
  }

  // ส่วนลดท้ายบิล (% คิดจากยอดหลังส่วนลดบรรทัด)
  const afterLines = subtotal - lineDiscount;
  const billDiscountSatang = discountOf(bill.d, afterLines);
  if (billDiscountSatang > afterLines) return refuse("BILL_DISCOUNT_EXCEEDS_TOTAL", "ส่วนลดท้ายบิลมากกว่ายอดบิล");

  // เพดานส่วนลด (บรรทัด + ท้ายบิล) เทียบ subtotal — ปฏิเสธ ไม่บีบ · คูปองไม่นับ
  if (maxDiscountBp !== null && (lineDiscount + billDiscountSatang) * BP_FULL > maxDiscountBp * subtotal) {
    return refuse("DISCOUNT_EXCEEDS_LIMIT", "ส่วนลดเกินสิทธิ์ของบัญชีนี้");
  }

  // คูปอง: หักได้ไม่เกินยอดที่เหลือ (ยอดไม่ติดลบ)
  const afterBill = afterLines - billDiscountSatang;
  const couponDiscountSatang = Math.min(couponAsked, afterBill);
  const net = afterBill - couponDiscountSatang;

  // VAT ระดับบิล ปัดครึ่งขึ้น
  let vatSatang = 0;
  let grand = net;
  if (vatMode === "INCLUDED" && vatRateBp > 0) vatSatang = roundHalfUp(net * vatRateBp, BP_FULL + vatRateBp);
  else if (vatMode === "EXCLUDED" && vatRateBp > 0) {
    vatSatang = roundHalfUp(net * vatRateBp, BP_FULL);
    grand = net + vatSatang;
  }
  if (grand > PRICE_MAX_SATANG) return refuse("INVALID_LINE", "ยอดรวมของบิลสูงเกินที่ระบบรับได้");

  return {
    ok: true,
    subtotalSatang: subtotal,
    lineDiscountSatang: lineDiscount,
    billDiscountSatang,
    couponDiscountSatang,
    netSatang: net,
    vatSatang,
    grandTotalSatang: grand,
    vatMode,
    vatRateBp,
    lines,
  };
}
