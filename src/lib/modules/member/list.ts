// list.ts — หน้ารวมสมาชิก (M1.5 · พิมพ์เขียว docs/modules/06-member-v2.md §3.1 §6.1 §12 · ภาพ 01)
//
// สิ่งที่ไฟล์นี้เป็นเจ้าของ
//   • listMembers    — ตาราง/ค้นหา/กรองทุกฟิลด์ (รวมกำหนดเอง)/เรียง/แบ่งหน้า
//   • getMemberKpis  — KPI 6 ช่องบนหัวหน้ารวม
//   • bulkSetTags    — ติ๊กเลือกหลายคน → แท็ก (AuditLog 1 แถวต่อครั้ง ไม่ใช่ต่อคน)
//   • exportMembers  — ส่งออก CSV (BOM + header ไทย + เพดาน + AuditLog)
//
// 🔴 unit scope (§6.1): STAFF/MANAGER ที่ unitAccess จำกัด เห็นสมาชิกที่ homeUnitId อยู่ในสิทธิ์ตน
//    **หรือ** เคยมีกิจกรรม (MemberActivity.unitId) ที่สาขาตน — ต่างจากตัวกรอง `unit=` ที่ผู้ใช้พิมพ์เอง
//    ซึ่งเป็นการเทียบ homeUnitId ตรง ๆ (ไม่ OR กับกิจกรรม) ทั้งสองเงื่อนไขรวมกันด้วย AND เสมอ
// 🔴 prisma ผ่าน `./db` (จุดเดียวของโมดูลที่ล้วง core — F5 ratchet เต็มเพดานแล้ว)

import type { MemberSource, MemberStatus, Prisma } from "@prisma/client";
import { writeAudit } from "@/lib/core/audit";
import { csvRow } from "@/lib/core/csv";
import { prisma } from "./db";
import { coversUnit, hasMemberPerm, isUnitScoped, canReadMember, VISIT_SCOPE_MODULES, type MemberActor } from "./access";
import { evaluateSensitiveAccess, logAccessMany, type MemberCtx, type SensitiveDecision, type SensitiveTarget } from "./privacy";
import { MemberForbiddenError, MemberInputError, MemberNotFoundError } from "./errors";
import * as fields from "./fields";
import { displayOf, maskPhone, pointsOfMany } from "./profile";
import { getTierRules, type RuleCondition } from "./tiers";
import { memberSourceLabel } from "./member-source-labels";
import { MEMBER_LIMITS, memberLimitError } from "./limits";

// ───────────────────────── ชนิดข้อมูลสาธารณะ ─────────────────────────

export type MemberSort = "-lastActivityAt" | "name" | "-spent12m" | "-points" | "memberCode" | "-createdAt";

export type MemberListRow = {
  id: string;
  memberCode: string;
  name: string;
  phoneMasked: string;
  tier: { key: string; name: string; color: string } | null;
  spent12mSatang: number;
  visits12m: number;
  lastActivityAt: Date | null;
  points: number;
  tags: string[];
  homeUnit: { id: string; name: string } | null;
  listFields: Record<string, string>;
  /** ภาพ 01 — "อีก ฿X เลื่อน {ระดับถัดไป}" ใต้ชื่อ เมื่อขาดยอด 12 เดือน ≤ 30% ของเกณฑ์กฎเลื่อนระดับถัดไป */
  upgradeHint: { nextTierName: string; shortfallSatang: number } | null;
};

export type ListMembersOptions = {
  q?: string;
  /** key หรือ id ของ MemberTierDef */
  tier?: string;
  /** BusinessUnit.id — เทียบ homeUnitId ตรง ๆ (ไม่ OR กับกิจกรรม ต่างจาก unit scope ของ actor) */
  unit?: string;
  tag?: string;
  source?: string;
  /** ไม่ส่ง = ทุกสถานะยกเว้น MERGED (นับ SUSPENDED ด้วย) */
  status?: string;
  /** ตัวกรองฟิลด์กำหนดเอง — ผ่าน fields.fieldFilterWhere (throw ไทยถ้าไม่ filterable) */
  f?: Record<string, string>;
  /** ใช้ filters/sort ของ MemberSavedView แทน — ค่าที่ส่งมาพร้อมกันใน opts ทับ config ของมุมมองเสมอ */
  viewId?: string;
  sort?: MemberSort;
  page?: number;
  /** ≤ 100 — เกิน = throw ไทย */
  take?: number;
};

export type ListMembersResult = { items: MemberListRow[]; total: number; page: number; take: number };

