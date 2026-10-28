// ─────────────────────────────────────────────────────────────
// form.ts — โหลดโมเดลฟอร์มค่าตั้งจากทะเบียน (server) · SVC R0.4 · ใบสั่ง §2–§3 §6.1
//
//   loadSettingsForm       — ทะเบียน + ค่าที่มีผล + สิทธิ์ ⇒ SettingsFormModel (JSON ล้วน ส่งเป็น prop ของ client ได้)
//   legalOverrideSummaries — สรุปข้อเสนอ settings.legal_override สำหรับหน้าอนุมัติ
//
// 🔴 ด่านสิทธิ์จริงอยู่ที่ service (setSettings/resetSetting) — ที่นี่เรียก `editIssueFor` ตัวเดียวกันเพื่อให้ editable ตรงกับผลจริง
// 🔴 ไฟล์นี้ลาก prisma ⇒ ห้าม 'use client' import (ฝั่ง client ใช้ settings-shared.ts)
// ─────────────────────────────────────────────────────────────
import { prisma } from "@/lib/core/db";
import { canAccessUnit } from "@/lib/core/rbac";
import {
  formatFieldValue,
  SCOPE_LABEL_TH,
  type FieldFormatSpec,
  type SettingsField,
  type SettingsFieldOption,
  type SettingsFormModel,
  type SettingsHistoryRow,
} from "@/components/settings/settings-shared";
import { PENDING_LEGAL_REVIEW_KEYS } from "./defs/rooms";
import { defaultFor, getDef, getTemplate, groupLabelTh, isOwnerOnly, isScopeKind, listDefs } from "./registry";
import {
  editIssueFor,
  entitiesOfUnit,
  LEGAL_OVERRIDE_ENTITY,
  refsFor,
  resolveSettings,
  resolveSettingsAtTenant,
  settingHistory,
} from "./service";
import type { Resolved, ScopeKind, ScopeRefs, SettingDef, SettingsActor, SettingsCtx } from "./types";

// ───────────────────────── อ่านรายละเอียดจาก schema (zod v4) ─────────────────────────

type ZodLike = {
  options?: unknown;
  unwrap?: () => ZodLike;
  safeParse?: (v: unknown) => { success: boolean };
  _zod?: { bag?: { minimum?: number; maximum?: number } };
};

const SAFE = Number.MAX_SAFE_INTEGER;

function schemaInfo(def: SettingDef): { options: string[] | null; nullable: boolean; min: number | null; max: number | null } {
  const root = def.schema as unknown as ZodLike;
  const nullable = typeof root.safeParse === "function" && root.safeParse(null).success;
  let options: string[] | null = null;
  let min: number | null = null;
  let max: number | null = null;
  let sc: ZodLike | undefined = root;
  for (let i = 0; i < 4 && sc; i++) {
    if (options === null && Array.isArray(sc.options) && sc.options.every((o) => typeof o === "string")) options = sc.options as string[];
    const bag = sc._zod?.bag;
    if (bag) {
      if (min === null && typeof bag.minimum === "number" && Math.abs(bag.minimum) < SAFE) min = bag.minimum;
      if (max === null && typeof bag.maximum === "number" && Math.abs(bag.maximum) < SAFE) max = bag.maximum;
    }
    sc = typeof sc.unwrap === "function" ? sc.unwrap() : undefined;
  }
  return { options, nullable, min, max };
}

const NUMERIC: ReadonlySet<string> = new Set(["int", "money", "percent", "minutes", "days"]);

function optionsOf(def: SettingDef, info: { options: string[] | null }): SettingsFieldOption[] | null {
  if (def.type !== "enum" || !info.options) return null;
  return info.options.map((value) => ({ value, labelTh: def.enumLabelsTh?.[value] ?? value }));
}

/** เหตุผลล็อกสั้น ๆ (ข้อความเต็มของเครื่องยนต์มีชื่อช่องซ้ำกับป้ายอยู่แล้ว) */
function lockedReasonOf(code: string, messageTh: string): string {
  if (code === "OWNER_ONLY") return "แก้ได้เฉพาะเจ้าของกิจการ";
  if (code === "TENANT_SCOPE_FORBIDDEN") return "ค่าระดับทั้งร้านแก้ได้เฉพาะเจ้าของหรือผู้ดูแลทุกสาขา";
  if (code === "NO_PERMISSION") return "คุณยังไม่มีสิทธิ์แก้ค่านี้ — ขอสิทธิ์จากเจ้าของร้าน";
  return messageTh;
}

const MASKED_REASON = "ข้อมูลส่วนบุคคล — เห็นและแก้ได้เฉพาะเจ้าของกิจการ";

