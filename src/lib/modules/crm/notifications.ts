// notifications.ts — เอนจิน "แจ้งเตือนพนักงาน" ของ CRM v2 (ใบ C2.10 · พิมพ์เขียว §7.4 · มติ C22 · R-E.12 · R-C.1)
//
// ของที่ไฟล์นี้เป็นเจ้าของ
//   • `notifyStaff`  — ส่งเรื่องหนึ่งถึงพนักงานหลายคน: ในแอป (`AppNotification` รายผู้รับ) · push · อีเมล
//   • `runFanout`    — รอบกวาดรายชั่วโมงของ "ของที่เลื่อนไว้เพราะ quiet hours" (ประทับ `emailedAt` = การจอง)
//   • ตั้งค่าของร้าน (`settings.crm.notifications` ผ่านตัวเขียน jsonb คำสั่งเดียวของ `./settings.ts`)
//     + ค่าของแต่ละคน (`CrmUserPref` — ตารางของ C2.0 ไม่มีของใหม่ · R-C.1)
//   • ทะเบียนเทมเพลต/ช่องทาง/ตัวตรวจค่า อยู่ที่ `./notifications-shared.ts` (บริสุทธิ์)
//
// 🔴 AUDIT-CLASS X1 (ขอบเขต + การมองเห็น): ผู้รับถูก **กรอง** ไม่ใช่เชื่อ — ไม่ใช่พนักงานของร้านนี้แล้ว ·
//    ไม่มีคีย์อ่านของชนิดนั้น · หรือเปิดระเบียนนั้นไม่ได้ตาม `visibleWhere` ⇒ เงียบ ไม่มีใบ ไม่มี push
//    (ผู้เรียกบางตัวเป็นงานเบื้องหลังที่รวบ userIds มาจากเจ้าของ/หัวหน้าทีม — ห้ามให้ "รายชื่อ" เป็นด่านสุดท้าย)
// 🔴 AUDIT-CLASS X4 (ยิงซ้ำ/ยิงพร้อมกัน): กันซ้ำต่อ (ผู้รับ · เทมเพลต · ชนิดระเบียน · รหัสระเบียน · วันไทย)
//    ใต้ advisory lock ของคู่นั้น ⇒ event ที่ถูกส่งซ้ำ/ยิงขนานกัน 3 ทางก็ได้ใบเดียวและ push ครั้งเดียว
//    (ตาราง `AppNotification` เป็นของกลางทั้งแพลตฟอร์ม ไม่มีคอลัมน์คีย์ให้ใช้ และใบนี้ห้ามเพิ่มคอลัมน์ · R-C.1
//     ⇒ ธงคือ "ลิงก์ลึก + วันไทย + รหัสระเบียน" ในเนื้อความ แบบเดียวกับที่ `kanban/digest.ts` ใช้ลิงก์เป็นตัวเลือกของรอบกวาด)
// 🔴 AUDIT-CLASS X8 (PDPA): เนื้อความ/payload = รหัส + ลิงก์ + จำนวน เท่านั้น — ไม่มีชื่อ เบอร์ อีเมลของลูกค้า
//    ตัวส่งจริงมาจาก `deps` ที่ผู้เรียกฉีด (แพตเทิร์น `SequenceDeps` ของ C2.2) — ไฟล์นี้ไม่รู้จักปลายทางของใคร
// 🔴 quiet hours **เลื่อน ไม่ใช่ทิ้ง**: ใบในแอปเขียนทันที (กล่องจดหมายเป็นช่องทางที่ไม่ส่งเสียง) ส่วน push/อีเมล
//    ถูกข้ามไว้โดยปล่อย `emailedAt = null` แล้ว `runFanout` เก็บส่งหลังพ้นช่วง (จองด้วย conditional update)
// 🔴 เวลาไทยผ่าน `@/lib/core/quiet-hours` เท่านั้น (เอนจินเดียวกับฝั่งสมาชิก) — ห้ามอ่านนาฬิกาเครื่อง
//
// ─── ข้อจำกัดที่ "รู้ตัวและรับไว้" (มติผู้คุมงานรอบแก้ 25 ก.ย. 2569) ───────────────────────────────
// 1) **ใบที่เจ้าตัวปิด "ในแอป" ยังโผล่ในรายการแจ้งเตือน** (มติข้อ 3 — B1 · รับเป็นข้อจำกัด)
//    ใบนั้นถูกเขียนด้วย `readAt = now` (อ่านแล้วตั้งแต่เกิด) เพราะมันเป็น **ตัวถือคิว** ของช่องทางที่ถูกเลื่อน —
//    แต่ `listNotifications` ของแพลตฟอร์มไม่ได้กรอง `readAt` ⇒ ผู้ใช้ที่ปิด "ในแอป" ยังเห็นใบนั้นในกล่อง (อ่านแล้ว)
//    แก้จริงต้องมีคอลัมน์ ⇒ ใบผู้สมัคร C3.0: `dedupeKey` / `deferredUntil` / `channels` บน `AppNotification` (additive)
// 2) **ตราจองของทางส่งทันทีคือ "หลังส่งสำเร็จ"** (มติข้อ 4 — B2): ระหว่าง "เขียนใบ" กับ "ประทับ `emailedAt`"
//    มีหน้าต่างไม่กี่มิลลิวินาทีที่รอบกวาดรายชั่วโมงอาจจองใบนั้นไปส่งซ้ำได้ — ยอมรับหน้าต่างนี้แลกกับการที่
//    **ของที่ส่งไม่สำเร็จชั่วคราวไม่หาย** (ถ้าประทับก่อนส่ง ล้มแล้วคือหายถาวร) · ปิดหน้าต่างนี้ให้สนิทต้องมีคอลัมน์
//    (ใบ C3.0 เดียวกัน) · และเพราะไม่มีคอลัมน์รายช่องทาง การส่งรอบเก็บตกจะส่ง **ทั้ง push และอีเมล** ใหม่
//    แม้ครั้งแรกจะสำเร็จไปแล้วหนึ่งช่องทาง (R-C.1: ใบนี้ห้ามเพิ่มคอลัมน์)
// 3) **สรุปนับได้สูงสุด 1,000 ดีล** (มติข้อ 8(3)): เกินกว่านั้นข้อความบอก "1000+" — สรุปคือจำนวน ไม่ใช่รายงาน
// 4) **รอบเก็บตกมองย้อนหลัง 36 ชม.** (`CRM_FANOUT_LOOKBACK_MS`) — เก่ากว่านั้นถือว่าเลยเวลาบอกไปแล้ว (ไปอ่านในแอปเอา)

