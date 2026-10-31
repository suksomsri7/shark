// SVC B.13 — ทรัพยากรของร้านนวด (ห้อง · เตียง · โซฟา · อุปกรณ์) · ใบสั่ง ledger/svc-briefs/svc-brief-b.13.md §3.3 §4 §5
//
//   CRUD (listResources · createResource · updateResource · setResourceMaintenance) — ไม่มีการลบจริง (ปิดใช้แทน)
//   walkInNowByService — กล่อง "รับ walk-in ตอนนี้ได้ไหม" (ภาพ 02 · อ่านอย่างเดียว ไม่ล็อก ไม่เขียน)
//   ตัวช่วยใน tx ให้ทางจอง/แถวเดียว/ตัววางคิวใช้ร่วม: ล็อกทรัพยากรทั้งสาขา · อ่านทรัพยากร/ปิดซ่อม/แถวที่ถือ · ประกอบด่าน (ResBook)
//
// 🔴 ด่าน "ว่างไหม" = planner-resources.ts สูตรเดียว (ใช้ร่วมกับตัววางคิว) — ไฟล์นี้แค่อ่านฐานแล้วป้อน
// 🔴 ลำดับล็อกทั้งระบบ (§5): idem → เบอร์ → advisory สาขา → BookingStaff → SvcResource ทั้งสาขา (เรียงตาม id · มติ Q7 — คงที่แม้แก้ sortOrder) → แถว Appointment
//    CRUD ล็อกแถวทรัพยากรแถวเดียว (ไม่ถือล็อกหมอ/ทรัพยากรอื่น) แล้วอ่านแถวนัดแบบไม่ล็อก — ทางจองถือล็อกแถวเดียวกันก่อน insert ⇒ ลำดับเข้ากันได้
// 🔴 ไม่มี connection ที่สองใต้ล็อก: ค่าตั้ง (ชนิดของบริการ) อ่านก่อน tx · ทรัพยากร/ปิดซ่อม/แถวที่ถือ อ่านใน tx ผ่าน tx หลังล็อก
// 🔴 ขอบเขต (X1): ทุกคิวรีผูก tenantId + unitId ของ ctx · ไม่พบ/ข้ามร้าน/ข้ามหน่วย ⇒ NOT_FOUND ข้อความเดียว · ไม่ import prisma ดิบ (F5)
import type { Prisma } from "@prisma/client";
import { tenantDb } from "@/lib/core/db";
import { resolveSettings, resolveSettingsMany } from "@/lib/core/settings";
import { canBookingAction } from "./access";
import { OPEN_END, ResBook, type GateResource } from "./planner-resources";
import { isResourceKind, kindsFromSetting, RESOURCE_KIND_LABELS_TH, type ResourceKind } from "./resource-kinds";

const MIN_MS = 60_000;
const DAY_MS = 24 * 60 * MIN_MS;

// ───────────────────────── สัญญา (§3.3) ─────────────────────────

export type ResourceCtx = { tenantId: string; unitId: string; actorUserId?: string };
export type ResourceActor = { role: "OWNER" | "MANAGER" | "STAFF"; unitAccess: string[]; permissions: Record<string, unknown>; userId: string };
export type MaintenanceWindow = { startAt: string; endAt: string | null; note?: string };
export type ResourceRow = {
  id: string;
  kind: string;
  name: string;
  capacity: number;
  cleanupMin: number;
  active: boolean;
  sortOrder: number;
  maintenance: MaintenanceWindow[];
  underMaintenanceNow: boolean;
};
export type ResourceFail = "NOT_FOUND" | "BAD_INPUT" | "DUPLICATE" | "IN_USE" | "FORBIDDEN" | "BUSY";
export type ResourceResult = { ok: true; resource: ResourceRow } | { ok: false; code: ResourceFail; reason: string };
export type ResourceInput = { kind: string; name: string; capacity?: number; cleanupMin?: number; sortOrder?: number };
export type ResourcePatch = Partial<{ kind: string; name: string; capacity: number; cleanupMin: number; sortOrder: number; active: boolean }>;
export type WalkInLimitedBy = "NONE" | "STAFF" | "RESOURCE" | "BOTH";
export type WalkInNowRow = {
  serviceId: string;
  serviceName: string;
  closed: boolean;
  startAt: Date | null;
  staffId: string | null;
  resourceIds: string[];
  limitedBy: WalkInLimitedBy;
  reasonTh: string;
};

const R = {
  NOT_FOUND: "ไม่พบทรัพยากรนี้", // X1: ข้อความเดียวทุกกรณีที่หาแถวไม่เจอ/ข้ามร้าน/ข้ามหน่วย
  FORBIDDEN: "คุณยังไม่มีสิทธิ์แก้ทรัพยากรของสาขานี้ — ขอสิทธิ์จากเจ้าของร้าน",
  DUPLICATE: "มีทรัพยากรชื่อนี้ในสาขาแล้ว — ตั้งชื่ออื่น",
  BUSY: "ระบบกำลังยุ่ง กรุณาลองใหม่",
  KIND: "เลือกชนิดทรัพยากรจากรายการ",
  NAME: "ชื่อทรัพยากรยาว 1–60 ตัวอักษร",
  CAPACITY: "รับได้ (คน) ต้องเป็นจำนวนเต็ม 1–20",
  CLEANUP: "เวลาเก็บ/เตรียมต้องเป็นจำนวนเต็ม 0–240 นาที",
  SORT: "ลำดับต้องเป็นจำนวนเต็ม",
  ACTIVE: "สถานะใช้งานต้องเป็นใช่หรือไม่",
  MAINT: "ช่วงปิดซ่อมไม่ถูกต้อง (ไม่เกิน 20 ช่วง · วันเวลาถูกรูปแบบ · ปลายหลังต้น · หมายเหตุไม่เกิน 100 ตัวอักษร)",
} as const;