function sourceLabelOf(source: string, scope: ScopeKind): string {
  if (source === "TEMPLATE") return "ค่าจากแม่แบบ";
  if (source === "FALLBACK") return "ค่าเริ่มต้นของระบบ";
  if (source === scope) return scope === "TENANT" ? "ตั้งไว้ทั้งร้าน" : scope === "UNIT" ? "ตั้งที่สาขานี้" : `ตั้งที่${SCOPE_LABEL_TH[scope] ?? "ชั้นนี้"}นี้`;
  return `มาจากชั้น ${SCOPE_LABEL_TH[source] ?? source}`;
}

const specOf = (def: SettingDef, masked: boolean): FieldFormatSpec => ({ key: def.key, type: def.type, options: optionsOf(def, schemaInfo(def)), masked });

// ───────────────────────── loadSettingsForm ─────────────────────────

export type SettingsFormQuery = { domains: string[]; groups?: string[]; unitId: string; scope?: ScopeKind; scopeId?: string };

/** แถวชั้นลึกกว่า scope ที่ฟอร์มเปิดอยู่ (ในสาขาเดียวกัน) — ใช้นับ "ปรับรายคน N" */
async function deeperPairs(ctx: SettingsCtx, unitId: string, scope: ScopeKind, scopeId: string): Promise<{ scope: string; scopeId: string }[]> {
  if (scope === "TENANT") {
    const ents = await entitiesOfUnit(prisma, ctx.tenantId, unitId);
    return [{ scope: "UNIT", scopeId: unitId }, ...ents];
  }
  if (scope === "UNIT") return entitiesOfUnit(prisma, ctx.tenantId, unitId);
  if (scope === "BUILDING" || scope === "ROOM_TYPE") {
    const rooms = await prisma.hotelRoom.findMany({
      where: { tenantId: ctx.tenantId, unitId, ...(scope === "BUILDING" ? { buildingId: scopeId } : { roomTypeId: scopeId }) },
      select: { id: true },
    });
    return rooms.map((r) => ({ scope: "ROOM", scopeId: r.id }));
  }
  return [];
}

/**
 * โมเดลฟอร์มของ (scope, scopeId) ในสาขา unitId — คืน null (ไม่ throw) เมื่อ:
 * unit ไม่ใช่ของร้าน (X1) · ผู้ดูเข้า unit ไม่ได้ · scopeId ไม่อยู่ใน unit/ร้าน · ชั้นไม่รองรับ
 */
