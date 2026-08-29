// business-hours.ts — เวลาทำการของทีมตอบแชท (WO-C16)
//
// เหตุ: ข้อความ "ทีมงานตอบ 9:00–18:00 น. (เวลาไทย) · นอกเวลาจะตอบให้เช้าวันถัดไป" เคยฝังตาย
// อยู่ในโค้ดหน้าเว็บของร้าน ⇒ ร้านแก้เองไม่ได้ และร้านอื่นที่ใช้แชทเดียวกันก็ไม่มีของแบบนี้เลย
// → ยกขึ้นเป็น **ความสามารถของแพลตฟอร์ม** (กฎเหล็กข้อ 3 · §2 ของ ledger/PLAN-CHAT-PLATFORM.md)
//
// ═══════════════ ทำไมเป็นไฟล์แยกและ "ไม่มี I/O เลย" ═══════════════
//  1. ตรวจรูปที่เดียว: ทั้งขาเขียน (server action) และขาอ่าน (`/api/v1/chat/config`) เรียกตัวเดียวกัน
//     ⇒ ข้อมูลที่ถูกเขียนด้วยมือลง DB หรือของเก่าที่รูปเพี้ยน จะไม่หลุดออก API
//  2. `pnpm fitness` F5 นับ "ไฟล์ในโมดูลที่ import raw prisma" แบบ ratchet (baseline 45 · เพิ่มไม่ได้)
//     → ตัวเขียน DB จึงอยู่ใน `service.ts` ที่ถูกนับไปแล้ว ไฟล์นี้ห้าม import prisma เด็ดขาด
//
// ═══════════════ รูปที่เก็บใน `ChatSetting.businessHours` (Json?) ═══════════════
//   { tz: "Asia/Bangkok",
//     note: { "th": "นอกเวลาจะตอบให้เช้าวันถัดไป" } | "ข้อความเดียวทุกภาษา",
//     days: [{ d: 1, open: "09:00", close: "18:00" }, …],
//     holidays: ["2026-12-31", "2027-01-01"] }
//
//  · `d` = 0 อาทิตย์ … 6 เสาร์ (ตรงกับ `Date.getDay()` และตรงกับสัญญา §3.2 ที่ตกลงกับผู้รับแล้ว)
//  · **วันที่ไม่อยู่ใน `days` = ปิด** (วันหยุดประจำสัปดาห์) — ไม่ต้องมีฟิลด์ `closed` ให้ตีความ 2 ทาง
//  · `holidays` = วันหยุดเฉพาะกิจตามปฏิทินของ `tz` นั้น (ไม่ใช่ UTC — วันที่ของไทยกับ UTC
//    ต่างกันได้ 1 วัน [[reference_thai_date_getday_trap]] ⇒ ผู้รับต้องตีความในเขตเวลานี้เท่านั้น)
//  · 1 วัน = 1 ช่วงเวลา (ยังไม่รองรับพักเที่ยง/ข้ามเที่ยงคืน) — เพิ่มทีหลังได้โดยไม่ต้อง migrate
//    เพราะคอลัมน์เป็น Json (จงใจ) แต่ **ห้ามเปลี่ยนความหมายของ 4 คีย์ที่มีอยู่**
//
// 🔴 null (ไม่ได้ตั้ง) ≠ ตั้งแล้วว่าง — ไม่ได้ตั้ง ต้องไม่แสดงอะไรเลยที่ฝั่งลูกค้า
//    (ห้าม default เป็น 24 ชม. หรือ 9–18 เพราะเดาแทนร้านผิดแล้วลูกค้าจะรอคำตอบตอนตี 3)

/** ค่าเริ่มต้นของ tz เมื่อร้านไม่ได้เลือก (ผู้ใช้กลุ่มแรกอยู่ไทยทั้งหมด) */
export const DEFAULT_TZ = "Asia/Bangkok";
/** เพดานจำนวนวันหยุดเฉพาะกิจ — กัน payload บวมและกัน UI ค้าง */
export const MAX_HOLIDAYS = 60;
/** ความยาวข้อความเสริมสูงสุด (แสดงต่อท้ายบรรทัดเวลาทำการ) */
export const MAX_NOTE_LEN = 200;

export const TIME_PATTERN = "^([01][0-9]|2[0-3]):[0-5][0-9]$";
const TIME_RE = new RegExp(TIME_PATTERN);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** ชื่อวันภาษาไทยเรียงตาม `d` (0 = อาทิตย์) — ใช้ทั้งหน้าตั้งค่าและข้อความ error */
export const DAY_LABELS = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัส", "ศุกร์", "เสาร์"] as const;