import { Prisma } from "@prisma/client";
import { writeAudit } from "@/lib/core/audit";
import { sendPushToUser } from "@/lib/core/push";
import { bkkYmd, inQuietWindow } from "@/lib/core/quiet-hours";
import type { MemberActor } from "@/lib/modules/member";
import { prisma } from "./db";
import { crmCan, crmForbiddenMessage } from "./access";
import { crmNotifSettingsRaw, setCrmNotifSettingsJson, setCrmNotifTemplateJson } from "./settings";
import { crmUiVersion, CrmV2DisabledError } from "./ui-version";
import { canSee, type VisTarget } from "./visibility";
import {
  CRM_FANOUT_LOOKBACK_MS,
  CRM_NOTIF_CHANNELS,
  CRM_NOTIF_LINK_MARK,
  CRM_PUSH_MAX_BYTES,
  crmNotifLink,
  effectiveChannels,
  isCrmNotifChannel,
  isCrmNotifKey,
  parseCrmNotifSettings,
  parseCrmNotifLink,
  parseCrmUserPref,
  renderCrmNotif,
  type CrmNotifChannelMap,
  type CrmNotifKey,
  type CrmNotifQuietHours,
  type CrmNotifSettingsPatch,
  type CrmNotifSettingsView,
  type CrmNotifTemplatePatch,
  type CrmUserPrefPatch,
  type CrmUserPrefView,
} from "./notifications-shared";

export type CrmNotifyCtx = { tenantId: string; systemId: string; actorUserId: string | null };

/** คำขอที่ส่งถึงตัวส่ง push — **รหัสล้วน** (ไม่มีชื่อ/เบอร์/อีเมลของลูกค้า) และต้องเล็กพอที่จะเป็น "กระดิ่ง" */
export type CrmPushRequest = {
  tenantId: string;
  systemId: string;
  userId: string;
  title: string;
  body: string;
  data: { link: string; key: CrmNotifKey };
};

/** คำขอที่ส่งถึงตัวส่งอีเมล — ที่อยู่ปลายทางถูก resolve ที่ตัวส่งจริง (ไฟล์นี้ส่งแต่ `userId`) */
export type CrmEmailRequest = {
  tenantId: string;
  systemId: string;
  userId: string;
  subject: string;
  text: string;
  key: CrmNotifKey;
};

/**
 * ตัวส่งที่ฉีดเข้ามาต่อการเรียก (แพตเทิร์น `SequenceDeps` ของ C2.2) — ข้อสอบ/งานทดสอบไม่เคยแตะปลายทางจริง
 * ไม่ได้ฉีด = ใช้ตัวส่งของแพลตฟอร์ม (`sendPushToUser` ของ core · ตัวส่งอีเมลโหลดแบบ dynamic เมื่อร้านเสียบคีย์แล้ว)
 */
export type CrmNotifyDeps = {
  push?: (req: CrmPushRequest) => Promise<{ ok: boolean }>;
  email?: (req: CrmEmailRequest) => Promise<{ ok: boolean }>;
};

export type CrmNotifyResult = { inApp: number; push: number; email: number; deferred: number };

export type CrmNotifyInput = {
  key: CrmNotifKey | string;
  userIds: string[];
  /** ชนิดของระเบียนที่เรื่องนี้พูดถึง ("CrmDeal" · "CrmContact" · "CrmActivity" · "CrmStaleDeals" …) */
  refType: string;
  refId: string;
  vars?: Record<string, string | number>;
  now?: Date;
};

type NotifCode = "VALIDATION" | "FORBIDDEN" | "NOT_FOUND";

export class CrmNotifyError extends Error {
  readonly code: NotifCode;
  constructor(code: NotifCode, message: string) {
    super(message);
    this.name = "CrmNotifyError";
    this.code = code;
  }
}

const NOT_FOUND_MSG = "ไม่พบระบบ CRM นี้ในร้านที่เปิดอยู่ (อาจถูกลบหรืออยู่คนละร้าน) — รีเฟรชหน้าแล้วลองใหม่";
const TITLE_MAX = 120;
const BODY_MAX = 400;
/** ตัวคั่น "เนื้อความ — ลิงก์" (ความยาวของมันถูกหักออกจากงบเนื้อความ ⇒ ลิงก์ไม่ถูกตัดทุกกรณี · A2) */
const BODY_SEP = " — ";
const FANOUT_BATCH = 500;
const RECIPIENT_MAX = 500;

type Tx = Prisma.TransactionClient;

const lockKey = (tx: Tx, key: string) => tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;

/**
 * 🔴 facade สมาชิกโหลด **ตอนใช้** เท่านั้น (เหมือน `deals.ts`/`companies.ts`): โมดูลบัญชี import facade ของ CRM
 *    (account→crm) ⇒ import สมาชิกที่หัวไฟล์ที่อยู่ในกราฟของ `crm/index.ts` ทำให้เกิดวงโหลดและ TDZ
 *    ("Cannot access 'CRM_OPS' before initialization" ตอนตัวสร้างเอกสาร/สคริปต์โหลดทะเบียน REST)
 */
const memberFacade = () => import("@/lib/modules/member");

/** คีย์อ่านที่ผู้รับต้องถือ เพื่อจะ "มีสิทธิ์รู้" เรื่องของระเบียนชนิดนี้ (AUDIT-CLASS X1) */
function readKeyOf(refType: string): string {
  if (refType === "CrmContact") return "crm.contact.read";
  if (refType === "CrmCompany") return "crm.company.read";
  if (refType === "CrmActivity") return "crm.activity.read";
  if (refType === "CustomRecord") return "crm.record.read";
  return "crm.deal.read";
}

