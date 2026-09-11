// notifications.ts — เอนจินการแจ้งเตือนสมาชิก (M3.6 · พิมพ์เขียว §5.10 §8.x · ภาพ 30)
//
// กติกาประจำไฟล์
//   • ctx = { tenantId, systemId (= ระบบสมาชิก), actorUserId } · actor = สิทธิ์ของคนที่กด (access.ts)
//   • ตั้งค่าเก็บที่ `AppSystem.settings.member.notifications` (Json) — ไม่มีตารางตั้งค่าแยก
//   • บันทึกทุกความพยายามส่งลง `MemberNotification` 1 แถวต่อ 1 ช่องทาง (แม้ SKIPPED)
//   • 🔴 F2 — ห้าม import `chat`/`kanban` ตรง: ตัวส่งจริง (LINE ผ่านแชท) มาจาก composition root
//     `src/lib/member-journey-senders.ts` ที่ผู้เรียก (outbox-consumers.ts / platform/cron.ts) ฉีดผ่าน
//     `deps` เท่านั้น — ไม่ได้ฉีด = ถือว่าช่องทางนั้นยังไม่ได้ต่อสาย (SKIPPED "ยังไม่ได้ตั้งค่าตัวส่ง")
//     `EMAIL`/`SMS`/`PUSH` ไม่ข้ามโมดูล (อยู่ที่ `core/*`) จึงเรียกตรงได้เมื่อไม่มี deps ฉีดมา
//   • 🔴 `core/email` import แบบ dynamic เท่านั้น (`@/lib/env` ตรวจ env ตอนโหลด — fitness โหมดไม่มี env)

