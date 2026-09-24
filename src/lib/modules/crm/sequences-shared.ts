// sequences-shared.ts — ชนิด · ค่าคงที่ · ตัวตรวจ · ปฏิทินวันทำการ ของ "ลำดับการติดตาม" (sequence · ใบ C2.2 · พิมพ์เขียว §5.7 §11.5)
// 🔴 ไฟล์บริสุทธิ์ (ไม่แตะ prisma / env) — หน้า 'use client' และบริการ import ร่วมกันได้
// 🔴 เวลาไทย = UTC+7 ตายตัว (ไม่มี DST) — ห้ามใช้ getDay()/getDate() ของเครื่อง (เครื่องเป็น UTC)

export const SEQ_STEP_KINDS = ["EMAIL", "LINE", "TASK", "WAIT", "SMS"] as const;
export type SeqStepKind = (typeof SEQ_STEP_KINDS)[number];
export const SEQ_STEP_KIND_LABEL: Readonly<Record<SeqStepKind, string>> = Object.freeze({
  EMAIL: "ส่งอีเมล",
  LINE: "ส่งข้อความ LINE",
  TASK: "สร้างงานติดตาม",
  WAIT: "รอ",
  SMS: "ส่ง SMS",
});
/** ขั้นที่ "ส่งถึงลูกค้า" — ถามความยินยอม ณ เวลาส่ง + เคารพช่วงเวลาส่ง */
export const SEQ_SEND_KINDS: ReadonlySet<string> = new Set(["EMAIL", "LINE", "SMS"]);

export const SEQ_ENROLL_STATUSES = ["ACTIVE", "PAUSED", "DONE", "STOPPED"] as const;
export type SeqEnrollStatus = (typeof SEQ_ENROLL_STATUSES)[number];
export const SEQ_STATUS_LABEL: Readonly<Record<SeqEnrollStatus, string>> = Object.freeze({
  ACTIVE: "กำลังเดิน",
  PAUSED: "พักไว้",
  DONE: "ครบทุกขั้น",
  STOPPED: "หยุดแล้ว",
});

/** เหตุที่หยุด (โค้ดที่เก็บใน stoppedReason / payload) */
export const SEQ_STOP_REASON_LABEL: Readonly<Record<string, string>> = Object.freeze({
  REPLY: "ลูกค้าตอบกลับ",
  WON: "ดีลชนะ",
  LOST: "ดีลแพ้",
  OPT_OUT: "ลูกค้าขอไม่รับข่าวสาร",
  BOUNCE: "อีเมลตีกลับ",
  MANUAL: "หยุดเอง",
  REPLACED: "ลงทะเบียนใหม่แทน",
  CONTACT_GONE: "ผู้ติดต่อถูกเก็บถาวรหรือรวมไปแล้ว",
  // 🔴 "FAILED" เขียนโดยตัวทำขั้นเท่านั้น (ลองใหม่ครบจำนวนครั้งแล้วยังไม่สำเร็จ) — ทางเข้า `stopFor` ของโมดูลอื่นไม่รับโค้ดนี้
  FAILED: "ทำขั้นนี้ไม่สำเร็จหลายครั้ง ระบบจึงหยุดไว้",
});
export const seqStopReasonLabel = (code: string | null | undefined): string => (code ? (SEQ_STOP_REASON_LABEL[code] ?? code) : "");

export const SEQ_OUTCOMES = ["SENT", "DONE", "SKIPPED", "FAILED"] as const;
export type SeqOutcome = (typeof SEQ_OUTCOMES)[number];

export const SEQ_NAME_MAX = 120;
export const SEQ_DESC_MAX = 500;
export const SEQ_MAX_STEPS = 20;
export const SEQ_SUBJECT_MAX = 200;
export const SEQ_BODY_MAX = 4000;
export const SEQ_TASK_TITLE_MAX = 200;
export const SEQ_MAX_WAIT_DAYS = 365;
export const SEQ_MAX_WAIT_HOURS = 24 * 30;
/** X9: ลงทะเบียนเป็นกลุ่มได้ครั้งละไม่เกิน */
export const SEQ_BULK_MAX = 500;
export const SEQ_REASON_MIN = 5;
export const SEQ_REASON_MAX = 500;
export const SEQ_TASK_TYPES = ["TASK", "CALL", "MEETING", "EMAIL", "LINE", "VISIT", "NOTE"] as const;

export type SeqSendWindow = { from: string; to: string };

