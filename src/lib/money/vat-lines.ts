// vat-lines.ts — VAT ของบิลตามชนิด VAT ต่อบรรทัด (ACC T1.8 · ledger/wo-notes/T1.8.md §3)
//
// 🔴 บริสุทธิ์ล้วน (import แค่ ./vat) — pos (createSale · ใบคืน · ตัวคิดราคา · สะพานบัญชี) และ account (applyExternalSale/Refund) ใช้ตัวเดียว
//    ⇒ VAT บนบิล = VAT ในสมุดบัญชี ทุกสตางค์
// กฎ (skill shark-thai-law · common-vat-invoice.md §2 §3 §9 §20):
//   ส่วนลดระดับบิลหักก่อนคิด VAT → เกลี่ยลงบรรทัด (largest remainder) ยกเว้นบรรทัด "เก็บแทน" (ลดไม่ได้ §3) ·
//   ส่วนที่เกินยอดบรรทัดที่ลดได้ไปลดค่าบริการ (กติกาเดิม POS P5.1 MA1) ·
//   ค่าบริการ = กลุ่มมาตรฐาน · VAT = ถอดจากยอดกลุ่มมาตรฐานครั้งเดียว (ปัดต่อกลุ่ม — §20 [U] = ระดับเอกสารแบบบัญชี V2)
// บิลที่ไม่มีบรรทัดเก็บแทน: net = lineNets เดิมเป๊ะ · บิลที่ทุกบรรทัดมาตรฐาน: VAT = splitIncludedVat(grandTotal) เดิมเป๊ะ
import { splitIncludedVat } from "./vat";

export const VAT_TREATMENTS = ["STANDARD", "ZERO_RATED", "EXEMPT", "ON_BEHALF"] as const;
export type VatTreatment = (typeof VAT_TREATMENTS)[number];

export function isVatTreatment(v: unknown): v is VatTreatment {
  return typeof v === "string" && (VAT_TREATMENTS as readonly string[]).includes(v);
}

/** null/ไม่รู้จัก = STANDARD (บิลเก่า) */
export function treatmentOf(v: unknown): VatTreatment {
  return isVatTreatment(v) ? v : "STANDARD";
}

/** ชนิดของสินค้า POS จากช่องเดิม vatRateBp (0 = 0% · −1 = ยกเว้น · null/บวก = มาตรฐาน) + ธงเก็บแทน (ชนะ) */
export function productVatTreatment(p: { vatRateBp: number | null | undefined; collectedOnBehalf?: boolean | null }): VatTreatment {
  if (p.collectedOnBehalf) return "ON_BEHALF";
  if (p.vatRateBp === 0) return "ZERO_RATED";
  if (p.vatRateBp === -1) return "EXEMPT";
  return "STANDARD";
}

/** อัตราของบรรทัดเอกสารบัญชี (AccountDocumentLine.vatRateBp): มาตรฐาน = null (อัตราของสมุด) · 0% = 0 · ยกเว้น = −1 · เก็บแทน = ไม่อยู่ในเอกสาร */
export function docRateOfTreatment(t: VatTreatment): number | null {
  return t === "ZERO_RATED" ? 0 : t === "EXEMPT" ? -1 : null;
}

export const VAT_TREATMENT_LABEL_TH: Record<VatTreatment, string> = {
  STANDARD: "มาตรฐาน (อัตราของร้าน)",
  ZERO_RATED: "อัตรา 0%",
  EXEMPT: "ยกเว้น VAT",
  ON_BEHALF: "เก็บแทน (ไม่ใช่รายได้)",
};
/** ป้ายสั้นต่อท้ายชื่อบรรทัดบนใบเสร็จ/ใบย่อ (มาตรฐาน = ไม่มีป้าย) */
export const VAT_TREATMENT_MARK: Record<"th" | "en", Record<VatTreatment, string>> = {
  th: { STANDARD: "", ZERO_RATED: "(VAT 0%)", EXEMPT: "(ยกเว้น VAT)", ON_BEHALF: "(เก็บแทน)" },
  en: { STANDARD: "", ZERO_RATED: "(0% VAT)", EXEMPT: "(VAT exempt)", ON_BEHALF: "(on behalf)" },
};

/** เกลี่ย total ตามน้ำหนัก (largest remainder · เศษเท่ากัน = ลำดับบรรทัด) — สูตรเดียวกับ pos/refund-math allocateBillDiscount */
function allocate(weights: number[], total: number): number[] {
  const sumW = weights.reduce((a, b) => a + b, 0);
  if (total <= 0 || sumW <= 0) return weights.map(() => 0);
  const raw = weights.map((w) => (total * w) / sumW);
  const out = raw.map((r) => Math.floor(r));
  let rem = total - out.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => ({ i, frac: r - Math.floor(r) })).sort((a, b) => b.frac - a.frac);
  for (let k = 0; rem > 0 && order.length > 0; k++, rem--) out[order[k % order.length]!.i] += 1;
  return out;
}