export type BusinessDay = { d: number; open: string; close: string };

/** รูปที่เก็บลง DB · `note` เก็บได้ทั้ง map ภาษา และสตริงเดียว (ผู้อ่านเป็นคนคลี่ตามภาษา) */
export type StoredBusinessHours = {
  tz: string;
  note: unknown;
  days: BusinessDay[];
  holidays: string[];
};

export type BusinessHoursResult =
  | { ok: true; value: StoredBusinessHours }
  | { ok: false; error: string };

/** เขตเวลาที่ให้เลือกในหน้าตั้งค่า (พิมพ์เองก็ได้ — เซิร์ฟเวอร์ตรวจด้วย Intl อยู่แล้ว) */
export const TZ_CHOICES: { value: string; label: string }[] = [
  { value: "Asia/Bangkok", label: "ไทย (Asia/Bangkok)" },
  { value: "Asia/Singapore", label: "สิงคโปร์ (Asia/Singapore)" },
  { value: "Asia/Kuala_Lumpur", label: "มาเลเซีย (Asia/Kuala_Lumpur)" },
  { value: "Asia/Jakarta", label: "อินโดนีเซีย (Asia/Jakarta)" },
  { value: "Asia/Tokyo", label: "ญี่ปุ่น (Asia/Tokyo)" },
  { value: "Asia/Dubai", label: "ดูไบ (Asia/Dubai)" },
  { value: "Europe/Berlin", label: "เยอรมนี (Europe/Berlin)" },
  { value: "UTC", label: "UTC" },
];

/**
 * เขตเวลาที่ระบบรู้จักจริงไหม — ถามรันไทม์ ไม่ใช่รายชื่อฮาร์ดโค้ด
 * (ฮาร์ดโค้ด = รายชื่อเน่าตามเวลา [[feedback_oracle_rots_over_time]] และตัดร้านต่างประเทศทิ้ง)
 */
export function isValidTimeZone(tz: unknown): tz is string {
  if (typeof tz !== "string" || tz.trim() === "") return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz.trim() });
    return true;
  } catch {
    return false;
  }
}

/** "HH:MM" → นาทีนับจากเที่ยงคืน · รูปผิด ("25:00", "9:00", "18:5") → null */
export function minutesOfTime(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const m = TIME_RE.exec(value.trim());
  if (!m) return null;
  const [h, mi] = value.trim().split(":");
  return Number(h) * 60 + Number(mi);
}

/** "YYYY-MM-DD" ที่มีอยู่จริงในปฏิทิน (กัน "2026-02-30" ที่ regex ผ่านแต่ไม่มีวันนั้น) */
export function isCalendarDate(value: unknown): value is string {
  if (typeof value !== "string" || !DATE_RE.test(value.trim())) return false;
  const [y, mo, d] = value.trim().split("-").map(Number) as [number, number, number];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

function normalizeNote(raw: unknown): { ok: true; note: unknown } | { ok: false; error: string } {
  if (raw === undefined || raw === null) return { ok: true, note: null };
  if (typeof raw === "string") {
    const s = raw.trim();
    if (s.length > MAX_NOTE_LEN) return { ok: false, error: `ข้อความเสริมยาวเกิน ${MAX_NOTE_LEN} ตัวอักษร` };
    return { ok: true, note: s === "" ? null : s };
  }
  if (typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: "ข้อความเสริมต้องเป็นข้อความ หรือ map ภาษา" };
  }
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v !== "string") return { ok: false, error: `ข้อความเสริมของภาษา ${k} ต้องเป็นข้อความ` };
    if (v.length > MAX_NOTE_LEN) return { ok: false, error: `ข้อความเสริมยาวเกิน ${MAX_NOTE_LEN} ตัวอักษร` };
    // 🔴 ไม่ตัดคีย์ที่ค่าว่างทิ้ง — "" คือการ **ตั้งใจปิดข้อความเฉพาะภาษานั้น**
    //    (กติกาเดียวกับ resolveLocale ใน service.ts · [[feedback_render_all_locales_before_ship]])
    out[k] = v;
  }
  return { ok: true, note: Object.keys(out).length === 0 ? null : out };
}

