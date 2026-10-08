// notify-senders.ts — ตัวส่ง "แจ้งเตือนพนักงาน" ของเทมเพลตที่เดิมไม่มีใครส่ง (CRM C5.4-E ▸ L6-M4 · พิมพ์เขียว §7.4 · US1)
//
// เดิมหน้าตั้งค่าแจ้งเตือนมี 11 เรื่อง แต่มีตัวเรียก `notifyStaff` แค่ 4 เรื่อง ⇒ เจ้าของร้านตั้งช่องทางของเรื่องที่ไม่มีวันเกิด
// ไฟล์นี้คือตัวส่งของอีก 7 เรื่อง — ทุกตัวส่งผ่าน `notifyStaff` ตัวเดียว (ช่องทางที่ร้าน/ผู้ใช้เปิด · ช่วงห้ามรบกวน · กันซ้ำต่อวัน ·
// ผู้รับถูกกรองด้วยคีย์อ่าน + การมองเห็นระเบียน · ระบบที่ยังไม่เปิด v2 = เงียบ):
//   lead.assigned      ← `crm.contact.assigned` (ทุกทางมอบหมาย: กดเอง · ทีละหลายคน · กฎอัตโนมัติ · นำเข้า) — ไม่แจ้งคนที่มอบให้ตัวเอง
//   deal.closed        ← `crm.deal.won` / `crm.deal.lost` — ผู้ดูแล + ผู้ร่วมดูแล + หัวหน้าทีมของดีล ยกเว้นคนที่ย้ายเอง
//   customer.replied   ← จดหมายขาเข้าจากลูกค้า (emails.ts ingestInbound — ไม่นับเครื่องตอบอัตโนมัติ) + คำตอบใบเสนอราคาจากพอร์ทัล (deals.ts)
//   invoice.paid       ← `account.invoice.paid` / `account.document.voided` (สะพานเงิน crm-bridges/money.ts) — ผู้ดูแลดีลที่ผูกใบนั้น
//   lead.hot           ← `crm.score.threshold` ระดับ HOT — ผู้ดูแลผู้ติดต่อ
//   activity.reminder  ← `crm.activity.reminder` — ผู้เข้าร่วม (พนักงาน) ของงาน/นัด · เจ้าของงานได้การเตือนจาก reminders.ts อยู่แล้ว
//   tasks.today        ← งานรายชั่วโมง `crm.activities.overdue` (minute-jobs.ts) หลังชั่วโมงสรุปของร้าน — 1 ใบ/คน/วัน
// 🔴 ทุกตัว best-effort: ล้ม = WARN (ไม่โยน) — แจ้งเตือนเป็นของแถมของเหตุการณ์ ห้ามทำให้งานหลัก/คิว outbox ล้ม
// 🔴 AUDIT-CLASS X8: เนื้อความมีแต่จำนวน · ลิงก์มีแต่ id (เทมเพลตของ notifications-shared) — ไม่มีชื่อ/เบอร์/อีเมลของลูกค้า
// 🔴 เรียกจาก **นอกทรานแซกชัน** เสมอ (notifyStaff ยิง push/อีเมล)

import { logOps } from "@/lib/core/ops";
import { prisma } from "./db";
import { notifyStaff } from "./notifications";
import { crmNotifSettingsRaw, parseCrmSettings } from "./settings";
import { parseCrmNotifSettings } from "./notifications-shared";
import { activityStatusWhere } from "./activities";
import { TH_OFFSET_MS } from "./activities-shared";

type Evt = { id: string; tenantId: string; systemId: string | null; payload: unknown };
type Ctx = { tenantId: string; systemId: string };

const obj = (p: unknown): Record<string, unknown> => (p && typeof p === "object" && !Array.isArray(p) ? (p as Record<string, unknown>) : {});
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const uniq = (xs: (string | null | undefined)[]): string[] => [...new Set(xs.filter((x): x is string => typeof x === "string" && !!x))];

/** ล้ม = WARN (ชนิด error เท่านั้น · X8) — ตัวส่งทุกตัวเรียก `notifyStaff(…)` ตรง ๆ (ตัวตรวจของ C5.3 หาจุดเรียกด้วย `key: "<เรื่อง>"`) */
async function warn(ctx: Ctx, key: string, e: unknown): Promise<void> {
  await logOps("WARN", "crm.notify", `ส่งแจ้งเตือน ${key} ไม่สำเร็จ`, { tenantId: ctx.tenantId, detail: e instanceof Error ? e.name : "Error" }).catch(() => {});
}

