// SVC B.4 — ตัวห่อของตัววางคิว (planDay · B.2) + งานรายนาทีของโหมดแถวเดียว (สาย / ไม่มา / สิ้นวัน)
// แบบ: ledger/DESIGN-BOOKING-QUEUE.md §4.1 §4.2 R4 · สัญญา: ledger/svc-briefs/svc-brief-b.4.md §3.3
//
// 🔴 ทำงานเฉพาะหน่วย BOOKING ที่ `booking.queue.singleLine = true` — ร้านเดิม (_fallback = false) ⇒ ran:false / tick ไม่แตะ
// 🔴 ล็อก (ลำดับคงที่ทุกทางที่ย้ายช่อง): pg_advisory_xact_lock(สาขา) → BookingStaff ทั้งสาขา ORDER BY sortOrder, createdAt, id FOR UPDATE
//    (ลำดับเดียวกับ bookAppointment ของ B.3 ซึ่งล็อกเฉพาะช่างที่เกี่ยว ⇒ ไม่มีวงรอ)
// 🔴 ห้ามใช้ connection ที่สองขณะถือล็อก (B.3 G2): โปรไฟล์ช่าง/บริการ/ค่าตั้ง อ่าน "ก่อน" ธุรกรรม · ใน tx อ่าน/เขียนผ่าน tx เท่านั้น
// 🔴 เวลาไทยคิดจาก epoch + 7 ชม. (ไม่ใช้ getDay/getHours ของเครื่อง) · ทุกฟังก์ชันรับ `now` ฉีดได้และใช้นาฬิกาเดียวนั้นตลอด
// 🔴 tick: ทุกข้อเป็น UPDATE มีเงื่อนไขสถานะ + FOR UPDATE SKIP LOCKED เป็นก้อน (แบบ expireDepositHolds) ⇒ รันซ้อน 2 โพรเซส
//    แต่ละแถวเปลี่ยนครั้งเดียว · event ต่อแถว 1 (อยู่ใน tx เดียวกับ UPDATE) · คืนจำนวนที่ "ฉัน" เปลี่ยนจริง (X5)
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/core/db";
import { emitOutbox } from "@/lib/core/outbox";
import { resolveSettings, resolveSettingsMany } from "@/lib/core/settings";
import * as queue from "@/lib/modules/queue/service";
import { planDay, type PlanInput, type PlanJob, type PlanService, type PlanSettings, type PlanStaff } from "./planner";
import { PLAN_SETTING_KEYS, planSettingsFrom } from "./plan-settings";
import { emitNoShowTx, forfeitAfterNoShow, staffDayProfiles, type StaffDayProfile } from "./service";
import { BKK_OFFSET_MIN, localToUtc } from "./slots";
import { windowsToEpoch } from "./staff-hours";

const MIN_MS = 60_000;
/** ธุรกรรมที่ถือล็อกสาขา (B.3 G2: maxWait ≤ 20s · timeout ≤ 30s) */
export const LINE_TX = { maxWait: 20_000, timeout: 30_000 } as const;
const TICK_TX = { maxWait: 5_000, timeout: 10_000 } as const;
const TICK_BATCH = 50;
const TICK_MAX_BATCHES = 40;

// ───────────────────────── เวลาไทย ─────────────────────────

