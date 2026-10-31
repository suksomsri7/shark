// health.ts — สุขภาพตัวต่อของศูนย์เชื่อมต่อ (SVC C.3 · ใบสั่ง §2–§3 · DH §5.3 · BQ §4.6 · ภาคผนวก ก หอ #83)
//
// 1) เตือนเจ้าของเมื่อ ERROR — consumer ของ `integration.failed` (R0.5 ออกครั้งเดียวต่อการตก CONNECTED → ERROR)
//    กันซ้ำด้วยแถว OpsAlertState source `integration-alert:failed:<eventId>` ใน tx เดียวกับ AppNotification (ใต้ล็อกแถว)
//    ฟื้นแล้ว (ไม่ ERROR / มี integration.connected หลัง event) · ถอดแล้ว · ไม่พบ · ข้ามร้าน · payload ผิด ⇒ ไม่เตือน ไม่โยน
// 2) เตือนโควตา — งานรายชั่วโมง: CONNECTED + ชนิดที่มี quota() (กรองใน SQL) · ≤ 1 ครั้ง/60 นาที/แถว · ตรวจนานสุดก่อน ·
//    ตั้ง checkedAt แม้ล้ม (กันอดอยาก) · ตัดสิน + เขียน quota + AppNotification ใต้ล็อกแถว (SELECT … FOR UPDATE) ใน tx เดียว
// 3) มุมมองสุขภาพ (get/list) — ไม่มีค่าลับ/ฟิลด์/ข้อความดิบ · สิทธิ์/ขอบเขตหน่วยชุดเดียวกับ listIntegrations · NOT_FOUND ผลเดียว
//
// 🔴 ผู้รับ = Membership OWNER ที่ acceptedAt ไม่ว่าง (1 แถวต่อเจ้าของ · ไม่มีแถวทั้งร้าน) · ไม่ logOps
// 🔴 ใน tx ใช้ `tx` เท่านั้น (ไม่เปิด connection ที่สอง) — ค่าตั้ง #83 อ่านก่อนเข้า tx · 40P01 ⇒ ลองใหม่ 1 ครั้ง แล้ว BUSY
// 🔴 เวลาไทยผ่าน bkkYmd/bkkDayStart เท่านั้น · ไม่ import POS/แชท/payment/โมดูลโดเมน
import { randomUUID } from "node:crypto";
import { Prisma, type TenantIntegration } from "@prisma/client";
import { prisma } from "@/lib/core/db";
import { resolveSetting } from "@/lib/core/settings";
import { bkkDayStart, bkkYmd } from "@/lib/core/quiet-hours";
import { INTEGRATION_KIND_META } from "./registry";
import {
  asIntegrationOnFailure,
  asIntegrationStatus,
  callIntegration,
  canManageIntegrations,
  integrationActorOf,
  integrationCtxOf,
  integrationHandleForRow,
  integrationRefuse,
  integrationUnitLimited,
  INTEGRATION_FAILURE_THRESHOLD,
} from "./service";
import type {
  CallCode,
  IntegrationActor,
  IntegrationCtx,
  IntegrationHandle,
  IntegrationHealthCall,
  IntegrationHealthDay,
  IntegrationHealthListResult,
  IntegrationHealthResult,
  IntegrationHealthView,
  IntegrationOnFailure,
  IntegrationQuotaView,
  StoredIntegrationKind,
  StoredIntegrationQuota,
} from "./types";

export const INTEGRATION_QUOTA_ALERT_KEY = "integrations.quota.alertPercent";
export const INTEGRATION_HEALTH_RECENT = 20;
export const INTEGRATION_HEALTH_DAYS = 14;
export const INTEGRATION_QUOTA_CHECK_MINUTES = 60;
/** ชนิดที่ adapter มี quota() — งานรายชั่วโมงกรองใน SQL */
const QUOTA_KINDS: readonly StoredIntegrationKind[] = ["SLIP_VERIFY"];
const DEFAULT_PERCENT = 10;
const DEFAULT_MAX_ROWS = 200;
const ALERT_SOURCE_PREFIX = "integration-alert:failed:";
const DAY_MS = 86_400_000;
const MIN_MS = 60_000;
const TX_OPTS = { maxWait: 15_000, timeout: 20_000 } as const;
const CALL_CODES: ReadonlySet<string> = new Set(["TIMEOUT", "PROVIDER_ERROR", "QUOTA", "NOT_READY"]);

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const isId = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(v);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const errName = (e: unknown) => (e instanceof Error ? e.name : "error");
const validDate = (d: unknown): d is Date => d instanceof Date && !Number.isNaN(d.getTime());