/** ชนิดที่ต้องตรวจ "เห็นแถวนี้ไหม" — `null` = เรื่องระดับระบบ (สรุปรายวัน) ที่ผู้เรียกกรองรายแถวมาแล้ว */
function visTargetOf(refType: string): VisTarget | null {
  if (refType === "CrmDeal") return "DEAL";
  if (refType === "CrmContact") return "CONTACT";
  if (refType === "CrmCompany") return "COMPANY";
  if (refType === "CrmActivity") return "ACTIVITY";
  if (refType === "CustomRecord") return "RECORD";
  return null;
}

type SysRow = { id: string; tenantId: string; settings: unknown };

/** ระบบ CRM ของ ctx (ร้านนี้ · ชนิด CRM) — `null` = ไม่พบ */
async function loadSystem(ctx: { tenantId: string; systemId: string }): Promise<SysRow | null> {
  if (!ctx?.tenantId || !ctx?.systemId) return null;
  return prisma.appSystem.findFirst({
    where: { id: ctx.systemId, tenantId: ctx.tenantId, type: "CRM" },
    select: { id: true, tenantId: true, settings: true },
  });
}

async function requireSystem(ctx: { tenantId: string; systemId: string }): Promise<SysRow> {
  const sys = await loadSystem(ctx);
  if (!sys) throw new CrmNotifyError("NOT_FOUND", NOT_FOUND_MSG);
  return sys;
}

/** ด่านของหน้าตั้งค่าร้าน: ระบบของร้าน → uiVersion 2 → คีย์ `crm.settings.manage` (ลำดับเดียวกับทุกบริการของ C1.7) */
async function enterShopSettings(ctx: CrmNotifyCtx, actor: MemberActor | null | undefined): Promise<SysRow> {
  const sys = await requireSystem(ctx);
  if ((await crmUiVersion(ctx)) !== 2) throw new CrmV2DisabledError();
  if (!actor || !crmCan(actor, "crm.settings.manage")) throw new CrmNotifyError("FORBIDDEN", crmForbiddenMessage("crm.settings.manage"));
  return sys;
}

/** ด่านของ "ค่าของฉัน": ระบบของร้าน → uiVersion 2 → เป็นพนักงานของร้านนี้ (ไม่ต้องมีคีย์ · มติ C22) */
async function enterOwnPrefs(ctx: CrmNotifyCtx, actor: MemberActor | null | undefined): Promise<string> {
  await requireSystem(ctx);
  if ((await crmUiVersion(ctx)) !== 2) throw new CrmV2DisabledError();
  const userId = actor?.userId ?? ctx.actorUserId ?? "";
  if (!userId) throw new CrmNotifyError("FORBIDDEN", "ต้องเข้าสู่ระบบก่อนจึงจะตั้งค่าการแจ้งเตือนของตัวเองได้");
  return userId;
}

function settingsViewOf(sys: SysRow): CrmNotifSettingsView {
  return parseCrmNotifSettings(crmNotifSettingsRaw(sys.settings));
}

async function prefsOf(systemId: string, userId: string): Promise<CrmUserPrefView> {
  const row = await prisma.crmUserPref.findFirst({ where: { systemId, userId }, select: { notifications: true, quietHours: true } });
  return parseCrmUserPref(row?.notifications, row?.quietHours);
}

/** ช่วงห้ามรบกวนที่มีผลกับคนนี้ — **ของเจ้าตัวชนะของร้าน** เมื่อเขาตั้งไว้ (มติ C22 · S3.5) */
function quietFor(shop: CrmNotifQuietHours, mine: CrmNotifQuietHours | null): CrmNotifQuietHours {
  return mine ? mine : shop;
}

type Recipient = {
  userId: string;
  actor: MemberActor;
  channels: CrmNotifChannelMap;
  inQuiet: boolean;
};

/** ผู้รับที่ "มีสิทธิ์รู้เรื่องนี้จริง" (AUDIT-CLASS X1) — คนที่ไม่ผ่านถูกตัดออกเงียบ ๆ */
async function resolveRecipients(
  ctx: CrmNotifyCtx,
  view: CrmNotifSettingsView,
  key: CrmNotifKey,
  refType: string,
  refId: string,
  userIds: string[],
  now: Date,
): Promise<Recipient[]> {
  const ids = [...new Set((userIds ?? []).filter((u) => typeof u === "string" && u))].slice(0, RECIPIENT_MAX);
  if (ids.length === 0) return [];
  const memberships = await prisma.membership.findMany({
    where: { tenantId: ctx.tenantId, userId: { in: ids }, acceptedAt: { not: null } },
    select: { userId: true, role: true, unitAccess: true, permissions: true },
  });
  const tpl = view.templates[key];
  const target = visTargetOf(refType);
  const { toMemberActor } = await memberFacade();
  const out: Recipient[] = [];
  for (const m of memberships) {
    const actor = toMemberActor(m.userId, m);
    if (!crmCan(actor, readKeyOf(refType))) continue;
    if (target && !(await canSee({ tenantId: ctx.tenantId, systemId: ctx.systemId }, actor, target, refId))) continue;
    const mine = await prefsOf(ctx.systemId, m.userId);
    const channels = effectiveChannels(tpl?.channels ?? { IN_APP: true, PUSH: false, EMAIL: false }, mine.notifications[key]);
    const quiet = quietFor(view.quietHours, mine.quietHours);
    out.push({ userId: m.userId, actor, channels, inQuiet: quiet.enabled && inQuietWindow(now, quiet.from, quiet.to) });
  }
  return out;
}

