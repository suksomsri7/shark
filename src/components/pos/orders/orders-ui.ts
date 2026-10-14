// orders-ui.ts — POS P2.8U ตัวช่วยบริสุทธิ์ของจอออเดอร์ทุกช่องทาง (client-safe · ไม่แตะ DB/เซิร์ฟเวอร์ · ไม่มีข้อความไทย)
//   เวลา: นาฬิกาของจอ = เวลาเซิร์ฟเวอร์ (`at` ของ listOrders) + เวลาที่ผ่านไปบนเครื่อง (clockNow ของจอโต๊ะ) · ตัวนับถอยหลังเดินฝั่ง client จาก timestamp ของเซิร์ฟเวอร์เท่านั้น
//   🔴 จอห้ามวาดข้อความเวลา/ตัวนับก่อน mount (HF-418) — ผู้เรียกเช็ค `mounted` เอง
//   🔴 ไม่มีการคิดเงินที่นี่ — ยอด/ค่าคอมฯ/รับจริง มาจาก OrderCard / OrderDetail / quote ของเซิร์ฟเวอร์ (มติ "money never computed in the UI")

import { orderColumnOf, type OrderCard, type OrderColumn } from "@/lib/modules/pos/order-shared";

export { bkkClock, clockNow, type FloorClock } from "@/components/pos/tables/table-ui";

/** เวลาเตรียมมาตรฐานที่เลือกได้ในรางซ้าย (มติ 2) */
export const PREP_CHOICES = [10, 15, 20, 30, 45, 60] as const;
/** ปิดรับชั่วคราว (มติ 2): นาที · null = จนกว่าจะเปิดเอง (เซิร์ฟเวอร์รับได้ไม่เกิน 24 ชม. ⇒ ส่ง now + 24 ชม. แทน) */
export const PAUSE_CHOICES = [15, 30, 60, null] as const;
export const PAUSE_UNTIL_REOPEN_MS = 24 * 3_600_000 - 60_000;
/** ดึงซ้ำทุก 10 วิ ขณะเห็นจอ (มติ 1/3) */
export const ORDERS_POLL_MS = 10_000;
/** ตัวนับเดินทุก 1 วิ (การ์ดใหม่ "รับภายใน m:ss") */
export const ORDERS_TICK_MS = 1_000;
/** เตือนสีแดงเมื่อเหลือน้อยกว่า 60 วิ (มติ 4) */
export const ORDERS_ACCEPT_RED_SEC = 60;
/** ค่าตั้งเสียงเตือนต่อเครื่อง (localStorage · ปริยาย = ปิด · มติ 3) */
export const ORDERS_SOUND_KEY = "shark.pos.orders.sound";

