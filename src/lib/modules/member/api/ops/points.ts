// ops/points.ts — op ของ "แต้มสะสม" (MEMBER-API §2.6 · M2.10)
//
// 🔴 op ที่นี่ไม่แตะฐานข้อมูลเอง — ทุกตัวเรียก facade `@/lib/modules/point` ซึ่งเป็นเจ้าของกติกาแต้ม
//    (ล็อต/หมดอายุ/FIFO/เพดานต่อวัน/สายอนุมัติ) ⇒ ยอดที่ REST ตอบ = ยอดเดียวกับที่หน้าจอเห็นเสมอ
// 🔴 "คิดให้ดูก่อน" (`/points/quote-earn` · `/points/quote-burn`) เป็น **read** แม้จะเป็น POST:
//    มันไม่เขียนอะไรเลย ⇒ ไม่ต้องมี Idempotency-Key และเรียกซ้ำได้ทุกครั้งที่ตะกร้าเปลี่ยน
//    (ใช้ body เพราะตะกร้าเป็นโครงสร้างซ้อน — ยัดลง query string แล้วอ่านไม่ออกและยาวเกินขีดจำกัด URL)
// 🔴 "ปรับแต้ม" (`points.adjust`) เป็น **danger**: มันเปลี่ยนยอดของลูกค้าด้วยมือโดยไม่มีบิลอ้างอิง
//    ⇒ ต้อง confirm + reason และถ้าร้านตั้งเพดานไว้ คำตอบคือ `{ pending, approvalRequestId }`
//    ส่วน `points.credit` เป็นทางของ "ชดเชย/ให้แต้มเพิ่ม" (บวกอย่างเดียว) จึงเป็น write ธรรมดา

import { z } from "zod";
import * as point from "@/lib/modules/point";
import { quoteApply } from "../../wallet";
import { memberActorOf, memberCtxOf } from "../actor";
import { loyaltyCtx, pointCtx } from "../loyalty";
import { defineMemberOp, type ApiOp } from "../op";
import { jsonSafe } from "../serialize";

const idOf = (v: string | undefined): string => (v ?? "").trim();

/** บรรทัดตะกร้าที่ใช้คิดแต้ม — `name` รับไว้เพื่อให้ผู้เรียกส่งตะกร้าเดิมมาได้ตรง ๆ (ไม่ถูกนำไปคิดเลข) */
const cartLine = z
  .object({
    name: z.string().trim().max(120).optional().describe("Line label. Ignored by the calculation; kept so you can send the cart you already have."),
    qty: z.coerce.number().int().min(0).max(9999),
    netSatang: z.coerce.number().int().min(0).describe("Line total after line level discounts, in satang."),
    itemId: z.string().trim().max(40).nullish(),
    categoryId: z.string().trim().max(40).nullish(),
  })
  .strict();

const cartInput = z
  .object({
    lines: z.array(cartLine).max(200).default([]),
    netSatang: z.coerce.number().int().min(0).describe("Bill total the points are calculated on, in satang."),
    grossSatang: z.coerce.number().int().min(0).optional(),
    unitId: z.string().trim().max(40).nullish().describe("Branch of the sale. Decides which point system applies."),
  })
  .strict();

const balance = defineMemberOp({
  id: "points.balance",
  method: "GET",
  path: "/members/{id}/points",
  kind: "read",
  action: "member.point.read",
  summary:
    "A member's point balance, the lots the balance is made of (in the order they will be spent) and the lots expiring soon.",
  label: "แต้มคงเหลือของสมาชิก",
  tool: { name: "member_points_balance", hint: "Use this before proposing a redemption, to check the member has enough points." },
  input: z
    .object({
      unitId: z.string().trim().max(40).optional().describe("Branch whose point system to read. Defaults to the first branch of the member system."),
      expiringDays: z.coerce.number().int().min(1).max(3650).optional().describe("Window for `expiringSoon`. Default 90 days."),
    })
    .strict(),
  test: "M2.10-S5.1",
  async handler({ actor, params, input }) {
    const b = await loyaltyCtx(actor, input.unitId ?? null);
    const pctx = pointCtx(b);
    const customerId = idOf(params.id);
    const days = input.expiringDays ?? 90;
    const [value, lots, expiringSoon] = await Promise.all([
      point.getBalance(pctx.systemId, customerId),
      point.listLots(pctx, customerId),
      point.expiringSoon(pctx, { customerId, days }),
    ]);
    return jsonSafe({ customerId, balance: value, lots, expiringSoon, expiringDays: days });
  },
});

