import { prisma } from "@/lib/core/db";
import type { Prisma, PrismaClient, PosPayType } from "@prisma/client";
import * as point from "@/lib/modules/point/service";
import * as member from "@/lib/modules/member/service";
import * as coupon from "@/lib/modules/coupon/service";
import * as inventory from "@/lib/modules/inventory/service";
import { systemForUnit } from "@/lib/modules/system/service";
import { emitOutbox } from "@/lib/core/outbox";
import { drainAll } from "@/lib/outbox-consumers";

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
  // itemId = InvItem.id ที่ผูก → ตัดสต็อก + COGS perpetual (null/ไม่ระบุ = รายการเพิ่มเอง/บริการ ไม่ตัดสต็อก)
  lines: { name: string; qty: number; unitPriceSatang: number; discountSatang?: number; itemId?: string }[];
  billDiscountSatang?: number;
  // คูปอง (contract 2.3) — ต้องมาคู่กันเสมอ · ระบุแล้วใช้ไม่ได้ = โยน error (ห้ามขายต่อเงียบ ๆ)
  couponSystemId?: string;
  couponCode?: string;
  payMethods: { type: PosPayType; amountSatang: number; refSaleId?: string }[];
};

export type SaleResult = {
  saleId: string;
  receiptNo: string | null;
  grandTotalSatang: number;
  pointEarned: number;
};

