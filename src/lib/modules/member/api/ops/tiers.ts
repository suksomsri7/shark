// ops/tiers.ts — op ของ "ระดับสมาชิก" (MEMBER-API §2.5 · M1.11)
//
// 🔴 `tiers.setManual` เป็นคำสั่งอันตราย: มันข้ามเกณฑ์ที่ร้านตั้งไว้เอง ⇒ ต้อง confirm + reason
//    และถ้าร้านตั้งสายอนุมัติไว้ คำตอบคือ `{ applied: false, pending: true, approvalRequestId }`
//    (คีย์ไม่ได้รับสิทธิ์ข้ามสายอนุมัติเพียงเพราะเป็นเครื่อง — ดูหัวไฟล์ `api/actor.ts`)
// 🔴 `tiers.rules.dryRun` เป็น **read** แม้จะเป็น POST: มันประเมินทั้งร้านแล้วรายงานว่า "จะเกิดอะไร"
//    โดยไม่เขียนอะไรเลย ⇒ ไม่ต้องมี Idempotency-Key และไม่เขียน audit

import { z } from "zod";
import { listTierHistory } from "../../tier-history";
import * as tiers from "../../tiers";
import { memberActorOf, memberCtxOf } from "../actor";
import { jsonSafe } from "../serialize";
import { defineMemberOp, type ApiOp } from "../op";

const requiredId = (v: string | undefined): string => (v ?? "").trim();

const ruleCondition = z
  .object({
    field: z.enum(tiers.RULE_FIELDS),
    op: z.enum(tiers.RULE_OPS),
    value: z.union([z.number(), z.boolean()]),
    windowMonths: z.coerce.number().int().min(1).max(60).optional().describe("Rolling window in months for spend and visit conditions. Default 12."),
  })
  .strict();

const ruleInput = z
  .object({
    match: z.enum(["ALL", "ANY"]).describe("ALL = every condition must hold. ANY = one is enough."),
    conditions: z.array(ruleCondition).min(1).max(10),
  })
  .strict();

const list = defineMemberOp({
  id: "tiers.list",
  method: "GET",
  path: "/tiers",
  kind: "read",
  action: "member.tier.read",
  summary: "The shop's membership tiers in ladder order, with how many members sit in each and the benefits attached to them.",
  label: "รายการระดับสมาชิก",
  tool: { name: "member_tier_list", hint: "Use this to answer 'what tiers do we have' or before naming a tier in another call." },
  input: z.object({ includeArchived: z.coerce.boolean().optional().describe("Include retired tiers. Default false.") }).strict(),
  test: "M1.11-S2.7",
  async handler({ actor, input }) {
    const items = await tiers.listTierDefs(memberCtxOf(actor), { ...(input.includeArchived ? { includeArchived: true } : {}) });
    return jsonSafe({ items, total: items.length });
  },
});

const create = defineMemberOp({
  id: "tiers.create",
  method: "POST",
  path: "/tiers",
  kind: "write",
  action: "member.tier.manage",
  summary: "Add a tier to the ladder. It starts with no rules, so nobody moves into it until you set them.",
  label: "เพิ่มระดับสมาชิก",
  input: z
    .object({
      key: z.string().trim().min(1).max(40).describe("Stable reference, lowercase letters, digits and underscore, for example `gold`."),
      name: z.string().trim().min(1).max(60).describe("What members and staff see."),
      color: z.enum(["SLATE", "BLUE", "GREEN", "AMBER", "RED", "PURPLE"]),
      icon: z.string().trim().max(40).nullish(),
      description: z.string().trim().max(300).nullish(),
      isDefault: z.boolean().optional().describe("Where new members start. Only one tier may be the default."),
      paidPlanId: z.string().trim().max(40).nullish().describe("Subscription plan that grants this tier, for a paid membership."),
      legacyTier: z.enum(["MEMBER", "SILVER", "GOLD", "PLATINUM"]).nullish().describe("Old fixed tier this one replaces, so existing integrations keep working."),
    })
    .strict(),
  test: "M1.11-S1.2",
  async handler({ actor, input }) {
    return jsonSafe(await tiers.createTierDef(memberCtxOf(actor), memberActorOf(actor), input));
  },
});

const update = defineMemberOp({
  id: "tiers.update",
  method: "PATCH",
  path: "/tiers/{id}",
  kind: "write",
  action: "member.tier.manage",
  summary: "Rename a tier, change its colour or icon, or move the default to it.",
  label: "แก้ไขระดับสมาชิก",
  input: z
    .object({
      name: z.string().trim().min(1).max(60).optional(),
      color: z.enum(["SLATE", "BLUE", "GREEN", "AMBER", "RED", "PURPLE"]).optional(),
      icon: z.string().trim().max(40).nullish(),
      description: z.string().trim().max(300).nullish(),
      isDefault: z.boolean().optional(),
      paidPlanId: z.string().trim().max(40).nullish(),
      reviewCron: z.string().trim().max(60).nullish().describe("When the periodic tier review runs for this tier."),
      graceDays: z.coerce.number().int().min(0).max(365).optional().describe("Days a member keeps the tier after falling below the keep rule."),
      notifyBeforeDays: z.coerce.number().int().min(0).max(365).optional().describe("Warn the member this many days before they lose the tier."),
    })
    .strict(),
  test: "M1.11-S1.2",
  async handler({ actor, params, input }) {
    return jsonSafe(await tiers.updateTierDef(memberCtxOf(actor), memberActorOf(actor), requiredId(params.id), input));
  },
});

