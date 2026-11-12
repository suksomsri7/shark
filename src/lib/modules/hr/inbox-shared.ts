// HR H2.11 ▸ กล่องคำขอรวมของผู้จัดการ (ภาพ 05) + ภาพรวมทีม (ภาพ 01) — ชนิดข้อมูลและข้อความคงที่ที่ใช้ร่วมกัน (server · client · oracle)
//   ไฟล์นี้ไม่ import อะไรเลย (ใช้ได้ทั้งฝั่ง client และฝั่ง server) · ข้อความไทยคงที่ทุกไบต์ (brief §3) ◂

export const INBOX_TEXT = {
  noAccess: "คุณไม่มีสิทธิ์ดูหรือตัดสินคำขอในหน้านี้",
  noRight: "คุณไม่มีสิทธิ์ตัดสินคำขอนี้",
  key: "คำขอไม่สมบูรณ์ — กรุณาเปิดหน้านี้ใหม่แล้วลองอีกครั้ง",
  empty: "กรุณาเลือกอย่างน้อย 1 รายการ",
  tooMany: "เลือกได้ครั้งละไม่เกิน 50 รายการ",
  badItem: "รายการที่เลือกไม่ถูกต้อง — กรุณาเปิดหน้านี้ใหม่",
  rejectReason: "กรุณาใส่เหตุผลที่ไม่อนุมัติ (3–200 ตัวอักษร)",
  oneByOne: "รายการเพิ่ม/หักเงินต้องตัดสินทีละรายการ — เปิดดูยอดและหนังสือยินยอมก่อนกด",
  batchDiff: "ชุดนี้ถูกส่งไปแล้วด้วยรายการอื่น — กรุณาเปิดหน้านี้ใหม่",
  inProgress: "ชุดนี้กำลังดำเนินการอยู่ — รอสักครู่แล้วเปิดหน้านี้ใหม่",
} as const;

export const INBOX_TYPES = ["LEAVE", "OT", "SWAP", "CORRECTION", "ADJUSTMENT"] as const;
export type InboxType = (typeof INBOX_TYPES)[number];
export type InboxBlocker = null | "CHAIN" | "FILED_BY_YOU" | "NO_RIGHT";
export type InboxDecision = "APPROVED" | "REJECTED";

/** เพดานต่อชนิด (มติ Q1: รวมชุดที่รออยู่ในหน่วยความจำ — แต่ละชนิดอ่านไม่เกินนี้ · ถึงเพดาน = แสดงบางส่วน) */
export const INBOX_CAP = 500;
/** เลือกได้ครั้งละไม่เกิน (R6) */
export const INBOX_BATCH_MAX = 50;
/** หน้าละไม่เกิน (R4) */
export const INBOX_PAGE_MAX = 50;
/** รหัสชุด (R8) */
export const INBOX_KEY_RE = /^[A-Za-z0-9_-]{8,64}$/;

export type InboxSwapSide = { entryId: string; date: string; startMin: number; endMin: number; crossesMidnight: boolean; shiftName: string };
export type InboxDetail =
  | { category: string; days: string | null; fromDate: string; halfDay: string | null; hours: string | null; needsAttachment: boolean; policyName: string | null; toDate: string; reason?: string | null }
  | { date: string; dayClass: string; endAt: string; multiplierBp: number | null; reason: string | null; requestedMin: number; startAt: string; timing: string; warnWeek: boolean }
  | { from: InboxSwapSide | null; shape: string; target: { employeeId: string; name: string }; requester: { employeeId: string; name: string }; to: InboxSwapSide | null; reason?: string | null }
  | {
      action: string;
      day: string | null;
      evidence: { posShifts: { shiftNo: number; openedAt: string | null; closedAt: string | null; forced: boolean }[]; deviceLogout: null } | null;
      filedOnBehalf: boolean;
      kind: string;
      originalAt: string | null;
      periodCount: number | null;
      proposedAt: string | null;
      reason: string;
      repeat: boolean | null;
    }
  | { amountSatang: number; consent: { at: string; ref: string } | null; kind: string; note: string | null; periodKey: string; source: "MANUAL" | "STOCK" | "COMMISSION" | "SYSTEM" };

export type InboxLeaveImpact = {
  balance: { available: string | null; pending: string; used: string } | null;
  duty: unknown;
  othersOff: { fromDate: string; name: string; toDate: string }[];
};
export type InboxImpact = InboxLeaveImpact | { measuredMin: number | null; weekWarn: boolean } | { deltaMin: number | null; monthClosed: boolean } | { targetPeriod: string | null } | null;

export type InboxItem = {
  id: string;
  type: InboxType;
  employeeId: string;
  employeeName: string;
  unitId: string | null;
  createdAt: string;
  ageDays: number;
  canDecide: boolean;
  blocker: InboxBlocker;
  batchable: boolean;
  detail: InboxDetail;
  impact: InboxImpact;
};
export type InboxCounts = { LEAVE: number; OT: number; SWAP: number; CORRECTION: number; ADJUSTMENT: number; total: number; decidable: number };
export type InboxList = { items: InboxItem[]; counts: InboxCounts; nextCursor: string | null; truncated: InboxType[] };
export type InboxResult = { id: string; ok: true; status: string; type: InboxType } | { id: string; ok: false; reason: string; type: InboxType };
export type InboxDecideOutcome = { ok: true; batchKey: string; replayed: boolean; results: InboxResult[] } | { ok: false; reason: string };
export type InboxDecideInput = { batchKey: string; decision: InboxDecision; reason?: string; items: { type: string; id: string }[] };
// ◂ HR H2.11
