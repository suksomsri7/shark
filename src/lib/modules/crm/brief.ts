// brief.ts — การ์ดย่อ CRM สำหรับโมดูลอื่น + หน้าแรก CRM v2 (ใบ C1.11 · พิมพ์เขียว §3.18 · RESOLUTIONS R-A)
//
// ของที่ไฟล์นี้เป็นเจ้าของ (อ่านอย่างเดียวทั้งหมด — หน้า GET ไม่เขียนอะไร):
//   • `briefFor(ctx, actor, { partyId | contactId })` — ผู้ติดต่อ/บริษัท/ดีลเปิด/คะแนน ของ Party ในระบบ CRM หนึ่ง (แผงข้างห้องแชท)
//   • `crmPanelTarget(tenantId)` — ระบบ CRM ปลายทางของแผงแชท = ระบบ CRM ตัวแรกของร้าน (createdAt asc — กติกาเดียวกับ
//      crm-bridges/chat.ts จนกว่า C2.4 จะเปลี่ยนเป็น targets.crmSystemId ของระบบแชท · มติผู้คุมงาน C1.11 ข้อ 4)
//   • `partyBriefs(tenantId, actor, partyId)` — บล็อก CRM บนหน้า /app/party/[partyId] (ทุกระบบ CRM ของร้านที่เป็น uiVersion 2)
//   • `homeFor(ctx, actor)` — หน้าแรก CRM v2 (ภาพ 13(ก)): ดีลเปิดของฉัน + งานค้างของฉันถึงสิ้นวันนี้ (เวลาไทย)
// 🔴 AUDIT-CLASS X1: ทุกการอ่านผ่าน where ของการมองเห็น (C1.7) — มองไม่เห็นผู้ติดต่อ = ไม่มีอะไรของเขาในผลเลย (ชื่อ/บริษัท/ดีล/id)
// 🔴 AUDIT-CLASS X8: ไม่คืนเบอร์/อีเมล · ไม่แตะข้อมูลคลินิก (ClinicVisit/PatientRecord บน Party เดียวกัน = ข้อมูลสุขภาพ ต้องใช้สิทธิ์คลินิก —
//    หนี้ crm-C1.1) — ไฟล์นี้อ่านเฉพาะตาราง Crm*
import type { MemberActor } from "@/lib/modules/member";
import * as party from "@/lib/modules/party";
import { prisma } from "./db";
import { crmCan } from "./access";
import { briefFor as contactBriefFor } from "./contacts";
import { visibleCompaniesByIds } from "./companies";
import { parseCrmSettings } from "./settings";
import { activityWhere, dealWhere } from "./where";

export type CrmBriefCtx = { tenantId: string; systemId: string; actorUserId?: string | null };

export type CrmBriefDeal = { id: string; title: string; valueSatang: number; stageName: string };

export type CrmBrief = {
  systemId: string;
  /**
   * N-4 (รีวิว C1.11): visible = ผู้ดูเห็นผู้ติดต่อ · hidden = มีผู้ติดต่อของ Party นี้ในระบบนี้แต่อยู่นอกขอบเขตของผู้ดู
   * (ไม่มีชื่อ/id/บริษัท/ดีลของเขาในผล — หน้าจอใช้ถ้อยคำกลาง ๆ และไม่เสนอปุ่มสร้าง lead) · none = ไม่มีผู้ติดต่อของ Party นี้แน่นอน
   */
  contactState: "visible" | "hidden" | "none";
  contact: { id: string; name: string; lifecycleStage: string; leadStatus: string; ownerUserId: string | null } | null;
  company: { id: string; name: string } | null;
  openDeals: CrmBriefDeal[];
  /** ช่องคะแนน (C2.8 เติมกฎจริง) — null เมื่อไม่มีผู้ติดต่อที่มองเห็น */
  score: { value: number; band: string | null } | null;
};

const EMPTY = (systemId: string, contactState: CrmBrief["contactState"] = "none"): CrmBrief => ({ systemId, contactState, contact: null, company: null, openDeals: [], score: null });

