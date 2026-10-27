// ─────────────────────────────────────────────────────────────
// th-rental-2568.ts — ตัวตรวจกฎหมาย "ประกาศ สคบ. 2568" (ธุรกิจให้เช่าอาคารเพื่ออยู่อาศัย
// เป็นธุรกิจที่ควบคุมสัญญา) สำหรับหอ/อพาร์ตเมนต์ · ใบสั่ง D.1 §2
//
// 🔴 pure ล้วน: ไม่ import db/prisma/next · ไม่อ่านนาฬิกา · ไม่สุ่ม
// 🔴 ค่าที่กฎหมายยังไม่ชัด = พารามิเตอร์ (`TH_RENTAL_2568_PARAMS`) มีป้าย PENDING_LEGAL_REVIEW
//    ตัวตรวจทุกตัวอ่านเพดานจาก params ที่ส่งเข้ามา (ที่ปรึกษา J3 เปลี่ยนค่าได้ โดยไม่แก้ตรรกะ)
// ⚠️ ตัวบทยังไม่ได้อ่านจากราชกิจจาฯ ตรง — เลขข้อในประกาศรอที่ปรึกษายืนยัน (อ้างภาคผนวก ก แทน)
// ─────────────────────────────────────────────────────────────

export type LegalMode = "STRICT" | "WARN" | "OUT_OF_SCOPE";
export type LegalLevel = "OK" | "WARN" | "BLOCK";
/** `always` = บล็อกทุกโหมด (ห้ามเด็ดขาด) · `pendingReview` = ผลอิงพารามิเตอร์ที่รอที่ปรึกษากฎหมายตรวจ (หน้าจอแสดงป้าย "รอตรวจ") */
export type LegalVerdict = { level: LegalLevel; code: string; messageTh: string; citation: string; always?: boolean; pendingReview?: boolean };
export type LegalOutcome = LegalVerdict & { raw: LegalLevel; mode: LegalMode; needsAck: boolean; needsOwnerApproval: boolean };
export type BusinessType = "APARTMENT" | "STUDENT_DORM" | "SMALL_HOTEL" | "SERVICED_APT";
export type LegalParam<T> = { value: T; review: "CONFIRMED" | "PENDING_LEGAL_REVIEW"; noteTh: string };

// ─────────────────── พารามิเตอร์กฎหมาย ───────────────────

export type UtilityCostMethod = "BILL_DIV_UNITS";

export type ThRental2568ParamValues = {
  scopeMinRooms: number;
  shortLeaseMaxMonths: number;
  longLeaseMaxMonths: number;
  depositAdvanceMaxMonthsShort: number;
  depositAdvanceMaxMonthsLong: number;
  depositReturnMaxDays: number;
  utilityCostMethod: UtilityCostMethod;
  lateFeeCapSatang: number | null;
};

export const TH_RENTAL_2568_PARAMS: { readonly [K in keyof ThRental2568ParamValues]: LegalParam<ThRental2568ParamValues[K]> } = {
  scopeMinRooms: {
    value: 3,
    review: "CONFIRMED",
    noteTh: "ใช้กับผู้ให้เช่าตั้งแต่ 3 ห้องขึ้นไป (ฉบับเดิม 5 ห้อง) — ตามแหล่งข่าวหลายแหล่ง",
  },
  shortLeaseMaxMonths: {
    value: 36,
    review: "CONFIRMED",
    noteTh: "สัญญาเช่าระยะสั้น ไม่เกิน 3 ปี (36 เดือน)",
  },
  longLeaseMaxMonths: {
    value: 360,
    review: "CONFIRMED",
    noteTh: "สัญญาเช่าระยะยาว ไม่เกิน 30 ปี (360 เดือน)",
  },
  depositAdvanceMaxMonthsShort: {
    value: 3,
    review: "CONFIRMED",
    noteTh: "สัญญาสั้น: เงินประกัน + ค่าเช่าล่วงหน้ารวมกันไม่เกิน 3 เดือนของค่าเช่า",
  },
  depositAdvanceMaxMonthsLong: {
    value: 12,
    review: "CONFIRMED",
    noteTh: "สัญญายาว: เงินประกัน + ค่าเช่าล่วงหน้ารวมกันไม่เกิน 12 เดือนของค่าเช่า",
  },
  depositReturnMaxDays: {
    value: 7,
    review: "PENDING_LEGAL_REVIEW",
    noteTh: "คืนเงินประกันภายใน 7 วัน — รอที่ปรึกษายืนยันว่าเป็นวันปฏิทินหรือวันทำการ และกรณีมีหักขยายเป็น 14 วันหรือไม่",
  },
  utilityCostMethod: {
    value: "BILL_DIV_UNITS",
    review: "PENDING_LEGAL_REVIEW",
    noteTh: "ต้นทุนค่าน้ำไฟ = ยอดบิลจริง ÷ หน่วยรวมต่อเดือน — รอที่ปรึกษายืนยันวิธีคิด \"อัตราที่การไฟฟ้า/ประปาเรียกเก็บ\"",
  },
  lateFeeCapSatang: {
    value: null,
    review: "PENDING_LEGAL_REVIEW",
    noteTh: "ยังไม่พบเพดานค่าปรับชำระล่าช้าในตัวบท — ค่าเริ่มไม่มีเพดาน รอที่ปรึกษาตรวจ",
  },
};

