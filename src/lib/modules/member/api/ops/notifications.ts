// ops/notifications.ts — op ของ "แจ้งเตือนสมาชิก" (MEMBER-API §2.18 · M3.10 · บริการ M3.6 `member/notifications.ts`)
//
// 🔴 สิทธิ์: อ่านเทมเพลต = `member.customer.read` (ข้อความของร้าน ไม่ใช่ข้อมูลลูกค้า) · สถิติ = `member.report.view`
//    · แก้เทมเพลต/ตั้งค่า/ทดสอบส่ง = `member.settings.manage`
// 🔴 สถิติ: บริการ `stats()` ถาม `member.settings.manage` เพราะหน้าจอของมันอยู่ในหน้าตั้งค่า — แต่สัญญา REST
//    ให้คีย์อ่านเห็น "ตัวเลขรวม" ได้ (ไม่มีชื่อ/ข้อความของใครเลย) ⇒ ด่านจริงของ op นี้คือ `member.report.view`
//    ที่แกนตรวจไปแล้ว แล้วส่ง actor ที่ถือสิทธิ์อ่านสถิติ **เฉพาะคำขอนี้** ให้บริการ (ไม่แตะด่านของหน้าจอ)
// 🔴 ตัวแปรที่ไม่อยู่ในทะเบียนของเหตุการณ์ = 400 `validation` + ข้อความไทยที่บอกตัวแปรที่ใช้ได้

import { z } from "zod";
import * as notifications from "../../notifications";
import { memberActorOf, memberCtxOf } from "../actor";
import { as400 } from "../http-errors";
import { defineMemberOp, type ApiOp } from "../op";
import { jsonSafe } from "../serialize";

const TEST = "M3.10-S3.6";

const CHANNELS = ["LINE", "EMAIL", "SMS", "PUSH"] as const;

const channelConfig = z
  .object({
    enabled: z.boolean().optional(),
    body: z.string().max(4000).optional(),
    subject: z.string().max(200).optional().describe("EMAIL only."),
    title: z.string().max(100).optional().describe("PUSH only."),
  })
  .strict();

const templatesList = defineMemberOp({
  id: "notifications.templates.list",
  method: "GET",
  path: "/notifications/templates",
  kind: "read",
  action: "member.customer.read",
  summary: "The 8 member notifications (welcome, points earned, points expiring, tier up, tier at risk, new voucher, stamp card complete, review request) with their per-channel text, timing and switch, the variables each may use, plus quiet hours, the consent switches and whether SMS is available.",
  label: "เทมเพลตแจ้งเตือนสมาชิก",
  test: TEST,
  async handler({ actor }) {
    const s = await notifications.getNotificationSettings(memberCtxOf(actor));
    const items = notifications.NOTIF_EVENTS.map((e) => ({
      key: e.key,
      label: e.label,
      transactional: e.transactional,
      vars: e.vars,
      sourceEvent: e.sourceEvent,
      ...s.templates[e.key],
    }));
    return jsonSafe({
      items,
      total: items.length,
      quietHours: s.quietHours,
      respectConsent: s.respectConsent,
      transactionalOverride: s.transactionalOverride,
      smsAvailable: s.smsAvailable,
    });
  },
});

const templatesSet = defineMemberOp({
  id: "notifications.templates.set",
  method: "PUT",
  path: "/notifications/templates/{key}",
  kind: "write",
  action: "member.settings.manage",
  summary: "Change one notification: its switch, timing (IMMEDIATE or DAILY_DIGEST at `digestHour`), lead days (POINTS_EXPIRING) and the text per channel. Only the variables listed for that notification are accepted; anything else answers 400 with the allowed list.",
  label: "แก้เทมเพลตแจ้งเตือน",
  input: z
    .object({
      enabled: z.boolean().optional(),
      timing: z.enum(["IMMEDIATE", "DAILY_DIGEST"]).optional(),
      digestHour: z.coerce.number().int().min(0).max(23).optional(),
      leadDays: z.array(z.coerce.number().int().min(1).max(365)).max(5).optional(),
      channels: z
        .object({ LINE: channelConfig.optional(), EMAIL: channelConfig.optional(), SMS: channelConfig.optional(), PUSH: channelConfig.optional() })
        .strict()
        .optional(),
    })
    .strict(),
  test: TEST,
  async handler({ actor, params, input }) {
    return jsonSafe(
      await as400(
        () => notifications.setTemplate(memberCtxOf(actor), memberActorOf(actor), (params.key ?? "").toUpperCase(), input),
        "The notification template was not accepted. Check the variables allowed for this notification.",
      ),
    );
  },
});