import type { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { hasMemberPerm, type MemberActor } from "./access";
import { MemberForbiddenError, MemberInputError, MemberNotFoundError } from "./errors";
import { getConsents, type MemberCtx } from "./privacy";
import { pointsOfMany } from "./profile";
import { getNotifEvent, NOTIF_CHANNELS, NOTIF_TIMINGS, varsUsedIn, type NotifChannel } from "./notification-events";
import {
  defaultNotificationSettings,
  depsKeyOf,
  renderTemplate,
  type NotifChannelConfig,
  type NotifTemplateConfig,
  type NotificationDeps,
  type NotificationSendRequest,
  type NotificationSettingsValue,
  type NotificationSettingsView,
  type NotifQuietHours,
} from "./notifications-shared";
import { getSmsProvider, sendSms } from "@/lib/core/sms";
import { sendPushToCustomerTokens } from "@/lib/core/push";
import { publicOrigin } from "@/lib/core/origin";

export type { NotifChannel, NotifEventDef, NotifTiming } from "./notification-events";
export type {
  NotifChannelConfig,
  NotifTemplateConfig,
  NotificationDeps,
  NotificationSendFn,
  NotificationSendRequest,
  NotificationSendResult,
  NotificationSettingsView,
} from "./notifications-shared";
export { NOTIF_CHANNELS, NOTIF_EVENTS } from "./notification-events";

// ───────────────────────── เวลาไทย (UTC+7) — แยกจากตัวช่วยของ point/journeys เพราะเป็น internal ของแต่ละไฟล์ ─────────────────────────

const BKK_OFFSET_MS = 7 * 3_600_000;

function bkkParts(d: Date): { y: number; mo: number; day: number; h: number; mi: number } {
  const t = new Date(d.getTime() + BKK_OFFSET_MS);
  return { y: t.getUTCFullYear(), mo: t.getUTCMonth(), day: t.getUTCDate(), h: t.getUTCHours(), mi: t.getUTCMinutes() };
}

/** สร้าง Date ที่ตรงกับ HH:MM ไทยของวันฐาน (+dayOffset วัน) */
function bkkAt(base: Date, hour: number, minute = 0, dayOffset = 0): Date {
  const t = bkkParts(base);
  return new Date(Date.UTC(t.y, t.mo, t.day + dayOffset, hour - 7, minute, 0, 0));
}

function parseHM(s: string): { h: number; m: number } {
  const [h, m] = String(s ?? "0:0").split(":").map((x) => Number(x) || 0);
  return { h, m };
}

/** เวลาไทยตอนนี้อยู่ในช่วง [from, to) ไหม — รองรับช่วงข้ามเที่ยงคืน (from > to) */
function inQuietWindow(now: Date, from: string, to: string): boolean {
  const t = bkkParts(now);
  const cur = t.h * 60 + t.mi;
  const f = parseHM(from);
  const g = parseHM(to);
  const fm = f.h * 60 + f.m;
  const tm = g.h * 60 + g.m;
  if (fm === tm) return false;
  if (fm < tm) return cur >= fm && cur < tm;
  return cur >= fm || cur < tm;
}

/** เวลาที่ควรเลื่อนไปส่ง เมื่อโดนกันด้วย quiet hours ("to" ของวันนี้ ถ้ายังไม่ถึง / ของพรุ่งนี้ ถ้าผ่านไปแล้ว) */
function nextQuietEnd(now: Date, to: string): Date {
  const t = bkkParts(now);
  const g = parseHM(to);
  const cur = t.h * 60 + t.mi;
  const tm = g.h * 60 + g.m;
  const dayOffset = cur < tm ? 0 : 1;
  return bkkAt(now, g.h, g.m, dayOffset);
}

/** รอบ digest ถัดไป (ชั่วโมงนี้ผ่านไปแล้ว = พรุ่งนี้) */
function nextDigestTime(now: Date, hour: number): Date {
  const t = bkkParts(now);
  return t.h < hour ? bkkAt(now, hour, 0, 0) : bkkAt(now, hour, 0, 1);
}

function monthRangeBkk(now: Date): { start: Date; end: Date } {
  const t = bkkParts(now);
  return {
    start: new Date(Date.UTC(t.y, t.mo, 1, -7, 0, 0)),
    end: new Date(Date.UTC(t.y, t.mo + 1, 1, -7, 0, 0)),
  };
}

// ───────────────────────── settings ─────────────────────────

function requireSettingsPerm(actor: MemberActor, what: string): void {
  if (!hasMemberPerm(actor, "member.settings.manage")) {
    throw new MemberForbiddenError(`บัญชีของคุณยังไม่ได้รับสิทธิ์${what} — ขอสิทธิ์ "ตั้งค่าระบบสมาชิก" จากเจ้าของร้านก่อน`);
  }
}

/** ตัวแก้ไข (patch) ของเทมเพลตหนึ่งเหตุการณ์ — ยอมรับ partial ได้ลึกถึงระดับช่องทางเดียว */
type TemplatePatch = {
  enabled?: boolean;
  timing?: string;
  digestHour?: number;
  leadDays?: number[];
  channels?: Partial<Record<NotifChannel, Partial<NotifChannelConfig>>>;
};
/** ตัวแก้ไขทั้งก้อนของการตั้งค่า — รูปร่างเดียวกับที่เก็บจริงใน `AppSystem.settings.member.notifications` (JSON ที่ไม่รู้ทรงล่วงหน้า) */
type SettingsPatch = {
  templates?: Partial<Record<string, TemplatePatch>>;
  quietHours?: Partial<NotifQuietHours>;
  respectConsent?: boolean;
  transactionalOverride?: boolean;
};

function isNotifChannel(x: string): x is NotifChannel {
  return (NOTIF_CHANNELS as readonly string[]).includes(x);
}

function isNotifTiming(x: string): x is "IMMEDIATE" | "DAILY_DIGEST" {
  return (NOTIF_TIMINGS as readonly string[]).includes(x);
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function readNotifSettings(raw: unknown): SettingsPatch | null {
  const root = asRecord(raw);
  const member = root ? asRecord(root.member) : null;
  const notif = member ? asRecord(member.notifications) : null;
  return notif ? (notif as SettingsPatch) : null;
}

function mergeChannel(base: NotifChannelConfig, patch: Partial<NotifChannelConfig> | undefined): NotifChannelConfig {
  if (!patch) return { ...base };
  return {
    enabled: typeof patch.enabled === "boolean" ? patch.enabled : base.enabled,
    body: typeof patch.body === "string" ? patch.body : base.body,
    ...(base.subject !== undefined || patch.subject !== undefined
      ? { subject: typeof patch.subject === "string" ? patch.subject : base.subject }
      : {}),
    ...(base.title !== undefined || patch.title !== undefined ? { title: typeof patch.title === "string" ? patch.title : base.title } : {}),
  };
}

function mergeTemplate(base: NotifTemplateConfig, patch: TemplatePatch | undefined): NotifTemplateConfig {
  if (!patch) return base;
  const channels = { ...base.channels };
  if (patch.channels) {
    for (const ch of NOTIF_CHANNELS) {
      const p = patch.channels[ch];
      if (p) channels[ch] = mergeChannel(base.channels[ch], p);
    }
  }
  const timing = patch.timing === "IMMEDIATE" || patch.timing === "DAILY_DIGEST" ? patch.timing : base.timing;
  return {
    enabled: typeof patch.enabled === "boolean" ? patch.enabled : base.enabled,
    timing,
    digestHour: typeof patch.digestHour === "number" ? patch.digestHour : base.digestHour,
    ...(base.leadDays || patch.leadDays ? { leadDays: patch.leadDays ?? base.leadDays } : {}),
    channels,
  };
}

function mergeSettings(base: NotificationSettingsValue, patch: SettingsPatch | null): NotificationSettingsValue {
  if (!patch) return base;
  const templates = { ...base.templates };
  if (patch.templates) {
    for (const key of Object.keys(base.templates)) {
      const p = patch.templates[key];
      if (p) templates[key] = mergeTemplate(base.templates[key], p);
    }
  }
  return {
    templates,
    quietHours: patch.quietHours ? { ...base.quietHours, ...patch.quietHours } : base.quietHours,
    respectConsent: typeof patch.respectConsent === "boolean" ? patch.respectConsent : base.respectConsent,
    transactionalOverride: typeof patch.transactionalOverride === "boolean" ? patch.transactionalOverride : base.transactionalOverride,
  };
}

async function loadSettingsValue(ctx: MemberCtx): Promise<NotificationSettingsValue> {
  const sys = await prisma.appSystem.findUnique({ where: { id: ctx.systemId }, select: { settings: true } });
  const patch = readNotifSettings(sys?.settings ?? null);
  return mergeSettings(defaultNotificationSettings(), patch);
}

async function saveSettingsValue(ctx: MemberCtx, next: NotificationSettingsValue): Promise<void> {
  const sys = await prisma.appSystem.findUnique({ where: { id: ctx.systemId }, select: { settings: true } });
  const settings = asRecord(sys?.settings) ?? {};
  const member = asRecord(settings.member) ?? {};
  const nextSettings = { ...settings, member: { ...member, notifications: next } };
  await prisma.appSystem.update({ where: { id: ctx.systemId }, data: { settings: nextSettings as Prisma.InputJsonValue } });
}

/** ค่าตั้งค่าการแจ้งเตือนของระบบนี้ (รวม `smsAvailable` ที่คำนวณสด) */
export async function getNotificationSettings(ctx: MemberCtx): Promise<NotificationSettingsView> {
  const value = await loadSettingsValue(ctx);
  return { ...value, smsAvailable: getSmsProvider() !== null };
}

export type SetTemplatePatch = {
  enabled?: boolean;
  timing?: string;
  digestHour?: number;
  leadDays?: number[];
  channels?: Partial<Record<NotifChannel, Partial<NotifChannelConfig>>>;
};

/** แก้เทมเพลตของเหตุการณ์หนึ่ง — ตรวจ key/timing/digestHour/ตัวแปรก่อนบันทึกเสมอ */
export async function setTemplate(ctx: MemberCtx, actor: MemberActor, key: string, patch: SetTemplatePatch): Promise<NotifTemplateConfig> {
  requireSettingsPerm(actor, "แก้เทมเพลตแจ้งเตือน");
  const evDef = getNotifEvent(key);
  if (!evDef) throw new MemberInputError(`ไม่รู้จักเหตุการณ์แจ้งเตือน "${key}" — เลือกจากทะเบียนที่มีอยู่เท่านั้น`);
  if (patch.timing !== undefined && !isNotifTiming(patch.timing)) {
    throw new MemberInputError(`ไม่รู้จักรูปแบบเวลาส่ง "${patch.timing}" — ใช้ได้เฉพาะ ${NOTIF_TIMINGS.join(" หรือ ")}`);
  }
  if (patch.digestHour !== undefined && (!Number.isInteger(patch.digestHour) || patch.digestHour < 0 || patch.digestHour > 23)) {
    throw new MemberInputError("ชั่วโมงที่ส่งสรุปรวมต้องเป็นจำนวนเต็ม 0-23");
  }
  if (patch.channels) {
    for (const [ch, cfg] of Object.entries(patch.channels)) {
      if (!isNotifChannel(ch)) throw new MemberInputError(`ไม่รู้จักช่องทาง "${ch}"`);
      for (const field of ["body", "subject", "title"] as const) {
        const text = cfg?.[field];
        if (typeof text !== "string") continue;
        for (const token of varsUsedIn(text)) {
          if (!evDef.vars.includes(token)) {
            throw new MemberInputError(`ไม่รู้จักตัวแปร {${token}} ในข้อความของเหตุการณ์ "${evDef.label}" — ใช้ได้เฉพาะ ${evDef.vars.map((v) => `{${v}}`).join(" ")}`);
          }
        }
      }
    }
  }
  const settings = await loadSettingsValue(ctx);
  const nextTemplate = mergeTemplate(settings.templates[key], patch);
  const nextSettings: NotificationSettingsValue = { ...settings, templates: { ...settings.templates, [key]: nextTemplate } };
  await saveSettingsValue(ctx, nextSettings);
  return nextTemplate;
}

export type SetNotificationSettingsPatch = {
  quietHours?: Partial<NotifQuietHours>;
  respectConsent?: boolean;
  transactionalOverride?: boolean;
};

/** แก้สวิตช์ระดับระบบ (quiet hours / เคารพความยินยอม / ยกเว้น transactional) */
export async function setNotificationSettings(ctx: MemberCtx, actor: MemberActor, patch: SetNotificationSettingsPatch): Promise<NotificationSettingsView> {
  requireSettingsPerm(actor, "แก้ตั้งค่าการแจ้งเตือน");
  if (patch.quietHours?.from !== undefined && !/^\d{2}:\d{2}$/.test(patch.quietHours.from)) {
    throw new MemberInputError('รูปแบบเวลาต้องเป็น "HH:MM" เช่น 21:00');
  }
  if (patch.quietHours?.to !== undefined && !/^\d{2}:\d{2}$/.test(patch.quietHours.to)) {
    throw new MemberInputError('รูปแบบเวลาต้องเป็น "HH:MM" เช่น 08:00');
  }
  const settings = await loadSettingsValue(ctx);
  const nextSettings = mergeSettings(settings, patch);
  await saveSettingsValue(ctx, nextSettings);
  return { ...nextSettings, smsAvailable: getSmsProvider() !== null };
}

// ───────────────────────── ตัวแปร / render ─────────────────────────

export { renderTemplate };

/** ตัวแปรพื้นฐานของสมาชิกคนหนึ่ง + ค่าที่ผู้เรียกส่งมาเพิ่ม (extra ทับค่าปริยายได้) */
export async function buildVars(ctx: MemberCtx, customerId: string, extra?: Record<string, string | number>): Promise<Record<string, string | number>> {
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, tenantId: ctx.tenantId },
    select: { firstName: true, name: true, tierDefId: true, homeUnitId: true },
  });
  const [tenant, tierDef, unit, points, origin] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: ctx.tenantId }, select: { name: true, slug: true } }),
    customer?.tierDefId
      ? prisma.memberTierDef.findFirst({ where: { id: customer.tierDefId, tenantId: ctx.tenantId }, select: { name: true } })
      : Promise.resolve(null),
    customer?.homeUnitId
      ? prisma.businessUnit.findUnique({ where: { id: customer.homeUnitId }, select: { name: true } })
      : Promise.resolve(null),
    pointsOfMany(ctx, [customerId]),
    publicOrigin(),
  ]);
  const walletUrl = `${origin.replace(/\/$/, "")}/m/${tenant?.slug ?? ""}/wallet`;
  return {
    ชื่อ: customer?.firstName || customer?.name || "สมาชิก",
    ร้าน: tenant?.name ?? "",
    ระดับ: tierDef?.name ?? "สมาชิกทั่วไป",
    แต้ม: points[customerId] ?? 0,
    ลิงก์กระเป๋า: walletUrl,
    สาขา: unit?.name ?? "",
    ...(extra ?? {}),
  };
}

