import { prisma } from "@/lib/core/db";
import type { Coupon, Prisma } from "@prisma/client";

// Coupon — โค้ดส่วนลด. scope ตาม systemId (ระบบคูปอง) เหมือน Reward
// validate = read-only เรียกซ้ำได้ · redeem = atomic (รับ tx? ร่วม transaction บิล) · release = คืนสิทธิ์

type TxClient = Prisma.TransactionClient;
type Db = typeof prisma | TxClient;

// ── รหัสเหตุผล (แปลที่ชั้น UI) ──
export type ValidateReason =
  | "NOT_FOUND"
  | "INACTIVE"
  | "NOT_STARTED"
  | "EXPIRED"
  | "WRONG_UNIT"
  | "MIN_SPEND"
  | "LIMIT_REACHED"
  | "MEMBER_REQUIRED"
  | "PER_MEMBER_LIMIT";

export type ValidateOk = {
  ok: true;
  couponId: string;
  code: string;
  name: string;
  discountSatang: number;
};
export type ValidateFail = { ok: false; reason: ValidateReason };
export type ValidateResult = ValidateOk | ValidateFail;

const upper = (s: string) => s.trim().toUpperCase();

// คำนวณส่วนลดจากคูปอง + ยอดเงิน (satang) — คืน Int เสมอ ปัดลง ไม่เกินยอดบิล
export function computeDiscount(coupon: Coupon, amountSatang: number): number {
  if (amountSatang <= 0) return 0;
  let d = 0;
  if (coupon.type === "PERCENT") {
    const pct = coupon.percent ?? 0;
    d = Math.floor((amountSatang * pct) / 100); // ปัดลง เข้าทางลูกค้า
    if (coupon.maxDiscountSatang != null) d = Math.min(d, coupon.maxDiscountSatang);
  } else {
    d = coupon.valueSatang ?? 0;
  }
  return Math.max(0, Math.min(d, amountSatang));
}

// ── CRUD ──
export async function listCoupons(tenantId: string, systemId: string, activeOnly = false) {
  return prisma.coupon.findMany({
    where: { tenantId, systemId, ...(activeOnly ? { active: true } : {}) },
    orderBy: [{ active: "desc" }, { createdAt: "desc" }],
  });
}

export async function getCoupon(tenantId: string, systemId: string, couponId: string) {
  return prisma.coupon.findFirst({ where: { id: couponId, tenantId, systemId } });
}

export type CreateCouponInput = {
  tenantId: string;
  systemId: string;
  code: string;
  name: string;
  type: "PERCENT" | "FIXED";
  percent?: number | null;
  valueSatang?: number | null;
  minSpendSatang?: number | null;
  maxDiscountSatang?: number | null;
  usageLimit?: number | null;
  perMemberLimit?: number | null;
  applicableUnitIds?: string[];
  startAt?: Date | null;
  endAt?: Date | null;
};

export async function createCoupon(
  input: CreateCouponInput,
): Promise<{ ok: true; couponId: string } | { ok: false; reason: string }> {
  const code = upper(input.code);
  if (code.length < 3) return { ok: false, reason: "โค้ดสั้นเกินไป (อย่างน้อย 3 ตัว)" };
  if (!/^[A-Z0-9_-]+$/.test(code)) return { ok: false, reason: "โค้ดใช้ได้เฉพาะ A-Z 0-9 - _" };
  if (input.type === "PERCENT") {
    const p = input.percent ?? 0;
    if (p < 1 || p > 100) return { ok: false, reason: "เปอร์เซ็นต์ต้องอยู่ระหว่าง 1-100" };
  } else if ((input.valueSatang ?? 0) <= 0) {
    return { ok: false, reason: "มูลค่าส่วนลดต้องมากกว่า 0" };
  }
  // กันโค้ดซ้ำใน systemId
  const dup = await prisma.coupon.findFirst({
    where: { systemId: input.systemId, code },
    select: { id: true },
  });
  if (dup) return { ok: false, reason: "มีโค้ดนี้อยู่แล้วในระบบคูปองนี้" };

  const c = await prisma.coupon.create({
    data: {
      tenantId: input.tenantId,
      systemId: input.systemId,
      code,
      name: input.name.trim(),
      type: input.type,
      percent: input.type === "PERCENT" ? (input.percent ?? null) : null,
      valueSatang: input.type === "FIXED" ? (input.valueSatang ?? null) : null,
      minSpendSatang: input.minSpendSatang ?? null,
      maxDiscountSatang: input.type === "PERCENT" ? (input.maxDiscountSatang ?? null) : null,
      usageLimit: input.usageLimit ?? null,
      perMemberLimit: input.perMemberLimit ?? null,
      applicableUnitIds: input.applicableUnitIds ?? [],
      startAt: input.startAt ?? null,
      endAt: input.endAt ?? null,
    },
  });
  return { ok: true, couponId: c.id };
}

export async function toggleCoupon(tenantId: string, systemId: string, couponId: string) {
  const c = await prisma.coupon.findFirst({ where: { id: couponId, tenantId, systemId } });
  if (!c) return;
  await prisma.coupon.update({ where: { id: c.id }, data: { active: !c.active } });
}

// ── validate (read-only, เรียกซ้ำได้) ──
export type ValidateInput = {
  code: string;
  tenantId: string;
  systemId: string;
  memberId?: string | null;
  amountSatang: number;
  unitId?: string | null;
};

