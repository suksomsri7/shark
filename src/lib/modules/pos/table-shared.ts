// table-shared.ts — POS P2.4 โหมดโต๊ะ: ส่วนบริสุทธิ์ (client-safe · ไม่แตะ DB/prisma/โมดูลฝั่งเซิร์ฟเวอร์ · ไม่ใช้ node:/crypto)
//   สถานะโต๊ะบนผัง (ลำดับความสำคัญ R2) · ช่วงกันโต๊ะของการจอง (R10) · แฮชชุดรายการของบิลโต๊ะ (R6/R7 · มติผู้คุม CONTROLLER-DECISION 3) ·
//   ชนิดข้อมูลของผัง/การ์ด/แผงโต๊ะที่จอ P2.4U ใช้ (ผลของ pos/table.ts)
// สัญญา: ledger/pos-briefs/pos-brief-P2.4.md §2 R2 R6 R10 · ledger/wo-notes/pos-P2.4-oracle.md ตารางชื่อแถว 14 · ข้อสอบ scripts/qc-pos-p2.4.mts ST5

import type { RegisterRefusal } from "./register-shared";

/** สถานะโต๊ะบนผัง เรียงตามลำดับความสำคัญ (ตัวแรกที่จริงชนะ) */
export const TABLE_STATES = ["INACTIVE", "BILL_REQUESTED", "DINING", "NEEDS_CLEARING", "RESERVED", "FREE"] as const;
export type TableState = (typeof TABLE_STATES)[number];

/** กันโต๊ะก่อนเวลาจองปริยาย (นาที) */
export const RESERVATION_HOLD_DEFAULT_MINUTES = 15;
/** ยังถือว่า "จองไว้" หลังเวลาจองอีกกี่นาที (ลูกค้ามาสาย) */
export const RESERVATION_LATE_MINUTES = 30;
/** เพดานนาทีกันโต๊ะก่อนเวลาจอง (ตัวตรวจ input ของการจอง) */
export const RESERVATION_HOLD_MAX_MINUTES = 240;
/** เพดานจำนวนคนต่อการจอง */
export const RESERVATION_PARTY_MAX = 200;

const MINUTE_MS = 60_000;

/**
 * สถานะของโต๊ะ: INACTIVE > BILL_REQUESTED (ขอเช็คบิล/แจ้งจ่ายพร้อมเพย์ที่ยังไม่ปิดเรื่อง) > DINING (มี session OPEN) >
 * NEEDS_CLEARING (dirtySince ตั้งอยู่) > RESERVED (การจองอยู่ในช่วงกันโต๊ะ) > FREE
 */
export function tableStateOf(f: { inactive: boolean; billRequested: boolean; open: boolean; dirty: boolean; reserved: boolean }): TableState {
  if (f.inactive) return "INACTIVE";
  if (f.billRequested) return "BILL_REQUESTED";
  if (f.open) return "DINING";
  if (f.dirty) return "NEEDS_CLEARING";
  if (f.reserved) return "RESERVED";
  return "FREE";
}

/** การจองเวลา atMs กันโต๊ะอยู่ ณ nowMs ไหม: at − hold·นาที ≤ now ≤ at + RESERVATION_LATE_MINUTES นาที (รวมขอบทั้งสองข้าง) */
export function reservationHolds(atMs: number, holdFromMinutes: number, nowMs: number): boolean {
  if (!Number.isFinite(atMs) || !Number.isFinite(nowMs) || !Number.isFinite(holdFromMinutes)) return false;
  return atMs - holdFromMinutes * MINUTE_MS <= nowMs && nowMs <= atMs + RESERVATION_LATE_MINUTES * MINUTE_MS;
}

/** แฮช 32 บิต (FNV-1a + ตัวคูณผสม) ของสตริง พร้อม seed — ไม่ใช่การเข้ารหัส: ใช้เทียบ "ชุดรายการเดิมไหม" ส่วนตัวตัดสินจริงคือการยึดรายการในธุรกรรม */
function hash32(s: string, seed: number): number {
  let h = (0x811c9dc5 ^ seed) >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}

/**
 * แฮชของชุดรายการบนบิลโต๊ะ (R6 · CONTROLLER-DECISION 3) — ไม่ขึ้นกับลำดับ (เรียง id ก่อน · id ซ้ำนับครั้งเดียว) · คงที่ ·
 * ชุดต่าง = ค่าต่าง (สองแฮช 32 บิต + จำนวน) · ไม่แก้อินพุต · สตริงไม่ว่างเสมอ
 */
export function tableItemsHash(itemIds: readonly string[]): string {
  const ids = [...new Set(itemIds.map(String))].sort();
  const joined = ids.join("\n");
  const a = hash32(joined, 0x9e3779b9).toString(16).padStart(8, "0");
  const b = hash32(joined, 0x7f4a7c15).toString(16).padStart(8, "0");
  return `t${ids.length}-${a}${b}`;
}