/** lead.assigned — ผู้ดูแลคนใหม่ (ยังเป็นเจ้าของอยู่ตอนส่ง · ไม่ใช่คนที่มอบให้ตัวเอง) */
export async function onContactAssigned(evt: Evt): Promise<void> {
  const p = obj(evt.payload);
  const contactId = str(p.contactId);
  const owner = str(p.ownerUserId);
  // CRM C5.4-E r2 ▸ SF-3: event ของงานเป็นชุด (นำเข้า · โอนเป็นกลุ่ม) ไม่แจ้งทีละแถว — ผู้เรียกส่งสรุป 1 ใบ/ผู้ดูแล/ชุด (`leadsAssignedBatch`) ◂
  if (!evt.systemId || !contactId || !owner || str(p.batchId)) return;
  const ctx: Ctx = { tenantId: evt.tenantId, systemId: evt.systemId };
  const c = await prisma.crmContact.findFirst({
    where: { id: contactId, tenantId: ctx.tenantId, systemId: ctx.systemId },
    select: { ownerUserId: true, assignedBy: true, mergedIntoId: true, archivedAt: true },
  });
  if (!c || c.ownerUserId !== owner || c.mergedIntoId || c.archivedAt || c.assignedBy === `USER:${owner}`) return;
  try {
    await notifyStaff({ ...ctx, actorUserId: null }, { key: "lead.assigned", userIds: [owner], refType: "CrmContact", refId: contactId, vars: { count: 1 } });
  } catch (e) {
    await warn(ctx, "lead.assigned", e);
  }
}

/**
 * CRM C5.4-E r2 ▸ SF-3 (มติผู้คุมงาน): lead.assigned ของงานเป็นชุด — 1 ใบต่อผู้ดูแลต่อชุด พร้อมจำนวน (`{{count}}` ของเทมเพลต) ·
 * คนที่ทำงานชุดนั้นเองไม่ได้รับ (นำเข้าเอง = ผู้ดูแลคือตัวเอง) · มอบทีละคน/ตามกฎ ยังแจ้งทีละ lead ตามเดิม (`onContactAssigned`) ◂
 */
export async function leadsAssignedBatch(ctx: Ctx, input: { batchId: string; actorUserId: string | null; owners: ReadonlyMap<string, number> }): Promise<void> {
  for (const [owner, count] of input.owners) {
    if (!owner || owner === input.actorUserId || count <= 0) continue;
    try {
      await notifyStaff({ ...ctx, actorUserId: null }, { key: "lead.assigned", userIds: [owner], refType: "CrmContactBatch", refId: input.batchId, vars: { count } });
    } catch (e) {
      await warn(ctx, "lead.assigned", e);
    }
  }
}

/** deal.closed — ผู้ดูแล + ผู้ร่วมดูแล + หัวหน้าทีมของดีล (ยกเว้นคนที่ย้ายดีลเอง) */
export async function onDealClosed(evt: Evt): Promise<void> {
  const dealId = str(obj(evt.payload).dealId);
  if (!evt.systemId || !dealId) return;
  const ctx: Ctx = { tenantId: evt.tenantId, systemId: evt.systemId };
  const d = await prisma.crmDeal.findFirst({
    where: { id: dealId, tenantId: ctx.tenantId, systemId: ctx.systemId },
    select: { kind: true, ownerUserId: true, collaboratorUserIds: true, teamId: true },
  });
  if (!d || d.kind === "OPEN") return;
  const [mover, team] = await Promise.all([
    prisma.crmDealStageHistory.findFirst({ where: { tenantId: ctx.tenantId, dealId }, orderBy: { enteredAt: "desc" }, select: { byUserId: true } }),
    d.teamId ? prisma.team.findFirst({ where: { tenantId: ctx.tenantId, id: d.teamId }, select: { leadUserId: true } }) : null,
  ]);
  const userIds = uniq([d.ownerUserId, ...d.collaboratorUserIds, team?.leadUserId]).filter((u) => u !== mover?.byUserId);
  if (userIds.length === 0) return;
  try {
    await notifyStaff({ ...ctx, actorUserId: null }, { key: "deal.closed", userIds, refType: "CrmDeal", refId: dealId, vars: { count: 1 } });
  } catch (e) {
    await warn(ctx, "deal.closed", e);
  }
}