const ledger = defineMemberOp({
  id: "points.ledger",
  method: "GET",
  path: "/members/{id}/points/ledger",
  kind: "read",
  action: "member.point.read",
  summary: "Every point movement of one member, newest first: what was earned, spent, adjusted, transferred or expired, and why.",
  label: "รายการแต้มของสมาชิก",
  input: z.object({ take: z.coerce.number().int().min(1).max(1000).optional().describe("How many rows. Default 200.") }).strict(),
  test: "M2.10-S1.1",
  async handler({ actor, params, input }) {
    const ctx = memberCtxOf(actor);
    const items = await point.listCustomerLedger(ctx.tenantId, ctx.systemId, idOf(params.id), input.take ?? 200);
    return jsonSafe({ items, total: items.length });
  },
});

const quoteEarn = defineMemberOp({
  id: "points.quoteEarn",
  method: "POST",
  path: "/points/quote-earn",
  kind: "read",
  action: "member.point.read",
  summary:
    "How many points this cart would earn this member, with the rule by rule breakdown. Writes nothing, so call it as often as the cart changes.",
  label: "คิดแต้มที่จะได้",
  input: z
    .object({
      customerId: z.string().trim().min(1).max(40),
      cart: cartInput.optional().describe("The sale to price. Leave out when asking about an event bonus instead."),
      event: z.enum(["SIGNUP", "BIRTHDAY", "REVIEW", "REFERRAL", "PROFILE_COMPLETE", "CHECKIN"]).optional(),
    })
    .strict(),
  test: "M2.10-S5.1",
  async handler({ actor, input }) {
    const b = await loyaltyCtx(actor, input.cart?.unitId ?? null);
    const result = await point.computeEarn(pointCtx(b), {
      customerId: input.customerId,
      ...(input.cart
        ? {
            sale: {
              lines: input.cart.lines.map((l) => ({
                itemId: l.itemId ?? null,
                categoryId: l.categoryId ?? null,
                qty: l.qty,
                netSatang: l.netSatang,
              })),
              netSatang: input.cart.netSatang,
              ...(input.cart.grossSatang === undefined ? {} : { grossSatang: input.cart.grossSatang }),
            },
          }
        : {}),
      ...(input.event ? { event: input.event } : {}),
    });
    return jsonSafe(result);
  },
});

const quoteBurn = defineMemberOp({
  id: "points.quoteBurn",
  method: "POST",
  path: "/points/quote-burn",
  kind: "read",
  action: "member.point.read",
  summary:
    "What a number of points is worth against this bill, after the shop's rules (point value, minimum, percentage cap and the member's own balance). Writes nothing.",
  label: "คิดส่วนลดจากแต้ม",
  input: z
    .object({
      customerId: z.string().trim().min(1).max(40),
      points: z.coerce.number().int().min(1).describe("Points the member wants to spend."),
      netSatang: z.coerce.number().int().min(0).describe("Bill total before the points are applied, in satang."),
      unitId: z.string().trim().max(40).nullish(),
    })
    .strict(),
  test: "M2.10-S1.1",
  async handler({ actor, input }) {
    // 🔴 คิดผ่าน `wallet.quoteApply` ตัวเดียวกับหน้าขาย — ไม่คำนวณสูตรซ้ำที่นี่ ไม่งั้นวันหนึ่ง
    //    ส่วนลดที่ REST บอกกับที่ POS ตัดจริงจะต่างกัน (ลำดับสิทธิ์ §9.1 เป็นสัญญา ไม่ใช่รายละเอียด)
    const quote = await quoteApply(
      memberCtxOf(actor),
      memberActorOf(actor),
      input.customerId,
      { unitId: input.unitId ?? null, lines: [{ name: "ยอดบิล", qty: 1, unitPriceSatang: input.netSatang }] },
      { points: input.points },
    );
    const line = quote.lines.find((l) => l.kind === "POINTS") ?? null;
    const conflict = quote.conflicts.find((c) => c.kind === "POINTS") ?? null;
    return jsonSafe({
      ok: !!line,
      points: input.points,
      discountSatang: line?.discountSatang ?? 0,
      netSatang: quote.netSatang,
      note: line?.note ?? null,
      reason: conflict?.message ?? null,
    });
  },
});

