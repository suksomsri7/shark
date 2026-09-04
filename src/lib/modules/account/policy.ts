// policy.ts — นโยบายบัญชี (SPEC §9.3 · WO 8.2)
//
// แหล่งเดียวของ "กติกาที่ใช้ทั้งระบบ": ปีบัญชี · VAT · WHT เริ่มต้น · ประเภทราคา · ล็อกวันที่ ·
// ชื่อซ้ำ · บัญชีเริ่มต้น · การออกเอกสารต่อ · ลูกค้าประจำ · ปิดงวดอัตโนมัติ · รายงานอีเมล
//
// 🔴 กติกาไฟล์นี้
//   1) ห้าม `import { prisma }` ตรง ๆ (fitness F5.1 ตรึงจำนวนไฟล์ที่ import prisma ไว้ที่ 45) → ใช้ `tenantDb(ctx)`
//   2) ครึ่งบนเป็น **ตรรกะบริสุทธิ์** (ไม่แตะ DB) เพื่อให้ข้อสอบเรียกตรงได้และ UI ใช้ซ้ำได้
//   3) ค่าที่เคยอยู่ใน `docConfig` (taxPointBasis · dupNamePolicy) ย้ายขึ้น**คอลัมน์**แล้ว
//      (migration 20260913000000_account_v2_policy backfill ให้) — อ่าน docConfig เป็น "ทางถอย" เท่านั้น
//      ห้ามเขียนกลับลง docConfig อีก ไม่งั้นจะมี 2 แหล่งความจริงแล้ววันหนึ่งไม่ตรงกัน

import type { Prisma, AccountPriceMode, AccountVatTiming, AccountWhtIncomeType } from "@prisma/client";
import { tenantDb } from "@/lib/core/db";
import { formatDateTh, THAI_MONTH_SHORT } from "@/lib/ui/date";
// ป้ายไทย + ชนิดข้อมูลที่ฝั่ง client ต้องใช้ อยู่แยกไฟล์ (ห้ามลาก prisma เข้าบันเดิลเบราว์เซอร์)
export {
  DUP_POLICY_LABEL,
  VAT_TIMING_LABEL,
  PRICE_MODE_POLICY_LABEL,
  CONVERT_QT_LABEL,
  CONVERT_PO_LABEL,
} from "./policy-labels";
export type { DupPolicy, ConvertQtTarget, ConvertPoTarget } from "./policy-labels";
import type { ConvertPoTarget, ConvertQtTarget, DupPolicy } from "./policy-labels";

type Ctx = { tenantId: string; systemId: string };
type Db = ReturnType<typeof tenantDb>;

const dbOf = (ctx: Ctx): Db => tenantDb({ tenantId: ctx.tenantId, systemId: ctx.systemId });

// ─────────────────────────── ชนิดข้อมูล ───────────────────────────

/** หัก ณ ที่จ่ายเริ่มต้น 1 แถว — ประเภทเงินได้ + อัตรา + บัญชีค่าใช้จ่ายที่ใช้อัตรานี้ */
export type WhtDefault = {
  incomeType: AccountWhtIncomeType;
  rateBp: number;
  /** รหัสบัญชีค่าใช้จ่าย (6900, 6100, …) ที่ให้ใช้อัตรานี้อัตโนมัติ · ว่าง = ไม่ผูกบัญชี */
  expenseAccountCodes: string[];
};

/** นิยาม "ลูกค้าประจำ" (§7.1 · เก็บใน docConfig.regularCustomerRule ตั้งแต่ WO 3.2 — ไม่ย้าย) */
export type RegularCustomerRule = {
  minPaidDocs: number;
  minPaidTotalSatang: number;
  periodMonths: number;
};

