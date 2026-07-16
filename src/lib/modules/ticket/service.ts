import { prisma, tenantDb } from "@/lib/core/db";
import type {
  Prisma,
  PrismaClient,
  TicketEventStatus,
  TicketOrderStatus,
} from "@prisma/client";
import * as pos from "@/lib/modules/pos/service";

type Client = PrismaClient | Prisma.TransactionClient;
type Ctx = { tenantId: string; unitId: string };

// ── helper: รันใน transaction ถ้ายังไม่อยู่ ──
async function withTx<T>(client: Client, fn: (tx: Client) => Promise<T>): Promise<T> {
  if ("$transaction" in client && typeof client.$transaction === "function") {
    return (client as PrismaClient).$transaction((tx) => fn(tx));
  }
  return fn(client);
}

// วันที่ตามเวลาไทย (สำหรับเลขที่รันต่อวัน) → "250711"
function bkkDayCode(): string {
  const d = new Date(Date.now() + 7 * 3600000);
  return `${String(d.getUTCFullYear()).slice(2)}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
}

// รหัสตั๋วสุ่ม (opaque) — base36 ~10 ตัว
function genCode(): string {
  const rand = () => Math.random().toString(36).slice(2, 7).toUpperCase();
  return `TK-${rand()}${rand()}`;
}

// ─────────────────────────── Event ───────────────────────────

export async function listEvents(tenantId: string, unitId: string) {
  const db = tenantDb({ tenantId, unitId });
  return db.ticketEvent.findMany({
    where: { tenantId, unitId, archivedAt: null },
    orderBy: [{ startAt: "desc" }],
    include: {
      ticketTypes: { where: { active: true } },
      _count: { select: { admissions: true } },
    },
    take: 200,
  });
}

export async function getEvent(tenantId: string, unitId: string, eventId: string) {
  const db = tenantDb({ tenantId, unitId });
  return db.ticketEvent.findFirst({
    where: { id: eventId, tenantId, unitId },
    include: {
      ticketTypes: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
    },
  });
}

// สรุปยอดขาย/ยอดคงเหลือ ต่ออีเวนต์
export async function eventSummary(tenantId: string, unitId: string, eventId: string) {
  const db = tenantDb({ tenantId, unitId });
  const [types, paidAgg, checkedIn, admTotal] = await Promise.all([
    db.ticketType.findMany({ where: { tenantId, unitId, eventId, active: true } }),
    db.ticketOrder.aggregate({
      where: { tenantId, unitId, eventId, status: "PAID" },
      _sum: { totalSatang: true },
      _count: true,
    }),
    db.ticketAdmission.count({ where: { tenantId, unitId, eventId, status: "CHECKED_IN" } }),
    db.ticketAdmission.count({
      where: { tenantId, unitId, eventId, status: { in: ["VALID", "CHECKED_IN"] } },
    }),
  ]);
  const quota = types.reduce((s, t) => s + t.quota, 0);
  const sold = types.reduce((s, t) => s + t.sold, 0);
  return {
    quota,
    sold,
    remaining: Math.max(0, quota - sold),
    paidRevenueSatang: paidAgg._sum.totalSatang ?? 0,
    paidOrders: paidAgg._count,
    admissionsTotal: admTotal,
    checkedIn,
  };
}

export async function createEvent(
  ctx: Ctx,
  input: { name: string; venue?: string; startAt: Date; endAt?: Date | null; description?: string },
) {
  const db = tenantDb(ctx);
  return db.ticketEvent.create({
    data: {
      ...ctx,
      name: input.name,
      venue: input.venue || null,
      startAt: input.startAt,
      endAt: input.endAt ?? null,
      description: input.description || null,
    },
  });
}

export async function updateEvent(
  ctx: Ctx,
  eventId: string,
  data: { name?: string; venue?: string | null; startAt?: Date; endAt?: Date | null; description?: string | null },
) {
  const db = tenantDb(ctx);
  await db.ticketEvent.update({ where: { id: eventId }, data });
}

export async function setEventStatus(ctx: Ctx, eventId: string, status: TicketEventStatus) {
  const db = tenantDb(ctx);
  await db.ticketEvent.update({
    where: { id: eventId },
    data: { status, publishedAt: status === "PUBLISHED" ? new Date() : undefined },
  });
}

export async function publishEvent(ctx: Ctx, eventId: string) {
  return setEventStatus(ctx, eventId, "PUBLISHED");
}

export async function archiveEvent(ctx: Ctx, eventId: string) {
  const db = tenantDb(ctx);
  await db.ticketEvent.update({ where: { id: eventId }, data: { archivedAt: new Date() } });
}

// ─────────────────────────── TicketType ───────────────────────────

export async function addTicketType(
  ctx: Ctx,
  eventId: string,
  input: { name: string; priceSatang: number; quota: number; description?: string; sortOrder?: number },
) {
  const db = tenantDb(ctx);
  // ยืนยันว่า event อยู่ใน scope นี้
  const event = await db.ticketEvent.findFirst({ where: { id: eventId, ...ctx } });
  if (!event) throw new Error("EVENT_NOT_FOUND");
  return db.ticketType.create({
    data: {
      ...ctx,
      eventId,
      name: input.name,
      priceSatang: input.priceSatang,
      quota: input.quota,
      description: input.description || null,
      sortOrder: input.sortOrder ?? 0,
    },
  });
}

export async function updateTicketType(
  ctx: Ctx,
  typeId: string,
  data: { name?: string; priceSatang?: number; quota?: number; description?: string | null; active?: boolean },
) {
  const db = tenantDb(ctx);
  await db.ticketType.update({ where: { id: typeId }, data });
}

// ปิดใช้งาน (ไม่ลบจริง — เก็บประวัติออเดอร์)
export async function deactivateTicketType(ctx: Ctx, typeId: string) {
  const db = tenantDb(ctx);
  await db.ticketType.update({ where: { id: typeId }, data: { active: false } });
}

// ─────────────────────────── Order / Admission ───────────────────────────

export type CreateOrderLine = { ticketTypeId: string; qty: number };

export type CreateOrderInput = {
  eventId: string;
  buyerName: string;
  buyerPhone?: string;
  lines: CreateOrderLine[];
  channel?: "STAFF" | "ONLINE";
  markPaid?: boolean; // ขายหน้างานจ่ายเลย
  note?: string;
};

export type CreateOrderResult =
  | { ok: true; orderId: string; orderNo: string; admissionCount: number; totalSatang: number }
  | { ok: false; reason: string };

// สร้างออเดอร์ (จอง/ขาย) → ตัดโควตา atomic + ออกตั๋วรายใบ (1 ใบ/ที่)
export async function createOrder(
  ctx: Ctx,
  input: CreateOrderInput,
  client: Client = prisma,
): Promise<CreateOrderResult> {
  const lines = input.lines.filter((l) => l.qty > 0);
  if (lines.length === 0) return { ok: false, reason: "กรุณาเลือกจำนวนตั๋วอย่างน้อย 1 ใบ" };
  if (!input.buyerName.trim()) return { ok: false, reason: "กรุณากรอกชื่อผู้ซื้อ" };

  try {
    const result = await withTx(client, async (tx) => {
      // ตรวจ event ในขอบเขต
      const event = await tx.ticketEvent.findFirst({
        where: { id: input.eventId, tenantId: ctx.tenantId, unitId: ctx.unitId },
      });
      if (!event) throw new Error("EVENT_NOT_FOUND");
      if (event.status === "CANCELLED" || event.status === "ENDED") {
        throw new Error("EVENT_CLOSED");
      }

      // เลขออเดอร์รันต่อ unit ต่อวัน
      const dayCode = bkkDayCode();
      const prefix = `TO-${dayCode}-`;
      const last = await tx.ticketOrder.findFirst({
        where: { tenantId: ctx.tenantId, unitId: ctx.unitId, orderNo: { startsWith: prefix } },
        orderBy: { orderNo: "desc" },
        select: { orderNo: true },
      });
      const seq = last ? parseInt(last.orderNo.slice(prefix.length), 10) + 1 : 1;
      const orderNo = `${prefix}${String(seq).padStart(4, "0")}`;

      let total = 0;
      const admissionData: {
        ticketTypeId: string;
        priceSatang: number;
      }[] = [];

      for (const line of lines) {
        const type = await tx.ticketType.findFirst({
          where: { id: line.ticketTypeId, tenantId: ctx.tenantId, unitId: ctx.unitId, eventId: input.eventId },
        });
        if (!type) throw new Error("TYPE_NOT_FOUND");
        if (!type.active) throw new Error("TYPE_INACTIVE");

        // ตัดโควตาแบบ atomic: เพิ่ม sold ก็ต่อเมื่อ sold ปัจจุบัน <= quota - qty
        // (quota เป็นค่าที่อ่านมาแล้ว → เงื่อนไข column ต่อค่าคงที่ ทำใน where ได้)
        const updated = await tx.ticketType.updateMany({
          where: {
            id: type.id,
            tenantId: ctx.tenantId,
            unitId: ctx.unitId,
            sold: { lte: type.quota - line.qty },
          },
          data: { sold: { increment: line.qty } },
        });
        if (updated.count === 0) {
          throw new Error(`SOLD_OUT:${type.name}`);
        }

        total += type.priceSatang * line.qty;
        for (let i = 0; i < line.qty; i++) {
          admissionData.push({ ticketTypeId: type.id, priceSatang: type.priceSatang });
        }
      }

      const paid = input.markPaid ?? false;
      const order = await tx.ticketOrder.create({
        data: {
          tenantId: ctx.tenantId,
          unitId: ctx.unitId,
          eventId: input.eventId,
          orderNo,
          buyerName: input.buyerName.trim(),
          buyerPhone: input.buyerPhone?.trim() || null,
          status: paid ? "PAID" : "PENDING",
          totalSatang: total,
          channel: input.channel ?? "STAFF",
          note: input.note?.trim() || null,
          paidAt: paid ? new Date() : null,
        },
      });

      // ออกตั๋วรายใบ + gen code (กันชนด้วย unique[unitId,code] → retry ในลูป)
      for (const a of admissionData) {
        await createAdmissionWithUniqueCode(tx, {
          tenantId: ctx.tenantId,
          unitId: ctx.unitId,
          eventId: input.eventId,
          orderId: order.id,
          ticketTypeId: a.ticketTypeId,
          priceSatang: a.priceSatang,
        });
      }

      return { orderId: order.id, orderNo, admissionCount: admissionData.length, totalSatang: total };
    });

    return { ok: true, ...result };
  } catch (e) {
    if (e instanceof Error) {
      if (e.message.startsWith("SOLD_OUT:")) {
        return { ok: false, reason: `ตั๋ว "${e.message.slice(9)}" เต็มแล้ว` };
      }
      if (e.message === "EVENT_NOT_FOUND") return { ok: false, reason: "ไม่พบอีเวนต์" };
      if (e.message === "EVENT_CLOSED") return { ok: false, reason: "อีเวนต์นี้ปิดการขายแล้ว" };
      if (e.message === "TYPE_NOT_FOUND") return { ok: false, reason: "ไม่พบประเภทตั๋ว" };
      if (e.message === "TYPE_INACTIVE") return { ok: false, reason: "ประเภทตั๋วนี้ปิดขายแล้ว" };
    }
    throw e;
  }
}

async function createAdmissionWithUniqueCode(
  tx: Client,
  data: { tenantId: string; unitId: string; eventId: string; orderId: string; ticketTypeId: string; priceSatang: number },
) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = genCode();
    const existing = await tx.ticketAdmission.findFirst({
      where: { unitId: data.unitId, code },
      select: { id: true },
    });
    if (existing) continue;
    return tx.ticketAdmission.create({ data: { ...data, code } });
  }
  throw new Error("CODE_GEN_FAILED");
}

// ยืนยันชำระเงิน (P1 = mark paid ด้วยมือ)
export async function markPaid(ctx: Ctx, orderId: string) {
  const db = tenantDb(ctx);
  const order = await db.ticketOrder.findFirst({
    where: { id: orderId, ...ctx },
    include: { event: true },
  });
  if (!order) throw new Error("ORDER_NOT_FOUND");
  if (order.status !== "PENDING") return; // idempotent — PAID/CANCELLED แล้วไม่ post ซ้ำ
  await db.ticketOrder.update({
    where: { id: orderId },
    data: { status: "PAID", paidAt: new Date() },
  });

  // ต่อสายเข้าบัญชี: ถ้า unit ผูกระบบ POS ไว้ → บันทึกการขาย (POS จะ post บัญชีตาม contract)
  // ถ้าไม่ผูก POS = ข้าม (ตั๋วขายได้แม้ standalone) · createSale idempotent + มี drainAll ในตัว (M1)
  // resolve system ผูก unit ด้วย prisma ตรง (ticket ห้าม import system module — fitness อนุมัติแค่ ticket→pos)
  const [posLink, pointLink] = await Promise.all([
    prisma.appSystemUnit.findUnique({
      where: { tenantId_unitId_type: { tenantId: ctx.tenantId, unitId: ctx.unitId, type: "POS" } },
    }),
    prisma.appSystemUnit.findUnique({
      where: { tenantId_unitId_type: { tenantId: ctx.tenantId, unitId: ctx.unitId, type: "POINT" } },
    }),
  ]);
  const posSystemId = posLink?.systemId ?? null;
  const pointSystemId = pointLink?.systemId ?? null;
  if (posSystemId && order.totalSatang > 0) {
    await pos.createSale({
      tenantId: ctx.tenantId,
      unitId: ctx.unitId,
      systemId: posSystemId,
      pointSystemId: pointSystemId ?? undefined,
      memberId: order.customerId ?? undefined,
      sourceModule: "TICKET",
      sourceId: orderId,
      idempotencyKey: `ticket-sale-${orderId}`,
      lines: [{ name: `ตั๋ว ${order.event.name}`, qty: 1, unitPriceSatang: order.totalSatang }],
      payMethods: [{ type: "CASH", amountSatang: order.totalSatang }],
    });
  }
}

// ยกเลิกออเดอร์ → คืนโควตา + void ตั๋วทุกใบ (atomic)
export async function cancelOrder(ctx: Ctx, orderId: string, client: Client = prisma) {
  await withTx(client, async (tx) => {
    const order = await tx.ticketOrder.findFirst({
      where: { id: orderId, tenantId: ctx.tenantId, unitId: ctx.unitId },
      include: { admissions: true },
    });
    if (!order) throw new Error("ORDER_NOT_FOUND");
    if (order.status === "CANCELLED") return; // idempotent

    // คืนโควตาต่อประเภท (นับเฉพาะตั๋วที่ยังไม่ VOID)
    const activeAdms = order.admissions.filter((a) => a.status !== "VOID");
    const perType = new Map<string, number>();
    for (const a of activeAdms) perType.set(a.ticketTypeId, (perType.get(a.ticketTypeId) ?? 0) + 1);
    for (const [ticketTypeId, qty] of perType) {
      await tx.ticketType.updateMany({
        where: { id: ticketTypeId, tenantId: ctx.tenantId, unitId: ctx.unitId },
        data: { sold: { decrement: qty } },
      });
    }

    await tx.ticketAdmission.updateMany({
      where: { orderId, tenantId: ctx.tenantId, unitId: ctx.unitId, status: { not: "VOID" } },
      data: { status: "VOID" },
    });
    await tx.ticketOrder.update({
      where: { id: orderId },
      data: { status: "CANCELLED", cancelledAt: new Date() },
    });
  });
}

// ─────────────────────────── Check-in ───────────────────────────

export type CheckInResult =
  | { ok: true; admission: { code: string; typeName: string; buyerName: string; eventName: string } }
  | { ok: false; reason: string; code: "NOT_FOUND" | "ALREADY" | "VOID" | "UNPAID" | "WRONG_EVENT" };

// เช็คอินด้วย code (VALID → CHECKED_IN, กันซ้ำแบบ atomic)
export async function checkIn(
  ctx: Ctx,
  code: string,
  opts: { eventId?: string; userId?: string } = {},
  client: Client = prisma,
): Promise<CheckInResult> {
  const clean = code.trim().toUpperCase();
  if (!clean) return { ok: false, reason: "กรุณากรอกรหัสตั๋ว", code: "NOT_FOUND" };

  return withTx(client, async (tx) => {
    const adm = await tx.ticketAdmission.findFirst({
      where: { unitId: ctx.unitId, tenantId: ctx.tenantId, code: clean },
      include: { ticketType: true, event: true, order: true },
    });
    if (!adm) return { ok: false, reason: "ไม่พบตั๋วรหัสนี้", code: "NOT_FOUND" as const };
    if (opts.eventId && adm.eventId !== opts.eventId) {
      return { ok: false, reason: `ตั๋วนี้เป็นของงาน "${adm.event.name}"`, code: "WRONG_EVENT" as const };
    }
    if (adm.status === "VOID") return { ok: false, reason: "ตั๋วนี้ถูกยกเลิกแล้ว", code: "VOID" as const };
    if (adm.status === "CHECKED_IN") {
      const t = adm.checkedInAt
        ? adm.checkedInAt.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" })
        : "";
      return { ok: false, reason: `ตั๋วนี้เช็คอินไปแล้ว ${t}`.trim(), code: "ALREADY" as const };
    }
    if (adm.order.status !== "PAID") {
      return { ok: false, reason: "ออเดอร์นี้ยังไม่ชำระเงิน", code: "UNPAID" as const };
    }

    // กันซ้ำ atomic: อัปเดตเฉพาะเมื่อยัง VALID
    const upd = await tx.ticketAdmission.updateMany({
      where: { id: adm.id, tenantId: ctx.tenantId, unitId: ctx.unitId, status: "VALID" },
      data: { status: "CHECKED_IN", checkedInAt: new Date(), checkedInBy: opts.userId ?? null },
    });
    if (upd.count === 0) return { ok: false, reason: "ตั๋วนี้เพิ่งถูกเช็คอินไปแล้ว", code: "ALREADY" as const };

    return {
      ok: true,
      admission: {
        code: adm.code,
        typeName: adm.ticketType.name,
        buyerName: adm.order.buyerName,
        eventName: adm.event.name,
      },
    };
  });
}

// รายการตั๋วของอีเวนต์ (สำหรับหน้าเช็คอิน/รายงาน)
export async function listAdmissions(
  tenantId: string,
  unitId: string,
  eventId: string,
  opts: { status?: "VALID" | "CHECKED_IN" | "VOID" } = {},
) {
  const db = tenantDb({ tenantId, unitId });
  return db.ticketAdmission.findMany({
    where: { tenantId, unitId, eventId, ...(opts.status ? { status: opts.status } : {}) },
    orderBy: { createdAt: "desc" },
    include: { ticketType: true, order: { select: { buyerName: true, orderNo: true } } },
    take: 500,
  });
}

// รายการออเดอร์ของอีเวนต์
export async function listOrders(tenantId: string, unitId: string, eventId: string) {
  const db = tenantDb({ tenantId, unitId });
  return db.ticketOrder.findMany({
    where: { tenantId, unitId, eventId },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { admissions: true } } },
    take: 200,
  });
}

// resolve unit จาก slug (public/no-auth) — เผื่อ storefront ภายหลัง
export async function resolveUnit(tenantSlug: string, unitSlug: string) {
  const tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
  if (!tenant || tenant.status !== "ACTIVE") return null;
  const unit = await prisma.businessUnit.findUnique({
    where: { tenantId_slug: { tenantId: tenant.id, slug: unitSlug } },
  });
  if (!unit || unit.status !== "ACTIVE" || unit.type !== "TICKET") return null;
  return { tenant, unit };
}

export type OrderStatusFilter = TicketOrderStatus;
