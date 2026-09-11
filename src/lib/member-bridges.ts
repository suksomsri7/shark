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
import { unitsForSystem } from "@/lib/modules/system/service";
import { chatChannelToKey } from "@/lib/core/channels";
import { formatThaiDateTime } from "@/lib/ui/date";

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
  // M3.7 — data ย่อของบิลบนแถวไทม์ไลน์ (ยอด · เลขใบเสร็จ · voucher ที่ใช้) · แต้ม/ตราเติมทีหลังด้วย patchActivity
  const data: Record<string, unknown> = {
    netSatang: sale.grandTotalSatang,
    receiptNo: sale.receiptNo,
    ...(kind === "PURCHASE" ? { pointsEarned: 0, voucherUsed: sale.voucherUseIds.length, stampsAdded: 0 } : {}),
  };
  await prisma.$transaction(async (tx) => {
    // ตรวจซ้ำในtx (กันสองคิวเข้าพร้อมกัน — ตารางไทม์ไลน์ไม่มี unique index ให้พึ่ง)
    const dup = await tx.memberActivity.findFirst({
      where: { tenantId: sale.tenantId, customerId: sale.memberId, module: "pos", type: kind, refType: "PosSale", refId: sale.id },
      select: { id: true },
    });
    if (dup) return;
    await member.recordSpend(ctx.tenantId, sale.memberId, delta, tx);
    const row = { customerId: sale.memberId, unitId: sale.unitId, module: "pos", refType: "PosSale", refId: sale.id, summary, data };
    // ธงของสะพาน (M2.8 — PURCHASE / VOID) · recordOnce ใน tx เดียวกับยอดสะสม
    await member.recordOnce(ctx, { ...row, type: kind }, tx);
    // M3.7 — ขา void: แถวที่ไทม์ไลน์แสดงคือ PURCHASE_VOIDED (แถว VOID = ธงกันลดยอดซ้ำ ไทม์ไลน์ซ่อนเมื่อมีคู่)
    if (kind === "VOID") await member.recordOnce(ctx, { ...row, type: "PURCHASE_VOIDED" }, tx);
  });
}

/**
 * M3.7 — เติมแต้มที่ได้จริง + ตราที่ได้ ลงแถว PURCHASE ของบิล (อ่านจากสมุดแต้ม/ตาราง StampEvent — ไม่ใช่ค่าที่
 * เพิ่งคิด ⇒ replay กี่รอบก็ได้ตัวเลขเดียวกัน แม้ขั้นแต้ม/ตราถูกข้ามเพราะทำไปแล้วรอบก่อน)
 */
