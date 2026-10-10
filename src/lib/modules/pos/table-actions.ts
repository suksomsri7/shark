"use server";
// table-actions.ts — server action ของโหมดโต๊ะ (POS P2.4 · จอ P2.4U) · เปลือกบาง: session → ctx/actor → pos/table.* (หรือ held-cart) → คืนผลตามเดิม
//
// 🔴 ไฟล์ "use server" export ได้เฉพาะ async function (ชนิดข้อมูลอยู่ table-shared.ts / register-shared.ts)
// 🔴 คำปฏิเสธ "คืน" เสมอ {ok:false, code, message} · ขัดข้องที่ไม่คาดคิด = UNKNOWN (แบบ register-actions)
// 🔴 ร้าน + ผู้ใช้ (role · unitAccess · permissions) มาจาก membership ของ SESSION เท่านั้น · systemId/unitId จากคำขอถูกตรวจซ้ำใน table.ts
//    ด่านหน้า: เข้าสาขาได้ + pos.sale.create หรือ pos.sale.read (ผังอ่านได้ด้วย pos.sale.read) — คีย์ restaurant.* ของแต่ละงานตรวจใน table.ts
// เช็คบิลของโต๊ะ = quoteRegisterCartAction / submitRegisterSaleAction เดิม (ส่ง cart/sale ที่มี tableSessionId · lines: []) ไม่มี action ใหม่

import { unstable_rethrow } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { assertCan, canAccessUnit } from "@/lib/core/rbac";
import { posMembership } from "./access";
import { holdRegisterCart } from "./held-cart";
import {
  registerAckTableRequest,
  registerCancelReservation,
  registerCancelTableItem,
  registerClearTable,
  registerCloseTable,
  registerCreateReservation,
  registerDoneTableRequest,
  registerLinkTableMember,
  registerOpenTable,
  registerSeatReservation,
  registerSendTableRound,
  registerTableDetail,
  registerTableMode,
  registerTableRequests,
  registerTables,
} from "./table";
import type { HoldRegisterCartResult, RegisterActor, RegisterCtx, RegisterQuoteInput, RegisterRefusal } from "./register-shared";
import type { RegisterTableDetailResult, RegisterTableModeResult, RegisterTablesResult } from "./table-shared";

type Session = Awaited<ReturnType<typeof requireTenant>>;
type Target = { systemId: string; unitId: string; deviceId?: string };
type Ok<T = object> = ({ ok: true } & T) | RegisterRefusal;

function refusal(code: RegisterRefusal["code"], message: string): RegisterRefusal {
  return { ok: false, code, message };
}
function unexpected(where: string, e: unknown): RegisterRefusal {
  console.error(`[pos/table-actions] ${where}`, e);
  return refusal("UNKNOWN", "เกิดข้อผิดพลาด — ลองอีกครั้ง");
}
async function session(where: string): Promise<Session | RegisterRefusal> {
  try {
    return await requireTenant();
  } catch (e) {
    unstable_rethrow(e);
    return unexpected(`${where} requireTenant`, e);
  }
}
/** session → ctx + actor · เข้าสาขาไม่ได้ = NOT_FOUND · ไม่มีทั้ง pos.sale.create และ pos.sale.read = PERMISSION_DENIED */
function sessionScope(auth: Session, args: unknown): { ctx: RegisterCtx; actor: RegisterActor } | RegisterRefusal {
  const a = args && typeof args === "object" ? (args as Record<string, unknown>) : {};
  const systemId = typeof a.systemId === "string" ? a.systemId : "";
  const unitId = typeof a.unitId === "string" ? a.unitId : "";
  if (!systemId || !unitId) return refusal("NOT_FOUND", "ไม่พบสาขานี้");
  const m = posMembership(auth.active);
  if (!canAccessUnit(m, unitId)) return refusal("NOT_FOUND", "ไม่พบสาขานี้");
  // ด่านสิทธิ์ (ชุดเดียวกับหน้าขาย): pos.sale.create — ไม่มี ⇒ pos.sale.read (อ่านผังได้) — ไม่มีทั้งคู่ = PERMISSION_DENIED
  let allowed = false;
  for (const action of ["pos.sale.create", "pos.sale.read"]) {
    try {
      assertCan(m, { module: "pos", action, unitId });
      allowed = true;
      break;
    } catch {
      /* ลองสิทธิ์ถัดไป */
    }
  }
  if (!allowed) return refusal("PERMISSION_DENIED", "บัญชีนี้ยังไม่มีสิทธิ์ใช้หน้าขาย — ขอให้เจ้าของร้านเพิ่มสิทธิ์");
  const deviceId = typeof a.deviceId === "string" ? a.deviceId : undefined;
  return { ctx: { tenantId: auth.active.tenantId, systemId, unitId, ...(deviceId !== undefined ? { deviceId } : {}) }, actor: { userId: auth.user.id, role: m.role, unitAccess: m.unitAccess, permissions: m.permissions } };
}
/** โครงร่วมของทุก action: session → ขอบเขต → งาน · ขัดข้อง = UNKNOWN */
async function run<T>(where: string, args: unknown, body: (ctx: RegisterCtx, actor: RegisterActor) => Promise<T | RegisterRefusal>): Promise<T | RegisterRefusal> {
  const auth = await session(where);
  if ("ok" in auth) return auth;
  try {
    const s = sessionScope(auth, args);
    if ("ok" in s) return s;
    return await body(s.ctx, s.actor);
  } catch (e) {
    return unexpected(where, e);
  }
}

