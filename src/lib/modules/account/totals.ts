import type { AccountVatMode } from "@prisma/client";

// ─────────────────────────────────────────────────────────────
// totals.ts — คณิตศาสตร์เงินของโมดูลบัญชี **ที่เดียว** (WO 1.3)
//
// 🔴 ไฟล์นี้ต้อง "บริสุทธิ์" เสมอ: ห้าม import prisma / next/headers / อะไรที่เป็น server-only
//    เพราะฟอร์ม `DocEditorV2` (client component) import ตรงมาใช้พรีวิวยอดสด ๆ ระหว่างพิมพ์
//    และ server action ก็เรียกตัวเดียวกันคำนวณใหม่ก่อนบันทึก ⇒ ตัวเลขฝั่งจอกับฝั่ง DB
//    ไม่มีวันต่างกันเพราะ "สองสูตร" (บั๊กคลาสสิกของฟอร์มเอกสาร)
//    ⚠️ import type จาก @prisma/client ได้ (type ถูกลบตอน compile ไม่ติดไปใน bundle)
//
// หน่วยเงิน = **สตางค์ (integer)** ทุกตัวแปร ทุก return — ห้ามมี float บาทโผล่ในไฟล์นี้
//
// ของเดิม (computeTotals/lineAmount/allocateProportional) ย้ายมาจาก service.ts ทั้งดุ้น
// แล้ว service.ts re-export กลับ ⇒ ผู้เรียกเดิม (expense.ts · gl · qc-account-cpa) ไม่ต้องแก้แม้แต่บรรทัดเดียว
// ─────────────────────────────────────────────────────────────

// ─────────────────── ชั้นที่ 1: ของเดิม (ย้ายมาจาก service.ts) ───────────────────

export type LineInput = {
  description: string;
  qty: number;
  unitName?: string | null;
  unitPrice: number; // สตางค์
  discount?: number; // สตางค์
  vatRateBp?: number;
};

export function lineAmount(l: LineInput): number {
  const gross = Math.round((l.qty || 0) * (l.unitPrice || 0));
  return Math.max(0, gross - (l.discount || 0));
}

// กระจายยอด (เช่น ส่วนลดท้ายบิล) ตามสัดส่วนน้ำหนักแต่ละบรรทัด — largest remainder ให้ผลรวมตรงเป๊ะ
// (ledger-M11: ส่วนลดท้ายบิลข้ามหลายอัตรา VAT → allocate ตามสัดส่วนฐานแต่ละบรรทัด/อัตรา)
export function allocateProportional(total: number, weights: number[]): number[] {
  const sumW = weights.reduce((a, b) => a + b, 0);
  if (total <= 0 || sumW <= 0) return weights.map(() => 0);
  const raw = weights.map((w) => (total * w) / sumW);
  const out = raw.map((r) => Math.floor(r));
  let rem = total - out.reduce((a, b) => a + b, 0);
  const order = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac);
  for (let k = 0; rem > 0 && order.length > 0; k++, rem--) out[order[k % order.length].i] += 1;
  return out;
}

// อัตรา VAT ต่อบรรทัด: -1 = ยกเว้น, 0 = 0% → คิดเป็น 0 · ไม่จด VAT / vatMode NONE → 0 ทุกบรรทัด
function lineRate(
  l: LineInput,
  vatMode: AccountVatMode,
  vatRegistered: boolean,
  fallbackBp: number,
): number {
  if (vatMode === "NONE" || !vatRegistered) return 0;
  const bp = l.vatRateBp ?? fallbackBp;
  return bp > 0 ? bp / 10000 : 0;
}

/** รายละเอียดต่อบรรทัดที่ `computeTotals` คิดไว้ระหว่างทาง — ฟอร์ม V2 ใช้แสดงคอลัมน์ "มูลค่าก่อนภาษี" */
export type LineBreakdown = {
  /** ฐานบรรทัดตามที่ป้อน (qty×ราคา − ส่วนลดบรรทัด) — INCL_VAT = รวม VAT แล้ว */
  base: number;
  /** ส่วนลดท้ายบิลที่ตกมาที่บรรทัดนี้ */
  docDiscount: number;
  /** มูลค่าก่อนภาษีหลังหักส่วนลดทุกชั้น (= ฐานรายได้/ค่าใช้จ่ายของบรรทัด) */
  net: number;
  /** VAT ของบรรทัด */
  vat: number;
  /** ยอดรวมของบรรทัด (net + vat) */
  gross: number;
};

export type Totals = {
  subTotal: number;
  vatAmount: number;
  grandTotal: number;
  /** WO 1.3 (additive): รายละเอียดต่อบรรทัด — ผู้เรียกเดิมไม่ต้องอ่านก็ได้ */
  lines: LineBreakdown[];
};

