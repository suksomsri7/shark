// member-bridges.ts — composition root ของ "การขาย × ระบบสมาชิก" (M2.8 · พิมพ์เขียว §9.1 §11.5)
//
// ── ทำไมไฟล์นี้ต้องอยู่นอกโมดูล ──────────────────────────────────────────────
// จุดปิดบิลของ POS แตะสมาชิก 5 โมดูลพร้อมกัน (แต้ม · สแตมป์ · ที่มา · ระดับ · ไทม์ไลน์)
// ถ้าเอาโค้ดนี้ไปไว้ในโมดูลใดโมดูลหนึ่ง จะเกิดเส้น import ข้ามโมดูลเพิ่มทันที (fitness F2)
// ⇒ ประกอบที่นี่ (นอก `src/lib/modules/**`) แล้วเรียกทุกโมดูลผ่าน **facade `index.ts` เท่านั้น**
//
// ── กติกาที่ห้ามหักในไฟล์นี้ ────────────────────────────────────────────────
// 1) **ทุกขั้นต้อง idempotent**: คิว outbox ยิงซ้ำได้เสมอ (retry/replay/drain หลายรอบ)
//    ⇒ ห้ามมีขั้นไหน "บวกเพิ่ม" โดยไม่มีธง/คีย์กันซ้ำ
// 2) **ห้ามล้มบิล**: ตัวเรียก (`outbox-consumers.ts`) ครอบ try/catch + logOps("WARN") ให้แล้ว —
//    ที่นี่จึงโยน error ได้ตามจริง (ข้อมูลไม่สอดคล้องต้องเห็น ไม่ใช่กลืน) โดยบิล/บัญชีไม่กระทบ
// 3) บิล "ขาย/เติมบัตรกำนัล" (`PosSale.giftCardId`) **ข้ามทั้งใบ** — ซื้อบัตรยังไม่ใช่การซื้อของ
//    (กติกาเดียวกับที่บัญชีไม่ลงเป็นรายได้ · §9.1 §9.4)
//
// ── ลำดับงานตอนปิดบิล (§9.1) ──────────────────────────────────────────────
//   ยอดสะสม + ไทม์ไลน์ (ธงเดียวกัน) → แต้ม → สแตมป์ → ที่มา (ซื้อครั้งแรก) → ระดับ
//   ระดับต้องมาหลังยอดสะสมเสมอ (เกณฑ์เลื่อนระดับอ่านยอดสะสม)

import { prisma } from "@/lib/core/db";
import * as member from "@/lib/modules/member";
import * as point from "@/lib/modules/point";
import * as stamp from "@/lib/modules/stamp";
import * as marketing from "@/lib/modules/marketing";
import { getUnitSystems } from "@/lib/modules/system";

/** บิลเท่าที่สะพานนี้ต้องรู้ (อ่านครั้งเดียว ส่งต่อทุกขั้น) */
type SaleForBridge = {
  id: string;
  tenantId: string;
  unitId: string;
  memberId: string;
  status: string;
  receiptNo: string | null;
  grandTotalSatang: number;
  voucherUseIds: string[];
  giftCardTxnId: string | null;
  lines: { qty: number; itemId: string | null; serviceId: string | null; lineTotalSatang: number }[];
};

const baht = (satang: number): string => (satang / 100).toLocaleString("th-TH", { maximumFractionDigits: 2 });

/**
 * บิลที่ "สะพานสมาชิก" สนใจ — คืน null เมื่อไม่ต้องทำอะไร (ไม่ใช่ความผิดพลาด)
 * • ไม่พบบิล = ถูกลบไปแล้วก่อนคิวมาถึง (ปกติของ outbox แบบ eventual)
 * • บิลขายบัตรกำนัล / บิล walk-in = ไม่มีสมาชิกให้ทำอะไรต่อ
 */
async function loadSale(tenantId: string, saleId: string): Promise<SaleForBridge | null> {
  const sale = await prisma.posSale.findFirst({
    where: { id: saleId, tenantId },
    select: {
      id: true,
      tenantId: true,
      unitId: true,
      memberId: true,
      status: true,
      receiptNo: true,
      grandTotalSatang: true,
      giftCardId: true,
      voucherUseIds: true,
      giftCardTxnId: true,
      lines: { select: { qty: true, itemId: true, serviceId: true, lineTotalSatang: true }, orderBy: { id: "asc" } },
    },
  });
  if (!sale || sale.giftCardId || !sale.memberId) return null;
  return { ...sale, memberId: sale.memberId };
}

