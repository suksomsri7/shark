// ops/me.ts — op ของ "ตัวลูกค้าเอง" (MEMBER-API §2.20 · M1.11 ประกาศสัญญา · M2.10 เปิดทำงานจริง)
//
// 🔴 ช่องทางนี้เป็นของ **ลูกค้า** ไม่ใช่ของร้าน: `/me/*` ตอบจาก session ลูกค้า (LIFF / ในแอป)
//    ที่ผูกกับ `customerId` คนเดียว — คีย์ API ของร้านไม่มีทางเป็น "ลูกค้าคนนั้น" ได้เลย
//    ⇒ คีย์ที่ยิงมาได้ 401 `customer_session_required` ไม่ใช่ 403 `scope_missing`
//      (403 จะทำให้ผู้เชื่อมต่อไล่เติม scope ไปเรื่อย ๆ ทั้งที่ **ไม่มี scope ไหนเปิดทางนี้ได้**)
//    ทางเข้าจริง: `Authorization: Bearer cs_…` (token จาก `/m/<slug>/login`) — ดู `api/customer-lane.ts`
//
// 🔴 ทุก op ที่นี่ส่ง `actor` ที่เป็น `CUSTOMER` ลงไปให้ service เสมอ แล้ว service เป็นคนตรวจซ้ำว่า
//    "เจ้าของบัญชีจริงไหม" (`me.assertSelf` · `wallet.assertVisible` · `redeemV2.assertRedeem`
//    · `transferPoints`) — ด่าน 2 ชั้นโดยตั้งใจ ต่อให้ชั้น REST พลาด ข้อมูลของคนอื่นก็ยังไม่หลุด
// 🔴 ทำไม `action` เป็นคีย์อ่าน/แก้ของลูกค้าทั่วไป: ด่านสิทธิ์ของแกน REST ต้องผ่านก่อนถึง handler
//    ⇒ ถ้าตั้ง action เป็นคีย์ที่ไม่มีใครมี ผู้เรียกจะได้ 403 ก่อนเห็นเหตุผลจริง

import { z } from "zod";
import * as giftcard from "@/lib/modules/giftcard";
import * as point from "@/lib/modules/point";
import * as reward from "@/lib/modules/reward";
import * as stamp from "@/lib/modules/stamp";
import * as voucher from "@/lib/modules/voucher";
import type { ApiActor } from "@/lib/api/actor";
import { ApiError } from "@/lib/api/respond";
import { memberActorOf, memberCtxOf } from "../actor";
import { giftCardCtx, loyaltyCtx, memberScopedCtx, pointCtx, rewardCtx } from "../loyalty";
import { defineMemberOp, type ApiOp } from "../op";
import { jsonSafe } from "../serialize";
import { getWallet } from "../../wallet";
import * as me from "../../me";

/** ทุก op ของช่องทางลูกค้า ตอบเหมือนกันเมื่อผู้เรียกไม่ใช่ตัวลูกค้าเอง */
function requireCustomerSession(): never {
  throw new ApiError(
    401,
    "customer_session_required",
    "เส้นทางนี้เป็นของลูกค้าเอง (เข้าผ่านบัตรสมาชิกในไลน์หรือในแอป) — คีย์ API ของร้านใช้ไม่ได้ " +
      "ถ้าต้องการอ่านหรือแก้ข้อมูลสมาชิกในนามร้าน ใช้ /members/{id} แทน",
    "This lane belongs to the customer and needs a customer session. Use the shop-facing /members endpoints instead.",
    "ไม่มีชุดสิทธิ์ใดของคีย์ที่เปิดเส้นทาง /me ได้",
  );
}

/** id ของลูกค้าที่ session นี้เป็นเจ้าของ — ไม่มี = ผู้เรียกไม่ใช่ลูกค้า */
function selfId(actor: ApiActor): string {
  const id = actor.customerId;
  if (!id) return requireCustomerSession();
  return id;
}

const meGet = defineMemberOp({
  id: "me.get",
  method: "GET",
  path: "/me",
  kind: "read",
  action: "member.customer.read",
  summary:
    "The signed-in customer's own profile and the fields the shop lets them see. Needs a customer session (LIFF or the mobile app); a shop API key gets 401 customer_session_required.",
  label: "โปรไฟล์ของฉัน",
  test: "M2.10-S3.1",
  async handler({ actor }) {
    const customerId = selfId(actor);
    return jsonSafe(await me.meGet(memberCtxOf(actor), memberActorOf(actor), customerId));
  },
});

const meUpdate = defineMemberOp({
  id: "me.update",
  method: "PATCH",
  path: "/me",
  kind: "write",
  action: "member.customer.update",
  summary:
    "The signed-in customer edits their own details. Only fields the shop marked as customer editable may be sent. Needs a customer session; a shop API key gets 401 customer_session_required.",
  label: "แก้ไขข้อมูลของฉัน",
  input: z
    .object({
      fields: z
        .record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.array(z.string()), z.null()]))
        .optional()
        .describe("Only field keys whose `customerEditable` is true in GET /fields/layout?audience=customer."),
    })
    .strict(),
  test: "M2.10-S3.1",
  async handler({ actor, input }) {
    const customerId = selfId(actor);
    return jsonSafe(
      await me.meUpdate(memberCtxOf(actor), memberActorOf(actor), customerId, { ...(input.fields ? { fields: input.fields } : {}) }),
    );
  },
});

