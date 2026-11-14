// ─────────────────────────────────────────────────────────────
// agency/rates.ts — ระดับเอเจนซี่ · rate card · แถวราคา · ช่วงพิเศษ · ตัวโหลด + port ราคาเอเจนซี่ตัวจริง · เครื่องลองคิด (RUN TRIPS A1.3a)
//   ใบสั่ง ledger/trips-briefs/A1.3.md §6–§12 (มติผู้คุม R1–R8)
//
// 🔴 ตาราง tenant ผ่าน tenantDb เท่านั้น · ไม่ import prisma (F5 คง 52) · ไม่แตะตาราง global ของตัวตนเอเจนซี่ (F17.1)
// 🔴 trips ผ่าน facade แบบ lazy `import("@/lib/modules/trips")` เท่านั้น (มติ R2) · trips ไม่ import agency
// 🔴 ไม่มีสูตรเงิน: เลือกแถว + แปลงค่าตั้ง (rates-core.buildAgencyPricingInput) แล้วให้ตัวคิดของ T0.5 คิด
// 🔴 ทุกการเขียน card = CAS ด้วย version (คำสั่งเดียวมีเงื่อนไข · ห้ามอ่านแล้วเขียน) · audit ใน tx เดียวกัน (tx.auditLog) · ไม่มี event
// 🔴 ลำดับล็อก: agency.tier.v1 → agency.ratecard.v1 → แถว card · advisory lock สองอาร์กิวเมนต์ทุกจุด · ไม่มี DB connection ที่สองใน tx
// 🔴 ร้านไม่เห็นค่าของร้านอื่น · DTO ตรง SHOP_RATE_CARD_KEYS / SHOP_RATE_KEYS · audit ไม่มีชื่อ/ข้อความอิสระ
// ─────────────────────────────────────────────────────────────
import { z } from "zod";
import type { AgentRate, Prisma } from "@prisma/client";
import { tenantDb } from "@/lib/core/db";
import { logOps } from "@/lib/core/ops";
import { evaluate, type MembershipCtx } from "@/lib/core/rbac";
import { resolveSetting, setSettings, snapshotPolicy, type PolicySnapshot } from "@/lib/core/settings";
import type { LineRequest, SellCtx, SellResult } from "@/lib/core/sellable";
import type { AgencyPricingInput, AgencyPricingQuery } from "@/lib/modules/trips";
import { AGENCY_ID_RE, agencyFail, cleanAgencyText, isPgRetryable, isRealYmd, pgErrorCode, type AgencyErrorCode, type AgencyFail } from "./accounts-core";
import {
  AGENT_RATE_CARD_ACTIONS,
  AGENT_RATE_CARD_STATUSES,
  AGENT_RATE_LIMITS,
  AGENT_RATE_MODES,
  AGENT_TIER_CODES,
  buildAgencyPricingInput,
  dateRangesOverlap,
  isSpecialPeriodRate,
  normalizeAgentRate,
  rateCardTransition,
  rateRowsConflict,
  type AgentRateCardAction,
  type AgentRateCardStatus,
  type AgentRateMode,
  type AgentTierCode,
  type NormalizedAgentRate,
  type RateCardRow,
  type RateFacts,
  type RateRow,
  type RateTrace,
} from "./rates-core";

// ═══════════════ ชนิด ═══════════════
type Tx = Prisma.TransactionClient;
type Db = ReturnType<typeof tenantDb>;
type TripsMod = typeof import("@/lib/modules/trips");
export type RatesCtx = { tenantId: string; actorUserId: string };
/** จุดต่อของข้อสอบเท่านั้น (นาฬิกา) — ตัวห่อของ A1.3b ไม่รับ now จากผู้ใช้ */
export type RatesOpts = { now?: Date };
export type AgentTierDTO = { id: string; code: string; name: string; sortOrder: number; active: boolean };
export type ShopRateDTO = {
  id: string;
  productKind: string;
  productId: string;
  optionId: string | null;
  paxTypeId: string | null;
  mode: AgentRateMode;
  valueBp: number | null;
  valueMinor: number | null;
  currency: string;
  minSellMinor: number | null;
  markupCapBp: number | null;
  bookFrom: string | null;
  bookTo: string | null;
  travelFrom: string | null;
  travelTo: string | null;
  priority: number;
  active: boolean;
  specialPeriod: boolean;
  updatedAt: string;
};
export type ShopRateCardListItem = {
  id: string;
  ownerKind: "TIER" | "AGENT";
  tierCode: string | null;
  agentAccountId: string | null;
  name: string;
  status: AgentRateCardStatus;
  validFrom: string | null;
  validTo: string | null;
  priority: number;
  version: number;
  rateCount: number;
  createdAt: string;
  updatedAt: string;
};
export type ShopRateCardDTO = ShopRateCardListItem & { rates: ShopRateDTO[] };
export type TryAgentPriceResult = { ok: true; priced: unknown; trace: RateTrace; termSources: Record<string, string>; warnings: string[] };

// ═══════════════ ตัวช่วยทั่วไป ═══════════════
const TX_OPTS = { maxWait: 10_000, timeout: 30_000 } as const;
const RUN_TX_TRIES = 3;
const ID = z.string().regex(AGENCY_ID_RE);
const YMD = z.string().refine((s) => isRealYmd(s));
const VERSION = z.number().int().min(1).max(AGENT_RATE_LIMITS.ratesPerCard * AGENT_RATE_LIMITS.priorityMax * AGENT_RATE_LIMITS.listMax);
const PRIORITY = z.number().int().min(0).max(AGENT_RATE_LIMITS.priorityMax);
const CTX = z.object({ tenantId: ID, actorUserId: ID }).strict();
const OWNER = z.discriminatedUnion("kind", [z.object({ kind: z.literal("TIER"), tierCode: z.enum(AGENT_TIER_CODES) }).strict(), z.object({ kind: z.literal("AGENT"), agentAccountId: ID }).strict()]);
/** สถานะบัญชีที่ตั้งระดับ/ลองคิดราคาได้ (ร้านตั้งราคาก่อนอนุมัติ/คืนสิทธิ์) */
const ACCOUNT_PRICEABLE = ["ACTIVE", "SUSPENDED", "PENDING"];
/** สถานะบัญชีที่มี card ได้ไม่ได้ */
const ACCOUNT_NO_CARD = ["CLOSED", "INVITED"];
/** ชนิดหน่วยที่ขายผ่านเอเจนซี่ (กติกาเดียวกับ accounts.ts signupPolicy) */
const SELLING_UNIT_TYPES = ["TRIPS", "TICKET"] as const;
/** มติ R3 ของ A1.1: ระดับ A เทอมเครดิต 30 วัน */
const TIER_A_CREDIT_DAYS = "30";

class Abort extends Error {
  constructor(readonly fail: AgencyFail) {
    super(fail.code);
  }
}
function stop(code: AgencyErrorCode, reason?: string): never {
  throw new Abort(agencyFail(code, reason ? { reason } : {}));
}
/** ตัวอ่านของ tenantDb ใช้ร่วมกับตัวช่วยที่รับ tx (ตัวกรองร้านของ tenantDb ยังทำงาน — เปลี่ยนชนิดเท่านั้น) */
const asTx = (db: Db): Tx => db as unknown as Tx;
const isRec = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
/** อ็อบเจ็กต์ธรรมดาเท่านั้น (กันค่าที่ซ่อนใน prototype เช่น `{ __proto__: { cardId } }`) */
const isPlain = (v: unknown): v is Record<string, unknown> => isRec(v) && (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null);
function parseIn<T>(schema: z.ZodType<T>, raw: unknown): T {
  if (!isPlain(raw)) stop("VALIDATION", "BAD_INPUT");
  const p = schema.safeParse(raw);
  if (!p.success) stop("VALIDATION", "BAD_INPUT");
  return p.data;
}
const iso = (d: Date): string => d.toISOString();
const ymdOf = (d: Date | null): string | null => (d instanceof Date ? d.toISOString().slice(0, 10) : null);
const dayOf = (ymd: string | null): Date | null => (ymd === null ? null : new Date(`${ymd}T00:00:00.000Z`));
const tenantOf = (ctx: unknown): string | null => (isRec(ctx) && typeof ctx.tenantId === "string" && AGENCY_ID_RE.test(ctx.tenantId) ? ctx.tenantId : null);
const asMode = (s: string): AgentRateMode => ((AGENT_RATE_MODES as readonly string[]).includes(s) ? (s as AgentRateMode) : stop("BUSY", "UNEXPECTED"));
const asCardStatus = (s: string): AgentRateCardStatus => ((AGENT_RATE_CARD_STATUSES as readonly string[]).includes(s) ? (s as AgentRateCardStatus) : stop("BUSY", "UNEXPECTED"));

