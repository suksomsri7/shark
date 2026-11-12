// HR H2.4 ▸ กติกาการลงเวลา v2 แบบฟังก์ชันล้วน (ไม่แตะ DB · ไม่อ่านนาฬิกา — ผู้เรียกส่งเวลา `now`/`at` มาเอง)
//
// ทำไมแยกไฟล์: "รอบการทำงาน" (session) ของกะข้ามเที่ยงคืนไม่ใช่วันตามปฏิทิน (D13b) — ทั้ง clock() · nextClockKind · myClockState ·
//   ตัดสินผล (H2.5) ต้องใช้สูตรเดียวกัน · ข้อสอบ qc-hr-h2.4 S1 เรียกไฟล์นี้ตรง ๆ
// ค่าใน CLOCK_RULES = ค่าตั้งต้น · สองค่าแรก (ปิดรอบหลังเลิกกะ · เข้าก่อนเวลาได้) ร้านแก้ได้ที่หน้าตั้งค่า (มติผู้คุม Q1 —
//   ทุกนโยบายของร้านเป็นค่าตั้ง) · ช่วงที่ยอมให้ตั้ง = CLOCK_POLICY_RANGE ◂
import { bkkDayKey, type Window } from "./time-rules";

export const CLOCK_RULES = {
  /** เข้างานก่อนเวลาเริ่มกะได้กี่นาที แล้วยังผูกกับกะนั้น (ค่าตั้งต้น — ค่าตั้งของร้าน: earlyInMin) */
  EARLY_IN_MIN: 120,
  /** รอบที่ยังไม่ออกงาน ปิดเองเมื่อเลยเวลาเลิกกะไปกี่นาที (ค่าตั้งต้น — ค่าตั้งของร้าน: closeGraceMin) */
  CLOSE_GRACE_MIN: 240,
  /** เก็บพิกัด (lat/lng/accuracyM) กี่วัน (HQ27) */
  GEO_KEEP_DAYS: 30,
  /** เก็บรูปตอนลงเวลา (photoKey) กี่วัน (HQ27) */
  PHOTO_KEEP_DAYS: 90,
} as const;

/** ช่วงค่าที่ร้านตั้งได้ (นาที · รวมปลายทั้งสองข้าง) */
export const CLOCK_POLICY_RANGE = {
  earlyInMin: { min: 0, max: 240 },
  closeGraceMin: { min: 30, max: 720 },
} as const;
export type ClockPolicy = { earlyInMin: number; closeGraceMin: number };
export const CLOCK_POLICY_DEFAULT: ClockPolicy = { earlyInMin: CLOCK_RULES.EARLY_IN_MIN, closeGraceMin: CLOCK_RULES.CLOSE_GRACE_MIN };

const inRange = (v: unknown, r: { min: number; max: number }): v is number => typeof v === "number" && Number.isInteger(v) && v >= r.min && v <= r.max;
/** ค่าตั้งที่เก็บไว้ (JSON) → นโยบายที่ใช้จริง — ค่าหาย/ผิดช่วง = ค่าตั้งต้น (ไม่ throw: ลงเวลาต้องไม่ล้มเพราะค่าตั้งเสีย) */
export function clockPolicyOf(raw: unknown): ClockPolicy {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    earlyInMin: inRange(o.earlyInMin, CLOCK_POLICY_RANGE.earlyInMin) ? o.earlyInMin : CLOCK_POLICY_DEFAULT.earlyInMin,
    closeGraceMin: inRange(o.closeGraceMin, CLOCK_POLICY_RANGE.closeGraceMin) ? o.closeGraceMin : CLOCK_POLICY_DEFAULT.closeGraceMin,
  };
}

// ── ระยะทาง ──
const EARTH_R_M = 6_371_008.8;
const rad = (d: number) => (d * Math.PI) / 180;
/** ระยะทางผิวโลก (haversine) เป็นเมตรจำนวนเต็ม — ปัดครึ่งขึ้น */
export function distanceM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  const d = 2 * EARTH_R_M * Math.asin(Math.min(1, Math.sqrt(h)));
  return Math.floor(d + 0.5);
}

// ── เลือกกะที่ผูกตอนเข้างาน (R4) ──
export type RosterCandidate = { id: string; start: Date; end: Date };
/**
 * กะที่การเข้างาน ณ `at` ผูกด้วย: ช่วงที่ start − earlyMin ≤ at < end · หลายช่วง ⇒ เริ่มใกล้ `at` ที่สุด ·
 * ระยะเท่ากัน ⇒ ช่วงที่เริ่มไปแล้ว (at ≥ start) · ยังเท่า ⇒ id น้อยกว่า · ไม่มี = null
 * kind อื่นที่ไม่ใช่ IN ⇒ null (ออกงาน/พัก ไม่เลือกกะใหม่ — สืบจากเข้างานของรอบ)
 */