export type MemberKpis = {
  total: number;
  newThisMonth: number;
  active90d: number;
  pointsOutstanding: number;
  /** ยังไม่มีตาราง voucher (M2.5) — ค่าคงที่ 0 จนกว่าใบนั้นจะมา */
  vouchersUnused: number;
  /** M3.4 — คะแนนรีวิวเฉลี่ยของร้าน (null = ยังไม่มีรีวิวที่ส่งแล้ว) */
  reviewAvg: number | null;
};

export type BulkTagsPatch = { add?: string[]; remove?: string[] };
export type BulkTagsResult = { updated: number; skipped: number };

export type ExportMembersOptions = { filters?: ListMembersOptions; columns: string[] };
export type ExportMembersResult = { csv: string; rows: number };

// ───────────────────────── ตัวช่วยภายใน ─────────────────────────

const STATUS_VALUES: readonly string[] = ["ACTIVE", "SUSPENDED", "CLOSED", "MERGED"];
const SOURCE_VALUES: readonly string[] = [
  "WALK_IN", "POS", "BOOKING", "LINE_OA", "LIFF", "WEB_FORM", "CHAT",
  "REFERRAL", "IMPORT", "CRM", "CAMPAIGN", "API", "MARKETPLACE", "APP", "OTHER",
];

type CustomerRow = Prisma.CustomerGetPayload<Record<string, never>>;

function requireCanRead(actor: MemberActor): void {
  if (!canReadMember(actor)) {
    throw new MemberForbiddenError("บัญชีของคุณยังไม่ได้รับสิทธิ์เข้าโมดูลสมาชิก — ขอสิทธิ์จากเจ้าของร้านก่อน");
  }
}

// ───────────────────────── ฟิลด์อ่อนไหวในหน้ารวม/ไฟล์ส่งออก (AUDIT H2) ─────────────────────────
//
// 🔴 หน้า 360 ตัดฟิลด์อ่อนไหวด้วยนโยบาย D8 มาตั้งแต่ M1.7 แต่ "คอลัมน์ของหน้ารวม" กับ "ไฟล์ส่งออก"
//    อ่านค่าจาก `fields.getFieldValues` ตรง ๆ ⇒ พนักงานที่มี `member.customer.export` ดึงค่าอ่อนไหว
//    ของทุกคนในขอบเขตตัวเองได้โดยไม่มีร่องรอย · ที่นี่ใช้ด่านเดียวกับ 360 (`evaluateSensitiveAccess`)
// 🔴 ฟิลด์ถือว่า "อ่อนไหว" เมื่อตัวมันติดธง หรืออยู่ในส่วนที่ติดธง — เป้าหมายของนโยบายก็ตามนั้น
//    (ส่วน = SECTION/section.id · ฟิลด์เดี่ยว = FIELD/field.id) เหมือน `getMember360`

type SensitiveField = { key: string; targetType: SensitiveTarget["targetType"]; targetId: string };

function sensitiveFieldsOf(layout: { sections: { id: string; sensitive: boolean; fields: { id: string; key: string; sensitive: boolean }[] }[] }): Map<string, SensitiveField> {
  const out = new Map<string, SensitiveField>();
  for (const s of layout.sections) {
    for (const f of s.fields) {
      if (s.sensitive) out.set(f.key, { key: f.key, targetType: "SECTION", targetId: s.id });
      else if (f.sensitive) out.set(f.key, { key: f.key, targetType: "FIELD", targetId: f.id });
    }
  }
  return out;
}

/**
 * ตัวตัดสิน "actor นี้เห็นฟิลด์อ่อนไหวตัวนี้ของสมาชิกคนนี้ไหม" แบบใช้ซ้ำได้ทั้งหน้ารวมและไฟล์ส่งออก
 * 🔴 actor ที่เห็นทุกสาขาอยู่แล้ว (ไม่ถูกจำกัดสาขา · ไม่ใช่ลูกค้า) ⇒ คำตอบไม่ขึ้นกับตัวสมาชิก
 *    (เงื่อนไขเดียวที่ขึ้นกับสมาชิกคือ `sameUnitOnly` ซึ่ง `coversUnit` ผ่านเสมอสำหรับคนแบบนี้)
 *    ⇒ ตัดสินครั้งเดียวต่อเป้าหมาย ไม่ยิงนโยบาย 2 คิวรีต่อแถว (ไฟล์ส่งออกมีได้ถึงหลักหมื่นแถว)
 */
