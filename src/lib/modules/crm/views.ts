// views.ts — มุมมองที่บันทึกไว้ของ CRM v2 สำหรับ objectKey "contact" · "company" · "deal" (ใบ C3.2 · addendum ข้อ 12 · ภาพ 01 ตัวกรอง)
//
// ตาราง = `MemberSavedView` เดิม (objectKey + teamId มาจาก crm_v2_a) — **มุมมองของสมาชิก (objectKey "customer" · `member/views.ts`)
// ไม่ถูกแตะเลย**: ทุกคำสั่งที่นี่ผูก systemId ของระบบ CRM + objectKey ของ CRM เท่านั้น
//
// กติกา
//   • PRIVATE = เห็นเฉพาะเจ้าของมุมมอง
//   • TEAM + teamId = เจ้าของมุมมอง + **สมาชิกปัจจุบันของทีมนั้น** เท่านั้น (ผู้จัดการที่ไม่ได้อยู่ในทีมก็มองไม่เห็น) — TEAM หมายถึงทีมจริงแล้ว
//   • TEAM + teamId NULL (แถวเก่าก่อน C3.2) = ทั้งร้านเหมือนเดิม
//   • สร้าง TEAM ต้องระบุทีมที่ตัวเองอยู่ (หรือเป็น MANAGER/OWNER) · แก้/ลบ = เจ้าของมุมมอง (หรือ OWNER) · มองไม่เห็น = NOT_FOUND
//   • ตัวกรองเก็บเฉพาะคีย์ใน whitelist ของ objectKey นั้น (คีย์อื่นถูกทิ้ง) — รายการ list* ใช้กติกาเดียวกันผ่าน `resolveViewFilters`
// 🔴 AUDIT-CLASS X1: ระบบ resolve ใหม่ (ชนิด CRM ของร้านนี้ — ระบบสมาชิก/ร้านอื่น = NOT_FOUND) · ทีมอ่านใหม่ทุกครั้ง (ไม่มีแคช)
// 🔴 AUDIT-CLASS X9: สร้าง/แก้/ลบมีแถว AuditLog `crm.view.*`
// 🔴 R-E.14: ระบบ uiVersion 1 = CrmV2DisabledError (ไม่อ่าน ไม่เขียน)
import type { Prisma } from "@prisma/client";
import type { MemberActor } from "@/lib/modules/member";
import { writeAudit } from "@/lib/core/audit";
import { prisma } from "./db";
import { crmCan, crmForbiddenMessage } from "./access";
import { parseCrmSettings } from "./settings";
import { CrmV2DisabledError } from "./ui-version";
import { COMPANY_SIZES, type CompanyListInput } from "./companies-shared";
import type { ContactListInput } from "./contacts-shared";
import type { DealListInput } from "./deals-shared";
import { CRM_HARD_CAPS } from "./limits-shared"; // CRM C3.9 ▸ เพดานตายตัวของโค้ดอยู่ที่เดียว ◂
import { crmSystemRow } from "./visibility"; // CRM C5.1-fix ▸ ระบบ CRM ผ่านด่านรวมคำสั่งเดียว (memo ต่อคำขอ) ◂

export const CRM_VIEW_OBJECT_KEYS = ["contact", "company", "deal"] as const;
export type CrmViewObjectKey = (typeof CRM_VIEW_OBJECT_KEYS)[number];
export type CrmViewScope = "PRIVATE" | "TEAM";

/** คีย์ตัวกรองที่เก็บได้ต่อ objectKey (= ตัวกรองของหน้ารายการนั้น ไม่รวมการแบ่งหน้า/เรียง) */
export const CRM_VIEW_FILTER_KEYS: Readonly<Record<CrmViewObjectKey, readonly string[]>> = Object.freeze({
  contact: ["q", "stage", "leadStatus", "owner", "team", "scoreBand", "source", "companyId", "minScore", "f"], // CRM C3.2 รอบ 2 NOTE-8: minScore
  company: ["q", "owner", "team", "industry", "size", "hasOpenDeals", "f"],
  deal: ["pipelineId", "owner", "team", "stage", "closeFrom", "closeTo", "stale", "tag", "q", "companyId", "contactId", "kind", "f"],
});

