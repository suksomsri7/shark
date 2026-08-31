import type { Role } from "@prisma/client";

// RBAC 4 มิติ: tenant → unit → module → action (ดู BLUEPRINT_BUSINESS_UNITS §3)
// จุดตรวจเดียว ใช้ทั้ง API (บังคับ) และ UI (ซ่อนเมนู)

export type AccessQuery = {
  /** โมดูล เช่น "pos", "booking", "member" */
  module: string;
  /** action แบบเต็ม `<module>.<entity>.<action>` เช่น "pos.sale.void" */
  action: string;
  /** unit ที่กระทำ — ต้องระบุเมื่อเป็น unit-scoped module */
  unitId?: string;
};

export type MembershipCtx = {
  role: Role;
  unitAccess: string[]; // ["*"] | ["unitId1", ...]
  permissions: Record<string, unknown>; // { "pos.sale.void": true, "_maxDiscountBp": 500 }
};

/** เข้าถึง unit นี้ได้ไหม (มิติที่ 2) */
export function canAccessUnit(m: MembershipCtx, unitId?: string): boolean {
  if (m.role === "OWNER") return true;
  if (!unitId) return true; // tenant-level action ไม่ผูก unit
  return m.unitAccess.includes("*") || m.unitAccess.includes(unitId);
}

/**
 * ตรวจสิทธิ์แบบ pure (testable) — ไม่มี I/O
 * OWNER = ทุกอย่าง · MANAGER = เต็มสิทธิ์ในหน่วยที่เข้าถึงได้ · STAFF = ตาม permissions
 */
export function evaluate(m: MembershipCtx | null, q: AccessQuery): boolean {
  if (!m) return false;
  if (m.role === "OWNER") return true;
  if (!canAccessUnit(m, q.unitId)) return false;
  if (m.role === "MANAGER") return true; // เต็มสิทธิ์ในหน่วยที่คุม
  // STAFF: อนุญาตเมื่อระบุ action ตรง หรือ wildcard ระดับโมดูล `<module>.*`
  const p = m.permissions;
  return p[q.action] === true || p[`${q.module}.*`] === true;
}

/**
 * สิทธิ์ดู "ข้อมูลอ่อนไหว" (เงินเดือน/เลขบัตร ปชช. ในระบบ HR) — แคบกว่า evaluate ปกติโดยตั้งใจ
 * PDPA: MANAGER ที่เต็มสิทธิ์ทั่วไปก็ไม่เห็นเงินเดือนคนอื่น เว้นได้รับ permission ชัดเจน
 * นโยบาย fail-closed: เห็นได้เฉพาะ OWNER หรือผู้มี permission `hr.payroll.read` เท่านั้น
 */
export function canViewPayroll(m: MembershipCtx | null): boolean {
  if (!m) return false;
  if (m.role === "OWNER") return true;
  return m.permissions["hr.payroll.read"] === true;
}

/**
 * กรอง unitId ให้เหลือเฉพาะที่ membership เข้าถึงได้ (ใช้ในหน้ารวมข้ามสาขา เช่น ปฏิทิน)
 * OWNER / unitAccess=["*"] → เห็นทุกสาขา · อื่น ๆ → เฉพาะสาขาที่อยู่ใน unitAccess
 */
export function filterAccessibleUnitIds(m: MembershipCtx | null, unitIds: string[]): string[] {
  if (!m) return [];
  if (m.role === "OWNER" || m.unitAccess.includes("*")) return unitIds;
  return unitIds.filter((id) => m.unitAccess.includes(id));
}

/** ค่าพารามิเตอร์เชิงตัวเลขของสิทธิ์ เช่น เพดานส่วนลด (basis points) */
export function permissionValue(m: MembershipCtx | null, key: string): number | undefined {
  const v = m?.permissions[key];
  return typeof v === "number" ? v : undefined;
}