function sensitiveJudge(ctx: MemberCtx, actor: MemberActor) {
  const perTarget = actor.role !== "CUSTOMER" && !isUnitScoped(actor);
  const cache = new Map<string, SensitiveDecision>();
  return async (f: SensitiveField, customerId: string): Promise<SensitiveDecision> => {
    const cacheKey = perTarget ? `${f.targetType}:${f.targetId}` : `${f.targetType}:${f.targetId}:${customerId}`;
    const hit = cache.get(cacheKey);
    if (hit) return hit;
    const decision = await evaluateSensitiveAccess(ctx, actor, { targetType: f.targetType, targetId: f.targetId, customerId });
    cache.set(cacheKey, decision);
    return decision;
  };
}

function tagsOf(row: { tags: Prisma.JsonValue }): string[] {
  return Array.isArray(row.tags) ? row.tags.filter((t): t is string => typeof t === "string") : [];
}

function displayNameOf(r: Pick<CustomerRow, "name" | "firstName" | "lastName" | "memberCode">): string {
  return r.name ?? ([r.firstName, r.lastName].filter(Boolean).join(" ") || r.memberCode || "");
}

/** ขอบเขตสาขาของ actor (§6.1) — homeUnitId ในสิทธิ์ตน หรือเคยมีกิจกรรมที่สาขาตน */
function actorScopeWhere(actor: MemberActor): Prisma.CustomerWhereInput | null {
  if (!isUnitScoped(actor)) return null;
  // M3.7 — นับเฉพาะแถว "ซื้อ/จอง/ใช้บริการ" (VISIT_SCOPE_MODULES) ด่านเดียวกับ profile.assertVisible
  return { OR: [{ homeUnitId: { in: actor.unitAccess } }, { activities: { some: { unitId: { in: actor.unitAccess }, module: { in: [...VISIT_SCOPE_MODULES] } } } }] };
}

async function buildWhere(ctx: MemberCtx, actor: MemberActor, opts: ListMembersOptions): Promise<Prisma.CustomerWhereInput> {
  const AND: Prisma.CustomerWhereInput[] = [];

  if (opts.status) {
    if (!STATUS_VALUES.includes(opts.status)) throw new MemberInputError(`สถานะ "${opts.status}" ไม่ถูกต้อง`);
    AND.push({ status: opts.status as MemberStatus });
  } else {
    AND.push({ status: { not: "MERGED" } });
  }

  const q = opts.q?.trim();
  if (q) {
    AND.push({
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { firstName: { contains: q, mode: "insensitive" } },
        { lastName: { contains: q, mode: "insensitive" } },
        { nickname: { contains: q, mode: "insensitive" } },
        { phone: { contains: q } },
        { phone2: { contains: q } },
        { email: { contains: q, mode: "insensitive" } },
        { memberCode: { contains: q, mode: "insensitive" } },
      ],
    });
  }

  if (opts.tier) {
    const tierDef = await prisma.memberTierDef.findFirst({ where: { systemId: ctx.systemId, OR: [{ id: opts.tier }, { key: opts.tier }] } });
    // ระดับที่พิมพ์มาไม่มีจริง — กรองแบบไม่มีทางเจอ แทนที่จะ throw (ตัวกรองที่ยังพิมพ์ไม่สุด ไม่ควรทำหน้าแตก)
    AND.push({ tierDefId: tierDef?.id ?? "__no_such_tier__" });
  }

  if (opts.unit) {
    // ขอสาขาที่ actor เองไม่มีสิทธิ์ดูแล → ไม่มีทางเจอ (ไม่รั่วว่าใครอยู่สาขานั้นผ่านการ "เคยมีกิจกรรม" ข้ามสาขา
    // ของ actor เอง — ต่างจาก scope ปริยายด้านล่างที่ตั้งใจ OR กับกิจกรรมของ "สาขาตน" เมื่อไม่ได้ระบุ unit เอง)
    if (isUnitScoped(actor) && !coversUnit(actor, opts.unit)) AND.push({ id: "__unit_outside_actor_scope__" });
    else AND.push({ homeUnitId: opts.unit });
  }
  if (opts.tag) AND.push({ tags: { array_contains: [opts.tag] } });

  if (opts.source) {
    if (!SOURCE_VALUES.includes(opts.source)) throw new MemberInputError(`ที่มา "${opts.source}" ไม่ถูกต้อง`);
    AND.push({ source: opts.source as MemberSource });
  }

  if (opts.f && Object.keys(opts.f).length > 0) {
    const fieldCtx: fields.FieldCtx = { tenantId: ctx.tenantId, systemId: ctx.systemId, actorUserId: ctx.actorUserId };
    AND.push(await fields.fieldFilterWhere(fieldCtx, opts.f));
  }

  const scope = actorScopeWhere(actor);
  if (scope) AND.push(scope);

  return { tenantId: ctx.tenantId, memberSystemId: ctx.systemId, AND };
}

