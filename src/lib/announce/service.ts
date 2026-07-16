// ประกาศระบบ — ฝั่งร้าน (WO-0031)
// PlatformAnnouncement = global (อ่านด้วย prisma ตรง) · AnnouncementDismiss = tenant (ผ่าน tenantDb)
// ร้านเห็นเฉพาะฉบับที่ประกาศแล้ว และยังไม่กด "รับทราบ" — dismiss แยกต่อร้าน

import type { PlatformAnnouncement } from "@prisma/client";
import { prisma, tenantDb } from "@/lib/core/db";

type Ctx = { tenantId: string };

// ประกาศที่ยัง active สำหรับร้านนี้ (published + ยังไม่รับทราบ) — ใหม่→เก่า
export async function activeAnnouncements(ctx: Ctx): Promise<PlatformAnnouncement[]> {
  const dismissed = await tenantDb(ctx).announcementDismiss.findMany({
    select: { announcementId: true },
  });
  const skip = dismissed.map((d) => d.announcementId);
  return prisma.platformAnnouncement.findMany({
    where: { publishedAt: { not: null }, id: { notIn: skip } },
    orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
  });
}

// ร้านกด "รับทราบ" — idempotent: กดซ้ำคืน true ไม่พัง (createMany skipDuplicates)
export async function dismissAnnouncement(ctx: Ctx, announcementId: string): Promise<boolean> {
  await tenantDb(ctx).announcementDismiss.createMany({
    data: [{ announcementId }],
    skipDuplicates: true,
  });
  return true;
}
