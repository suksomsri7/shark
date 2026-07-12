import { createHash } from "crypto";
import { prisma, tenantDb } from "@/lib/core/db";
import type { Prisma, RestOrderType, ServiceRequestType } from "@prisma/client";
import { createSale } from "@/lib/modules/pos/service";
import { systemForUnit } from "@/lib/modules/system/service";
import * as member from "@/lib/modules/member/service";
import { bizDateBkk, kitchenOpenNow } from "./scope";
import { getSetting } from "./menu";
import "./scope";

// ───────────────────────── ตะกร้า → validate → snapshot ─────────────────────────
export type CartLine = {
  menuItemId: string;
  qty: number;
  note?: string;
  choiceIds: string[]; // MenuOptionChoice.id ที่เลือก
};

type ResolvedLine = {
  menuItemId: string;
  stationId: string;
  nameSnapshot: string;
  unitPrice: number;
  optionsTotal: number;
  qty: number;
  note: string | null;
  lineTotal: number;
  options: { choiceId: string; groupSnapshot: string; choiceSnapshot: string; priceDelta: number }[];
};

export type OrderError =
  | { code: "KITCHEN_CLOSED"; reason: string }
  | { code: "ITEM_UNAVAILABLE"; reason: string; itemIds: string[] }
  | { code: "BAD_OPTIONS"; reason: string }
  | { code: "EMPTY"; reason: string }
  | { code: "OUT_OF_STOCK"; reason: string; itemIds: string[] };

// resolve + validate ทุกบรรทัด (86 / ตัวเลือก / min-max) — ยังไม่แตะ stock
async function resolveLines(
  db: ReturnType<typeof tenantDb>,
  cart: CartLine[],
  opts: { forPublic: boolean },
): Promise<{ ok: true; lines: ResolvedLine[] } | { ok: false; err: OrderError }> {
  if (cart.length === 0) return { ok: false, err: { code: "EMPTY", reason: "ยังไม่มีรายการ" } };
  const lines: ResolvedLine[] = [];
  const unavailable: string[] = [];

  for (const c of cart) {
    if (c.qty < 1) return { ok: false, err: { code: "BAD_OPTIONS", reason: "จำนวนไม่ถูกต้อง" } };
    const item = await db.menuItem.findFirst({
      where: { id: c.menuItemId, archivedAt: null },
      include: {
        optionGroups: {
          orderBy: { sortOrder: "asc" },
          include: { group: { include: { choices: { where: { archivedAt: null } } } } },
        },
      },
    });
    if (!item) {
      unavailable.push(c.menuItemId);
      continue;
    }
    // public: เห็นเฉพาะ ACTIVE + ไม่ 86 · staff: สั่ง HIDDEN ได้ แต่ 86 ก็สั่งไม่ได้
    if (item.isOutOfStock || (opts.forPublic && item.status !== "ACTIVE") || item.status === "ARCHIVED") {
      unavailable.push(c.menuItemId);
      continue;
    }

    // ตัวเลือก
    const chosen = new Set(c.choiceIds);
    const opt: ResolvedLine["options"] = [];
    let optionsTotal = 0;
    for (const link of item.optionGroups) {
      const g = link.group;
      const picked = g.choices.filter((ch) => chosen.has(ch.id));
      if (picked.length < g.minSelect || picked.length > g.maxSelect) {
        return {
          ok: false,
          err: { code: "BAD_OPTIONS", reason: `"${g.name}" เลือก ${g.minSelect}-${g.maxSelect} รายการ` },
        };
      }
      for (const ch of picked) {
        if (ch.isOutOfStock) {
          unavailable.push(c.menuItemId);
          break;
        }
        optionsTotal += ch.priceDelta;
        opt.push({ choiceId: ch.id, groupSnapshot: g.name, choiceSnapshot: ch.name, priceDelta: ch.priceDelta });
      }
    }

    lines.push({
      menuItemId: item.id,
      stationId: item.stationId,
      nameSnapshot: item.name,
      unitPrice: item.basePrice,
      optionsTotal,
      qty: c.qty,
      note: c.note?.trim() || null,
      lineTotal: (item.basePrice + optionsTotal) * c.qty,
      options: opt,
    });
  }

  if (unavailable.length > 0) {
    return {
      ok: false,
      err: { code: "ITEM_UNAVAILABLE", reason: "บางรายการหมด/ปิดขายแล้ว", itemIds: [...new Set(unavailable)] },
    };
  }
  return { ok: true, lines };
}