async function patchPurchaseRow(ctx: { tenantId: string }, sale: SaleForBridge): Promise<void> {
  const [earned, stamps] = await Promise.all([
    prisma.pointLedger.aggregate({
      where: { tenantId: sale.tenantId, customerId: sale.memberId, refType: "PosSale", refId: sale.id, type: "EARN" },
      _sum: { delta: true },
    }),
    prisma.stampEvent.aggregate({
      where: { tenantId: sale.tenantId, refType: "SALE", refId: sale.id, type: "ADD" },
      _sum: { count: true },
    }),
  ]);
  const pointsEarned = Math.max(0, earned._sum.delta ?? 0);
  const stampsAdded = Math.max(0, stamps._sum.count ?? 0);
  const parts = [`ชำระเงิน ฿${baht(sale.grandTotalSatang)} (ใบเสร็จ ${sale.receiptNo ?? "—"})`];
  if (pointsEarned > 0) parts.push(`ได้ ${pointsEarned.toLocaleString("th-TH")} แต้ม`);
  if (sale.voucherUseIds.length > 0) parts.push(`ใช้ voucher ${sale.voucherUseIds.length} ใบ`);
  if (stampsAdded > 0) parts.push(`ได้ตรา ${stampsAdded} ดวง`);
  await member.patchActivity(
    ctx,
    { customerId: sale.memberId, module: "pos", type: "PURCHASE", refId: sale.id },
    { summary: parts.join(" · "), data: { pointsEarned, voucherUsed: sale.voucherUseIds.length, stampsAdded } },
  );
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
  // M3.7 — แถวไทม์ไลน์ของบิลได้ตัวเลขครบ (แต้ม/ตรา/voucher) หลังขั้นแต้ม+ตราเสร็จ
  await patchPurchaseRow(ctx, sale);
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

// ═══════════════════════════════════════════════════════════════════════════════════
// M3.7 — ไทม์ไลน์ประวัติ: consumer ของทุกโมดูล → MemberActivity (พิมพ์เขียว §4.3 §7.1 §8)
//
// 🔴 กติกาเดียวกับสะพานขายข้างบน: ทุกขั้น idempotent (recordOnce/recordDaily/คีย์ของโมดูลปลายทาง) ·
//    ต้นทางหาย (สมาชิก/นัด/การ์ดถูกลบก่อนคิวมาถึง) = จบเงียบ ๆ · ความผิดพลาดอื่นโยนออกไปให้ตัวเรียกใน
//    `outbox-consumers.ts` (memberBridge) เขียน WARN แล้วปิด event เป็น DONE — ไทม์ไลน์ขาดไป 1 แถว
//    ดีกว่าคิวของทั้งร้านค้าง PENDING
// 🔴 ctx ของระบบสมาชิก resolve จาก `Customer.memberSystemId` เสมอ (ไม่ใช่ `evt.systemId` — event มาจากระบบต้นทาง)
// ═══════════════════════════════════════════════════════════════════════════════════

type MemberCtxLite = { tenantId: string; systemId: string; actorUserId: string | null };

/** ผู้กระทำ "ระบบ" ของงานเบื้องหลัง (สร้างสมาชิกจากดีล/ออเดอร์ออนไลน์ — ไม่มีคนกด) */
const SYSTEM_MEMBER_ACTOR: member.MemberActor = { userId: "", role: "OWNER", unitAccess: ["*"], permissions: {} };

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const payloadOf = (p: unknown): Record<string, unknown> =>
  typeof p === "object" && p !== null && !Array.isArray(p) ? (p as Record<string, unknown>) : {};

/** สมาชิกคนนี้ยังอยู่ไหม + อยู่ระบบสมาชิกไหน (null = ถูกลบ/รวมไปแล้ว → จบเงียบ) */
async function memberCtxOf(tenantId: string, customerId: string | null): Promise<MemberCtxLite | null> {
  if (!customerId) return null;
  const c = await prisma.customer.findFirst({ where: { id: customerId, tenantId }, select: { memberSystemId: true, status: true } });
  if (!c || c.status === "MERGED") return null;
  return { tenantId, systemId: c.memberSystemId, actorUserId: null };
}

/** event ที่มากับ outbox — รูปเดียวกับ `OutboxHandler` (ไม่ import ชนิดของ core เพื่อให้ไฟล์นี้เบา) */
export type BridgeEvent = { id: string; tenantId: string; type: string; payload: unknown; systemId: string | null; unitId: string | null };

// ─────────────────────────── นัดหมาย (booking.completed / booking.no_show) ───────────────────────────

type ApptForBridge = {
  id: string;
  unitId: string;
  customerId: string | null;
  status: string;
  startAt: Date;
  createdAt: Date;
  service: { name: string };
  staff: { name: string };
};

async function loadAppt(tenantId: string, appointmentId: string): Promise<ApptForBridge | null> {
  return prisma.appointment.findFirst({
    where: { id: appointmentId, tenantId },
    select: {
      id: true,
      unitId: true,
      customerId: true,
      status: true,
      startAt: true,
      createdAt: true,
      service: { select: { name: true } },
      staff: { select: { name: true } },
    },
  });
}

/**
 * แถว "จองนัด" ต้องมีก่อนแถว "มาแล้ว/ไม่มา" เสมอ — นัดที่ร้านลงเอง/นำเข้า/สร้างผ่านทางอื่นที่ไม่ได้เขียนไทม์ไลน์
 * (หรือผูกสมาชิกทีหลัง) จะได้แถวย้อนหลังที่เวลาจองจริง · นัดที่ `createAppointment` เขียนไว้แล้ว = recordOnce ข้าม
 */
async function ensureBookedRow(ctx: MemberCtxLite, appt: ApptForBridge, customerId: string): Promise<void> {
  await member.recordOnce(ctx, {
    customerId,
    module: "booking",
    type: "APPOINTMENT_BOOKED",
    refType: "Appointment",
    refId: appt.id,
    unitId: appt.unitId,
    summary: `จองนัด ${appt.service.name} · ${formatThaiDateTime(appt.startAt)}`,
    data: { serviceName: appt.service.name, staffName: appt.staff.name, startAt: appt.startAt.toISOString() },
    at: appt.createdAt,
  });
}

/** ร้านที่ "เปิดรีวิว" แล้ว = เคยบันทึกตั้งค่ารีวิวของระบบสมาชิกนี้ (ไม่เคยตั้ง = ไม่ส่งขอรีวิวอัตโนมัติให้ใคร) */
async function reviewEnabled(tenantId: string, memberSystemId: string): Promise<boolean> {
  const sys = await prisma.appSystem.findFirst({ where: { id: memberSystemId, tenantId }, select: { settings: true } });
  const s = payloadOf(sys?.settings);
  const m = payloadOf(s.member);
  return typeof m.review === "object" && m.review !== null;
}

/**
 * ลูกค้ามาตามนัดจริง (`booking.completed`) → แถว VISIT + สแตมป์ "จองที่มาจริง" + โบนัสแต้ม CHECKIN + ขอรีวิว
 * ลำดับ: ไทม์ไลน์ → สแตมป์ → แต้ม → รีวิว (ของที่ลูกค้าได้มาก่อนเรื่องที่ร้านขอจากลูกค้า)
 */
export async function onBookingCompleted(tenantId: string, appointmentId: string): Promise<void> {
  const appt = await loadAppt(tenantId, appointmentId);
  if (!appt || !appt.customerId || appt.status !== "DONE") return; // ลบ/เปลี่ยนสถานะกลับก่อนคิวมาถึง = ไม่มีอะไรให้บันทึก
  const ctx = await memberCtxOf(tenantId, appt.customerId);
  if (!ctx) return;
  const customerId = appt.customerId;

  await ensureBookedRow(ctx, appt, customerId);
  await member.recordOnce(ctx, {
    customerId,
    module: "booking",
    type: "VISIT",
    refType: "Appointment",
    refId: appt.id,
    unitId: appt.unitId,
    summary: `มาตามนัด ${appt.service.name} · ${formatThaiDateTime(appt.startAt)} · ${appt.staff.name}`,
    data: { serviceName: appt.service.name, staffName: appt.staff.name, startAt: appt.startAt.toISOString() },
  });

  // สแตมป์ชนิด "จองที่มาจริง" — consumer M2.3 (`stampFromVisit`) เรียกไปแล้วก่อนหน้า · ตรงนี้คือตาข่ายเก็บตก
  // (คีย์ `visit:<นัด>:<ใบ>` ⇒ เรียกซ้ำไม่เบิ้ล — แพตเทิร์นเดียวกับ autoStampFromSale ของสะพานขาย M2.8 ข้อ 2.8)
  await stamp.autoStampFromVisit({ tenantId, systemId: ctx.systemId }, { appointmentId: appt.id });

  // โบนัสแต้ม "มาตามนัด" (กฎ EVENT_BONUS · event CHECKIN ของระบบแต้มที่ผูกสาขานี้) — ไม่มีกฎ = 0 แต้ม = ไม่เขียนอะไร
  const { POINT: pointSystemId } = await getUnitSystems(tenantId, appt.unitId);
  if (pointSystemId) {
    const pctx = { tenantId, systemId: pointSystemId, memberSystemId: ctx.systemId, actorUserId: null };
    const earn = await point.computeEarn(pctx, { customerId, event: "CHECKIN" });
    if (earn.points > 0) {
      await point.earnWithLot(pctx, {
        customerId,
        points: earn.points,
        refType: "Appointment",
        refId: appt.id,
        idempotencyKey: `checkin-${appt.id}`,
        unitId: appt.unitId,
        breakdown: earn.breakdown,
        reason: `โบนัสมาตามนัด ${appt.service.name}`,
      });
    }
  }

  // ขอรีวิว (M3.4 · reviews.requestReview) — เฉพาะร้านที่เปิดตั้งค่ารีวิวแล้ว · 1 รีวิวต่อนัด (unique ref)
  // 🔴 ห้ามล้มคิวเพราะรีวิว: ส่ง LINE ไม่ได้/ลูกค้าไม่ยินยอม = requestReview บอกเหตุผลเอง · error อื่นกลืนที่นี่
  try {
    if (await reviewEnabled(tenantId, ctx.systemId)) {
      const { reviewSenders } = await import("@/lib/member-journey-senders");
      await member.requestReview(ctx, { customerId, refType: "Appointment", refId: appt.id, unitId: appt.unitId }, { deps: reviewSenders });
    }
  } catch {
    // ขอรีวิวไม่สำเร็จ = ร้านกดขอเองจากหน้ารีวิวได้ ไม่ใช่เหตุให้ประวัติการมาของลูกค้าหาย
  }
}

/** ลูกค้าไม่มาตามนัด (`booking.no_show`) → แถว NO_SHOW (+ แถวจองย้อนหลังถ้ายังไม่มี) */
export async function onBookingNoShow(tenantId: string, appointmentId: string): Promise<void> {
  const appt = await loadAppt(tenantId, appointmentId);
  if (!appt || !appt.customerId || appt.status !== "NO_SHOW") return;
  const ctx = await memberCtxOf(tenantId, appt.customerId);
  if (!ctx) return;
  await ensureBookedRow(ctx, appt, appt.customerId);
  await member.recordOnce(ctx, {
    customerId: appt.customerId,
    module: "booking",
    type: "NO_SHOW",
    refType: "Appointment",
    refId: appt.id,
    unitId: appt.unitId,
    summary: `ไม่มาตามนัด ${appt.service.name} · ${formatThaiDateTime(appt.startAt)}`,
    data: { serviceName: appt.service.name, staffName: appt.staff.name, startAt: appt.startAt.toISOString() },
  });
}

// ─────────────────────────── แชท (chat.contact.linked / chat.message.received) ───────────────────────────

/** ผูกห้องแชทเข้ากับสมาชิก → แถว CHANNEL_LINKED (1 แถวต่อห้อง-ผู้ติดต่อ) */
export async function onChatContactLinked(evt: BridgeEvent): Promise<void> {
  const p = payloadOf(evt.payload);
  const customerId = str(p.customerId);
  const contactId = str(p.contactId);
  if (!customerId || !contactId) return;
  const ctx = await memberCtxOf(evt.tenantId, customerId);
  if (!ctx) return;
  const contact = await prisma.chatContact.findFirst({ where: { id: contactId, tenantId: evt.tenantId }, select: { channel: true, displayName: true } });
  const channel = contact ? chatChannelToKey(contact.channel) : (str(p.channel) ?? "WEBCHAT");
  const name = member.channelDisplayName(channel);
  await member.recordOnce(ctx, {
    customerId,
    module: "chat",
    type: "CHANNEL_LINKED",
    refType: "ChatContact",
    refId: contactId,
    summary: `ผูกช่องทาง ${name}${contact?.displayName ? ` (${contact.displayName})` : ""} เข้ากับสมาชิกคนนี้แล้ว`,
    data: { channel, method: str(p.method) },
  });
}

/**
 * ลูกค้าทักเข้ามา (`chat.message.received`) ในห้องที่ผูกสมาชิกแล้ว → แถว MESSAGE **1 แถวต่อห้องต่อวันไทย**
 * (ข้อความถัดไปของวันเดียวกัน = นับเพิ่ม `data.count` + preview ล่าสุด · ไม่เพิ่มแถว — ไทม์ไลน์ไม่จมด้วยแชท)
 */
export async function onChatMessageReceived(evt: BridgeEvent): Promise<void> {
  const conversationId = str(payloadOf(evt.payload).conversationId);
  if (!conversationId) return;
  const conv = await prisma.chatConversation.findFirst({
    where: { id: conversationId, tenantId: evt.tenantId },
    select: { channel: true, lastMessagePreview: true, lastMessageAt: true, contact: { select: { customerId: true } } },
  });
  const customerId = conv?.contact?.customerId ?? null;
  if (!conv || !customerId) return; // ห้องที่ยังไม่ผูกสมาชิก = ไม่มีไทม์ไลน์ให้เขียน
  const ctx = await memberCtxOf(evt.tenantId, customerId);
  if (!ctx) return;
  const channel = chatChannelToKey(conv.channel);
  const preview = (conv.lastMessagePreview ?? "").trim().slice(0, 200);
  await member.recordDaily(ctx, {
    customerId,
    module: "chat",
    type: "MESSAGE",
    refType: "ChatConversation",
    refId: conversationId,
    summary: `ลูกค้าทักเข้ามาทาง ${member.channelDisplayName(channel)}`,
    data: { channel, preview },
    at: conv.lastMessageAt ?? new Date(),
    eventId: evt.id,
  });
}

// ─────────────────────────── บอร์ดงาน (kanban.card.completed) ───────────────────────────

/** การ์ดที่ผูกผู้ติดต่อ (PARTY) ของสมาชิกถูกปิด → แถว CARD_COMPLETED ของทุกสมาชิกที่เป็น party นั้น */
export async function onKanbanCardCompleted(evt: BridgeEvent): Promise<void> {
  const p = payloadOf(evt.payload);
  const cardId = str(p.cardId);
  if (!cardId) return;
  const card = await prisma.kanbanCard.findFirst({
    where: { id: cardId, tenantId: evt.tenantId },
    select: { id: true, cardNo: true, title: true, completedAt: true, board: { select: { name: true, unitId: true } } },
  });
  if (!card) return;
  const links = await prisma.kanbanCardLink.findMany({
    where: { tenantId: evt.tenantId, cardId, linkType: "PARTY", removedAt: null },
    select: { linkId: true },
  });
  if (links.length === 0) return; // การ์ดไม่ได้ผูกลูกค้า = ไม่ใช่ประวัติของใคร
  const customers = await prisma.customer.findMany({
    where: { tenantId: evt.tenantId, partyId: { in: links.map((l) => l.linkId) }, status: { not: "MERGED" } },
    select: { id: true, memberSystemId: true },
  });
  for (const c of customers) {
    await member.recordOnce(
      { tenantId: evt.tenantId },
      {
        customerId: c.id,
        module: "kanban",
        type: "CARD_COMPLETED",
        refType: "KanbanCard",
        refId: card.id,
        unitId: card.board.unitId,
        actorUserId: str(p.actorUserId),
        summary: `งานบอร์ด "${card.title}" ปิดแล้ว · บอร์ด${card.board.name}`,
        data: { cardNo: card.cardNo, title: card.title, boardName: card.board.name },
        at: card.completedAt ?? null,
      },
    );
  }
}

// ─────────────────────────── CRM (crm.deal.won) ───────────────────────────

/** ระบบสมาชิกที่ "ดีลของระบบ CRM นี้" ควรไปลง — สาขาที่ CRM ผูก → ระบบสมาชิกของสาขานั้น · ร้านมีระบบสมาชิกเดียว = ตัวนั้น */
async function memberSystemForCrm(tenantId: string, crmSystemId: string): Promise<string | null> {
  for (const unitId of await unitsForSystem(tenantId, crmSystemId)) {
    const linked = await getUnitSystems(tenantId, unitId);
    if (linked.MEMBER) return linked.MEMBER;
  }
  const all = await prisma.appSystem.findMany({ where: { tenantId, type: "MEMBER" }, select: { id: true }, take: 2 });
  return all.length === 1 ? (all[0]?.id ?? null) : null;
}

/**
 * ดีลปิดได้ (`crm.deal.won`) → แถว DEAL_WON ของสมาชิกเจ้าของดีล
 * หาสมาชิก: CrmContact.memberCustomerId → partyId เดียวกัน → เบอร์/อีเมล (createMember ตรวจซ้ำให้เอง —
 * ซ้ำ = คืนคนเดิม) · ไม่พบและมีเบอร์/อีเมล = สมัครสมาชิกให้ (source CRM · sourceDetail.crmContactId)
 * แล้วผูกกลับ CrmContact.partyId / memberCustomerId (เฉพาะช่องที่ยังว่าง — ไม่ทับการผูกที่ร้านตั้งเอง)
 */
export async function onCrmDealWon(evt: BridgeEvent): Promise<void> {
  const dealId = str(payloadOf(evt.payload).dealId);
  if (!dealId) return;
  const deal = await prisma.crmDeal.findFirst({
    where: { id: dealId, tenantId: evt.tenantId },
    select: {
      id: true,
      title: true,
      valueSatang: true,
      systemId: true,
      closedAt: true,
      contact: { select: { id: true, name: true, phone: true, email: true, partyId: true, memberCustomerId: true } },
    },
  });
  const contact = deal?.contact ?? null;
  if (!deal || !contact) return;
  const memberSystemId = await memberSystemForCrm(evt.tenantId, deal.systemId);
  if (!memberSystemId) return; // ร้านยังไม่เปิดระบบสมาชิก (หรือมีหลายระบบแต่ CRM ไม่ได้ผูกสาขา) = ไม่มีที่ลง
  const ctx: MemberCtxLite = { tenantId: evt.tenantId, systemId: memberSystemId, actorUserId: null };

  const alive = { tenantId: evt.tenantId, memberSystemId, status: { not: "MERGED" as const } };
  let customer =
    (contact.memberCustomerId
      ? await prisma.customer.findFirst({ where: { ...alive, id: contact.memberCustomerId }, select: { id: true, partyId: true } })
      : null) ??
    (contact.partyId ? await prisma.customer.findFirst({ where: { ...alive, partyId: contact.partyId }, select: { id: true, partyId: true } }) : null);
  if (!customer && (str(contact.phone) || str(contact.email))) {
    const r = await member.createMember(ctx, SYSTEM_MEMBER_ACTOR, {
      name: contact.name,
      phone: str(contact.phone),
      email: str(contact.email),
      source: "CRM",
      sourceDetail: { crmContactId: contact.id, crmDealId: deal.id },
      idempotencyKey: `crm-contact-${contact.id}`,
    });
    customer = await prisma.customer.findFirst({ where: { ...alive, id: r.customerId }, select: { id: true, partyId: true } });
  }
  if (!customer) return; // ผู้ติดต่อไม่มีเบอร์/อีเมล = ระบบไม่เดาว่าเป็นใคร

  const link: { partyId?: string; memberCustomerId?: string } = {};
  if (!contact.partyId && customer.partyId) link.partyId = customer.partyId;
  if (!contact.memberCustomerId) link.memberCustomerId = customer.id;
  if (Object.keys(link).length > 0) {
    await prisma.crmContact.updateMany({ where: { id: contact.id, tenantId: evt.tenantId }, data: link });
  }

  await member.recordOnce(ctx, {
    customerId: customer.id,
    module: "crm",
    type: "DEAL_WON",
    refType: "CrmDeal",
    refId: deal.id,
    summary: `ปิดดีล "${deal.title}" สำเร็จ · ฿${baht(deal.valueSatang)}`,
    data: { valueSatang: deal.valueSatang, title: deal.title, crmContactId: contact.id },
    at: deal.closedAt ?? null,
  });
}

// ─────────────────────────── อีคอมเมิร์ซ (shop.order.paid) ───────────────────────────

const MARKETPLACE_KEYS = new Set(["SHOPEE", "LAZADA", "TIKTOK_SHOP"]);

/**
 * ออเดอร์ออนไลน์ชำระแล้ว (`shop.order.paid` · หน้าร้านเว็บ SHOP / ตลาด SHOPEE · LAZADA · TIKTOK)
 * → หา/สมัครสมาชิกจากเบอร์ (source MARKETPLACE · sourceChannel = ตลาด) → ผูกตัวตนช่องทาง (externalId = เบอร์)
 * → แต้มตามกฎร้าน (refType ShopOrder · คีย์ `shop-earn-<orderId>`) → แถว PURCHASE refType ShopOrder
 * 🔴 แต้มซ้ำกับสะพานขาย M2.8 ไม่ได้: บิล POS ของออเดอร์ที่ **ผูกสมาชิกไว้แล้ว** ได้แต้ม/แถวซื้อจาก `pos.sale.paid`
 *    อยู่แล้ว ⇒ ข้ามทั้งแต้มและแถว (บิลของหน้าร้านเว็บวันนี้ไม่ผูกสมาชิก → ได้แต้มทางนี้ทางเดียว)
 */
export async function onShopOrderPaid(evt: BridgeEvent): Promise<void> {
  const p = payloadOf(evt.payload);
  const orderId = str(p.orderId);
  const unitId = str(p.unitId) ?? evt.unitId;
  const phone = str(p.customerPhone);
  if (!orderId || !unitId || !phone) return;
  const rawChannel = (str(p.channel) ?? "SHOP").toUpperCase();
  const channel = rawChannel === "TIKTOK" ? "TIKTOK_SHOP" : rawChannel;
  const totalSatang = Math.max(0, Math.trunc(num(p.totalSatang) ?? 0));
  const code = str(p.code) ?? orderId;

  const posSaleId = str(p.posSaleId);
  if (posSaleId) {
    const sale = await prisma.posSale.findFirst({ where: { id: posSaleId, tenantId: evt.tenantId }, select: { memberId: true } });
    if (sale?.memberId) return; // สะพานขาย M2.8 ดูแลบิลนี้ครบแล้ว (แต้ม · ยอดสะสม · แถวซื้อ)
  }

  const { memberSystemId, pointSystemId } = await systemsOf(evt.tenantId, unitId);
  if (!memberSystemId) return;
  const ctx: MemberCtxLite = { tenantId: evt.tenantId, systemId: memberSystemId, actorUserId: null };
  const marketplace = MARKETPLACE_KEYS.has(channel);

  const r = await member.createMember(ctx, SYSTEM_MEMBER_ACTOR, {
    name: str(p.customerName) ?? phone,
    phone,
    source: "MARKETPLACE",
    sourceChannel: marketplace ? channel : null,
    sourceDetail: { shopOrderId: orderId, channel },
    homeUnitId: unitId,
    idempotencyKey: `shop-order-${orderId}`,
  });
  const customerId = r.customerId;

  if (marketplace) {
    try {
      await member.linkIdentity(ctx, { channel, externalId: phone, phone, displayName: str(p.customerName) });
    } catch (e) {
      // ตัวตนนี้ผูกกับสมาชิกคนอื่นอยู่แล้ว (CONFLICT) = ระบบไม่เดา — คู่ "อาจเป็นคนเดียวกัน" ถูกบันทึกให้ร้านตัดสินแล้ว
      if (!(e instanceof member.MemberConflictError)) throw e;
    }
  }

  if (pointSystemId && totalSatang > 0) {
    const pctx = { tenantId: evt.tenantId, systemId: pointSystemId, memberSystemId, actorUserId: null };
    const earn = await point.computeEarn(pctx, {
      customerId,
      sale: { lines: [{ itemId: null, categoryId: null, qty: 1, netSatang: totalSatang }], netSatang: totalSatang },
    });
    if (earn.points > 0) {
      await point.earnWithLot(pctx, {
        customerId,
        points: earn.points,
        refType: "ShopOrder",
        refId: orderId,
        idempotencyKey: `shop-earn-${orderId}`,
        unitId,
        breakdown: earn.breakdown,
        reason: `แต้มจากออเดอร์ออนไลน์ ${code}`,
      });
    }
  }
  const earned = await prisma.pointLedger.aggregate({
    where: { tenantId: evt.tenantId, customerId, refType: "ShopOrder", refId: orderId, type: "EARN" },
    _sum: { delta: true },
  });
  const pointsEarned = Math.max(0, earned._sum.delta ?? 0);
  const chName = member.channelDisplayName(channel);
  await member.recordOnce(ctx, {
    customerId,
    module: "pos",
    type: "PURCHASE",
    refType: "ShopOrder",
    refId: orderId,
    unitId,
    summary: `ซื้อออนไลน์ผ่าน ${chName} ออเดอร์ ${code} ฿${baht(totalSatang)}${pointsEarned > 0 ? ` · ได้ ${pointsEarned.toLocaleString("th-TH")} แต้ม` : ""}`,
    data: { channel, code, netSatang: totalSatang, pointsEarned, posSaleId },
  });
}

// ─────────────────────────── สิทธิ์/แต้ม (loyalty) ───────────────────────────

/** แต้มที่แสดงบนแถวซื้ออยู่แล้ว (บิล/ออเดอร์) หรือบนแถวแลกรางวัล — ไม่ต้องมีแถวแต้มซ้ำอีกบรรทัด */
const POINT_REFS_SHOWN_ELSEWHERE = new Set(["PosSale", "ShopOrder", "RewardRedemption"]);
const POINT_REF_TH: Record<string, string> = {
  MANUAL: "ร้านให้",
  ADJUST: "ร้านปรับ",
  STAMP: "สะสมตราครบ",
  REVIEW: "รีวิว",
  REFERRAL: "แนะนำเพื่อน",
  Appointment: "มาตามนัด",
  TRANSFER: "โอนแต้ม",
  MERGE: "รวมบัญชี",
};

/** point.earned / point.burned / point.expired → แถวแต้ม (idempotent ต่อ lot/event) */
export async function onPointEvent(evt: BridgeEvent): Promise<void> {
  const p = payloadOf(evt.payload);
  const customerId = str(p.customerId);
  const points = num(p.points);
  if (!customerId || !points) return;
  const refType = str(p.refType);
  if (evt.type !== "point.expired" && refType && POINT_REFS_SHOWN_ELSEWHERE.has(refType)) return;
  const ctx = await memberCtxOf(evt.tenantId, customerId);
  if (!ctx) return;
  const why = refType ? POINT_REF_TH[refType] : undefined;
  const expiresAt = str(p.expiresAt);
  if (evt.type === "point.earned") {
    await member.recordOnce(ctx, {
      customerId,
      module: "point",
      type: "POINTS_EARNED",
      refType: "PointLot",
      refId: str(p.lotId) ?? evt.id,
      unitId: evt.unitId,
      summary: `ได้ ${points.toLocaleString("th-TH")} แต้ม${why ? ` (${why})` : ""}${expiresAt ? ` · หมดอายุ ${formatThaiDateTime(expiresAt)}` : ""}`,
      data: { points, refType, refId: str(p.refId), expiresAt },
    });
  } else if (evt.type === "point.burned") {
    await member.recordOnce(ctx, {
      customerId,
      module: "point",
      type: "POINTS_BURNED",
      refType: refType ?? "PointBurn",
      refId: evt.id,
      unitId: evt.unitId,
      summary: `ใช้ ${points.toLocaleString("th-TH")} แต้ม${why ? ` (${why})` : ""}`,
      data: { points, refType, refId: str(p.refId) },
    });
  } else if (evt.type === "point.expired") {
    await member.recordOnce(ctx, {
      customerId,
      module: "point",
      type: "POINTS_EXPIRED",
      refType: "PointLot",
      refId: str(p.lotId) ?? evt.id,
      summary: `แต้มหมดอายุ ${points.toLocaleString("th-TH")} แต้ม`,
      data: { points, expiresAt },
    });
  }
}

const TIER_REASON_TH: Record<string, string> = {
  RULE_UPGRADE: "เลื่อนอัตโนมัติตามเกณฑ์",
  RULE_DOWNGRADE: "ลดระดับตามรอบทบทวน",
  RULE_KEEP: "คงระดับตามรอบทบทวน",
  MANUAL: "ตั้งระดับด้วยมือ",
  PAID_PLAN: "สมัครแบบเสียเงิน",
  PLAN_EXPIRED: "แบบเสียเงินหมดอายุ",
  MERGE: "รวมบัญชี",
  INITIAL: "ระดับเริ่มต้น",
};

/**
 * ระดับเปลี่ยน (`member.tier.changed`) → แถว TIER_CHANGED { from, to (ชื่อระดับ), reason (ไทย + ตัวเลขประกอบ) }
 * อ้างแถว MemberTierHistory ของการเปลี่ยนครั้งนั้น (1 แถวไทม์ไลน์ต่อ 1 การเปลี่ยน)
 */
export async function onTierChanged(evt: BridgeEvent): Promise<void> {
  const p = payloadOf(evt.payload);
  const customerId = str(p.customerId);
  const toKey = str(p.to);
  if (!customerId || !toKey) return;
  const ctx = await memberCtxOf(evt.tenantId, customerId);
  if (!ctx) return;
  const fromKey = str(p.from);
  const defs = await prisma.memberTierDef.findMany({
    where: { tenantId: evt.tenantId, systemId: ctx.systemId, key: { in: [toKey, ...(fromKey ? [fromKey] : [])] } },
    select: { id: true, key: true, name: true },
  });
  const to = defs.find((d) => d.key === toKey);
  const from = fromKey ? defs.find((d) => d.key === fromKey) : undefined;
  const hist = to
    ? await prisma.memberTierHistory.findFirst({
        where: { tenantId: evt.tenantId, customerId, toTierDefId: to.id },
        orderBy: { createdAt: "desc" },
        select: { id: true, reason: true, evidence: true, createdAt: true },
      })
    : null;
  const code = str(p.reason) ?? hist?.reason ?? "RULE_UPGRADE";
  const ev = payloadOf(hist?.evidence);
  const cust = await prisma.customer.findFirst({ where: { id: customerId, tenantId: evt.tenantId }, select: { spent12mSatang: true } });
  const spent = num(ev.spent12m) ?? Number(cust?.spent12mSatang ?? 0);
  const parts = [TIER_REASON_TH[code] ?? "เปลี่ยนระดับ", `ยอดซื้อ 12 เดือน ฿${baht(spent)}`];
  const visits = num(ev.visits12m);
  if (visits !== null) parts.push(`มาใช้บริการ ${visits} ครั้ง`);
  if (str(ev.reason)) parts.push(str(ev.reason) as string);
  const reason = parts.join(" · ");
  const fromName = from?.name ?? null;
  const toName = to?.name ?? toKey;
  await member.recordOnce(ctx, {
    customerId,
    module: "member",
    type: "TIER_CHANGED",
    refType: "MemberTierHistory",
    refId: hist?.id ?? evt.id,
    unitId: evt.unitId,
    summary: `${fromName ? `${fromName} → ${toName}` : `ระดับ ${toName}`} · ${reason}`,
    data: { from: fromName ?? "ไม่มีระดับ", to: toName, fromKey, toKey, reason, code },
    at: hist?.createdAt ?? null,
  });
}

/** voucher ถูกใช้ / สะสมตราครบใบ / แลกของรางวัล / บัตรกำนัลขาย-ใช้ → แถวสิทธิ์ของสมาชิก */
export async function onLoyaltyEvent(evt: BridgeEvent): Promise<void> {
  const p = payloadOf(evt.payload);
  if (evt.type === "voucher.used") {
    const customerId = str(p.customerId);
    const voucherId = str(p.voucherId);
    const ctx = await memberCtxOf(evt.tenantId, customerId);
    if (!ctx || !customerId || !voucherId) return;
    const discount = num(p.discountSatang);
    await member.recordOnce(ctx, {
      customerId,
      module: "voucher",
      type: "VOUCHER_USED",
      refType: "Voucher",
      refId: voucherId,
      unitId: evt.unitId,
      summary: `ใช้ voucher ${str(p.code) ?? ""}${discount ? ` ส่วนลด ฿${baht(discount)}` : ""}`.replace(/\s+/g, " ").trim(),
      data: { code: str(p.code), saleId: str(p.saleId), appointmentId: str(p.appointmentId), discountSatang: discount },
    });
    return;
  }
  if (evt.type === "stamp.completed") {
    const customerId = str(p.customerId);
    const progressId = str(p.progressId);
    const ctx = await memberCtxOf(evt.tenantId, customerId);
    if (!ctx || !customerId || !progressId) return;
    const cardId = str(p.cardId);
    const card = cardId ? await prisma.stampCard.findFirst({ where: { id: cardId, tenantId: evt.tenantId }, select: { name: true } }) : null;
    const stamps = num(p.stamps) ?? 0;
    await member.recordOnce(ctx, {
      customerId,
      module: "stamp",
      type: "STAMP_COMPLETED",
      refType: "StampCardProgress",
      refId: progressId,
      unitId: evt.unitId,
      summary: `สะสมตราครบ ${stamps} ดวง${card ? ` — ${card.name}` : ""}`,
      data: { cardId, cardName: card?.name ?? null, stamps, cycle: num(p.cycle), rewardKind: str(p.rewardKind) },
    });
    return;
  }
  if (evt.type === "reward.redeemed") {
    const customerId = str(p.customerId);
    const redemptionId = str(p.redemptionId);
    const ctx = await memberCtxOf(evt.tenantId, customerId);
    if (!ctx || !customerId || !redemptionId) return;
    const rewardId = str(p.rewardId);
    const reward = rewardId ? await prisma.reward.findFirst({ where: { id: rewardId, tenantId: evt.tenantId }, select: { name: true, pointsCost: true } }) : null;
    await member.recordOnce(ctx, {
      customerId,
      module: "reward",
      type: "REWARD_REDEEMED",
      refType: "RewardRedemption",
      refId: redemptionId,
      unitId: evt.unitId,
      summary: `แลกของรางวัล${reward ? ` "${reward.name}"` : ""}${reward && reward.pointsCost > 0 ? ` · ใช้ ${reward.pointsCost.toLocaleString("th-TH")} แต้ม` : ""}`,
      data: { rewardId, rewardName: reward?.name ?? null, pointsCost: reward?.pointsCost ?? null },
    });
    return;
  }
  if (evt.type === "giftcard.sold" || evt.type === "giftcard.used") {
    const giftCardId = str(p.giftCardId);
    if (!giftCardId) return;
    const card = await prisma.giftCard.findFirst({ where: { id: giftCardId, tenantId: evt.tenantId }, select: { number: true, ownerCustomerId: true, balanceSatang: true } });
    const customerId = card?.ownerCustomerId ?? str(p.ownerCustomerId);
    const ctx = await memberCtxOf(evt.tenantId, customerId);
    if (!card || !ctx || !customerId) return;
    const satang = num(p.satang) ?? 0;
    const sold = evt.type === "giftcard.sold";
    await member.recordOnce(ctx, {
      customerId,
      module: "giftcard",
      type: sold ? "GIFTCARD_SOLD" : "GIFTCARD_USED",
      // ขาย = 1 ครั้งต่อใบ (อ้างตัวบัตร) · ใช้ = หลายครั้งต่อใบ (อ้าง event ของการใช้ครั้งนั้น)
      refType: sold ? "GiftCard" : "GiftCardUse",
      refId: sold ? giftCardId : evt.id,
      unitId: evt.unitId,
      summary: sold
        ? `ได้รับบัตรกำนัล ${card.number} มูลค่า ฿${baht(satang)}`
        : `ใช้บัตรกำนัล ${card.number} ฿${baht(satang)} (เหลือ ฿${baht(num(p.balanceAfter) ?? card.balanceSatang)})`,
      data: { giftCardId, number: card.number, satang, balanceAfter: num(p.balanceAfter), saleId: str(p.saleId) },
    });
  }
}
