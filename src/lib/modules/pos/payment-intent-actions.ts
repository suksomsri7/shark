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
import { bindCtxDevice, cookieDeviceId, type DeviceBindRefusal } from "./device-request"; // POS P5.2 ▸ CD-P52-O4b ◂
import { cancelPaymentIntent, confirmPaymentIntentManual, createPaymentIntent, paymentIntentStatus } from "./payment-intent";
import { updatePosIntentSettings } from "./payment-settings";
import type {
  CreatePaymentIntentInput,
  CreatePaymentIntentResult,
  PaymentIntentActionResult,
  PaymentIntentRefusal,
  PaymentIntentStatusResult,
  PosIntentSettingsPatch,
  PosIntentSettingsResult,
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
  const deviceId = await cookieDeviceId({ tenantId: auth.active.tenantId, unitId: unitId }); // POS P5.2 ▸ CD-P52-O4b: เครื่อง = คุกกี้ลงนามเท่านั้น (device-request.ts) · deviceId ของ client ถูกทิ้ง ◂
  return {
    ctx: { tenantId: auth.active.tenantId, systemId, unitId, ...(deviceId !== undefined ? { deviceId } : {}) },
    actor: { userId: auth.user.id, role: m.role, unitAccess: m.unitAccess, permissions: m.permissions },
  };
}

/** สร้างใบขอรับเงิน (QR พร้อมเพย์ล็อกยอด / Beam / บัตร) — คีย์ = ตะกร้า + วิธี + ยอด (CD3) */
export async function createPaymentIntentAction(args: Target & { input: CreatePaymentIntentInput }): Promise<CreatePaymentIntentResult | DeviceBindRefusal> {
  const s0 = await scoped("createPaymentIntentAction", args);
  if ("ok" in s0) return s0;
  const sb = await bindCtxDevice(s0.ctx); // POS P5.2 ▸ CD-P52-O4b: งานนี้ผูกกะ/เครื่อง — ไม่มีคุกกี้ + สาขามีเครื่อง = DEVICE_NOT_PAIRED · เพิกถอน = DEVICE_REVOKED ◂
  if (!sb.ok) return sb;
  const s = { ...s0, ctx: sb.ctx };
  try {
    // POS P5.2 ▸ CD-P52-O4b: เครื่องของใบขอรับเงิน = เครื่องของคุกกี้ (input.deviceId ของ client ถูกแทน) · สาขาที่ไม่มีเครื่องลงทะเบียนเลย = รหัสใน input ตามเดิม (ไม่มีเครื่อง/กะให้สวมรอย) ◂
    const inp = s.ctx.deviceId && args?.input && typeof args.input === "object" ? { ...args.input, deviceId: s.ctx.deviceId } : args?.input;
    return await createPaymentIntent(s.ctx, s.actor, inp);
  } catch (e) {
    return internal("createPaymentIntentAction", e);
  }
}

/** แคชเชียร์ยืนยันเองเมื่อเห็นเงินเข้า (มี audit) */
export async function confirmPaymentIntentManualAction(args: Target & { intentId: string }): Promise<PaymentIntentActionResult | DeviceBindRefusal> {
  const s0 = await scoped("confirmPaymentIntentManualAction", args);
  if ("ok" in s0) return s0;
  const sb = await bindCtxDevice(s0.ctx); // POS P5.2 ▸ CD-P52-O4b: งานนี้ผูกกะ/เครื่อง — ไม่มีคุกกี้ + สาขามีเครื่อง = DEVICE_NOT_PAIRED · เพิกถอน = DEVICE_REVOKED ◂
  if (!sb.ok) return sb;
  const s = { ...s0, ctx: sb.ctx };
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

/**
 * POS P1.7U ▸ มติ 6: ค่าตั้ง 17A "วิธีรับเงิน" (settings.pos.payment) — สิทธิ์ pos.device.manage แบบค่าตั้งใบเสร็จ
 *   (ระดับร้านที่นี่ + ครบทุกสาขาที่ผูก POS นี้ใน updatePosIntentSettings) · ร้าน/บทบาทจาก session เท่านั้น ◂
 */
export async function updatePosIntentSettingsAction(args: { systemId: string; patch: PosIntentSettingsPatch }): Promise<PosIntentSettingsResult> {
  try {
    const auth = await requireTenant();
    const m = posMembership(auth.active);
    try {
      assertCan(m, { module: "pos", action: "pos.device.manage" });
    } catch {
      return { ok: false, code: "PERMISSION_DENIED", message: "บัญชีนี้ยังไม่มีสิทธิ์ตั้งค่าการรับเงิน — ขอสิทธิ์จากเจ้าของร้าน" };
    }
    const systemId = args && typeof args.systemId === "string" ? args.systemId : "";
    return await updatePosIntentSettings(
      { tenantId: auth.active.tenantId, systemId },
      { userId: auth.user.id, role: m.role, unitAccess: m.unitAccess, permissions: m.permissions },
      args?.patch ?? {},
    );
  } catch (e) {
    unstable_rethrow(e);
    console.error("[pos/payment-intent-actions] updatePosIntentSettingsAction", e);
    return { ok: false, code: "UNKNOWN", message: "เกิดข้อผิดพลาด — ลองอีกครั้ง" };
  }
}
