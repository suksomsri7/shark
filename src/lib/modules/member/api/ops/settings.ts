// ops/settings.ts — op ของ "ตั้งค่ารวม" + "คีย์ API" ของระบบสมาชิก (MEMBER-API §2.20 · M3.10)
//
// `GET /settings` = รวมค่าตั้งของ 5 เรื่องไว้คำขอเดียว (รีวิว · แนะนำเพื่อน · แจ้งเตือน · บัตรกำนัล · อีเมลรายงาน)
// `PUT /settings` = ส่งเฉพาะเรื่องที่จะแก้ · แต่ละเรื่องเดินผ่าน setter ของบริการตัวเดิม (ด่านสิทธิ์/การตรวจของใครของมัน)
//
// คีย์ API (`/api-keys`) — ออก/ดู/เพิกถอนคีย์ **ของระบบสมาชิกนี้เท่านั้น** (คีย์ของบัญชี/บอร์ดงานมองไม่เห็น = ไม่พบ)
// 🔴 คีย์ดิบคืนครั้งเดียว (`secret`) — ตอบซ้ำจากแถวกันซ้ำได้ `secret: null` (`replaySecrets`)
// 🔴 ออกได้เฉพาะ 3 ชุดของระบบสมาชิก (read · operate · admin) — ขอชุดของโมดูลอื่นผ่านทางนี้ไม่ได้
// 🔴 ทุกคำสั่งต้องมี `member.api.manage` (มีเฉพาะชุด admin) · เพิกถอน = danger (confirm + reason)

import { z } from "zod";
import * as giftcard from "@/lib/modules/giftcard";
import { createApiKey, listApiKeys, revokeApiKey } from "@/lib/api-keys/service";
import { bundleLabelForScopes, bundlesCovering, expandBundles } from "@/lib/api-keys/scopes";
import { ApiError } from "@/lib/api/respond";
import * as notifications from "../../notifications";
import * as referrals from "../../referrals";
import * as reports from "../../reports";
import * as reviews from "../../reviews";
import { REPORT_TABS } from "../../reports-shared";
import { memberActorOf, memberCtxOf } from "../actor";
import { as400 } from "../http-errors";
import { giftCardCtx, loyaltyCtx } from "../loyalty";
import { defineMemberOp, type ApiOp } from "../op";
import { jsonSafe } from "../serialize";
import { referralProgramInput } from "./referrals";
import { reviewSettingsInput } from "./reviews";
import type { ApiActor } from "@/lib/api/actor";

const TEST = "M3.10-S3.8";
const MEMBER_BUNDLES = ["member-read", "member-operate", "member-admin"] as const;

async function allSettings(actor: ApiActor) {
  const ctx = memberCtxOf(actor);
  const b = await loyaltyCtx(actor);
  const [review, referral, notif, giftCard, schedule] = await Promise.all([
    reviews.getReviewSettings(ctx),
    referrals.getProgram(ctx),
    notifications.getNotificationSettings(ctx),
    giftcard.getSettings(giftCardCtx(b)).catch(() => null),
    reports.getReportSchedule(ctx),
  ]);
  return { review, referral, notifications: notif, giftCard, reports: { schedule } };
}

const settingsGet = defineMemberOp({
  id: "settings.get",
  method: "GET",
  path: "/settings",
  kind: "read",
  action: "member.settings.manage",
  summary: "Settings of this member system in one call: reviews, the referral programme, member notifications (templates, quiet hours, consent switches), gift cards and the scheduled report email.",
  label: "ตั้งค่าระบบสมาชิก",
  test: TEST,
  async handler({ actor }) {
    return jsonSafe(await allSettings(actor));
  },
});

const settingsSet = defineMemberOp({
  id: "settings.set",
  method: "PUT",
  path: "/settings",
  kind: "write",
  action: "member.settings.manage",
  summary: "Change settings of several areas at once. Send only the areas and fields you want to move; each area goes through its own rules (referral needs member.referral.manage, gift cards member.giftcard.manage). Answers the full settings after the change.",
  label: "บันทึกการตั้งค่าระบบสมาชิก",
  input: z
    .object({
      review: reviewSettingsInput.optional().describe("Same fields as PUT /reviews/settings."),
      referral: referralProgramInput.optional().describe("Same fields as PUT /referrals/program."),
      notifications: z
        .object({
          quietHours: z.object({ enabled: z.boolean().optional(), from: z.string().optional(), to: z.string().optional() }).strict().optional(),
          respectConsent: z.boolean().optional(),
          transactionalOverride: z.boolean().optional(),
        })
        .strict()
        .optional()
        .describe("System switches. Templates change one at a time with PUT /notifications/templates/{key}."),
      giftCard: z
        .object({
          enabled: z.boolean().optional(),
          accountingLink: z.boolean().optional(),
          expiryMonths: z.coerce.number().int().min(1).max(120).optional(),
          denominations: z.array(z.coerce.number().int().min(1)).max(20).optional(),
          transferable: z.boolean().optional(),
          reloadable: z.boolean().optional(),
        })
        .strict()
        .optional()
        .describe("Same fields as PUT /giftcards/settings."),
      reports: z
        .object({
          enabled: z.boolean().optional(),
          emails: z.array(z.string().email()).max(10).optional(),
          hour: z.coerce.number().int().min(0).max(23).optional(),
          tabs: z.array(z.enum(REPORT_TABS)).max(7).optional(),
        })
        .strict()
        .optional()
        .describe("Scheduled report email."),
    })
    .strict(),
  test: TEST,
  async handler({ actor, input }) {
    const ctx = memberCtxOf(actor);
    const who = memberActorOf(actor);
    await as400(async () => {
      if (input.review) await reviews.setReviewSettings(ctx, who, input.review);
      if (input.referral) await referrals.setProgram(ctx, who, input.referral);
      if (input.notifications) await notifications.setNotificationSettings(ctx, who, input.notifications);
      if (input.giftCard) {
        const b = await loyaltyCtx(actor);
        await giftcard.setSettings(giftCardCtx(b), who, input.giftCard);
      }
      if (input.reports) await reports.setReportSchedule(ctx, who, input.reports);
    });
    return jsonSafe(await allSettings(actor));
  },
});

