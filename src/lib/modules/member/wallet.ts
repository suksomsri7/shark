// wallet.ts — "กระเป๋าสิทธิ์" ของสมาชิก (M2.7 · ledger/MEMBER-RUN.md §2 M2.7 · พิมพ์เขียว §5.8 §9.1 §11.4 §11.5)
//
// ── หลักคิดของไฟล์นี้ ────────────────────────────────────────────────────────────────
// 1) **จุดรวมสิทธิ์จุดเดียว**: แต้ม · voucher · คูปอง · บัตรกำนัล · รางวัลรอรับ · สแตมป์ · สิทธิ์ระดับ
//    อยู่คนละโมดูล (คนละตาราง คนละกติกา) — ที่นี่คือที่เดียวที่ประกอบมันเข้าด้วยกัน
//    ⇒ หน้าขาย · LIFF · แอป · REST ถามที่เดียว ไม่ต้องรู้ว่าใครเก็บอะไรไว้ที่ไหน
// 2) **ลำดับตายตัว** (§9.1): ระดับ → voucher → คูปอง → แต้ม → gift card
//    ทุกขั้นคิดจาก "ยอดคงเหลือหลังขั้นก่อน" ⇒ สลับลำดับ = ยอดเปลี่ยน ⇒ ลำดับเป็นสัญญา ไม่ใช่รายละเอียด
// 3) **quote ไม่เขียนอะไรเลย** (เรียกซ้ำได้ทุกครั้งที่ตะกร้าเปลี่ยน) · **apply เขียนทั้งหมดใน tx ของบิล**
//    (ผิดข้อใดข้อหนึ่ง = โยน ⇒ บิลทั้งใบ rollback ⇒ ไม่มีสิทธิ์ไหนถูกตัดไปโดยที่ลูกค้าไม่ได้ของ)
// 4) **สิทธิ์ที่ใช้ไม่ได้ ไม่ล้มทั้งใบเสนอราคา** — คืนเป็น `conflicts` พร้อมเหตุผลภาษาไทย
//    (พนักงานต้องอ่านออกหน้างานว่าทำไมใบนี้ใช้ไม่ได้ แล้วอธิบายลูกค้าได้ทันที)
//    แต่ตอน **apply** สิทธิ์ที่ผู้เรียกสั่งมาแล้วใช้ไม่ได้ = โยนเสมอ (เงียบ = ลูกค้าจ่ายเกิน)
//
// 🔴 โมดูลอื่นทุกตัวเรียกผ่าน facade `@/lib/modules/<x>` เท่านั้น (fitness F2 เส้น member→voucher/giftcard/
//    reward/coupon/point/stamp/system อนุมัติแล้ว แต่ต้องผ่านจุดตัดนี้ — ห้าม import ไฟล์ย่อยของโมดูลอื่น)
// 🔴 ยกเว้นเดียว: อ่าน `PosSale`/`PosSaleLine` ตรงผ่าน `./db` เมื่อ `applyOnSale` ไม่ได้รับตะกร้ามา
//    (กติกาเดียวกับที่ `stamp/service.ts` อ่านบิลตรง — อ่านอย่างเดียว ไม่เขียน · โมดูล POS เรียกสมาชิก
//    อยู่แล้ว การลาก facade ขายของเข้ามาจะเป็นวงจร · และใบนี้ห้ามแตะ `pos/service.ts`)

import * as coupon from "@/lib/modules/coupon";
import * as giftcard from "@/lib/modules/giftcard";
import * as point from "@/lib/modules/point";
import * as reward from "@/lib/modules/reward";
import * as stamp from "@/lib/modules/stamp";
import * as voucher from "@/lib/modules/voucher";
import { getUnitSystems, listSystems, systemForUnit, unitsForSystem } from "@/lib/modules/system";
import type { Prisma } from "@prisma/client";
import { canReadMember, coversUnit, isUnitScoped, type MemberActor } from "./access";
import { prisma } from "./db";
import { MemberInputError, MemberNotFoundError } from "./errors";
import { MEMBER_LIMITS } from "./limits";
import type { MemberCtx } from "./privacy";
import { benefitsFor, type BenefitsDto } from "./tiers";

type Tx = Prisma.TransactionClient;

/** ล็อตแต้มที่จะหมดอายุภายในกี่วันจึงขึ้นบนกระเป๋า (เท่ากับที่หน้าโปรไฟล์/LIFF ใช้) */
const WALLET_EXPIRING_DAYS = 90;

const NOT_FOUND_MSG = "ไม่พบสมาชิกคนนี้ในระบบสมาชิกที่เปิดอยู่ (อาจอยู่คนละสาขาหรือถูกลบไปแล้ว)";

// ───────────────────────── ชนิดข้อมูล ─────────────────────────

/** บรรทัดในตะกร้า — ยังไม่เป็นบิล (POS ส่งของจริง · LIFF ส่งของจำลองเพื่อดูสิทธิ์) */
export type WalletCartLine = {
  name: string;
  qty: number;
  unitPriceSatang: number;
  /** ส่วนลดที่พนักงานกดให้เฉพาะบรรทัดนี้ (ไม่ใช่ส่วนลดจากสิทธิ์) */
  discountSatang?: number;
  itemId?: string | null;
  serviceId?: string | null;
  categoryId?: string | null;
};

export type WalletCart = {
  /** สาขาที่ขาย — ตัวตัดสินว่าสิทธิ์ใบไหนใช้ได้ และระบบแต้ม/คูปอง/POS ตัวไหนที่เกี่ยวข้อง */
  unitId?: string | null;
  lines: WalletCartLine[];
  couponCode?: string | null;
};

export type WalletGiftCardChoice = { number: string; pin?: string | null; satang: number };

/** สิทธิ์ที่ลูกค้า/พนักงาน "เลือกใช้" กับบิลนี้ (ส่วนลดระดับใช้อัตโนมัติ ไม่ต้องเลือก) */
export type WalletChoices = {
  voucherIds?: string[];
  points?: number;
  giftCard?: WalletGiftCardChoice | null;
  couponCode?: string | null;
};

