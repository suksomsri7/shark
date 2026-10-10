"use server";
// order-actions.ts — server action ของจอออเดอร์ทุกช่องทาง (POS P2.8 S · จอ 09 = P2.8U) · เปลือกบาง: session → ctx/actor → order.*
//
// 🔴 ไฟล์ "use server" export ได้เฉพาะ async function — ชนิดข้อมูลอยู่ที่ order-shared.ts
// 🔴 คำปฏิเสธ "คืน" เสมอ {ok:false, code, message} (Next ปิดข้อความของ error ที่โยนออกจาก action ใน production)
// 🔴 ร้าน + ผู้ใช้ (role · unitAccess · permissions) มาจาก membership ของ SESSION เท่านั้น · systemId/unitId/deviceId จากคำขอถูกตรวจซ้ำใน order.ts
//    สิทธิ์: คีย์ออเดอร์/รับเงิน = pos.sale.create · รับ/เตรียม/พร้อม/ส่งมอบ/เวลาเตรียม/ค่าตั้งช่องทาง = pos.order.accept ·
//    ปฏิเสธ/ยกเลิก = pos.order.reject (+ pos.sale.void เมื่อมีบิล) · อ่าน = pos.sale.read | pos.sale.create (ตรวจใน order.ts ทั้งหมด)

import { unstable_rethrow } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { assertCan, canAccessUnit } from "@/lib/core/rbac";
import { posMembership } from "./access";
import {
  acceptOrder,
  cancelOrder,
  getOrder,
  handOver,
  ingestOrder,
  listOrders,
  markPreparing,
  markReady,
  payOrder,
  rejectOrder,
  setChannelOrderSettings,
  setPrepMinutes,
} from "./order";
import type {
  ChannelOrderSettingsResult,
  GetOrderResult,
  IngestOrderResult,
  ListOrdersResult,
  OrderActionResult,
  OrderRefusal,
  PayOrderResult,
} from "./order-shared";
import type { RegisterActor, RegisterCtx } from "./register-shared";

type Target = { systemId: string; unitId: string; deviceId?: string };

function unexpected(where: string, e: unknown): OrderRefusal {
  console.error(`[pos/order-actions] ${where}`, e);
  return { ok: false, code: "INTERNAL", message: "เกิดข้อผิดพลาด — ลองอีกครั้ง" };
}

/** สิทธิ์ของแต่ละงาน (ด่านชั้นแรกจาก session · order.ts ตรวจซ้ำทุกครั้ง) */
const NEED = {
  create: ["pos.sale.create"],
  accept: ["pos.order.accept"],
  reject: ["pos.order.reject"],
  read: ["pos.sale.read", "pos.sale.create"],
} as const;

/** session → ขอบเขต + ผู้ใช้ · เข้าสาขาไม่ได้ = NOT_FOUND · ไม่มีสิทธิ์ของงานที่สาขานี้ = PERMISSION_DENIED (order.ts ตรวจซ้ำกับ DB) */
async function sessionScope(args: unknown, need: keyof typeof NEED): Promise<{ ctx: RegisterCtx; actor: RegisterActor } | OrderRefusal> {
  const auth = await requireTenant();
  const a = args && typeof args === "object" ? (args as Record<string, unknown>) : {};
  const systemId = typeof a.systemId === "string" ? a.systemId : "";
  const unitId = typeof a.unitId === "string" ? a.unitId : "";
  if (!systemId || !unitId) return { ok: false, code: "NOT_FOUND", message: "ไม่พบสาขานี้" };
  const m = posMembership(auth.active);
  if (!canAccessUnit(m, unitId)) return { ok: false, code: "NOT_FOUND", message: "ไม่พบสาขานี้" };
  const allowed = NEED[need].some((action) => {
    try {
      assertCan(m, { module: "pos", action, unitId });
      return true;
    } catch {
      return false;
    }
  });
  if (!allowed) return { ok: false, code: "PERMISSION_DENIED", message: "บัญชีนี้ยังไม่มีสิทธิ์ทำรายการนี้ — ขอสิทธิ์จากเจ้าของร้าน" };
  const deviceId = typeof a.deviceId === "string" && a.deviceId ? a.deviceId : undefined;
  return {
    ctx: { tenantId: auth.active.tenantId, systemId, unitId, ...(deviceId ? { deviceId } : {}) },
    actor: { userId: auth.user.id, role: m.role, unitAccess: m.unitAccess, permissions: m.permissions },
  };
}

/** คีย์ออเดอร์ (จอ "+ คีย์ออเดอร์" · MANUAL/CHAT/ช่องทางกำหนดเอง) — input ตามตัวแกะ parseIngestInput */
export async function ingestOrderAction(args: Target & { input: unknown }): Promise<IngestOrderResult> {
  try {
    const s = await sessionScope(args, "create");
    if ("ok" in s) return s;
    return await ingestOrder(s.ctx, s.actor, args?.input);
  } catch (e) {
    unstable_rethrow(e);
    return unexpected("ingestOrderAction", e);
  }
}

/** รับออเดอร์ (+ เวลาเตรียม) — ช่องทาง PLATFORM เปิดบิลทันที */
export async function acceptOrderAction(args: Target & { id: string; prepMinutes?: number }): Promise<OrderActionResult> {
  try {
    const s = await sessionScope(args, "accept");
    if ("ok" in s) return s;
    return await acceptOrder(s.ctx, s.actor, { id: args?.id, ...(args?.prepMinutes !== undefined ? { prepMinutes: args.prepMinutes } : {}) });
  } catch (e) {
    unstable_rethrow(e);
    return unexpected("acceptOrderAction", e);
  }
}

