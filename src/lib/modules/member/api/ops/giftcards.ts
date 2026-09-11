// ops/giftcards.ts — op ของ "บัตรกำนัล" (MEMBER-API §2.12 · M2.10 · พิมพ์เขียว §5.9 · D3)
//
// บัตรกำนัล = **เงินของลูกค้าที่ร้านถือไว้** ไม่ใช่ส่วนลด ⇒ ขายแล้วเป็นหนี้สินของร้าน (เงินรับล่วงหน้า)
// และไม่ให้แต้มตอนขาย (ให้ตอนใช้จ่ายจริง) — กติกาพวกนี้อยู่ในโมดูลบัตรกำนัล ที่นี่แค่เปิดทาง
//
// 🔴 PIN คืน **ครั้งเดียว** ตอนขายสำเร็จ: ระบบไม่เก็บ PIN ดิบไว้ที่ไหนเลย ⇒ ยิงซ้ำด้วย
//    `Idempotency-Key` เดิมได้บัตรใบเดิมแต่ `pin: null` (ประกาศผ่าน `replaySecrets` — ดู `api/op.ts`)
//    ถ้าลูกค้าทำ PIN หาย ทางเดียวคือออกบัตรใบใหม่ ไม่มีทางอ่านของเดิมกลับมา
// 🔴 `giftcards.balance` เปิดให้คีย์ระดับอ่านใช้ได้ (ต้องรู้หมายเลขเต็มอยู่แล้วถึงจะถามได้) แต่การ
//    **ตัดยอด** ต้องมี PIN เสมอ — ยอดคงเหลือไม่ใช่ความลับ ความลับคือสิทธิ์ใช้เงินในบัตร

import { z } from "zod";
import * as giftcard from "@/lib/modules/giftcard";
import { memberActorOf } from "../actor";
import { giftCardCtx, loyaltyCtx } from "../loyalty";
import { defineMemberOp, type ApiOp } from "../op";
import { jsonSafe } from "../serialize";

const numberOf = (v: string | undefined): string => (v ?? "").trim();

const PAY_TYPES = ["CASH", "TRANSFER", "PROMPTPAY", "DEPOSIT", "ROOM_CHARGE"] as const;

const payMethods = z
  .array(z.object({ type: z.enum(PAY_TYPES), amountSatang: z.coerce.number().int().min(1) }).strict())
  .min(1)
  .max(5)
  .describe("How the buyer paid. The total must match the value of the card.");

const list = defineMemberOp({
  id: "giftcards.list",
  method: "GET",
  path: "/giftcards",
  kind: "read",
  rate: "report",
  action: "member.giftcard.manage",
  summary:
    "Gift cards of this shop with the money numbers that matter: sold this month, still outstanding (the shop's liability) and spent this month. Card numbers come back masked.",
  label: "รายการบัตรกำนัล",
  input: z
    .object({
      status: z.enum(["ACTIVE", "DEPLETED", "EXPIRED", "SUSPENDED"]).optional(),
      q: z.string().trim().max(60).optional().describe("Match on card number or the buyer's name."),
      take: z.coerce.number().int().min(1).max(500).optional(),
    })
    .strict(),
  test: "M2.10-S1.1",
  async handler({ actor, input }) {
    const b = await loyaltyCtx(actor);
    const res = await giftcard.list(giftCardCtx(b), {
      ...(input.status ? { status: input.status } : {}),
      ...(input.q ? { q: input.q } : {}),
      ...(input.take ? { take: input.take } : {}),
    });
    return jsonSafe(res);
  },
});