export type QuoteKind = "TIER" | "VOUCHER" | "COUPON" | "POINTS" | "GIFTCARD";

/** ลำดับการใช้สิทธิ์ — **ตายตัว** (§9.1) · ผู้เรียกเอาไปโชว์เป็นชิปบนหน้าขายได้ตรง ๆ */
export const WALLET_ORDER: readonly QuoteKind[] = ["TIER", "VOUCHER", "COUPON", "POINTS", "GIFTCARD"];

export type QuoteLine = {
  kind: QuoteKind;
  /** id ของสิทธิ์ที่ใช้ (voucherId · couponId · หมายเลขบัตรแบบปิดบัง) — ระดับ/แต้มไม่มี ref */
  ref: string | null;
  label: string;
  discountSatang: number;
  /** คำอธิบายเมื่อระบบ "ปรับให้" เช่น ตัดแต้มลงให้พอดีเพดาน */
  note?: string;
};

export type QuoteConflict = { kind: QuoteKind; ref?: string; message: string };

export type QuoteResult = {
  order: QuoteKind[];
  lines: QuoteLine[];
  subtotalSatang: number;
  totalDiscountSatang: number;
  netSatang: number;
  /** แต้มที่จะได้จากบิลนี้ (กติกา settings exclude* — ส่วนที่จ่ายด้วยสิทธิ์ไม่ให้แต้ม) */
  pointsToEarn: number;
  stampsToAdd: { cardId: string; name: string; count: number }[];
  conflicts: QuoteConflict[];
};

export type WalletVoucherDto = {
  id: string;
  code: string;
  name: string;
  kind: string;
  value: number;
  expiresAt: Date;
  status: string;
  /** มีเมื่อส่ง `cart` มาเท่านั้น — ใบนี้ใช้กับตะกร้านี้ได้ไหม */
  applicable?: boolean;
  discountSatang?: number;
  reason?: string;
};

export type WalletCouponDto = {
  id: string;
  code: string;
  name: string;
  /** ส่วนลดที่คูปองใบนี้ให้ (PERCENT = เปอร์เซ็นต์ · FIXED = สตางค์) */
  type: string;
  percent: number | null;
  valueSatang: number | null;
  minSpendSatang: number | null;
  endAt: Date | null;
};

export type WalletDto = {
  points: { balance: number; expiringSoon: { points: number; expiresAt: Date }[] };
  vouchers: WalletVoucherDto[];
  coupons: WalletCouponDto[];
  giftCards: { id: string; numberMasked: string; balanceSatang: number; expiresAt: Date | null; status: string }[];
  rewardsPending: { redemptionId: string; rewardName: string; qrCode: string; expiresAt: Date | null }[];
  stamps: { cardId: string; name: string; stamps: number; slots: number; cycle: number }[];
  tierBenefits: BenefitsDto;
  /** แพ็กเกจสมาชิกแบบเสียเงิน — ยังไม่ผูกกับกระเป๋า (M2.x) */
  paidPlan: null;
};

export type ApplyOnSaleInput = {
  saleId: string;
  customerId: string;
  unitId?: string | null;
  choices: WalletChoices;
  /**
   * ตะกร้าของบิล — ผู้เรียกที่ยังไม่ได้เขียนบิลลงตาราง **ควรส่งมาเสมอ**
   * ไม่ส่ง = หาให้เองตามลำดับ: แถว `PosSale` ของ `saleId` → ตะกร้าของใบเสนอราคาล่าสุดของลูกค้าคนนี้
   */
  cart?: WalletCart;
};

export type ApplyOnSaleResult = {
  tierDiscountSatang: number;
  voucherUseIds: string[];
  pointsBurned: number;
  pointsLedgerId: string | null;
  giftCardTxnId: string | null;
  giftCardSatang: number;
  lines: QuoteLine[];
  totalDiscountSatang: number;
};

// ───────────────────────── ตัวช่วยเรื่องเงิน/ตะกร้า ─────────────────────────

const baht = (satang: number): string => (satang / 100).toLocaleString("th-TH", { maximumFractionDigits: 2 });

/** ยอดสุทธิของบรรทัด (จำนวน × ราคา − ส่วนลดที่กดให้บรรทัดนั้น) — ไม่ติดลบ */
function lineNet(l: WalletCartLine): number {
  const gross = Math.max(0, Math.round(Number(l.qty) || 0)) * Math.max(0, Math.round(Number(l.unitPriceSatang) || 0));
  return Math.max(0, gross - Math.max(0, Math.round(Number(l.discountSatang) || 0)));
}

function cartLines(cart: WalletCart): WalletCartLine[] {
  return Array.isArray(cart?.lines) ? cart.lines : [];
}

function subtotalOf(cart: WalletCart): number {
  return cartLines(cart).reduce((s, l) => s + lineNet(l), 0);
}

/**
 * บรรทัดของตะกร้าที่ "ย่อลงตามยอดคงเหลือ" สำหรับส่งให้ `voucher.validate`
 * 🔴 ทำไมต้องย่อ: ขั้นก่อนหน้าลดยอดไปแล้ว — voucher แบบเปอร์เซ็นต์ต้องคิดจากยอดที่เหลือจริง
 *    ไม่ใช่ยอดเต็มของตะกร้า (ไม่งั้นลดซ้ำซ้อนกับส่วนลดระดับ)
 */
function scaledLines(cart: WalletCart, subtotal: number, remaining: number) {
  const ratio = subtotal > 0 ? remaining / subtotal : 0;
  return cartLines(cart).map((l) => ({
    itemId: l.itemId ?? null,
    serviceId: l.serviceId ?? null,
    categoryId: l.categoryId ?? null,
    qty: Math.max(0, Math.round(Number(l.qty) || 0)),
    netSatang: Math.floor(lineNet(l) * ratio),
  }));
}

