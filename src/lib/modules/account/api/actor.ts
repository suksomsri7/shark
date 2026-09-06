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
import { membershipFromScopes, type ApiActor } from "@/lib/api/actor";
import { IMPLIES } from "../access";

/**
 * ใครเป็นคนสั่ง op นี้ (WO E1 ขยายจาก "คีย์" เป็น 3 แบบ — ทางเดินโค้ดเดียวกันทั้งหมด):
 *   `apikey`    REST `/api/v1/account/*` (แอปภายนอกถือคีย์)
 *   `user`      คนในร้านกดยืนยันข้อเสนอของผู้ช่วย AI (สิทธิ์ = Membership ของคนกดจริง)
 *   `assistant` ผู้ช่วย AI อ่านข้อมูลเอง (อ่านอย่างเดียวเสมอ — เขียนต้องผ่าน proposal ให้คนกด)
 */
export type { ApiActor, ApiActorKind } from "@/lib/api/actor";
export { actorAuditId, actorAuditType, actorRefId, membershipFromScopes } from "@/lib/api/actor";

/**
 * ที่มาของเอกสารที่เกิดจาก actor นี้ (`AccountDocSource`)
 * คีย์ภายนอก = `API` · ผู้ช่วย AI (ไม่ว่าคนไหนกดยืนยัน) = `AI` — ในบัญชีต้องแยกออกจากกันเสมอ
 */
export function actorDocSource(actor: ApiActor): "API" | "AI" {
  return actor.kind === "apikey" ? "API" : "AI";
}

/** ข้อความไทยเมื่อคีย์/ผู้ช่วยไม่มีสิทธิ์ทำ op ของบัญชี (ข้อความเดิมของ WO E1 ห้ามเปลี่ยน) */
export const ACCOUNT_DENY_TH = "ไม่มีสิทธิ์ทำรายการนี้ในระบบบัญชี";

/**
 * actor ของ "คีย์ API บัญชี" — scope → MembershipCtx ที่แคบที่สุด แล้วผูก `can()` ของบัญชีเข้าไป
 * (ตัวเดียวที่ `src/lib/api/require.ts` เรียกผ่าน `ApiModuleConfig.makeActor`)
 */
export function accountApiKeyActor(input: {
  tenantId: string;
  systemId: string;
  keyId: string;
  keyName: string;
  scopes: string[];
}): ApiActor {
  const membership = membershipFromScopes(input.scopes);
  return {
    kind: "apikey",
    module: "account",
    tenantId: input.tenantId,
    systemId: input.systemId,
    keyId: input.keyId,
    keyName: input.keyName,
    scopes: input.scopes,
    membership,
    can: (action) => membershipCanAccount(membership, action),
    denyMessageTh: ACCOUNT_DENY_TH,
  };
}

/** ตรวจสิทธิ์ action ของโมดูลบัญชีจาก MembershipCtx ล้วน — ความหมายเดียวกับ `accountCan` แต่ไม่ต้องมี session */
export function membershipCanAccount(membership: MembershipCtx, action: string): boolean {
  if (evaluate(membership, { module: "account", action })) return true;
  for (const [broad, narrow] of Object.entries(IMPLIES)) {
    if (narrow.includes(action) && evaluate(membership, { module: "account", action: broad })) return true;
  }
  return false;
}

/** ตรวจสิทธิ์ action ของโมดูลบัญชีสำหรับ actor — ความหมายเดียวกับ `accountCan` แต่ไม่ต้องมี session */
export function actorCan(actor: ApiActor, action: string): boolean {
  return membershipCanAccount(actor.membership, action);
}

/**
 * scope ของคีย์ทำ action นี้ได้ไหม — ใช้ "ก่อน" จะมี actor (ชั้น route ที่ยังไม่ resolve สมุดบัญชี)
 * ความหมายเดียวกับ `actorCan` เป๊ะ ๆ เพราะเดินผ่าน `membershipFromScopes` + IMPLIES ชุดเดียวกัน
 */
export function scopesCanAccount(scopes: string[], action: string): boolean {
  return membershipCanAccount(membershipFromScopes(scopes), action);
}
