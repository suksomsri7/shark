// ops/orders.ts — op ของออเดอร์ทุกช่องทาง (ใบ P2.13 · brief §1 #25–#34 · drift 2 3)
//
// วงจร: NEW → ACCEPTED → PREPARING → READY → HANDED (ส่งมอบ) · ปฏิเสธ/ยกเลิก · ชำระที่ร้าน (ช่องทาง DIRECT)
//   ช่องทาง payout PLATFORM: บิลเกิดตอนรับออเดอร์ (ค่าคอมฯ ลง JV) · DIRECT: บิลเกิดตอน pay
// 🔴 ตรรกะทั้งหมดอยู่ที่ order.ts — ที่นี่ส่งต่อ + ด่านสาขา + คีย์กันซ้ำชั้นบริการ (posApiServiceKey · มติ 5)
// 🔴 ยกเลิกออเดอร์ที่มีบิลแล้ว ต้องมี pos.sale.void ด้วย (order.ts ตัดสิน · 403 forbidden)
import { z } from "zod";
import type { ApiActor } from "@/lib/api/actor";
import { acceptOrder, cancelOrder, getOrder, handOver, ingestOrder, listOrders, markPreparing, markReady, payOrder, rejectOrder } from "../../order";
import { ORDER_FULFILMENTS, ORDER_INPUT_PAYMENT_STATES, ORDER_REJECT_REASONS, ORDER_START_STATUSES, ORDER_STATUSES } from "../../order-shared";
import { posRegisterActorOf } from "../actor";
import { posData } from "../http-errors";
import { definePosOp, POS_SCOPES, type ApiOp } from "../op";
import { posOrderUnit, requirePosUnit } from "../units";
import { posOpServiceKey } from "./sales";

const satang = z.number().int().min(0).max(2_147_483_647);
const unitIdField = z.string().min(1).max(64).describe("Branch (BusinessUnit id) of this POS system.");
const unitIdOpt = unitIdField.optional().describe("Branch of the order. Optional: the order's own branch is used; a different branch answers 404.");
const orderTarget = ({ params, data }: { params: Record<string, string>; data: unknown }) => {
  const id = params.id || (typeof data === "object" && data !== null ? (data as { orderId?: unknown }).orderId : null);
  return typeof id === "string" && id ? { targetType: "PosOrder", targetId: id } : null;
};
/** ctx ของ order.ts — คีย์ API พก `apiKeyId` (orders.pay ผูกกะตามกติกา "ทางอื่น" แทนกะของเครื่อง · CD5) */
const ctxOf = (actor: ApiActor, unitId: string) => ({
  tenantId: actor.tenantId,
  systemId: actor.systemId,
  unitId,
  ...(actor.kind === "apikey" && actor.keyId ? { apiKeyId: actor.keyId } : {}),
});

const ordersList = definePosOp({
  id: "orders.list",
  method: "GET",
  path: "/orders",
  kind: "read",
  action: POS_SCOPES.saleRead,
  summary: "Orders of a branch since the start of the Thai business day (or since, at most 7 days back), with counts per status and the day summary.",
  label: "รายการออเดอร์",
  test: "orders.list",
  input: z
    .object({
      unitId: unitIdField,
      status: z.enum(ORDER_STATUSES).optional().describe("Only orders in this status."),
      channelId: z.string().min(1).max(64).optional().describe("Only orders of this sales channel."),
      since: z.string().datetime({ offset: true }).optional().describe("ISO-8601 start (cut at 7 days back)."),
    })
    .strict(),
  async handler({ actor, input }) {
    const unitId = await requirePosUnit(actor, input.unitId);
    const { unitId: _u, ...q } = input;
    return posData(await listOrders(ctxOf(actor, unitId), posRegisterActorOf(actor), q));
  },
});

const ordersGet = definePosOp({
  id: "orders.get",
  method: "GET",
  path: "/orders/{id}",
  kind: "read",
  action: POS_SCOPES.saleRead,
  summary: "One order with lines, customer, fulfilment, timeline, payment state and its bill.",
  label: "รายละเอียดออเดอร์",
  test: "orders.get",
  input: z.object({ unitId: unitIdOpt }).strict(),
  async handler({ actor, params, input }) {
    const unitId = await posOrderUnit(actor, params.id ?? "", input.unitId);
    return posData(await getOrder(ctxOf(actor, unitId), posRegisterActorOf(actor), { id: params.id ?? "" }));
  },
});

const ingestLine = z
  .object({
    productId: z.string().min(1).max(64).optional().describe("Catalog product id (price from the catalog / channel price)."),
    name: z.string().trim().min(1).max(200).optional().describe("Line name (custom lines without productId)."),
    unitPriceSatang: satang.optional().describe("Unit price in satang (custom lines, or the platform's price of a catalog product)."),
    qty: z.number().int().min(1).max(10_000).describe("Quantity."),
    choiceIds: z.array(z.string().min(1).max(64)).max(20).optional().describe("Option choice ids of a catalog product."),
    note: z.string().max(200).optional().describe("Line note for the kitchen."),
  })
  .strict();

