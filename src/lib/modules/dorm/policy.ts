// SVC D.13 ▸ หน้า 17 "นโยบาย · ข้อความ · สิทธิ์" — โมเดล + ใช้ชุดสิทธิ์ตามบทบาท (ledger/svc-briefs/svc-brief-d.13.md §6.2)
//   • ด่าน: หน่วย DORM ของร้าน → Membership สด (ไม่เชื่อ role/permissions ใน actor) → เข้าหน่วยได้ + dormAccess(สด).board · ไม่ผ่าน ⇒ null
//   • ฟอร์ม = เครื่องยนต์ค่าตั้ง (loadSettingsForm ชั้น UNIT · groups ของการ์ด) — ผู้เรียกส่ง form มาได้ (หน้าโหลดเอง) ต้องเป็น (unitId, UNIT) นี้
//     ตัดกลุ่ม/ช่องที่ไม่อยู่ในการ์ดทิ้ง · ไม่มีคีย์ rooms.legal.* (โหมดกฎหมายอยู่หน้า 10)
//   • ชุดสิทธิ์: applyDormRolePreset → updateStaffAccess (ด่านห้ามยกระดับของระบบสิทธิ์กลางตัดสิน) · STAFF ร้านเดียวกันเท่านั้น · ไม่แก้ role/unitAccess
//   • ไม่มีอีเมล/เบอร์ในโมเดล (X10) · อ่านผ่าน tenantDb (ไม่ import prisma)
import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { tenantDb } from "@/lib/core/db";
import { emitOutboxMany } from "@/lib/core/outbox";
import { isPermissionKey, isPermissionParamKey } from "@/lib/core/permissions";
import { canAccessUnit } from "@/lib/core/rbac";
import { getDef, loadSettingsForm, type SettingsActor } from "@/lib/core/settings";
import { updateStaffAccess } from "@/lib/staff/service";
import type { SettingsField, SettingsFormModel } from "@/components/settings/settings-shared";
import { DORM_POLICY_GROUPS, DORM_POLICY_LAYOUT, type DormPolicyCardKey } from "@/components/dorm/dorm-policy-shared";
import { DORM_ROLE_COLUMNS, DORM_ROLE_ROWS, dormAccess, dormPresetPermissions, type DormPresetRole, type DormRoleColumn, type DormRoleCell } from "./access";
import { dormLiveMember, dormUnitOf } from "./scope";

export type DormPolicyModel = {
  page: "policies";
  unitId: string;
  unitName: string;
  basePath: string;
  form: SettingsFormModel;
  cards: { key: DormPolicyCardKey; no: number; col: number; labelTh: string; fieldKeys: string[]; pendingLegalReview: boolean }[];
  template: { key: string; labelTh: string } | null;
  diffCount: number;
  roles: {
    columns: { role: DormRoleColumn; labelTh: string }[];
    rows: { id: string; labelTh: string; cells: Record<DormRoleColumn, DormRoleCell> }[];
    applyTargets: { membershipId: string; nameTh: string }[] | null;
  };
  depositThresholdSatang: number;
  buildingScope: {
    mode: "UNIT" | "BUILDING";
    buildings: { id: string; name: string }[];
    members: { membershipId: string; nameTh: string }[];
    assignments: Record<string, string[]>;
    editable: boolean;
  };
  canEdit: boolean;
};

const DOMAINS = ["rooms", "payments", "messaging"];
const DEPOSIT_THRESHOLD_KEY = "rooms.deposit.approvalThreshold";
const DEPOSIT_THRESHOLD_FALLBACK = 200000;
const PRESET_ROLES: readonly DormPresetRole[] = ["CARETAKER", "TECH", "ACCOUNTANT"];
const isRec = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === "string" && v.length > 0;
const accessible = (unitAccess: unknown, unitId: string) => Array.isArray(unitAccess) && (unitAccess.includes("*") || unitAccess.includes(unitId));
/** สาขาของเป้าหมายทั้งหมดอยู่ในสาขาของผู้กระทำ (เป้าหมาย "*" ⇒ ผู้กระทำต้อง "*") */
function withinActor(actorUnits: readonly string[], targetUnits: unknown): boolean {
  if (actorUnits.includes("*")) return true;
  const t = Array.isArray(targetUnits) ? targetUnits.filter(isStr) : [];
  return !t.includes("*") && t.every((u) => actorUnits.includes(u));
}

