// next-fire.ts — กติกาเวลาของเตือน/นัดส่วนตัว (CAL1.2 · docs/modules/32-secretary-calendar.md §5) — **บริสุทธิ์ล้วน**
//
// 🔴 ไม่แตะฐาน · ไม่อ่านนาฬิกาเอง (`now` มาจากผู้เรียกเสมอ) · เวลาไทย = UTC+7 คงที่ (ไทยไม่มี DST)
//    คำนวณบน "เลขวันไทย" (จำนวนวันนับจาก 1970-01-01 ตามเวลาไทย) แล้วแปลงกลับเป็น UTC — ไม่ใช้ตัวอ่านเวลาตามเครื่อง
// ข้อสอบ: scripts/qc-cal-1.2.mts (ส่วน P · ครอบทุกกิ่ง)

export const BKK_OFFSET_MS = 7 * 3_600_000;
const DAY_MS = 86_400_000;
const MIN_MS = 60_000;
/** all-day ยิงเตือนเวลา 09:00 ไทยของวันนั้น (§5.1) */
export const ALL_DAY_FIRE_MINUTE = 540;
/** เตือนล่วงหน้าที่อนุญาต (นาที · §2 `leadMinutes`) */
export const LEAD_MINUTES: readonly number[] = [0, 5, 10, 15, 30, 60, 120, 1440];
/** ย้ำ 1 ครั้งหลังยิงครั้งปกติ (§5.6) */
export const NAG_AFTER_MS = 30 * MIN_MS;
/** เผื่อเวลาที่ "เพิ่งผ่าน" ตอนตรวจ past_time (§5.3) */
export const PAST_GRACE_MS = 30_000;
export const TITLE_MAX = 200;
export const NOTE_MAX = 2_000;
export const EVENT_MAX_MS = 14 * DAY_MS;
export const AHEAD_MAX_MS = 2 * 365 * DAY_MS;
export const OCC_CAP = 62;

export type CalRepeatT = "NONE" | "DAILY" | "WEEKLY" | "MONTHLY";
export type CalKindT = "REMINDER" | "EVENT";
export type CalStatusT = "DRAFT" | "OPEN" | "DONE" | "CANCELLED";

/** ส่วนของแถวที่กติกาเวลาใช้ */
export type RuleItem = {
  startAt: Date;
  allDay?: boolean;
  repeat: CalRepeatT;
  repeatDays?: number[];
  leadMinutes?: number;
  firedOccAt?: Date | null;
};
export type FireState = RuleItem & {
  status: CalStatusT;
  occursAt: Date;
  snoozeUntil?: Date | null;
  nagAt?: Date | null;
};