const ordersCreate = definePosOp({
  id: "orders.create",
  method: "POST",
  path: "/orders",
  kind: "write",
  action: POS_SCOPES.saleCreate,
  summary: "Put an order into a sales channel of a branch (custom app, delivery platform tablet, phone order). The same externalRef on the same channel returns the first order with duplicated: true.",
  label: "รับออเดอร์เข้า",
  test: "orders.create",
  input: z
    .object({
      unitId: unitIdField,
      channelId: z.string().min(1).max(64).optional().describe("Sales channel id (GET /channels). Send channelId or channelCode."),
      channelCode: z.string().min(1).max(40).optional().describe("Sales channel code of the branch, e.g. LINEMAN."),
      externalRef: z.string().trim().min(1).max(40).optional().describe("Order number on the platform / your system."),
      fulfilment: z.enum(ORDER_FULFILMENTS).describe("PICKUP, DELIVERY or DINE_IN."),
      lines: z.array(ingestLine).min(1).max(100).describe("Order lines."),
      customer: z
        .object({
          name: z.string().trim().max(100).optional().describe("Customer name."),
          phone: z.string().trim().max(30).optional().describe("Customer phone."),
          memberId: z.string().min(1).max(64).optional().describe("Member id of the shop."),
        })
        .strict()
        .optional()
        .describe("Customer of the order."),
      address: z.string().trim().max(300).optional().describe("Delivery address."),
      note: z.string().max(300).optional().describe("Order note."),
      startStatus: z.enum(ORDER_START_STATUSES).optional().describe("NEW (staff must accept) or ACCEPTED. Default: ACCEPTED on MANUAL channels, NEW elsewhere."),
      paymentState: z.enum(ORDER_INPUT_PAYMENT_STATES).optional().describe("UNPAID or PAY_ON_PICKUP (DIRECT channels)."),
      prepMinutes: z.number().int().min(1).max(180).optional().describe("Preparation time in minutes."),
    })
    .strict(),
  auditTarget: orderTarget,
  async handler({ actor, input, idempotencyKey, requestId }) {
    const unitId = await requirePosUnit(actor, input.unitId);
    const { unitId: _u, ...body } = input;
    return posData(await ingestOrder(ctxOf(actor, unitId), posRegisterActorOf(actor), { ...body, idempotencyKey: posOpServiceKey(actor, idempotencyKey, requestId) }));
  },
});

const stepInput = z.object({ unitId: unitIdOpt }).strict();

const ordersAccept = definePosOp({
  id: "orders.accept",
  method: "POST",
  path: "/orders/{id}/accept",
  kind: "write",
  action: POS_SCOPES.orderAccept,
  summary: "Accept a NEW order. On a platform channel this opens the bill (platform payment, commission in the journal).",
  label: "รับออเดอร์",
  test: "orders.accept",
  input: z.object({ unitId: unitIdOpt, prepMinutes: z.number().int().min(1).max(180).optional().describe("Preparation time in minutes (default = the channel's).") }).strict(),
  auditTarget: orderTarget,
  async handler({ actor, params, input }) {
    const unitId = await posOrderUnit(actor, params.id ?? "", input.unitId);
    return posData(await acceptOrder(ctxOf(actor, unitId), posRegisterActorOf(actor), { id: params.id ?? "", ...(input.prepMinutes ? { prepMinutes: input.prepMinutes } : {}) }));
  },
});

const ordersReject = definePosOp({
  id: "orders.reject",
  method: "POST",
  path: "/orders/{id}/reject",
  kind: "write",
  action: POS_SCOPES.orderReject,
  summary: "Reject a NEW order with a reason code (OUT_OF_STOCK, CLOSING, TOO_BUSY, OTHER).",
  label: "ปฏิเสธออเดอร์",
  test: "orders.reject",
  input: z
    .object({
      unitId: unitIdOpt,
      reasonCode: z.string().min(1).max(40).describe(`One of ${ORDER_REJECT_REASONS.join(", ")}.`),
      note: z.string().trim().max(200).optional().describe("Free text note (OTHER)."),
    })
    .strict(),
  auditTarget: orderTarget,
  async handler({ actor, params, input }) {
    const unitId = await posOrderUnit(actor, params.id ?? "", input.unitId);
    return posData(await rejectOrder(ctxOf(actor, unitId), posRegisterActorOf(actor), { id: params.id ?? "", reasonCode: input.reasonCode, ...(input.note ? { note: input.note } : {}) }));
  },
});