const credit = defineMemberOp({
  id: "points.credit",
  method: "POST",
  path: "/members/{id}/points/credit",
  kind: "write",
  action: "member.point.adjust",
  summary:
    "Give a member points by hand, for a goodwill gesture or to fix a missed earn. Over the shop's approval ceiling the answer is `{ pending: true, approvalRequestId }` and nothing moves until a manager approves.",
  label: "ให้แต้มเพิ่ม",
  tool: {
    name: "member_points_credit",
    hint: "Use this when somebody asks to compensate a customer with points. It always needs a human to confirm.",
  },
  input: z
    .object({
      points: z.coerce.number().int().min(1).max(1_000_000).describe("Points to add. Always positive; use points.adjust to take points away."),
      reason: z.string().trim().min(1).max(300).describe("Why. Stored on the ledger row and in the audit log."),
      expiresAt: z.coerce.date().nullish().describe("Expiry of the new lot. Leave out to use the shop's point settings."),
    })
    .strict(),
  test: "M2.10-S2.1",
  async handler({ actor, params, input, idempotencyKey }) {
    const b = await loyaltyCtx(actor);
    const result = await point.adjustWithApproval(pointCtx(b), memberActorOf(actor), {
      customerId: idOf(params.id),
      delta: input.points,
      reason: input.reason,
      ...(input.expiresAt === undefined ? {} : { expiresAt: input.expiresAt }),
      ...(idempotencyKey ? { idempotencyKey: `api.points.credit:${idempotencyKey}` } : {}),
    });
    return jsonSafe(result);
  },
});

const adjust = defineMemberOp({
  id: "points.adjust",
  method: "POST",
  path: "/members/{id}/points/adjust",
  kind: "danger",
  action: "member.point.adjust",
  summary:
    "Move a member's balance by hand in either direction. Taking points away cannot be undone from the outside, so this needs `confirm: true` and a reason. Over the shop's ceiling it answers `{ pending: true, approvalRequestId }`.",
  label: "ปรับแต้มด้วยมือ",
  input: z
    .object({
      delta: z.coerce.number().int().refine((v) => v !== 0, "ต้องไม่เท่ากับ 0").describe("Positive adds, negative takes away."),
      reason: z.string().trim().min(5).max(300),
      expiresAt: z.coerce.date().nullish(),
    })
    .strict(),
  test: "M2.10-S1.1",
  async handler({ actor, params, input, idempotencyKey }) {
    const b = await loyaltyCtx(actor);
    const result = await point.adjustWithApproval(pointCtx(b), memberActorOf(actor), {
      customerId: idOf(params.id),
      delta: input.delta,
      reason: input.reason,
      ...(input.expiresAt === undefined ? {} : { expiresAt: input.expiresAt }),
      ...(idempotencyKey ? { idempotencyKey: `api.points.adjust:${idempotencyKey}` } : {}),
    });
    return jsonSafe(result);
  },
});