/** ค่า value ล้วนของพารามิเตอร์ (ค่าเริ่ม) */
export function defaultLegalParamValues(): ThRental2568ParamValues {
  return {
    scopeMinRooms: TH_RENTAL_2568_PARAMS.scopeMinRooms.value,
    shortLeaseMaxMonths: TH_RENTAL_2568_PARAMS.shortLeaseMaxMonths.value,
    longLeaseMaxMonths: TH_RENTAL_2568_PARAMS.longLeaseMaxMonths.value,
    depositAdvanceMaxMonthsShort: TH_RENTAL_2568_PARAMS.depositAdvanceMaxMonthsShort.value,
    depositAdvanceMaxMonthsLong: TH_RENTAL_2568_PARAMS.depositAdvanceMaxMonthsLong.value,
    depositReturnMaxDays: TH_RENTAL_2568_PARAMS.depositReturnMaxDays.value,
    utilityCostMethod: TH_RENTAL_2568_PARAMS.utilityCostMethod.value,
    lateFeeCapSatang: TH_RENTAL_2568_PARAMS.lateFeeCapSatang.value,
  };
}

/** รวมค่าเริ่มกับ override รายคีย์ (ค่า value ล้วน) — คีย์ที่ไม่รู้จัก/ชนิดผิดถูกเมิน */
export function resolveLegalParams(override?: Record<string, unknown> | null): ThRental2568ParamValues {
  const p = defaultLegalParamValues();
  if (!override) return p;
  const num = (k: keyof ThRental2568ParamValues): number | undefined => {
    const v = override[k];
    return typeof v === "number" && Number.isFinite(v) ? v : undefined;
  };
  p.scopeMinRooms = num("scopeMinRooms") ?? p.scopeMinRooms;
  p.shortLeaseMaxMonths = num("shortLeaseMaxMonths") ?? p.shortLeaseMaxMonths;
  p.longLeaseMaxMonths = num("longLeaseMaxMonths") ?? p.longLeaseMaxMonths;
  p.depositAdvanceMaxMonthsShort = num("depositAdvanceMaxMonthsShort") ?? p.depositAdvanceMaxMonthsShort;
  p.depositAdvanceMaxMonthsLong = num("depositAdvanceMaxMonthsLong") ?? p.depositAdvanceMaxMonthsLong;
  p.depositReturnMaxDays = num("depositReturnMaxDays") ?? p.depositReturnMaxDays;
  if (override.utilityCostMethod === "BILL_DIV_UNITS") p.utilityCostMethod = override.utilityCostMethod;
  if ("lateFeeCapSatang" in override) {
    const v = override.lateFeeCapSatang;
    if (v === null) p.lateFeeCapSatang = null;
    else if (typeof v === "number" && Number.isFinite(v)) p.lateFeeCapSatang = v;
  }
  return p;
}

// ─────────────────── ทำข้อความให้เป็นรูปมาตรฐานก่อนเทียบ ───────────────────

/**
 * NFKC → รวม "ํ+า" กลับเป็น "ำ" (NFKC แตก ำ ออก) · "๊" ⇒ "็" (ล๊อก = ล็อก)
 * → ตัดทุกอักขระที่ไม่ใช่ตัวอักษร/สระวรรณยุกต์/ตัวเลข (ช่องว่าง เครื่องหมาย อักขระความกว้างศูนย์)
 * → ตัวพิมพ์เล็ก
 * หมายเหตุ: เก็บ \p{M} (สระบน/ล่าง วรรณยุกต์ไทย) ไว้ — ถ้าตัดทิ้ง "ํ+า" กับ "๊" จะไม่เหลือให้แปลง
 */
export function normalizeLegalText(text: string): string {
  return text
    .normalize("NFKC")
    .replace(/\u0E4D([\u0E48-\u0E4B]*)\u0E32/g, "$1\u0E33") // ํ(+วรรณยุกต์)+า ⇒ ำ — รับทั้ง "น้ํา" และ "นํ้า"
    .replace(/\u0E4A/g, "\u0E47")
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, "")
    .toLowerCase();
}

// ─────────────────── คำต้องห้าม (#38 #50) ───────────────────

/** คำข่มขู่/ข้อห้ามตามประกาศ (รวมคำพ้อง) — เทียบหลัง normalizeLegalText */
export const FORBIDDEN_TERMS: readonly string[] = [
  "ตัดไฟ",
  "ตัดน้ำ",
  "ตัดน้ำไฟ",
  "งดจ่ายไฟ",
  "ระงับการจ่ายไฟฟ้า",
  "ปิดน้ำปิดไฟ",
  "ล็อกห้อง",
  "ล็อคห้อง",
  "ล็อกประตู",
  "ล็อคประตู",
  "เปลี่ยนกุญแจห้อง",
  "ไม่ให้เข้าห้อง",
  "ยึดของ",
  "ยึดทรัพย์",
  "ขนของออก",
  "ขนย้ายทรัพย์สินออก",
  "cut off",
  "shut off",
  "disconnect",
  "lock out",
  "locked out",
  "evict",
  "seize",
];

