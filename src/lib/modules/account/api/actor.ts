// actor.ts — "ผู้กระทำ" ของ REST บัญชี เมื่อคนเรียกคือ **API key** ไม่ใช่คนที่ล็อกอิน (WO A3)
//
// ปัญหา: ทั้งโมดูลบัญชีตรวจสิทธิ์ผ่าน `accountCan(auth, action)` ซึ่งรับ `auth` ของ session
// (user + Membership + Tenant) — REST ไม่มีสิ่งนั้น มีแค่ scope ที่ติดมากับคีย์
//
// ทางออก: แปลง scope ของคีย์ให้เป็น `MembershipCtx` ปลอมที่ **แคบที่สุดเท่าที่เป็นไปได้**
//   role = STAFF (ไม่ใช่ OWNER/MANAGER — สองบทบาทนั้น `evaluate` ปล่อยผ่านทุก action)
//   unitAccess = [] (คีย์ไม่ผูกสาขา · action ระดับร้านผ่านได้ · action ที่ระบุ unitId จะถูกปฏิเสธ)
//   permissions = { "<scope>": true } ทีละตัวจากรายการ scope ของคีย์
// ⇒ คีย์ทำได้ไม่เกิน "พนักงานที่ติ๊กสิทธิ์เท่านี้พอดี" — ไม่มีทางลัดใด ๆ
//
// 🔴 ต้องเดินผ่าน IMPLIES ชุดเดียวกับ `accountCan` ไม่งั้นคีย์ที่ถือ `account.doc.create`
//    จะอ่านเอกสารที่ตัวเองเพิ่งสร้างไม่ได้ (สิทธิ์หายเงียบ ๆ แบบเดียวกับที่ WO 0.3 เจอบนหน้าจอ)

import { evaluate, type MembershipCtx } from "@/lib/core/rbac";
import { IMPLIES } from "../access";

export type ApiActor = {
  kind: "apikey";
  tenantId: string;
  /** สมุดบัญชี (AppSystem type ACCOUNT) ที่คำขอนี้ทำงานอยู่ — resolve แล้วใน require.ts */
  systemId: string;
  keyId: string;
  /** ชื่อคีย์ที่เจ้าของร้านตั้ง — ใช้เขียนลง AuditLog ให้อ่านออกว่า "แอปไหนทำ" */
  keyName: string;
  scopes: string[];
  membership: MembershipCtx;
};

/** scope ของคีย์ → MembershipCtx ที่แคบที่สุด (STAFF + permission ตรงตัว ไม่มี wildcard) */
export function membershipFromScopes(scopes: string[]): MembershipCtx {
  return {
    role: "STAFF",
    unitAccess: [],
    permissions: Object.fromEntries(scopes.map((s) => [s, true])),
  };
}

/** ตรวจสิทธิ์ action ของโมดูลบัญชีสำหรับ actor ที่เป็นคีย์ — ความหมายเดียวกับ `accountCan` แต่ไม่ต้องมี session */
export function actorCan(actor: ApiActor, action: string): boolean {
  if (evaluate(actor.membership, { module: "account", action })) return true;
  for (const [broad, narrow] of Object.entries(IMPLIES)) {
    if (narrow.includes(action) && evaluate(actor.membership, { module: "account", action: broad })) return true;
  }
  return false;
}
