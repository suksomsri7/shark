// สิทธิ์หน้าจอ POS ต่อสาขา (HF-POS-PAGES · 1 ต.ค. 2026) — ฟังก์ชัน pure ไม่มี I/O (oracle เรียกตรงได้)
// 🔴 assertCan ที่ไม่ส่ง unitId = ข้ามการตรวจสาขา (rbac.ts canAccessUnit) ⇒ หน้า POS ทุกหน้าตัดสินผ่านไฟล์นี้
//    OWNER / คนที่เข้าได้ทุกสาขา (unitAccess ["*"]) เห็นเหมือนเดิมทุกอย่าง · คนจำกัดสาขาเห็นเฉพาะสาขาของตัวเอง
import type { Role } from "@prisma/client";
import { evaluate, type MembershipCtx } from "@/lib/core/rbac";

/** auth.active → MembershipCtx (รูปเดียวกับที่ไฟล์ POS เดิมแปลง) */
export function posMembership(active: { role: Role; unitAccess: unknown; permissions: unknown }): MembershipCtx {
  return {
    role: active.role,
    unitAccess: Array.isArray(active.unitAccess) ? active.unitAccess.filter((u): u is string => typeof u === "string") : [],
    permissions: active.permissions && typeof active.permissions === "object" ? (active.permissions as Record<string, unknown>) : {},
  };
}

function allBranches(m: MembershipCtx): boolean {
  return m.role === "OWNER" || m.unitAccess.includes("*");
}

/** ขอบเขตสาขาที่ดูบิล/ยอดได้ — allUnits = ไม่กรอง (เหมือนเดิม) */
export type PosUnitScope = { allUnits: true } | { allUnits: false; unitIds: string[] };

/**
 * ใครดูประวัติบิล / ปิดวัน / CSV ได้ และเห็นสาขาไหน
 * ยังไม่มีสิทธิ์อ่านแยก (pos.sale.read มาใน P1.15) ⇒ ใช้ pos.sale.create ตามกติกาเดิม "คนที่ขายได้ ปิดวัน/ดูสรุปได้"
 * null = ไม่มีสิทธิ์ที่สาขาใดเลย (หน้า → notFound)
 */
export function posSalesScope(m: MembershipCtx | null): PosUnitScope | null {
  if (!m || !evaluate(m, { module: "pos", action: "pos.sale.create" })) return null;
  if (allBranches(m)) return { allUnits: true };
  const unitIds = m.unitAccess.filter((u) => evaluate(m, { module: "pos", action: "pos.sale.create", unitId: u }));
  return unitIds.length > 0 ? { allUnits: false, unitIds } : null;
}

/** ขอบเขต → รายการ unitId สำหรับกรอง (undefined = ไม่กรอง) */
export function posScopeUnitIds(scope: PosUnitScope): string[] | undefined {
  return scope.allUnits ? undefined : scope.unitIds;
}

/**
 * ตั้งราคาขาย: ราคาเก็บที่ AccountProduct = ใช้ทั้งร้านทุกสาขา ⇒ ต้องมีสิทธิ์ pos.product.setPrice "ทุกสาขา"
 * ทุกสาขา = OWNER · unitAccess "*" · หรือเข้าได้ครบทุกสาขาที่ผูก POS นี้ (linkedUnitIds = posUnits — ไม่นับสาขา archived)
 * (ร้านสาขาเดียว / ผู้จัดการที่ระบุครบทุกสาขาตั้งได้ · คนที่ขาดแม้สาขาเดียวตั้งราคาที่สาขาอื่นใช้ด้วยไม่ได้)
 * POS ยังไม่ผูกสาขา (linkedUnitIds ว่าง) → เฉพาะ OWNER / "*"
 */
export function posCanSetTenantPrice(m: MembershipCtx | null, linkedUnitIds: string[]): boolean {
  if (!m || !evaluate(m, { module: "pos", action: "pos.product.setPrice" })) return false;
  if (allBranches(m)) return true;
  return linkedUnitIds.length > 0 && linkedUnitIds.every((u) => evaluate(m, { module: "pos", action: "pos.product.setPrice", unitId: u }));
}

/**
 * หน้าขาย: สาขาที่เปิดขายได้ + สาขาที่เลือก
 * - ไม่มีสิทธิ์ขายที่ไหนเลย → ok:false (notFound)
 * - POS ยังไม่ผูกสาขา → ok:true, active null (หน้าชวนไปเชื่อมกิจการ เหมือนเดิม)
 * - ?unit= เป็นสาขาของ POS นี้แต่ผู้ใช้เข้าไม่ได้ → ok:false (ไม่โหลดสมาชิก/สินค้าของสาขานั้น)
 * - ?unit= ค่าอื่น/ไม่ระบุ → สาขาแรกที่เข้าได้ (พฤติกรรมเดิม)
 */
export function posRegisterView<T extends { id: string }>(
  m: MembershipCtx | null,
  linked: T[],
  unitParam?: string,
): { ok: false } | { ok: true; units: T[]; active: T | null } {
  if (!m || !evaluate(m, { module: "pos", action: "pos.sale.create" })) return { ok: false };
  if (linked.length === 0) return { ok: true, units: [], active: null };
  const units = linked.filter((u) => evaluate(m, { module: "pos", action: "pos.sale.create", unitId: u.id }));
  if (units.length === 0) return { ok: false };
  if (unitParam && linked.some((u) => u.id === unitParam) && !units.some((u) => u.id === unitParam)) return { ok: false };
  return { ok: true, units, active: units.find((u) => u.id === unitParam) ?? units[0] };
}