/** "YYYY-MM-DD" วันไทยของ epoch ms */
export function bkkDayOf(ms: number): string {
  return new Date(ms + BKK_OFFSET_MIN * MIN_MS).toISOString().slice(0, 10);
}
export function addDaysStr(ds: string, n: number): string {
  const [y, m, d] = ds.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
const validNow = (now: Date | undefined): Date =>
  now instanceof Date && !Number.isNaN(now.getTime()) ? now : new Date();

// ───────────────────────── ค่าตั้งของหน่วยแถวเดียว ─────────────────────────

const LINE_KEYS: readonly string[] = [...new Set([
  "booking.queue.singleLine",
  "booking.queue.prefixes",
  "booking.late.graceMin",
  "booking.late.noShowAfterMin",
  "booking.late.afterGrace",
  ...PLAN_SETTING_KEYS,
])];

/** ค่าตั้งที่ resolve แล้วของหน่วย BOOKING แถวเดียว (คีย์ → ค่า) · ไม่ใช่ BOOKING / ไม่เปิดโหมด ⇒ null */
export async function lineSettingsOf(tenantId: string, unitId: string): Promise<Record<string, unknown> | null> {
  if (typeof tenantId !== "string" || typeof unitId !== "string" || !tenantId || !unitId) return null;
  const unit = await prisma.businessUnit.findFirst({ where: { id: unitId, tenantId, type: "BOOKING" }, select: { id: true } });
  if (!unit) return null;
  const r = await resolveSettings({ tenantId }, [...LINE_KEYS], { unitId });
  if (r["booking.queue.singleLine"]?.value !== true) return null;
  return Object.fromEntries(LINE_KEYS.map((k) => [k, r[k]?.value]));
}

/** ค่ามาสาย/ไม่มาของนัด — snapshot ชนะ (CC §1.6) · กติกาเดียวกับ SQL ของ tick (graceSql/noShowSql):
 *  คีย์ใน snapshot เป็นตัวเลข ⇒ ใช้ · ไม่มีคีย์/ไม่มี snapshot/ชนิดอื่น ⇒ ค่าปัจจุบันของสาขา · noShowAfterMin = JSON null ⇒ ไม่ตั้งอัตโนมัติ
 *  J4: ร้านถอย NO_SHOW/LATE กลับเอง (`job.manualHold`) ⇒ ไม่มีไม่มาอัตโนมัติ + ถือช่อง (HOLD) */
export type LatePolicy = { graceMin: number; noShowAfterMin: number | null; afterGrace: "RELEASE_REQUEUE" | "WAIT_NOTIFY_COUNTER"; manualHold: boolean };
export function latePolicyOf(snap: unknown, unit: Record<string, unknown>): LatePolicy {
  const values = snap && typeof snap === "object" && !Array.isArray(snap) ? (snap as { values?: unknown }).values : undefined;
  const v = values && typeof values === "object" && !Array.isArray(values) ? (values as Record<string, unknown>) : null;
  const isNum = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);
  const has = (k: string) => !!v && Object.prototype.hasOwnProperty.call(v, k);
  const g = has("booking.late.graceMin") && isNum(v!["booking.late.graceMin"]) ? v!["booking.late.graceMin"] : unit["booking.late.graceMin"];
  const nRaw = has("booking.late.noShowAfterMin") ? v!["booking.late.noShowAfterMin"] : undefined;
  const n = isNum(nRaw) ? nRaw : nRaw === null ? null : unit["booking.late.noShowAfterMin"];
  const aRaw = has("booking.late.afterGrace") ? v!["booking.late.afterGrace"] : undefined;
  const a = aRaw === "RELEASE_REQUEUE" || aRaw === "WAIT_NOTIFY_COUNTER" ? aRaw : unit["booking.late.afterGrace"];
  const manualHold = jobOf(snap).manualHold;
  return {
    graceMin: isNum(g) ? g : 0,
    noShowAfterMin: manualHold ? null : isNum(n) ? n : null,
    afterGrace: manualHold ? "WAIT_NOTIFY_COUNTER" : a === "RELEASE_REQUEUE" ? "RELEASE_REQUEUE" : "WAIT_NOTIFY_COUNTER",
    manualHold,
  };
}

/** policySnapshot.job (B.4) — นาที/buffer ตอนจอง · priority ของ walk-in (J6) · manualHold = ร้านถอย NO_SHOW/LATE เอง (J4) */
export function jobOf(snap: unknown): { durationMin: number | null; bufferMin: number | null; priority: boolean; manualHold: boolean } {
  const j = snap && typeof snap === "object" && !Array.isArray(snap) ? (snap as { job?: unknown }).job : undefined;
  const o = j && typeof j === "object" && !Array.isArray(j) ? (j as Record<string, unknown>) : {};
  const num = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? x : null);
  return { durationMin: num(o.durationMin), bufferMin: num(o.bufferMin), priority: o.priority === true, manualHold: o.manualHold === true };
}

// ───────────────────────── PlanInput จากฐาน ─────────────────────────

type SvcRow = { id: string; name: string; durationMin: number; bufferMin: number; priceSatang: number; active: boolean };
/** ส่วนที่อ่าน "ก่อน" ธุรกรรม (ไม่เปลี่ยนบ่อย · B.3 หนี้ยอมรับ: โปรไฟล์ช่าง/ลาอ่านนอกล็อก) */
export type PlanPre = {
  dayStr: string;
  settings: PlanSettings;
  values: Record<string, unknown>;
  profiles: StaffDayProfile[];
  staff: PlanStaff[];
  services: PlanService[];
  svcById: Map<string, SvcRow>;
};