// คำนวณยอดทั้งเอกสาร — ใช้ vatRateBp จริงต่อบรรทัด (pipeline-M5) + กระจายส่วนลดท้ายบิลตามสัดส่วนฐาน (ledger-M11)
// contract กับ gl.postDocument: afterDiscount = subTotal − discountAmount = ฐานรายได้สุทธิ (สมดุลทั้ง EXCLUDE/INCLUDE)
export function computeTotals(input: {
  lines: LineInput[];
  discountAmount?: number;
  depositDeducted?: number;
  vatMode: AccountVatMode;
  vatRegistered: boolean;
  vatRateBp: number;
}): Totals {
  const bases = input.lines.map(lineAmount); // ฐานบรรทัด (ตามที่ป้อน: EXCLUDE=ก่อน VAT, INCLUDE=รวม VAT)
  const baseSum = bases.reduce((a, b) => a + b, 0);
  const docDiscount = Math.min(Math.max(0, input.discountAmount || 0), baseSum);
  const discAlloc = allocateProportional(docDiscount, bases);

  let vatAmount = 0;
  let incomeNet = 0; // ฐานรายได้สุทธิ (หลังหักส่วนลดท้ายบิล ก่อน VAT) ทุกบรรทัดรวมกัน
  let grandBeforeDeposit = 0;
  const breakdown: LineBreakdown[] = [];
  input.lines.forEach((l, i) => {
    const afterBase = Math.max(0, bases[i] - discAlloc[i]);
    const rate = lineRate(l, input.vatMode, input.vatRegistered, input.vatRateBp);
    let net = afterBase;
    let vat = 0;
    if (rate > 0) {
      if (input.vatMode === "INCLUDE") {
        net = Math.round(afterBase / (1 + rate));
        vat = afterBase - net;
        grandBeforeDeposit += afterBase; // ราคารวม VAT แล้ว
      } else {
        vat = Math.round(afterBase * rate);
        grandBeforeDeposit += afterBase + vat;
      }
    } else {
      grandBeforeDeposit += afterBase;
    }
    vatAmount += vat;
    incomeNet += net;
    breakdown.push({ base: bases[i], docDiscount: discAlloc[i], net, vat, gross: net + vat });
  });

  // subTotal นิยามให้ (subTotal − discountAmount) = incomeNet เพื่อให้ gl สมดุลทั้งสองโหมด
  const subTotal = incomeNet + docDiscount;
  const grandTotal = Math.max(0, grandBeforeDeposit - (input.depositDeducted || 0));
  return { subTotal, vatAmount, grandTotal, lines: breakdown };
}

// ─────────────────── ชั้นที่ 2: ตัวอักษรไทย (จำนวนเงิน) ───────────────────

const TH_DIGIT = ["", "หนึ่ง", "สอง", "สาม", "สี่", "ห้า", "หก", "เจ็ด", "แปด", "เก้า"];
const TH_PLACE = ["", "สิบ", "ร้อย", "พัน", "หมื่น", "แสน"];

/** อ่านจำนวนเต็ม ≤ 6 หลัก เป็นคำไทย (ตัวช่วยภายในของ bahtText) */
function readSixDigits(n: number): string {
  let out = "";
  const s = String(n);
  const len = s.length;
  for (let i = 0; i < len; i++) {
    const d = Number(s[i]);
    const place = len - i - 1;
    if (d === 0) continue;
    if (place === 1 && d === 1) out += "สิบ"; // สิบ ไม่ใช่ หนึ่งสิบ
    else if (place === 1 && d === 2) out += "ยี่สิบ";
    else if (place === 0 && d === 1 && len > 1) out += "เอ็ด"; // ...เอ็ด ไม่ใช่ ...หนึ่ง
    else out += TH_DIGIT[d] + TH_PLACE[place];
  }
  return out;
}

/** อ่านจำนวนเต็มบวกเป็นคำไทย (รองรับหลักล้านซ้อน) */
export function readThaiInteger(n: number): string {
  const v = Math.floor(Math.abs(n));
  if (v === 0) return "ศูนย์";
  const chunks: number[] = []; // แบ่งทีละ 6 หลัก (หน่วย "ล้าน" ซ้อนกันได้)
  let rest = v;
  while (rest > 0) {
    chunks.unshift(rest % 1_000_000);
    rest = Math.floor(rest / 1_000_000);
  }
  return chunks
    .map((c, i) => {
      if (c === 0) return "";
      const isLast = i === chunks.length - 1;
      return readSixDigits(c) + (isLast ? "" : "ล้าน");
    })
    .join("");
}

