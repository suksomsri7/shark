// quiet-hours.ts — "ช่วงเวลาห้ามรบกวน" (quiet hours) ของทั้งแพลตฟอร์ม · เอนจินเดียว บริสุทธิ์ ไม่แตะฐานข้อมูล
//
// CRM C2.10 ▸ ยก (lift) ออกมาจาก `src/lib/modules/member/notifications.ts` ซึ่งเคยถือสำเนาส่วนตัวของตัวเอง
//   (M3.6) — ใบ C2.10 ต้องใช้กติกาเดียวกันกับฝั่งสมาชิกเป๊ะ ๆ ⇒ กติกา COMMON "ห้ามมีเอนจินที่สอง"
//   บังคับให้ย้ายมาที่นี่แล้วให้ทั้งสองโมดูล import ตัวเดียวกัน (สำเนาเดิมถูกลบ ไม่ใช่คัดลอก) ◂
//
// 🔴 เวลาไทยเสมอ (UTC+7) ผ่านการบวก offset แล้วอ่านด้วย `getUTC*` — ห้ามใช้ตัวอ่านเวลา "ตามเครื่อง" (ชั่วโมง/วัน/วันที่)
//    ซึ่งอ่านตามเขตเวลาของเครื่อง (บน VPS/Vercel = UTC ⇒ เพี้ยนไป 7 ชั่วโมง · [[reference_thai_date_getday_trap]])
// 🔴 `now` มาจากผู้เรียกเสมอ (cron/ข้อสอบส่งนาฬิกาของรอบให้) — ไฟล์นี้ไม่อ่านนาฬิกาเอง

/** UTC+7 เป็นมิลลิวินาที */
const BKK_OFFSET_MS = 7 * 3_600_000;

type BkkParts = { y: number; mo: number; day: number; h: number; mi: number };

/** ชิ้นส่วนของ "เวลาไทย" ณ เวลานั้น (อ่านด้วย getUTC* หลังบวก offset) */
export function bkkParts(d: Date): BkkParts {
  const t = new Date(d.getTime() + BKK_OFFSET_MS);
  return { y: t.getUTCFullYear(), mo: t.getUTCMonth(), day: t.getUTCDate(), h: t.getUTCHours(), mi: t.getUTCMinutes() };
}

/** Date ที่ตรงกับ HH:MM **เวลาไทย** ของวันฐาน (+dayOffset วัน) */
export function bkkAt(base: Date, hour: number, minute = 0, dayOffset = 0): Date {
  const t = bkkParts(base);
  return new Date(Date.UTC(t.y, t.mo, t.day + dayOffset, hour - 7, minute, 0, 0));
}

/** "YYYY-MM-DD" ของวันไทย (ใช้เป็นกุญแจ "วันเดียวกัน" ของการกันแจ้งซ้ำ) */
export function bkkYmd(d: Date): string {
  const t = bkkParts(d);
  return `${t.y}-${String(t.mo + 1).padStart(2, "0")}-${String(t.day).padStart(2, "0")}`;
}

/** เที่ยงคืนของวันไทยที่ครอบ `d` (เป็นเวลา UTC จริง) */
export function bkkDayStart(d: Date): Date {
  return bkkAt(d, 0, 0, 0);
}

/** แยก "HH:MM" เป็นตัวเลข — ค่าเพี้ยน = 0 (ตัวตรวจความถูกต้องของค่าอยู่ที่ `isHM`) */
export function parseHM(s: string): { h: number; m: number } {
  const [h, m] = String(s ?? "0:0")
    .split(":")
    .map((x) => Number(x) || 0);
  return { h, m };
}

/** ค่านี้เป็น "HH:MM" ที่ใช้ได้จริงไหม (00:00–23:59) — ด่านตรวจของหน้าตั้งค่า */
export function isHM(v: unknown): v is string {
  if (typeof v !== "string") return false;
  const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(v.trim());
  return !!m;
}

/**
 * เวลาไทยตอนนี้อยู่ในช่วง [from, to) ไหม — รองรับช่วงข้ามเที่ยงคืน (from > to เช่น 21:00–07:00)
 * from = to ⇒ "ไม่มีช่วงห้ามรบกวน" (ไม่ใช่ "ห้ามทั้งวัน" — ค่าที่ตั้งพลาดต้องไม่ปิดปากระบบทั้งวัน)
 */
export function inQuietWindow(now: Date, from: string, to: string): boolean {
  const t = bkkParts(now);
  const cur = t.h * 60 + t.mi;
  const f = parseHM(from);
  const g = parseHM(to);
  const fm = f.h * 60 + f.m;
  const tm = g.h * 60 + g.m;
  if (fm === tm) return false;
  if (fm < tm) return cur >= fm && cur < tm;
  return cur >= fm || cur < tm;
}

/** เวลาที่ควรเลื่อนไปส่ง เมื่อโดนกันด้วย quiet hours ("to" ของวันนี้ ถ้ายังไม่ถึง / ของพรุ่งนี้ ถ้าผ่านไปแล้ว) */
export function nextQuietEnd(now: Date, to: string): Date {
  const t = bkkParts(now);
  const g = parseHM(to);
  const cur = t.h * 60 + t.mi;
  const tm = g.h * 60 + g.m;
  const dayOffset = cur < tm ? 0 : 1;
  return bkkAt(now, g.h, g.m, dayOffset);
}