export type SeqStepInput = {
  kind: SeqStepKind | string;
  subject?: string | null;
  body?: string | null;
  templateId?: string | null;
  waitDays?: number | null;
  waitHours?: number | null;
  taskTitle?: string | null;
  taskType?: string | null;
  channel?: string | null;
};

export type SeqSequenceInput = {
  name: string;
  description?: string | null;
  stopOnReply?: boolean;
  stopOnWon?: boolean;
  stopOnLost?: boolean;
  businessDaysOnly?: boolean;
  sendWindow?: SeqSendWindow | null;
  maxActive?: number | null;
  active?: boolean;
  steps: SeqStepInput[];
};
export type SeqSequencePatch = Partial<SeqSequenceInput>;

/** ขั้นหลังตรวจ (รูปที่เก็บลงตาราง) */
export type SeqStepClean = {
  kind: SeqStepKind;
  subject: string | null;
  body: string | null;
  templateId: string | null;
  waitDays: number | null;
  waitHours: number | null;
  taskTitle: string | null;
  taskType: string | null;
  channel: string | null;
};

// ───────────────────────── ตัวตรวจ (ข้อความไทยที่ไม่โทษผู้ใช้ · ผลเป็น string = ข้อความผิด) ─────────────────────────

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;
export const hhmmToMin = (s: string): number => {
  const m = HHMM.exec(s);
  return m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
};

/** AUDIT-CLASS X6: ช่วงเวลาส่ง "HH:MM" (เวลาไทย · [from, to)) — null = ส่งได้ทุกเวลา */
export function cleanSendWindow(v: unknown): { ok: true; value: SeqSendWindow | null } | { ok: false; error: string } {
  if (v === null || v === undefined) return { ok: true, value: null };
  if (typeof v !== "object" || Array.isArray(v)) return { ok: false, error: "ช่วงเวลาส่งต้องมีเวลาเริ่มและเวลาสิ้นสุด (เช่น 09:00 ถึง 18:00)" };
  const o = v as Record<string, unknown>;
  const from = typeof o.from === "string" ? o.from.trim() : "";
  const to = typeof o.to === "string" ? o.to.trim() : "";
  if (!HHMM.test(from) || !HHMM.test(to)) return { ok: false, error: "ช่วงเวลาส่งใช้รูปแบบ ชั่วโมง:นาที ตั้งแต่ 00:00 ถึง 23:59 (เช่น 09:00 และ 18:00)" };
  if (hhmmToMin(from) >= hhmmToMin(to)) return { ok: false, error: "เวลาเริ่มส่งต้องมาก่อนเวลาหยุดส่งในวันเดียวกัน (เช่น 09:00 ถึง 18:00)" };
  return { ok: true, value: { from, to } };
}

const txt = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const intOrNull = (v: unknown): number | null | "bad" => {
  if (v === undefined || v === null || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).trim());
  if (!Number.isFinite(n) || !Number.isInteger(n)) return "bad";
  return n;
};

