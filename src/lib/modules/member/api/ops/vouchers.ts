// ops/vouchers.ts — op ของ "voucher" (MEMBER-API §2.10 · M2.10 · พิมพ์เขียว §5.7 §11.5)
//
// voucher = ใบส่วนลดที่ออก **ให้คนใดคนหนึ่ง** (ต่างจากคูปองซึ่งเป็นโค้ดสาธารณะ)
// 🔴 ออกใบทีละหลายคนแล้วมูลค่ารวมเกินเพดานของร้าน = ไม่ออกทันที แต่ตอบ
//    `{ pending: true, approvalRequestId, batchId }` — คีย์ API ไม่ได้รับสิทธิ์ข้ามสายอนุมัติ
//    เพียงเพราะเป็นเครื่อง (ดูหัวไฟล์ `api/actor.ts`)
// 🔴 `vouchers.validate` เป็น **read** แม้เป็น POST: ตอบว่า "ใบนี้ใช้กับตะกร้านี้ได้ไหม ลดเท่าไหร่"
//    โดยไม่แตะสถานะของใบเลย ⇒ หน้าขายเรียกได้ทุกครั้งที่ตะกร้าเปลี่ยน

import { z } from "zod";
import * as voucher from "@/lib/modules/voucher";
import { memberActorOf, memberCtxOf } from "../actor";
import { memberScopedCtx } from "../loyalty";
import { defineMemberOp, type ApiOp } from "../op";
import { jsonSafe } from "../serialize";

const idOf = (v: string | undefined): string => (v ?? "").trim();

const KINDS = ["FIXED", "PERCENT", "FREE_ITEM", "FREE_SERVICE"] as const;
const ORIGINS = ["TIER", "BIRTHDAY", "JOURNEY", "CAMPAIGN", "REDEEM", "COMPENSATION", "REFERRAL", "STAMP", "MANUAL", "API"] as const;

const configInput = z
  .object({
    minSatang: z.coerce.number().int().min(0).optional(),
    categoryIds: z.array(z.string().trim().max(40)).max(100).optional(),
    itemIds: z.array(z.string().trim().max(40)).max(100).optional(),
    serviceIds: z.array(z.string().trim().max(40)).max(100).optional(),
    serviceId: z.string().trim().max(40).optional(),
    itemId: z.string().trim().max(40).optional(),
    stackWithCoupon: z.boolean().optional(),
    maxDiscountSatang: z.coerce.number().int().min(0).optional(),
    unitIds: z.array(z.string().trim().max(40)).max(50).optional(),
  })
  .strict();

const cartLine = z
  .object({
    name: z.string().trim().max(120).optional().describe("Line label. Ignored by the calculation."),
    itemId: z.string().trim().max(40).nullish(),
    serviceId: z.string().trim().max(40).nullish(),
    categoryId: z.string().trim().max(40).nullish(),
    qty: z.coerce.number().int().min(0).max(9999),
    netSatang: z.coerce.number().int().min(0),
  })
  .strict();

const cartInput = z
  .object({
    lines: z.array(cartLine).max(200),
    netSatang: z.coerce.number().int().min(0),
    unitId: z.string().trim().max(40).nullish(),
    couponApplied: z.boolean().optional().describe("True when a coupon is already on this bill; vouchers that cannot stack will refuse."),
  })
  .strict();

const templatesList = defineMemberOp({
  id: "vouchers.templates.list",
  method: "GET",
  path: "/vouchers/templates",
  kind: "read",
  action: "member.promo.manage",
  summary: "The voucher templates the shop has set up, with how many were issued from each.",
  label: "แบบ voucher",
  test: "M2.10-S1.1",
  async handler({ actor }) {
    const items = await voucher.listTemplates(memberScopedCtx(memberCtxOf(actor)));
    return jsonSafe({ items, total: items.length });
  },
});

const templateFields = {
  name: z.string().trim().min(1).max(80),
  kind: z.enum(KINDS),
  value: z.coerce.number().int().min(1).describe("FIXED: satang off. PERCENT: whole percent. FREE_*: how many units."),
  config: configInput.optional(),
  validDays: z.coerce.number().int().min(1).max(3650).describe("How long an issued voucher lives."),
  origin: z.enum(ORIGINS),
  active: z.boolean().optional(),
};

const templatesCreate = defineMemberOp({
  id: "vouchers.templates.create",
  method: "POST",
  path: "/vouchers/templates",
  kind: "write",
  action: "member.promo.manage",
  summary: "Create a voucher template so the same offer can be issued again and again without retyping the rules.",
  label: "สร้างแบบ voucher",
  input: z.object(templateFields).strict(),
  test: "M2.10-S1.1",
  async handler({ actor, input }) {
    return jsonSafe(await voucher.createTemplate(memberScopedCtx(memberCtxOf(actor)), memberActorOf(actor), input));
  },
});

