// ops/sources.ts — op ของ "ช่องทางที่มา" (MEMBER-API §2.4 · M1.11)
//
// 🔴 รายงานที่มาใช้คีย์ `member.report.view` (ไม่ใช่ `member.customer.read`): มันตอบว่า
//    "ช่องทางไหนคุ้ม" ซึ่งเป็นข้อมูลเชิงธุรกิจของเจ้าของ ไม่ใช่ข้อมูลลูกค้ารายคน
//    — และเป็นคิวรีหนัก จึงอยู่ถังเพดานอัตราของรายงาน (`rate: "report"`)

import { z } from "zod";
import * as sources from "../../sources";
import { memberActorOf, memberCtxOf } from "../actor";
import { jsonSafe } from "../serialize";
import { defineMemberOp, type ApiOp } from "../op";

const requiredId = (v: string | undefined): string => (v ?? "").trim();

const SOURCES = [
  "WALK_IN", "POS", "BOOKING", "LINE_OA", "LIFF", "WEB_FORM", "CHAT",
  "REFERRAL", "IMPORT", "CRM", "CAMPAIGN", "API", "MARKETPLACE", "APP", "OTHER",
] as const;

const linksList = defineMemberOp({
  id: "sources.links.list",
  method: "GET",
  path: "/sources/links",
  kind: "read",
  action: "member.settings.manage",
  summary: "The shop's acquisition links and QR codes, newest first, with how many times each was opened and how many members it brought in.",
  label: "ลิงก์/QR ที่มา",
  test: "M1.11-S1.2",
  async handler({ actor }) {
    const items = await sources.listLinks(memberCtxOf(actor));
    return jsonSafe({ items, total: items.length });
  },
});

const linksCreate = defineMemberOp({
  id: "sources.links.create",
  method: "POST",
  path: "/sources/links",
  kind: "write",
  action: "member.settings.manage",
  summary:
    "Create a trackable link with its QR code: a poster at the shop, a Facebook ad, a partner page. Everybody who signs up through it is attributed to it, so the report can tell you what each channel really costs per member.",
  label: "สร้างลิงก์/QR ที่มา",
  input: z
    .object({
      name: z.string().trim().min(1).max(120).describe("What this link is, as it will read in the report."),
      source: z.enum(SOURCES).describe("Which channel family it belongs to."),
      target: z.enum(["LIFF_JOIN", "WEB_FORM", "CHAT"]).describe("Where a person who opens it lands."),
      code: z.string().trim().max(32).nullish().describe("Short code in the URL. Omitted means the system picks one."),
      campaignId: z.string().trim().max(40).nullish(),
      unitId: z.string().trim().max(40).nullish().describe("Business unit this link belongs to."),
      utm: z.record(z.string(), z.string()).nullish().describe("UTM parameters to carry through, for example { utm_source: 'facebook' }."),
      costSatang: z.coerce.number().int().min(0).nullish().describe("What this channel costs, in satang, so the report can show cost per signup."),
    })
    .strict(),
  test: "M1.11-S2.8",
  async handler({ actor, input }) {
    const res = await sources.createLink(memberCtxOf(actor), memberActorOf(actor), input);
    return jsonSafe(res);
  },
});

const linksUpdate = defineMemberOp({
  id: "sources.links.update",
  method: "PATCH",
  path: "/sources/links/{id}",
  kind: "write",
  action: "member.settings.manage",
  summary: "Change a link's name, channel, target, campaign or cost. The code in the URL never changes, so printed QR codes keep working.",
  label: "แก้ไขลิงก์ที่มา",
  input: z
    .object({
      name: z.string().trim().min(1).max(120).nullish(),
      source: z.enum(SOURCES).nullish(),
      target: z.enum(["LIFF_JOIN", "WEB_FORM", "CHAT"]).nullish(),
      campaignId: z.string().trim().max(40).nullish(),
      unitId: z.string().trim().max(40).nullish(),
      utm: z.record(z.string(), z.string()).nullish(),
      costSatang: z.coerce.number().int().min(0).nullish(),
    })
    .strict(),
  test: "M1.11-S1.2",
  async handler({ actor, params, input }) {
    const res = await sources.updateLink(memberCtxOf(actor), memberActorOf(actor), requiredId(params.id), input);
    return jsonSafe(res);
  },
});