const FORBIDDEN_NORMALIZED: readonly { term: string; norm: string }[] = FORBIDDEN_TERMS.map((term) => ({ term, norm: normalizeLegalText(term) }));

/** คืนคำต้องห้ามที่พบในข้อความ (ตามรูปใน FORBIDDEN_TERMS · ไม่ซ้ำ) — D.11/D.17 ใช้ไฮไลต์ */
export function findForbiddenTerms(text: string): string[] {
  if (typeof text !== "string") return [];
  const hay = normalizeLegalText(text);
  const found: string[] = [];
  for (const f of FORBIDDEN_NORMALIZED) if (f.norm.length > 0 && hay.includes(f.norm) && !found.includes(f.term)) found.push(f.term);
  return found;
}

// ─────────────────── ข้อบังคับในสัญญา (#50) ───────────────────

/** ร่างข้อบังคับตามประกาศ 2568 — ⚠️ ร่าง รอที่ปรึกษากฎหมาย (J3) ตรวจถ้อยคำ · เนื้อความต้องตรงตัว (หลัง normalize) */
export const MANDATORY_CLAUSES: readonly { id: string; titleTh: string; textTh: string }[] = [
  {
    id: "rent-fixed",
    titleTh: "ค่าเช่าคงที่ตลอดอายุสัญญา",
    textTh: "ผู้ให้เช่าจะไม่ปรับขึ้นค่าเช่าและค่าบริการส่วนกลางตลอดอายุสัญญานี้ การปรับอัตราทำได้เมื่อต่อสัญญาฉบับใหม่เท่านั้น",
  },
  {
    id: "deposit-limit",
    titleTh: "เงินประกันและค่าเช่าล่วงหน้า",
    textTh: "เงินประกันรวมกับค่าเช่าล่วงหน้าไม่เกินจำนวนเดือนที่ประกาศกำหนด และผู้ให้เช่าออกหลักฐานการรับเงินให้ผู้เช่าทุกครั้ง",
  },
  {
    id: "deposit-return",
    titleTh: "การคืนเงินประกัน",
    textTh: "เมื่อสัญญาสิ้นสุดและผู้เช่าส่งมอบห้องคืน ผู้ให้เช่าคืนเงินประกันภายในระยะเวลาที่ประกาศกำหนด หากมีการหักต้องแจ้งรายการพร้อมหลักฐานความเสียหาย และไม่หักค่าเสื่อมสภาพจากการใช้งานตามปกติ",
  },
  {
    id: "utility-cost",
    titleTh: "ค่าน้ำประปาและค่าไฟฟ้า",
    textTh: "ผู้ให้เช่าเรียกเก็บค่าน้ำประปาและค่าไฟฟ้าไม่เกินอัตราที่หน่วยงานผู้ให้บริการเรียกเก็บจริง แสดงจำนวนหน่วยและราคาต่อหน่วยในใบแจ้งหนี้ และไม่เรียกเก็บค่าขั้นต่ำ",
  },
  {
    id: "inspection-record",
    titleTh: "การตรวจสภาพห้อง",
    textTh: "คู่สัญญาตรวจสภาพห้องและทรัพย์สินร่วมกันในวันเข้าพักและวันส่งมอบห้องคืน โดยบันทึกเป็นหนังสือหรือภาพถ่ายเก็บไว้ทั้งสองฝ่าย",
  },
  {
    id: "termination-notice",
    titleTh: "การบอกเลิกสัญญา",
    textTh: "ผู้เช่าบอกเลิกสัญญาได้โดยแจ้งเป็นหนังสือล่วงหน้าไม่น้อยกว่า 30 วัน ส่วนผู้ให้เช่าบอกเลิกได้เฉพาะเมื่อผู้เช่าผิดสัญญาข้อสำคัญและได้แจ้งให้แก้ไขเป็นหนังสือแล้ว",
  },
  {
    id: "no-self-help",
    titleTh: "การใช้สิทธิ์ตามกฎหมาย",
    textTh: "หากผู้เช่าค้างชำระ ผู้ให้เช่าดำเนินการตามกระบวนการทางกฎหมายเท่านั้น และไม่ระงับบริการสาธารณูปโภคหรือขัดขวางการใช้ห้องพักของผู้เช่า",
  },
];

// ─────────────────── ข้อความ/อ้างอิง ───────────────────