/** ตรวจขั้นเดียว — AUDIT-CLASS X6: หัวเรื่องอีเมลที่มีการขึ้นบรรทัด (header injection) = ปฏิเสธ */
export function cleanStep(s: SeqStepInput, i: number): { ok: true; value: SeqStepClean } | { ok: false; error: string } {
  const n = i + 1;
  const kind = txt(s?.kind).toUpperCase();
  if (!(SEQ_STEP_KINDS as readonly string[]).includes(kind)) return { ok: false, error: `ขั้นที่ ${n}: เลือกชนิดของขั้น (อีเมล · LINE · งาน · รอ · SMS)` };
  const base: SeqStepClean = { kind: kind as SeqStepKind, subject: null, body: null, templateId: txt(s.templateId) || null, waitDays: null, waitHours: null, taskTitle: null, taskType: null, channel: txt(s.channel) || null };
  if (kind === "WAIT") {
    const d = intOrNull(s.waitDays);
    const h = intOrNull(s.waitHours);
    if (d === "bad" || h === "bad") return { ok: false, error: `ขั้นที่ ${n}: จำนวนวัน/ชั่วโมงที่รอต้องเป็นจำนวนเต็ม` };
    if ((d ?? 0) < 0 || (h ?? 0) < 0) return { ok: false, error: `ขั้นที่ ${n}: จำนวนวัน/ชั่วโมงที่รอต้องไม่ติดลบ` };
    if ((d ?? 0) > SEQ_MAX_WAIT_DAYS || (h ?? 0) > SEQ_MAX_WAIT_HOURS) return { ok: false, error: `ขั้นที่ ${n}: รอได้ไม่เกิน ${SEQ_MAX_WAIT_DAYS} วัน` };
    if ((d ?? 0) === 0 && (h ?? 0) === 0) return { ok: false, error: `ขั้นที่ ${n}: ระบุจำนวนวันหรือชั่วโมงที่ต้องรออย่างน้อย 1` };
    return { ok: true, value: { ...base, waitDays: d ?? 0, waitHours: h ?? 0 } };
  }
  if (kind === "TASK") {
    const title = txt(s.taskTitle);
    if (!title) return { ok: false, error: `ขั้นที่ ${n}: ใส่ชื่องานที่จะสร้างให้ผู้ดูแล` };
    if (title.length > SEQ_TASK_TITLE_MAX || /[\r\n]/.test(title)) return { ok: false, error: `ขั้นที่ ${n}: ชื่องานยาวได้ไม่เกิน ${SEQ_TASK_TITLE_MAX} ตัวอักษรในบรรทัดเดียว` };
    const tt = txt(s.taskType).toUpperCase() || "TASK";
    if (!(SEQ_TASK_TYPES as readonly string[]).includes(tt)) return { ok: false, error: `ขั้นที่ ${n}: ชนิดงานนี้ใช้ในลำดับการติดตามไม่ได้` };
    return { ok: true, value: { ...base, taskTitle: title, taskType: tt, body: txt(s.body).slice(0, SEQ_BODY_MAX) || null } };
  }
  const body = typeof s.body === "string" ? s.body.replace(/\r\n?/g, "\n").trim() : "";
  if (body.length > SEQ_BODY_MAX) return { ok: false, error: `ขั้นที่ ${n}: ข้อความยาวได้ไม่เกิน ${SEQ_BODY_MAX.toLocaleString("th-TH")} ตัวอักษร` };
  if (kind === "EMAIL") {
    const raw = typeof s.subject === "string" ? s.subject : "";
    if (/[\r\n]/.test(raw)) return { ok: false, error: `ขั้นที่ ${n}: หัวเรื่องอีเมลต้องอยู่ในบรรทัดเดียว (ไม่ขึ้นบรรทัดใหม่)` };
    const subject = raw.trim();
    if (!subject) return { ok: false, error: `ขั้นที่ ${n}: ใส่หัวเรื่องอีเมล` };
    if (subject.length > SEQ_SUBJECT_MAX) return { ok: false, error: `ขั้นที่ ${n}: หัวเรื่องอีเมลยาวได้ไม่เกิน ${SEQ_SUBJECT_MAX} ตัวอักษร` };
    if (!body) return { ok: false, error: `ขั้นที่ ${n}: ใส่เนื้อความของอีเมล` };
    return { ok: true, value: { ...base, subject, body } };
  }
  if (!body) return { ok: false, error: `ขั้นที่ ${n}: ใส่ข้อความที่จะส่ง` };
  return { ok: true, value: { ...base, body } };
}

export function cleanSteps(steps: unknown): { ok: true; value: SeqStepClean[] } | { ok: false; error: string } {
  if (!Array.isArray(steps) || steps.length === 0) return { ok: false, error: "ลำดับการติดตามต้องมีอย่างน้อย 1 ขั้น" };
  if (steps.length > SEQ_MAX_STEPS) return { ok: false, error: `ลำดับการติดตามมีได้ไม่เกิน ${SEQ_MAX_STEPS} ขั้น` };
  const out: SeqStepClean[] = [];
  for (let i = 0; i < steps.length; i += 1) {
    const r = cleanStep((steps[i] ?? {}) as SeqStepInput, i);
    if (!r.ok) return r;
    out.push(r.value);
  }
  return { ok: true, value: out };
}

/** คำอธิบายสั้นของขั้น (การ์ดในตัวแก้ไข / สถิติ) */
export function describeStep(s: Pick<SeqStepClean, "kind" | "subject" | "body" | "waitDays" | "waitHours" | "taskTitle">): string {
  if (s.kind === "WAIT") {
    const parts = [s.waitDays ? `${s.waitDays} วัน` : "", s.waitHours ? `${s.waitHours} ชั่วโมง` : ""].filter(Boolean);
    return `รอ ${parts.join(" ") || "0 วัน"}`;
  }
  if (s.kind === "TASK") return `สร้างงาน "${s.taskTitle ?? ""}"`;
  if (s.kind === "EMAIL") return `อีเมล "${s.subject ?? ""}"`;
  const b = (s.body ?? "").replace(/\s+/g, " ");
  return `${SEQ_STEP_KIND_LABEL[s.kind]} "${b.length > 40 ? `${b.slice(0, 40)}…` : b}"`;
}