/** ระบบสมาชิก/แต้มที่ผูกสาขาของบิลใบนี้ (อ่านทีเดียว ไม่ยิงทีละชนิด) */
async function systemsOf(tenantId: string, unitId: string): Promise<{ memberSystemId: string | null; pointSystemId: string | null }> {
  const linked = await getUnitSystems(tenantId, unitId);
  return { memberSystemId: linked.MEMBER ?? null, pointSystemId: linked.POINT ?? null };
}

/**
 * สมาชิกของบิลยังอยู่ในระบบสมาชิกของสาขานี้ไหม
 * ไม่อยู่ = ข้อมูลไม่สอดคล้อง (ถูกลบ/ย้ายระบบหลังปิดบิล) ⇒ **โยน** ให้ขึ้น WARN
 * ไม่ใช่การกลืนเงียบ: ถ้าไม่รู้ ร้านจะหาไม่เจอว่าทำไมลูกค้าคนนี้ไม่ได้แต้ม
 */
async function assertMemberAlive(tenantId: string, memberSystemId: string, sale: SaleForBridge): Promise<void> {
  const row = await prisma.customer.findFirst({
    where: { id: sale.memberId, tenantId, memberSystemId },
    select: { id: true },
  });
  if (!row) {
    throw new Error(
      `บิล ${sale.receiptNo ?? sale.id} ผูกกับสมาชิกที่ไม่อยู่ในระบบสมาชิกของสาขานี้แล้ว — ข้ามการให้แต้ม/สแตมป์/ยอดสะสม`,
    );
  }
}

/** มีไทม์ไลน์ของบิลใบนี้แล้วหรือยัง — ธง "ทำไปแล้ว" ของขั้นที่บวกยอดสะสม (ไม่มีคีย์ idempotent ของตัวเอง) */
async function activityExists(sale: SaleForBridge, type: "PURCHASE" | "VOID"): Promise<boolean> {
  const found = await prisma.memberActivity.findFirst({
    where: {
      tenantId: sale.tenantId,
      customerId: sale.memberId,
      module: "pos",
      type,
      refType: "PosSale",
      refId: sale.id,
    },
    select: { id: true },
  });
  return !!found;
}

/**
 * ยอดใช้จ่ายสะสม + ไทม์ไลน์ — **เขียนคู่กันใน transaction เดียว**
 *
 * 🔴 `recordSpend` ไม่มีคีย์กันซ้ำของตัวเอง (บวกยอดตรง ๆ) ⇒ ถ้าปล่อยให้ drain ซ้ำ ยอดสะสมจะเบิ้ล
 *    แล้วลูกค้าจะถูกเลื่อนระดับผิด · ธงที่ใช้คือแถวไทม์ไลน์ของบิลใบนั้น จึงต้องเขียนใน tx เดียวกัน
 *    (เขียนคนละ tx = crash ระหว่างกลาง แล้ว retry จะบวกยอดซ้ำ)
 */
async function recordSpendOnce(
  ctx: { tenantId: string; systemId: string; actorUserId: string | null },
  sale: SaleForBridge,
  kind: "PURCHASE" | "VOID",
): Promise<void> {
  if (await activityExists(sale, kind)) return;
  const delta = kind === "PURCHASE" ? sale.grandTotalSatang : -sale.grandTotalSatang;
  const summary =
    kind === "PURCHASE"
      ? `ชำระเงิน ฿${baht(sale.grandTotalSatang)} (ใบเสร็จ ${sale.receiptNo ?? "—"})`
      : `ยกเลิกบิล ฿${baht(sale.grandTotalSatang)} (ใบเสร็จ ${sale.receiptNo ?? "—"}) — คืนสิทธิ์ทั้งหมดแล้ว`;
  await prisma.$transaction(async (tx) => {
    // ตรวจซ้ำในtx (กันสองคิวเข้าพร้อมกัน — ตารางไทม์ไลน์ไม่มี unique index ให้พึ่ง)
    const dup = await tx.memberActivity.findFirst({
      where: { tenantId: sale.tenantId, customerId: sale.memberId, module: "pos", type: kind, refType: "PosSale", refId: sale.id },
      select: { id: true },
    });
    if (dup) return;
    await member.recordSpend(ctx.tenantId, sale.memberId, delta, tx);
    await member.logActivity(
      {
        tenantId: sale.tenantId,
        customerId: sale.memberId,
        unitId: sale.unitId,
        module: "pos",
        type: kind,
        refType: "PosSale",
        refId: sale.id,
        summary,
      },
      tx,
    );
  });
}

/**
 * ส่วนของยอดบิลที่ "จ่ายด้วยสิทธิ์" — ตัดออกจากฐานคิดแต้มตามการตั้งค่าของร้าน (§11.4)
 * ไม่มีคอลัมน์เก็บยอดเหล่านี้บนบิล ⇒ อ่านจากรอยที่ `member.applyOnSale` เขียนไว้ใน tx เดียวกับบิล:
 *   voucher → `Voucher.usedRef.discountSatang` · บัตรกำนัล → `GiftCardTxn.satang` ของ `PosSale.giftCardTxnId`
 *   แต้ม → รายการ BURN ของบิลใบนั้น × อัตราแลก (applyOnSale ตัดให้พอดีเพดานแล้ว ⇒ แต้ม × อัตรา = ส่วนลดเป๊ะ)
 */
