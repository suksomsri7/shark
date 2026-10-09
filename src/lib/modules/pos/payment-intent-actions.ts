"use server";
// payment-intent-actions.ts — server action ของใบขอรับเงิน (POS P1.7) · เปลือกบาง: session → ctx/actor → payment-intent.* → คืนผลตามเดิม
//
// 🔴 ไฟล์ "use server" export ได้เฉพาะ async function — ชนิดข้อมูลอยู่ที่ payment-intent-shared.ts (client import ได้)
// 🔴 ร้าน (tenantId) และผู้กระทำ (role · unitAccess · permissions) มาจาก membership ของ SESSION (requireTenant) เท่านั้น ·
//    systemId/unitId/deviceId จากคำขอถูกตรวจซ้ำใน payment-intent.ts (ระบบ POS ของร้าน · สาขาผูกระบบ · เข้าสาขาได้ · pos.sale.create)
// 🔴 คำปฏิเสธคืนเป็นข้อมูลเสมอ · ล้มที่ไม่คาดคิด = {ok:false, code:"INTERNAL"} (redirect/notFound ของ Next ส่งต่อด้วย unstable_rethrow)

import { unstable_rethrow } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { assertCan, canAccessUnit } from "@/lib/core/rbac";
import { posMembership } from "./access";
import { cancelPaymentIntent, confirmPaymentIntentManual, createPaymentIntent, paymentIntentStatus } from "./payment-intent";
import type {
  CreatePaymentIntentInput,
  CreatePaymentIntentResult,
  PaymentIntentActionResult,
  PaymentIntentRefusal,
  PaymentIntentStatusResult,
} from "./payment-intent-shared";

type Target = { systemId: string; unitId: string; deviceId?: string };
type Scoped = {
  ctx: { tenantId: string; systemId: string; unitId: string; deviceId?: string };
  actor: { userId: string; role: "OWNER" | "MANAGER" | "STAFF"; unitAccess: string[]; permissions: Record<string, unknown> };
};

function internal(where: string, e: unknown): PaymentIntentRefusal {
  console.error(`[pos/payment-intent-actions] ${where}`, e);
  return { ok: false, code: "INTERNAL", message: "ระบบรับเงินขัดข้องชั่วคราว — ลองอีกครั้ง" };
}

/** session → ctx/actor (ขอบเขต/สิทธิ์ตัดสินซ้ำใน payment-intent.ts จาก DB) */
async function scoped(where: string, args: unknown): Promise<Scoped | PaymentIntentRefusal> {
  let auth: Awaited<ReturnType<typeof requireTenant>>;
  try {
    auth = await requireTenant();
  } catch (e) {
    unstable_rethrow(e);
    return internal(`${where} requireTenant`, e);
  }
  const a = args && typeof args === "object" ? (args as Record<string, unknown>) : {};
  const systemId = typeof a.systemId === "string" ? a.systemId : "";
  const unitId = typeof a.unitId === "string" ? a.unitId : "";
  if (!systemId || !unitId) return { ok: false, code: "NOT_FOUND", message: "ไม่พบสาขานี้" };
  const m = posMembership(auth.active);
  // ด่านเดียวกับหน้าขาย (register-actions sessionScope): เข้าสาขาไม่ได้ = NOT_FOUND · ไม่มี pos.sale.create = PERMISSION_DENIED
  if (!canAccessUnit(m, unitId)) return { ok: false, code: "NOT_FOUND", message: "ไม่พบสาขานี้" };
  try {
    assertCan(m, { module: "pos", action: "pos.sale.create", unitId });
  } catch {
    return { ok: false, code: "PERMISSION_DENIED", message: "บัญชีนี้ยังไม่มีสิทธิ์ขาย — ขอให้เจ้าของร้านเพิ่มสิทธิ์" };
  }
  const deviceId = typeof a.deviceId === "string" ? a.deviceId : undefined;
  return {
    ctx: { tenantId: auth.active.tenantId, systemId, unitId, ...(deviceId !== undefined ? { deviceId } : {}) },
    actor: { userId: auth.user.id, role: m.role, unitAccess: m.unitAccess, permissions: m.permissions },
  };
}

/** สร้างใบขอรับเงิน (QR พร้อมเพย์ล็อกยอด / Beam / บัตร) — คีย์ = ตะกร้า + วิธี + ยอด (CD3) */
export async function createPaymentIntentAction(args: Target & { input: CreatePaymentIntentInput }): Promise<CreatePaymentIntentResult> {
  const s = await scoped("createPaymentIntentAction", args);
  if ("ok" in s) return s;
  try {
    return await createPaymentIntent(s.ctx, s.actor, args?.input);
  } catch (e) {
    return internal("createPaymentIntentAction", e);
  }
}

/** แคชเชียร์ยืนยันเองเมื่อเห็นเงินเข้า (มี audit) */
export async function confirmPaymentIntentManualAction(args: Target & { intentId: string }): Promise<PaymentIntentActionResult> {
  const s = await scoped("confirmPaymentIntentManualAction", args);
  if ("ok" in s) return s;
  try {
    return await confirmPaymentIntentManual(s.ctx, s.actor, { intentId: args?.intentId });
  } catch (e) {
    return internal("confirmPaymentIntentManualAction", e);
  }
}

/** ยกเลิกใบที่ยังไม่จ่าย (ยอดเปลี่ยน/ลูกค้าเปลี่ยนวิธีจ่าย) */
export async function cancelPaymentIntentAction(args: Target & { intentId: string }): Promise<PaymentIntentActionResult> {
  const s = await scoped("cancelPaymentIntentAction", args);
  if ("ok" in s) return s;
  try {
    return await cancelPaymentIntent(s.ctx, s.actor, { intentId: args?.intentId });
  } catch (e) {
    return internal("cancelPaymentIntentAction", e);
  }
}

/** โพลสถานะทุก 2 วินาที (PENDING → PAID / EXPIRED) */
export async function paymentIntentStatusAction(args: Target & { intentId: string }): Promise<PaymentIntentStatusResult> {
  const s = await scoped("paymentIntentStatusAction", args);
  if ("ok" in s) return s;
  try {
    return await paymentIntentStatus(s.ctx, s.actor, { intentId: args?.intentId });
  } catch (e) {
    return internal("paymentIntentStatusAction", e);
  }
}
