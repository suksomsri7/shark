// HR H3.3 ▸ เครื่องคิดเงินเดือนรุ่น 2 (engineVersion = 2) — ประกันสังคม + ภาษีหัก ณ ที่จ่าย จาก "แถวกฎหมาย" (HrLawTable) ไม่ใช่ค่าคงที่
//
// 🔴 pure ล้วน: แถวกฎหมาย + ตัวเลขเข้า → ผลออก · ไม่มี DB/นาฬิกา/สุ่ม/env/async · import ได้แค่ type · ไม่แก้ค่าที่รับเข้ามา
// 🔴 เงิน = สตางค์จำนวนเต็มทุกขั้น · ปัดเศษเฉพาะจุดที่รุ่น 1 ปัด (ปสส. ปัดบาทเต็มครึ่งขึ้น · ภาษีทั้งปีปัดสตางค์ครั้งเดียว ·
//    ภาษีรายเดือนปัดครึ่งขึ้น) + บรรทัดค่าใช้จ่าย 50% (Q4) — ตัวเลขตายตัวด้วยเวกเตอร์ใน scripts/fixtures/hr-h3.3-vectors.json
// 🔴 รุ่น 1 (payroll-rules.ts) ไม่แตะ — งวดเดิมคิดด้วยรุ่น 1 ต่อไป · ใบ H3.4 เป็นผู้ต่อรุ่น 2 เข้ากับงวดเงินเดือน
// ปฏิเสธ = โยน Error ที่มี .code: LAW_SHAPE (json แถวกฎหมายไม่ใช่รูปที่รู้จัก) · BAD_SATANG (เงินติดลบ/ไม่ใช่จำนวนเต็ม) ·
//   BAD_MONTH (เดือน 1–12) · BAD_KIND (ชนิดรายการเพิ่ม/หักที่ไม่รู้จัก) · BAD_DEDUCTION (ค่าลดหย่อนผิดรูป) · BAD_DAY (วันไม่ใช่ YYYY-MM-DD) ·
//   LAW_MISSING (ชุดกฎหมายขาดแถว — ไม่มีการถอยไปใช้ค่าคงที่รุ่น 1)
/** ชนิดแถวกฎหมาย (ตรงกับ enum HrLawKind ใน payroll.prisma — ไม่ import จาก client เพื่อคงไฟล์นี้ให้ไม่มีอะไรเกี่ยวกับฐาน) */
export type HrLawKind = "SSO" | "TAX_BRACKET" | "DEDUCTION" | "OT" | "MIN_WAGE";

export const ENGINE_VERSION_V2 = 2;

export type LawErrorCode = "LAW_SHAPE" | "BAD_SATANG" | "BAD_MONTH" | "BAD_KIND" | "BAD_DEDUCTION" | "BAD_DAY" | "LAW_MISSING";

/** ข้อผิดพลาดของเครื่องรุ่น 2 — ผู้เรียกอ่าน .code (ข้อความไทยอยู่ที่ law.ts LAW_MSG) */
export class LawEngineError extends Error {
  readonly code: LawErrorCode;
  constructor(code: LawErrorCode, detail: string) {
    super(`${code}: ${detail}`);
    this.name = "LawEngineError";
    this.code = code;
  }
}
const fail = (code: LawErrorCode, detail: string): never => {
  throw new LawEngineError(code, detail);
};

// ═════════════ รูปของ json แถวกฎหมาย (ตรงกับ LAW_V1_ROWS ของ scripts/hr-seed-law-draft.mts) ═════════════
export type SsoLawJson = { rateBp: number; minBaseSatang: number; maxBaseSatang: number; rounding: "BAHT_HALF_UP"; employerEqualsEmployee: true };
export type TaxBand = { upToSatang: number | null; rateBp: number };
export type TaxLawJson = { bands: TaxBand[]; rounding: "SATANG_HALF_UP_ONCE" };
export type DeductionLawJson = {
  expenseRateBp: number;
  expenseCapSatang: number;
  personalSatang: number;
  spouseSatang: number;
  childSatang: number;
  ssoAllowanceCapSatang: number;
};
export type LawRowLike = { id: string; json: unknown };
export type LawSetV2 = { SSO: LawRowLike; TAX_BRACKET: LawRowLike; DEDUCTION: LawRowLike };
export type DeductionsV2 = { spouse?: boolean; children?: number };

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const isInt = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v);
const isNonNegInt = (v: unknown): v is number => isInt(v) && v >= 0;
/** กุญแจต้องครบและไม่มีกุญแจแปลก (แถวใหม่ที่มีช่องเพิ่ม = รูปใหม่ ต้องมีใบงานรองรับก่อน) */
function exactKeys(o: Record<string, unknown>, keys: readonly string[], what: string): void {
  const got = Object.keys(o).sort().join(",");
  const want = [...keys].sort().join(",");
  if (got !== want) fail("LAW_SHAPE", `${what} keys ${got} ≠ ${want}`);
}

