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

import type { ActorType } from "@prisma/client";
import { evaluate, type MembershipCtx } from "@/lib/core/rbac";
import { IMPLIES } from "../access";

/**
 * ใครเป็นคนสั่ง op นี้ (WO E1 ขยายจาก "คีย์" เป็น 3 แบบ — ทางเดินโค้ดเดียวกันทั้งหมด):
 *   `apikey`    REST `/api/v1/account/*` (แอปภายนอกถือคีย์)
 *   `user`      คนในร้านกดยืนยันข้อเสนอของผู้ช่วย AI (สิทธิ์ = Membership ของคนกดจริง)
 *   `assistant` ผู้ช่วย AI อ่านข้อมูลเอง (อ่านอย่างเดียวเสมอ — เขียนต้องผ่าน proposal ให้คนกด)
 */
export type ApiActorKind = "apikey" | "user" | "assistant";

export type ApiActor = {
  kind: ApiActorKind;
  tenantId: string;
  /** สมุดบัญชี (AppSystem type ACCOUNT) ที่คำขอนี้ทำงานอยู่ — resolve แล้วใน require.ts */
  systemId: string;
  /** 🔴 มีเฉพาะ kind `apikey` — โค้ดที่เขียน audit/กันซ้ำห้ามสมมติว่ามีเสมอ (ใช้ actorAuditId/actorRefId) */
  keyId?: string;
  /** มีเฉพาะ kind `user` — id ของคนที่กดยืนยัน (ผู้ช่วย AI ไม่มีตัวตนของตัวเอง) */
  userId?: string | null;
  /** ชื่อผู้กระทำที่เขียนลง AuditLog ให้อ่านออกว่า "แอปไหน/ใครทำ" (คีย์ = ชื่อคีย์ที่เจ้าของร้านตั้ง) */
  keyName: string;
  scopes: string[];
  membership: MembershipCtx;
};

/** id ที่ลง `AuditLog.actorId` — คีย์ = id คีย์ · คนกดยืนยัน = userId · ผู้ช่วยล้วน = null */
export function actorAuditId(actor: ApiActor): string | null {
  return actor.keyId ?? actor.userId ?? null;
}

/** id อ้างอิงที่ service เดิมต้องการเป็น string เสมอ (เช่น approvedById / คีย์กันซ้ำของการโอน) */
export function actorRefId(actor: ApiActor): string {
  return actor.keyId ?? actor.userId ?? "ai-assistant";
}

/** ชนิดผู้กระทำใน AuditLog — คีย์ API = API_KEY · ที่เหลือคือคนในร้าน (ผู้ช่วยลงมือได้ต่อเมื่อมีคนกดยืนยัน) */
export function actorAuditType(actor: ApiActor): ActorType {
  return actor.kind === "apikey" ? "API_KEY" : "USER";
}

/**
 * ที่มาของเอกสารที่เกิดจาก actor นี้ (`AccountDocSource`)
 * คีย์ภายนอก = `API` · ผู้ช่วย AI (ไม่ว่าคนไหนกดยืนยัน) = `AI` — ในบัญชีต้องแยกออกจากกันเสมอ
 */
export function actorDocSource(actor: ApiActor): "API" | "AI" {
  return actor.kind === "apikey" ? "API" : "AI";
}

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
