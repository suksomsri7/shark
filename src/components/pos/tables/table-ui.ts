// table-ui.ts — POS P2.4U ตัวช่วยบริสุทธิ์ของจอโต๊ะ (client-safe · ไม่แตะ DB/เซิร์ฟเวอร์ · ไม่มีข้อความไทย)
//   เวลา: นาทีจาก openedAt เทียบ serverTime + เวลาที่ผ่านไปบนเครื่อง (ไม่เชื่อนาฬิกาเครื่องตรง ๆ) · ข้อความเวลา HH:MM ตามเขตเวลาไทยเสมอ
//   🔴 จอห้ามวาดข้อความเวลา/นาทีก่อน mount (HF-418) — ผู้เรียกเช็ค `mounted` เอง ฟังก์ชันที่นี่ไม่รู้เรื่อง render
//   เงิน: ไม่มีการคิดเงินที่นี่ — ยอดทั้งหมดมาจาก registerTablesAction / quoteRegisterCartAction (มติ "money never computed in the UI")

import type { TableCard, TableState } from "@/lib/modules/pos/table-shared";
import type { RegisterCart } from "@/lib/modules/pos/register-shared";

const MINUTE_MS = 60_000;

/** นาฬิกาของจอ = เวลาเซิร์ฟเวอร์ตอนดึงผัง + เวลาที่ผ่านไปบนเครื่องนับจากตอนได้คำตอบ (performance ไม่ใช้เพราะต้องข้ามการพักแท็บ) */
export type FloorClock = { serverMs: number; localMs: number };
export const clockNow = (c: FloorClock | null, localNowMs: number): number => (c ? c.serverMs + Math.max(0, localNowMs - c.localMs) : localNowMs);

/** นาทีเต็มตั้งแต่ iso ถึง nowMs (ไม่ติดลบ) · iso ไม่ถูกต้อง = 0 */
export function minutesSince(iso: string | null | undefined, nowMs: number): number {
  const at = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(at)) return 0;
  return Math.max(0, Math.floor((nowMs - at) / MINUTE_MS));
}

/** HH:MM ของเวลาไทย (ไม่ขึ้นกับเขตเวลาเครื่อง) */
export function bkkClock(iso: string | null | undefined): string {
  const at = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(at)) return "";
  const d = new Date(at + 7 * 3_600_000);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

/** ISO ของ "วันนี้ HH:MM เวลาไทย" ถัดจาก nowMs (สำหรับค่าเริ่มของฟอร์มจอง) */
export function bkkDateTimeLocal(ms: number): string {
  const d = new Date(ms + 7 * 3_600_000);
  return d.toISOString().slice(0, 16);
}
/** ค่า datetime-local (ถือเป็นเวลาไทย) → ISO UTC · ผิดรูป = null */
export function bkkLocalToIso(v: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v)) return null;
  const ms = Date.parse(`${v}:00+07:00`);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

/** ลำดับแสดงของสถานะในแถบคำอธิบาย (ภาพ 03 ล่าง) */
export const LEGEND_STATES: readonly TableState[] = ["FREE", "DINING", "BILL_REQUESTED", "NEEDS_CLEARING", "RESERVED"];

/** การ์ดที่มีโต๊ะเปิดอยู่ (มี session) */
export const isSeated = (c: TableCard): boolean => !!c.sessionId;

/** คีย์บิลของการเช็คบิลโต๊ะ 1 ครั้ง (จอโต๊ะเป็นเจ้าของวงจรคีย์ของตัวเอง · หมุนหลังบิลจบ/เริ่มบิลใหม่เท่านั้น) */
export function newCheckoutKey(): string {
  try {
    return `tbl-${crypto.randomUUID()}`;
  } catch {
    return `tbl-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
  }
}

/** สิ่งที่รอบร่างของโต๊ะเก็บไม่ได้ (มติ 6): ส่วนลด · สมาชิก · คูปอง · ช่องทาง · สินค้าชั่ง · หมายเหตุบิล */
export type CartStrip = { discount: boolean; member: boolean; coupon: boolean; channel: boolean; weighed: number; note: boolean };
export function cartStripOf(c: RegisterCart): CartStrip {
  return {
    discount: !!c.billDiscount || c.lines.some((l) => !!l.discount),
    member: !!c.memberId,
    coupon: !!c.couponCode,
    channel: !!c.channelId,
    weighed: c.lines.filter((l) => l.kind === "product" && (l.weighedBarcode !== undefined || l.weightGrams !== undefined)).length,
    note: !!c.note,
  };
}
export const stripNeeded = (s: CartStrip): boolean => s.discount || s.member || s.coupon || s.channel || s.weighed > 0 || s.note;
/** ตะกร้าที่ตัดของที่รอบร่างเก็บไม่ได้ออกแล้ว (บรรทัดชั่งออก · ส่วนลดบรรทัดออก · ระดับบิลออก) */
export function stripCart(c: RegisterCart): RegisterCart {
  const lines = c.lines
    .filter((l) => !(l.kind === "product" && (l.weighedBarcode !== undefined || l.weightGrams !== undefined)))
    .map((l) => {
      if (!l.discount) return l;
      const { discount: _d, ...rest } = l;
      void _d;
      return rest as typeof l;
    });
  return { lines };
}