/** ผังโต๊ะของสาขา (การ์ด · โซน · ตัวเลขแถบบน) */
export async function registerTablesAction(args: Target): Promise<RegisterTablesResult> {
  try {
    return await run("registerTablesAction", args, (ctx, actor) => registerTables(ctx, actor));
  } catch (e) {
    return unexpected("registerTablesAction", e);
  }
}

/** แท็บ "โต๊ะ" แสดงไหม (มติ Q5) */
export async function registerTableModeAction(args: Target): Promise<RegisterTableModeResult> {
  try {
    return await run("registerTableModeAction", args, (ctx, actor) => registerTableMode(ctx, actor));
  } catch (e) {
    return unexpected("registerTableModeAction", e);
  }
}

/** แผงโต๊ะ (รอบที่ส่งแล้ว · รอบร่าง · ยอดค้างจ่าย) */
export async function registerTableDetailAction(args: Target & { tableSessionId: string }): Promise<RegisterTableDetailResult> {
  try {
    return await run("registerTableDetailAction", args, (ctx, actor) => registerTableDetail(ctx, actor, { tableSessionId: args.tableSessionId }));
  } catch (e) {
    return unexpected("registerTableDetailAction", e);
  }
}

/** เปิดโต๊ะ */
export async function registerOpenTableAction(args: Target & { tableId: string; guestCount?: number | null; memberId?: string | null }): Promise<Ok<{ sessionId: string; created: boolean; reservationOverridden: boolean }>> {
  try {
    return await run("registerOpenTableAction", args, (ctx, actor) => registerOpenTable(ctx, actor, { tableId: args.tableId, guestCount: args.guestCount ?? null, memberId: args.memberId ?? null }));
  } catch (e) {
    return unexpected("registerOpenTableAction", e);
  }
}

/** ผูก/ถอดสมาชิกของโต๊ะ */
export async function registerLinkTableMemberAction(args: Target & { tableSessionId: string; memberId: string | null }): Promise<Ok> {
  try {
    return await run("registerLinkTableMemberAction", args, (ctx, actor) => registerLinkTableMember(ctx, actor, { tableSessionId: args.tableSessionId, memberId: args.memberId ?? null }));
  } catch (e) {
    return unexpected("registerLinkTableMemberAction", e);
  }
}

/** พักรอบร่างของโต๊ะ (ตะกร้าเดียวต่อโต๊ะ · newDraft หรือ heldCartId+expectedVersion) */
export async function holdTableDraftAction(
  args: Target & { tableSessionId: string; cart: RegisterQuoteInput; label?: string | null; staffToken?: string | null; expectedVersion?: number | null; heldCartId?: string | null; newDraft?: boolean | null },
): Promise<HoldRegisterCartResult> {
  try {
    // POS P2.4 ▸ fix 2 F1: จอส่ง newDraft:true (ยังไม่มีรอบร่าง) หรือ heldCartId + expectedVersion (แก้รอบร่างเดิม) เสมอ ◂
    return await run("holdTableDraftAction", args, (ctx, actor) =>
      holdRegisterCart(ctx, actor, {
        cart: args.cart,
        tableSessionId: args.tableSessionId,
        label: args.label ?? null,
        ...(typeof args?.staffToken === "string" ? { staffToken: args.staffToken } : {}),
        expectedVersion: args.expectedVersion ?? null,
        heldCartId: args.heldCartId ?? null,
        newDraft: args.newDraft ?? null,
      }),
    );
  } catch (e) {
    return unexpected("holdTableDraftAction", e);
  }
}

