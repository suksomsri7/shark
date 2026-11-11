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
import { setAvailability, updateProduct, CatalogError } from "./catalog"; // POS P2.6U ▸ + updateProduct (มติ 9b · สถานีของสินค้าที่ไม่ใช่เมนู) ◂
import { kdsSetKitchenPause } from "./kds"; // POS P5.2 ▸ D11 ◂
import { kdsBoard, kdsLineDone, kdsRecall, kdsRush, kdsServed, kdsSetAutoAcceptMax, kdsStart, kdsTicketDone, kitchenProgress, kitchenSlipPayload, kitchenStateForUnit, kdsKitchenProducts, kdsStations, roundOfSale, saleNeedsKitchen } from "./kds"; // POS P2.6U ▸ + kitchenStateForUnit · roundOfSale · kdsKitchenProducts · kdsStations ◂
import type {
  KdsActionResult,
  KdsAutoAcceptResult,
  KdsKitchenPauseResult, // POS P5.2 ▸ D11 ◂
  KdsBoardResult,
  KdsKitchenProductsResult,
  KdsRefusal,
  KdsStationsResult,
  KdsRushResult,
  KitchenProgressResult,
  KitchenSlipResult,
  SetAvailabilityResult,
} from "./kds-shared";
import type { RegisterActor, RegisterCtx } from "./register-shared";
import { cookieDeviceId } from "./device-request"; // POS P5.2 ▸ CD-P52-O4b ◂

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
  manage: [["pos", "pos.product.manage"]], // POS P2.6U ▸ มติ 9b: สถานีครัวของสินค้า (catalog.updateProduct ตรวจซ้ำ) ◂
  sale: [["pos", "pos.sale.create"], ["pos", "pos.sale.read"]], // POS P2.6U ▸ มติ 10: คิวของบิล (PayDone) ◂
  stations: [["restaurant", "restaurant.kds.advance"], ["pos", "pos.sale.read"], ["pos", "pos.sale.create"], ["pos", "pos.product.manage"]], // POS P2.6U ▸ fix1 F3: อ่านบอร์ด | จัดการสินค้า ◂
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
  const deviceId = await cookieDeviceId({ tenantId: auth.active.tenantId, unitId: unitId }); // POS P5.2 ▸ CD-P52-O4b: เครื่อง = คุกกี้ลงนามเท่านั้น (device-request.ts) · deviceId ของ client ถูกทิ้ง ◂
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

