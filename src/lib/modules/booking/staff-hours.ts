// SVC B.1 — เวลาต่อช่าง + ช่าง↔บริการ (pure · ใบสั่ง ledger/svc-briefs/svc-brief-b.1.md §3.1)
// 🔴 pure: import ได้เฉพาะ ./slots (+ import type) · ไม่มี prisma/db/next · ไม่อ่านนาฬิกาเครื่อง · ไม่แก้ object ที่รับเข้า
// 🔴 เวลาไทย: weekday คิดจากสตริงวันที่ (localWeekday = getUTCDay) — ห้ามใช้ getDay ดิบ (ข้อสอบรันหลาย TZ)
import { localToUtc, localWeekday } from "./slots";

export type HoursSource = "HR_SHIFT" | "STAFF_WEEKLY" | "UNIT_HOURS";
/** นาทีจากเที่ยงคืนของวันไทย */
export type MinWindow = { startMin: number; endMin: number };
/** = แบบที่ getUnitHours คืน */
export type UnitHoursRow = { weekday: number; openMin: number; closeMin: number; closed: boolean };

const DAY_MIN = 24 * 60;

/** ตัดเข้า [0, 1440] · ทิ้งช่วงว่าง · เรียง · รวมช่วงที่ซ้อน/ชิดกัน (คืน array ใหม่เสมอ) */
function normalize(ws: readonly MinWindow[]): MinWindow[] {
  const clipped = ws
    .map((w) => ({ startMin: Math.max(0, w.startMin), endMin: Math.min(DAY_MIN, w.endMin) }))
    .filter((w) => Number.isFinite(w.startMin) && Number.isFinite(w.endMin) && w.startMin < w.endMin)
    .sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);
  const out: MinWindow[] = [];
  for (const w of clipped) {
    const last = out[out.length - 1];
    if (last && w.startMin <= last.endMin) last.endMin = Math.max(last.endMin, w.endMin);
    else out.push({ ...w });
  }
  return out;
}

/** a ∩ b (ทั้งคู่ normalize แล้ว) */
function intersect(a: readonly MinWindow[], b: readonly MinWindow[]): MinWindow[] {
  const out: MinWindow[] = [];
  for (const x of a) {
    for (const y of b) {
      const s = Math.max(x.startMin, y.startMin);
      const e = Math.min(x.endMin, y.endMin);
      if (s < e) out.push({ startMin: s, endMin: e });
    }
  }
  return normalize(out);
}

/** a − b */
function subtract(a: readonly MinWindow[], b: readonly MinWindow[]): MinWindow[] {
  let cur = normalize(a);
  for (const br of normalize(b)) {
    const next: MinWindow[] = [];
    for (const w of cur) {
      if (br.endMin <= w.startMin || br.startMin >= w.endMin) {
        next.push(w);
        continue;
      }
      if (br.startMin > w.startMin) next.push({ startMin: w.startMin, endMin: br.startMin });
      if (br.endMin < w.endMin) next.push({ startMin: br.endMin, endMin: w.endMin });
    }
    cur = next;
  }
  return normalize(cur);
}

/**
 * เวลาร้านของวันนั้น (BookingHours 7 แถว + BookingClosure) — ตรรกะเดิมของ getAvailableSlots ทุกกรณี
 * (รวมกรณีแปลก: closure เปิดแต่ไม่ใส่เวลา ⇒ ใช้เวลาของ weekday แม้วันนั้นปิด) · [] = ปิด · มากสุด 1 ช่วง
 */
export function unitDayWindows(i: {
  dateStr: string;
  hours: readonly UnitHoursRow[];
  closure: { closed: boolean; openMin: number | null; closeMin: number | null } | null;
}): MinWindow[] {
  const weekday = localWeekday(i.dateStr);
  const day = i.hours.find((h) => h.weekday === weekday);
  const closure = i.closure;
  if (closure?.closed) return []; // ปิดทั้งวัน — ชนะเวลาทำการรายสัปดาห์เสมอ
  const openMin = closure ? (closure.openMin ?? day?.openMin) : day?.openMin;
  const closeMin = closure ? (closure.closeMin ?? day?.closeMin) : day?.closeMin;
  // ไม่มี closure แล้วสัปดาห์นั้นปิด/ไม่ได้ตั้ง = ปิด · มี closure เปิดพิเศษ = เปิดแม้ weekday ปิดอยู่
  if (!closure && day?.closed !== false) return [];
  if (openMin == null || closeMin == null || closeMin <= openMin) return [];
  return [{ startMin: openMin, endMin: closeMin }];
}