export type AccountPolicy = {
  /** เดือนเริ่มปีบัญชี 1–12 */
  fiscalYearStartMonth: number;
  /** วันปิดงวด 1–28 · null = ไม่กำหนด */
  periodCloseDay: number | null;
  vatRegistered: boolean;
  vatRateBp: number;
  vatTiming: AccountVatTiming;
  defaultPriceMode: AccountPriceMode | null;
  /** null = ไม่ล็อก */
  lockBeforeDate: Date | null;
  dupContactPolicy: DupPolicy;
  dupProductPolicy: DupPolicy;
  defaultSalesAccountCode: string | null;
  defaultPurchaseAccountCode: string | null;
  defaultExpenseAccountCode: string | null;
  convertQtTo: ConvertQtTarget;
  convertPoTo: ConvertPoTarget;
  copyNotesOnConvert: boolean;
  copyTagsOnConvert: boolean;
  autoClosePeriods: boolean;
  autoCloseNotify: boolean;
  emailReportDaily: boolean;
  emailReportWeekly: boolean;
  emailReportRecipients: string[];
  whtDefaults: WhtDefault[];
  regularCustomer: RegularCustomerRule;
};

/** ค่าเริ่มต้นของกิจการที่ยังไม่เคยตั้งอะไรเลย (ต้อง "เหมือนพฤติกรรมเดิม" ทุกข้อ) */
export const DEFAULT_REGULAR_CUSTOMER: RegularCustomerRule = {
  minPaidDocs: 3,
  minPaidTotalSatang: 3_150_000,
  periodMonths: 12,
};

export function defaultPolicy(): AccountPolicy {
  return {
    fiscalYearStartMonth: 1,
    periodCloseDay: null,
    vatRegistered: true,
    vatRateBp: 700,
    vatTiming: "ON_ISSUE",
    defaultPriceMode: null,
    lockBeforeDate: null,
    dupContactPolicy: "WARN",
    dupProductPolicy: "WARN",
    defaultSalesAccountCode: null,
    defaultPurchaseAccountCode: null,
    defaultExpenseAccountCode: null,
    convertQtTo: "INVOICE",
    convertPoTo: "PURCHASE",
    copyNotesOnConvert: true,
    copyTagsOnConvert: true,
    // 🔴 ต้องตรงกับ default ของคอลัมน์ (true) — ร้านที่ยังไม่มีแถวตั้งค่าต้องได้พฤติกรรมเดิม (ปิดงวดให้)
    autoClosePeriods: true,
    autoCloseNotify: true,
    emailReportDaily: false,
    emailReportWeekly: false,
    emailReportRecipients: [],
    whtDefaults: [],
    regularCustomer: { ...DEFAULT_REGULAR_CUSTOMER },
  };
}

// ─────────────────────────── ① ปีบัญชี (ตรรกะบริสุทธิ์) ───────────────────────────

const TZ = "Asia/Bangkok";

/** "YYYY-MM-DD" ตามเวลาไทย (กันเพี้ยน 1 วันบนเครื่อง UTC) */
export function policyDayKey(d: Date): string {
  return d.toLocaleDateString("en-CA", { timeZone: TZ });
}

/** เดือน "สิ้น" ปีบัญชี จากเดือนเริ่ม (เริ่ม เม.ย. = 4 → สิ้น มี.ค. = 3) */
export function fiscalYearEndMonth(startMonth: number): number {
  const m = normalizeStartMonth(startMonth);
  return m === 1 ? 12 : m - 1;
}

export function normalizeStartMonth(v: unknown): number {
  const n = typeof v === "number" ? Math.trunc(v) : Number.parseInt(String(v ?? ""), 10);
  return Number.isFinite(n) && n >= 1 && n <= 12 ? n : 1;
}

export type FiscalYear = {
  /** ปีที่ใช้เรียกชื่อรอบ = ปีของเดือนเริ่ม */
  year: number;
  /** "YYYY-MM" ของเดือนแรก/เดือนสุดท้ายของรอบ (ใช้กับรายงานที่คิดเป็น periodKey) */
  startKey: string;
  endKey: string;
  /** "YYYY-MM-DD" วันแรก/วันสุดท้ายของรอบ (เวลาไทย) */
  startYmd: string;
  endYmd: string;
  /** ขอบเขตเป็น Date: [start, endExclusive) — เที่ยงคืนเวลาไทย */
  start: Date;
  endExclusive: Date;
  /** "ปีบัญชี 2026 (เม.ย. 2026–มี.ค. 2027)" */
  label: string;
};

const pad2 = (n: number) => String(n).padStart(2, "0");
/** เที่ยงคืนของวันไทย → Date (UTC+7 ⇒ ลบ 7 ชม.) */
const bkkMidnight = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d, -7, 0, 0));

