// price-rule.ts — กติการาคา happy hour / โปร ของ POS P2.2 (R3 · CD1 · มติ 7 8 9) · ผู้เขียนเดียวของ PosPriceRule
//
// • POS เป็นเจ้าของกติกาจนถึง P3 (CD1 — ระบบการตลาดยังไม่มีกติการาคา · facade `marketing.activePriceRules` + campaignId = P3)
// • อ่าน (listPriceRules) = pos.sale.read หรือ pos.sale.create ที่สาขาของ ctx · เขียน (savePriceRule / archivePriceRule) = **pos.price.rule**
//   ที่ "ทุกสาขา" ใน unitIds ของกติกา (ก่อนและหลังแก้) — unitIds [] = ทุกสาขาที่ผูกระบบ POS นี้ (มติ 8)
// • ปฏิเสธคืนค่า {ok:false, code, message(ไทย)}: VALIDATION · PERMISSION_DENIED · PRICE_RULE_NOT_FOUND (ร้าน/ระบบอื่น/ไม่มีจริง · แบบ 404) ·
//   PRICE_RULE_LIMIT (กติกาที่ยังไม่เก็บถาวร ≥ 100 ต่อระบบ · นับที่ปิดอยู่ด้วย · มติ 9) · INTERNAL
// • audit pos.priceRule.created / updated / archived (actorId = ผู้ใช้จริง · before/after = DTO 18 คีย์ + ruleId)
// • ตัวแก้ราคา (price-shared.ts) อ่านกติกาที่ active ไม่เก็บถาวรผ่าน price.ts — ไม่มี outbox (ราคาอ่านตอนขาย · R12)
import type { Prisma, PrismaClient, PosPriceRule } from "@prisma/client";
import { canAccessUnit, evaluate } from "@/lib/core/rbac";
import { prisma } from "./db";
import {
  PRICE_RULE_LIMIT,
  parsePriceRuleInput,
  priceRuleItem,
  type ArchivePriceRuleResult,
  type ListPriceRulesResult,
  type PriceRuleItem,
  type PriceRuleRefusal,
  type PriceRuleRefusalCode,
  type SavePriceRuleResult,
} from "./price-shared";
import type { RegisterActor, RegisterCtx } from "./register-shared";

type Db = PrismaClient;
export const PERM_PRICE_RULE = "pos.price.rule";

const MSG: Record<PriceRuleRefusalCode, string> = {
  VALIDATION: "ข้อมูลโปรราคาไม่ถูกต้อง — ยังไม่ได้บันทึกอะไร",
  PERMISSION_DENIED: "บัญชีนี้ยังไม่มีสิทธิ์ตั้งโปรราคาและ happy hour — ขอสิทธิ์จากเจ้าของร้าน",
  PRICE_RULE_NOT_FOUND: "ไม่พบโปรราคานี้",
  PRICE_RULE_LIMIT: `ระบบนี้มีโปรราคาครบ ${PRICE_RULE_LIMIT} รายการแล้ว (นับรวมที่ปิดอยู่) — เก็บถาวรโปรที่ไม่ใช้ก่อน`,
  INTERNAL: "ระบบโปรราคาขัดข้องชั่วคราว — ลองอีกครั้ง",
};
const refuse = (code: PriceRuleRefusalCode, message?: string, field?: string): PriceRuleRefusal =>
  field ? { ok: false, code, message: message ?? MSG[code], field } : { ok: false, code, message: message ?? MSG[code] };
const isRefusal = (v: unknown): v is PriceRuleRefusal => !!v && typeof v === "object" && (v as { ok?: unknown }).ok === false;
const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const isId = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 200 && !v.includes("\u0000");

async function guard<T>(name: string, body: () => Promise<T>): Promise<T | PriceRuleRefusal> {
  try {
    return await body();
  } catch (e) {
    console.error(`[pos/price-rule] ${name} INTERNAL`, e);
    return refuse("INTERNAL");
  }
}

function actorOf(a: unknown): RegisterActor | null {
  if (!isRecord(a) || !isId(a.userId)) return null;
  if (a.role !== "OWNER" && a.role !== "MANAGER" && a.role !== "STAFF") return null;
  if (!Array.isArray(a.unitAccess) || !a.unitAccess.every((x) => typeof x === "string")) return null;
  if (!isRecord(a.permissions)) return null;
  return { userId: a.userId, role: a.role, unitAccess: [...(a.unitAccess as string[])], permissions: a.permissions };
}