/**
 * ส่งเรื่องหนึ่งถึงพนักงานที่ควรรู้ — **จุดเดียว** ที่ CRM v2 แจ้งเตือนคน
 *
 * ลำดับ: ระบบของร้าน (ไม่พบ/ยังไม่เปิด v2 = เงียบ ไม่ throw — ผู้เรียกส่วนใหญ่เป็นงานเบื้องหลัง) →
 *        กรองผู้รับด้วยสิทธิ์ + การมองเห็น → กันซ้ำต่อ (ผู้รับ, เทมเพลต, ระเบียน, วันไทย) → เขียนใบในแอป →
 *        (นอกทรานแซกชัน) push/อีเมล ถ้าไม่อยู่ในช่วงห้ามรบกวน
 * ⚠️ ต้องเรียกจาก **นอกทรานแซกชัน** เสมอ (push/อีเมลเป็น network call — ขัง pool ถ้าถือล็อกอยู่)
 */
export async function notifyStaff(ctx: CrmNotifyCtx, input: CrmNotifyInput, opts: { deps?: CrmNotifyDeps } = {}): Promise<CrmNotifyResult> {
  const out: CrmNotifyResult = { inApp: 0, push: 0, email: 0, deferred: 0 };
  const key = input?.key;
  if (!isCrmNotifKey(key)) throw new CrmNotifyError("VALIDATION", "ไม่รู้จักเรื่องที่จะแจ้งเตือนนี้ — เลือกจากรายการเรื่องแจ้งเตือนของ CRM");
  const sys = await loadSystem(ctx);
  if (!sys) return out;
  // R-E.14: ระบบที่ยังไม่เปิด CRM v2 = ไม่แจ้งอะไรเลย (แถวข้อมูลคงอยู่ · เดินต่อเมื่อเปิด 2)
  if ((await crmUiVersion(ctx)) !== 2) return out;
  const now = input.now instanceof Date && Number.isFinite(input.now.getTime()) ? input.now : new Date();
  const refType = String(input.refType ?? "");
  const refId = String(input.refId ?? "");
  const view = settingsViewOf(sys);
  const tpl = view.templates[key]!;
  const thaiDay = bkkYmd(now);
  const link = crmNotifLink(ctx.systemId, refType, refId, key, thaiDay);
  const title = renderCrmNotif(tpl.title, input.vars ?? {}).slice(0, TITLE_MAX);
  // 🔴 A2 (มติผู้คุมงานรอบแก้ ข้อ 2): **ตัดเนื้อความ ไม่ใช่ตัดลิงก์** — ลิงก์คือกุญแจกันซ้ำและตัวเลือกของรอบกวาด
  //    ก่อนแก้: ร้านที่พิมพ์เนื้อความยาว 400 ตัวอักษรทำให้ `?n=…&nd=…&r=…` ถูก `slice(0, BODY_MAX)` กินหายไป
  //    ⇒ กันซ้ำพัง (ใบใหม่ทุกครั้ง) และรอบกวาดมองใบนั้นไม่เห็น (ของที่เลื่อนไว้ค้างถาวร)
  const body = `${renderCrmNotif(tpl.body, input.vars ?? {}).slice(0, Math.max(0, BODY_MAX - link.length - BODY_SEP.length))}${BODY_SEP}${link}`;
  const recipients = await resolveRecipients(ctx, view, key, refType, refId, input.userIds ?? [], now);
  // ช่วงที่ "ค้นหา" ใบเดิม — ไม่ใช่กุญแจกันซ้ำ (กุญแจคือลิงก์เต็ม `?n=<เทมเพลต>&nd=<วันไทย>&r=<รหัสระเบียน>`
  // ซึ่งครบทั้งห้าส่วนตั้งแต่รอบแก้ B3) · เอาค่าที่เก่ากว่าระหว่าง
  // นาฬิกาของรอบกับนาฬิกาจริง เพื่อให้งานที่รันย้อนหลัง/ข้อสอบนาฬิกาสมมุติยังค้นเจอใบที่เพิ่งเขียนไป
  const searchFrom = new Date(Math.min(now.getTime(), Date.now()) - 7 * 86_400_000);

  for (const r of recipients) {
    const outbound = r.channels.PUSH || r.channels.EMAIL;
    // ไม่มีช่องทางไหนเปิดเลย = เจ้าตัวปิดเรื่องนี้ทั้งหมด (ไม่ใช่ "ลืมตั้ง") ⇒ ไม่เขียนใบ ไม่ยิงอะไร
    if (!r.channels.IN_APP && !outbound) continue;
    let rowId: string | null = null;
    try {
      rowId = await prisma.$transaction(async (tx) => {
        // AUDIT-CLASS X4: ล็อกต่อ (ผู้รับ, เทมเพลต, ระเบียน, วันไทย) แล้วดูว่ามีใบของวันนี้อยู่แล้วหรือยัง
        await lockKey(tx, `crm:notify:${ctx.tenantId}:${r.userId}:${key}:${refType}:${refId}:${thaiDay}`);
        const already = await tx.appNotification.findFirst({
          where: { tenantId: ctx.tenantId, recipientUserId: r.userId, body: { contains: link }, createdAt: { gte: searchFrom } },
          select: { id: true },
        });
        if (already) return null;
        const made = await tx.appNotification.create({
          data: {
            tenantId: ctx.tenantId,
            recipientUserId: r.userId,
            title,
            body,
            // ปิด "ในแอป" ไว้เอง = ไม่ต้องขึ้นในกล่อง แต่ใบยังเป็นตัวถือคิวของช่องทางที่ถูกเลื่อน (ห้ามทิ้งข่าว)
            readAt: r.channels.IN_APP ? null : now,
            // 🔴 B2 (มติผู้คุมงานรอบแก้ ข้อ 4): `null` = **ยังไม่จบเรื่องนอกแอปของใบนี้** ⇒ `runFanout` เก็บส่งต่อ
            //    ก่อนแก้ ทางส่งทันทีประทับ `emailedAt = now` **ก่อนส่ง** ⇒ push/อีเมลที่ล้มชั่วคราว (เน็ต/ผู้ให้บริการ)
            //    หายถาวรทั้งที่รอบกวาดรายชั่วโมงอยู่ตรงนั้นแล้ว · ตราจึงถูกประทับ **หลังส่งสำเร็จ** ข้างล่าง
            //    (ไม่มีช่องทางนอกแอปเลย = ประทับทันที: ไม่มีอะไรให้เก็บ ไม่ต้องให้รอบกวาดหยิบขึ้นมาดูทุกชั่วโมง)
            emailedAt: outbound ? null : now,
          },
          select: { id: true },
        });
        return made.id;
      });
    } catch {
      // ใบของคนหนึ่งเขียนไม่ได้ ห้ามตัดคนที่เหลือ (ผู้เรียกหลายตัวมีผู้รับหลายสิบคน)
      continue;
    }
    if (!rowId) continue;
    if (r.channels.IN_APP) out.inApp += 1;
    if (r.inQuiet && outbound) {
      out.deferred += 1;
      continue;
    }
    const sent = await deliverOutbound(ctx, r, key, title, body, link, opts.deps);
    out.push += sent.push;
    out.email += sent.email;
    // ล้มแบบ "ลองใหม่ได้" = ปล่อยใบไว้ไม่ประทับ ⇒ รอบกวาดรายชั่วโมงเก็บส่งภายในช่วงย้อนหลัง 36 ชม.
    // ส่งสำเร็จ หรือล้มแบบถาวร (ร้านยังไม่เสียบคีย์อีเมล · ผู้ใช้ไม่มีอีเมล · ยังไม่ลงทะเบียนอุปกรณ์) = จบเรื่องของใบนี้
    if (!sent.retry) await prisma.appNotification.updateMany({ where: { id: rowId, emailedAt: null }, data: { emailedAt: now } }).catch(() => null);
  }
  return out;
}