const ANNOUNCEMENT_2568 = "ประกาศคณะกรรมการว่าด้วยสัญญา เรื่อง ให้ธุรกิจให้เช่าอาคารเพื่ออยู่อาศัยเป็นธุรกิจที่ควบคุมสัญญา พ.ศ. 2568";
const cite2568 = (annex: string): string => `${ANNOUNCEMENT_2568} (ภาคผนวก ก ${annex} · เลขข้อรอที่ปรึกษายืนยัน)`;

const thb = (satang: number): string => {
  const neg = satang < 0;
  const a = Math.abs(Math.trunc(satang));
  const baht = Math.floor(a / 100);
  const st = a % 100;
  return `${neg ? "-" : ""}฿${baht.toLocaleString("en-US")}.${st < 10 ? "0" : ""}${st}`;
};

function okVerdict(citation: string): LegalVerdict {
  return { level: "OK", code: "OK", messageTh: "ผ่านเงื่อนไขตามกฎหมาย", citation };
}

// ─────────────────── อินพุตของตัวตรวจ ───────────────────

export type LeaseKind = "SHORT" | "LONG";
/** สถานะ VAT ของหอ — บิลการไฟฟ้า/ประปาเป็นยอดรวม VAT เสมอ · ไม่รวม VAT ⇒ ผู้เช่าจ่ายจริง = ยอด × 107/100 */
export type LegalVatConfig = { registered: boolean; pricesIncludeVat: boolean };

export type LegalRuleInputs = {
  UTIL_FIXED_RATE_LE_COST: { rateSatangPerUnit: number; authorityBillSatang: number | null; authorityUnits: number | null; vat?: LegalVatConfig | null };
  UTIL_TOTAL_LE_BILL: { chargedTotalSatang: number; authorityBillSatang: number | null; vat?: LegalVatConfig | null };
  UTIL_FLAT_LE_COST: { flatSatang: number; payerCount: number; authorityBillSatang: number | null; vat?: LegalVatConfig | null };
  UTIL_NO_MINIMUM: { enabled: boolean; minSatang: number | null };
  DEPOSIT_ADVANCE_LIMIT: { leaseKind: LeaseKind; monthlyRentSatang: number; depositSatang: number; advanceRentSatang: number };
  DEPOSIT_ADVANCE_MONTHS_LIMIT: { leaseKind: LeaseKind; depositMonths: number; advanceMonths: number };
  DEPOSIT_RETURN_DAYS: { days: number };
  TEMPLATE_NO_THREAT: { text: string };
  CONTRACT_MANDATORY_CLAUSES: { clauses: { id: string; text: string }[] };
  DEDUCTION_EVIDENCE: { kind: "DAMAGE" | "NORMAL_WEAR"; evidenceCount: number };
  RENT_LOCKED_IN_LEASE: { context: "MID_LEASE" | "RENEWAL"; oldSatang: number; newSatang: number };
  LATE_FEE_CAP: { feeSatang: number };
};
export type LegalRuleId = keyof LegalRuleInputs;
export type LegalRule<K extends LegalRuleId> = (input: LegalRuleInputs[K], params: ThRental2568ParamValues) => LegalVerdict;

// ─────────────────── ตรวจรูปอินพุต (ค่าเพี้ยน ⇒ INVALID_INPUT) ───────────────────

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === "object" && v !== null && !Array.isArray(v);
/** จำนวนเต็มปลอดภัย ≥ 0 (ตัด NaN/Infinity/ติดลบ/ทศนิยม/undefined) */
const isNat = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
const isNatOrNull = (v: unknown): boolean => v === null || isNat(v);
const isVatOpt = (v: unknown): boolean =>
  v === undefined || v === null || (isRec(v) && typeof v.registered === "boolean" && typeof v.pricesIncludeVat === "boolean");
const isLeaseKind = (v: unknown): boolean => v === "SHORT" || v === "LONG";

const VALIDATORS: { readonly [K in LegalRuleId]: (i: Rec) => boolean } = {
  UTIL_FIXED_RATE_LE_COST: (i) => isNat(i.rateSatangPerUnit) && isNatOrNull(i.authorityBillSatang) && isNatOrNull(i.authorityUnits) && isVatOpt(i.vat),
  UTIL_TOTAL_LE_BILL: (i) => isNat(i.chargedTotalSatang) && isNatOrNull(i.authorityBillSatang) && isVatOpt(i.vat),
  UTIL_FLAT_LE_COST: (i) => isNat(i.flatSatang) && isNat(i.payerCount) && isNatOrNull(i.authorityBillSatang) && isVatOpt(i.vat),
  UTIL_NO_MINIMUM: (i) => typeof i.enabled === "boolean" && isNatOrNull(i.minSatang),
  DEPOSIT_ADVANCE_LIMIT: (i) => isLeaseKind(i.leaseKind) && isNat(i.monthlyRentSatang) && isNat(i.depositSatang) && isNat(i.advanceRentSatang),
  DEPOSIT_ADVANCE_MONTHS_LIMIT: (i) => isLeaseKind(i.leaseKind) && isNat(i.depositMonths) && isNat(i.advanceMonths),
  DEPOSIT_RETURN_DAYS: (i) => isNat(i.days),
  TEMPLATE_NO_THREAT: (i) => typeof i.text === "string",
  CONTRACT_MANDATORY_CLAUSES: (i) =>
    Array.isArray(i.clauses) && i.clauses.every((c: unknown) => isRec(c) && typeof c.id === "string" && typeof c.text === "string"),
  DEDUCTION_EVIDENCE: (i) => (i.kind === "DAMAGE" || i.kind === "NORMAL_WEAR") && isNat(i.evidenceCount),
  RENT_LOCKED_IN_LEASE: (i) => (i.context === "MID_LEASE" || i.context === "RENEWAL") && isNat(i.oldSatang) && isNat(i.newSatang),
  LATE_FEE_CAP: (i) => isNat(i.feeSatang),
};

