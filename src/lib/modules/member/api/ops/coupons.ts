// ops/coupons.ts — op ของ "คูปอง" (MEMBER-API §2.11 · M2.10)
//
// คูปอง ≠ voucher: คูปองเป็น **โค้ดสาธารณะ** ที่ใครพิมพ์ก็ได้ (จำกัดด้วยจำนวนครั้ง/ต่อคน)
// ส่วน voucher ออกให้คนใดคนหนึ่งโดยเฉพาะ ⇒ คนละตาราง คนละกติกา และคูปองอยู่ใน **ระบบคูปอง**
// ซึ่งผูกกับสาขาเดียวกับระบบสมาชิก (ไม่ใช่ในระบบสมาชิกเอง) — `resolveCouponSystemId` เป็นคนหา
//
// 🔴 `coupons.issuePerMember` / `coupons.saveToWallet` ออก "โค้ดเฉพาะคน" เป็นคูปองใบใหม่ที่ใช้ได้
//    ครั้งเดียว และ **ไม่โผล่ในกระเป๋าสิทธิ์ของคนอื่น** (ตาราง Coupon ยังไม่มีคอลัมน์เจ้าของ — ใบนี้ไม่มี
//    migration) ⇒ ผู้เรียกเป็นคนส่งโค้ดถึงเจ้าของเอง จากรายการที่คำตอบคืนกลับไป

import { z } from "zod";
import * as coupon from "@/lib/modules/coupon";
import { ApiError } from "@/lib/api/respond";
import { memberCtxOf } from "../actor";
import { loyaltyCtx, resolveCouponSystemId } from "../loyalty";
import { defineMemberOp, type ApiOp, type ApiOpCtx } from "../op";
import { jsonSafe } from "../serialize";

const idOf = (v: string | undefined): string => (v ?? "").trim();

/** ระบบคูปองของร้าน — ยังไม่เปิด = บอกตรง ๆ ว่าต้องไปเปิดก่อน (ไม่ใช่ 500) */
async function couponSystem(actor: ApiOpCtx<unknown>["actor"], unitId?: string | null): Promise<{ tenantId: string; systemId: string }> {
  const ctx = memberCtxOf(actor);
  const b = await loyaltyCtx(actor, unitId ?? null);
  const systemId = await resolveCouponSystemId(ctx, b.systems);
  if (!systemId) {
    throw new ApiError(
      422,
      "unprocessable",
      "ร้านนี้ยังไม่ได้เปิดระบบคูปอง — เปิดระบบคูปองก่อนแล้วลองใหม่อีกครั้ง",
      "This shop has no COUPON system yet.",
    );
  }
  return { tenantId: ctx.tenantId, systemId };
}

/** ผลของ service ที่ตอบ `{ ok: false, reason }` → error ของ API (ข้อความไทยเดิมของโมดูลคูปอง) */
function unwrap<T extends { ok: boolean }>(res: T | { ok: false; reason: string }): T {
  if (!res.ok) {
    const reason = (res as { reason?: string }).reason ?? "ทำรายการกับคูปองไม่สำเร็จ";
    throw new ApiError(422, "unprocessable", reason, "The coupon operation was refused. See message_th for the shop facing reason.");
  }
  return res as T;
}

const list = defineMemberOp({
  id: "coupons.list",
  method: "GET",
  path: "/coupons",
  kind: "read",
  action: "member.promo.manage",
  summary: "The shop's discount codes with their limits, how many times they were used and when they run out.",
  label: "รายการคูปอง",
  input: z
    .object({
      activeOnly: z.coerce.boolean().optional().describe("Only codes that are switched on. Default false."),
      unitId: z.string().trim().max(40).optional().describe("Branch whose coupon system to read."),
    })
    .strict(),
  test: "M2.10-S1.1",
  async handler({ actor, input }) {
    const sys = await couponSystem(actor, input.unitId ?? null);
    const items = await coupon.listCoupons(sys.tenantId, sys.systemId, input.activeOnly === true);
    return jsonSafe({ items, total: items.length });
  },
});

