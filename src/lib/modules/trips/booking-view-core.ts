// ─────────────────────────────────────────────────────────────
// trips/booking-view-core.ts — ตัวช่วยบริสุทธิ์ของจอการจองฝั่งร้าน (ภาพ 18 · RUN TRIPS T1.3a §3)
// 🔴 pure ล้วน: ไม่มี import ค่า (import type เท่านั้น) · ไม่มี I/O · ไม่อ่านนาฬิกา · ไม่สุ่ม — ใช้ได้ทั้งตัวโหลด (server) และคอมโพเนนต์ (client)
// 🔴 ป้ายสถานะ · สถานะเงิน · ยอดค้าง · หน้าต่างวัน ตัดสินที่นี่/ในตัวโหลด — คอมโพเนนต์แสดงอย่างเดียว
// 🔴 เงินเป็นสตางค์จำนวนเต็มเสมอ (ไม่ผ่านทศนิยมลอย)
// ─────────────────────────────────────────────────────────────

// ═══════════════ ค่าคงที่ ═══════════════
export const BOOKING_LIST_WHENS = ["upcoming", "today", "tomorrow", "next7", "past30", "all"] as const;
export type BookingListWhen = (typeof BOOKING_LIST_WHENS)[number];
export const BOOKING_LIST_CHIPS = ["all", "day", "hold", "attention"] as const;
export type BookingListChip = (typeof BOOKING_LIST_CHIPS)[number];
/** ลำดับ = ความสำคัญ (ตัวแรกขึ้นป้าย) */
export const BOOKING_ATTENTION_KINDS = ["REFUND_OPEN", "PENDING_APPROVAL", "DEPARTURE_CANCELLED", "OVERDUE"] as const;
export type BookingAttention = (typeof BOOKING_ATTENTION_KINDS)[number];
/** ลำดับ = ลำดับตัดสิน (ตัวแรกที่จริงชนะ) */
export const BOOKING_MONEY_STATES = ["AGENT_COLLECTS", "REFUNDED", "NONE", "PAID", "PART_PAID", "UNPAID"] as const;
export type BookingMoneyState = (typeof BOOKING_MONEY_STATES)[number];
/** สถานะการจองที่ยังมียอดให้จ่าย (= OWES ของ money.ts) */
export const BOOKING_OWES_STATUSES = ["HOLD", "PENDING", "CONFIRMED", "PART_PAID"] as const;
/** สถานะการจองที่ยังถือ/ใช้ที่นั่งของรอบ (รอบถูกยกเลิก ⇒ ต้องทำ) */
export const BOOKING_LIVE_STATUSES = ["HOLD", "PENDING", "CONFIRMED", "PART_PAID", "PAID"] as const;

/** แถวการจองสูงสุดต่อจอ */
export const TRIPS_BOOKING_LIST_CAP = 100;
/** แถวคิวเอกสารเงินรอออกสูงสุดต่อจอ */
export const TRIPS_MONEY_DOCS_CAP = 100;
/** แถวรายการเงินของวันสูงสุดในกล่องเงินสดหน้าร้าน */
export const TRIPS_CASH_EVENTS_CAP = 100;

const INT4_MAX = 2_147_483_647;
const OWES: readonly string[] = BOOKING_OWES_STATUSES;
const SOLID: readonly string[] = ["CONFIRMED", "PART_PAID", "PAID"];
const DASHED: readonly string[] = ["HOLD", "PENDING"];
const ENDED_UNPAID: readonly string[] = ["EXPIRED", "CANCELLED"];

// ═══════════════ เงิน ═══════════════
/** ยอดค้างของการจอง — เฉพาะสถานะที่ยังมียอดให้จ่าย · ไม่ติดลบ */
export function outstandingOf(b: { status: string; payableSatang: number; paidSatang: number }): number {
  return OWES.includes(b.status) ? Math.max(0, b.payableSatang - b.paidSatang) : 0;
}

/** สถานะเงินของแถว (ตัวแรกที่จริงชนะ ตามลำดับ BOOKING_MONEY_STATES) */
export function moneyStateOf(b: { status: string; collectMode: string; agentAccountId: string | null; payableSatang: number; paidSatang: number; refundedSatang: number }): BookingMoneyState {
  if (b.collectMode === "AGENT" || b.agentAccountId !== null) return "AGENT_COLLECTS";
  if (b.refundedSatang > 0) return "REFUNDED";
  if (b.paidSatang === 0 && (ENDED_UNPAID.includes(b.status) || b.payableSatang === 0)) return "NONE";
  if (b.paidSatang >= b.payableSatang) return "PAID";
  if (b.paidSatang > 0) return "PART_PAID";
  return "UNPAID";
}

// ═══════════════ ป้ายสถานะ ═══════════════
export type BookingBadgeShape = "solid" | "dashed" | "alert" | "muted";
/** ป้ายของแถว: มีเรื่องต้องทำ ⇒ กรอบเตือน + เรื่องแรก · ไม่งั้นรูปทรงตามสถานะ (ทึบ = ยืนยัน · เส้นประ = ถือที่/รออนุมัติ · เทา = จบแล้ว) */
export function bookingBadgeOf(b: { status: string; attention: readonly string[] }): { kind: string; shape: BookingBadgeShape } {
  const first = b.attention[0];
  if (first !== undefined) return { kind: first, shape: "alert" };
  if (DASHED.includes(b.status)) return { kind: b.status, shape: "dashed" };
  if (SOLID.includes(b.status)) return { kind: b.status, shape: "solid" };
  return { kind: b.status, shape: "muted" };
}

