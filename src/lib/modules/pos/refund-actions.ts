"use server";
// refund-actions.ts — server action ของการคืนเงิน (POS P1.8 R9) · เปลือกบาง: session → ctx/actor → refund.* → คืนผลตามเดิม
//
// 🔴 ไฟล์ "use server" export ได้เฉพาะ async function — ชนิดข้อมูลทั้งหมดอยู่ที่ refund-shared.ts (จอ client import ได้)
// 🔴 คำปฏิเสธ "คืน" เสมอ {ok:false, code, message} (Next ปิดข้อความของ error ที่หลุดจาก action ใน production) ·
//    ขัดข้องที่ไม่คาดคิด = {ok:false, code:"UNKNOWN"} — จอลองซ้ำด้วยคีย์ + payload เดิม (idempotent) ไม่ใช่ออกคีย์ใหม่
// 🔴 ร้าน/ผู้ทำรายการ (role · unitAccess · permissions) มาจาก membership ของ SESSION เท่านั้น · systemId/unitId จากคำขอถูกตรวจซ้ำใน refund.ts
//    สิทธิ์คืนเงิน (pos.sale.refund) ตัดสินใน refund.ts ที่เดียว
// 🔴 requireTenant: redirect ของ Next ต้องผ่านออกไปได้ (unstable_rethrow)

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { assertCan, canAccessUnit } from "@/lib/core/rbac";
import { posMembership } from "./access";
import { refundSale, saleForRefund } from "./refund";
import type { RegisterActor, RegisterCtx } from "./register-shared";
import type { RefundRefusal, RefundSaleInput, RefundSaleResult, SaleForRefundResult } from "./refund-shared";
import { requestDevice, type DeviceNotPaired, type DeviceRevokedRefusal } from "./device-request"; // POS P5.2 ▸ CD-P52-O4 F1/F4 ◂

type Session = Awaited<ReturnType<typeof requireTenant>>;
type Target = { systemId: string; unitId: string; deviceId?: string };

function refusal(code: RefundRefusal["code"], message: string): RefundRefusal {
  return { ok: false, code, message };
}

function unexpected(where: string, e: unknown): RefundRefusal {
  console.error(`[pos/refund-actions] ${where}`, e);
  return refusal("UNKNOWN", "เกิดข้อผิดพลาด — ลองอีกครั้ง");
}

/**
 * session → ขอบเขต + ผู้ทำรายการ · เข้าสาขาไม่ได้ = SALE_NOT_FOUND (ไม่บอกว่ามีบิลอยู่) ·
 * ด่านสิทธิ์ชั้นแรก (fitness F6.1): ต้องมีอย่างน้อยหนึ่งคีย์ใน `actions` ที่สาขานี้ — refund.ts ตรวจซ้ำพร้อมขอบเขตจาก DB
 */
function sessionScope(auth: Session, args: unknown, actions: string[]): { ctx: RegisterCtx; actor: RegisterActor } | RefundRefusal {
  const a = args && typeof args === "object" ? (args as Record<string, unknown>) : {};
  const systemId = typeof a.systemId === "string" ? a.systemId : "";
  const unitId = typeof a.unitId === "string" ? a.unitId : "";
  if (!systemId || !unitId) return refusal("SALE_NOT_FOUND", "ไม่พบบิลนี้ในสาขานี้");
  const m = posMembership(auth.active);
  if (!canAccessUnit(m, unitId)) return refusal("SALE_NOT_FOUND", "ไม่พบบิลนี้ในสาขานี้");
  const allowed = actions.some((action) => {
    try {
      assertCan(m, { module: "pos", action, unitId });
      return true;
    } catch {
      return false;
    }
  });
  if (!allowed) return refusal("NO_PERMISSION", "บัญชีนี้ยังไม่มีสิทธิ์คืนเงิน — ขอให้เจ้าของร้านหรือผู้จัดการทำรายการ");
  // POS P5.2 ▸ CD-P52-O4 F1/F4: deviceId ของ client ไม่เข้า ctx — refundSaleAction ใส่เครื่องจากคุกกี้ (device-request.ts โหมด strip) ◂
  return {
    ctx: { tenantId: auth.active.tenantId, systemId, unitId },
    actor: { userId: auth.user.id, role: m.role, unitAccess: m.unitAccess, permissions: m.permissions },
  };
}

async function session(where: string): Promise<Session | RefundRefusal> {
  try {
    return await requireTenant();
  } catch (e) {
    unstable_rethrow(e);
    return unexpected(`${where} requireTenant`, e);
  }
}

/** คืนเงิน (ใบคืนใหม่) — `refund` = RefundSaleInput (เก็บไว้ส่งตัวเดิมทุกครั้งที่ลองซ้ำ) */
export async function refundSaleAction(args: Target & { refund: RefundSaleInput }): Promise<RefundSaleResult | DeviceNotPaired | DeviceRevokedRefusal> { // POS P5.2 ▸ + DeviceRevoked (strip ไม่คืน NotPaired — ชนิดร่วม) ◂
  const auth = await session("refundSaleAction");
  if ("ok" in auth) return auth;
  try {
    // POS P1.15 ▸ มติ 11: managerPin = ผู้จัดการอนุญาตที่เครื่องนี้ — ผู้ขอที่มีแค่ pos.sale.create ส่งได้ (refund.ts ตรวจ PIN + สิทธิ์ของผู้จัดการ) ◂
    const withPin = !!args?.refund && typeof args.refund === "object" && typeof (args.refund as { managerPin?: unknown }).managerPin === "string";
    const s0 = sessionScope(auth, args, withPin ? ["pos.sale.refund", "pos.sale.create"] : ["pos.sale.refund"]);
    if ("ok" in s0) return s0;
    // POS P5.2 ▸ CD-P52-O4 F1/F4: กะ/โทเคนผู้ขาย/PIN ของการคืน = เครื่องของคุกกี้ (เดียวกับป้ายกะของหน้าบิล currentShiftAction) · refund.deviceId ของ client ถูกทิ้ง ·
    //   ไม่มีคุกกี้ = คืนนอกกะ (กติกาเดิมเมื่อไม่ส่งเครื่อง) · คุกกี้ของเครื่องที่ถูกเพิกถอน = DEVICE_REVOKED ◂
    const d = await requestDevice({ tenantId: s0.ctx.tenantId, unitId: s0.ctx.unitId }, "strip");
    if (!d.ok) return d;
    const s = { ctx: { ...s0.ctx, ...(d.deviceId ? { deviceId: d.deviceId } : {}) }, actor: s0.actor };
    const refundIn = args?.refund && typeof args.refund === "object" ? ({ ...args.refund, deviceId: undefined } as RefundSaleInput) : args?.refund;
    const res = await refundSale(s.ctx, s.actor, refundIn);
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
    return unexpected("refundSaleAction", e);
  }
}

/** ข้อมูลบิลสำหรับจอคืนเงิน (จำนวนที่ยังคืนได้ · ใบคืนเดิม · แต้ม · เลขเอกสารบัญชี) */
export async function saleForRefundAction(args: Target & { saleId: string }): Promise<SaleForRefundResult> {
  const auth = await session("saleForRefundAction");
  if ("ok" in auth) return auth;
  try {
    const s = sessionScope(auth, args, ["pos.sale.refund", "pos.sale.create"]);
    if ("ok" in s) return s;
    return await saleForRefund(s.ctx, s.actor, { saleId: args.saleId });
  } catch (e) {
    unstable_rethrow(e);
    return unexpected("saleForRefundAction", e);
  }
}