async function paidByRights(
  sale: SaleForBridge,
): Promise<{ voucherSatang: number; pointsSatang: number; giftCardSatang: number }> {
  const [vouchers, burn, giftTxn, settings] = await Promise.all([
    sale.voucherUseIds.length > 0
      ? prisma.voucher.findMany({ where: { tenantId: sale.tenantId, id: { in: sale.voucherUseIds } }, select: { usedRef: true } })
      : Promise.resolve([]),
    prisma.pointLedger.findFirst({
      where: { tenantId: sale.tenantId, refType: "PosSale", refId: sale.id, type: "BURN" },
      select: { delta: true },
    }),
    sale.giftCardTxnId
      ? prisma.giftCardTxn.findFirst({ where: { id: sale.giftCardTxnId, tenantId: sale.tenantId }, select: { satang: true } })
      : Promise.resolve(null),
    point.getPointSettings(sale.tenantId),
  ]);
  let voucherSatang = 0;
  for (const v of vouchers) {
    const ref = (v.usedRef ?? null) as { discountSatang?: unknown } | null;
    if (ref && typeof ref.discountSatang === "number") voucherSatang += Math.max(0, ref.discountSatang);
  }
  const rate = Math.max(1, settings.burnRateSatang);
  return {
    voucherSatang,
    pointsSatang: burn ? Math.abs(burn.delta) * rate : 0,
    giftCardSatang: giftTxn ? Math.max(0, giftTxn.satang) : 0,
  };
}

/**
 * แต้มของบิล — คิดด้วยกฎของร้าน (`computeEarn`) แล้วลงล็อตจริง (`earnWithLot`)
 * คีย์ `pos-earn-<saleId>` = ตัวกันซ้ำ (ยิงซ้ำได้ไม่จำกัด · คืนล็อตเดิม)
 */
async function earnForSale(
  ctx: { tenantId: string; memberSystemId: string; pointSystemId: string | null },
  sale: SaleForBridge,
): Promise<void> {
  if (!ctx.pointSystemId) return; // สาขานี้ไม่ได้เปิดใช้ระบบแต้ม = ไม่มีอะไรให้สะสม
  const pctx = {
    tenantId: ctx.tenantId,
    systemId: ctx.pointSystemId,
    memberSystemId: ctx.memberSystemId,
    actorUserId: null,
  };
  const paidBy = await paidByRights(sale);
  const earn = await point.computeEarn(pctx, {
    customerId: sale.memberId,
    sale: {
      lines: sale.lines.map((l) => ({ itemId: l.itemId, categoryId: null, qty: l.qty, netSatang: l.lineTotalSatang })),
      netSatang: sale.grandTotalSatang,
      paidBy,
    },
  });
  if (earn.points <= 0) return;
  await point.earnWithLot(pctx, {
    customerId: sale.memberId,
    points: earn.points,
    refType: "PosSale",
    refId: sale.id,
    idempotencyKey: `pos-earn-${sale.id}`,
    unitId: sale.unitId,
    breakdown: earn.breakdown,
    reason: `แต้มจากบิล ${sale.receiptNo ?? sale.id}`,
  });
  // เขียนค่าเดิมซ้ำได้ (ไม่ใช่การบวก) — บิลโชว์แต้มที่ได้จริงหลังคิว
  await prisma.posSale.update({ where: { id: sale.id }, data: { pointEarned: earn.points } });
}

/**
 * ปิดบิลแล้ว (`pos.sale.paid`) → ทุกอย่างที่สมาชิกควรได้
 *
 * 🔴 ทำไมไม่อยู่ใน transaction ของบิล: ขั้นพวกนี้ยิงหลายโมดูล + หลาย query
 *    ถ้าอยู่ใน tx เดียวกับการรับเงิน วันหนึ่งกฎแต้มพัง = **ขายของไม่ได้ทั้งร้าน**
 *    ⇒ เงินเข้าก่อนเสมอ · ของแถมตามมาทางคิว (เสีย = แต้มมาช้า ไม่ใช่ขายไม่ได้)
 */