/** วินาที → "m:ss" */
export function mmss(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** วินาทีที่เหลือในหน้าต่างรับ (เดินจาก acceptBy ของเซิร์ฟเวอร์) — null = ไม่ใช่ NEW */
export function acceptLeftSec(card: Pick<OrderCard, "status" | "acceptBy">, nowMs: number): number | null {
  if (card.status !== "NEW") return null;
  const by = Date.parse(card.acceptBy);
  if (!Number.isFinite(by)) return null;
  const left = by - nowMs;
  return left <= 0 ? 0 : Math.ceil(left / 1000);
}

/** นาทีที่เหลือ / เลยกำหนดเตรียม (เดินจาก prepDueAt ของเซิร์ฟเวอร์) — ไม่มีกำหนด = null */
export function prepState(card: Pick<OrderCard, "prepDueAt" | "status">, nowMs: number): { late: boolean; minutes: number } | null {
  if (!card.prepDueAt || (card.status !== "ACCEPTED" && card.status !== "PREPARING")) return null;
  const due = Date.parse(card.prepDueAt);
  if (!Number.isFinite(due)) return null;
  if (nowMs <= due) return { late: false, minutes: Math.max(0, Math.ceil((due - nowMs) / 60_000)) };
  return { late: true, minutes: Math.max(1, Math.floor((nowMs - due) / 60_000)) };
}

/** การ์ดตามคอลัมน์ (ลำดับ: ใหม่/กำลังเตรียม/พร้อม = เก่าก่อน · เสร็จ = ใหม่ก่อน) */
export function cardsByColumn(cards: readonly OrderCard[]): Record<OrderColumn, OrderCard[]> {
  const out: Record<OrderColumn, OrderCard[]> = { new: [], preparing: [], ready: [], done: [] };
  for (const c of cards) {
    const col = orderColumnOf(c.status);
    if (col) out[col].push(c);
  }
  const at = (c: OrderCard) => Date.parse(c.receivedAt) || 0;
  out.new.sort((a, b) => at(a) - at(b));
  out.preparing.sort((a, b) => at(a) - at(b));
  out.ready.sort((a, b) => at(a) - at(b));
  out.done.sort((a, b) => (Date.parse(b.handedAt ?? b.receivedAt) || 0) - (Date.parse(a.handedAt ?? a.receivedAt) || 0));
  return out;
}

/** วินาทีที่น้อยที่สุดของคอลัมน์ใหม่ (หัวคอลัมน์ "ต้องรับใน m:ss") — ไม่มีการ์ด = null */
export function minAcceptLeft(cards: readonly OrderCard[], nowMs: number): number | null {
  let best: number | null = null;
  for (const c of cards) {
    const s = acceptLeftSec(c, nowMs);
    if (s !== null && (best === null || s < best)) best = s;
  }
  return best;
}

/** คีย์กันซ้ำของคำขอ (รับเงิน 1 คีย์ต่อการเปิดกล่อง · คีย์ออเดอร์ 1 คีย์ต่อการเปิดแผ่น — มติ 5/6 · มติ S 12) */
export function newOrderKey(prefix: string): string {
  let r: string;
  try {
    r = crypto.randomUUID();
  } catch {
    r = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
  }
  return `${prefix}-${r}`.replace(/[^A-Za-z0-9_.:-]/g, "").slice(0, 120);
}

/** วันที่ไทย YYYY-MM-DD ของ iso (ลิงก์ "ดูบิล" → หน้าบิลวันนั้น) */
export function bkkDate(iso: string | null | undefined): string | null {
  const at = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(at)) return null;
  return new Date(at + 7 * 3_600_000).toISOString().slice(0, 10);
}

/** ค่าตั้งเสียงเตือน (อ่าน/เขียนพังได้ — private mode ⇒ ปิด) */
export function readSoundPref(): boolean {
  try {
    return window.localStorage.getItem(ORDERS_SOUND_KEY) === "1";
  } catch {
    return false;
  }
}
export function writeSoundPref(on: boolean): void {
  try {
    window.localStorage.setItem(ORDERS_SOUND_KEY, on ? "1" : "0");
  } catch {
    /* เก็บไม่ได้ = ใช้ได้เฉพาะรอบนี้ */
  }
}

/** เสียงเตือนสั้น 2 จังหวะ (WebAudio · ไม่มีไฟล์เสียง) — เบราว์เซอร์บล็อก = เงียบ */
export function beep(): void {
  try {
    const W = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
    const Ctx = W.AudioContext ?? W.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const tone = (at: number, hz: number) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = hz;
      o.type = "sine";
      g.gain.setValueAtTime(0.0001, ctx.currentTime + at);
      g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + at + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + at + 0.22);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + at);
      o.stop(ctx.currentTime + at + 0.25);
    };
    tone(0, 880);
    tone(0.28, 1175);
    setTimeout(() => void ctx.close().catch(() => undefined), 900);
  } catch {
    /* เงียบ */
  }
}

/** แถวช่องทางของรางซ้าย (ordersChannelsAction · ChannelItem + ค่าตั้งรับออเดอร์ของ P2.8) — ชนิดเท่านั้น ไม่ import ตัว action ตอนรัน */
export type OrdersChannel = Extract<Awaited<ReturnType<typeof import("@/lib/modules/pos/order-ui-actions").ordersChannelsAction>>, { ok: true }>["items"][number];