const couponFields = {
  name: z.string().trim().min(1).max(80),
  percent: z.coerce.number().int().min(1).max(100).nullish().describe("PERCENT only."),
  valueSatang: z.coerce.number().int().min(1).nullish().describe("FIXED only, in satang."),
  minSpendSatang: z.coerce.number().int().min(0).nullish(),
  maxDiscountSatang: z.coerce.number().int().min(0).nullish().describe("Ceiling for a PERCENT coupon."),
  usageLimit: z.coerce.number().int().min(1).nullish().describe("Total uses across everybody. Null means unlimited."),
  perMemberLimit: z.coerce.number().int().min(1).nullish().describe("Uses per member. Setting it means the caller must identify the member."),
  applicableUnitIds: z.array(z.string().trim().max(40)).max(50).optional(),
  startAt: z.coerce.date().nullish(),
  endAt: z.coerce.date().nullish(),
};

const create = defineMemberOp({
  id: "coupons.create",
  method: "POST",
  path: "/coupons",
  kind: "write",
  action: "member.promo.manage",
  summary: "Create a discount code. The code must be unique inside the shop's coupon system and may only use A-Z, digits, hyphen and underscore.",
  label: "สร้างคูปอง",
  input: z
    .object({
      code: z.string().trim().min(3).max(40),
      type: z.enum(["PERCENT", "FIXED"]),
      unitId: z.string().trim().max(40).optional(),
      ...couponFields,
    })
    .strict(),
  test: "M2.10-S1.1",
  async handler({ actor, input }) {
    const sys = await couponSystem(actor, input.unitId ?? null);
    return jsonSafe(
      unwrap(
        await coupon.createCoupon({
          tenantId: sys.tenantId,
          systemId: sys.systemId,
          code: input.code,
          name: input.name,
          type: input.type,
          percent: input.percent ?? null,
          valueSatang: input.valueSatang ?? null,
          minSpendSatang: input.minSpendSatang ?? null,
          maxDiscountSatang: input.maxDiscountSatang ?? null,
          usageLimit: input.usageLimit ?? null,
          perMemberLimit: input.perMemberLimit ?? null,
          applicableUnitIds: input.applicableUnitIds ?? [],
          startAt: input.startAt ?? null,
          endAt: input.endAt ?? null,
        }),
      ),
    );
  },
});

const update = defineMemberOp({
  id: "coupons.update",
  method: "PATCH",
  path: "/coupons/{id}",
  kind: "write",
  action: "member.promo.manage",
  summary: "Change a coupon's limits, window or wording. The code and the discount type never change, because customers already hold them.",
  label: "แก้ไขคูปอง",
  input: z
    .object({
      name: couponFields.name.optional(),
      percent: couponFields.percent,
      valueSatang: couponFields.valueSatang,
      minSpendSatang: couponFields.minSpendSatang,
      maxDiscountSatang: couponFields.maxDiscountSatang,
      usageLimit: couponFields.usageLimit,
      perMemberLimit: couponFields.perMemberLimit,
      applicableUnitIds: couponFields.applicableUnitIds,
      startAt: couponFields.startAt,
      endAt: couponFields.endAt,
      saveToWallet: z.boolean().optional().describe("Show this code in members' wallets."),
      stackWithVoucher: z.boolean().optional().describe("Allow it on the same bill as a voucher."),
      unitId: z.string().trim().max(40).optional(),
    })
    .strict(),
  test: "M2.10-S1.1",
  async handler({ actor, params, input }) {
    const sys = await couponSystem(actor, input.unitId ?? null);
    const { unitId: _unitId, ...patch } = input;
    return jsonSafe(unwrap(await coupon.updateCoupon(sys.tenantId, sys.systemId, idOf(params.id), patch)));
  },
});

const toggle = defineMemberOp({
  id: "coupons.toggle",
  method: "POST",
  path: "/coupons/{id}/toggle",
  kind: "write",
  action: "member.promo.manage",
  summary: "Switch a coupon on or off. Off means nobody can use the code any more, including people who already have it.",
  label: "เปิด/ปิดคูปอง",
  input: z.object({ active: z.boolean(), unitId: z.string().trim().max(40).optional() }).strict(),
  test: "M2.10-S1.1",
  async handler({ actor, params, input }) {
    const sys = await couponSystem(actor, input.unitId ?? null);
    return jsonSafe(unwrap(await coupon.setCouponActive(sys.tenantId, sys.systemId, idOf(params.id), input.active)));
  },
});