// ─────────────────────────────────────────────────────────────────────────────
// การให้สิทธิ์ต่อ (WO-CW2) — ใช้โดย src/lib/staff/service.ts เท่านั้น
// 🔴 ทุกฟังก์ชันในบล็อกนี้เป็นการ **เพิ่ม** ล้วน ไม่แตะพฤติกรรมของ evaluate() เดิม
//    (ทั้งระบบพึ่ง evaluate อยู่ — เปลี่ยนที่นี่ = เปลี่ยนสิทธิ์ทุกโมดูลพร้อมกัน)
//
// หลักการ: "ห้ามให้สิ่งที่ตัวเองไม่มี" — ไม่งั้นคนที่ตั้งสิทธิ์ได้คนเดียว จะยกระดับตัวเอง
// ผ่านการตั้งสิทธิ์ให้บัญชีอื่นที่ตัวเองคุมได้ (privilege escalation)
// ─────────────────────────────────────────────────────────────────────────────

/** ลำดับอำนาจของบทบาท — เลขน้อย = มีอำนาจมากกว่า */
export const ROLE_RANK: Record<Role, number> = { OWNER: 0, MANAGER: 1, STAFF: 2 };

/** ตั้งบทบาทนี้ให้คนอื่นได้ไหม — ให้ได้เฉพาะบทบาทที่ "ไม่สูงกว่าตัวเอง" (MANAGER ตั้ง OWNER ไม่ได้) */
export function canAssignRole(actorRole: Role, targetRole: Role): boolean {
  return ROLE_RANK[actorRole] <= ROLE_RANK[targetRole];
}

/**
 * ให้สิทธิ์เข้าถึงสาขาชุดนี้ได้ไหม — ให้ได้เฉพาะสาขาที่ตัวเองเข้าถึง
 * `["*"]` (ทุกสาขา) ให้ได้เฉพาะคนที่เองก็เป็น `["*"]` หรือ OWNER
 */
export function canGrantUnitAccess(actor: MembershipCtx | null, unitIds: string[]): boolean {
  if (!actor) return false;
  if (actor.role === "OWNER" || actor.unitAccess.includes("*")) return true;
  return unitIds.every((u) => u !== "*" && actor.unitAccess.includes(u));
}

/**
 * แจก permission ข้อนี้ให้คนอื่นได้ไหม — ต้องเป็นสิทธิ์ที่ "ตัวเองใช้ได้จริง" ตาม evaluate เดิม
 * (ตัดสินระดับ tenant: ไม่ผูก unit เพราะสิทธิ์ที่แจกยังไม่ผูกสาขาจนกว่าจะรวมกับ unitAccess)
 */
export function canGrantPermission(actor: MembershipCtx | null, module: string, action: string): boolean {
  return evaluate(actor, { module, action });
}

/**
 * แจก "ค่าตัวเลขของสิทธิ์" (เช่นวงเงินอนุมัติ) ได้ไหม — ให้ได้ไม่เกินเพดานของตัวเอง
 * ⚠️ ตีความให้ตรงกับจุดบังคับใช้จริง (account/expense-actions.ts): ไม่มีค่า = ไม่จำกัด
 *    ⇒ คนที่ไม่มีเพดานอยู่แล้ว แจกเพดานเท่าไรก็ไม่ถือว่ายกระดับ (ตัวเองก็ไม่จำกัดอยู่แล้ว)
 */
export function canGrantPermissionValue(
  actor: MembershipCtx | null,
  key: string,
  value: number,
): boolean {
  if (!actor) return false;
  if (actor.role === "OWNER" || actor.role === "MANAGER") return true;
  const own = permissionValue(actor, key);
  return own === undefined || value <= own;
}

export class ForbiddenError extends Error {
  constructor(q: AccessQuery) {
    super(`ไม่มีสิทธิ์: ${q.action}${q.unitId ? ` @${q.unitId}` : ""}`);
    this.name = "ForbiddenError";
  }
}

/** ใช้ใน handler: โยน 403 (หรือ 404 ที่ชั้นบน) เมื่อไม่ผ่าน */
export function assertCan(m: MembershipCtx | null, q: AccessQuery): void {
  if (!evaluate(m, q)) throw new ForbiddenError(q);
}