/** ส่งรอบร่างเข้าครัว */
export async function registerSendTableRoundAction(args: Target & { tableSessionId: string; heldCartId: string }): Promise<Ok<{ orderId: string; dailyNo: number; itemIds: string[] }>> {
  try {
    return await run("registerSendTableRoundAction", args, (ctx, actor) => registerSendTableRound(ctx, actor, { tableSessionId: args.tableSessionId, heldCartId: args.heldCartId }));
  } catch (e) {
    return unexpected("registerSendTableRoundAction", e);
  }
}

/** ปิดโต๊ะ (ค้างจ่าย = TABLE_HAS_UNPAID) */
export async function registerCloseTableAction(args: Target & { tableSessionId: string }): Promise<Ok<{ status: "CLOSED" | "CANCELLED" }>> {
  try {
    return await run("registerCloseTableAction", args, (ctx, actor) => registerCloseTable(ctx, actor, { tableSessionId: args.tableSessionId }));
  } catch (e) {
    return unexpected("registerCloseTableAction", e);
  }
}

/** เก็บโต๊ะแล้ว */
export async function registerClearTableAction(args: Target & { tableId: string }): Promise<Ok> {
  try {
    return await run("registerClearTableAction", args, (ctx, actor) => registerClearTable(ctx, actor, { tableId: args.tableId }));
  } catch (e) {
    return unexpected("registerClearTableAction", e);
  }
}

/** ยกเลิกรายการที่ส่งครัวแล้ว (ยังไม่จ่าย · ยังไม่เสิร์ฟ) */
export async function registerCancelTableItemAction(args: Target & { itemId: string; reason: string }): Promise<Ok> {
  try {
    return await run("registerCancelTableItemAction", args, (ctx, actor) => registerCancelTableItem(ctx, actor, { itemId: args.itemId, reason: args.reason }));
  } catch (e) {
    return unexpected("registerCancelTableItemAction", e);
  }
}

/** จองโต๊ะ */
export async function registerCreateReservationAction(
  args: Target & { tableId?: string | null; name: string; phone?: string | null; partySize: number; at: string; holdFromMinutes?: number | null },
): Promise<Ok<{ id: string }>> {
  try {
    return await run("registerCreateReservationAction", args, (ctx, actor) =>
      registerCreateReservation(ctx, actor, { tableId: args.tableId ?? null, name: args.name, phone: args.phone ?? null, partySize: args.partySize, at: args.at, holdFromMinutes: args.holdFromMinutes ?? null }),
    );
  } catch (e) {
    return unexpected("registerCreateReservationAction", e);
  }
}

/** พาลูกค้าที่จองนั่ง (เปิดโต๊ะ) */
export async function registerSeatReservationAction(args: Target & { reservationId: string; tableId?: string | null }): Promise<Ok<{ sessionId: string }>> {
  try {
    return await run("registerSeatReservationAction", args, (ctx, actor) => registerSeatReservation(ctx, actor, { reservationId: args.reservationId, tableId: args.tableId ?? null }));
  } catch (e) {
    return unexpected("registerSeatReservationAction", e);
  }
}

/** ยกเลิกการจอง */
export async function registerCancelReservationAction(args: Target & { reservationId: string }): Promise<Ok> {
  try {
    return await run("registerCancelReservationAction", args, (ctx, actor) => registerCancelReservation(ctx, actor, { reservationId: args.reservationId }));
  } catch (e) {
    return unexpected("registerCancelReservationAction", e);
  }
}

/** คำขอจากโต๊ะที่ยังไม่ปิดเรื่อง */
export async function registerTableRequestsAction(args: Target): Promise<Ok<{ requests: { id: string; type: string; status: string; sessionId: string; tableId: string; tableName: string; note: string | null; createdAt: string; ackedAt: string | null }[] }>> {
  try {
    return await run("registerTableRequestsAction", args, (ctx, actor) => registerTableRequests(ctx, actor));
  } catch (e) {
    return unexpected("registerTableRequestsAction", e);
  }
}

/** รับทราบคำขอ */
export async function registerAckTableRequestAction(args: Target & { requestId: string }): Promise<Ok> {
  try {
    return await run("registerAckTableRequestAction", args, (ctx, actor) => registerAckTableRequest(ctx, actor, { requestId: args.requestId }));
  } catch (e) {
    return unexpected("registerAckTableRequestAction", e);
  }
}

/** ปิดเรื่องคำขอ */
export async function registerDoneTableRequestAction(args: Target & { requestId: string }): Promise<Ok> {
  try {
    return await run("registerDoneTableRequestAction", args, (ctx, actor) => registerDoneTableRequest(ctx, actor, { requestId: args.requestId }));
  } catch (e) {
    return unexpected("registerDoneTableRequestAction", e);
  }
}