export async function planPreOf(ctx: { tenantId: string; unitId: string }, dayStr: string, values: Record<string, unknown>): Promise<PlanPre> {
  const settings = planSettingsFrom(values); // คีย์ขาด/ผิดชนิด ⇒ throw (ตัววางคิวผิดเงียบแย่กว่าล้มดัง)
  const [profiles, svcs] = await Promise.all([
    staffDayProfiles({ tenantId: ctx.tenantId, unitId: ctx.unitId }, dayStr),
    prisma.bookingService.findMany({
      where: { tenantId: ctx.tenantId, unitId: ctx.unitId },
      select: { id: true, name: true, durationMin: true, bufferMin: true, priceSatang: true, active: true },
    }),
  ]);
  const staff: PlanStaff[] = profiles.map((p) => ({
    id: p.staffId,
    name: p.name,
    sortOrder: p.sortOrder,
    windows: windowsToEpoch(dayStr, p.windows),
    services: p.services === null ? null : p.services.map((r) => (r.durationMin === null ? { serviceId: r.serviceId } : { serviceId: r.serviceId, durationMin: r.durationMin })),
    minBreakMin: p.minBreakMin,
    maxJobsPerDay: p.maxJobsPerDay,
  }));
  return {
    dayStr,
    settings,
    values,
    profiles,
    staff,
    services: svcs.map((s) => ({ id: s.id, name: s.name, durationMin: s.durationMin, bufferAfterMin: s.bufferMin })),
    svcById: new Map(svcs.map((s) => [s.id, s])),
  };
}

const JOB_SELECT = {
  id: true, status: true, kind: true, assignMode: true, staffId: true, serviceId: true, startAt: true, endAt: true,
  createdAt: true, checkedInAt: true, startedAt: true, queueTicketId: true, plannedStartAt: true, plannedStaffId: true,
  policySnapshot: true,
} as const;
export type JobRow = Prisma.AppointmentGetPayload<{ select: typeof JOB_SELECT }>;

/**
 * งานของวันไทยนั้นทุกสถานะ (DONE นับงาน/วัน) + J5: งานที่ "ลากข้ามเที่ยงคืน" จากวันก่อน (ARRIVED/IN_SERVICE ทุกตัว ·
 * นัด PENDING/CONFIRMED/LATE ที่ endAt > เที่ยงคืน) — walk-in QUEUED ของวันก่อนไม่นับ (สิ้นวันยกเลิก) · อ่านผ่าน tx ใต้ล็อก
 */
export async function jobRowsOf(tx: Prisma.TransactionClient, ctx: { tenantId: string; unitId: string }, dayStr: string): Promise<JobRow[]> {
  const d0 = localToUtc(dayStr, 0);
  const d1 = localToUtc(dayStr, 24 * 60);
  return tx.appointment.findMany({
    where: {
      tenantId: ctx.tenantId,
      unitId: ctx.unitId,
      OR: [
        { startAt: { gte: d0, lt: d1 } },
        { startAt: { gte: localToUtc(addDaysStr(dayStr, -1), 0), lt: d0 }, status: { in: ["ARRIVED", "IN_SERVICE"] } },
        { startAt: { gte: localToUtc(addDaysStr(dayStr, -1), 0), lt: d0 }, endAt: { gt: d0 }, kind: "BOOKED", status: { in: ["PENDING", "CONFIRMED", "LATE"] } },
      ],
    },
    select: JOB_SELECT,
    orderBy: [{ startAt: "asc" }, { id: "asc" }],
  });
}