const linksToggle = defineMemberOp({
  id: "sources.links.toggle",
  method: "PUT",
  path: "/sources/links/{id}/active",
  kind: "write",
  action: "member.settings.manage",
  summary: "Turn a link on or off. A link that is off stops accepting signups but keeps its history in the report.",
  label: "เปิด/ปิดลิงก์ที่มา",
  input: z.object({ active: z.boolean() }).strict(),
  test: "M1.11-S1.2",
  async handler({ actor, params, input }) {
    const res = await sources.toggleLink(memberCtxOf(actor), memberActorOf(actor), requiredId(params.id), input.active);
    return jsonSafe(res);
  },
});

const report = defineMemberOp({
  id: "sources.report",
  method: "GET",
  path: "/sources/report",
  kind: "read",
  action: "member.report.view",
  rate: "report",
  summary:
    "Where members come from: signups, first and last touch, how many of them bought, how many bought again, average spend and cost per signup - per channel and per link.",
  label: "รายงานช่องทางที่มา",
  tool: { name: "member_source_report", hint: "Use this to answer 'which channel brings us customers' or 'is the Facebook QR worth it'." },
  input: z
    .object({
      from: z.string().trim().max(40).optional().describe("Start of the window, ISO-8601. Default 90 days ago."),
      to: z.string().trim().max(40).optional().describe("End of the window, ISO-8601. Default now."),
      unit: z.string().trim().max(40).optional().describe("Only members whose first touch happened at this business unit."),
    })
    .strict(),
  test: "M1.11-S2.8",
  async handler({ actor, input }) {
    const now = new Date();
    const parse = (v: string | undefined, fallback: Date): Date => {
      if (!v) return fallback;
      const d = new Date(v);
      return Number.isNaN(d.getTime()) ? fallback : d;
    };
    const res = await sources.reportBySource(memberCtxOf(actor), memberActorOf(actor), {
      from: parse(input.from, new Date(now.getTime() - 90 * 86_400_000)),
      to: parse(input.to, now),
      unitId: input.unit ?? null,
    });
    return jsonSafe(res);
  },
});

const touch = defineMemberOp({
  id: "sources.touch",
  method: "POST",
  path: "/members/{id}/touch",
  kind: "write",
  action: "member.customer.update",
  summary:
    "Record that the shop reached this member through a channel again (a campaign click, a QR scan). The very first touch of a member is written once and never overwritten; the last touch is replaced every time.",
  label: "บันทึกการสัมผัสช่องทาง",
  input: z
    .object({
      source: z.enum(SOURCES),
      sourceChannel: z.string().trim().max(30).nullish().describe("Channel key from GET /channels, when the source is a channel."),
      linkId: z.string().trim().max(40).nullish(),
      campaignId: z.string().trim().max(40).nullish(),
      staffUserId: z.string().trim().max(40).nullish(),
      referrerCustomerId: z.string().trim().max(40).nullish().describe("Member who introduced this person, for a referral."),
      unitId: z.string().trim().max(40).nullish(),
      occurredAt: z.string().trim().max(40).nullish().describe("When it happened, ISO-8601. Default now."),
    })
    .strict(),
  test: "M1.11-S1.2",
  async handler({ actor, params, input }) {
    const occurredAt = input.occurredAt ? new Date(input.occurredAt) : null;
    const res = await sources.recordTouch(memberCtxOf(actor), requiredId(params.id), {
      ...input,
      occurredAt: occurredAt && !Number.isNaN(occurredAt.getTime()) ? occurredAt : null,
    });
    return jsonSafe(res);
  },
});

export const SOURCES_OPS: ApiOp[] = [linksList, linksCreate, linksUpdate, linksToggle, report, touch];