// ───────────────────────── ขอบเขต: สมาชิก + ระบบที่เกี่ยวข้อง ─────────────────────────

type CustomerLite = { id: string; homeUnitId: string | null; tierDefId: string | null };

type WalletSystems = {
  unitId: string | null;
  pointSystemId: string | null;
  couponSystemId: string | null;
  posSystemId: string | null;
  rewardSystemId: string | null;
};

async function loadCustomer(ctx: MemberCtx, customerId: string): Promise<CustomerLite> {
  const row = await prisma.customer.findFirst({
    where: { id: String(customerId ?? ""), tenantId: ctx.tenantId, memberSystemId: ctx.systemId },
    select: { id: true, homeUnitId: true, tierDefId: true },
  });
  if (!row) throw new MemberNotFoundError(NOT_FOUND_MSG);
  return row;
}

/**
 * เห็นสมาชิกคนนี้ได้ไหม (§6.1 · 404-not-403)
 * ลูกค้าที่ล็อกอินเอง = ของตัวเองเท่านั้น · พนักงานที่ถูกจำกัดสาขา = สาขาหลักของตน หรือคนที่เคยมาที่สาขาตน
 */
async function assertVisible(ctx: MemberCtx, actor: MemberActor, customer: CustomerLite): Promise<void> {
  if (!canReadMember(actor)) throw new MemberNotFoundError(NOT_FOUND_MSG);
  if (actor.role === "CUSTOMER") {
    if (actor.customerId !== customer.id) throw new MemberNotFoundError(NOT_FOUND_MSG);
    return;
  }
  if (!isUnitScoped(actor)) return;
  if (coversUnit(actor, customer.homeUnitId)) return;
  const seen = await prisma.memberActivity.count({
    where: { tenantId: ctx.tenantId, customerId: customer.id, unitId: { in: actor.unitAccess } },
  });
  if (seen === 0) throw new MemberNotFoundError(NOT_FOUND_MSG);
}

/** ระบบแต้ม/คูปอง/POS/รางวัล ที่ผูก "สาขาของบิลนี้" (ไม่มีสาขา = สาขาแรกของระบบสมาชิก) */
async function resolveSystems(ctx: MemberCtx, unitIdHint: string | null | undefined): Promise<WalletSystems> {
  let unitId = unitIdHint ?? null;
  if (!unitId) {
    const units = await unitsForSystem(ctx.tenantId, ctx.systemId);
    unitId = units[0] ?? null;
  }
  if (!unitId) return { unitId: null, pointSystemId: null, couponSystemId: null, posSystemId: null, rewardSystemId: null };

  const [linked, couponId] = await Promise.all([
    getUnitSystems(ctx.tenantId, unitId),
    systemForUnit(ctx.tenantId, unitId, "COUPON"),
  ]);
  return {
    unitId,
    pointSystemId: linked.POINT ?? null,
    couponSystemId: couponId,
    posSystemId: linked.POS ?? null,
    rewardSystemId: linked.REWARD ?? null,
  };
}

/** ระบบคูปองของร้านเมื่อไม่ได้ผูกกับสาขา (ร้านเล็กเปิดคูปองไว้ระบบเดียว) */
async function couponSystemFallback(ctx: MemberCtx, sys: WalletSystems): Promise<string | null> {
  if (sys.couponSystemId) return sys.couponSystemId;
  const all = await listSystems(ctx.tenantId, "COUPON");
  return all[0]?.id ?? null;
}

const pointCtxOf = (ctx: MemberCtx, sys: WalletSystems) => ({
  tenantId: ctx.tenantId,
  systemId: sys.pointSystemId ?? "",
  memberSystemId: ctx.systemId,
  actorUserId: ctx.actorUserId ?? null,
});

const voucherCtxOf = (ctx: MemberCtx) => ({ tenantId: ctx.tenantId, systemId: ctx.systemId, actorUserId: ctx.actorUserId ?? null });

const stampCtxOf = (ctx: MemberCtx) => ({ tenantId: ctx.tenantId, systemId: ctx.systemId, actorUserId: ctx.actorUserId ?? null });

const giftCtxOf = (ctx: MemberCtx, sys: WalletSystems) => ({
  tenantId: ctx.tenantId,
  systemId: ctx.systemId,
  posSystemId: sys.posSystemId,
  actorUserId: ctx.actorUserId ?? null,
});

const rewardCtxOf = (ctx: MemberCtx, sys: WalletSystems) => ({
  tenantId: ctx.tenantId,
  systemId: sys.rewardSystemId ?? "",
  memberSystemId: ctx.systemId,
  pointSystemId: sys.pointSystemId ?? "",
  actorUserId: ctx.actorUserId ?? null,
});

// ───────────────────────── กระเป๋าสิทธิ์ (getWallet) ─────────────────────────

/**
 * ทุกสิทธิ์ที่สมาชิกคนนี้ถืออยู่ — **อ่านอย่างเดียว** (แท็บ "กระเป๋าสิทธิ์" ในโปรไฟล์ 360 · LIFF · REST)
 * ส่ง `cart` มาด้วย = ได้ `applicable`/`discountSatang`/`reason` ของ voucher แต่ละใบกับตะกร้านั้น
 *
 * 🔴 ไม่มีหมายเลขบัตรเต็ม ไม่มี PIN ไม่มีข้อมูลติดต่อในผลลัพธ์ — หน้าจอที่โชว์กระเป๋าไม่ต้องใช้
 * 🔴 ยิงทุกโมดูลขนานกัน (`Promise.all`) — ผู้ใช้กดแท็บแล้วต้องเห็นทันที ไม่ใช่รอทีละโมดูล
 */