/** บันทึก ops ของ error ที่ไม่คาด: ชื่อ · รหัส · constraint · stack frame — ไม่มีข้อความ/อินพุต */
async function logUnexpected(where: string, e: unknown, tenantId: string | null): Promise<void> {
  const err = e instanceof Error ? e : null;
  const o = err ? (err as unknown as Record<string, unknown>) : {};
  const meta = isRec(o.meta) ? o.meta : {};
  const frames = err?.stack ? err.stack.split("\n").filter((l) => /^\s+at\s/.test(l)).slice(0, 8).map((l) => l.trim().slice(0, 200)) : [];
  const detail = { where, name: err ? err.name || "Error" : typeof e, code: typeof o.code === "string" ? o.code.slice(0, 16) : null, constraint: typeof meta.constraint === "string" ? meta.constraint : null, frames };
  await logOps("ERROR", "agency.rates", `ข้อผิดพลาดที่ไม่คาดคิดใน ${where}`, { tenantId: tenantId ?? undefined, detail: JSON.stringify(detail) }).catch(() => undefined);
}
/** ห่อบริการ: ไม่ throw · Abort ⇒ ผลมีชื่อ · ชน unique ⇒ แปลงตามที่ผู้เรียกกำหนด · deadlock/serialization/lock ⇒ BUSY · อื่น ⇒ ops + BUSY */
async function safely<T>(where: string, ctx: unknown, fn: () => Promise<T | AgencyFail>, onUnique?: () => AgencyFail): Promise<T | AgencyFail> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof Abort) return e.fail;
    const code = pgErrorCode(e);
    if (code === "23505" && onUnique) return onUnique();
    if (isPgRetryable(code) || code === "55P03" || code === "TX_TIMEOUT") return agencyFail("BUSY", { reason: "LOCK" });
    await logUnexpected(where, e, tenantOf(ctx));
    return agencyFail("BUSY", { reason: "UNEXPECTED" });
  }
}
/** tx ของร้าน (tenantDb) + ลองใหม่เมื่อ deadlock/serialization */
async function runTx<T>(tenantId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await tenantDb({ tenantId }).$transaction((t) => fn(t as unknown as Tx), TX_OPTS);
    } catch (e) {
      if (!(e instanceof Abort) && isPgRetryable(pgErrorCode(e)) && attempt < RUN_TX_TRIES) continue;
      throw e;
    }
  }
}
const lockTiers = (tx: Tx, tenantId: string) => tx.$queryRaw`SELECT 1 AS "locked" FROM pg_advisory_xact_lock(hashtext('agency.tier.v1'), hashtext(${tenantId}))`;
const lockOwner = (tx: Tx, tenantId: string, ownerKey: string) =>
  tx.$queryRaw`SELECT 1 AS "locked" FROM pg_advisory_xact_lock(hashtext('agency.ratecard.v1'), hashtext(${`${tenantId}:${ownerKey}`}))`;

// ═══════════════ ด่านสิทธิ์ ═══════════════
type Gate = { tenantId: string; userId: string; member: MembershipCtx; unrestricted: boolean; canRead: boolean; canEdit: boolean; db: Db };
/** สมาชิกภาพของผู้กระทำ (acceptedAt ไม่ null) อ่านเอง — ไม่มี ⇒ null (FORBIDDEN) */
async function gateOf(ctx: unknown): Promise<Gate | null> {
  const c = CTX.safeParse(ctx);
  if (!c.success) return null;
  const { tenantId, actorUserId } = c.data;
  const db = tenantDb({ tenantId });
  const mem = await db.membership.findFirst({ where: { tenantId, userId: actorUserId, acceptedAt: { not: null } }, select: { role: true, unitAccess: true, permissions: true } });
  if (!mem) return null;
  const member: MembershipCtx = {
    role: mem.role,
    unitAccess: Array.isArray(mem.unitAccess) ? mem.unitAccess.filter((x): x is string => typeof x === "string") : [],
    permissions: isRec(mem.permissions) ? mem.permissions : {},
  };
  const can = (action: string) => evaluate(member, { module: "agency", action });
  const canEdit = can("agency.rate.edit");
  return { tenantId, userId: actorUserId, member, unrestricted: member.role === "OWNER" || member.unitAccess.includes("*"), canRead: canEdit || can("agency.rate.view"), canEdit, db };
}
/** อ่าน = agency.rate.view หรือ .edit · เขียน = agency.rate.edit + ไม่จำกัดสาขา (§7 ข้อ 1) */
async function readGate(ctx: unknown): Promise<Gate> {
  const g = await gateOf(ctx);
  if (!g || !g.canRead) stop("FORBIDDEN");
  return g;
}
async function writeGate(ctx: unknown): Promise<Gate> {
  const g = await gateOf(ctx);
  if (!g || !g.canEdit || !g.unrestricted) stop("FORBIDDEN");
  return g;
}
/** มองเห็นบัญชีนี้ไหม (กติกา visible ของ A1.2 §7.1) */
const visible = (g: Gate, unitIds: readonly string[]) => g.unrestricted || unitIds.length === 0 || unitIds.some((u) => g.member.unitAccess.includes(u));
const actorAudit = (g: Gate) => ({ tenantId: g.tenantId, actorType: "USER" as const, actorId: g.userId });
async function auditInTx(tx: Tx, g: Gate, action: string, targetType: "AgentRateCard" | "AgentAccount" | "AgentTier", targetId: string, after: Record<string, unknown>): Promise<void> {
  await tx.auditLog.create({ data: { ...actorAudit(g), action, targetType, targetId, after: after as Prisma.InputJsonValue } });
}

// ═══════════════ DTO ═══════════════
const CARD_SELECT = { id: true, ownerKind: true, tierId: true, agentAccountId: true, name: true, status: true, validFrom: true, validTo: true, version: true, priority: true, createdAt: true, updatedAt: true } as const;
type CardDbRow = Prisma.AgentRateCardGetPayload<{ select: typeof CARD_SELECT }>;
type RateDbRow = AgentRate;
const AUDIT_RATE_FIELDS = ["productKind", "productId", "optionId", "paxTypeId", "mode", "valueBp", "valueMinor", "currency", "minSellMinor", "markupCapBp", "bookFrom", "bookTo", "travelFrom", "travelTo", "priority", "active"] as const;

