// widgets.ts — ข้อมูลของ widget CRM บนหน้า PAGES `/p/<slug>` (ใบ C3.6 · addendum ผู้เขียนข้อสอบข้อ 8 · มติผู้คุมงาน 26 ก.ย.)
//
//   myDeals(ctx, actor, { limit? ≤ 20 · ค่าเริ่มต้น 5 })  → { items: { id, title, valueSatang, stageName, stalled, href }[], total }
//       ดีล OPEN ไม่เก็บถาวร ที่ **ผู้ดูเป็นเจ้าของ** ในระบบ CRM นี้ ภายใต้ dealWhere ของผู้ดู (คีย์ crm.deal.read)
//   todayTasks(ctx, actor, { now?, limit? })           → { items: { id, title, type, dueAt, done, href }[], counts: { today, overdue, done } }
//       กิจกรรมของผู้ดู (activityWhere · คีย์ crm.activity.read) ตาม "วันไทย" ของ now: วันนี้ = ค้าง & ครบกำหนดในวัน · เลยกำหนด =
//       ค้าง & ครบกำหนดก่อนวัน · เสร็จ = doneAt ในวัน · items = วันนี้ → เลยกำหนด → เสร็จ (ตัดที่ limit)
//   portalEntry(ctx, { contactId? | partyId? })        → { href } | null   (ลิงก์เข้าพอร์ทัล `/b/…` — ไม่มีข้อมูลบุคคล/ไม่มี id)
//       null เมื่อผู้ติดต่อไม่มีสิทธิ์พอร์ทัลที่ยังใช้ได้ (revokedAt null) ในระบบนี้ · พอร์ทัลปิด · ระบบนี้ไม่ใช่ระบบที่เปิดพอร์ทัลของร้าน
//   portalShopEntry(ctx)                                → { href } | null   (ทางเข้าพอร์ทัลของร้าน สำหรับ widget บนหน้า Page — ไม่ผูกคน)
//
// 🔴 AUDIT-CLASS X1: ทุก query ผูก tenantId + systemId ที่ resolve ใหม่ (ชนิด CRM ของร้านนี้) + ตัวกรองการมองเห็นของผู้ดู ·
//    ระบบของร้านอื่น = NOT_FOUND · ผู้ดูที่ไม่มีคีย์ = FORBIDDEN (ข้อความไทย)
// 🔴 R-E.14: ระบบ uiVersion 1 ⇒ myDeals/todayTasks ตอบ CrmV2DisabledError · portal = null (หน้า Page ซ่อน widget เองอยู่แล้ว)
// 🔴 AUDIT-CLASS X8: DTO มีแค่ชื่อดีล/ชื่องาน/ชื่อขั้น — ไม่มีเบอร์/อีเมลของลูกค้า
import type { Prisma } from "@prisma/client";
import type { MemberActor } from "@/lib/modules/member";
import { prisma } from "./db";
import { crmCan } from "./access";
import { parseCrmSettings } from "./settings";
import { CrmV2DisabledError } from "./ui-version";
import { activityWhere, dealWhere } from "./where";
import { activityStatusWhere } from "./activities"; // CRM C5.4-E ▸ L6-m1 ◂
import { DAY_MS, thaiDayStartMs } from "./activities-shared";
import { parsePortalSettings, portalLive, portalPath } from "./portal-shared";
import { IntegrationsError } from "./integrations-shared";

export type WidgetCtx = { tenantId: string; systemId: string; actorUserId?: string | null };
type Actor = MemberActor;

export type MyDealsWidget = {
  items: { id: string; title: string; valueSatang: number; stageName: string; stalled: boolean; href: string }[];
  total: number;
};
export type TodayTasksWidget = {
  items: { id: string; title: string; type: string; dueAt: string | null; done: boolean; href: string }[];
  counts: { today: number; overdue: number; done: number };
};

const MSG_NO_SYSTEM = "ไม่พบระบบ CRM นี้ในร้านที่เปิดอยู่ — รีเฟรชหน้าแล้วลองใหม่";
const MSG_NO_DEAL_KEY = "บัญชีนี้ยังไม่มีสิทธิ์ดูดีล — ขอสิทธิ์จากหัวหน้าหรือเจ้าของร้าน";
const MSG_NO_ACT_KEY = "บัญชีนี้ยังไม่มีสิทธิ์ดูงานติดตาม — ขอสิทธิ์จากหัวหน้าหรือเจ้าของร้าน";

const clampInt = (v: unknown, d: number, max: number) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 ? Math.min(n, max) : d;
};