// ───────────────────────── ปฏิทินวันทำการ (เวลาไทย) ─────────────────────────

const BKK_MS = 7 * 3_600_000;
const DAY_MS = 86_400_000;
export const WEEKDAY_LABEL: readonly string[] = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"];
export const DEFAULT_BUSINESS_DAYS: readonly number[] = [1, 2, 3, 4, 5];

export type SeqHoliday = { date: string; name: string };
export type SeqCalendar = { businessDays: readonly number[]; holidays: ReadonlySet<string> };

/** settings.crm.businessDays / holidays (ค่าเพี้ยน = ค่าเริ่มต้น · วันหยุดรับทั้ง {date,name} และ "YYYY-MM-DD") */
export function parseCalendar(crm: unknown): { businessDays: number[]; holidays: SeqHoliday[] } {
  const o = crm && typeof crm === "object" && !Array.isArray(crm) ? (crm as Record<string, unknown>) : {};
  const bd = Array.isArray(o.businessDays) ? [...new Set(o.businessDays.filter((d): d is number => Number.isInteger(d) && (d as number) >= 0 && (d as number) <= 6))].sort() : [];
  const hol: SeqHoliday[] = [];
  const seen = new Set<string>();
  for (const h of Array.isArray(o.holidays) ? o.holidays : []) {
    const date = typeof h === "string" ? h : h && typeof h === "object" ? String((h as Record<string, unknown>).date ?? "") : "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || seen.has(date)) continue;
    seen.add(date);
    const name = h && typeof h === "object" ? String((h as Record<string, unknown>).name ?? "") : "";
    hol.push({ date, name });
  }
  hol.sort((a, b) => a.date.localeCompare(b.date));
  return { businessDays: bd.length ? bd : [...DEFAULT_BUSINESS_DAYS], holidays: hol };
}

/** เวลาไทยของ `d` เป็นช่อง UTC ของ Date ที่เลื่อนแล้ว */
const shifted = (d: Date | number): Date => new Date((typeof d === "number" ? d : d.getTime()) + BKK_MS);
export const thaiYmdOf = (d: Date | number): string => shifted(d).toISOString().slice(0, 10);
export const thaiWeekdayOf = (d: Date | number): number => shifted(d).getUTCDay();
const thaiMinOfDay = (d: Date | number): number => {
  const s = shifted(d);
  return s.getUTCHours() * 60 + s.getUTCMinutes();
};
/** เวลาจริงของ "วันเดียวกับ `d` (ไทย) เวลา `min` นาทีหลังเที่ยงคืน" */
const atThaiMinute = (d: Date | number, min: number): number => {
  const s = shifted(d);
  return Date.UTC(s.getUTCFullYear(), s.getUTCMonth(), s.getUTCDate()) - BKK_MS + min * 60_000;
};

export const isBusinessDay = (d: Date | number, cal: SeqCalendar): boolean => cal.businessDays.includes(thaiWeekdayOf(d)) && !cal.holidays.has(thaiYmdOf(d));

type Rules = { businessDaysOnly: boolean; sendWindow: SeqSendWindow | null };

/** ช่วงเวลาส่งเปิดอยู่ไหม ณ `at` (วันทำการ ถ้าบังคับ + [from, to)) */
export function windowOpen(at: Date, rules: Rules, cal: SeqCalendar): boolean {
  if (rules.businessDaysOnly && !isBusinessDay(at, cal)) return false;
  if (!rules.sendWindow) return true;
  const m = thaiMinOfDay(at);
  return m >= hhmmToMin(rules.sendWindow.from) && m < hhmmToMin(rules.sendWindow.to);
}

/**
 * ดัน `at` เข้าช่วงเวลาส่ง: ก่อน `from` ⇒ วันเดียวกันเวลา `from` · ตั้งแต่ `to` หรือวันที่ไม่ใช่วันทำการ ⇒ วันทำการถัดไปเวลา `from`
 * (ไม่มีช่วงเวลา ⇒ วันทำการถัดไป เวลาเดิม) · ไม่มีวันทำการเลยใน 400 วัน = คืนค่าเดิม (ไม่วนไม่รู้จบ)
 */