/**
 * รอบปีบัญชีที่ครอบวันที่นี้ (เวลาไทย)
 * เริ่ม ม.ค. → ตรงปีปฏิทิน · เริ่ม เม.ย. → 1 เม.ย. ปีนั้น ถึง 31 มี.ค. ปีถัดไป
 * ชื่อรอบเรียกตาม **ปีของเดือนเริ่ม** (ตรงกับ SPEC §9.3 ตัวอย่าง "เม.ย. → มี.ค. ปีถัดไป")
 */
export function fiscalYearOf(date: Date | string, startMonth: number): FiscalYear {
  const m0 = normalizeStartMonth(startMonth);
  const ymd = typeof date === "string" ? date.slice(0, 10) : policyDayKey(date);
  const [y, m] = ymd.split("-").map((x) => Number.parseInt(x, 10));
  // เดือนของวันที่ยังไม่ถึงเดือนเริ่ม ⇒ ยังอยู่ในรอบที่เริ่มปีที่แล้ว
  const year = m >= m0 ? y : y - 1;
  const endMonth = fiscalYearEndMonth(m0);
  const endYear = m0 === 1 ? year : year + 1;
  // วันสุดท้ายของเดือนสิ้นรอบ: Date.UTC(y, month, 0) = วันสุดท้ายของ month
  const lastDay = new Date(Date.UTC(endYear, endMonth, 0)).getUTCDate();
  const startKey = `${year}-${pad2(m0)}`;
  const endKey = `${endYear}-${pad2(endMonth)}`;
  const mShort = THAI_MONTH_SHORT;
  return {
    year,
    startKey,
    endKey,
    startYmd: `${startKey}-01`,
    endYmd: `${endKey}-${pad2(lastDay)}`,
    start: bkkMidnight(year, m0, 1),
    endExclusive: bkkMidnight(endYear, endMonth, lastDay + 1),
    label: `ปีบัญชี ${year} (${mShort[m0 - 1]} ${year}–${mShort[endMonth - 1]} ${endYear})`,
  };
}

/** รอบปีบัญชี "ก่อนหน้า" ของรอบที่ครอบวันที่นี้ (ใช้กับปุ่ม "เทียบงวดก่อน" ของรายงานทั้งปี) */
export function previousFiscalYear(date: Date | string, startMonth: number): FiscalYear {
  const cur = fiscalYearOf(date, startMonth);
  return fiscalYearOf(`${cur.year - 1}-${cur.startKey.slice(5)}-01`, startMonth);
}

// ─────────────────────────── ② ล็อกข้อมูลก่อนวันที่ (ตรรกะบริสุทธิ์) ───────────────────────────

/**
 * วันที่นี้อยู่ในช่วงที่ถูกล็อกหรือไม่
 * 🔴 นิยาม: ล็อก ⇔ **วันที่ < lockBeforeDate** (เวลาไทย) — ตรงกับชื่อฟิลด์และข้อความ "ข้อมูลก่อนวันที่ …"
 *    ตั้ง 31 ส.ค. ⇒ 30 ส.ค. ลงไม่ได้ · 31 ส.ค. ยังลงได้ (ถ้าอยากล็อกทั้ง ส.ค. ให้ตั้ง 1 ก.ย.)
 *    เทียบกันเป็น "วันไทย" ล้วน ๆ ⇒ เวลาในวันเดียวกันไม่ทำให้ผลต่างกัน
 */
export function isLockedDate(lockBeforeDate: Date | null | undefined, date: Date | string): boolean {
  if (!lockBeforeDate) return false;
  const d = typeof date === "string" ? date.slice(0, 10) : policyDayKey(date);
  return d < policyDayKey(lockBeforeDate);
}

/** ข้อความภาษาคนของการล็อก — บอกทั้ง "ล็อกถึงไหน" และ "ไปปลดที่ไหน" (§0.3 ข้อ 9) */
export function lockedMessage(lockBeforeDate: Date): string {
  return `ข้อมูลก่อนวันที่ ${formatDateTh(lockBeforeDate)} ถูกล็อกไว้ — ไปที่ ตั้งค่า › นโยบายบัญชี เพื่อปลดล็อก`;
}

