// limits.ts — ตัวบังคับเพดานของ CRM v2 (ใบ C3.9 · พิมพ์เขียว §11.9 · addendum ข้อ 4)
//
//   crmLimits(tenantId)                  — ค่าเพดานที่ใช้จริงของร้าน (`Tenant.limits.crm.<key>` ทับค่าเริ่มต้น `CRM_LIMITS`)
//   crmUsage(ctx, key, { parentId? })    — ใช้ไปเท่าไร (ต่อระบบ · ต่อร้านสำหรับ webhook/automation · ต่อแม่สำหรับคีย์ *Per*)
//   assertCrmLimit(ctx, key, adding, tx?) — ตัดสิน + เตือน (ผู้สร้างทุกทางเรียกตัวนี้ **ใน tx เดียวกับ insert**)
//   noteCrmUsage(ctx, key, adding, tx?)  — ทางเตือนอย่างเดียว (วัตถุกำหนดเอง · web event) — ไม่ปฏิเสธ
//   limitStatus(ctx, actor)              — แถบการใช้งานของหน้า /crm/settings (คีย์ crm.settings.manage)
//   CRM_PARAM_CAPS / CRM_HARD_CAPS       — ค่าตัวเลขของสิทธิ์ `crm._max*` และเพดานตายตัวของโค้ด (ใน `./limits-shared`)
//
// AUDIT-CLASS X3: "ตรวจ + insert" เป็นก้าวเดียว — `pg_advisory_xact_lock` ต่อ (ระบบ|ร้าน, คีย์) แล้วนับใต้ล็อกใน tx ของผู้สร้าง
//   ⇒ ยิง 10 ทางพร้อมกันเมื่อเหลือช่องเดียว = ได้แถวเดียว (C3.9-X3.1) · ไม่มี "อ่าน→คิดในแอป→เขียน" ข้ามธุรกรรม
// AUDIT-CLASS X9: เกินเพดาน = `CrmLimitError` (code LIMIT · ไทย · บอกทางออก) — ไม่มีอะไรถูกเขียน (tx ถอยทั้งก้อน)
// AUDIT-CLASS X8: การเตือน 80 % = AppNotification ถึงเจ้าของร้านทุกคน (OWNER) + OpsEvent WARN `crm.limits` (id/ตัวเลขล้วน) —
//   ครั้งเดียวต่อ (ระบบ, คีย์, เดือนไทย, ค่าเพดาน) — ธงคือแถว OpsEvent `crm.limits` ของร้าน (`detail.flag`) อ่าน/เขียนใต้ advisory lock เดียวกัน
//   ค่าเพดานอยู่ในกุญแจธงโดยตั้งใจ: เจ้าของร้านขยายเพดานแล้วใช้จนใกล้อีกครั้ง = ต้องได้รู้อีกครั้ง
import { Prisma } from "@prisma/client";
import type { MemberActor } from "@/lib/modules/member";
import { prisma } from "./db";
import { crmCan, crmForbiddenMessage } from "./access";
import {
  CRM_HARD_CAPS,
  CRM_LIMITS,
  CRM_LIMIT_KEYS,
  CRM_LIMIT_DAILY_ONLY,
  CRM_LIMIT_LABEL,
  CRM_LIMIT_PER_PARENT,
  CRM_LIMIT_TENANT_WIDE,
  CRM_LIMIT_UNIT,
  CRM_LIMIT_WARN_ONLY,
  CRM_LIMIT_WARN_RATIO,
  CRM_PARAM_CAPS,
  CrmLimitError,
  crmLimitMessage,
  isCrmLimitKey,
  type CrmLimitKey,
  type CrmLimitRow,
  type CrmLimitStatus,
  type CrmLimitValues,
} from "./limits-shared";

export { CRM_HARD_CAPS, CRM_LIMITS, CRM_LIMIT_KEYS, CRM_LIMIT_WARN_RATIO, CRM_PARAM_CAPS, CrmLimitError, isCrmLimitKey };
export type { CrmLimitKey, CrmLimitRow, CrmLimitStatus, CrmLimitValues };

export type LimitsCtx = { tenantId: string; systemId: string; actorUserId?: string | null };
type Tx = Prisma.TransactionClient;
type Db = typeof prisma | Tx;

const TX_OPTS = { maxWait: 15_000, timeout: 30_000 } as const;
const THAI_OFFSET_MS = 7 * 3_600_000;
const OPS_SOURCE = "crm.limits";