// ───────────────────────── ปลายทาง / เหตุผลที่ไม่มีช่องทาง ─────────────────────────

const NO_CHANNEL_REASON: Record<NotifChannel, string> = {
  LINE: "ไม่มีช่องทาง — สมาชิกยังไม่ได้ผูกบัญชีไลน์",
  EMAIL: "ไม่มีช่องทาง — สมาชิกยังไม่มีอีเมลในโปรไฟล์",
  SMS: "ไม่มีช่องทาง — สมาชิกยังไม่มีเบอร์โทรในโปรไฟล์",
  PUSH: "ไม่มีช่องทาง — สมาชิกยังไม่ได้ลงทะเบียนอุปกรณ์รับการแจ้งเตือนในแอป",
};

const CHANNEL_LABEL: Record<NotifChannel, string> = { LINE: "ไลน์", EMAIL: "อีเมล", SMS: "เอสเอ็มเอส", PUSH: "แจ้งเตือนในแอป" };

async function destinationsOf(ctx: MemberCtx, customerId: string): Promise<Record<NotifChannel, string>> {
  const [customer, identity, devices] = await Promise.all([
    prisma.customer.findFirst({ where: { id: customerId, tenantId: ctx.tenantId }, select: { email: true, phone: true } }),
    prisma.memberChannelIdentity.findFirst({ where: { tenantId: ctx.tenantId, customerId, channel: "LINE" }, orderBy: { linkedAt: "desc" } }),
    prisma.memberPushDevice.findMany({ where: { tenantId: ctx.tenantId, customerId }, select: { token: true } }),
  ]);
  return {
    LINE: identity?.externalId ?? "",
    EMAIL: customer?.email ?? "",
    SMS: customer?.phone ?? "",
    PUSH: devices.map((d) => d.token).join(","),
  };
}