function planJobOf(r: JobRow, values: Record<string, unknown>): PlanJob {
  const walkIn = r.kind === "WALKIN";
  const any = r.assignMode === "ANY";
  const snap = r.policySnapshot;
  const hasSnap = !!snap && typeof snap === "object" && !Array.isArray(snap) && !!(snap as { values?: unknown }).values;
  const pol = latePolicyOf(snap, values);
  const job = jobOf(snap);
  const policyOn = hasSnap || job.manualHold;
  return {
    id: r.id,
    label: r.id, // ไม่มีชื่อลูกค้า (X8)
    kind: walkIn ? "WALKIN" : "BOOKED",
    status: r.status,
    serviceId: r.serviceId,
    // นาทีที่จดตอนจองชนะ (นัด = ช่างคงที่) · walk-in ไม่ส่ง (ย้ายช่างได้ ⇒ นาทีเฉพาะคนของช่างที่วาง)
    ...(!walkIn && job.durationMin !== null ? { durationMin: job.durationMin } : {}),
    assignMode: any ? "ANY" : "SPECIFIC",
    // walk-in "ใครก็ได้" ที่ยังรอ = ไม่ผูกช่าง (ตัววางคิวเลือก) · กำลังทำ/ระบุช่าง/นัด = ช่างของแถว
    staffId: walkIn && any && r.status === "QUEUED" ? null : r.staffId,
    startAt: walkIn ? null : r.startAt.getTime(),
    issuedAt: walkIn ? (r.checkedInAt ?? r.createdAt).getTime() : r.createdAt.getTime(),
    checkedInAt: r.checkedInAt ? r.checkedInAt.getTime() : null,
    startedAt: r.startedAt ? r.startedAt.getTime() : null,
    priority: walkIn && job.priority, // J6: priority ของ walk-in คงอยู่ทุกรอบวางคิว
    ...(policyOn
      ? { policy: { graceMin: pol.graceMin, noShowAfterMin: pol.noShowAfterMin === null ? Number.POSITIVE_INFINITY : pol.noShowAfterMin, lateAction: pol.afterGrace === "RELEASE_REQUEUE" ? "RELEASE" as const : "HOLD" as const } }
      : {}),
  };
}

export function planInputOf(pre: PlanPre, rows: readonly JobRow[], nowMs: number): PlanInput {
  return { now: nowMs, settings: pre.settings, staff: pre.staff, services: pre.services, jobs: rows.map((r) => planJobOf(r, pre.values)) };
}

