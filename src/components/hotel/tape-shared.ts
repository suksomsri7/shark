// SVC H.2 ▸ ปฏิทินห้อง — ของร่วมฝั่งจอ (pure ล้วน: ไม่มี directive · ไม่ import) · ใบสั่ง h.2 §2 มติ 1/2/4/9 · §4 · ภาพ ledger/design-dorm/08-hotel-tape.png
//   ชนิด DTO ตรงกับ src/lib/modules/hotel/tape.ts (เขียนซ้ำที่นี่เพื่อไม่ให้ไฟล์จอลากโมดูลฝั่งเซิร์ฟเวอร์)

export type TapeKind = "STAY" | "CONFIRMED" | "HOLD" | "OTA" | "BLOCK" | "LEASE";
export const TAPE_KINDS: TapeKind[] = ["STAY", "CONFIRMED", "OTA", "HOLD", "BLOCK", "LEASE"];
export type TapeBarDto = {
  kind: TapeKind;
  refId: string;
  label: string;
  from: string;
  to: string;
  holdExpiresAt: string | null;
  guestName: string | null;
  source: string | null;
  groupId: string | null;
  href: string | null;
  code: string | null;
  status: string | null;
  roomTypeId: string | null;
  roomId: string | null;
  reason: string | null;
  leaseUnitId: string | null;
  roomNote: string | null;
};
export type TapeRoomDto = { roomId: string; number: string; floorNo: number | null; hkStatus: string; bars: TapeBarDto[] };
export type TapeGroupDto = { roomTypeId: string; name: string; rateTodaySatang: number; rateWeekendSatang: number; rooms: TapeRoomDto[]; unassigned: TapeBarDto[] };
export type TapeModel = { unitSlug: string; from: string; today: string; days: string[]; groups: TapeGroupDto[]; occupancy: { date: string; occupied: number; sellable: number }[] };
export type TodayKpiDto = {
  arrivals: number;
  departures: number;
  inHouse: number;
  sellable: number;
  blocked: number;
  leased: number;
  hkDirty: number;
  weekOccBps: number;
  weekendOccBps: number;
  adrSatang: number;
  arrivalNames: string[];
  departureNames: string[];
  arrivalRooms: string[];
  departureRooms: string[];
  blockedRooms: string[];
  leasedRooms: string[];
  dirtyRooms: string[];
};
export type TapeView = "week" | "2w" | "month";

/** คำอธิบายแถบ 6 แบบ (ภาพ 08 ล่างซ้าย) */
export const LEGEND_TH: Record<TapeKind, string> = {
  STAY: "พักอยู่",
  CONFIRMED: "จองแล้ว",
  OTA: "มาจาก OTA",
  HOLD: "ถือไว้ รอมัดจำ",
  BLOCK: "ปิดซ่อม",
  LEASE: "เช่ารายเดือน (ระบบหอ)",
};
export const TXT = {
  title: "ปฏิทินห้อง",
  occRow: "เข้าพัก (ไม่นับรายเดือน/ซ่อม)",
  otaNote: "OTA: ตอนนี้คีย์เอง · เปิดตัวต่อช่องทางขายได้ที่ศูนย์เชื่อมต่อ (เฟสถัดไป)",
  unassigned: "ยังไม่กำหนดห้อง",
  leaseRoom: "ปล่อยรายเดือน (ระบบหอ)",
  noPriceDiff: "ไม่คิดส่วนต่างเมื่อย้ายประเภท",
  readOnly: "ดูได้อย่างเดียว — ย้าย/ปิดห้องต้องมีสิทธิ์จัดการการจอง",
  scrollHint: "เลื่อนซ้าย–ขวาเพื่อดูวันอื่น",
} as const;
export const VIEW_TH: Record<TapeView, string> = { week: "สัปดาห์", "2w": "2 สัปดาห์", month: "เดือน" };
export const HK_TH: Record<string, string> = { CLEAN: "สะอาด", DIRTY: "รอทำ", INSPECTED: "ตรวจแล้ว", OUT_OF_ORDER: "ปิดซ่อม" };
export const SOURCE_TH: Record<string, string> = { WALK_IN: "เดินเข้า", PHONE: "โทรจอง", WEB: "หน้าเว็บ", LINE: "LINE", OTA: "OTA" };

/** สีแถบตามแบบ: ทึบ=พักอยู่ · ขอบ=จองแล้ว · เส้นประ=OTA · ฟ้า=ถือไว้ · ลายทาง=ปิดซ่อม · เทา=รายเดือน */
export const BAR_CLASS: Record<TapeKind, string> = {
  STAY: "bg-[color:var(--color-ink)] text-white border border-[color:var(--color-ink)]",
  CONFIRMED: "bg-[color:var(--color-surface)] text-[color:var(--color-ink)] border border-[color:var(--color-ink)]",
  OTA: "bg-[color:var(--color-surface)] text-[color:var(--color-ink)] border border-dashed border-[color:var(--color-ink)]",
  HOLD: "bg-sky-50 text-sky-900 border border-sky-400",
  BLOCK: "text-[color:var(--color-muted)] border border-[color:var(--color-line)] bg-[repeating-linear-gradient(135deg,#f3f4f6_0_6px,#ffffff_6px_12px)]",
  LEASE: "bg-gray-100 text-[color:var(--color-muted)] border border-[color:var(--color-line)]",
};
/** แถบที่ลากได้ (มติ 2): การจองเท่านั้น · BLOCK/LEASE ไม่ลาก */
export const isDraggable = (k: TapeKind): boolean => k === "STAY" || k === "CONFIRMED" || k === "OTA" || k === "HOLD";
/** เลื่อนวันได้ (แนวนอน) เฉพาะยังไม่เข้าพัก · CHECKED_IN (STAY) ย้ายห้อง/ยืดคืนได้แต่เลื่อนวันเข้าไม่ได้ */
export const canShiftDates = (k: TapeKind): boolean => k === "CONFIRMED" || k === "OTA" || k === "HOLD";