async function loadCrm(ctx: WidgetCtx): Promise<{ id: string; settings: Prisma.JsonValue } | null> {
  if (!ctx || typeof ctx.tenantId !== "string" || typeof ctx.systemId !== "string" || !ctx.tenantId || !ctx.systemId) return null;
  // AUDIT-CLASS X1: ระบบต้องเป็น CRM ของร้านใน ctx
  return prisma.appSystem.findFirst({ where: { id: ctx.systemId, tenantId: ctx.tenantId, type: "CRM" }, select: { id: true, settings: true } });
}

/** ทางเข้าของคน: ระบบของร้าน (NOT_FOUND) → uiVersion 2 (CrmV2DisabledError) → คีย์ (FORBIDDEN) */
async function enter(ctx: WidgetCtx, actor: Actor | null | undefined, key: string, msg: string): Promise<{ id: string; userId: string }> {
  if (!actor || actor.role === "CUSTOMER" || typeof actor.userId !== "string" || !actor.userId) throw new IntegrationsError("NOT_FOUND", MSG_NO_SYSTEM);
  const sys = await loadCrm(ctx);
  if (!sys) throw new IntegrationsError("NOT_FOUND", MSG_NO_SYSTEM);
  if (parseCrmSettings(sys.settings).uiVersion !== 2) throw new CrmV2DisabledError();
  // AUDIT-CLASS X2: ตัวตัดสินคีย์ตัวเดียวของ CRM
  if (!crmCan(actor, key)) throw new IntegrationsError("FORBIDDEN", msg);
  return { id: sys.id, userId: actor.userId };
}

/** "ดีลของฉัน" — ดีลเปิดของผู้ดูเอง (ไม่ใช่ทุกดีลที่เขามองเห็น) · นิ่งก่อน แล้วอัปเดตล่าสุดก่อน */
export async function myDeals(ctx: WidgetCtx, actor: Actor, opts: { limit?: number } = {}): Promise<MyDealsWidget> {
  const sys = await enter(ctx, actor, "crm.deal.read", MSG_NO_DEAL_KEY);
  const scope = { tenantId: ctx.tenantId, systemId: sys.id };
  const limit = clampInt(opts?.limit, 5, 20);
  // AUDIT-CLASS X1: visibleWhere ของผู้ดู + ระบบนี้ + เจ้าของ = ผู้ดู
  const where: Prisma.CrmDealWhereInput = { AND: [await dealWhere(scope, actor), { ...scope, kind: "OPEN", archivedAt: null, ownerUserId: sys.userId }] };
  const [total, rows] = await Promise.all([
    prisma.crmDeal.count({ where }),
    prisma.crmDeal.findMany({
      where,
      select: { id: true, title: true, valueSatang: true, stalledAt: true, stage: { select: { name: true } } },
      orderBy: [{ stalledAt: { sort: "desc", nulls: "last" } }, { updatedAt: "desc" }, { id: "asc" }],
      take: limit,
    }),
  ]);
  return {
    total,
    items: rows.map((r) => ({
      id: r.id,
      title: r.title,
      valueSatang: Number(r.valueSatang ?? 0),
      stageName: r.stage?.name ?? "",
      stalled: !!r.stalledAt,
      href: `/app/sys/${sys.id}/crm/deals/${r.id}`,
    })),
  };
}

