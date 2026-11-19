// travel-rules.ts — สำเนาฝั่งแอปของ src/lib/modules/calendar/travel.ts (Q8 · สัญญา §16.3) — บริสุทธิ์ล้วน · ต่างแค่ sha1 (JS แทน node:crypto)
//   ตรวจด้วยส่วนบริสุทธิ์ของ scripts/qc-cal-1.10.mts ชี้มาไฟล์นี้ (ดู CAL-RESUME) — แก้ฝั่งเซิร์ฟเวอร์ = แก้ไฟล์นี้ด้วย
// (หัวไฟล์ต้นฉบับ) travel.ts — Q8 เผื่อเวลาเดินทาง (สัญญา §16.3) — **บริสุทธิ์ล้วน** (ไม่แตะฐาน · ไม่อ่านนาฬิกาเอง)
//   เลขา "ถาม" เมื่อยังไม่รู้ประเภท · "เสนอ" เมื่อจำได้แล้ว — ไม่สร้างอะไรเอง (การยืนยันอยู่ที่ route confirm เท่านั้น)
//   แอปมีสำเนาสำหรับนัดในเครื่อง (device) — แก้กติกาที่นี่ = แก้สำเนาฝั่งแอปด้วย (แบบ conflicts.ts)
import type { AgendaItem, AgendaSource } from "@/src/api/calendar";
import { sha1Hex } from "./cal-conflicts";

const MIN_MS = 60_000;
const BKK_OFFSET_MS = 7 * 3_600_000;
const DAY_MS = 86_400_000;
export const TRAVEL_SOURCES: readonly AgendaSource[] = ["event", "booking", "crm", "google", "device"];
/** ห่างกันเกินนี้ (นาที) = ไม่ถือว่า "ใกล้นัดอื่น" */
export const TRAVEL_MAX_GAP_MIN = 120;
export const TRAVEL_MAX_MIN = 240;
export const TRAVEL_OPTIONS: readonly number[] = [0, 15, 30, 45];

export type TravelRule = { typeKey: string; minutes: number; label?: string | null };
export type TravelSuggestion = {
  pairKey: string;
  mode: "ask" | "propose";
  prevId: string;
  nextId: string;
  typeKey: string;
  typeLabel: string;
  prevEndAt: string;
  nextStartAt: string;
  gapMinutes: number;
  minutes: number | null;
  leaveAt: string | null;
  title: string;
  sub: string;
  badge: string | null;
  options: number[];
};
/** ข้อมูลปฏิทินของแถว google/device (id ของ AgendaItem → ปฏิทิน) — ผู้เรียกเติม (เซิร์ฟเวอร์จาก CalExternalEvent · แอปจาก expo-calendar) */
export type CalendarOf = Record<string, { calendarId: string; name: string }>;

const hm = (ms: number) => {
  const t = new Date(ms + BKK_OFFSET_MS);
  return `${String(t.getUTCHours()).padStart(2, "0")}:${String(t.getUTCMinutes()).padStart(2, "0")}`;
};
const bkkDay = (ms: number) => Math.floor((ms + BKK_OFFSET_MS) / DAY_MS);

export const travelPairKey = (prevId: string, nextId: string) => sha1Hex(`travel|${prevId}|${nextId}`);

/** ประเภท + ป้ายไทยของแถว (§16.2) · ไม่ใช่นัดที่ต้องเดินทาง = null */
export function travelTypeOf(item: AgendaItem, cal: CalendarOf = {}): { typeKey: string; typeLabel: string; sub: string | null } | null {
  switch (item.source) {
    case "event":
      return { typeKey: "event", typeLabel: "นัดส่วนตัวนอกร้าน", sub: null };
    case "booking":
      return { typeKey: "booking", typeLabel: "นัดลูกค้า · บัตรคิว", sub: "นัดในร้าน" };
    case "crm":
      return { typeKey: "crm", typeLabel: "นัดลูกค้า · CRM", sub: null };
    case "google":
    case "device": {
      const c = cal[item.id];
      if (!c) return null;
      return { typeKey: `${item.source}:${c.calendarId}`, typeLabel: `นัดจาก ${item.source === "google" ? "Google" : "iPhone"} · ${c.name || "ปฏิทิน"}`, sub: null };
    }
    default:
      return null;
  }
}

