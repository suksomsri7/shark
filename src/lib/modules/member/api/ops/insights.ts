// ops/insights.ts — สรุปสมาชิก 1 คน · ข้อเสนอที่ควรให้ · ไทม์ไลน์ประวัติ (M3.10 · เครื่องมือหลักของผู้ช่วย AI ภาพ 27)
//
// ผู้ใช้หลักคือผู้ช่วย AI: `member_summary` ตอบ "ลูกค้าคนนี้เป็นใคร/มาบ่อยไหม/ถืออะไรอยู่"
// `member_recommend_offer` ตอบ "ควรเสนออะไรตอนนี้" · `member_history` ตอบ "ที่ผ่านมาเขาทำอะไรกับร้านบ้าง"
// 🔴 ทุกตัวอ่านอย่างเดียว · คำแนะนำคิดจากกติกาในบริการ (`member/insights.ts`) ไม่ใช่โมเดล — ไม่มีตัวเลขที่แต่งขึ้น
// 🔴 ไม่มีข้อมูลติดต่อ/อ่อนไหว · มองไม่เห็นสมาชิก = 404

import { z } from "zod";
import { HISTORY_KIND_KEYS } from "../../history-kinds";
import { listHistory } from "../../history";
import { memberSummary, recommendOffer } from "../../insights";
import { memberActorOf, memberCtxOf } from "../actor";
import { defineMemberOp, type ApiOp } from "../op";
import { jsonSafe } from "../serialize";

const summary = defineMemberOp({
  id: "members.summary",
  method: "GET",
  path: "/members/{id}/summary",
  kind: "read",
  action: "member.customer.read",
  summary:
    "A compact picture of one member for an assistant or a counter screen: card (masked phone), member since, days since the last visit, 12 month spend and visits, tier with progress to the next one, what the wallet holds (points, expiring points, vouchers, stamp cards, rewards to collect, gift cards) and the last 5 timeline entries. No contact details, no sensitive fields.",
  label: "สรุปสมาชิก",
  tool: { name: "member_summary", hint: "Call this first when the owner asks about one customer." },
  test: "M3.10-S2.1",
  async handler({ actor, params }) {
    return jsonSafe(await memberSummary(memberCtxOf(actor), memberActorOf(actor), params.id ?? ""));
  },
});

const recommend = defineMemberOp({
  id: "members.recommendOffer",
  method: "GET",
  path: "/members/{id}/recommend-offer",
  kind: "read",
  action: "member.customer.read",
  summary:
    "What to offer this member right now, most urgent first, each with the reason taken from real data: rewards waiting, points or vouchers about to expire, birthday within 14 days, close to the next tier, a stamp card almost full, or not seen for 60 days. An empty list means nothing stands out.",
  label: "ข้อเสนอที่เหมาะกับสมาชิกคนนี้",
  tool: {
    name: "member_recommend_offer",
    hint: "Use before proposing a voucher or a message to one member; pass the reason on to the owner, never invent one.",
  },
  test: "M3.10-S2.1",
  async handler({ actor, params }) {
    return jsonSafe(await recommendOffer(memberCtxOf(actor), memberActorOf(actor), params.id ?? ""));
  },
});

const history = defineMemberOp({
  id: "members.history",
  method: "GET",
  path: "/members/{id}/history",
  kind: "read",
  action: "member.customer.read",
  summary:
    "The member's 360 timeline, newest first: purchases, bookings, chats, documents, tier changes, points and rewards, tasks, reviews and profile changes, with counts per kind. Filter by `kind`, date range or branch; page with `cursor`.",
  label: "ประวัติของสมาชิก",
  input: z
    .object({
      kind: z.enum(["all", ...HISTORY_KIND_KEYS]).optional(),
      from: z.string().trim().max(40).optional().describe("ISO date or time."),
      to: z.string().trim().max(40).optional(),
      unitId: z.string().trim().max(40).optional(),
      take: z.coerce.number().int().min(1).max(100).optional().describe("Rows, 1-100 (default 30)."),
      cursor: z.string().trim().max(200).optional(),
    })
    .strict(),
  tool: { name: "member_history", hint: "Use for questions about what a customer bought or did before." },
  test: "M3.10-S2.1",
  async handler({ actor, params, input }) {
    const res = await listHistory(memberCtxOf(actor), memberActorOf(actor), params.id ?? "", {
      kind: input.kind ?? "all",
      from: input.from ?? null,
      to: input.to ?? null,
      unitId: input.unitId ?? null,
      take: input.take ?? null,
      cursor: input.cursor ?? null,
    });
    return jsonSafe(res);
  },
});

export const INSIGHTS_OPS: ApiOp[] = [summary, recommend, history];