// ═══════════ ชนิดข้อมูลของผัง/แผงโต๊ะ (ผลของ pos/table.ts · จอ P2.4U) ═══════════

export type TableFlags = { callStaff: boolean; billRequested: boolean; payNotified: boolean };
export type TableMemberBrief = { id: string; name: string; tier: string | null };
export type TableReservationBrief = { id: string; name: string; partySize: number; at: string; holdFromMinutes: number; phone: string | null };

/** การ์ดโต๊ะบนผัง (R2 · CONTROLLER-DECISION 2) — เงินเป็นสตางค์ · เวลาเป็น ISO */
export type TableCard = {
  id: string;
  name: string;
  zoneId: string;
  seats: number;
  state: TableState;
  sessionId: string | null;
  guestCount: number | null;
  openedAt: string | null;
  /** Σ lineTotal ของรายการที่ยังไม่จ่ายและไม่ถูกยกเลิก (ไม่ใช่ยอดสะสมทั้งวัน) */
  unpaidSatang: number;
  /** จำนวนบรรทัดของรอบร่าง HELD ที่ยังไม่ส่งครัว (0 = ไม่มี) */
  unsentCount: number;
  /** รายการที่ครัวทำเสร็จรอเสิร์ฟ (kdsStatus READY) */
  readyCount: number;
  member: TableMemberBrief | null;
  /** session ถูกเปิดโดยพนักงาน (false = ลูกค้าเปิดเองผ่าน QR) */
  openedByStaff: boolean;
  flags: TableFlags;
  dirtySince: string | null;
  /** การจองที่กันโต๊ะนี้อยู่ตอนนี้ (BOOKED · อยู่ในช่วงกัน) */
  reservation: TableReservationBrief | null;
};
export type TableZone = { id: string; name: string; sortOrder: number; tableCount: number };
/** ตัวเลขแถบบนของผัง (R2 · CONTROLLER-DECISION 2) — ใช้แสดง "โต๊ะยังไม่ปิด N · ฿" ในหน้า X/Z/ปิดวันได้ด้วย (Q10 · แสดงอย่างเดียว) */
export type TableFloorSummary = { used: number; total: number; guests: number; avgMinutes: number; unpaidSatang: number };
/** ค่าบริการ (basis point): pos = ค่าตั้งหน้าขายที่บิลโต๊ะใช้ (ปิด = 0 · มติ Q3/CD7) · restaurant = ของร้านอาหารที่เช็คบิลเดิมใช้ · differs = จอเตือน */
export type TableServiceCharge = { posBp: number; restaurantBp: number; differs: boolean };
export type RegisterTablesResult =
  | { ok: true; zones: TableZone[]; tables: TableCard[]; summary: TableFloorSummary; reservationsToday: number; canCreateTables: boolean; serviceCharge: TableServiceCharge; serverTime: string }
  | RegisterRefusal;
/** แท็บ "โต๊ะ" ของหน้าขาย (มติ Q5 · ไม่มีค่าตั้งใหม่): visible = มีโต๊ะที่ไม่เก็บถาวร ≥ 1 หรือผู้ใช้เพิ่มโต๊ะได้ (หน้าว่าง + ปุ่มตั้งค่า) */
export type RegisterTableModeResult = { ok: true; visible: boolean; tableCount: number; canCreateTables: boolean } | RegisterRefusal;

/** แผงโต๊ะ (ภาพ 03 ขวา): รอบที่ส่งแล้ว + รายการ + รอบร่าง */
export type TableRoundItem = {
  id: string;
  name: string;
  qty: number;
  unitPriceSatang: number;
  optionsSatang: number;
  lineTotalSatang: number;
  options: { choiceId: string | null; groupName: string; name: string; priceDeltaSatang: number }[];
  note: string | null;
  kdsStatus: "NEW" | "COOKING" | "READY" | "SERVED" | "CANCELLED";
  paid: boolean;
  productId: string | null;
};
export type TableRound = { orderId: string; dailyNo: number; createdAt: string; byStaff: boolean; items: TableRoundItem[] };
export type TableDraft = { heldCartId: string; version: number; lineCount: number; approxTotalSatang: number; cart: unknown; heldByUserId: string; createdAt: string };
export type RegisterTableDetailResult =
  | {
      ok: true;
      session: { id: string; status: "OPEN" | "CLOSED" | "MERGED" | "CANCELLED"; tableId: string; tableName: string; guestCount: number | null; openedAt: string; openedByStaff: boolean; openedByUserId: string | null; member: TableMemberBrief | null };
      rounds: TableRound[];
      draft: TableDraft | null;
      unpaidSatang: number;
      unpaidItemIds: string[];
      itemsHash: string;
    }
  | RegisterRefusal;