export function parseSsoJson(json: unknown): SsoLawJson {
  if (!isObj(json)) return fail("LAW_SHAPE", "SSO json not an object");
  exactKeys(json, ["rateBp", "minBaseSatang", "maxBaseSatang", "rounding", "employerEqualsEmployee"], "SSO");
  const { rateBp, minBaseSatang, maxBaseSatang, rounding, employerEqualsEmployee } = json;
  if (!isNonNegInt(rateBp) || rateBp > 10_000) fail("LAW_SHAPE", "SSO rateBp");
  if (!isNonNegInt(minBaseSatang) || !isNonNegInt(maxBaseSatang) || (minBaseSatang as number) > (maxBaseSatang as number)) fail("LAW_SHAPE", "SSO base range");
  if (rounding !== "BAHT_HALF_UP") fail("LAW_SHAPE", "SSO rounding");
  if (employerEqualsEmployee !== true) fail("LAW_SHAPE", "SSO employer rate ≠ employee rate is not supported (NA-06)");
  return json as unknown as SsoLawJson;
}

export function parseTaxJson(json: unknown): TaxLawJson {
  if (!isObj(json)) return fail("LAW_SHAPE", "TAX json not an object");
  exactKeys(json, ["bands", "rounding"], "TAX_BRACKET");
  if (json.rounding !== "SATANG_HALF_UP_ONCE") fail("LAW_SHAPE", "TAX rounding");
  const bands = json.bands;
  if (!Array.isArray(bands) || bands.length === 0) return fail("LAW_SHAPE", "TAX bands empty");
  let prev = 0;
  bands.forEach((b: unknown, i: number) => {
    if (!isObj(b)) return fail("LAW_SHAPE", `TAX band ${i}`);
    exactKeys(b, ["upToSatang", "rateBp"], `TAX band ${i}`);
    if (!isNonNegInt(b.rateBp) || (b.rateBp as number) > 10_000) fail("LAW_SHAPE", `TAX band ${i} rateBp`);
    const last = i === bands.length - 1;
    if (last) {
      if (b.upToSatang !== null) fail("LAW_SHAPE", "TAX last band must be open (upToSatang null)");
    } else {
      if (!isInt(b.upToSatang) || (b.upToSatang as number) <= prev) fail("LAW_SHAPE", `TAX band ${i} not ascending`);
      prev = b.upToSatang as number;
    }
  });
  return json as unknown as TaxLawJson;
}

export function parseDeductionJson(json: unknown): DeductionLawJson {
  if (!isObj(json)) return fail("LAW_SHAPE", "DEDUCTION json not an object");
  const keys = ["expenseRateBp", "expenseCapSatang", "personalSatang", "spouseSatang", "childSatang", "ssoAllowanceCapSatang"] as const;
  exactKeys(json, keys, "DEDUCTION");
  for (const k of keys) if (!isNonNegInt(json[k])) fail("LAW_SHAPE", `DEDUCTION ${k}`);
  if ((json.expenseRateBp as number) > 10_000) fail("LAW_SHAPE", "DEDUCTION expenseRateBp");
  return json as unknown as DeductionLawJson;
}

/** json ของแถวกฎหมายชนิดที่เครื่องรุ่น 2 ยังไม่อ่าน (OT · MIN_WAGE — Q12): จำนวนเต็ม/null/สตริงสั้นเท่านั้น ห้ามทศนิยม */
export function parseOtherLawJson(json: unknown): Record<string, unknown> {
  if (!isObj(json)) return fail("LAW_SHAPE", "json not an object");
  const bad = (v: unknown): boolean =>
    typeof v === "number" ? !Number.isSafeInteger(v) : Array.isArray(v) ? v.some(bad) : isObj(v) ? Object.values(v).some(bad) : !(v === null || typeof v === "string" || typeof v === "boolean");
  if (Object.keys(json).length === 0 || bad(json)) fail("LAW_SHAPE", "integers only (no float)");
  return json;
}

