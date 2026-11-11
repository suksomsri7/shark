// HR H2.3 ▸ กติกาคำขอสลับ/ยกกะแบบฟังก์ชันล้วน (ไม่แตะ DB · ไม่อ่านนาฬิกา — ผู้เรียกส่ง "วันนี้" มาเอง)
//   • ตารางสถานะ swapTransition (brief R5) — ทางที่ไม่อยู่ในตาราง = null (ห้ามเปลี่ยน)
//   • ข้อความคงที่ทุกไบต์ (ไม่มีชื่อคน/id) — service + server actions ใช้ชุดเดียวกัน
//   • รูปคำขอ (SWAP/GIVE) · กุญแจล็อกของคำขอ · รหัสใช้ผลไม่ได้ → ข้อความ ◂

export type SwapStatus = "AWAITING_PEER" | "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
export type SwapEvent = "PEER_ACCEPT" | "PEER_DECLINE" | "CANCEL" | "APPROVE" | "REJECT" | "APPLY_REFUSED" | "EXPIRE";
export type SwapShape = "SWAP" | "GIVE";

/** สถานะที่ยัง "เปิด" (partial unique ของ fromEntryId ครอบสองสถานะนี้) */
export const SWAP_OPEN_STATUSES: readonly SwapStatus[] = Object.freeze(["AWAITING_PEER", "PENDING"]);

const TABLE: Readonly<Record<string, SwapStatus>> = Object.freeze({
  "AWAITING_PEER+PEER_ACCEPT": "PENDING",
  "AWAITING_PEER+PEER_DECLINE": "REJECTED",
  "AWAITING_PEER+CANCEL": "CANCELLED",
  "AWAITING_PEER+EXPIRE": "CANCELLED",
  "PENDING+APPROVE": "APPROVED",
  "PENDING+REJECT": "REJECTED",
  "PENDING+CANCEL": "CANCELLED",
  "PENDING+APPLY_REFUSED": "CANCELLED",
  "PENDING+EXPIRE": "CANCELLED",
});

/** สถานะถัดไป หรือ null เมื่อทางนี้ไม่อนุญาต (APPROVED/REJECTED/CANCELLED = ปลายทาง) */
export function swapTransition(status: string, event: string): SwapStatus | null {
  return TABLE[`${status}+${event}`] ?? null;
}

/** toEntryId มี ⇒ แลกกะ (SWAP) · ไม่มี ⇒ ยกกะให้เพื่อน (GIVE) */
export const shapeOf = (toEntryId: string | null | undefined): SwapShape => (toEntryId ? "SWAP" : "GIVE");

/** ข้อความคงที่ (brief R2–R13) — ห้ามต่อชื่อ/id */
export const SWAP_TEXT = {
  noTarget: "เลือกเพื่อนร่วมงานที่จะรับกะก่อน",
  notOwn: "ขอสลับได้เฉพาะกะของคุณเอง",
  shiftNotFound: "ไม่พบกะนี้ — กรุณารีเฟรช",
  unpublished: "กะนี้ยังไม่เผยแพร่ — ขอสลับได้หลังผู้จัดการเผยแพร่ตาราง",
  past: "กะนี้ผ่านไปแล้ว — ขอสลับไม่ได้",
  selfTarget: "เลือกเพื่อนร่วมงานคนอื่น",
  targetNotFound: "ไม่พบเพื่อนร่วมงานคนนี้ หรือพ้นสภาพแล้ว",
  unlinked: "เพื่อนร่วมงานคนนี้ยังไม่มีบัญชีในระบบ — ให้ผู้จัดการจัดกะให้แทน",
  branch: "สลับได้เฉพาะคนในสาขาเดียวกันในวันนั้น — ให้ผู้จัดการยืมตัวก่อน",
  toBad: "กะของเพื่อนร่วมงานไม่ถูกต้อง — กรุณารีเฟรช",
  same: "สองกะนี้เหมือนกัน — ไม่ต้องสลับ",
  leavePeer: "เพื่อนร่วมงาน ลาอนุมัติแล้วในวันนั้น — สลับไม่ได้",
  leaveYou: "คุณ ลาอนุมัติแล้วในวันนั้น — สลับไม่ได้",
  /** r2 F3: ผู้ขอพ้นสภาพ/อยู่นอกช่วงการจ้างในวันของกะที่จะได้รับ (SWAP) */
  endedYou: "คุณ อยู่นอกช่วงการจ้างในวันนั้น — สลับไม่ได้",
  open: "กะนี้มีคำขอสลับค้างอยู่แล้ว — ยกเลิกคำขอเดิมก่อน",
  notYours: "คำขอนี้ไม่ได้ส่งถึงคุณ",
  stale: "สถานะคำขอเปลี่ยนไปแล้ว กรุณาเปิดดูใหม่",
  expired: "เลยวันของกะนี้แล้ว — คำขอหมดอายุ",
  inChain: "คำขอนี้อยู่ในสายอนุมัติ — ตัดสินที่หน้ารออนุมัติ",
  decided: "คำขอนี้ตัดสินแล้ว — ยกเลิกเองไม่ได้",
  reasonTooLong: "เหตุผลยาวเกินไป (ไม่เกิน 300 ตัวอักษร)",
  failed: "บันทึกคำขอสลับกะไม่สำเร็จ — กรุณาลองใหม่",
  /** แถวของผู้ขอเมื่อสายอนุมัติผ่านแล้วแต่ตารางกะเปลี่ยนไปก่อนใช้ผล (Q10) */
  outcomeStale: "อนุมัติแล้ว แต่ตารางกะเปลี่ยนไป — คำขอนี้ใช้ไม่ได้",
} as const;