const invalidInput = (ruleId: string): LegalVerdict => ({
  level: "BLOCK",
  code: "INVALID_INPUT",
  messageTh: `ข้อมูลที่ส่งให้ตัวตรวจ ${ruleId} ไม่ครบหรือไม่ถูกรูปแบบ (ต้องเป็นจำนวนเต็มไม่ติดลบ) — ตรวจค่าที่กรอกอีกครั้ง`,
  citation: ANNOUNCEMENT_2568,
  always: true,
});

// ─────────────────── ตัวตรวจ ───────────────────

const costUnknown = (citation: string): LegalVerdict => ({
  level: "WARN",
  code: "UTIL_COST_UNKNOWN",
  messageTh: "ยังไม่มีบิลจากการไฟฟ้า/การประปาของงวดนี้ จึงยังเทียบกับต้นทุนจริงไม่ได้ — แนบบิลเพื่อให้ระบบตรวจให้",
  citation,
});

const maxMonthsFor = (kind: LeaseKind, p: ThRental2568ParamValues): number =>
  kind === "LONG" ? p.depositAdvanceMaxMonthsLong : p.depositAdvanceMaxMonthsShort;

// tsconfig target < ES2020 ⇒ ห้าม BigInt literal (100n) — สร้างผ่าน BigInt()
const B100 = BigInt(100);
const B107 = BigInt(107);
/** ยอดที่ผู้เช่าจ่ายจริง (×100 เพื่อเทียบแบบจำนวนเต็มไม่ปัด) — จด VAT + ราคาไม่รวม VAT ⇒ ×107 */
const grossX100 = (amount: bigint, vat: LegalVatConfig | null | undefined): bigint =>
  vat && vat.registered && !vat.pricesIncludeVat ? amount * B107 : amount * B100;
const vatNoteTh = (vat: LegalVatConfig | null | undefined): string => (vat && vat.registered && !vat.pricesIncludeVat ? " (รวม VAT 7% ที่ผู้เช่าจ่ายจริง)" : "");