// ───────── ตัวช่วยวันไทย ─────────
/** เลขวันไทยของเวลา t */
export const bkkDayNo = (t: Date | number): number => Math.floor((+t + BKK_OFFSET_MS) / DAY_MS);
/** เวลาเริ่มวันไทยเลข d (UTC จริง) */
const dayStartMs = (d: number): number => d * DAY_MS - BKK_OFFSET_MS;
/** วันในสัปดาห์ของวันไทยเลข d (0=อา … 6=ส · 1970-01-01 = พฤหัส) */
export const weekdayOf = (d: number): number => (((d + 4) % 7) + 7) % 7;
/** "YYYY-MM-DD" ไทย → เลขวัน (รูปผิด = null) */
export function ymdToDayNo(ymd: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return null;
  const y = +m[1], mo = +m[2] - 1, d = +m[3];
  const t = Date.UTC(y, mo, d);
  const back = new Date(t);
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo || back.getUTCDate() !== d) return null;
  return t / DAY_MS;
}
/** เลขวัน → "YYYY-MM-DD" */
export function dayNoToYmd(d: number): string {
  const t = new Date(d * DAY_MS);
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}-${String(t.getUTCDate()).padStart(2, "0")}`;
}
/** เวลาของวัน (ms นับจากเที่ยงคืนไทย) ที่ใช้กับทุก occurrence */
function timeOfDayMs(item: RuleItem): number {
  if (item.allDay) return ALL_DAY_FIRE_MINUTE * MIN_MS;
  return (((+item.startAt + BKK_OFFSET_MS) % DAY_MS) + DAY_MS) % DAY_MS;
}
/** วันในสัปดาห์ของ WEEKLY (ว่าง = วันของ startAt) — ไม่ซ้ำ · เรียง */
export function weeklyDays(item: RuleItem): number[] {
  const raw = item.repeatDays && item.repeatDays.length ? item.repeatDays : [weekdayOf(bkkDayNo(item.startAt))];
  return [...new Set(raw)].sort((a, b) => a - b);
}
const daysInMonth = (y: number, mo: number): number => new Date(Date.UTC(y, mo + 1, 0)).getUTCDate();

// ───────── §5.1 occurrences ─────────
/**
 * ครั้งของการเตือน/นัดที่อยู่ใน [fromUtc, toUtc] (รวมปลาย) · ไม่เกิน `cap` ครั้ง · เรียงเวลา
 * NONE = [startAt] (all-day = 09:00 ของวันนั้น) · ไม่มีวันสิ้นสุดของการทำซ้ำ
 */
export function occurrences(item: RuleItem, fromUtc: Date, toUtc: Date, cap = OCC_CAP): Date[] {
  const from = +fromUtc, to = +toUtc;
  const out: Date[] = [];
  if (to < from || cap <= 0) return out;
  const tod = timeOfDayMs(item);
  const d0 = bkkDayNo(item.startAt);
  const first = dayStartMs(d0) + tod; // ครั้งแรก (NONE ที่ไม่ใช่ all-day = startAt ตรงตัว)
  const push = (ms: number): boolean => {
    if (ms >= from && ms <= to && ms >= first) out.push(new Date(ms));
    return out.length >= cap;
  };
  if (item.repeat === "NONE") {
    push(first);
    return out;
  }
  // วันเริ่มสแกน: ไม่ก่อนวันแรก และไม่ก่อนวันของ from (−1 เผื่อ tod)
  const startDay = Math.max(d0, bkkDayNo(from) - 1);
  const endDay = bkkDayNo(to) + 1;
  if (item.repeat === "DAILY" || item.repeat === "WEEKLY") {
    const set = item.repeat === "WEEKLY" ? new Set(weeklyDays(item)) : null;
    for (let d = startDay; d <= endDay; d++) {
      if (set && !set.has(weekdayOf(d))) continue;
      if (push(dayStartMs(d) + tod)) break;
    }
    return out;
  }
  // MONTHLY — ยึดวันที่ D ของ startAt เสมอ (เดือนสั้น = วันสุดท้ายของเดือน · ไม่ลื่นตาม)
  const s = new Date(d0 * DAY_MS);
  const anchor = s.getUTCDate();
  const f = new Date(startDay * DAY_MS);
  let y = f.getUTCFullYear(), mo = f.getUTCMonth();
  for (;;) {
    const day = Math.min(anchor, daysInMonth(y, mo));
    const dn = Date.UTC(y, mo, day) / DAY_MS;
    if (dn > endDay) break;
    if (push(dayStartMs(dn) + tod)) break;
    mo += 1;
    if (mo > 11) { mo = 0; y += 1; }
  }
  return out;
}

/** occurrence แรกที่ > after (ไม่สนเพดานช่วง) — null = ไม่มี (NONE ที่ผ่านแล้ว)
 *  หน้าต่างสแกนเริ่มที่ max(after+1, เที่ยงคืนไทยของวัน startAt) — review B1: startAt ไกลกว่า 70 วันต้องยังเจอครั้งแรก */
function firstAfter(item: RuleItem, after: number, skip: number | null): number | null {
  // หน้าต่างกว้างพอสำหรับทุกกติกา: DAILY/WEEKLY ≤ 7 วัน · MONTHLY ≤ 31 วัน (+สำรอง)
  const from = Math.max(after + 1, dayStartMs(bkkDayNo(item.startAt)));
  const occ = occurrences(item, new Date(from), new Date(from + 70 * DAY_MS), 8);
  for (const o of occ) if (o.getTime() > after && +o !== skip) return +o;
  return null;
}

// ───────── §5.2 nextFire ─────────
/**
 * ครั้งถัดไปที่ต้องเตือน: occurrence `o` แรก (≥ startAt) ที่ `o > now` และ `o ≠ firedOccAt`
 * `fireAt = max(o − leadMinutes, now)` · NONE ที่ startAt ≤ now = null
 */
export function nextFire(item: RuleItem, now: Date): { occursAt: Date; fireAt: Date } | null {
  const skip = item.firedOccAt ? +item.firedOccAt : null;
  const o = firstAfter(item, +now, skip);
  if (o === null) return null;
  const lead = (item.leadMinutes ?? 0) * MIN_MS;
  return { occursAt: new Date(o), fireAt: new Date(Math.max(o - lead, +now)) };
}

const minDate = (...ds: (Date | null | undefined)[]): Date | null => {
  let best: Date | null = null;
  for (const d of ds) if (d && (!best || +d < +best)) best = d;
  return best;
};

/**
 * จัดตารางใหม่หลังผู้ใช้แก้/เลื่อน/เสร็จ/ยืนยัน (§5.2): `occursAt` + `nextFireAt = min(ยิงครั้งปกติ, snoozeUntil, nagAt)` · ไม่ OPEN = null
 *   NONE: occursAt = ครั้งแรกเสมอ · ทำซ้ำ: occursAt = ครั้งถัดไปตาม nextFire (ไม่มี = คงค่าเดิม)
 */
export function schedule(s: FireState, now: Date): { occursAt: Date; nextFireAt: Date | null } {
  const nf = nextFire(s, now);
  const occursAt = s.repeat === "NONE" ? new Date(dayStartMs(bkkDayNo(s.startAt)) + timeOfDayMs(s)) : nf?.occursAt ?? s.occursAt;
  if (s.status !== "OPEN") return { occursAt, nextFireAt: null };
  return { occursAt, nextFireAt: minDate(nf?.fireAt, s.snoozeUntil, s.nagAt) };
}

// ───────── §5.6 ตัดสินเหตุ + สถานะหลังยิง (ใช้ใน calendar.fire) ─────────
export type FireReason = "SNOOZE" | "DUE" | "NAG";

/** เวลายิงครั้งปกติของ occursAt ที่บันทึกไว้ (null = ยิงไปแล้ว) */
function pendingNormalFire(s: FireState): number | null {
  if (s.firedOccAt && +s.firedOccAt === +s.occursAt) return null;
  return +s.occursAt - (s.leadMinutes ?? 0) * MIN_MS;
}

/** เหตุที่ต้องส่งตอนนี้ (เรียงความสำคัญ SNOOZE → DUE → NAG) · null = ไม่มี (ไม่ OPEN / ยังไม่ถึง) */
export function fireReason(s: FireState, now: Date): FireReason | null {
  if (s.status !== "OPEN") return null;
  if (s.snoozeUntil && +s.snoozeUntil <= +now) return "SNOOZE";
  const nf = pendingNormalFire(s);
  if (nf !== null && nf <= +now) return "DUE";
  if (s.nagAt && +s.nagAt <= +now) return "NAG";
  return null;
}

export type FirePatch = {
  occursAt: Date;
  firedOccAt: Date | null;
  lastFiredAt: Date;
  snoozeUntil: Date | null;
  nagAt: Date | null;
  nextFireAt: Date | null;
  fireAttempts: number;
};

/**
 * สถานะใหม่หลังส่งเหตุ `reason` (§5.6 ข้อ 4) — การส่งครั้งเดียวครอบทุกเหตุที่ถึงพร้อมกัน (ระบบล่มแล้วกลับมา = 1 ข้อความ)
 *   DUE: firedOccAt = occursAt · NONE → nagAt = now+30น. · ทำซ้ำ → occursAt = ครั้งถัดไป (ไม่ย้ำ)
 *   SNOOZE: snoozeUntil = null · NONE → nagAt = now+30น. · NAG: nagAt = null (ย้ำครั้งเดียว)
 */
export function afterFire(s: FireState, reason: FireReason, now: Date): FirePatch {
  let firedOccAt = s.firedOccAt ?? null;
  let occursAt = s.occursAt;
  let snoozeUntil = s.snoozeUntil ?? null;
  let nagAt = s.nagAt ?? null;
  const nf = pendingNormalFire(s);
  const dueNow = reason === "DUE" || (nf !== null && nf <= +now);
  const nag = new Date(+now + NAG_AFTER_MS);
  if (reason === "SNOOZE" || (snoozeUntil && +snoozeUntil <= +now)) {
    snoozeUntil = null;
    if (s.repeat === "NONE") nagAt = nag;
  }
  if (dueNow) {
    firedOccAt = occursAt;
    if (s.repeat === "NONE") nagAt = nag;
    else {
      const next = nextFire({ ...s, firedOccAt }, now);
      if (next) occursAt = next.occursAt;
    }
  }
  if (reason === "NAG") nagAt = null; // ย้ำแล้วไม่ย้ำอีก (fireReason ให้ NAG เฉพาะเมื่อไม่มีเหตุอื่นถึงพร้อมกัน)
  const normal = firedOccAt && +firedOccAt === +occursAt ? null : new Date(Math.max(+occursAt - (s.leadMinutes ?? 0) * MIN_MS, +now));
  return { occursAt, firedOccAt, lastFiredAt: now, snoozeUntil, nagAt, nextFireAt: minDate(normal, snoozeUntil, nagAt), fireAttempts: 0 };
}

// ───────── §5.4 เลื่อน ─────────
export type SnoozeTo = { preset: "1h" | "tomorrow9" } | { until: Date };
/** เป้าเวลาเลื่อน · ไม่ผ่าน = null (ผู้เรียกตอบ 400 "เลือกเวลาเลื่อนในอนาคต (ไม่เกิน 1 ปี)") */
export function snoozeTarget(to: SnoozeTo, now: Date): Date | null {
  if ("preset" in to) {
    if (to.preset === "1h") return new Date(Math.floor((+now + 60 * MIN_MS) / MIN_MS) * MIN_MS);
    return new Date(dayStartMs(bkkDayNo(now) + 1) + 9 * 60 * MIN_MS);
  }
  const u = +to.until;
  if (!Number.isFinite(u) || u <= +now + MIN_MS || u > +now + 365 * DAY_MS) return null;
  return new Date(u);
}

// ───────── §5.3 ตรวจตอนสร้าง/แก้ ─────────
export type WhenInput = {
  kind: CalKindT;
  title: string;
  note?: string | null;
  startAt: Date;
  endAt?: Date | null;
  allDay?: boolean;
  repeat: CalRepeatT;
  repeatDays?: number[];
  leadMinutes: number;
};
export type WhenError = { status: 400 | 409; code: "past_time" | "invalid"; message: string };

export const MSG = {
  past: "เวลานี้ผ่านไปแล้ว — เลือกเวลาในอนาคต",
  endBeforeStart: "เวลาสิ้นสุดต้องหลังเวลาเริ่ม",
  tooLong: "ช่วงเวลานานเกินไป",
  tooFar: "ตั้งล่วงหน้าได้ไม่เกิน 2 ปี",
  title: "ใส่เรื่องที่จะเตือน (ไม่เกิน 200 ตัวอักษร)",
  note: "บันทึกยาวเกินไป (ไม่เกิน 2,000 ตัวอักษร)",
  repeatDays: "วันที่ทำซ้ำไม่ถูกต้อง",
  lead: "เวลาเตือนล่วงหน้าไม่ถูกต้อง",
  reminderEnd: "เตือนความจำไม่มีเวลาสิ้นสุด — ใช้แบบนัดหมายแทน",
  badDate: "วันเวลาไม่ถูกต้อง",
  snooze: "เลือกเวลาเลื่อนในอนาคต (ไม่เกิน 1 ปี)",
} as const;

const bad = (message: string): WhenError => ({ status: 400, code: "invalid", message });

/** ตรวจค่าตามตาราง §5.3 (ไม่รวม link / เพดาน 500 ซึ่งต้องอ่านฐาน) · ผ่าน = null */
export function validateWhen(i: WhenInput, now: Date, opts: { skipPast?: boolean } = {}): WhenError | null {
  const title = (i.title ?? "").trim();
  if (!title || title.length > TITLE_MAX) return bad(MSG.title);
  if (i.note && i.note.length > NOTE_MAX) return bad(MSG.note);
  if (!(i.startAt instanceof Date) || !Number.isFinite(+i.startAt)) return bad(MSG.badDate);
  if (i.endAt != null && (!(i.endAt instanceof Date) || !Number.isFinite(+i.endAt))) return bad(MSG.badDate);
  if (!LEAD_MINUTES.includes(i.leadMinutes)) return bad(MSG.lead);
  const days = i.repeatDays ?? [];
  if (days.length && (i.repeat !== "WEEKLY" || days.some((d) => !Number.isInteger(d) || d < 0 || d > 6) || new Set(days).size !== days.length)) return bad(MSG.repeatDays);
  if (i.kind === "REMINDER" && i.endAt != null) return bad(MSG.reminderEnd);
  if (i.endAt != null) {
    if (+i.endAt <= +i.startAt) return bad(MSG.endBeforeStart);
    if (+i.endAt - +i.startAt > EVENT_MAX_MS) return bad(MSG.tooLong);
  }
  if (+i.startAt > +now + AHEAD_MAX_MS) return bad(MSG.tooFar);
  if (!opts.skipPast && i.kind === "REMINDER" && nextFire({ ...i, firedOccAt: null }, new Date(+now - PAST_GRACE_MS)) === null) {
    return { status: 400, code: "past_time", message: MSG.past };
  }
  return null;
}
