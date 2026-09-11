// ops/journeys.ts — op ของ "journey อัตโนมัติ" (MEMBER-API §2.15 · M3.10 · บริการ M3.3 `member/journeys.ts`)
//
// 🔴 สร้างได้ 2 ทาง: จากสำเร็จรูป (`presetKey` — 6 แบบของ `JOURNEY_PRESETS`) หรือประกอบเองทั้งเส้น
//    (`trigger` + `conditions` + `actions`) — เอนจินตรวจทุกขั้นเหมือนหน้าจอ (ข้อความผิดเป็นไทยจากบริการ)
// 🔴 ปิด journey = ขั้นที่ "รอ n วัน" อยู่ถูกยกเลิกทันที (§11.6) · คำตอบบอกจำนวนที่ถูกยกเลิก
// 🔴 อ่าน = `member.promo.read` · สร้าง/แก้/เปิดปิด = `member.promo.manage`

import { z } from "zod";
import * as journeys from "../../journeys";
import { memberActorOf, memberCtxOf } from "../actor";
import { defineMemberOp, type ApiOp } from "../op";
import { jsonSafe } from "../serialize";

const TEST = "M3.10-S3.3";

const triggerSchema = z
  .object({
    event: z.string().trim().min(1).max(80).describe("Trigger event, for example `member.birthday.upcoming`, `member.inactive`, `member.created`, `pos.sale.paid`."),
    params: z.record(z.string(), z.unknown()).optional().describe("Trigger parameters such as { daysBefore: 7 } or { days: 60 }."),
  })
  .strict();