/** ตรวจ json ตามชนิดแถว (ใช้ทั้งเครื่องคิดและหลังบ้านก่อนบันทึก) */
export function assertLawJson(kind: HrLawKind, json: unknown): void {
  if (kind === "SSO") parseSsoJson(json);
  else if (kind === "TAX_BRACKET") parseTaxJson(json);
  else if (kind === "DEDUCTION") parseDeductionJson(json);
  else parseOtherLawJson(json);
}

// ═════════════ เลขจำนวนเต็ม ═════════════
const satang = (v: unknown, what: string): number => (isNonNegInt(v) ? v : fail("BAD_SATANG", `${what} must be a non-negative integer satang`));
/** ปัดครึ่งขึ้นของ num/den (num ≥ 0, den > 0) แบบจำนวนเต็มล้วน = Math.round(num/den) ของรุ่น 1 */
const roundDivHalfUp = (num: number, den: number): number => Math.floor((2 * num + den) / (2 * den));
function month(v: unknown): number {
  if (!isInt(v) || v < 1 || v > 12) fail("BAD_MONTH", "monthIndex must be an integer 1..12");
  return v as number;
}
function deductionsOf(d: unknown): { spouse: boolean; children: number } {
  if (d === undefined || d === null) return { spouse: false, children: 0 };
  if (!isObj(d)) return fail("BAD_DEDUCTION", "deductions not an object");
  const raw = d.children ?? 0;
  if (!isInt(raw) || raw > 99) fail("BAD_DEDUCTION", "children must be an integer ≤ 99");
  // ติดลบ = 0 เหมือนรุ่น 1 (payroll-rules.monthlyWhtSatang · payroll.computeItem) — ตายตัวด้วยเวกเตอร์ WHA-23
  return { spouse: d.spouse === true, children: Math.max(0, raw as number) };
}

// ═════════════ 1) ประกันสังคม ═════════════
/** ฐาน = clamp(ค่าจ้าง, ต่ำสุด, สูงสุด) · เงินสมทบ = ฐาน × อัตรา ปัดเป็นบาทเต็มครึ่งขึ้น · นายจ้าง = ลูกจ้าง (= ssoContribution ของรุ่น 1 เมื่อ json = แถว v1) */
export function ssoV2(wageSatang: number, ssoJson: unknown): { baseSatang: number; employeeSatang: number; employerSatang: number } {
  const law = parseSsoJson(ssoJson);
  const wage = satang(wageSatang, "wage");
  const baseSatang = Math.min(Math.max(wage, law.minBaseSatang), law.maxBaseSatang);
  // ฐาน(สตางค์) × bp ÷ 10,000 = สตางค์ · ÷ 100 = บาท → ปัดบาทเต็ม → × 100
  const employeeSatang = roundDivHalfUp(baseSatang * law.rateBp, 1_000_000) * 100;
  return { baseSatang, employeeSatang, employerSatang: employeeSatang };
}

// ═════════════ 2) ภาษีทั้งปีตามขั้น ═════════════
/** ภาษีทั้งปีของเงินได้สุทธิ (สตางค์) · ปัดสตางค์ครั้งเดียวท้ายสุด (ครึ่งขึ้น) · ≤ 0 = 0 */
export function annualTaxV2(netSatang: number, taxJson: unknown): number {
  const law = parseTaxJson(taxJson);
  if (!isInt(netSatang)) fail("BAD_SATANG", "net income must be an integer satang");
  if (netSatang <= 0) return 0;
  // ผลรวม (เงินในขั้น × bp) เป็นจำนวนเต็ม → ÷ 10,000 ครั้งเดียว
  let num = 0;
  let prev = 0;
  for (const b of law.bands) {
    if (netSatang <= prev) break;
    const top = b.upToSatang === null ? netSatang : Math.min(netSatang, b.upToSatang);
    num += (top - prev) * b.rateBp;
    if (b.upToSatang === null) break;
    prev = b.upToSatang;
  }
  return roundDivHalfUp(num, 10_000);
}

/** เงินได้สุทธิทั้งปี = เงินได้ − ค่าใช้จ่าย (อัตรา·เพดาน) − ส่วนตัว − คู่สมรส − บุตร − ปสส.(เพดาน) · ไม่ติดลบ */
function netIncomeV2(incomeSatang: number, ssoYearSatang: number, d: { spouse: boolean; children: number }, ded: DeductionLawJson): number {
  const expense = Math.min(roundDivHalfUp(incomeSatang * ded.expenseRateBp, 10_000), ded.expenseCapSatang);
  const spouse = d.spouse ? ded.spouseSatang : 0;
  const children = d.children * ded.childSatang;
  const sso = Math.min(ssoYearSatang, ded.ssoAllowanceCapSatang);
  return Math.max(0, incomeSatang - expense - ded.personalSatang - spouse - children - sso);
}

