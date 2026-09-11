// ops/campaigns.ts — op ของ "แคมเปญ" (MEMBER-API §2.14 · M3.10 · บริการ M3.2 ของโมดูล marketing)
//
// 🔴 ตัวจริงอยู่โมดูล marketing — op ที่นี่เรียกผ่าน "ช่องเสียบ" `campaign-port.ts` เท่านั้น
//    (ห้าม import `@/lib/modules/marketing` ตรง: fitness F2 อนุญาตทิศเดียว marketing→member · ดูหัวไฟล์ campaign-port)
// 🔴 อ่าน/พรีวิว/สถิติ = `member.promo.read` · สร้าง/แก้/ส่ง/ยกเลิก/ทดสอบ = `member.promo.manage`
// 🔴 แคมเปญเกิดเป็น **ร่าง** เสมอ (หรือ "ตั้งเวลา" ถ้าส่ง `scheduledAt`) — ไม่มีใครได้ข้อความจนกว่าจะเรียก send
//    ⇒ ผู้ช่วย AI "ร่างแคมเปญ" ได้ด้วยการเสนอ `campaign_draft_message` (คนกดยืนยันแล้วได้แค่ร่าง ไม่ใช่ส่ง)

import { z } from "zod";
import type { ApiActor } from "@/lib/api/actor";
import { memberActorOf } from "../actor";
import { campaignPort, type CampaignPortCtx } from "../campaign-port";
import { defineMemberOp, type ApiOp } from "../op";
import { jsonSafe } from "../serialize";

const TEST = "M3.10-S3.2";

function portCtx(actor: ApiActor): CampaignPortCtx {
  return { tenantId: actor.tenantId, memberSystemId: actor.systemId, actorUserId: actor.userId ?? null };
}

const CHANNELS = ["LINE", "EMAIL", "SMS", "PUSH"] as const;

const contentSchema = z
  .object({
    line: z.string().max(2000).optional().describe("LINE message. Variables: {ชื่อ} {ระดับ} {voucher} {รหัสสมาชิก}."),
    email: z.object({ subject: z.string().max(200), body: z.string().max(20_000) }).strict().optional(),
    sms: z.string().max(500).optional(),
    push: z.object({ title: z.string().max(100), body: z.string().max(500) }).strict().optional(),
  })
  .strict()
  .describe("Message per channel. Every channel listed in `channels` needs its text here.");

const fields = {
  name: z.string().trim().min(1).max(120).describe("Campaign name as the owner will read it in the report."),
  segmentId: z.string().trim().max(40).nullish().describe("A saved segment (GET /segments). The audience is frozen into the campaign when it is created."),
  definition: z.unknown().optional().describe("An ad-hoc segment definition instead of `segmentId` (same shape as POST /segments/count). Omit both to target every member of the system."),
  channels: z.array(z.enum(CHANNELS)).min(1).max(4).describe("Channels in order of preference; each member gets the first channel they can receive and consented to."),
  content: contentSchema,
  variantB: contentSchema.nullish().describe("Optional A/B variant. Members are split deterministically."),
  holdoutPct: z.coerce.number().int().min(0).max(50).optional().describe("Share of the audience kept as a control group that receives nothing (0-50, default 0)."),
  attachVoucherTemplateId: z.string().trim().max(40).nullish().describe("Voucher template issued to each recipient (GET /vouchers/templates)."),
  couponCode: z.string().trim().max(40).nullish(),
  scheduledAt: z.string().datetime().nullish().describe("ISO time to send automatically. Leave out to keep it as a draft until POST /campaigns/{id}/send."),
};

const list = defineMemberOp({
  id: "campaigns.list",
  method: "GET",
  path: "/campaigns",
  kind: "read",
  action: "member.promo.read",
  summary: "Campaigns of this member system with their results per row: audience, sent, opened, used, sales, cost and ROI.",
  label: "แคมเปญทั้งหมด",
  tool: { name: "campaign_list", hint: "Use to answer how past campaigns performed." },
  test: TEST,
  async handler({ actor }) {
    const port = await campaignPort();
    const items = (await port.list(portCtx(actor), memberActorOf(actor))) as unknown[];
    return jsonSafe({ items, total: items.length });
  },
});

const get = defineMemberOp({
  id: "campaigns.get",
  method: "GET",
  path: "/campaigns/{id}",
  kind: "read",
  action: "member.promo.read",
  summary: "One campaign: status, target segment, channels, message content, variant B, holdout, attached voucher and schedule.",
  label: "ดูแคมเปญ",
  test: TEST,
  async handler({ actor, params }) {
    const port = await campaignPort();
    return jsonSafe(await port.get(portCtx(actor), memberActorOf(actor), params.id ?? ""));
  },
});

