// recurring-shared.ts — ตรรกะ "เอกสารประจำ" ส่วนที่ **บริสุทธิ์** (WO 1.9 · BLUEPRINT §0.3 ข้อ 7)
//
// 🔴 ไฟล์นี้ห้าม import prisma / next / server action ใด ๆ
//    เหตุผล 2 ข้อ:
//      1) ฟอร์มฝั่ง client ต้องคิด "รอบถัดไป" ให้ผู้ใช้เห็นทันทีด้วยสูตรเดียวกับที่ cron ใช้จริง
//         (ถ้าคนละสูตร = จอบอกอย่าง เครื่องทำอีกอย่าง — บั๊กที่จับยากที่สุดของฟีเจอร์ตั้งเวลา)
//      2) fitness F5 (raw prisma ในโมดูล) เต็มโควตา 45 ไฟล์พอดี — ไฟล์ใหม่ที่แตะ DB จะทำให้ CI แดง
//         ⇒ โค้ดที่แตะ DB ของ WO นี้อยู่ใน service.ts (ไฟล์ที่นับไปแล้ว)
//
// 🔴 กติกาวันที่: ทุกวันที่ในไฟล์นี้เป็น **UTC เที่ยงคืน** เหมือนทั้งโมดูลบัญชี
//    (`new Date("YYYY-MM-DDT00:00:00.000Z")`) และคำนวณด้วย `getUTC*` เท่านั้น
//    ห้ามใช้ `getDate()/getDay()` ของเครื่อง — VPS/Vercel รันเป็น UTC จะเพี้ยน 1 วันทันที
//    (บทเรียน reference_thai_date_getday_trap)

import type { AccountDocType, AccountRecurringFrequency } from "@prisma/client";

export const DAY_MS = 86_400_000;

/** ชนิดเอกสารที่ตั้งเป็น "เอกสารประจำ" ได้ — ตั้งใจให้แคบ (ไม่ใช่ทุกชนิดที่ระบบมี) */
export const RECURRING_DOC_TYPES: readonly AccountDocType[] = [
  "INVOICE",
  "QUOTATION",
  "PURCHASE",
  "EXPENSE",
];

export function isRecurringDocType(v: unknown): v is AccountDocType {
  return typeof v === "string" && (RECURRING_DOC_TYPES as readonly string[]).includes(v);
}

export const RECURRING_DOC_LABEL: Record<string, string> = {
  INVOICE: "ใบแจ้งหนี้",
  QUOTATION: "ใบเสนอราคา",
  PURCHASE: "บันทึกซื้อ",
  EXPENSE: "บันทึกค่าใช้จ่าย",
};

export const FREQUENCY_LABEL: Record<AccountRecurringFrequency, string> = {
  WEEKLY: "ทุกสัปดาห์",
  MONTHLY: "ทุกเดือน",
  QUARTERLY: "ทุก 3 เดือน",
  YEARLY: "ทุกปี",
};

export const FREQUENCIES: readonly AccountRecurringFrequency[] = ["WEEKLY", "MONTHLY", "QUARTERLY", "YEARLY"];

export function isFrequency(v: unknown): v is AccountRecurringFrequency {
  return typeof v === "string" && (FREQUENCIES as readonly string[]).includes(v);
}

/** ชื่อวันไทย (0 = อาทิตย์ … 6 = เสาร์) — ลำดับตรงกับ Date.getUTCDay() */
export const WEEKDAY_LABEL = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"] as const;

/** จำนวนเดือนที่ก้าวต่อ 1 งวด (WEEKLY ไม่ใช้) */
const MONTH_STEP: Record<AccountRecurringFrequency, number> = {
  WEEKLY: 0,
  MONTHLY: 1,
  QUARTERLY: 3,
  YEARLY: 12,
};

// ─────────────────── วันที่ (UTC เที่ยงคืน) ───────────────────

