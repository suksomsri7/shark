// Slot engine — คำนวณช่องเวลาว่างจริง (pure functions, testable)
// timezone: ร้านไทย → คงที่ +07:00 (ไทยไม่มี DST) พอสำหรับ MVP

export const BKK_OFFSET_MIN = 7 * 60;
export const SLOT_STEP_MIN = 15;

// แปลง "วันที่ local (YYYY-MM-DD) + นาทีจากเที่ยงคืน" → UTC Date
export function localToUtc(dateStr: string, minutes: number): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 0, 0) + (minutes - BKK_OFFSET_MIN) * 60000);
}

// weekday (0=อาทิตย์) ของวันที่ local
export function localWeekday(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function minutesToHHMM(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export type HoursWindow = { startMin: number; endMin: number };
export type BusyRange = { startAt: Date; endAt: Date };

// ช่องเริ่มบริการที่ว่าง (นาทีจากเที่ยงคืน) สำหรับช่าง 1 คนในวันหนึ่ง
export function computeStaffSlots(params: {
  dateStr: string;
  hours: HoursWindow[]; // ชั่วโมงทำงานของ weekday นั้น
  busy: BusyRange[]; // นัดที่มีอยู่ (endAt รวม buffer แล้ว)
  durationMin: number;
  bufferMin: number;
  now: Date;
  stepMin?: number;
}): number[] {
  const { dateStr, hours, busy, durationMin, bufferMin, now } = params;
  const step = params.stepMin ?? SLOT_STEP_MIN;
  const block = durationMin + bufferMin;
  const out: number[] = [];

  for (const w of hours) {
    for (let t = w.startMin; t + durationMin <= w.endMin; t += step) {
      const startAt = localToUtc(dateStr, t);
      const endAt = localToUtc(dateStr, t + block);
      if (startAt.getTime() <= now.getTime()) continue; // อดีต
      const clash = busy.some(
        (b) => startAt < b.endAt && endAt > b.startAt, // overlap
      );
      if (!clash) out.push(t);
    }
  }
  return out;
}

// SVC B.3 ▸ ยอดมัดจำต่อนัด (pure · ใบสั่ง svc-brief-b.3 §3.1 · §6 ข้อ 12)
//   amount = ค่า resolve ของ booking.deposit.amount · null ⇒ 0 · PER_SERVICE ⇒ มัดจำของบริการ (คอลัมน์) ·
//   PERCENT ⇒ (minDurationMin null หรือ นาที ≥ minDurationMin) ? Math.round(ราคา × bp / 10000) : 0 · รูปอื่น ⇒ throw
//   ราคา/นาที = ค่าเฉพาะคน (staffServiceTerms) · Math.round = ปัดครึ่งขึ้น
export function computeDepositSatang(
  amount: unknown,
  i: { priceSatang: number; durationMin: number; serviceDepositSatang: number },
): number {
  if (amount === null) return 0;
  if (typeof amount !== "object" || Array.isArray(amount)) throw new Error("[deposit] รูปแบบยอดมัดจำไม่ถูกต้อง");
  const a = amount as { mode?: unknown; bp?: unknown; minDurationMin?: unknown };
  if (a.mode === "PER_SERVICE") return i.serviceDepositSatang;
  if (a.mode === "PERCENT") {
    if (typeof a.bp !== "number" || !Number.isFinite(a.bp)) throw new Error("[deposit] bp ไม่ถูกต้อง");
    const min = a.minDurationMin;
    if (min !== null && (typeof min !== "number" || !Number.isFinite(min))) throw new Error("[deposit] minDurationMin ไม่ถูกต้อง");
    if (min !== null && i.durationMin < min) return 0;
    return Math.round((i.priceSatang * a.bp) / 10000);
  }
  throw new Error("[deposit] ไม่รู้จักรูปแบบยอดมัดจำ");
}
// ◂ SVC B.3