// ─────────────────── โควตา (pure) ───────────────────
/** §2.2 — remaining ไม่ใช่ตัวเลข ⇒ false · ≤ 0 ⇒ true · limit > 0 ⇒ remaining*100 ≤ limit*percent (เท่ากับเกณฑ์ = ต่ำ) · ไม่มี limit ⇒ false */
export function quotaIsLow(q: { remaining?: number | null; limit?: number | null } | null | undefined, percent: number): boolean {
  if (!q || typeof q !== "object") return false;
  const remaining = num(q.remaining);
  if (remaining === null) return false;
  if (remaining <= 0) return true;
  const limit = num(q.limit);
  if (limit === null || limit <= 0) return false;
  const p = Number.isFinite(percent) ? percent : DEFAULT_PERCENT;
  return remaining * 100 <= limit * p;
}

function storedQuotaOf(v: unknown): StoredIntegrationQuota | null {
  if (!isRecord(v)) return null;
  return {
    remaining: num(v.remaining),
    limit: num(v.limit),
    resetsAt: str(v.resetsAt),
    checkedAt: str(v.checkedAt) ?? "",
    lowAlertedAt: str(v.lowAlertedAt),
  };
}

function quotaViewOf(v: unknown, percent: number): IntegrationQuotaView | null {
  const q = storedQuotaOf(v);
  if (!q) return null;
  return {
    remaining: q.remaining,
    limit: q.limit,
    percent: q.limit !== null && q.limit > 0 && q.remaining !== null ? Math.round((q.remaining * 100) / q.limit) : null,
    low: quotaIsLow(q, percent),
    checkedAt: q.checkedAt || null,
    resetsAt: q.resetsAt,
  };
}

// ─────────────────── ค่าตั้ง #83 (อ่านนอก tx เสมอ) ───────────────────
type ThresholdCache = Map<string, Promise<number>>;

/** หน่วยอ้างอิงของแถว = unitIds[0] หรือ BusinessUnit แรกของร้าน (createdAt) · ไม่มีหน่วย/อ่านไม่ได้ = 10 */
async function thresholdFor(tenantId: string, unitIds: readonly string[], cache?: ThresholdCache): Promise<number> {
  const key = `${tenantId}|${unitIds[0] ?? ""}`;
  const hit = cache?.get(key);
  if (hit) return hit;
  const p = (async () => {
    try {
      let unitId: string | null = unitIds[0] ?? null;
      if (!unitId) {
        const u = await prisma.businessUnit.findFirst({ where: { tenantId }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { id: true } });
        unitId = u?.id ?? null;
      }
      if (!unitId) return DEFAULT_PERCENT;
      const r = await resolveSetting({ tenantId }, INTEGRATION_QUOTA_ALERT_KEY, { unitId });
      const v = r?.value;
      return typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 99 ? v : DEFAULT_PERCENT;
    } catch (e) {
      console.error("[integrations] health threshold", errName(e));
      return DEFAULT_PERCENT;
    }
  })();
  cache?.set(key, p);
  return p;
}

// ─────────────────── ธุรกรรม + ลองใหม่เมื่อ deadlock ───────────────────
type Tx = Prisma.TransactionClient;
const BUSY = Symbol("integration-health-busy");

function isRetryable(e: unknown): boolean {
  if (!isRecord(e) && !(e instanceof Error)) return false;
  const code = isRecord(e) ? e.code : undefined;
  if (code === "P2034" || code === "P2028") return true;
  let text = "";
  try {
    text = `${e instanceof Error ? e.message : ""} ${JSON.stringify(isRecord(e) ? e.meta ?? null : null)}`;
  } catch {
    text = e instanceof Error ? e.message : "";
  }
  return /40P01|deadlock detected/i.test(text);
}