const reorder = defineMemberOp({
  id: "tiers.reorder",
  method: "PUT",
  path: "/tiers/order",
  kind: "write",
  action: "member.tier.manage",
  summary: "Set the ladder order, lowest tier first. Send every tier id.",
  label: "เรียงลำดับระดับสมาชิก",
  input: z.object({ ids: z.array(z.string().trim().min(1).max(40)).min(1).max(30) }).strict(),
  test: "M1.11-S1.2",
  async handler({ actor, input }) {
    const items = await tiers.reorderTierDefs(memberCtxOf(actor), memberActorOf(actor), input.ids);
    return jsonSafe({ items, total: items.length });
  },
});

const archive = defineMemberOp({
  id: "tiers.archive",
  method: "POST",
  path: "/tiers/{id}/archive",
  kind: "write",
  action: "member.tier.manage",
  summary: "Retire a tier. Members sitting in it have to go somewhere, so name the tier they move to.",
  label: "เก็บระดับสมาชิกเข้าคลัง",
  input: z
    .object({ moveToTierId: z.string().trim().max(40).nullish().describe("Tier the current members are moved to. Required when the tier is not empty.") })
    .strict(),
  test: "M1.11-S1.2",
  async handler({ actor, params, input }) {
    const res = await tiers.archiveTierDef(memberCtxOf(actor), memberActorOf(actor), requiredId(params.id), {
      moveToTierId: input.moveToTierId ?? null,
    });
    return jsonSafe(res);
  },
});

const benefitsSet = defineMemberOp({
  id: "tiers.benefits.set",
  method: "PUT",
  path: "/tiers/{id}/benefits",
  kind: "write",
  action: "member.tier.manage",
  summary:
    "Replace the whole benefit list of a tier. Whatever you send is what the tier grants from then on, so read the tier first if you only mean to add one.",
  label: "ตั้งสิทธิประโยชน์ของระดับ",
  input: z
    .object({
      benefits: z
        .array(
          z
            .object({
              type: z.string().trim().min(1).max(40).describe("Benefit type, for example DISCOUNT_PCT, POINT_MULTIPLIER or FREE_DELIVERY."),
              config: z.record(z.string(), z.unknown()).optional().describe("Settings of that benefit type, for example { pct: 10, maxSatang: 50000 }."),
              active: z.boolean().optional(),
            })
            .strict(),
        )
        .max(20),
    })
    .strict(),
  test: "M1.11-S1.2",
  async handler({ actor, params, input }) {
    const items = await tiers.setBenefits(memberCtxOf(actor), memberActorOf(actor), requiredId(params.id), input.benefits);
    return jsonSafe({ items, total: items.length });
  },
});

const rulesGet = defineMemberOp({
  id: "tiers.rules.get",
  method: "GET",
  path: "/tiers/{id}/rules",
  kind: "read",
  action: "member.tier.manage",
  summary: "The upgrade rule and the keep rule of one tier, plus when the review runs, the grace period and the warning lead time.",
  label: "กฎของระดับสมาชิก",
  test: "M1.11-S1.2",
  async handler({ actor, params }) {
    return jsonSafe(await tiers.getTierRules(memberCtxOf(actor), requiredId(params.id)));
  },
});

const rulesSet = defineMemberOp({
  id: "tiers.rules.set",
  method: "PUT",
  path: "/tiers/{id}/rules",
  kind: "write",
  action: "member.tier.manage",
  summary:
    "Set how members reach this tier and how they keep it. Send `null` for a rule to remove it. Nothing moves until the next review, so run the dry run first.",
  label: "ตั้งกฎของระดับสมาชิก",
  input: z
    .object({
      upgrade: ruleInput.nullish().describe("What a member must reach to move up into this tier."),
      keep: ruleInput.nullish().describe("What a member must keep doing to stay in it."),
      reviewCron: z.string().trim().max(60).nullish(),
      graceDays: z.coerce.number().int().min(0).max(365).optional(),
      notifyBeforeDays: z.coerce.number().int().min(0).max(365).optional(),
    })
    .strict(),
  test: "M1.11-S1.2",
  async handler({ actor, params, input }) {
    return jsonSafe(await tiers.setTierRules(memberCtxOf(actor), memberActorOf(actor), requiredId(params.id), input));
  },
});