const transfer = defineMemberOp({
  id: "points.transfer",
  method: "POST",
  path: "/members/{id}/points/transfer",
  kind: "write",
  action: "member.point.transfer",
  summary:
    "Move points from this member to another one. Only the member themself may do this, from a customer session and with a one time code they just received; a shop key is refused on purpose.",
  label: "โอนแต้มให้สมาชิกอีกคน",
  input: z
    .object({
      toCustomerId: z.string().trim().min(1).max(40),
      points: z.coerce.number().int().min(1),
      otp: z.string().trim().min(4).max(10).describe("The one time code the member asked for on their membership card page."),
    })
    .strict(),
  test: "M2.10-S1.1",
  async handler({ actor, params, input, idempotencyKey }) {
    const b = await loyaltyCtx(actor);
    return jsonSafe(
      await point.transferPoints(pointCtx(b), memberActorOf(actor), {
        fromCustomerId: idOf(params.id),
        toCustomerId: input.toCustomerId,
        points: input.points,
        otp: input.otp,
        idempotencyKey: `api.points.transfer:${idempotencyKey ?? `${params.id}:${Date.now()}`}`,
      }),
    );
  },
});

const reverse = defineMemberOp({
  id: "points.reverse",
  method: "POST",
  path: "/points/reverse",
  kind: "write",
  action: "member.point.adjust",
  summary:
    "Undo every point movement caused by one document, putting points back into the lots they came from. Use this when a sale or booking is cancelled outside SHARK.",
  label: "กลับรายการแต้มของเอกสาร",
  input: z
    .object({
      refType: z.string().trim().min(1).max(40).describe("Document type the points came from, for example `PosSale`."),
      refId: z.string().trim().min(1).max(40),
      reason: z.string().trim().max(300).optional(),
      unitId: z.string().trim().max(40).nullish(),
    })
    .strict(),
  test: "M2.10-S1.1",
  async handler({ actor, input, idempotencyKey }) {
    const b = await loyaltyCtx(actor, input.unitId ?? null);
    return jsonSafe(
      await point.reverseWithLots(pointCtx(b), {
        refType: input.refType,
        refId: input.refId,
        idempotencyKey: `api.points.reverse:${idempotencyKey ?? `${input.refType}:${input.refId}`}`,
        ...(input.reason ? { reason: input.reason } : {}),
      }),
    );
  },
});

const expiring = defineMemberOp({
  id: "points.expiring",
  method: "GET",
  path: "/points/expiring",
  kind: "read",
  rate: "report",
  action: "member.point.read",
  summary: "Every lot in this member system that expires within the window, soonest first. Use it to drive a reminder campaign.",
  label: "แต้มที่ใกล้หมดอายุ",
  input: z.object({ days: z.coerce.number().int().min(1).max(3650).optional().describe("Window in days. Default 30.") }).strict(),
  test: "M2.10-S6.1",
  async handler({ actor, input }) {
    const ctx = memberCtxOf(actor);
    const items = await point.expiringForMemberSystem(ctx.tenantId, ctx.systemId, input.days ?? 30);
    return jsonSafe({ items, total: items.length, days: input.days ?? 30 });
  },
});

const rulesList = defineMemberOp({
  id: "points.rules.list",
  method: "GET",
  path: "/points/rules",
  kind: "read",
  action: "member.settings.manage",
  summary: "The earn rules of the point system, in the order they are applied: base rate first, then multipliers and bonuses.",
  label: "กฎการได้แต้ม",
  test: "M2.10-S1.1",
  async handler({ actor }) {
    const b = await loyaltyCtx(actor);
    const items = await point.listRules(pointCtx(b));
    return jsonSafe({ items, total: items.length });
  },
});