const inUseReason = (n: number, what: string) => `${what}ไม่ได้ — มีนัด ${n} นัดที่ใช้ทรัพยากรนี้อยู่ กรุณาย้ายนัดก่อน`;

// ───────────────────────── ตัวช่วยฐาน (ใช้ร่วม · ใน tx) ─────────────────────────

/** client ที่อ่าน raw ได้ (tx หรือ client ภายนอก tx) */
export type RawReader = Pick<Prisma.TransactionClient, "$queryRaw">;
export type ResRowLite = { id: string; kind: string; name: string; capacity: number; cleanupMin: number; active: boolean; sortOrder: number; createdAt: Date };
export type BlockRow = { id: string; resourceId: string; startAt: Date; endAt: Date | null; reason: string | null };
/** แถวนัดที่ถือทรัพยากร — s..e = ช่วงบริการ (ยังไม่บวกเวลาเก็บ) ตาม §4.6 (มติ Q1/Q2) */
export type HoldRow = { id: string; ids: string[]; s: number; e: number; status: string; kind: string };

export const RESOURCE_KINDS_KEY = "booking.service.resourceKinds";

/** Q11 ▸ นาทีที่ยืดงานเลยเวลา (booking.queue.overrunExtendMin ของสาขา · อ่านก่อน tx เสมอ) — ด่านฐานใช้ค่าเดียวกับตัววางคิว */
export async function overrunMinOf(ctx: { tenantId: string; unitId: string }): Promise<number> {
  const r = await resolveSettings({ tenantId: ctx.tenantId }, ["booking.queue.overrunExtendMin"], { unitId: ctx.unitId });
  const v = r["booking.queue.overrunExtendMin"]?.value;
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : 0;
}

/** ชนิดที่บริการต้องใช้ (ค่าตั้ง · อ่านก่อน tx เสมอ) — serviceId → ชนิด ([] = ไม่ใช้ทรัพยากร · พฤติกรรมเดิม) */
export async function resourceKindsOf(ctx: { tenantId: string; unitId: string }, serviceIds: readonly string[]): Promise<Map<string, ResourceKind[]>> {
  const ids = [...new Set(serviceIds.filter((x) => typeof x === "string" && x))];
  const out = new Map<string, ResourceKind[]>();
  if (!ids.length) return out;
  const res = await resolveSettingsMany({ tenantId: ctx.tenantId }, [RESOURCE_KINDS_KEY], ids.map((serviceId) => ({ unitId: ctx.unitId, serviceId })));
  ids.forEach((id, i) => out.set(id, kindsFromSetting(res[i]?.[RESOURCE_KINDS_KEY]?.value)));
  return out;
}

/**
 * ล็อกทรัพยากรทุกชิ้นของสาขา (รวมที่ปิดใช้) ตามลำดับ id (มติ Q7: คงที่ — sortOrder แก้ได้ระหว่างมีการจอง ⇒ ลำดับกลับด้านได้) —
 * เรียกหลังล็อก BookingStaff เสมอ · ห้ามเรียกหลังล็อกแถวนัด (§5) · คืนเรียงตามลำดับเลือกชิ้น (sortOrder, createdAt, id)
 */
export async function lockUnitResourcesTx(tx: RawReader, tenantId: string, unitId: string): Promise<ResRowLite[]> {
  const rows = await tx.$queryRaw<ResRowLite[]>`
    SELECT "id", "kind", "name", "capacity", "cleanupMin", "active", "sortOrder", "createdAt"
    FROM "SvcResource" WHERE "tenantId" = ${tenantId} AND "unitId" = ${unitId}
    ORDER BY id FOR UPDATE`;
  return sortForPick(rows);
}

