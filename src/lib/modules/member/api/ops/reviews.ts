// ops/reviews.ts — op ของ "รีวิวลูกค้า" (MEMBER-API §2.16 · M3.10 · บริการ M3.4 `member/reviews.ts`)
//
// 🔴 สิทธิ์: อ่าน = `member.review.read` · ขอรีวิว/ตอบ/ซ่อน/ส่งต่อ = `member.review.reply` · ตั้งค่า = `member.settings.manage`
// 🔴 ใบที่ลูกค้ายังไม่ส่ง (REQUESTED) ไม่อยู่ในรายการ/ไม่เปิดดูได้ — มีแต่ลิงก์ของลูกค้าที่เปิดได้
// 🔴 ส่งต่อ (escalate) ตรวจการมองเห็นก่อนเสมอ: บริการ `escalate` เป็นทางของงานเบื้องหลัง (ไม่มี actor)
//    ⇒ ถ้าไม่ตรวจที่นี่ พนักงานสาขาหนึ่งที่กดยืนยันข้อเสนอของผู้ช่วยจะส่งต่อรีวิวของอีกสาขาได้

import { z } from "zod";
import * as reviews from "../../reviews";
import { REVIEW_ASSIGNEE_ROLES, type ReviewSettings } from "../../reviews-shared";
import { memberActorOf, memberCtxOf } from "../actor";
import { defineMemberOp, type ApiOp } from "../op";
import { jsonSafe } from "../serialize";

const TEST = "M3.10-S3.4";

/** ช่องที่แก้ได้ของการตั้งค่ารีวิว — ใช้ทั้ง `PUT /reviews/settings` และ `PUT /settings { review }` */
export const reviewSettingsInput = z
  .object({
    askAfterHours: z.coerce.number().int().min(0).max(720).optional(),
    rewardPoints: z.coerce.number().int().min(0).max(100_000).optional().describe("Points given when a customer sends a review (0 = none)."),
    escalateBelow: z.coerce.number().int().min(1).max(5).optional().describe("Ratings at or below this open a task card."),
    escalateBoardId: z.string().trim().max(40).nullish(),
    escalateAssigneeRole: z.enum(REVIEW_ASSIGNEE_ROLES).optional(),
    replyTemplate: z.string().max(2000).optional(),
    googleReviewUrl: z.string().url().max(500).nullish(),
  })
  .strict();

const list = defineMemberOp({
  id: "reviews.list",
  method: "GET",
  path: "/reviews",
  kind: "read",
  action: "member.review.read",
  summary: "Reviews customers sent, newest first, with rating, text, photos, service, staff, branch, reply and escalation card. Filter by rating, unreplied, service, staff or branch; page with `cursor`.",
  label: "รีวิวลูกค้า",
  input: z
    .object({
      rating: z.coerce.number().int().min(1).max(5).optional(),
      unreplied: z.enum(["true", "false"]).optional().describe("true = only reviews without a reply."),
      serviceId: z.string().trim().max(40).optional(),
      staffEmployeeId: z.string().trim().max(40).optional(),
      unitId: z.string().trim().max(40).optional(),
      includeHidden: z.enum(["true", "false"]).optional(),
      take: z.coerce.number().int().min(1).max(100).optional(),
      cursor: z.string().trim().max(40).optional(),
    })
    .strict(),
  tool: { name: "review_list", hint: "Use to read what customers said, for example the unreplied or low rated ones." },
  test: TEST,
  async handler({ actor, input }) {
    const res = await reviews.listReviews(memberCtxOf(actor), memberActorOf(actor), {
      rating: input.rating,
      unreplied: input.unreplied === "true",
      serviceId: input.serviceId,
      staffEmployeeId: input.staffEmployeeId,
      unitId: input.unitId,
      includeHidden: input.includeHidden === "true",
      take: input.take,
      cursor: input.cursor ?? null,
    });
    return jsonSafe(res);
  },
});

const summary = defineMemberOp({
  id: "reviews.summary",
  method: "GET",
  path: "/reviews/summary",
  kind: "read",
  action: "member.review.read",
  rate: "report",
  summary: "Monthly summary of reviews in Thai: strengths, what customers mention most, and the trend (the trend is computed from real averages, never written by the model). Cached per Thai day.",
  label: "สรุปรีวิวประจำเดือน",
  input: z.object({ month: z.string().regex(/^\d{4}-\d{2}$/).optional().describe("Thai calendar month `YYYY-MM` (default: this month).") }).strict(),
  tool: { name: "review_summary", hint: "Use when the owner asks what customers think of the shop." },
  test: TEST,
  async handler({ actor, input }) {
    return jsonSafe(await reviews.summarize(memberCtxOf(actor), memberActorOf(actor), { month: input.month }));
  },
});

const stats = defineMemberOp({
  id: "reviews.stats",
  method: "GET",
  path: "/reviews/stats",
  kind: "read",
  action: "member.review.read",
  rate: "report",
  summary: "Review numbers over a window: average, count, replied share, low ratings and how many got a task card, distribution per star, this week's new reviews, unreplied count and the weekly trend.",
  label: "สถิติรีวิว",
  input: z.object({ days: z.coerce.number().int().min(1).max(365).optional().describe("Window in days (default 30).") }).strict(),
  tool: { name: "review_stats", hint: "Use for the shop's average rating and how many reviews still need a reply." },
  test: TEST,
  async handler({ actor, input }) {
    return jsonSafe(await reviews.reviewStats(memberCtxOf(actor), memberActorOf(actor), { days: input.days }));
  },
});

