// ─────────────────────────────────────────────────────────────
// trips/jobs.ts — ทางเข้าข้ามร้านไฟล์เดียวของโมดูล trips (CC §A.4) · RUN TRIPS T0.3 (T0.4 ต่อท้าย)
// ใบสั่ง ledger/trips-briefs/T0.3.md §3.5 §5 · รอบแก้ r2 (มติผู้คุม B · D · E)
//
// 🔴 ไฟล์เดียวในโมดูล trips ที่ import `prisma` ดิบได้ (fitness F5 50→51 = ORACLE-EDIT ผู้คุม) · เหตุ: งานตามเวลาต้องไล่กฎ/หน่วย "ก่อนรู้ร้าน"
//    อ่านอย่างเดียวที่นี่ (หา tenantId/unitId) แล้วเรียกบริการต่อร้านด้วย tenantDb (departures.ts) — ไม่มีการเขียนผ่าน prisma ดิบ
// 🔴 แยกความล้ม: ร้าน/หน่วย/กฎที่ล้ม ⇒ จดใน `failed` (รหัสสั้น · ไม่มีข้อความดิบ/ข้อมูลบุคคล) แล้วไปต่อ · บันทึก ops ครั้งเดียวต่อรอบงาน
//    กฎที่ล้มไม่ถูกลองซ้ำในรอบงานเดียวกัน (รอบหน้าค่อยลองใหม่)
// 🔴 idempotent: materialize = advisory lock ต่อกฎ + unique (scheduleId, localDate) · minPax = ล็อกแถวรอบ + CAS + คีย์ outbox ⇒ สองรอบซ้อน = ผลเดียว
// 🔴 เคารพ signal: หยุดก่อนเริ่มกฎ/หน่วยถัดไป (และระหว่างช่วงของ materialize)
// ─────────────────────────────────────────────────────────────
import { prisma } from "@/lib/core/db";
import { logOps } from "@/lib/core/ops";
import { errorCodeOf, evaluateMinPaxCore, materializeCore } from "./departures";
import { addDaysYmd } from "./departures-core";
import { isFail, systemGate } from "./resources";
// ── T0.4 capacity ── (ตัวกวาดหมดเวลา · เสนอที่รายการรอ)
import { Prisma } from "@prisma/client";
import { SWEEP_PAGE_SIZE } from "./capacity-core";
import { CapacityAbort, type Gate, type SweepGroup } from "./capacity";
import { expireHoldsBatch, jobGate, sweepPolicies } from "./capacity-service";
import { offerWaitlistForDeparture } from "./waitlist";
// ── /T0.4 capacity ──
// ── T0.7 money ── (งาน trips.paymentDue)
import { resolveSettings } from "@/lib/core/settings";
import { emitDueReminders, markTripDueOverdue, reminderDayOf, retryTripAutoRelease, type AutoReleaseInTx } from "./money";
import { autoReleaseOverdueInTx } from "./refund";
// ── /T0.7 money ──

export type TripJobOpts = { tenantIds?: string[]; signal?: AbortSignal };
export type TripJobFailure = { tenantId: string; unitId?: string; scheduleId?: string; departureId?: string; code: string };

/** ผลพลาดที่เป็นสถานะปกติของกฎ (ไม่ใช่ความล้ม) — ข้ามเงียบ */
const BENIGN = new Set(["HORIZON_OFF", "SCHEDULE_PAUSED", "PRODUCT_ARCHIVED", "OPTION_INACTIVE"]);

async function reportFailures(job: string, failed: TripJobFailure[]) {
  if (!failed.length) return;
  await logOps("WARN", "trips.jobs", `${job}: ล้ม ${failed.length} รายการ`, { detail: JSON.stringify(failed.slice(0, 100)) });
}

/**
 * ทุกกฎที่ไม่พัก ⇒ materialize (ตรรกะเดียวกับ action) — `tenantIds` จำกัดร้าน (QC/รันมือ)
 * schedules = กฎที่สร้างครบหน้าต่างแล้ว · incomplete = กฎที่หยุดกลางทาง (ช่วงที่ commit แล้วคงอยู่) · skipped = สถานะปกติ (พัก/ปิดสร้างล่วงหน้า/เก็บสินค้า)
 */