/** customer.replied (จดหมาย) — ผู้ดูแลผู้ติดต่อ · emails.ts เรียกหลังเก็บจดหมายขาเข้าจากลูกค้า (ไม่ใช่เครื่องตอบอัตโนมัติ) */
export async function customerRepliedByEmail(ctx: Ctx, contactId: string): Promise<void> {
  const c = await prisma.crmContact.findFirst({ where: { id: contactId, tenantId: ctx.tenantId, systemId: ctx.systemId }, select: { ownerUserId: true } });
  if (!c?.ownerUserId) return;
  try {
    await notifyStaff({ ...ctx, actorUserId: null }, { key: "customer.replied", userIds: [c.ownerUserId], refType: "CrmContact", refId: contactId, vars: { count: 1 } });
  } catch (e) {
    await warn(ctx, "customer.replied", e);
  }
}

/** customer.replied (พอร์ทัล) — ผู้ดูแล + ผู้ร่วมดูแลของดีลที่ใบเสนอราคาถูกตอบ (deals.ts applyQuotationResponse · ดีลที่ไม่ได้ย้ายอัตโนมัติ) */
export async function customerRepliedOnDeal(ctx: Ctx, deal: { id: string; ownerUserId: string | null; collaboratorUserIds: string[] }): Promise<void> {
  const userIds = uniq([deal.ownerUserId, ...deal.collaboratorUserIds]);
  if (userIds.length === 0) return;
  try {
    await notifyStaff({ ...ctx, actorUserId: null }, { key: "customer.replied", userIds, refType: "CrmDeal", refId: deal.id, vars: { count: 1 } });
  } catch (e) {
    await warn(ctx, "customer.replied", e);
  }
}

/** invoice.paid — ผู้ดูแลดีลของระบบนี้ที่ผูกใบแจ้งหนี้/ใบเสนอราคาใบนั้น (ชำระครบ หรือเอกสารถูกยกเลิก) */
export async function dealDocumentSettled(ctx: Ctx, documentId: string): Promise<void> {
  const deals = await prisma.crmDeal.findMany({
    where: { tenantId: ctx.tenantId, systemId: ctx.systemId, OR: [{ invoiceDocId: documentId }, { quotationDocId: documentId }] },
    select: { id: true, ownerUserId: true },
    take: 50,
  });
  for (const d of deals) {
    if (!d.ownerUserId) continue;
    try {
      await notifyStaff({ ...ctx, actorUserId: null }, { key: "invoice.paid", userIds: [d.ownerUserId], refType: "CrmDeal", refId: d.id, vars: { count: 1 } });
    } catch (e) {
      await warn(ctx, "invoice.paid", e);
    }
  }
}

/** lead.hot — ผู้ติดต่อที่คะแนนขึ้นถึงระดับร้อน → ผู้ดูแล */
export async function onScoreThreshold(evt: Evt): Promise<void> {
  const p = obj(evt.payload);
  const contactId = str(p.contactId);
  if (!evt.systemId || !contactId || str(p.band) !== "HOT") return;
  const ctx: Ctx = { tenantId: evt.tenantId, systemId: evt.systemId };
  const c = await prisma.crmContact.findFirst({ where: { id: contactId, tenantId: ctx.tenantId, systemId: ctx.systemId }, select: { ownerUserId: true, mergedIntoId: true, archivedAt: true } });
  if (!c?.ownerUserId || c.mergedIntoId || c.archivedAt) return;
  try {
    await notifyStaff({ ...ctx, actorUserId: null }, { key: "lead.hot", userIds: [c.ownerUserId], refType: "CrmContact", refId: contactId, vars: { count: 1 } });
  } catch (e) {
    await warn(ctx, "lead.hot", e);
  }
}

