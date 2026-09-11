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
import { HISTORY_KIND_KEYS, type HistoryKindKey } from "../../history-kinds";
import { listHistory } from "../../history";
import { registerPushDevice, removePushDevice, PUSH_PLATFORMS } from "../../push-devices";
import { codeFor, getProgram, referralCounts } from "../../referrals";
import { reviewTokenOwner, submitReview } from "../../reviews";
import { as400 } from "../http-errors";

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

// ───────────────────────── M3.10 — ชุดสาม ─────────────────────────
// รีวิวจากลิงก์ · โค้ดแนะนำเพื่อนของฉัน · ประวัติของฉัน · เครื่องรับแจ้งเตือนในแอป

const TEST_ME3 = "M3.10-S3.11";

const meReviewSubmit = defineMemberOp({
  id: "me.reviews.submit",
  method: "POST",
  path: "/me/reviews",
  kind: "write",
  action: "member.customer.update",
  summary:
    "The signed-in customer sends the review the shop asked for, using the token from their review link (1-5 stars, optional text and photos). A link belongs to one member and works once; a link of somebody else answers 404. Points for reviewing are added when the shop set them.",
  label: "ส่งรีวิวของฉัน",
  input: z
    .object({
      token: z.string().trim().min(10).max(200).describe("Token from the review link the shop sent (/m/<shop>/review/<token>)."),
      rating: z.coerce.number().int().min(1).max(5),
      body: z.string().max(2000).nullish(),
      photoFileIds: z.array(z.string().trim().min(1).max(64)).max(5).optional(),
    })
    .strict(),
  test: TEST_ME3,
  async handler({ actor, input }) {
    const customerId = selfId(actor);
    const owner = await reviewTokenOwner(input.token);
    if (!owner || owner.customerId !== customerId || owner.tenantId !== actor.tenantId) {
      throw new ApiError(404, "not_found", "ไม่พบลิงก์รีวิวนี้ในบัญชีของคุณ — ลิงก์อาจถูกใช้ไปแล้ว หรือเป็นของสมาชิกคนอื่น", "No open review request with this token belongs to this customer.");
    }
    return jsonSafe(
      await as400(() => submitReview({ token: input.token, rating: input.rating, body: input.body ?? null, photoFileIds: input.photoFileIds })),
    );
  },
});

const meReferral = defineMemberOp({
  id: "me.referral",
  method: "GET",
  path: "/me/referral",
  kind: "read",
  action: "member.customer.read",
  summary:
    "The signed-in customer's own referral code, share link (/ref/<code>), ready-made share text, how many friends they referred and how many converted, and whether the shop's programme is on.",
  label: "โค้ดแนะนำเพื่อนของฉัน",
  test: TEST_ME3,
  async handler({ actor }) {
    const customerId = selfId(actor);
    const ctx = memberCtxOf(actor);
    const [code, counts, program] = await Promise.all([codeFor(ctx, customerId), referralCounts(actor.tenantId, customerId), getProgram(ctx)]);
    return jsonSafe({ ...code, referred: counts.referred, converted: counts.converted, programEnabled: program.enabled });
  },
});

/** ชนิดประวัติที่ลูกค้าเห็นของตัวเองได้ — แชท/เอกสารภายใน/งานของพนักงาน/บันทึกโปรไฟล์หลังร้าน เป็นเรื่องของร้าน */
const CUSTOMER_HISTORY_KINDS: readonly HistoryKindKey[] = ["purchase", "booking", "tier", "loyalty", "review"];

const meHistory = defineMemberOp({
  id: "me.history",
  method: "GET",
  path: "/me/history",
  kind: "read",
  action: "member.customer.read",
  summary:
    "The signed-in customer's own timeline, newest first: purchases, bookings, tier changes, points and rewards, reviews and referrals. Staff-only entries (chat, internal documents, tasks, profile notes) and staff names are left out. Page with `cursor`.",
  label: "ประวัติของฉัน",
  input: z
    .object({
      kind: z.enum(HISTORY_KIND_KEYS).optional().describe("One of purchase, booking, tier, loyalty, review."),
      take: z.coerce.number().int().min(1).max(50).optional().describe("Rows, 1-50 (default 20)."),
      cursor: z.string().trim().max(200).optional(),
    })
    .strict(),
  test: TEST_ME3,
  async handler({ actor, input }) {
    const customerId = selfId(actor);
    const kind = input.kind && CUSTOMER_HISTORY_KINDS.includes(input.kind) ? input.kind : null;
    if (input.kind && !kind) return jsonSafe({ items: [], nextCursor: null });
    const res = await listHistory(memberCtxOf(actor), memberActorOf(actor), customerId, {
      kind: kind ?? "all",
      take: input.take ?? 20,
      cursor: input.cursor ?? null,
    });
    const items = res.items
      .filter((h) => CUSTOMER_HISTORY_KINDS.includes(h.kind))
      .map((h) => ({ id: h.id, at: h.at, kind: h.kind, title: h.title, summary: h.summary, badge: h.badge, unit: h.unit ? { name: h.unit.name } : null }));
    return jsonSafe({ items, nextCursor: res.nextCursor });
  },
});

const mePushRegister = defineMemberOp({
  id: "me.pushDevices.register",
  method: "POST",
  path: "/me/push-devices",
  kind: "write",
  action: "member.customer.update",
  summary:
    "Register this phone for in-app notifications of the signed-in customer (Expo push token). Calling again with the same token refreshes it; a phone that changes hands moves to the new customer.",
  label: "ลงทะเบียนเครื่องรับแจ้งเตือน",
  input: z
    .object({
      expoToken: z.string().trim().min(10).max(250).describe("ExponentPushToken[...] from the Expo notifications API."),
      platform: z.enum(PUSH_PLATFORMS).optional().describe("ios (default), android or web."),
    })
    .strict(),
  test: TEST_ME3,
  async handler({ actor, input }) {
    selfId(actor);
    return jsonSafe(await as400(() => registerPushDevice(memberCtxOf(actor), memberActorOf(actor), { expoToken: input.expoToken, platform: input.platform ?? null })));
  },
});

const mePushRemove = defineMemberOp({
  id: "me.pushDevices.remove",
  method: "DELETE",
  path: "/me/push-devices/{id}",
  kind: "write",
  action: "member.customer.update",
  summary: "Stop notifications on one of the signed-in customer's phones (for example on sign out). A device of somebody else answers 404.",
  label: "เลิกรับแจ้งเตือนบนเครื่องนี้",
  test: TEST_ME3,
  async handler({ actor, params }) {
    selfId(actor);
    return jsonSafe(await removePushDevice(memberCtxOf(actor), memberActorOf(actor), params.id ?? ""));
  },
});

export const ME_OPS: ApiOp[] = [
  meGet,
  meUpdate,
  meCard,
  meWallet,
  meVouchers,
  meStamps,
  meGiftCards,
  meRedeem,
  meTransfer,
  meReviewSubmit,
  meReferral,
  meHistory,
  mePushRegister,
  mePushRemove,
];