/** ปฏิเสธออเดอร์ใหม่ (ชีตเหตุผล) */
export async function rejectOrderAction(args: Target & { id: string; reasonCode: string; note?: string }): Promise<OrderActionResult> {
  try {
    const s = await sessionScope(args, "reject");
    if ("ok" in s) return s;
    return await rejectOrder(s.ctx, s.actor, { id: args?.id, reasonCode: args?.reasonCode, ...(args?.note !== undefined ? { note: args.note } : {}) });
  } catch (e) {
    unstable_rethrow(e);
    return unexpected("rejectOrderAction", e);
  }
}

/** เริ่มเตรียม */
export async function markPreparingAction(args: Target & { id: string }): Promise<OrderActionResult> {
  try {
    const s = await sessionScope(args, "accept");
    if ("ok" in s) return s;
    return await markPreparing(s.ctx, s.actor, { id: args?.id });
  } catch (e) {
    unstable_rethrow(e);
    return unexpected("markPreparingAction", e);
  }
}

/** พร้อมแล้ว */
export async function markReadyAction(args: Target & { id: string }): Promise<OrderActionResult> {
  try {
    const s = await sessionScope(args, "accept");
    if ("ok" in s) return s;
    return await markReady(s.ctx, s.actor, { id: args?.id });
  } catch (e) {
    unstable_rethrow(e);
    return unexpected("markReadyAction", e);
  }
}

/** ส่งมอบแล้ว */
export async function handOverAction(args: Target & { id: string }): Promise<OrderActionResult> {
  try {
    const s = await sessionScope(args, "accept");
    if ("ok" in s) return s;
    return await handOver(s.ctx, s.actor, { id: args?.id });
  } catch (e) {
    unstable_rethrow(e);
    return unexpected("handOverAction", e);
  }
}

/** ยกเลิกออเดอร์ที่รับแล้ว (มีบิล = ยกเลิกบิลด้วย · อาจรออนุมัติ) */
export async function cancelOrderAction(args: Target & { id: string; reason: string; idempotencyKey?: string }): Promise<OrderActionResult> {
  try {
    const s = await sessionScope(args, "reject");
    if ("ok" in s) return s;
    return await cancelOrder(s.ctx, s.actor, { id: args?.id, reason: args?.reason, ...(args?.idempotencyKey !== undefined ? { idempotencyKey: args.idempotencyKey } : {}) });
  } catch (e) {
    unstable_rethrow(e);
    return unexpected("cancelOrderAction", e);
  }
}

/** รับเงินออเดอร์ช่องทางที่ร้านเก็บเงินเอง (กล่องชำระของหน้าขาย) */
export async function payOrderAction(
  args: Target & { id: string; idempotencyKey: string; payMethods: { type: string; amountSatang: number; reference?: string }[]; cashReceivedSatang?: number },
): Promise<PayOrderResult> {
  try {
    const s = await sessionScope(args, "create");
    if ("ok" in s) return s;
    return await payOrder(s.ctx, s.actor, {
      id: args?.id,
      idempotencyKey: args?.idempotencyKey,
      payMethods: args?.payMethods,
      ...(args?.cashReceivedSatang !== undefined ? { cashReceivedSatang: args.cashReceivedSatang } : {}),
    });
  } catch (e) {
    unstable_rethrow(e);
    return unexpected("payOrderAction", e);
  }
}

/** แก้เวลาเตรียมของออเดอร์ */
export async function setPrepMinutesAction(args: Target & { id: string; prepMinutes: number }): Promise<OrderActionResult> {
  try {
    const s = await sessionScope(args, "accept");
    if ("ok" in s) return s;
    return await setPrepMinutes(s.ctx, s.actor, { id: args?.id, prepMinutes: args?.prepMinutes });
  } catch (e) {
    unstable_rethrow(e);
    return unexpected("setPrepMinutesAction", e);
  }
}

/** ค่าตั้งรับออเดอร์ของช่องทาง (รับอัตโนมัติ · เวลาเตรียมปริยาย · พักรับ) */
export async function setChannelOrderSettingsAction(args: Target & { input: unknown }): Promise<ChannelOrderSettingsResult> {
  try {
    const s = await sessionScope(args, "accept");
    if ("ok" in s) return s;
    return await setChannelOrderSettings(s.ctx, s.actor, args?.input);
  } catch (e) {
    unstable_rethrow(e);
    return unexpected("setChannelOrderSettingsAction", e);
  }
}

/** คอลัมน์/การ์ด/ตัวนับ/สรุปวันของจอ 09 (poll 10 วิ) */
export async function listOrdersAction(args: Target & { status?: string; channelId?: string; since?: string }): Promise<ListOrdersResult> {
  try {
    const s = await sessionScope(args, "read");
    if ("ok" in s) return s;
    return await listOrders(s.ctx, s.actor, {
      ...(args?.status !== undefined ? { status: args.status } : {}),
      ...(args?.channelId !== undefined ? { channelId: args.channelId } : {}),
      ...(args?.since !== undefined ? { since: args.since } : {}),
    });
  } catch (e) {
    unstable_rethrow(e);
    return unexpected("listOrdersAction", e);
  }
}

/** แผงรายละเอียดออเดอร์ */
export async function getOrderAction(args: Target & { id: string }): Promise<GetOrderResult> {
  try {
    const s = await sessionScope(args, "read");
    if ("ok" in s) return s;
    return await getOrder(s.ctx, s.actor, { id: args?.id });
  } catch (e) {
    unstable_rethrow(e);
    return unexpected("getOrderAction", e);
  }
}