const rulesUpsert = defineMemberOp({
  id: "points.rules.upsert",
  method: "POST",
  path: "/points/rules",
  kind: "write",
  action: "member.settings.manage",
  summary: "Add an earn rule, or replace one by sending its `id`. The config shape depends on `kind`; a wrong shape fails with 422 and the offending key.",
  label: "ตั้งกฎการได้แต้ม",
  input: z
    .object({
      id: z.string().trim().max(40).optional().describe("Leave out to create."),
      kind: z.enum(["BASE", "TIER_MULTIPLIER", "ITEM_BONUS", "CATEGORY_BONUS", "TIME_MULTIPLIER", "EVENT_BONUS"]),
      config: z.record(z.string(), z.unknown()).describe("Rule settings. BASE takes `satangPerPoint` and `base`; the others take their own keys."),
      priority: z.coerce.number().int().min(0).max(999).optional(),
      active: z.boolean().optional(),
    })
    .strict(),
  test: "M2.10-S1.1",
  async handler({ actor, input }) {
    const b = await loyaltyCtx(actor);
    return jsonSafe(await point.upsertRule(pointCtx(b), memberActorOf(actor), input));
  },
});

const rulesToggle = defineMemberOp({
  id: "points.rules.toggle",
  method: "POST",
  path: "/points/rules/{id}/toggle",
  kind: "write",
  action: "member.settings.manage",
  summary: "Turn an earn rule on or off. Points already given stay; only future sales change.",
  label: "เปิด/ปิดกฎการได้แต้ม",
  input: z.object({ active: z.boolean() }).strict(),
  test: "M2.10-S1.1",
  async handler({ actor, params, input }) {
    const b = await loyaltyCtx(actor);
    return jsonSafe(await point.toggleRule(pointCtx(b), memberActorOf(actor), idOf(params.id), input.active));
  },
});

const settingsGet = defineMemberOp({
  id: "points.settings.get",
  method: "GET",
  path: "/points/settings",
  kind: "read",
  action: "member.settings.manage",
  summary: "The shop's point settings: earn rate and base, expiry mode, what a point is worth when spent, transfer rules and the manual adjustment ceiling.",
  label: "การตั้งค่าแต้ม",
  test: "M2.10-S1.1",
  async handler({ actor }) {
    const ctx = memberCtxOf(actor);
    return jsonSafe(await point.getPointSettings(ctx.tenantId));
  },
});

const settingsSet = defineMemberOp({
  id: "points.settings.set",
  method: "PUT",
  path: "/points/settings",
  kind: "write",
  action: "member.settings.manage",
  summary: "Change point settings. Send only the keys you want to move; the rest are left alone. Changes apply to future earns, never retroactively.",
  label: "บันทึกการตั้งค่าแต้ม",
  input: z
    .object({
      satangPerPoint: z.coerce.number().int().min(1).optional(),
      active: z.boolean().optional(),
      expiryMode: z.enum(["MONTHS", "END_OF_YEAR", "NEVER"]).optional(),
      expiryMonths: z.coerce.number().int().min(1).max(120).optional(),
      remindDays: z.array(z.coerce.number().int().min(0).max(3650)).max(5).optional(),
      burnRateSatang: z.coerce.number().int().min(1).optional(),
      burnMinPoints: z.coerce.number().int().min(0).optional(),
      burnMaxPct: z.coerce.number().int().min(0).max(100).optional(),
      transferEnabled: z.boolean().optional(),
      transferMonthlyCap: z.coerce.number().int().min(0).nullish(),
      adjustApprovalOver: z.coerce.number().int().min(0).nullish(),
      earnBase: z.enum(["NET", "GROSS"]).optional(),
      excludeGiftCard: z.boolean().optional(),
      excludeVoucher: z.boolean().optional(),
      dailyCap: z.coerce.number().int().min(0).nullish(),
    })
    .strict(),
  test: "M2.10-S1.1",
  async handler({ actor, input }) {
    const ctx = memberCtxOf(actor);
    return jsonSafe(await point.setPointSettings({ tenantId: ctx.tenantId }, input));
  },
});

export const POINTS_OPS: ApiOp[] = [
  balance,
  ledger,
  quoteEarn,
  quoteBurn,
  credit,
  adjust,
  transfer,
  reverse,
  expiring,
  rulesList,
  rulesUpsert,
  rulesToggle,
  settingsGet,
  settingsSet,
];