export async function getWallet(
  ctx: MemberCtx,
  actor: MemberActor,
  customerId: string,
  opts: { cart?: WalletCart } = {},
): Promise<WalletDto> {
  const customer = await loadCustomer(ctx, customerId);
  await assertVisible(ctx, actor, customer);

  const cart = opts.cart ?? null;
  const sys = await resolveSystems(ctx, cart?.unitId ?? customer.homeUnitId);
  const pctx = pointCtxOf(ctx, sys);

  const [balance, expiring, vouchers, coupons, giftCards, rewardsPending, stamps, tierBenefits] = await Promise.all([
    sys.pointSystemId ? point.getBalance(sys.pointSystemId, customer.id) : Promise.resolve(0),
    sys.pointSystemId ? point.expiringSoon(pctx, { customerId: customer.id, days: WALLET_EXPIRING_DAYS }) : Promise.resolve([]),
    voucher.listForCustomer(voucherCtxOf(ctx), customer.id),
    listWalletCoupons(ctx, sys),
    giftcard.listForCustomer(giftCtxOf(ctx, sys), customer.id),
    sys.rewardSystemId ? reward.pendingForCustomer(rewardCtxOf(ctx, sys), customer.id) : Promise.resolve([]),
    stamp.progressFor(stampCtxOf(ctx), customer.id),
    benefitsFor(ctx, customer.id),
  ]);

  const subtotal = cart ? subtotalOf(cart) : 0;
  const vctx = voucherCtxOf(ctx);
  const rows: WalletVoucherDto[] = await Promise.all(
    vouchers.map(async (v) => {
      const base: WalletVoucherDto = {
        id: v.id,
        code: v.code,
        name: v.name,
        kind: v.kind,
        value: v.value,
        expiresAt: v.expiresAt,
        status: v.status,
      };
      if (!cart) return base;
      const res = await voucher.validate(vctx, {
        customerId: customer.id,
        voucherId: v.id,
        cart: { lines: scaledLines(cart, subtotal, subtotal), netSatang: subtotal, unitId: cart.unitId ?? null, couponApplied: false },
      });
      return res.ok
        ? { ...base, applicable: true, discountSatang: res.discountSatang }
        : { ...base, applicable: false, discountSatang: 0, reason: res.reason ?? "ใบนี้ใช้กับบิลนี้ไม่ได้" };
    }),
  );
  // ใบที่ใช้ได้ขึ้นก่อนเสมอ (พนักงานกวาดตาแล้วเจอของที่กดได้ทันที)
  const rank = (v: WalletVoucherDto): number => (v.applicable === false ? 1 : 0);
  rows.sort((a, b) => rank(a) - rank(b) || a.expiresAt.getTime() - b.expiresAt.getTime() || a.id.localeCompare(b.id));

  return {
    points: {
      balance,
      expiringSoon: expiring.map((e) => ({ points: e.points, expiresAt: e.expiresAt })),
    },
    vouchers: rows,
    coupons,
    giftCards: giftCards.map((g) => ({
      id: g.id,
      numberMasked: g.numberMasked,
      balanceSatang: g.balanceSatang,
      expiresAt: g.expiresAt,
      status: g.status,
    })),
    rewardsPending,
    stamps: stamps.map((s) => ({ cardId: s.cardId, name: s.name, stamps: s.stamps, slots: s.slots, cycle: s.cycle })),
    tierBenefits,
    paidPlan: null,
  };
}

/**
 * คูปองที่ลูกค้าหยิบมาใช้ได้ตอนนี้ (โค้ดส่วนลดของร้าน — ไม่ได้ผูกรายคน จึงเป็น "คูปองที่เปิดใช้อยู่")
 * ตัดใบที่ยังไม่ถึงวันเริ่ม/หมดอายุออกให้ เพื่อไม่ให้กระเป๋าโชว์ของที่กดแล้วไม่ผ่าน
 */
async function listWalletCoupons(ctx: MemberCtx, sys: WalletSystems): Promise<WalletCouponDto[]> {
  if (!sys.couponSystemId) return [];
  const now = new Date();
  const rows = await coupon.listCoupons(ctx.tenantId, sys.couponSystemId, true);
  return rows
    .filter((c) => (!c.startAt || c.startAt <= now) && (!c.endAt || c.endAt >= now))
    .slice(0, 50)
    .map((c) => ({
      id: c.id,
      code: c.code,
      name: c.name,
      type: c.type,
      percent: c.percent,
      valueSatang: c.valueSatang,
      minSpendSatang: c.minSpendSatang,
      endAt: c.endAt,
    }));
}

// ───────────────────────── ใบเสนอราคาสิทธิ์ (quoteApply) ─────────────────────────

type AppliedRights = {
  tierSatang: number;
  vouchers: { id: string; discountSatang: number }[];
  coupon: { couponId: string; code: string; discountSatang: number } | null;
  points: { points: number; satang: number } | null;
  giftCard: { number: string; satang: number } | null;
};

type QuoteComputed = { result: QuoteResult; applied: AppliedRights };

/** ส่วนลดระดับ: % ของยอด + ส่วนลดคงที่ · เพดานต่อบิล (0 = ไม่จำกัด) · ไม่เกินยอดคงเหลือ */
function tierDiscountOf(benefits: BenefitsDto, base: number): number {
  if (base <= 0) return 0;
  const pct = Math.max(0, benefits.discountPct ?? 0);
  const fixed = Math.max(0, benefits.discountFixedSatang ?? 0);
  let discount = Math.floor((base * pct) / 100) + fixed;
  const cap = Math.max(0, benefits.discountMaxSatang ?? 0);
  if (cap > 0) discount = Math.min(discount, cap);
  return Math.max(0, Math.min(discount, base));
}