export async function runGenerateDepartures(
  now: Date,
  opts?: TripJobOpts,
): Promise<{ schedules: number; created: number; incomplete: number; skipped: number; failed: TripJobFailure[] }> {
  const out = { schedules: 0, created: 0, incomplete: 0, skipped: 0, failed: [] as TripJobFailure[] };
  const schedules = await prisma.tripSchedule.findMany({
    where: {
      pausedAt: null,
      ...(opts?.tenantIds ? { tenantId: { in: opts.tenantIds } } : {}),
      // กฎที่จบไปแล้ว (dateTo ก่อนเมื่อวานตาม UTC) ไม่มีวันให้สร้าง — ตัดทิ้งก่อนรู้เขตเวลาร้าน (เผื่อ 1 วัน)
      OR: [{ dateTo: null }, { dateTo: { gte: new Date(`${addDaysYmd(now.toISOString().slice(0, 10), -1)}T00:00:00.000Z`) } }],
    },
    select: { id: true, tenantId: true, unitId: true },
    orderBy: [{ tenantId: "asc" }, { unitId: "asc" }, { id: "asc" }],
  });
  const badUnits = new Set<string>();
  for (const s of schedules) {
    if (opts?.signal?.aborted) break;
    if (badUnits.has(`${s.tenantId}:${s.unitId}`)) continue;
    try {
      const g = await systemGate(s.tenantId, s.unitId);
      if (!g) {
        badUnits.add(`${s.tenantId}:${s.unitId}`);
        out.failed.push({ tenantId: s.tenantId, unitId: s.unitId, code: "UNIT_NOT_TRIPS" });
        continue;
      }
      const r = await materializeCore(g, s.id, now, opts?.signal);
      if (isFail(r)) {
        if (BENIGN.has(r.code)) out.skipped++;
        else out.failed.push({ tenantId: s.tenantId, unitId: s.unitId, scheduleId: s.id, code: r.code });
        continue;
      }
      out.created += r.created.length;
      if (r.complete) out.schedules++;
      else {
        out.incomplete++;
        if (r.stoppedBy && !BENIGN.has(r.stoppedBy) && r.stoppedBy !== "ABORTED") out.failed.push({ tenantId: s.tenantId, unitId: s.unitId, scheduleId: s.id, code: r.stoppedBy });
      }
    } catch (e) {
      out.failed.push({ tenantId: s.tenantId, unitId: s.unitId, scheduleId: s.id, code: errorCodeOf(e) });
    }
  }
  await reportFailures("trips.generateDepartures", out.failed);
  return out;
}

/** หน่วย TRIPS ทุกหน่วย ⇒ ประเมินขั้นต่ำ ณ เวลาตัดสิน (ตรรกะเดียวกับ evaluateMinPax) — ไม่สแกนรอบทั้งหมด (departures.ts อ่านเฉพาะรอบที่ถึงเวลาตัดสิน) */
export async function runMinPaxCheck(
  now: Date,
  opts?: TripJobOpts,
): Promise<{ units: number; checked: number; guaranteed: number; belowMin: number; failed: TripJobFailure[] }> {
  const out = { units: 0, checked: 0, guaranteed: 0, belowMin: 0, failed: [] as TripJobFailure[] };
  const units = await prisma.businessUnit.findMany({
    where: { type: "TRIPS", ...(opts?.tenantIds ? { tenantId: { in: opts.tenantIds } } : {}) },
    select: { id: true, tenantId: true },
    orderBy: [{ tenantId: "asc" }, { id: "asc" }],
  });
  for (const u of units) {
    if (opts?.signal?.aborted) break;
    try {
      const g = await systemGate(u.tenantId, u.id);
      if (!g) continue;
      const r = await evaluateMinPaxCore(g, now, opts?.signal);
      out.units++;
      out.checked += r.checked;
      out.guaranteed += r.guaranteed.length;
      out.belowMin += r.belowMin.length;
      for (const f of r.failed) out.failed.push({ tenantId: u.tenantId, unitId: u.id, departureId: f.departureId, code: f.code });
    } catch (e) {
      out.failed.push({ tenantId: u.tenantId, unitId: u.id, code: errorCodeOf(e) });
    }
  }
  await reportFailures("trips.minPaxCheck", out.failed);
  return out;
}

// ── T0.4 capacity ──
// ใบสั่ง ledger/trips-briefs/T0.4.md §3.7 §4 ข้อ 5 · CC §D.4 · r2 ข้อ 7 ข้อ 12 — อ่านอย่างเดียวด้วย prisma ดิบ (หา tenant/unit/รอบ "ก่อนรู้ร้าน")
// แล้วเขียนด้วย tenantDb (capacity-service → capacity.ts) · ความล้มจดรวมต่อ (ร้าน, หน่วย, รหัส) พร้อมจำนวน · เคารพ signal + deadline
export type CapacityJobOpts = TripJobOpts & { deadline?: number };
/** ความล้มรวมต่อร้าน/หน่วย/รหัส (ไม่ใช่ทีละรอบ · r2 ข้อ 7) */
export type CapacityJobFailure = { tenantId: string; unitId: string; code: string; count: number };
const capCodeOf = (e: unknown) => (e instanceof CapacityAbort ? e.code : errorCodeOf(e));
const stopped = (opts?: CapacityJobOpts) => opts?.signal?.aborted === true || (typeof opts?.deadline === "number" && Date.now() >= opts.deadline);
class FailureTally {
  private readonly m = new Map<string, CapacityJobFailure>();
  add(tenantId: string, unitId: string, code: string, n = 1) {
    const k = `${tenantId}|${unitId}|${code}`;
    const cur = this.m.get(k) ?? { tenantId, unitId, code, count: 0 };
    cur.count += n;
    this.m.set(k, cur);
  }
  list(): CapacityJobFailure[] {
    return [...this.m.values()];
  }
}