export async function loadSettingsForm(actor: SettingsActor, ctx: SettingsCtx, q: SettingsFormQuery): Promise<SettingsFormModel | null> {
  const scope: ScopeKind = q.scope ?? "UNIT";
  if (!isScopeKind(scope) || typeof q.unitId !== "string" || !q.unitId || !Array.isArray(q.domains)) return null;

  const unit = await prisma.businessUnit.findFirst({ where: { id: q.unitId, tenantId: ctx.tenantId }, select: { id: true, name: true } });
  if (!unit || !canAccessUnit(actor, unit.id)) return null;

  // 1. ชั้น + refs
  let scopeId: string;
  let refs: ScopeRefs | null;
  if (scope === "UNIT") {
    scopeId = unit.id;
    if (q.scopeId !== undefined && q.scopeId !== scopeId) return null;
    refs = { unitId: unit.id };
  } else if (scope === "TENANT") {
    scopeId = ctx.tenantId;
    if (q.scopeId !== undefined && q.scopeId !== scopeId) return null;
    refs = { unitId: unit.id };
  } else {
    if (typeof q.scopeId !== "string" || !q.scopeId) return null;
    scopeId = q.scopeId;
    refs = await refsFor(ctx, scope, scopeId);
    if (!refs || refs.unitId !== unit.id) return null;
  }

  if (!refs) return null;
  const scopeRefs: ScopeRefs = refs;

  // 2. ช่อง = def ของ domains (และ groups) ที่ไม่ซ่อน และ chain มีชั้นนี้ — ลำดับตามทะเบียน
  const wantGroups = q.groups && q.groups.length ? new Set(q.groups) : null;
  const defs: SettingDef[] = [];
  for (const dm of q.domains) {
    for (const d of listDefs(dm)) {
      if (d.hiddenUntil) continue;
      if (wantGroups && !wantGroups.has(d.group)) continue;
      if (!d.chain.includes(scope)) continue;
      defs.push(d);
    }
  }
  const keys = defs.map((d) => d.key);

  // 3. อ่านครั้งเดียวต่อชุด: ค่าที่มีผล · แถวของชั้นนี้ · แถวชั้นลึกกว่า · แม่แบบ · ประวัติ
  const deeper = await deeperPairs(ctx, unit.id, scope, scopeId);
  const unrestricted = actor.role === "OWNER" || actor.unitAccess.includes("*");
  const [resolved, ownRows, deepRows, profiles, hist] = await Promise.all([
    keys.length ? (scope === "TENANT" ? resolveSettingsAtTenant(ctx, keys, unit.id) : resolveSettings(ctx, keys, scopeRefs)) : Promise.resolve({}),
    keys.length ? prisma.settingValue.findMany({ where: { tenantId: ctx.tenantId, key: { in: keys }, scope, scopeId }, select: { key: true } }) : Promise.resolve([]),
    keys.length && deeper.length
      ? prisma.settingValue.findMany({ where: { tenantId: ctx.tenantId, key: { in: keys }, OR: deeper }, select: { key: true, scope: true, scopeId: true } })
      : Promise.resolve([]),
    prisma.settingProfile.findMany({ where: { tenantId: ctx.tenantId, unitId: unit.id, domain: { in: q.domains } }, select: { domain: true, templateKey: true } }),
    keys.length
      ? settingHistory(ctx, { unitId: unit.id, keys, includeTenant: unrestricted, limit: 50, actor })
      : Promise.resolve([]),
  ]);
  const resolvedMap = resolved as Record<string, Resolved>;
  const hasOwn = new Set(ownRows.map((r) => r.key));
  const overrides = new Map<string, Set<string>>();
  for (const r of deepRows) {
    const def = getDef(r.key);
    if (!def || def.chain.indexOf(r.scope as ScopeKind) <= def.chain.indexOf(scope)) continue;
    if (!overrides.has(r.key)) overrides.set(r.key, new Set());
    overrides.get(r.key)?.add(`${r.scope}|${r.scopeId}`);
  }
  const pending = new Set<string>(PENDING_LEGAL_REVIEW_KEYS);

  // 4. ประกอบช่อง
  const groups: SettingsFormModel["groups"] = [];
  const groupAt = new Map<string, number>();
  let differsCount = 0;
  for (const def of defs) {
    const r = resolvedMap[def.key];
    const info = schemaInfo(def);
    const masked = def.sensitivity === "PRIVACY" && actor.role !== "OWNER";
    const issue = masked ? null : editIssueFor(actor, def, scope, scope === "TENANT" ? null : unit.id);
    const editable = !masked && !issue;
    const lockedReasonTh = masked ? MASKED_REASON : issue ? lockedReasonOf(issue.code, issue.messageTh) : null;
    const tkey = r?.templateKey ?? null;
    const templateValue = defaultFor(def, tkey);
    const differs = !!r?.differsFromTemplate;
    if (differs) differsCount++;
    const field: SettingsField = {
      key: def.key,
      domain: def.domain,
      group: def.group,
      type: def.type,
      labelTh: def.labelTh,
      helpTh: def.helpTh ?? null,
      value: masked ? null : (r?.value ?? null),
      hasOwn: hasOwn.has(def.key),
      source: (r?.source ?? "FALLBACK") as SettingsField["source"],
      sourceLabelTh: sourceLabelOf(r?.source ?? "FALLBACK", scope),
      templateValue: masked ? null : (templateValue ?? null),
      differsFromTemplate: differs,
      overrideCount: overrides.get(def.key)?.size ?? 0,
      editable,
      lockedReasonTh,
      masked,
      pendingLegalReview: pending.has(def.key),
      options: optionsOf(def, info),
      nullable: info.nullable,
      min: NUMERIC.has(def.type) ? info.min : null,
      max: NUMERIC.has(def.type) ? info.max : null,
      templateVars: def.templateVars ? [...def.templateVars] : null,
      requiresIntegration: def.requires?.integration ?? null,
      effectiveDated: def.effectiveDated === true,
      sensitivity: def.sensitivity ?? null,
      ownerOnly: isOwnerOnly(def),
    };
    const gk = `${def.domain}|${def.group}`;
    let gi = groupAt.get(gk);
    if (gi === undefined) {
      gi = groups.length;
      groupAt.set(gk, gi);
      groups.push({ domain: def.domain, key: def.group, labelTh: groupLabelTh(def.domain, def.group) ?? "หมวดอื่น ๆ", fields: [] });
    }
    groups[gi].fields.push(field);
  }

  // 5. แม่แบบที่ใช้ + ประวัติ
  const profOf = new Map(profiles.map((p) => [p.domain, p.templateKey]));
  const templates = q.domains.map((domain) => {
    const key = profOf.get(domain) ?? null;
    return { domain, key, labelTh: key ? (getTemplate(domain, key)?.labelTh ?? key) : null };
  });
  const history: SettingsHistoryRow[] = hist.map((h) => {
    const def = getDef(h.key);
    const masked = h.masked === true;
    const spec = def ? specOf(def, masked) : null;
    const show = (v: unknown): string => (!spec ? "—" : formatFieldValue(spec, v));
    return {
      id: h.id,
      key: h.key,
      labelTh: def?.labelTh ?? h.key,
      beforeTh: show(h.before),
      afterTh: show(h.after),
      at: h.at.toISOString(),
      legalLevel: h.legalLevel,
      masked,
    };
  });

  return { unitId: unit.id, unitName: unit.name, scope, scopeId, domains: [...q.domains], templates, groups, differsCount, history };
}