async function computeQuote(
  ctx: MemberCtx,
  customer: CustomerLite,
  sys: WalletSystems,
  cart: WalletCart,
  choices: WalletChoices,
): Promise<QuoteComputed> {
  const subtotal = subtotalOf(cart);
  const lines: QuoteLine[] = [];
  const conflicts: QuoteConflict[] = [];
  const applied: AppliedRights = { tierSatang: 0, vouchers: [], coupon: null, points: null, giftCard: null };
  let remaining = subtotal;

  // ── 1. ระดับสมาชิก (อัตโนมัติ ไม่ต้องเลือก) ──
  const benefits = await benefitsFor(ctx, customer.id);
  const tierSatang = tierDiscountOf(benefits, remaining);
  if (tierSatang > 0) {
    const pctText = benefits.discountPct > 0 ? ` ${benefits.discountPct}%` : "";
    lines.push({
      kind: "TIER",
      ref: null,
      label: `ส่วนลดระดับ ${benefits.tier?.name ?? "สมาชิก"}${pctText}`,
      discountSatang: tierSatang,
    });
    applied.tierSatang = tierSatang;
    remaining -= tierSatang;
  }

  // ── 2. voucher (เพดานต่อบิลตาม MEMBER_LIMITS.vouchersPerSale) ──
  const wantedVouchers = [...new Set((choices.voucherIds ?? []).filter((v): v is string => typeof v === "string" && !!v))];
  const vctx = voucherCtxOf(ctx);
  const own = wantedVouchers.length > 0 ? await voucher.listForCustomer(vctx, customer.id) : [];
  const ownById = new Map(own.map((v) => [v.id, v]));
  for (const id of wantedVouchers) {
    if (applied.vouchers.length >= MEMBER_LIMITS.vouchersPerSale) {
      conflicts.push({
        kind: "VOUCHER",
        ref: id,
        message: `บิลเดียวใช้ voucher ได้ ${MEMBER_LIMITS.vouchersPerSale} ใบ — ใบนี้ยังไม่ถูกใช้ เก็บไว้ใช้บิลถัดไปได้`,
      });
      continue;
    }
    const res = await voucher.validate(vctx, {
      customerId: customer.id,
      voucherId: id,
      cart: { lines: scaledLines(cart, subtotal, remaining), netSatang: remaining, unitId: cart.unitId ?? null, couponApplied: false },
    });
    if (!res.ok) {
      conflicts.push({ kind: "VOUCHER", ref: id, message: res.reason ?? "voucher ใบนี้ใช้กับบิลนี้ไม่ได้" });
      continue;
    }
    const discount = Math.min(res.discountSatang, remaining);
    if (discount <= 0) {
      conflicts.push({ kind: "VOUCHER", ref: id, message: "ยอดคงเหลือของบิลไม่พอให้ใช้ voucher ใบนี้แล้ว" });
      continue;
    }
    lines.push({ kind: "VOUCHER", ref: id, label: ownById.get(id)?.name ?? res.code ?? "voucher", discountSatang: discount });
    applied.vouchers.push({ id, discountSatang: discount });
    remaining -= discount;
  }

  // ── 3. คูปอง (กันซ้อนกับ voucher ตาม `config.stackWithCoupon` ของใบที่ใช้อยู่) ──
  const code = String(choices.couponCode ?? cart.couponCode ?? "").trim();
  if (code) {
    const blocking = applied.vouchers.find((v) => ownById.get(v.id)?.config?.stackWithCoupon !== true);
    const couponSystemId = await couponSystemFallback(ctx, sys);
    if (blocking) {
      conflicts.push({
        kind: "COUPON",
        ref: code,
        message: `บิลนี้ใช้ voucher "${ownById.get(blocking.id)?.name ?? "ใบที่เลือก"}" อยู่ — ใบนี้ใช้ร่วมกับคูปองไม่ได้ (เลือกอย่างใดอย่างหนึ่ง)`,
      });
    } else if (!couponSystemId) {
      conflicts.push({ kind: "COUPON", ref: code, message: "ร้านนี้ยังไม่ได้เปิดใช้ระบบคูปอง — ใช้โค้ดส่วนลดไม่ได้" });
    } else {
      const res = await coupon.validate({
        code,
        tenantId: ctx.tenantId,
        systemId: couponSystemId,
        memberId: customer.id,
        amountSatang: remaining,
        unitId: cart.unitId ?? null,
      });
      if (!res.ok) {
        conflicts.push({ kind: "COUPON", ref: code, message: coupon.couponReasonText(res.reason) });
      } else {
        const discount = Math.min(res.discountSatang, remaining);
        if (discount <= 0) {
          conflicts.push({ kind: "COUPON", ref: code, message: "ยอดคงเหลือของบิลไม่พอให้ใช้คูปองนี้แล้ว" });
        } else {
          lines.push({ kind: "COUPON", ref: res.couponId, label: res.name, discountSatang: discount });
          applied.coupon = { couponId: res.couponId, code: res.code, discountSatang: discount };
          remaining -= discount;
        }
      }
    }
  }

  // ── 4. แต้ม (ขั้นต่ำ · ยอดคงเหลือของลูกค้า · เพดาน % ต่อบิล §11.4) ──
  const wantPoints = Math.floor(Number(choices.points ?? 0));
  if (wantPoints > 0) {
    if (!sys.pointSystemId) {
      conflicts.push({ kind: "POINTS", message: "สาขานี้ยังไม่ได้เปิดใช้ระบบแต้ม — ใช้แต้มแลกส่วนลดไม่ได้" });
    } else {
      const [settings, balance] = await Promise.all([
        point.getPointSettings(ctx.tenantId),
        point.getBalance(sys.pointSystemId, customer.id),
      ]);
      const rate = Math.max(1, settings.burnRateSatang);
      const minPoints = Math.max(0, settings.burnMinPoints);
      if (wantPoints < minPoints) {
        conflicts.push({ kind: "POINTS", message: `ใช้แต้มแลกส่วนลดได้ตั้งแต่ ${minPoints.toLocaleString("th-TH")} แต้มขึ้นไป` });
      } else if (wantPoints > balance) {
        conflicts.push({
          kind: "POINTS",
          message: `แต้มคงเหลือ ${balance.toLocaleString("th-TH")} แต้ม ไม่พอสำหรับ ${wantPoints.toLocaleString("th-TH")} แต้ม`,
        });
      } else {
        const pctCap = settings.burnMaxPct > 0 && settings.burnMaxPct < 100 ? Math.floor((remaining * settings.burnMaxPct) / 100) : remaining;
        const cap = Math.min(pctCap, remaining);
        let usePoints = wantPoints;
        let note: string | undefined;
        if (usePoints * rate > cap) {
          usePoints = Math.floor(cap / rate);
          note = `บิลนี้ใช้แต้มได้ไม่เกิน ${settings.burnMaxPct}% ของยอด — ตัดลงเหลือ ${usePoints.toLocaleString("th-TH")} แต้ม`;
          conflicts.push({
            kind: "POINTS",
            message: `ใช้แต้มได้ไม่เกิน ${settings.burnMaxPct}% ของยอดบิล — ใช้จริง ${usePoints.toLocaleString("th-TH")} จาก ${wantPoints.toLocaleString("th-TH")} แต้ม`,
          });
        }
        const value = Math.min(usePoints * rate, remaining);
        if (usePoints <= 0 || value <= 0) {
          conflicts.push({ kind: "POINTS", message: "ยอดคงเหลือของบิลไม่พอให้ใช้แต้มแลกส่วนลด" });
        } else {
          lines.push({
            kind: "POINTS",
            ref: null,
            label: `ใช้ ${usePoints.toLocaleString("th-TH")} แต้ม`,
            discountSatang: value,
            ...(note ? { note } : {}),
          });
          applied.points = { points: usePoints, satang: value };
          remaining -= value;
        }
      }
    }
  }

  // ── 5. บัตรกำนัล (quote ดูแค่ยอด/สถานะ — **ไม่ตรวจ PIN** เพราะ quote เรียกซ้ำได้ทุกครั้ง) ──
  const gc = choices.giftCard;
  const wantGift = gc ? Math.floor(Number(gc.satang ?? 0)) : 0;
  if (gc && String(gc.number ?? "").trim() && wantGift > 0) {
    const number = String(gc.number).trim();
    const card = await giftcard.balance(giftCtxOf(ctx, sys), { number });
    const now = new Date();
    if (!card) {
      conflicts.push({ kind: "GIFTCARD", ref: number, message: "ไม่พบบัตรกำนัลหมายเลขนี้ — ตรวจเลขบนบัตรอีกครั้ง" });
    } else if (card.status !== "ACTIVE") {
      conflicts.push({ kind: "GIFTCARD", ref: number, message: "บัตรใบนี้ใช้ไม่ได้ตอนนี้ (ถูกระงับ หมดอายุ หรือใช้ยอดหมดแล้ว)" });
    } else if (card.expiresAt && card.expiresAt.getTime() < now.getTime()) {
      conflicts.push({ kind: "GIFTCARD", ref: number, message: "บัตรใบนี้หมดอายุแล้ว — ติดต่อร้านเพื่อออกใบใหม่" });
    } else {
      let note: string | undefined;
      if (wantGift > card.balanceSatang) {
        conflicts.push({
          kind: "GIFTCARD",
          ref: number,
          message: `ยอดในบัตรเหลือ ฿${baht(card.balanceSatang)} ไม่พอสำหรับ ฿${baht(wantGift)} — ตัดเท่าที่เหลือแล้วรับส่วนต่างด้วยวิธีอื่น`,
        });
      }
      const use = Math.min(wantGift, card.balanceSatang, remaining);
      if (use <= 0) {
        conflicts.push({ kind: "GIFTCARD", ref: number, message: "ยอดคงเหลือของบิลไม่พอให้ตัดจากบัตรกำนัลแล้ว" });
      } else {
        if (use < Math.min(wantGift, card.balanceSatang)) note = `ยอดบิลเหลือ ฿${baht(remaining)} — ตัดจากบัตรเท่าที่ต้องจ่ายจริง`;
        lines.push({
          kind: "GIFTCARD",
          ref: giftcard.maskNumber(number),
          label: `Gift Card ${giftcard.maskNumber(number)}`,
          discountSatang: use,
          ...(note ? { note } : {}),
        });
        applied.giftCard = { number, satang: use };
        remaining -= use;
      }
    }
  }

  const totalDiscountSatang = lines.reduce((s, l) => s + l.discountSatang, 0);
  const netSatang = Math.max(0, subtotal - totalDiscountSatang);

  // ── แต้มที่จะได้ + ตราที่จะได้ (ตัวอย่าง — ไม่เขียนอะไร) ──
  const paidBy = {
    voucherSatang: applied.vouchers.reduce((s, v) => s + v.discountSatang, 0),
    pointsSatang: applied.points?.satang ?? 0,
    giftCardSatang: applied.giftCard?.satang ?? 0,
  };
  const [earn, stampsToAdd] = await Promise.all([
    sys.pointSystemId
      ? point.computeEarn(pointCtxOf(ctx, sys), {
          customerId: customer.id,
          sale: {
            lines: cartLines(cart).map((l) => ({
              itemId: l.itemId ?? null,
              categoryId: l.categoryId ?? null,
              qty: Math.max(0, Math.round(Number(l.qty) || 0)),
              netSatang: lineNet(l),
            })),
            netSatang,
            paidBy,
          },
        })
      : Promise.resolve({ points: 0 }),
    stamp.previewForCart(stampCtxOf(ctx), {
      customerId: customer.id,
      unitId: cart.unitId ?? null,
      netSatang,
      lines: cartLines(cart).map((l) => ({ itemId: l.itemId ?? null, serviceId: l.serviceId ?? null, qty: Math.max(0, Math.round(Number(l.qty) || 0)) })),
    }),
  ]);

  return {
    applied,
    result: {
      order: [...WALLET_ORDER],
      lines,
      subtotalSatang: subtotal,
      totalDiscountSatang,
      netSatang,
      pointsToEarn: earn.points,
      stampsToAdd,
      conflicts,
    },
  };
}