/** "งานวันนี้" — ตามวันไทยของ `now` (ขอบวันที่ 00:00 +07:00 ไม่ใช่ UTC) */
export async function todayTasks(ctx: WidgetCtx, actor: Actor, opts: { now?: Date; limit?: number } = {}): Promise<TodayTasksWidget> {
  const sys = await enter(ctx, actor, "crm.activity.read", MSG_NO_ACT_KEY);
  const scope = { tenantId: ctx.tenantId, systemId: sys.id };
  const nowMs = opts?.now instanceof Date && Number.isFinite(opts.now.getTime()) ? opts.now.getTime() : Date.now();
  const start = new Date(thaiDayStartMs(nowMs));
  const end = new Date(start.getTime() + DAY_MS);
  const limit = clampInt(opts?.limit, 20, 50);
  const base: Prisma.CrmActivityWhereInput = { AND: [await activityWhere(scope, actor), { ...scope, ownerUserId: sys.userId }] };
  // CRM C5.4-E ▸ L6-m1: นิยามเดียวกับแท็บงานบนเว็บและแอปมือถือ (`activities.activityStatusWhere`) ◂
  const wToday: Prisma.CrmActivityWhereInput = { AND: [base, activityStatusWhere("today", nowMs)] };
  const wOverdue: Prisma.CrmActivityWhereInput = { AND: [base, activityStatusWhere("overdue", nowMs)] };
  const wDone: Prisma.CrmActivityWhereInput = { AND: [base, { doneAt: { gte: start, lt: end } }] };
  const select = { id: true, title: true, type: true, dueAt: true, doneAt: true, dealId: true, contactId: true } as const;
  const [today, overdue, done, rToday, rOverdue, rDone] = await Promise.all([
    prisma.crmActivity.count({ where: wToday }),
    prisma.crmActivity.count({ where: wOverdue }),
    prisma.crmActivity.count({ where: wDone }),
    prisma.crmActivity.findMany({ where: wToday, select, orderBy: [{ dueAt: "asc" }, { id: "asc" }], take: limit }),
    prisma.crmActivity.findMany({ where: wOverdue, select, orderBy: [{ dueAt: "asc" }, { id: "asc" }], take: limit }),
    prisma.crmActivity.findMany({ where: wDone, select, orderBy: [{ doneAt: "desc" }, { id: "asc" }], take: limit }),
  ]);
  const base360 = `/app/sys/${sys.id}/crm`;
  const hrefOf = (r: { dealId: string | null; contactId: string | null }) =>
    r.dealId ? `${base360}/deals/${r.dealId}` : r.contactId ? `${base360}/contacts/${r.contactId}` : `${base360}/activities`;
  // วันนี้ก่อน แล้วเลยกำหนด แล้วเสร็จแล้ว (ตัดที่ limit · ตัวนับไม่ขึ้นกับ limit)
  const items = [...rToday, ...rOverdue, ...rDone].slice(0, limit).map((r) => ({
    id: r.id,
    title: r.title,
    type: String(r.type),
    dueAt: r.dueAt ? r.dueAt.toISOString() : null,
    done: !!r.doneAt,
    href: hrefOf(r),
  }));
  return { items, counts: { today, overdue, done } };
}

/** ระบบนี้คือระบบที่ "เปิดพอร์ทัลจริง" ของร้าน (CRM เก่าสุดที่ uiVersion 2 + portal.enabled — กติกาเดียวกับ `/b/<slug>`) */
async function livePortalSlug(ctx: WidgetCtx): Promise<string | null> {
  const sys = await loadCrm(ctx);
  if (!sys || parseCrmSettings(sys.settings).uiVersion !== 2 || !parsePortalSettings(sys.settings).enabled) return null;
  const [tenant, systems] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: ctx.tenantId }, select: { slug: true } }),
    prisma.appSystem.findMany({ where: { tenantId: ctx.tenantId, type: "CRM" }, select: { id: true, settings: true }, orderBy: { createdAt: "asc" }, take: 50 }),
  ]);
  const live = systems.find((s) => portalLive(s.settings));
  return tenant?.slug && live?.id === sys.id ? tenant.slug : null;
}

/**
 * ทางเข้าพอร์ทัลของลูกค้าคนหนึ่ง (widget "portal") — `{ href: "/b/<ร้าน>/login" }` เมื่อเขามีสิทธิ์พอร์ทัลที่ยังใช้ได้ในระบบนี้
 * AUDIT-CLASS X1: สิทธิ์ต้องเป็นของระบบนี้ + ร้านนี้ · ผู้ติดต่อของระบบ/ร้านอื่น = null · AUDIT-CLASS X8: ลิงก์ไม่มี id/ชื่อ/อีเมล
 */
export async function portalEntry(ctx: WidgetCtx, subject: { contactId?: string | null; partyId?: string | null } = {}): Promise<{ href: string } | null> {
  const contactId = typeof subject?.contactId === "string" ? subject.contactId.trim() : "";
  const partyId = typeof subject?.partyId === "string" ? subject.partyId.trim() : "";
  if (!contactId && !partyId) return null;
  const slug = await livePortalSlug(ctx);
  if (!slug) return null;
  const access = await prisma.crmPortalAccess.findFirst({
    where: {
      tenantId: ctx.tenantId,
      systemId: ctx.systemId,
      revokedAt: null,
      ...(contactId ? { contactId } : {}),
      ...(partyId ? { contact: { partyId, tenantId: ctx.tenantId, systemId: ctx.systemId } } : {}),
    },
    select: { id: true },
  });
  return access ? { href: portalPath(slug, "login") } : null;
}

/** ทางเข้าพอร์ทัลของร้าน (widget "portal" บนหน้า Page — ลูกค้าเข้าสู่ระบบเองที่ `/b/<ร้าน>/login`) · พอร์ทัลปิด/ไม่ใช่ระบบนี้ = null */
export async function portalShopEntry(ctx: WidgetCtx): Promise<{ href: string } | null> {
  const slug = await livePortalSlug(ctx);
  return slug ? { href: portalPath(slug, "login") } : null;
}