/** ล็อกของทางที่ย้ายช่อง: advisory ของสาขา → ช่างทุกคนของสาขา (ลำดับเดียวกับ B.3) */
export async function lockUnitTx(tx: Prisma.TransactionClient, ctx: { tenantId: string; unitId: string }): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`booking:line:${ctx.tenantId}:${ctx.unitId}`}, 0))`;
  await tx.$queryRaw`SELECT id FROM "BookingStaff" WHERE "tenantId" = ${ctx.tenantId} AND "unitId" = ${ctx.unitId} ORDER BY "sortOrder", "createdAt", id FOR UPDATE`;
}

const FINISHED = new Set(["DONE", "NO_SHOW", "CANCELLED"]);
const sameTime = (a: Date | null, b: Date | null) => (a === null ? b === null : b !== null && a.getTime() === b.getTime());

/**
 * วางคิวทั้งวันใต้ล็อก แล้วเขียนแคชแผน (ใช้ร่วม: runPlanner · ผู้เรียกที่ถือล็อกอยู่แล้ว)
 *   งานที่ยังไม่จบ: plannedStaffId/plannedStartAt (ไม่ได้วาง/ปล่อยช่อง/ถึงเวลาไม่มา ⇒ null) · บัตร etaAt = plannedStartAt ·
 *   walk-in QUEUED ที่วางได้ ⇒ staffId/startAt/endAt ตามแผน (ถือช่องจริง · B.3 §6 ข้อ 9) · วางไม่ได้ ⇒ คงช่องเดิม
 *   เขียนเฉพาะค่าที่เปลี่ยน · ทุก UPDATE มีเงื่อนไขสถานะที่อ่าน (CAS — งานที่ถูกเปลี่ยนสถานะระหว่างนั้น = ข้าม)
 */
export async function planAndWriteTx(
  tx: Prisma.TransactionClient,
  ctx: { tenantId: string; unitId: string },
  pre: PlanPre,
  nowMs: number,
): Promise<number> {
  const rows = await jobRowsOf(tx, ctx, pre.dayStr);
  const plan = planDay(planInputOf(pre, rows, nowMs));
  const byId = new Map(plan.jobs.map((j) => [j.jobId, j]));
  const ticketIds = rows.filter((r) => r.queueTicketId && !FINISHED.has(r.status)).map((r) => r.queueTicketId as string);
  const tickets = ticketIds.length
    ? await tx.queueTicket.findMany({ where: { tenantId: ctx.tenantId, unitId: ctx.unitId, id: { in: ticketIds } }, select: { id: true, etaAt: true } })
    : [];
  const etaOf = new Map(tickets.map((t) => [t.id, t.etaAt]));
  let planned = 0;
  for (const r of rows) {
    if (FINISHED.has(r.status)) continue;
    const pj = byId.get(r.id);
    const placed = !!pj && (pj.state === "SCHEDULED" || pj.state === "IN_SERVICE") && pj.startAt !== null && pj.endAt !== null && !!pj.staffId;
    const pStart = placed ? new Date(pj!.startAt!) : null;
    const pStaff = placed ? pj!.staffId : null;
    if (placed) planned++;
    const data: Prisma.AppointmentUncheckedUpdateManyInput = {};
    if (!sameTime(r.plannedStartAt, pStart)) data.plannedStartAt = pStart;
    if (r.plannedStaffId !== pStaff) data.plannedStaffId = pStaff;
    // J2: นัด "ใครก็ได้" ที่แผนย้ายไปช่างอื่น (BOOKED_MOVED_STAFF · ยังไม่เช็กอิน) ⇒ ฐานต้องตรงกับแผน (ถือช่องที่ช่างใหม่จริง)
    //   ใต้ล็อกช่างทั้งสาขาที่ถืออยู่ · CAS สถานะ + staffId เดิม · เวลาเริ่มไม่เปลี่ยน · นัดระบุช่างไม่ถูกย้ายเด็ดขาด
    let casStaff: string | null = null;
    if (placed && r.kind === "BOOKED" && r.assignMode === "ANY" && r.checkedInAt === null && pj!.reason === "BOOKED_MOVED_STAFF"
      && pStaff !== r.staffId && (r.status === "PENDING" || r.status === "CONFIRMED")) {
      const buf = jobOf(r.policySnapshot).bufferMin ?? pre.svcById.get(r.serviceId)?.bufferMin ?? 0;
      data.staffId = pStaff!;
      data.endAt = new Date(pj!.endAt! + buf * MIN_MS);
      casStaff = r.staffId;
    }
    if (placed && r.kind === "WALKIN" && r.status === "QUEUED") {
      const buf = jobOf(r.policySnapshot).bufferMin ?? pre.svcById.get(r.serviceId)?.bufferMin ?? 0;
      const end = new Date(pj!.endAt! + buf * MIN_MS);
      if (!sameTime(r.startAt, pStart)) data.startAt = pStart!;
      if (!sameTime(r.endAt, end)) data.endAt = end;
      if (r.staffId !== pStaff) data.staffId = pStaff!;
    }
    if (Object.keys(data).length) {
      const w = await tx.appointment.updateMany({
        where: { id: r.id, tenantId: ctx.tenantId, unitId: ctx.unitId, status: r.status, ...(casStaff ? { staffId: casStaff } : {}) },
        data,
      });
      if (w.count === 0) continue; // งานเพิ่งเปลี่ยนสถานะ ⇒ ไม่แตะบัตรด้วย (m-1)
    }
    if (r.queueTicketId && etaOf.has(r.queueTicketId) && !sameTime(etaOf.get(r.queueTicketId) ?? null, pStart)) {
      await tx.queueTicket.updateMany({
        where: { id: r.queueTicketId, tenantId: ctx.tenantId, unitId: ctx.unitId, status: { in: ["WAITING", "CALLED", "SERVING", "SKIPPED"] } },
        data: { etaAt: pStart },
      });
    }
  }
  return planned;
}

/**
 * ตัวห่อ planDay (ใบสั่ง §3.3): ไม่ใช่แถวเดียว ⇒ { ran:false } ไม่เขียนอะไร · วางคิว "วันไทยของ now" ใต้ล็อกสาขา → ช่าง
 * planned = จำนวนงานที่ได้แผน (วาง/กำลังทำ)
 */
export async function runPlanner(ctx: { tenantId: string; unitId: string }, opts?: { now?: Date }): Promise<{ ran: boolean; planned: number }> {
  const now = validNow(opts?.now);
  const values = await lineSettingsOf(ctx.tenantId, ctx.unitId);
  if (!values) return { ran: false, planned: 0 };
  const pre = await planPreOf(ctx, bkkDayOf(now.getTime()), values);
  const planned = await prisma.$transaction(async (tx) => {
    await lockUnitTx(tx, ctx);
    return planAndWriteTx(tx, ctx, pre, now.getTime());
  }, LINE_TX);
  return { ran: true, planned };
}

// ───────────────────────── งานรายนาที ─────────────────────────

type UnitTick = { tenantId: string; unitId: string; graceMin: number; noShowAfterMin: number | null; today: boolean };

/** ผ่อนผัน/ไม่มาของแถว (SQL) — snapshot ชนะ · ไม่มีคีย์ใน snapshot / ไม่มี snapshot ⇒ ค่าปัจจุบันของสาขา · JSON null ของไม่มา = ไม่ตั้งอัตโนมัติ
 *  cast เฉพาะเมื่อ jsonb_typeof = number (snapshot เสียไม่ทำให้ทั้งงานล้ม) */
const graceSql = (u: UnitTick) => Prisma.sql`(CASE WHEN jsonb_typeof(x."policySnapshot" -> 'values' -> 'booking.late.graceMin') = 'number'
  THEN (x."policySnapshot" -> 'values' ->> 'booking.late.graceMin')::numeric ELSE ${u.graceMin}::numeric END)`;
const noShowSql = (u: UnitTick) => Prisma.sql`(CASE jsonb_typeof(x."policySnapshot" -> 'values' -> 'booking.late.noShowAfterMin')
  WHEN 'number' THEN (x."policySnapshot" -> 'values' ->> 'booking.late.noShowAfterMin')::numeric
  WHEN 'null' THEN NULL ELSE ${u.noShowAfterMin}::numeric END)`;

type TickRow = { id: string; staffId: string; kind: string; channel: string | null; customerId: string | null; serviceId: string; queueTicketId: string | null };

/** 1) สาย: CONFIRMED · ยังไม่เช็กอิน · startAt + ผ่อนผัน ≤ now · ยังไม่ถึงเวลาไม่มา (ถึงแล้ว = ข้อ 2 ตั้ง NO_SHOW ตรง ไม่ยิง late) */
async function sweepLate(u: UnitTick, at: Date, lookback: Date): Promise<number> {
  let n = 0;
  for (let b = 0; b < TICK_MAX_BATCHES; b++) {
    const got = await prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<TickRow[]>`
        UPDATE "Appointment" a SET "status" = 'LATE', "lateAt" = ${at}, "updatedAt" = now()
        WHERE a."id" IN (
          SELECT x."id" FROM "Appointment" x
          WHERE x."tenantId" = ${u.tenantId} AND x."unitId" = ${u.unitId}
            AND x."status" = 'CONFIRMED' AND x."checkedInAt" IS NULL
            AND COALESCE(x."policySnapshot" -> 'job' ->> 'manualHold', 'false') <> 'true'
            AND x."startAt" >= ${lookback} AND x."startAt" <= ${at}
            AND x."startAt" + ${graceSql(u)} * interval '1 minute' <= ${at}
            AND NOT COALESCE(x."startAt" + ${noShowSql(u)} * interval '1 minute' <= ${at}, false)
          ORDER BY x."startAt", x."id"
          LIMIT ${TICK_BATCH}
          FOR UPDATE SKIP LOCKED
        ) AND a."status" = 'CONFIRMED' AND a."checkedInAt" IS NULL
        RETURNING a."id", a."staffId", a."kind", a."channel", a."customerId", a."serviceId", a."queueTicketId"`;
      for (const r of rows) {
        await emitOutbox(tx, {
          tenantId: u.tenantId,
          unitId: u.unitId,
          type: "booking.late",
          idempotencyKey: `booking.late#${r.id}`,
          payload: { appointmentId: r.id, unitId: u.unitId, staffId: r.staffId, kind: r.kind, channel: r.channel, serviceId: r.serviceId, lateAt: at.toISOString() },
        });
      }
      return rows.length;
    }, TICK_TX);
    n += got;
    if (got < TICK_BATCH) break;
  }
  return n;
}