type Scope = { tenantId: string; systemId: string; unitId: string; actor: RegisterActor };

/** ctx ผิดรูป / ระบบไม่ใช่ POS ที่เปิดใช้ของร้านนี้ / สาขาไม่ผูกระบบนี้ / เก็บถาวร / เข้าสาขาไม่ได้ = PRICE_RULE_NOT_FOUND (404) · อ่านต้องมีสิทธิ์ขาย/ดูบิลที่สาขา */
async function scopeOf(db: Db, ctx: unknown, actorRaw: unknown): Promise<Scope | PriceRuleRefusal> {
  const nf = refuse("PRICE_RULE_NOT_FOUND", "ไม่พบสาขานี้ หรือบัญชีนี้เข้าสาขานี้ไม่ได้");
  if (!isRecord(ctx) || !isId(ctx.tenantId) || !isId(ctx.systemId) || !isId(ctx.unitId)) return nf;
  const { tenantId, systemId, unitId } = ctx as RegisterCtx;
  const actor = actorOf(actorRaw);
  if (!actor) return refuse("PERMISSION_DENIED");
  const [sys, link, unit] = await Promise.all([
    db.appSystem.findFirst({ where: { id: systemId, tenantId, type: "POS", active: true }, select: { id: true } }),
    db.appSystemUnit.findUnique({ where: { tenantId_unitId_type: { tenantId, unitId, type: "POS" } }, select: { systemId: true } }),
    db.businessUnit.findFirst({ where: { id: unitId, tenantId, status: { not: "ARCHIVED" } }, select: { id: true } }),
  ]);
  if (!sys || !link || link.systemId !== systemId || !unit) return nf;
  if (!canAccessUnit(actor, unitId)) return nf;
  return { tenantId, systemId, unitId, actor };
}

const canRead = (s: Scope) =>
  evaluate(s.actor, { module: "pos", action: "pos.sale.read", unitId: s.unitId }) || evaluate(s.actor, { module: "pos", action: "pos.sale.create", unitId: s.unitId });

/** สาขา (ไม่เก็บถาวร) ที่ผูกระบบ POS นี้ */
async function linkedUnits(db: Db | Prisma.TransactionClient, s: Scope): Promise<string[]> {
  const links = await db.appSystemUnit.findMany({ where: { tenantId: s.tenantId, systemId: s.systemId, type: "POS" }, select: { unitId: true } });
  if (!links.length) return [];
  const live = await db.businessUnit.findMany({ where: { tenantId: s.tenantId, id: { in: links.map((l) => l.unitId) }, status: { not: "ARCHIVED" } }, select: { id: true } });
  return live.map((u) => u.id);
}

/** มติ 8: pos.price.rule ที่ทุกสาขาใน unitIds — [] = ทุกสาขาที่ผูกระบบ (ไม่มีสาขาผูก = เจ้าของ/ทุกสาขาเท่านั้น) */
function canWriteUnits(s: Scope, unitIds: readonly string[], linked: readonly string[]): boolean {
  const scope = unitIds.length ? unitIds : linked;
  if (!scope.length) return s.actor.role === "OWNER" || s.actor.unitAccess.includes("*");
  return scope.every((u) => canAccessUnit(s.actor, u) && evaluate(s.actor, { module: "pos", action: PERM_PRICE_RULE, unitId: u }));
}

const auditOf = (r: PosPriceRule) => ({ ruleId: r.id, ...priceRuleItem(r) });

/**
 * รีวิว F4: audit ของกติกาเขียนในธุรกรรมเดียวกับแถวกติกา (บันทึกสำเร็จ ⇔ มี audit · audit ล้ม = ย้อนทั้งคู่ ⇒ ลองซ้ำไม่ได้กติกาซ้ำ)
 *   รูปแถวเดียวกับ writeAudit (actorType USER · before/after ว่าง = ไม่ใส่)
 */
async function auditRuleTx(tx: Prisma.TransactionClient, tenantId: string, actorId: string, action: string, targetId: string, before: unknown, after: unknown): Promise<void> {
  await tx.auditLog.create({
    data: { tenantId, actorType: "USER", actorId, action, targetType: "PosPriceRule", targetId, before: (before ?? undefined) as never, after: (after ?? undefined) as never },
  });
}