export function clampIntoWindow(at: Date, rules: Rules, cal: SeqCalendar): Date {
  let t = at.getTime();
  const from = rules.sendWindow ? hhmmToMin(rules.sendWindow.from) : null;
  const to = rules.sendWindow ? hhmmToMin(rules.sendWindow.to) : null;
  for (let guard = 0; guard < 400; guard += 1) {
    const bizOk = !rules.businessDaysOnly || isBusinessDay(t, cal);
    if (from === null || to === null) {
      if (bizOk) return new Date(t);
      t += DAY_MS;
      continue;
    }
    const m = thaiMinOfDay(t);
    if (bizOk && m >= from && m < to) return new Date(t);
    if (bizOk && m < from) return new Date(atThaiMinute(t, from));
    t = atThaiMinute(t + DAY_MS, from);
  }
  return at;
}

/** เวลาถัดไปหลังขั้น "รอ": + waitDays (วันทำการถ้าบังคับ — เวลาไทยเดิม) + waitHours แล้วดันเข้าช่วงเวลาส่ง */
export function afterWait(now: Date, waitDays: number, waitHours: number, rules: Rules, cal: SeqCalendar): Date {
  let t = now.getTime();
  const days = Math.max(0, Math.floor(waitDays));
  if (rules.businessDaysOnly) {
    for (let i = 0; i < days; i += 1) {
      t += DAY_MS;
      for (let g = 0; g < 400 && !isBusinessDay(t, cal); g += 1) t += DAY_MS;
    }
  } else t += days * DAY_MS;
  t += Math.max(0, Math.floor(waitHours)) * 3_600_000;
  return clampIntoWindow(new Date(t), rules, cal);
}

// ───────────────────────── วันหยุดราชการไทย (R-E.9 · รายการตายตัว แก้ไขได้ในหน้าตั้งค่า) ─────────────────────────
// 🔴 เฉพาะวันหยุด "วันที่ตายตัว" ตามประกาศคณะรัฐมนตรี — วันหยุดตามจันทรคติ (มาฆบูชา · วิสาขบูชา · อาสาฬหบูชา · เข้าพรรษา)
//    และวันหยุดชดเชย/วันหยุดพิเศษ **ไม่ได้ใส่** เพราะในรีโปไม่มีประกาศทางการให้ตรวจวันที่ — ร้านเพิ่มเองได้ในหน้าตั้งค่า
const FIXED_THAI_HOLIDAYS: readonly [string, string][] = [
  ["01-01", "วันขึ้นปีใหม่"],
  ["04-06", "วันจักรี"],
  ["04-13", "วันสงกรานต์"],
  ["04-14", "วันสงกรานต์"],
  ["04-15", "วันสงกรานต์"],
  ["05-01", "วันแรงงานแห่งชาติ"],
  ["05-04", "วันฉัตรมงคล"],
  ["06-03", "วันเฉลิมพระชนมพรรษาสมเด็จพระราชินี"],
  ["07-28", "วันเฉลิมพระชนมพรรษาพระบาทสมเด็จพระเจ้าอยู่หัว"],
  ["08-12", "วันแม่แห่งชาติ"],
  ["10-13", "วันนวมินทรมหาราช"],
  ["10-23", "วันปิยมหาราช"],
  ["12-05", "วันพ่อแห่งชาติ"],
  ["12-10", "วันรัฐธรรมนูญ"],
  ["12-31", "วันสิ้นปี"],
];
/** ปีที่มีรายการ (ค.ศ.) — รับ พ.ศ. 2569–2570 ด้วย */
export const THAI_HOLIDAY_YEARS: readonly number[] = [2026, 2027];

/** ค.ศ. ของปีที่ขอ (รับ พ.ศ.) — ไม่มีรายการ = null */
export function thaiHolidayYear(year: unknown): number | null {
  const n = typeof year === "number" ? year : Number(String(year ?? "").trim());
  if (!Number.isInteger(n)) return null;
  const ce = n > 2400 ? n - 543 : n;
  return THAI_HOLIDAY_YEARS.includes(ce) ? ce : null;
}

export function thaiPublicHolidays(ceYear: number): SeqHoliday[] {
  return FIXED_THAI_HOLIDAYS.map(([md, name]) => ({ date: `${ceYear}-${md}`, name }));
}