export type StaffDayInput = {
  /** "YYYY-MM-DD" ไทย — weekday คิดจากสตริง */
  dateStr: string;
  /** booking.staff.hoursSource ที่ resolve แล้ว */
  order: readonly HoursSource[];
  /** null = ไม่มีกะ (ไม่มี HR / ไม่ผูกพนักงาน / HR ไม่คืนแถวของคนนี้) */
  hrShift: { windows: MinWindow[]; breaks: MinWindow[] } | null;
  /** BookingStaffHours ทุกแถวของช่าง (ทุก weekday) */
  weekly: { weekday: number; startMin: number; endMin: number }[];
  /** ผลของ unitDayWindows */
  unitDay: MinWindow[];
  /** C-2 (employeesUnavailable) */
  onLeave: boolean;
};
export type StaffDayWindows = { source: HoursSource | null; windows: MinWindow[] };

/**
 * หน้าต่างเวลาของช่างในวันนั้น — ไล่ `order` เอาแหล่งแรกที่ "มีข้อมูล" (HR: มีแถวแม้ windows=[] ·
 * ตารางสัปดาห์: มีแถวถูกต้อง ≥ 1 ของ weekday ใดก็ได้ · เวลาร้าน: เสมอ) → ∩ เวลาร้าน → normalize · ลาชนะทุกแหล่ง
 */
export function staffDayWindows(i: StaffDayInput): StaffDayWindows {
  const weekday = localWeekday(i.dateStr);
  const validWeekly = i.weekly.filter(
    (r) => Number.isInteger(r.weekday) && r.weekday >= 0 && r.weekday <= 6 && r.startMin < r.endMin,
  );
  let source: HoursSource | null = null;
  let raw: MinWindow[] = [];
  for (const s of i.order) {
    if (s === "HR_SHIFT") {
      if (i.hrShift === null) continue;
      source = s;
      raw = subtract(i.hrShift.windows, i.hrShift.breaks);
      break;
    }
    if (s === "STAFF_WEEKLY") {
      if (validWeekly.length === 0) continue;
      source = s;
      raw = validWeekly.filter((r) => r.weekday === weekday).map((r) => ({ startMin: r.startMin, endMin: r.endMin }));
      break;
    }
    if (s === "UNIT_HOURS") {
      source = s;
      raw = i.unitDay.map((w) => ({ startMin: w.startMin, endMin: w.endMin }));
      break;
    }
  }
  if (source === null) return { source: null, windows: [] };
  if (i.onLeave) return { source, windows: [] };
  return { source, windows: intersect(normalize(raw), normalize(i.unitDay)) };
}

/** หน้าต่างนาที → epoch ms (ป้อน PlanStaff.windows ของ B.2) */
export function windowsToEpoch(dateStr: string, w: readonly MinWindow[]): { startAt: number; endAt: number }[] {
  return w.map((x) => ({ startAt: localToUtc(dateStr, x.startMin).getTime(), endAt: localToUtc(dateStr, x.endMin).getTime() }));
}

export type StaffServiceRow = { serviceId: string; durationMin: number | null; priceSatang: number | null };

/** null = ช่างทำบริการนี้ไม่ได้ · ค่าเฉพาะคนชนะของบริการ (null ในแถว = ตามบริการ) · services null = ทำทุกบริการ */
export function staffServiceTerms(
  services: readonly StaffServiceRow[] | null,
  service: { id: string; durationMin: number; priceSatang: number },
): { durationMin: number; priceSatang: number } | null {
  if (services === null) return { durationMin: service.durationMin, priceSatang: service.priceSatang };
  const row = services.find((r) => r.serviceId === service.id);
  if (!row) return null;
  return {
    durationMin: row.durationMin ?? service.durationMin,
    priceSatang: row.priceSatang ?? service.priceSatang,
  };
}