/** R3 — กติกาของระบบ (ปริยาย = ที่ยังไม่เก็บถาวร · includeArchived = รวมที่เก็บถาวร archived:true) เรียง priority มากก่อน → สร้างก่อน */
export async function listPriceRules(ctx: RegisterCtx, actor: RegisterActor, input: { includeArchived?: boolean } = {}, client?: Db): Promise<ListPriceRulesResult> {
  return guard("listPriceRules", async (): Promise<ListPriceRulesResult> => {
    const db = client ?? prisma;
    const s = await scopeOf(db, ctx, actor);
    if (isRefusal(s)) return s;
    if (!canRead(s)) return refuse("PERMISSION_DENIED", "บัญชีนี้ยังไม่มีสิทธิ์ดูโปรราคา — ขอสิทธิ์จากเจ้าของร้าน");
    const inp = input ?? {};
    if (!isRecord(inp) || Object.keys(inp).some((k) => k !== "includeArchived") || (inp.includeArchived !== undefined && typeof inp.includeArchived !== "boolean")) return refuse("VALIDATION");
    const rows = await db.posPriceRule.findMany({
      where: { tenantId: s.tenantId, systemId: s.systemId, ...(inp.includeArchived === true ? {} : { archivedAt: null }) },
      orderBy: [{ archivedAt: { sort: "desc", nulls: "first" } }, { priority: "desc" }, { createdAt: "asc" }, { id: "asc" }],
      take: 1000,
    });
    return { ok: true, items: rows.map(priceRuleItem) };
  });
}

/**
 * R3 — สร้าง (ไม่มี id) หรือแก้ (มี id) กติกา · อินพุตคีย์ตรงตัว (ดู parsePriceRuleInput) · สินค้า/หมวดต้องเป็นของระบบนี้ · สาขาต้องผูกระบบนี้ ·
 * สร้างใหม่ = นับเพดานใต้ล็อกของระบบ (สองคำขอพร้อมกันไม่เกิน 100)
 */