/**
 * ยิง push/อีเมลของผู้รับหนึ่งคน (best-effort — ล้มแล้วไม่โยน · ใบในแอปคือหลักประกันว่าข่าวไม่หาย)
 *
 * 🔴 B2: คืน `retry` ด้วย — **แยกล้มชั่วคราวออกจากล้มถาวร** (มติผู้คุมงานรอบแก้ ข้อ 4)
 *   • ล้มชั่วคราว (ตัวส่งโยน · ตัวส่งที่ฉีดมาตอบ `ok:false`) ⇒ `retry = true` ⇒ ผู้เรียก **ไม่ประทับ** `emailedAt`
 *     ⇒ รอบกวาดรายชั่วโมงเก็บส่งให้ภายในช่วงย้อนหลัง 36 ชม.
 *   • ล้มถาวรของใบนี้ (ร้านยังไม่เสียบคีย์อีเมล · ผู้ใช้ไม่มีอีเมล/ยังไม่ลงทะเบียนอุปกรณ์) ⇒ `retry = false`
 *     ⇒ ประทับ จบเรื่อง (ลองอีกกี่ชั่วโมงก็ได้ผลเดิม — ปล่อยไว้คือให้รอบกวาดหยิบใบเดิมขึ้นมาดูฟรีทุกชั่วโมง)
 */
async function deliverOutbound(
  ctx: { tenantId: string; systemId: string },
  r: { userId: string; channels: CrmNotifChannelMap },
  key: CrmNotifKey,
  title: string,
  body: string,
  link: string,
  deps: CrmNotifyDeps | undefined,
): Promise<{ push: number; email: number; retry: boolean }> {
  const out = { push: 0, email: 0, retry: false };
  if (r.channels.PUSH) {
    const req: CrmPushRequest = { tenantId: ctx.tenantId, systemId: ctx.systemId, userId: r.userId, title, body: body.slice(0, 180), data: { link, key } };
    try {
      if (deps?.push) {
        const res = await deps.push(req);
        if (res?.ok) out.push += 1;
        else out.retry = true;
      } else {
        // AUDIT-CLASS X8: push = กระดิ่ง ไม่ใช่เอกสาร — payload เล็กและเป็นรหัสล้วน
        // `sent === 0` = ผู้ใช้ยังไม่ลงทะเบียนอุปกรณ์ (ถาวรสำหรับใบนี้) ไม่ใช่ "ส่งไม่ผ่าน"
        const res = await sendPushToUser(r.userId, { title, body: req.body, data: { link, key } }, { tenantId: ctx.tenantId });
        if (res.sent > 0) out.push += 1;
      }
    } catch {
      // ช่องทางนอกแอปเป็นของแถม — ล้มแล้วเงียบ (ตัวส่งของ core ลง OpsEvent ให้เองแล้ว) แต่ **ขอรอบใหม่**
      out.retry = true;
    }
  }
  if (r.channels.EMAIL) {
    const req: CrmEmailRequest = { tenantId: ctx.tenantId, systemId: ctx.systemId, userId: r.userId, subject: title, text: body, key };
    try {
      if (deps?.email) {
        const res = await deps.email(req);
        if (res?.ok) out.email += 1;
        else out.retry = true;
      } else if (await sendEmailToUser(req)) {
        out.email += 1;
      }
    } catch {
      // เช่นเดียวกับ push
      out.retry = true;
    }
  }
  return out;
}

/**
 * ตัวส่งอีเมลจริงของแพลตฟอร์ม — ที่อยู่ปลายทางถูก resolve **ที่นี่** (คำขอที่วิ่งในระบบพา `userId` เท่านั้น · X8)
 * 🔴 โหลด `@/lib/env` / `@/lib/core/email` แบบ dynamic: import static ทำให้ทุกที่ที่ import โมดูล CRM
 *    (รวมตัวตรวจ fitness โหมดไร้ env) ต้องมี env ครบ · ยังไม่ได้เสียบคีย์ = ไม่ส่ง และไม่โกหกว่าส่งแล้ว
 */
async function sendEmailToUser(req: CrmEmailRequest): Promise<boolean> {
  const { emailEnabled } = await import("@/lib/env");
  if (!emailEnabled) return false;
  const user = await prisma.user.findUnique({ where: { id: req.userId }, select: { email: true } });
  if (!user?.email) return false;
  const { sendEmail } = await import("@/lib/core/email");
  await sendEmail(user.email, req.subject, req.text);
  return true;
}