const templatesUpdate = defineMemberOp({
  id: "vouchers.templates.update",
  method: "PATCH",
  path: "/vouchers/templates/{id}",
  kind: "write",
  action: "member.promo.manage",
  summary: "Change a voucher template. Vouchers already issued keep the rules they were issued with.",
  label: "แก้ไขแบบ voucher",
  input: z
    .object({
      name: templateFields.name.optional(),
      kind: templateFields.kind.optional(),
      value: templateFields.value.optional(),
      config: templateFields.config,
      validDays: templateFields.validDays.optional(),
      origin: templateFields.origin.optional(),
      active: templateFields.active,
    })
    .strict(),
  test: "M2.10-S1.1",
  async handler({ actor, params, input }) {
    return jsonSafe(
      await voucher.updateTemplate(memberScopedCtx(memberCtxOf(actor)), memberActorOf(actor), idOf(params.id), input),
    );
  },
});

const templatesToggle = defineMemberOp({
  id: "vouchers.templates.toggle",
  method: "POST",
  path: "/vouchers/templates/{id}/toggle",
  kind: "write",
  action: "member.promo.manage",
  summary: "Turn a template on or off. Vouchers already in members' hands are untouched.",
  label: "เปิด/ปิดแบบ voucher",
  input: z.object({ active: z.boolean() }).strict(),
  test: "M2.10-S1.1",
  async handler({ actor, params, input }) {
    return jsonSafe(
      await voucher.toggleTemplate(memberScopedCtx(memberCtxOf(actor)), memberActorOf(actor), idOf(params.id), input.active),
    );
  },
});

const list = defineMemberOp({
  id: "vouchers.list",
  method: "GET",
  path: "/vouchers",
  kind: "read",
  rate: "report",
  action: "member.promo.read",
  summary: "Issued vouchers across the shop with the headline numbers: how many are live, what they are worth and how many were used this month.",
  label: "รายการ voucher",
  input: z
    .object({
      status: z.enum(["ACTIVE", "USED", "EXPIRED", "CANCELLED"]).optional(),
      origin: z.enum(ORIGINS).optional(),
      customerId: z.string().trim().max(40).optional(),
      q: z.string().trim().max(60).optional().describe("Match on voucher code or member name."),
      take: z.coerce.number().int().min(1).max(500).optional(),
    })
    .strict(),
  test: "M2.10-S1.1",
  async handler({ actor, input }) {
    const res = await voucher.listVouchers(memberScopedCtx(memberCtxOf(actor)), {
      ...(input.status ? { status: input.status } : {}),
      ...(input.origin ? { origin: input.origin } : {}),
      ...(input.customerId ? { customerId: input.customerId } : {}),
      ...(input.q ? { q: input.q } : {}),
      ...(input.take ? { take: input.take } : {}),
    });
    return jsonSafe({ items: res.rows, total: res.rows.length, kpi: res.kpi });
  },
});

const forMember = defineMemberOp({
  id: "vouchers.forMember",
  method: "GET",
  path: "/members/{id}/vouchers",
  kind: "read",
  action: "member.promo.read",
  summary: "The vouchers one member is holding.",
  label: "voucher ของสมาชิก",
  input: z.object({ status: z.enum(["ACTIVE", "USED", "EXPIRED", "CANCELLED"]).optional() }).strict(),
  test: "M2.10-S1.1",
  async handler({ actor, params, input }) {
    const items = await voucher.listForCustomer(memberScopedCtx(memberCtxOf(actor)), idOf(params.id), {
      ...(input.status ? { status: input.status } : {}),
    });
    return jsonSafe({ items, total: items.length });
  },
});

const issue = defineMemberOp({
  id: "vouchers.issue",
  method: "POST",
  path: "/vouchers",
  kind: "write",
  action: "member.promo.issue",
  summary:
    "Issue vouchers to one or more members, either from a template or with the rules written inline. When the batch is worth more than the shop's ceiling the answer is `{ pending: true, approvalRequestId, batchId }` and nothing is issued until it is approved.",
  label: "ออก voucher ให้สมาชิก",
  tool: {
    name: "member_vouchers_issue",
    hint: "Use this when somebody asks to send a discount to a customer or a group of them. It always needs a human to confirm.",
  },
  input: z
    .object({
      customerIds: z.array(z.string().trim().min(1).max(40)).min(1).max(500),
      templateId: z.string().trim().max(40).nullish().describe("Use a template. Send `adhoc` instead to write the rules inline."),
      adhoc: z
        .object({
          kind: z.enum(KINDS),
          value: z.coerce.number().int().min(1),
          config: configInput.optional(),
          validDays: z.coerce.number().int().min(1).max(3650),
        })
        .strict()
        .nullish(),
      origin: z.enum(ORIGINS).describe("Why it is being issued. Shows up in reports and on the member's timeline."),
      originRef: z.record(z.string(), z.unknown()).nullish(),
      reason: z.string().trim().max(300).nullish(),
      notify: z.boolean().optional().describe("Tell the member through their chat channel when it is issued."),
    })
    .strict(),
  test: "M2.10-S2.3",
  async handler({ actor, input }) {
    return jsonSafe(await voucher.issue(memberScopedCtx(memberCtxOf(actor)), memberActorOf(actor), input));
  },
});