// ═══════════════ วัน ═══════════════
const YMD_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
/** วันที่ล้วนที่มีจริงในปฏิทิน ⇒ ms (UTC เที่ยงคืน) · ไม่ใช่ ⇒ null */
function ymdMs(ymd: string): number | null {
  const m = YMD_RE.exec(ymd);
  if (!m) return null;
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return new Date(ms).toISOString().slice(0, 10) === ymd ? ms : null;
}
const DAY_MS = 86_400_000;
const addDays = (ms: number, n: number): string => new Date(ms + n * DAY_MS).toISOString().slice(0, 10);

/** หน้าต่างวันเดินทางของตัวกรอง (วันตามเขตเวลาร้าน · today = YYYY-MM-DD) · when/today ผิด ⇒ null */
export function listWindowOf(when: string, today: string): { from: string | null; to: string | null } | null {
  if (typeof when !== "string" || typeof today !== "string") return null;
  const t = ymdMs(today);
  if (t === null) return null;
  switch (when) {
    case "upcoming":
      return { from: today, to: null };
    case "today":
      return { from: today, to: today };
    case "tomorrow":
      return { from: addDays(t, 1), to: addDays(t, 1) };
    case "next7":
      return { from: today, to: addDays(t, 6) };
    case "past30":
      return { from: addDays(t, -30), to: addDays(t, -1) };
    case "all":
      return { from: null, to: null };
    default:
      return null;
  }
}

// ═══════════════ ค้นหา · อ่านยอด · ปิดบังเบอร์ ═══════════════
/** รูปเลขจอง (เขียนซ้ำจาก BOOKING_CODE_RE ของ numbering.ts — ไฟล์นี้ห้าม import ค่า) */
const BOOKING_CODE_RE = /^[A-Z]{1,4}-\d{4}-\d{4,}$/;
/** ข้อความค้นที่เป็นเลขจอง ⇒ เลขจองตัวใหญ่ · ไม่ใช่ ⇒ null (ค้นด้วยชื่อ/เลขอ้างอิงแทน) */
export function bookingCodeQuery(q: string): string | null {
  if (typeof q !== "string") return null;
  const s = q.trim().toUpperCase();
  return BOOKING_CODE_RE.test(s) ? s : null;
}

/** ยอด "บาท" ที่ผู้ใช้พิมพ์ → สตางค์จำนวนเต็ม (1..2,147,483,647) · อ่านไม่ได้/ศูนย์/เกิน ⇒ null */
export function parseAmountSatang(text: string): number | null {
  if (typeof text !== "string") return null;
  const s = text.replace(/[,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const [baht, frac = ""] = s.split(".");
  const whole = baht.replace(/^0+(?=\d)/, "");
  if (whole.length > 8) return null;
  const v = Number(whole) * 100 + Number(frac.padEnd(2, "0"));
  return Number.isSafeInteger(v) && v >= 1 && v <= INT4_MAX ? v : null;
}

/** เบอร์โทร → รูปปิดบัง "081-xxx-5523" (แสดงในรายละเอียดเท่านั้น) · ว่าง ⇒ null */
export function maskPhone(phone: string | null | undefined): string | null {
  if (typeof phone !== "string") return null;
  let d = phone.replace(/\D/g, "");
  if (!d) return null;
  if (d.startsWith("66") && d.length === 11) d = `0${d.slice(2)}`;
  if (d.length >= 9) return `${d.slice(0, 3)}-xxx-${d.slice(-4)}`;
  if (d.length >= 7) return `xxx-${d.slice(-4)}`;
  return "xxx";
}

// ═══════════════ คีย์กันกดซ้ำต่อเจตนา ═══════════════
/** FNV-1a 32 บิต ของข้อความ (หน่วยรหัส UTF-16) ⇒ hex 8 ตัว */
function fnv1a(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h ^= c & 0xff;
    h = Math.imul(h, 0x01000193);
    h ^= c >>> 8;
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}
const alnum = (s: string, max: number): string => String(s).replace(/[^A-Za-z0-9]/g, "").slice(0, max);
/**
 * คีย์กันซ้ำของ "เจตนาเดียว" = `${prefix}_${seed}_${hash(parts)}` — seed สุ่มครั้งเดียวตอนเปิดกล่อง · ค่าเดียวกัน ⇒ คีย์เดียวกัน (กดซ้ำ/ส่งซ้ำ = ผลเดิม)
 * ส่วนใดเปลี่ยน ⇒ คีย์ใหม่ · รูป [A-Za-z0-9_-]{8,100} (ยาวสุด 12 + 1 + 40 + 1 + 8 = 62)
 */
export function intentKey(prefix: string, seed: string, parts: readonly (string | number | boolean | null)[]): string {
  return `${alnum(prefix, 12)}_${alnum(seed, 40)}_${fnv1a(JSON.stringify(parts))}`;
}