/**
 * รอบกวาดรายชั่วโมง: ส่งของที่ถูกเลื่อนไว้เพราะ quiet hours เมื่อพ้นช่วงแล้ว (งาน `crm.notify.fanout`)
 *
 * AUDIT-CLASS X4/X5: การจองคือ **conditional update** ของ `emailedAt` (`WHERE emailedAt IS NULL`) ⇒
 *   รอบที่วิ่งซ้อนกันสามตัวชนะได้ตัวเดียว ส่งครั้งเดียว · โพรเซสที่ตายหลังจองแล้วยอมเสีย 1 ใบ (ดีกว่ายิงซ้ำทุกชั่วโมง)
 * ขอบเขต = ใบ **ของ CRM v2 เท่านั้น** (ลิงก์ลึก `?n=<คีย์>` ในเนื้อความเป็นตัวเลือก) — ตาราง `AppNotification`
 *   เป็นของกลางทั้งแพลตฟอร์ม ถ้ากวาดทุกใบ ค่าที่ผู้ใช้ตั้งในหน้า CRM จะไปสั่งการแจ้งเตือนของโมดูลอื่น
 */
export async function runFanout(opts: { now?: Date; tenantIds?: string[]; deps?: CrmNotifyDeps; deadline?: number; signal?: AbortSignal } = {}): Promise<{ sent: number }> {
  const now = opts.now instanceof Date && Number.isFinite(opts.now.getTime()) ? opts.now : new Date();
  const tenantIds = Array.isArray(opts.tenantIds) ? opts.tenantIds.filter((t) => typeof t === "string" && t) : null;
  if (tenantIds && tenantIds.length === 0) return { sent: 0 };
  const stop = () => !!opts.signal?.aborted || (typeof opts.deadline === "number" && Date.now() > opts.deadline - 500);
  const rows = await prisma.appNotification.findMany({
    where: {
      recipientUserId: { not: null },
      emailedAt: null,
      // 🔴 ไม่กำหนดขอบบนด้วย `now`: `createdAt` มาจากนาฬิกาของฐาน ส่วน `now` มาจากผู้เรียก (งานที่รันย้อนหลัง /
      //    ข้อสอบนาฬิกาสมมุติ) — ผูกขอบบนกับ `now` = รอบกวาดมองไม่เห็นใบที่ตัวเองเพิ่งเลื่อนไว้
      createdAt: { gte: new Date(Math.min(now.getTime(), Date.now()) - CRM_FANOUT_LOOKBACK_MS) },
      body: { contains: CRM_NOTIF_LINK_MARK },
      ...(tenantIds ? { tenantId: { in: tenantIds } } : {}),
    },
    orderBy: { createdAt: "asc" },
    take: FANOUT_BATCH,
    select: { id: true, tenantId: true, recipientUserId: true, title: true, body: true },
  });
  let sent = 0;
  const sysCache = new Map<string, { sys: SysRow; view: CrmNotifSettingsView } | null>();
  for (const row of rows) {
    if (stop()) break;
    const userId = row.recipientUserId;
    if (!userId) continue;
    const parsed = parseCrmNotifLink(row.body);
    if (!parsed) continue; // ใบของโมดูลอื่นที่บังเอิญมีคำว่า /crm/ ในเนื้อความ
    const cacheKey = `${row.tenantId}:${parsed.systemId}`;
    let entry = sysCache.get(cacheKey);
    if (entry === undefined) {
      const ctx = { tenantId: row.tenantId, systemId: parsed.systemId };
      const sys = await loadSystem(ctx);
      entry = sys && (await crmUiVersion(ctx)) === 2 ? { sys, view: settingsViewOf(sys) } : null;
      sysCache.set(cacheKey, entry);
    }
    if (!entry) continue;
    const membership = await prisma.membership.findFirst({
      where: { tenantId: row.tenantId, userId, acceptedAt: { not: null } },
      select: { userId: true, role: true, unitAccess: true, permissions: true },
    });
    if (!membership) continue; // ไม่ใช่พนักงานของร้านนี้แล้ว — ไม่ส่งอะไรทั้งนั้น (X1)
    const mine = await prefsOf(parsed.systemId, userId);
    const quiet = quietFor(entry.view.quietHours, mine.quietHours);
    if (quiet.enabled && inQuietWindow(now, quiet.from, quiet.to)) continue; // ยังอยู่ในช่วงห้ามรบกวน — รอบหน้าเก็บ
    const tpl = entry.view.templates[parsed.key];
    const channels = effectiveChannels(tpl?.channels ?? { IN_APP: true, PUSH: false, EMAIL: false }, mine.notifications[parsed.key]);
    if (!channels.PUSH && !channels.EMAIL) {
      // เจ้าตัวปิดช่องทางนอกแอปไปแล้วหลังจากใบถูกเลื่อน — ปิดใบไว้ ไม่ให้ค้างเป็นผู้สมัครของทุกรอบ
      await prisma.appNotification.updateMany({ where: { id: row.id, emailedAt: null }, data: { emailedAt: now } });
      continue;
    }
    // การจอง: ใครประทับได้คนนั้นส่ง (รอบอื่นที่วิ่งพร้อมกันจะได้ count = 0)
    const claim = await prisma.appNotification.updateMany({ where: { id: row.id, emailedAt: null }, data: { emailedAt: now } });
    if (claim.count !== 1) continue;
    const link = parseLinkOf(row.body);
    const res = await deliverOutbound(
      { tenantId: row.tenantId, systemId: parsed.systemId },
      { userId, channels: { ...channels, IN_APP: false } },
      parsed.key,
      row.title,
      row.body,
      link,
      opts.deps,
    );
    if (res.push > 0 || res.email > 0) sent += 1;
    // B2 (ต่อเนื่อง): ล้มแบบลองใหม่ได้ ⇒ **คืนการจอง** ให้รอบหน้าเก็บต่อ (ยังอยู่ในช่วงย้อนหลัง 36 ชม.)
    //   ล้มถาวร/ส่งสำเร็จ = คงตราไว้ (ไม่หยิบใบเดิมขึ้นมาดูฟรีทุกชั่วโมง)
    else if (res.retry) await prisma.appNotification.updateMany({ where: { id: row.id, emailedAt: now }, data: { emailedAt: null } }).catch(() => null);
  }
  return { sent };
}

