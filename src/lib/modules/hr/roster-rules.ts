// HR H2.1 ▸ กติกาตรวจตารางกะแบบฟังก์ชันล้วน (ไม่แตะ DB · ไม่อ่านนาฬิกา — ผู้เรียกส่งแถวมาเอง)
//
// ใช้กับ: checkRules / listRoster ของ hr/roster.ts (ตัวเตือนบนบอร์ด H2.2) — **เตือนอย่างเดียว ไม่เคยบล็อกการเผยแพร่** (brief R9)
// ค่าเพดาน = ROSTER_RULE_DEFAULTS (มติ Q9 — ค่าจากแบบหน้าจอ 03 · ยังไม่ใช่คำตอบเจ้าของ/ที่ปรึกษา HQ23 · หนี้ D3: ย้ายไปตั้งค่าร้าน/HrLawTable ภายหลัง)
//   • ชั่วโมงต่อวัน = Σ นาทีที่ได้ค่าแรง (paidMinutes = ความยาวกะ − พัก) ของกะที่ **เริ่ม** ในวันนั้นตามปฏิทินไทย (กะดึกนับในวันที่เริ่ม)
//   • พักระหว่างกะ = ช่องว่างระหว่างกะที่ติดกันของคนเดียวกัน (เรียงตามเวลาเริ่ม) · ข้ามสัปดาห์/ข้ามช่วงได้ · ติดลบ = กะซ้อน (ไม่นับเป็นพักน้อย)
//   • สัปดาห์ = จันทร์ 00:00 – อาทิตย์ 24:00 เวลาไทย · วันหยุด = วันที่ไม่มีกะใด "เริ่ม" (หางกะดึกไม่กินวันถัดไป)
//   • INFO (HOLIDAY_WORK · ON_LEAVE) ต้องรู้วันหยุด/ใบลา ⇒ roster.ts เป็นคนสร้าง — ที่นี่มีแค่ป้ายข้อความ
// ป้ายข้อความคงที่ ไม่มีชื่อคน ◂
import { addDays, bkkMidnight, paidMinutes, shiftWindow } from "./time-rules";

/** แถวที่ใช้ตรวจ (ตัดมาจาก HrRosterEntry — date = วันที่กะเริ่ม "YYYY-MM-DD") */
export type RosterRuleEntry = {
  id: string;
  employeeId: string;
  date: string;
  startMin: number;
  endMin: number;
  breakMin: number;
  crossesMidnight: boolean;
};

export type RosterLimits = { maxDayMin: number; minRestMin: number; minDaysOffPerWeek: number; maxWeekMin: number };

/** ค่าปริยาย (มติ Q9 a): 10 ชม./วัน · พัก ≥ 11 ชม. · หยุด ≥ 1 วัน/สัปดาห์ · ≤ 48 ชม./สัปดาห์ */
export const ROSTER_RULE_DEFAULTS: Readonly<RosterLimits> = Object.freeze({ maxDayMin: 600, minRestMin: 660, minDaysOffPerWeek: 1, maxWeekMin: 2880 });

export type RosterRule = "MAX_DAY" | "REST" | "OVERLAP" | "DAY_OFF" | "MAX_WEEK" | "HOLIDAY_WORK" | "ON_LEAVE";

/** ป้ายไทยของแต่ละกติกา (คงที่ทุกไบต์) */
export const ROSTER_RULE_TEXT: Readonly<Record<RosterRule, string>> = Object.freeze({
  MAX_DAY: "ชั่วโมงต่อวันเกินกำหนด",
  REST: "พักระหว่างกะน้อยกว่ากำหนด",
  OVERLAP: "กะซ้อนกัน",
  DAY_OFF: "ไม่มีวันหยุดในสัปดาห์",
  MAX_WEEK: "ชั่วโมงต่อสัปดาห์เกินกำหนด",
  HOLIDAY_WORK: "ทำงานวันหยุด — คิดค่าจ้างวันหยุด",
  ON_LEAVE: "ลาอนุมัติแล้วในวันนี้",
});

/** คำเตือน 1 แถว — day (กติการายวัน) หรือ weekStart (กติการายสัปดาห์ = วันจันทร์) */
export type RosterWarning = {
  rule: RosterRule;
  employeeId: string;
  day?: string;
  weekStart?: string;
  valueMin?: number;
  limitMin?: number;
  entryIds: string[];
};

const DAY_MS = 86_400_000;
const MIN_MS = 60_000;
const BKK_OFFSET_MS = 7 * 3_600_000;

/** วันในสัปดาห์ตามปฏิทินไทย (0 = อาทิตย์ … 6 = เสาร์) ของวัน "YYYY-MM-DD" */
export function weekdayOfDay(day: string): number {
  return new Date(bkkMidnight(day).getTime() + BKK_OFFSET_MS).getUTCDay();
}