/** สมาชิกร้านที่ตอบรับแล้ว เข้าหน่วยนี้ได้ บทบาทตามที่ขอ — ชื่อเท่านั้น (ไม่มีอีเมล/เบอร์) */
async function membersOf(tenantId: string, unitId: string, roles: ("MANAGER" | "STAFF")[]): Promise<{ membershipId: string; nameTh: string }[]> {
  const rows = await tenantDb({ tenantId }).membership.findMany({
    where: { tenantId, role: { in: roles }, acceptedAt: { not: null } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true, unitAccess: true, user: { select: { name: true } } },
  });
  return rows
    .filter((r) => accessible(r.unitAccess, unitId))
    .map((r) => ({ membershipId: r.id, nameTh: (r.user?.name ?? "").trim() || "พนักงาน" }));
}

export async function loadDormPolicySettings(
  actor: SettingsActor,
  ctx: { tenantId: string },
  input: { unitId: string; form?: SettingsFormModel },
): Promise<DormPolicyModel | null> {
  const tenantId = ctx?.tenantId;
  if (!actor || !isRec(input) || !isStr(tenantId)) return null;
  const unit = await dormUnitOf(tenantId, input.unitId);
  if (!unit) return null;
  const mem = await dormLiveMember(tenantId, actor.userId);
  if (!mem || !canAccessUnit(mem.ctx, unit.id)) return null;
  const acc = dormAccess(mem.ctx, unit.id);
  if (!acc.board) return null;
  const live: SettingsActor = { ...mem.ctx, userId: actor.userId };

  let raw: SettingsFormModel | null;
  if (input.form !== undefined) {
    const f = input.form;
    if (!isRec(f) || f.unitId !== unit.id || f.scope !== "UNIT" || f.scopeId !== unit.id || !Array.isArray(f.groups)) return null;
    raw = f;
  } else {
    raw = await loadSettingsForm(live, { tenantId }, { domains: DOMAINS, groups: DORM_POLICY_GROUPS, unitId: unit.id });
  }
  if (!raw) return null;

  // ── ตัดเหลือเฉพาะกลุ่มของการ์ด ──
  const inCards = new Set(DORM_POLICY_LAYOUT.cards.flatMap((c) => c.groups.map((g) => `${g.domain}|${g.group}`)));
  // P2 ▸ ตารางอาคารรายคน (membershipId → อาคาร) ให้เห็นค่าดิบเฉพาะเจ้าของ/ผู้จัดการ — คนอื่นได้ค่าว่าง ◂
  const seesAssignments = mem.ctx.role === "OWNER" || mem.ctx.role === "MANAGER";
  const groups = raw.groups
    .filter((g) => inCards.has(`${g.domain}|${g.key}`))
    .map((g) => ({
      ...g,
      fields: g.fields
        .filter((fl) => !fl.key.startsWith("rooms.legal."))
        .map((fl) => (fl.key === DORM_POLICY_LAYOUT.buildingAssignmentsKey && !seesAssignments ? { ...fl, value: {}, templateValue: {} } : fl)),
    }))
    .filter((g) => g.fields.length > 0);
  const fields: SettingsField[] = groups.flatMap((g) => g.fields);
  const differsCount = fields.filter((fl) => fl.differsFromTemplate).length;
  const history = seesAssignments ? raw.history : raw.history.filter((h) => h.key !== DORM_POLICY_LAYOUT.buildingAssignmentsKey);
  const form: SettingsFormModel = { ...raw, groups, differsCount, history };

  const cards = DORM_POLICY_LAYOUT.cards.map((c) => {
    const want = new Set(c.groups.map((g) => `${g.domain}|${g.group}`));
    const fs = fields.filter((fl) => want.has(`${fl.domain}|${fl.group}`));
    return { key: c.key, no: c.no, col: ((c.no - 1) % 3) + 1, labelTh: c.labelTh, fieldKeys: fs.map((fl) => fl.key), pendingLegalReview: fs.some((fl) => fl.pendingLegalReview) };
  });

  const tpl = raw.templates.find((t) => t.domain === "rooms");
  const template = tpl?.key ? { key: tpl.key, labelTh: tpl.labelTh ?? tpl.key } : null;

  const byKey = new Map(fields.map((fl) => [fl.key, fl]));
  const th = byKey.get(DEPOSIT_THRESHOLD_KEY)?.value;
  const depositThresholdSatang = typeof th === "number" && Number.isFinite(th) ? th : DEPOSIT_THRESHOLD_FALLBACK;

  const manager = mem.ctx.role === "OWNER" || mem.ctx.role === "MANAGER";
  const applyTargets = manager ? await membersOf(tenantId, unit.id, ["STAFF"]) : null;

  const modeV = byKey.get(DORM_POLICY_LAYOUT.managerScopeKey)?.value;
  const assignV = byKey.get(DORM_POLICY_LAYOUT.buildingAssignmentsKey)?.value;
  const buildings = await tenantDb({ tenantId, unitId: unit.id }).roomBuilding.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true } });
  const members = manager ? await membersOf(tenantId, unit.id, ["MANAGER", "STAFF"]) : [];
  const known = new Set(buildings.map((b) => b.id));
  const assignments: Record<string, string[]> = {};
  if (manager && isRec(assignV)) {
    for (const m of members) {
      const v = assignV[m.membershipId];
      if (Array.isArray(v)) assignments[m.membershipId] = v.filter((x): x is string => isStr(x) && known.has(x));
    }
  }

  return {
    page: "policies",
    unitId: unit.id,
    unitName: unit.name,
    basePath: `/app/u/${unit.slug}/dorm`,
    form,
    cards,
    template,
    diffCount: differsCount,
    roles: {
      columns: DORM_ROLE_COLUMNS.map((c) => ({ ...c })),
      rows: DORM_ROLE_ROWS.map((r) => ({ id: r.id, labelTh: r.labelTh, cells: { ...r.cells } })),
      applyTargets,
    },
    depositThresholdSatang,
    buildingScope: {
      mode: modeV === "BUILDING" ? "BUILDING" : "UNIT",
      buildings: buildings.map((b) => ({ id: b.id, name: b.name })),
      members,
      assignments,
      editable: mem.ctx.role === "OWNER",
    },
    canEdit: acc.settings,
  };
}