/** งวด "YYYY-MM" นี้จมอยู่ใต้วันล็อกทั้งงวดหรือไม่ (ใช้กับเปิดงวดใหม่/ปิดงวด) */
export function isLockedPeriod(lockBeforeDate: Date | null | undefined, periodKey: string): boolean {
  if (!lockBeforeDate) return false;
  const [y, m] = periodKey.split("-").map((x) => Number.parseInt(x, 10));
  if (!y || !m) return false;
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  // ล็อกทั้งงวดก็ต่อเมื่อ "วันสุดท้ายของงวด" ยังอยู่ก่อนวันล็อก
  return isLockedDate(lockBeforeDate, `${periodKey}-${pad2(lastDay)}`);
}

// ─────────────────────────── ③ WHT / ราคา / บัญชีเริ่มต้น (ตรรกะบริสุทธิ์) ───────────────────────────

/** อัตรา+ประเภทเงินได้เริ่มต้นของบัญชีค่าใช้จ่ายรหัสนี้ ตามนโยบาย (ไม่เจอ = null) */
export function whtDefaultForAccountCode(
  policy: Pick<AccountPolicy, "whtDefaults">,
  accountCode: string | null | undefined,
): { incomeType: AccountWhtIncomeType; rateBp: number } | null {
  const code = (accountCode ?? "").trim();
  if (!code) return null;
  for (const w of policy.whtDefaults) {
    if (w.expenseAccountCodes.includes(code)) return { incomeType: w.incomeType, rateBp: w.rateBp };
  }
  return null;
}

/** อัตราเริ่มต้นของประเภทเงินได้ (ไม่ผูกบัญชี) — ใช้ตอนผู้ใช้เลือกประเภทเองในฟอร์ม */
export function whtRateForIncomeType(
  policy: Pick<AccountPolicy, "whtDefaults">,
  incomeType: AccountWhtIncomeType,
): number | null {
  const hit = policy.whtDefaults.find((w) => w.incomeType === incomeType);
  return hit ? hit.rateBp : null;
}

/** ประเภทราคาเริ่มต้นของฟอร์มเอกสาร — นโยบายก่อน แล้วค่อยตกลงพฤติกรรมเดิม (จด VAT = แยก VAT) */
export function defaultPriceModeOf(policy: Pick<AccountPolicy, "defaultPriceMode" | "vatRegistered">): AccountPriceMode {
  if (policy.defaultPriceMode) return policy.defaultPriceMode;
  return policy.vatRegistered ? "EXCL_VAT" : "NO_VAT";
}

// ─────────────────────────── ④ อ่าน/แปลงค่าจากแถว DB (ตรรกะบริสุทธิ์) ───────────────────────────

const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

const INCOME_TYPES: readonly string[] = ["M40_1", "M40_2", "M40_3", "M40_4", "M40_5", "M40_6", "M40_7", "M40_8"];

export function toDupPolicy(v: unknown, dflt: DupPolicy = "WARN"): DupPolicy {
  const s = String(v ?? "").toUpperCase();
  if (s === "BLOCK") return "BLOCK";
  if (s === "WARN") return "WARN";
  return dflt;
}

export function parseWhtDefaults(v: unknown): WhtDefault[] {
  if (!Array.isArray(v)) return [];
  const out: WhtDefault[] = [];
  const seen = new Set<string>();
  for (const raw of v) {
    const o = obj(raw);
    const incomeType = String(o.incomeType ?? "");
    if (!INCOME_TYPES.includes(incomeType) || seen.has(incomeType)) continue;
    const rateBp = typeof o.rateBp === "number" ? Math.trunc(o.rateBp) : Number.NaN;
    if (!Number.isFinite(rateBp) || rateBp < 0 || rateBp > 10000) continue;
    const codes = Array.isArray(o.expenseAccountCodes)
      ? (o.expenseAccountCodes as unknown[]).filter((x): x is string => typeof x === "string" && x.trim() !== "")
      : [];
    seen.add(incomeType);
    out.push({ incomeType: incomeType as AccountWhtIncomeType, rateBp, expenseAccountCodes: codes.map((c) => c.trim()) });
  }
  return out;
}