const settingsGet = defineMemberOp({
  id: "reviews.settings.get",
  method: "GET",
  path: "/reviews/settings",
  kind: "read",
  action: "member.review.read",
  summary: "Review settings: hours after the service to ask, channel, points given for a review, the rating at or below which a task card is opened, its board and assignee, and the reply template.",
  label: "ตั้งค่ารีวิว",
  test: TEST,
  async handler({ actor }) {
    return jsonSafe(await reviews.getReviewSettings(memberCtxOf(actor)));
  },
});

const settingsSet = defineMemberOp({
  id: "reviews.settings.set",
  method: "PUT",
  path: "/reviews/settings",
  kind: "write",
  action: "member.settings.manage",
  summary: "Change review settings. Send only what you want to move.",
  label: "บันทึกการตั้งค่ารีวิว",
  input: reviewSettingsInput,
  test: TEST,
  async handler({ actor, input }) {
    const patch: Partial<ReviewSettings> = input;
    return jsonSafe(await reviews.setReviewSettings(memberCtxOf(actor), memberActorOf(actor), patch));
  },
});

const get = defineMemberOp({
  id: "reviews.get",
  method: "GET",
  path: "/reviews/{id}",
  kind: "read",
  action: "member.review.read",
  summary: "One review with everything the inbox shows. A review the key cannot see, or one the customer has not sent yet, answers 404.",
  label: "ดูรีวิว",
  test: TEST,
  async handler({ actor, params }) {
    return jsonSafe(await reviews.getReview(memberCtxOf(actor), memberActorOf(actor), params.id ?? ""));
  },
});

const request = defineMemberOp({
  id: "reviews.request",
  method: "POST",
  path: "/members/{id}/reviews/request",
  kind: "write",
  action: "member.review.reply",
  summary: "Ask a member to review a bill or an appointment. Sends the review link over LINE when the member has LINE and consented; otherwise returns the link so staff can share it. Asking twice for the same bill returns the first request.",
  label: "ขอรีวิวจากสมาชิก",
  input: z
    .object({
      refType: z.enum(["PosSale", "Appointment"]).describe("What is being reviewed."),
      refId: z.string().trim().min(1).max(40).describe("Id of the bill or the appointment."),
      unitId: z.string().trim().max(40).nullish(),
      serviceId: z.string().trim().max(40).nullish(),
      staffEmployeeId: z.string().trim().max(40).nullish(),
    })
    .strict(),
  test: TEST,
  async handler({ actor, params, input }) {
    return jsonSafe(
      await reviews.requestReview(memberCtxOf(actor), {
        customerId: params.id ?? "",
        refType: input.refType,
        refId: input.refId,
        unitId: input.unitId ?? null,
        serviceId: input.serviceId ?? null,
        staffEmployeeId: input.staffEmployeeId ?? null,
      }),
    );
  },
});

const reply = defineMemberOp({
  id: "reviews.reply",
  method: "POST",
  path: "/reviews/{id}/reply",
  kind: "write",
  action: "member.review.reply",
  summary: "Reply to a review. The reply is sent to the customer over LINE when possible; sending the same text again changes nothing, a new text edits the reply.",
  label: "ตอบรีวิว",
  input: z.object({ body: z.string().trim().min(1).max(2000) }).strict(),
  tool: { name: "review_reply", hint: "Propose a polite Thai reply; the owner confirms before it is sent." },
  test: TEST,
  async handler({ actor, params, input }) {
    return jsonSafe(await reviews.reply(memberCtxOf(actor), memberActorOf(actor), params.id ?? "", { body: input.body }));
  },
});

const hide = defineMemberOp({
  id: "reviews.hide",
  method: "POST",
  path: "/reviews/{id}/hide",
  kind: "write",
  action: "member.review.reply",
  summary: "Hide a review (spam, abuse). It is never deleted, just left out of the averages and the inbox; the reason is kept.",
  label: "ซ่อนรีวิว",
  input: z.object({ reason: z.string().trim().min(1).max(200) }).strict(),
  test: TEST,
  async handler({ actor, params, input }) {
    return jsonSafe(await reviews.hide(memberCtxOf(actor), memberActorOf(actor), params.id ?? "", { reason: input.reason }));
  },
});

const escalate = defineMemberOp({
  id: "reviews.escalate",
  method: "POST",
  path: "/reviews/{id}/escalate",
  kind: "write",
  action: "member.review.reply",
  summary: "Hand a review to a manager now: opens (or returns) a task card on the configured board, assigns it and notifies. Calling again returns the same card.",
  label: "ส่งต่อรีวิวให้ผู้จัดการ",
  test: TEST,
  async handler({ actor, params }) {
    const ctx = memberCtxOf(actor);
    const row = await reviews.getReview(ctx, memberActorOf(actor), params.id ?? "");
    return jsonSafe(await reviews.escalate(ctx, row.id));
  },
});

export const REVIEWS_OPS: ApiOp[] = [list, summary, stats, settingsGet, settingsSet, get, request, reply, hide, escalate];