export function pickRosterEntry<T extends RosterCandidate>(kind: string, at: Date, cands: readonly T[], opts: { earlyMin?: number } = {}): T | null {
  if (kind !== "IN" || !(at instanceof Date) || !Number.isFinite(at.getTime())) return null;
  const early = (typeof opts.earlyMin === "number" && opts.earlyMin >= 0 ? opts.earlyMin : CLOCK_RULES.EARLY_IN_MIN) * 60_000;
  const t = at.getTime();
  let best: { c: T; dist: number; started: boolean } | null = null;
  for (const c of cands ?? []) {
    const s = c?.start?.getTime?.();
    const e = c?.end?.getTime?.();
    if (!Number.isFinite(s) || !Number.isFinite(e)) continue;
    if (t < s - early || t >= e) continue;
    const dist = Math.abs(t - s);
    const started = t >= s;
    if (!best || dist < best.dist || (dist === best.dist && started && !best.started) || (dist === best.dist && started === best.started && c.id < best.c.id)) {
      best = { c, dist, started };
    }
  }
  return best ? best.c : null;
}

// ── รอบการทำงาน (R3) ──
export type ClockSessionState = "CLOSED" | "OPEN" | "ON_BREAK";
export type LastClock = { kind: string; at: Date; rosterEntryId?: string | null };
/**
 * สถานะรอบจากแถวล่าสุดของพนักงาน: IN/BREAK_END ⇒ OPEN · BREAK_START ⇒ ON_BREAK · OUT/ไม่มี ⇒ CLOSED
 * รอบที่ยังเปิดหมดอายุ (⇒ CLOSED): ผูกกะ (มี lastWindow) ⇒ เมื่อ now ≥ เลิกกะ + closeGraceMin ·
 *   ไม่ผูกกะ ⇒ กติกาเดิม: เปิดอยู่เฉพาะเมื่อแถวล่าสุดอยู่ในวันไทยเดียวกับ now (คนที่ไม่มีตารางกะ — Q3)
 */
export function sessionState(last: LastClock | null, lastWindow: Window | null, now: Date, opts: { closeGraceMin?: number } = {}): ClockSessionState {
  if (!last || !(last.at instanceof Date)) return "CLOSED";
  const open: ClockSessionState | null = last.kind === "IN" || last.kind === "BREAK_END" ? "OPEN" : last.kind === "BREAK_START" ? "ON_BREAK" : null;
  if (!open) return "CLOSED";
  if (last.rosterEntryId && lastWindow) {
    const grace = (typeof opts.closeGraceMin === "number" && opts.closeGraceMin >= 0 ? opts.closeGraceMin : CLOCK_RULES.CLOSE_GRACE_MIN) * 60_000;
    return now.getTime() >= lastWindow.end.getTime() + grace ? "CLOSED" : open;
  }
  return bkkDayKey(last.at) === bkkDayKey(now) && last.at.getTime() <= now.getTime() ? open : "CLOSED";
}
/** ครั้งถัดไปของปุ่มเดียว (NEXT): ปิด ⇒ เข้า · เปิด ⇒ ออก · พักอยู่ ⇒ กลับจากพัก (NEXT ไม่เริ่มพักเอง) */
export function nextKindOf(state: ClockSessionState): "IN" | "OUT" | "BREAK_END" {
  return state === "OPEN" ? "OUT" : state === "ON_BREAK" ? "BREAK_END" : "IN";
}

// ── เที่ยงคืนรูปเดียว (R14) ──
/** กะเลิกเที่ยงคืนพอดีเก็บรูปเดียว: endMin 1440 · ไม่ข้ามเที่ยงคืน (0/true ⇒ 1440/false) · อย่างอื่นคืนค่าเดิม */
export function normalizeShiftTimes<T extends { startMin: number; endMin: number; crossesMidnight: boolean }>(t: T): T {
  if (t && t.endMin === 0 && t.crossesMidnight === true) return { ...t, endMin: 1440, crossesMidnight: false };
  return { ...t };
}

// ── นาทีทำงานหักพัก (ตัวใหม่ — rules.workedMinutes ยัง FREEZE) ──
/** IN เริ่มนับ · BREAK_START หยุด · BREAK_END นับต่อ · OUT จบ (ออกระหว่างพัก = พักจบตอนออก ไม่นับช่วงพัก) */
export function workedMinutesWithBreaks(events: readonly { kind: string; at: Date }[]): number {
  const sorted = [...(events ?? [])].filter((e) => e?.at instanceof Date).sort((a, b) => a.at.getTime() - b.at.getTime());
  let total = 0;
  let from: number | null = null;
  let inSession = false;
  for (const e of sorted) {
    const t = e.at.getTime();
    if (e.kind === "IN") {
      inSession = true;
      from = t;
    } else if (e.kind === "BREAK_START") {
      if (from !== null) total += t - from;
      from = null;
    } else if (e.kind === "BREAK_END") {
      if (inSession) from = t;
    } else if (e.kind === "OUT") {
      if (from !== null) total += t - from;
      from = null;
      inSession = false;
    }
  }
  return Math.round(total / 60_000);
}
