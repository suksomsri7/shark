// ─────────────────────────────────────────────────────────────
// booking/line-access.ts — สิทธิ์บนจอคิววันนี้แถวเดียว (pure) · SVC B.5 ใบสั่ง §3.1
//   คีย์ทั้งหมดลงทะเบียนโดย B.11 (core/permissions.ts · ตารางสิทธิ์ภาพ 14) — ใบนี้ใช้ตามชื่อเดิม
//   OWNER = ทุกข้อ · MANAGER ที่คุมสาขา = ทุกข้อ · STAFF ตาม permissions (`booking.*` = ทุกข้อ) · ไม่มีสาขา/null = ไม่มีอะไร
// 🔴 pure: import ได้เฉพาะ core/rbac (ข้อสอบ S-8)
// ─────────────────────────────────────────────────────────────
import { assertCan, evaluate } from "@/lib/core/rbac";

export type LineMember = { role: "OWNER" | "MANAGER" | "STAFF"; unitAccess: string[]; permissions: Record<string, unknown> };
export type LineAccess = { view: boolean; operate: boolean; checkIn: boolean; walkIn: boolean; runOwn: boolean; runAny: boolean; fullPhone: boolean };

export function lineAccess(m: LineMember | null, unitId: string): LineAccess {
  const can = (action: string) => evaluate(m, { module: "booking", action, unitId });
  const operate = can("booking.queue.operate");
  const checkIn = can("booking.checkin");
  const walkIn = can("booking.walkin.create");
  const runAny = can("booking.job.runAny");
  const runOwn = runAny || can("booking.job.run");
  const fullPhone = can("booking.customer.phoneFull");
  // คีย์เดิม booking.appointment.setStatus = ดูจอได้อย่างเดียว (ไม่ให้ปุ่มใหม่)
  const view = operate || checkIn || walkIn || runOwn || can("booking.appointment.setStatus");
  return { view, operate, checkIn, walkIn, runOwn, runAny, fullPhone };
}

/** ยกเลิกงานค้างข้ามวัน (todo STALE) — คีย์เลื่อน/ยกเลิกนัดของ B.11 ก็ทำได้ */
export function canCancelStale(m: LineMember | null, unitId: string): boolean {
  return evaluate(m, { module: "booking", action: "booking.appointment.reschedule", unitId });
}

/**
 * ด่านของ server action จอแถวเดียว: คืน LineAccess · ผู้ที่ดูจอนี้ไม่ได้เลย ⇒ throw ForbiddenError (assertCan · fail closed)
 * ปุ่มต่องานยังต้องผ่าน authorizeLineOp (สถานะงาน + งานของตัวเอง) ทุกครั้ง
 */
export function assertLineAccess(m: LineMember | null, unitId: string): LineAccess {
  const a = lineAccess(m, unitId);
  if (!a.view) assertCan(m, { module: "booking", action: "booking.queue.operate", unitId });
  return a;
}