/**
 * ตรวจ + จัดระเบียบค่าที่จะเก็บ — ใช้ทั้งขาเขียน (ฟอร์ม) และขาอ่าน (ของที่อยู่ใน DB แล้ว)
 *
 * คืน error เป็น**ข้อความไทยที่บอกจุดผิดตรง ๆ** (ผู้ใช้คือเจ้าของร้าน ไม่ใช่โปรแกรมเมอร์)
 * และ **ห้ามโทษผู้ใช้** ([[feedback_error_must_not_blame_user]]) — บอกว่าอะไรที่ระบบรับได้
 */
export function validateBusinessHours(input: unknown): BusinessHoursResult {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, error: "รูปแบบเวลาทำการไม่ถูกต้อง" };
  }
  const src = input as Record<string, unknown>;

  const tzRaw = src.tz === undefined || src.tz === null || src.tz === "" ? DEFAULT_TZ : src.tz;
  if (!isValidTimeZone(tzRaw)) {
    return { ok: false, error: "ไม่รู้จักเขตเวลานี้ — เลือกจากรายการ เช่น Asia/Bangkok" };
  }
  const tz = (tzRaw as string).trim();

  if (!Array.isArray(src.days)) return { ok: false, error: "ต้องระบุวันทำการเป็นรายการ" };
  if (src.days.length === 0) {
    return { ok: false, error: "ต้องเลือกวันทำการอย่างน้อย 1 วัน (ไม่เลือกเลย = ปิดการแสดงเวลาทำการ)" };
  }
  if (src.days.length > 7) return { ok: false, error: "วันทำการมีได้ไม่เกิน 7 วัน" };

  const days: BusinessDay[] = [];
  const seen = new Set<number>();
  for (const raw of src.days) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return { ok: false, error: "รูปแบบวันทำการไม่ถูกต้อง" };
    }
    const r = raw as Record<string, unknown>;
    const d = typeof r.d === "number" ? r.d : Number(r.d);
    if (!Number.isInteger(d) || d < 0 || d > 6) {
      return { ok: false, error: "วันในสัปดาห์ต้องเป็น 0 (อาทิตย์) ถึง 6 (เสาร์)" };
    }
    if (seen.has(d)) return { ok: false, error: `วัน${DAY_LABELS[d]} ถูกระบุซ้ำ` };
    seen.add(d);

    const open = minutesOfTime(r.open);
    const close = minutesOfTime(r.close);
    if (open === null || close === null) {
      return {
        ok: false,
        error: `เวลาของวัน${DAY_LABELS[d]} ต้องอยู่ในรูปแบบ ชม:นาที ระหว่าง 00:00–23:59`,
      };
    }
    if (open >= close) {
      return { ok: false, error: `วัน${DAY_LABELS[d]} เวลาปิดต้องอยู่หลังเวลาเปิด` };
    }
    days.push({ d, open: (r.open as string).trim(), close: (r.close as string).trim() });
  }
  days.sort((a, b) => a.d - b.d);

  const holidaysRaw = src.holidays === undefined || src.holidays === null ? [] : src.holidays;
  if (!Array.isArray(holidaysRaw)) return { ok: false, error: "วันหยุดต้องเป็นรายการวันที่" };
  const holidays: string[] = [];
  for (const h of holidaysRaw) {
    const s = typeof h === "string" ? h.trim() : "";
    if (!isCalendarDate(s)) {
      return { ok: false, error: `วันหยุด "${String(h)}" ไม่ใช่วันที่ในรูปแบบ ปปปป-ดด-วว` };
    }
    if (!holidays.includes(s)) holidays.push(s);
  }
  if (holidays.length > MAX_HOLIDAYS) {
    return { ok: false, error: `วันหยุดใส่ได้ไม่เกิน ${MAX_HOLIDAYS} วัน` };
  }
  holidays.sort();

  const note = normalizeNote(src.note);
  if (!note.ok) return note;

  return { ok: true, value: { tz, note: note.note, days, holidays } };
}

/**
 * อ่านค่าที่เก็บไว้ให้ปลอดภัย — ของที่รูปเพี้ยน (แก้มือลง DB / ของเก่า) ถือว่า "ยังไม่ได้ตั้ง"
 * 🔴 fail-safe ทางเดียว: ไม่ได้ตั้ง = ไม่แสดงอะไร ดีกว่าเดาเวลาผิดแล้วลูกค้ารอเก้อ
 */
export function readBusinessHours(raw: unknown): StoredBusinessHours | null {
  if (raw === null || raw === undefined) return null;
  const res = validateBusinessHours(raw);
  return res.ok ? res.value : null;
}
