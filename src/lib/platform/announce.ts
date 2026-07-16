// ประกาศระบบ — ฝั่งแพลตฟอร์ม (WO-0031)
// PlatformAnnouncement = global scope (อ่านได้ทุกที่ · เขียนได้เฉพาะ backoffice) → ใช้ prisma ตรง
// ทุกการกระทำสำคัญบันทึก PlatformAuditLog (append-only) เสมอ — targetType "PlatformAnnouncement"
// สร้าง/ประกาศ/เอาลง = ทุก role platform ทำได้ (ไม่มี requirePlatformRole gate)

import type { PlatformAnnouncement, PlatformUser } from "@prisma/client";
import { prisma } from "@/lib/core/db";

// สร้างฉบับร่าง (publishedAt = null) + audit "announce.create" ในทรานแซกชันเดียว
export async function createAnnouncement(
  pu: PlatformUser,
  input: { title: string; body: string },
): Promise<{ id: string }> {
  return prisma.$transaction(async (tx) => {
    const a = await tx.platformAnnouncement.create({
      data: { title: input.title, body: input.body, createdByPlatformUserId: pu.id },
    });
    await tx.platformAuditLog.create({
      data: {
        platformUserId: pu.id,
        action: "announce.create",
        targetType: "PlatformAnnouncement",
        targetId: a.id,
      },
    });
    return { id: a.id };
  });
}

// ประกาศ → ตั้ง publishedAt = now + audit "announce.publish"
// ประกาศแล้ว (publishedAt != null) → false เงียบ ๆ · ไม่พบ → false
export async function publishAnnouncement(pu: PlatformUser, id: string): Promise<boolean> {
  const a = await prisma.platformAnnouncement.findUnique({ where: { id } });
  if (!a || a.publishedAt) return false;
  await prisma.$transaction([
    prisma.platformAnnouncement.update({ where: { id }, data: { publishedAt: new Date() } }),
    prisma.platformAuditLog.create({
      data: {
        platformUserId: pu.id,
        action: "announce.publish",
        targetType: "PlatformAnnouncement",
        targetId: id,
      },
    }),
  ]);
  return true;
}

// เอาลง → publishedAt = null + audit "announce.unpublish" · ไม่พบ → false
export async function unpublishAnnouncement(pu: PlatformUser, id: string): Promise<boolean> {
  const a = await prisma.platformAnnouncement.findUnique({ where: { id } });
  if (!a) return false;
  await prisma.$transaction([
    prisma.platformAnnouncement.update({ where: { id }, data: { publishedAt: null } }),
    prisma.platformAuditLog.create({
      data: {
        platformUserId: pu.id,
        action: "announce.unpublish",
        targetType: "PlatformAnnouncement",
        targetId: id,
      },
    }),
  ]);
  return true;
}

// ทุกฉบับ (ร่าง + ประกาศแล้ว) — ใหม่→เก่า สำหรับหน้า backoffice
export async function listAnnouncements(): Promise<PlatformAnnouncement[]> {
  return prisma.platformAnnouncement.findMany({ orderBy: { createdAt: "desc" } });
}