async function nextDailyNo(tx: Prisma.TransactionClient, tenantId: string, unitId: string, bizDate: string) {
  const counter = await tx.restaurantDailyCounter.upsert({
    where: { unitId_bizDate: { unitId, bizDate } },
    create: { tenantId, unitId, bizDate, seq: 1 },
    update: { seq: { increment: 1 } },
  });
  return counter.seq;
}

// ───────────────────────── สร้างออเดอร์ ─────────────────────────
export async function createOrder(input: {
  tenantId: string;
  unitId: string;
  type: RestOrderType;
  sessionId?: string;
  cart: CartLine[];
  note?: string;
  guestName?: string;
  guestPhone?: string;
  guestToken?: string;
  placedByUserId?: string; // มีค่า = staff (override เวลาครัวได้)
  pickupAt?: Date;
}): Promise<{ ok: true; id: string; dailyNo: number } | { ok: false; err: OrderError }> {
  const { tenantId, unitId } = input;
  const db = tenantDb({ tenantId, unitId });
  const isStaff = !!input.placedByUserId;

  // เวลาครัว (server-side) — staff override ได้
  const setting = await getSetting(tenantId, unitId);
  if (!isStaff) {
    const k = kitchenOpenNow(setting);
    if (!k.open) return { ok: false, err: { code: "KITCHEN_CLOSED", reason: k.reason || "ครัวปิด" } };
  }

  const resolved = await resolveLines(db, input.cart, { forPublic: !isStaff });
  if (!resolved.ok) return { ok: false, err: resolved.err };

  const bizDate = bizDateBkk();
  const requireApproval = input.type === "PICKUP" || (!isStaff && setting.requireApproval);
  const status = requireApproval ? "PENDING" : "CONFIRMED";

  try {
    const order = await prisma.$transaction(async (tx) => {
      // หัก stockQty แบบ atomic (conditional update) — กัน oversell
      const outOfStock: string[] = [];
      const byItem = new Map<string, number>();
      for (const l of resolved.lines) byItem.set(l.menuItemId, (byItem.get(l.menuItemId) ?? 0) + l.qty);
      for (const [itemId, qty] of byItem) {
        const it = await tx.menuItem.findFirst({ where: { id: itemId, tenantId, unitId }, select: { stockQty: true } });
        if (it?.stockQty == null) continue; // ไม่นับสต็อก
        const res = await tx.menuItem.updateMany({
          where: { id: itemId, tenantId, unitId, stockQty: { gte: qty } },
          data: { stockQty: { decrement: qty } },
        });
        if (res.count === 0) {
          outOfStock.push(itemId);
        } else {
          const after = await tx.menuItem.findFirst({ where: { id: itemId }, select: { stockQty: true } });
          if (after && after.stockQty !== null && after.stockQty <= 0) {
            await tx.menuItem.update({ where: { id: itemId }, data: { isOutOfStock: true } });
          }
        }
      }
      if (outOfStock.length > 0) throw new OrderTxError({ code: "OUT_OF_STOCK", reason: "บางรายการหมดพอดี", itemIds: outOfStock });

      const dailyNo = await nextDailyNo(tx, tenantId, unitId, bizDate);
      const ord = await tx.restaurantOrder.create({
        data: {
          tenantId,
          unitId,
          type: input.type,
          status,
          sessionId: input.sessionId ?? null,
          bizDate,
          dailyNo,
          guestName: input.guestName ?? null,
          guestPhone: input.guestPhone ?? null,
          guestToken: input.guestToken ?? null,
          note: input.note ?? null,
          placedByUserId: input.placedByUserId ?? null,
          pickupStatus: input.type === "PICKUP" ? "AWAITING_CONFIRM" : null,
          pickupAt: input.pickupAt ?? null,
        },
      });
      for (const l of resolved.lines) {
        const item = await tx.restaurantOrderItem.create({
          data: {
            tenantId,
            unitId,
            orderId: ord.id,
            menuItemId: l.menuItemId,
            stationId: l.stationId,
            nameSnapshot: l.nameSnapshot,
            unitPrice: l.unitPrice,
            optionsTotal: l.optionsTotal,
            qty: l.qty,
            lineTotal: l.lineTotal,
            note: l.note,
            kdsStatus: status === "CONFIRMED" ? "NEW" : "NEW",
          },
        });
        if (l.options.length > 0) {
          await tx.restaurantOrderItemOption.createMany({
            data: l.options.map((o) => ({
              tenantId,
              unitId,
              orderItemId: item.id,
              choiceId: o.choiceId,
              groupSnapshot: o.groupSnapshot,
              choiceSnapshot: o.choiceSnapshot,
              priceDelta: o.priceDelta,
            })),
          });
        }
      }
      return ord;
    });
    return { ok: true, id: order.id, dailyNo: order.dailyNo };
  } catch (e) {
    if (e instanceof OrderTxError) return { ok: false, err: e.err };
    throw e;
  }
}

