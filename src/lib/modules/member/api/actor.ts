// actor.ts — "คีย์ API" กลายเป็นผู้ใช้ของระบบสมาชิกได้อย่างไร (M1.11 · พิมพ์เขียว §6.3 · D18)
//
// ปัญหาเดียวกับบอร์ดงาน: ทุก service ของโมดูลนี้รับ `MemberActor` (บทบาท + ขอบเขตสาขา + คีย์สิทธิ์)
// ซึ่งมาจาก `Membership` ของคนที่ล็อกอิน — คีย์ API ไม่มี Membership เลย
//
// ทางออก: แปลง scope ของคีย์เป็น `MemberActor` ตัวหนึ่ง แล้วผูก `can()` ให้แกน REST เรียก
//   ชุดสิทธิ์ (bundle) → `apiRole` ของ `access.ts` ซึ่งเป็นตัวชี้ขาดเรื่อง **ข้อมูลอ่อนไหว**:
//     `member-read`    → READONLY  — ไม่เห็นข้อมูลอ่อนไหว **เสมอ** (§6.3) แม้นโยบายของร้านจะเปิดให้ก็ตาม
//     `member-operate` → OPERATE   — ไม่เห็นข้อมูลอ่อนไหวเสมอเช่นกัน
//     `member-admin`   → ADMIN     — เห็นได้ตามนโยบาย D8 ของร้าน (ไม่ใช่ "เห็นทุกอย่างโดยอัตโนมัติ")
//
// 🔴 บทบาท (`role`) ของคีย์ **ไม่ใช่** OWNER: บริการบางตัวถามบทบาทตรง ๆ ไม่ใช่คีย์สิทธิ์
//    (`mergeMembers` / `unlinkIdentity` = ผู้จัดการขึ้นไป · `setManualTier` = เจ้าของทำได้ทันที
//     คนอื่นเข้าสายอนุมัติ) ⇒ คีย์ชุดผู้ดูแลทำงานในระดับ **MANAGER**: ทำงานของผู้จัดการได้
//    และคำสั่งที่ร้านตั้งสายอนุมัติไว้ก็ยัง "เข้าสายอนุมัติ" เหมือนคนจริง ไม่ถูกข้ามเพราะเป็นเครื่อง
//    ส่วนชุด read/operate = STAFF (ทำได้เท่าที่ scope ติ๊กไว้เป๊ะ ๆ)
// 🔴 `unitAccess: ["*"]` — คีย์เป็นการเชื่อมต่อ "ระดับร้าน" (เจ้าของเป็นคนออกคีย์และเลือกชุดสิทธิ์เอง)
//    เหมือนกติกา D18 ของบอร์ดงานที่คีย์เห็นทุกบอร์ดของระบบที่ผูก

import { membershipFromScopes, type ApiActor } from "@/lib/api/actor";
import type { MemberActor, MemberApiRole } from "../access";
import { canReadMember, hasMemberPerm } from "../access";
import type { MemberCtx } from "../profile";

/** ข้อความไทยเมื่อคีย์ไม่มีสิทธิ์ทำ op ของระบบสมาชิก */
export const MEMBER_DENY_TH = "คีย์นี้ไม่มีสิทธิ์ทำรายการนี้ในระบบสมาชิก";

/** scope ที่ทำให้คีย์เป็น "ผู้ดูแล" (ชุด `member-admin` เท่านั้นที่ถือ) */
const ADMIN_SCOPES: readonly string[] = [
  "member.settings.manage",
  "member.privacy.manage",
  "member.api.manage",
];

/** scope ที่ถือว่า "เขียนได้" ⇒ อย่างน้อยระดับ OPERATE */
const OPERATE_SCOPES: readonly string[] = [
  "member.customer.create",
  "member.customer.update",
  "member.customer.import",
  "member.loyalty.stamp",
  "member.promo.issue",
  "member.point.adjust",
  "member.review.reply",
];

/** ชุดสิทธิ์ของคีย์ใบนี้ (§6.3) — ตัวชี้ขาดว่าเห็นข้อมูลอ่อนไหวได้ไหม */
export function memberApiRoleForScopes(scopes: readonly string[]): MemberApiRole {
  if (scopes.some((s) => ADMIN_SCOPES.includes(s))) return "ADMIN";
  if (scopes.some((s) => OPERATE_SCOPES.includes(s))) return "OPERATE";
  return "READONLY";
}

