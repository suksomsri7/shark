// notifications-cron.ts — จุดเข้าเดียวที่ cron เรียกเพื่อประมวลผลแถวแจ้งเตือนที่ถึงกำหนด (M3.6)
//
// 🔴 ตัวส่งจริง (LINE ผ่านแชท) มาจาก composition root `@/lib/member-journey-senders` (dynamic import) —
//    ไฟล์นี้คือ "จุดเข้าของ cron" ไม่ใช่เอนจิน จึงเป็นที่เดียวในโมดูลสมาชิกที่แตะ composition root ตรง ๆ
//    เอนจินจริง (`notifications.ts`) ยังคงรับตัวส่งผ่านพารามิเตอร์ `deps` เท่านั้น (ทดสอบแทนที่ได้)
// 🔴 best-effort ต่อระบบ — ร้านเดียวพังต้องไม่ทำให้ร้านอื่นไม่ได้รับแจ้งเตือน (แถวยังค้าง QUEUED รอรอบหน้า)

import { prisma } from "./db";
import { runDue, type RunDueResult } from "./notifications";

/** ประมวลผลแถว QUEUED ที่ถึงกำหนดของทุกระบบสมาชิก (ทุกร้าน) — เรียกจาก cron รายชั่วโมง (`platform/cron.ts`) */
export async function runDueAllSystems(now: Date = new Date()): Promise<RunDueResult> {
  const { notificationSenders } = await import("@/lib/member-journey-senders");
  const systems = await prisma.appSystem.findMany({ where: { type: "MEMBER", active: true }, select: { id: true, tenantId: true } });
  let sent = 0;
  let failed = 0;
  let digested = 0;
  for (const s of systems) {
    try {
      const r = await runDue({ tenantId: s.tenantId, systemId: s.id, actorUserId: null }, { now, deps: notificationSenders });
      sent += r.sent;
      failed += r.failed;
      digested += r.digested;
    } catch {
      // ร้านนี้ล้ม — ข้ามไปร้านถัดไป (แถวยังค้าง QUEUED รอรอบหน้า)
    }
  }
  return { sent, failed, digested };
}