class OrderTxError extends Error {
  err: OrderError;
  constructor(err: OrderError) {
    super(err.code);
    this.err = err;
  }
}

// ───────────────────────── ยกเลิก / expedite / รับออเดอร์ ─────────────────────────
export async function confirmOrder(tenantId: string, unitId: string, orderId: string) {
  const db = tenantDb({ tenantId, unitId });
  const ord = await db.restaurantOrder.findFirst({ where: { id: orderId } });
  if (!ord || ord.status !== "PENDING") return { ok: false as const, reason: "ออเดอร์นี้รับไม่ได้" };
  await db.restaurantOrder.update({
    where: { id: orderId },
    data: { status: "CONFIRMED", pickupStatus: ord.type === "PICKUP" ? "ACCEPTED" : ord.pickupStatus },
  });
  return { ok: true as const };
}

// ยกเลิกรายการรายจาน (คืน stock เฉพาะยังไม่ COOKING)
export async function cancelOrderItem(
  tenantId: string,
  unitId: string,
  itemId: string,
  reason: string,
  byUserId?: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  return prisma.$transaction(async (tx) => {
    const it = await tx.restaurantOrderItem.findFirst({ where: { id: itemId, tenantId, unitId } });
    if (!it) return { ok: false as const, reason: "ไม่พบรายการ" };
    if (it.saleId) return { ok: false as const, reason: "รายการนี้ชำระแล้ว แก้ไม่ได้" };
    if (it.kdsStatus === "CANCELLED") return { ok: false as const, reason: "ยกเลิกไปแล้ว" };
    if (it.kdsStatus === "SERVED") return { ok: false as const, reason: "เสิร์ฟแล้ว ยกเลิกไม่ได้" };
    // คืน stock ถ้ายังไม่เริ่มทำ
    if (it.menuItemId && (it.kdsStatus === "NEW")) {
      const mi = await tx.menuItem.findFirst({ where: { id: it.menuItemId }, select: { stockQty: true } });
      if (mi?.stockQty != null) {
        await tx.menuItem.update({
          where: { id: it.menuItemId },
          data: { stockQty: { increment: it.qty }, isOutOfStock: false },
        });
      }
    }
    await tx.restaurantOrderItem.update({
      where: { id: itemId },
      data: { kdsStatus: "CANCELLED", cancelledAt: new Date(), cancelReason: reason, cancelledByUserId: byUserId ?? null },
    });
    return { ok: true as const };
  });
}

export async function setOrderRush(tenantId: string, unitId: string, orderId: string, rush: boolean) {
  const db = tenantDb({ tenantId, unitId });
  await db.restaurantOrder.update({ where: { id: orderId }, data: { isRush: rush } });
  await db.restaurantOrderItem.updateMany({
    where: { orderId, kdsStatus: { in: ["NEW", "COOKING"] } },
    data: { isRush: rush },
  });
}

// ───────────────────────── Service requests ─────────────────────────
export async function createServiceRequest(
  tenantId: string,
  unitId: string,
  sessionId: string,
  type: ServiceRequestType,
  note?: string,
): Promise<{ ok: true; id: string } | { ok: false; reason: string }> {
  const db = tenantDb({ tenantId, unitId });
  // กันสแปม: มี request ประเภทเดิม PENDING ภายใน 2 นาที → ไม่สร้างซ้ำ
  const recent = await db.restaurantServiceRequest.findFirst({
    where: { sessionId, type, status: "PENDING", createdAt: { gte: new Date(Date.now() - 2 * 60_000) } },
  });
  if (recent) return { ok: true, id: recent.id };
  const r = await db.restaurantServiceRequest.create({ data: { tenantId, unitId, sessionId, type, note: note || null } });
  return { ok: true, id: r.id };
}

