// period-sweep.ts — ปิดงวดบัญชีอัตโนมัติ (WO-0039)
// วนทุก AppSystem type ACCOUNT ทั้งแพลตฟอร์ม (cap 100) → ปิด "งวดเดือนก่อนหน้า" (เวลาไทย)
// ผ่าน closePeriod เดิม (Gate C: suspense 9999 เคลียร์ + ไม่มี needsReview) — เรียกใช้อย่างเดียว ไม่แก้
// สำเร็จ → AppNotification "ปิดงวดบัญชีอัตโนมัติ" + นับ
// Gate C ไม่ผ่าน → ข้าม (ไม่ throw) + AppNotification "ปิดงวดอัตโนมัติไม่สำเร็จ" ครั้งเดียวต่องวด (กันสแปม)
// CLOSED แล้ว → ข้ามเงียบ · userId ที่ใช้ปิด = "system-auto"

import { prisma } from "@/lib/core/db";
import { closePeriod } from "./gl";

const AUTO_USER = "system-auto";
const OK_TITLE = "ปิดงวดบัญชีอัตโนมัติ";
const FAIL_TITLE = "ปิดงวดอัตโนมัติไม่สำเร็จ";

/** ปี-เดือน (เวลาไทย) ของวันที่ */
function bkkYearMonth(date: Date): { y: number; m: number } {
  const s = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
  return { y: Number(s.slice(0, 4)), m: Number(s.slice(5, 7)) };
}

/** periodKey ของ "เดือนก่อนหน้า" ตามเวลาไทย ("YYYY-MM") */
function prevPeriodKey(date: Date): string {
  let { y, m } = bkkYearMonth(date);
  m -= 1;
  if (m === 0) {
    m = 12;
    y -= 1;
  }
  return `${y}-${String(m).padStart(2, "0")}`;
}

/**
 * ปิดงวดเดือนก่อนหน้าอัตโนมัติ ทุกระบบบัญชีทั้งแพลตฟอร์ม
 * @returns จำนวนงวดที่ปิดสำเร็จรอบนี้
 */
export async function sweepAutoClosePeriods(now: Date = new Date()): Promise<number> {
  const periodKey = prevPeriodKey(now);

  const systems = await prisma.appSystem.findMany({
    where: { type: "ACCOUNT" },
    select: { id: true, tenantId: true },
    take: 100,
  });

  let closed = 0;
  for (const sys of systems) {
    const ctx = { tenantId: sys.tenantId, systemId: sys.id };

    // CLOSED แล้ว → ข้ามเงียบ
    const existing = await prisma.accountPeriod.findFirst({
      where: { systemId: sys.id, periodKey },
      select: { status: true },
    });
    if (existing?.status === "CLOSED") continue;

    const res = await closePeriod(ctx, periodKey, AUTO_USER);

    if (res.ok) {
      await prisma.appNotification.create({
        data: {
          tenantId: sys.tenantId,
          title: OK_TITLE,
          body: `ปิดงวด ${periodKey} เรียบร้อยแล้ว (อัตโนมัติ)`,
        },
      });
      closed += 1;
    } else {
      // กันสแปม: มี noti เตือนของงวดนี้ (ระบบนี้) แล้ว → ไม่ส่งซ้ำ
      const already = await prisma.appNotification.count({
        where: {
          tenantId: sys.tenantId,
          title: FAIL_TITLE,
          body: { contains: `[${sys.id}] ${periodKey}` },
        },
      });
      if (already === 0) {
        await prisma.appNotification.create({
          data: {
            tenantId: sys.tenantId,
            title: FAIL_TITLE,
            body: `[${sys.id}] ${periodKey} — ${res.reason ?? "ไม่ผ่านเงื่อนไขปิดงวด"}`,
          },
        });
      }
    }
  }

  return closed;
}