/** ลำดับเลือกชิ้น (sortOrder, createdAt, id) — คนละเรื่องกับลำดับล็อก */
function sortForPick(rows: readonly ResRowLite[]): ResRowLite[] {
  return [...rows].sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.getTime() - b.createdAt.getTime() || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** อ่านทรัพยากรของสาขาแบบไม่ล็อก (หาเวลา/มุมมอง · ลำดับเดียวกับล็อก) */
export async function readUnitResources(client: RawReader, tenantId: string, unitId: string): Promise<ResRowLite[]> {
  return client.$queryRaw<ResRowLite[]>`
    SELECT "id", "kind", "name", "capacity", "cleanupMin", "active", "sortOrder", "createdAt"
    FROM "SvcResource" WHERE "tenantId" = ${tenantId} AND "unitId" = ${unitId}
    ORDER BY "sortOrder", "createdAt", "id"`;
}

/** ช่วงปิดซ่อมของสาขาที่ทับ [from, to) */
export async function readUnitBlocks(client: RawReader, tenantId: string, unitId: string, from: Date, to: Date): Promise<BlockRow[]> {
  return client.$queryRaw<BlockRow[]>`
    SELECT "id", "resourceId", "startAt", "endAt", "reason" FROM "SvcResourceBlock"
    WHERE "tenantId" = ${tenantId} AND "unitId" = ${unitId}
      AND "startAt" < ${to} AND ("endAt" IS NULL OR "endAt" > ${from})
    ORDER BY "startAt", "id"`;
}

type RawHold = {
  id: string; status: string; kind: string; startAt: Date; checkedInAt: Date | null; queueTicketId: string | null; endAt: Date; plannedStartAt: Date | null; startedAt: Date | null;
  resourceId: string | null; job: unknown; bufferMin: number | null;
};
const isRec = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const numOr = (v: unknown, d: number | null): number | null => (typeof v === "number" && Number.isFinite(v) ? v : d);

/** ชิ้นที่แถวนัดถือ (§4.6): policySnapshot.job.resourceIds ?? [resourceId] ?? [] */
export function resourceIdsOfRow(resourceId: string | null, snap: unknown): string[] {
  const job = isRec(snap) && isRec(snap.job) ? snap.job : null;
  const ids = job?.resourceIds;
  if (Array.isArray(ids) && ids.every((x) => typeof x === "string")) return ids as string[];
  return resourceId ? [resourceId] : [];
}

/** policySnapshot + job.resourceIds (+ คีย์ job อื่นที่ส่งมา) — คีย์อื่นคงเดิม (additive แบบ B.4 J4/J6) */
export function snapWithResources(snap: unknown, ids: readonly string[], job?: Record<string, unknown>): Prisma.InputJsonValue {
  const base = isRec(snap) ? snap : {};
  const j = isRec(base.job) ? base.job : {};
  return { ...base, job: { ...j, ...(job ?? {}), resourceIds: [...ids] } } as unknown as Prisma.InputJsonValue;
}

/**
 * แถวนัดของสาขาที่ถือทรัพยากรและซ้อน [from, to) — §4.6 ตามมติ Q1/Q2 (นิยามเดียวกับตัววางคิว):
 *   สถานะถือช่อง = ไม่ใช่ CANCELLED/NO_SHOW/DONE · นาที = job.durationMin ?? endAt − startAt − (job.bufferMin ?? buffer ของบริการ)
 *   เริ่ม = IN_SERVICE: startedAt · อื่น: plannedStartAt (แผนของตัววางคิว) ?? startAt · ปลาย = เริ่ม + นาที (ไม่ยืดถึง now · J5)
 *   ARRIVED/IN_SERVICE ข้ามวัน: เห็นเท่าที่ jobRowsOf เห็น (เวลานัดไม่ก่อนวันก่อนหน้า)
 *   resourceId = แถวที่ถือชิ้นนี้เท่านั้น (ไม่ส่ง = ทุกชิ้น)
 */
export async function readHolds(
  client: RawReader,
  tenantId: string,
  unitId: string,
  o: { from: Date; to: Date; nowMs: number; resourceId?: string; overrunMin?: number },
): Promise<HoldRow[]> {
  const rid = o.resourceId ?? null;
  const rows = await client.$queryRaw<RawHold[]>`
    SELECT a."id", a."status"::text AS "status", a."kind"::text AS "kind", a."startAt", a."endAt", a."plannedStartAt", a."startedAt", a."resourceId",
           a."checkedInAt", a."queueTicketId",
           a."policySnapshot" -> 'job' AS "job", s."bufferMin"
    FROM "Appointment" a
    LEFT JOIN "BookingService" s ON s."id" = a."serviceId"
    WHERE a."tenantId" = ${tenantId} AND a."unitId" = ${unitId}
      AND a."status" NOT IN ('CANCELLED', 'NO_SHOW', 'DONE')
      AND (a."resourceId" IS NOT NULL OR jsonb_typeof(a."policySnapshot" -> 'job' -> 'resourceIds') = 'array')
      AND (${rid}::text IS NULL OR a."resourceId" = ${rid}
           OR (jsonb_typeof(a."policySnapshot" -> 'job' -> 'resourceIds') = 'array' AND jsonb_exists(a."policySnapshot" -> 'job' -> 'resourceIds', ${rid}::text)))
      AND LEAST(a."startAt", COALESCE(a."plannedStartAt", a."startAt"), COALESCE(a."startedAt", a."startAt")) < ${o.to}
      AND a."startAt" >= ${new Date(o.from.getTime() - DAY_MS)}
    ORDER BY a."startAt", a."id"`;
  const out: HoldRow[] = [];
  for (const r of rows) {
    const ids = resourceIdsOfRow(r.resourceId, isRec(r.job) ? { job: r.job } : null);
    if (!ids.length) continue;
    const job = isRec(r.job) ? r.job : {};
    const start = r.startAt.getTime();
    const buf = numOr(job.bufferMin, numOr(r.bufferMin, 0)) ?? 0;
    const dur = numOr(job.durationMin, null) !== null ? (job.durationMin as number) * MIN_MS : Math.max(0, r.endAt.getTime() - start - buf * MIN_MS);
    // Q14 (มติทาง 1): แถวที่เข้าแถวใหม่ (มาถึงหลังเวลานัด · มีบัตรคิวแถวเดียว) ที่ตัววางคิววางไม่ได้ (ไม่มี plannedStartAt) ⇒ ไม่นับ —
    //   นิยามเดียวกับตัววางคิว · การเริ่มงานจริงยังผ่านด่าน startJob (Q9)
    if (r.status === "ARRIVED" && !r.plannedStartAt && r.queueTicketId && r.checkedInAt && r.checkedInAt.getTime() > r.startAt.getTime()) continue;
    const s = r.status === "IN_SERVICE" ? (r.startedAt ?? r.plannedStartAt ?? r.startAt).getTime() : (r.plannedStartAt ?? r.startAt).getTime();
    // Q11: งานกำลังทำที่เลยเวลา ⇒ ถือถึง now + overrunExtendMin (กติกาเดียวกับตัววางคิว PL-11) · ยังไม่เลย ⇒ เริ่ม + นาที
    const e = r.status === "IN_SERVICE" && s + dur <= o.nowMs ? o.nowMs + (o.overrunMin ?? 0) * MIN_MS : s + dur;
    void start;
    if (e <= o.from.getTime() || s >= o.to.getTime()) continue;
    out.push({ id: r.id, ids, s, e, status: r.status, kind: r.kind });
  }
  return out;
}

/** ทรัพยากร (active) + ปิดซ่อม → รูปของด่าน (rank = ลำดับจากฐาน) */
export function gateResources(rows: readonly ResRowLite[], blocks: readonly BlockRow[]): GateResource[] {
  return sortForPick(rows)
    .map((r, rank) => ({ r, rank }))
    .filter((x) => x.r.active)
    .map(({ r, rank }) => ({
      id: r.id,
      kind: r.kind,
      sortOrder: r.sortOrder,
      capacity: r.capacity,
      cleanupMin: r.cleanupMin,
      rank,
      blocks: blocks.filter((b) => b.resourceId === r.id).map((b) => ({ startAt: b.startAt.getTime(), endAt: b.endAt ? b.endAt.getTime() : OPEN_END })),
    }));
}

/** ด่านพร้อมใช้: ทรัพยากร + ปิดซ่อม + แถวที่ถือ (ไม่นับ exclude = นัดที่กำลังย้าย/ปลุก/เริ่มตัวเอง) */
export function gateBook(rows: readonly ResRowLite[], blocks: readonly BlockRow[], holds: readonly HoldRow[], exclude?: ReadonlySet<string>, skipQueuedWalkIns = false): ResBook {
  const book = new ResBook(gateResources(rows, blocks));
  for (const h of holds) {
    if (exclude?.has(h.id)) continue;
    if (skipQueuedWalkIns && h.kind === "WALKIN" && h.status === "QUEUED") continue; // Q2: walk-in ที่ยังรอ = ตัววางคิวย้ายให้ (แบบ J3)
    for (const id of h.ids) book.add(id, h.id, h.s, h.e);
  }
  return book;
}

/** ช่วงอ่านรอบวันไทย (±1 วัน · ครอบงานข้ามเที่ยงคืน) */
export function dayWindow(startMs: number, endMs: number): { from: Date; to: Date } {
  return { from: new Date(startMs - DAY_MS), to: new Date(endMs + DAY_MS) };
}

/**
 * ด่านใน tx (หลังล็อกหมอ): ล็อกทรัพยากรทั้งสาขา → อ่านปิดซ่อม + แถวที่ถือผ่าน tx → ResBook
 * lock=false = อ่านอย่างเดียว (หาเวลา/ตรวจล่วงหน้า)
 */
export async function loadGate(
  client: RawReader,
  tenantId: string,
  unitId: string,
  o: { lock: boolean; startMs: number; endMs: number; nowMs: number; overrunMin: number; exclude?: readonly string[]; skipQueuedWalkIns?: boolean },
): Promise<ResBook> {
  const rows = o.lock ? await lockUnitResourcesTx(client, tenantId, unitId) : await readUnitResources(client, tenantId, unitId);
  const w = dayWindow(o.startMs, o.endMs);
  const blocks = await readUnitBlocks(client, tenantId, unitId, w.from, w.to);
  const holds = await readHolds(client, tenantId, unitId, { from: w.from, to: w.to, nowMs: o.nowMs, overrunMin: o.overrunMin });
  return gateBook(rows, blocks, holds, new Set(o.exclude ?? []), o.skipQueuedWalkIns === true);
}

/** ชนิดที่ทางย้ายนัดต้องตรวจ (Q6) = ชนิดที่บริการประกาศ ∪ ชนิดของชิ้นที่แถวถืออยู่ (ลำดับ: ประกาศก่อน) */
export function needKinds(kinds: readonly string[], held: readonly string[], book: ResBook): string[] {
  const out = [...kinds];
  for (const id of held) {
    const k = book.get(id)?.kind;
    if (k && !out.includes(k)) out.push(k);
  }
  return out;
}

/** ข้อผิดพลาดชั่วคราวของฐาน (deadlock · serialization · หมดเวลา tx) */
export function isBusyDbError(e: unknown): boolean {
  const o = e as { code?: unknown; meta?: { code?: unknown }; message?: unknown } | null;
  if (!o) return false;
  if (o.code === "P2034" || o.code === "P2028" || o.code === "40P01" || o.code === "40001") return true;
  if (o.meta?.code === "40P01" || o.meta?.code === "40001") return true;
  return typeof o.message === "string" && /40P01|40001|deadlock detected|could not serialize/i.test(o.message);
}
const isP2002 = (e: unknown): boolean => (e as { code?: string } | null)?.code === "P2002";

// ───────────────────────── CRUD ─────────────────────────

const RES_TX = { maxWait: 20_000, timeout: 30_000 } as const;
const okCtx = (ctx: ResourceCtx | null | undefined): ctx is ResourceCtx =>
  !!ctx && typeof ctx.tenantId === "string" && !!ctx.tenantId && typeof ctx.unitId === "string" && !!ctx.unitId;
const fail = (code: ResourceFail, reason: string): ResourceResult => ({ ok: false, code, reason });
const membership = (a: ResourceActor | null | undefined) =>
  a && typeof a === "object" ? { role: a.role, unitAccess: Array.isArray(a.unitAccess) ? a.unitAccess : [], permissions: isRec(a.permissions) ? a.permissions : {} } : null;
const allowed = (a: ResourceActor, unitId: string, action: string) => canBookingAction(membership(a), unitId, action);
const isInt = (v: unknown, lo: number, hi: number): v is number => typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi;

function rowOf(r: ResRowLite, blocks: readonly BlockRow[], nowMs: number): ResourceRow {
  const mine = blocks.filter((b) => b.resourceId === r.id);
  return {
    id: r.id,
    kind: r.kind,
    name: r.name,
    capacity: r.capacity,
    cleanupMin: r.cleanupMin,
    active: r.active,
    sortOrder: r.sortOrder,
    maintenance: mine.map((b) => ({ startAt: b.startAt.toISOString(), endAt: b.endAt ? b.endAt.toISOString() : null, ...(b.reason ? { note: b.reason } : {}) })),
    underMaintenanceNow: mine.some((b) => b.startAt.getTime() <= nowMs && (b.endAt === null || b.endAt.getTime() > nowMs)),
  };
}

const ALL_FROM = new Date(Date.UTC(2000, 0, 1));
const ALL_TO = new Date(Date.UTC(2200, 0, 1));
const nowOf = (o?: { now?: Date }) => (o?.now instanceof Date && !Number.isNaN(o.now.getTime()) ? o.now : new Date());

/** ทรัพยากรของหน่วยใน ctx (รวมที่ปิดใช้) · เรียง sortOrder, createdAt, id · ctx ไม่ตรงร้าน ⇒ [] */
export async function listResources(ctx: ResourceCtx, opts?: { now?: Date }): Promise<ResourceRow[]> {
  if (!okCtx(ctx)) return [];
  const db = tenantDb({ tenantId: ctx.tenantId, unitId: ctx.unitId });
  const rows = await readUnitResources(db, ctx.tenantId, ctx.unitId);
  if (!rows.length) return [];
  const blocks = await readUnitBlocks(db, ctx.tenantId, ctx.unitId, ALL_FROM, ALL_TO);
  const nowMs = nowOf(opts).getTime();
  return rows.map((r) => rowOf(r, blocks, nowMs));
}

type CleanInput = { kind: ResourceKind; name: string; capacity: number; cleanupMin: number; sortOrder: number };
function cleanInput(i: unknown): CleanInput | string {
  if (!isRec(i)) return R.KIND;
  if (!isResourceKind(i.kind)) return R.KIND;
  const name = typeof i.name === "string" ? i.name.trim() : "";
  if (name.length < 1 || name.length > 60) return R.NAME;
  const capacity = i.capacity === undefined ? 1 : i.capacity;
  if (!isInt(capacity, 1, 20)) return R.CAPACITY;
  const cleanupMin = i.cleanupMin === undefined ? 0 : i.cleanupMin;
  if (!isInt(cleanupMin, 0, 240)) return R.CLEANUP;
  const sortOrder = i.sortOrder === undefined ? 0 : i.sortOrder;
  if (!isInt(sortOrder, -1_000_000, 1_000_000)) return R.SORT;
  return { kind: i.kind, name, capacity, cleanupMin, sortOrder };
}

async function unitIsBooking(ctx: ResourceCtx): Promise<boolean> {
  const u = await tenantDb({ tenantId: ctx.tenantId }).businessUnit.findFirst({ where: { id: ctx.unitId, type: "BOOKING" }, select: { id: true } });
  return !!u;
}

/** ลำดับตรวจ: สิทธิ์ ⇒ FORBIDDEN → หน่วย ⇒ NOT_FOUND → รูปข้อมูล ⇒ BAD_INPUT → ชื่อซ้ำ ⇒ DUPLICATE */
export async function createResource(actor: ResourceActor, ctx: ResourceCtx, i: ResourceInput): Promise<ResourceResult> {
  if (!okCtx(ctx)) return fail("NOT_FOUND", R.NOT_FOUND);
  if (!allowed(actor, ctx.unitId, "createResourceAction")) return fail("FORBIDDEN", R.FORBIDDEN);
  if (!(await unitIsBooking(ctx))) return fail("NOT_FOUND", R.NOT_FOUND);
  const c = cleanInput(i);
  if (typeof c === "string") return fail("BAD_INPUT", c);
  const db = tenantDb({ tenantId: ctx.tenantId, unitId: ctx.unitId });
  try {
    const row = await db.$transaction(async (tx) => {
      const created = await tx.svcResource.create({
        data: { tenantId: ctx.tenantId, unitId: ctx.unitId, kind: c.kind, name: c.name, capacity: c.capacity, cleanupMin: c.cleanupMin, sortOrder: c.sortOrder },
        select: { id: true, kind: true, name: true, capacity: true, cleanupMin: true, active: true, sortOrder: true, createdAt: true },
      });
      await tx.auditLog.create({
        data: { tenantId: ctx.tenantId, unitId: ctx.unitId, actorType: "USER", actorId: actor.userId, action: "booking.resource.create", targetType: "SvcResource", targetId: created.id, before: {}, after: c },
      });
      return created;
    }, RES_TX);
    return { ok: true, resource: rowOf(row, [], nowOf().getTime()) };
  } catch (e) {
    if (isP2002(e)) return fail("DUPLICATE", R.DUPLICATE);
    if (isBusyDbError(e)) return fail("BUSY", R.BUSY);
    throw e;
  }
}

type CleanPatch = Partial<CleanInput & { active: boolean }>;
function cleanPatch(p: unknown): CleanPatch | string {
  if (!isRec(p)) return R.KIND;
  const out: CleanPatch = {};
  if (p.kind !== undefined) {
    if (!isResourceKind(p.kind)) return R.KIND;
    out.kind = p.kind;
  }
  if (p.name !== undefined) {
    const name = typeof p.name === "string" ? p.name.trim() : "";
    if (name.length < 1 || name.length > 60) return R.NAME;
    out.name = name;
  }
  if (p.capacity !== undefined) {
    if (!isInt(p.capacity, 1, 20)) return R.CAPACITY;
    out.capacity = p.capacity;
  }
  if (p.cleanupMin !== undefined) {
    if (!isInt(p.cleanupMin, 0, 240)) return R.CLEANUP;
    out.cleanupMin = p.cleanupMin;
  }
  if (p.sortOrder !== undefined) {
    if (!isInt(p.sortOrder, -1_000_000, 1_000_000)) return R.SORT;
    out.sortOrder = p.sortOrder;
  }
  if (p.active !== undefined) {
    if (typeof p.active !== "boolean") return R.ACTIVE;
    out.active = p.active;
  }
  return out;
}

/** แถวทรัพยากรแถวเดียวใต้ล็อก (CRUD · ไม่ถือล็อกหมอ/ทรัพยากรอื่น) */
async function lockOneResourceTx(tx: RawReader, ctx: ResourceCtx, id: string): Promise<ResRowLite | null> {
  const rows = await tx.$queryRaw<ResRowLite[]>`
    SELECT "id", "kind", "name", "capacity", "cleanupMin", "active", "sortOrder", "createdAt"
    FROM "SvcResource" WHERE id = ${id} AND "tenantId" = ${ctx.tenantId} AND "unitId" = ${ctx.unitId} FOR UPDATE`;
  return rows[0] ?? null;
}

/** ช่วงถือ (รวมเวลาเก็บ) ของนัดบนชิ้นนี้ที่ยังไม่จบ ณ now */
function liveSpans(holds: readonly HoldRow[], cleanupMin: number, nowMs: number): { id: string; s: number; e: number }[] {
  return holds.map((h) => ({ id: h.id, s: h.s, e: h.e + cleanupMin * MIN_MS })).filter((x) => x.e > nowMs);
}

/** ความจุถูกละเมิด ณ จุดใด (จุดสูงสุดอยู่ที่จุดเริ่มของช่วงใดช่วงหนึ่ง) */
function overCapacity(spans: readonly { s: number; e: number }[], capacity: number): boolean {
  for (const x of spans) {
    let n = 0;
    for (const u of spans) if (u.s <= x.s && u.e > x.s) n++;
    if (n > capacity) return true;
  }
  return false;
}
const overlapsAny = (spans: readonly { s: number; e: number }[], ws: readonly { s: number; e: number }[]) =>
  spans.some((x) => ws.some((w) => x.s < w.e && w.s < x.e));

/** ลำดับตรวจ: สิทธิ์ → แถว (NOT_FOUND ข้อความเดียว) → รูปข้อมูล → ใต้ล็อกแถว: IN_USE → เขียน · ชื่อซ้ำ ⇒ DUPLICATE */
export async function updateResource(actor: ResourceActor, ctx: ResourceCtx, id: string, patch: ResourcePatch, opts?: { now?: Date }): Promise<ResourceResult> {
  if (!okCtx(ctx)) return fail("NOT_FOUND", R.NOT_FOUND);
  if (!allowed(actor, ctx.unitId, "updateResourceAction")) return fail("FORBIDDEN", R.FORBIDDEN);
  if (typeof id !== "string" || !id) return fail("NOT_FOUND", R.NOT_FOUND);
  const db = tenantDb({ tenantId: ctx.tenantId, unitId: ctx.unitId });
  const exists = await db.svcResource.findFirst({ where: { id }, select: { id: true } });
  if (!exists) return fail("NOT_FOUND", R.NOT_FOUND);
  const p = cleanPatch(patch);
  if (typeof p === "string") return fail("BAD_INPUT", p);
  const nowMs = nowOf(opts).getTime();
  const overrunMin = await overrunMinOf(ctx); // Q11 ▸ ก่อน tx ◂
  type Out = { kind: "fail"; res: ResourceResult } | { kind: "ok"; row: ResRowLite };
  const attempt = () => db.$transaction(async (tx): Promise<Out> => {
    const cur = await lockOneResourceTx(tx, ctx, id);
    if (!cur) return { kind: "fail", res: fail("NOT_FOUND", R.NOT_FOUND) };
    const next = { ...cur, ...p };
    const deactivate = cur.active && next.active === false;
    const rekind = next.kind !== cur.kind;
    const shrink = next.capacity < cur.capacity || next.cleanupMin > cur.cleanupMin;
    if (deactivate || rekind || shrink) {
      const holds = await readHolds(tx, ctx.tenantId, ctx.unitId, { from: new Date(nowMs - DAY_MS), to: ALL_TO, nowMs, resourceId: id, overrunMin });
      const cur0 = liveSpans(holds, cur.cleanupMin, nowMs);
      if ((deactivate || rekind) && cur0.length) {
        return { kind: "fail", res: fail("IN_USE", inUseReason(cur0.length, deactivate ? "ปิดใช้" : "เปลี่ยนชนิด")) };
      }
      if (shrink && next.active) {
        const spans = liveSpans(holds, next.cleanupMin, nowMs);
        const blocks = (await readUnitBlocks(tx, ctx.tenantId, ctx.unitId, new Date(nowMs - DAY_MS), ALL_TO))
          .filter((b) => b.resourceId === id)
          .map((b) => ({ s: b.startAt.getTime(), e: b.endAt ? b.endAt.getTime() : OPEN_END }));
        if (overCapacity(spans, next.capacity) || overlapsAny(spans, blocks)) {
          return { kind: "fail", res: fail("IN_USE", inUseReason(spans.length, next.capacity < cur.capacity ? "ลดจำนวนที่รับได้" : "เพิ่มเวลาเก็บ")) };
        }
      }
    }
    const data: Prisma.SvcResourceUncheckedUpdateManyInput = {};
    for (const k of ["kind", "name", "capacity", "cleanupMin", "sortOrder", "active"] as const) if (p[k] !== undefined && p[k] !== cur[k]) (data as Record<string, unknown>)[k] = p[k];
    if (Object.keys(data).length) {
      await tx.svcResource.updateMany({ where: { id, tenantId: ctx.tenantId, unitId: ctx.unitId }, data });
      await tx.auditLog.create({
        data: { tenantId: ctx.tenantId, unitId: ctx.unitId, actorType: "USER", actorId: actor.userId, action: "booking.resource.update", targetType: "SvcResource", targetId: id,
          before: Object.fromEntries(Object.keys(data).map((k) => [k, (cur as Record<string, unknown>)[k]])) as Prisma.InputJsonValue, after: data as Prisma.InputJsonValue },
      });
    }
    return { kind: "ok", row: { ...cur, ...(data as Partial<ResRowLite>) } };
  }, RES_TX);
  let out: Out | null = null;
  try {
    out = await retryOnce(attempt);
  } catch (e) {
    if (isP2002(e)) return fail("DUPLICATE", R.DUPLICATE);
    throw e;
  }
  if (!out) return fail("BUSY", R.BUSY);
  if (out.kind === "fail") return out.res;
  const blocks = await readUnitBlocks(db, ctx.tenantId, ctx.unitId, ALL_FROM, ALL_TO);
  return { ok: true, resource: rowOf(out.row, blocks, nowMs) };
}

/** ลองธุรกรรมซ้ำ 1 ครั้งเมื่อชนชั่วคราว · ยังชน ⇒ null (BUSY) · ข้อผิดพลาดอื่น throw ตามจริง */
async function retryOnce<T>(fn: () => Promise<T>): Promise<T | null> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      if (!isBusyDbError(e)) throw e;
      if (attempt >= 1) return null;
    }
  }
}