/** ผู้ยินยอมของช่องทางนี้จริงไหม (null/ไม่เคยตั้ง = ยังไม่ยินยอม) */
async function consentMapOf(ctx: MemberCtx, customerId: string): Promise<Map<string, boolean>> {
  const rows = await getConsents(ctx, customerId);
  return new Map(rows.map((r) => [r.channel, r.granted === true]));
}

// ───────────────────────── ตัวส่งปริยาย (EMAIL/SMS/PUSH ไม่ข้าม F2 — LINE ต้องฉีดจาก composition root) ─────────────────────────

async function defaultSend(channel: NotifChannel, req: NotificationSendRequest): Promise<{ ok: boolean; error?: string }> {
  if (channel === "EMAIL") {
    try {
      const { sendEmail } = await import("@/lib/core/email");
      await sendEmail(req.to, req.subject ?? "ข่าวสารจากร้าน", req.body);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message.slice(0, 200) : "ส่งอีเมลไม่สำเร็จ" };
    }
  }
  if (channel === "SMS") {
    const r = await sendSms({ to: req.to, text: req.body });
    return r.ok ? { ok: true } : { ok: false, error: r.error };
  }
  if (channel === "PUSH") {
    const r = await sendPushToCustomerTokens(req.tenantId, req.to.split(",").filter(Boolean), { title: req.title ?? "ข่าวสารจากร้าน", body: req.body });
    return r.sent > 0 ? { ok: true } : { ok: false, error: r.failures[0] ?? "ส่งแจ้งเตือนไม่ถึงเครื่องของลูกค้า" };
  }
  // LINE — ยังไม่มีตัวส่งปริยายในไฟล์นี้ (ข้าม F2) ต้องฉีดจาก composition root
  return { ok: false, error: "ยังไม่ได้ตั้งค่าตัวส่งของช่องทางนี้ — ต่อสายที่ composition root ก่อน" };
}

