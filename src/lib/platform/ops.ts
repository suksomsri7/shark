// platform/ops.ts — อ่าน OpsEvent สำหรับ backoffice (WO-0041)
// OpsEvent เป็น platform axis → prisma ตรง (ข้ามร้านโดยเจตนา — ให้ backoffice เห็นทั้งระบบ)

import { prisma } from "@/lib/core/db";
import type { OpsLevel } from "@prisma/client";

export type OpsEventRow = {
  id: string;
  level: OpsLevel;
  source: string;
  message: string;
  detail: string | null;
  tenantId: string | null;
  createdAt: Date;
};

// รายการ OpsEvent ล่าสุด (ใหม่→เก่า) — filter level ได้ · default 100 แถว
export async function listOpsEvents(
  filter?: { level?: OpsLevel; take?: number },
): Promise<OpsEventRow[]> {
  return prisma.opsEvent.findMany({
    where: filter?.level ? { level: filter.level } : undefined,
    orderBy: { createdAt: "desc" },
    take: filter?.take ?? 100,
    select: {
      id: true,
      level: true,
      source: true,
      message: true,
      detail: true,
      tenantId: true,
      createdAt: true,
    },
  });
}