function orderByOf(sort: MemberSort): Prisma.CustomerOrderByWithRelationInput[] {
  switch (sort) {
    case "-spent12m":
      return [{ spent12mSatang: "desc" }, { id: "asc" }];
    case "memberCode":
      return [{ memberCode: "asc" }];
    case "-createdAt":
      return [{ createdAt: "desc" }, { id: "asc" }];
    default:
      return [{ lastActivityAt: { sort: "desc", nulls: "last" } }, { id: "asc" }];
  }
}

const LIST_SELECT = {
  id: true,
  memberCode: true,
  name: true,
  firstName: true,
  lastName: true,
  nickname: true,
  phone: true,
  tags: true,
  tierDefId: true,
  spent12mSatang: true,
  visits12m: true,
  lastActivityAt: true,
  homeUnitId: true,
  status: true,
  createdAt: true,
} satisfies Prisma.CustomerSelect;

type ListRow = Prisma.CustomerGetPayload<{ select: typeof LIST_SELECT }>;

async function toRows(ctx: MemberCtx, actor: MemberActor, rows: ListRow[]): Promise<MemberListRow[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const tierIds = [...new Set(rows.map((r) => r.tierDefId).filter((x): x is string => !!x))];
  const unitIds = [...new Set(rows.map((r) => r.homeUnitId).filter((x): x is string => !!x))];
  const fieldCtx: fields.FieldCtx = { tenantId: ctx.tenantId, systemId: ctx.systemId, actorUserId: ctx.actorUserId };

  const [tiers, ladder, units, points, layout, values] = await Promise.all([
    tierIds.length ? prisma.memberTierDef.findMany({ where: { tenantId: ctx.tenantId, id: { in: tierIds } } }) : Promise.resolve([]),
    // บันไดระดับทั้งหมด (≤ MEMBER_LIMITS.tiers แถว) — ใช้หา "ระดับถัดไป" ของแต่ละแถวด้วย sortOrder
    prisma.memberTierDef.findMany({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, archivedAt: null }, orderBy: { sortOrder: "asc" } }),
    unitIds.length ? prisma.businessUnit.findMany({ where: { tenantId: ctx.tenantId, id: { in: unitIds } } }) : Promise.resolve([]),
    pointsOfMany(ctx, ids),
    fields.listLayout(fieldCtx),
    fields.getFieldValues(fieldCtx, ids),
  ]);

  const tierById = new Map(tiers.map((t) => [t.id, t]));
  const unitById = new Map(units.map((u) => [u.id, u]));
  // ภาพ 01: คอลัมน์ท้ายตารางมาจากฟิลด์ "กำหนดเอง" ที่เปิด showInList เท่านั้น (isSystem ซ้ำกับคอลัมน์คงที่อยู่แล้ว
  // เช่น รหัส/ชื่อ/เบอร์/อีเมล — โผล่ซ้ำ + หลุดอีเมลเต็มถ้าไม่กรองออก)
  const listFieldDefs = layout.sections.flatMap((s) => s.fields).filter((f) => f.showInList && !f.isSystem);
  // 🔴 AUDIT H2: คอลัมน์ท้ายตารางที่เป็นฟิลด์อ่อนไหว ต้องผ่านนโยบาย D8 ของ actor คนนี้ก่อนจึงจะมีค่า
  const sensitiveByKey = sensitiveFieldsOf(layout);
  const judge = sensitiveJudge(ctx, actor);
  const hiddenPerCustomer = new Map<string, Set<string>>();
  for (const r of rows) {
    const hidden = new Set<string>();
    for (const f of listFieldDefs) {
      const sf = sensitiveByKey.get(f.key);
      if (!sf) continue;
      const decision = await judge(sf, r.id);
      if (!decision.allowed) hidden.add(f.key);
    }
    hiddenPerCustomer.set(r.id, hidden);
  }

  // "อีก ฿X เลื่อน {ระดับถัดไป}" — เกณฑ์ spent12m ของกฎเลื่อนระดับของ "ระดับถัดไปในบันได" (sortOrder ถัดจากระดับปัจจุบัน)
  // ไม่เรียก evaluateMember ทีละคน (แพง) — อ่านกฎเลื่อนของระดับถัดไปแค่ครั้งเดียวต่อระดับ แล้วเทียบ spent12mSatang cache เอง
  const ladderById = new Map(ladder.map((t) => [t.id, t]));
  const ladderIndexById = new Map(ladder.map((t, i) => [t.id, i]));
  const nextTierIdOf = (tierDefId: string | null): string | null => {
    if (!tierDefId) return null;
    const idx = ladderIndexById.get(tierDefId);
    if (idx === undefined) return null;
    const next = ladder[idx + 1];
    return next ? next.id : null;
  };
  const neededNextIds = [...new Set(rows.map((r) => nextTierIdOf(r.tierDefId)).filter((x): x is string => !!x))];
  const condEntries = await Promise.all(
    neededNextIds.map(async (nid): Promise<readonly [string, RuleCondition | null]> => {
      const rules = await getTierRules(ctx, nid).catch(() => null);
      const cond = rules?.upgrade?.conditions.find((c) => c.field === "spent12m" && c.op === "gte") ?? null;
      return [nid, cond] as const;
    }),
  );
  const condByNextId = new Map(condEntries);

  return rows.map((r) => {
    const bag = values[r.id] ?? {};
    const hidden = hiddenPerCustomer.get(r.id) ?? new Set<string>();
    const listFields: Record<string, string> = {};
    for (const f of listFieldDefs) {
      // 🔴 AUDIT H2: ดูไม่ได้ = ไม่มีคีย์นี้ใน DTO เลย (ไม่ใช่ส่งค่าไปแล้วให้หน้าจอซ่อน)
      if (hidden.has(f.key)) continue;
      const v = bag[f.key];
      if (v === undefined || v === null) continue;
      listFields[f.key] = displayOf(f, v);
    }
    const t = r.tierDefId ? (tierById.get(r.tierDefId) ?? null) : null;
    const u = r.homeUnitId ? (unitById.get(r.homeUnitId) ?? null) : null;

    const nextId = nextTierIdOf(r.tierDefId);
    const nextTierRow = nextId ? (ladderById.get(nextId) ?? null) : null;
    const cond = nextId ? (condByNextId.get(nextId) ?? null) : null;
    let upgradeHint: MemberListRow["upgradeHint"] = null;
    if (cond && nextTierRow && typeof cond.value === "number") {
      const target = cond.value;
      const shortfall = target - Number(r.spent12mSatang);
      if (target > 0 && shortfall > 0 && shortfall / target <= 0.3) {
        upgradeHint = { nextTierName: nextTierRow.name, shortfallSatang: shortfall };
      }
    }

    return {
      id: r.id,
      memberCode: r.memberCode ?? "",
      name: displayNameOf(r),
      phoneMasked: maskPhone(r.phone),
      tier: t ? { key: t.key, name: t.name, color: t.color } : null,
      spent12mSatang: Number(r.spent12mSatang),
      visits12m: r.visits12m,
      lastActivityAt: r.lastActivityAt,
      points: points[r.id] ?? 0,
      tags: tagsOf(r),
      homeUnit: u ? { id: u.id, name: u.name } : null,
      listFields,
      upgradeHint,
    };
  });
}