/** ใช้ชุดสิทธิ์ตามบทบาทกับพนักงาน (STAFF ร้านเดียวกัน) — คงสิทธิ์ของระบบอื่นไว้ · แทนเฉพาะคีย์ในตาราง 17 */
export async function applyDormRolePreset(
  actor: SettingsActor,
  ctx: { tenantId: string },
  input: { unitId: string; membershipId: string; role: DormPresetRole },
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const tenantId = ctx?.tenantId;
  if (!isRec(input) || !PRESET_ROLES.includes(input.role)) return { ok: false, reason: "เลือกชุดสิทธิ์ ผู้ดูแล ช่าง หรือบัญชี" };
  if (!actor || !isStr(tenantId)) return { ok: false, reason: "ไม่พบหอพักนี้ — ลองโหลดหน้าใหม่อีกครั้ง" };
  const unit = await dormUnitOf(tenantId, input.unitId);
  if (!unit) return { ok: false, reason: "ไม่พบหอพักนี้ — ลองโหลดหน้าใหม่อีกครั้ง" };
  const mem = await dormLiveMember(tenantId, actor.userId);
  if (!mem || !dormAccess(mem.ctx, unit.id).settings) return { ok: false, reason: "คุณไม่มีสิทธิ์แก้ค่าตั้งหอนี้ (ต้องมีสิทธิ์ “แก้ค่าตั้งหอพัก”)" };
  if (!isStr(input.membershipId)) return { ok: false, reason: "ไม่พบผู้ใช้งานคนนี้ในกิจการนี้ — ลองโหลดหน้าใหม่อีกครั้ง" };
  const target = await tenantDb({ tenantId }).membership.findFirst({
    where: { id: input.membershipId, tenantId },
    select: { id: true, role: true, permissions: true, unitAccess: true },
  });
  // P1 ▸ พนักงานเป้าหมายต้องเข้าหอนี้ได้ · ผู้กระทำที่ไม่ใช่เจ้าของ แก้ได้เฉพาะคนที่สาขาทั้งหมดอยู่ในสาขาที่ตัวเองคุม (unitAccess ⊆) ◂
  if (!target || !accessible(target.unitAccess, unit.id) || !(mem.ctx.role === "OWNER" || withinActor(mem.ctx.unitAccess, target.unitAccess))) {
    return { ok: false, reason: "ไม่พบผู้ใช้งานคนนี้ในกิจการนี้ — ลองโหลดหน้าใหม่อีกครั้ง" };
  }
  if (target.role !== "STAFF") return { ok: false, reason: "ชุดสิทธิ์ใช้กับผู้ใช้บทบาทพนักงานเท่านั้น (เจ้าของ/ผู้จัดการมีสิทธิ์ครบอยู่แล้ว)" };
  const preset = dormPresetPermissions(input.role);
  const rowKeys = new Set(DORM_ROLE_ROWS.flatMap((r) => r.keys));
  const current = isRec(target.permissions) ? target.permissions : {};
  const kept: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(current)) {
    if (rowKeys.has(k) || k === "dorm.*") continue;
    if ((isPermissionKey(k) && v === true) || (isPermissionParamKey(k) && typeof v === "number")) kept[k] = v;
  }
  const r = await updateStaffAccess({ tenantId, actorUserId: actor.userId, membershipId: target.id, permissions: { ...kept, ...preset } });
  return r.ok ? { ok: true } : { ok: false, reason: r.reason };
}

