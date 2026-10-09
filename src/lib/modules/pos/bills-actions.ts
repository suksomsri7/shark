"use server";
// bills-actions.ts — server action ของหน้า "บิลวันนี้" (POS P1.16 R1–R3) · เปลือกบาง: session → ctx/actor → bills.*
//
// 🔴 ไฟล์ "use server" export ได้เฉพาะ async function — ชนิดข้อมูลอยู่ที่ bills-shared.ts (จอ client import ได้)
// 🔴 คำปฏิเสธ "คืน" เสมอ {ok:false, code, message} · ขัดข้องที่ไม่คาดคิด = UNKNOWN (จอลองซ้ำด้วยคีย์เดิม)
// 🔴 ร้าน/ผู้ใช้ (role · unitAccess · permissions) มาจาก SESSION เท่านั้น · systemId/unitId/saleId ถูกตรวจซ้ำใน bills.ts
//    (สาขานอกขอบเขต = ผลว่าง / SALE_NOT_FOUND) · ด่านสิทธิ์ชั้นแรกระดับร้าน (assertCan · fitness F6.1) — สิทธิ์ต่อสาขาตัดสินใน bills.ts
// 🔴 requireTenant: redirect ของ Next ต้องผ่านออกไปได้ (unstable_rethrow) · revalidatePath นอกคำขอ (ข้อสอบ) โยน ⇒ ครอบ try

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { assertCan, type MembershipCtx } from "@/lib/core/rbac";
import { posMembership } from "./access";
import { billDetail, billsPageData, voidSaleByActor } from "./bills";
import type { RegisterActor, RegisterCtx } from "./register-shared";
import type { BillDetailResult, BillsPageDataResult, BillsPageQuery, BillsRefusal, VoidSaleActionResult } from "./bills-shared";

type Session = Awaited<ReturnType<typeof requireTenant>>;

/** ด่านระดับร้าน: มีคีย์ใดคีย์หนึ่งใน actions (ไม่ระบุสาขา) */
function canAny(m: MembershipCtx, actions: string[]): boolean {
  for (const action of actions) {
    try {
      assertCan(m, { module: "pos", action });
      return true;
    } catch {
      /* ลองคีย์ถัดไป */
    }
  }
  return false;
}

function unexpected(where: string, e: unknown): BillsRefusal {
  console.error(`[pos/bills-actions] ${where}`, e);
  return { ok: false, code: "UNKNOWN", message: "เกิดข้อผิดพลาด — ลองอีกครั้ง" };
}

/** session → ctx + actor (systemId/unitId จากคำขอ — bills.ts ตรวจซ้ำกับ DB) */
function fromSession(auth: Session, args: unknown): { ctx: RegisterCtx; actor: RegisterActor; m: MembershipCtx } {
  const a = args && typeof args === "object" ? (args as Record<string, unknown>) : {};
  const m = posMembership(auth.active);
  return {
    ctx: { tenantId: auth.active.tenantId, systemId: typeof a.systemId === "string" ? a.systemId : "", unitId: typeof a.unitId === "string" ? a.unitId : "" },
    actor: { userId: auth.user.id, role: m.role, unitAccess: m.unitAccess, permissions: m.permissions },
    m,
  };
}

const NO_READ: BillsRefusal = { ok: false, code: "NO_PERMISSION", message: "บัญชีนี้ยังไม่มีสิทธิ์ทำรายการนี้ — ขอสิทธิ์จากเจ้าของร้านหรือผู้จัดการ" };

/** ข้อมูลทั้งหน้า (ตัวนับ · สรุป · แถวของหน้า · ช่องทาง · พนักงาน) — คำขอเดียวต่อการโหลดจอ */
export async function billsPageDataAction(args: { systemId: string } & BillsPageQuery): Promise<BillsPageDataResult> {
  try {
    const auth = await requireTenant();
    const s = fromSession(auth, args);
    if (!canAny(s.m, ["pos.sale.read", "pos.sale.create"])) return NO_READ;
    // systemId ของคำขอไปอยู่ใน ctx แล้ว — ตัวตรวจคำค้นของ bills.ts ไม่สนช่องอื่น
    return await billsPageData(s.ctx, s.actor, args);
  } catch (e) {
    unstable_rethrow(e);
    return unexpected("billsPageDataAction", e);
  }
}

/** รายละเอียดบิล (ลิ้นชักขวา) — อ่านอย่างเดียว ไม่เขียน audit */
export async function billDetailAction(args: { systemId: string; unitId: string; saleId: string }): Promise<BillDetailResult> {
  try {
    const auth = await requireTenant();
    const s = fromSession(auth, args);
    if (!canAny(s.m, ["pos.sale.read", "pos.sale.create"])) return NO_READ;
    return await billDetail(s.ctx, s.actor, { unitId: s.ctx.unitId, saleId: typeof args?.saleId === "string" ? args.saleId : "" });
  } catch (e) {
    unstable_rethrow(e);
    return unexpected("billDetailAction", e);
  }
}

/**
 * ยกเลิกบิล (ผู้มีสิทธิ์ pos.sale.void · เหตุผลบังคับ · คีย์เดิม = ผลเดิม) —
 * POS P1.15: managerPin + managerUserId = ผู้จัดการอนุญาตที่เครื่องนี้ (ผู้ขอที่มีแค่ pos.sale.create ก็ส่งได้ · มติ 11) · มีกติกา = APPROVAL_REQUIRED/PENDING_APPROVAL
 */
export async function voidSaleAction(args: {
  systemId: string;
  unitId: string;
  saleId: string;
  reason: string;
  idempotencyKey: string;
  deviceId?: string;
  managerPin?: string | null;
  managerUserId?: string | null;
}): Promise<VoidSaleActionResult> {
  try {
    const auth = await requireTenant();
    const s = fromSession(auth, args);
    const pin = typeof args?.managerPin === "string" ? args.managerPin : null;
    if (!canAny(s.m, pin !== null ? ["pos.sale.void", "pos.sale.create"] : ["pos.sale.void"])) return { ok: false, code: "NO_PERMISSION", message: "บัญชีนี้ยังไม่มีสิทธิ์ยกเลิกบิล — ขอให้เจ้าของร้านหรือผู้จัดการทำรายการ" };
    const ctx = typeof args?.deviceId === "string" ? { ...s.ctx, deviceId: args.deviceId } : s.ctx;
    const res = await voidSaleByActor(ctx, s.actor, {
      unitId: s.ctx.unitId,
      saleId: typeof args?.saleId === "string" ? args.saleId : "",
      reason: typeof args?.reason === "string" ? args.reason : "",
      idempotencyKey: typeof args?.idempotencyKey === "string" ? args.idempotencyKey : "",
      ...(pin !== null ? { managerPin: pin, managerUserId: typeof args?.managerUserId === "string" ? args.managerUserId : null } : {}),
    });
    if (res.ok) {
      try {
        revalidatePath(`/app/sys/${s.ctx.systemId}/pos`, "layout");
      } catch {
        // นอกบริบทคำขอ (ข้อสอบ/สคริปต์) — ไม่มีแคชให้ล้าง
      }
    }
    return res;
  } catch (e) {
    unstable_rethrow(e);
    return unexpected("voidSaleAction", e);
  }
}