async function resolveSend(channel: NotifChannel, deps: NotificationDeps | undefined, req: NotificationSendRequest): Promise<{ ok: boolean; error?: string }> {
  const fn = deps?.[depsKeyOf(channel)];
  if (fn) {
    try {
      return await fn(req);
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message.slice(0, 200) : "ส่งไม่สำเร็จ" };
    }
  }
  return defaultSend(channel, req);
}

// ───────────────────────── send ─────────────────────────

export type SendInput = { event: string; customerId: string; vars?: Record<string, string | number>; refId?: string };
export type SendOptions = { now?: Date; deps?: NotificationDeps };
export type SendResultItem = { channel: NotifChannel; status: "SENT" | "FAILED" | "SKIPPED" | "QUEUED"; reason?: string; notificationId: string };
export type SendResult = { results: SendResultItem[] };

/**
 * ส่งแจ้งเตือน 1 เหตุการณ์ให้สมาชิก 1 คน — วนทุกช่องทางที่เปิดใช้ (channels[ch].enabled)
 * ลำดับด่าน: (1) ไม่มีปลายทาง (2) SMS ไม่มี provider (3) ไม่ยินยอม (4) เทมเพลตปิดทั้งเหตุการณ์
 * (5) digest → คิว (6) quiet hours → คิว (7) ส่งจริงผ่าน deps/ตัวส่งปริยาย — ทุกผลบันทึก 1 แถว/ช่องทาง
 */