function toRateRow(r: RateDbRow): RateRow {
  return {
    id: r.id,
    rateCardId: r.rateCardId,
    productKind: r.productKind,
    productId: r.productId,
    optionId: r.optionId,
    paxTypeId: r.paxTypeId,
    cabinTypeId: r.cabinTypeId,
    mode: asMode(r.mode),
    valueBp: r.valueBp,
    valueMinor: r.valueMinor,
    currency: r.currency,
    minSellMinor: r.minSellMinor,
    markupCapBp: r.markupCapBp,
    bookFrom: ymdOf(r.bookFrom),
    bookTo: ymdOf(r.bookTo),
    travelFrom: ymdOf(r.travelFrom),
    travelTo: ymdOf(r.travelTo),
    priority: r.priority,
    active: r.active,
  };
}
function rateDTO(r: RateDbRow): ShopRateDTO {
  const x = toRateRow(r);
  return {
    id: x.id,
    productKind: x.productKind,
    productId: x.productId,
    optionId: x.optionId,
    paxTypeId: x.paxTypeId,
    mode: x.mode,
    valueBp: x.valueBp,
    valueMinor: x.valueMinor,
    currency: x.currency,
    minSellMinor: x.minSellMinor,
    markupCapBp: x.markupCapBp,
    bookFrom: x.bookFrom,
    bookTo: x.bookTo,
    travelFrom: x.travelFrom,
    travelTo: x.travelTo,
    priority: x.priority,
    active: x.active,
    specialPeriod: isSpecialPeriodRate(x),
    updatedAt: iso(r.updatedAt),
  };
}
function cardItem(c: CardDbRow, tierCodes: ReadonlyMap<string, string>, rateCount: number): ShopRateCardListItem {
  return {
    id: c.id,
    ownerKind: c.ownerKind === "TIER" ? "TIER" : "AGENT",
    tierCode: c.tierId ? (tierCodes.get(c.tierId) ?? null) : null,
    agentAccountId: c.agentAccountId,
    name: c.name,
    status: asCardStatus(c.status),
    validFrom: ymdOf(c.validFrom),
    validTo: ymdOf(c.validTo),
    priority: c.priority,
    version: c.version,
    rateCount,
    createdAt: iso(c.createdAt),
    updatedAt: iso(c.updatedAt),
  };
}
async function tierCodesOf(db: Tx, tenantId: string): Promise<Map<string, string>> {
  const ts = await db.agentTier.findMany({ where: { tenantId }, select: { id: true, code: true } });
  return new Map(ts.map((t) => [t.id, t.code]));
}
/** DTO รายละเอียดของ card (อ่านใหม่จากฐาน/tx เดียวกัน) */
async function cardDetail(db: Tx, tenantId: string, cardId: string): Promise<ShopRateCardDTO> {
  const c = await db.agentRateCard.findFirst({ where: { id: cardId, tenantId }, select: CARD_SELECT });
  if (!c) return stop("NOT_FOUND");
  const rates = await db.agentRate.findMany({ where: { tenantId, rateCardId: c.id }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
  return { ...cardItem(c, await tierCodesOf(db, tenantId), rates.length), rates: rates.map(rateDTO) };
}
const ownerKeyOf = (c: { ownerKind: string; tierId: string | null; agentAccountId: string | null }): string => (c.ownerKind === "TIER" ? `T:${c.tierId ?? ""}` : `A:${c.agentAccountId ?? ""}`);
/** card ที่ผู้กระทำมองเห็น (ร้านอื่น/ไม่มี/บัญชีที่มองไม่เห็น ⇒ null — ผลเดียวกัน) */
async function visibleCard(g: Gate, cardId: string): Promise<CardDbRow | null> {
  const c = await g.db.agentRateCard.findFirst({ where: { id: cardId, tenantId: g.tenantId }, select: CARD_SELECT });
  if (!c) return null;
  if (c.ownerKind === "AGENT" && !g.unrestricted) {
    const a = c.agentAccountId ? await g.db.agentAccount.findFirst({ where: { id: c.agentAccountId, tenantId: g.tenantId }, select: { unitIds: true } }) : null;
    if (!a || !visible(g, a.unitIds)) return null;
  }
  return c;
}

// ═══════════════════════════════════════════════════════════════
// §6 ระดับ
// ═══════════════════════════════════════════════════════════════
const TIER_SELECT = { id: true, code: true, name: true, sortOrder: true, active: true } as const;
const tierOrder = [{ sortOrder: "asc" as const }, { code: "asc" as const }];

/** สร้างระดับ A/B/C ที่ยังไม่มี (ใต้ล็อก agency.tier.v1) · เฉพาะแถวที่เพิ่งสร้าง: เขียน A11 (+ A12 ของระดับ A) ที่ชั้น AGENT_TIER หลัง commit */
export async function ensureAgentTiers(ctx: RatesCtx, _input?: unknown, opts: RatesOpts = {}): Promise<{ ok: true; tiers: AgentTierDTO[]; created: number; payDefaultsSeeded: boolean } | AgencyFail> {
  return safely("ensureAgentTiers", ctx, async () => {
    const g = await writeGate(ctx);
    const now = opts.now ?? new Date();
    const out = await runTx(g.tenantId, async (tx) => {
      await lockTiers(tx, g.tenantId);
      const have = await tx.agentTier.findMany({ where: { tenantId: g.tenantId }, select: { code: true } });
      const created: { id: string; code: AgentTierCode }[] = [];
      for (let sortOrder = 0; sortOrder < AGENT_TIER_CODES.length; sortOrder++) {
        const code = AGENT_TIER_CODES[sortOrder];
        if (have.some((h) => h.code === code)) continue;
        const t = await tx.agentTier.create({ data: { tenantId: g.tenantId, code, name: `ระดับ ${code}`, sortOrder, active: true }, select: { id: true } });
        created.push({ id: t.id, code });
      }
      if (created.length) await auditInTx(tx, g, "agency.tier.ensure", "AgentTier", created[0].id, { count: created.length });
      const tiers = await tx.agentTier.findMany({ where: { tenantId: g.tenantId }, select: TIER_SELECT, orderBy: tierOrder });
      return { tiers, created };
    });
    const payDefaultsSeeded = out.created.length > 0 ? await seedTierPayDefaults(g, out.created, now) : false;
    return { ok: true as const, tiers: out.tiers, created: out.created.length, payDefaultsSeeded };
  });
}
/** มติ R3 ของ A1.1: A11 = A1[ระดับ].payDefault ของหน่วย TRIPS/TICKET แรก · ระดับ A เขียน A12 = "30" — เขียนไม่ได้ ⇒ false (ไม่ล้มทั้งคำสั่ง) */
async function seedTierPayDefaults(g: Gate, created: { id: string; code: AgentTierCode }[], now: Date): Promise<boolean> {
  try {
    const unit = await g.db.businessUnit.findFirst({ where: { tenantId: g.tenantId, type: { in: [...SELLING_UNIT_TYPES] }, status: "ACTIVE" }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { id: true } });
    if (!unit) return false;
    const table = (await resolveSetting({ tenantId: g.tenantId }, "agency.tier.table", { unitId: unit.id }, now)).value;
    const changes: { key: string; scope: string; scopeId: string; value: unknown }[] = [];
    for (const t of created) {
      const row = isRec(table) ? table[t.code] : undefined;
      const pay = isRec(row) ? row.payDefault : undefined;
      if (typeof pay !== "string") return false;
      changes.push({ key: "agency.money.paymentMethod", scope: "AGENT_TIER", scopeId: t.id, value: pay });
      if (t.code === "A") changes.push({ key: "agency.money.creditTermDays", scope: "AGENT_TIER", scopeId: t.id, value: TIER_A_CREDIT_DAYS });
    }
    const r = await setSettings({ ...g.member, userId: g.userId }, { tenantId: g.tenantId }, changes);
    return r.ok;
  } catch {
    return false;
  }
}

export async function listAgentTiers(ctx: RatesCtx): Promise<{ ok: true; tiers: AgentTierDTO[] } | AgencyFail> {
  return safely("listAgentTiers", ctx, async () => {
    const g = await readGate(ctx);
    const tiers = await g.db.agentTier.findMany({ where: { tenantId: g.tenantId }, select: TIER_SELECT, orderBy: tierOrder });
    return { ok: true as const, tiers };
  });
}

const SET_TIER_INPUT = z.object({ agentAccountId: ID, tierCode: z.enum(AGENT_TIER_CODES).nullable(), expectedUpdatedAt: z.string().max(40).refine((s) => !Number.isNaN(Date.parse(s))) }).strict();
/** ตั้ง/ล้างระดับของบัญชี — คำสั่งเดียวมีเงื่อนไข (updatedAt + สถานะ) · 0 แถว ⇒ อ่านใหม่: ค่าตรงแล้ว = replayed · สถานะไม่ได้ = BAD_STATE · อื่น = STALE */
export async function setAgentAccountTier(
  ctx: RatesCtx,
  input: { agentAccountId: string; tierCode: AgentTierCode | null; expectedUpdatedAt: string },
  _opts: RatesOpts = {},
): Promise<{ ok: true; agentAccountId: string; tierCode: AgentTierCode | null; replayed: boolean } | AgencyFail> {
  return safely("setAgentAccountTier", ctx, async () => {
    const g = await writeGate(ctx);
    const i = parseIn(SET_TIER_INPUT, input);
    const expected = new Date(i.expectedUpdatedAt);
    return runTx(g.tenantId, async (tx) => {
      const acc = await tx.agentAccount.findFirst({ where: { id: i.agentAccountId, tenantId: g.tenantId }, select: { id: true, tierId: true, status: true, unitIds: true } });
      if (!acc || !visible(g, acc.unitIds)) return stop("NOT_FOUND");
      if (!ACCOUNT_PRICEABLE.includes(acc.status)) return stop("BAD_STATE", "ACCOUNT_NOT_ACTIVE");
      let tierId: string | null = null;
      if (i.tierCode !== null) {
        const t = await tx.agentTier.findFirst({ where: { tenantId: g.tenantId, code: i.tierCode, active: true }, select: { id: true } });
        if (!t) return stop("VALIDATION", "TIER_NOT_FOUND");
        tierId = t.id;
      }
      const codes = await tierCodesOf(tx, g.tenantId);
      const n = await tx.agentAccount.updateMany({ where: { id: acc.id, tenantId: g.tenantId, updatedAt: expected, status: { in: ACCOUNT_PRICEABLE } }, data: { tierId } });
      if (n.count !== 1) {
        const cur = await tx.agentAccount.findFirst({ where: { id: acc.id, tenantId: g.tenantId }, select: { tierId: true, status: true } });
        if (!cur) return stop("NOT_FOUND");
        if (!ACCOUNT_PRICEABLE.includes(cur.status)) return stop("BAD_STATE", "ACCOUNT_NOT_ACTIVE");
        if (cur.tierId === tierId) return { ok: true as const, agentAccountId: acc.id, tierCode: i.tierCode, replayed: true };
        return stop("STALE");
      }
      await auditInTx(tx, g, "agency.tier.assign", "AgentAccount", acc.id, { agentAccountId: acc.id, from: acc.tierId ? (codes.get(acc.tierId) ?? null) : null, to: i.tierCode });
      return { ok: true as const, agentAccountId: acc.id, tierCode: i.tierCode, replayed: false };
    });
  });
}

// ═══════════════════════════════════════════════════════════════
// §7 rate card + แถวราคา
// ═══════════════════════════════════════════════════════════════
const LIST_INPUT = z
  .object({ owner: OWNER.optional(), status: z.enum(AGENT_RATE_CARD_STATUSES).optional(), limit: z.number().int().min(1).max(AGENT_RATE_LIMITS.listMax).optional(), cursor: ID.optional() })
  .strict();
export async function listAgentRateCards(
  ctx: RatesCtx,
  input: { owner?: { kind: "TIER"; tierCode: AgentTierCode } | { kind: "AGENT"; agentAccountId: string }; status?: AgentRateCardStatus; limit?: number; cursor?: string } = {},
  _opts: RatesOpts = {},
): Promise<{ ok: true; items: ShopRateCardListItem[]; nextCursor: string | null } | AgencyFail> {
  return safely("listAgentRateCards", ctx, async () => {
    const g = await readGate(ctx);
    const i = parseIn(LIST_INPUT, input ?? {});
    const where: Prisma.AgentRateCardWhereInput = { tenantId: g.tenantId, ...(i.status ? { status: i.status } : {}) };
    if (i.owner?.kind === "AGENT") {
      const a = await g.db.agentAccount.findFirst({ where: { id: i.owner.agentAccountId, tenantId: g.tenantId }, select: { unitIds: true } });
      if (!a || !visible(g, a.unitIds)) return stop("NOT_FOUND");
      Object.assign(where, { ownerKind: "AGENT", agentAccountId: i.owner.agentAccountId });
    } else if (i.owner?.kind === "TIER") {
      const t = await g.db.agentTier.findFirst({ where: { tenantId: g.tenantId, code: i.owner.tierCode }, select: { id: true } });
      if (!t) return { ok: true as const, items: [], nextCursor: null };
      Object.assign(where, { ownerKind: "TIER", tierId: t.id });
    } else if (!g.unrestricted) {
      const accs = await g.db.agentAccount.findMany({ where: { tenantId: g.tenantId, OR: [{ unitIds: { isEmpty: true } }, { unitIds: { hasSome: g.member.unitAccess } }] }, select: { id: true } });
      Object.assign(where, { OR: [{ ownerKind: "TIER" }, { ownerKind: "AGENT", agentAccountId: { in: accs.map((a) => a.id) } }] });
    }
    const take = i.limit ?? AGENT_RATE_LIMITS.listMax;
    const rows = await g.db.agentRateCard.findMany({ where, select: CARD_SELECT, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: take + 1, ...(i.cursor ? { cursor: { id: i.cursor }, skip: 1 } : {}) });
    const page = rows.slice(0, take);
    const ids = page.map((c) => c.id);
    const counts = ids.length ? await g.db.agentRate.groupBy({ by: ["rateCardId"], where: { tenantId: g.tenantId, rateCardId: { in: ids } }, _count: { _all: true } }) : [];
    const countOf = new Map(counts.map((c) => [c.rateCardId, c._count._all]));
    const codes = await tierCodesOf(asTx(g.db), g.tenantId);
    return { ok: true as const, items: page.map((c) => cardItem(c, codes, countOf.get(c.id) ?? 0)), nextCursor: rows.length > take ? (page[page.length - 1]?.id ?? null) : null };
  });
}

const GET_INPUT = z.object({ cardId: ID }).strict();
export async function getAgentRateCard(ctx: RatesCtx, input: { cardId: string }, _opts: RatesOpts = {}): Promise<{ ok: true; card: ShopRateCardDTO } | AgencyFail> {
  return safely("getAgentRateCard", ctx, async () => {
    const g = await readGate(ctx);
    const i = parseIn(GET_INPUT, input);
    const c = await visibleCard(g, i.cardId);
    if (!c) return stop("NOT_FOUND");
    return { ok: true as const, card: await cardDetail(asTx(g.db), g.tenantId, c.id) };
  });
}

const CREATE_INPUT = z
  .object({ owner: OWNER, name: z.string().max(AGENT_RATE_LIMITS.cardNameMax * 4), validFrom: YMD.nullable().optional(), validTo: YMD.nullable().optional(), priority: PRIORITY.optional(), copyFromCardId: ID.optional() })
  .strict();
/** card ใหม่ = DRAFT · version 1 · copyFromCardId = คัดลอกแถวราคาทั้งหมดของ card ในร้านเดียวกัน · เพดาน cardsPerOwner ตรวจใต้ล็อกของเจ้าของ */
export async function createAgentRateCard(
  ctx: RatesCtx,
  input: { owner: { kind: "TIER"; tierCode: AgentTierCode } | { kind: "AGENT"; agentAccountId: string }; name: string; validFrom?: string | null; validTo?: string | null; priority?: number; copyFromCardId?: string },
  _opts: RatesOpts = {},
): Promise<{ ok: true; card: ShopRateCardDTO } | AgencyFail> {
  return safely("createAgentRateCard", ctx, async () => {
    const g = await writeGate(ctx);
    const i = parseIn(CREATE_INPUT, input);
    const name = cleanAgencyText(i.name, AGENT_RATE_LIMITS.cardNameMax);
    if (name === null) return stop("VALIDATION", "BAD_INPUT");
    const validFrom = i.validFrom ?? null;
    const validTo = i.validTo ?? null;
    if (validFrom !== null && validTo !== null && validTo < validFrom) return stop("VALIDATION", "BAD_RANGE");
    let owner: { ownerKind: "TIER" | "AGENT"; tierId: string | null; agentAccountId: string | null; tierCode: string | null };
    if (i.owner.kind === "TIER") {
      const t = await g.db.agentTier.findFirst({ where: { tenantId: g.tenantId, code: i.owner.tierCode, active: true }, select: { id: true } });
      if (!t) return stop("VALIDATION", "TIER_NOT_FOUND");
      owner = { ownerKind: "TIER", tierId: t.id, agentAccountId: null, tierCode: i.owner.tierCode };
    } else {
      const a = await g.db.agentAccount.findFirst({ where: { id: i.owner.agentAccountId, tenantId: g.tenantId }, select: { id: true, status: true, unitIds: true } });
      if (!a || !visible(g, a.unitIds)) return stop("NOT_FOUND");
      if (ACCOUNT_NO_CARD.includes(a.status)) return stop("VALIDATION", "ACCOUNT_NOT_ACTIVE");
      owner = { ownerKind: "AGENT", tierId: null, agentAccountId: a.id, tierCode: null };
    }
    let source: RateDbRow[] = [];
    if (i.copyFromCardId !== undefined) {
      const src = await visibleCard(g, i.copyFromCardId);
      if (!src) return stop("NOT_FOUND");
      source = await g.db.agentRate.findMany({ where: { tenantId: g.tenantId, rateCardId: src.id }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
    }
    const cardId = await runTx(g.tenantId, async (tx) => {
      await lockOwner(tx, g.tenantId, ownerKeyOf(owner));
      const open = await tx.agentRateCard.count({ where: { tenantId: g.tenantId, ownerKind: owner.ownerKind, tierId: owner.tierId, agentAccountId: owner.agentAccountId, status: { not: "ARCHIVED" } } });
      if (open >= AGENT_RATE_LIMITS.cardsPerOwner) return stop("VALIDATION", "LIMIT_REACHED");
      const c = await tx.agentRateCard.create({
        data: { tenantId: g.tenantId, ownerKind: owner.ownerKind, tierId: owner.tierId, agentAccountId: owner.agentAccountId, name, status: "DRAFT", version: 1, priority: i.priority ?? 0, validFrom: dayOf(validFrom), validTo: dayOf(validTo) },
        select: { id: true },
      });
      if (source.length) {
        await tx.agentRate.createMany({
          data: source.map((r) => ({
            tenantId: g.tenantId, rateCardId: c.id, productKind: r.productKind, productId: r.productId, optionId: r.optionId, paxTypeId: r.paxTypeId, cabinTypeId: r.cabinTypeId, mode: r.mode, valueBp: r.valueBp, valueMinor: r.valueMinor,
            currency: r.currency, minSellMinor: r.minSellMinor, markupCapBp: r.markupCapBp, bookFrom: r.bookFrom, bookTo: r.bookTo, travelFrom: r.travelFrom, travelTo: r.travelTo, priority: r.priority, active: r.active,
          })),
        });
      }
      await auditInTx(tx, g, "agency.rate_card.create", "AgentRateCard", c.id, {
        cardId: c.id, version: 1, ownerKind: owner.ownerKind, tierCode: owner.tierCode, agentAccountId: owner.agentAccountId, ...(i.copyFromCardId !== undefined ? { copiedFrom: i.copyFromCardId, count: source.length } : {}),
      });
      return c.id;
    });
    return { ok: true as const, card: await cardDetail(asTx(g.db), g.tenantId, cardId) };
  });
}

/** CAS ของ card: version + 1 ด้วยคำสั่งเดียวมีเงื่อนไข · 0 แถว ⇒ อ่านใหม่: ไม่มี = NOT_FOUND · ARCHIVED = BAD_STATE CARD_ARCHIVED · อื่น = STALE */
async function casCard(tx: Tx, tenantId: string, cardId: string, expectedVersion: number): Promise<CardDbRow> {
  const n = await tx.agentRateCard.updateMany({ where: { id: cardId, tenantId, version: expectedVersion, status: { not: "ARCHIVED" } }, data: { version: { increment: 1 } } });
  if (n.count !== 1) {
    const cur = await tx.agentRateCard.findFirst({ where: { id: cardId, tenantId }, select: { status: true } });
    if (!cur) return stop("NOT_FOUND");
    if (cur.status === "ARCHIVED") return stop("BAD_STATE", "CARD_ARCHIVED");
    return stop("STALE");
  }
  const c = await tx.agentRateCard.findFirst({ where: { id: cardId, tenantId }, select: CARD_SELECT });
  return c ?? stop("NOT_FOUND");
}
/** card สองใบของเจ้าของเดียวกันที่ ACTIVE ทั้งคู่ · priority เท่ากัน · ช่วงมีผลซ้อน ⇒ CARD_OVERLAP (เรียกใต้ล็อกของเจ้าของ) */
async function assertNoCardOverlap(tx: Tx, tenantId: string, c: CardDbRow, validFrom: string | null, validTo: string | null, priority: number): Promise<void> {
  const others = await tx.agentRateCard.findMany({
    where: { tenantId, status: "ACTIVE", id: { not: c.id }, ownerKind: c.ownerKind, tierId: c.tierId, agentAccountId: c.agentAccountId, priority },
    select: { validFrom: true, validTo: true },
  });
  if (others.some((o) => dateRangesOverlap(validFrom, validTo, ymdOf(o.validFrom), ymdOf(o.validTo)))) stop("VALIDATION", "CARD_OVERLAP");
}

const UPDATE_INPUT = z
  .object({
    cardId: ID,
    expectedVersion: VERSION,
    patch: z
      .object({ name: z.string().max(AGENT_RATE_LIMITS.cardNameMax * 4).optional(), validFrom: YMD.nullable().optional(), validTo: YMD.nullable().optional(), priority: PRIORITY.optional() })
      .strict()
      .refine((p) => Object.keys(p).length > 0),
  })
  .strict();
export async function updateAgentRateCard(
  ctx: RatesCtx,
  input: { cardId: string; expectedVersion: number; patch: { name?: string; validFrom?: string | null; validTo?: string | null; priority?: number } },
  _opts: RatesOpts = {},
): Promise<{ ok: true; card: ShopRateCardDTO } | AgencyFail> {
  return safely("updateAgentRateCard", ctx, async () => {
    const g = await writeGate(ctx);
    const i = parseIn(UPDATE_INPUT, input);
    const p = i.patch;
    const name = p.name === undefined ? undefined : cleanAgencyText(p.name, AGENT_RATE_LIMITS.cardNameMax);
    if (name === null) return stop("VALIDATION", "BAD_INPUT");
    const pre = await g.db.agentRateCard.findFirst({ where: { id: i.cardId, tenantId: g.tenantId }, select: CARD_SELECT });
    if (!pre) return stop("NOT_FOUND");
    const touchesRange = p.validFrom !== undefined || p.validTo !== undefined || p.priority !== undefined;
    await runTx(g.tenantId, async (tx) => {
      if (touchesRange) await lockOwner(tx, g.tenantId, ownerKeyOf(pre));
      const c = await casCard(tx, g.tenantId, i.cardId, i.expectedVersion);
      const before = { validFrom: ymdOf(c.validFrom), validTo: ymdOf(c.validTo), priority: c.priority };
      const after = { validFrom: p.validFrom !== undefined ? p.validFrom : before.validFrom, validTo: p.validTo !== undefined ? p.validTo : before.validTo, priority: p.priority ?? before.priority };
      if (after.validFrom !== null && after.validTo !== null && after.validTo < after.validFrom) stop("VALIDATION", "BAD_RANGE");
      if (touchesRange && c.status === "ACTIVE") await assertNoCardOverlap(tx, g.tenantId, c, after.validFrom, after.validTo, after.priority);
      await tx.agentRateCard.update({ where: { id: c.id }, data: { ...(name !== undefined ? { name } : {}), validFrom: dayOf(after.validFrom), validTo: dayOf(after.validTo), priority: after.priority } });
      const fields = [...(name !== undefined && name !== c.name ? ["name"] : []), ...(["validFrom", "validTo", "priority"] as const).filter((k) => before[k] !== after[k])];
      const b: Record<string, unknown> = {};
      const a: Record<string, unknown> = {};
      for (const k of ["validFrom", "validTo", "priority"] as const) if (before[k] !== after[k]) { b[k] = before[k]; a[k] = after[k]; }
      await auditInTx(tx, g, "agency.rate_card.update", "AgentRateCard", c.id, { cardId: c.id, version: c.version, fields, before: b, after: a });
    });
    return { ok: true as const, card: await cardDetail(asTx(g.db), g.tenantId, i.cardId) };
  });
}

const STATUS_INPUT = z.object({ cardId: ID, expectedVersion: VERSION, action: z.enum(AGENT_RATE_CARD_ACTIONS) }).strict();
/** ACTIVATE (DRAFT→ACTIVE · ตรวจ CARD_OVERLAP ใต้ล็อกของเจ้าของ) · ARCHIVE (DRAFT/ACTIVE→ARCHIVED) · ปลายทางตรงแล้ว ⇒ replayed (ไม่มี audit · version ไม่เพิ่ม) */
export async function setAgentRateCardStatus(
  ctx: RatesCtx,
  input: { cardId: string; expectedVersion: number; action: AgentRateCardAction },
  _opts: RatesOpts = {},
): Promise<{ ok: true; card: ShopRateCardDTO; replayed: boolean } | AgencyFail> {
  return safely("setAgentRateCardStatus", ctx, async () => {
    const g = await writeGate(ctx);
    const i = parseIn(STATUS_INPUT, input);
    const target: AgentRateCardStatus = i.action === "ACTIVATE" ? "ACTIVE" : "ARCHIVED";
    const fromStates = AGENT_RATE_CARD_STATUSES.filter((s) => rateCardTransition(s, i.action) === target);
    const pre = await g.db.agentRateCard.findFirst({ where: { id: i.cardId, tenantId: g.tenantId }, select: CARD_SELECT });
    if (!pre) return stop("NOT_FOUND");
    const replayed = await runTx(g.tenantId, async (tx) => {
      if (i.action === "ACTIVATE") await lockOwner(tx, g.tenantId, ownerKeyOf(pre));
      const n = await tx.agentRateCard.updateMany({ where: { id: i.cardId, tenantId: g.tenantId, version: i.expectedVersion, status: { in: fromStates } }, data: { version: { increment: 1 }, status: target } });
      if (n.count !== 1) {
        const cur = await tx.agentRateCard.findFirst({ where: { id: i.cardId, tenantId: g.tenantId }, select: { status: true } });
        if (!cur) return stop("NOT_FOUND");
        if (cur.status === target) return true;
        if (cur.status === "ARCHIVED") return stop("BAD_STATE", "CARD_ARCHIVED");
        if (rateCardTransition(asCardStatus(cur.status), i.action) === null) return stop("BAD_STATE", "STATE_CONFLICT");
        return stop("STALE");
      }
      const c = await tx.agentRateCard.findFirst({ where: { id: i.cardId, tenantId: g.tenantId }, select: CARD_SELECT });
      if (!c) return stop("NOT_FOUND");
      if (i.action === "ACTIVATE") await assertNoCardOverlap(tx, g.tenantId, c, ymdOf(c.validFrom), ymdOf(c.validTo), c.priority);
      await auditInTx(tx, g, i.action === "ACTIVATE" ? "agency.rate_card.activate" : "agency.rate_card.archive", "AgentRateCard", c.id, { cardId: c.id, version: c.version, from: pre.status, to: target });
      return false;
    });
    return { ok: true as const, card: await cardDetail(asTx(g.db), g.tenantId, i.cardId), replayed };
  });
}

// ── ตรวจแถวราคากับฐาน (§4.1 บรรทัดสุดท้าย · §12 ข้อ 2) ──
type ProductInfo = { id: string; unitId: string; currency: string } | null;
/** สินค้า TripProduct ของร้านนี้ที่ไม่ ARCHIVED (หน่วยใดก็ได้ของร้าน) — ร้านอื่น/ไม่มี ⇒ null */
async function productOf(db: Db, tenantId: string, productId: string): Promise<ProductInfo> {
  const rows = await db.$queryRaw<{ id: string; unitId: string; currency: string }[]>`
    SELECT id, "unitId", currency FROM "TripProduct" WHERE id = ${productId} AND "tenantId" = ${tenantId} AND status <> 'ARCHIVED' LIMIT 1`;
  return rows[0] ?? null;
}
/** สินค้า/ตัวเลือก/ประเภทคนเป็นของสินค้านั้นในร้านนี้ + สกุลตรงสินค้า ⇒ null · ไม่งั้นเหตุ */
async function checkRateAgainstDb(db: Db, tenantId: string, r: NormalizedAgentRate, cache: Map<string, ProductInfo>): Promise<"PRODUCT_NOT_FOUND" | "CURRENCY_MISMATCH" | null> {
  let p = cache.get(r.productId);
  if (p === undefined) {
    p = await productOf(db, tenantId, r.productId);
    cache.set(r.productId, p);
  }
  if (!p) return "PRODUCT_NOT_FOUND";
  const udb = tenantDb({ tenantId, unitId: p.unitId });
  if (r.optionId !== null && !(await udb.tripOption.findFirst({ where: { id: r.optionId, tenantId, unitId: p.unitId, productId: p.id }, select: { id: true } }))) return "PRODUCT_NOT_FOUND";
  if (r.paxTypeId !== null && !(await udb.tripPaxType.findFirst({ where: { id: r.paxTypeId, tenantId, unitId: p.unitId, productId: p.id }, select: { id: true } }))) return "PRODUCT_NOT_FOUND";
  if (r.currency !== p.currency) return "CURRENCY_MISMATCH";
  return null;
}
/** อินพุตแถวราคา: แยก id (ถ้ามี) ออก แล้วตรวจรูปด้วย normalizeAgentRate */
function normalizeRateInput(raw: unknown, allowId: boolean): { id: string | null; rate: NormalizedAgentRate } {
  if (!isPlain(raw)) return stop("VALIDATION", "BAD_INPUT");
  const { id, ...rest } = raw;
  if (id !== undefined && (!allowId || typeof id !== "string" || !AGENCY_ID_RE.test(id))) return stop("VALIDATION", "BAD_INPUT");
  const n = normalizeAgentRate(rest);
  if (!n.ok) return stop("VALIDATION", n.reason);
  return { id: typeof id === "string" ? id : null, rate: n.rate };
}
const rateData = (r: NormalizedAgentRate) => ({
  productKind: r.productKind, productId: r.productId, optionId: r.optionId, paxTypeId: r.paxTypeId, cabinTypeId: r.cabinTypeId, mode: r.mode, valueBp: r.valueBp, valueMinor: r.valueMinor, currency: r.currency,
  minSellMinor: r.minSellMinor, markupCapBp: r.markupCapBp, bookFrom: dayOf(r.bookFrom), bookTo: dayOf(r.bookTo), travelFrom: dayOf(r.travelFrom), travelTo: dayOf(r.travelTo), priority: r.priority, active: r.active,
});
const auditView = (r: NormalizedAgentRate | RateRow): Record<string, unknown> => Object.fromEntries(AUDIT_RATE_FIELDS.map((k) => [k, r[k]]));
const sameDims = (a: Pick<RateRow, "productKind" | "productId" | "optionId" | "paxTypeId" | "cabinTypeId" | "bookFrom" | "travelFrom">, b: typeof a) =>
  a.productKind === b.productKind && a.productId === b.productId && a.optionId === b.optionId && a.paxTypeId === b.paxTypeId && a.cabinTypeId === b.cabinTypeId && a.bookFrom === b.bookFrom && a.travelFrom === b.travelFrom;
function assertNoRateOverlap(candidate: RateRow, all: readonly RateRow[]): void {
  if (all.some((o) => o.id !== candidate.id && rateRowsConflict(candidate, o))) stop("VALIDATION", "RATE_OVERLAP");
}

const UPSERT_INPUT = z.object({ cardId: ID, expectedVersion: VERSION, rate: z.unknown() }).strict();
/** มี id ⇒ แก้แถวนั้น · ไม่มี id ⇒ คีย์มิติ (NND) ตรงแถวเดิม = แก้ ไม่งั้นสร้าง · ตัวกันช่วงซ้อน + เพดานแถว หลัง CAS ใน tx เดียวกัน · ไม่มีการลบ */
export async function upsertAgentRate(
  ctx: RatesCtx,
  input: { cardId: string; expectedVersion: number; rate: Record<string, unknown> },
  _opts: RatesOpts = {},
): Promise<{ ok: true; card: { id: string; version: number }; rate: ShopRateDTO } | AgencyFail> {
  return safely(
    "upsertAgentRate",
    ctx,
    async () => {
      const g = await writeGate(ctx);
      const i = parseIn(UPSERT_INPUT, input);
      const { id: rateId, rate } = normalizeRateInput(i.rate, true);
      const bad = await checkRateAgainstDb(g.db, g.tenantId, rate, new Map());
      if (bad) return stop("VALIDATION", bad);
      return runTx(g.tenantId, async (tx) => {
        const c = await casCard(tx, g.tenantId, i.cardId, i.expectedVersion);
        const rows = await tx.agentRate.findMany({ where: { tenantId: g.tenantId, rateCardId: c.id } });
        const all = rows.map(toRateRow);
        const cand: RateRow = { ...rate, id: "", rateCardId: c.id };
        const prev = rateId !== null ? all.find((r) => r.id === rateId) : all.find((r) => sameDims(r, cand));
        if (rateId !== null && !prev) return stop("NOT_FOUND");
        if (!prev && rows.length >= AGENT_RATE_LIMITS.ratesPerCard) return stop("VALIDATION", "LIMIT_REACHED");
        cand.id = prev?.id ?? "";
        assertNoRateOverlap(cand, all);
        const saved = prev
          ? await tx.agentRate.update({ where: { id: prev.id }, data: rateData(rate) })
          : await tx.agentRate.create({ data: { tenantId: g.tenantId, rateCardId: c.id, ...rateData(rate) } });
        const before = prev ? auditView(prev) : {};
        const after = auditView(rate);
        const fields = AUDIT_RATE_FIELDS.filter((k) => before[k] !== after[k]);
        await auditInTx(tx, g, "agency.rate.upsert", "AgentRateCard", c.id, {
          cardId: c.id, rateId: saved.id, version: c.version, fields, before: Object.fromEntries(fields.filter((k) => k in before).map((k) => [k, before[k]])), after: Object.fromEntries(fields.map((k) => [k, after[k]])),
        });
        return { ok: true as const, card: { id: c.id, version: c.version }, rate: rateDTO(saved) };
      });
    },
    () => agencyFail("VALIDATION", { reason: "RATE_OVERLAP" }),
  );
}

const ACTIVE_INPUT = z.object({ cardId: ID, expectedVersion: VERSION, rateId: ID, active: z.boolean() }).strict();
/** ปิด/เปิดแถวราคา (ไม่มีการลบ) · เปิดกลับตอนมีแถวซ้อน ⇒ RATE_OVERLAP */
export async function setAgentRateActive(
  ctx: RatesCtx,
  input: { cardId: string; expectedVersion: number; rateId: string; active: boolean },
  _opts: RatesOpts = {},
): Promise<{ ok: true; card: { id: string; version: number }; rate: ShopRateDTO } | AgencyFail> {
  return safely("setAgentRateActive", ctx, async () => {
    const g = await writeGate(ctx);
    const i = parseIn(ACTIVE_INPUT, input);
    return runTx(g.tenantId, async (tx) => {
      const c = await casCard(tx, g.tenantId, i.cardId, i.expectedVersion);
      const rows = await tx.agentRate.findMany({ where: { tenantId: g.tenantId, rateCardId: c.id } });
      const all = rows.map(toRateRow);
      const prev = all.find((r) => r.id === i.rateId);
      if (!prev) return stop("NOT_FOUND");
      if (i.active) assertNoRateOverlap({ ...prev, active: true }, all);
      const saved = await tx.agentRate.update({ where: { id: prev.id }, data: { active: i.active } });
      await auditInTx(tx, g, i.active ? "agency.rate.reactivate" : "agency.rate.deactivate", "AgentRateCard", c.id, {
        cardId: c.id, rateId: prev.id, version: c.version, fields: ["active"], before: { active: prev.active }, after: { active: i.active },
      });
      return { ok: true as const, card: { id: c.id, version: c.version }, rate: rateDTO(saved) };
    });
  });
}

// ═══════════════════════════════════════════════════════════════
// §8 ตัวโหลดข้อเท็จจริง + port ตัวจริง
// ═══════════════════════════════════════════════════════════════
const TZ_FALLBACK = "Asia/Bangkok"; // กติกาเดียวกับ trips/pricing.ts (TRIP_DEFAULT_TZ)
function localYmd(at: Date, tz: string): string | null {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
  } catch {
    return null;
  }
}
type Loaded = { facts: RateFacts; snapshot: PolicySnapshot; status: string; unitIds: string[] };
/**
 * ข้อเท็จจริงของการคิดราคาเอเจนซี่หนึ่งครั้ง (อ่านอย่างเดียว) — ตัวเดียวกันทั้ง port และเครื่องลองคิด
 * อ่านเฉพาะ: บัญชี (id tierId payeeType vatRegistered unitIds status) · ระดับ · card + แถวของระดับของบัญชีนี้และของบัญชีนี้เท่านั้น ·
 * เขตเวลาของหน่วย · สินค้า/ประเภทคน/รอบของหน่วยนั้น · snapshot "agency.booking" · อัตรา VAT
 * ไม่พบ ⇒ null · ค่าตั้งผิดรูป ⇒ "SETTINGS_INVALID"
 */
async function loadFacts(
  q: { tenantId: string; unitId: string; agentAccountId: string; productId: string; departureId: string; travelDate: string | null; at: Date },
  admit: (acc: { status: string; unitIds: string[] }) => boolean = () => true,
): Promise<Loaded | "SETTINGS_INVALID" | null> {
  const { tenantId, unitId } = q;
  const db = tenantDb({ tenantId });
  const acc = await db.agentAccount.findFirst({ where: { id: q.agentAccountId, tenantId }, select: { id: true, tierId: true, payeeType: true, vatRegistered: true, unitIds: true, status: true } });
  if (!acc || !admit(acc)) return null;
  const unit = await db.businessUnit.findFirst({ where: { id: unitId, tenantId, status: "ACTIVE", type: "TRIPS" }, select: { settings: true } });
  if (!unit) return null;
  const udb = tenantDb({ tenantId, unitId });
  const product = await udb.tripProduct.findFirst({ where: { id: q.productId, tenantId, unitId }, select: { id: true, productType: true, currency: true, status: true } });
  if (!product || product.status === "ARCHIVED") return null;
  const dep = await udb.tripDeparture.findFirst({ where: { id: q.departureId, tenantId, unitId, productId: product.id }, select: { id: true, localDate: true, optionId: true } });
  if (!dep) return null;
  const tier = acc.tierId ? await db.agentTier.findFirst({ where: { id: acc.tierId, tenantId }, select: { id: true, code: true } }) : null;
  const tierId = tier?.id ?? null;
  const tierCode = tier && (AGENT_TIER_CODES as readonly string[]).includes(tier.code) ? (tier.code as AgentTierCode) : null;
  const tzRaw = isRec(unit.settings) ? unit.settings.timezone : undefined;
  const tz = typeof tzRaw === "string" && tzRaw.trim() ? tzRaw.trim() : TZ_FALLBACK;
  const bookYmd = localYmd(q.at, tz);
  if (bookYmd === null) return "SETTINGS_INVALID";
  const refs = { unitId, productId: product.id, departureId: dep.id, agentId: acc.id, ...(tierId ? { agentTierId: tierId } : {}) };
  const ownerOr: Prisma.AgentRateCardWhereInput[] = [{ ownerKind: "AGENT", agentAccountId: acc.id }, ...(tierId ? [{ ownerKind: "TIER", tierId }] : [])];
  const [paxTypes, cards, vat] = await Promise.all([
    udb.tripPaxType.findMany({ where: { tenantId, unitId, productId: product.id }, select: { id: true, code: true }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }] }),
    db.agentRateCard.findMany({ where: { tenantId, status: "ACTIVE", OR: ownerOr }, select: CARD_SELECT }),
    resolveSetting({ tenantId }, "trips.tax.vatRate", { unitId, productId: product.id }, q.at),
  ]);
  const rates = cards.length ? await db.agentRate.findMany({ where: { tenantId, rateCardId: { in: cards.map((c) => c.id) }, productKind: "TRIP", productId: product.id } }) : [];
  let snapshot: PolicySnapshot;
  try {
    snapshot = await snapshotPolicy({ tenantId }, "agency.booking", refs, q.at);
  } catch {
    return "SETTINGS_INVALID";
  }
  const vatRateBp = isRec(vat.value) ? vat.value.rateBp : undefined;
  if (typeof vatRateBp !== "number") return "SETTINGS_INVALID";
  const byCard = new Map<string, RateRow[]>();
  for (const r of rates) byCard.set(r.rateCardId, [...(byCard.get(r.rateCardId) ?? []), toRateRow(r)]);
  const facts: RateFacts = {
    account: { id: acc.id, tierId, tierCode, payeeType: acc.payeeType, vatRegistered: acc.vatRegistered },
    product: { id: product.id, productType: product.productType === "LIVEABOARD" ? "LIVEABOARD" : product.productType === "ATTRACTION" ? "ATTRACTION" : "TOUR", optionId: dep.optionId, paxTypes },
    currency: product.currency,
    bookYmd,
    travelYmd: q.travelDate ?? ymdOf(dep.localDate) ?? "",
    cards: cards.map(
      (c): RateCardRow => ({
        id: c.id, ownerKind: c.ownerKind === "TIER" ? "TIER" : "AGENT", tierId: c.tierId, agentAccountId: c.agentAccountId, status: c.status, validFrom: ymdOf(c.validFrom), validTo: ymdOf(c.validTo), version: c.version, priority: c.priority, rates: byCard.get(c.id) ?? [],
      }),
    ),
    policy: { values: snapshot.values, sources: snapshot.sources },
    vatRateBp,
  };
  return { facts, snapshot, status: acc.status, unitIds: acc.unitIds };
}

/** เครื่องลองคิดฝากผลชั้นเอเจนซี่ไว้กับ ctx ของตัวเอง (อ็อบเจ็กต์ที่สร้างในไฟล์นี้เท่านั้น — ผู้เรียกภายนอกปลอมไม่ได้) */
const TRY_OVERRIDES = new WeakMap<object, AgencyPricingInput>();
const PORT_CTX = z.object({ tenantId: ID, unitId: ID }).passthrough();
/**
 * port ตัวจริงของชั้นเอเจนซี่ (§8) — null เมื่อ: ไม่มี agentAccountId (ลิงก์ = A1.8) · บัญชีไม่อยู่ในร้านนี้ · ไม่ ACTIVE · unitIds ไม่ว่างและไม่มีหน่วยนี้ ·
 * สินค้า/รอบไม่ใช่ของหน่วยนี้ — ผลเดียวกันทุกกรณี · ค่าตั้งผิดรูป ⇒ throw (ไม่คืน null) · อ่านอย่างเดียว
 */
export const agencyPricingPort: { load(ctx: SellCtx, q: AgencyPricingQuery): Promise<AgencyPricingInput | null> } = {
  async load(ctx, q) {
    const over = TRY_OVERRIDES.get(ctx);
    if (over) return over;
    const c = PORT_CTX.safeParse(ctx);
    if (!c.success || !q.agentAccountId || !AGENCY_ID_RE.test(q.agentAccountId)) return null;
    const unitId = c.data.unitId;
    // ด่านสถานะ/หน่วยก่อนอ่านค่าตั้ง — บัญชีที่ไม่ควรเปิดได้ null เสมอ (ไม่ throw แม้ค่าตั้งผิดรูป)
    const admit = (a: { status: string; unitIds: string[] }) => a.status === "ACTIVE" && (a.unitIds.length === 0 || a.unitIds.includes(unitId));
    const loaded = await loadFacts({ tenantId: c.data.tenantId, unitId, agentAccountId: q.agentAccountId, productId: q.productId, departureId: q.departureId, travelDate: q.travelDate, at: q.at }, admit);
    if (loaded === null) return null;
    if (loaded === "SETTINGS_INVALID") throw new Error("AGENCY_PRICING_SETTINGS_INVALID");
    const built = buildAgencyPricingInput(loaded.facts);
    if (!built.ok) throw new Error("AGENCY_PRICING_SETTINGS_INVALID");
    return { ...built.input, policySnapshot: loaded.snapshot };
  },
};

let portInstalled = false;
/** ลงทะเบียน port เข้า trips (ครั้งเดียวต่อโพรเซส · เรียกซ้ำได้) — จุดติดตั้ง platform/sellables.ts + เครื่องลองคิด */
export async function installAgencyPricingPort(): Promise<void> {
  if (portInstalled) return;
  const trips: TripsMod = await import("@/lib/modules/trips");
  trips.registerAgencyPricingPort(agencyPricingPort);
  portInstalled = true;
}

// ═══════════════════════════════════════════════════════════════
// §9 เครื่องลองคิด
// ═══════════════════════════════════════════════════════════════
const QTY = z.number().int().min(0).max(100_000);
const TRY_INPUT = z
  .object({
    agentAccountId: ID,
    unitId: ID,
    productId: ID,
    slotId: ID,
    pax: z.array(z.object({ paxTypeId: ID, qty: QTY }).strict()).min(1).max(AGENT_RATE_LIMITS.tryPaxLines),
    extras: z.array(z.object({ extraId: ID, qty: QTY }).strict()).max(AGENT_RATE_LIMITS.tryPaxLines).optional(),
    at: z.string().max(40).refine((s) => !Number.isNaN(Date.parse(s))).optional(),
    agentDiscountSatang: z.number().int().min(0).max(2_147_483_647).optional(),
    actualSaleSatang: z.number().int().min(0).max(2_147_483_647).optional(),
    draft: z
      .object({
        ownerKind: z.enum(["TIER", "AGENT"]),
        replacesCardId: ID.optional(),
        validFrom: YMD.nullable().optional(),
        validTo: YMD.nullable().optional(),
        priority: PRIORITY.optional(),
        rates: z.array(z.unknown()).max(AGENT_RATE_LIMITS.draftRatesMax),
      })
      .strict()
      .optional(),
  })
  .strict();
type TripsFail = Extract<SellResult<never>, { ok: false }>;
/** ผลล้มของ trips ⇒ AgencyFail: NOT_FOUND ตรงตัว · อื่น ⇒ VALIDATION + reason = รหัส/เหตุของ trips ตรงตัว */
function fromTrips(f: TripsFail): AgencyFail {
  if (f.code === "NOT_FOUND") return agencyFail("NOT_FOUND");
  if (f.code === "FORBIDDEN") return agencyFail("FORBIDDEN");
  const why = f.details && typeof f.details.reason === "string" ? f.details.reason : null;
  return agencyFail("VALIDATION", { reason: f.code === "VALIDATION" && why ? why : f.code });
}
/**
 * ลองคิดราคาก่อนบันทึก (ภาพ 10 :59–68) — ไม่เขียนฐาน · เส้นทางเดียวกับการคิดจริง: loadPricingInput → (แทนชั้นเอเจนซี่ผ่าน port) → resolveTripPrice ของ trips
 * ไม่มีร่าง + บัญชี ACTIVE + ไม่มี actualSaleSatang ⇒ priced เท่ากับ quoteTripLine ของผู้กระทำ AGENT ที่เวลาเดียวกัน (ยกเว้น cancelMinimumLadder)
 */
export async function tryAgentPrice(
  ctx: RatesCtx,
  input: {
    agentAccountId: string;
    unitId: string;
    productId: string;
    slotId: string;
    pax: { paxTypeId: string; qty: number }[];
    extras?: { extraId: string; qty: number }[];
    at?: string;
    agentDiscountSatang?: number;
    actualSaleSatang?: number;
    draft?: { ownerKind: "TIER" | "AGENT"; replacesCardId?: string; validFrom?: string | null; validTo?: string | null; priority?: number; rates: unknown[] };
  },
  opts: RatesOpts = {},
): Promise<TryAgentPriceResult | AgencyFail> {
  return safely("tryAgentPrice", ctx, async () => {
    const g = await readGate(ctx);
    const i = parseIn(TRY_INPUT, input);
    const at = i.at !== undefined ? new Date(i.at) : (opts.now ?? new Date());
    if (!g.unrestricted && !g.member.unitAccess.includes(i.unitId)) return stop("NOT_FOUND");
    const acc = await g.db.agentAccount.findFirst({ where: { id: i.agentAccountId, tenantId: g.tenantId }, select: { status: true, unitIds: true } });
    if (!acc || !visible(g, acc.unitIds)) return stop("NOT_FOUND");
    if (!ACCOUNT_PRICEABLE.includes(acc.status)) return stop("VALIDATION", "ACCOUNT_NOT_ACTIVE");
    // ร่าง: ตรวจเหมือนตอนบันทึก (รูป · สินค้า/ตัวเลือก/ประเภทคน/สกุล · ช่วงซ้อนกันเองในร่าง)
    let draftCard: RateCardRow | null = null;
    if (i.draft) {
      const d = i.draft;
      if (d.validFrom && d.validTo && d.validTo < d.validFrom) return stop("VALIDATION", "BAD_RANGE");
      const cache = new Map<string, ProductInfo>();
      const rows: RateRow[] = [];
      for (let n = 0; n < d.rates.length; n++) {
        const { rate } = normalizeRateInput(d.rates[n], false);
        const bad = await checkRateAgainstDb(g.db, g.tenantId, rate, cache);
        if (bad) return stop("VALIDATION", bad);
        const row: RateRow = { ...rate, id: `draft-${String(n).padStart(3, "0")}`, rateCardId: "draft" };
        if (rows.some((o) => sameDims(o, row))) return stop("VALIDATION", "RATE_OVERLAP");
        assertNoRateOverlap(row, rows);
        rows.push(row);
      }
      draftCard = { id: "draft", ownerKind: d.ownerKind, tierId: null, agentAccountId: null, status: "ACTIVE", validFrom: d.validFrom ?? null, validTo: d.validTo ?? null, version: 0, priority: d.priority ?? 0, rates: rows };
    }
    const loaded = await loadFacts({ tenantId: g.tenantId, unitId: i.unitId, agentAccountId: i.agentAccountId, productId: i.productId, departureId: i.slotId, travelDate: null, at });
    if (loaded === null) return stop("NOT_FOUND");
    if (loaded === "SETTINGS_INVALID") return stop("VALIDATION", "SETTINGS_INVALID");
    let facts = loaded.facts;
    if (draftCard && i.draft) {
      const owned: RateCardRow = { ...draftCard, tierId: i.draft.ownerKind === "TIER" ? facts.account.tierId : null, agentAccountId: i.draft.ownerKind === "AGENT" ? facts.account.id : null };
      facts = { ...facts, cards: [...facts.cards.filter((c) => c.id !== i.draft?.replacesCardId), owned] };
    }
    const built = buildAgencyPricingInput(facts);
    if (!built.ok) return stop("VALIDATION", "SETTINGS_INVALID");
    const agency: AgencyPricingInput = { ...built.input, terms: { ...built.input.terms, actualSaleSatang: i.actualSaleSatang ?? null }, policySnapshot: loaded.snapshot };
    const trips: TripsMod = await import("@/lib/modules/trips");
    await installAgencyPricingPort();
    // ctx ของผู้กระทำ AGENT ตามใบสั่ง §9 — ร้านไม่สร้างตัวตนผู้ใช้เอเจนซี่ (trips ไม่อ่าน agentUserId ตอนคิดราคา)
    const sctx = { tenantId: g.tenantId, unitId: i.unitId, channel: "AGENT_PORTAL", actor: { kind: "AGENT", agentAccountId: i.agentAccountId }, now: at } as unknown as SellCtx;
    const line: LineRequest = { productKind: "TRIP", unitId: i.unitId, productId: i.productId, slotId: i.slotId, pax: i.pax, ...(i.extras ? { extras: i.extras } : {}) };
    TRY_OVERRIDES.set(sctx, agency);
    let inp: Awaited<ReturnType<TripsMod["loadPricingInput"]>>;
    try {
      inp = await trips.loadPricingInput(sctx, line, i.agentDiscountSatang !== undefined ? { agentDiscountSatang: i.agentDiscountSatang } : undefined);
    } finally {
      TRY_OVERRIDES.delete(sctx);
    }
    if (!inp.ok) return fromTrips(inp);
    const r = trips.resolveTripPrice(inp.value);
    if (!r.ok) return fromTrips(r);
    return { ok: true as const, priced: r.value, trace: built.trace, termSources: { ...loaded.snapshot.sources }, warnings: built.warnings };
  });
}