const READ_KEY: Readonly<Record<CrmViewObjectKey, string>> = { contact: "crm.contact.read", company: "crm.company.read", deal: "crm.deal.read" };
const BOOL_KEYS = new Set(["stale", "hasOpenDeals"]);
const NAME_MAX = 80;
const VALUE_MAX = 200;
const F_KEYS_MAX = 30;
const LIST_MAX = 100;
const MSG_NO_SYSTEM = "ไม่พบระบบ CRM นี้ในร้านที่เปิดอยู่ — รีเฟรชหน้าแล้วลองใหม่";
const MSG_NO_VIEW = "ไม่พบมุมมองที่บันทึกไว้นี้ในระบบ CRM นี้ — เลือกมุมมองใหม่จากรายการ";

export type CrmViewCtx = { tenantId: string; systemId: string; actorUserId?: string | null };
export type CrmViewDto = {
  id: string;
  objectKey: CrmViewObjectKey;
  name: string;
  scope: CrmViewScope;
  /** null + TEAM = ทั้งร้าน (แถวเดิมก่อน C3.2) */
  teamId: string | null;
  ownerUserId: string | null;
  filters: Record<string, unknown>;
  /** ผู้ดูแก้/ลบมุมมองนี้ได้ไหม (เจ้าของมุมมอง หรือ OWNER) */
  editable: boolean;
};
export type CreateViewInput = { objectKey: string; name: string; scope?: string | null; teamId?: string | null; filters?: Record<string, unknown> | null };
export type UpdateViewInput = { name?: string | null; scope?: string | null; teamId?: string | null; filters?: Record<string, unknown> | null };

export class CrmViewError extends Error {
  readonly status: number;
  constructor(
    readonly code: "VALIDATION" | "NOT_FOUND" | "FORBIDDEN",
    message: string,
  ) {
    super(message);
    this.name = "CrmViewError";
    this.status = code === "NOT_FOUND" ? 404 : code === "FORBIDDEN" ? 403 : 400;
  }
}

type Actor = MemberActor;
type ViewRow = { id: string; objectKey: string; name: string; scope: string; teamId: string | null; ownerUserId: string | null; filters: Prisma.JsonValue };

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
export const isCrmViewObjectKey = (v: unknown): v is CrmViewObjectKey => typeof v === "string" && (CRM_VIEW_OBJECT_KEYS as readonly string[]).includes(v);

/** ตัดตัวกรองให้เหลือเฉพาะ whitelist ของ objectKey — ค่าเป็นสตริงสั้น (บูลีนสำหรับ stale/hasOpenDeals) · `f` = map สตริง ≤ 30 คีย์ */
export function whitelistViewFilters(objectKey: CrmViewObjectKey, raw: unknown): Record<string, unknown> {
  const src = isObj(raw) ? raw : {};
  const out: Record<string, unknown> = {};
  for (const k of CRM_VIEW_FILTER_KEYS[objectKey]) {
    const v = src[k];
    if (v === undefined || v === null || v === "") continue;
    if (k === "f") {
      if (!isObj(v)) continue;
      const f = Object.fromEntries(
        Object.entries(v)
          .filter(([fk, fv]) => /^[A-Za-z0-9_.-]{1,64}$/.test(fk) && (typeof fv === "string" || typeof fv === "number") && String(fv) !== "")
          .slice(0, F_KEYS_MAX)
          .map(([fk, fv]) => [fk, String(fv).slice(0, VALUE_MAX)]),
      );
      if (Object.keys(f).length) out.f = f;
      continue;
    }
    if (BOOL_KEYS.has(k)) {
      if (v === true || v === "1" || v === "true") out[k] = true;
      else if (v === false || v === "0" || v === "false") out[k] = false;
      continue;
    }
    if (typeof v === "string" || typeof v === "number") out[k] = String(v).trim().slice(0, VALUE_MAX);
  }
  return out;
}

async function requireSystem(ctx: CrmViewCtx): Promise<void> {
  const ok = !!ctx && typeof ctx.tenantId === "string" && typeof ctx.systemId === "string" && !!ctx.tenantId && !!ctx.systemId;
  const sys = ok ? await crmSystemRow(ctx, prisma) : null;
  if (!sys) throw new CrmViewError("NOT_FOUND", MSG_NO_SYSTEM);
  if (parseCrmSettings(sys.settings).uiVersion !== 2) throw new CrmV2DisabledError();
}