// ───────────────────────── listMembers ─────────────────────────

export async function listMembers(ctx: MemberCtx, actor: MemberActor, opts: ListMembersOptions = {}): Promise<ListMembersResult> {
  requireCanRead(actor);

  let effective: ListMembersOptions = opts;
  if (opts.viewId) {
    const view = await prisma.memberSavedView.findFirst({ where: { id: opts.viewId, tenantId: ctx.tenantId, systemId: ctx.systemId } });
    if (!view) throw new MemberNotFoundError("ไม่พบมุมมองที่บันทึกไว้นี้ — อาจถูกลบไปแล้ว");
    const viewFilters = (view.filters ?? {}) as Partial<ListMembersOptions>;
    const viewSort = view.sort as MemberSort | null;
    // ค่าที่ผู้ใช้ส่งมาเองใน opts ทับ config ของมุมมองเสมอ (แบบเดียวกับ K2.5)
    effective = { ...viewFilters, ...(viewSort ? { sort: viewSort } : {}), ...opts };
  }

  const take = effective.take ?? 50;
  if (take > 100) throw new MemberInputError("แสดงได้สูงสุด 100 รายการต่อหน้า — ลดจำนวนต่อหน้าแล้วลองใหม่");
  if (take < 1) throw new MemberInputError("จำนวนต่อหน้าต้องมากกว่า 0");
  const page = Math.max(1, effective.page ?? 1);
  const sort = effective.sort ?? "-lastActivityAt";

  const where = await buildWhere(ctx, actor, effective);

  let total: number;
  let rows: ListRow[];

  if (sort === "name" || sort === "-points") {
    const all = await prisma.customer.findMany({ where, select: LIST_SELECT });
    total = all.length;
    let sorted = all;
    if (sort === "name") {
      sorted = [...all].sort((a, b) => displayNameOf(a).localeCompare(displayNameOf(b), "th"));
    } else {
      const pts = await pointsOfMany(ctx, all.map((r) => r.id));
      sorted = [...all].sort((a, b) => (pts[b.id] ?? 0) - (pts[a.id] ?? 0));
    }
    rows = sorted.slice((page - 1) * take, (page - 1) * take + take);
  } else {
    const orderBy = orderByOf(sort);
    [total, rows] = await Promise.all([
      prisma.customer.count({ where }),
      prisma.customer.findMany({ where, select: LIST_SELECT, orderBy, skip: (page - 1) * take, take }),
    ]);
  }

  const items = await toRows(ctx, actor, rows);
  return { items, total, page, take };
}