/** ตัดเวลาทิ้ง เหลือเที่ยงคืน UTC ของวันนั้น */
export function utcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** "YYYY-MM-DD" → Date (UTC เที่ยงคืน) · รูปแบบผิด = null */
export function parseYmd(s: string | null | undefined): Date | null {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Date → "YYYY-MM-DD" (UTC) — ใช้เติมค่า <input type="date"> */
export function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** จำนวนวันของเดือน (UTC) */
export function daysInMonth(year: number, monthIndex0: number): number {
  return new Date(Date.UTC(year, monthIndex0 + 1, 0)).getUTCDate();
}

/**
 * วันที่ของ "วันที่ N ของเดือน" โดยหดให้พอดีเดือน
 * 🔴 31 ก.พ. ไม่มีจริง ⇒ ได้ 28 (หรือ 29 ในปีอธิกสุรทิน) — และ **แองเคอร์ยังเป็น 31 อยู่**
 *    เพราะทุกครั้งที่เลื่อนงวด เราคิดวันจาก `dayOfMonth` ของกฎใหม่เสมอ ไม่ได้คิดต่อจากวันที่ที่หดแล้ว
 *    (ถ้าคิดต่อจากวันที่หดแล้ว: 31 ม.ค. → 28 ก.พ. → 28 มี.ค. → ผิด ควรเป็น 31 มี.ค.)
 */
export function clampedDay(year: number, monthIndex0: number, dayOfMonth: number): Date {
  const y = year + Math.floor(monthIndex0 / 12);
  const m = ((monthIndex0 % 12) + 12) % 12;
  const day = Math.min(Math.max(1, dayOfMonth), daysInMonth(y, m));
  return new Date(Date.UTC(y, m, day));
}

export type ScheduleSpec = {
  frequency: AccountRecurringFrequency;
  /** 1–31 (ใช้กับ MONTHLY/QUARTERLY/YEARLY) — ไม่ส่ง = เอาวันของ startDate */
  dayOfMonth?: number | null;
  /** 0–6 (ใช้กับ WEEKLY) — ไม่ส่ง = เอาวันในสัปดาห์ของ startDate */
  weekday?: number | null;
  startDate: Date;
  endDate?: Date | null;
};

/** วันที่นัด "ครั้งแรก" ของกฎ = วันแรกที่ ≥ startDate และตรงเงื่อนไขความถี่ */
export function firstRunAt(spec: ScheduleSpec): Date {
  const start = utcDay(spec.startDate);
  if (spec.frequency === "WEEKLY") {
    const want = normWeekday(spec.weekday ?? start.getUTCDay());
    const diff = (want - start.getUTCDay() + 7) % 7;
    return new Date(start.getTime() + diff * DAY_MS);
  }
  const anchor = normDayOfMonth(spec.dayOfMonth ?? start.getUTCDate());
  const inStartMonth = clampedDay(start.getUTCFullYear(), start.getUTCMonth(), anchor);
  if (inStartMonth.getTime() >= start.getTime()) return inStartMonth;
  // เลยวันนัดของเดือนเริ่มไปแล้ว → งวดถัดไปตามก้าวของความถี่
  return clampedDay(start.getUTCFullYear(), start.getUTCMonth() + MONTH_STEP[spec.frequency], anchor);
}

/**
 * วันที่นัดของงวดถัดจาก `current`
 * 🔴 คิดจาก "เดือน/ปีของ current" + แองเคอร์วันของกฎ ⇒ 31 ม.ค. → 28 ก.พ. → **31 มี.ค.** (ไม่เพี้ยนสะสม)
 */
export function nextRunAfter(spec: ScheduleSpec, current: Date): Date {
  const cur = utcDay(current);
  if (spec.frequency === "WEEKLY") return new Date(cur.getTime() + 7 * DAY_MS);
  const anchor = normDayOfMonth(spec.dayOfMonth ?? utcDay(spec.startDate).getUTCDate());
  return clampedDay(cur.getUTCFullYear(), cur.getUTCMonth() + MONTH_STEP[spec.frequency], anchor);
}

export function normWeekday(v: number): number {
  const n = Math.round(Number(v) || 0);
  return ((n % 7) + 7) % 7;
}

export function normDayOfMonth(v: number): number {
  const n = Math.round(Number(v) || 1);
  return Math.min(31, Math.max(1, n));
}

/**
 * กุญแจงวด — ใช้เป็นครึ่งหนึ่งของ unique(ruleId, periodKey) ⇒ **หัวใจของ idempotency**
 * คิดจาก "วันที่นัด" ไม่ใช่ "วันที่รัน" ⇒ สร้างล่วงหน้า 5 วันก็ยังเป็นงวดเดิม
 */
export function periodKeyOf(frequency: AccountRecurringFrequency, runAt: Date): string {
  const d = utcDay(runAt);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  switch (frequency) {
    case "WEEKLY":
      return ymd(d); // 1 สัปดาห์ = 1 วันนัดเสมอ → ใช้วันที่ตรง ๆ อ่านง่ายกว่าเลขสัปดาห์ ISO
    case "MONTHLY":
      return `${y}-${String(m).padStart(2, "0")}`;
    case "QUARTERLY":
      return `${y}-Q${Math.floor((m - 1) / 3) + 1}`;
    case "YEARLY":
      return String(y);
  }
}

/** สรุปตารางเวลาเป็นภาษาคน — ใช้ทั้งในตารางรายการและในฟอร์ม */
export function scheduleLabel(spec: ScheduleSpec): string {
  switch (spec.frequency) {
    case "WEEKLY":
      return `ทุกสัปดาห์ วัน${WEEKDAY_LABEL[normWeekday(spec.weekday ?? utcDay(spec.startDate).getUTCDay())]}`;
    case "MONTHLY":
      return `ทุกเดือน วันที่ ${normDayOfMonth(spec.dayOfMonth ?? utcDay(spec.startDate).getUTCDate())}`;
    case "QUARTERLY":
      return `ทุก 3 เดือน วันที่ ${normDayOfMonth(spec.dayOfMonth ?? utcDay(spec.startDate).getUTCDate())}`;
    case "YEARLY":
      return `ทุกปี วันที่ ${normDayOfMonth(spec.dayOfMonth ?? utcDay(spec.startDate).getUTCDate())}`;
  }
}

// ─────────────────── แม่แบบเอกสาร (templateJson) ───────────────────

export type RecurringTemplateLine = {
  name: string;
  description: string;
  qty: number;
  unitName: string | null;
  /** สตางค์ (integer) — ห้ามเป็นทศนิยม/บาท */
  unitPriceSatang: number;
  /** 700 = 7% · 0 = 0% · -1 = ยกเว้น (ชุดเดียวกับ DocEditorV2) */
  vatRateBp: number;
  discountSatang: number;
  productId: string | null;
  accountId: string | null;
};

export type RecurringTemplate = {
  priceMode: "EXCL_VAT" | "INCL_VAT" | "NO_VAT";
  lines: RecurringTemplateLine[];
  note: string;
  tags: string[];
  /** ครบกำหนดชำระ = วันที่ออก + n วัน (null = ใช้ค่าเริ่มต้นของกิจการ) */
  dueDays: number | null;
};

export const TEMPLATE_MAX_LINES = 100;
const PRICE_MODES = ["EXCL_VAT", "INCL_VAT", "NO_VAT"] as const;
const VAT_BPS = new Set([700, 0, -1]);

const str = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);
const int = (v: unknown) => {
  const n = Math.round(Number(v ?? 0));
  return Number.isFinite(n) ? n : 0;
};

