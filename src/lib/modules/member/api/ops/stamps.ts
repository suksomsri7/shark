// ops/stamps.ts — op ของ "บัตรสะสมตรา" (MEMBER-API §2.7 · M2.10)
//
// 🔴 ประทับตราเป็น `member.loyalty.stamp` ไม่ใช่ `loyalty.manage`: พนักงานหน้าร้านต้องประทับได้
//    แต่ต้องแก้กติกาของใบไม่ได้ (คนละคีย์ คนละความเสี่ยง)
// 🔴 การประทับต้องมี **รหัสกันซ้ำระดับบริการ** เสมอ (`addStamp.idempotencyKey`) ไม่ใช่พึ่งด่านของ REST
//    อย่างเดียว — ลูกค้าคนเดียวกดผ่าน 2 ช่องทางพร้อมกัน (จอพนักงาน + QR ของลูกค้า) ยังเป็นคนละคำขอ
//    ในสายตาของ HTTP แต่ต้องได้ตราใบเดียว ⇒ ส่ง `Idempotency-Key` ต่อลงไปให้ชั้นบริการด้วย

import { z } from "zod";
import * as stamp from "@/lib/modules/stamp";
import { memberActorOf, memberCtxOf } from "../actor";
import { memberScopedCtx } from "../loyalty";
import { defineMemberOp, type ApiOp } from "../op";
import { jsonSafe } from "../serialize";

const idOf = (v: string | undefined): string => (v ?? "").trim();

const ruleConfig = z
  .object({
    minSatang: z.coerce.number().int().min(0).nullish().describe("PER_SALE_MIN: the bill must reach this to earn a stamp."),
    itemIds: z.array(z.string().trim().max(40)).max(200).optional(),
    serviceIds: z.array(z.string().trim().max(40)).max(200).optional(),
    perDayMax: z.coerce.number().int().min(1).max(50).optional().describe("Most stamps one member can collect in a Thai calendar day."),
    allowStaffScan: z.boolean().optional(),
    allowAutoFromSale: z.boolean().optional(),
    staffPin: z.string().trim().max(12).nullish().describe("PIN a customer types on their own phone to claim a stamp."),
  })
  .strict();

const cardInput = {
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(300).nullish(),
  slots: z.coerce.number().int().min(stamp.STAMP_MIN_SLOTS).max(stamp.STAMP_MAX_SLOTS),
  ruleKind: z.enum(["PER_SALE_MIN", "PER_ITEM", "PER_VISIT", "PER_DAY", "MANUAL"]),
  ruleConfig: ruleConfig.nullish(),
  rewardKind: z.enum(["VOUCHER", "REWARD", "POINTS", "DISCOUNT_NEXT"]),
  rewardConfig: z.record(z.string(), z.unknown()).nullish().describe("What a full card pays out. Depends on `rewardKind`, for example `{ points: 50 }`."),
  autoRestart: z.boolean().optional().describe("Start a fresh card the moment one is completed. Default true."),
  validMonths: z.coerce.number().int().min(1).max(120).nullish(),
  tierDefIds: z.array(z.string().trim().max(40)).max(20).optional().describe("Empty means every tier can collect."),
  unitIds: z.array(z.string().trim().max(40)).max(50).optional().describe("Empty means every branch."),
  sortOrder: z.coerce.number().int().min(0).max(999).optional(),
};

const cardsList = defineMemberOp({
  id: "stamps.cards.list",
  method: "GET",
  path: "/stamps/cards",
  kind: "read",
  action: "member.loyalty.read",
  summary: "Every stamp card of this member system with how it is earned, what a full card pays and how many members are collecting it.",
  label: "รายการบัตรสะสมตรา",
  tool: { name: "member_stamp_cards", hint: "Use this to find the card id before stamping or before answering 'what cards do we run'." },
  test: "M2.10-S2.2",
  async handler({ actor }) {
    const items = await stamp.listCards(memberScopedCtx(memberCtxOf(actor)));
    return jsonSafe({ items, total: items.length });
  },
});

const cardsCreate = defineMemberOp({
  id: "stamps.cards.create",
  method: "POST",
  path: "/stamps/cards",
  kind: "write",
  action: "member.loyalty.manage",
  summary: "Create a stamp card. It starts active, so members can collect on it from the next qualifying sale.",
  label: "สร้างบัตรสะสมตรา",
  input: z.object(cardInput).strict(),
  test: "M2.10-S1.1",
  async handler({ actor, input }) {
    return jsonSafe(await stamp.createCard(memberScopedCtx(memberCtxOf(actor)), memberActorOf(actor), input));
  },
});