const RAW_RULES: { readonly [K in LegalRuleId]: LegalRule<K> } = {
  UTIL_FIXED_RATE_LE_COST: (i) => {
    const c = cite2568("#11");
    const bill = i.authorityBillSatang;
    const units = i.authorityUnits;
    if (bill === null || units === null || units <= 0) return costUnknown(c);
    if (grossX100(BigInt(i.rateSatangPerUnit) * BigInt(units), i.vat) > BigInt(bill) * B100) {
      return {
        level: "BLOCK",
        code: "UTIL_FIXED_RATE_LE_COST",
        messageTh: `อัตราคงที่ ${thb(i.rateSatangPerUnit)}/หน่วย${vatNoteTh(i.vat)} สูงกว่าต้นทุนจริงจากบิล (${thb(bill)} ÷ ${units} หน่วย) — ตั้งได้ไม่เกินต้นทุนจริง`,
        citation: c,
      };
    }
    return okVerdict(c);
  },
  UTIL_TOTAL_LE_BILL: (i) => {
    const c = cite2568("#10");
    if (i.authorityBillSatang === null) return costUnknown(c);
    // chargedTotalSatang = ยอดที่ผู้เช่าจ่ายจริง (gross รวม VAT แล้ว) — ไม่บวก VAT ซ้ำ (ใบสั่ง §7 ข้อ 2)
    if (i.chargedTotalSatang > i.authorityBillSatang) {
      return {
        level: "BLOCK",
        code: "UTIL_TOTAL_LE_BILL",
        messageTh: `ยอดค่าน้ำ/ไฟที่ผู้เช่าจ่ายรวมทั้งงวด ${thb(i.chargedTotalSatang)} สูงกว่าบิลจริง ${thb(i.authorityBillSatang)} — เก็บรวมได้ไม่เกินบิล`,
        citation: c,
      };
    }
    return okVerdict(c);
  },
  UTIL_FLAT_LE_COST: (i) => {
    const c = cite2568("#12");
    if (i.authorityBillSatang === null) return costUnknown(c);
    const total = BigInt(i.flatSatang) * BigInt(i.payerCount);
    if (grossX100(total, i.vat) > BigInt(i.authorityBillSatang) * B100) {
      return {
        level: "BLOCK",
        code: "UTIL_FLAT_LE_COST",
        messageTh: `ค่าเหมาจ่าย ${thb(i.flatSatang)} × ${i.payerCount} ราย${vatNoteTh(i.vat)} สูงกว่าบิลจริง ${thb(i.authorityBillSatang)} — ปรับค่าเหมาให้ไม่เกินต้นทุน`,
        citation: c,
      };
    }
    return okVerdict(c);
  },
  UTIL_NO_MINIMUM: (i) => {
    const c = cite2568("#13");
    if (i.enabled && i.minSatang !== null && i.minSatang > 0) {
      return {
        level: "BLOCK",
        code: "UTIL_NO_MINIMUM",
        messageTh: "ประกาศห้ามเรียกเก็บค่าน้ำ/ไฟขั้นต่ำ — ปิดค่าขั้นต่ำแล้วคิดตามหน่วยที่ใช้จริง",
        citation: c,
      };
    }
    return okVerdict(c);
  },
  DEPOSIT_ADVANCE_LIMIT: (i, p) => {
    const c = cite2568("#43/#44");
    const max = maxMonthsFor(i.leaseKind, p);
    const limit = BigInt(i.monthlyRentSatang) * BigInt(Math.max(0, Math.trunc(max)));
    const sum = BigInt(i.depositSatang) + BigInt(i.advanceRentSatang);
    if (sum > limit) {
      return {
        level: "BLOCK",
        code: "DEPOSIT_ADVANCE_LIMIT",
        messageTh: `เงินประกัน + ค่าเช่าล่วงหน้า ${thb(i.depositSatang + i.advanceRentSatang)} เกิน ${max} เดือนของค่าห้อง (${thb(i.monthlyRentSatang * max)}) — ลดยอดให้ไม่เกินเพดาน`,
        citation: c,
      };
    }
    return okVerdict(c);
  },
  DEPOSIT_ADVANCE_MONTHS_LIMIT: (i, p) => {
    const c = cite2568("#43/#44");
    const max = maxMonthsFor(i.leaseKind, p);
    const sum = i.depositMonths + i.advanceMonths;
    if (sum > max) {
      return {
        level: "BLOCK",
        code: "DEPOSIT_ADVANCE_MONTHS_LIMIT",
        messageTh: `ประกัน ${i.depositMonths} เดือน + ล่วงหน้า ${i.advanceMonths} เดือน รวม ${sum} เดือน เกินเพดาน ${max} เดือน`,
        citation: c,
      };
    }
    return okVerdict(c);
  },
  DEPOSIT_RETURN_DAYS: (i, p) => {
    const c = cite2568("#47");
    if (i.days > p.depositReturnMaxDays) {
      return {
        level: "BLOCK",
        code: "DEPOSIT_RETURN_DAYS",
        messageTh: `กำหนดคืนเงินประกัน ${i.days} วัน เกินที่ประกาศกำหนด ${p.depositReturnMaxDays} วัน`,
        citation: c,
      };
    }
    return okVerdict(c);
  },
  TEMPLATE_NO_THREAT: (i) => {
    const c = "หลักห้ามข่มขู่/ใช้กำลังบังคับชำระหนี้ (ภาคผนวก ก #38) · ประกาศ สคบ. ว่าด้วยข้อห้ามในสัญญาเช่า";
    const found = findForbiddenTerms(i.text);
    if (found.length > 0) {
      return {
        level: "BLOCK",
        code: "TEMPLATE_NO_THREAT",
        messageTh: `ข้อความมีคำที่เข้าข่ายข่มขู่ (${found.join(", ")}) — ใช้ถ้อยคำแจ้งยอดและวันครบกำหนดแทน`,
        citation: c,
        always: true,
      };
    }
    return okVerdict(c);
  },
  CONTRACT_MANDATORY_CLAUSES: (i) => {
    const c = cite2568("#50");
    for (const cl of i.clauses) {
      const found = findForbiddenTerms(cl.text);
      if (found.length > 0) {
        return {
          level: "BLOCK",
          code: "CONTRACT_FORBIDDEN_TERM",
          messageTh: `ข้อ "${cl.id}" มีข้อความที่ประกาศห้ามใส่ในสัญญา (${found.join(", ")}) — แก้ถ้อยคำก่อนใช้แม่แบบ`,
          citation: c,
          always: true,
        };
      }
    }
    // ข้อบังคับต้องอยู่ครบ "และเนื้อความตรงตัว" (หลัง normalize) — แก้ถ้อยคำ = ถือว่าลบ
    const missing = MANDATORY_CLAUSES.filter((m) => {
      const want = normalizeLegalText(m.textTh);
      return !i.clauses.some((cl) => cl.id === m.id && normalizeLegalText(cl.text) === want);
    });
    if (missing.length > 0) {
      return {
        level: "BLOCK",
        code: "CONTRACT_MANDATORY_REMOVED",
        messageTh: `แม่แบบสัญญาขาดหรือแก้ถ้อยคำข้อบังคับตามประกาศ: ${missing.map((m) => m.titleTh).join(" · ")} — ข้อเหล่านี้ลบหรือแก้ไม่ได้`,
        citation: c,
      };
    }
    return okVerdict(c);
  },
  DEDUCTION_EVIDENCE: (i) => {
    const c = "การหักเงินประกันต้องเป็นความเสียหายจริงที่มีหลักฐาน ไม่รวมความเสื่อมจากการใช้งานปกติ (ภาคผนวก ก #49 · แบบ A9)";
    if (i.kind !== "DAMAGE") {
      return {
        level: "BLOCK",
        code: "DEDUCT_NORMAL_WEAR",
        messageTh: "ค่าเสื่อมสภาพจากการใช้งานตามปกติหักจากเงินประกันไม่ได้",
        citation: c,
        always: true,
      };
    }
    if (i.evidenceCount < 1) {
      return {
        level: "BLOCK",
        code: "DEDUCT_NO_EVIDENCE",
        messageTh: "รายการหักค่าเสียหายต้องแนบหลักฐาน (เช่น รูปถ่าย) อย่างน้อย 1 ชิ้น",
        citation: c,
      };
    }
    return okVerdict(c);
  },
  RENT_LOCKED_IN_LEASE: (i) => {
    const c = cite2568("#6");
    if (i.context === "MID_LEASE" && i.newSatang > i.oldSatang) {
      return {
        level: "BLOCK",
        code: "RENT_LOCKED_IN_LEASE",
        messageTh: `ขึ้นค่าเช่าระหว่างสัญญาไม่ได้ (${thb(i.oldSatang)} → ${thb(i.newSatang)}) — ปรับราคาได้ตอนต่อสัญญา`,
        citation: c,
      };
    }
    return okVerdict(c);
  },
  LATE_FEE_CAP: (i, p) => {
    const c = cite2568("#31–34");
    const cap = p.lateFeeCapSatang;
    if (cap === null) {
      return { ...okVerdict(c), messageTh: "ยังไม่มีเพดานค่าปรับตามกฎหมาย (รอที่ปรึกษาตรวจ)", pendingReview: true };
    }
    if (i.feeSatang > cap) {
      return {
        level: "BLOCK",
        code: "LATE_FEE_CAP",
        messageTh: `ค่าปรับชำระล่าช้า ${thb(i.feeSatang)} เกินเพดาน ${thb(cap)} — ลดค่าปรับให้ไม่เกินเพดาน`,
        citation: c,
        pendingReview: TH_RENTAL_2568_PARAMS.lateFeeCapSatang.review === "PENDING_LEGAL_REVIEW" ? true : undefined,
      };
    }
    return okVerdict(c);
  },
};