const rulesDryRun = defineMemberOp({
  id: "tiers.rules.dryRun",
  method: "POST",
  path: "/tiers/rules/dry-run",
  kind: "read",
  action: "member.tier.manage",
  rate: "report",
  summary:
    "Answer 'what would happen if we ran the tier review right now': who would move up, who would fall, who is at risk. Writes nothing.",
  label: "ทดลองรันกฎระดับ",
  tool: { name: "member_tier_simulate", hint: "Use this before changing tier rules, to tell the owner how many members it would move." },
  input: z
    .object({
      customerIds: z.array(z.string().trim().min(1).max(40)).max(500).optional().describe("Limit the simulation to these members. Omit for the whole shop."),
    })
    .strict(),
  test: "M1.11-S1.2",
  async handler({ actor, input }) {
    const ctx = memberCtxOf(actor);
    const res = await tiers.runTierReview(ctx, ctx.systemId, new Date(), {
      dryRun: true,
      ...(input.customerIds ? { customerIds: input.customerIds } : {}),
    });
    return jsonSafe(res);
  },
});

const evaluate = defineMemberOp({
  id: "tiers.evaluate",
  method: "GET",
  path: "/members/{id}/tier",
  kind: "read",
  action: "member.tier.read",
  summary:
    "Where one member stands: current tier, the next one up, the numbers the rules judge on (12 month spend, visits, tier points) and how far they still are from moving up.",
  label: "สถานะระดับของสมาชิก",
  tool: { name: "member_tier_status", hint: "Use this to answer 'how far is this customer from gold'." },
  test: "M1.11-S2.7",
  async handler({ actor, params }) {
    return jsonSafe(await tiers.evaluateMember(memberCtxOf(actor), requiredId(params.id)));
  },
});

const setManual = defineMemberOp({
  id: "tiers.setManual",
  method: "POST",
  path: "/members/{id}/tier",
  kind: "danger",
  action: "member.tier.setManual",
  summary:
    "Put a member into a tier by hand, overriding the rules. Use `until` for a temporary courtesy upgrade; without it the member stays there until somebody changes it again. May come back as pending when the shop routes this through its approval chain.",
  label: "ตั้งระดับสมาชิกด้วยมือ",
  tool: { name: "member_tier_set_manual", hint: "Only when the shop owner explicitly asked to override a customer's tier.", risk: "DESTRUCTIVE" },
  input: z
    .object({
      tierDefId: z.string().trim().min(1).max(40).describe("Id of the tier to put them in (from GET /tiers)."),
      reason: z.string().trim().min(5).max(200).describe("Why. Stored in the member's tier history and in the audit log."),
      until: z.string().trim().max(40).nullish().describe("ISO-8601 instant the manual tier expires at. Omit to make it permanent."),
    })
    .strict(),
  test: "M1.11-S2.9",
  async handler({ actor, params, input }) {
    const until = input.until ? new Date(input.until) : null;
    const res = await tiers.setManualTier(memberCtxOf(actor), memberActorOf(actor), requiredId(params.id), {
      tierDefId: input.tierDefId,
      reason: input.reason,
      until: until && !Number.isNaN(until.getTime()) ? until : null,
    });
    return jsonSafe(res);
  },
});

const history = defineMemberOp({
  id: "tiers.history",
  method: "GET",
  path: "/members/{id}/tier/history",
  kind: "read",
  action: "member.tier.read",
  summary:
    "Every tier change of one member, newest first, with why it happened and the numbers behind it. Rows marked `pending` are manual changes still waiting for approval and have no effect yet.",
  label: "ประวัติระดับของสมาชิก",
  tool: { name: "member_tier_history", hint: "Use this to answer 'when did this customer become gold' or 'why did they drop'." },
  input: z.object({ take: z.coerce.number().int().min(1).max(100).optional().describe("Rows to return, 1-100. Default 20.") }).strict(),
  test: "M1.11-S1.2",
  async handler({ actor, params, input }) {
    const res = await listTierHistory(memberCtxOf(actor), memberActorOf(actor), requiredId(params.id), {
      ...(input.take ? { take: input.take } : {}),
    });
    return jsonSafe(res);
  },
});

const reviewNow = defineMemberOp({
  id: "tiers.reviewNow",
  method: "POST",
  path: "/tiers/review",
  kind: "write",
  action: "member.tier.manage",
  rate: "report",
  summary:
    "Run the tier review for the whole shop right now instead of waiting for the schedule. Members move up, fall or get their warning, exactly as the nightly job would do it.",
  label: "ทบทวนระดับทั้งร้านตอนนี้",
  input: z
    .object({ customerIds: z.array(z.string().trim().min(1).max(40)).max(500).optional().describe("Review only these members. Omit for the whole shop.") })
    .strict(),
  test: "M1.11-S1.2",
  async handler({ actor, input }) {
    const ctx = memberCtxOf(actor);
    const res = await tiers.runTierReview(ctx, ctx.systemId, new Date(), {
      ...(input.customerIds ? { customerIds: input.customerIds } : {}),
    });
    return jsonSafe(res);
  },
});

export const TIERS_OPS: ApiOp[] = [
  list,
  create,
  update,
  reorder,
  archive,
  benefitsSet,
  rulesGet,
  rulesSet,
  rulesDryRun,
  evaluate,
  setManual,
  history,
  reviewNow,
];
