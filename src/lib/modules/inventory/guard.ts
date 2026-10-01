import { notFound } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { tenantDb } from "@/lib/core/db";
import { evaluate, type MembershipCtx } from "@/lib/core/rbac";
import type { Ctx } from "./service";

// HF-INV-0 (D14) — ด่านเดียวของโมดูลคลัง: "ระบบนี้เป็นระบบคลังของร้านนี้จริงไหม" + "คนนี้ดูข้อมูลคลังได้ไหม"
// 🔴 เดิม: หน้า /inventory/* ตรวจแค่ชนิดระบบ (สมาชิกทุกคนของร้านเห็นต้นทุน/ผู้ขาย/ยอด PO)
//    และ server action เชื่อ systemId จากฟอร์ม (สร้างแถวคลังใต้ระบบ POS/บัญชี หรือระบบของร้านอื่นได้)
// ไฟล์นี้ไม่ใช่ "use server" — import ได้จากหน้า/server component/server action เท่านั้น (แตะ DB · ห้าม client import)

/** สิทธิ์อ่านข้อมูลคลัง (มีอยู่แล้วใน permissions.ts — ไม่เพิ่มคีย์ใหม่) */
export const INVENTORY_READ_ACTION = "inventory.item.read";

/**
 * ดูข้อมูลคลังได้ไหม — OWNER/MANAGER ผ่าน (ตาม evaluate เดิม) · STAFF ต้องมี `inventory.item.read` หรือ `inventory.*`
 * หรือ **คีย์ inventory.<x> ตัวใดก็ได้** (สิทธิ์เขียน ⇒ อ่านได้ แบบเดียวกับ IMPLIES ของบัญชี)
 *   เหตุผล: พนักงานที่เจ้าของให้ "รับของเข้าคลัง" อย่างเดียว ต้องยังเปิดหน้าที่มีฟอร์มรับของได้ —
 *   ถ้าบังคับ item.read ตัวเดียว สิทธิ์ที่เขาใช้ทำงานอยู่จะหายเงียบ ๆ ทันทีที่ deploy
 * ⚠️ ระบบยังไม่มีคีย์แยก "ดูต้นทุน/ผู้ขาย" ⇒ กั้นทั้งหน้า (ไม่ซ่อนรายช่อง)
 */
export function inventoryCanRead(m: MembershipCtx | null): boolean {
  if (!m) return false;
  if (evaluate(m, { module: "inventory", action: INVENTORY_READ_ACTION })) return true;
  if (m.role !== "STAFF") return false;
  return Object.entries(m.permissions ?? {}).some(([k, v]) => v === true && k.startsWith("inventory."));
}

/** ระบบ INVENTORY ของร้านนี้ → Ctx · ไม่ใช่ (ระบบอื่น/ร้านอื่น/ไม่มี) → null */
export async function findInventoryCtx(tenantId: string, systemId: string): Promise<Ctx | null> {
  if (!tenantId || !systemId) return null;
  // tenantDb ใส่ tenantId ให้อีกชั้น (AppSystem = tenant-scoped) · ใส่ tenantId ใน where ด้วยให้อ่านตรงตัว
  const sys = await tenantDb({ tenantId }).appSystem.findFirst({
    where: { id: systemId, tenantId, type: "INVENTORY" },
    select: { id: true },
  });
  return sys ? { tenantId, systemId: sys.id } : null;
}

/** เหมือน findInventoryCtx แต่ไม่พบ = โยน (ใช้ใน server action แบบฟอร์มที่ไม่คืนสถานะ) */
export async function requireInventoryCtx(tenantId: string, systemId: string): Promise<Ctx> {
  const ctx = await findInventoryCtx(tenantId, systemId);
  if (!ctx) throw new Error("ไม่พบระบบสินค้า/บริการนี้ในกิจการ — รีเฟรชหน้าแล้วลองใหม่อีกครั้ง");
  return ctx;
}

/**
 * ด่านหน้าเพจคลัง (ทุกหน้าใต้ /app/sys/[id]/inventory + InvHub) — 404 ไม่ใช่ 403 (ไม่บอกว่ามีระบบนี้อยู่)
 * requireTenant → ระบบ {id, tenantId, type INVENTORY} → สิทธิ์อ่าน → ผ่านแล้วค่อยแตะข้อมูล
 */
export async function requireInventoryPage(systemId: string) {
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;
  const sys = await tenantDb({ tenantId }).appSystem.findFirst({ where: { id: systemId, tenantId, type: "INVENTORY" } });
  if (!sys) notFound();
  const m: MembershipCtx = {
    role: auth.active.role,
    unitAccess: auth.active.unitAccess as string[],
    permissions: auth.active.permissions as Record<string, unknown>,
  };
  if (!inventoryCanRead(m)) notFound();
  const ctx: Ctx = { tenantId, systemId: sys.id };
  return { auth, sys, ctx };
}
