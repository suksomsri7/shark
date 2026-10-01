"use server";
// register-actions.ts — server action ของหน้าขายใหม่ (POS P1.3) · เปลือกบาง: session → ctx/actor → register.* → คืนผลตามเดิม
//
// 🔴 ไฟล์ "use server" export ได้เฉพาะ async function (สเปก G10 — export ชนิด/ค่าคงที่ = หน้าพังตอนรันทั้งที่ tsc ผ่าน)
//    ชนิดข้อมูลทั้งหมดอยู่ที่ register-shared.ts (client import ได้)
// 🔴 คำปฏิเสธ "คืน" เสมอ {ok:false, code, message} — Next ปิดข้อความของ error ที่โยนออกจาก action ใน production
//    ขัดข้องที่ไม่คาดคิด = {ok:false, code:"UNKNOWN"} (สเปก §3.1) · ⚠️ ที่ submit: UNKNOWN/INTERNAL/BUSY = "ยังไม่แน่ใจว่าบันทึกแล้ว"
//    จอต้องลองซ้ำด้วยคีย์+payload เดิม (สเปก §3.4 ข้อ 6) ไม่ใช่ออกคีย์ใหม่
// 🔴 ร้าน (tenantId) และผู้ขาย (role · unitAccess · permissions) มาจาก membership ของ SESSION (requireTenant) เท่านั้น —
//    ไม่เชื่อค่าจากคำขอ · systemId/unitId จากคำขอถูกตรวจซ้ำใน register.ts (ระบบ POS ของร้านนี้ · สาขาผูกระบบ · เข้าสาขาได้)
// 🔴 requireTenant อยู่นอก try โดยตั้งใจ — redirect ไปหน้า login/onboarding ของ Next ต้องผ่านออกไปได้ (ไม่ถูกกลืนเป็น UNKNOWN)

import { revalidatePath } from "next/cache";
import { requireTenant } from "@/lib/core/context";
import { assertCan, canAccessUnit } from "@/lib/core/rbac";
import { posMembership } from "./access";
import { registerCatalog, quoteRegisterCart, submitRegisterSale, registerStatus } from "./register";
import type {
  RegisterActor,
  RegisterCatalogInput,
  RegisterCatalogResult,
  RegisterCtx,
  RegisterQuoteInput,
  RegisterQuoteResult,
  RegisterRefusal,
  RegisterStatusResult,
  RegisterSubmitInput,
  RegisterSubmitResult,
} from "./register-shared";

type Session = Awaited<ReturnType<typeof requireTenant>>;
type Target = { systemId: string; unitId: string };

function refusal(code: RegisterRefusal["code"], message: string): RegisterRefusal {
  return { ok: false, code, message };
}

/**
 * session → ขอบเขต + ผู้ขาย · ด่านเดียวกับหน้า (posRegisterView): เข้าสาขาไม่ได้ = NOT_FOUND (404 ไม่ใช่ 403 · มติ R8) ·
 * ไม่มี pos.sale.create ที่สาขานี้ = PERMISSION_DENIED — register.ts ตรวจซ้ำอีกชั้นพร้อมขอบเขตระบบ/สาขาจาก DB
 */
function sessionScope(auth: Session, args: unknown): { ctx: RegisterCtx; actor: RegisterActor } | RegisterRefusal {
  const a = args && typeof args === "object" ? (args as Record<string, unknown>) : {};
  const systemId = typeof a.systemId === "string" ? a.systemId : "";
  const unitId = typeof a.unitId === "string" ? a.unitId : "";
  if (!systemId || !unitId) return refusal("NOT_FOUND", "ไม่พบสาขานี้");
  const m = posMembership(auth.active);
  if (!canAccessUnit(m, unitId)) return refusal("NOT_FOUND", "ไม่พบสาขานี้");
  try {
    assertCan(m, { module: "pos", action: "pos.sale.create", unitId });
  } catch {
    return refusal("PERMISSION_DENIED", "บัญชีนี้ยังไม่มีสิทธิ์ขาย — ขอให้เจ้าของร้านเพิ่มสิทธิ์");
  }
  return { ctx: { tenantId: auth.active.tenantId, systemId, unitId }, actor: { userId: auth.user.id, role: m.role, unitAccess: m.unitAccess, permissions: m.permissions } };
}

function unexpected(where: string, e: unknown): RegisterRefusal {
  console.error(`[pos/register-actions] ${where}`, e);
  return refusal("UNKNOWN", "เกิดข้อผิดพลาด — ลองอีกครั้ง");
}

/** กริด/หมวด/ค้นหา (แบ่งหน้า) */
export async function registerCatalogAction(args: Target & RegisterCatalogInput): Promise<RegisterCatalogResult> {
  const auth = await requireTenant();
  try {
    const s = sessionScope(auth, args);
    if ("ok" in s) return s;
    const input: RegisterCatalogInput = {};
    if (args.q !== undefined) input.q = args.q;
    if (args.categoryId !== undefined) input.categoryId = args.categoryId;
    if (args.cursor !== undefined) input.cursor = args.cursor;
    if (args.limit !== undefined) input.limit = args.limit;
    return await registerCatalog(s.ctx, s.actor, input);
  } catch (e) {
    return unexpected("registerCatalogAction", e);
  }
}

/** ยอดบนจอจากราคาฝั่งเซิร์ฟเวอร์ — `cart` = ผลของ cartToQuoteInput (register-shared) */
export async function quoteRegisterCartAction(args: Target & { cart: RegisterQuoteInput }): Promise<RegisterQuoteResult> {
  const auth = await requireTenant();
  try {
    const s = sessionScope(auth, args);
    if ("ok" in s) return s;
    return await quoteRegisterCart(s.ctx, s.actor, args.cart);
  } catch (e) {
    return unexpected("quoteRegisterCartAction", e);
  }
}

/** ส่งบิล — `sale` = ผลของ cartToSubmitInput (เก็บไว้ส่งตัวเดิมทุกครั้งที่ลองซ้ำ) */
export async function submitRegisterSaleAction(args: Target & { sale: RegisterSubmitInput }): Promise<RegisterSubmitResult> {
  const auth = await requireTenant();
  try {
    const s = sessionScope(auth, args);
    if ("ok" in s) return s;
    const r = await submitRegisterSale(s.ctx, s.actor, args.sale);
    if (r.ok) {
      // ประวัติบิล/ภาพรวมระบบเห็นบิลใหม่ — ไม่ revalidate หน้าขายเอง (สถานะตะกร้าอยู่ฝั่ง client)
      // บิลบันทึกแล้ว: revalidate ล้มต้องไม่ทำให้คำตอบกลายเป็น "ไม่แน่ใจ"
      try {
        revalidatePath(`/app/sys/${s.ctx.systemId}/pos/sales`);
        revalidatePath(`/app/sys/${s.ctx.systemId}`);
      } catch (e) {
        console.error("[pos/register-actions] revalidatePath", e);
      }
    }
    return r;
  } catch (e) {
    return unexpected("submitRegisterSaleAction", e);
  }
}

/** แถบสถานะ (สาขา · ผู้ขาย · รอตัดสต็อก) */
export async function registerStatusAction(args: Target): Promise<RegisterStatusResult> {
  const auth = await requireTenant();
  try {
    const s = sessionScope(auth, args);
    if ("ok" in s) return s;
    return await registerStatus(s.ctx, s.actor);
  } catch (e) {
    return unexpected("registerStatusAction", e);
  }
}