export function parseRecipients(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const x of v) {
    const s = String(x ?? "").trim().toLowerCase();
    if (s && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) && !out.includes(s)) out.push(s);
  }
  return out;
}

/** แถว AccountSettings ที่ policy ต้องใช้ (เขียนเป็น type เองเพื่อไม่ผูกกับ Prisma model ทั้งก้อน) */
export type PolicyRow = {
  fiscalYearStartMonth: number;
  periodCloseDay: number | null;
  vatRegistered: boolean;
  vatRateBp: number;
  vatTiming: AccountVatTiming;
  defaultPriceMode: AccountPriceMode | null;
  lockBeforeDate: Date | null;
  dupContactPolicy: string | null;
  dupProductPolicy: string | null;
  defaultSalesAccountCode: string | null;
  defaultPurchaseAccountCode: string | null;
  defaultExpenseAccountCode: string | null;
  convertQtTo: string | null;
  convertPoTo: string | null;
  copyNotesOnConvert: boolean;
  copyTagsOnConvert: boolean;
  autoClosePeriods: boolean;
  autoCloseNotify: boolean;
  emailReportDaily: boolean;
  emailReportWeekly: boolean;
  emailReportRecipients: unknown;
  whtDefaults: unknown;
  docConfig: unknown;
};

export const POLICY_SELECT = {
  fiscalYearStartMonth: true,
  periodCloseDay: true,
  vatRegistered: true,
  vatRateBp: true,
  vatTiming: true,
  defaultPriceMode: true,
  lockBeforeDate: true,
  dupContactPolicy: true,
  dupProductPolicy: true,
  defaultSalesAccountCode: true,
  defaultPurchaseAccountCode: true,
  defaultExpenseAccountCode: true,
  convertQtTo: true,
  convertPoTo: true,
  copyNotesOnConvert: true,
  copyTagsOnConvert: true,
  autoClosePeriods: true,
  autoCloseNotify: true,
  emailReportDaily: true,
  emailReportWeekly: true,
  emailReportRecipients: true,
  whtDefaults: true,
  docConfig: true,
} as const;

/**
 * แปลงแถว DB → นโยบายที่พร้อมใช้
 * 🔴 ทางถอย: คอลัมน์ `dupContactPolicy` เป็น null (ร้านเก่าที่ยังไม่เคยเปิดหน้านี้)
 *    ⇒ อ่านจาก `docConfig.dupNamePolicy` เดิม เพื่อไม่ให้ค่าที่ตั้งไว้ก่อน 8.2 หายไป
 */
export function parsePolicy(row: PolicyRow | null | undefined): AccountPolicy {
  const d = defaultPolicy();
  if (!row) return d;
  const cfg = obj(row.docConfig);
  const legacyDup = cfg.dupNamePolicy;
  const rc = obj(cfg.regularCustomerRule);
  const posInt = (v: unknown, dflt: number) => {
    const n = typeof v === "number" ? Math.trunc(v) : Number.NaN;
    return Number.isFinite(n) && n > 0 ? n : dflt;
  };
  return {
    fiscalYearStartMonth: normalizeStartMonth(row.fiscalYearStartMonth),
    periodCloseDay:
      typeof row.periodCloseDay === "number" && row.periodCloseDay >= 1 && row.periodCloseDay <= 28
        ? row.periodCloseDay
        : null,
    vatRegistered: row.vatRegistered,
    vatRateBp: row.vatRateBp,
    vatTiming: row.vatTiming === "ON_PAYMENT" ? "ON_PAYMENT" : "ON_ISSUE",
    defaultPriceMode: row.defaultPriceMode ?? null,
    lockBeforeDate: row.lockBeforeDate ?? null,
    dupContactPolicy: toDupPolicy(row.dupContactPolicy ?? legacyDup, "WARN"),
    dupProductPolicy: toDupPolicy(row.dupProductPolicy, "WARN"),
    defaultSalesAccountCode: row.defaultSalesAccountCode || null,
    defaultPurchaseAccountCode: row.defaultPurchaseAccountCode || null,
    defaultExpenseAccountCode: row.defaultExpenseAccountCode || null,
    convertQtTo: row.convertQtTo === "DEPOSIT_RECEIPT" ? "DEPOSIT_RECEIPT" : "INVOICE",
    convertPoTo: row.convertPoTo === "EXPENSE" ? "EXPENSE" : "PURCHASE",
    copyNotesOnConvert: row.copyNotesOnConvert,
    copyTagsOnConvert: row.copyTagsOnConvert,
    autoClosePeriods: row.autoClosePeriods,
    autoCloseNotify: row.autoCloseNotify,
    emailReportDaily: row.emailReportDaily,
    emailReportWeekly: row.emailReportWeekly,
    emailReportRecipients: parseRecipients(row.emailReportRecipients),
    whtDefaults: parseWhtDefaults(row.whtDefaults),
    regularCustomer: {
      minPaidDocs: posInt(rc.minPaidDocs, d.regularCustomer.minPaidDocs),
      minPaidTotalSatang:
        typeof rc.minPaidTotalSatang === "number" && rc.minPaidTotalSatang >= 0
          ? Math.trunc(rc.minPaidTotalSatang)
          : d.regularCustomer.minPaidTotalSatang,
      periodMonths: posInt(rc.periodMonths, d.regularCustomer.periodMonths),
    },
  };
}

