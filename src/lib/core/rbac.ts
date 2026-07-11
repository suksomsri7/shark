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

/** ค่าพารามิเตอร์เชิงตัวเลขของสิทธิ์ เช่น เพดานส่วนลด (basis points) */
export function permissionValue(m: MembershipCtx | null, key: string): number | undefined {
  const v = m?.permissions[key];
  return typeof v === "number" ? v : undefined;
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