/** POS P5.2 ▸ D11 (ruling 4): พักครัว / เลิกพัก จากจอครัวของ POS (คีย์ restaurant.kitchen.pause ที่สาขานี้) — kitchenPauseAction ของหน้าร้านอาหารเดิมปิดบนสาขาที่ผูก POS ◂ */
export async function kdsKitchenPauseAction(args: Target & { paused: boolean; note?: string | null }): Promise<KdsKitchenPauseResult> {
  try {
    const s = await sessionScope(args, "pause");
    if ("ok" in s) return s;
    return await kdsSetKitchenPause(s.ctx, s.actor, { paused: args?.paused, ...(args?.note !== undefined ? { note: args.note } : {}) });
  } catch (e) {
    unstable_rethrow(e);
    return unexpected("kdsKitchenPauseAction", e);
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

// ═══════════ POS P2.6U ▸ ตัวห่อบาง ๆ ที่สัญญา S ยังไม่มี (บันทึกเป็น deviation ในโน้ต P2.6U) ═══════════

/**
 * มติ 9b (จอ 06): ตั้งสถานีครัวของสินค้าที่ไม่ใช่เมนู → catalog.updateProduct({stationId}) (ตัวเขียนเดียว F15.1 · pos.product.manage ตรวจซ้ำในแคตตาล็อก ·
 * สถานีต้องเป็นของสาขาเดียวกับสินค้า · เมนู = VALIDATION) · คำปฏิเสธของแคตตาล็อก → รหัสของจอครัว
 */
export async function setProductStationAction(args: Target & { productId: string; stationId: string | null }): Promise<{ ok: true; stationId: string | null } | KdsRefusal> {
  try {
    const s = await sessionScope(args, "manage");
    if ("ok" in s) return s;
    const stationId = args?.stationId === null ? null : typeof args?.stationId === "string" ? args.stationId : undefined;
    if (stationId === undefined || typeof args?.productId !== "string" || !args.productId) return { ok: false, code: "VALIDATION", message: "ข้อมูลไม่ถูกต้อง" };
    const row = await updateProduct({ tenantId: s.ctx.tenantId, systemId: s.ctx.systemId, actorUserId: s.actor.userId }, args.productId, { stationId });
    return { ok: true, stationId: row.stationId ?? null };
  } catch (e) {
    unstable_rethrow(e);
    if (e instanceof CatalogError) {
      const code = e.code === "NOT_FOUND" ? "PRODUCT_NOT_FOUND" : e.code === "PERMISSION_DENIED" ? "PERMISSION_DENIED" : e.code === "VALIDATION" ? "VALIDATION" : "INTERNAL";
      return { ok: false, code, message: e.message };
    }
    return unexpected("setProductStationAction", e);
  }
}

/**
 * มติ 9c + 11 (จอ 09): สถานะครัวของสาขา — พักครัว · เพดานรับอัตโนมัติ (autoAcceptMaxOpen) · ตั๋วค้าง (ใหม่+กำลังทำ) ต่อสถานี
 * (kds.kitchenStateForUnit = kitchenSettingForPos ของ facade ร้านอาหาร + kitchenBacklog) · อ่านอย่างเดียว · สิทธิ์อ่านเดียวกับบอร์ด
 */
export async function kdsKitchenStateAction(args: Target): Promise<{ ok: true; paused: boolean; maxOpen: number | null; backlog: { stationId: string; open: number }[] } | KdsRefusal> {
  try {
    const s = await sessionScope(args, "read");
    if ("ok" in s) return s;
    return { ok: true, ...(await kitchenStateForUnit(s.ctx.tenantId, s.ctx.unitId)) };
  } catch (e) {
    unstable_rethrow(e);
    return unexpected("kdsKitchenStateAction", e);
  }
}

/** มติ 10 (PayDone "คิว N") + fix1 F2: เลขคิว + id รอบครัวของบิลนี้ (null = ไม่มีรอบ) — roundOfSale ของ kds.ts (อ่านอย่างเดียว) */
export async function kdsQueueNoAction(args: Target & { saleId: string }): Promise<{ ok: true; queueNo: number | null; orderId: string | null; kitchen: boolean } | KdsRefusal> {
  try {
    const s = await sessionScope(args, "sale");
    if ("ok" in s) return s;
    if (typeof args?.saleId !== "string" || !args.saleId) return { ok: false, code: "VALIDATION", message: "ข้อมูลไม่ถูกต้อง" };
    const r = await roundOfSale(s.ctx.tenantId, s.ctx.unitId, args.saleId);
    // POS P2.14 ▸ UI-8 (U1): kitchen = บิลมีบรรทัดที่เข้าครัว (มีรอบแล้ว = true · ยังไม่มี = saleNeedsKitchen) — จอเตือน "ใบครัวไม่ออก" เฉพาะเมื่อ kitchen ◂
    const kitchen = r ? true : await saleNeedsKitchen(s.ctx.tenantId, s.ctx.unitId, args.saleId);
    return { ok: true, queueNo: r?.no ?? null, orderId: r?.orderId ?? null, kitchen };
  } catch (e) {
    unstable_rethrow(e);
    return unexpected("kdsQueueNoAction", e);
  }
}

/** fix1 F1 (มติ fix1-1): สินค้าที่เข้าครัวของสาขาสำหรับแผ่น 86 — kds.kdsKitchenProducts (อ่านอย่างเดียว · สิทธิ์เดียวกับผู้เขียน 86) */
export async function kdsKitchenProductsAction(args: Target): Promise<KdsKitchenProductsResult> {
  try {
    const s = await sessionScope(args, "availability");
    if ("ok" in s) return s;
    return await kdsKitchenProducts(s.ctx, s.actor);
  } catch (e) {
    unstable_rethrow(e);
    return unexpected("kdsKitchenProductsAction", e);
  }
}

/** fix1 F3 (มติ fix1-3): สถานีที่ใช้งานของสาขา (17B · ลิ้นชัก 06) — kds.kdsStations (ไม่ heal · ไม่คิดบอร์ด) */
export async function kdsStationsAction(args: Target): Promise<KdsStationsResult> {
  try {
    const s = await sessionScope(args, "stations");
    if ("ok" in s) return s;
    return await kdsStations(s.ctx, s.actor);
  } catch (e) {
    unstable_rethrow(e);
    return unexpected("kdsStationsAction", e);
  }
}