/** ด่าน: ระบบ CRM ของร้าน (ไม่พบ = NOT_FOUND) → uiVersion 2 → objectKey ของ CRM (อื่น เช่น "customer" = VALIDATION) → คีย์อ่านของวัตถุนั้น */
async function enter(ctx: CrmViewCtx, actor: Actor | null | undefined, objectKey: unknown): Promise<CrmViewObjectKey> {
  if (!actor || actor.role === "CUSTOMER") throw new CrmViewError("NOT_FOUND", MSG_NO_SYSTEM);
  await requireSystem(ctx);
  if (!isCrmViewObjectKey(objectKey)) throw new CrmViewError("VALIDATION", "มุมมองที่บันทึกของ CRM ใช้ได้กับผู้ติดต่อ บริษัท และดีลเท่านั้น — เลือกหน้ารายการของ CRM แล้วบันทึกใหม่");
  if (!crmCan(actor, READ_KEY[objectKey])) throw new CrmViewError("FORBIDDEN", crmForbiddenMessage(READ_KEY[objectKey]));
  return objectKey;
}

/** ทีม (ยังไม่เก็บถาวร) ที่ผู้ใช้อยู่ — อ่านใหม่ทุกครั้ง */
async function myTeamIds(tenantId: string, userId: string): Promise<string[]> {
  if (!userId) return [];
  // รีวิวรอบ 2 NOTE-5c: หัวหน้าที่รู้จักผ่าน `Team.leadUserId` อย่างเดียว (ไม่มีแถว TeamMember) นับเป็นคนในทีมด้วย
  const [asMember, asLead] = await Promise.all([
    prisma.teamMember.findMany({ where: { tenantId, userId, team: { tenantId, archivedAt: null } }, select: { teamId: true }, take: 200 }),
    prisma.team.findMany({ where: { tenantId, leadUserId: userId, archivedAt: null }, select: { id: true }, take: 200 }),
  ]);
  return [...new Set([...asMember.map((r) => r.teamId), ...asLead.map((r) => r.id)])];
}

/**
 * AUDIT-CLASS X1: where ของมุมมองที่ actor เห็นใน (ระบบ · objectKey) — เจ้าของ · TEAM ของทีมที่ตัวเองอยู่ · TEAM เดิมที่ไม่มีทีม (= ทั้งร้าน)
 * ใช้ร่วมกับตัวเลือกมุมมองของหน้ารายการ (`contacts/deals/companies.savedViewOptions`) ⇒ กติกาเดียวทุกที่
 */
export async function viewVisibleWhere(ctx: CrmViewCtx, actor: Actor, objectKey: CrmViewObjectKey): Promise<Prisma.MemberSavedViewWhereInput> {
  const me = typeof actor?.userId === "string" ? actor.userId : "";
  const teams = await myTeamIds(ctx.tenantId, me);
  return {
    tenantId: ctx.tenantId,
    systemId: ctx.systemId,
    objectKey,
    OR: [
      ...(me ? [{ ownerUserId: me }] : []),
      // รีวิว N6: เจ้าของร้านเห็น (และแก้/ลบได้) ทุกมุมมองแบบทีม — MANAGER ที่ไม่อยู่ในทีมยังมองไม่เห็นเหมือนเดิม (S4.3)
      ...(actor?.role === "OWNER" ? [{ scope: "TEAM" }] : [{ scope: "TEAM", teamId: null }]),
      ...(teams.length ? [{ scope: "TEAM", teamId: { in: teams } }] : []),
    ],
  };
}

/** ทีม (ยังไม่เก็บถาวร) ที่ผู้ใช้เป็นหัวหน้า (TeamMember LEAD หรือ Team.leadUserId) */
async function leadTeamIds(tenantId: string, userId: string): Promise<string[]> {
  if (!userId) return [];
  const [asMember, asLead] = await Promise.all([
    prisma.teamMember.findMany({ where: { tenantId, userId, role: "LEAD", team: { tenantId, archivedAt: null } }, select: { teamId: true }, take: 200 }),
    prisma.team.findMany({ where: { tenantId, leadUserId: userId, archivedAt: null }, select: { id: true }, take: 200 }),
  ]);
  return [...new Set([...asMember.map((r) => r.teamId), ...asLead.map((r) => r.id)])];
}

/** ผู้บันทึกมุมมองที่ไม่ได้เป็นสมาชิกของร้านแล้ว (จากชุด id ที่มีเพดาน) */
async function departedOwners(tenantId: string, ownerIds: (string | null)[]): Promise<Set<string>> {
  const ids = [...new Set(ownerIds.filter((x): x is string => !!x))];
  if (!ids.length) return new Set();
  const live = new Set((await prisma.membership.findMany({ where: { tenantId, userId: { in: ids } }, select: { userId: true }, take: ids.length })).map((m) => m.userId));
  return new Set(ids.filter((x) => !live.has(x)));
}

