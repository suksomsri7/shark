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

// ── T0.8 pdpa ──
// ใบสั่ง ledger/trips-briefs/T0.8.md §7 · CC §A.4 :114 · §J.2 :931 · §D.4 ข้อ 5 — สแกนข้ามร้านแบบอ่านอย่างเดียวด้วย prisma ดิบ (หาหน่วยที่มีของครบกำหนด)
// แล้วเขียนผ่าน pdpa.ts (tenantDb · ต่อหน่วย) เท่านั้น · ล้มต่อหน่วย = จดรหัสสั้นใน failed แล้วไปต่อ · เคารพ signal/deadline ก่อนเริ่มหน่วยถัดไป
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
  const units = await prisma.$queryRaw<{ tenantId: string; unitId: string }[]>`
    SELECT DISTINCT x."tenantId", x."unitId" FROM (
      SELECT "tenantId", "unitId" FROM "TripDocument" WHERE "deletedAt" IS NULL AND "retainUntil" <= ${iso}::timestamp ${tf(`"tenantId"`)}
      UNION SELECT "tenantId", "unitId" FROM "TripPassenger" WHERE "retainUntil" <= ${iso}::timestamp ${tf(`"tenantId"`)}
      UNION SELECT "tenantId", "unitId" FROM "TripBooking" WHERE "status" = 'EXPIRED' AND "piiPurgedAt" IS NULL AND "paidSatang" = 0 ${tf(`"tenantId"`)}
    ) x ORDER BY x."tenantId", x."unitId"`;
  const limit = Number.isInteger(opts?.limitPerUnit) && (opts?.limitPerUnit ?? 0) >= 1 ? Math.min(200, opts?.limitPerUnit ?? 200) : 200;
  for (const u of units) {
    if (opts?.signal?.aborted || (typeof opts?.deadline === "number" && Date.now() >= opts.deadline)) {
      out.more = true;
      break;
    }
    try {
      const g = await systemGate(u.tenantId, u.unitId);
      if (!g) continue;
      const r = await purgeTripPersonalDataForUnit({ tenantId: u.tenantId, unitId: u.unitId, now, limit, ...(opts?.storage ? { storage: opts.storage } : {}) });
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
