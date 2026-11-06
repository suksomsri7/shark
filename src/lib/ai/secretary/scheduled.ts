// scheduled.ts (secretary) — งานประจำ "ของคนตั้ง" ของเลขา (ใบ S1.9 R-K5 · ย้ายมาจาก ai/scheduled.ts ในใบ S3a.1-S1 · RESOLUTIONS R-Z5/R-Z6)
//
// ทางรอบรายชั่วโมง (`/api/cron/hourly` → `ai/scheduled.runScheduledTasks`) ทำแค่: ถึงเวลาไหม → claim → Membership สดของผู้ตั้ง →
//   `startRoom` (นับงาน 1 + ข้อความสั่งงาน + AiRoomJob ใน tx เดียว — R-Z3) แล้วคืน `jobId` · **ไม่เรียกโมเดลที่นี่** (R-Z6)
//   โมเดลทำงานใน worker: route hourly รันงานที่ได้ใน `after()` ด้วย deadline · ไม่ทันก็ตัวเก็บตกรายนาทีหยิบต่อ (คิวเดียวกับห้องที่คนเปิด)
// ถึงเวลา (R-Z6) = ชั่วโมงไทยตอนนี้ ≥ hourBkk และวันนี้ยังไม่ได้รัน ⇒ รอบที่ตกไป (cron ล่ม/ช้า) ตามหลังได้ภายในวันเดียวกัน
//   แถวเดิม (ownerUserId = null) ไม่เดินไฟล์นี้ — ทางเดิมใน ai/scheduled.ts ยังเทียบชั่วโมงตรงตัวทุกไบต์ (มติ L2 L-13)
//
// 🔴 ไม่ throw เด็ดขาด · ไฟล์นี้ห้าม import `ai/scheduled.ts` (วงกลม) · เวลาไทยผ่าน `bkkParts`/`dayKeyBangkok` เท่านั้น

import type { AiScheduledTask } from "@prisma/client";
import { prisma } from "@/lib/core/db";
import { logOps } from "@/lib/core/ops";
import { bkkParts } from "@/lib/core/quiet-hours";
import { aiMemberActor } from "../actor";
import { dayKeyBangkok } from "../rules";
import { startRoom } from "./rooms";

/**
 * ถึงเวลารันงานนี้ไหม ณ `now` (pure · เวลาไทย) — active · ชั่วโมงไทย ≥ hourBkk (ตามหลังได้ในวันเดียวกัน · R-Z6) · lastRunDay ≠ วันไทย
 *   DAILY/null = ทุกวัน · WEEKLY = วันในสัปดาห์ไทย (0=อา) ∈ days · MONTHLY = วันที่ไทย ∈ days · ความถี่แปลก = ไม่รัน
 */
export function isDue(
  task: Pick<AiScheduledTask, "active" | "hourBkk" | "frequency" | "days" | "lastRunDay">,
  now: Date,
): boolean {
  if (!task.active) return false;
  const p = bkkParts(now);
  if (!(p.h >= task.hourBkk)) return false;
  if (task.lastRunDay === dayKeyBangkok(now)) return false;
  const days = Array.isArray(task.days) ? task.days : [];
  const f = task.frequency ?? "DAILY";
  if (f === "DAILY") return true;
  if (f === "WEEKLY") return days.includes(new Date(Date.UTC(p.y, p.mo, p.day)).getUTCDay());
  if (f === "MONTHLY") return days.includes(p.day);
  return false;
}

/** จดเหตุที่ข้ามงานของคนตั้ง (ไม่ throw) */
async function logSkip(task: AiScheduledTask, reason: string, detail?: string): Promise<void> {
  await logOps("WARN", "ai", `scheduled-skip: งานประจำ ${task.id} ข้าม (${reason})`, {
    tenantId: task.tenantId,
    detail: JSON.stringify({ taskId: task.id, ownerUserId: task.ownerUserId, reason, ...(detail ? { detail } : {}) }).slice(0, 2000),
  }).catch(() => {});
}

/**
 * งานของคนตั้ง 1 รอบ (S1.9 · R-K5) — คืน `jobId` ของห้องที่เปิด (null = ไม่ได้เปิด) · ไม่ throw เด็ดขาด · ไม่เรียกโมเดล (R-Z6)
 *   (1) isDue (2) claim: conditional updateMany ตั้ง lastRunDay = วันนี้ (count 0 = อีกรอบได้ไป · X5)
 *   (3) Membership สดของผู้ตั้ง (acceptedAt ≠ null) ไม่มี = จด + ข้าม (4) startRoom ด้วยสิทธิ์ผู้ตั้ง (นับงาน 1 + job ใน tx · โควตาหมด = จด + ข้าม)
 */
export async function runOwnedTask(task: AiScheduledTask, now: Date, today: string): Promise<string | null> {
  try {
    const ownerUserId = task.ownerUserId;
    if (!ownerUserId || !isDue(task, now)) return null;
    const got = await prisma.aiScheduledTask.updateMany({
      where: { id: task.id, tenantId: task.tenantId, active: true, OR: [{ lastRunDay: null }, { lastRunDay: { not: today } }] },
      data: { lastRunDay: today },
    });
    if (got.count === 0) return null;
    const membership = await prisma.membership.findFirst({
      where: { tenantId: task.tenantId, userId: ownerUserId, acceptedAt: { not: null } },
      select: { role: true, unitAccess: true, permissions: true },
    });
    if (!membership) {
      await logSkip(task, "owner-not-member");
      return null;
    }
    const actor = aiMemberActor(task.tenantId, ownerUserId, membership);
    const started = await startRoom({ tenantId: task.tenantId, actor }, { instruction: task.instruction, systems: [] }, now);
    if (!started.ok) {
      await logSkip(task, started.error, started.message);
      return null;
    }
    return started.jobId;
  } catch (e) {
    await logOps("WARN", "ai", `scheduled: งานประจำ ${task.id} ล้ม`, {
      tenantId: task.tenantId,
      detail: e instanceof Error ? (e.stack ?? e.message) : String(e),
    }).catch(() => {});
    return null;
  }
}