const meCard = defineMemberOp({
  id: "me.card",
  method: "GET",
  path: "/me/card",
  kind: "read",
  action: "member.customer.read",
  summary:
    "The signed-in customer's membership card: member code, tier and a short lived QR token staff can scan at the counter. Needs a customer session; a shop API key gets 401 customer_session_required.",
  label: "บัตรสมาชิกของฉัน",
  test: "M2.10-S3.1",
  async handler({ actor }) {
    const customerId = selfId(actor);
    return jsonSafe(await me.meCard(memberCtxOf(actor), memberActorOf(actor), customerId));
  },
});

const meWallet = defineMemberOp({
  id: "me.wallet",
  method: "GET",
  path: "/me/wallet",
  kind: "read",
  action: "member.customer.read",
  summary:
    "Everything the signed-in customer can spend: points and what expires soon, vouchers, coupons, gift cards (numbers masked, never a PIN), rewards waiting to be collected, stamp cards and their tier benefits.",
  label: "กระเป๋าสิทธิ์ของฉัน",
  test: "M2.10-S3.2",
  async handler({ actor }) {
    const customerId = selfId(actor);
    return jsonSafe(await getWallet(memberCtxOf(actor), memberActorOf(actor), customerId));
  },
});

const meVouchers = defineMemberOp({
  id: "me.vouchers",
  method: "GET",
  path: "/me/vouchers",
  kind: "read",
  action: "member.customer.read",
  summary: "The vouchers the signed-in customer is holding, newest first.",
  label: "voucher ของฉัน",
  input: z.object({ status: z.enum(["ACTIVE", "USED", "EXPIRED", "CANCELLED"]).optional() }).strict(),
  test: "M2.10-S3.2",
  async handler({ actor, input }) {
    const customerId = selfId(actor);
    const items = await voucher.listForCustomer(memberScopedCtx(memberCtxOf(actor)), customerId, {
      ...(input.status ? { status: input.status } : {}),
    });
    return jsonSafe({ items, total: items.length });
  },
});

const meStamps = defineMemberOp({
  id: "me.stamps",
  method: "GET",
  path: "/me/stamps",
  kind: "read",
  action: "member.customer.read",
  summary: "How far the signed-in customer is on every stamp card they can collect.",
  label: "ตราสะสมของฉัน",
  test: "M2.10-S3.2",
  async handler({ actor }) {
    const customerId = selfId(actor);
    const items = await stamp.progressFor(memberScopedCtx(memberCtxOf(actor)), customerId);
    return jsonSafe({ items, total: items.length });
  },
});

const meGiftCards = defineMemberOp({
  id: "me.giftcards",
  method: "GET",
  path: "/me/giftcards",
  kind: "read",
  action: "member.customer.read",
  summary:
    "Gift cards the signed-in customer owns, with the number masked and no PIN. A customer who lost their PIN has to ask the shop for a new card; nothing can read the old one back.",
  label: "บัตรกำนัลของฉัน",
  test: "M2.10-S3.2",
  async handler({ actor }) {
    const customerId = selfId(actor);
    const b = await loyaltyCtx(actor);
    const items = await giftcard.listForCustomer(giftCardCtx(b), customerId);
    return jsonSafe({ items, total: items.length });
  },
});

const meRedeem = defineMemberOp({
  id: "me.redeem",
  method: "POST",
  path: "/me/rewards/redeem",
  kind: "write",
  action: "member.loyalty.read",
  summary:
    "The signed-in customer spends their own points or stamps on a reward. The answer carries the QR code they show at the counter when they come to collect.",
  label: "แลกของรางวัลด้วยตัวเอง",
  input: z.object({ rewardId: z.string().trim().min(1).max(40) }).strict(),
  test: "M2.10-S3.2",
  async handler({ actor, input, idempotencyKey }) {
    const customerId = selfId(actor);
    const b = await loyaltyCtx(actor);
    return jsonSafe(
      await reward.redeemV2(rewardCtx(b), memberActorOf(actor), {
        rewardId: input.rewardId,
        customerId,
        idempotencyKey: `api.me.redeem:${idempotencyKey ?? `${customerId}:${input.rewardId}:${Date.now()}`}`,
      }),
    );
  },
});

const meTransfer = defineMemberOp({
  id: "me.transfer",
  method: "POST",
  path: "/me/points/transfer",
  kind: "write",
  action: "member.point.transfer",
  summary:
    "The signed-in customer sends some of their points to another member of the same shop. It needs the one time code they asked for on the membership card page; staff can never do this on a customer's behalf.",
  label: "โอนแต้มของฉัน",
  input: z
    .object({
      toCustomerId: z.string().trim().min(1).max(40),
      points: z.coerce.number().int().min(1),
      otp: z.string().trim().min(4).max(10),
    })
    .strict(),
  test: "M2.10-S1.1",
  async handler({ actor, input, idempotencyKey }) {
    const customerId = selfId(actor);
    const b = await loyaltyCtx(actor);
    return jsonSafe(
      await point.transferPoints(pointCtx(b), memberActorOf(actor), {
        fromCustomerId: customerId,
        toCustomerId: input.toCustomerId,
        points: input.points,
        otp: input.otp,
        idempotencyKey: `api.me.transfer:${idempotencyKey ?? `${customerId}:${Date.now()}`}`,
      }),
    );
  },
});

export const ME_OPS: ApiOp[] = [meGet, meUpdate, meCard, meWallet, meVouchers, meStamps, meGiftCards, meRedeem, meTransfer];