export type BillVatLine = { lineTotalSatang: number; treatment?: VatTreatment | string | null };
export type BillVatSplit = {
  /** ยอดสุทธิของแต่ละบรรทัด (ลำดับเดียวกับ lines) หลังเกลี่ยส่วนลดระดับบิล */
  nets: number[];
  serviceChargeNet: number;
  /** ยอดรวม VAT ของกลุ่มมาตรฐาน (บรรทัดมาตรฐาน + ค่าบริการสุทธิ) */
  standardGross: number;
  zeroRated: number;
  exempt: number;
  onBehalf: number;
  vat: number;
  /** ฐานของกลุ่มมาตรฐาน = standardGross − vat */
  base: number;
  /** ส่วนลดระดับบิลที่ลงไม่ได้ (เกิน Σ บรรทัดที่ลดได้ + ค่าบริการ) — > 0 = บิลผิดรูป (ผู้เรียกปฏิเสธ) */
  unallocatedDiscount: number;
  /** true = มีบรรทัดที่ไม่ใช่มาตรฐาน (ต้องเก็บ/แสดงแยกกลุ่ม) */
  mixed: boolean;
};

/**
 * VAT ของบิลราคารวม VAT ตามชนิดต่อบรรทัด (ledger/wo-notes/T1.8.md §3)
 * D = Σ lineTotal + ค่าบริการ − grandTotal → เกลี่ยตามยอดบรรทัดที่ไม่ใช่เก็บแทน · เกินไปลดค่าบริการ · rateBp ≤ 0 = ไม่มี VAT
 */
export function splitBillVat(input: { lines: readonly BillVatLine[]; serviceChargeSatang: number; grandTotalSatang: number; rateBp: number }): BillVatSplit {
  const tr = input.lines.map((l) => treatmentOf(l.treatment));
  const totals = input.lines.map((l) => l.lineTotalSatang);
  const sc = Math.max(0, input.serviceChargeSatang);
  const weights = totals.map((t, i) => (tr[i] === "ON_BEHALF" ? 0 : Math.max(0, t)));
  const sumW = weights.reduce((a, b) => a + b, 0);
  const d = totals.reduce((a, b) => a + b, 0) + input.serviceChargeSatang - input.grandTotalSatang;
  const onLines = Math.max(0, Math.min(d, sumW));
  const alloc = allocate(weights, onLines);
  const nets = totals.map((t, i) => t - alloc[i]!);
  const scCut = Math.max(0, Math.min(sc, d - onLines));
  const serviceChargeNet = sc - scCut;
  const unallocatedDiscount = Math.max(0, d - onLines - scCut);
  let standardGross = serviceChargeNet;
  let zeroRated = 0;
  let exempt = 0;
  let onBehalf = 0;
  nets.forEach((n, i) => {
    if (tr[i] === "ZERO_RATED") zeroRated += n;
    else if (tr[i] === "EXEMPT") exempt += n;
    else if (tr[i] === "ON_BEHALF") onBehalf += n;
    else standardGross += n;
  });
  const { vatSatang } = splitIncludedVat(standardGross, input.rateBp);
  const vat = standardGross > 0 ? vatSatang : 0;
  return {
    nets,
    serviceChargeNet,
    standardGross,
    zeroRated,
    exempt,
    onBehalf,
    vat,
    base: standardGross - vat,
    unallocatedDiscount,
    mixed: tr.some((t) => t !== "STANDARD"),
  };
}

/** ยอดตามกลุ่มของบิลที่เก็บแล้ว (PosSale) → ยอดที่เสีย VAT + ฐาน · บิลเก่า (0/0/0) = grandTotal ทั้งก้อน */
export function storedVatGroups(s: { grandTotalSatang: number; vatSatang: number; zeroRatedSatang?: number | null; exemptSatang?: number | null; onBehalfSatang?: number | null }): {
  standardGross: number;
  base: number;
  vat: number;
  zeroRated: number;
  exempt: number;
  onBehalf: number;
  mixed: boolean;
} {
  const zeroRated = Math.max(0, s.zeroRatedSatang ?? 0);
  const exempt = Math.max(0, s.exemptSatang ?? 0);
  const onBehalf = Math.max(0, s.onBehalfSatang ?? 0);
  const standardGross = s.grandTotalSatang - zeroRated - exempt - onBehalf;
  return { standardGross, base: standardGross - s.vatSatang, vat: s.vatSatang, zeroRated, exempt, onBehalf, mixed: zeroRated + exempt + onBehalf > 0 };
}