/** วันจันทร์ของสัปดาห์ (จันทร์–อาทิตย์ เวลาไทย) ที่มีวันนี้อยู่ */
export function weekStartOf(day: string): string {
  return addDays(day, -((weekdayOfDay(day) + 6) % 7));
}

/** จำนวนวันตามปฏิทินระหว่างสองวัน (to − from) */
export function daysBetween(from: string, to: string): number {
  return Math.round((bkkMidnight(to).getTime() - bkkMidnight(from).getTime()) / DAY_MS);
}

type Timed = RosterRuleEntry & { start: number; end: number; paid: number };

function timed(e: RosterRuleEntry): Timed | null {
  try {
    const t = { startMin: e.startMin, endMin: e.endMin, crossesMidnight: e.crossesMidnight };
    const w = shiftWindow(e.date, t);
    return { ...e, start: w.start.getTime(), end: w.end.getTime(), paid: paidMinutes({ ...t, breakMin: e.breakMin }) };
  } catch {
    return null; // แถวเวลาเสีย (ไม่ควรเกิด — ตรวจตอนเขียนแล้ว) ⇒ ไม่นำมาตรวจ
  }
}

const sortIds = (xs: { id: string }[]) => xs.map((x) => x.id).sort();

/**
 * คำเตือนของชุดแถว (ทุกคนในชุด · ทุกสัปดาห์ที่มีแถว) — ผู้เรียกตัดช่วง/ขอบเขตเอง
 * ลำดับผล: ตามพนักงาน แล้วตามวัน (คงที่ — ทดสอบซ้ำได้)
 */
export function rosterWarnings(entries: readonly RosterRuleEntry[], limits: Readonly<RosterLimits> = ROSTER_RULE_DEFAULTS): RosterWarning[] {
  const L = { ...ROSTER_RULE_DEFAULTS, ...(limits ?? {}) };
  const byEmp = new Map<string, Timed[]>();
  for (const e of entries ?? []) {
    const t = e ? timed(e) : null;
    if (!t) continue;
    const list = byEmp.get(t.employeeId) ?? [];
    list.push(t);
    byEmp.set(t.employeeId, list);
  }
  const out: RosterWarning[] = [];
  for (const emp of [...byEmp.keys()].sort()) {
    const list = byEmp.get(emp)!.sort((a, b) => a.start - b.start || a.end - b.end || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    // ── รายวัน: ชั่วโมงรวมของกะที่เริ่มวันนั้น ──
    const byDay = new Map<string, Timed[]>();
    for (const t of list) byDay.set(t.date, [...(byDay.get(t.date) ?? []), t]);
    for (const day of [...byDay.keys()].sort()) {
      const xs = byDay.get(day)!;
      const sum = xs.reduce((s, x) => s + x.paid, 0);
      if (sum > L.maxDayMin) out.push({ rule: "MAX_DAY", employeeId: emp, day, valueMin: sum, limitMin: L.maxDayMin, entryIds: sortIds(xs) });
    }
    // ── คู่กะที่ติดกัน: พักน้อย / ซ้อน ──
    for (let i = 1; i < list.length; i++) {
      const a = list[i - 1]!;
      const b = list[i]!;
      const gap = Math.floor((b.start - a.end) / MIN_MS);
      if (gap < 0) {
        const ov = Math.floor((Math.min(a.end, b.end) - b.start) / MIN_MS);
        out.push({ rule: "OVERLAP", employeeId: emp, day: b.date, valueMin: ov, entryIds: sortIds([a, b]) });
      } else if (gap < L.minRestMin) {
        out.push({ rule: "REST", employeeId: emp, day: b.date, valueMin: gap, limitMin: L.minRestMin, entryIds: sortIds([a, b]) });
      }
    }
    // ── รายสัปดาห์ (จันทร์–อาทิตย์ เวลาไทย) ──
    const byWeek = new Map<string, Timed[]>();
    for (const t of list) {
      const w = weekStartOf(t.date);
      byWeek.set(w, [...(byWeek.get(w) ?? []), t]);
    }
    for (const w of [...byWeek.keys()].sort()) {
      const xs = byWeek.get(w)!;
      const worked = new Set(xs.map((x) => x.date)).size;
      if (7 - worked < L.minDaysOffPerWeek) out.push({ rule: "DAY_OFF", employeeId: emp, weekStart: w, entryIds: sortIds(xs) }); // นับเป็นวัน ไม่ใช่นาที ⇒ ไม่มี valueMin
      const sum = xs.reduce((s, x) => s + x.paid, 0);
      if (sum > L.maxWeekMin) out.push({ rule: "MAX_WEEK", employeeId: emp, weekStart: w, valueMin: sum, limitMin: L.maxWeekMin, entryIds: sortIds(xs) });
    }
  }
  return out;
}
// ◂ HR H2.1