function toDto(r: ViewRow, actor: Actor): CrmViewDto {
  const objectKey = isCrmViewObjectKey(r.objectKey) ? r.objectKey : "deal";
  return {
    id: r.id,
    objectKey,
    name: r.name,
    scope: r.scope === "TEAM" ? "TEAM" : "PRIVATE",
    teamId: r.teamId,
    ownerUserId: r.ownerUserId,
    filters: whitelistViewFilters(objectKey, r.filters),
    editable: (!!actor.userId && r.ownerUserId === actor.userId) || actor.role === "OWNER",
  };
}

const VIEW_SELECT = { id: true, objectKey: true, name: true, scope: true, teamId: true, ownerUserId: true, filters: true } as const;
const VIEW_ORDER = [{ sortOrder: "asc" as const }, { createdAt: "asc" as const }, { id: "asc" as const }];

/**
 * รีวิวรอบ 2 NOTE-4: มุมมองของตัวเองก่อน (เพดานของตัวเอง) แล้วค่อยมุมมองที่แชร์ (เพดานแยก) — มุมมองแชร์เกิน 100 อันจะไม่ดันมุมมองของตัวเองหาย
 */
async function ownThenShared(ctx: CrmViewCtx, actor: Actor, objectKey: CrmViewObjectKey): Promise<ViewRow[]> {
  const me = typeof actor?.userId === "string" ? actor.userId : "";
  const vis = await viewVisibleWhere(ctx, actor, objectKey);
  const [own, shared] = await Promise.all([
    me ? prisma.memberSavedView.findMany({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, objectKey, ownerUserId: me }, select: VIEW_SELECT, orderBy: VIEW_ORDER, take: LIST_MAX }) : Promise.resolve([]),
    prisma.memberSavedView.findMany({ where: { AND: [vis, ...(me ? [{ NOT: { ownerUserId: me } }] : [])] }, select: VIEW_SELECT, orderBy: VIEW_ORDER, take: LIST_MAX }),
  ]);
  return [...own, ...shared];
}

/** มุมมองของ objectKey ที่ actor เห็น (ของตัวเอง + ทีมของตัวเอง + ทั้งร้านแบบเดิม) — เรียงตามลำดับ/วันสร้าง */
export async function listViews(ctx: CrmViewCtx, actor: Actor, objectKey: string): Promise<CrmViewDto[]> {
  const key = await enter(ctx, actor, objectKey);
  return (await ownThenShared(ctx, actor, key)).map((r) => toDto(r, actor));
}

function cleanName(v: unknown): string {
  const name = typeof v === "string" ? v.trim() : "";
  if (!name) throw new CrmViewError("VALIDATION", "ตั้งชื่อมุมมองก่อนบันทึก — เช่น \"ดีลของฉันที่นิ่งเกิน 7 วัน\"");
  if (name.length > NAME_MAX) throw new CrmViewError("VALIDATION", `ชื่อมุมมองยาวได้ไม่เกิน ${NAME_MAX} ตัวอักษร`);
  return name;
}

/** TEAM ต้องมีทีมของร้านนี้ และผู้บันทึกต้องอยู่ในทีมนั้น (หรือเป็น MANAGER/OWNER) */
async function cleanTeam(ctx: CrmViewCtx, actor: Actor, scope: CrmViewScope, teamIdRaw: unknown): Promise<string | null> {
  if (scope === "PRIVATE") return null;
  const teamId = typeof teamIdRaw === "string" ? teamIdRaw.trim() : "";
  if (!teamId) throw new CrmViewError("VALIDATION", "มุมมองแบบ \"ทั้งทีม\" ต้องเลือกทีมที่จะแชร์ให้");
  const team = await prisma.team.findFirst({ where: { id: teamId, tenantId: ctx.tenantId, archivedAt: null }, select: { id: true } });
  if (!team) throw new CrmViewError("NOT_FOUND", "ไม่พบทีมนี้ในร้าน — เลือกทีมจากรายการ");
  const mine = await myTeamIds(ctx.tenantId, actor.userId ?? "");
  if (!mine.includes(teamId) && actor.role !== "OWNER" && actor.role !== "MANAGER") {
    throw new CrmViewError("FORBIDDEN", "แชร์มุมมองได้เฉพาะกับทีมที่คุณอยู่ — บันทึกเป็นมุมมองส่วนตัวแทนได้");
  }
  return teamId;
}

