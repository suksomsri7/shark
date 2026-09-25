// ops/insights.ts — op ที่ใบ C2.11 เพิ่มให้ "ผู้ช่วย AI" แต่ path อยู่ในหมวดของใบ C1.10 (ดีล · กิจกรรม)
//
// 🔴 ทำไมแยกไฟล์: `ops/deals.ts` และ `ops/activities.ts` เป็นของใบ C1.10 (และมีใบอื่นวิ่งขนานแตะอยู่) ⇒ ใบนี้เพิ่ม
//    op ของตัวเองในไฟล์ของตัวเอง · path ยังอยู่ในหมวดเดิมของคู่มือ (`/deals…` `/activities…`) จึงไม่มีประตูที่สองของเรื่องเดียวกัน
// 🔴 ไม่มี engine ที่สอง: `deals.listDeals` (ตัวกรอง `stale` ของใบ C1.5) · `activities.listActivities` (สถานะ "ค้างอยู่ ·
//    วันนี้ · 7 วัน · เลยกำหนด" ของใบ C1.6) · `deals.setNextStep` (ใบ C1.5) — ที่นี่แค่ตั้งค่าปริยายให้ผู้ช่วยถามสั้น ๆ ได้
// 🔴 AUDIT-CLASS X2: คีย์/สิทธิ์เท่าเดิมทุกตัว (`crm.deal.read` · `crm.activity.read` · `crm.deal.update`) และการมองเห็น
//    มาจาก `visibleWhere` ของบริการ ⇒ ผู้ช่วยที่ถามแทนพนักงานคนหนึ่งเห็นเท่าที่คนนั้นเห็น ไม่มากกว่า

import { z } from "zod";
import * as activities from "../../activities";
import * as deals from "../../deals";
import { ACTIVITY_STATUSES, ACTIVITY_TYPES } from "../../activities-shared";
import { crmActorOf, crmCtxOf } from "../actor";
import { defineCrmOp, type ApiOp } from "../op";
import { cursor, idStr, optText, take, text } from "../schema";

const staleDeals = defineCrmOp({
  id: "deals.stale.list",
  method: "GET",
  path: "/deals/stale",
  kind: "read",
  action: "crm.deal.read",
  summary:
    "Open deals that have gone quiet: no activity (or no stage change) for longer than the shop's stale threshold, newest activity last. " +
    "Same list and same visibility as GET /deals?stale=true - this door only fixes the filter so one call answers 'what needs a nudge'.",
  label: "ดีลที่นิ่ง",
  input: z.object({ take, cursor, pipelineId: idStr.optional(), owner: text(64).optional(), team: text(64).optional() }).strict(),
  rate: "report",
  test: "C2.11-S3.2",
  tool: { name: "crm_stale_deals", hint: "Use to answer which deals have gone quiet and need a follow-up." },
  async handler({ actor, input }) {
    const r = await deals.listDeals(crmCtxOf(actor), crmActorOf(actor), {
      stale: true,
      pipelineId: input.pipelineId ?? null,
      owner: input.owner ?? null,
      team: input.team ?? null,
      cursor: input.cursor ?? null,
      pageSize: input.take ?? 50,
    });
    return { items: r.items, nextCursor: r.nextCursor };
  },
});

const activitiesDue = defineCrmOp({
  id: "activities.due.list",
  method: "GET",
  path: "/activities/due",
  kind: "read",
  action: "crm.activity.read",
  summary:
    "Tasks and appointments that are waiting: status pending (default), today, week or overdue. " +
    "Same list and same visibility as GET /activities?status=... - this door only fixes the filter so one call answers 'what is due'.",
  label: "งานที่ถึงกำหนด",
  input: z
    .object({
      take,
      cursor,
      status: z.enum(ACTIVITY_STATUSES).optional(),
      type: z.enum(ACTIVITY_TYPES).optional(),
      scope: z.enum(["mine", "team"]).optional(),
      contactId: idStr.optional(),
      dealId: idStr.optional(),
    })
    .strict(),
  rate: "read",
  test: "C2.11-S3.2",
  tool: { name: "crm_activities_due", hint: "Use to answer what tasks or appointments are due or overdue right now." },
  async handler({ actor, input }) {
    const r = await activities.listActivities(crmCtxOf(actor), crmActorOf(actor), {
      status: input.status ?? "pending",
      type: input.type ?? null,
      scope: input.scope ?? null,
      contactId: input.contactId ?? null,
      dealId: input.dealId ?? null,
      cursor: input.cursor ?? null,
      pageSize: input.take ?? 50,
    });
    return { items: r.items, nextCursor: r.nextCursor };
  },
});

const setNextStep = defineCrmOp({
  id: "deals.nextStep.set",
  method: "PUT",
  path: "/deals/{id}/next-step",
  kind: "write",
  action: "crm.deal.update",
  summary: "Write the next step of one deal (a short note of what happens next, up to 300 characters). An empty value clears it.",
  label: "ตั้งขั้นถัดไปของดีล",
  input: z.object({ nextStep: optText(300) }).strict(),
  test: "C2.11-S3.4",
  tool: { name: "crm_set_next_step", hint: "Use to propose writing down what happens next on a deal after a call or a meeting." },
  async handler({ actor, params, input }) {
    const deal = await deals.setNextStep(crmCtxOf(actor), crmActorOf(actor), params.id ?? "", input.nextStep ?? null);
    return { dealId: deal.id, nextStep: deal.nextStep, deal };
  },
});

export const INSIGHTS_OPS: ApiOp[] = [staleDeals, activitiesDue, setNextStep];
