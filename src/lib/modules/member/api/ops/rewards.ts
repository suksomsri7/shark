// ops/rewards.ts — op ของ "ของรางวัล" (MEMBER-API §2.8 · M2.10)
//
// 🔴 สามคีย์ สามความหมาย (§6.1 — อย่ารวบเป็นคีย์เดียว):
//    `member.loyalty.manage` = ตั้งของรางวัล/ราคาแต้ม · `member.loyalty.read` = แลกให้ลูกค้า
//    `member.loyalty.fulfil` = ส่งมอบของจริง/ยกเลิกแล้วคืนแต้ม (คนที่ยืนจ่ายของหน้าร้าน)
// 🔴 "แลก" กับ "ส่งมอบ" แยกกันเสมอ: แลกแล้วได้ QR ไว้มารับทีหลัง ⇒ ตัดแต้มตอนแลก ไม่ใช่ตอนรับของ
//    (ถ้ารวมเป็นขั้นเดียว ลูกค้าที่จองของไว้แล้วมารับวันหลังจะโดนคนอื่นแย่งสต็อกไปก่อน)

import { z } from "zod";
import * as reward from "@/lib/modules/reward";
import { memberActorOf } from "../actor";
import { loyaltyCtx, rewardCtx } from "../loyalty";
import { defineMemberOp, type ApiOp } from "../op";
import { jsonSafe } from "../serialize";

const idOf = (v: string | undefined): string => (v ?? "").trim();

const rewardFields = {
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).nullish(),
  kind: z.enum(["ITEM", "SERVICE", "VOUCHER", "DISCOUNT"]),
  pointsCost: z.coerce.number().int().min(0).describe("Points the member pays. 0 with `stampsCost` means it is paid in stamps only."),
  stampCardId: z.string().trim().max(40).nullish(),
  stampsCost: z.coerce.number().int().min(0).nullish(),
  stock: z.coerce.number().int().min(0).nullish().describe("Null means unlimited."),
  tierDefIds: z.array(z.string().trim().max(40)).max(20).optional(),
  perMemberMonthly: z.coerce.number().int().min(1).max(99).nullish(),
  startAt: z.coerce.date().nullish(),
  endAt: z.coerce.date().nullish(),
  unitIds: z.array(z.string().trim().max(40)).max(50).optional(),
  pickupDays: z.coerce.number().int().min(1).max(365).optional().describe("How long the member has to collect before the redemption expires."),
  showToCustomer: z.boolean().optional(),
  imageFileId: z.string().trim().max(60).nullish(),
};

const list = defineMemberOp({
  id: "rewards.list",
  method: "GET",
  path: "/rewards",
  kind: "read",
  action: "member.loyalty.read",
  summary: "The reward catalogue with what each one costs in points or stamps, what is left in stock and how many are waiting to be collected.",
  label: "รายการของรางวัล",
  tool: { name: "member_rewards_list", hint: "Use this to answer 'what can I get with my points' and to find the reward id." },
  test: "M2.10-S2.5",
  async handler({ actor }) {
    const b = await loyaltyCtx(actor);
    const items = await reward.listRewardsV2(rewardCtx(b));
    return jsonSafe({ items, total: items.length });
  },
});

const create = defineMemberOp({
  id: "rewards.create",
  method: "POST",
  path: "/rewards",
  kind: "write",
  action: "member.loyalty.manage",
  summary: "Add a reward to the catalogue.",
  label: "เพิ่มของรางวัล",
  input: z.object(rewardFields).strict(),
  test: "M2.10-S1.1",
  async handler({ actor, input }) {
    const b = await loyaltyCtx(actor);
    return jsonSafe(await reward.createRewardV2(rewardCtx(b), memberActorOf(actor), input));
  },
});

const update = defineMemberOp({
  id: "rewards.update",
  method: "PATCH",
  path: "/rewards/{id}",
  kind: "write",
  action: "member.loyalty.manage",
  summary: "Change a reward. Redemptions already made keep the cost they were made at.",
  label: "แก้ไขของรางวัล",
  input: z
    .object({
      name: rewardFields.name.optional(),
      description: rewardFields.description,
      kind: rewardFields.kind.optional(),
      pointsCost: rewardFields.pointsCost.optional(),
      stampCardId: rewardFields.stampCardId,
      stampsCost: rewardFields.stampsCost,
      stock: rewardFields.stock,
      tierDefIds: rewardFields.tierDefIds,
      perMemberMonthly: rewardFields.perMemberMonthly,
      startAt: rewardFields.startAt,
      endAt: rewardFields.endAt,
      unitIds: rewardFields.unitIds,
      pickupDays: rewardFields.pickupDays,
      showToCustomer: rewardFields.showToCustomer,
      imageFileId: rewardFields.imageFileId,
    })
    .strict(),
  test: "M2.10-S1.1",
  async handler({ actor, params, input }) {
    const b = await loyaltyCtx(actor);
    return jsonSafe(await reward.updateRewardV2(rewardCtx(b), memberActorOf(actor), idOf(params.id), input));
  },
});