/** tx เดียว · 40P01/P2034/P2028 ⇒ ลองใหม่ 1 ครั้ง ⇒ BUSY */
async function inTx<T>(fn: (tx: Tx) => Promise<T>): Promise<T | typeof BUSY> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await prisma.$transaction(fn, TX_OPTS);
    } catch (e) {
      if (!isRetryable(e)) throw e;
    }
  }
  return BUSY;
}

async function ownerIds(tx: Tx, tenantId: string): Promise<string[]> {
  const ms = await tx.membership.findMany({ where: { tenantId, role: "OWNER", acceptedAt: { not: null } }, select: { userId: true }, orderBy: { userId: "asc" } });
  return [...new Set(ms.map((m) => m.userId))];
}

async function notifyOwners(tx: Tx, tenantId: string, title: string, body: string): Promise<number> {
  const ids = await ownerIds(tx, tenantId);
  if (!ids.length) return 0;
  const r = await tx.appNotification.createMany({ data: ids.map((recipientUserId) => ({ tenantId, recipientUserId, title, body })) });
  return r.count;
}

// ─────────────────── ข้อความ (ไทย · ไม่มีค่าลับ/รหัสอังกฤษ/ข้อความดิบของผู้ให้บริการ) ───────────────────
const kindLabel = (kind: string): string => (kind in INTEGRATION_KIND_META ? INTEGRATION_KIND_META[kind as StoredIntegrationKind].label : "ตัวเชื่อม");
const unitText = (unitIds: readonly string[]) => (unitIds.length ? `ใช้กับ ${unitIds.length} หน่วย` : "ใช้กับทุกหน่วย");
const WHERE_TO_FIX = "ตรวจคีย์/บัญชีกับผู้ให้บริการ แล้วกดทดสอบที่ ตั้งค่า › ศูนย์เชื่อมต่อ";

function failedText(row: { label: string; kind: string; unitIds: string[]; onFailure: string }): { title: string; body: string } {
  const fallback: IntegrationOnFailure = asIntegrationOnFailure(row.onFailure);
  const during = fallback === "REJECT" ? "ระบบปฏิเสธรายการที่ต้องใช้ตัวเชื่อมนี้" : "ระบบส่งรายการเข้าคิวตรวจมือแทน";
  return {
    title: `ตัวเชื่อม «${row.label}» ขัดข้อง`,
    body: `${kindLabel(row.kind)} เรียกผู้ให้บริการไม่สำเร็จติดกัน ${INTEGRATION_FAILURE_THRESHOLD} ครั้ง (${unitText(row.unitIds)}) — ระหว่างนี้${during} · ${WHERE_TO_FIX}`,
  };
}

function quotaText(row: { label: string; kind: string }, q: { remaining: number | null; limit: number | null }, percent: number): { title: string; body: string } {
  const remaining = q.remaining ?? 0;
  const left = remaining <= 0 ? "โควตาหมดแล้ว" : `เหลือ ${remaining}${q.limit !== null && q.limit > 0 ? ` จาก ${q.limit}` : ""}`;
  return {
    title: `โควตาตัวเชื่อม «${row.label}» ใกล้หมด`,
    body: `${kindLabel(row.kind)} ${left} (เกณฑ์เตือน ${percent}%) — เติมแพ็กเกจที่ผู้ให้บริการก่อนหมด ไม่งั้นระบบจะทำแบบมือแทน · ดูที่ ตั้งค่า › ศูนย์เชื่อมต่อ`,
  };
}

// ─────────────────── 1) เตือน ERROR (consumer integration.failed) ───────────────────
type FailedEvt = { id: string; tenantId: string; integrationId: string };

function parseFailedEvent(evt: unknown): FailedEvt | null {
  if (!isRecord(evt) || !isId(evt.id) || !isId(evt.tenantId)) return null;
  if (evt.type !== undefined && evt.type !== "integration.failed") return null;
  const p = evt.payload;
  if (!isRecord(p) || !isId(p.integrationId)) return null;
  return { id: evt.id, tenantId: evt.tenantId, integrationId: p.integrationId };
}

