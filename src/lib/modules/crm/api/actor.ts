// actor.ts — "คีย์ API" / "คนกดยืนยันข้อเสนอ" / "ผู้ช่วย AI" กลายเป็นผู้ใช้ของ CRM ได้อย่างไร (ใบ C1.10 · หนี้ C1.2a/C1.4/C1.7)
//
// ทุกบริการของ CRM รับ `MemberActor` (บทบาท + ขอบเขตสาขา + คีย์สิทธิ์ + `apiRole` ถ้าเป็นคีย์) — คีย์ API ไม่มี Membership
// ⇒ แปลง scope ของคีย์เป็น actor ตัวหนึ่งแบบเดียวกับ `memberActorForKey` ของระบบสมาชิก:
//   ชุดสิทธิ์ → `apiRole` READONLY / OPERATE / ADMIN · `unitAccess: ["*"]` (คีย์เป็นการเชื่อมต่อระดับร้าน)
//   · `permissions` = scope ของคีย์ **ตรงตัว** (รวม pseudo-scope ตัวกรอง `crm.filter.team:` / `crm.filter.owner:`)
// 🔴 AUDIT-CLASS X2 (C1.7): คีย์ API ไม่มี "อ่านโดยนัย" และไม่ได้สิทธิ์จากบทบาท — `crmCan` ของ access.ts เห็น `apiRole`
//    แล้วตัดสินจาก scope ล้วน ⇒ คีย์ที่ถือแค่ `crm.contact.create` อ่านผู้ติดต่อไม่ได้
// 🔴 ตัวกรองของคีย์ (R-C.3) ถูกบังคับใน `visibleWhere` (visibility.ts อ่านจาก permissions ของ actor ตัวนี้)

import { membershipFromScopes, type ApiActor } from "@/lib/api/actor";
import type { MemberActor } from "@/lib/modules/member";
import { crmCan } from "../access";
import { crmApiRoleOf } from "./serialize";

/** ข้อความไทยเมื่อคีย์/ผู้ใช้ไม่มีสิทธิ์ทำ op ของ CRM */
export const CRM_DENY_TH = "คีย์นี้ไม่มีสิทธิ์ทำรายการนี้ในระบบ CRM — ขอให้เจ้าของร้านเพิ่มสิทธิ์ให้คีย์ แล้วลองอีกครั้ง";

export type CrmApiRole = "READONLY" | "OPERATE" | "ADMIN";

/** ชุดสิทธิ์ของคีย์ใบนี้ (readonly ⊂ operate ⊂ admin) */
export function crmApiRoleForScopes(scopes: readonly string[]): CrmApiRole {
  return crmApiRoleOf(scopes);
}

/** `MemberActor` ที่แทนคีย์ใบนี้ — ส่งต่อให้บริการของ CRM ได้ทุกตัว */
export function crmActorForKey(input: { keyId: string; scopes: readonly string[]; createdById?: string | null }): MemberActor {
  const apiRole = crmApiRoleForScopes(input.scopes);
  return {
    // ไม่มีคนจริง → ผู้สร้างคีย์ (เจ้าของ/ผู้ดูแลที่ออกคีย์) เป็นเจ้าของรายการที่คีย์สร้าง · ไม่รู้ = ""
    userId: input.createdById ?? "",
    // AUDIT-CLASS X2: บทบาทไม่มีผลกับสิทธิ์ของคีย์ (crmCan ดู apiRole ก่อน) — ADMIN = MANAGER ในรูป actor เหมือนระบบสมาชิก
    role: apiRole === "ADMIN" ? "MANAGER" : "STAFF",
    unitAccess: ["*"],
    permissions: Object.fromEntries(input.scopes.map((s) => [s, true])),
    apiRole,
    keyId: input.keyId,
  };
}

/** คีย์ที่ถือ scope ชุดนี้ทำ action ของ CRM ได้ไหม (ความหมายเดียวกับบริการ — `crmCan` ของ access.ts) */
export function crmScopesCan(scopes: readonly string[], action: string): boolean {
  return crmCan(crmActorForKey({ keyId: "scope-check", scopes }), action);
}

/** `ApiActor` ของแกน REST ที่ผูกวิธีตรวจสิทธิ์ของ CRM (`ApiModuleConfig.makeActor`) */
export function crmApiKeyActor(input: { tenantId: string; systemId: string; keyId: string; keyName: string; scopes: string[]; createdById?: string | null }): ApiActor {
  return {
    kind: "apikey",
    module: "crm",
    tenantId: input.tenantId,
    systemId: input.systemId,
    keyId: input.keyId,
    keyName: input.keyName,
    userId: input.createdById ?? null,
    scopes: input.scopes,
    membership: membershipFromScopes(input.scopes),
    // AUDIT-CLASS X2: คีย์ของโมดูลอื่น/คีย์ไม่มี scope = ไม่มีคีย์ `crm.*` สักตัว ⇒ ทุก op 403
    can: (action) => crmScopesCan(input.scopes, action),
    denyMessageTh: CRM_DENY_TH,
  };
}

/** ctx ที่บริการของ CRM รับ — `actorUserId` = คนเบื้องหลัง (ผู้สร้างคีย์ / คนกดยืนยัน / คนที่ถามผู้ช่วย) */
export function crmCtxOf(actor: ApiActor): { tenantId: string; systemId: string; actorUserId: string | null } {
  return { tenantId: actor.tenantId, systemId: actor.systemId, actorUserId: actor.userId || null };
}

/**
 * `ApiActor` → `MemberActor` ของ CRM
 *   apikey    → `crmActorForKey` (scope ล้วน · apiRole)
 *   user      → Membership จริงของคนกดยืนยันข้อเสนอ (K3.5 — ไม่ใช่ scope ว่าง ๆ)
 *   assistant → Membership ของ "คนที่ถาม" (AUDIT H3 — ทีม/สาขาของเขา ไม่ใช่ `unitAccess: []`) · ด่าน scope อยู่ที่ `can`
 */
export function crmActorOf(actor: ApiActor): MemberActor {
  if (actor.kind === "apikey") {
    return crmActorForKey({ keyId: actor.keyId ?? "apikey", scopes: actor.scopes, createdById: actor.userId ?? null });
  }
  const m: MemberActor & { noSensitive?: true } = {
    userId: actor.userId ?? "",
    role: actor.membership.role,
    unitAccess: actor.membership.unitAccess,
    permissions: actor.membership.permissions,
  };
  // AUDIT-CLASS X8 (มติผู้คุมงาน C1.10 B1): ผู้ช่วย AI ไม่เห็นค่าอ่อนไหวเสมอ — ตัดสินที่ engine (privacy.evaluateSensitiveAccess)
  //   ไม่ใช่แค่รูปคำตอบ (present() ยังเป็นชั้นที่สอง)
  if (actor.kind === "assistant") m.noSensitive = true;
  return m;
}