const toggle = defineMemberOp({
  id: "rewards.toggle",
  method: "POST",
  path: "/rewards/{id}/toggle",
  kind: "write",
  action: "member.loyalty.manage",
  summary: "Show or hide a reward. Hiding it stops new redemptions; ones already waiting can still be collected.",
  label: "เปิด/ปิดของรางวัล",
  input: z.object({ active: z.boolean() }).strict(),
  test: "M2.10-S1.1",
  async handler({ actor, params, input }) {
    const b = await loyaltyCtx(actor);
    return jsonSafe(await reward.toggleReward(rewardCtx(b), memberActorOf(actor), idOf(params.id), input.active));
  },
});

const redeem = defineMemberOp({
  id: "rewards.redeem",
  method: "POST",
  path: "/members/{id}/rewards/redeem",
  kind: "write",
  action: "member.loyalty.read",
  summary:
    "Redeem a reward for a member. The points or stamps are taken now and the answer carries the QR code the member shows when they come to collect.",
  label: "แลกของรางวัล",
  tool: { name: "member_rewards_redeem", hint: "Use this when a customer asks to spend their points on a reward. It always needs a human to confirm." },
  input: z
    .object({
      rewardId: z.string().trim().min(1).max(40),
      unitId: z.string().trim().max(40).nullish().describe("Branch handling the redemption."),
    })
    .strict(),
  test: "M2.10-S2.5",
  async handler({ actor, params, input, idempotencyKey }) {
    const customerId = idOf(params.id);
    const b = await loyaltyCtx(actor, input.unitId ?? null);
    return jsonSafe(
      await reward.redeemV2(rewardCtx(b), memberActorOf(actor), {
        rewardId: input.rewardId,
        customerId,
        ...(input.unitId === undefined ? {} : { unitId: input.unitId }),
        idempotencyKey: `api.rewards.redeem:${idempotencyKey ?? `${customerId}:${input.rewardId}:${Date.now()}`}`,
      }),
    );
  },
});

const redemptionsList = defineMemberOp({
  id: "rewards.redemptions.list",
  method: "GET",
  path: "/rewards/redemptions",
  kind: "read",
  rate: "report",
  action: "member.loyalty.read",
  summary: "Redemptions across the shop, newest first: who redeemed what, whether it was collected and when it expires.",
  label: "ประวัติการแลกของรางวัล",
  input: z
    .object({
      status: z.enum(["PENDING", "FULFILLED", "CANCELLED"]).optional(),
      unitId: z.string().trim().max(40).optional(),
      take: z.coerce.number().int().min(1).max(500).optional(),
    })
    .strict(),
  test: "M2.10-S1.1",
  async handler({ actor, input }) {
    const b = await loyaltyCtx(actor, input.unitId ?? null);
    const items = await reward.listRedemptionsV2(rewardCtx(b), {
      ...(input.status ? { status: input.status } : {}),
      ...(input.unitId ? { unitId: input.unitId } : {}),
      ...(input.take ? { take: input.take } : {}),
    });
    return jsonSafe({ items, total: items.length });
  },
});

const redemptionsLookup = defineMemberOp({
  id: "rewards.redemptions.lookup",
  method: "GET",
  path: "/rewards/redemptions/lookup",
  kind: "read",
  action: "member.loyalty.fulfil",
  summary:
    "Find one redemption by the code on the member's phone (QR content or the short code). Unknown or another shop's code answers `null` - it never hints that a code exists.",
  label: "ค้นรายการแลกจากรหัส",
  input: z.object({ code: z.string().trim().min(1).max(60) }).strict(),
  test: "M2.10-S1.1",
  async handler({ actor, input }) {
    const b = await loyaltyCtx(actor);
    return jsonSafe(await reward.lookupRedemption(rewardCtx(b), { code: input.code }));
  },
});

const fulfil = defineMemberOp({
  id: "rewards.fulfil",
  method: "POST",
  path: "/rewards/redemptions/{id}/fulfil",
  kind: "write",
  action: "member.loyalty.fulfil",
  summary: "Mark a redemption as collected. Calling it twice is safe; the second call changes nothing.",
  label: "ส่งมอบของรางวัล",
  input: z.object({ unitId: z.string().trim().max(40).optional().describe("Branch that handed the item over.") }).strict(),
  test: "M2.10-S1.1",
  async handler({ actor, params, input }) {
    const b = await loyaltyCtx(actor, input.unitId ?? null);
    return jsonSafe(
      await reward.fulfilV2(rewardCtx(b), memberActorOf(actor), {
        redemptionId: idOf(params.id),
        unitId: input.unitId ?? b.systems.unitId ?? "",
      }),
    );
  },
});

const cancel = defineMemberOp({
  id: "rewards.cancel",
  method: "POST",
  path: "/rewards/redemptions/{id}/cancel",
  kind: "write",
  action: "member.loyalty.fulfil",
  summary: "Cancel a redemption and give the points, stamps and stock back to the member.",
  label: "ยกเลิกการแลกของรางวัล",
  input: z.object({ reason: z.string().trim().min(1).max(300) }).strict(),
  test: "M2.10-S1.1",
  async handler({ actor, params, input }) {
    const b = await loyaltyCtx(actor);
    return jsonSafe(
      await reward.cancelV2(rewardCtx(b), memberActorOf(actor), { redemptionId: idOf(params.id), reason: input.reason }),
    );
  },
});

export const REWARDS_OPS: ApiOp[] = [
  list,
  create,
  update,
  toggle,
  redeem,
  redemptionsList,
  redemptionsLookup,
  fulfil,
  cancel,
];