/** activity.reminder — ผู้เข้าร่วมที่เป็นพนักงาน (attendees.userIds) ยกเว้นเจ้าของงาน (reminders.ts เตือนเจ้าของแล้ว) */
export async function onActivityReminder(evt: Evt): Promise<void> {
  const activityId = str(obj(evt.payload).activityId);
  if (!evt.systemId || !activityId) return;
  const ctx: Ctx = { tenantId: evt.tenantId, systemId: evt.systemId };
  const a = await prisma.crmActivity.findFirst({ where: { id: activityId, tenantId: ctx.tenantId, systemId: ctx.systemId }, select: { ownerUserId: true, attendees: true, doneAt: true } });
  if (!a || a.doneAt) return;
  const att = obj(a.attendees).userIds;
  const userIds = uniq(Array.isArray(att) ? att.map((x) => (typeof x === "string" ? x : null)) : []).filter((u) => u !== a.ownerUserId);
  if (userIds.length === 0) return;
  try {
    await notifyStaff({ ...ctx, actorUserId: null }, { key: "activity.reminder", userIds, refType: "CrmActivity", refId: activityId });
  } catch (e) {
    await warn(ctx, "activity.reminder", e);
  }
}

/**
 * tasks.today — สรุปงานของวันนี้ + งานค้าง (นิยามเดียวกับแท็บงาน · `activities.activityStatusWhere`) 1 ใบ/คน/วัน
 * เรียกจากงานรายชั่วโมง `crm.activities.overdue` · ส่งเมื่อถึงชั่วโมงสรุปของร้าน (`notifications.digestHour` เวลาไทย) หรือหลังจากนั้น
 * (รอบต่อไปของวันเดียวกัน = notifyStaff กันซ้ำด้วยลิงก์ที่มีวันไทย) · ระบบที่ยังไม่เปิด v2 = ข้าม
 */
export async function tasksTodayDigest(
  now: Date = new Date(),
  opts: { tenantIds?: string[]; systemIds?: string[]; deadline?: number; signal?: AbortSignal } = {},
): Promise<{ systems: number; sent: number; cutOff: boolean }> {
  const out = { systems: 0, sent: 0, cutOff: false };
  const at = now instanceof Date && Number.isFinite(now.getTime()) ? now : new Date();
  const stop = () => !!opts.signal?.aborted || (typeof opts.deadline === "number" && Date.now() > opts.deadline - 500);
  const hourTh = new Date(at.getTime() + TH_OFFSET_MS).getUTCHours();
  const systems = await prisma.appSystem.findMany({
    where: {
      type: "CRM",
      settings: { path: ["crm", "uiVersion"], equals: 2 },
      ...(opts.tenantIds ? { tenantId: { in: opts.tenantIds } } : {}),
      ...(opts.systemIds ? { id: { in: opts.systemIds } } : {}),
    },
    select: { id: true, tenantId: true, settings: true },
  });
  const open = { OR: [activityStatusWhere("overdue", at.getTime()), activityStatusWhere("today", at.getTime())] };
  for (const sys of systems) {
    if (stop()) {
      out.cutOff = true;
      break;
    }
    if (parseCrmSettings(sys.settings).uiVersion !== 2) continue;
    if (hourTh < parseCrmNotifSettings(crmNotifSettingsRaw(sys.settings)).digestHour) continue;
    out.systems += 1;
    const ctx: Ctx = { tenantId: sys.tenantId, systemId: sys.id };
    const groups = await prisma.crmActivity.groupBy({
      by: ["ownerUserId"],
      where: { AND: [{ tenantId: sys.tenantId, systemId: sys.id, ownerUserId: { not: null } }, open] },
      _count: { _all: true },
    });
    for (const g of groups) {
      if (stop()) {
        out.cutOff = true;
        return out;
      }
      if (!g.ownerUserId || g._count._all === 0) continue;
      try {
        await notifyStaff({ ...ctx, actorUserId: null }, { key: "tasks.today", userIds: [g.ownerUserId], refType: "CrmTasksToday", refId: sys.id, vars: { count: g._count._all }, now: at });
        out.sent += 1;
      } catch (e) {
        await warn(ctx, "tasks.today", e);
      }
    }
  }
  return out;
}

// ───────────────────────── ประกาศระดับร้าน: ระบบส่งอีเมลใช้ไม่ได้ (CRM C5.4-E ▸ E3) ─────────────────────────

const OUTAGE_SOURCE = "crm.email.outage";
const OUTAGE_REASON: Readonly<Record<string, string>> = {
  PROVIDER_401: "กุญแจของบริการส่งอีเมลใช้ไม่ได้",
  PROVIDER_403: "โดเมนอีเมลของร้านยังไม่ผ่านการยืนยัน หรือค่า DNS หลุด",
  PROVIDER_429: "ส่งอีเมลเกินโควตา/ความถี่ที่ผู้ให้บริการกำหนดชั่วคราว",
};