type DueRow = { id: string; tenantId: string; unitId: string; departureId: string; productId: string | null; waiters: boolean };
/**
 * อ่าน hold ครบกำหนดไม่ล็อก (ACTIVE ∧ expiresAt ≤ now · เรียง departureId, id · หน้าละ 200 · ดัชนีบางส่วน) → รวมต่อหน่วย →
 * ธุรกรรมเดียวต่อชุดของหน่วย (expireHoldsBatch) · ค่าตั้งโหลดเฉพาะรอบที่มีคนรอ (ใช้เสนอที่เท่านั้น — ค่าตั้งเสียยังปล่อย hold ได้)
 * วนหน้าจนหมด · รอบที่ล้ม/ไม่คืบหน้า (คนอื่นกวาดไปแล้ว) ถูกข้ามในหน้าถัดไป ⇒ จบเสมอ
 */
export async function runExpireHolds(
  now: Date,
  opts?: CapacityJobOpts,
): Promise<{ expired: number; departures: number; offered: number; failed: CapacityJobFailure[] }> {
  const out = { expired: 0, departures: 0, offered: 0 };
  const tally = new FailureTally();
  const skip = new Set<string>();
  const gates = new Map<string, Gate | null>();
  const iso = now.toISOString();
  while (!stopped(opts)) {
    const tenantFilter = opts?.tenantIds ? Prisma.sql`AND h."tenantId" = ANY(${opts.tenantIds}::text[])` : Prisma.empty;
    const skipFilter = skip.size ? Prisma.sql`AND NOT (h."departureId" = ANY(${[...skip]}::text[]))` : Prisma.empty;
    const due = await prisma.$queryRaw<DueRow[]>`
      SELECT h."id", h."tenantId", h."unitId", h."departureId", d."productId",
        EXISTS (SELECT 1 FROM "TripWaitlist" w WHERE w."departureId" = h."departureId" AND w."tenantId" = h."tenantId" AND w."status" = 'WAITING') AS "waiters"
      FROM "TripHold" h LEFT JOIN "TripDeparture" d ON d."id" = h."departureId" AND d."tenantId" = h."tenantId"
      WHERE h."status" = 'ACTIVE' AND h."expiresAt" <= ${iso}::timestamp ${tenantFilter} ${skipFilter}
      ORDER BY h."departureId", h."id" LIMIT ${SWEEP_PAGE_SIZE}`;
    if (!due.length) break;
    const units = new Map<string, { tenantId: string; unitId: string; groups: Map<string, { productId: string | null; waiters: boolean; ids: string[] }> }>();
    for (const h of due) {
      const uk = `${h.tenantId}|${h.unitId}`;
      const u = units.get(uk) ?? { tenantId: h.tenantId, unitId: h.unitId, groups: new Map() };
      const grp = u.groups.get(h.departureId) ?? { productId: h.productId, waiters: h.waiters, ids: [] };
      grp.ids.push(h.id);
      u.groups.set(h.departureId, grp);
      units.set(uk, u);
    }
    for (const u of units.values()) {
      if (stopped(opts)) break;
      const depIds = [...u.groups.keys()];
      try {
        const uk = `${u.tenantId}|${u.unitId}`;
        if (!gates.has(uk)) gates.set(uk, await jobGate(u.tenantId, u.unitId));
        const g = gates.get(uk);
        if (!g) {
          tally.add(u.tenantId, u.unitId, "UNIT_NOT_TRIPS", depIds.length);
          for (const id of depIds) skip.add(id);
          continue;
        }
        const withWaiters = [...u.groups.entries()].filter(([, x]) => x.waiters && x.productId).map(([id, x]) => ({ id, productId: x.productId as string }));
        const sp = await sweepPolicies(g, withWaiters, now);
        if (sp.invalid) tally.add(u.tenantId, u.unitId, "SETTINGS_INVALID_OFFER_SKIPPED", withWaiters.length);
        const groups: SweepGroup[] = [...u.groups.entries()].map(([departureId, x]) => ({ departureId, holdIds: x.ids }));
        const r = await expireHoldsBatch(g, groups, sp.policies, now);
        out.expired += r.expired;
        out.offered += r.offered;
        out.departures += r.departures;
        for (const f of r.failed) tally.add(u.tenantId, u.unitId, f.code);
        for (const id of r.done) skip.add(id);
      } catch (e) {
        tally.add(u.tenantId, u.unitId, capCodeOf(e), depIds.length);
        for (const id of depIds) skip.add(id);
      }
    }
  }
  const failed = tally.list();
  await reportFailures("trips.expireHolds", failed);
  return { ...out, failed };
}

type WaitDep = { tenantId: string; unitId: string; departureId: string };
/** หน้าต่างหมุนจุดเริ่มของงานรายการรอ (ช่วงเดียวกับรอบงาน 5 นาที — ค่าทางเทคนิค ไม่ใช่ตัวเลขธุรกิจ) */
const WAITLIST_ROTATE_MS = 300_000;
/**
 * รอบที่มี WAITING และ "ทำอะไรได้" เท่านั้น (r2 ข้อ 12 · r3 N5): หัวคิว (createdAt, id) ต้องการไม่เกินที่ว่างสาธารณะ + เปิดขาย + ยังไม่เลยปิดรับ/เริ่ม ⇒ เสนอ
 * (FIFO เคร่ง ใต้ล็อกรอบ) · เริ่มแล้ว (ทุกสถานะ)/ยกเลิก/เลยปิดรับ ⇒ WAITING → EXPIRED · รอบที่หัวคิวไม่พอดีไม่ถูกเลือก (ไม่กินหน้า)
 * จำกัดหน้าละ 200 รอบต่อรอบงาน · ลำดับหมุนตามช่วงเวลา (md5(id ‖ ช่วง)) ⇒ ทุกรอบถึงคิวแม้มีรอบที่ล้มซ้ำค้างอยู่
 */
