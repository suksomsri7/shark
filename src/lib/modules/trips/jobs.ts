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
import { SWEEP_PAGE_SIZE } from "./capacity-core";
import { CapacityAbort, expireDepartureHolds } from "./capacity";
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
// ใบสั่ง ledger/trips-briefs/T0.4.md §3.7 §4 ข้อ 5 · CC §D.4 — อ่านอย่างเดียวด้วย prisma ดิบ (หา tenant/unit/รอบ "ก่อนรู้ร้าน") แล้วเขียนต่อรอบด้วย tenantDb (capacity.ts/waitlist.ts)
// แยกความล้มต่อรอบ/ร้าน (failed[] · รหัสสั้น) · เคารพ signal + deadline · สองรอบซ้อน = ผลเดียว (CAS ในบริการ · X5)
export type CapacityJobOpts = TripJobOpts & { deadline?: number };
const capCodeOf = (e: unknown) => (e instanceof CapacityAbort ? e.code : errorCodeOf(e));
const stopped = (opts?: CapacityJobOpts) => opts?.signal?.aborted === true || (typeof opts?.deadline === "number" && Date.now() >= opts.deadline);

/**
 * อ่าน hold ครบกำหนดไม่ล็อก (status ACTIVE ∧ expiresAt ≤ now · เรียง departureId, id · หน้าละ 200 · ดัชนีบางส่วน) → tx ละรอบ (expireDepartureHolds)
 * วนหน้าจนหมด · รอบที่ล้ม/ไม่มีความคืบหน้า (คนอื่นกวาดไปแล้ว) ถูกข้ามในหน้าถัดไป ⇒ จบเสมอ
 */
export async function runExpireHolds(
  now: Date,
  opts?: CapacityJobOpts,
): Promise<{ expired: number; departures: number; offered: number; failed: TripJobFailure[] }> {
  const out = { expired: 0, departures: 0, offered: 0, failed: [] as TripJobFailure[] };
  const skip = new Set<string>();
  while (!stopped(opts)) {
    const due = await prisma.tripHold.findMany({
      where: {
        status: "ACTIVE",
        expiresAt: { lte: now },
        ...(opts?.tenantIds ? { tenantId: { in: opts.tenantIds } } : {}),
        ...(skip.size ? { departureId: { notIn: [...skip] } } : {}),
      },
      select: { id: true, tenantId: true, unitId: true, departureId: true },
      orderBy: [{ departureId: "asc" }, { id: "asc" }],
      take: SWEEP_PAGE_SIZE,
    });
    if (!due.length) break;
    const groups = new Map<string, { tenantId: string; unitId: string; departureId: string; ids: string[] }>();
    for (const h of due) {
      const k = `${h.tenantId}|${h.unitId}|${h.departureId}`;
      const grp = groups.get(k) ?? { tenantId: h.tenantId, unitId: h.unitId, departureId: h.departureId, ids: [] };
      grp.ids.push(h.id);
      groups.set(k, grp);
    }
    for (const grp of groups.values()) {
      if (stopped(opts)) break;
      try {
        const r = await expireDepartureHolds(grp.tenantId, grp.unitId, grp.departureId, grp.ids, now);
        out.expired += r.expired;
        out.offered += r.offered;
        if (r.expired > 0) out.departures++;
        else skip.add(grp.departureId);
      } catch (e) {
        out.failed.push({ tenantId: grp.tenantId, unitId: grp.unitId, departureId: grp.departureId, code: capCodeOf(e) });
        skip.add(grp.departureId);
      }
    }
  }
  await reportFailures("trips.expireHolds", out.failed);
  return out;
}

/** รอบที่มี WAITING ⇒ เสนอที่ (FIFO เคร่ง · ใต้ล็อกรอบ) · ช่องทาง WEB ปิดรับ/เริ่มแล้ว/รอบยกเลิก ⇒ WAITING → EXPIRED (ตัวสำรองของการเสนอทันที) */
export async function runWaitlistOffers(
  now: Date,
  opts?: CapacityJobOpts,
): Promise<{ departures: number; offered: number; expired: number; failed: TripJobFailure[] }> {
  const out = { departures: 0, offered: 0, expired: 0, failed: [] as TripJobFailure[] };
  const deps = await prisma.tripWaitlist.findMany({
    where: { status: "WAITING", ...(opts?.tenantIds ? { tenantId: { in: opts.tenantIds } } : {}) },
    distinct: ["departureId"],
    select: { tenantId: true, unitId: true, departureId: true },
    orderBy: [{ departureId: "asc" }],
  });
  for (const d of deps) {
    if (stopped(opts)) break;
    try {
      const r = await offerWaitlistForDeparture(d.tenantId, d.unitId, d.departureId, now, "trips.waitlistOffers");
      out.departures++;
      out.offered += r.offered.length;
      out.expired += r.expired;
    } catch (e) {
      out.failed.push({ tenantId: d.tenantId, unitId: d.unitId, departureId: d.departureId, code: capCodeOf(e) });
    }
  }
  await reportFailures("trips.waitlistOffers", out.failed);
  return out;
}
// ── /T0.4 capacity ──