// ─────────────────────────── ⑤ อ่าน/เขียน DB ───────────────────────────

/** นโยบายของระบบบัญชีนี้ (ร้านที่ยังไม่มีแถวตั้งค่า = ค่าเริ่มต้น ไม่ 500) */
export async function getPolicy(ctx: Ctx): Promise<AccountPolicy> {
  const row = await dbOf(ctx).accountSettings.findFirst({
    where: { systemId: ctx.systemId },
    select: POLICY_SELECT,
  });
  return parsePolicy(row as PolicyRow | null);
}

/**
 * อ่าน "วันล็อก" อย่างเดียว — เส้นทางเขียนที่ต้องเร็ว (โพสต์บัญชีทุกใบผ่านตรงนี้)
 * 🔴 `gl.commitEntry` **ไม่เรียกตัวนี้** เพราะต้องอ่านใน transaction เดียวกับการโพสต์
 *    (มันเรียก `db.accountSettings.findFirst` เองแล้วใช้ `isLockedDate`/`lockedMessage` ที่เป็นตรรกะบริสุทธิ์)
 */
export async function lockBeforeDateOf(ctx: Ctx): Promise<Date | null> {
  const row = await dbOf(ctx).accountSettings.findFirst({
    where: { systemId: ctx.systemId },
    select: { lockBeforeDate: true },
  });
  return row?.lockBeforeDate ?? null;
}

/**
 * ด่านล็อกวันที่ — โยน Error ภาษาคนถ้าวันที่ตกอยู่ในช่วงที่ล็อกไว้
 * เรียกจาก: สร้าง/แก้ไข/ยกเลิก เอกสาร · รับ-จ่ายเงิน · สมุดรายวันมือ · เปิดงวดใหม่
 * (การโพสต์บัญชีมีด่านของตัวเองใน `gl.commitEntry`) — **การอ่านไม่กระทบ**
 */
export async function assertNotLocked(ctx: Ctx, date: Date | string): Promise<void> {
  const lock = await lockBeforeDateOf(ctx);
  if (lock && isLockedDate(lock, date)) throw new Error(lockedMessage(lock));
}

/**
 * ด่านล็อกแบบ "รู้วันล็อกอยู่แล้ว" (ตรรกะบริสุทธิ์ · ไม่มี query)
 * ใช้ในฟังก์ชันที่เรียก `getSettings()` ไปแล้ว — จะได้ไม่ยิง query ซ้ำเพื่ออ่านค่าเดียวกัน
 */
export function assertNotLockedWith(lockBeforeDate: Date | null | undefined, date: Date | string): void {
  if (lockBeforeDate && isLockedDate(lockBeforeDate, date)) throw new Error(lockedMessage(lockBeforeDate));
}

/**
 * ด่านล็อกที่อ่านค่าใน transaction ที่กำลังทำงานอยู่
 * ใช้กับ "ยกเลิก" ซึ่ง reversal เลื่อนวันไปงวดเปิดถัดไป ⇒ ด่านใน `gl.commitEntry` จับวันเดิมไม่ได้
 */