// ═════════════ 3a) ภาษีหัก ณ ที่จ่าย วิธีรุ่น 1 (ทำให้เต็มปี × 12 ÷ 12) บนแถวกฎหมาย ═════════════
export function whtAnnualisedV2(
  input: { monthlyIncomeSatang: number; ssoEmployeeYearSatang: number; deductions?: DeductionsV2 },
  taxJson: unknown,
  dedJson: unknown,
): number {
  const ded = parseDeductionJson(dedJson);
  parseTaxJson(taxJson);
  const monthly = satang(input.monthlyIncomeSatang, "monthlyIncome");
  const ssoYear = satang(input.ssoEmployeeYearSatang, "ssoEmployeeYear");
  const net = netIncomeV2(monthly * 12, ssoYear, deductionsOf(input.deductions), ded);
  return roundDivHalfUp(annualTaxV2(net, taxJson), 12);
}

// ═════════════ 3b) ภาษีหัก ณ ที่จ่าย แบบสะสมทั้งปี (YTD · Q4) ═════════════
// k = 12 − เดือน · เงินได้ประมาณการ = สะสมก่อนหน้า + เดือนนี้ + ประจำ × k · ปสส. ประมาณการแบบเดียวกัน
// ภาษีทั้งปีจากเงินได้สุทธิประมาณการ · หักเดือนนี้ = max(0, ปัดครึ่งขึ้น((ภาษีทั้งปี − หักไปแล้ว) ÷ (k + 1))) · ธันวาคม (k = 0) = ปรับให้ตรงทั้งปี
export type WhtYtdInput = {
  monthIndex: number;
  currentIncomeSatang: number;
  regularMonthlySatang: number;
  priorIncomeSatang: number;
  priorWhtSatang: number;
  currentSsoSatang: number;
  regularSsoSatang: number;
  priorSsoSatang: number;
  deductions?: DeductionsV2;
};
export type WhtYtdResult = { whtSatang: number; projectedIncomeSatang: number; projectedNetSatang: number; annualTaxSatang: number; projectedSsoSatang: number; remainingMonths: number };
export function whtYtdV2(input: WhtYtdInput, taxJson: unknown, dedJson: unknown): WhtYtdResult {
  const ded = parseDeductionJson(dedJson);
  parseTaxJson(taxJson);
  const m = month(input.monthIndex);
  const cur = satang(input.currentIncomeSatang, "currentIncome");
  const reg = satang(input.regularMonthlySatang, "regularMonthly");
  const pInc = satang(input.priorIncomeSatang, "priorIncome");
  const pWht = satang(input.priorWhtSatang, "priorWht");
  const cSso = satang(input.currentSsoSatang, "currentSso");
  const rSso = satang(input.regularSsoSatang, "regularSso");
  const pSso = satang(input.priorSsoSatang, "priorSso");
  const d = deductionsOf(input.deductions);
  const k = 12 - m;
  const projectedIncomeSatang = pInc + cur + reg * k;
  const projectedSsoSatang = pSso + cSso + rSso * k;
  const projectedNetSatang = netIncomeV2(projectedIncomeSatang, projectedSsoSatang, d, ded);
  const annualTaxSatang = annualTaxV2(projectedNetSatang, taxJson);
  const due = annualTaxSatang - pWht;
  const whtSatang = due <= 0 ? 0 : roundDivHalfUp(due, k + 1); // หักเกินมาแล้ว = 0 (ไม่คืนเงินในงวด — NA-09)
  return { whtSatang, projectedIncomeSatang, projectedNetSatang, annualTaxSatang, projectedSsoSatang, remainingMonths: k };
}