/** 2) ไม่มา: CONFIRMED|LATE · ยังไม่เช็กอิน · ไม่มา ≠ null · startAt + ไม่มา ≤ now ⇒ NO_SHOW (event คีย์เดิม + บัตรเดินตาม ใน tx · ริบมัดจำหลัง commit) */
async function sweepNoShow(u: UnitTick, at: Date, lookback: Date): Promise<number> {
  let n = 0;
  for (let b = 0; b < TICK_MAX_BATCHES; b++) {
    const ids = await prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<TickRow[]>`
        UPDATE "Appointment" a SET "status" = 'NO_SHOW', "updatedAt" = now()
        WHERE a."id" IN (
          SELECT x."id" FROM "Appointment" x
          WHERE x."tenantId" = ${u.tenantId} AND x."unitId" = ${u.unitId}
            AND x."status" IN ('CONFIRMED', 'LATE') AND x."checkedInAt" IS NULL
            AND COALESCE(x."policySnapshot" -> 'job' ->> 'manualHold', 'false') <> 'true'
            AND x."startAt" >= ${lookback} AND x."startAt" <= ${at}
            AND ${noShowSql(u)} IS NOT NULL
            AND x."startAt" + ${noShowSql(u)} * interval '1 minute' <= ${at}
          ORDER BY x."startAt", x."id"
          LIMIT ${TICK_BATCH}
          FOR UPDATE SKIP LOCKED
        ) AND a."status" IN ('CONFIRMED', 'LATE') AND a."checkedInAt" IS NULL
        RETURNING a."id", a."staffId", a."kind", a."channel", a."customerId", a."serviceId", a."queueTicketId"`;
      for (const r of rows) {
        await emitNoShowTx(tx, { tenantId: u.tenantId, unitId: u.unitId, appointmentId: r.id, customerId: r.customerId, serviceId: r.serviceId });
        if (r.queueTicketId) {
          await queue.moveTicketTx(tx, { tenantId: u.tenantId, unitId: u.unitId }, r.queueTicketId, "NO_SHOW", { now: at, actorType: "SYSTEM" });
        }
      }
      return rows.map((r) => r.id);
    }, TICK_TX);
    n += ids.length;
    for (const id of ids) {
      const f = await forfeitAfterNoShow(u.tenantId, u.unitId, id);
      if (f.reason) console.warn(`[booking.line.tick] นัด ${id}: ${f.reason}`);
    }
    if (ids.length < TICK_BATCH) break;
  }
  return n;
}