const validate = defineMemberOp({
  id: "vouchers.validate",
  method: "POST",
  path: "/vouchers/validate",
  kind: "read",
  action: "member.promo.read",
  summary:
    "Can this voucher be used on this cart, and how much does it take off? Writes nothing. A voucher that cannot be used comes back with `ok: false` and a Thai reason staff can read out.",
  label: "ตรวจ voucher กับตะกร้า",
  input: z
    .object({
      customerId: z.string().trim().min(1).max(40),
      voucherId: z.string().trim().max(40).nullish(),
      code: z.string().trim().max(40).nullish().describe("Send this or `voucherId`."),
      cart: cartInput,
    })
    .strict(),
  test: "M2.10-S5.2",
  async handler({ actor, input }) {
    return jsonSafe(
      await voucher.validate(memberScopedCtx(memberCtxOf(actor)), {
        customerId: input.customerId,
        ...(input.voucherId === undefined ? {} : { voucherId: input.voucherId }),
        ...(input.code === undefined ? {} : { code: input.code }),
        cart: {
          lines: input.cart.lines.map((l) => ({
            itemId: l.itemId ?? null,
            serviceId: l.serviceId ?? null,
            categoryId: l.categoryId ?? null,
            qty: l.qty,
            netSatang: l.netSatang,
          })),
          netSatang: input.cart.netSatang,
          unitId: input.cart.unitId ?? null,
          ...(input.cart.couponApplied === undefined ? {} : { couponApplied: input.cart.couponApplied }),
        },
      }),
    );
  },
});

const redeem = defineMemberOp({
  id: "vouchers.redeem",
  method: "POST",
  path: "/vouchers/{id}/redeem",
  kind: "write",
  action: "member.promo.issue",
  summary: "Mark a voucher as used on a sale or an appointment. A voucher can only be used once, so a second call fails.",
  label: "ใช้ voucher",
  input: z
    .object({
      customerId: z.string().trim().min(1).max(40),
      saleId: z.string().trim().max(40).nullish(),
      appointmentId: z.string().trim().max(40).nullish(),
      discountSatang: z.coerce.number().int().min(0).nullish().describe("What it actually took off. Recorded for the campaign report."),
    })
    .strict(),
  test: "M2.10-S1.1",
  async handler({ actor, params, input }) {
    return jsonSafe(
      await voucher.redeem(memberScopedCtx(memberCtxOf(actor)), {
        voucherId: idOf(params.id),
        customerId: input.customerId,
        ...(input.saleId === undefined ? {} : { saleId: input.saleId }),
        ...(input.appointmentId === undefined ? {} : { appointmentId: input.appointmentId }),
        ...(input.discountSatang === undefined ? {} : { discountSatang: input.discountSatang }),
      }),
    );
  },
});

const release = defineMemberOp({
  id: "vouchers.release",
  method: "POST",
  path: "/vouchers/{id}/release",
  kind: "write",
  action: "member.promo.issue",
  summary:
    "Give a used voucher back to the member because the sale was cancelled. A voucher that expired while it was tied up gets extra days so the member is not punished for the shop's mistake.",
  label: "คืน voucher ให้สมาชิก",
  input: z.object({ reason: z.string().trim().max(300).nullish() }).strict(),
  test: "M2.10-S1.1",
  async handler({ actor, params, input }) {
    return jsonSafe(
      await voucher.release(memberScopedCtx(memberCtxOf(actor)), {
        voucherId: idOf(params.id),
        ...(input.reason === undefined ? {} : { reason: input.reason }),
      }),
    );
  },
});

const cancel = defineMemberOp({
  id: "vouchers.cancel",
  method: "POST",
  path: "/vouchers/{id}/cancel",
  kind: "write",
  action: "member.promo.manage",
  summary: "Void a voucher that should never have been issued. The member loses it, so say why.",
  label: "ยกเลิก voucher",
  input: z.object({ reason: z.string().trim().min(1).max(300) }).strict(),
  test: "M2.10-S1.1",
  async handler({ actor, params, input }) {
    return jsonSafe(
      await voucher.cancel(memberScopedCtx(memberCtxOf(actor)), memberActorOf(actor), {
        voucherId: idOf(params.id),
        reason: input.reason,
      }),
    );
  },
});

export const VOUCHERS_OPS: ApiOp[] = [
  templatesList,
  templatesCreate,
  templatesUpdate,
  templatesToggle,
  list,
  forMember,
  issue,
  validate,
  redeem,
  release,
  cancel,
];
