"use server";
// kds-actions.ts — server action ของจอครัว (POS P2.6 S · จอ 04 = P2.6U) · เปลือกบาง: session → ctx/actor → kds.* / catalog.setAvailability
//
// 🔴 ไฟล์ "use server" export ได้เฉพาะ async function — ชนิดข้อมูลอยู่ที่ kds-shared.ts
// 🔴 คำปฏิเสธ "คืน" เสมอ {ok:false, code, message} (Next ปิดข้อความของ error ที่โยนออกจาก action ใน production)
// 🔴 ร้าน + ผู้ใช้ (role · unitAccess · permissions) มาจาก membership ของ SESSION เท่านั้น · systemId/unitId/deviceId จากคำขอถูกตรวจซ้ำใน kds.ts / catalog.ts
//    สิทธิ์ของแต่ละงาน (R15 · ไม่มีคีย์ใหม่): ด่านชั้นแรกจาก session ที่นี่ (assertCan) · kds.ts/catalog.ts ตรวจซ้ำกับ DB ทุกครั้ง

import { unstable_rethrow } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { assertCan, canAccessUnit } from "@/lib/core/rbac";
import { posMembership } from "./access";
import { setAvailability } from "./catalog";
import { kdsBoard, kdsLineDone, kdsRecall, kdsRush, kdsServed, kdsSetAutoAcceptMax, kdsStart, kdsTicketDone, kitchenProgress, kitchenSlipPayload } from "./kds";
import type {
  KdsActionResult,
  KdsAutoAcceptResult,
  KdsBoardResult,
  KdsRefusal,
  KdsRushResult,
  KitchenProgressResult,
  KitchenSlipResult,
  SetAvailabilityResult,
} from "./kds-shared";
import type { RegisterActor, RegisterCtx } from "./register-shared";

type Target = { systemId: string; unitId: string; deviceId?: string };

function unexpected(where: string, e: unknown): KdsRefusal {
  console.error(`[pos/kds-actions] ${where}`, e);
  return { ok: false, code: "INTERNAL", message: "จอครัวขัดข้อง — ลองอีกครั้ง" };
}

/** คีย์ของแต่ละงาน (โมดูล, คีย์) — มีอย่างใดอย่างหนึ่งที่สาขานี้ (R15 · มติ 7) */
const NEED = {
  read: [["restaurant", "restaurant.kds.advance"], ["pos", "pos.sale.read"], ["pos", "pos.sale.create"]],
  advance: [["restaurant", "restaurant.kds.advance"]],
  recall: [["restaurant", "restaurant.kds.recall"]],
  rush: [["restaurant", "restaurant.order.rush"]],
  pause: [["restaurant", "restaurant.kitchen.pause"]],
  availability: [["pos", "pos.sale.create"], ["restaurant", "restaurant.kds.advance"], ["pos", "pos.product.manage"]],
} as const;

/** session → ขอบเขต + ผู้ใช้ · เข้าสาขาไม่ได้ / ไม่มีคีย์ของงาน = PERMISSION_DENIED (kds.ts/catalog.ts ตรวจซ้ำกับ DB) */
async function sessionScope(args: unknown, need: keyof typeof NEED): Promise<{ ctx: RegisterCtx; actor: RegisterActor } | KdsRefusal> {
  const auth = await requireTenant();
  const a = args && typeof args === "object" ? (args as Record<string, unknown>) : {};
  const systemId = typeof a.systemId === "string" ? a.systemId : "";
  const unitId = typeof a.unitId === "string" ? a.unitId : "";
  const m = posMembership(auth.active);
  if (!systemId || !unitId || !canAccessUnit(m, unitId)) return { ok: false, code: "PERMISSION_DENIED", message: "บัญชีนี้เข้าสาขานี้ไม่ได้" };
  const allowed = NEED[need].some(([module, action]) => {
    try {
      assertCan(m, { module, action, unitId });
      return true;
    } catch {
      return false;
    }
  });
  if (!allowed) return { ok: false, code: "PERMISSION_DENIED", message: "บัญชีนี้ยังไม่มีสิทธิ์ทำรายการนี้ที่จอครัว — ขอสิทธิ์จากเจ้าของร้าน" };
  const deviceId = typeof a.deviceId === "string" && a.deviceId ? a.deviceId : undefined;
  return {
    ctx: { tenantId: auth.active.tenantId, systemId, unitId, ...(deviceId ? { deviceId } : {}) },
    actor: { userId: auth.user.id, role: m.role, unitAccess: m.unitAccess, permissions: m.permissions },
  };
}

/** บอร์ดของสถานี หรือ "expo" (poll ทุก 6 วิ) */
export async function kdsBoardAction(args: Target & { stationId: string }): Promise<KdsBoardResult> {
  try {
    const s = await sessionScope(args, "read");
    if ("ok" in s) return s;
    return await kdsBoard(s.ctx, s.actor, { stationId: args?.stationId });
  } catch (e) {
    unstable_rethrow(e);
    return unexpected("kdsBoardAction", e);
  }
}

/** เริ่มทำ (แตะใบในคอลัมน์ใหม่) */
export async function kdsStartAction(args: Target & { orderId: string; stationId: string }): Promise<KdsActionResult> {
  try {
    const s = await sessionScope(args, "advance");
    if ("ok" in s) return s;
    return await kdsStart(s.ctx, s.actor, { orderId: args?.orderId, stationId: args?.stationId });
  } catch (e) {
    unstable_rethrow(e);
    return unexpected("kdsStartAction", e);
  }
}

