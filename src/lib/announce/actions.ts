"use server";

// ประกาศระบบ — server action ฝั่งร้าน (WO-0031)
// tenantId ดึงจาก session เท่านั้น (requireTenant) — ห้ามรับจาก client
// เรียกจาก banner บน /app เมื่อกด "รับทราบ"

import { revalidatePath } from "next/cache";
import { requireTenant } from "@/lib/core/context";
import { dismissAnnouncement } from "./service";

export async function dismissAnnouncementAction(announcementId: string): Promise<void> {
  const auth = await requireTenant();
  await dismissAnnouncement({ tenantId: auth.active.tenantId }, announcementId);
  revalidatePath("/app");
}