const create = defineMemberOp({
  id: "campaigns.create",
  method: "POST",
  path: "/campaigns",
  kind: "write",
  action: "member.promo.manage",
  summary: "Create a campaign as a draft (or scheduled, with `scheduledAt`). Nobody receives anything until POST /campaigns/{id}/send or the scheduled time. Monthly campaign limits of the shop's plan apply.",
  label: "สร้างแคมเปญ (ร่าง)",
  input: z.object(fields).strict(),
  tool: {
    name: "campaign_draft_message",
    hint: "Draft a campaign with its message for the owner to review. It is created as a draft only; sending is a separate step. Write the message in Thai and use {ชื่อ} for the member name.",
  },
  test: TEST,
  async handler({ actor, input }) {
    const port = await campaignPort();
    return jsonSafe(await port.create(portCtx(actor), memberActorOf(actor), input));
  },
});

const update = defineMemberOp({
  id: "campaigns.update",
  method: "PATCH",
  path: "/campaigns/{id}",
  kind: "write",
  action: "member.promo.manage",
  summary: "Change a draft or scheduled campaign. Fields you leave out keep their value. A sent or cancelled campaign cannot change.",
  label: "แก้แคมเปญ",
  input: z
    .object({
      name: fields.name.optional(),
      segmentId: fields.segmentId,
      definition: fields.definition,
      channels: fields.channels.optional(),
      content: contentSchema.optional(),
      variantB: fields.variantB,
      holdoutPct: fields.holdoutPct,
      attachVoucherTemplateId: fields.attachVoucherTemplateId,
      couponCode: fields.couponCode,
      scheduledAt: fields.scheduledAt,
    })
    .strict(),
  test: TEST,
  async handler({ actor, params, input }) {
    const port = await campaignPort();
    return jsonSafe(await port.update(portCtx(actor), memberActorOf(actor), params.id ?? "", input));
  },
});

const preview = defineMemberOp({
  id: "campaigns.preview",
  method: "POST",
  path: "/campaigns/{id}/preview",
  kind: "read",
  action: "member.promo.read",
  summary: "What would happen if the campaign were sent now: audience, how many would actually receive it, holdout, split by channel, maximum cost in satang, expected use rate and today's remaining message quota. Changes nothing.",
  label: "พรีวิวแคมเปญ",
  test: TEST,
  async handler({ actor, params }) {
    const port = await campaignPort();
    return jsonSafe(await port.preview(portCtx(actor), memberActorOf(actor), params.id ?? ""));
  },
});

const testSend = defineMemberOp({
  id: "campaigns.testSend",
  method: "POST",
  path: "/campaigns/{id}/test",
  kind: "write",
  action: "member.promo.manage",
  summary: "Render the campaign message with sample values and email it to the person behind the API key (never to a member). Answers the rendered preview even when no email could be sent.",
  label: "ทดสอบส่งแคมเปญ",
  input: z.object({ channel: z.enum(CHANNELS).optional().describe("Which channel's text to render. Default: email if the campaign has one, else its first channel.") }).strict(),
  test: TEST,
  async handler({ actor, params, input }) {
    const port = await campaignPort();
    return jsonSafe(await port.testSend(portCtx(actor), memberActorOf(actor), params.id ?? "", { channel: input.channel ?? null }));
  },
});

const send = defineMemberOp({
  id: "campaigns.send",
  method: "POST",
  path: "/campaigns/{id}/send",
  kind: "write",
  action: "member.promo.manage",
  summary: "Send the campaign now (or hand it to the scheduler when `scheduledAt` is in the future). Consent is checked per member and channel at the moment of sending; members already handled are never sent twice.",
  label: "ส่งแคมเปญ",
  test: TEST,
  async handler({ actor, params }) {
    const port = await campaignPort();
    return jsonSafe(await port.send(portCtx(actor), memberActorOf(actor), params.id ?? ""));
  },
});

const cancel = defineMemberOp({
  id: "campaigns.cancel",
  method: "POST",
  path: "/campaigns/{id}/cancel",
  kind: "write",
  action: "member.promo.manage",
  summary: "Stop a campaign: queued messages that were not sent yet are dropped. Messages already delivered cannot be recalled.",
  label: "ยกเลิกแคมเปญ",
  test: TEST,
  async handler({ actor, params }) {
    const port = await campaignPort();
    return jsonSafe(await port.cancel(portCtx(actor), memberActorOf(actor), params.id ?? ""));
  },
});

const stats = defineMemberOp({
  id: "campaigns.stats",
  method: "GET",
  path: "/campaigns/{id}/stats",
  kind: "read",
  action: "member.promo.read",
  summary: "Results per variant and for the holdout group (sent, opened, used, sales, cost, ROI) plus the uplift over the holdout. Recomputed from the recipients on every call.",
  label: "ผลของแคมเปญ",
  tool: { name: "campaign_stats", hint: "Use to report how one campaign did against its holdout group." },
  test: TEST,
  async handler({ actor, params }) {
    const port = await campaignPort();
    return jsonSafe(await port.stats(portCtx(actor), memberActorOf(actor), params.id ?? ""));
  },
});

export const CAMPAIGNS_OPS: ApiOp[] = [list, get, create, update, preview, testSend, send, cancel, stats];