export async function send(ctx: MemberCtx, input: SendInput, opts: SendOptions = {}): Promise<SendResult> {
  const evDef = getNotifEvent(input.event);
  if (!evDef) throw new MemberInputError(`ไม่รู้จักเหตุการณ์แจ้งเตือน "${input.event}"`);
  const customer = await prisma.customer.findFirst({ where: { id: input.customerId, tenantId: ctx.tenantId }, select: { id: true } });
  if (!customer) throw new MemberNotFoundError();

  const now = opts.now ?? new Date();
  const settings = await getNotificationSettings(ctx);
  const tpl = settings.templates[evDef.key];
  const [vars, destinations, consents] = await Promise.all([
    buildVars(ctx, input.customerId, input.vars),
    destinationsOf(ctx, input.customerId),
    consentMapOf(ctx, input.customerId),
  ]);

  const results: SendResultItem[] = [];
  for (const ch of NOTIF_CHANNELS) {
    const chCfg = tpl.channels[ch];
    if (!chCfg?.enabled) continue; // ช่องทางนี้ถูกปิดไว้ทั้งหมด — ไม่นับเป็นความพยายามส่ง ไม่มีแถว

    const body = renderTemplate(chCfg.body, vars);
    const subject = ch === "EMAIL" ? renderTemplate(chCfg.subject ?? "", vars) : undefined;
    const title = ch === "PUSH" ? renderTemplate(chCfg.title ?? "", vars) : undefined;
    const to = destinations[ch];

    let status: SendResultItem["status"] = "SENT";
    let reason: string | undefined;
    let scheduledAt: Date | null = null;
    let sentAt: Date | null = null;

    if (!to.trim()) {
      status = "SKIPPED";
      reason = NO_CHANNEL_REASON[ch];
    } else if (ch === "SMS" && !opts.deps?.sms && !getSmsProvider()) {
      status = "SKIPPED";
      reason = "ยังไม่มีผู้ให้บริการ SMS — เชื่อมต่อเกตเวย์ก่อนจึงจะส่งได้";
    } else if (settings.respectConsent && consents.get(ch) !== true && !(evDef.transactional && settings.transactionalOverride)) {
      status = "SKIPPED";
      reason = `ลูกค้ายังไม่ได้ยินยอมรับข่าวสารทาง${CHANNEL_LABEL[ch]}`;
    } else if (!tpl.enabled) {
      status = "SKIPPED";
      reason = "เทมเพลตนี้ปิดใช้งานอยู่";
    } else if (tpl.timing === "DAILY_DIGEST") {
      status = "QUEUED";
      scheduledAt = nextDigestTime(now, tpl.digestHour ?? 9);
    } else if (settings.quietHours.enabled && inQuietWindow(now, settings.quietHours.from, settings.quietHours.to)) {
      status = "QUEUED";
      scheduledAt = nextQuietEnd(now, settings.quietHours.to);
    } else {
      const r = await resolveSend(ch, opts.deps, { tenantId: ctx.tenantId, customerId: input.customerId, channel: ch, to, subject, title, body });
      status = r.ok ? "SENT" : "FAILED";
      reason = r.ok ? undefined : (r.error ?? "ส่งไม่สำเร็จ");
      sentAt = r.ok ? now : null;
    }

    const row = await prisma.memberNotification.create({
      data: {
        tenantId: ctx.tenantId,
        systemId: ctx.systemId,
        customerId: input.customerId,
        event: evDef.key,
        channel: ch,
        status,
        scheduledAt,
        sentAt,
        subject,
        body,
        reason,
        // refId ติดตามความพยายามส่งของ "ครั้งนี้" — แถว SKIPPED (ไม่มีช่องทาง/ไม่ยินยอม/ปิดเทมเพลต)
        // ไม่ใช่ความพยายามส่งจริง จึงไม่ผูก refId (ผู้เรียกที่กรองผลลัพธ์ตาม refId ของช่องทางหนึ่งจะไม่ปนกับ
        // ช่องทางอื่นที่แค่ "ไม่มีทางส่ง" ของ event เดียวกัน)
        ...(status === "SKIPPED" ? {} : { refId: input.refId }),
      },
    });
    results.push({ channel: ch, status, ...(reason ? { reason } : {}), notificationId: row.id });
  }
  return { results };
}

// ───────────────────────── runDue (digest / เลื่อนจาก quiet hours) ─────────────────────────