/** ลิงก์ลึกที่อยู่ในเนื้อความใบนี้ (ใช้ส่งต่อให้ push) — ไม่มี = ส่งสตริงว่าง */
function parseLinkOf(body: string): string {
  const m = /\/app\/sys\/[A-Za-z0-9_-]+\/crm[^\s]*/.exec(String(body ?? ""));
  return m ? m[0] : "";
}

// ───────────────────────── ตั้งค่าของร้าน (คีย์ `crm.settings.manage`) ─────────────────────────

/** ค่าแจ้งเตือนของร้าน (เทมเพลต 10 × ช่องทาง + ช่วงห้ามรบกวน + ชั่วโมงส่งสรุป) */
export async function getNotificationSettings(ctx: CrmNotifyCtx, actor: MemberActor): Promise<CrmNotifSettingsView> {
  const sys = await enterShopSettings(ctx, actor);
  return settingsViewOf(sys);
}

/** แก้เทมเพลต 1 ตัว (หัวข้อ · เนื้อความ · ช่องทาง) — ช่องทางที่ไม่ได้ส่งมาคงค่าเดิม */
export async function setTemplate(ctx: CrmNotifyCtx, actor: MemberActor, key: string, patch: CrmNotifTemplatePatch): Promise<CrmNotifSettingsView> {
  const sys = await enterShopSettings(ctx, actor);
  if (!isCrmNotifKey(key)) throw new CrmNotifyError("VALIDATION", "ไม่รู้จักเรื่องแจ้งเตือนนี้ — เลือกจากรายการ 10 เรื่องของ CRM");
  const before = settingsViewOf(sys).templates[key];
  const clean: { title?: string; body?: string; channels?: Record<string, boolean> } = {};
  if (patch?.title !== undefined) {
    const t = String(patch.title ?? "").trim();
    if (!t) throw new CrmNotifyError("VALIDATION", "หัวข้อของการแจ้งเตือนเว้นว่างไม่ได้ — พิมพ์ข้อความสั้น ๆ ที่พนักงานอ่านแล้วรู้เรื่อง");
    clean.title = t.slice(0, TITLE_MAX);
  }
  if (patch?.body !== undefined) {
    const b = String(patch.body ?? "").trim();
    if (!b) throw new CrmNotifyError("VALIDATION", "เนื้อความของการแจ้งเตือนเว้นว่างไม่ได้ — พิมพ์ข้อความที่บอกว่าต้องทำอะไรต่อ");
    clean.body = b.slice(0, BODY_MAX);
  }
  if (patch?.channels !== undefined) {
    const chans: Record<string, boolean> = {};
    for (const [c, v] of Object.entries(patch.channels ?? {})) {
      if (!isCrmNotifChannel(c)) {
        throw new CrmNotifyError("VALIDATION", `ช่องทาง "${c}" ไม่มีในระบบ — เลือกได้เฉพาะ ในแอป · แจ้งเตือนบนมือถือ · อีเมล`);
      }
      if (typeof v !== "boolean") throw new CrmNotifyError("VALIDATION", "ค่าของช่องทางต้องเป็นเปิดหรือปิดเท่านั้น");
      chans[c] = v;
    }
    if (Object.keys(chans).length > 0) clean.channels = chans;
  }
  if (clean.title === undefined && clean.body === undefined && clean.channels === undefined) return settingsViewOf(sys);
  const n = await setCrmNotifTemplateJson(ctx, key, clean);
  if (n === 0) throw new CrmNotifyError("NOT_FOUND", NOT_FOUND_MSG);
  // AUDIT-CLASS X9: audit ของการตั้งค่า — เก็บคีย์/ช่องทาง ไม่เก็บข้อมูลลูกค้า
  await writeAudit({
    tenantId: ctx.tenantId,
    actorId: ctx.actorUserId ?? actor.userId,
    action: "crm.notify.template",
    targetType: "AppSystem",
    targetId: ctx.systemId,
    before: before ? { key, channels: before.channels } : { key },
    after: { key, ...clean },
  });
  return getNotificationSettings(ctx, actor);
}

/** แก้ค่ารวมของร้าน (ช่วงห้ามรบกวน · ชั่วโมงส่งสรุป) */
export async function setNotificationSettings(ctx: CrmNotifyCtx, actor: MemberActor, patch: CrmNotifSettingsPatch): Promise<CrmNotifSettingsView> {
  const sys = await enterShopSettings(ctx, actor);
  const current = settingsViewOf(sys);
  const write: Record<string, unknown> = {};
  if (patch?.quietHours !== undefined) {
    const q = patch.quietHours ?? {};
    const enabled = q.enabled === undefined ? current.quietHours.enabled : q.enabled === true;
    const from = q.from === undefined ? current.quietHours.from : String(q.from);
    const to = q.to === undefined ? current.quietHours.to : String(q.to);
    assertHM(from, "เวลาเริ่มช่วงห้ามรบกวน");
    assertHM(to, "เวลาสิ้นสุดช่วงห้ามรบกวน");
    write.quietHours = { enabled, from, to };
  }
  if (patch?.digestHour !== undefined) {
    const h = Number(patch.digestHour);
    if (!Number.isInteger(h) || h < 0 || h > 23) {
      throw new CrmNotifyError("VALIDATION", "ชั่วโมงที่ส่งสรุปต้องเป็นเลข 0–23 (เวลาไทย) — เช่น 8 คือ 08:00 น.");
    }
    write.digestHour = h;
  }
  if (Object.keys(write).length === 0) return current;
  const n = await setCrmNotifSettingsJson(ctx, write);
  if (n === 0) throw new CrmNotifyError("NOT_FOUND", NOT_FOUND_MSG);
  await writeAudit({
    tenantId: ctx.tenantId,
    actorId: ctx.actorUserId ?? actor.userId,
    action: "crm.notify.settings",
    targetType: "AppSystem",
    targetId: ctx.systemId,
    before: { quietHours: current.quietHours, digestHour: current.digestHour },
    after: write,
  });
  return getNotificationSettings(ctx, actor);
}