/**
 * "ถ้าใช้สิทธิ์ชุดนี้กับตะกร้านี้ จะเหลือเท่าไหร่" — **อ่านอย่างเดียว ไม่เขียนอะไรเลย**
 * (หน้าขายเรียกทุกครั้งที่พนักงานติ๊กสิทธิ์ · LIFF เรียกก่อนโชว์ยอด)
 */
export async function quoteApply(
  ctx: MemberCtx,
  actor: MemberActor,
  customerId: string,
  cart: WalletCart,
  choices: WalletChoices = {},
): Promise<QuoteResult> {
  const customer = await loadCustomer(ctx, customerId);
  await assertVisible(ctx, actor, customer);
  const sys = await resolveSystems(ctx, cart?.unitId ?? customer.homeUnitId);
  const { result } = await computeQuote(ctx, customer, sys, cart ?? { lines: [] }, choices ?? {});
  rememberCart(ctx, customer.id, sys.unitId, cart ?? { lines: [] });
  return result;
}

// ───────────────────────── ตะกร้าล่าสุด (สะพานระหว่าง quote → apply) ─────────────────────────
//
// 🔴 ทำไมต้องมี: `applyOnSale` ตามสัญญารับแค่ `{ saleId, customerId, unitId, choices }` — ไม่มีตะกร้า
//    แต่ส่วนลดระดับต้องคิดจาก **ยอดบิล** ⇒ ต้องหาตะกร้าให้ได้ก่อนเสมอ ลำดับที่ใช้คือ
//      1) `input.cart` ที่ผู้เรียกส่งมา (ทางที่ถูกต้อง — M2.8 ควรส่งเสมอ)
//      2) แถว `PosSale` ของ `saleId` (POS ที่เขียนบิลก่อนแล้วค่อยคิดสิทธิ์)
//      3) ตะกร้าของ `quoteApply` ครั้งล่าสุดของลูกค้าคนนี้ที่สาขานี้ (ทางสำรอง — ในหน่วยความจำ อายุสั้น)
//    ทาง (3) เป็น **best-effort ต่อโปรเซส** เท่านั้น: คนละอินสแตนซ์ = ไม่เจอ ⇒ ห้ามพึ่งเป็นทางหลัก
//    (ผลของการไม่เจอคือ "ส่วนลดระดับ 0" ซึ่งจะไปโผล่เป็นยอดที่ไม่ตรงตอน POS ตรวจยอดชำระ ไม่ใช่เงียบ)

