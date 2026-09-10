import { prisma } from "@/lib/core/db";
import type { Prisma, PrismaClient, PosPayType } from "@prisma/client";
import * as coupon from "@/lib/modules/coupon/service";
import * as inventory from "@/lib/modules/inventory/service";
import { systemForUnit } from "@/lib/modules/system/service";
import { emitOutbox } from "@/lib/core/outbox";
import { scheduleDrain } from "@/lib/outbox-consumers";

// POS createSale — contract 2.1 (จุดตัดเงินกลาง). MVP: PAID_NOW
//
// ── M2.8: อะไรอยู่ใน tx ของบิล อะไรไปคิว (§9.1) ─────────────────────────────
// ใน tx (ต้องอะตอมมิกกับการรับเงิน — พลาดแล้วลูกค้าเสียของ/จ่ายเกิน):
//   คูปอง redeem · `member.applyOnSale` (voucher USED · แต้ม BURN · ตัดยอดบัตรกำนัล) · ยอดที่ต้องจ่าย
// นอก tx ผ่านคิว `pos.sale.paid` → `src/lib/member-bridges.ts` (ของแถมที่มาช้าได้):
//   ยอดใช้จ่ายสะสม · แต้มที่ได้ · สแตมป์ · ที่มาซื้อครั้งแรก · เลื่อนระดับ · ไทม์ไลน์
// 🔴 เหตุผล: กฎแต้ม/สแตมป์/ระดับพัง **ห้ามทำให้ขายของไม่ได้** — เงินเข้าก่อนเสมอ
//    ⇒ `pointEarned` ตอน commit จึงเป็น 0 เสมอ แล้วสะพานเขียนทับหลังคิวระบาย
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

/**
 * สิทธิ์สมาชิกที่พนักงาน/ลูกค้า "เลือกใช้" กับบิลนี้ (M2.8 · §9.1)
 * ส่วนลดระดับไม่ต้องเลือก — ใช้อัตโนมัติทุกบิลของสมาชิก · ลำดับ/กันซ้อนอยู่ที่ `member.quoteApply`
 */
export type MemberSaleChoices = {
  voucherIds?: string[];
  points?: number;
  giftCard?: { number: string; pin: string; satang: number };
};

