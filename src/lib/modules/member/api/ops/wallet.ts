// ops/wallet.ts — op ของ "กระเป๋าสิทธิ์" (MEMBER-API §2.9 · M2.10 · พิมพ์เขียว §5.8 §9.1)
//
// 🔴 สามตัวนี้คือทางเข้าเดียวที่ผู้เชื่อมต่อควรใช้เวลาถามว่า "ลูกค้าคนนี้มีสิทธิ์อะไร และบิลนี้เหลือเท่าไหร่"
//    — อย่าไล่ถามทีละโมดูล (แต้ม/voucher/คูปอง/บัตรกำนัล) แล้วประกอบลำดับส่วนลดเอง: ลำดับ
//    ระดับ → voucher → คูปอง → แต้ม → บัตรกำนัล เป็น **สัญญา** (§9.1) ถ้าใครคิดเอง ยอดที่หน้าขาย
//    กับยอดในแอปจะไม่ตรงกันเงียบ ๆ
// 🔴 `wallet.quote` เป็น **read** แม้จะเป็น POST (ไม่เขียนอะไรเลย เรียกซ้ำได้ทุกครั้งที่ตะกร้าเปลี่ยน)
//    ส่วน `wallet.apply` ตัดสิทธิ์จริง **ใน transaction ของบิล** ⇒ ต้องมี `saleId` ของบิลที่เปิดไว้แล้ว

import { z } from "zod";
import { memberActorOf, memberCtxOf } from "../actor";
import { defineMemberOp, type ApiOp } from "../op";
import { jsonSafe } from "../serialize";
import { applyOnSaleStandalone, getWallet, quoteApply } from "../../wallet";

const idOf = (v: string | undefined): string => (v ?? "").trim();

const cartLine = z
  .object({
    name: z.string().trim().min(1).max(120),
    qty: z.coerce.number().int().min(0).max(9999),
    unitPriceSatang: z.coerce.number().int().min(0),
    discountSatang: z.coerce.number().int().min(0).optional().describe("Line level discount staff already gave, not a discount from a right."),
    itemId: z.string().trim().max(40).nullish(),
    serviceId: z.string().trim().max(40).nullish(),
    categoryId: z.string().trim().max(40).nullish(),
  })
  .strict();

const cart = z
  .object({
    unitId: z.string().trim().max(40).nullish().describe("Branch of the sale. Decides which rights apply and which point system is used."),
    lines: z.array(cartLine).max(200),
    couponCode: z.string().trim().max(40).nullish(),
  })
  .strict();

const choices = z
  .object({
    voucherIds: z.array(z.string().trim().max(40)).max(10).optional(),
    points: z.coerce.number().int().min(0).optional().describe("Points the member wants to spend. The answer may lower it to fit the shop's cap."),
    giftCard: z
      .object({
        number: z.string().trim().min(1).max(30),
        pin: z.string().trim().max(10).nullish(),
        satang: z.coerce.number().int().min(1),
      })
      .strict()
      .nullish(),
    couponCode: z.string().trim().max(40).nullish(),
  })
  .strict();

const get = defineMemberOp({
  id: "wallet.get",
  method: "GET",
  path: "/members/{id}/wallet",
  kind: "read",
  action: "member.customer.read",
  summary:
    "Everything this member can spend: point balance and the lots expiring soon, vouchers, coupons, gift cards, rewards waiting to be collected, stamp cards and the benefits of their tier.",
  label: "กระเป๋าสิทธิ์ของสมาชิก",
  tool: { name: "member_wallet", hint: "Use this to answer 'what do I have' before suggesting how a customer could pay." },
  test: "M2.10-S5.2",
  async handler({ actor, params }) {
    return jsonSafe(await getWallet(memberCtxOf(actor), memberActorOf(actor), idOf(params.id)));
  },
});

const quote = defineMemberOp({
  id: "wallet.quote",
  method: "POST",
  path: "/members/{id}/wallet/quote",
  kind: "read",
  action: "member.customer.read",
  summary:
    "Apply a chosen set of rights to a cart and see what is left to pay, line by line, in the fixed order tier, voucher, coupon, points, gift card. Writes nothing. Rights that cannot be used come back in `conflicts` with a Thai reason instead of failing the whole quote.",
  label: "คิดส่วนลดจากสิทธิ์",
  tool: {
    name: "member_wallet_quote",
    hint: "Use this to answer 'how much would this cost if I use my points and that voucher'. It never changes anything.",
  },
  input: z.object({ cart, choices: choices.optional() }).strict(),
  test: "M2.10-S4.5",
  async handler({ actor, params, input }) {
    return jsonSafe(
      await quoteApply(memberCtxOf(actor), memberActorOf(actor), idOf(params.id), input.cart, input.choices ?? {}),
    );
  },
});

const apply = defineMemberOp({
  id: "wallet.apply",
  method: "POST",
  path: "/members/{id}/wallet/apply",
  kind: "write",
  action: "member.customer.update",
  summary:
    "Actually spend the chosen rights on an open sale: vouchers are marked used, points are burned, the gift card is charged. Everything happens inside the sale's transaction, so if one right cannot be used nothing at all is spent.",
  label: "ใช้สิทธิ์กับบิล",
  input: z
    .object({
      saleId: z.string().trim().min(1).max(40).describe("The POS sale the rights are spent on. It must already exist."),
      unitId: z.string().trim().max(40).nullish(),
      cart,
      choices,
    })
    .strict(),
  test: "M2.10-S1.1",
  async handler({ actor, params, input }) {
    return jsonSafe(
      await applyOnSaleStandalone(memberCtxOf(actor), {
        saleId: input.saleId,
        customerId: idOf(params.id),
        ...(input.unitId === undefined ? {} : { unitId: input.unitId }),
        cart: input.cart,
        choices: input.choices,
      }),
    );
  },
});

export const WALLET_OPS: ApiOp[] = [get, quote, apply];