/** 3) สิ้นวัน: walk-in QUEUED ที่วันไทยของ startAt < วันไทยของ now (ทุกวันก่อนหน้า · J6 ไม่มีขอบล่าง — tick หยุดไปหลายวันก็เก็บได้) ⇒
 *  CANCELLED END_OF_DAY + บัตร CANCELLED END_OF_DAY · ทีละก้อน 50 */
async function sweepEndOfDay(u: UnitTick, todayStart: Date, at: Date): Promise<number> {
  let n = 0;
  for (let b = 0; b < TICK_MAX_BATCHES; b++) {
    const got = await prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<TickRow[]>`
        UPDATE "Appointment" a SET "status" = 'CANCELLED', "cancelReason" = 'END_OF_DAY', "plannedStartAt" = NULL, "plannedStaffId" = NULL, "updatedAt" = now()
        WHERE a."id" IN (
          SELECT x."id" FROM "Appointment" x
          WHERE x."tenantId" = ${u.tenantId} AND x."unitId" = ${u.unitId}
            AND x."kind" = 'WALKIN' AND x."status" = 'QUEUED'
            AND x."startAt" < ${todayStart}
          ORDER BY x."startAt", x."id"
          LIMIT ${TICK_BATCH}
          FOR UPDATE SKIP LOCKED
        ) AND a."status" = 'QUEUED' AND a."kind" = 'WALKIN'
        RETURNING a."id", a."staffId", a."kind", a."channel", a."customerId", a."serviceId", a."queueTicketId"`;
      for (const r of rows) {
        if (r.queueTicketId) {
          await queue.moveTicketTx(tx, { tenantId: u.tenantId, unitId: u.unitId }, r.queueTicketId, "CANCELLED", { now: at, actorType: "SYSTEM", cancelReason: "END_OF_DAY" });
        }
      }
      return rows.length;
    }, TICK_TX);
    n += got;
    if (got < TICK_BATCH) break;
  }
  return n;
}

