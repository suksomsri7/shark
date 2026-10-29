// ─────────────────────────────────────────────────────────────
// service.ts — เครื่องยนต์ค่าตั้งแบบชั้น (อ่าน/เขียน/คืนค่า/แม่แบบ/ประวัติ/snapshot) · SVC R0.3
// สัญญา: ledger/SVC-CORE-CONTRACT.md §1.4–§1.7 · ใบสั่ง ledger/svc-briefs/svc-brief-r0.3.md §4–§6 · ชุดแก้ผู้ตรวจ /root/svc-runs/fix/r0.3.md
//
// 🔴 ทุกคิวรีกรอง tenantId = ctx.tenantId (แถวร้านอื่นที่ scopeId ซ้ำกันห้ามมีผล · X1)
// 🔴 ไม่มีแคชข้ามการเรียก (บทเรียน "ให้สิทธิ์ห้ามใช้คำตอบแคช") — แคชได้เฉพาะภายในการเรียกครั้งเดียว
// 🔴 เขียนทั้งชุดใน tx เดียว · ล้มข้อเดียว = ไม่มีอะไรลง (SettingValue/SettingChange/audit/outbox อยู่ใน tx เดียวกัน)
// 🔴 ล็อก (pg advisory xact) ทั้งชุดในคำสั่งเดียว เรียงตามข้อความ ⇒ ไม่มี deadlock ระหว่างทางเขียน:
//      settings-approval:* (ผลอนุมัติ) < settings-group:* (กลุ่มที่มีกฎข้ามค่า/legalInput · fix 7)
//      < settings-profile:* (setSettings/reset = shared · applyTemplate = exclusive · fix 11) < settings:* (ต่อคีย์/ชั้น · X3)
// 🔴 SettingChange เขียนต่อท้ายอย่างเดียว (ห้าม update/delete/upsert ทั้ง src — ข้อสอบ S-8)
// prisma ตรง: core ไม่ใช่โมดูล (F5 ไม่ครอบ) และต้องใช้ interactive tx + advisory lock — ใส่ tenantId เองทุก where/data
// ─────────────────────────────────────────────────────────────
import { randomBytes, randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/core/db";
import { emitOutboxMany } from "@/lib/core/outbox";
import { canAccessUnit, evaluate } from "@/lib/core/rbac";
import { resolvePolicy, submitForApproval } from "@/lib/modules/approval";
import {
  evaluateLegal,
  isValidOutOfScopeReason,
  normalizeLegalMode,
  type LegalCtx,
  type LegalOutcome,
  type LegalRuleId,
  type LegalRuleInputs,
} from "./legal/th-rental-2568";
import {
  defaultFor,
  getDef,
  getTemplate,
  groupHasRules,
  groupNeedsLock,
  isOwnerOnly,
  isScopeKind,
  legalDependentsOf,
  legalInputsOf,
  listDefs,
  SNAPSHOT_KEYS,
  snapshotDomain,
  validateGroup,
} from "./registry";
import { checkTemplate } from "./template";
import type {
  ApplyTemplateInput,
  PolicySnapshot,
  RemoveResult,
  ResetTarget,
  Resolved,
  ScopeKind,
  ScopeRefs,
  SetFail,
  SetFailCode,
  SetOptions,
  SetResult,
  SettingChangeInput,
  SettingChangeRow,
  SettingDef,
  SettingIssue,
  SettingsActor,
  SettingsCtx,
  SettingsDiffRow,
} from "./types";

type Tx = Prisma.TransactionClient;
/** id ของแต่ละชั้นที่รู้ (null = รู้ว่า "ไม่มี" · ไม่มีคีย์ = ไม่รู้) */
type Known = Partial<Record<ScopeKind, string | null>>;
type Row = { id: string; key: string; scope: string; scopeId: string; value: unknown; effectiveFrom: Date };
type Profile = { templateKey: string; templateVersion: number };
type AuditRow = { action: string; targetType: string; targetId: string; unitId: string | null; actorId: string; before: unknown; after: unknown };

const EPOCH = new Date(0);
/** interactive tx บน Neon: X3 (10 ทางพร้อมกันต่อคีย์เดียว) ต่อคิวกันใต้ล็อก ⇒ ให้เพดานพอ (ค่ากลางของ client = 30 วิ) */
const TX_OPTS = { timeout: 60_000, maxWait: 30_000 } as const;
export const LEGAL_OVERRIDE_ENTITY = "settings.legal_override";
const PROPOSAL_ACTION = "settings.legal_override.proposed";
/** fix 3/15 ▸ เครื่องหมาย "ข้อเสนอนี้ใช้แล้ว" (เขียนใน tx เดียวกับผล) — outbox ส่งซ้ำ ⇒ เงียบ ไม่ทับค่าที่ใหม่กว่า ◂ */
const CONSUMED_ACTION = "settings.legal_override.consumed";
const PROPOSAL_TARGET = "SettingProposal";

/** ชั้นที่มีตารางให้ตรวจความเป็นเจ้าของ — ชั้นอื่น (LEASE RATE_PLAN RESOURCE DEVICE COURSE) ปฏิเสธจนกว่าใบที่สร้างตารางยื่นขอเพิ่ม */
const SUPPORTED_SCOPES: ReadonlySet<ScopeKind> = new Set<ScopeKind>(["TENANT", "UNIT", "BUILDING", "ROOM_TYPE", "ROOM", "STAFF", "SERVICE"]);
const REF_FIELD: Record<ScopeKind, keyof ScopeRefs | null> = {
  TENANT: null,
  UNIT: "unitId",
  BUILDING: "buildingId",
  ROOM_TYPE: "roomTypeId",
  ROOM: "roomId",
  LEASE: "leaseId",
  RATE_PLAN: "ratePlanId",
  STAFF: "staffId",
  SERVICE: "serviceId",
  RESOURCE: "resourceId",
  DEVICE: "deviceId",
  COURSE: "courseId",
};

// ─────────────────── ตัวช่วย ───────────────────

const fail = (code: SetFailCode, issues: SettingIssue[], approvalId?: string | null): SetFail =>
  approvalId === undefined ? { ok: false, code, issues } : { ok: false, code, issues, approvalId };

const NOT_FOUND_ISSUE: SettingIssue = { code: "NOT_FOUND", messageTh: "ไม่พบรายการที่จะตั้งค่า (หรือรายการนี้อยู่นอกสาขาที่คุณดูแล)" };

const mustDef = (key: string): SettingDef => {
  const d = getDef(key);
  if (!d) throw new Error(`[settings] ไม่รู้จักค่าตั้ง ${key}`);
  return d;
};

const jsonIn = (v: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull =>
  v === null || v === undefined ? Prisma.JsonNull : (v as Prisma.InputJsonValue);
/** คอลัมน์ Json? : ไม่มีแถว = NULL ของฐาน (ไม่ใช่ JSON null) */
const jsonOrDbNull = (present: boolean, v: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull | typeof Prisma.DbNull =>
  present ? jsonIn(v) : Prisma.DbNull;

const isUnrestricted = (a: SettingsActor): boolean => a.role === "OWNER" || a.unitAccess.includes("*");
const isRec = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** id เรียงตามเวลา (ภายในโปรเซสเดียวเพิ่มขึ้นเสมอ) — ประวัติที่ at เท่ากันยังเรียงตามลำดับเขียนได้ */
let idSeq = 0;
const newId = (): string =>
  `c${Date.now().toString(36).padStart(9, "0")}${(idSeq++ % 1_679_616).toString(36).padStart(4, "0")}${randomBytes(5).toString("hex")}`;

function knownFromRefs(tenantId: string, refs: Partial<ScopeRefs>): Known {
  const k: Known = { TENANT: tenantId };
  for (const s of Object.keys(REF_FIELD) as ScopeKind[]) {
    const f = REF_FIELD[s];
    if (!f) continue;
    const v = refs[f];
    if (typeof v === "string" && v) k[s] = v;
  }
  return k;
}

function pairsOf(known: Known): { scope: string; scopeId: string }[] {
  const out: { scope: string; scopeId: string }[] = [];
  for (const [scope, id] of Object.entries(known)) if (typeof id === "string" && id) out.push({ scope, scopeId: id });
  return out;
}
const pairSig = (p: { scope: string; scopeId: string }) => `${p.scope}|${p.scopeId}`;
const knownSig = (k: Known) =>
  Object.keys(k)
    .sort()
    .map((s) => `${s}=${k[s as ScopeKind] ?? ""}`)
    .join(",");

const ROW_SELECT = { id: true, key: true, scope: true, scopeId: true, value: true, effectiveFrom: true } as const;
const profKey = (unitId: string, domain: string) => `${unitId}|${domain}`;

/** ไล่ chain จากเจาะจงสุด (มี id) → ชั้นกว้าง → แม่แบบ → _fallback · ต่อชั้นเลือกแถว effectiveFrom ≤ at ล่าสุด */
function resolveDef(def: SettingDef, rows: readonly Row[], known: Known, at: Date, profile: Profile | null | undefined): Resolved {
  const templateKey = profile?.templateKey ?? null;
  const base = defaultFor(def, templateKey);
  const t = at.getTime();
  for (let i = def.chain.length - 1; i >= 0; i--) {
    const scope = def.chain[i];
    const id = known[scope];
    if (typeof id !== "string" || !id) continue;
    let best: Row | undefined;
    for (const r of rows) {
      if (r.key !== def.key || r.scope !== scope || r.scopeId !== id || r.effectiveFrom.getTime() > t) continue;
      if (!best || r.effectiveFrom.getTime() > best.effectiveFrom.getTime()) best = r;
    }
    if (best) return { value: best.value, source: scope, scopeId: id, templateKey, differsFromTemplate: !isDeepStrictEqual(best.value, base) };
  }
  return { value: base, source: profile ? "TEMPLATE" : "FALLBACK", templateKey, differsFromTemplate: false };
}

type Pend = { key: string; scope: string; scopeId: string; effectiveFrom: Date; value: unknown };
const sigOf = (r: { key: string; scope: string; scopeId: string; effectiveFrom: Date }) => `${r.key}|${r.scope}|${r.scopeId}|${r.effectiveFrom.getTime()}`;
/** แถวในฐาน + ค่าของชุดที่กำลังเขียน (ทับแถวเดิมที่ key/scope/scopeId/effectiveFrom ตรง) */
function overlay(rows: readonly Row[], pend: readonly Pend[]): Row[] {
  const repl = new Set(pend.map(sigOf));
  return [...rows.filter((r) => !repl.has(sigOf(r))), ...pend.map((p) => ({ id: "", ...p }))];
}

/**
 * ล็อกทั้งชุดในคำสั่งเดียว (fix 14) · เรียงตามข้อความ (ทุกทางเขียนใช้ลำดับเดียวกัน ⇒ ไม่ deadlock)
 * shared = pg_advisory_xact_lock_shared (คีย์เดียวกันมีทั้งสองแบบ ⇒ exclusive)
 */
async function lockAll(tx: Tx, specs: readonly { key: string; shared?: boolean }[]): Promise<void> {
  const m = new Map<string, boolean>();
  for (const s of specs) m.set(s.key, (m.get(s.key) ?? true) && s.shared === true);
  if (m.size === 0) return;
  const keys = [...m.keys()].sort();
  const shared = keys.map((k) => m.get(k) === true);
  await tx.$queryRaw`SELECT count(*)::int AS n FROM (
    SELECT CASE WHEN u.s THEN pg_advisory_xact_lock_shared(hashtextextended(u.k, 0)) ELSE pg_advisory_xact_lock(hashtextextended(u.k, 0)) END
    FROM unnest(${keys}::text[], ${shared}::boolean[]) WITH ORDINALITY AS u(k, s, i)
    ORDER BY u.i
  ) q`;
}
const keyLock = (tenantId: string, key: string, scope: string, scopeId: string) => `settings:${tenantId}:${key}:${scope}:${scopeId}`;
const groupLock = (tenantId: string, domain: string, group: string) => `settings-group:${tenantId}:${domain}:${group}`;
const profileLock = (tenantId: string, unitId: string, domain: string) => `settings-profile:${tenantId}:${unitId}:${domain}`;

type Located = { unitId: string | null; known: Known };
/**
 * scopeId เป็นของร้านนี้จริงไหม (อ่านใน tx · tenantId ตรง) — ทั้งชุด: 1 คิวรีต่อชนิดชั้น (fix 14)
 * คืน Map "scope|scopeId" → Located | null (ไม่พบ/ร้านอื่น/ชั้นที่ยังไม่มีตาราง ⇒ null)
 */
async function locateMany(db: Tx, tenantId: string, pairs: readonly { scope: string; scopeId: string }[]): Promise<Map<string, Located | null>> {
  const out = new Map<string, Located | null>();
  const by = new Map<string, Set<string>>();
  for (const p of pairs) {
    if (out.has(pairSig(p))) continue;
    out.set(pairSig(p), null);
    if (!by.has(p.scope)) by.set(p.scope, new Set());
    by.get(p.scope)?.add(p.scopeId);
  }
  const ids = (s: string) => [...(by.get(s) ?? [])];
  const T = tenantId;
  const jobs: Promise<void>[] = [];
  for (const id of ids("TENANT")) if (id === T) out.set(pairSig({ scope: "TENANT", scopeId: id }), { unitId: null, known: { TENANT: T } });
  if (by.has("UNIT"))
    jobs.push(
      db.businessUnit.findMany({ where: { tenantId: T, id: { in: ids("UNIT") } }, select: { id: true } }).then((rs) => {
        for (const r of rs) out.set(`UNIT|${r.id}`, { unitId: r.id, known: { TENANT: T, UNIT: r.id } });
      }),
    );
  if (by.has("BUILDING"))
    jobs.push(
      db.roomBuilding.findMany({ where: { tenantId: T, id: { in: ids("BUILDING") } }, select: { id: true, unitId: true } }).then((rs) => {
        for (const r of rs) out.set(`BUILDING|${r.id}`, { unitId: r.unitId, known: { TENANT: T, UNIT: r.unitId, BUILDING: r.id } });
      }),
    );
  if (by.has("ROOM_TYPE"))
    jobs.push(
      db.hotelRoomType.findMany({ where: { tenantId: T, id: { in: ids("ROOM_TYPE") } }, select: { id: true, unitId: true } }).then((rs) => {
        for (const r of rs) out.set(`ROOM_TYPE|${r.id}`, { unitId: r.unitId, known: { TENANT: T, UNIT: r.unitId, ROOM_TYPE: r.id } });
      }),
    );
  if (by.has("ROOM"))
    jobs.push(
      db.hotelRoom.findMany({ where: { tenantId: T, id: { in: ids("ROOM") } }, select: { id: true, unitId: true, buildingId: true, roomTypeId: true } }).then((rs) => {
        for (const r of rs)
          out.set(`ROOM|${r.id}`, { unitId: r.unitId, known: { TENANT: T, UNIT: r.unitId, BUILDING: r.buildingId ?? null, ROOM_TYPE: r.roomTypeId, ROOM: r.id } });
      }),
    );
  if (by.has("STAFF"))
    jobs.push(
      db.bookingStaff.findMany({ where: { tenantId: T, id: { in: ids("STAFF") } }, select: { id: true, unitId: true } }).then((rs) => {
        for (const r of rs) out.set(`STAFF|${r.id}`, { unitId: r.unitId, known: { TENANT: T, UNIT: r.unitId, STAFF: r.id } });
      }),
    );
  if (by.has("SERVICE"))
    jobs.push(
      db.bookingService.findMany({ where: { tenantId: T, id: { in: ids("SERVICE") } }, select: { id: true, unitId: true } }).then((rs) => {
        for (const r of rs) out.set(`SERVICE|${r.id}`, { unitId: r.unitId, known: { TENANT: T, UNIT: r.unitId, SERVICE: r.id } });
      }),
    );
  await Promise.all(jobs); // ชั้นที่ยังไม่มีตาราง — คง null (fail closed)
  return out;
}

/** id ของ entity ชั้นลึกกว่า UNIT ที่อยู่ในสาขานี้ (ใช้กับ RESET_ALL / settingsDiff) */
export async function entitiesOfUnit(db: Tx, tenantId: string, unitId: string): Promise<{ scope: ScopeKind; scopeId: string }[]> {
  const w = { tenantId, unitId };
  const sel = { id: true } as const;
  const [b, rt, rm, st, sv] = await Promise.all([
    db.roomBuilding.findMany({ where: w, select: sel }),
    db.hotelRoomType.findMany({ where: w, select: sel }),
    db.hotelRoom.findMany({ where: w, select: sel }),
    db.bookingStaff.findMany({ where: w, select: sel }),
    db.bookingService.findMany({ where: w, select: sel }),
  ]);
  return [
    ...b.map((r) => ({ scope: "BUILDING" as const, scopeId: r.id })),
    ...rt.map((r) => ({ scope: "ROOM_TYPE" as const, scopeId: r.id })),
    ...rm.map((r) => ({ scope: "ROOM" as const, scopeId: r.id })),
    ...st.map((r) => ({ scope: "STAFF" as const, scopeId: r.id })),
    ...sv.map((r) => ({ scope: "SERVICE" as const, scopeId: r.id })),
  ];
}

/** ด่านสิทธิ์ (ใบสั่ง §5.1 ข้อ 4 + fix 12) */
function permissionIssue(actor: SettingsActor, def: SettingDef, scope: ScopeKind, unitId: string | null, effectiveFrom: Date, now: Date): SettingIssue | null {
  if (isOwnerOnly(def) && actor.role !== "OWNER") {
    return { key: def.key, code: "OWNER_ONLY", messageTh: `«${def.labelTh}» แก้ได้เฉพาะเจ้าของกิจการ` };
  }
  if (scope === "TENANT" && !isUnrestricted(actor)) {
    return { key: def.key, code: "TENANT_SCOPE_FORBIDDEN", messageTh: `ค่าระดับทั้งร้านของ «${def.labelTh}» แก้ได้เฉพาะเจ้าของหรือผู้ดูแลทุกสาขา` };
  }
  const module = def.editPermission.split(".")[0];
  if (!evaluate(actor, { module, action: def.editPermission, unitId: unitId ?? undefined })) {
    return { key: def.key, code: "NO_PERMISSION", messageTh: `คุณยังไม่มีสิทธิ์แก้ «${def.labelTh}» — ขอสิทธิ์จากเจ้าของร้าน` };
  }
  // fix 12 ▸ ค่าเงินที่มีผลย้อนหลัง (วันที่มีผลระบุและอยู่ในอดีต) = เปลี่ยนตัวเลขที่ใช้ไปแล้ว ⇒ เจ้าของเท่านั้น ◂
  if (def.sensitivity === "MONEY" && effectiveFrom.getTime() !== EPOCH.getTime() && effectiveFrom.getTime() < now.getTime() && actor.role !== "OWNER") {
    return { key: def.key, code: "RETROACTIVE_OWNER_ONLY", messageTh: `ตั้ง «${def.labelTh}» ให้มีผลย้อนหลังได้เฉพาะเจ้าของกิจการ` };
  }
  return null;
}

/**
 * R0.4 ▸ ตัวตัดสินสิทธิ์ "แก้ค่านี้ที่ชั้นนี้ได้ไหม" ที่หน้าตั้งค่าใช้ร่วมกับ setSettings/resetSetting (ตรรกะเดียว ห้ามเขียนซ้ำ)
 *   unitId = สาขาของชั้นที่ตั้ง (TENANT ⇒ null) · วันที่มีผลปริยาย (มีผลทันที) ⇒ ไม่เข้าเงื่อนไขย้อนหลัง
 *   คืน null = แก้ได้ · อื่น = เหตุผล (code เดียวกับที่ setSettings ตอบใน PERMISSION) ◂
 */
export function editIssueFor(actor: SettingsActor, def: SettingDef, scope: ScopeKind, unitId: string | null): SettingIssue | null {
  return permissionIssue(actor, def, scope, unitId, EPOCH, new Date());
}

const runLegal = (ruleId: LegalRuleId, input: unknown, ctx: LegalCtx): LegalOutcome =>
  evaluateLegal(ruleId, input as LegalRuleInputs[LegalRuleId], ctx);

// ─────────────────── อ่าน (CC §1.4) ───────────────────

async function loadProfilesFor(db: Tx, tenantId: string, unitIds: readonly string[], domains: readonly string[]): Promise<Map<string, Profile>> {
  const out = new Map<string, Profile>();
  const us = [...new Set(unitIds.filter(Boolean))];
  const ds = [...new Set(domains)];
  if (!us.length || !ds.length) return out;
  const rows = await db.settingProfile.findMany({
    where: { tenantId, unitId: us.length === 1 ? us[0] : { in: us }, domain: ds.length === 1 ? ds[0] : { in: ds } },
    select: { unitId: true, domain: true, templateKey: true, templateVersion: true },
  });
  for (const r of rows) out.set(profKey(r.unitId, r.domain), { templateKey: r.templateKey, templateVersion: r.templateVersion });
  return out;
}

/** อ่านหลายชุด refs ในครั้งเดียว: แถว 1 คิวรี + แม่แบบ 1 คิวรี (fix 14) */
async function resolveBatch(db: Tx, ctx: SettingsCtx, keys: readonly string[], refsList: readonly ScopeRefs[], at: Date) {
  const defs = keys.map(mustDef);
  const knowns = refsList.map((r) => knownFromRefs(ctx.tenantId, r));
  const pairMap = new Map<string, { scope: string; scopeId: string }>();
  for (const k of knowns) for (const p of pairsOf(k)) pairMap.set(pairSig(p), p);
  const ukeys = [...new Set(keys)];
  const [rawRows, profiles] = await Promise.all([
    ukeys.length && pairMap.size
      ? db.settingValue.findMany({
          where: { tenantId: ctx.tenantId, key: { in: ukeys }, OR: [...pairMap.values()], effectiveFrom: { lte: at } },
          select: ROW_SELECT,
        })
      : Promise.resolve([] as Row[]),
    loadProfilesFor(
      db,
      ctx.tenantId,
      refsList.map((r) => r.unitId),
      defs.map((d) => d.domain),
    ),
  ]);
  const rows = rawRows as Row[];
  const outs = knowns.map((known, i) => {
    const out: Record<string, Resolved> = {};
    const unitId = refsList[i].unitId;
    for (const d of defs) out[d.key] = resolveDef(d, rows, known, at, unitId ? profiles.get(profKey(unitId, d.domain)) : undefined);
    return out;
  });
  return { outs, profiles };
}

export async function resolveSetting(ctx: SettingsCtx, key: string, refs: ScopeRefs, at: Date = new Date()): Promise<Resolved> {
  return (await resolveBatch(prisma, ctx, [key], [refs], at)).outs[0][key];
}

/** query เดียวต่อชุด (+ แม่แบบของสาขา) · ผลเท่ากับเรียก resolveSetting ทีละตัว */
export async function resolveSettings(ctx: SettingsCtx, keys: string[], refs: ScopeRefs, at: Date = new Date()): Promise<Record<string, Resolved>> {
  return (await resolveBatch(prisma, ctx, keys, [refs], at)).outs[0];
}

/**
 * R0.4 ▸ ค่าที่มีผล "ที่ชั้น TENANT" (ไม่นับแถวชั้นสาขา/ลึกกว่า) — แม่แบบยังมาจากสาขา unitId ที่ขอ
 * หน้าตั้งค่าชั้นทั้งร้านใช้อ่านค่า (ไม่เปลี่ยนตรรกะ resolveSettings) ◂
 */
export async function resolveSettingsAtTenant(ctx: SettingsCtx, keys: string[], unitId: string, at: Date = new Date()): Promise<Record<string, Resolved>> {
  const defs = keys.map(mustDef);
  const ukeys = [...new Set(keys)];
  const [rawRows, profiles] = await Promise.all([
    ukeys.length
      ? prisma.settingValue.findMany({
          where: { tenantId: ctx.tenantId, key: { in: ukeys }, scope: "TENANT", scopeId: ctx.tenantId, effectiveFrom: { lte: at } },
          select: ROW_SELECT,
        })
      : Promise.resolve([] as Row[]),
    loadProfilesFor(prisma, ctx.tenantId, [unitId], defs.map((d) => d.domain)),
  ]);
  const known: Known = { TENANT: ctx.tenantId };
  const out: Record<string, Resolved> = {};
  for (const d of defs) out[d.key] = resolveDef(d, rawRows as Row[], known, at, profiles.get(profKey(unitId, d.domain)));
  return out;
}

/** fix 14 ▸ หลายชุด refs (เช่น ตารางงาน 20 ช่าง) ≤ 3 คิวรี · ผลต่อ refs ตามลำดับเดียวกับ refsList ◂ */
export async function resolveSettingsMany(
  ctx: SettingsCtx,
  keys: string[],
  refsList: ScopeRefs[],
  at: Date = new Date(),
): Promise<Record<string, Resolved>[]> {
  if (!refsList.length) return [];
  return (await resolveBatch(prisma, ctx, keys, refsList, at)).outs;
}

/** fix 10 ▸ refs ของ entity (ชั้น + id) จากฐาน — ไม่พบ/ร้านอื่น/ชั้นที่ไม่มีสาขา (TENANT) ⇒ null ◂ */
export async function refsFor(ctx: SettingsCtx, scope: string, id: string): Promise<ScopeRefs | null> {
  if (!isScopeKind(scope) || typeof id !== "string" || !id) return null;
  const loc = (await locateMany(prisma, ctx.tenantId, [{ scope, scopeId: id }])).get(pairSig({ scope, scopeId: id }));
  if (!loc || !loc.unitId) return null;
  const refs: ScopeRefs = { unitId: loc.unitId };
  for (const [s, v] of Object.entries(loc.known) as [ScopeKind, string | null | undefined][]) {
    const f = REF_FIELD[s];
    if (f && f !== "unitId" && typeof v === "string" && v) refs[f] = v;
  }
  return refs;
}

/** แถวที่ปรับจากแม่แบบของสาขา (UNIT + ชั้นลึกกว่าในสาขานี้ · + TENANT สำหรับผู้เห็นทั้งร้าน) */
export async function settingsDiff(ctx: SettingsCtx, q: { unitId: string; domain: string; actor?: SettingsActor }): Promise<SettingsDiffRow[]> {
  const restricted = !!q.actor && !isUnrestricted(q.actor);
  if (q.actor && !canAccessUnit(q.actor, q.unitId)) return [];
  const unit = await prisma.businessUnit.findFirst({ where: { id: q.unitId, tenantId: ctx.tenantId }, select: { id: true } });
  if (!unit) return [];
  const ents = await entitiesOfUnit(prisma, ctx.tenantId, q.unitId);
  const pairs = [{ scope: "UNIT", scopeId: q.unitId }, ...ents, ...(restricted ? [] : [{ scope: "TENANT", scopeId: ctx.tenantId }])];
  const [rows, profiles] = await Promise.all([
    prisma.settingValue.findMany({
      where: { tenantId: ctx.tenantId, key: { startsWith: `${q.domain}.` }, OR: pairs },
      select: { key: true, scope: true, scopeId: true, value: true, effectiveFrom: true },
      orderBy: [{ key: "asc" }, { scope: "asc" }, { effectiveFrom: "asc" }],
    }),
    loadProfilesFor(prisma, ctx.tenantId, [q.unitId], [q.domain]),
  ]);
  const tk = profiles.get(profKey(q.unitId, q.domain))?.templateKey ?? null;
  const out: SettingsDiffRow[] = [];
  for (const r of rows) {
    const def = getDef(r.key);
    if (!def) continue;
    out.push({ key: r.key, scope: r.scope, scopeId: r.scopeId, value: r.value, templateValue: defaultFor(def, tk), effectiveFrom: r.effectiveFrom });
  }
  return out;
}

// ─────────────────── Snapshot (CC §1.6) ───────────────────

/**
 * จดค่าลงเอกสาร · target = refs หรือ entity `{scope, scopeId}` (fix 10 — เครื่องหา refs ครบเอง กันลืมส่ง staffId/roomTypeId)
 * ค่า undefined ⇒ null (fix 13 · JSON ล้วน)
 */
export async function snapshotPolicy(
  ctx: SettingsCtx,
  kind: string,
  target: ScopeRefs | { scope: string; scopeId: string },
  at?: Date,
): Promise<PolicySnapshot> {
  const domain = snapshotDomain(kind);
  const keys = SNAPSHOT_KEYS[kind];
  if (!domain || !keys) throw new Error(`[settings] ไม่รู้จักชนิดเอกสาร snapshot ${kind}`);
  let refs: ScopeRefs;
  if ("scope" in target && "scopeId" in target && !("unitId" in target)) {
    const r = await refsFor(ctx, String(target.scope), String(target.scopeId));
    if (!r) throw new Error(`[settings] ไม่พบรายการ ${target.scope} สำหรับ snapshot`);
    refs = r;
  } else refs = target as ScopeRefs;
  const when = at ?? new Date();
  const { outs, profiles } = await resolveBatch(prisma, ctx, keys, [refs], when);
  const out = outs[0];
  const prof = refs.unitId ? profiles.get(profKey(refs.unitId, domain)) : undefined;
  const values: Record<string, unknown> = {};
  const sources: Record<string, string> = {};
  for (const k of keys) {
    const v = out[k].value;
    values[k] = v === undefined ? null : v;
    sources[k] = out[k].source;
  }
  const snap: PolicySnapshot = {
    v: 1,
    domain,
    at: when.toISOString(),
    template: prof ? { key: prof.templateKey, version: prof.templateVersion } : { key: "_fallback", version: 0 },
    values,
    sources,
  };
  return JSON.parse(JSON.stringify(snap)) as PolicySnapshot;
}

/** ค่าจาก snapshot — คีย์ที่ไม่ได้จด ⇒ throw (เอกสารห้ามตกไปอ่าน resolver) */
export function fromSnapshot(snapshot: PolicySnapshot, key: string): unknown {
  if (!snapshot || typeof snapshot !== "object" || !snapshot.values || !Object.prototype.hasOwnProperty.call(snapshot.values, key)) {
    throw new Error(`[settings] snapshot ไม่ได้จดค่า ${key}`);
  }
  return snapshot.values[key];
}

// ─────────────────── เขียน (CC §1.5 · ใบสั่ง §5) ───────────────────

type Draft = {
  def: SettingDef;
  key: string;
  scope: ScopeKind;
  scopeId: string;
  value: unknown;
  effectiveFrom: Date;
  reason: string | null;
};
type Prep = Draft & { unitId: string | null; known: Known; legalLevel: "OK" | "WARN"; legalCode: string | null };
type LegalHit = { prep: Prep; outcome: LegalOutcome };

/** ใบสั่ง §5.1 ข้อ 1 (ไม่ต้องใช้ฐาน) */
function checkShape(key: unknown, scope: unknown): { def: SettingDef; scope: ScopeKind } | SettingIssue {
  const def = typeof key === "string" ? getDef(key) : undefined;
  if (!def) return { key: String(key), code: "UNKNOWN_KEY", messageTh: "ไม่รู้จักค่าตั้งนี้ — ลองโหลดหน้าใหม่อีกครั้ง" };
  if (!isScopeKind(scope)) return { key: def.key, code: "UNKNOWN_SCOPE", messageTh: `ไม่รู้จักระดับที่จะตั้ง «${def.labelTh}»` };
  if (!def.chain.includes(scope)) return { key: def.key, code: "SCOPE_NOT_ALLOWED", messageTh: `«${def.labelTh}» ตั้งที่ระดับนี้ไม่ได้` };
  if (!SUPPORTED_SCOPES.has(scope)) return { key: def.key, code: "SCOPE_UNSUPPORTED", messageTh: `ระบบยังไม่รองรับการตั้ง «${def.labelTh}» ที่ระดับนี้` };
  return { def, scope };
}

function draftOne(c: { key?: unknown; scope?: unknown; scopeId?: unknown; value?: unknown; effectiveFrom?: unknown; reason?: unknown }): Draft | SettingIssue {
  const sh = checkShape(c?.key, c?.scope);
  if (!("def" in sh)) return sh;
  const { def, scope } = sh;
  if (typeof c.scopeId !== "string" || !c.scopeId) return { key: def.key, code: "INVALID_SCOPE_ID", messageTh: `ไม่ได้ระบุรายการที่จะตั้ง «${def.labelTh}»` };
  const parsed = def.schema.safeParse(c.value);
  if (!parsed.success) return { key: def.key, code: "INVALID_VALUE", messageTh: `ค่าของ «${def.labelTh}» อยู่นอกช่วงที่รับได้ — ตรวจตัวเลข/รูปแบบอีกครั้ง` };
  let effectiveFrom = EPOCH;
  if (c.effectiveFrom !== undefined && c.effectiveFrom !== null) {
    const d = c.effectiveFrom instanceof Date ? c.effectiveFrom : new Date(String(c.effectiveFrom));
    if (Number.isNaN(d.getTime())) return { key: def.key, code: "INVALID_EFFECTIVE_FROM", messageTh: `วันที่มีผลของ «${def.labelTh}» ไม่ถูกต้อง` };
    if (!def.effectiveDated && d.getTime() !== EPOCH.getTime()) {
      return { key: def.key, code: "EFFECTIVE_FROM_NOT_ALLOWED", messageTh: `«${def.labelTh}» ไม่มีวันที่มีผล — มีผลทันทีเมื่อบันทึก` };
    }
    effectiveFrom = d;
  }
  const tpl = checkTemplate(def, parsed.data);
  if (tpl.length) return tpl[0];
  const reason = typeof c.reason === "string" && c.reason.trim() ? c.reason.trim() : null;
  return { def, key: def.key, scope, scopeId: c.scopeId, value: parsed.data, effectiveFrom, reason };
}

function draftChanges(changes: readonly SettingChangeInput[]): Draft[] | SetFail {
  if (!Array.isArray(changes)) return fail("VALIDATION", [{ code: "INVALID_INPUT", messageTh: "ข้อมูลที่ส่งมาไม่ถูกรูปแบบ" }]);
  const issues: SettingIssue[] = [];
  const drafts: Draft[] = [];
  for (const c of changes) {
    // effectiveFrom บน def ที่ไม่ใช่ effectiveDated (แม้เป็น 1970) ⇒ VALIDATION (ใบสั่ง §5.1 ข้อ 1)
    const d = draftOne(c ?? {});
    if ("def" in d) {
      if (c.effectiveFrom !== undefined && c.effectiveFrom !== null && !d.def.effectiveDated) {
        issues.push({ key: d.key, code: "EFFECTIVE_FROM_NOT_ALLOWED", messageTh: `«${d.def.labelTh}» ไม่มีวันที่มีผล — มีผลทันทีเมื่อบันทึก` });
      } else drafts.push(d);
    } else issues.push(d);
  }
  if (issues.length) return fail("VALIDATION", issues);
  const seen = new Set<string>();
  const dup: SettingIssue[] = [];
  for (const d of drafts) {
    const s = sigOf(d);
    if (seen.has(s)) dup.push({ key: d.key, code: "DUPLICATE_IN_BATCH", messageTh: `«${d.def.labelTh}» ถูกตั้งซ้ำในการบันทึกครั้งเดียว` });
    seen.add(s);
  }
  if (dup.length) return fail("CONFLICT", dup);
  return drafts;
}

/** ผลตรวจทั้งชุด (ด่าน 3–7) — ใช้ร่วมกันระหว่าง setSettings กับผลอนุมัติ (fix 3) */
type Checked = {
  preps: Prep[];
  rows: Row[];
  profiles: Map<string, Profile>;
  blocks: SettingIssue[];
  warns: LegalHit[];
  now: Date;
};

/**
 * ด่าน 3 (ของร้าน/สาขาที่เข้าได้) → 4 (สิทธิ์) → ล็อก → 5 (ข้ามค่า) → 6 (ตัวต่อ) → 7 (กฎหมาย: คืน blocks/warns ให้ผู้เรียกตัดสิน)
 * อ่านทั้งหมดหลังล็อก (ค่าล่าสุดที่ commit แล้ว)
 */
async function checkBatch(tx: Tx, actor: SettingsActor, tenantId: string, drafts: readonly Draft[]): Promise<{ fail: SetFail } | Checked> {
  const t0 = new Date();

  // 3. scopeId เป็นของร้าน + สาขาที่ผู้กระทำเข้าได้
  const locs = await locateMany(tx, tenantId, drafts);
  const preps: Prep[] = [];
  for (const d of drafts) {
    const loc = locs.get(pairSig(d));
    if (!loc || (loc.unitId && !canAccessUnit(actor, loc.unitId))) return { fail: fail("NOT_FOUND", [{ ...NOT_FOUND_ISSUE, key: d.key }]) };
    preps.push({ ...d, unitId: loc.unitId, known: loc.known, legalLevel: "OK", legalCode: null });
  }

  // 4. สิทธิ์
  const perm = preps.map((p) => permissionIssue(actor, p.def, p.scope, p.unitId, p.effectiveFrom, t0)).filter((x): x is SettingIssue => !!x);
  if (perm.length) return { fail: fail("PERMISSION", perm) };

  // ล็อกทั้งชุด (fix 7 กลุ่ม · fix 11 profile shared · X3 ต่อคีย์) — คำสั่งเดียว
  const dependents = new Map<string, SettingDef[]>();
  for (const p of preps) if (!dependents.has(p.key)) dependents.set(p.key, legalDependentsOf(p.key).filter((d) => d.legal?.length));
  const specs: { key: string; shared?: boolean }[] = [];
  for (const p of preps) {
    specs.push({ key: keyLock(tenantId, p.key, p.scope, p.scopeId) });
    if (groupNeedsLock(p.def.domain, p.def.group)) specs.push({ key: groupLock(tenantId, p.def.domain, p.def.group) });
    for (const d of dependents.get(p.key) ?? []) specs.push({ key: groupLock(tenantId, d.domain, d.group) });
    if (p.unitId) specs.push({ key: profileLock(tenantId, p.unitId, p.def.domain), shared: true });
  }
  await lockAll(tx, specs);
  const now = new Date();

  // อ่านครั้งเดียว: ทุกคีย์ของ domain ที่เกี่ยว (กลุ่ม · โหมดกฎหมาย · legalInput) ที่ทุกชั้นของ change
  //   + แถวชั้นลึกกว่าของกลุ่มที่มีกฎข้ามค่า (fix 8)
  const domains = new Set<string>();
  for (const p of preps) {
    domains.add(p.def.domain);
    for (const d of dependents.get(p.key) ?? []) domains.add(d.domain);
  }
  const domainKeys = [...domains].flatMap((dm) => listDefs(dm).map((d) => d.key));
  const pairMap = new Map<string, { scope: string; scopeId: string }>([[`TENANT|${tenantId}`, { scope: "TENANT", scopeId: tenantId }]]);
  for (const p of preps) for (const x of pairsOf(p.known)) pairMap.set(pairSig(x), x);
  const deepClauses: Prisma.SettingValueWhereInput[] = [];
  const deepSeen = new Set<string>();
  for (const p of preps) {
    if (!groupHasRules(p.def.domain, p.def.group)) continue;
    const deeper = p.def.chain.slice(p.def.chain.indexOf(p.scope) + 1);
    const sig = `${p.def.domain}|${p.def.group}|${deeper.join(",")}`;
    if (!deeper.length || deepSeen.has(sig)) continue;
    deepSeen.add(sig);
    deepClauses.push({ key: { in: listDefs(p.def.domain, p.def.group).map((d) => d.key) }, scope: { in: [...deeper] } });
  }
  const [rows0, profAll] = await Promise.all([
    tx.settingValue.findMany({
      where: { tenantId, OR: [{ key: { in: domainKeys }, OR: [...pairMap.values()] }, ...deepClauses] },
      select: ROW_SELECT,
    }) as Promise<Row[]>,
    tx.settingProfile.findMany({ where: { tenantId, domain: { in: [...domains] } }, select: { unitId: true, domain: true, templateKey: true, templateVersion: true } }),
  ]);
  const profiles = new Map<string, Profile>();
  for (const r of profAll) profiles.set(profKey(r.unitId, r.domain), { templateKey: r.templateKey, templateVersion: r.templateVersion });
  let rows: Row[] = rows0;

  // บริบทของแถวชั้นลึกที่มีอยู่ (fix 8) — UNIT รู้ได้จากตัวแถว · ชั้นอื่นหาสาขา/ชั้นบนจากตาราง entity
  const deepCtx = new Map<string, Known>(); // pairSig → known
  if (deepClauses.length) {
    const need: { scope: string; scopeId: string }[] = [];
    for (const r of rows0) {
      const ps = pairSig(r);
      if (deepCtx.has(ps)) continue;
      if (r.scope === "UNIT") deepCtx.set(ps, { TENANT: tenantId, UNIT: r.scopeId });
      else if (r.scope !== "TENANT") need.push({ scope: r.scope, scopeId: r.scopeId });
    }
    if (need.length) {
      const l2 = await locateMany(tx, tenantId, need);
      for (const [ps, loc] of l2) if (loc) deepCtx.set(ps, loc.known);
    }
    const extra = new Map<string, { scope: string; scopeId: string }>();
    for (const k of deepCtx.values()) for (const x of pairsOf(k)) if (!pairMap.has(pairSig(x))) extra.set(pairSig(x), x);
    if (extra.size) {
      const more = (await tx.settingValue.findMany({
        where: { tenantId, key: { in: domainKeys }, OR: [...extra.values()] },
        select: ROW_SELECT,
      })) as Row[];
      const ids = new Set(rows.map((r) => r.id));
      rows = [...rows, ...more.filter((r) => !ids.has(r.id))];
    }
  }

  const pend: Pend[] = preps.map((p) => ({ key: p.key, scope: p.scope, scopeId: p.scopeId, effectiveFrom: p.effectiveFrom, value: p.value }));
  const after = overlay(rows, pend);
  const profOf = (known: Known, domain: string): Profile | undefined => {
    const u = known.UNIT;
    return typeof u === "string" && u ? profiles.get(profKey(u, domain)) : undefined;
  };

  // 5. ตรวจข้ามค่า (ค่าหลังชุด) — บริบทของ change + (TENANT) ทุกสาขาที่มีแม่แบบ/แถว + แถวชั้นลึกที่ได้รับผล (fix 8)
  const groupIssues: SettingIssue[] = [];
  const seenCtx = new Set<string>();
  for (const p of preps) {
    if (!groupHasRules(p.def.domain, p.def.group)) continue;
    const ctxs: Known[] = [p.known];
    if (p.scope === "TENANT") {
      const units = new Set<string>();
      for (const k of profiles.keys()) if (k.endsWith(`|${p.def.domain}`)) units.add(k.slice(0, k.length - p.def.domain.length - 1));
      for (const u of units) ctxs.push({ TENANT: tenantId, UNIT: u });
    }
    for (const k of deepCtx.values()) if (k[p.scope] === p.scopeId) ctxs.push(k);
    const at = p.effectiveFrom.getTime() > now.getTime() ? p.effectiveFrom : now;
    const defs = listDefs(p.def.domain, p.def.group);
    for (const known of ctxs) {
      const ck = `${p.def.domain}|${p.def.group}|${knownSig(known)}|${at.getTime()}`;
      if (seenCtx.has(ck)) continue;
      seenCtx.add(ck);
      const prof = profOf(known, p.def.domain);
      const values: Record<string, unknown> = {};
      for (const d of defs) values[d.key] = resolveDef(d, after, known, at, prof).value;
      for (const iss of validateGroup(p.def.domain, p.def.group, values)) {
        if (!groupIssues.some((g) => g.code === iss.code && g.key === iss.key)) groupIssues.push(iss);
      }
    }
  }
  if (groupIssues.length) return { fail: fail("VALIDATION", groupIssues) };

  // 6. ต้องเชื่อมตัวต่อ — อ่าน TenantIntegration ตรง (เปลี่ยนเป็น getIntegration เมื่อ R0.5 ลง) · คิวรีเดียว
  const needInteg = preps.filter((p) => p.def.requires?.integration && p.value);
  if (needInteg.length) {
    const kinds = [...new Set(needInteg.map((p) => String(p.def.requires?.integration)))];
    const integs = await tx.tenantIntegration.findMany({ where: { tenantId, kind: { in: kinds }, status: "CONNECTED" }, select: { kind: true, unitIds: true } });
    const integ: SettingIssue[] = [];
    for (const p of needInteg) {
      const kind = String(p.def.requires?.integration);
      const covered = integs.some((r) => r.kind === kind && (r.unitIds.length === 0 || (p.unitId !== null && r.unitIds.includes(p.unitId))));
      if (!covered) {
        integ.push({
          key: p.key,
          code: "REQUIRES_INTEGRATION",
          messageTh: `«${p.def.labelTh}» ต้องเชื่อมบริการ ${kind} ที่ครอบคลุม${p.scope === "TENANT" ? "ทุกสาขา" : "สาขานี้"}ก่อน — ไปที่หน้าศูนย์เชื่อมต่อ`,
        });
      }
    }
    if (integ.length) return { fail: fail("REQUIRES_INTEGRATION", integ) };
  }

  // 7. กฎหมาย (evaluateLegal เท่านั้น · โหมด = ค่าก่อนชุดนี้ที่สาขาของ change · TENANT = STRICT เสมอ)
  //    + def อื่นที่ legalInput อ่านคีย์ที่แก้ ⇒ ตรวจซ้ำด้วยค่าหลังชุด (fix 6)
  const modeCache = new Map<string, LegalCtx>();
  const modeOf = (unitId: string | null, scope: ScopeKind, domain: string): LegalCtx => {
    if (scope === "TENANT" || !unitId) return { mode: "STRICT" };
    const ck = `${unitId}|${domain}`;
    const hit = modeCache.get(ck);
    if (hit) return hit;
    const modeDef = getDef(`${domain}.legal.mode`);
    let lctx: LegalCtx = { mode: "STRICT" };
    if (modeDef) {
      const reasonDef = getDef(`${domain}.legal.outOfScopeReason`);
      const known: Known = { TENANT: tenantId, UNIT: unitId };
      const prof = profiles.get(profKey(unitId, domain));
      const reason = reasonDef ? resolveDef(reasonDef, rows, known, now, prof).value : null;
      lctx = { mode: normalizeLegalMode(resolveDef(modeDef, rows, known, now, prof).value), outOfScopeReason: typeof reason === "string" ? reason : null };
    }
    modeCache.set(ck, lctx);
    return lctx;
  };
  const getterOf = (known: Known) => {
    const cache = new Map<string, unknown>();
    return (k: string): unknown => {
      if (cache.has(k)) return cache.get(k);
      const d = getDef(k);
      const v = d ? resolveDef(d, after, known, now, profOf(known, d.domain)).value : undefined;
      cache.set(k, v);
      return v;
    };
  };
  const blocks: SettingIssue[] = [];
  const warns: LegalHit[] = [];
  const evaluated = new Set<string>();
  const check = (p: Prep, def: SettingDef, value: unknown, known: Known) => {
    const sig = `${def.key}|${knownSig(known)}|${JSON.stringify(value) ?? ""}`;
    if (evaluated.has(sig)) return;
    evaluated.add(sig);
    const lctx = modeOf(p.unitId, p.scope, def.domain);
    let inputs: { ruleId: LegalRuleId; input: unknown }[];
    try {
      inputs = legalInputsOf(def, value, getterOf(known));
    } catch {
      blocks.push({ key: def.key, code: "LEGAL_INPUT_ERROR", messageTh: `ตรวจกฎหมายของ «${def.labelTh}» ไม่ได้ — บันทึกไม่ได้จนกว่าจะแก้` });
      return;
    }
    for (const { ruleId, input } of inputs) {
      const o = runLegal(ruleId, input, lctx);
      if (o.level === "BLOCK") blocks.push({ key: def.key, code: o.code, messageTh: o.messageTh });
      else if (o.needsAck) warns.push({ prep: p, outcome: o });
      else if (o.raw !== "OK" && !p.legalCode) p.legalCode = o.code; // OUT_OF_SCOPE: บันทึก OK + code ดิบ
    }
  };
  for (const p of preps) if (p.def.legal?.length) check(p, p.def, p.value, p.known);
  for (const p of preps) {
    for (const d of dependents.get(p.key) ?? []) {
      if (d.key === p.key) continue;
      check(p, d, resolveDef(d, after, p.known, now, profOf(p.known, d.domain)).value, p.known);
    }
  }
  return { preps, rows, profiles, blocks, warns, now };
}

/**
 * ใบสั่ง §5.1 ข้อ 8 — เขียนแถว + ประวัติ + audit + outbox (ใน tx · insert เป็นชุด · fix 14)
 * fix 9 (มติ ก): ค่าเท่ากับที่สืบจากชั้นบน ⇒ ไม่สร้างแถวใหม่ (เฉพาะตอนยังไม่มีแถว) · แถวที่มีอยู่แล้วไม่ลบเพราะค่าบังเอิญเท่าชั้นบน
 */
async function writeChecked(tx: Tx, tenantId: string, actorId: string, c: Checked, approvalId: string | null): Promise<number> {
  const { preps, rows, profiles, now } = c;
  const bySig = new Map(rows.map((r) => [sigOf(r), r]));
  const pend: Pend[] = preps.map((p) => ({ key: p.key, scope: p.scope, scopeId: p.scopeId, effectiveFrom: p.effectiveFrom, value: p.value }));
  const creates: Prisma.SettingValueCreateManyInput[] = [];
  const changes: Prisma.SettingChangeCreateManyInput[] = [];
  const audits: AuditRow[] = [];
  const events = new Map<string, { domain: string; scope: string; scopeId: string; unitId: string | null; keys: Set<string>; changeId: string }>();
  let saved = 0;

  for (const [i, p] of preps.entries()) {
    saved++;
    const existing = bySig.get(sigOf(p));
    if (existing && isDeepStrictEqual(existing.value, p.value)) continue; // ค่าเดิม ⇒ ไม่มีอะไรเปลี่ยน
    if (!existing && !p.def.effectiveDated && p.scope !== "TENANT") {
      const upper = p.def.chain.slice(0, p.def.chain.indexOf(p.scope));
      if (upper.every((s) => Object.prototype.hasOwnProperty.call(p.known, s))) {
        const knownUpper: Known = {};
        for (const s of upper) knownUpper[s] = p.known[s];
        const others = pend.filter((x, j) => j !== i && x.key === p.key);
        const prof = p.unitId ? profiles.get(profKey(p.unitId, p.def.domain)) : undefined;
        const inherited = resolveDef(p.def, overlay(rows, others), knownUpper, now, prof).value;
        if (isDeepStrictEqual(inherited, p.value)) continue; // ไม่มีแถว และค่าที่ขอ = ค่าที่สืบ ⇒ ไม่เก็บแถว (CC §1.2)
      }
    }
    let targetId: string;
    if (existing) {
      await tx.settingValue.update({ where: { id: existing.id }, data: { value: jsonIn(p.value), setById: actorId, overrideReason: p.reason } });
      targetId = existing.id;
    } else {
      targetId = newId();
      creates.push({ id: targetId, tenantId, key: p.key, scope: p.scope, scopeId: p.scopeId, value: jsonIn(p.value), effectiveFrom: p.effectiveFrom, setById: actorId, overrideReason: p.reason });
    }
    const changeId = newId();
    changes.push({
      id: changeId,
      tenantId,
      unitId: p.unitId,
      key: p.key,
      scope: p.scope,
      scopeId: p.scopeId,
      before: jsonOrDbNull(!!existing, existing?.value),
      after: jsonIn(p.value),
      effectiveFrom: p.effectiveFrom,
      legalLevel: p.legalLevel,
      legalCode: p.legalCode,
      reason: p.reason,
      approvalId,
      actorId,
      at: now,
    });
    const ef = p.effectiveFrom.toISOString();
    audits.push({
      action: "settings.set",
      targetType: "SettingValue",
      targetId,
      unitId: p.unitId,
      actorId,
      before: { key: p.key, scope: p.scope, scopeId: p.scopeId, effectiveFrom: ef, value: existing ? existing.value : null },
      after: { key: p.key, scope: p.scope, scopeId: p.scopeId, effectiveFrom: ef, value: p.value, legalLevel: p.legalLevel, legalCode: p.legalCode, reason: p.reason, approvalId, changeId },
    });
    const ek = `${p.def.domain}|${p.scope}|${p.scopeId}`;
    const ev = events.get(ek);
    if (ev) ev.keys.add(p.key);
    else events.set(ek, { domain: p.def.domain, scope: p.scope, scopeId: p.scopeId, unitId: p.unitId, keys: new Set([p.key]), changeId });
  }
  if (creates.length) await tx.settingValue.createMany({ data: creates });
  await appendChanges(tx, changes);
  await writeAudits(tx, tenantId, audits);
  await emitChanged(tx, tenantId, [...events.values()].map((e) => ({ ...e, keys: [...e.keys], idem: e.changeId })));
  return saved;
}

async function appendChanges(tx: Tx, changes: Prisma.SettingChangeCreateManyInput[]): Promise<void> {
  if (changes.length) await tx.settingChange.createMany({ data: changes });
}

/** audit ใน tx เดียวกับผล (ล้ม = ไม่มีอะไรลง · คิวรีเดียว) */
async function writeAudits(tx: Tx, tenantId: string, audits: readonly AuditRow[]): Promise<void> {
  if (!audits.length) return;
  await tx.auditLog.createMany({
    data: audits.map((a) => ({
      tenantId,
      unitId: a.unitId,
      actorType: "USER" as const,
      actorId: a.actorId,
      action: a.action,
      targetType: a.targetType,
      targetId: a.targetId,
      before: a.before === null || a.before === undefined ? Prisma.DbNull : (a.before as Prisma.InputJsonValue),
      after: a.after === null || a.after === undefined ? Prisma.DbNull : (a.after as Prisma.InputJsonValue),
    })),
  });
}

async function emitChanged(
  tx: Tx,
  tenantId: string,
  evs: readonly { domain: string; scope: string; scopeId: string; unitId: string | null; keys: readonly string[]; idem: string }[],
): Promise<void> {
  if (!evs.length) return;
  await emitOutboxMany(
    tx,
    evs.map((e) => ({
      tenantId,
      type: "settings.changed",
      idempotencyKey: `settings.changed#${e.idem}`,
      unitId: e.unitId,
      // payload มีแค่คีย์/ชั้น — ไม่มีค่า (ค่าอาจเป็นเงิน/ข้อความ · ผู้รับอ่าน resolver เอง)
      payload: { tenantId, unitId: e.unitId, domain: e.domain, keys: [...e.keys], scope: e.scope, scopeId: e.scopeId },
    })),
  );
}

const OWNER_MUST_APPROVE: SettingIssue = {
  code: "OWNER_MUST_APPROVE",
  messageTh: "ต้องให้เจ้าของกิจการอนุมัติ แต่ร้านยังไม่ได้ตั้งสายอนุมัติ «ข้ามคำเตือนกฎหมายในค่าตั้ง» ที่มีขั้นเจ้าของ — ให้เจ้าของบันทึกเอง หรือตั้งสายอนุมัติก่อน",
};

/**
 * setSettings — ทั้งชุดใน tx เดียว (ใบสั่ง §5.1 ลำดับ 1→8)
 * VALIDATION → CONFLICT → NOT_FOUND → PERMISSION → VALIDATION(ข้ามค่า) → REQUIRES_INTEGRATION → LEGAL_BLOCK/NEEDS_APPROVAL → เขียน
 */
export async function setSettings(actor: SettingsActor, ctx: SettingsCtx, changes: SettingChangeInput[], opts: SetOptions = {}): Promise<SetResult> {
  const drafts = draftChanges(changes);
  if (!Array.isArray(drafts)) return drafts;
  if (drafts.length === 0) return { ok: true, saved: 0 };
  const tenantId = ctx.tenantId;

  return prisma.$transaction(async (tx): Promise<SetResult> => {
    const c = await checkBatch(tx, actor, tenantId, drafts);
    if ("fail" in c) return c.fail;
    if (c.blocks.length) return fail("LEGAL_BLOCK", c.blocks);
    if (c.warns.length) {
      const warnIssues = c.warns.map((w) => ({ key: w.prep.key, code: w.outcome.code, messageTh: w.outcome.messageTh }));
      if (opts.ackLegalWarn !== true) return fail("NEEDS_APPROVAL", warnIssues, null);
      const noReason = c.warns.filter((w) => !isValidOutOfScopeReason(w.prep.reason));
      if (noReason.length) {
        return fail(
          "VALIDATION",
          noReason.map((w) => ({ key: w.prep.key, code: "REASON_REQUIRED", messageTh: "ยอมรับคำเตือนกฎหมายแล้วต้องระบุเหตุผลอย่างน้อย 10 ตัวอักษร" })),
        );
      }
      for (const w of c.warns) {
        w.prep.legalLevel = "WARN";
        w.prep.legalCode = w.outcome.code;
      }
      const needOwner = c.warns.some((w) => w.outcome.needsOwnerApproval);
      if (needOwner && actor.role !== "OWNER") {
        // fix 4 ▸ ชุดที่ขออนุมัติต้องอยู่สาขาเดียว (คำขอผูกสาขาเดียว · ผู้อนุมัติเห็นตามสาขา) ◂
        const units = new Set(c.preps.map((p) => p.unitId));
        const unitId = c.preps[0].unitId;
        if (units.size !== 1 || !unitId) {
          return fail("VALIDATION", [{ code: "APPROVAL_SINGLE_UNIT", messageTh: "ค่าที่ต้องขออนุมัติต้องอยู่สาขาเดียวกันทั้งชุด — แยกบันทึกทีละสาขา" }]);
        }
        // fix 1 ▸ สายที่ไม่มีขั้นเจ้าของ ⇒ ไม่ส่ง (ข้ามคำเตือนกฎหมายต้องเจ้าของอนุมัติ · ไม่ autoApprove) ◂
        const policy = await resolvePolicy({ tenantId }, { entityType: LEGAL_OVERRIDE_ENTITY, unitId, systemId: null, amountSatang: null }, tx);
        const steps = policy ? await tx.approvalStep.findMany({ where: { tenantId, policyId: policy.id }, select: { approverRole: true } }) : [];
        if (!steps.some((s) => s.approverRole === "OWNER")) return fail("NEEDS_APPROVAL", [...warnIssues, OWNER_MUST_APPROVE], null);
        const proposalId = randomUUID();
        const sub = await submitForApproval({ tenantId }, { entityType: LEGAL_OVERRIDE_ENTITY, entityId: proposalId, unitId, requestedById: actor.userId }, { tx });
        if (!("requestId" in sub)) return fail("NEEDS_APPROVAL", [...warnIssues, OWNER_MUST_APPROVE], null);
        // ข้อเสนอ = AuditLog ใน tx (ไม่มี migration) · ผูก requestId/ผู้ยื่น · เก็บค่าฐานต่อคีย์ (fix 3 STALE) · รหัสคำเตือนที่ขอข้าม (fix 2)
        const bySig = new Map(c.rows.map((r) => [sigOf(r), r]));
        await tx.auditLog.create({
          data: {
            tenantId,
            unitId,
            actorType: "USER",
            actorId: actor.userId,
            action: PROPOSAL_ACTION,
            targetType: PROPOSAL_TARGET,
            targetId: proposalId,
            after: {
              v: 2,
              requestId: sub.requestId,
              unitId,
              requestedById: actor.userId,
              codes: [...new Set(c.warns.map((w) => w.outcome.code))],
              changes: c.preps.map((p) => {
                const base = bySig.get(sigOf(p));
                return {
                  key: p.key,
                  scope: p.scope,
                  scopeId: p.scopeId,
                  value: p.value === undefined ? null : p.value,
                  effectiveFrom: p.effectiveFrom.toISOString(),
                  reason: p.reason,
                  base: base ? { present: true, value: base.value === undefined ? null : base.value } : { present: false, value: null },
                };
              }),
            } as Prisma.InputJsonValue,
          },
        });
        return fail("NEEDS_APPROVAL", warnIssues, sub.requestId);
      }
    }
    const saved = await writeChecked(tx, tenantId, actor.userId, c, null);
    return { ok: true, saved };
  }, TX_OPTS);
}

/**
 * คืนค่าแม่แบบ = ลบแถวของ key/scope/scopeId (ตรวจ 1/3/4 เหมือนเขียน)
 * fix 12 ▸ คีย์ effectiveDated: ไม่ลบแถวที่มีวันที่มีผลแล้ว (ประวัติ) — ลบเฉพาะแถวอนาคต + แถว "มีผลตลอด" (1970) ◂
 */
export async function resetSetting(actor: SettingsActor, ctx: SettingsCtx, t: ResetTarget): Promise<RemoveResult> {
  const sh = checkShape(t?.key, t?.scope);
  if (!("def" in sh)) return fail("VALIDATION", [sh]);
  if (typeof t.scopeId !== "string" || !t.scopeId) return fail("VALIDATION", [{ key: sh.def.key, code: "INVALID_SCOPE_ID", messageTh: "ไม่ได้ระบุรายการที่จะคืนค่า" }]);
  const { def, scope } = sh;
  const tenantId = ctx.tenantId;
  return prisma.$transaction(async (tx): Promise<RemoveResult> => {
    const loc = (await locateMany(tx, tenantId, [{ scope, scopeId: t.scopeId }])).get(pairSig({ scope, scopeId: t.scopeId }));
    if (!loc || (loc.unitId && !canAccessUnit(actor, loc.unitId))) return fail("NOT_FOUND", [{ ...NOT_FOUND_ISSUE, key: def.key }]);
    const perm = permissionIssue(actor, def, scope, loc.unitId, EPOCH, new Date());
    if (perm) return fail("PERMISSION", [perm]);
    await lockAll(tx, [
      { key: keyLock(tenantId, def.key, scope, t.scopeId) },
      ...(groupNeedsLock(def.domain, def.group) ? [{ key: groupLock(tenantId, def.domain, def.group) }] : []),
      ...(loc.unitId ? [{ key: profileLock(tenantId, loc.unitId, def.domain), shared: true }] : []),
    ]);
    const now = new Date();
    const all = await tx.settingValue.findMany({
      where: { tenantId, key: def.key, scope, scopeId: t.scopeId },
      select: { id: true, value: true, effectiveFrom: true },
      orderBy: { effectiveFrom: "asc" },
    });
    const rows = def.effectiveDated ? all.filter((r) => r.effectiveFrom.getTime() === EPOCH.getTime() || r.effectiveFrom.getTime() > now.getTime()) : all;
    if (!rows.length) return { ok: true, removed: 0 };
    await tx.settingValue.deleteMany({ where: { tenantId, id: { in: rows.map((r) => r.id) } } });
    const changes: Prisma.SettingChangeCreateManyInput[] = [];
    const audits: AuditRow[] = [];
    for (const r of rows) {
      const changeId = newId();
      changes.push({
        id: changeId,
        tenantId,
        unitId: loc.unitId,
        key: def.key,
        scope,
        scopeId: t.scopeId,
        before: jsonIn(r.value),
        after: Prisma.DbNull,
        effectiveFrom: r.effectiveFrom,
        legalLevel: "OK",
        actorId: actor.userId,
        at: now,
      });
      const ef = r.effectiveFrom.toISOString();
      audits.push({
        action: "settings.reset",
        targetType: "SettingValue",
        targetId: r.id,
        unitId: loc.unitId,
        actorId: actor.userId,
        before: { key: def.key, scope, scopeId: t.scopeId, effectiveFrom: ef, value: r.value },
        after: { key: def.key, scope, scopeId: t.scopeId, effectiveFrom: ef, value: null, changeId },
      });
    }
    await appendChanges(tx, changes);
    await writeAudits(tx, tenantId, audits);
    await emitChanged(tx, tenantId, [{ domain: def.domain, scope, scopeId: t.scopeId, unitId: loc.unitId, keys: [def.key], idem: String(changes[0].id) }]);
    return { ok: true, removed: rows.length };
  }, TX_OPTS);
}

/** ใช้แม่แบบกับสาขา — OWNER เท่านั้น · RESET_ALL ลบแถว domain นั้นที่ UNIT + ชั้นลึกกว่าในสาขานี้ (คง TENANT/สาขาอื่น/domain อื่น) */
export async function applyTemplate(actor: SettingsActor, ctx: SettingsCtx, i: ApplyTemplateInput): Promise<RemoveResult> {
  const tpl = typeof i?.domain === "string" && typeof i?.templateKey === "string" ? getTemplate(i.domain, i.templateKey) : undefined;
  if (!tpl) return fail("VALIDATION", [{ code: "UNKNOWN_TEMPLATE", messageTh: "ไม่รู้จักแม่แบบนี้ — ลองโหลดหน้าใหม่อีกครั้ง" }]);
  if (i.overwrite !== "KEEP_CUSTOM" && i.overwrite !== "RESET_ALL") return fail("VALIDATION", [{ code: "INVALID_OVERWRITE", messageTh: "เลือกวิธีใช้แม่แบบ (คงค่าที่ปรับไว้ / ล้างทั้งหมด)" }]);
  if (typeof i.unitId !== "string" || !i.unitId) return fail("NOT_FOUND", [NOT_FOUND_ISSUE]);
  const tenantId = ctx.tenantId;
  const domain = i.domain;
  return prisma.$transaction(async (tx): Promise<RemoveResult> => {
    // fix 11 ▸ exclusive ก่อนอ่าน — setSettings/reset ถือ shared ของ profile เดียวกันตลอด tx ⇒ ไม่มีแถวเกิดระหว่างล้าง ◂
    await lockAll(tx, [{ key: profileLock(tenantId, i.unitId, domain) }]);
    const unit = await tx.businessUnit.findFirst({ where: { id: i.unitId, tenantId }, select: { id: true } });
    if (!unit || !canAccessUnit(actor, unit.id)) return fail("NOT_FOUND", [NOT_FOUND_ISSUE]);
    if (actor.role !== "OWNER") {
      return fail("PERMISSION", [{ code: "OWNER_ONLY", messageTh: "ใช้แม่แบบได้เฉพาะเจ้าของกิจการ (แม่แบบเปลี่ยนค่าเงินและค่ากฎหมาย)" }]);
    }
    const now = new Date();
    const before = await tx.settingProfile.findFirst({ where: { tenantId, unitId: unit.id, domain }, select: { templateKey: true, templateVersion: true } });
    const prof = await tx.settingProfile.upsert({
      where: { unitId_domain: { unitId: unit.id, domain } },
      create: { tenantId, unitId: unit.id, domain, templateKey: tpl.key, templateVersion: tpl.version, appliedById: actor.userId },
      update: { templateKey: tpl.key, templateVersion: tpl.version, appliedById: actor.userId, appliedAt: now },
      select: { id: true },
    });
    let removed = 0;
    if (i.overwrite === "RESET_ALL") {
      const ents = await entitiesOfUnit(tx, tenantId, unit.id);
      const pairs = [{ scope: "UNIT", scopeId: unit.id }, ...ents];
      // D.13 P3 ▸ RESET_ALL ไม่ล้างคีย์ที่ต้องเปลี่ยนผ่านหน้าเฉพาะ (def.writeVia เช่นโหมดกฎหมาย) และสิทธิ์ดูข้อมูล rooms.access.*
      //   (ล้างแล้วขอบเขตผู้ดูแลกว้างขึ้นเงียบ ๆ) — คงแถวเดิมไว้ ◂
      const rows = (
        await tx.settingValue.findMany({
          where: { tenantId, key: { startsWith: `${domain}.` }, OR: pairs },
          select: { id: true, key: true, scope: true, scopeId: true, value: true, effectiveFrom: true },
        })
      ).filter((r) => !getDef(r.key)?.writeVia && !r.key.startsWith("rooms.access."));
      if (rows.length) {
        await lockAll(tx, rows.map((r) => ({ key: keyLock(tenantId, r.key, r.scope, r.scopeId) })));
        await tx.settingValue.deleteMany({ where: { tenantId, id: { in: rows.map((r) => r.id) } } });
        await appendChanges(
          tx,
          rows.map((r) => ({
            id: newId(),
            tenantId,
            unitId: unit.id,
            key: r.key,
            scope: r.scope,
            scopeId: r.scopeId,
            before: jsonIn(r.value),
            after: Prisma.DbNull,
            effectiveFrom: r.effectiveFrom,
            legalLevel: "OK",
            reason: `ใช้แม่แบบ ${tpl.key} (ล้างค่าที่ปรับ)`,
            actorId: actor.userId,
            at: now,
          })),
        );
      }
      removed = rows.length;
    }
    const keys = listDefs(domain).map((d) => d.key);
    if (keys.length) await emitChanged(tx, tenantId, [{ domain, scope: "UNIT", scopeId: unit.id, unitId: unit.id, keys, idem: `tpl:${randomUUID()}` }]);
    await writeAudits(tx, tenantId, [
      {
        action: "settings.template.apply",
        targetType: "SettingProfile",
        targetId: prof.id,
        unitId: unit.id,
        actorId: actor.userId,
        before: before ? { unitId: unit.id, domain, templateKey: before.templateKey, templateVersion: before.templateVersion } : null,
        after: { unitId: unit.id, domain, templateKey: tpl.key, templateVersion: tpl.version, overwrite: i.overwrite, removed },
      },
    ]);
    return { ok: true, removed };
  }, TX_OPTS);
}

/**
 * ประวัติของร้าน · ผู้ที่ไม่ใช่ OWNER และไม่มี "*" เห็นเฉพาะสาขาที่เข้าได้ (แถว TENANT = null ไม่เห็น)
 * R0.4 ▸ actor ที่ไม่ใช่ OWNER: แถวของ def PRIVACY ⇒ before/after = null + masked (ค่าลับไม่ออกจากชั้นนี้) · ไม่ส่ง actor = ค่าจริง
 *   keys = เฉพาะคีย์ในรายการ · includeTenant = รวมแถวชั้นทั้งร้านด้วย (เฉพาะผู้ดูที่ไม่จำกัดสาขา) · limit = จำนวนล่าสุด ◂
 */
export async function settingHistory(
  ctx: SettingsCtx,
  q: { unitId?: string; key?: string; keys?: readonly string[]; includeTenant?: boolean; limit?: number; actor?: SettingsActor },
): Promise<SettingChangeRow[]> {
  const where: Prisma.SettingChangeWhereInput = { tenantId: ctx.tenantId };
  if (q.key) where.key = q.key;
  else if (q.keys) where.key = { in: [...q.keys] };
  const restricted = !!q.actor && !isUnrestricted(q.actor);
  if (restricted) {
    if (q.unitId && !q.actor?.unitAccess.includes(q.unitId)) return [];
    where.unitId = q.unitId ? q.unitId : { in: (q.actor?.unitAccess ?? []).filter((u) => u !== "*") };
  } else if (q.unitId) {
    where.unitId = q.includeTenant ? undefined : q.unitId;
    if (q.includeTenant) where.OR = [{ unitId: q.unitId }, { unitId: null, scope: "TENANT" }];
  }
  const rows = await prisma.settingChange.findMany({ where, orderBy: [{ at: "desc" }, { id: "desc" }], take: q.limit && q.limit > 0 ? q.limit : 1000 });
  const hide = !!q.actor && q.actor.role !== "OWNER";
  return rows.map((r) => {
    if (hide && getDef(r.key)?.sensitivity === "PRIVACY") return { ...r, before: null, after: null, masked: true };
    return { ...r, before: r.before, after: r.after };
  });
}

// ─────────────────── ผลอนุมัติ settings.legal_override (ใบสั่ง §5.4 + fix 1/2/3/15) ───────────────────

export type LegalOverrideApplyStatus = "APPLIED" | "ALREADY" | "NOT_APPROVED" | "INVALID" | "STALE";

/**
 * เรียกจาก approval-effects เมื่อคำขอ APPROVED — เขียนตามข้อเสนอ (actorId = ผู้ยื่น · approvalId = requestId)
 * fix 1: ต้องมีการอนุมัติ (ApprovalDecision APPROVED) โดยผู้ที่ "ตอนนี้" เป็นเจ้าของร้าน (Membership สด)
 * fix 2: ตรวจกฎหมายซ้ำด้วยโหมดปัจจุบัน — BLOCK ⇒ INVALID · คำเตือนที่ยอมได้ = เฉพาะรหัสที่ขอข้ามไว้ในข้อเสนอ
 * fix 3: ด่าน 3–6 ซ้ำด้วยสิทธิ์ผู้ยื่นจาก Membership สด · ค่าปัจจุบัน ≠ ค่าฐานในข้อเสนอ ⇒ STALE · ผูก requestId/ผู้ยื่น
 * fix 15: เครื่องหมาย "ใช้แล้ว" เขียนใน tx เดียวกับผล ⇒ outbox ส่งซ้ำ = เงียบ (ไม่ทับค่าที่ใหม่กว่า)
 */
export async function applyLegalOverrideApproval(input: {
  tenantId: string;
  requestId: string;
  proposalId: string;
}): Promise<{ status: LegalOverrideApplyStatus; detail?: string }> {
  const { tenantId, requestId, proposalId } = input;
  if (!tenantId || !requestId || !proposalId) return { status: "INVALID", detail: "ข้อมูลคำขอไม่ครบ" };
  return prisma.$transaction(async (tx): Promise<{ status: LegalOverrideApplyStatus; detail?: string }> => {
    await lockAll(tx, [{ key: `settings-approval:${tenantId}:${proposalId}` }]);
    const used = await tx.auditLog.findFirst({ where: { tenantId, action: CONSUMED_ACTION, targetType: PROPOSAL_TARGET, targetId: proposalId }, select: { id: true } });
    if (used || (await tx.settingChange.count({ where: { tenantId, approvalId: requestId } })) > 0) return { status: "ALREADY" };
    const req = await tx.approvalRequest.findFirst({
      where: { id: requestId, tenantId, entityType: LEGAL_OVERRIDE_ENTITY, entityId: proposalId },
      select: { status: true, requestedById: true, unitId: true },
    });
    if (!req || req.status !== "APPROVED") return { status: "NOT_APPROVED" };

    const consume = async (status: LegalOverrideApplyStatus, detail?: string) => {
      await tx.auditLog.create({
        data: {
          tenantId,
          unitId: req.unitId,
          actorType: "SYSTEM",
          action: CONSUMED_ACTION,
          targetType: PROPOSAL_TARGET,
          targetId: proposalId,
          after: { requestId, status, ...(detail ? { detail } : {}) },
        },
      });
      return detail ? { status, detail } : { status };
    };

    // fix 1 ▸ ผู้อนุมัติต้องเป็นเจ้าของร้าน ณ ตอนนี้
    const decs = await tx.approvalDecision.findMany({ where: { tenantId, requestId, decision: "APPROVED" }, select: { decidedById: true } });
    const approvers = [...new Set(decs.map((d) => d.decidedById))];
    const owners = approvers.length ? await tx.membership.count({ where: { tenantId, userId: { in: approvers }, role: "OWNER", acceptedAt: { not: null } } }) : 0;
    if (owners === 0) return consume("INVALID", "OWNER_DID_NOT_APPROVE");

    const prop = await tx.auditLog.findFirst({ where: { tenantId, action: PROPOSAL_ACTION, targetType: PROPOSAL_TARGET, targetId: proposalId }, select: { after: true } });
    const body = prop?.after;
    if (!isRec(body) || !Array.isArray(body.changes) || body.changes.length === 0) return consume("INVALID", "ไม่พบข้อเสนอ");
    if (body.requestId !== requestId || body.requestedById !== req.requestedById) return consume("INVALID", "ข้อเสนอไม่ตรงคำขอ");
    const approvedCodes = new Set(Array.isArray(body.codes) ? body.codes.filter((x): x is string => typeof x === "string") : []);

    // fix 3 ▸ ผู้ยื่นจาก Membership สด (ถูกถอด/ลดสิทธิ์/ย้ายสาขาระหว่างรอ ⇒ ไม่ใช้)
    // R0.6 fix 1 ▸ ถอนสิทธิ์ = acceptedAt null ⇒ ไม่นับเป็นสมาชิก ◂
    const mem = await tx.membership.findFirst({
      where: { userId: req.requestedById, tenantId, acceptedAt: { not: null } },
      select: { role: true, unitAccess: true, permissions: true },
    });
    if (!mem) return consume("INVALID", "ผู้ยื่นไม่ได้เป็นสมาชิกร้านแล้ว");
    const actor: SettingsActor = {
      role: mem.role,
      unitAccess: Array.isArray(mem.unitAccess) ? mem.unitAccess.filter((x): x is string => typeof x === "string") : [],
      permissions: isRec(mem.permissions) ? mem.permissions : {},
      userId: req.requestedById,
    };

    const drafts: Draft[] = [];
    const bases = new Map<string, { present: boolean; value: unknown }>();
    for (const raw of body.changes as unknown[]) {
      if (!isRec(raw)) return consume("INVALID", "ข้อเสนอเสีย");
      const d = draftOne({ key: raw.key, scope: raw.scope, scopeId: raw.scopeId, value: raw.value, effectiveFrom: raw.effectiveFrom, reason: raw.reason });
      if (!("def" in d)) return consume("INVALID", d.code);
      const b = isRec(raw.base) ? raw.base : null;
      if (!b) return consume("INVALID", "ข้อเสนอไม่มีค่าฐาน");
      bases.set(sigOf(d), { present: b.present === true, value: b.value ?? null });
      drafts.push(d);
    }

    const c = await checkBatch(tx, actor, tenantId, drafts);
    if ("fail" in c) return consume("INVALID", c.fail.code);
    // ค่าปัจจุบัน ≠ ค่าฐานที่ผู้ยื่นเห็น ⇒ มีคนแก้ระหว่างรอ ⇒ ไม่ทับ
    const bySig = new Map(c.rows.map((r) => [sigOf(r), r]));
    for (const p of c.preps) {
      const base = bases.get(sigOf(p));
      const cur = bySig.get(sigOf(p));
      if (!base || base.present !== !!cur || (cur && !isDeepStrictEqual(cur.value ?? null, base.value))) return consume("STALE", p.key);
    }
    if (c.blocks.length) return consume("INVALID", `LEGAL_BLOCK ${c.blocks.map((b) => b.code).join(",")}`);
    const notApproved = c.warns.filter((w) => !approvedCodes.has(w.outcome.code));
    if (notApproved.length) return consume("INVALID", `คำเตือนใหม่ ${notApproved.map((w) => w.outcome.code).join(",")}`);
    if (c.warns.some((w) => !isValidOutOfScopeReason(w.prep.reason))) return consume("INVALID", "REASON_REQUIRED");
    for (const w of c.warns) {
      w.prep.legalLevel = "WARN";
      w.prep.legalCode = w.outcome.code;
    }
    await writeChecked(tx, tenantId, actor.userId, c, requestId);
    return consume("APPLIED");
  }, TX_OPTS);
}