/**
 * การ์ดย่อ CRM ของ Party/ผู้ติดต่อ ในระบบ `ctx.systemId` ผ่านการมองเห็นของ `actor`
 * ไม่มีคีย์อ่านผู้ติดต่อ / มองไม่เห็น / ไม่มีผู้ติดต่อของ Party นี้ = contact null + ไม่มีบริษัท/ดีลของเขา
 */
export async function briefFor(ctx: CrmBriefCtx, actor: MemberActor | null | undefined, key: { partyId?: string | null; contactId?: string | null }): Promise<CrmBrief> {
  if (!actor || actor.role === "CUSTOMER" || !crmCan(actor, "crm.contact.read")) return EMPTY(ctx.systemId, "hidden");
  const c = await contactBriefFor({ tenantId: ctx.tenantId, systemId: ctx.systemId, actorUserId: ctx.actorUserId ?? null }, actor, key);
  if (!c) return EMPTY(ctx.systemId, (await contactExists(ctx, key)) ? "hidden" : "none");
  const scope = { tenantId: ctx.tenantId, systemId: ctx.systemId };
  const company = c.companyId && crmCan(actor, "crm.company.read")
    ? ((await visibleCompaniesByIds({ ...scope, actorUserId: ctx.actorUserId ?? null }, actor, [c.companyId]))[0] ?? null)
    : null;
  const deals = crmCan(actor, "crm.deal.read")
    ? await prisma.crmDeal.findMany({
        where: { AND: [await dealWhere(scope, actor), { ...scope, contactId: c.contactId, kind: "OPEN" }] },
        orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
        take: 10,
        select: { id: true, title: true, valueSatang: true, stage: { select: { name: true } } },
      })
    : [];
  const row = await prisma.crmContact.findFirst({ where: { ...scope, id: c.contactId }, select: { score: true } });
  return {
    systemId: ctx.systemId,
    contactState: "visible",
    contact: { id: c.contactId, name: c.name, lifecycleStage: c.lifecycleStage, leadStatus: c.leadStatus, ownerUserId: c.ownerUserId },
    company: company ? { id: company.id, name: company.name } : null,
    openDeals: deals.map((d) => ({ id: d.id, title: d.title, valueSatang: d.valueSatang, stageName: d.stage.name })),
    score: { value: row?.score ?? 0, band: c.scoreBand },
  };
}

/** มีผู้ติดต่อที่ยังใช้งานของ Party/id นี้ในระบบนี้ไหม (ไม่ดูการมองเห็น — ใช้ตัดสินถ้อยคำเท่านั้น ไม่คืนข้อมูลของเขา) */
async function contactExists(ctx: CrmBriefCtx, key: { partyId?: string | null; contactId?: string | null }): Promise<boolean> {
  const scope = { tenantId: ctx.tenantId, systemId: ctx.systemId, mergedIntoId: null, archivedAt: null };
  if (key.contactId) return (await prisma.crmContact.count({ where: { ...scope, id: key.contactId } })) > 0;
  if (!key.partyId) return false;
  const ids = [...new Set([key.partyId, await party.resolveCanonical(ctx.tenantId, key.partyId)])];
  return (await prisma.crmContact.count({ where: { ...scope, partyId: { in: ids } } })) > 0;
}

/**
 * ระบบ CRM ปลายทางของแผงแชท = ระบบ CRM ตัวแรกของร้านที่ยังเปิดใช้ (active · createdAt asc) — ไม่มี = null
 * คืน id เท่านั้น: ประตูรุ่นหน้าจอ (`crmUiVersion`) เป็นหน้าที่ของผู้เรียก — อ่านครั้งเดียวต่อคำขอ
 */
export async function crmPanelTarget(tenantId: string): Promise<{ systemId: string } | null> {
  const row = await prisma.appSystem.findFirst({ where: { tenantId, type: "CRM", active: true }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { id: true } });
  return row ? { systemId: row.id } : null;
}

export type PartyCrmBrief = { systemId: string; systemName: string; brief: CrmBrief };