/** เสร็จทีละบรรทัด (แตะบรรทัด) */
export async function kdsLineDoneAction(args: Target & { itemId: string }): Promise<KdsActionResult> {
  try {
    const s = await sessionScope(args, "advance");
    if ("ok" in s) return s;
    return await kdsLineDone(s.ctx, s.actor, { itemId: args?.itemId });
  } catch (e) {
    unstable_rethrow(e);
    return unexpected("kdsLineDoneAction", e);
  }
}

/** เสร็จทั้งตั๋ว */
export async function kdsTicketDoneAction(args: Target & { orderId: string; stationId: string }): Promise<KdsActionResult> {
  try {
    const s = await sessionScope(args, "advance");
    if ("ok" in s) return s;
    return await kdsTicketDone(s.ctx, s.actor, { orderId: args?.orderId, stationId: args?.stationId });
  } catch (e) {
    unstable_rethrow(e);
    return unexpected("kdsTicketDoneAction", e);
  }
}

/** เสิร์ฟแล้ว */
export async function kdsServedAction(args: Target & { orderId: string; stationId: string }): Promise<KdsActionResult> {
  try {
    const s = await sessionScope(args, "advance");
    if ("ok" in s) return s;
    return await kdsServed(s.ctx, s.actor, { orderId: args?.orderId, stationId: args?.stationId });
  } catch (e) {
    unstable_rethrow(e);
    return unexpected("kdsServedAction", e);
  }
}

/** ดึงใบกลับมาแก้ (แถบเสิร์ฟแล้ววันนี้) */
export async function kdsRecallAction(args: Target & { orderId: string; stationId: string }): Promise<KdsActionResult> {
  try {
    const s = await sessionScope(args, "recall");
    if ("ok" in s) return s;
    return await kdsRecall(s.ctx, s.actor, { orderId: args?.orderId, stationId: args?.stationId });
  } catch (e) {
    unstable_rethrow(e);
    return unexpected("kdsRecallAction", e);
  }
}

/** เร่ง / ยกเลิกเร่ง */
export async function kdsRushAction(args: Target & { orderId: string; rush: boolean }): Promise<KdsRushResult> {
  try {
    const s = await sessionScope(args, "rush");
    if ("ok" in s) return s;
    return await kdsRush(s.ctx, s.actor, { orderId: args?.orderId, rush: args?.rush });
  } catch (e) {
    unstable_rethrow(e);
    return unexpected("kdsRushAction", e);
  }
}

/** ข้อมูลใบครัว (พิมพ์จากเครื่องที่จับคู่เครื่องพิมพ์ไว้ · copy = พิมพ์ซ้ำ) */
export async function kitchenSlipPayloadAction(args: Target & { orderId: string; stationId?: string; copy?: boolean; locale?: "th" | "en" }): Promise<KitchenSlipResult> {
  try {
    const s = await sessionScope(args, "read");
    if ("ok" in s) return s;
    return await kitchenSlipPayload(s.ctx, s.actor, {
      orderId: args?.orderId,
      ...(args?.stationId !== undefined ? { stationId: args.stationId } : {}),
      ...(args?.copy !== undefined ? { copy: args.copy } : {}),
      ...(args?.locale !== undefined ? { locale: args.locale } : {}),
    });
  } catch (e) {
    unstable_rethrow(e);
    return unexpected("kitchenSlipPayloadAction", e);
  }
}

/** "ครัวกำลังทำ x/y" ของจอ 09 */
export async function kitchenProgressAction(args: Target & { posOrderIds: string[] }): Promise<KitchenProgressResult> {
  try {
    const s = await sessionScope(args, "read");
    if ("ok" in s) return s;
    return await kitchenProgress(s.ctx, s.actor, { posOrderIds: args?.posOrderIds });
  } catch (e) {
    unstable_rethrow(e);
    return unexpected("kitchenProgressAction", e);
  }
}

/** เพดานครัวค้างของการรับอัตโนมัติ (null = ปิด) */
export async function kdsSetAutoAcceptMaxAction(args: Target & { maxOpen: number | null }): Promise<KdsAutoAcceptResult> {
  try {
    const s = await sessionScope(args, "pause");
    if ("ok" in s) return s;
    return await kdsSetAutoAcceptMax(s.ctx, s.actor, { maxOpen: args?.maxOpen });
  } catch (e) {
    unstable_rethrow(e);
    return unexpected("kdsSetAutoAcceptMaxAction", e);
  }
}

/** แจ้งของหมด (86) / คืนขาย ที่สาขานี้ — จากจอครัว (KDS) หรือหน้าสินค้า/หน้าขาย (MANUAL) */
export async function setAvailabilityAction(
  args: Target & { productId: string; available: boolean; source: "KDS" | "MANUAL"; note?: string | null; resetCounter?: boolean },
): Promise<SetAvailabilityResult> {
  try {
    const s = await sessionScope(args, "availability");
    if ("ok" in s) return s;
    return await setAvailability(s.ctx, s.actor, {
      productId: args?.productId,
      unitId: s.ctx.unitId,
      available: args?.available,
      source: args?.source,
      ...(args?.note !== undefined ? { note: args.note } : {}),
      ...(args?.resetCounter !== undefined ? { resetCounter: args.resetCounter } : {}),
    });
  } catch (e) {
    unstable_rethrow(e);
    return unexpected("setAvailabilityAction", e);
  }
}