export async function runWaitlistOffers(
  now: Date,
  opts?: CapacityJobOpts,
): Promise<{ departures: number; offered: number; expired: number; failed: CapacityJobFailure[] }> {
  const out = { departures: 0, offered: 0, expired: 0 };
  const tally = new FailureTally();
  const iso = now.toISOString();
  const bucket = String(Math.floor(now.getTime() / WAITLIST_ROTATE_MS));
  const tenantFilter = opts?.tenantIds ? Prisma.sql`AND d."tenantId" = ANY(${opts.tenantIds}::text[])` : Prisma.empty;
  const deps = await prisma.$queryRaw<WaitDep[]>`
    SELECT d."tenantId", d."unitId", d."id" AS "departureId"
    FROM "TripDeparture" d
    JOIN LATERAL (
      SELECT w."qty" FROM "TripWaitlist" w
      WHERE w."departureId" = d."id" AND w."tenantId" = d."tenantId" AND w."status" = 'WAITING'
      ORDER BY w."createdAt", w."id" LIMIT 1
    ) head ON true
    WHERE true ${tenantFilter}
      AND ( (d."capacity" - d."sold" - d."held" - d."reserved" >= head."qty" AND d."status" IN ('OPEN', 'GUARANTEED')
             AND d."startsAt" > ${iso}::timestamp AND (d."cutoffAt" IS NULL OR d."cutoffAt" > ${iso}::timestamp))
         OR d."startsAt" <= ${iso}::timestamp OR d."status" = 'CANCELLED' OR (d."cutoffAt" IS NOT NULL AND d."cutoffAt" <= ${iso}::timestamp) )
    ORDER BY md5(d."id" || ${bucket}) LIMIT ${SWEEP_PAGE_SIZE}`;
  for (const d of deps) {
    if (stopped(opts)) break;
    try {
      const r = await offerWaitlistForDeparture(d.tenantId, d.unitId, d.departureId, now, "trips.waitlistOffers");
      out.departures++;
      out.offered += r.offered.length;
      out.expired += r.expired;
    } catch (e) {
      tally.add(d.tenantId, d.unitId, capCodeOf(e));
    }
  }
  const failed = tally.list();
  await reportFailures("trips.waitlistOffers", failed);
  return { ...out, failed };
}
// ── /T0.4 capacity ──

// ── T0.7 money ──
// TRIPS T0.7 ▸ งาน trips.paymentDue (ใบสั่ง T0.7 §13 · CC :926) — อ่านไม่ล็อกข้ามร้านด้วย prisma ดิบ (ดัชนี TripPaymentDue_status_dueAt_idx · หน้าละ 200 · keyset)
//   แล้วเขียนต่อร้านผ่าน money.ts (tenantDb · ต่องวดหนึ่ง tx) · AUTO_RELEASE = ยื่นคำขอคืนเงิน SYSTEM ผ่าน refund.ts (ไม่บันทึกโอนคืน/ไม่ปล่อยที่เอง) ◂
type PayDueRow = { id: string; tenantId: string; unitId: string; bookingId: string; productId: string; dueAt: Date; amountSatang: number; paidSatang: number };
/** ขอบเขตการเตือนล่วงหน้า (T16 สูงสุด 365 วันตามสคีมาค่าตั้ง + 1 · ค่าทางเทคนิคของการสแกน ไม่ใช่ตัวเลขธุรกิจ) */
const REMINDER_HORIZON_MS = 366 * 86_400_000;
const K_REMINDER_DAYS = "trips.pay.reminderDaysBefore"; // T16 (ค่าปัจจุบันของหน่วย/สินค้า · นโยบาย ไม่ใช่ยอด)
const K_AUTO_APPROVE = "trips.cancel.autoApproveUpTo"; // X12 (ค่าปัจจุบันของหน่วย)
/** ผ่อนผัน X11 จาก snapshot ในรูป SQL (คีย์ไม่ได้จด/ไม่ใช่จำนวนเต็ม ⇒ 0 — ธุรกรรมต่องวดตัดสินซ้ำจาก snapshot อีกครั้ง) */
const GRACE_SQL = Prisma.sql`(CASE WHEN (b."policySnapshot"->'policy'->'trips'->'values'->>'trips.pay.overdueGraceHours') ~ '^[0-9]+$'
  THEN (b."policySnapshot"->'policy'->'trips'->'values'->>'trips.pay.overdueGraceHours')::int ELSE 0 END)`;
/** การจองที่ยังค้างจ่ายและไม่มีคำขอคืนเงินเปิด (ดัชนี TripRefundRequest_bookingId_idx ในเงื่อนไข NOT EXISTS) */
const LIVE_BOOKING_SQL = Prisma.sql`b."status" IN ('CONFIRMED', 'PART_PAID')
  AND NOT EXISTS (SELECT 1 FROM "TripRefundRequest" r WHERE r."bookingId" = b."id" AND r."tenantId" = b."tenantId" AND r."status" IN ('REQUESTED', 'QUOTED', 'APPROVED', 'EXECUTING', 'FAILED'))`;