export async function createSale(input: CreateSaleInput, client: Client = prisma): Promise<SaleResult> {
  // เราเปิด tx เอง (client = prisma) → drain outbox ได้หลัง commit · ถ้าถูกเรียกใน tx ผู้อื่น ปล่อยให้ cron เก็บ
  const ownsTx = "$transaction" in client && typeof (client as PrismaClient).$transaction === "function";
  const result = await withTx(client, async (tx) => {
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

    // ── คูปอง (contract 2.1/2.3): หักก่อน VAT · ฐาน = subtotal หลังส่วนลดบรรทัด+ท้ายบิล ──
    // validate (read-only) ที่นี่เพื่อได้ยอดส่วนลด + ล้มเสียงดังก่อนสร้างบิล · redeem ตัวจริงอยู่ใน tx หลังสร้างบิล
    const couponBase = subtotal - billDiscount;
    const hasCoupon = !!(input.couponSystemId || input.couponCode);
    let couponDiscount = 0;
    if (hasCoupon) {
      if (!input.couponSystemId || !input.couponCode) {
        throw new Error("คูปองใช้ไม่ได้: ต้องระบุทั้งระบบคูปองและโค้ดคูปอง");
      }
      const v = await coupon.validate({
        code: input.couponCode,
        tenantId: input.tenantId,
        systemId: input.couponSystemId,
        memberId: input.memberId ?? null,
        amountSatang: couponBase,
        unitId: input.unitId,
      });
      if (!v.ok) throw new Error(`คูปองใช้ไม่ได้: ${coupon.couponReasonText(v.reason)}`);
      couponDiscount = v.discountSatang;
    }

    const vat = 0; // MVP
    const grandTotal = subtotal - billDiscount - couponDiscount + vat;
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
        discountSatang: billDiscount + couponDiscount,
        vatSatang: vat,
        grandTotalSatang: grandTotal,
        paidAt: new Date(),
      },
    });
    await tx.posSaleLine.createMany({
      data: lines.map((l) => ({ tenantId: input.tenantId, unitId: input.unitId, saleId: sale.id, name: l.name, qty: l.qty, unitPriceSatang: l.unitPriceSatang, discountSatang: l.discountSatang, lineTotalSatang: l.lineTotalSatang, itemId: l.itemId ?? null })),
    });
    await tx.posPayment.createMany({
      data: input.payMethods.map((p) => ({ tenantId: input.tenantId, unitId: input.unitId, saleId: sale.id, type: p.type, amountSatang: p.amountSatang, refSaleId: p.refSaleId })),
    });

    // คูปอง: redeem ตัวจริง (atomic re-validate) ผูกกับบิล — ใน tx เดียวกัน · ล้ม = rollback ทั้งบิล
    if (hasCoupon) {
      const r = await coupon.redeem(
        {
          code: input.couponCode!,
          tenantId: input.tenantId,
          systemId: input.couponSystemId!,
          memberId: input.memberId ?? null,
          amountSatang: couponBase,
          unitId: input.unitId,
          saleId: sale.id,
          refType: "PosSale",
          refId: sale.id,
          status: "REDEEMED",
        },
        tx as Prisma.TransactionClient,
      );
      if (!r.ok) throw new Error(`คูปองใช้ไม่ได้: ${coupon.couponReasonText(r.reason)}`);
    }

    // outbox: ยอดขาย → บัญชี (contract 2.4) — เขียน event ใน tx เดียวกับบิล (atomic)
    await emitOutbox(tx as Prisma.TransactionClient, {
      tenantId: input.tenantId,
      type: "pos.sale.paid",
      idempotencyKey: `PosSale#${sale.id}#PAID`,
      payload: { saleId: sale.id },
      systemId: input.systemId,
      unitId: input.unitId,
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

  // ── หลัง tx commit: ตัดสต็อก (perpetual) + post บัญชี ──
  // ทำเฉพาะเมื่อ createSale เป็นเจ้าของ tx (ownsTx = commit แน่แล้ว) — ถ้าถูกเรียกใน tx ผู้อื่น
  //   ปล่อยให้ flow นั้นจัดการ (เลี่ยง orphan movement ถ้า tx นอกโดน rollback)
  if (ownsTx) {
    // ตัดสต็อกเฉพาะบิลที่มี line ผูก itemId — inventory.consume เปิด tx เอง + โพสต์ COGS หลัง tx
    //   (Dr5000/Cr1200 ผ่าน bridge) จึงทำนอก tx ของบิล = เลี่ยง nested tx
    if (input.lines.some((l) => l.itemId)) await consumeSaleInventory(input.tenantId, input.unitId, result.saleId);
    void drainAll().catch(() => {}); // post ยอดขาย→บัญชี · cron /api/cron/outbox เก็บตกถ้าล้ม
  }
  return result;
}

// ── ตัดสต็อกของบิล (perpetual) — เรียกหลัง createSale commit เท่านั้น ──
// เฉพาะบิล PAID + line ที่ผูก itemId · idempotent ต่อ line (pos-consume-<saleId>-<lineId>) → retry/replay ไม่ตัดซ้ำ
//   (ดึง line จาก DB → รองรับ retry หลัง crash: บิลถูกสร้างแล้วแต่ยังไม่ตัดสต็อก ก็ตัดครบ)
// ไม่มีระบบ INVENTORY ผูก unit → ไม่ตัด (ขายบริการ/ร้านไม่ใช้คลัง — ปกติ ไม่ error)
// สต็อกไม่พอ → inventory.consume ยอมติดลบ ไม่ block (เงินสำคัญกว่า · ตั้งธง needsReview ให้ร้านเคลียร์)
// ตัดล้มรายบรรทัด (เช่น item ถูกลบ) → catch ไว้ (บิลชำระแล้ว ห้าม rollback การขาย)
async function consumeSaleInventory(tenantId: string, unitId: string, saleId: string): Promise<void> {
  const sale = await prisma.posSale.findFirst({ where: { id: saleId, tenantId }, select: { status: true } });
  if (!sale || sale.status !== "PAID") return; // void แล้ว = อย่าตัด
  const lines = await prisma.posSaleLine.findMany({
    where: { tenantId, saleId, itemId: { not: null } },
    select: { id: true, itemId: true, qty: true },
  });
  if (lines.length === 0) return;
  const inventorySystemId = await systemForUnit(tenantId, unitId, "INVENTORY");
  if (!inventorySystemId) return;
  const invCtx = { tenantId, systemId: inventorySystemId };
  for (const l of lines) {
    if (!l.itemId) continue;
    try {
      await inventory.consume(invCtx, {
        itemId: l.itemId,
        qty: l.qty,
        sourceModule: "POS",
        refType: "PosSale",
        refId: saleId,
        idempotencyKey: `pos-consume-${saleId}-${l.id}`,
      });
    } catch {
      // ตัดสต็อกล้ม → บิลชำระแล้ว ปล่อยผ่าน (ไม่ล้มการขาย)
    }
  }
}

// void: กลับรายการ (คืนแต้ม + สถานะ)
export async function voidSale(tenantId: string, unitId: string, saleId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const sale = await tx.posSale.findFirst({ where: { id: saleId, tenantId, unitId } });
    if (!sale || sale.status !== "PAID") throw new Error("บิลนี้ void ไม่ได้");
    await tx.posSale.update({ where: { id: saleId }, data: { status: "VOIDED" } });
    // outbox: void → กลับรายการบัญชี (contract 2.4)
    await emitOutbox(tx, {
      tenantId,
      type: "pos.sale.voided",
      idempotencyKey: `PosSale#${saleId}#VOIDED`,
      payload: { saleId },
      systemId: sale.systemId,
      unitId,
    });
    // คูปอง: คืนสิทธิ์ทุกใบที่ผูกกับบิลนี้ (status → RELEASED, usedCount ลด) — contract 2.3
    const redeemedSystems = await tx.couponRedemption.findMany({
      where: { tenantId, refType: "PosSale", refId: saleId, status: { in: ["RESERVED", "REDEEMED"] } },
      select: { systemId: true },
      distinct: ["systemId"],
    });
    for (const { systemId } of redeemedSystems) {
      await coupon.release({ tenantId, systemId, refType: "PosSale", refId: saleId, reason: "void บิล POS" }, tx);
    }

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

  // best-effort หลัง commit — cron เก็บตกถ้าล้ม
  void drainAll().catch(() => {});

  // คืนสต็อก + กลับ COGS (perpetual) — นอก tx (inventory.receive เปิด tx เอง + โพสต์ Dr1200/Cr5000 หลัง tx)
  await restoreVoidedInventory(tenantId, unitId, saleId);
}

// ── คืนสต็อกของบิลที่ถูก void (perpetual) — mirror consumeSaleInventory ──
// วนตาม InvMovement OUT ที่ตัดจริงตอนขาย (refType PosSale, sourceModule POS) → คืนตรงเป๊ะกับที่ตัด
//   (แม้ line ซ้ำ itemId ก็คืนครบ) · คืนที่ต้นทุนปัจจุบันของ item → ต้นทุนถัวเฉลี่ยไม่เพี้ยน
// idempotent ต่อ movement (pos-refund-<saleId>-<movementId>) → void/retry ซ้ำไม่คืนเบิ้ล
//   (voidSale โยน error ถ้าบิลไม่ใช่ PAID อยู่แล้ว แต่ receive key ยังกันเบิ้ลอีกชั้น)
// idempotencyKey มี "refund" + sourceModule POS → bridge ลง Dr1200/Cr5000 (กลับต้นทุนขาย)
// ไม่มีระบบ INVENTORY / item ถูกลบ / receive ล้ม → ข้ามเงียบ (บัญชีขาย void แล้ว ห้ามล้มการคืนเงิน)
async function restoreVoidedInventory(tenantId: string, unitId: string, saleId: string): Promise<void> {
  const inventorySystemId = await systemForUnit(tenantId, unitId, "INVENTORY");
  if (!inventorySystemId) return;
  const invCtx = { tenantId, systemId: inventorySystemId };
  const outMoves = await prisma.invMovement.findMany({
    where: { tenantId, systemId: inventorySystemId, type: "OUT", refType: "PosSale", refId: saleId, sourceModule: "POS" },
    select: { id: true, itemId: true, qtyDelta: true },
  });
  for (const mv of outMoves) {
    const returnQty = -mv.qtyDelta; // qtyDelta ติดลบตอนตัด → คืนเท่าที่ตัดจริง
    if (returnQty <= 0) continue;
    const item = await prisma.invItem.findFirst({ where: { id: mv.itemId, tenantId }, select: { costSatang: true } });
    if (!item) continue; // สินค้าถูกลบจากคลัง → ไม่มีที่ให้คืน
    try {
      await inventory.receive(invCtx, {
        itemId: mv.itemId,
        qty: returnQty,
        costSatang: item.costSatang, // คืนที่ต้นทุนปัจจุบัน → ต้นทุนถัวเฉลี่ยไม่เพี้ยน
        idempotencyKey: `pos-refund-${saleId}-${mv.id}`,
        sourceModule: "POS",
        refType: "PosSale",
        refId: saleId,
        note: "คืนสต็อกจากการยกเลิกบิล POS",
      });
    } catch {
      // คืนล้ม → ปล่อยผ่าน (บัญชีขาย void แล้ว)
    }
  }
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