const DEAL_KINDS = new Set(["OPEN", "WON", "LOST"]);
const COMPANY_SIZE_SET = new Set<string>(COMPANY_SIZES);
const isDay = (v: unknown) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(new Date(`${v}T00:00:00Z`).getTime());
/** เพดานมุมมองต่อคนต่อวัตถุ (เท่ากับของวัตถุกำหนดเอง `objects-actions.ts`) */
export const CRM_VIEW_PER_USER_MAX = CRM_HARD_CAPS.savedViewsPerUser; // CRM C3.9 ▸ เพดานตายตัวอยู่ที่ limits-shared (ค่าเดิม 50) ◂

/**
 * รีวิว S4: มุมมอง (โดยเฉพาะแบบทีม) ต้อง "ใช้ได้จริง" ก่อนบันทึก — ค่าผิดชนิด (ขนาดบริษัท · ชนิดดีล · วันที่) ถูกปฏิเสธตรง ๆ แล้ว
 * **ลองรันตัวกรองทั้งชุดกับบริการรายการ 1 แถว** (enum ของผู้ติดต่อ · ฟิลด์ `f` ที่ไม่มี/กรองไม่ได้ …) — ตัวกรองที่พังจะพังที่นี่
 * (VALIDATION ไทย) ไม่ใช่ไปพังหน้ารายการของทั้งทีมทีหลัง · อ่านอย่างเดียว · dynamic import (บริการรายการ import ไฟล์นี้)
 */
async function assertUsableFilters(ctx: CrmViewCtx, actor: Actor, objectKey: CrmViewObjectKey, filters: Record<string, unknown>): Promise<void> {
  if (objectKey === "deal") {
    if (filters.kind !== undefined && !DEAL_KINDS.has(String(filters.kind))) throw new CrmViewError("VALIDATION", "ชนิดดีลในมุมมองต้องเป็น เปิด (OPEN) · ชนะ (WON) หรือ แพ้ (LOST)");
    for (const k of ["closeFrom", "closeTo"] as const) if (filters[k] !== undefined && !isDay(filters[k])) throw new CrmViewError("VALIDATION", "วันที่คาดว่าจะปิดในมุมมองต้องเป็นรูป ปี-เดือน-วัน (เช่น 2026-09-30)");
  }
  if (objectKey === "company" && filters.size !== undefined && !COMPANY_SIZE_SET.has(String(filters.size))) {
    throw new CrmViewError("VALIDATION", "ขนาดบริษัทในมุมมองไม่อยู่ในรายการ — เลือกจากตัวกรองของหน้ารายชื่อบริษัท");
  }
  const lctx = { tenantId: ctx.tenantId, systemId: ctx.systemId, actorUserId: ctx.actorUserId ?? actor.userId ?? null };
  try {
    // รีวิวรอบ 2 NOTE-6: where อย่างเดียว + id 1 แถว (ไม่โหลดการ์ด/ชื่อ/นับทั้งหมด)
    if (objectKey === "contact") await (await import("./contacts")).probeContactFilters(lctx, actor, filters as ContactListInput);
    else if (objectKey === "company") await (await import("./companies")).probeCompanyFilters(lctx, actor, filters as CompanyListInput);
    else await (await import("./deals")).probeDealFilters(lctx, actor, filters as DealListInput);
  } catch (e) {
    const code = (e as { code?: unknown })?.code;
    if (code === "VALIDATION") throw new CrmViewError("VALIDATION", e instanceof Error && /[ก-๙]/.test(e.message) ? e.message : "ตัวกรองของมุมมองนี้ใช้กับรายการไม่ได้ — ปรับตัวกรองแล้วบันทึกใหม่");
    throw e;
  }
}