const settingsSet = defineMemberOp({
  id: "notifications.settings.set",
  method: "PUT",
  path: "/notifications/settings",
  kind: "write",
  action: "member.settings.manage",
  summary: "Change the notification switches: quiet hours (messages inside the window wait until it ends), respect consent per channel, and let transactional notifications through without marketing consent.",
  label: "ตั้งค่าการแจ้งเตือน",
  input: z
    .object({
      quietHours: z
        .object({
          enabled: z.boolean().optional(),
          from: z.string().regex(/^\d{2}:\d{2}$/).optional().describe("HH:MM Thai time, for example 21:00."),
          to: z.string().regex(/^\d{2}:\d{2}$/).optional(),
        })
        .strict()
        .optional(),
      respectConsent: z.boolean().optional(),
      transactionalOverride: z.boolean().optional(),
    })
    .strict(),
  test: TEST,
  async handler({ actor, input }) {
    return jsonSafe(await as400(() => notifications.setNotificationSettings(memberCtxOf(actor), memberActorOf(actor), input)));
  },
});

const stats = defineMemberOp({
  id: "notifications.stats",
  method: "GET",
  path: "/notifications/stats",
  kind: "read",
  action: "member.report.view",
  rate: "report",
  summary: "Notifications of a Thai calendar month: sent, failed, skipped (no consent, switched off, no channel) and still queued, with sent counts per channel and per notification.",
  label: "สถิติการแจ้งเตือน",
  input: z.object({ month: z.string().regex(/^\d{4}-\d{2}$/).optional().describe("`YYYY-MM` (default: this Thai month).") }).strict(),
  test: TEST,
  async handler({ actor, input }) {
    const who = memberActorOf(actor);
    // ด่านของ op นี้คือ `member.report.view` (แกนตรวจแล้ว) — ให้บริการเห็นสิทธิ์อ่านสถิติเฉพาะคำขอนี้ (ดูหัวไฟล์)
    const viewer = { ...who, permissions: { ...who.permissions, "member.settings.manage": true } };
    const month = input.month ? new Date(`${input.month}-15T00:00:00+07:00`) : undefined;
    return jsonSafe(await notifications.stats(memberCtxOf(actor), viewer, month ? { month } : {}));
  },
});

const testSend = defineMemberOp({
  id: "notifications.testSend",
  method: "POST",
  path: "/notifications/templates/{key}/test",
  kind: "write",
  action: "member.settings.manage",
  summary: "Render one notification with sample values and send it to the person behind the key on the chosen channel (never to a member). Answers the rendered preview and whether it could be delivered; nothing is logged as a member notification.",
  label: "ทดสอบส่งแจ้งเตือน",
  input: z.object({ channel: z.enum(CHANNELS).describe("Which channel's text to render and send.") }).strict(),
  tool: { name: "notification_test_send", hint: "Use after changing a notification text so the owner sees how it reads." },
  test: TEST,
  async handler({ actor, params, input }) {
    return jsonSafe(
      await as400(() => notifications.testSend(memberCtxOf(actor), memberActorOf(actor), (params.key ?? "").toUpperCase(), input.channel)),
    );
  },
});

export const NOTIFICATIONS_OPS: ApiOp[] = [templatesList, templatesSet, settingsSet, stats, testSend];
