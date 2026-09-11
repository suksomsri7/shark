// ops/referrals.ts — op ของ "แนะนำเพื่อน" (MEMBER-API §2.17 · M3.10 · บริการ M3.5 `member/referrals.ts`)
//
// 🔴 สิทธิ์: อ่าน = `member.promo.read` · ตั้งโปรแกรม/ปฏิเสธ = `member.referral.manage`
// 🔴 โค้ด/ลิงก์ของสมาชิกแต่ละคนอยู่ที่ `GET /me/referral` (ของลูกค้าเอง) และในโปรไฟล์ (`/members/{id}`)
//    ลิงก์ของโปรแกรมนี้คือ `/ref/<code>` (ไม่ใช่ `/r/` — ตัวนั้นเป็นหน้าใบเสร็จของบัญชี)

import { z } from "zod";
import * as referrals from "../../referrals";
import type { SetReferralProgramInput } from "../../referrals-shared";
import { memberActorOf, memberCtxOf } from "../actor";
import { defineMemberOp, type ApiOp } from "../op";
import { jsonSafe } from "../serialize";

const TEST = "M3.10-S3.5";

const rewardValueSchema = z
  .union([
    z.object({ points: z.coerce.number().int().min(1).max(1_000_000) }).strict(),
    z
      .object({
        kind: z.enum(["FIXED", "PERCENT"]),
        value: z.coerce.number().min(1).max(1_000_000).describe("FIXED = baht (not satang) · PERCENT = 1-100."),
        validDays: z.coerce.number().int().min(1).max(3650),
      })
      .strict(),
  ])
  .describe("POINTS reward: { points } · VOUCHER reward: { kind, value, validDays }.");

/** ช่องที่แก้ได้ของโปรแกรมแนะนำเพื่อน — ใช้ทั้ง `PUT /referrals/program` และ `PUT /settings { referral }` */
export const referralProgramInput = z
  .object({
    enabled: z.boolean().optional(),
    referrerRewardKind: z.enum(["POINTS", "VOUCHER"]).optional(),
    referrerRewardValue: rewardValueSchema.optional(),
    refereeRewardKind: z.enum(["POINTS", "VOUCHER"]).optional(),
    refereeRewardValue: rewardValueSchema.optional(),
    convertOn: z.enum(["SIGNUP", "FIRST_PURCHASE"]).optional(),
    minFirstPurchaseSatang: z.coerce.number().int().min(0).nullish(),
    monthlyCap: z.coerce.number().int().min(1).max(10_000).nullish().describe("Most rewarded referrals per referrer per Thai month. Null = no cap."),
    fraudPhoneDevice: z.boolean().optional(),
    shareText: z.string().max(500).optional().describe("Variables: {ร้าน} {รางวัลเพื่อน} {link}."),
  })
  .strict();

const daysQuery = z
  .object({ days: z.coerce.number().int().min(1).max(3650).optional().describe("Window in days. Omit for all time.") })
  .strict();

const programGet = defineMemberOp({
  id: "referrals.program.get",
  method: "GET",
  path: "/referrals/program",
  kind: "read",
  action: "member.promo.read",
  summary: "The referral programme: on or off, what the referrer and the new friend get, whether it converts on signup or on the first purchase (with its minimum), the monthly cap, the fraud check and the share text. `saved: false` means the defaults are showing.",
  label: "โปรแกรมแนะนำเพื่อน",
  test: TEST,
  async handler({ actor }) {
    return jsonSafe(await referrals.getProgram(memberCtxOf(actor)));
  },
});

const programSet = defineMemberOp({
  id: "referrals.program.set",
  method: "PUT",
  path: "/referrals/program",
  kind: "write",
  action: "member.referral.manage",
  summary: "Change the referral programme. Send only what you want to move. Referrals already made keep the rules they were made under.",
  label: "ตั้งค่าโปรแกรมแนะนำเพื่อน",
  input: referralProgramInput,
  test: TEST,
  async handler({ actor, input }) {
    const patch: SetReferralProgramInput = input;
    return jsonSafe(await referrals.setProgram(memberCtxOf(actor), memberActorOf(actor), patch));
  },
});

const list = defineMemberOp({
  id: "referrals.list",
  method: "GET",
  path: "/referrals",
  kind: "read",
  action: "member.promo.read",
  summary: "Referrals newest first: referrer, friend, status (PENDING, CONVERTED, REWARDED, REJECTED), first purchase and the rewards paid. Page with `cursor`.",
  label: "รายการแนะนำเพื่อน",
  input: z
    .object({
      status: z.enum(["PENDING", "CONVERTED", "REWARDED", "REJECTED"]).optional(),
      referrerCustomerId: z.string().trim().max(40).optional(),
      take: z.coerce.number().int().min(1).max(100).optional(),
      cursor: z.string().trim().max(40).optional(),
    })
    .strict(),
  test: TEST,
  async handler({ actor, input }) {
    return jsonSafe(
      await referrals.listReferrals(memberCtxOf(actor), memberActorOf(actor), {
        status: input.status ?? null,
        referrerCustomerId: input.referrerCustomerId,
        take: input.take ?? null,
        cursor: input.cursor ?? null,
      }),
    );
  },
});

const leaderboard = defineMemberOp({
  id: "referrals.leaderboard",
  method: "GET",
  path: "/referrals/leaderboard",
  kind: "read",
  action: "member.promo.read",
  rate: "report",
  summary: "Top referrers over a window: friends referred, friends converted, points and vouchers they earned from it.",
  label: "อันดับผู้แนะนำ",
  input: z
    .object({
      days: z.coerce.number().int().min(1).max(3650).optional(),
      take: z.coerce.number().int().min(1).max(100).optional(),
    })
    .strict(),
  tool: { name: "referral_leaderboard", hint: "Use to name the members who bring the most friends." },
  test: TEST,
  async handler({ actor, input }) {
    const items = await referrals.leaderboard(memberCtxOf(actor), memberActorOf(actor), { days: input.days ?? null, take: input.take ?? null });
    return jsonSafe({ items, total: items.length });
  },
});

const stats = defineMemberOp({
  id: "referrals.stats",
  method: "GET",
  path: "/referrals/stats",
  kind: "read",
  action: "member.promo.read",
  rate: "report",
  summary: "Programme results: members who joined through a referral, conversion share, reward cost per new member in satang, and their first 90 day spend compared with the average member.",
  label: "ผลของโปรแกรมแนะนำเพื่อน",
  input: daysQuery,
  tool: { name: "referral_stats", hint: "Use to judge whether the referral programme pays off." },
  test: TEST,
  async handler({ actor, input }) {
    return jsonSafe(await referrals.stats(memberCtxOf(actor), memberActorOf(actor), { days: input.days ?? null }));
  },
});

const reject = defineMemberOp({
  id: "referrals.reject",
  method: "POST",
  path: "/referrals/{id}/reject",
  kind: "write",
  action: "member.referral.manage",
  summary: "Reject a referral that is still pending (for example a self referral the fraud check missed). No rewards will be paid for it.",
  label: "ปฏิเสธการแนะนำ",
  input: z.object({ reason: z.string().trim().max(200).nullish() }).strict(),
  test: TEST,
  async handler({ actor, params, input }) {
    return jsonSafe(await referrals.reject(memberCtxOf(actor), memberActorOf(actor), params.id ?? "", { reason: input.reason ?? null }));
  },
});

export const REFERRALS_OPS: ApiOp[] = [programGet, programSet, list, leaderboard, stats, reject];