async function alertFailed(e: FailedEvt, now: Date): Promise<"ALERTED" | "SKIP" | typeof BUSY> {
  const r = await inTx(async (tx) => {
    const rows = await tx.$queryRaw<{ id: string; label: string; kind: string; status: string; unitIds: string[]; onFailure: string }[]>`
      SELECT "id", "label", "kind", "status", "unitIds", "onFailure" FROM "TenantIntegration"
      WHERE "id" = ${e.integrationId} AND "tenantId" = ${e.tenantId} FOR UPDATE`;
    const row = rows[0];
    // ฟื้นแล้ว (CONNECTED) · ถอดแล้ว · DRAFT · ไม่พบ/ข้ามร้าน ⇒ ไม่เตือน
    if (!row || row.status !== "ERROR") return "SKIP" as const;
    // event ต้องมีจริงในคิวของร้านนี้ (event ปลอม/ข้ามร้าน ⇒ ไม่เตือน)
    const ev = await tx.$queryRaw<{ createdAt: Date }[]>`
      SELECT "createdAt" FROM "OutboxEvent" WHERE "id" = ${e.id} AND "tenantId" = ${e.tenantId} AND "type" = 'integration.failed'
        AND "payload"->>'integrationId' = ${e.integrationId}`;
    if (!ev[0]) return "SKIP" as const;
    // ฟื้นหลัง event นี้แล้ว (แม้ตกใหม่ — เหตุใหม่มี event ของตัวเอง) ⇒ เหตุนี้จบแล้ว
    const recovered = await tx.$queryRaw<{ one: number }[]>`
      SELECT 1 AS one FROM "OutboxEvent" WHERE "tenantId" = ${e.tenantId} AND "type" = 'integration.connected'
        AND "payload"->>'integrationId' = ${e.integrationId} AND "createdAt" > ${ev[0].createdAt}::timestamp LIMIT 1`;
    if (recovered.length) return "SKIP" as const;
    // กันซ้ำต่อ event (ชน = มีคนเตือนไปแล้ว ⇒ จบเงียบ)
    const claimed = await tx.$queryRaw<{ id: string }[]>`
      INSERT INTO "OpsAlertState" ("id", "source", "lastAlertAt") VALUES (${randomUUID()}, ${`${ALERT_SOURCE_PREFIX}${e.id}`}, ${now}::timestamp)
      ON CONFLICT ("source") DO NOTHING RETURNING "id"`;
    if (!claimed.length) return "SKIP" as const;
    const t = failedText(row);
    await notifyOwners(tx, e.tenantId, t.title, t.body);
    return "ALERTED" as const;
  });
  return r;
}

/**
 * consumer ของ `integration.failed` — ไม่โยนกับข้อมูลผิดถาวร (payload ขยะ/ไม่พบแถว/ข้ามร้าน/ฟื้นแล้ว = จบเงียบ)
 * โยนเฉพาะเมื่อฐานแย่งล็อกจนลองซ้ำไม่ผ่าน (BUSY) — ให้คิวลองใหม่ภายหลัง (กันซ้ำด้วย OpsAlertState ⇒ ลองซ้ำปลอดภัย)
 */
export async function onIntegrationFailed(evt: { id: string; tenantId: string; type: string; payload: unknown }): Promise<void> {
  const e = parseFailedEvent(evt);
  if (!e) return;
  let r: Awaited<ReturnType<typeof alertFailed>>;
  try {
    r = await alertFailed(e, new Date());
  } catch (err) {
    console.error("[integrations] health alert", errName(err));
    throw new Error("integration alert failed — retry later");
  }
  if (r === BUSY) throw new Error("integration alert busy — retry later");
}

// ─────────────────── 2) งานรายชั่วโมง: อ่านโควตา + เตือน ───────────────────
type JobOpts = { tenantId?: string; maxRows?: number; deadline?: number; signal?: AbortSignal };