/**
 * งานรายนาที "booking.line.tick" (ใบสั่ง §3.3): ข้ามร้าน · `tenantIds` = จำกัดขอบเขต (minute-job ไม่ส่ง)
 *   ขอบเขตแถว: หน่วย BOOKING แถวเดียว · สาย/ไม่มา: startAt ย้อนไม่เกินวันไทยก่อนหน้า 1 วัน (สิ้นวันของ walk-in ไม่มีขอบล่าง · J6) · แถวที่ร้านถอยกลับเอง (job.manualHold) ไม่ถูกแตะ (J4) · PENDING ไม่ถูกแตะ
 *   ลำดับต่อหน่วย: สาย → ไม่มา → สิ้นวัน → runPlanner (เฉพาะหน่วยที่มีงานไม่จบในวันไทยของ now) · ล้มรายหน่วย = log แล้วทำหน่วยถัดไป
 */
export async function runLineTick(now: Date, opts?: { tenantIds?: string[] }): Promise<{ late: number; noShow: number; endOfDay: number; units: number }> {
  const at = validNow(now);
  const out = { late: 0, noShow: 0, endOfDay: 0, units: 0 };
  const scoped = Array.isArray(opts?.tenantIds);
  const ids = scoped ? (opts!.tenantIds as string[]).filter((x) => typeof x === "string") : [];
  if (scoped && ids.length === 0) return out;
  const today = bkkDayOf(at.getTime());
  const todayStart = localToUtc(today, 0);
  const lookback = localToUtc(addDaysStr(today, -1), 0);
  const dayEnd = localToUtc(addDaysStr(today, 1), 0);

  // หน่วย BOOKING ที่มีงานค้างในช่วง (ตรวจโหมดแถวเดียวจากค่าตั้งด้านล่าง)
  const cand = await prisma.$queryRaw<{ tenantId: string; unitId: string; today: boolean }[]>`
    SELECT a."tenantId", a."unitId", bool_or(a."startAt" >= ${todayStart}) AS "today"
    FROM "Appointment" a
    JOIN "BusinessUnit" u ON u."id" = a."unitId" AND u."tenantId" = a."tenantId" AND u."type" = 'BOOKING'
    WHERE ((a."startAt" >= ${lookback} AND a."startAt" < ${dayEnd}
            AND a."status" IN ('CONFIRMED', 'LATE', 'QUEUED', 'ARRIVED', 'IN_SERVICE'))
        OR (a."kind" = 'WALKIN' AND a."status" = 'QUEUED' AND a."startAt" < ${todayStart}))
      AND (${scoped}::boolean = false OR a."tenantId" = ANY(${ids}::text[]))
    GROUP BY a."tenantId", a."unitId"
    ORDER BY a."tenantId", a."unitId"`;
  if (!cand.length) return out;

  const byTenant = new Map<string, typeof cand>();
  for (const c of cand) byTenant.set(c.tenantId, [...(byTenant.get(c.tenantId) ?? []), c]);
  const units: UnitTick[] = [];
  for (const [tenantId, list] of byTenant) {
    const res = await resolveSettingsMany({ tenantId }, ["booking.queue.singleLine", "booking.late.graceMin", "booking.late.noShowAfterMin"], list.map((c) => ({ unitId: c.unitId })));
    list.forEach((c, i) => {
      const r = res[i];
      if (r["booking.queue.singleLine"]?.value !== true) return;
      const g = r["booking.late.graceMin"]?.value;
      const ns = r["booking.late.noShowAfterMin"]?.value;
      units.push({
        tenantId,
        unitId: c.unitId,
        graceMin: typeof g === "number" && Number.isFinite(g) ? g : 0,
        noShowAfterMin: typeof ns === "number" && Number.isFinite(ns) ? ns : null,
        today: c.today === true,
      });
    });
  }

  for (const u of units) {
    try {
      out.late += await sweepLate(u, at, lookback);
      out.noShow += await sweepNoShow(u, at, lookback);
      out.endOfDay += await sweepEndOfDay(u, todayStart, at);
      out.units++;
    } catch (e) {
      console.error(`[booking.line.tick] unit=${u.unitId} ล้ม`, e instanceof Error ? e.message : e);
      continue;
    }
    if (u.today) {
      try {
        await runPlanner({ tenantId: u.tenantId, unitId: u.unitId }, { now: at });
      } catch (e) {
        console.error(`[booking.line.tick] วางคิว unit=${u.unitId} ล้ม`, e instanceof Error ? e.message : e);
      }
    }
  }
  return out;
}