// ═════════════ 4) แยกรายการเพิ่ม/หัก (Q5) ═════════════
// เงินได้ 40(1) = เงินเดือน + OT + ค่าคอม + โบนัส + เบี้ยเลี้ยง · ค่าจ้าง ปสส. = เงินเดือน + OT + ค่าคอม + เบี้ยเลี้ยง (โบนัสไม่ใช่ค่าจ้าง — HQ8)
// หักเงิน/เบิกล่วงหน้า ลดยอดจ่ายเท่านั้น (เหมือนรุ่น 1) · ยอดจ่ายไม่ติดลบ (เหมือน payableGrossSatang)
const WHT_KINDS = new Set(["OT", "COMMISSION", "BONUS", "ALLOWANCE"]);
const SSO_KINDS = new Set(["OT", "COMMISSION", "ALLOWANCE"]);
const DEDUCT_KINDS = new Set(["DEDUCTION", "ADVANCE"]);
export type AdjustmentV2 = { kind: string; amountSatang: number };
export type ClassifiedV2 = { whtIncomeSatang: number; ssoWageSatang: number; addSatang: number; deductSatang: number; grossSatang: number };
export function classifyIncomeV2(baseSatang: number, adjustments: readonly AdjustmentV2[]): ClassifiedV2 {
  const base = satang(baseSatang, "base");
  if (!Array.isArray(adjustments)) fail("BAD_KIND", "adjustments must be a list");
  let add = 0;
  let deduct = 0;
  let whtExtra = 0;
  let ssoExtra = 0;
  for (const a of adjustments) {
    const kind = a?.kind;
    if (typeof kind !== "string" || (!WHT_KINDS.has(kind) && !DEDUCT_KINDS.has(kind))) fail("BAD_KIND", `unknown adjustment kind ${String(kind)}`);
    const amt = satang(a.amountSatang, `${kind} amount`);
    if (DEDUCT_KINDS.has(kind)) deduct += amt;
    else {
      add += amt;
      whtExtra += amt;
      if (SSO_KINDS.has(kind)) ssoExtra += amt;
    }
  }
  return { whtIncomeSatang: base + whtExtra, ssoWageSatang: base + ssoExtra, addSatang: add, deductSatang: deduct, grossSatang: Math.max(0, base + add - deduct) };
}

// ═════════════ 5) รายการเงินเดือน 1 คน (Q11 · H3.4 เป็นผู้เรียก/บันทึก) ═════════════
export type PriorV2 = { incomeSatang: number; whtSatang: number; ssoSatang: number };
export type ItemInputV2 = {
  baseSatang: number;
  adjustments: readonly AdjustmentV2[];
  ssoEligible: boolean;
  deductions?: DeductionsV2;
  monthIndex: number;
  prior: PriorV2;
};
export type ItemV2 = ClassifiedV2 & {
  engineVersion: 2;
  ssoBaseSatang: number;
  ssoEmployeeSatang: number;
  ssoEmployerSatang: number;
  whtSatang: number;
  netSatang: number;
  blocked: "NET_NEGATIVE" | null;
  /** id แถวกฎหมายที่ใช้คิด เรียงตัวอักษร — H3.4 เก็บลง HrPayrollItem.lawRowIds */
  lawRowIds: string[];
  /** ยอดสะสมก่อนงวด + ประมาณการ — H3.4 เก็บลง HrPayrollItem.ytdJson */
  ytdJson: {
    monthIndex: number;
    prior: PriorV2;
    projectedIncomeSatang: number;
    projectedSsoSatang: number;
    projectedNetSatang: number;
    annualTaxSatang: number;
    remainingMonths: number;
  };
};
function lawRowOf(set: unknown, kind: keyof LawSetV2): LawRowLike {
  const r = isObj(set) ? set[kind] : undefined;
  if (!isObj(r) || typeof r.id !== "string" || !r.id) return fail("LAW_MISSING", `law set has no ${kind} row`);
  return r as unknown as LawRowLike;
}
export function computeItemV2(input: ItemInputV2, lawSet: LawSetV2): ItemV2 {
  const ssoRow = lawRowOf(lawSet, "SSO");
  const taxRow = lawRowOf(lawSet, "TAX_BRACKET");
  const dedRow = lawRowOf(lawSet, "DEDUCTION");
  const monthIndex = month(input.monthIndex);
  const prior: PriorV2 = {
    incomeSatang: satang(input.prior?.incomeSatang, "prior.income"),
    whtSatang: satang(input.prior?.whtSatang, "prior.wht"),
    ssoSatang: satang(input.prior?.ssoSatang, "prior.sso"),
  };
  const c = classifyIncomeV2(input.baseSatang, input.adjustments);
  // เดือนที่ค่าจ้างเป็น 0 ยังใช้ฐานต่ำสุดเหมือนรุ่น 1 (Q13 · รอ NA-08)
  const sso = input.ssoEligible ? ssoV2(c.ssoWageSatang, ssoRow.json) : { baseSatang: 0, employeeSatang: 0, employerSatang: 0 };
  const regularSso = input.ssoEligible ? ssoV2(input.baseSatang, ssoRow.json).employeeSatang : 0;
  const y = whtYtdV2(
    {
      monthIndex,
      currentIncomeSatang: c.whtIncomeSatang,
      regularMonthlySatang: input.baseSatang,
      priorIncomeSatang: prior.incomeSatang,
      priorWhtSatang: prior.whtSatang,
      currentSsoSatang: sso.employeeSatang,
      regularSsoSatang: regularSso,
      priorSsoSatang: prior.ssoSatang,
      deductions: input.deductions,
    },
    taxRow.json,
    dedRow.json,
  );
  const netSatang = c.grossSatang - sso.employeeSatang - y.whtSatang;
  return {
    engineVersion: 2,
    ...c,
    ssoWageSatang: input.ssoEligible ? c.ssoWageSatang : 0, // ไม่อยู่ในประกันสังคม = ไม่มีค่าจ้างฐาน ปสส. (ITM-04)
    ssoBaseSatang: sso.baseSatang,
    ssoEmployeeSatang: sso.employeeSatang,
    ssoEmployerSatang: sso.employerSatang,
    whtSatang: y.whtSatang,
    netSatang,
    blocked: netSatang < 0 ? "NET_NEGATIVE" : null,
    lawRowIds: [ssoRow.id, taxRow.id, dedRow.id].sort(),
    ytdJson: {
      monthIndex,
      prior,
      projectedIncomeSatang: y.projectedIncomeSatang,
      projectedSsoSatang: y.projectedSsoSatang,
      projectedNetSatang: y.projectedNetSatang,
      annualTaxSatang: y.annualTaxSatang,
      remainingMonths: y.remainingMonths,
    },
  };
}