/** ป้ายของ typeKey ที่จำไว้ (จอตั้งค่า q8-3) — google/device ใช้ label ที่บันทึกตอนจำ */
export function travelTypeLabel(typeKey: string, stored?: string | null): { label: string; sub: string | null } {
  if (typeKey === "event") return { label: "นัดส่วนตัวนอกร้าน", sub: null };
  if (typeKey === "booking") return { label: "นัดลูกค้า · บัตรคิว", sub: "นัดในร้าน" };
  if (typeKey === "crm") return { label: "นัดลูกค้า · CRM", sub: null };
  if (stored) return { label: stored, sub: null };
  if (typeKey.startsWith("google:")) return { label: "นัดจาก Google", sub: null };
  if (typeKey.startsWith("device:")) return { label: "นัดจาก iPhone", sub: null };
  return { label: typeKey, sub: null };
}

/** typeKey ที่ยอมรับ (PUT rules) */
export const isTravelTypeKey = (k: string) => k.length <= 200 && /^(event|booking|crm|(google|device):[^\s]{1,190})$/.test(k);

type Span = { it: AgendaItem; s: number; e: number };

/**
 * ข้อเสนอเผื่อเวลาเดินทางของรายการ (§16.3)
 *   dismissed = pairKey ที่ผู้ใช้ข้ามแล้ว (route confirm ส่ง [] เพื่อหาคู่ที่ปัดไปแล้วด้วยก็ได้)
 */
export function travelSuggestions(
  items: AgendaItem[],
  rules: TravelRule[],
  dismissed: Iterable<string>,
  now: Date,
  opts: { calendarOf?: CalendarOf } = {},
): TravelSuggestion[] {
  const cal = opts.calendarOf ?? {};
  const ruleOf = new Map(rules.map((r) => [r.typeKey, r]));
  const skip = new Set(dismissed);
  const sp: Span[] = [];
  for (const it of items) {
    if (!it.mine || it.allDay || it.done || !TRAVEL_SOURCES.includes(it.source)) continue;
    const s = Date.parse(it.startAt);
    const e0 = it.endAt ? Date.parse(it.endAt) : s;
    if (!Number.isFinite(s) || !Number.isFinite(e0)) continue;
    sp.push({ it, s, e: Math.max(s, e0) });
  }
  sp.sort((a, b) => a.s - b.s || (a.it.id < b.it.id ? -1 : a.it.id > b.it.id ? 1 : 0));
  const out: TravelSuggestion[] = [];
  for (let i = 0; i + 1 < sp.length; i++) {
    const p = sp[i]!, n = sp[i + 1]!;
    if (bkkDay(p.s) !== bkkDay(n.s)) continue;
    const gap = n.s - p.e;
    if (gap < 0 || gap > TRAVEL_MAX_GAP_MIN * MIN_MS) continue;
    const type = travelTypeOf(n.it, cal);
    if (!type) continue;
    const pairKey = travelPairKey(p.it.id, n.it.id);
    if (skip.has(pairKey)) continue;
    const rule = ruleOf.get(type.typeKey);
    const base = {
      pairKey,
      prevId: p.it.id,
      nextId: n.it.id,
      typeKey: type.typeKey,
      typeLabel: type.typeLabel,
      prevEndAt: new Date(p.e).toISOString(),
      nextStartAt: new Date(n.s).toISOString(),
      gapMinutes: Math.round(gap / MIN_MS),
      options: [...TRAVEL_OPTIONS],
    };
    if (!rule) {
      if (n.s <= +now) continue;
      out.push({ ...base, mode: "ask", minutes: null, leaveAt: null, title: "ต้องเผื่อเวลาเดินทางไหมครับ?", sub: `นัดก่อนหน้า: ${p.it.title} เลิก ${hm(p.e)} → นัดนี้ ${hm(n.s)}`, badge: null });
      continue;
    }
    if (rule.minutes <= 0) continue;
    const leave = n.s - rule.minutes * MIN_MS;
    if (leave <= +now) continue;
    out.push({
      ...base,
      mode: "propose",
      minutes: rule.minutes,
      leaveAt: new Date(leave).toISOString(),
      title: `⏱ ${type.typeLabel} — คุณเคยเผื่อ ${rule.minutes} นาที`,
      sub: `${n.it.title} ${hm(n.s)} · นัดก่อนหน้าเลิก ${hm(p.e)}\nให้เตือนออกเดินทาง ${hm(leave)} เหมือนเดิมไหมครับ?`,
      badge: "จำจากครั้งก่อน",
    });
  }
  return out.sort((a, b) => a.nextStartAt.localeCompare(b.nextStartAt) || a.pairKey.localeCompare(b.pairKey));
}