const cardsUpdate = defineMemberOp({
  id: "stamps.cards.update",
  method: "PATCH",
  path: "/stamps/cards/{id}",
  kind: "write",
  action: "member.loyalty.manage",
  summary: "Change a stamp card. Cards members already hold keep the stamps they have; the new rules apply from now on.",
  label: "แก้ไขบัตรสะสมตรา",
  input: z
    .object({
      name: cardInput.name.optional(),
      description: cardInput.description,
      slots: cardInput.slots.optional(),
      ruleKind: cardInput.ruleKind.optional(),
      ruleConfig: cardInput.ruleConfig,
      rewardKind: cardInput.rewardKind.optional(),
      rewardConfig: cardInput.rewardConfig,
      autoRestart: cardInput.autoRestart,
      validMonths: cardInput.validMonths,
      tierDefIds: cardInput.tierDefIds,
      unitIds: cardInput.unitIds,
      sortOrder: cardInput.sortOrder,
    })
    .strict(),
  test: "M2.10-S1.1",
  async handler({ actor, params, input }) {
    return jsonSafe(await stamp.updateCard(memberScopedCtx(memberCtxOf(actor)), memberActorOf(actor), idOf(params.id), input));
  },
});

const cardsToggle = defineMemberOp({
  id: "stamps.cards.toggle",
  method: "POST",
  path: "/stamps/cards/{id}/toggle",
  kind: "write",
  action: "member.loyalty.manage",
  summary: "Turn a stamp card on or off. Turning it off stops new stamps but never removes stamps members already earned.",
  label: "เปิด/ปิดบัตรสะสมตรา",
  input: z.object({ active: z.boolean() }).strict(),
  test: "M2.10-S1.1",
  async handler({ actor, params, input }) {
    return jsonSafe(await stamp.toggleCard(memberScopedCtx(memberCtxOf(actor)), memberActorOf(actor), idOf(params.id), input.active));
  },
});

const progress = defineMemberOp({
  id: "stamps.progress",
  method: "GET",
  path: "/members/{id}/stamps",
  kind: "read",
  action: "member.loyalty.read",
  summary: "How far this member is on every stamp card they can collect: stamps so far, slots to fill, which cycle and when the card expires.",
  label: "ตราสะสมของสมาชิก",
  test: "M2.10-S5.3",
  async handler({ actor, params }) {
    const items = await stamp.progressFor(memberScopedCtx(memberCtxOf(actor)), idOf(params.id));
    return jsonSafe({ items, total: items.length });
  },
});

const add = defineMemberOp({
  id: "stamps.add",
  method: "POST",
  path: "/members/{id}/stamps",
  kind: "write",
  action: "member.loyalty.stamp",
  summary:
    "Stamp a member's card. Completing a card pays the reward straight away, so the answer tells you whether it completed and which voucher came out.",
  label: "ประทับตราให้สมาชิก",
  tool: { name: "member_stamps_add", hint: "Use this when staff ask to stamp a card for a customer. It always needs a human to confirm." },
  input: z
    .object({
      cardId: z.string().trim().min(1).max(40),
      count: z.coerce.number().int().min(1).max(20).optional().describe("How many stamps. Default 1."),
      unitId: z.string().trim().max(40).nullish(),
      byPin: z.string().trim().max(12).nullish().describe("The card's staff PIN, when the customer is claiming the stamp themself."),
    })
    .strict(),
  test: "M2.10-S2.2",
  async handler({ actor, params, input, idempotencyKey }) {
    const customerId = idOf(params.id);
    return jsonSafe(
      await stamp.addStamp(memberScopedCtx(memberCtxOf(actor)), memberActorOf(actor), {
        cardId: input.cardId,
        customerId,
        ...(input.count === undefined ? {} : { count: input.count }),
        refType: "MANUAL",
        ...(input.unitId === undefined ? {} : { unitId: input.unitId }),
        ...(input.byPin === undefined ? {} : { byPin: input.byPin }),
        idempotencyKey: `api.stamps.add:${idempotencyKey ?? `${customerId}:${input.cardId}:${Date.now()}`}`,
      }),
    );
  },
});

const voidEvent = defineMemberOp({
  id: "stamps.void",
  method: "POST",
  path: "/stamps/events/{id}/void",
  kind: "write",
  action: "member.loyalty.manage",
  summary: "Cancel one stamping. The stamps go back off the card; a reward already paid out for that cycle is not clawed back automatically.",
  label: "ยกเลิกตราที่ประทับ",
  test: "M2.10-S1.1",
  async handler({ actor, params }) {
    return jsonSafe(
      await stamp.voidStampEvent(memberScopedCtx(memberCtxOf(actor)), memberActorOf(actor), { eventId: idOf(params.id) }),
    );
  },
});

const stats = defineMemberOp({
  id: "stamps.stats",
  method: "GET",
  path: "/stamps/cards/{id}/stats",
  kind: "read",
  rate: "report",
  action: "member.loyalty.read",
  summary: "Counts for one stamp card: members collecting right now, cards completed and rewards handed out.",
  label: "สถิติบัตรสะสมตรา",
  test: "M2.10-S1.1",
  async handler({ actor, params }) {
    return jsonSafe(await stamp.cardStats(memberScopedCtx(memberCtxOf(actor)), idOf(params.id)));
  },
});

export const STAMPS_OPS: ApiOp[] = [cardsList, cardsCreate, cardsUpdate, cardsToggle, progress, add, voidEvent, stats];
