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
  | { amountSatang: number; consent: { at: string; employeeEnded: boolean; ref: string } | null; kind: string; note: string | null; periodKey: string; source: "MANUAL" | "STOCK" | "COMMISSION" | "SYSTEM" };

export type InboxLeaveImpact = {
  balance: { available: string | null; pending: string; used: string } | null;
  duty: unknown;
  othersOff: { fromDate: string; name: string; toDate: string }[];
};
export type InboxImpact = InboxLeaveImpact | { measuredMin: number | null; weekWarn: boolean } | { deltaMin: number | null; monthClosed: boolean | null } | { targetPeriod: string | null } | null;

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

// HR H2.12 ▸ VIS-2 — ตัวสรุปคำขอ 1 บรรทัดที่ใช้ร่วมกัน (การ์ดย่อในภาพรวมทีม 01 · กล่องคำขอ 05) + รายการรหัสที่มีป้ายในข้อความ ·
//   ฿ อยู่ในสรุปเฉพาะเมื่อ DTO มี amountSatang (inbox.ts ส่งรายการเงินเฉพาะผู้ดูเงินเดือน — ผู้จัดการไม่เคยได้ ฿) ·
//   สรุปไม่ได้ (ข้อมูลไม่ครบ/ชนิดไม่รู้จัก) = null ⇒ การ์ดย่อให้ลิงก์ไปกล่องคำขอแทนปุ่มอนุมัติ ◂
/** หมวดการลา (enum HrLeaveType) — ป้าย = hr.settings.categories.<รหัส> */
export const INBOX_LEAVE_CATEGORIES = ["SICK", "PERSONAL", "VACATION", "OTHER"] as const;
/** ชนิดรายการเพิ่ม/หักเงิน (enum HrPayItemKind) — ป้าย = hr.inbox.adjKinds.<รหัส> */
export const INBOX_ADJ_KINDS = ["OT", "COMMISSION", "BONUS", "ALLOWANCE", "DEDUCTION", "ADVANCE"] as const;
/** ที่มาของรายการเงิน — ป้าย = hr.inbox.f.<รหัส> */
export const INBOX_ADJ_SOURCES = ["MANUAL", "STOCK", "COMMISSION", "SYSTEM"] as const;
export const INBOX_CORR_ACTIONS = ["ADD", "CHANGE", "VOID"] as const;
export const INBOX_CORR_KINDS = ["IN", "OUT", "BREAK_START", "BREAK_END"] as const;
export const INBOX_OT_DAYCLASS = ["WORKDAY", "HOLIDAY"] as const;
export const INBOX_OT_TIMING = ["BEFORE", "AFTER"] as const;
/** รหัสอยู่ในรายการ ⇒ รหัสนั้น · ไม่อยู่ ⇒ null (หน้าจอแสดง "—" ไม่แสดงรหัสดิบ) */
export function inboxCode<T extends string>(list: readonly T[], v: unknown): T | null {
  return typeof v === "string" && (list as readonly string[]).includes(v) ? (v as T) : null;
}

export type InboxSummary =
  | { type: "LEAVE"; policyName: string | null; category: (typeof INBOX_LEAVE_CATEGORIES)[number] | null; fromDate: string; toDate: string; days: string | null; halfDay: string | null; hours: string | null }
  | { type: "OT"; date: string; startAt: string; endAt: string; minutes: number }
  | { type: "SWAP"; withName: string; from: InboxSwapSide | null; to: InboxSwapSide | null; swap: boolean }
  | { type: "CORRECTION"; action: (typeof INBOX_CORR_ACTIONS)[number]; kind: (typeof INBOX_CORR_KINDS)[number]; day: string | null; originalAt: string | null; proposedAt: string | null }
  | { type: "ADJUSTMENT"; kind: (typeof INBOX_ADJ_KINDS)[number] | null; amountSatang: number | null; periodKey: string };

const s = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
/** สรุปสิ่งที่กำลังจะอนุมัติ (ใคร = employeeName ของรายการ) — null = สรุปอย่างปลอดภัยไม่ได้ */
export function inboxSummary(it: InboxItem): InboxSummary | null {
  const d = (it?.detail ?? null) as Record<string, unknown> | null;
  if (!d || typeof d !== "object") return null;
  if (it.type === "LEAVE") {
    const fromDate = s(d.fromDate);
    const toDate = s(d.toDate);
    if (!fromDate || !toDate) return null;
    return { type: "LEAVE", policyName: s(d.policyName), category: inboxCode(INBOX_LEAVE_CATEGORIES, d.category), fromDate, toDate, days: s(d.days), halfDay: s(d.halfDay), hours: s(d.hours) };
  }
  if (it.type === "OT") {
    const date = s(d.date);
    const startAt = s(d.startAt);
    const endAt = s(d.endAt);
    if (!date || !startAt || !endAt || typeof d.requestedMin !== "number") return null;
    return { type: "OT", date, startAt, endAt, minutes: d.requestedMin };
  }
  if (it.type === "SWAP") {
    const target = d.target as { name?: unknown } | null;
    const withName = s(target?.name);
    if (!withName) return null;
    return { type: "SWAP", withName, from: (d.from as InboxSwapSide | null) ?? null, to: (d.to as InboxSwapSide | null) ?? null, swap: d.shape === "SWAP" };
  }
  if (it.type === "CORRECTION") {
    const action = inboxCode(INBOX_CORR_ACTIONS, d.action);
    const kind = inboxCode(INBOX_CORR_KINDS, d.kind);
    if (!action || !kind) return null;
    return { type: "CORRECTION", action, kind, day: s(d.day), originalAt: s(d.originalAt), proposedAt: s(d.proposedAt) };
  }
  if (it.type === "ADJUSTMENT") {
    const periodKey = s(d.periodKey);
    if (!periodKey) return null;
    return { type: "ADJUSTMENT", kind: inboxCode(INBOX_ADJ_KINDS, d.kind), amountSatang: typeof d.amountSatang === "number" ? d.amountSatang : null, periodKey };
  }
  return null;
}
/** การ์ดย่อ (ภาพรวมทีม) กดอนุมัติในที่ได้เมื่อ: ตัดสินได้ ∧ สรุปได้ ∧ ไม่ใช่รายการเงิน (เงินต้องเปิดดูยอด/หนังสือยินยอมทีละรายการในกล่องคำขอ) */
export function inboxInlineDecide(it: InboxItem): boolean {
  return it.canDecide && it.type !== "ADJUSTMENT" && inboxSummary(it) !== null;
}
// ◂ HR H2.12