/**
 * CRM C5.4-E ▸ E3 (ต่อจากชุด D · R2-S3): ส่งอีเมลของร้านล้มแบบ "ทั้งร้าน" (ผู้ให้บริการตอบ 401/403/429 — ไม่ใช่ความผิดของจดหมายฉบับนั้น)
 * ⇒ เดิมลำดับการติดตามลองใหม่เงียบ ๆ จนครบ 72 ชม. โดยไม่มีใครในร้านรู้ · ตอนนี้แจ้ง **เจ้าของร้าน + ผู้จัดการ** ในแอป **วันละครั้งต่อร้าน**
 * 🔴 ไม่ใช่เทมเพลตของหน้าตั้งค่าแจ้งเตือน (ทะเบียน 11 เรื่องถูกตรึงไว้ — C2.10-S0.2/C5.3-L6-M4) ⇒ ใช้รูปเดียวกับ "ประกาศเพดาน 80%"
 *    ของ C3.9 (`limits.ts#warnOnce`): แถวแจ้งเตือนในแอป + ธง OpsEvent ใต้ advisory lock ใน tx เดียว ⇒ ครั้งเดียวต่อ (ร้าน, วันไทย) แน่นอน
 *    ในแอปอย่างเดียว (อีเมลใช้ไม่ได้อยู่แล้ว) · ระบบ v1 = ไม่ทำอะไร (CRM รุ่นเดิมไม่ส่งอีเมลทางนี้)
 * AUDIT-CLASS X8: ข้อความ/รายละเอียด = รหัส + เหตุผลกลาง ๆ (ไม่มีที่อยู่ผู้รับ/หัวเรื่อง) · คืน true = แจ้งรอบนี้
 */
export async function noticeEmailOutage(ctx: Ctx, code: string, now: Date = new Date()): Promise<boolean> {
  const c = String(code ?? "").trim().toUpperCase();
  const reason = OUTAGE_REASON[c];
  if (!reason) return false;
  const sys = await prisma.appSystem.findFirst({ where: { id: ctx.systemId, tenantId: ctx.tenantId, type: "CRM" }, select: { settings: true } });
  if (!sys || parseCrmSettings(sys.settings).uiVersion !== 2) return false;
  const day = new Date(now.getTime() + TH_OFFSET_MS).toISOString().slice(0, 10);
  const flag = `${OUTAGE_SOURCE}:${ctx.tenantId}:${day}`;
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${flag}, 0))`;
    const seen = await tx.opsEvent.findFirst({
      where: { tenantId: ctx.tenantId, source: OUTAGE_SOURCE, createdAt: { gte: new Date(now.getTime() - 36 * 3_600_000) }, detail: { contains: `"flag":"${flag}"` } },
      select: { id: true },
    });
    if (seen) return false;
    const staff = await tx.membership.findMany({ where: { tenantId: ctx.tenantId, role: { in: ["OWNER", "MANAGER"] }, acceptedAt: { not: null } }, select: { userId: true }, take: 50 });
    const created = new Date();
    if (staff.length) {
      await tx.appNotification.createMany({
        data: staff.map((s) => ({
          createdAt: created,
          tenantId: ctx.tenantId,
          recipientUserId: s.userId,
          title: "ระบบส่งอีเมลของร้านใช้งานไม่ได้ชั่วคราว",
          body: `อีเมลจาก CRM ยังส่งไม่ออก (${reason}) — ระบบจะลองส่งใหม่ให้เองอัตโนมัติ ถ้ายังไม่หายภายในวันนี้ ตรวจการตั้งค่าอีเมลได้ที่ /app/sys/${ctx.systemId}/crm/settings/email`,
        })),
      });
    }
    await tx.opsEvent.create({
      data: { createdAt: created, level: "WARN", source: OUTAGE_SOURCE, tenantId: ctx.tenantId, message: `ระบบส่งอีเมลของร้านล้มทั้งร้าน (${c})`, detail: JSON.stringify({ flag, systemId: ctx.systemId, code: c, notified: staff.length }) },
    });
    return true;
  });
}