const sell = defineMemberOp({
  id: "giftcards.sell",
  method: "POST",
  path: "/giftcards",
  kind: "write",
  action: "member.giftcard.sell",
  replaySecrets: ["pin"],
  summary:
    "Sell a gift card. Money is taken through POS, so the branch and the payment methods are required. The PIN is returned once and only once - store it or hand it to the buyer immediately.",
  label: "ขายบัตรกำนัล",
  tool: {
    name: "member_giftcards_sell",
    hint: "Use this when somebody wants to buy a gift card. It always needs a human to confirm, because it takes money.",
  },
  input: z
    .object({
      satang: z.coerce.number().int().min(1).describe("Value of the card in satang."),
      buyerCustomerId: z.string().trim().max(40).nullish().describe("The member who paid, when they are one."),
      recipient: z
        .union([
          z.object({ customerId: z.string().trim().min(1).max(40) }).strict(),
          z.object({ contact: z.object({ name: z.string().trim().max(80).nullish(), phone: z.string().trim().max(30).nullish() }).strict() }).strict(),
          z.object({ print: z.literal(true) }).strict(),
        ])
        .describe("Who gets the card: an existing member, a name and phone, or a printed card handed over at the counter."),
      message: z.string().trim().max(300).nullish(),
      expiresAt: z.coerce.date().nullish().describe("Leave out to use the shop's gift card settings."),
      payMethods,
      unitId: z.string().trim().min(1).max(40),
    })
    .strict(),
  test: "M2.10-S2.4",
  async handler({ actor, input, idempotencyKey }) {
    const b = await loyaltyCtx(actor, input.unitId);
    return jsonSafe(
      await giftcard.sell(giftCardCtx(b), memberActorOf(actor), {
        satang: input.satang,
        ...(input.buyerCustomerId === undefined ? {} : { buyerCustomerId: input.buyerCustomerId }),
        recipient: input.recipient,
        ...(input.message === undefined ? {} : { message: input.message }),
        ...(input.expiresAt === undefined ? {} : { expiresAt: input.expiresAt }),
        payMethods: input.payMethods,
        unitId: input.unitId,
        idempotencyKey: `api.giftcards.sell:${idempotencyKey ?? `${input.unitId}:${Date.now()}`}`,
      }),
    );
  },
});

const balance = defineMemberOp({
  id: "giftcards.balance",
  method: "GET",
  path: "/giftcards/{number}/balance",
  kind: "read",
  action: "member.customer.read",
  summary: "What is left on a card, when it expires and whether it is usable. No PIN needed; a card of another shop answers 404.",
  label: "ยอดคงเหลือในบัตรกำนัล",
  tool: { name: "member_giftcard_balance", hint: "Use this when a customer reads out their gift card number and asks how much is left." },
  test: "M2.10-S5.3",
  async handler({ actor, params }) {
    const b = await loyaltyCtx(actor);
    const row = await giftcard.balance(giftCardCtx(b), { number: numberOf(params.number) }, memberActorOf(actor));
    return jsonSafe(row);
  },
});

const use = defineMemberOp({
  id: "giftcards.use",
  method: "POST",
  path: "/giftcards/{number}/use",
  kind: "write",
  action: "member.giftcard.sell",
  summary: "Charge a sale to a gift card. The PIN is required and too many wrong tries lock the card for a while.",
  label: "ตัดยอดจากบัตรกำนัล",
  input: z
    .object({
      pin: z.string().trim().min(1).max(10),
      satang: z.coerce.number().int().min(1),
      saleId: z.string().trim().min(1).max(40).describe("The POS sale being paid."),
    })
    .strict(),
  test: "M2.10-S1.1",
  async handler({ actor, params, input, idempotencyKey }) {
    const b = await loyaltyCtx(actor);
    const number = numberOf(params.number);
    return jsonSafe(
      await giftcard.use(giftCardCtx(b), {
        number,
        pin: input.pin,
        satang: input.satang,
        saleId: input.saleId,
        idempotencyKey: `api.giftcards.use:${idempotencyKey ?? `${number}:${input.saleId}`}`,
      }),
    );
  },
});

const reload = defineMemberOp({
  id: "giftcards.reload",
  method: "POST",
  path: "/giftcards/{number}/reload",
  kind: "write",
  action: "member.giftcard.sell",
  summary: "Top a card up with more money, taken through POS like a sale. Only works when the shop allows reloading.",
  label: "เติมเงินบัตรกำนัล",
  input: z.object({ satang: z.coerce.number().int().min(1), payMethods, unitId: z.string().trim().min(1).max(40) }).strict(),
  test: "M2.10-S1.1",
  async handler({ actor, params, input, idempotencyKey }) {
    const b = await loyaltyCtx(actor, input.unitId);
    const number = numberOf(params.number);
    return jsonSafe(
      await giftcard.reload(giftCardCtx(b), memberActorOf(actor), {
        number,
        satang: input.satang,
        payMethods: input.payMethods,
        unitId: input.unitId,
        idempotencyKey: `api.giftcards.reload:${idempotencyKey ?? `${number}:${Date.now()}`}`,
      }),
    );
  },
});