export async function savePriceRule(ctx: RegisterCtx, actor: RegisterActor, input: unknown, client?: Db): Promise<SavePriceRuleResult> {
  return guard("savePriceRule", async (): Promise<SavePriceRuleResult> => {
    const db = client ?? prisma;
    const s = await scopeOf(db, ctx, actor);
    if (isRefusal(s)) return s;
    const parsed = parsePriceRuleInput(input);
    if (!parsed.ok) return refuse("VALIDATION", parsed.message, parsed.field);
    const v = parsed.value;
    const prior = v.id ? await db.posPriceRule.findFirst({ where: { id: v.id, tenantId: s.tenantId, systemId: s.systemId } }) : null;
    if (v.id && !prior) return refuse("PRICE_RULE_NOT_FOUND");
    if (prior?.archivedAt) return refuse("VALIDATION", "โปรนี้ถูกเก็บถาวรแล้ว — สร้างโปรใหม่แทน", "id");
    const linked = await linkedUnits(db, s);
    // สิทธิ์ก่อนตรวจข้อมูลอ้างอิง (ผู้ไม่มีสิทธิ์ไม่ได้รู้ว่าสินค้า/สาขาไหนมีจริง) · แก้ = ต้องมีสิทธิ์ทั้งขอบเขตเดิมและใหม่
    if (!canWriteUnits(s, v.unitIds, linked) || (prior && !canWriteUnits(s, prior.unitIds, linked))) return refuse("PERMISSION_DENIED");
    if (v.unitIds.some((u) => !linked.includes(u))) return refuse("VALIDATION", "มีสาขาที่ไม่ได้ใช้ระบบขายนี้", "unitIds");
    if (v.productIds.length) {
      const n = await db.posProduct.count({ where: { tenantId: s.tenantId, systemId: s.systemId, id: { in: v.productIds } } });
      if (n !== v.productIds.length) return refuse("VALIDATION", "ไม่พบสินค้าบางรายการในระบบขายนี้", "productIds");
    }
    if (v.categoryIds.length) {
      const n = await db.posCategory.count({ where: { tenantId: s.tenantId, systemId: s.systemId, id: { in: v.categoryIds } } });
      if (n !== v.categoryIds.length) return refuse("VALIDATION", "ไม่พบหมวดบางหมวดในระบบขายนี้", "categoryIds");
    }
    const data = {
      name: v.name,
      kind: v.kind,
      active: v.active,
      priority: v.priority,
      productIds: v.productIds,
      categoryIds: v.categoryIds,
      channelCodes: v.channelCodes,
      unitIds: v.unitIds,
      adjust: v.adjust,
      valueSatang: v.valueSatang,
      valueBp: v.valueBp,
      startsAt: v.startsAt,
      endsAt: v.endsAt,
      weekdays: v.weekdays,
      timeFrom: v.timeFrom,
      timeTo: v.timeTo,
      updatedByUserId: s.actor.userId,
    };
    if (prior) {
      const after = await db.$transaction(async (tx): Promise<PosPriceRule | null> => {
        const n = await tx.posPriceRule.updateMany({ where: { id: prior.id, tenantId: s.tenantId, systemId: s.systemId, archivedAt: null }, data });
        if (n.count !== 1) return null;
        const row = await tx.posPriceRule.findUniqueOrThrow({ where: { id: prior.id } });
        await auditRuleTx(tx, s.tenantId, s.actor.userId, "pos.priceRule.updated", prior.id, auditOf(prior), auditOf(row));
        return row;
      });
      if (!after) return refuse("PRICE_RULE_NOT_FOUND");
      return { ok: true, rule: priceRuleItem(after) };
    }
    const created = await db.$transaction(async (tx): Promise<PosPriceRule | PriceRuleRefusal> => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`pos-price-rule:${s.systemId}`}))`;
      const live = await tx.posPriceRule.count({ where: { tenantId: s.tenantId, systemId: s.systemId, archivedAt: null } });
      if (live >= PRICE_RULE_LIMIT) return refuse("PRICE_RULE_LIMIT");
      const row = await tx.posPriceRule.create({ data: { ...data, tenantId: s.tenantId, systemId: s.systemId, createdByUserId: s.actor.userId } });
      await auditRuleTx(tx, s.tenantId, s.actor.userId, "pos.priceRule.created", row.id, null, auditOf(row));
      return row;
    });
    if (isRefusal(created)) return created;
    return { ok: true, rule: priceRuleItem(created) };
  });
}

/** R3 — เก็บถาวร (soft · archivedAt) · สิทธิ์ตามขอบเขตสาขาของกติกา (มติ 8) · เก็บซ้ำ = ok ไม่มี audit ใหม่ · บิลเก่ายังอ้าง id เดิม (priceRuleId) */
export async function archivePriceRule(ctx: RegisterCtx, actor: RegisterActor, input: { id: string }, client?: Db): Promise<ArchivePriceRuleResult> {
  return guard("archivePriceRule", async (): Promise<ArchivePriceRuleResult> => {
    const db = client ?? prisma;
    const s = await scopeOf(db, ctx, actor);
    if (isRefusal(s)) return s;
    if (!isRecord(input) || Object.keys(input).some((k) => k !== "id")) return refuse("VALIDATION");
    if (!isId(input.id)) return refuse("PRICE_RULE_NOT_FOUND");
    const row = await db.posPriceRule.findFirst({ where: { id: input.id, tenantId: s.tenantId, systemId: s.systemId } });
    if (!row) return refuse("PRICE_RULE_NOT_FOUND");
    if (!canWriteUnits(s, row.unitIds, await linkedUnits(db, s))) return refuse("PERMISSION_DENIED");
    if (row.archivedAt) return { ok: true, rule: priceRuleItem(row) };
    const after = await db.$transaction(async (tx): Promise<PosPriceRule> => {
      const n = await tx.posPriceRule.updateMany({ where: { id: row.id, tenantId: s.tenantId, systemId: s.systemId, archivedAt: null }, data: { archivedAt: new Date(), updatedByUserId: s.actor.userId } });
      const cur = await tx.posPriceRule.findUniqueOrThrow({ where: { id: row.id } });
      if (n.count === 1) await auditRuleTx(tx, s.tenantId, s.actor.userId, "pos.priceRule.archived", row.id, auditOf(row), auditOf(cur));
      return cur;
    });
    return { ok: true, rule: priceRuleItem(after) };
  });
}

export type { PriceRuleItem };