export type CreateSaleInput = {
  tenantId: string;
  unitId: string;
  systemId: string; // ระบบ POS
  pointSystemId?: string; // ระบบแต้ม (สำหรับสะสม) — null = ไม่สะสม
  memberId?: string;
  /** ระบบสมาชิกของบิลนี้ — ไม่ส่ง = หาจากสาขาเอง (บิลเดิมที่ส่งแค่ memberId ยังทำงานเหมือนเดิม) */
  memberSystemId?: string;
  /** สิทธิ์ที่เลือกใช้ — ไม่ส่ง = ได้ส่วนลดระดับอัตโนมัติอย่างเดียว */
  memberChoices?: MemberSaleChoices;
  sourceModule?: string;
  sourceId?: string;
  idempotencyKey: string;
  // itemId = InvItem.id ที่ผูก → ตัดสต็อก + COGS perpetual (null/ไม่ระบุ = รายการเพิ่มเอง/บริการ ไม่ตัดสต็อก)
  // serviceId = BookingService.id (บริการ) → ใช้แยกยอดสินค้า/บริการในรายงาน · ไม่ตัดสต็อก
  lines: { name: string; qty: number; unitPriceSatang: number; discountSatang?: number; itemId?: string; serviceId?: string }[];
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

type MemberFacade = typeof import("@/lib/modules/member");
type AppliedRights = Awaited<ReturnType<MemberFacade["applyOnSale"]>>;

/**
 * ใช้สิทธิ์สมาชิกกับบิล — คืน `null` เมื่อ "แนบชื่อลูกค้าไว้เฉย ๆ แต่คนนี้ไม่ได้อยู่ในระบบสมาชิกของสาขานี้"
 *
 * 🔴 ทำไมต้องยอมข้าม: บิลเดิมจำนวนมาก (โรงแรม/ร้านอาหาร/คลินิก) แนบ `memberId` ของลูกค้าที่อยู่คนละ
 *    ระบบสมาชิก หรือร้านเพิ่งเปิดระบบสมาชิกทีหลัง — ก่อน M2.8 บิลพวกนี้ขายผ่าน ถ้าจู่ ๆ ล้มทั้งใบ
 *    จะกลายเป็น "เก็บเงินลูกค้าไม่ได้" เพราะเรื่องสะสมแต้ม
 * 🔴 แต่ถ้าพนักงาน **สั่งใช้สิทธิ์มาจริง** (voucher/แต้ม/บัตรกำนัล) ต้องโยนเสมอ — เงียบ = ลูกค้าจ่ายเต็ม
 *    ทั้งที่หน้าจอบอกว่าได้ส่วนลด
 */
async function applyMemberRights(
  member: MemberFacade,
  askedNothing: boolean,
  run: () => Promise<AppliedRights>,
): Promise<AppliedRights | null> {
  try {
    return await run();
  } catch (e) {
    if (askedNothing && e instanceof member.MemberNotFoundError) return null;
    throw e;
  }
}

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
    const paidSum = input.payMethods.reduce((s, p) => s + p.amountSatang, 0);
    const beforeMember = subtotal - billDiscount - couponDiscount + vat;

    // ── ระบบสมาชิกของบิลนี้ (M2.8) ──
    // ไม่มี memberId = ไม่ยิง query เพิ่มแม้แต่ครั้งเดียว ⇒ บิล walk-in เดินเส้นทางเดิมทุกประการ
    const memberSystemId = input.memberId
      ? (input.memberSystemId ?? (await systemForUnit(input.tenantId, input.unitId, "MEMBER", tx)))
      : null;

    // ไม่มีสิทธิ์สมาชิกให้หัก → ตัดจบก่อนแตะตัวนับเลขใบเสร็จ (พฤติกรรมเดิมของ PAYMENT_MISMATCH)
    if (!memberSystemId && paidSum !== beforeMember) {
      throw new Error(`PAYMENT_MISMATCH: จ่าย ${paidSum} ≠ ยอด ${beforeMember}`);
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
        grandTotalSatang: beforeMember,
        paidAt: new Date(),
      },
    });
    await tx.posSaleLine.createMany({
      data: lines.map((l) => ({ tenantId: input.tenantId, unitId: input.unitId, saleId: sale.id, name: l.name, qty: l.qty, unitPriceSatang: l.unitPriceSatang, discountSatang: l.discountSatang, lineTotalSatang: l.lineTotalSatang, itemId: l.itemId ?? null, serviceId: l.serviceId ?? null })),
    });

    // ── ใช้สิทธิ์สมาชิกจริง (M2.8 · §9.1) — ในtx เดียวกับบิล ──
    // 🔴 บิลถูกเขียนก่อนเพราะ voucher/แต้ม/บัตรกำนัลต้องผูก `saleId` ที่มีอยู่จริง (ร่องรอยย้อนกลับได้)
    //    ยอดที่ต้องจ่ายจึงถูก "แก้ทีหลัง" ในtx เดียวกัน — ผิดเมื่อไหร่ rollback ทั้งใบ ไม่มีบิลค้าง
    // 🔴 ส่ง `cart` เข้าไปเสมอ (หนี้จาก M2.7): ส่วนลดระดับคิดจากยอดตะกร้า ห้ามให้ฝั่งสมาชิกไปเดาเอง
    let memberDiscount = 0;
    let tierDiscountSatang = 0;
    let voucherUseIds: string[] = [];
    let giftCardTxnId: string | null = null;
    if (input.memberId && memberSystemId) {
      // dynamic import: `member/index` → wallet → giftcard → `pos/index` = วงกลมของโมดูล
      // (เรียกตอนใช้งานเท่านั้น ⇒ ลำดับการโหลดไฟล์ไม่มีทางได้ facade ที่ยังประกอบไม่เสร็จ)
      const member = await import("@/lib/modules/member");
      const mctx = { tenantId: input.tenantId, systemId: memberSystemId, actorUserId: null };
      const customerId = input.memberId;
      const ch = input.memberChoices ?? {};
      // "ไม่ได้สั่งใช้สิทธิ์อะไรเลย" = แนบชื่อลูกค้าไว้เฉย ๆ (ทางเดิมของ POS ตั้งแต่ก่อน M2.8)
      const askedNothing = (ch.voucherIds ?? []).length === 0 && !(ch.points && ch.points > 0) && !ch.giftCard;
      const applied = await applyMemberRights(member, askedNothing, () =>
        member.applyOnSale(
          mctx,
          {
            saleId: sale.id,
            customerId,
            unitId: input.unitId,
            choices: ch,
            cart: {
              unitId: input.unitId,
              // ส่งโค้ดคูปองไปด้วยเพื่อให้กติกา "ห้ามใช้ voucher ซ้อนคูปอง" ตัดสินได้ (§11.5)
              // — ตัวส่วนลดคูปองยังเป็นของ POS เหมือนเดิม (หักออกจากยอดสิทธิ์ด้านล่าง ไม่นับซ้ำ)
              couponCode: hasCoupon ? input.couponCode : null,
              lines: lines.map((l) => ({
                name: l.name,
                qty: l.qty,
                unitPriceSatang: l.unitPriceSatang,
                discountSatang: l.discountSatang,
                itemId: l.itemId ?? null,
                serviceId: l.serviceId ?? null,
              })),
            },
          },
          tx as Prisma.TransactionClient,
        ),
      );
      if (applied) {
        // voucher ที่ใช้อยู่ห้ามซ้อนคูปอง → ล้มทั้งบิลพร้อมเหตุผลไทย (ห้ามตัด voucher แล้วขายต่อเงียบ ๆ)
        const couponConflict = applied.conflicts.find((c) => c.kind === "COUPON");
        if (hasCoupon && couponConflict && applied.voucherUseIds.length > 0) {
          throw new Error(couponConflict.message);
        }
        // ส่วนลดคูปองถูกคิดที่ POS ไปแล้ว — หักบรรทัดคูปองออกจากยอดสิทธิ์ ไม่งั้นลดสองรอบ
        const couponLine = applied.lines.find((l) => l.kind === "COUPON");
        memberDiscount = applied.totalDiscountSatang - (couponLine?.discountSatang ?? 0);
        tierDiscountSatang = applied.tierDiscountSatang;
        voucherUseIds = applied.voucherUseIds;
        giftCardTxnId = applied.giftCardTxnId;
      }
    }

    const grandTotal = beforeMember - memberDiscount;
    if (paidSum !== grandTotal) {
      throw new Error(`PAYMENT_MISMATCH: จ่าย ${paidSum} ≠ ยอด ${grandTotal}`);
    }
    if (memberDiscount > 0 || tierDiscountSatang > 0 || voucherUseIds.length > 0 || giftCardTxnId) {
      await tx.posSale.update({
        where: { id: sale.id },
        data: {
          discountSatang: billDiscount + couponDiscount + memberDiscount,
          grandTotalSatang: grandTotal,
          tierDiscountSatang,
          voucherUseIds,
          giftCardTxnId,
        },
      });
    }

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

    // outbox: ยอดขาย → บัญชี (contract 2.4) + สะพานสมาชิก (M2.8) — เขียน event ใน tx เดียวกับบิล (atomic)
    await emitOutbox(tx as Prisma.TransactionClient, {
      tenantId: input.tenantId,
      type: "pos.sale.paid",
      idempotencyKey: `PosSale#${sale.id}#PAID`,
      payload: { saleId: sale.id },
      systemId: input.systemId,
      unitId: input.unitId,
    });

    // 🔴 แต้ม/ยอดสะสม/ไทม์ไลน์ **ไม่อยู่ที่นี่แล้ว** (M2.8) — ดูหมายเหตุหัวไฟล์
    //    `pointEarned` = 0 ตอน commit เสมอ · `src/lib/member-bridges.ts` เขียนค่าจริงหลังคิวระบาย
    return { saleId: sale.id, receiptNo, grandTotalSatang: grandTotal, pointEarned: 0 };
  });

  // ── หลัง tx commit: ตัดสต็อก (perpetual) + post บัญชี ──
  // ทำเฉพาะเมื่อ createSale เป็นเจ้าของ tx (ownsTx = commit แน่แล้ว) — ถ้าถูกเรียกใน tx ผู้อื่น
  //   ปล่อยให้ flow นั้นจัดการ (เลี่ยง orphan movement ถ้า tx นอกโดน rollback)
  if (ownsTx) {
    // ตัดสต็อกเฉพาะบิลที่มี line ผูก itemId — inventory.consume เปิด tx เอง + โพสต์ COGS หลัง tx
    //   (Dr5000/Cr1200 ผ่าน bridge) จึงทำนอก tx ของบิล = เลี่ยง nested tx
    if (input.lines.some((l) => l.itemId)) await consumeSaleInventory(input.tenantId, input.unitId, result.saleId);
    scheduleDrain(); // post ยอดขาย→บัญชี · cron /api/cron/outbox เก็บตกถ้าล้ม
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

    // 🔴 M2.8: การคืนของฝั่งสมาชิก (voucher · แต้มที่เผา · แต้มที่ได้ · บัตรกำนัล · สแตมป์ · ยอดสะสม ·
    //    ไทม์ไลน์) ย้ายไปคิว `pos.sale.voided` → `src/lib/member-bridges.ts#onPosSaleVoided`
    //    เหตุผลเดียวกับตอนปิดบิล: การยกเลิกบิลต้องสำเร็จเสมอแม้ฝั่งสมาชิกมีปัญหา
    //    (ของเดิมกลับแต้มด้วยคีย์ `pos-void-<saleId>` — คีย์เดียวกับที่ `member.releaseOnVoid` ใช้
    //     ⇒ ถ้าปล่อยไว้ทั้งสองที่ ตัวหนึ่งจะกลืนอีกตัวเงียบ ๆ แล้วล็อตแต้มไม่ถูกย้อน)
  });

  // best-effort หลัง commit — cron เก็บตกถ้าล้ม
  scheduleDrain();

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
  // N+1: เดิมยิงหา InvItem ทีละแถวในลูป → บิล 20 บรรทัด = 20 รอบเดินทางไป DB ระหว่างที่ลูกค้ารอ "ยกเลิกบิล"
  // ดึงชุดเดียวด้วย id in [] (แพตเทิร์นเดียวกับที่ใช้ปิด N+1 ตะกร้าร้านค้า/สั่งอาหาร)
  const itemIds = [...new Set(outMoves.map((m) => m.itemId).filter((id): id is string => !!id))];
  const costById = new Map(
    (
      await prisma.invItem.findMany({
        where: { id: { in: itemIds }, tenantId },
        select: { id: true, costSatang: true },
      })
    ).map((i) => [i.id, i.costSatang]),
  );
  for (const mv of outMoves) {
    const returnQty = -mv.qtyDelta; // qtyDelta ติดลบตอนตัด → คืนเท่าที่ตัดจริง
    if (returnQty <= 0) continue;
    const costSatang = mv.itemId ? costById.get(mv.itemId) : undefined;
    if (costSatang === undefined) continue; // สินค้าถูกลบจากคลัง → ไม่มีที่ให้คืน
    try {
      await inventory.receive(invCtx, {
        itemId: mv.itemId,
        qty: returnQty,
        costSatang, // คืนที่ต้นทุนปัจจุบัน → ต้นทุนถัวเฉลี่ยไม่เพี้ยน
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

// ═══════════════════════════ ปิดวัน / สรุปยอดสิ้นวัน (read-only) ═══════════════════════════
// สรุปยอดของ "ระบบ POS" (scope tenantId+systemId — ครอบทุกสาขาที่ผูก POS นี้) รายวัน (BKK)
// read-only: ไม่มี shift state machine — อ่านจาก posSale/posPayment ที่มีอยู่ · follow-up = ปิดรอบจริง

export type CloseCtx = { tenantId: string; systemId: string };

export type PayMethodLine = { type: PosPayType; label: string; amountSatang: number; count: number };

export type PosDaySummary = {
  businessDate: string; // YYYY-MM-DD (BKK)
  netSalesSatang: number; // ยอดขายสุทธิ (บิล PAID)
  billCount: number; // จำนวนบิล PAID
  voidCount: number; // จำนวนบิล void (createdAt วันนั้น)
  voidTotalSatang: number; // ยอดรวมบิล void
  byMethod: PayMethodLine[]; // แยกตามวิธีจ่าย (จาก PosPayment ของบิล PAID วันนั้น) — เรียงตาม enum
  cashInDrawerSatang: number; // เงินสดที่ควรมีในลิ้นชัก = ยอดจ่ายเงินสดของบิล PAID วันนั้น
  // แยกยอดตามชนิดรายการ — ธุรกิจที่มีทั้งสินค้าและบริการต้องรู้ว่ารายได้มาจากทางไหน
  // (ยอดรวม 3 ก้อนนี้ = ยอดก่อนหักส่วนลดท้ายบิล จึงอาจไม่เท่า netSales พอดี)
  productSalesSatang: number; // รายการที่ผูกสินค้าในคลัง
  serviceSalesSatang: number; // รายการที่ผูกบริการ
  otherSalesSatang: number; // รายการที่พนักงานพิมพ์เอง (ไม่ผูกทั้งสองอย่าง)
};

const PAY_TYPE_ORDER: PosPayType[] = ["CASH", "PROMPTPAY", "TRANSFER", "DEPOSIT", "ROOM_CHARGE"];
const PAY_TYPE_LABEL_TH: Record<PosPayType, string> = {
  CASH: "เงินสด",
  PROMPTPAY: "พร้อมเพย์",
  TRANSFER: "โอน",
  DEPOSIT: "มัดจำ",
  ROOM_CHARGE: "ลงบิลห้องพัก",
};

// business date (BKK) → ช่วง UTC [start, end) ของวันนั้น
function bkkDayRange(businessDate: string): { start: Date; end: Date } {
  const start = new Date(new Date(businessDate + "T00:00:00Z").getTime() - 7 * 3600000);
  return { start, end: new Date(start.getTime() + 24 * 3600000) };
}

// วันนี้ตามเวลาไทย (YYYY-MM-DD)
export function bkkToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

// แถวบิลของวันนั้น (สำหรับตาราง/CSV) — วิธีจ่ายรวมเป็นข้อความ (บิลเดียวอาจมีหลายวิธี)
export type PosDayBill = {
  receiptNo: string | null;
  createdAt: Date;
  grandTotalSatang: number;
  status: string;
  methodLabel: string;
};

// ── สรุปวัน (default = วันนี้ BKK) ต่อระบบ POS ──
export async function closeDaySummary(ctx: CloseCtx, businessDate?: string): Promise<PosDaySummary> {
  const date = businessDate ?? bkkToday();
  const { start, end } = bkkDayRange(date);

  // บิลทั้งหมดของระบบ POS นี้ในวันนั้น (PAID + VOIDED)
  const sales = await prisma.posSale.findMany({
    where: { tenantId: ctx.tenantId, systemId: ctx.systemId, createdAt: { gte: start, lt: end } },
    select: { id: true, status: true, grandTotalSatang: true },
  });
  const paid = sales.filter((s) => s.status === "PAID");
  const voided = sales.filter((s) => s.status === "VOIDED");

  // แยกวิธีจ่าย จาก PosPayment ของบิล PAID วันนั้น
  const paidIds = paid.map((s) => s.id);
  const payments = paidIds.length
    ? await prisma.posPayment.findMany({
        where: { tenantId: ctx.tenantId, saleId: { in: paidIds } },
        select: { type: true, amountSatang: true },
      })
    : [];
  const agg = new Map<PosPayType, { amountSatang: number; count: number }>();
  for (const p of payments) {
    const cur = agg.get(p.type) ?? { amountSatang: 0, count: 0 };
    cur.amountSatang += p.amountSatang;
    cur.count += 1;
    agg.set(p.type, cur);
  }
  const byMethod: PayMethodLine[] = PAY_TYPE_ORDER.filter((t) => agg.has(t)).map((t) => ({
    type: t,
    label: PAY_TYPE_LABEL_TH[t],
    amountSatang: agg.get(t)!.amountSatang,
    count: agg.get(t)!.count,
  }));

  // แยกยอดสินค้า/บริการ/พิมพ์เอง จากบรรทัดของบิล PAID วันนั้น
  const saleLines = paidIds.length
    ? await prisma.posSaleLine.findMany({
        where: { tenantId: ctx.tenantId, saleId: { in: paidIds } },
        select: { lineTotalSatang: true, itemId: true, serviceId: true },
      })
    : [];
  let productSalesSatang = 0;
  let serviceSalesSatang = 0;
  let otherSalesSatang = 0;
  for (const l of saleLines) {
    if (l.serviceId) serviceSalesSatang += l.lineTotalSatang;
    else if (l.itemId) productSalesSatang += l.lineTotalSatang;
    else otherSalesSatang += l.lineTotalSatang;
  }

  return {
    businessDate: date,
    netSalesSatang: paid.reduce((s, x) => s + x.grandTotalSatang, 0),
    billCount: paid.length,
    voidCount: voided.length,
    voidTotalSatang: voided.reduce((s, x) => s + x.grandTotalSatang, 0),
    byMethod,
    cashInDrawerSatang: agg.get("CASH")?.amountSatang ?? 0,
    productSalesSatang,
    serviceSalesSatang,
    otherSalesSatang,
  };
}

// ── รายการบิลของวัน (PAID + VOIDED) เรียงตามเวลา — สำหรับตาราง/CSV ──
export async function closeDayBills(ctx: CloseCtx, businessDate?: string): Promise<PosDayBill[]> {
  const date = businessDate ?? bkkToday();
  const { start, end } = bkkDayRange(date);
  const sales = await prisma.posSale.findMany({
    where: { tenantId: ctx.tenantId, systemId: ctx.systemId, createdAt: { gte: start, lt: end } },
    orderBy: { createdAt: "asc" },
    select: { id: true, receiptNo: true, createdAt: true, grandTotalSatang: true, status: true },
  });
  const ids = sales.map((s) => s.id);
  const payments = ids.length
    ? await prisma.posPayment.findMany({
        where: { tenantId: ctx.tenantId, saleId: { in: ids } },
        select: { saleId: true, type: true },
      })
    : [];
  const bySale = new Map<string, PosPayType[]>();
  for (const p of payments) {
    const arr = bySale.get(p.saleId) ?? [];
    arr.push(p.type);
    bySale.set(p.saleId, arr);
  }
  return sales.map((s) => {
    const types = bySale.get(s.id) ?? [];
    const uniq = PAY_TYPE_ORDER.filter((t) => types.includes(t));
    return {
      receiptNo: s.receiptNo,
      createdAt: s.createdAt,
      grandTotalSatang: s.grandTotalSatang,
      status: s.status,
      methodLabel: uniq.map((t) => PAY_TYPE_LABEL_TH[t]).join(" + ") || "—",
    };
  });
}

// ── CSV ปิดวัน (BOM · รายการบิล + บล็อกสรุป) — self-contained เพื่อให้ oracle เรียกได้โดยไม่ต้องมี session ──
const CSV_BOM = "﻿";
function csvEsc(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
const baht = (satang: number) => (satang / 100).toFixed(2);
const STATUS_TH: Record<string, string> = { PAID: "ชำระแล้ว", VOIDED: "ยกเลิก" };

export async function closeDayCsv(ctx: CloseCtx, businessDate?: string): Promise<string> {
  const date = businessDate ?? bkkToday();
  const [summary, bills] = await Promise.all([closeDaySummary(ctx, date), closeDayBills(ctx, date)]);
  const fmtTime = (d: Date) =>
    new Intl.DateTimeFormat("th-TH", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit" }).format(d);

  const rows: string[] = [];
  rows.push(["เลขที่ใบเสร็จ", "เวลา", "ยอด (บาท)", "วิธีจ่าย", "สถานะ"].map(csvEsc).join(","));
  for (const b of bills) {
    rows.push(
      [b.receiptNo ?? "", fmtTime(b.createdAt), baht(b.grandTotalSatang), b.methodLabel, STATUS_TH[b.status] ?? b.status]
        .map(csvEsc)
        .join(","),
    );
  }
  // บล็อกสรุป
  rows.push("");
  rows.push([csvEsc("สรุปวันที่"), csvEsc(date)].join(","));
  rows.push([csvEsc("ยอดขายสุทธิ (บาท)"), csvEsc(baht(summary.netSalesSatang))].join(","));
  rows.push([csvEsc("จำนวนบิล"), csvEsc(summary.billCount)].join(","));
  rows.push([csvEsc("บิลยกเลิก"), csvEsc(`${summary.voidCount} (${baht(summary.voidTotalSatang)} บาท)`)].join(","));
  for (const m of summary.byMethod) {
    rows.push([csvEsc(`ยอด${m.label} (บาท)`), csvEsc(baht(m.amountSatang))].join(","));
  }
  rows.push([csvEsc("เงินสดที่ควรมีในลิ้นชัก (บาท)"), csvEsc(baht(summary.cashInDrawerSatang))].join(","));

  return CSV_BOM + rows.join("\n");
}
