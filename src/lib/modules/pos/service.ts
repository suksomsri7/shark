import { prisma } from "@/lib/core/db";
import type { Prisma, PrismaClient, PosPayType } from "@prisma/client";
import * as point from "@/lib/modules/point/service";
import * as member from "@/lib/modules/member/service";
import { systemForUnit } from "@/lib/modules/system/service";

// POS createSale — contract 2.1 (จุดตัดเงินกลาง). MVP: PAID_NOW
type Client = PrismaClient | Prisma.TransactionClient;

async function withTx<T>(client: Client, fn: (tx: Client) => Promise<T>): Promise<T> {
  if ("$transaction" in client && typeof client.$transaction === "function") {
    return (client as PrismaClient).$transaction((tx) => fn(tx));
  }
  return fn(client);
}

function bkkPeriod(): string {
  const d = new Date(Date.now() + 7 * 3600000);
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

const NON_EARN: PosPayType[] = ["DEPOSIT", "ROOM_CHARGE"];

export type CreateSaleInput = {
  tenantId: string;
  unitId: string;
  systemId: string; // ระบบ POS
  pointSystemId?: string; // ระบบแต้ม (สำหรับสะสม) — null = ไม่สะสม
  memberId?: string;
  sourceModule?: string;
  sourceId?: string;
  idempotencyKey: string;
  lines: { name: string; qty: number; unitPriceSatang: number; discountSatang?: number }[];
  billDiscountSatang?: number;
  payMethods: { type: PosPayType; amountSatang: number; refSaleId?: string }[];
};

export type SaleResult = {
  saleId: string;
  receiptNo: string | null;
  grandTotalSatang: number;
  pointEarned: number;
};

export async function createSale(input: CreateSaleInput, client: Client = prisma): Promise<SaleResult> {
  return withTx(client, async (tx) => {
    // idempotent
    const dup = await tx.posSale.findUnique({
      where: { tenantId_idempotencyKey: { tenantId: input.tenantId, idempotencyKey: input.idempotencyKey } },
    });
    if (dup) {
      return {
        saleId: dup.id,
        receiptNo: dup.receiptNo,
        grandTotalSatang: dup.grandTotalSatang,
        pointEarned: dup.pointEarned,
      };
    }

    const lines = input.lines.map((l) => ({
      ...l,
      discountSatang: l.discountSatang ?? 0,
      lineTotalSatang: l.unitPriceSatang * l.qty - (l.discountSatang ?? 0),
    }));
    const subtotal = lines.reduce((s, l) => s + l.lineTotalSatang, 0);
    const billDiscount = input.billDiscountSatang ?? 0;
    const vat = 0; // MVP
    const grandTotal = subtotal - billDiscount + vat;
    const paidSum = input.payMethods.reduce((s, p) => s + p.amountSatang, 0);
    if (paidSum !== grandTotal) {
      throw new Error(`PAYMENT_MISMATCH: จ่าย ${paidSum} ≠ ยอด ${grandTotal}`);
    }

    // เลขใบเสร็จรันต่อ unit/เดือน
    const period = bkkPeriod();
    const counter = await tx.posReceiptCounter.upsert({
      where: { unitId_period: { unitId: input.unitId, period } },
      create: { tenantId: input.tenantId, unitId: input.unitId, period, seq: 1 },
      update: { seq: { increment: 1 } },
    });
    const receiptNo = `${period}-${String(counter.seq).padStart(4, "0")}`;

    const sale = await tx.posSale.create({
      data: {
        tenantId: input.tenantId,
        unitId: input.unitId,
        systemId: input.systemId,
        memberId: input.memberId,
        sourceModule: input.sourceModule ?? "POS",
        sourceId: input.sourceId,
        idempotencyKey: input.idempotencyKey,
        receiptNo,
        status: "PAID",
        subtotalSatang: subtotal,
        discountSatang: billDiscount,
        vatSatang: vat,
        grandTotalSatang: grandTotal,
        paidAt: new Date(),
      },
    });
    await tx.posSaleLine.createMany({
      data: lines.map((l) => ({ tenantId: input.tenantId, unitId: input.unitId, saleId: sale.id, name: l.name, qty: l.qty, unitPriceSatang: l.unitPriceSatang, discountSatang: l.discountSatang, lineTotalSatang: l.lineTotalSatang })),
    });
    await tx.posPayment.createMany({
      data: input.payMethods.map((p) => ({ tenantId: input.tenantId, unitId: input.unitId, saleId: sale.id, type: p.type, amountSatang: p.amountSatang, refSaleId: p.refSaleId })),
    });

    // side effects (แกนกลาง Point + Member) — ใน tx เดียวกัน
    let pointEarned = 0;
    if (input.memberId) {
      const earnable = input.payMethods
        .filter((p) => !NON_EARN.includes(p.type))
        .reduce((s, p) => s + p.amountSatang, 0);
      await member.recordSpend(input.tenantId, input.memberId, grandTotal, tx);
      if (earnable > 0 && input.pointSystemId) {
        const res = await point.earn(
          {
            tenantId: input.tenantId,
            systemId: input.pointSystemId,
            customerId: input.memberId,
            unitId: input.unitId,
            amountSatang: earnable,
            sourceModule: input.sourceModule ?? "POS",
            refType: "PosSale",
            refId: sale.id,
            idempotencyKey: `pos-earn-${sale.id}`,
          },
          tx,
        );
        pointEarned = res.pointsEarned;
      }
      await member.logActivity(
        {
          tenantId: input.tenantId,
          customerId: input.memberId,
          unitId: input.unitId,
          module: "pos",
          type: "PURCHASE",
          refType: "PosSale",
          refId: sale.id,
          summary: `ชำระเงิน ฿${(grandTotal / 100).toLocaleString("th-TH")} (ใบเสร็จ ${receiptNo})`,
        },
        tx,
      );
    }

    if (pointEarned > 0) {
      await tx.posSale.update({ where: { id: sale.id }, data: { pointEarned } });
    }
    return { saleId: sale.id, receiptNo, grandTotalSatang: grandTotal, pointEarned };
  });
}

// void: กลับรายการ (คืนแต้ม + สถานะ)
export async function voidSale(tenantId: string, unitId: string, saleId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const sale = await tx.posSale.findFirst({ where: { id: saleId, tenantId, unitId } });
    if (!sale || sale.status !== "PAID") throw new Error("บิลนี้ void ไม่ได้");
    await tx.posSale.update({ where: { id: saleId }, data: { status: "VOIDED" } });
    if (sale.memberId) {
      const pointSystemId = await systemForUnit(tenantId, unitId, "POINT", tx);
      if (pointSystemId) {
        await point.reverse(
          { tenantId, systemId: pointSystemId, refType: "PosSale", refId: saleId, idempotencyKey: `pos-void-${saleId}` },
          tx,
        );
      }
      await member.recordSpend(tenantId, sale.memberId, -sale.grandTotalSatang, tx);
    }
  });
}

// รายการขาย (dashboard)
export async function listSales(tenantId: string, unitId: string, sinceDateStr: string) {
  const since = new Date(sinceDateStr + "T00:00:00Z");
  return prisma.posSale.findMany({
    where: { tenantId, unitId, createdAt: { gte: since } },
    orderBy: { createdAt: "desc" },
    include: { lines: true },
    take: 200,
  });
}

// สรุปยอดขายวันนี้ (BKK)
export async function daySummary(tenantId: string, unitId: string): Promise<{ count: number; totalSatang: number }> {
  const d = new Date(Date.now() + 7 * 3600000);
  const dateStr = d.toISOString().slice(0, 10);
  const start = new Date(new Date(dateStr + "T00:00:00Z").getTime() - 7 * 3600000);
  const sales = await prisma.posSale.findMany({
    where: { tenantId, unitId, status: "PAID", createdAt: { gte: start } },
    select: { grandTotalSatang: true },
  });
  return { count: sales.length, totalSatang: sales.reduce((s, x) => s + x.grandTotalSatang, 0) };
}