// ───────────────────────── getMemberKpis ─────────────────────────

export async function getMemberKpis(ctx: MemberCtx, actor: MemberActor): Promise<MemberKpis> {
  requireCanRead(actor);
  const scope = actorScopeWhere(actor);
  const base: Prisma.CustomerWhereInput = {
    tenantId: ctx.tenantId,
    memberSystemId: ctx.systemId,
    status: { not: "MERGED" },
    ...(scope ? { AND: [scope] } : {}),
  };

  // เดือนไทยปัจจุบัน (+07:00) — ต้นเดือนแปลงกลับเป็น UTC ก่อนเทียบ createdAt
  const nowBkk = new Date(Date.now() + 7 * 3600_000);
  const monthStart = new Date(Date.UTC(nowBkk.getUTCFullYear(), nowBkk.getUTCMonth(), 1) - 7 * 3600_000);
  const active90 = new Date(Date.now() - 90 * 86_400_000);

  const [total, newThisMonth, active90d, pointsAgg, reviewAgg] = await Promise.all([
    prisma.customer.count({ where: base }),
    prisma.customer.count({ where: { ...base, createdAt: { gte: monthStart } } }),
    prisma.customer.count({ where: { ...base, lastActivityAt: { gte: active90 } } }),
    prisma.pointBalance.aggregate({ where: { tenantId: ctx.tenantId }, _sum: { balance: true } }),
    // M3.4 — คะแนนรีวิวเฉลี่ยของร้าน (รีวิวที่ส่งแล้ว · ไม่นับที่ซ่อน/ยังไม่ส่ง — กติกาเดียวกับ reviews.reviewStats)
    prisma.memberReview.aggregate({
      where: { tenantId: ctx.tenantId, systemId: ctx.systemId, status: { in: ["NEW", "REPLIED", "ESCALATED"] }, rating: { gte: 1 } },
      _avg: { rating: true },
    }),
  ]);

  return {
    total,
    newThisMonth,
    active90d,
    pointsOutstanding: Number(pointsAgg._sum.balance ?? 0),
    vouchersUnused: 0,
    reviewAvg: reviewAgg._avg.rating === null ? null : Math.round(reviewAgg._avg.rating * 100) / 100,
  };
}

// ───────────────────────── bulkSetTags ─────────────────────────

export async function bulkSetTags(ctx: MemberCtx, actor: MemberActor, ids: string[], patch: BulkTagsPatch): Promise<BulkTagsResult> {
  if (!hasMemberPerm(actor, "member.customer.update")) {
    throw new MemberForbiddenError("บัญชีของคุณยังไม่ได้รับสิทธิ์แก้ไขสมาชิก — ขอสิทธิ์ member.customer.update จากเจ้าของร้านก่อน");
  }
  const uniqueIds = [...new Set((ids ?? []).filter((x) => typeof x === "string" && x))];
  const add = new Set((patch.add ?? []).map((t) => t.trim()).filter(Boolean));
  const remove = new Set((patch.remove ?? []).map((t) => t.trim()).filter(Boolean));
  if (uniqueIds.length === 0) return { updated: 0, skipped: 0 };

  const rows = await prisma.customer.findMany({ where: { id: { in: uniqueIds }, tenantId: ctx.tenantId, memberSystemId: ctx.systemId } });
  const byId = new Map(rows.map((r) => [r.id, r]));

  let updated = 0;
  let skipped = 0;
  for (const id of uniqueIds) {
    const row = byId.get(id);
    if (!row) {
      skipped++;
      continue;
    }
    if (isUnitScoped(actor) && !coversUnit(actor, row.homeUnitId)) {
      const seen = await prisma.memberActivity.count({ where: { tenantId: ctx.tenantId, customerId: row.id, unitId: { in: actor.unitAccess }, module: { in: [...VISIT_SCOPE_MODULES] } } });
      if (seen === 0) {
        skipped++;
        continue;
      }
    }
    const current = tagsOf(row);
    const next = [...new Set([...current.filter((t) => !remove.has(t)), ...add])];
    if (JSON.stringify(next) !== JSON.stringify(current)) {
      await prisma.customer.update({ where: { id: row.id }, data: { tags: next } });
    }
    updated++;
  }

  await writeAudit({
    tenantId: ctx.tenantId,
    actorId: ctx.actorUserId ?? undefined,
    action: "member.bulk.tags",
    targetType: "Customer",
    after: { ids: uniqueIds, add: [...add], remove: [...remove], updated, skipped },
  });

  return { updated, skipped };
}