async function validateWith(db: Db, input: ValidateInput): Promise<ValidateResult> {
  const code = upper(input.code);
  const coupon = await db.coupon.findFirst({
    where: { tenantId: input.tenantId, systemId: input.systemId, code },
  });
  if (!coupon) return { ok: false, reason: "NOT_FOUND" };
  if (!coupon.active) return { ok: false, reason: "INACTIVE" };

  const now = new Date();
  if (coupon.startAt && now < coupon.startAt) return { ok: false, reason: "NOT_STARTED" };
  if (coupon.endAt && now > coupon.endAt) return { ok: false, reason: "EXPIRED" };

  // เฉพาะหน่วยที่กำหนด (ว่าง = ทุกหน่วย) — เช็คเมื่อระบุ unitId มา
  if (coupon.applicableUnitIds.length > 0 && input.unitId) {
    if (!coupon.applicableUnitIds.includes(input.unitId)) return { ok: false, reason: "WRONG_UNIT" };
  }

  if (coupon.minSpendSatang != null && input.amountSatang < coupon.minSpendSatang) {
    return { ok: false, reason: "MIN_SPEND" };
  }
  if (coupon.usageLimit != null && coupon.usedCount >= coupon.usageLimit) {
    return { ok: false, reason: "LIMIT_REACHED" };
  }
  if (coupon.perMemberLimit != null) {
    if (!input.memberId) return { ok: false, reason: "MEMBER_REQUIRED" };
    const used = await db.couponRedemption.count({
      where: {
        tenantId: input.tenantId,
        systemId: input.systemId,
        couponId: coupon.id,
        customerId: input.memberId,
        status: { in: ["RESERVED", "REDEEMED"] },
      },
    });
    if (used >= coupon.perMemberLimit) return { ok: false, reason: "PER_MEMBER_LIMIT" };
  }

  const discountSatang = computeDiscount(coupon, input.amountSatang);
  return { ok: true, couponId: coupon.id, code: coupon.code, name: coupon.name, discountSatang };
}

export function validate(input: ValidateInput): Promise<ValidateResult> {
  return validateWith(prisma, input);
}

// ── redeem (atomic) — re-validate + สร้าง redemption + increment usedCount ──
// รับ tx? เพื่อ join transaction ของผู้เรียก (POS createSale) ตาม contract 2.3
export type RedeemInput = ValidateInput & {
  saleId?: string | null;
  refType?: string | null;
  refId?: string | null;
  status?: "RESERVED" | "REDEEMED"; // default REDEEMED
};
export type RedeemResult =
  | { ok: true; redemptionId: string; couponId: string; discountSatang: number }
  | { ok: false; reason: ValidateReason | "RACE_LOST" };

async function redeemWith(db: Db, input: RedeemInput): Promise<RedeemResult> {
  const v = await validateWith(db, input);
  if (!v.ok) return { ok: false, reason: v.reason };

  // conditional increment กันแย่งสิทธิ์ระดับ DB (เทียบ usedCount กับค่า literal ที่อ่านมา)
  const coupon = await db.coupon.findUnique({ where: { id: v.couponId } });
  if (!coupon) return { ok: false, reason: "NOT_FOUND" };
  const guard =
    coupon.usageLimit != null ? { usedCount: { lt: coupon.usageLimit } } : {};
  const bumped = await db.coupon.updateMany({
    where: { id: v.couponId, tenantId: input.tenantId, systemId: input.systemId, active: true, ...guard },
    data: { usedCount: { increment: 1 } },
  });
  if (bumped.count === 0) return { ok: false, reason: "RACE_LOST" };

  const r = await db.couponRedemption.create({
    data: {
      tenantId: input.tenantId,
      systemId: input.systemId,
      couponId: v.couponId,
      customerId: input.memberId ?? null,
      saleId: input.saleId ?? null,
      refType: input.refType ?? null,
      refId: input.refId ?? null,
      discountSatang: v.discountSatang,
      status: input.status ?? "REDEEMED",
    },
  });
  return { ok: true, redemptionId: r.id, couponId: v.couponId, discountSatang: v.discountSatang };
}

export function redeem(input: RedeemInput, tx?: TxClient): Promise<RedeemResult> {
  if (tx) return redeemWith(tx, input);
  return prisma.$transaction((t) => redeemWith(t, input));
}

// ── release — คืนสิทธิ์ (บิล void/ยกเลิก) ──
export type ReleaseInput = {
  tenantId: string;
  systemId: string;
  saleId?: string | null;
  refType?: string | null;
  refId?: string | null;
  redemptionId?: string | null;
  reason?: string;
};

async function releaseWith(db: Db, input: ReleaseInput): Promise<{ released: number }> {
  const where: Prisma.CouponRedemptionWhereInput = {
    tenantId: input.tenantId,
    systemId: input.systemId,
    status: { in: ["RESERVED", "REDEEMED"] },
  };
  if (input.redemptionId) where.id = input.redemptionId;
  else if (input.saleId) where.saleId = input.saleId;
  else if (input.refType && input.refId) {
    where.refType = input.refType;
    where.refId = input.refId;
  } else return { released: 0 };

  const rows = await db.couponRedemption.findMany({ where });
  let released = 0;
  for (const row of rows) {
    await db.couponRedemption.update({ where: { id: row.id }, data: { status: "RELEASED" } });
    await db.coupon.updateMany({
      where: { id: row.couponId, usedCount: { gt: 0 } },
      data: { usedCount: { decrement: 1 } },
    });
    released++;
  }
  return { released };
}

export function release(input: ReleaseInput, tx?: TxClient): Promise<{ released: number }> {
  if (tx) return releaseWith(tx, input);
  return prisma.$transaction((t) => releaseWith(t, input));
}

// ── redemptions (สำหรับ UI/รายงาน) ──
export async function listRedemptions(tenantId: string, systemId: string, take = 30) {
  return prisma.couponRedemption.findMany({
    where: { tenantId, systemId },
    orderBy: { createdAt: "desc" },
    take,
  });
}