// ───────── วันที่ (ไม่ใช้ getDay ดิบ · คำนวณจากเลขวัน) ─────────
const YMD = /^(\d{4})-(\d{2})-(\d{2})$/;
export const isYmd = (s: unknown): s is string => typeof s === "string" && YMD.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
const DAY = 86_400_000;
export const dayNo = (ymd: string): number => Math.round(Date.parse(`${ymd}T00:00:00Z`) / DAY);
export const ymdOfDay = (n: number): string => new Date(n * DAY).toISOString().slice(0, 10);
export const addDays = (ymd: string, n: number): string => ymdOfDay(dayNo(ymd) + n);
export const diffDays = (a: string, b: string): number => dayNo(b) - dayNo(a);
/** 0 = อาทิตย์ */
export const dowOf = (ymd: string): number => (((dayNo(ymd) + 4) % 7) + 7) % 7;
const DOW_TH = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];
const MONTH_TH = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const MONTH_FULL_TH = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
const parts = (ymd: string) => ({ y: Number(ymd.slice(0, 4)), m: Number(ymd.slice(5, 7)), d: Number(ymd.slice(8, 10)) });
export const dowTh = (ymd: string): string => DOW_TH[dowOf(ymd)];
export const isWeekend = (ymd: string): boolean => dowOf(ymd) === 5 || dowOf(ymd) === 6;
/** "7 พ.ย." */
export const dayMonthTh = (ymd: string): string => `${parts(ymd).d} ${MONTH_TH[parts(ymd).m - 1]}`;
/** ช่วงหัวจอ: "2 – 8 พ.ย. 2569" · ข้ามเดือน "28 ต.ค. – 3 พ.ย. 2569" · เดือน "พฤศจิกายน 2569" */
export function rangeTh(first: string, last: string, view: TapeView): string {
  const a = parts(first);
  const b = parts(last);
  if (view === "month") return `${MONTH_FULL_TH[a.m - 1]} ${a.y + 543}`;
  if (a.m === b.m && a.y === b.y) return `${a.d} – ${b.d} ${MONTH_TH[b.m - 1]} ${b.y + 543}`;
  return `${a.d} ${MONTH_TH[a.m - 1]} – ${b.d} ${MONTH_TH[b.m - 1]} ${b.y + 543}`;
}
export const daysInMonth = (ymd: string): number => {
  const { y, m } = parts(ymd);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
};
export const firstOfMonth = (ymd: string): string => `${ymd.slice(0, 8)}01`;
/** จำนวนวันของมุมมอง (เดือน = จำนวนวันของเดือนปฏิทิน) */
export const viewDays = (view: TapeView, from: string): number => (view === "week" ? 7 : view === "2w" ? 14 : daysInMonth(from));
/** ต้นกริดของมุมมองถัดไป/ก่อนหน้า */
export function shiftFrom(view: TapeView, from: string, dir: 1 | -1): string {
  if (view !== "month") return addDays(from, dir * viewDays(view, from));
  const { y, m } = parts(from);
  const t = new Date(Date.UTC(y, m - 1 + dir, 1));
  return t.toISOString().slice(0, 10);
}
export const parseView = (v: unknown): TapeView => (v === "2w" || v === "month" ? v : "week");

// ───────── ตัวเลข ─────────
const comma = (n: number): string => Math.trunc(n).toLocaleString("en-US");
/** สตางค์ ⇒ "1,290" (ปัดเป็นบาท) */
export const baht = (satang: number): string => comma(Math.round((Number.isFinite(satang) ? satang : 0) / 100));
export const pctOfBps = (bps: number): string => `${Math.round(bps / 100)}%`;
export const pct = (a: number, b: number): string => (b > 0 ? `${Math.round((a * 100) / b)}%` : "0%");
/** "14:30" ไทยจาก ISO */
/** HOLD ที่เลยเวลาแล้วแต่ยังไม่ถูกกวาด (ผู้ตรวจ m3) — เทียบเวลาเป็นเลข ไม่ใช้วันในสัปดาห์ */
export const holdExpired = (iso: string | null, nowMs: number): boolean => !!iso && Date.parse(iso) <= nowMs;
export function timeTh(iso: string | null): string {
  if (!iso) return "";
  const t = new Date(Date.parse(iso) + 7 * 3_600_000);
  return `${String(t.getUTCHours()).padStart(2, "0")}:${String(t.getUTCMinutes()).padStart(2, "0")}`;
}

/** ตำแหน่งแถบในกริด (หน่วยครึ่งวัน): เริ่มกลางวันเข้า จบกลางวันออก · ตัดที่ขอบกริด */
export function barSpan(bar: { from: string; to: string }, gridFrom: string, nDays: number): { left: number; width: number; clipL: boolean; clipR: boolean } {
  const half = 0.5;
  const s = diffDays(gridFrom, bar.from) + half;
  const e = diffDays(gridFrom, bar.to) + half;
  const l = Math.max(0, s);
  const r = Math.min(nDays, e);
  return { left: l / nDays, width: Math.max(0, r - l) / nDays, clipL: s < 0, clipR: e > nDays };
}