// ───────────────────────── legalOverrideSummaries ─────────────────────────

export type LegalOverrideSummary = {
  requestId: string;
  unitId: string;
  unitName: string;
  titleTh: string;
  codes: string[];
  lines: { key: string; labelTh: string; beforeTh: string; afterTh: string; reasonTh: string | null }[];
};

const PROPOSAL_ACTION = "settings.legal_override.proposed";
const PROPOSAL_TARGET = "SettingProposal";
const isRec = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * สรุปข้อเสนอ "ข้ามคำเตือนกฎหมาย" ของคำขออนุมัติ — เฉพาะร้านของ ctx และคำขอชนิด settings.legal_override
 * (ร้านอื่น/ชนิดอื่น/ไม่พบ ⇒ ไม่อยู่ใน Map) · PRIVACY ⇒ "ซ่อนไว้" เมื่อ viewer ไม่ใช่ OWNER (ไม่ส่ง viewer = ปิดไว้ก่อน)
 */
export async function legalOverrideSummaries(ctx: SettingsCtx, requestIds: string[], viewer?: SettingsActor): Promise<Map<string, LegalOverrideSummary>> {
  const out = new Map<string, LegalOverrideSummary>();
  const ids = [...new Set((requestIds ?? []).filter((x): x is string => typeof x === "string" && x.length > 0))];
  if (!ids.length) return out;
  const reqs = await prisma.approvalRequest.findMany({
    where: { tenantId: ctx.tenantId, id: { in: ids }, entityType: LEGAL_OVERRIDE_ENTITY },
    select: { id: true, entityId: true },
  });
  if (!reqs.length) return out;
  const props = await prisma.auditLog.findMany({
    where: { tenantId: ctx.tenantId, action: PROPOSAL_ACTION, targetType: PROPOSAL_TARGET, targetId: { in: reqs.map((r) => r.entityId) } },
    select: { targetId: true, after: true },
  });
  const byProposal = new Map(props.map((p) => [p.targetId, p.after]));
  const parsed: { reqId: string; body: Record<string, unknown> }[] = [];
  for (const r of reqs) {
    const body = byProposal.get(r.entityId);
    if (isRec(body) && body.requestId === r.id && Array.isArray(body.changes)) parsed.push({ reqId: r.id, body });
  }
  const unitIds = [...new Set(parsed.map((p) => (typeof p.body.unitId === "string" ? p.body.unitId : "")).filter(Boolean))];
  const units = unitIds.length ? await prisma.businessUnit.findMany({ where: { tenantId: ctx.tenantId, id: { in: unitIds } }, select: { id: true, name: true } }) : [];
  const unitName = new Map(units.map((u) => [u.id, u.name]));
  const isOwner = viewer?.role === "OWNER";

  for (const { reqId, body } of parsed) {
    const unitId = typeof body.unitId === "string" ? body.unitId : "";
    const lines: LegalOverrideSummary["lines"] = [];
    for (const raw of body.changes as unknown[]) {
      if (!isRec(raw) || typeof raw.key !== "string") continue;
      const def = getDef(raw.key);
      if (!def) continue;
      const hide = def.sensitivity === "PRIVACY" && !isOwner;
      const spec = specOf(def, hide);
      const base = isRec(raw.base) ? raw.base : null;
      lines.push({
        key: def.key,
        labelTh: def.labelTh,
        beforeTh: base && base.present === true ? formatFieldValue(spec, base.value ?? null) : hide ? "ซ่อนไว้" : "ตามชั้นบน",
        afterTh: formatFieldValue(spec, raw.value ?? null),
        reasonTh: typeof raw.reason === "string" && raw.reason.trim() ? raw.reason.trim() : null,
      });
    }
    const name = unitName.get(unitId) ?? "";
    out.set(reqId, {
      requestId: reqId,
      unitId,
      unitName: name,
      titleTh: `ขอข้ามคำเตือนกฎหมายในค่าตั้ง${name ? ` · ${name}` : ""}`,
      codes: Array.isArray(body.codes) ? body.codes.filter((c): c is string => typeof c === "string") : [],
      lines,
    });
  }
  return out;
}