/**
 * อ่าน templateJson ที่มาจาก DB/ฟอร์มให้เหลือแต่ค่าที่ยอมรับได้ — **ไม่เคย throw**
 * (JSON ในคอลัมน์อาจเป็นอะไรก็ได้ ถ้า parse พังแล้ว cron ล้มทั้งรอบ = ร้านอื่นซวยด้วย)
 */
export function parseRecurringTemplate(raw: unknown): RecurringTemplate {
  const o = (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  const priceMode = (PRICE_MODES as readonly string[]).includes(String(o.priceMode))
    ? (o.priceMode as RecurringTemplate["priceMode"])
    : "EXCL_VAT";
  const rawLines = Array.isArray(o.lines) ? o.lines : [];
  const lines: RecurringTemplateLine[] = rawLines
    .slice(0, TEMPLATE_MAX_LINES)
    .map((l) => {
      const line = (l && typeof l === "object" ? l : {}) as Record<string, unknown>;
      const rate = int(line.vatRateBp);
      return {
        name: str(line.name, 300),
        description: str(line.description, 1000),
        qty: Math.max(0, Number(line.qty) || 0),
        unitName: str(line.unitName, 40) || null,
        unitPriceSatang: Math.max(0, int(line.unitPriceSatang)),
        vatRateBp: VAT_BPS.has(rate) ? rate : 700,
        discountSatang: Math.max(0, int(line.discountSatang)),
        productId: str(line.productId, 40) || null,
        accountId: str(line.accountId, 40) || null,
      };
    })
    .filter((l) => l.name.length > 0);
  const tags = (Array.isArray(o.tags) ? o.tags : [])
    .slice(0, 20)
    .map((t) => str(t, 40))
    .filter(Boolean);
  const dueDaysRaw = o.dueDays;
  const dueDays =
    dueDaysRaw == null || dueDaysRaw === "" ? null : Math.min(365, Math.max(0, int(dueDaysRaw)));
  return { priceMode, lines, note: str(o.note, 2000), tags, dueDays };
}

/** แท็กที่ติดเอกสารทุกใบที่เกิดจากกฎ — ใช้ค้นหาในหน้ารายการได้ */
export const RECURRING_TAG = "ประจำ";

/**
 * เหตุผลไทยว่าทำไมกฎนี้ยัง "ออกเอกสารอัตโนมัติ" ไม่ได้ — คืน null = พร้อมออก
 * ใช้ทั้งตอนบันทึกกฎ (เตือนล่วงหน้า) และตอน cron ทำงาน (ตัดสินว่าจะ issue ไหม)
 */
export function autoApproveBlockReason(input: {
  contactId: string | null;
  template: RecurringTemplate;
}): string | null {
  if (!input.contactId) return "ยังไม่ได้เลือกผู้ติดต่อ — เอกสารที่ไม่มีคู่ค้าออกอัตโนมัติไม่ได้";
  if (input.template.lines.length === 0) return "แม่แบบยังไม่มีรายการสินค้า/บริการ";
  if (input.template.lines.every((l) => l.qty * l.unitPriceSatang === 0))
    return "ทุกรายการในแม่แบบเป็นยอด 0 — ตรวจจำนวนและราคาก่อน";
  return null;
}

/** ตรวจกฎก่อนบันทึก — คืนรายการเหตุผลไทย (ว่าง = ผ่าน) */
export function validateRuleInput(input: {
  name: string;
  docType: string;
  frequency: string;
  startDate: Date | null;
  endDate: Date | null;
  template: RecurringTemplate;
  leadDays: number;
}): string[] {
  const errs: string[] = [];
  if (!input.name.trim()) errs.push("ต้องตั้งชื่อเอกสารประจำ");
  if (!isRecurringDocType(input.docType)) errs.push("ชนิดเอกสารนี้ตั้งเป็นเอกสารประจำไม่ได้");
  if (!isFrequency(input.frequency)) errs.push("ต้องเลือกความถี่");
  if (!input.startDate) errs.push("ต้องระบุวันที่เริ่ม");
  if (input.startDate && input.endDate && input.endDate.getTime() < input.startDate.getTime())
    errs.push("วันที่สิ้นสุดต้องไม่ก่อนวันที่เริ่ม");
  if (input.template.lines.length === 0) errs.push("ต้องมีรายการอย่างน้อย 1 รายการ");
  if (input.leadDays < 0 || input.leadDays > 60) errs.push("สร้างล่วงหน้าได้ 0–60 วัน");
  return errs;
}

// ─────────────────── สัญญาระหว่างฟอร์ม (client) กับ action (server) ───────────────────
// อยู่ไฟล์นี้เพราะทั้งสองฝั่งต้องเห็นชนิดเดียวกัน และไฟล์ `"use server"` ส่งออก type ไม่ได้

export type RecurringRulePayload = {
  systemId: string;
  /** มีค่า = แก้กฎเดิม · ไม่มี = สร้างใหม่ */
  ruleId?: string;
  name: string;
  docType: string;
  contactId: string | null;
  frequency: string;
  dayOfMonth: number | null;
  weekday: number | null;
  /** "YYYY-MM-DD" */
  startDate: string;
  endDate: string | null;
  leadDays: number;
  autoApprove: boolean;
  active: boolean;
  template: RecurringTemplate;
};

export type SaveRuleResult = { ok: true; id: string } | { ok: false; reason: string };