function guarded<K extends LegalRuleId>(ruleId: K): LegalRule<K> {
  const rule = RAW_RULES[ruleId] as LegalRule<K>;
  const valid = VALIDATORS[ruleId];
  return (input, params) => (isRec(input) && valid(input) ? rule(input, params) : invalidInput(ruleId));
}

/** ตัวตรวจระดับดิบ — `rule(input, params)` ไม่รู้เรื่องโหมด (โหมดอยู่ที่ evaluateLegal) · อินพุตเพี้ยน ⇒ BLOCK INVALID_INPUT */
export const TH_RENTAL_2568_RULES: { readonly [K in LegalRuleId]: LegalRule<K> } = {
  UTIL_FIXED_RATE_LE_COST: guarded("UTIL_FIXED_RATE_LE_COST"),
  UTIL_TOTAL_LE_BILL: guarded("UTIL_TOTAL_LE_BILL"),
  UTIL_FLAT_LE_COST: guarded("UTIL_FLAT_LE_COST"),
  UTIL_NO_MINIMUM: guarded("UTIL_NO_MINIMUM"),
  DEPOSIT_ADVANCE_LIMIT: guarded("DEPOSIT_ADVANCE_LIMIT"),
  DEPOSIT_ADVANCE_MONTHS_LIMIT: guarded("DEPOSIT_ADVANCE_MONTHS_LIMIT"),
  DEPOSIT_RETURN_DAYS: guarded("DEPOSIT_RETURN_DAYS"),
  TEMPLATE_NO_THREAT: guarded("TEMPLATE_NO_THREAT"),
  CONTRACT_MANDATORY_CLAUSES: guarded("CONTRACT_MANDATORY_CLAUSES"),
  DEDUCTION_EVIDENCE: guarded("DEDUCTION_EVIDENCE"),
  RENT_LOCKED_IN_LEASE: guarded("RENT_LOCKED_IN_LEASE"),
  LATE_FEE_CAP: guarded("LATE_FEE_CAP"),
};

// ─────────────────── โหมด (§2.4) ───────────────────

export type LegalCtx = { mode: LegalMode; outOfScopeReason?: string | null; params?: Record<string, unknown> | null };