/** error ขอบเขต (ระบบไม่ใช่ CRM ของร้านนี้ / สิทธิ์ไม่พอ) — แยกจาก "เกินเพดาน" */
export class CrmLimitsAccessError extends Error {
  readonly code: "NOT_FOUND" | "FORBIDDEN" | "VALIDATION";
  constructor(code: "NOT_FOUND" | "FORBIDDEN" | "VALIDATION", message: string) {
    super(message);
    this.name = "CrmLimitsAccessError";
    this.code = code;
  }
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** 00:00 ไทยของวันนี้ (UTC instant) — ไม่ใช้ getDate() ดิบ */
function thaiDayStart(now: Date): Date {
  const ms = now.getTime() + THAI_OFFSET_MS;
  return new Date(ms - (((ms % 86_400_000) + 86_400_000) % 86_400_000) - THAI_OFFSET_MS);
}
/** 00:00 ไทยของวันที่ 1 เดือนนี้ */
function thaiMonthStart(now: Date): Date {
  const t = new Date(now.getTime() + THAI_OFFSET_MS);
  return new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), 1) - THAI_OFFSET_MS);
}
/** "YYYY-MM" ของเดือนไทย (กุญแจธงเตือน) */
function thaiMonthKey(now: Date): string {
  const t = new Date(now.getTime() + THAI_OFFSET_MS);
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** ค่าเพดานจาก `Tenant.limits.crm` — ค่าเพี้ยน/ติดลบ/ไม่ได้ตั้ง = ค่าเริ่มต้น (ไม่ throw) */
export function crmLimitsOf(rawTenantLimits: unknown): CrmLimitValues {
  const crm = isObj(rawTenantLimits) && isObj(rawTenantLimits.crm) ? rawTenantLimits.crm : {};
  const out = { ...CRM_LIMITS } as CrmLimitValues;
  for (const k of CRM_LIMIT_KEYS) {
    const v = crm[k];
    if (typeof v === "number" && Number.isFinite(v) && v >= 0) out[k] = Math.floor(v);
  }
  return out;
}

/** ค่าเพดานที่ใช้จริงของร้าน */
export async function crmLimits(tenantId: string, db: Db = prisma): Promise<CrmLimitValues> {
  const t = typeof tenantId === "string" && tenantId ? await db.tenant.findUnique({ where: { id: tenantId }, select: { limits: true } }) : null;
  return crmLimitsOf(t?.limits);
}

/** ค่าเพดานคีย์เดียว (ผู้เรียกที่แค่ต้องการตัวเลข เช่น ตรวจจำนวนขั้นก่อนเขียน) */
export async function crmLimitOf(tenantId: string, key: CrmLimitKey, db: Db = prisma): Promise<number> {
  return (await crmLimits(tenantId, db))[key];
}

/** AUDIT-CLASS X1: ctx.systemId ต้องเป็นระบบ CRM ของร้านนี้ */
async function resolveSystem(ctx: LimitsCtx, db: Db = prisma): Promise<void> {
  const ok =
    ctx && typeof ctx.tenantId === "string" && typeof ctx.systemId === "string" && ctx.tenantId && ctx.systemId
      ? await db.appSystem.findFirst({ where: { id: ctx.systemId, tenantId: ctx.tenantId, type: "CRM" }, select: { id: true } })
      : null;
  if (!ok) throw new CrmLimitsAccessError("NOT_FOUND", "ไม่พบระบบ CRM นี้ในร้านที่เปิดอยู่ — รีเฟรชหน้าแล้วลองใหม่");
}

function keyOf(key: unknown): CrmLimitKey {
  if (!isCrmLimitKey(key)) throw new CrmLimitsAccessError("VALIDATION", "ไม่รู้จักเพดานที่ขอ — เลือกจากรายการเพดานของ CRM");
  return key;
}

/**
 * ใช้ไปเท่าไร — ขอบเขต: ระบบ (ค่าปกติ) · ร้าน (webhookEndpoints · automationRunsPerMonth) · แม่ (คีย์ *Per* — ไม่ส่งแม่ = ตัวที่ใช้มากที่สุด)
 * ใช้ภายใน tx ได้ (ผู้สร้างนับใต้ล็อกของตัวเอง)
 */
async function usageOf(db: Db, ctx: LimitsCtx, key: CrmLimitKey, parentId: string | null, now: Date): Promise<number> {
  const t = ctx.tenantId;
  const s = ctx.systemId;
  const sys = { tenantId: t, systemId: s };
  const maxOf = (rows: { n: bigint | number }[]) => rows.reduce((m, r) => Math.max(m, Number(r.n)), 0);
  switch (key) {
    // CRM C3.9 ▸ NOTE รีวิว (มติผู้คุมงาน): แถวที่เก็บถาวร/ถูกรวม (รวมผู้ติดต่อที่ลบตาม PDPA) ไม่กินเพดาน ⇒ ข้อความ "เก็บถาวรรายการที่ไม่ใช้" เป็นทางออกจริง ◂
    case "contacts":
      return db.crmContact.count({ where: { ...sys, mergedIntoId: null, archivedAt: null } });
    case "companies":
      return db.crmCompany.count({ where: { ...sys, mergedIntoId: null, archivedAt: null } });
    case "openDeals":
      return db.crmDeal.count({ where: { ...sys, kind: "OPEN", archivedAt: null } });
    case "pipelines":
      return db.crmPipeline.count({ where: { ...sys, archivedAt: null } });
    case "stagesPerPipeline":
      if (parentId) return db.crmStage.count({ where: { ...sys, pipelineId: parentId } });
      return maxOf(await db.$queryRaw<{ n: bigint }[]>`SELECT count(*)::bigint AS n FROM "CrmStage" WHERE "tenantId" = ${t} AND "systemId" = ${s} GROUP BY "pipelineId"`);
    case "linesPerDeal":
      if (parentId) return db.crmDealLine.count({ where: { tenantId: t, dealId: parentId } });
      return maxOf(await db.$queryRaw<{ n: bigint }[]>`
        SELECT count(*)::bigint AS n FROM "CrmDealLine" l JOIN "CrmDeal" d ON d."id" = l."dealId"
         WHERE d."tenantId" = ${t} AND d."systemId" = ${s} GROUP BY l."dealId"`);
    case "emailsPerDay":
      return db.crmEmailMessage.count({ where: { ...sys, direction: "OUT", createdAt: { gte: thaiDayStart(now) } } });
    case "sequences":
      return db.crmSequence.count({ where: { ...sys, archivedAt: null } });
    case "stepsPerSequence":
      if (parentId) {
        const seq = await db.crmSequence.findFirst({ where: { ...sys, id: parentId }, select: { version: true } });
        return seq ? db.crmSequenceStep.count({ where: { tenantId: t, sequenceId: parentId, version: seq.version } }) : 0;
      }
      return maxOf(await db.$queryRaw<{ n: bigint }[]>`
        SELECT count(*)::bigint AS n FROM "CrmSequenceStep" st JOIN "CrmSequence" q ON q."id" = st."sequenceId" AND st."version" = q."version"
         WHERE q."tenantId" = ${t} AND q."systemId" = ${s} GROUP BY st."sequenceId"`);
    case "activeEnrollments":
      return db.crmSequenceEnrollment.count({ where: { tenantId: t, status: "ACTIVE", sequence: { systemId: s } } });
    case "assignmentRules":
      return db.crmAssignmentRule.count({ where: sys });
    case "scoreRules":
      return db.crmScoreRule.count({ where: sys });
    case "emailTemplates":
      return db.crmEmailTemplate.count({ where: sys });
    case "objectsWarn":
      return db.customObject.count({ where: { ...sys, archivedAt: null } });
    case "fieldsPerObject":
      if (parentId) return db.memberField.count({ where: { tenantId: t, systemId: s, objectKey: parentId, archivedAt: null } });
      return maxOf(await db.$queryRaw<{ n: bigint }[]>`
        SELECT count(*)::bigint AS n FROM "MemberField" WHERE "tenantId" = ${t} AND "systemId" = ${s} AND "archivedAt" IS NULL GROUP BY "objectKey"`);
    case "trackedLinks":
      return db.crmTrackedLink.count({ where: sys });
    case "webEventsPerMonth": {
      const rows = await db.$queryRaw<{ n: bigint }[]>`
        SELECT count(*)::bigint AS n FROM "CrmWebEvent" e JOIN "CrmWebSession" w ON w."id" = e."sessionId"
         WHERE w."tenantId" = ${t} AND w."systemId" = ${s} AND e."at" >= ${thaiMonthStart(now)}`;
      return Number(rows[0]?.n ?? 0);
    }
    case "webhookEndpoints":
      return db.webhookEndpoint.count({ where: { tenantId: t } });
    case "automationRunsPerMonth":
      // สูตรเดียวกับ `automation.ts#crmRunsUsed` (กฎ CRM ทุกระบบของร้าน · รอบหลักที่จบแล้ว)
      return db.automationRun.count({ where: { tenantId: t, stepIndex: null, status: { in: ["OK", "FAILED"] }, createdAt: { gte: thaiMonthStart(now) }, rule: { scope: "CRM" } } });
  }
}

/** ใช้ไปเท่าไร (ทางสาธารณะ — ตรวจระบบก่อน) */
export async function crmUsage(ctx: LimitsCtx, key: CrmLimitKey | string, opts: { parentId?: string | null; now?: Date } = {}): Promise<number> {
  const k = keyOf(key);
  await resolveSystem(ctx);
  return usageOf(prisma, ctx, k, typeof opts.parentId === "string" && opts.parentId ? opts.parentId : null, opts.now ?? new Date());
}

/** กุญแจ advisory ของ (ขอบเขต, คีย์) — ต่อแม่สำหรับคีย์ *Per* */
function lockKey(ctx: LimitsCtx, key: CrmLimitKey, parentId: string | null): string {
  const scope = CRM_LIMIT_TENANT_WIDE.has(key) ? `t:${ctx.tenantId}` : `s:${ctx.systemId}`;
  return `crm.limit:${scope}:${key}${parentId ? `:${parentId}` : ""}`;
}

/**
 * เตือนครั้งเดียวเมื่อข้าม 80 % — แจ้งเตือน + OpsEvent อยู่ใน tx เดียวกับงานของผู้เรียก (ถอยพร้อมกัน)
 * ธง "เตือนแล้ว" = แถว OpsEvent `crm.limits` ของร้านในเดือนไทยนี้ที่มี `flag` ตรงกัน — อ่าน/เขียนใต้ advisory lock ของ (ขอบเขต, คีย์)
 * ที่ผู้เรียกถืออยู่ ⇒ ครั้งเดียวแน่นอน · ธงผูกร้าน (ลบร้าน = ธงหายตาม ไม่มีแถวกำพร้าในตารางกลาง)
 */
async function warnOnce(tx: Tx, ctx: LimitsCtx, key: CrmLimitKey, used: number, limit: number, now: Date): Promise<boolean> {
  const flag = `crm.limits:${CRM_LIMIT_TENANT_WIDE.has(key) ? ctx.tenantId : ctx.systemId}:${key}:${thaiMonthKey(now)}:${limit}`;
  const seen = await tx.opsEvent.findFirst({
    where: { tenantId: ctx.tenantId, source: OPS_SOURCE, createdAt: { gte: new Date(thaiMonthStart(now).getTime() - 60_000) }, detail: { contains: `"flag":"${flag}"` } },
    select: { id: true },
  });
  if (seen) return false;
  const owners = await tx.membership.findMany({ where: { tenantId: ctx.tenantId, role: "OWNER", acceptedAt: { not: null } }, select: { userId: true }, take: 50 });
  const pct = limit > 0 ? Math.floor((used / limit) * 100) : 100;
  const label = CRM_LIMIT_LABEL[key];
  const created = new Date();
  if (owners.length) {
    await tx.appNotification.createMany({
      data: owners.map((o) => ({
        createdAt: created,
        tenantId: ctx.tenantId,
        recipientUserId: o.userId,
        title: `CRM ใกล้ถึงเพดาน${label} (${pct}%)`,
        body: `ระบบ CRM ใช้${label}ไปแล้ว ${used.toLocaleString("th-TH")} จากเพดาน ${limit.toLocaleString("th-TH")} ${CRM_LIMIT_UNIT[key]} (${pct}%) — เก็บถาวรรายการที่ไม่ใช้ หรือติดต่อทีม SHARK เพื่อขยายเพดานก่อนเต็ม`,
      })),
    });
  }
  // AUDIT-CLASS X8: ข้อความ/รายละเอียดเป็นรหัสกับตัวเลขล้วน (ไม่มีชื่อคน/ลูกค้า)
  await tx.opsEvent.create({
    data: { createdAt: created, level: "WARN", source: OPS_SOURCE, tenantId: ctx.tenantId, message: `CRM ใกล้ถึงเพดาน ${key} (${pct}%)`, detail: JSON.stringify({ flag, systemId: ctx.systemId, key, used, limit }) },
  });
  return true;
}

async function assertInTx(tx: Tx, ctx: LimitsCtx, key: CrmLimitKey, adding: number, opts: { parentId: string | null; now: Date; refuse: boolean; sweep?: boolean }): Promise<{ used: number; limit: number; warned: boolean }> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey(ctx, key, opts.parentId)}, 0))`;
  const limit = (await crmLimits(ctx.tenantId, tx))[key];
  const used = await usageOf(tx, ctx, key, opts.parentId, opts.now);
  const after = used + adding;
  if (opts.refuse && after > limit) throw new CrmLimitError(key, limit, crmLimitMessage(key, limit));
  let warned = false;
  // เตือนเฉพาะคีย์ระดับระบบ/ร้าน (คีย์ต่อแม่ตัดสินเป็นรายแม่ — ไม่มีความหมายเป็น "ใกล้เต็มทั้งระบบ")
  if (!CRM_LIMIT_PER_PARENT.has(key) && limit > 0 && (adding > 0 || opts.sweep === true) && after / limit >= CRM_LIMIT_WARN_RATIO) {
    warned = await warnOnce(tx, ctx, key, after, limit, opts.now);
  }
  return { used, limit, warned };
}

/**
 * ตัดสินเพดาน (+ เตือน 80 %) — เรียกใน tx ของผู้สร้างก่อน insert เสมอ (ส่ง `tx`) · ไม่ส่ง tx = เปิด tx ของตัวเอง (ตรวจล่วงหน้า)
 * เกิน ⇒ `CrmLimitError` (code LIMIT · ไทย) · `adding` ≤ 0 = ตรวจอย่างเดียว
 */
export async function assertCrmLimit(
  ctx: LimitsCtx,
  key: CrmLimitKey | string,
  adding = 1,
  tx?: Tx | null,
  opts: { parentId?: string | null; now?: Date } = {},
): Promise<{ used: number; limit: number; warned: boolean }> {
  const k = keyOf(key);
  const n = Number.isFinite(adding) ? Math.max(0, Math.floor(adding)) : 1;
  const o = { parentId: typeof opts.parentId === "string" && opts.parentId ? opts.parentId : null, now: opts.now ?? new Date(), refuse: true };
  if (tx) return assertInTx(tx, ctx, k, n, o);
  await resolveSystem(ctx);
  return prisma.$transaction((t) => assertInTx(t, ctx, k, n, o), TX_OPTS);
}

/** ทางเตือนอย่างเดียว (ไม่ปฏิเสธ) — วัตถุกำหนดเอง ("ไม่จำกัด เตือนที่ 30") · web event ("แจ้งก่อนถึง") */
export async function noteCrmUsage(ctx: LimitsCtx, key: CrmLimitKey, adding = 1, tx?: Tx | null): Promise<{ used: number; limit: number; warned: boolean }> {
  const o = { parentId: null, now: new Date(), refuse: false };
  if (tx) return assertInTx(tx, ctx, key, Math.max(0, Math.floor(adding)), o);
  return prisma.$transaction((t) => assertInTx(t, ctx, key, Math.max(0, Math.floor(adding)), o), TX_OPTS);
}

/**
 * เพดาน "ต่อแม่" ที่ผู้เรียกตรวจเองด้วยข้อความของโมดูล (ขั้น/บรรทัด/ฟิลด์) — คืนค่าเพดานของร้าน (ค่าเริ่มต้นเท่าค่าตายตัวเดิม)
 * ไม่มีล็อก: ผู้เรียกถือล็อกแถวแม่ของตัวเองอยู่แล้ว (FOR UPDATE ของ pipeline/ดีล/ลำดับ)
 */
export async function perParentCap(tenantId: string, key: "stagesPerPipeline" | "linesPerDeal" | "stepsPerSequence" | "fieldsPerObject", db: Db = prisma): Promise<number> {
  return (await crmLimits(tenantId, db))[key];
}

/** แถบการใช้งานทุกเพดาน (หน้า /crm/settings) — คีย์ `crm.settings.manage` */
export async function limitStatus(ctx: LimitsCtx, actor: MemberActor): Promise<CrmLimitStatus> {
  if (!actor || actor.role === "CUSTOMER") throw new CrmLimitsAccessError("NOT_FOUND", "ไม่พบระบบ CRM นี้ในร้านที่เปิดอยู่ — รีเฟรชหน้าแล้วลองใหม่");
  await resolveSystem(ctx);
  if (!crmCan(actor, "crm.settings.manage")) throw new CrmLimitsAccessError("FORBIDDEN", crmForbiddenMessage("crm.settings.manage"));
  const now = new Date();
  const limits = await crmLimits(ctx.tenantId);
  const rows: CrmLimitRow[] = [];
  for (const key of CRM_LIMIT_KEYS) {
    const limit = limits[key];
    // CRM C3.9 ▸ NOTE รีวิว: web event/เดือน (หลักล้านแถว) ไม่นับทุกครั้งที่เปิดหน้า — ประเมินรายวันโดยงาน `crm.retention.leads`
    //   (`sweepWarnings`) · หน้าแสดง "ประเมินรายวัน" + ป้ายใกล้เต็มเมื่อเดือนนี้เคยเตือนแล้ว ◂
    if (CRM_LIMIT_DAILY_ONLY.has(key)) {
      const warned = await prisma.opsEvent.findFirst({
        where: { tenantId: ctx.tenantId, source: OPS_SOURCE, createdAt: { gte: thaiMonthStart(now) }, detail: { contains: `"key":"${key}"` } },
        select: { detail: true },
        orderBy: { createdAt: "desc" },
      });
      rows.push({ key, label: CRM_LIMIT_LABEL[key], unit: CRM_LIMIT_UNIT[key], limit, used: null, ratio: 0, warn: !!warned, over: false, warnOnly: CRM_LIMIT_WARN_ONLY.has(key), perParent: false });
      continue;
    }
    const used = await usageOf(prisma, ctx, key, null, now);
    const ratio = limit > 0 ? used / limit : used > 0 ? 1 : 0;
    rows.push({
      key,
      label: CRM_LIMIT_LABEL[key],
      unit: CRM_LIMIT_UNIT[key],
      limit,
      used,
      ratio,
      warn: ratio >= CRM_LIMIT_WARN_RATIO,
      over: used > limit,
      warnOnly: CRM_LIMIT_WARN_ONLY.has(key),
      perParent: CRM_LIMIT_PER_PARENT.has(key),
    });
  }
  return { rows, warnRatio: CRM_LIMIT_WARN_RATIO };
}

/** เพดานที่โตเองโดยไม่มีปุ่ม "สร้าง" ของ CRM ให้ดัก (web event · รอบกฎอัตโนมัติ · วัตถุ · ปลายทางเว็บฮุคของบริการกลาง) — งานรายวันตรวจแล้วเตือนครั้งเดียวเมื่อ ≥ 80 % */
const SWEEP_KEYS: readonly CrmLimitKey[] = ["webEventsPerMonth", "automationRunsPerMonth", "objectsWarn", "webhookEndpoints"];

/**
 * ตัวงานของ `crm.retention.leads` (C3.9): ไล่ทุกระบบ CRM uiVersion 2 · ไม่ปฏิเสธอะไร · เตือนผ่านธงเดียวกับ assertCrmLimit (ไม่เตือนซ้ำ)
 * เคารพ deadline/signal ระหว่างระบบ
 */
export async function sweepWarnings(now: Date, opts: { tenantIds?: string[]; deadline?: number; signal?: AbortSignal } = {}): Promise<{ warned: number }> {
  const at = now instanceof Date && !Number.isNaN(now.getTime()) ? now : new Date();
  const tenantIds = Array.isArray(opts.tenantIds) ? opts.tenantIds.filter((x) => typeof x === "string" && x) : null;
  if (tenantIds && tenantIds.length === 0) return { warned: 0 };
  const systems = await prisma.appSystem.findMany({
    where: { type: "CRM", settings: { path: ["crm", "uiVersion"], equals: 2 }, ...(tenantIds ? { tenantId: { in: tenantIds } } : {}) },
    select: { id: true, tenantId: true },
    orderBy: { id: "asc" },
  });
  let warned = 0;
  for (const sys of systems) {
    if (opts.signal?.aborted || (typeof opts.deadline === "number" && Date.now() > opts.deadline - 500)) break;
    for (const key of SWEEP_KEYS) {
      const r = await prisma.$transaction((tx) => assertInTx(tx, { tenantId: sys.tenantId, systemId: sys.id }, key, 0, { parentId: null, now: at, refuse: false, sweep: true }), TX_OPTS);
      if (r.warned) warned += 1;
    }
  }
  return { warned };
}
