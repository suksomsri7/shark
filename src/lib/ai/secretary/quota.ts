// quota.ts — สถานะโควตางานของเลขา (ใบ S1.13 · สัญญา docs/modules/31-secretary.md §8 · RESOLUTIONS R-K6 R-K7 §B.6)
//
// 🔴 อ่านอย่างเดียว: ห้ามเขียนอะไรเลย (ไม่สร้างแถวตัวนับ · ไม่เปิดกระเป๋า · ไม่แจก GRANT) — ใช้ใน GET ได้ (§B.6)
// 🔴 ตัวเลขที่ผู้ใช้เห็น = งาน · % · วันรีเซ็ต (COMMON §C.6) — `balanceMicro` มีไว้ให้ชั้น API ตัดสิน "blocked" เท่านั้น ห้ามส่งถึงจอเลขา
// ตัวนับงานจริงอยู่ที่ `rooms.startRoom` (R-K6) · ด่านเงินอยู่ที่ `credit.canRunAi` (R-K7)
import { prisma } from "@/lib/core/db";
import { assistUsedMicroOfDay, balancePeek, LOW_BALANCE_MICRO } from "../credit";
import { FREE_PACK, monthKeyBangkok, nextResetBangkok, quotaMessage, type QuotaLevel } from "./pack";

export type QuotaStatus = {
  month: string;
  jobsUsed: number;
  jobsLimit: number;
  jobsLeft: number;
  pct: number;
  level: QuotaLevel;
  text: string | null;
  resetAt: Date;
  balanceMicro: number | null;
  blocked: "jobs" | null;
  /** R-S1.13b ▸ ต้นทุน assist ของวันไทยนี้ เทียบเพดานแพ็กฟรี (ไมโครดอลลาร์ — ใช้ในชั้น API ไม่ส่งถึงจอเลขาเป็นตัวเงิน) ◂ */
  assist: { usedMicro: number; capMicro: number };
};

async function jobsUsedOf(tenantId: string, month: string): Promise<number> {
  const row = await prisma.aiJobCounter.findUnique({ where: { tenantId_month: { tenantId, month } }, select: { jobs: true } });
  return Math.max(0, row?.jobs ?? 0);
}

/**
 * สถานะโควตาเดือนไทยที่ครอบ `now` — 3 query อ่าน (ตัวนับ · กระเป๋า · ต้นทุน assist ของวัน)
 *   blocked = "jobs" เมื่อโควตาหมด **และ** กระเป๋า < LOW_BALANCE_MICRO (ถึงเกณฑ์ ⇒ ใช้กระเป๋าต่อ · Q4 · R-S1.13h) · ตัวนับเกิน limit ได้ (งานที่จ่ายจากกระเป๋า) ⇒ jobsLeft 0
 */
export async function quotaStatus(tenantId: string, now: Date = new Date()): Promise<QuotaStatus> {
  const month = monthKeyBangkok(now);
  const limit = FREE_PACK.jobsPerMonth;
  const resetAt = nextResetBangkok(now);
  const [used, balanceMicro, day] = await Promise.all([jobsUsedOf(tenantId, month), balancePeek(tenantId), assistUsedMicroOfDay(tenantId, now)]);
  const m = quotaMessage(used, limit, resetAt, now);
  return {
    month,
    jobsUsed: used,
    jobsLimit: limit,
    jobsLeft: m.jobsLeft,
    pct: m.pct,
    level: m.level,
    text: m.text,
    resetAt,
    balanceMicro,
    blocked: m.jobsLeft === 0 && !((balanceMicro ?? 0) >= LOW_BALANCE_MICRO) ? "jobs" : null, // R-S1.13h: เกณฑ์เดียวกับ startRoom/canRunAi
    assist: { usedMicro: day.usedMicro, capMicro: day.capMicro },
  };
}

/** งานที่เหลือของเดือนนี้ (ไม่รวมเงินในกระเป๋า) — อ่านอย่างเดียว */
export async function jobsLeft(tenantId: string, now: Date = new Date()): Promise<number> {
  const used = await jobsUsedOf(tenantId, monthKeyBangkok(now));
  return Math.max(0, FREE_PACK.jobsPerMonth - used);
}