// ───────────────────────── P5 ▸ ตั้งอาคารของผู้ดูแลทีละคน (อ่าน-แก้-เขียนใน tx เดียว) ─────────────────────────
//   แก้เฉพาะรายการของสมาชิกคนเดียวในตาราง rooms.access.buildingAssignments ชั้น UNIT — ไม่ส่งทั้งตาราง (บันทึกพร้อมกันไม่ทับกัน)
//   ล็อก advisory คีย์เดียวกับเครื่องยนต์ค่าตั้ง (settings:<tenant>:<key>:UNIT:<unit>) ⇒ ต่อคิวกับ setSettings/resetSetting ของคีย์นี้ด้วย
//   เจ้าของเท่านั้น (ownerOnly · Membership สด) · อาคารต้องเป็นของหน่วย · สมาชิกต้องเป็น MANAGER/STAFF ที่เข้าหอนี้ได้
//   เขียนแถว SettingValue + SettingChange + AuditLog + outbox settings.changed ใน tx เดียวกัน (รูปเดียวกับ writeChecked ของเครื่องยนต์)
const ALWAYS = new Date("1970-01-01T00:00:00.000Z");

export async function setDormBuildingAssignment(
  actor: SettingsActor,
  ctx: { tenantId: string },
  input: { unitId: string; membershipId: string; buildingIds: string[] },
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const tenantId = ctx?.tenantId;
  const key = DORM_POLICY_LAYOUT.buildingAssignmentsKey;
  if (!actor || !isStr(tenantId) || !isRec(input)) return { ok: false, reason: "ไม่พบหอพักนี้ — ลองโหลดหน้าใหม่อีกครั้ง" };
  const unit = await dormUnitOf(tenantId, input.unitId);
  if (!unit) return { ok: false, reason: "ไม่พบหอพักนี้ — ลองโหลดหน้าใหม่อีกครั้ง" };
  const mem = await dormLiveMember(tenantId, actor.userId);
  if (!mem || mem.ctx.role !== "OWNER") return { ok: false, reason: "ตั้งอาคารที่ผู้ดูแลเห็นได้เฉพาะเจ้าของกิจการ" };
  if (!isStr(input.membershipId) || !Array.isArray(input.buildingIds) || input.buildingIds.length > 50 || !input.buildingIds.every(isStr)) {
    return { ok: false, reason: "ข้อมูลอาคารไม่ถูกต้อง — ลองโหลดหน้าใหม่อีกครั้ง" };
  }
  const target = await tenantDb({ tenantId }).membership.findFirst({
    where: { id: input.membershipId, tenantId, role: { in: ["MANAGER", "STAFF"] }, acceptedAt: { not: null } },
    select: { id: true, unitAccess: true },
  });
  if (!target || !accessible(target.unitAccess, unit.id)) return { ok: false, reason: "ไม่พบผู้ใช้งานคนนี้ในกิจการนี้ — ลองโหลดหน้าใหม่อีกครั้ง" };
  const want = [...new Set(input.buildingIds)];
  const own = await tenantDb({ tenantId, unitId: unit.id }).roomBuilding.findMany({ where: { id: { in: want } }, select: { id: true } });
  if (own.length !== want.length) return { ok: false, reason: "มีอาคารที่ไม่ใช่ของหอนี้ — ลองโหลดหน้าใหม่อีกครั้ง" };
  const next = own.map((b) => b.id).sort();
  const def = getDef(key);
  if (!def) return { ok: false, reason: "ระบบยังไม่รู้จักค่าตั้งนี้" };

  return tenantDb({ tenantId }).$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`settings:${tenantId}:${key}:UNIT:${unit.id}`}, 0))`;
    const row = await tx.settingValue.findFirst({ where: { tenantId, key, scope: "UNIT", scopeId: unit.id, effectiveFrom: ALWAYS }, select: { id: true, value: true } });
    const before = isRec(row?.value) ? (row.value as Record<string, unknown>) : {};
    const cur = Array.isArray(before[target.id]) ? (before[target.id] as unknown[]).filter(isStr).sort() : [];
    if (row && cur.length === next.length && cur.every((x, i) => x === next[i]) && Array.isArray(before[target.id])) return { ok: true as const };
    const value: Record<string, unknown> = { ...before, [target.id]: next };
    if (!def.schema.safeParse(value).success) return { ok: false as const, reason: "ตารางอาคารเกินขนาดที่รองรับ" };
    const json = value as Prisma.InputJsonValue;
    let targetId: string;
    if (row) {
      await tx.settingValue.update({ where: { id: row.id }, data: { value: json, setById: actor.userId } });
      targetId = row.id;
    } else {
      targetId = (await tx.settingValue.create({ data: { tenantId, key, scope: "UNIT", scopeId: unit.id, value: json, effectiveFrom: ALWAYS, setById: actor.userId }, select: { id: true } })).id;
    }
    const changeId = randomUUID();
    await tx.settingChange.create({
      data: { id: changeId, tenantId, unitId: unit.id, key, scope: "UNIT", scopeId: unit.id, before: row ? (row.value as Prisma.InputJsonValue) : undefined, after: json, effectiveFrom: ALWAYS, legalLevel: "OK", actorId: actor.userId },
    });
    await tx.auditLog.create({
      data: {
        tenantId, unitId: unit.id, actorType: "USER", actorId: actor.userId, action: "settings.set", targetType: "SettingValue", targetId,
        before: { key, scope: "UNIT", scopeId: unit.id, membershipId: target.id, buildingIds: cur } as Prisma.InputJsonValue,
        after: { key, scope: "UNIT", scopeId: unit.id, membershipId: target.id, buildingIds: next, changeId } as Prisma.InputJsonValue,
      },
    });
    await emitOutboxMany(tx as unknown as Prisma.TransactionClient, [
      { tenantId, type: "settings.changed", idempotencyKey: `settings.changed#${changeId}`, unitId: unit.id, payload: { tenantId, unitId: unit.id, domain: "rooms", keys: [key], scope: "UNIT", scopeId: unit.id } },
    ]);
    return { ok: true as const };
  });
}