export async function assertNotLockedTx(
  tx: Prisma.TransactionClient,
  systemId: string,
  date: Date | string,
): Promise<void> {
  const row = await tx.accountSettings.findFirst({ where: { systemId }, select: { lockBeforeDate: true } });
  assertNotLockedWith(row?.lockBeforeDate ?? null, date);
}

/** เวอร์ชันที่คืน reason แทนการ throw — ใช้ในฟังก์ชันที่สัญญา `{ ok, reason }` */
export async function checkNotLocked(
  ctx: Ctx,
  date: Date | string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const lock = await lockBeforeDateOf(ctx);
  if (lock && isLockedDate(lock, date)) return { ok: false, reason: lockedMessage(lock) };
  return { ok: true };
}

// ─────────────────────────── ⑥ บันทึกนโยบาย ───────────────────────────

export type PolicyPatch = Partial<
  Pick<
    AccountPolicy,
    | "fiscalYearStartMonth"
    | "periodCloseDay"
    | "vatRegistered"
    | "vatRateBp"
    | "vatTiming"
    | "defaultPriceMode"
    | "lockBeforeDate"
    | "dupContactPolicy"
    | "dupProductPolicy"
    | "defaultSalesAccountCode"
    | "defaultPurchaseAccountCode"
    | "defaultExpenseAccountCode"
    | "convertQtTo"
    | "convertPoTo"
    | "copyNotesOnConvert"
    | "copyTagsOnConvert"
    | "autoClosePeriods"
    | "autoCloseNotify"
    | "emailReportDaily"
    | "emailReportWeekly"
    | "emailReportRecipients"
    | "whtDefaults"
    | "regularCustomer"
  >
>;

export type PolicySaveResult = { ok: true } | { ok: false; reason: string };

/** ตรวจค่าก่อนบันทึก — คืนข้อความไทยของช่องแรกที่ผิด (null = ผ่าน) */
export function validatePolicyPatch(patch: PolicyPatch): string | null {
  if (patch.fiscalYearStartMonth !== undefined) {
    const m = patch.fiscalYearStartMonth;
    if (!Number.isInteger(m) || m < 1 || m > 12) return "เดือนเริ่มปีบัญชีต้องอยู่ระหว่าง 1–12";
  }
  if (patch.periodCloseDay !== undefined && patch.periodCloseDay !== null) {
    const d = patch.periodCloseDay;
    if (!Number.isInteger(d) || d < 1 || d > 28)
      return "วันปิดงวดต้องอยู่ระหว่าง 1–28 (เพื่อให้ใช้ได้กับเดือน ก.พ. ด้วย)";
  }
  if (patch.vatRateBp !== undefined) {
    const r = patch.vatRateBp;
    if (!Number.isInteger(r) || r < 0 || r > 10000) return "อัตรา VAT ต้องอยู่ระหว่าง 0–100%";
  }
  if (patch.whtDefaults !== undefined) {
    for (const w of patch.whtDefaults) {
      if (!INCOME_TYPES.includes(w.incomeType)) return `ประเภทเงินได้ไม่ถูกต้อง: ${w.incomeType}`;
      if (!Number.isInteger(w.rateBp) || w.rateBp < 0 || w.rateBp > 10000)
        return "อัตราหัก ณ ที่จ่ายต้องอยู่ระหว่าง 0–100%";
    }
  }
  if (patch.emailReportRecipients !== undefined) {
    if (patch.emailReportRecipients.length > 20) return "ผู้รับรายงานทางอีเมลได้สูงสุด 20 คน";
    for (const e of patch.emailReportRecipients) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return `รูปแบบอีเมลไม่ถูกต้อง: ${e}`;
    }
  }
  if (
    (patch.emailReportDaily || patch.emailReportWeekly) &&
    patch.emailReportRecipients !== undefined &&
    patch.emailReportRecipients.length === 0
  )
    return "เปิดรายงานทางอีเมลแล้วต้องระบุผู้รับอย่างน้อย 1 คน";
  if (patch.regularCustomer !== undefined) {
    const r = patch.regularCustomer;
    if (!Number.isInteger(r.minPaidDocs) || r.minPaidDocs < 1) return 'เกณฑ์ "ลูกค้าประจำ" ต้องซื้ออย่างน้อย 1 ครั้ง';
    if (!Number.isInteger(r.minPaidTotalSatang) || r.minPaidTotalSatang < 0)
      return 'ยอดซื้อขั้นต่ำของ "ลูกค้าประจำ" ติดลบไม่ได้';
    if (!Number.isInteger(r.periodMonths) || r.periodMonths < 1 || r.periodMonths > 120)
      return 'ช่วงเวลาของ "ลูกค้าประจำ" ต้องอยู่ระหว่าง 1–120 เดือน';
  }
  return null;
}