const transfer = defineMemberOp({
  id: "giftcards.transfer",
  method: "POST",
  path: "/giftcards/{number}/transfer",
  kind: "write",
  action: "member.giftcard.sell",
  summary: "Move a card to another member. The PIN proves the caller is holding the card, so only somebody who really has it can give it away.",
  label: "โอนบัตรกำนัลให้สมาชิกอีกคน",
  input: z.object({ pin: z.string().trim().min(1).max(10), toCustomerId: z.string().trim().min(1).max(40) }).strict(),
  test: "M2.10-S1.1",
  async handler({ actor, params, input }) {
    const b = await loyaltyCtx(actor);
    return jsonSafe(
      await giftcard.transfer(giftCardCtx(b), memberActorOf(actor), {
        number: numberOf(params.number),
        pin: input.pin,
        toCustomerId: input.toCustomerId,
      }),
    );
  },
});

const suspend = defineMemberOp({
  id: "giftcards.suspend",
  method: "POST",
  path: "/giftcards/{number}/suspend",
  kind: "write",
  action: "member.giftcard.manage",
  summary: "Freeze a card that was lost or looks stolen, or unfreeze one with `suspended: false`. The money stays on the card either way.",
  label: "ระงับ/ปลดระงับบัตรกำนัล",
  input: z
    .object({
      suspended: z.boolean().optional().describe("False lifts the freeze. Default true."),
      reason: z.string().trim().max(300).nullish(),
    })
    .strict(),
  test: "M2.10-S1.1",
  async handler({ actor, params, input }) {
    const b = await loyaltyCtx(actor);
    const number = numberOf(params.number);
    const gctx = giftCardCtx(b);
    const who = memberActorOf(actor);
    if (input.suspended === false) return jsonSafe(await giftcard.unsuspend(gctx, who, { number }));
    return jsonSafe(await giftcard.suspend(gctx, who, { number, ...(input.reason === undefined ? {} : { reason: input.reason }) }));
  },
});

const settingsGet = defineMemberOp({
  id: "giftcards.settings.get",
  method: "GET",
  path: "/giftcards/settings",
  kind: "read",
  action: "member.giftcard.manage",
  summary: "Gift card settings: whether they are sold at all, how long they last, the preset values, and whether sales are posted to the accounting book.",
  label: "การตั้งค่าบัตรกำนัล",
  test: "M2.10-S1.1",
  async handler({ actor }) {
    const b = await loyaltyCtx(actor);
    return jsonSafe(await giftcard.getSettings(giftCardCtx(b)));
  },
});

const settingsSet = defineMemberOp({
  id: "giftcards.settings.set",
  method: "PUT",
  path: "/giftcards/settings",
  kind: "write",
  action: "member.giftcard.manage",
  summary: "Change gift card settings. Send only what you want to move. Cards already sold keep the expiry they were sold with.",
  label: "บันทึกการตั้งค่าบัตรกำนัล",
  input: z
    .object({
      enabled: z.boolean().optional(),
      accountingLink: z.boolean().optional().describe("Post sales as deferred revenue and recognise it when the card is spent."),
      expiryMonths: z.coerce.number().int().min(1).max(120).optional(),
      denominations: z.array(z.coerce.number().int().min(1)).max(20).optional().describe("Preset values in satang."),
      transferable: z.boolean().optional(),
      reloadable: z.boolean().optional(),
    })
    .strict(),
  test: "M2.10-S1.1",
  async handler({ actor, input }) {
    const b = await loyaltyCtx(actor);
    return jsonSafe(await giftcard.setSettings(giftCardCtx(b), memberActorOf(actor), input));
  },
});

export const GIFTCARDS_OPS: ApiOp[] = [list, sell, balance, use, reload, transfer, suspend, settingsGet, settingsSet];
