// access.ts — สิทธิ์ของ "ระบบสมาชิก v2" (M1.3 · พิมพ์เขียว docs/modules/06-member-v2.md §6)
//
// 🔴 ไฟล์นี้ **บริสุทธิ์**: ไม่แตะ prisma ไม่แตะ session — รับข้อมูลเข้ามาแล้วตัดสิน
//    (ทดสอบได้ตรง ๆ · import ได้จาก client component เพราะไม่ลากตัวเชื่อมฐานข้อมูลกลางหรือแพ็กเกจ Next.js มาด้วย)
// 🔴 กติกา 404-not-403 (§6.4): "มองไม่เห็น/ทำไม่ได้" ของหน้าตั้งค่า = `notFound()` ที่ผู้เรียก ไม่ใช่หน้า 403
//
// ⚠️ ทำไมไม่ใช้ `assertCan()`/`evaluate()` ของ `core/rbac.ts` ตรง ๆ สำหรับ "ตั้งค่าระบบสมาชิก":
//    `evaluate()` ให้ MANAGER ผ่าน **ทุก action** ในหน่วยที่คุมเสมอ (rbac.ts: `if (m.role === "MANAGER") return true`)
//    แต่พิมพ์เขียว §6.1 กำหนดชัดว่า MANAGER ได้สิทธิ์ทุกคีย์ "ยกเว้น settings/privacy/api/giftcard.manage"
//    (4 คีย์นี้ต้องได้รับมอบสิทธิ์เจาะจงแม้เป็น MANAGER) — `permissions.ts` ไม่มีทะเบียน "ค่าปริยายต่อบทบาท"
//    ให้ override ต่อคีย์ได้ ⇒ ตัดสินใจ (Fable/builder M1.3): ทำกติกานี้เป็นฟังก์ชันของไฟล์นี้แทน
//    (ดู wo-notes/member-M1.3.md หัวข้อ "ข้อตัดสิน" — มีหลักฐานอ้างบรรทัดของ rbac.ts)

import type { Role } from "@prisma/client";

/**
 * บทบาทของ actor ในโมดูลสมาชิก
 * 🔴 `CUSTOMER` ไม่ใช่ค่าใน enum `Role` ของ Prisma (ลูกค้าไม่มี Membership) — เป็นบทบาทของ
 *    "ตัวลูกค้าเอง" ที่เข้าผ่าน session ลูกค้า (`platform_auth`) ที่หน้า `/m/*` (D4 · §6.2)
 *    ⇒ ประกาศเป็นสหภาพชนิดที่นี่ที่เดียว แล้วทุกฟังก์ชันตรวจด้วยค่าเดียวกันหมด
 */
export type MemberActorRole = Role | "CUSTOMER";

/**
 * สิทธิ์ของ "คีย์ API" (M1.11 · §6.3) — รับทั้งตัวพิมพ์เล็ก/ใหญ่เพราะคนละทางเข้าสะกดคนละแบบ
 * (bundle ใน DB เป็นตัวพิมพ์เล็ก · เอกสาร/ข้อสอบเขียนตัวพิมพ์ใหญ่) ⇒ เทียบด้วย `apiRoleOf()` เสมอ
 */
export type MemberApiRole = "readonly" | "operate" | "admin" | "READONLY" | "OPERATE" | "ADMIN";

/** actor ของโมดูลสมาชิก — ใช้แทน MembershipCtx ได้ตรง ๆ (มีครบทุกฟิลด์ที่ evaluate() ต้องการ) */
export type MemberActor = {
  userId: string;
  role: MemberActorRole;
  /** BusinessUnit.id ที่ผู้ใช้ดูแล (["*"] หรือ [] = ทุกสาขา สำหรับ OWNER) */
  unitAccess: string[];
  permissions: Record<string, unknown>;
  /**
   * M1.11/D18 — actor นี้คือ "คีย์ API" ไม่ใช่คน (ยังไม่มีจนกว่า M1.11 จะออกคีย์จริง)
   * ประกาศไว้ล่วงหน้าตามสัญญา §6.1 "ฝั่ง API: bundle readonly/operate ไม่เห็นอ่อนไหวเสมอ"
   */
  apiRole?: MemberApiRole;
  /** actor เป็น "ตัวลูกค้าเอง" (role CUSTOMER) — id ของสมาชิกที่ล็อกอินอยู่ */
  customerId?: string;
};

/** สิทธิ์คีย์ API แบบตัวพิมพ์ใหญ่ (ไม่มีคีย์ = null = คนจริงที่ล็อกอินหน้าจอ) */
export function apiRoleOf(actor: MemberActor): "READONLY" | "OPERATE" | "ADMIN" | null {
  if (!actor.apiRole) return null;
  return actor.apiRole.toUpperCase() as "READONLY" | "OPERATE" | "ADMIN";
}

/**
 * unitAccess ครอบสาขานี้ไหม (§6.1 unit scope)
 * `["*"]` หรือรายการว่าง = ทั้งร้าน (OWNER/พนักงานที่เจ้าของไม่ได้จำกัดสาขา) · `null` = สมาชิกไม่มีสาขาหลัก
 */
export function coversUnit(actor: MemberActor, unitId: string | null | undefined): boolean {
  if (actor.role === "OWNER") return true;
  if (actor.unitAccess.length === 0 || actor.unitAccess.includes("*")) return true;
  return !!unitId && actor.unitAccess.includes(unitId);
}