/**
 * บันทึกนโยบาย — เขียนเฉพาะคีย์ที่ส่งมา (คีย์ที่ไม่ส่ง = ไม่แตะ)
 * `regularCustomer` ยังอยู่ใน `docConfig.regularCustomerRule` (คีย์เดิมของ WO 3.2) ⇒ อ่าน-รวม-เขียนกลับ
 */
export async function savePolicy(ctx: Ctx, patch: PolicyPatch): Promise<PolicySaveResult> {
  const bad = validatePolicyPatch(patch);
  if (bad) return { ok: false, reason: bad };

  const db = dbOf(ctx);
  const existing = await db.accountSettings.findFirst({
    where: { systemId: ctx.systemId },
    select: { id: true, docConfig: true },
  });

  const data: Record<string, unknown> = {};
  const copy = <K extends keyof PolicyPatch>(k: K) => {
    if (patch[k] !== undefined) data[k as string] = patch[k];
  };
  (
    [
      "fiscalYearStartMonth",
      "periodCloseDay",
      "vatRegistered",
      "vatRateBp",
      "vatTiming",
      "defaultPriceMode",
      "lockBeforeDate",
      "dupContactPolicy",
      "dupProductPolicy",
      "defaultSalesAccountCode",
      "defaultPurchaseAccountCode",
      "defaultExpenseAccountCode",
      "convertQtTo",
      "convertPoTo",
      "copyNotesOnConvert",
      "copyTagsOnConvert",
      "autoClosePeriods",
      "autoCloseNotify",
      "emailReportDaily",
      "emailReportWeekly",
    ] as const
  ).forEach(copy);
  if (patch.emailReportRecipients !== undefined) data.emailReportRecipients = parseRecipients(patch.emailReportRecipients);
  if (patch.whtDefaults !== undefined) data.whtDefaults = parseWhtDefaults(patch.whtDefaults);
  if (patch.regularCustomer !== undefined) {
    const prev = obj(existing?.docConfig);
    data.docConfig = { ...prev, regularCustomerRule: patch.regularCustomer };
  }

  try {
    if (existing) {
      await db.accountSettings.update({ where: { id: existing.id }, data: data as never });
    } else {
      await db.accountSettings.create({
        data: { tenantId: ctx.tenantId, systemId: ctx.systemId, ...data } as never,
      });
    }
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "บันทึกนโยบายบัญชีไม่สำเร็จ" };
  }
  return { ok: true };
}

/**
 * คีย์ที่เปลี่ยนไปจริง (before/after) สำหรับ AuditLog — เก็บเฉพาะ "ชื่อคีย์ + ค่าใหม่/เก่า"
 * 🔴 ไม่มีข้อมูลลูกค้าอยู่ในนโยบาย ยกเว้นอีเมลผู้รับรายงาน ⇒ อีเมลถูก mask เป็นจำนวนคน
 */
export function policyAuditDiff(
  before: AccountPolicy,
  after: AccountPolicy,
): { changed: string[]; before: Record<string, unknown>; after: Record<string, unknown> } {
  const changed: string[] = [];
  const b: Record<string, unknown> = {};
  const a: Record<string, unknown> = {};
  const mask = (k: string, v: unknown) => (k === "emailReportRecipients" ? `${(v as string[]).length} คน` : v);
  for (const k of Object.keys(after) as (keyof AccountPolicy)[]) {
    const bv = JSON.stringify(before[k] ?? null);
    const av = JSON.stringify(after[k] ?? null);
    if (bv === av) continue;
    changed.push(k);
    b[k] = mask(k, before[k]);
    a[k] = mask(k, after[k]);
  }
  return { changed, before: b, after: a };
}