const ordersPreparing = definePosOp({
  id: "orders.preparing",
  method: "POST",
  path: "/orders/{id}/preparing",
  kind: "write",
  action: POS_SCOPES.orderAccept,
  summary: "Move an ACCEPTED order to PREPARING.",
  label: "เริ่มเตรียมออเดอร์",
  test: "orders.preparing",
  input: stepInput,
  auditTarget: orderTarget,
  async handler({ actor, params, input }) {
    const unitId = await posOrderUnit(actor, params.id ?? "", input.unitId);
    return posData(await markPreparing(ctxOf(actor, unitId), posRegisterActorOf(actor), { id: params.id ?? "" }));
  },
});

const ordersReady = definePosOp({
  id: "orders.ready",
  method: "POST",
  path: "/orders/{id}/ready",
  kind: "write",
  action: POS_SCOPES.orderAccept,
  summary: "Move a PREPARING order to READY.",
  label: "ออเดอร์พร้อมส่ง",
  test: "orders.ready",
  input: stepInput,
  auditTarget: orderTarget,
  async handler({ actor, params, input }) {
    const unitId = await posOrderUnit(actor, params.id ?? "", input.unitId);
    return posData(await markReady(ctxOf(actor, unitId), posRegisterActorOf(actor), { id: params.id ?? "" }));
  },
});

const ordersComplete = definePosOp({
  id: "orders.complete",
  method: "POST",
  path: "/orders/{id}/complete",
  kind: "write",
  action: POS_SCOPES.orderAccept,
  summary: "Hand over a READY order (HANDED).",
  label: "ส่งมอบออเดอร์",
  test: "orders.complete",
  input: stepInput,
  auditTarget: orderTarget,
  async handler({ actor, params, input }) {
    const unitId = await posOrderUnit(actor, params.id ?? "", input.unitId);
    return posData(await handOver(ctxOf(actor, unitId), posRegisterActorOf(actor), { id: params.id ?? "" }));
  },
});

const ordersCancel = definePosOp({
  id: "orders.cancel",
  method: "POST",
  path: "/orders/{id}/cancel",
  kind: "danger",
  action: POS_SCOPES.orderReject,
  summary: "Cancel an accepted order. If the order already has a bill, the bill is voided too, which needs pos.sale.void as well.",
  label: "ยกเลิกออเดอร์",
  test: "orders.cancel",
  input: z.object({ reason: z.string().trim().min(5).max(200).describe("Why the order is cancelled. Stored with the order and in the audit log."), unitId: unitIdOpt }).strict(),
  auditTarget: orderTarget,
  async handler({ actor, params, input, idempotencyKey, requestId }) {
    const unitId = await posOrderUnit(actor, params.id ?? "", input.unitId);
    return posData(
      await cancelOrder(ctxOf(actor, unitId), posRegisterActorOf(actor), { id: params.id ?? "", reason: input.reason, idempotencyKey: posOpServiceKey(actor, idempotencyKey, requestId) }),
    );
  },
});

const PAY_TYPES = ["CASH", "TRANSFER", "PROMPTPAY", "CARD"] as const;
const ordersPay = definePosOp({
  id: "orders.pay",
  method: "POST",
  path: "/orders/{id}/pay",
  kind: "write",
  action: POS_SCOPES.saleCreate,
  summary: "Take payment for an order of a DIRECT channel: opens the bill (stock, journal, receipt) and marks the order PAID. Payments must add up to the order total. Cash needs exactly one open shift at the branch (409 state_conflict otherwise).",
  label: "รับชำระออเดอร์",
  test: "orders.pay",
  input: z
    .object({
      unitId: unitIdOpt,
      payMethods: z
        .array(
          z
            .object({
              type: z.enum(PAY_TYPES).describe("CASH, TRANSFER, PROMPTPAY or CARD."),
              amountSatang: satang.min(1).describe("Amount, in satang."),
              reference: z.string().trim().min(1).max(60).optional().describe("Slip / terminal reference."),
            })
            .strict(),
        )
        .min(1)
        .max(10)
        .describe("Payments."),
      cashReceivedSatang: satang.optional().describe("Cash handed over (>= the CASH part)."),
    })
    .strict(),
  auditTarget: orderTarget,
  async handler({ actor, params, input, idempotencyKey, requestId }) {
    const unitId = await posOrderUnit(actor, params.id ?? "", input.unitId);
    return posData(
      await payOrder(ctxOf(actor, unitId), posRegisterActorOf(actor), {
        id: params.id ?? "",
        idempotencyKey: posOpServiceKey(actor, idempotencyKey, requestId),
        payMethods: input.payMethods,
        ...(input.cashReceivedSatang !== undefined ? { cashReceivedSatang: input.cashReceivedSatang } : {}),
      }),
    );
  },
});

export const ORDERS_OPS: ApiOp[] = [ordersList, ordersGet, ordersCreate, ordersAccept, ordersReject, ordersPreparing, ordersReady, ordersComplete, ordersCancel, ordersPay];