type CartMemo = { cart: WalletCart; at: number };
const CART_MEMO = new Map<string, CartMemo>();
const CART_MEMO_TTL_MS = 10 * 60_000;
const CART_MEMO_MAX = 500;

const memoKey = (ctx: MemberCtx, customerId: string, unitId: string | null): string =>
  `${ctx.tenantId}:${ctx.systemId}:${customerId}:${unitId ?? "-"}`;

function rememberCart(ctx: MemberCtx, customerId: string, unitId: string | null, cart: WalletCart): void {
  if (cartLines(cart).length === 0) return;
  if (CART_MEMO.size >= CART_MEMO_MAX) {
    const oldest = [...CART_MEMO.entries()].sort((a, b) => a[1].at - b[1].at)[0];
    if (oldest) CART_MEMO.delete(oldest[0]);
  }
  CART_MEMO.set(memoKey(ctx, customerId, unitId), { cart, at: Date.now() });
}

function recallCart(ctx: MemberCtx, customerId: string, unitId: string | null): WalletCart | null {
  const key = memoKey(ctx, customerId, unitId);
  const found = CART_MEMO.get(key);
  if (!found) return null;
  if (Date.now() - found.at > CART_MEMO_TTL_MS) {
    CART_MEMO.delete(key);
    return null;
  }
  return found.cart;
}

/** ตะกร้าจากบิลที่เขียนลงตารางแล้ว (อ่านอย่างเดียว — ดูหมายเหตุหัวไฟล์เรื่องการอ่าน PosSale ตรง) */
async function cartFromSale(ctx: MemberCtx, saleId: string, tx: Tx): Promise<WalletCart | null> {
  const sale = await tx.posSale.findFirst({
    where: { id: saleId, tenantId: ctx.tenantId },
    select: {
      unitId: true,
      lines: { select: { name: true, qty: true, unitPriceSatang: true, discountSatang: true, itemId: true, serviceId: true } },
    },
  });
  if (!sale || sale.lines.length === 0) return null;
  return {
    unitId: sale.unitId,
    lines: sale.lines.map((l) => ({
      name: l.name,
      qty: l.qty,
      unitPriceSatang: l.unitPriceSatang,
      discountSatang: l.discountSatang,
      itemId: l.itemId,
      serviceId: l.serviceId,
    })),
  };
}

// ───────────────────────── ใช้สิทธิ์จริงตอนปิดบิล (applyOnSale) ─────────────────────────

/**
 * ตัดสิทธิ์ทุกชนิดของบิลใบหนึ่ง **ใน transaction ของ POS** (§9.1)
 * voucher → USED · แต้ม → BURN แบบ FIFO · บัตรกำนัล → ตัดยอด (ตรวจ PIN จริงตรงนี้)
 * คูปองไม่ทำที่นี่ — POS ตัดสิทธิ์คูปองเองอยู่แล้วในบิลเดียวกัน (chokepoint `pos→coupon`)
 *
 * 🔴 สิทธิ์ที่ผู้เรียกสั่งมาแล้วใช้ไม่ได้ = **โยนทันที** (ไม่ใช่ conflict) ⇒ tx ทั้งก้อน rollback
 *    เขียนบางส่วน = ลูกค้าเสีย voucher ไปโดยไม่ได้ส่วนลด — ห้ามเกิดแม้ครั้งเดียว
 * 🔴 คืนแต้ม/สแตมป์ที่ "จะได้" ไม่ทำที่นี่ — เป็นงานของ consumer หลัง commit (M2.8)
 */