// ───────────────────────── exportMembers ─────────────────────────

const EXPORT_LABELS: Record<string, string> = {
  memberCode: "รหัสสมาชิก",
  name: "ชื่อ",
  phone: "เบอร์โทร",
  phone2: "เบอร์สำรอง",
  email: "อีเมล",
  tier: "ระดับ",
  status: "สถานะ",
  spent12m: "ยอด 12 เดือน",
  visits12m: "จำนวนครั้ง",
  lastActivityAt: "มาล่าสุด",
  points: "แต้ม",
  tags: "แท็ก",
  homeUnit: "สาขา",
  source: "ที่มา",
  createdAt: "วันที่สมัคร",
};

export async function exportMembers(ctx: MemberCtx, actor: MemberActor, opts: ExportMembersOptions): Promise<ExportMembersResult> {
  if (!hasMemberPerm(actor, "member.customer.export")) {
    throw new MemberForbiddenError("บัญชีของคุณยังไม่ได้รับสิทธิ์ส่งออกรายชื่อสมาชิก — ขอสิทธิ์ member.customer.export จากเจ้าของร้านก่อน");
  }
  const requested = opts.columns?.length ? opts.columns : ["memberCode", "name", "phone"];
  const where = await buildWhere(ctx, actor, opts.filters ?? {});

  const total = await prisma.customer.count({ where });
  if (total > MEMBER_LIMITS.exportRows) {
    throw memberLimitError(`ส่งออกได้ไม่เกิน ${MEMBER_LIMITS.exportRows} แถวต่อครั้ง (ตัวกรองนี้พบ ${total} แถว) — กรองให้แคบลงก่อนแล้วลองใหม่`);
  }

  const rows = await prisma.customer.findMany({ where, orderBy: [{ memberCode: "asc" }], take: MEMBER_LIMITS.exportRows });
  const ids = rows.map((r) => r.id);
  const tierIds = [...new Set(rows.map((r) => r.tierDefId).filter((x): x is string => !!x))];
  const unitIds = [...new Set(rows.map((r) => r.homeUnitId).filter((x): x is string => !!x))];
  const fieldCtx: fields.FieldCtx = { tenantId: ctx.tenantId, systemId: ctx.systemId, actorUserId: ctx.actorUserId };

  const [tiers, units, points, layout, values] = await Promise.all([
    tierIds.length ? prisma.memberTierDef.findMany({ where: { tenantId: ctx.tenantId, id: { in: tierIds } } }) : Promise.resolve([]),
    unitIds.length ? prisma.businessUnit.findMany({ where: { tenantId: ctx.tenantId, id: { in: unitIds } } }) : Promise.resolve([]),
    pointsOfMany(ctx, ids),
    fields.listLayout(fieldCtx),
    fields.getFieldValues(fieldCtx, ids),
  ]);

  const tierById = new Map(tiers.map((t) => [t.id, t]));
  const unitById = new Map(units.map((u) => [u.id, u]));
  const fieldByKey = new Map(layout.sections.flatMap((s) => s.fields).map((f) => [f.key, f]));

  // 🔴 AUDIT H2: `columns` มาจาก client ⇒ คีย์ที่ไม่รู้จักถูกทิ้ง ไม่ใช่สะท้อนสตริงดิบกลับไปในหัวตาราง
  //    (คอลัมน์คงที่ของหน้าส่งออก + ฟิลด์ที่มีจริงในเลย์เอาต์ของระบบนี้เท่านั้น)
  const columns = [...new Set(requested.filter((c) => typeof c === "string" && (EXPORT_LABELS[c] !== undefined || fieldByKey.has(c))))];
  if (columns.length === 0) throw new MemberInputError("ยังไม่ได้เลือกคอลัมน์ที่จะส่งออก — เลือกอย่างน้อย 1 คอลัมน์แล้วลองใหม่");

  // 🔴 AUDIT H2: ฟิลด์อ่อนไหวในไฟล์ส่งออกต้องผ่านนโยบาย D8 ต่อ (actor, ฟิลด์, สมาชิก) — ไม่ผ่าน = ช่องว่าง
  //    แถวยังออกครบ (คนทำงานยังได้รายชื่อไปใช้) แต่ค่าที่ต้องหวงไม่หลุดไปกับไฟล์
  const sensitiveByKey = sensitiveFieldsOf(layout);
  const judge = sensitiveJudge(ctx, actor);
  const sensitiveCols = columns.map((c) => sensitiveByKey.get(c)).filter((x): x is SensitiveField => !!x);
  const blocked = new Map<string, Set<string>>();
  // 🔴 D17: ทุกครั้งที่ค่าอ่อนไหว **ออกไปจริง** ต้องมีแถว MemberAccessLog ของสมาชิกคนนั้น (ไฟล์ส่งออกคือ
  //    การเปิดดูแบบเหมาเข่ง — ถ้าไม่บันทึก ผู้ตรวจย้อนหลังจะไม่มีทางรู้ว่าใครดึงอะไรออกไปเมื่อไหร่)
  const toLog: { customerId: string; f: SensitiveField; decision: SensitiveDecision }[] = [];

  for (const r of rows) {
    if (sensitiveCols.length === 0) break;
    const hide = new Set<string>();
    for (const f of sensitiveCols) {
      const decision = await judge(f, r.id);
      if (!decision.allowed) hide.add(f.key);
      else if ((values[r.id] ?? {})[f.key] != null) toLog.push({ customerId: r.id, f, decision });
    }
    blocked.set(r.id, hide);
  }

  const header = columns.map((c) => EXPORT_LABELS[c] ?? fieldByKey.get(c)?.label ?? c);
  const lines = [csvRow(header)];

  for (const r of rows) {
    const bag = values[r.id] ?? {};
    const hide = blocked.get(r.id) ?? new Set<string>();
    const t = r.tierDefId ? (tierById.get(r.tierDefId) ?? null) : null;
    const u = r.homeUnitId ? (unitById.get(r.homeUnitId) ?? null) : null;
    const cellOf = (col: string): string | number => {
      switch (col) {
        case "memberCode": return r.memberCode ?? "";
        case "name": return displayNameOf(r);
        case "phone": return r.phone ?? "";
        case "phone2": return r.phone2 ?? "";
        case "email": return r.email ?? "";
        case "tier": return t?.name ?? "";
        case "status": return r.status;
        case "spent12m": return Number(r.spent12mSatang) / 100;
        case "visits12m": return r.visits12m;
        case "lastActivityAt": return r.lastActivityAt ? r.lastActivityAt.toISOString().slice(0, 10) : "";
        case "points": return points[r.id] ?? 0;
        case "tags": return tagsOf(r).join("|");
        case "homeUnit": return u?.name ?? "";
        case "source": return memberSourceLabel(r.source);
        case "createdAt": return r.createdAt.toISOString().slice(0, 10);
        default: {
          if (hide.has(col)) return ""; // 🔴 AUDIT H2 — ไม่ผ่านนโยบายข้อมูลอ่อนไหว = ช่องว่าง
          const field = fieldByKey.get(col);
          return field ? displayOf(field, bag[col] ?? null) : "";
        }
      }
    };
    lines.push(csvRow(columns.map(cellOf)));
  }

  const csv = `﻿${lines.join("\r\n")}\r\n`;

  // 🔴 AUDIT H2 (D17): บันทึกการดูข้อมูลอ่อนไหวรายสมาชิก — เขียนหลังประกอบไฟล์เสร็จ ไฟล์ออกไม่ได้ก็ไม่มีแถวค้าง
  //    ใช้ตัวเขียนแบบก้อน (`logAccessMany`): แถวยังครบรายสมาชิกเหมือน 360 แต่เขียนด้วย createMany และยิง
  //    event สรุปใบเดียวต่อการส่งออก 1 ครั้ง — ส่งออก 50,000 แถวต้องไม่กลายเป็น 50,000 transaction + คิวตัน
  await logAccessMany(
    ctx,
    actor,
    toLog.map((e) => ({ customerId: e.customerId, targetType: e.f.targetType, targetId: e.f.targetId, decision: e.decision })),
    "member.export",
  );

  await writeAudit({
    tenantId: ctx.tenantId,
    actorId: ctx.actorUserId ?? undefined,
    action: "member.export",
    targetType: "Customer",
    after: { columns, sensitiveColumns: sensitiveCols.map((f) => f.key), rows: rows.length, filters: opts.filters ?? {} },
  });

  return { csv, rows: rows.length };
}