/** ยอดรวมของงวด = ผลรวมรายการตรงตัว */
export function totalsV2(items: readonly Pick<ItemV2, "grossSatang" | "ssoEmployeeSatang" | "ssoEmployerSatang" | "whtSatang" | "netSatang" | "blocked">[]): {
  grossSatang: number;
  ssoEmployeeSatang: number;
  ssoEmployerSatang: number;
  whtSatang: number;
  netSatang: number;
  blockedCount: number;
} {
  const t = { grossSatang: 0, ssoEmployeeSatang: 0, ssoEmployerSatang: 0, whtSatang: 0, netSatang: 0, blockedCount: 0 };
  for (const i of items) {
    t.grossSatang += i.grossSatang;
    t.ssoEmployeeSatang += i.ssoEmployeeSatang;
    t.ssoEmployerSatang += i.ssoEmployerSatang;
    t.whtSatang += i.whtSatang;
    t.netSatang += i.netSatang;
    if (i.blocked) t.blockedCount += 1;
  }
  return t;
}

// ═════════════ 6) ยอดสะสมก่อนงวด (Q6 · Q14) ═════════════
// นับเฉพาะงวด APPROVED/PAID · ปีภาษีเดียวกัน (ปีของวันจ่ายแบบไทย) · วันจ่าย ≤ วันจ่ายของงวดนี้ · ไม่นับงวดตัวเอง · DRAFT/REVERSED ไม่นับ
export type PriorRowV2 = { runId: string; payDay: string; status: string; whtIncomeSatang: number; whtSatang: number; ssoEmployeeSatang: number };
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
export function ytdPriorV2(rows: readonly PriorRowV2[], at: { onDay: string; runId: string }): PriorV2 {
  if (typeof at?.onDay !== "string" || !DAY_RE.test(at.onDay)) fail("BAD_DAY", "onDay must be YYYY-MM-DD");
  const year = at.onDay.slice(0, 4);
  const out: PriorV2 = { incomeSatang: 0, whtSatang: 0, ssoSatang: 0 };
  for (const r of rows) {
    if (r.runId === at.runId) continue;
    if (r.status !== "APPROVED" && r.status !== "PAID") continue;
    if (typeof r.payDay !== "string" || !DAY_RE.test(r.payDay)) fail("BAD_DAY", "payDay must be YYYY-MM-DD");
    if (r.payDay.slice(0, 4) !== year || r.payDay > at.onDay) continue;
    out.incomeSatang += satang(r.whtIncomeSatang, "prior income");
    out.whtSatang += satang(r.whtSatang, "prior wht");
    out.ssoSatang += satang(r.ssoEmployeeSatang, "prior sso");
  }
  return out;
}
// ◂ HR H3.3