// ───────────────────────── ป้ายสำหรับหน้าจอ (ภาพ 07 ล่าง — แถบภาพรวม + ตารางผู้ลงทะเบียน) ─────────────────────────

const oneLine = (v: unknown, max: number): string => {
  const t = String(v ?? "").replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
};

/**
 * "เข้าเมื่อ" แบบสัมพัทธ์ตามปฏิทิน **ไทย** (+07:00) — ภาพ 07 ล่างใช้ "วันนี้ · 2 วัน · 8 วัน"
 * 🔴 นับเป็น "วันตามปฏิทินไทย" ไม่ใช่ 24 ชั่วโมง (เครื่องเป็น UTC · ห้าม getDate() ดิบ — reference_thai_date_getday_trap)
 * 🔴 คำนวณฝั่งเซิร์ฟเวอร์แล้วส่งเป็นสตริงให้หน้าจอ (ถ้าคิดฝั่งเบราว์เซอร์ ค่าจะต่างจากตอน SSR = hydration เพี้ยน)
 */
export function thaiAgoLabel(from: Date | number | string | null | undefined, now: Date | number = Date.now()): string {
  const t = typeof from === "string" ? Date.parse(from) : from instanceof Date ? from.getTime() : typeof from === "number" ? from : NaN;
  if (!Number.isFinite(t)) return "—";
  const days = Math.round((Date.parse(`${thaiYmdOf(now)}T00:00:00Z`) - Date.parse(`${thaiYmdOf(t)}T00:00:00Z`)) / DAY_MS);
  if (days <= 0) return "วันนี้";
  if (days === 1) return "เมื่อวาน";
  if (days < 30) return `${days.toLocaleString("th-TH")} วัน`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months.toLocaleString("th-TH")} เดือน`;
  return `${Math.floor(days / 365).toLocaleString("th-TH")} ปี`;
}

/** การ์ดหนึ่งใบบนแถบภาพรวม: ป้ายสั้น (ชนิด/เวลารอ) · หัวข้อ · รายละเอียดบรรทัดเดียว */
export type SeqStepCard = { chip: string; title: string; detail: string };

/** ขั้น → การ์ดภาพรวม (ภาพ 07 ล่าง: "วันที่ 0 / รอ 3 วัน / LINE / งานโทร") — ฟังก์ชันบริสุทธิ์ ใช้ได้ทั้งสองฝั่ง */
export function seqStepCard(
  s: { kind: SeqStepKind | string; subject?: string | null; body?: string | null; taskTitle?: string | null; taskType?: string | null; waitDays?: number | null; waitHours?: number | null },
  index: number,
  o: { businessDaysOnly?: boolean } = {},
): SeqStepCard {
  const kind = s.kind as SeqStepKind;
  if (kind === "WAIT") {
    const parts = [s.waitDays ? `${s.waitDays.toLocaleString("th-TH")} วัน` : "", s.waitHours ? `${s.waitHours.toLocaleString("th-TH")} ชั่วโมง` : ""].filter(Boolean);
    return {
      chip: `รอ ${parts.join(" ") || "0 วัน"}`,
      title: "รอก่อนทำขั้นถัดไป",
      detail: o.businessDaysOnly ? "เฉพาะวันทำการ" : "นับทุกวันตามปฏิทิน",
    };
  }
  const first = index === 0 ? "วันที่ 0" : "";
  if (kind === "TASK") {
    return {
      chip: first || (s.taskType === "CALL" ? "งานโทร" : "งานติดตาม"),
      title: oneLine(s.taskTitle, 60) || "สร้างงานติดตาม",
      detail: "มอบให้ผู้ดูแลดีลหรือผู้ดูแลผู้ติดต่อ",
    };
  }
  if (kind === "EMAIL") {
    return { chip: first || "อีเมล", title: oneLine(s.subject, 60) || "ส่งอีเมล", detail: oneLine(s.body, 70) || "ยังไม่ได้เขียนเนื้อความ" };
  }
  return {
    chip: first || (kind === "LINE" ? "LINE" : kind === "SMS" ? "SMS" : (SEQ_STEP_KIND_LABEL[kind] ?? "ขั้น")),
    title: SEQ_STEP_KIND_LABEL[kind] ?? "ขั้นของลำดับ",
    detail: oneLine(s.body, 70) || "ยังไม่ได้เขียนข้อความ",
  };
}