/** เหตุผลนอกขอบเขตขั้นต่ำ (ตัวอักษร หลังตัดอักขระความกว้างศูนย์และช่องว่างหัวท้าย) */
export const OUT_OF_SCOPE_REASON_MIN_CHARS = 10;

export function isValidOutOfScopeReason(reason: string | null | undefined): boolean {
  if (typeof reason !== "string") return false;
  // ตัดอักขระควบคุมรูปแบบที่มองไม่เห็นทั้งหมด (\p{Cf}: U+200B–U+200F · U+2060 · U+FEFF · U+00AD ฯลฯ) แล้วตัดช่องว่างหัวท้าย
  const cleaned = reason.replace(/\p{Cf}+/gu, "").trim();
  return [...cleaned].length >= OUT_OF_SCOPE_REASON_MIN_CHARS;
}

/** โหมดที่ไม่รู้จัก/ไม่ส่ง ⇒ STRICT (ปลอดภัยสุด) */
export function normalizeLegalMode(mode: unknown): LegalMode {
  return mode === "WARN" || mode === "OUT_OF_SCOPE" || mode === "STRICT" ? mode : "STRICT";
}

export function evaluateLegal<K extends LegalRuleId>(ruleId: K, input: LegalRuleInputs[K], ctx: LegalCtx): LegalOutcome {
  const mode = normalizeLegalMode(isRec(ctx) ? ctx.mode : undefined);
  const rule = Object.prototype.hasOwnProperty.call(TH_RENTAL_2568_RULES, ruleId) ? (TH_RENTAL_2568_RULES[ruleId] as LegalRule<K>) : undefined;
  if (!rule) {
    return {
      level: "BLOCK",
      code: "UNKNOWN_RULE",
      messageTh: `ไม่รู้จักตัวตรวจ ${String(ruleId)}`,
      citation: ANNOUNCEMENT_2568,
      always: true,
      raw: "BLOCK",
      mode,
      needsAck: false,
      needsOwnerApproval: false,
    };
  }
  const v = rule(input, resolveLegalParams(isRec(ctx) ? ctx.params : null));
  const base = { ...v, raw: v.level, mode };

  if (mode === "OUT_OF_SCOPE") {
    if (!isValidOutOfScopeReason(ctx.outOfScopeReason)) {
      return {
        ...base,
        level: "BLOCK",
        code: "OUT_OF_SCOPE_REASON_REQUIRED",
        messageTh: `โหมดนอกขอบเขตประกาศต้องระบุเหตุผลอย่างน้อย ${OUT_OF_SCOPE_REASON_MIN_CHARS} ตัวอักษร (เช่น ให้เช่าไม่ถึง 3 ห้อง) ก่อนใช้งาน`,
        citation: cite2568("#3"),
        needsAck: false,
        needsOwnerApproval: false,
      };
    }
    if (v.level === "BLOCK" && v.always) return { ...base, needsAck: false, needsOwnerApproval: false };
    return { ...base, level: "OK", needsAck: false, needsOwnerApproval: false };
  }

  if (v.level === "OK") return { ...base, needsAck: false, needsOwnerApproval: false };
  if (v.level === "WARN") return { ...base, needsAck: true, needsOwnerApproval: false };
  // BLOCK
  if (v.always || mode === "STRICT") return { ...base, needsAck: false, needsOwnerApproval: false };
  return { ...base, level: "WARN", needsAck: true, needsOwnerApproval: true };
}

// ─────────────────── ขอบเขต (#1) · ประเภทสัญญา (#42) ───────────────────

export function legalScope(f: { roomCount: number; businessType: BusinessType }, params?: Record<string, unknown> | null): {
  inScope: boolean;
  code: string;
  defaultMode: LegalMode;
  autoReasonTh: string | null;
} {
  const p = resolveLegalParams(params);
  if (f.roomCount < p.scopeMinRooms) {
    return {
      inScope: false,
      code: "OUT_OF_SCOPE_FEW_ROOMS",
      defaultMode: "OUT_OF_SCOPE",
      autoReasonTh: `ให้เช่าน้อยกว่า ${p.scopeMinRooms} ห้อง จึงไม่อยู่ในขอบเขตประกาศ สคบ. 2568`,
    };
  }
  const typeInScope = f.businessType === "APARTMENT" || f.businessType === "SERVICED_APT";
  return {
    inScope: typeInScope,
    code: typeInScope ? "IN_SCOPE" : "OUT_OF_SCOPE_BUSINESS_TYPE",
    defaultMode: "STRICT", // หอนักศึกษา/โรงแรมใช้กฎเดียวกันเป็นค่าเริ่ม เพราะปลอดภัยกว่า (แบบ §3)
    autoReasonTh: null,
  };
}

export function leaseKind(months: number, params?: Record<string, unknown> | null): LeaseKind | null {
  if (!Number.isInteger(months) || months <= 0) return null;
  const p = resolveLegalParams(params);
  if (months <= p.shortLeaseMaxMonths) return "SHORT";
  if (months <= p.longLeaseMaxMonths) return "LONG";
  return null;
}