/** actor ถูกจำกัดสาขาไหม (false = เห็นทั้งร้าน จึงข้ามการค้นกิจกรรมข้ามสาขาได้) */
export function isUnitScoped(actor: MemberActor): boolean {
  if (actor.role === "OWNER") return false;
  return actor.unitAccess.length > 0 && !actor.unitAccess.includes("*");
}

/** ประกอบ actor จากแถว Membership (ที่ไหนก็ได้ที่มี membership อยู่แล้ว — หน้า/action/service) */
export function toMemberActor(userId: string, membership: { role: Role; unitAccess: unknown; permissions: unknown }): MemberActor {
  return {
    userId,
    role: membership.role,
    unitAccess: Array.isArray(membership.unitAccess) ? (membership.unitAccess as string[]) : [],
    permissions: (membership.permissions ?? {}) as Record<string, unknown>,
  };
}

/** คีย์ `member.*` ตัวใดตัวหนึ่งเป็น true ไหม (รวม wildcard `member.*`) — ใช้ตัดสิน "อ่านโมดูลได้โดยนัย" */
function hasAnyMemberPermission(actor: MemberActor): boolean {
  if (actor.permissions["member.*"] === true) return true;
  return Object.entries(actor.permissions).some(([k, v]) => v === true && k.startsWith("member.") && k !== "member.*");
}

/**
 * เข้าโมดูลสมาชิกได้ไหม (ขั้นต่ำ = อ่านได้) — OWNER/MANAGER ผ่านเสมอ
 * STAFF: "read-โดยนัย" (บทเรียน K3.1 ของบอร์ดงาน) — มีคีย์ `member.*` ตัวใดก็ได้ = อ่านได้
 * (ไม่บังคับต้องมี `member.customer.read` เป๊ะ ๆ — พนักงานที่ได้แค่ `member.loyalty.stamp` ต้องเปิดหน้าสมาชิกได้
 *  เพื่อค้นหาคนมาประทับสแตมป์ ไม่งั้นได้ 403/404 ทั้งที่เจ้าของตั้งใจให้ทำงานนี้)
 */
export function canReadMember(actor: MemberActor): boolean {
  if (actor.apiRole) return true;
  if (actor.role === "CUSTOMER") return !!actor.customerId;
  if (actor.role === "OWNER" || actor.role === "MANAGER") return true;
  return hasAnyMemberPermission(actor);
}

/** คีย์ 4 ตัวที่ MANAGER **ไม่ได้** โดยปริยาย (§6.1) — ต้องได้รับมอบสิทธิ์เจาะจงแม้เป็น MANAGER */
const MANAGER_EXCLUDED_KEYS = new Set<string>([
  "member.settings.manage",
  "member.privacy.manage",
  "member.api.manage",
  "member.giftcard.manage",
]);

/**
 * มีคีย์ `key` ไหม (§6.1: OWNER ผ่านทุกอย่าง · MANAGER ผ่านทุกคีย์ยกเว้น 4 ตัวข้างบน (ต้องมีคีย์ชัดเจน) ·
 * STAFF ต้องมีคีย์ชัดเจนเสมอ) — ตัวช่วยกลางที่ WO ถัดไป (M1.4 เป็นต้นไป) เรียกใช้แทนการยิง `assertCan` ตรง ๆ
 * เมื่อ action นั้นเป็นหนึ่งใน 4 คีย์ยกเว้น หรือกฎอื่นที่ไม่ตรงกับ MANAGER-ผ่านทุกอย่างของ RBAC ทั่วไป
 */
export function hasMemberPerm(actor: MemberActor, key: string): boolean {
  // ลูกค้าที่ล็อกอินหน้า `/m/*` ไม่มีคีย์สิทธิ์ของพนักงานเลย (แก้ได้เฉพาะฟิลด์ customerEditable ของตัวเอง)
  if (actor.role === "CUSTOMER") return false;
  if (actor.role === "OWNER") return true;
  if (actor.role === "MANAGER" && !MANAGER_EXCLUDED_KEYS.has(key)) return true;
  return actor.permissions[key] === true || actor.permissions["member.*"] === true;
}

/**
 * ตั้งค่าระบบสมาชิกได้ไหม (ตัวออกแบบฟิลด์ · ระดับ · แต้ม · ฯลฯ) — ต้องมีคีย์ `member.settings.manage`
 * OWNER ผ่านเสมอ · **MANAGER ไม่ผ่านโดยปริยาย** (ต่างจาก action อื่นของโมดูลนี้ — ดูหมายเหตุหัวไฟล์)
 */
export function canManageSettings(actor: MemberActor): boolean {
  return hasMemberPerm(actor, "member.settings.manage");
}

/**
 * จัดการความเป็นส่วนตัว/PDPA ได้ไหม (M1.7 · §6.1) — ต้องมีคีย์ `member.privacy.manage`
 * OWNER ผ่านเสมอ · **MANAGER ไม่ผ่านโดยปริยาย** (เป็น 1 ใน 4 คีย์ยกเว้น — ดู MANAGER_EXCLUDED_KEYS)
 * ครอบคลุม: นโยบายเวอร์ชัน · ใครดูข้อมูลอ่อนไหวได้ · บันทึกการดู · คำขอส่งออกข้อมูล · ลบอัตโนมัติ
 * 🔴 "ลบข้อมูลสมาชิก" ใช้คีย์แยก `member.customer.delete` (ทำลายข้อมูลถาวร — ดู privacy.requestErase)
 */
export function canManagePrivacy(actor: MemberActor): boolean {
  return hasMemberPerm(actor, "member.privacy.manage");
}