/** §2.4 — ไม่โยน · คืน checked = แถวที่เรียก quota() · alerted = แถวที่เกิดเหตุ QUOTA ใหม่ในรอบนี้ */
export async function runIntegrationHealthJob(now: Date, opts?: JobOpts): Promise<{ checked: number; alerted: number }> {
  let checked = 0;
  let alerted = 0;
  try {
    const at = validDate(now) ? now : new Date();
    const o = isRecord(opts) ? opts : {};
    const stop = () => o.signal?.aborted === true || (typeof o.deadline === "number" && Date.now() >= o.deadline);
    if (stop()) return { checked, alerted };
    if (o.tenantId !== undefined && !isId(o.tenantId)) return { checked, alerted };
    const maxRows = typeof o.maxRows === "number" && Number.isInteger(o.maxRows) && o.maxRows > 0 ? Math.min(o.maxRows, 1000) : DEFAULT_MAX_ROWS;
    const nowIso = at.toISOString();
    const dueIso = new Date(at.getTime() - INTEGRATION_QUOTA_CHECK_MINUTES * MIN_MS).toISOString();
    const tenantFilter = o.tenantId ? Prisma.sql`AND "tenantId" = ${o.tenantId}` : Prisma.empty;
    // ISO (toISOString) ความยาวคงที่ ⇒ เทียบเป็นข้อความ COLLATE "C" ได้ตรง · ไม่ cast (ค่าเพี้ยนไม่ทำให้ query ล้ม)
    const due = await prisma.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "TenantIntegration"
      WHERE "status" = 'CONNECTED' AND "kind" = ANY(${[...QUOTA_KINDS]}::text[]) ${tenantFilter}
        AND ("quota" IS NULL OR jsonb_typeof("quota"::jsonb) <> 'object' OR ("quota"::jsonb->>'checkedAt') IS NULL
             OR ("quota"::jsonb->>'checkedAt') COLLATE "C" <= ${dueIso} COLLATE "C")
      ORDER BY (CASE WHEN "quota" IS NULL OR jsonb_typeof("quota"::jsonb) <> 'object' OR ("quota"::jsonb->>'checkedAt') IS NULL THEN 0 ELSE 1 END),
        ("quota"::jsonb->>'checkedAt') COLLATE "C" ASC NULLS FIRST, "id" ASC
      LIMIT ${maxRows}`;
    const cache: ThresholdCache = new Map();
    for (const { id } of due) {
      if (stop()) break;
      try {
        const row = await prisma.tenantIntegration.findUnique({ where: { id } });
        if (!row || row.status !== "CONNECTED") continue;
        const percent = await thresholdFor(row.tenantId, row.unitIds, cache);
        const h = integrationHandleForRow(row) as IntegrationHandle<"SLIP_VERIFY"> | null;
        let read: { ok: true; remaining: number | null; limit: number | null; resetsAt: string | null } | { ok: false } = { ok: false };
        if (h && row.kind === "SLIP_VERIFY") {
          checked++;
          const r = await callIntegration(h, "quota", (a, ctl) => a.quota(ctl));
          if (r.ok) read = { ok: true, remaining: num(r.value?.remaining), limit: num(r.value?.limit), resetsAt: str(r.value?.resetsAt) };
        }
        const out = await inTx(async (tx) => {
          const cur = await tx.$queryRaw<{ status: string; quota: unknown; label: string; kind: string }[]>`
            SELECT "status", "quota", "label", "kind" FROM "TenantIntegration" WHERE "id" = ${row.id} AND "tenantId" = ${row.tenantId} FOR UPDATE`;
          const c = cur[0];
          if (!c || c.status !== "CONNECTED") return false;
          const prev = storedQuotaOf(c.quota);
          const next: StoredIntegrationQuota = {
            remaining: read.ok ? read.remaining : (prev?.remaining ?? null),
            limit: read.ok ? read.limit : (prev?.limit ?? null),
            resetsAt: read.ok ? read.resetsAt : (prev?.resetsAt ?? null),
            checkedAt: nowIso,
            lowAlertedAt: prev?.lowAlertedAt ?? null,
          };
          let fresh = false;
          if (read.ok) {
            const low = quotaIsLow(next, percent);
            if (!low) next.lowAlertedAt = null;
            else if (!next.lowAlertedAt) {
              next.lowAlertedAt = nowIso;
              fresh = true;
            }
          }
          await tx.tenantIntegration.update({ where: { id: row.id }, data: { quota: next as unknown as Prisma.InputJsonObject } });
          if (fresh) {
            const t = quotaText(c, next, percent);
            await notifyOwners(tx, row.tenantId, t.title, t.body);
          }
          return fresh;
        });
        if (out === true) alerted++;
      } catch (e) {
        console.error("[integrations] health row", errName(e));
      }
    }
  } catch (e) {
    console.error("[integrations] health job", errName(e));
  }
  return { checked, alerted };
}

// ─────────────────── 3) มุมมองสุขภาพ ───────────────────
const NO_ACCESS = "สุขภาพการเชื่อมต่อเปิดดูได้เฉพาะเจ้าของร้าน ผู้จัดการ หรือผู้ที่ได้รับสิทธิ์จัดการศูนย์เชื่อมต่อ";

type Access = { c: IntegrationCtx; a: IntegrationActor } | { refused: ReturnType<typeof integrationRefuse> };

function access(ctx: unknown, actor: unknown): Access {
  const c = integrationCtxOf(ctx);
  if (!c) return { refused: integrationRefuse("NOT_FOUND") };
  const a = integrationActorOf(actor);
  if (!a) return { refused: integrationRefuse("PERMISSION_DENIED", NO_ACCESS) };
  if (!canManageIntegrations(a) && a.role !== "MANAGER") return { refused: integrationRefuse("PERMISSION_DENIED", NO_ACCESS) };
  return { c, a };
}

/** ผู้จำกัดหน่วยเห็นแถวทุกหน่วย + แถวที่แตะหน่วยตน (กติกาเดียวกับ listIntegrations) */
const visibleTo = (a: IntegrationActor, unitIds: readonly string[]) => !integrationUnitLimited(a) || unitIds.length === 0 || unitIds.some((u) => a.unitAccess.includes(u));

function dayKeys(now: Date): string[] {
  return Array.from({ length: INTEGRATION_HEALTH_DAYS }, (_, i) => bkkYmd(new Date(now.getTime() - (INTEGRATION_HEALTH_DAYS - 1 - i) * DAY_MS)));
}

/** recent + daily ของหลายแถวใน 2 query — นับเฉพาะ log ที่ tenantId ตรงกับแถว (log ปลอม/ข้ามร้านไม่นับ) */
async function callStats(tenantId: string, ids: string[], now: Date): Promise<{ recent: Map<string, IntegrationHealthCall[]>; daily: Map<string, IntegrationHealthDay[]> }> {
  const recent = new Map<string, IntegrationHealthCall[]>();
  const daily = new Map<string, IntegrationHealthDay[]>();
  const days = dayKeys(now);
  for (const id of ids) {
    recent.set(id, []);
    daily.set(id, days.map((day) => ({ day, ok: 0, fail: 0, avgMs: null })));
  }
  if (!ids.length) return { recent, daily };
  const since = bkkDayStart(new Date(now.getTime() - (INTEGRATION_HEALTH_DAYS - 1) * DAY_MS));
  const [rec, agg] = await Promise.all([
    prisma.$queryRaw<{ integrationId: string; op: string; ok: boolean; ms: number; code: string | null; at: Date }[]>`
      SELECT "integrationId", "op", "ok", "ms", "code", "at" FROM (
        SELECT "integrationId", "op", "ok", "ms", "code", "at",
               ROW_NUMBER() OVER (PARTITION BY "integrationId" ORDER BY "at" DESC, "id" DESC) AS rn
        FROM "IntegrationCallLog" WHERE "tenantId" = ${tenantId} AND "integrationId" = ANY(${ids}::text[])
      ) x WHERE rn <= ${INTEGRATION_HEALTH_RECENT} ORDER BY "integrationId", rn`,
    prisma.$queryRaw<{ integrationId: string; day: string; ok: number; fail: number; sumMs: bigint | number; n: number }[]>`
      SELECT "integrationId", to_char("at" + interval '7 hours', 'YYYY-MM-DD') AS day,
             (count(*) FILTER (WHERE "ok"))::int AS ok, (count(*) FILTER (WHERE NOT "ok"))::int AS fail,
             COALESCE(sum("ms"), 0)::bigint AS "sumMs", count(*)::int AS n
      FROM "IntegrationCallLog"
      WHERE "tenantId" = ${tenantId} AND "integrationId" = ANY(${ids}::text[]) AND "at" >= ${since}::timestamp
      GROUP BY 1, 2`,
  ]);
  for (const r of rec) {
    const code: CallCode | null = r.code === null ? null : CALL_CODES.has(r.code) ? (r.code as CallCode) : r.ok ? null : "PROVIDER_ERROR";
    recent.get(r.integrationId)?.push({ op: r.op, ok: r.ok, ms: Number(r.ms), code, at: new Date(r.at).toISOString() });
  }
  for (const g of agg) {
    const d = daily.get(g.integrationId)?.find((x) => x.day === g.day);
    if (!d) continue;
    const n = Number(g.n);
    d.ok = Number(g.ok);
    d.fail = Number(g.fail);
    d.avgMs = n > 0 ? Math.round(Number(g.sumMs) / n) : null;
  }
  return { recent, daily };
}

async function viewsOf(rows: TenantIntegration[], now: Date, cache: ThresholdCache): Promise<IntegrationHealthView[]> {
  if (!rows.length) return [];
  const { recent, daily } = await callStats(rows[0].tenantId, rows.map((r) => r.id), now);
  const out: IntegrationHealthView[] = [];
  for (const r of rows) {
    const percent = await thresholdFor(r.tenantId, r.unitIds, cache);
    out.push({
      id: r.id,
      kind: r.kind as StoredIntegrationKind,
      provider: r.provider,
      label: r.label,
      status: asIntegrationStatus(r.status),
      onFailure: asIntegrationOnFailure(r.onFailure),
      unitIds: [...r.unitIds],
      quota: quotaViewOf(r.quota, percent),
      recent: recent.get(r.id) ?? [],
      daily: daily.get(r.id) ?? [],
    });
  }
  return out;
}

/** สุขภาพของแถวเดียว — id ร้านอื่น/ไม่มี/รูปผิด/มองไม่เห็น ⇒ NOT_FOUND ผลเดียวกัน · ไม่โยน */
export async function getIntegrationHealth(ctx: IntegrationCtx, actor: IntegrationActor, input: { id: string; now?: Date }): Promise<IntegrationHealthResult> {
  try {
    const g = access(ctx, actor);
    if ("refused" in g) return g.refused;
    const id = isRecord(input) ? input.id : undefined;
    if (!isId(id)) return integrationRefuse("NOT_FOUND");
    const now = isRecord(input) && validDate(input.now) ? input.now : new Date();
    const row = await prisma.tenantIntegration.findFirst({ where: { id, tenantId: g.c.tenantId } });
    if (!row || !visibleTo(g.a, row.unitIds)) return integrationRefuse("NOT_FOUND");
    const cache: ThresholdCache = new Map();
    const [health] = await viewsOf([row], now, cache);
    return { ok: true, thresholdPercent: await thresholdFor(g.c.tenantId, [], cache), health };
  } catch (e) {
    console.error("[integrations] health get", errName(e));
    return integrationRefuse("UNKNOWN");
  }
}

/** สุขภาพทุกแถวเก็บที่มองเห็น (ไม่มีชนิดเสมือน) — ไม่โยน */
export async function listIntegrationHealth(ctx: IntegrationCtx, actor: IntegrationActor, opts?: { now?: Date }): Promise<IntegrationHealthListResult> {
  try {
    const g = access(ctx, actor);
    if ("refused" in g) return g.refused;
    const now = isRecord(opts) && validDate(opts.now) ? opts.now : new Date();
    const rows = await prisma.tenantIntegration.findMany({ where: { tenantId: g.c.tenantId }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
    const cache: ThresholdCache = new Map();
    const items = await viewsOf(rows.filter((r) => visibleTo(g.a, r.unitIds)), now, cache);
    return { ok: true, thresholdPercent: await thresholdFor(g.c.tenantId, [], cache), items };
  } catch (e) {
    console.error("[integrations] health list", errName(e));
    return integrationRefuse("UNKNOWN");
  }
}