type DueCursor = { at: string; id: string } | null;
/** เพดานการลองยื่น AUTO_RELEASE ซ้ำต่อรอบงาน (มติ r2 W5 · ค่าทางเทคนิค ไม่ใช่ตัวเลขธุรกิจ) */
const AUTO_RELEASE_RETRY_CAP = 50;
/** T17 จาก snapshot ในรูป SQL */
const ACTION_SQL = Prisma.sql`(b."policySnapshot"->'policy'->'trips'->'values'->>'trips.pay.overdueAction')`;
/**
 * งาน trips.paymentDue (มติ r1 V1 · r2 W5 W8 W9) — สามคิว แต่ละคิวมี cursor (dueAt, id) · หน้าละ 200 · ทุกรอบของลูปทำหน้าเตือนก่อนแล้วจึงหน้าเลยกำหนด (คิวหนึ่งไม่กินอีกคิว):
 *   เตือน: งวด OPEN/PARTLY_PAID ที่ now < dueAt ≤ now + 366 วัน ⇒ trips.payment.due_soon ของ d ที่เล็กที่สุดใน T16 ที่ dueAt − d วัน ≤ now
 *     (คีย์ <dueId>:<d> · ตรวจคีย์ที่มีแล้วในคำสั่งเดียวก่อนเขียน) — ไม่มีธุรกรรม/ไม่ล็อก
 *   เลยกำหนด: งวด OPEN/PARTLY_PAID ที่ dueAt + X11 ≤ now ⇒ markTripDueOverdue (ต่องวดหนึ่ง tx) · รอบที่เปลี่ยนเป็น OVERDUE + T17 AUTO_RELEASE ⇒ ยื่นคำขอใต้ SAVEPOINT
 *   ลองยื่นซ้ำ (เพดาน AUTO_RELEASE_RETRY_CAP ต่อรอบ · หลังสองคิวแรก): งวด OVERDUE + AUTO_RELEASE ที่ยังไม่มีคำขอของงวดนั้น (คีย์ refund:<booking>:sys:trips.paymentDue:due_<due>@<unit>)
 * ทุกคิวข้ามการจองที่ไม่ค้างจ่าย (HOLD ใช้เวลาของ hold · CANCELLED/EXPIRED/PAID) และการจองที่มีคำขอคืนเงินเปิด
 * คืน more = { reminders, overdue } — true เมื่อหยุดเพราะ signal/deadline ทั้งที่คิวยังไม่หมด · ล้มรายแถว = นับใน failed ไม่หยุดงาน
 */
