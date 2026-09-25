// ops/notifications.ts — op ของ "การแจ้งเตือนของฉัน" ผ่าน REST (ใบ C2.11 · CRM-API "Notifications")
//
// 🔴 ไม่มี engine ที่สอง: ทั้งสอง op เรียก `getMyPrefs` / `setMyPrefs` ของบริการ `notifications.ts` (ใบ C2.10) เท่านั้น
//    — ตัวผสมค่า (ค่าของร้าน × ค่าที่เจ้าตัวตั้งทับ) · ช่วงห้ามรบกวน · แถว audit · การตรวจรุ่นหน้าจอ อยู่ในบริการนั้นครบแล้ว
// 🔴 AUDIT-CLASS X1/X2 — **คีย์ทำแทน "เจ้าของคีย์" คนเดียว**: บริการอ่าน userId จาก actor (ซึ่งสำหรับคีย์ API
//    คือ `createdById` = คนที่ออกคีย์) ⇒ ไม่มีทางอ่าน/เขียนค่าของคนอื่นผ่าน REST เลย · สคีมาที่นี่จึง **ไม่มีช่อง
//    `userId`** (ถ้ามี คนถือคีย์จะตั้งค่าแจ้งเตือนให้เพื่อนร่วมงานได้ ซึ่งเป็นการตัดสินใจแทนเจ้าตัว) และ `.strict()`
//    ทำให้ body ที่แอบใส่ `userId` / `systemId` / `tenantId` ถูกปฏิเสธเป็น validation ก่อนถึงบริการ (ข้อสอบ X6.1)
// 🔴 คีย์สิทธิ์ = `crm.contact.read` (มติผู้คุมงาน 24 ก.ย. 2569 ข้อ 4): ค่าแจ้งเตือนของตัวเองไม่ใช่การตั้งค่าของร้าน
//    ⇒ ไม่สร้างคีย์สิทธิ์ใหม่ และคีย์ชุดอ่านอย่างเดียวก็อ่านค่าของตัวเองได้ (เขียนไม่ได้ — ด่านของ `defineCrmOp`)
// 🔴 คำตอบเป็น "เรื่อง × ช่องทาง" ล้วน ไม่มีชื่อ/อีเมล/เบอร์ของใคร (AUDIT-CLASS X8)

import { z } from "zod";
import * as notifications from "../../notifications";
import { CRM_NOTIF_CHANNELS, CRM_NOTIF_KEYS } from "../../notifications-shared";
import { crmActorOf, crmCtxOf } from "../actor";
import { defineCrmOp, type ApiOp } from "../op";

/** เวลาแบบ ชั่วโมง:นาที 24 ชม. (บริการตรวจซ้ำอีกชั้นด้วยข้อความไทยของตัวเอง) */
const hm = z.string().max(5).regex(/^([01]?\d|2[0-3]):([0-5]\d)$/);

/** ช่องทางของ 1 เรื่อง — เปิด/ปิดได้ทีละช่อง (ไม่ส่ง = ใช้ค่าของร้าน) */
const channelMap = z
  .object(Object.fromEntries(CRM_NOTIF_CHANNELS.map((c) => [c, z.boolean().optional()])) as Record<(typeof CRM_NOTIF_CHANNELS)[number], z.ZodOptional<z.ZodBoolean>>)
  .strict();

/**
 * `notifications: { "<เรื่อง>": { "<ช่องทาง>": true|false } }`
 * ชื่อเรื่องตรวจชนิดที่บริการ (ข้อความไทยของบริการบอกได้ว่า "เลือกจากรายการ 10 เรื่องของ CRM") — ที่นี่คุมเพดาน (X6)
 */
const notifBag = z
  .record(z.string().min(1).max(60), channelMap)
  .refine((o) => Object.keys(o).length <= CRM_NOTIF_KEYS.length, { message: `ตั้งค่าได้ไม่เกิน ${CRM_NOTIF_KEYS.length} เรื่องต่อครั้ง` });

const prefsGet = defineCrmOp({
  id: "notifications.prefs.get",
  method: "GET",
  path: "/notifications/prefs",
  kind: "read",
  action: "crm.contact.read",
  summary:
    "The CRM notification settings of the person this key acts for: which of the 10 CRM subjects reach them on which channel (in-app, push, e-mail), " +
    "their own quiet hours (null = the shop's), and the shop defaults they override. A key only ever sees its own owner's settings.",
  label: "การแจ้งเตือนของฉัน",
  input: z.object({}).strict(),
  rate: "read",
  test: "C2.11-S2.12",
  async handler({ actor }) {
    const r = await notifications.getMyPrefs(crmCtxOf(actor), crmActorOf(actor));
    return { userId: r.userId, notifications: r.prefs.notifications, quietHours: r.prefs.quietHours, shop: r.shop };
  },
});

const prefsSet = defineCrmOp({
  id: "notifications.prefs.set",
  method: "PUT",
  path: "/notifications/prefs",
  kind: "write",
  action: "crm.contact.read",
  summary:
    "Change the CRM notification settings of the person this key acts for: switch a subject on or off per channel (IN_APP, PUSH, EMAIL) " +
    "and set or clear their own quiet hours (quietHours: null = follow the shop). Only the key owner's own settings can be changed - " +
    "there is no userId field, so one key can never mute a colleague.",
  label: "แก้การแจ้งเตือนของฉัน",
  input: z
    .object({
      notifications: notifBag.optional(),
      quietHours: z.object({ enabled: z.boolean().optional(), from: hm.optional(), to: hm.optional() }).strict().nullable().optional(),
    })
    .strict(),
  test: "C2.11-S2.12",
  async handler({ actor, input }) {
    const patch: { notifications?: Record<string, Partial<Record<string, boolean>>>; quietHours?: { enabled?: boolean; from?: string; to?: string } | null } = {};
    if (input.notifications !== undefined) patch.notifications = input.notifications;
    if (input.quietHours !== undefined) patch.quietHours = input.quietHours;
    const prefs = await notifications.setMyPrefs(crmCtxOf(actor), crmActorOf(actor), patch);
    return { notifications: prefs.notifications, quietHours: prefs.quietHours };
  },
});

export const NOTIFICATIONS_OPS: ApiOp[] = [prefsGet, prefsSet];