function assertHM(v: string, label: string): void {
  if (!/^([01]?\d|2[0-3]):([0-5]\d)$/.test(String(v ?? "").trim())) {
    throw new CrmNotifyError("VALIDATION", `${label}ต้องอยู่ในรูป ชั่วโมง:นาที แบบ 24 ชั่วโมง เช่น 21:00 หรือ 07:30`);
  }
}

// ───────────────────────── ค่าของแต่ละคน (`CrmUserPref` · ไม่ต้องมีคีย์สิทธิ์) ─────────────────────────

/** ค่าแจ้งเตือนของ "ฉัน" ในระบบนี้ + ค่าของร้านที่ใช้อยู่ (หน้าตั้งค่าเอาไปแสดงว่าอะไรคือค่าปริยาย) */
export async function getMyPrefs(ctx: CrmNotifyCtx, actor: MemberActor): Promise<{ userId: string; prefs: CrmUserPrefView; shop: CrmNotifSettingsView }> {
  const userId = await enterOwnPrefs(ctx, actor);
  const sys = await requireSystem(ctx);
  return { userId, prefs: await prefsOf(ctx.systemId, userId), shop: settingsViewOf(sys) };
}

/**
 * ตั้งค่าแจ้งเตือน **ของตัวเอง** (ทับค่าร้านต่อเทมเพลต × ช่องทาง + ช่วงห้ามรบกวนของตัวเอง)
 * 🔴 AUDIT-CLASS X1: ไม่มีทางเขียนของคนอื่น — payload ที่ระบุ `userId` คนอื่นถูกปฏิเสธเป็นภาษาไทย
 *    (ไม่ใช่ "ทิ้งเงียบ": คนที่กดต้องรู้ว่าไม่ได้บันทึก และเราต้องไม่ทำเป็นว่าบันทึกแล้ว)
 */
export async function setMyPrefs(
  ctx: CrmNotifyCtx,
  actor: MemberActor,
  patch: CrmUserPrefPatch & { userId?: string },
): Promise<CrmUserPrefView> {
  const userId = await enterOwnPrefs(ctx, actor);
  if (patch?.userId !== undefined && String(patch.userId) !== userId) {
    throw new CrmNotifyError("FORBIDDEN", "ตั้งค่าการแจ้งเตือนให้คนอื่นไม่ได้ — ค่านี้เป็นของแต่ละคน ให้เจ้าตัวเปิดหน้า \"การแจ้งเตือนของฉัน\" แล้วตั้งเอง");
  }
  const current = await prefsOf(ctx.systemId, userId);
  const nextNotif: Record<string, Partial<Record<string, boolean>>> = {};
  for (const [k, v] of Object.entries(current.notifications)) nextNotif[k] = { ...v };
  if (patch?.notifications !== undefined) {
    for (const [k, val] of Object.entries(patch.notifications ?? {})) {
      if (!isCrmNotifKey(k)) throw new CrmNotifyError("VALIDATION", "ไม่รู้จักเรื่องแจ้งเตือนนี้ — เลือกจากรายการ 10 เรื่องของ CRM");
      const one = { ...(nextNotif[k] ?? {}) };
      for (const [c, on] of Object.entries(val ?? {})) {
        if (!isCrmNotifChannel(c)) {
          throw new CrmNotifyError("VALIDATION", `ช่องทาง "${c}" ไม่มีในระบบ — เลือกได้เฉพาะ ในแอป · แจ้งเตือนบนมือถือ · อีเมล`);
        }
        if (typeof on !== "boolean") throw new CrmNotifyError("VALIDATION", "ค่าของช่องทางต้องเป็นเปิดหรือปิดเท่านั้น");
        one[c] = on;
      }
      nextNotif[k] = one;
    }
  }
  let nextQuiet: CrmNotifQuietHours | null = current.quietHours;
  if (patch?.quietHours !== undefined) {
    if (patch.quietHours === null) nextQuiet = null;
    else {
      const q = patch.quietHours;
      const base = current.quietHours ?? { enabled: false, from: "21:00", to: "07:00" };
      const enabled = q.enabled === undefined ? base.enabled : q.enabled === true;
      const from = q.from === undefined ? base.from : String(q.from);
      const to = q.to === undefined ? base.to : String(q.to);
      assertHM(from, "เวลาเริ่มช่วงห้ามรบกวนของคุณ");
      assertHM(to, "เวลาสิ้นสุดช่วงห้ามรบกวนของคุณ");
      nextQuiet = { enabled, from, to };
    }
  }
  await prisma.crmUserPref.upsert({
    where: { systemId_userId: { systemId: ctx.systemId, userId } },
    create: { tenantId: ctx.tenantId, systemId: ctx.systemId, userId, notifications: nextNotif, quietHours: nextQuiet ?? Prisma.DbNull },
    update: { notifications: nextNotif, quietHours: nextQuiet ?? Prisma.DbNull },
  });
  await writeAudit({
    tenantId: ctx.tenantId,
    actorId: userId,
    action: "crm.notify.prefs",
    targetType: "CrmUserPref",
    targetId: ctx.systemId,
    before: { notifications: current.notifications, quietHours: current.quietHours },
    after: { notifications: nextNotif, quietHours: nextQuiet },
  });
  return prefsOf(ctx.systemId, userId);
}

/** ทะเบียนช่องทาง (หน้าตั้งค่า/ข้อสอบอ่านจากที่นี่ได้ด้วย) */
export { CRM_NOTIF_CHANNELS, CRM_PUSH_MAX_BYTES };