/**
 * จำนวนเงิน (สตางค์) → ตัวอักษรไทยบนเอกสาร เช่น 2_490_000 → "สองหมื่นสี่พันเก้าร้อยบาทถ้วน"
 * ติดลบ → นำหน้าด้วย "ลบ" · มีเศษสตางค์ → "…บาทยี่สิบห้าสตางค์"
 */
export function bahtText(satang: number): string {
  const safe = Number.isFinite(satang) ? Math.round(satang) : 0;
  const sign = safe < 0 ? "ลบ" : "";
  const abs = Math.abs(safe);
  const baht = Math.floor(abs / 100);
  const st = abs % 100;
  const bahtWords = `${readThaiInteger(baht)}บาท`;
  return sign + bahtWords + (st === 0 ? "ถ้วน" : `${readThaiInteger(st)}สตางค์`);
}

// ─────────────────── ชั้นที่ 3: สูตรของฟอร์ม V2 (§5.2 C + E) ───────────────────

/** ประเภทราคา (§5.2 B) — ตรงกับ enum `AccountPriceMode` ใน schema */
export type PriceMode = "EXCL_VAT" | "INCL_VAT" | "NO_VAT";

/** ช่องที่กรอกได้ทั้ง "บาท" และ "%" (§5.2 C, E) */
export type AmountOrPercent = {
  mode: "amount" | "percent";
  /** โหมดบาท: จำนวนสตางค์ */
  satang: number;
  /** โหมด %: basis point (1000 = 10.00%) */
  percentBp: number;
};

export const ZERO_DISCOUNT: AmountOrPercent = { mode: "amount", satang: 0, percentBp: 0 };

/** บรรทัดในฟอร์ม V2 — ส่วนลดเป็น "ต่อหน่วย" ตามสเปค (§5.2 C) */
export type DocTotalsLine = {
  qty: number;
  unitPriceSatang: number;
  /** ส่วนลด/หน่วย — โหมดบาท = สตางค์ต่อหน่วย · โหมด % = % ของราคาทั้งบรรทัด */
  discount?: AmountOrPercent;
  /** 700 = 7% · 0 = 0% · -1 = ยกเว้น */
  vatRateBp?: number;
  /** หัก ณ ที่จ่ายต่อบรรทัด — 300 = 3% (null/0 = ไม่หัก) */
  whtRateBp?: number | null;
};

export type DocTotalsInput = {
  lines: DocTotalsLine[];
  priceMode: PriceMode;
  vatRegistered: boolean;
  /** อัตรา VAT ของกิจการ (ใช้เมื่อบรรทัดไม่ระบุ) */
  vatRateBp: number;
  /** ส่วนลดท้ายบิล (§5.2 E "ส่วนลดรวม ✏") */
  docDiscount?: AmountOrPercent;
  /** หักเงินมัดจำ — WO 1.4 เป็นคนเติมของจริง ฟอร์มนี้ส่ง 0 */
  depositDeductedSatang?: number;
};

export type DocTotalsLineOut = LineBreakdown & {
  /** qty × ราคา/หน่วย ก่อนส่วนลดใด ๆ */
  gross0: number;
  /** ส่วนลดของบรรทัด (แปลงเป็นสตางค์แล้ว ไม่ว่ากรอกมาแบบ ฿ หรือ %) */
  lineDiscount: number;
  /** หัก ณ ที่จ่ายของบรรทัด (คิดจาก net) */
  wht: number;
};

export type DocTotals = {
  lines: DocTotalsLineOut[];
  /** รวมเป็นเงิน (ก่อนหักส่วนลดท้ายบิล · ก่อน VAT) */
  subTotal: number;
  /** ส่วนลดรวมท้ายบิล (สตางค์ · clamp ไม่เกิน subTotal) */
  discountAmount: number;
  /** หลังหักส่วนลด (= subTotal − discountAmount) */
  afterDiscount: number;
  vatAmount: number;
  /** จำนวนเงินทั้งสิ้น (กล่องเข้ม · รวม VAT · **ยังไม่หัก** WHT/มัดจำ) */
  grandTotal: number;
  whtTotal: number;
  depositDeducted: number;
  /** ยอดที่ต้องชำระ = grandTotal − WHT − มัดจำ */
  dueTotal: number;
  /** ตัวอักษรของ grandTotal */
  grandTotalWords: string;
  /** vatMode ที่ต้องบันทึกลง DB (แปลงจาก priceMode + สถานะจด VAT) */
  vatMode: AccountVatMode;
};