// ───────────────────────── คีย์ API ─────────────────────────

type KeyView = {
  id: string;
  name: string;
  prefix: string;
  bundle: string | null;
  bundleLabel: string;
  scopes: string[];
  expiresAt: Date | null;
  lastUsedAt: Date | null;
  createdAt: Date;
};

async function keysOfSystem(actor: ApiActor): Promise<KeyView[]> {
  const rows = await listApiKeys({ tenantId: actor.tenantId });
  return rows
    .filter((k) => k.systemId === actor.systemId && !k.revokedAt)
    .map((k) => ({
      id: k.id,
      name: k.name,
      prefix: k.prefix,
      bundle: bundlesCovering(k.scopes).find((b) => b.startsWith("member-")) ?? null,
      bundleLabel: bundleLabelForScopes(k.scopes),
      scopes: k.scopes,
      expiresAt: k.expiresAt,
      lastUsedAt: k.lastUsedAt,
      createdAt: k.createdAt,
    }));
}

const keysList = defineMemberOp({
  id: "apikeys.list",
  method: "GET",
  path: "/api-keys",
  kind: "read",
  action: "member.api.manage",
  summary: "Active API keys bound to this member system: name, first characters, bundle, scopes, expiry and last use. Raw keys are never returned.",
  label: "คีย์ API ของระบบสมาชิก",
  test: TEST,
  async handler({ actor }) {
    const items = await keysOfSystem(actor);
    return jsonSafe({ items, total: items.length });
  },
});

const keysCreate = defineMemberOp({
  id: "apikeys.create",
  method: "POST",
  path: "/api-keys",
  kind: "write",
  action: "member.api.manage",
  summary: "Issue a new API key bound to this member system with one of the member bundles. The raw key is in `secret` and is shown only in this reply; a replay of the same request answers `secret: null`.",
  label: "ออกคีย์ API ใหม่",
  input: z
    .object({
      name: z.string().trim().min(1).max(80).describe("What the key is for, for example 'Website signup form'."),
      bundle: z.enum(MEMBER_BUNDLES).describe("member-read (read only) · member-operate (counter work) · member-admin (everything, including settings and keys)."),
      ttlDays: z.coerce.number().int().min(0).max(3650).optional().describe("Days until the key expires (default 365). 0 = never."),
    })
    .strict(),
  replaySecrets: ["secret"],
  test: TEST,
  async handler({ actor, input }) {
    const ttl = input.ttlDays ?? 365;
    const expiresAt = ttl === 0 ? null : new Date(Date.now() + ttl * 86_400_000);
    const scopes = expandBundles([input.bundle]);
    const created = await createApiKey({ tenantId: actor.tenantId }, input.name, {
      scopes,
      systemId: actor.systemId,
      expiresAt,
      createdById: actor.userId ?? null,
    });
    return jsonSafe({ id: created.id, secret: created.rawKey, prefix: created.prefix, bundle: input.bundle, scopes, expiresAt });
  },
});

const keysRevoke = defineMemberOp({
  id: "apikeys.revoke",
  method: "DELETE",
  path: "/api-keys/{id}",
  kind: "danger",
  action: "member.api.manage",
  summary: "Revoke a key of this member system. It stops working immediately (the next call with it answers 401). A key of another system or module answers 404.",
  label: "เพิกถอนคีย์ API",
  input: z.object({ reason: z.string().trim().min(5).max(500) }).strict(),
  test: TEST,
  async handler({ actor, params }) {
    const id = params.id ?? "";
    const mine = (await keysOfSystem(actor)).some((k) => k.id === id);
    if (!mine) {
      throw new ApiError(404, "not_found", "ไม่พบคีย์นี้ในระบบสมาชิกนี้ — อาจถูกเพิกถอนไปแล้ว", "No active key of this member system has that id.");
    }
    await revokeApiKey({ tenantId: actor.tenantId }, id);
    return jsonSafe({ id, revoked: true });
  },
});

export const SETTINGS_OPS: ApiOp[] = [settingsGet, settingsSet, keysList, keysCreate, keysRevoke];