export type RunDueResult = { sent: number; failed: number; digested: number };

/** ประมวลผลแถว QUEUED ที่ถึงกำหนดแล้ว — รวม digest ต่อ (customerId, channel) หรือส่งเดี่ยวถ้าเป็นแค่เลื่อนจาก quiet hours */
export async function runDue(ctx: MemberCtx, opts: { now?: Date; deps?: NotificationDeps } = {}): Promise<RunDueResult> {
  const now = opts.now ?? new Date();
  const due = await prisma.memberNotification.findMany({
    where: { systemId: ctx.systemId, status: "QUEUED", scheduledAt: { lte: now } },
    orderBy: { createdAt: "asc" },
  });
  if (due.length === 0) return { sent: 0, failed: 0, digested: 0 };

  const settings = await getNotificationSettings(ctx);
  const groups = new Map<string, typeof due>();
  for (const row of due) {
    const k = `${row.customerId}::${row.channel}`;
    const arr = groups.get(k) ?? [];
    arr.push(row);
    groups.set(k, arr);
  }

  let sent = 0;
  let failed = 0;
  let digested = 0;

  for (const [key, rows] of groups) {
    const [customerId, channelRaw] = key.split("::");
    const channel = channelRaw as NotifChannel;
    const isDigest = rows.length > 1 || rows.some((r) => (settings.templates[r.event]?.timing ?? "IMMEDIATE") === "DAILY_DIGEST");
    const destinations = await destinationsOf(ctx, customerId);
    const to = destinations[channel];

    if (!isDigest) {
      const row = rows[0];
      if (!to.trim()) {
        await prisma.memberNotification.update({ where: { id: row.id }, data: { status: "SKIPPED", reason: NO_CHANNEL_REASON[channel] } });
        continue;
      }
      const r = await resolveSend(channel, opts.deps, {
        tenantId: ctx.tenantId,
        customerId,
        channel,
        to,
        body: row.body,
        subject: row.subject ?? undefined,
      });
      await prisma.memberNotification.update({
        where: { id: row.id },
        data: r.ok ? { status: "SENT", sentAt: now } : { status: "FAILED", reason: (r.error ?? "ส่งไม่สำเร็จ").slice(0, 500) },
      });
      if (r.ok) sent += 1;
      else failed += 1;
      continue;
    }

    // digest — รวมทุกแถวของ (customerId, channel) เป็นข้อความเดียว
    const vars = await buildVars(ctx, customerId, {});
    const header = renderTemplate("สรุปวันนี้จาก {ร้าน}", vars);
    const body = [header, ...rows.map((r) => r.body)].join("\n");
    const subject = renderTemplate("สรุปการแจ้งเตือนวันนี้จาก {ร้าน}", vars);
    let digestStatus: "SENT" | "FAILED" = "SENT";
    let digestReason: string | undefined;
    if (!to.trim()) {
      digestStatus = "FAILED";
      digestReason = NO_CHANNEL_REASON[channel];
      failed += 1;
    } else {
      const r = await resolveSend(channel, opts.deps, { tenantId: ctx.tenantId, customerId, channel, to, body, subject });
      digestStatus = r.ok ? "SENT" : "FAILED";
      digestReason = r.ok ? undefined : (r.error ?? "ส่งไม่สำเร็จ");
      if (r.ok) sent += 1;
      else failed += 1;
    }
    const digestRow = await prisma.memberNotification.create({
      data: {
        tenantId: ctx.tenantId,
        systemId: ctx.systemId,
        customerId,
        event: "DIGEST",
        channel,
        status: digestStatus,
        sentAt: digestStatus === "SENT" ? now : null,
        subject,
        body,
        reason: digestReason,
      },
    });
    await prisma.memberNotification.updateMany({
      where: { id: { in: rows.map((r) => r.id) } },
      data: { status: "DIGESTED", digestOfId: digestRow.id },
    });
    digested += rows.length;
  }

  return { sent, failed, digested };
}

// ───────────────────────── stats ─────────────────────────

export type NotificationStats = {
  sent: number;
  failed: number;
  skipped: number;
  queued: number;
  byChannel: Record<NotifChannel, number>;
  byEvent: Record<string, number>;
};