/** บล็อก CRM บนหน้า Party: ทุกระบบ CRM ของร้านที่เป็น uiVersion 2 ที่ผู้ดูมองเห็นผู้ติดต่อของ Party นี้ (ระบบ v1 = ไม่เพิ่มอะไร) */
export async function partyBriefs(tenantId: string, actor: MemberActor, partyId: string): Promise<PartyCrmBrief[]> {
  const systems = await prisma.appSystem.findMany({ where: { tenantId, type: "CRM" }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { id: true, name: true, settings: true } });
  const out: PartyCrmBrief[] = [];
  for (const s of systems) {
    if (parseCrmSettings(s.settings).uiVersion !== 2) continue;
    const brief = await briefFor({ tenantId, systemId: s.id, actorUserId: actor.userId }, actor, { partyId }).catch(() => EMPTY(s.id));
    if (brief.contact) out.push({ systemId: s.id, systemName: s.name, brief });
  }
  return out;
}

// ───────────────────────── หน้าแรก CRM v2 (ภาพ 13(ก)) ─────────────────────────

export type CrmHomeDeal = { id: string; title: string; valueSatang: number; stageId: string; stageName: string; companyName: string | null; stalledDays: number | null };
export type CrmHomeTask = { id: string; title: string; type: string; dueAt: string | null; overdue: boolean };
export type CrmHomeData = { deals: CrmHomeDeal[]; stages: { id: string; name: string }[]; tasks: CrmHomeTask[] };

const DAY_MS = 86_400_000;

/** สิ้นวันนี้ตามเวลาไทย (+07:00) — ห้ามใช้ getDate()/setHours ของเครื่อง (เซิร์ฟเวอร์รัน UTC) */
function endOfTodayThai(now = new Date()): Date {
  const ymd = now.toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" });
  return new Date(`${ymd}T23:59:59.999+07:00`);
}

/** ดีลเปิดที่ผู้ดูเป็นผู้ดูแล + งานค้างของผู้ดูที่ครบกำหนดภายในวันนี้ — ผ่านการมองเห็นทุกแถว */
export async function homeFor(ctx: CrmBriefCtx, actor: MemberActor): Promise<CrmHomeData> {
  const scope = { tenantId: ctx.tenantId, systemId: ctx.systemId };
  const now = new Date();
  const deals = crmCan(actor, "crm.deal.read")
    ? await prisma.crmDeal.findMany({
        where: { AND: [await dealWhere(scope, actor), { ...scope, ownerUserId: actor.userId, kind: "OPEN" }] },
        orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
        take: 50,
        select: { id: true, title: true, valueSatang: true, companyId: true, stalledAt: true, stage: { select: { id: true, name: true, sortOrder: true } } },
      })
    : [];
  const coIds = [...new Set(deals.map((d) => d.companyId).filter((x): x is string => !!x))];
  const cos = coIds.length && crmCan(actor, "crm.company.read") ? await visibleCompaniesByIds({ ...scope, actorUserId: ctx.actorUserId ?? null }, actor, coIds) : [];
  const coName = new Map(cos.map((c) => [c.id, c.name]));
  const stageMap = new Map<string, { id: string; name: string; sortOrder: number }>();
  for (const d of deals) stageMap.set(d.stage.id, d.stage);
  const tasks = crmCan(actor, "crm.activity.read")
    ? await prisma.crmActivity.findMany({
        where: { AND: [await activityWhere(scope, actor), { ...scope, ownerUserId: actor.userId, doneAt: null, dueAt: { lte: endOfTodayThai(now) } }] },
        orderBy: [{ dueAt: "asc" }, { id: "asc" }],
        take: 20,
        select: { id: true, title: true, type: true, dueAt: true },
      })
    : [];
  return {
    deals: deals.map((d) => ({
      id: d.id,
      title: d.title,
      valueSatang: d.valueSatang,
      stageId: d.stage.id,
      stageName: d.stage.name,
      companyName: d.companyId ? (coName.get(d.companyId) ?? null) : null,
      stalledDays: d.stalledAt ? Math.max(0, Math.floor((now.getTime() - d.stalledAt.getTime()) / DAY_MS)) : null,
    })),
    stages: [...stageMap.values()].sort((a, b) => a.sortOrder - b.sortOrder).map((s) => ({ id: s.id, name: s.name })),
    tasks: tasks.map((t) => ({ id: t.id, title: t.title, type: t.type, dueAt: t.dueAt ? t.dueAt.toISOString() : null, overdue: !!t.dueAt && t.dueAt.getTime() < now.getTime() })),
  };
}
