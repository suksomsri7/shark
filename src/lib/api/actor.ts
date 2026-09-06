// actor.ts — "ผู้กระทำ" ของ REST ทุกโมดูล เมื่อคนเรียกคือ **API key** ไม่ใช่คนที่ล็อกอิน
// (ยกมาจาก `modules/account/api/actor.ts` ตอน K1.15 — ของกลางของแพลตฟอร์ม ไม่ใช่ของบัญชี)
//
// ปัญหา: โมดูลตรวจสิทธิ์ผ่านฟังก์ชันของตัวเอง (`accountCan(auth, action)` / `canReadKanban(actor)`)
// ซึ่งรับ `auth` ของ session (user + Membership + Tenant) — REST ไม่มีสิ่งนั้น มีแค่ scope ที่ติดมากับคีย์
//
// ทางออก: แต่ละโมดูลแปลง scope ของคีย์เป็น "วิธีตัดสินสิทธิ์" ของตัวเอง แล้วผูกมาเป็นฟังก์ชัน `can()`
//   ⇒ แกนกลาง (run/require/dispatch) ไม่ต้องรู้จักทะเบียนสิทธิ์ของโมดูลไหนเลย
//   ⇒ โมดูลใหม่เสียบเข้ามาได้โดยไม่ต้องแก้แกน (บอร์ดงาน K1.15 เป็นรายที่สอง)
//
// 🔴 `can` ของแต่ละโมดูลต้องเดินผ่าน IMPLIES ชุดเดียวกับหน้าจอเสมอ ไม่งั้นคีย์ที่ถือ `account.doc.create`
//    จะอ่านเอกสารที่ตัวเองเพิ่งสร้างไม่ได้ (สิทธิ์หายเงียบ ๆ)

import type { ActorType } from "@prisma/client";
import type { MembershipCtx } from "@/lib/core/rbac";

/**
 * ใครเป็นคนสั่ง op นี้ (3 แบบ — ทางเดินโค้ดเดียวกันทั้งหมด):
 *   `apikey`    REST `/api/v1/<module>/*` (แอปภายนอกถือคีย์)
 *   `user`      คนในร้านกดยืนยันข้อเสนอของผู้ช่วย AI (สิทธิ์ = Membership ของคนกดจริง)
 *   `assistant` ผู้ช่วย AI อ่านข้อมูลเอง (อ่านอย่างเดียวเสมอ — เขียนต้องผ่าน proposal ให้คนกด)
 */
export type ApiActorKind = "apikey" | "user" | "assistant";

export type ApiActor = {
  kind: ApiActorKind;
  tenantId: string;
  /** ระบบ (AppSystem) ที่คำขอนี้ทำงานอยู่ — resolve แล้วใน require.ts */
  systemId: string;
  /** 🔴 มีเฉพาะ kind `apikey` — โค้ดที่เขียน audit/กันซ้ำห้ามสมมติว่ามีเสมอ (ใช้ actorAuditId/actorRefId) */
  keyId?: string;
  /** มีเฉพาะ kind `user` — id ของคนที่กดยืนยัน (ผู้ช่วย AI ไม่มีตัวตนของตัวเอง) */
  userId?: string | null;
  /** ชื่อผู้กระทำที่เขียนลง AuditLog ให้อ่านออกว่า "แอปไหน/ใครทำ" (คีย์ = ชื่อคีย์ที่เจ้าของร้านตั้ง) */
  keyName: string;
  scopes: string[];
  membership: MembershipCtx;
  /** โมดูลที่ actor นี้ทำงานอยู่ (`account` / `kanban`) — ใช้แยกที่มาในบันทึก/ข้อความ */
  module?: string;
  /** ตรวจสิทธิ์ตามทะเบียนสิทธิ์ของโมดูลนั้น (ผูกมาตอนสร้าง actor — แกนกลางเรียกอย่างเดียว) */
  can: (action: string) => boolean;
  /** ข้อความไทยเมื่อสิทธิ์ไม่พอ (ต่างกันตามโมดูล — "ในระบบบัญชี" / "ในบอร์ดงาน") */
  denyMessageTh?: string;
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

/** scope ของคีย์ → MembershipCtx ที่แคบที่สุด (STAFF + permission ตรงตัว ไม่มี wildcard) */
export function membershipFromScopes(scopes: string[]): MembershipCtx {
  return {
    role: "STAFF",
    unitAccess: [],
    permissions: Object.fromEntries(scopes.map((s) => [s, true])),
  };
}

/** ตรวจสิทธิ์ของ actor — ความหมายอยู่ที่ `can` ที่โมดูลผูกมา (แกนกลางไม่ตัดสินเอง) */
export function actorCan(actor: ApiActor, action: string): boolean {
  return actor.can(action);
}