type CleanWindow = { s: number; e: number | null; note: string | null };
function cleanWindows(ws: unknown): CleanWindow[] | null {
  if (!Array.isArray(ws) || ws.length > 20) return null;
  const out: CleanWindow[] = [];
  for (const w of ws) {
    if (!isRec(w) || typeof w.startAt !== "string") return null;
    const s = Date.parse(w.startAt);
    if (!Number.isFinite(s)) return null;
    let e: number | null = null;
    if (w.endAt !== null && w.endAt !== undefined) {
      if (typeof w.endAt !== "string") return null;
      e = Date.parse(w.endAt);
      if (!Number.isFinite(e) || e <= s) return null;
    }
    if (w.note !== undefined && w.note !== null && (typeof w.note !== "string" || w.note.length > 100)) return null;
    out.push({ s, e, note: typeof w.note === "string" && w.note.trim() ? w.note.trim() : null });
  }
  return out;
}

/** แทนช่วงปิดซ่อมทั้งชุด ([] = ล้าง) · ช่วงใดทับช่วงถือของนัด (รวมเวลาเก็บ) ⇒ IN_USE · ใต้ล็อกแถวเดียวกับทางจอง */
export async function setResourceMaintenance(actor: ResourceActor, ctx: ResourceCtx, id: string, windows: MaintenanceWindow[], opts?: { now?: Date }): Promise<ResourceResult> {
  if (!okCtx(ctx)) return fail("NOT_FOUND", R.NOT_FOUND);
  if (!allowed(actor, ctx.unitId, "setResourceMaintenanceAction")) return fail("FORBIDDEN", R.FORBIDDEN);
  if (typeof id !== "string" || !id) return fail("NOT_FOUND", R.NOT_FOUND);
  const db = tenantDb({ tenantId: ctx.tenantId, unitId: ctx.unitId });
  const exists = await db.svcResource.findFirst({ where: { id }, select: { id: true } });
  if (!exists) return fail("NOT_FOUND", R.NOT_FOUND);
  const ws = cleanWindows(windows);
  if (!ws) return fail("BAD_INPUT", R.MAINT);
  const nowMs = nowOf(opts).getTime();
  const overrunMin = await overrunMinOf(ctx); // Q11 ▸ ก่อน tx ◂
  type Out = { kind: "fail"; res: ResourceResult } | { kind: "ok"; row: ResRowLite };
  const attempt = () => db.$transaction(async (tx): Promise<Out> => {
    const cur = await lockOneResourceTx(tx, ctx, id);
    if (!cur) return { kind: "fail", res: fail("NOT_FOUND", R.NOT_FOUND) };
    if (ws.length) {
      const holds = await readHolds(tx, ctx.tenantId, ctx.unitId, { from: new Date(nowMs - DAY_MS), to: ALL_TO, nowMs, resourceId: id, overrunMin });
      const spans = liveSpans(holds, cur.cleanupMin, nowMs);
      const hit = spans.filter((x) => ws.some((w) => x.s < (w.e ?? OPEN_END) && w.s < x.e));
      if (hit.length) return { kind: "fail", res: fail("IN_USE", inUseReason(hit.length, "ปิดซ่อมช่วงนี้")) };
    }
    const before = await tx.svcResourceBlock.findMany({ where: { tenantId: ctx.tenantId, unitId: ctx.unitId, resourceId: id }, select: { startAt: true, endAt: true, reason: true } });
    await tx.svcResourceBlock.deleteMany({ where: { tenantId: ctx.tenantId, unitId: ctx.unitId, resourceId: id } });
    if (ws.length) {
      await tx.svcResourceBlock.createMany({
        data: ws.map((w) => ({ tenantId: ctx.tenantId, unitId: ctx.unitId, resourceId: id, startAt: new Date(w.s), endAt: w.e === null ? null : new Date(w.e), reason: w.note, createdById: actor.userId })),
      });
    }
    await tx.auditLog.create({
      data: { tenantId: ctx.tenantId, unitId: ctx.unitId, actorType: "USER", actorId: actor.userId, action: "booking.resource.maintenance", targetType: "SvcResource", targetId: id,
        before: { windows: before.map((b) => ({ startAt: b.startAt.toISOString(), endAt: b.endAt?.toISOString() ?? null, note: b.reason })) },
        after: { windows: ws.map((w) => ({ startAt: new Date(w.s).toISOString(), endAt: w.e === null ? null : new Date(w.e).toISOString(), note: w.note })) } },
    });
    return { kind: "ok", row: cur };
  }, RES_TX);
  const out = await retryOnce(attempt);
  if (!out) return fail("BUSY", R.BUSY);
  if (out.kind === "fail") return out.res;
  const blocks = await readUnitBlocks(db, ctx.tenantId, ctx.unitId, ALL_FROM, ALL_TO);
  return { ok: true, resource: rowOf(out.row, blocks, nowMs) };
}