export async function onPosSalePaid(tenantId: string, saleId: string): Promise<void> {
  const sale = await loadSale(tenantId, saleId);
  if (!sale) return;
  if (sale.status !== "PAID") return; // ถูก void ก่อนคิวมาถึง → ฝั่ง void จัดการเอง
  const { memberSystemId, pointSystemId } = await systemsOf(tenantId, sale.unitId);
  if (!memberSystemId) return; // สาขานี้ยังไม่ได้เปิดใช้ระบบสมาชิก
  await assertMemberAlive(tenantId, memberSystemId, sale);

  const ctx = { tenantId, systemId: memberSystemId, actorUserId: null };
  await recordSpendOnce(ctx, sale, "PURCHASE");
  await earnForSale({ tenantId, memberSystemId, pointSystemId }, sale);
  await stamp.autoStampFromSale({ tenantId, systemId: memberSystemId }, { saleId: sale.id });
  await member.recordFirstPurchase(ctx, sale.memberId, sale.id);
  // ระดับ: ประเมินหลังยอดสะสมอัปเดตแล้วเท่านั้น (เลื่อนขึ้นทันทีถ้าเข้าเกณฑ์ · ไม่ลดระดับ)
  await member.evaluateAndApply(ctx, sale.memberId);
  // M3.2 — ยกยอดบิลใบนี้ให้แคมเปญที่ส่งถึงเขาภายใน 30 วัน (บิลแรกเท่านั้น)
  // 🔴 ครอบ try/catch แยก: การวัดผลการตลาดต้องไม่มีวันทำให้ "ของที่ลูกค้าควรได้จากบิล" หายไป
  //    (ถ้าโยนออกไป ผู้เรียกจะ retry ทั้งก้อน แล้วขั้นก่อนหน้าถูกทำซ้ำโดยไม่จำเป็น)
  try {
    await marketing.trackUseFromSale(tenantId, sale.id);
  } catch {
    // นับผลแคมเปญพลาด = ตัวเลขรายงานขาดไป 1 บิล ไม่ใช่เรื่องที่ต้องล้มคิวของบิล
  }
  // M3.5 — แนะนำเพื่อน: บิลของเพื่อนที่ยังรอแปลง (FIRST_PURCHASE ≥ ขั้นต่ำ) → evaluateConversion → รางวัลสองฝั่ง
  //   ขั้นสุดท้ายโดยตั้งใจ (ของที่ลูกค้าได้จากบิลตัวเองต้องมาก่อน) · ไม่ใช่เพื่อนที่ถูกแนะนำ = จบใน 1 คำสั่ง
  //   พัง = โยนต่อ → ผู้เรียกเขียน WARN "สะพานสมาชิก" (บิล/บัญชีไม่กระทบ) · แถวค้าง CONVERTED จ่ายต่อในบิลถัดไป
  await member.referralOnSalePaid(ctx, { customerId: sale.memberId, saleId: sale.id });
}

/**
 * ยกเลิกบิล (`pos.sale.voided`) → คืนของทุกชิ้นที่บิลนั้นให้/ตัดไป
 * ทุกขั้น idempotent: voucher ดูสถานะจริง · แต้ม/บัตรกำนัลมีคีย์กันซ้ำ · ยอดสะสมมีธงไทม์ไลน์ VOID
 */
export async function onPosSaleVoided(tenantId: string, saleId: string): Promise<void> {
  const sale = await loadSale(tenantId, saleId);
  if (!sale) return;
  const { memberSystemId } = await systemsOf(tenantId, sale.unitId);
  if (!memberSystemId) return;
  const ctx = { tenantId, systemId: memberSystemId, actorUserId: null };

  // คืนสิทธิ์ที่ตัดไปตอนปิดบิล + กลับรายการแต้มของบิลใบนี้ทั้งหมด
  // (`releaseOnVoid` เรียก `point.reverseWithLots(refType "PosSale", refId saleId)` ให้แล้ว —
  //  กลับทั้ง BURN ที่ลูกค้าใช้แลกส่วนลด และ EARN ที่บิลนี้เคยให้ · คีย์ `pos-void-<saleId>` กันซ้ำ)
  await member.releaseOnVoid(ctx, { saleId: sale.id, unitId: sale.unitId });
  await stamp.voidStampsForSale({ tenantId, systemId: memberSystemId }, { saleId: sale.id });

  // สมาชิกอาจถูกลบไปแล้วหลังบิลถูกยกเลิก — ของที่คืนได้คืนไปข้างบนแล้ว ที่เหลือไม่มีเจ้าของ
  const alive = await prisma.customer.findFirst({
    where: { id: sale.memberId, tenantId, memberSystemId },
    select: { id: true },
  });
  if (!alive) return;
  await recordSpendOnce(ctx, sale, "VOID");
  // ประเมินระดับซ้ำหลังยอดสะสมลดลง (กฎ M1.9 = ไม่ลดระดับทันที · รอบทบทวนเป็นคนตัดสิน)
  await member.evaluateAndApply(ctx, sale.memberId);
}