/** บันทึกมุมมองใหม่ (ตัวกรองเก็บเฉพาะ whitelist) */
export async function createView(ctx: CrmViewCtx, actor: Actor, input: CreateViewInput): Promise<CrmViewDto> {
  const objectKey = await enter(ctx, actor, input?.objectKey);
  const name = cleanName(input?.name);
  const scope: CrmViewScope = input?.scope === "TEAM" ? "TEAM" : "PRIVATE";
  const teamId = await cleanTeam(ctx, actor, scope, input?.teamId);
  const filters = whitelistViewFilters(objectKey, input?.filters);
  // รีวิว S8: เพดานมุมมองต่อคนต่อวัตถุ (VALIDATION ไทย)
  await assertUsableFilters(ctx, actor, objectKey, filters);
  // รีวิว S8 + รอบ 2 NOTE-7: เพดานต่อคนต่อวัตถุ นับ **ใน tx ใต้ advisory lock ต่อ (ระบบ · คน · วัตถุ)** ⇒ บันทึกพร้อมกันกี่แท็บก็ไม่เกินเพดาน
  const row = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`crm:view:${ctx.systemId}:${actor.userId ?? "-"}:${objectKey}`}, 0))`;
    const mine = await tx.memberSavedView.count({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, objectKey, ownerUserId: actor.userId ?? "-" } });
    if (mine >= CRM_VIEW_PER_USER_MAX) throw new CrmViewError("VALIDATION", `บันทึกมุมมองของรายการนี้ครบ ${CRM_VIEW_PER_USER_MAX} มุมมองแล้ว — ลบมุมมองที่ไม่ใช้ก่อน แล้วบันทึกใหม่`);
    return tx.memberSavedView.create({
      data: { tenantId: ctx.tenantId, systemId: ctx.systemId, ownerUserId: actor.userId ?? null, objectKey, scope, teamId, name, filters: filters as Prisma.InputJsonValue },
      select: VIEW_SELECT,
    });
  });
  await writeAudit({ tenantId: ctx.tenantId, actorId: ctx.actorUserId ?? actor.userId ?? null, action: "crm.view.create", targetType: "MemberSavedView", targetId: row.id, after: { objectKey, scope, teamId, filterKeys: Object.keys(filters) } });
  return toDto(row, actor);
}

/** โหลดมุมมองที่ actor เห็น — มองไม่เห็น/ระบบอื่น/objectKey ไม่ใช่ของ CRM = NOT_FOUND */
async function loadVisible(ctx: CrmViewCtx, actor: Actor, id: unknown): Promise<ViewRow> {
  const vid = typeof id === "string" ? id.trim() : "";
  if (!vid) throw new CrmViewError("NOT_FOUND", MSG_NO_VIEW);
  const hit = await prisma.memberSavedView.findFirst({ where: { id: vid, tenantId: ctx.tenantId, systemId: ctx.systemId, objectKey: { in: [...CRM_VIEW_OBJECT_KEYS] } }, select: { objectKey: true } });
  if (!hit || !isCrmViewObjectKey(hit.objectKey)) throw new CrmViewError("NOT_FOUND", MSG_NO_VIEW);
  const row = await prisma.memberSavedView.findFirst({ where: { AND: [await viewVisibleWhere(ctx, actor, hit.objectKey), { id: vid }] }, select: VIEW_SELECT });
  if (!row) throw new CrmViewError("NOT_FOUND", MSG_NO_VIEW);
  return row;
}

/** ผู้ดูเป็นหัวหน้าของทีมที่มุมมองแชร์ให้ และผู้บันทึกมุมมองไม่ได้เป็นสมาชิกของร้านแล้ว */
async function departedTeamViewLead(ctx: CrmViewCtx, actor: Actor, row: ViewRow): Promise<boolean> {
  if (row.scope !== "TEAM" || !row.teamId || !row.ownerUserId || row.ownerUserId === actor.userId) return false;
  if (!(await departedOwners(ctx.tenantId, [row.ownerUserId])).has(row.ownerUserId)) return false;
  return (await leadTeamIds(ctx.tenantId, actor.userId ?? "")).includes(row.teamId);
}

function assertEditable(row: ViewRow, actor: Actor): void {
  if (row.ownerUserId === actor.userId || actor.role === "OWNER") return;
  throw new CrmViewError("FORBIDDEN", "แก้ไขหรือลบมุมมองนี้ได้เฉพาะคนที่บันทึกไว้หรือเจ้าของร้าน");
}

/** แก้ชื่อ/ขอบเขต/ตัวกรองของมุมมอง (เจ้าของมุมมองหรือ OWNER) */
export async function updateView(ctx: CrmViewCtx, actor: Actor, id: string, patch: UpdateViewInput): Promise<CrmViewDto> {
  if (!actor || actor.role === "CUSTOMER") throw new CrmViewError("NOT_FOUND", MSG_NO_SYSTEM);
  await requireSystem(ctx);
  const row = await loadVisible(ctx, actor, id);
  const objectKey = await enter(ctx, actor, row.objectKey);
  assertEditable(row, actor);
  const scope: CrmViewScope = patch?.scope ? (patch.scope === "TEAM" ? "TEAM" : "PRIVATE") : row.scope === "TEAM" ? "TEAM" : "PRIVATE";
  const scopeChanged = scope !== (row.scope === "TEAM" ? "TEAM" : "PRIVATE") || (patch?.teamId !== undefined && patch.teamId !== row.teamId);
  const teamId = scopeChanged ? await cleanTeam(ctx, actor, scope, patch?.teamId ?? row.teamId) : row.teamId;
  const nextFilters = patch?.filters !== undefined && patch.filters !== null ? whitelistViewFilters(objectKey, patch.filters) : null;
  // รีวิว S4 + รอบ 2 NOTE-6: แก้ตัวกรอง **หรือขอบเขต** (แชร์ให้ทีม) = ตรวจตัวกรองชุดที่จะมีผลอีกรอบ
  if (nextFilters || scopeChanged) await assertUsableFilters(ctx, actor, objectKey, nextFilters ?? whitelistViewFilters(objectKey, row.filters));
  const data: Prisma.MemberSavedViewUpdateInput = {
    ...(patch?.name !== undefined && patch.name !== null ? { name: cleanName(patch.name) } : {}),
    ...(scopeChanged ? { scope, teamId } : {}),
    ...(nextFilters ? { filters: nextFilters as Prisma.InputJsonValue } : {}),
  };
  const out = await prisma.memberSavedView.update({ where: { id: row.id }, data, select: VIEW_SELECT });
  await writeAudit({ tenantId: ctx.tenantId, actorId: ctx.actorUserId ?? actor.userId ?? null, action: "crm.view.update", targetType: "MemberSavedView", targetId: row.id, before: { scope: row.scope, teamId: row.teamId, name: row.name }, after: { scope: out.scope, teamId: out.teamId, name: out.name } });
  return toDto(out, actor);
}

/** ลบมุมมอง (เจ้าของมุมมองหรือ OWNER · มองไม่เห็น = NOT_FOUND แถวคงอยู่) */
export async function deleteView(ctx: CrmViewCtx, actor: Actor, id: string): Promise<{ ok: true }> {
  if (!actor || actor.role === "CUSTOMER") throw new CrmViewError("NOT_FOUND", MSG_NO_SYSTEM);
  await requireSystem(ctx);
  const row = await loadVisible(ctx, actor, id);
  await enter(ctx, actor, row.objectKey);
  // รีวิว N6: มุมมองแบบทีมของคนที่ออกจากร้านไปแล้ว — หัวหน้าทีมนั้นลบได้ (ไม่งั้นค้างในรายการของทั้งทีมตลอดไป)
  if (!(await departedTeamViewLead(ctx, actor, row))) assertEditable(row, actor);
  await prisma.memberSavedView.delete({ where: { id: row.id } });
  await writeAudit({ tenantId: ctx.tenantId, actorId: ctx.actorUserId ?? actor.userId ?? null, action: "crm.view.delete", targetType: "MemberSavedView", targetId: row.id, before: { objectKey: row.objectKey, scope: row.scope, teamId: row.teamId, name: row.name } });
  return { ok: true };
}

/**
 * สำหรับ list*({ savedViewId }) ของ contacts/companies/deals: ตัวกรอง (whitelist) ของมุมมองที่ actor เห็น — มองไม่เห็น = null
 * (ผู้เรียกโยน NOT_FOUND ของตัวเอง ⇒ หน้ารายการยังจับ error ชนิดเดิมได้) · ไม่ตรวจ uiVersion/คีย์ (ผู้เรียกผ่านด่านของตัวเองแล้ว)
 */
export async function resolveViewFilters(ctx: CrmViewCtx, actor: Actor, objectKey: CrmViewObjectKey, viewId: string): Promise<Record<string, unknown> | null> {
  const row = await prisma.memberSavedView.findFirst({ where: { AND: [await viewVisibleWhere(ctx, actor, objectKey), { id: viewId }] }, select: { filters: true } });
  if (!row) return null;
  return (await dropDeadFieldFilters(ctx, objectKey, whitelistViewFilters(objectKey, row.filters))).filters;
}

/**
 * CRM C5.4-E ▸ L6-m11: ตัวกรองฟิลด์ (`f.<key>`) ของมุมมองที่บันทึกไว้ ซึ่งฟิลด์ถูกเก็บเข้าคลัง/ลบ/ปิด "ใช้กรองได้" ไปแล้ว **ถูกข้าม**
 * (เดิมทั้งรายการตอบ VALIDATION ให้ทุกคนที่ใช้มุมมองนั้น และ STAFF แก้มุมมองของทีมไม่ได้) · คืนป้ายของตัวที่ข้ามให้หน้ารายการบอกผู้ใช้
 * ตัวกรองที่ผู้ใช้กดเองในหน้า (ไม่ได้มาจากมุมมอง) ยังตรวจตามเดิม ◂
 */
async function dropDeadFieldFilters(ctx: CrmViewCtx, objectKey: CrmViewObjectKey, filters: Record<string, unknown>): Promise<{ filters: Record<string, unknown>; skipped: string[] }> {
  const f = isObj(filters.f) ? filters.f : null;
  const keys = f ? Object.keys(f) : [];
  if (!f || keys.length === 0) return { filters, skipped: [] };
  const defs = await prisma.memberField.findMany({
    where: { tenantId: ctx.tenantId, systemId: ctx.systemId, objectKey, key: { in: keys } },
    select: { key: true, label: true, archivedAt: true, filterable: true },
  });
  const byKey = new Map(defs.map((d) => [d.key, d]));
  const live: Record<string, unknown> = {};
  const skipped: string[] = [];
  for (const k of keys) {
    const d = byKey.get(k);
    if (d && !d.archivedAt && d.filterable) live[k] = f[k];
    else skipped.push(d?.label ?? k);
  }
  if (skipped.length === 0) return { filters, skipped };
  const out: Record<string, unknown> = { ...filters };
  if (Object.keys(live).length > 0) out.f = live;
  else delete out.f;
  return { filters: out, skipped };
}

/** CRM C5.4-E ▸ L6-m11: ป้ายของตัวกรองในมุมมองที่ถูกข้าม (ฟิลด์เก็บเข้าคลังแล้ว) — หน้ารายการแสดงเป็นหมายเหตุ · มองไม่เห็นมุมมอง = [] ◂ */
export async function viewSkippedFilters(ctx: CrmViewCtx, actor: Actor, objectKey: CrmViewObjectKey, viewId: string): Promise<string[]> {
  const row = await prisma.memberSavedView.findFirst({ where: { AND: [await viewVisibleWhere(ctx, actor, objectKey), { id: viewId }] }, select: { filters: true } });
  return row ? (await dropDeadFieldFilters(ctx, objectKey, whitelistViewFilters(objectKey, row.filters))).skipped : [];
}

/** ตัวเลือกมุมมองของหน้ารายการ (id · ชื่อ · แก้ได้ไหม) — กติกาการมองเห็นเดียวกับ listViews · ไม่มีด่าน uiVersion (หน้ารายการตัดสินแล้ว) */
export async function viewOptions(ctx: CrmViewCtx, actor: Actor, objectKey: CrmViewObjectKey): Promise<{ id: string; name: string; editable: boolean }[]> {
  const rows = await ownThenShared(ctx, actor, objectKey); // รีวิวรอบ 2 NOTE-4
  // รีวิว N6: ปุ่มลบโผล่ให้หัวหน้าทีมด้วย เมื่อผู้บันทึกมุมมองแบบทีมออกจากร้านไปแล้ว
  const teamRows = rows.filter((r) => r.scope === "TEAM" && r.teamId && r.ownerUserId && r.ownerUserId !== actor.userId);
  const [gone, leads] = teamRows.length ? await Promise.all([departedOwners(ctx.tenantId, teamRows.map((r) => r.ownerUserId)), leadTeamIds(ctx.tenantId, actor.userId ?? "")]) : [new Set<string>(), [] as string[]];
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    editable: (!!actor.userId && r.ownerUserId === actor.userId) || actor.role === "OWNER" || (r.scope === "TEAM" && !!r.teamId && !!r.ownerUserId && gone.has(r.ownerUserId) && leads.includes(r.teamId)),
  }));
}

/** ทีมที่ผู้บันทึกแชร์มุมมองให้ได้ (ทีมที่ตัวเองอยู่ · MANAGER/OWNER = ทุกทีมของร้าน) */
export async function viewTeamOptions(ctx: CrmViewCtx, actor: Actor): Promise<{ id: string; name: string }[]> {
  const where: Prisma.TeamWhereInput = { tenantId: ctx.tenantId, archivedAt: null };
  if (actor.role !== "OWNER" && actor.role !== "MANAGER") where.id = { in: await myTeamIds(ctx.tenantId, actor.userId ?? "") };
  return prisma.team.findMany({ where, select: { id: true, name: true }, orderBy: { name: "asc" }, take: 200 });
}
