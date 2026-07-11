"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { UnitType } from "@prisma/client";
import { prisma } from "@/lib/core/db";
import { requireTenant } from "@/lib/core/context";
import { slugify } from "@/lib/slug";
import { AVAILABLE_UNIT_TYPES } from "@/lib/systems";
import { ensureUnitSystems } from "@/lib/modules/system/service";

const schema = z.object({
  unitType: z
    .nativeEnum(UnitType)
    .refine((t) => AVAILABLE_UNIT_TYPES.has(t), "ประเภทกิจการนี้ยังไม่เปิดให้บริการ"),
  unitName: z.string().trim().min(2, "ชื่อกิจการสั้นเกินไป").max(80),
});

export type AddUnitState = { status: "idle" } | { status: "error"; message: string };

// เพิ่มกิจการ (BusinessUnit) ให้ tenant ปัจจุบัน
export async function addUnitAction(
  _prev: AddUnitState,
  formData: FormData,
): Promise<AddUnitState> {
  const auth = await requireTenant();
  const parsed = schema.safeParse({
    unitType: formData.get("unitType"),
    unitName: formData.get("unitName"),
  });
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง" };
  }

  // จำกัดจำนวนกิจการ
  const count = await prisma.businessUnit.count({
    where: { tenantId: auth.active.tenantId, status: { not: "ARCHIVED" } },
  });
  const limits = auth.active.tenant.limits as { maxUnits?: number };
  const max = limits?.maxUnits ?? 5;
  if (count >= max) {
    return { status: "error", message: `เพิ่มกิจการได้สูงสุด ${max} กิจการ` };
  }

  // slug ไม่ซ้ำใน tenant
  const base = slugify(parsed.data.unitName, "unit");
  let slug = base;
  for (let i = 0; i < 6; i++) {
    const exists = await prisma.businessUnit.findUnique({
      where: { tenantId_slug: { tenantId: auth.active.tenantId, slug } },
    });
    if (!exists) break;
    slug = `${base}-${Math.random().toString(36).slice(2, 5)}`;
  }

  const unit = await prisma.businessUnit.create({
    data: {
      tenantId: auth.active.tenantId,
      type: parsed.data.unitType,
      name: parsed.data.unitName,
      slug,
      sortOrder: count,
    },
  });
  await ensureUnitSystems(auth.active.tenantId, unit.id, unit.name);
  redirect(`/app/u/${unit.slug}`);
}
