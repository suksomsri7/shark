// cron.ts — เคอร์เนล cron ระดับแพลตฟอร์ม (WO-0029)
// กวาดของหมดอายุข้ามทุกร้าน + เก็บตก outbox event ที่ยังค้าง
// อยู่ระดับ platform → prisma ตรง updateMany (ไม่ผูก tenant เดียว — กวาดทั้งระบบ)
// เรียกจาก route /api/cron/tick วันละครั้ง (03:00 BKK)

import { prisma } from "@/lib/core/db";
import { drainAll } from "@/lib/outbox-consumers";
import { sweepPendingDeletes } from "@/lib/platform/pdpa";
import { sweepWeeklyAnalysis } from "@/lib/ai/analyst";

// MemberSubscription ACTIVE ที่ครบกำหนด (endAt < now) → EXPIRED ทุกร้าน
// where จำกัด status=ACTIVE → รันซ้ำได้ (ตัวที่ EXPIRED ไปแล้วไม่ถูกแตะ = idempotent)
export async function sweepExpiredSubscriptions(now: Date = new Date()): Promise<number> {
  const res = await prisma.memberSubscription.updateMany({
    where: { status: "ACTIVE", endAt: { lt: now } },
    data: { status: "EXPIRED" },
  });
  return res.count;
}

// AiProposal PENDING ที่เลย TTL (expiresAt < now) → EXPIRED ทุกร้าน
// where จำกัด status=PENDING → idempotent เช่นกัน
export async function sweepExpiredProposals(now: Date = new Date()): Promise<number> {
  const res = await prisma.aiProposal.updateMany({
    where: { status: "PENDING", expiresAt: { lt: now } },
    data: { status: "EXPIRED" },
  });
  return res.count;
}

// งานประจำวัน: กวาด subs + proposals + เก็บตก outbox
// ห้าม throw — แต่ละส่วนห่อ try/catch เอง · ส่วนไหนพังเก็บเป็น -1 แล้วไปต่อ
// (cron ต้องไม่ล้มทั้งรอบเพราะงานย่อยอันเดียวพัง)
export async function runDailyCron(
  now: Date = new Date(),
): Promise<{
  subsExpired: number;
  proposalsExpired: number;
  outboxDrained: number;
  tenantsPurged: number;
  weeklyReports: number;
}> {
  let subsExpired = -1;
  let proposalsExpired = -1;
  let outboxDrained = -1;
  let tenantsPurged = -1;
  let weeklyReports = -1;

  try {
    subsExpired = await sweepExpiredSubscriptions(now);
  } catch {
    // กวาด subs พัง → -1 ไปต่อ
  }
  try {
    proposalsExpired = await sweepExpiredProposals(now);
  } catch {
    // กวาด proposals พัง → -1 ไปต่อ
  }
  try {
    const r = await drainAll();
    outboxDrained = r.processed;
  } catch {
    // drain outbox พัง → -1 ไปต่อ
  }
  try {
    // PDPA (WO-0042): ลบร้านที่ขอลบครบ 30 วันแล้ว
    tenantsPurged = await sweepPendingDeletes(now);
  } catch {
    // purge พัง → -1 ไปต่อ
  }
  try {
    // รายงานธุรกิจประจำสัปดาห์ (WO-0046): รันเฉพาะวันจันทร์เวลาไทย (ไม่ใช่จันทร์ → 0)
    weeklyReports = await sweepWeeklyAnalysis(now);
  } catch {
    // สร้างรายงานสัปดาห์พัง → -1 ไปต่อ
  }

  return { subsExpired, proposalsExpired, outboxDrained, tenantsPurged, weeklyReports };
}