/** สถิติเดือนไทยนี้ (หรือเดือนที่ระบุ) — sent/byChannel/byEvent นับเฉพาะแถว SENT (รวมแถว DIGEST) */
export async function stats(ctx: MemberCtx, actor: MemberActor, opts: { month?: Date } = {}): Promise<NotificationStats> {
  requireSettingsPerm(actor, "ดูสถิติการแจ้งเตือน");
  const { start, end } = monthRangeBkk(opts.month ?? new Date());
  const rows = await prisma.memberNotification.groupBy({
    by: ["status", "channel", "event"],
    where: { systemId: ctx.systemId, createdAt: { gte: start, lt: end } },
    _count: { _all: true },
  });
  const out: NotificationStats = {
    sent: 0,
    failed: 0,
    skipped: 0,
    queued: 0,
    byChannel: { LINE: 0, EMAIL: 0, SMS: 0, PUSH: 0 },
    byEvent: {},
  };
  for (const r of rows) {
    const n = r._count._all;
    if (r.status === "SENT") {
      out.sent += n;
      out.byChannel[r.channel as NotifChannel] = (out.byChannel[r.channel as NotifChannel] ?? 0) + n;
      out.byEvent[r.event] = (out.byEvent[r.event] ?? 0) + n;
    } else if (r.status === "FAILED") out.failed += n;
    else if (r.status === "SKIPPED") out.skipped += n;
    else if (r.status === "QUEUED") out.queued += n;
  }
  return out;
}

// ───────────────────────── testSend ─────────────────────────

const SAMPLE_EXTRA: Record<string, Record<string, string | number>> = {
  VOUCHER_NEW: { voucher: "ส่วนลด 100 บาท" },
  POINTS_EXPIRING: { แต้มที่จะหมด: 400, วันหมดอายุ: "10 ต.ค. 2569" },
};

async function selfDestination(actor: MemberActor, channel: NotifChannel): Promise<string> {
  if (channel === "EMAIL") {
    const u = await prisma.user.findUnique({ where: { id: actor.userId }, select: { email: true } });
    return u?.email ?? "";
  }
  return ""; // LINE/SMS/PUSH ของพนักงานยังไม่มีทางผูกในหน้าจอวันนี้
}

export type TestSendResult = { preview: { subject?: string; body: string }; result: { ok: boolean; error?: string } };

/** ทดสอบส่งหาตัวเอง — ไม่เช็คยินยอม/quiet hours/สวิตช์เปิดปิด (ตั้งใจ preview ทันที) ไม่เขียนแถวลง MemberNotification */
export async function testSend(ctx: MemberCtx, actor: MemberActor, key: string, channel: string, opts: { deps?: NotificationDeps } = {}): Promise<TestSendResult> {
  requireSettingsPerm(actor, "ทดสอบส่งการแจ้งเตือน");
  const evDef = getNotifEvent(key);
  if (!evDef) throw new MemberInputError(`ไม่รู้จักเหตุการณ์แจ้งเตือน "${key}"`);
  if (!isNotifChannel(channel)) throw new MemberInputError(`ไม่รู้จักช่องทาง "${channel}"`);
  const ch = channel;

  const settings = await getNotificationSettings(ctx);
  const tpl = settings.templates[key];
  const chCfg = tpl.channels[ch];
  const [tenant, origin] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: ctx.tenantId }, select: { name: true, slug: true } }),
    publicOrigin(),
  ]);
  const vars: Record<string, string | number> = {
    ชื่อ: "สมชาย",
    ร้าน: tenant?.name ?? "",
    ระดับ: "Gold",
    แต้ม: 1200,
    ลิงก์กระเป๋า: `${origin.replace(/\/$/, "")}/m/${tenant?.slug ?? ""}/wallet`,
    สาขา: "สาขาหลัก",
    ...(SAMPLE_EXTRA[key] ?? {}),
  };
  const body = renderTemplate(chCfg.body, vars);
  const subject = ch === "EMAIL" ? renderTemplate(chCfg.subject ?? "", vars) : undefined;
  const title = ch === "PUSH" ? renderTemplate(chCfg.title ?? "", vars) : undefined;

  const to = await selfDestination(actor, ch);
  const result = !to.trim()
    ? { ok: false, error: `บัญชีของคุณยังไม่มีช่องทาง${CHANNEL_LABEL[ch]}ให้ทดสอบส่ง` }
    : await resolveSend(ch, opts.deps, { tenantId: ctx.tenantId, customerId: actor.customerId ?? "", channel: ch, to, subject, title, body });

  return { preview: { ...(subject ? { subject } : {}), body }, result };
}