const actionSchema = z
  .object({
    type: z.string().trim().min(1).max(40).describe("ISSUE_VOUCHER · SEND_LINE · SEND_EMAIL · SEND_SMS · SEND_PUSH · GIVE_POINTS · ADD_TAG · WAIT_THEN · REQUEST_REVIEW · CREATE_TASK."),
    params: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

const daysQuery = z
  .object({ days: z.coerce.number().int().min(1).max(365).optional().describe("Window in days (default 30).") })
  .strict();

const list = defineMemberOp({
  id: "journeys.list",
  method: "GET",
  path: "/journeys",
  kind: "read",
  action: "member.promo.read",
  summary: "Journeys of this member system with a Thai one-line summary and this month's results (entered, used, sales, cost, ROI).",
  label: "journey ทั้งหมด",
  tool: { name: "journey_list", hint: "Use to see which automations are running before proposing a new one." },
  test: TEST,
  async handler({ actor }) {
    const items = await journeys.listJourneys(memberCtxOf(actor), memberActorOf(actor));
    return jsonSafe({ items, total: items.length });
  },
});

const presets = defineMemberOp({
  id: "journeys.presets",
  method: "GET",
  path: "/journeys/presets",
  kind: "read",
  action: "member.promo.read",
  summary: "The ready-made journeys (birthday, new member, inactive, at risk, no show, ask for a review): key, Thai name, what it does, trigger, steps and holdout. Create one with POST /journeys { presetKey }.",
  label: "journey สำเร็จรูป",
  tool: { name: "journey_presets", hint: "Offer one of these before building a journey from scratch." },
  test: TEST,
  async handler() {
    const items = journeys.JOURNEY_PRESETS.map((p) => ({
      key: p.key,
      name: p.name,
      desc: p.desc,
      trigger: p.trigger,
      actions: p.actions.map((a) => a.type),
      holdoutPct: p.holdoutPct,
      reentryDays: p.reentryDays,
    }));
    return jsonSafe({ items, total: items.length });
  },
});

const get = defineMemberOp({
  id: "journeys.get",
  method: "GET",
  path: "/journeys/{id}",
  kind: "read",
  action: "member.promo.read",
  summary: "One journey: trigger, conditions, steps, holdout, re-entry window and whether it is enabled.",
  label: "ดู journey",
  test: TEST,
  async handler({ actor, params }) {
    return jsonSafe(await journeys.getJourney(memberCtxOf(actor), memberActorOf(actor), params.id ?? ""));
  },
});

const create = defineMemberOp({
  id: "journeys.create",
  method: "POST",
  path: "/journeys",
  kind: "write",
  action: "member.promo.manage",
  summary: "Create a journey, either from a ready-made one (`presetKey`, optionally with `templateId` for its voucher step) or from `trigger` + `conditions` + `actions`. The journey limit of the shop's plan applies.",
  label: "สร้าง journey",
  input: z
    .object({
      presetKey: z.string().trim().max(40).optional().describe("Key from GET /journeys/presets. When sent, trigger/conditions/actions are taken from the preset."),
      templateId: z.string().trim().max(40).nullish().describe("Voucher template for the preset's voucher step. Default: the shop's first active template."),
      name: z.string().trim().min(1).max(120).optional(),
      trigger: triggerSchema.optional(),
      conditions: z.unknown().optional().describe("Segment definition (same shape as POST /segments/count). Omit for every member."),
      actions: z.array(actionSchema).max(20).optional(),
      holdoutPct: z.coerce.number().int().min(0).max(50).optional(),
      reentryDays: z.coerce.number().int().min(1).max(3650).nullish().describe("A member may enter again after this many days. Null means once in a lifetime."),
      enabled: z.boolean().optional().describe("Default true."),
    })
    .strict(),
  test: TEST,
  async handler({ actor, input }) {
    const ctx = memberCtxOf(actor);
    const who = memberActorOf(actor);
    if (input.presetKey) {
      return jsonSafe(
        await journeys.createFromPreset(ctx, who, input.presetKey, {
          templateId: input.templateId ?? null,
          name: input.name ?? null,
          enabled: input.enabled !== false,
        }),
      );
    }
    return jsonSafe(
      await journeys.createJourney(ctx, who, {
        name: input.name ?? "",
        trigger: input.trigger ?? { event: "" },
        conditions: input.conditions ?? { groups: [] },
        actions: input.actions ?? [],
        holdoutPct: input.holdoutPct ?? 0,
        reentryDays: input.reentryDays ?? null,
        enabled: input.enabled !== false,
      }),
    );
  },
});

const update = defineMemberOp({
  id: "journeys.update",
  method: "PATCH",
  path: "/journeys/{id}",
  kind: "write",
  action: "member.promo.manage",
  summary: "Change a journey. Fields you leave out keep their value. Disabling it cancels every step that is still waiting.",
  label: "แก้ journey",
  input: z
    .object({
      name: z.string().trim().min(1).max(120).optional(),
      trigger: triggerSchema.optional(),
      conditions: z.unknown().optional(),
      actions: z.array(actionSchema).max(20).optional(),
      holdoutPct: z.coerce.number().int().min(0).max(50).optional(),
      reentryDays: z.coerce.number().int().min(1).max(3650).nullish(),
      enabled: z.boolean().optional(),
    })
    .strict(),
  test: TEST,
  async handler({ actor, params, input }) {
    const ctx = memberCtxOf(actor);
    const who = memberActorOf(actor);
    const cur = await journeys.getJourney(ctx, who, params.id ?? "");
    return jsonSafe(
      await journeys.updateJourney(ctx, who, cur.id, {
        name: input.name ?? cur.name,
        trigger: input.trigger ?? cur.trigger,
        conditions: input.conditions ?? cur.conditions,
        actions: input.actions ?? cur.actions,
        holdoutPct: input.holdoutPct ?? cur.holdoutPct,
        reentryDays: input.reentryDays !== undefined ? input.reentryDays : cur.reentryDays,
        enabled: input.enabled ?? cur.enabled,
      }),
    );
  },
});

const toggle = defineMemberOp({
  id: "journeys.toggle",
  method: "POST",
  path: "/journeys/{id}/toggle",
  kind: "write",
  action: "member.promo.manage",
  summary: "Switch a journey on or off. Off cancels every step that is still waiting (`cancelled` says how many).",
  label: "เปิด/ปิด journey",
  input: z.object({ enabled: z.boolean() }).strict(),
  test: TEST,
  async handler({ actor, params, input }) {
    return jsonSafe(await journeys.toggleJourney(memberCtxOf(actor), memberActorOf(actor), params.id ?? "", input.enabled));
  },
});

const stats = defineMemberOp({
  id: "journeys.stats",
  method: "GET",
  path: "/journeys/{id}/stats",
  kind: "read",
  action: "member.promo.read",
  rate: "report",
  summary: "Results of a journey over a window: members who entered, count per step, holdout conversion, sent/used/sales/cost/ROI, uplift over the holdout, daily use and the latest entries.",
  label: "ผลของ journey",
  input: daysQuery,
  tool: { name: "journey_stats", hint: "Use to answer whether an automation is worth keeping." },
  test: TEST,
  async handler({ actor, params, input }) {
    return jsonSafe(await journeys.journeyStats(memberCtxOf(actor), memberActorOf(actor), params.id ?? "", { days: input.days }));
  },
});

const runs = defineMemberOp({
  id: "journeys.runs",
  method: "GET",
  path: "/journeys/{id}/runs",
  kind: "read",
  action: "member.promo.read",
  rate: "report",
  summary: "The latest members who went through the journey in the window: when they entered, the step they are at, its status and whether they used what they got.",
  label: "สมาชิกที่เข้า journey ล่าสุด",
  input: daysQuery,
  test: TEST,
  async handler({ actor, params, input }) {
    const s = await journeys.journeyStats(memberCtxOf(actor), memberActorOf(actor), params.id ?? "", { days: input.days });
    return jsonSafe({ items: s.recent, total: s.recent.length });
  },
});

export const JOURNEYS_OPS: ApiOp[] = [list, presets, get, create, update, toggle, stats, runs];