export async function ackServiceRequest(tenantId: string, unitId: string, id: string, byUserId?: string) {
  const db = tenantDb({ tenantId, unitId });
  await db.restaurantServiceRequest.update({
    where: { id },
    data: { status: "ACKED", ackedAt: new Date(), ackedByUserId: byUserId ?? null },
  });
}

export async function doneServiceRequest(tenantId: string, unitId: string, id: string) {
  const db = tenantDb({ tenantId, unitId });
  await db.restaurantServiceRequest.update({ where: { id }, data: { status: "DONE", doneAt: new Date() } });
}

export async function listServiceRequests(tenantId: string, unitId: string) {
  const db = tenantDb({ tenantId, unitId });
  return db.restaurantServiceRequest.findMany({
    where: { status: { in: ["PENDING", "ACKED"] } },
    orderBy: { createdAt: "asc" },
    include: { session: { include: { table: true } } },
  });
}

// ───────────────────────── บิล & ชำระเงิน (POS contract 2.1) ─────────────────────────
export type BillLine = {
  itemId: string;
  name: string; // nameSnapshot + options
  qty: number;
  unitPriceSatang: number; // unitPrice + optionsTotal
  lineTotalSatang: number;
};

export async function billPreview(tenantId: string, unitId: string, sessionId: string) {
  const db = tenantDb({ tenantId, unitId });
  const setting = await getSetting(tenantId, unitId);
  const items = await db.restaurantOrderItem.findMany({
    where: { order: { sessionId }, kdsStatus: { not: "CANCELLED" }, saleId: null },
    include: { options: true },
    orderBy: { createdAt: "asc" },
  });
  const lines: BillLine[] = items.map((it) => {
    const optNames = it.options.map((o) => o.choiceSnapshot).join(", ");
    return {
      itemId: it.id,
      name: optNames ? `${it.nameSnapshot} (${optNames})` : it.nameSnapshot,
      qty: it.qty,
      unitPriceSatang: it.unitPrice + it.optionsTotal,
      lineTotalSatang: it.lineTotal,
    };
  });
  const subtotal = lines.reduce((s, l) => s + l.lineTotalSatang, 0);
  const serviceCharge = Math.floor((subtotal * setting.serviceChargeBps) / 10000);
  return { lines, subtotalSatang: subtotal, serviceChargeSatang: serviceCharge, totalSatang: subtotal + serviceCharge, serviceChargeBps: setting.serviceChargeBps };
}

// เช็คบิล — เรียก POS createSale ถ้าผูก POS · ไม่ผูก → บันทึกปิดโต๊ะแบบง่าย
export async function checkout(input: {
  tenantId: string;
  unitId: string;
  sessionId: string;
  itemIds?: string[]; // undefined/[] = ทั้งหมดที่ค้าง
  memberId?: string;
  payMethod?: "CASH" | "TRANSFER" | "PROMPTPAY";
}): Promise<
  | { ok: true; saleId: string; receiptNo: string | null; totalSatang: number; pointEarned: number; sessionClosed: boolean }
  | { ok: false; reason: string }