export const SWAP_REASON_MAX = 300;
/** เหตุผล: ตัดช่องว่างหัวท้าย · ว่าง = null · ยาวเกิน = undefined (ผู้เรียกปฏิเสธ) */
export function cleanSwapReason(v: unknown): string | null | undefined {
  const s = typeof v === "string" ? v.trim() : "";
  if (!s) return null;
  return s.length > SWAP_REASON_MAX ? undefined : s;
}

/** รหัสที่ใช้ผลไม่ได้ (brief R8) — ไม่ throw · คำขอ → CANCELLED + audit รหัส */
export type SwapApplyCode = "ENTRY_GONE" | "ENTRY_CHANGED" | "PAST" | "NOT_PUBLISHED" | "DUP" | "LEAVE" | "ENDED" | "BRANCH";

/** ฝ่ายที่ทำให้ใช้ผลไม่ได้ (r2 F3): PEER = เพื่อนผู้รับกะ · YOU = ผู้ขอ (ในวันของกะที่ผู้ขอจะได้รับ) */
export type SwapParty = "PEER" | "YOU";
/** ข้อความของทางตัดสินตรง (decideSwap) เมื่อใช้ผลไม่ได้ — `dup`/`changed` = ข้อความของตารางกะ H2.1 (ส่งเข้ามา) · ข้อความบอกฝ่ายให้ถูกคน (r2 F3) */
export function applyCodeText(code: SwapApplyCode, t: { dup: string; changed: string }, party: SwapParty = "PEER"): string {
  if (code === "DUP") return t.dup;
  if (code === "PAST") return SWAP_TEXT.expired;
  if (code === "LEAVE") return party === "YOU" ? SWAP_TEXT.leaveYou : SWAP_TEXT.leavePeer;
  if (code === "ENDED") return party === "YOU" ? SWAP_TEXT.endedYou : SWAP_TEXT.targetNotFound;
  if (code === "BRANCH") return SWAP_TEXT.branch;
  return t.changed; // ENTRY_GONE · ENTRY_CHANGED · NOT_PUBLISHED
}

/** กุญแจล็อกต่อคำขอ (ล็อกแรกเสมอ — ก่อนกุญแจตารางกะ · R13) */
export const swapLockKey = (swapId: string): string => `hr-swap:${swapId}`;

/** กุญแจตารางกะของคำขอ: (ผู้ขอ, ผู้รับ) × (วันของกะต้นทาง, วันของกะปลายทาง) — ซ้ำ/ว่างถูกตัดใน lockRosterKeysInTx */
export function swapRosterKeys(requesterId: string, targetId: string | null, days: (string | null | undefined)[]): { employeeId: string; date: string }[] {
  const emps = [requesterId, targetId].filter((x): x is string => !!x);
  const ds = days.filter((d): d is string => !!d);
  return emps.flatMap((employeeId) => ds.map((date) => ({ employeeId, date })));
}