/** ประเภทราคา (UI) → vatMode (DB) · ไม่จด VAT = NONE เสมอ (กติกา A3 เดิมของ service) */
export function vatModeOf(priceMode: PriceMode, vatRegistered: boolean): AccountVatMode {
  if (!vatRegistered) return "NONE";
  if (priceMode === "INCL_VAT") return "INCLUDE";
  if (priceMode === "NO_VAT") return "NONE";
  return "EXCLUDE";
}

/** vatMode (DB) → ประเภทราคา (UI) */
export function priceModeOf(vatMode: AccountVatMode): PriceMode {
  if (vatMode === "INCLUDE") return "INCL_VAT";
  if (vatMode === "NONE") return "NO_VAT";
  return "EXCL_VAT";
}

/** ส่วนลด/หน่วย (฿ หรือ %) → ส่วนลดรวมของบรรทัดเป็นสตางค์ */
export function lineDiscountSatang(l: DocTotalsLine): number {
  const gross = Math.round((l.qty || 0) * (l.unitPriceSatang || 0));
  const d = l.discount;
  if (!d) return 0;
  const raw =
    d.mode === "percent"
      ? Math.round((gross * (d.percentBp || 0)) / 10000)
      : Math.round((d.satang || 0) * (l.qty || 0)); // กรอกเป็น "ต่อหน่วย" → คูณจำนวน
  return Math.min(Math.max(0, raw), Math.max(0, gross));
}

/**
 * 🔵 สูตรเดียวของฟอร์มเอกสาร V2 (§5.2 C + E)
 * รับค่าที่ผู้ใช้กรอก → คืนตัวเลขทุกช่องในบล็อกสรุปยอด + รายละเอียดต่อบรรทัด
 * เรียกได้ทั้งฝั่ง client (พรีวิว) และ server action (คำนวณใหม่ก่อนบันทึก — ห้ามเชื่อค่าจากจอ)
 */
export function computeDocTotals(input: DocTotalsInput): DocTotals {
  const vatMode = vatModeOf(input.priceMode, input.vatRegistered);

  // 1) แปลงบรรทัด V2 → LineInput ของสูตรเดิม (ส่วนลด/หน่วย → ส่วนลดรวมบรรทัด)
  const lineDiscounts = input.lines.map(lineDiscountSatang);
  const legacy: LineInput[] = input.lines.map((l, i) => ({
    description: "",
    qty: l.qty || 0,
    unitPrice: l.unitPriceSatang || 0,
    discount: lineDiscounts[i],
    vatRateBp: l.vatRateBp,
  }));

  // 2) ส่วนลดท้ายบิล: % คิดจากผลรวมฐานบรรทัด
  const baseSum = legacy.reduce((s, l) => s + lineAmount(l), 0);
  const dd = input.docDiscount;
  const docDiscountRaw = !dd
    ? 0
    : dd.mode === "percent"
      ? Math.round((baseSum * (dd.percentBp || 0)) / 10000)
      : dd.satang || 0;
  const docDiscount = Math.min(Math.max(0, docDiscountRaw), baseSum);

  // 3) สูตรเดิมทำงานหลัก (VAT ต่อบรรทัด + กระจายส่วนลดท้ายบิล) — ไม่หักมัดจำที่ชั้นนี้
  const t = computeTotals({
    lines: legacy,
    discountAmount: docDiscount,
    depositDeducted: 0,
    vatMode,
    vatRegistered: input.vatRegistered,
    vatRateBp: input.vatRateBp,
  });

  // 4) หัก ณ ที่จ่ายต่อบรรทัด — ฐาน = มูลค่าก่อนภาษีของบรรทัด (หลังส่วนลดทุกชั้น)
  const lines: DocTotalsLineOut[] = t.lines.map((b, i) => {
    const src = input.lines[i];
    const rateBp = src?.whtRateBp ?? 0;
    const wht = rateBp > 0 ? Math.round((b.net * rateBp) / 10000) : 0;
    return {
      ...b,
      gross0: Math.round((src?.qty || 0) * (src?.unitPriceSatang || 0)),
      lineDiscount: lineDiscounts[i] ?? 0,
      wht,
    };
  });
  const whtTotal = lines.reduce((s, l) => s + l.wht, 0);

  const depositDeducted = Math.max(0, input.depositDeductedSatang ?? 0);
  const dueTotal = Math.max(0, t.grandTotal - whtTotal - depositDeducted);

  return {
    lines,
    subTotal: t.subTotal,
    discountAmount: docDiscount,
    afterDiscount: t.subTotal - docDiscount,
    vatAmount: t.vatAmount,
    grandTotal: t.grandTotal,
    whtTotal,
    depositDeducted,
    dueTotal,
    grandTotalWords: bahtText(t.grandTotal),
    vatMode,
  };
}