// ───────────────────────── รับ walk-in ตอนนี้ได้ไหม (ภาพ 02) ─────────────────────────

const hhmmBkk = (ms: number): string => new Date(ms + 7 * 60 * MIN_MS).toISOString().slice(11, 16);
const labelsOf = (kinds: readonly string[]) => kinds.map((k) => (isResourceKind(k) ? RESOURCE_KIND_LABELS_TH[k] : k)).join("/");

/**
 * ต่อบริการ active ที่รับ walk-in: PlanInput แบบ runPlanner (อ่านอย่างเดียว · ไม่ล็อก ไม่เขียน) → quoteWalkIn → แถว ·
 * หน่วยไม่ใช่ BOOKING แถวเดียว / ctx ไม่ตรงร้าน ⇒ [] · reasonTh ไม่มีชื่อ/เบอร์ลูกค้า
 * STAFF = คำเรียกผู้ให้บริการของสาขา (ไม่มีคำว่า "ห้อง") · RESOURCE = ป้ายชนิดที่ต้องรอ · BOTH = ทั้งสอง
 */
export async function walkInNowByService(ctx: ResourceCtx, opts?: { now?: Date }): Promise<WalkInNowRow[]> {
  if (!okCtx(ctx)) return [];
  const now = nowOf(opts);
  const run = await import("./planner-run");
  const { quoteWalkIn } = await import("./planner");
  const values = await run.lineSettingsOf(ctx.tenantId, ctx.unitId);
  if (!values) return [];
  const db = tenantDb({ tenantId: ctx.tenantId, unitId: ctx.unitId });
  const services = await db.bookingService.findMany({
    where: { active: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }, { id: "asc" }],
    select: { id: true, name: true, durationMin: true },
  });
  if (!services.length) return [];
  const [walkIns, label] = await Promise.all([
    resolveSettingsMany({ tenantId: ctx.tenantId }, ["booking.service.walkIn"], services.map((s) => ({ unitId: ctx.unitId, serviceId: s.id }))),
    resolveSettings({ tenantId: ctx.tenantId }, ["booking.general.providerLabel"], { unitId: ctx.unitId }),
  ]);
  const provider = typeof label["booking.general.providerLabel"]?.value === "string" ? (label["booking.general.providerLabel"].value as string) : "ผู้ให้บริการ";
  const dayStr = run.bkkDayOf(now.getTime());
  const reader = db as unknown as Prisma.TransactionClient;
  const [pre, rows] = await Promise.all([run.planPreOf(ctx, dayStr, values), run.jobRowsOf(reader, ctx, dayStr)]);
  const input = run.planInputOf(pre, rows, now.getTime(), await run.skippedOf(reader, ctx, rows));
  const kindsBy = new Map(pre.services.map((s) => [s.id, s.resourceKinds ?? []]));
  const out: WalkInNowRow[] = [];
  services.forEach((s, i) => {
    const wi = walkIns[i]?.["booking.service.walkIn"]?.value;
    if (isRec(wi) && (wi.enabled === false || (typeof wi.closeAtOrAboveMin === "number" && s.durationMin >= wi.closeAtOrAboveMin))) return;
    const q = quoteWalkIn(input, { serviceId: s.id, staffId: null });
    const kinds = kindsBy.get(s.id) ?? [];
    const when = q.startAt !== null ? hhmmBkk(q.startAt) : null;
    const wait = q.waitMin !== null ? ` (รอประมาณ ${q.waitMin} นาที)` : "";
    let reasonTh: string;
    if (q.limitedBy === "NONE") reasonTh = `ได้ทันที · ${provider}และ${kinds.length ? labelsOf(kinds) : "ที่นั่ง"}ว่าง`;
    else if (q.limitedBy === "STAFF") reasonTh = when ? `${provider}ว่างเร็วสุด ${when}${wait}` : `${provider}ไม่ว่างแล้ววันนี้`;
    else if (q.limitedBy === "RESOURCE") {
      const what = labelsOf(kinds);
      reasonTh = when ? `${provider}ว่าง แต่${what}ว่างเร็วสุด ${when}${wait}` : `${what}ไม่ว่างแล้ววันนี้`;
    } else reasonTh = when ? `${provider}และ${labelsOf(kinds)}ว่างพร้อมกันเร็วสุด ${when}${wait}` : `${provider}และ${labelsOf(kinds)}ไม่ว่างพร้อมกันแล้ววันนี้`;
    if (q.closed && q.startAt !== null) reasonTh = `${reasonTh} · เกินเวลารอที่รับ walk-in`;
    out.push({
      serviceId: s.id,
      serviceName: s.name,
      closed: q.closed,
      startAt: q.startAt !== null ? new Date(q.startAt) : null,
      staffId: q.startAt !== null ? q.staffId : null,
      resourceIds: q.resourceIds,
      limitedBy: q.limitedBy,
      reasonTh,
    });
  });
  return out;
}