> {
  const { tenantId, unitId, sessionId } = input;
  const db = tenantDb({ tenantId, unitId });
  const setting = await getSetting(tenantId, unitId);

  // เลือกรายการที่จะชำระ
  const allUnpaid = await db.restaurantOrderItem.findMany({
    where: { order: { sessionId }, kdsStatus: { not: "CANCELLED" }, saleId: null },
    include: { options: true },
    orderBy: { createdAt: "asc" },
  });
  const target = input.itemIds && input.itemIds.length > 0 ? allUnpaid.filter((it) => input.itemIds!.includes(it.id)) : allUnpaid;
  if (target.length === 0) return { ok: false, reason: "ไม่มีรายการค้างชำระ" };

  const session = await db.tableSession.findFirst({ where: { id: sessionId } });
  if (!session) return { ok: false, reason: "ไม่พบ session" };
  const memberId = input.memberId ?? session.memberId ?? undefined;

  const posLines = target.map((it) => {
    const optNames = it.options.map((o) => o.choiceSnapshot).join(", ");
    return {
      name: optNames ? `${it.nameSnapshot} (${optNames})` : it.nameSnapshot,
      qty: it.qty,
      unitPriceSatang: it.unitPrice + it.optionsTotal,
    };
  });
  const subtotal = target.reduce((s, it) => s + it.lineTotal, 0);
  const serviceCharge = Math.floor((subtotal * setting.serviceChargeBps) / 10000);
  if (serviceCharge > 0) {
    posLines.push({ name: `Service charge ${setting.serviceChargeBps / 100}%`, qty: 1, unitPriceSatang: serviceCharge });
  }
  const total = subtotal + serviceCharge;
  const idempotencyKey = "rest-" + createHash("sha256").update(`${sessionId}:${target.map((t) => t.id).sort().join(",")}`).digest("hex").slice(0, 40);
  const payType = input.payMethod ?? "CASH";

  const posSystemId = await systemForUnit(tenantId, unitId, "POS");

  let saleId: string;
  let receiptNo: string | null = null;
  let pointEarned = 0;

  if (posSystemId) {
    const pointSystemId = (await systemForUnit(tenantId, unitId, "POINT")) ?? undefined;
    try {
      const sale = await createSale({
        tenantId,
        unitId,
        systemId: posSystemId,
        pointSystemId,
        memberId,
        sourceModule: "RESTAURANT",
        sourceId: sessionId,
        idempotencyKey,
        lines: posLines.map((l) => ({ name: l.name, qty: l.qty, unitPriceSatang: l.unitPriceSatang })),
        payMethods: [{ type: payType, amountSatang: total }],
      });
      saleId = sale.saleId;
      receiptNo = sale.receiptNo;
      pointEarned = sale.pointEarned;
    } catch (e) {
      return { ok: false, reason: e instanceof Error ? e.message : "ชำระเงินไม่สำเร็จ" };
    }
  } else {
    // fallback ไม่ผูก POS — บันทึกปิดโต๊ะแบบง่าย (ยอดรวม), member activity ถ้ามี
    saleId = idempotencyKey;
    if (memberId) {
      const memberSystemId = await systemForUnit(tenantId, unitId, "MEMBER");
      if (memberSystemId) {
        await member.logActivity({
          tenantId,
          customerId: memberId,
          unitId,
          module: "restaurant",
          type: "ORDER_PAID",
          refType: "TableSession",
          refId: sessionId,
          summary: `ปิดโต๊ะ ฿${(total / 100).toLocaleString("th-TH")}`,
        });
      }
    }
  }

  // lock รายการ + ปิด session ถ้าจ่ายครบ
  let sessionClosed = false;
  await prisma.$transaction(async (tx) => {
    await tx.restaurantOrderItem.updateMany({
      where: { id: { in: target.map((t) => t.id) }, tenantId, unitId, saleId: null },
      data: { saleId, settledAt: new Date() },
    });
    const remaining = await tx.restaurantOrderItem.count({
      where: { order: { sessionId }, tenantId, unitId, kdsStatus: { not: "CANCELLED" }, saleId: null },
    });
    if (remaining === 0) {
      await tx.tableSession.update({ where: { id: sessionId }, data: { status: "CLOSED", closedAt: new Date() } });
      sessionClosed = true;
    }
  });

  return { ok: true, saleId, receiptNo, totalSatang: total, pointEarned, sessionClosed };
}

// ───────────────────────── Dashboard: orders วันนี้ ─────────────────────────
export async function ordersToday(tenantId: string, unitId: string) {
  const db = tenantDb({ tenantId, unitId });
  const bizDate = bizDateBkk();
  const orders = await db.restaurantOrder.findMany({
    where: { bizDate },
    orderBy: { createdAt: "desc" },
    include: { items: { where: { kdsStatus: { not: "CANCELLED" } } }, session: { include: { table: true } } },
  });
  let revenue = 0;
  let paidCount = 0;
  for (const o of orders) {
    const paid = o.items.filter((it) => it.saleId);
    if (paid.length > 0) paidCount++;
    for (const it of paid) revenue += it.lineTotal;
  }
  return { orders, count: orders.length, paidCount, revenueSatang: revenue };
}