export async function runPaymentDue(
  now: Date,
  opts?: CapacityJobOpts,
): Promise<{ reminders: number; overdue: number; autoReleased: number; failed: CapacityJobFailure[]; more: { reminders: boolean; overdue: boolean; retry: boolean } }> {
  const out = { reminders: 0, overdue: 0, autoReleased: 0 };
  const tally = new FailureTally();
  const gates = new Map<string, Gate | null>();
  const daysOf = new Map<string, number[]>();
  const autoOf = new Map<string, number>();
  const iso = now.toISOString();
  const horizon = new Date(now.getTime() + REMINDER_HORIZON_MS).toISOString();
  const tenantFilter = opts?.tenantIds ? Prisma.sql`AND d."tenantId" = ANY(${opts.tenantIds}::text[])` : Prisma.empty;
  const afterOf = (cur: DueCursor) => (cur ? Prisma.sql`AND (d."dueAt", d."id") > (${cur.at}::timestamp, ${cur.id})` : Prisma.empty);
  const gateFor = async (d: PayDueRow): Promise<Gate | null> => {
    const uk = `${d.tenantId}|${d.unitId}`;
    if (!gates.has(uk)) gates.set(uk, await jobGate(d.tenantId, d.unitId));
    const g = gates.get(uk) ?? null;
    if (!g) tally.add(d.tenantId, d.unitId, "UNIT_NOT_TRIPS");
    return g;
  };
  const autoFor = async (g: Gate): Promise<number> => {
    if (!autoOf.has(g.unitId)) {
      const r = await resolveSettings({ tenantId: g.tenantId }, [K_AUTO_APPROVE], { unitId: g.unitId }, now);
      const v = r[K_AUTO_APPROVE]?.value;
      autoOf.set(g.unitId, typeof v === "number" && Number.isSafeInteger(v) && v >= 0 ? v : 0);
    }
    return autoOf.get(g.unitId) ?? 0;
  };
  const autoReleaseFor = (g: Gate, auto: number): AutoReleaseInTx => {
    const sysCtx = { tenantId: g.tenantId, unitId: g.unitId, channel: "COUNTER", actor: { kind: "SYSTEM", job: "trips.paymentDue" }, now };
    return (tx, b, dueId) => autoReleaseOverdueInTx(tx, sysCtx, b, dueId, auto);
  };
  const page = (statuses: Prisma.Sql, where: Prisma.Sql, cur: DueCursor, limit: number) => prisma.$queryRaw<PayDueRow[]>`
    SELECT d."id", d."tenantId", d."unitId", d."bookingId", b."productId", d."dueAt", d."amountSatang", d."paidSatang"
    FROM "TripPaymentDue" d JOIN "TripBooking" b ON b."id" = d."bookingId" AND b."tenantId" = d."tenantId"
    WHERE d."status" IN (${statuses}) AND ${where} AND ${LIVE_BOOKING_SQL} ${tenantFilter} ${afterOf(cur)}
    ORDER BY d."dueAt", d."id" LIMIT ${limit}`;
  const OPEN = Prisma.sql`'OPEN', 'PARTLY_PAID'`;
  const nextCursor = (rows: PayDueRow[]): DueCursor => {
    const last = rows[rows.length - 1];
    return last ? { at: new Date(last.dueAt).toISOString(), id: last.id } : null;
  };
  let remCur: DueCursor = null;
  let ovCur: DueCursor = null;
  let remDone = false;
  let ovDone = false;
  /** งวดที่เปลี่ยนเป็น OVERDUE ในรอบงานนี้ — ไม่เข้าคิวลองยื่นซ้ำของรอบเดียวกัน (มติ r3 ข้อ 1: ลองซ้ำเฉพาะรอบถัดไป) */
  const flipped: string[] = [];
  while (!stopped(opts) && !(remDone && ovDone)) {
    // คิวเตือนก่อน (มติ r2 W5)
    if (!remDone) {
      const rows = await page(OPEN, Prisma.sql`d."dueAt" > ${iso}::timestamp AND d."dueAt" <= ${horizon}::timestamp`, remCur, SWEEP_PAGE_SIZE);
      // มติ r3 ข้อ 2: คิว "หมด" เมื่อหน้าสุดท้ายถูกทำครบทุกแถวเท่านั้น
      const lastPage = rows.length < SWEEP_PAGE_SIZE;
      let complete = true;
      remCur = nextCursor(rows) ?? remCur;
      const byUnit = new Map<string, { g: Gate; items: { due: PayDueRow; d: number }[] }>();
      for (const d of rows) {
        if (stopped(opts)) {
          complete = false;
          break;
        }
        try {
          const g = await gateFor(d);
          if (!g) continue;
          const pk = `${d.tenantId}|${d.unitId}|${d.productId}`;
          if (!daysOf.has(pk)) {
            const r = await resolveSettings({ tenantId: d.tenantId }, [K_REMINDER_DAYS], { unitId: d.unitId, productId: d.productId }, now);
            const v = r[K_REMINDER_DAYS]?.value;
            daysOf.set(pk, Array.isArray(v) ? v.filter((x): x is number => typeof x === "number" && Number.isInteger(x) && x >= 0) : []);
          }
          const day = reminderDayOf(d.dueAt, daysOf.get(pk) ?? [], now);
          if (day === null) continue;
          const uk = `${d.tenantId}|${d.unitId}`;
          const grp = byUnit.get(uk) ?? { g, items: [] };
          grp.items.push({ due: d, d: day });
          byUnit.set(uk, grp);
        } catch (e) {
          tally.add(d.tenantId, d.unitId, capCodeOf(e));
        }
      }
      for (const grp of byUnit.values()) {
        try {
          out.reminders += await emitDueReminders(grp.g, grp.items);
        } catch (e) {
          tally.add(grp.g.tenantId, grp.g.unitId, capCodeOf(e), grp.items.length);
        }
      }
      if (lastPage && complete) remDone = true;
    }
    if (!ovDone && !stopped(opts)) {
      const rows = await page(OPEN, Prisma.sql`d."dueAt" <= ${iso}::timestamp AND d."dueAt" + make_interval(hours => ${GRACE_SQL}) <= ${iso}::timestamp`, ovCur, SWEEP_PAGE_SIZE);
      const lastPage = rows.length < SWEEP_PAGE_SIZE;
      let complete = true;
      ovCur = nextCursor(rows) ?? ovCur;
      for (const d of rows) {
        if (stopped(opts)) {
          complete = false;
          break;
        }
        try {
          const g = await gateFor(d);
          if (!g) continue;
          const ov = await markTripDueOverdue(g, { id: d.id, bookingId: d.bookingId }, now, autoReleaseFor(g, await autoFor(g)));
          if (!ov.ok) {
            tally.add(d.tenantId, d.unitId, ov.code);
            continue;
          }
          if (ov.value.overdue) {
            out.overdue++;
            flipped.push(d.id);
          }
          if (ov.value.autoReleased) out.autoReleased++;
          if (ov.value.autoReleaseFailed) tally.add(d.tenantId, d.unitId, `AUTO_RELEASE_${ov.value.autoReleaseFailed}`);
        } catch (e) {
          tally.add(d.tenantId, d.unitId, capCodeOf(e));
        }
      }
      if (lastPage && complete) ovDone = true;
    }
  }
  // ลองยื่น AUTO_RELEASE ซ้ำ (เพดานต่อรอบ · มติ r2 W5) — ไม่รวมงวดที่เพิ่งเปลี่ยนเป็น OVERDUE ในรอบนี้ (มติ r3 ข้อ 1)
  let retryMore = true;
  if (!stopped(opts)) {
    const keySql = Prisma.sql`'refund:' || b."id" || ':sys:trips.paymentDue:due_' || d."id" || '@' || d."unitId"`;
    const rows = await page(
      Prisma.sql`'OVERDUE'`,
      Prisma.sql`d."paidSatang" < d."amountSatang" AND ${ACTION_SQL} = 'AUTO_RELEASE'
        AND NOT EXISTS (SELECT 1 FROM "TripRefundRequest" x WHERE x."tenantId" = d."tenantId" AND x."idempotencyKey" = ${keySql})
        AND NOT (d."id" = ANY(${flipped}::text[]))`,
      null,
      AUTO_RELEASE_RETRY_CAP,
    );
    let complete = true;
    for (const d of rows) {
      if (stopped(opts)) {
        complete = false;
        break;
      }
      try {
        const g = await gateFor(d);
        if (!g) continue;
        const r = await retryTripAutoRelease(g, { id: d.id, bookingId: d.bookingId }, autoReleaseFor(g, await autoFor(g)));
        if (!r.ok) tally.add(d.tenantId, d.unitId, `AUTO_RELEASE_${r.code}`);
        else if (r.value) out.autoReleased++;
      } catch (e) {
        tally.add(d.tenantId, d.unitId, capCodeOf(e));
      }
    }
    // เพดานตัด (ได้ครบ CAP แถว) หรือ deadline ตัดกลางทาง ⇒ ยังมีงานเหลือ
    retryMore = !complete || rows.length >= AUTO_RELEASE_RETRY_CAP;
  }
  const failed = tally.list();
  await reportFailures("trips.paymentDue", failed);
  return { ...out, failed, more: { reminders: !remDone, overdue: !ovDone, retry: retryMore } };
}
// ── /T0.7 money ──
// ── T0.8 pdpa ──
// ใบสั่ง ledger/trips-briefs/T0.8.md §7 · CC §A.4 :114 · §J.2 :931 · §D.4 ข้อ 5 — สแกนข้ามร้านแบบอ่านอย่างเดียวด้วย prisma ดิบ (หาหน่วยที่มีของครบกำหนด)
// แล้วเขียนผ่าน pdpa.ts (tenantDb · ต่อหน่วย) เท่านั้น · ล้มต่อหน่วย = จดรหัสสั้นใน failed แล้วไปต่อ · เคารพ signal/deadline ก่อนเริ่มหน่วยถัดไป
// r3 X4: ตัวจัดตารางไม่มีทาง "ขอรอบเร็วขึ้น" ⇒ ลงทะเบียนรายชั่วโมง (minute-jobs.ts) · งานเดิมทำซ้ำได้ (idempotent) · ยังเหลือ = value.more (รอบถัดไปทำต่อ)
import { purgeTripPersonalDataForUnit } from "./pdpa";
import type { SellResult } from "@/lib/core/sellable";
export type PdpaPurgeResult = { units: number; documents: number; passengerStages: number; bookers: number; more: boolean; failed: TripJobFailure[] };
/** ผลเป็น SellResult (รูปเดียวกับบริการของใบ · ข้อสอบ RT อ่าน value) — ล้มต่อหน่วยไม่ทำให้ทั้งงานล้ม (อยู่ใน value.failed) */
export type PdpaPurgeOpts = TripJobOpts & { deadline?: number; limitPerUnit?: number; storage?: { del?: (path: string) => Promise<number> } };
export async function runPdpaPurge(
  now: Date,
  opts?: PdpaPurgeOpts,
): Promise<SellResult<PdpaPurgeResult>> {
  const out: PdpaPurgeResult = { units: 0, documents: 0, passengerStages: 0, bookers: 0, more: false, failed: [] };
  const iso = now.toISOString();
  const tf = (col: string) => (opts?.tenantIds ? Prisma.sql`AND ${Prisma.raw(col)} = ANY(${opts.tenantIds}::text[])` : Prisma.empty);
  // r3 X3: หน่วยที่มีงาน = (ก) ไฟล์ครบกำหนด (ข) แถวผู้เดินทางครบกำหนด (ค) ผู้จองหมดเวลาไม่มีเงิน (ง) วัตถุที่ทำเครื่องหมายแล้วแต่ยังไม่ยืนยันว่าหาย
  //   (จ) รอบเลื่อนเร็วขึ้น: retE ที่เก็บ > วันจบตามเวลาหน่วยปัจจุบัน (เขตเวลาที่ Postgres ไม่รู้จัก ⇒ Asia/Bangkok) (ฉ) คำขอ ERASE ที่ IN_PROGRESS
  //   ดัชนี: (ก)(ง) TripDocument_retainUntil_deletedAt_idx (retainUntil ≤ now · แถวที่ทำเครื่องหมายมี retainUntil ≤ เวลาทำเครื่องหมาย) · (ข) TripPassenger_retainUntil_idx ·
  //   (ค) TripBooking_tenantId_unitId_status_travelDate_idx (มีตัวกรองร้าน) · (จ) TripPassenger_retainUntil_idx (IS NOT NULL) / TripDocument_retainUntil_deletedAt_idx + PK ของการจอง/รอบ ·
  //   (ฉ) TripPdpaRequest_tenantId_status_dueAt_idx (มีตัวกรองร้าน)
  // r3 X4: ลำดับหน่วยหมุนทุกชั่วโมง (md5(unitId ‖ ช่วง) แบบงานรายการรอ T0.4) · แต่ละหน่วยได้ส่วนแบ่งเวลาที่เหลือ
  const bucket = String(Math.floor(now.getTime() / 3_600_000));
  const units = await prisma.$queryRaw<{ tenantId: string; unitId: string }[]>`
    WITH tz AS (
      SELECT bu."id", CASE WHEN n."name" IS NOT NULL THEN n."name" ELSE 'Asia/Bangkok' END AS "tz"
      FROM "BusinessUnit" bu LEFT JOIN pg_timezone_names n ON n."name" = bu."settings"->>'timezone'
      WHERE bu."type"::text = 'TRIPS' ${tf(`bu."tenantId"`)}
    )
    SELECT x."tenantId", x."unitId" FROM (
      SELECT "tenantId", "unitId" FROM "TripDocument" WHERE "deletedAt" IS NULL AND "retainUntil" <= ${iso}::timestamp ${tf(`"tenantId"`)}
      UNION SELECT "tenantId", "unitId" FROM "TripPassenger" WHERE "retainUntil" <= ${iso}::timestamp ${tf(`"tenantId"`)}
      UNION SELECT "tenantId", "unitId" FROM "TripBooking" WHERE "status" = 'EXPIRED' AND "piiPurgedAt" IS NULL AND "paidSatang" = 0 ${tf(`"tenantId"`)}
      UNION SELECT "tenantId", "unitId" FROM "TripDocument" WHERE "retainUntil" <= ${iso}::timestamp AND "deletedAt" IS NOT NULL
        AND COALESCE(("consent"->>'objDel')::boolean, false) = false ${tf(`"tenantId"`)}
      UNION SELECT p."tenantId", p."unitId" FROM "TripPassenger" p JOIN tz ON tz."id" = p."unitId"
        JOIN "TripBooking" b ON b."id" = p."bookingId" AND b."tenantId" = p."tenantId" JOIN "TripDeparture" d ON d."id" = b."departureId" AND d."tenantId" = b."tenantId"
        WHERE p."retainUntil" IS NOT NULL AND (p."answers"->>'retE') > ((((d."endsAt") AT TIME ZONE 'UTC') AT TIME ZONE tz."tz")::date)::text ${tf(`p."tenantId"`)}
      UNION SELECT doc."tenantId", doc."unitId" FROM "TripDocument" doc JOIN tz ON tz."id" = doc."unitId"
        JOIN "TripPassenger" p ON p."id" = doc."passengerId" AND p."tenantId" = doc."tenantId"
        JOIN "TripBooking" b ON b."id" = p."bookingId" AND b."tenantId" = p."tenantId" JOIN "TripDeparture" d ON d."id" = b."departureId" AND d."tenantId" = b."tenantId"
        WHERE doc."deletedAt" IS NULL AND (doc."consent"->>'retE') > ((((d."endsAt") AT TIME ZONE 'UTC') AT TIME ZONE tz."tz")::date)::text ${tf(`doc."tenantId"`)}
      UNION SELECT "tenantId", "unitId" FROM "TripPdpaRequest" WHERE "kind" = 'ERASE' AND "status" = 'IN_PROGRESS' ${tf(`"tenantId"`)}
    ) x ORDER BY md5(x."unitId" || ${bucket}), x."tenantId", x."unitId"`;
  // เพดานต่อหน่วยต่อขั้นต่อรอบงาน (ชุดละ ≤ 200 วนต่อในรอบเดียวกัน · r1 P8) — ค่าเริ่ม 2,000
  const limit = Number.isInteger(opts?.limitPerUnit) && (opts?.limitPerUnit ?? 0) >= 1 ? Math.min(2000, opts?.limitPerUnit ?? 2000) : 2000;
  for (let k = 0; k < units.length; k++) {
    const u = units[k];
    if (!u) continue;
    if (opts?.signal?.aborted || (typeof opts?.deadline === "number" && Date.now() >= opts.deadline)) {
      out.more = true;
      break;
    }
    try {
      const g = await systemGate(u.tenantId, u.unitId);
      if (!g) continue;
      // ส่วนแบ่งเวลา: เวลาที่เหลือ ÷ หน่วยที่เหลือ (อย่างน้อย 2 วิ · ไม่เกิน deadline รวม)
      const unitDeadline = typeof opts?.deadline === "number" ? Math.min(opts.deadline, Date.now() + Math.max(2000, (opts.deadline - Date.now()) / (units.length - k))) : undefined;
      const r = await purgeTripPersonalDataForUnit({ tenantId: u.tenantId, unitId: u.unitId, now, limit, ...(unitDeadline !== undefined ? { deadline: unitDeadline } : {}), ...(opts?.storage ? { storage: opts.storage } : {}) });
      out.units++;
      out.documents += r.documents;
      out.passengerStages += r.passengerStages;
      out.bookers += r.bookers;
      out.more = out.more || r.more;
      for (const f of r.failed) out.failed.push({ tenantId: f.tenantId, unitId: f.unitId, code: f.code });
    } catch (e) {
      out.failed.push({ tenantId: u.tenantId, unitId: u.unitId, code: errorCodeOf(e) });
    }
  }
  await reportFailures("trips.pdpaPurge", out.failed);
  return { ok: true, value: out };
}
// ── /T0.8 pdpa ──
