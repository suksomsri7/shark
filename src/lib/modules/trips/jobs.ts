// ─────────────────────────────────────────────────────────────
// trips/jobs.ts — ทางเข้าข้ามร้านไฟล์เดียวของโมดูล trips (CC §A.4) · RUN TRIPS T0.3 (T0.4 ต่อท้าย)
// ใบสั่ง ledger/trips-briefs/T0.3.md §3.5 §5
//
// 🔴 ไฟล์เดียวในโมดูล trips ที่ import `prisma` ดิบได้ (fitness F5 50→51 = ORACLE-EDIT ผู้คุม) · เหตุ: งานตามเวลาต้องไล่กฎ/รอบ "ก่อนรู้ร้าน"
//    อ่านอย่างเดียวที่นี่ (หา tenantId/unitId) แล้วเรียกบริการต่อร้านด้วย tenantDb (departures.ts) — ไม่มีการเขียนผ่าน prisma ดิบ
// 🔴 idempotent: materialize = advisory lock ต่อกฎ + unique (scheduleId, localDate) · minPax = ล็อกแถวรอบ + CAS + คีย์ outbox ⇒ สองรอบซ้อน = ผลเดียว
// 🔴 เคารพ signal: หยุดก่อนเริ่มกฎ/หน่วยถัดไป
// ─────────────────────────────────────────────────────────────
import { prisma } from "@/lib/core/db";
import { evaluateMinPaxCore, materializeCore } from "./departures";
import { addDaysYmd } from "./departures-core";
import { isFail, systemGate } from "./resources";

export type TripJobOpts = { tenantIds?: string[]; signal?: AbortSignal };

/** ทุกกฎที่ไม่พัก ⇒ materialize (ตรรกะเดียวกับ action) — `tenantIds` จำกัดร้าน (QC/รันมือ) */
export async function runGenerateDepartures(now: Date, opts?: TripJobOpts): Promise<{ schedules: number; created: number }> {
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
  let done = 0;
  let created = 0;
  for (const s of schedules) {
    if (opts?.signal?.aborted) break;
    const g = await systemGate(s.tenantId, s.unitId);
    if (!g) continue;
    const r = await materializeCore(g, s.id, now);
    done++;
    if (!isFail(r)) created += r.created.length;
  }
  return { schedules: done, created };
}

/** รอบ OPEN ที่มีขั้นต่ำ ⇒ ประเมิน ณ เวลาตัดสิน (ตรรกะเดียวกับ evaluateMinPax) ต่อหน่วย */
export async function runMinPaxCheck(now: Date, opts?: TripJobOpts): Promise<{ checked: number; guaranteed: number; belowMin: number }> {
  const units = await prisma.tripDeparture.groupBy({
    by: ["tenantId", "unitId"],
    where: { status: "OPEN", minPax: { not: null }, startsAt: { gt: now }, ...(opts?.tenantIds ? { tenantId: { in: opts.tenantIds } } : {}) },
    orderBy: [{ tenantId: "asc" }, { unitId: "asc" }],
  });
  const out = { checked: 0, guaranteed: 0, belowMin: 0 };
  for (const u of units) {
    if (opts?.signal?.aborted) break;
    const g = await systemGate(u.tenantId, u.unitId);
    if (!g) continue;
    const r = await evaluateMinPaxCore(g, now, opts?.signal);
    out.checked += r.checked;
    out.guaranteed += r.guaranteed.length;
    out.belowMin += r.belowMin.length;
  }
  return out;
}