const validate = defineMemberOp({
  id: "coupons.validate",
  method: "POST",
  path: "/coupons/validate",
  kind: "read",
  action: "member.promo.read",
  summary:
    "Can this code be used on this amount by this member, and how much does it take off? Writes nothing and never reserves the code, so a busy counter may still lose the last use to somebody else.",
  label: "ตรวจคูปอง",
  input: z
    .object({
      code: z.string().trim().min(1).max(40),
      amountSatang: z.coerce.number().int().min(0),
      customerId: z.string().trim().max(40).nullish().describe("Required when the coupon has a per member limit."),
      unitId: z.string().trim().max(40).nullish(),
    })
    .strict(),
  test: "M2.10-S1.1",
  async handler({ actor, input }) {
    const sys = await couponSystem(actor, input.unitId ?? null);
    const res = await coupon.validate({
      code: input.code,
      tenantId: sys.tenantId,
      systemId: sys.systemId,
      amountSatang: input.amountSatang,
      memberId: input.customerId ?? null,
      unitId: input.unitId ?? null,
    });
    return jsonSafe(res.ok ? res : { ...res, message_th: coupon.couponReasonText(res.reason) });
  },
});

const issuePerMember = defineMemberOp({
  id: "coupons.issuePerMember",
  method: "POST",
  path: "/coupons/{id}/per-member",
  kind: "write",
  action: "member.promo.issue",
  summary:
    "Turn one coupon into personal single use codes, one per member. The answer says which code belongs to whom; send them out yourself, because a personal code is not shown in anybody's wallet.",
  label: "ออกโค้ดคูปองรายคน",
  input: z
    .object({
      customerIds: z.array(z.string().trim().min(1).max(40)).min(1).max(500),
      usageLimit: z.coerce.number().int().min(1).max(99).optional().describe("Uses per personal code. Default 1."),
      startAt: z.coerce.date().nullish(),
      endAt: z.coerce.date().nullish(),
      unitId: z.string().trim().max(40).optional(),
    })
    .strict(),
  test: "M2.10-S1.1",
  async handler({ actor, params, input }) {
    const sys = await couponSystem(actor, input.unitId ?? null);
    return jsonSafe(
      unwrap(
        await coupon.issuePerMemberCodes({
          tenantId: sys.tenantId,
          systemId: sys.systemId,
          couponId: idOf(params.id),
          customerIds: input.customerIds,
          ...(input.usageLimit === undefined ? {} : { usageLimit: input.usageLimit }),
          ...(input.startAt === undefined ? {} : { startAt: input.startAt }),
          ...(input.endAt === undefined ? {} : { endAt: input.endAt }),
        }),
      ),
    );
  },
});

const saveToWallet = defineMemberOp({
  id: "coupons.saveToWallet",
  method: "POST",
  path: "/members/{id}/coupons",
  kind: "write",
  action: "member.promo.issue",
  summary:
    "Give one member their own single use code for a coupon, the way a 'save this offer' button would. Same thing as coupons.issuePerMember for one person.",
  label: "เก็บคูปองเข้ากระเป๋าสมาชิก",
  input: z
    .object({
      couponId: z.string().trim().min(1).max(40).describe("The coupon to make a personal code from."),
      usageLimit: z.coerce.number().int().min(1).max(99).optional(),
      unitId: z.string().trim().max(40).optional(),
    })
    .strict(),
  test: "M2.10-S1.1",
  async handler({ actor, params, input }) {
    const sys = await couponSystem(actor, input.unitId ?? null);
    const res = unwrap(
      await coupon.issuePerMemberCodes({
        tenantId: sys.tenantId,
        systemId: sys.systemId,
        couponId: input.couponId,
        customerIds: [idOf(params.id)],
        ...(input.usageLimit === undefined ? {} : { usageLimit: input.usageLimit }),
      }),
    );
    return jsonSafe({ saved: true, ...(res.coupons[0] ?? {}) });
  },
});

export const COUPONS_OPS: ApiOp[] = [list, create, update, toggle, validate, issuePerMember, saveToWallet];