/** `MemberActor` ที่แทนคีย์ใบนี้ — ส่งต่อให้ service ของโมดูลได้ทุกตัว */
export function memberActorForKey(input: {
  keyId: string;
  scopes: readonly string[];
  createdById?: string | null;
}): MemberActor {
  const apiRole = memberApiRoleForScopes(input.scopes);
  return {
    // ไม่มีคนจริง → ใช้ผู้สร้างคีย์ถ้ารู้ (ประวัติ/ผู้ดูแลจะได้ชี้ไปที่คน) · ไม่รู้ = "" (บันทึกการดูจะข้ามไป)
    userId: input.createdById ?? "",
    role: apiRole === "ADMIN" ? "MANAGER" : "STAFF",
    unitAccess: ["*"],
    permissions: Object.fromEntries(input.scopes.map((s) => [s, true])),
    apiRole,
  };
}

/**
 * คีย์ที่ถือ scope ชุดนี้ ทำ action ของระบบสมาชิกได้ไหม
 * ความหมายเดียวกับหน้าจอ: เดินผ่าน `hasMemberPerm` ของโมดูล (ไม่ใช่ `evaluate` ของ RBAC ทั่วไป —
 * §6.1 มี 4 คีย์ที่ MANAGER ไม่ได้โดยปริยาย ดูหัวไฟล์ `access.ts`)
 * + กติกา "อ่านโดยนัย": มีคีย์ `member.*` ตัวใดก็ได้ = อ่านโมดูลได้ (`member.customer.read`)
 */
export function memberScopesCan(scopes: readonly string[], action: string): boolean {
  const actor = memberActorForKey({ keyId: "scope-check", scopes });
  if (hasMemberPerm(actor, action)) return true;
  if (action === "member.customer.read") return canReadMember(actor);
  return false;
}

/** `ApiActor` ของแกน REST ที่ผูกวิธีตรวจสิทธิ์ของระบบสมาชิกเข้าไป (`ApiModuleConfig.makeActor`) */
export function memberApiKeyActor(input: {
  tenantId: string;
  systemId: string;
  keyId: string;
  keyName: string;
  scopes: string[];
  createdById?: string | null;
}): ApiActor {
  return {
    kind: "apikey",
    module: "member",
    tenantId: input.tenantId,
    systemId: input.systemId,
    keyId: input.keyId,
    keyName: input.keyName,
    userId: input.createdById ?? null,
    scopes: input.scopes,
    membership: membershipFromScopes(input.scopes),
    can: (action) => memberScopesCan(input.scopes, action),
    denyMessageTh: MEMBER_DENY_TH,
  };
}

/**
 * `ApiActor` (แกน REST) → `MemberCtx` ที่ service ทุกตัวรับได้
 * `actorUserId` = คนที่อยู่เบื้องหลัง (ผู้สร้างคีย์ / คนกดยืนยันข้อเสนอของผู้ช่วย AI) · null = ไม่รู้ตัวคน
 */
export function memberCtxOf(actor: ApiActor): MemberCtx {
  return {
    tenantId: actor.tenantId,
    systemId: actor.systemId,
    actorUserId: actor.userId ?? null,
  };
}

/**
 * `ApiActor` → `MemberActor` ของโมดูล
 * 🔴 K3.5 (บทเรียนของบอร์ดงาน ใช้ซ้ำที่นี่): "คนกดยืนยันข้อเสนอของผู้ช่วย AI" (kind `user`)
 *    ไม่มี scope ของคีย์ — สิทธิ์ของเขาคือ Membership จริง ⇒ ต้องประกอบ actor จาก membership
 *    ไม่ใช่จาก `scopes` (ซึ่งเป็น [] เสมอ) ไม่งั้นเจ้าของร้านกดยืนยันแล้วโดนปฏิเสธเพราะ
 *    ระบบนึกว่าเขาเป็นคีย์อ่านอย่างเดียว
 */
export function memberActorOf(actor: ApiActor): MemberActor {
  if (actor.kind === "apikey") {
    return memberActorForKey({
      keyId: actor.keyId ?? "apikey",
      scopes: actor.scopes,
      createdById: actor.userId ?? null,
    });
  }
  return {
    userId: actor.userId ?? "",
    role: actor.membership.role,
    unitAccess: actor.membership.unitAccess,
    permissions: actor.membership.permissions,
  };
}