export async function applyOnSale(ctx: MemberCtx, input: ApplyOnSaleInput, tx: Tx): Promise<ApplyOnSaleResult> {
  const saleId = String(input.saleId ?? "").trim();
  if (!saleId) throw new MemberInputError("บิลนี้ยังไม่มีเลขที่อ้างอิง — เริ่มรายการใหม่อีกครั้ง");
  const customer = await loadCustomer(ctx, input.customerId);

  const cart =
    input.cart ??
    (await cartFromSale(ctx, saleId, tx)) ??
    recallCart(ctx, customer.id, input.unitId ?? customer.homeUnitId ?? null) ?? { unitId: input.unitId ?? null, lines: [] };
  const unitId = input.unitId ?? cart.unitId ?? customer.homeUnitId ?? null;
  const sys = await resolveSystems(ctx, unitId);
  const choices = input.choices ?? {};

  const { result, applied } = await computeQuote(ctx, customer, sys, { ...cart, unitId }, choices);

  // สิทธิ์ที่สั่งมาแต่ใช้ไม่ได้ → โยนพร้อมเหตุผลของขั้นนั้น (ภาษาไทยจากโมดูลเจ้าของสิทธิ์)
  const conflictOf = (kind: QuoteKind, ref?: string) =>
    result.conflicts.find((c) => c.kind === kind && (ref === undefined || c.ref === ref));
  for (const id of [...new Set((choices.voucherIds ?? []).filter((v): v is string => typeof v === "string" && !!v))]) {
    if (!applied.vouchers.some((v) => v.id === id)) {
      throw new MemberInputError(conflictOf("VOUCHER", id)?.message ?? "voucher ใบนี้ใช้กับบิลนี้ไม่ได้");
    }
  }
  if (Math.floor(Number(choices.points ?? 0)) > 0 && !applied.points) {
    throw new MemberInputError(conflictOf("POINTS")?.message ?? "ใช้แต้มแลกส่วนลดกับบิลนี้ไม่ได้");
  }
  if (choices.giftCard && Math.floor(Number(choices.giftCard.satang ?? 0)) > 0 && !applied.giftCard) {
    throw new MemberInputError(conflictOf("GIFTCARD")?.message ?? "ตัดยอดจากบัตรกำนัลใบนี้ไม่ได้");
  }

  // ── ตัดจริง ตามลำดับเดียวกับใบเสนอราคา ──
  const voucherUseIds: string[] = [];
  for (const v of applied.vouchers) {
    await voucher.redeem(voucherCtxOf(ctx), { voucherId: v.id, customerId: customer.id, saleId, discountSatang: v.discountSatang }, tx);
    voucherUseIds.push(v.id);
  }

  let pointsBurned = 0;
  let pointsLedgerId: string | null = null;
  if (applied.points && sys.pointSystemId) {
    const burn = await point.burnFifo(
      pointCtxOf(ctx, sys),
      {
        customerId: customer.id,
        points: applied.points.points,
        refType: "PosSale",
        refId: saleId,
        idempotencyKey: `pos-burn-${saleId}`,
        unitId,
        reason: "ใช้แต้มแลกส่วนลดที่หน้าร้าน",
      },
      tx,
    );
    pointsBurned = applied.points.points;
    pointsLedgerId = burn.ledgerId;
  }

  let giftCardSatang = 0;
  let giftCardTxnId: string | null = null;
  if (applied.giftCard) {
    const used = await giftcard.use(
      giftCtxOf(ctx, sys),
      {
        number: applied.giftCard.number,
        pin: String(choices.giftCard?.pin ?? ""),
        satang: applied.giftCard.satang,
        saleId,
        idempotencyKey: `pos-gift-${saleId}`,
      },
      tx,
    );
    giftCardSatang = applied.giftCard.satang;
    giftCardTxnId = used.txnId;
  }

  return {
    tierDiscountSatang: applied.tierSatang,
    voucherUseIds,
    pointsBurned,
    pointsLedgerId,
    giftCardTxnId,
    giftCardSatang,
    lines: result.lines,
    totalDiscountSatang: result.totalDiscountSatang,
  };
}

// ───────────────────────── ยกเลิกบิล → คืนสิทธิ์ทุกชนิด (releaseOnVoid) ─────────────────────────

/**
 * บิลถูกยกเลิก → คืนของทุกชิ้นที่ตัดไปตอนปิดบิล (§11.5)
 * **idempotent**: เรียกซ้ำได้ ทุกตัวนับจากสถานะจริง (voucher ต้องเป็น USED · ledger/txn มีคีย์กันซ้ำ)
 * ⇒ คิว outbox ยิงซ้ำ หรือพนักงานกดยกเลิกสองครั้ง ก็ไม่คืนของซ้ำ
 */
export async function releaseOnVoid(
  ctx: MemberCtx,
  input: { saleId: string; unitId?: string | null },
): Promise<{ vouchersReleased: number; pointsReversed: number; giftCardRefunded: number }> {
  const saleId = String(input.saleId ?? "").trim();
  if (!saleId) return { vouchersReleased: 0, pointsReversed: 0, giftCardRefunded: 0 };
  const sys = await resolveSystems(ctx, input.unitId ?? null);

  const released = await voucher.releaseForSale(voucherCtxOf(ctx), { saleId, reason: "บิลถูกยกเลิก — คืนใบให้ลูกค้า" });
  const reversed = sys.pointSystemId
    ? await point.reverseWithLots(pointCtxOf(ctx, sys), {
        refType: "PosSale",
        refId: saleId,
        idempotencyKey: `pos-void-${saleId}`,
        reason: "ยกเลิกบิล — คืนแต้มเข้าล็อตเดิม",
      })
    : { reversed: 0 };
  const refunded = await giftcard.refundUsesForSale(giftCtxOf(ctx, sys), { saleId });

  return {
    vouchersReleased: released.released,
    pointsReversed: reversed.reversed,
    giftCardRefunded: refunded.refunded,
  };
}
