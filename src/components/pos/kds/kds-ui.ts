// kds-ui.ts — POS P2.6U ตัวช่วยบริสุทธิ์ของจอครัว (ภาพ 04 · client-safe · ไม่แตะ DB/เซิร์ฟเวอร์ · ไม่มีข้อความไทย)
//   เวลา: นาฬิกาของจอ = serverNow ของบอร์ด + เวลาที่ผ่านไปบนเครื่อง (clockNow) · ตัวจับเวลาของตั๋วคิดใหม่ทุก 1 วิ ด้วย ticketTimer (kds-shared)
//   🔴 ลำดับตั๋วในคอลัมน์ = ลำดับของเซิร์ฟเวอร์ (sortColumn ฝั่ง kds.ts) — จอห้ามเรียงใหม่ (มติ 4) · ที่นี่แค่ "กรอง" ตามสถานะ
//   🔴 ไม่มีเงินบนจอครัว — ตั๋ว/ใบครัวไม่มีราคา (มติ hard rule) · ข้อความเวลาวาดหลัง mount เท่านั้น (HF-418) — ผู้เรียกเช็คเอง

import { ticketTimer, type KdsBoard, type KdsColumn, type KdsTicket, type KdsTimer } from "@/lib/modules/pos/kds-shared";

export { bkkClock, clockNow, minutesSince, type FloorClock } from "@/components/pos/tables/table-ui";

/** ตัวนับเดินทุก 1 วิ (มติ 5) */
export const KDS_TICK_MS = 1_000;
/** กดค้างเพื่อเปิดเมนูของใบ (มติ 4: long-press / ⋯) */
export const KDS_LONG_PRESS_MS = 550;

/** วินาที → "mm:ss" (สองหลักเสมอ · ภาพ 04 "00:40" "11:05") */
export function mmss2(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

/** ตัวจับเวลาของตั๋ว ณ นาฬิกาของจอ (ไม่รู้เวลา = ค่าจากเซิร์ฟเวอร์ตอนดึง) */
export function timerOf(t: Pick<KdsTicket, "sentAt" | "targetMinutes" | "elapsedSec" | "remainingSec" | "late" | "warn">, nowMs: number | null): KdsTimer {
  const sent = Date.parse(t.sentAt);
  if (nowMs === null || !Number.isFinite(sent)) return { elapsedSec: t.elapsedSec, remainingSec: t.remainingSec, warn: t.warn, late: t.late };
  return ticketTimer({ sentAtMs: sent, targetMinutes: t.targetMinutes, nowMs });
}

/** นาทีที่เลยเป้า (อย่างน้อย 1) / นาทีที่เหลือก่อนเลยเป้า (ปัดขึ้น · อย่างน้อย 1) */
export const lateMinutes = (tm: KdsTimer): number => Math.max(1, Math.floor(-tm.remainingSec / 60));
export const warnMinutes = (tm: KdsTimer): number => Math.max(1, Math.ceil(tm.remainingSec / 60));

/** ตั๋วของคอลัมน์ตามลำดับของเซิร์ฟเวอร์ (กรองอย่างเดียว) */
export function columnTickets(board: Pick<KdsBoard, "tickets"> | null, col: KdsColumn): KdsTicket[] {
  return board ? board.tickets.filter((x) => x.state === col) : [];
}

/** คีย์ของตั๋ว (รอบ × สถานี) */
export const ticketKey = (t: Pick<KdsTicket, "orderId" | "stationId">): string => `${t.orderId}:${t.stationId}`;

/** expo: ตั๋ว READY ของทุกสถานี รวมตามรอบ (ลำดับ = ตั๋วแรกของรอบในลำดับของเซิร์ฟเวอร์) */
export type ExpoGroup = { orderId: string; head: KdsTicket; tickets: KdsTicket[] };
export function expoGroups(board: Pick<KdsBoard, "tickets"> | null): ExpoGroup[] {
  const out: ExpoGroup[] = [];
  const at = new Map<string, ExpoGroup>();
  for (const t of board?.tickets ?? []) {
    if (t.state !== "READY") continue;
    const g = at.get(t.orderId);
    if (g) g.tickets.push(t);
    else {
      const n = { orderId: t.orderId, head: t, tickets: [t] };
      at.set(t.orderId, n);
      out.push(n);
    }
  }
  return out;
}

/** ชื่อสถานีตามภาษาจอ (en ใช้ nameEn เมื่อมี) */
export function stationName(st: { name: string; nameEn: string | null } | undefined, locale: string): string {
  if (!st) return "";
  return locale === "en" && st.nameEn ? st.nameEn : st.name;
}

/** ชื่อช่องทางจาก label ของตั๋วออนไลน์ ("ชื่อช่องทาง · เลขอ้างอิง") */
export function onlineChannelName(t: Pick<KdsTicket, "label" | "channelCode" | "externalRef">): string {
  const ref = t.externalRef ?? "";
  let name = t.label;
  if (ref && name.endsWith(` · ${ref}`)) name = name.slice(0, -(ref.length + 3));
  return name || t.channelCode || "";
}

/** fix1 V7: ชื่อสั้นของพนักงานบนการ์ด (คำแรก ก่อนวงเล็บ/ช่องว่าง · ≤ 12 ตัวอักษร + …) — ภาพ 04 "ต้น" */
export function shortName(name: string | null | undefined): string {
  const first = String(name ?? "").trim().split(/[\s(]+/)[0] ?? "";
  const chars = [...first];
  return chars.length > 12 ? `${chars.slice(0, 12).join("")}\u2026` : first;
}
/** fix1 V1: อักษรย่อของผู้ใช้ — ข้ามสระหน้า (เ แ โ ใ ไ) ไม่ให้เหลือ "เ" ตัวเดียวที่ดูเหมือน "ι" */
export function userInitial(name: string): string {
  // fix2 G3a: ตัวแรกที่เป็นตัวอักษร (\p{L}) และไม่ใช่สระหน้า — ตัวเลข/เครื่องหมาย/อีโมจิไม่เป็นอักษรย่อ
  const ch = [...name.trim()].find((c) => /\p{L}/u.test(c) && !/[\u0E40-\u0E44]/.test(c));
  return (ch ?? "?").toUpperCase();
}

/** ชั่วโมงเวลาไทยของ ms (ตั๋วข้ามเที่ยงคืน — มติ 11) */
export const bkkHour = (ms: number): number => new Date(ms + 7 * 3_600_000).getUTCHours();
/** ช่วงที่แสดงหมายเหตุตั๋วข้ามเที่ยงคืน (00:00–02:59 เวลาไทย) — F5 ไม่อยู่ในสัญญา ⇒ แสดงข้อความเจ้าของแทน */
export const midnightWindow = (ms: number | null): boolean => ms !== null && bkkHour(ms) < 3;
